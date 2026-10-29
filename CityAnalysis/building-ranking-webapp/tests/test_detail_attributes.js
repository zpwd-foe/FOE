const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
const data = require("../data/ranking-core.json");
const constants = data.constants;

function appFunctions(first, next) {
  const start = source.indexOf(`function ${first}(`);
  const end = source.indexOf(`function ${next}(`, start);
  assert.ok(start >= 0 && end > start, `Could not find ${first} through ${next}`);
  return source.slice(start, end);
}

function detailFor(attrs, estimates = {}, weights = {}) {
  const controls = {
    estimatedFpProduction: 30000,
    estimatedGoodsProduction: 20000,
    estimatedSpecialGoodsProduction: 120,
    estimatedGuildGoodsProduction: 20000,
    estimatedMedalProduction: 10000,
    ...estimates,
  };
  const effectiveWeights = {
    [constants.prodFpAttr]: 5,
    [constants.prodGoodsAttr]: 3,
    [constants.prodGuildGoodsAttr]: 2,
    [constants.prodMedalsAttr]: 1,
    ...weights,
  };
  const context = vm.createContext({
    DATA: data,
    state: { profile: "overall" },
    PROFILE_CONFIG: { overall: { weightProfile: "overall" } },
    controls: () => controls,
    customizedWeightMap: () => effectiveWeights,
    attrInfo: (key) => data.attrs[key] || {},
    attrLabel: (key) => data.attrs[key]?.label || key,
    kitFamilyForAttr: () => null,
    sortAttributeRows: (rows) => rows,
    orderAttributeRows: (rows) => rows,
  });
  // Exercise the detail builder with the application's actual production and scoring functions.
  vm.runInContext([
    appFunctions("rawAttr", "focusLeft"),
    appFunctions("scoreRecord", "strengthBadges"),
    appFunctions("attributeRowsFor", "detailText"),
    appFunctions("fmtCompact", "escapeHtml"),
    appFunctions("isPercentageAttribute", "sortAttributeRows"),
    appFunctions("formatAttributeValue", "detailSortMarker"),
  ].join("\n"), context);
  const record = { attrs };
  const stats = context.computeStats([{ attrs: {} }, record], controls);
  const score = context.scoreRecord(record, stats, effectiveWeights, controls);
  return { rows: context.attributeRowsFor({ record, ...score }), formatValue: context.rawEffectiveValue, ...score };
}

test("goods boost alone exposes equivalent goods and its existing ranking contribution", () => {
  const { rows, contributions, score } = detailFor({ [constants.boostGoodsAttr]: 20 });
  const goods = rows.find((item) => item.key === constants.prodGoodsAttr);
  assert.ok(goods);
  assert.equal(goods.raw, 0);
  assert.equal(goods.effective, 4000);
  assert.equal(goods.weight, 3);
  assert.ok(goods.scorePoints > 0);
  assert.equal(goods.scorePoints, contributions.find((item) => item.key === goods.key).scorePoints);
  assert.equal(rows.reduce((sum, item) => sum + item.scorePoints, 0), score);
  assert.equal(rows.find((item) => item.key === constants.boostGoodsAttr).scorePoints, 0);
});

test("effective goods reflect the user's base goods estimate", () => {
  const { rows } = detailFor({ [constants.boostGoodsAttr]: 20 }, { estimatedGoodsProduction: 40000 });
  assert.equal(rows.find((item) => item.key === constants.prodGoodsAttr).effective, 8000);
});

test("direct goods and percentage equivalents appear once in a combined production row", () => {
  const { rows } = detailFor({ [constants.prodGoodsAttr]: 100, [constants.boostGoodsAttr]: 20 });
  const goods = rows.filter((item) => item.key === constants.prodGoodsAttr);
  assert.equal(goods.length, 1);
  assert.equal(goods[0].raw, 100);
  assert.equal(goods[0].effective, 4100);
});

test("percentage-only FP, special goods, guild goods, and medals show their equivalents", () => {
  const { rows } = detailFor({
    [constants.boostFpAttr]: 10,
    [constants.boostSpecialGoodsAttr]: 50,
    [constants.boostGuildGoodsAttr]: 10,
    [constants.boostMedalsAttr]: 10,
  });
  for (const [key, value] of [
    [constants.prodFpAttr, 3000],
    [constants.prodGoodsAttr, 60],
    [constants.prodGuildGoodsAttr, 2000],
    [constants.prodMedalsAttr, 1000],
  ]) {
    const item = rows.find((row) => row.key === key);
    assert.ok(item, key);
    assert.equal(item.effective, value);
    assert.ok(item.scorePoints > 0);
  }
});

test("zero base input does not create empty calculated production rows", () => {
  const { rows } = detailFor({ [constants.boostGoodsAttr]: 20 }, { estimatedGoodsProduction: 0 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, constants.boostGoodsAttr);
});

test("calculated goods remain visible when their ranking weight is zero", () => {
  const { rows } = detailFor({ [constants.boostGoodsAttr]: 20 }, {}, { [constants.prodGoodsAttr]: 0 });
  const goods = rows.find((item) => item.key === constants.prodGoodsAttr);
  assert.equal(goods.effective, 4000);
  assert.equal(goods.weight, 0);
  assert.equal(goods.scorePoints, 0);
});

test("calculated goods display whole numbers while scoring retains fractional precision", () => {
  for (const [estimate, effective, displayed] of [[20002, 4000.4, 4000], [20003, 4000.6, 4001]]) {
    const { rows, contributions, formatValue } = detailFor(
      { [constants.boostGoodsAttr]: 20 }, { estimatedGoodsProduction: estimate }
    );
    const goods = rows.find((item) => item.key === constants.prodGoodsAttr);
    assert.equal(goods.effective, effective);
    assert.equal(formatValue(goods), `0 (${displayed.toLocaleString()})`);
    assert.equal(contributions.find((item) => item.key === goods.key).value, effective);
  }
});

test("goods formatting preserves decimal precision for percentages and other production", () => {
  const { rows, formatValue } = detailFor({ [constants.boostGoodsAttr]: 20.25, [constants.prodFpAttr]: 12.25 });
  assert.equal(formatValue(rows.find((item) => item.key === constants.boostGoodsAttr)), `${(20.25).toLocaleString()}%`);
  assert.equal(formatValue(rows.find((item) => item.key === constants.prodFpAttr)), (12.25).toLocaleString());
});
