/* Оболочка курса: навигация, прогресс, глоссарий, список источников; подключает практику и лабораторию. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const content = $("#content"), sidebar = $("#sidebar");
  const store = Course.store, P = Course.practice;
  let done = store.get("done", {});
  const mods = () => Course.modules;
  const allLessons = () => mods().flatMap((m) => m.lessons.map((l) => ({ m, l })));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* «[05] Название» -> ссылка на запись в списке источников */
  const srcTitle = (t) => { const m = /^\[(\d{1,2})\]\s*(.*)$/.exec(t || ""); return m ? '<a href="#/sources/' + m[1].padStart(2, "0") + '">[' + m[1] + "]</a> " + esc(m[2]) : esc(t); };

  /* ---------- боковое меню ---------- */
  function renderSidebar(cur) {
    sidebar.innerHTML = "";
    const tools = document.createElement("div"); tools.className = "sb-tools";
    const nd = P.due().length;
    tools.innerHTML = '<a href="#/review">Повторение' + (nd ? ' <span class="badge">' + nd + "</span>" : "") + '</a><a href="#/lab">Лаборатория</a><a href="#/project">Итоговый проект</a>';
    sidebar.appendChild(tools);
    mods().forEach((m) => {
      const box = document.createElement("div");
      box.className = "sb-mod" + (cur && cur.m === m.id ? " open" : "");
      const btn = document.createElement("button");
      btn.innerHTML = '<span class="num">' + (m.badge || m.order) + '</span><span>' + esc(m.title) + "</span>";
      btn.onclick = () => box.classList.toggle("open");
      const ls = document.createElement("div"); ls.className = "sb-lessons";
      m.lessons.forEach((l) => {
        const a = document.createElement("a"); a.href = "#/" + m.id + "/" + l.id;
        a.className = (done[l.id] ? "done " : "") + (cur && cur.l === l.id ? "cur" : "");
        a.innerHTML = "<span>" + esc(l.title) + "</span>";
        a.onclick = () => sidebar.classList.remove("open");
        ls.appendChild(a);
      });
      const ti = P.testInfo(m.id), ta = document.createElement("a");
      ta.href = "#/test/" + m.id; ta.className = "test-link" + (ti && ti.passed ? " passed" : "");
      ta.innerHTML = "<span>Итоговый тест" + (ti ? " · " + Math.round(ti.best * 100) + "%" : "") + "</span>";
      ta.onclick = () => sidebar.classList.remove("open");
      ls.appendChild(ta);
      box.append(btn, ls); sidebar.appendChild(box);
    });
  }

  /* ---------- страницы ---------- */
  function home() {
    const total = allLessons().length, d = allLessons().filter((x) => done[x.l.id]).length;
    const nd = P.due().length, acc = P.accuracy();
    let h = "<h1>Микроструктура рынка</h1>" +
      '<p class="lead">Практический курс для тех, кто уже знает, что такое акции и биржа, но хочет понять, как на самом деле формируется цена, спред и издержки сделки. Теория, формулы, числовые примеры, интерактивные модели, тесты и итоговый проект.</p>' +
      '<div class="callout key"><span class="t">Как идти по курсу</span>Модули выстроены от простого к сложному. Модуль 0 — справочный: если вы уверенно знаете форварды, опционы и броуновское движение, пропустите его. Каждый урок заканчивается тестом (ответы сохраняются) и списком источников. Подчёркнутые термины в тексте раскрываются по наведению. Если формулы читаются тяжело (прошло много лет после школы), начните с модуля Σ: он повторяет математику ровно в том объёме, который нужен для курса.</div>' +
      "<p>Пройдено уроков: <b>" + d + "</b> из " + total + '.</p><div class="bar"><i style="width:' + (total ? (d / total) * 100 : 0) + '%"></i></div>';
    const nxt = allLessons().find((x) => !done[x.l.id]);
    if (nxt) h += '<p><a class="btn" style="text-decoration:none;display:inline-block" href="#/' + nxt.m.id + "/" + nxt.l.id + '">' + (d ? "Продолжить: " : "Начать: ") + esc(nxt.l.title) + "</a></p>";
    const prj = Course.project ? Course.project.summary() : null;
    h += '<h2>Практика</h2><div class="cards">' +
      '<a class="card" href="#/review"><h3>Повторение' + (nd ? ' <span class="badge">' + nd + "</span>" : "") + "</h3><p>" + (nd ? nd + " вопр. ждут повторения." : "Вопросы из пройденных тестов возвращаются через 1–35 дней.") + (acc.n ? " Точность: " + Math.round(acc.ok / acc.n * 100) + "%." : "") + "</p></a>" +
      '<a class="card" href="#/lab"><h3>Лаборатория</h3><p>Шесть столов: маркет-мейкер, исполнение крупного ордера, живой стакан заявок, очередь, дисбаланс и аукцион. Меняйте параметры и смотрите, что будет с деньгами.</p></a>' +
      '<a class="card" href="#/project"><h3>Итоговый проект «Торговая смена»</h3><p>Четыре этапа: издержки, исполнение, котирование, проверка на новых данных.' + (prj ? " Пройдено этапов: " + prj.done + " из " + prj.total + "." : "") + "</p></a>" +
      '<a class="card" href="#/progress"><h3>Мой прогресс</h3><p>Скачайте прогресс в JSON-файл или восстановите его из файла: так его можно сохранить и перенести на другой компьютер.</p></a></div>';
    const paths = [
      ["Быстрый путь (≈ 10 ч)", "Суть без тяжёлой математики: рынок, книга заявок, спред, издержки.", ["m01", "m02", "m03", "m04"]],
      ["Путь маркет-мейкера", "От спреда к модели Avellaneda–Stoikov и оптимальному исполнению.", ["m03", "m05", "m06", "m07"]],
      ["Путь аналитика рынка", "Манипуляции, другие рынки, стратегии и бэктест.", ["m02", "m08", "m09", "m10"]]
    ];
    h += "<h2>Маршруты</h2><div class=cards>" + paths.map((p) => {
      const first = mods().find((m) => m.id === p[2][0]);
      const href = first && first.lessons[0] ? "#/" + first.id + "/" + first.lessons[0].id : "#/";
      return '<a class="card" href="' + href + '"><h3>' + p[0] + "</h3><p>" + p[1] + "</p><p>Модули: " + p[2].map((i) => Number(i.slice(1))).join(", ") + "</p></a>";
    }).join("") + '</div><h2>Все модули</h2><div class="cards">';
    mods().forEach((m) => {
      const t = m.lessons.length, dm = m.lessons.filter((l) => done[l.id]).length, ti = P.testInfo(m.id);
      const first = m.lessons[0] ? "#/" + m.id + "/" + m.lessons[0].id : "#/";
      h += '<a class="card" href="' + first + '"><span class="pill">Модуль ' + (m.badge || m.order) + "</span>" + (m.level ? '<span class="pill">' + esc(m.level) + "</span>" : "") +
        (ti ? '<span class="pill ' + (ti.passed ? "ok" : "") + '">тест ' + Math.round(ti.best * 100) + "%</span>" : "") +
        "<h3>" + esc(m.title) + "</h3><p>" + esc(m.summary || "") + "</p><p>" + t + " ур. · " + esc(m.time || "") + '</p><div class="bar"><i style="width:' + (t ? (dm / t) * 100 : 0) + '%"></i></div></a>';
    });
    content.innerHTML = h + "</div>";
    renderSidebar(null); typeset();
  }

  function lesson(mid, lid) {
    const m = mods().find((x) => x.id === mid); const l = m && m.lessons.find((x) => x.id === lid);
    if (!l) return notFound();
    const list = allLessons(), idx = list.findIndex((x) => x.l.id === lid), prev = list[idx - 1], next = list[idx + 1];
    let h = '<div class="crumbs"><a href="#/">Курс</a> › Модуль ' + (m.badge || m.order) + ". " + esc(m.title) + "</div><h1>" + esc(l.title) + "</h1>" +
      '<p><span class="pill">' + (l.minutes || 15) + " мин</span>" + (l.level ? '<span class="pill">' + esc(l.level) + "</span>" : "") + '</p>' + (m.id !== "mm" && l.html.indexOf("$") >= 0 ? '<p class="lab-note">Трудно читать формулы? <a href="#/mm/mm-l1">Повторение математики</a>: с нуля и на примерах из курса.</p>' : "") + '<div class="lesson-body">' + l.html + "</div>";
    h += P.quizHTML(l);
    if (l.sources && l.sources.length) {
      h += '<div class="srcs"><b>Источники урока</b><ul>' + l.sources.map((s) => "<li>" + srcTitle(s.title) + (s.where ? " — " + esc(s.where) : "") + (s.note ? ". " + esc(s.note) : "") + "</li>").join("") + "</ul></div>";
    }
    h += '<p><button class="btn" id="doneBtn">' + (done[lid] ? "✓ Урок пройден (снять отметку)" : "Отметить как пройденный") + "</button></p>";
    const lastOfModule = idx === list.length - 1 || (next && next.m.id !== m.id);
    if (lastOfModule) h += '<div class="callout key"><span class="t">Модуль пройден?</span>Проверьте себя итоговым тестом из 10 вопросов по всем урокам модуля. <a href="#/test/' + m.id + '">Начать итоговый тест</a>.</div>';
    h += '<div class="nav-row">' + (prev ? '<a href="#/' + prev.m.id + "/" + prev.l.id + '"><small>← Назад</small>' + esc(prev.l.title) + "</a>" : "<span></span>") +
      (next ? '<a class="next" href="#/' + next.m.id + "/" + next.l.id + '"><small>Дальше →</small>' + esc(next.l.title) + "</a>" : "<span></span>") + "</div>";
    content.innerHTML = h;
    P.mountQuiz(content, l);
    $("#doneBtn").onclick = () => { done[lid] = !done[lid]; if (!done[lid]) delete done[lid]; store.set("done", done); lesson(mid, lid); };
    // виджеты
    content.querySelectorAll("[data-widget]").forEach((root) => {
      const fn = l.widgets && l.widgets[root.dataset.widget];
      root.classList.add("widget");
      if (root.dataset.title) { const t = document.createElement("div"); t.className = "w-title"; t.textContent = root.dataset.title; root.prepend(t); }
      if (!fn) { root.insertAdjacentHTML("beforeend", "<i>Виджет не найден: " + esc(root.dataset.widget) + "</i>"); return; }
      try { fn(root); } catch (e) { root.insertAdjacentHTML("beforeend", '<p style="color:var(--bad)">Ошибка виджета: ' + esc(e.message) + "</p>"); console.error(e); }
    });
    renderSidebar({ m: mid, l: lid }); window.scrollTo(0, 0);
    typeset(() => { try { const b = content.querySelector(".lesson-body"); P.linkCitations(b); P.decorateTerms(b); } catch (e) { console.error(e); } });
  }

  function glossary() {
    const terms = mods().flatMap((m) => m.terms.map((t) => Object.assign({ mod: m.badge || m.order }, t)));
    terms.sort((a, b) => (a.en || "").localeCompare(b.en || ""));
    content.innerHTML = "<h1>Глоссарий</h1><p class=lead>Термины из всех модулей (" + terms.length + ").</p><input class=gl-search placeholder='Поиск по русскому или английскому термину…'><div id=gl></div>";
    const draw = (q) => {
      q = q.toLowerCase();
      $("#gl").innerHTML = terms.filter((t) => !q || (t.en + " " + t.ru + " " + t.def).toLowerCase().includes(q)).map((t) =>
        '<div class="gl-item"><b>' + esc(t.en) + '</b> — <span class="ru">' + esc(t.ru) + '</span> <span class="pill">мод. ' + t.mod + "</span><p>" + t.def + "</p></div>").join("");
      typeset();
    };
    $(".gl-search").addEventListener("input", (e) => draw(e.target.value)); draw("");
    renderSidebar(null);
  }

  /* Где источник используется: уроки, в чьих «Источниках» он указан или где на него есть [NN] в тексте. */
  function sourceUsage() {
    const use = {};
    mods().forEach((m) => m.lessons.forEach((l) => {
      const ids = new Set();
      (l.sources || []).forEach((s) => { const x = /^\[(\d{1,2})\]/.exec(s.title || ""); if (x) ids.add(x[1].padStart(2, "0")); });
      (l.html.match(/\[\d{1,2}\]/g) || []).forEach((t) => ids.add(t.slice(1, -1).padStart(2, "0")));
      ids.forEach((id) => (use[id] = use[id] || []).push({ m: m, l: l }));
    }));
    return use;
  }
  function sources(focus) {
    const S = window.COURSE_SOURCES || [], use = sourceUsage();
    const groups = {}; S.forEach((s) => (groups[s.group] = groups[s.group] || []).push(s));
    let h = "<h1>Источники</h1><p class=lead>Материалы из вашей папки «Книги/Исследования», на которых построен курс. Номер — это идентификатор файла в ссылках на уроки; у каждого источника ниже перечислены уроки, где он используется. Группа с пометкой «Alpha!» — это шесть статей из исходной подборки; для каждой ниже показано, в каких уроках она разобрана.</p>";
    for (const g in groups) {
      const alpha = /alpha/i.test(g);
      h += "<h2>" + esc(g) + (alpha ? ' <span class="pill alpha">Alpha!</span>' : "") + "</h2><ul class='srclist'>" + groups[g].map((s) => {
        const u = use[String(s.id).padStart(2, "0")] || [];
        return '<li id="src-' + String(s.id).padStart(2, "0") + '"><b>[' + s.id + "]</b> " + esc(s.title) + (s.note ? " — <i>" + esc(s.note) + "</i>" : "") +
          '<div class="uses">' + (u.length ? "В курсе: " + u.map((x) => '<a href="#/' + x.m.id + "/" + x.l.id + '">' + esc(x.l.title) + "</a>").join(" · ") : "Только справочно: в уроках не используется.") + "</div></li>";
      }).join("") + "</ul>";
    }
    content.innerHTML = h; renderSidebar(null);
    if (focus) { const el = document.getElementById("src-" + String(focus).padStart(2, "0")); if (el) { el.classList.add("focus"); el.scrollIntoView({ block: "center" }); } }
  }

  function notFound() { content.innerHTML = "<h1>Страница не найдена</h1><p><a href='#/'>На главную</a></p>"; }

  function typeset(after) {
    const run = () => {
      try { renderMathInElement(content, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false }); } catch (e) {}
      after && after();
    };
    if (window.renderMathInElement) run();
    else { typeset.q = (typeset.q || []).concat([run]); if (!typeset.wait) typeset.wait = setInterval(() => { if (window.renderMathInElement) { clearInterval(typeset.wait); typeset.wait = null; const q = typeset.q; typeset.q = []; q.length && q[q.length - 1](); } }, 200); }
  }

  function route() {
    const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    sidebar.classList.remove("open");
    if (!p.length) return home();
    if (p[0] === "glossary") return glossary();
    if (p[0] === "sources") return sources(p[1]);
    if (p[0] === "progress") return P.renderProgress(content);
    if (p[0] === "review") return P.renderReview(content);
    if (p[0] === "test" && p[1]) return P.renderTest(content, p[1]);
    if (Course.pages && Course.pages[p[0]]) { renderSidebar(null); window.scrollTo(0, 0); return Course.pages[p[0]](content, p.slice(1)); }
    if (p.length === 1) { const m = mods().find((x) => x.id === p[0]); if (m && m.lessons[0]) return lesson(m.id, m.lessons[0].id); }
    return lesson(p[0], p[1]);
  }

  Course.app = { content: content, typeset: typeset, renderSidebar: renderSidebar, notFound: notFound, route: route, esc: esc };

  $("#menuBtn").onclick = () => sidebar.classList.toggle("open");
  $("#themeBtn").onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
    const nx = cur === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = nx; store.set("theme", nx); route();
  };
  const th = store.get("theme", null); if (th) document.documentElement.dataset.theme = th;
  P.initTooltips();
  window.addEventListener("hashchange", route);
  route();
})();
