"""Checks for source integrity and interpretation-sensitive data conversion."""
from pathlib import Path
import hashlib
import json
import unittest

from build_data import parse_cell

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'data/guide-data.json').read_text())


class GuideDataTests(unittest.TestCase):
    def test_complete_source_coverage(self):
        buildings = DATA['buildings']
        self.assertEqual(len(buildings), 49)
        self.assertEqual(len({b['id'] for b in buildings}), 49)
        self.assertEqual(sum(b['gold'] for b in buildings), 21)
        self.assertEqual(sum(len(b['rows']) for b in buildings), 121)
        self.assertEqual(sum(len(r['values']) for b in buildings for r in b['rows']), 570)
        for b in buildings:
            with self.subTest(building=b['name']):
                self.assertEqual(hashlib.sha256((ROOT / b['screenshot']).read_bytes()).hexdigest(), b['screenshotSha256'])

    def test_shown_checkpoints_and_unlocks(self):
        for b in DATA['buildings']:
            with self.subTest(building=b['name']):
                self.assertEqual(b['levels'], [1, 101, 201, 301, 401, 500] if b['gold'] else [1, 101, 200])
                for r in b['rows']:
                    self.assertEqual(len(r['values']), len(b['levels']))
                    self.assertEqual(r['values'][0]['value'] is None, r['tier'] == 'Gold')
                    self.assertIn(r['boost'], DATA['boosts'])

    def test_icon_integrity(self):
        for boost in DATA['boosts'].values():
            self.assertEqual(hashlib.sha256((ROOT / boost['icon']).read_bytes()).hexdigest(), boost['icon_sha256'])

    def test_scope_conflict_remains_visible(self):
        flagged = [b for b in DATA['buildings'] if any(r.get('uncertain') for r in b['rows'])]
        self.assertEqual([b['name'] for b in flagged], ['Himeji Castle'])
        self.assertIn('Scope conflict', flagged[0]['notes'][0])

    def test_chance_and_charge_interpretation(self):
        chance = parse_cell('25% ×82/24h', 96)
        self.assertEqual(chance['expectedTriggers'], 20.5)
        self.assertTrue(chance['perDay'])
        self.assertNotIn('expectedTriggers', parse_cell('214% ×90', 81))
        self.assertFalse(parse_cell('15% ×4', 3)['perDay'])
        self.assertIsNone(parse_cell('—', 9)['value'])

    def test_rounded_amount_conversion(self):
        value = parse_cell('4.1M /24h', 99)
        self.assertEqual(value['value'], 4100000)
        self.assertTrue(value['approximate'])
        self.assertEqual(value['text'], '4.1M /24h')


if __name__ == '__main__':
    unittest.main()
