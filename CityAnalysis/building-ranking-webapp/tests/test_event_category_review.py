from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


WEBAPP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEBAPP_ROOT / "scripts"))

import export_data  # noqa: E402


class EventCategoryReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original = {
            "entityId": "W_MultiAge_HAL24A10",
            "name": "Eerie Nightmare Coaster",
            "category": "HAL 2024 Event Rewards",
        }
        self.upgrade = {
            "entityId": "W_MultiAge_HAL24A11",
            "name": "Eerie Delirium Coaster",
            "category": "HAL 2026 Event Rewards",
        }
        self.review = {
            "category": self.upgrade["category"],
            "source": "https://support.innogames.com/kb/ForgeOfEmpires/en_DK/6984",
            "upgrades": [self.upgrade],
        }

    def test_new_version_with_old_event_id_requires_review(self) -> None:
        uncorrected = {**self.upgrade, "category": "HAL 2024 Event Rewards"}
        with self.assertRaisesRegex(ValueError, "W_MultiAge_HAL24A11.*new entity"):
            export_data.validate_event_category_changes([uncorrected], [self.original], [])

    def test_known_upgrade_needs_matching_id_name_and_correct_category(self) -> None:
        for field, value in (
            ("entityId", "W_MultiAge_HAL24A13"),
            ("name", "Ascended Eerie Delirium Coaster"),
            ("category", "HAL 2024 Event Rewards"),
        ):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "review required"):
                export_data.validate_event_category_changes(
                    [{**self.upgrade, field: value}], [self.original], [self.review]
                )

    def test_sourced_upgrade_passes_without_reclassifying_original(self) -> None:
        self.assertEqual(
            export_data.validate_event_category_changes(
                [self.original, self.upgrade], [self.original], [self.review]
            ),
            1,
        )

    def test_renamed_placeholder_requires_review_even_in_same_event(self) -> None:
        placeholder = {**self.upgrade, "name": "HAL26A Platinum"}
        with self.assertRaisesRegex(ValueError, "HAL26A Platinum.*Eerie Delirium Coaster"):
            export_data.validate_event_category_changes([self.upgrade], [placeholder], [])

    def test_new_current_year_event_building_also_requires_review(self) -> None:
        current_event = {**self.upgrade, "entityId": "W_MultiAge_HAL26A11"}
        with self.assertRaisesRegex(ValueError, "W_MultiAge_HAL26A11"):
            export_data.validate_event_category_changes([current_event], [self.original], [])

    def test_reclassifying_existing_version_requires_review(self) -> None:
        incorrectly_reclassified = {**self.original, "category": self.upgrade["category"]}
        with self.assertRaisesRegex(ValueError, "Eerie Nightmare Coaster"):
            export_data.validate_event_category_changes(
                [incorrectly_reclassified], [self.original], [self.review]
            )

    def test_removing_event_category_requires_review(self) -> None:
        with self.assertRaisesRegex(ValueError, "Other Buildings"):
            export_data.validate_event_category_changes(
                [{**self.original, "category": "Other Buildings"}], [self.original], []
            )

    def test_new_legacy_event_id_cannot_bypass_review_with_non_event_category(self) -> None:
        with self.assertRaisesRegex(ValueError, "Other Buildings"):
            export_data.validate_event_category_changes(
                [{**self.upgrade, "category": "Other Buildings"}], [], []
            )

    def test_non_event_reward_updates_do_not_require_event_reviews(self) -> None:
        records = [
            {"entityId": "W_MultiAge_GR27A2", "name": "Neo Carousel - Lv. 2", "category": "QI Rewards"},
            {"entityId": "W_MultiAge_GBG24A1", "name": "GBG reward", "category": "GBG Rewards"},
            {"entityId": "W_MultiAge_COP24A10TEMP", "name": "Ascended Yggdrasil", "category": "Cultural Settlement Rewards"},
        ]
        self.assertEqual(export_data.validate_event_category_changes(records, [], []), 0)

    def test_stat_updates_do_not_require_a_new_event_assignment(self) -> None:
        self.assertEqual(
            export_data.validate_event_category_changes(
                [{**self.original, "attrs": {"prod_resource_strategy_points": 75}}],
                [self.original], [],
            ),
            0,
        )

    def test_missing_source_is_not_an_approval(self) -> None:
        with self.assertRaisesRegex(ValueError, "supporting source URL"):
            export_data.validate_event_category_changes(
                [self.upgrade], [], [{**self.review, "source": "checked"}]
            )

    def test_missing_baseline_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(export_data, "city_age_data_paths", return_value={
                "json": str(Path(temp_dir) / "missing.json"),
            }):
                with self.assertRaisesRegex(ValueError, "baseline missing"):
                    export_data.check_event_categories([])

    def test_full_export_stops_before_writing_unreviewed_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            baseline = Path(temp_dir) / "baseline.json"
            baseline.write_text(json.dumps({"records": [self.original]}), encoding="utf-8")
            reviews = Path(temp_dir) / "reviews.json"
            reviews.write_text("[]", encoding="utf-8")
            records = {"SpaceAgeAsteroidBelt": [{
                "entity_id": self.upgrade["entityId"], "name": self.upgrade["name"],
            }]}
            with (
                patch.object(export_data, "export_fingerprint", return_value={}),
                patch.object(export_data, "matching_export_state", return_value=False),
                patch.object(export_data.model, "load_payload", return_value={"CityEntities": {}}),
                patch.object(export_data.model, "validate_building_category_corrections"),
                patch.object(export_data.model, "build_age_records", return_value=(records, [])),
                patch.object(export_data, "city_age_data_paths", return_value={"json": str(baseline)}),
                patch.object(export_data, "EVENT_CATEGORY_REVIEWS_FILE", str(reviews)),
                patch.object(export_data, "write_data_files") as write_assets,
                patch.object(export_data, "write_export_state") as write_state,
            ):
                with self.assertRaisesRegex(ValueError, "Event category review required"):
                    export_data.main()
                write_assets.assert_not_called()
                write_state.assert_not_called()

    def test_compression_cannot_mark_a_new_reference_as_reviewed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state = Path(temp_dir) / "state.json"
            state.write_text(json.dumps({"sourceSha256": "previous-ref"}), encoding="utf-8")
            with (
                patch.object(export_data, "data_paths", return_value={"state": str(state)}),
                patch.object(export_data, "export_fingerprint", return_value={"sourceSha256": "new-ref"}),
                patch.object(export_data, "atomic_write") as write_asset,
                patch.object(export_data, "write_export_state") as write_state,
            ):
                with self.assertRaisesRegex(SystemExit, "Run the full export"):
                    export_data.compress_existing_data()
                write_asset.assert_not_called()
                write_state.assert_not_called()

    def test_review_changes_invalidate_export_fingerprint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            reference = Path(temp_dir) / "reference.json"
            reference.write_text("{}", encoding="utf-8")
            reviews = Path(temp_dir) / "reviews.json"
            reviews.write_text("[]", encoding="utf-8")
            with patch.object(export_data, "EVENT_CATEGORY_REVIEWS_FILE", str(reviews)):
                before = export_data.export_fingerprint(str(reference))
                reviews.write_text(json.dumps([self.review]), encoding="utf-8")
                after = export_data.export_fingerprint(str(reference))
            self.assertNotEqual(before["eventCategoryReviewsSha256"], after["eventCategoryReviewsSha256"])


if __name__ == "__main__":
    unittest.main()
