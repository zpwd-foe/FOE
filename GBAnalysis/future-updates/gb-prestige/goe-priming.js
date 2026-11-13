/* GOE funding rules are separate from the general prestige explorer. */
(() => {
  'use strict';
  const guildBonusTypes = new Set(['clan_goods', 'clan_goods_extended']);
  const validFP = value => Number.isSafeInteger(value) && value >= 0;

  // Current reward shares: InnoGames support article 7011. Exact rank ratios
  // come from the source workbook; its MROUND(..., 5) reward cells are obsolete.
  function baseRewards(total, level, gold) {
    const poolPercent = level < 10 ? 25 : level < 40 ? 30 : level < 70 ? 40
      : level <= 100 ? 25 : level <= 200 ? 15 : 10;
    const weights = gold ? [5040, 2520, 840, 210, 42, 7, 1] : [120, 60, 20, 5, 1];
    const denominator = 100 * weights.reduce((sum, value) => sum + value, 0);
    // Round the unboosted reward once, to a whole FP, before applying GOE's rate.
    return weights.map(weight => Math.floor((total * poolPercent * weight + denominator / 2) / denominator));
  }

  function postingThread(result) {
    if (result.status !== 'ready') return null;
    if (result.guildGoods) return { name: '✨Treasury Bldg, 2.0 Copper /1.2 Gold', location: 'Guild tab' };
    return { name: result.tier === 'Gold'
      ? '⚔️GoE & Friends Gold Tier 110 🟡'
      : '⚔️GoE & Friends Copper Tier 190 🟠', location: 'Social tab' };
  }

  function producesGuildGoods(building, level, boosts) {
    return building.rows.some(row => (row.tier !== 'Gold' || (building.gold && level >= 101))
      && boosts[row.boost]?.bonus_types?.some(type => guildBonusTypes.has(type)));
  }

  function calculate(building, level, boosts) {
    const maxLevel = building.levelData.length;
    if (!Number.isInteger(level) || level < 1 || level > maxLevel) {
      return { status: 'invalid-level', maxLevel };
    }
    const gold = building.gold && level >= 101;
    const guildGoods = producesGuildGoods(building, level, boosts);
    const rateTenths = gold ? (guildGoods ? 12 : 11) : (guildGoods ? 20 : 19);
    const positions = gold ? 7 : 5;
    const record = building.levelData[level - 1];
    const total = record?.[0];
    const rules = { level, tier: gold ? 'Gold' : 'Copper', guildGoods, rate: rateTenths / 10, positions };
    if (!validFP(total)) return { ...rules, status: 'missing-data' };
    const rewards = baseRewards(total, level, gold);
    // Integer tenths avoid floating-point errors at exact half-FP boundaries.
    // CF 102 confirms 2 FP for an FP-paying slot; zero-reward slots use 1 FP.
    const contributions = rewards.map(reward => reward === 0 ? 1
      : Math.max(2, Math.floor((reward * rateTenths + 5) / 10)));
    const contributionTotal = contributions.reduce((sum, value) => sum + value, 0);
    const finalFP = contributions[positions - 1];
    const priming = total - contributionTotal - finalFP;
    if (priming < 0) return { ...rules, status: 'overfunded' };
    return { ...rules, status: 'ready', total, rewards, contributions, contributionTotal, priming, finalFP };
  }

  function promotion(player, building, result) {
    const name = player.trim().replace(/\s+/g, ' ');
    if (!name || result.status !== 'ready') return '';
    const positions = result.contributions.map((value, index) => `P${index + 1}(${value})`).reverse();
    return `${name} ${building.name} ${positions.join(' ')}`;
  }

  window.GOEPriming = { calculate, baseRewards, producesGuildGoods, promotion, postingThread };
})();
