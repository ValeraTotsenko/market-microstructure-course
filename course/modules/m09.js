/* Модуль 9: Другие рынки: валюта, крипто, российский рынок */
(function () {
  const F = (x, d) => Course.fmt.n(x, d);

  /* ---------- общие помощники ---------- */
  function ols1(x, y) {
    const n = x.length;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (sxx < 1e-12 || syy < 1e-12) return { a: my, b: 0, r2: 0, se: NaN };
    const b = sxy / sxx, a = my - b * mx, r2 = (sxy * sxy) / (sxx * syy);
    const se = n > 2 ? Math.sqrt(Math.max(syy - b * sxy, 0) / (n - 2) / sxx) : NaN;
    return { a: a, b: b, r2: r2, se: se };
  }
  function r2two(x1, x2, y) {
    const n = y.length;
    let m1 = 0, m2 = 0, my = 0;
    for (let i = 0; i < n; i++) { m1 += x1[i]; m2 += x2[i]; my += y[i]; }
    m1 /= n; m2 /= n; my /= n;
    let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const a = x1[i] - m1, b = x2[i] - m2, c = y[i] - my;
      s11 += a * a; s22 += b * b; s12 += a * b; s1y += a * c; s2y += b * c; syy += c * c;
    }
    const det = s11 * s22 - s12 * s12;
    if (syy < 1e-12 || Math.abs(det) < 1e-12) return 0;
    const b1 = (s1y * s22 - s2y * s12) / det, b2 = (s2y * s11 - s1y * s12) / det;
    return Math.max(0, Math.min(1, (b1 * s1y + b2 * s2y) / syy));
  }
  function el(parent, tag, html, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    parent.appendChild(e);
    return e;
  }
  /* простой точечный график: pts [[x,y]], lines [{a,b,color,dash,label}] */
  function scatter(c, o) {
    const ctx = c.getContext("2d"), W = c.logicalW, H = c.logicalH;
    const pad = { l: 52, r: 14, t: 26, b: 38 };
    const css = Course.ui.color, ink = css("--ink"), muted = css("--muted"), grid = css("--grid");
    ctx.clearRect(0, 0, W, H);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    o.pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    if (!isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
    if (x1 - x0 < 1e-9) x1 = x0 + 1;
    if (y1 - y0 < 1e-9) y1 = y0 + 1;
    const yp = (y1 - y0) * 0.05; y0 -= yp; y1 += yp;
    const X = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
    const Y = (v) => H - pad.b - ((v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    ctx.font = "12px system-ui,sans-serif";
    ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) { const v = y0 + ((y1 - y0) * i) / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(F(v, 1), pad.l - 6, y); }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let i = 0; i <= 5; i++) { const v = x0 + ((x1 - x0) * i) / 5, x = X(v); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke(); ctx.fillText(F(v, 1), x, H - pad.b + 5); }
    ctx.fillStyle = Course.ui.palette()[0]; ctx.globalAlpha = 0.45;
    o.pts.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 2.3, 0, 6.2832); ctx.fill(); });
    ctx.globalAlpha = 1;
    const pal = Course.ui.palette();
    let lx = pad.l + 8;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    (o.lines || []).forEach((ln, i) => {
      ctx.strokeStyle = ln.color || pal[(i + 1) % pal.length]; ctx.lineWidth = 2; ctx.setLineDash(ln.dash || []);
      ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b); ctx.clip();
      ctx.beginPath(); ctx.moveTo(X(x0), Y(ln.a + ln.b * x0)); ctx.lineTo(X(x1), Y(ln.a + ln.b * x1)); ctx.stroke();
      ctx.restore(); ctx.setLineDash([]);
      if (ln.label) { ctx.fillStyle = ln.color || pal[(i + 1) % pal.length]; ctx.fillRect(lx, pad.t - 14, 14, 3); ctx.fillStyle = ink; ctx.fillText(ln.label, lx + 19, pad.t - 12); lx += 30 + ctx.measureText(ln.label).width; }
    });
    ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    if (o.xlabel) ctx.fillText(o.xlabel, (pad.l + W - pad.r) / 2, H - 4);
    if (o.ylabel) { ctx.save(); ctx.translate(12, (pad.t + H - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
  }

  /* ================= Виджет 1: поток -> цена (Evans-Lyons, учебная модель) ================= */
  function wFlow(root) {
    let seed = 11;
    const note = el(root, "div", "<b>Учебная модель.</b> Мы сами задаём, что цена зависит от потока (по построению), и смотрим, как выглядит разложение объяснённой дисперсии. Это иллюстрация логики регрессии, а не доказательство и не реальные данные.", "callout");
    const sl = {};
    sl.T = Course.ui.slider(root, { label: "Число дней", min: 40, max: 400, step: 10, value: 120, fmt: (v) => String(v), onInput: update });
    sl.b1 = Course.ui.slider(root, { label: "Вес разницы ставок β₁", min: 0, max: 2, step: 0.05, value: 0.3, onInput: update });
    sl.b2 = Course.ui.slider(root, { label: "Вес потока β₂", min: 0, max: 2, step: 0.05, value: 0.8, onInput: update });
    sl.se = Course.ui.slider(root, { label: "Шум ε (σ)", min: 0, max: 3, step: 0.1, value: 0.8, onInput: update });
    Course.ui.button(root, "Новая выборка", () => { seed += 7; update(); });
    const cv = Course.ui.canvas(root, 640, 300);
    const out = Course.ui.output(root);
    function update() {
      const T = sl.T.get(), b1 = sl.b1.get(), b2 = sl.b2.get(), se = sl.se.get();
      const rng = Course.rand.seeded(seed), nrm = () => Course.rand.normal(rng);
      const dr = [], x = [], y = [];
      for (let i = 0; i < T; i++) { const d = nrm(), f = nrm(), e = nrm() * se; dr.push(d); x.push(f); y.push(b1 * d + b2 * f + e); }
      const m = ols1(dr, y), fl = ols1(x, y), r2b = r2two(dr, x, y);
      const days = [], p = [], pm = [], pf = [];
      let c0 = 0, c1 = 0, c2 = 0;
      for (let i = 0; i < T; i++) { c0 += y[i]; c1 += m.a + m.b * dr[i]; c2 += fl.a + fl.b * x[i]; days.push(i + 1); p.push(c0); pm.push(c1); pf.push(c2); }
      Course.plot.line(cv, {
        series: [{ x: days, y: p, label: "курс (накоплено)", color: Course.ui.color("--ink") },
        { x: days, y: pm, label: "модель: только ставки", color: Course.ui.palette()[1], dash: [5, 4] },
        { x: days, y: pf, label: "модель: только поток", color: Course.ui.palette()[0] }],
        xlabel: "день", ylabel: "накопленное изменение курса (усл. ед.)"
      });
      out.innerHTML = "R² только по ставкам: <b>" + F(m.r2, 2) + "</b> · R² только по потоку: <b>" + F(fl.r2, 2) + "</b> · R² обе переменные: <b>" + F(r2b, 2) + "</b><br>" +
        "Оценки: β₁ = " + F(m.b, 2) + " (истина " + F(b1, 2) + "), β₂ = " + F(fl.b, 2) + " (истина " + F(b2, 2) + ").<br>" +
        "<span style='color:var(--muted)'>Для сравнения: по Evans–Lyons (1996, обзор МНБ) R² с потоком 0,64 (DM/USD) и 0,45 (JPY/USD), без потока около 0,01. Попробуйте β₂ = 0 и β₂ = 1,5, затем увеличьте шум.</span>";
    }
    update();
  }

  /* ================= Виджет 2: горячая картошка ================= */
  function wPotato(root) {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    let fixed = null; // фиксированный пример из статьи
    const sl = {};
    sl.Q = Course.ui.slider(root, { label: "Клиент продаёт, млн евро", min: 1, max: 20, step: 1, value: 5, onInput: () => { fixed = null; update(); } });
    sl.n = Course.ui.slider(root, { label: "Макс. длина цепочки дилеров", min: 2, max: 10, step: 1, value: 7, fmt: (v) => String(v), onInput: () => { fixed = null; update(); } });
    sl.f = Course.ui.slider(root, { label: "Доля позиции, которую дилер гасит своим клиентом", min: 0, max: 0.9, step: 0.05, value: 0.3, fmt: (v) => F(v * 100, 0) + "%", onInput: () => { fixed = null; update(); } });
    Course.ui.button(root, "Загрузить пример из статьи (рис. 1)", () => { fixed = { Q: 5, off: [1, 0, 0, 2, 0, 0, 2] }; update(); }, true);
    const cv = Course.ui.canvas(root, 640, 270);
    const out = Course.ui.output(root);
    function compute() {
      let Q, off;
      if (fixed) { Q = fixed.Q; off = fixed.off.slice(); }
      else {
        Q = sl.Q.get(); const n = sl.n.get(), f = sl.f.get();
        off = []; let r = Q;
        for (let i = 0; i < n; i++) { if (i === n - 1) off.push(r); else { const o = r * f; off.push(o); r -= o; } }
      }
      const r = [], pass = [];
      let rem = Q, turnover = Q, flow = -Q;
      for (let i = 0; i < off.length; i++) {
        r.push(rem);
        turnover += off[i]; flow += off[i];
        rem = Math.max(rem - off[i], 0);
        if (i < off.length - 1) { pass.push(rem); turnover += rem; flow -= rem; }
      }
      return { Q: Q, r: r, pass: pass, off: off, turnover: turnover, flow: flow };
    }
    function update() {
      const c = compute();
      const labels = c.pass.map((_, i) => names[i] + " → " + names[i + 1]);
      Course.plot.bars(cv, { labels: labels, values: c.pass.map((v) => +v.toFixed(2)), title: "Объём сделки «дилер → следующий дилер», млн евро", ylabel: "млн евро" });
      const kpass = c.pass.reduce((a, b) => a + b, 0);
      out.innerHTML = "Исходная клиентская сделка: <b>" + F(c.Q, 1) + "</b> млн · общий оборот всех сделок цепочки: <b>" + F(c.turnover, 1) + "</b> млн · множитель оборота: <b>" + F(c.turnover / c.Q, 2) + "×</b><br>" +
        "Межбанковские передачи: " + F(kpass, 1) + " млн · знаковый order flow (инициатор покупает +, продаёт −): <b>" + F(c.flow, 1) + "</b> млн<br>" +
        "<span style='color:var(--muted)'>Оборот = 2·Q + сумма передач (в нашем счёте) — при одной клиентской продаже Q и полном погашении позиции клиентами. Для примера статьи: 2·5 + 18 = 28 млн.</span>";
    }
    update();
  }

  /* ================= Виджет 3: две площадки, лидер-ведомый, комиссии ================= */
  function wCrypto(root) {
    let seed = 5;
    root.appendChild(Object.assign(document.createElement("div"), { className: "callout", innerHTML: "<b>Учебная симуляция.</b> Лидер — случайное блуждание (σ = 1 б.п. за шаг 50 мс). Ведомый повторяет движения лидера с запаздыванием и силой κ плюс свой шум. Цифры не из статьи и не калиброваны на реальных рынках; статья Albers и др. показывает лишь качественную картину." }));
    const sl = {};
    sl.lag = Course.ui.slider(root, { label: "Запаздывание ведомого, шагов по 50 мс", min: 0, max: 20, step: 1, value: 6, fmt: (v) => v + " (" + (v * 50) + " мс)", onInput: update });
    sl.k = Course.ui.slider(root, { label: "Cross-impact κ (доля хода лидера, переносимая на ведомого)", min: 0, max: 1, step: 0.05, value: 0.8, onInput: update });
    sl.nf = Course.ui.slider(root, { label: "Собственный шум ведомого, б.п./шаг", min: 0, max: 2, step: 0.05, value: 0.6, onInput: update });
    sl.th = Course.ui.slider(root, { label: "Порог сигнала |S|, б.п.", min: 0, max: 8, step: 0.25, value: 2.5, onInput: update });
    sl.sp = Course.ui.slider(root, { label: "Спред ведомой площадки, б.п.", min: 0, max: 5, step: 0.1, value: 1, onInput: update });
    sl.fee = Course.ui.slider(root, { label: "Taker-комиссия (за сторону), б.п.", min: 0, max: 8, step: 0.1, value: 0, onInput: update });
    const bt = el(root, "div", "");
    bt.style.margin = "6px 0";
    Course.ui.button(bt, "Без комиссий (0)", () => { sl.fee.set(0); update(); }, true);
    Course.ui.button(bt, "Низкая (1,5)", () => { sl.fee.set(1.5); update(); }, true);
    Course.ui.button(bt, "Типичная (5)", () => { sl.fee.set(5); update(); }, true);
    Course.ui.button(bt, "Новая выборка", () => { seed += 3; update(); });
    const cv1 = Course.ui.canvas(root, 640, 230);
    const cv2 = Course.ui.canvas(root, 640, 260);
    const out = Course.ui.output(root);
    function update() {
      const L = sl.lag.get(), kap = sl.k.get(), nf = sl.nf.get(), th = sl.th.get(), sp = sl.sp.get(), fee = sl.fee.get();
      const N = 20000, rng = Course.rand.seeded(seed), nrm = () => Course.rand.normal(rng);
      const rl = new Array(N), rf = new Array(N), Pl = new Array(N), Pf = new Array(N);
      let a = 0, b = 0;
      for (let t = 0; t < N; t++) { rl[t] = nrm(); }
      for (let t = 0; t < N; t++) { rf[t] = (t - L >= 0 ? kap * rl[t - L] : 0) + nf * nrm(); a += rl[t]; b += rf[t]; Pl[t] = a; Pf[t] = b; }
      // график последних 200 шагов
      const w0 = 3000, w1 = 3200, xs = [], yl = [], yf = [];
      for (let t = w0; t < w1; t++) { xs.push((t - w0) * 50); yl.push(Pl[t] - Pl[w0]); yf.push(Pf[t] - Pf[w0]); }
      Course.plot.line(cv1, { series: [{ x: xs, y: yl, label: "лидер", color: Course.ui.palette()[0] }, { x: xs, y: yf, label: "ведомый", color: Course.ui.palette()[1] }], xlabel: "время, мс", ylabel: "цена, б.п.", title: "Фрагмент: ведомый повторяет лидера с лагом" });
      // сигнал и сделки
      const S = [], Y = [];
      let trades = 0, gross = 0, cumG = [0], cumN = [0], tx = [0];
      const cost = 2 * fee + sp;
      let t = L;
      if (L > 0) {
        while (t < N - L - 1) {
          let s = 0; for (let j = 0; j < L; j++) s += rl[t - j];
          const fut = Pf[t + L] - Pf[t];
          S.push(s); Y.push(fut);
          if (Math.abs(s) > th) {
            const g = (s > 0 ? 1 : -1) * fut;
            trades++; gross += g;
            cumG.push(cumG[cumG.length - 1] + g); cumN.push(cumN[cumN.length - 1] + g - cost); tx.push(trades);
            t += L + 1;
          } else t += 1;
        }
      }
      const r2 = S.length > 3 ? ols1(S, Y).r2 : 0;
      Course.plot.line(cv2, { series: [{ x: tx, y: cumG, label: "до издержек", color: Course.ui.palette()[2] }, { x: tx, y: cumN, label: "после комиссий и спреда", color: Course.ui.palette()[3] }], xlabel: "номер сделки (taker на ведомом рынке)", ylabel: "накопленный результат, б.п.", title: "Кумулятивный результат простой стратегии «лидер → ведомый»" });
      if (L === 0) { out.innerHTML = "Лаг равен нулю: ведомый движется синхронно с лидером, предсказывать нечего. Увеличьте запаздывание."; return; }
      const mg = trades ? gross / trades : 0;
      const beFee = (mg - sp) / 2;
      out.innerHTML = "R² «сигнал лидера → будущий ход ведомого»: <b>" + F(r2, 3) + "</b> · сделок: <b>" + trades + "</b><br>" +
        "Средний валовый ход за сделку: <b>" + F(mg, 2) + " б.п.</b> · издержки за круг (2 комиссии + полный спред): <b>" + F(cost, 2) + " б.п.</b> · итог за сделку: <b>" + F(mg - cost, 2) + " б.п.</b><br>" +
        "Безубыточная комиссия (за сторону) при этом спреде: <b>" + F(Math.max(beFee, 0), 2) + " б.п.</b>" + (beFee < 0 ? " (даже без комиссий спред съедает сигнал)" : "") +
        "<br><span style='color:var(--muted)'>Это учебная иллюстрация вывода статьи: предсказуемость возникает, но прибыль решают издержки (схема комиссий).</span>";
    }
    update();
  }

  /* ================= Виджет 4: проверка масштабного закона ================= */
  function wScaling(root) {
    let seed = 21;
    root.appendChild(Object.assign(document.createElement("div"), { className: "callout", innerHTML: "<b>Синтетические данные.</b> Мы сами задаём «истинный» показатель и шум и смотрим, как обычная регрессия ln N = α + β ln W его восстанавливает. Настоящие данные Мосбиржи (Zhiltsova, 2020) здесь не воспроизводятся; их итоги — в таблице выше." }));
    const sl = {};
    sl.b = Course.ui.slider(root, { label: "Истинный показатель β", min: 0, max: 1.2, step: 0.01, value: 0.67, onInput: update });
    sl.sd = Course.ui.slider(root, { label: "Шум в ln N (σ)", min: 0, max: 1.5, step: 0.05, value: 0.5, onInput: update });
    sl.me = Course.ui.slider(root, { label: "Ошибка измерения ln W (σ)", min: 0, max: 1.5, step: 0.05, value: 0, onInput: update });
    sl.n = Course.ui.slider(root, { label: "Число «акция×месяц»", min: 20, max: 2600, step: 20, value: 300, fmt: (v) => String(v), onInput: update });
    sl.rg = Course.ui.slider(root, { label: "Размах ln W (в е-раз)", min: 1, max: 14, step: 0.5, value: 8, onInput: update });
    Course.ui.button(root, "Новая выборка", () => { seed += 5; update(); });
    const cv = Course.ui.canvas(root, 640, 330);
    const out = Course.ui.output(root);
    function update() {
      const b = sl.b.get(), sd = sl.sd.get(), me = sl.me.get(), n = sl.n.get(), rg = sl.rg.get();
      const rng = Course.rand.seeded(seed), nrm = () => Course.rand.normal(rng);
      const xs = [], ys = [], pts = [];
      for (let i = 0; i < n; i++) {
        const lw = 18 + rng() * rg;                 // ln W (условные рубли)
        const ln = 2 + b * (lw - 18) + sd * nrm();   // ln N
        const lwObs = lw + me * nrm();
        xs.push(lwObs); ys.push(ln); pts.push([lwObs, ln]);
      }
      const f = ols1(xs, ys);
      let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; } mx /= n; my /= n;
      const ref = (s) => ({ a: my - s * mx, b: s });
      const l23 = ref(2 / 3), l1 = ref(1), l0 = ref(0);
      scatter(cv, {
        pts: pts, xlabel: "ln W (торговая активность)", ylabel: "ln N (число сделок)",
        lines: [{ a: f.a, b: f.b, color: Course.ui.palette()[1], label: "МНК" },
        { a: l23.a, b: l23.b, color: Course.ui.palette()[2], dash: [6, 4], label: "наклон 2/3" },
        { a: l1.a, b: l1.b, color: Course.ui.palette()[3], dash: [2, 3], label: "наклон 1" },
        { a: l0.a, b: l0.b, color: Course.ui.color("--muted"), dash: [2, 3], label: "наклон 0" }]
      });
      const ci = 1.96 * f.se, lo = f.b - ci, hi = f.b + ci;
      const inside = (v) => (v >= lo && v <= hi ? "внутри" : "вне");
      out.innerHTML = "Оценка β = <b>" + F(f.b, 3) + "</b> (SE " + F(f.se, 3) + ", 95%-интервал " + F(lo, 3) + "…" + F(hi, 3) + ") · R² = <b>" + F(f.r2, 2) + "</b><br>" +
        "2/3 — " + inside(2 / 3) + " интервала; 1 — " + inside(1) + "; 0 — " + inside(0) + ".<br>" +
        "<span style='color:var(--muted)'>Что смотреть: (1) при росте ошибки измерения ln W наклон занижается (затухание), хотя «закон» не менялся; (2) узкий размах ln W или малая выборка раздувают интервал, и разные гипотезы перестают различаться; (3) сильный шум снижает R², но не обязательно смещает наклон.</span>";
    }
    update();
  }

  /* ================= Виджет 5: бюджет задержки котировки ================= */
  function wLatency(root) {
    root.appendChild(Object.assign(document.createElement("div"), { className: "callout", innerHTML: "<b>Учебный бюджет.</b> Из статьи Торопова взяты два числа: расчёт без кэша ≈1001 мкс в среднем, при кэше N = 40 и попадании ≈94% общее среднее ≈276 мкс (подобранное здесь «быстрое» время 230 мкс воспроизводит это). Остальные этапы — наши условные значения." }));
    const sl = {};
    sl.feed = Course.ui.slider(root, { label: "Данные биржи → робот, мкс", min: 10, max: 1000, step: 10, value: 100, fmt: (v) => v + " мкс", onInput: update });
    sl.hit = Course.ui.slider(root, { label: "Попадание в кэш", min: 0, max: 1, step: 0.01, value: 0.94, fmt: (v) => F(v * 100, 0) + "%", onInput: update });
    sl.fast = Course.ui.slider(root, { label: "Время при попадании, мкс", min: 20, max: 500, step: 10, value: 230, fmt: (v) => v + " мкс", onInput: update });
    sl.slow = Course.ui.slider(root, { label: "Полный пересчёт теор. цены, мкс", min: 200, max: 3000, step: 50, value: 1000, fmt: (v) => v + " мкс", onInput: update });
    sl.risk = Course.ui.slider(root, { label: "Пре-трейд риск-контроль брокера, мкс", min: 0, max: 800, step: 10, value: 200, fmt: (v) => v + " мкс", onInput: update });
    sl.gw = Course.ui.slider(root, { label: "Шлюз биржи и матчинг, мкс", min: 20, max: 1000, step: 10, value: 200, fmt: (v) => v + " мкс", onInput: update });
    sl.vol = Course.ui.slider(root, { label: "Волатильность базового актива, б.п./√с", min: 1, max: 100, step: 1, value: 10, fmt: (v) => String(v), onInput: update });
    sl.bud = Course.ui.slider(root, { label: "Целевой бюджет, мкс", min: 100, max: 2000, step: 50, value: 600, fmt: (v) => v + " мкс", onInput: update });
    const bt = el(root, "div", "");
    bt.style.margin = "6px 0";
    Course.ui.button(bt, "Прямой доступ (ULLDMA/sponsored): риск-контроль 10 мкс (условно)", () => { sl.risk.set(10); update(); }, true);
    Course.ui.button(bt, "Без кэша (N = 0)", () => { sl.hit.set(0); update(); }, true);
    const cv = Course.ui.canvas(root, 640, 270);
    const out = Course.ui.output(root);
    function update() {
      const feed = sl.feed.get(), h = sl.hit.get(), fast = sl.fast.get(), slow = sl.slow.get(), risk = sl.risk.get(), gw = sl.gw.get(), vol = sl.vol.get(), bud = sl.bud.get();
      const price = h * fast + (1 - h) * slow;
      const total = feed + price + risk + gw;
      Course.plot.bars(cv, { labels: ["данные", "расчёт цены", "риск-контроль", "шлюз биржи", "ИТОГО"], values: [feed, +price.toFixed(1), risk, gw, +total.toFixed(1)], title: "Средняя задержка смены котировки по этапам, мкс", ylabel: "мкс" });
      const move = vol * Math.sqrt(total / 1e6);
      out.innerHTML = "Средний расчёт цены при данной доле попаданий: <b>" + F(price, 0) + " мкс</b> · итого: <b>" + F(total, 0) + " мкс</b> (" + (total <= bud ? "в бюджете" : "превышает бюджет на " + F(total - bud, 0) + " мкс") + ").<br>" +
        "Доля расчёта цены в итоге: <b>" + F(100 * price / total, 0) + "%</b>.<br>" +
        "Типичный (1σ) ход базового актива за время задержки ≈ <b>" + F(move, 3) + " б.п.</b> — на столько в среднем может устареть котировка (учебная оценка σ·√τ).<br>" +
        "<span style='color:var(--muted)'>Среднее скрывает хвост: в статье выбросы ≥1,5–2 мс составили 5,83% замеров без кэша и 0,14% при N = 40.</span>";
    }
    update();
  }

  /* ================= Виджет 6: шаг котирования, позиция, ПД ================= */
  function wStep(root) {
    let seed = 3;
    root.appendChild(Object.assign(document.createElement("div"), { className: "callout", innerHTML: "<b>Учебная симуляция по духу статьи Серебренникова.</b> Цена — случайное блуждание по тикам; «идеальный» маркет-мейкер покупает при падении на шаг котирования и продаёт при росте на шаг, остаток в конце закрывает по последней цене. Идеализации те же: нулевые задержки, исполнение гарантировано, без комиссий. Это не формула ПД из статьи и не данные FORTS." }));
    const sl = {};
    sl.m = Course.ui.slider(root, { label: "Шаг котирования, тиков", min: 1, max: 10, step: 1, value: 1, fmt: (v) => String(v), onInput: update });
    sl.d = Course.ui.slider(root, { label: "Тренд (смещение вероятности роста)", min: -0.2, max: 0.2, step: 0.01, value: 0, onInput: update });
    sl.T = Course.ui.slider(root, { label: "Сделок на периоде", min: 200, max: 5000, step: 100, value: 2000, fmt: (v) => String(v), onInput: update });
    Course.ui.button(root, "Другие траектории", () => { seed += 9; update(); });
    const cv = Course.ui.canvas(root, 640, 260);
    const out = Course.ui.output(root);
    function sim(m, drift, steps, paths, sd) {
      const rng = Course.rand.seeded(sd);
      let sp = 0, st = 0, sm = 0, sa = 0;
      const pnls = [];
      for (let k = 0; k < paths; k++) {
        let p = 0, ref = 0, pos = 0, cash = 0, tr = 0, mx = 0;
        for (let t = 0; t < steps; t++) {
          p += rng() < 0.5 + drift ? 1 : -1;
          if (p <= ref - m) { cash -= p; pos++; ref = p; tr++; }
          else if (p >= ref + m) { cash += p; pos--; ref = p; tr++; }
          const a = Math.abs(pos); if (a > mx) mx = a;
        }
        const pnl = cash + pos * p;
        pnls.push(pnl); sp += pnl; st += tr; sm += mx; sa += Math.abs(pos);
      }
      return { pnl: sp / paths, tr: st / paths, mx: sm / paths, fin: sa / paths };
    }
    function update() {
      const m = sl.m.get(), d = sl.d.get(), T = sl.T.get();
      const labels = [], vals = [];
      let cur = null;
      for (let s = 1; s <= 10; s++) { const r = sim(s, d, T, 60, seed); labels.push("шаг " + s); vals.push(+r.pnl.toFixed(1)); if (s === Math.round(m)) cur = r; }
      Course.plot.bars(cv, { labels: labels, values: vals, title: "Средний результат «идеального» MM по 60 траекториям, тиков", ylabel: "тиков" });
      out.innerHTML = "При шаге <b>" + m + "</b>: сделок ≈ <b>" + F(cur.tr, 0) + "</b>, макс. |позиция| ≈ <b>" + F(cur.mx, 1) + "</b> лотов, конечная |позиция| ≈ " + F(cur.fin, 1) + ", средний результат <b>" + F(cur.pnl, 1) + "</b> тиков.<br>" +
        "<span style='color:var(--muted)'>Что смотреть: растёт ли шаг — число сделок и максимальная позиция падают (в статье: при увеличении шага в m раз позиция уменьшается примерно в m раз). Затем включите тренд: накопленная против тренда позиция превращает «заработок на спреде» в убыток.</span>";
    }
    update();
  }

  Course.register({
    id: 'm09',
    order: 9,
    title: 'Другие рынки: валюта, крипто, российский рынок',
    summary: 'Как микроструктурный взгляд работает вне биржевых акций: поток ордеров на валютном рынке, фрагментация и cross-impact в крипте, проверка законов масштабирования на данных Мосбиржи и маркет-мейкинг в российской практике.',
    level: 'средний',
    time: '~2,5 ч',
    lessons: [
      /* ===================== УРОК 1 ===================== */
      {
        id: 'm09-l1',
        title: 'FX как рынок: дилеры, поток ордеров и курс',
        minutes: 30,
        html: `
<p>Валютный рынок (foreign exchange, FX) — крупнейший финансовый рынок мира, но у него нет биржи, нет единого стакана и нет общей ленты сделок. Поэтому он удобен для проверки идей: что именно двигает цену — новости о макроэкономике или сам поток покупок и продаж? Этот урок отвечает на вопрос, почему микроструктурный подход (order flow) стал одной из главных альтернатив макромоделям.</p>

<div class="callout warn"><span class="t">Про источник</span>Основной опорный текст этого и следующего уроков — не книга Лайонса (Lyons), как могло бы показаться по каталогу, а <b>обзорная статья Gereben, Gyomai, Kiss M. «The microstructure approach to exchange rates: a survey from a central bank's viewpoint»</b> (Magyar Nemzeti Bank, Occasional Papers 42, 2005, источник [31]). Это обзор литературы, в основном работ Лайонса и Эванса; данные и оценки в нём относятся к 1990-м и началу 2000-х, до эпохи HFT. Исходные работы мы пересказываем через этот обзор.</div>

<h2>Как устроен рынок</h2>
<p>Рынок валютных сделок — внебиржевой (over-the-counter, OTC): нет физического торгового зала, торговля идёт круглосуточно и разбросана по часовым поясам. Обзор выделяет три типа участников: <b>дилеры-маркет-мейкеры</b> (крупные банки, постоянно дающие двусторонние котировки), <b>брокеры</b> (сводят заявки за комиссию, не торгуя за свой счёт) и <b>клиенты</b> (корпорации, небанковские финансовые институты, «нерыночные» банки).</p>
<p>Межбанковская торговля идёт двумя способами. <b>Прямой рынок</b> (direct market): дилеры торгуют друг с другом двусторонне, сделки видны только участникам, поэтому рынок «непрозрачен» (пример систем — Reuters 3000 Dealing и её предшественник D2000-1). <b>Брокерский рынок</b> (indirect market): заявки подаются брокеру, цена и объём определяются одновременно, это order-driven схема (Reuters 3000 Spot Matching, EBS). Лучшие лимитные заявки видны всем на экране, имена контрагентов скрыты.</p>
<p>Масштабы по оценкам 2005 года из обзора (сегодня цифры другие): оборот порядка 1 200 млрд долл. в день, спот около 30%, межбанковская торговля 50–60% оборота, из неё примерно половина идёт через брокеров. Не берите эти числа как нынешние.</p>

<h2>Макроподход и его провал</h2>
<p>Классический подход объясняет изменение курса $s$ макропеременными: ставками, денежной массой и т.п.:</p>
$$\\Delta s_t=f(i,m,\\dots)+\\varepsilon_t.$$
<p>Работа Meese и Rogoff (1983) показала, что такие модели вне выборки не превосходят простое случайное блуждание. Обзор называет три «загадки»: избыточный оборот, избыточная волатильность и сама загадка определения курса. Микроструктурный подход заменяет объясняющие переменные на поток ордеров $x$:</p>
$$\\Delta s_t=g(x_t,\\dots)+\\varepsilon_t.$$

<h2>Order flow — это не объём</h2>
<p><b>Поток ордеров</b> (order flow) — знаковый баланс сделок, инициированных покупателями и продавцами. <b>Оборот</b> (turnover, объём) — сумма сделок без знака. У каждой сделки есть покупатель и продавец, но есть и <b>инициатор</b> (тот, кто пришёл и «ударил по котировке»), и пассивная сторона. Положительный поток — давление покупок на валюту, отрицательный — продаж. В следующем уроке мы увидим на цифрах, как оборот может быть огромным при небольшом знаковом потоке.</p>
<p>Есть два семейства объяснений, почему поток двигает курс. В <b>информационных моделях</b> (information models) у участников разная информация: информированные клиенты покупают, когда валюта недооценена, и дилер на них теряет; эффект потока <i>постоянный</i>. В <b>инвентарных моделях</b> (inventory models) асимметрии информации нет, дилеры просто избавляются от нежелательной позиции, сдвигая котировки; эффект <i>временный</i>. Реальность, вероятно, смесь обоих.</p>

<h2>Модель Кайла в двух строках</h2>
<p>Базовая теория — модель Kyle: маркет-мейкер, информированный трейдер и шумовые (ликвидностные) трейдеры. Итоговая стоимость актива $s\\sim N(\\bar s,\\sigma_s^2)$, шумовой спрос $u\\sim N(0,\\sigma_u^2)$. Маркет-мейкер видит только суммарный поток $\\omega=x(s)+u$ и ставит цену $p(\\omega)=E[s\\mid\\omega]$ (нулевая ожидаемая прибыль из-за конкуренции). В линейном равновесии:</p>
$$x(s)=\\beta\\,(s-\\bar s),\\qquad p(\\omega)=\\mu+\\lambda\\,\\omega,\\qquad \\beta=\\frac{\\sigma_u}{\\sigma_s},\\quad \\lambda=\\frac{\\sigma_s}{2\\sigma_u},\\quad \\beta=\\frac1{2\\lambda}.$$
<p>Словами: $\\lambda$ — «цена потока» (сколько цена сдвигается на единицу чистого потока), она растёт, когда много информированных (большой $\\sigma_s$) и мало шума ($\\sigma_u$). Шум маскирует информированного. <i>Учебный пример:</i> при $\\sigma_s=2$, $\\sigma_u=1$ получаем $\\beta=0{,}5$, $\\lambda=1$; проверка $1/(2\\lambda)=0{,}5=\\beta$. Удвоим шум до $\\sigma_u=2$: $\\lambda=0{,}5$, цена реагирует на поток вдвое слабее. (Равновесные $\\beta=\\sigma_u/\\sigma_s$ и $\\lambda=\\sigma_s/(2\\sigma_u)$ сверены с PDF обзора; числа примера наши.)</p>

<h2>Модель Эванса–Лайонса</h2>
<p>В модели Evans–Lyons за день три раунда: (1) приходит публичная информация, например о разнице ставок; (2) дилеры торгуют друг с другом, и межбанковский поток виден всем; (3) дилеры, зная суммарный поток, ставят курс, при котором клиенты выкупают накопившиеся у дилеров позиции. Итоговое уравнение, которое чаще всего оценивают:</p>
$$\\Delta s_t=\\beta_1\\,\\Delta(i_t-i^*_t)+\\beta_2\\,x_t+\\varepsilon_t,$$
<p>где $i-i^*$ — разница процентных ставок, $x$ — межбанковский поток. Курс трактуется как ожидаемая дисконтированная сумма будущих разниц ставок. Ключевая идея: публичная информация лишь косвенно говорит о будущих ставках и ставках дисконтирования, а то, как участники её интерпретируют, проявляется в торговле.</p>
<div class="example"><b>Учебный пример (числа условные).</b> Пусть $\\beta_1=0{,}1\\,\\%$ на п.п. разницы ставок, $\\beta_2=0{,}002\\,\\%$ на одну сделку чистого потока. За день разница ставок выросла на 0,10 п.п., а потоку покупок оказалось на 250 сделок больше, чем продаж. Вклад ставок: $0{,}1\\cdot0{,}10=0{,}01\\%$. Вклад потока: $0{,}002\\cdot250=0{,}5\\%$. В такой день курс «говорит» почти исключительно потоком, что и есть эмпирическое наблюдение, ради которого строили модель.</div>

<h2>Что показала эмпирика</h2>
<p>Evans и Lyons использовали данные Reuters Dealing 2000-1 за май–август 1996 года по DM/USD и JPY/USD (порядка миллиона сделок в день; размеры сделок в данных отсутствовали, поток считали как число покупок минус число продаж). Оценивали на дневных рядах. Результаты по обзору: коэффициент потока положителен и значим на уровне выше 99%; $R^2=0{,}64$ для DM/USD и $0{,}45$ для JPY/USD; без потока $R^2$ падает примерно до 0,01. Out-of-sample тест (оценка по 39 дням, проверка на 50) поток выигрывал у случайного блуждания на всех горизонтах, хотя преимущество падало с горизонтом.</p>

<div data-widget="flow" data-title="Поток против разницы ставок: учебная модель Эванса–Лайонса"></div>

<div class="callout key"><span class="t">Главное</span><ul>
<li>Order flow — знаковый баланс инициированных сделок; оборот — без знака. Это разные величины.</li>
<li>В Kyle $\\lambda=\\sigma_s/(2\\sigma_u)$: чем больше информированных относительно шума, тем сильнее цена реагирует на поток.</li>
<li>В Evans–Lyons $\\Delta s=\\beta_1\\Delta(i-i^*)+\\beta_2x$; по обзору поток даёт $R^2$ 0,64 и 0,45, а ставки в одиночку — около 0,01.</li>
<li>Информационные модели дают постоянный эффект потока, инвентарные — временный.</li>
</ul></div>

<div class="callout warn"><span class="t">Осторожно</span><ul>
<li>$R^2$ здесь — одновременная связь внутри дня, а не прогноз. Тест Meese–Rogoff использует реализованные значения регрессоров, поэтому, как отмечает сам обзор, это скорее проверка соответствия вне выборки, а не настоящий прогноз.</li>
<li>Выборка короткая (около четырёх месяцев 1996 года, две пары). Подтверждения на других наборах данных обзор упоминает, но цифры 2005 года не переносятся автоматически на нынешний рынок.</li>
<li>Поток может быть не причиной, а следствием: если клиенты торгуют вслед за ростом цены, корреляция есть и без «влияния» (обзор отдельно обсуждает positive feedback trading).</li>
</ul></div>
`,
        widgets: { flow: wFlow },
        quiz: [
          { q: 'Чем order flow отличается от объёма (turnover) на валютном рынке?', options: ['Order flow считается только по брокерскому рынку', 'Order flow — знаковый баланс сделок по инициатору, объём — сумма без знака', 'Это одно и то же, разные названия'], answer: 1, explain: 'Объём не различает покупки и продажи; поток считает инициированные покупателем сделки со знаком плюс, продавцом — минус.' },
          { q: 'В равновесии Kyle $\\lambda=\\sigma_s/(2\\sigma_u)$. Что произойдёт с $\\lambda$, если шумовой спрос $\\sigma_u$ вырастет?', options: ['Вырастет: больше объёма — больше воздействие', 'Снизится: информированному проще спрятаться, поток менее информативен', 'Не изменится'], answer: 1, explain: 'При большом шуме поток слабо отражает информацию, маркет-мейкер сдвигает цену меньше. $\\sigma_u$ стоит в знаменателе.' },
          { q: 'Какой вывод из $R^2=0{,}64$ для DM/USD корректен?', options: ['Поток спрогнозирует завтрашний курс с точностью 64%', 'В выборке 1996 года одновременная вариация курса в основном совпадала с потоком; без потока $R^2$ около 0,01', 'Макрофундаментал не влияет на курс'], answer: 1, explain: 'Это одновременная связь на коротком отрезке. Прогнозом и причинностью она не является, а о фундаментале говорят лишь, что ставки в одиночку почти ничего не объясняли в той выборке.' },
          { q: 'Что отличает инвентарную модель от информационной?', options: ['В ней эффект потока временный, асимметрии информации нет', 'В ней дилеры знают будущую цену', 'В ней нет маркет-мейкеров'], answer: 0, explain: 'В инвентарных моделях дилер просто гасит позицию, поэтому влияние потока затухает; в информационных поток отражает информацию, и эффект постоянный.' }
        ],
        sources: [
          { title: '[31] Gereben, Gyomai, Kiss M. — The microstructure approach to exchange rates (MNB Occasional Papers 42, 2005)', where: 'разд. 2.2 (устройство рынка), 2.3–2.4, 3.1–3.2 (Kyle, Evans–Lyons), 4 (эмпирика)', note: 'Обзор для центробанка, а не книга Лайонса. Данные 1990-х–2005 г.' }
        ]
      },

      /* ===================== УРОК 2 ===================== */
      {
        id: 'm09-l2',
        title: 'Горячая картошка, информация и интервенции',
        minutes: 30,
        html: `
<p>Откуда в валютном рынке такие огромные обороты и почему изменения ставки центробанка превращаются не в мгновенный скачок, а в многочасовой процесс торговли? Ответ в том, как позиции и информация передаются между дилерами. Урок опирается на тот же обзор Magyar Nemzeti Bank [31]; все описанные результаты — пересказ работ Lyons, Evans, Marsh–O'Rourke, Carlson–Lo и других через этот обзор.</p>

<h2>Эффект горячей картошки</h2>
<p>Lyons заинтересовался микроструктурой, побывав в дилинговом зале Merrill Lynch: решения дилеров опирались на совсем другой набор информации, чем в макромоделях. Механика такая. Клиент совершает сделку, и у дилера остаётся нежелательная открытая позиция. Если повезёт, придёт клиент с противоположным желанием. Иначе дилер «передаёт посылку» другому дилеру. Тот в свою очередь оказывается с позицией и передаёт её дальше. Цепочка межбанковских сделок продолжается, пока кто-то не найдёт клиента. Это <b>эффект горячей картошки</b> (hot potato): риск перебрасывается между дилерами, и в итоге оседает у клиентов.</p>

<h3>Пример из обзора (Marsh и O'Rourke, 2005)</h3>
<p>Клиент 1 продаёт 5 млн евро дилеру A. Дальше цепочка из семи дилеров, четыре клиента. Ниже — пересчёт таблицы обзора (знак: плюс — инициатор покупает евро, минус — продаёт).</p>
<table>
<tr><th>№</th><th>Инициатор → пассивная сторона</th><th>Поток, млн</th><th>Накопл. поток</th><th>Накопл. оборот</th></tr>
<tr><td>1</td><td>клиент 1 → A (продаёт)</td><td>−5</td><td>−5</td><td>5</td></tr>
<tr><td>2</td><td>клиент 2 ← A (покупает)</td><td>+1</td><td>−4</td><td>6</td></tr>
<tr><td>3</td><td>A → B</td><td>−4</td><td>−8</td><td>10</td></tr>
<tr><td>4</td><td>B → C</td><td>−4</td><td>−12</td><td>14</td></tr>
<tr><td>5</td><td>C → D</td><td>−4</td><td>−16</td><td>18</td></tr>
<tr><td>6</td><td>клиент 3 ← D (покупает)</td><td>+2</td><td>−14</td><td>20</td></tr>
<tr><td>7</td><td>D → E</td><td>−2</td><td>−16</td><td>22</td></tr>
<tr><td>8</td><td>E → F</td><td>−2</td><td>−18</td><td>24</td></tr>
<tr><td>9</td><td>F → G</td><td>−2</td><td>−20</td><td>26</td></tr>
<tr><td>10</td><td>клиент 4 ← G (покупает)</td><td>+2</td><td>−18</td><td>28</td></tr>
</table>
<p>Итог: исходная сделка 5 млн породила оборот 28 млн (множитель 5,6), а знаковый поток накопился до −18 млн. Это один из лучших примеров того, что «объём» и «давление на цену» — разные вещи. Наблюдение в наших терминах: клиентские покупки (1+2+2=5) компенсируют продажу клиента 1, то есть клиенты в нетто нулевые, а межбанковский поток −18 заметен всем, кто его видит. Это арифметика таблицы, а не заключение обзора.</p>
<p>Обзор связывает с горячей картошкой большой оборот FX («excess turnover») и распространение информации: когда дилеры видят поток друг друга (в модели Evans–Lyons второй раунд), клиентский порыв превращается в общедоступный сигнал.</p>

<div data-widget="potato" data-title="Цепочка «горячей картошки»: оборот против клиентской сделки"></div>

<p>В виджете оборот считается как $2Q+\\sum_{i\\ge2} r_i$ (в сумму входят передачи между дилерами), где $r_i$ — позиция, дошедшая до дилера $i$ (суммирование по $i\\ge2$, то есть по межбанковским передачам). Для примера статьи: $2\\cdot5+18=28$. Чем меньше доля, гасимая клиентами на каждом шаге, и чем длиннее цепочка, тем выше множитель оборота.</p>

<h2>Информация: общая и необщая</h2>
<p>Обзор подчёркивает различие <b>общедоступного знания</b> (common knowledge: все знают, что все знают) и <b>необщего</b> (non-common knowledge). Публичная новость — не всегда общее знание о том, что она значит для курса: участникам нужно угадать, как её интерпретируют другие. Поэтому торговля — это процесс «агрегации» интерпретаций, а курс на макроновость движется через поток, а не мгновенно.</p>
<ul>
<li><b>Carlson–Lo:</b> повышение ставки Бундесбанка 9 октября 1997 — не мгновенный скачок, а двухчасовой процесс торговли.</li>
<li><b>Разложение для DM/USD</b> (по обзору): прямой эффект новостей около 10% вариации курса, эффект через поток около 20%, поток, не связанный с новостями, около 40%; всего порядка 70%. Отдельно: новости вместе (прямой плюс через поток) объясняют около 30%, тогда как традиционные модели с одним прямым каналом — лишь 1–5%. Примерно две трети влияния новостей проходит через поток, одна треть — напрямую. Love и Payne подтверждают порядок величины для пар с евро и фунтом (от половины до двух третей).</li>
<li><b>Bjønnes–Rime–Solheim</b> (10 лет дневных данных шведской банковской системы): поток финансовых клиентов двигает курс, поток нефинансовых корпораций в основном обеспечивает ликвидность. <b>Fan–Lyons</b> (по тому же обзору): во время кризиса LTCM хедж-фонды давали ликвидность, а уход капитала «традиционных» институциональных инвесторов ослаблял иену к доллару.</li>
<li><b>Easley–O'Hara</b> (сноска обзора): при активной торговле сделки информативнее. Другая сноска: по данным Mende–Menkhoff–Osler дилеры котируют финансовым клиентам <i>более узкие</i> спреды, чем нефинансовым, что обзор трактует как плату за получаемую информацию; логика Kyle, напротив, оправдывала бы более широкие спреды для вероятно информированных клиентов.</li>
</ul>

<h2>Центробанк как трейдер</h2>
<p>Для центробанка интервенция — это <b>поток ордеров от особого участника</b>. Классические работы выделяли два канала (для стерилизованных интервенций): <b>канал ожиданий</b> (signalling: интервенция сообщает о будущих ставках или инфляции и снижает информационную асимметрию) и <b>портфельный баланс</b> (активы в разных валютах — несовершенные заменители). Консенсус, по обзору Kiss M. (2005): преобладает канал ожиданий, портфельный — второстепенный.</p>
<p>Микроструктура добавляет <b>третий канал</b>: информационная асимметрия между участниками рынка. Если интервенция секретная, дилеры не отличают её поток от прочего потока — и он двигает курс как любой другой (область B на схеме обзора), плюс портфельный сдвиг (область A). Это помогает объяснить противоречие: классическая теория считала секретные интервенции бессмысленными (канала сигнала нет), а практики говорят, что они работают.</p>
<p>Выводы микроструктурных исследований (по обзору): интервенции в большинстве работ эффективны в краткосрочной перспективе при грамотном проведении; из всех клиентов именно поток центробанка сильнее всего влияет на курс (Rime, Carpenter–Wang, Bjønnes–Rime–Solheim). Эффект сильнее и устойчивее, если интервенция (1) совпадает с выходом макроданных, (2) проходит в часы активной торговли, (3) координируется с другим центробанком, (4) усиливает текущий тренд. Открытые интервенции дают больший эффект, но повышают риск неудачи и потери репутации; неопределённость на рынке сначала растёт, затем, при информативных и достоверных интервенциях, волатильность обычно снижается.</p>

<div class="example"><b>Учебный пример (числа условные).</b> Центробанк продаёт валюту на 100 млн в течение часа в спокойный период, и другие участники не знают, что это он. Дилеры видят чистый отрицательный поток и меняют котировки на величину, соответствующую $\\lambda\\cdot x$ — так же, как для любого другого продавца, а не как для «сигнала». Если бы интервенция была открытой, к этому добавилась бы реакция на информацию о намерениях центробанка.</div>

<div class="callout key"><span class="t">Главное</span><ul>
<li>Горячая картошка: клиентская сделка 5 млн породила оборот 28 млн; оборот сильно превышает клиентский спрос, а знаковый поток информативнее.</li>
<li>Новости влияют на курс в основном через торговлю: для DM/USD около двух третей эффекта новостей идёт через поток.</li>
<li>Интервенция центробанка — особый вид order flow; секретная интервенция работает через микроструктурный канал.</li>
</ul></div>

<div class="callout warn"><span class="t">Осторожно</span>Всё это — обзор эмпирики до 2005 года по ограниченному набору пар и периодов. Эффекты интервенций кратковременны и зависят от обстоятельств (см. условия выше); обзор не доказывает, что интервенции работают всегда. Источник не содержит данных по российскому рублю и интервенциям Банка России, поэтому мы их не обсуждаем.</div>
`,
        widgets: { potato: wPotato },
        quiz: [
          { q: 'В примере Marsh–O\'Rourke клиентская продажа 5 млн евро порождает оборот 28 млн. Главная причина?', options: ['Дилеры ошибались при котировании', 'Цепочка межбанковских передач позиции («горячая картошка»)', 'Клиенты 2–4 торговали больше первого клиента'], answer: 1, explain: 'Каждый дилер, не найдя клиента, передаёт позицию дальше; каждая передача — новая сделка и прибавка к обороту.' },
          { q: 'Какое утверждение верно про секретные интервенции с точки зрения микроструктуры?', options: ['Они не могут влиять на курс, т.к. нет сигнала', 'Они двигают курс как обычный поток ордеров и через портфельный сдвиг, и это объясняет их эффективность', 'Они всегда сильнее открытых'], answer: 1, explain: 'Дилеры не отличают такой поток от остального, но он всё равно входит в order flow. Открытые интервенции дают больший эффект, но рискованнее.' },
          { q: 'Что показало разложение влияния новостей на DM/USD (по обзору)?', options: ['Прямой эффект преобладает над эффектом через поток', 'Примерно две трети влияния новостей идёт через поток ордеров', 'Новости не влияют на курс'], answer: 1, explain: 'Прямой эффект около одной трети, косвенный через поток около двух третей; гипотеза о преобладании прямого эффекта отвергнута.' },
          { q: 'В какой из ситуаций интервенция, по обзору, имеет больший шанс сработать?', options: ['В тихие часы, чтобы не привлекать внимания', 'Против текущего тренда, в одиночку', 'При выходе макроданных, в часы активной торговли, в координации с другим ЦБ'], answer: 2, explain: 'Так перечислены условия усиленного и более устойчивого эффекта: макроновости, высокая активность, координация, совпадение с трендом.' }
        ],
        sources: [
          { title: '[31] Gereben, Gyomai, Kiss M. — The microstructure approach to exchange rates (MNB OP 42, 2005)', where: 'разд. 2.3 (hot potato, Chart 1, Table 1), 5.1 (новости), 5.2 (клиенты), 5.3 (интервенции, Chart 5)', note: 'Цифры 28 млн и разложение 10/20/40% приведены по обзору; оригиналы — Marsh–O\'Rourke (2005), Evans–Lyons.' }
        ]
      },

      /* ===================== УРОК 3 ===================== */
      {
        id: 'm09-l3',
        title: 'Крипторынок: фрагментация, cross-impact и комиссии',
        minutes: 35,
        html: `
<p>Акции торгуются в основном на одной основной бирже с единым клирингом. Биткоин торгуется на десятках бирж одновременно, и инструменты там разные. Где рождается цена, как информация перетекает между площадками и можно ли на этом зарабатывать — на эти вопросы отвечает работа Albers, Cucuringu, Howison, Shestopaloff «Fragmentation, Price Formation, and Cross-Impact in Bitcoin Markets» (arXiv 2108.09750, 2021, источник [20]).</p>

<h2>Что изучали</h2>
<p><b>Фрагментация</b> (fragmentation) — ликвидность разбросана по нескольким площадкам и инструментам, общего клиринга нет. Авторы записали по websocket API 14 ликвидных рынков (11 бессрочных контрактов, 2 квартальных фьючерса и один спот) в феврале 2021 года: 22–27 февраля — обучение, 28 февраля – 1 марта — тест. Снимки стакана приходят раз в 5–200 мс (это не Level 3, полного потока заявок нет), всё приведено к сетке 50 мс, объёмы в USD.</p>
<p>Важные особенности инструментов: <b>бессрочный своп</b> (perpetual swap) не имеет экспирации, а цену привязывает к споту платёж <b>funding rate</b> между лонгами и шортами. На деривативах объём в разы больше, чем на споте (по статье — более чем в пять раз, perpetual более 50 млрд USD в день); плечо доходит до 100–125×, отсюда <b>каскады ликвидаций</b> (leverage cascade). Статья также приводит оценку, что значительная часть заявленного объёма «фейковая» (95% по Bitwise 2019) — это стоит помнить при любом анализе «объёма».</p>

<h2>Признаки: что предсказывает ход цены</h2>
<p>Для каждого рынка строят короткие признаки (в базисных пунктах, б.п.; 1 б.п. = 0,01%):</p>
<ul>
<li><b>Дисбаланс стакана.</b> Новое определение: $IMB^a=\\left(\\dfrac{p^a(N)}{p^a(1)}-1\\right)\\cdot10^4$ — на сколько б.п. средняя цена рыночного ордера размера $N$ хуже лучшей цены (аналог для bid). Устойчивее классического $\\dfrac{b-a}{b+a}$, который шумит из-за малых объёмов на вершине.</li>
<li><b>Дисбаланс потока сделок</b> (trade flow imbalance, TFI): $TFI^{\\Delta}_t=B_{[t-\\Delta,t]}-S_{[t-\\Delta,t]}$, объём покупок минус объём продаж агрессоров за окно (100 мс – 2 с).</li>
<li><b>Прошлая доходность</b>: $PRET^\\Delta=\\left(\\dfrac{p_t}{p_{t-\\Delta}}-1\\right)\\cdot10^4$.</li>
<li><b>Расхождение со средним</b> $DIV_{i,j}$: отклонение разности цен двух рынков от её скользящего среднего. Это очищает постоянные премии (фьючерсная, USD против USDT и т.п.).</li>
</ul>
<p>Связь потока с будущей доходностью нелинейна (похожа на сигмоиду: экстремальные потоки — часто «неаккуратные» или вынужденные). Нелинейная трансформация признаков в среднем увеличивает $R^2$ в 2,5 раза. Новый дисбаланс стакана лучше классического: классический даёт примерно 58% выигрыша нового. Расхождение со средним даёт в среднем $R^2$ примерно в 15 раз выше, чем простая разность цен без вычитания скользящего среднего.</p>

<h2>Cross-impact и сеть «лидер — ведомый»</h2>
<p><b>Cross-impact</b> — влияние потока на одной площадке на цену другой. Рынок $i$ «отстаёт» от рынка $j$, если будущие доходности $i$ хорошо объясняются признаками $j$:</p>
$$fret_{t,i}=\\mu+\\beta_1 IMB^a_j+\\beta_2 IMB^b_j+\\beta_3 TFI_j+\\beta_4 PRET_j+\\beta_5 DIV_{ij}+\\varepsilon.$$
<p>Результаты: лидеры — Binance (perpetual) и Huobi (perpetual и квартальный фьючерс); ведомые — Bybit, FTX, Bitmex. Максимальный парный $R^2$ — 25,9% (FTX предсказывается по Binance USDT perpetual), средний 9,6%. Объединённая модель из 70 признаков на горизонте 500 мс объясняет $R^2$ от 0,106 до 0,364 в выборке; вне выборки до 0,289, примерно 91% от внутривыборочного. LASSO оставляет около 30 признаков из 70, теряя лишь около 6% $R^2$.</p>

<div data-widget="crypto" data-title="Две площадки: лидер, ведомый и комиссии"></div>

<h2>Комиссии против спреда</h2>
<p><b>Taker fee</b> платит агрессор, <b>maker rebate</b> получает пассивный участник. Статья пишет: издержки исполнения $=$ taker fee $+$ спред (ур. 1); минимальная taker fee от 1,5 б.п. (FTX) до 7,5, обычно 4–7,5; лучшие тарифы требуют оборота порядка 500 млн – 1 млрд USD в месяц. Результат: простая taker-стратегия по сигналу дисбаланса без комиссий давала около 11 000 б.п. за два дня (≈ удвоение капитала, но нереалистично из-за малого объёма на вершине), а <b>при стандартных комиссиях все варианты PnL отрицательны</b> (в среднем −18 899 б.п.; при VIP-тарифах в среднем −9 621 б.п.). Вывод авторов: роли лидера и ведомого во многом определяются схемой комиссий, а «альфа» возникает лишь сверх этой естественной предрасположенности.</p>
<div class="example"><b>Учебный пример (числа условные).</b> Сигнал предсказывает ход ведомого на +3 б.п. Спред 1 б.п., taker fee 5 б.п. за сторону. Круг «купил — продал» стоит $2\\cdot5+1=11$ б.п. (две комиссии и один полный спред) против 3 б.п. ожидаемого. Чтобы сделка окупалась, ожидаемый ход должен превышать $2\\cdot fee+спред$. Без комиссий: $3-1=2$ б.п. в плюс — тот же сигнал перестаёт быть убыточным. Виджет выше показывает именно эту арифметику на синтетических данных.</div>

<h2>Живой эксперимент маркет-мейкинга</h2>
<p>Авторы выставили заявки на Bybit с оборотом 1,537 млн USD (8–13 июля 2021). Потеря круга составила −4,4749 б.п., ребейт 5 б.п. дал итог +0,5251 б.п. на круг; бенчмарк без отмен (без использования сигнала) терял −6,8184 б.п. на круг. Adverse selection у бенчмарка примерно на 1 б.п. хуже. Бэктест маркет-мейкинга без данных Level 3 практически невозможен: неизвестна позиция в очереди.</p>

<div class="callout key"><span class="t">Главное</span><ul>
<li>На фрагментированном рынке информация возникает на одних площадках (Binance, Huobi) и с задержкой доходит до других; это измеряется признаками стакана и потока и сетью «лидер — ведомый».</li>
<li>Предсказуемость есть (десятки процентов $R^2$ на 500 мс), но решающий фактор для прибыли — комиссии: при стандартных тарифах taker-стратегия убыточна, а выигрывают тарифы и ребейты.</li>
<li>Нелинейность и очистка от постоянных премий (DIV) важнее выбора модели: линейные модели с хорошими признаками достаточно сильны.</li>
</ul></div>

<div class="callout warn"><span class="t">Ограничения</span><ul>
<li>Данные — недели февраля 2021 года (обучение 6 дней, тест 2 дня); результаты вряд ли можно переносить на другие периоды и конструкции комиссий.</li>
<li>Снимки стакана, а не полный поток заявок; бэктест без позиции в очереди ненадёжен для пассивных стратегий.</li>
<li>Живой эксперимент — это 1,5 млн USD оборота за несколько дней; статистическая значимость по таким данным ограничена.</li>
<li>Наша виджет-симуляция устроена проще реальных данных: нормальный шум, одинаковый лаг, нет влияния самих сделок на цену.</li>
</ul></div>
`,
        widgets: { crypto: wCrypto },
        quiz: [
          { q: 'Что показывает признак DIV (расхождение со средним) и зачем он нужен?', options: ['Разницу объёмов между биржами', 'Отклонение разности цен двух рынков от скользящего среднего, чтобы убрать постоянные премии', 'Расхождение спреда с комиссией'], answer: 1, explain: 'Между площадками могут быть устойчивые премии (фьючерсная, USD против USDT и др.). DIV вычитает их, оставляя временное расхождение, по которому и видно, кто отстаёт.' },
          { q: 'Модель предсказывает ход ведомого на +3 б.п., спред 1 б.п., taker fee 4 б.п. за сторону. Что с круговой сделкой (по нашему учебному расчёту)?', options: ['Прибыль 2 б.п.', 'Убыток 6 б.п.: издержки круга $2\\cdot4+1=9$ при ожидаемых 3', 'Ровно ноль'], answer: 1, explain: 'Круг стоит две комиссии и один спред: $2\\cdot4+1=9$ б.п. Ожидаемые 3 б.п. покрывают лишь треть. Поэтому в статье при стандартных комиссиях все PnL отрицательны.' },
          { q: 'Как авторы объясняют, кто становится лидером?', options: ['Лидером всегда становится самая большая биржа по спот-объёму', 'Роль во многом определяется схемой комиссий, а предсказательная «альфа» возникает сверх неё', 'Лидер — тот, у кого меньше плечо'], answer: 1, explain: 'Статья связывает лидерство и запаздывание с комиссионным режимом; кроме того, лидерами оказались деривативы Binance и Huobi, а не спот.' },
          { q: 'Почему бэктест стратегии маркет-мейкинга на таких данных ненадёжен?', options: ['Нет данных по комиссиям', 'Нет Level 3: неизвестна позиция заявки в очереди, а значит неизвестно, исполнилась ли бы она', 'Слишком много данных'], answer: 1, explain: 'Пассивная заявка исполняется в порядке очереди. Из снимков стакана этого не видно, поэтому авторы проверяли идею в живом эксперименте.' }
        ],
        sources: [
          { title: '[20] Albers, Cucuringu, Howison, Shestopaloff — Fragmentation, Price Formation, and Cross-Impact in Bitcoin Markets (arXiv 2108.09750, 2021)', where: 'данные и сетка 50 мс; признаки (ур. 3–12); сеть лидер–ведомый (ур. 22); PnL и комиссии; живой эксперимент на Bybit', note: 'Данные февраля 2021 г., эксперимент июль 2021. Числа PnL — в б.п.' }
        ]
      },

      /* ===================== УРОК 4 ===================== */
      {
        id: 'm09-l4',
        title: 'Законы масштабирования на данных Мосбиржи',
        minutes: 30,
        html: `
<p>Теория инвариантности микроструктуры (Kyle и Obizhaeva) утверждает, что у всех активов и рынков торговля устроена «одинаково», если измерять её в правильных единицах. Можно ли проверить это на реальных данных, и что именно проверка доказывает? Для российского рынка такой анализ сделан в магистерской работе Zhiltsova «Microstructure Invariance in the Russian Financial Data» (НИУ ВШЭ, 2020, источник [26]); теоретическая основа — Kyle и Obizhaeva, «The Market Impact Puzzle» ([06]).</p>

<h2>Идея инвариантности</h2>
<p><b>Ставка</b> (bet) — намерение инвестора войти в позицию; одна ставка исполняется множеством сделок (order shredding, «дробление»). <b>Торговая активность</b> (trading activity):</p>
$$W=\\sigma\\cdot P\\cdot V,$$
<p>где $\\sigma$ — дневная волатильность, $P$ — цена, $V$ — дневной объём в акциях; $W$ — рублёвый (долларовый) риск, переносимый за день. Гипотеза инвариантности ставок: риск, переносимый одной ставкой за единицу «бизнес-времени», одинаково распределён у всех активов. Следствия: число ставок в день растёт как $W^{2/3}$, а размер ставки в долях от объёма убывает как $W^{-2/3}$. В теоретической работе [06] отсюда же: средний долларовый размер ставки пропорционален $(PV)^{1/3}$, а число ставок $(PV)^{2/3}$ (при фиксированных цене и волатильности): объём в 8 раз больше — ставка в 2 раза крупнее, а число ставок в 4 раза больше.</p>
<p>Но число ставок не наблюдается, видны только <b>сделки</b> (prints). Поэтому работа проверяет аналоги: число сделок в день $N$ и средний размер сделки $\\bar X$. Три конкурирующих гипотезы: инвариантность ставок (показатели $\\pm2/3$), инвариантность размера сделки ($\\pm1$) и инвариантность частоты сделок (0).</p>

<h2>Тесты</h2>
$$\\ln N_i=\\alpha+\\beta\\ln W_i+\\varepsilon_i,\\quad H_0:\\ \\beta=\\tfrac23;\\qquad \\ln(\\bar X_i/V_i)=\\alpha+\\beta\\ln W_i+\\varepsilon_i,\\quad H_0:\\ \\beta=-\\tfrac23.$$
<p>Читайте это так: если $W$ вырос на 1% (логарифмы!), то число сделок выросло примерно на $\\beta$%. Для $\\beta=2/3$ рост $W$ в 8 раз увеличивает число сделок в $8^{2/3}=4$ раза (учебный пример). При $\\beta=0{,}70$ получилось бы $8^{0,70}\\approx4{,}29$, при $0{,}65$ — около 3,86. Чувствительность оценки к $\\beta$ небольшая, поэтому нужен точный интервал.</p>

<h2>Данные и результаты</h2>
<p>Лог сделок Московской биржи, май 2015 – февраль 2016 (после перехода на новую торговую платформу 1 июня 2015, с изменениями тика 3 августа и 28 октября 2015). Только сделки, без заявок и отмен. Данные агрегированы до «акция × месяц»: 2 578 наблюдений, 10 групп по рублёвому объёму. Использованы помесячные регрессии и метод Fama–MacBeth (регрессии по срезам и усреднение коэффициентов).</p>
<table>
<tr><th>Что проверяли</th><th>Прогноз теории</th><th>Оценка в работе</th><th>$R^2$</th></tr>
<tr><td>Число сделок, $\\beta$ (Fama–MacBeth)</td><td>0,667 (2/3)</td><td>0,697 (SE 0,008); диапазон по месяцам 0,65–0,73</td><td>0,687 (помесячно ≈0,68)</td></tr>
<tr><td>Размер сделки, трейд-взвешенный</td><td>−0,667</td><td>−0,68…−0,70</td><td>0,61–0,69</td></tr>
<tr><td>Размер сделки, объём-взвешенный</td><td>−0,667</td><td>−0,675…−0,703</td><td>0,61–0,69</td></tr>
<tr><td>С волатильностью в бизнес-времени EPV (фикс. коэффициент)</td><td>—</td><td>R² растёт с 0,50 до 0,60</td><td>0,60</td></tr>
<tr><td>С EPV (свободный коэффициент)</td><td>—</td><td>0,72; R² с 0,69 до 0,82</td><td>0,82</td></tr>
</table>
<p>Робастность: GARCH(5,1) не меняет результат, фиксированные эффекты акций значимы. Особенность России: средний размер сделки <i>не растёт</i> с рублёвым объёмом (в отличие от США по Kyle и др., 2019), число сделок растёт. Число сделок в день по группам — от порядка 12 до 14 081 (таблица в извлечённом тексте шумная, цифры ориентировочные). Работа отмечает разную реакцию ликвидных и неликвидных акций на смену тика: предположительно, меняется дробление ставок и/или посредничество. Графики из текстовой выгрузки недоступны, поэтому мы опираемся на тексты и таблицы.</p>

<div data-widget="scaling" data-title="Проверка степенной зависимости на синтетических данных"></div>

<h2>Какие выводы допустимы</h2>
<ul>
<li><b>Допустимо:</b> зависимость числа сделок от активности в логарифмах близка к степени 2/3 (оценки 0,65–0,73, $R^2\\approx0{,}69$); инвариантность выполняется <i>грубо</i>, слабее и менее однородно между группами, чем в оригинале Kyle–Obizhaeva; ближе всего к теории — ликвидные акции.</li>
<li><b>Недопустимо:</b> «закон точный». Оценка 0,697 при SE 0,008 отличается от 0,667 на несколько стандартных ошибок (наш расчёт по точным значениям из таблицы, 0,6968 и SE 0,0085: $(0{,}6968-0{,}6667)/0{,}0085\\approx3{,}5$); SE же зависит от схемы усреднения, и автор говорит о приблизительном выполнении.</li>
<li><b>Недопустимо:</b> считать, что подтверждена именно гипотеза инвариантности <i>ставок</i>: число сделок — не число ставок. Статья неявно опирается на предположение о дроблении, а сделки одновременно зависят от тика и от HFT/маркет-мейкеров.</li>
<li><b>Недопустимо:</b> переносить результат на другие периоды: наблюдался один год с двумя сменами тика; единицы наблюдения — агрегаты «акция×месяц» (большая часть изменчивости усреднена).</li>
</ul>

<div class="callout key"><span class="t">Главное</span><ul>
<li>$N\\propto W^{2/3}$, где $W=\\sigma PV$; на Мосбирже по данным 2015–2016 гг. оценки показателя 0,65–0,73, $R^2\\approx0{,}69$.</li>
<li>Добавление волатильности в бизнес-времени (EPV) заметно повышает $R^2$ (до 0,82 при свободном коэффициенте), т.е. трения (тик) важны.</li>
<li>Результат — «грубое подтверждение», а не точный закон. Размер сделки не растёт с оборотом так, как в США.</li>
</ul></div>

<div class="callout warn"><span class="t">Типичные ошибки</span><ul>
<li>Принимать наклон лог-лог регрессии за «причинный» закон: ошибка измерения $W$ занижает наклон (проверьте в виджете), узкий диапазон $W$ даёт широкий интервал.</li>
<li>Путать «не отвергнуто» и «доказано»: при $R^2=0{,}69$ почти треть вариации числа сделок не объяснена.</li>
<li>Забывать, что работа — магистерская диссертация (с рецензией А. Обижаевой) на одном периоде, и цифры 2015–2016 гг. устарели.</li>
</ul></div>
`,
        widgets: { scaling: wScaling },
        quiz: [
          { q: 'Что означает $\\beta\\approx0{,}70$ в регрессии $\\ln N=\\alpha+\\beta\\ln W$?', options: ['При росте W на 1% число сделок растёт примерно на 0,7%', 'При росте W на 1% число сделок растёт на 70%', 'Число сделок не зависит от W'], answer: 0, explain: 'В лог-лог регрессии коэффициент — эластичность: процентное изменение N на 1% изменения W.' },
          { q: 'Почему результат 0,65–0,73 при теоретических 0,667 нельзя называть «точным подтверждением закона»?', options: ['Потому что оценка с SE 0,008 отличается от 0,667 на несколько ошибок, R² равен 0,69, а N — число сделок, а не ставок', 'Потому что данные получены не с Мосбиржи', 'Потому что теория предсказывает показатель 1'], answer: 0, explain: 'Инвариантность выполняется грубо; кроме того, наблюдается число сделок (с эффектами дробления и тика), а не число ставок.' },
          { q: 'В синтетическом виджете истинная $\\beta=0{,}67$, но вы добавили большую ошибку измерения ln W. Что случится с оценкой?', options: ['Станет ближе к 1', 'Окажется заниженной (затухание)', 'Не изменится, изменится только R²'], answer: 1, explain: 'Ошибка в регрессоре занижает наклон: классическая «атенюация». Поэтому результаты на реальных данных нужно сопровождать проверкой качества измерения.' },
          { q: 'Что показало добавление EPV (волатильности в бизнес-времени)?', options: ['R² почти не изменился', 'R² вырос (до 0,82 со свободным коэффициентом, до 0,60 с фиксированным) — трения, например тик, существенны', 'EPV опровергла гипотезу инвариантности'], answer: 1, explain: 'Рост R² указывает, что рыночные трения (смена тика и т.п.) объясняют отклонения от «чистой» инвариантности.' }
        ],
        sources: [
          { title: '[26] Zhiltsova — Microstructure Invariance in the Russian Financial Data (магистерская работа, НИУ ВШЭ, 2020)', where: 'аннотация; ур. 10–19 (формализация); результаты (стр. 601–657 txt), EPV (742–753), выводы (790–826)', note: 'Графики в текстовой выгрузке недоступны; таблицу числа сделок читать с осторожностью.' },
          { title: '[06] Kyle, Obizhaeva — The Market Impact Puzzle (SSRN 3124502, 2018)', where: 'мета-модель, ур. 19–20: размер ставки $(PV)^{1/3}$, число ставок $(PV)^{2/3}$', note: 'Теория, без новых данных; читать выборочно (размерный анализ тяжёл).' }
        ]
      },

      /* ===================== УРОК 5 ===================== */
      {
        id: 'm09-l5',
        title: 'Маркет-мейкинг в российской практике',
        minutes: 30,
        html: `
<p>Маркет-мейкер должен котировать постоянно и быстро. Какая скорость пересчёта котировок нужна и почему в российской практике так много внимания уделяют лимитам позиции? Урок опирается на две русскоязычные публикации: Д. Серебренников, «Стратегии маркет-мейкинга» (F&O, №5, 2011; рынок FORTS, источник [35]) и А.В. Торопов, «Стратегия маркет-мейкинга в системе высокочастотной алгоритмической торговли» (Научно-технический вестник ИТМО, 2014; источник [36]).</p>

<div class="callout warn"><span class="t">Что именно в источниках</span><ul>
<li>[35] — популярная статья практика (брокер Rossmix Securities) о срочном рынке FORTS; расчёты на реальных фьючерсах на данных 2010–2011 гг., строгой модели нет.</li>
<li>[36] — инженерная статья компании Tbricks AB об автоматическом котировании <b>опционов</b>; замеры сделаны на Eurex (опционы), цены базового актива — акции Volvo AB. Автор русский, но данные <i>не</i> с Московской биржи.</li>
<li>В обоих источниках нет требований регулятора или Московской биржи к спредам и скорости, поэтому конкретных нормативов мы не приводим.</li>
</ul></div>

<h2>Кто такой маркет-мейкер</h2>
<p><b>Официальный маркет-мейкер</b> (official market maker) — профессиональный участник, обеспечивающий мгновенную ликвидность в закреплённых за ним активах: он одновременно держит заявки на покупку и продажу некоторого объёма на определённом удалении друг от друга. Его договор с биржей или эмитентом задаёт спред, объём и период обязательств; обязательства выполняются независимо от рыночной ситуации и текущей позиции, что может привести к убыткам, а вознаграждение от биржи или эмитента зачастую главный источник дохода. <b>Неофициальный маркет-мейкер</b> действует по тем же принципам, но без обязательств: свободен в выборе спреда и объёма и может уйти с рынка при неблагоприятном движении.</p>
<p>В идеальных условиях доход с цикла «купил — продал» равен спреду (в примере статьи: покупка по 990, продажа по 1010 — +20). На деле доход зависит от интенсивности изменений спроса и предложения и от ликвидности: чем спокойнее рынок и больше разнонаправленных сделок, тем выше доходность; выраженный тренд и малое число сделок её убивают.</p>

<h2>Потенциал доходности (ПД)</h2>
<p>Серебренников предлагает показатель <b>потенциал доходности</b>: сколько заработал бы идеальный маркет-мейкер на периоде, покупая 1 лот при каждом снижении цены на один шаг $R$ и продавая при каждом росте на шаг, с закрытием остатка $(P_N-P_0)/R$ по цене последней сделки. Допущения: нулевые задержки, нет лимитов на число заявок, исполнение гарантировано при достижении ценой уровня, капитал не ограничен, комиссий нет. В извлечённом тексте формула разобрана частично, поэтому мы опираемся на словесное определение. Если ПД < 0, любая стратегия маркет-мейкинга на периоде убыточна. <b>Относительный ПД</b> = ПД / стоимость лота.</p>
<p>Пример таблицы статьи (22.04.2011): RTS-6.11 — относительный ПД 131,9% (148 391 руб.); GAZR — 19,05%; SBRF — 14,87%; Si — −0,65%. Эти данные — иллюстрации 2011 года, не современная оценка рынка.</p>

<h2>Три практических ограничения</h2>
<h3>1. Скорость</h3>
<p>Задержки в получении данных и выставлении заявок означают, что робот физически не успевает отыгрывать каждое движение; чем они меньше, тем больше сделок и выше доходность. Лучшее решение — размещение робота в дата-центре биржи; но у биржи есть своя периодичность распространения данных, поэтому фиксированная задержка есть всегда. Задержка при выставлении заявок зависит от производительности торговой системы биржи и от системы риск-менеджмента брокера; вторую часть можно снять получением <b>спонсируемого доступа</b> (sponsored access) или <b>ULLDMA</b> (прямой доступ с лёгким претрейд-контролем).</p>
<p>Торопов решает задачу для опционов: котировки строятся от <b>теоретической стоимости</b> (fair value), а её расчёт дорог по времени. Идея: теоретическая цена $V_b(S_b)$ и $V_a(S_a)$ раздвигается до $M_b<V_b$ и $M_a>V_a$, так что разница покрывает риск, ожидаемый доход и волатильность. Задержка расчёта означает квотирование по устаревшим ценам. Два приёма: <b>кэширование</b> — заранее считаются котировки для $2k$ цен базового актива вокруг текущей с шагом минимального шага цены (размер кэша $N=2k$); при сдвиге диапазон сдвигается, лишняя точка стирается, новая считается в фоне, при выходе за диапазон — полный пересчёт; и <b>сглаживание</b>: диапазон сдвигается, лишь когда $|H_m|=\\left|\\sum_{i=1}^{m-1}(S_{i+1}-S_i)\\right|$ превысит порог $M$.</p>
<table>
<tr><th>Размер кэша $N$</th><th>Среднее время, мкс</th><th>Попадание в кэш</th><th>Выбросы</th></tr>
<tr><td>0</td><td>1001</td><td>0%</td><td>5,83%</td></tr>
<tr><td>10</td><td>524</td><td>1,54%</td><td>0,44%</td></tr>
<tr><td>20</td><td>308</td><td>77,6%</td><td>0,41%</td></tr>
<tr><td>40</td><td>276</td><td>94,07%</td><td>0,14%</td></tr>
<tr><td>45</td><td>277</td><td>94,43%</td><td>0,15%</td></tr>
</table>
<p>Замеры на 36 американских опционах Eurex (ETI 2.0) в день 6.08.2012, сервер Sun X4170 M3, инструмент DTrace; выбросы (≥1,5–2 мс) исключены из среднего. Автор рекомендует $N=40$: выше средняя задержка практически не снижается. Ускорение — до 4 раз (1001 → 276–277 мкс).</p>

<div data-widget="latency" data-title="Бюджет задержки котировки по конвейеру"></div>

<h3>2. Капитал и лимит позиции</h3>
<p>Не менее острая проблема — ограниченность капитала под инструмент. В примере статьи по фьючерсу на индекс РТС чистая позиция на конец периода составила 82 контракта, внутри дня достигала 199, а максимум по дневным сессиям за предыдущие 12 месяцев — 2124 контракта. Заранее объём позиции неизвестен, а обеспечение нужно под максимальную абсолютную величину. Два пути: оптимизация фондирования (заёмные средства и плечо у брокера за вознаграждение) и оптимизация алгоритма. Один из способов — увеличить <b>шаг котирования</b>: при увеличении шага в $m$ раз максимальная позиция уменьшается примерно в $m$ раз, но сокращается число сделок. По расчёту статьи (РТС, сессия 22.04.2011), только 24% абсолютных разностей между последовательными разворотными ценами были равны минимальному шагу, поэтому шаг можно увеличить минимум вдвое.</p>

<div data-widget="step" data-title="Шаг котирования, макс. позиция и тренд"></div>

<h3>3. Параметры риска в стратегии</h3>
<p>Стратегия из [36] имеет более 70 параметров: спред, минимальный и максимальный объём котировок, максимальная позиция, лимит числа сделок за интервал и др. Позицию, накопленную сверх лимита, закрывают частично или полностью; в [35] частичное закрытие имеет смысл, если шаг котирования не меньше двух шагов цены. Расчётный период: короткие периоды лучше не делают — девять часовых периодов дали ПД 95 тыс. против 148 тыс. за день (−35%).</p>

<div class="example"><b>Учебный пример (числа условные, арифметика проверена).</b> Расчёт ведётся от справедливой цены 100,00. Хотим спред 0,10: $M_b=99{,}95$, $M_a=100{,}05$. Базовый актив сдвинулся на один шаг (0,01). Если новые котировки уже в кэше — отправляем за ≈230 мкс; если нет — пересчёт ≈1000 мкс. За 1 мс цена может сдвинуться ещё; противоположная сторона с более быстрыми данными исполнит нашу устаревшую заявку по прежней цене. Это интерпретация (adverse selection), а не утверждение статьи: в [36] прямо сказано лишь, что задержки ведут к котированию по устаревшим ценам.</div>

<div class="callout key"><span class="t">Главное</span><ul>
<li>Официальный маркет-мейкер имеет обязательства по спреду и объёму и получает вознаграждение; неофициальный свободен, но без вознаграждения.</li>
<li>Доход идеального маркет-мейкера — спред на цикле; реально его убивают тренд, малое число сделок, задержки и ограниченный капитал.</li>
<li>Скорость пересчёта: кэш и сглаживание уменьшили среднее время смены котировок с ≈1001 до ≈276 мкс (N = 40, попадание ≈94%); выбросы в мс всё равно нужно контролировать.</li>
<li>Риск-лимиты: максимальная позиция определяет требуемый капитал; шаг котирования и частичная ликвидация — рычаги.</li>
</ul></div>

<div class="callout warn"><span class="t">Ограничения источников</span><ul>
<li>[35] — популярная статья 2011 года, ПД считается при нереалистичных допущениях (верхняя оценка).</li>
<li>[36] — замеры на Eurex на одном дне и конкретной конфигурации сервера; в таблице извлечённого текста значения $N$ слегка смещены относительно строк (сверяйте с оригиналом).</li>
<li>Наши симуляции в виджетах не воспроизводят формулы статей и служат только для интуиции.</li>
</ul></div>
`,
        widgets: { latency: wLatency, step: wStep },
        quiz: [
          { q: 'Чем официальный маркет-мейкер отличается от неофициального?', options: ['У официального нет риска, он зарабатывает всегда', 'У официального есть договорные обязательства по спреду, объёму и времени, и вознаграждение от биржи или эмитента', 'Официальный торгует только фьючерсами'], answer: 1, explain: 'Обязательство котировать независимо от конъюнктуры и позиции — причина, по которой он получает вознаграждение; неофициальный свободен, но и платы не имеет.' },
          { q: 'Почему кэширование котировок ускоряет смену котировок?', options: ['Потому что заранее считает котировки для цен вокруг текущей, и при попадании новой цены в диапазон остаётся лишь отправить их', 'Потому что уменьшает спред', 'Потому что сокращает число параметров стратегии'], answer: 0, explain: 'При $N=40$ попадание ≈94%, а среднее время падает с ≈1001 до ≈276 мкс: дорогой расчёт теоретической цены вынесен в фон.' },
          { q: 'Статья [35]: шаг котирования увеличили в 4 раза. Что произойдёт с максимальной позицией и числом сделок?', options: ['Позиция уменьшится примерно в 4 раза, число сделок тоже сократится', 'Позиция вырастет, число сделок вырастет', 'Позиция не изменится, сделок станет больше'], answer: 0, explain: 'Редкие, но более «длинные» шаги меньше накапливают позицию; цена — сокращение числа сделок и, возможно, дохода.' },
          { q: 'Что нельзя утверждать на основе статьи Торопова?', options: ['Кэш размером 40 снижает среднюю задержку примерно в 3,6 раза в её замерах', 'Московская биржа требует задержки менее 280 мкс', 'Выбросы более 1,5–2 мс исключены из средних'], answer: 1, explain: 'Статья не содержит регуляторных требований Московской биржи; замеры сделаны на Eurex, а 280 мкс — результат конкретной реализации.' }
        ],
        sources: [
          { title: '[35] Д. Серебренников — Стратегии маркет-мейкинга (журнал F&O, №5, 2011)', where: 'принцип и обязательства (txt 5–17), ПД (73–202), задержки и капитал (204–227), шаг котирования (229–325), лимит позиции (326–345)', note: 'Текст в work/text/35_utf8.txt. Формула ПД восстановлена только по словесному описанию.' },
          { title: '[36] А.В. Торопов — Стратегия маркет-мейкинга в системе высокочастотной алгоритмической торговли (НТВ ИТМО, 2014, №1)', where: 'алгоритм выбора котировок (25–45), кэш (56–59), сглаживание (74–79), таблица результатов (110–127)', note: 'Опционы на Eurex; к российской бирже не относится. Текст в work/text/36_utf8.txt.' }
        ]
      }
    ],
    terms: [
      { en: 'order flow', ru: 'поток ордеров', def: 'Знаковый баланс сделок, инициированных покупателями (плюс) и продавцами (минус); в отличие от оборота учитывает направление.' },
      { en: 'turnover', ru: 'оборот (объём)', def: 'Сумма сделок без учёта направления; может многократно превышать клиентский спрос из-за межбанковской торговли.' },
      { en: 'over-the-counter (OTC)', ru: 'внебиржевой рынок', def: 'Рынок без единой биржи и общего стакана: сделки заключаются двусторонне между дилерами и клиентами (так устроен спот FX).' },
      { en: 'hot potato effect', ru: 'эффект горячей картошки', def: 'Цепочка межбанковских сделок, в которой дилеры передают друг другу нежелательную открытую позицию, пока она не осядет у клиентов.' },
      { en: 'direct / indirect market', ru: 'прямой / брокерский рынок', def: 'Прямой: дилеры торгуют двусторонне и непрозрачно. Брокерский: заявки подаются брокеру, торговля order-driven (например, EBS).' },
      { en: 'Kyle lambda', ru: 'лямбда Кайла', def: 'Наклон реакции цены на поток: $p=\\mu+\\lambda\\omega$; в равновесии Kyle $\\lambda=\\sigma_s/(2\\sigma_u)$.' },
      { en: 'information vs inventory models', ru: 'информационные и инвентарные модели', def: 'В первых поток влияет на цену постоянно из-за информации, во вторых — временно, т.к. дилер гасит позицию.' },
      { en: 'Evans–Lyons model', ru: 'модель Эванса–Лайонса', def: 'Трёхраундовая модель дилерского рынка: $\\Delta s=\\beta_1\\Delta(i-i^*)+\\beta_2x$, где $x$ — межбанковский поток.' },
      { en: 'central bank intervention', ru: 'интервенция центробанка', def: 'Торговля валютой центробанком; в микроструктуре — особый поток ордеров, действующий через каналы ожиданий, портфельного баланса и микроструктуры.' },
      { en: 'fragmentation', ru: 'фрагментация', def: 'Разделение ликвидности между несколькими площадками и инструментами без общего клиринга (типично для крипторынка).' },
      { en: 'perpetual swap', ru: 'бессрочный своп', def: 'Деривативный контракт без экспирации, привязанный к споту через платежи funding rate.' },
      { en: 'cross-impact', ru: 'кросс-воздействие', def: 'Влияние потока или дисбаланса на одной площадке на цену на другой.' },
      { en: 'trade flow imbalance (TFI)', ru: 'дисбаланс потока сделок', def: 'Объём агрессивных покупок минус объём агрессивных продаж за окно времени.' },
      { en: 'taker fee / maker rebate', ru: 'комиссия тейкера / ребейт мейкера', def: 'Плата агрессора и скидка (возврат) пассивному участнику; вместе со спредом определяет издержки исполнения.' },
      { en: 'bet (metaorder)', ru: 'ставка (метаордер)', def: 'Намерение войти в позицию, исполняемое множеством сделок; единица в теории инвариантности.' },
      { en: 'trading activity', ru: 'торговая активность', def: '$W=\\sigma P V$: волатильность × цена × объём — риск, переносимый за день; число ставок растёт как $W^{2/3}$.' },
      { en: 'market microstructure invariance', ru: 'инвариантность микроструктуры', def: 'Гипотеза Kyle–Obizhaeva: в «бизнес-времени» перенос риска ставкой одинаков у всех активов; отсюда законы масштабирования с показателем 2/3.' },
      { en: 'official market maker', ru: 'официальный маркет-мейкер', def: 'Участник с договорными обязательствами по спреду, объёму и времени котирования; получает вознаграждение от биржи или эмитента.' },
      { en: 'profit potential (ПД)', ru: 'потенциал доходности', def: 'Верхняя оценка дохода идеального маркет-мейкера, покупающего при снижении и продающего при росте цены на шаг (Серебренников).' },
      { en: 'cache hit', ru: 'попадание в кэш', def: 'Новая цена базового актива оказалась в диапазоне заранее рассчитанных котировок, и пересчёт не нужен.' },
      { en: 'sponsored access / ULLDMA', ru: 'спонсируемый доступ', def: 'Прямой доступ к бирже без претрейд-контроля брокера или с его лёгким модулем; уменьшает задержку выставления заявок.' }
    ]
  });
})();
