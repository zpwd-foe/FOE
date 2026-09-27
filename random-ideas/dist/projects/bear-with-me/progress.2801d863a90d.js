((root) => {
  "use strict";
  const scenes = typeof module !== "undefined" && module.exports ? require("./scenes.15845e3eb853.js") : root.BearScenes;
  const ids = scenes.map(scene => scene.id), COUNT = ids.length;
  const retirement = ids.indexOf(50);
  const fresh = () => ({ version: 2, sceneIds: [...ids], counts: Array(COUNT).fill(0), last: -1, mode: "story", sound: false, motion: null, retired: false });
  function read(value) {
    const clean = fresh();
    if (!value || ![1, 2].includes(value.version)) return clean;
    // Version 1 stored the original 50 positions. Stable IDs keep discoveries
    // attached to the same performance when scenes are removed from the cast.
    const sourceIds = value.version === 1 ? Array.from({ length: 50 }, (_, i) => i + 1) : value.sceneIds;
    if (Array.isArray(sourceIds) && Array.isArray(value.counts)) {
      clean.counts = ids.map(id => {
        const count = value.counts[sourceIds.indexOf(id)];
        return Number.isSafeInteger(count) && count > 0 ? Math.min(count, 1000000) : 0;
      });
      if (Number.isInteger(value.last) && value.last >= 0 && value.last < sourceIds.length) {
        // If the last scene was removed, resume after its nearest predecessor.
        for (let i = value.last; i >= 0 && clean.last < 0; i--) clean.last = ids.indexOf(sourceIds[i]);
      }
    }
    clean.mode = value.mode === "shuffle" ? "shuffle" : "story";
    clean.sound = value.sound === true;
    clean.motion = typeof value.motion === "boolean" ? value.motion : null;
    clean.retired = value.retired === true && retirement >= 0 && clean.counts[retirement] > 0;
    return clean;
  }
  function choose(progress, random = Math.random) {
    if (progress.mode === "story") {
      const unseen = progress.counts.indexOf(0);
      return unseen >= 0 ? unseen : (progress.last + 1) % COUNT;
    }
    const eligible = progress.counts.map((count, i) => ({ count, i })).filter(item => item.i !== progress.last);
    const lowest = Math.min(...eligible.map(item => item.count));
    const pool = eligible.filter(item => item.count === lowest);
    return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))].i;
  }
  const api = { fresh, read, choose, count: COUNT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BearProgress = api;
})(typeof window !== "undefined" ? window : globalThis);
