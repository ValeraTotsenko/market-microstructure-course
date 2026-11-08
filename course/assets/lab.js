/* Лаборатория (#/lab) и итоговый проект «Торговая смена» (#/project).
   Симуляторы построены на assets/engine.js (Course.sim). */
(function () {
  const C = Course, Sim = C.sim, U = C.ui, el = U.el, f = C.fmt.n, S = C.store;
  const col = U.color;

  /* ---------- мелкие помощники ---------- */
  function seg(parent, items, cur, onPick) {
    const box = el("div", { class: "seg" }), btns = [];
    const set = (k) => btns.forEach((x) => x[1].classList.toggle("on", x[0] === k));
    items.forEach((it) => {
      const b = el("button", { type: "button" }, it[1]);
      b.onclick = () => { set(it[0]); onPick(it[0]); };
      box.appendChild(b); btns.push([it[0], b]);
    });
    set(cur); parent.appendChild(box);
    return { set: set, box: box };
  }
  function kpiRow(parent, defs) {
    const row = el("div", { class: "lab-row" }), cells = {};
    defs.forEach((d) => { const k = el("div", { class: "kpi" }, "<small>" + d[1] + "</small><b>—</b>"); row.appendChild(k); cells[d[0]] = k; });
    parent.appendChild(row);
    return (key, text, sign) => { const k = cells[key]; k.querySelector("b").textContent = text; k.classList.toggle("pos", sign > 0); k.classList.toggle("neg", sign < 0); };
  }
  function hist(arrs, lo, hi, nb) {
    const w = (hi - lo) / nb, xs = [], hs = arrs.map(() => new Array(nb).fill(0));
    for (let i = 0; i < nb; i++) xs.push(lo + (i + 0.5) * w);
    arrs.forEach((a, k) => a.forEach((v) => { let i = Math.floor((v - lo) / w); i = Math.max(0, Math.min(nb - 1, i)); hs[k][i]++; }));
    return { xs: xs, ys: hs.map((h, k) => h.map((v) => (v / arrs[k].length) * 100)) };
  }
  const SC = [["calm", "Спокойный"], ["volatile", "Волатильный"], ["news", "Новостной"], ["toxic", "Токсичный поток"]];

  /* =====================================================================
     Панель параметров стратегии маркет-мейкера
     ===================================================================== */
  const PRESETS = [
    ["Учебник: A–S, γ = 0,1", { mode: "as", gamma: 0.1, kEst: 1.5, extra: 0, maxInv: 0, fee: 0 }],
    ["Осторожный", { mode: "as", gamma: 0.1, kEst: 1.5, extra: 0.3, maxInv: 5, fee: 0 }],
    ["Симметричный ±0,7", { mode: "fixed", half: 0.7, skew: 0, extra: 0, maxInv: 0, fee: 0 }]
  ];
  function strategyPanel(parent, st, onChange) {
    const top = el("div"); parent.appendChild(top);
    const asBox = el("div"), fxBox = el("div"), cmBox = el("div"); parent.append(asBox, fxBox, cmBox);
    const H = {};
    const vis = () => { asBox.style.display = st.mode === "as" ? "" : "none"; fxBox.style.display = st.mode === "fixed" ? "" : "none"; };
    const modeSeg = seg(top, [["as", "Avellaneda–Stoikov"], ["fixed", "Фиксированный спред"]], st.mode, (k) => { st.mode = k; vis(); onChange(); });
    const sl = (box, key, label, min, max, step, d) => { H[key] = U.slider(box, { label: label, min: min, max: max, step: step, value: st[key], fmt: (v) => f(v, d), onInput: (v) => { st[key] = v; onChange(); } }); };
    sl(asBox, "gamma", "γ — неприятие риска", 0.02, 2, 0.02, 2);
    sl(asBox, "kEst", "k — ваша оценка убывания потока", 0.5, 3, 0.1, 1);
    sl(fxBox, "half", "Полуспред (от центра до котировки)", 0.1, 3, 0.05, 2);
    sl(fxBox, "skew", "Сдвиг центра на единицу запаса", 0, 1, 0.02, 2);
    sl(cmBox, "extra", "Защитная надбавка к полуспреду", 0, 2, 0.05, 2);
    sl(cmBox, "maxInv", "Лимит запаса |q| (0 — без лимита)", 0, 15, 1, 0);
    sl(cmBox, "fee", "Комиссия за сделку (минус — ребейт)", -0.1, 0.1, 0.01, 2);
    const ps = el("div", { class: "seg" }); ps.appendChild(el("span", { class: "lab-note" }, "Заготовки: "));
    PRESETS.forEach((p) => { const b = el("button", { type: "button" }, p[0]); b.onclick = () => { Object.assign(st, p[1]); refresh(); onChange(); }; ps.appendChild(b); });
    parent.appendChild(ps);
    vis();
    function refresh() { modeSeg.set(st.mode); vis(); Object.keys(H).forEach((k) => H[k].set(st[k])); }
    return { refresh: refresh };
  }

  /* =====================================================================
     Стол маркет-мейкера
     ===================================================================== */
  function drawMM(c, mk) {
    const ctx = c.getContext("2d"), W = c.logicalW, H = c.logicalH, pad = { l: 46, r: 10, t: 10, b: 22 };
    ctx.clearRect(0, 0, W, H);
    const ink = col("--ink"), muted = col("--muted"), grid = col("--grid"), c1 = col("--c1"), c2 = col("--c2"), c3 = col("--c3"), bad = col("--bad");
    const h = mk.h, n = mk.p.steps;
    let lo = Infinity, hi = -Infinity;
    h.s.forEach((v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); });
    h.bid.concat(h.ask).forEach((v) => { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    const m = (hi + lo) / 2; if (hi - lo < 5) { lo = m - 2.5; hi = m + 2.5; } else { const p = (hi - lo) * 0.06; lo -= p; hi += p; }
    const X = (i) => pad.l + (i / n) * (W - pad.l - pad.r), Y = (v) => H - pad.b - ((v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    ctx.font = "12px system-ui,sans-serif"; ctx.fillStyle = muted; ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const step = (() => { const raw = (hi - lo) / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p; })();
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) { ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke(); ctx.fillText(f(v, step < 1 ? 1 : 0), pad.l - 6, Y(v)); }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0, 0.25, 0.5, 0.75, 1].forEach((u) => ctx.fillText(f(u * mk.p.T, 2), X(u * n), H - pad.b + 5));
    const line = (arr, color, dash, w) => {
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath(); let on = false;
      arr.forEach((v, i) => { if (v == null) { on = false; return; } const x = X(i), y = Y(v); if (!on) { ctx.moveTo(x, y); on = true; } else ctx.lineTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    };
    line(h.ask, c2, [4, 3], 1.3); line(h.bid, c1, [4, 3], 1.3); line(h.s, ink, [], 1.8);
    // новости (скачки)
    mk.fills.forEach((fl) => {
      const x = X(fl.i), y = Y(fl.price); ctx.fillStyle = fl.informed ? bad : (fl.side > 0 ? c3 : c2); ctx.beginPath();
      const r = fl.informed ? 6 : 4;
      if (fl.side > 0) { ctx.moveTo(x, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); } else { ctx.moveTo(x, y + r); ctx.lineTo(x - r, y - r); ctx.lineTo(x + r, y - r); }
      ctx.closePath(); ctx.fill();
    });
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.font = "11.5px system-ui,sans-serif";
    let lx = pad.l + 6; [["mid", ink], ["bid", c1], ["ask", c2], ["▲ купили", c3], ["▼ продали", c2], ["красные — информированные", bad]].forEach((it) => { ctx.fillStyle = it[1]; ctx.fillText(it[0], lx, 12); lx += ctx.measureText(it[0]).width + 14; });
  }
  function dayText(s) {
    let t = "Итог дня: P&L <b>" + f(s.pnl, 1) + "</b>. Спред принёс " + f(s.spreadCapture, 1) + ", переоценка запаса при движении цены — " + f(s.inventoryResult, 1) + (s.fees ? ", комиссии — " + f(-s.fees, 1) : "") + ".";
    if (s.informedFills) t += " Информированные трейдеры забрали <b>" + s.informedFills + "</b> сделок(и) по устаревшей котировке — они стоили " + f(s.informedPnl, 1) + ".";
    t += " Остаток запаса: " + s.qEnd + ", пик |q| = " + s.qMaxAbs + ".";
    return t;
  }

  function evalTable(rows) {
    return '<table class="mini"><tr><th></th><th>P&amp;L, среднее</th><th>σ P&amp;L</th><th>среднее / σ</th><th>σ запаса q<sub>T</sub></th><th>сделок</th><th>токсичных</th></tr>' +
      rows.map((r) => "<tr><td>" + r[0] + "</td><td>" + f(r[1].meanPnl, 1) + "</td><td>" + f(r[1].sdPnl, 1) + "</td><td>" + f(r[1].sharpe, 2) + "</td><td>" + f(r[1].sdQ, 1) + "</td><td>" + f(r[1].meanFills, 0) + "</td><td>" + f(r[1].meanInformed, 1) + "</td></tr>").join("") + "</table>";
  }

  function mmDesk(root, o) {
    o = o || {};
    const st = o.strategy || Sim.defaultStrategy();
    let scen = o.scenario || "calm", seed = o.seed || 7, mk = null, running = false, speed = 3;
    const box = el("div"); root.appendChild(box);
    if (!o.fixedScenario) {
      box.appendChild(el("div", { class: "lab-note" }, "Сценарий дня:"));
      seg(box, SC, scen, (k) => { scen = k; note.textContent = Sim.scenarios[k].about; reset(); });
    }
    const note = el("div", { class: "lab-note" }, Sim.scenarios[scen].about); box.appendChild(note);
    const panel = el("div"); box.appendChild(panel);
    strategyPanel(panel, st, () => {});
    const bar = el("div", { class: "seg" }); box.appendChild(bar);
    const bRun = U.button(bar, "▶ Запустить", () => { if (mk.done()) reset(); running = !running; setBtn(); if (running) requestAnimationFrame(frame); });
    U.button(bar, "Шаг", () => { running = false; setBtn(); if (!mk.done()) { mk.step(st); paint(); } }, true);
    U.button(bar, "Весь день", () => { running = false; setBtn(); while (!mk.done()) mk.step(st); paint(); }, true);
    U.button(bar, "Новый день", () => { seed++; reset(); }, true);
    bar.appendChild(el("span", { class: "lab-note" }, " скорость:"));
    seg(bar, [[1, "×1"], [3, "×3"], [10, "×10"]], speed, (k) => { speed = k; });
    const kp = kpiRow(box, [["pnl", "P&L"], ["q", "Запас q"], ["fills", "Сделок"], ["inf", "Токсичных"], ["spr", "Заработано на спреде"], ["inv", "Результат запаса"]]);
    const cv = U.canvas(box, 760, 300), cvP = U.canvas(box, 760, 170);
    const cvQ = U.canvas(box, 760, 150);
    const msg = el("div", { class: "w-out" }); box.appendChild(msg);
    const ev = el("div"); box.appendChild(ev);
    const bEval = U.button(ev, "Прогнать 300 дней этого сценария", () => evaluate(), true);
    const evOut = el("div", { class: "w-out" }); ev.appendChild(evOut);
    const cvH = U.canvas(ev, 760, 220); cvH.style.display = "none";

    function setBtn() { bRun.textContent = running ? "⏸ Пауза" : (mk && mk.done() ? "⟲ Заново" : "▶ Запустить"); }
    function paint() {
      drawMM(cv, mk);
      const n = mk.h.pnl.length, xs = mk.h.pnl.map((_, i) => i);
      C.plot.line(cvP, { series: [{ x: xs, y: mk.h.pnl, color: col("--c3") }], title: "P&L (с переоценкой запаса по mid)", xmin: 0, xmax: mk.p.steps });
      C.plot.line(cvQ, { series: [{ x: xs, y: mk.h.q, color: col("--c4") }], title: "Запас q", xmin: 0, xmax: mk.p.steps, ymin: Math.min(-3, Math.min.apply(null, mk.h.q) - 1), ymax: Math.max(3, Math.max.apply(null, mk.h.q) + 1) });
      const s = mk.stats();
      kp("pnl", f(s.pnl, 1), s.pnl); kp("q", String(mk.q), 0); kp("fills", String(s.fills), 0); kp("inf", String(s.informedFills), -s.informedFills);
      kp("spr", f(s.spreadCapture, 1), s.spreadCapture); kp("inv", f(s.inventoryResult, 1), s.inventoryResult);
      msg.innerHTML = mk.done() ? dayText(s) : "День идёт: шаг " + mk.i + " из " + mk.p.steps + ". Параметры можно менять на ходу — котировки пересчитываются на каждом шаге.";
      if (mk.done()) { running = false; } setBtn();
    }
    function frame() {
      if (!root.isConnected) { running = false; return; }
      if (!running) return;
      for (let i = 0; i < speed && !mk.done(); i++) mk.step(st);
      paint();
      if (running) requestAnimationFrame(frame);
    }
    function reset() { running = false; mk = new Sim.Market({ scenario: scen, seed: seed }); paint(); }
    function evaluate() {
      const a = Sim.batchMM({ scenario: scen, strategy: st }, 300, seed * 1000);
      const b = Sim.batchMM({ scenario: scen, strategy: Sim.symmetricStrategy(a.avgSpread / 2, { fee: st.fee }) }, 300, seed * 1000 + 500);
      evOut.innerHTML = evalTable([["Ваша стратегия", a], ["Симметричный эталон (тот же средний спред)", b]]) +
        '<div class="lab-note">300 независимых дней, одни и те же условия. Если «среднее / σ» заметно выше у вашей стратегии — она лучше платит за риск, даже когда в среднем зарабатывает не больше.</div>';
      const all = a.pnl.concat(b.pnl), lo = Math.floor(Math.min.apply(null, all) / 5) * 5, hi = Math.ceil(Math.max.apply(null, all) / 5) * 5 + 5;
      const hh = hist([a.pnl, b.pnl], lo, hi, 30);
      cvH.style.display = "";
      C.plot.line(cvH, { series: [{ x: hh.xs, y: hh.ys[0], label: "ваша", color: col("--c1") }, { x: hh.xs, y: hh.ys[1], label: "симметричная", color: col("--c2"), dash: [6, 4] }], xlabel: "P&L дня", ylabel: "% дней", title: "Распределение P&L за 300 дней", ymin: 0 });
    }
    reset();
    return { strategy: st, getScenario: () => scen };
  }

  /* =====================================================================
     Стол исполнения крупного ордера
     ===================================================================== */
  function execDesk(root, o) {
    o = o || {};
    const q = { size: o.size || 10, kT: o.kT != null ? o.kT : 0, sig: o.sig || 2 };
    const box = el("div"); root.appendChild(box);
    const params = () => ({ X: Sim.EXEC_DEFAULTS.ADV * q.size / 100, sigmaDaily: q.sig / 100 });
    const sl = (key, label, min, max, step, d, lock) => {
      if (lock) return;
      U.slider(box, { label: label, min: min, max: max, step: step, value: q[key], fmt: (v) => f(v, d), onInput: (v) => { q[key] = v; draw(); } });
    };
    sl("size", "Размер ордера, % дневного объёма", 2, 30, 1, 0, o.lockSize);
    sl("sig", "Волатильность, % в день", 1, 4, 0.1, 1, o.lockSig);
    sl("kT", "Срочность κT (0 — равномерно, больше — быстрее в начале)", 0, 10, 0.1, 1);
    const kp = kpiRow(box, [["cost", "Ожидаемые издержки"], ["risk", "Риск (σ результата)"], ["worst", "≈ плохой день (95%)"], ["first", "Продано в первый час"], ["sqrt", "Для сравнения: закон √ (Y=0,5)"]]);
    const c1 = U.canvas(box, 760, 230), c2 = U.canvas(box, 760, 250);
    const bar = el("div", { class: "seg" }); box.appendChild(bar);
    const out = el("div", { class: "w-out" }); box.appendChild(out);
    const c3 = U.canvas(box, 760, 230); c3.style.display = "none";
    let seed = 1;
    U.button(bar, "Разыграть один день", () => one(), true);
    U.button(bar, "500 дней", () => many(), true);
    function cur() { const p = params(); return { p: p, x: Sim.execTrajectory(p, q.kT) }; }
    function draw() {
      const { p, x } = cur(), prm = Sim.execParams(p), m = Sim.execMoments(p, x), u = Sim.execMoments(p, Sim.execTrajectory(p, 0));
      const t = x.map((_, j) => j * prm.tau), ux = Sim.execTrajectory(p, 0);
      C.plot.line(c1, { series: [{ x: t, y: x.map((v) => v / prm.X * 100), label: "ваша траектория" }, { x: t, y: ux.map((v) => v / prm.X * 100), label: "равномерная", dash: [6, 4] }], xlabel: "время, доля дня", ylabel: "остаток позиции, %", title: "Расписание продажи", ymin: 0, ymax: 100 });
      const fx = [], fy = []; for (let k = 0; k <= 10.001; k += 0.25) { const mm = Sim.execMoments(p, Sim.execTrajectory(p, k)); fx.push(mm.sdBps); fy.push(mm.costBps); }
      const dx = (Math.max.apply(null, fx) - Math.min.apply(null, fx)) * 0.006;
      C.plot.line(c2, { series: [{ x: fx, y: fy, label: "граница «издержки – риск»" }, { x: [m.sdBps - dx, m.sdBps + dx], y: [m.costBps, m.costBps], color: col("--bad"), width: 10, label: "вы здесь" }], xlabel: "риск σ, б.п.", ylabel: "издержки, б.п.", title: "Цена скорости: быстрее — дороже, но спокойнее" });
      const sq = Sim.sqrtImpactBps(0.5, q.sig / 100, prm.X, prm.ADV) + prm.eps / prm.S0 * 1e4;
      kp("cost", f(m.costBps, 1) + " б.п. (" + f(m.cost / 1000, 1) + " тыс. $)", 0);
      kp("risk", f(m.sdBps, 0) + " б.п.", 0);
      kp("worst", f(m.costBps + 1.645 * m.sdBps, 0) + " б.п.", 0);
      kp("first", f((x[0] - x[2]) / prm.X * 100, 0) + "%", 0);
      kp("sqrt", f(sq, 1) + " б.п.", 0);
      out.innerHTML = "При равномерной продаже издержки " + f(u.costBps, 1) + " б.п., риск " + f(u.sdBps, 0) + " б.п. Модель линейна по размеру, а реальное влияние растёт примерно как √Q — поэтому при больших размерах оценка здесь выше «закона квадратного корня», при малых ниже.";
    }
    function one() {
      const { p, x } = cur(), prm = Sim.execParams(p), r = Sim.execPath(p, x, seed++);
      c3.style.display = "";
      const t = r.price.map((_, j) => j * prm.tau);
      C.plot.line(c3, { series: [{ x: t, y: r.price, label: "рыночная цена" }, { x: t.slice(1), y: r.fill, label: "цена исполнения порций", dash: [5, 3] }], xlabel: "время, доля дня", ylabel: "цена", title: "Один случайный день" });
      out.innerHTML = "В этом дне вы получили на <b>" + f(r.shortfallBps, 1) + " б.п.</b> меньше, чем «начальная цена × объём» (implementation shortfall). Ожидание было " + f(Sim.execMoments(p, x).costBps, 1) + " б.п.: остальное — случайность цены.";
    }
    function many() {
      const { p, x } = cur(), r = Sim.execBatch(p, x, 500, seed * 1000); seed++;
      c3.style.display = "";
      const lo = Math.floor(Math.min.apply(null, r.values) / 20) * 20, hi = Math.ceil(Math.max.apply(null, r.values) / 20) * 20;
      const hh = hist([r.values], lo, hi, 30);
      C.plot.line(c3, { series: [{ x: hh.xs, y: hh.ys[0], color: col("--c1") }], xlabel: "shortfall, б.п. (больше — хуже)", ylabel: "% дней", title: "Результат за 500 дней", ymin: 0 });
      out.innerHTML = "Среднее: <b>" + f(r.mean, 1) + " б.п.</b>, σ: <b>" + f(r.sd, 0) + " б.п.</b> (теория: " + f(Sim.execMoments(p, x).costBps, 1) + " и " + f(Sim.execMoments(p, x).sdBps, 0) + "; ошибка среднего ≈ ±" + f(r.sd / Math.sqrt(500), 1) + ").";
    }
    draw();
    return { get: () => ({ kT: q.kT, params: params(), x: Sim.execTrajectory(params(), q.kT) }) };
  }

  /* =====================================================================
     Страница «Лаборатория»
     ===================================================================== */
  function renderLab(content) {
    content.innerHTML = '<h1>Лаборатория</h1><p class="lead">Два стола, на которых можно проверить теорию руками. Здесь нет оценок — только эксперименты. Итоговый проект использует те же столы, но с целями и проверкой.</p>' +
      '<h2>1. Стол маркет-мейкера</h2><p>Вы ставите bid и ask вокруг mid. Шумовые трейдеры приходят чаще, когда котировка ближе (модуль 2), а в «новостных» сценариях иногда появляется трейдер, который знает новую цену раньше вас (модуль 3). Попробуйте: чем отличается Avellaneda–Stoikov от фиксированного спреда; что даёт лимит запаса; во что обходится токсичный поток. Теория — в <a href="#/m05/m05-l2">уроках модуля 5</a>.</p><div id="deskA" class="widget"></div>' +
      '<h2>2. Стол исполнения</h2><p>Нужно продать крупный пакет за день. Быстро — дорого из-за влияния на цену, медленно — рискованно из-за волатильности (<a href="#/m06/m06-l2">модуль 6</a>, <a href="#/m04/m04-l2">модуль 4</a>).</p><div id="deskB" class="widget"></div>';
    mmDesk(content.querySelector("#deskA"));
    execDesk(content.querySelector("#deskB"));
    Course.app.typeset();
  }

  /* =====================================================================
     Итоговый проект «Торговая смена»
     ===================================================================== */
  const PR = {
    get() { return S.get("project", {}); },
    set(k, v) { const p = PR.get(); p[k] = v; S.set("project", p); }
  };
  const STAGES = 4;
  C.project = {
    summary() { const p = PR.get(); let d = 0; for (let i = 1; i <= STAGES; i++) if (p["s" + i] && p["s" + i].passed) d++; return { done: d, total: STAGES }; }
  };
  const RISK_BUDGET = 80; // б.п., этап 2
  const ST3 = { calm: 0, news: 0, toxic: 0 };

  function stageBox(parent, n, title, passed, intro) {
    const b = el("section", { class: "stage" + (passed ? " passed" : "") });
    b.innerHTML = "<h2>Этап " + n + ". " + title + ' <span class="st">' + (passed ? "пройден" : "не пройден") + "</span></h2>" + intro;
    parent.appendChild(b); return b;
  }
  const verdict = (box, ok, html) => { let v = box.querySelector(".verdict"); if (!v) { v = el("div", { class: "verdict" }); box.appendChild(v); } v.className = "verdict " + (ok ? "ok" : "no"); v.innerHTML = html; };

  function renderProject(content) {
    let pr = PR.get();
    content.innerHTML = '<h1>Проект «Торговая смена»</h1><p class="lead">Вы — трейдер на небольшом столе. За один «рабочий день» нужно оценить стоимость сделки, исполнить крупный ордер, настроить котирование так, чтобы оно переживало плохие дни, и проверить, не обманули ли вы себя при подборе параметров. Этапы можно проходить в любом порядке и повторять; сохраняется лучший результат.</p>';
    const root = el("div"); content.appendChild(root);
    stage1(root, pr); stage2(root, pr); stage3(root, pr); stage4(root, pr);
    const rep = el("section", { class: "report" }); root.appendChild(rep);
    const drawReport = () => report(rep);
    root.addEventListener("project-update", drawReport);
    drawReport();
    Course.app.typeset();
  }
  const upd = (box) => box.dispatchEvent(new CustomEvent("project-update", { bubbles: true }));

  /* ---------- этап 1: оценка издержек ---------- */
  function stage1(root, pr) {
    const s = pr.s1 || {};
    const box = stageBox(root, 1, "Оценка издержек до сделки", s.passed,
      '<p>Акция стоит 50 $, средний дневной объём 2 000 000 акций, волатильность 2% в день, полуспред 3 б.п. Вам нужно продать 200 000 акций (10 млн $) в течение дня. Оцените издержки по <a href="#/m04/m04-l2">закону квадратного корня</a> с коэффициентом Y = 0,5: $I = Y\\,\\sigma\\sqrt{Q/V}$.</p>');
    const a = [
      ["Рыночное влияние, б.п.", Sim.sqrtImpactBps(0.5, 0.02, 200000, 2000000)],
      ["Полные издержки (влияние + полуспред), б.п.", Sim.sqrtImpactBps(0.5, 0.02, 200000, 2000000) + 3],
      ["Полные издержки в долларах", (Sim.sqrtImpactBps(0.5, 0.02, 200000, 2000000) + 3) / 1e4 * 1e7]
    ];
    const inputs = a.map((r, i) => {
      const w = el("div", { class: "field" }, "<label>" + r[0] + "</label>"); const inp = el("input", { type: "number", step: "any", placeholder: "число" }); w.appendChild(inp); box.appendChild(w);
      if (s.answers && s.answers[i] != null) inp.value = s.answers[i];
      return inp;
    });
    box.appendChild(el("div", { class: "field" }, "<label>Если объём ордера вырастет вдвое, влияние вырастет в…</label>"));
    const sel = el("select", { class: "gl-search", style: "margin:0" }, '<option value="">выберите</option><option value="0">≈ 1,41 раза</option><option value="1">2 раза</option><option value="2">4 раза</option><option value="3">не изменится</option>');
    box.lastChild.appendChild(sel);
    if (s.answers && s.answers[3] != null) sel.value = s.answers[3];
    const hint = el("div", { class: "lab-note" }); box.appendChild(hint);
    U.button(box, "Проверить", () => {
      let ok = 0; const res = [];
      inputs.forEach((inp, i) => { const v = parseFloat(String(inp.value).replace(",", ".")), good = isFinite(v) && Math.abs(v - a[i][1]) <= 0.08 * a[i][1]; if (good) ok++; res.push(good); });
      const g4 = sel.value === "0"; if (g4) ok++; res.push(g4);
      const answers = inputs.map((x) => x.value).concat([sel.value]);
      const score = Math.round(ok / 4 * 100), passed = ok >= 3, old = (PR.get().s1 || {});
      PR.set("s1", { score: Math.max(score, old.score || 0), passed: passed || !!old.passed, answers: answers, data: { impactBps: a[0][1], totalBps: a[1][1], usd: a[2][1] } });
      verdict(box, passed, "Верно " + ok + " из 4. " + (passed ? "Этап пройден. " : "Нужно минимум 3. ") + "Подробно: " + res.map((g, i) => (i + 1) + (g ? " ✓" : " ✗")).join(", ") + ". " + (ok < 4 ? "Допуск ±8%. Ответы: " + f(a[0][1], 1) + " б.п.; " + f(a[1][1], 1) + " б.п.; ≈ " + f(a[2][1], 0) + " $; ×√2." : ""));
      upd(box);
      box.classList.toggle("passed", passed || !!old.passed); box.querySelector(".st").textContent = (passed || old.passed) ? "пройден" : "не пройден";
    });
    const bh = U.button(box, "Подсказка", () => { hint.innerHTML = "Влияние: $0{,}5\\cdot 2\\%\\cdot\\sqrt{200000/2000000}$. Добавьте полуспред (3 б.п.). Доллары — доля от 10 млн $. При удвоении Q под корнем стоит 2."; Course.app.typeset(); }, true);
  }

  /* ---------- этап 2: исполнение ---------- */
  function stage2(root, pr) {
    const s = pr.s2 || {};
    const box = stageBox(root, 2, "Исполнение под риск-лимит", s.passed,
      '<p>Тот же ордер: 200 000 акций. Риск-менеджер разрешил, чтобы стандартное отклонение результата не превышало <b>' + RISK_BUDGET + ' б.п.</b> Выберите срочность κT так, чтобы уложиться в лимит и заплатить как можно меньше. Засчитывается, если издержки не больше чем на 15% выше теоретического минимума для этого риска. Модуль 6: <a href="#/m06/m06-l2">Almgren–Chriss</a>.</p>');
    const desk = execDesk(box, { size: 10, sig: 2, lockSize: true, lockSig: true, kT: 0 });
    U.button(box, "Зафиксировать решение", () => {
      const g = desk.get(), p = g.params, m = Sim.execMoments(p, g.x), best = Sim.execBestForRisk(p, RISK_BUDGET);
      let score = 0, ok = false, msg;
      if (m.sdBps > RISK_BUDGET + 1e-6) msg = "Риск " + f(m.sdBps, 0) + " б.п. выше лимита " + RISK_BUDGET + ". Продавайте быстрее (увеличьте κT).";
      else {
        const over = m.costBps / best.m.costBps - 1; score = Math.round(100 * Math.max(0, Math.min(1, 1 - over / 0.5))); ok = over <= 0.15;
        msg = "Риск " + f(m.sdBps, 0) + " б.п. — в лимите. Издержки " + f(m.costBps, 1) + " б.п.; минимально возможные при этом риске — " + f(best.m.costBps, 1) + " б.п. (κT ≈ " + f(best.kappaT, 1) + "). " + (ok ? "Отлично." : "Вы переплатили за запас по риску — попробуйте снизить κT, пока σ не упрётся в лимит.");
      }
      const old = PR.get().s2 || {};
      PR.set("s2", { score: Math.max(score, old.score || 0), passed: ok || !!old.passed, data: { kappaT: g.kT, costBps: m.costBps, sdBps: m.sdBps, bestCostBps: best.m.costBps } });
      verdict(box, ok, msg); upd(box);
      box.classList.toggle("passed", ok || !!old.passed); box.querySelector(".st").textContent = (ok || old.passed) ? "пройден" : "не пройден";
    });
  }

  /* ---------- этап 3: котирование, устойчивое к плохим дням ---------- */
  function stage3(root, pr) {
    const s = pr.s3 || {};
    const box = stageBox(root, 3, "Котирование, которое переживает плохие дни", s.passed,
      '<p>Одна и та же настройка должна работать в трёх режимах: спокойный день, новостной день и токсичный поток. Условия проверки (по 300 дней в каждом режиме): средний P&L ≥ 20 во всех, отношение «среднее / σ» не ниже 1,3 в худшем режиме и σ итогового запаса не больше 3,5. Стартовая настройка (учебник, γ = 0,1) эти условия <b>не</b> выполняет — найдите, почему. Подсказки: <a href="#/m05/m05-l4">критика A–S</a>, <a href="#/m03/m03-l3">Glosten–Milgrom</a>.</p>');
    const desk = mmDesk(box, { scenario: "toxic", seed: 21 });
    const out = el("div", { class: "w-out" });
    U.button(box, "Проверить на трёх режимах", () => {
      const st = desk.strategy, r = {};
      ["calm", "news", "toxic"].forEach((k) => { r[k] = Sim.batchMM({ scenario: k, strategy: st }, 300, 1000); });
      const worst = Math.min(r.calm.sharpe, r.news.sharpe, r.toxic.sharpe), minMean = Math.min(r.calm.meanPnl, r.news.meanPnl, r.toxic.meanPnl), maxQ = Math.max(r.calm.sdQ, r.news.sdQ, r.toxic.sdQ);
      const ok = minMean >= 20 && worst >= 1.3 && maxQ <= 3.5;
      const score = minMean < 20 ? 0 : Math.round(100 * Math.max(0, Math.min(1, (worst - 1) / 0.8)) * (maxQ <= 3.5 ? 1 : 0.7));
      out.innerHTML = evalTable([["Спокойный", r.calm], ["Новостной", r.news], ["Токсичный поток", r.toxic]]);
      const old = PR.get().s3 || {};
      PR.set("s3", { score: Math.max(score, old.score || 0), passed: ok || !!old.passed, data: { worst: worst, minMean: minMean, maxQ: maxQ, mode: st.mode, gamma: st.gamma, extra: st.extra, maxInv: st.maxInv } });
      verdict(box, ok, ok ? "Условия выполнены: худшее «среднее / σ» = " + f(worst, 2) + ", минимальный P&L = " + f(minMean, 1) + ", σ запаса ≤ " + f(maxQ, 1) + "." : "Не выполнено: " + [minMean < 20 ? "средний P&L ниже 20 (" + f(minMean, 1) + ")" : "", worst < 1.3 ? "«среднее / σ» в худшем режиме " + f(worst, 2) + " < 1,3" : "", maxQ > 3.5 ? "σ запаса " + f(maxQ, 1) + " > 3,5" : ""].filter(Boolean).join("; ") + ".");
      box.querySelector(".verdict").before(out);
      upd(box); box.classList.toggle("passed", ok || !!old.passed); box.querySelector(".st").textContent = (ok || old.passed) ? "пройден" : "не пройден";
    });
    box.appendChild(out);
  }

  /* ---------- этап 4: проверка на новых данных ---------- */
  const CFG_GAMMA = [0.05, 0.1, 0.2, 0.4, 0.8], CFG_EXTRA = [0, 0.25, 0.5, 0.75, 1], CFG_LIM = [0, 4];
  function stage4(root, pr) {
    const s = pr.s4 || {};
    const box = stageBox(root, 4, "Не обмануть самого себя", s.passed,
      '<p>Вы подбираете параметры (50 вариантов: γ, надбавка, лимит запаса) по нескольким «историческим» дням, а потом проверяете выбор на 200 новых днях. Запустите эксперимент хотя бы для двух разных размеров выборки и ответьте на вопросы. Теория: <a href="#/m10/m10-l2">ловушки бэктеста</a>.</p>');
    let sizes = (s.data && s.data.sizes) || {};
    const bar = el("div", { class: "seg" }); box.appendChild(bar);
    const out = el("div", { class: "w-out" }); box.appendChild(out);
    const cv = U.canvas(box, 760, 230); cv.style.display = "none";
    const draw = () => {
      const ks = Object.keys(sizes).map(Number).sort((a, b) => a - b);
      if (!ks.length) return;
      out.innerHTML = '<table class="mini"><tr><th>Дней в выборке</th><th>Лучшие параметры</th><th>P&amp;L/день в выборке</th><th>P&amp;L/день на 200 новых днях</th><th>Разрыв</th></tr>' +
        ks.map((k) => { const r = sizes[k]; return "<tr><td>" + k + "</td><td>γ=" + r.g + ", надб.=" + r.e + ", лим.=" + (r.l || "нет") + "</td><td>" + f(r.is, 1) + "</td><td>" + f(r.oos, 1) + "</td><td class=hl>" + f(r.is - r.oos, 1) + "</td></tr>"; }).join("") + "</table>";
    };
    [5, 20, 60].forEach((n) => U.button(bar, "Подобрать по " + n + " дням", () => {
      const seeds = []; for (let i = 1; i <= n; i++) seeds.push(i);
      const oosSeeds = []; for (let i = 0; i < 200; i++) oosSeeds.push(10001 + i);
      let best = null;
      CFG_GAMMA.forEach((g) => CFG_EXTRA.forEach((e) => CFG_LIM.forEach((l) => {
        const st = Object.assign(Sim.defaultStrategy(), { gamma: g, extra: e, maxInv: l });
        const m = Sim.mean(Sim.runDays(st, seeds));
        if (!best || m > best.is) best = { g: g, e: e, l: l, is: m, st: st };
      })));
      best.oos = Sim.mean(Sim.runDays(best.st, oosSeeds)); delete best.st;
      sizes[n] = best; draw(); save();
    }, true));
    const Q = [
      ["Лучшая по 5 дням конфигурация на новых днях обычно…", ["покажет тот же результат", "окажется хуже: мы отобрали удачу, а не качество", "окажется лучше", "никак не связана с выборкой"], 1],
      ["Что уменьшает разрыв между выборкой и новыми данными?", ["Больше дней и меньше вариантов для перебора", "Перебрать ещё больше конфигураций", "Оставить только удачные дни", "Убрать комиссии из расчёта"], 0],
      ["Комиссия 0,03 за сделку, ≈100 сделок в день. Насколько она уменьшит дневной P&L?", ["≈ 3", "≈ 0,3", "не уменьшит: спред уже учтён", "≈ 30"], 0]
    ];
    const ans = (s.data && s.data.answers) || [];
    Q.forEach((q, i) => {
      const w = el("div", { class: "q" }); w.innerHTML = "<div>" + (i + 1) + ". " + q[0] + '</div><div class="opts">' + q[1].map((t, k) => '<button class="opt" data-k="' + k + '">' + t + "</button>").join("") + "</div>";
      w.querySelectorAll(".opt").forEach((b) => {
        const k = +b.dataset.k;
        if (ans[i] != null) { if (k === q[2]) b.classList.add("ok"); else if (k === ans[i]) b.classList.add("no"); }
        b.onclick = () => { ans[i] = k; w.querySelectorAll(".opt").forEach((x) => { x.classList.remove("ok", "no"); }); b.classList.add(k === q[2] ? "ok" : "no"); w.querySelectorAll(".opt")[q[2]].classList.add("ok"); save(); };
      });
      box.appendChild(w);
    });
    function save() {
      const ran = Object.keys(sizes).length, right = Q.filter((q, i) => ans[i] === q[2]).length;
      const passed = ran >= 2 && right >= 2, score = Math.round((right / Q.length) * 100 * (ran >= 2 ? 1 : 0.5));
      const old = PR.get().s4 || {};
      PR.set("s4", { score: Math.max(score, old.score || 0), passed: passed || !!old.passed, data: { sizes: sizes, answers: ans } });
      verdict(box, passed, "Запущено экспериментов: " + ran + " (нужно ≥ 2), верных ответов: " + right + " из " + Q.length + " (нужно ≥ 2)." + (passed ? " Этап пройден." : ""));
      upd(box); box.classList.toggle("passed", passed || !!old.passed); box.querySelector(".st").textContent = (passed || old.passed) ? "пройден" : "не пройден";
    }
    draw();
  }

  /* ---------- отчёт ---------- */
  function report(rep) {
    const p = PR.get(), sc = [1, 2, 3, 4].map((i) => (p["s" + i] ? p["s" + i].score : 0));
    const total = Math.round(sc.reduce((a, b) => a + b, 0) / 4), done = C.project.summary().done;
    const grade = total >= 85 ? "Уверенный практик" : total >= 60 ? "Хорошая основа" : total >= 30 ? "Начало положено" : "Только старт";
    const d1 = p.s1 && p.s1.data, d2 = p.s2 && p.s2.data, d3 = p.s3 && p.s3.data, d4 = p.s4 && p.s4.data;
    let md = "# Отчёт по проекту «Торговая смена»\n\nИтог: **" + total + " / 100** — " + grade + ". Этапов пройдено: " + done + " из 4.\n\n";
    md += "1. Оценка издержек — " + sc[0] + " баллов" + (d1 ? ". Влияние по закону √: " + f(d1.impactBps, 1) + " б.п.; с полуспредом " + f(d1.totalBps, 1) + " б.п. (≈ " + f(d1.usd, 0) + " $)." : ".") + "\n";
    md += "2. Исполнение — " + sc[1] + " баллов" + (d2 ? ". κT = " + f(d2.kappaT, 1) + ", издержки " + f(d2.costBps, 1) + " б.п. при риске " + f(d2.sdBps, 0) + " б.п. (минимум для лимита " + f(d2.bestCostBps, 1) + " б.п.)." : ".") + "\n";
    md += "3. Котирование — " + sc[2] + " баллов" + (d3 ? ". Режим " + d3.mode + ", γ = " + f(d3.gamma, 2) + ", надбавка " + f(d3.extra, 2) + ", лимит запаса " + (d3.maxInv || "нет") + "; худшее «среднее / σ» = " + f(d3.worst, 2) + "." : ".") + "\n";
    const ks = d4 && d4.sizes ? Object.keys(d4.sizes).map(Number).sort((a, b) => a - b) : [];
    md += "4. Проверка на новых данных — " + sc[3] + " баллов" + (ks.length ? ". Разрыв «выборка − новые дни»: " + ks.map((k) => k + " дн.: " + f(d4.sizes[k].is - d4.sizes[k].oos, 1)).join("; ") + "." : ".") + "\n";
    md += "\nВывод: издержки считаются заранее, скорость исполнения — это обмен издержек на риск, котирование без защиты от информированного потока теряет деньги в плохие дни, а параметры, подобранные на малой выборке, завышают результат.\n";
    rep.innerHTML = "<h2>Отчёт</h2><p><b style='font-size:22px'>" + total + " / 100</b> — " + grade + ". Пройдено этапов: " + done + " из 4.</p><ul>" +
      ["Оценка издержек", "Исполнение под риск-лимит", "Котирование в плохие дни", "Проверка на новых данных"].map((t, i) => "<li>" + t + ": <b>" + sc[i] + "</b></li>").join("") + "</ul>";
    const b = U.button(rep, "Скачать отчёт (.md)", () => {
      try { const a = el("a", { href: URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" })), download: "otchet-torgovaya-smena.md" }); document.body.appendChild(a); a.click(); a.remove(); } catch (e) {}
    });
    U.button(rep, "Сбросить проект", () => { if (confirm("Сбросить результаты проекта?")) { S.set("project", {}); Course.app.route(); } }, true);
  }

  C.pages = C.pages || {};
  C.pages.lab = renderLab; C.pages.project = renderProject;
  C.lab = { mmDesk: mmDesk, execDesk: execDesk };
})();
