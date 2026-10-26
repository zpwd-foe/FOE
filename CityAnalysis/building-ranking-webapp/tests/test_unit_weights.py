from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "script"))
import building_ranking_model as model  # noqa: E402


class UnitWeightTests(unittest.TestCase):
    def test_rogues_receive_half_the_previous_default_weight_in_both_profiles(self) -> None:
        self.assertEqual(model.default_weight_for_attr("prod_unit_rogue"), 0.25)
        weights = model.overall_weight_map([
            "prod_unit_current_age", "prod_unit_next_age", "prod_unit_rogue",
        ])
        self.assertEqual(weights["prod_unit_rogue"], 1.25)
        self.assertEqual(weights["prod_unit_current_age"], 1.25)
        self.assertEqual(weights["prod_unit_next_age"], 1.25)
        self.assertAlmostEqual(model.fighting_weight_for_attr("prod_unit_rogue"), 30 / 9.5)
        for key in ("prod_unit_current_age", "prod_unit_next_age"):
            self.assertAlmostEqual(model.fighting_weight_for_attr(key), 15 / 9.5)

    def test_workbook_formulas_keep_the_same_unit_weights_as_the_dashboard(self) -> None:
        self.assertEqual(
            model.fighting_weight_cell_value("prod_unit_rogue"),
            model.fighting_weight_for_attr("prod_unit_rogue"),
        )
        for key in ("prod_unit_current_age", "prod_unit_next_age"):
            self.assertTrue(model.overall_raw_weight_cell_value(key).startswith("=0.5*"))
            self.assertEqual(model.overall_raw_weight_for_attr(key), 0.25)
        self.assertEqual(
            sum(model.OVERALL_FIGHTING_SUBGROUP_BUDGETS.values()),
            model.OVERALL_FIGHTING_WEIGHT_BUDGET,
        )


if __name__ == "__main__":
    unittest.main()
