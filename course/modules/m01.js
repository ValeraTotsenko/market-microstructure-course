/* Модуль 1. Рынок: участники, ордера, площадки.
   Основа: [33] Harris, Trading and Exchanges (2003); [44] Velu et al., Algorithmic Trading and Quantitative Strategies (2020);
   [22] O'Hara, High Frequency Market Microstructure (2015); [37] Euronext FX (2022); [07] WSP, IB Interview Questions (справочно). */
(function () {
  const el = (t, a, h) => Course.ui.el(t, a, h);
  const N = (x, d) => Course.fmt.n(x, d == null ? 2 : d);
  const r2 = (x) => Math.round(x * 100) / 100;

  /* ---------- общие помощники виджетов ---------- */
  function controlsBox(root) {
    const box = el('div', { class: 'w-controls' });
    root.appendChild(box);
    return box;
  }
  function select(box, label, options, value, onChange) {
    const lab = el('label');
    const s = el('select', { style: 'margin-left:6px;max-width:100%' });
    options.forEach((o) => s.appendChild(el('option', { value: o[0] }, o[1])));
    s.value = value;
    lab.append(label + ': ', s);
    box.appendChild(lab);
    s.addEventListener('change', () => onChange && onChange(s.value));
    return { get: () => s.value, set: (v) => { s.value = v; }, label: lab };
  }
  // slider внутри уже созданного box; возвращает объект с label для скрытия
  function sld(root, box, o) {
    const s = Course.ui.slider(root, o);
    s.label = box.lastElementChild;
    return s;
  }
  // строка стакана: {p,q,took,mine}; color — CSS-цвет цены
  function bookRow(r, color, maxQ) {
    const row = el('div', { style: 'display:grid;grid-template-columns:60px 1fr 120px;align-items:center;gap:8px;padding:1px 0;font-size:13px;font-variant-numeric:tabular-nums' });
    const price = el('span', { style: 'font-weight:600;color:' + color }, N(r.p, 2));
    const bw = el('div', { style: 'height:12px;background:var(--grid);border-radius:3px;overflow:hidden;display:flex' });
    const w1 = Math.max(0, Math.min(100, (r.q / maxQ) * 100));
    const w2 = Math.max(0, Math.min(100 - w1, ((r.mine || 0) / maxQ) * 100));
    bw.appendChild(el('div', { style: 'height:100%;width:' + w1 + '%;background:' + color + ';opacity:.65' }));
    if (w2 > 0) bw.appendChild(el('div', { style: 'height:100%;width:' + w2 + '%;background:var(--accent)' }));
    let txt = String(r.q);
    if (r.took) txt += ' (−' + r.took + ')';
    if (r.mine) txt += ' + ваш ' + r.mine;
    const q = el('span', { style: 'color:var(--muted)' }, txt);
    row.append(price, bw, q);
    return row;
  }
  // asks: по возрастанию цены, bids: по убыванию; рисуем asks сверху вниз от дорогих к лучшему
  function bookView(parent, asks, bids) {
    const maxQ = Math.max(1, ...asks.map((r) => r.q + (r.mine || 0)), ...bids.map((r) => r.q + (r.mine || 0)));
    const box = el('div', { style: 'min-width:260px' });
    box.appendChild(el('div', { style: 'font-size:12px;color:var(--muted);margin-bottom:4px' }, 'Стакан: продажи (ask) сверху, покупки (bid) снизу'));
    asks.slice().reverse().forEach((r) => box.appendChild(bookRow(r, 'var(--bad)', maxQ)));
    const ba = asks.length ? asks[0].p : null, bb = bids.length ? bids[0].p : null;
    const sp = el('div', { style: 'text-align:center;font-size:12px;color:var(--muted);border-top:1px dashed var(--line);border-bottom:1px dashed var(--line);margin:3px 0;padding:2px 0' },
      ba != null && bb != null ? 'спред ' + N(ba - bb, 2) + ' (' + Math.round((ba - bb) * 100) + ' тик.)' : 'одна сторона пуста');
    box.appendChild(sp);
    bids.forEach((r) => box.appendChild(bookRow(r, 'var(--good)', maxQ)));
    parent.appendChild(box);
  }
  // проход по уровням (лучшие первыми); limit = null для рыночного
  function walk(levels, side, limit, size) {
    let left = size;
    const fills = [];
    for (let i = 0; i < levels.length; i++) {
      const L = levels[i];
      if (left <= 0) break;
      const ok = limit == null || (side === 'buy' ? L.p <= limit + 1e-9 : L.p >= limit - 1e-9);
      if (!ok) break;
      const t = Math.min(left, L.q);
      if (t > 0) { fills.push({ p: L.p, q: t, lv: L }); left -= t; }
    }
    return { fills: fills, left: left, filled: size - left };
  }

  /* ========================================================================
     ВИДЖЕТ 1: кто чего хочет
     ======================================================================== */
  function wRoles(root) {
    const roles = [
      { id: 'long', grp: 'Buy-side', name: 'Long-only управляющий',
        want: 'Ребалансировать большой портфель, инвестировать приток и закрывать отток денег, держаться рядом с бенчмарком или обогнать его. Короткие продажи ему запрещены.',
        horizon: 'месяцы – годы', tools: 'алгоритмы исполнения, блоковые сделки, dark pools, закрывающий аукцион (индексные потоки)',
        fear: 'Утечка информации (information leakage): крупный ордер исполняется днями, и если рынок догадается о намерении, кто-то заработает за счёт фонда. Издержки (десятки б.п.) для него исторически были вторичны, но давление конкуренции и best execution это меняют.' },
      { id: 'hedge', grp: 'Buy-side', name: 'Хедж-фонд (long-short)',
        want: 'Держать длинные и короткие позиции, снижая рыночную экспозицию; зарабатывать на нескольких стратегиях одновременно.',
        horizon: 'от внутридневного до месяцев', tools: 'алгоритмы, прямой доступ через брокеров, dark pools',
        fear: 'Издержки исполнения: сделок много и они небольшие, поэтому издержки составляют заметную долю ожидаемой прибыли.' },
      { id: 'broker', grp: 'Sell-side', name: 'Брокер (агент)',
        want: 'Исполнять поручение клиента от его имени за комиссию, не принимая риск на себя. Многие клиенты buy-side не члены биржи и без посредника торговать не могут.',
        horizon: 'на время исполнения поручения', tools: 'smart order routing, алгоритмы, доступ к биржам и ATS',
        fear: 'Нарушить best execution перед клиентом; потерять клиента из-за плохого исполнения. (Харрис: издержки buy-side — это выручка sell-side.)' },
      { id: 'dealer', grp: 'Sell-side', name: 'Дилер (принципал)',
        want: 'Предоставлять ликвидность со своего баланса: покупать по bid, продавать по ask, зарабатывая спред. После Dodd-Frank объём принимаемого принципального риска и проп-торговля банков резко сократились.',
        horizon: 'от секунд до дней (пока держит позицию)', tools: 'котировки, собственный инвентарь, internalization',
        fear: 'Торговать против информированных: потери на них дилер возмещает расширением спреда, значит, платят неинформированные клиенты.' },
      { id: 'hft', grp: 'Поставщики ликвидности', name: 'HFT / ELP / DMM',
        want: 'Быть посредником: выставить котировки, быстро развернуть позицию с прибылью. Доход: спред, ребейты бирж, перемещение инвентаря. Работают на микро-разницах цен.',
        horizon: 'миллисекунды – минуты', tools: 'колокация, ultra-low latency, микроволновые линии между дата-центрами, множество площадок одновременно',
        fear: 'Adverse selection (быть «подобранным» более быстрым или более информированным) и накопление инвентаря; поэтому отмена котировок за миллисекунды.' },
      { id: 'retail', grp: 'Прочие', name: 'Розничный инвестор',
        want: 'Купить или продать небольшой объём по цене не хуже рынка. Через онлайн-брокера. Поток часто агрегируют оптовые маркет-мейкеры.',
        horizon: 'как правило, длинный', tools: 'приложение брокера; ордер уходит оптовому маркет-мейкеру (например, Schwab продаёт поток UBS по примеру O\'Hara)',
        fear: 'Платить лишнее. Оптовик обязан исполнить не хуже NBBO — и обычно даёт небольшое улучшение цены.' },
      { id: 'informed', grp: 'Мотивы', name: 'Информированный спекулянт',
        want: 'Заработать, угадав будущую цену лучше остальных (оценка фундаментальной стоимости, новости). Торгует, только пока цена отличается от его оценки.',
        horizon: 'пока цена не сойдётся к оценке', tools: 'лимитные и рыночные ордера, алгоритмы; стремится скрыть информацию',
        fear: 'Что рынок раньше узнает о его информации. Его прибыль — за счёт менее информированных: торговля в среднем игра с нулевой суммой относительно рынка. Его торговля делает цены информативными.' },
      { id: 'hedger', grp: 'Мотивы', name: 'Хеджер / инвестор (utilitarian)',
        want: 'Получить пользу вне торговой прибыли: снять риск, перенести деньги во времени, обменять один актив на другой, нужный сейчас. Пример: экспортёр фиксирует курс валюты.',
        horizon: 'определяется потребностью', tools: 'то, что дешевле и проще; чаще рыночные ордера',
        fear: 'Высоких издержек. В среднем такие трейдеры теряют профессионалам, но получают свою нетрадиционную выгоду. Без них «профессионалам» не на чем было бы зарабатывать.' }
    ];
    const groups = ['Buy-side', 'Sell-side', 'Поставщики ликвидности', 'Прочие', 'Мотивы'];
    const flow = el('div', { style: 'font-size:13px;color:var(--muted);margin-bottom:8px' },
      'Схема: Инвестор (buy-side, розница) → брокер (агент) → площадка (биржа, ATS) ⇄ дилер / маркет-мейкер / HFT (поставщики ликвидности). Информированные и utilitarian-трейдеры (hedger) — это мотивы, а не должности: ими могут быть и фонд, и банк, и частное лицо.');
    root.appendChild(flow);
    const grid = el('div', { style: 'display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px' });
    root.appendChild(grid);
    const card = el('div', { style: 'border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--panel);margin-bottom:12px;font-size:14px' }, 'Нажмите на роль, чтобы увидеть, чего она хочет и чего боится.');
    root.appendChild(card);
    const btns = {};
    groups.forEach((g) => {
      const col = el('div', { style: 'flex:1 1 150px;min-width:150px' });
      col.appendChild(el('div', { style: 'font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px' }, g));
      roles.filter((r) => r.grp === g).forEach((r) => {
        const b = Course.ui.button(col, r.name, () => show(r.id), true);
        b.style.display = 'block'; b.style.margin = '0 0 6px 0'; b.style.width = '100%'; b.style.textAlign = 'left';
        btns[r.id] = b;
      });
      grid.appendChild(col);
    });
    function show(id) {
      const r = roles.filter((x) => x.id === id)[0];
      Object.keys(btns).forEach((k) => btns[k].classList.toggle('ghost', k !== id));
      card.innerHTML = '<b>' + r.name + '</b> <span style="color:var(--muted)">(' + r.grp + ')</span>' +
        '<table style="margin:8px 0 0"><tr><td><b>Чего хочет</b></td><td>' + r.want + '</td></tr>' +
        '<tr><td><b>Горизонт</b></td><td>' + r.horizon + '</td></tr>' +
        '<tr><td><b>Чем пользуется</b></td><td>' + r.tools + '</td></tr>' +
        '<tr><td><b>Чего боится</b></td><td>' + r.fear + '</td></tr></table>';
    }
    // тренажёр
    const sc = [
      { t: 'Пенсионному фонду нужно купить 3 млн акций за неделю; главное — не выдать намерение рынку.', a: 'long', why: 'Long-only управляющий с длинным горизонтом боится утечки информации сильнее, чем нескольких базисных пунктов издержек.' },
      { t: 'Фирма непрерывно котирует покупку и продажу по тысячам бумаг, обновляет котировки тысячи раз в секунду, держит позицию секунды; доход: спред и ребейты бирж.', a: 'hft', why: 'Так работают HFT / электронные поставщики ликвидности (ELP): колокация, минимальная задержка, быстрая отмена котировок.' },
      { t: 'Банк исполняет поручение клиента на бирже и берёт за это комиссию, свою позицию не открывает.', a: 'broker', why: 'Это агентская роль (agent): исполнение по поручению клиента, без принципального риска.' },
      { t: 'Банк продаёт клиенту акции из собственного инвентаря по цене ask, а затем сам закрывает позицию на рынке.', a: 'dealer', why: 'Это принципал (principal), дилер: торгует со своего баланса и зарабатывает спред.' },
      { t: 'Компания-экспортёр продаёт валюту вперёд, чтобы зафиксировать курс. Цена сделки её интересует мало, важнее убрать риск.', a: 'hedger', why: 'Хеджер — классический utilitarian-трейдер: выгода от торговли не в торговой прибыли.' },
      { t: 'Аналитик фонда оценил бумагу на 2% дороже рынка: покупает, а когда цена сойдётся к оценке, закрывает.', a: 'informed', why: 'Это информированный (value) трейдер: торгует на расхождении цены и своей оценки фундаментальной стоимости.' },
      { t: 'Фонд держит сотни коротких и длинных позиций, каждая сделка небольшая, и каждый б.п. издержек съедает заметную долю ожидаемой прибыли.', a: 'hedge', why: 'Для long-short фондов издержки исполнения критичны именно из-за частоты сделок.' },
      { t: 'Человек покупает 50 акций через мобильное приложение; брокер перепродаёт его ордер оптовому маркет-мейкеру.', a: 'retail', why: 'Розничный поток небольшой; оптовик должен исполнить не хуже NBBO и обычно немного улучшает цену.' }
    ];
    const tr = el('div', { style: 'border-top:1px solid var(--line);padding-top:10px' });
    root.appendChild(tr);
    tr.appendChild(el('div', { style: 'font-weight:600;margin-bottom:6px' }, 'Тренажёр: кто это?'));
    const qEl = el('div', { style: 'margin-bottom:8px;min-height:3em' });
    const chEl = el('div', { style: 'margin-bottom:6px' });
    const fbEl = el('div', { style: 'margin:6px 0;font-size:14px;min-height:2.6em' });
    const scEl = el('div', { style: 'font-size:13px;color:var(--muted)' });
    tr.append(qEl, chEl, fbEl, scEl);
    let idx = 0, score = 0, answered = false;
    const order = [3, 0, 6, 1, 7, 2, 5, 4];
    function load() {
      answered = false; fbEl.textContent = '';
      chEl.innerHTML = '';
      if (idx >= order.length) {
        qEl.textContent = 'Готово. Результат: ' + score + ' из ' + order.length + '.';
        Course.ui.button(chEl, 'Заново', () => { idx = 0; score = 0; load(); });
        scEl.textContent = '';
        return;
      }
      const s = sc[order[idx]];
      qEl.textContent = (idx + 1) + '/' + order.length + '. ' + s.t;
      roles.forEach((r) => {
        Course.ui.button(chEl, r.name, () => {
          if (answered) return;
          answered = true;
          const ok = r.id === s.a;
          if (ok) score++;
          const right = roles.filter((x) => x.id === s.a)[0].name;
          fbEl.innerHTML = '<b style="color:' + (ok ? 'var(--good)' : 'var(--bad)') + '">' + (ok ? 'Верно.' : 'Не совсем. Правильно: ' + right + '.') + '</b> ' + s.why;
          scEl.textContent = 'Счёт: ' + score + ' из ' + (idx + 1);
          Course.ui.button(fbEl, 'Дальше', () => { idx++; load(); });
        }, true).style.marginBottom = '4px';
      });
      scEl.textContent = 'Счёт: ' + score;
    }
    load();
  }

  /* ========================================================================
     ВИДЖЕТ 2: конструктор ордера
     ======================================================================== */
  function wOrder(root) {
    const BASE = {
      asks: [[100.03, 300], [100.04, 500], [100.05, 400], [100.07, 800], [100.10, 1500]],
      bids: [[100.01, 400], [100.00, 600], [99.99, 500], [99.97, 800], [99.94, 1500]]
    };
    const box = controlsBox(root);
    const side = select(box, 'Сторона', [['buy', 'Купить'], ['sell', 'Продать']], 'buy', upd);
    const type = select(box, 'Тип ордера', [['market', 'Market (рыночный)'], ['limit', 'Limit (лимитный)'], ['ioc', 'Limit + IOC'], ['fok', 'Limit + FOK'], ['iceberg', 'Iceberg (лимитный, виден частично)'], ['stop', 'Stop (стоп-маркет)']], 'limit', upd);
    const size = sld(root, box, { label: 'Размер, акций', min: 100, max: 3000, step: 100, value: 1000, fmt: (v) => String(v), onInput: upd });
    const price = sld(root, box, { label: 'Лимитная цена', min: 99.90, max: 100.15, step: 0.01, value: 100.04, fmt: (v) => N(+v, 2), onInput: upd });
    const disp = sld(root, box, { label: 'Видимая часть (iceberg), акций', min: 100, max: 1000, step: 100, value: 200, fmt: (v) => String(v), onInput: upd });
    const stopP = sld(root, box, { label: 'Стоп-цена', min: 99.80, max: 100.30, step: 0.01, value: 99.95, fmt: (v) => N(+v, 2), onInput: upd });
    const gap = sld(root, box, { label: 'Рынок ушёл за стоп-цену на, тиков', min: 0, max: 8, step: 1, value: 2, fmt: (v) => String(v), onInput: upd });
    const fee = sld(root, box, { label: 'Комиссия тейкера, цент/акц. (учебная)', min: 0, max: 0.5, step: 0.05, value: 0.3, fmt: (v) => N(+v, 2), onInput: upd });
    const reb = sld(root, box, { label: 'Ребейт мейкера, цент/акц. (учебный)', min: 0, max: 0.4, step: 0.05, value: 0.2, fmt: (v) => N(+v, 2), onInput: upd });
    const flow = sld(root, box, { label: 'Следом: встречный рыночный поток, акций', min: 0, max: 3000, step: 100, value: 600, fmt: (v) => String(v), onInput: upd });
    const wrap = el('div', { style: 'display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;margin-top:8px' });
    root.appendChild(wrap);
    const bookDiv = el('div', { style: 'flex:1 1 280px;min-width:260px' });
    const out = el('div', { class: 'w-out', style: 'flex:1 1 300px;min-width:260px;margin-top:0' });
    wrap.append(bookDiv, out);

    function upd() {
      const sd = side.get(), ty = type.get(), sz = size.get();
      const isLim = ty === 'limit' || ty === 'ioc' || ty === 'fok' || ty === 'iceberg';
      price.label.style.display = isLim ? '' : 'none';
      disp.label.style.display = ty === 'iceberg' ? '' : 'none';
      stopP.label.style.display = ty === 'stop' ? '' : 'none';
      gap.label.style.display = ty === 'stop' ? '' : 'none';
      reb.label.style.display = (ty === 'limit' || ty === 'iceberg') ? '' : 'none';
      flow.label.style.display = (ty === 'limit' || ty === 'iceberg') ? '' : 'none';

      let asks = BASE.asks.map((a) => ({ p: a[0], q: a[1], q0: a[1] }));
      let bids = BASE.bids.map((a) => ({ p: a[0], q: a[1], q0: a[1] }));
      let notes = [];
      let stopInfo = null;
      if (ty === 'stop') {
        const sp = stopP.get(), g = gap.get();
        const triggered = sd === 'buy' ? sp <= asks[0].p : sp >= bids[0].p;
        if (triggered) {
          notes.push('Стоп-цена уже достигнута рынком: ордер сработает немедленно как обычный рыночный.');
        } else {
          const target = sd === 'buy' ? sp + g * 0.01 : sp - g * 0.01;
          const shift = r2((sd === 'buy' ? target - asks[0].p : target - bids[0].p));
          asks.forEach((a) => { a.p = r2(a.p + shift); a.q0 = a.q; });
          bids.forEach((a) => { a.p = r2(a.p + shift); a.q0 = a.q; });
          stopInfo = sp;
          notes.push('Стоп сработал: книга сместилась на ' + N(shift * 100, 0) + ' тик. и лучшая цена против вас теперь ' + N(sd === 'buy' ? asks[0].p : bids[0].p, 2) + ' (стоп-цена ' + N(sp, 2) + ').');
        }
      }
      const mid = (asks[0].p + bids[0].p) / 2;
      const hit = sd === 'buy' ? asks : bids;
      const limitP = isLim ? price.get() : null;
      let res;
      let killed = false;
      if (ty === 'fok') {
        const probe = walk(hit, sd, limitP, sz);
        if (probe.left > 0) { res = { fills: [], left: sz, filled: 0 }; killed = true; } else res = probe;
      } else {
        res = walk(hit, sd, limitP, sz);
      }
      res.fills.forEach((f) => { f.lv.q -= f.q; });
      const rows = [];
      let notional = 0;
      res.fills.forEach((f) => { notional += f.p * f.q; rows.push('<tr><td>' + N(f.p, 2) + '</td><td>' + f.q + '</td></tr>'); });
      let html = '';
      notes.forEach((n) => { html += '<div style="color:var(--muted);margin-bottom:4px">' + n + '</div>'; });
      if (res.filled > 0) {
        const avg = notional / res.filled;
        const costC = (sd === 'buy' ? avg - mid : mid - avg) * 100;
        const bps = (costC / 100) / mid * 1e4;
        const best = sd === 'buy' ? asks0(asks, res) : bids0(bids, res);
        html += '<b>Исполнено ' + res.filled + ' из ' + sz + '</b> по средней цене <b>' + N(avg, 4) + '</b>';
        html += '<table style="margin:4px 0"><tr><th>Цена</th><th>Акций</th></tr>' + rows.join('') + '</table>';
        html += 'Издержки относительно mid (' + N(mid, 3) + '): <b>' + N(costC, 2) + ' цента/акц. (' + N(bps, 2) + ' б.п.)</b>; половина начального спреда была ' + N(best, 2) + ' цента/акц.<br>';
        html += 'Комиссия тейкера: ' + N(res.filled * fee.get() / 100, 2) + ' долл. (' + N(fee.get(), 2) + ' ц/акц.). ';
        if (stopInfo != null) html += '<br>Относительно стоп-цены ' + N(stopInfo, 2) + ': проскальзывание <b>' + N(Math.abs(avg - stopInfo) * 100, 2) + ' цента/акц.</b> (стоп не гарантирует цену исполнения).';
      } else {
        html += '<b>Исполнений нет.</b> ';
      }
      // судьба остатка
      const rest = res.left;
      let mineLevel = null;
      if (rest > 0) {
        if (killed) html += '<br>FOK: полного объёма по лимиту нет, ордер отменён целиком.';
        else if (ty === 'market' || ty === 'stop') html += '<br>Книга исчерпана: остаток ' + rest + ' не исполнен (рыночный ордер не имеет цены, но имеет глубину против себя).';
        else if (ty === 'ioc') html += '<br>IOC: остаток ' + rest + ' немедленно отменён, в книге его нет.';
        else {
          const p = price.get();
          const own = sd === 'buy' ? bids : asks;
          let lv = null;
          own.forEach((r) => { if (Math.abs(r.p - p) < 1e-9) lv = r; });
          const ahead = lv ? lv.q : 0;
          mineLevel = { p: p, q: rest };
          const shown = ty === 'iceberg' ? Math.min(rest, disp.get()) : rest;
          html += '<br>Остаток <b>' + rest + '</b> встал в книгу по ' + N(p, 2) + ' <b>в конец очереди</b>: перед ним ' + ahead + ' акц. (время — второй критерий после цены).';
          if (ty === 'iceberg') html += ' В книге виден только ' + shown + ' из ' + rest + ' (остальное скрыто).';
          // встречный поток
          const X = flow.get();
          let above = 0;
          const opp = sd === 'buy' ? bids : asks;
          opp.forEach((r) => { if (sd === 'buy' ? r.p > p + 1e-9 : r.p < p - 1e-9) above += r.q; });
          const reach = Math.max(0, X - above - ahead);
          let myFill = Math.min(reach, rest);
          let extra = '';
          if (ty === 'iceberg' && myFill > shown) { myFill = shown; extra = ' (вторая порция айсберга встаёт в конец очереди и не исполняется сразу)'; }
          html += '<br>Если следом придёт встречный рыночный поток ' + X + ' акц., он сначала съест ' + above + ' акц. на лучших ценах и ' + ahead + ' акц. впереди вас; вам достанется <b>' + myFill + '</b>' + extra + ' и вы получите ребейт ' + N(myFill * reb.get() / 100, 2) + ' долл. (' + N(reb.get(), 2) + ' ц/акц.).';
          if (myFill === 0 && X > 0) html += ' Ожидание в очереди — цена мейкера: возможно, вы так и не исполнитесь.';
        }
      }
      out.innerHTML = html;
      // рендер стакана после исполнения
      const asksV = asks.filter((r) => r.q > 0 || r.q0 - r.q > 0).map((r) => ({ p: r.p, q: r.q, took: r.q0 - r.q }));
      const bidsV = bids.filter((r) => r.q > 0 || r.q0 - r.q > 0).map((r) => ({ p: r.p, q: r.q, took: r.q0 - r.q }));
      const addMine = (arr, desc) => {
        if (!mineLevel) return arr;
        let f = false;
        arr.forEach((r) => { if (Math.abs(r.p - mineLevel.p) < 1e-9) { r.mine = (ty === 'iceberg') ? Math.min(mineLevel.q, disp.get()) : mineLevel.q; f = true; } });
        if (!f) { arr.push({ p: mineLevel.p, q: 0, took: 0, mine: (ty === 'iceberg') ? Math.min(mineLevel.q, disp.get()) : mineLevel.q }); arr.sort((a, b) => desc ? b.p - a.p : a.p - b.p); }
        return arr;
      };
      if (mineLevel) { if (sd === 'buy') addMine(bidsV, true); else addMine(asksV, false); }
      // для спреда нужен лучший живой уровень
      const liveAsks = asksV.filter((r) => r.q > 0 || r.mine), liveBids = bidsV.filter((r) => r.q > 0 || r.mine);
      bookDiv.innerHTML = '';
      bookView(bookDiv, liveAsks.length ? liveAsks : [], liveBids.length ? liveBids : []);
      const legend = el('div', { style: 'font-size:12px;color:var(--muted);margin-top:4px' }, '(−N) — съедено вашим ордером; синий сегмент — ваш остаток в очереди.');
      bookDiv.appendChild(legend);
    }
    function asks0(asks) { return 1.0; } // половина начального спреда: стакан до сделки имеет спред 2 тика = 1 цент от mid
    function bids0() { return 1.0; }
    upd();
  }

  /* ========================================================================
     ВИДЖЕТ 3: аукцион открытия / call market
     ======================================================================== */
  function wAuction(root) {
    const REF = 10000; // 100,00 в центах
    const box = controlsBox(root);
    let seed = 7;
    const sb = sld(root, box, { label: 'Покупатели: сдвиг лимитных цен, тиков', min: -10, max: 10, step: 1, value: 0, fmt: (v) => String(v), onInput: upd });
    const ss = sld(root, box, { label: 'Продавцы: сдвиг лимитных цен, тиков', min: -10, max: 10, step: 1, value: 0, fmt: (v) => String(v), onInput: upd });
    const mb = sld(root, box, { label: 'Рыночные на покупку (on-open), акций', min: 0, max: 3000, step: 100, value: 0, fmt: (v) => String(v), onInput: upd });
    const ms = sld(root, box, { label: 'Рыночные на продажу (on-open), акций', min: 0, max: 3000, step: 100, value: 0, fmt: (v) => String(v), onInput: upd });
    Course.ui.button(root, 'Новая выборка заявок', () => { seed++; upd(); });
    const cv = Course.ui.canvas(root, 640, 330);
    const out = Course.ui.output(root);

    function gen() {
      const rng = Course.rand.seeded(seed * 101 + 13);
      const nrm = () => Course.rand.normal(rng);
      const buys = [], sells = [];
      for (let i = 0; i < 14; i++) {
        buys.push({ c: REF + Math.round(nrm() * 5), q: 100 * (1 + Math.floor(rng() * 5)) });
        sells.push({ c: REF + Math.round(nrm() * 5), q: 100 * (1 + Math.floor(rng() * 5)) });
      }
      return { buys: buys, sells: sells };
    }
    function upd() {
      const o = gen();
      const dB = sb.get(), dS = ss.get(), MB = mb.get(), MS = ms.get();
      const buys = o.buys.map((x) => ({ c: x.c + dB, q: x.q }));
      const sells = o.sells.map((x) => ({ c: x.c + dS, q: x.q }));
      let lo = REF, hi = REF;
      buys.concat(sells).forEach((x) => { lo = Math.min(lo, x.c); hi = Math.max(hi, x.c); });
      lo -= 2; hi += 2;
      const P = [], D = [], S = [], V = [];
      let best = null;
      for (let c = lo; c <= hi; c++) {
        let d = MB, s = MS;
        buys.forEach((x) => { if (x.c >= c) d += x.q; });
        sells.forEach((x) => { if (x.c <= c) s += x.q; });
        const v = Math.min(d, s);
        P.push(c / 100); D.push(d); S.push(s); V.push(v);
        const key = [-v, Math.abs(d - s), Math.abs(c - REF)];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { c: c, d: d, s: s, v: v, key: key };
      }
      const ymax = Math.max(1, ...D, ...S);
      const series = [
        { x: P, y: D, label: 'Спрос D(p)', color: Course.ui.color('--c1') },
        { x: P, y: S, label: 'Предложение S(p)', color: Course.ui.color('--c2') },
        { x: P, y: V, label: 'Объём min(D,S)', color: Course.ui.color('--c3'), dash: [5, 4] }
      ];
      let html;
      if (best.v > 0) {
        series.push({ x: [best.c / 100, best.c / 100], y: [0, ymax], color: Course.ui.color('--ink'), dash: [2, 3], width: 1 });
        const imb = best.d - best.s;
        let gain = 0;
        buys.forEach((x) => { if (x.c > best.c) gain += x.q * (x.c - best.c) / 100; });
        sells.forEach((x) => { if (x.c < best.c) gain += x.q * (best.c - x.c) / 100; });
        html = 'Цена клиринга <b>' + N(best.c / 100, 2) + '</b> (reference = 100,00); исполняемый объём <b>' + best.v + '</b> акций; ' +
          'дисбаланс при этой цене: ' + (imb > 0 ? 'избыток покупки ' + imb : imb < 0 ? 'избыток продажи ' + (-imb) : 'нет') + ' акций (эта часть не исполняется или исполняется пропорционально).<br>' +
          'Все исполненные заявки торгуются по одной цене. Суммарная «выгода от единой цены» у заявок строго лучше этой цены: ' + N(gain, 2) + ' долл. (учебная оценка, не учитывает частичное исполнение).';
      } else {
        html = '<b>Пересечения нет:</b> ни при одной цене спрос и предложение не совпадают, торги не состоялись. Сдвиньте цены покупателей вверх или продавцов вниз.';
      }
      Course.plot.line(cv, { series: series, xlabel: 'Цена, долл.', ylabel: 'Акций', title: 'Кумулятивные спрос и предложение', ymin: 0, ymax: ymax * 1.05 });
      out.innerHTML = html + '<br><span style="color:var(--muted)">Правило выбора (по Nasdaq, [44]): сначала максимум объёма, при равенстве минимум дисбаланса, затем близость к reference price. Заявки в этой выборке: 14 покупателей и 14 продавцов с лимитными ценами около 100,00.</span>';
    }
    upd();
  }

  /* ========================================================================
     ВИДЖЕТ 4: две площадки и маршрутизация
     ======================================================================== */
  function wRoute(root) {
    const BID = 100.01;
    const box = controlsBox(root);
    const size = sld(root, box, { label: 'Покупка, акций', min: 100, max: 3000, step: 100, value: 900, fmt: (v) => String(v), onInput: upd });
    const off = sld(root, box, { label: 'Лучшая цена B относительно A, тиков', min: -2, max: 2, step: 1, value: 0, fmt: (v) => (v > 0 ? '+' + v : String(v)), onInput: upd });
    const feeA = sld(root, box, { label: 'Комиссия тейкера на A, ц/акц.', min: -0.2, max: 0.5, step: 0.05, value: 0.3, fmt: (v) => N(+v, 2), onInput: upd });
    const feeB = sld(root, box, { label: 'Комиссия тейкера на B, ц/акц. (<0: инвертированная модель)', min: -0.2, max: 0.5, step: 0.05, value: -0.1, fmt: (v) => N(+v, 2), onInput: upd });
    const pd = sld(root, box, { label: 'Dark pool: вероятность исполнить, %', min: 0, max: 100, step: 5, value: 40, fmt: (v) => v + '%', onInput: upd });
    const ds = sld(root, box, { label: 'Dark pool: размер контрагента, акций', min: 0, max: 2000, step: 100, value: 500, fmt: (v) => String(v), onInput: upd });
    const out = el('div', { class: 'w-out' });
    root.appendChild(out);

    function levelsOf() {
      const o = off.get();
      const A = [[100.03, 300], [100.04, 400], [100.05, 600], [100.07, 800]].map((x) => ({ v: 'A', p: r2(x[0]), q: x[1], fee: feeA.get() }));
      const b0 = r2(100.03 + 0.01 * o);
      const B = [[b0, 200], [r2(b0 + 0.01), 300], [r2(b0 + 0.02), 500], [r2(b0 + 0.04), 800]].map((x) => ({ v: 'B', p: x[0], q: x[1], fee: feeB.get() }));
      return { A: A, B: B };
    }
    function strat(name, pick, sz, extraDark) {
      const L = levelsOf();
      const all = L.A.concat(L.B);
      let cand;
      if (pick === 'A') cand = L.A.slice();
      else if (pick === 'B') cand = L.B.slice();
      else if (pick === 'price') cand = all.slice().sort((a, b) => a.p - b.p || a.fee - b.fee);
      else cand = all.slice().sort((a, b) => (a.p + a.fee / 100) - (b.p + b.fee / 100) || a.p - b.p);
      let rem = sz;
      let qd = 0;
      const nbboAsk = Math.min(L.A[0].p, L.B[0].p);
      const mid = r2((BID + nbboAsk) * 50) / 100 === 0 ? 0 : (BID + nbboAsk) / 2;
      if (extraDark) { qd = Math.min(sz, ds.get()) * pd.get() / 100; rem = sz - qd; }
      const w = walk(cand, 'buy', null, rem);
      const fills = w.fills;
      let nA = 0, nB = 0, notional = 0, fees = 0;
      fills.forEach((f) => {
        if (f.lv.v === 'A') nA += f.q; else nB += f.q;
        notional += f.p * f.q; fees += f.lv.fee * f.q / 100;
        f.lv.q -= f.q;
      });
      if (qd > 0) { notional += mid * qd; fees += 0.1 * qd / 100; }
      const filled = w.filled + qd;
      // trade-through: исполнено по цене хуже, чем осталась неисполненная котировка на другой площадке
      let tt = false;
      const restAll = L.A.concat(L.B);
      fills.forEach((f) => { restAll.forEach((x) => { if (x.v !== f.lv.v && x.q > 0 && x.p < f.p - 1e-9) tt = true; }); });
      return { name: name, nA: nA, nB: nB, nD: qd, filled: filled, avg: filled ? notional / filled : NaN, feePS: filled ? fees / filled * 100 : NaN, allin: filled ? (notional + fees) / filled : NaN, tt: tt, mid: mid };
    }
    function upd() {
      const sz = size.get();
      const rows = [
        strat('Всё на A', 'A', sz, false),
        strat('Всё на B', 'B', sz, false),
        strat('SOR по цене (NBBO), при равенстве - дешевле комиссия', 'price', sz, false),
        strat('SOR «дешевле всего» (цена + комиссия)', 'cost', sz, false),
        strat('Dark pool по mid (в среднем) + SOR «дешевле всего»', 'cost', sz, true)
      ];
      const mid = rows[0].mid;
      let bestIdx = -1, bestVal = Infinity;
      rows.forEach((r, i) => { if (r.filled >= sz - 1e-6 && r.allin < bestVal) { bestVal = r.allin; bestIdx = i; } });
      let h = '<table><tr><th>Стратегия</th><th>A</th><th>B</th><th>Dark (ожид.)</th><th>Ср. цена</th><th>Комис., ц/акц.</th><th>Итого vs mid, ц/акц.</th><th>Trade-through?</th></tr>';
      rows.forEach((r, i) => {
        const st = i === bestIdx ? ' style="font-weight:700"' : '';
        h += '<tr' + st + '><td>' + r.name + '</td><td>' + r.nA + '</td><td>' + r.nB + '</td><td>' + N(r.nD, 0) + '</td><td>' + (r.filled ? N(r.avg, 4) : '—') + '</td><td>' + (r.filled ? N(r.feePS, 2) : '—') + '</td><td>' +
          (r.filled ? N((r.allin - mid) * 100, 2) : '—') + (r.filled < sz - 1e-6 ? ' (исполнено ' + N(r.filled, 0) + ')' : '') + '</td><td>' + (r.tt ? 'ДА: хуже лучшей котировки на другой площадке' : 'нет') + '</td></tr>';
      });
      h += '</table>';
      h += 'NBBO: bid ' + N(BID, 2) + ', ask ' + N(Math.min(100.03, r2(100.03 + 0.01 * off.get())), 2) + '; mid ' + N(mid, 3) + '. Жирным выделена самая дешёвая из стратегий, полностью исполнивших ордер. Dark pool исполняет по mid с вероятностью, остаток идёт на биржи; учебная комиссия dark 0,10 ц/акц.<br>';
      h += '<span style="color:var(--muted)">Цифры комиссий здесь учебные. Если «дешевле всего» нарушает price priority, в США так действовать нельзя: сначала нужно исполнить против лучшей защищённой котировки (Order Protection Rule); поэтому на практике SOR оптимизирует внутри ограничений регулятора. Dark pool не нарушает правило, потому что торгует по mid, т. е. лучше NBBO.</span>';
      out.innerHTML = h;
    }
    upd();
  }

  /* ========================================================================
     ВИДЖЕТ 5: измерение ликвидности
     ======================================================================== */
  function wLiq(root) {
    const NL = 40;
    const box = controlsBox(root);
    const sp = sld(root, box, { label: 'Спред, тиков (тик 0,01)', min: 1, max: 10, step: 1, value: 2, fmt: (v) => String(v), onInput: upd });
    const q0 = sld(root, box, { label: 'Глубина на лучшей цене (ask), акций', min: 100, max: 5000, step: 100, value: 1000, fmt: (v) => String(v), onInput: upd });
    const gr = sld(root, box, { label: 'Рост глубины с каждым уровнем, %', min: 0, max: 60, step: 5, value: 20, fmt: (v) => v + '%', onInput: upd });
    const im = sld(root, box, { label: 'Перекос: bid-глубина больше ask на, %', min: -60, max: 100, step: 10, value: 0, fmt: (v) => v + '%', onInput: upd });
    const Q = sld(root, box, { label: 'Рыночная покупка, акций', min: 100, max: 20000, step: 100, value: 3000, fmt: (v) => String(v), onInput: upd });
    const hl = sld(root, box, { label: 'Полупериод восстановления книги, сек (учебная модель)', min: 1, max: 300, step: 1, value: 30, fmt: (v) => String(v), onInput: upd });
    const out = Course.ui.output(root);
    const cv1 = Course.ui.canvas(root, 640, 300);
    const cv2 = Course.ui.canvas(root, 640, 260);

    function build(scale) {
      const s = sp.get(), q = q0.get(), g = gr.get() / 100, imb = im.get() / 100;
      const bid1 = 100.00, ask1 = r2(100.00 + s * 0.01);
      const asks = [], bids = [];
      for (let k = 0; k < NL; k++) {
        asks.push({ p: r2(ask1 + k * 0.01), q: Math.round(q * Math.pow(1 + g, k) * scale) });
        bids.push({ p: r2(bid1 - k * 0.01), q: Math.round(q * Math.pow(1 + g, k) * scale * (1 + imb)) });
      }
      return { asks: asks, bids: bids, mid: (bid1 + ask1) / 2, bid1: bid1, ask1: ask1 };
    }
    function avgCost(b, size) {
      let left = size, notional = 0, last = b.asks[0].p;
      for (let k = 0; k < b.asks.length && left > 0; k++) {
        const t = Math.min(left, b.asks[k].q);
        notional += t * b.asks[k].p; left -= t; last = b.asks[k].p;
      }
      if (left > 0) return { avg: NaN, last: NaN };
      return { avg: notional / size, last: last };
    }
    function upd() {
      const b = build(1), size = Q.get();
      const mid = b.mid, spread = b.ask1 - b.bid1;
      const rel = spread / mid * 1e4;
      const dBest = b.asks[0].q + b.bids[0].q;
      let d10 = 0;
      for (let k = 0; k < 10; k++) d10 += b.asks[k].q + b.bids[k].q;
      const Iq = b.bids[0].q / (b.bids[0].q + b.asks[0].q);
      const micro = Iq * b.ask1 + (1 - Iq) * b.bid1;
      const qimb = (b.bids[0].q - b.asks[0].q) / (b.bids[0].q + b.asks[0].q);
      const c = avgCost(b, size);
      let html = '<table><tr><th>Измерение</th><th>Показатель</th><th>Значение</th></tr>' +
        '<tr><td rowspan="2">Tightness (ширина)</td><td>Котируемый спред</td><td>' + N(spread, 2) + ' долл. (' + N(spread * 100, 0) + ' тик.), ' + N(rel, 2) + ' б.п. от mid</td></tr>' +
        '<tr><td>Mid-цена</td><td>' + N(mid, 3) + '</td></tr>' +
        '<tr><td rowspan="3">Depth (глубина)</td><td>На лучших ценах (bid + ask)</td><td>' + dBest + ' акц.</td></tr>' +
        '<tr><td>В 10 лучших уровнях каждой стороны</td><td>' + d10 + ' акц.</td></tr>' +
        '<tr><td>Дисбаланс котировок (Qb−Qa)/(Qb+Qa); microprice</td><td>' + N(qimb, 2) + '; ' + N(micro, 4) + '</td></tr>';
      if (isFinite(c.avg)) {
        const slip = (c.avg - mid);
        const eff = 2 * slip;
        html += '<tr><td rowspan="3">Immediacy: стоимость рыночного ордера ' + size + ' акц.</td><td>Средняя цена покупки</td><td>' + N(c.avg, 4) + '</td></tr>' +
          '<tr><td>Издержки vs mid</td><td>' + N(slip * 100, 2) + ' ц/акц. (' + N(slip / mid * 1e4, 2) + ' б.п.), из них половина спреда ' + N(spread * 50, 2) + ' ц и прохождение по книге ' + N((slip - spread / 2) * 100, 2) + ' ц</td></tr>' +
          '<tr><td>Эффективный спред 2×(цена − mid)</td><td>' + N(eff, 4) + ' долл. (' + N(eff / mid * 1e4, 2) + ' б.п.)</td></tr>';
      } else {
        html += '<tr><td>Immediacy: стоимость ' + size + ' акц.</td><td colspan="2">В первых ' + NL + ' уровнях книги не хватает глубины: ордер целиком не исполнить.</td></tr>';
      }
      html += '</table>';
      out.innerHTML = html;
      // кривая стоимости
      const xmax = Math.max(2000, size * 2);
      const xs = [], ys = { 1: [], 0.5: [], 2: [] };
      const books = { 1: b, 0.5: build(0.5), 2: build(2) };
      for (let i = 1; i <= 30; i++) {
        const x = Math.round(xmax * i / 30);
        xs.push(x);
        [1, 0.5, 2].forEach((k) => { const cc = avgCost(books[k], x); ys[k].push(isFinite(cc.avg) ? (cc.avg - books[k].mid) / books[k].mid * 1e4 : NaN); });
      }
      const ymaxv = Math.max(1, ...ys[1].filter(isFinite), ...ys[0.5].filter(isFinite), ...ys[2].filter(isFinite));
      Course.plot.line(cv1, {
        series: [
          { x: xs, y: ys[1], label: 'Эта книга', color: Course.ui.color('--c1') },
          { x: xs, y: ys[0.5], label: 'Глубина ×0,5', color: Course.ui.color('--c2'), dash: [5, 4] },
          { x: xs, y: ys[2], label: 'Глубина ×2', color: Course.ui.color('--c3'), dash: [5, 4] },
          { x: [size, size], y: [0, ymaxv], color: Course.ui.color('--ink'), dash: [2, 3], width: 1 }
        ],
        xlabel: 'Размер рыночной покупки, акций', ylabel: 'Издержки vs mid, б.п.', title: 'Стоимость рыночного ордера растёт с размером', ymin: 0, ymax: ymaxv * 1.05
      });
      // восстановление
      const T = hl.get();
      const d0 = isFinite(c.last) ? (c.last - b.ask1) * 100 : 0;
      const ts = [], dv = [];
      for (let i = 0; i <= 40; i++) { const t = (5 * T) * i / 40; ts.push(t); dv.push(d0 * Math.exp(-Math.LN2 * t / T)); }
      Course.plot.line(cv2, {
        series: [{ x: ts, y: dv, label: 'Смещение лучшей ask после вашей покупки', color: Course.ui.color('--c1') }],
        xlabel: 'Секунд после сделки', ylabel: 'Смещение, цента', title: 'Resiliency: книга возвращается к прежним ценам (учебная модель)', ymin: 0, ymax: Math.max(1, d0 * 1.1)
      });
    }
    upd();
  }

  /* ========================================================================
     ОПИСАНИЕ МОДУЛЯ
     ======================================================================== */
  Course.register({
    id: 'm01',
    order: 1,
    title: 'Рынок: участники, ордера, площадки',
    summary: 'Кто торгует и зачем, какие бывают ордера и как их исполняет книга, чем отличаются биржа, dark pool и дилер, и как измерять ликвидность.',
    level: 'базовый',
    time: '~2 ч',
    lessons: [
      /* -------------------------------------------------- Урок 1 */
      {
        id: 'm01-l1',
        title: 'Зачем нужна микроструктура и кто на рынке',
        minutes: 25,
        html: `
<p>Цена акции в газете — это результат миллионов отдельных сделок. <b>Микроструктура рынка</b> (market microstructure) изучает, как именно правила торговли и поведение участников превращаются в цену, издержки и ликвидность. Если вы собираетесь купить крупный пакет, написать алгоритм или просто понять, почему котировка «дёргается», вам нужен язык микроструктуры: кто с кем торгует, по каким правилам и что каждый хочет.</p>

<h2>Зачем нужна микроструктура</h2>
<p>Харрис (Larry Harris, [33]) строит курс вокруг пяти результатов работы рынка: <b>ликвидность</b>, <b>транзакционные издержки</b>, <b>информативность цен</b>, <b>волатильность</b> и <b>торговая прибыль</b>. Правила игры (какие бывают ордера, в каком порядке они исполняются, кто видит книгу) влияют на все пять. Одна из идей Харриса (гл. 19): ликвидность — предмет <b>двустороннего поиска</b> (bilateral search problem): покупатель ищет продавца, продавец ищет покупателя, а биржи и дилерские сети для небольших трейдеров работают как «поисковые системы».</p>
<div class="callout">Практическая причина: все издержки, которые инвестор платит за исполнение, чей-то доход. По формулировке Харриса, транзакционные издержки покупающей стороны (buy-side) — это выручка продающей (sell-side). Поэтому «как устроен рынок» — вопрос о том, кто и за что берёт деньги.</div>

<h2>Кто на рынке</h2>
<p>Сначала карта ролей. Её удобно делить на <b>buy-side</b> (те, кто управляет деньгами и покупает бумаги для портфеля), <b>sell-side</b> (посредники: брокеры и дилеры) и <b>поставщиков ликвидности</b> (электронные маркет-мейкеры, HFT). Описание участников — по Velu et al. [44], гл. 1, плюс уточнения из [33], [22].</p>
<table>
<tr><th>Роль</th><th>Чего хочет</th><th>Горизонт</th><th>Главный страх</th></tr>
<tr><td><b>Long-only управляющий</b> (взаимные и пенсионные фонды)</td><td>Ребалансировать портфель, обработать приток и отток денег, держаться рядом с бенчмарком. Короткие продажи ему запрещены.</td><td>месяцы – годы</td><td>Утечка информации (information leakage): ордер исполняется днями</td></tr>
<tr><td><b>Хедж-фонд</b> (long-short)</td><td>Заработать на нескольких стратегиях, держа и длинные, и короткие позиции</td><td>от внутридневного до месяцев</td><td>Издержки: сделок много, и они съедают заметную долю ожидаемой прибыли</td></tr>
<tr><td><b>Брокер</b> (agent)</td><td>Исполнить поручение клиента за комиссию</td><td>время исполнения</td><td>Нарушить best execution, потерять клиента</td></tr>
<tr><td><b>Дилер</b> (principal)</td><td>Торговать со своего счёта, зарабатывая спред</td><td>секунды – дни</td><td>Информированные контрагенты</td></tr>
<tr><td><b>HFT / ELP / DMM</b></td><td>Быть посредником: котировать, быстро разворачивать позиции</td><td>мс – минуты</td><td>Adverse selection и накопление инвентаря</td></tr>
</table>
<p>Брокер и дилер часто работают в одной фирме (broker-dealer). Разница в том, чей риск: <b>агент</b> исполняет заявку клиента от его имени, <b>принципал</b> берёт на себя другую сторону сделки со своего баланса. После закона Dodd-Frank банки были вынуждены резко сократить принципальный риск и проп-торговлю ([44]); справочный конспект [07] называет четыре типа торговли банка: проп, flow (принципал берёт другую сторону и зарабатывает спред; по [07], сегодня большинство трейдеров на Уолл-стрит именно flow-трейдеры), агентская (исполнение по поручению клиента) и электронная.</p>
<p>HFT и электронные маркет-мейкеры (ELP — electronic liquidity providers, DMM — designated market makers) выступают <b>посредниками</b>: выставляют котировки, а затем быстро разворачивают позицию с прибылью. По [44], их доход складывается из ребейтов бирж, спреда и перемещения инвентаря; в [22] подчёркнуто, что HFT — это не одна стратегия, а скорость (латентность, колокация) как условие бизнеса. <b>Розничный</b> поток часто агрегируют оптовые дилеры: пример из [22] — брокер Schwab продаёт поток UBS, а UBS обязан дать не хуже NBBO (про NBBO — урок 4).</p>

<h2>Информированные и неинформированные</h2>
<p>Деление по должностям отвечает на вопрос «кто это». Для микроструктуры не менее важен вопрос «зачем он торгует». Харрис делит всех на:</p>
<ul>
<li><b>Utilitarian-трейдеры</b> (utilitarian traders) — торгуют ради пользы вне торговой прибыли: инвесторы переносят деньги во времени, <b>хеджеры</b> снимают риск, asset exchangers меняют один актив на другой, нужный им сейчас; сюда же относят gamblers, fledglings (новичков), cross-subsidizers, tax avoiders.</li>
<li><b>Profit-motivated</b> — торгуют только ради прибыли: <b>спекулянты</b> (угадывают будущие цены) и <b>дилеры</b> (продают ликвидность). Спекулянты различаются по источнику информации: <b>информированные</b> (informed traders) знают о фундаментальной стоимости, <b>order anticipators</b> используют информацию о намерениях других, <b>bluffers</b> создают информацию, чтобы ввести других в заблуждение.</li>
<li><b>Futile</b> — неумелые, иррациональные или плохо проконсультированные трейдеры: они ожидают прибыли, но систематически теряют.</li>
</ul>
<p>Ключевое следствие: <b>торговля — игра с нулевой суммой</b> относительно рыночного среднего (zero-sum game). Информированный спекулянт может заработать, только если кто-то готов терять. По Харрису, utilitarian и futile трейдеры в среднем проигрывают profit-motivated, и без них профессионалам не на чем было бы зарабатывать. Utilitarian при этом получают выгоду вне торговой прибыли (хедж, обмен активов), так что для них торговля не «игра с нулевой суммой» в обычном смысле. В [44] ту же картину описывают как informed, news и noise traders; последние торгуют без информации.</p>
<p>Дилеры в этой картине стоят посередине. Они продают ликвидность всем, но теряют на информированных, и поэтому <b>расширяют спред</b>: потери на информированных возмещают неинформированные. Харрис формулирует это так: неинформированные трейдеры проигрывают информированным через посредничество дилеров.</p>

<h2>Числовой пример: как информированные расширяют спред</h2>
<p>В упрощённом выводе Харриса (приложение к гл. 14, модель Glosten–Milgrom) дилер, не зная, кто пришёл, ставит цены так, чтобы в среднем не терять. Обозначим: $V$ — текущая оценка стоимости, $P$ — доля информированных среди сделок, $\\varepsilon$ — размер информации (на сколько информированный знает цену лучше). Тогда ожидаемая стоимость при покупке и продаже равна $E[V\\mid\\text{buy}]=V+P\\varepsilon$ и $E[V\\mid\\text{sell}]=V-P\\varepsilon$, а спред $A-B$ равен
$$A-B=2\\,P\\,\\varepsilon .$$</p>
<div class="example"><b>Учебный пример.</b> $V=100$, $P=0{,}2$, $\\varepsilon=0{,}25$ долл. Тогда $P\\varepsilon=0{,}05$: ask $=100{,}05$, bid $=99{,}95$, спред $0{,}10$ (проверка: $2\\cdot0{,}2\\cdot0{,}25=0{,}10$). Из каждых 10 покупок по ask в среднем 2 совершает информированный, который знает, что цена $100{,}25$: дилер теряет $0{,}20$ на каждой такой сделке. Остальные 8 неинформированных сделок приносят $0{,}05$. Среднее: $0{,}8\\cdot0{,}05-0{,}2\\cdot0{,}20=0$. Дилер «в ноль», а спред в $10$ центов оплачивают все клиенты.</div>
<p>Подробно разбор спреда и модели Glosten–Milgrom идёт в модуле 3. Здесь важно запомнить логику: <b>чем больше информированных, тем шире спред</b>.</p>

<div data-widget="roles" data-title="Кто чего хочет: роли, мотивы и тренажёр"></div>

<div class="callout key"><span class="t">Что запомнить</span>
<ul>
<li>Buy-side принимает инвестиционные решения, sell-side (брокеры, дилеры) помогает их исполнять; HFT и ELP — посредники, зарабатывающие на скорости и спреде.</li>
<li>Агент исполняет поручение клиента, принципал торгует со своего баланса.</li>
<li>Профессионалы зарабатывают за счёт тех, кто торгует по другим причинам: трейдеры-utilitarian и futile в среднем уступают profit-motivated.</li>
<li>Спред частично состоит из «платы за риск столкнуться с информированным»: $A-B=2P\\varepsilon$ в простейшей модели.</li>
</ul></div>

<div class="callout warn"><span class="t">Осторожно</span>
Роли не взаимоисключающие: один банк может быть и брокером, и дилером; одна и та же фирма может быть и хедж-фондом, и ELP. Харрис писал в 2003 году (до HFT в современном виде), Velu et al. описывают США 2016–2019 гг.: оценки вроде «HFT составляли более 60% торгов на пике» — оценки, а не точное измерение; пример с P и $\\varepsilon$ — учебный, а не калибровка по рынку.</div>
`,
        widgets: { roles: wRoles },
        quiz: [
          { q: 'Брокер-агент и дилер-принципал отличаются тем, что…', options: ['брокер всегда торгует на бирже, а дилер — только вне биржи', 'агент исполняет поручение клиента от его имени, а принципал берёт сторону сделки на свой баланс', 'дилер не берёт комиссию, а брокер берёт спред', 'брокер работает только с розничными клиентами'], answer: 1, explain: 'Различие в том, чей риск и чей счёт. Агент исполняет заявку клиента, принципал торгует сам и зарабатывает спред.' },
          { q: 'Почему дилеры расширяют спред, когда на рынке больше информированных?', options: ['Информированные торгуют большими объёмами, и это уменьшает комиссии', 'Спред расширяет регулятор', 'Потери на информированных дилер возмещает за счёт остальных клиентов через более широкий спред', 'Информированные всегда торгуют лимитными ордерами'], answer: 2, explain: 'В упрощённой модели Харриса $A-B=2P\\varepsilon$: чем выше доля информированных $P$ и размер информации $\\varepsilon$, тем шире спред.' },
          { q: 'Экспортёр продаёт валюту вперёд, чтобы зафиксировать курс. По Харрису, он…', options: ['информированный спекулянт', 'utilitarian-трейдер (хеджер)', 'bluffer', 'order anticipator'], answer: 1, explain: 'Он торгует ради снятия риска, а не торговой прибыли, значит, это utilitarian-трейдер.' },
          { q: 'Что верно об играх с нулевой суммой в трактовке Харриса?', options: ['Выигрыш информированного возможен лишь за счёт менее информированных трейдеров', 'Все участники всегда получают положительную прибыль', 'Нулевая сумма означает, что цены не меняются', 'Дилеры всегда выигрывают у всех'], answer: 0, explain: 'Относительно рыночного среднего чей-то выигрыш — чей-то проигрыш. Utilitarian-трейдеры при этом получают нетрадиционную выгоду вне прибыли.' }
        ],
        sources: [
          { title: '[33] Harris, Trading and Exchanges', where: 'гл. 1 (1.2: пять характеристик рынка), гл. 8 (почему люди торгуют, резюме 8.4; рис. 8-1), гл. 14 (приложение: вывод спреда $2P\\varepsilon$), гл. 19 (19.1, 19.5: bilateral search), гл. 21 (21.10: издержки buy-side — выручка sell-side)', note: 'Таксономия трейдеров и вывод спреда; данные и институты на 2001–2003 гг.' },
          { title: '[44] Velu et al., Algorithmic Trading and Quantitative Strategies', where: 'разд. 1.2.1 (Equity Markets Participants), 1.5.1', note: 'Участники рынка США по состоянию на 2016–2019 гг.' },
          { title: '[22] O\'Hara, High Frequency Market Microstructure', where: 'разд. 2.2–2.3', note: 'HFT и «все остальные»; пример с Schwab/UBS; данные 2013–2014 гг.' },
          { title: '[07] WSP, Investment Banking Interview Questions', where: 'гл. Sales & Trading', note: 'Только как справочник по ролям и терминам; не источник по микроструктуре.' }
        ]
      },
      /* -------------------------------------------------- Урок 2 */
      {
        id: 'm01-l2',
        title: 'Ордера и правила исполнения',
        minutes: 30,
        html: `
<p>Любая сделка на электронном рынке начинается с <b>ордера</b>: инструкции «купить или продать столько-то, на таких-то условиях». Выбор типа ордера — это выбор между <b>ценой</b> и <b>скоростью</b>: хотите сейчас — платите; хотите дёшево — подождите и рискуйте не исполниться. Дальше разберём, как ордера устроены, в каком порядке книга исполняет их и почему биржи платят за один тип ордеров и берут деньги за другой.</p>

<h2>Рынок, лимит и их родственники</h2>
<p>Лучшая цена на покупку — <b>bid</b>, лучшая цена на продажу — <b>ask</b> (offer). Разность — <b>спред</b>. Середина — <b>mid-цена</b>: при отсутствии другой информации это лучшая оценка стоимости (пример Харриса: bid 100, ask 102 — оценка стоимости 101).</p>
<ul>
<li><b>Рыночный ордер</b> (market order) — «сделай по лучшей доступной цене немедленно». Он гарантирует исполнение, но не цену. Он <b>забирает</b> ликвидность (taker).</li>
<li><b>Лимитный ордер</b> (limit order) — «куплю не дороже/продам не дешевле цены $L$». Гарантирует цену, но не исполнение. Он <b>предлагает</b> ликвидность (maker): ждёт в книге, пока придёт встречный. Лимитный ордер, который сразу пересекается с книгой, называют <b>marketable limit</b>: он ведёт себя как рыночный, но не уйдёт дальше своей цены.</li>
<li><b>Стоп-ордер</b> (stop) — не виден в книге и «спит», пока цена не достигнет стоп-цены; после этого превращается в рыночный (или лимитный — тогда это stop-limit). Харрис акцентирует: стоп — не лимит. Пример Харриса: купили 10 контрактов по 80, поставили стоп на продажу по 70; цена упала быстро с 72 до 67 на новостях, и контракты проданы по 66,90. Стоп ограничивает убыток, но не гарантирует цену; к тому же стопы могут усиливать движение, потому что сработавшие стопы добавляют односторонний спрос на ликвидность.</li>
<li><b>IOC</b> (immediate-or-cancel) — исполнить что можно сейчас, остаток отменить, и в книге он не появится. <b>FOK</b> (fill-or-kill) — исполнить целиком сразу или не исполнять вообще (у Харриса, гл. 4, на некоторых рынках IOC и FOK — синонимы, а в его примере с FOK остаток просто отменяется); ценен тем, кому опасны частичные исполнения (например, арбитражёру с несколькими «ногами» сделки). Оба — примеры <b>инструкций времени жизни</b> (time-in-force); обычные — <b>Day</b> и <b>GTC</b> (действует, пока не отменён).</li>
<li><b>Айсберг</b> (iceberg, reserve order) — большой лимитный ордер с небольшой видимой частью. Пример из [44]: купить 100 000 акций по 20 долл., показывать 2000; после исполнения порции автоматически подгружаются следующие 2000. Важная деталь: приоритет по времени есть только у видимой части, новая порция встаёт в <b>конец очереди</b>. <b>Hidden</b>-ордер вообще не виден.</li>
</ul>

<h2>Приоритет: цена, потом время</h2>
<p>Когда в книге много ордеров, нужно решить, кого исполнять первым. Почти везде в акциях действует <b>price-time priority</b> ([44], [22]): сначала лучшая цена, при равенстве — тот, кто пришёл раньше. Харрис объясняет различие: <b>приоритет цены</b> самоподдерживается (трейдеры сами ищут лучшую цену), а <b>приоритет времени</b> — нет: его надо охранять правилами, потому что трейдеру всё равно, чей ордер исполнить по одной и той же цене.</p>
<p>Приоритет по времени стимулирует улучшать цену: если вы хотите исполниться раньше стоящего в очереди, надо предложить цену лучше. Харрис приводит игру «чехарда» (leapfrog): рынок апельсинового сока 103,10 / 103,25; Гай стоит на покупку по 103,10 с приоритетом по времени. Чтобы обойти его, нужно поднять bid до 103,15 (и получить приоритет по цене), а Гай может ответить 103,20 и т. д.</p>
<p>Но «чехарда» работает только если <b>тик</b> (tick size, минимальный шаг цены) не слишком мал. Харрис: если тик очень мал, приоритет по времени почти ничего не стоит (улучшить цену на микроскопическую величину дёшево), и конкуренция по цене слабеет; если тик слишком велик, трейдеры неохотно улучшают цену, потому что это дорого. Исторический пример из [44]: с 9 апреля 2001 года в США тик сократили с 1/16 доллара (6,25 цента) до 1 цента (<b>десятичная реформа, decimalization</b>), спреды заметно сузились.</p>
<p>Не везде приоритет «цена–время». Для некоторых фьючерсных и опционных бирж характерен <b>pro rata</b> (исполнение долями пропорционально размеру), у O'Hara [22] упоминается <b>price-size-time</b>, а площадка IEX использует <b>price-broker-time</b>. Приоритет — это правило площадки, а не закон природы, и стратегия трейдера зависит от него.</p>

<h2>Maker-taker: кто платит за ликвидность</h2>
<p>Биржи конкурируют за ликвидность, и один из инструментов — тарифы. В схеме <b>maker-taker</b> тот, чей лимитный ордер стоял и исполнился (maker), получает от биржи <b>ребейт</b>, а тот, кто забрал (taker), платит <b>комиссию</b>. Первой такую схему ввела платформа Island ECN в 1997 году ([22]). Последствие, о котором предупреждает [44]: если можно предлагать ликвидность, избегая ликвидности-взятия, можно зарабатывать малую прибыль с минимальным риском, но автоматизированно и очень быстро, ведь позиция в очереди и скорость отмены критичны. Так maker-taker подтолкнул рост HFT. Бывает и <b>инвертированная модель</b> (inverted fee): площадка берёт комиссию с мейкера и платит тейкеру (например, BYX, EDGA в [44]). Реформа Reg NMS ограничила размер комиссии, которую площадка может брать за доступ к котировке (Access Rule; конкретная величина в наших источниках не приводится).</p>
<div class="example"><b>Учебный пример.</b> Книга: ask 100,03 × 300, 100,04 × 500; bid 100,01 × 400. Покупатель отправляет рыночный ордер на 800. Исполнение: 300 × 100,03 и 500 × 100,04. Средняя цена $\\frac{300\\cdot100{,}03+500\\cdot100{,}04}{800}=100{,}03625$. Mid был $100{,}02$, значит, издержки $1{,}625$ цента на акцию, или около $1{,}6$ б.п. (1 б.п. $=0{,}01\\%$). Это <b>половина спреда</b> (1 цент) плюс ещё $0{,}625$ цента за «проход» вглубь книги. Если комиссия тейкера условно $0{,}30$ цента, итого $1{,}925$ цента. Все числа комиссий в этом уроке — учебные.</div>

<div data-widget="order" data-title="Конструктор ордера: как он исполняется против простой книги"></div>
<p>Поэкспериментируйте: поставьте рыночный ордер и посмотрите, как растёт цена по мере съедания уровней. Поставьте лимитный ордер выше ask и посмотрите, как он частично исполняется, а остаток встаёт в очередь. Замените тип на FOK и сделайте размер больше глубины по цене: исполнения не будет совсем. Включите «Stop» и подвигайте «рынок ушёл за стоп»: стоп не гарантирует цену.</p>

<h2>Рыночный ордер «платит спред»</h2>
<p>Пример Харриса: Эми покупает облигацию рыночным ордером по 102 (bid 100, ask 102) и тут же продаёт по 100. Круговая сделка стоит ей весь спред, т. е. 2. Стоимость одной стороны — половина спреда: она заплатила 102 за бумагу, которая стоит около 101. Это цена <b>немедленности</b> (immediacy). Лимитный ордер экономит эту половину, но может не исполниться, а если исполнится — то часто тогда, когда цена уходит против вас (adverse selection, см. модуль 3).</p>

<div class="callout key"><span class="t">Что запомнить</span>
<ul>
<li>Market гарантирует исполнение, но не цену; limit гарантирует цену, но не исполнение; стоп не лимит и тоже не гарантирует цену.</li>
<li>Приоритет в книге: сначала цена, потом время; видимая часть айсберга теряет место в очереди при подгрузке.</li>
<li>Тик определяет, насколько приоритет по времени вообще что-то стоит.</li>
<li>Рыночный ордер платит половину спреда плюс «проход» по книге; maker-taker платит за ликвидность ребейтом и подталкивает HFT.</li>
</ul></div>

<div class="callout warn"><span class="t">Осторожно</span>
Типы ордеров и тарифы различаются между площадками и странами; здесь описана типичная американская картина по [44] и [33]. Размеры комиссий и ребейтов — учебные. Справочные размеры (например, «нет фиксированного потолка, в источнике не указан») лучше проверять по документам конкретной биржи.</div>
`,
        widgets: { order: wOrder },
        quiz: [
          { q: 'Вы поставили стоп-ордер на продажу по 70, цена упала с 72 до 67. Что вероятнее всего произойдёт?', options: ['Продажа ровно по 70', 'Рыночная продажа по цене около 67, то есть ниже стоп-цены', 'Ордер не исполнится, потому что цена ниже 70', 'Сделка по цене выше 70 за счёт улучшения цены'], answer: 1, explain: 'После срабатывания стоп превращается в рыночный ордер и исполняется по доступным ценам; в примере Харриса — 66,90.' },
          { q: 'Что случится с айсбергом, когда исполнилась его видимая порция?', options: ['Новая порция встанет в начало очереди', 'Новая порция встанет в конец очереди на этой цене', 'Ордер отменится целиком', 'Скрытая часть исполнится сразу по mid'], answer: 1, explain: 'Приоритет по времени есть только у видимой части; новая порция получает новое время, т. е. встаёт в конец очереди ([44]).' },
          { q: 'Почему при очень малом тике приоритет по времени теряет значение?', options: ['Потому что биржа отменяет приоритет при малом тике', 'Потому что обойти очередь можно, улучшив цену на ничтожную величину, и ждать очередь почти не нужно', 'Потому что спред становится нулевым и ордера не исполняются', 'Потому что рыночные ордера запрещены'], answer: 1, explain: 'Если улучшить цену почти бесплатно, привилегия «стоять первым» ничего не стоит, и конкуренция по цене ослабевает (Харрис).' },
          { q: 'Книга: ask 100,03×300 и 100,04×500, bid 100,01. Рыночная покупка 400 акций. Какая средняя цена?', options: ['100,03', '100,0325', '100,04', '100,02'], answer: 1, explain: 'Берём 300 по 100,03 и 100 по 100,04: (300·100,03 + 100·100,04)/400 = 100,0325.' }
        ],
        sources: [
          { title: '[33] Harris, Trading and Exchanges', where: 'гл. 4 (ордера: 4.3 market orders, 4.5 stop, IOC/FOK/hidden), гл. 6.1 (order precedence rules, tick, leapfrog)', note: 'Основа определений; примеры Эми, 70/66,90, OJ 103,10/103,25.' },
          { title: '[44] Velu et al.', where: 'разд. 1.3.1, 1.3.3 (типы ордеров: iceberg, stop, TIF), 1.1 (decimalization, maker-taker)', note: 'Современные типы ордеров и maker-taker; контекст США, данные до 2019 г.' },
          { title: '[22] O\'Hara, High Frequency Market Microstructure', where: 'разд. 2.2 (priority rules), 2.4 (maker-taker, IEX)', note: 'Island ECN 1997; price-size-time, price-broker-time.' }
        ]
      },
      /* -------------------------------------------------- Урок 3 */
      {
        id: 'm01-l3',
        title: 'Как устроены торги: книга, дилеры, аукционы',
        minutes: 30,
        html: `
<p>Один и тот же ордер можно исполнить в совершенно разных «машинах»: в центральной книге заявок, у дилера, в одноразовом аукционе. Эти механизмы определяют, кто видит заявки, как формируется цена и кто платит за ликвидность. Урок отвечает на вопрос: как в разных условиях устроено «встречное» исполнение и почему рынки открываются и закрываются аукционами.</p>

<h2>Два способа организовать рынок</h2>
<p><b>Order-driven рынок</b> (рынок, управляемый заявками): трейдеры сами выставляют ордера в общую книгу, и сделка происходит, когда ордера пересекаются. Цены задаются заявками. Это механизм большинства современных бирж акций ([33], [44]). <b>Quote-driven рынок</b> (рынок, управляемый котировками): дилеры называют цены bid/ask, а клиенты «принимают» их; сделка всегда с дилером. Так торгуются многие внебиржевые (OTC) рынки: облигации, валюта. На практике рынки гибридны (у специалиста NYSE были и ордера, и котировки), а в Европе и США параллельно работают системные интернализаторы (урок 4).</p>
<p>Харрис к order-driven относит устные аукционы, аукционы с единой ценой, непрерывные автоматические аукционы и crossing-сети. Правила таких рынков складываются из двух блоков: <b>правила приоритета</b> (кто исполняется первым) и <b>правила определения цены сделки</b> (по какой цене исполнять).</p>

<h2>Непрерывная двойная аукционная книга</h2>
<p>В [44] механизм устроен так. Матчинг-движок (matching engine) состоит из <b>книги лимитных заявок</b> (limit order book, LOB) и <b>алгоритма сопоставления</b>. Книга хранит все неисполненные ордера двух сторон. Допустимы три инструкции: <b>insert</b> (новый), <b>cancel</b> (снять), <b>amend</b> (изменить). Книгу меняют события: добавление, отмена, изменение лимитного ордера и исполнение — на каждой стороне, всего восемь типов. Алгоритм исполняет по <b>price-time priority</b>; сделка идёт по цене лимитного ордера, который уже стоял в книге (<b>дискриминирующая</b> цена, по Харрису: цены разных сделок разные). Подробнее о книге — модуль 2.</p>
<p>Торговый день обычно такой: <b>аукцион открытия</b> → непрерывная торговля → <b>аукцион закрытия</b> (в Японии ещё и перерыв на обед).</p>

<h2>Аукцион: call market</h2>
<p><b>Call auction</b> («вызывной» аукцион) собирает заявки, а потом исполняет их все сразу по <b>единой цене</b> (uniform pricing, по Харрису). Название отражает смысл: участников «вызывают» подать заявки к определённому времени, ликвидность накапливается и выравнивается. Из бирж он на практике используется в начале и конце дня.</p>
<p><b>Как найти цену клиринга.</b> Пусть для цены $p$ суммарный спрос $D(p)$ — число акций, которые готовы купить по цене не выше $p$ (покупатели, чья лимитная цена $\\ge p$, плюс рыночные на покупку), а предложение $S(p)$ — число акций, готовых продаться по цене не ниже $p$ (продавцы с лимитом $\\le p$ плюс рыночные на продажу). Исполняемый объём при цене $p$ равен $V(p)=\\min\\{D(p),S(p)\\}$. Цена клиринга $p^*$ выбирается так, чтобы <b>максимизировать объём</b>; при равенстве — <b>минимизировать дисбаланс</b> $|D(p)-S(p)|$; затем взять цену, ближайшую к опорной. Такой порядок критериев использует Nasdaq в определении Reference Price ([44]): объём «парных» акций максимален, дисбаланс минимален, расстояние до mid минимально, именно в этом порядке.</p>
<div class="example"><b>Учебный пример.</b> Заявки на покупку (лимиты): 300 акций по 100,05; 400 по 100,03; 500 по 100,01. Заявки на продажу: 200 по 100,00; 300 по 100,02; 600 по 100,04.
<table>
<tr><th>Цена $p$</th><th>100,00</th><th>100,01</th><th>100,02</th><th>100,03</th><th>100,04</th><th>100,05</th></tr>
<tr><td>Спрос $D$</td><td>1200</td><td>1200</td><td>700</td><td>700</td><td>300</td><td>300</td></tr>
<tr><td>Предложение $S$</td><td>200</td><td>200</td><td>500</td><td>500</td><td>1100</td><td>1100</td></tr>
<tr><td>Объём $\\min(D,S)$</td><td>200</td><td>200</td><td>500</td><td>500</td><td>300</td><td>300</td></tr>
</table>
Максимум объёма (500) достигается при 100,02 и 100,03; дисбаланс в обоих случаях равен 200 (избыток покупки). Если опорная цена 100,03, выбираем 100,03; если 100,02, то 100,02. Все 500 акций торгуются по одной цене. Покупатель с лимитом 100,05 «выиграл» 2 цента на акцию, продавец с лимитом 100,00 тоже получил цену выше своего минимума.</div>
<p>Как это устроено на практике: Nasdaq перед открытием в 9:28 начинает раз в секунду публиковать дисбаланс заявок, ориентировочные цены и количество парных акций (по состоянию на период написания [44]; расписание на конкретной бирже — перепроверять), а в 9:30 происходит открывающий кросс. Закрывающий аукцион важен тем, что многие фонды считают стоимость пая по официальной цене закрытия, а пассивные индексные фонды ребалансируются в день изменения состава индекса по закрытию. По [44], около 10% дневного объёма американских акций индексов проходит в закрывающем аукционе.</p>

<h2>Единая или непрерывная цена: кто выигрывает</h2>
<p>Харрис сравнивает механизмы по тому, чьим интересам они служат. <b>Непрерывный аукцион</b> (дискриминирующая цена) выгоднее тем, кто забирает ликвидность большими объёмами; <b>аукцион с единой ценой</b> выгоднее небольшим поставщикам ликвидности (лимитным ордерам). Аукцион с единой ценой в его формулировке максимизирует суммарный «излишек» трейдеров, а непрерывная торговля даёт больший объём сделок при том же потоке ордеров. <b>Crossing-сети</b> используют производную цену (derivative pricing): они берут цену с основного рынка, и это делает их уязвимыми для манипуляций.</p>

<div data-widget="auction" data-title="Аукцион: спрос, предложение и цена клиринга"></div>
<p>Сдвигайте цены покупателей и продавцов, добавляйте рыночные заявки (on-open) и смотрите, как перемещается цена клиринга. Когда рыночных заявок на покупку много, цена уходит вверх, а объём ограничен предложением.</p>

<h2>Quote-driven: пример FX и last look</h2>
<p>Рынок валюты — внебиржевой (OTC), и многие торги идут по котировкам поставщиков ликвидности (makers). У котирующего может быть право <b>last look</b>: после получения запроса на сделку принять или отклонить её (reject). Это защита котирующего от того, что цена ушла за время передачи, но для получателя (taker) отказ — потерянное время и возможный дрейф цены. Отчёт Euronext FX [37] показывает, как отказ превращается в издержки. Ожидаемое проскальзывание $ES=(1-RR)\\,S_1+RR\\,S_2$, где $RR$ — доля отказов, $S_1$ — проскальзывание при исполнении с первого раза, $S_2$ — при повторной отправке второму maker (в модели он всегда исполняет; $S_2$ включает дрейф mid за время первого отказа). Пример из отчёта (группа G3, подписанты Кодекса): $0{,}77\\cdot0{,}31+0{,}23\\cdot0{,}48\\approx0{,}35$ б.п.</p>
<p>Результаты отчёта по всем парам: ожидаемое проскальзывание 0,83 б.п. у подписавших FX Global Code и 0,94 б.п. у не подписавших; доля отказов 23% и 34% соответственно. Но есть оговорки: отчёт написан самой платформой (Euronext FX), за один квартал (1 июня – 31 авг. 2022; 86 пар, 947 млрд USD оборота, 1,53 млн сделок); это средние значения, в 25% сессий не подписавшие были лучше; реализованные спреды практически не различаются (0,70 и 0,69 б.п.). То есть пример нужен, чтобы увидеть механизм (last look → отказ → издержки), а не как универсальный вывод о качестве liquidity providers.</p>

<div class="callout key"><span class="t">Что запомнить</span>
<ul>
<li>Order-driven: цену задают заявки в книге (price-time); quote-driven: цену называет дилер.</li>
<li>Непрерывная торговля даёт разные цены разным сделкам; call auction исполняет все заявки по единой цене, максимизирующей объём.</li>
<li>Цена клиринга: максимум $\\min(D,S)$, затем минимум дисбаланса, затем близость к опорной цене.</li>
<li>В OTC-рынке FX (quote-driven) важно право last look и доля отказов: это скрытая часть издержек.</li>
</ul></div>

<div class="callout warn"><span class="t">Осторожно</span>
Расписание Nasdaq и числа вроде 10% объёма на закрытие относятся к США конца 2010-х. Цифры FX — по одному отчёту платформы за один квартал 2022 года; они иллюстрируют метод, а не рынок в целом. Реальные аукционы сложнее нашей модели (ограничения на отмену, ценовые коридоры, особые типы ордеров).</div>
`,
        widgets: { auction: wAuction },
        quiz: [
          { q: 'Какой критерий применяется первым при выборе цены клиринга в аукционе открытия (по описанию Nasdaq в [44])?', options: ['Минимум дисбаланса', 'Максимум исполняемого (парного) объёма', 'Близость к цене закрытия предыдущего дня', 'Самая высокая цена'], answer: 1, explain: 'Порядок: максимум парных акций, затем минимум дисбаланса, затем близость к mid/опорной цене.' },
          { q: 'Чем отличается квотная торговля с last look от торговли в книге?', options: ['Котирующий может принять или отклонить сделку после запроса', 'Спред всегда равен нулю', 'Сделок не бывает', 'Все ордера исполняются по одной цене'], answer: 0, explain: 'Last look даёт maker право отклонить сделку; для taker отказ означает повторную отправку и потенциальный дрейф цены.' },
          { q: 'Спрос $D(100{,}03)=700$, предложение $S(100{,}03)=500$. Объём и дисбаланс при этой цене?', options: ['Объём 700, дисбаланс 0', 'Объём 500, избыток покупки 200', 'Объём 1200, дисбаланс 200', 'Объём 500, избыток продажи 200'], answer: 1, explain: 'Объём $\\min(700,500)=500$; $D-S=200>0$, значит, избыток покупки.' },
          { q: 'Какая из формулировок о ценообразовании у Харриса верна?', options: ['Единая цена в аукционе выгоднее небольшим поставщикам ликвидности, дискриминирующая — крупным liquidity-demanding трейдерам', 'Единая цена всегда выгоднее информированным трейдерам', 'При дискриминирующей цене все сделки идут по одной цене', 'Crossing-сети формируют собственную цену независимо от основного рынка'], answer: 0, explain: 'Так Харрис суммирует: continuous (discriminatory) выгоден крупным тейкерам, single price (uniform) — малым поставщикам; crossing-сети берут цену с основного рынка.' }
        ],
        sources: [
          { title: '[33] Harris, Trading and Exchanges', where: 'гл. 5–6 (структура рынков, order-driven markets; резюме 6.6–6.7)', note: 'Uniform/discriminatory/derivative pricing; сравнение механизмов.' },
          { title: '[44] Velu et al.', where: 'разд. 1.3.1–1.3.2 (LOB, open auction, табл. 1.1 Nasdaq Opening Cross), 1.3.4 (closing auction), 1.2.2 (Auctions)', note: 'Расписание и Reference Price по Nasdaq на период написания (≈2019); США.' },
          { title: '[37] Euronext FX, FX Global Code / Non-Code Assessment (2022)', where: 'разд. 6–8 (rejections, expected slippage, формулы), стр. 597–664 txt; пример G3 — стр. 1003–1015', note: 'Отчёт самой платформы; 1 квартал; выводы — средние; это не текст Кодекса.' }
        ]
      },
      /* -------------------------------------------------- Урок 4 */
      {
        id: 'm01-l4',
        title: 'Площадки: биржи, ATS, dark pools и регулирование',
        minutes: 35,
        html: `
<p>Акцию США можно купить на десятке бирж, десятках альтернативных систем (ATS), у дилера, внутри брокера. Фрагментация — не случайность, а результат конкуренции и регулирования. Для вашего ордера это вопрос «куда его отправить», и ответ зависит от цены, комиссий, вероятности исполнения и утечки информации.</p>

<h2>Откуда взялась фрагментация</h2>
<p>По [44]: традиционные биржи были физическими площадками, где брокеры торговали на полу; в 1971 году запустили полностью электронную Nasdaq; ещё раньше, в 1969-м, появился Instinet — первая электронная коммуникационная сеть (ECN), позволявшая институционалам торговать напрямую в обход NYSE. Затем пришли Archipelago и Island. Интерес к бумаге перестал быть сосредоточен в одном месте и распределился по нескольким «пулам ликвидности». В 2001 году десятичная реформа сузила спреды, ушло много маркет-мейкеров, биржи ввели maker-taker, и вырос HFT. В 2005 году введён <b>Reg NMS</b> (Regulation National Market System). Доля NYSE в торгах собственными бумагами упала с более чем 80% (2005) до 25% (2010): по [44], правило защиты котировок этому заметно способствовало — иллюстрация, как регуляция разнесла ликвидность.</p>

<h2>Виды площадок</h2>
<table>
<tr><th>Площадка</th><th>Суть</th><th>Прозрачность</th></tr>
<tr><td><b>Биржа</b> (exchange)</td><td>Публичная книга, price-time, выставляет котировки, которые «защищены» правилами. В США по [44] около 60–70% объёма; 15 зарегистрированных бирж (13 активных на момент написания), большинство принадлежат трём группам (ICE, Nasdaq, Cboe) и остаются отдельными пулами.</td><td>книга видна всем</td></tr>
<tr><td><b>ATS / dark pool</b></td><td>Альтернативная торговая система: не показывает ордера, берёт цену с NBBO (обычно по mid или внутри спреда), информация о сделке публикуется после факта. В [44]: около 30–40% объёма США приходится на внебиржевые сделки вообще, из них ATS/dark pools — примерно 30%; в 2019 году 33 акционные ATS, 5 крупнейших дают около 50% тёмной ликвидности.</td><td>ордера не видны</td></tr>
<tr><td><b>Internalization</b> (интернализация)</td><td>Брокер или оптовый дилер исполняет клиентский ордер против собственного инвентаря или потока. Остальные ~70% внебиржевого объёма США — розничные оптовики, маркет-мейкеры, single-dealer platforms и брокеры-дилеры.</td><td>внутри фирмы</td></tr>
<tr><td><b>Systematic internalizer / single-dealer platform</b></td><td>Дилер даёт прямой доступ к своей ликвидности через индивидуальные индикации интереса (IOI). Не регулируется как ATS и поэтому может предлагать нестандартные продукты.</td><td>индивидуальные котировки</td></tr>
</table>
<p>Зачем dark pool? Крупный ордер на бирже виден, и информация о нём «утекает», а в тёмном пуле он ждёт встречного без сигнала. Но [44] оговаривает: утверждение об отсутствии утечки <b>вероятно преувеличено</b>, потому что можно «пинговать» пул заявками минимального размера и находить крупные блоки; поэтому ордера отправляют с <b>минимальным размером исполнения</b>. Другая проблема buy-side пулов: фонды часто торгуют в одну сторону (например, оба копируют один бенчмарк), поэтому ликвидность в них односторонняя.</p>
<p>Европа ([44], декабрь 2018): 59% на основной бирже, 22% на lit MTF (мультилатеральных торговых площадках), 6,5% на dark MTF, 6% в системных интернализаторах: фрагментация ниже, чем в США. На большей части Азиатско-Тихоокеанского региона один рынок.</p>

<h2>Reg NMS: что регулятор требует от маршрутизации</h2>
<p>В США у каждой акции много площадок, и нужно, чтобы инвестор не торговал по худшей цене, когда лучшая есть рядом. Reg NMS 2005 года вводит два ключевых правила ([44]):</p>
<ul>
<li><b>Access Rule</b>: недискриминационный доступ к котировкам площадок и ограничение комиссии за доступ к отображаемой котировке.</li>
<li><b>Order Protection Rule</b>: торговые центры должны исполнять ордера по цене не хуже лучшей, доступной на «защищённых» площадках (все зарегистрированные биржи защищены). Исполнение хуже лучшей защищённой котировки называется <b>trade-through</b>. Это и есть «национальный лучший bid и offer» — <b>NBBO</b> (National Best Bid and Offer).</li>
</ul>
<p>Эти правила усилили фрагментацию: если ликвидность на любой защищённой бирже равноправна, выгодно открывать новые биржи. Харрис объясняет противоположную силу: <b>внешний эффект потока заявок</b> (order flow externality). Лимитные ордера дают другим бесплатные опционы на торговлю, поэтому ликвидность стремится к самой ликвидной площадке (концентрация). Итог — два конкурирующих эффекта; в США пока преобладала фрагментация.</p>
<p>ATS регулируются отдельно (Reg ATS): если ATS показывает ордера участников за пределами системы и в акции NMS его торги в среднем составляют 5% и более от совокупного среднего дневного объёма не менее чем в четыре из шести предыдущих месяцев, на него распространяются обязанности по передаче лучших котировок в общий поток и по доступу к ним (правило 301(b)(3)); при пороге 5% действуют и требования честного доступа (правило 301(b)(5)). Этого порога в [44] нет: он проверен по документам SEC, а не по библиотеке курса; с 2019 года ATS подают Form ATS-N с описанием конфликтов интересов и возможных утечек информации; по правилу FINRA 4552 объёмы dark pools публикуются с задержкой ([44]).</p>
<p><b>Best execution</b> — обязанность брокера добиваться наилучших условий для клиента, а не только лучшей цены: учитываются цена, вероятность исполнения, комиссии, скорость.</p>

<h2>Уровни данных: L1, L2, L3</h2>
<p>Какую информацию о книге вы видите, зависит от подписки ([44], разд. 1.4.2):</p>
<ul>
<li><b>Level 1</b>: сделки и лучшие котировки (BBO). Позволяет восстановить лучший bid/offer; котировки обновляются примерно на порядок чаще, чем сделки.</li>
<li><b>Level 2</b>: глубина — все обновления отображаемой книги по уровням цен на всех «светлых» площадках.</li>
<li><b>Level 3</b>: message data — каждое сообщение книги с уникальным ID ордера: добавление (buy/sell), исполнение частичное/полное, отмена частичная/полная, исполнение скрытого ордера. По нему можно восстановить книгу в любой момент и следить за судьбой каждого ордера.</li>
</ul>
<p>Latency (задержка) создаёт отдельные эффекты. Большинство американских бирж расположено в четырёх дата-центрах в Нью-Джерси (Mahwah, Secaucus, Carteret, Weehawken), и разница во времени передачи данных между ними даёт возможность <b>латентного арбитража</b>: быстрые HFT с колокацией и микроволновыми линиями видят изменение котировки раньше остальных и либо торгуют быстрее, либо отменяют свои котировки (<i>liquidity fading</i>). Биржа IEX поставила «speed bump» — катушку оптоволокна, задерживающую ордера на 350 микросекунд, чтобы ослабить скоростное преимущество; доля IEX остаётся 2–3% (2019).</p>

<div data-widget="route" data-title="Две площадки и маршрутизация ордера"></div>
<p>Поэкспериментируйте: сделайте B на тик дешевле и посмотрите, когда «дешевле всего» совпадает с «по цене». Сделайте комиссию на B отрицательной (инвертированная модель): тейкер получает плату, и выгодно идти на B даже по такой же цене. Включите dark pool: ожидаемая экономия растёт с вероятностью исполнения. Посмотрите, какая стратегия нарушает правило trade-through.</p>

<div class="callout key"><span class="t">Что запомнить</span>
<ul>
<li>Фрагментация — результат ECN, десятичной реформы и Reg NMS: у акции много площадок, и они равноправны по Order Protection Rule.</li>
<li>Dark pool и internalization торгуют внутри NBBO без публичной книги; плюсы — меньше утечки, минусы — риск «пинга» и менее предсказуемое исполнение.</li>
<li>NBBO — лучшая цена по защищённым площадкам; trade-through — исполнение хуже неё.</li>
<li>L1 — сделки и BBO, L2 — глубина, L3 — отдельные сообщения с ID ордера.</li>
</ul></div>

<div class="callout warn"><span class="t">Осторожно</span>
Все числа этого урока (доли объёма, число площадок, IEX 2–3%) относятся к США около 2019 года, в Европе картина другая. Европейский MiFID II и американский Reg NMS — разные режимы. Данные в [22] (2013–2014 гг.) и [33] (2003 г.) ещё старше. Не путайте Reg ATS (регулирование альтернативных систем) с Reg NMS (маршрутизация и защита котировок). Комиссии в виджете учебные.</div>
`,
        widgets: { route: wRoute },
        quiz: [
          { q: 'Что такое trade-through?', options: ['Сделка через брокера', 'Исполнение ордера по цене хуже лучшей доступной защищённой котировки на другой площадке', 'Сквозная нумерация сделок в ленте', 'Исполнение ордера в dark pool'], answer: 1, explain: 'Order Protection Rule Reg NMS требует исполнять не хуже лучшей защищённой котировки; нарушение называется trade-through.' },
          { q: 'Зачем крупный инвестор отправляет ордер с минимальным размером исполнения в dark pool?', options: ['Чтобы получить большую скидку на комиссию', 'Чтобы блок нельзя было «прощупать» мелкими пинг-заявками', 'Чтобы пул не публиковал сделку', 'Чтобы обойти Reg ATS'], answer: 1, explain: 'Пинг-заявки минимального размера раскрывают наличие блока; минимальный размер исполнения отсекает мелкие встречные.' },
          { q: 'Какой уровень рыночных данных позволяет проследить судьбу отдельного ордера?', options: ['Level 1', 'Level 2', 'Level 3', 'Ни один: ордера анонимны и не отслеживаются'], answer: 2, explain: 'В Level 3 у каждого ордера есть уникальный ID, и приходят сообщения о его добавлении, исполнении, отмене.' },
          { q: 'Харрис описывает «внешний эффект потока заявок». Что он означает для фрагментации?', options: ['Ликвидность стремится концентрироваться на самой ликвидной площадке', 'Любая новая площадка гарантированно получает половину объёма', 'Регулятор запрещает конкуренцию площадок', 'Все площадки автоматически делят комиссию'], answer: 0, explain: 'Лимитные ордера дают другим бесплатные опционы, и это тянет ликвидность к доминирующему рынку; Reg NMS работает в противоположную сторону.' }
        ],
        sources: [
          { title: 'SEC, Release No. 34-83663 (2018): поправки к Regulation ATS', where: 'правила 301(b)(3), 301(b)(5)', note: 'порог 5% проверен по сайту sec.gov в ноябре 2026 г.; источник не из библиотеки курса' },
          { title: '[44] Velu et al.', where: 'разд. 1.1 (история, Reg NMS), 1.2.2 (площадки, ATS, SDP, Европа), 1.4.2 (L1–L3, табл. 1.10), 11.x (Reg ATS, Form ATS-N)', note: 'США и Европа 2018–2019; доли объёма — оценки на момент написания.' },
          { title: '[33] Harris, Trading and Exchanges', where: 'гл. 25–26 (internalization, preferencing, конкуренция рынков; order flow externality)', note: 'Концепции; институты 2003 г.' },
          { title: '[22] O\'Hara, High Frequency Market Microstructure', where: 'разд. 2.1–2.4, 4 (trade-through, trade-at, IEX 350 мкс)', note: 'Фрагментация, латентность, правила приоритета; 2013–2014 гг.' }
        ]
      },
      /* -------------------------------------------------- Урок 5 */
      {
        id: 'm01-l5',
        title: 'Что такое ликвидность и как её измерять',
        minutes: 30,
        html: `
<p>«Ликвидный рынок» — слово, которое все понимают и никто не определяет одинаково. Но ликвидность — главный результат рынка, и именно её приходится оценивать, когда вы решаете, как и где торговать. В этом уроке мы разберём определение и четыре измерения ликвидности (tightness, depth, resiliency, immediacy) и посчитаем по формулам на примере книги.</p>

<h2>Определение и измерения</h2>
<p>Харрис: <b>ликвидность</b> — это способность торговать <b>большой объём быстро и с низкими издержками</b>. В этом определении три измерения: размер, время и стоимость. Трейдеры называют их <b>depth</b> (глубина), <b>immediacy</b> (немедленность) и <b>width</b> / <b>tightness</b> (ширина, узость спреда). К ним добавляют четвёртое — <b>resiliency</b> (упругость): как быстро цены возвращаются к прежнему уровню после смещения, вызванного ликвидностными сделками. Ещё раньше Блэк (1971, цитируется в [44]) описал ликвидный рынок так: всегда есть bid и ask для небольших объёмов; спред всегда мал; крупный пакет можно продать за долгое время по цене, не сильно отличающейся от текущей; а мгновенно — но с премией, растущей с размером блока.</p>
<table>
<tr><th>Измерение</th><th>Вопрос</th><th>Как измерять</th></tr>
<tr><td><b>Tightness</b> (ширина)</td><td>Сколько стоит круговая сделка малого объёма?</td><td>Котируемый спред $A-B$; относительный спред $(A-B)/m$ в б.п.</td></tr>
<tr><td><b>Depth</b> (глубина)</td><td>Какой объём можно сделать без существенного сдвига цены?</td><td>Суммарный размер на лучших ценах; в $k$ уровнях; в пределах $x$ б.п. от mid</td></tr>
<tr><td><b>Immediacy</b> (немедленность)</td><td>Как быстро и за какую цену исполнится рыночный ордер размера $Q$?</td><td>Средняя цена прохода по книге; издержки против mid</td></tr>
<tr><td><b>Resiliency</b> (упругость)</td><td>Как быстро книга восстановится после крупной сделки?</td><td>Время восстановления спреда/цены; реверсия mid после сделки</td></tr>
</table>

<h2>Формулы</h2>
<p>Пусть $B$ — лучший bid, $A$ — лучший ask. <b>Mid-цена</b> $m=\\frac{A+B}{2}$. <b>Котируемый спред</b> $A-B$, <b>относительный</b> $\\frac{A-B}{m}\\cdot 10^4$ б.п. Для покупки рыночным ордером размера $Q$ средняя цена $\\bar p$ — взвешенная по уровням, которые пришлось пройти. <b>Эффективный спред</b> (effective spread, по Харрису) равен
$$ES_{\\text{eff}} = 2\\,(\\bar p - m)\\quad\\text{для покупки},\\qquad 2\\,(m-\\bar p)\\quad\\text{для продажи},$$
где $m$ — mid в момент сделки. Он включает и половину спреда, и «проход» по книге, а при исполнении внутри спреда может быть меньше котируемого — это <b>price improvement</b> (разность котируемого и эффективного). <b>Реализованный спред</b> (realized spread) строится так же, но с mid, взятым через заданный интервал после сделки (Харрис), в [22] в примере пять минут; разность «эффективный − реализованный» — потеря поставщика ликвидности на информированных. У O'Hara ([22]) отмечено, что в мире HFT реализованный спред часто отрицателен, и метрика теряет интерпретируемость.</p>
<p>Простейший сигнал «давления» в книге — <b>дисбаланс котировок</b> и <b>microprice</b> ([44], гл. 8):
$$\\mathrm{qimb}=\\frac{Q^b-Q^a}{Q^b+Q^a},\\qquad P^{\\mathrm{micro}}=I\\,P^a+(1-I)\\,P^b,\\quad I=\\frac{Q^b}{Q^b+Q^a},$$
где $Q^b,Q^a$ — размеры на лучших bid и ask. Идея: если на bid много, а на ask мало, покупатели «давят», и справедливая цена ближе к ask. Это только эвристика; зависимость от размера котировок манипулируема (урок про спуфинг — модуль 8).</p>
<p>Если из-за трений наблюдаемая цена $p_t=m_t+c\\,q_t$ ($q_t=\\pm1$ — направление сделки, $c$ — половина спреда), то это <b>модель Ролла</b> (Roll model, [44], разд. 1.5.1): цена «подпрыгивает» между bid и ask, и это создаёт отрицательную автокорреляцию доходностей.</p>
<div class="example"><b>Учебный пример.</b> Книга: bid 100,00; ask 100,02; на ask последовательно 1000 по 100,02; 1200 по 100,03; 1440 по 100,04; на bid 1000. Mid $100{,}01$, спред $0{,}02$, относительный $\\approx2{,}0$ б.п. Рыночная покупка 3000: 1000×100,02 + 1200×100,03 + 800×100,04, средняя цена $\\bar p\\approx100{,}0293$. Издержки против mid: $0{,}0193$ долл., т. е. $1{,}93$ цента на акцию или $1{,}9$ б.п.; эффективный спред $2\\cdot0{,}0193=0{,}0387$ — почти вдвое больше котируемого $0{,}02$. Дисбаланс на лучших ценах $=(1000-1000)/2000=0$, microprice $=100{,}01$.</div>

<div data-widget="liq" data-title="Спред, глубина и стоимость рыночного ордера для заданной книги"></div>
<p>Поиграйте с параметрами: уменьшайте глубину на лучшей цене, и стоимость рыночного ордера заданного размера быстро растёт; расширяйте спред, и она растёт линейно. Сдвиньте дисбаланс: microprice сдвигается к ask, если на bid больше. Нижний график — учебная модель resiliency: после крупной покупки лучшая цена сместилась, и мы предполагаем, что книга возвращается к прежнему уровню экспоненциально с заданным полупериодом. Ни Харрис, ни Velu не дают такой функциональной формы; это иллюстрация идеи «чем упруже рынок, тем быстрее реверсия».</p>

<h2>Откуда берётся ликвидность</h2>
<p>Харрис выделяет пять типов поставщиков ликвидности: <b>маркет-мейкеры</b> (предлагают immediacy малым трейдерам по узкому спреду), <b>блок-дилеры</b> (depth для крупных неинформированных клиентов), <b>value traders</b> (depth для всех и поддержание resiliency: они покупают, когда цена падает ниже оценки стоимости), <b>precommitted</b> трейдеры (уже намеренные торговать и потому дешёво предлагающие immediacy) и <b>арбитражёры</b> (переносят ликвидность между рынками). Для маленького нетерпеливого трейдера ликвидность организуют биржи и брокеры — они работают как «поисковые системы»; для крупного поиск контрагента сложнее и дороже.</p>
<p>Часто нормируют размер ордера на <b>ADV</b> (average daily volume, средний дневной объём) и сравнивают издержки в б.п.: ордер в 0,1% от ADV и в 10% от ADV — разные задачи ([44], гл. 8). Подробности об издержках исполнения — в модуле 4.</p>

<div class="callout key"><span class="t">Что запомнить</span>
<ul>
<li>Ликвидность: торговать большой объём быстро и недорого; четыре грани: tightness, depth, immediacy, resiliency.</li>
<li>Спред покупателя и продавца — только верхушка: для крупного ордера определяющая часть стоимости набирается проходом по книге.</li>
<li>Эффективный спред $=2\\,|\\bar p-m|$; реализованный спред добавляет реверсию mid после сделки и показывает, сколько заработал поставщик.</li>
<li>Видимая глубина — не вся ликвидность: скрытые ордера и быстрая отмена котировок меняют картину.</li>
</ul></div>

<div class="callout warn"><span class="t">Осторожно</span>
Спред и видимая глубина — лишь снимки книги в момент времени. В высокочастотной среде значительная часть заявок отменяется до исполнения (по [22] до 98%), и показанная глубина может исчезнуть при попытке взять её. Метрики типа реализованного спреда и классификации сделок Ли–Рэди (по обзору в [44], для коротких продаж около 70% точности) шумные. Числа примера выше — учебные, пересчитайте их сами в виджете.</div>
`,
        widgets: { liq: wLiq },
        quiz: [
          { q: 'Рыночная покупка исполнилась со средней ценой 100,0293 при mid 100,01. Чему равен эффективный спред (долл.)?', options: ['0,0193', '0,0387', '0,0626', '0,01'], answer: 1, explain: 'По определению $2(\\bar p-m)=2\\cdot0{,}0193\\approx0{,}0387$.' },
          { q: 'Что измеряет resiliency?', options: ['Ширину спреда', 'Суммарный размер на лучших ценах', 'Скорость возвращения цен к прежнему уровню после сделок, сместивших их', 'Среднюю комиссию'], answer: 2, explain: 'По Харрису, resiliency — как быстро цены возвращаются к прежнему уровню после сдвига, вызванного ликвидностно-мотивированными сделками.' },
          { q: 'На лучшем bid 3000 акций, на лучшем ask 1000. Чему равен $I$ и куда сдвинется microprice относительно mid?', options: ['$I=0{,}75$, ближе к ask', '$I=0{,}25$, ближе к bid', '$I=0{,}75$, ближе к bid', '$I=0{,}5$, останется на mid'], answer: 0, explain: '$I=Q^b/(Q^b+Q^a)=0{,}75$, и $P^{micro}=0{,}75P^a+0{,}25P^b$ ближе к ask: давление покупателей.' },
          { q: 'Почему крупный рыночный ордер может стоить намного дороже «половины спреда»?', options: ['Комиссия брокера пропорциональна спреду', 'Он проходит несколько уровней книги, и средняя цена уходит от лучшей', 'Спред умножается на размер ордера', 'Чем крупнее ордер, тем выше приоритет'], answer: 1, explain: 'Издержки состоят из половины спреда и «прохода» по книге; второй компонент растёт с размером ордера и падает с глубиной.' }
        ],
        sources: [
          { title: '[33] Harris, Trading and Exchanges', where: 'гл. 19 (ликвидность; резюме 19.5, строки 24309–24359), гл. 21 (21.3.1: effective и realized spread, VWAP, IS)', note: 'Определения и методика издержек; институты 2003 г.' },
          { title: '[44] Velu et al.', where: 'разд. 1.5.1 (определение Блэка, модель Ролла), 8.x (нормализации на ADV, imbalance, microprice)', note: 'Формулы микросигналов (8.8, 8.10); оговорка автора о точности классификации сделок.' },
          { title: '[22] O\'Hara, High Frequency Market Microstructure', where: 'разд. 3.3 (realized spread, order imbalance), 2.2 (отмены)', note: 'Критика привычных метрик в мире HFT; 2013–2014 гг.' }
        ]
      }
    ],
    terms: [
      { en: 'buy-side / sell-side', ru: 'покупающая / продающая сторона', def: 'Buy-side: фонды и управляющие, которые покупают бумаги для портфеля. Sell-side: брокеры и дилеры, которые помогают исполнять сделки и берут за это комиссию или спред.' },
      { en: 'agent / principal', ru: 'агент / принципал', def: 'Агент (брокер) исполняет поручение клиента от его имени; принципал (дилер) торгует с собственного баланса и берёт риск на себя.' },
      { en: 'HFT / ELP', ru: 'высокочастотный трейдер / электронный поставщик ликвидности', def: 'Фирма, которая за счёт низкой задержки и автоматизации быстро котирует и разворачивает позиции; доход от спреда, ребейтов и перемещения инвентаря.' },
      { en: 'informed trader', ru: 'информированный трейдер', def: 'Торгует, потому что знает о фундаментальной стоимости больше других; его прибыль идёт за счёт менее информированных. В упрощённой модели спред $A-B=2P\\varepsilon$.' },
      { en: 'market order / limit order', ru: 'рыночный / лимитный ордер', def: 'Рыночный: исполнить немедленно по лучшей доступной цене. Лимитный: исполнить только по цене не хуже заданной; может не исполниться.' },
      { en: 'stop order', ru: 'стоп-ордер', def: 'Ордер, который «просыпается», когда рыночная цена достигает стоп-цены, после чего становится рыночным или лимитным. Не гарантирует цену исполнения.' },
      { en: 'IOC / FOK', ru: 'исполнить или отменить / исполнить целиком или отменить', def: 'Инструкции времени жизни: IOC отменяет неисполненный остаток сразу, FOK исполняется только полностью или не исполняется вовсе.' },
      { en: 'iceberg order', ru: 'айсберг-ордер', def: 'Лимитный ордер, в котором в книге показана лишь часть размера; новая порция встаёт в конец очереди.' },
      { en: 'price-time priority', ru: 'приоритет «цена – время»', def: 'Правило очередности: сначала лучшая цена, при равной цене — более ранний ордер.' },
      { en: 'tick size', ru: 'тик, минимальный шаг цены', def: 'Наименьшее допустимое изменение цены. Слишком малый тик ослабляет приоритет по времени, слишком большой — конкуренцию по цене.' },
      { en: 'maker-taker', ru: 'модель «мейкер–тейкер»', def: 'Тарифы, по которым биржа платит ребейт тому, чей лимитный ордер исполнен (maker), и берёт комиссию с того, кто забрал ликвидность (taker).' },
      { en: 'order-driven / quote-driven', ru: 'рынок, управляемый заявками / котировками', def: 'Order-driven: цены задают ордера в общей книге. Quote-driven: дилеры называют bid/ask, и сделки заключаются с ними.' },
      { en: 'call auction / clearing price', ru: 'вызывной аукцион / цена клиринга', def: 'Сбор заявок и одновременное исполнение по единой цене $p^*$, при которой максимален $\\min\\{D(p),S(p)\\}$; при равенстве — минимальный дисбаланс.' },
      { en: 'ATS / dark pool', ru: 'альтернативная торговая система / «тёмный» пул', def: 'Площадка, не показывающая ордера до сделки; торгует по NBBO, чаще по mid. Регулируется отдельно (Reg ATS).' },
      { en: 'internalization', ru: 'интернализация', def: 'Исполнение клиентского ордера самим брокером или оптовым дилером против собственного инвентаря, а не на бирже.' },
      { en: 'NBBO / trade-through', ru: 'национальный лучший bid/offer / сквозная сделка', def: 'NBBO — лучшие цены по защищённым площадкам США. Trade-through — исполнение хуже лучшей защищённой котировки; Order Protection Rule Reg NMS его ограничивает.' },
      { en: 'Level 1 / 2 / 3 data', ru: 'данные уровней 1, 2, 3', def: 'L1: сделки и лучшие котировки; L2: глубина книги по уровням; L3: поток сообщений по отдельным ордерам с ID (add/execute/cancel).' },
      { en: 'last look', ru: 'последний взгляд', def: 'Право котирующего (maker, обычно в FX) принять или отклонить сделку после запроса. Для taker отказ — задержка и возможный дрейф цены.' },
      { en: 'liquidity: tightness, depth, resiliency', ru: 'ликвидность: ширина, глубина, упругость', def: 'Способность торговать большой объём быстро и недорого. Tightness — малый спред; depth — большой объём вокруг цены; resiliency — быстрое восстановление цен после сделок.' },
      { en: 'effective spread', ru: 'эффективный спред', def: '$2\\,|\\bar p-m|$: удвоенная разница между средней ценой исполнения и mid в момент сделки; включает половину спреда и «проход» по книге.' }
    ]
  });
})();
