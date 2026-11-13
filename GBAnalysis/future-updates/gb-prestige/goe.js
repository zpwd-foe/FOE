(() => {
  'use strict';
  const data = window.GB_PRESTIGE_DATA, core = window.GOEPriming;
  const elements = new Map();
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, document.querySelector(selector));
    return elements.get(selector);
  };
  const player = $('#player-name'), select = $('#building'), level = $('#target-level');
  const message = $('#promotion-message'), copy = $('#copy-message');
  const legacyNameKey = 'goe-gb-player-name';
  const selectionKey = 'goe-gb-selection';
  const number = new Intl.NumberFormat('en-US');
  const fp = value => `${number.format(value)} FP`;
  const buildings = [...data.buildings].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  select.replaceChildren(...buildings.map(building => new Option(building.name, building.id)));
  select.value = buildings.find(building => building.name === 'The Arc')?.id || buildings[0].id;
  let selectedBuilding, result, promotionText = '';

  // Preserve names saved by the original tool until a complete setup is saved.
  try { player.value = (localStorage.getItem(legacyNameKey) || '').slice(0, 100); }
  catch { $('#name-help').textContent = 'Local saving unavailable.'; }

  function readSelection(storageName, allowDraft = false) {
    try {
      const saved = JSON.parse(window[storageName].getItem(selectionKey));
      const building = buildings.find(item => item.id === saved?.buildingId);
      if (!building || (saved.playerName !== undefined
        && (typeof saved.playerName !== 'string' || saved.playerName.length > 100))
        || typeof saved.level !== 'string'
        || (saved.level !== '' && (!/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(saved.level)
          || !Number.isFinite(Number(saved.level))))) return null;
      if (!allowDraft && (!(saved.playerName ?? player.value).trim()
        || core.calculate(building, Number(saved.level), data.boosts).status !== 'ready')) return null;
      return saved;
    } catch { return null; }
  }

  function saveSelection(completed = false) {
    const saved = JSON.stringify({ playerName: player.value, buildingId: select.value, level: level.value });
    // Drafts belong to this tab; only completed, valid selections seed new tabs.
    try { sessionStorage.setItem(selectionKey, saved); } catch { /* Storage may be disabled. */ }
    if (completed && player.value.trim() && player.value.length <= 100 && result.status === 'ready') {
      try {
        localStorage.setItem(selectionKey, saved);
        localStorage.removeItem(legacyNameKey);
        $('#name-help').textContent = '';
      } catch { $('#name-help').textContent = 'Local saving unavailable.'; }
    }
  }

  const lastSelection = readSelection('localStorage');
  const savedSelection = readSelection('sessionStorage', true) || lastSelection;
  if (savedSelection) {
    player.value = savedSelection.playerName ?? lastSelection?.playerName ?? player.value;
    select.value = savedSelection.buildingId;
    level.value = savedSelection.level;
  }

  function renderMessage() {
    promotionText = core.promotion(player.value, selectedBuilding, result);
    message.textContent = promotionText || (result.status === 'ready' ? 'Enter your name to generate a message.' : '—');
    message.toggleAttribute('data-empty', !promotionText);
    copy.disabled = !promotionText;
    $('#copy-status').textContent = '';
  }

  function render() {
    const building = selectedBuilding = buildings.find(item => item.id === select.value);
    level.max = building.levelData.length;
    result = core.calculate(building, level.valueAsNumber, data.boosts);
    const ready = result.status === 'ready';
    const errors = {
      'invalid-level': `Enter a whole level from 1 to ${level.max}.`,
      'missing-data': 'FP cost unavailable for this level.',
      'overfunded': 'Contributions leave too little FP to flip. Posting unavailable.',
    };
    level.setAttribute('aria-invalid', String(result.status === 'invalid-level'));
    $('#input-error').hidden = ready;
    $('#input-error').textContent = errors[result.status] || '';
    $('#result-content').hidden = !ready;
    $('#result-empty').hidden = ready;
    $('#cost-breakdown').hidden = !ready;
    $('#rate-label').textContent = ready ? `${result.guildGoods ? 'Treasury · ' : ''}${result.tier} · ${result.rate.toFixed(1)}×` : '';
    const thread = core.postingThread(result);
    $('#post-destination').hidden = !thread;
    $('#thread-name').textContent = thread?.name || '';
    $('#thread-location').textContent = thread?.location || '';
    if (ready) {
      $('#priming-cost').textContent = number.format(result.priming);
      $('#level-cost').textContent = fp(result.total);
      $('#contribution-total').textContent = fp(result.contributionTotal);
      $('#final-flip').textContent = fp(result.finalFP);
      $('#final-flip-total').textContent = fp(result.finalFP);
    }
    renderMessage();
  }

  player.addEventListener('input', () => {
    renderMessage();
    saveSelection();
  });
  player.addEventListener('change', () => saveSelection(true));
  select.addEventListener('change', () => { render(); saveSelection(true); });
  level.addEventListener('input', () => { render(); saveSelection(); });
  level.addEventListener('change', () => saveSelection(true));
  $('#priming-form').addEventListener('submit', event => {
    event.preventDefault();
    saveSelection(true);
  });
  copy.addEventListener('click', async () => {
    const text = promotionText;
    if (!text) return;
    saveSelection(true);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; }
    catch {
      // Support HTTP hosts or browsers that deny the Clipboard API.
      if (promotionText !== text) return;
      message.focus();
      const selection = window.getSelection(), range = document.createRange();
      range.selectNodeContents(message);
      selection.removeAllRanges();
      selection.addRange(range);
      try { copied = document.execCommand('copy'); } catch { /* Leave the message selected for manual copy. */ }
    }
    if (promotionText !== text) return;
    if (copied) {
      $('#copy-status').textContent = 'Copied.';
    } else {
      $('#copy-status').textContent = 'Copy blocked. Select the message and use your device’s Copy command.';
    }
  });
  render();
  // Pin even the initial/default selection so another tab cannot change it on refresh.
  saveSelection();
})();
