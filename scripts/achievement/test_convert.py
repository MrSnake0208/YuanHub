"""Synthetic fixtures only; no private workbook or service access."""
import unittest
from pathlib import Path
from unittest.mock import patch
from convert import convert


class ConversionTest(unittest.TestCase):
    def setUp(self):
        self.row = {'成就ID': 'private-source-id', '成就名称': '测试成就', '所属分组': '测试分类',
                    '隐藏': '隐藏', '排序': '3', '达成条件(中文)': '测试条件',
                    '奖励1物品': '测试币', '奖励1数量': '9', '奖励2物品': '', '奖励2数量': ''}
        self.dictionary = [dict(item_key='test_coin', name='测试币', games=['如鸢'])]

    def run_conversion(self, dictionary=None, targets=None):
        with patch('convert.read_workbook', return_value={'成就总表': [self.row], '隐藏成就': [self.row]}):
            return convert('如鸢', Path('synthetic.xlsx'), self.dictionary if dictionary is None else dictionary, targets)

    def test_preserves_content_but_never_exports_source_identity_or_guesses_targets(self):
        catalog = self.run_conversion()['catalog']
        entry = catalog['entries'][0]
        self.assertEqual('测试条件', entry['condition'])
        self.assertTrue(entry['is_hidden'])
        self.assertIsNone(entry['target'])
        self.assertEqual([dict(item_key='test_coin', name='测试币', quantity=9)], entry['rewards'])
        self.assertNotIn('private-source-id', str(catalog))
        linked = self.run_conversion(targets={'测试成就': dict(target=7, linked_metric='yuan_bond_variants')})
        self.assertEqual(7, linked['catalog']['entries'][0]['target'])

    def test_missing_dictionary_and_unsafe_amount_fail_without_partial_output(self):
        with self.assertRaises(AssertionError): self.run_conversion(dictionary=[])
        self.row['奖励1数量'] = '9007199254740992'
        with self.assertRaises(AssertionError): self.run_conversion()


if __name__ == '__main__':
    unittest.main()
