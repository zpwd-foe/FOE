import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from foe_cdn_inspector.html_report import (
    _active_string_row,
    _best_history_image_variants,
    _current_great_building_bonus_images,
    _great_building_bonus_section,
    _history_file,
    _history_section,
    _history_type_date,
    _image_asset_key,
    _image_family_key,
    _image_resolution_rank,
    _latest_image_urls,
    write_html,
)
from foe_cdn_inspector.models import ParsedReport


class HistoryImageTests(unittest.TestCase):
    def test_image_asset_key_ignores_content_hash(self):
        first = "https://cdn.example/assets/picture-12345678a.png"
        second = "https://cdn.example/assets/picture-abcdef012.png"
        self.assertEqual(_image_asset_key(first), _image_asset_key(second))

    def test_latest_image_prefers_live_replacement_from_newest_report(self):
        old = "https://cdn.example/assets/picture-12345678a.png"
        current = "https://cdn.example/assets/picture-abcdef012.png"
        reports = [
            {
                "files": [
                    {"kind": "image", "change": "removed", "url": old},
                    {"kind": "image", "change": "updated", "url": current},
                ]
            },
            {"files": [{"kind": "image", "change": "added", "url": old}]},
        ]
        self.assertEqual(_latest_image_urls(reports)[_image_asset_key(old)], current)

    def test_removed_image_is_not_rendered_as_live_img(self):
        record = {
            "kind": "image",
            "change": "removed",
            "url": "https://cdn.example/assets/picture-12345678a.png",
        }
        rendered = _history_file(record)
        self.assertNotIn("<img", rendered)
        self.assertIn("Removed from the CDN", rendered)

    def test_removed_non_image_asset_has_no_link(self):
        rendered = _history_file(
            {
                "kind": "text",
                "change": "removed",
                "url": "https://cdn.example/assets/config-12345678a.json",
            }
        )
        self.assertNotIn("<a ", rendered)
        self.assertIn("config-12345678a.json", rendered)

    def test_historical_image_gets_latest_version_fallback(self):
        old = "https://cdn.example/assets/picture-12345678a.png"
        current = "https://cdn.example/assets/picture-abcdef012.png"
        rendered = _history_file(
            {"kind": "image", "change": "updated", "url": old},
            latest_images={_image_asset_key(old): current},
        )
        self.assertIn(f'data-fallback-src="{current}"', rendered)

    def test_bonus_image_variants_share_a_family(self):
        large = "https://cdn.example/assets/city/gui/great_building_bonus_icons/great_building_bonus_allies_quest_boost-3f106ad4b.png"
        small = "https://cdn.example/assets/shared/icons/boost_icon_bonus_allies_quest_boost-5f29f2ca8.png"
        self.assertEqual(_image_family_key(large), _image_family_key(small))

    def test_icon_bonus_variant_shares_great_building_family(self):
        large = "https://cdn.example/assets/city/gui/great_building_bonus_icons/great_building_bonus_guild_goods_next_era-3f106ad4b.png"
        small = "https://cdn.example/assets/shared/icons/icon_bonus_guild_goods_next_era-5f29f2ca8.png"
        self.assertEqual(_image_family_key(large), _image_family_key(small))

    def test_explicit_size_beats_misleading_large_directory_name(self):
        explicit = "https://cdn.example/assets/shared/icons/goods_100x100/fine_stel_void_shard-12345678a.png"
        large = "https://cdn.example/assets/shared/icons/goods_large/fine_stel_void_shard-abcdef012.png"
        self.assertGreater(_image_resolution_rank(explicit), _image_resolution_rank(large))

    def test_only_best_resolution_image_variant_is_kept(self):
        records = [
            {
                "kind": "image",
                "change": "added",
                "url": "https://cdn.example/assets/shared/icons/boost_icon_bonus_allies_quest_boost-5f29f2ca8.png",
            },
            {
                "kind": "image",
                "change": "added",
                "url": "https://cdn.example/assets/city/gui/great_building_bonus_icons/great_building_bonus_allies_quest_boost-3f106ad4b.png",
            },
        ]
        selected = _best_history_image_variants(records)
        self.assertEqual(len(selected), 1)
        self.assertIn("great_building_bonus_allies", selected[0][0]["url"])
        self.assertEqual(selected[0][1], 2)

    def test_live_variant_is_preferred_over_removed_larger_variant(self):
        records = [
            {
                "kind": "image",
                "change": "removed",
                "url": "https://cdn.example/assets/city/gui/great_building_bonus_icons/great_building_bonus_allies_quest_boost-3f106ad4b.png",
            },
            {
                "kind": "image",
                "change": "updated",
                "url": "https://cdn.example/assets/shared/gui/boost/boost_icon_bonus_allies_quest_boost-5f29f2ca8.png",
            },
        ]
        selected = _best_history_image_variants(records)
        self.assertEqual(selected[0][0]["change"], "updated")


class HistoryOrganizationTests(unittest.TestCase):
    def test_dashboard_has_requested_signature_and_no_source_reference(self):
        with TemporaryDirectory() as folder:
            destination = Path(folder)
            write_html(
                ParsedReport(report_id="2026-09-17_11-16-22"),
                destination,
                {"bootstrap": {"market_id": "zz"}},
            )
            rendered = (destination / "index.html").read_text(encoding="utf-8")

        self.assertIn("Another zpwd dashboard.", rendered)
        self.assertIn("Sleep deprived mode.", rendered)
        self.assertNotIn("linnun.net", rendered)

    def test_bonus_icons_precede_latest_description_text_and_stats_are_reduced(self):
        with TemporaryDirectory() as folder:
            destination = Path(folder)
            write_html(
                ParsedReport(report_id="2026-09-17_11-16-22"),
                destination,
                {"bootstrap": {"market_id": "zz"}},
                string_results={
                    "active_strings": [
                        {"last_added_date": "2026-09-17", "text": "GBP|Example"}
                    ],
                    "reports_scanned": 1,
                    "removal_events": [],
                    "since": "2026-03-01",
                },
                history_results={"reports": [], "reports_count": 0},
            )
            rendered = (destination / "index.html").read_text(encoding="utf-8")

        self.assertLess(
            rendered.index('id="great-building-bonuses"'),
            rendered.index('id="active-strings"'),
        )
        self.assertIn("Latest Great Building bonus descriptions", rendered)
        self.assertIn('class="stats stats-2"', rendered)
        self.assertIn("Dates with bonus updates", rendered)
        self.assertIn("Reports scanned", rendered)
        self.assertIn("Bonus icons", rendered)
        self.assertIn("60-day change history", rendered)
        self.assertIn("const visibleDateKeys=new Set()", rendered)
        self.assertIn("visibleDateKeys.add(dateGroup.dataset.date)", rendered)
        self.assertNotIn("Live GBP strings", rendered)
        self.assertNotIn("Retired strings", rendered)
        self.assertNotIn("dispatch dates", rendered)

    def test_snapshot_is_grouped_by_type_before_date(self):
        results = {
            "since": "2026-08-01",
            "until": "2026-09-29",
            "reports_count": 1,
            "reports": [
                {
                    "date": "2026-09-17",
                    "report_url": "https://example.test/report",
                    "files": [
                        {
                            "kind": "image",
                            "change": "added",
                            "url": "https://cdn.example/image-12345678a.png",
                        },
                        {
                            "kind": "text",
                            "change": "updated",
                            "url": "https://cdn.example/config-12345678a.json",
                        },
                    ],
                    "strings": {"added": ["GBP|Example"], "removed": []},
                    "buildings": {"added": [], "updated": [], "removed": []},
                    "metadata_families": ["boosts"],
                    "metadata_files": [],
                }
            ],
        }
        rendered = _history_section(results)
        self.assertLess(rendered.index('data-history-type="images"'), rendered.index('data-history-type="strings"'))
        self.assertIn('data-history-filter="text"', rendered)
        self.assertIn('data-history-type="images" open', rendered)
        self.assertNotIn('class="history-report"', rendered)
        self.assertNotIn("example.test/report", rendered)
        self.assertNotIn("open source report", rendered)

    def test_empty_dates_are_omitted_from_a_type(self):
        report = {
            "date": "2026-09-17",
            "files": [{"kind": "image", "change": "added", "url": "https://cdn.example/image-12345678a.png"}],
        }
        rendered, count, hidden = _history_type_date(report, "audio")
        self.assertEqual((rendered, count, hidden), ("", 0, 0))

    def test_active_string_row_has_no_source_link(self):
        rendered = _active_string_row(
            {
                "last_added_date": "2026-09-17",
                "text": "GBP|Example",
                "report_url": "https://www.linnun.net/example",
            }
        )
        self.assertNotIn("linnun.net", rendered)
        self.assertNotIn("View report", rendered)


class GreatBuildingBonusGalleryTests(unittest.TestCase):
    def test_gallery_keeps_highest_resolution_current_variant(self):
        large = "https://cdn.example/assets/city/gui/great_building_bonus_icons/great_building_bonus_allies_quest_boost-abcdef012.png"
        small = "https://cdn.example/assets/shared/icons/boost_icon_bonus_allies_quest_boost-abcdef012.png"
        reports = [
            {
                "date": "2026-08-27",
                "report_url": "https://example.test/new",
                "files": [
                    {"kind": "image", "change": "updated", "url": large},
                    {"kind": "image", "change": "updated", "url": small},
                ],
            }
        ]
        images = _current_great_building_bonus_images(reports)
        self.assertEqual(len(images), 1)
        self.assertEqual(images[0]["url"], large)
        self.assertEqual(images[0]["variant_count"], 2)

    def test_gallery_excludes_path_whose_latest_state_is_removed(self):
        image = "https://cdn.example/assets/city/gui/great_building_bonus_icons/great_building_bonus_second_strike-abcdef012.png"
        reports = [
            {"date": "2026-09-01", "files": [{"kind": "image", "change": "removed", "url": image}]},
            {"date": "2026-08-01", "files": [{"kind": "image", "change": "added", "url": image}]},
        ]
        self.assertEqual(_current_great_building_bonus_images(reports), [])

    def test_gallery_section_has_embedded_images_and_search(self):
        results = {
            "reports": [
                {
                    "date": "2026-08-27",
                    "files": [
                        {
                            "kind": "image",
                            "change": "updated",
                            "url": "https://cdn.example/assets/city/gui/great_building_bonus_icons/great_building_bonus_allies_quest_boost-abcdef012.png",
                        }
                    ],
                }
            ]
        }
        rendered = _great_building_bonus_section(results)
        self.assertIn('id="great-building-bonuses"', rendered)
        self.assertIn('id="bonus-search"', rendered)
        self.assertIn('class="bonus-image"', rendered)


if __name__ == "__main__":
    unittest.main()
