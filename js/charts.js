/* Dependency-free SVG charts: a line/area chart with hover and a donut chart. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /**
   * points: [{x: label string, y: number, y2?: number}]  (y = value, y2 = invested, optional)
   * opts: { format(n), formatX(label) }
   */
  function lineChart(container, points, opts) {
    container.innerHTML = '';
    const W = Math.max(container.clientWidth, 280);
    const H = Math.max(container.clientHeight, 200);
    const pad = { t: 12, r: 12, b: 26, l: 12 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
      'aria-label': 'Portfolio value over time' }, container);

    if (points.length < 2) {
      const t = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'chart-empty' }, svg);
      t.textContent = points.length
        ? 'Performance history builds up as you check in each day.'
        : 'No history yet — add holdings to start tracking.';
      return;
    }

    const ys = points.flatMap((p) => (p.y2 != null ? [p.y, p.y2] : [p.y]));
    let min = Math.min(...ys), max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    min -= span * 0.08; max += span * 0.08;

    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const X = (i) => pad.l + (i / (points.length - 1)) * iw;
    const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * ih;

    // gridlines
    for (let g = 0; g <= 3; g++) {
      const y = pad.t + (g / 3) * ih;
      el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'chart-grid' }, svg);
    }

    const up = points[points.length - 1].y >= points[0].y;
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    const area = `${line}L${X(points.length - 1).toFixed(1)},${pad.t + ih}L${X(0).toFixed(1)},${pad.t + ih}Z`;

    const gradId = 'g' + Math.random().toString(36).slice(2);
    const defs = el('defs', {}, svg);
    const grad = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', class: up ? 'stop-up' : 'stop-down', 'stop-opacity': 0.28 }, grad);
    el('stop', { offset: '100%', class: up ? 'stop-up' : 'stop-down', 'stop-opacity': 0 }, grad);

    el('path', { d: area, fill: `url(#${gradId})` }, svg);
    if (points.some((p) => p.y2 != null)) {
      const l2 = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y2 ?? p.y).toFixed(1)}`).join('');
      el('path', { d: l2, class: 'chart-line-cost' }, svg);
    }
    el('path', { d: line, class: `chart-line ${up ? 'up' : 'down'}` }, svg);

    // x-axis labels: first, middle, last
    const fx = opts.formatX || ((s) => s);
    [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach((i, k) => {
      const t = el('text', { x: X(i), y: H - 6, class: 'chart-axis',
        'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle' }, svg);
      t.textContent = fx(points[i].x);
    });

    // hover
    const cursor = el('line', { y1: pad.t, y2: pad.t + ih, class: 'chart-cursor', visibility: 'hidden' }, svg);
    const dot = el('circle', { r: 4.5, class: `chart-dot ${up ? 'up' : 'down'}`, visibility: 'hidden' }, svg);
    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    container.appendChild(tip);

    const fmt = opts.format || String;
    function move(clientX) {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((x - pad.l) / iw) * (points.length - 1))));
      const p = points[i];
      cursor.setAttribute('x1', X(i)); cursor.setAttribute('x2', X(i));
      dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(p.y));
      cursor.setAttribute('visibility', 'visible'); dot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = `<strong>${fmt(p.y)}</strong><span>${fx(p.x)}</span>` +
        (p.y2 != null ? `<span>Invested ${fmt(p.y2)}</span>` : '');
      const left = (X(i) / W) * r.width;
      tip.style.left = `${Math.min(Math.max(left, 70), r.width - 70)}px`;
    }
    function hide() {
      cursor.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true;
    }
    svg.addEventListener('pointermove', (e) => move(e.clientX));
    svg.addEventListener('pointerdown', (e) => move(e.clientX));
    svg.addEventListener('pointerleave', hide);
  }

  /** slices: [{label, value, pct, color}] */
  function donutChart(container, slices, centerTop, centerBottom) {
    container.innerHTML = '';
    const S = 200, R = 80, w = 26, C = 2 * Math.PI * R;
    const svg = el('svg', { viewBox: `0 0 ${S} ${S}`, class: 'donut', role: 'img',
      'aria-label': 'Allocation breakdown' }, container);
    el('circle', { cx: S / 2, cy: S / 2, r: R, class: 'donut-track', 'stroke-width': w, fill: 'none' }, svg);
    let offset = 0;
    const gap = slices.length > 1 ? 1.5 : 0;
    for (const s of slices) {
      const len = (s.pct / 100) * C;
      const c = el('circle', {
        cx: S / 2, cy: S / 2, r: R, fill: 'none', stroke: s.color, 'stroke-width': w,
        'stroke-dasharray': `${Math.max(len - gap, 0.01)} ${C}`, 'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${S / 2} ${S / 2})`,
      }, svg);
      const t = el('title', {}, c);
      t.textContent = `${s.label}: ${s.pct.toFixed(1)}%`;
      offset += len;
    }
    const t1 = el('text', { x: S / 2, y: S / 2 - 2, 'text-anchor': 'middle', class: 'donut-top' }, svg);
    t1.textContent = centerTop;
    const t2 = el('text', { x: S / 2, y: S / 2 + 18, 'text-anchor': 'middle', class: 'donut-bottom' }, svg);
    t2.textContent = centerBottom;
  }

  root.Charts = { lineChart, donutChart };
})(window);
