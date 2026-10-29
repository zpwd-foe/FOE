"""Validate the shared anniversary roster; never infer join dates from activity."""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo


def validate_roster(payload: object, today: dt.date | None = None) -> dict:
    if not isinstance(payload, dict) or type(payload.get("schemaVersion")) is not int or payload.get("schemaVersion") != 1:
        raise ValueError("Expected a version 1 member roster.")
    if payload.get("guildName") != "Guardians of Elysium" or payload.get("timeZone") != "America/New_York":
        raise ValueError("The roster must belong to Guardians of Elysium and use America/New_York.")
    members = payload.get("members")
    if not isinstance(members, list) or len(members) > 1000:
        raise ValueError("The roster must contain a members list with at most 1,000 entries.")
    today = today or dt.datetime.now(ZoneInfo(payload["timeZone"])).date()
    ids: set[str] = set()
    player_ids: set[str] = set()
    clean = []
    for member in members:
        if not isinstance(member, dict):
            raise ValueError("Each member must be an object.")
        identity, name = member.get("id"), member.get("name")
        if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identity) or identity in ids:
            raise ValueError("Each member needs a unique ID (letters, digits, underscores or hyphens).")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
            raise ValueError("Each member needs a name of 1–100 characters.")
        tagline = member.get("tagline", "")
        if not isinstance(tagline, str) or len(tagline.strip()) > 200:
            raise ValueError("Guild taglines must be text of at most 200 characters.")
        player_id = member.get("playerId", "")
        if not isinstance(player_id, str) or (player_id and (not re.fullmatch(r"[1-9][0-9]{0,19}", player_id) or player_id in player_ids)):
            raise ValueError("Player IDs must be unique positive integers, stored as text.")
        joined = member.get("joinedOn")
        if joined is not None:
            if not isinstance(joined, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", joined):
                raise ValueError("Join dates must use YYYY-MM-DD, or null when unknown.")
            date = dt.date.fromisoformat(joined)
            if date < dt.date(2012, 1, 1) or date > today:
                raise ValueError("Join dates must be from 2012 onward and cannot be in the future.")
        status = member.get("status")
        if status not in ("current", "former"):
            raise ValueError("Member status must be current or former.")
        ids.add(identity)
        if player_id:
            player_ids.add(player_id)
        entry = {"id": identity, "name": name.strip(), "playerId": player_id, "joinedOn": joined, "status": status}
        if tagline.strip():
            entry["tagline"] = tagline.strip()
        clean.append(entry)
    return {"schemaVersion": 1, "guildName": payload["guildName"], "timeZone": payload["timeZone"], "members": clean}


def read_roster(path: Path) -> dict:
    return validate_roster(json.loads(path.read_text(encoding="utf-8")))
