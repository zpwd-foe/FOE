import contextlib
import io
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.request import Request

from foe_cdn_inspector.cli import build_parser, render_dashboard, run_refresh
from foe_cdn_inspector.direct import asset_url, compare, discover_forge_url, parse_forge, validate_forge_url
from foe_cdn_inspector.network import Response, _SameHostRedirectHandler

URL = 'https://foezz.innogamescdn.com/cache/ForgeHX-test-aabbccdd.js'
BETA = 'https://zz1.forgeofempires.com/'
ICON = '/city/gui/great_building_bonus_icons/great_building_bonus_test.png'
END = '})("undefined"!=typeof self?self:this);'


def client(assets=None, text=None):
    assets = assets if assets is not None else {f'/test/{i}.png': 'abc123456' for i in range(1000)}
    assets = {**assets, ICON: assets.get(ICON, 'abc123456')}
    text = text if text is not None else [f'Test {i}' for i in range(1000)] + [f'GBP|Bonus {i}: %s' for i in range(10)]
    return ('(function(){new Map(Ng.baseUrl,' + json.dumps(assets) + ');' +
            ';'.join('t.gettext(' + json.dumps(t) + ')' for t in text) +
            ';_staticDataLoader.load("great_building_tiers");' + END).encode()


def args(folder, *extra):
    return build_parser().parse_args(['refresh', '--forge-hx-url', URL,
        '--output', str(folder / 'snapshots'), '--cache', str(folder / 'cache'),
        '--results', str(folder / 'results'), '--dashboard-dir', str(folder / 'dashboard'), *extra])


def run(folder, body=None, extra=(), market='zz', day=6):
    body = body if body is not None else client()
    calls = []
    def fake_fetch(url, **kwargs):
        calls.append(url)
        if url == BETA:
            payload = ('var ONELPS_RUNTIME_CONFIG = ' + json.dumps({'config': {'marketId': market}})).encode()
            return Response(payload, 'text/html', url, len(payload))
        if url == URL:
            return Response(body, 'text/javascript', url, len(body))
        raise AssertionError('Unexpected network request: ' + url)
    with patch('foe_cdn_inspector.refresh.fetch', side_effect=fake_fetch), \
         patch('foe_cdn_inspector.refresh.datetime') as clock, contextlib.redirect_stdout(io.StringIO()):
        clock.now.return_value = datetime(2026, 10, day, 16, tzinfo=timezone.utc)
        result = run_refresh(args(folder, *extra))
    return result, calls


def saved(folder):
    name = (folder / 'snapshots/latest.txt').read_text().strip()
    snapshot = folder / 'snapshots' / name
    return snapshot, json.loads((snapshot / 'dashboard-state.json').read_text())


class DirectParserTests(unittest.TestCase):
    def test_extracts_hash_urls_unicode_text_and_references_without_eval(self):
        body = client().replace(b'Test 1"', b'Test \\u00e9"')
        parsed = parse_forge(body, URL)
        self.assertEqual(len(parsed['assets']), 1001)
        self.assertIn('Test é', parsed['strings'])
        self.assertEqual(len(parsed['gbp_strings']), 10)
        self.assertEqual(parsed['metadata_references'], ['great_building_tiers'])
        self.assertEqual(asset_url('/contact 2.png', 'abc123456'), 'https://foezz.innogamescdn.com/assets/contact%202-abc123456.png')

    def test_source_discovery_requires_one_allowed_script(self):
        self.assertEqual(discover_forge_url(f'<script src="{URL}"></script>', BETA), URL)
        for html in ('<script src="index.js"></script>', f'<script src="{URL}"></script><script src="{URL.replace("test", "other")}"></script>'):
            with self.assertRaises(ValueError):
                discover_forge_url(html, BETA)
        for url in (URL.replace('https:', 'http:'), URL.replace('foezz.', 'foeus.'), URL + '?token=secret', URL.replace('/cache/', '/assets/'), URL.replace('https://', 'https://user@'), URL.replace('.com/', '.com:444/')):
            with self.assertRaises(ValueError):
                validate_forge_url(url)

    def test_rejects_truncation_missing_map_invalid_hash_and_path(self):
        valid = client()
        for body in (valid[:-80], b'html', valid.replace(b'baseUrl,', b'unknown,'), valid.replace(b'abc123456', b'not-a-hash')):
            with self.assertRaises(ValueError):
                parse_forge(body, URL)
        for path in ('//evil/file.png', '/../file.png', '/a/../file.png', '/file.png?x', '/a%2fb.png'):
            with self.assertRaises(ValueError):
                asset_url(path, 'abc123456')

    def test_changes_include_add_update_remove_text_and_client_but_not_baseline(self):
        previous = parse_forge(client(), URL)
        assets = {**previous['assets'], '/new.png': 'abc123456', ICON: 'def123456'}
        del assets['/test/0.png']
        texts = [s for s in previous['strings'] if s != 'GBP|Bonus 0: %s'] + ['GBP|New bonus']
        current = parse_forge(client(assets, texts), URL)
        baseline = compare(None, current, 'baseline')
        self.assertFalse(baseline.files)
        self.assertFalse(baseline.added_strings)
        report = compare(previous, current, 'change')
        self.assertEqual([r.change for r in report.files].count('updated'), 2)
        self.assertEqual([r.change for r in report.files].count('added'), 1)
        self.assertEqual([r.change for r in report.files].count('removed'), 1)
        self.assertEqual(report.added_strings, ['GBP|New bonus'])
        self.assertEqual(report.removed_strings, ['GBP|Bonus 0: %s'])
        self.assertFalse(compare(current, current, 'same').files)

    def test_redirects_cannot_downgrade_https_or_leave_host(self):
        handler = _SameHostRedirectHandler('foezz.innogamescdn.com')
        for destination in (URL.replace('https:', 'http:'), 'https://other.test/x'):
            with self.assertRaises(RuntimeError):
                handler.redirect_request(None, None, 302, 'redirect', {}, destination)

    def test_beta_landing_redirects_stay_in_explicit_beta_host_set(self):
        handler = _SameHostRedirectHandler(('zz1.forgeofempires.com', 'zz0.forgeofempires.com',
                                            'zz.forgeofempires.com', 'zz-play.forgeofempires.com'))
        destination = 'https://zz-play.forgeofempires.com/'
        request = handler.redirect_request(Request(BETA), None, 302, 'redirect', {}, destination)
        self.assertEqual(request.full_url, destination)
        with self.assertRaises(RuntimeError):
            handler.redirect_request(Request(BETA), None, 302, 'redirect', {}, 'https://us.forgeofempires.com/')


class RefreshTests(unittest.TestCase):
    def test_first_baseline_publishes_current_inventory_without_fake_changes(self):
        with TemporaryDirectory() as name:
            folder = Path(name)
            result, calls = run(folder)
            snapshot, state = saved(folder)
            self.assertEqual(result, 0)
            self.assertEqual(calls, [BETA, URL])  # No third-party requests, even on migration.
            self.assertEqual(state['history_results']['reports'], [])
            self.assertEqual(state['string_results']['active_count'], 10)
            self.assertTrue(all(r['source'] == 'baseline' for r in state['string_results']['active_strings']))
            direct = json.loads((snapshot / 'direct.json').read_text())
            self.assertEqual(len(direct['assets']), 1001)
            for filename in ('index.html', 'history.html'):
                self.assertEqual((folder / 'dashboard' / filename).read_bytes(), (snapshot / filename).read_bytes())
            page = (snapshot / 'index.html').read_text()
            self.assertIn('Present at first scan', page)
            self.assertIn('read directly from the beta game client', page)
            self.assertNotIn('Last changed <time datetime=""', page)
            self.assertIn('separate building values', (snapshot / 'history.html').read_text())

    def test_unchanged_source_is_refetched_without_duplicate_history(self):
        with TemporaryDirectory() as name:
            folder = Path(name)
            run(folder)
            first, _ = saved(folder)
            _, calls = run(folder, day=7)
            second, state = saved(folder)
            self.assertEqual(first, second)
            self.assertEqual(calls, [BETA, URL])
            self.assertTrue(state['checked_at'].startswith('2026-10-07'))
            self.assertFalse(state['history_results']['reports'])
            page = (second / 'index.html').read_text()
            render_dashboard(second)
            self.assertEqual((second / 'index.html').read_text(), page)

    def test_changed_scan_and_repeated_scan_preserve_real_diff(self):
        with TemporaryDirectory() as name:
            folder = Path(name)
            run(folder)
            old, _ = saved(folder)
            body = client().replace(b'Bonus 0: %s', b'Changed bonus: %s').replace(b'abc123456', b'def123456')
            run(folder, body, day=7)
            snapshot, state = saved(folder)
            self.assertNotEqual(snapshot, old)
            self.assertEqual(len(state['history_results']['reports']), 1)
            report = state['history_results']['reports'][0]
            self.assertEqual(report['source'], 'forge_hx')
            self.assertEqual(len(report['files']), 1002)
            self.assertEqual(report['strings']['added'], ['GBP|Changed bonus: %s'])
            self.assertEqual(len(state['string_results']['removal_events']), 1)
            run(folder, body, day=8)
            _, again = saved(folder)
            self.assertEqual(again['history_results']['reports'], state['history_results']['reports'])
            self.assertEqual(again['string_results']['removal_events'], state['string_results']['removal_events'])
            self.assertTrue((old / 'direct.json').exists())

    def test_legacy_history_and_known_dates_survive_migration(self):
        with TemporaryDirectory() as name:
            folder = Path(name)
            snapshot = folder / 'snapshots/2026-10-05_11-00-00'
            snapshot.mkdir(parents=True)
            (snapshot.parent / 'latest.txt').write_text(snapshot.name)
            legacy = {'report_id': snapshot.name, 'date': '2026-10-05',
                      'files': [], 'metadata_files': [], 'strings': {'added': ['GBP|Bonus 0: %s'], 'removed': []},
                      'buildings': {}, 'metadata_families': [], 'counts': {
                          'assets': dict.fromkeys(('added','updated','removed'), 0),
                          'strings': {'added': 1, 'removed': 0}, 'buildings': dict.fromkeys(('added','updated','removed'), 0), 'meta': {'staticdata': 0}}}
            old_state = {'history_results': {'reports': [legacy]}, 'string_results': {'active_strings': [
                {'text': 'GBP|Bonus 0: %s', 'last_added_date': '2026-10-05'}]}}
            (snapshot / 'dashboard-state.json').write_text(json.dumps(old_state))
            run(folder)
            _, state = saved(folder)
            self.assertEqual(len(state['history_results']['reports']), 1)
            self.assertEqual(state['history_results']['reports'][0]['source'], 'legacy')
            record = next(r for r in state['string_results']['active_strings'] if r['text'] == 'GBP|Bonus 0: %s')
            self.assertEqual(record['last_added_date'], '2026-10-05')
            self.assertEqual(record['source'], 'legacy')
            self.assertEqual(json.loads((snapshot / 'dashboard-state.json').read_text()), old_state)

    def test_invalid_source_wrong_market_and_dry_run_leave_published_data_unchanged(self):
        with TemporaryDirectory() as name:
            folder = Path(name)
            run(folder)
            before = {str(p): p.read_bytes() for p in folder.rglob('*') if p.is_file()}
            with self.assertRaises(ValueError):
                run(folder, b'truncated')
            with self.assertRaisesRegex(ValueError, 'expected.*zz'):
                run(folder, market='us')
            run(folder, client().replace(b'Bonus 0:', b'Bonus changed:'), extra=('--dry-run',), day=7)
            after = {str(p): p.read_bytes() for p in folder.rglob('*') if p.is_file()}
            self.assertEqual(before, after)

    def test_initial_dry_run_writes_nothing_and_source_is_required(self):
        with TemporaryDirectory() as name:
            folder = Path(name)
            run(folder, extra=('--dry-run',))
            self.assertEqual(list(folder.iterdir()), [])
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                build_parser().parse_args(['refresh'])


if __name__ == '__main__':
    unittest.main()
