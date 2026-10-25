/* Calculations shared by the explorer and shortlist. No missing-value filling. */
(() => {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const status = (row, level) => row.tier === 'Gold' && level < 101 ? 'locked'
    : finite(row.values[level - 1]) ? 'available' : 'missing';
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
  function difference(row, from, to) {
    if (from >= to) return { kind: 'invalid' };
    const end = status(row, to);
    if (end !== 'available') return { kind: end };
    const value = row.values[to - 1];
    if (from === 0 || status(row, from) === 'locked') return { kind: 'unlock', value };
    if (status(row, from) !== 'available') return { kind: 'missing-start', value };
    const start = row.values[from - 1];
    return { kind: 'change', start, value, delta: Math.round((value - start) * 1e8) / 1e8,
      charges: row.charges && finite(row.charges[from - 1]) && finite(row.charges[to - 1])
        ? row.charges[to - 1] - row.charges[from - 1] : null };
  }
  function expected(row, level, boost) {
    const value = row.values[level - 1], charges = row.charges?.[level - 1];
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
  window.PrestigeCore = { finite, status, clamp, rangeSum, upgrade, difference, expected, segments, matchesGoal, multiplierSteps };
})();
