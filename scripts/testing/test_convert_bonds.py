import importlib.util
import unittest
import json
import subprocess
import sys
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('convert_bonds', Path(__file__).parents[1] / 'convert_bonds.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ConvertBondsTest(unittest.TestCase):
    operators = [dict(id='char_test_a', name='甲_乙', games=list(module.GAMES)),
                 dict(id='char_test_b', name='丙', games=['代号鸢'])]

    def test_stable_identity_and_pending(self):
        first = module.convert(['甲_乙,丙|纵火||+'], self.operators)
        entries = [e for c in first['catalogs'] for e in c['entries']] + [p['entry'] for p in first['pending']]
        second = module.convert(['丙,甲_乙|纵火||-'], self.operators, entries)
        again = [e for c in second['catalogs'] for e in c['entries']] + [p['entry'] for p in second['pending']]
        self.assertEqual([e['bond_id'] for e in entries], [e['bond_id'] for e in again])
        self.assertEqual(8, len(first['pending']))
        self.assertTrue(all(e['effect'] == 'negative' for e in again))
        retired = module.convert([], self.operators, entries)
        self.assertTrue(all(e['status'] == 'retired' for c in retired['catalogs'] for e in c['entries']))

    def test_identity_and_validation(self):
        rows = ['甲_乙,丙|纵火|晴天|+', '丙,甲_乙|纵火|晴天|+', '甲_乙,丙|纵火|雨天|+', '甲_乙,丙|下毒|晴天|-']
        self.assertEqual(3, module.convert(rows, self.operators)['statistics']['代号鸢']['ready'])
        with self.assertRaises(ValueError):
            module.convert(rows + ['甲_乙,丙|纵火|晴天|-'], self.operators)
        with self.assertRaises(ValueError):
            module.convert(['丙,丙|纵火||+'], self.operators)
        self.assertEqual(['甲,乙|纵火||+'], module.read_rows('const rawData = [// comment\n"甲,乙|纵火||+"];'))

    def test_cli_rerun_preserves_ids_without_explicit_existing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, operators, output = [root / name for name in ('rows.json', 'operators.json', 'catalogs.json')]
            source.write_text(json.dumps(['甲_乙,丙|纵火||+']))
            operators.write_text(json.dumps(self.operators))
            command = [sys.executable, str(Path(module.__file__)), '--input', str(source), '--operators', str(operators), '--output', str(output)]
            subprocess.run(command, check=True, capture_output=True)
            first = output.read_text()
            subprocess.run(command, check=True, capture_output=True)
            self.assertEqual(first, output.read_text())


if __name__ == '__main__':
    unittest.main()
