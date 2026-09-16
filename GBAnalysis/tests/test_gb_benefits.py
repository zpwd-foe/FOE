import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
MODULE_PATH = ROOT / "scripts" / "fetch_gb_benefits.py"
SPEC = importlib.util.spec_from_file_location("fetch_gb_benefits", MODULE_PATH)
FETCH_GB_BENEFITS = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(FETCH_GB_BENEFITS)


class GreatBuildingBenefitTests(unittest.TestCase):
    def test_parser_reads_image_and_text_benefit_rows_in_order(self):
        segment = """
        <tr id='1'><td>1</td><td>70</td><td><ul>
          <li><img title='military_boost' />&nbsp;(3.5)</li>
          <li>strategy_points&nbsp;(1)</li>
        </ul></td><!-- START GB REWARD TABLE -->
        """
        self.assertEqual(
            FETCH_GB_BENEFITS.parse_benefit_items(segment),
            [("military_boost", 3.5), ("strategy_points", 1)],
        )

    def test_exact_percentage_parser_handles_both_wiki_row_formats(self):
        source = """
        {| class="wikitable"
        ! Lvl || Req. || Benefit || Amount
        |-
        | 1 || 50 || 30,5% || 10
        |-
        |2
        |70
        |4x 48.39%
        |12
        |}
        """
        self.assertEqual(
            FETCH_GB_BENEFITS.parse_wiki_percentage_values(source, through_level=2),
            [30.5, 48.39],
        )

    def test_compound_benefit_parser_retains_attempts_and_carries_the_cap(self):
        source = """
        {| class="wikitable"
        ! Lvl || Req. || Benefit
        |-
        | 1 || 50 || 4x 17%
        |-
        | 2 || 70 || 5 × 19.5%
        |-
        | 3 || 80 || 6x 20%
        |}
        """
        self.assertEqual(
            FETCH_GB_BENEFITS.parse_wiki_attempt_values(
                source, cap=6, through_level=5
            ),
            [4, 5, 6, 6, 6],
        )

    def test_integer_attempt_parser_uses_post_level_ten_progression(self):
        rows = "\n".join(
            f"|-\n| {level} || {level * 10} || {9 + level * 3}"
            for level in range(1, 11)
        )
        source = f"""
        {{| class="wikitable"
        ! Lvl || Req. || Eligible aids
        {rows}
        |}}
        """
        self.assertEqual(
            FETCH_GB_BENEFITS.parse_wiki_integer_values(
                source, increment=1, through_level=12
            ),
            [12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 40, 41],
        )

    def test_integer_attempt_parser_prefers_exact_post_level_ten_rows(self):
        rows = "\n".join(
            f"|-\n| {level} || {level * 10} || {9 + level * 3}"
            for level in range(1, 11)
        )
        source = f"""
        {{| class="wikitable"
        ! Lvl || Req. || Eligible aids
        {rows}
        |-
        | 11 || 110 || 50
        |}}
        """
        self.assertEqual(
            FETCH_GB_BENEFITS.parse_wiki_integer_values(
                source, increment=1, through_level=12
            )[-2:],
            [50, 51],
        )

    def test_checked_in_source_covers_every_building_through_301(self):
        dataset = json.loads((ROOT / "data" / "gb-analysis.json").read_text())
        source = json.loads((ROOT / "data" / "gb-benefits-source.json").read_text())
        self.assertEqual(source["schemaVersion"], 3)
        self.assertEqual(source["throughTargetLevel"], 301)
        self.assertEqual(source["missingBuildingIds"], [])
        self.assertEqual(set(source["buildings"]), {item["id"] for item in dataset["buildings"]})
        for building_id, building in source["buildings"].items():
            self.assertTrue(building["benefits"], building_id)
            for benefit in building["benefits"]:
                self.assertEqual(len(benefit["values"]), 301, building_id)
                self.assertTrue(
                    all(
                        left <= right
                        for left, right in zip(
                            benefit["values"], benefit["values"][1:]
                        )
                    ),
                    f"{building_id}: {benefit['key']}",
                )
                if "attempts" in benefit:
                    self.assertEqual(len(benefit["attempts"]), 301, building_id)
                    self.assertTrue(
                        all(
                            left <= right
                            for left, right in zip(
                                benefit["attempts"], benefit["attempts"][1:]
                            )
                        ),
                        f"{building_id}: {benefit['key']} attempts",
                    )

        tower = source["buildings"]["X_BronzeAge_Landmark1"]
        tower_values = {benefit["key"]: benefit["values"] for benefit in tower["benefits"]}
        self.assertEqual(tower_values["random_goods_after_modern"][79], 2 * tower_values["random_goods"][79])

        siphon = source["buildings"]["X_StellarAgeDiscovery_Landmark1"]
        values = {benefit["key"]: benefit["values"] for benefit in siphon["benefits"]}
        self.assertEqual(values["advanced_tactics"][79], 400)
        self.assertEqual(values["advanced_tactics"][300], 1505)
        self.assertEqual(values["supplies"][79], 6_538_811)
        self.assertEqual(values["supplies"][300], 34_264_500)

    def test_checked_in_percentage_benefits_retain_exact_values(self):
        source = json.loads((ROOT / "data" / "gb-benefits-source.json").read_text())

        def value(building_id, key, level):
            benefit = next(
                item
                for item in source["buildings"][building_id]["benefits"]
                if item["key"] == key
            )
            return benefit["values"][level - 1]

        self.assertEqual(value("X_SpaceAgeJupiterMoon_Landmark1", "algorithmic_core", 110), 48.39)
        self.assertEqual(value("X_ArcticFuture_Landmark2", "critical_hit_chance", 10), 6.98)
        self.assertEqual(value("X_BronzeAge_Landmark2", "military_boost", 11), 30.5)
        self.assertEqual(value("X_LateMiddleAge_Landmark3", "military_boost", 11), 30.5)
        self.assertEqual(value("X_LateMiddleAge_Landmark1", "fierce_resistance", 11), 30.5)
        self.assertEqual(value("X_ColonialAge_Landmark2", "fierce_resistance", 11), 30.5)
        self.assertEqual(value("X_VirtualFuture_Landmark1", "advanced_tactics", 11), 20.5)
        self.assertEqual(value("X_EarlyMiddleAge_Landmark3", "plunder_repel", 11), 28.73)
        self.assertEqual(value("X_FutureEra_Landmark1", "contribution_boost", 59), 79.5)
        self.assertEqual(value("X_AllAge_Expedition", "totem_drop", 10), 16.25)
        self.assertEqual(value("X_AllAge_EasterBonus4", "fierce_resistance", 11), 30.5)
        self.assertNotIn(
            "support_boost",
            {
                item["key"]
                for item in source["buildings"]["X_AllAge_EasterBonus4"]["benefits"]
            },
        )

    def test_checked_in_compound_benefits_include_attempt_counts(self):
        source = json.loads((ROOT / "data" / "gb-benefits-source.json").read_text())

        def attempts(building_id, key, level):
            benefit = next(
                item
                for item in source["buildings"][building_id]["benefits"]
                if item["key"] == key
            )
            return benefit["attempts"][level - 1]

        self.assertEqual(attempts("X_OceanicFuture_Landmark3", "double_collection", 10), 6)
        self.assertEqual(attempts("X_SpaceAgeJupiterMoon_Landmark1", "algorithmic_core", 110), 10)
        self.assertEqual(attempts("X_EarlyMiddleAge_Landmark3", "plunder_repel", 1), 2)
        self.assertEqual(attempts("X_OceanicFuture_Landmark2", "first_strike", 10), 12)
        self.assertEqual(attempts("X_VirtualFuture_Landmark2", "spoils_of_war", 10), 5)
        self.assertEqual(attempts("X_SpaceAgeMars_Landmark2", "missile_launch", 10), 3)
        self.assertEqual(attempts("X_SpaceAgeAsteroidBelt_Landmark1", "diplomatic_gifts", 10), 5)
        self.assertEqual(attempts("X_TomorrowEra_Landmark2", "aid_goods", 1), 12)
        self.assertEqual(attempts("X_TomorrowEra_Landmark2", "aid_goods", 10), 39)
        self.assertEqual(attempts("X_TomorrowEra_Landmark2", "aid_goods", 301), 330)
        self.assertEqual(attempts("X_TomorrowEra_Landmark1", "plunder_goods", 301), 3)
        self.assertEqual(attempts("X_IronAge_Landmark2", "supplies_boost", 301), 40)
        self.assertEqual(attempts("X_HighMiddleAge_Landmark1", "money_boost", 301), 90)
        self.assertEqual(attempts("X_IndustrialAge_Landmark1", "supplies_boost", 301), 75)
        self.assertEqual(
            source["buildings"]["X_TomorrowEra_Landmark2"]["compoundBenefitSource"],
            "https://forgeofempires.fandom.com/wiki/Truce_Tower",
        )
        self.assertTrue(
            source["buildings"]["X_IronAge_Landmark2"]["compoundBenefitSource"].startswith(
                "https://foezz.innogamescdn.com/start/metadata?id=building_entity_"
            )
        )


if __name__ == "__main__":
    unittest.main()
