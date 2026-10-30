const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../../data/ranking-core.json");
const preferences = require("../../src/preferences.js");

const source = fs.readFileSync(path.join(__dirname, "../../src/app.js"), "utf8");

function dashboard({ initialize = false, renderWeights = false, storedPreferences = null, search = "" } = {}) {
  const initialAge = core.metadata.defaultAge;
  const records = [
    { entityId: "A", name: "Alpha", attrs: { [core.constants.prodFpAttr]: 100 }, adjustedArea: 4 },
    { entityId: "B", name: "Beta", attrs: { [core.constants.prodGoodsAttr]: 200 }, adjustedArea: 9 },
  ].map((record) => ({ ...record, selectedAge: initialAge, category: core.categories[1], requiresRoad: false }));
  const data = { ...core, recordsByAge: { [initialAge]: records }, cityRecordsByAge: {} };
  const elements = new Map();
  const timers = new Map();
  let timerId = 0;
  const saved = new Map(storedPreferences ? [[preferences.STORAGE_KEY, JSON.stringify({
    schemaVersion: preferences.SCHEMA_VERSION, values: storedPreferences,
  })]] : []);
  const storage = {
    getItem: (key) => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  const options = {
    qiRoleSelect: ["Both", "Blue", "Red"],
    weightModeSelect: ["default", "custom"],
    topNSelect: ["50", "200", "all"],
  };
  function element(id) {
    if (!elements.has(id)) {
      let value = "";
      const choices = id === "strengthFilter" ? ["fp", "goods", "combat"]
        : id === "categoryOptions" ? data.categories : [];
      const children = choices.map((value) => ({ value, checked: false, dataset: { label: value } }));
      const attributes = new Map();
      const classes = new Set();
      elements.set(id, {
        id,
        get value() { return value; },
        set value(next) { value = String(next); },
        options: (options[id] || []).map((value) => ({ value })),
        get selectedOptions() { return [{ value, textContent: value }]; },
        querySelectorAll: () => children,
        querySelector: () => null,
        checked: false, disabled: false, hidden: false, validity: { valid: true }, dataset: {},
        listeners: {},
        addEventListener(type, callback) { this.listeners[type] = callback; },
        setAttribute(key, value) { attributes.set(key, value); },
        removeAttribute(key) { attributes.delete(key); },
        getAttribute(key) { return attributes.get(key) ?? null; },
        focus() { document.activeElement = this; },
        blur() { document.activeElement = document.body; },
        contains(node) { return this === node; },
        classList: {
          add(name) { classes.add(name); },
          remove(name) { classes.delete(name); },
          toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); },
          contains(name) { return classes.has(name); },
        },
      });
    }
    return elements.get(id);
  }
  const document = {
    getElementById: element, querySelector: element, querySelectorAll: () => [],
    addEventListener() {}, body: element("body"),
  };
  document.activeElement = document.body;
  const location = { search, pathname: "/", href: `http://localhost/${search}` };
  const window = {
    FOE_BUILDING_RANKING_DATA: data,
    FOE_BUILDING_RANKING_PREFERENCES: preferences,
    localStorage: storage,
    location,
    history: { replaceState(_state, _title, url) { location.href = `http://localhost${url}`; } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { callback(); },
  };
  for (const [key, name] of Object.entries({
    STRENGTHS: "strengths", CITY_MAP: "city-map", RANKING: "ranking", UNIT_PRODUCTION: "unit-production",
    PRODUCTION_SEARCH: "production-search", CATEGORY_LABELS: "category-labels",
  })) {
    window[`FOE_BUILDING_RANKING_${key}`] = require(`../../src/${name}.js`);
  }
  const app = vm.createContext({
    window,
    document, requestAnimationFrame: window.requestAnimationFrame,
    URLSearchParams, TextEncoder, TextDecoder, btoa, atob, console: { error() {} }, navigator: {},
  });
  vm.runInContext(source.replace(/\ninit\(\);\s*$/, ""), app);
  if (initialize) {
    // Keep real event handlers, scoring, filters, URL updates and persistence; skip layout-only DOM work.
    for (const name of [
      "renderControlState", "renderSummary", "renderTable", "renderBuildingList",
      ...(!renderWeights ? ["renderCustomWeights"] : []),
      "renderCompare", "initMobileCollapsibles", "renderStrengthLegend",
    ]) app[name] = () => {};
    app.init();
  } else {
    app.resetDefaults();
  }
  return { app, state: vm.runInContext("state", app), data, element, timers, storage };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

module.exports = { dashboard, deferred };
