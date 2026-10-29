const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../site/assets/anniversaries-model.js");
const member = (joinedOn, status = "current") => ({ id: "test-1", name: "Test member", playerId: "", joinedOn, status });
const roster = members => ({ schemaVersion: 1, guildName: "Guardians of Elysium", timeZone: "America/New_York", members });

test("anniversary today is included and tomorrow remains one calendar day away", () => {
  assert.deepEqual(api.anniversary(member("2024-10-28"), "2026-10-28"), { date: "2026-10-28", years: 2, days: 0 });
  assert.equal(api.anniversary(member("2024-10-29"), "2026-10-28").days, 1);
});
test("new members wait a full year and dates wrap into the next year", () => {
  assert.deepEqual(api.anniversary(member("2026-10-28"), "2026-10-28"), { date: "2027-10-28", years: 1, days: 365 });
  assert.equal(api.anniversary(member("2024-01-01"), "2026-12-31").days, 1);
  assert.equal(api.completedYears("2024-10-29", "2026-10-28"), 1);
});
test("leap-day anniversaries fall on February 28 only in non-leap years", () => {
  assert.deepEqual(api.anniversary(member("2024-02-29"), "2025-02-28"), { date: "2025-02-28", years: 1, days: 0 });
  assert.equal(api.anniversary(member("2024-02-29"), "2028-02-28").date, "2028-02-29");
  assert.equal(api.completedYears("2024-02-29", "2025-02-28"), 1);
});
test("unknown dates and former members do not generate celebrations", () => {
  assert.equal(api.anniversary(member(null), "2026-10-28"), null);
  assert.equal(api.anniversary(member("2024-10-28", "former"), "2026-10-28"), null);
  assert.deepEqual(api.upcoming([member(null), member("2024-10-28", "former")], "2026-10-28"), []);
});
test("calendar uses Eastern dates across UTC midnight and daylight-saving changes", () => {
  assert.equal(api.todayInGuild(new Date("2026-10-29T02:00:00Z")), "2026-10-28");
  assert.equal(api.todayInGuild(new Date("2026-01-02T04:59:00Z")), "2026-01-01");
  assert.equal(api.anniversary(member("2024-03-09"), "2025-03-08").days, 1);
});
test("invalid and future dates are rejected, unknown dates remain null", () => {
  for (const date of ["2025-02-29", "2024-13-01", "2027-01-01", "01/01/2020", ""]) {
    assert.throws(() => api.validateRoster(roster([member(date)]), "2026-10-28"));
  }
  assert.equal(api.validateRoster(roster([member(null)]), "2026-10-28").members[0].joinedOn, null);
});
test("record identity and player IDs stay unique when renaming members", () => {
  assert.throws(() => api.validateRoster(roster([member(null), member(null)]), "2026-10-28"));
  assert.throws(() => api.validateRoster(roster([{ ...member(null), playerId: "123" }, { ...member(null), id: "other", playerId: "123" }]), "2026-10-28"));
  const clean = api.validateRoster(roster([{ ...member("2024-01-01"), name: "  New name  ", notes: "not public" }]), "2026-10-28");
  assert.equal(clean.members[0].id, "test-1");
  assert.equal(clean.members[0].name, "New name");
  assert.ok(!("notes" in clean.members[0]));
});
