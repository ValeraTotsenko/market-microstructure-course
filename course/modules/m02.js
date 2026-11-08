/* Модуль 2: Книга лимитных заявок */
(function () {
  'use strict';

  /* ======================= общие помощники ======================= */
  const C = () => window.Course;

  function gammaFn(z) { // Lanczos
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  function expo(rng, rate) { return -Math.log(1 - rng()) / rate; }

  function geo(rng, mean) { // геометрическое на {1,2,...} со средним mean
    if (mean <= 1) return 1;
    const p = 1 / mean;
    return 1 + Math.floor(Math.log(1 - rng()) / Math.log(1 - p));
  }

  /* ======================= движок матчинга (цена-время) ======================= */
  function makeBook() {
    const bids = new Map(), asks = new Map();
    let nextId = 1;
    const book = {
      bids, asks,
      bestBid() { let b = null; for (const [p, q] of bids) if (q.length && (b === null || p > b)) b = p; return b; },
      bestAsk() { let a = null; for (const [p, q] of asks) if (q.length && (a === null || p < a)) a = p; return a; },
      match(side, qty, limitPrice) {
        const opp = side === 'buy' ? asks : bids, trades = [];
        while (qty > 0) {
          const bp = side === 'buy' ? book.bestAsk() : book.bestBid();
          if (bp === null) break;
          if (limitPrice !== null && (side === 'buy' ? bp > limitPrice : bp < limitPrice)) break;
          const q = opp.get(bp);
          while (qty > 0 && q.length) {
            const o = q[0], t = Math.min(qty, o.qty);
            o.qty -= t; qty -= t;
            trades.push({ price: bp, qty: t, id: o.id, mine: o.mine });
            if (o.qty === 0) q.shift();
          }
          if (!q.length) opp.delete(bp);
        }
        return { trades, left: qty };
      },
      limit(side, price, qty, mine) {
        const r = book.match(side, qty, price);
        let id = null;
        if (r.left > 0) {
          const own = side === 'buy' ? bids : asks;
          if (!own.has(price)) own.set(price, []);
          id = nextId++;
          own.get(price).push({ id, qty: r.left, mine: !!mine });
        }
        return { id, trades: r.trades, rested: r.left };
      },
      market(side, qty) {
        const r = book.match(side, qty, null);
        return { trades: r.trades, unfilled: r.left };
      },
      cancel(id) {
        for (const m of [bids, asks]) {
          for (const [p, q] of m) {
            const i = q.findIndex((o) => o.id === id);
            if (i >= 0) { const o = q.splice(i, 1)[0]; if (!q.length) m.delete(p); return o; }
          }
        }
        return null;
      },
      allIds() {
        const ids = [];
        for (const m of [bids, asks]) for (const q of m.values()) for (const o of q) ids.push(o.id);
        return ids;
      },
      depth(side, levels) { // суммарный объём на лучших `levels` ценовых уровнях
        const m = side === 'buy' ? bids : asks;
        const ps = [...m.keys()].sort((x, y) => (side === 'buy' ? y - x : x - y)).slice(0, levels);
        return ps.reduce((s, p) => s + m.get(p).reduce((a, o) => a + o.qty, 0), 0);
      }
    };
    return book;
  }

  function seedBook(book, rng) {
    for (let k = 0; k < 5; k++) {
      const n = 1 + Math.floor(rng() * 3);
      for (let j = 0; j < n; j++) {
        book.limit('buy', 100 - k, 1 + Math.floor(rng() * 6), false);
        book.limit('sell', 101 + k, 1 + Math.floor(rng() * 6), false);
      }
    }
  }

  /* случайное событие «остального рынка» для демонстрации */
  function randomEvent(book, rng) {
    const u = rng(), side = rng() < 0.5 ? 'buy' : 'sell';
    const bb = book.bestBid(), ba = book.bestAsk();
    if (u < 0.3) {
      const q = 1 + Math.floor(rng() * 5);
      const r = book.market(side, q);
      return { text: 'Рынок: чужой рыночный ' + (side === 'buy' ? 'на покупку' : 'на продажу') + ' ' + q, trades: r.trades, aggr: side };
    }
    if (u < 0.5) {
      const ids = book.allIds();
      if (ids.length) {
        const id = ids[Math.floor(rng() * ids.length)], o = book.cancel(id);
        if (o) return { text: 'Рынок: чужая отмена заявки #' + id, trades: [], aggr: 'buy' };
      }
    }
    const off = Math.floor(rng() * 4);
    let price;
    if (side === 'buy') price = (ba !== null ? ba : (bb !== null ? bb + 2 : 100)) - 1 - off;
    else price = (bb !== null ? bb : (ba !== null ? ba - 2 : 101)) + 1 + off;
    const q = 1 + Math.floor(rng() * 5);
    const r = book.limit(side, price, q, false);
    return { text: 'Рынок: чужая лимитная ' + (side === 'buy' ? 'покупка' : 'продажа') + ' ' + q + ' @ ' + price, trades: r.trades, aggr: side };
  }

  /* ======================= симуляция «нулевого интеллекта» ======================= */
  /* Пуассоновские потоки: лимитные ордера на расстоянии i=1..K тиков от противоположной лучшей цены
     с интенсивностью lam*exp(-(i-1)/ell) на каждую сторону; рыночные mu на каждую сторону;
     отмена каждой единицы объёма с интенсивностью theta. Все ордера единичного размера. */
  function simZI(p, rng, nEv) {
    const G = 1600, mid0 = 800, K = p.K;
    const bid = new Int32Array(G), ask = new Int32Array(G);
    for (let j = 0; j < 8; j++) { bid[mid0 - j] = 3; ask[mid0 + 1 + j] = 3; }
    let bb = mid0, ba = mid0 + 1;
    const w = [], wsum = [];
    let tot = 0;
    for (let i = 1; i <= K; i++) { const x = p.lam * (p.ell > 0 ? Math.exp(-(i - 1) / p.ell) : 1); w.push(x); tot += x; wsum.push(tot); }
    const pickLevel = () => { const u = rng() * tot; for (let i = 0; i < K; i++) if (u < wsum[i]) return i + 1; return K; };
    const scanBid = () => { let q = bb; while (q > 0 && bid[q] === 0) q--; return q; };
    const scanAsk = () => { let q = ba; while (q < G - 1 && ask[q] === 0) q++; return q; };
    let nb = 24, na = 24; // число единиц на сторонах
    const prof = new Float64Array(8);
    let T = 0, Tspread = 0;
    const out = { ev: [], bid: [], ask: [], spread: [], t: 0 };
    const step = Math.max(1, Math.floor(nEv / 500));
    for (let e = 0; e < nEv; e++) {
      const rL = tot, rM = p.mu, rC = p.theta * (nb + na);
      const R = 2 * rL + 2 * rM + rC;
      const dt = expo(rng, R);
      // накопление статистик по времени
      T += dt; Tspread += dt * (ba - bb);
      for (let j = 0; j < 8; j++) {
        const pb = bb - j, pa = ba + j;
        prof[j] += dt * ((pb > 0 ? bid[pb] : 0) + (pa < G ? ask[pa] : 0)) / 2;
      }
      let u = rng() * R;
      if (u < rL) { // лимитная покупка
        const i = pickLevel(), pr = ba - i;
        if (pr > 0) { bid[pr]++; nb++; if (pr > bb) bb = pr; }
      } else if ((u -= rL) < rL) { // лимитная продажа
        const i = pickLevel(), pr = bb + i;
        if (pr < G) { ask[pr]++; na++; if (pr < ba) ba = pr; }
      } else if ((u -= rL) < rM) { // рыночная покупка
        ask[ba]--; na--; if (ask[ba] === 0) ba = scanAsk();
      } else if ((u -= rM) < rM) { // рыночная продажа
        bid[bb]--; nb--; if (bid[bb] === 0) bb = scanBid();
      } else { // отмена случайной единицы объёма
        let t = Math.floor(rng() * (nb + na));
        if (t < nb) {
          let q = bb; while (q > 0) { if (t < bid[q]) break; t -= bid[q]; q--; }
          if (q > 0 && bid[q] > 0) { bid[q]--; nb--; if (bid[bb] === 0) bb = scanBid(); }
        } else {
          t -= nb;
          let q = ba; while (q < G) { if (t < ask[q]) break; t -= ask[q]; q++; }
          if (q < G && ask[q] > 0) { ask[q]--; na--; if (ask[ba] === 0) ba = scanAsk(); }
        }
      }
      // граничное условие: сторона не должна опустеть
      if (nb === 0 || bid[bb] === 0) { bid[ba - 1] += 1; nb++; bb = ba - 1; }
      if (na === 0 || ask[ba] === 0) { ask[bb + 1] += 1; na++; ba = bb + 1; }
      if (ba <= bb) { ba = bb + 1; }
      if (e % step === 0) { out.ev.push(e); out.bid.push(bb - mid0); out.ask.push(ba - mid0); out.spread.push(ba - bb); }
    }
    out.meanSpread = Tspread / T;
    out.profile = Array.from(prof, (x) => x / T);
    out.finalMid = (bb + ba) / 2 - mid0;
    return out;
  }

  /* ======================= дисбаланс: гонка двух очередей ======================= */
  /* P(mid пойдёт вверх): очередь на ask опустеет раньше, чем на bid.
     События на лучшей котировке: рыночная покупка (mu) съедает единицу ask, рыночная продажа (mu) — bid,
     лимитные (lam) добавляют по единице на каждую сторону, отмены (theta на единицу). */
  function pUpSim(a, b, mu, lam, theta, rng, trials) {
    let up = 0, down = 0;
    for (let tr = 0; tr < trials; tr++) {
      let x = a, y = b, steps = 0;
      while (x > 0 && y > 0 && steps < 4000) {
        steps++;
        const rm = 2 * mu, rl = 2 * lam, rc = theta * (x + y), R = rm + rl + rc;
        let u = rng() * R;
        if (u < mu) x--; else if ((u -= mu) < mu) y--;
        else if ((u -= mu) < lam) x++; else if ((u -= lam) < lam) y++;
        else if ((u -= lam) < theta * x) x--; else y--;
      }
      if (x === 0 && y > 0) up++; else if (y === 0 && x > 0) down++;
    }
    return { up: up / trials, down: down / trials, none: 1 - (up + down) / trials };
  }

  function pUpExact(a, b) { // mu-только, lam=theta=0: P(Bin(a+b-1,1/2) >= a)
    const N = a + b - 1;
    let s = 0;
    for (let j = a; j <= N; j++) {
      let c = 1;
      for (let i = 0; i < j; i++) c = (c * (N - i)) / (i + 1);
      s += c * Math.pow(0.5, N);
    }
    return s;
  }

  /* ======================= позиция в очереди ======================= */
  function fillSim(n0, m, s, theta, T, trials, rng, unit) {
    const times = []; let fills = 0;
    for (let tr = 0; tr < trials; tr++) {
      let n = n0, t = 0, filled = false;
      for (let it = 0; it < 100000; it++) {
        const rm = unit ? m * s : m, rc = theta * n, R = rm + rc;
        t += expo(rng, R);
        if (t > T) break;
        if (rng() * R < rm) {
          const size = unit ? 1 : geo(rng, s);
          if (size > n) { filled = true; break; }
          n -= size;
        } else n -= 1;
      }
      if (filled) { fills++; times.push(t); }
    }
    return { p: fills / trials, times };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeBook, seedBook, randomEvent, simZI, pUpSim, pUpExact, fillSim, gammaFn };
  }
  if (typeof window === 'undefined' || !window.Course) return;

  /* ======================= стили виджетов ======================= */
  const css = (n) => window.Course.ui.color(n);

  /* ======================= ВИДЖЕТ 1: живая книга ======================= */
  function widgetLiveBook(root) {
    const Course = C(), el = Course.ui.el;
    let rng = Course.rand.seeded(11), book, log = [], pos = { cash: 0, qty: 0 };
    root.innerHTML = '';
    const top = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:8px' });
    const mk = (label, node) => { const l = el('label', { style: 'font-size:13px;display:flex;flex-direction:column;gap:2px' }); l.append(label); l.appendChild(node); top.appendChild(l); return node; };
    const selSide = mk('Сторона', el('select', null, '<option value="buy">покупка</option><option value="sell">продажа</option>'));
    const selType = mk('Тип', el('select', null, '<option value="limit">лимитная</option><option value="market">рыночная</option>'));
    const inpPrice = mk('Цена (тики)', el('input', { type: 'number', value: '100', step: '1', style: 'width:80px' }));
    const inpQty = mk('Объём (лоты)', el('input', { type: 'number', value: '3', step: '1', min: '1', style: 'width:70px' }));
    root.appendChild(top);
    const btns = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px' });
    root.appendChild(btns);
    const box = el('div', { style: 'display:flex;flex-wrap:wrap;gap:16px' });
    const ladder = el('div', { style: 'flex:1 1 340px;min-width:300px;font-size:13px' });
    const side = el('div', { style: 'flex:1 1 240px;min-width:220px;font-size:13px' });
    box.append(ladder, side);
    root.appendChild(box);
    const stat = Course.ui.output(root);

    function chip(o, color) {
      const s = el('span', { 'data-id': o.id, title: 'Нажмите, чтобы отменить заявку #' + o.id, style: 'cursor:pointer;display:inline-block;margin:1px 3px 1px 0;padding:0 5px;border-radius:3px;border:1px solid ' + (o.mine ? css('--ink') : css('--grid')) + ';background:' + color + ';font-weight:' + (o.mine ? '700' : '400') });
      s.textContent = (o.mine ? 'моя ' : '') + '#' + o.id + ':' + o.qty;
      s.addEventListener('click', () => { const c = book.cancel(o.id); if (c) { addLog('Отмена заявки #' + o.id + (c.mine ? ' (моя)' : '')); render(); } });
      return s;
    }
    function addLog(t) { log.unshift(t); if (log.length > 9) log.pop(); }
    function describeTrades(tr) {
      if (!tr.length) return '';
      const q = tr.reduce((a, t) => a + t.qty, 0), v = tr.reduce((a, t) => a + t.qty * t.price, 0);
      const parts = tr.map((t) => t.qty + '@' + t.price + (t.mine ? '(моя)' : ''));
      return ' → сделки: ' + parts.join(', ') + '; средняя цена ' + Course.fmt.n(v / q, 3);
    }
    function trackMine(trades, aggressorSide) {
      trades.forEach((t) => { if (t.mine) { const sgn = aggressorSide === 'buy' ? -1 : 1; pos.qty += sgn * t.qty; pos.cash -= sgn * t.qty * t.price; } });
    }
    function render() {
      const bb = book.bestBid(), ba = book.bestAsk();
      const prices = new Set();
      for (const [p, q] of book.bids) if (q.length) prices.add(p);
      for (const [p, q] of book.asks) if (q.length) prices.add(p);
      if (bb !== null && ba !== null && ba - bb <= 6) for (let p = bb + 1; p < ba; p++) prices.add(p);
      const ps = [...prices].sort((x, y) => y - x);
      const tbl = el('table', { style: 'width:100%;border-collapse:collapse' });
      tbl.innerHTML = '<tr style="text-align:left"><th>Цена</th><th>Объём</th><th>Очередь (первый слева)</th></tr>';
      ps.forEach((p) => {
        const isAsk = book.asks.has(p) && book.asks.get(p).length, isBid = book.bids.has(p) && book.bids.get(p).length;
        const q = isAsk ? book.asks.get(p) : (isBid ? book.bids.get(p) : []);
        const tr = el('tr', { style: 'border-top:1px solid ' + css('--grid') });
        const colr = isAsk ? css('--bad') : (isBid ? css('--good') : css('--muted'));
        const tag = (p === ba ? ' ask' : (p === bb ? ' bid' : ''));
        const td1 = el('td', { style: 'color:' + colr + ';font-weight:700' }, p + tag);
        const td2 = el('td', null, q.length ? String(q.reduce((a, o) => a + o.qty, 0)) : '—');
        const td3 = el('td');
        q.forEach((o) => td3.appendChild(chip(o, 'transparent')));
        if (!q.length) td3.appendChild(el('span', { style: 'color:' + css('--muted') }, '(внутри спреда, пусто)'));
        tr.append(td1, td2, td3);
        tbl.appendChild(tr);
      });
      ladder.innerHTML = '';
      ladder.appendChild(tbl);
      side.innerHTML = '<b>Журнал</b><br>' + (log.length ? log.map((t) => '<div style="margin:2px 0">' + t + '</div>').join('') : '<span style="color:' + css('--muted') + '">пока пусто</span>');
      const sp = bb !== null && ba !== null ? ba - bb : null, mid = sp !== null ? (ba + bb) / 2 : null;
      const mark = mid !== null ? pos.cash + pos.qty * mid : null;
      stat.innerHTML = 'bid: <b>' + (bb === null ? '—' : bb) + '</b> · ask: <b>' + (ba === null ? '—' : ba) + '</b> · спред: <b>' + (sp === null ? '—' : sp + ' тик.') + '</b> · mid: <b>' + (mid === null ? '—' : Course.fmt.n(mid, 1)) + '</b> · глубина (3 лучших уровня): bid <b>' + book.depth('buy', 3) + '</b>, ask <b>' + book.depth('sell', 3) + '</b><br>Ваша позиция: <b>' + pos.qty + '</b> лотов, денежный поток <b>' + Course.fmt.n(pos.cash, 0) + '</b>' + (mark !== null ? ', оценка по mid: <b>' + Course.fmt.n(mark, 1) + '</b>' : '') + '. Нажмите на любую заявку в очереди, чтобы отменить её.';
    }
    function submit() {
      const sd = selSide.value, ty = selType.value, q = Math.max(1, Math.floor(+inpQty.value || 1)), pr = Math.round(+inpPrice.value);
      if (ty === 'limit') {
        const r = book.limit(sd, pr, q, true);
        trackMine(r.trades, sd);
        addLog('Лимитная ' + (sd === 'buy' ? 'покупка' : 'продажа') + ' ' + q + ' @ ' + pr + (r.id ? ' (в книге как моя #' + r.id + ', остаток ' + r.rested + ')' : ' (исполнена целиком)') + describeTrades(r.trades));
      } else {
        const r = book.market(sd, q);
        trackMine(r.trades, sd);
        addLog('Рыночная ' + (sd === 'buy' ? 'покупка' : 'продажа') + ' ' + q + describeTrades(r.trades) + (r.unfilled ? '; не хватило ликвидности: ' + r.unfilled : ''));
      }
      render();
    }
    function init() { book = makeBook(); seedBook(book, rng); log = []; pos = { cash: 0, qty: 0 }; render(); }
    Course.ui.button(btns, 'Отправить заявку', submit);
    function runRandom(n) {
      for (let i = 0; i < n; i++) { const r = randomEvent(book, rng); trackMine(r.trades, r.aggr); addLog(r.text + describeTrades(r.trades)); }
      render();
    }
    Course.ui.button(btns, 'Случайное событие рынка', () => runRandom(1), true);
    Course.ui.button(btns, '5 случайных событий', () => runRandom(5), true);
    Course.ui.button(btns, 'Сбросить книгу', () => { init(); }, true);
    init();
  }

  /* ======================= ВИДЖЕТ 2 (урок 2): иллюстрация стилизованных фактов ======================= */
  function widgetFacts(root) {
    const Course = C();
    root.innerHTML = '';
    const note = Course.ui.el('div', { class: 'callout warn' }, '<span class="t">Иллюстрация</span>Графики построены на синтетических данных и теоретических формулах, а не на реальной бирже. Источник [24] даёт только качественные выводы и диапазоны показателей; здесь мы лишь показываем, как отличаются сравниваемые гипотезы.');
    root.appendChild(note);
    let seed = 5;
    const sk = Course.ui.slider(root, { label: 'Форма Вейбулла k (k=1 — экспонента, т.е. пуассоновский поток)', min: 0.3, max: 1.5, step: 0.05, value: 0.6, fmt: (v) => Course.fmt.n(+v, 2), onInput: draw });
    const sm = Course.ui.slider(root, { label: 'Показатель степенного хвоста размеров 1+μ (в источнике ≈2,0–2,7)', min: 1.3, max: 2.9, step: 0.05, value: 2.7, fmt: (v) => Course.fmt.n(+v, 2), onInput: draw });
    Course.ui.button(root, 'Новая выборка', () => { seed++; draw(); }, true);
    const c1 = Course.ui.canvas(root, 560, 260), c2 = Course.ui.canvas(root, 560, 260);
    const out = Course.ui.output(root);
    function draw() {
      const k = sk.get(), a = sm.get(), mu = a - 1;
      const rng = Course.rand.seeded(seed * 97 + 3);
      const scale = 1 / gammaFn(1 + 1 / k); // среднее = 1
      const xs = [], sExp = [], sW = [], sSample = [];
      const N = 4000, sample = [];
      for (let i = 0; i < N; i++) sample.push(scale * Math.pow(-Math.log(1 - rng()), 1 / k));
      sample.sort((p, q) => p - q);
      const L = (v) => Math.log10(Math.max(v, 1e-5));
      for (let x = 0; x <= 6.001; x += 0.1) {
        xs.push(x); sExp.push(L(Math.exp(-x))); sW.push(L(Math.exp(-Math.pow(x / scale, k))));
        let lo = 0, hi = N; while (lo < hi) { const mid = (lo + hi) >> 1; if (sample[mid] <= x) lo = mid + 1; else hi = mid; }
        sSample.push(L((N - lo) / N));
      }
      Course.plot.line(c1, { title: 'Интервалы между ордерами (среднее = 1): доля интервалов длиннее x, log10', xlabel: 'x, в долях среднего интервала', ylabel: 'log10 P(τ>x)', ymin: -4, ymax: 0, series: [
        { x: xs, y: sExp, label: 'экспонента (Пуассон)' }, { x: xs, y: sW, label: 'Вейбулл k=' + Course.fmt.n(k, 2) }, { x: xs, y: sSample, label: 'выборка из Вейбулла', dash: [4, 3] }] });
      // размеры
      const vs = [], pw = [], ex = [], pw2 = [];
      const m = (Math.pow(2, 1 / mu) - 1) / Math.LN2; // экспонента с той же медианой
      for (let lv = 0; lv <= 2.0001; lv += 0.04) {
        const v = Math.pow(10, lv);
        vs.push(lv); pw.push(-mu * lv); ex.push(L(Math.exp(-(v - 1) / m)));
      }
      Course.plot.line(c2, { title: 'Размеры ордеров: хвост P(V>v), v в долях минимального, log10–log10', xlabel: 'log10 v', ylabel: 'log10 P(V>v)', ymin: -4, ymax: 0, series: [
        { x: vs, y: pw, label: 'степенной хвост, 1+μ=' + Course.fmt.n(a, 2) }, { x: vs, y: ex, label: 'экспонента с той же медианой' }] });
      const kk = 0.1, shortExp = 1 - Math.exp(-kk), shortW = 1 - Math.exp(-Math.pow(kk / scale, k));
      out.innerHTML = 'Доля «очень коротких» интервалов (короче 0,1 среднего): экспонента <b>' + Course.fmt.pct(shortExp, 1) + '</b>, Вейбулл <b>' + Course.fmt.pct(shortW, 1) + '</b>. Доля интервалов длиннее 4 средних: экспонента <b>' + Course.fmt.pct(Math.exp(-4), 2) + '</b>, Вейбулл <b>' + Course.fmt.pct(Math.exp(-Math.pow(4 / scale, k)), 2) + '</b>. На уровне v=100: степенной хвост <b>' + Course.fmt.n(Math.pow(100, -mu) * 100, 3) + '%</b> заявок, «медианная» экспонента — практически 0.';
    }
    draw();
  }

  /* ======================= ВИДЖЕТ 3 (урок 3): симулятор zero-intelligence ======================= */
  function widgetZI(root) {
    const Course = C();
    root.innerHTML = '';
    let seed = 1;
    const sl = Course.ui.slider(root, { label: 'λ — интенсивность лимитных ордеров на уровень (на сторону)', min: 0.1, max: 3, step: 0.05, value: 0.6, onInput: run });
    const sm = Course.ui.slider(root, { label: 'μ — интенсивность рыночных ордеров (на сторону)', min: 0.1, max: 3, step: 0.05, value: 1, onInput: run });
    const st = Course.ui.slider(root, { label: 'θ — интенсивность отмены (на единицу объёма)', min: 0.01, max: 1, step: 0.01, value: 0.15, onInput: run });
    const sK = Course.ui.slider(root, { label: 'K — сколько тиков от противоположной котировки доступны для лимитных', min: 1, max: 10, step: 1, value: 5, fmt: (v) => String(v), onInput: run });
    const sE = Course.ui.slider(root, { label: 'Ширина размещения ℓ (малое ℓ — заявки прижаты к котировкам; 0 — равномерно)', min: 0, max: 6, step: 0.5, value: 0, fmt: (v) => (+v === 0 ? 'равномерно' : Course.fmt.n(+v, 1)), onInput: run });
    Course.ui.button(root, 'Новая реализация', () => { seed++; run(); }, true);
    const c1 = Course.ui.canvas(root, 560, 250), c2 = Course.ui.canvas(root, 560, 200), c3 = Course.ui.canvas(root, 560, 230);
    const out = Course.ui.output(root);
    function run() {
      const rng = Course.rand.seeded(seed * 1013 + 7);
      const r = simZI({ lam: sl.get(), mu: sm.get(), theta: st.get(), K: sK.get(), ell: sE.get() }, rng, 6000);
      const mid = r.bid.map((b, i) => (b + r.ask[i]) / 2);
      Course.plot.line(c1, { title: 'Лучшие bid, ask и mid (в тиках от старта) по номеру события', xlabel: 'номер события', ylabel: 'тики', series: [
        { x: r.ev, y: r.bid, label: 'bid' }, { x: r.ev, y: r.ask, label: 'ask' }, { x: r.ev, y: mid, label: 'mid', dash: [4, 3] }] });
      Course.plot.line(c2, { title: 'Спред (тики) по номеру события', xlabel: 'номер события', ylabel: 'спред', ymin: 0, series: [{ x: r.ev, y: r.spread, label: 'спред' }] });
      Course.plot.bars(c3, { title: 'Средний объём на уровне (0 — лучшая котировка), единицы', labels: ['0', '1', '2', '3', '4', '5', '6', '7'], values: r.profile, ylabel: 'объём' });
      let imax = 0; r.profile.forEach((v, i) => { if (v > r.profile[imax]) imax = i; });
      out.innerHTML = 'Средний спред (по времени): <b>' + Course.fmt.n(r.meanSpread, 2) + '</b> тика · итоговый сдвиг mid: <b>' + Course.fmt.n(r.finalMid, 1) + '</b> тиков · максимум среднего объёма на уровне <b>' + imax + '</b> от лучшей котировки · объём на лучшей котировке: <b>' + Course.fmt.n(r.profile[0], 2) + '</b>. Заявки единичные, потоки независимы — это игрушка «нулевого интеллекта», а не эмпирическая модель; время в условных единицах.';
    }
    run();
  }

  /* ======================= ВИДЖЕТ 4 (урок 4): дисбаланс ======================= */
  function widgetImbalance(root) {
    const Course = C();
    root.innerHTML = '';
    const sb = Course.ui.slider(root, { label: 'Объём на лучшей покупке (bid), лоты', min: 1, max: 30, step: 1, value: 8, fmt: (v) => String(v), onInput: draw });
    const sa = Course.ui.slider(root, { label: 'Объём на лучшей продаже (ask), лоты', min: 1, max: 30, step: 1, value: 3, fmt: (v) => String(v), onInput: draw });
    const sm = Course.ui.slider(root, { label: 'μ — рыночные ордера (на сторону)', min: 0.2, max: 3, step: 0.1, value: 1, onInput: draw });
    const sl = Course.ui.slider(root, { label: 'λ — лимитные ордера, пополняющие лучшую котировку (на сторону)', min: 0, max: 3, step: 0.1, value: 0, onInput: draw });
    const st = Course.ui.slider(root, { label: 'θ — отмены (на единицу объёма)', min: 0, max: 1, step: 0.02, value: 0, fmt: (v) => Course.fmt.n(+v, 2), onInput: draw });
    const cv = Course.ui.canvas(root, 560, 280);
    const out = Course.ui.output(root);
    function draw() {
      const b = sb.get(), a = sa.get(), mu = sm.get(), lam = sl.get(), th = st.get();
      const rng = Course.rand.seeded(2024);
      const imb = (b - a) / (b + a), lnr = Math.log(b / a);
      const here = pUpSim(a, b, mu, lam, th, rng, 3000);
      const N = Math.min(40, a + b), xs = [], sim = [], ex = [];
      for (let bb = 1; bb < N; bb++) {
        const aa = N - bb;
        xs.push((bb - aa) / N);
        ex.push(pUpExact(aa, bb));
        sim.push(pUpSim(aa, bb, mu, lam, th, rng, 500).up);
      }
      Course.plot.line(cv, { title: 'P(следующий сдвиг mid вверх) при суммарном объёме ' + N + ', от дисбаланса (bid−ask)/(bid+ask)', xlabel: 'дисбаланс I', ylabel: 'вероятность', ymin: 0, ymax: 1, series: [
        { x: xs, y: ex, label: 'только рыночные ордера (λ=θ=0), точно' }, { x: xs, y: sim, label: 'с текущими λ, θ (симуляция)', dash: [4, 3] }] });
      const exact = pUpExact(a, b);
      out.innerHTML = 'Дисбаланс I = <b>' + Course.fmt.n(imb, 3) + '</b>; ln(bid/ask) = <b>' + Course.fmt.n(lnr, 3) + '</b>. Вероятность, что ask опустеет раньше bid (mid вверх): точная при λ=θ=0 — <b>' + Course.fmt.pct(exact, 1) + '</b>; в симуляции с текущими параметрами — вверх <b>' + Course.fmt.pct(here.up, 1) + '</b>, вниз <b>' + Course.fmt.pct(here.down, 1) + '</b>, не определилось за 4000 событий <b>' + Course.fmt.pct(here.none, 1) + '</b>. Это учебная игрушка: реальные вероятности зависят от данных и намного скромнее.';
    }
    draw();
  }

  /* ======================= ВИДЖЕТ 5 (урок 5): позиция в очереди ======================= */
  function widgetQueue(root) {
    const Course = C();
    root.innerHTML = '';
    const sn = Course.ui.slider(root, { label: 'Позиция: сколько лотов впереди вас в очереди', min: 0, max: 60, step: 1, value: 30, fmt: (v) => String(v), onInput: draw });
    const sm = Course.ui.slider(root, { label: 'Рыночные ордера: интенсивность (штук за единицу времени)', min: 0.1, max: 3, step: 0.1, value: 0.3, onInput: draw });
    const ss = Course.ui.slider(root, { label: 'Средний размер рыночного ордера (лоты, геометрическое распределение)', min: 1, max: 20, step: 1, value: 5, fmt: (v) => String(v), onInput: draw });
    const st = Course.ui.slider(root, { label: 'θ — отмены (на лот впереди вас, за единицу времени)', min: 0, max: 0.3, step: 0.01, value: 0.02, fmt: (v) => Course.fmt.n(+v, 2), onInput: draw });
    const sT = Course.ui.slider(root, { label: 'Горизонт T (единицы времени)', min: 1, max: 100, step: 1, value: 30, fmt: (v) => String(v), onInput: draw });
    const c1 = Course.ui.canvas(root, 560, 250), c2 = Course.ui.canvas(root, 560, 250);
    const out = Course.ui.output(root);
    function draw() {
      const n0 = sn.get(), m = sm.get(), s = ss.get(), th = st.get(), T = sT.get();
      const rng = Course.rand.seeded(77);
      const tr = 1500;
      const rS = fillSim(n0, m, s, th, T, tr, rng, false), rU = fillSim(n0, m, s, th, T, tr, rng, true);
      const ts = [], fS = [], fU = [];
      const sortS = rS.times.slice().sort((x, y) => x - y), sortU = rU.times.slice().sort((x, y) => x - y);
      const cnt = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= t) lo = mid + 1; else hi = mid; } return lo / tr; };
      for (let i = 0; i <= 50; i++) { const t = (T * i) / 50; ts.push(t); fS.push(cnt(sortS, t)); fU.push(cnt(sortU, t)); }
      Course.plot.line(c1, { title: 'Вероятность исполнения заявки к моменту t (позиция ' + n0 + ')', xlabel: 't', ylabel: 'вероятность', ymin: 0, ymax: 1, series: [
        { x: ts, y: fS, label: 'ордера случайного размера (ср. ' + s + ')' }, { x: ts, y: fU, label: 'единичные ордера, тот же объём потока', dash: [4, 3] }] });
      const ps = [], pS = [], pU = [];
      for (let n = 0; n <= 60; n += 5) { ps.push(n); pS.push(fillSim(n, m, s, th, T, 400, rng, false).p); pU.push(fillSim(n, m, s, th, T, 400, rng, true).p); }
      Course.plot.line(c2, { title: 'Вероятность исполнения за T=' + T + ' в зависимости от позиции в очереди', xlabel: 'лотов впереди', ylabel: 'вероятность', ymin: 0, ymax: 1, series: [
        { x: ps, y: pS, label: 'случайные размеры' }, { x: ps, y: pU, label: 'единичные', dash: [4, 3] }] });
      const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
      out.innerHTML = 'Ваша заявка стоит за <b>' + n0 + '</b> лотами. Вероятность исполнения за T: со случайными размерами <b>' + Course.fmt.pct(rS.p, 1) + '</b>, при единичных ордерах того же объёма потока <b>' + Course.fmt.pct(rU.p, 1) + '</b>. Медианное время до исполнения (среди исполненных): <b>' + Course.fmt.n(med(rS.times), 1) + '</b> и <b>' + Course.fmt.n(med(rU.times), 1) + '</b>. Новые лимитные ордера встают позади вас и на вашу очередь не влияют. Модель учебная: не учитывает смену цены и отмену вашей собственной заявки.';
    }
    draw();
  }

  /* ======================= регистрация модуля ======================= */
  Course.register({
    id: 'm02',
    order: 2,
    title: 'Книга лимитных заявок',
    summary: 'Как устроен стакан: уровни, очереди, правило цена-время, стилизованные факты потока ордеров, модели нулевого интеллекта, дисбаланс и позиция в очереди.',
    level: 'средний',
    time: '~2,5 ч',
    lessons: [
      /* ---------------------------------------------------------- урок 1 */
      {
        id: 'm02-l1',
        title: 'Анатомия книги: уровни, очереди, матчинг',
        minutes: 30,
        html: `
<p>Почти все современные электронные рынки акций и фьючерсов работают как <b>рынки, управляемые заявками</b> (order-driven market): нет единого дилера, который называет цену, есть общая <b>книга лимитных заявок</b> (limit order book, LOB, «стакан»), куда все участники выставляют желания купить и продать. Чтобы понимать спред, влияние на цену, маркет-мейкинг и манипуляции (модули 3–8), нужно сначала точно знать, из чего сделана эта книга и по каким правилам исполняются заявки.</p>

<h2>Три типа ордеров</h2>
<p>Монография Abergel et al. [24] сознательно упрощает мир до трёх типов событий:</p>
<ul>
<li><b>лимитный ордер</b> (limit order): «куплю/продам не более чем столько-то акций по цене не хуже указанной»; если он сразу не исполняется, ждёт в книге;</li>
<li><b>рыночный ордер</b> (market order): «купи/продай прямо сейчас по лучшей доступной цене»;</li>
<li><b>отмена</b> (cancellation): снятие ранее выставленного лимитного ордера.</li>
</ul>
<p>Реальные площадки знают намного больше типов: GTD, FOK, stop, pegged, iceberg и другие (каталог дан в приложении A книги [24]), но для понимания механики хватает трёх. Авторы называют тех, кто выставляет лимитные ордера, поставщиками ликвидности (liquidity providers), а тех, кто посылает рыночные, — «потребителями» (liquidity takers), но предупреждают: после дерегуляций 2005–2007 гг. чистых провайдеров и потребителей не осталось, это лишь удобное сокращение.</p>

<h2>Стакан: уровни, bid, ask, спред, mid</h2>
<p>Цены дискретны: они кратны <b>тику</b> (tick size) — минимальному шагу цены. Лимитные ордера с одной и той же ценой образуют <b>ценовой уровень</b> (limit); внутри уровня они стоят в очереди. Лучшая (наибольшая) цена покупки — <b>bid</b> $P_B$, лучшая (наименьшая) цена продажи — <b>ask</b> $P_A$. Тогда</p>
$$S = P_A - P_B,\\qquad P = \\frac{P_A + P_B}{2},$$
<p>где $S$ — <b>спред</b> (bid-ask spread), $P$ — <b>средняя цена</b> (mid-price). <b>Глубина</b> (depth) — суммарный объём заявок на выбранных уровнях. У Харриса [33] есть полезная интуиция: рыночная покупка и следующая за ней продажа «стоят» участнику один спред, то есть примерно полспреда за сделку, если mid считать справедливой ценой.</p>

<h2>Правило цена-время</h2>
<p>Книга разрешает конфликты между заявками правилом <b>приоритета цена-время</b> (price-time priority, FIFO): сначала исполняются заявки с лучшей ценой; среди заявок с одной ценой — та, что пришла раньше. Именно поэтому на уровне возникает <b>очередь</b>, и место в ней имеет ценность. На некоторых площадках применяют иные правила, например пропорциональное распределение (pro rata) на CME [24]. Харрис [33] добавляет, что ценовой приоритет «самоподдерживающийся»: чтобы обогнать очередь, нужно улучшить цену, то есть заплатить хотя бы тик.</p>

<div class="example"><b>Учебный пример.</b> Пусть bid = 100, ask = 101 (тик 1). Лучшие продажи: на 101 стоят заявки A (3 лота, раньше) и B (2 лота), на 102 — заявка C (5 лотов). Приходит рыночная покупка на 6 лотов. Она забирает A целиком (3 по 101), B целиком (2 по 101) и 1 лот у C по 102. Средняя цена исполнения: $(5\\cdot101+1\\cdot102)/6 = 101{,}167$ — хуже лучшей котировки: это и есть простейшее «влияние на цену» (модуль 4). После сделки ask = 102 (остаток C — 4 лота), спред вырос с 1 до 2 тиков, mid сдвинулся с $100{,}5$ до $101$ без всякой «новой информации».</div>

<h2>Что делает сделку: «взять» или «дать» ликвидность</h2>
<p>Лимитный ордер, цена которого не пересекает противоположную сторону, встаёт в очередь (<i>пассивный</i>). Лимитный ордер на покупку с ценой не ниже текущего ask «пересекает спред» и исполняется как рыночный (его называют marketable). Всё, что осталось неисполненным, встаёт в книгу. Поэтому «лимитный» и «рыночный» — различие скорее в намерении и защите по цене, чем в механике.</p>

<h2>Интерактив: живая книга</h2>
<p>Ниже — настоящий движок с приоритетом цена-время. Отправьте свою лимитную заявку и посмотрите, где она встанет в очереди; потом пошлите рыночную встречную, нажмите на любую заявку, чтобы отменить её, или запустите «чужие» события. Попробуйте: (1) купить 8 лотов рынком и найти среднюю цену; (2) поставить лимитную покупку на 101 при ask 101 — она исполнится как рыночная; (3) поставить лимитную покупку на 100 и дождаться, пока очередь перед вами «рассосётся».</p>
<div data-widget="liveBook" data-title="Живая книга: лимитные, рыночные ордера и отмены"></div>

<div class="callout key"><span class="t">Главное</span>Книга устроена в два яруса: заявки упорядочены по уровням цен, а внутри каждого уровня — по времени прихода. $S=P_A-P_B$, $P=(P_A+P_B)/2$. Рыночный ордер «съедает» книгу слой за слоем, поэтому средняя цена исполнения хуже лучшей котировки, а спред и mid меняются сами от одной сделки. Положение заявки в очереди — отдельный актив (урок 5).</div>

<div class="callout warn"><span class="t">Осторожно</span>Mid — расчётная величина, по ней нельзя ни купить, ни продать. Если на одной из сторон нет заявок, mid не определён. Приоритет цена-время — правило не всех площадок; детали (скрытые заявки, iceberg, auction-фазы) зависят от биржи и выходят за рамки трёх базовых ордеров.</div>
`,
        widgets: { liveBook: widgetLiveBook },
        quiz: [
          { q: 'В книге bid=100, ask=101. Приходит лимитная заявка на покупку по цене 102. Что произойдёт?', options: ['Она встанет в книгу на уровне 102 выше ask и станет новым bid', 'Она исполнится по ценам встречных заявок (начиная с 101), остаток при необходимости встанет в книгу', 'Она будет отклонена биржей'], answer: 1, explain: 'Покупка с ценой не ниже лучшей продажи пересекает спред и исполняется как рыночная против встречных заявок по их ценам; остаток (если он есть) ставится в книгу.' },
          { q: 'Две заявки на покупку по 100: X пришла в 10:00:01, Y — в 10:00:05, но Y крупнее. Рыночная продажа на 1 лот. Кто исполнится при правиле цена-время?', options: ['Y, потому что объём больше', 'X, потому что она раньше', 'Обе пополам'], answer: 1, explain: 'При FIFO размер не даёт преимущества, решает время постановки. Пропорциональное распределение (pro rata) — другая схема, она встречается, например, на CME.' },
          { q: 'Рыночная покупка забрала весь лучший ask, и следующий уровень на 2 тика выше. Что случилось со спредом и mid?', options: ['Спред вырос, mid вырос', 'Спред не изменился, mid вырос', 'Спред уменьшился'], answer: 0, explain: 'Лучшая продажа сместилась вверх, bid остался: спред растёт, mid смещается вверх — без какой-либо новости, только из-за исчерпания уровня.' },
          { q: 'Почему mid-price нельзя считать ценой, по которой можно сделать сделку?', options: ['Потому что биржа его не публикует', 'Потому что покупают по ask, а продают по bid; mid лежит между ними', 'Потому что он всегда округляется до тика'], answer: 1, explain: 'Сделки идут по bid или ask; mid лежит посередине и сам по себе недоступен для немедленного исполнения.' }
        ],
        sources: [
          { title: '[24] Abergel et al., Limit Order Books', where: 'гл. 1 (определения, три типа ордеров, спред и mid), приложение A (типы ордеров)', note: 'строки ~358–488 и 7370–7428 в work/text/24.txt' },
          { title: '[33] Harris, Trading and Exchanges', where: 'гл. 4 (ордера, спред, price improvement), гл. 6 (правила приоритета, tick size)', note: 'данные и институты начала 2000-х' }
        ]
      },

      /* ---------------------------------------------------------- урок 2 */
      {
        id: 'm02-l2',
        title: 'Стилизованные факты потока ордеров и формы книги',
        minutes: 30,
        html: `
<p>Прежде чем строить модели книги, нужно знать, что именно они должны воспроизводить. Эмпирики называют <b>стилизованными фактами</b> (stylized facts) устойчивые закономерности, которые повторяются на разных активах и площадках. Этот урок опирается почти целиком на обзорную главу 2 и главу 4 книги Abergel et al. [24] — данные там по акциям CAC 40 (в основном BNP Paribas, 2007–2008) и по другим активам Euronext. Цифры устарели и зависят от рынка, но качественные выводы живучи.</p>

<h2>Что известно о потоке ордеров</h2>
<h3>1. Интервалы между ордерами не экспоненциальны</h3>
<p>Если бы ордера приходили как пуассоновский процесс, интервалы между ними были бы экспоненциальными. По данным [24] экспоненциальная подгонка плоха, а <b>распределение Вейбулла</b> (Weibull) — потенциально очень хорошая. Это значит: много очень коротких интервалов, а также длинные «затишья» — поток нерегулярен и приходит «пачками». Распределение числа сделок за интервал в [24] хорошо описывают и логнормальным, и гамма-распределением, но ни одно не подходит по-настоящему.</p>
<p>Причём ордера разных типов зависят друг от друга: после рыночного ордера следующий лимитный приходит в среднем в 1,3–2,6 раза быстрее, чем обычный интервал между событиями (в зависимости от акции); на фьючерсе FTSE около 40% всех интервалов короче 50 мс, а между рыночным и следующим лимитным — почти 70%. Авторы трактуют это как свидетельство маркет-мейкинга: поток рыночных ордеров отслеживается и порождает реакцию.</p>

<h3>2. Размеры ордеров: тяжёлые хвосты и «круглые» числа</h3>
<p>Распределение размеров сложно, часто его приближают степенным законом с показателем $1+\\mu$ в плотности: примерно $2{,}3$–$2{,}7$ для рыночных и около $2{,}0$ для лимитных ордеров (Gopikrishnan et al. и другие, цитируются в [24]); на данных самих авторов получено около $2{,}7$ и около $2{,}1$, причём для лимитных ордеров степенной закон подходит хуже и параметры различаются по акциям. Кроме того, размеры «круглые»: заметные скопления около 100, 1000 акций. Консенсуса авторы не видят: распределение, скорее всего, сильно зависит от инструмента и рынка.</p>

<h3>3. Куда ставят лимитные ордера</h3>
<p>Расстояние от лучшей котировки до новой заявки имеет максимум в нуле (прямо на лучшей цене) и тяжёлые хвосты; распределение асимметрично: «внутрь спреда» заходит меньше, потому что глубина этой стороны ограничена самим спредом [24].</p>

<h3>4. Время жизни и отмены</h3>
<p>Времена жизни лимитных ордеров тоже подчиняются степенному закону: в цитируемых в [24] работах показатель плотности около $2{,}1$ для отменённых и около $1{,}5$ для исполненных ордеров, а на данных самих авторов — $1{,}3$–$1{,}6$ для тех и других; экспоненциальная гипотеза (пуассоновские отмены) на реальных данных не подтверждается. Доли отмен среди всех ордеров в использованном конспекте источника не приводятся, поэтому мы их не называем.</p>

<h3>5. Средняя форма книги</h3>
<p>Вопреки ожиданиям, средний объём заявок максимален <b>не на лучших котировках, а несколько дальше от них</b> («горб», hump-shaped book); хвост отражает статистику размещения ордеров. Средний зазор между соседними заполненными уровнями — порядка 1–2,5 тика, а средний спред примерно вдвое больше этого зазора (по пяти акциям в [24]). Для фьючерса на Euro Stoxx 50 (2016) Lu и Abergel [29] отмечают, что тик «крупный» относительно цены: спред почти всегда один тик.</p>

<h3>6. Время в стакане и внутридневной ритм</h3>
<p>Активность неравномерна: число ордеров за 5 минут в течение дня меняется примерно в 10 раз, внутридневная активность имеет U-образную форму (много событий на открытии и закрытии). Из-за этого «время» в моделях выбирают по-разному: <b>event time</b> (одно событие = один шаг), <b>aggregated time</b> и <b>физическое</b> (календарное) время. Спред в календарном времени чаще находится в наиболее вероятных значениях, чем в event-time: чем шире спред, тем быстрее он схлопывается; среднее ожидание следующего события — 320 мс при узком спреде и 200 мс при широком [24].</p>

<h2>Числовой пример: что значит «Вейбулл вместо экспоненты»</h2>
<div class="example"><b>Учебный пример.</b> Пусть средний интервал между ордерами равен 1 (условная единица). Для экспоненциального потока доля интервалов короче $0{,}1$ равна $1-e^{-0{,}1}\\approx 9{,}5\\%$. У распределения Вейбулла с параметром формы $k$ и средним 1 функция выживания $P(\\tau>x)=\\exp\\!\\big(-(x/c)^k\\big)$, где $c=1/\\Gamma(1+1/k)$. При $k=0{,}6$ получаем $\\Gamma(1+1/k)\\approx1{,}50$, $c\\approx0{,}665$, и доля интервалов короче $0{,}1$ равна $1-\\exp(-(0{,}1/0{,}665)^{0{,}6})\\approx 1-e^{-0{,}32}\\approx 27\\%$ — почти втрое больше, чем у экспоненты: это и есть «пачки» ордеров.</div>

<h2>Интерактив: сравнение гипотез</h2>
<p>Двигайте $k$ и показатель степени. Это <b>иллюстрация на синтетических данных</b>: мы рисуем теоретические кривые и выборку из распределения Вейбулла, а не реальные данные биржи.</p>
<div data-widget="facts" data-title="Иллюстрация: Вейбулл против экспоненты, степенной хвост размеров"></div>

<div class="callout key"><span class="t">Главное</span>Реальный поток ордеров: неэкспоненциальные интервалы (лучше Вейбулл), степенные хвосты размеров и времён жизни, максимум размещения на лучшей котировке, «горб» в средней форме книги, U-образная активность, реакция лимитных ордеров на рыночные. Пуассоновская модель (урок 3) воспроизводит лишь часть.</div>

<div class="callout warn"><span class="t">Осторожно</span>Данные [24] — французские акции 2007–2008 гг., реконструкция событий книги из файлов событий и сделок (приложение B книги). Показатели степеней различаются между работами и активами; не переносите их на другой рынок без проверки. В нашем конспекте нет числа «доли отмен», поэтому мы его не придумываем.</div>
`,
        widgets: { facts: widgetFacts },
        quiz: [
          { q: 'Какой вывод следует из того, что интервалы между ордерами хорошо описываются распределением Вейбулла, а не экспоненциальным?', options: ['Поток ордеров не пуассоновский: бывают пачки коротких интервалов и длинные паузы', 'Все ордера приходят строго через равные промежутки', 'Размеры ордеров распределены нормально'], answer: 0, explain: 'Экспоненциальные интервалы — признак пуассоновского потока. Подгонка Вейбулла (и нерегулярность) говорит о кластеризации во времени.' },
          { q: 'Где в среднем находится максимум объёма в усреднённой книге?', options: ['Строго на лучшей котировке', 'Несколько уровней дальше от лучших цен ("горб")', 'Равномерно на всех уровнях'], answer: 1, explain: 'Усреднённая форма книги по данным [24] имеет максимум вдали от котировок: рядом с ними заявки быстро исполняются или снимаются.' },
          { q: 'Что означает показатель степени 1+μ ≈ 2,7 для рыночных ордеров?', options: ['Средний размер ордера равен 2,7 лота', 'Плотность размеров убывает как степень x в минус 2,7: хвост тяжелее, чем у экспоненты', 'Рыночные ордера приходят 2,7 раза в секунду'], answer: 1, explain: 'Это показатель степенного закона для плотности: P(V>v) убывает как v^(-μ), то есть крупные ордера встречаются заметно чаще, чем при экспоненциальном убывании.' },
          { q: 'Почему данные 2007–2008 гг. по акциям CAC 40 нельзя напрямую переносить на сегодняшний рынок?', options: ['Потому что с тех пор книги заявок не существуют', 'Потому что значения параметров зависят от рынка, инструмента и периода; HFT и структура площадок изменились', 'Потому что в источнике нет формул'], answer: 1, explain: 'Показатели (степени, времена, зазоры) оценены на конкретных активах и годах; авторы сами отмечают зависимость от активов.' }
        ],
        sources: [
          { title: '[24] Abergel et al., Limit Order Books', where: 'гл. 2 (интервалы 2.2, объёмы 2.3, размещение 2.4, отмены 2.5, форма книги 2.6), гл. 4.2–4.3 (физическое время, маркет-мейкинг в данных)', note: 'строки ~607–916, 1400–1515 в work/text/24.txt' },
          { title: '[29] Lu, Abergel (2018)', where: 'описание данных (Euro Stoxx 50, крупный тик)', note: 'спред ≈1 тик, 2016 г.' }
        ]
      },

      /* ---------------------------------------------------------- урок 3 */
      {
        id: 'm02-l3',
        title: 'Модели нулевого интеллекта (zero-intelligence)',
        minutes: 35,
        html: `
<p>Можно ли объяснить форму книги и поведение спреда, вообще не предполагая, что участники «умны»? Модели <b>нулевого интеллекта</b> (zero-intelligence) отвечают: да, во многом. Ордера приходят случайно и независимо, как в экспериментах Stigler (1964), Garman (1976), Gode–Sunder (1993) — и уже из этого вырастает книга с реалистичной структурой [24]. Это базовая «нулевая гипотеза» микроструктуры: любую сложную модель нужно сравнивать с таким простым эталоном.</p>

<div class="callout"><span class="t">Об обозначениях</span>Греческие обозначения интенсивностей в этом курсе <b>учебные</b>, как и в источнике [24]: $\\lambda$ — лимитные ордера, $\\mu$ — рыночные, $\\theta$ — отмены. В самой монографии используются похожие символы с индексами и верхними знаками (например, $\\lambda^L_i$, $\\lambda^M$, $\\lambda^C$, стороны $\\pm$, уровень $i$); эти обозначения сверены с PDF.</div>

<h2>Идея</h2>
<p>Вся динамика книги — три независимых «потока» точечных событий с постоянными интенсивностями (<b>пуассоновские потоки</b>): лимитные ордера $L$, рыночные $M$ и отмены $C$ — на покупку и продажу. Размеры ордеров единичны (или кратны лоту $q$). Лимитные ордера ставятся на $i$ тиков от противоположной лучшей котировки, где $i=1,\\dots,K$ — «движущееся окно» книги; вне окна объём постоянен, чтобы книга никогда не пустела [24]. <b>Интенсивность отмен пропорциональна объёму</b> на уровне: каждый стоящий ордер независимо снимается с темпом $\\theta$.</p>

<h2>Простейший пример: «рынок Башелье»</h2>
<p>В [24] идеальный маркет-мейкер после каждого рыночного ордера немедленно восстанавливает спред в 1 тик: на той же стороне — с вероятностью $u$, на противоположной — с вероятностью $1-u$. Если рыночные покупки и продажи — независимые пуассоновские потоки с интенсивностями $\\lambda^+$ и $\\lambda^-$, динамика mid-цены такова: каждое событие сдвигает её на тик с вероятностью $u$ (и не сдвигает с вероятностью $1-u$). При малом тике получаем винеровский процесс со сносом и параметрами

$$\\sigma = \\Delta P\\sqrt{(\\lambda^+ + \\lambda^-)\\,u},\\qquad \\nu = \\Delta P\\,(\\lambda^+ - \\lambda^-)\\,u,$$

где $\\Delta P$ — тик [24, п. 6.1.1] (снос там обозначен $\\mu$; здесь $\\nu$, чтобы не путать с интенсивностью рыночных ордеров). Смысл: случайный поток рыночных ордеров сам даёт броуновскую mid-цену, волатильность растёт с частотой ордеров и вероятностью $u$.</p>

<h2>Очередь на одном уровне: M/M/1 с уходом</h2>
<p>Гл. 7 [24] рассматривает одну сторону книги. Лимитные ордера на уровень $i$ приходят с интенсивностью $\\lambda_i$, рыночные (покупка) — с $\\mu$, каждый ордер снимается независимо с темпом $\\theta$. Кумулятивная глубина $A_k$ до уровня $k$ — процесс рождения и гибели: рождение $\\Lambda_k=\\sum_{i\\le k}\\lambda_i$, гибель в состоянии $n$ равна $\\mu+n\\theta$ (это очередь типа $M/M/1+M$). Стационарное распределение при $\\theta>0$ существует и равно</p>
$$\\pi_k(n)\\;\\propto\\;\\prod_{j=1}^{n}\\frac{\\Lambda_k}{\\mu+j\\theta}.$$
<p>Отсюда выводится средняя форма книги — без подгонки параметров. Нашему уровню достаточно интуиции: у лучшей котировки объём «съедается» рыночными ордерами и отменами, далеко от неё не успевают приходить заявки.</p>
<div class="example"><b>Учебный пример</b> (считаем по формуле; параметры выбраны произвольно). Пусть $\\lambda_i=1$ на каждом уровне, $\\mu=1$, $\\theta=0{,}5$. Средняя кумулятивная глубина $E[A_k]$ при $k=1,2,3,4,5$ равна примерно $0{,}91;\\ 2{,}32;\\ 4{,}09;\\ 6{,}02;\\ 8{,}01$. Средний объём на $k$-м уровне — разности: $0{,}91;\\ 1{,}41;\\ 1{,}77;\\ 1{,}93;\\ 1{,}98$ — растёт к пределу $\\lambda/\\theta=2$: у котировки ордера «съедают» рыночные заявки, далеко от неё работают только отмены. Если же интенсивность размещения $\\lambda_i$ убывает с расстоянием (как в данных, где максимум размещения прямо у котировки), объём падает на дальних уровнях, и появляется <b>горб</b>. В [24] подчёркивается, что горб воспроизводится без специальной подгонки.</div>

<h2>Что модели нулевого интеллекта объясняют</h2>
<ul>
<li>положительный спред и его случайное «дыхание»;</li>
<li>mid-цену, близкую к случайному блужданию, с волатильностью из частоты рыночных ордеров;</li>
<li>горб в усреднённой форме книги — как следствие баланса прихода, исполнения и отмен.</li>
</ul>
<h2>Чего в них нет</h2>
<ul>
<li>неэкспоненциальных интервалов и «пачек» (урок 2): поток ордеров самовозбуждающийся — это описывают <b>процессы Хокса</b> (Hawkes processes), которым посвящён модуль 7; формула интенсивности в [24] — $\\lambda_m(t)=\\lambda^0_m+\\sum_j\\int_0^t\\alpha_{mj}e^{-\\beta_{mj}(t-s)}dN_j(s)$, подробности — в модуле 7;</li>
<li>тяжёлых хвостов размеров и времён жизни;</li>
<li>стратегического поведения: информированные трейдеры, маркет-мейкеры, отмены «по информации»; авторы [24] прямо отмечают, что zero-intelligence не учитывает стратегий;</li>
<li>зависимости интенсивностей от состояния очередей (урок 5).</li>
</ul>

<h2>Интерактив: симулятор книги</h2>
<p>Двигайте $\\lambda$, $\\mu$, $\\theta$ и посмотрите, как меняются спред, mid и глубина. Это упрощённая версия модели из [24]: единичные ордера, постоянное окно размещения, граничное условие «книга не пустеет». Время условное, числа не калиброваны под рынок. Попробуйте: (1) увеличить $\\mu$ — спред и волатильность растут; (2) увеличить $\\lambda$ — спред сжимается, глубина растёт; (3) уменьшить «ширину размещения» $\\ell$ — объём собирается у котировок.</p>
<div data-widget="zi" data-title="Симулятор zero-intelligence книги: λ, μ, θ"></div>

<div class="callout key"><span class="t">Главное</span>Три независимых пуассоновских потока (лимитные, рыночные, отмены с интенсивностью, пропорциональной объёму) уже дают положительный спред, случайное блуждание mid и «горб» книги. Это эталон: что не объясняется им — кластеризация, тяжёлые хвосты, стратегии — требует более сложных моделей (Hawkes — модуль 7, queue-reactive — урок 5).</div>

<div class="callout warn"><span class="t">Осторожно</span>«Объясняет форму книги» не значит «верна»: модель может воспроизвести один статистический факт и промахнуться по другим. Результаты в [24] получены в основном аналитически и в численных симуляциях, а не как строгая проверка на данных; наш виджет ещё проще.</div>
`,
        widgets: { zi: widgetZI },
        quiz: [
          { q: 'В модели нулевого интеллекта отмены происходят с интенсивностью, пропорциональной объёму на уровне. Что это значит для отдельного ордера?', options: ['Каждый стоящий ордер снимается независимо с одним и тем же темпом θ', 'Отмены приходят только в начале дня', 'Отмена зависит от цены сделки'], answer: 0, explain: 'Суммарная интенсивность отмен на уровне равна θ умножить на объём; каждый ордер «живёт» экспоненциальное время.' },
          { q: 'Что из перечисленного НЕ воспроизводится пуассоновской моделью с постоянными интенсивностями?', options: ['Положительный спред', 'Кластеризация ордеров во времени (интервалы короче, чем у экспоненты)', 'Случайное блуждание mid'], answer: 1, explain: 'Пуассоновские потоки имеют экспоненциальные интервалы, а в данных поток нерегулярный (урок 2); это вводит процессы Хокса (модуль 7).' },
          { q: 'В «рынке Башелье» при росте вероятности u (маркет-мейкер восстанавливает спред на стороне исполненного ордера) что происходит с волатильностью mid?', options: ['Не меняется', 'Растёт, потому что σ пропорциональна корню из u', 'Падает'], answer: 1, explain: 'σ = ΔP·sqrt((λ⁺+λ⁻)u): чем чаще рыночный ордер сдвигает mid, тем выше волатильность.' },
          { q: 'Зачем сравнивать сложные модели с zero-intelligence?', options: ['Потому что он точнее всего описывает реальные данные', 'Как эталон: видно, какую часть явлений объясняют сами случайные потоки, а какая требует «интеллекта» участников', 'Потому что в нём нет параметров'], answer: 1, explain: 'Простая модель показывает, что объясняется одним лишь случайным потоком, и тем самым выделяет задачи для более сложных моделей.' }
        ],
        sources: [
          { title: '[24] Abergel et al., Limit Order Books', where: 'гл. 5.2 (Stigler, Garman, Gode–Sunder), гл. 6 (6.1.1 рынок Башелье; 6.2 марковская модель с K уровнями), гл. 7.2 (очередь M/M/1+M, форма книги)', note: 'строки ~1945–2029, 2406–2870, 3346–3470' },
          { title: '[24] там же', where: 'гл. 8 (определение процесса Хокса, 8.1)', note: 'только упоминание; подробно — модуль 7' }
        ]
      },

      /* ---------------------------------------------------------- урок 4 */
      {
        id: 'm02-l4',
        title: 'Дисбаланс книги и краткосрочная предсказуемость цены',
        minutes: 30,
        html: `
<p>Если на покупку выставлено намного больше объёма, чем на продажу, кажется, что цена вот-вот пойдёт вверх. Эта интуиция лежит в основе индикатора <b>дисбаланса книги</b> (order book imbalance, OBI). Урок показывает, как его считать, почему он интуитивно работает и насколько осторожно надо относиться к реальным выводам.</p>

<h2>Как определяют дисбаланс</h2>
<p>В главе 10 [24] ликвидность на стороне bid берут как взвешенную сумму объёмов на пяти лучших уровнях, с положительными убывающими весами $w_i$ (дальние уровни менее важны), с учётом цены уровня:</p>
$$\\mathrm{Liq}_{bid}=\\sum_{i=1}^{5} w_i\\,|b_i|\\,P^B_i,\\quad \\mathrm{Liq}_{ask}=\\sum_{i=1}^{5} w_i\\,a_i\\,P^A_i,\\quad \\text{OBI}=\\ln\\frac{\\mathrm{Liq}_{bid}}{\\mathrm{Liq}_{ask}}.$$
<p>Если индикатор заметно больше нуля, на покупку доступно больше объёма, чем на продажу: мало желающих продавать, что, возможно, отражает консенсус о росте цены. Рядом авторы рассматривают прошлую доходность $\\ln(S_t/S_{t-\\Delta t})$ и «поток» $\\ln(Q_b/Q_s)$ (купленный и проданный объёмы за период). Для учебных целей мы используем упрощение — дисбаланс только на лучших уровнях:</p>
$$I=\\frac{b-a}{b+a}\\in[-1,1],$$
<p>где $b$, $a$ — объёмы на лучшем bid и лучшем ask. При $I>0$ перевес на стороне покупки.</p>

<h2>Почему дисбаланс «работает»: гонка очередей</h2>
<p>Mid-цена сдвигается вверх, когда очередь на лучшем ask опустошается (исполнена и снята), и вниз — когда опустошается очередь на лучшем bid. Опустошение происходит от рыночных ордеров и отмен; новые лимитные ордера её пополняют. Чем короче очередь, тем быстрее она закончится — это и есть источник предсказуемости.</p>
<p>Простейшая игрушка: пусть рыночные ордера на покупку и на продажу приходят с одинаковой интенсивностью $\\mu$, каждый съедает один лот, а лимитные ордера и отмены игнорируем. Очередь на ask из $a$ лотов опустеет раньше очереди на bid из $b$ лотов тогда и только тогда, когда среди первых $a+b-1$ рыночных ордеров не менее $a$ придётся на покупки. Значит</p>
$$P(\\text{mid вверх})=P\\big(\\mathrm{Bin}(a+b-1,\\tfrac12)\\ge a\\big).$$

<div class="example"><b>Учебный пример.</b> Пусть $b=8$, $a=2$ (дисбаланс $I=0{,}6$). Тогда $a+b-1=9$ и $P(\\text{вверх})=P(\\mathrm{Bin}(9,\\tfrac12)\\ge2)=1-\\frac{1+9}{512}\\approx98{,}0\\%$. Для $b=a=5$ получаем ровно $50\\%$. Эти цифры — свойство игрушки, а не рынка: в реальности сразу же приходят новые лимитные ордера и отмены, а игрок на другой стороне может отреагировать.</div>

<h2>Что показывают реальные данные [24]</h2>
<p>Авторы тестируют индикаторы на акциях EUROSTOXX 50 за 2013 г. (в конспекте — прежде всего пример Deutsche Telekom, 1-минутные доходности):</p>
<ul>
<li>индикаторы предсказывают знак будущей 1-минутной доходности; <b>дисбаланс книги — лучший из трёх предикторов</b> (out-of-sample); без издержек стратегия на нём даёт самую большую прибыль;</li>
<li>с издержками 0,5 б.п. прибыльной остаётся лишь стратегия на дисбалансе и лишь «marginally»;</li>
<li>при горизонтах 5 и 30 минут стратегии с издержками неприбыльны, предсказательная сила убывает с горизонтом;</li>
<li>вывод авторов: предсказуемость есть, но это не доказывает неэффективность рынка; за несколько минут цена подстраивается к информации в книге.</li>
</ul>
<p>Ещё одна оговорка: пример со стратегией «возврата к среднему» (51,67% успешных предсказаний у одной акции, 72,91% на 500 акциях) авторы считают нереалистичным, так как он посчитан in-sample. Это хороший антидот к «наивному бэктесту».</p>

<h2>Интерактив: дисбаланс и вероятность следующего сдвига</h2>
<p>Задайте объёмы bid и ask, интенсивности и отмены. Сплошная линия — точная формула игрушки (только рыночные ордера); пунктир — симуляция с вашими $\\lambda$ и $\\theta$. Обратите внимание: добавление лимитных ордеров и отмен «размывает» эффект, то есть связь вероятности с дисбалансом становится более плоской.</p>
<div data-widget="imbalance" data-title="Дисбаланс и вероятность следующего движения mid (игрушечная модель)"></div>

<div class="callout key"><span class="t">Главное</span>Дисбаланс — относительная нехватка объёма на одной стороне; он сигнализирует, какая очередь скорее опустеет. В [24] он оказался лучшим из простых предикторов, но прибыль после издержек (0,5 б.п.) едва положительна на 1 минуте и исчезает на 5–30 минутах. Игрушечная гонка очередей показывает механизм, но не величину эффекта.</div>

<div class="callout warn"><span class="t">Осторожно</span>Никаких «эмпирических вероятностей» из нашего виджета делать нельзя: это расчёт для упрощённой модели. Реальные оценки зависят от инструмента, тика, формы весов $w_i$, горизонта и издержек. И помните: книгу можно «нарисовать» — крупные заявки, которые не собираются исполняться, искажают дисбаланс (модуль 8).</div>
`,
        widgets: { imbalance: widgetImbalance },
        quiz: [
          { q: 'В игрушечной модели без лимитных ордеров и отмен на bid стоит 8 лотов, на ask 2. Почему вероятность роста mid высока?', options: ['Потому что на bid больше денег', 'Очередь на ask короче и, скорее всего, опустеет раньше', 'Потому что рыночные ордера на покупку более частые'], answer: 1, explain: 'Интенсивности рыночных ордеров одинаковы; короче очередь — быстрее опустеет, и ask сдвинется вверх.' },
          { q: 'Как добавление лимитных ордеров, пополняющих лучшие котировки (λ>0), меняет связь дисбаланса с будущим движением в игрушке?', options: ['Делает связь более размытой: перевес на одной стороне быстрее сглаживается', 'Усиливает связь', 'Не влияет'], answer: 0, explain: 'Пополнение оттягивает опустошение, и вероятности приближаются к 50/50 и к «не определилось» на коротких горизонтах.' },
          { q: 'Чем, по выводам гл. 10 [24], закончилась проверка стратегий на дисбалансе при издержках 0,5 б.п.?', options: ['Дала большую стабильную прибыль на всех горизонтах', 'Осталась лишь слабо положительной на 1 минуте и неприбыльной на 5–30 минутах', 'Была убыточной на всех горизонтах'], answer: 1, explain: 'Предсказуемость есть, но после издержек практическая ценность мала, и с ростом горизонта сила падает.' },
          { q: 'Почему 72,91% успешных предсказаний «на 500 акциях» не стоит считать реальной стратегией?', options: ['Результат получен in-sample, и сами авторы называют его нереалистичным', 'Потому что 500 акций слишком мало', 'Потому что вероятность не может превышать 50%'], answer: 0, explain: 'Подгонка на тех же данных, где проверяется результат, завышает качество; в статье честная оценка делается out-of-sample.' }
        ],
        sources: [
          { title: '[24] Abergel et al., Limit Order Books', where: 'гл. 10 (10.2 индикаторы: past return, order book imbalance, flow quantity; результаты, таблица 10.1, рис. 10.3–10.5; итоги)', note: 'строки ~6550–6870, 7360–7370' },
          { title: '[24] там же', where: 'гл. 4 (Hawkes, зависимость потоков) — только для контекста', note: 'формулу «Bin(a+b−1, 1/2)» мы вывели сами для учебной игрушки; в источнике она не приводится' }
        ]
      },

      /* ---------------------------------------------------------- урок 5 */
      {
        id: 'm02-l5',
        title: 'Насколько реалистичны модели: марковость, очередь, размеры',
        minutes: 35,
        html: `
<p>Модели из урока 3 удобны, но можно ли по ним проверять стратегии? Lu и Abergel [29] показали на реальных данных фьючерса на Euro Stoxx 50 (июнь–июль 2016), что чисто марковские модели книги могут давать совершенно неверные выводы о стратегии маркет-мейкинга; Abergel, Hurè, Pham [16] строят стратегию в модели с FIFO-очередями. Этот урок учит видеть слабые места моделей.</p>

<h2>Модель очередей, реагирующих на размер (queue-reactive)</h2>
<p>В <b>queue-reactive model</b> (Huang–Lehalle–Rosenbaum 2015) книга — вектор очередей, а интенсивности добавления $f_i(q)$ и удаления $g_i(q)$ зависят от <b>размера очереди</b>, то есть система марковская. В данных (по [29]): для коротких очередей (менее ~70 лотов) интенсивность лимитных ордеров чуть выше суммарной интенсивности отмен и рыночных ордеров; для очередей от ~70 до ~300 лотов она сравнима, а при очень длинных очередях лимитные приходят реже, чем уходят, что и обеспечивает эргодичность (очередь не растёт неограниченно). Интенсивность рыночных ордеров резко падает с ростом очереди [29]. Похожие зависящие от состояния интенсивности использует и [16], где показано, что при постоянных симметричных интенсивностях «наивная» стратегия «всегда котируй» не хуже оптимальной, а при зависящих от состояния интенсивностях оптимальная выигрывает.</p>

<h2>Где марковская модель расходится с данными [29]</h2>
<ol>
<li><b>Размеры ордеров не единичны.</b> Лимитные размеры — геометрическое распределение; отмены — усечённое геометрическое; рыночные — смесь геометрического и «пиков» около круглых размеров (кратных 50 контрактам и «съедания» первого лимита).</li>
<li><b>Важна природа последнего события.</b> Когда лучший лимит опустошён <i>рыночным ордером</i>, цена продолжает двигаться в ту же сторону (follow) с вероятностью около 84,3%; когда он опустошён <i>отменой</i> — лишь около 27% (Table 3 в [29]). Для чисто марковской модели эти события неразличимы, а значит, она теряет адверс-селекцию.</li>
<li><b>Время восстановления.</b> После крупной сделки новый лимит появляется с типичной задержкой, пик которой около 200 мкс — время круговой задержки рынка.</li>
<li><b>Размер нового лимита</b> растёт с размером опустошившего ордера.</li>
</ol>
<p>Авторы строят Model 0 (единичные размеры), Model I (добавлены размеры), Model II (добавлена зависимость от природы события и размера). В Model 0 наивная стратегия «всегда котируй» выглядит прибыльной во всех состояниях (значение не менее ~0,5 тика) — это признак плохой модели. В Model II в большинстве состояний выгодно <i>отменять</i> заявки; локально оптимальная стратегия прибыльна в симуляции и в бэктесте (июль–середина ноября 2016: ~0,54 тыс. € в день при обороте 45,2 млн €), а наивные — убыточны из-за adverse selection (исполняются, когда цена идёт против). Эти числа касаются одного фьючерса, периода и допущений (лот 10 контрактов, фиксированная задержка, влиянием своих ордеров пренебрегают).</p>
<p>Важное правило бэктеста [29]: рыночный ордер, очищающий лимит, исполняет и заявку в хвосте очереди; если игнорировать это правило, результат завышается — до 20% оборота.</p>

<h2>Позиция в очереди и вероятность исполнения</h2>
<p>В очереди FIFO вашу заявку исполнят, когда впереди стоящие $n$ лотов будут «потреблены»: исполнены рыночными ордерами или сняты отменами. Рождение новых лимитных ордеров позади вас на очередь не влияет. Стоит подчеркнуть, как размеры ордеров меняют картину: если рыночные ордера крупные, а приходят реже (тот же суммарный объём потока), время до исполнения случайнее, и вероятность исполнения за заданное время отличается от случая единичных ордеров. Это и есть слабость допущения «все ордера единичные».</p>
<div class="example"><b>Учебный пример.</b> Впереди $n=20$ лотов, рыночные ордера приходят с интенсивностью 1 в единицу времени со средним размером 5 лотов, отмены с $\\theta=0{,}05$ на лот. Грубая оценка: рыночные ордера потребляют в среднем $1\\cdot5=5$ лотов в единицу времени, отмены в начале добавляют ещё около $0{,}05\\cdot20=1$ лот, то есть очередь рассасывается примерно за 3–4 единицы времени, но разброс велик (ордера крупные и редкие). Виджет считает вероятность исполнения симуляцией.</div>

<h2>Интерактив: позиция в очереди</h2>
<p>Двигайте позицию в очереди, средний размер ордера и отмены. Сплошная линия — случайные размеры (геометрическое распределение), пунктир — единичные ордера с тем же объёмом потока. Модель учебная, не калибрована под данные.</p>
<div data-widget="queue" data-title="FIFO: позиция в очереди и вероятность исполнения"></div>

<div class="callout key"><span class="t">Главное</span>Чисто марковская модель с единичными ордерами может «доказать» прибыльность наивной стратегии. На реальных данных критичны: размеры ордеров, природа события, опустошившего уровень (рыночный ордер или отмена), задержка восстановления и правило приоритета. Поэтому при оценке стратегии модель надо проверять на данных, а бэктест — на «подводные камни» (например, исполнение хвоста очереди).</div>

<div class="callout warn"><span class="t">Осторожно</span>В [16] результаты получены на симулированных данных (с параметрами из литературы), в [29] — на одном фьючерсе в 2016 г. с допущениями бэктеста; цифры не переносите на другие рынки. Hawkes-расширения книги и зависимость потоков (кластеризация) — в модуле 7; оптимизация котирования как задачи управления — модули 5–6.</div>
`,
        widgets: { queue: widgetQueue },
        quiz: [
          { q: 'Почему в Model 0 из [29] (единичные ордера) наивная стратегия «всегда котируй» выглядит прибыльной, а на данных — нет?', options: ['Потому что в Model 0 нет игроков', 'Единичные размеры и игнорирование природы события скрывают adverse selection: цена чаще идёт против вас после исполнения', 'Потому что в Model 0 тик больше'], answer: 1, explain: 'Это признак плохой модели: положительное значение во всех состояниях нереалистично, а размеры и тип опустошившего события в ней не учтены.' },
          { q: 'После какого события лучшая цена чаще продолжает двигаться в ту же сторону (follow) по Table 3 [29]?', options: ['После отмены', 'После рыночного ордера', 'Одинаково часто'], answer: 1, explain: 'После рыночного ордера около 84%, после отмены около 27% — различие важно, потому что марковская модель их не различает.' },
          { q: 'Что в очереди FIFO не влияет на время до исполнения вашей заявки?', options: ['Новые лимитные ордера, пришедшие позади вас', 'Отмены впереди стоящих заявок', 'Размеры рыночных ордеров'], answer: 0, explain: 'Ордера позади вас не стоят между вами и исполнением. Впереди стоящее потребляется рыночными ордерами и отменами.' },
          { q: 'Что означает правило бэктеста: «рыночный ордер, очищающий лимит, исполняет и хвост очереди»?', options: ['Заявки в хвосте исполняются позже', 'Если рыночный ордер забирает весь уровень, исполняется и ваша заявка в конце очереди; игнорирование этого завышает результат', 'Заявки в хвосте отменяются автоматически'], answer: 1, explain: 'Игнорирование приводит к ошибочному расчёту исполнений и отклонению результата — по [29] до 20% оборота.' }
        ],
        sources: [
          { title: '[29] Lu, Abergel (2018), Order-book modelling and market making strategies', where: 'разд. queue-reactive, размеры ордеров, follow/revert (Table 3), Model 0/I/II, бэктест', note: 'work/text/29.txt: 133–195, 219–326, 331–466, 579–628, 910–1034' },
          { title: '[16] Abergel, Hurè, Pham, Algorithmic trading in a microstructural LOB model', where: 'разд. 1–2 (модель книги, FIFO, ранг в очереди), 4.4 (результаты)', note: 'work/text/16.txt: 115–324, 1322–1470; расширение Хоукса — модуль 7' },
          { title: '[24] Abergel et al., Limit Order Books', where: 'гл. 4.3 (зависимость потоков: market → limit)', note: 'для контекста' }
        ]
      }
    ],
    terms: [
      { en: 'limit order book (LOB)', ru: 'книга лимитных заявок (стакан)', def: 'Список всех действующих лимитных заявок на покупку и продажу, упорядоченный по цене и времени.' },
      { en: 'limit order', ru: 'лимитный ордер', def: 'Заявка с ограничением цены; если не исполняется сразу, ждёт в книге.' },
      { en: 'market order', ru: 'рыночный ордер', def: 'Заявка на немедленное исполнение по лучшим доступным ценам; «съедает» книгу слой за слоем.' },
      { en: 'cancellation', ru: 'отмена', def: 'Снятие ранее выставленного лимитного ордера; в моделях часто с интенсивностью, пропорциональной объёму.' },
      { en: 'bid / ask', ru: 'цена покупки / цена продажи', def: 'Лучшая цена покупки $P_B$ и лучшая цена продажи $P_A$.' },
      { en: 'bid-ask spread', ru: 'спред', def: '$S=P_A-P_B$, разница между лучшей продажей и лучшей покупкой.' },
      { en: 'mid-price', ru: 'средняя цена', def: '$P=(P_A+P_B)/2$; расчётная величина, по которой нельзя совершить сделку.' },
      { en: 'tick size', ru: 'шаг цены (тик)', def: 'Минимальная разница между двумя допустимыми ценами; цены в книге дискретны.' },
      { en: 'depth', ru: 'глубина', def: 'Суммарный объём заявок на выбранных ценовых уровнях.' },
      { en: 'price-time priority', ru: 'приоритет цена-время (FIFO)', def: 'Сначала исполняются заявки с лучшей ценой, при равной цене — те, что пришли раньше.' },
      { en: 'pro rata', ru: 'пропорциональное исполнение', def: 'Альтернатива FIFO: объём распределяется между заявками на уровне пропорционально их размеру (например, на CME).' },
      { en: 'queue position (rank)', ru: 'позиция в очереди', def: 'Количество объёма, стоящего перед вашей заявкой на уровне; определяет время и вероятность исполнения.' },
      { en: 'order book imbalance', ru: 'дисбаланс книги', def: 'Перевес объёма на одной стороне; в [24] $\\ln(\\mathrm{Liq}_{bid}/\\mathrm{Liq}_{ask})$ по взвешенной ликвидности пяти лучших уровней.' },
      { en: 'zero-intelligence model', ru: 'модель нулевого интеллекта', def: 'Модель книги, где ордера приходят случайно и независимо, без стратегического поведения.' },
      { en: 'hump-shaped book', ru: 'книга-«горб»', def: 'Усреднённая форма стакана с максимумом объёма не на лучшей котировке, а дальше от неё.' },
      { en: 'Weibull distribution', ru: 'распределение Вейбулла', def: 'Семейство распределений с параметром формы $k$; при $k=1$ совпадает с экспоненциальным. Хорошо описывает интервалы между ордерами [24].' },
      { en: 'event time / calendar time', ru: 'событийное / календарное время', def: 'В event time один шаг — одно событие книги; в календарном времени шаги измеряются секундами.' },
      { en: 'queue-reactive model', ru: 'модель с реакцией на очередь', def: 'Марковская модель книги, где интенсивности ордеров зависят от размера очередей.' },
      { en: 'Hawkes process', ru: 'процесс Хокса', def: 'Самовозбуждающийся точечный процесс: события повышают будущую интенсивность; подробности — в модуле 7.' },
      { en: 'adverse selection', ru: 'неблагоприятный отбор', def: 'Ситуация, когда ваша пассивная заявка исполняется именно тогда, когда цена идёт против вас.' }
    ]
  });
})();
