/* Практика: сохранение ответов на тесты, повторение через интервалы (карточки Лейтнера),
   итоговые тесты модулей и всплывающие определения терминов.
   Хранилище — localStorage (в try/catch): без него всё работает, просто ничего не запоминается. */
(function () {
  const C = window.Course;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- хранилище ---------- */
  C.store = {
    get(k, d) { try { const v = localStorage.getItem("ms." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ms." + k, JSON.stringify(v)); } catch (e) {} }
  };
  const S = C.store;
  const DAY = 86400000, STEPS = [1, 3, 7, 16, 35]; // интервалы повторения, дни
  const P = (C.practice = {});

  /* ---------- вопросы ---------- */
  P.all = function () {
    const out = [];
    C.modules.forEach((m) => m.lessons.forEach((l) => (l.quiz || []).forEach((q, qi) => out.push({ id: l.id + "#" + qi, mid: m.id, lid: l.id, lesson: l.title, mod: m, q: q }))));
    return out;
  };
  P.byId = function (id) { return P.all().find((x) => x.id === id); };

  /* ---------- повторение ---------- */
  P.srs = () => S.get("srs", {});
  P.record = function (id, ok) {
    const srs = P.srs(), r = srs[id] || { box: 0, ok: 0, n: 0 };
    r.n++; if (ok) r.ok++;
    if (ok) { r.box = Math.min(r.box + 1, STEPS.length); r.due = Date.now() + STEPS[r.box - 1] * DAY; }
    else { r.box = 0; r.due = Date.now(); }
    srs[id] = r; S.set("srs", srs);
  };
  P.due = function () { const srs = P.srs(), now = Date.now(); return P.all().filter((x) => srs[x.id] && srs[x.id].due <= now); };
  P.nextDue = function () { const srs = P.srs(), now = Date.now(); let m = Infinity; Object.keys(srs).forEach((k) => { if (srs[k].due > now && srs[k].due < m) m = srs[k].due; }); return m === Infinity ? null : m; };
  P.accuracy = function () { const srs = P.srs(); let n = 0, ok = 0; Object.keys(srs).forEach((k) => { n += srs[k].n; ok += srs[k].ok; }); return { n: n, ok: ok }; };

  /* ---------- тест внутри урока (ответы сохраняются) ---------- */
  P.lessonScore = function (l) {
    const a = S.get("quiz", {})[l.id] || {}, total = (l.quiz || []).length;
    let right = 0, answered = 0;
    (l.quiz || []).forEach((q, i) => { if (a[i] != null) { answered++; if (a[i] === q.answer) right++; } });
    return { answered: answered, right: right, total: total };
  };
  P.quizHTML = function (l) {
    if (!l.quiz || !l.quiz.length) return "";
    let h = '<section class="quiz"><h2>Проверьте себя <span class="qscore" id="qscore"></span></h2>';
    l.quiz.forEach((q, qi) => {
      h += '<div class="q" data-qi="' + qi + '"><div>' + (qi + 1) + ". " + q.q + '</div><div class="opts">' +
        q.options.map((o, oi) => '<button class="opt" data-oi="' + oi + '">' + o + "</button>").join("") + '</div><div class="why">' + (q.explain || "") + "</div></div>";
    });
    return h + '<p><button class="btn ghost" id="quizReset" style="display:none">Пройти тест заново</button></p></section>';
  };
  P.mountQuiz = function (root, l) {
    const box = root.querySelector(".quiz"); if (!box) return;
    const saved = S.get("quiz", {}), mine = () => (saved[l.id] = saved[l.id] || {});
    const upd = () => {
      const sc = P.lessonScore(l), el = box.querySelector("#qscore"), rb = box.querySelector("#quizReset");
      el.textContent = sc.answered ? "· " + sc.right + " из " + sc.total + (sc.answered < sc.total ? " (отвечено " + sc.answered + ")" : "") : "";
      rb.style.display = sc.answered ? "" : "none";
    };
    const mark = (qel, q, oi) => {
      qel.classList.add("answered");
      const opts = qel.querySelectorAll(".opt");
      opts[oi].classList.add(oi === q.answer ? "ok" : "no"); opts[q.answer].classList.add("ok");
    };
    box.querySelectorAll(".q").forEach((qel) => {
      const qi = +qel.dataset.qi, q = l.quiz[qi], prev = (saved[l.id] || {})[qi];
      if (prev != null) mark(qel, q, prev);
      qel.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
        if (qel.classList.contains("answered")) return;
        const oi = +b.dataset.oi; mark(qel, q, oi);
        mine()[qi] = oi; S.set("quiz", saved); P.record(l.id + "#" + qi, oi === q.answer); upd();
      }));
    });
    box.querySelector("#quizReset").onclick = () => {
      delete saved[l.id]; S.set("quiz", saved);
      box.querySelectorAll(".q").forEach((qel) => { qel.classList.remove("answered"); qel.querySelectorAll(".opt").forEach((b) => b.classList.remove("ok", "no")); });
      upd();
    };
    upd();
  };

  /* ---------- сессия вопросов: повторение и итоговые тесты ---------- */
  function session(content, o) {
    // o: {title, intro, questions:[{id,q,lid,lesson,mid}], passAt?, onFinish(result)}
    let i = 0, right = 0; const wrong = [];
    const draw = () => {
      if (i >= o.questions.length) return finish();
      const it = o.questions[i], q = it.q;
      content.innerHTML = '<div class="crumbs"><a href="#/">Курс</a> › ' + esc(o.title) + "</div><h1>" + esc(o.title) + "</h1>" +
        '<div class="bar"><i style="width:' + (i / o.questions.length * 100) + '%"></i></div>' +
        '<p class="muted">Вопрос ' + (i + 1) + " из " + o.questions.length + " · из урока «" + esc(it.lesson) + "»</p>" +
        '<div class="q sess"><div class="qtext">' + q.q + '</div><div class="opts">' +
        q.options.map((t, oi) => '<button class="opt" data-oi="' + oi + '">' + t + "</button>").join("") + '</div><div class="why">' + (q.explain || "") + "</div></div>" +
        '<p><button class="btn" id="nextQ" style="display:none">' + (i + 1 < o.questions.length ? "Дальше" : "Завершить") + "</button></p>";
      const qel = content.querySelector(".q");
      qel.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => {
        if (qel.classList.contains("answered")) return;
        qel.classList.add("answered");
        const oi = +b.dataset.oi, ok = oi === q.answer;
        b.classList.add(ok ? "ok" : "no"); qel.querySelectorAll(".opt")[q.answer].classList.add("ok");
        if (ok) right++; else wrong.push(it);
        P.record(it.id, ok);
        content.querySelector("#nextQ").style.display = ""; content.querySelector("#nextQ").focus();
        C.app.typeset();
      }));
      content.querySelector("#nextQ").onclick = () => { i++; draw(); };
      C.app.typeset(); window.scrollTo(0, 0);
    };
    const finish = () => {
      const n = o.questions.length, pct = n ? right / n : 0;
      const res = { right: right, total: n, pct: pct, passed: o.passAt != null ? pct >= o.passAt : null };
      o.onFinish && o.onFinish(res);
      let h = '<div class="crumbs"><a href="#/">Курс</a> › ' + esc(o.title) + "</div><h1>" + esc(o.title) + ": результат</h1>" +
        '<div class="scorebox ' + (res.passed === false ? "bad" : "good") + '"><b>' + right + " из " + n + "</b> · " + Math.round(pct * 100) + "%" +
        (res.passed === true ? " — тест сдан" : res.passed === false ? " — порог " + Math.round(o.passAt * 100) + "%, попробуйте ещё раз" : "") + "</div>";
      if (wrong.length) {
        h += "<h2>Над чем стоит поработать</h2><ul>" + wrong.map((w) => '<li>«' + esc(w.lesson) + '» — <a href="#/' + w.mid + "/" + w.lid + '">перечитать урок</a></li>').join("") + "</ul>";
      } else h += "<p>Ошибок нет.</p>";
      h += '<p><a class="btn" style="text-decoration:none;display:inline-block" href="' + (o.again || "#/") + '" id="again">' + (o.againLabel || "Ещё раз") + '</a> <a class="btn ghost" style="text-decoration:none;display:inline-block" href="#/">На главную</a></p>';
      content.innerHTML = h;
      const a = content.querySelector("#again"); a.addEventListener("click", (e) => { if (a.getAttribute("href") === location.hash) { e.preventDefault(); C.app.route(); } });
    };
    draw();
  }

  const shuffle = (a, rng) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  P.renderReview = function (content) {
    const A = C.app, due = P.due(), all = P.all(), srs = P.srs();
    const seen = all.filter((x) => srs[x.id]);
    const rng = C.rand.seeded(Date.now() & 0xffffff);
    const go = (qs, title) => session(content, { title: title, questions: qs, again: "#/review", againLabel: "Новая серия" });
    const acc = P.accuracy(), nd = P.nextDue();
    let h = "<h1>Повторение</h1><p class=lead>Вопросы, на которые вы уже отвечали в уроках, возвращаются через 1, 3, 7, 16 и 35 дней, если отвечать правильно. Ошибка возвращает вопрос в начало — так знания закрепляются надолго.</p>" +
      '<div class="cards">' +
      '<div class="card stat"><span class="big">' + due.length + "</span><p>вопросов ждут повторения</p></div>" +
      '<div class="card stat"><span class="big">' + seen.length + "/" + all.length + "</span><p>вопросов уже встречались</p></div>" +
      '<div class="card stat"><span class="big">' + (acc.n ? Math.round(acc.ok / acc.n * 100) + "%" : "—") + "</span><p>верных ответов за всё время (" + acc.n + ")</p></div></div>";
    if (due.length) h += '<p><button class="btn" id="startDue">Повторить (' + Math.min(10, due.length) + ")</button> ";
    else h += "<p>" + (seen.length ? "Сейчас повторять нечего" + (nd ? ": ближайшее повторение " + new Date(nd).toLocaleDateString("ru-RU") : "") + "." : "Пройдите тест хотя бы в одном уроке — и вопросы появятся здесь.") + "</p><p>";
    h += '<button class="btn ghost" id="startRand">Тренировка: 10 случайных вопросов</button></p>';
    content.innerHTML = h;
    const sd = content.querySelector("#startDue"); if (sd) sd.onclick = () => go(shuffle(due, rng).slice(0, 10), "Повторение");
    content.querySelector("#startRand").onclick = () => go(shuffle(all, rng).slice(0, 10), "Тренировка");
    A.renderSidebar(null);
  };

  P.testInfo = function (mid) { return S.get("tests", {})[mid] || null; };
  P.renderTest = function (content, mid) {
    const m = C.modules.find((x) => x.id === mid); if (!m) return C.app.notFound();
    const rng = C.rand.seeded((Date.now() & 0xffffff) + 7);
    // по 2 вопроса из каждого урока (не больше 10 всего), порядок случайный
    let qs = [];
    m.lessons.forEach((l) => qs = qs.concat(shuffle((l.quiz || []).map((q, qi) => ({ id: l.id + "#" + qi, mid: m.id, lid: l.id, lesson: l.title, q: q })), rng).slice(0, 2)));
    qs = shuffle(qs, rng).slice(0, 10);
    C.app.renderSidebar({ m: mid, l: null });
    session(content, {
      title: "Итоговый тест: модуль " + m.order, questions: qs, passAt: 0.7, again: "#/test/" + mid, againLabel: "Пересдать",
      onFinish: (r) => {
        const t = S.get("tests", {}), old = t[mid] || {};
        t[mid] = { best: Math.max(old.best || 0, r.pct), last: r.pct, passed: !!(old.passed || r.passed), date: Date.now() };
        S.set("tests", t);
      }
    });
  };

  /* ---------- перенос прогресса: экспорт, проверка, слияние, страница ---------- */
  const KEYS = ["done", "quiz", "srs", "tests", "project", "theme"];
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  const num = (x) => typeof x === "number" && isFinite(x);
  P.exportProgress = function () {
    const data = {}; KEYS.forEach((k) => { const v = S.get(k, null); if (v != null) data[k] = v; });
    return { app: "ms-course", version: 1, exportedAt: new Date().toISOString(), data: data };
  };
  /* Проверка структуры файла: возвращает {ok, error, data} с очищенными данными (неизвестные ключи отбрасываются). */
  P.validateProgress = function (obj) {
    if (!isObj(obj) || obj.app !== "ms-course") return { ok: false, error: "Это не файл прогресса курса (нет метки app)." };
    if (obj.version !== 1) return { ok: false, error: "Неизвестная версия файла: " + obj.version };
    if (!isObj(obj.data)) return { ok: false, error: "В файле нет раздела data." };
    const d = obj.data, out = {};
    if ("done" in d) { if (!isObj(d.done) || Object.values(d.done).some((v) => v !== true)) return { ok: false, error: "Раздел done повреждён." }; out.done = d.done; }
    if ("quiz" in d) {
      if (!isObj(d.quiz)) return { ok: false, error: "Раздел quiz повреждён." };
      for (const k in d.quiz) if (!isObj(d.quiz[k]) || Object.values(d.quiz[k]).some((v) => !Number.isInteger(v) || v < 0 || v > 20)) return { ok: false, error: "Раздел quiz повреждён (урок " + k + ")." };
      out.quiz = d.quiz;
    }
    if ("srs" in d) {
      if (!isObj(d.srs)) return { ok: false, error: "Раздел srs повреждён." };
      for (const k in d.srs) { const r = d.srs[k]; if (!isObj(r) || !num(r.box) || !num(r.n) || !num(r.ok) || (r.due != null && !num(r.due))) return { ok: false, error: "Раздел srs повреждён (" + k + ")." }; }
      out.srs = d.srs;
    }
    if ("tests" in d) {
      if (!isObj(d.tests)) return { ok: false, error: "Раздел tests повреждён." };
      for (const k in d.tests) { const r = d.tests[k]; if (!isObj(r) || !num(r.best)) return { ok: false, error: "Раздел tests повреждён (" + k + ")." }; }
      out.tests = d.tests;
    }
    if ("project" in d) {
      if (!isObj(d.project)) return { ok: false, error: "Раздел project повреждён." };
      for (const k in d.project) { const r = d.project[k]; if (!/^s[1-4]$/.test(k) || !isObj(r) || !num(r.score)) return { ok: false, error: "Раздел project повреждён (" + k + ")." }; }
      out.project = d.project;
    }
    if ("theme" in d) { if (d.theme !== "light" && d.theme !== "dark") return { ok: false, error: "Раздел theme повреждён." }; out.theme = d.theme; }
    return { ok: true, data: out };
  };
  /* Слияние двух наборов: ничего не теряем, при конфликте берём лучшее/более подробное. */
  P.mergeProgress = function (a, b) {
    const m = {};
    if (a.done || b.done) m.done = Object.assign({}, a.done, b.done);
    if (a.quiz || b.quiz) {
      m.quiz = {};
      [a.quiz || {}, b.quiz || {}].forEach((src, i) => { for (const l in src) { m.quiz[l] = m.quiz[l] || {}; for (const q in src[l]) if (i === 0 || m.quiz[l][q] == null) m.quiz[l][q] = src[l][q]; } });
    }
    if (a.srs || b.srs) {
      m.srs = Object.assign({}, a.srs);
      for (const k in (b.srs || {})) if (!m.srs[k] || b.srs[k].n > m.srs[k].n) m.srs[k] = b.srs[k];
    }
    if (a.tests || b.tests) {
      m.tests = Object.assign({}, a.tests);
      for (const k in (b.tests || {})) { const x = m.tests[k], y = b.tests[k]; m.tests[k] = !x ? y : { best: Math.max(x.best, y.best), last: (y.date || 0) > (x.date || 0) ? y.last : x.last, passed: !!(x.passed || y.passed), date: Math.max(x.date || 0, y.date || 0) }; }
    }
    if (a.project || b.project) {
      m.project = Object.assign({}, a.project);
      for (const k in (b.project || {})) { const x = m.project[k], y = b.project[k]; if (!x || y.score > x.score) m.project[k] = Object.assign({}, y, { passed: !!(y.passed || (x && x.passed)) }); else m.project[k] = Object.assign({}, x, { passed: !!(x.passed || y.passed) }); }
    }
    const th = a.theme || b.theme; if (th) m.theme = th;
    return m;
  };
  P.applyProgress = function (data, mode) {
    const cur = {}; KEYS.forEach((k) => { const v = S.get(k, null); if (v != null) cur[k] = v; });
    const next = mode === "merge" ? P.mergeProgress(cur, data) : data;
    KEYS.forEach((k) => { if (k in next) S.set(k, next[k]); else { try { localStorage.removeItem("ms." + k); } catch (e) {} } });
  };
  P.progressStats = function (data) {
    const q = data.quiz || {}; let answered = 0; Object.keys(q).forEach((l) => (answered += Object.keys(q[l]).length));
    const pr = data.project || {};
    return { lessons: Object.keys(data.done || {}).length, answers: answered, cards: Object.keys(data.srs || {}).length,
      tests: Object.values(data.tests || {}).filter((t) => t.passed).length, stages: Object.values(pr).filter((s) => s.passed).length };
  };
  P.renderProgress = function (content) {
    const A = C.app;
    const line = (s) => s.lessons + " ур. пройдено · " + s.answers + " ответов на тесты · " + s.cards + " вопросов в повторении · итоговых тестов сдано: " + s.tests + " · этапов проекта: " + s.stages;
    content.innerHTML = "<h1>Мой прогресс</h1><p class=lead>У курса нет сервера, поэтому прогресс хранится только в этом браузере. Скачайте его в файл, чтобы сохранить копию или перенести на другой компьютер, и загрузите обратно, когда понадобится.</p>" +
      '<div class="stage"><h2>Сейчас в браузере</h2><p id="curStat"></p><p><button class="btn" id="dl">Скачать прогресс (JSON)</button></p></div>' +
      '<div class="stage"><h2>Восстановить из файла</h2><p><input type="file" id="fileIn" accept=".json,application/json"></p><div id="filePreview" class="lab-note"></div>' +
      '<p id="applyRow" style="display:none"><button class="btn" id="merge">Объединить с текущим</button> <button class="btn ghost" id="replace">Заменить текущий</button></p>' +
      '<p class="lab-note">«Объединить» ничего не удаляет: пройденные уроки складываются, из двух результатов теста и проекта берётся лучший. «Заменить» оставляет ровно то, что в файле.</p><div id="applyMsg" class="verdict"></div></div>' +
      '<div class="stage"><h2>Начать заново</h2><p><button class="btn ghost" id="wipe">Стереть весь прогресс</button></p></div>';
    const cur = () => { const e = P.exportProgress(); return e.data; };
    content.querySelector("#curStat").textContent = line(P.progressStats(cur()));
    content.querySelector("#dl").onclick = () => {
      try {
        const e = P.exportProgress(), name = "microstructure-progress-" + e.exportedAt.slice(0, 10) + ".json";
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(e, null, 2)], { type: "application/json" })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
      } catch (err) { content.querySelector("#curStat").textContent += " (не удалось создать файл: " + err.message + ")"; }
    };
    let pending = null; const msg = content.querySelector("#applyMsg"), prev = content.querySelector("#filePreview"), row = content.querySelector("#applyRow");
    content.querySelector("#fileIn").onchange = (ev) => {
      const f = ev.target.files[0]; pending = null; row.style.display = "none"; msg.textContent = ""; msg.className = "verdict";
      if (!f) { prev.textContent = ""; return; }
      if (f.size > 2000000) { prev.textContent = "Файл слишком большой для прогресса (больше 2 МБ)."; return; }
      const rd = new FileReader();
      rd.onload = () => {
        let obj; try { obj = JSON.parse(rd.result); } catch (e) { prev.textContent = "Не удалось прочитать файл: это не JSON."; return; }
        const v = P.validateProgress(obj);
        if (!v.ok) { prev.textContent = v.error; return; }
        pending = v.data; prev.textContent = "В файле (" + (obj.exportedAt ? obj.exportedAt.slice(0, 10) : "дата неизвестна") + "): " + line(P.progressStats(v.data)); row.style.display = "";
      };
      rd.readAsText(f);
    };
    const apply = (mode) => { if (!pending) return; P.applyProgress(pending, mode); msg.className = "verdict ok"; msg.textContent = "Готово. Страница перезагрузится."; setTimeout(() => { location.hash = "#/progress"; location.reload(); }, 600); };
    content.querySelector("#merge").onclick = () => apply("merge");
    content.querySelector("#replace").onclick = () => { if (confirm("Заменить текущий прогресс содержимым файла?")) apply("replace"); };
    content.querySelector("#wipe").onclick = () => { if (confirm("Стереть весь прогресс в этом браузере? Сначала лучше скачать копию.")) { KEYS.forEach((k) => { try { localStorage.removeItem("ms." + k); } catch (e) {} }); location.hash = "#/progress"; location.reload(); } };
    A.renderSidebar(null);
  };

  /* ---------- ссылки [NN] на страницу источников ---------- */
  P.linkCitations = function (root) {
    const known = {}; (window.COURSE_SOURCES || []).forEach((s) => (known[String(s.id).padStart(2, "0")] = 1));
    const skip = "h1,h2,h3,h4,code,pre,.katex,.widget,.quiz,.term,button,a,script,style";
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = []; let n;
    while ((n = w.nextNode())) if (/\[\d{1,2}\]/.test(n.data) && !n.parentElement.closest(skip)) list.push(n);
    list.forEach((node) => {
      const frag = document.createDocumentFragment(); let last = 0, hit = false; const re = /\[(\d{1,2})\]/g; let m;
      while ((m = re.exec(node.data))) {
        const id = m[1].padStart(2, "0"); if (!known[id]) continue;
        frag.appendChild(document.createTextNode(node.data.slice(last, m.index)));
        const a = document.createElement("a"); a.href = "#/sources/" + id; a.className = "cite"; a.textContent = m[0]; a.title = "Открыть в списке источников";
        frag.appendChild(a); last = m.index + m[0].length; hit = true;
      }
      if (!hit) return;
      frag.appendChild(document.createTextNode(node.data.slice(last))); node.parentNode.replaceChild(frag, node);
    });
  };

  /* ---------- определения терминов в тексте уроков ---------- */
  let terms = null;
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function ruWord(w) {
    const L = w.length, keep = L >= 8 ? L - 2 : L >= 6 ? L - 1 : L;
    return reEsc(w.slice(0, keep)) + (L >= 5 ? "[а-яё]{0,3}" : "[а-яё]{0,2}");
  }
  function buildTerms() {
    const seen = {}, out = [];
    C.modules.forEach((m) => m.terms.forEach((t) => {
      const key = (t.en || "").toLowerCase(); if (!key || seen[key]) return; seen[key] = 1;
      const pats = [];
      const en = String(t.en).replace(/\s*\([^)]*\)/g, "").trim();
      if (en.length >= 3) {
        const cs = /[a-z]/.test(en) ? "iu" : "u";
        pats.push(new RegExp("(?<![\\p{L}\\d])" + reEsc(en).replace(/\s+/g, "\\s+") + "(?:s|es)?(?![\\p{L}\\d])", cs));
      }
      const ru = String(t.ru || "").replace(/\s*\([^)]*\)/g, "").trim();
      if (ru.length >= 4) {
        const ws = ru.split(/\s+/);
        if (ws.some((w) => /[а-яё]/i.test(w))) pats.push(new RegExp("(?<![а-яёa-z\\d])" + ws.map((w) => (/[а-яё]/i.test(w) ? ruWord(w.toLowerCase()) : reEsc(w))).join("[\\s-]+") + "(?![а-яёa-z\\d])", "iu"));
      }
      if (pats.length) out.push({ t: t, pats: pats, len: Math.max(en.length, ru.length) });
    }));
    out.sort((a, b) => b.len - a.len);
    return out;
  }
  const SKIP = "h1,h2,h3,h4,code,pre,.katex,.widget,.quiz,.srcs,.term,button,a,script,style,.w-title,.crumbs,.pill,b.k";
  P.decorateTerms = function (root, max) {
    if (!terms) terms = buildTerms();
    max = max || 28; let count = 0;
    const nodes = () => {
      const res = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { if (n.data.trim().length > 3 && !n.parentElement.closest(SKIP)) res.push(n); }
      return res;
    };
    for (const it of terms) {
      if (count >= max) break;
      let done = false;
      for (const node of nodes()) {
        for (const re of it.pats) {
          const m = re.exec(node.data); if (!m) continue;
          const after = node.splitText(m.index), rest = after.splitText(m[0].length);
          const span = document.createElement("span"); span.className = "term"; span.tabIndex = 0;
          span.dataset.en = it.t.en; span.textContent = m[0]; after.parentNode.replaceChild(span, after);
          done = true; count++; break;
        }
        if (done) break;
      }
    }
  };
  const byEn = () => { const m = {}; C.modules.forEach((x) => x.terms.forEach((t) => (m[t.en] = m[t.en] || t))); return m; };
  P.initTooltips = function () {
    const tip = document.createElement("div"); tip.id = "tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip);
    let idx = null, pinned = null;
    const show = (el) => {
      idx = idx || byEn(); const t = idx[el.dataset.en]; if (!t) return;
      tip.innerHTML = "<b>" + esc(t.en) + "</b> — " + esc(t.ru) + "<p>" + t.def + "</p>";
      if (window.renderMathInElement) { try { renderMathInElement(tip, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false }); } catch (e) {} }
      tip.style.display = "block";
      const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      let x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8), y = r.bottom + 8;
      if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
      tip.style.left = x + "px"; tip.style.top = y + "px";
    };
    const hide = () => { tip.style.display = "none"; pinned = null; };
    document.addEventListener("mouseover", (e) => { const el = e.target.closest && e.target.closest(".term"); if (el && !pinned) show(el); });
    document.addEventListener("mouseout", (e) => { const el = e.target.closest && e.target.closest(".term"); if (el && !pinned) hide(); });
    document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest(".term"); if (el) show(el); });
    document.addEventListener("focusout", (e) => { if (e.target.closest && e.target.closest(".term") && !pinned) hide(); });
    document.addEventListener("click", (e) => {
      const el = e.target.closest && e.target.closest(".term");
      if (el) { if (pinned === el) hide(); else { pinned = el; show(el); } } else if (pinned) hide();
    });
    window.addEventListener("scroll", hide, true); window.addEventListener("hashchange", hide);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  };
})();
