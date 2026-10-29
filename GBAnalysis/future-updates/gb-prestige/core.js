/* Shared calculations. Trailing boost retention never changes raw source values. */
(() => {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function lastKnown(values = []) {
    for (let index = values.length - 1; index >= 0; index--) {
      if (finite(values[index])) return { value: values[index], level: index + 1 };
    }
    return null;
  }
  function sample(row, level, field = 'values') {
    if (row.tier === 'Gold' && level < 101) return { kind: 'locked', value: null, sourceLevel: null };
    const values = row[field] || [], value = values[level - 1];
    if (finite(value)) return { kind: 'available', value, sourceLevel: level };
    const last = lastKnown(values);
    if (last && level > last.level) return { kind: 'retained', value: last.value, sourceLevel: last.level };
    return { kind: 'missing', value: null, sourceLevel: null };
  }
  const status = (row, level) => sample(row, level).kind;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
  function rangeSum(building, field, from, to) {
    if (from >= to) return null;
    const resource = field >= 3 && field <= 6;
    const firstProvided = resource ? building.levelData.findIndex(row => finite(row[field])) : -1;
    const pendingStart = building.pendingUnlockCosts?.fields.includes(field)
      ? building.pendingUnlockCosts.fromLevel : null;
    // Some unlock resources start in Copper levels, including SHS goods at 11.
    // Once required, a missing cell must still make the total unavailable.
    const unlockStart = Math.min(firstProvided < 0 ? 101 : Math.min(101, firstProvided + 1), pendingStart ?? Infinity);
    let total = 0;
    for (let level = from + 1; level <= to; level++) {
      if (resource && (level < unlockStart || (!building.gold && firstProvided < 0 && pendingStart === null))) continue;
      const value = building.levelData[level - 1]?.[field];
      if (!finite(value)) return null;
      total += value;
    }
    return total;
  }
  function upgrade(building, from, to) {
    return { valid: from < to, fp: rangeSum(building, 0, from, to),
      copperSets: rangeSum(building, 2, from, to), goldSets: rangeSum(building, 3, from, to),
      coinsSupplies: rangeSum(building, 4, from, to), medals: rangeSum(building, 5, from, to),
      goodsEach: rangeSum(building, 6, from, to), previousFP: rangeSum(building, 14, from, to) };
  }
  function levelFunding(building, level) {
    const gold = building.gold && level >= 101;
    const multiplier = gold ? 1 : 1.9, positions = gold ? 7 : 5;
    const record = Number.isInteger(level) && level > 0 ? building.levelData[level - 1] : null;
    const total = finite(record?.[0]) && record[0] >= 0 ? record[0] : null;
    // Round each donor's amount separately, including exact half-FP cases.
    const contributions = Array.from({ length: positions }, (_, position) => {
      const reward = record?.[7 + position];
      return finite(reward) && reward >= 0 ? Math.round(reward * multiplier + 1e-6) : null;
    });
    const contributionTotal = contributions.every(finite)
      ? contributions.reduce((sum, value) => sum + value, 0) : null;
    const priming = finite(total) && finite(contributionTotal) ? Math.max(0, total - contributionTotal) : null;
    return { level, total, priming, contributions, contributionTotal, multiplier, positions };
  }
  function difference(row, from, to) {
    if (from >= to) return { kind: 'invalid' };
    const end = sample(row, to), beginning = sample(row, from);
    if (!finite(end.value)) return { kind: end.kind };
    const chargeFrom = sample(row, from, 'charges'), chargeTo = sample(row, to, 'charges');
    const retainedLevels = [...new Set([end, ...(from ? [beginning, chargeFrom] : []), chargeTo]
      .filter(observation => observation.kind === 'retained').map(observation => observation.sourceLevel))];
    const value = end.value;
    if (from === 0 || beginning.kind === 'locked') return { kind: 'unlock', value, retainedLevels };
    if (!finite(beginning.value)) return { kind: 'missing-start', value, retainedLevels };
    const start = beginning.value;
    return { kind: 'change', start, value, retainedLevels, delta: Math.round((value - start) * 1e8) / 1e8,
      charges: row.charges && finite(chargeFrom.value) && finite(chargeTo.value)
        ? chargeTo.value - chargeFrom.value : null };
  }
  function expected(row, level, boost) {
    const value = sample(row, level).value, charges = sample(row, level, 'charges').value;
    return boost.mechanic === 'Chance' && finite(value) && finite(charges) ? value / 100 * charges : null;
  }
  function segments(values) {
    const result = []; let current = [];
    values.forEach((value, index) => {
      if (finite(value)) current.push([index + 1, value]);
      else if (current.length) { result.push(current); current = []; }
    });
    if (current.length) result.push(current);
    return result;
  }
  function matchesGoal(building, goal, boosts) {
    return goal === 'All goals' || (goal === 'Multiplicative'
      ? building.rows.some(row => boosts[row.boost].multiplier)
      : building.tags.includes(goal));
  }
  function multiplierSteps(row) {
    const start = row.tier === 'Gold' ? 101 : 1;
    return row.values.flatMap((value, index) => {
      const level = index + 1;
      if (level < start || !finite(value)) return [];
      if (level === start) return [{ level, value, kind: start === 101 ? 'unlock' : 'start' }];
      // Only adjacent observations establish the exact level of an increase.
      return finite(row.values[index - 1]) && value > row.values[index - 1]
        ? [{ level, value, kind: 'increase' }] : [];
    });
  }
  window.PrestigeCore = { finite, lastKnown, sample, status, clamp, rangeSum, upgrade, levelFunding, difference, expected, segments, matchesGoal, multiplierSteps };
})();
