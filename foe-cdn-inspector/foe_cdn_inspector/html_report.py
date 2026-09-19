from __future__ import annotations

import html
import json
import re
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


def write_html(
    report: ParsedReport,
    destination: Path,
    metadata: dict,
    string_results: dict | None = None,
    history_results: dict | None = None,
) -> None:
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
            ("Dates with bonus updates", publication_dates),
            ("Reports scanned", string_results.get("reports_scanned", 0)),
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
    string_nav = '<a href="#active-strings">Bonus descriptions</a>' if string_results else ""
    bonus_section = _great_building_bonus_section(history_results) if history_results else ""
    bonus_nav = '<a href="#great-building-bonuses">Bonus icons</a>' if history_results else ""
    history_section = _history_section(history_results) if history_results else ""
    history_nav = '<a href="#snapshot">60-day change history</a>' if history_results else ""
    page_heading = "GB Update tracker"
    if string_results:
        newest_date = str(string_results.get("newest_report") or report.report_id)[:10]
        page_eyebrow = "FORGE OF EMPIRES · ZZ1 BETA"
        page_context = (
            'Track the latest Great Building bonus icons and descriptions on zz1. '
            'Descriptions removed by later updates are excluded. '
            f'Data through {html.escape(newest_date)}.'
        )
    elif history_results:
        newest_date = str(history_results.get("newest_report") or report.report_id)[:10]
        page_eyebrow = "PUBLIC BETA CDN HISTORY"
        page_context = "Complete public beta CDN changes in the selected date range."
    else:
        page_eyebrow = "PUBLIC BETA CDN CHANGESET"
        page_context = "Latest public beta CDN changes."

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
<style>
:root {{ color-scheme:dark; --ink:#f2eee4; --muted:#aaa69c; --panel:#181a18; --panel-2:#111412; --panel-raised:#1e211e; --line:#34372f; --line-strong:#524b38; --gold:#e9bb54; --gold-deep:#98752f; --blue:#8dc6db; --green:#86c995; --red:#df8e82; --shadow:0 24px 70px #0008; }}
* {{ box-sizing:border-box }}
html {{ scroll-behavior:smooth; scrollbar-color:var(--gold-deep) #101210 }}
body {{ margin:0; min-height:100vh; background:radial-gradient(circle at 12% -8%,#332914 0,transparent 30rem),radial-gradient(circle at 95% 40%,#13262a 0,transparent 34rem),#0b0d0c; color:var(--ink); font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif }}
body::before {{ content:""; position:fixed; inset:0; pointer-events:none; opacity:.16; background-image:linear-gradient(#fff1 1px,transparent 1px),linear-gradient(90deg,#fff1 1px,transparent 1px); background-size:48px 48px; mask-image:linear-gradient(to bottom,#000,transparent 65%) }}
main {{ position:relative; max-width:1180px; margin:auto; padding:48px 32px 72px }}
h1 {{ max-width:780px; margin:.16em 0 .28em; font-family:Georgia,"Times New Roman",serif; font-size:clamp(42px,7vw,72px); font-weight:500; line-height:.98; letter-spacing:-.045em; text-wrap:balance }}
h2 {{ margin-top:48px; font-family:Georgia,"Times New Roman",serif; font-size:clamp(28px,4vw,40px); font-weight:500; line-height:1.05; letter-spacing:-.025em }}
a {{ color:var(--blue) }}
a,button,input,select,summary {{ outline-offset:3px }}
:focus-visible {{ outline:2px solid var(--gold) }}
.eyebrow {{ color:var(--gold); font-size:11px; font-weight:750; letter-spacing:.18em; text-transform:uppercase }}
.meta {{ color:var(--muted) }}
.hero {{ position:relative; overflow:hidden; padding:38px 40px 32px; border:1px solid var(--line-strong); border-radius:20px 20px 0 0; background:linear-gradient(135deg,#201f19f5,#121614ee 62%,#162023e8); box-shadow:var(--shadow) }}
.hero::before {{ content:""; position:absolute; width:420px; height:420px; right:-100px; top:-250px; border:1px solid #e9bb5433; border-radius:50%; box-shadow:0 0 0 38px #e9bb5409,0 0 0 76px #e9bb5407 }}
.hero::after {{ content:""; position:absolute; left:40px; bottom:0; width:88px; height:2px; background:var(--gold); box-shadow:96px 0 0 #68552e }}
.hero > * {{ position:relative }}
.intro {{ max-width:790px; margin:0; color:#c5c0b4; font-size:16px; line-height:1.7 }}
.nav {{ display:flex; flex-wrap:wrap; gap:9px; margin:28px 0 0 }}
.nav a {{ padding:8px 13px; border:1px solid #ffffff14; border-radius:999px; background:#ffffff08; color:#c5c0b4; font-size:13px; text-decoration:none; transition:border-color .18s,background .18s,color .18s,transform .18s }}
.nav a:hover {{ transform:translateY(-1px); border-color:var(--gold-deep); background:#e9bb540d; color:var(--ink) }}
.stats {{ display:grid; grid-template-columns:repeat(4,1fr); gap:1px; margin:0 0 72px; overflow:hidden; border:1px solid var(--line-strong); border-top:0; border-radius:0 0 16px 16px; background:var(--line); box-shadow:0 18px 60px #0005 }}
.stats-2 {{ grid-template-columns:repeat(2,1fr) }}
.stat {{ position:relative; min-width:0; padding:22px 24px 24px; background:linear-gradient(180deg,#171a17,#111311) }}
.stat::after {{ content:""; position:absolute; inset:auto 24px 0; height:1px; background:linear-gradient(90deg,var(--gold-deep),transparent); opacity:.6 }}
.stat strong {{ display:block; color:var(--ink); font:500 32px/1 Georgia,"Times New Roman",serif; font-variant-numeric:tabular-nums }}
.stat span {{ display:block; margin-top:7px; color:var(--muted); font-size:11px; font-weight:650; letter-spacing:.08em; text-transform:uppercase }}
.card {{ overflow:hidden; border:1px solid var(--line); border-radius:12px; background:var(--panel) }}
.toolbar,.bonus-gallery-tools {{ position:sticky; top:0; z-index:3; padding:13px 0; background:#0b0d0ce8; backdrop-filter:blur(14px) }}
input,select {{ padding:12px 14px; color:var(--ink); background:#151815; border:1px solid var(--line); border-radius:10px; box-shadow:inset 0 1px 0 #fff08; font:inherit; transition:border-color .18s,box-shadow .18s,background .18s }}
input:hover,select:hover {{ border-color:#55594f }}
input:focus,select:focus {{ border-color:var(--gold-deep); background:#191c18; box-shadow:0 0 0 3px #e9bb5410,inset 0 1px 0 #fff08 }}
input {{ width:min(620px,100%) }}
input::placeholder {{ color:#777a72 }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:14px }}
.card-body {{ padding:14px }} .thumb {{ width:100%; height:190px; object-fit:contain; background:#090a0b }}
.tag {{ display:inline-block; margin:0 5px 5px 0; padding:2px 7px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:12px }}
.name {{ overflow-wrap:anywhere; font-weight:650 }} .summary {{ color:var(--muted); overflow-wrap:anywhere }}
pre {{ max-height:260px; overflow:auto; padding:12px; background:#090a0b; border-radius:8px; white-space:pre-wrap; overflow-wrap:anywhere }}
.strings li {{ margin:.7em 0 }} .building {{ padding:16px }} .hidden {{ display:none !important }}
#active-strings {{ margin-top:78px; scroll-margin-top:24px }} .stats + #active-strings {{ margin-top:0 }}
.section-head {{ display:flex; gap:24px; align-items:end; justify-content:space-between; flex-wrap:wrap; margin-bottom:6px }}
.section-head h2 {{ margin:4px 0 0 }} .section-head p {{ max-width:610px; margin:0 0 2px }}
.string-groups {{ display:grid; gap:40px; margin-top:18px }}
.string-date-group h3 {{ display:flex; gap:12px; align-items:center; margin:0 0 10px; color:var(--gold); font:600 16px/1.2 ui-sans-serif,system-ui,sans-serif; font-variant-numeric:tabular-nums }}
.string-date-group h3::after {{ content:""; flex:1; height:1px; background:linear-gradient(90deg,var(--line-strong),transparent) }}
.string-rows {{ overflow:hidden; border:1px solid var(--line); border-radius:12px; background:#111311aa }}
.string-row {{ display:grid; grid-template-columns:minmax(0,1fr); gap:28px; align-items:start; width:100%; padding:17px 18px; border-bottom:1px solid var(--line); transition:background .18s,border-color .18s,transform .18s }}
.string-row:last-child {{ border-bottom:0 }} .string-row:hover {{ padding-left:22px; background:linear-gradient(90deg,#e9bb5410,transparent 50%) }}
.string-text {{ margin:0; overflow-wrap:anywhere; color:#dedad1; font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace }}
.audit {{ margin-top:20px; padding:12px 16px; border:1px solid var(--line); border-radius:10px; background:var(--panel) }}
.audit summary {{ color:var(--muted); cursor:pointer }}
.bonus-gallery-section {{ margin-top:78px; scroll-margin-top:18px }} .stats + .bonus-gallery-section {{ margin-top:0 }}
.bonus-gallery-head {{ display:flex; justify-content:space-between; gap:30px; align-items:end; margin-bottom:14px }}
.bonus-gallery-head h2 {{ margin:4px 0 0 }} .bonus-gallery-head p {{ max-width:610px; margin:0 }}
.bonus-gallery-tools input {{ width:100% }}
.bonus-result-status {{ min-height:22px; margin:0 0 10px; color:var(--muted); font-size:12px; letter-spacing:.04em }}
.bonus-grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:13px }}
.bonus-card {{ min-width:0; overflow:hidden; border:1px solid var(--line); border-radius:12px; background:linear-gradient(180deg,#1a1d19,#121412); box-shadow:0 8px 30px #0003; transition:transform .2s,border-color .2s,box-shadow .2s }}
.bonus-card:hover {{ transform:translateY(-3px); border-color:var(--gold-deep); box-shadow:0 14px 36px #0006 }}
.bonus-art {{ display:grid; place-items:center; height:146px; background:radial-gradient(circle,#252821 0,#0d0f0d 68%) }} .bonus-art a {{ display:grid; place-items:center; width:100%; height:100% }}
.bonus-image {{ max-width:112px; max-height:112px; image-rendering:auto; filter:drop-shadow(0 8px 14px #000a); transition:transform .2s }} .bonus-card:hover .bonus-image {{ transform:scale(1.04) }}
.bonus-image-placeholder {{ display:grid; place-items:center; width:88px; height:72px; border:1px dashed var(--line); border-radius:8px; color:var(--muted); font-size:11px }} .bonus-image-placeholder[hidden] {{ display:none }}
.bonus-card-body {{ padding:14px 15px 16px; border-top:1px solid #ffffff0a }} .bonus-card h3 {{ margin:0 0 5px; font-size:14px; line-height:1.35 }} .bonus-filename {{ color:#85877f; font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere }} .bonus-date {{ display:block; margin-top:10px; color:var(--gold); font-size:10px; letter-spacing:.03em }}
.archive-shell {{ display:block; margin-top:78px; overflow:hidden; border:1px solid var(--line-strong); border-radius:16px; background:linear-gradient(180deg,#151815,#0f110f); box-shadow:0 18px 60px #0004; scroll-margin-top:18px }}
.archive-summary {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:24px; align-items:center; padding:24px 26px; cursor:pointer; list-style:none; background:linear-gradient(90deg,#e9bb5409,transparent 38%) }}
.archive-summary::-webkit-details-marker {{ display:none }}
.archive-summary::after {{ content:'＋'; display:grid; place-items:center; width:32px; height:32px; border:1px solid var(--line); border-radius:50%; color:var(--gold); font-size:17px }} .archive-shell[open] > .archive-summary::after {{ content:'−' }}
.archive-summary:hover::after {{ border-color:var(--gold-deep); background:#e9bb5409 }}
.archive-summary strong {{ display:block; font:500 22px/1.2 Georgia,"Times New Roman",serif }} .archive-summary small {{ display:block; margin-top:5px; color:var(--muted) }}
.archive-content {{ padding:8px 26px 30px; border-top:1px solid var(--line) }}
.archive-tools {{ margin:22px 0 12px }} .archive-tools p {{ max-width:790px; margin:5px 0 0 }}
.history-controls {{ position:sticky; top:0; z-index:3; padding:12px 0 14px; background:#111411f0; backdrop-filter:blur(14px) }}
.history-controls .toolbar {{ padding:0; background:transparent; backdrop-filter:none }} .history-controls input {{ width:100% }}
.type-tabs {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:11px }}
.type-filter {{ display:flex; gap:8px; align-items:center; padding:8px 12px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:#191c19; cursor:pointer; transition:color .18s,border-color .18s,background .18s,transform .18s }}
.type-filter:hover {{ transform:translateY(-1px); color:var(--ink); border-color:#5e6258 }} .type-filter[aria-pressed="true"] {{ color:#17140d; border-color:var(--gold); background:linear-gradient(180deg,#f0c766,#d9a942); box-shadow:0 5px 16px #0004 }}
.type-filter small {{ color:inherit; opacity:.76; font-variant-numeric:tabular-nums }}
.history-result-status {{ min-height:22px; margin:0 0 8px; color:var(--muted); font-size:12px; letter-spacing:.03em }}
.history-type-list {{ display:grid; gap:12px }}
.history-type-section {{ overflow:hidden; border:1px solid var(--line); border-radius:11px; background:#101310; transition:border-color .18s }}
.history-type-section[open] {{ border-color:#494d43 }}
.history-type-section > summary {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:20px; align-items:center; padding:19px 20px; cursor:pointer; list-style:none }}
.history-type-section > summary:hover {{ background:#ffffff03 }}
.history-type-section > summary::-webkit-details-marker,.history-date-group > summary::-webkit-details-marker {{ display:none }}
.history-type-title {{ display:flex; gap:12px; align-items:baseline }} .history-type-title::before {{ content:'＋'; width:16px; color:var(--gold) }} .history-type-section[open] .history-type-title::before {{ content:'−' }}
.history-type-title strong {{ font-size:16px }} .history-type-title small,.history-type-summary {{ color:var(--muted); font-size:12px }}
.history-date-list {{ border-top:1px solid var(--line) }}
.history-date-group {{ border-bottom:1px solid var(--line) }} .history-date-group:last-child {{ border-bottom:0 }}
.history-date-group > summary {{ display:grid; grid-template-columns:16px 140px minmax(0,1fr); gap:12px; align-items:center; padding:14px 20px; cursor:pointer; list-style:none; transition:background .18s }}
.history-date-group > summary:hover {{ background:#ffffff03 }}
.history-date-group > summary::before {{ content:'＋'; color:var(--muted); width:10px }} .history-date-group[open] > summary::before {{ content:'−'; color:var(--gold) }}
.history-date {{ color:var(--ink); font-weight:700; font-variant-numeric:tabular-nums }} .history-date-count {{ color:var(--muted); font-size:12px; text-align:right }}
.history-date-content {{ padding:0 20px 18px 48px }}
.history-file-list {{ list-style:none; padding:0; margin:0; border-top:1px solid var(--line) }}
.history-file {{ display:grid; grid-template-columns:72px 72px minmax(0,1fr); gap:8px; align-items:start; padding:11px 2px; border-bottom:1px solid var(--line); overflow-wrap:anywhere }}
.history-file-image {{ grid-template-columns:96px 72px minmax(0,1fr); align-items:center; min-height:82px }}
.history-image {{ width:88px; height:64px; object-fit:contain; border:1px solid var(--line); border-radius:7px; background:#090a0b }}
.image-placeholder {{ display:grid; place-items:center; width:88px; height:64px; padding:6px; border:1px dashed var(--line); border-radius:7px; color:var(--muted); background:#101214; font-size:10px; line-height:1.25; text-align:center }}
.image-placeholder[hidden] {{ display:none }}
.history-file-name {{ color:var(--ink); overflow-wrap:anywhere }} .history-file-meta {{ min-width:0 }} .image-state,.image-variants {{ display:block; margin-top:3px; color:var(--muted); font-size:11px }} .image-unavailable .history-file-name {{ color:var(--muted) }}
.history-string {{ display:grid; grid-template-columns:72px minmax(0,1fr); gap:10px; padding:11px 2px; border-bottom:1px solid var(--line); font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace }}
.change {{ color:var(--muted); font:11px/1.55 ui-sans-serif,system-ui,sans-serif; letter-spacing:.08em; text-transform:uppercase }} .change-added {{ color:var(--green) }} .change-removed {{ color:var(--red) }}
.history-empty {{ padding:28px 4px; color:var(--muted); text-align:center }}
.dashboard-footer {{ display:flex; justify-content:space-between; gap:28px; align-items:flex-end; margin-top:74px; padding-top:24px; border-top:1px solid var(--line) }}
.realm-note {{ color:#777a72; font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace }}
.dashboard-signature {{ margin-left:auto; text-align:right }} .dashboard-signature strong {{ display:block; font:500 17px/1.3 Georgia,"Times New Roman",serif }} .dashboard-signature span {{ display:block; margin-top:4px; color:var(--gold); font-size:9px; font-weight:750; letter-spacing:.18em; text-transform:uppercase }}
@media (max-width:820px) {{ .stats {{ grid-template-columns:repeat(2,1fr) }} }}
@media (max-width:600px) {{ main {{ padding:22px 14px 48px }} .hero {{ padding:28px 20px 24px; border-radius:16px 16px 0 0 }} .hero::after {{ left:20px }} h1 {{ font-size:42px }} .intro {{ font-size:14px }} .nav {{ margin-top:22px }} .nav a {{ padding:7px 10px; font-size:12px }} .stats {{ margin-bottom:52px; border-radius:0 0 12px 12px }} .stat {{ padding:17px 16px 18px }} .stat::after {{ inset-inline:16px }} .stat strong {{ font-size:27px }} .stat span {{ font-size:9px }} .toolbar {{ display:flex }} .toolbar input {{ min-width:0; flex:1 }} .section-head {{ align-items:start }} .string-row {{ padding:14px }} .string-row:hover {{ padding-left:16px }} .bonus-gallery-head {{ display:block }} .bonus-gallery-head p {{ margin-top:9px }} .bonus-grid {{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px }} .bonus-art {{ height:116px }} .bonus-image {{ max-width:88px; max-height:88px }} .bonus-card-body {{ padding:11px }} .archive-summary,.archive-content {{ padding-left:16px; padding-right:16px }} .type-tabs {{ display:grid; grid-template-columns:1fr 1fr }} .type-filter {{ justify-content:space-between; border-radius:8px }} .history-type-section > summary {{ grid-template-columns:1fr; gap:7px; padding:16px }} .history-type-title {{ display:grid; grid-template-columns:16px minmax(0,1fr); column-gap:8px; align-items:start }} .history-type-title::before {{ grid-row:1/3 }} .history-type-title small {{ grid-column:2 }} .history-type-summary {{ padding-left:24px; text-align:left }} .history-date-group > summary {{ grid-template-columns:14px minmax(0,1fr); gap:8px; padding:13px 14px }} .history-date-count {{ grid-column:2; text-align:left }} .history-date-content {{ padding-left:20px; padding-right:14px }} .history-file {{ grid-template-columns:64px minmax(0,1fr) }} .history-file a {{ grid-column:1/-1 }} .history-file-image {{ grid-template-columns:76px minmax(0,1fr) }} .history-image,.image-placeholder {{ width:68px; height:56px }} .history-file-image .history-file-meta {{ grid-column:1/-1 }} .dashboard-footer {{ align-items:flex-start; flex-direction:column }} .dashboard-signature {{ align-self:flex-end }} }}
@media (prefers-reduced-motion:reduce) {{ html {{ scroll-behavior:auto }} *,*::before,*::after {{ transition:none !important }} }}
</style>
</head>
<body><main>
<header class="hero">
<div class="eyebrow">{page_eyebrow}</div>
<h1>{html.escape(page_heading)}</h1>
<p class="intro meta">{page_context}</p>
<nav class="nav" aria-label="Dashboard sections">{bonus_nav}{string_nav}{history_nav}</nav>
</header>
<div class="stats stats-{len(stats)}">{stat_html}</div>
{bonus_section}
{string_section}
{history_section}
{latest_section}
<footer class="dashboard-footer" id="dashboard-footer"><span class="realm-note">zz1 public beta</span>
<div class="dashboard-signature"><strong>Another zpwd dashboard.</strong><span>Sleep deprived mode.</span></div></footer>
</main>
<script>
const q=document.querySelector('#search'), k=document.querySelector('#kind'), cards=[...document.querySelectorAll('#files .card')];
function filter(){{const text=q.value.toLowerCase(),kind=k.value;for(const c of cards)c.classList.toggle('hidden',!c.dataset.search.includes(text)||(kind&&c.dataset.kind!==kind))}}
if(q&&k){{q.addEventListener('input',filter);k.addEventListener('change',filter)}}
const sq=document.querySelector('#string-search'), stringRows=[...document.querySelectorAll('#active-string-list .string-row')], stringGroups=[...document.querySelectorAll('#active-string-list .string-date-group')];
if(sq) sq.addEventListener('input',()=>{{const value=sq.value.toLowerCase();for(const row of stringRows)row.classList.toggle('hidden',!row.dataset.search.includes(value));for(const group of stringGroups)group.classList.toggle('hidden',![...group.querySelectorAll('.string-row')].some(row=>!row.classList.contains('hidden')))}});
const bq=document.querySelector('#bonus-search'),bonusCards=[...document.querySelectorAll('#bonus-grid .bonus-card')],bonusStatus=document.querySelector('#bonus-result-status');
function filterBonuses(){{if(!bq)return;const value=bq.value.trim().toLowerCase();let visible=0;for(const card of bonusCards){{const matches=card.dataset.search.includes(value);card.classList.toggle('hidden',!matches);if(matches)visible++}}bonusStatus.textContent=`${{visible}} bonus ${{visible===1?'icon':'icons'}}`}}
if(bq){{bq.addEventListener('input',filterBonuses);filterBonuses()}}
const hq=document.querySelector('#history-search'),typeButtons=[...document.querySelectorAll('.type-filter')],typeSections=[...document.querySelectorAll('.history-type-section')],historyStatus=document.querySelector('#history-result-status'),historyEmpty=document.querySelector('#history-empty');
let activeHistoryType='all';
function filterHistory(){{
  if(!hq)return;
  const value=hq.value.trim().toLowerCase();let visibleItems=0;const visibleDateKeys=new Set();
  for(const section of typeSections){{
    const typeMatches=activeHistoryType==='all'||section.dataset.historyType===activeHistoryType;let sectionItems=0;
    for(const dateGroup of section.querySelectorAll('.history-date-group')){{
      const dateMatches=Boolean(value&&dateGroup.dataset.date.includes(value));let dateItems=0;
      for(const item of dateGroup.querySelectorAll('.history-item')){{
        const matches=!value||dateMatches||(item.dataset.search||item.textContent).toLowerCase().includes(value);
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
for(const button of typeButtons)button.addEventListener('click',()=>{{activeHistoryType=button.dataset.historyFilter;for(const candidate of typeButtons)candidate.setAttribute('aria-pressed',String(candidate===button));filterHistory()}});
if(hq){{hq.addEventListener('input',filterHistory);filterHistory()}}
const snapshotLink=document.querySelector('a[href="#snapshot"]'),snapshot=document.querySelector('#snapshot');
if(snapshotLink&&snapshot) snapshotLink.addEventListener('click',()=>{{snapshot.open=true}});
if(snapshot&&location.hash==='#snapshot'){{snapshot.open=true;requestAnimationFrame(()=>snapshot.scrollIntoView({{block:'start',behavior:'instant'}}))}}
const bonusLink=document.querySelector('a[href="#great-building-bonuses"]'),bonusSection=document.querySelector('#great-building-bonuses');
if(bonusLink&&bonusSection) bonusLink.addEventListener('click',()=>requestAnimationFrame(()=>bonusSection.scrollIntoView({{block:'start',behavior:'instant'}})));
if(bonusSection&&location.hash==='#great-building-bonuses') requestAnimationFrame(()=>bonusSection.scrollIntoView({{block:'start',behavior:'instant'}}));
for(const img of document.querySelectorAll('.history-image')){{
  const row=img.closest('.history-file-image'),placeholder=row.querySelector('.image-placeholder'),state=row.querySelector('.image-state');
  img.addEventListener('error',()=>{{
    const fallback=img.dataset.fallbackSrc;
    if(fallback&&!img.dataset.fallbackTried){{img.dataset.fallbackTried='1';img.src=fallback;return}}
    img.hidden=true;placeholder.hidden=false;row.classList.add('image-unavailable');state.textContent='Preview unavailable';
  }});
  img.addEventListener('load',()=>{{if(img.dataset.fallbackTried)state.textContent='Original unavailable; showing the current version'}});
}}
for(const img of document.querySelectorAll('.bonus-image'))img.addEventListener('error',()=>{{img.hidden=true;img.closest('.bonus-art').querySelector('.bonus-image-placeholder').hidden=false}});
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
{preview}<div class="card-body">{tags}<div class="name">{html.escape(parsed_name)}</div>{summary}{error}<a href="{html.escape(src)}" target="_blank">open file</a></div></article>'''


def _latest_report_section(
    report: ParsedReport,
    file_rows: str,
    added_strings: str,
    removed_strings: str,
    building_rows: str,
) -> str:
    return f'''<details class="archive-shell" id="latest"><summary class="archive-summary"><span><strong>Latest report snapshot</strong><small>Raw files, strings, buildings, and metadata from {html.escape(report.report_id[:10])}</small></span></summary><div class="archive-content"><h2 id="files-heading">Files</h2>
<div class="toolbar"><input id="search" type="search" placeholder="Filter paths, types, summaries…"> <select id="kind"><option value="">All kinds</option><option>image</option><option>text</option><option>metadata</option><option>audio</option><option>font</option><option>binary</option></select></div>
<h2>New strings</h2><ul class="strings">{added_strings}</ul>
<details><summary>Removed strings ({len(report.removed_strings)})</summary><ul class="strings">{removed_strings}</ul></details>
<h2 id="building-heading">Building summaries</h2><div class="grid">{building_rows or '<p>No building changes.</p>'}</div>
<h2>Changed metadata families</h2><ul>{_list(report.metadata_families)}</ul>
</div></details>'''


def _great_building_bonus_section(results: dict) -> str:
    images = _current_great_building_bonus_images(results.get("reports", []))
    cards = "".join(_great_building_bonus_card(image) for image in images)
    return f'''<section class="bonus-gallery-section" id="great-building-bonuses">
<div class="bonus-gallery-head"><div><div class="eyebrow">GREAT BUILDING BONUSES</div><h2>Bonus icons</h2></div>
<p class="meta">The highest-resolution current icon for each Great Building bonus found during the last 60 days.</p></div>
<div class="bonus-gallery-tools"><input id="bonus-search" type="search" placeholder="Search bonus icons…" aria-label="Search Great Building bonus icons"></div>
<p class="bonus-result-status" id="bonus-result-status" aria-live="polite"></p>
<div class="bonus-grid" id="bonus-grid">{cards or '<p class="meta">No current bonus icons found.</p>'}</div>
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
        f' · Highest resolution of {variant_count} current variants'
        if variant_count > 1
        else ""
    )
    return f'''<article class="bonus-card" data-search="{search}">
<div class="bonus-art"><a href="{html.escape(url)}" target="_blank" aria-label="Open original {html.escape(title)} icon"><img class="bonus-image" decoding="async" fetchpriority="low" src="{html.escape(url)}" alt="{html.escape(title)}"></a><span class="bonus-image-placeholder" hidden>Preview unavailable</span></div>
<div class="bonus-card-body"><h3>{html.escape(title)}</h3><div class="bonus-filename">{html.escape(name)}</div><span class="bonus-date">Updated {html.escape(changed_date)}{html.escape(variant_text)}</span></div></article>'''


def _history_section(results: dict) -> str:
    reports = results.get("reports", [])
    latest_images = _latest_image_urls(reports)
    type_specs = [
        ("images", "Images", "Sprites, portraits, event art, and interface images."),
        ("text", "Text files", "Scripts, data, stylesheets, and other text files."),
        ("audio", "Audio", "Music and sound effects added, updated, or removed."),
        ("strings", "Strings", "In-game text added or removed."),
        ("buildings", "Buildings", "Building definitions added, updated, or removed."),
        ("metadata", "Metadata", "Structured game data and asset records."),
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
    snapshot_title = f"{inclusive_days}-day change history" if inclusive_days else "Date range · change history"
    return f'''<details class="archive-shell" id="snapshot"><summary class="archive-summary"><span><strong>{snapshot_title}</strong>
<small>{results.get('reports_count', 0)} reports · {html.escape(results.get('since', ''))} through {html.escape(until)}</small></span></summary>
<div class="archive-content"><div class="archive-tools"><div><div class="eyebrow">BROWSE CHANGES</div><p class="meta">Choose a type, then a date. Search by name, change, file kind, or date. Only the highest-resolution version of each image is shown.</p></div></div>
<div class="history-controls"><div class="toolbar"><input id="history-search" type="search" placeholder="Search by name, date, or change…" aria-label="Search the 60-day change history"></div>
<div class="type-tabs" role="group" aria-label="Filter change history by type"><button class="type-filter" type="button" data-history-filter="all" aria-pressed="true">All types<small>{all_count:,}</small></button>{type_filters}</div></div>
<p class="history-result-status" id="history-result-status" aria-live="polite"></p>
<div class="history-type-list" id="history-list">{type_rows or '<p>No reports in this range.</p>'}</div>
<p class="history-empty" id="history-empty" hidden>No changes match these filters.</p>
</div></details>'''


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
            f'<li class="history-string history-item" data-search="family metadata {html.escape(str(value).lower())}"><span class="change">family</span><span>{html.escape(str(value))}</span></li>'
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
    item_search = html.escape(
        f'{record.get("change", "")} {record.get("kind", "")} {name} {url}'.lower()
    )
    variant_note = (
        f'<span class="image-variants">Highest resolution · {variant_count - 1} smaller '
        f'{"variant" if variant_count == 2 else "variants"} hidden</span>'
        if variant_count > 1
        else ""
    )
    if record.get("kind") == "image":
        if record.get("change") == "removed":
            return f'''<li class="history-file history-file-image history-item image-unavailable" data-search="{item_search}"><span class="image-placeholder">Removed</span>
<span class="change change-{change}">{change}</span><span class="history-file-meta"><span class="history-file-name">{html.escape(name)}</span>{variant_note}<span class="image-state">Removed from the CDN</span></span></li>'''
        latest_url = (latest_images or {}).get(_image_asset_key(url))
        fallback = ""
        if latest_url and latest_url != url:
            fallback = f' data-fallback-src="{html.escape(latest_url)}"'
        return f'''<li class="history-file history-file-image history-item" data-search="{item_search}"><img class="history-image" loading="lazy" src="{html.escape(url)}"{fallback} alt="Preview of {html.escape(name)}">
<span class="image-placeholder" hidden>Preview unavailable</span><span class="change change-{change}">{change}</span><span class="history-file-meta"><span class="history-file-name">{html.escape(name)}</span>{variant_note}<span class="image-state"></span></span></li>'''
    if record.get("change") == "removed":
        return f'''<li class="history-file history-item image-unavailable" data-search="{item_search}"><span class="change change-{change}">{change}</span>
<span class="change">{html.escape(record.get('kind', ''))}</span><span class="history-file-name">{html.escape(name)}</span></li>'''
    return f'''<li class="history-file history-item" data-search="{item_search}"><span class="change change-{change}">{change}</span>
<span class="change">{html.escape(record.get('kind', ''))}</span><a href="{html.escape(url)}" target="_blank">{html.escape(name)}</a></li>'''


def _history_string(value: str, change: str) -> str:
    search = html.escape(f"{change} string {value}".lower())
    return f'''<div class="history-string history-item" data-search="{search}"><span class="change change-{change}">{change}</span><span>{html.escape(value)}</span></div>'''


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
    search = html.escape(f"{change} building {name} {details}".lower())
    return f'''<div class="history-string history-item" data-search="{search}"><span class="change change-{change}">{change}</span><span><strong>{html.escape(str(name))}</strong> {detail_html}</span></div>'''


def _active_string_section(results: dict) -> str:
    records = results.get("active_strings", [])
    records_by_date: dict[str, list[dict]] = {}
    for record in records:
        records_by_date.setdefault(record.get("last_added_date", "unknown"), []).append(record)
    groups = "".join(
        f'''<section class="string-date-group"><h3>{html.escape(added_date)}</h3>
<div class="string-rows">{''.join(_active_string_row(record) for record in date_records)}</div></section>'''
        for added_date, date_records in sorted(records_by_date.items(), reverse=True)
    )
    removals = results.get("removal_events", [])
    removal_items = "".join(
        f'<li><span class="tag">{html.escape(event.get("removed_date", ""))}</span> '
        f'{html.escape(event.get("text", ""))}</li>'
        for event in removals
    )
    return f'''<section id="active-strings">
<div class="section-head"><div><div class="eyebrow">BONUS DESCRIPTIONS</div><h2>Latest Great Building bonus descriptions</h2></div>
<p class="meta">Grouped by the date each description was last added. Full text is shown for comparison.</p></div>
<div class="toolbar"><input id="string-search" type="search" placeholder="Search Great Building bonus descriptions…" aria-label="Search Great Building bonus descriptions"></div>
<div class="string-groups" id="active-string-list">{groups or '<p>No matching Great Building bonus descriptions.</p>'}</div>
<details class="audit"><summary>Removed by a later update ({len(removals)})</summary><ul class="strings">{removal_items or '<li>No removed descriptions.</li>'}</ul></details>
</section>'''


def _active_string_row(record: dict) -> str:
    search = f"{record.get('last_added_date', '')} {record.get('text', '')}".lower()
    return f'''<article class="string-row" data-search="{html.escape(search)}">
<p class="string-text">{html.escape(record.get('text', ''))}</p></article>'''


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
