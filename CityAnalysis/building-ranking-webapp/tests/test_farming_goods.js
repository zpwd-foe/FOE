const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { dashboard } = require("./helpers/dashboard.js");
const preferences = require("../src/preferences.js");

const goods = "prod_resource_goods_total";
const previous = "prod_resource_all_goods_of_previous_age";
const current = "prod_resource_all_goods_of_age";
const next = "prod_resource_all_goods_of_next_age";
const neutral = { previous: 1, current: 1, next: 1 };

function farming(options) {
  const view = dashboard(options);
  view.app.setActiveProfile("farming");
  view.element("weightModeSelect").value = "custom";
  return view;
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

test("age multipliers adjust one Goods Total score, not three extra weights", () => {
  const { app, state } = farming();
  state.goodsAgeMultipliers = { previous: 0.5, current: 1, next: 2 };
  const record = { attrs: { [goods]: 300, [previous]: 100, [current]: 100, [next]: 100 } };
  const original = JSON.stringify(record);
  const controls = app.controls();
  const weights = app.customizedWeightMap("farming", controls);
  const stats = app.computeStats([{ attrs: {} }, record], controls);
  const result = app.scoreRecord(record, stats, weights, controls);
  assert.equal(app.effectiveAttrValue(record, goods, controls), 300);
  assert.equal(app.scoringAttrValue(record, goods, controls), 350);
  assert.equal(result.totalWeight, 60);
  assert.equal(result.contributions.length, 1);
  assert.equal(result.contributions[0].key, goods);
  assert.equal(result.contributions[0].weight, 20);
  assert.equal(result.contributions[0].value, 350);
  for (const key of [previous, current, next]) assert.equal(weights[key], 0);
  assert.equal(JSON.stringify(record), original);

  // Even a stale or hand-edited age weight cannot add another scoring contribution.
  state.customWeights.farming[previous] = 1000;
  assert.equal(app.customizedWeightMap("farming", controls)[previous], 0);
  state.customWeights.farming[goods] = 0;
  assert.equal(app.scoreRecord(record, stats, app.customizedWeightMap("farming", controls), controls).score, 0);
});

test("unclassified goods and both kinds of boost equivalents remain included exactly once", () => {
  const { app, state, data } = farming();
  const record = { attrs: {
    [goods]: 350, [previous]: 100, [current]: 100, [next]: 100,
    [data.constants.boostGoodsAttr]: 10,
    [data.constants.boostSpecialGoodsAttr]: 50,
  } };
  state.goodsAgeMultipliers = { previous: 0, current: 0, next: 0 };
  const c = app.controls();
  assert.equal(app.scoringAttrValue(record, goods, c), 50 + 2000 + 60);
  assert.equal(app.effectiveAttrValue(record, goods, c), 350 + 2000 + 60);
  const boostOnly = { attrs: { [data.constants.boostGoodsAttr]: 10 } };
  assert.equal(app.scoringAttrValue(boostOnly, goods, c), 2000);
});

test("neutral multipliers preserve exported production values across every age and both datasets", () => {
  const { app, data } = farming();
  const c = app.controls();
  for (const directory of ["ages", "city-ages"]) {
    for (const age of data.ages) {
      const payload = JSON.parse(fs.readFileSync(path.join(__dirname, "../data", directory, `${age.key}.json`)));
      for (const record of payload.records) {
        assert.equal(app.scoringAttrValue(record, goods, c), app.effectiveAttrValue(record, goods, c), `${age.key}: ${record.name}`);
      }
    }
  }
});

test("equal weighted goods share one normalization scale across age categories", () => {
  const { app, state } = farming();
  state.goodsAgeMultipliers = { previous: 0.5, current: 1, next: 2 };
  const records = [
    { attrs: { [goods]: 200, [previous]: 200 } },
    { attrs: { [goods]: 100, [current]: 100 } },
    { attrs: { [goods]: 50, [next]: 50 } },
  ];
  const c = app.controls();
  const stats = app.computeStats([{ attrs: {} }, ...records], c);
  const weights = app.customizedWeightMap("farming", c);
  const scores = records.map((record) => app.scoreRecord(record, stats, weights, c).score);
  assert.ok(scores[0] > 0);
  assert.equal(scores[0], scores[1]);
  assert.equal(scores[1], scores[2]);
});

test("Total and Efficiency share multipliers; Default and other profiles ignore them", () => {
  const { app, state, element } = farming();
  const record = { attrs: { [goods]: 100, [next]: 100 } };
  state.goodsAgeMultipliers.next = 2;
  assert.equal(app.scoringAttrValue(record, goods, app.controls()), 200);
  app.setActiveProfile("farmingEfficiency");
  assert.equal(app.scoringAttrValue(record, goods, app.controls()), 200);
  element("weightModeSelect").value = "default";
  assert.equal(app.scoringAttrValue(record, goods, app.controls()), 100);
  element("weightModeSelect").value = "custom";
  for (const profile of ["overall", "fighting", "qi", "kit"]) {
    app.setActiveProfile(profile);
    element("weightModeSelect").value = "custom";
    assert.equal(app.scoringAttrValue(record, goods, app.controls()), 100, profile);
  }
  app.setActiveProfile("farming");
  assert.equal(app.scoringAttrValue(record, goods, app.controls()), 200);
});

test("building details preserve real production and label the adjusted scoring value", () => {
  const { app, state } = farming();
  state.goodsAgeMultipliers = { previous: 0.5, current: 1, next: 2 };
  const record = { attrs: { [goods]: 300, [previous]: 100, [current]: 100, [next]: 100 } };
  const c = app.controls();
  const score = app.scoreRecord(record, app.computeStats([{ attrs: {} }, record], c), app.customizedWeightMap("farming", c), c);
  const rows = app.attributeRowsFor({ record, ...score });
  const total = rows.find((row) => row.key === goods);
  assert.equal(total.raw, 300);
  assert.equal(total.effective, 300);
  assert.equal(total.scoringValue, 350);
  assert.equal(app.rawEffectiveValue(total), "300<small>Weighted for scoring: 350</small>");
  assert.equal(rows.reduce((sum, row) => sum + row.scorePoints, 0), score.score);
  for (const key of [previous, current, next]) assert.equal(rows.find((row) => row.key === key).scorePoints, 0);
});

test("saved preferences and share links preserve decimals and zero multipliers, including inactive Farming", () => {
  for (const inactive of [false, true]) {
    const sender = farming();
    sender.state.goodsAgeMultipliers = { previous: 0, current: 0.5, next: 2.75 };
    if (inactive) sender.app.setActiveProfile("overall");
    const storedPreferences = plain(sender.app.sanitizedPreferences(sender.app.preferenceSnapshot()));
    const search = `?${sender.app.buildUrlParams()}`;
    for (const options of [{ storedPreferences }, { search }]) {
      const receiver = dashboard({ initialize: true, ...options });
      receiver.app.setActiveProfile("farmingEfficiency");
      assert.deepEqual(plain(receiver.state.goodsAgeMultipliers), { previous: 0, current: 0.5, next: 2.75 });
      assert.equal(receiver.element("weightModeSelect").value, "custom");
    }
  }
});

test("Set all to 0 clears Farming multipliers and preserves zeros through sharing and profile switches", () => {
  for (const profile of ["farming", "farmingEfficiency"]) {
    const view = farming({ initialize: true });
    view.app.setActiveProfile(profile);
    view.state.goodsAgeMultipliers = { previous: 0.5, current: 1, next: 2 };
    view.element("clearWeightsButton").listeners.click();
    const zeros = { previous: 0, current: 0, next: 0 };
    assert.deepEqual(plain(view.state.goodsAgeMultipliers), zeros);
    assert.ok(Object.values(view.state.customWeights.farming).every((weight) => weight === 0));
    assert.equal(view.element("weightModeSelect").value, "custom");
    view.app.savePreferences();
    const stored = JSON.parse(view.storage.getItem(preferences.STORAGE_KEY)).values;
    assert.deepEqual(stored.profileSettings.farming.goodsAgeMultipliers, zeros);
    const receiver = dashboard({ initialize: true, search: `?${view.app.buildUrlParams()}` });
    assert.deepEqual(plain(receiver.state.goodsAgeMultipliers), zeros);
    view.app.setActiveProfile("overall");
    view.element("clearWeightsButton").listeners.click();
    view.app.setActiveProfile(profile);
    assert.deepEqual(plain(view.state.goodsAgeMultipliers), zeros);
    view.element("resetWeightsButton").listeners.click();
    assert.deepEqual(plain(view.state.goodsAgeMultipliers), neutral);
  }
});

test("legacy full links and reset controls restore neutral multipliers", () => {
  for (const reset of [
    (view) => { view.app.window.location.search = "?profile=farming&mode=custom"; view.app.applyUrlState(); },
    (view) => { view.app.window.location.search = "?profile=overall&mode=custom"; view.app.applyUrlState(); view.app.setActiveProfile("farming"); },
    (view) => view.app.resetDefaults(),
    (view) => view.element("resetWeightsButton").listeners.click(),
  ]) {
    const view = farming({ initialize: true });
    view.state.goodsAgeMultipliers = { previous: 0, current: 0.5, next: 2 };
    view.app.rememberProfileSettings();
    reset(view);
    assert.deepEqual(plain(view.state.goodsAgeMultipliers), neutral);
  }
});

test("sanitization preserves zero and decimals and rejects invalid multipliers", () => {
  assert.deepEqual(preferences.sanitizeGoodsAgeMultipliers({ previous: 0, current: 0.5, next: 2 }), { previous: 0, current: 0.5, next: 2 });
  for (const invalid of [-1, Infinity, NaN, "2", null, {}, []]) {
    assert.deepEqual(preferences.sanitizeGoodsAgeMultipliers({ previous: invalid, current: invalid, next: invalid }), neutral);
  }
  const { app } = farming();
  const result = plain(app.sanitizedPreferences({ profileSettings: {
    farming: { goodsAgeMultipliers: { previous: 0, current: "2", next: 3, unknown: 50 } },
    overall: { goodsAgeMultipliers: { previous: 50 } },
  } }));
  assert.deepEqual(result.profileSettings.farming.goodsAgeMultipliers, { previous: 0, current: 1, next: 3 });
  assert.equal(result.profileSettings.overall.goodsAgeMultipliers, undefined);
});

test("saved and shared goods age multipliers are capped at 10", () => {
  const expected = { previous: 10, current: 10, next: 10 };
  assert.deepEqual(preferences.sanitizeGoodsAgeMultipliers({ previous: 10, current: 10.1, next: 1000 }), expected);
  const sender = farming();
  sender.state.goodsAgeMultipliers = { previous: 11, current: 50, next: 1000 };
  const storedPreferences = plain(sender.app.preferenceSnapshot());
  const search = `?${sender.app.buildUrlParams()}`;
  for (const options of [{ storedPreferences }, { search }]) {
    const receiver = dashboard({ initialize: true, ...options });
    assert.deepEqual(plain(receiver.state.goodsAgeMultipliers), expected);
  }
});
