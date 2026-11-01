import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('release',Path(__file__).resolve().parents[1]/'release.py')
release=importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleasePlanTest(unittest.TestCase):
    def test_dry_run_never_invokes_remote_or_mutation(self):
        with patch('sys.argv',['release.py','--dry-run','--backend','0.1.40']), \
                patch.object(release,'command',return_value='a'*40) as read, \
                patch.object(release.subprocess,'run') as mutate:
            release.main()
        read.assert_called_once_with('git','rev-parse','HEAD')
        mutate.assert_not_called()

    def test_publish_refuses_feature_branch_before_network_or_tagging(self):
        with patch('sys.argv',['release.py','--backend','0.1.40','--yes']), \
                patch.object(release,'command',side_effect=['a'*40,'feature/work']), \
                patch.object(release.subprocess,'run') as mutate:
            with self.assertRaisesRegex(ValueError,'main branch'):
                release.main()
        mutate.assert_not_called()

    def test_versions_tags_and_artifacts_are_independent(self):
        rows=release.plan('auto','0.1.40','a'*40)
        self.assertEqual(['backend','frontend'],[r['component'] for r in rows])
        self.assertEqual('backend/v0.1.40',rows[0]['tag'])
        self.assertTrue(rows[1]['tag'].startswith('frontend/v'))
        self.assertEqual('frontend/dist',rows[1]['artifact'])
        self.assertEqual(rows[0]['commit'],rows[1]['commit'])
        with self.assertRaises(ValueError):
            release.plan(None,'../../invalid','a'*40)
        with self.assertRaises(ValueError):
            release.plan(None,'auto','a'*40)
        with self.assertRaises(ValueError):
            release.plan(None,None,'a'*40)


if __name__=='__main__':
    unittest.main()
