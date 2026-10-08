/* The source snapshot is deliberately separate from the live GB planner. */
(() => {
  'use strict';
  const data = window.GB_PRESTIGE_DATA;
  const $ = (s) => document.querySelector(s);
  const mobileView = matchMedia('(max-width: 750px)');
  const setGuideDefault = () => { $('#tiers').open = !mobileView.matches || location.hash === '#tiers'; };
  setGuideDefault();
  mobileView.addEventListener('change', setGuideDefault);
  const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const armyWords = (v) => String(v).replace(/\b(attacking|defending)[ -]arm(?:y|ies)\b/gi, (_, army) => army.toLowerCase() === 'attacking' ? 'red' : 'blue').replace(/\bboth armies\b/gi, 'both red and blue');
  const armyText = (v) => escape(v).replace(/\b(attacking|defending)[ -]arm(?:y|ies)\b/gi, (label, army) => `<span class="army-${army.toLowerCase()}">${armyWords(label)}</span>`).replace(/\bboth armies\b/gi, 'both <span class="army-attacking">red</span> and <span class="army-defending">blue</span>');
  const number = (v) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v);
  function renderThemeToggle() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    $('#theme-toggle-icon').textContent = isDark ? '☀' : '☾';
    $('#theme-toggle-label').textContent = isDark ? 'Light' : 'Dark';
    $('#theme-toggle').setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
    $('#theme-toggle').setAttribute('aria-pressed', String(isDark));
  }
  $('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('gb-analysis-theme', theme); } catch { /* Theme still works without storage. */ }
    renderThemeToggle();
  });
  renderThemeToggle();
  const selected = new Set();
  const comparisonLevels = new Map();
  let focus = 'All goals';
  const rank = { 'Strong candidate': 0, Situational: 1, 'Lower priority': 2 };
  const goals = ['All goals','GBG','GE','QI','Combat','FP','Contributions','Goods','Guild','Historical Allies','Aiding','Quests','City resources'];
  const lookup = new Map(data.buildings.map((b) => [b.id, b]));
  const boost = (row) => data.boosts[row.boost];
  const priorityClass = (p) => p === 'Strong candidate' ? 'strong' : p === 'Situational' ? 'situational' : 'lower';
  const percent = (c) => c.unit === 'percent';

  function valueMarkup(cell) {
    if (cell.value === null) return '<span aria-label="Not unlocked">—</span>';
    const parts = cell.text.split(/\s+(?=×|\/24h)/);
    return escape(parts[0]) + (parts[1] ? `<span class="charge">${escape(parts.slice(1).join(' '))}</span>` : '');
  }
  function labelMarkup(row) {
    const info = boost(row);
    const label = row.uncertain ? 'Defending-army multiplier ⚑' : info.label;
    const context = info.scope === 'City / guild' ? (info.mechanic === 'Bonus' ? '' : info.mechanic) : info.scope;
    return `<div class="row-label"><img src="${escape(info.icon)}" alt="" loading="lazy"><span><strong>${armyText(label)}</strong><small class="${row.tier === 'Gold' ? 'gold-text' : ''}">${row.tier}${context ? ` · ${armyText(context)}` : ''}</small></span></div>`;
  }
  function tableMarkup(b) {
    return `<div class="table-scroll" tabindex="0" role="region" aria-label="${escape(b.name)} boost values; scroll horizontally for every level"><table class="${b.gold ? 'gold-levels' : 'copper-levels'}"><caption class="sr-only">${escape(b.name)} boosts at each shown level</caption><thead><tr><th scope="col">Boost</th>${b.levels.map((l) => `<th scope="col"${l === b.checkpoint ? ' class="review-column"' : ''}>Level ${l}${l === b.checkpoint ? '<span class="review-marker">Review level</span>' : ''}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr><th scope="row">${labelMarkup(r)}</th>${r.values.map((c, i) => `<td${b.levels[i] === b.checkpoint ? ' class="review-column"' : ''}>${valueMarkup(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function optionMarkup(levels, chosen) {
    return levels.map((l) => `<option value="${l}"${l === chosen ? ' selected' : ''}>Level ${l}</option>`).join('');
  }
  function deltaText(a, b) {
    if (b.value === null && a.value === null) return 'Not yet unlocked';
    if (a.value === null) return `Unlock: ${b.text}`;
    if (b.value === null) return 'Not unlocked at the selected level';
    const diff = b.value - a.value;
    const charges = (b.charges ?? 0) - (a.charges ?? 0);
    if (diff === 0 && charges === 0) return 'No visible change';
    const prefix = a.approximate || b.approximate ? '≈ ' : '';
    const amount = `${diff > 0 ? '+' : ''}${number(diff)}`;
    const unit = percent(b) ? ' percentage points' : b.unit === 'levels' ? ' ally levels' : b.perDay ? ' /day' : '';
    const chargeText = charges ? `; ${charges > 0 ? '+' : ''}${number(charges)} attempts` : '';
    return prefix + (diff ? amount + unit : 'Same value') + chargeText;
  }
  function deltaMarkup(b, from, to) {
    if (from >= to) return '<p>Choose a higher ending level.</p>';
    const ai = b.levels.indexOf(from), bi = b.levels.indexOf(to);
    return b.rows.map((r) => {
      const info = boost(r), a = r.values[ai], z = r.values[bi];
      const expected = a.expectedTriggers != null && z.expectedTriggers != null ? `<div class="delta-row"><span>Average successes${z.perDay ? ' per day' : ''} with all attempts used</span><strong>${number(a.expectedTriggers)} → ${number(z.expectedTriggers)}</strong></div>` : '';
      return `<div class="delta-row"><span>${armyText(info.label)}${r.uncertain ? ' · effect unconfirmed' : ''}</span><strong>${escape(deltaText(a,z))}</strong></div>${expected}`;
    }).join('');
  }
  function detailMarkup(b) {
    const start = b.checkpoint, end = b.gold ? 401 : 200;
    return `<div class="details-body"><p class="advice"><strong>What to consider</strong>${armyText(b.guidance)}</p>${b.notes.map((n) => `<p class="note-warning">${armyText(n)}</p>`).join('')}
      <p class="table-note">${b.gold ? 'Copper boosts stop growing at 200; the screenshot shows level 201. ' : ''}Values keep the rounding shown in the screenshot.</p>
      <div class="step-compare"><h4>Compare two levels</h4><div class="step-controls"><label>From <select data-from="${b.id}" aria-label="Starting level for ${escape(b.name)}">${optionMarkup(b.levels,start)}</select></label><span aria-hidden="true">→</span><label>To <select data-to="${b.id}" aria-label="Destination level for ${escape(b.name)}">${optionMarkup(b.levels,end)}</select></label></div><div class="delta-list" data-delta="${b.id}">${deltaMarkup(b,start,end)}</div><p class="footnote">Average successes = chance × attempts. Rewards vary, and rounded values can hide small gains.</p></div>
      <details class="source-details"><summary>Boost descriptions</summary>${b.rows.map((r) => { const info=boost(r); return `<div class="boost-explanation">${labelMarkup(r)}<p>${armyText(info.description)}</p><code>Tracker: ${escape(info.family)}<br>Game reference: ${escape(info.class_name.split('.').pop())}</code>${r.uncertain ? `<p>The official announcement describes defense only. <a href="${data.officialRules}" target="_blank" rel="noopener">Read the announcement ↗</a></p>` : ''}</div>`; }).join('')}<p class="footnote">Icons and descriptions use the GB Update Tracker’s October 7 snapshot.</p></details>
      </div>`;
  }
  function cardMarkup(b) {
    const primary = b.gold ? b.rows.filter((r) => r.tier === 'Gold') : b.rows;
    return `<article class="building-card${selected.has(b.id) ? ' is-selected' : ''}" id="${b.slug}" data-building="${b.id}"><div class="card-top"><div><span class="tier-label${b.gold ? '' : ' copper-label'}">${b.gold ? 'COPPER + GOLD' : 'COPPER ONLY'}</span><h3>${escape(b.name)}</h3><p class="card-meta">${b.footprint.width} × ${b.footprint.height} · ${b.footprint.tiles} tiles · ${escape(b.era)}</p></div><label class="compare-label"><input type="checkbox" data-compare="${b.id}"${selected.has(b.id) ? ' checked' : ''} aria-label="Compare ${escape(b.name)}">Compare</label></div><div class="card-summary"><div class="recommend-line"><span class="badge ${priorityClass(b.priority)}">${b.priority}</span></div><p class="audience">${armyText(b.audience)}</p><div class="key-boosts">${primary.map((r) => `<span class="boost-chip"><img src="${boost(r).icon}" alt="" loading="lazy"><span>${armyText(boost(r).label)}${boost(r).scope !== 'City / guild' ? ` · ${armyText(boost(r).scope)}` : ''}</span>`).join('')}</div>${b.rows.some((r) => r.uncertain) ? '<p class="warning-chip">⚑ Check this boost’s effect in game</p>' : ''}</div><div class="card-values"><div class="table-heading"><span>Boosts by level</span></div>${tableMarkup(b)}<p class="table-scroll-hint">Scroll sideways to see all levels.</p></div><details class="card-details"><summary>Upgrade advice & details</summary>${detailMarkup(b)}</details></article>`;
  }
  function normalize(text) { return text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
  function filteredBuildings() {
    const query=normalize($('#search').value.trim()), tier=$('#tier-filter').value, priority=$('#priority-filter').value;
    const result=data.buildings.filter((b) => (tier==='all' || b.gold===(tier==='gold')) && (priority==='all'||b.priority===priority) && (focus==='All goals'||b.tags.includes(focus)) && (!query || [b.name,...b.tags,b.audience,...b.rows.flatMap((r)=>[boost(r).label,boost(r).scope,boost(r).description])].some((text)=>normalize(text).includes(query)||normalize(armyWords(text)).includes(query))));
    const sort=$('#sort').value;
    return result.sort((a,b)=> Number(b.gold)-Number(a.gold) || (sort==='priority' ? rank[a.priority]-rank[b.priority] : sort==='checkpoint' ? a.checkpoint-b.checkpoint : 0) || a.name.localeCompare(b.name));
  }
  function render() {
    const items=filteredBuildings();
    $('#result-count').textContent=items.length===49 ? '49 buildings' : `${items.length} of 49 buildings`;
    $('#building-grid').innerHTML=[true,false].map((gold)=>{
      const group=items.filter((b)=>b.gold===gold); if(!group.length) return '';
      return `<section aria-label="${gold?'Gold-tier':'Copper-only'} buildings"><div class="group-title"><h3>${gold?'Gold upgrades':'Copper only'}</h3><span>${group.length} buildings · ${gold?'Gold unlocks at 101':'maximum level 200'}</span></div><div class="card-grid">${group.map(cardMarkup).join('')}</div></section>`;
    }).join('');
    $('#empty').hidden=items.length>0;
  }
  function reset() {
    $('#search').value='';$('#tier-filter').value='all';$('#priority-filter').value='all';$('#sort').value='name';focus='All goals';renderFocus();render();
  }
  function renderFocus() {
    $('#focus-filters').innerHTML=goals.map((goal)=>`<button class="focus-button" type="button" data-focus="${goal}" aria-pressed="${focus===goal}">${goal}</button>`).join('');
  }
  function syncTray() {
    $('#compare-tray').hidden=selected.size===0;
    $('#compare-count').textContent=`${selected.size} of 3 selected`;
    $('#open-compare').disabled=selected.size<2;
  }
  function renderComparison() {
    $('#comparison-content').innerHTML=`<div class="comparison-grid" style="--columns:${selected.size}">${[...selected].map((id)=>{
      const b=lookup.get(id);const level=comparisonLevels.get(id) ?? b.checkpoint;const index=b.levels.indexOf(level);
      return `<article class="comparison-card"><span class="tier-label ${b.gold?'':'copper-label'}">${b.gold?'COPPER + GOLD':'COPPER ONLY'}</span><h3>${escape(b.name)}</h3><p class="compare-target">${armyText(b.audience)}<br>${b.footprint.tiles} tiles</p><label class="pick-level">At <select data-comparison-level="${b.id}" aria-label="Comparison level for ${escape(b.name)}">${optionMarkup(b.levels,level)}</select></label>${b.rows.map((r)=>{ const c=r.values[index]; return `<div class="compare-boost">${labelMarkup(r)}<div class="compare-value">${valueMarkup(c)}</div>${c.expectedTriggers != null?`<p>${number(c.expectedTriggers)} average successes${c.perDay?' per day':''} with all attempts used.</p>`:''}${r.uncertain?'<p>Check in game whether this boost includes attack.</p>':''}</div>`;}).join('')}<p class="footnote">${armyText(b.guidance)}</p></article>`;
    }).join('')}</div>`;
  }
  $('#focus-filters').addEventListener('click',(event)=>{const b=event.target.closest('[data-focus]');if(!b)return;focus=b.dataset.focus;renderFocus();render();});
  $('#search').addEventListener('input',render);
  ['#tier-filter','#priority-filter','#sort'].forEach((s)=>$(s).addEventListener('change',render));
  $('#reset').addEventListener('click',reset);$('#empty-reset').addEventListener('click',reset);
  $('#building-grid').addEventListener('change',(event)=>{
    const input=event.target;
    if(input.matches('[data-compare]')){
      const id=input.dataset.compare;
      if(input.checked && selected.size>=3){input.checked=false;$('#result-count').textContent='Compare up to 3 buildings. Uncheck one to add another.';return;}
      input.checked?selected.add(id):selected.delete(id);input.closest('.building-card').classList.toggle('is-selected',input.checked);syncTray();
    } else if(input.matches('[data-from],[data-to]')){
      const id=input.dataset.from||input.dataset.to;const card=input.closest('.building-card');
      card.querySelector('[data-delta]').innerHTML=deltaMarkup(lookup.get(id),Number(card.querySelector('[data-from]').value),Number(card.querySelector('[data-to]').value));
    }
  });
  $('#clear-compare').addEventListener('click',()=>{selected.clear();syncTray();document.querySelectorAll('[data-compare]').forEach((x)=>{x.checked=false;x.closest('.building-card').classList.remove('is-selected');});});
  $('#open-compare').addEventListener('click',()=>{if(selected.size<2)return;renderComparison();$('#compare-dialog').showModal();});
  $('#close-compare').addEventListener('click',()=>$('#compare-dialog').close());
  $('#compare-dialog').addEventListener('click',(e)=>{if(e.target===$('#compare-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  $('#comparison-content').addEventListener('change',(e)=>{if(!e.target.matches('[data-comparison-level]'))return;const id=e.target.dataset.comparisonLevel;comparisonLevels.set(id,Number(e.target.value));renderComparison();document.querySelector(`[data-comparison-level="${id}"]`).focus();});
  renderFocus();render();syncTray();
  if(location.hash){const el=document.getElementById(location.hash.slice(1));if(el?.matches('#tiers')){el.open=true;el.scrollIntoView();}else if(el?.matches('.building-card'))el.scrollIntoView();}
})();
