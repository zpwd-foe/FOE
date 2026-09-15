from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = PROJECT_ROOT / "script"
sys.path.insert(0, str(SCRIPT_DIR))

import building_ranking_model as model  # noqa: E402


def legacy_tower(entity_id: str, name: str, era_map: dict[str, dict[str, object]]) -> dict[str, object]:
    return {
        "id": entity_id,
        "name": name,
        "type": "tower",
        "width": 1,
        "length": 1,
        "requirements": {"min_era": "AllAge"},
        "abilities": [{"boostHints": [{"boostHintEraMap": era_map}]}],
    }


class LegacyTowerTests(unittest.TestCase):
    def test_collect_records_includes_highest_tacticians_tower_level(self) -> None:
        entities = {
            "T_AllAge_WinterBonus19a": legacy_tower(
                "T_AllAge_WinterBonus19a",
                "Tactician's Tower - Lv. 1",
                {
                    "VirtualFuture": {
                        "type": "att_boost_defender",
                        "value": 2,
                        "targetedFeature": "all",
                    }
                },
            ),
            "T_AllAge_WinterBonus19b": legacy_tower(
                "T_AllAge_WinterBonus19b",
                "Tactician's Tower - Lv. 2",
                {
                    "VirtualFuture": {
                        "type": "att_boost_defender",
                        "value": 4,
                        "targetedFeature": "all",
                    }
                },
            ),
        }

        records, _attr_keys = model.collect_records(entities, "VirtualFuture", False)

        self.assertEqual([record["entity_id"] for record in records], ["T_AllAge_WinterBonus19b"])
        self.assertEqual(records[0]["size"], "1x1")
        self.assertEqual(records[0]["attrs"]["boost_att_boost_defender_all"], 4.0)

    def test_legacy_boost_hint_falls_back_to_all_age(self) -> None:
        entity = legacy_tower(
            "T_AllAge_EasterBonus1b",
            "Watchfire - Lv. 2",
            {
                "AllAge": {
                    "type": "def_boost_defender",
                    "value": 6,
                    "targetedFeature": "all",
                }
            },
        )

        attrs = model.extract_attributes(entity, "VirtualFuture", 1)

        self.assertEqual(attrs["boost_def_boost_defender_all"], 6.0)

    def test_non_tower_legacy_entity_remains_excluded(self) -> None:
        entity = legacy_tower(
            "T_AllAge_NotATower",
            "Legacy Decoration",
            {
                "AllAge": {
                    "type": "att_boost_defender",
                    "value": 5,
                    "targetedFeature": "all",
                }
            },
        )
        entity["type"] = "decoration"

        records, _attr_keys = model.collect_records(
            {"T_AllAge_NotATower": entity},
            "VirtualFuture",
            False,
        )

        self.assertEqual(records, [])


if __name__ == "__main__":
    unittest.main()
