/* Local SVG plots: all supplied observations, with gaps kept open. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const compact = n => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  function element(name, attributes, parent, text) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text != null) node.textContent = text;
    parent.append(node); return node;
  }
  function ceiling(maximum) {
    if (maximum <= 0) return 1;
    const power = 10 ** Math.floor(Math.log10(maximum));
    return Math.ceil(maximum * 1.08 / power * 2) / 2 * power;
  }
  function mount(host, series, selection, callbacks) {
    let charts = [], current = selection;
    const draw = () => {
      charts = [];
      host.querySelectorAll('svg[data-series]').forEach(svg => {
        const spec = series[Number(svg.dataset.series)];
        const width = svg.getBoundingClientRect().width, height = spec.charges ? 126 : 164;
        if (width < 160) return;
        svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const left = 64, right = width - 14, top = 26, bottom = height - 38;
        const axisEnd = spec.values.length + 1;
        const x = level => left + 3 + (level - 1) / (axisEnd - 1) * (right - left - 6);
        const available = spec.values.filter(window.PrestigeCore.finite);
        const max = ceiling(available.length ? Math.max(...available) : 1);
        const y = value => bottom - 3 - value / max * (bottom - top - 7);
        element('title', {}, svg, spec.label);
        element('desc', {}, svg, `${available.length} supplied values. Blank values are not interpolated. Use the current and target level fields for keyboard selection.`);
        element('rect', { x: left, y: top, width: right-left, height: bottom-top, class: 'chart-frame' }, svg);
        let gapStart = null;
        for (let i = 0; i <= spec.values.length; i++) {
          const missing = i < spec.values.length && !window.PrestigeCore.finite(spec.values[i]);
          if (missing && gapStart === null) gapStart = i + 1;
          if (!missing && gapStart !== null) {
            const end = i, a = x(gapStart), b = x(end);
            element('rect', { x: a, y: top+1, width: Math.max(1,b-a), height: bottom-top-2, class: 'chart-gap' }, svg);
            if (b-a > 58) {
              const label = spec.tier === 'Gold' && end < 101 ? 'Locked' : 'Not supplied';
              const text = element('text', { x: (a+b)/2, y: (top+bottom)/2, 'text-anchor': 'middle', class: 'chart-gap-label' }, svg);
              if (label === 'Not supplied' && b-a < 100) {
                element('tspan', { x: (a+b)/2, dy: '-.4em' }, text, 'Not');
                element('tspan', { x: (a+b)/2, dy: '1.2em' }, text, 'supplied');
              } else text.textContent = label;
            }
            gapStart = null;
          }
        }
        for (const value of [0, max/2, max]) {
          element('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: 'chart-grid' }, svg);
          element('text', { x: left-8, y: y(value)+4, 'text-anchor': 'end' }, svg, compact(value));
        }
        const ticks = Array.from({length: Math.floor((axisEnd - 1) / 100) + 1}, (_, index) => 1 + index * 100);
        for (const level of ticks) element('text', { x: x(level), y: bottom+19, 'text-anchor': level === 1 ? 'start' : level === axisEnd ? 'end' : 'middle', 'data-level-tick': level }, svg, level);
        element('text', { x: left, y: 15, class: 'axis-title', 'data-axis': 'y' }, svg, spec.unit);
        element('text', { x: (left+right)/2, y: height-2, 'text-anchor': 'middle', class: 'axis-title', 'data-axis': 'x' }, svg, 'Building level');
        const color = spec.tier === 'Gold' ? 'var(--gold)' : 'var(--green)';
        for (const segment of window.PrestigeCore.segments(spec.values)) {
          const path = segment.map(([level, value], i) => i ? `H${x(level)}V${y(value)}` : `M${x(level)},${y(value)}`).join('');
          element('path', { d: path, stroke: color, class: 'chart-curve' }, svg);
        }
        const points = element('g', { 'data-all-points': '', 'aria-hidden': 'true' }, svg);
        spec.values.forEach((value, i) => {
          if (window.PrestigeCore.finite(value)) element('circle', { cx: x(i+1), cy: y(value), r: 1.2, fill: color }, points);
        });
        const from = element('line', { y1: top, y2: bottom, class: 'chart-current' }, svg);
        const target = element('line', { y1: top, y2: bottom, class: 'chart-target' }, svg);
        const marker = element('circle', { r: 4, fill: color, class: 'chart-selected-point' }, svg);
        const hover = element('line', { y1: top, y2: bottom, class: 'chart-hover', visibility: 'hidden' }, svg);
        const hit = element('rect', { x: left, y: top, width: right-left, height: bottom-top, fill: 'transparent', 'data-chart-hit': '' }, svg);
        charts.push({ svg, spec, x, y, from, target, marker, hover });
        const levelAt = event => window.PrestigeCore.clamp(1 + (event.clientX-svg.getBoundingClientRect().left-left-3)/(right-left-6)*(axisEnd-1), 1, spec.values.length);
        hit.addEventListener('pointermove', event => {
          if (event.pointerType === 'touch') return;
          const level = levelAt(event);
          for (const other of charts) {
            const px = other.x(level);
            other.hover.setAttribute('x1',px); other.hover.setAttribute('x2',px); other.hover.setAttribute('visibility','visible');
          }
          callbacks.hover(event, spec, level);
        });
        hit.addEventListener('pointerleave', event => {
          if (event.pointerType !== 'touch') { charts.forEach(c=>c.hover.setAttribute('visibility','hidden')); callbacks.leave(); }
        });
        hit.addEventListener('click', event => { const level=levelAt(event); callbacks.select(level); callbacks.hover(event,spec,level); });
      });
      update(current);
    };
    function update(selection) {
      current = selection;
      charts.forEach(c => {
        for (const [line, level] of [[c.from,Math.max(1,current.from)],[c.target,current.to]]) {
          line.setAttribute('x1',c.x(level)); line.setAttribute('x2',c.x(level));
        }
        c.from.setAttribute('visibility', current.from ? 'visible' : 'hidden');
        const value = c.spec.values[current.to-1];
        c.marker.setAttribute('visibility',window.PrestigeCore.finite(value)?'visible':'hidden');
        if (window.PrestigeCore.finite(value)) { c.marker.setAttribute('cx',c.x(current.to)); c.marker.setAttribute('cy',c.y(value)); }
      });
    }
    const resize = new ResizeObserver(draw); resize.observe(host); draw();
    return { update, destroy: () => resize.disconnect() };
  }
  window.PrestigeCharts = { mount };
})();
