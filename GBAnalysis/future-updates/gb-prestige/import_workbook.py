"""Read saved XLSX values without recalculating or altering the source workbook."""
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'data'))
from workbook_mapping import (SHEETS, FIXED_ATTEMPT_SOURCES, DECISION_NOTES,
                              PENDING_UNLOCK_SHEETS, PENDING_UNLOCK_SOURCE, CONFIRMED_BOOST_RANGES)

DEFAULT_SOURCE = ROOT.parent.parent / 'input/GB Update - Ubernerd.xlsx'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL_ID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
LEVEL_FIELDS = ['fp', 'totalFP', 'copperSets', 'goldSets', 'coinsSupplies',
                'medals', 'goodsEach', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7',
                'previousFP', 'previousTotalFP']


def read_workbook(path):
    with zipfile.ZipFile(path) as archive:
        strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        targets = {node.get('Id'): node.get('Target') for node in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS):
            target = targets[sheet.get(REL_ID)]
            target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            cells = {}
            for cell in ET.fromstring(archive.read(target)).findall('m:sheetData/m:row/m:c', NS):
                value, inline = cell.find('m:v', NS), cell.find('m:is', NS)
                raw = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else None
                if cell.get('t') == 's' and raw is not None:
                    raw = strings[int(raw)]
                if raw is not None:
                    if cell.get('t') == 'e':
                        raise ValueError(f"Workbook error: {sheet.get('name')}!{cell.get('r')} = {raw}")
                    cells[cell.get('r')] = raw
            sheets[sheet.get('name')] = cells
        return sheets


def column_index(column):
    result = 0
    for char in column:
        result = result * 26 + ord(char) - 64
    return result


def column_name(index):
    result = ''
    while index:
        index, digit = divmod(index - 1, 26)
        result = chr(65 + digit) + result
    return result


def numeric(cells, address, scale=1):
    value = cells.get(address)
    if value is None or value == '':
        return None
    number = Decimal(value) * scale
    if not number.is_finite():
        raise ValueError(f'Nonfinite value at {address}')
    return int(number) if number == number.to_integral_value() else float(number)


def apply_workbook(data, source=DEFAULT_SOURCE):
    source = Path(source)
    sheets = read_workbook(source)
    costs = sheets['Costs']
    cost_columns = {value: column_index(re.sub(r'\d+', '', address))
                    for address, value in costs.items() if re.fullmatch(r'[A-Z]+2', address)}
    buildings = {b['order']: b for b in data['buildings']}
    for key, base, label in [('rare-relic', '91', 'Relic Hunt · rare relic'), ('rare-shard', '82', 'Mysterious Shards · rare reward')]:
        data['boosts'][key] = {**deepcopy(data['boosts'][base]), 'id': key, 'label': label,
            'description': 'This rare-reward percentage is separate from the overall trigger chance. It is not combined with that chance here.', 'mechanic': 'Chance'}
    data['boosts']['82']['description'] = 'A chance to create a hidden shard reward in an active cultural settlement. The rare-reward percentage is shown separately.'
    data['boosts']['91']['description'] = 'A chance to create a relic after completing a GE encounter. The rare-relic percentage is shown separately.'
    data['boosts']['19']['description'] = 'A chance of a better reward when you aid another player. Reward value depends on the reward received.'
    data['boosts']['97']['description'] = 'A chance of an enhanced reward after eligible main-city victories, up to the listed battle limit.'
    for sheet_name, (order, specs) in SHEETS.items():
        cells, building = sheets[sheet_name], buildings[order]
        levels = sorted(int(Decimal(value)) for address, value in cells.items()
                        if re.fullmatch(r'C\d+', address) and re.fullmatch(r'\d+(?:\.0)?', value))
        expected_max = 300 if building['gold'] else 200
        assert levels == list(range(1, expected_max + 1)), sheet_name
        existing = {r['boost']: r for r in building['rows']}
        rows = []
        for index, (key, column, scale, *attempts) in enumerate(specs):
            tier = existing.get(key, {}).get('tier', 'Copper')
            values = [None if tier == 'Gold' and level < 101 else numeric(cells, f'{column}{level+4}', scale) for level in levels]
            confirmations = CONFIRMED_BOOST_RANGES.get((sheet_name, key), [])
            for confirmation in confirmations:
                for level in range(confirmation['fromLevel'], confirmation['toLevel'] + 1):
                    values[level - 1] = confirmation['value']
            unit = 'count' if key == '2' else 'percent' if scale == 100 or key == '5' else 'levels' if key in ('21', '92') else 'count'
            row = {'id': f'{order:02d}-{index+1}', 'boost': key, 'tier': tier, 'unit': unit,
                   'values': values, 'source': {'sheet': sheet_name, 'column': column, 'scale': scale},
                   'coverage': sum(value is not None for value in values)}
            if confirmations:
                row['source']['confirmedRanges'] = deepcopy(confirmations)
            if existing.get(key, {}).get('uncertain'):
                row['uncertain'] = True
            if attempts:
                attempt = attempts[0]
                row['charges'] = [None if tier == 'Gold' and level < 101 else numeric(cells, f'{attempt}{level+4}') if isinstance(attempt, str) else attempt if values[level-1] is not None else None for level in levels]
                row['source']['charges'] = attempt if isinstance(attempt, str) else f"Main (New)!{FIXED_ATTEMPT_SOURCES[sheet_name]}"
            rows.append(row)
        headers = {value: re.sub(r'\d+', '', address) for address, value in cells.items() if re.fullmatch(r'[A-Z]+4', address)}
        places = {int(value[1:]): re.sub(r'\d+', '', address) for address, value in cells.items() if re.fullmatch(r'[A-Z]+3', address) and re.fullmatch(r'P[1-7]', value)}
        cost_base = cost_columns[cells['A1']]
        level_data, running_total = [], 0
        for level in levels:
            row_number = level + 4
            fp = numeric(cells, f'D{row_number}')
            assert fp is not None and fp == numeric(costs, f'{column_name(cost_base+2)}{row_number}'), (sheet_name, level, 'FP disagreement')
            running_total += fp
            assert running_total == numeric(costs, f'{column_name(cost_base+3)}{row_number}'), (sheet_name, level, 'Cumulative FP disagreement')
            resources = [numeric(cells, f'{headers[label]}{row_number}') if label in headers else None
                         for label in ['Copper Sets', 'Gold Sets', 'Coins / Supplies', 'Medals', 'Goods (each)']]
            rewards = [numeric(cells, f'{places[p]}{row_number}') if p in places and (p <= 5 or level >= 101) else None for p in range(1,8)]
            level_data.append([fp, running_total, *resources, *rewards,
                               numeric(costs, f'{column_name(cost_base)}{row_number}'),
                               numeric(costs, f'{column_name(cost_base+1)}{row_number}')])
        cost_source = {'sheet': 'Costs', 'postColumn': column_name(cost_base+2)}
        if building['gold'] and sheet_name != 'SHS':
            confirmation = {
                'fields': ['coinsSupplies', 'medals'], 'fromLevel': 10,
                'toLevel': 100, 'value': 0, 'date': '2026-10-28',
                'reason': 'User confirmed: Gold-tier buildings other than Shattered Horizon Siphon only require coins, supplies and medals to unlock levels 101 and above.'}
            for level in range(confirmation['fromLevel'], confirmation['toLevel'] + 1):
                for field in confirmation['fields']:
                    level_data[level - 1][LEVEL_FIELDS.index(field)] = confirmation['value']
            cost_source['confirmedUnlockRanges'] = [confirmation]
        building.update({'levels': levels, 'rows': rows, 'levelData': level_data,
                         'sourceSheet': sheet_name, 'guidance': DECISION_NOTES[order],
                         'costSource': cost_source,
                         'notes': [], 'workbookNotes': []})
        building.pop('pendingUnlockCosts', None)
        if sheet_name in PENDING_UNLOCK_SHEETS:
            building['pendingUnlockCosts'] = {
                'fields': [4, 5, 6], 'fromLevel': 11, 'source': PENDING_UNLOCK_SOURCE}
        if sheet_name == 'TT':
            building['workbookNotes'].append('Aid Goods uses the displayed numbers from the percentage-formatted detail column as counts, consistent with the workbook overview (Main (New)!D83).')
        if sheet_name == 'CF':
            building['workbookNotes'].append('Heroic Tavern percentages are stored as whole percentages in this sheet; they are not multiplied by 100.')
        for address in {'SV': ['G2'], 'HC': ['H2', 'I2']}.get(sheet_name, []):
            if cells.get(address):
                building['workbookNotes'].append(f'Reward notes in {sheet_name}!{address}: {cells[address].replace(chr(10), "; ")}. No individual reward probabilities are supplied.')
        for key in ['screenshot', 'screenshotSha256', 'sourceImage']:
            building.pop(key, None)
    data.update({'schemaVersion': 2, 'date': '2026-10-28', 'levelFields': LEVEL_FIELDS,
        'source': {'name': source.name, 'author': 'Ubernerd', 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                   'method': 'Saved workbook values with explicitly recorded user confirmations; formulas are not recalculated.', 'sheetCount': len(sheets)},
        'methodology': {
            'values': 'All supplied level-by-level values from the Ubernerd workbook, with explicitly recorded user confirmations. Detail sheets take priority over summary ranges. Percent fractions are converted to displayed percentages. Raw missing values remain null; display-time retention is marked with a warning.',
            'costs': 'Per-level FP is reconciled against the post-update Costs sheet. Upgrade totals sum levels after the current level through the target, before contributor funding. The combined Coins / Supplies column is the amount of each resource. User-confirmed rule dated 2026-10-28: Gold-tier buildings except Shattered Horizon Siphon have zero coin, supply and medal unlock costs at levels 10–100; workbook costs at 101 and above are retained. Each affected building records this override in costSource.confirmedUnlockRanges.',
            'rewards': 'Contributor FP rewards are the workbook’s saved P1–P7 values, before personal contribution boosts. No contribution boost or funding assumption is applied.',
            'icons': 'Dashboard boost names, icons and army terminology follow the tracker pairings, with reviewed building-specific scope corrections. Himeji Castle Gold uses the user-confirmed blue attack multiplier in GBG.',
            'recommendations': 'Play-style guidance is editorial; ratings are not calculated cost, efficiency or payback rankings.',
            'gaps': 'Gold is locked below 101. Beyond the last supplied boost or attempt-limit level, retain its last known value with a warning and the originating level. Internal gaps stay Not supplied. Costs and rewards are never carried forward. Detail rows end at 300 for Gold buildings and 200 for Copper-only buildings; these are source limits, not new game caps.'}})
    data.pop('sourceArticle', None)
    return data
