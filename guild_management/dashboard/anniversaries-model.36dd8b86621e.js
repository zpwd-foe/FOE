(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GOE_ANNIVERSARIES = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const DAY = 86400000;
  function parts(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a date in YYYY-MM-DD format.");
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 2012 || date.toISOString().slice(0, 10) !== value) throw new Error("Enter a valid date from 2012 onward.");
    return { year, month, day, time: date.getTime() };
  }
  function todayInGuild(now = new Date()) {
    const entries = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const fields = Object.fromEntries(entries.map(item => [item.type, item.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  }
  function validateRoster(payload, today = todayInGuild()) {
    if (!payload || payload.schemaVersion !== 1 || payload.guildName !== "Guardians of Elysium" || payload.timeZone !== "America/New_York") throw new Error("Choose a version 1 Guardians of Elysium roster using America/New_York.");
    if (!Array.isArray(payload.members) || payload.members.length > 1000) throw new Error("A roster can contain at most 1,000 members.");
    parts(today);
    const ids = new Set(), playerIds = new Set();
    const members = payload.members.map(member => {
      if (!member || typeof member.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(member.id) || ids.has(member.id)) throw new Error("Every member needs a unique record ID.");
      if (typeof member.name !== "string" || !member.name.trim() || member.name.trim().length > 100) throw new Error("Member names must contain 1–100 characters.");
      const tagline = member.tagline === undefined ? "" : member.tagline;
      if (typeof tagline !== "string" || Array.from(tagline.trim()).length > 200) throw new Error("Guild taglines must be text of at most 200 characters.");
      const playerId = member.playerId ?? "";
      if (typeof playerId !== "string" || (playerId && (!/^[1-9][0-9]{0,19}$/.test(playerId) || playerIds.has(playerId)))) throw new Error("Player IDs must be unique positive integers, stored as text.");
      const joinedOn = member.joinedOn ?? null;
      if (joinedOn !== null) {
        parts(joinedOn);
        if (joinedOn > today) throw new Error("A join date cannot be in the future.");
      }
      if (!["current", "former"].includes(member.status)) throw new Error("Member status must be current or former.");
      ids.add(member.id);
      if (playerId) playerIds.add(playerId);
      return { id: member.id, name: member.name.trim(), playerId, joinedOn, status: member.status, ...(tagline.trim() ? { tagline: tagline.trim() } : {}) };
    });
    return { schemaVersion: 1, guildName: payload.guildName, timeZone: payload.timeZone, members };
  }
  function anniversaryInYear(joinedOn, year) {
    const { month, day } = parts(joinedOn);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
  }
  function anniversary(member, today = todayInGuild()) {
    if (!member.joinedOn || member.status !== "current") return null;
    const joined = parts(member.joinedOn), current = parts(today);
    let year = Math.max(current.year, joined.year + 1);
    let date = anniversaryInYear(member.joinedOn, year);
    if (date < today) date = anniversaryInYear(member.joinedOn, ++year);
    return { date, years: year - joined.year, days: Math.round((parts(date).time - current.time) / DAY) };
  }
  function completedYears(joinedOn, today = todayInGuild()) {
    if (!joinedOn) return null;
    const joined = parts(joinedOn), current = parts(today);
    return Math.max(0, current.year - joined.year - (anniversaryInYear(joinedOn, current.year) > today ? 1 : 0));
  }
  function upcoming(members, today = todayInGuild()) {
    return members.map(member => ({ member, next: anniversary(member, today) })).filter(item => item.next)
      .sort((a, b) => a.next.days - b.next.days || a.member.name.localeCompare(b.member.name));
  }
  return { todayInGuild, validateRoster, anniversaryInYear, anniversary, completedYears, upcoming };
});
