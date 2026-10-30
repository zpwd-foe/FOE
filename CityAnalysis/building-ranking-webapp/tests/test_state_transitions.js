const test = require("node:test");
const assert = require("node:assert/strict");
const { dashboard, deferred } = require("./helpers/dashboard.js");
const { STORAGE_KEY } = require("../src/preferences.js");

function rowIds(view) {
  return Array.from(view.app.displayRows(view.app.buildRows()), (row) => row.key);
}

test("a default full share link clears saved settings for every ranking family", () => {
  const sender = dashboard();
  const families = { overall: "overall", fighting: "fighting", farming: "farming", qi: "qi", kit: "kits" };
  const settings = Object.fromEntries(Object.values(families).map((family) => [family, {
    weightMode: "custom", qiRole: "Red", focus: { fpGoods: 5, gbgGe: 1 },
  }]));
  const query = sender.app.buildUrlParams();
  assert.equal(query.has("profileSettings"), false);
  const receiver = dashboard({ initialize: true, search: `?${query}`, storedPreferences: {
    profile: "farming", profileSettings: settings,
  } });
  for (const profile of Object.keys(families)) {
    for (const variant of [profile, `${profile}Efficiency`]) {
      sender.app.setActiveProfile(variant);
      receiver.app.setActiveProfile(variant);
      for (const id of ["weightModeSelect", "qiRoleSelect", "fpGoodsFocus", "gbgGeFocus"]) {
        assert.equal(receiver.element(id).value, sender.element(id).value, `${variant}: ${id}`);
      }
      assert.deepEqual(rowIds(receiver), rowIds(sender));
    }
  }
});

test("explicit profile settings in a full link replace saved settings in other families", () => {
  const sender = dashboard();
  sender.app.setActiveProfile("qi");
  sender.element("qiRoleSelect").value = "Blue";
  const receiver = dashboard({ initialize: true, search: `?${sender.app.buildUrlParams()}`, storedPreferences: {
    profileSettings: { farming: { weightMode: "custom", focus: { fpGoods: 5 } } },
  } });
  assert.equal(receiver.element("qiRoleSelect").value, "Blue");
  receiver.app.setActiveProfile("farming");
  assert.equal(receiver.element("weightModeSelect").value, "default");
  assert.equal(receiver.element("fpGoodsFocus").value, String(receiver.data.defaults.productionFpGoodsFocus));
});

function resetWithAgeRequest() {
  const view = dashboard({ initialize: true });
  const { app, state, data, element } = view;
  const defaultAge = data.metadata.defaultAge;
  const defaultRecords = data.recordsByAge[defaultAge];
  data.recordsByAge.IronAge = defaultRecords.map((record) => ({ ...record, selectedAge: "IronAge" }));
  delete data.recordsByAge[defaultAge];
  state.loadedAge = "IronAge";
  element("ageSelect").value = "IronAge";
  element("fpGoodsFocus").value = "1";
  app.renderImmediately();
  app.savePreferences();
  const pending = deferred();
  app.window.FOE_LOAD_BUILDING_RANKING_AGE = () => pending.promise;
  const resetting = element("resetButton").listeners.click();
  return { ...view, pending, resetting, defaultRecords };
}

for (const outcome of ["resolve", "reject"]) {
  for (const saveDuringLoad of [false, true]) {
    test(`edits during Reset defaults persist after age ${outcome}, earlier save: ${saveDuringLoad}`, async () => {
      const { app, state, data, element, storage, pending, resetting, defaultRecords } = resetWithAgeRequest();
      const fp = data.constants.prodFpAttr;
      element("weightModeSelect").value = "custom";
      element("weightModeSelect").listeners.change();
      const input = { value: "777", dataset: { weightKey: fp } };
      element("customWeights").listeners.input({ target: { closest: () => input } });
      element("fpGoodsFocus").value = "5";
      if (saveDuringLoad) app.savePreferences();
      data.recordsByAge[data.metadata.defaultAge] = defaultRecords;
      pending[outcome](new Error("Age unavailable"));
      await resetting;
      app.savePreferences();
      const saved = JSON.parse(storage.getItem(STORAGE_KEY)).values;
      assert.equal(saved.customWeights.overall[fp], 777);
      assert.equal(saved.profileSettings.overall.focus.fpGoods, 5);
      assert.equal(saved.age, outcome === "resolve" ? data.metadata.defaultAge : "IronAge");
      const reopened = dashboard({ initialize: true, storedPreferences: saved });
      assert.equal(reopened.state.customWeights.overall[fp], state.customWeights.overall[fp]);
      assert.equal(reopened.element("weightModeSelect").value, "custom");
    });
  }

  test(`Reset defaults with no edits keeps storage cleared after age ${outcome}`, async () => {
    const { app, data, storage, pending, resetting, defaultRecords } = resetWithAgeRequest();
    app.renderImmediately();
    app.savePreferences();
    assert.equal(storage.getItem(STORAGE_KEY), null);
    data.recordsByAge[data.metadata.defaultAge] = defaultRecords;
    pending[outcome](new Error("Age unavailable"));
    await resetting;
    app.savePreferences();
    assert.equal(storage.getItem(STORAGE_KEY), null);
  });
}

test("an open detail drawer refreshes after an age load and preserves discrepancy drafts", async () => {
  const { app, state, data, element } = dashboard({ initialize: true });
  const pending = deferred();
  app.window.FOE_LOAD_BUILDING_RANKING_AGE = () => pending.promise;
  element("ageSelect").value = "IronAge";
  const loading = app.changeAge();
  app.openDetail("A", false);
  const content = element("detailContent");
  let html = content.innerHTML;
  const originalHtml = html;
  // Replacing the real drawer DOM also replaces its inputs; model that effect here.
  Object.defineProperty(content, "innerHTML", {
    get: () => html,
    set(value) { html = value; element("observedValue").value = ""; element("reportNotes").value = ""; },
  });
  element("observedValue").value = "123";
  const notes = element("reportNotes");
  notes.value = "Check production";
  notes.selectionStart = 6;
  notes.selectionEnd = 10;
  notes.selectionDirection = "forward";
  let restoredSelection;
  notes.setSelectionRange = (...selection) => { restoredSelection = selection; };
  content.contains = (node) => node === notes;
  notes.focus();
  const fp = data.constants.prodFpAttr;
  data.recordsByAge.IronAge = data.recordsByAge[state.loadedAge].map((record) => ({
    ...record, selectedAge: "IronAge", attrs: { ...record.attrs, [fp]: 10000 },
  }));
  pending.resolve();
  await loading;
  assert.notEqual(html, originalHtml);
  assert.match(html, /10,000/);
  assert.equal(element("observedValue").value, "123");
  assert.equal(notes.value, "Check production");
  assert.equal(app.document.activeElement, notes);
  assert.deepEqual(restoredSelection, [6, 10, "forward"]);
  assert.equal(state.activeDetailRowKey, "A");
  element("reportAttribute").value = fp;
  assert.match(app.buildReportText(state.rows.find((row) => row.key === "A")), /Expected value: 10,000/);
});

test("an age change closes details when the selected building no longer exists", async () => {
  const { app, state, data, element } = dashboard({ initialize: true });
  app.openDetail("A", false);
  data.recordsByAge.IronAge = [{ ...data.recordsByAge[state.loadedAge][1], selectedAge: "IronAge" }];
  element("ageSelect").value = "IronAge";
  await app.changeAge();
  assert.equal(state.activeDetailRowKey, null);
  assert.equal(element("detailDrawer").classList.contains("open"), false);
  assert.equal(element("detailDrawer").inert, true);
  assert.equal(element("drawerBackdrop").hidden, true);
});

test("full share links replace saved filters, search mode and sorting with omitted defaults", () => {
  const sender = dashboard();
  sender.element("searchInput").value = "Alpha";
  const receiver = dashboard({
    initialize: true,
    search: `?${sender.app.buildUrlParams()}`,
    storedPreferences: {
      searchMode: "fragment",
      categories: [sender.data.categories[2]],
      filters: { minArea: 100, maxArea: 200, topN: "50", strengths: ["combat"], noRoadOnly: true },
      sort: { key: "name", dir: "asc" },
    },
  });
  const controls = receiver.app.controls();
  assert.equal(controls.searchMode, "building");
  assert.equal(controls.minArea, null);
  assert.equal(controls.maxArea, null);
  assert.equal(controls.topN, "200");
  assert.equal(controls.noRoadOnly, false);
  assert.equal(controls.strengths.length, 0);
  assert.equal(controls.categories.length, 0);
  assert.equal(receiver.state.sort.key, "profile");
  assert.equal(receiver.state.sort.dir, "desc");
  assert.deepEqual(rowIds(receiver), ["A"]);
  assert.deepEqual(rowIds(receiver), rowIds(sender));
});

test("explicit share-link filters still round-trip and empty searches clear both search fields", () => {
  const sender = dashboard();
  sender.app.applyPreferences(sender.app.sanitizedPreferences({
    searchMode: "production", categories: [sender.data.categories[1]],
    filters: { minArea: 2, maxArea: 10, topN: "50", strengths: ["fp"], noRoadOnly: true },
    sort: { key: "name", dir: "asc" },
  }));
  sender.element("productionSearchSelect").value = "diamonds";
  const receiver = dashboard();
  receiver.app.window.location.search = `?${sender.app.buildUrlParams()}`;
  receiver.app.applyUrlState();
  assert.deepEqual(JSON.parse(JSON.stringify(receiver.app.controls())), JSON.parse(JSON.stringify(sender.app.controls())));
  assert.equal(receiver.state.sort.key, "name");
  receiver.element("searchInput").value = "old text";
  receiver.app.window.location.search = `?profile=overall&age=${sender.data.metadata.defaultAge}`;
  receiver.app.applyUrlState();
  assert.equal(receiver.element("searchInput").value, "");
  assert.equal(receiver.element("productionSearchSelect").value, "");
});

test("opening without a full ranking link preserves saved filter preferences", () => {
  for (const search of ["", "?age=SpaceAgeVenus"]) {
    const view = dashboard({ initialize: true, search, storedPreferences: {
      searchMode: "fragment", filters: { minArea: 2, topN: "50", strengths: ["fp"] },
      sort: { key: "name", dir: "asc" },
    } });
    assert.equal(view.app.controls().searchMode, "fragment");
    assert.equal(view.app.controls().minArea, 2);
    assert.equal(view.app.controls().topN, "50");
    assert.equal(view.state.sort.key, "name");
  }
});

test("profile changes and delayed renders keep loaded rows while an age request fails", async () => {
  const view = dashboard({ initialize: true });
  const { app, state, element, timers } = view;
  const previousAge = state.loadedAge;
  const pending = deferred();
  app.window.FOE_LOAD_BUILDING_RANKING_AGE = () => pending.promise;
  app.scheduleRender(160);
  element("ageSelect").value = "IronAge";
  const loading = app.changeAge();
  app.setActiveProfile("farming");
  const delayedRender = [...timers.values()].find((timer) => timer.delay === 160);
  delayedRender.callback();
  assert.equal(app.controls().age, previousAge);
  assert.equal(state.rows.length, 2);
  assert.equal(app.buildUrlParams().get("age"), previousAge);
  pending.reject(new Error("Network unavailable"));
  assert.equal(await loading, false);
  assert.equal(element("ageSelect").value, previousAge);
  assert.equal(state.rows.length, 2);
  assert.equal(element("ageSelect").disabled, false);
  assert.equal(element("ageSelect").getAttribute("aria-busy"), null);
  assert.equal(new URL(app.window.location.href).searchParams.get("age"), previousAge);
});

test("successful age loads commit the requested rows and share-link age together", async () => {
  const { app, state, element, data } = dashboard({ initialize: true });
  const pending = deferred();
  app.window.FOE_LOAD_BUILDING_RANKING_AGE = () => pending.promise;
  element("ageSelect").value = "IronAge";
  const loading = app.changeAge();
  data.recordsByAge.IronAge = [{ ...data.recordsByAge[state.loadedAge][0], entityId: "iron", selectedAge: "IronAge" }];
  pending.resolve();
  assert.equal(await loading, true);
  assert.equal(state.loadedAge, "IronAge");
  assert.equal(state.pendingAge, null);
  assert.equal(state.rows[0].key, "iron");
  assert.equal(app.buildUrlParams().get("age"), "IronAge");
});

for (const outcome of ["resolve", "reject"]) {
  test(`an older age request cannot ${outcome} over a newer selection`, async () => {
    const { app, state, element, data } = dashboard({ initialize: true });
    const requests = { IronAge: deferred(), BronzeAge: deferred() };
    app.window.FOE_LOAD_BUILDING_RANKING_AGE = (age) => requests[age].promise;
    element("ageSelect").value = "IronAge";
    const older = app.changeAge();
    element("ageSelect").value = "BronzeAge";
    const newer = app.changeAge();
    data.recordsByAge.IronAge = data.recordsByAge[state.loadedAge];
    requests.IronAge[outcome](new Error("Old request failed"));
    assert.equal(await older, null);
    assert.equal(element("ageSelect").value, "BronzeAge");
    assert.equal(element("ageSelect").disabled, true);
    data.recordsByAge.BronzeAge = data.recordsByAge[state.loadedAge];
    requests.BronzeAge.resolve();
    await newer;
    assert.equal(state.loadedAge, "BronzeAge");
    assert.equal(element("ageSelect").disabled, false);
  });

  test(`a late age ${outcome} cannot undo an already loaded newer age`, async () => {
    const { app, state, element, data } = dashboard({ initialize: true });
    const requests = { IronAge: deferred(), BronzeAge: deferred() };
    app.window.FOE_LOAD_BUILDING_RANKING_AGE = (age) => requests[age].promise;
    element("ageSelect").value = "IronAge";
    const older = app.changeAge();
    element("ageSelect").value = "BronzeAge";
    const newer = app.changeAge();
    data.recordsByAge.BronzeAge = [data.recordsByAge[state.loadedAge][0]];
    requests.BronzeAge.resolve();
    await newer;
    data.recordsByAge.IronAge = [data.recordsByAge[data.metadata.defaultAge][1]];
    requests.IronAge[outcome](new Error("Late failure"));
    assert.equal(await older, null);
    assert.equal(state.loadedAge, "BronzeAge");
    assert.equal(element("ageSelect").value, "BronzeAge");
    assert.equal(state.rows[0].key, "A");
    assert.equal(app.buildUrlParams().get("age"), "BronzeAge");
  });
}

test("Reset defaults cancels an older age load even if it finishes afterwards", async () => {
  const { app, state, element, data } = dashboard({ initialize: true });
  const pending = deferred();
  app.window.FOE_LOAD_BUILDING_RANKING_AGE = () => pending.promise;
  element("ageSelect").value = "IronAge";
  const loading = app.changeAge();
  await element("resetButton").listeners.click();
  data.recordsByAge.IronAge = data.recordsByAge[data.metadata.defaultAge];
  pending.resolve();
  assert.equal(await loading, null);
  assert.equal(state.loadedAge, data.metadata.defaultAge);
  assert.equal(element("ageSelect").value, data.metadata.defaultAge);
  assert.equal(element("ageSelect").disabled, false);
});

function cityFile(view, name = "city.json") {
  const level = view.data.ages.findIndex((age) => age.key === view.data.metadata.defaultAge);
  const payload = JSON.stringify({ CityMapData: [{ cityentity_id: "A", level }] });
  return { name, size: payload.length, text: async () => payload };
}

for (const phase of ["file", "age data"]) {
  for (const outcome of ["resolve", "reject"]) {
    test(`clearing a city map ignores a pending ${phase} ${outcome}`, async () => {
      const view = dashboard({ initialize: true });
      const { app, state, element } = view;
      app.window.FOE_LOAD_BUILDING_RANKING_CITY_AGE = async () => {};
      await app.loadCityMapFile(cityFile(view, "original.json"));
      const pending = deferred();
      const started = deferred();
      const file = cityFile(view, "replacement.json");
      if (phase === "file") file.text = () => { started.resolve(); return pending.promise; };
      else app.window.FOE_LOAD_BUILDING_RANKING_CITY_AGE = () => { started.resolve(); return pending.promise; };
      const loading = app.loadCityMapFile(file);
      await started.promise;
      app.clearCityMap();
      pending[outcome](outcome === "resolve" ? await cityFile(view).text() : new Error("Old load failed"));
      await loading;
      assert.equal(state.cityMap, null);
      assert.equal(element("cityScopeSelect").value, "all");
      assert.equal(element("cityMapFile").disabled, false);
      assert.equal(element("cityMapFile").getAttribute("aria-busy"), null);
      assert.notEqual(element("cityMapStatus").dataset.status, "error");
    });
  }
}

test("a cancelled import cannot unlock or replace a subsequent import", async () => {
  const view = dashboard({ initialize: true });
  const { app, state, element } = view;
  app.window.FOE_LOAD_BUILDING_RANKING_CITY_AGE = async () => {};
  const first = deferred();
  const second = deferred();
  const oldLoad = app.loadCityMapFile({ ...cityFile(view), text: () => first.promise });
  app.clearCityMap();
  const newLoad = app.loadCityMapFile({ ...cityFile(view, "new.json"), text: () => second.promise });
  first.reject(new Error("Cancelled load failed"));
  await oldLoad;
  assert.equal(element("cityMapFile").disabled, true);
  second.resolve(await cityFile(view).text());
  await newLoad;
  assert.equal(state.cityMap.fileName, "new.json");
  assert.equal(element("cityScopeSelect").value, "city");
  assert.equal(element("cityMapFile").disabled, false);
});
