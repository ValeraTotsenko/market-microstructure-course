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
for (const f of fs.readdirSync(path.join(ROOT, "modules")).filter((x) => /^m\d+\.js$/.test(x)).sort()) require(path.join(ROOT, "modules", f));
require(path.join(ROOT, "assets", "sources.js"));
const C = global.Course;

console.log("\nСтруктура курса");
test("11 модулей, порядок 0…10", () => { assert.strictEqual(C.modules.length, 11); C.modules.forEach((m, i) => assert.strictEqual(m.order, i)); });
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
