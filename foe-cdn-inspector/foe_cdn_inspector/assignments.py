"""Import saved beta metadata and join GB/tier records to client bonus icons."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from pathlib import Path

from .network import validate_cdn_url


def load_building_metadata(folder: Path) -> dict:
    """Verify a captured metadata bundle before importing assignment fields only."""
    manifest = json.loads((folder / 'capture-manifest.json').read_text(encoding='utf-8'))
    if manifest.get('market') != 'zz' or manifest.get('download_failures') != []:
        raise ValueError('building metadata must be a complete beta capture')
    datetime.fromisoformat(manifest['captured_at_utc'])
    date.fromisoformat(manifest['local_date'])
    buildings, seen = [], set()
    for record in manifest['files']:
        relative = Path(record['file'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('unsafe building metadata path')
        if not relative.parts or relative.parts[0] != 'great_building_metadata':
            continue
        validate_cdn_url(record['url'])
        body = (folder / relative).read_bytes()
        if hashlib.sha256(body).hexdigest() != record['sha256']:
            raise ValueError('building metadata hash mismatch: ' + relative.name)
        building = json.loads(body)
        identifier = building.get('id', '')
        if (building.get('type') != 'greatbuilding' or not re.fullmatch(r'X_[A-Za-z0-9_]+', identifier)
                or identifier in seen or not isinstance(building.get('name'), str) or not building['name']):
            raise ValueError('invalid or duplicate Great Building metadata')
        seen.add(identifier)
        bonuses = []
        for group in building['bonuses']:
            tier = group['tier']['value']
            if tier not in ('copper', 'silver', 'gold'):
                raise ValueError('unrecognized GB tier: ' + str(tier))
            for bonus in group['bonuses']:
                kind, target = bonus['type'], bonus['targetedFeature']
                multiplier = bonus.get('isBonusMultiplier', False)
                if not isinstance(kind, str) or not isinstance(target, str) or not isinstance(multiplier, bool):
                    raise ValueError('invalid GB bonus assignment')
                bonuses.append({'tier': tier, 'type': kind, 'target': target, 'multiplier': multiplier})
        buildings.append({'id': identifier, 'name': building['name'], 'bonuses': bonuses,
                          'source_url': record['url'], 'sha256': record['sha256']})
    if not buildings or len(buildings) != manifest['great_building_count']:
        raise ValueError('building metadata capture is incomplete')
    return {'captured_at': manifest['captured_at_utc'], 'local_date': manifest['local_date'],
            'market': 'zz', 'world': manifest['world'], 'client_sha256': manifest['paired_client_sha256'],
            'buildings': sorted(buildings, key=lambda b: b['id'])}


def building_assignments(pairings: list[dict], metadata: dict | None, client_sha256: str) -> dict:
    """Match type, battle mode and multiplier; never infer a GB from its name."""
    if not metadata:
        return {}
    records = []
    for building in metadata['buildings']:
        for bonus in building['bonuses']:
            for pairing in pairings:
                if bonus['type'] not in pairing['bonus_types']:
                    continue
                if 'target' in pairing and (pairing['target'] != bonus['target']
                                           or pairing['multiplier'] != bonus['multiplier']):
                    continue
                records.append({'building_id': building['id'], 'building_name': building['name'],
                                'tier': bonus['tier'], 'bonus_type': bonus['type'],
                                'icon_ids': pairing['icon_ids']})
    return {'captured_at': metadata['captured_at'], 'local_date': metadata['local_date'],
            'building_count': len(metadata['buildings']),
            'client_matches_capture': metadata['client_sha256'] == client_sha256, 'records': records}
