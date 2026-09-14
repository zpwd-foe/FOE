const test = require("node:test");
const assert = require("node:assert/strict");
const { displayCategoryLabel, sortedCategoryOptions } = require("../src/category-labels.js");

test("puts the year first and expands requested event names", () => {
  const names = {
    ANNI: "Anniversary",
    ARTHUR: "Arthur",
    CARE: "Care for Tomorrow",
    CUP: "Soccer",
    FALL: "Fall",
    FELL: "Fellowship",
    HAL: "Halloween",
    HIS: "Viking",
    HISTORICALALLIESSTARTER: "Historical Allies Starter",
    ONBOARD: "Onboard",
    PAT: "St Patrick's",
    SUM: "Summer",
    WILD: "Wildlife",
    WIN: "Winter",
  };

  for (const [abbreviation, name] of Object.entries(names)) {
    assert.equal(
      displayCategoryLabel(`${abbreviation} 2025 Event Rewards`),
      `2025 ${name} Event Rewards`
    );
  }
});

test("keeps other category values readable without changing their identity", () => {
  assert.equal(displayCategoryLabel("BOWL 2026 Event Rewards"), "2026 BOWL Event Rewards");
  assert.equal(displayCategoryLabel("Cultural Settlement Rewards"), "Cultural Settlement Rewards");
  assert.equal(displayCategoryLabel("All Building Categories"), "All Building Categories");
});

test("sorts expanded event names alphabetically within descending years", () => {
  const categories = [
    "All Building Categories",
    "QI Rewards",
    "WIN 2026 Event Rewards",
    "HIS 2026 Event Rewards",
    "ONBOARD 2025 Event Rewards",
    "ANNI 2026 Event Rewards",
    "FALL 2026 Event Rewards",
    "ARTHUR 2026 Event Rewards",
    "HAL 2025 Event Rewards",
    "Other Buildings",
  ];

  assert.deepEqual(sortedCategoryOptions(categories), [
    "All Building Categories",
    "QI Rewards",
    "ANNI 2026 Event Rewards",
    "ARTHUR 2026 Event Rewards",
    "FALL 2026 Event Rewards",
    "HIS 2026 Event Rewards",
    "WIN 2026 Event Rewards",
    "HAL 2025 Event Rewards",
    "ONBOARD 2025 Event Rewards",
    "Other Buildings",
  ]);
  assert.equal(categories[2], "WIN 2026 Event Rewards");
});
