import {
  arcBonusForLevel,
  arcLevelForBonus,
  benefitDefinition,
  buildingBenefit,
  buildLevelRows,
  buildRageAnalysis,
  buildRageCsv,
  buildRewardSeries,
  buildUpgradeCostSeries,
  ownerCost,
} from "./core.js";

const formatter = new Intl.NumberFormat("en-US");
const INPUT_STATE_ENDPOINT = "api/user-input";
const INPUT_STATE_STORAGE_KEY = "gb-analysis-input-state-v1";
const DEFAULT_RAGE_ARC_LEVELS = [180, 180, 180, 80, 80];
const elements = Object.fromEntries(
  [
    "source-version",
    "theme-toggle",
    "theme-toggle-icon",
    "theme-toggle-label",
    "building-select",
    "level-input",
    "level-range",
    "arc-input",
    "building-era",
    "building-name",
    "building-benefit",
    "building-size",
    "reward-multiplier",
    "owner-cost",
    "selected-total-fp-cost",
    "selected-level-benefits",
    "reward-body",
    "reward-table-wrap",
    "reward-table-scroll-hint",
    "reward-note",
    "unlock-total",
    "unlock-list",
    "unlock-note",
    "unlock-cumulative",
    "unlock-cumulative-label",
    "goods-total",
    "goods-list",
    "cost-chart-controls",
    "cost-chart-label",
    "cost-chart",
    "cost-chart-tooltip",
    "cost-chart-note",
    "reward-chart-controls",
    "reward-chart-view-toggle",
    "reward-chart-label",
    "reward-chart",
    "reward-chart-tooltip",
    "reward-chart-legend",
    "reward-chart-note",
    "chart-cost-max",
    "rage-start-level",
    "rage-target-level",
    "rage-arc-p1",
    "rage-arc-p2",
    "rage-arc-p3",
    "rage-arc-p4",
    "rage-arc-p5",
    "rage-arc-p1-bonus",
    "rage-arc-p2-bonus",
    "rage-arc-p3-bonus",
    "rage-arc-p4-bonus",
    "rage-arc-p5-bonus",
    "rage-coverage-warning",
    "rage-unlock-toggle",
    "rage-unlock-toggle-label",
    "rage-benefit-toggle",
    "rage-benefit-toggle-label",
    "rage-table",
    "rage-table-head",
    "rage-table-wrap",
    "rage-table-scroll-hint",
    "rage-body",
    "rage-total-foot",
    "rage-download-button",
  ].map((id) => [id, document.getElementById(id)]),
);

let dataset;
let currentRows = [];
let currentRageAnalysis;
let currentRewardCoverage = 0;
let selectedCostSeriesId = "forgePoints";
let selectedRewardResource = "forgePoints";
let selectedRewardView = "base";
let chartData = { cost: null, reward: null };
let inputStateSaveTimeout;
let rageUnlockCostsExpanded = true;
let rageBenefitsExpanded = true;

const CHART_WIDTH = 900;
const CHART_HEIGHT = 240;
const CHART_PADDING = 8;
const chartInteraction = {
  cost: { index: null, pinned: false },
  reward: { index: null, pinned: false },
};

const CHART_RESOURCES = {
  forgePoints: { shortLabel: "FP", label: "Forge Points", unit: "FP" },
  goods: { shortLabel: "Goods", label: "Total goods", unit: "goods" },
  money: { shortLabel: "Coins", label: "Coins", unit: "coins" },
  supplies: { shortLabel: "Supplies", label: "Supplies", unit: "supplies" },
  medals: { shortLabel: "Medals", label: "Medals", unit: "medals" },
  dark_matter: { shortLabel: "Dark Matter", label: "Dark Matter", unit: "Dark Matter" },
  blueprints: { shortLabel: "BP", label: "Blueprints", unit: "BP" },
};

function formatNumber(value) {
  return formatter.format(value);
}

function formatBenefitValue(key, value, attempts) {
  if (!Number.isFinite(value)) return "—";
  const { unit, attemptLabel = "attempts" } = benefitDefinition(key);
  const formatted = formatNumber(value);
  const displayUnit = unit === "goods" && value === 1 ? "good" : unit;
  const valueWithUnit = !unit
    ? formatted
    : unit === "%" ? `${formatted}%` : `${formatted} ${displayUnit}`;
  return Number.isFinite(attempts)
    ? `${valueWithUnit} · ${formatNumber(attempts)} ${attemptLabel}`
    : valueWithUnit;
}

function renderThemeToggle() {
  const isDark = document.documentElement.dataset.theme === "dark";
  elements["theme-toggle-icon"].textContent = isDark ? "☀" : "☾";
  elements["theme-toggle-label"].textContent = isDark ? "Light" : "Dark";
  elements["theme-toggle"].setAttribute(
    "aria-label",
    `Switch to ${isDark ? "light" : "dark"} mode`,
  );
  elements["theme-toggle"].setAttribute("aria-pressed", isDark ? "true" : "false");
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("gb-analysis-theme", theme);
  } catch {
    // The theme still applies when storage is unavailable.
  }
  renderThemeToggle();
  scheduleInputStateSave();
}

function clampNumber(value, minimum, maximum, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, numeric));
}

function updateLevelRange(value) {
  const range = elements["level-range"];
  range.value = value;
  const minimum = Number(range.min);
  const maximum = Number(range.max);
  const progress = ((Number(value) - minimum) / (maximum - minimum)) * 100;
  range.style.setProperty("--range-progress", `${progress}%`);
}

function readLocalInputState() {
  try {
    const value = JSON.parse(localStorage.getItem(INPUT_STATE_STORAGE_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function loadInputState() {
  const localState = readLocalInputState();
  try {
    const response = await fetch(INPUT_STATE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) return localState;
    const fileState = await response.json();
    if (!fileState || typeof fileState !== "object" || Array.isArray(fileState)) {
      return localState;
    }
    return { ...localState, ...fileState };
  } catch {
    return localState;
  }
}

function applyInputState(state) {
  const buildingId = String(state.buildingId ?? "");
  if ([...elements["building-select"].options].some((option) => option.value === buildingId)) {
    elements["building-select"].value = buildingId;
  }

  const targetLevel = Math.round(clampNumber(state.targetLevel, 1, dataset.maxLevel, 80));
  elements["level-input"].value = targetLevel;
  updateLevelRange(targetLevel);
  elements["arc-input"].value = clampNumber(state.arcBonus, 0, 100, 90);

  let rageBeginningLevel = Math.round(
    clampNumber(state.rageBeginningLevel, 1, dataset.maxLevel, 1),
  );
  let rageTargetLevel = Math.round(
    clampNumber(state.rageTargetLevel, 1, dataset.maxLevel, 101),
  );
  if (rageBeginningLevel > rageTargetLevel) rageTargetLevel = rageBeginningLevel;
  elements["rage-start-level"].value = rageBeginningLevel;
  elements["rage-target-level"].value = rageTargetLevel;

  const savedLevels = Array.isArray(state.rageArcLevels)
    ? state.rageArcLevels
    : Array.isArray(state.rageArcBonuses)
      ? state.rageArcBonuses.map(arcLevelForBonus)
      : DEFAULT_RAGE_ARC_LEVELS;
  DEFAULT_RAGE_ARC_LEVELS.forEach((fallback, position) => {
    elements[`rage-arc-p${position + 1}`].value = clampNumber(
      savedLevels[position],
      0,
      180,
      fallback,
    );
  });
  renderRageArcBonusValues();

  if (typeof state.costChartResource === "string") {
    selectedCostSeriesId = state.costChartResource;
  }
  if (["forgePoints", "medals", "blueprints"].includes(state.rewardChartResource)) {
    selectedRewardResource = state.rewardChartResource;
  }
  if (["base", "boosted"].includes(state.rewardChartView)) {
    selectedRewardView = state.rewardChartView;
  }
  if (["light", "dark"].includes(state.theme)) {
    document.documentElement.dataset.theme = state.theme;
  }
  rageUnlockCostsExpanded = state.rageUnlockCostsExpanded !== false;
  rageBenefitsExpanded = state.rageBenefitsExpanded !== false;
}

function collectInputState() {
  return {
    schemaVersion: 3,
    buildingId: elements["building-select"].value,
    targetLevel: selectedLevel(),
    arcBonus: selectedArcBonus(),
    rageBeginningLevel: selectedRageBeginningLevel(),
    rageTargetLevel: selectedRageTargetLevel(),
    rageArcLevels: selectedRageArcLevels(),
    costChartResource: selectedCostSeriesId,
    rewardChartResource: selectedRewardResource,
    rewardChartView: selectedRewardView,
    rageUnlockCostsExpanded,
    rageBenefitsExpanded,
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  };
}

function saveInputStateLocally(state) {
  try {
    localStorage.setItem(INPUT_STATE_STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem("gb-analysis-theme", state.theme);
  } catch {
    // The temporary server file remains available when browser storage is unavailable.
  }
}

async function persistInputState() {
  if (!dataset) return;
  const state = collectInputState();
  saveInputStateLocally(state);
  try {
    await fetch(INPUT_STATE_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      keepalive: true,
    });
  } catch {
    // Local browser storage is the fallback for plain static hosting.
  }
}

function scheduleInputStateSave() {
  clearTimeout(inputStateSaveTimeout);
  inputStateSaveTimeout = setTimeout(() => void persistInputState(), 180);
}

function humanizeResource(resource) {
  const names = {
    money: "Coins",
    supplies: "Supplies",
    medals: "Medals",
    dark_matter: "Dark Matter",
  };
  if (names[resource]) return names[resource];
  const displayResource = resource.startsWith("stel_") ? resource.slice(5) : resource;
  return displayResource
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function goodsTotal(costs) {
  return Object.values(costs.goods).reduce((sum, amount) => sum + amount, 0);
}

function unlockSummary(costs) {
  const parts = [];
  if (costs.blueprintSets) {
    parts.push(`${formatNumber(costs.blueprintSets)} blueprint ${costs.blueprintSets === 1 ? "set" : "sets"}`);
  }
  const totalGoods = goodsTotal(costs);
  if (totalGoods) parts.push(`${formatNumber(totalGoods)} goods`);
  for (const [resource, amount] of Object.entries(costs.resources)) {
    parts.push(`${formatNumber(amount)} ${humanizeResource(resource).toLowerCase()}`);
  }
  return parts.join(" · ");
}

function selectedBuilding() {
  return dataset.buildings.find((building) => building.id === elements["building-select"].value);
}

function selectedLevel() {
  return Math.round(clampNumber(elements["level-input"].value, 1, dataset.maxLevel, 80));
}

function selectedArcBonus() {
  return clampNumber(elements["arc-input"].value, 0, 100, 90);
}

function populateBuildingSelect() {
  const groups = new Map();
  for (const building of dataset.buildings) {
    if (!groups.has(building.eraId)) groups.set(building.eraId, []);
    groups.get(building.eraId).push(building);
  }
  for (const [eraId, buildings] of groups) {
    const group = document.createElement("optgroup");
    group.label = dataset.eraNames[String(eraId)];
    for (const building of buildings) {
      const option = document.createElement("option");
      option.value = building.id;
      option.textContent = building.name;
      if (building.name === "Shattered Horizon Siphon") option.selected = true;
      group.append(option);
    }
    elements["building-select"].append(group);
  }
}

function renderBuildingHeading(building) {
  elements["building-era"].textContent = dataset.eraNames[String(building.eraId)];
  elements["building-name"].textContent = building.name;
  elements["building-benefit"].textContent = buildingBenefit(building.id);
  elements["building-size"].textContent = `${building.width} × ${building.length} tiles`;
}

function isDirectCapturedRewardLevel(eraId, targetLevel) {
  return (dataset.sources.contributorRewards.directCapturedRewards ?? []).some(
    (capture) => capture.eraId === eraId && capture.targetLevel === targetLevel,
  );
}

function isExactMedalRewardLevel(eraId, targetLevel) {
  const ranges = dataset.coverage.exactMedalTargetLevelRangesByEra?.[String(eraId)] ?? [];
  return ranges.some(([first, last]) => targetLevel >= first && targetLevel <= last);
}

function isExactFpRewardLevel(eraId, targetLevel) {
  const ranges = dataset.coverage.exactFpTargetLevelRangesByEra?.[String(eraId)] ?? [];
  return ranges.some(([first, last]) => targetLevel >= first && targetLevel <= last);
}

function renderSelectedLevelBenefits(selectedRow) {
  const list = document.createDocumentFragment();
  for (const benefit of selectedRow.benefits) {
    const item = document.createElement("div");
    item.className = "selected-benefit-item";
    const label = document.createElement("span");
    label.textContent = benefitDefinition(benefit.key).label;
    const value = document.createElement("strong");
    value.textContent = formatBenefitValue(benefit.key, benefit.value, benefit.attempts);
    item.append(label, value);
    list.append(item);
  }
  if (!selectedRow.benefits.length) {
    const empty = document.createElement("span");
    empty.className = "selected-benefit-empty";
    empty.textContent = "We don’t have benefit data for this level yet.";
    list.append(empty);
  }
  elements["selected-level-benefits"].replaceChildren(list);
}

function renderRewards(building, selectedRow, arcBonus) {
  const multiplier = 1 + arcBonus / 100;
  elements["reward-multiplier"].textContent = `${multiplier.toFixed(2)}× (${arcBonus}% Arc)`;
  const contributions = selectedRow.rewards.forgePoints?.adjusted;
  elements["owner-cost"].textContent = Array.isArray(contributions)
    ? formatNumber(ownerCost(selectedRow.cost, contributions))
    : "—";
  elements["selected-total-fp-cost"].textContent = formatNumber(selectedRow.cost);
  renderSelectedLevelBenefits(selectedRow);
  elements["reward-body"].replaceChildren();

  for (let index = 0; index < 5; index += 1) {
    const row = document.createElement("tr");
    const fp = selectedRow.rewards.forgePoints;
    const medals = selectedRow.rewards.medals;
    const blueprints = selectedRow.rewards.blueprints;
    const cells = [
      [`P${index + 1}`, "position-cell"],
      [fp ? formatNumber(fp.base[index]) : "—", fp ? "" : "missing-value"],
      [fp ? formatNumber(fp.adjusted[index]) : "—", fp ? "bonus-cell" : "bonus-cell missing-value"],
      [medals ? formatNumber(medals.base[index]) : "—", medals ? "" : "missing-value"],
      [
        medals ? formatNumber(medals.adjusted[index]) : "—",
        medals ? "bonus-cell" : "bonus-cell missing-value",
      ],
      [blueprints ? formatNumber(blueprints.base[index]) : "—", blueprints ? "" : "missing-value"],
      [
        blueprints ? formatNumber(blueprints.adjusted[index]) : "—",
        blueprints ? "bonus-cell" : "bonus-cell missing-value",
      ],
    ];
    for (const [value, className] of cells) {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (className) cell.className = className;
      row.append(cell);
    }
    elements["reward-body"].append(row);
  }
  const exactCoverage = dataset.coverage.exactContributorRewardsThroughLevel ?? dataset.maxLevel;
  const isDirectCapture = isDirectCapturedRewardLevel(
    building.eraId,
    selectedRow.targetLevel,
  );
  const hasExactMedals = isExactMedalRewardLevel(
    building.eraId,
    selectedRow.targetLevel,
  );
  const hasExactFp = isExactFpRewardLevel(building.eraId, selectedRow.targetLevel);
  const exactApiRewards = [
    hasExactFp ? "FP rewards" : null,
    hasExactMedals ? "medal rewards" : null,
  ].filter(Boolean);
  const modeledRewards = [
    hasExactFp ? null : "FP rewards",
    hasExactMedals ? null : "medal rewards",
    "blueprint rewards",
  ].filter(Boolean);
  const provenance = isDirectCapture
    ? `Level ${selectedRow.targetLevel} rewards were recorded in-game. `
    : selectedRow.targetLevel > exactCoverage
      ? exactApiRewards.length
        ? `Level ${selectedRow.targetLevel}: ${exactApiRewards.join(" and ")} are confirmed; ${modeledRewards.join(" and ")} are estimates. `
        : `Level ${selectedRow.targetLevel}: FP, medal, and blueprint rewards are estimates based on known reward patterns. `
      : "";
  elements["reward-note"].textContent =
    `${provenance}Base = without Arc. BP = blueprints. Arc boosts all three rewards; results round to whole numbers.`;
}

function unlockResourceGroup(title, entries, totalLabel) {
  const group = document.createElement("section");
  group.className = "unlock-group";
  const heading = document.createElement("div");
  heading.className = "unlock-group-heading";
  const name = document.createElement("h4");
  name.textContent = title;
  heading.append(name);
  if (totalLabel) {
    const total = document.createElement("span");
    total.className = "unlock-group-total";
    total.textContent = totalLabel;
    heading.append(total);
  }
  const list = document.createElement("dl");
  list.className = "unlock-resource-list";
  for (const [resource, amount] of entries) {
    const row = document.createElement("div");
    const label = document.createElement("dt");
    label.textContent = humanizeResource(resource);
    const value = document.createElement("dd");
    value.textContent = formatNumber(amount);
    row.append(label, value);
    list.append(row);
  }
  group.append(heading, list);
  return group;
}

function renderUnlockCosts(selectedRow) {
  const costs = selectedRow.unlockCosts;
  const goods = Object.entries(costs.goods).filter(([, amount]) => amount > 0);
  const resources = Object.entries(costs.resources).filter(([, amount]) => amount > 0);
  const hasCosts = Boolean(costs.blueprintSets || goods.length || resources.length);
  const list = elements["unlock-list"];
  list.replaceChildren();
  elements["unlock-total"].textContent = `Level ${selectedRow.targetLevel}`;
  elements["unlock-cumulative"].hidden = !hasCosts;

  if (!hasCosts) {
    const empty = document.createElement("div");
    empty.className = "good-empty";
    empty.textContent = "No extra unlock cost for levels 1–10. Your original blueprint set has you covered.";
    list.append(empty);
    return;
  }

  if (costs.blueprintSets) {
    const requirement = document.createElement("div");
    requirement.className = "unlock-blueprints";
    const label = document.createElement("span");
    label.textContent = "Blueprints needed";
    const value = document.createElement("strong");
    value.textContent = `${formatNumber(costs.blueprintSets)} full ${costs.blueprintSets === 1 ? "set" : "sets"}`;
    requirement.append(label, value);
    list.append(requirement);
  }
  if (goods.length || resources.length) {
    const groups = document.createElement("div");
    groups.className = "unlock-groups";
    if (goods.length) groups.append(unlockResourceGroup("Goods", goods, `${formatNumber(goodsTotal(costs))} total`));
    if (resources.length) groups.append(unlockResourceGroup("Other resources", resources));
    list.append(groups);
  }
  elements["unlock-cumulative-label"].textContent = `Total unlock costs, levels 1–${selectedRow.targetLevel}`;
  elements["unlock-note"].textContent = unlockSummary(selectedRow.cumulativeUnlockCosts);
}

function renderGoods(building) {
  elements["goods-list"].replaceChildren();
  const goods = Object.entries(building.foundationGoods);
  const total = goods.reduce((sum, [, amount]) => sum + amount, 0);
  elements["goods-total"].textContent = goods.length ? `${formatNumber(total)} goods` : "No goods";

  if (!goods.length) {
    const empty = document.createElement("div");
    empty.className = "good-empty";
    empty.textContent = "No goods needed to place this building.";
    elements["goods-list"].append(empty);
    return;
  }

  goods.forEach(([resource, amount]) => {
    const item = document.createElement("div");
    item.className = "good-item";
    const name = document.createElement("span");
    name.textContent = humanizeResource(resource);
    const value = document.createElement("strong");
    value.textContent = formatNumber(amount);
    item.append(name, value);
    elements["goods-list"].append(item);
  });
}

function chartCoordinates(values, maximum) {
  const point = (value, index) => {
    const x = CHART_PADDING +
      (index / (values.length - 1)) * (CHART_WIDTH - CHART_PADDING * 2);
    const y = CHART_HEIGHT - CHART_PADDING -
      (value / Math.max(maximum, 1)) * (CHART_HEIGHT - CHART_PADDING * 2);
    return [x, y];
  };
  const points = values.map((value, index) =>
    Number.isFinite(value) ? point(value, index) : null,
  );
  let drawing = false;
  const line = points
    .map((coordinates) => {
      if (!coordinates) {
        drawing = false;
        return "";
      }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${coordinates[0].toFixed(2)},${coordinates[1].toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
  return { height: CHART_HEIGHT, line, point, points };
}

function costChartMarkup(values, selectedIndex) {
  const availableValues = values.filter(Number.isFinite);
  if (!availableValues.length) return "";
  const maximum = Math.max(...availableValues);
  const { height, line, point, points } = chartCoordinates(values, maximum);
  const firstPoint = points.find(Boolean);
  const lastPoint = points.findLast(Boolean);
  const area = `${line} L${lastPoint[0].toFixed(2)},${height} L${firstPoint[0].toFixed(2)},${height} Z`;
  const selectedValue = values[selectedIndex];
  const marker = Number.isFinite(selectedValue) ? point(selectedValue, selectedIndex) : null;
  return `
    <path class="chart-area-cost" d="${area}"></path>
    <path class="chart-line-cost" d="${line}"></path>
    ${marker ? `<circle class="chart-marker cost-marker" cx="${marker[0]}" cy="${marker[1]}" r="7"></circle>` : ""}
    <g class="chart-inspection" data-chart-inspection hidden aria-hidden="true">
      <line class="chart-inspection-guide" x1="0" y1="${CHART_PADDING}" x2="0" y2="${CHART_HEIGHT - CHART_PADDING}"></line>
      <circle class="chart-inspection-marker cost-inspection-marker" cx="0" cy="0" r="6"></circle>
    </g>
  `;
}

function rewardChartMarkup(series, selectedIndex, maximum) {
  const availableValues = series.flatMap(({ values }) => values.filter(Number.isFinite));
  if (!availableValues.length) return "";
  const lines = series
    .map(({ position, values }) => {
      const { line, point } = chartCoordinates(values, maximum);
      const selectedValue = values[selectedIndex];
      const marker = Number.isFinite(selectedValue) ? point(selectedValue, selectedIndex) : null;
      return `
        <path class="chart-line-reward reward-position-${position}" d="${line}"></path>
        ${marker ? `<circle class="chart-marker reward-marker reward-position-${position}" cx="${marker[0]}" cy="${marker[1]}" r="5"></circle>` : ""}
      `;
    })
    .join("");
  const inspectionMarkers = series
    .map(({ position }) =>
      `<circle class="chart-inspection-marker reward-inspection-marker reward-position-${position}" data-position="${position}" cx="0" cy="0" r="5"></circle>`,
    )
    .join("");
  return `${lines}
    <g class="chart-inspection" data-chart-inspection hidden aria-hidden="true">
      <line class="chart-inspection-guide" x1="0" y1="${CHART_PADDING}" x2="0" y2="${CHART_HEIGHT - CHART_PADDING}"></line>
      ${inspectionMarkers}
    </g>
  `;
}

function chartIndexAtClientX(svg, clientX, valueCount) {
  const bounds = svg.getBoundingClientRect();
  const svgX = ((clientX - bounds.left) / bounds.width) * CHART_WIDTH;
  const plotRatio = (svgX - CHART_PADDING) / (CHART_WIDTH - CHART_PADDING * 2);
  return Math.round(Math.min(1, Math.max(0, plotRatio)) * (valueCount - 1));
}

function setTooltipContent(tooltip, title, entries) {
  const heading = document.createElement("strong");
  heading.className = "chart-tooltip-title";
  heading.textContent = title;
  const values = document.createElement("span");
  values.className = "chart-tooltip-values";
  for (const { label, value, position } of entries) {
    const row = document.createElement("span");
    row.className = position ? `series-position-${position}` : "";
    if (position) {
      const swatch = document.createElement("i");
      swatch.setAttribute("aria-hidden", "true");
      row.append(swatch);
    }
    const name = document.createElement("span");
    name.textContent = label;
    const amount = document.createElement("b");
    amount.textContent = value;
    row.append(name, amount);
    values.append(row);
  }
  tooltip.replaceChildren(heading, values);
}

function positionTooltip(tooltip, clientX, clientY) {
  const gap = 14;
  const viewportPadding = 8;
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  tooltip.hidden = false;
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const bounds = tooltip.getBoundingClientRect();
  let left = clientX + gap;
  if (left + bounds.width > viewportRight - viewportPadding) {
    left = clientX - gap - bounds.width;
  }
  left = Math.min(
    viewportRight - bounds.width - viewportPadding,
    Math.max(viewportLeft + viewportPadding, left),
  );
  let top = clientY - gap - bounds.height;
  if (top < viewportTop + viewportPadding) top = clientY + gap;
  top = Math.min(
    viewportBottom - bounds.height - viewportPadding,
    Math.max(viewportTop + viewportPadding, top),
  );
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function chartClientPoint(svg, coordinates) {
  const bounds = svg.getBoundingClientRect();
  return {
    clientX: bounds.left + (coordinates[0] / CHART_WIDTH) * bounds.width,
    clientY: bounds.top + (coordinates[1] / CHART_HEIGHT) * bounds.height,
  };
}

function hideChartInspection(kind, force = false) {
  const interaction = chartInteraction[kind];
  if (interaction.pinned && !force) return;
  interaction.index = null;
  interaction.pinned = false;
  elements[`${kind}-chart`].querySelector("[data-chart-inspection]")?.setAttribute("hidden", "");
  elements[`${kind}-chart-tooltip`].hidden = true;
}

function showChartInspection(kind, index, pointer) {
  const data = chartData[kind];
  const svg = elements[`${kind}-chart`];
  const tooltip = elements[`${kind}-chart-tooltip`];
  const inspection = svg.querySelector("[data-chart-inspection]");
  if (!data || !inspection) return;

  const guide = inspection.querySelector(".chart-inspection-guide");
  let anchor;
  if (kind === "cost") {
    const availableValues = data.values.filter(Number.isFinite);
    const maximum = Math.max(...availableValues);
    const value = data.values[index];
    if (!Number.isFinite(value)) return;
    const coordinates = chartCoordinates(data.values, maximum).point(value, index);
    guide.setAttribute("x1", coordinates[0]);
    guide.setAttribute("x2", coordinates[0]);
    const marker = inspection.querySelector(".chart-inspection-marker");
    marker.setAttribute("cx", coordinates[0]);
    marker.setAttribute("cy", coordinates[1]);
    setTooltipContent(tooltip, `Level ${index + 1}`, [
      {
        label: data.resource.label,
        value: `${formatNumber(value)} ${data.resource.unit}`,
      },
    ]);
    anchor = coordinates;
  } else {
    const availableValues = data.series.flatMap(({ values }) => values.filter(Number.isFinite));
    if (!availableValues.length) return;
    const maximum = data.maximum;
    const coordinates = [];
    const entries = [];
    for (const { position, values } of data.series) {
      const marker = inspection.querySelector(`[data-position="${position}"]`);
      const value = values[index];
      if (Number.isFinite(value)) {
        const point = chartCoordinates(values, maximum).point(value, index);
        marker.removeAttribute("hidden");
        marker.setAttribute("cx", point[0]);
        marker.setAttribute("cy", point[1]);
        coordinates.push(point);
      } else {
        marker.setAttribute("hidden", "");
      }
      entries.push({
        label: `P${position}`,
        value: Number.isFinite(value) ? `${formatNumber(value)} ${data.resource.unit}` : "—",
        position,
      });
    }
    if (!coordinates.length) return;
    guide.setAttribute("x1", coordinates[0][0]);
    guide.setAttribute("x2", coordinates[0][0]);
    setTooltipContent(tooltip, `Level ${index + 1} · ${data.viewLabel} rewards`, entries);
    anchor = [coordinates[0][0], Math.min(...coordinates.map((point) => point[1]))];
  }

  inspection.removeAttribute("hidden");
  chartInteraction[kind].index = index;
  const clientPoint = pointer ?? chartClientPoint(svg, anchor);
  positionTooltip(tooltip, clientPoint.clientX, clientPoint.clientY);
}

function setupChartInteractions(kind) {
  const svg = elements[`${kind}-chart`];
  const valueCount = () => kind === "cost"
    ? chartData.cost?.values.length
    : chartData.reward?.series[0]?.values.length;
  const inspectPointer = (event) => {
    const count = valueCount();
    if (!count) return;
    showChartInspection(
      kind,
      chartIndexAtClientX(svg, event.clientX, count),
      { clientX: event.clientX, clientY: event.clientY },
    );
  };

  svg.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || chartInteraction[kind].pinned) return;
    inspectPointer(event);
  });
  svg.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    hideChartInspection(kind === "cost" ? "reward" : "cost", true);
    chartInteraction[kind].pinned = true;
    inspectPointer(event);
  });
  svg.addEventListener("pointerleave", () => hideChartInspection(kind));
  svg.addEventListener("pointercancel", () => hideChartInspection(kind));
  svg.addEventListener("focus", () => {
    if (chartInteraction[kind].index === null) {
      showChartInspection(kind, selectedLevel() - 1);
    }
  });
  svg.addEventListener("blur", () => hideChartInspection(kind, true));
  svg.addEventListener("keydown", (event) => {
    const count = valueCount();
    if (!count || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let index = chartInteraction[kind].index ?? selectedLevel() - 1;
    if (event.key === "ArrowLeft") index = Math.max(0, index - 1);
    if (event.key === "ArrowRight") index = Math.min(count - 1, index + 1);
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = count - 1;
    showChartInspection(kind, index);
  });
}

function renderChartControls(container, options, selectedId) {
  const controls = document.createDocumentFragment();
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.chartResource = option.id;
    button.className = option.id === selectedId ? "is-active" : "";
    button.setAttribute("aria-pressed", option.id === selectedId ? "true" : "false");
    button.textContent = CHART_RESOURCES[option.id]?.shortLabel ?? humanizeResource(option.id);
    controls.append(button);
  }
  container.replaceChildren(controls);
}

function renderRewardViewToggle() {
  for (const button of elements["reward-chart-view-toggle"].querySelectorAll("button")) {
    const isSelected = button.dataset.rewardView === selectedRewardView;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }
}

function renderCharts(rows, selectedIndex) {
  hideChartInspection("cost", true);
  hideChartInspection("reward", true);
  const costSeries = buildUpgradeCostSeries(rows);
  if (!costSeries.some(({ id }) => id === selectedCostSeriesId)) {
    selectedCostSeriesId = "forgePoints";
  }
  const selectedCostSeries = costSeries.find(({ id }) => id === selectedCostSeriesId);
  const costResource = CHART_RESOURCES[selectedCostSeries.id] ?? {
    shortLabel: humanizeResource(selectedCostSeries.id),
    label: humanizeResource(selectedCostSeries.id),
    unit: humanizeResource(selectedCostSeries.id),
  };
  chartData.cost = {
    values: selectedCostSeries.values,
    resource: costResource,
  };
  renderChartControls(elements["cost-chart-controls"], costSeries, selectedCostSeriesId);
  elements["cost-chart-label"].textContent = `Upgrade cost · ${costResource.label}`;
  elements["cost-chart"].innerHTML = costChartMarkup(selectedCostSeries.values, selectedIndex);
  elements["cost-chart"].setAttribute(
    "aria-label",
    `${costResource.label} upgrade cost by target level`,
  );
  const selectedCost = selectedCostSeries.values[selectedIndex];
  elements["chart-cost-max"].textContent =
    `Level ${selectedIndex + 1}: ${formatNumber(selectedCost)} ${costResource.unit}`;
  elements["cost-chart-note"].textContent = costSeries.length > 1
    ? "Choose a resource to compare its cost across levels. Blueprints are listed in Unlock costs."
    : "Only FP costs are plotted here. Blueprint requirements are listed in Unlock costs.";

  const rewardOptions = ["forgePoints", "medals", "blueprints"].map((id) => ({ id }));
  renderChartControls(elements["reward-chart-controls"], rewardOptions, selectedRewardResource);
  renderRewardViewToggle();
  const rewardResource = CHART_RESOURCES[selectedRewardResource];
  const rewardViewLabel = selectedRewardView === "boosted" ? "Arc-boosted" : "Base";
  const baseSeries = buildRewardSeries(rows, selectedRewardResource, "base");
  const boostedSeries = buildRewardSeries(rows, selectedRewardResource, "adjusted");
  const rewardSeries = selectedRewardView === "boosted" ? boostedSeries : baseSeries;
  // Both views use the same zero-based range, including selected and hover markers.
  const rewardMaximum = Math.max(1, ...[...baseSeries, ...boostedSeries]
    .flatMap(({ values }) => values.filter(Number.isFinite)));
  chartData.reward = {
    series: rewardSeries,
    maximum: rewardMaximum,
    resource: rewardResource,
    viewLabel: rewardViewLabel,
  };
  elements["reward-chart-label"].textContent = `${rewardViewLabel} rewards · ${rewardResource.label}`;
  elements["reward-chart"].innerHTML = rewardChartMarkup(rewardSeries, selectedIndex, rewardMaximum);
  elements["reward-chart"].setAttribute(
    "aria-label",
    `${rewardViewLabel} ${rewardResource.label} rewards for positions one through five by target level`,
  );
  const legend = document.createDocumentFragment();
  for (const { position, values } of rewardSeries) {
    const item = document.createElement("span");
    item.className = `series-position-${position}`;
    const swatch = document.createElement("i");
    swatch.setAttribute("aria-hidden", "true");
    const value = document.createElement("span");
    value.textContent = `P${position} ${Number.isFinite(values[selectedIndex]) ? formatNumber(values[selectedIndex]) : "—"}`;
    item.append(swatch, value);
    legend.append(item);
  }
  elements["reward-chart-legend"].replaceChildren(legend);
  elements["reward-chart-note"].textContent =
    `${rewardViewLabel} rewards at level ${selectedIndex + 1}${
      selectedRewardView === "boosted"
        ? `, with your ${selectedArcBonus()}% Arc bonus.`
        : ", before the Arc bonus."
    }${
      isDirectCapturedRewardLevel(selectedBuilding().eraId, selectedIndex + 1)
        ? " Recorded in-game."
        : selectedRewardResource === "forgePoints" &&
            isExactFpRewardLevel(selectedBuilding().eraId, selectedIndex + 1)
          ? " FP reward confirmed."
        : ""
    }`;
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  row.append(cell);
}

function selectedRageBeginningLevel() {
  return Math.round(
    clampNumber(elements["rage-start-level"].value, 1, dataset.maxLevel, 1),
  );
}

function selectedRageTargetLevel() {
  return Math.round(
    clampNumber(elements["rage-target-level"].value, 1, dataset.maxLevel, 101),
  );
}

function selectedRageArcLevels() {
  return Array.from({ length: 5 }, (_, position) =>
    Math.round(
      clampNumber(
        elements[`rage-arc-p${position + 1}`].value,
        0,
        180,
        DEFAULT_RAGE_ARC_LEVELS[position],
      ),
    ),
  );
}

function selectedRageArcBonuses() {
  return selectedRageArcLevels().map(arcBonusForLevel);
}

function formatArcBonus(bonus) {
  return Number.isInteger(bonus) ? String(bonus) : bonus.toFixed(1);
}

function formatArcMultiplier(bonus) {
  return (1 + bonus / 100).toFixed(Number.isInteger(bonus) ? 2 : 3);
}

function renderRageArcBonusValues() {
  selectedRageArcLevels().forEach((level, position) => {
    const bonus = arcBonusForLevel(level);
    elements[`rage-arc-p${position + 1}-bonus`].textContent =
      `${formatArcBonus(bonus)}% bonus · ${formatArcMultiplier(bonus)}×`;
  });
}

function renderRageTable(selectedTargetLevel, rewardCoverage) {
  const beginningLevel = selectedRageBeginningLevel();
  const targetLevel = selectedRageTargetLevel();
  const arcLevels = selectedRageArcLevels();
  const arcBonuses = selectedRageArcBonuses();
  elements["rage-start-level"].value = beginningLevel;
  elements["rage-target-level"].value = targetLevel;
  arcLevels.forEach((level, position) => {
    elements[`rage-arc-p${position + 1}`].value = level;
  });
  renderRageArcBonusValues();

  currentRageAnalysis = buildRageAnalysis(
    currentRows,
    beginningLevel,
    targetLevel,
    arcBonuses,
  );
  const specialResourceKeys = [
    ...new Set(
      currentRageAnalysis.rows.flatMap((row) => Object.keys(row.specialResources)),
    ),
  ].sort((left, right) => humanizeResource(left).localeCompare(humanizeResource(right)));
  const buildingBenefits = selectedBuilding().benefits ?? [];

  const columnGroups = [
    {
      columns: [
        {
          key: "level",
          label: "Level",
          alwaysVisible: true,
          className: "rage-sticky-column",
          value: (row) => row.targetLevel,
        },
      ],
    },
    {
      key: "unlockingCosts",
      label: "Unlock costs",
      columns: [
        { key: "goodsPerType", label: "Goods per type", value: (row) => row.goodsPerType },
        { key: "goods", label: "All goods", value: (row) => row.goods },
        { key: "money", label: "Coins", value: (row) => row.money },
        { key: "supplies", label: "Supplies", value: (row) => row.supplies },
        { key: "medals", label: "Medals", value: (row) => row.medals },
        ...specialResourceKeys.map((resource) => ({
          key: `specialResource:${resource}`,
          label: humanizeResource(resource),
          value: (row) => row.specialResources[resource] ?? 0,
          total: currentRageAnalysis.totals.specialResources[resource] ?? 0,
        })),
      ],
    },
    {
      key: "benefits",
      label: "Building benefits",
      columns: buildingBenefits.map((benefit) => {
        const definition = benefitDefinition(benefit.key);
        return {
          key: `benefit:${benefit.key}`,
          label: definition.label,
          value: (row) => row.benefits.find(({ key }) => key === benefit.key)?.value,
          format: (value, row) => {
            const rowBenefit = row.benefits.find(({ key }) => key === benefit.key);
            return formatBenefitValue(benefit.key, value, rowBenefit?.attempts);
          },
          summable: false,
        };
      }),
    },
    {
      columns: [
        {
          key: "ownerForgePoints",
          label: "Owner's FP cost",
          className: "owner-cell",
          value: (row) => row.ownerForgePoints,
        },
      ],
    },
    {
      label: "Contributor FP",
      columns: arcBonuses.map((bonus, position) => ({
        key: `position${position + 1}`,
        label: `P${position + 1} @ ${formatArcMultiplier(bonus)}×`,
        className: "contribution-cell",
        value: (row) => row.contributions[position],
        total: currentRageAnalysis.totals.contributions[position],
      })),
    },
    {
      columns: [
        {
          key: "upgradeForgePoints",
          label: "Total FP cost",
          alwaysVisible: true,
          value: (row) => row.upgradeForgePoints,
        },
      ],
    },
  ];
  const availableGroups = columnGroups
    .map((group) => ({
      ...group,
      columns: group.columns.filter((column) =>
        column.alwaysVisible || currentRageAnalysis.rows.some((row) => {
          const value = column.value(row);
          return Number.isFinite(value) && value !== 0;
        }),
      ),
    }))
    .filter((group) => group.columns.length);
  const unlockingGroup = availableGroups.find((group) => group.key === "unlockingCosts");
  const hasUnlockingCosts = Boolean(unlockingGroup?.columns.length);
  elements["rage-unlock-toggle"].disabled = !hasUnlockingCosts;
  elements["rage-unlock-toggle"].setAttribute(
    "aria-checked",
    String(hasUnlockingCosts && rageUnlockCostsExpanded),
  );
  elements["rage-unlock-toggle-label"].textContent = hasUnlockingCosts
    ? "Unlock costs"
    : "No unlock costs";
  elements["rage-unlock-toggle"].title = hasUnlockingCosts
    ? `${rageUnlockCostsExpanded ? "Hide" : "Show"} unlock cost columns`
    : "No unlock costs in this level range";
  const benefitGroup = availableGroups.find((group) => group.key === "benefits");
  const hasBenefits = Boolean(benefitGroup?.columns.length);
  elements["rage-benefit-toggle"].disabled = !hasBenefits;
  elements["rage-benefit-toggle"].setAttribute(
    "aria-checked",
    String(hasBenefits && rageBenefitsExpanded),
  );
  elements["rage-benefit-toggle-label"].textContent = hasBenefits
    ? "Benefits"
    : "No benefit data";
  elements["rage-benefit-toggle"].title = hasBenefits
    ? `${rageBenefitsExpanded ? "Hide" : "Show"} building benefit columns`
    : "No benefit data for this level range";
  const visibleGroups = availableGroups.filter(
    (group) =>
      (group.key !== "unlockingCosts" || rageUnlockCostsExpanded) &&
      (group.key !== "benefits" || rageBenefitsExpanded),
  );
  const visibleColumns = visibleGroups.flatMap((group) => group.columns);

  const primaryHeaderRow = document.createElement("tr");
  const secondaryHeaderRow = document.createElement("tr");
  for (const group of visibleGroups) {
    if (group.label) {
      const groupHeading = document.createElement("th");
      groupHeading.colSpan = group.columns.length;
      groupHeading.scope = "colgroup";
      groupHeading.className = "rage-group-heading";
      groupHeading.textContent = group.label;
      primaryHeaderRow.append(groupHeading);
      for (const column of group.columns) {
        const heading = document.createElement("th");
        heading.scope = "col";
        heading.textContent = column.label;
        secondaryHeaderRow.append(heading);
      }
    } else {
      for (const column of group.columns) {
        const heading = document.createElement("th");
        heading.rowSpan = 2;
        heading.scope = "col";
        heading.textContent = column.label;
        if (column.className) heading.className = column.className;
        primaryHeaderRow.append(heading);
      }
    }
  }
  elements["rage-table-head"].replaceChildren(primaryHeaderRow, secondaryHeaderRow);
  elements["rage-table"].style.minWidth = `${Math.max(720, visibleColumns.length * 112)}px`;

  const body = document.createDocumentFragment();
  for (const rowData of currentRageAnalysis.rows) {
    const row = document.createElement("tr");
    row.dataset.level = rowData.targetLevel;
    if (rowData.targetLevel === selectedTargetLevel) row.className = "is-selected";
    for (const column of visibleColumns) {
      const value = column.value(rowData);
      appendCell(
        row,
        column.format
          ? column.format(value, rowData)
          : Number.isFinite(value)
            ? formatNumber(value)
            : "—",
        column.className ?? "",
      );
    }
    body.append(row);
  }
  elements["rage-body"].replaceChildren(body);

  const totalRow = document.createElement("tr");
  totalRow.className = "rage-total-row";
  for (const column of visibleColumns) {
    if (column.key === "level") {
      const totalLabel = document.createElement("th");
      totalLabel.scope = "row";
      totalLabel.className = "rage-sticky-column";
      totalLabel.textContent = "Plan total";
      totalRow.append(totalLabel);
      continue;
    }
    const total = column.total ?? currentRageAnalysis.totals[column.key];
    appendCell(
      totalRow,
      column.summable === false || !Number.isFinite(total) ? "—" : formatNumber(total),
      column.className ?? "",
    );
  }
  elements["rage-total-foot"].replaceChildren(totalRow);

  const warning = elements["rage-coverage-warning"];
  const exactCoverage = dataset.coverage.exactContributorRewardsThroughLevel ?? rewardCoverage;
  warning.hidden = targetLevel <= exactCoverage;
  if (warning.hidden) {
    warning.textContent = "";
  } else if (targetLevel <= rewardCoverage) {
    const firstLaterLevel = Math.max(beginningLevel, exactCoverage + 1);
    const laterLevelCount = targetLevel - firstLaterLevel + 1;
    let exactFpCount = 0;
    let exactMedalCount = 0;
    for (let level = firstLaterLevel; level <= targetLevel; level += 1) {
      if (isExactFpRewardLevel(selectedBuilding().eraId, level)) exactFpCount += 1;
      if (isExactMedalRewardLevel(selectedBuilding().eraId, level)) exactMedalCount += 1;
    }
    const fpNote = exactFpCount === laterLevelCount
      ? " FP rewards are confirmed for every level in this range."
      : exactFpCount > 0
        ? ` FP rewards are confirmed at ${exactFpCount} of those ${laterLevelCount} levels; the rest are estimates.`
        : " FP rewards in this range are estimates.";
    const medalNote = exactMedalCount === laterLevelCount
      ? " Medal rewards are confirmed for every level in this range."
      : exactMedalCount > 0
        ? ` Medal rewards are confirmed at ${exactMedalCount} of those ${laterLevelCount} levels; the rest are estimates.`
        : " Medal rewards in this range are estimates.";
    warning.textContent = `Blueprint rewards from level ${firstLaterLevel} onward are estimates based on known reward patterns.${fpNote}${medalNote}`;
  } else {
    warning.textContent = `FP reward data ends at level ${rewardCoverage}. For later levels, the owner's FP cost includes the entire level cost because contributions are unknown.`;
  }
  requestAnimationFrame(updateTableScrollHints);
}

function updateTableScrollHints() {
  for (const kind of ["reward", "rage"]) {
    const wrapper = elements[`${kind}-table-wrap`];
    const hint = elements[`${kind}-table-scroll-hint`];
    hint.hidden = wrapper.scrollWidth <= wrapper.clientWidth + 1;
  }
}

function render() {
  const building = selectedBuilding();
  const targetLevel = selectedLevel();
  const arcBonus = selectedArcBonus();
  elements["level-input"].value = targetLevel;
  updateLevelRange(targetLevel);
  elements["arc-input"].value = arcBonus;

  const p1ByLevel = dataset.rewardP1ByEra[String(building.eraId)];
  currentRewardCoverage = p1ByLevel.length;
  const rewardTables = {
    fpP1ByLevel: p1ByLevel,
    medalP1ByLevel: dataset.medalP1ByEra[String(building.eraId)],
    blueprintsByLevel: dataset.blueprintsByLevel,
  };
  currentRows = buildLevelRows(building, rewardTables, arcBonus, dataset.maxLevel);
  const selectedRow = currentRows[targetLevel - 1];
  renderBuildingHeading(building);
  renderRewards(building, selectedRow, arcBonus);
  renderUnlockCosts(selectedRow);
  renderGoods(building);
  renderCharts(currentRows, targetLevel - 1);
  renderRageTable(targetLevel, currentRewardCoverage);
  requestAnimationFrame(updateTableScrollHints);
}

function downloadRageCsv() {
  const building = selectedBuilding();
  const beginningLevel = selectedRageBeginningLevel();
  const targetLevel = selectedRageTargetLevel();
  const arcLevels = selectedRageArcLevels();
  const arcBonuses = selectedRageArcBonuses();
  const csv = buildRageCsv({
    building,
    era: dataset.eraNames[String(building.eraId)],
    analysis: currentRageAnalysis,
    arcLevels,
    arcBonuses,
    coverageNote: elements["rage-coverage-warning"].textContent,
  });
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${building.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-rage-${beginningLevel}-${targetLevel}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function updateRageLevels(changedField) {
  let beginningLevel = selectedRageBeginningLevel();
  let targetLevel = selectedRageTargetLevel();
  if (beginningLevel > targetLevel) {
    if (changedField === "beginning") targetLevel = beginningLevel;
    else beginningLevel = targetLevel;
  }
  elements["rage-start-level"].value = beginningLevel;
  elements["rage-target-level"].value = targetLevel;
  renderRageTable(selectedLevel(), currentRewardCoverage);
  scheduleInputStateSave();
}

function setTargetLevel(value) {
  const level = Math.round(clampNumber(value, 1, dataset.maxLevel, 80));
  elements["level-input"].value = level;
  updateLevelRange(level);
  render();
  scheduleInputStateSave();
}

async function initialize() {
  const [datasetResponse, benefitResponse] = await Promise.all([
    fetch("data/gb-analysis.json"),
    fetch("data/gb-benefits-source.json"),
  ]);
  if (!datasetResponse.ok) {
    throw new Error(`Dataset request failed: ${datasetResponse.status}`);
  }
  if (!benefitResponse.ok) {
    throw new Error(`Benefit dataset request failed: ${benefitResponse.status}`);
  }
  dataset = await datasetResponse.json();
  const benefitDataset = await benefitResponse.json();
  for (const building of dataset.buildings) {
    const benefits = benefitDataset.buildings?.[building.id]?.benefits;
    if (
      !Array.isArray(benefits) ||
      benefits.length === 0 ||
      benefits.some(
        (benefit) => benefit.values?.length < dataset.maxLevel ||
          (benefit.attempts && benefit.attempts.length < dataset.maxLevel),
      )
    ) {
      throw new Error(`Benefit coverage is incomplete for ${building.name}`);
    }
    building.benefits = benefits;
  }
  populateBuildingSelect();
  applyInputState(await loadInputState());

  elements["building-select"].addEventListener("change", () => {
    render();
    scheduleInputStateSave();
  });
  elements["level-input"].addEventListener("change", (event) => setTargetLevel(event.target.value));
  elements["level-range"].addEventListener("input", (event) => setTargetLevel(event.target.value));
  elements["arc-input"].addEventListener("change", () => {
    render();
    scheduleInputStateSave();
  });
  elements["cost-chart-controls"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chart-resource]");
    if (!button) return;
    selectedCostSeriesId = button.dataset.chartResource;
    renderCharts(currentRows, selectedLevel() - 1);
    scheduleInputStateSave();
  });
  elements["reward-chart-controls"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-chart-resource]");
    if (!button) return;
    selectedRewardResource = button.dataset.chartResource;
    renderCharts(currentRows, selectedLevel() - 1);
    scheduleInputStateSave();
  });
  elements["reward-chart-view-toggle"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-reward-view]");
    if (!button) return;
    selectedRewardView = button.dataset.rewardView;
    renderCharts(currentRows, selectedLevel() - 1);
    scheduleInputStateSave();
  });
  elements["rage-start-level"].addEventListener("change", () =>
    updateRageLevels("beginning"),
  );
  elements["rage-target-level"].addEventListener("change", () =>
    updateRageLevels("target"),
  );
  for (let position = 1; position <= 5; position += 1) {
    elements[`rage-arc-p${position}`].addEventListener("input", () => {
      renderRageArcBonusValues();
    });
    elements[`rage-arc-p${position}`].addEventListener("change", () => {
      renderRageTable(selectedLevel(), currentRewardCoverage);
      scheduleInputStateSave();
    });
  }
  document.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("input", scheduleInputStateSave);
  });
  elements["rage-body"].addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-level]");
    if (row) setTargetLevel(row.dataset.level);
  });
  elements["rage-download-button"].addEventListener("click", downloadRageCsv);
  elements["rage-unlock-toggle"].addEventListener("click", () => {
    if (elements["rage-unlock-toggle"].disabled) return;
    rageUnlockCostsExpanded = !rageUnlockCostsExpanded;
    renderRageTable(selectedLevel(), currentRewardCoverage);
    scheduleInputStateSave();
  });
  elements["rage-benefit-toggle"].addEventListener("click", () => {
    if (elements["rage-benefit-toggle"].disabled) return;
    rageBenefitsExpanded = !rageBenefitsExpanded;
    renderRageTable(selectedLevel(), currentRewardCoverage);
    scheduleInputStateSave();
  });
  elements["theme-toggle"].addEventListener("click", toggleTheme);
  setupChartInteractions("cost");
  setupChartInteractions("reward");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") document.body.classList.add("keyboard-navigation");
  });
  document.addEventListener(
    "pointerdown",
    () => document.body.classList.remove("keyboard-navigation"),
    true,
  );
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".chart-plot")) return;
    hideChartInspection("cost", true);
    hideChartInspection("reward", true);
  });
  window.addEventListener("resize", updateTableScrollHints);
  window.addEventListener("pagehide", () => {
    clearTimeout(inputStateSaveTimeout);
    const state = collectInputState();
    saveInputStateLocally(state);
    navigator.sendBeacon?.(
      INPUT_STATE_ENDPOINT,
      new Blob([JSON.stringify(state)], { type: "application/json" }),
    );
  });
  renderThemeToggle();
  render();
  scheduleInputStateSave();
}

initialize().catch((error) => {
  console.error(error);
  elements["building-name"].textContent = "We couldn’t load the building data";
  elements["building-era"].textContent = "Refresh to try again. For a local copy, check that the server is running.";
});
