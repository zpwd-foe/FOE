/* Independent-building estimates: count each listed combat effect once. */
(() => {
  'use strict';
  const statCounts = { attack_boost: [1, 0], defender_attack_boost: [1, 0], defense_boost: [0, 1],
    attacker_defense_boost: [0, 1], military_boost: [1, 1], fierce_resistance: [1, 1], advanced_tactics: [1, 1] };

  function effect(info) {
    const scope = info.scope.split(' · ')[0];
    const mode = { 'All modes': 'regular', GBG: 'gbg', GE: 'ge' }[scope];
    const attackStats = info.bonus_types.reduce((sum, type) => sum + (statCounts[type]?.[0] || 0), 0);
    const defenseStats = info.bonus_types.reduce((sum, type) => sum + (statCounts[type]?.[1] || 0), 0);
    const army = info.scope.split(' · ')[1];
    const armies = army === 'both armies' ? ['red', 'blue'] : army === 'attacking army' ? ['red'] : army === 'defending army' ? ['blue'] : [];
    const stats = (attackStats + defenseStats) * armies.length;
    return mode && stats ? { mode, stats, attackStats, defenseStats, armies } : null;
  }

  function rank(buildings, boosts, target, bases, priorities = {}) {
    const { ge = 0.25, attack = 0.75, red = 0.5 } = priorities;
    if (!Number.isInteger(target) || target < 1 || target > 300
      || ['regular', 'gbg', 'ge'].some(mode => !Number.isFinite(bases[mode]) || bases[mode] < 0)
      || [ge, attack, red].some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      return null;
    }
    const weights = { regular: 1, gbg: 1 - ge, ge,
      attack: 2 * attack, defense: 2 * (1 - attack), red: 2 * red, blue: 2 * (1 - red) };
    return buildings.flatMap(building => {
      const level = building.gold ? target : Math.min(target, 200);
      const parts = building.rows.flatMap(row => {
        const info = boosts[row.boost], combat = effect(info);
        if (!combat) return [];
        const observation = window.PrestigeCore.sample(row, level);
        const locked = observation.kind === 'locked', retained = observation.kind === 'retained';
        const value = locked ? 0 : observation.value;
        const missing = !window.PrestigeCore.finite(value);
        const armyWeight = combat.armies.reduce((sum, army) => sum + weights[army], 0);
        const weightedStats = (combat.attackStats * weights.attack + combat.defenseStats * weights.defense) * armyWeight;
        const modeWeight = weights[combat.mode], active = weightedStats > 0 && modeWeight > 0;
        const gain = !active ? 0 : missing ? null
          : value * weightedStats * modeWeight * (info.multiplier ? bases[combat.mode] / 100 : 1);
        return [{ row, info, ...combat, locked, retained, sourceLevel: observation.sourceLevel,
          missing, value, weightedStats, armyWeight, modeWeight, active, gain }];
      });
      if (!parts.length) return [];
      const modes = Object.fromEntries(['regular', 'gbg', 'ge'].map(mode => {
        const relevant = parts.filter(part => part.mode === mode);
        return [mode, relevant.some(part => part.active && part.missing) ? null : relevant.reduce((sum, part) => sum + part.gain, 0)];
      }));
      const complete = parts.every(part => !part.active || !part.missing);
      const total = complete ? Object.values(modes).reduce((sum, value) => sum + value, 0) : null;
      return [{ building, level, parts, modes, weights, complete, retained: parts.some(part => part.active && part.retained), total,
        perTile: complete ? total / building.footprint.tiles : null }];
    }).sort((a, b) => Number(b.complete) - Number(a.complete)
      || (b.perTile ?? 0) - (a.perTile ?? 0) || a.building.name.localeCompare(b.building.name));
  }

  function rapidClicks(required = 7, windowMs = 3000) {
    let times = [];
    return time => {
      times = times.filter(previous => time - previous <= windowMs);
      times.push(time);
      if (times.length < required) return false;
      times = [];
      return true;
    };
  }

  window.PrestigeCombat = { effect, rank, rapidClicks };
})();
