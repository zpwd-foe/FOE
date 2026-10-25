(() => {
  'use strict';
  const data = window.GB_PRESTIGE_DATA, combat = window.PrestigeCombat;
  const $ = selector => document.querySelector(selector);
  const view = $('#simple-view'), explorer = $('#explorer'), icon = $('#site-icon');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  const gain = value => value === null ? 'Not supplied' : `+${number(value)}%`;
  const modeNames = { regular: 'Regular', gbg: 'GBG', ge: 'GE' };
  const countClick = combat.rapidClicks();
  let scrollBefore = 0;
  const warning = parts => {
    const levels = [...new Set(parts.filter(part => part.active && part.retained).map(part => part.sourceLevel))];
    if (!levels.length) return '';
    const label = `Uses last known boosts from level ${levels.join(', ')}; target-level values are unconfirmed.`;
    return ` <span class="retained-warning" role="img" aria-label="${label}" title="${label}">⚠</span>`;
  };

  function breakdown(result) {
    return result.parts.map(part => {
      const army = part.info.scope.split(' · ')[1];
      const scope = army === 'both armies' ? '<span class="army-attacking">red</span> + <span class="army-defending">blue</span>'
        : army === 'attacking army' ? '<span class="army-attacking">red</span>' : '<span class="army-defending">blue</span>';
      const math = !part.active ? 'Not used at your selected weights' : part.locked ? 'Unlocks at level 101' : part.missing ? 'Not supplied at this level'
        : `${part.info.multiplier ? `${number(Number($(`[data-simple-base="${part.mode}"]`).value))}% × ${number(part.value)}%` : `${number(part.value)}%`} × ${number(part.weightedStats)} weighted stats × ${number(part.modeWeight)} ${modeNames[part.mode]} weight`;
      return `<div class="simple-effect"><img src="${escape(part.info.icon)}" alt="" loading="lazy"><div><strong>${escape(part.info.label)}</strong><small>${part.row.tier} · ${modeNames[part.mode]} · ${scope}</small><span>${math}</span>${part.active && part.retained ? `<small class="retained-warning">⚠ Boost retained from level ${part.sourceLevel}</small>` : ''}</div><b>${gain(part.gain)}${warning([part])}<small>weighted</small></b></div>`;
    }).join('');
  }

  function rowMarkup(result, rank) {
    const b = result.building;
    return `<li class="simple-rank-row${rank === 1 ? ' simple-first' : ''}" data-simple-building="${b.id}" data-retained="${result.retained}"><div class="simple-rank${result.retained ? ' has-warning' : ''}"><span>${rank || '—'}</span>${warning(result.parts)}</div><div class="simple-building"><h3>${escape(b.name)}</h3><p>${b.footprint.width} × ${b.footprint.height} · ${b.footprint.tiles} tiles · Lv ${result.level}${result.level < Number($('#simple-level-select').value) ? ' (Copper cap)' : ''}</p></div><div class="simple-modes">${Object.entries(modeNames).map(([mode, name]) => `<div><span>${name}</span><b>${gain(result.modes[mode])}${warning(result.parts.filter(part => part.mode === mode))}</b></div>`).join('')}</div><div class="simple-score"><strong>${result.complete ? `+${number(result.perTile)}%` : 'Unranked'}</strong><span>${result.complete ? 'weighted / tile' : 'Missing level data'}</span>${result.complete ? `<small>${gain(result.total)} weighted total</small>` : ''}${result.retained ? '<small class="retained-warning">Uses last known boosts</small>' : ''}</div><details class="simple-breakdown"><summary>Boost breakdown</summary><div>${breakdown(result)}</div></details></li>`;
  }

  function render() {
    const bases = Object.fromEntries([...view.querySelectorAll('[data-simple-base]')].map(input => [input.dataset.simpleBase, input.valueAsNumber]));
    const ge = $('#simple-mode-weight').valueAsNumber / 100, attack = 1 - $('#simple-stat-weight').valueAsNumber / 100;
    const red = 1 - $('#simple-army-weight').valueAsNumber / 100;
    $('#simple-gbg-weight').textContent = `GBG ×${number(1 - ge)}`;
    $('#simple-ge-weight').textContent = `GE ×${number(ge)}`;
    $('#simple-attack-weight').textContent = `Attack ×${number(attack * 2)}`;
    $('#simple-defense-weight').textContent = `Defense ×${number((1 - attack) * 2)}`;
    $('#simple-red-weight').textContent = `Red ×${number(red * 2)}`;
    $('#simple-blue-weight').textContent = `Blue ×${number((1 - red) * 2)}`;
    $('#simple-mode-weight').setAttribute('aria-valuetext', `GBG weight ${number(1 - ge)}, GE weight ${number(ge)}; regular weight 1`);
    $('#simple-stat-weight').setAttribute('aria-valuetext', `Attack weight ${number(attack * 2)}, defense weight ${number((1 - attack) * 2)}; combined weight 2`);
    $('#simple-army-weight').setAttribute('aria-valuetext', `Red attacking army weight ${number(red * 2)}, blue defending army weight ${number((1 - red) * 2)}; combined weight 2`);
    const results = combat.rank(data.buildings, data.boosts, Number($('#simple-level-select').value), bases, { ge, attack, red });
    const invalid = !results;
    $('#simple-error').hidden = !invalid;
    $('#simple-results').hidden = invalid;
    view.querySelectorAll('input[type="number"]').forEach(input => input.setAttribute('aria-invalid', String(!input.checkValidity() || !Number.isFinite(input.valueAsNumber))));
    if (invalid) return;
    const ranked = results.filter(result => result.complete), missing = results.filter(result => !result.complete);
    $('#simple-level-range').value = $('#simple-level-select').value;
    const expanded = new Set([...view.querySelectorAll('.simple-breakdown[open]')].map(details => details.closest('[data-simple-building]').dataset.simpleBuilding));
    $('#simple-count').textContent = `${ranked.length} ranked · ${ranked.filter(result => result.retained).length} with ⚠ retained boosts${missing.length ? ` · ${missing.length} awaiting level data` : ''} · ${results.length} fighting GBs`;
    $('#simple-ranked').innerHTML = ranked.map((result, index) => rowMarkup(result, index + 1)).join('');
    $('#simple-missing').hidden = !missing.length;
    $('#simple-unranked').innerHTML = missing.map(result => rowMarkup(result, null)).join('');
    view.querySelectorAll('[data-simple-building]').forEach(row => { row.querySelector('.simple-breakdown').open = expanded.has(row.dataset.simpleBuilding); });
  }

  $('#simple-level-select').innerHTML = Array.from({ length: 300 }, (_, index) => `<option value="${index + 1}"${index === 149 ? ' selected' : ''}>Lv ${index + 1}</option>`).join('');

  icon.addEventListener('click', () => {
    if (!view.hidden || !countClick(performance.now())) return;
    scrollBefore = window.scrollY;
    explorer.hidden = true;
    view.hidden = false;
    document.body.classList.add('simple-active');
    $('.skip-link').href = '#simple-ranked';
    $('.skip-link').textContent = 'Skip to fighting ranking';
    $('#chart-tooltip').hidden = true;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('#simple-heading').focus({ preventScroll: true });
  });
  $('#simple-back').addEventListener('click', () => {
    view.hidden = true;
    explorer.hidden = false;
    document.body.classList.remove('simple-active');
    $('.skip-link').href = '#explorer';
    $('.skip-link').textContent = 'Skip to building comparison';
    window.scrollTo({ top: scrollBefore, behavior: 'instant' });
    icon.focus({ preventScroll: true });
  });
  view.addEventListener('input', event => {
    if (event.target.id === 'simple-level-range') $('#simple-level-select').value = event.target.value;
    if (event.target.matches('input')) render();
  });
  $('#simple-level-select').addEventListener('change', render);
})();
