/* Дымовой тест в jsdom: открывает index.html и обходит все страницы курса.
   Проверяет: нет ошибок в консоли и исключений, формулы KaTeX отрисованы без ошибок, виджеты запускаются,
   ползунки и кнопки на всех уроках выдерживают крайние значения, работают тесты, повторение, лаборатория и проект.
   Запуск: node tests/smoke.js (нужен jsdom: npm install). */
"use strict";
const path = require("path"), fs = require("fs");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..", "course");
const errors = []; let checks = 0;
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.detail && e.detail.stack || e.stack || e.message).split("\n").slice(0, 4).join(" | ")));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), {
  url: "file:///" + ROOT.replace(/\\/g, "/") + "/index.html", runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    const ctx = new Proxy({}, { get: (t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "canvas" ? undefined : () => {}), set: () => true });
    w.HTMLCanvasElement.prototype.getContext = function () { return ctx; };
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
    const mem = {}; Object.defineProperty(w, "localStorage", { value: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } } });
    w.scrollTo = () => {}; w.confirm = () => false;
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.URL.createObjectURL = () => "blob:x";
  }
});
const w = dom.window, d = w.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, msg) => { checks++; if (!cond) errors.push(msg); };
async function go(hash) { w.location.hash = hash; await sleep(25); }
const text = () => d.getElementById("content").textContent;

(async () => {
  for (let i = 0; i < 100 && !(w.Course && w.Course.app); i++) await sleep(50);
  ok(w.Course && w.Course.app, "приложение не загрузилось");
  if (!(w.Course && w.Course.app)) return finish();
  const C = w.Course;
  ok(!!w.katex && !!w.renderMathInElement, "KaTeX не загрузился из vendor/");
  ok(C.modules.length === 12, "модулей " + C.modules.length);

  await go("#/");
  ok(d.querySelectorAll(".card").length >= 18, "на главной мало карточек");

  // все уроки: рендер, формулы, виджеты, крайние значения ползунков, кнопки
  let lessons = 0, sliders = 0, buttons = 0, terms = 0;
  for (const m of C.modules) for (const l of m.lessons) {
    await go("#/" + m.id + "/" + l.id); lessons++;
    const c = d.getElementById("content");
    ok(c.querySelector("h1") && c.querySelector("h1").textContent === l.title, l.id + ": заголовок");
    ok(c.querySelectorAll(".quiz .q").length === (l.quiz || []).length, l.id + ": число вопросов");
    ok(!c.querySelector(".katex-error"), l.id + ": ошибка формулы KaTeX");
    ok(!/Ошибка виджета|Виджет не найден/.test(c.textContent), l.id + ": " + (/Ошибка виджета[^.]*|Виджет не найден[^.]*/.exec(c.textContent) || [""])[0]);
    terms += c.querySelectorAll(".term").length;
    for (const r of c.querySelectorAll("input[type=range]")) {
      sliders++;
      const st = +r.step || 1, mid = Math.round(((+r.min + +r.max) / 2 - +r.min) / st) * st + +r.min;
      for (const v of [r.min, r.max, mid]) { r.value = v; r.dispatchEvent(new w.Event("input", { bubbles: true })); }
    }
    for (const b of c.querySelectorAll(".widget button")) { buttons++; b.click(); }
    ok(!/Ошибка виджета/.test(c.textContent), l.id + ": ошибка виджета после взаимодействия");
  }
  ok(terms > 200, "подсказок к терминам слишком мало: " + terms);

  // тест в уроке: ответ сохраняется
  await go("#/m01/m01-l1");
  const opt = d.querySelector(".quiz .q .opt"); opt.click();
  ok(JSON.parse(w.localStorage.getItem("ms.quiz"))["m01-l1"]["0"] === 0, "ответ на тест не сохранился");
  await go("#/m01/m01-l2"); await go("#/m01/m01-l1");
  ok(d.querySelector(".quiz .q.answered"), "ответ не восстановился после повторного открытия");

  // повторение и тесты модулей
  await go("#/review");
  ok(/Повторение/.test(text()), "страница повторения");
  const due = d.getElementById("startDue"); ok(!!due || /нечего|Пройдите/.test(text()), "повторение: нет ни кнопки, ни сообщения");
  d.getElementById("startRand").click();
  for (let i = 0; i < 10; i++) { const o = d.querySelector(".q.sess .opt"); if (!o) break; o.click(); d.getElementById("nextQ").click(); }
  ok(/результат/i.test(text()), "тренировка не дошла до результата");
  for (const m of C.modules) {
    await go("#/test/" + m.id);
    let n = 0; while (d.querySelector(".q.sess .opt")) { d.querySelectorAll(".q.sess .opt")[0].click(); d.getElementById("nextQ").click(); n++; if (n > 12) break; }
    ok(n >= 8 && n <= 10, m.id + ": в итоговом тесте " + n + " вопросов");
    ok(/результат/.test(text()), m.id + ": нет экрана результата");
  }
  ok(!!JSON.parse(w.localStorage.getItem("ms.tests")), "результаты тестов модулей не сохранены");

  // лаборатория и проект
  await go("#/lab");
  const labBtns = [...d.querySelectorAll("#deskA button, #deskB button, #deskC button, #deskD button, #deskE button, #deskF button")]; ok(labBtns.length > 25, "в лаборатории мало кнопок: " + labBtns.length);
  for (const b of labBtns) { if (b.textContent === "▶ Запустить" || b.classList.contains("adel")) continue; b.click(); }
  for (const r of d.querySelectorAll("#deskA input[type=range], #deskB input[type=range], #deskC input[type=range], #deskD input[type=range], #deskE input[type=range], #deskF input[type=range]")) for (const v of [r.min, r.max]) { r.value = v; r.dispatchEvent(new w.Event("input", { bubbles: true })); }
  ok(d.querySelectorAll("#deskC .ladder tr").length > 10, "стакан не нарисован"); ok(/Куплено|Продано|встала в очередь|отменены/.test(d.querySelector("#deskC").textContent), "действия в стакане не отработали");
  ok(d.querySelectorAll("#deskF tr[data-i]").length >= 10, "в аукционе нет заявок"); ok(/Цена аукциона/.test(d.getElementById("deskF").textContent), "аукцион не рассчитан");
  for (const c of d.querySelectorAll("#deskF .adel")) { c.click(); break; }
  ok(/Ошибка стола/.test(text()) === false, "ошибка в одном из столов лаборатории");
  ok(/Ошибка/.test(text()) === false, "лаборатория: ошибка");
  await go("#/project");
  ok(d.querySelectorAll(".stage").length === 4, "в проекте не 4 этапа");
  const stageBtns = [...d.querySelectorAll(".stage button")].filter((b) => /Проверить|Зафиксировать|Подобрать/.test(b.textContent));
  for (const b of stageBtns) b.click();
  ok(JSON.parse(w.localStorage.getItem("ms.project")).s3, "этап 3 не сохранил результат");
  ok(/Отчёт/.test(d.querySelector(".report").textContent), "нет отчёта");

  // глоссарий и источники
  await go("#/glossary"); ok(d.querySelectorAll(".gl-item").length >= 220, "в глоссарии мало терминов");
  await go("#/sources"); ok(d.querySelectorAll(".srclist li").length >= 52, "в источниках мало записей");
  ok(d.querySelector(".pill.alpha"), "нет пометки Alpha!");
  for (const id of ["01", "02", "03", "04", "05", "06"]) ok(d.querySelectorAll("#src-" + id + " .uses a").length >= 1, "источник [" + id + "] не привязан ни к одному уроку");
  await go("#/sources/05"); ok(d.getElementById("src-05").classList.contains("focus"), "переход по #/sources/05 не подсветил запись");
  await go("#/m05/m05-l4"); ok(d.querySelectorAll("a.cite").length > 3, "ссылки [NN] в тексте урока не превратились в ссылки");
  await go("#/progress");
  ok(d.getElementById("dl") && d.getElementById("fileIn"), "нет кнопок экспорта/импорта прогресса");
  await go("#/search/" + encodeURIComponent("резервная цена"));
  ok(d.querySelectorAll(".sres").length >= 3, "поиск по курсу не нашёл уроки"); ok(d.querySelector("#sres .gl-item"), "поиск не показал термин глоссария");
  ok(d.querySelector("#topSearch input"), "нет поля поиска в верхней панели");
  d.querySelector(".sres .stitle").click(); await sleep(60);
  ok(d.querySelector("details.prereq") && d.querySelectorAll("details.prereq li").length >= 2, "нет блока «Что нужно знать»");
  await go("#/m05/m05-l2"); ok(d.querySelector("details.prereq li a"), "в уроке нет ссылок предварительных условий");

  console.log("Уроков: " + lessons + ", ползунков: " + sliders + ", кнопок в виджетах: " + buttons + ", подсказок к терминам: " + terms + ", проверок: " + checks);
  finish();
})().catch((e) => { errors.push("исключение теста: " + e.stack); finish(); });

function finish() {
  const uniq = [...new Set(errors)];
  if (uniq.length) { console.log("ОШИБКИ (" + uniq.length + "):\n - " + uniq.slice(0, 30).join("\n - ")); process.exit(1); }
  console.log("Дымовой тест пройден."); process.exit(0);
}
