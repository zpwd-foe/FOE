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
  const storageKey = 'goe-gb-player-name';
  const number = new Intl.NumberFormat('en-US');
  const fp = value => `${number.format(value)} FP`;
  const buildings = [...data.buildings].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  select.replaceChildren(...buildings.map(building => new Option(building.name, building.id)));
  select.value = buildings.find(building => building.name === 'The Arc')?.id || buildings[0].id;
  let selectedBuilding, result, promotionText = '', saveTimer;

  try { player.value = localStorage.getItem(storageKey) || ''; }
  catch { $('#name-help').textContent = 'Local saving unavailable.'; }

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

  function saveName() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      if (player.value.trim()) localStorage.setItem(storageKey, player.value);
      else localStorage.removeItem(storageKey);
      $('#name-help').textContent = '';
    } catch { $('#name-help').textContent = 'Local saving unavailable.'; }
  }
  player.addEventListener('input', () => {
    renderMessage();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveName, 250);
  });
  player.addEventListener('change', saveName);
  window.addEventListener('pagehide', () => { if (saveTimer) saveName(); });
  select.addEventListener('change', render);
  level.addEventListener('input', render);
  $('#priming-form').addEventListener('submit', event => event.preventDefault());
  copy.addEventListener('click', async () => {
    const text = promotionText;
    if (!text) return;
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
})();
