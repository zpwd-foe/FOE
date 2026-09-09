import test from "node:test";
import assert from "node:assert/strict";
import { buildRageAnalysis, buildRageCsv } from "../src/core.js";

const arcLevels = [180, 180, 180, 80, 80];
const arcBonuses = [100, 100, 100, 90, 90];

function fixture(count = 2) {
  const source = Array.from({ length: count }, (_, index) => ({
    targetLevel: index + 1,
    cost: 1000 + index * 100,
    unlockCosts: { goods: {}, resources: {} },
    rewards: { forgePoints: { base: [100, 50, 25, 10, 5] } },
    benefits: [{ key: "contribution_boost", value: 10 + index / 2 }],
  }));
  return {
    building: { name: "The Arc", benefits: [{ key: "contribution_boost" }] },
    era: "The Future",
    analysis: buildRageAnalysis(source, 1, count, arcBonuses),
    arcLevels,
    arcBonuses,
  };
}

// Parse the exported CSV independently, including quoted commas and line breaks.
function parseCsv(csv) {
  const records = [];
  let record = [], field = "", quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\r" || char === "\n")) {
      record.push(field);
      field = "";
      if (char !== ",") {
        records.push(record);
        record = [];
        if (char === "\r" && csv[index + 1] === "\n") index += 1;
      }
    } else field += char;
  }
  assert.equal(quoted, false);
  return records;
}

function ledger(options) {
  const records = parseCsv(buildRageCsv(options));
  const index = records.findIndex((record) => record[0] === "Level");
  return { records, header: records[index], rows: records.slice(index + 1, -1), total: records.at(-1) };
}

test("CSV stores settings once and keeps one complete row per level plus a total", () => {
  const options = fixture(301);
  const { records, header, rows, total } = ledger(options);
  assert.equal(records.flat().filter((value) => value === "The Arc").length, 1);
  assert.deepEqual(records.find((row) => row[0] === "Arc level").slice(1, 6), ["180+", "180+", "180+", "80", "80"]);
  assert.deepEqual(records.find((row) => row[0] === "Arc bonus (%)").slice(1, 6), arcBonuses.map(String));
  assert.deepEqual(records.find((row) => row[0] === "Levels to fund (inclusive)").slice(1, 3), ["1", "301"]);
  assert.equal(rows.length, 301);
  assert.equal(new Set(rows.map((row) => row[0])).size, 301);
  assert.ok(records.every((row) => row.length === header.length));
  assert.equal(header.length, 9); // Level, benefit, owner, five positions, total FP.
  assert.ok(!header.some((label) => /unlock|arc_level|arc_bonus/i.test(label)));
  const ownerIndex = header.indexOf("Owner's FP cost");
  const benefitIndex = header.indexOf("Benefit: GB contribution boost (%)");
  assert.equal(rows[1][benefitIndex], "10.5");
  assert.equal(total[benefitIndex], "");
  assert.equal(total[0], "Plan total");
  rows.forEach((row, index) => {
    assert.equal(Number(row[ownerIndex]), options.analysis.rows[index].ownerForgePoints);
    for (let position = 0; position < 5; position += 1) {
      assert.equal(Number(row[header.indexOf(`P${position + 1} contribution (FP)`)]), options.analysis.rows[index].contributions[position]);
    }
  });
  for (const label of ["Owner's FP cost", "Total FP cost", ...arcLevels.map((_, index) => `P${index + 1} contribution (FP)`)]) {
    const index = header.indexOf(label);
    assert.equal(Number(total[index]), rows.reduce((sum, row) => sum + Number(row[index]), 0));
  }
});

test("CSV retains nonzero unlock costs and special resources without summing benefits", () => {
  const options = fixture();
  Object.assign(options.analysis.rows[1], { goodsPerType: 20, goods: 100, money: 500, specialResources: { dark_matter: 50, unused: 0 } });
  Object.assign(options.analysis.totals, { goodsPerType: 20, goods: 100, money: 500, specialResources: { dark_matter: 50, unused: 0 } });
  const { header, rows, total } = ledger(options);
  for (const [label, amount] of [["Unlock goods per type", 20], ["Unlock goods total", 100], ["Unlock coins", 500], ["Unlock dark matter", 50]]) {
    const index = header.indexOf(label);
    assert.ok(index > 0);
    assert.equal(rows[0][index], "0");
    assert.equal(rows[1][index], String(amount));
    assert.equal(total[index], String(amount));
  }
  assert.ok(!header.includes("Unlock supplies"));
  assert.ok(!header.includes("Unlock medals"));
  assert.ok(!header.includes("Unlock unused"));
});

test("CSV preserves unavailable values and escapes names and coverage notes", () => {
  const options = fixture(1);
  options.building.name = 'Building, "special"\r\nname';
  options.coverageNote = 'Some rewards are estimates, not confirmed.\rCheck "coverage".';
  options.analysis.rows[0].contributions[0] = null;
  options.analysis.rows[0].benefits = [];
  const { records, header, rows } = ledger(options);
  assert.equal(records[0][1], options.building.name);
  assert.equal(records.find((row) => row[0] === "Reward data")[1], options.coverageNote);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][header.indexOf("P1 contribution (FP)")], "");
  assert.equal(rows[0][header.indexOf("Benefit: GB contribution boost (%)")], "");
});
