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
        data = {"instance": "a" * 32, "containers": {"mongo": "owned"}, "ports": {"mongo": 32001}}
        detail = {"Id": "owned", "Config": {"Labels": {agent.LABEL: data["instance"], "yuanhub.agent.role": "mongo"}},
                  "State": {"Running": True}, "HostConfig": {"NetworkMode": "bridge"}, "Mounts": [{"Type": "tmpfs"}],
                  "NetworkSettings": {"Ports": {"27017/tcp": [{"HostIp": "127.0.0.1", "HostPort": "32001"}]}}}
        return data, detail

    def test_only_owned_volume_free_loopback_container_is_accepted(self):
        data, detail = self.fixture()
        with patch.object(agent, "run", return_value=json.dumps([detail])):
            self.assertEqual(agent.inspect_owned(data, "mongo"), "owned")
        mutations = [
            lambda d: d["Config"]["Labels"].update({agent.LABEL: "other"}),
            lambda d: d["Mounts"].append({"Type": "volume"}),
            lambda d: d["NetworkSettings"]["Ports"]["27017/tcp"][0].update(HostIp="0.0.0.0"),
            lambda d: d["NetworkSettings"]["Ports"]["27017/tcp"][0].update(HostPort="27017"),
            lambda d: d["HostConfig"].update(NetworkMode="host"),
            lambda d: d["State"].update(Running=False),
        ]
        for mutate in mutations:
            data, detail = self.fixture()
            mutate(detail)
            with patch.object(agent, "run", return_value=json.dumps([detail])):
                with self.assertRaises(agent.Refused):
                    agent.inspect_owned(data, "mongo")

    def test_tunnel_refuses_before_docker_or_seed_writes(self):
        with patch.object(agent, "run", return_value="/opt/homebrew/bin/cloudflared\n") as run:
            with self.assertRaises(agent.Refused):
                agent.setup(Path("unused"), "default")
            self.assertEqual(run.call_count, 1)

    def test_setup_repeat_does_not_create_containers_or_replace_credentials(self):
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
            data = {"instance": "a" * 32, "ports": {"mongo": 32001, "redis": 32002}}
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

    def test_cleanup_checks_every_container_before_any_removal(self):
        data = {"containers": {"mongo": "ours", "redis": "foreign"}}
        with patch.object(agent, "no_tunnel"), patch.object(agent, "listening", return_value=False), \
                patch.object(agent, "inspect_owned", side_effect=["ours", agent.Refused("foreign")]), patch.object(agent, "run") as run:
            with self.assertRaises(agent.Refused):
                agent.cleanup(data, Path("unused"))
            run.assert_not_called()

    def test_credentials_and_state_are_git_ignored(self):
        for file in ["manifest.json", "ready.json", "browser-user-default/state.json", "browser-admin-default/profile/token"]:
            result = agent.run(["git", "-C", str(agent.ROOT), "check-ignore", f".agent-test/default/{file}"])
            self.assertTrue(result)


if __name__ == "__main__":
    unittest.main()
