import json
import unittest

from foe_cdn_inspector.bonuses import extract_bonus_pairings
from foe_cdn_inspector.html_report import _great_building_bonus_section
from foe_cdn_inspector.refresh import current_strings


def bonus_class(alias, name, icon, title, description):
    return (f'h["de.innogames.strategycity.util.greatbuilding.{name}"]={alias};'
            f'{alias}.prototype={{getBonusIcon:function(a){{return {json.dumps(icon)}}},'
            f'getBonusName:function(a){{return t.gettext({json.dumps(title)})}},'
            f'getTooltip:function(a){{return t.gettext({json.dumps(description)})}},'
            'getTooltipCurrentLevel:function(a,b){return this.getTooltip(a,b)},'
            f'__class__:{alias}}};')


class BonusPairingTests(unittest.TestCase):
    def test_stel_names_and_descriptions_stay_with_their_own_icons(self):
        source = bonus_class('a1', 'ContributionBoostGoldBonus',
            'icon_great_building_bonus_contribution_boost_gold',
            'STEL|Enhanced Contribution Boost', 'STEL|Rewards from Gold Tier Great Buildings increase by %f%.')
        source += bonus_class('b2', 'DoubleDamageBlockBonus',
            'icon_great_building_bonus_double_damage_block',
            'STEL|Keen Eye Immunity', 'Next %s units have a %s% chance. A literal } stays in this tooltip.')
        source += ';t.gettext("STEL|Unrelated stellar message");'
        pairs = extract_bonus_pairings(source)
        self.assertEqual(len(pairs), 2)
        self.assertEqual(pairs[0]['names'], ['STEL|Enhanced Contribution Boost'])
        self.assertIn('Gold Tier', pairs[0]['descriptions'][0])
        self.assertEqual(pairs[1]['names'], ['STEL|Keen Eye Immunity'])
        self.assertIn('literal }', pairs[1]['descriptions'][0])
        self.assertNotIn('Unrelated stellar', str(pairs))
        self.assertEqual(pairs[1]['source_line'], 1)

    def test_factory_links_generic_icons_and_prefers_current_level_description(self):
        source = ('b.h.population={bonusFactory:function(){return new renamed},'
                  'tooltipIconImageURL:Icons.GreatBuildingBonusIcon("population.png")};')
        source += bonus_class('renamed', 'PopulationBonus', 'population', 'Population', 'Generic tooltip')
        source = source.replace('return t.gettext("Population")', 'return t.ngettext("Population","Populations",1)')
        source = source.replace('return this.getTooltip(a,b)', '/* } ignored */return t.gettext("Provides %s population now.")')
        pair, = extract_bonus_pairings(source)
        self.assertEqual(pair['names'], ['Population'])
        self.assertEqual(pair['descriptions'], ['Provides %s population now.'])
        self.assertEqual(pair['icon_ids'], ['great_building_bonus_population.png'])

    def test_conditional_wording_is_preserved_without_claiming_an_active_flag(self):
        source = bonus_class('changedAlias', 'ContributionBoostBonus',
            'icon_great_building_bonus_contribution_boost', 'FUT|Contribution Boost', 'FUT|Old description')
        source = source.replace('return t.gettext("FUT|Contribution Boost")',
            'return enabled()?t.gettext("GBP|Basic Contribution Boost"):t.gettext("FUT|Contribution Boost")')
        source = source.replace('return t.gettext("FUT|Old description")',
            'return enabled()?t.gettext("GBP|New description"):t.gettext("FUT|Old description")')
        pair, = extract_bonus_pairings(source)
        self.assertTrue(pair['conditional'])
        self.assertEqual(pair['names'], ['GBP|Basic Contribution Boost', 'FUT|Contribution Boost'])
        self.assertEqual(pair['descriptions'], ['GBP|New description', 'FUT|Old description'])

    def test_military_names_target_and_multiplier_follow_client_maps(self):
        source = '''b.h.attack_boost={bonusFactory:function(){return new NewAlias},tooltipIconImageURL:K.GreatBuildingBonusIcon("attacking_attack.png")};
        h["de.innogames.strategycity.util.greatbuilding.MilitaryBoostBonus"]=NewAlias;
        NewAlias.prototype={getBonusIcon:function(a){return OtherAlias.getIconId(a.type,a.targetedFeature,a.isMultiplier)},
        _getTargetName:function(a){switch(a){case "all":return "";case "guild_raids":return t.gettext("GBP|Quantum Incursion")}},__class__:NewAlias};
        OtherAlias.getTargetedFeatureIconId=function(a,b,c){switch(b){case "all":var d="";break;case "guild_raids":d="_gr";break}c&&(d+="_multiplier");return a+d};
        OtherAlias.BONUS_TO_BOOST_MAP=function(a){a.h.attack_boost="att_boost_attacker";return a}(this);
        OtherAlias.getLargeIconId=function(a,b,c){switch(a){case "att_boost_attacker":a="attacking_attack";break}return OtherAlias.getTargetedFeatureIconId("boost_icon_bonus_"+a,b,c)};'''
        for key, value in {
            'BONUS_NAMES_MAP': 'GBP|Attackers - Attack',
            'MULTIPLIER_BONUS_NAMES_MAP': 'GBP|Attackers - Sword',
            'ALL_BONUS_DESCRIPTIONS_MAP': 'GBP|Attack boosted by %d%.',
            'BONUS_DESCRIPTIONS_MAP': 'GBP|Attack in %s boosted by %d%.',
            'MULTIPLIER_ALL_BONUS_DESCRIPTIONS_MAP': 'GBP|Attack multiplied by %d%.',
            'MULTIPLIER_BONUS_DESCRIPTIONS_MAP': 'GBP|Attack in %s multiplied by %d%.'
        }.items():
            source += f'NewAlias.{key}=function(a){{var b=t.gettext({json.dumps(value)});a.h.attack_boost=b;return a}}(this);'
        pairs = extract_bonus_pairings(source)
        self.assertEqual(len(pairs), 4)
        qi = next(p for p in pairs if p['target'] == 'guild_raids' and p['multiplier'])
        self.assertEqual(qi['icon_ids'], ['boost_icon_bonus_attacking_attack_gr_multiplier'])
        self.assertEqual(qi['names'], ['Quantum Incursion Attackers - Sword'])
        self.assertEqual(qi['descriptions'], ['Attack in Quantum Incursion multiplied by %d%.'])
        self.assertEqual(extract_bonus_pairings(source.replace('d+="_multiplier"', 'd+="_changed"')), [])

    def test_newly_recognized_text_does_not_get_a_fake_release_date(self):
        current = {'sha256': 'same', 'source_url': 'https://example.test/client.js',
                   'strings': ['GBP|Old text', 'STEL|Existing label'], 'gbp_strings': ['GBP|Old text'],
                   'gb_strings': ['GBP|Old text', 'STEL|Existing label', 'Population']}
        previous = {k: v for k, v in current.items() if k != 'gb_strings'}
        old = {'string_results': {'active_strings': [{'text': 'GBP|Old text', 'last_added_date': '2026-09-01'}]}}
        result = current_strings(current, previous, old, '2026-10-06T20:00:00+00:00', 'same-snapshot')
        self.assertEqual(result['active_strings'][0]['last_added_date'], '2026-09-01')
        self.assertTrue(all(r['last_added_date'] == '' for r in result['active_strings'][1:]))
        self.assertEqual(result['removal_events'], [])
        current['sha256'] = 'changed'
        current['gb_strings'].append('STEL|Actually new')
        result = current_strings(current, previous, old, '2026-10-07T20:00:00+00:00', 'new-snapshot')
        self.assertEqual(next(r for r in result['active_strings'] if r['text'] == 'STEL|Existing label')['last_added_date'], '')
        self.assertEqual(next(r for r in result['active_strings'] if r['text'] == 'STEL|Actually new')['last_added_date'], '2026-10-07')

    def test_card_shows_paired_name_description_search_and_explicit_unknown(self):
        pairs = extract_bonus_pairings(bonus_class('x', 'GoldBonus',
            'icon_great_building_bonus_contribution_boost_gold', 'STEL|Enhanced <Contribution> Boost',
            'Gold rewards increase by %f%. <script>bad()</script>'))
        base = 'https://cdn.example/city/gui/great_building_bonus_icons/great_building_bonus_'
        result = _great_building_bonus_section({'source': 'forge_hx', 'bonus_pairings': pairs,
            'current_bonus_reports': [{'date': '', 'source': 'forge_hx', 'files': [
                {'kind': 'image', 'url': base + stem + '-abcdef012.png', 'change': 'current'}
                for stem in ('contribution_boost_gold', 'unknown')]}]})
        self.assertIn('<h3>Enhanced &lt;Contribution&gt; Boost</h3>', result)
        self.assertIn('Gold rewards increase by …%.', result)
        self.assertIn('gold rewards increase', result)  # Search includes description.
        self.assertNotIn('<script>bad()', result)
        self.assertIn('class="bonus-card baseline" data-paired="true" data-assigned="false"', result)
        self.assertIn('Pairing unconfirmed.', result)
        self.assertIn('1 of 2 icons have linked text', result)
        self.assertEqual(result.count('<details class="asset-details bonus-description-details"><summary>Description</summary>'), 2)
        self.assertNotIn('class="asset-details bonus-description-details" open', result)


if __name__ == '__main__':
    unittest.main()
