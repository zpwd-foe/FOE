const test = require("node:test");
const assert = require("node:assert/strict");
const { dashboard } = require("./helpers/dashboard.js");

function editor(profile = "farming", goodsAge = "") {
  const view = dashboard({ initialize: true, renderWeights: true });
  const { app, element, timers } = view;
  app.setActiveProfile(profile);
  element("weightModeSelect").value = "custom";
  app.renderImmediately();
  const family = app.activeWeightProfile();
  const row = app.customizableWeightRows(family, app.controls())[0];
  const input = element("weightInput");
  input.dataset = goodsAge ? { goodsAge, weightProfile: family } : { weightKey: row.key, weightProfile: family };
  input.closest = () => input;
  input.value = goodsAge ? 1 : row.defaultWeight;
  const panel = element("customWeights");
  const summary = element("weightSummary");
  const status = element("weightStatus");
  panel.querySelector = (selector) => ({
    "input[data-weight-key]:focus": !goodsAge && app.document.activeElement === input ? input : null,
    "input[data-goods-age]:focus": goodsAge && app.document.activeElement === input ? input : null,
    ".custom-summary strong": summary,
    "[data-weight-status]": status,
    ".weight-list": element("weightList"),
  })[selector] || null;
  let html = panel.innerHTML;
  let replacements = 0;
  Object.defineProperty(panel, "innerHTML", {
    get: () => html,
    set(value) { html = value; replacements++; },
  });
  input.focus();
  function flush(delay) {
    const [id, timer] = [...timers].find(([, timer]) => timer.delay === delay);
    timers.delete(id);
    timer.callback();
  }
  function type(value) {
    input.value = value;
    panel.listeners.input({ target: input });
  }
  function blur() {
    input.blur();
    panel.listeners.focusout({ target: input });
    flush(0);
  }
  return { ...view, input, panel, summary, status, row, family, type, blur, flush,
    replacements: () => replacements };
}

test("slow decimal and multi-digit weight edits retain their text and the focused input", () => {
  for (const sequence of [["0", "0.", "0.5"], ["1", "12", "123"]]) {
    const view = editor();
    for (const value of sequence) {
      view.type(value);
      view.flush(140);
      assert.equal(view.input.value, value);
      assert.equal(view.app.document.activeElement, view.input);
      assert.equal(view.replacements(), 0, "recalculating must not replace the focused native input");
    }
    const expected = Number(sequence.at(-1));
    assert.equal(view.state.customWeights.farming[view.row.key], expected);
    assert.equal(view.app.customizedWeightMap("farming", view.app.controls())[view.row.key], expected);
    assert.match(view.status.textContent, /1 custom change is active/);
    view.blur();
    assert.equal(view.input.value, String(expected));
    assert.equal(view.replacements(), 1);
  }
});

test("an incomplete native number input keeps the previous weight until editing completes", () => {
  const view = editor();
  view.type("12");
  view.flush(140);
  // Native number inputs expose an empty value plus badInput for partial input such as '1e'.
  view.input.validity.badInput = true;
  view.type("");
  view.app.renderImmediately();
  assert.equal(view.state.customWeights.farming[view.row.key], 12);
  assert.equal(view.replacements(), 0);
  view.blur();
  assert.equal(view.input.value, "12");
});

test("clearing a weight restores its default without replacing the field mid-edit", () => {
  const view = editor();
  view.type("777");
  view.flush(140);
  view.type("");
  view.flush(140);
  assert.equal(view.state.customWeights.farming[view.row.key], undefined);
  assert.equal(view.input.value, "");
  assert.equal(view.replacements(), 0);
  view.blur();
  assert.equal(view.input.value, String(view.row.defaultWeight));
});

test("weight bounds and whole-number kit rules are shown when editing ends", () => {
  for (const [profile, typed, expected] of [
    ["farming", "1001", 1000], ["farming", "-5", 0], ["kit", "2.6", 3], ["kit", "12", 10],
  ]) {
    const view = editor(profile);
    view.type(typed);
    view.flush(140);
    assert.equal(view.input.value, typed);
    assert.equal(view.state.customWeights[view.family][view.row.key], expected);
    view.blur();
    assert.equal(view.input.value, String(expected));
  }
});

test("switching family replaces a focused weight editor with the new family's values", () => {
  const view = editor();
  view.type("777");
  view.flush(140);
  view.app.setActiveProfile("fighting");
  view.app.renderImmediately();
  assert.equal(view.replacements(), 1);
  assert.match(view.panel.innerHTML, /data-weight-profile="fighting"/);
  assert.doesNotMatch(view.panel.innerHTML, /value="777"/);
});

test("multiplier edits preserve focus, decimal text, and the importance total", () => {
  const view = editor("farming", "previous");
  for (const value of ["0", "0.", "0.5"]) {
    view.type(value);
    view.flush(140);
    assert.equal(view.input.value, value);
    assert.equal(view.replacements(), 0);
    assert.equal(view.app.document.activeElement, view.input);
    assert.equal(view.summary.textContent, "60.00 importance total");
  }
  assert.equal(view.state.goodsAgeMultipliers.previous, 0.5);
  assert.match(view.status.textContent, /1 custom change is active/);
  view.input.validity.badInput = true;
  view.type("");
  assert.equal(view.state.goodsAgeMultipliers.previous, 0.5);
  view.input.validity.badInput = false;
  view.type("");
  view.flush(140);
  assert.equal(view.state.goodsAgeMultipliers.previous, 1);
  assert.equal(view.input.value, "");
  view.blur();
  assert.equal(view.input.value, "1");
});

test("goods multiplier inputs cap at 10 and keep their bounds separate from scoring weights", () => {
  for (const [typed, expected] of [["11", 10], ["1000", 10], ["-5", 0], ["0.5", 0.5]]) {
    const view = editor("farming", "next");
    view.type(typed);
    view.flush(140);
    assert.equal(view.state.goodsAgeMultipliers.next, expected);
    assert.equal(view.input.value, typed);
    view.blur();
    assert.equal(view.input.value, String(expected));
    assert.match(view.panel.innerHTML, /min="0" max="10" step="1"/);
  }
});
