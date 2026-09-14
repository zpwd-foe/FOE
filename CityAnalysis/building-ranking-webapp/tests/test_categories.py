from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = PROJECT_ROOT / "script"
sys.path.insert(0, str(SCRIPT_DIR))

import building_ranking_model as model  # noqa: E402


class BuildingCategoryTests(unittest.TestCase):
    def correction_entities(self) -> dict[str, dict[str, str]]:
        names = [
            "Bougainvillea Windmill",
            "Azalea Windmill",
            "Flower Trail",
            "Wheat Trail",
            "Olive\u00a0Trail",
            "Rocky Trail",
            "Ascended Golden Crops Feast",
            "Radiant Flamingo Paradise",
            "Ascended Elysian Whisperwood Watermill",
            "Everblossom Fiore Village",
            "United World Expo",
            "Harmonious World Expo",
            "Majestic Animal Crossing",
            "Elysian Whisperwood Watermill",
            "Mad Scientist’s Dominion",
            "Serene Eagle Mountain",
            "Serene Bear Mountain",
            "Serene Moose Mountain",
            "Pirate King's Conquest Villa",
            "Harmonious Animal Crossing",
            "The Charcoal Limited Express",
            "The Evergreen Limited Express",
            "The Sleighride Limited Express",
        ]
        return {
            f"legacy-{index}": {"id": f"legacy-{index}", "name": name}
            for index, name in enumerate(names, start=1)
        }

    def test_cop_event_years_share_the_cultural_settlement_category(self) -> None:
        self.assertEqual(
            model.building_category_label("W_MultiAge_COP24A9"),
            model.CULTURAL_SETTLEMENT_REWARDS,
        )
        self.assertEqual(
            model.building_category_label("W_MultiAge_COP25A1"),
            model.CULTURAL_SETTLEMENT_REWARDS,
        )

    def test_similar_event_abbreviations_remain_year_specific(self) -> None:
        self.assertEqual(
            model.building_category_label("W_MultiAge_CUP23A10"),
            "CUP 2023 Event Rewards",
        )

    def test_category_options_merge_and_deduplicate_cop_years(self) -> None:
        records = [
            {"entity_id": "W_MultiAge_COP24A9"},
            {"entity_id": "W_MultiAge_COP25A1"},
            {"entity_id": "W_MultiAge_ANNI26A1"},
        ]

        categories = model.building_category_options(records)

        self.assertEqual(categories.count(model.CULTURAL_SETTLEMENT_REWARDS), 1)
        self.assertNotIn("COP 2024 Event Rewards", categories)
        self.assertNotIn("COP 2025 Event Rewards", categories)
        self.assertLess(
            categories.index(model.CULTURAL_SETTLEMENT_REWARDS),
            categories.index("ANNI 2026 Event Rewards"),
        )

    def test_known_care_2026_buildings_override_legacy_event_ids(self) -> None:
        legacy_ids_by_name = {
            "Azalea Windmill": "W_MultiAge_CUP22A10",
            "Bougainvillea Windmill": "W_MultiAge_CUP22A11",
            "Flower Trail": "W_MultiAge_CUP22B2",
            "Wheat Trail": "W_MultiAge_CUP22C2",
            "Olive Trail": "W_MultiAge_CUP22D2",
            "Rocky Trail": "W_MultiAge_CUP22E2",
        }

        for name, entity_id in legacy_ids_by_name.items():
            with self.subTest(name=name):
                self.assertEqual(
                    model.building_category_label(entity_id, name),
                    model.CARE_2026_EVENT_REWARDS,
                )

    def test_ascended_golden_crops_feast_overrides_legacy_fall_event_id(self) -> None:
        self.assertEqual(
            model.building_category_label(
                "W_MultiAge_FALL21A12",
                "Ascended Golden Crops Feast",
            ),
            model.FALL_2026_EVENT_REWARDS,
        )

    def test_recent_event_buildings_override_legacy_event_ids(self) -> None:
        corrections = {
            "W_MultiAge_WILD24A15": ("Radiant Flamingo Paradise", "WILD 2026 Event Rewards"),
            "W_MultiAge_FELL24A12": ("Ascended Elysian Whisperwood Watermill", "FELL 2026 Event Rewards"),
            "W_MultiAge_BOWL22A13": ("Everblossom Fiore Village", "FELL 2025 Event Rewards"),
            "W_MultiAge_ARCH19A14": ("United World Expo", "ANNI 2026 Event Rewards"),
            "W_MultiAge_ARCH19A13": ("Harmonious World Expo", "ANNI 2026 Event Rewards"),
            "W_MultiAge_WILD22A12": ("Majestic Animal Crossing", "WILD 2026 Event Rewards"),
            "W_MultiAge_FELL24A11": ("Elysian Whisperwood Watermill", "FELL 2026 Event Rewards"),
            "W_MultiAge_HAL15A4": ("Mad Scientist’s Dominion", "HAL 2025 Event Rewards"),
            "W_MultiAge_WILD21A8b": ("Serene Eagle Mountain", "WILD 2025 Event Rewards"),
            "W_MultiAge_WILD21A8a": ("Serene Bear Mountain", "WILD 2025 Event Rewards"),
            "W_MultiAge_WILD21A8c": ("Serene Moose Mountain", "WILD 2025 Event Rewards"),
            "W_MultiAge_SUM20A12": ("Pirate King's Conquest Villa", "SUM 2025 Event Rewards"),
            "W_MultiAge_WILD22A11": ("Harmonious Animal Crossing", "WILD 2026 Event Rewards"),
            "W_MultiAge_WIN19A10a": ("The Charcoal Limited Express", "WIN 2025 Event Rewards"),
            "W_MultiAge_WIN19A10b": ("The Evergreen Limited Express", "WIN 2025 Event Rewards"),
            "W_MultiAge_WIN19A10c": ("The Sleighride Limited Express", "WIN 2025 Event Rewards"),
        }

        for entity_id, (name, category) in corrections.items():
            with self.subTest(entity_id=entity_id):
                self.assertEqual(model.building_category_label(entity_id, name), category)
                self.assertEqual(model.building_category_label("W_MultiAge_FUT99A1", name), category)

    def test_category_correction_validation_accepts_normalized_whitespace(self) -> None:
        model.validate_building_category_corrections(self.correction_entities())

    def test_category_correction_validation_rejects_missing_buildings(self) -> None:
        entities = self.correction_entities()
        entities.pop("legacy-1")

        with self.assertRaisesRegex(ValueError, "Bougainvillea Windmill"):
            model.validate_building_category_corrections(entities)

    def test_category_correction_validation_rejects_ambiguous_buildings(self) -> None:
        entities = self.correction_entities()
        entities["duplicate"] = {"id": "duplicate", "name": "Olive Trail"}

        with self.assertRaisesRegex(ValueError, "ambiguous 'Olive Trail'"):
            model.validate_building_category_corrections(entities)


if __name__ == "__main__":
    unittest.main()
