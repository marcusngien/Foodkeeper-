// pages.js — 放在 home.js 后面加载。不改 app.js / home.js：
// 给每个页面加上「横幅 + 数据条 + 右侧栏」，并包装现有的 render 函数让数据实时更新。
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const fmtRM = n => 'RM ' + (Number(n) || 0).toFixed(2);
  const kpi = (v, l) => `<div class="pg-kpi"><span class="pg-kpi-num">${v}</span><span class="pg-kpi-lbl">${l}</span></div>`;
  const card = (title, body, tint = '') => `<section class="pg-card ${tint}"><h4>${title}</h4>${body}</section>`;
  const sum = arr => arr.reduce((s, w) => s + (Number(w.price) || 0), 0);

  const TIPS = [
    'Put older items at the front of the shelf so you reach for them first.',
    'Freeze meat and bread the day you buy them if you will not use them this week.',
    'Check the pantry before you shop. It is the cheapest way to avoid doubles.',
    'Wilted vegetables still make great soup or stir fry.',
    'Store bananas, apples and tomatoes away from leafy greens.',
    'Cook smaller portions first. You can always add more.',
    'Use vegetable peels and bones to make stock instead of binning them.'
  ];

  // ── 每页的小插画（线条风，颜色跟着主题）──
  const art = inner => `<svg viewBox="0 0 160 110" fill="none" stroke="var(--tone)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ART = {
    pantry: art('<path d="M14 98h132"/><rect x="24" y="30" width="30" height="68" rx="6"/><path d="M24 52h30"/><rect x="64" y="46" width="26" height="52" rx="6"/><path d="M70 36h14M72 36v10M82 36v10"/><path d="M104 98c-4-26 4-50 34-62-2 30-12 52-34 62z"/><path d="M104 98c8-18 16-30 28-42"/>'),
    shopping: art('<path d="M16 22h16l12 50h66l12-38H38"/><circle cx="56" cy="90" r="6"/><circle cx="106" cy="90" r="6"/><path d="M62 50h40" stroke="#F4D84A" stroke-width="4"/>'),
    waste: art('<path d="M120 55a40 40 0 0 1-70 26M40 55a40 40 0 0 1 70-26"/><path d="M112 14v18H94M48 96V78h18"/><path d="M70 62c0-10 7-16 18-16 0 10-6 16-18 16z" stroke="#F4D84A"/>'),
    recipes: art('<path d="M30 56h100v8c0 22-14 34-50 34S30 86 30 64z"/><path d="M22 56h116"/><path d="M62 40c-6-8 6-12 0-22M82 40c-6-8 6-12 0-22M102 40c-6-8 6-12 0-22" stroke="#4C91D8"/>'),
    receipt: art('<path d="M40 12h80v86l-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7z"/><path d="M56 36h48M56 52h48M56 68h28"/><path d="M96 68h8" stroke="#F4D84A" stroke-width="4"/>'),
    leaderboard: art('<path d="M20 98h120"/><rect x="28" y="62" width="28" height="36" rx="3"/><rect x="66" y="30" width="28" height="68" rx="3"/><rect x="104" y="50" width="28" height="48" rx="3"/><path d="M80 12l4 8 9 1-6 6 2 9-9-5-9 5 2-9-6-6 9-1z" stroke="#F4D84A"/>'),
    quiz: art('<circle cx="80" cy="56" r="40"/><path d="M66 46a14 14 0 1 1 20 12c-4 3-6 6-6 10"/><path d="M80 82v.5" stroke-width="4"/><path d="M128 18l6 10M140 30l10-2" stroke="#F4D84A" stroke-width="3.4"/>')
  };

  const heroHTML = ({ tone, title, text, actions = '', art: a }) => `
    <header class="pg-hero tone-${tone}">
      <div><h2>${title}</h2><p>${text}</p>${actions ? `<div class="pg-actions">${actions}</div>` : ''}</div>
      <div class="pg-art" aria-hidden="true">${a}</div>
    </header>`;

  // 把页面原有的内容整体搬进 .pg-main，再前面加横幅/数据条，后面加右侧栏。ID 和 onclick 都不会丢。
  function build(id, { hero, strip, side }) {
    const view = $('view-' + id);
    if (!view || view.dataset.pg) return null;
    view.dataset.pg = '1';
    view.classList.add('pg-view', 'pg-' + id);
    const main = document.createElement('div');
    main.className = 'pg-main';
    Array.from(view.children).forEach(k => main.appendChild(k));
    const body = document.createElement('div');
    body.className = 'pg-body' + (side ? '' : ' no-side');
    body.appendChild(main);
    if (side) {
      const a = document.createElement('aside');
      a.className = 'pg-side';
      a.id = 'pg-side-' + id;
      a.innerHTML = side;
      body.appendChild(a);
    }
    view.insertAdjacentHTML('beforeend', hero);
    if (strip === 'auto') view.insertAdjacentHTML('beforeend', `<section class="pg-strip" id="pg-strip-${id}"></section>`);
    else if (strip) view.insertAdjacentHTML('beforeend', strip);
    view.appendChild(body);
    return { view, main, body };
  }

  // ═════════ 初始化各页面骨架 ═════════
  function init() {
    // Pantry
    const p = build('pantry', {
      hero: heroHTML({
        tone: 'green', art: ART.pantry,
        title: 'Your kitchen, at a glance.',
        text: 'Everything in your fridge, freezer and pantry, sorted so the first thing to expire is the first thing you see.',
        actions: `<button class="pg-btn solid" onclick="openModal()">Add ingredient</button><button class="pg-btn line" onclick="toggleBulkMode()">Select several</button>`
      }),
      side: '<div id="pg-pantry-side-inner" style="display:contents"></div>'
    });
    if (p) {
      const stats = document.querySelector('.stats');
      if (stats) p.view.insertBefore(stats, p.body);
      const tb = p.main.querySelector('.toolbar');
      if (tb) tb.insertAdjacentHTML('afterend', '<div class="pg-chips" id="pantry-chips"></div>');
    }

    // Shopping
    build('shopping', {
      hero: heroHTML({
        tone: 'blue', art: ART.shopping,
        title: 'Shop with a plan.',
        text: 'Write it down once, tick it off in the shop, and skip the things already sitting in your fridge.'
      }),
      strip: 'auto',
      side: '<div id="pg-shop-side-inner" style="display:contents"></div>'
    });

    // Waste
    build('waste', {
      hero: heroHTML({
        tone: 'yellow', art: ART.waste,
        title: 'See what you throw away.',
        text: 'Every item you log shows where money leaks out of your kitchen. Spot the pattern, then fix it.'
      }),
      strip: 'auto',
      side: '<div id="pg-waste-side-inner" style="display:contents"></div>'
    });

    // Recipes
    const r = build('recipes', {
      hero: heroHTML({
        tone: 'blue', art: ART.recipes,
        title: 'Cook what is about to expire.',
        text: 'The AI chef builds a menu from the ingredients that need using up first, so nothing goes in the bin.',
        actions: `<button class="pg-btn blue" onclick="generateAICustomMenu()">Generate menu</button>`
      }),
      strip: 'auto',
      side: '<div id="pg-recipes-side-inner" style="display:contents"></div>'
    });
    if (r) {
      const btn = r.main.querySelector('button.btn-primary');
      if (btn) btn.insertAdjacentHTML('beforebegin', '<div class="pg-chips" id="recipe-styles"></div>');
    }

    // Receipt
    const rc = build('receipt', {
      hero: heroHTML({
        tone: 'green', art: ART.receipt,
        title: 'Turn a receipt into a stocked pantry.',
        text: 'Snap your grocery receipt. The AI picks out the food, estimates how long it lasts and totals the cost.'
      }),
      strip: `<section class="pg-steps">
        <div class="pg-step"><i>1</i><div><b>Upload</b><small>A clear photo of the receipt</small></div></div>
        <div class="pg-step"><i>2</i><div><b>Review</b><small>Check the items and prices</small></div></div>
        <div class="pg-step"><i>3</i><div><b>Add</b><small>Send them all to your pantry</small></div></div>
      </section>`,
      side: `
        ${card('For a good scan', `<ul class="pg-mini"><li><span class="pg-emo">💡</span><span class="pg-grow">Shoot in bright, even light</span></li><li><span class="pg-emo">📄</span><span class="pg-grow">Flatten the paper and keep the whole receipt in frame</span></li><li><span class="pg-emo">🔍</span><span class="pg-grow">Make sure the text is sharp, not blurry</span></li></ul>`, 'tint-green')}
        ${card('What gets added', `<p class="pg-muted">Only food items. Tax, service charge and non-food lines are skipped. You can read the table before anything is saved to your pantry.</p>`)}`
    });
    if (rc) {
      const cardEl = rc.main.querySelector('.receipt-card'), input = $('receipt-file');
      if (cardEl && input) {
        ['dragenter', 'dragover'].forEach(ev => cardEl.addEventListener(ev, e => { e.preventDefault(); cardEl.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach(ev => cardEl.addEventListener(ev, e => { e.preventDefault(); cardEl.classList.remove('drag'); }));
        cardEl.addEventListener('drop', e => {
          const f = e.dataTransfer && e.dataTransfer.files[0];
          if (!f || !f.type.startsWith('image/')) { toast('Please drop an image file.'); return; }
          input.files = e.dataTransfer.files;
          previewReceipt({ target: input });
        });
      }
    }

    // Leaderboard
    build('leaderboard', {
      hero: heroHTML({
        tone: 'yellow', art: ART.leaderboard,
        title: 'Beat your worst week.',
        text: 'Your weeks ranked by the value of food wasted. Lower is better, and a clean week is a win.'
      }),
      strip: 'auto',
      side: '<div id="pg-lb-side-inner" style="display:contents"></div>'
    });

    // Quiz
    build('quiz', {
      hero: heroHTML({
        tone: 'green', art: ART.quiz,
        title: 'How much do you know about food waste?',
        text: `${QUIZ_QUESTIONS.length} quick questions on the 5R framework, storage and climate. See if you can beat your best.`
      }),
      strip: 'auto',
      side: `
        ${card('The 5R cheat sheet', `<ul class="pg-5r">
          <li><b>Refuse</b><span>Say no to food you do not need</span></li>
          <li><b>Reduce</b><span>Buy and cook only what you will eat</span></li>
          <li><b>Recycle</b><span>Compost scraps, reuse packaging</span></li>
          <li><b>Repair</b><span>Store food well so it lasts longer</span></li>
          <li><b>Reconsider</b><span>Pause before every purchase</span></li>
        </ul>`, 'tint-yellow')}
        ${card('Did you know?', `<p class="pg-tip" id="qz-fact"></p>`)}`
    });
  }

  // ═════════ Pantry ═════════
  function refreshPantry() {
    const box = $('pg-pantry-side-inner');
    if (!box) return;
    const useFirst = [...foods].filter(f => f.expiry).sort((a, b) => new Date(a.expiry) - new Date(b.expiry)).slice(0, 4);
    const locs = ['fridge', 'freezer', 'pantry'];
    const totalN = foods.length || 1;
    const value = sum(foods);
    const cats = {};
    foods.forEach(f => { const k = f.category || 'other'; cats[k] = (cats[k] || 0) + 1; });

    box.innerHTML =
      card('Use these first', useFirst.length
        ? `<ul class="pg-mini">${useFirst.map(f => { const b = badgeInfo(daysLeft(f.expiry)); return `<li><span class="pg-emo">${esc(f.emoji || '🍽️')}</span><span class="pg-grow">${esc(f.name)}</span><span class="badge ${b.cls}">${b.text}</span></li>`; }).join('')}</ul>`
        : '<p class="pg-muted">Nothing stored yet. Add your first ingredient and it shows up here.</p>', 'tint-yellow') +
      card('Where it is stored', locs.map(l => {
        const n = foods.filter(f => f.location === l).length;
        return `<div class="pg-loc-row"><span>${LOC_ICON[l]}</span><span>${LOC_LABEL[l]}</span><b>${n}</b><div class="pg-bar"><i style="width:${Math.round(n / totalN * 100)}%"></i></div></div>`;
      }).join('')) +
      card('Stock value', `<div class="pg-kpi-num">${fmtRM(value)}</div><p class="pg-muted">Total price of what is in your kitchen right now.</p>` +
        (Object.keys(cats).length ? `<div class="pg-cats">${Object.entries(cats).map(([k, n]) => `<span class="pg-tag">${CAT_ICON[k] || '📦'} ${CAT_LABEL[k] || k} ${n}</span>`).join('')}</div>` : '')) +
      card('Tip of the day', `<p class="pg-tip">${TIPS[new Date().getDate() % TIPS.length]}</p>`, 'tint-green');
    refreshChips();
  }

  function refreshChips() {
    const box = $('pantry-chips');
    if (!box) return;
    const opts = [['all', 'All'], ['fridge', 'Fridge'], ['freezer', 'Freezer'], ['pantry', 'Pantry']];
    box.innerHTML = opts.map(([k, l]) => {
      const n = k === 'all' ? foods.length : foods.filter(f => f.location === k).length;
      return `<button class="pg-chip ${filter === k ? 'on' : ''}" onclick="pgLoc('${k}')">${k === 'all' ? '' : LOC_ICON[k] + ' '}${l} <b>${n}</b></button>`;
    }).join('');
  }
  window.pgLoc = k => { handleLocationFilter(k); const s = $('loc-filter'); if (s) s.value = k; refreshChips(); };

  // ═════════ Shopping ═════════
  const STAPLES = ['Eggs', 'Milk', 'Rice', 'Onions', 'Bread', 'Chicken', 'Tomatoes', 'Cooking oil', 'Bananas', 'Spinach'];
  window.pgAddShop = n => { shopItems.push({ name: n, checked: false }); saveShopItems(); renderShopList(); };

  function refreshShop() {
    const strip = $('pg-strip-shopping'), box = $('pg-shop-side-inner');
    if (!strip || !box) return;
    const done = shopItems.filter(x => x.checked).length;
    const left = shopItems.length - done;
    const pct = shopItems.length ? Math.round(done / shopItems.length * 100) : 0;
    strip.innerHTML = kpi(left, 'Still to buy') + kpi(done, 'In the basket') +
      `<div class="pg-kpi wide"><span class="pg-kpi-lbl">Basket progress: ${pct}%</span><div class="pg-bar big"><i style="width:${pct}%"></i></div></div>`;

    const have = shopItems.filter(x => !x.checked)
      .map(x => ({ x, f: foods.find(f => (f.name || '').trim().toLowerCase() === x.name.trim().toLowerCase()) }))
      .filter(o => o.f);
    const has = n => shopItems.some(x => x.name.trim().toLowerCase() === n.toLowerCase());
    const wasted = {};
    wasteLog.forEach(w => { const k = (w.name || '').trim(); if (k) wasted[k] = (wasted[k] || 0) + 1; });
    const topWasted = Object.entries(wasted).sort((a, b) => b[1] - a[1]).slice(0, 3);

    box.innerHTML =
      card('Already in your pantry', have.length
        ? have.map(o => `<div class="pg-have">${esc(o.x.name)}: you have ${esc(o.f.qty || 'some')} with ${Math.max(daysLeft(o.f.expiry), 0)} days left.</div>`).join('')
        : '<p class="pg-muted">Nothing on your list is already in stock. Good.</p>', have.length ? 'tint-yellow' : '') +
      card('Quick add', `<div class="pg-chips">${STAPLES.filter(s => !has(s)).map(s => `<button class="pg-chip" onclick="pgAddShop('${s}')">+ ${s}</button>`).join('') || '<span class="pg-muted">All staples are on your list.</span>'}</div>`) +
      card('Buy a bit less of', topWasted.length
        ? `<ul class="pg-mini">${topWasted.map(([n, c]) => `<li><span class="pg-grow">${esc(n)}</span><small>wasted ${c}x</small></li>`).join('')}</ul>`
        : '<p class="pg-muted">No waste logged yet, so nothing to cut back on.</p>', 'tint-blue');
  }

  // ═════════ Waste ═════════
  function refreshWaste() {
    const strip = $('pg-strip-waste'), box = $('pg-waste-side-inner'), list = $('waste-list-container');
    if (!strip || !box || !list) return;
    const mk = today().slice(0, 7);
    const month = wasteLog.filter(w => w.date && w.date.startsWith(mk));
    const names = {};
    wasteLog.forEach(w => { const k = (w.name || '').trim(); if (!k) return; names[k] = names[k] || { n: k, c: 0, rm: 0, emoji: w.emoji }; names[k].c++; names[k].rm += Number(w.price) || 0; });
    const top = Object.values(names).sort((a, b) => b.c - a.c || b.rm - a.rm);

    strip.innerHTML = kpi(fmtRM(sum(month)), 'Wasted this month') + kpi(month.length, 'Items this month') +
      kpi(fmtRM(sum(wasteLog)), 'Total value wasted') + kpi(top[0] ? esc(top[0].n) : '–', 'Most wasted item');

    // 按月份分组的列表
    if (wasteLog.length) {
      const groups = {};
      wasteLog.forEach(w => { const k = (w.date || '').slice(0, 7) || 'unknown'; (groups[k] = groups[k] || []).push(w); });
      list.innerHTML = Object.keys(groups).sort().reverse().map(k => {
        const items = groups[k];
        const label = k === 'unknown' ? 'No date' : new Date(k + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        return `<div class="pg-month-h"><h3>${label}<small>${items.length} item${items.length > 1 ? 's' : ''}</small></h3><span>${fmtRM(sum(items))}</span></div>` +
          items.map(w => `<div class="waste-item"><span class="waste-emoji">${esc(w.emoji || '🍽️')}</span><span class="waste-name">${esc(w.name)}</span>${w.price ? `<span class="waste-price">${fmtRM(w.price)}</span>` : ''}<span class="waste-item-date">${w.date ? fmtDateFull(w.date) : ''}</span></div>`).join('');
      }).join('');
    }

    // 近 6 个月柱状图
    const now = new Date(), cols = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      cols.push({ key, label: d.toLocaleDateString('en-GB', { month: 'short' }), rm: sum(wasteLog.filter(w => w.date && w.date.startsWith(key))), now: i === 0 });
    }
    const max = Math.max(...cols.map(c => c.rm), 1);

    box.innerHTML =
      card('Last 6 months', `<div class="pg-cols">${cols.map(c => `<div class="pg-col ${c.now ? 'now' : ''}">${c.rm ? `<b>${Math.round(c.rm)}</b>` : ''}<i style="height:${c.rm ? Math.max(c.rm / max * 100, 4) : 2}%"></i>${c.label}</div>`).join('')}</div><p class="pg-muted">Value of food wasted per month, in RM.</p>`) +
      card('Most wasted foods', top.length
        ? `<ul class="pg-mini">${top.slice(0, 5).map(t => `<li><span class="pg-emo">${esc(t.emoji || '🍽️')}</span><span class="pg-grow">${esc(t.n)}<br><small>${t.c}x logged</small></span><b>${fmtRM(t.rm)}</b></li>`).join('')}</ul>`
        : '<p class="pg-muted">Nothing logged. Keep it up.</p>', 'tint-yellow') +
      card('Waste less next month', '<p class="pg-muted">Most waste comes from buying too much and forgetting what is at the back of the fridge.</p><button class="pg-btn line" onclick="switchView(\'awareness\')">Read the 5R guide</button>', 'tint-green');
  }

  // ═════════ Recipes ═════════
  const STYLES = [
    { l: 'Surprise me', p: '' },
    { l: '🇲🇾 Malaysian', p: 'Prefer Malaysian home-style dishes.' },
    { l: '⏱ Under 20 min', p: 'Each recipe must take 20 minutes or less.' },
    { l: '🥗 Light and healthy', p: 'Keep the dishes light and healthy.' },
    { l: '🧒 Kid-friendly', p: 'Make the dishes mild and kid-friendly.' }
  ];
  let styleIdx = 0;
  window.pgStyle = i => { styleIdx = i; refreshStyles(); };
  function refreshStyles() {
    const box = $('recipe-styles');
    if (box) box.innerHTML = STYLES.map((s, i) => `<button class="pg-chip blue ${i === styleIdx ? 'on' : ''}" onclick="pgStyle(${i})">${s.l}</button>`).join('');
  }
  // 把「风格」附加到 AI 提示词里（只影响食谱请求，不影响收据扫描）
  try {
    if (window.puter && puter.ai && !puter.ai.__fkPatched) {
      const orig = puter.ai.chat.bind(puter.ai);
      puter.ai.chat = function (prompt, ...rest) {
        const extra = STYLES[styleIdx].p;
        if (typeof prompt === 'string' && extra && prompt.includes('zero-waste menu')) prompt += '\nExtra preference: ' + extra;
        return orig(prompt, ...rest);
      };
      puter.ai.__fkPatched = true;
    }
  } catch (e) { console.warn('Recipe style patch skipped', e); }

  function refreshRecipes() {
    const strip = $('pg-strip-recipes'), box = $('pg-recipes-side-inner');
    if (!strip || !box) return;
    const soon = foods.filter(f => f.expiry && daysLeft(f.expiry) <= 7);
    const pool = (soon.length ? soon : foods).slice().sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    strip.innerHTML = kpi(soon.length, 'Expiring in 7 days') + kpi(foods.length, 'Ingredients in pantry') +
      kpi(foods.filter(f => daysLeft(f.expiry) < 0).length, 'Already expired');
    box.innerHTML =
      card(soon.length ? 'On the menu first' : 'Your ingredients',
        pool.length
          ? `<ul class="pg-mini">${pool.slice(0, 8).map(f => `<li><span class="pg-emo">${esc(f.emoji || '🍽️')}</span><span class="pg-grow">${esc(f.name)}${f.qty ? `<br><small>${esc(f.qty)}</small>` : ''}</span><small>${LOC_LABEL[f.location] || ''}</small></li>`).join('')}</ul>${pool.length > 8 ? `<p class="pg-muted">and ${pool.length - 8} more</p>` : ''}`
          : '<p class="pg-muted">Add a few ingredients in the pantry first. The AI plans around what you have.</p>', 'tint-blue') +
      card('Zero-waste kitchen habits', `<ul class="pg-mini">
        <li><span class="pg-emo">🍲</span><span class="pg-grow">Soft vegetables become soup</span></li>
        <li><span class="pg-emo">🍚</span><span class="pg-grow">Day-old rice makes the best fried rice</span></li>
        <li><span class="pg-emo">🥶</span><span class="pg-grow">Freeze leftovers within two days</span></li></ul>`);
  }

  // ═════════ Leaderboard（整页重写）═════════
  window.renderLeaderboard = function () {
    if (!currentUser) return;
    const c = $('leaderboard-container'), strip = $('pg-strip-leaderboard'), box = $('pg-lb-side-inner');
    if (!c || !strip || !box) return;

    const now = new Date(), year = now.getFullYear();
    let cw = getWeekNumber(now);
    if (now.getMonth() === 0 && cw > 50) cw = 1;
    if (now.getMonth() === 11 && cw === 1) cw = 52;
    cw = Math.min(cw, 52);

    const wk = {};
    wasteLog.forEach(w => {
      if (!w.date) return;
      const d = new Date(w.date);
      if (d.getFullYear() !== year) return;
      const n = getWeekNumber(d);
      wk[n] = (wk[n] || 0) + (Number(w.price) || 0);
    });
    const ranked = Object.entries(wk).map(([n, a]) => ({ n: +n, a })).sort((x, y) => y.a - x.a).slice(0, 10);
    const max = ranked[0] ? ranked[0].a : 0;
    const total = Object.values(wk).reduce((s, v) => s + v, 0);
    let clean = 0, streak = 0, streakOpen = true;
    for (let n = cw; n >= 1; n--) {
      if (!wk[n]) { clean++; if (streakOpen) streak++; } else streakOpen = false;
    }
    const thisW = wk[cw] || 0, lastW = wk[cw - 1] || 0;

    strip.innerHTML = kpi(fmtRM(total), `Wasted in ${year}`) + kpi(max ? fmtRM(max) : 'RM 0.00', max ? `Heaviest week (week ${ranked[0].n})` : 'Heaviest week') +
      kpi(clean, 'Weeks with no waste') + kpi(streak, 'Current clean streak');

    // 一年 52 周的色块
    const cells = [];
    for (let n = 1; n <= 52; n++) {
      const a = wk[n] || 0;
      let cls = '';
      if (n > cw) cls = 'fut';
      else if (a > 0) { const r = a / max; cls = r <= .25 ? 'l1' : r <= .5 ? 'l2' : r <= .75 ? 'l3' : 'l4'; }
      cells.push(`<div class="pg-cell ${cls}" title="Week ${n}${n <= cw ? ': ' + fmtRM(a) : ''}"></div>`);
    }
    const heat = card(`Your ${year}, week by week`, `<div class="pg-heat">${cells.join('')}</div>
      <div class="pg-legend">Clean <span class="pg-cell"></span><span class="pg-cell l1"></span><span class="pg-cell l2"></span><span class="pg-cell l3"></span><span class="pg-cell l4"></span> Heavy</div>`);

    const rank = ranked.length
      ? card('Your 10 heaviest weeks', `<ol class="lb-list2">${ranked.map((r, i) => `<li><span class="lb-n">${i + 1}</span><div><div class="lb-top"><b>Week ${r.n}</b><span>${fmtRM(r.a)}</span></div><div class="pg-bar warn"><i style="width:${Math.round(r.a / max * 100)}%"></i></div></div></li>`).join('')}</ol>`)
      : `<div class="empty"><div class="empty-icon">🌱</div><p>No waste logged this year. Log items in the Waste Log and your weeks show up here.</p></div>`;
    c.innerHTML = heat + rank;

    let delta;
    if (!thisW && !lastW) delta = '<p class="pg-delta good">Nothing wasted this week or last week. Keep it going.</p>';
    else if (thisW <= lastW) delta = `<p class="pg-delta good">This week is ${fmtRM(lastW - thisW)} lower than last week.</p>`;
    else delta = `<p class="pg-delta bad">This week is ${fmtRM(thisW - lastW)} higher than last week.</p>`;

    const badge = (on, ico, txt) => `<div class="pg-badge ${on ? 'on' : ''}"><i>${ico}</i>${txt}</div>`;
    box.innerHTML =
      card('This week', `<div class="pg-kpi-num">${fmtRM(thisW)}</div>${delta}`, 'tint-yellow') +
      card('Clean streak', `<div class="pg-flame">${streak}<small>week${streak === 1 ? '' : 's'} in a row</small></div><p class="pg-muted">Weeks in a row with nothing logged as waste.</p>`) +
      card('Badges', `<div class="pg-badges">${badge(clean >= 1, '🌱', 'First clean week')}${badge(streak >= 4, '🔥', '4-week clean streak')}${badge(streak >= 8, '🏅', '8-week clean streak')}${badge(thisW === 0 && lastW > 0, '💚', 'Beat last week')}</div>`, 'tint-green');
  };

  // ═════════ Quiz ═════════
  const FACTS = [
    'Methane from rotting food is about 80 times more potent than CO₂ over 20 years.',
    'Malaysia throws away more than 17,000 tonnes of food every single day.',
    'A third of all food produced for people is lost or wasted worldwide.',
    'The average Malaysian household wastes around RM624 of food a year.',
    'FIFO means first in, first out. Older food goes to the front.'
  ];
  let quizStarted = false;

  window.startQuiz = function () {
    quizStarted = true; quizCurrent = 0; quizScore = 0; quizAnswered = false;
    renderQuiz();
  };

  function wrapQuiz() {
    const _render = window.renderQuiz, _restart = window.restartQuiz;
    window.renderQuiz = function () {
      const c = $('quiz-container'), strip = $('pg-strip-quiz');
      if (!c) return;
      const best = settings.quizBest || 0, n = QUIZ_QUESTIONS.length;
      if (strip) strip.innerHTML = kpi(`${best} / ${n}`, 'Your best score') + kpi(n, 'Questions') + kpi('5R', 'Framework covered');
      const fact = $('qz-fact');
      if (fact) fact.textContent = FACTS[Math.floor(Math.random() * FACTS.length)];
      if (!quizStarted && quizCurrent === 0) {
        c.innerHTML = `<div class="qz-intro">
          <div class="qz-ring" style="--p:${Math.round(best / n * 100)}"><span>${best}<small>of ${n}</small></span></div>
          <h3>${best ? 'Can you beat your best?' : 'Ready for your first round?'}</h3>
          <p>Each question has one right answer. You see it straight after you pick, so you learn as you go.</p>
          <button class="pg-btn solid" onclick="startQuiz()">Start quiz</button>
        </div>`;
        return;
      }
      _render();
    };
    window.restartQuiz = function () { quizStarted = true; _restart(); };
  }

  // ═════════ 钩子：数据变化时刷新 ═════════
  function refreshAll() {
    try { refreshPantry(); refreshShop(); refreshWaste(); refreshRecipes(); } catch (e) { console.error('pages.js refresh failed', e); }
  }
  function hook(name, after) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (...a) {
      const r = orig.apply(this, a);
      try { after(...a); } catch (e) { console.error('pages.js hook ' + name, e); }
      return r;
    };
  }

  init();
  wrapQuiz();
  refreshStyles();
  hook('render', refreshAll);
  hook('renderWasteLog', refreshAll);
  hook('renderShopList', refreshAll);

  // 进入测验页时，如果上一轮已经做完，回到开始画面
  const _switch = window.switchView;
  window.switchView = function (v) {
    if (v === 'quiz' && quizCurrent >= QUIZ_QUESTIONS.length) { quizStarted = false; quizCurrent = 0; quizScore = 0; quizAnswered = false; }
    _switch(v);
    refreshAll();
  };
})();


// ═════════ Awareness（单独的一段，接在 pages.js 最后）═════════
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmtRM = n => 'RM ' + (Number(n) || 0).toFixed(2);
  const kpi = (v, l) => `<div class="pg-kpi"><span class="pg-kpi-num">${v}</span><span class="pg-kpi-lbl">${l}</span></div>`;
  const card = (t, b, tint = '') => `<section class="pg-card ${tint}"><h4>${t}</h4>${b}</section>`;

  const view = $('view-awareness');
  if (!view || view.dataset.pg) return;
  view.dataset.pg = '1';
  view.classList.add('pg-view', 'pg-awareness');

  const main = document.createElement('div');
  main.className = 'pg-main';
  Array.from(view.children).forEach(k => main.appendChild(k));
  const body = document.createElement('div');
  body.className = 'pg-body';
  body.appendChild(main);
  const side = document.createElement('aside');
  side.className = 'pg-side';
  body.appendChild(side);

  // ── 线条图标（代替 emoji）──
  const svg = (d, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const P = {
    coin: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.3c-.6-.8-1.6-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1 0-2-.5-2.6-1.3M12 5.5V8M12 16v2.5"/>',
    therm: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
    land: '<path d="M2.5 20 9 9l4.5 7L16 12l5.5 8z"/><path d="M2.5 20h19"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 15a2.8 2.8 0 0 0 2.5 2.5"/>',
    bowl: '<path d="M3 12h18a9 9 0 0 1-18 0z"/><path d="M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 15c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
    refuse: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    reduce: '<path d="M3.5 7l6 6 4-4 7 7"/><path d="M20.5 11v5h-5"/>',
    recycle: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    repair: '<rect x="6" y="8" width="12" height="13" rx="3"/><path d="M8 8V4.5h8V8M6 13h12"/>',
    think: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };
  const tile = (k, c, s = 24) => `<span class="aw-tile ${c}">${svg(P[k], s)}</span>`;

  view.insertAdjacentHTML('beforeend', `
    <header class="pg-hero tone-yellow">
      <div>
        <h2>One third of the world's food is wasted.</h2>
        <p>The problem is big, but most of it starts in ordinary kitchens. That is also where it is easiest to fix.</p>
        <div class="pg-actions">
          <button class="pg-btn yellow" onclick="switchView('pantry')">Open my pantry</button>
          <button class="pg-btn line" onclick="switchView('quiz')">Take the quiz</button>
        </div>
      </div>
      <div class="pg-art" aria-hidden="true"><svg viewBox="0 0 160 110" fill="none" stroke="var(--tone)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="80" cy="56" r="40"/><path d="M40 56h80M80 16c-16 18-16 62 0 80M80 16c16 18 16 62 0 80"/><path d="M118 20c0-10 8-14 18-14 0 10-6 16-18 14z" stroke="#4C91D8"/></svg></div>
    </header>
    <section class="pg-strip">
      ${kpi('1/3', 'of food produced is wasted every year')}
      ${kpi('17,000+', 'tonnes wasted in Malaysia daily')}
      ${kpi('RM624', 'wasted per Malaysian household a year')}
      ${kpi('8–10%', 'of global greenhouse gases')}
    </section>`);
  view.appendChild(body);

  const R = [
    { k: 'Refuse', s: 'Say no to extras', i: 'refuse', c: 'c-r', h: 'Say no to what you do not need', p: 'Skip impulse buys and promo bundles that lead to overbuying. Look in your pantry before you shop.', tip: 'Never shop when hungry. You will buy more than you need.', go: ['shopping', 'Open shopping list'] },
    { k: 'Reduce', s: 'Buy and cook less', i: 'reduce', c: 'c-y', h: 'Buy less, waste less', p: 'Buy only what you will eat, cook smaller portions, watch expiry dates and plan your meals for the week.', tip: 'A shopping list stops over-buying. Food Keeper has one built in.', go: ['shopping', 'Plan a shopping list'] },
    { k: 'Recycle', s: 'Give scraps a new life', i: 'recycle', c: 'c-g', h: 'Give scraps a second life', p: 'Compost food scraps, reuse packaging, and turn peels and bones into stock instead of binning them.', tip: 'Composting scraps cuts the methane that landfills produce.', go: ['recipes', 'Get a zero-waste menu'] },
    { k: 'Repair', s: 'Make food last', i: 'repair', c: 'c-b', h: 'Make food last longer', p: 'Store food properly, freeze it, pickle it or ferment it. Wilted vegetables often revive in cold water.', tip: 'Move items that expire soon to the front of the fridge.', go: ['pantry', 'Check my pantry'] },
    { k: 'Reconsider', s: 'Pause before you buy', i: 'think', c: 'c-n', h: 'Think before you act', p: 'Is that second pack really needed? Is the deal worth it if half of it gets thrown away?', tip: 'Ask yourself: will I actually eat this before it expires?', go: ['waste', 'Review my waste log'] }
  ];
  let ri = 0;
  window.pgR = i => { ri = i; window.renderAwareness(); };

  window.renderAwareness = function () {
    const c = $('awareness-container');
    if (!c) return;
    const r = R[ri];

    c.innerHTML = `
    <section class="aw-sec">
      <div class="aw-head"><h3>Why it matters</h3><p>Six reasons a full bin is worth caring about.</p></div>
      <div class="aw-bento">
        <article class="aw-card c-b feat">
          <div class="aw-card-top">${tile('therm', 'c-b')}<h4>It heats the planet</h4></div>
          <p>Food rotting in landfill releases methane, a greenhouse gas about 80 times stronger than CO₂ over 20 years.</p>
          <div class="aw-vs">
            <div><span>CO₂</span><div class="pg-bar"><i style="width:1.25%"></i></div><b>1×</b></div>
            <div><span>Methane</span><div class="pg-bar warn"><i style="width:100%"></i></div><b>80×</b></div>
          </div>
        </article>
        <article class="aw-card c-y">
          <div class="aw-card-top">${tile('coin', 'c-y')}<h4>It costs you money</h4></div>
          <p>Families pay for food that is never eaten. Over a lifetime that adds up to tens of thousands of ringgit.</p>
        </article>
        <article class="aw-card c-g">
          <div class="aw-card-top">${tile('land', 'c-g')}<h4>It fills our landfills</h4></div>
          <p>Food is one of the biggest parts of Malaysia's solid waste. Landfills pollute soil and groundwater and take up land.</p>
        </article>
        <article class="aw-card c-b">
          <div class="aw-card-top">${tile('drop', 'c-b')}<h4>It wastes resources</h4></div>
          <p>Every discarded item also wastes the water, energy and land used to grow, move and store it.</p>
        </article>
        <article class="aw-card c-y">
          <div class="aw-card-top">${tile('bowl', 'c-y')}<h4>It sits next to hunger</h4></div>
          <p>Millions of people go hungry while food is thrown away. Cutting household waste is also about fairness.</p>
        </article>
        <article class="aw-card c-g wide">
          ${tile('sprout', 'c-g', 28)}
          <div><h4>It shapes the next generation</h4><p>Children who grow up in waste-aware homes keep those habits for life. Every small change you make at home is one they copy.</p></div>
        </article>
      </div>
    </section>

    <section class="aw-sec">
      <div class="aw-head"><h3>The 5R framework</h3><p>Pick one to see what it means and where to do it in Food Keeper.</p></div>
      <div class="aw-r5">
        <div class="aw-r5-list" role="group" aria-label="5R steps">
          ${R.map((x, i) => `<button class="aw-r5-item ${x.c} ${i === ri ? 'on' : ''}" onclick="pgR(${i})" aria-pressed="${i === ri}">${tile(x.i, x.c, 20)}<span><b>${x.k}</b><small>${x.s}</small></span></button>`).join('')}
        </div>
        <article class="aw-r5-panel ${r.c}">
          ${tile(r.i, r.c, 34).replace('aw-tile', 'aw-tile big')}
          <div class="aw-r5-body">
            <h3>${r.h}</h3>
            <p>${r.p}</p>
            <div class="aw-tip">${svg(P.bulb, 20)}<span>${r.tip}</span></div>
            <button class="pg-btn solid" onclick="switchView('${r.go[0]}')">${r.go[1]}</button>
          </div>
        </article>
      </div>
    </section>`;

    // 右侧：你自己的数字 vs 马来西亚平均
    const year = new Date().getFullYear(), mk = today().slice(0, 7);
    const yr = wasteLog.filter(w => w.date && w.date.startsWith(String(year))).reduce((s, w) => s + (Number(w.price) || 0), 0);
    const mo = wasteLog.filter(w => w.date && w.date.startsWith(mk)).reduce((s, w) => s + (Number(w.price) || 0), 0);
    const avgMonth = 624 / 12;
    const pct = Math.min(Math.round(mo / avgMonth * 100), 100);
    const verdict = !wasteLog.length
      ? 'Log what you throw away and your own numbers appear here.'
      : mo <= avgMonth ? `You are ${fmtRM(avgMonth - mo)} under the average household this month.` : `You are ${fmtRM(mo - avgMonth)} over the average household this month.`;
    const go = (ico, txt, v) => `<li><button class="aw-go" onclick="switchView('${v}')">${ic(ico, 20)}<span>${txt}</span>${svg(P.arrow, 16)}</button></li>`;
    side.innerHTML =
      card('You vs the average household', `<div class="pg-kpi-num">${fmtRM(mo)}</div>
        <div class="pg-row"><div class="pg-row-top"><span>This month</span><b>average ${fmtRM(avgMonth)}</b></div><div class="pg-bar ${mo > avgMonth ? 'warn' : ''}"><i style="width:${pct}%"></i></div></div>
        <p class="pg-muted">${verdict}</p><p class="pg-muted">Wasted so far in ${year}: <b>${fmtRM(yr)}</b></p>`, 'tint-yellow') +
      card('Start small', `<ul class="aw-gos">${go('pantry', 'Add what is in your fridge', 'pantry')}${go('receipt', 'Scan your next receipt', 'receipt')}${go('quiz', 'Test what you learned', 'quiz')}</ul>`, 'tint-green');
  };

  window.renderAwareness();
})();
