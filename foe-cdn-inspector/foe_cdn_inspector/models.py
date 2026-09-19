from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class FileRecord:
    url: str
    change: str
    kind: str
    extension: str
    local_path: str | None = None
    content_type: str | None = None
    size: int | None = None
    sha256: str | None = None
    summary: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ParsedReport:
    report_id: str
    files: list[FileRecord] = field(default_factory=list)
    added_strings: list[str] = field(default_factory=list)
    removed_strings: list[str] = field(default_factory=list)
    added_buildings: list[dict[str, Any]] = field(default_factory=list)
    updated_buildings: list[dict[str, Any]] = field(default_factory=list)
    removed_buildings: list[str] = field(default_factory=list)
    metadata_families: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "report_id": self.report_id,
            "files": [record.to_dict() for record in self.files],
            "strings": {
                "added": self.added_strings,
                "removed": self.removed_strings,
            },
            "buildings": {
                "added": self.added_buildings,
                "updated": self.updated_buildings,
                "removed": self.removed_buildings,
            },
            "metadata_families": self.metadata_families,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ParsedReport":
        strings = payload.get("strings", {})
        buildings = payload.get("buildings", {})
        file_fields = set(FileRecord.__dataclass_fields__)
        return cls(
            report_id=payload["report_id"],
            files=[
                FileRecord(**{key: value for key, value in record.items() if key in file_fields})
                for record in payload.get("files", [])
            ],
            added_strings=strings.get("added", []),
            removed_strings=strings.get("removed", []),
            added_buildings=buildings.get("added", []),
            updated_buildings=buildings.get("updated", []),
            removed_buildings=buildings.get("removed", []),
            metadata_families=payload.get("metadata_families", []),
        )
