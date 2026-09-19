import unittest
from datetime import date

from foe_cdn_inspector.network import probe_bootstrap
from foe_cdn_inspector.models import ParsedReport
from foe_cdn_inspector.history import select_index_entries
from foe_cdn_inspector.storage import safe_relative_path
from foe_cdn_inspector.strings import reduce_string_changes, select_report_ids
from foe_cdn_inspector.tracker import (
    classify_url,
    parse_index_entries,
    parse_report,
    parse_string_changes,
    report_ids,
)


class TrackerTests(unittest.TestCase):
    def test_report_ids_preserve_newest_first(self):
        source = 'reportId: "2026-09-17_11-16-22"; reportId: "2026-09-11_11-16-02"'
        self.assertEqual(
            report_ids(source),
            ["2026-09-17_11-16-22", "2026-09-11_11-16-02"],
        )

    def test_parses_index_counts_and_selects_date_range(self):
        source = '''<script>const entries = {
        "2026-08-02": [{reportId:"2026-08-02_11-00-00",assets:{added:2,updated:1,removed:0},strings:{added:1,removed:0}}],
        "2026-07-31": [{reportId:"2026-07-31_11-00-00",assets:{added:9,updated:0,removed:0},strings:{added:0,removed:0}}]
        };</script>'''
        entries = parse_index_entries(source)
        self.assertEqual(entries[0]["assets"]["added"], 2)
        self.assertEqual(select_index_entries(entries, date(2026, 8, 1)), entries[:1])

    def test_classifies_metadata_query_as_json(self):
        kind, extension = classify_url(
            "https://foezz.innogamescdn.com/start/metadata?id=building_entity_example-hash"
        )
        self.assertEqual((kind, extension), ("metadata", ".json"))

    def test_safe_metadata_path(self):
        result = safe_relative_path(
            "https://foezz.innogamescdn.com/start/metadata?id=building_entity_W_Test-123"
        )
        self.assertEqual(
            result.as_posix(),
            "start/metadata/building_entity_W_Test-123.json",
        )

    def test_bootstrap_parser_handles_semicolons_inside_strings(self):
        source = '<script>var ONELPS_RUNTIME_CONFIG = {"config":{"marketId":"zz","snippet":"a;b"}};</script>'
        self.assertEqual(probe_bootstrap(source, "https://zz1.example")["market_id"], "zz")

    def test_parses_assets_strings_and_building_summary(self):
        source = """
        <a id='added-assets'></a><a href='https://foezz.innogamescdn.com/assets/a.png'>a</a>
        <a id='updated-assets'></a><a href='https://foezz.innogamescdn.com/assets/a.json'>j</a>
        <a id='added-strings'></a><a href='Hello'>Hello world</a>
        <h3 id='added-buildings'>Added</h3><details><summary>building_entity_X</summary>
        <pre class='rawjson'>{"id":"X","name":"Test","components":{"AllAge":{"placement":{"size":{"x":2,"y":3}}},"IronAge":{}}}</pre></details>
        <h3 id='staticdata-changes'>Metadata</h3><details><summary>building_lookup</summary></details>
        "new_value": "https://foezz.innogamescdn.com/start/metadata?id=building_entity_X-123"
        """
        report = parse_report("test", source)
        self.assertEqual(len(report.files), 3)
        self.assertEqual(report.added_strings, ["Hello world"])
        self.assertEqual(report.added_buildings[0]["size"], {"x": 2, "y": 3})
        self.assertEqual(report.metadata_families, ["building_lookup"])

    def test_strings_only_parser(self):
        source = """
        <a id='added-strings'></a><ul><li><a href='x'>GBP|Still here</a></li></ul>
        <a id='removed-strings'></a><ul><li><a href='x'>GBP|Gone</a></li></ul>
        <h3 id='added-buildings'>large tail omitted</h3>
        """
        self.assertEqual(parse_string_changes(source), (["GBP|Still here"], ["GBP|Gone"]))

    def test_string_history_applies_removal_and_readdition(self):
        ids = ["2026-03-04_00-00-00", "2026-03-03_00-00-00", "2026-03-02_00-00-00"]
        changes = {
            ids[2]: (["GBP|Readded", "GBP|Gone", "FFAA|Ignore"], []),
            ids[1]: ([], ["GBP|Readded", "GBP|Gone"]),
            ids[0]: (["GBP|Readded"], []),
        }
        active, removals = reduce_string_changes(ids, changes, "GBP|")
        self.assertEqual([entry.text for entry in active], ["GBP|Readded"])
        self.assertEqual(active[0].last_added_report, ids[0])
        self.assertEqual(len(removals), 2)

    def test_select_report_ids_uses_inclusive_dates(self):
        ids = ["2026-03-02_00-00-00", "2026-03-01_00-00-00", "2026-02-28_00-00-00"]
        self.assertEqual(select_report_ids(ids, date(2026, 3, 1)), ids[:2])

    def test_report_round_trip_from_inventory_shape(self):
        original = parse_report(
            "2026-01-01_00-00-00",
            "<a id='added-assets'></a><a href='https://foezz.innogamescdn.com/assets/a.png'>a</a>",
        )
        restored = ParsedReport.from_dict(original.to_dict())
        self.assertEqual(restored.report_id, original.report_id)
        self.assertEqual(restored.files[0].url, original.files[0].url)


if __name__ == "__main__":
    unittest.main()
