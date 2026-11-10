/* Ядро курса: регистрация модулей и помощники для интерактивных виджетов.
   Модуль = файл modules/mNN.js, который вызывает Course.register({...}). */
(function () {
  const Course = (window.Course = { modules: [], ui: {}, plot: {}, rand: {}, fmt: {} });

  Course.register = function (m) {
    m.lessons = m.lessons || [];
    m.terms = m.terms || [];
    Course.modules.push(m);
    Course.modules.sort((a, b) => a.order - b.order);
  };

  /* Course.extend(id, {lessons, terms}) — дописать уроки и термины в уже зарегистрированный модуль.
     Нужен для углублений по отдельным источникам: файлы modules/ext_*.js подключаются после m10.js. */
  Course.extend = function (id, ext) {
    const m = Course.modules.find((x) => x.id === id);
    if (!m) throw new Error("Course.extend: нет модуля " + id);
    const placed = [], tail = [];
    (ext.lessons || []).forEach((l) => (l.after ? placed : tail).push(l));
    tail.forEach((l) => m.lessons.push(l));
    const n = (l) => +((/l(\d+)$/.exec(l.id) || [])[1] || 0);
    m.lessons.sort((a, b) => n(a) - n(b));
    /* Урок с полем after: «id» встаёт сразу после указанного урока (чтобы вставлять в середину, не переименовывая id и не теряя прогресс). */
    placed.forEach((l) => {
      const i = m.lessons.findIndex((x) => x.id === l.after);
      if (i < 0) throw new Error("Course.extend: нет урока " + l.after);
      m.lessons.splice(i + 1, 0, l);
    });
    (ext.terms || []).forEach((t) => m.terms.push(t));
  };

  /* ---------- форматирование ---------- */
  Course.fmt.n = (x, d = 2) => (isFinite(x) ? x.toFixed(d).replace(".", ",") : "—");
  Course.fmt.pct = (x, d = 1) => Course.fmt.n(x * 100, d) + "%";

  /* ---------- случайные числа (детерминированные, чтобы пример можно было воспроизвести) ---------- */
  Course.rand.seeded = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () { // mulberry32
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  Course.rand.normal = function (rng) { // Бокс—Мюллер
    const u = Math.max(rng(), 1e-12), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  Course.rand.poisson = function (rng, lambda) { // для небольших lambda
    const L = Math.exp(-lambda); let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
  };

  /* ---------- UI-помощники для виджетов ---------- */
  const el = (tag, attrs, html) => {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  };
  Course.ui.el = el;

  /* slider(parent, {label, min, max, step, value, fmt, onInput}) -> {get(), set(v)} */
  Course.ui.slider = function (parent, o) {
    let box = parent.querySelector(".w-controls");
    if (!box) { box = el("div", { class: "w-controls" }); parent.appendChild(box); }
    const lab = el("label"), inp = el("input", { type: "range", min: o.min, max: o.max, step: o.step || 1 });
    const out = el("b"), f = o.fmt || ((v) => Course.fmt.n(+v, 2));
    inp.value = o.value;
    lab.append(o.label + ": ", out, inp);
    out.textContent = f(+inp.value);
    inp.addEventListener("input", () => { out.textContent = f(+inp.value); o.onInput && o.onInput(+inp.value); });
    box.appendChild(lab);
    return { get: () => +inp.value, set: (v) => { inp.value = v; out.textContent = f(v); } };
  };

  Course.ui.button = function (parent, text, onClick, ghost) {
    const b = el("button", { class: "btn" + (ghost ? " ghost" : ""), type: "button" }, text);
    b.addEventListener("click", onClick);
    parent.appendChild(b);
    return b;
  };

  Course.ui.output = function (parent) {
    const o = el("div", { class: "w-out" });
    parent.appendChild(o);
    return o;
  };

  /* canvas(parent, w, h) -> canvas с учётом devicePixelRatio; ctx уже отмасштабирован */
  Course.ui.canvas = function (parent, w, h) {
    const c = el("canvas");
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = "100%"; c.style.maxWidth = w + "px"; c.style.aspectRatio = w + " / " + h;
    c.logicalW = w; c.logicalH = h;
    c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    parent.appendChild(c);
    return c;
  };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  Course.ui.color = css;
  Course.ui.palette = () => [css("--c1"), css("--c2"), css("--c3"), css("--c4")];

  /* ---------- графики ---------- */
  /* Course.plot.line(canvas, {series:[{x:[],y:[],color?,label?,dash?}], xlabel, ylabel, title, ymin?, ymax?, xmin?, xmax?}) */
  Course.plot.line = function (c, o) {
    const ctx = c.getContext("2d"), W = c.logicalW, H = c.logicalH;
    const pad = { l: 52, r: 14, t: o.title ? 28 : 12, b: 38 };
    ctx.clearRect(0, 0, W, H);
    const pal = Course.ui.palette(), ink = css("--ink"), muted = css("--muted"), grid = css("--grid");
    let xs = [], ys = [];
    o.series.forEach((s) => { xs = xs.concat(s.x); ys = ys.concat(s.y); });
    xs = xs.filter(isFinite); ys = ys.filter(isFinite);
    let x0 = o.xmin != null ? o.xmin : Math.min(...xs), x1 = o.xmax != null ? o.xmax : Math.max(...xs);
    let y0 = o.ymin != null ? o.ymin : Math.min(...ys), y1 = o.ymax != null ? o.ymax : Math.max(...ys);
    if (x0 === x1) x1 = x0 + 1;
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const yp = (y1 - y0) * 0.06; if (o.ymin == null) y0 -= yp; if (o.ymax == null) y1 += yp;
    const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
    const Y = (v) => H - pad.b - ((v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    ctx.font = "12px system-ui,sans-serif"; ctx.textBaseline = "middle";
    const ticks = (a, b, n) => { const st = niceStep((b - a) / n), out = []; for (let v = Math.ceil(a / st) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(10)); return out; };
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.lineWidth = 1;
    ctx.textAlign = "right";
    ticks(y0, y1, 5).forEach((v) => { const y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(Course.fmt.n(v, Math.abs(v) < 10 && v % 1 ? 2 : 0), pad.l - 6, y); });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ticks(x0, x1, 6).forEach((v) => { const x = X(v); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke(); ctx.fillText(Course.fmt.n(v, Math.abs(v) < 10 && v % 1 ? 2 : 0), x, H - pad.b + 5); });
    if (y0 < 0 && y1 > 0) { ctx.strokeStyle = muted; ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke(); }
    o.series.forEach((s, i) => {
      ctx.strokeStyle = s.color || pal[i % pal.length]; ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []); ctx.beginPath();
      let started = false;
      s.x.forEach((xv, k) => { if (!isFinite(s.y[k])) { started = false; return; } const px = X(xv), py = Y(s.y[k]); if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py); });
      ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    if (o.xlabel) ctx.fillText(o.xlabel, (pad.l + W - pad.r) / 2, H - 4);
    if (o.title) { ctx.font = "600 13px system-ui,sans-serif"; ctx.fillText(o.title, (pad.l + W - pad.r) / 2, 16); ctx.font = "12px system-ui,sans-serif"; }
    if (o.ylabel) { ctx.save(); ctx.translate(12, (pad.t + H - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
    // легенда
    let lx = pad.l + 8; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    o.series.forEach((s, i) => { if (!s.label) return; ctx.fillStyle = s.color || pal[i % pal.length]; ctx.fillRect(lx, pad.t + 6, 14, 3); ctx.fillStyle = ink; ctx.fillText(s.label, lx + 19, pad.t + 8); lx += 28 + ctx.measureText(s.label).width; });
    function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  };

  /* Course.plot.bars(canvas, {labels:[], values:[], colors?:[], title, ylabel}) — столбчатая диаграмма (в т.ч. гистограмма) */
  Course.plot.bars = function (c, o) {
    const ctx = c.getContext("2d"), W = c.logicalW, H = c.logicalH, pad = { l: 52, r: 14, t: o.title ? 28 : 12, b: 44 };
    ctx.clearRect(0, 0, W, H);
    const pal = Course.ui.palette(), ink = css("--ink"), muted = css("--muted"), grid = css("--grid");
    const vmin = Math.min(0, ...o.values), vmax = Math.max(0, ...o.values) || 1;
    const Y = (v) => H - pad.b - ((v - vmin) / (vmax - vmin)) * (H - pad.t - pad.b);
    const bw = (W - pad.l - pad.r) / o.values.length;
    ctx.font = "12px system-ui,sans-serif"; ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) { const v = vmin + ((vmax - vmin) * i) / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(Course.fmt.n(v, Math.abs(vmax - vmin) < 5 ? 2 : 0), pad.l - 6, y); }
    o.values.forEach((v, i) => { ctx.fillStyle = (o.colors && o.colors[i]) || pal[0]; const x = pad.l + i * bw + bw * 0.12, y = Y(Math.max(v, 0)), h = Math.abs(Y(v) - Y(0)); ctx.fillRect(x, y, bw * 0.76, Math.max(h, 1)); });
    ctx.fillStyle = muted; ctx.textAlign = "center"; ctx.textBaseline = "top";
    const step = Math.ceil(o.labels.length / 12);
    o.labels.forEach((l, i) => { if (i % step === 0) ctx.fillText(l, pad.l + i * bw + bw / 2, H - pad.b + 5); });
    ctx.fillStyle = ink; ctx.textBaseline = "alphabetic";
    if (o.title) { ctx.font = "600 13px system-ui,sans-serif"; ctx.fillText(o.title, (pad.l + W - pad.r) / 2, 16); }
  };
})();
