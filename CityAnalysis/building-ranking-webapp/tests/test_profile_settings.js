const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../data/ranking-core.json");
const { dashboard } = require("./helpers/dashboard.js");

function snapshot(app) {
  return JSON.parse(JSON.stringify(app.sanitizedPreferences(app.preferenceSnapshot())));
}

test("each family restores its mode, focus and custom scoring without affecting other families", () => {
  const { app, state, element } = dashboard();
  const fp = data.constants.prodFpAttr;
  const baseline = app.customizedWeightMap("farming", app.controls())[fp];
  element("weightModeSelect").value = "custom";
  element("fpGoodsFocus").value = "1";
  element("qiRoleSelect").value = "Red";
  state.customWeights.overall[fp] = 777;
  assert.equal(app.customizedWeightMap("overall", app.controls())[fp], 777);

  app.setActiveProfile("farming");
  assert.equal(element("weightModeSelect").value, "default");
  assert.equal(element("fpGoodsFocus").value, String(data.defaults.productionFpGoodsFocus));
  assert.equal(element("qiRoleSelect").value, data.defaults.qiFighterRole);
  assert.equal(app.customizedWeightMap("farming", app.controls())[fp], baseline);
  element("weightModeSelect").value = "custom";
  element("fpGoodsFocus").value = "5";
  state.customWeights.farming[fp] = 123;

  app.setActiveProfile("overall");
  assert.equal(element("weightModeSelect").value, "custom");
  assert.equal(element("fpGoodsFocus").value, "1");
  assert.equal(element("qiRoleSelect").value, "Red");
  assert.equal(app.customizedWeightMap("overall", app.controls())[fp], 777);
  element("weightModeSelect").value = "default";
  app.setActiveProfile("farmingEfficiency");
  assert.equal(element("weightModeSelect").value, "custom");
  assert.equal(element("fpGoodsFocus").value, "5");
  assert.equal(app.customizedWeightMap("farming", app.controls())[fp], 123);
  app.setActiveProfile("overallEfficiency");
  assert.equal(element("weightModeSelect").value, "default");
  assert.equal(state.customWeights.overall[fp], 777);
});

test("Score and Efficiency share settings for every ranking family", () => {
  const { app, element } = dashboard();
  for (const [score, efficiency] of [
    ["overall", "overallEfficiency"], ["fighting", "fightingEfficiency"],
    ["farming", "farmingEfficiency"], ["qi", "qiEfficiency"], ["kit", "kitEfficiency"],
  ]) {
    app.setActiveProfile(score);
    element("weightModeSelect").value = "custom";
    element("gbgGeFocus").value = "5";
    app.setActiveProfile(efficiency);
    assert.equal(element("weightModeSelect").value, "custom", efficiency);
    assert.equal(element("gbgGeFocus").value, "5", efficiency);
  }
});

test("Default mode displays the weights and total actually used in scoring", () => {
  const { app, state, element } = dashboard();
  app.renderCustomWeights();
  const defaultHtml = element("customWeights").innerHTML;
  const fp = data.constants.prodFpAttr;
  state.customWeights.overall[fp] = 777;
  app.renderCustomWeights();
  assert.equal(element("customWeights").innerHTML, defaultHtml);
  assert.notEqual(app.customizedWeightMap("overall", app.controls())[fp], 777);
  element("weightModeSelect").value = "custom";
  app.renderCustomWeights();
  assert.match(element("customWeights").innerHTML, /value="777"/);
  assert.match(element("customWeights").innerHTML, /class="changed-weight-input"/);
  assert.equal(app.customizedWeightMap("overall", app.controls())[fp], 777);
});

test("device preferences and share links preserve separate family settings", () => {
  const original = dashboard();
  original.element("weightModeSelect").value = "custom";
  original.element("fpGoodsFocus").value = "1";
  original.state.customWeights.overall[data.constants.prodFpAttr] = 777;
  original.app.setActiveProfile("farming");
  original.element("fpGoodsFocus").value = "5";
  const values = snapshot(original.app);
  const query = original.app.buildUrlParams().toString();

  for (const restore of [
    ({ app }) => app.applyPreferences(values),
    ({ app }) => { app.window.location.search = `?${query}`; app.applyUrlState(); },
  ]) {
    const restored = dashboard();
    restore(restored);
    assert.equal(restored.element("weightModeSelect").value, "default");
    assert.equal(restored.element("fpGoodsFocus").value, "5");
    restored.app.setActiveProfile("overall");
    assert.equal(restored.element("weightModeSelect").value, "custom");
    assert.equal(restored.element("fpGoodsFocus").value, "1");
    assert.equal(restored.state.customWeights.overall[data.constants.prodFpAttr], 777);
  }
});

test("legacy preferences apply global weighting settings only to their active family", () => {
  const { app, element } = dashboard();
  app.applyPreferences(app.sanitizedPreferences({
    profile: "fighting", weightMode: "custom", qiRole: "Blue", focus: { gbgGe: 5 },
  }));
  assert.equal(element("weightModeSelect").value, "custom");
  app.setActiveProfile("overall");
  assert.equal(element("weightModeSelect").value, "default");
  assert.equal(element("gbgGeFocus").value, String(data.defaults.fightingGbgGeFocus));
  app.setActiveProfile("fightingEfficiency");
  assert.equal(element("weightModeSelect").value, "custom");
  assert.equal(element("gbgGeFocus").value, "5");
});

test("legacy Default share links override a device's saved Custom mode", () => {
  const { app, element } = dashboard();
  element("weightModeSelect").value = "custom";
  element("fpGoodsFocus").value = "1";
  app.window.location.search = "?profile=overallEfficiency&fpGoods=5";
  app.applyUrlState();
  assert.equal(element("weightModeSelect").value, "default");
  assert.equal(element("fpGoodsFocus").value, "5");
  app.setActiveProfile("farming");
  assert.equal(element("fpGoodsFocus").value, String(data.defaults.productionFpGoodsFocus));
});

test("reset defaults removes settings and custom values from every family", () => {
  const { app, state, element } = dashboard();
  element("weightModeSelect").value = "custom";
  state.customWeights.overall[data.constants.prodFpAttr] = 777;
  app.setActiveProfile("fighting");
  element("gbgGeFocus").value = "5";
  app.resetDefaults();
  app.setActiveProfile("overall");
  assert.equal(element("weightModeSelect").value, "default");
  assert.equal(Object.keys(state.customWeights.overall).length, 0);
  app.setActiveProfile("fighting");
  assert.equal(element("gbgGeFocus").value, String(data.defaults.fightingGbgGeFocus));
});

test("a share link without overrides cannot activate stale device weights", () => {
  const { app, state, element } = dashboard();
  const fp = data.constants.prodFpAttr;
  state.customWeights.overall[fp] = 777;
  app.window.location.search = "?profile=overall&mode=custom";
  app.applyUrlState();
  assert.equal(element("weightModeSelect").value, "custom");
  assert.notEqual(app.customizedWeightMap("overall", app.controls())[fp], 777);
  assert.equal(Object.keys(state.customWeights.overall).length, 0);
});
