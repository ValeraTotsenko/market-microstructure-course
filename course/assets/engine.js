/* Движок симуляторов лаборатории: маркет-мейкинг (модель Avellaneda–Stoikov + новости и информированные
   трейдеры) и оптимальное исполнение (Almgren–Chriss). Чистый JS без DOM: работает и в браузере
   (Course.sim), и в Node (module.exports) — поэтому покрыт автотестами (tests/).
   Единицы — учебные, как в статье [02]: цена 100, σ = 2 за «день» (T = 1), A = 140, k = 1,5. */
(function (root) {
  "use strict";
  const Sim = {};

  /* ---------- случайные числа ---------- */
  Sim.rng = function (seed) { // mulberry32, тот же, что в Course.rand.seeded
    let s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  Sim.normal = function (rng) {
    const u = Math.max(rng(), 1e-12), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length || 1)); };
  Sim.mean = mean; Sim.sd = sd;

  /* =====================================================================
     1. МАРКЕТ-МЕЙКИНГ
     ===================================================================== */
  Sim.scenarios = {
    calm: { name: "Спокойный день", sigma: 2, jumpProb: 0, jumpSize: 0, informed: 0,
      about: "Цена — случайное блуждание без новостей. Условия модели Avellaneda–Stoikov: можно проверять теорию." },
    volatile: { name: "Волатильный день", sigma: 4, jumpProb: 0, jumpSize: 0, informed: 0,
      about: "Волатильность вдвое выше. Резервная цена и риск запаса становятся важнее." },
    news: { name: "Новостной день", sigma: 2, jumpProb: 0.01, jumpSize: 2.5, informed: 0.7, informedSize: 2,
      about: "Редкие скачки цены. Информированные трейдеры успевают исполниться по устаревшей котировке." },
    toxic: { name: "Токсичный поток", sigma: 2, jumpProb: 0.04, jumpSize: 2.5, informed: 0.9, informedSize: 3,
      about: "Частые скачки, и почти каждый из них кто-то знает заранее. Классическая адверс-селекция (модуль 3)." }
  };

  Sim.MM_DEFAULTS = { A: 140, k: 1.5, steps: 200, T: 1, s0: 100, markout: 10 };

  /* Стратегия (параметры котирования):
     mode 'as'    — Avellaneda–Stoikov: gamma (неприятие риска), kEst (оценка k), extra (надбавка к полуспреду)
     mode 'fixed' — half (полуспред), skew (сдвиг центра на единицу запаса)
     общие: maxInv (лимит запаса, 0 = без лимита), fee (комиссия за исполнение; отрицательная = ребейт) */
  Sim.defaultStrategy = function () { return { mode: "as", gamma: 0.1, kEst: 1.5, extra: 0, half: 0.75, skew: 0.2, maxInv: 0, fee: 0 }; };

  /* Котировки при состоянии (s — mid, q — запас, tau — остаток времени, sigma — оценка σ). */
  Sim.quote = function (st, s, q, tau, sigma) {
    let centre, half;
    if (st.mode === "fixed") {
      centre = s - st.skew * q;
      half = st.half;
    } else {
      const g = Math.max(st.gamma, 1e-6), k = Math.max(st.kEst, 1e-6);
      centre = s - q * g * sigma * sigma * tau;
      half = (g * sigma * sigma * tau + (2 / g) * Math.log(1 + g / k)) / 2;
    }
    half += st.extra || 0;
    half = Math.max(half, 0.01);
    let bid = centre - half, ask = centre + half;
    const lim = st.maxInv || 0;
    if (lim > 0) { if (q >= lim) bid = null; if (q <= -lim) ask = null; }
    return { bid: bid, ask: ask, centre: centre, half: half };
  };

  function Market(opts) {
    opts = opts || {};
    const sc = typeof opts.scenario === "string" ? Sim.scenarios[opts.scenario] : opts.scenario;
    this.p = Object.assign({}, Sim.MM_DEFAULTS, sc || Sim.scenarios.calm, opts.params || {});
    this.rng = Sim.rng(opts.seed || 1);
    this.dt = this.p.T / this.p.steps;
    this.i = 0; this.s = this.p.s0; this.q = 0; this.cash = 0; this.feeSum = 0;
    this.fills = [];
    this.h = { s: [this.p.s0], q: [0], pnl: [0], bid: [], ask: [] };
  }
  Market.prototype.done = function () { return this.i >= this.p.steps; };
  Market.prototype.pnl = function () { return this.cash + this.q * this.s; };

  /* Один шаг: возвращает {bid, ask, fills:[...] , jump} */
  Market.prototype.step = function (st) {
    const p = this.p, dt = this.dt, rng = this.rng, tau = p.T - this.i * dt, s = this.s;
    const qt = Sim.quote(st, s, this.q, tau, p.sigma);
    const out = { bid: qt.bid, ask: qt.ask, fills: [], jump: 0 };
    const fee = st.fee || 0;
    const sell = (price, informed) => { this.q -= 1; this.cash += price - fee; this.feeSum += fee; const f = { i: this.i, side: -1, price: price, s0: s, informed: informed }; this.fills.push(f); out.fills.push(f); };
    const buy = (price, informed) => { this.q += 1; this.cash -= price + fee; this.feeSum += fee; const f = { i: this.i, side: 1, price: price, s0: s, informed: informed }; this.fills.push(f); out.fills.push(f); };
    // обычный поток (шумовые трейдеры): интенсивность падает с удалением от mid
    if (qt.ask != null) { const la = Math.min(1, p.A * Math.exp(-p.k * (qt.ask - s)) * dt); if (rng() < la) sell(qt.ask, false); }
    if (qt.bid != null) { const lb = Math.min(1, p.A * Math.exp(-p.k * (s - qt.bid)) * dt); if (rng() < lb) buy(qt.bid, false); }
    // новость: информированный трейдер бьёт по устаревшей котировке, пока мы не успели её сдвинуть
    let jump = 0;
    if (p.jumpProb > 0 && rng() < p.jumpProb) {
      jump = (rng() < 0.5 ? 1 : -1) * p.jumpSize;
      const sz = p.informedSize || 1, lim = st.maxInv || 0;
      if (jump > 0 && qt.ask != null && qt.ask < s + jump && rng() < p.informed) for (let u = 0; u < sz && !(lim > 0 && this.q <= -lim); u++) sell(qt.ask, true);
      if (jump < 0 && qt.bid != null && qt.bid > s + jump && rng() < p.informed) for (let u = 0; u < sz && !(lim > 0 && this.q >= lim); u++) buy(qt.bid, true);
    }
    out.jump = jump;
    const rt = p.sigma * Math.sqrt(dt);
    this.s = s + (rng() < 0.5 ? rt : -rt) + jump;
    this.i++;
    this.h.s.push(this.s); this.h.q.push(this.q); this.h.pnl.push(this.pnl());
    this.h.bid.push(qt.bid); this.h.ask.push(qt.ask);
    return out;
  };

  /* Итоговые показатели. markout — число шагов после сделки для оценки сдвига цены. */
  Market.prototype.stats = function () {
    const h = this.h, H = this.p.markout, last = h.s.length - 1, pnl = this.pnl();
    let spreadCap = 0, drift = 0, informedN = 0, informedPnl = 0;
    this.fills.forEach((f) => {
      spreadCap += f.side * (f.s0 - f.price);
      const j = Math.min(f.i + 1 + H, last);
      drift += f.side * (h.s[j] - f.s0);
      if (f.informed) { informedN++; informedPnl += f.side * (h.s[Math.min(f.i + 1, last)] - f.price); }
    });
    let peak = 0, mdd = 0;
    h.pnl.forEach((v) => { if (v > peak) peak = v; if (peak - v > mdd) mdd = peak - v; });
    const qs = h.q;
    return {
      pnl: pnl, fills: this.fills.length, informedFills: informedN, informedPnl: informedPnl, qEnd: this.q,
      qMaxAbs: Math.max.apply(null, qs.map(Math.abs)), qRms: Math.sqrt(mean(qs.map((x) => x * x))),
      spreadCapture: spreadCap, fees: this.feeSum,
      inventoryResult: pnl + this.feeSum - spreadCap,   // прибыль/убыток от движения цены при удержании запаса
      markoutPerFill: this.fills.length ? drift / this.fills.length : 0,
      avgHalfSpread: this.fills.length ? this.fills.reduce((a, f) => a + Math.abs(f.price - f.s0), 0) / this.fills.length : 0,
      maxDrawdown: mdd
    };
  };

  Sim.Market = Market;

  /* Полный прогон одного пути. */
  Sim.runMM = function (cfg) {
    const m = new Market(cfg); const st = cfg.strategy || Sim.defaultStrategy();
    while (!m.done()) m.step(st);
    return { market: m, stats: m.stats(), hist: m.h };
  };

  /* Много путей: seeds = baseSeed + 1 … baseSeed + n. Возвращает агрегаты по P&L и запасу. */
  Sim.batchMM = function (cfg, n, baseSeed) {
    const pnl = [], qEnd = [], fills = [], informed = [], avgSpread = [];
    for (let i = 1; i <= n; i++) {
      const r = Sim.runMM(Object.assign({}, cfg, { seed: (baseSeed || 0) + i }));
      pnl.push(r.stats.pnl); qEnd.push(r.stats.qEnd); fills.push(r.stats.fills); informed.push(r.stats.informedFills); avgSpread.push(r.stats.avgHalfSpread * 2);
    }
    return { n: n, pnl: pnl, qEnd: qEnd, meanPnl: mean(pnl), sdPnl: sd(pnl), meanQ: mean(qEnd), sdQ: sd(qEnd),
      meanFills: mean(fills), meanInformed: mean(informed), avgSpread: mean(avgSpread),
      sharpe: sd(pnl) > 0 ? mean(pnl) / sd(pnl) : 0, seMean: sd(pnl) / Math.sqrt(n) };
  };

  /* Симметричный эталон: центр = mid, полуспред = заданный. */
  Sim.symmetricStrategy = function (halfSpread, base) { return Object.assign({}, Sim.defaultStrategy(), base || {}, { mode: "fixed", half: halfSpread, skew: 0, extra: 0 }); };

  /* =====================================================================
     2. ОПТИМАЛЬНОЕ ИСПОЛНЕНИЕ (Almgren–Chriss)
     Продаём X акций за T = 1 день в N порций. Издержки на акцию:
       полуспред ε  +  постоянное влияние γ·n  (цена сдвигается навсегда)  +  временное η·n/τ (на самой порции).
     Откалибровано так, что равномерная продажа 10% дневного объёма стоит ≈ 35 б.п. —
     это сходится с законом квадратного корня 0,5·σ·√(Q/V) + полуспред (модуль 4).
     ===================================================================== */
  Sim.EXEC_DEFAULTS = {
    X: 200000, S0: 50, ADV: 2000000, N: 26, T: 1,
    sigmaDaily: 0.02,              // 2% в день
    eps: 0.015, gamma: 4e-7, eta: 6e-7
  };
  Sim.execParams = function (o) { const p = Object.assign({}, Sim.EXEC_DEFAULTS, o || {}); p.sigma = p.sigmaDaily * p.S0; p.tau = p.T / p.N; return p; };

  /* Остаток позиции после порции j = 0…N при «срочности» kappaT = κ·T. kappaT = 0 → равномерно. */
  Sim.execTrajectory = function (o, kappaT) {
    const p = Sim.execParams(o), x = [];
    for (let j = 0; j <= p.N; j++) {
      const t = j * p.tau;
      x.push(kappaT < 1e-9 ? p.X * (1 - t / p.T) : p.X * Math.sinh(kappaT * (1 - t / p.T)) / Math.sinh(kappaT));
    }
    return x;
  };

  /* Аналитические среднее и σ shortfall для траектории x (в долларах и б.п. от стоимости позиции). */
  Sim.execMoments = function (o, x) {
    const p = Sim.execParams(o); let cost = 0.5 * p.gamma * p.X * p.X + p.eps * p.X, sx = 0;
    for (let j = 1; j <= p.N; j++) { const n = x[j - 1] - x[j]; cost += (p.eta / p.tau) * n * n; sx += p.tau * x[j] * x[j]; }
    const val = p.X * p.S0, sdv = p.sigma * Math.sqrt(sx);
    return { cost: cost, sd: sdv, costBps: cost / val * 1e4, sdBps: sdv / val * 1e4 };
  };

  /* Один сценарий цены: возвращает shortfall в б.п. и путь цены. */
  Sim.execPath = function (o, x, seed) {
    const p = Sim.execParams(o), rng = Sim.rng(seed || 1); let S = p.S0, got = 0; const price = [S], fill = [];
    for (let j = 1; j <= p.N; j++) {
      const n = x[j - 1] - x[j];
      const px = S - p.eps - (p.eta / p.tau) * n;           // цена, полученная за порцию
      got += n * px; fill.push(px);
      S = S + p.sigma * Math.sqrt(p.tau) * Sim.normal(rng) - p.gamma * n;
      price.push(S);
    }
    return { shortfallBps: (p.X * p.S0 - got) / (p.X * p.S0) * 1e4, price: price, fill: fill };
  };
  Sim.execBatch = function (o, x, n, baseSeed) {
    const v = []; for (let i = 1; i <= n; i++) v.push(Sim.execPath(o, x, (baseSeed || 0) + i).shortfallBps);
    return { values: v, mean: mean(v), sd: sd(v) };
  };

  /* Минимальные издержки при риске не выше riskBps: ищем κT, при котором σ shortfall = riskBps. */
  Sim.execBestForRisk = function (o, riskBps) {
    let lo = 0, hi = 30;
    const f = (k) => Sim.execMoments(o, Sim.execTrajectory(o, k)).sdBps;
    if (f(0) <= riskBps) return { kappaT: 0, m: Sim.execMoments(o, Sim.execTrajectory(o, 0)) };
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > riskBps) lo = mid; else hi = mid; }
    return { kappaT: hi, m: Sim.execMoments(o, Sim.execTrajectory(o, hi)) };
  };

  /* Закон квадратного корня: impact = Y·σ·√(Q/V) в б.п. (σ — дневная, в долях). */
  Sim.sqrtImpactBps = function (Y, sigmaDaily, Q, V) { return Y * sigmaDaily * Math.sqrt(Q / V) * 1e4; };

  /* =====================================================================
     3. СМЕСЬ СЦЕНАРИЕВ ДЛЯ ПРОВЕРКИ НА ДАННЫХ (этап 4 проекта)
     Каждый «день» — случайный сценарий из заданных вероятностей; seed детерминирует и сценарий, и путь.
     ===================================================================== */
  Sim.dayMix = [["calm", 0.4], ["volatile", 0.2], ["news", 0.25], ["toxic", 0.15]];
  Sim.scenarioForDay = function (seed) {
    const r = Sim.rng(seed * 7919 + 13)(); let c = 0;
    for (let i = 0; i < Sim.dayMix.length; i++) { c += Sim.dayMix[i][1]; if (r < c) return Sim.dayMix[i][0]; }
    return "calm";
  };
  Sim.runDays = function (strategy, seeds) {
    return seeds.map((sd0) => Sim.runMM({ scenario: Sim.scenarioForDay(sd0), seed: sd0, strategy: strategy }).stats.pnl);
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Sim;
  else { root.Course = root.Course || {}; root.Course.sim = Sim; }
})(typeof window !== "undefined" ? window : globalThis);
