/* Движок стакана лимитных заявок для лаборатории. Чистый JS без DOM (работает в браузере и в Node).
   Модель «нулевого интеллекта» (zero-intelligence, модуль 2): лимитные заявки приходят пуассоновским потоком
   и ставятся на случайном расстоянии от противоположной котировки, рыночные заявки съедают очередь по правилу
   «цена, затем время», каждая стоящая заявка с небольшой вероятностью отменяется.
   Цены — целые тики. Заявки игрока имеют владельца 'me', их остальные участники не отменяют. */
(function (root) {
  "use strict";
  const L = {};
  const rngOf = (seed) => { // mulberry32
    let s = (seed >>> 0) || 1;
    return function () { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  const poisson = (rng, lam) => { const e = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= rng(); } while (p > e); return k - 1; };

  /* lambdaL — лимитных заявок на сторону за шаг, lambdaM — рыночных на сторону, theta — вероятность отмены
     одной заявки за шаг, depth — средняя удалённость новой лимитной заявки от противоположной котировки (тики),
     size — средний размер заявки (лоты). Равновесное число заявок на стороне ≈ lambdaL / theta. */
  L.DEFAULTS = { lambdaL: 0.9, lambdaM: 0.2, theta: 0.03, depth: 3, size: 2, mid0: 1000 };

  function Book(opts) {
    opts = opts || {};
    this.p = Object.assign({}, L.DEFAULTS, opts.params || {});
    this.rng = rngOf(opts.seed || 1);
    this.t = 0; this.nextId = 1; this.ref = this.p.mid0;
    this.bids = new Map(); this.asks = new Map();
    this.me = { pos: 0, cash: 0, fills: [] };
    this.myOrders = new Map(); // id -> {side, price, size(остаток)}
    this.hist = { mid: [], spread: [] };
    this.lastTrade = null;
    this._seedBook();
    for (let i = 0; i < (opts.burn == null ? 300 : opts.burn); i++) this.step();
    this.hist = { mid: [], spread: [] };
  }
  const prototype = Book.prototype;

  prototype._sz = function (mean) { return Math.min(10, 1 + Math.floor(-Math.log(Math.max(this.rng(), 1e-12)) * (mean - 1 + 0.001))); };
  prototype._seedBook = function () {
    const m = this.p.mid0;
    for (let i = 0; i < 12; i++) { this._add("B", m - 1 - Math.floor(i / 2), this._sz(this.p.size), "o"); this._add("S", m + 1 + Math.floor(i / 2), this._sz(this.p.size), "o"); }
  };
  prototype._side = function (s) { return s === "B" ? this.bids : this.asks; };
  prototype._add = function (side, price, size, owner) {
    const book = this._side(side); let lv = book.get(price); if (!lv) { lv = []; book.set(price, lv); }
    const id = this.nextId++; lv.push({ id: id, size: size, owner: owner }); return id;
  };
  prototype.bestBid = function () { let b = null; for (const p of this.bids.keys()) if (b === null || p > b) b = p; return b; };
  prototype.bestAsk = function () { let a = null; for (const p of this.asks.keys()) if (a === null || p < a) a = p; return a; };
  prototype.mid = function () { const b = this.bestBid(), a = this.bestAsk(); return b !== null && a !== null ? (b + a) / 2 : this.ref; };
  prototype.spread = function () { const b = this.bestBid(), a = this.bestAsk(); return b !== null && a !== null ? a - b : 0; };

  /* Рыночная заявка: съедает противоположную сторону. limitPrice (необязательно) — предельная цена. */
  prototype.market = function (side, qty, owner, limitPrice) {
    const book = this._side(side === "B" ? "S" : "B"), fills = []; let left = qty;
    while (left > 0) {
      let bp = null; for (const p of book.keys()) if (bp === null || (side === "B" ? p < bp : p > bp)) bp = p;
      if (bp === null) break;
      if (limitPrice != null && (side === "B" ? bp > limitPrice : bp < limitPrice)) break;
      const lv = book.get(bp);
      while (left > 0 && lv.length) {
        const o = lv[0], q = Math.min(left, o.size);
        o.size -= q; left -= q; fills.push({ price: bp, qty: q });
        if (o.owner === "me") { // нашу стоящую заявку исполнил кто-то другой
          const mo = this.myOrders.get(o.id), signed = side === "B" ? -q : q; // мы продавали (если на стороне S) или покупали
          this.me.pos += signed; this.me.cash -= signed * bp; this.me.fills.push({ t: this.t, price: bp, qty: q, side: signed > 0 ? "B" : "S", passive: true });
          if (mo) { mo.size -= q; if (mo.size <= 0) this.myOrders.delete(o.id); }
        }
        if (o.size <= 0) lv.shift();
      }
      if (!lv.length) book.delete(bp);
    }
    const got = qty - left, notional = fills.reduce((a, f) => a + f.price * f.qty, 0);
    if (fills.length) this.lastTrade = fills[fills.length - 1].price;
    if (owner === "me" && got > 0) { const signed = side === "B" ? got : -got; this.me.pos += signed; this.me.cash -= signed * (notional / got); this.me.fills.push({ t: this.t, price: notional / got, qty: got, side: side, passive: false }); }
    return { filled: got, left: left, notional: notional, avg: got ? notional / got : null, fills: fills };
  };

  /* Лимитная заявка. Если цена пересекает рынок, пересекающая часть исполняется сразу, остаток встаёт в очередь. */
  prototype.limit = function (side, price, size, owner) {
    let res = null, rest = size;
    if (owner === "me") {
      const crossing = side === "B" ? (this.bestAsk() !== null && price >= this.bestAsk()) : (this.bestBid() !== null && price <= this.bestBid());
      if (crossing) { res = this.market(side, size, "me", price); rest = res.left; }
    }
    let id = null;
    if (rest > 0) {
      id = this._add(side, price, rest, owner);
      if (owner === "me") this.myOrders.set(id, { side: side, price: price, size: rest });
    }
    return { id: id, immediate: res, rested: rest };
  };
  prototype.cancel = function (id) {
    const mo = this.myOrders.get(id); if (!mo) return false;
    const book = this._side(mo.side), lv = book.get(mo.price); if (!lv) return false;
    const i = lv.findIndex((o) => o.id === id); if (i < 0) return false;
    lv.splice(i, 1); if (!lv.length) book.delete(mo.price); this.myOrders.delete(id); return true;
  };
  /* Сколько лотов стоит впереди заявки в очереди на её уровне. */
  prototype.queueAhead = function (id) {
    const mo = this.myOrders.get(id); if (!mo) return null;
    const lv = this._side(mo.side).get(mo.price) || []; let s = 0;
    for (const o of lv) { if (o.id === id) return s; s += o.size; }
    return null;
  };

  prototype.step = function () {
    const p = this.p, rng = this.rng, ev = [];
    ["B", "S"].forEach((s) => {
      for (let i = poisson(rng, p.lambdaL); i > 0; i--) ev.push(["L", s]);
      for (let i = poisson(rng, p.lambdaM); i > 0; i--) ev.push(["M", s]);
    });
    for (let i = ev.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = ev[i]; ev[i] = ev[j]; ev[j] = x; }
    ev.forEach((e) => {
      if (e[0] === "L") {
        const ref = e[1] === "B" ? (this.bestAsk() !== null ? this.bestAsk() : this.ref + 1) : (this.bestBid() !== null ? this.bestBid() : this.ref - 1);
        const d = 1 + Math.floor(-Math.log(Math.max(rng(), 1e-12)) * p.depth);
        this._add(e[1], e[1] === "B" ? ref - d : ref + d, this._sz(p.size), "o");
      } else {
        if (this.bestBid() === null || this.bestAsk() === null) return;
        this.market(e[1], this._sz(p.size), "o");
      }
    });
    for (const book of [this.bids, this.asks]) {
      for (const [price, lv] of book) {
        for (let i = lv.length - 1; i >= 0; i--) if (lv[i].owner === "o" && rng() < p.theta) lv.splice(i, 1);
        if (!lv.length) book.delete(price);
      }
    }
    // страховка: книга не должна оставаться без котировки
    if (this.bestBid() === null) this._add("B", Math.round(this.ref) - 1, this._sz(p.size), "o");
    if (this.bestAsk() === null) this._add("S", Math.round(this.ref) + 1, this._sz(p.size), "o");
    if (this.bestBid() >= this.bestAsk()) { // не должно случаться, но на всякий случай разводим котировки
      const m = Math.round((this.bestBid() + this.bestAsk()) / 2); this.bids.clear(); this.asks.clear(); this._add("B", m - 1, 3, "o"); this._add("S", m + 1, 3, "o");
    }
    this.ref = this.mid(); this.t++;
    this.hist.mid.push(this.ref); this.hist.spread.push(this.spread());
  };

  /* Лестница для отображения: n уровней каждой стороны от лучших цен. */
  prototype.ladder = function (n) {
    const mine = {}; this.myOrders.forEach((o, id) => { mine[o.side + o.price] = (mine[o.side + o.price] || 0) + o.size; });
    const take = (book, asc) => Array.from(book.keys()).sort((a, b) => (asc ? a - b : b - a)).slice(0, n).map((pr) => ({ price: pr, size: book.get(pr).reduce((a, o) => a + o.size, 0), orders: book.get(pr).length }));
    const bids = take(this.bids, false), asks = take(this.asks, true);
    bids.forEach((l) => (l.mine = mine["B" + l.price] || 0)); asks.forEach((l) => (l.mine = mine["S" + l.price] || 0));
    return { bids: bids, asks: asks };
  };
  /* Дисбаланс (V_bid − V_ask)/(V_bid + V_ask) по k лучшим уровням. */
  prototype.imbalance = function (k) {
    const l = this.ladder(k || 1), vb = l.bids.reduce((a, x) => a + x.size, 0), va = l.asks.reduce((a, x) => a + x.size, 0);
    return vb + va ? (vb - va) / (vb + va) : 0;
  };
  prototype.pnl = function () { return this.me.cash + this.me.pos * this.mid(); };
  L.Book = Book;

  /* ---------------------------------------------------------------
     Эксперимент 1: исполнится ли моя заявка? Покупаем 1 лот лимитной заявкой в одном из мест очереди.
     place: 'improve' (на тик лучше bid), 'join' (на лучшем bid), 'back1', 'back3' (глубже на 1 или 3 тика).
     Возвращает долю исполнений, среднее ожидание, captured (mid в момент исполнения минус цена покупки: сколько
     «заработали» на спреде, в тиках), markout (изменение mid за следующие markout шагов; минус — адверс-селекция) и
     дрейф mid для неисполненных (плюс — цена ушла вверх, пока мы стояли в очереди).
     --------------------------------------------------------------- */
  L.queueExperiment = function (cfg, nRuns, baseSeed) {
    cfg = Object.assign({ place: "join", size: 1, horizon: 300, markout: 20, burn: 300, params: {} }, cfg || {});
    let filled = 0, wait = 0, mk = 0, cap = 0, drift = 0, unfilled = 0, ahead0 = 0;
    for (let r = 1; r <= nRuns; r++) {
      const b = new Book({ seed: (baseSeed || 0) + r, burn: cfg.burn, params: cfg.params });
      const bb = b.bestBid(), ba = b.bestAsk();
      let price = bb;
      if (cfg.place === "improve" && bb + 1 < ba) price = bb + 1;
      else if (cfg.place === "back1") price = bb - 1;
      else if (cfg.place === "back3") price = bb - 3;
      const mid0 = b.mid(), o = b.limit("B", price, cfg.size, "me");
      if (o.id == null) { filled++; mk += 0; continue; }
      ahead0 += b.queueAhead(o.id) || 0;
      let fillT = null, fillMid = null;
      for (let t = 1; t <= cfg.horizon; t++) {
        b.step();
        if (fillT === null && !b.myOrders.has(o.id)) { fillT = t; }
        if (fillT !== null) break;
      }
      if (fillT !== null) {
        filled++; wait += fillT; cap += b.mid() - price;
        const midFill = b.mid();
        for (let t = 0; t < cfg.markout; t++) b.step();
        mk += b.mid() - midFill;
      } else { unfilled++; drift += b.mid() - mid0; }
    }
    return { runs: nRuns, fillProb: filled / nRuns, meanWait: filled ? wait / filled : null, captured: filled ? cap / filled : null, markout: filled ? mk / filled : null,
      driftUnfilled: unfilled ? drift / unfilled : null, meanAhead: ahead0 / nRuns };
  };

  /* ---------------------------------------------------------------
     Эксперимент 2: предсказывает ли дисбаланс стакана движение цены?
     Для каждого шага: дисбаланс по k уровням и направление изменения mid через h шагов.
     --------------------------------------------------------------- */
  L.imbalanceExperiment = function (cfg, steps, seed) {
    cfg = Object.assign({ k: 1, h: 5, params: {} }, cfg || {});
    const b = new Book({ seed: seed || 1, params: cfg.params }), edges = [-0.6, -0.2, 0.2, 0.6], nb = 5;
    const rec = []; // [imbalance, mid]
    for (let i = 0; i < steps; i++) { rec.push([b.imbalance(cfg.k), b.mid()]); b.step(); }
    const cnt = Array.from({ length: nb }, () => ({ up: 0, down: 0, flat: 0, n: 0 }));
    for (let i = 0; i + cfg.h < rec.length; i++) {
      const im = rec[i][0]; let bi = 0; while (bi < edges.length && im >= edges[bi]) bi++;
      const d = rec[i + cfg.h][1] - rec[i][1], c = cnt[bi]; c.n++; if (d > 0) c.up++; else if (d < 0) c.down++; else c.flat++;
    }
    return cnt.map((c, i) => ({ bucket: i, n: c.n, up: c.n ? c.up / c.n : 0, down: c.n ? c.down / c.n : 0, flat: c.n ? c.flat / c.n : 0 }));
  };

  /* ---------------------------------------------------------------
     Аукцион с единой ценой. orders: [{side:'B'|'S', price:число|null (null — рыночная), qty}]
     Цена исполнения максимизирует объём; при равенстве — минимальный небаланс, затем ближайшая к ref.
     --------------------------------------------------------------- */
  L.auction = function (orders, ref) {
    const prices = Array.from(new Set(orders.filter((o) => o.price != null).map((o) => o.price))).sort((a, b) => a - b);
    const D = (p) => orders.reduce((a, o) => a + (o.side === "B" && (o.price == null || o.price >= p) ? o.qty : 0), 0);
    const S = (p) => orders.reduce((a, o) => a + (o.side === "S" && (o.price == null || o.price <= p) ? o.qty : 0), 0);
    const curve = { prices: prices, demand: prices.map(D), supply: prices.map(S) };
    let best = null;
    prices.forEach((p, i) => {
      const d = curve.demand[i], s = curve.supply[i], v = Math.min(d, s), imb = Math.abs(d - s), dist = ref == null ? 0 : Math.abs(p - ref);
      const c = { price: p, volume: v, imbalance: imb, dist: dist };
      if (!best || v > best.volume || (v === best.volume && (imb < best.imbalance || (imb === best.imbalance && (dist < best.dist || (dist === best.dist && p < best.price)))))) best = c;
    });
    if (!best || best.volume === 0) return { price: null, volume: 0, curve: curve, fills: orders.map(() => 0) };
    const fills = orders.map(() => 0);
    const alloc = (side) => {
      const idx = orders.map((o, i) => i).filter((i) => orders[i].side === side && (side === "B" ? (orders[i].price == null || orders[i].price >= best.price) : (orders[i].price == null || orders[i].price <= best.price)));
      idx.sort((a, b) => { const pa = orders[a].price, pb = orders[b].price; const ka = pa == null ? (side === "B" ? Infinity : -Infinity) : pa, kb = pb == null ? (side === "B" ? Infinity : -Infinity) : pb; return ka === kb ? a - b : (side === "B" ? kb - ka : ka - kb); });
      let left = best.volume; idx.forEach((i) => { const q = Math.min(left, orders[i].qty); fills[i] = q; left -= q; });
    };
    alloc("B"); alloc("S");
    return { price: best.price, volume: best.volume, imbalance: best.imbalance, curve: curve, fills: fills };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = L;
  else { root.Course = root.Course || {}; root.Course.lob = L; }
})(typeof window !== "undefined" ? window : globalThis);
