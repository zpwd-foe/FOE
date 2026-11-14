/* One bounded local record per GB; page loads never overwrite saved levels. */
(() => {
  'use strict';
  const prefix = 'gb-prestige-levels-v1:';

  function create(buildings, storage = () => window.localStorage) {
    const limits = new Map(buildings.map(building => [building.id, building.levels.length]));
    const states = new Map();
    const valid = (id, field, value) => limits.has(id) && Number.isInteger(value)
      && (field === 'from' ? value >= 0 && value < limits.get(id)
        : field === 'to' && value >= 1 && value <= limits.get(id));

    function get(building) {
      if (!states.has(building.id)) {
        let saved;
        try { saved = JSON.parse(storage().getItem(prefix + building.id)); } catch { /* Optional storage. */ }
        states.set(building.id, {
          from: valid(building.id, 'from', saved?.from) ? saved.from : 50,
          to: valid(building.id, 'to', saved?.to) ? saved.to : 150,
        });
      }
      return states.get(building.id);
    }

    function set(building, field, value) {
      if (!valid(building.id, field, value)) return false;
      const state = get(building);
      if (state[field] === value) return true;
      state[field] = value;
      try { storage().setItem(prefix + building.id, JSON.stringify(state)); } catch { /* Keep working in memory. */ }
      return true;
    }

    return { get, set };
  }

  window.PrestigeLevelState = { create };
})();
