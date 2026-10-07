"""Read GB icon/text relationships from Haxe output; never execute client code."""
from __future__ import annotations

import json
import re

STRING = r'"(?:[^"\\]|\\.)*"'
IDENT = r'[A-Za-z_$][\w$]*'
GB_CLASS = re.compile(r'\["(de\.innogames\.strategycity\.util\.greatbuilding\.[^".]+)"\]\s*=\s*(' + IDENT + ')')
TOKEN = re.compile(STRING + r"|'(?:[^'\\]|\\.)*'|/\*.*?\*/|//[^\n]*|[{}]", re.S)


def _body(source: str, opening: int) -> str:
    """Read a known object/function body, ignoring braces in strings/comments."""
    depth = 0
    for token in TOKEN.finditer(source, opening):
        if token.group() == '{':
            depth += 1
        elif token.group() == '}':
            depth -= 1
            if not depth:
                return source[opening + 1:token.start()]
    raise ValueError('Incomplete GB bonus function in ForgeHX')


def _function(source: str, pattern: str) -> str:
    match = re.search(pattern + r'\s*function\([^)]*\)\s*\{', source)
    return _body(source, match.end() - 1) if match else ''


def _texts(source: str) -> list[str]:
    texts = [json.loads(m) for m in re.findall(r'\.gettext\(\s*(' + STRING + ')', source)]
    # A constant singular ngettext call is also an unambiguous title (Population).
    texts.extend(json.loads(m) for m in re.findall(
        r'\.ngettext\(\s*(' + STRING + r')\s*,\s*' + STRING + r'\s*,\s*1\s*\)', source))
    return list(dict.fromkeys(texts))


def plain_text(value: str) -> str:
    """Hide translation contexts, not meaningful pipe characters in prose."""
    return re.sub(r'^[A-Z][A-Z0-9]*(?:#\d+)?\|\s*', '', value).strip()


def _text_map(source: str, alias: str, name: str) -> dict[str, str]:
    body = _function(source, re.escape(alias) + r'\.' + name + r'\s*=')
    pattern = (r'(' + IDENT + r')\s*=\s*' + IDENT + r'\.gettext\(\s*(' + STRING + r')\s*\);\s*'
               + IDENT + r'\.h\.([a-z_0-9]+)\s*=\s*\1\b')
    return {key: json.loads(text) for _, text, key in re.findall(pattern, body)}


def _military_pairings(source: str, alias: str, methods: dict, factories: list[dict], evidence: dict) -> list[dict]:
    # Follow the actual shared icon helper; minified class aliases are not stable.
    helper = re.search(r'(' + IDENT + r')\.getIconId\(', methods.get('getBonusIcon', ''))
    if not helper:
        return []
    helper = helper.group(1)
    suffix_body = _function(source, re.escape(helper) + r'\.getTargetedFeatureIconId\s*=')
    # Fail closed if the helper no longer appends the multiplier suffix.
    multiplier = re.search(r'\+=\s*("_multiplier")', suffix_body)
    if not multiplier:
        return []
    suffixes = {json.loads(k): json.loads(v) for k, v in re.findall(
        r'case\s*(' + STRING + r')\s*:\s*(?:var\s+)?' + IDENT + r'\s*=\s*(' + STRING + ')', suffix_body)}
    targets = {json.loads(k): json.loads(v) for k, v in re.findall(
        r'case\s*(' + STRING + r')\s*:\s*return\s+' + IDENT + r'\.gettext\(\s*(' + STRING + ')', methods.get('_getTargetName', ''))}
    targets['all'] = ''
    boost_map = _function(source, re.escape(helper) + r'\.BONUS_TO_BOOST_MAP\s*=')
    boosts = {k: json.loads(v) for k, v in re.findall(r'\.h\.([a-z_0-9]+)\s*=\s*(' + STRING + ')', boost_map)}
    large = _function(source, re.escape(helper) + r'\.getLargeIconId\s*=')
    stems = {json.loads(k): json.loads(v) for k, v in re.findall(
        r'case\s*(' + STRING + r')\s*:\s*' + IDENT + r'\s*=\s*(' + STRING + ')', large)}
    if 'getTargetedFeatureIconId("boost_icon_bonus_"+' not in re.sub(r'\s+', '', large):
        return []
    result = []
    for multiplied in (False, True):
        prefix = 'MULTIPLIER_' if multiplied else ''
        names = _text_map(source, alias, prefix + 'BONUS_NAMES_MAP')
        general = _text_map(source, alias, prefix + 'ALL_BONUS_DESCRIPTIONS_MAP')
        targeted = _text_map(source, alias, prefix + 'BONUS_DESCRIPTIONS_MAP')
        for factory in factories:
            kind = factory['bonus_type']
            stem = stems.get(boosts.get(kind))
            if kind not in names or not stem:
                continue
            for target, suffix in suffixes.items():
                description = (general if target == 'all' else targeted).get(kind)
                if description is None or target not in targets:
                    continue
                target_name = plain_text(targets[target])
                label = ' '.join(p for p in (target_name, plain_text(names[kind])) if p)
                text = plain_text(description)
                if target != 'all':
                    text = text.replace('%s', target_name, 1)
                icon = 'boost_icon_bonus_' + stem + suffix + ('_multiplier' if multiplied else '')
                result.append({**evidence, 'bonus_types': [kind], 'icon_ids': [icon],
                               'names': [label], 'descriptions': [text],
                               'raw_texts': [names[kind], description] + ([targets[target]] if target_name else []),
                               'target': target, 'multiplier': multiplied, 'conditional': False})
    return result


def extract_bonus_pairings(source: str) -> list[dict]:
    factories = []
    pattern = (r'\.h\.([a-z_0-9]+)\s*=\s*\{bonusFactory:\s*function\(\)\s*\{return new\s+('
               + IDENT + r')(?:\([^)]*\))?\s*\},\s*tooltipIconImageURL:\s*' + IDENT
               + r'\.GreatBuildingBonusIcon\(\s*(' + STRING + r')\s*\)\s*\}')
    for kind, alias, icon in re.findall(pattern, source):
        factories.append({'bonus_type': kind, 'alias': alias, 'icon': 'great_building_bonus_' + json.loads(icon)})
    # Some factories (A.I. Core) choose the tooltip icon at runtime and are stored
    # in a local variable before being registered. Keep their explicit type link.
    dynamic = (r'var\s+(' + IDENT + r')\s*=\s*\{bonusFactory:\s*function\(\)\s*\{return new\s+('
               + IDENT + r')(?:\([^)]*\))?\s*\},\s*tooltipIconImageURL:')
    for match in re.finditer(dynamic, source):
        opening = source.index('{', match.start())
        body = _body(source, opening)
        end = opening + len(body) + 2
        binding = re.match(r';\s*' + IDENT + r'\.h\.([a-z_0-9]+)\s*=\s*'
                           + re.escape(match.group(1)) + r';', source[end:])
        if binding:
            factories.append({'bonus_type': binding.group(1), 'alias': match.group(2), 'icon': None})
    result = []
    for match in GB_CLASS.finditer(source):
        class_name, alias = match.groups()
        prototype = re.search(re.escape(alias) + r'\.prototype\s*=\s*\{', source[match.end():])
        if not prototype:
            continue
        opening = match.end() + prototype.end() - 1
        body = _body(source, opening)
        # Interfaces/static helpers may have no prototype of their own nearby.
        if not re.search(r'__class__\s*:\s*' + re.escape(alias) + r'\b', body):
            continue
        methods = {name: _function(body, r'\b' + name + r'\s*:\s*') for name in (
            'getBonusIcon', 'getBonusName', 'getTooltip', 'getTooltipCurrentLevel', '_getTargetName')}
        evidence = {'class_name': class_name, 'source_line': source.count('\n', 0, opening) + 1}
        linked = [item for item in factories if item['alias'] == alias]
        if class_name.endswith('.MilitaryBoostBonus'):
            result.extend(_military_pairings(source, alias, methods, linked, evidence))
            continue
        names = _texts(methods['getBonusName'])
        # Prefer the current-level tooltip (which can include collection timing).
        # A delegating method has no literal, so use its getTooltip implementation.
        descriptions = _texts(methods['getTooltipCurrentLevel']) or _texts(methods['getTooltip'])
        icons = [json.loads(value) for value in re.findall(STRING, methods['getBonusIcon'])
                 if 'great_building_bonus_' in value]
        icons.extend(item['icon'] for item in linked if item['icon'])
        if not names or not icons:
            continue
        result.append({**evidence, 'bonus_types': [item['bonus_type'] for item in linked],
                       'icon_ids': sorted(set(icons)), 'names': names, 'descriptions': descriptions,
                       'raw_texts': list(dict.fromkeys(names + descriptions)),
                       'conditional': len(names) > 1 or len(descriptions) > 1})
    return result
