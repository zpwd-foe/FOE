import hashlib
import json
import re
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from foe_cdn_inspector.assignments import building_assignments, load_building_metadata
from foe_cdn_inspector.bonuses import extract_bonus_pairings
from foe_cdn_inspector.html_report import _great_building_bonus_section
from test_bonuses import bonus_class
from test_refresh import END, client, run, saved


def capture(folder):
    (folder / 'great_building_metadata').mkdir(parents=True)
    building = {'id': 'X_Test_Landmark1', 'name': 'Shattered Horizon Siphon', 'type': 'greatbuilding',
                'maxTier': {'value': 'gold'}, 'bonuses': [{'tier': {'value': 'silver'}, 'bonuses': [
                    {'type': 'contribution_boost_gold', 'targetedFeature': 'all'}]}]}
    body = json.dumps(building).encode()
    file = 'great_building_metadata/X_Test_Landmark1.json'
    (folder / file).write_bytes(body)
    manifest = {'market': 'zz', 'world': 'zz1', 'captured_at_utc': '2026-10-06T12:00:00+00:00',
                'local_date': '2026-10-06', 'download_failures': [], 'paired_client_sha256': 'client-a',
                'great_building_count': 1, 'files': [{'file': file, 'sha256': hashlib.sha256(body).hexdigest(),
                'url': 'https://foezz.innogamescdn.com/start/metadata?id=building_entity_X_Test_Landmark1-abc123'}]}
    (folder / 'capture-manifest.json').write_text(json.dumps(manifest))
    return manifest


class AssignmentTests(unittest.TestCase):
    def test_import_uses_bonus_tier_and_verifies_source_hash(self):
        with TemporaryDirectory() as name:
            folder = Path(name)
            manifest = capture(folder)
            data = load_building_metadata(folder)
            self.assertEqual(data['buildings'][0]['bonuses'][0]['tier'], 'silver')
            self.assertNotIn('maxTier', data['buildings'][0])
            (folder / manifest['files'][0]['file']).write_text('{}')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                load_building_metadata(folder)

    def test_rejects_incomplete_wrong_market_and_unsafe_metadata(self):
        for change in ({'great_building_count': 2}, {'market': 'en'}, {'download_failures': ['missing']}):
            with self.subTest(change=change), TemporaryDirectory() as name:
                folder = Path(name)
                manifest = {**capture(folder), **change}
                (folder / 'capture-manifest.json').write_text(json.dumps(manifest))
                with self.assertRaises(ValueError):
                    load_building_metadata(folder)
        with TemporaryDirectory() as name:
            folder = Path(name)
            manifest = capture(folder)
            manifest['files'][0]['file'] = '../outside.json'
            (folder / 'capture-manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'unsafe'):
                load_building_metadata(folder)

    def test_match_requires_same_combat_mode_and_multiplier(self):
        metadata = {'captured_at': '2026-10-06T12:00:00Z', 'local_date': '2026-10-06', 'client_sha256': 'old',
                    'buildings': [{'id': 'X_Test', 'name': 'Test GB', 'bonuses': [
                        {'tier': 'gold', 'type': 'attack_boost', 'target': 'battleground', 'multiplier': True}]}]}
        pairs = [{'bonus_types': ['attack_boost'], 'target': target, 'multiplier': mult, 'icon_ids': [icon]}
                 for target, mult, icon in [('all', True, 'wrong-mode'), ('battleground', False, 'wrong-kind'),
                                          ('battleground', True, 'correct')]]
        data = building_assignments(pairs, metadata, 'new')
        self.assertEqual([r['icon_ids'] for r in data['records']], [['correct']])
        self.assertFalse(data['client_matches_capture'])
        self.assertEqual(data['local_date'], '2026-10-06')

    def test_dynamic_factory_registers_algorithmic_core_type(self):
        source = ('var temporary={bonusFactory:function(){return new ChangedAlias(a)},'
                  'tooltipIconImageURL:I.DynamicIcon(function(){return "dynamic.png"})};'
                  'b.h.algorithmic_core=temporary;')
        source += bonus_class('ChangedAlias', 'AlgorithmicCoreBonus',
                              'icon_great_building_bonus_algorithmic_core', 'Algorithmic Core', 'Description')
        pairing, = extract_bonus_pairings(source)
        self.assertEqual(pairing['bonus_types'], ['algorithmic_core'])
        self.assertEqual(pairing['icon_ids'], ['icon_great_building_bonus_algorithmic_core'])

    def test_card_groups_put_keen_eye_after_dated_cards_and_assigned_gray_first(self):
        prefix = 'https://cdn.example/great_building_bonus_'
        results = {'source': 'forge_hx', 'current_bonus_reports': [
            {'date': '2026-10-06', 'files': [{'url': prefix + 'assigned-abcdef012.png', 'kind': 'image'}]},
            {'date': '', 'files': [{'url': prefix + 'unassigned-abcdef012.png', 'kind': 'image'},
                                   {'url': prefix + 'baseline-abcdef012.png', 'kind': 'image'},
                                   {'url': prefix + 'double_damage_block-abcdef012.png', 'kind': 'image'}]}],
            'building_assignments': {'local_date': '2026-10-06', 'client_matches_capture': True, 'records': [
                {'icon_ids': ['great_building_bonus_' + icon], 'building_id': 'X_Test',
                 'building_name': 'GB <One>', 'tier': tier}
                for icon, tier in [('assigned', 'silver'), ('assigned', 'silver'), ('assigned', 'gold'), ('baseline', 'copper')]]}}
        page = _great_building_bonus_section(results)
        cards = re.findall(r'<article class="bonus-card.*?</article>', page, re.S)
        self.assertEqual([re.search(r'<h3>(.*?)</h3>', c).group(1) for c in cards],
                         ['Assigned', 'Double Damage Block', 'Baseline', 'Unassigned'])
        self.assertEqual([re.search(r'data-group="(.*?)"', c).group(1) for c in cards], ['0', '1', '2', '3'])
        self.assertIn('class="bonus-card baseline"', cards[-1])
        self.assertIn('data-assigned="false"', cards[-1])
        self.assertIn('Present at first scan', cards[-1])
        self.assertIn('No confirmed GB assignment', cards[-1])
        assigned = next(c for c in cards if '<h3>Assigned</h3>' in c)
        self.assertIn('class="bonus-card"', assigned)
        self.assertEqual(assigned.count('data-building-id="X_Test"'), 1)
        self.assertIn('GB &lt;One&gt;', assigned)
        self.assertIn('>Silver</span>', assigned)
        self.assertIn('>Gold</span>', assigned)
        self.assertIn('gb &lt;one&gt; silver gold', assigned)
        self.assertIn('class="bonus-card baseline"', next(c for c in cards if '<h3>Baseline</h3>' in c))

    def test_refresh_keeps_imported_metadata_and_its_original_capture_date(self):
        source = ('b.h.contribution_boost_gold={bonusFactory:function(){return new q},'
                  'tooltipIconImageURL:I.GreatBuildingBonusIcon("test.png")};')
        source += bonus_class('q', 'ContributionBoostGoldBonus', 'icon_great_building_bonus_test',
                              'STEL|Enhanced Contribution Boost', 'Rewards for Gold Tier')
        body = client().replace(END.encode(), source.encode() + END.encode())
        with TemporaryDirectory() as name:
            folder = Path(name)
            capture(folder / 'metadata')
            run(folder, body, extra=('--building-metadata', str(folder / 'metadata')))
            first, state = saved(folder)
            assignments = state['history_results']['building_assignments']
            self.assertEqual(assignments['records'][0]['tier'], 'silver')
            self.assertIn('Shattered Horizon Siphon', (first / 'index.html').read_text())
            run(folder, body, day=7)
            _, state = saved(folder)
            self.assertEqual(state['history_results']['building_assignments'], assignments)
            self.assertTrue(state['checked_at'].startswith('2026-10-07'))
            self.assertEqual(assignments['local_date'], '2026-10-06')
