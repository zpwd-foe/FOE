(function initializeBuildingRankingCategoryLabels(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FOE_BUILDING_RANKING_CATEGORY_LABELS = api;
})(typeof window !== "undefined" ? window : globalThis, function categoryLabelFactory() {
  "use strict";

  const EVENT_NAMES = {
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

  function eventCategoryParts(category) {
    return typeof category === "string"
      ? /^([A-Z]+) (\d{4}) Event Rewards$/.exec(category)
      : null;
  }

  function displayCategoryLabel(category) {
    if (typeof category !== "string") return "";
    const event = eventCategoryParts(category);
    if (!event) return category;
    const [, abbreviation, year] = event;
    return `${year} ${EVENT_NAMES[abbreviation] || abbreviation} Event Rewards`;
  }

  function sortedCategoryOptions(categories) {
    const events = categories.filter(eventCategoryParts).sort((left, right) => {
      const yearDifference = Number(eventCategoryParts(right)[2]) - Number(eventCategoryParts(left)[2]);
      if (yearDifference) return yearDifference;
      return displayCategoryLabel(left).localeCompare(displayCategoryLabel(right), undefined, { sensitivity: "base" })
        || left.localeCompare(right);
    });
    let eventIndex = 0;
    return categories.map((category) => eventCategoryParts(category) ? events[eventIndex++] : category);
  }

  return { displayCategoryLabel, sortedCategoryOptions };
});
