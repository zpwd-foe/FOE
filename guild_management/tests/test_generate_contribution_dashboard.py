from __future__ import annotations

import csv
import datetime as dt
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from generate_contribution_dashboard import (
    REQUIRED_COLUMNS,
    TRANSACTION_ID_COLUMN,
    append_audited_rows,
    audit_inventory_delta,
    build_payload,
    cached_audit_matches,
    inventory_backed_duplicate_indexes,
    main,
    merge_exports,
    read_existing_payload,
    without_audited_duplicates,
)


class ContributionMergeTests(unittest.TestCase):
    def write_export(
        self,
        path: Path,
        rows: list[list[str]],
        *,
        include_transaction_id: bool = False,
    ) -> None:
        columns = list(REQUIRED_COLUMNS)
        if include_transaction_id:
            columns.append(TRANSACTION_ID_COLUMN)
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle, delimiter=";", lineterminator="\n")
            writer.writerow(columns)
            writer.writerows(rows)

    @staticmethod
    def row(
        *,
        name: str = "Clipper",
        amount: int = 5,
        good: str = "Xenocrystals",
        timestamp: str = "8/26/2026 8:00:00 PM",
    ) -> list[str]:
        return [
            "853996216",
            name,
            "24 - Stellar Age Discovery",
            good,
            str(amount),
            "Guild treasury donation",
            timestamp,
        ]

    @staticmethod
    def write_treasury(path: Path, values: list[int]) -> None:
        goods = [
            "Xenocrystals",
            "Glyph Circuits",
            "Metamorphic Alloys",
            "Resonance Cores",
            "Psionic Conduits",
        ]
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter=";", lineterminator="\n")
            writer.writerow(["DateTime", *goods])
            writer.writerow(["2026-08-26 00:00:00", *values])

    @staticmethod
    def production_batch(amounts: list[int]) -> list[list[str]]:
        goods = [
            "Glyph Circuits",
            "Metamorphic Alloys",
            "Psionic Conduits",
            "Resonance Cores",
            "Xenocrystals",
        ]
        return [
            [
                "19531771",
                "JOsborne32",
                "24 - Stellar Age Discovery",
                good,
                str(amount),
                "Building production",
                "8/26/2026 9:35:00 PM",
            ]
            for good, amount in zip(goods, amounts, strict=True)
        ]

    def test_preserves_repeated_identical_rows_within_one_legacy_export(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "GuildTreasury-2026-08-26.csv"
            self.write_export(path, [self.row() for _ in range(9)])

            rows, overlap_count = merge_exports([path])

        self.assertEqual(len(rows), 9)
        self.assertEqual(sum(int(row["amount"]) for row in rows), 45)
        self.assertEqual(overlap_count, 0)

    def test_uses_maximum_occurrence_count_across_legacy_snapshots(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "GuildTreasury-2026-08-26.csv"
            second = Path(directory) / "GuildTreasury-2026-08-27.csv"
            self.write_export(first, [self.row(name="Old name") for _ in range(9)])
            self.write_export(second, [self.row(name="Current name") for _ in range(10)])

            rows, overlap_count = merge_exports([first, second])

        self.assertEqual(len(rows), 10)
        self.assertEqual(overlap_count, 9)
        self.assertEqual({str(row["playerName"]) for row in rows}, {"Current name"})

    def test_exact_transaction_ids_deduplicate_within_and_across_exports(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "GuildTreasury-2026-08-26.csv"
            second = Path(directory) / "GuildTreasury-2026-08-27.csv"
            repeated = [*self.row(), "log-1"]
            distinct = [*self.row(), "log-2"]
            self.write_export(
                first,
                [repeated, repeated],
                include_transaction_id=True,
            )
            self.write_export(
                second,
                [repeated, distinct],
                include_transaction_id=True,
            )

            rows, overlap_count = merge_exports([first, second])

        self.assertEqual(len(rows), 2)
        self.assertEqual(overlap_count, 2)
        self.assertEqual(
            {str(row["transactionId"]) for row in rows},
            {"log-1", "log-2"},
        )

    def test_closed_history_baseline_replaces_unstable_legacy_multiplicity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / "baseline.csv"
            current = Path(directory) / "current.csv"
            self.write_export(baseline, [self.row() for _ in range(5)])
            self.write_export(
                current,
                [
                    *[self.row() for _ in range(7)],
                    self.row(timestamp="8/26/2026 9:00:00 PM"),
                ],
            )

            rows, overlap_count = merge_exports(
                [current],
                closed_history_baseline=baseline,
            )

        self.assertEqual(len(rows), 6)
        self.assertEqual(sum(int(row["amount"]) for row in rows), 30)
        self.assertEqual(overlap_count, 2)

    def test_audits_inventory_delta_for_every_good(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline_contribution = root / "baseline-contribution.csv"
            current_contribution = root / "current-contribution.csv"
            baseline_treasury = root / "baseline-treasury.csv"
            current_treasury = root / "current-treasury.csv"
            self.write_export(baseline_contribution, [self.row()])
            self.write_export(
                current_contribution,
                [
                    self.row(),
                    self.row(timestamp="8/26/2026 9:00:00 PM"),
                ],
            )
            self.write_treasury(baseline_treasury, [100, 100, 100, 100, 100])
            self.write_treasury(current_treasury, [105, 100, 100, 100, 100])

            audit = audit_inventory_delta(
                baseline_contribution,
                current_contribution,
                baseline_treasury,
                current_treasury,
            )

        self.assertEqual(audit["status"], "passed")
        self.assertEqual(audit["goodsChecked"], 5)
        self.assertEqual(audit["agesChecked"], 1)

    def test_rejects_any_per_good_inventory_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline_contribution = root / "baseline-contribution.csv"
            current_contribution = root / "current-contribution.csv"
            baseline_treasury = root / "baseline-treasury.csv"
            current_treasury = root / "current-treasury.csv"
            self.write_export(baseline_contribution, [self.row()])
            self.write_export(
                current_contribution,
                [
                    self.row(),
                    self.row(timestamp="8/26/2026 9:00:00 PM"),
                ],
            )
            self.write_treasury(baseline_treasury, [100, 100, 100, 100, 100])
            self.write_treasury(current_treasury, [106, 100, 100, 100, 100])

            with self.assertRaisesRegex(
                ValueError,
                r"failed for 1 of 5 goods.*Xenocrystals \(\+1\)",
            ):
                audit_inventory_delta(
                    baseline_contribution,
                    current_contribution,
                    baseline_treasury,
                    current_treasury,
                )

    def test_retains_mixed_production_only_when_all_goods_reconcile(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline_contribution = root / "baseline-contribution.csv"
            current_contribution = root / "current-contribution.csv"
            baseline_treasury = root / "baseline-treasury.csv"
            current_treasury = root / "current-treasury.csv"
            baseline_row = self.row()
            mixed_batch = self.production_batch([180, 480, 180, 180, 180])
            self.write_export(baseline_contribution, [baseline_row])
            self.write_export(current_contribution, [baseline_row, *mixed_batch])
            self.write_treasury(baseline_treasury, [100, 100, 100, 100, 100])
            self.write_treasury(current_treasury, [280, 280, 580, 280, 280])

            audit = audit_inventory_delta(
                baseline_contribution,
                current_contribution,
                baseline_treasury,
                current_treasury,
            )
            baseline_rows, _ = merge_exports([baseline_contribution])
            rows = append_audited_rows(
                build_payload(baseline_rows, "GoE"),
                current_contribution,
                dt.datetime(2026, 8, 26, 20, 0),
                keep_mixed_production=bool(audit["retainedMixedProductionRows"]),
            )
            self.assertEqual(audit["retainedMixedProductionRows"], 5)
            self.assertEqual(len(rows), 6)
            self.assertEqual(sum(int(row["amount"]) for row in rows), 1205)
            rebuilt_rows, _ = merge_exports(
                [baseline_contribution, current_contribution],
                keep_latest_mixed_production_after=dt.datetime(2026, 8, 26, 20, 0),
            )
            self.assertEqual(len(rebuilt_rows), 6)

            self.write_treasury(current_treasury, [280, 280, 581, 280, 280])
            with self.assertRaisesRegex(ValueError, "All-goods inventory audit failed"):
                audit_inventory_delta(
                    baseline_contribution,
                    current_contribution,
                    baseline_treasury,
                    current_treasury,
                )

    def test_extends_canonical_history_without_reopening_old_multiplicity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            current = Path(directory) / "current.csv"
            self.write_export(
                current,
                [
                    *[self.row() for _ in range(7)],
                    self.row(timestamp="8/26/2026 9:00:00 PM"),
                ],
            )
            baseline_rows = [
                {
                    "timestamp": dt.datetime(2026, 8, 26, 20, 0),
                    "playerId": "853996216",
                    "playerName": "Clipper",
                    "era": "24 - Stellar Age Discovery",
                    "good": "Xenocrystals",
                    "amount": 5,
                    "message": "Guild treasury donation",
                    "transactionId": "",
                }
                for _ in range(5)
            ]
            payload = build_payload(baseline_rows, "GoE")

            rows = append_audited_rows(
                payload,
                current,
                dt.datetime(2026, 8, 26, 20, 0),
            )

        self.assertEqual(len(rows), 6)
        self.assertEqual(sum(int(row["amount"]) for row in rows), 30)

    def test_keeps_positive_and_negative_rows_separate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "GuildTreasury-2026-08-26.csv"
            self.write_export(path, [self.row(amount=5), self.row(amount=-5)])

            rows, overlap_count = merge_exports([path])

        self.assertEqual({int(row["amount"]) for row in rows}, {-5, 5})
        self.assertEqual(overlap_count, 0)

    def test_inventory_backed_correction_is_applied_and_cached_without_editing_csv(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = root / "guild-goods-contribution"
            sources.mkdir()
            baseline = sources / "GuildTreasury-2026-08-26.csv"
            current = sources / "GuildTreasury-2026-08-27.csv"
            baseline_treasury = root / "stats-2026-08-26.csv"
            current_treasury = root / "stats-2026-08-27.csv"
            output = root / "contribution-data.js"
            batch = self.production_batch([3] * 5)
            head = self.row(amount=7, timestamp="8/26/2026 10:00:00 PM")
            self.write_export(baseline, [self.row()])
            self.write_export(current, [head, *batch, *batch, self.row()])
            self.write_treasury(baseline_treasury, [100] * 5)
            self.write_treasury(current_treasury, [110, 103, 103, 103, 103])
            original_csv = current.read_bytes()

            argv = ["generate_contribution_dashboard.py", "--input-dir", str(sources), "--output", str(output)]
            with mock.patch("sys.argv", argv), mock.patch("generate_contribution_dashboard.publish_dashboard", return_value={}):
                main()
                first_payload = output.read_bytes()
                main()
                self.assertEqual(output.read_bytes(), first_payload)
            payload = read_existing_payload(output)
            self.assertTrue(cached_audit_matches(payload, current, current_treasury))
            audit = payload["meta"]["inventoryAudit"]
            self.assertEqual(audit["removedDuplicateProductionRows"], 5)
            self.assertEqual(len(payload["records"]), 7)
            self.assertEqual(payload["meta"]["duplicateRecordCount"], 6)
            self.assertEqual(current.read_bytes(), original_csv)

            baseline_rows, _ = merge_exports([baseline])
            appended = append_audited_rows(
                build_payload(baseline_rows, "GoE"), current,
                dt.datetime(2026, 8, 26, 20),
                duplicate_indexes=audit["duplicateProductionRowIndexes"],
            )
            self.assertEqual(len(appended), 7)
            self.assertEqual(sum(int(row["amount"]) for row in appended), 27)

            # The next day's overlapping raw export must not reintroduce the
            # corrected historical fragment into the canonical payload.
            following = sources / "GuildTreasury-2026-08-28.csv"
            self.write_export(following, [
                self.row(amount=7, timestamp="8/27/2026 10:00:00 PM"),
                head, *batch, *batch, self.row(),
            ])
            self.write_treasury(root / "stats-2026-08-28.csv", [117, 103, 103, 103, 103])
            with mock.patch("sys.argv", argv), mock.patch("generate_contribution_dashboard.publish_dashboard", return_value={}):
                main()
            extended = read_existing_payload(output)
            self.assertEqual(len(extended["records"]), 8)
            self.assertEqual(extended["records"][1:], payload["records"])

            # Genuine repeated production remains when inventory supports both.
            self.write_treasury(current_treasury, [113, 106, 106, 106, 106])
            valid = audit_inventory_delta(baseline, current, baseline_treasury, current_treasury)
            self.assertEqual(valid["removedDuplicateProductionRows"], 0)

            # A near-match is still a failure, not a tolerance or forced balance.
            self.write_treasury(current_treasury, [111, 103, 103, 103, 103])
            with self.assertRaisesRegex(ValueError, "All-goods inventory audit failed"):
                audit_inventory_delta(baseline, current, baseline_treasury, current_treasury)

    def test_removes_only_malformed_mixed_amount_production_batch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "GuildTreasury-2026-08-27.csv"
            source_rows = [
                *self.production_batch([66, 66, 66, 66, 66]),
                *self.production_batch([66, 60, 60, 60, 60]),
                *self.production_batch([60, 60, 60, 60, 60]),
            ]
            self.write_export(path, source_rows)

            rows, overlap_count = merge_exports([path])

        self.assertEqual(len(rows), 10)
        self.assertEqual(overlap_count, 5)
        self.assertEqual(sum(int(row["amount"]) for row in rows), 630)


class DuplicateFragmentTests(unittest.TestCase):
    cutoff = dt.datetime(2026, 9, 18, 20, 17)

    def setUp(self) -> None:
        self.fragment = [
            {
                "timestamp": dt.datetime(2026, 9, 19, 17, 9),
                "playerId": "test-player",
                "playerName": "Example",
                "era": "Oceanic Future" if good in {"Pearls", "Plankton"} else "Virtual Future",
                "good": good, "amount": 3, "message": "Building production", "transactionId": "",
            }
            for good in ("Cryptocash", "Nanites", "Pearls", "Plankton", "Tea Silk")
        ]
        self.head = {**self.fragment[0], "timestamp": dt.datetime(2026, 9, 19, 19, 56)}
        self.mismatches = [{"good": row["good"], "difference": -3} for row in self.fragment]

    def rows(self) -> list[dict[str, object]]:
        return [self.head.copy(), *[row.copy() for row in self.fragment], *[row.copy() for row in self.fragment]]

    def test_detects_same_amount_cross_age_fragment(self) -> None:
        rows = self.rows()
        indexes = inventory_backed_duplicate_indexes(rows, self.cutoff, self.mismatches)
        self.assertEqual(indexes, [6, 7, 8, 9, 10])
        self.assertEqual(len(without_audited_duplicates(rows, indexes)), 6)

    def test_keeps_repeated_rows_when_inventory_already_balances(self) -> None:
        self.assertEqual(inventory_backed_duplicate_indexes(self.rows(), self.cutoff, []), [])

    def test_rejects_ambiguous_players_or_timestamps(self) -> None:
        for changes in ({"playerId": "another-player"}, {"timestamp": dt.datetime(2026, 9, 19, 16)}):
            with self.subTest(changes=changes):
                other = [{**row, **changes} for row in self.fragment]
                rows = [*self.rows(), *other, *[row.copy() for row in other]]
                self.assertEqual(inventory_backed_duplicate_indexes(rows, self.cutoff, self.mismatches), [])

    def test_does_not_drop_identified_transactions_donations_or_usage(self) -> None:
        for changes in ({"transactionId": "real-transaction"}, {"message": "Guild treasury donation"}, {"amount": -3}):
            with self.subTest(changes=changes):
                rows = [{**row, **changes} for row in self.rows()]
                self.assertEqual(inventory_backed_duplicate_indexes(rows, self.cutoff, self.mismatches), [])

    def test_does_not_correct_capture_boundaries(self) -> None:
        for timestamp in (self.cutoff, self.head["timestamp"]):
            with self.subTest(timestamp=timestamp):
                rows = [self.head, *[{**row, "timestamp": timestamp} for row in self.rows()[1:]]]
                self.assertEqual(inventory_backed_duplicate_indexes(rows, self.cutoff, self.mismatches), [])

    def test_requires_exact_all_goods_balance(self) -> None:
        for difference in (1, -2, -4):
            with self.subTest(difference=difference):
                mismatches = [{**item, "difference": difference} for item in self.mismatches]
                self.assertEqual(inventory_backed_duplicate_indexes(self.rows(), self.cutoff, mismatches), [])

    def test_requires_a_contiguous_fragment_with_a_prior_copy(self) -> None:
        self.assertEqual(inventory_backed_duplicate_indexes([self.head, *self.fragment], self.cutoff, self.mismatches), [])
        rows = self.rows()
        rows.insert(8, {**self.head, "good": "unrelated-good"})
        self.assertEqual(inventory_backed_duplicate_indexes(rows, self.cutoff, self.mismatches), [])

    def test_rejects_invalid_recorded_indexes(self) -> None:
        for indexes in ([-1], [100], [6, 6]):
            with self.subTest(indexes=indexes), self.assertRaisesRegex(ValueError, "indexes are invalid"):
                without_audited_duplicates(self.rows(), indexes)


if __name__ == "__main__":
    unittest.main()
