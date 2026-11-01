"""Execute the actual root workflow's request validation without GitHub or SSH."""
import os
from pathlib import Path
import subprocess
import textwrap
import unittest

ROOT=Path(__file__).resolve().parents[2]


class MonorepoWorkflowTest(unittest.TestCase):
    def test_component_prepare_tags_are_validated_before_checkout(self):
        for component in ['frontend','backend']:
            text=(ROOT/'.github/workflows'/f'{component}-release.yml').read_text()
            block=text.split('      - name: Validate release request\n',1)[1].split('      - name: Checkout',1)[0]
            script=textwrap.dedent(block.split('        run: |\n',1)[1])
            env=dict(os.environ,DEPLOY_PHASE='prepare',GITHUB_REF='refs/heads/main',REQUESTED_COMMIT='a'*40,PREPARE_REQUEST='offline-check')
            for tag,expected in [(f'{component}/v0.1.2',0),('v0.1.2',1),('wrong/v0.1.2',1),(f'{component}/v0.1.2;echo bad',1)]:
                result=subprocess.run(['bash','-c',script],env=dict(env,RELEASE_TAG=tag),capture_output=True,text=True)
                self.assertEqual(expected,result.returncode,(component,tag,result.stdout,result.stderr))

    def test_each_release_is_explicitly_disabled_until_repository_opt_in(self):
        for component in ['frontend','backend']:
            text=(ROOT/'.github/workflows'/f'{component}-release.yml').read_text()
            self.assertIn("vars.YUANHUB_MONOREPO_DEPLOY_ENABLED == 'true'",text)
            self.assertIn('environment: '+component+'-production',text)
            self.assertIn('--workflow '+component+'-ci.yml',text)
            self.assertNotIn('--workflow ci.yml',text)


if __name__=='__main__':
    unittest.main()
