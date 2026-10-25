(() => {
  'use strict';
  const source=window.GB_PRESTIGE_DATA, core=window.PrestigeCore;
  const rowPriority=row=>(source.boosts[row.boost].multiplier?0:2)+(row.tier==='Gold'?0:1);
  const data={...source,buildings:source.buildings.map(b=>({...b,rows:[...b.rows].sort((a,b)=>rowPriority(a)-rowPriority(b))}))};
  const $=s=>document.querySelector(s);
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const armyWords=v=>String(v).replace(/\b(attacking|defending)[ -]arm(?:y|ies)\b/gi,(_,army)=>army.toLowerCase()==='attacking'?'red':'blue').replace(/\bboth armies\b/gi,'both red and blue');
  const armyText=v=>escape(armyWords(v)).replace(/\b(red|blue)\b/g,color=>`<span class="army-${color==='red'?'attacking':'defending'}">${color}</span>`);
  const number=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
  const amount=(v,missing='Not supplied')=>core.finite(v)?number(v):missing;
  const factor=v=>`×${number(1+v/100)}`;
  const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const boost=row=>data.boosts[row.boost];
  const lookup=new Map(data.buildings.map(b=>[b.id,b]));
  const selected=new Set(), states=new Map(), mounted=new Map(), comparisonLevels=new Map();
  let focus='All goals';
  const rank={'Strong candidate':0,Situational:1,'Lower priority':2};
  const goals=['All goals','Multiplicative','GBG','GE','QI','Combat','FP','Contributions','Goods','Guild','Historical Allies','Aiding','Quests','City resources'];
  const selection=b=>{if(!states.has(b.id))states.set(b.id,{from:50,to:150});return states.get(b.id);};
  const mobileView=matchMedia('(max-width:750px)');
  const setGuideDefault=()=>{$('#tiers').open=!mobileView.matches||location.hash==='#tiers';};
  setGuideDefault();mobileView.addEventListener('change',setGuideDefault);
  function renderThemeToggle(){const dark=document.documentElement.dataset.theme==='dark';$('#theme-toggle-icon').textContent=dark?'☀':'☾';$('#theme-toggle-label').textContent=dark?'Light':'Dark';$('#theme-toggle').setAttribute('aria-label',`Switch to ${dark?'light':'dark'} mode`);$('#theme-toggle').setAttribute('aria-pressed',String(dark));}
  $('#theme-toggle').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('gb-analysis-theme',theme);}catch{}renderThemeToggle();});renderThemeToggle();

  function labelMarkup(row,infoId){
    const info=boost(row),label=row.uncertain?'Defending-army multiplier ⚑':info.label;
    const context=info.scope==='City / guild'?(info.mechanic==='Bonus'?'':info.mechanic):info.scope;
    return `<div class="row-label"><img src="${escape(info.icon)}" alt="" loading="lazy"><span><strong>${armyText(label)}${infoId?` <button type="button" class="boost-info-button" data-boost-info="${infoId}" aria-controls="${infoId}" aria-expanded="false" aria-label="About ${escape(armyWords(label))}"><span aria-hidden="true">i</span></button>`:''}</strong><small class="${row.tier==='Gold'?'gold-text':''}">${row.tier}${context?` · ${armyText(context)}`:''}</small></span></div>`;
  }
  function valueText(row,level){
    const state=core.status(row,level);
    if(state!=='available')return state==='locked'?'Not unlocked':'Not supplied';
    let result=number(row.values[level-1])+(row.unit==='percent'?'%':row.unit==='levels'?' ally levels':'');
    if(row.charges)result+=core.finite(row.charges[level-1])?` ×${number(row.charges[level-1])}`:' · limit not supplied';
    return result;
  }
  function deltaText(row,from,to){
    const d=core.difference(row,from,to),info=boost(row);
    if(d.kind==='invalid')return 'Choose a higher target';
    if(d.kind==='missing'||d.kind==='missing-start')return 'Change not supplied';
    if(d.kind==='locked')return 'Not unlocked';
    if(d.kind==='unlock')return `Unlock: ${valueText(row,to)}${info.multiplier?` (${factor(d.value)})`:''}`;
    let text=info.multiplier?`${factor(d.start)} → ${factor(d.value)}`:d.delta===0?'No boost change':`${d.delta>0?'+':''}${number(d.delta)}${row.unit==='percent'?' percentage points':row.unit==='levels'?' ally levels':''}`;
    if(d.charges)text+=`; ${d.charges>0?'+':''}${number(d.charges)} attempts`;
    return text;
  }
  function explanation(row,level){
    const info=boost(row),v=row.values[level-1];
    let result=armyText(info.description);
    if(info.multiplier&&core.finite(v))result+=` Adding ${number(v)}% of the baseline gives a <strong>${factor(v)}</strong> result for this effect. Example per stat: 5,000% → ${number(5000*(1+v/100))}% (+${number(50*v)} percentage points).`;
    const expected=core.expected(row,level,info);
    if(expected!==null)result+=` ${number(expected)} average successes if all ${number(row.charges[level-1])} attempts are used. A daily refresh rate is not specified for this limit.`;
    return result;
  }
  function seriesFor(b){
    return b.rows.flatMap(row=>{
      const info=boost(row),unit=info.multiplier?'Multiplier rate (%)':row.unit==='percent'?(info.mechanic==='Chance'?'Chance (%)':'Boost (%)'):row.unit==='levels'?'Ally levels':info.label;
      const main={row,values:row.values,tier:row.tier,label:`${info.label} by building level`,unit};
      return row.charges?[main,{...main,charges:true,values:row.charges,label:`${info.label} attempt limit by building level`,unit:'Attempts / collections'}]:[main];
    });
  }
  function infoMarkup(b,row){
    return `<p>${explanation(row,selection(b).to)}</p>${row.uncertain?b.notes.map(note=>`<p class="note-warning">${armyText(note)}</p>`).join(''):''}`;
  }
  function stepsMarkup(b,row){
    if(!boost(row).multiplier)return '';
    const steps=core.multiplierSteps(row);
    return `<div class="multiplier-steps"><h5>Multiplier step levels</h5><div class="step-levels">${steps.length?steps.map(step=>`<button type="button" class="step-level" data-step-level="${step.level}" aria-pressed="${selection(b).to===step.level}" aria-label="Set target to level ${step.level}: ${number(step.value)}% multiplier (${factor(step.value)})"><span>Lv ${step.level}</span><strong>${number(step.value)}%${step.kind==='increase'?'':` <span class="step-kind">${step.kind}</span>`}</strong></button>`).join(''):'<p class="footnote">No confirmed step levels supplied.</p>'}</div></div>`;
  }
  function plotMarkup(b){
    return seriesFor(b).map((series,index)=>{
      const row=series.row,available=series.values.filter(core.finite).length;
      const infoId=`boost-info-${b.id}-${row.id}`;
      return `<section class="progression-panel${series.charges?' attempts-panel':''}">${series.charges?'<p class="attempts-heading">Eligible attempts / collections</p>':`${labelMarkup(row,infoId)}<div class="boost-info-panel" id="${infoId}" data-info-row="${row.id}" hidden>${infoMarkup(b,row)}</div>`}<svg class="boost-plot${series.charges?' attempts-plot':''}" data-series="${index}" role="img" aria-label="${escape(series.label)}"></svg>${series.charges?'':`<div class="plot-selected" data-plot-value="${row.id}"></div><p class="plot-coverage">${available} supplied levels · ${row.tier==='Gold'?'Gold unlocks at 101':'Copper'}${row.uncertain?' · effect scope unconfirmed':''}</p>${stepsMarkup(b,row)}`}</section>`;
    }).join('');
  }
  function controlsMarkup(b){const s=selection(b),max=b.levels.length;return `<div class="level-controls"><label>Current level<input type="number" min="0" max="${max-1}" value="${s.from}" data-from="${b.id}" aria-label="${escape(b.name)} current level"></label><span aria-hidden="true">→</span><label>Target level<input type="number" min="1" max="${max}" value="${s.to}" data-to="${b.id}" aria-label="${escape(b.name)} target level"></label></div><p class="graph-hint">Hover for details. Click or tap any level to set your target.<br><span class="line-key current-key"></span>Current <span class="line-key target-key"></span>Target</p>`;}
  function summaryMarkup(b){
    const s=selection(b),cost=core.upgrade(b,s.from,s.to);
    if(!cost.valid)return '<p class="plan-error" role="alert">Choose a target above your current level.</p>';
    return `<h4>Upgrade ${s.from} → ${s.to}</h4><p class="plan-fp">${amount(cost.fp)} <span>FP</span></p><p class="footnote">total FP cost${core.finite(cost.previousFP)?`<small class="live-comparison">(compared with ${number(cost.previousFP)} FP on the live server)</small>`:''}</p><div class="delta-list">${b.rows.map(row=>`<div class="delta-row"><span>${armyText(row.uncertain?'Defending-army multiplier ⚑':boost(row).label)}</span><strong>${escape(deltaText(row,s.from,s.to))}</strong></div>`).join('')}</div>`;
  }
  function costsMarkup(b){
    const s=selection(b),cost=core.upgrade(b,s.from,s.to);
    if(!cost.valid)return '<p>Choose a target above your current level.</p>';
    const rows=[['Copper blueprint sets',cost.copperSets,2],...(b.gold&&s.to>=101?[['Gold blueprint sets',cost.goldSets,3]]:[]),['Coins',cost.coinsSupplies,4],['Supplies',cost.coinsSupplies,4],['Medals',cost.medals,5],['Goods — each type',cost.goodsEach,6]];
    return `<h4>Unlocking cost: level ${s.from} → ${s.to}</h4><dl class="resource-list">${rows.map(([name,value,field])=>`<div><dt>${name}</dt><dd>${amount(value,b.pendingUnlockCosts?.fields.includes(field)&&s.to>=b.pendingUnlockCosts.fromLevel?'TBA':'Not supplied')}</dd></div>`).join('')}</dl>`;
  }
  function rewardsMarkup(b){
    const level=selection(b).to,values=b.levelData[level-1],places=b.gold&&level>=101?7:5;
    return `<h4>Base contributor FP rewards at level ${level}</h4><dl class="resource-list rewards-list">${Array.from({length:places},(_,i)=>`<div><dt>Place ${i+1}</dt><dd>${amount(values[7+i])} FP</dd></div>`).join('')}</dl>`;
  }
  function detailMarkup(b){
    return `<details class="card-details"><summary>Unlocking cost & base contributor FP rewards</summary><div class="details-body planning-details"><section data-costs="${b.id}">${costsMarkup(b)}</section><section data-rewards="${b.id}">${rewardsMarkup(b)}</section></div></details>`;
  }
  function cardMarkup(b){
    const priority=b.priority==='Strong candidate'?'strong':b.priority==='Situational'?'situational':'lower';
    return `<article class="building-card${selected.has(b.id)?' is-selected':''}" id="${b.slug}" data-building="${b.id}"><div class="card-top"><div><span class="tier-label${b.gold?'':' copper-label'}">${b.gold?'COPPER + GOLD':'COPPER ONLY'}</span><h3>${escape(b.name)}</h3><p class="card-meta">${b.footprint.width} × ${b.footprint.height} · ${b.footprint.tiles} tiles · ${escape(b.era)}</p></div><label class="compare-label"><input type="checkbox" data-compare="${b.id}"${selected.has(b.id)?' checked':''} aria-label="Compare ${escape(b.name)}">Compare</label></div><div class="card-summary"><div class="recommend-line"><span class="badge ${priority}">${b.priority}</span></div><p class="audience">${armyText(b.audience)}</p><p class="decision-note">${armyText(b.guidance)}</p>${b.notes.length?'<p class="warning-chip">⚑ Check this boost’s effect in game</p>':''}<section class="upgrade-summary" data-plan="${b.id}" aria-live="polite">${summaryMarkup(b)}</section></div><div class="card-values"><div class="table-heading">Explore boosts & plan an upgrade</div>${controlsMarkup(b)}<div class="progression-charts" data-charts="${b.id}">${plotMarkup(b)}</div></div>${detailMarkup(b)}</article>`;
  }
  const tooltip=$('#chart-tooltip');
  const hideTooltip=()=>{tooltip.hidden=true;};
  function showTooltip(event,b,series,level){
    const row=series.row,s=selection(b),value=series.charges?`${amount(row.charges[level-1])} attempts / collections`:valueText(row,level);
    tooltip.innerHTML=`<strong class="tooltip-level">Level ${level}</strong>${labelMarkup(row)}<p class="tooltip-value">${escape(value)}${boost(row).multiplier&&core.status(row,level)==='available'?` · ${factor(row.values[level-1])}`:''}</p><div class="tooltip-cost"><span>FP for this level</span><b>${amount(b.levelData[level-1][0])}</b></div>${level>s.from?`<div class="tooltip-cost"><span>FP from ${s.from} → ${level}</span><b>${amount(core.rangeSum(b,0,s.from,level))}</b></div>`:''}`;
    tooltip.hidden=false;
    const width=tooltip.offsetWidth,height=tooltip.offsetHeight;
    tooltip.style.left=`${Math.max(8,Math.min(innerWidth-width-8,event.clientX+16))}px`;
    tooltip.style.top=`${Math.max(8,Math.min(innerHeight-height-8,event.clientY-height-12))}px`;
  }
  const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;const host=entry.target,b=lookup.get(host.dataset.charts);if(!mounted.has(b.id))mounted.set(b.id,window.PrestigeCharts.mount(host,seriesFor(b),selection(b),{hover:(e,s,l)=>showTooltip(e,b,s,l),leave:hideTooltip,select:level=>{selection(b).to=level;updateBuilding(b);}}));observer.unobserve(host);}},{rootMargin:'500px'});
  function updateBuilding(b){
    const card=document.querySelector(`[data-building="${b.id}"]`);if(!card)return;
    const s=selection(b);
    card.querySelector('[data-from]').value=s.from;card.querySelector('[data-to]').value=s.to;
    card.querySelector('[data-plan]').innerHTML=summaryMarkup(b);
    card.querySelector('[data-costs]').innerHTML=costsMarkup(b);
    card.querySelector('[data-rewards]').innerHTML=rewardsMarkup(b);
    b.rows.forEach(row=>{card.querySelector(`[data-plot-value="${row.id}"]`).innerHTML=`Level ${s.to}: <strong>${escape(valueText(row,s.to))}</strong>${boost(row).multiplier&&core.status(row,s.to)==='available'?` · ${factor(row.values[s.to-1])}`:''}`;card.querySelector(`[data-info-row="${row.id}"]`).innerHTML=infoMarkup(b,row);});
    card.querySelectorAll('[data-step-level]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.stepLevel)===s.to)));
    mounted.get(b.id)?.update(s);
  }
  function filteredBuildings(){
    const query=normalize($('#search').value.trim()),tier=$('#tier-filter').value,priority=$('#priority-filter').value;
    const list=data.buildings.filter(b=>(tier==='all'||b.gold===(tier==='gold'))&&(priority==='all'||b.priority===priority)&&core.matchesGoal(b,focus,data.boosts)&&(!query||[b.name,...b.tags,b.audience,...b.rows.flatMap(r=>[boost(r).label,boost(r).scope,boost(r).description])].some(text=>normalize(text).includes(query)||normalize(armyWords(text)).includes(query))));
    const sort=$('#sort').value;
    return list.sort((a,b)=>Number(b.gold)-Number(a.gold)||(sort==='priority'?rank[a.priority]-rank[b.priority]:sort==='checkpoint'?a.checkpoint-b.checkpoint:0)||a.name.localeCompare(b.name));
  }
  function render(){
    observer.disconnect();mounted.forEach(chart=>chart.destroy());mounted.clear();hideTooltip();
    const items=filteredBuildings();$('#result-count').textContent=items.length===data.buildings.length?`${items.length} buildings`:`${items.length} of ${data.buildings.length} buildings`;
    $('#building-grid').innerHTML=[true,false].map(gold=>{const group=items.filter(b=>b.gold===gold);return group.length?`<section aria-label="${gold?'Gold-tier':'Copper-only'} buildings"><div class="group-title"><h3>${gold?'Gold upgrades':'Copper only'}</h3><span>${group.length} buildings · ${gold?'Gold unlocks at 101':'maximum level 200'}</span></div><div class="card-grid">${group.map(cardMarkup).join('')}</div></section>`:'';}).join('');
    $('#empty').hidden=items.length>0;items.forEach(updateBuilding);
    document.querySelectorAll('[data-charts]').forEach(host=>observer.observe(host));
  }
  function renderFocus(){$('#focus-filters').innerHTML=goals.map(goal=>`<button class="focus-button" type="button" data-focus="${goal}" aria-pressed="${focus===goal}">${goal==='Multiplicative'?'<span class="goal-mark" aria-hidden="true">×</span>':''}${goal}</button>`).join('');}
  function reset(){$('#search').value='';$('#tier-filter').value='all';$('#priority-filter').value='all';$('#sort').value='name';focus='All goals';renderFocus();render();}
  function syncTray(){$('#compare-tray').hidden=selected.size===0;$('#compare-count').textContent=`${selected.size} of 3 selected`;$('#open-compare').disabled=selected.size<2;}
  function renderComparison(){
    $('#comparison-content').innerHTML=`<div class="comparison-grid" style="--columns:${selected.size}">${[...selected].map(id=>{const b=lookup.get(id),level=comparisonLevels.get(id)??selection(b).to;return `<article class="comparison-card"><span class="tier-label ${b.gold?'':'copper-label'}">${b.gold?'COPPER + GOLD':'COPPER ONLY'}</span><h3>${escape(b.name)}</h3><p class="compare-target">${armyText(b.audience)}<br>${b.footprint.tiles} tiles</p><label class="pick-level">At level <input type="number" min="1" max="${b.levels.length}" value="${level}" data-comparison-level="${id}" aria-label="Comparison level for ${escape(b.name)}"></label>${b.rows.map(row=>`<div class="compare-boost">${labelMarkup(row)}<div class="compare-value">${escape(valueText(row,level))}${boost(row).multiplier&&core.status(row,level)==='available'?` · ${factor(row.values[level-1])}`:''}</div></div>`).join('')}<p class="footnote">FP for this level: ${amount(b.levelData[level-1][0])}<br>Total FP from level 0: ${amount(b.levelData[level-1][1])}</p>${b.notes.map(note=>`<p class="footnote">${armyText(note)}</p>`).join('')}</article>`;}).join('')}</div>`;
  }
  $('#focus-filters').addEventListener('click',event=>{const button=event.target.closest('[data-focus]');if(button){focus=button.dataset.focus;renderFocus();render();}});
  let searchTimer;$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(render,100);});
  ['#tier-filter','#priority-filter','#sort'].forEach(s=>$(s).addEventListener('change',render));
  $('#reset').addEventListener('click',reset);$('#empty-reset').addEventListener('click',reset);
  $('#building-grid').addEventListener('click',event=>{
    const info=event.target.closest('[data-boost-info]');
    if(info){const panel=document.getElementById(info.dataset.boostInfo);panel.hidden=!panel.hidden;info.setAttribute('aria-expanded',String(!panel.hidden));return;}
    const step=event.target.closest('[data-step-level]');
    if(step){const b=lookup.get(step.closest('[data-building]').dataset.building);selection(b).to=Number(step.dataset.stepLevel);hideTooltip();updateBuilding(b);}
  });
  $('#building-grid').addEventListener('change',event=>{
    const input=event.target;
    if(input.matches('[data-compare]')){const id=input.dataset.compare;if(input.checked&&selected.size>=3){input.checked=false;$('#result-count').textContent='Compare up to 3 buildings. Uncheck one to add another.';return;}input.checked?selected.add(id):selected.delete(id);input.closest('.building-card').classList.toggle('is-selected',input.checked);syncTray();}
    else if(input.matches('[data-from],[data-to]')){const b=lookup.get(input.dataset.from||input.dataset.to),s=selection(b),key=input.dataset.from?'from':'to';if(core.finite(input.valueAsNumber))s[key]=core.clamp(input.valueAsNumber,key==='from'?0:1,b.levels.length-(key==='from'?1:0));hideTooltip();updateBuilding(b);}
  });
  $('#clear-compare').addEventListener('click',()=>{selected.clear();syncTray();document.querySelectorAll('[data-compare]').forEach(input=>{input.checked=false;input.closest('.building-card').classList.remove('is-selected');});});
  $('#open-compare').addEventListener('click',()=>{if(selected.size>=2){renderComparison();$('#compare-dialog').showModal();hideTooltip();}});
  $('#close-compare').addEventListener('click',()=>$('#compare-dialog').close());
  $('#compare-dialog').addEventListener('click',event=>{if(event.target===$('#compare-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
  $('#comparison-content').addEventListener('change',event=>{const input=event.target;if(!input.matches('[data-comparison-level]'))return;const id=input.dataset.comparisonLevel,b=lookup.get(id);if(core.finite(input.valueAsNumber))comparisonLevels.set(id,core.clamp(input.valueAsNumber,1,b.levels.length));renderComparison();document.querySelector(`[data-comparison-level="${id}"]`).focus();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hideTooltip();});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.boost-plot'))hideTooltip();});
  document.addEventListener('scroll',hideTooltip,{capture:true,passive:true});
  renderFocus();render();syncTray();
  if(location.hash){const el=document.getElementById(location.hash.slice(1));if(el?.matches('#tiers')){el.open=true;el.scrollIntoView();}else if(el?.matches('.building-card'))el.scrollIntoView();}
})();
