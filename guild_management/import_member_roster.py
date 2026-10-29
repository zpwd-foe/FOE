#!/usr/bin/env python3
"""Validate and import a roster JSON file into the shared portal source."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from member_roster import read_roster


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("roster", type=Path, help="Reviewed member roster JSON file")
    args = parser.parse_args()
    try:
        if args.roster.stat().st_size > 1024 * 1024:
            parser.error("The roster must be smaller than 1 MB.")
        roster = read_roster(args.roster)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    destination = Path(__file__).resolve().parent / "site/data/members.json"
    destination.write_text(json.dumps(roster, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(roster['members'])} members. Run python3 -B build_dashboard.py to rebuild the shared page.")


if __name__ == "__main__":
    main()
