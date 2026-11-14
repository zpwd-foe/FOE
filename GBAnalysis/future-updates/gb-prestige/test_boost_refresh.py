"""Boost refresh provenance, coverage and separation from existing costs."""
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import unittest

from import_workbook import ROOT, read_workbook, numeric
from refresh_boosts import SNAPSHOT, apply_snapshot, extract_snapshot

DATA = json.loads((ROOT / 'data/guide-data.json').read_text())
SOURCE = json.loads(SNAPSHOT.read_text())
RAW_EXPORT = os.environ.get('GB_BOOST_WORKBOOK')


class BoostRefreshTests(unittest.TestCase):
    def test_snapshot_is_complete_and_overlay_leaves_costs_unchanged(self):
        original = deepcopy(DATA)
        original.pop('boostSource')
        before = {b['id']: deepcopy(b['levelData']) for b in original['buildings']}
        updated = apply_snapshot(original, SOURCE)
        self.assertEqual({b['id']: b['levelData'] for b in updated['buildings']}, before)
        self.assertEqual(updated['source'], DATA['source'])
        self.assertEqual(updated['boostSource'], SOURCE['source'])
        self.assertEqual(updated['buildings'], DATA['buildings'])
        self.assertEqual(len(SOURCE['buildings']), 49)

    def test_missing_duplicate_or_mismatched_buildings_are_rejected(self):
        for change in ('missing', 'duplicate', 'sheet'):
            source = deepcopy(SOURCE)
            if change == 'missing':
                source['buildings'].pop()
            elif change == 'duplicate':
                source['buildings'].append(source['buildings'][0])
            else:
                source['buildings'][0]['sheet'] = 'Arc'
            with self.assertRaises(ValueError):
                apply_snapshot(deepcopy(DATA), source)

    def test_source_cannot_silently_override_user_confirmation(self):
        source = deepcopy(SOURCE)
        shs = next(b for b in source['buildings'] if b['sheet'] == 'SHS')
        next(r for r in shs['rows'] if r['boost'] == '58')['values'][107] = 9
        with self.assertRaisesRegex(ValueError, 'conflicts with user confirmation'):
            apply_snapshot(deepcopy(DATA), source)

    def test_arc_milestones_and_full_gold_coverage(self):
        arc = next(b for b in DATA['buildings'] if b['sourceSheet'] == 'Arc')
        values = next(r for r in arc['rows'] if r['tier'] == 'Gold')['values']
        for level, value in [(203, 23), (206, 23), (207, 24), (213, 24), (214, 25),
                             (221, 26), (229, 27), (238, 28), (500, 40)]:
            self.assertEqual(values[level-1], value)
        for b in DATA['buildings']:
            for row in b['rows']:
                if row['tier'] == 'Gold':
                    self.assertEqual(row['values'][:100], [None] * 100)
                    self.assertTrue(all(v is not None for v in row['values'][100:]))
                    self.assertEqual(len(row['values']), 500)

    def test_blue_galaxy_copper_cap_preserves_raw_source_and_gold_growth(self):
        building = next(b for b in DATA['buildings'] if b['sourceSheet'] == 'BG')
        source = next(b for b in SOURCE['buildings'] if b['sheet'] == 'BG')
        for row in building['rows']:
            raw = next(r for r in source['rows'] if r['boost'] == row['boost'])
            if row['tier'] == 'Gold':
                self.assertEqual(row['values'], raw['values'])
                self.assertEqual(row['charges'], raw['charges'])
                self.assertNotIn('confirmedCap', row['source'])
                self.assertGreater(row['values'][499], row['values'][199])
                continue
            self.assertEqual(row['source']['confirmedCap']['level'], 200)
            self.assertIn('User confirmed', row['source']['confirmedCap']['reason'])
            for field in ('values', 'charges'):
                if field not in row:
                    continue
                self.assertEqual(row[field][:200], raw[field][:200])
                self.assertEqual(row[field][200:], [row[field][199]] * 300)
                self.assertEqual(raw[field][200:], [None] * 300)

    def test_new_source_cannot_silently_change_the_confirmed_copper_cap(self):
        source = deepcopy(SOURCE)
        bg = next(b for b in source['buildings'] if b['sheet'] == 'BG')
        next(r for r in bg['rows'] if r['boost'] == '12')['charges'][200] = 16
        with self.assertRaisesRegex(ValueError, 'conflicts with user-confirmed Copper cap'):
            apply_snapshot(deepcopy(DATA), source)

    @unittest.skipUnless(RAW_EXPORT, 'Set GB_BOOST_WORKBOOK to independently check the downloaded export')
    def test_every_boost_and_attempt_limit_matches_downloaded_sheet(self):
        path = Path(RAW_EXPORT)
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), SOURCE['source']['sha256'])
        sheets = read_workbook(path)
        for b in DATA['buildings']:
            cells = sheets[b['sourceSheet']]
            for row in b['rows']:
                for level, actual in enumerate(row['values'], 1):
                    source_level = min(level, 200) if b['sourceSheet'] == 'BG' and row['tier'] == 'Copper' else level
                    expected = None if row['tier'] == 'Gold' and level < 101 else numeric(
                        cells, f'{row["source"]["column"]}{source_level+4}', row['source']['scale'])
                    self.assertEqual(actual, expected, (b['name'], row['boost'], level))
                    charge = row['source'].get('charges')
                    if charge and len(charge) <= 2:
                        expected_charge = None if row['tier'] == 'Gold' and level < 101 else numeric(cells, f'{charge}{source_level+4}')
                        self.assertEqual(row['charges'][level-1], expected_charge, (b['name'], charge, level))
        self.assertEqual(extract_snapshot(path, DATA, SOURCE['source']['retrievedAt']), SOURCE)


if __name__ == '__main__':
    unittest.main()
