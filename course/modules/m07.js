/* Модуль 7. HFT и динамика потока заявок.
   Источники: [22] O'Hara 2015; [23] Aldridge 2010; [21] Hasbrouck (слайды HFQ); [32] Rambaldi–Bacry–Lillo; [17] van Kervel. */
(function () {
  const U = () => Course.ui;
  const col = (n) => Course.ui.color(n);

  /* ------------------------------------------------------------------ */
  /* Виджет 1. Лупа времени: один поток котировок на трёх масштабах      */
  /* ------------------------------------------------------------------ */
  function lupaWidget(root) {
    const T = 1e6; // 1 секунда в микросекундах
    const scales = [
      { w: 1e6, name: '1 с' },
      { w: 1e4, name: '10 мс' },
      { w: 100, name: '100 мкс' }
    ];
    let seed = 11, ev = [], bursts = [], bi = 0, sc = 0, startUs = 0;

    function gen() {
      const r = Course.rand.seeded(seed), arr = [];
      for (let i = 0; i < 300; i++) arr.push({ t: r() * T, k: 0 });
      bursts = [];
      for (let b = 0; b < 25; b++) {
        const c0 = 5000 + r() * (T - 30000), fl = r() < 0.6, n = 60 + Math.floor(r() * 80);
        bursts.push(c0 + 700);
        let t = c0;
        for (let i = 0; i < n; i++) { t += -Math.log(1 - r()) * 15; arr.push({ t, k: 1, fl }); }
      }
      bursts.sort((a, b) => a - b);
      arr.sort((a, b) => a.t - b.t);
      let base = 0;
      ev = arr.map((e) => {
        if (e.k === 0) { if (r() < 0.5) base += r() < 0.5 ? -1 : 1; return { t: e.t, p: base }; }
        if (e.fl) return { t: e.t, p: base + (r() < 0.5 ? 1 : 0) };
        if (r() < 0.4) base += r() < 0.5 ? -1 : 1;
        return { t: e.t, p: base };
      });
    }
    gen();

    const pos = U().slider(root, {
      label: 'Положение окна в секунде', min: 0, max: 10000, step: 1, value: 0,
      fmt: (v) => Course.fmt.n(v / 10000, 2) + ' с',
      onInput: (v) => { startUs = (v / 10000) * (T - scales[sc].w); draw(); }
    });
    U().slider(root, {
      label: 'Масштаб (ширина окна)', min: 0, max: 2, step: 1, value: 0,
      fmt: (v) => scales[Math.round(v)].name,
      onInput: (v) => { sc = Math.round(v); startUs = Math.min(startUs, T - scales[sc].w); draw(); }
    });
    const box = root.querySelector('.w-controls');
    const goBurst = () => {
      const c = bursts[bi++ % bursts.length], w = scales[sc].w;
      startUs = Math.max(0, Math.min(T - w, c - w / 2));
      pos.set(Math.round((startUs / Math.max(1, T - w)) * 10000));
      draw();
    };
    U().button(box, 'К следующему «пакету» котировок', goBurst);
    U().button(box, '← половина окна', () => { startUs = Math.max(0, startUs - scales[sc].w / 2); sync(); }, true);
    U().button(box, 'половина окна →', () => { startUs = Math.min(T - scales[sc].w, startUs + scales[sc].w / 2); sync(); }, true);
    U().button(box, 'Новая реализация', () => { seed += 7; gen(); bi = 0; startUs = 0; sync(); }, true);
    function sync() { pos.set(Math.round((startUs / Math.max(1, T - scales[sc].w)) * 10000)); draw(); }

    const c = U().canvas(root, 640, 300), out = U().output(root);

    function fmtT(t) {
      if (sc === 0) return Course.fmt.n(t / 1e6, 2) + ' с';
      if (sc === 1) return Course.fmt.n(t / 1000, 1) + ' мс';
      return Course.fmt.n(t / 1000, 3) + ' мс';
    }

    function draw() {
      const ctx = c.getContext('2d'), W = c.logicalW, H = c.logicalH;
      const pad = { l: 56, r: 14, t: 26, b: 40 };
      const w = scales[sc].w, t0 = Math.max(0, Math.min(T - w, startUs)), t1 = t0 + w;
      ctx.clearRect(0, 0, W, H);
      let p0 = 0, inWin = [], changes = 0;
      for (const e of ev) { if (e.t < t0) p0 = e.p; else if (e.t <= t1) inWin.push(e); else break; }
      const pts = [[t0, p0]];
      let prev = p0;
      for (const e of inWin) { pts.push([e.t, prev]); pts.push([e.t, e.p]); if (e.p !== prev) changes++; prev = e.p; }
      pts.push([t1, prev]);
      let lo = Math.min(...pts.map((q) => q[1])), hi = Math.max(...pts.map((q) => q[1]));
      if (hi - lo < 2) { lo -= 1; hi += 1; } else { lo -= 1; hi += 1; }
      const X = (t) => pad.l + ((t - t0) / w) * (W - pad.l - pad.r);
      const Y = (p) => H - pad.b - ((p - lo) / (hi - lo)) * (H - pad.t - pad.b);
      const ink = col('--ink'), muted = col('--muted'), grid = col('--grid');
      ctx.font = '12px system-ui,sans-serif'; ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.lineWidth = 1;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const stepP = Math.max(1, Math.ceil((hi - lo) / 6));
      for (let p = Math.ceil(lo); p <= hi; p += stepP) { const y = Y(p); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(String(p), pad.l - 6, y); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i <= 4; i++) { const t = t0 + (w * i) / 4, x = X(t); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke(); ctx.fillText(fmtT(t), x, H - pad.b + 5); }
      ctx.strokeStyle = col('--c1'); ctx.lineWidth = 1.6; ctx.beginPath();
      pts.forEach((q, i) => { const x = X(q[0]), y = Y(q[1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      ctx.fillStyle = col('--c2');
      for (const e of inWin) ctx.fillRect(X(e.t) - 1.5, Y(e.p) - 1.5, 3, 3);
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = '600 13px system-ui,sans-serif';
      ctx.fillText('Лучшая цена покупки (bid), тики; окно ' + scales[sc].name, (pad.l + W - pad.r) / 2, 16);
      ctx.font = '12px system-ui,sans-serif';
      ctx.fillText('время внутри секунды', (pad.l + W - pad.r) / 2, H - 4);
      ctx.save(); ctx.translate(12, (pad.t + H - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('цена, тиков', 0, 0); ctx.restore();
      out.innerHTML = 'В окне <b>' + scales[sc].name + '</b>: обновлений котировки <b>' + inWin.length + '</b>, из них со сменой цены <b>' + changes +
        '</b>. За всю секунду в потоке <b>' + ev.length + '</b> обновлений. Наблюдатель, смотрящий на рынок раз в секунду, видит из них одно значение. ' +
        '<span style="color:var(--muted)">(Учебная синтетика: фон + «пакеты» быстрых обновлений, у части пакетов цена мерцает между двумя тиками.)</span>';
    }
    draw();
  }

  /* ------------------------------------------------------------------ */
  /* Виджет 2. Parent-ордер по VWAP-профилю + классификация сделок       */
  /* ------------------------------------------------------------------ */
  function parentChildWidget(root) {
    const B = 13;
    const prof = [];
    for (let b = 0; b < B; b++) prof.push(1 + 1.5 * Math.pow((b - 6) / 6, 2));
    const ps = prof.reduce((a, b) => a + b, 0);
    for (let b = 0; b < B; b++) prof[b] /= ps;
    let seed = 5, N = 1000, agg = 12.57, err = 0;

    U().slider(root, { label: 'Число дочерних сделок', min: 200, max: 5000, step: 100, value: N, fmt: (v) => String(Math.round(v)), onInput: (v) => { N = v; draw(); } });
    U().slider(root, { label: 'Доля агрессивных исполнений, %', min: 0, max: 80, step: 0.5, value: agg, fmt: (v) => Course.fmt.n(v, 1), onInput: (v) => { agg = v; draw(); } });
    U().slider(root, { label: 'Дополнительная ошибка классификатора, %', min: 0, max: 40, step: 1, value: err, fmt: (v) => Math.round(v) + '%', onInput: (v) => { err = v; draw(); } });
    U().button(root.querySelector('.w-controls'), 'Другая выборка', () => { seed += 3; draw(); }, true);
    const c = U().canvas(root, 640, 300), out = U().output(root);

    function draw() {
      const r = Course.rand.seeded(seed);
      const a = agg / 100, rest = 1 - a, m = rest * (21.90 / (21.90 + 65.53));
      const cA = new Array(B).fill(0), cM = new Array(B).fill(0), cP = new Array(B).fill(0);
      let Bk = 0, Sk = 0, Un = 0;
      const n = Math.round(N);
      for (let i = 0; i < n; i++) {
        let u = r(), b = 0, acc = prof[0];
        while (u > acc && b < B - 1) { b++; acc += prof[b]; }
        const x = r();
        let lab; // метка классификатора
        if (x < a) { cA[b]++; lab = 1; }
        else if (x < a + m) { cM[b]++; lab = 0; }
        else { cP[b]++; lab = -1; }
        if (lab !== 0 && r() < err / 100) lab = -lab;
        if (lab === 1) Bk++; else if (lab === -1) Sk++; else Un++;
      }
      // стековые столбцы
      const ctx = c.getContext('2d'), W = c.logicalW, H = c.logicalH, pad = { l: 52, r: 14, t: 28, b: 44 };
      ctx.clearRect(0, 0, W, H);
      const tot = cA.map((v, i) => v + cM[i] + cP[i]), mx = Math.max(1, ...tot);
      const Y = (v) => H - pad.b - (v / mx) * (H - pad.t - pad.b), bw = (W - pad.l - pad.r) / B;
      ctx.font = '12px system-ui,sans-serif'; ctx.strokeStyle = col('--grid'); ctx.fillStyle = col('--muted'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) { const v = (mx * i) / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(String(Math.round(v)), pad.l - 6, y); }
      for (let b = 0; b < B; b++) {
        const x = pad.l + b * bw + bw * 0.1, w = bw * 0.8;
        let base = 0;
        [[cP[b], col('--c2')], [cM[b], col('--muted')], [cA[b], col('--c1')]].forEach(([v, cl]) => { ctx.fillStyle = cl; ctx.fillRect(x, Y(base + v), w, Y(base) - Y(base + v)); base += v; });
      }
      ctx.fillStyle = col('--muted'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let b = 0; b < B; b += 2) { const mins = 570 + 30 * b; ctx.fillText(Math.floor(mins / 60) + ':' + (mins % 60 === 0 ? '00' : '30'), pad.l + b * bw + bw / 2, H - pad.b + 5); }
      ctx.fillStyle = col('--ink'); ctx.font = '600 13px system-ui,sans-serif'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Дочерние сделки одного родительского BUY-ордера по получасам дня (профиль объёма — учебный)', (pad.l + W - pad.r) / 2, 16);
      ctx.font = '12px system-ui,sans-serif';
      let lx = pad.l + 6; ctx.textAlign = 'left';
      [['агрессивные (выглядят как покупки)', col('--c1')], ['на середине', col('--muted')], ['пассивные (выглядят как продажи)', col('--c2')]].forEach(([t, cl]) => { ctx.fillStyle = cl; ctx.fillRect(lx, H - 14, 12, 8); ctx.fillStyle = col('--ink'); ctx.fillText(t, lx + 16, H - 6); lx += 30 + ctx.measureText(t).width; });
      const cl = Bk + Sk, imb = cl ? (Bk - Sk) / cl : 0;
      const sA = cA.reduce((x, y) => x + y, 0), sM = cM.reduce((x, y) => x + y, 0), sP = cP.reduce((x, y) => x + y, 0);
      out.innerHTML = 'Истина: <b>100% покупка</b> (все ' + n + ' дочерних сделок — части одного BUY). Исполнено: агрессивно ' + Course.fmt.n(100 * sA / n, 1) + '%, на середине ' +
        Course.fmt.n(100 * sM / n, 1) + '%, пассивно ' + Course.fmt.n(100 * sP / n, 1) + '%.<br>Классификатор по «стороне инициатора» записал: покупок <b>' + Bk + '</b>, продаж <b>' + Sk +
        '</b>, не определено ' + Un + '. Дисбаланс (B−S)/(B+S) = <b>' + Course.fmt.n(imb, 2) + '</b> при истинном +1,00.';
    }
    draw();
  }

  /* ------------------------------------------------------------------ */
  /* Виджет 3. Шум котировок: signature plot и риск TWAP                 */
  /* ------------------------------------------------------------------ */
  function hfqWidget(root) {
    const T = 400000, sig = 0.2; // мс; σ в тиках на √мс
    const r = Course.rand.seeded(21);
    const eff = new Float32Array(T), Z = new Float32Array(T);
    let acc = 0;
    for (let t = 0; t < T; t++) { acc += sig * Course.rand.normal(r); eff[t] = acc; Z[t] = Course.rand.normal(r); }
    let s = 0.4, f = 0.3, D = 20;

    U().slider(root, { label: 'Размах шума котировок s, тиков', min: 0, max: 1.5, step: 0.05, value: s, onInput: (v) => { s = v; draw(); } });
    U().slider(root, { label: 'Доля времени в HFQ-эпизоде', min: 0, max: 1, step: 0.05, value: f, fmt: (v) => Math.round(v * 100) + '%', onInput: (v) => { f = v; draw(); } });
    U().slider(root, { label: 'Случайная задержка заявки до, мс', min: 1, max: 200, step: 1, value: D, fmt: (v) => Math.round(v) + ' мс', onInput: (v) => { D = v; draw(); } });
    const c1 = U().canvas(root, 640, 240), c2 = U().canvas(root, 640, 260), out = U().output(root);

    function draw() {
      const ep0 = Math.floor(0.2 * T), ep1 = Math.min(T, ep0 + Math.floor(f * T));
      const obs = (t) => eff[t] + (t >= ep0 && t < ep1 ? s * Z[t] : 0);
      // фрагмент
      const a = ep0 - 100, xs = [], ya = [], yb = [];
      for (let i = 0; i < 300; i++) { xs.push(i - 100); ya.push(eff[a + i]); yb.push(obs(a + i)); }
      Course.plot.line(c1, { series: [{ x: xs, y: ya, label: 'эффективная цена', color: col('--muted'), width: 1.5 }, { x: xs, y: yb, label: 'наблюдаемая котировка', color: col('--c1'), width: 1.5 }], xlabel: 'мс от начала эпизода шума', ylabel: 'тики', title: 'Фрагмент 300 мс: шум включается в нуле' });
      // signature plot
      const lags = [], vals = [];
      for (let k = 0; k <= 10; k++) {
        const tau = 1 << k; let sum = 0, cnt = 0;
        for (let t = 0; t + tau < T; t++) { const d = obs(t + tau) - obs(t); sum += d * d; cnt++; }
        lags.push(k); vals.push(sum / cnt / tau);
      }
      const ref = vals[vals.length - 1], norm = vals.map((v) => v / ref);
      Course.plot.line(c2, { series: [{ x: lags, y: lags.map(() => 1), label: 'случайное блуждание = 1', color: col('--muted'), dash: [5, 4] }, { x: lags, y: norm, label: 'с шумом котировок', color: col('--c2') }], xlabel: 'log2 горизонта в мс (0 = 1 мс, 10 = 1024 мс)', ylabel: 'дисперсия / τ, отн. 1024 мс', title: 'Signature plot (упрощённый аналог нормировки из слайдов)', ymin: 0 });
      // риск TWAP: заявка планировалась на t, исполнена на t+d, d ~ U(0, D)
      const rr = Course.rand.seeded(99); let s1 = 0, s2 = 0; const M = 20000;
      for (let i = 0; i < M; i++) {
        const t = Math.floor(rr() * (T - 300)), d = Math.floor(rr() * (D + 1));
        const x1 = obs(t + d) - obs(t), x2 = eff[t + d] - eff[t]; s1 += x1 * x1; s2 += x2 * x2;
      }
      out.innerHTML = 'Превышение на 1 мс: <b>' + Course.fmt.n(norm[0], 2) + '×</b> относительно случайного блуждания (на 1024 мс — 1 по построению). ' +
        'Ценовой риск от случайной задержки до ' + Math.round(D) + ' мс (СКО изменения цены): без шума <b>' + Course.fmt.n(Math.sqrt(s2 / M), 2) + '</b> тика, с шумом <b>' + Course.fmt.n(Math.sqrt(s1 / M), 2) +
        '</b> тика.<br><span style="color:var(--muted)">Учебная модель: эффективная цена — случайное блуждание, шум котировок — независимая добавка на интервале эпизода. В исследовании Hasbrouck вместо дисперсии разностей используется вейвлет-дисперсия.</span>';
    }
    draw();
  }

  /* ------------------------------------------------------------------ */
  /* Виджет 4. Процесс Хоукса с экспоненциальным ядром                   */
  /* ------------------------------------------------------------------ */
  function hawkesWidget(root) {
    const T = 40, CAP = 4000;
    let mu = 0.5, alpha = 1.2, beta = 2, seed = 4;

    U().slider(root, { label: 'μ — базовая интенсивность, событий/с', min: 0.05, max: 3, step: 0.05, value: mu, onInput: (v) => { mu = v; draw(); } });
    U().slider(root, { label: 'α — прирост интенсивности от события', min: 0, max: 6, step: 0.05, value: alpha, onInput: (v) => { alpha = v; draw(); } });
    U().slider(root, { label: 'β — скорость затухания, 1/с', min: 0.2, max: 10, step: 0.1, value: beta, onInput: (v) => { beta = v; draw(); } });
    U().button(root.querySelector('.w-controls'), 'Новая реализация', () => { seed += 5; draw(); }, true);
    const c1 = U().canvas(root, 640, 250), c2 = U().canvas(root, 640, 110), out = U().output(root);

    function sim(rng) {
      const ev = []; let t = 0, S = 0;
      while (t < T && ev.length < CAP) {
        const M = mu + S, w = -Math.log(1 - rng()) / M;
        t += w; if (t >= T) break;
        S *= Math.exp(-beta * w);
        if (rng() * M <= mu + S) { ev.push(t); S += alpha; }
      }
      return { ev, tEnd: ev.length >= CAP ? ev[ev.length - 1] : T };
    }
    const fano = (ev, tEnd, bin) => {
      const nb = Math.max(2, Math.floor(tEnd / bin)), cnt = new Array(nb).fill(0);
      for (const t of ev) { const k = Math.floor(t / bin); if (k < nb) cnt[k]++; }
      const m = cnt.reduce((a, b) => a + b, 0) / nb; if (m === 0) return NaN;
      const v = cnt.reduce((a, b) => a + (b - m) * (b - m), 0) / (nb - 1);
      return v / m;
    };

    function draw() {
      const rng = Course.rand.seeded(seed), res = sim(rng), ev = res.ev, tEnd = res.tEnd, n = alpha / beta;
      // интенсивность на сетке
      const G = 1200, xs = [], ys = [];
      let j = 0, S = 0, tl = 0; // S — вклад событий в момент tl
      for (let g = 0; g <= G; g++) {
        const t = (g / G) * tEnd;
        while (j < ev.length && ev[j] <= t) { S = S * Math.exp(-beta * (ev[j] - tl)) + alpha; tl = ev[j]; j++; }
        xs.push(t); ys.push(mu + S * Math.exp(-beta * (t - tl)));
      }
      const series = [{ x: xs, y: ys, label: 'λ(t)', color: col('--c1'), width: 1.4 }];
      if (n < 1) { const L = mu / (1 - n); series.push({ x: [0, tEnd], y: [L, L], label: 'средняя Λ = μ/(1−n)', color: col('--c2'), dash: [6, 4] }); }
      Course.plot.line(c1, { series, xlabel: 'время, с', ylabel: 'интенсивность, 1/с', title: 'Условная интенсивность Хоукса (экспоненциальное ядро)', ymin: 0 });
      // метки событий: Хоукс и Пуассон той же интенсивности
      const rp = Course.rand.seeded(seed + 1000), pe = [];
      for (let i = 0; i < ev.length; i++) pe.push(rp() * tEnd);
      pe.sort((a, b) => a - b);
      const ctx = c2.getContext('2d'), W = c2.logicalW, H = c2.logicalH, l = 52, rr = 14;
      ctx.clearRect(0, 0, W, H);
      ctx.font = '12px system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const row = (arr, y, cl, name) => { ctx.strokeStyle = cl; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; for (const t of arr) { const x = l + (t / tEnd) * (W - l - rr); ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14); ctx.stroke(); } ctx.globalAlpha = 1; ctx.fillStyle = col('--ink'); ctx.fillText(name, 2, y - 18 + 2); };
      row(ev, 34, col('--c1'), 'Хоукс');
      row(pe, 82, col('--muted'), 'Пуассон с тем же числом событий');
      const T2 = ev.length, rate = T2 / tEnd;
      const fh = fano(ev, tEnd, 1), fp = fano(pe, tEnd, 1);
      let txt = 'Ветвление n = α/β = <b>' + Course.fmt.n(n, 2) + '</b>. ';
      if (n < 1) txt += 'Теория: Λ = μ/(1−n) = <b>' + Course.fmt.n(mu / (1 - n), 2) + '</b> 1/с; доля «экзогенных» событий (приходят от μ) = 1−n = <b>' + Course.fmt.n(100 * (1 - n), 0) + '%</b>; в одном кластере в среднем 1/(1−n) = ' + Course.fmt.n(1 / (1 - n), 2) + ' событий. ';
      else txt += '<b>n ≥ 1: процесс не стационарен</b> — интенсивность разгоняется, расчёт остановлен на ' + CAP + ' событиях (t = ' + Course.fmt.n(tEnd, 1) + ' с). ';
      txt += 'В симуляции: ' + T2 + ' событий, средняя скорость ' + Course.fmt.n(rate, 2) + ' 1/с. Индекс дисперсии счётчика в окнах по 1 с (дисперсия/среднее; у Пуассона ≈ 1): Хоукс <b>' + Course.fmt.n(fh, 2) + '</b>, Пуассон ' + Course.fmt.n(fp, 2) + '.';
      out.innerHTML = txt;
    }
    draw();
  }

  /* ------------------------------------------------------------------ */
  /* Виджет 5. Гонка за устаревшей котировкой                            */
  /* ------------------------------------------------------------------ */
  function raceWidget(root) {
    let Lf = 150, Lm = 250, Ls = 5000, jit = 60, K = 2, J = 1, seed = 3;
    U().slider(root, { label: 'Латентность быстрого трейдера, мкс', min: 20, max: 1000, step: 10, value: Lf, fmt: (v) => Math.round(v) + ' мкс', onInput: (v) => { Lf = v; draw(); } });
    U().slider(root, { label: 'Время отмены у маркет-мейкера, мкс', min: 20, max: 1000, step: 10, value: Lm, fmt: (v) => Math.round(v) + ' мкс', onInput: (v) => { Lm = v; draw(); } });
    U().slider(root, { label: 'Латентность медленного трейдера, мкс', min: 500, max: 50000, step: 500, value: Ls, fmt: (v) => Course.fmt.n(v / 1000, 1) + ' мс', onInput: (v) => { Ls = v; draw(); } });
    U().slider(root, { label: 'Разброс задержки (σ), мкс', min: 5, max: 300, step: 5, value: jit, fmt: (v) => Math.round(v) + ' мкс', onInput: (v) => { jit = v; draw(); } });
    U().slider(root, { label: 'Число быстрых соперников', min: 1, max: 5, step: 1, value: K, fmt: (v) => String(Math.round(v)), onInput: (v) => { K = Math.round(v); draw(); } });
    U().slider(root, { label: 'Скачок «справедливой» цены, тиков', min: 1, max: 5, step: 1, value: J, fmt: (v) => String(Math.round(v)), onInput: (v) => { J = Math.round(v); draw(); } });
    U().button(root.querySelector('.w-controls'), 'Один розыгрыш', () => { seed += 1; one(); }, true);
    const cb = U().canvas(root, 640, 230), ct = U().canvas(root, 640, 150), out = U().output(root);
    const arr = (L, sd, r) => Math.max(1, L + sd * Course.rand.normal(r));

    function one() {
      const r = Course.rand.seeded(seed * 7919 + 13);
      const fast = []; for (let i = 0; i < K; i++) fast.push(arr(Lf, jit, r));
      const items = fast.map((t, i) => ({ t, name: 'быстрый ' + (i + 1), cl: col('--c1') }));
      items.push({ t: arr(Lm, jit, r), name: 'MM: отмена', cl: col('--bad') });
      items.push({ t: arr(Ls, Math.max(jit, 0.2 * Ls), r), name: 'медленный', cl: col('--c3') });
      const ctx = ct.getContext('2d'), W = ct.logicalW, H = ct.logicalH, l = 30, rr = 20;
      const X = (t) => l + ((Math.log10(Math.max(t, 10)) - 1) / 4) * (W - l - rr);
      ctx.clearRect(0, 0, W, H); ctx.font = '12px system-ui,sans-serif';
      ctx.strokeStyle = col('--grid'); ctx.fillStyle = col('--muted'); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      [10, 100, 1000, 10000, 100000].forEach((v) => { const x = X(v); ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, H - 30); ctx.stroke(); ctx.fillText(v >= 1000 ? v / 1000 + ' мс' : v + ' мкс', x, H - 24); });
      ctx.fillStyle = col('--ink'); ctx.font = '600 13px system-ui,sans-serif'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Один розыгрыш: моменты прихода заявок после новости (лог. шкала времени)', W / 2, 16);
      ctx.font = '12px system-ui,sans-serif';
      items.sort((a, b) => a.t - b.t);
      items.forEach((it, i) => { const x = X(it.t), y = 40 + (i % 4) * 18; ctx.strokeStyle = it.cl; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, H - 30); ctx.stroke(); ctx.fillStyle = it.cl; ctx.textAlign = x > W - 110 ? 'right' : 'left'; ctx.fillText((i + 1) + '. ' + it.name + ' ' + Math.round(it.t) + ' мкс', x + (x > W - 110 ? -4 : 4), y); });
      ctx.lineWidth = 1;
    }

    function draw() {
      const r = Course.rand.seeded(seed * 31 + 1), N = 4000;
      let wf = 0, ws = 0, wm = 0;
      for (let i = 0; i < N; i++) {
        let fm = Infinity; for (let k = 0; k < K; k++) fm = Math.min(fm, arr(Lf, jit, r));
        const m = arr(Lm, jit, r), s = arr(Ls, Math.max(jit, 0.2 * Ls), r);
        if (m < Math.min(fm, s)) wm++; else if (fm < s) wf++; else ws++;
      }
      Course.plot.bars(cb, { labels: ['быстрые', 'медленный', 'MM успел отменить'], values: [100 * wf / N, 100 * ws / N, 100 * wm / N], colors: [col('--c1'), col('--c3'), col('--bad')], title: 'Кто первым дотянулся до устаревшей котировки, % розыгрышей' });
      const sniped = (wf + ws) / N;
      out.innerHTML = 'Устаревшую котировку исполняют в <b>' + Course.fmt.n(100 * sniped, 1) + '%</b> случаев (быстрые ' + Course.fmt.n(100 * wf / N, 1) + '%, медленный ' + Course.fmt.n(100 * ws / N, 1) +
        '%). Ожидаемая потеря маркет-мейкера на одной новости: <b>' + Course.fmt.n(J * sniped, 2) + '</b> тика на единицу размера. Чтобы окупить такие потери, ему нужно либо расширять спред, либо ставить меньше объёма — это и есть «уход ликвидности» при росте числа быстрых.';
      one();
    }
    draw();
  }

  /* ================================================================== */
  Course.register({
    id: 'm07',
    order: 7,
    title: 'HFT и динамика потока заявок',
    summary: 'Что такое высокочастотная торговля и как её увидеть в данных; почему крупный ордер дробится и ломает привычные метрики; процессы Хоукса как язык для кластеризации потока заявок; гонка быстрых и медленных.',
    level: 'продвинутый',
    time: '~3 ч',
    lessons: [
      /* ============================================================ урок 1 */
      {
        id: 'm07-l1',
        title: 'Что такое HFT и как его измеряют',
        minutes: 35,
        html: `
<p class="lead">«Высокочастотная торговля» звучит как точный термин, но Морин О'Хара называет её <i>misnomer</i> — неудачным названием для большого и разнородного набора стратегий. Чтобы дальше говорить об измерении HFT, о его влиянии на данные и о моделях потока заявок, нужно сначала договориться: что общего у этих стратегий, в каких масштабах времени они живут и по каким следам их можно заметить.</p>

<h2>Общие черты: компьютеры, скорость, стратегия</h2>
<p>По [22], у всей HFT-деятельности есть три общих свойства: её ведут <b>компьютеры</b>, она опирается на <b>предельную скорость</b> и она <b>стратегична</b> (а не просто «исполняет приказ клиента»). Внутри этих рамок различия огромны. Автор делит мир на <b>low latency</b> (быстрые соединения, колокация серверов в дата-центре биржи) и <b>ultra-low latency</b> (торговля на физическом пределе передачи сигнала: подводные кабели, микроволновые линии, специализированные чипы).</p>
<p><b>Латентность</b> (latency) — время, за которое данные (заявка, сообщение) доходят до адресата, а иногда и возвращаются. Масштабы, которые приводит [22]:</p>
<ul>
<li>человеческий глаз реагирует на зрительный стимул за <b>400–500 мс</b>;</li>
<li>задержки измеряются миллисекундами (10<sup>−3</sup> с), микросекундами (10<sup>−6</sup> с), в некоторых случаях наносекундами;</li>
<li>линия Лондон—Нью-Йорк: кабель сокращает круговую задержку с 64,8 до 59,6 мс; линия Лондон—Франкфурт: микроволновая сеть &lt; 4,6 мс против 8,35 мс по оптоволокну;</li>
<li>на Токийской бирже стандартный доступ — порядка нескольких миллисекунд, приоритетный — 260 мкс, а при колокации — 15,7 мкс; за более быстрые каналы биржа берёт больше денег.</li>
</ul>
<div class="example"><b>Учебный пример.</b> Сколько «оборотов» успевает сделать быстрый участник за время моргания? Если круговая задержка около 300 мкс, а реакция человека — 400 мс = 400 000 мкс, то 400 000 / 300 ≈ 1333 цикла «увидел — отреагировал».</div>

<h3>Относительная и абсолютная скорость</h3>
<p>Слайды Hasbrouck [21] проводят важное различие. <b>Абсолютная скорость</b> полезна всем: быстрее подгонять портфель, быстрее хеджироваться. Но для большинства участников задержки в микросекунды не имеют значения на фоне скорости макроэкономических процессов и поступления фундаментальной информации. Зато <b>относительная скорость</b> — быть быстрее <i>других</i> — очень ценна: преимущество первого хода велико, а технологии низкой задержки дают возрастающую отдачу от масштаба, поэтому появляются крупные фирмы-специалисты. Отсюда же фраза Haldane из [22]: быть информированным теперь значит быть быстрее, а не умнее.</p>

<h2>Классы стратегий</h2>
<p>[23] (Aldridge) описывает HFT как «высокий оборот капитала, много сделок, малая прибыль на сделку, практически нет позиций на ночь» и выделяет четыре класса со своим типичным временем удержания:</p>
<table>
<tr><th>Класс (по [23], табл. 1.1)</th><th>Суть</th><th>Удержание</th></tr>
<tr><td>Automated liquidity provision</td><td>автоматический маркет-мейкинг: алгоритмы котирования и управления запасом</td><td>&lt; 1 мин</td></tr>
<tr><td>Market microstructure trading</td><td>вычисление потока чужих заявок «обратной инженерией» наблюдаемых котировок (в нашем плане — «обнаружение ликвидности»)</td><td>&lt; 10 мин</td></tr>
<tr><td>Event trading</td><td>краткосрочная торговля на макро-событиях</td><td>&lt; 1 часа</td></tr>
<tr><td>Deviations arbitrage</td><td>статистический арбитраж отклонений от равновесия: треугольные и базисные сделки</td><td>&lt; 1 дня</td></tr>
</table>
<p>О'Хара [22] добавляет, как это выглядит со стороны биржи:</p>
<ul>
<li><b>HFT-маркетмейкинг</b> часто реализуется через несколько бумаг и площадок, поэтому похож на статистический арбитраж: если рост цены A обычно сопровождается ростом B, маркет-мейкер ставит заявку на продажу A и на покупку B. Пример: GLD (ETF на золото) плюс 13 других золотых продуктов — 91 возможная пара. В отличие от классического мейкера, HFT-мейкер стоит лишь на одной стороне книги в каждой бумаге и <i>не обязан</i> котировать непрерывно — отсюда опасения «периодического исчезновения ликвидности».</li>
<li><b>Латентный арбитраж</b> — использование разницы в скорости между площадками или между частным и консолидированным потоком данных.</li>
<li><b>Momentum ignition</b> — «зажигание импульса»: стратегии, провоцирующие предсказуемые ценовые паттерны в заявках трейдеров-моментум.</li>
<li><b>Quote stuffing</b> — массовая отправка и мгновенная отмена заявок, чтобы замедлить конкурентов; по [22] такие практики незаконны, а обман агентского алгоритма, заставляющий его торговать против себя, — форма спуфинга, запрещённая законом Додда—Франка 2010 г.</li>
</ul>
<div class="callout warn"><span class="t">Осторожно</span>Aldridge — практическое руководство 2010 года, данные 2008–2009 гг., тон по поводу прибыльности оптимистичный, а тезисы о пользе HFT даны без контраргументов. О'Хара — обзор 2015 года, с цифрами 2013–2014. Читайте их как два взгляда, а не как «истину»; цифры из этих источников устарели.</div>

<h2>Как HFT измеряют и видят в данных</h2>
<p>Простого прямого признака «это HFT» в обычных данных нет. На практике используют следы:</p>
<ul>
<li><b>Доля отмен.</b> По [22] нередко более 98% всех ордеров отменяются, не став сделкой; по данным SEC, 23% отменённых ордеров и 38% отменённых котировок отменяются не позже чем через 50 мс после размещения.</li>
<li><b>Масштабы времени.</b> Быстрые колебания лучшей цены на миллисекундах («высокочастотное котирование») — тема урока 3.</li>
<li><b>Микроструктура временных промежутков между событиями.</b> Пики в распределении пауз порядка сотен микросекунд — тема уроков 4–5.</li>
<li><b>Эффект на ликвидность.</b> Здесь мнения расходятся. [21] перечисляет обе стороны: HFT «навязывает издержки другим» (рост adverse selection, «информация» — это лишь предварительное знание о чужих потоках) против «HFT улучшает качество рынка» (поддерживается большинством эмпирических работ, которые связывают HF-показатели с обычными мерами ликвидности). [22] считает, что HFT-маркетмейкинг в целом улучшает рынок (уменьшает спреды), но есть и хищнические практики.</li>
</ul>
<p>Экономика отрасли тоже меняется: по [22], прибыль HFT-индустрии упала с примерно 5 млрд долл. (2009) до примерно 1 млрд (2013); фирма Virtu за 1238 торговых дней имела лишь один убыточный (S-1, 2014 г.). И ещё один важный практический вывод [23]: при транзакционных издержках проп-деска ≤ 1 б.п. сделка «на секунды» осмысленна при ожидаемом доходе от 2 б.п., а у хедж-фонда издержки 3–30 б.п. требуют более длинных горизонтов.</p>

<h2>Интерактив: лупа времени</h2>
<p>Один и тот же синтетический поток котировок за одну секунду. На масштабе «1 с» видны всплески, на «10 мс» — пакеты обновлений, на «100 мкс» — отдельные события. Мерцание между двумя тиками исчезает при взгляде раз в секунду, но влияет на любого, кто торгует в этих микроинтервалах.</p>
<div data-widget="lupa" data-title="Лупа времени: секунда, миллисекунды, микросекунды"></div>

<div class="callout key"><span class="t">Главное</span>
<b>HFT</b> — не одна стратегия, а компьютеры + предельная скорость + стратегичность. Практическая ценность скорости — относительная: быть быстрее соседа. Классы стратегий различаются горизонтом (от минуты до дня) и механизмом дохода (мейкинг, обнаружение потока, события, арбитраж). Прямого флажка «HFT» в данных нет, измеряют следы: отмены, микроколебания котировок, пики пауз.
</div>`,
        widgets: { lupa: lupaWidget },
        quiz: [
          {
            q: 'Что, по О\'Хара и Hasbrouck, делает скорость ценной для большинства участников рынка?',
            options: ['Абсолютная скорость: чем меньше задержка, тем лучше любая стратегия', 'Относительная скорость: преимущество «первого хода» над другими', 'Скорость нужна только для обхода регулирования', 'Скорость не нужна, важна лишь точность прогноза'],
            answer: 1,
            explain: 'Для большинства участников абсолютная задержка в микросекунды неважна на фоне скорости фундаментальной информации; ценна возможность быть быстрее других (преимущество первого хода).'
          },
          {
            q: 'Какой из классов Aldridge вашим планом назван «обнаружением ликвидности» (market microstructure trading)?',
            options: ['Автоматический маркет-мейкинг с горизонтом до минуты', 'Определение потока чужих заявок по наблюдаемым котировкам, до ~10 минут', 'Торговля на макро-событиях до часа', 'Арбитраж отклонений от равновесия до дня'],
            answer: 1,
            explain: 'По Aldridge, market microstructure trading — «обратная инженерия» наблюдаемых котировок, чтобы определить поток заявок других; типичное удержание до 10 минут.'
          },
          {
            q: 'Почему «98% ордеров отменяются» ещё не доказывает манипуляцию?',
            options: ['Потому что отмена не бывает частью обычной стратегии', 'Потому что HFT-мейкер постоянно обновляет котировки, и большинство его заявок отменяются как часть нормального котирования', 'Потому что в США отмены запрещены', 'Потому что 98% относится только к ритейлу'],
            answer: 1,
            explain: 'Высокая доля отмен — типичное следствие непрерывного обновления котировок. Манипуляцией (quote stuffing, спуфинг) является намерение и характер паттерна, а не доля отмен сама по себе.'
          },
          {
            q: 'Что показывает «лупа времени» в виджете?',
            options: ['Что реальный рынок на микроскопическом уровне устроен как случайное блуждание', 'Что наблюдатель с шагом в секунду пропускает почти все обновления котировок и мерцания внутри секунды', 'Что мерцание котировок всегда бесполезно', 'Что HFT всегда торгует по одному тику'],
            answer: 1,
            explain: 'Одно значение в секунду скрывает сотни и тысячи обновлений; мерцание внутри пакета видно лишь на мелких масштабах. Виджет — учебная синтетика.'
          }
        ],
        sources: [
          { title: '[22] O\'Hara, High Frequency Market Microstructure (JFE, 2015)', where: 'разд. 2.1–2.2 (строки ~107–250): определение HFT, латентность, 98% отмен, стратегии, quote stuffing', note: 'цифры 2013–2014; о датах и ошибках OCR см. примечания курса' },
          { title: '[23] Aldridge, High-Frequency Trading (2010)', where: 'гл. 1, табл. 1.1 (строки ~385–407); гл. 10 (издержки и горизонт, ~6112–6128)', note: 'рекламные вставки в txt игнорировать; данные 2008–2009' },
          { title: '[21] Hasbrouck, High-Frequency Quoting (слайды, 2011)', where: 'слайды 3–5: абсолютная и относительная скорость, споры о благосостоянии', note: 'конспект слайдов, не статья' }
        ]
      },

      /* ============================================================ урок 2 */
      {
        id: 'm07-l2',
        title: 'Крупный ордер в мелких: parent/child, VWAP и сломанные метрики',
        minutes: 40,
        html: `
<p class="lead">Классическая микроструктура строилась на идее: каждая сделка — это событие с известным инициатором (покупатель или продавец), и по цепочке таких событий можно судить об информации на рынке. Сегодня значительная часть сделок — «осколки» крупных ордеров, нарезанных алгоритмами. Этот урок объясняет, почему при этом привычные метрики (классификация сделок на покупки и продажи, realized spread, PIN) теряют смысл, и показывает это на реальной таблице исполнения VWAP-алгоритма из [22].</p>

<h2>Parent и child</h2>
<p>Институциональный инвестор редко вводит в систему один крупный маркет-ордер. Он отдаёт брокерскому алгоритму <b>родительский ордер</b> (parent order): «купить 500 000 акций за день». Алгоритм сам режет его на <b>дочерние ордера</b> (child orders), часть из которых становится сделками. По [22] алгоритмы бывают нескольких групп: <i>dark aggregation</i> (темные пулы и скрытые ордера), <i>scheduled</i> (детерминированная нарезка), <i>volume participation</i> (доля от рыночного объёма), <i>active</i> (минимизация implementation shortfall) и другие. Ни рынок, ни исследователь родительский ордер не видят — только дочерние сделки.</p>

<h3>VWAP</h3>
<p><b>VWAP</b> (volume-weighted average price) — цена, взвешенная объёмом за период:</p>
$$\\mathrm{VWAP}=\\frac{\\sum_i p_i v_i}{\\sum_i v_i},$$
<p>где $p_i$ и $v_i$ — цена и объём $i$-й сделки на рынке. VWAP-алгоритм старается исполнить родительский ордер так, чтобы средняя цена исполнения совпала с рыночным VWAP: для этого он торгует пропорционально ожидаемому профилю объёма за день (обычно U-образному: много в начале и в конце сессии).</p>
<div class="example"><b>Учебный пример.</b> Пять интервалов, рыночный объём (тыс. акций) 30; 15; 10; 15; 30, средние цены 100,00; 100,10; 100,05; 100,20; 100,15. Тогда VWAP = (3000 + 1501,5 + 1000,5 + 1503 + 3004,5) / 100 = <b>100,095</b>, а простое среднее цен (TWAP по интервалам) = 100,10. Родитель на 10 000 акций, торгуя 3000 / 1500 / 1000 / 1500 / 3000 акций (10% рыночного объёма в каждом интервале), по построению получит среднюю цену 100,095.</div>

<h2>Что показывают реальные данные о VWAP-алгоритме</h2>
<p>В [22] (табл. 2) приведены данные алгоритма VWAP брокера ITG для клиентских маркет-ордеров, 2013 г.: все родительские ордера исполнены полностью, проценты взвешены по долларовому объёму (по долевому — похожие). Итоговая строка:</p>
<table>
<tr><th>Родительских ордеров</th><th>Дочерних сделок</th><th>Пассивные</th><th>На середине</th><th>Агрессивные</th></tr>
<tr><td>243 772</td><td>13 468 847</td><td>65,53%</td><td>21,90%</td><td>12,57%</td></tr>
</table>
<p>Арифметика: 13 468 847 / 243 772 ≈ <b>55,25</b> дочерних сделки на родителя (в тексте статьи написано 55,325 — расхождение с таблицей; а в тексте 65,3% вместо 65,53% — по-видимому, опечатка; мы верим таблице). «Пассивное» исполнение — покупка по цене бида или ниже (против чужого рыночного ордера на продажу); «агрессивное» — по аску или выше; «на середине» — внутри спреда. Подробнее: покупка по биду — это <i>лимитный</i> ордер на покупку, исполненный против чужого рыночного ордера на продажу.</p>
<p>Вывод [22]: родительский ордер на покупку в данных не менее двух третей времени <b>выглядит как продажи</b> (классификатор записывает сделки по стороне инициатора), а вместе с «серединными» — до 87%. Лишь около 12,6% сделок пересекают спред, то есть выглядят как классическая «покупка» из учебников. Чем крупнее ордер и выше скорость, тем выше доля агрессивных исполнений, но для ордеров до 25% дневного объёма агрессивных всё ещё менее четверти; «массовые» ордера, где агрессия превышает пассивность, составляют ничтожные 0,0005% выборки.</p>

<h2>Почему ломаются классические метрики</h2>
<ul>
<li><b>Классификация сделок и дисбаланс заявок.</b> Модели Glosten—Milgrom и Kyle используют знак сделки как сигнал информации; PIN строится на числе покупок и продаж; дисбаланс заявок (order imbalance) считают как $(B-S)/(B+S)$. Но дочерние ордера не независимы друг от друга, поэтому и сделки не независимы, а последовательности сделок информативны (это как раз то, что эксплуатируют HFT). Easley, Lopez de Prado и O'Hara: если подписанные сделки информативны, дисбаланс должен быть связан с изменением цены. [22] (рис. 1) на данных Nasdaq (Apple, Intuitive Surgical, NxStage; октябрь 2010; 10-минутные интервалы) почти не видит связи между абсолютным дисбалансом и диапазоном high–low. Объяснение: сторона «агрессора» теперь больше говорит о готовности пересечь спред, чем об информации. Розничные сделки пересекают спред, потому что их интернализуют (они получают лучший бид или аск), а информированные трейдеры, по гипотезе [22], используют динамические слои лимитных ордеров и редко выдают себя.</li>
<li><b>Realized spread.</b> Для покупателя-инициатора: $RS = p_t - m_{t+\\Delta}$, где $m_{t+\\Delta}$ — середина спреда через $\\Delta$ (классически 5 минут); это считали прибылью маркет-мейкера. В HFT-мире она часто <b>отрицательна</b>; пять минут — «целая жизнь». Возможно, нужен горизонт в секунды, возможно, метрика просто потеряла смысл.</li>
<li><b>Постоянная и временная компоненты цены.</b> Что считать «временным» — миллисекунды, секунды? А «постоянным» — 10 минут, час?</li>
<li><b>PIN и алгоритм Lee–Ready.</b> PIN требует максимизировать правдоподобие, где числа сделок возводятся в степени в десятки тысяч; Lee–Ready страдает от волатильности котировок, порядка событий и рассинхронизации времён.</li>
<li><b>Данные.</b> Консолидированная лента может быть «не по порядку»: в США 16 открытых площадок и 50+ других мест исполнения, а метка времени ленты — время получения отчёта, а не сделки. Нестандартные лоты (odd lots) долго не отражались в ленте, хотя в ряде акций на них приходится 50% сделок и более (в среднем около 20%) и они информативны.</li>
</ul>
<div class="callout"><span class="t">Пример: «Flash crash»</span>Официальный отчёт SEC/CFTC назвал причиной крупный маркет-продавец. Menkveld и Yueshen по реальным данным родительского ордера Waddell &amp; Reed показали: ордер исполнялся множеством <i>лимитных</i> продаж, то есть этот трейдер скорее предоставлял ликвидность, чем забирал. Это иллюстрирует, как намерение и исполненные сделки могут быть очень разными. (Дата в тексте [22] указана неверно: событие произошло 6 мая 2010 г.)</div>

<h2>Интерактив: нарезка родительского ордера</h2>
<p>Виджет нарезает родительский BUY по U-образному профилю объёма и разыгрывает тип исполнения каждой дочерней сделки. Установленные по умолчанию доли взяты из табл. 2 [22]. Классификатор присваивает метку по стороне инициатора: агрессивная покупка — «покупка», пассивная (исполнена о чужую рыночную продажу) — «продажа». Можно добавить дополнительную ошибку классификации и увидеть, как далеко измеренный дисбаланс уходит от истины (+1).</p>
<div data-widget="parentchild" data-title="Parent-ордер и классификация сделок"></div>

<div class="callout key"><span class="t">Главное</span>Видимые сделки ≠ намерения. Parent режется на десятки и сотни child, большинство которых исполняется пассивно или на середине, поэтому знак «агрессора» не равен знаку намерения. Метрики, построенные на знаке сделки или фиксированном горизонте (дисбаланс, PIN, Lee–Ready, realized spread), в мире алгоритмов и HFT нужно использовать осторожно и перепроверять.</div>
<div class="callout warn"><span class="t">Осторожно</span>Табл. 2 [22] — данные одного брокера (ITG) за 2013 г. по клиентским маркет-ордерам VWAP; обобщать на весь рынок нельзя. Автор и сам не объясняет полностью, почему realized spread стал отрицательным. Профиль объёма в виджете — учебный.</div>`,
        widgets: { parentchild: parentChildWidget },
        quiz: [
          {
            q: 'В табл. 2 из [22] 65,53% дочерних сделок VWAP-алгоритма пассивны. Что это значит для классификатора «сторона инициатора»?',
            options: ['Родительский BUY будет в основном записан как покупка', 'Родительский BUY будет в основном записан как продажа, потому что пассивная покупка исполняется о чужой маркет-ордер на продажу', 'Классификатор не заметит ордер вообще', 'Это ничего не меняет, потому что объём тот же'],
            answer: 1,
            explain: 'Пассивная покупка — лимитный BUY, исполненный против чужого рыночного SELL. По стороне инициатора такая сделка выглядит как продажа, хотя намерение — покупка.'
          },
          {
            q: 'Какой вывод О\'Хара делает из почти нулевой связи между дисбалансом сделок и диапазоном high–low (рис. 1)?',
            options: ['Информированных трейдеров на рынке больше нет', 'Сторона агрессора отражает готовность пересечь спред, а не обязательно информацию', 'Данные Nasdaq непригодны', 'Дисбаланс нужно считать по секундным окнам'],
            answer: 1,
            explain: 'Ритейл пересекает спред, потому что его интернализуют, а информированные участники могут торговать слоями лимитных ордеров. Поэтому знак агрессора перестал надёжно нести информацию.'
          },
          {
            q: 'Почему realized spread, вычисленный через 5 минут, может быть отрицательным и бесполезным в HFT-мире?',
            options: ['Потому что спред не может быть положительным', 'Потому что за 5 минут у быстрых участников проходит «целая жизнь» событий, и результат уже не отражает прибыль мейкера', 'Потому что 5 минут — слишком короткий горизонт', 'Потому что у HFT нет спреда'],
            answer: 1,
            explain: 'О\'Хара: пять минут — «lifetime» для HFT; возможно, нужен горизонт секунд, а возможно, метрика потеряла смысл. Точной причины автор не называет.'
          },
          {
            q: 'Родитель на 10 000 акций исполняется в точности пропорционально рыночному объёму интервалов. Что можно сказать о средней цене исполнения?',
            options: ['Она равна TWAP', 'Она равна рыночному VWAP за эти интервалы', 'Она всегда выше VWAP', 'Она не определена'],
            answer: 1,
            explain: 'Если доли исполнения равны долям рыночного объёма, то взвешенная средняя цена исполнения по построению равна VWAP.'
          }
        ],
        sources: [
          { title: '[22] O\'Hara (2015)', where: 'разд. 3.2 «Market data» (строки ~525–770): табл. 2 (564–600), рис. 1 (645–647), realized spread (710–720), PIN/Lee–Ready (730–737), flash crash (632–639)', note: 'расхождения в тексте: 55,325 vs 55,25; 65,3% vs 65,53%; дата flash crash' }
        ]
      },

      /* ============================================================ урок 3 */
      {
        id: 'm07-l3',
        title: 'Высокочастотное котирование: шум и мерцание',
        minutes: 35,
        html: `
<p class="lead">Лучшая цена покупки и продажи может меняться десятки раз за секунду, причём часто «туда-сюда» без новостей. Hasbrouck в слайдах [21] называет это <b>высокочастотным котированием</b> (high-frequency quoting, HFQ), предлагает способ его измерять и обсуждает, что это значит для тех, кто торгует и оценивает волатильность. Источник — презентация, а не статья, поэтому здесь берём идеи и те числа, которые удалось надёжно прочитать.</p>

<h2>Что именно наблюдают</h2>
<p><b>HFQ</b> — быстрые колебания лучшей цены покупки (bid) и/или продажи (ask) на масштабах миллисекунд. Данные [21]: миллисекундный TAQ, национальные лучшие котировки по всем площадкам (NBBO), апрель 2011 г. Показательный пример — малая бумага AEPI на Nasdaq 29 апреля 2011: за окно в 400 мс (11:15:21,400–11:15:21,800) бид менялся многократно. Признаки эпизода: сверхбыстрые колебания, резкие начало и конец, связь с новостями не обязательна, активность в основном на одной стороне (bid). Выборка: 100 акций США за апрель 2011 г., стратифицированная по капитализации; подробный разбор по Apple (AAPL).</p>
<p>Вопрос «откуда это берётся» в [21] остаётся открытым; перечислены гипотезы: очень низкие издержки котирования, тестирование систем, ошибки, взаимодействие простых алгоритмов, поиск контрагента, намеренный шум, смещение NBBO для выгодной цены в <i>тёмной</i> сделке (сделка вне видимой котировки, цена привязана к NBBO). Однозначных выводов нет.</p>

<h2>Как это измерить: масштабы и вейвлеты</h2>
<p>Идея простая: если «истинная» цена ведёт себя как случайное блуждание, то дисперсия изменений за горизонт $\\tau$ растёт пропорционально $\\tau$. Тогда величина «дисперсия / $\\tau$» одинакова на всех масштабах. Шум котировок добавляет дисперсию, которая <i>не растёт</i> со временем (между двумя соседними отсчётами цена мерцает и возвращается), поэтому на коротких масштабах «дисперсия / $\\tau$» оказывается выше. Нормированный график этого отношения называют <b>signature plot</b>.</p>
<p>Hasbrouck использует не простые разности, а <b>вейвлет-разложение</b> (фильтры Daubechies-4, MODWT): цена раскладывается на компоненты, каждая из которых отвечает своему масштабу $\\tau_j=2^{j-1}$ мс — от 1 мс примерно до 2,2 минуты (в секундных данных — до ~20 минут), в скользящих 10-минутных окнах. Вейвлет-дисперсия компоненты $\\nu^2_X(\\tau_j)$ для случайного блуждания равна $\\sigma^2 c(\\tau_j)$ с известным множителем $c(\\tau_j)=\\tfrac16\\big(\\tau_j+\\tfrac{1}{2\\tau_j}\\big)$, растущим с масштабом (в слайдах: 0,25; 0,38; 0,69; 1,3; 2,7; 5,3; 10,7…). Нормировка:</p>
$$\\frac{\\nu^2(\\tau_j)/c(\\tau_j)}{\\nu^2(\\tau_{20\\text{ мин}})/c(\\tau_{20\\text{ мин}})}=1\\quad\\text{для чистого случайного блуждания}.$$
<p>Превышение единицы — избыточный «шум котировок». Второй инструмент — <b>вейвлет-корреляция bid и ask</b>:</p>
$$\\rho_{XY}(\\tau_j)=\\frac{\\nu_{XY}(\\tau_j)}{\\sqrt{\\nu_X^2(\\tau_j)\\,\\nu_Y^2(\\tau_j)}}.$$
<p>Если меняется фундаментальная стоимость, bid и ask двигаются вместе (корреляция высокая); низкая корреляция — признак шума котировок. Из слайдов: у крупных акций корреляция около 0,7 на 1 с и выше 0,9 на 20 с; у нижнего квинтиля по капитализации — ниже 0,2 на 1 с и ниже 0,5 на 20 мин.</p>

<h3>Главный результат</h3>
<p>HFQ реален, но эпизодичен. У малых акций дисперсия на коротких масштабах сильно завышена относительно случайного блуждания, у крупных — слегка. Медианы выборки: цена 13,75 долл., капитализация 420 млн долл., около 1 111 сделок и 23 347 котировок в день; в нижнем дециле — 17 сделок и 846 котировок, в верхнем — 25 847 и 368 579. Заметьте разрыв: котировок на порядки больше, чем сделок.</p>
<div class="callout warn"><span class="t">Осторожно</span>Таблицы с числами по AAPL в нашем txt перемешаны (значения для масштабов 1 мс, 1 с, 16 с и т.д. не сопоставляются надёжно), поэтому конкретные «цент/акцию» по Apple здесь не приводятся — их нужно брать из самого PDF презентации.</div>

<h2>Последствия для измерения и исполнения</h2>
<ul>
<li><b>Волатильность.</b> Если оценивать дисперсию по сверхчастым возвратам, шум котировок надувает оценку: получится «волатильность», которая на самом деле — мерцание. [21] показывает неявную дисперсию: при 0,005 (цент/акц.)² за 1 мс на 6 часов приходится 21,6·10<sup>6</sup> мс × 0,005 ≈ 108 000 (цент/акц.)², то есть СКО ≈ 329 цента ≈ 1% цены 340 долл. Проверка: √108 000 ≈ 328,6; 3,29 / 340 ≈ 0,97%.</li>
<li><b>Риск TWAP.</b> Заявка, отправленная на рынок, подвержена случайной задержке доставки. Для маркет-ордера неопределённость момента прибытия — это ценовой риск, а вейвлет-дисперсия на данном масштабе измеряет этот риск в заданном окне. Если на этом масштабе есть шум, заявка попадает в «мерцание» и исполняется по цене, которая через миллисекунду уже не будет «правильной».</li>
<li><b>Классические оценки спреда.</b> Эффект похож на bid-ask bounce: по Aldridge [23], модель Roll $p_t=m_t+\\tfrac{s}{2}I_t$ даёт $\\mathrm{cov}(\\Delta p_t,\\Delta p_{t+1})=-s^2/4$ и $s=2\\sqrt{-\\mathrm{cov}}$, а bid-ask bounce даёт отрицательную автокорреляцию порядка −40% на сверхчастых данных. HFQ добавляет к такому «отскоку» шум, не связанный с исполнением сделок.</li>
</ul>

<h2>Интерактив: signature plot и риск задержки</h2>
<p>Модель: эффективная цена — случайное блуждание ($\\sigma=0{,}2$ тика на $\\sqrt{\\text{мс}}$), к ней в течение «эпизода» добавляется независимый шум котировок. Двигайте слайдеры шума и доли времени в эпизоде: на графике справа внизу видно, насколько растёт «дисперсия / $\\tau$» на малых горизонтах. Слайдер задержки показывает, как шум увеличивает ценовой риск заявки со случайным временем прихода.</p>
<div data-widget="hfq" data-title="Шум котировок: signature plot и риск задержки"></div>

<div class="callout key"><span class="t">Главное</span>HFQ — быстрые колебания лучшей цены, которые видны только на миллисекундах и не следуют за фундаментальной стоимостью. Обнаруживают их по превышению нормированной дисперсии на коротких масштабах (signature plot) и по низкой корреляции bid и ask. Для исполнения это ценовой риск «времени прибытия» заявки; для оценки волатильности — источник завышения, если брать слишком частые отсчёты.</div>`,
        widgets: { hfq: hfqWidget },
        quiz: [
          {
            q: 'Что должно получиться на нормированном графике «дисперсия/τ» для чистого случайного блуждания?',
            options: ['Убывающая кривая', 'Горизонтальная линия на уровне 1', 'Растущая кривая', 'Нулевая линия'],
            answer: 1,
            explain: 'Для случайного блуждания дисперсия растёт пропорционально горизонту, поэтому нормированное отношение одинаково на всех масштабах (равно 1 при нормировке на длинный горизонт).'
          },
          {
            q: 'Что говорит о шуме низкая вейвлет-корреляция между bid и ask на данном масштабе?',
            options: ['Фундаментальная стоимость сильно изменилась', 'Bid и ask двигаются независимо друг от друга — это признак шума котировок, а не сдвига стоимости', 'Спред равен нулю', 'Данные содержат ошибки времени'],
            answer: 1,
            explain: 'Если стоимость сдвинулась, обе котировки движутся вместе. Низкая корреляция означает, что колебания не общие — это шум.'
          },
          {
            q: 'Почему оценка волатильности по сверхчастым отсчётам цены может быть завышена?',
            options: ['Потому что цена не меняется на коротких интервалах', 'Потому что шум котировок добавляет дисперсию, не накапливающуюся во времени, а при делении на малое τ она доминирует', 'Потому что вейвлеты недостаточно точны', 'Потому что объёмы малы'],
            answer: 1,
            explain: 'Дисперсия шума не растёт с горизонтом; на коротких масштабах она заметна, и если мы не вычитаем её, получаем «волатильность» мерцания.'
          },
          {
            q: 'Чего в [21] НЕЛЬЗЯ утверждать о причинах HFQ?',
            options: ['Что существует несколько гипотез, включая взаимодействие простых алгоритмов', 'Что причина однозначно установлена и это манипуляция', 'Что эффект эпизодичен', 'Что у малых акций он выражен сильнее'],
            answer: 1,
            explain: 'Слайды перечисляют открытые вопросы: низкие издержки, тестирование, ошибки, взаимодействие алгоритмов, поиск контрагента, намеренный шум. Однозначного вывода о манипуляции нет.'
          }
        ],
        sources: [
          { title: '[21] Hasbrouck, High-Frequency Quoting (слайды, 2011)', where: 'AEPI и HFQ (строки 97–183); вейвлеты (239–367); TWAP-риск (439–482); выборка (487–537); signature plot (691–742); корреляция bid–ask (757–775); выводы (795–817)', note: 'слайды: множитель c(τ) сверён по PDF слайдов; таблицы AAPL в текстовой выжимке перемешаны — не использованы' },
          { title: '[23] Aldridge', where: 'гл. 9: Roll и bid-ask bounce (строки ~5760–5805)', note: 'для связи с отскоком' }
        ]
      },

      /* ============================================================ урок 4 */
      {
        id: 'm07-l4',
        title: 'Процессы Хоукса: самовозбуждение потока заявок',
        minutes: 45,
        html: `
<p class="lead">Сделки и заявки на бирже приходят не равномерно, а кластерами: после одного события вероятность следующих резко возрастает. Одно из самых удобных математических описаний этого свойства — <b>процесс Хоукса</b> (Hawkes process). Он лежит в основе анализа книги в [32] и объясняет, откуда берутся пачки событий: часть из них приходит «из ниоткуда», остальные — «потомки» предыдущих. Здесь мы разберём процесс подробно и с нуля; в модуле 2 на этот урок есть ссылка.</p>

<h2>От Пуассона к самовозбуждению</h2>
<p>Простейшая модель потока событий — <b>процесс Пуассона</b>: события приходят независимо друг от друга с постоянной <b>интенсивностью</b> $\\mu$ (в среднем $\\mu$ событий в секунду). Интервалы между событиями тогда экспоненциальны, «памяти» нет. Реальный поток заявок устроен иначе: сделка может спровоцировать другие сделки (дробление ордера, алгоритмы-последователи, реакция участников на сделку). Нужна модель, где интенсивность — не константа, а <b>случайная функция времени</b>, растущая после событий.</p>
<p>Процесс Хоукса [32, ур. 4] задаёт интенсивность так:</p>
$$\\lambda_t=\\mu+\\int_{-\\infty}^{t}\\phi(t-s)\\,dN_s=\\mu+\\sum_{t_i<t}\\phi(t-t_i).$$
<p>Здесь $N_s$ — счётчик событий; $\\mu>0$ — <b>базовая (экзогенная) интенсивность</b>; $\\phi\\ge 0$ — <b>ядро</b> (kernel): неотрицательная причинная функция (определена для положительных лагов), которая описывает, насколько событие в момент $t_i$ повышает интенсивность через время $t-t_i$. Каждое событие «добавляет к интенсивности горку» формы $\\phi$.</p>

<h3>Экспоненциальное ядро: простой учебный случай</h3>
<p>Самый наглядный выбор — $\\phi(u)=\\alpha e^{-\\beta u}$ при $u>0$: событие мгновенно увеличивает интенсивность на $\\alpha$, потом возбуждение затухает со скоростью $\\beta$ (характерное время памяти $1/\\beta$). Тогда</p>
$$\\lambda_t=\\mu+\\sum_{t_i<t}\\alpha e^{-\\beta(t-t_i)}.$$
<p>Это <b>учебная модель</b>. В [32] ядра оцениваются непараметрически (до лага 0,5 с), и их форма далека от экспоненты: пики около 100 и 300 мкс, острые пики на «круглых» лагах; у диагональных условных законов при лагах больше секунды наблюдается степенное затухание с показателем меньше единицы. Но для понимания механизма экспонента идеальна.</p>

<h2>Branching ratio и стационарность</h2>
<p>Норма ядра $n=\\int_0^\\infty\\phi(u)\\,du$ — это <b>среднее число событий, порождённых одним событием</b> (branching ratio, коэффициент ветвления). Для экспоненциального ядра $n=\\alpha/\\beta$. Смысл — как в ветвящемся процессе: события-«иммигранты» приходят с интенсивностью $\\mu$, каждый иммигрант порождает в среднем $n$ потомков, каждый потомок — снова $n$ и т.д.</p>
<ul>
<li>Если $n<1$, процесс <b>стационарен</b>: кластеры конечны. Средний размер кластера (иммигрант и все его потомки) равен $1/(1-n)$.</li>
<li>Средняя интенсивность: $\\Lambda=E[\\lambda_t]=\\mu/(1-n)$.</li>
<li>Доля «экзогенных» событий (иммигрантов) равна $\\mu/\\Lambda=1-n$; остальные $n$ — «эндогенные», порождены другими событиями.</li>
<li>Если $n\\ge 1$, в среднем каждое событие порождает не меньше одного нового — интенсивность разгоняется, стационарного режима нет.</li>
</ul>
<div class="example"><b>Учебный пример.</b> $\\mu=0{,}5$ событий/с, $\\alpha=1{,}2$, $\\beta=2$. Тогда $n=1{,}2/2=0{,}6$; $\\Lambda=0{,}5/(1-0{,}6)=1{,}25$ событий/с; экзогенных событий $1-n=40\\%$ (0,5 из 1,25 в секунду); размер кластера $1/(1-0{,}6)=2{,}5$. Событие «поднимает» интенсивность сразу на $\\alpha=1{,}2$ (это в 2,4 раза больше базовой интенсивности 0,5), и через $\\ln 2/\\beta\\approx 0{,}35$ с возбуждение уменьшается вдвое.</div>

<h2>Многомерный случай</h2>
<p>В [32] разные типы событий (рыночные и лимитные заявки, отмены, покупки и продажи, разные размеры) моделируются как компоненты многомерного процесса. Интенсивность компоненты $i$ [32, ур. 5]:</p>
$$\\lambda^i_t=\\mu^i+\\sum_{j=1}^{D}\\int_{-\\infty}^{t}\\phi_{ij}(t-s)\\,dN^j_s,$$
<p>где $\\phi_{ij}$ — влияние прошлых событий типа $j$ на интенсивность типа $i$. Условие стационарности: спектральный радиус матрицы норм $\\|\\Phi\\|_1=(\\|\\phi_{ij}\\|_1)$ меньше 1; тогда вектор средних интенсивностей $\\Lambda=E[\\lambda_t]=(I-\\|\\Phi\\|_1)^{-1}\\mu$ [32, ур. 6]. Норма $n_{ij}=\\int\\phi_{ij}$ — среднее число событий типа $i$, порождённых одним событием $j$; доля интенсивности $i$, объяснённая $j$: $\\tilde n_{ij}=\\dfrac{\\Lambda_j}{\\Lambda_i}n_{ij}$. Доля «экзогенности» $\\mu_i/\\Lambda_i$ показывает, какая часть активности не вызвана другими событиями.</p>

<h3>Что процесс Хоукса умеет и не умеет</h3>
<ul>
<li>Объясняет <b>кластеризацию</b>: после события интенсивность выше, значит, события идут пачками. У счётчика событий в окнах дисперсия больше среднего (у Пуассона они равны) — виджет ниже считает этот «индекс дисперсии». Для длинных окон в стационарном случае он стремится к $1/(1-n)^2$ — это стандартный результат теории Хоукса, в [32] он не приводится.</li>
<li>Не умеет <b>торможение</b> (inhibition): линейный процесс допускает лишь неотрицательные ядра. В [32] отрицательные эффекты (например, лимитные заявки на одной стороне подавляют лимитные заявки на другой) учитываются положительной частью $(\\cdot)^+$ в оценке, и это отдельная оговорка модели.</li>
<li>Не доказывает <b>причинность</b>: «возбуждение» — статистическая связь «после A чаще B». В [32] события ближе минимального времени реакции (~300 мкс) не могут быть причинно связаны, если их не породил один и тот же агент.</li>
<li>Не учитывает <b>объём</b> без доработки. Наивная модель [32, ур. 7] $\\lambda_t=\\mu+\\int f(v_s)\\phi(t-s)dN_s$ лишь масштабирует общее ядро объёмом; данные ей противоречат (форма ядер разная для разных размеров сделок) — подробнее в уроке 5.</li>
</ul>

<h2>Интерактив: симулятор Хоукса</h2>
<p>Симуляция методом «прореживания» (Ogata): интенсивность сразу после события — верхняя граница до следующего, поэтому очередной кандидат на событие генерируется с этой интенсивностью и принимается с вероятностью $\\lambda/\\lambda_{\\max}$. Двигайте $\\mu$, $\\alpha$, $\\beta$ и следите за $n=\\alpha/\\beta$. При $n$ близком к 1 кластеры становятся огромными, при $n\\ge 1$ процесс «взрывается» (расчёт останавливается на 4000 событиях). Внизу — для сравнения пуассоновский поток с тем же числом событий.</p>
<div data-widget="hawkes" data-title="Процесс Хоукса: интенсивность и кластеры событий"></div>

<div class="callout key"><span class="t">Главное</span>В процессе Хоукса интенсивность $\\lambda_t=\\mu+\\sum\\phi(t-t_i)$: каждое событие временно повышает вероятность следующих. Коэффициент ветвления $n=\\|\\phi\\|_1$ — среднее число «потомков»; стационарность при $n<1$; средняя интенсивность $\\mu/(1-n)$, доля экзогенных событий $1-n$. Экспоненциальное ядро — для учебного понимания, реальные ядра по данным не экспоненциальны.</div>
<div class="callout warn"><span class="t">Осторожно</span>Не путайте $\\alpha$ (высота горки) с $n$ (площадь горки): при одном $\\alpha$ быстрое затухание ($\\beta$ большое) даёт малое $n$, медленное — большое. И помните, что «эндогенность» — статистика, а не доказательство механизма.</div>`,
        widgets: { hawkes: hawkesWidget },
        quiz: [
          {
            q: 'μ = 0,4, α = 0,9, β = 1,5. Чему равна средняя интенсивность Λ?',
            options: ['0,4', '0,9', '1,0', '2,4'],
            answer: 2,
            explain: 'n = α/β = 0,6; Λ = μ/(1−n) = 0,4/0,4 = 1,0 событий в секунду.'
          },
          {
            q: 'Что произойдёт при n = α/β > 1?',
            options: ['Процесс станет пуассоновским', 'Процесс не имеет стационарного режима, интенсивность разгоняется', 'Интенсивность станет постоянной', 'Размер кластера станет равен 1'],
            answer: 1,
            explain: 'В среднем каждое событие порождает больше одного нового, кластеры не заканчиваются, стационарной интенсивности не существует.'
          },
          {
            q: 'Что означает «ядро» φ(t) в процессе Хоукса?',
            options: ['Объём типичной сделки', 'Вклад одного события в интенсивность через время t после него', 'Время работы биржи', 'Размер тика'],
            answer: 1,
            explain: 'Ядро описывает память: насколько событие в момент t_i повышает интенсивность в момент t. Интеграл ядра — branching ratio.'
          },
          {
            q: 'Почему линейный процесс Хоукса не может описать, что лимитные заявки на одной стороне книги подавляют заявки на другой?',
            options: ['Потому что не бывает двух сторон', 'Потому что ядра должны быть неотрицательными, а подавление требует отрицательного влияния', 'Потому что процесс Хоукса работает только на дневных данных', 'Потому что α всегда равно 0'],
            answer: 1,
            explain: 'В линейной модели интенсивность не может уменьшаться из-за события; торможение (inhibition) требует отрицательных ядер, и в [32] это решается отдельной оговоркой оценки.'
          }
        ],
        sources: [
          { title: '[32] Rambaldi, Bacry, Lillo, The role of volume in order book dynamics', where: 'разд. 1–2: ур. 4–7 (строки ~92–179); ур. 10–12 (метод и ингибирование, 218–372)', note: 'формулы (4)–(7) сверены с PDF; экспоненциальное ядро — наша учебная иллюстрация, не модель статьи' }
        ]
      },

      /* ============================================================ урок 5 */
      {
        id: 'm07-l5',
        title: 'Hawkes на реальной книге и гонка быстрых и медленных',
        minutes: 45,
        html: `
<p class="lead">Теперь используем Хоукс на реальной книге заявок: что он говорит о времени реакции участников, об order splitting и о роли объёма сделки. Затем сделаем мост к модели van Kervel [17], в которой быстрые и медленные трейдеры конкурируют за ликвидность на нескольких площадках, а отмены лимитных заявок после сделки объясняются обновлением информации.</p>

<h2>Данные и постановка в [32]</h2>
<p>Rambaldi, Bacry и Lillo анализируют <b>фьючерсы Eurex на Bund и DAX</b>, июль 2013 — ноябрь 2014, данные QuantHouse, метки времени с микросекундной точностью; рассматривается только лучший уровень книги (Level I). Одновременные события на противоположных сторонах составляют менее 0,2%. Bund — «large-tick» актив (спред почти всегда один тик, большие объёмы на лучших ценах), DAX — «small-tick». Модель простой независимости времён и объёмов отвергается, поэтому объём «бинируется»: каждая корзина объёма становится отдельным компонентом многомерного процесса Хоукса, ядра оцениваются непараметрически (метод Bacry–Muzy, система Винера—Хопфа). Три последовательные модели: беззнаковые сделки (6 компонент), знаковые сделки (покупка/продажа × 4 корзины объёма), полный первый уровень книги (3 типа событий × 2 стороны × 4 объёма = 24 компонента, 576 ядер).</p>

<h2>Что нашли</h2>
<h3>Микросекундная шкала и минимальное время реакции</h3>
<p>Минимальное время между событиями — около 10 мкс (все события) и около 50 мкс (сделки). В распределении пауз есть пики вблизи 30 мкс, 70–100 мкс и 200–400 мкс. Eurex заявляет круговые задержки 0,2–0,35 мс в колокации, поэтому «горб» около 300 мкс трактуется как <b>минимальное время реакции</b> участника на событие на рынке. Следствие: события ближе этого масштаба не могут быть причинно связаны, если это не действия одного и того же агента.</p>

<h3>Дробление и реакция других</h3>
<p>Условные законы «после события A интенсивность B» на диагонали имеют два пика: около <b>100 мкс</b> (дробление ордеров: одни и те же трейдеры или сигналы) и около <b>300 мкс</b> (реакция других участников); второй пик сильнее выражен для крупных сделок. Видны острые пики на «круглых» временах (0,1 с, 1 с) — авторы связывают их с автоматической торговлей и дроблением; у диагональных условных законов при лагах свыше секунды наблюдается степенное затухание с показателем меньше 1. Для знаковых сделок краткосрочное возбуждение почти целиком идёт от сделок <i>того же</i> знака (это и есть дробление); сделки противоположного знака вносят вклад лишь у самых крупных корзин.</p>

<h3>Роль объёма</h3>
<ul>
<li>Форма ядер сильно зависит от размера событий: <b>крупные сделки возбуждают рынок сильнее и дольше</b>. Это опровергает наивную модель, где объём лишь умножает единое ядро.</li>
<li>Крупные заявки и сделки более <b>экзогенны</b>: доли «экзогенности» сделок Bund — около 23–32% в малых корзинах и 31,1% и 58,9% в самых крупных; у DAX для крупных заявок до 72%. (Извлечение таблицы из PDF шумное — используйте как порядок величин.)</li>
<li>Мелкие сделки в основном порождены другими событиями: сделки в 1 контракт — более 60% всех сделок DAX (64,5% по таблице), у Bund — 31,3%.</li>
<li><b>Книга целиком:</b> лимитные заявки на одной стороне тормозят лимитные заявки на другой (интерпретация: ориентир «справедливой цены»); крупная лимитная заявка на ask вызывает отмены и сделки на bid — быстрые трейдеры забирают ликвидность; после крупной сделки маркет-мейкеры отменяют заявки на стороне сделки и ставят на противоположной.</li>
</ul>
<div class="callout warn"><span class="t">Осторожно: пределы статьи</span>Два фьючерса одной биржи за ~16 месяцев; только лучший уровень книги; ядра оцениваются до 0,5 с; линейная модель не допускает торможение, поэтому используется $(\\cdot)^+$. Выводы о причинности — только как статистические ассоциации. Мы приводим лишь то, что есть в статье; результаты на акциях или других площадках могут отличаться. Модель стационарна, то есть не описывает смену режима.</div>

<h2>Мост: быстрые и медленные трейдеры (van Kervel)</h2>
<p>Hawkes говорит, что события связаны во времени. Но <i>почему</i> после сделки на одной площадке исчезают заявки на другой? В [17] ответ — в модели с двумя площадками и тремя участниками.</p>
<ul>
<li><b>Маркет-мейкеры</b>: нейтральны к риску, конкурентны, выставляют лимитные заявки на обеих площадках. Ожидаемая стоимость после сделки размера $x$ обновляется линейно: $E[V_{t+1}\\mid V_t,x_t]=V_t+\\lambda x_t$ (линейный импакт).</li>
<li><b>Быстрые трейдеры</b> (доля $\\gamma$) отправляют ордера на обе площадки <i>одновременно</i>, и мейкеры не успевают пересмотреть котировки между исполнениями. <b>Медленные</b> ($1-\\gamma$) торгуют на одной площадке (причины: человеческая задержка, поиск скрытой ликвидности, стоимость технологий).</li>
<li>Размер ордера экспоненциален со средним $\\varphi$ (в [17] это обозначение φ); равновесие — нулевая ожидаемая прибыль маргинальной единицы заявки на каждом уровне.</li>
</ul>
<p>Предсказания: (1) рост доли быстрых <b>снижает совокупную глубину</b>, потому что глубина на площадке A оказывается меньше «одиночной» на величину, равную вероятности столкнуться с быстрым трейдером, умноженной на потерю от такой встречи; (2) он <b>уменьшает масштаб отмен</b> после сделки. Отмены на конкурирующей площадке — это эффективное обновление ожидаемой стоимости, а не «фантомная ликвидность».</p>
<p>Эмпирика: FTSE 100, ноябрь 2009 г., 10 акций, 5 площадок (LSE — 61% объёма, Chi-X — 24%), снимки книги каждые 100 мс. Результаты: в течение 100 мс после сделки на конкурирующих площадках отменяются заявки на той же стороне объёмом 29–67% размера сделки (за 1 с — 38–84%), и появляются новые заявки на противоположной стороне объёмом 116–155% за 1 с. Доля быстрых оценена по «одновременным» сделкам на разных площадках: около 20% «пулов» ордеров, 39% рыночных ордеров, или около 40% по скорректированной оценке. Повышение доли быстрых на одно стандартное отклонение (9%) снижает совокупную глубину на 7%; влияние покупки на LSE на консолидированную ask-глубину −1,43 меняется до −1,32.</p>
<div class="callout warn"><span class="t">Осторожно</span>Это одна выборка (10 акций FTSE 100, один месяц 2009 г.), а «быстрота» трейдера — выводная оценка по одновременным сделкам, а не наблюдаемый признак. Модель — стилизованная.</div>

<h2>Интерактив: гонка за устаревшей котировкой</h2>
<p>Приходит новость: справедливая цена скакнула на $J$ тиков, а котировка маркет-мейкера ещё старая. Кто первым до неё дотянется — быстрый трейдер, медленный или сам мейкер, успевший отменить заявку? Каждое время прихода — латентность плюс случайный разброс. Это упрощение лишь одного механизма [17] и подхода «гонки» из [22]; полной модели [17] (две площадки, глубина) виджет не реализует.</p>
<div data-widget="race" data-title="Гонка быстрого и медленного трейдера за устаревшей котировкой"></div>
<p>Что можно увидеть: при латентности быстрого, близкой к времени отмены мейкера, результат — почти монета; снижение латентности быстрого на 100 мкс резко увеличивает долю успешных «снайперских» исполнений. Увеличение числа быстрых соперников увеличивает шанс, что хотя бы один из них опередит мейкера. Потери мейкера на новости растут, значит, он расширяет спред или выставляет меньший объём — это механизм ухода ликвидности из [17].</p>

<div class="callout key"><span class="t">Главное</span>[32]: на микросекундах поток событий самовозбуждается; минимальное время реакции — около 300 мкс, дробление даёт пик около 100 мкс; крупные сделки возбуждают сильнее и дольше и более экзогенны. [17]: отмены котировок после сделки — это обновление информации мейкерами; рост доли быстрых снижает глубину. Оба результата — про корреляции и про равновесие в рамках моделей, а не про намерения отдельных участников.</div>`,
        widgets: { race: raceWidget },
        quiz: [
          {
            q: 'О чём говорит «горб» в распределении пауз вблизи 300 мкс в [32]?',
            options: ['О том, что Eurex работает только 300 мкс в сутки', 'О минимальном времени реакции участников (круговые задержки колокации 0,2–0,35 мс)', 'О размере тика', 'О том, что DAX не торгуется'],
            answer: 1,
            explain: 'Авторы связывают пик с заявленными задержками Eurex 0,2–0,35 мс в колокации: быстрее реагировать на чужое событие участник физически не может.'
          },
          {
            q: 'Какой результат [32] противоречит «наивной» модели, в которой объём лишь умножает общее ядро?',
            options: ['Форма ядер сильно зависит от размеров сделок: крупные сделки возбуждают дольше и сильнее', 'Все ядра одинаковы', 'Число событий растёт линейно', 'Сделок нет'],
            answer: 0,
            explain: 'Если бы модель была верна, все ядра имели бы одинаковую форму и различались масштабом. Данные показывают разную форму.'
          },
          {
            q: 'В [17] после сделки на одной площадке мейкеры отменяют заявки на другой. Как это интерпретируют авторы?',
            options: ['Как манипуляцию «фантомной ликвидностью»', 'Как эффективное обновление ожидаемой фундаментальной стоимости', 'Как ошибку данных', 'Как реакцию на комиссию биржи'],
            answer: 1,
            explain: 'Сделка несёт информацию об ожидаемой стоимости, и мейкеры пересматривают котировки на всех площадках. Это не «фантомная» ликвидность.'
          },
          {
            q: 'Что произойдёт в виджете «гонка» при росте числа быстрых соперников при прочих равных?',
            options: ['Вероятность того, что мейкер успеет отменить заявку, вырастет', 'Вероятность того, что устаревшую котировку исполнят, вырастет', 'Ничего', 'Исчезнет разброс задержек'],
            answer: 1,
            explain: 'Среди нескольких быстрых соперников хотя бы один с большей вероятностью опередит отмену мейкера: минимум нескольких времён прихода меньше одного.'
          }
        ],
        sources: [
          { title: '[32] Rambaldi, Bacry, Lillo (arXiv 1602.07663)', where: 'данные (379–411, 474–489); результаты по сделкам (491–720); знаковые (722–836); полный стакан (915–1156); экзогенность (1269–1293); выводы (1425–1450)', note: 'цифры экзогенности из шумного извлечения таблиц; только Level I Eurex, 2013–2014' },
          { title: '[17] van Kervel, Competition for Order Flow with Fast and Slow Traders (RFS, 2015)', where: 'введение (16–147); модель (179–347); предложения 1–4 (337–524); данные и результаты (548–1000)', note: 'обозначения сверены с PDF (доля быстрых — γ, средний размер — φ); эмпирика — FTSE 100, ноябрь 2009' },
          { title: '[22] O\'Hara (2015)', where: 'разд. 2.2: латентный арбитраж (строки ~200–215)', note: 'для идеи гонки за устаревшей котировкой' }
        ]
      }
    ],

    terms: [
      { en: 'high-frequency trading (HFT)', ru: 'высокочастотная торговля', def: 'Торговля, которую ведут компьютеры на предельной скорости и по заданной стратегии; сильно различается по стратегиям (мейкинг, арбитраж, обнаружение потока и т.д.).' },
      { en: 'latency', ru: 'латентность, задержка', def: 'Время, за которое сообщение (заявка, данные) доходит до адресата; измеряется мс, мкс, нс.' },
      { en: 'co-location', ru: 'колокация', def: 'Размещение серверов трейдера в дата-центре биржи за плату; сокращает задержку.' },
      { en: 'matching engine', ru: 'матчинг-движок', def: 'Система биржи, определяющая приоритет исполнения и обрабатывающая заявки, отмены и сделки.' },
      { en: 'parent / child order', ru: 'родительский / дочерний ордер', def: 'Родительский — исходное намерение клиента, дочерние — мелкие заявки, на которые его нарезает алгоритм; рынок видит только дочерние.' },
      { en: 'VWAP', ru: 'средневзвешенная по объёму цена', def: '$\\mathrm{VWAP}=\\sum p_i v_i/\\sum v_i$; бенчмарк и цель одноимённого алгоритма исполнения.' },
      { en: 'realized spread', ru: 'реализованный спред', def: 'Разность цены сделки и середины спреда через заданное время (классически 5 мин); считался прибылью маркет-мейкера, но в HFT-мире часто отрицателен.' },
      { en: 'order imbalance', ru: 'дисбаланс заявок', def: '$(B-S)/(B+S)$ — относительный перевес покупок над продажами за интервал.' },
      { en: 'high-frequency quoting (HFQ)', ru: 'высокочастотное котирование', def: 'Быстрые колебания лучшей цены покупки или продажи на масштабах миллисекунд, не следующие за фундаментальной стоимостью.' },
      { en: 'signature plot', ru: 'сигнатурный график', def: 'Нормированная дисперсия возвратов, делённая на горизонт, как функция горизонта; для случайного блуждания равна константе, превышение на коротких масштабах — шум.' },
      { en: 'wavelet variance', ru: 'вейвлет-дисперсия', def: 'Дисперсия компоненты цены, отвечающей данному масштабу времени; инструмент Hasbrouck для обнаружения HFQ.' },
      { en: 'TWAP risk', ru: 'риск TWAP', def: 'Ценовая неопределённость заявки, вызванная случайной задержкой её доставки.' },
      { en: 'quote stuffing', ru: 'забивание котировками', def: 'Массовая отправка и мгновенная отмена заявок с целью замедлить конкурентов; по [22] считается манипуляцией.' },
      { en: 'momentum ignition', ru: 'зажигание импульса', def: 'Стратегия провокации предсказуемых ценовых паттернов у трейдеров-моментум.' },
      { en: 'intensity', ru: 'интенсивность', def: 'Мгновенная скорость прихода событий $\\lambda_t$; у Пуассона постоянна, у Хоукса зависит от прошлых событий.' },
      { en: 'Hawkes process', ru: 'процесс Хоукса', def: 'Самовозбуждающийся точечный процесс: $\\lambda_t=\\mu+\\sum_{t_i<t}\\phi(t-t_i)$; каждое событие повышает интенсивность на время.' },
      { en: 'kernel', ru: 'ядро (процесса Хоукса)', def: 'Неотрицательная функция $\\phi(u)$, задающая вклад события в интенсивность через время $u$.' },
      { en: 'branching ratio', ru: 'коэффициент ветвления', def: '$n=\\int\\phi$ — среднее число событий, порождённых одним; стационарность при $n<1$, средняя интенсивность $\\mu/(1-n)$.' },
      { en: 'inhibition', ru: 'торможение', def: 'Отрицательное влияние события на интенсивность другого; линейный Хоукс его не допускает.' },
      { en: 'order splitting', ru: 'дробление ордера', def: 'Нарезка крупного намерения на последовательность мелких заявок; даёт самовозбуждение сделок одного знака.' },
      { en: 'fast / slow traders', ru: 'быстрые и медленные трейдеры', def: 'В [17]: быстрые одновременно торгуют на нескольких площадках, медленные — на одной; доля быстрых влияет на глубину и отмены.' },
      { en: 'phantom liquidity', ru: 'фантомная ликвидность', def: 'Котировки, исчезающие при попытке их исполнить; в [17] отмены объясняются обновлением информации, а не обманом.' }
    ]
  });
})();
