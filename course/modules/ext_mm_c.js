/* Модуль Σ, уроки mm-l4 (производная) и mm-l5 (интеграл).
   Формулы курса сверены с уроками m00-l5, m04-l2, m05-l2/l3, m06-l2/l4. */
(function () {
  const F = Course.fmt, U = Course.ui, nf = F.n;
  const col = (n) => U.color(n);

  /* ---------- общие помощники для рисования ---------- */
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }
  function decOf(s) { return s >= 1 ? 0 : s >= 0.1 ? 1 : s >= 0.01 ? 2 : 3; }
  function frame(c, o) {
    const ctx = c.getContext('2d'), W = c.logicalW, H = c.logicalH;
    const pad = { l: 58, r: 14, t: o.title ? 28 : 12, b: o.xlabel ? 38 : 26 };
    ctx.clearRect(0, 0, W, H);
    const ink = col('--ink'), muted = col('--muted'), grid = col('--grid');
    if (!(o.x1 > o.x0)) o.x1 = o.x0 + 1;
    if (!(o.y1 > o.y0)) o.y1 = o.y0 + 1;
    const X = (v) => pad.l + (v - o.x0) / (o.x1 - o.x0) * (W - pad.l - pad.r);
    const Y = (v) => H - pad.b - (v - o.y0) / (o.y1 - o.y0) * (H - pad.t - pad.b);
    ctx.font = '12px system-ui,sans-serif'; ctx.lineWidth = 1;
    const sx = niceStep((o.x1 - o.x0) / 6), sy = niceStep((o.y1 - o.y0) / 5);
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(o.y0 / sy - 1e-9) * sy; v <= o.y1 + 1e-9; v += sy) {
      const y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillText(nf(Math.abs(v) < 1e-9 ? 0 : v, decOf(sy)), pad.l - 6, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(o.x0 / sx - 1e-9) * sx; v <= o.x1 + 1e-9; v += sx) {
      const x = X(v); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke();
      ctx.fillText(nf(Math.abs(v) < 1e-9 ? 0 : v, decOf(sx)), x, H - pad.b + 5);
    }
    ctx.strokeStyle = muted;
    if (o.y0 < 0 && o.y1 > 0) { ctx.beginPath(); ctx.moveTo(pad.l, Y(0)); ctx.lineTo(W - pad.r, Y(0)); ctx.stroke(); }
    if (o.x0 < 0 && o.x1 > 0) { ctx.beginPath(); ctx.moveTo(X(0), pad.t); ctx.lineTo(X(0), H - pad.b); ctx.stroke(); }
    ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    if (o.xlabel) ctx.fillText(o.xlabel, (pad.l + W - pad.r) / 2, H - 4);
    if (o.title) { ctx.font = '600 13px system-ui,sans-serif'; ctx.fillText(o.title, (pad.l + W - pad.r) / 2, 17); ctx.font = '12px system-ui,sans-serif'; }
    if (o.ylabel) { ctx.save(); ctx.translate(12, (pad.t + H - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
    const P = { ctx: ctx, X: X, Y: Y, W: W, H: H, pad: pad, ink: ink, muted: muted, o: o };
    P.clip = function (fn) { ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b); ctx.clip(); fn(); ctx.restore(); };
    return P;
  }
  function curveXY(P, xs, ys, color, width, dash) {
    const ctx = P.ctx;
    P.clip(function () {
      ctx.strokeStyle = color; ctx.lineWidth = width || 2; ctx.setLineDash(dash || []); ctx.beginPath();
      let st = false;
      for (let i = 0; i < xs.length; i++) {
        if (!isFinite(ys[i])) { st = false; continue; }
        const px = P.X(xs[i]), py = P.Y(ys[i]);
        if (!st) { ctx.moveTo(px, py); st = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.setLineDash([]);
    });
  }
  function curveFn(P, f, x0, x1, color, width, dash) {
    const xs = [], ys = [], n = 260;
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; xs.push(x); ys.push(f(x)); }
    curveXY(P, xs, ys, color, width, dash);
  }
  function lineSlope(P, x, y, m, color, width, dash) { // прямая через (x,y) с наклоном m на всю ширину окна
    const xa = P.o.x0, xb = P.o.x1;
    curveXY(P, [xa, xb], [y + m * (xa - x), y + m * (xb - x)], color, width, dash);
  }
  function dot(P, x, y, color, r) {
    const ctx = P.ctx; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(P.X(x), P.Y(y), r || 5, 0, 2 * Math.PI); ctx.fill();
  }
  function vline(P, x, color, dash) {
    const ctx = P.ctx; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash || [4, 4]);
    ctx.beginPath(); ctx.moveTo(P.X(x), P.pad.t); ctx.lineTo(P.X(x), P.H - P.pad.b); ctx.stroke(); ctx.setLineDash([]);
  }
  function legend(P, items) {
    const ctx = P.ctx; let lx = P.pad.l + 8; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    items.forEach(function (it) {
      ctx.strokeStyle = it.color; ctx.lineWidth = 2.5; ctx.setLineDash(it.dash || []);
      ctx.beginPath(); ctx.moveTo(lx, P.pad.t + 9); ctx.lineTo(lx + 16, P.pad.t + 9); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = P.ink; ctx.fillText(it.t, lx + 21, P.pad.t + 9); lx += 32 + ctx.measureText(it.t).width;
    });
  }
  function fillArea(P, xs, ys, color) { // заливка под кривой до нуля
    const ctx = P.ctx;
    P.clip(function () {
      ctx.globalAlpha = 0.28; ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(P.X(xs[0]), P.Y(0));
      for (let i = 0; i < xs.length; i++) ctx.lineTo(P.X(xs[i]), P.Y(ys[i]));
      ctx.lineTo(P.X(xs[xs.length - 1]), P.Y(0)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    });
  }
  function selectCtl(root, label, opts, onChange) {
    let box = root.querySelector('.w-controls');
    if (!box) { box = U.el('div', { class: 'w-controls' }); root.appendChild(box); }
    const lab = U.el('label'), s = U.el('select');
    s.style.maxWidth = '100%';
    opts.forEach(function (t, i) { s.appendChild(U.el('option', { value: i }, t)); });
    lab.append(label + ': ', s); box.appendChild(lab);
    s.addEventListener('change', function () { onChange(+s.value); });
    return s;
  }
  function range(f, x0, x1) { let lo = Infinity, hi = -Infinity; for (let i = 0; i <= 200; i++) { const v = f(x0 + (x1 - x0) * i / 200); if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } return [lo, hi]; }
  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function ncdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

  /* ---------- виджеты урока mm-l4 ---------- */
  const tanFns = [
    { name: 'x²', f: function (x) { return x * x; }, d: function (x) { return 2 * x; }, x0: -3, x1: 3, t: 0.67 },
    { name: 'x³ − 3x', f: function (x) { return x * x * x - 3 * x; }, d: function (x) { return 3 * x * x - 3; }, x0: -2.5, x1: 2.5, t: 0.7 },
    { name: '√x', f: function (x) { return Math.sqrt(x); }, d: function (x) { return 1 / (2 * Math.sqrt(x)); }, x0: 0.1, x1: 9, t: 0.3 },
    { name: 'e^(−x)', f: function (x) { return Math.exp(-x); }, d: function (x) { return -Math.exp(-x); }, x0: -1, x1: 4, t: 0.3 },
    { name: 'ln x', f: function (x) { return Math.log(x); }, d: function (x) { return 1 / x; }, x0: 0.2, x1: 6, t: 0.3 },
    { name: 'sin x', f: function (x) { return Math.sin(x); }, d: function (x) { return Math.cos(x); }, x0: 0, x1: 6.3, t: 0.25 }
  ];

  function widgetTangent(root) {
    let cur = tanFns[0], h = 1.5;
    const sel = selectCtl(root, 'Функция', tanFns.map(function (t) { return t.name; }), function (i) { cur = tanFns[i]; sl.set(cur.t); draw(); });
    const sl = U.slider(root, { label: 'Точка x', min: 0, max: 1, step: 0.005, value: cur.t, fmt: function (v) { return nf(cur.x0 + v * (cur.x1 - cur.x0), 2); }, onInput: function () { draw(); } });
    const sh = U.slider(root, { label: 'Шаг секущей h', min: 0.01, max: 3, step: 0.01, value: h, fmt: function (v) { return nf(v, 2); }, onInput: function (v) { h = v; draw(); } });
    const c = U.canvas(root, 640, 340), out = U.output(root);
    function draw() {
      const a = cur.x0 + sl.get() * (cur.x1 - cur.x0), fa = cur.f(a), da = cur.d(a);
      const r = range(cur.f, cur.x0, cur.x1), pd = (r[1] - r[0]) * 0.1 || 1;
      const P = frame(c, { x0: cur.x0, x1: cur.x1, y0: r[0] - pd, y1: r[1] + pd, xlabel: 'x', ylabel: 'f(x)', title: 'f(x) = ' + cur.name });
      const hh = h, fh = cur.f(a + hh), slope = (fh - fa) / hh;
      curveFn(P, cur.f, cur.x0, cur.x1, col('--c1'), 2.5);
      lineSlope(P, a, fa, slope, col('--c3'), 1.5);
      lineSlope(P, a, fa, da, col('--c2'), 2, [6, 4]);
      dot(P, a + hh, fh, col('--c3'), 4); dot(P, a, fa, col('--bad'), 6);
      legend(P, [{ t: 'f(x)', color: col('--c1') }, { t: 'секущая (шаг h)', color: col('--c3') }, { t: 'касательная', color: col('--c2'), dash: [6, 4] }]);
      const trend = Math.abs(da) < 0.02 ? 'наклон почти нулевой: вершина, впадина или площадка' : (da > 0 ? 'функция здесь растёт' : 'функция здесь убывает');
      out.innerHTML = 'x = <b>' + nf(a, 2) + '</b>, f(x) = <b>' + nf(fa, 3) + '</b>. Точная производная f\u2032(x) = <b>' + nf(da, 3) + '</b> (' + trend + '). ' +
        'Наклон секущей между x и x+h: <b>' + nf(slope, 3) + '</b>; отличие от производной: ' + nf(slope - da, 3) + '. Касательная: y = ' + nf(fa, 3) + (da < 0 ? ' \u2212 ' : ' + ') + nf(Math.abs(da), 3) + '\u00b7(x \u2212 ' + nf(a, 2) + '). Уменьшайте h: секущая ложится на касательную.';
    }
    draw();
  }

  function widgetOptSpread(root) {
    let A = 140, k = 1.5;
    const sA = U.slider(root, { label: 'A — базовая частота ордеров', min: 20, max: 300, step: 5, value: A, fmt: function (v) { return nf(v, 0); }, onInput: function (v) { A = v; draw(); } });
    const sk = U.slider(root, { label: 'k — как быстро падает частота с расстоянием', min: 0.5, max: 4, step: 0.1, value: k, fmt: function (v) { return nf(v, 1); }, onInput: function (v) { k = v; draw(); } });
    const su = U.slider(root, { label: 'Расстояние δ (в долях 1/k)', min: 0, max: 4, step: 0.01, value: 0.4, fmt: function (v) { return nf(v, 2) + '/k'; }, onInput: function () { draw(); } });
    const c1 = U.canvas(root, 640, 300), c2 = U.canvas(root, 640, 220), out = U.output(root);
    function draw() {
      const d = su.get() / k, xmax = 4 / k, g = function (x) { return A * x * Math.exp(-k * x); }, gp = function (x) { return A * Math.exp(-k * x) * (1 - k * x); };
      const ds = 1 / k, gs = A / (k * Math.E);
      const P = frame(c1, { x0: 0, x1: xmax, y0: 0, y1: gs * 1.3, xlabel: 'расстояние от mid, δ', ylabel: 'g(δ) = δ·λ(δ)', title: 'Ожидаемая прибыль в единицу времени' });
      curveFn(P, g, 0, xmax, col('--c1'), 2.5);
      lineSlope(P, d, g(d), gp(d), col('--c2'), 1.8, [6, 4]);
      vline(P, ds, col('--good'));
      dot(P, ds, gs, col('--good'), 6); dot(P, d, g(d), col('--bad'), 6);
      legend(P, [{ t: 'g(δ)', color: col('--c1') }, { t: 'касательная в выбранной точке', color: col('--c2'), dash: [6, 4] }]);
      const P2 = frame(c2, { x0: 0, x1: xmax, y0: -0.25 * A, y1: 1.1 * A, xlabel: 'расстояние от mid, δ', ylabel: "g\u2032(δ)", title: 'Производная: где она равна нулю, там вершина' });
      curveFn(P2, gp, 0, xmax, col('--c3'), 2.5);
      vline(P2, ds, col('--good'));
      dot(P2, ds, 0, col('--good'), 6); dot(P2, d, gp(d), col('--bad'), 6);
      const adv = gp(d) > 0.5 ? 'производная положительна: отодвинуть котировку ещё выгодно' : (gp(d) < -0.5 ? 'производная отрицательна: котировка слишком далеко, лучше приблизить' : 'производная почти нулевая: мы у вершины');
      out.innerHTML = 'δ = <b>' + nf(d, 3) + '</b>: g = <b>' + nf(g(d), 2) + '</b>, g\u2032 = <b>' + nf(gp(d), 2) + '</b> (' + adv + '). ' +
        'Максимум: δ* = 1/k = <b>' + nf(ds, 3) + '</b>, g(δ*) = A/(k·e) = <b>' + nf(gs, 2) + '</b>. Полный спред нейтрального к риску агента 2δ* = 2/k = <b>' + nf(2 * ds, 3) + '</b>. ' +
        'Потеря от промаха: при выбранном δ получаем <b>' + nf(100 * g(d) / gs, 1) + '%</b> от максимума.';
    }
    draw();
  }

  /* колл Блэка–Шоулза при r = 0: S, K = 100, σ = 20% годовых, T = 0,25 года */
  function bsCall(S) {
    const K = 100, sg = 0.2, T = 0.25, sq = sg * Math.sqrt(T);
    if (S <= 0) return 0;
    const d1 = (Math.log(S / K) + 0.5 * sg * sg * T) / sq, d2 = d1 - sq;
    return S * ncdf(d1) - K * ncdf(d2);
  }
  const tayFns = [
    { name: 'e^x', f: Math.exp, x0: -2, x1: 2, a: 0, unit: '' },
    { name: 'ln x', f: Math.log, x0: 0.3, x1: 3, a: 1, unit: '' },
    { name: '√x', f: Math.sqrt, x0: 0.5, x1: 9, a: 4, unit: '' },
    { name: 'цена колла V(S): K = 100, σ = 20%, T = 0,25', f: bsCall, x0: 80, x1: 120, a: 100, unit: 'S' }
  ];

  function widgetTaylor(root) {
    let cur = tayFns[0];
    selectCtl(root, 'Функция', tayFns.map(function (t) { return t.name; }), function (i) { cur = tayFns[i]; sa.set((cur.a - cur.x0) / (cur.x1 - cur.x0)); sd.set(0.5); draw(); });
    const sa = U.slider(root, { label: 'Опорная точка a', min: 0.05, max: 0.95, step: 0.005, value: 0.5, fmt: function (v) { return nf(cur.x0 + v * (cur.x1 - cur.x0), 2); }, onInput: function () { draw(); } });
    const sd = U.slider(root, { label: 'Сдвиг Δx = x − a', min: -1, max: 1, step: 0.01, value: 0.5, fmt: function (v) { return nf(v * (cur.x1 - cur.x0) / 4, 2); }, onInput: function () { draw(); } });
    const c = U.canvas(root, 640, 340), out = U.output(root);
    function draw() {
      const a = cur.x0 + sa.get() * (cur.x1 - cur.x0), w = (cur.x1 - cur.x0) / 4;
      const x = Math.min(cur.x1, Math.max(cur.x0, a + sd.get() * w)), dx = x - a;
      const e = (cur.x1 - cur.x0) * 1e-3, fa = cur.f(a);
      const d1 = (cur.f(a + e) - cur.f(a - e)) / (2 * e), d2 = (cur.f(a + e) - 2 * fa + cur.f(a - e)) / (e * e);
      const lin = function (t) { return fa + d1 * (t - a); }, quad = function (t) { return fa + d1 * (t - a) + 0.5 * d2 * (t - a) * (t - a); };
      const r = range(cur.f, cur.x0, cur.x1), pd = (r[1] - r[0]) * 0.12;
      const P = frame(c, { x0: cur.x0, x1: cur.x1, y0: r[0] - pd, y1: r[1] + pd, xlabel: cur.unit || 'x', ylabel: 'f(x)', title: 'Точная функция и её приближения в точке a' });
      curveFn(P, cur.f, cur.x0, cur.x1, col('--c1'), 3);
      curveFn(P, lin, cur.x0, cur.x1, col('--c2'), 2, [6, 4]);
      curveFn(P, quad, cur.x0, cur.x1, col('--c3'), 2, [2, 3]);
      vline(P, x, col('--muted'));
      dot(P, a, fa, col('--muted'), 4); dot(P, x, cur.f(x), col('--c1'), 5); dot(P, x, lin(x), col('--c2'), 4); dot(P, x, quad(x), col('--c3'), 4);
      legend(P, [{ t: 'точная', color: col('--c1') }, { t: 'линейное', color: col('--c2'), dash: [6, 4] }, { t: 'с кривизной', color: col('--c3'), dash: [2, 3] }]);
      const ex = cur.f(x) - fa, l1 = d1 * dx, l2 = l1 + 0.5 * d2 * dx * dx;
      out.innerHTML = 'a = <b>' + nf(a, 2) + '</b>, f(a) = ' + nf(fa, 3) + ', f\u2032(a) = <b>' + nf(d1, 4) + '</b>' + (cur.unit ? ' (дельта)' : '') + ', f\u2033(a) = <b>' + nf(d2, 4) + '</b>' + (cur.unit ? ' (гамма)' : '') + '. ' +
        'Сдвиг \u0394x = <b>' + nf(dx, 2) + '</b>: изменение точно <b>' + nf(ex, 4) + '</b>; линейное f\u2032\u00b7\u0394x = <b>' + nf(l1, 4) + '</b> (ошибка ' + nf(l1 - ex, 4) + '); ' +
        'с кривизной + \u00bd f\u2033\u00b7\u0394x\u00b2 = <b>' + nf(l2, 4) + '</b> (ошибка ' + nf(l2 - ex, 4) + ').';
    }
    draw();
  }

  /* ---------- виджеты урока mm-l5 ---------- */
  const rmFns = [
    { name: 'x² на [0; 2]', f: function (x) { return x * x; }, a: 0, b: 2, ex: 8 / 3 },
    { name: 'sin x на [0; π]', f: Math.sin, a: 0, b: Math.PI, ex: 2 },
    { name: 'e^(−x) на [0; 3]', f: function (x) { return Math.exp(-x); }, a: 0, b: 3, ex: 1 - Math.exp(-3) },
    { name: '1/x на [1; 4]', f: function (x) { return 1 / x; }, a: 1, b: 4, ex: Math.log(4) },
    { name: 'δ·e^(−1,5δ) на [0; 4] (прибыль × частота)', f: function (x) { return x * Math.exp(-1.5 * x); }, a: 0, b: 4, ex: (1 - Math.exp(-6) * (1 + 6)) / 2.25 }
  ];
  const rmNames = ['левая сумма', 'правая сумма', 'средняя точка', 'трапеции'];
  function riemann(fn, n, m) {
    const h = (fn.b - fn.a) / n; let s = 0;
    for (let i = 0; i < n; i++) {
      const x0 = fn.a + i * h, x1 = x0 + h;
      s += m === 0 ? fn.f(x0) : m === 1 ? fn.f(x1) : m === 2 ? fn.f(x0 + h / 2) : (fn.f(x0) + fn.f(x1)) / 2;
    }
    return s * h;
  }

  function widgetRiemann(root) {
    let cur = rmFns[0], m = 0, n = 4;
    selectCtl(root, 'Функция', rmFns.map(function (t) { return t.name; }), function (i) { cur = rmFns[i]; draw(); });
    selectCtl(root, 'Способ', rmNames, function (i) { m = i; draw(); });
    U.slider(root, { label: 'Число прямоугольников n', min: 1, max: 60, step: 1, value: n, fmt: function (v) { return nf(v, 0); }, onInput: function (v) { n = v; draw(); } });
    const c = U.canvas(root, 640, 300), c2 = U.canvas(root, 640, 240), out = U.output(root);
    function draw() {
      const r = range(cur.f, cur.a, cur.b), top = Math.max(r[1], 0) * 1.15 || 1;
      const P = frame(c, { x0: cur.a, x1: cur.b, y0: Math.min(0, r[0]), y1: top, xlabel: 'x', ylabel: 'f(x)', title: 'Площадь под кривой: ' + rmNames[m] + ', n = ' + n });
      const h = (cur.b - cur.a) / n, ctx = P.ctx;
      P.clip(function () {
        ctx.globalAlpha = 0.3; ctx.fillStyle = col('--c2'); ctx.strokeStyle = col('--c2'); ctx.lineWidth = 1;
        for (let i = 0; i < n; i++) {
          const x0 = cur.a + i * h, x1 = x0 + h;
          ctx.beginPath();
          if (m === 3) { ctx.moveTo(P.X(x0), P.Y(0)); ctx.lineTo(P.X(x0), P.Y(cur.f(x0))); ctx.lineTo(P.X(x1), P.Y(cur.f(x1))); ctx.lineTo(P.X(x1), P.Y(0)); }
          else {
            const hv = m === 0 ? cur.f(x0) : m === 1 ? cur.f(x1) : cur.f(x0 + h / 2);
            ctx.rect(P.X(x0), P.Y(Math.max(hv, 0)), P.X(x1) - P.X(x0), Math.abs(P.Y(hv) - P.Y(0)));
          }
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 0.3;
        }
        ctx.globalAlpha = 1;
      });
      curveFn(P, cur.f, cur.a, cur.b, col('--c1'), 2.5);
      const val = riemann(cur, n, m);
      // сходимость: log10 |ошибка| для четырёх способов
      const ns = [], series = [[], [], [], []];
      for (let k = 1; k <= 60; k++) { ns.push(k); for (let j = 0; j < 4; j++) series[j].push(Math.log10(Math.max(Math.abs(riemann(cur, k, j) - cur.ex), 1e-12))); }
      const Q = frame(c2, { x0: 1, x1: 60, y0: -12, y1: 1, xlabel: 'число прямоугольников n', ylabel: 'lg |ошибка|', title: 'Как быстро сумма приближается к точному значению' });
      const cols = [col('--c1'), col('--c2'), col('--c3'), col('--c4')];
      for (let j = 0; j < 4; j++) curveXY(Q, ns, series[j], cols[j], j === m ? 3 : 1.5);
      dot(Q, n, series[m][n - 1], col('--bad'), 5);
      legend(Q, rmNames.map(function (t, j) { return { t: t, color: cols[j] }; }));
      out.innerHTML = 'Сумма (' + rmNames[m] + ', n = ' + n + '): <b>' + nf(val, 5) + '</b>. Точное значение интеграла: <b>' + nf(cur.ex, 5) + '</b>. Ошибка: <b>' + nf(val - cur.ex, 5) + '</b> (' + nf(Math.abs(val - cur.ex) / Math.abs(cur.ex) * 100, 3) + '% от точного). ' +
        'Графики внизу идут вниз — чем больше прямоугольников, тем точнее; если ошибка в 12 знаков исчезла, линия обрывается на уровне \u221212.';
    }
    draw();
  }

  function widgetSchedule(root) {
    const X = 1e6, T = 5, eta = 2.5e-7, sigma = 0.8, N = 1000;
    let mode = 1, p = 2, kT = 3;
    selectCtl(root, 'Траектория', ['равномерная', 'степенная x(t) = X(1 − t/T)^p (быстрее в начале при p > 1)', 'Almgren–Chriss: x(t) = X·sinh(κ(T − t))/sinh(κT)'], function (i) { mode = i; draw(); });
    U.slider(root, { label: 'p (для степенной)', min: 1, max: 4, step: 0.1, value: p, fmt: function (v) { return nf(v, 1); }, onInput: function (v) { p = v; draw(); } });
    U.slider(root, { label: 'κT (для Almgren–Chriss; 0 — равномерно)', min: 0.05, max: 6, step: 0.05, value: kT, fmt: function (v) { return nf(v, 2); }, onInput: function (v) { kT = v; draw(); } });
    const c1 = U.canvas(root, 640, 250), c2 = U.canvas(root, 640, 250), out = U.output(root);
    function xOf(t) {
      if (mode === 0) return X * (1 - t / T);
      if (mode === 1) return X * Math.pow(1 - t / T, p);
      return X * Math.sinh(kT * (1 - t / T)) / Math.sinh(kT);
    }
    function vOf(t) {
      if (mode === 0) return X / T;
      if (mode === 1) return p * X / T * Math.pow(Math.max(1 - t / T, 0), p - 1);
      return X * (kT / T) * Math.cosh(kT * (1 - t / T)) / Math.sinh(kT);
    }
    function draw() {
      const dt = T / N, ts = [], vs = [], cs = [];
      let sold = 0, cost = 0, vari = 0;
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) * dt, v = vOf(t), x = xOf(t);
        sold += v * dt; cost += eta * v * v * dt; vari += sigma * sigma * x * x * dt;
        ts.push(t); vs.push(v / 1e3); cs.push(eta * v * v / 1e3);
      }
      const vmax = Math.max.apply(null, vs) * 1.15, cmax = Math.max.apply(null, cs) * 1.15;
      const P = frame(c1, { x0: 0, x1: T, y0: 0, y1: vmax, xlabel: 'время t, дни', ylabel: 'v(t), тыс. акций/день', title: 'Скорость продажи v(t) = \u2212x\u2032(t): площадь = проданное' });
      fillArea(P, ts, vs, col('--c1')); curveXY(P, ts, vs, col('--c1'), 2.5);
      const Q = frame(c2, { x0: 0, x1: T, y0: 0, y1: cmax, xlabel: 'время t, дни', ylabel: 'ηv(t)², тыс. долл./день', title: 'Скорость набегания издержек ηv²: площадь = издержки' });
      fillArea(Q, ts, cs, col('--bad')); curveXY(Q, ts, cs, col('--bad'), 2.5);
      const base = eta * X * X / T;
      out.innerHTML = 'Проданное \u222b v dt = <b>' + nf(sold / 1e3, 0) + ' тыс.</b> акций (должно получиться X = 1000 тыс.). Издержки \u222b ηv\u00b2 dt = <b>' + nf(cost / 1e3, 1) + ' тыс. долл.</b>, ' +
        nf(cost / base, 2) + ' \u00d7 от равномерных (' + nf(base / 1e3, 0) + ' тыс. = ηX\u00b2/T). Риск: σ\u00b7\u221a(\u222b x\u00b2 dt) = <b>' + nf(Math.sqrt(vari) / 1e6, 2) + ' млн долл.</b> Начальная скорость v(0) = ' + nf(vOf(0) / 1e3, 0) + ' тыс. акций/день ' +
        '(у равномерной — 200). Параметры: X = 1 млн акций, T = 5 дней, η = 2,5\u00b710\u207b\u2077, σ = 0,8 за день (как в примере урока m06-l2). Быстрее в начале: издержки выше, риск ниже.';
    }
    draw();
  }

  function widgetBell(root) {
    let mode = 0, sg = 2;
    const sk = U.slider(root, { label: 'k (в режиме хвоста — z)', min: -4, max: 4, step: 0.01, value: 1, fmt: function (v) { return nf(v, 2); }, onInput: function () { draw(); } });
    U.slider(root, { label: 'σ цены за день (средняя цена 100)', min: 0.5, max: 5, step: 0.1, value: sg, fmt: function (v) { return nf(v, 1); }, onInput: function (v) { sg = v; draw(); } });
    const bw = U.el('div', { class: 'w-controls' }); root.appendChild(bw);
    U.button(bw, 'Режим: вероятность в интервале \u00b1kσ', function () { mode = 0; draw(); });
    U.button(bw, 'Режим: левый хвост Φ(z)', function () { mode = 1; draw(); }, true);
    const c = U.canvas(root, 640, 300), out = U.output(root);
    const phi = function (z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); };
    function integ(a, b) { // площадь под колоколом: метод средней точки, 2000 полосок
      if (b <= a) return 0; const n = 2000, h = (b - a) / n; let s = 0;
      for (let i = 0; i < n; i++) s += phi(a + (i + 0.5) * h);
      return s * h;
    }
    function draw() {
      const k = sk.get(), lo = mode === 0 ? -Math.abs(k) : -6, hi = mode === 0 ? Math.abs(k) : k;
      const P = frame(c, { x0: -4, x1: 4, y0: 0, y1: 0.45, xlabel: 'z — расстояние от среднего в единицах σ', ylabel: 'плотность φ(z)', title: 'Площадь под колоколом = вероятность' });
      const xs = [], ys = [];
      for (let z = Math.max(lo, -4); z <= Math.min(hi, 4) + 1e-9; z += 0.02) { xs.push(z); ys.push(phi(z)); }
      if (xs.length > 1) fillArea(P, xs, ys, col('--c2'));
      curveFn(P, phi, -4, 4, col('--c1'), 2.5);
      const prob = integ(lo, hi);
      if (mode === 0) {
        const a = Math.abs(k);
        out.innerHTML = 'P(\u2212' + nf(a, 2) + 'σ \u2264 X \u2212 μ \u2264 ' + nf(a, 2) + 'σ) = <b>' + nf(prob * 100, 2) + '%</b>. В ценах (μ = 100, σ = ' + nf(sg, 1) + '): интервал <b>[' + nf(100 - a * sg, 2) + '; ' + nf(100 + a * sg, 2) + ']</b>. ' +
          'Для проверки: k = 1 \u2192 68,27%, k = 2 \u2192 95,45%, k = 3 \u2192 99,73%, k = 1,96 \u2192 95%.';
      } else {
        out.innerHTML = 'Φ(' + nf(k, 2) + ') = P(Z \u2264 ' + nf(k, 2) + ') = <b>' + nf(prob * 100, 2) + '%</b>. В ценах: P(цена \u2264 ' + nf(100 + k * sg, 2) + ') = то же число. ' +
          'Для проверки: Φ(0) = 50%, Φ(1,645) = 95%, Φ(2,326) = 99% (множитель VaR из урока m06-l4). Площадь считается суммой тонких полосок — то, что делает интеграл.';
      }
    }
    draw();
  }

  /* ---------- уроки ---------- */
  Course.extend('mm', {
    lessons: [
      {
        id: 'mm-l4',
        title: 'Производная: скорость изменения и поиск оптимума',
        minutes: 45,
        level: 'базовый',
        html: `
<p class="lead">В формулах курса постоянно встречаются штрихи, точки и закруглённые «д»: $\\Delta=\\partial V/\\partial S$, $\\dot w_q(t)$, «приравняем производную к нулю». Это один и тот же объект — <b>скорость изменения</b>. После урока вы сможете прочесть такую запись словами, посчитать производную функций, которые встречаются в курсе, и вывести самый известный «оптимальный» результат модуля 5: почему нейтральный к риску маркет-мейкер ставит полный спред $2/k$.</p>

<h2>Наклон: сколько на единицу</h2>
<p>Цена акции в 10:00:00 была 100,00, в 10:00:10 стала 100,30. За десять секунд она выросла на 0,30, то есть средняя скорость — $0{,}30/10=0{,}03$ цены в секунду. Это <b>отношение приращений</b>: изменение результата делим на изменение аргумента. На графике это наклон прямой, соединяющей две точки.</p>
<p>Теперь издержки. <i>Учебный пример:</i> покупка $Q$ акций с учётом влияния на цену обходится в добавочные $C(Q)=0{,}0002\\,Q^2$ долларов. Для $Q=1000$ это 200 долл., для $Q=2000$ — 800 долл. Средние издержки на акцию: 0,20 и 0,40. Но важнее другое: сколько стоит <i>ещё одна</i> акция, когда вы уже купили 1000? $C(1001)-C(1000)=0{,}4002$. Это <b>предельные издержки</b> (marginal cost): они вдвое выше средних, потому что каждая следующая акция двигает цену сильнее предыдущей. Число 0,40 и есть производная $C'(1000)$.</p>

<h2>Производная: приращение, сжатое до точки</h2>
<p>Возьмём функцию $f$, точку $x$ и маленький шаг $h$. Отношение приращений $\\dfrac{f(x+h)-f(x)}{h}$ — наклон «секущей». Если уменьшать $h$, число перестаёт меняться и приближается к пределу. Этот предел и есть <b>производная функции</b>:</p>
$$f'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}.$$
<p>Пример для $f(x)=x^2$ в точке $x=3$: при $h=1$ получаем $(16-9)/1=7$; при $h=0{,}1$ — $6{,}1$; при $h=0{,}01$ — $6{,}01$. Предел равен $6=2\\cdot3$. Секущая превратилась в <b>касательную</b> — прямую, которая в этой точке «прилегает» к графику. Подвигайте шаг $h$ в виджете.</p>
<div data-widget="tangent" data-title="Касательная и секущая: что такое производная"></div>
<p>Как это записывают (всё это одно и то же):</p>
<ul>
<li>$f'(x)$ — «эф со штрихом»; $\\dfrac{df}{dx}$ — «де эф по де икс»: бесконечно малое приращение $f$, делённое на бесконечно малое приращение $x$.</li>
<li>$\\dot x(t)$ — точка над буквой: производная по времени (например, $\\dot w_q(t)$ в уроке m06-l3).</li>
<li>$\\dfrac{\\partial f}{\\partial x}$ и $\\partial_\\delta\\lambda$ — <b>частная производная</b>: функция зависит от нескольких букв, а мы смотрим на изменение по одной, остальные «замораживаем».</li>
</ul>
<p>Знак производной читается сразу: $f'>0$ — функция растёт, $f'<0$ — убывает, $f'=0$ — касательная горизонтальна (вершина, впадина или площадка).</p>

<h2>Производные, которые нужны курсу</h2>
<table>
<tr><th>Функция</th><th>Производная</th><th>Где встречается</th></tr>
<tr><td>константа $c$</td><td>$0$</td><td>параметры $A$, $\\sigma$, $\\eta$ при дифференцировании по $\\delta$ или $t$</td></tr>
<tr><td>$x^n$</td><td>$n\\,x^{n-1}$</td><td>$(\\Delta S)^2$, издержки $\\eta v^2$, $Q^{3/2}$</td></tr>
<tr><td>$\\sqrt x$</td><td>$\\dfrac1{2\\sqrt x}$</td><td>закон квадратного корня (m04-l2)</td></tr>
<tr><td>$e^{kx}$</td><td>$k\\,e^{kx}$</td><td>интенсивность $Ae^{-k\\delta}$ ($k$ отрицательно)</td></tr>
<tr><td>$\\ln x$</td><td>$\\dfrac1x$</td><td>логарифмические доходности, $\\ln(1+\\gamma/k)$</td></tr>
<tr><td>$c\\cdot f$</td><td>$c\\cdot f'$</td><td>число-множитель выносится</td></tr>
<tr><td>$f+g$</td><td>$f'+g'$</td><td>слагаемые дифференцируют по отдельности</td></tr>
<tr><td>$f\\cdot g$</td><td>$f'g+fg'$</td><td>«прибыль на сделку × частота»</td></tr>
<tr><td>$f(g(x))$</td><td>$f'(g(x))\\cdot g'(x)$</td><td>цепное правило: $e^{-k\\delta}$, $\\sqrt{Q/V}$</td></tr>
</table>
<p>Цепное правило читается как «снаружи на внутри». У $e^{-k\\delta}$ внутри стоит $-k\\delta$ (его производная по $\\delta$ равна $-k$), снаружи — экспонента, которая при дифференцировании не меняется. Итог: $-k\\,e^{-k\\delta}$.</p>

<h2>Как это выглядит в формулах курса</h2>
<p><b>1. Avellaneda–Stoikov (m05-l3).</b> Интенсивность исполнений $\\lambda(\\delta)=Ae^{-k\\delta}$. По цепному правилу $\\lambda'(\\delta)=-kAe^{-k\\delta}$, поэтому $\\lambda/\\lambda'=-1/k$ — именно эта дробь стоит в условии оптимума статьи и делает поправку к спреду явной. При $k=1{,}5$ она равна $-0{,}667$.</p>
<p><b>2. Закон квадратного корня (m04-l2).</b> Издержки на акцию $G(q)=\\sigma\\sqrt q$, где $q=Q/V$ — доля ордера в дневном объёме. Скорость роста $G'(q)=\\sigma/(2\\sqrt q)$: при $\\sigma=2\\%$ и $q=1\\%$ она равна $0{,}02/0{,}2=0{,}1$. Значит, касательная обещает: плюс один процентный пункт объёма — плюс 10 б.п. к издержкам. Точный расчёт: $G(2\\%)=28{,}3$ б.п. против $G(1\\%)=20$ б.п., то есть +8,3 б.п. Касательная завышает — потому что корень вогнут, об этом ниже.</p>
<p><b>3. Резервная цена (m05-l2).</b> $r=s-q\\gamma\\sigma^2(T-t)$. Частная производная по запасу: $\\partial r/\\partial q=-\\gamma\\sigma^2(T-t)$ — на сколько каждая лишняя акция запаса опускает резервную цену. При $\\gamma=0{,}1$, $\\sigma=2$, $T-t=1$ получаем $-0{,}4$; это тот самый сдвиг на 0,4 за единицу запаса из числового примера m05-l3.</p>

<h2>Вторая производная: кривизна</h2>
<p>Производную можно взять ещё раз: $f''=(f')'$. Если $f'$ — «скорость», то $f''$ — «ускорение», а на графике — <b>кривизна</b>. При $f''>0$ график изгибается вверх, как чаша; функция <b>выпукла</b>. При $f''<0$ — вогнута, как купол.</p>
<p>Для $C(Q)=0{,}0002Q^2$ вторая производная $C''=0{,}0004>0$: издержки выпуклы, каждая следующая акция дороже предыдущей. У $\\sqrt q$ вторая производная отрицательна: каждая следующая единица объёма добавляет к издержкам на акцию меньше предыдущей (m04-l2 называет это вогнутостью). В m06-l2 сказано, что целевая функция Almgren–Chriss «строго выпукла» — это значит, что у неё одна впадина и условие «производная равна нулю» находит единственное решение.</p>

<h2>Частные производные и «греки»</h2>
<p>Цена опциона $V(S,t)$ зависит от цены акции $S$ и времени $t$. Частная производная — это обычная производная по одной букве, пока остальные считаются константами:</p>
<p>$\\Delta=\\dfrac{\\partial V}{\\partial S}$ (дельта: на сколько меняется цена опциона при +1 к цене акции), $\\Gamma=\\dfrac{\\partial^2V}{\\partial S^2}$ (гамма: как меняется сама дельта), $\\Theta=\\dfrac{\\partial V}{\\partial t}$ (тета). Так же записаны греки в уроке m00-l5; здесь нужно лишь уметь прочитать символ как «наклон» и «кривизну».</p>

<h2>Приближение: прямая, а затем парабола</h2>
<p>Рядом с точкой гладкая функция почти совпадает со своей касательной, чуть дальше — с параболой. Изменение значения при малом сдвиге $\\Delta S$:</p>
$$\\Delta V\\;\\approx\\;\\underbrace{V'\\cdot\\Delta S}_{\\text{первый порядок}}\\;+\\;\\underbrace{\\tfrac12\\,V''\\cdot\\Delta S^2}_{\\text{второй порядок}}.$$
<p>Для опциона это «дельта-гамма приближение» из m00-l5: $\\Delta V\\approx\\Delta\\cdot\\Delta S+\\tfrac12\\Gamma\\,\\Delta S^2$. Про малые приращения вообще — урок mm-l7.</p>
<div class="example"><b>Учебный пример.</b> Колл со страйком 100, $\\sigma=20\\%$ годовых, срок 0,25 года, $r=0$; акция стоит 100, опцион — 3,99. Дельта $\\approx0{,}520$, гамма $\\approx0{,}0398$. Акция выросла на 5: точное изменение +3,08; линейное $0{,}52\\cdot5=2{,}60$; с гаммой $2{,}60+0{,}5\\cdot0{,}0398\\cdot25=3{,}10$. Акция упала на 5: точное $-2{,}10$; линейное $-2{,}60$; с гаммой $-2{,}10$. Прямая недооценивает рост и переоценивает падение — опцион выпуклый, и гамма как раз исправляет это.</div>
<div data-widget="taylor" data-title="Приближение Тейлора: прямая и парабола вместо функции"></div>

<h2>Поиск оптимума: «производная равна нулю»</h2>
<p>Маркет-мейкер ставит заявку на расстоянии $\\delta$ от середины спреда. Если заявку исполнят, он заработает $\\delta$. Но чем дальше заявка, тем реже её исполняют: по модели из m05-l2 частота равна $\\lambda(\\delta)=Ae^{-k\\delta}$. Ожидаемая прибыль в единицу времени:</p>
$$g(\\delta)=\\underbrace{\\delta}_{\\text{прибыль на сделку}}\\cdot\\underbrace{Ae^{-k\\delta}}_{\\text{частота сделок}}.$$
<p>Слишком близко — много сделок, но по копейке; слишком далеко — выгодно, но сделок нет. Максимум посередине, а на вершине касательная горизонтальна, то есть $g'(\\delta)=0$. Это <b>условие первого порядка</b> (first-order condition). Считаем по правилу произведения:</p>
$$g'(\\delta)=Ae^{-k\\delta}+\\delta\\cdot(-k)Ae^{-k\\delta}=Ae^{-k\\delta}\\,(1-k\\delta)=0\\quad\\Rightarrow\\quad\\delta^*=\\frac1k.$$
<p>Чтобы убедиться, что это максимум, смотрим на вторую производную: $g''(\\delta)=Ak\\,e^{-k\\delta}(k\\delta-2)$, при $\\delta^*$ она равна $-Ak/e<0$ — вершина-купол. Значение в максимуме: $g(\\delta^*)=\\dfrac{A}{ke}$. При $A=140$, $k=1{,}5$: $\\delta^*=0{,}667$, $g^*=34{,}3$; при $\\delta=0{,}5$ получаем 33,1, при $\\delta=1$ — 31,2. Вершина пологая: промахнуться на треть — потерять 3–9%.</p>
<p><b>Связь с модулем 5.</b> Если bid и ask стоят симметрично, каждая на расстоянии $\\delta^*=1/k$ от mid, то полный спред равен $2\\delta^*=2/k$. В m05-l3 формула спреда Avellaneda–Stoikov содержит компоненту исполнения $\\frac2\\gamma\\ln(1+\\gamma/k)$, и про неё сказано: при $\\gamma\\to0$ она стремится к $2/k$ — спреду нейтрального к риску агента. Проверка при $k=1{,}5$: для $\\gamma=0{,}001$ значение 1,3329 (против $2/1{,}5=1{,}3333$); для $\\gamma=0{,}1$ — 1,291. Поймите: вывод в статье сложнее (там ещё запас и риск), но в предельном случае он сводится к одной строчке из этого урока.</p>
<div data-widget="optspread" data-title="Оптимальный спред: прибыль × частота"></div>

<h2>Как читать max, argmax, sup</h2>
<ul>
<li>$\\max_\\delta g(\\delta)$ — <i>значение</i> максимума (число $34{,}3$).</li>
<li>$\\arg\\max_\\delta g(\\delta)$ — <i>точка</i>, где максимум достигается ($\\delta^*=0{,}667$). Аналогично $\\min$ и $\\arg\\min$. В курсе пишут $\\delta^*=\\arg\\max g$ — «звёздочка» помечает оптимальное значение.</li>
<li>$\\sup$ — точная верхняя грань: наименьшее число, которое не меньше всех значений. Если максимум достигается, $\\sup=\\max$. Если нет — например, у $1-e^{-x}$ на $x\\ge0$ значения подходят к 1, но не достигают её, и $\\sup=1$. $\\inf$ — то же снизу. Читайте $\\sup$ как «максимум в широком смысле».</li>
<li>«$\\min_x\\,E(x)+\\lambda V(x)$» (m06-l2) — найти $x$, при котором сумма наименьшая; для многих переменных условие первого порядка пишут по каждой: все частные производные равны нулю.</li>
</ul>

<div class="callout key"><span class="t">Что запомнить</span>
Производная — скорость изменения и наклон касательной: $f'>0$ растёт, $f'<0$ убывает. Вторая производная — кривизна: $f''>0$ выпукла (чаша), $f''<0$ вогнута. Частная производная — по одной букве при остальных замороженных; $\\Delta=\\partial V/\\partial S$. Рядом с точкой $\\Delta V\\approx V'\\Delta S+\\tfrac12V''\\Delta S^2$. Оптимум ищут из $f'=0$ и проверяют знак $f''$. Для $\\delta Ae^{-k\\delta}$ оптимум $\\delta^*=1/k$, полный симметричный спред $2/k$.
</div>
<div class="callout warn"><span class="t">Типичные ошибки</span>
<ul>
<li><b>«Нулевая производная — значит максимум».</b> Это может быть минимум или площадка; проверяйте знак второй производной или график. Если нуля внутри допустимой области нет (скажем, $\\delta\\ge0$ и $g'<0$ с самого начала), оптимум на границе.</li>
<li><b>Касательная работает только рядом.</b> На больших шагах прямая врёт (+10 против +8,3 б.п. в примере с корнем); поэтому нужен член с кривизной.</li>
<li><b>Путают $\\lambda'$ и $\\lambda/\\lambda'$:</b> первая величина имеет единицы «частота на единицу цены», вторая — просто расстояние.</li>
<li><b>Забывают минус в цепном правиле:</b> $(e^{-k\\delta})'=-ke^{-k\\delta}$, а не $ke^{-k\\delta}$.</li>
<li><b>Не следят за единицами:</b> $C'$ измеряется в долларах на акцию, а не в долларах.</li>
</ul>
</div>`,
        widgets: { tangent: widgetTangent, optspread: widgetOptSpread, taylor: widgetTaylor },
        quiz: [
          {
            q: 'Издержки влияния на цену $C(Q)=0{,}0002\\,Q^2$ долл. Чему примерно равны предельные издержки (цена ещё одной акции) при $Q=1000$?',
            options: ['0,20 долл. — столько же, сколько в среднем на акцию', '0,40 долл. — это $C\'(1000)=0{,}0004\\cdot1000$', '200 долл. — полные издержки', '0,0004 долл. — коэффициент при $Q$'],
            answer: 1,
            explain: 'Производная $C\'(Q)=0{,}0004\\,Q$, при $Q=1000$ равна 0,40. Средние издержки $C/Q=0{,}20$ — ровно вдвое меньше: следующая акция дороже средней, потому что издержки выпуклы.'
          },
          {
            q: 'Маркет-мейкер максимизирует $g(\\delta)=\\delta\\cdot100\\,e^{-2\\delta}$ (прибыль на сделку × частота). Где максимум и каким будет полный симметричный спред?',
            options: ['$\\delta^*=0{,}5$, полный спред 1,0', '$\\delta^*=2$, полный спред 4', '$\\delta^*=0{,}5$, полный спред 0,5', '$\\delta^*=1$, полный спред 2'],
            answer: 0,
            explain: '$g\'=100e^{-2\\delta}(1-2\\delta)=0$ даёт $\\delta^*=1/k=0{,}5$. Две стороны (bid и ask) — полный спред $2/k=1{,}0$. Вариант 2 путает $k$ с $1/k$.'
          },
          {
            q: 'Чему равно отношение $\\lambda(\\delta)/\\lambda\'(\\delta)$ для $\\lambda(\\delta)=Ae^{-k\\delta}$ при $k=1{,}5$ (оно входит в формулу спреда Avellaneda–Stoikov, m05-l3)?',
            options: ['$+1{,}5$', '$-1{,}5$', '$-0{,}667$', '$+0{,}667$'],
            answer: 2,
            explain: '$\\lambda\'=-kAe^{-k\\delta}=-k\\lambda$, поэтому $\\lambda/\\lambda\'=-1/k=-0{,}667$. Знак минус — потому что частота убывает с расстоянием.'
          },
          {
            q: 'Дельта опциона $0{,}5$, гамма $0{,}04$ (на единицу цены акции). Акция выросла на 2. Каково дельта-гамма приближение изменения цены опциона?',
            options: ['1,00', '1,08', '1,16', '1,04'],
            answer: 1,
            explain: '$0{,}5\\cdot2+\\tfrac12\\cdot0{,}04\\cdot2^2=1+0{,}08=1{,}08$. 1,00 — только линейный член; 1,16 получается, если забыть множитель $\\tfrac12$ и взять $0{,}04\\cdot4=0{,}16$.'
          },
          {
            q: 'Резервная цена $r=s-q\\gamma\\sigma^2(T-t)$, $\\gamma=0{,}1$, $\\sigma=2$, $T-t=0{,}5$. Чему равна частная производная $\\partial r/\\partial q$?',
            options: ['$+0{,}2$', '$-0{,}4$', '$-0{,}2$', '$-2$'],
            answer: 2,
            explain: 'От $q$ зависит только второе слагаемое: $\\partial r/\\partial q=-\\gamma\\sigma^2(T-t)=-0{,}1\\cdot4\\cdot0{,}5=-0{,}2$. Каждая лишняя акция запаса опускает резервную цену на 0,2.'
          }
        ],
        sources: [
          { title: 'Урок написан авторами курса', where: 'школьная и вузовская математика (дифференциальное исчисление одной и нескольких переменных)', note: 'единого источника в библиотеке нет; формулы курса сверены с уроками m00-l5 (греки, дельта-гамма), m04-l2 (корень), m05-l2 и m05-l3 (резервная цена, $\\lambda/\\lambda\'$, спред $2/k$), m06-l2 (выпуклость цели). Числа примера с колл-опционом посчитаны заново по формуле Блэка–Шоулза.' }
        ]
      },
      {
        id: 'mm-l5',
        title: 'Интеграл: накопление',
        minutes: 40,
        level: 'базовый',
        html: `
<p class="lead">Интеграл — это «непрерывная сумма» (вспомните $\\sum$ из mm-l3, где мы складывали конечное число слагаемых). Он нужен, как только в формуле курса встречается $\\int_0^T\\ldots dt$: накопленные издержки исполнения, накопленная дисперсия, вероятность как площадь под кривой. Понимать надо три вещи: что значит запись, как вычисляется простейший интеграл и как связаны интеграл с производной.</p>

<h2>Площадь как накопление</h2>
<p>Продаём акции со скоростью $v=200\\,000$ акций в день, пять дней подряд. Проданное — произведение $200\\,000\\cdot5=1\\,000\\,000$ — это площадь прямоугольника: высота — скорость, ширина — время. Если скорость меняется, получается фигура под кривой $v(t)$, и её площадь по-прежнему равна проданному количеству.</p>
<p>Площадь неровной фигуры считают так: режем время на узкие полоски шириной $\\Delta t$, в каждой берём скорость $v(t_i)$ и складываем $\\sum_i v(t_i)\\,\\Delta t$ — <b>сумма Римана</b>. Чем уже полоски, тем меньше ошибка; предел при $\\Delta t\\to0$ называется <b>определённым интегралом</b>:</p>
$$\\int_a^b f(x)\\,dx=\\lim_{\\Delta x\\to0}\\sum_i f(x_i)\\,\\Delta x.$$
<div class="example"><b>Числовой пример.</b> Площадь под $f(x)=x^2$ на $[0;2]$ делим на $n=4$ полоски по 0,5. Левая сумма: $(0+0{,}25+1+2{,}25)\\cdot0{,}5=1{,}75$. Правая: $(0{,}25+1+2{,}25+4)\\cdot0{,}5=3{,}75$. По середине полосок: $(0{,}0625+0{,}5625+1{,}5625+3{,}0625)\\cdot0{,}5=2{,}625$. Трапеции: $(1{,}75+3{,}75)/2=2{,}75$. Точное значение $8/3=2{,}667$. Левая сумма занижает (функция растёт), правая завышает, середина и трапеции точнее.</div>
<div data-widget="riemann" data-title="Суммы Римана: прямоугольники сходятся к площади"></div>

<h2>Как читать $\\int_a^b f(x)\\,dx$</h2>
<ul>
<li>$\\int$ — вытянутая буква S («сумма»).</li>
<li>$a$ и $b$ — начало и конец отрезка, по которому копим (нижний и верхний <b>пределы</b>).</li>
<li>$f(x)$ — высота полоски.</li>
<li>$dx$ — ширина бесконечно тонкой полоски и пометка, <i>по какой букве</i> суммируем. Это не украшение: в $\\int_0^T\\sigma^2\\,dt$ мы копим по времени, а $\\sigma$ для этого интеграла — просто число.</li>
</ul>
<p>Буква внутри «немая»: $\\int_0^2x^2dx=\\int_0^2s^2ds$. Полезные свойства: число-множитель выносится, $\\int(f+g)=\\int f+\\int g$, отрезок можно разрезать: $\\int_a^b=\\int_a^c+\\int_c^b$. Если поменять пределы местами, знак меняется. Площадь ниже оси считается отрицательной.</p>

<h2>Первообразная: интеграл как обратное действие к производной</h2>
<p>Складывать тысячи полосок не обязательно. <b>Первообразная</b> $F$ функции $f$ — это функция, у которой $F'=f$, то есть $f$ — её «наклон». Основная идея (без доказательства): накопленное изменение равно разности значений первообразной на концах:</p>
$$\\int_a^bf(x)\\,dx=F(b)-F(a).$$
<p>Если $F(t)$ — сколько продано к моменту $t$, то $f=F'$ — скорость продажи; а чтобы по скорости найти накопленное, надо проинтегрировать. Интеграл и производная — взаимно обратные действия, как сложение и вычитание. Таблица для нужных курсу случаев (проверяется дифференцированием $F$):</p>
<table>
<tr><th>$f(x)$</th><th>первообразная $F(x)$</th></tr>
<tr><td>$c$</td><td>$c\\,x$</td></tr>
<tr><td>$x^n$, $n\\ne-1$</td><td>$\\dfrac{x^{n+1}}{n+1}$</td></tr>
<tr><td>$e^{kx}$</td><td>$\\dfrac{e^{kx}}{k}$</td></tr>
<tr><td>$\\dfrac1x$</td><td>$\\ln x$ (при $x>0$)</td></tr>
</table>
<p>Проверка на примере: $\\int_0^2x^2dx=\\dfrac{2^3}{3}-\\dfrac{0^3}{3}=\\dfrac83$ — то самое точное значение.</p>

<h2>Как это выглядит в формулах курса</h2>
<p><b>1. Проданный объём.</b> Остаток позиции $x(t)$, скорость продажи $v(t)=-\\dot x(t)$. Тогда проданное за $[0,T]$ равно $x(0)-x(T)=\\int_0^Tv\\,dt$. Пример: $v(t)=400-20t$ акций в минуту, $0\\le t\\le20$; площадь — треугольник $\\tfrac12\\cdot20\\cdot400=4000$ акций.</p>
<p><b>2. Издержки исполнения (m06-l2).</b> В дискретной модели Almgren–Chriss издержки $E=\\eta\\sum n_k^2/\\tau$, где $n_k$ — продано за интервал $\\tau$. Так как $n_k=v_k\\tau$, это $\\eta\\sum v_k^2\\tau$, а в непрерывном пределе — интеграл $E=\\int_0^T\\eta\\,v(t)^2\\,dt$. Для равномерной продажи $v=X/T$ получаем $E=\\eta X^2/T$. С числами урока m06-l2 ($X=10^6$ акций, $T=5$ дней, $\\eta=2{,}5\\cdot10^{-7}$): $2{,}5\\cdot10^{-7}\\cdot10^{12}/5=50\\,000$ долл. — это «0,05 млн» из таблицы урока. Если продавать вдвое быстрее ($T=2{,}5$), издержки удвоятся.</p>
<p><b>3. Риск того же расписания.</b> Дисперсия в m06-l2 — $V=\\sigma^2\\sum\\tau x_k^2$, то есть $\\sigma^2\\int_0^Tx(t)^2dt$. Для равномерной продажи $x=X(1-t/T)$ и интеграл равен $X^2T/3$; это формула $\\sigma^2X^2T/3$ из урока. Численно стандартное отклонение $\\sigma X\\sqrt{T/3}\\approx1{,}03$ млн долл. (в таблице урока 0,99 млн: там 20 дискретных интервалов вместо непрерывного времени).</p>
<p><b>4. Накопление дисперсии (m00-l4, m06-l4).</b> Если волатильность $\\sigma$ постоянна, то $\\int_0^T\\sigma^2dt=\\sigma^2T$. При $\\sigma=0{,}8$ за день и $T=5$ дней дисперсия $0{,}64\\cdot5=3{,}2$, стандартное отклонение $\\sqrt{3{,}2}=1{,}79=\\sigma\\sqrt T$. Так из интеграла появляется «правило корня из времени».</p>
<div data-widget="sched" data-title="Расписание продажи: скорость, проданное и издержки как площади"></div>
<div class="example"><b>Быстрее в начале — пошагово.</b> Пусть остаток падает по закону $x(t)=X(1-t/T)^2$. Скорость — минус производная: $v(t)=\\dfrac{2X}{T}\\left(1-\\dfrac tT\\right)$; в начале она вдвое выше равномерной ($400\\,000$ против $200\\,000$ акций в день) и линейно спадает к нулю. Проверка: проданное $\\int_0^Tv\\,dt=X$, так и должно быть. Издержки: $\\eta\\int_0^T\\dfrac{4X^2}{T^2}\\left(1-\\dfrac tT\\right)^2dt=\\dfrac{4X^2\\eta}{T^2}\\cdot\\dfrac T3=\\dfrac43\\cdot\\dfrac{\\eta X^2}{T}$, то есть $66\\,667$ долл. против $50\\,000$. Риск: $\\int x^2dt=X^2T/5$ вместо $X^2T/3$, и стандартное отклонение падает с 1,03 до 0,80 млн долл. Так цена быстрого старта выражена двумя интегралами: издержки выросли на треть, риск снизился примерно на 22%. Это ровно тот обмен, который в m06-l2 решает параметр срочности $\\kappa$.</div>
<p>Приём самопроверки, который стоит усвоить: любой интеграл можно проверить дифференцированием. Нашли $F(t)=-e^{-\\lambda t}$ — возьмите производную и убедитесь, что получилось $\\lambda e^{-\\lambda t}$. Если не получилось, ошиблись в знаке или забыли множитель $k$ из таблицы ($\\int e^{kx}dx=e^{kx}/k$, а не $e^{kx}$).</p>

<h2>Среднее значение функции</h2>
<p>Среднее значение функции на отрезке — интеграл, делённый на длину отрезка: $\\bar f=\\dfrac1{b-a}\\int_a^bf(x)\\,dx$. Среднее $x^2$ на $[0;2]$ равно $\\dfrac{8/3}{2}=\\dfrac43$. Остаток при равномерной продаже $x(t)=X(1-t/T)$ в среднем равен $X/2$: за время исполнения мы держим в среднем половину начальной позиции. Это конкретная реализация формулы «среднее — это сумма, делённая на число» из mm-l3, только слагаемых бесконечно много.</p>

<h2>Плотность вероятности и математическое ожидание</h2>
<p>Если величина принимает любые значения на отрезке, её вероятности задаёт <b>плотность</b> $f(x)$: вероятность попасть в $[a,b]$ равна площади $\\int_a^bf(x)\\,dx$, а вся площадь равна 1. Среднее (математическое ожидание) — те же «значения, взвешенные вероятностями», но с интегралом вместо суммы: $\\mathbb E[X]=\\int x\\,f(x)\\,dx$ (подробнее о вероятности — mm-l6).</p>
<div class="example"><b>Время ожидания исполнения.</b> Заявка исполняется с интенсивностью $\\lambda$, время до исполнения имеет плотность $f(t)=\\lambda e^{-\\lambda t}$, $t\\ge0$. Проверим, что вся площадь равна 1: первообразная $-e^{-\\lambda t}$, значит $0-(-1)=1$. Ожидание $\\mathbb E[T]=\\int_0^\\infty t\\,\\lambda e^{-\\lambda t}dt=1/\\lambda$ (получается интегрированием по частям — принимаем). Для $\\lambda=39{,}4$ (пример из m05-l3) это $0{,}0254$ единицы времени. Вероятность исполниться за $dt=0{,}005$ — точно $1-e^{-0{,}197}=0{,}179$, а $\\lambda\\,dt=0{,}197$ — приближение для малых шагов (оно в mm-l7).</div>
<p>Для нормального распределения плотность — колокол $\\varphi(z)=\\dfrac1{\\sqrt{2\\pi}}e^{-z^2/2}$, а <b>функция нормального распределения</b> $\\Phi(z)=\\int_{-\\infty}^z\\varphi(u)\\,du$ — площадь под колоколом левее $z$. Первообразной $\\varphi$ в элементарных функциях нет, поэтому $\\Phi$ берут из таблицы или считают численно — суммой тонких полосок, как в виджете. Полезные точки: $\\Phi(1)-\\Phi(-1)=68{,}3\\%$, ±2σ — $95{,}4\\%$, ±3σ — $99{,}7\\%$, $\\Phi(2{,}326)=99\\%$ (множитель VaR в m06-l4).</p>
<div data-widget="bell" data-title="Площадь под колоколом: вероятность попасть в ±kσ"></div>

<div class="callout key"><span class="t">Что запомнить</span>
Определённый интеграл $\\int_a^bf\\,dx$ — площадь под графиком, предел сумм Римана $\\sum f(x_i)\\Delta x$. Пределы задают отрезок, $dx$ — переменную, по которой копим. Интеграл — обратное действие к производной: $\\int_a^bf\\,dx=F(b)-F(a)$ при $F'=f$. Интеграл скорости — накопленное изменение: проданное $=\\int v\\,dt$; издержки — $\\int\\eta v^2dt$; дисперсия — $\\int\\sigma^2dt=\\sigma^2T$. Вероятность — площадь под плотностью, ожидание — $\\int x f(x)dx$.
</div>
<div class="callout warn"><span class="t">Типичные ошибки</span>
<ul>
<li><b>Путают единицы.</b> $\\int v\\,dt$ — акции, а не «акции в день»: интеграл умножает на время.</li>
<li><b>Знак.</b> Площадь под осью отрицательна; интеграл скорости покупки при продаже имеет противоположный знак.</li>
<li><b>$\\int\\sigma^2dt=\\sigma^2T$ — только при постоянной $\\sigma$.</b> Если волатильность меняется, надо интегрировать честно.</li>
<li><b>Левая и правая суммы смещены систематически</b> (для растущей функции — вниз и вверх); при малом числе полосок доверять им нельзя.</li>
<li><b>Бесконечные пределы</b> ($\\int_0^\\infty$) работают лишь тогда, когда площадь конечна; у $\\int_1^\\infty dx/x$ она бесконечна.</li>
<li><b>Забывают $dx$.</b> Без него непонятно, по какой переменной суммируем и какую «ширину» умножаем.</li>
</ul>
</div>`,
        widgets: { riemann: widgetRiemann, sched: widgetSchedule, bell: widgetBell },
        quiz: [
          {
            q: 'Скорость продажи убывает по линейному закону $v(t)=400-20t$ акций в минуту на отрезке $0\\le t\\le20$ минут. Сколько акций продано?',
            options: ['400', '8000', '4000', '2000'],
            answer: 2,
            explain: 'Проданное равно площади под графиком: треугольник с основанием 20 и высотой 400, $\\tfrac12\\cdot20\\cdot400=4000$. 8000 — площадь прямоугольника $20\\times400$.'
          },
          {
            q: 'Равномерная продажа $X$ акций за время $T$ стоит $E=\\int_0^T\\eta v^2dt=\\eta X^2/T$. Срок продажи удвоили (при тех же $X$ и $\\eta$). Как изменятся издержки?',
            options: ['уменьшатся вдвое', 'не изменятся', 'уменьшатся вчетверо', 'вырастут вдвое'],
            answer: 0,
            explain: 'Скорость $X/T$ упала вдвое, её квадрат — вчетверо, но интегрируем по времени вдвое дольше: $\\tfrac14\\cdot2=\\tfrac12$. Формула $\\eta X^2/T$ даёт то же.'
          },
          {
            q: 'Волатильность постоянна, $\\sigma=0{,}8$ за день. Чему равна накопленная дисперсия $\\int_0^4\\sigma^2dt$ за 4 дня?',
            options: ['3,2', '1,6', '0,64', '2,56'],
            answer: 3,
            explain: '$\\sigma^2T=0{,}64\\cdot4=2{,}56$, стандартное отклонение $1{,}6=\\sigma\\sqrt T$. Вариант 1,6 — это уже стандартное отклонение, а 3,2 — дисперсия за 5 дней.'
          },
          {
            q: 'Для $f(x)=x^2$ на $[0;2]$ две полоски дают левую сумму 1 и правую сумму 5 (точное значение $8/3$). Что даст метод трапеций с $n=2$?',
            options: ['2,5', '3', '8/3', '6'],
            answer: 1,
            explain: 'Трапеции — среднее левой и правой сумм: $(1+5)/2=3$. Метод средней точки дал бы 2,5, ближе к точному 2,667, но это другой способ.'
          },
          {
            q: 'Дневное изменение цены нормально, среднее 100, $\\sigma=2$. Примерно какова вероятность, что цена окажется в интервале $[96;104]$?',
            options: ['68%', '50%', '99,7%', '95%'],
            answer: 3,
            explain: 'Интервал — это $\\pm2\\sigma$, площадь под колоколом равна $95{,}4\\approx95\\%$. 68% — это $\\pm1\\sigma$ (интервал [98; 102]), 99,7% — $\\pm3\\sigma$.'
          }
        ],
        sources: [
          { title: 'Урок написан авторами курса', where: 'школьная и вузовская математика (определённый интеграл, плотность вероятности)', note: 'единого источника в библиотеке нет; формулы курса сверены с уроками m06-l2 (издержки $\\eta\\sum n_k^2/\\tau$, дисперсия $\\sigma^2\\sum\\tau x_k^2$, равномерная продажа $\\eta X^2/T$ и $\\sigma^2X^2T/3$), m06-l4 (множитель 2,326), m05-l3 (пример $\\lambda\\approx39{,}4$). Все числа посчитаны заново.' }
        ]
      }
    ],
    terms: [
      { en: 'derivative', ru: 'производная функции', def: 'Предел отношения приращений $f\'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}$: скорость изменения функции и наклон касательной к её графику в точке.' },
      { en: 'partial derivative', ru: 'частная производная', def: 'Производная функции нескольких переменных по одной из них при остальных, зафиксированных как константы: $\\Delta=\\partial V/\\partial S$.' },
      { en: 'second derivative', ru: 'вторая производная', def: 'Производная от производной, $f\'\'$: кривизна графика. $f\'\'>0$ — функция выпукла, $f\'\'<0$ — вогнута; в опционах $\\Gamma=\\partial^2V/\\partial S^2$.' },
      { en: 'convex function', ru: 'выпуклость функции', def: 'Свойство «чаши»: график лежит над любой своей касательной, вторая производная неотрицательна. У выпуклой цели условие $f\'=0$ даёт единственный минимум.' },
      { en: 'marginal cost', ru: 'предельные издержки', def: 'Добавочные издержки ещё одной единицы объёма, то есть производная $C\'(Q)$ полных издержек. При выпуклых издержках выше средних.' },
      { en: 'first-order condition', ru: 'условие первого порядка', def: 'Необходимое условие оптимума гладкой функции: производная равна нулю ($g\'(\\delta)=0$). Максимум это или минимум, показывает знак второй производной.' },
      { en: 'argmax', ru: 'точка максимума', def: 'Значение аргумента, при котором функция максимальна: $\\delta^*=\\arg\\max_\\delta g(\\delta)$. Сам максимум записывают $\\max_\\delta g(\\delta)$; $\\sup$ — точная верхняя грань, если максимум не достигается.' },
      { en: 'integral (definite)', ru: 'определённый интеграл', def: '$\\int_a^b f(x)\\,dx$: предел сумм $\\sum f(x_i)\\Delta x$, площадь под графиком $f$ на отрезке $[a,b]$; накопленное изменение, если $f$ — скорость.' },
      { en: 'antiderivative', ru: 'первообразная', def: 'Функция $F$ с $F\'=f$. Тогда $\\int_a^b f\\,dx=F(b)-F(a)$: интеграл — действие, обратное производной.' },
      { en: 'Riemann sum', ru: 'сумма Римана', def: 'Приближение интеграла суммой площадей узких прямоугольников $\\sum f(x_i)\\Delta x$ (левых, правых или по середине); при $\\Delta x\\to0$ сходится к интегралу.' }
    ]
  });
})();
