from __future__ import annotations

import html
import json
import re
import shutil
from collections import Counter
from datetime import date
from pathlib import Path

from .models import FileRecord, ParsedReport


IMAGE_HASH_RE = re.compile(r"-[0-9a-f]{8,}(?=\.[a-z0-9]+$)", re.IGNORECASE)
IMAGE_SIZE_RE = re.compile(r"(?:^|[_/-])(\d{2,4})x(\d{2,4})(?:[_/.]|$)", re.IGNORECASE)
BONUS_IMAGE_PREFIXES = (
    "icon_great_building_bonus_",
    "great_building_bonus_",
    "boost_icon_bonus_",
    "boost_panel_icon_",
    "icon_bonus_",
)
HEADER_IMAGE = "gb-midnight-header-v4-pagoda.jpg"
CLOUD_IMAGE = "gb-midnight-cloud-wisps-v1.png"
DASHBOARD_ASSETS = (HEADER_IMAGE, CLOUD_IMAGE)


def _ui_icon(name: str) -> str:
    paths = {
        "building": '<path d="m3 9 9-6 9 6M4 10h16M5 20V11m5 9V11m4 9V11m5 9V11M3 21h18"/>',
        "image": '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
        "text": '<path d="M5 5h14M12 5v14M8 19h8"/>',
        "history": '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2"/>',
        "search": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
        "external": '<path d="M8 5h11v11M19 5 5 19"/>',
        "moon": '<path d="M20.5 13.3A8.5 8.5 0 0 1 10.7 3.5a8.5 8.5 0 1 0 9.8 9.8Z"/>',
    }
    return f'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>'


def _date_text(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return value
    return f"{parsed:%b} {parsed.day}, {parsed.year}"


def write_html(
    report: ParsedReport,
    destination: Path,
    metadata: dict,
    string_results: dict | None = None,
    history_results: dict | None = None,
) -> None:
    asset_directory = destination / "assets"
    asset_directory.mkdir(parents=True, exist_ok=True)
    for filename in DASHBOARD_ASSETS:
        shutil.copyfile(Path(__file__).with_name("assets") / filename, asset_directory / filename)
    counts = Counter((record.change, record.kind) for record in report.files)
    file_rows = "\n".join(_file_card(record, destination) for record in report.files)
    added_strings = _list(report.added_strings)
    removed_strings = _list(report.removed_strings)
    building_rows = "\n".join(
        _building_card(building, "added") for building in report.added_buildings
    ) + "\n" + "\n".join(
        _building_card(building, "updated") for building in report.updated_buildings
    )
    active_strings = (string_results or {}).get("active_strings", [])
    if string_results:
        publication_dates = len({record.get("last_added_date") for record in active_strings})
        stats = [
            ("Dates with GB bonus updates", publication_dates),
            ("Beta reports reviewed", string_results.get("reports_scanned", 0)),
        ]
    elif history_results:
        totals = history_results.get("totals", {})
        stats = [
            ("Reports", history_results.get("reports_count", 0)),
            ("Assets added", totals.get("assets", {}).get("added", 0)),
            ("Assets updated", totals.get("assets", {}).get("updated", 0)),
            ("Assets removed", totals.get("assets", {}).get("removed", 0)),
            ("Strings added", totals.get("strings", {}).get("added", 0)),
            ("Buildings added", totals.get("buildings", {}).get("added", 0)),
        ]
    else:
        stats = [
            ("Added files", sum(value for (change, _), value in counts.items() if change == "added")),
            ("Updated files", sum(value for (change, _), value in counts.items() if change == "updated")),
            ("Text / metadata", sum(value for (_, kind), value in counts.items() if kind in {"text", "metadata"})),
            ("Images", sum(value for (_, kind), value in counts.items() if kind == "image")),
            ("New buildings", len(report.added_buildings)),
            ("New strings", len(report.added_strings)),
        ]
    stat_html = "".join(
        f'<div class="stat"><strong>{value}</strong><span>{html.escape(label)}</span></div>'
        for label, value in stats
    )
    string_section = _active_string_section(string_results) if string_results else ""
    string_nav = f'<a href="#active-strings">{_ui_icon("text")}Bonus text</a>' if string_results else ""
    bonus_section = _great_building_bonus_section(history_results) if history_results else ""
    bonus_nav = f'<a href="#great-building-bonuses" aria-current="location">{_ui_icon("image")}Bonus icons</a>' if history_results else ""
    history_section = ""
    if history_results:
        history_shell, history_content = _history_parts(history_results)
        (destination / "history.html").write_text(history_content, encoding="utf-8")
        history_section = (
            f'{history_shell}<div class="archive-content" id="history-pending">'
            '<p class="meta">Open the archive to browse changes by category and date.</p>'
            '</div></details>'
        )
    history_nav = f'<a href="#snapshot">{_ui_icon("history")}60-day archive</a>' if history_results else ""
    page_heading = "GB Update Tracker"
    checked_date = str(metadata.get("checked_at") or metadata.get("generated_at") or "")[:10]
    checked_stamp = (
        f'<time datetime="{html.escape(checked_date)}">{html.escape(_date_text(checked_date))}</time>'
        if checked_date else '<span>Not checked</span>'
    )
    if string_results:
        page_eyebrow = "FORGE OF EMPIRES · ZZ1 BETA"
        page_context = (
            'Track recently updated icons and descriptions for upcoming Great Building bonuses.'
        )
    elif history_results:
        page_eyebrow = "PUBLIC BETA CDN HISTORY"
        page_context = "Explore published beta changes across images, game text, and building data."
    else:
        page_eyebrow = "PUBLIC BETA CDN CHANGESET"
        page_context = "Explore the newest published beta report, from artwork to game data."

    latest_section = "" if history_results else _latest_report_section(
        report,
        file_rows,
        added_strings,
        removed_strings,
        building_rows,
    )

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(page_heading)}</title>
<link rel="preload" as="image" href="assets/{HEADER_IMAGE}" fetchpriority="high">
<style>
:root {{ color-scheme:dark; --bg-app:#090D14; --bg-surface:#111827; --bg-card:#182235; --border-default:#2A3A52; --accent-primary:#3B82F6; --accent-primary-hover:#60A5FA; --accent-secondary:#0EA5E9; --accent-highlight:#7DD3FC; --accent-discovery:#38BDF8; --status-added:#38BDF8; --status-changed:#818CF8; --status-removed:#F87171; --status-current:#60A5FA; --text-primary:#F1F5F9; --text-secondary:#94A3B8; --text-muted:#64748B; --radius-sm:6px; --radius-md:10px; --radius-lg:14px; }}
* {{ box-sizing:border-box }}
[hidden],.hidden {{ display:none !important }}
html {{ scroll-behavior:smooth; scrollbar-color:var(--border-default) var(--bg-app) }}
body {{ margin:0; min-height:100vh; background:radial-gradient(ellipse at 85% 0,#14345966,transparent 800px),var(--bg-app); color:var(--text-primary); font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; -webkit-font-smoothing:antialiased }}
body::before {{ content:""; position:absolute; z-index:-1; inset:0 0 auto; height:440px; pointer-events:none; opacity:.035; background-image:linear-gradient(#94A3B8 1px,transparent 1px),linear-gradient(90deg,#94A3B8 1px,transparent 1px); background-size:40px 40px; mask-image:linear-gradient(#000,transparent) }}
main {{ max-width:1240px; margin:auto; padding:30px 40px 34px }}
h1,h2,h3,p {{ margin-top:0 }}
h1 {{ margin:0 0 13px; font-size:clamp(36px,4.5vw,54px); font-weight:700; line-height:1.06; letter-spacing:-.045em; text-wrap:balance }}
h2 {{ margin:0; font-size:30px; font-weight:650; line-height:1.2; letter-spacing:-.035em; text-wrap:balance }}
h3 {{ font-weight:600 }}
a {{ color:var(--accent-primary-hover); text-underline-offset:4px }} a:visited {{ color:var(--accent-primary-hover) }} a:hover,a:visited:hover {{ color:var(--accent-highlight) }}
a,button,input,select,summary {{ -webkit-tap-highlight-color:transparent; outline-offset:4px }}
:focus-visible {{ outline:2px solid var(--accent-primary-hover) }}
button,input,select {{ font:inherit }}
button,summary {{ cursor:pointer }}
button {{ color:var(--text-primary) }}
button {{ border:1px solid var(--border-default); border-radius:var(--radius-sm); background:var(--bg-card); padding:8px 13px }}
button:hover {{ border-color:var(--accent-primary-hover) }}
::selection {{ color:var(--text-primary); background:#3B82F64D }}
.ui-icon {{ width:18px; height:18px; flex-shrink:0; fill:none; stroke:currentColor; stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round }}
.meta {{ color:var(--text-secondary) }}
.eyebrow {{ display:flex; align-items:center; gap:10px; margin-bottom:9px; color:var(--text-secondary); font-size:12px; font-weight:650; letter-spacing:.13em; text-transform:uppercase }}
.section-number {{ display:inline-grid; place-items:center; min-width:27px; height:24px; border:1px solid #3B82F660; border-radius:5px; color:var(--accent-primary-hover); background:#3B82F619; font:12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:0 }}
.hero {{ position:relative; overflow:hidden; padding:26px 30px 27px; margin-bottom:12px; border:1px solid #31547A; border-radius:var(--radius-lg); background-color:#101A2B; background-image:linear-gradient(90deg,#090D143D,#0C1B2D0D 55%,#09132333),url("assets/{HEADER_IMAGE}"); background-size:cover; background-position:center,center top }}
.hero::before {{ content:""; position:absolute; inset:0 0 auto; height:3px; background:linear-gradient(90deg,#1E3A8A,#2563EB 25%,#3B82F6 45%,#0EA5E9 65%,#38BDF8 82%,#7DD3FC) }}
.hero::after {{ content:""; position:absolute; inset:0; background:linear-gradient(180deg,#090D1426,transparent 45%,#090D1499); pointer-events:none }}
.hero > * {{ position:relative; z-index:1 }}
.hero > .cloud-effects {{ position:absolute; width:1px; height:1px; overflow:hidden; pointer-events:none }}
.hero > .hero-clouds {{ position:absolute; z-index:0; inset:0; visibility:hidden; pointer-events:none; mask-image:linear-gradient(90deg,transparent 24%,#000 57%); filter:url(#cloud-warp); contain:paint }}
.hero > .hero-clouds.clouds-ready {{ visibility:visible }}
.cloud-layer {{ position:absolute; left:-100%; width:200%; opacity:var(--cloud-opacity); transform:translate3d(var(--cloud-start,0%),0,0); filter:saturate(.62) brightness(var(--cloud-shade)) blur(.4px); animation:cloud-drift var(--drift-duration) linear var(--drift-offset) infinite,cloud-density var(--density-duration) ease-in-out var(--density-offset) infinite; background-image:url("assets/{CLOUD_IMAGE}"); background-size:50% 100%; background-repeat:repeat-x }}
.cloud-layer-high {{ top:-2%; height:58%; --cloud-shade:1.02; --cloud-opacity:.27; --cloud-thin:.20; --cloud-full:.34; --drift-duration:132s; --drift-offset:-18s; --density-duration:53s; --density-offset:-9s }}
.cloud-layer-mid {{ top:20%; height:68%; left:-115%; width:230%; --cloud-shade:.80; --cloud-opacity:.37; --cloud-thin:.29; --cloud-full:.44; --drift-duration:157s; --drift-offset:-76s; --density-duration:67s; --density-offset:-28s }}
.cloud-layer-low {{ top:52%; height:63%; left:-130%; width:260%; --cloud-shade:.48; --cloud-opacity:.49; --cloud-thin:.40; --cloud-full:.59; --drift-duration:181s; --drift-offset:-41s; --density-duration:79s; --density-offset:-46s }}
.hero.clouds-idle .cloud-layer {{ animation-play-state:paused }}
/* Each track holds two identical tiles; moving one tile makes the loop seamless. */
@keyframes cloud-drift {{ from {{ transform:translate3d(0,0,0) }} to {{ transform:translate3d(50%,0,0) }} }}
@keyframes cloud-density {{ 0%,100% {{ opacity:var(--cloud-opacity) }} 38% {{ opacity:var(--cloud-full) }} 72% {{ opacity:var(--cloud-thin) }} }}
.masthead {{ display:flex; justify-content:space-between; align-items:center; gap:20px }}
.brand {{ display:flex; align-items:center; gap:12px; color:#A8C8E7; font-size:12px; font-weight:600; letter-spacing:.1em; text-transform:uppercase }}
.brand-mark {{ width:35px; height:35px; padding:7px; border:1px solid #3B82F647; border-radius:9px; color:var(--accent-highlight); background:#3B82F60D }}
.brand-mark .ui-icon {{ width:100%; height:100% }}
.snapshot-stamp {{ display:flex; align-items:center; gap:8px; padding:5px 9px; border:1px solid #7DD3FC1F; border-radius:var(--radius-sm); background:#091423C2; color:#B2C8DF; font-size:13px; white-space:nowrap }}
.snapshot-stamp::before {{ content:""; width:6px; height:6px; border-radius:50%; background:var(--status-current) }}
.snapshot-stamp time {{ color:var(--text-primary); font-variant-numeric:tabular-nums }}
.hero-body {{ display:grid; grid-template-columns:minmax(0,1fr); align-items:start; gap:22px; max-width:665px; margin-top:27px }}
.hero h1 {{ color:#AFC2D8; text-shadow:0 2px 10px #06112180 }}
.intro {{ max-width:570px; margin:0; color:#C3D3E6; font-size:16px; line-height:1.7 }}
.beta-note {{ margin:12px 0 0; color:#96B2CD; font-size:13px }}
.stats {{ display:flex; flex-wrap:wrap; gap:28px; max-width:none }}
.stat {{ display:flex; align-items:center; gap:11px; min-width:0 }}
.stat + .stat {{ border-left:1px solid #60A5FA4D; padding-left:24px }}
.stat strong {{ display:block; color:var(--accent-primary-hover); font-size:31px; font-weight:600; line-height:1.2; font-variant-numeric:tabular-nums; letter-spacing:-.03em }}
.stat:nth-child(2) strong {{ color:var(--accent-highlight) }}
.stat span {{ display:block; max-width:135px; margin:0; color:#B4C9DE; font-size:12px; line-height:1.6 }}
.nav {{ position:sticky; top:0; z-index:10; display:flex; align-items:stretch; gap:30px; margin:0 0 34px; border-bottom:1px solid var(--border-default); background:#090D14F5; backdrop-filter:blur(16px) }}
.nav a {{ position:relative; display:flex; align-items:center; gap:9px; min-height:57px; padding:16px 0; color:var(--text-secondary); font-size:14px; font-weight:500; text-decoration:none; white-space:nowrap; transition:color .18s }}
.nav a:hover,.nav a[aria-current="location"] {{ color:var(--text-primary) }}
.nav a::after {{ content:""; position:absolute; bottom:-1px; left:0; right:0; height:2px; background:transparent }}
.nav a[aria-current="location"]::after {{ background:linear-gradient(90deg,#2563EB,#38BDF8,#7DD3FC); height:3px }}
.nav a[aria-current="location"] .ui-icon {{ color:var(--accent-primary-hover) }}
.bonus-gallery-section,#active-strings {{ scroll-margin-top:82px }}
.bonus-gallery-section {{ margin-top:0 }}
#active-strings {{ margin-top:64px; padding-top:34px; border-top:1px solid #0EA5E94D }}
#active-strings .section-number {{ color:var(--accent-discovery); border-color:#0EA5E966; background:#0EA5E91A }}
.bonus-gallery-head,.section-head {{ display:flex; justify-content:space-between; gap:32px; align-items:end; margin-bottom:23px }}
.bonus-gallery-head p,.section-head p {{ max-width:445px; margin:0; font-size:14px; line-height:1.7 }}
.section-head h2 {{ max-width:560px }}
.bonus-gallery-tools,.toolbar {{ display:flex; gap:12px; align-items:center }}
.bonus-gallery-tools {{ margin-bottom:12px }}
.search-field {{ position:relative; display:block; flex:1; min-width:0 }}
.search-field > .ui-icon {{ position:absolute; top:50%; left:15px; transform:translateY(-50%); color:var(--text-secondary); pointer-events:none }}
input,select {{ min-height:46px; padding:11px 14px; color:var(--text-primary); background:var(--bg-surface); border:1px solid var(--border-default); border-radius:var(--radius-md); font-size:14px; transition:border-color .18s,box-shadow .18s }}
input {{ width:100%; min-width:0 }}
.search-field input {{ padding-left:43px; padding-right:32px }}
input:hover,select:hover {{ border-color:#49617F }}
input:focus,select:focus {{ border-color:var(--accent-primary); box-shadow:0 0 0 3px #3B82F619 }}
input::placeholder {{ color:var(--text-secondary); opacity:.9 }}
select {{ min-width:160px; cursor:pointer; padding-right:28px }}
.result-line {{ display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:26px; margin:0 0 16px; color:var(--text-secondary); font-size:13px }}
.bonus-result-status,.history-result-status,.string-result-status {{ margin:0; color:var(--text-secondary); font-size:13px; font-variant-numeric:tabular-nums }}
.gallery-hint {{ display:flex; align-items:center; gap:6px; color:var(--text-secondary); font-size:12px }}
.gallery-hint .ui-icon {{ width:13px; height:13px }}
.bonus-grid {{ display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:14px }}
.bonus-card {{ --tile-accent:#3B82F6; --tile-deep:#142447; min-width:0; overflow:hidden; border:1px solid color-mix(in srgb,var(--tile-accent) 32%,var(--border-default)); border-radius:var(--radius-md); background:var(--bg-card); transition:border-color .2s,transform .2s }}
.bonus-card:nth-child(5n+1) {{ --tile-accent:#2563EB; --tile-deep:#172647 }}
.bonus-card:nth-child(5n+2) {{ --tile-accent:#3B82F6; --tile-deep:#173251 }}
.bonus-card:nth-child(5n+3) {{ --tile-accent:#0EA5E9; --tile-deep:#14374F }}
.bonus-card:nth-child(5n+4) {{ --tile-accent:#38BDF8; --tile-deep:#153C53 }}
.bonus-card:nth-child(5n+5) {{ --tile-accent:#7DD3FC; --tile-deep:#1B4056 }}
.bonus-card:hover {{ border-color:var(--tile-accent); transform:translateY(-3px) }}
.bonus-card:focus-within {{ border-color:var(--accent-primary-hover) }}
.bonus-art {{ position:relative; display:grid; place-items:center; height:128px; background:radial-gradient(ellipse at 50% 70%,color-mix(in srgb,var(--tile-accent) 20%,transparent),transparent 72%),linear-gradient(150deg,var(--tile-deep),#101C30) }}
.bonus-art::before {{ content:""; position:absolute; inset:0 0 auto; height:2px; background:var(--tile-accent); opacity:.8 }}
.bonus-art a {{ display:grid; place-items:center; width:100%; height:100%; border-radius:9px 9px 0 0; outline-offset:-4px }}
.bonus-art a > .ui-icon {{ position:absolute; top:12px; right:12px; width:13px; height:13px; color:var(--accent-highlight); opacity:.6; transition:color .18s,opacity .18s }}
.bonus-art a:hover > .ui-icon {{ color:var(--accent-highlight); opacity:1 }}
.bonus-image {{ display:block; max-width:88px; max-height:88px; image-rendering:auto; filter:drop-shadow(0 5px 7px #0005) }}
.bonus-image-placeholder {{ position:absolute; inset:auto; display:grid; place-items:center; width:100%; padding:16px; color:var(--text-secondary); font-size:13px; text-align:center; pointer-events:none }}
.bonus-card-body {{ padding:15px 15px 12px; border-top:1px solid color-mix(in srgb,var(--tile-accent) 18%,transparent); background:linear-gradient(140deg,color-mix(in srgb,var(--tile-accent) 8%,var(--bg-card)),var(--bg-surface)) }}
.bonus-card h3 {{ min-height:38px; margin:0 0 8px; font-size:14px; font-weight:600; line-height:1.45; letter-spacing:-.01em; overflow-wrap:anywhere }}
.bonus-date {{ display:block; color:var(--text-secondary); font-size:12px; font-variant-numeric:tabular-nums }}
.asset-details {{ margin-top:11px; padding-top:9px; border-top:1px solid #2A3A5280 }}
.asset-details summary {{ color:var(--text-secondary); font-size:12px; list-style:none }}
.asset-details summary::after {{ content:"+"; float:right; color:var(--text-secondary) }}
.asset-details[open] summary::after {{ content:"−" }}
.asset-details summary:hover {{ color:var(--accent-highlight) }}
.asset-details summary::-webkit-details-marker {{ display:none }}
.bonus-filename {{ display:block; margin-top:9px; color:var(--text-secondary); font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere }}
.variant-note {{ margin:7px 0 0; color:var(--text-secondary); font-size:12px; line-height:1.6 }}
.search-empty {{ padding:32px 20px; border:1px dashed var(--border-default); border-radius:var(--radius-md); text-align:center; color:var(--text-secondary) }}
.search-empty strong {{ display:block; margin-bottom:5px; color:var(--text-primary); font-size:16px; font-weight:550 }}
.search-empty p {{ margin-bottom:14px; font-size:14px }}
.string-result-status {{ margin:11px 0 22px }}
.string-groups {{ display:grid; gap:28px }}
.string-date-group {{ display:grid; grid-template-columns:115px minmax(0,1fr); gap:24px; align-items:start }}
.string-date-group h3 {{ position:sticky; top:82px; margin:0; padding:13px 0 0; font-size:20px; font-weight:550; line-height:1.4; letter-spacing:-.025em; font-variant-numeric:tabular-nums }}
.string-date-group h3 small {{ display:block; margin-top:3px; color:var(--text-secondary); font-size:13px; font-weight:400; letter-spacing:0 }}
.latest-label {{ display:inline-flex; gap:5px; align-items:center; margin-top:10px; color:var(--accent-highlight); font-size:12px; font-weight:500; letter-spacing:0 }}
.latest-label::before {{ content:""; width:4px; height:4px; border-radius:50%; background:currentColor }}
.string-rows {{ overflow:hidden; border:1px solid var(--border-default); border-radius:var(--radius-md); background:var(--bg-surface) }}
.string-date-group .string-rows {{ border-left:2px solid #285486 }}
.string-date-group:nth-child(3n+2) .string-rows {{ border-left-color:#0EA5E9 }}
.string-date-group:nth-child(3n+3) .string-rows {{ border-left-color:#38BDF8 }}
.string-date-group:first-child .string-rows {{ border-left-color:var(--accent-highlight); background:linear-gradient(115deg,#12243A,var(--bg-surface)) }}
.string-row {{ display:grid; grid-template-columns:40px minmax(0,1fr); gap:14px; align-items:start; padding:16px 19px; border-bottom:1px solid #2A3A5280; transition:background .18s }}
.string-row:last-child {{ border-bottom:0 }}
.string-row:hover {{ background:#18223580 }}
.string-prefix {{ margin-top:3px; color:var(--text-secondary); font:12px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace }}
.string-text {{ margin:0; color:#D8E1EE; font-size:15px; line-height:1.8; overflow-wrap:anywhere }}
.string-text strong {{ color:var(--text-primary); font-weight:550 }}
.string-text code {{ padding:1px 4px; border-radius:3px; color:var(--accent-highlight); background:#3B82F60F; font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap }}
.audit {{ margin:22px 0 0 139px; padding:12px 0; border-top:1px solid var(--border-default); font-size:13px }}
.audit summary {{ color:var(--text-secondary) }}
.audit .strings {{ padding-left:20px; color:var(--text-secondary); line-height:1.8; overflow-wrap:anywhere }}
.strings li {{ margin:.7em 0 }}
.archive-shell {{ display:block; margin-top:64px; overflow:clip; border:1px solid #365875; border-radius:var(--radius-lg); background:var(--bg-surface); scroll-margin-top:82px }}
.archive-shell .section-number {{ color:var(--accent-highlight); border-color:#7DD3FC66; background:#7DD3FC14 }}
.archive-summary {{ display:grid; grid-template-columns:42px minmax(0,1fr) auto; gap:18px; align-items:center; padding:26px 28px; cursor:pointer; list-style:none; background:linear-gradient(110deg,#13263D,#12374C) }}
.archive-summary::-webkit-details-marker {{ display:none }}
.archive-mark {{ display:grid; place-items:center; width:42px; height:42px; border:1px solid #7DD3FC40; border-radius:var(--radius-md); color:var(--accent-highlight); background:#38BDF814 }}
.archive-summary::after {{ content:"+"; display:grid; place-items:center; width:30px; height:30px; color:var(--text-secondary); font-size:22px; font-weight:300; transition:color .18s }}
.archive-shell[open] > .archive-summary::after {{ content:"−" }}
.archive-summary:hover::after {{ color:var(--accent-highlight) }}
.archive-summary strong {{ display:block; font-size:22px; font-weight:600; line-height:1.25; letter-spacing:-.025em }}
.archive-summary small {{ display:block; margin-top:6px; color:var(--text-secondary); font-size:13px }}
.archive-summary .eyebrow {{ margin-bottom:6px }}
.archive-content {{ padding:0 28px 28px; border-top:1px solid var(--border-default) }}
.archive-tools {{ display:flex; justify-content:space-between; align-items:center; gap:28px; margin:22px 0 14px }}
.archive-tools p {{ max-width:620px; margin:0; font-size:13px; line-height:1.7 }}
.status-legend {{ display:flex; flex-wrap:wrap; gap:14px; font-size:12px; white-space:nowrap }}
.status-legend span {{ display:inline-flex; align-items:center; gap:5px }}
.status-legend span::before {{ content:""; width:5px; height:5px; border-radius:50%; background:currentColor }}
.history-controls {{ position:sticky; top:58px; z-index:3; padding:0 0 16px; background:#111827F5; backdrop-filter:blur(12px) }}
.history-controls .toolbar input {{ width:100% }}
.type-tabs {{ display:flex; flex-wrap:wrap; gap:7px; margin-top:12px }}
.type-filter {{ display:flex; gap:9px; align-items:center; min-height:36px; padding:7px 11px; border:1px solid var(--border-default); border-radius:var(--radius-sm); color:var(--text-secondary); background:transparent; font-size:13px; transition:color .18s,border-color .18s,background .18s }}
.type-filter:hover {{ color:var(--text-primary); border-color:#49617F }}
.type-filter[aria-pressed="true"] {{ color:var(--text-primary); border-color:#60A5FA; background:linear-gradient(110deg,#1D4C92,#126282) }}
.type-filter small {{ padding:0 5px; border-radius:3px; color:var(--text-secondary); background:#94A3B810; font-size:12px; font-variant-numeric:tabular-nums }}
.history-result-status {{ margin:0 0 14px }}
.history-type-list {{ display:grid; gap:10px }}
.history-type-section {{ overflow:clip; border:1px solid var(--border-default); border-radius:var(--radius-md); background:var(--bg-surface) }}
.history-type-section > summary {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:20px; align-items:center; padding:19px 20px; cursor:pointer; list-style:none }}
.history-type-section > summary:hover {{ background:#18223580 }}
.history-type-section > summary::-webkit-details-marker,.history-date-group > summary::-webkit-details-marker {{ display:none }}
.history-type-title {{ display:grid; grid-template-columns:18px minmax(0,1fr); column-gap:12px; align-items:center }}
.history-type-title::before {{ content:"+"; grid-row:1/3; color:var(--accent-primary-hover); font-size:18px; line-height:1 }}
.history-type-section[open] .history-type-title::before {{ content:"−" }}
.history-type-title strong {{ font-size:15px; font-weight:550 }}
.history-type-title small {{ grid-column:2; margin-top:3px; color:var(--text-secondary); font-size:12px }}
.history-type-summary {{ max-width:220px; color:var(--text-secondary); font-size:12px; text-align:right }}
.history-date-list {{ border-top:1px solid var(--border-default) }}
.history-date-group {{ border-bottom:1px solid #2A3A5280 }}
.history-date-group:last-child {{ border-bottom:0 }}
.history-date-group > summary {{ display:grid; grid-template-columns:14px 120px minmax(0,1fr); gap:12px; align-items:center; padding:13px 20px; cursor:pointer; list-style:none }}
.history-date-group > summary:hover {{ background:#18223560 }}
.history-date-group > summary::before {{ content:"›"; color:var(--text-secondary); font-size:18px; line-height:1; transition:transform .18s; text-align:center }}
.history-date-group[open] > summary::before {{ transform:rotate(90deg); color:var(--accent-primary-hover) }}
.history-date {{ color:var(--text-secondary); font-size:13px; font-weight:500; font-variant-numeric:tabular-nums }}
.history-date-count {{ color:var(--text-secondary); font-size:12px; text-align:right }}
.history-date-content {{ padding:0 20px 14px 46px }}
.history-file-list {{ list-style:none; padding:0; margin:0; border-top:1px solid var(--border-default) }}
.history-file {{ display:grid; grid-template-columns:72px 66px minmax(0,1fr); gap:12px; align-items:start; padding:13px 0; border-bottom:1px solid #2A3A5280; overflow-wrap:anywhere; font-size:13px }}
.history-file:last-child,.history-string:last-child {{ border-bottom:0 }}
.history-file-image {{ grid-template-columns:84px 72px minmax(0,1fr); align-items:center }}
.history-image {{ display:block; width:76px; height:64px; object-fit:contain; border:1px solid var(--border-default); border-radius:var(--radius-sm); background:var(--bg-app) }}
.image-placeholder {{ display:grid; place-items:center; width:76px; height:64px; padding:5px; border:1px dashed var(--border-default); border-radius:var(--radius-sm); color:var(--text-secondary); font-size:12px; line-height:1.4; text-align:center }}
.history-file-name {{ color:var(--text-primary); font-size:13px; overflow-wrap:anywhere }}
.history-file-meta {{ min-width:0 }}
.image-state,.image-variants {{ display:block; margin-top:4px; color:var(--text-secondary); font-size:12px }}
.image-unavailable .history-file-name {{ color:var(--text-secondary) }}
.history-string {{ display:grid; grid-template-columns:72px minmax(0,1fr); gap:12px; padding:14px 0; border-bottom:1px solid #2A3A5280; font-size:14px; line-height:1.7; overflow-wrap:anywhere }}
.change {{ display:inline-flex; align-items:center; gap:5px; width:fit-content; color:var(--text-secondary); font:12px/1.6 Inter,ui-sans-serif,system-ui,sans-serif; font-weight:600; letter-spacing:.04em; text-transform:uppercase }}
.change-added {{ color:var(--status-added) }} .change-updated {{ color:var(--status-changed) }} .change-removed {{ color:var(--status-removed) }} .change-current {{ color:var(--status-current) }}
.history-file .change,.history-string .change {{ padding:3px 6px; border:1px solid #94A3B822; border-radius:4px }}
.history-empty {{ padding:30px 10px; color:var(--text-secondary); text-align:center; font-size:14px }}
.dashboard-footer {{ display:flex; justify-content:space-between; gap:28px; align-items:flex-end; margin-top:60px; padding-top:22px; border-top:1px solid var(--border-default) }}
.realm-note {{ display:flex; flex-wrap:wrap; align-items:center; gap:16px; color:var(--text-secondary); font-size:12px }}
.realm-note a {{ color:var(--text-secondary); text-decoration:none }}
.realm-note a:hover {{ color:var(--accent-highlight) }}
.dashboard-signature {{ margin-left:auto; text-align:right }}
.dashboard-signature strong {{ display:block; color:#C7D2E2; font-size:13px; font-weight:500 }}
.dashboard-signature span {{ display:flex; align-items:center; justify-content:flex-end; gap:5px; margin-top:4px; color:var(--text-secondary); font-size:12px }}
.dashboard-signature .ui-icon {{ width:12px; height:12px }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:14px }}
.card {{ overflow:hidden; border:1px solid var(--border-default); border-radius:var(--radius-md); background:var(--bg-card) }}
.card-body,.building {{ padding:16px }}
.thumb {{ width:100%; height:190px; object-fit:contain; background:var(--bg-app) }}
.tag {{ display:inline-block; margin:0 5px 5px 0; padding:2px 7px; border:1px solid var(--border-default); border-radius:var(--radius-sm); color:var(--text-secondary); font-size:12px }}
.name {{ overflow-wrap:anywhere; font-weight:600 }}
.summary {{ color:var(--text-secondary); overflow-wrap:anywhere }}
pre {{ max-height:260px; overflow:auto; padding:12px; background:var(--bg-app); border-radius:var(--radius-sm); white-space:pre-wrap; overflow-wrap:anywhere }}
@media (max-width:1100px) {{
  .hero-body {{ gap:22px; max-width:610px }} .stats {{ gap:22px }}
  .bonus-grid {{ grid-template-columns:repeat(4,minmax(0,1fr)) }}
  .section-head {{ display:block }} .section-head p {{ margin-top:12px; max-width:600px }}
}}
@media (max-width:800px) {{
  main {{ padding:24px 24px 30px }} .hero-body {{ grid-template-columns:1fr; gap:20px; margin-top:26px }}
  .stats {{ display:flex; max-width:none; gap:28px }} .stat {{ display:flex; align-items:center; gap:11px; padding-left:0; border:0 }} .stat + .stat {{ padding-left:22px; border-left:1px solid var(--border-default) }}
  .stat strong {{ font-size:24px }} .stat span {{ max-width:110px; margin:0; font-size:12px }}
  .bonus-gallery-head {{ align-items:start; gap:24px }} .bonus-gallery-head p {{ max-width:300px; font-size:13px }}
  .bonus-grid {{ grid-template-columns:repeat(3,minmax(0,1fr)) }}
  .string-date-group {{ grid-template-columns:90px minmax(0,1fr); gap:16px }} .audit {{ margin-left:106px }}
  .archive-tools {{ flex-direction:column; align-items:start; gap:12px }}
}}
@media (max-width:600px) {{
  main {{ padding:18px 18px 26px }} .hero {{ padding:19px 17px 20px; margin-bottom:7px; background-image:linear-gradient(90deg,#091322EB,#0C1B2D8C),url("assets/{HEADER_IMAGE}"); background-position:center,right center }}
  .hero > .hero-clouds {{ opacity:.85; mask-image:linear-gradient(90deg,transparent 12%,#000 75%) }}
  .masthead {{ flex-wrap:wrap; gap:10px }} .brand {{ font-size:12px; letter-spacing:.08em; gap:9px }} .brand-mark {{ width:29px; height:29px; padding:5px; border-radius:7px }}
  .snapshot-stamp {{ font-size:12px; margin-left:38px; margin-top:-4px; padding:0; border:0; background:transparent }}
  .hero-body {{ margin-top:22px; gap:19px }} h1 {{ font-size:34px; max-width:340px; margin-bottom:12px }} h2 {{ font-size:26px }}
  .intro {{ font-size:14px; line-height:1.75 }} .beta-note {{ font-size:12px; margin-top:8px }}
  .stats {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px }} .stat {{ flex-direction:column; align-items:start; gap:4px }} .stat + .stat {{ padding-left:16px }} .stat strong {{ font-size:23px }} .stat span {{ font-size:12px; max-width:none }}
  .nav {{ gap:16px; justify-content:space-between; margin-bottom:27px; overflow-x:auto }} .nav a {{ min-height:51px; padding:14px 0; font-size:12px; gap:5px; flex-shrink:0 }} .nav .ui-icon {{ width:13px; height:13px }}
  .bonus-gallery-section,#active-strings,.archive-shell {{ scroll-margin-top:69px }}
  .bonus-gallery-head,.section-head {{ display:block; margin-bottom:17px }} .bonus-gallery-head p,.section-head p {{ max-width:none; margin-top:10px; font-size:13px; line-height:1.7 }}
  .eyebrow {{ font-size:12px; margin-bottom:7px; letter-spacing:.11em }}
  .bonus-gallery-tools {{ gap:8px }} input,select {{ min-height:46px }} input {{ font-size:16px }} select {{ font-size:14px; min-width:140px; width:140px; padding-left:10px; padding-right:22px }}
  .search-field input {{ padding-left:35px; padding-right:22px }} .search-field > .ui-icon {{ left:11px; width:15px; height:15px }}
  .result-line {{ margin-bottom:12px; gap:8px }} .bonus-result-status {{ font-size:12px }} .gallery-hint {{ font-size:12px }} .gallery-hint .ui-icon {{ display:none }}
  .bonus-grid {{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px }}
  .bonus-art {{ height:108px }} .bonus-image {{ max-width:74px; max-height:74px }}
  .bonus-card-body {{ padding:12px 12px 10px }} .bonus-card h3 {{ min-height:37px; font-size:13px }} .bonus-date {{ font-size:12px }} .asset-details {{ margin-top:9px; padding-top:8px }} .asset-details summary {{ font-size:12px }}
  #active-strings {{ margin-top:40px; padding-top:27px }} .string-groups {{ gap:25px }}
  .string-date-group {{ display:block }} .string-date-group h3 {{ position:static; display:flex; align-items:baseline; gap:8px; padding:0; margin-bottom:10px; font-size:16px }}
  .string-date-group h3 time {{ display:flex; align-items:baseline; gap:8px }} .string-date-group h3 small {{ margin:0; font-size:12px }} .latest-label {{ margin:0 0 0 auto; font-size:12px }}
  .string-row {{ grid-template-columns:36px minmax(0,1fr); gap:9px; padding:15px 12px }} .string-text {{ font-size:14px; line-height:1.85 }} .string-text code {{ font-size:12px; padding:1px 2px }} .string-prefix {{ font-size:12px; margin-top:5px }}
  .audit {{ margin-left:0; font-size:12px }}
  .archive-shell {{ margin-top:40px }} .archive-summary {{ grid-template-columns:30px minmax(0,1fr) 20px; gap:12px; padding:20px 16px }}
  .archive-mark {{ width:30px; height:34px; border-radius:7px }} .archive-mark .ui-icon {{ width:16px; height:16px }} .archive-summary strong {{ font-size:18px }} .archive-summary small {{ font-size:12px; line-height:1.7 }} .archive-summary::after {{ width:20px }}
  .archive-content {{ padding:0 14px 20px }} .archive-tools {{ margin-top:17px }} .archive-tools p {{ font-size:12px }}
  .history-controls {{ top:52px; padding-bottom:12px }} .type-tabs {{ gap:6px }} .type-filter {{ flex:1 0 auto; justify-content:space-between; padding:7px 9px; font-size:12px; gap:7px }} .type-filter small {{ font-size:12px }}
  .history-type-section > summary {{ grid-template-columns:1fr; gap:8px; padding:15px 13px }} .history-type-title strong {{ font-size:14px }} .history-type-title small {{ font-size:12px }} .history-type-summary {{ max-width:none; padding-left:30px; text-align:left; font-size:12px }}
  .history-date-group > summary {{ grid-template-columns:12px minmax(0,1fr); gap:4px 9px; padding:12px }} .history-date-count {{ grid-column:2; text-align:left; font-size:12px }}
  .history-date-content {{ padding:0 12px 12px }}
  .history-file {{ grid-template-columns:65px minmax(0,1fr); gap:7px 10px }} .history-file > a,.history-file > .history-file-name {{ grid-column:1/-1 }}
  .history-file-image {{ grid-template-columns:60px minmax(0,1fr); align-items:start; padding:13px 0 }}
  .history-file-image > img,.history-file-image > .image-placeholder {{ grid-row:1/3; width:56px; height:56px }}
  .history-file-image > .change {{ grid-column:2; margin-top:1px }} .history-file-image > .history-file-meta {{ grid-column:2 }}
  .history-file-name {{ font-size:12px; line-height:1.6 }} .image-state,.image-variants {{ font-size:12px }} .change {{ font-size:12px }}
  .history-string {{ grid-template-columns:1fr; gap:7px; font-size:13px }} .history-result-status {{ font-size:12px }}
  .dashboard-footer {{ margin-top:40px; gap:20px; align-items:start; flex-direction:column; padding-top:18px }} .realm-note {{ font-size:12px }} .dashboard-signature {{ align-self:flex-end }} .dashboard-signature strong {{ font-size:12px }}
}}
@media (max-width:360px) {{ main {{ padding-inline:13px }} .nav a {{ font-size:12px; gap:4px }} .nav .ui-icon {{ width:12px }} .gallery-hint {{ display:none }} .stats {{ gap:12px }} .stat + .stat {{ padding-left:12px }} }}
@media (prefers-reduced-motion:reduce) {{ html {{ scroll-behavior:auto }} *,*::before,*::after {{ transition:none !important }} .cloud-layer {{ animation:none !important }} .hero > .hero-clouds {{ filter:none }} }}
</style>
</head>
<body><main id="top">
<header class="hero">
<svg class="cloud-effects" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><defs>
<filter id="cloud-warp" x="-5%" y="-15%" width="110%" height="130%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency=".006 .022" numOctaves="2" seed="9" result="cloud-noise"/>
<feDisplacementMap in="SourceGraphic" in2="cloud-noise" scale="22" xChannelSelector="R" yChannelSelector="G"/>
</filter></defs></svg>
<div class="hero-clouds" aria-hidden="true"><span class="cloud-layer cloud-layer-high"></span><span class="cloud-layer cloud-layer-mid"></span><span class="cloud-layer cloud-layer-low"></span></div>
<div class="masthead"><div class="brand"><span class="brand-mark">{_ui_icon("building")}</span>{page_eyebrow}</div><div class="snapshot-stamp" title="Last successful check for new beta data">Data through {checked_stamp}</div></div>
<div class="hero-body"><div><h1>{html.escape(page_heading)}</h1>
<p class="intro">{page_context}</p><p class="beta-note">Beta previews, not confirmed releases. Details may change.</p></div>
<div class="stats stats-{len(stats)}">{stat_html}</div></div>
</header>
<nav class="nav" aria-label="Dashboard sections">{bonus_nav}{string_nav}{history_nav}</nav>
{bonus_section}
{string_section}
{history_section}
{latest_section}
<footer class="dashboard-footer" id="dashboard-footer"><span class="realm-note">Forge of Empires · zz1 public beta <a href="#top">Back to top ↑</a></span>
<div class="dashboard-signature"><strong>Another zpwd dashboard.</strong><span>{_ui_icon("moon")}Sleep deprived mode.</span></div></footer>
</main>
<script>
const cloudHero=document.querySelector('.hero'),cloudNoise=document.querySelector('#cloud-warp feTurbulence'),cloudDisplacement=document.querySelector('#cloud-warp feDisplacementMap'),cloudMotion=matchMedia('(prefers-reduced-motion: reduce)');
const cloudLayers=[...document.querySelectorAll('.cloud-layer')];
// Pick each layer's initial phase once per page load, before revealing the overlay.
for(const layer of cloudLayers){{
  const style=getComputedStyle(layer),phase=Math.random();
  const driftDuration=parseFloat(style.getPropertyValue('--drift-duration'));
  const densityDuration=parseFloat(style.getPropertyValue('--density-duration'));
  layer.style.setProperty('--drift-offset',`${{-phase*driftDuration}}s`);
  layer.style.setProperty('--density-offset',`${{-Math.random()*densityDuration}}s`);
  layer.style.setProperty('--cloud-start',`${{phase*50}}%`);
}}
cloudHero.querySelector('.hero-clouds').classList.add('clouds-ready');
let cloudHeroVisible=true,cloudMorphFrame=0,cloudMorphLast=null,cloudMorphElapsed=0,cloudMorphPaint=0,cloudDrifts=[];
function updateCloudShape(seconds){{
  const phase=seconds*Math.PI*2;
  cloudNoise.setAttribute('baseFrequency',`${{(.006+.0012*Math.sin(phase/64)).toFixed(5)}} ${{(.022+.004*Math.sin(phase/49+.8)).toFixed(5)}}`);
  cloudDisplacement.setAttribute('scale',(26+6*Math.sin(phase/37+1.4)).toFixed(2));
  // Independent, gently changing currents stay positive: clouds never reverse or stop.
  for(const [index,drift] of cloudDrifts.entries()){{
    const wind=.95+.16*Math.sin(phase/(43+index*17)+index*2.1)+.07*Math.sin(phase/(19+index*7)+index*.9);
    drift.updatePlaybackRate(wind);
  }}
}}
function morphClouds(now){{
  if(cloudMorphLast!==null)cloudMorphElapsed+=(now-cloudMorphLast)/1000;
  cloudMorphLast=now;
  // Slow-changing mist needs only 12 shape updates per second; drift stays smooth in CSS.
  if(now-cloudMorphPaint>=1000/12){{updateCloudShape(cloudMorphElapsed);cloudMorphPaint=now}}
  cloudMorphFrame=requestAnimationFrame(morphClouds);
}}
function syncCloudMotion(){{
  const paused=document.hidden||!cloudHeroVisible||cloudMotion.matches;
  cloudHero.classList.toggle('clouds-idle',paused);
  cloudDrifts=cloudLayers.map(layer=>layer.getAnimations().find(animation=>animation.animationName==='cloud-drift')).filter(Boolean);
  if(paused){{cancelAnimationFrame(cloudMorphFrame);cloudMorphFrame=0;cloudMorphLast=null}}
  else if(!cloudMorphFrame)cloudMorphFrame=requestAnimationFrame(morphClouds);
}}
cloudMotion.addEventListener('change',syncCloudMotion);
document.addEventListener('visibilitychange',syncCloudMotion);
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{{cloudHeroVisible=entries[0].isIntersecting;syncCloudMotion()}}).observe(cloudHero);
syncCloudMotion();
const q=document.querySelector('#search'), k=document.querySelector('#kind'), cards=[...document.querySelectorAll('#files .card')];
function filter(){{const text=q.value.toLowerCase(),kind=k.value;for(const c of cards)c.classList.toggle('hidden',!c.dataset.search.includes(text)||(kind&&c.dataset.kind!==kind))}}
if(q&&k){{q.addEventListener('input',filter);k.addEventListener('change',filter)}}
const sq=document.querySelector('#string-search'), stringRows=[...document.querySelectorAll('#active-string-list .string-row')], stringGroups=[...document.querySelectorAll('#active-string-list .string-date-group')];
function filterStrings(){{
  const value=sq.value.trim().toLowerCase();let visible=0,dates=0;
  for(const row of stringRows){{const matches=row.dataset.search.includes(value);row.classList.toggle('hidden',!matches);if(matches)visible++}}
  for(const group of stringGroups){{const matches=[...group.querySelectorAll('.string-row')].some(row=>!row.classList.contains('hidden'));group.classList.toggle('hidden',!matches);if(matches)dates++}}
  document.querySelector('#string-result-status').textContent=`${{visible}} ${{visible===1?'description':'descriptions'}} · ${{dates}} update ${{dates===1?'date':'dates'}}`;
  document.querySelector('#string-empty').hidden=visible>0||!value;
}}
if(sq){{sq.addEventListener('input',filterStrings);filterStrings()}}
const bq=document.querySelector('#bonus-search'),bonusCards=[...document.querySelectorAll('#bonus-grid .bonus-card')],bonusStatus=document.querySelector('#bonus-result-status');
function filterBonuses(){{if(!bq)return;const value=bq.value.trim().toLowerCase();let visible=0;for(const card of bonusCards){{const matches=card.dataset.search.includes(value);card.classList.toggle('hidden',!matches);if(matches)visible++}}bonusStatus.textContent=`${{visible}} bonus ${{visible===1?'icon':'icons'}}${{value?' found':''}}`;document.querySelector('#bonus-empty').hidden=visible>0||!value}}
if(bq){{bq.addEventListener('input',filterBonuses);filterBonuses()}}
const bonusSort=document.querySelector('#bonus-sort');
if(bonusSort)bonusSort.addEventListener('change',()=>{{
  const ordered=[...bonusCards].sort((a,b)=>(bonusSort.value==='newest'?b.dataset.date.localeCompare(a.dataset.date):0)||a.dataset.name.localeCompare(b.dataset.name));
  document.querySelector('#bonus-grid').append(...ordered);
}});
for(const button of document.querySelectorAll('[data-clear-search]'))button.addEventListener('click',()=>{{const input=document.getElementById(button.dataset.clearSearch);input.value='';input.dispatchEvent(new Event('input'));input.focus()}});
let hq,typeButtons=[],typeSections=[],historyStatus,historyEmpty;
let activeHistoryType='all';
function filterHistory(){{
  if(!hq)return;
  const value=hq.value.trim().toLowerCase();let visibleItems=0;const visibleDateKeys=new Set();
  for(const section of typeSections){{
    const typeMatches=activeHistoryType==='all'||section.dataset.historyType===activeHistoryType;let sectionItems=0;
    for(const dateGroup of section.querySelectorAll('.history-date-group')){{
      const dateMatches=Boolean(value&&dateGroup.dataset.date.includes(value));let dateItems=0;
      for(const item of dateGroup.querySelectorAll('.history-item')){{
        const matches=!value||dateMatches||(`${{section.dataset.historyType}} ${{item.textContent}}`).toLowerCase().includes(value);
        item.classList.toggle('hidden',!matches);if(matches)dateItems++;
      }}
      const showDate=typeMatches&&dateItems>0;dateGroup.classList.toggle('hidden',!showDate);
      if(showDate){{visibleDateKeys.add(dateGroup.dataset.date);sectionItems+=dateItems;if(value)dateGroup.open=true}}
    }}
    const showSection=typeMatches&&sectionItems>0;section.classList.toggle('hidden',!showSection);
    if(showSection){{visibleItems+=sectionItems;if(value||activeHistoryType!=='all')section.open=true}}
  }}
  historyEmpty.hidden=visibleItems>0;
  const scope=activeHistoryType==='all'?'all types':activeHistoryType;
  historyStatus.textContent=`${{visibleItems.toLocaleString()}} entries across ${{visibleDateKeys.size}} ${{visibleDateKeys.size===1?'date':'dates'}} · ${{scope}}`;
}}
function activateHistory(){{
  hq=document.querySelector('#history-search');typeButtons=[...document.querySelectorAll('.type-filter')];typeSections=[...document.querySelectorAll('.history-type-section')];historyStatus=document.querySelector('#history-result-status');historyEmpty=document.querySelector('#history-empty');
  for(const button of typeButtons)button.addEventListener('click',()=>{{activeHistoryType=button.dataset.historyFilter;for(const candidate of typeButtons)candidate.setAttribute('aria-pressed',String(candidate===button));filterHistory()}});
  if(hq){{hq.addEventListener('input',filterHistory);filterHistory()}}
  for(const img of document.querySelectorAll('.history-image')){{
    const row=img.closest('.history-file-image'),placeholder=row.querySelector('.image-placeholder'),state=row.querySelector('.image-state');
    img.addEventListener('error',()=>{{
      const fallback=img.dataset.fallbackSrc;
      if(fallback&&!img.dataset.fallbackTried){{img.dataset.fallbackTried='1';img.src=fallback;return}}
      img.hidden=true;placeholder.hidden=false;row.classList.add('image-unavailable');state.textContent='Preview unavailable';
    }});
    img.addEventListener('load',()=>{{if(img.dataset.fallbackTried)state.textContent='Original preview unavailable; showing a newer version'}});
  }}
}}
const snapshotLink=document.querySelector('a[href="#snapshot"]'),snapshot=document.querySelector('#snapshot');
let historyLoaded=false,historyPromise;
function loadHistory(){{
  if(!snapshot||historyLoaded||historyPromise)return historyPromise;
  const pending=snapshot.querySelector('.archive-content');
  pending.innerHTML='<p class="meta" role="status">Loading the change archive…</p>';
  historyPromise=(async()=>{{
    try{{
      const response=await fetch('./history.html');
      if(!response.ok)throw new Error(`HTTP ${{response.status}}`);
      pending.outerHTML=await response.text();
      historyLoaded=true;activateHistory();
    }}catch(error){{
      pending.innerHTML='<p class="meta" role="alert">Couldn’t load the archive. Check your connection, then try again. <button type="button" id="retry-history">Try again</button></p>';
      pending.querySelector('#retry-history').addEventListener('click',loadHistory);
    }}finally{{historyPromise=null}}
  }})();
  return historyPromise;
}}
if(snapshot)snapshot.addEventListener('toggle',()=>{{if(snapshot.open)loadHistory()}});
async function openArchive(behavior='smooth'){{
  snapshot.open=true;
  await loadHistory();
  snapshot.scrollIntoView({{block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':behavior}});
}}
if(snapshotLink&&snapshot)snapshotLink.addEventListener('click',event=>{{event.preventDefault();window.history.replaceState(null,'','#snapshot');openArchive()}});
if(snapshot&&location.hash==='#snapshot')openArchive('instant');
const bonusLink=document.querySelector('a[href="#great-building-bonuses"]'),bonusSection=document.querySelector('#great-building-bonuses');
if(bonusLink&&bonusSection) bonusLink.addEventListener('click',()=>requestAnimationFrame(()=>bonusSection.scrollIntoView({{block:'start',behavior:'instant'}})));
if(bonusSection&&location.hash==='#great-building-bonuses') requestAnimationFrame(()=>bonusSection.scrollIntoView({{block:'start',behavior:'instant'}}));
for(const img of document.querySelectorAll('.bonus-image')){{
  const unavailable=()=>{{img.hidden=true;img.closest('.bonus-art').querySelector('.bonus-image-placeholder').hidden=false}};
  img.addEventListener('error',unavailable);
  if(img.complete&&!img.naturalWidth)unavailable();
}}
const sectionLinks=[...document.querySelectorAll('.nav a')];
let navFrame=false;
function updateSectionNav(){{
  let current=sectionLinks[0];
  for(const link of sectionLinks){{const section=document.querySelector(link.getAttribute('href'));if(section&&section.getBoundingClientRect().top<=145)current=link}}
  for(const link of sectionLinks){{if(link===current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')}}
  navFrame=false;
}}
window.addEventListener('scroll',()=>{{if(!navFrame){{navFrame=true;requestAnimationFrame(updateSectionNav)}}}},{{passive:true}});
updateSectionNav();
</script></body></html>"""
    (destination / "index.html").write_text(document, encoding="utf-8")


def _file_card(record: FileRecord, destination: Path) -> str:
    parsed_name = record.url.rsplit("/", 1)[-1]
    local = record.local_path
    src = local or record.url
    preview = ""
    if record.kind == "image":
        preview = f'<img class="thumb" loading="lazy" src="{html.escape(src)}" alt="">'
    elif local and record.kind in {"text", "metadata"}:
        try:
            raw = (destination / local).read_text(encoding="utf-8", errors="replace")
            if record.extension == ".json":
                raw = json.dumps(json.loads(raw), indent=2, ensure_ascii=False)
            preview = f"<pre>{html.escape(raw[:3000])}</pre>"
        except (OSError, json.JSONDecodeError):
            preview = ""
    tags = f'<span class="tag">{html.escape(record.change)}</span><span class="tag">{html.escape(record.kind)}</span>'
    if record.size is not None:
        tags += f'<span class="tag">{_size(record.size)}</span>'
    summary = f'<p class="summary">{html.escape(record.summary)}</p>' if record.summary else ""
    error = f'<p class="summary">Download error: {html.escape(record.error)}</p>' if record.error else ""
    search = " ".join(filter(None, [record.url, record.change, record.kind, record.summary])).lower()
    return f'''<article class="card" data-kind="{html.escape(record.kind)}" data-search="{html.escape(search)}">
{preview}<div class="card-body">{tags}<div class="name">{html.escape(parsed_name)}</div>{summary}{error}<a href="{html.escape(src)}" target="_blank">View file</a></div></article>'''


def _latest_report_section(
    report: ParsedReport,
    file_rows: str,
    added_strings: str,
    removed_strings: str,
    building_rows: str,
) -> str:
    return f'''<details class="archive-shell" id="latest"><summary class="archive-summary"><span class="archive-mark">{_ui_icon("history")}</span><span><strong>Latest beta report</strong><small>Files, game text, and building data published on {html.escape(_date_text(report.report_id[:10]))}</small></span></summary><div class="archive-content"><h2 id="files-heading">Changed files</h2>
<div class="toolbar"><input id="search" type="search" placeholder="Search filenames or descriptions…" aria-label="Search changed files"> <select id="kind" aria-label="Filter files by type"><option value="">All file types</option><option>image</option><option>text</option><option>metadata</option><option>audio</option><option>font</option><option>binary</option></select></div>
<h2>Added game text</h2><ul class="strings">{added_strings}</ul>
<details><summary>Removed game text ({len(report.removed_strings)})</summary><ul class="strings">{removed_strings}</ul></details>
<h2 id="building-heading">Building changes</h2><div class="grid">{building_rows or '<p>No building changes in this report.</p>'}</div>
<h2>Updated data groups</h2><ul>{_list(report.metadata_families)}</ul>
</div></details>'''


def _great_building_bonus_section(results: dict) -> str:
    images = _current_great_building_bonus_images(results.get("reports", []))
    images.sort(key=lambda record: str(record.get("date", "")), reverse=True)
    cards = "".join(_great_building_bonus_card(image) for image in images)
    return f'''<section class="bonus-gallery-section" id="great-building-bonuses">
<div class="bonus-gallery-head"><div><div class="eyebrow"><span class="section-number">01</span> A FIRST LOOK</div><h2>Great Building bonus icons</h2></div>
<p class="meta">Recently added or updated bonus artwork, with one highest-resolution image per bonus. Icons later marked as removed are excluded.</p></div>
<div class="bonus-gallery-tools"><div class="search-field">{_ui_icon("search")}<input id="bonus-search" type="search" placeholder="Search bonuses…" aria-label="Search Great Building bonus icons by name or date"></div><select id="bonus-sort" aria-label="Sort bonus icons"><option value="newest">Newest first</option><option value="name">Name: A–Z</option></select></div>
<div class="result-line"><p class="bonus-result-status" id="bonus-result-status" aria-live="polite">{len(images)} bonus icons</p><span class="gallery-hint">{_ui_icon("external")}Select an icon for the full image</span></div>
<div class="bonus-grid" id="bonus-grid">{cards or '<p class="meta">No bonus icons in this reporting window.</p>'}</div>
<div class="search-empty" id="bonus-empty" hidden><strong>No matching bonus icons</strong><p>Try a bonus name or update date.</p><button type="button" data-clear-search="bonus-search">Clear search</button></div>
</section>'''


def _current_great_building_bonus_images(reports: list[dict]) -> list[dict]:
    current_by_path: dict[str, dict | None] = {}
    related_families: set[str] = set()
    for report in reports:
        for record in report.get("files", []):
            if record.get("kind") != "image":
                continue
            url = record.get("url", "")
            family = _image_family_key(url)
            if "great_building_bonus" in url.lower():
                related_families.add(family)
            path_key = _image_asset_key(url)
            if path_key in current_by_path:
                continue
            if record.get("change") == "removed":
                current_by_path[path_key] = None
                continue
            current_by_path[path_key] = {
                **record,
                "date": report.get("date", ""),
            }

    by_family: dict[str, list[dict]] = {}
    for record in current_by_path.values():
        if not record:
            continue
        family = _image_family_key(record.get("url", ""))
        if family in related_families:
            by_family.setdefault(family, []).append(record)

    selected: list[dict] = []
    for family, records in by_family.items():
        winner = max(
            records,
            key=lambda record: (
                _image_resolution_rank(record.get("url", "")),
                str(record.get("date", "")),
            ),
        )
        selected.append({**winner, "family": family, "variant_count": len(records)})
    return sorted(selected, key=lambda record: _bonus_display_name(record.get("family", "")).lower())


def _bonus_display_name(family: str) -> str:
    stem = family.rsplit(".", 1)[0]
    if stem.startswith("bonus_"):
        stem = stem[len("bonus_"):]
    return stem.replace("_", " ").title()


def _great_building_bonus_card(record: dict) -> str:
    url = record.get("url", "")
    name = url.rsplit("/", 1)[-1]
    title = _bonus_display_name(record.get("family", ""))
    changed_date = str(record.get("date", ""))
    variant_count = int(record.get("variant_count", 1))
    search = html.escape(f"{title} {name} {changed_date}".lower())
    variant_text = (
        f'Highest resolution among {variant_count} versions in these reports.'
        if variant_count > 1
        else "Only one version recorded in these reports."
    )
    return f'''<article class="bonus-card" data-search="{search}" data-name="{html.escape(title.lower())}" data-date="{html.escape(changed_date)}">
<div class="bonus-art"><a href="{html.escape(url)}" target="_blank" rel="noopener" aria-label="Open original {html.escape(title)} icon"><img class="bonus-image" decoding="async" src="{html.escape(url)}" alt="{html.escape(title)}">{_ui_icon("external")}</a><span class="bonus-image-placeholder" hidden>Preview unavailable</span></div>
<div class="bonus-card-body"><h3>{html.escape(title)}</h3><span class="bonus-date">Last changed <time datetime="{html.escape(changed_date)}">{html.escape(_date_text(changed_date))}</time></span><details class="asset-details"><summary>Image details</summary><code class="bonus-filename">{html.escape(name)}</code><p class="variant-note">{html.escape(variant_text)}</p></details></div></article>'''


def _history_section(results: dict) -> str:
    shell, content = _history_parts(results)
    return f"{shell}{content}</details>"


def _history_parts(results: dict) -> tuple[str, str]:
    reports = results.get("reports", [])
    latest_images = _latest_image_urls(reports)
    type_specs = [
        ("images", "Images & artwork", "Building art, portraits, event graphics, and interface icons."),
        ("text", "Code & text files", "Scripts, stylesheets, configuration, and other text-based files."),
        ("audio", "Music & sound", "Music tracks and sound effects recorded in beta updates."),
        ("strings", "In-game text", "New and removed descriptions, labels, and messages."),
        ("buildings", "Building data", "Added, revised, and removed building definitions."),
        ("metadata", "Game metadata", "Structured game records and asset data groups."),
    ]
    type_results = [
        _history_type_section(
            reports,
            type_key=type_key,
            label=label,
            description=description,
            latest_images=latest_images,
            opened=type_key == "images",
        )
        for type_key, label, description in type_specs
    ]
    type_rows = "".join(result[0] for result in type_results)
    all_count = sum(result[1] for result in type_results)
    type_filters = "".join(
        f'''<button class="type-filter" type="button" data-history-filter="{type_key}" aria-pressed="false">{label}<small>{count:,}</small></button>'''
        for (type_key, label), (_, count, _) in zip(
            ((type_key, label) for type_key, label, _ in type_specs),
            type_results,
        )
    )
    until = results.get("until") or str(results.get("newest_report") or "latest")[:10]
    try:
        inclusive_days = (date.fromisoformat(until) - date.fromisoformat(results.get("since", ""))).days + 1
    except ValueError:
        inclusive_days = None
    snapshot_title = f"{inclusive_days}-day beta archive" if inclusive_days else "Beta change archive"
    shell = f'''<details class="archive-shell" id="snapshot"><summary class="archive-summary"><span class="archive-mark">{_ui_icon("history")}</span><span><span class="eyebrow"><span class="section-number">03</span> THE CHANGE ARCHIVE</span><strong>{snapshot_title}</strong>
<small>{results.get('reports_count', 0)} published reports · {html.escape(_date_text(results.get('since', '')))} — {html.escape(_date_text(until))}</small></span></summary>'''
    content = f'''<div class="archive-content"><div class="archive-tools"><p class="meta">Browse all recorded beta changes, not just Great Building bonuses. Filter by category or search by name and date. Smaller image variants are grouped; removed files have no links.</p><div class="status-legend" aria-label="Change status legend"><span class="change-added">Added</span><span class="change-updated">Updated</span><span class="change-removed">Removed</span></div></div>
<div class="history-controls"><div class="toolbar"><div class="search-field">{_ui_icon("search")}<input id="history-search" type="search" placeholder="Search names, dates, or changes…" aria-label="Search the beta change archive"></div></div>
<div class="type-tabs" role="group" aria-label="Filter change history by type"><button class="type-filter" type="button" data-history-filter="all" aria-pressed="true">All types<small>{all_count:,}</small></button>{type_filters}</div></div>
<p class="history-result-status" id="history-result-status" aria-live="polite"></p>
<div class="history-type-list" id="history-list">{type_rows or '<p>No published reports in this date range.</p>'}</div>
<p class="history-empty" id="history-empty" hidden>No matching changes. Try another category or a broader search.</p>
</div>'''
    return shell, content


def _history_type_section(
    reports: list[dict],
    type_key: str,
    label: str,
    description: str,
    latest_images: dict[str, str | None] | None = None,
    opened: bool = False,
) -> tuple[str, int, int]:
    date_rows: list[str] = []
    total_count = 0
    total_hidden_variants = 0
    for report in reports:
        date_row, item_count, hidden_variants = _history_type_date(
            report,
            type_key=type_key,
            latest_images=latest_images,
        )
        if date_row:
            date_rows.append(date_row)
            total_count += item_count
            total_hidden_variants += hidden_variants

    summary = f"{total_count:,} entries · {len(date_rows)} dates"
    if total_hidden_variants:
        summary += f" · {total_hidden_variants:,} smaller variants hidden"
    open_attribute = " open" if opened else ""
    section = f'''<details class="history-type-section" data-history-type="{html.escape(type_key)}"{open_attribute}>
<summary><span class="history-type-title"><strong>{html.escape(label)}</strong><small>{html.escape(description)}</small></span><span class="history-type-summary">{html.escape(summary)}</span></summary>
<div class="history-date-list">{''.join(date_rows)}</div></details>'''
    return section, total_count, len(date_rows)


def _history_type_date(
    report: dict,
    type_key: str,
    latest_images: dict[str, str | None] | None = None,
) -> tuple[str, int, int]:
    hidden_variants = 0
    if type_key == "images":
        image_files = [record for record in report.get("files", []) if record.get("kind") == "image"]
        display_files = _best_history_image_variants(image_files)
        item_rows = "".join(
            _history_file(record, latest_images=latest_images, variant_count=variant_count)
            for record, variant_count in display_files
        )
        item_count = len(display_files)
        hidden_variants = len(image_files) - item_count
        count_label = f'{item_count} {"image" if item_count == 1 else "images"}'
        if hidden_variants:
            count_label += f' · {hidden_variants} smaller {"variant" if hidden_variants == 1 else "variants"} hidden'
        content = f'<ul class="history-file-list">{item_rows}</ul>'
    elif type_key in {"text", "audio"}:
        files = [record for record in report.get("files", []) if record.get("kind") == type_key]
        item_rows = "".join(_history_file(record) for record in files)
        item_count = len(files)
        count_label = f"{item_count} files"
        content = f'<ul class="history-file-list">{item_rows}</ul>'
    elif type_key == "strings":
        added = report.get("strings", {}).get("added", [])
        removed = report.get("strings", {}).get("removed", [])
        item_rows = "".join(_history_string(value, "added") for value in added)
        item_rows += "".join(_history_string(value, "removed") for value in removed)
        item_count = len(added) + len(removed)
        count_label = f"{item_count} changes"
        content = item_rows
    elif type_key == "buildings":
        values = report.get("buildings", {})
        item_rows = "".join(_history_building(value, "added") for value in values.get("added", []))
        item_rows += "".join(_history_building(value, "updated") for value in values.get("updated", []))
        item_rows += "".join(_history_building(value, "removed") for value in values.get("removed", []))
        item_count = sum(len(values.get(change, [])) for change in ("added", "updated", "removed"))
        count_label = f"{item_count} changes"
        content = item_rows
    else:
        families = report.get("metadata_families", [])
        metadata_files = report.get("metadata_files", [])
        family_rows = "".join(
            f'<li class="history-string history-item"><span class="change">family</span><span>{html.escape(str(value))}</span></li>'
            for value in families
        )
        file_rows = "".join(_history_file(record) for record in metadata_files)
        item_count = len(families) + len(metadata_files)
        count_label = f"{len(families)} families · {len(metadata_files)} records"
        content = f'<ul class="history-file-list">{family_rows}{file_rows}</ul>'

    if not item_count:
        return "", 0, 0
    report_date = str(report.get("date", ""))
    date_row = f'''<details class="history-date-group" data-date="{html.escape(report_date.lower())}"><summary><span class="history-date">{html.escape(report_date)}</span><span class="history-date-count">{html.escape(count_label)}</span></summary>
<div class="history-date-content">{content}</div></details>'''
    return date_row, item_count, hidden_variants


def _image_asset_key(url: str) -> str:
    return IMAGE_HASH_RE.sub("", url.split("?", 1)[0])


def _image_family_key(url: str) -> str:
    name = _image_asset_key(url).rsplit("/", 1)[-1]
    stem, separator, extension = name.rpartition(".")
    if not separator:
        stem, extension = name, ""
    for prefix in BONUS_IMAGE_PREFIXES:
        if stem.startswith(prefix):
            stem = f"bonus_{stem[len(prefix):]}"
            break
    return f"{stem}.{extension.lower()}"


def _image_resolution_rank(url: str) -> int:
    clean_url = _image_asset_key(url).lower()
    explicit_sizes = [int(width) * int(height) for width, height in IMAGE_SIZE_RE.findall(clean_url)]
    if explicit_sizes:
        return max(explicit_sizes)
    if "/city/gui/great_building_bonus_icons/" in clean_url:
        return 70 * 70
    if "/shared/icons/goods_large/" in clean_url:
        return 64 * 64
    if "/shared/gui/boost/" in clean_url:
        return 44 * 44
    if "/shared/icons/goods/" in clean_url:
        return 22 * 22
    if any(prefix in clean_url.rsplit("/", 1)[-1] for prefix in BONUS_IMAGE_PREFIXES):
        return 24 * 24
    return 0


def _best_history_image_variants(records: list[dict]) -> list[tuple[dict, int]]:
    groups: dict[str, list[int]] = {}
    for index, record in enumerate(records):
        if record.get("kind") == "image":
            groups.setdefault(_image_family_key(record.get("url", "")), []).append(index)

    winners: dict[int, int] = {}
    for indices in groups.values():
        winner = max(
            indices,
            key=lambda index: (
                records[index].get("change") != "removed",
                _image_resolution_rank(records[index].get("url", "")),
                -index,
            ),
        )
        winners[winner] = len(indices)

    return [
        (record, winners.get(index, 1))
        for index, record in enumerate(records)
        if record.get("kind") != "image" or index in winners
    ]


def _latest_image_urls(reports: list[dict]) -> dict[str, str | None]:
    latest: dict[str, str | None] = {}
    for report in reports:
        same_report: dict[str, list[dict]] = {}
        for record in report.get("files", []):
            if record.get("kind") != "image":
                continue
            same_report.setdefault(_image_asset_key(record.get("url", "")), []).append(record)
        for key, records in same_report.items():
            if key in latest:
                continue
            current = next(
                (record.get("url", "") for record in records if record.get("change") != "removed"),
                None,
            )
            latest[key] = current or None
    return latest


def _history_file(
    record: dict,
    latest_images: dict[str, str | None] | None = None,
    variant_count: int = 1,
) -> str:
    url = record.get("url", "")
    name = url.rsplit("/", 1)[-1]
    change = html.escape(record.get("change", ""))
    variant_note = (
        f'<span class="image-variants">Highest resolution · {variant_count - 1} smaller '
        f'{"variant" if variant_count == 2 else "variants"} hidden</span>'
        if variant_count > 1
        else ""
    )
    if record.get("kind") == "image":
        if record.get("change") == "removed":
            return f'''<li class="history-file history-file-image history-item image-unavailable"><span class="image-placeholder">Removed</span>
<span class="change change-{change}">{change}</span><span class="history-file-meta"><span class="history-file-name">{html.escape(name)}</span>{variant_note}<span class="image-state">Marked as removed in this report</span></span></li>'''
        latest_url = (latest_images or {}).get(_image_asset_key(url))
        fallback = ""
        if latest_url and latest_url != url:
            fallback = f' data-fallback-src="{html.escape(latest_url)}"'
        return f'''<li class="history-file history-file-image history-item"><img class="history-image" loading="lazy" src="{html.escape(url)}"{fallback} alt="Preview of {html.escape(name)}">
<span class="image-placeholder" hidden>Preview unavailable</span><span class="change change-{change}">{change}</span><span class="history-file-meta"><span class="history-file-name">{html.escape(name)}</span>{variant_note}<span class="image-state"></span></span></li>'''
    if record.get("change") == "removed":
        return f'''<li class="history-file history-item image-unavailable"><span class="change change-{change}">{change}</span>
<span class="change">{html.escape(record.get('kind', ''))}</span><span class="history-file-name">{html.escape(name)}</span></li>'''
    return f'''<li class="history-file history-item"><span class="change change-{change}">{change}</span>
<span class="change">{html.escape(record.get('kind', ''))}</span><a href="{html.escape(url)}" target="_blank">{html.escape(name)}</a></li>'''


def _history_string(value: str, change: str) -> str:
    return f'''<div class="history-string history-item"><span class="change change-{change}">{change}</span><span>{html.escape(value)}</span></div>'''


def _history_building(value: dict | str, change: str) -> str:
    if isinstance(value, dict):
        name = value.get("name") or value.get("id") or "Unknown building"
        identifier = value.get("id") or ""
        size = value.get("size") or {}
        footprint = " × ".join(str(size.get(axis, "?")) for axis in ("x", "y")) if size else ""
        details = " · ".join(part for part in (identifier, footprint) if part)
    else:
        name = str(value)
        details = ""
    detail_html = f'<span class="meta">{html.escape(details)}</span>' if details else ""
    return f'''<div class="history-string history-item"><span class="change change-{change}">{change}</span><span><strong>{html.escape(str(name))}</strong> {detail_html}</span></div>'''


def _active_string_section(results: dict) -> str:
    records = results.get("active_strings", [])
    records_by_date: dict[str, list[dict]] = {}
    for record in records:
        records_by_date.setdefault(record.get("last_added_date", "unknown"), []).append(record)
    groups = []
    for index, (added_date, date_records) in enumerate(sorted(records_by_date.items(), reverse=True)):
        try:
            parsed_date = date.fromisoformat(added_date)
            date_label = f"{parsed_date:%b} {parsed_date.day}<small>{parsed_date.year}</small>"
        except ValueError:
            date_label = html.escape(added_date)
        latest_label = '<span class="latest-label">Latest update</span>' if index == 0 else ""
        groups.append(
            f'''<section class="string-date-group"><h3><time datetime="{html.escape(added_date)}" aria-label="{html.escape(added_date)}">{date_label}</time>{latest_label}</h3>
<div class="string-rows">{''.join(_active_string_row(record) for record in date_records)}</div></section>'''
        )
    removals = results.get("removal_events", [])
    removal_items = "".join(
        f'<li><span class="tag">{html.escape(event.get("removed_date", ""))}</span> '
        f'{html.escape(event.get("text", ""))}</li>'
        for event in removals
    )
    return f'''<section id="active-strings">
<div class="section-head"><div><div class="eyebrow"><span class="section-number">02</span> THE DETAILS SO FAR</div><h2>Latest Great Building bonus descriptions</h2></div>
<p class="meta">Exact beta wording, grouped by the date it was last added. Later removals are excluded. Tokens such as %s are placeholders filled in by the game.</p></div>
<div class="toolbar"><div class="search-field">{_ui_icon("search")}<input id="string-search" type="search" placeholder="Search descriptions or dates…" aria-label="Search Great Building bonus descriptions"></div></div>
<p class="string-result-status" id="string-result-status" aria-live="polite"></p>
<div class="string-groups" id="active-string-list">{''.join(groups) or '<p>No Great Building bonus descriptions remain in this reporting window.</p>'}</div>
<div class="search-empty" id="string-empty" hidden><strong>No matching descriptions</strong><p>Try a bonus name, a phrase, or a date.</p><button type="button" data-clear-search="string-search">Clear search</button></div>
<details class="audit"><summary>Past removals ({len(removals)})</summary><p>Removal events recorded in beta reports. A description may have been added again later.</p><ul class="strings">{removal_items or '<li>No description removals recorded.</li>'}</ul></details>
</section>'''


def _active_string_row(record: dict) -> str:
    search = f"{record.get('last_added_date', '')} {record.get('text', '')}".lower()
    text = record.get("text", "")
    prefix = "GBP|" if text.startswith("GBP|") else ""
    text = text[len(prefix):]
    title, separator, description = text.partition(":")
    if separator and len(title) < 90:
        formatted = f"<strong>{html.escape(title)}:</strong>{html.escape(description)}"
    else:
        formatted = html.escape(text)
    formatted = re.sub(r"%(?:\.\d+)?[sdf]", lambda match: f"<code>{match[0]}</code>", formatted)
    return f'''<article class="string-row" data-search="{html.escape(search)}">
<span class="string-prefix">{prefix}</span><p class="string-text">{formatted}</p></article>'''


def _building_card(building: dict, change: str) -> str:
    size = building.get("size") or {}
    footprint = " × ".join(str(size.get(axis, "?")) for axis in ("x", "y"))
    ages = len(building.get("ages") or [])
    return f'''<article class="card building"><span class="tag">{change}</span><span class="tag">{footprint}</span>
<div class="name">{html.escape(str(building.get("name") or building.get("id") or "Unknown"))}</div>
<div class="summary">{html.escape(str(building.get("id") or ""))} · {ages} age variants</div></article>'''


def _list(values: list[str]) -> str:
    if not values:
        return "<li>None</li>"
    return "".join(f"<li>{html.escape(value)}</li>" for value in values)


def _size(value: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{value} B"
