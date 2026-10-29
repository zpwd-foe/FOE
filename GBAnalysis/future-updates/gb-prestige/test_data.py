"""Workbook fidelity, coverage and interpretation-sensitive import checks."""
from pathlib import Path
import hashlib
import json
import re
import unittest

from import_workbook import DEFAULT_SOURCE, read_workbook, numeric

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'data/guide-data.json').read_text())
BUILDINGS = {b['sourceSheet']: b for b in DATA['buildings']}


class GuideDataTests(unittest.TestCase):
    def test_complete_source_coverage(self):
        self.assertEqual(len(BUILDINGS), 49)
        self.assertEqual(len({b['id'] for b in DATA['buildings']}), 49)
        self.assertEqual(sum(b['gold'] for b in BUILDINGS.values()), 21)
        self.assertEqual(sum(len(b['rows']) for b in BUILDINGS.values()), 123)
        self.assertEqual(sum(len(r['values']) for b in BUILDINGS.values() for r in b['rows']), 31500)
        for b in BUILDINGS.values():
            with self.subTest(building=b['name']):
                self.assertNotIn('screenshot', b)
                self.assertEqual(b['levels'], list(range(1, 301 if b['gold'] else 201)))
                self.assertEqual(len(b['levelData']), len(b['levels']))
                for row in b['rows']:
                    self.assertEqual(len(row['values']), len(b['levels']))
                    self.assertEqual(row['coverage'], sum(v is not None for v in row['values']))
                    self.assertIn(row['boost'], DATA['boosts'])
                    if row['tier'] == 'Gold':
                        self.assertEqual(row['values'][:100], [None] * 100)

    def test_gaps_are_not_zero_or_filled_from_old_checkpoints(self):
        copper, gold = BUILDINGS['SoZ']['rows']
        self.assertEqual(copper['values'][149], 304)
        self.assertEqual(gold['values'][149], 3)
        self.assertEqual(gold['coverage'], 124)
        self.assertEqual(gold['values'][223], 5)
        self.assertIsNone(gold['values'][224])
        self.assertEqual(BUILDINGS['Colo']['rows'][2]['coverage'], 1)
        self.assertIsNone(BUILDINGS['ND']['rows'][0]['values'][110])
        self.assertEqual(BUILDINGS['SoZ']['levelData'][149][:2], [77623, 2235390])

    def test_unpublished_unlock_costs_are_explicit_without_changing_source_values(self):
        pending = {sheet: b for sheet, b in BUILDINGS.items() if b.get('pendingUnlockCosts')}
        self.assertEqual(set(pending), {'CENT', 'HYD', 'PEG', 'Cat', 'SW'})
        for b in pending.values():
            self.assertFalse(b['gold'])
            self.assertEqual(b['pendingUnlockCosts']['fields'], [4, 5, 6])
            self.assertEqual(b['pendingUnlockCosts']['fromLevel'], 11)
            self.assertTrue(b['pendingUnlockCosts']['source'].startswith('https://support.innogames.com/'))
            self.assertTrue(all(row[field] is None for row in b['levelData'] for field in [4, 5, 6]))

    def test_gold_unlock_resource_rule_has_explicit_provenance(self):
        affected = [b for b in BUILDINGS.values() if b['gold'] and b['sourceSheet'] != 'SHS']
        self.assertEqual(len(affected), 20)
        for b in BUILDINGS.values():
            confirmations = b['costSource'].get('confirmedUnlockRanges', [])
            if b not in affected:
                self.assertEqual(confirmations, [], b['name'])
                continue
            confirmation, = confirmations
            self.assertEqual(confirmation['fields'], ['coinsSupplies', 'medals'])
            self.assertEqual((confirmation['fromLevel'], confirmation['toLevel'], confirmation['value']), (10, 100, 0))
            self.assertEqual(confirmation['date'], '2026-10-28')
            self.assertIn('User confirmed', confirmation['reason'])
            for level in range(10, 101):
                self.assertEqual(b['levelData'][level - 1][4:6], [0, 0], (b['name'], level))
            self.assertTrue(all(value > 0 for value in b['levelData'][100][4:6]), b['name'])

    def test_percent_units_and_charges(self):
        self.assertEqual(BUILDINGS['CF']['rows'][2]['values'][100], 5)
        aid = BUILDINGS['TT']['rows'][0]
        self.assertEqual(aid['unit'], 'count')
        self.assertEqual(aid['values'][0], 31)
        self.assertEqual(aid['values'][100], 192)
        blue = BUILDINGS['BG']['rows'][0]
        self.assertEqual(blue['values'][100], 65)
        self.assertEqual(blue['charges'][100], 13)
        self.assertEqual(BUILDINGS['BG']['rows'][1]['values'][0], 4159)
        self.assertEqual(BUILDINGS['ToR']['rows'][1]['values'][0], 3)
        self.assertEqual(BUILDINGS['FI']['rows'][1]['values'][0], 3)

    def test_shs_confirmed_multiplier_extension_has_explicit_provenance(self):
        row = next(row for row in BUILDINGS['SHS']['rows'] if row['boost'] == '58')
        self.assertEqual(row['values'][65:108], [4] * 43)
        self.assertEqual(row['coverage'], 108)
        self.assertIsNone(row['values'][108])
        confirmation, = row['source']['confirmedRanges']
        self.assertEqual((confirmation['fromLevel'], confirmation['toLevel'], confirmation['value']), (102, 108, 4))
        self.assertIn('User confirmed', confirmation['reason'])

    def test_icon_integrity_and_himeji_attack_scope(self):
        for info in DATA['boosts'].values():
            self.assertEqual(hashlib.sha256((ROOT / info['icon']).read_bytes()).hexdigest(), info['icon_sha256'])
        flagged = [b['name'] for b in BUILDINGS.values() if any(r.get('uncertain') for r in b['rows'])]
        self.assertEqual(flagged, [])
        himeji = next(row for row in BUILDINGS['HC']['rows'] if row['boost'] == '75')
        self.assertEqual(himeji['tier'], 'Gold')
        self.assertEqual(himeji['source']['column'], 'J')
        self.assertEqual(DATA['boosts']['75']['bonus_types'], ['defender_attack_boost'])
        self.assertEqual(DATA['boosts']['75']['scope'], 'GBG · defending army')
        self.assertEqual(DATA['boosts']['75']['label'], 'Attack multiplier')
        self.assertEqual(DATA['boosts']['75']['icon'], 'assets/icons/bonus_defending_attack_gbg_multiplier.png')
        self.assertEqual(BUILDINGS['HC']['notes'], [])
        self.assertTrue(any(row['boost'] == '63' for row in BUILDINGS['SV']['rows']))
        self.assertEqual(DATA['boosts']['63']['label'], 'Attack & defense multiplier')

    def test_fp_and_reward_boundaries(self):
        for b in BUILDINGS.values():
            total = 0
            for level, record in enumerate(b['levelData'], 1):
                self.assertEqual(len(record), len(DATA['levelFields']))
                total += record[0]
                self.assertEqual(total, record[1])
                self.assertTrue(all(value is None or value >= 0 for value in record))
                if not b['gold'] or level < 101:
                    self.assertEqual(record[12:14], [None, None])

    @unittest.skipUnless(DEFAULT_SOURCE.exists(), 'Raw authoring workbook is not required for deployment')
    def test_every_boost_charge_and_unlock_cost_matches_workbook_and_confirmations(self):
        self.assertEqual(hashlib.sha256(DEFAULT_SOURCE.read_bytes()).hexdigest(), DATA['source']['sha256'])
        sheets = read_workbook(DEFAULT_SOURCE)
        for b in BUILDINGS.values():
            cells = sheets[b['sourceSheet']]
            resource_labels = ['Copper Sets', 'Gold Sets', 'Coins / Supplies', 'Medals', 'Goods (each)']
            for field, label in enumerate(resource_labels, 2):
                header = next((address for address, value in cells.items()
                               if re.fullmatch(r'[A-Z]+4', address) and value == label), None)
                column = header[:-1] if header else None
                for level, record in enumerate(b['levelData'], 1):
                    expected = numeric(cells, f'{column}{level+4}') if column else None
                    if b['gold'] and b['sourceSheet'] != 'SHS' and field in (4, 5) and 10 <= level <= 100:
                        expected = 0
                    self.assertEqual(record[field], expected, (b['name'], label, level))
            for row in b['rows']:
                for level, actual in enumerate(row['values'], 1):
                    expected = None if row['tier'] == 'Gold' and level < 101 else numeric(cells, f'{row["source"]["column"]}{level+4}', row['source']['scale'])
                    for confirmation in row['source'].get('confirmedRanges', []):
                        if confirmation['fromLevel'] <= level <= confirmation['toLevel']:
                            expected = confirmation['value']
                    self.assertEqual(actual, expected, (b['name'], row['boost'], level))
                    charges = row['source'].get('charges')
                    if charges and len(charges) <= 2:
                        expected_charge = None if row['tier'] == 'Gold' and level < 101 else numeric(cells, f'{charges}{level+4}')
                        self.assertEqual(row['charges'][level-1], expected_charge)


if __name__ == '__main__':
    unittest.main()
