/* Лаборатория: столы вокруг стакана заявок (движок — assets/lob.js).
   1. «Стакан»: торгуйте рыночными и лимитными заявками в живом стакане.
   2. «Очередь»: исполнится ли моя лимитная заявка и чем за это приходится платить.
   3. «Дисбаланс»: предсказывает ли перекос объёмов стакана движение цены.
   4. «Аукцион»: как находится единая цена открытия. */
(function () {
  const C = Course, LOB = C.lob, U = C.ui, el = U.el, f = C.fmt.n, col = U.color, ui = C.labui;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const tk = (x, d) => f(x, d == null ? 1 : d);

  /* =====================================================================
     1. Стакан, в котором торгуете вы
     ===================================================================== */
  function bookDesk(root) {
    let seed = 11, bk = new LOB.Book({ seed: seed }), running = false, speed = 3, acc = 0, last = 0, report = "Нажмите «Запустить» и посмотрите, как живёт стакан, потом отправьте свою заявку.";
    const box = el("div"); root.appendChild(box);
    const prm = bk.p;
    const sl = (key, label, min, max, step, d) => U.slider(box, { label: label, min: min, max: max, step: step, value: prm[key], fmt: (v) => f(v, d), onInput: (v) => { bk.p[key] = v; } });
    sl("lambdaL", "Лимитные заявки (на сторону за шаг)", 0.2, 1.5, 0.05, 2);
    sl("lambdaM", "Рыночные заявки (на сторону за шаг)", 0.05, 0.5, 0.01, 2);
    sl("theta", "Отмены (доля заявок за шаг)", 0.01, 0.1, 0.005, 3);
    sl("depth", "Насколько далеко от рынка ставят заявки, тиков", 1, 5, 0.5, 1);
    const bar = el("div", { class: "seg" }); box.appendChild(bar);
    const bRun = U.button(bar, "▶ Запустить", () => { running = !running; last = 0; setBtn(); if (running) requestAnimationFrame(frame); });
    U.button(bar, "Шаг", () => { running = false; setBtn(); bk.step(); paint(); }, true);
    U.button(bar, "+20 шагов", () => { running = false; setBtn(); for (let i = 0; i < 20; i++) bk.step(); paint(); }, true);
    U.button(bar, "Новый стакан", () => { seed++; bk = new LOB.Book({ seed: seed, params: Object.assign({}, bk.p) }); report = "Новый стакан."; paint(); }, true);
    bar.appendChild(el("span", { class: "lab-note" }, " шагов в секунду:"));
    ui.seg(bar, [[1, "1"], [3, "3"], [10, "10"]], speed, (k) => { speed = k; });
    const kp = ui.kpiRow(box, [["mid", "Mid"], ["spr", "Спред, тиков"], ["imb", "Дисбаланс (лучшие цены)"], ["pos", "Ваша позиция, лотов"], ["cash", "Деньги"], ["pnl", "P&L по mid"]]);
    const grid = el("div", { class: "book-grid" }); box.appendChild(grid);
    const ladderBox = el("div", { class: "ladder" }), side = el("div", { class: "book-side" }); grid.append(ladderBox, side);
    side.innerHTML = '<div class="lab-note">Размер заявки, лотов:</div>';
    const qty = el("input", { type: "number", min: 1, max: 100, value: 5, class: "qty" }); side.appendChild(qty);
    const q = () => Math.max(1, Math.min(100, Math.round(+qty.value || 1)));
    const btn = (t, fn, ghost) => { const b = U.button(side, t, fn, ghost); b.style.margin = "4px 4px 0 0"; return b; };
    const lvl = (arr) => { const m = {}; arr.forEach((x) => (m[x.price] = (m[x.price] || 0) + x.qty)); return Object.keys(m).map((p) => m[p] + " по " + p).join(", "); };
    const doMarket = (s) => {
      const mid0 = bk.mid(), b0 = bk.bestBid(), a0 = bk.bestAsk(), r = bk.market(s, q(), "me");
      if (!r.filled) { report = "Исполнить нечего: противоположная сторона пуста."; paint(); return; }
      const slip = s === "B" ? r.avg - mid0 : mid0 - r.avg;
      const edge = s === "B" ? a0 : b0, after = s === "B" ? bk.bestAsk() : bk.bestBid();
      report = (s === "B" ? "Куплено " : "Продано ") + r.filled + " из " + q() + " лот.: " + lvl(r.fills) + ". Средняя цена <b>" + tk(r.avg, 2) + "</b>, mid до сделки " + tk(mid0, 1) + ", проскальзывание <b>" + tk(slip, 2) + " тика</b> (половина спреда была " + tk(Math.abs(a0 - b0) / 2, 1) + "). Лучшая цена сдвинулась " + edge + " → " + after + ".";
      paint();
    };
    const doLimit = (s, pr, name) => {
      const r = bk.limit(s, pr, q(), "me");
      if (r.immediate && r.immediate.filled) report = name + " по " + pr + " пересекла рынок: сразу исполнено " + r.immediate.filled + " лот. по средней " + tk(r.immediate.avg, 2) + (r.rested ? ", остаток " + r.rested + " лот. встал в очередь." : ".");
      else report = name + " по " + pr + " встала в очередь: впереди " + bk.queueAhead(r.id) + " лот.";
      paint();
    };
    btn("Купить рынком", () => doMarket("B")); btn("Продать рынком", () => doMarket("S"));
    side.appendChild(el("div", { class: "lab-note" }, "Лимитные заявки:"));
    btn("Купить на лучшем bid", () => doLimit("B", bk.bestBid(), "Покупка"), true);
    btn("Купить на bid+1 (вперёд очереди)", () => doLimit("B", bk.bestBid() + 1, "Покупка"), true);
    btn("Продать на лучшем ask", () => doLimit("S", bk.bestAsk(), "Продажа"), true);
    btn("Продать на ask−1", () => doLimit("S", bk.bestAsk() - 1, "Продажа"), true);
    btn("Отменить мои заявки", () => { Array.from(bk.myOrders.keys()).forEach((id) => bk.cancel(id)); report = "Все ваши стоящие заявки отменены."; paint(); }, true);
    const mine = el("div", { class: "w-out" }); side.appendChild(mine);
    const rep = el("div", { class: "w-out" }); box.appendChild(rep);
    const cv = U.canvas(box, 760, 190); box.appendChild(el("div", { class: "lab-note" }, "Что попробовать: отправьте рыночный ордер на 30 лотов и сравните проскальзывание с ордером на 3 лота; поставьте лимитную заявку на лучшем bid и последите, как уменьшается очередь перед вами; затем поставьте на bid+1 и сравните время ожидания."));

    function setBtn() { bRun.textContent = running ? "⏸ Пауза" : "▶ Запустить"; }
    function paint() {
      const two = bk.bestBid() !== null && bk.bestAsk() !== null;
      const L = bk.ladder(8), maxS = Math.max(1, ...L.bids.map((x) => x.size), ...L.asks.map((x) => x.size));
      const row = (l, side) => '<tr class="' + side + '"><td class="sz">' + (side === "ask" ? '<i style="width:' + (l.size / maxS * 100) + '%"></i>' : "") + "<b>" + (side === "ask" ? l.size : "") + '</b></td><td class="pr">' + l.price + (l.mine ? ' <span class="mine">★' + l.mine + "</span>" : "") + '</td><td class="sz">' + (side === "bid" ? '<i style="width:' + (l.size / maxS * 100) + '%"></i>' : "") + "<b>" + (side === "bid" ? l.size : "") + "</b></td></tr>";
      ladderBox.innerHTML = '<table><tr><th>ask: объём</th><th>цена</th><th>bid: объём</th></tr>' + L.asks.slice().reverse().map((l) => row(l, "ask")).join("") +
        '<tr class="gap"><td colspan="3">' + (two ? "спред " + bk.spread() + " · mid " + tk(bk.mid(), 1) : "одна из сторон пуста: следующий шаг добавит заявки") + "</td></tr>" + L.bids.map((l) => row(l, "bid")).join("") + "</table>";
      kp("mid", tk(bk.mid(), 1), 0); kp("spr", two ? String(bk.spread()) : "—", 0); kp("imb", f(bk.imbalance(1), 2), bk.imbalance(1));
      kp("pos", String(bk.me.pos), 0); kp("cash", f(bk.me.cash, 0), 0); const pl = bk.pnl(); kp("pnl", f(pl, 1), pl);
      const mo = Array.from(bk.myOrders.entries());
      mine.innerHTML = mo.length ? "<b>Ваши заявки:</b><br>" + mo.map((e) => (e[1].side === "B" ? "покупка " : "продажа ") + e[1].size + " лот. по " + e[1].price + ", впереди " + bk.queueAhead(e[0]) + " лот.").join("<br>") : "<span class='muted'>Стоящих заявок нет.</span>";
      rep.innerHTML = report;
      const n = bk.hist.mid.length, from = Math.max(0, n - 300), xs = [], ys = [];
      for (let i = from; i < n; i++) { xs.push(i); ys.push(bk.hist.mid[i]); }
      if (xs.length > 1) C.plot.line(cv, { series: [{ x: xs, y: ys, color: col("--ink") }], title: "Mid-цена, последние 300 шагов", xlabel: "шаг" });
    }
    function frame(ts) {
      if (!root.isConnected) { running = false; return; }
      if (!running) return;
      if (!last) last = ts; acc += (ts - last) / 1000 * speed; last = ts;
      let n = 0; while (acc >= 1 && n < 20) { bk.step(); acc -= 1; n++; }
      if (n) paint();
      requestAnimationFrame(frame);
    }
    paint();
    return { book: () => bk };
  }

  /* =====================================================================
     2. Очередь: исполнится ли моя заявка
     ===================================================================== */
  const PLACES = [["improve", "На тик лучше bid (первый в очереди)"], ["join", "На лучшем bid (в конец очереди)"], ["back1", "На 1 тик ниже bid"], ["back3", "На 3 тика ниже bid"]];
  function queueDesk(root) {
    const box = el("div"); root.appendChild(box);
    let horizon = 300, runs = 300;
    U.slider(box, { label: "Сколько шагов готовы ждать", min: 50, max: 600, step: 10, value: horizon, fmt: (v) => f(v, 0), onInput: (v) => { horizon = v; } });
    U.slider(box, { label: "Число экспериментов на вариант", min: 100, max: 600, step: 50, value: runs, fmt: (v) => f(v, 0), onInput: (v) => { runs = v; } });
    const out = el("div", { class: "w-out" }), cv = U.canvas(box, 760, 220); cv.style.display = "none";
    U.button(box, "Запустить эксперименты", () => {
      const rows = PLACES.map((p) => [p[1], LOB.queueExperiment({ place: p[0], horizon: horizon }, runs, 100)]);
      out.innerHTML = '<table class="mini"><tr><th>Куда ставим заявку на покупку 1 лота</th><th>Исполнилась</th><th>Ждали, шагов</th><th>Взяли на спреде, тиков</th><th>Дрейф mid после исполнения (20 шагов)</th><th>Если не исполнилась: mid ушёл на</th></tr>' +
        rows.map((r) => "<tr><td>" + r[0] + "</td><td>" + f(r[1].fillProb * 100, 0) + "%</td><td>" + (r[1].meanWait == null ? "—" : f(r[1].meanWait, 0)) + "</td><td>" + (r[1].captured == null ? "—" : f(r[1].captured, 2)) + "</td><td>" + (r[1].markout == null ? "—" : f(r[1].markout, 2)) + "</td><td>" + (r[1].driftUnfilled == null ? "—" : f(r[1].driftUnfilled, 1) + " тиков") + "</td></tr>").join("") + "</table>" +
        '<div class="lab-note">Чем дальше от рынка заявка, тем больше вы «зарабатываете» на сделке, но тем реже она исполняется и тем дольше ждёте. Если заявка не исполнилась, это чаще всего значит, что цена убежала вверх, то есть вы не купили именно тогда, когда покупка была выгодна. Дрейф после исполнения здесь около нуля, потому что в этой модели все участники «неинформированные»; настоящая адверс-селекция (модуль 3) появляется, когда среди тех, кто бьёт по вашей заявке, есть информированные трейдеры.</div>';
      cv.style.display = "";
      C.plot.bars(cv, { labels: ["bid+1", "bid", "bid−1", "bid−3"], values: rows.map((r) => r[1].fillProb * 100), colors: [col("--c1"), col("--c1"), col("--c2"), col("--c2")], title: "Вероятность исполнения за выбранное время, %" });
    });
    box.appendChild(out); box.appendChild(cv);
  }

  /* =====================================================================
     3. Дисбаланс стакана
     ===================================================================== */
  function imbalanceDesk(root) {
    const box = el("div"); root.appendChild(box);
    let k = 1, h = 5, steps = 30000;
    U.slider(box, { label: "Сколько лучших уровней учитывать в дисбалансе", min: 1, max: 5, step: 1, value: k, fmt: (v) => f(v, 0), onInput: (v) => { k = v; } });
    U.slider(box, { label: "Через сколько шагов смотрим на изменение mid", min: 1, max: 20, step: 1, value: h, fmt: (v) => f(v, 0), onInput: (v) => { h = v; } });
    const out = el("div", { class: "w-out" }), cv = U.canvas(box, 760, 240); cv.style.display = "none";
    U.button(box, "Собрать статистику (30 000 шагов)", () => {
      const r = LOB.imbalanceExperiment({ k: k, h: h }, steps, 5);
      const names = ["сильно в сторону ask", "в сторону ask", "поровну", "в сторону bid", "сильно в сторону bid"];
      out.innerHTML = '<table class="mini"><tr><th>Дисбаланс (V<sub>bid</sub> − V<sub>ask</sub>)/(V<sub>bid</sub> + V<sub>ask</sub>)</th><th>наблюдений</th><th>mid вырос</th><th>mid упал</th><th>без изменений</th></tr>' +
        r.map((x, i) => "<tr><td>" + names[i] + "</td><td>" + x.n + "</td><td>" + f(x.up * 100, 0) + "%</td><td>" + f(x.down * 100, 0) + "%</td><td>" + f(x.flat * 100, 0) + "%</td></tr>").join("") + "</table>" +
        '<div class="lab-note">Если у лучшего bid стоит намного больше объёма, чем у ask, то цена скорее вырастет: ask съедят раньше, чем bid. Это механический эффект очереди, а не «мнение» участников — в модели нет информации и нет стратегий. Попробуйте поменять число уровней и горизонт: предсказательная сила обычно максимальна на лучших ценах и быстро затухает с горизонтом (модуль 2, урок 4).</div>';
      cv.style.display = "";
      C.plot.line(cv, { series: [{ x: [0, 1, 2, 3, 4], y: r.map((x) => x.up * 100), label: "mid вырос", color: col("--c3") }, { x: [0, 1, 2, 3, 4], y: r.map((x) => x.down * 100), label: "mid упал", color: col("--c2") }], xlabel: "дисбаланс: от «ask» (0) к «bid» (4)", ylabel: "% наблюдений", title: "Куда пойдёт цена при разном дисбалансе", ymin: 0 });
    });
    box.appendChild(out); box.appendChild(cv);
  }

  /* =====================================================================
     4. Аукцион с единой ценой
     ===================================================================== */
  function auctionDesk(root) {
    const box = el("div"); root.appendChild(box);
    let orders = [
      { side: "B", price: 101, qty: 5 }, { side: "B", price: 100, qty: 8 }, { side: "B", price: 99, qty: 10 }, { side: "B", price: 98, qty: 12 }, { side: "B", price: 97, qty: 6 },
      { side: "S", price: 96, qty: 4 }, { side: "S", price: 98, qty: 7 }, { side: "S", price: 99, qty: 9 }, { side: "S", price: 100, qty: 10 }, { side: "S", price: 102, qty: 8 }
    ], refP = 99;
    box.appendChild(el("div", { class: "lab-note" }, "Заявки накапливаются без торговли, потом биржа находит одну цену, при которой исполняется максимальный объём. Меняйте цены и объёмы, добавляйте заявки."));
    U.slider(box, { label: "Референсная цена (для случая нескольких одинаковых вариантов)", min: 94, max: 105, step: 1, value: refP, fmt: (v) => f(v, 0), onInput: (v) => { refP = v; draw(); } });
    const tbl = el("div"); box.appendChild(tbl);
    const bar = el("div", { class: "seg" }); box.appendChild(bar);
    U.button(bar, "+ покупка", () => { orders.push({ side: "B", price: 99, qty: 5 }); renderTable(); draw(); }, true);
    U.button(bar, "+ продажа", () => { orders.push({ side: "S", price: 99, qty: 5 }); renderTable(); draw(); }, true);
    U.button(bar, "+ рыночная покупка", () => { orders.push({ side: "B", price: null, qty: 5 }); renderTable(); draw(); }, true);
    U.button(bar, "+ рыночная продажа", () => { orders.push({ side: "S", price: null, qty: 5 }); renderTable(); draw(); }, true);
    const kp = ui.kpiRow(box, [["p", "Цена аукциона"], ["v", "Объём сделок"], ["imb", "Небаланс при этой цене"]]);
    const cv = U.canvas(box, 760, 260), msg = el("div", { class: "w-out" }); box.appendChild(msg);
    function renderTable() {
      tbl.innerHTML = '<table class="mini"><tr><th>Сторона</th><th>Цена (пусто — рыночная)</th><th>Лотов</th><th>Исполнено</th><th></th></tr>' + orders.map((o, i) => '<tr data-i="' + i + '"><td>' + (o.side === "B" ? "покупка" : "продажа") + '</td><td><input type="number" class="ap" value="' + (o.price == null ? "" : o.price) + '" step="1"></td><td><input type="number" class="aq" value="' + o.qty + '" min="1" step="1"></td><td class="af">—</td><td><button class="adel" type="button">×</button></td></tr>').join("") + "</table>";
      tbl.querySelectorAll("tr[data-i]").forEach((tr) => {
        const i = +tr.dataset.i;
        tr.querySelector(".ap").oninput = (e) => { const v = e.target.value.trim(); orders[i].price = v === "" ? null : +v; draw(); };
        tr.querySelector(".aq").oninput = (e) => { orders[i].qty = Math.max(1, Math.round(+e.target.value || 1)); draw(); };
        tr.querySelector(".adel").onclick = () => { orders.splice(i, 1); renderTable(); draw(); };
      });
    }
    function draw() {
      const r = LOB.auction(orders, refP), ps = orders.filter((o) => o.price != null).map((o) => o.price);
      const lo = ps.length ? Math.min.apply(null, ps) - 1 : 90, hi = ps.length ? Math.max.apply(null, ps) + 1 : 110, xs = [], d = [], s = [];
      for (let p = lo; p <= hi; p++) { xs.push(p); d.push(orders.reduce((a, o) => a + (o.side === "B" && (o.price == null || o.price >= p) ? o.qty : 0), 0)); s.push(orders.reduce((a, o) => a + (o.side === "S" && (o.price == null || o.price <= p) ? o.qty : 0), 0)); }
      const top = Math.max(1, ...d, ...s), series = [{ x: xs, y: d, label: "спрос (покупки по цене не выше)", color: col("--c1") }, { x: xs, y: s, label: "предложение (продажи по цене не ниже)", color: col("--c2") }];
      if (r.price != null) series.push({ x: [r.price, r.price], y: [0, top], color: col("--ink"), dash: [5, 4], label: "цена аукциона" });
      C.plot.line(cv, { series: series, xlabel: "цена", ylabel: "накопленный объём, лотов", title: "Кривые спроса и предложения", ymin: 0 });
      kp("p", r.price == null ? "нет" : f(r.price, 0), 0); kp("v", String(r.volume), 0); kp("imb", r.price == null ? "—" : String(r.imbalance), 0);
      tbl.querySelectorAll("tr[data-i]").forEach((tr) => { tr.querySelector(".af").textContent = r.fills[+tr.dataset.i] + " из " + orders[+tr.dataset.i].qty; });
      msg.innerHTML = r.price == null ? "Заявки не пересекаются: сделок нет." : "Все покупки не ниже <b>" + r.price + "</b> и все продажи не выше <b>" + r.price + "</b> исполняются по одной цене <b>" + r.price + "</b>. Более агрессивные заявки обслуживаются первыми; сторона с избытком получает долю по очереди подачи." + (r.imbalance ? " Небаланс " + r.imbalance + " лот. остаётся неисполненным." : "");
    }
    renderTable(); draw();
  }

  /* =====================================================================
     Добавляем столы на страницу «Лаборатория»
     ===================================================================== */
  const prev = C.pages.lab;
  C.pages.lab = function (content) {
    prev(content);
    const extra = el("div");
    extra.innerHTML =
      '<h2>3. Стакан заявок: торгуйте сами</h2><p>Живой стакан в модели нулевого интеллекта (<a href="#/m02/m02-l3">модуль 2, урок 3</a>). Отправьте рыночную заявку и посмотрите, как она «проходит» по уровням; поставьте лимитную и следите за очередью (<a href="#/m02/m02-l1">урок 1</a>). Ползунками можно сделать рынок тонким или глубоким.</p><div id="deskC" class="widget"></div>' +
      '<h2>4. Очередь: исполнится ли моя заявка</h2><p>Тысячи экспериментов на том же стакане: куда поставить заявку на покупку, чтобы она исполнилась, и что вы за это отдаёте (<a href="#/m05/m05-l6">приоритет «цена, время» в модели Guilbaud–Pham</a>).</p><div id="deskD" class="widget"></div>' +
      '<h2>5. Дисбаланс: предсказывает ли стакан цену</h2><p>Перекос объёмов между bid и ask и следующее движение mid (<a href="#/m02/m02-l4">модуль 2, урок 4</a>).</p><div id="deskE" class="widget"></div>' +
      '<h2>6. Аукцион: как находится единая цена</h2><p>Так определяется цена открытия и закрытия на многих биржах (<a href="#/m01/m01-l3">модуль 1, урок 3</a>).</p><div id="deskF" class="widget"></div>';
    content.appendChild(extra);
    [["#deskC", bookDesk], ["#deskD", queueDesk], ["#deskE", imbalanceDesk], ["#deskF", auctionDesk]].forEach((x) => { try { x[1](extra.querySelector(x[0])); } catch (e) { extra.querySelector(x[0]).textContent = "Ошибка стола: " + e.message; console.error(e); } });
    C.app.typeset();
  };
  C.lab.bookDesk = bookDesk; C.lab.queueDesk = queueDesk; C.lab.imbalanceDesk = imbalanceDesk; C.lab.auctionDesk = auctionDesk;
})();
