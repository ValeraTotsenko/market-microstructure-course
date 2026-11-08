/* Поиск по всему курсу: уроки (заголовки, разделы, текст), термины глоссария, служебные страницы.
   Без зависимостей и без сервера: индекс строится в браузере при первом поиске (≈ сотня тысяч слов, доли секунды).
   Простая русская морфология: слова сравниваются по основе (отбрасываются последние буквы), запрос ищется по началу слова. */
(function (root) {
  "use strict";
  const C = root.Course;
  const S = (C.search = {});

  const ENT = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&mdash;": "—", "&ndash;": "–", "&laquo;": "«", "&raquo;": "»" };
  const plain = (html) => String(html || "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]{1,200}\$/g, " ")     // формулы не ищем
    .replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, (m) => ENT[m] || " ").replace(/\s+/g, " ").trim();
  const CYR = /[а-яё]/i;
  /* основа слова: для русских — без последних 1–3 букв, для латиницы — без окончания множественного числа */
  const stem = (w) => {
    if (CYR.test(w)) { const n = w.length; return n >= 9 ? w.slice(0, n - 3) : n >= 7 ? w.slice(0, n - 2) : n >= 5 ? w.slice(0, n - 1) : w; }
    return w.length > 4 ? w.replace(/(ies|es|s)$/, "") : w;
  };
  const words = (t) => (String(t).toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) || []);
  S._plain = plain; S._stem = stem; S._words = words;

  const STOP = {}; "что такое как это для или при про над под из от за не но его её их они мы вы он она оно все всё ли же бы the a an of and or to in is are what how".split(" ").forEach((w) => (STOP[w] = 1));
  let index = null;
  S.build = function () {
    const docs = [];
    C.modules.forEach((m) => {
      m.lessons.forEach((l) => {
        const heads = (l.html.match(/<h[23][^>]*>[\s\S]*?<\/h[23]>/g) || []).map(plain);
        const titles = (l.html.match(/data-title="([^"]*)"/g) || []).map((x) => x.slice(12, -1));
        docs.push({ kind: "lesson", id: l.id, href: "#/" + m.id + "/" + l.id, title: l.title, where: "Модуль " + (m.badge || m.order) + ". " + m.title,
          heads: heads.concat(titles), text: plain(l.html), minutes: l.minutes });
      });
    });
    const terms = [];
    C.modules.forEach((m) => m.terms.forEach((t) => terms.push({ en: t.en, ru: t.ru, def: plain(t.def), mod: m.badge || m.order })));
    const pages = [
      { title: "Лаборатория", href: "#/lab", text: "симулятор маркет-мейкера исполнение крупного ордера стакан заявок очередь дисбаланс аукцион" },
      { title: "Итоговый проект «Торговая смена»", href: "#/project", text: "издержки исполнение котирование проверка на новых данных отчёт" },
      { title: "Повторение", href: "#/review", text: "вопросы повторение интервалы карточки" },
      { title: "Мой прогресс", href: "#/progress", text: "скачать прогресс json восстановить сохранить" },
      { title: "Глоссарий", href: "#/glossary", text: "термины определения" },
      { title: "Источники", href: "#/sources", text: "книги статьи библиотека источники alpha" }
    ].map((p) => Object.assign({ kind: "page", where: "Раздел курса", heads: [] }, p));
    const prep = (d) => { d.tTitle = words(d.title).map(stem); d.tHeads = words(d.heads.join(" ")).map(stem); d.tText = words(d.text).map(stem); d.lower = d.text.toLowerCase(); return d; };
    index = { docs: docs.concat(pages).map(prep), terms: terms, words: terms.map((t) => words(t.en + " " + t.ru).map(stem)) };
    return index;
  };
  S.reset = () => { index = null; };

  const countPrefix = (arr, q) => { let n = 0; for (let i = 0; i < arr.length; i++) if (arr[i].startsWith(q)) n++; return n; };

  /* Возвращает {lessons:[{doc, score, snippet}], terms:[…]} */
  S.search = function (query, limit) {
    const q = String(query || "").trim(); if (q.length < 2) return { lessons: [], terms: [], query: q };
    if (!index) S.build();
    let qw = words(q); const kept = qw.filter((w) => !STOP[w]); if (kept.length) qw = kept;
    const qs = qw.map(stem).filter((x) => x.length >= 2); if (!qs.length) return { lessons: [], terms: [], query: q };
    const phrase = qw.join(" ");
    const score = (d, needAll) => {
      let total = 0, hit = 0;
      qs.forEach((s) => {
        const a = countPrefix(d.tTitle, s), b = countPrefix(d.tHeads, s), c = countPrefix(d.tText, s);
        if (a || b || c) hit++;
        total += a * 12 + b * 4 + Math.log2(1 + c) * 2 + Math.min(c, 30) * 0.15;
      });
      if (needAll && hit < qs.length) return 0;
      if (!needAll && !hit) return 0;
      if (qw.length > 1 && d.lower.indexOf(phrase) >= 0) total += 6;
      return total * (needAll ? 1 : hit / qs.length * 0.5);
    };
    let res = index.docs.map((d) => ({ doc: d, score: score(d, true) })).filter((r) => r.score > 0);
    if (!res.length && qs.length > 1) res = index.docs.map((d) => ({ doc: d, score: score(d, false) })).filter((r) => r.score > 0);
    res.sort((a, b) => b.score - a.score);
    res = res.slice(0, limit || 25);
    res.forEach((r) => (r.snippet = S.snippet(r.doc.text, qs, phrase)));
    const terms = index.terms.map((t, i) => {
      const w = index.words[i]; let sc = 0; qs.forEach((s) => { sc += countPrefix(w, s) * 5 + (t.def.toLowerCase().indexOf(qw[0]) >= 0 ? 1 : 0); });
      const all = qs.every((s) => countPrefix(w, s) > 0);
      return { t: t, score: all ? sc : 0 };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((x) => x.t);
    return { lessons: res, terms: terms, query: q };
  };

  /* Фрагмент текста вокруг первого найденного слова (с экранированием и подсветкой <mark>). */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  S.snippet = function (text, qs, phrase) {
    const re = /[\p{L}\p{N}]+/gu; let m, first = -1;
    if (phrase && phrase.indexOf(" ") > 0) first = text.toLowerCase().replace(/ё/g, "е").indexOf(phrase);
    if (first < 0) while ((m = re.exec(text))) { const w = stem(m[0].toLowerCase().replace(/ё/g, "е")); if (qs.some((s) => w.startsWith(s))) { first = m.index; break; } }
    if (first < 0) return esc(text.slice(0, 150)) + (text.length > 150 ? "…" : "");
    const from = Math.max(0, first - 70); let to = Math.min(text.length, first + 150);
    const piece = text.slice(from, to).replace(/^\S*\s/, from > 0 ? "" : "$&");
    return (from > 0 ? "…" : "") + S.mark(piece, qs) + (to < text.length ? "…" : "");
  };
  S.mark = function (s, qs) {
    return esc(s).replace(/[\p{L}\p{N}]+/gu, (w) => { const k = stem(w.toLowerCase().replace(/ё/g, "е")); return qs.some((q) => k.startsWith(q)) ? "<mark>" + w + "</mark>" : w; });
  };
  S.querySteps = (q) => { const w = words(q), k = w.filter((x) => !STOP[x]); return (k.length ? k : w).map(stem).filter((x) => x.length >= 2); };

  /* ---------- интерфейс ---------- */
  S.pending = null; // запрос, по которому пользователь перешёл из результатов в урок: подсветим слова
  S.highlight = function (rootEl, query) {
    const qs = S.querySteps(query); if (!qs.length || !rootEl) return 0;
    const skip = "script,style,.katex,.widget,button,input,textarea,mark,code";
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT), list = []; let n;
    while ((n = w.nextNode())) { if (n.data.trim() && !n.parentElement.closest(skip)) list.push(n); }
    let count = 0, firstEl = null;
    list.forEach((node) => {
      const text = node.data, re = /[\p{L}\p{N}]+/gu; let m, last = 0, frag = null;
      while ((m = re.exec(text))) {
        const k = stem(m[0].toLowerCase().replace(/ё/g, "е")); if (!qs.some((q) => k.startsWith(q))) continue;
        frag = frag || document.createDocumentFragment();
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const mk = document.createElement("mark"); mk.textContent = m[0]; frag.appendChild(mk); if (!firstEl) firstEl = mk; last = m.index + m[0].length; count++;
      }
      if (frag) { frag.appendChild(document.createTextNode(text.slice(last))); node.parentNode.replaceChild(frag, node); }
    });
    if (firstEl && firstEl.scrollIntoView) firstEl.scrollIntoView({ block: "center" });
    return count;
  };

  S.render = function (content, query) {
    const A = C.app; query = query || "";
    content.innerHTML = '<h1>Поиск по курсу</h1><form id="sform" class="sform"><input id="sq" class="gl-search" type="search" placeholder="Например: спред, Almgren, закон квадратного корня, очередь…" autocomplete="off"></form><div id="sres"></div>';
    const inp = content.querySelector("#sq"), out = content.querySelector("#sres"); inp.value = query;
    const draw = (q) => {
      const r = S.search(q, 30);
      if (!q || q.trim().length < 2) { out.innerHTML = '<p class="muted">Введите хотя бы два символа. Ищутся уроки (заголовки, разделы и текст), термины и разделы курса. Формулы в поиск не входят.</p>'; return; }
      let h = "";
      if (r.terms.length) h += "<h2>Термины</h2>" + r.terms.map((t) => '<div class="gl-item"><b>' + esc(t.en) + '</b> — <span class="ru">' + esc(t.ru) + '</span> <span class="pill">мод. ' + t.mod + "</span><p>" + esc(t.def) + "</p></div>").join("");
      h += "<h2>Уроки и разделы" + (r.lessons.length ? " (" + r.lessons.length + ")" : "") + "</h2>";
      h += r.lessons.length ? r.lessons.map((x) => '<div class="sres"><a class="stitle" href="' + x.doc.href + '" data-q="' + esc(q) + '">' + esc(x.doc.title) + '</a><div class="swhere">' + esc(x.doc.where) + (x.doc.minutes ? " · " + x.doc.minutes + " мин" : "") + '</div><div class="ssnip">' + x.snippet + "</div></div>").join("") : '<p class="muted">Ничего не найдено. Попробуйте другое слово или английское название термина.</p>';
      out.innerHTML = h;
      out.querySelectorAll("a[data-q]").forEach((a) => a.addEventListener("click", () => { S.pending = a.dataset.q; }));
    };
    let timer = null;
    inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { draw(inp.value); history.replaceState(null, "", "#/search/" + encodeURIComponent(inp.value)); }, 180); });
    content.querySelector("#sform").addEventListener("submit", (e) => { e.preventDefault(); draw(inp.value); });
    draw(query); inp.focus();
    A.renderSidebar(null);
  };

  C.pages = C.pages || {};
  C.pages.search = function (content, parts) { S.render(content, decodeURIComponent((parts && parts[0]) || "")); };
})(typeof window !== "undefined" ? window : globalThis);
