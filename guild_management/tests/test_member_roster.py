from __future__ import annotations

import copy
import datetime as dt
import unittest

from member_roster import validate_roster


class MemberRosterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.today = dt.date(2026, 10, 28)
        self.payload = {"schemaVersion": 1, "guildName": "Guardians of Elysium", "timeZone": "America/New_York", "members": [
            {"id": "test-member", "name": "Test Member", "playerId": "123", "joinedOn": "2024-02-29", "status": "current"},
        ]}

    def test_valid_roster_drops_unpublished_fields(self) -> None:
        self.payload["members"][0]["privateNotes"] = "Not for publication"
        self.assertNotIn("privateNotes", validate_roster(self.payload, self.today)["members"][0])

    def test_unknown_date_stays_unknown(self) -> None:
        self.payload["members"][0]["joinedOn"] = None
        self.assertIsNone(validate_roster(self.payload, self.today)["members"][0]["joinedOn"])

    def test_invalid_and_future_dates_are_rejected(self) -> None:
        for value in ("2025-02-29", "2027-01-01", "2011-01-01", "2024-2-01", ""):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.payload["members"][0]["joinedOn"] = value
                validate_roster(self.payload, self.today)

    def test_former_member_departure_date_is_preserved(self) -> None:
        member = self.payload["members"][0]
        member.update(status="former", departedOn="2026-10-20")
        clean = validate_roster(self.payload, self.today)["members"][0]
        self.assertEqual(clean["joinedOn"], "2024-02-29")
        self.assertEqual(clean["departedOn"], "2026-10-20")
        del member["departedOn"]
        self.assertIsNone(validate_roster(self.payload, self.today)["members"][0]["departedOn"])

    def test_departure_dates_must_be_valid_and_within_membership(self) -> None:
        member = self.payload["members"][0]
        member["status"] = "former"
        for value in ("2025-02-29", "2027-01-01", "2011-01-01", "2024-02-28", "2026-2-01", "", 123):
            with self.subTest(value=value), self.assertRaises(ValueError):
                member["departedOn"] = value
                validate_roster(self.payload, self.today)
        member["departedOn"] = member["joinedOn"]
        self.assertEqual(validate_roster(self.payload, self.today)["members"][0]["departedOn"], member["joinedOn"])
        member["status"] = "current"
        with self.assertRaises(ValueError):
            validate_roster(self.payload, self.today)

    def test_duplicate_identity_and_player_id_are_rejected(self) -> None:
        duplicate = copy.deepcopy(self.payload["members"][0])
        self.payload["members"].append(duplicate)
        with self.assertRaises(ValueError):
            validate_roster(self.payload, self.today)
        duplicate["id"] = "another-id"
        with self.assertRaises(ValueError):
            validate_roster(self.payload, self.today)

    def test_roster_identity_and_membership_status_are_validated(self) -> None:
        self.payload["members"][0]["status"] = "maybe"
        with self.assertRaises(ValueError):
            validate_roster(self.payload, self.today)
        self.payload["members"][0]["status"] = "former"
        self.assertEqual(validate_roster(self.payload, self.today)["members"][0]["status"], "former")
        self.payload["guildName"] = "Another guild"
        with self.assertRaises(ValueError):
            validate_roster(self.payload, self.today)


if __name__ == "__main__":
    unittest.main()
