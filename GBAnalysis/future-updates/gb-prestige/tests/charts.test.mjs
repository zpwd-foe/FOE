import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

// Minimal SVG surface: run the real renderer without browser layout dependencies.
class Node {
  constructor(tag = 'svg') {
    this.tag = tag;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.events = {};
    this.classList = { toggle() {} };
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(node) { this.children.push(node); }
  replaceChildren() { this.children = []; }
  getBoundingClientRect() { return { width: 400, left: 0 }; }
  addEventListener(type, callback) { this.events[type] = callback; }
  removeEventListener(type) { delete this.events[type]; }
  querySelectorAll() { return this.children.filter(node => node.tag === 'svg'); }
}
const context = vm.createContext({ window: {},
  document: { createElementNS: (_, tag) => new Node(tag) },
  ResizeObserver: class { observe() {} disconnect() {} },
});
for (const file of ['core.js', 'charts.js']) {
  vm.runInContext(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), context);
}
const { mount, mountCosts, levelRange, levelTicks } = context.window.PrestigeCharts;
const all = node => node.children.flatMap(child => [child, ...all(child)]);
const marked = (node, attribute) => all(node).filter(child => attribute in child.attributes);
const styled = (node, name) => all(node).filter(child => (child.attributes.class || '').split(' ').includes(name));
const ticks = node => marked(node, 'data-level-tick').map(child => Number(child.attributes['data-level-tick']));
const callbacks = { select() {}, hover() {}, leave() {} };
const levels = Array.from({ length: 500 }, (_, i) => i + 1);
function boostChart(values, selection, row = { values, tier: 'Copper' }) {
  const host = new Node('div'), svg = new Node();
  svg.dataset.series = '0'; host.append(svg);
  const chart = mount(host, [{ values, row, tier: row.tier, label: 'Boost', unit: '%' }], selection, callbacks);
  return { svg, chart };
}

test('chart ranges cover both selected levels, including equal, reversed and boundary levels', () => {
  for (const [from, to, maximum, expected] of [
    [203, 220, 500, [203, 220]], [220, 203, 500, [203, 220]],
    [0, 1, 500, [1, 2]], [150, 150, 500, [149, 151]],
    [500, 500, 500, [499, 500]], [199, 200, 200, [199, 200]],
  ]) {
    const range = levelRange({ from, to }, maximum);
    assert.deepEqual([range.start, range.end], expected);
  }
});

test('narrow and wide ranges have readable integer ticks at both endpoints', () => {
  for (const [start, end] of [[1, 2], [203, 207], [203, 220], [50, 150], [1, 500]]) {
    const result = Array.from(levelTicks({ start, end }));
    assert.equal(result[0], start);
    assert.equal(result.at(-1), end);
    assert.ok(result.length >= 2 && result.length <= 5);
    assert.ok(result.every(Number.isInteger));
    assert.deepEqual(result, [...new Set(result)].sort((a, b) => a - b));
  }
});

test('boost charts zoom on mount and mutable selection updates; each GB stays independent', () => {
  const selection = { from: 203, to: 207 };
  const a = boostChart(levels, selection), b = boostChart(levels, { from: 50, to: 150 });
  assert.equal(marked(a.svg, 'data-all-points')[0].children.length, 5);
  assert.equal(ticks(a.svg)[0], 203);
  assert.equal(ticks(a.svg).at(-1), 207);
  selection.to = 250; a.chart.update(selection);
  assert.equal(marked(a.svg, 'data-all-points')[0].children.length, 48);
  assert.equal(ticks(a.svg).at(-1), 250);
  assert.equal(ticks(b.svg)[0], 50);
  assert.equal(ticks(b.svg).at(-1), 150);
  const current = styled(a.svg, 'chart-current')[0], target = styled(a.svg, 'chart-target')[0];
  assert.equal(Number(current.attributes.x1), 67);
  assert.equal(Number(target.attributes.x1), 383);
  selection.from = 0; selection.to = 1; a.chart.update(selection);
  assert.equal(styled(a.svg, 'chart-current')[0].attributes.visibility, 'hidden');
  a.chart.destroy(); b.chart.destroy();
});

test('zoomed boosts preserve retained values and internal gaps without inventing observations', () => {
  const retained = levels.map(level => level <= 200 ? 75 : null);
  const a = boostChart(retained, { from: 203, to: 220 });
  assert.equal(marked(a.svg, 'data-all-points')[0].children.length, 0);
  assert.equal(marked(a.svg, 'data-retained-from')[0].attributes['data-retained-from'], '200');
  assert.ok(!marked(a.svg, 'data-retained-from')[0].attributes.d.includes('NaN'));
  const gap = [...levels]; gap[204] = null;
  const b = boostChart(gap, { from: 203, to: 207 });
  assert.equal(styled(b.svg, 'chart-gap').length, 1);
  assert.equal(styled(b.svg, 'chart-curve').length, 2);
  assert.equal(marked(b.svg, 'data-retained-from').length, 0);
  a.chart.destroy(); b.chart.destroy();
});

test('cost charts share the selected range and leave missing costs blank', () => {
  const svg = new Node(), selection = { from: 250, to: 350 };
  const points = levels.map(level => ({ level, total: level <= 300 ? level * 100 : null,
    priming: level <= 300 ? level * 80 : null, multiplier: level >= 101 ? 1.2 : 1.9 }));
  const chart = mountCosts(svg, points, selection, callbacks);
  assert.equal(ticks(svg)[0], 250);
  assert.equal(ticks(svg).at(-1), 350);
  assert.equal(marked(svg, 'data-funding-point').length, 102);
  assert.equal(marked(svg, 'data-funding-boundary').length, 0);
  selection.from = 350; selection.to = 450; chart.update(selection);
  assert.equal(marked(svg, 'data-funding-point').length, 0);
  assert.equal(styled(svg, 'chart-curve').length, 0);
  assert.ok(styled(svg, 'chart-selected-point').every(node => node.attributes.visibility === 'hidden'));
  selection.from = 100; selection.to = 101; chart.update(selection);
  assert.deepEqual(ticks(svg), [100, 101]);
  assert.equal(marked(svg, 'data-funding-boundary').length, 1);
  assert.equal(marked(svg, 'data-funding-point').length, 4);
  assert.equal(styled(svg, 'funding-boundary-label')[0].attributes['text-anchor'], 'end');
  assert.equal(styled(svg, 'funding-boundary-label')[0].textContent, '101 · 1.2×');
  chart.destroy();
});

test('clicks map to zoomed levels and keyboard selections can expand beyond the range', () => {
  const svg = new Node(), selection = { from: 203, to: 220 };
  const points = levels.map(level => ({ level, total: level, priming: 0 }));
  let chart;
  chart = mountCosts(svg, points, selection, { ...callbacks, select(level) {
    selection.to = level; chart.update(selection);
  } });
  marked(svg, 'data-chart-hit')[0].events.click({ clientX: 225 });
  assert.equal(selection.to, 212);
  assert.equal(ticks(svg).at(-1), 212);
  svg.events.keydown({ key: 'End', preventDefault() {} });
  assert.equal(selection.to, 500);
  assert.equal(ticks(svg).at(-1), 500);
  assert.ok(marked(svg, 'data-cost-tick').some(node => node.attributes['data-cost-tick'] === '0'));
  chart.destroy();
});
