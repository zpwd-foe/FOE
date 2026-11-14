#!/usr/bin/env python3
"""Import only boost values and attempt limits from a saved Google Sheets export."""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

from import_workbook import ROOT, read_workbook, numeric
from data.workbook_mapping import SHEETS, FIXED_ATTEMPT_SOURCES, CONFIRMED_COPPER_CAPS

SNAPSHOT = ROOT / 'data/boost-snapshot.json'
SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1Y4nFA5R8MLuWI1ACUHK9AfpWOYAGN3M_1Q5kCdYKDmA/edit?gid=528779517#gid=528779517'


def extract_snapshot(workbook, data, retrieved_at):
    """Keep blanks and units from the source; do not recalculate its formulas."""
    workbook = Path(workbook)
    sheets = read_workbook(workbook)
    entries = []
    for building in data['buildings']:
        sheet = building['sourceSheet']
        cells = sheets[sheet]
        levels = sorted(int(float(value)) for address, value in cells.items()
                        if re.fullmatch(r'C\d+', address)
                        and re.fullmatch(r'\d+(?:\.0)?', value))
        maximum = 500 if building['gold'] else 200
        if levels != list(range(1, maximum + 1)):
            raise ValueError(f'{sheet}: expected consecutive levels 1–{maximum}')
        if any(numeric(cells, f'C{level+4}') != level for level in levels):
            raise ValueError(f'{sheet}: level rows moved; review the column mapping')
        existing = {row['boost']: row for row in building['rows']}
        rows = []
        for key, column, scale, *attempts in SHEETS[sheet][1]:
            tier = existing[key]['tier']
            values = [None if tier == 'Gold' and level < 101 else
                      numeric(cells, f'{column}{level+4}', scale) for level in levels]
            if not any(value is not None for value in values):
                raise ValueError(f'{sheet}!{column}: no boost values supplied')
            row = {'boost': key, 'tier': tier, 'values': values,
                   'source': {'sheet': sheet, 'column': column, 'scale': scale}}
            if attempts:
                attempt = attempts[0]
                if isinstance(attempt, str):
                    row['charges'] = [None if tier == 'Gold' and level < 101 else
                                      numeric(cells, f'{attempt}{level+4}') for level in levels]
                    row['source']['charges'] = attempt
                else:
                    address = FIXED_ATTEMPT_SOURCES[sheet]
                    overview = sheets['Main (New)'].get(address, '')
                    if not re.match(rf'^{attempt}\s*[x×]', overview):
                        raise ValueError(f'{sheet}: fixed attempt limit changed at Main (New)!{address}')
                    row['charges'] = [attempt if value is not None else None for value in values]
                    row['source']['charges'] = f'Main (New)!{address}'
            rows.append(row)
        entries.append({'id': building['id'], 'sheet': sheet, 'maxLevel': maximum, 'rows': rows})
    return {'schemaVersion': 1, 'source': {
        'name': 'GB Update - Ubernerd', 'url': SOURCE_URL, 'retrievedAt': retrieved_at,
        'sha256': hashlib.sha256(workbook.read_bytes()).hexdigest(), 'sheetCount': len(sheets),
        'method': 'Saved Google Sheets XLSX export values; boosts and attempt limits only. Formulas are not recalculated.'},
        'buildings': entries}


def apply_confirmed_cap(row, cap):
    """Expand a user-confirmed Copper cap, preserving the raw snapshot separately."""
    fields = [field for field in ('values', 'charges') if field in row]
    for field in fields:
        values = row[field]
        value = values[cap['level'] - 1]
        if value is None:
            raise ValueError(f'Missing {field} at confirmed cap level {cap["level"]}')
        if any(item is not None and item != value for item in values[cap['level']:]):
            raise ValueError('New source conflicts with user-confirmed Copper cap')
        values[cap['level']:] = [value] * (len(values) - cap['level'])
    row['source']['confirmedCap'] = {**deepcopy(cap), 'fields': fields}


def apply_snapshot(data, snapshot):
    """Overlay boost series without touching FP, unlock costs or base rewards."""
    entries = {entry['id']: entry for entry in snapshot['buildings']}
    if len(entries) != len(snapshot['buildings']) or set(entries) != {b['id'] for b in data['buildings']}:
        raise ValueError('Boost snapshot must cover every building exactly once')
    for building in data['buildings']:
        entry = entries[building['id']]
        if entry['sheet'] != building['sourceSheet']:
            raise ValueError(f"Wrong source sheet for {building['name']}")
        incoming = {row['boost']: row for row in entry['rows']}
        if len(incoming) != len(entry['rows']) or set(incoming) != {row['boost'] for row in building['rows']}:
            raise ValueError(f"Boost mapping changed for {building['name']}")
        maximum = entry['maxLevel']
        for row in building['rows']:
            new = incoming[row['boost']]
            if new['tier'] != row['tier'] or len(new['values']) != maximum:
                raise ValueError(f"Invalid boost series for {building['name']}: {row['boost']}")
            confirmations = row['source'].get('confirmedRanges', [])
            for confirmation in confirmations:
                for level in range(confirmation['fromLevel'], confirmation['toLevel'] + 1):
                    if new['values'][level-1] not in (None, confirmation['value']):
                        raise ValueError(f"New source conflicts with user confirmation: {entry['sheet']}, level {level}")
            row.update(deepcopy(new))
            row['source']['snapshot'] = 'data/boost-snapshot.json'
            if confirmations:
                row['source']['confirmedRanges'] = deepcopy(confirmations)
                for confirmation in confirmations:
                    for level in range(confirmation['fromLevel'], confirmation['toLevel'] + 1):
                        row['values'][level-1] = confirmation['value']
            cap = CONFIRMED_COPPER_CAPS.get(entry['sheet'])
            if cap and row['tier'] == 'Copper':
                apply_confirmed_cap(row, cap)
            row['coverage'] = sum(value is not None for value in row['values'])
        building['levels'] = list(range(1, maximum + 1))
    data['boostSource'] = deepcopy(snapshot['source'])
    data['date'] = snapshot['source']['retrievedAt'][:10]
    data['methodology']['values'] = ('Boosts and attempt limits use the latest recorded Google Sheets export, '
        'with explicitly recorded user confirmations. Percent fractions are converted to displayed percentages. '
        'Missing cells remain null; display-time retention is marked with a warning.')
    data['methodology']['gaps'] = ('Gold is locked below 101. Boost rows extend to 500 for Gold buildings and '
        '200 for Copper-only buildings. User-confirmed Blue Galaxy Copper boosts and collection limits '
        'stay at their level-200 values above 200; the raw snapshot preserves the source blanks. '
        'Trailing missing boosts retain their last known value with a warning; internal gaps stay Not supplied. '
        'Cost and base-reward coverage remains 1–300 for Gold and 1–200 for Copper-only. Costs are never carried forward.')
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path, help='Read-only XLSX export of the source Google Sheet')
    parser.add_argument('--retrieved-at', default=datetime.now(timezone.utc).isoformat(timespec='seconds'))
    args = parser.parse_args()
    data = json.loads((ROOT / 'data/guide-data.json').read_text())
    snapshot = extract_snapshot(args.workbook, data, args.retrieved_at)
    apply_snapshot(deepcopy(data), snapshot)  # Validate before replacing the recorded source.
    from build_data import format_data, build
    SNAPSHOT.write_text(format_data(snapshot))
    build()
    print(f'Refreshed boost data for {len(snapshot["buildings"])} buildings from {SOURCE_URL}')


if __name__ == '__main__':
    main()
