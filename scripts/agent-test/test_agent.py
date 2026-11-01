import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("agent", Path(__file__).with_name("agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class AgentSafetyTest(unittest.TestCase):
    def fixture(self):
        data = {"instance": "a" * 32, "ports": {"mongo": 27017, "redis": 6379}}
        data["properties"] = agent.properties(data, agent.ROOT / ".agent-test/fixture")
        return data

    def test_only_owned_local_namespaces_are_accepted(self):
        data = self.fixture()
        self.assertEqual("a" * 32, agent.check_manifest(data))
        mutations = [
            lambda d: d.update(instance="../foreign"),
            lambda d: d["ports"].update(mongo=32001),
            lambda d: d.update(containers={"mongo": "legacy"}),
            lambda d: d["properties"].update({"spring.data.mongodb.uri": "mongodb://127.0.0.1:27017/MaaBackend"}),
            lambda d: d["properties"].update({"spring.data.redis.url": "redis://remote/15"}),
        ]
        for mutate in mutations:
            data = self.fixture()
            mutate(data)
            with self.assertRaises(agent.Refused):
                agent.check_manifest(data)

    def test_tunnel_refuses_before_service_or_seed_writes(self):
        with patch.object(agent, "run", return_value="/opt/homebrew/bin/cloudflared\n") as run:
            with self.assertRaises(agent.Refused):
                agent.setup(Path("unused"), "default")
            self.assertEqual(run.call_count, 1)

    def test_setup_repeat_does_not_write_data_or_replace_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            agent.save(path, {"instance": "existing"})
            before = path.read_bytes()
            with patch.object(agent, "no_tunnel"), patch.object(agent, "verify") as verify, patch.object(agent, "run") as run:
                agent.setup(path, "default")
                verify.assert_called_once()
                run.assert_not_called()
            self.assertEqual(path.read_bytes(), before)

    def test_manifest_permissions_and_random_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            data = {"instance": "a" * 32, "ports": {"mongo": 27017, "redis": 6379}}
            first = agent.properties(data, path.parent)
            second = agent.properties(data, path.parent)
            self.assertNotEqual(first["share.jwt.secret"], second["share.jwt.secret"])
            self.assertNotIn("MaaBackend", first["spring.data.mongodb.uri"])
            self.assertNotIn("HubBackend", first["share.mongo.hub-uri"])
            agent.save(path, first)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            path.chmod(0o644)
            with self.assertRaises(agent.Refused):
                agent.load(path)

    def test_occupied_service_is_not_restarted(self):
        with patch.object(agent, "verify"), patch.object(agent, "listening", return_value=True), \
                patch.object(agent, "target", side_effect=agent.Refused("wrong instance")), patch.object(agent.os, "execve") as launch:
            with self.assertRaises(agent.Refused):
                agent.start({}, Path("unused"))
            launch.assert_not_called()

    def test_cleanup_checks_all_ownership_before_any_deletion(self):
        with patch.object(agent, "no_tunnel"), patch.object(agent, "listening", return_value=False), \
                patch.object(agent, "mongo", side_effect=["owned", "absent"]) as mongo, \
                patch.object(agent, "redis") as redis:
            with self.assertRaises(agent.Refused):
                agent.cleanup(self.fixture(), Path("unused"))
            self.assertEqual(2, mongo.call_count)
            redis.assert_not_called()

    def test_cleanup_only_deletes_own_databases_and_prefixed_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"owned"
            path.mkdir()
            data = self.fixture()
            prefix = "yuanhub_agent:" + data["instance"] + ":"
            with patch.object(agent, "no_tunnel"), patch.object(agent, "listening", return_value=False), \
                    patch.object(agent, "mongo", side_effect=["owned", "owned", "", ""]) as mongo, \
                    patch.object(agent, "redis", side_effect=[data["instance"], prefix+"one\n"+prefix+"two\n"+prefix+"agent-test:ownership", "1", "1", "1"]) as redis:
                agent.cleanup(data, path/"manifest.json")
                self.assertEqual(4, mongo.call_count)
                for call in mongo.call_args_list:
                    self.assertIn("agent_test_ownership", call.args[0])
                    self.assertIn("yuanhub_agent_" + data["instance"], call.args[0])
                self.assertEqual([("DEL", prefix+"one"), ("DEL", prefix+"two"), ("DEL", prefix+"agent-test:ownership")],
                                 [call.args for call in redis.call_args_list[2:]])
            self.assertFalse(path.exists())

    def test_cleanup_retries_after_first_drop_and_redis_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "owned" / "manifest.json"
            agent.private_dir(path.parent)
            data = self.fixture()
            agent.save(path, data)
            instance = data["instance"]
            with patch.object(agent, "no_tunnel"), patch.object(agent, "listening", return_value=False), \
                    patch.object(agent, "mongo", side_effect=["owned", "owned", "", agent.Refused("hub down"), "owned", ""]), \
                    patch.object(agent, "redis", side_effect=[instance, instance, agent.Refused("redis down"), instance, "", "1"]):
                with self.assertRaises(agent.Refused):
                    agent.cleanup(data, path)
                self.assertEqual("deleted", agent.load(path)["resources"]["maa"])
                with self.assertRaises(agent.Refused):
                    agent.cleanup(agent.load(path), path)
                self.assertEqual("deleted", agent.load(path)["resources"]["hub"])
                agent.cleanup(agent.load(path), path)
            self.assertFalse(path.parent.exists())

    def test_cleanup_after_setup_fails_before_markers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "owned" / "manifest.json"
            agent.private_dir(path.parent)
            data = self.fixture()
            data["resources"] = {name: "creating" for name in ("maa", "hub", "redis")}
            agent.save(path, data)
            with patch.object(agent, "no_tunnel"), patch.object(agent, "listening", return_value=False), \
                    patch.object(agent, "mongo", side_effect=["absent", "absent", "", ""]) as mongo, \
                    patch.object(agent, "redis", return_value="") as redis:
                agent.cleanup(data, path)
                self.assertTrue(all("dropDatabase" not in call.args[0] or "if (d.agent_test_ownership.findOne" in call.args[0]
                                    for call in mongo.call_args_list))
                self.assertEqual(1, redis.call_count)
            self.assertFalse(path.parent.exists())

    def test_launch_requires_exact_protected_config_in_current_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root / ".agent-test" / "fixture"
            agent.private_dir(folder)
            data = self.fixture()
            data["properties"] = agent.properties(data, folder)
            agent.save(folder / "manifest.json", data)
            with patch.object(agent, "ROOT", root), patch.object(agent, "verify") as verify:
                agent.validate_launch(data["properties"])
                verify.assert_called_once_with(data)
                verify.reset_mock()
                unsafe = dict(data["properties"], **{"share.agent-test.enabled": "false"})
                with self.assertRaises(agent.Refused):
                    agent.validate_launch(unsafe)
                unsafe["share.agent-test.manifest"] = str(root / "outside.json")
                with self.assertRaises(agent.Refused):
                    agent.validate_launch(unsafe)
                verify.assert_not_called()

    def test_credentials_and_state_are_git_ignored(self):
        for file in ["manifest.json", "ready.json", "browser-user-default/state.json", "browser-admin-default/profile/token"]:
            result = agent.run(["git", "-C", str(agent.ROOT), "check-ignore", f".agent-test/default/{file}"])
            self.assertTrue(result)


if __name__ == "__main__":
    unittest.main()
