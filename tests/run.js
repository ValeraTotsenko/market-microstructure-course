/* Автотесты без зависимостей: node tests/run.js
   Проверяют структуру курса, математику движка симуляторов, логику повторения и офлайн-готовность. */
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.join(__dirname, "..", "course");
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); } catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e.message || e).split("\n")[0]); }
}
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, (msg || "") + " ожидалось " + b + " ± " + tol + ", получено " + a);

/* ---- окружение для загрузки файлов курса в Node ---- */
const store = {};
global.window = global;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
require(path.join(ROOT, "assets", "lib.js"));
require(path.join(ROOT, "assets", "practice.js"));
const Sim = require(path.join(ROOT, "assets", "engine.js"));
const LOB = require(path.join(ROOT, "assets", "lob.js"));
for (const f of fs.readdirSync(path.join(ROOT, "modules")).filter((x) => /^(m\d+|mm|ext_[a-z0-9_]+)\.js$/.test(x)).sort((a, b) => (a.startsWith("ext_") - b.startsWith("ext_")) || a.localeCompare(b))) require(path.join(ROOT, "modules", f));
require(path.join(ROOT, "assets", "sources.js"));
const C = global.Course;

console.log("\nСтруктура курса");
test("12 модулей: математика (Σ) и модули 0…10", () => { assert.strictEqual(C.modules.length, 12); assert.strictEqual(C.modules[0].id, "mm"); C.modules.slice(1).forEach((m, i) => assert.strictEqual(m.order, i)); });
test("идентификаторы модулей и уроков уникальны", () => {
  const ids = new Set();
  C.modules.forEach((m) => { assert(!ids.has(m.id), "дубль модуля " + m.id); ids.add(m.id); m.lessons.forEach((l) => { assert(!ids.has(l.id), "дубль урока " + l.id); ids.add(l.id); }); });
});
test("у каждого урока есть заголовок, текст и 4–5 вопросов с корректным ключом", () => {
  C.modules.forEach((m) => m.lessons.forEach((l) => {
    assert(l.title && l.html && l.html.length > 1500, l.id + ": нет текста или он слишком короткий");
    assert(l.quiz && l.quiz.length >= 3, l.id + ": меньше 3 вопросов");
    l.quiz.forEach((q, i) => {
      assert(q.q && q.explain, l.id + "#" + i + ": нет текста вопроса или пояснения");
      assert(q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, l.id + "#" + i + ": неверный индекс ответа");
      assert.strictEqual(new Set(q.options).size, q.options.length, l.id + "#" + i + ": повторяющиеся варианты");
    });
  }));
});
test("каждый data-widget в тексте урока имеет функцию, и наоборот", () => {
  C.modules.forEach((m) => m.lessons.forEach((l) => {
    const used = [...l.html.matchAll(/data-widget="([^"]+)"/g)].map((x) => x[1]), have = Object.keys(l.widgets || {});
    used.forEach((u) => assert(typeof (l.widgets || {})[u] === "function", l.id + ": нет виджета " + u));
    have.forEach((h) => assert(used.includes(h), l.id + ": виджет " + h + " не используется"));
  }));
});
test("у уроков есть источники, у терминов — en/ru/def", () => {
  C.modules.forEach((m) => {
    m.lessons.forEach((l) => assert(l.sources && l.sources.length, l.id + ": нет источников"));
    assert(m.terms.length >= 5, m.id + ": мало терминов");
    m.terms.forEach((t) => assert(t.en && t.ru && t.def, m.id + ": неполный термин " + JSON.stringify(t.en)));
  });
});
test("номера источников [NN] в уроках есть в списке источников", () => {
  const known = new Set((global.COURSE_SOURCES || []).map((s) => String(s.id).padStart(2, "0")));
  assert(known.size >= 50, "в списке источников " + known.size);
  const bad = [];
  C.modules.forEach((m) => m.lessons.forEach((l) => { (l.sources || []).forEach((s) => { const mm = /\[(\d{1,2})\]/.exec(s.title || ""); if (mm && !known.has(mm[1].padStart(2, "0"))) bad.push(l.id + " → [" + mm[1] + "]"); }); }));
  assert(!bad.length, "неизвестные источники: " + bad.join(", "));
});
test("каждая статья группы Alpha! ([01]–[06]) разобрана минимум в одном уроке с виджетом, а углублённые — в отдельном уроке", () => {
  const deep = { "01": "m08-l6", "03": "m06-l6", "04": "m05-l7", "05": "m05-l6" };
  const lessons = {}; C.modules.forEach((m) => m.lessons.forEach((l) => (lessons[l.id] = l)));
  ["01", "02", "03", "04", "05", "06"].forEach((id) => {
    const cited = Object.values(lessons).filter((l) => (l.sources || []).some((s) => (s.title || "").startsWith("[" + id + "]")) && Object.keys(l.widgets || {}).length);
    assert(cited.length >= 1, "[" + id + "]: нет урока с виджетом");
    if (deep[id]) { assert(lessons[deep[id]], "нет урока " + deep[id]); assert(lessons[deep[id]].sources[0].title.startsWith("[" + id + "]"), deep[id] + ": первый источник должен быть [" + id + "]"); assert(Object.keys(lessons[deep[id]].widgets).length >= 2, deep[id] + ": меньше двух виджетов"); assert(lessons[deep[id]].quiz.length >= 5, deep[id] + ": меньше 5 вопросов"); }
  });
});
test("общее число уроков и терминов не уменьшилось", () => {
  const lessons = C.modules.reduce((a, m) => a + m.lessons.length, 0), terms = C.modules.reduce((a, m) => a + m.terms.length, 0);
  assert(lessons >= 57, "уроков " + lessons); assert(terms >= 220, "терминов " + terms);
});

console.log("\nДвижок: маркет-мейкинг");
test("воспроизводит таблицу 1 статьи Avellaneda–Stoikov (γ = 0,1): P&L ≈ 65, σ ≈ 6,6, σ запаса ≈ 2,9", () => {
  const r = Sim.batchMM({ scenario: "calm", strategy: Object.assign(Sim.defaultStrategy(), { gamma: 0.1 }) }, 1000, 0);
  near(r.meanPnl, 65, 3, "средний P&L"); near(r.sdPnl, 6.6, 1.2, "σ P&L"); near(r.sdQ, 2.9, 0.6, "σ запаса");
});
test("симметричный эталон: P&L не ниже, но σ P&L и σ запаса заметно больше", () => {
  const a = Sim.batchMM({ scenario: "calm", strategy: Sim.defaultStrategy() }, 600, 0);
  const b = Sim.batchMM({ scenario: "calm", strategy: Sim.symmetricStrategy(a.avgSpread / 2) }, 600, 9000);
  assert(b.sdPnl > 1.5 * a.sdPnl, "σ P&L " + b.sdPnl + " vs " + a.sdPnl); assert(b.sdQ > 2 * a.sdQ);
});
test("детерминированность: один seed — один результат", () => {
  const cfg = { scenario: "toxic", seed: 42, strategy: Sim.defaultStrategy() };
  assert.strictEqual(Sim.runMM(cfg).stats.pnl, Sim.runMM(cfg).stats.pnl);
});
test("формулы котировок: резервная цена и спред A–S", () => {
  const st = Object.assign(Sim.defaultStrategy(), { gamma: 0.1, kEst: 1.5 }), s = 100, q = 3, tau = 1, sg = 2;
  const qt = Sim.quote(st, s, q, tau, sg);
  near(qt.centre, s - q * 0.1 * 4 * tau, 1e-9); near(qt.ask - qt.bid, 0.1 * 4 * tau + (2 / 0.1) * Math.log(1 + 0.1 / 1.5), 1e-9);
  near(0.1 * 4 + 20 * Math.log(1 + 0.1 / 1.5), 1.69, 0.005, "числовой пример урока (1,69)");
});
test("лимит запаса отключает котировку на сторону, увеличивающую позицию", () => {
  const st = Object.assign(Sim.defaultStrategy(), { maxInv: 3 });
  assert.strictEqual(Sim.quote(st, 100, 3, 1, 2).bid, null); assert.notStrictEqual(Sim.quote(st, 100, 3, 1, 2).ask, null);
  assert.strictEqual(Sim.quote(st, 100, -3, 1, 2).ask, null);
});
test("токсичный поток режет P&L стартовой стратегии, а информированные сделки есть только в новостных сценариях", () => {
  const calm = Sim.batchMM({ scenario: "calm", strategy: Sim.defaultStrategy() }, 300, 100), toxic = Sim.batchMM({ scenario: "toxic", strategy: Sim.defaultStrategy() }, 300, 100);
  assert(toxic.meanPnl < calm.meanPnl - 20, "calm " + calm.meanPnl + ", toxic " + toxic.meanPnl);
  assert.strictEqual(calm.meanInformed, 0); assert(toxic.meanInformed > 2);
});
test("разложение P&L: спред + результат запаса + (−комиссии) = итог", () => {
  const r = Sim.runMM({ scenario: "news", seed: 5, strategy: Object.assign(Sim.defaultStrategy(), { fee: 0.02 }) }).stats;
  near(r.spreadCapture + r.inventoryResult - r.fees, r.pnl, 1e-9);
});
test("этап 3 проекта: стартовая настройка не проходит, «Осторожный» проходит", () => {
  const ev = (st) => { const r = ["calm", "news", "toxic"].map((k) => Sim.batchMM({ scenario: k, strategy: st }, 300, 1000)); return { worst: Math.min(...r.map((x) => x.sharpe)), minMean: Math.min(...r.map((x) => x.meanPnl)), maxQ: Math.max(...r.map((x) => x.sdQ)) }; };
  const ok = (e) => e.minMean >= 20 && e.worst >= 1.3 && e.maxQ <= 3.5;
  assert(!ok(ev(Sim.defaultStrategy())), "стартовая настройка проходит — этап слишком лёгкий");
  assert(ok(ev(Object.assign(Sim.defaultStrategy(), { gamma: 0.1, extra: 0.3, maxInv: 5 }))), "заготовка «Осторожный» не проходит");
});
test("сценарий дня детерминирован и покрывает все режимы", () => {
  const seen = new Set(); for (let i = 1; i <= 200; i++) { seen.add(Sim.scenarioForDay(i)); assert.strictEqual(Sim.scenarioForDay(i), Sim.scenarioForDay(i)); }
  assert.strictEqual(seen.size, 4);
});

console.log("\nДвижок: исполнение");
test("равномерная продажа: издержки 35 б.п., как у закона квадратного корня + полуспред", () => {
  const m = Sim.execMoments(null, Sim.execTrajectory(null, 0));
  near(m.costBps, 35, 0.01); near(Sim.sqrtImpactBps(0.5, 0.02, 200000, 2e6) + 3, 34.6, 0.1);
});
test("Монте-Карло совпадает с аналитикой по среднему и σ", () => {
  const x = Sim.execTrajectory(null, 2), m = Sim.execMoments(null, x), r = Sim.execBatch(null, x, 20000, 0);
  near(r.mean, m.costBps, 3 * r.sd / Math.sqrt(20000) + 0.5, "среднее"); near(r.sd, m.sdBps, 0.04 * m.sdBps, "σ");
});
test("граница: рост срочности повышает издержки и снижает риск", () => {
  let pc = -1, pr = Infinity;
  for (let k = 0; k <= 10; k += 0.5) { const m = Sim.execMoments(null, Sim.execTrajectory(null, k)); assert(m.costBps >= pc - 1e-9); assert(m.sdBps <= pr + 1e-9); pc = m.costBps; pr = m.sdBps; }
});
test("траектория: начинается с X, заканчивается 0, не возрастает", () => {
  const x = Sim.execTrajectory(null, 3); near(x[0], 200000, 1e-6); near(x[x.length - 1], 0, 1e-6); for (let j = 1; j < x.length; j++) assert(x[j] <= x[j - 1] + 1e-9);
});
test("execBestForRisk находит κT с σ = лимит; для этапа 2 лимит 80 б.п. даёт κT ≈ 2,7", () => {
  const b = Sim.execBestForRisk(null, 80); near(b.m.sdBps, 80, 0.01); near(b.kappaT, 2.7, 0.15);
});
test("этап 1: ожидаемые ответы (31,6 б.п.; 34,6 б.п.; 34 600 $)", () => {
  const imp = Sim.sqrtImpactBps(0.5, 0.02, 200000, 2000000); near(imp, 31.62, 0.01); near((imp + 3) / 1e4 * 1e7, 34620, 5);
});

console.log("\nПовторение (интервалы)");
test("ошибка возвращает вопрос сразу, верные ответы растят интервал 1 → 3 → 7 дней", () => {
  const P = C.practice, DAY = 86400000, id = "t#0";
  P.record(id, false); let r = P.srs()[id]; assert.strictEqual(r.box, 0); assert(r.due <= Date.now());
  P.record(id, true); r = P.srs()[id]; near(r.due - Date.now(), 1 * DAY, 2000);
  P.record(id, true); r = P.srs()[id]; near(r.due - Date.now(), 3 * DAY, 2000);
  P.record(id, true); r = P.srs()[id]; near(r.due - Date.now(), 7 * DAY, 2000);
  P.record(id, false); assert.strictEqual(P.srs()[id].box, 0);
});
test("точность считается по всем ответам", () => { const a = C.practice.accuracy(); assert(a.n >= 5 && a.ok >= 3); });

console.log("\nДвижок: стакан заявок");
test("после любого числа шагов лучший bid строго ниже лучшего ask, объёмы положительны", () => {
  const b = new LOB.Book({ seed: 7 });
  for (let i = 0; i < 3000; i++) { b.step(); assert(b.bestBid() < b.bestAsk(), "пересечение на шаге " + i); }
  [b.bids, b.asks].forEach((bk) => bk.forEach((lv) => lv.forEach((o) => assert(o.size > 0))));
});
test("детерминированность: один seed — одна история", () => {
  const a = new LOB.Book({ seed: 4 }), c = new LOB.Book({ seed: 4 }); for (let i = 0; i < 200; i++) { a.step(); c.step(); }
  assert.deepStrictEqual(a.hist.mid, c.hist.mid);
});
test("рыночная заявка проходит по уровням, цена и объём сходятся с лестницей", () => {
  const b = new LOB.Book({ seed: 5 }), l = b.ladder(10); const total = l.asks.slice(0, 2).reduce((a, x) => a + x.size, 0);
  const r = b.market("B", total, "me"), expect = l.asks.slice(0, 2).reduce((a, x) => a + x.size * x.price, 0);
  assert.strictEqual(r.filled, total); near(r.notional, expect, 1e-9); assert.strictEqual(b.me.pos, total); near(b.me.cash, -expect, 1e-9);
});
test("приоритет «цена, затем время»: первой исполняется заявка, поставленная раньше", () => {
  const b = new LOB.Book({ seed: 6, burn: 0 }); b.bids.clear(); b.asks.clear();
  b._add("B", 99, 3, "o"); const mine = b.limit("B", 99, 2, "me"); b._add("S", 101, 5, "o");
  assert.strictEqual(b.queueAhead(mine.id), 3);
  b.market("S", 4, "o");                           // съедает 3 чужих и 1 из моих двух
  assert.strictEqual(b.me.pos, 1); assert(b.myOrders.has(mine.id)); assert.strictEqual(b.queueAhead(mine.id), 0);
  b.market("S", 1, "o"); assert.strictEqual(b.me.pos, 2); assert(!b.myOrders.has(mine.id));
});
test("моя пересекающая лимитная заявка исполняется сразу, остаток встаёт в очередь", () => {
  const b = new LOB.Book({ seed: 8, burn: 0 }); b.bids.clear(); b.asks.clear(); b._add("S", 101, 2, "o"); b._add("B", 99, 1, "o");
  const r = b.limit("B", 101, 5, "me"); assert.strictEqual(r.immediate.filled, 2); assert.strictEqual(r.rested, 3); assert.strictEqual(b.bestBid(), 101);
});
test("чужие участники не отменяют мою заявку, а я могу её отменить", () => {
  const b = new LOB.Book({ seed: 9 }), o = b.limit("B", b.bestBid() - 4, 2, "me");
  for (let i = 0; i < 20; i++) b.step();
  assert(b.myOrders.has(o.id), "чужие участники отменили мою заявку"); assert(b.cancel(o.id)); assert(!b.myOrders.has(o.id));
});
test("дисбаланс предсказывает направление: после перекоса к bid mid растёт чаще, чем падает, и наоборот", () => {
  const r = LOB.imbalanceExperiment({ k: 1, h: 5 }, 30000, 1);
  assert(r[4].up > r[4].down + 0.1, "bid-перекос: " + r[4].up + " vs " + r[4].down); assert(r[0].down > r[0].up + 0.1, "ask-перекос: " + r[0].down + " vs " + r[0].up);
  for (let i = 1; i < 5; i++) assert(r[i].up >= r[i - 1].up - 0.01, "P(up) должна расти с дисбалансом");
});
test("очередь: чем дальше от рынка заявка на покупку, тем реже она исполняется, но тем больше берёт на спреде", () => {
  const e = (pl) => LOB.queueExperiment({ place: pl, horizon: 300 }, 300, 100), join = e("join"), back1 = e("back1"), back3 = e("back3");
  assert(join.fillProb > back1.fillProb && back1.fillProb > back3.fillProb, "вероятности " + [join, back1, back3].map((x) => x.fillProb));
  assert(back3.captured > back1.captured && back1.captured > join.captured, "захваченный спред должен расти с удалением");
  assert(join.driftUnfilled > 1, "если заявка не исполнилась, цена в среднем ушла вверх");
});
test("аукцион: цена максимизирует объём, исполняемые объёмы с двух сторон равны", () => {
  const o = [{ side: "B", price: 101, qty: 5 }, { side: "B", price: 100, qty: 8 }, { side: "B", price: 99, qty: 10 }, { side: "B", price: 98, qty: 12 }, { side: "B", price: 97, qty: 6 },
    { side: "S", price: 96, qty: 4 }, { side: "S", price: 98, qty: 7 }, { side: "S", price: 99, qty: 9 }, { side: "S", price: 100, qty: 10 }, { side: "S", price: 102, qty: 8 }];
  const r = LOB.auction(o, 99); assert.strictEqual(r.price, 99); assert.strictEqual(r.volume, 20);
  const buy = o.reduce((a, x, i) => a + (x.side === "B" ? r.fills[i] : 0), 0), sell = o.reduce((a, x, i) => a + (x.side === "S" ? r.fills[i] : 0), 0);
  assert.strictEqual(buy, 20); assert.strictEqual(sell, 20);
  r.fills.forEach((q, i) => { if (q > 0) assert(o[i].side === "B" ? o[i].price >= r.price : o[i].price <= r.price); });
  assert.strictEqual(LOB.auction([{ side: "B", price: 90, qty: 5 }, { side: "S", price: 95, qty: 5 }], 92).price, null);
});
test("аукцион: рыночные заявки исполняются первыми, при равных вариантах берётся цена ближе к референсной", () => {
  const o = [{ side: "B", price: null, qty: 3 }, { side: "B", price: 100, qty: 3 }, { side: "S", price: 99, qty: 3 }, { side: "S", price: 100, qty: 3 }];
  const r = LOB.auction(o, 100); assert.strictEqual(r.volume, 6); assert.strictEqual(r.fills[0], 3); assert.strictEqual(r.price, 100);
});

console.log("\nПоиск по курсу");
require(path.join(ROOT, "assets", "search.js"));
const first = (q, n) => C.search.search(q, n || 5).lessons.map((x) => x.doc.id);
test("поиск находит нужные уроки на первых местах", () => {
  assert(first("закон квадратного корня", 3).includes("m04-l2"), "закон квадратного корня → " + first("закон квадратного корня", 3));
  assert(first("Glosten Milgrom", 3).includes("m03-l3"), "Glosten Milgrom → " + first("Glosten Milgrom", 3));
  assert(first("Almgren Chriss", 3).includes("m06-l2"), "Almgren Chriss → " + first("Almgren Chriss", 3));
  assert(first("спуфинг", 3).some((id) => id.startsWith("m08")), "спуфинг → " + first("спуфинг", 3));
  assert(first("производная", 3).some((id) => id.startsWith("mm-")), "производная → " + first("производная", 3));
  assert(first("Хоукса", 3).some((id) => id.startsWith("m07")), "Хоукса → " + first("Хоукса", 3));
});
test("морфология: формы слова находят один и тот же урок", () => {
  const a = first("спред", 8), b = first("спреды", 8), c = first("спреда", 8);
  assert(a.includes("m03-l1") && b.includes("m03-l1") && c.includes("m03-l1"), [a, b, c].join(" | "));
});
test("пустой и бессмысленный запрос ничего не находит и не падает", () => {
  assert.strictEqual(first("x").length, 0); assert.strictEqual(first("").length, 0); assert.strictEqual(first("qwertyzzz").length, 0);
});
test("поиск возвращает термины глоссария и безопасный фрагмент с подсветкой", () => {
  const r = C.search.search("adverse selection", 3); assert(r.terms.length >= 1, "нет терминов"); assert(r.lessons.length >= 1);
  assert(/<mark>/.test(r.lessons[0].snippet), "нет подсветки"); assert(!/<script/i.test(r.lessons[0].snippet));
});
test("формулы не попадают в индекс как текст", () => {
  assert.strictEqual(C.search._plain("слово $x^2+y$ ещё $$\\frac{a}{b}$$ тут").replace(/\s+/g, " "), "слово ещё тут");
});

console.log("\nПредварительные условия");
require(path.join(ROOT, "assets", "prereq.js"));
test("все ссылки предварительных условий указывают на существующие уроки раньше по порядку чтения", () => {
  const order = []; C.modules.forEach((m) => m.lessons.forEach((l) => order.push(l.id)));
  const pos = {}; order.forEach((id, i) => (pos[id] = i));
  Object.keys(C.prereq).forEach((id) => {
    assert(id in pos, "нет урока " + id);
    C.prereq[id].forEach((p) => { assert(p[0] in pos, id + " → нет урока " + p[0]); assert(pos[p[0]] < pos[id], id + " ссылается вперёд на " + p[0]); assert(p[0] !== id && p[1] && p[1].length > 3, id + ": пустая причина"); });
  });
});
test("каждый урок после первого в модуле имеет предварительные условия", () => {
  const miss = []; C.modules.forEach((m) => m.lessons.forEach((l, i) => { if (i > 0 && !C.prereq[l.id]) miss.push(l.id); }));
  const allowed = ["mm-l1", "m10-l6"]; const bad = miss.filter((id) => !allowed.includes(id));
  assert(!bad.length, "нет условий у: " + bad.join(", "));
});

console.log("\nПеренос прогресса");
test("экспорт → проверка → импорт возвращает те же данные", () => {
  const P = C.practice; localStorage.setItem("ms.done", JSON.stringify({ "m01-l1": true })); localStorage.setItem("ms.quiz", JSON.stringify({ "m01-l1": { 0: 1 } }));
  const e = JSON.parse(JSON.stringify(P.exportProgress())), v = P.validateProgress(e);
  assert(v.ok, v.error); assert.deepStrictEqual(v.data.done, { "m01-l1": true });
  localStorage.removeItem = localStorage.removeItem || ((k) => { delete store[k]; });
  delete store["ms.done"]; P.applyProgress(v.data, "replace");
  assert.deepStrictEqual(JSON.parse(localStorage.getItem("ms.done")), { "m01-l1": true });
});
test("проверка отклоняет чужие и повреждённые файлы", () => {
  const P = C.practice, bad = [null, [], {}, { app: "x" }, { app: "ms-course", version: 2, data: {} }, { app: "ms-course", version: 1, data: { done: { a: 5 } } },
    { app: "ms-course", version: 1, data: { quiz: { a: { 0: "x" } } } }, { app: "ms-course", version: 1, data: { srs: { a: { box: 1 } } } }, { app: "ms-course", version: 1, data: { project: { s9: { score: 1 } } } }, { app: "ms-course", version: 1, data: { theme: "red" } }];
  bad.forEach((b, i) => assert(!P.validateProgress(b).ok, "принят плохой файл №" + i));
  assert(P.validateProgress({ app: "ms-course", version: 1, data: { evil: 1, done: {} } }).ok);
  assert(!("evil" in P.validateProgress({ app: "ms-course", version: 1, data: { evil: 1 } }).data), "лишние ключи должны отбрасываться");
});
test("слияние: уроки складываются, из результатов берётся лучший, ответы не теряются", () => {
  const P = C.practice, a = { done: { x: true }, quiz: { l1: { 0: 1 } }, srs: { q: { box: 1, n: 2, ok: 1, due: 5 } }, tests: { m1: { best: 0.5, last: 0.5, passed: false, date: 1 } }, project: { s1: { score: 40, passed: false } } },
    b = { done: { y: true }, quiz: { l1: { 0: 2, 1: 3 }, l2: { 0: 0 } }, srs: { q: { box: 3, n: 6, ok: 5, due: 9 } }, tests: { m1: { best: 0.9, last: 0.9, passed: true, date: 2 } }, project: { s1: { score: 90, passed: true }, s2: { score: 10, passed: false } } };
  const m = P.mergeProgress(a, b);
  assert.deepStrictEqual(m.done, { x: true, y: true }); assert.strictEqual(m.quiz.l1[0], 1); assert.strictEqual(m.quiz.l1[1], 3); assert.strictEqual(m.quiz.l2[0], 0);
  assert.strictEqual(m.srs.q.n, 6); assert.strictEqual(m.tests.m1.best, 0.9); assert(m.tests.m1.passed); assert.strictEqual(m.project.s1.score, 90); assert(m.project.s1.passed); assert(m.project.s2);
});

console.log("\nОфлайн и сборка");
test("index.html не тянет ничего из интернета и все локальные файлы существуют", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert(!/(?:src|href)="https?:/.test(html), "в index.html есть внешняя ссылка");
  [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].forEach((m) => assert(fs.existsSync(path.join(ROOT, m[1])), "нет файла " + m[1]));
});
test("KaTeX лежит локально, шрифты на месте и CSS ссылается только на woff2", () => {
  const css = fs.readFileSync(path.join(ROOT, "vendor/katex/katex.min.css"), "utf8");
  const fonts = [...css.matchAll(/url\((fonts\/[^)]+)\)/g)].map((m) => m[1]); assert(fonts.length >= 15);
  fonts.forEach((f) => { assert(f.endsWith(".woff2"), f); assert(fs.existsSync(path.join(ROOT, "vendor/katex", f)), "нет " + f); });
});
test("в CSS, JS и модулях нет ссылок на внешние CDN", () => {
  const files = [].concat(fs.readdirSync(path.join(ROOT, "assets")).map((f) => path.join(ROOT, "assets", f)), fs.readdirSync(path.join(ROOT, "modules")).map((f) => path.join(ROOT, "modules", f)));
  files.forEach((f) => { const t = fs.readFileSync(f, "utf8"); assert(!/https?:\/\/(?:cdn|unpkg|fonts\.g)/.test(t), path.basename(f) + " ссылается на CDN"); });
});

console.log("\nИтог: " + passed + " пройдено, " + failed + " упало");
process.exit(failed ? 1 : 0);
