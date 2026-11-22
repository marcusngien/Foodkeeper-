// purchases.js — 放在 pages.js 后面加载（app.js → home.js → pages.js → purchases.js）
// Purchase History、Monthly Spending、收据扫描的「检查并确认」流程，以及 Purchases ↔ Pantry 的双向连接：
//   · 每一件加入 pantry 的食物都带 purchaseId + purchaseItemId（来源购买记录）
//   · Purchases 页面每一行显示它现在的状态：未加入 / In pantry / Wasted / Used up，并能一键加入 pantry
//   · Pantry 卡片显示「🧾 店名 · 日期」，点一下跳到那张购买记录
//   · 浪费记录带着来源链接，Spending 页面对比「花了多少 vs 浪费多少」
// app.js 只改了两处：addWasteEntry（带来源链接）和 foodCardHTML（显示来源标签）。
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const RM = n => 'RM ' + (Number(n) || 0).toFixed(2);
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const r2 = n => Math.round(n * 100) / 100;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseYMD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const validYMD = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && ymd(parseYMD(s)) === s;
  const newId = () => 'pc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const CATS = ['produce', 'dairy', 'meat', 'grain', 'other'];
  const monthsBetween = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am) + 1; };
  const monthLabel = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const catOpts = sel => CATS.map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${CAT_LABEL[c]}</option>`).join('');
  const locOpts = sel => ['fridge', 'freezer', 'pantry'].map(l => `<option value="${l}" ${l === sel ? 'selected' : ''}>${LOC_LABEL[l]}</option>`).join('');
  const kpi = (v, l) => `<div class="pg-kpi"><span class="pg-kpi-num">${v}</span><span class="pg-kpi-lbl">${l}</span></div>`;
  const card = (t, b, tint = '') => `<section class="pg-card ${tint}"><h4>${t}</h4>${b}</section>`;

  // 购买记录里每一行商品的稳定 ID（pantry 靠它回头找到来源）
  const newItemId = () => 'pi_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // Firestore 不接受 undefined，所以统一用这个函数整理商品行
  const cleanItem = i => ({ id: i.id || newItemId(), name: i.name, qty: i.qty, price: i.price, category: i.category, emoji: i.emoji || '', inPantry: !!i.inPantry });
  // 加入 pantry 时的默认存放位置和保质天数（可在弹窗里改）
  const LOC_BY_CAT = { produce: 'fridge', dairy: 'fridge', meat: 'fridge', grain: 'pantry', other: 'pantry' };
  const SHELF_DAYS = {
    fridge:  { produce: 7,  dairy: 7,  meat: 3,  grain: 14,  other: 7 },
    freezer: { produce: 90, dairy: 60, meat: 90, grain: 90,  other: 90 },
    pantry:  { produce: 5,  dairy: 30, meat: 30, grain: 180, other: 90 }
  };
  const expiryFor = (loc, cat) => { const d = new Date(); d.setDate(d.getDate() + ((SHELF_DAYS[loc] || SHELF_DAYS.pantry)[cat] ?? 7)); return ymd(d); };
  const _render = window.render, _renderWaste = window.renderWasteLog;   // 原来的 pantry / waste 渲染函数（文件末尾会包装）

  // ═════════ 1. 把新页面注册进现有框架 ═════════
  const T_PURCHASES = { en: '🧾 Purchases', ms: '🧾 Pembelian', zh: '🧾 购买记录' };
  const T_SPENDING = { en: '📊 Spending', ms: '📊 Perbelanjaan', zh: '📊 消费分析' };
  ['en', 'ms', 'zh'].forEach(l => { TRANSLATIONS[l].purchases = T_PURCHASES[l]; TRANSLATIONS[l].spending = T_SPENDING[l]; });
  ALL_VIEWS.push('purchases', 'spending');
  MENUS.pantry.push({ view: 'purchases', icon: '🧾' }, { view: 'spending', icon: '📊' });
  IC.purchases = '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>';
  IC.spending = '<path d="M4 20V10M10 20V4M16 20v-7M2 20h20"/>';
  NAV_MAIN.splice(NAV_MAIN.indexOf('receipt') + 1, 0, 'purchases', 'spending');

  const host = $('main-pantry');
  host.insertAdjacentHTML('beforeend', `
    <section id="view-purchases" class="view-section pg-view pg-purchases" style="display:none">
      <header class="pg-hero tone-green">
        <div>
          <h2>Every shop, on record.</h2>
          <p>Your purchases stay here even after the food is eaten, deleted or thrown away. Add past shops with their real date.</p>
          <div class="pg-actions">
            <button class="pg-btn solid" onclick="pcOpen()">Add purchase</button>
            <button class="pg-btn line" onclick="pcExport()">Export CSV</button>
          </div>
        </div>
        <div class="pg-art" aria-hidden="true"><svg viewBox="0 0 160 110" fill="none" stroke="var(--tone)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M40 12h80v86l-10-7-10 7-10-7-10 7-10-7-10 7-10-7-10 7z"/><path d="M56 36h48M56 52h48M56 68h28"/><path d="M96 68h8" stroke="#F4D84A" stroke-width="4"/></svg></div>
      </header>
      <section class="pg-strip" id="pc-strip"></section>
      <div class="pg-body">
        <div class="pg-main">
          <div class="toolbar" id="pc-filters">
            <input type="text" id="pc-q" class="search-bar" placeholder="Search store or item..." oninput="pcFilter()" />
            <select id="pc-year" class="filter-dropdown" onchange="pcFilter()"><option value="">All years</option></select>
            <select id="pc-month" class="filter-dropdown" onchange="pcFilter()">
              <option value="">All months</option>
              ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => `<option value="${pad(i + 1)}">${m}</option>`).join('')}
            </select>
            <input type="date" id="pc-from" class="filter-dropdown" title="From date" onchange="pcFilter()" />
            <input type="date" id="pc-to" class="filter-dropdown" title="To date" onchange="pcFilter()" />
            <button class="action-btn secondary" onclick="pcClearFilters()">Clear</button>
          </div>
          <div id="pc-list"></div>
        </div>
        <aside class="pg-side" id="pc-side"></aside>
      </div>
    </section>

    <section id="view-spending" class="view-section pg-view pg-spending" style="display:none">
      <header class="pg-hero tone-blue">
        <div>
          <h2>Where your grocery money goes.</h2>
          <p>Every number here is added up from your saved purchases. Nothing is estimated.</p>
        </div>
        <div class="pg-art" aria-hidden="true"><svg viewBox="0 0 160 110" fill="none" stroke="var(--tone)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 98h120"/><rect x="28" y="62" width="26" height="36" rx="3"/><rect x="66" y="34" width="26" height="64" rx="3"/><rect x="104" y="48" width="26" height="50" rx="3"/><path d="M30 40l30-16 28 10 40-24" stroke="#F4D84A" stroke-width="3.4"/></svg></div>
      </header>
      <div class="pg-chips" id="sp-chips"></div>
      <div class="sp-custom" id="sp-custom" style="display:none">
        <label>From <input type="date" id="sp-from" class="filter-dropdown" onchange="spCustom()" /></label>
        <label>To <input type="date" id="sp-to" class="filter-dropdown" onchange="spCustom()" /></label>
      </div>
      <section class="pg-strip" id="sp-strip"></section>
      <div class="pg-body">
        <div class="pg-main" id="sp-main"></div>
        <aside class="pg-side" id="sp-side"></aside>
      </div>
    </section>`);

  // 弹窗：新增 / 编辑购买记录（沿用现有的 .overlay / .modal 样式）
  $('app').insertAdjacentHTML('beforeend', `
    <div class="overlay" id="pc-overlay" onclick="pcClose()">
      <div class="modal pc-modal" onclick="event.stopPropagation()">
        <div class="modal-header"><h2 id="pcm-title">Add purchase</h2><button class="modal-close" onclick="pcClose()">✕</button></div>
        <div class="modal-body">
          <div class="pcm-grid">
            <div class="form-field"><label class="form-label">Purchase date</label><input class="form-input" type="date" id="pcm-date" /></div>
            <div class="form-field"><label class="form-label">Store (optional)</label><input class="form-input" type="text" id="pcm-retailer" placeholder="e.g. Giant, 99 Speedmart" /></div>
            <div class="form-field"><label class="form-label">Receipt reference (optional)</label><input class="form-input" type="text" id="pcm-ref" placeholder="e.g. receipt number" /></div>
          </div>
          <div class="form-label" style="margin-top:6px">Items &nbsp;<span class="pg-muted">Price is the amount paid for that line, in RM.</span></div>
          <div class="pcm-row pcm-head"><span>Item</span><span>Qty</span><span>Price</span><span>Category</span><span></span></div>
          <div id="pcm-items"></div>
          <button class="ghost-btn" type="button" onclick="pcAddRow()" style="margin-top:8px">+ Add item</button>
          <div class="pcm-total">Total <b id="pcm-total">RM 0.00</b></div>
          <label class="pcm-pantry" id="pcm-pantry-wrap"><input type="checkbox" id="pcm-pantry" /> <span>Also add these items to my pantry <small class="pg-muted">(you choose storage and expiry next)</small></span></label>
          <div class="auth-error" id="pcm-error"></div>
          <button class="btn-primary" id="pcm-save" onclick="pcSave()" style="background:var(--accent);color:#fff">Save purchase</button>
        </div>
      </div>
    </div>`);

  // 弹窗：把购买记录里的商品加入 pantry（选存放位置和过期日）
  $('app').insertAdjacentHTML('beforeend', `
    <div class="overlay" id="pp-overlay" onclick="ppClose()">
      <div class="modal pc-modal" onclick="event.stopPropagation()">
        <div class="modal-header"><h2>Add to pantry</h2><button class="modal-close" onclick="ppClose()">✕</button></div>
        <div class="modal-body">
          <p class="pg-muted" id="pp-sub"></p>
          <div class="pp-row pp-head"><span></span><span>Item</span><span>Qty</span><span>Storage</span><span>Expires</span></div>
          <div id="pp-rows"></div>
          <div class="auth-error" id="pp-error"></div>
          <button class="btn-primary" id="pp-save" onclick="ppSave()" style="background:var(--accent);color:#fff">Add to pantry</button>
        </div>
      </div>
    </div>`);

  // ═════════ 2. 数据：users/{uid}/purchases ═════════
  let purchases = [];
  let unsub = null;
  let loadError = false;
  const open = new Set();
  let editingId = null, draftId = null, saving = false;

  const col = () => userRef().collection('purchases');

  auth.onAuthStateChanged(user => {
    if (unsub) { unsub(); unsub = null; }
    purchases = []; loadError = false; open.clear();
    if (user) {
      unsub = db.collection('users').doc(user.uid).collection('purchases').orderBy('date', 'desc')
        .onSnapshot(snap => { purchases = snap.docs.map(d => ({ id: d.id, ...d.data() })); loadError = false; renderAll(); if (_render) _render(); },
          err => { console.error('purchases listener', err); loadError = true; renderAll(); });
    }
    renderAll();
  });

  function toDoc(f) {
    const items = f.items.map(cleanItem);
    return {
      date: f.date, retailer: f.retailer || '', receiptRef: f.receiptRef || null,
      items, total: r2(items.reduce((s, i) => s + i.price, 0)), currency: 'MYR',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  }

  // ═════════ 3. Purchase History 页面 ═════════
  const F = () => ({
    q: ($('pc-q').value || '').trim().toLowerCase(), year: $('pc-year').value, month: $('pc-month').value,
    from: $('pc-from').value, to: $('pc-to').value
  });
  const filtered = () => {
    const f = F();
    return purchases.filter(p => {
      if (f.year && p.date.slice(0, 4) !== f.year) return false;
      if (f.month && p.date.slice(5, 7) !== f.month) return false;
      if (f.from && p.date < f.from) return false;
      if (f.to && p.date > f.to) return false;
      if (f.q) {
        const hay = (p.retailer || '') + ' ' + (p.items || []).map(i => i.name).join(' ');
        if (!hay.toLowerCase().includes(f.q)) return false;
      }
      return true;
    });
  };
  window.pcFilter = () => renderPurchases();
  window.pcClearFilters = () => { ['pc-q', 'pc-year', 'pc-month', 'pc-from', 'pc-to'].forEach(i => $(i).value = ''); renderPurchases(); };
  window.pcToggle = id => { open.has(id) ? open.delete(id) : open.add(id); renderPurchases(); };

  function renderPurchases() {
    const list = $('pc-list'), strip = $('pc-strip'), side = $('pc-side');
    if (!list) return;

    // 年份下拉：只列出真正有记录的年份
    const ySel = $('pc-year'), yNow = ySel.value;
    const years = [...new Set(purchases.map(p => p.date.slice(0, 4)))].sort().reverse();
    ySel.innerHTML = '<option value="">All years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    ySel.value = years.includes(yNow) ? yNow : '';

    const mk = today().slice(0, 7);
    const thisMonth = purchases.filter(p => p.date.startsWith(mk));
    strip.innerHTML = kpi(RM(thisMonth.reduce((s, p) => s + p.total, 0)), 'Spent this month') + kpi(thisMonth.length, 'Purchases this month') +
      kpi(purchases.length, 'Records saved') + kpi(purchases[0] ? fmtDateFull(purchases[0].date) : '–', 'Latest purchase');

    // 侧栏
    const stores = {};
    purchases.forEach(p => { const k = (p.retailer || '').trim() || 'Unknown store'; stores[k] = (stores[k] || 0) + p.total; });
    const topStores = Object.entries(stores).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const nR = purchases.filter(p => p.source === 'receipt').length;
    side.innerHTML =
      card('Top stores', topStores.length
        ? `<ul class="pg-mini">${topStores.map(([n, v]) => `<li><span class="pg-grow">${esc(n)}</span><b>${RM(v)}</b></li>`).join('')}</ul>`
        : '<p class="pg-muted">Your most-used stores show up here once you save a purchase.</p>', 'tint-yellow') +
      card('Where records come from', `<ul class="pg-mini"><li><span class="pg-grow">Receipt scanner</span><b>${nR}</b></li><li><span class="pg-grow">Added by hand</span><b>${purchases.length - nR}</b></li></ul>`) +
      card('Adding older shops', '<p class="pg-muted">Food Keeper never guesses when you bought something. Add a past shop yourself and pick its real date.</p><button class="pg-btn line" onclick="pcOpen()">Add purchase</button>', 'tint-green');

    if (loadError) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><p>Could not load purchases. The Firestore rules probably do not allow the <b>purchases</b> collection yet. Publish the rules from <b>firestore.rules</b> and reload.</p></div>';
      return;
    }
    if (!purchases.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">🧾</div><p>No purchases yet. Scan a receipt, or add one by hand.</p><button class="pg-btn solid" style="margin-top:14px" onclick="pcOpen()">Add purchase</button></div>';
      return;
    }
    const rows = filtered();
    if (!rows.length) { list.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><p>No purchases match these filters.</p></div>'; return; }

    const groups = {};
    rows.forEach(p => (groups[p.date.slice(0, 7)] = groups[p.date.slice(0, 7)] || []).push(p));
    list.innerHTML = Object.keys(groups).sort().reverse().map(k => {
      const g = groups[k];
      return `<div class="pg-month-h"><h3>${monthLabel(k)}<small>${g.length} purchase${g.length > 1 ? 's' : ''}</small></h3><span class="pc-sum">${RM(g.reduce((s, p) => s + p.total, 0))}</span></div>` +
        g.map(cardHTML).join('');
    }).join('');
  }

  // 这一行商品现在在哪：none = 还没加入 pantry；in = 还在 pantry；waste = 被记为浪费；used = 吃完/移除
  function itemStatus(p, i) {
    if (!i.id || !i.inPantry) return { k: 'none' };
    const food = foods.find(f => f.purchaseId === p.id && f.purchaseItemId === i.id);
    if (food) return { k: 'in', food };
    if (wasteLog.some(w => w.purchaseId === p.id && w.purchaseItemId === i.id)) return { k: 'waste' };
    return { k: 'used' };
  }

  function statusCell(p, i, idx) {
    const st = itemStatus(p, i);
    if (st.k === 'in') { const b = badgeInfo(daysLeft(st.food.expiry)); return `<button class="pc-st in ${b.cls}" onclick="pcFindInPantry('${p.id}', ${idx})" title="Show in pantry">In pantry · ${b.text}</button>`; }
    if (st.k === 'waste') return '<span class="pc-st waste">Wasted</span>';
    if (st.k === 'used') return '<span class="pc-st used">Used up</span>';
    return `<button class="pc-st add" onclick="pcToPantry('${p.id}', ${idx})">+ Add to pantry</button>`;
  }

  function cardHTML(p) {
    const d = parseYMD(p.date), isOpen = open.has(p.id), items = p.items || [], n = items.length;
    const sts = items.map(i => itemStatus(p, i));
    const nIn = sts.filter(s => s.k === 'in').length, nPend = sts.filter(s => s.k === 'none').length;
    return `<article class="pc-card ${p.source === 'receipt' ? 'src-r' : 'src-m'}" id="pc-${p.id}">
      <button class="pc-head" onclick="pcToggle('${p.id}')" aria-expanded="${isOpen}">
        <span class="pc-date"><b>${d.getDate()}</b>${d.toLocaleDateString('en-GB', { month: 'short' })}</span>
        <span class="pg-grow"><span class="pc-store">${esc(p.retailer || 'Unknown store')}</span>
          <span class="pc-meta">${n} item${n === 1 ? '' : 's'}${nIn ? ` · <span class="pc-in-count">${nIn} in pantry</span>` : ''} <span class="pg-tag">${p.source === 'receipt' ? 'Receipt scan' : 'Added by hand'}</span></span></span>
        <span class="pc-total">${RM(p.total)}</span>
      </button>
      ${isOpen ? `<div class="pc-body">
        <table class="pc-items"><tr><th>Item</th><th>Qty</th><th>Category</th><th>Pantry</th><th>Price</th></tr>
        ${items.map((i, idx) => `<tr><td>${esc(i.name)}</td><td>${esc(i.qty)}</td><td>${CAT_LABEL[i.category] || 'Other'}</td><td class="pc-stcell">${statusCell(p, i, idx)}</td><td>${RM(i.price)}</td></tr>`).join('')}</table>
        ${p.receiptRef ? `<p class="pg-muted">Receipt reference: ${esc(p.receiptRef)}</p>` : ''}
        <div class="pc-actions">${nPend ? `<button class="pg-btn solid" onclick="pcToPantry('${p.id}')">Add ${nPend === n ? 'all' : nPend} to pantry</button>` : ''}<button class="ghost-btn" onclick="pcOpen('${p.id}')">Edit</button><button class="ghost-btn pc-del" onclick="pcDelete('${p.id}')">Delete</button></div>
      </div>` : ''}
    </article>`;
  }

  window.pcDelete = async id => {
    const nLinked = foods.filter(f => f.purchaseId === id).length;
    if (!confirm(nLinked ? `Delete this purchase record? ${nLinked} item${nLinked > 1 ? 's' : ''} from it will stay in your pantry, but will no longer show where they came from.` : 'Delete this purchase record? Your pantry is not affected.')) return;
    try { await col().doc(id).delete(); open.delete(id); toast('Purchase deleted'); }
    catch (e) { console.error(e); toast('Could not delete. Try again.'); }
  };

  window.pcExport = () => {
    const rows = filtered();
    if (!rows.length) { toast('Nothing to export'); return; }
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const out = [['Purchase ID', 'Date', 'Store', 'Source', 'Receipt reference', 'Item', 'Qty', 'Category', 'Item price (RM)', 'Purchase total (RM)'].join(',')];
    rows.forEach(p => (p.items || []).forEach(i => out.push([q(p.id), p.date, q(p.retailer), p.source, q(p.receiptRef), q(i.name), i.qty, CAT_LABEL[i.category] || 'Other', Number(i.price).toFixed(2), Number(p.total).toFixed(2)].join(','))));
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + out.join('\n'));
    a.download = 'food-keeper-purchases.csv';
    a.click();
    toast('Purchases exported');
  };

  // ═════════ 4. 新增 / 编辑弹窗 ═════════
  const rowHTML = (it = {}) => `<div class="pcm-row" data-iid="${esc(it.id || newItemId())}" data-emoji="${esc(it.emoji || '')}" data-inpantry="${it.inPantry ? 1 : 0}"><input class="form-input pcm-name" placeholder="Item name" value="${esc(it.name || '')}" /><input class="form-input pcm-qty" type="number" min="0" step="any" value="${it.qty ?? 1}" /><input class="form-input pcm-price" type="number" min="0" step="0.01" placeholder="0.00" value="${it.price ?? ''}" /><select class="form-input pcm-cat">${catOpts(it.category || 'other')}</select><button type="button" class="icon-btn pcm-del" aria-label="Remove item">✕</button></div>`;
  window.pcAddRow = () => { $('pcm-items').insertAdjacentHTML('beforeend', rowHTML()); };
  const readRows = () => [...$('pcm-items').querySelectorAll('.pcm-row')].map(r => ({
    id: r.dataset.iid, emoji: r.dataset.emoji || '', inPantry: r.dataset.inpantry === '1',
    name: r.querySelector('.pcm-name').value.trim(), qty: num(r.querySelector('.pcm-qty').value) || 1,
    price: r2(num(r.querySelector('.pcm-price').value)), category: r.querySelector('.pcm-cat').value,
    _blank: !r.querySelector('.pcm-name').value.trim() && !r.querySelector('.pcm-price').value
  }));
  const updateTotal = () => { $('pcm-total').textContent = RM(readRows().reduce((s, i) => s + i.price, 0)); };
  $('pcm-items').addEventListener('input', updateTotal);
  $('pcm-items').addEventListener('click', e => {
    if (!e.target.closest('.pcm-del')) return;
    const rows = $('pcm-items').querySelectorAll('.pcm-row');
    if (rows.length > 1) e.target.closest('.pcm-row').remove(); else { const r0 = rows[0]; r0.querySelectorAll('input').forEach(i => i.value = ''); r0.dataset.iid = newItemId(); r0.dataset.emoji = ''; r0.dataset.inpantry = '0'; }
    updateTotal();
  });
  const showErr = m => { const e = $('pcm-error'); e.textContent = m; e.className = 'auth-error' + (m ? ' show' : ''); };

  window.pcOpen = id => {
    const p = id ? purchases.find(x => x.id === id) : null;
    editingId = p ? p.id : null;
    draftId = p ? p.id : newId();          // 新记录先生成 ID：连点保存也只会写同一份文档
    $('pcm-title').textContent = p ? 'Edit purchase' : 'Add purchase';
    $('pcm-date').value = p ? p.date : today();
    $('pcm-date').max = today();
    $('pcm-retailer').value = p ? (p.retailer || '') : '';
    $('pcm-ref').value = p ? (p.receiptRef || '') : '';
    $('pcm-items').innerHTML = (p && p.items.length ? p.items : [{}]).map(rowHTML).join('');
    showErr('');
    updateTotal();
    $('pcm-pantry-wrap').style.display = p ? 'none' : '';            // 只有新增时才问
    $('pcm-pantry').checked = !p;
    $('pc-overlay').classList.add('open');
  };
  // 日期是几天前的旧账 → 食物多半已经吃完，默认不勾
  $('pcm-date').addEventListener('change', () => {
    const d = $('pcm-date').value;
    if (validYMD(d)) $('pcm-pantry').checked = Math.round((parseYMD(today()) - parseYMD(d)) / 864e5) <= 2;
  });
  window.pcClose = () => $('pc-overlay').classList.remove('open');

  window.pcSave = async () => {
    if (saving) return;
    const date = $('pcm-date').value;
    const items = readRows().filter(i => !i._blank);
    if (!validYMD(date)) return showErr('Pick the purchase date.');
    if (date > today()) return showErr('The purchase date cannot be in the future.');
    if (!items.length) return showErr('Add at least one item.');
    if (items.some(i => !i.name)) return showErr('Give every item a name.');
    saving = true; $('pcm-save').disabled = true;
    try {
      const f = { date, retailer: $('pcm-retailer').value.trim(), receiptRef: $('pcm-ref').value.trim(), items };
      const doc = toDoc(f), wasEditing = !!editingId, toPantry = !wasEditing && $('pcm-pantry').checked;
      if (wasEditing) {
        const old = purchases.find(x => x.id === editingId);
        await col().doc(editingId).update(doc);
        // 价格改了 → pantry 里对应食物的价格跟着改（库存价值、浪费金额才对得上）
        if (old) for (const it of doc.items) {
          const prev = (old.items || []).find(o => o.id === it.id);
          if (!prev || prev.price === it.price) continue;
          for (const food of foods.filter(x => x.purchaseId === editingId && x.purchaseItemId === it.id)) await updateFood(food.id, { price: it.price }).catch(console.error);
        }
      } else await col().doc(draftId).set({ ...doc, userId: currentUser.uid, source: 'manual', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      pcClose(); toast(wasEditing ? 'Purchase updated' : 'Purchase saved');
      if (toPantry) openPantryModal({ id: draftId, date, retailer: f.retailer, items: doc.items }, doc.items.map((it, i) => ({ it, i })));
    } catch (e) { console.error(e); showErr('Could not save. Check your connection and try again.'); }
    saving = false; $('pcm-save').disabled = false;
  };

  // ═════════ 5. Monthly Spending ═════════
  let range = 'month', customFrom = '', customTo = '';
  const RANGES = [['month', 'This month'], ['last', 'Last month'], ['3', 'Last 3 months'], ['6', 'Last 6 months'], ['custom', 'Custom']];
  window.spRange = r => { range = r; renderSpending(); };
  window.spCustom = () => { customFrom = $('sp-from').value; customTo = $('sp-to').value; renderSpending(); };

  function bounds() {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    if (range === 'month') return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
    if (range === 'last') return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
    if (range === '3') return [ymd(new Date(y, m - 2, 1)), ymd(new Date(y, m + 1, 0))];
    if (range === '6') return [ymd(new Date(y, m - 5, 1)), ymd(new Date(y, m + 1, 0))];
    let f = customFrom || (purchases.length ? purchases[purchases.length - 1].date : today()), t = customTo || today();
    if (f > t) [f, t] = [t, f];
    return [f, t];
  }
  const sumBy = (arr, key) => { const o = {}; arr.forEach(p => (p.items || []).forEach(i => { const c = i[key] || 'other'; o[c] = (o[c] || 0) + i.price; })); return o; };
  const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;

  function renderSpending() {
    const strip = $('sp-strip'), main = $('sp-main'), side = $('sp-side');
    if (!strip) return;
    $('sp-chips').innerHTML = RANGES.map(([k, l]) => `<button class="pg-chip blue ${range === k ? 'on' : ''}" onclick="spRange('${k}')">${l}</button>`).join('');
    $('sp-custom').style.display = range === 'custom' ? 'flex' : 'none';

    if (loadError || !purchases.length) {
      strip.innerHTML = ''; side.innerHTML = '';
      main.innerHTML = loadError
        ? '<div class="empty"><div class="empty-icon">⚠️</div><p>Could not load purchases. Publish the rules from <b>firestore.rules</b> and reload.</p></div>'
        : '<div class="empty"><div class="empty-icon">📊</div><p>No spending to show yet. Save a purchase and your charts appear here.</p><div class="pc-empty-actions"><button class="pg-btn solid" onclick="switchView(\'receipt\')">Scan a receipt</button><button class="pg-btn line" onclick="switchView(\'purchases\'); pcOpen()">Add by hand</button></div></div>';
      return;
    }

    const [from, to] = bounds();
    const inR = purchases.filter(p => p.date >= from && p.date <= to);
    const total = inR.reduce((s, p) => s + p.total, 0);
    const nM = Math.max(monthsBetween(from, to), 1);
    strip.innerHTML = kpi(RM(total), 'Total spent') + kpi(inR.length, 'Purchases') +
      kpi(inR.length ? RM(total / inR.length) : '–', 'Average purchase') + kpi(inR.length ? RM(total / nM) : '–', `Monthly average (${nM} month${nM > 1 ? 's' : ''})`);

    // 月度柱状图（至少显示 6 个月，最多 12 个月；范围内的月份用绿色）
    const byM = {}; purchases.forEach(p => { const k = p.date.slice(0, 7); byM[k] = (byM[k] || 0) + p.total; });
    const span = Math.min(Math.max(nM, 6), 12), [ey, em] = to.slice(0, 7).split('-').map(Number), cols = [];
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(ey, em - 1 - i, 1), k = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      cols.push({ k, v: byM[k] || 0, label: d.toLocaleDateString('en-GB', { month: 'short' }), in: k >= from.slice(0, 7) && k <= to.slice(0, 7) });
    }
    const mx = Math.max(...cols.map(c => c.v), 1);
    const chart = card('Monthly spending', `<div class="pg-cols sp-tall">${cols.map(c => `<div class="pg-col ${c.in ? 'now' : ''}" title="${monthLabel(c.k)}: ${RM(c.v)}">${c.v ? `<b>${Math.round(c.v)}</b>` : ''}<i style="height:${c.v ? Math.max(c.v / mx * 100, 4) : 2}%"></i>${c.label}</div>`).join('')}</div><p class="pg-muted">Green months are inside your selected range. Values in RM.</p>`);

    // 分类
    const cats = Object.entries(sumBy(inR, 'category')).sort((a, b) => b[1] - a[1]);
    const catTotal = cats.reduce((s, c) => s + c[1], 0) || 1;
    const catCard = card('Spending by category', cats.length
      ? cats.map(([c, v]) => `<div class="pg-row"><div class="pg-row-top"><span>${CAT_ICON[c] || '📦'} ${CAT_LABEL[c] || 'Other'}</span><b>${RM(v)} · ${Math.round(v / catTotal * 100)}%</b></div><div class="pg-bar"><i style="width:${Math.round(v / catTotal * 100)}%"></i></div></div>`).join('')
      : '<p class="pg-muted">No purchases in this range.</p>');

    // 频率
    const wd = [0, 0, 0, 0, 0, 0, 0]; inR.forEach(p => wd[(parseYMD(p.date).getDay() + 6) % 7]++);
    const wmx = Math.max(...wd, 1), dates = [...new Set(inR.map(p => p.date))].sort();
    const upTo = to < today() ? to : today(), daySpan = Math.max(Math.round((parseYMD(upTo) - parseYMD(from)) / 864e5) + 1, 1);
    const gap = dates.length > 1 ? Math.round((parseYMD(dates[dates.length - 1]) - parseYMD(dates[0])) / 864e5 / (dates.length - 1)) : null;
    const freq = card('How often you shop', inR.length
      ? `<div class="pg-cols sp-short">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => `<div class="pg-col">${wd[i] ? `<b>${wd[i]}</b>` : ''}<i style="height:${wd[i] ? Math.max(wd[i] / wmx * 100, 6) : 2}%"></i>${d}</div>`).join('')}</div>
         <p class="pg-muted">About ${(inR.length / (daySpan / 7)).toFixed(1)} purchases a week${gap !== null ? `, roughly every ${gap} day${gap === 1 ? '' : 's'}` : ''}.</p>`
      : '<p class="pg-muted">No purchases in this range.</p>');
    main.innerHTML = chart + catCard + freq;

    // 本月 vs 上月（固定对比，不受范围影响）
    const now = new Date(), tk = ymd(now).slice(0, 7), lk = (d => d.getFullYear() + '-' + pad(d.getMonth() + 1))(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const tm = purchases.filter(p => p.date.startsWith(tk)), lm = purchases.filter(p => p.date.startsWith(lk));
    const tt = tm.reduce((s, p) => s + p.total, 0), lt = lm.reduce((s, p) => s + p.total, 0), ch = pct(tt, lt);
    const cT = sumBy(tm, 'category'), cL = sumBy(lm, 'category');
    const diffs = [...new Set([...Object.keys(cT), ...Object.keys(cL)])].map(c => [c, (cT[c] || 0) - (cL[c] || 0)]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3);
    side.innerHTML =
      card('This month vs last month', `<div class="pg-kpi-num">${RM(tt)}</div>
        <p class="pg-muted">${lm.length ? `Last month: ${RM(lt)} over ${lm.length} purchase${lm.length > 1 ? 's' : ''}.` : 'No purchases saved for last month.'}</p>
        ${ch === null ? '' : `<p class="pg-delta">${ch === 0 ? 'Same as last month.' : `${Math.abs(ch)}% ${ch > 0 ? 'more' : 'less'} than last month.`}</p>`}`, 'tint-yellow') +
      card('Spent vs wasted', (() => {
        const wasted = wasteLog.filter(w => w.date && w.date >= from && w.date <= to).reduce((s, w) => s + (Number(w.price) || 0), 0);
        const nW = wasteLog.filter(w => w.date && w.date >= from && w.date <= to).length;
        return `<div class="pg-kpi-num">${RM(wasted)}</div><p class="pg-muted">${nW} item${nW === 1 ? '' : 's'} logged as waste in this range${total > 0 ? `, about ${Math.round(wasted / total * 100)}% of the ${RM(total)} you spent` : ''}.</p>`;
      })()) +
      card('Biggest category changes', diffs.length && lm.length
        ? `<ul class="pg-mini">${diffs.map(([c, v]) => `<li><span class="pg-emo">${CAT_ICON[c] || '📦'}</span><span class="pg-grow">${CAT_LABEL[c] || 'Other'}</span><b>${v >= 0 ? '+' : '−'}${RM(Math.abs(v))}</b></li>`).join('')}</ul>`
        : '<p class="pg-muted">Needs purchases from both months to compare.</p>') +
      card('Keep it accurate', '<p class="pg-muted">Charts only count saved purchases. If you shopped before using Food Keeper, add those shops with their real dates.</p><button class="pg-btn line" onclick="switchView(\'purchases\'); pcOpen()">Add past purchase</button>', 'tint-green');
  }

  function renderAll() { renderPurchases(); renderSpending(); }

  // ═════════ 6. 收据扫描：检查 → 确认 → 保存购买记录 + 加入 Pantry ═════════
  let scan = null, savingScan = false;

  // 让 AI 顺便读出店名、日期、数量（只追加字段，原来的 JSON 数组格式不变；读不到就留空）
  try {
    if (window.puter && puter.ai && !puter.ai.__fkPc) {
      const prev = puter.ai.chat;
      puter.ai.chat = function (prompt, ...rest) {
        if (typeof prompt === 'string' && prompt.includes('receipt parser'))
          prompt += '\nAlso add these fields to every object: "quantity" (number, 1 if not shown), "retailer" (store name printed on the receipt, or "" if not visible), "purchase_date" (YYYY-MM-DD printed on the receipt, or "" if not visible). Never guess a value that is not printed on the receipt.';
        return prev.call(puter.ai, prompt, ...rest);
      };
      puter.ai.__fkPc = true;
    }
  } catch (e) { console.warn('Receipt prompt patch skipped', e); }

  const _process = window.processReceiptImage;
  window.processReceiptImage = async function () {
    await _process.apply(this, arguments);
    try { setupScanEditor(); } catch (e) { console.error('Scan editor failed', e); }
  };

  function scanRow(it) {
    const days = parseInt(it.estimated_expiry_days) || 7;
    return `<div class="sc-row" data-iid="${newItemId()}" data-emoji="${esc(it.emoji || '🍽️')}">
      <input type="checkbox" class="sc-add" checked title="Add to pantry" aria-label="Add to pantry" />
      <input class="form-input sc-name" value="${esc(it.name || '')}" aria-label="Item name" />
      <input class="form-input sc-qty" type="number" min="0" step="any" value="${num(it.quantity) || 1}" aria-label="Quantity" />
      <input class="form-input sc-price" type="number" min="0" step="0.01" value="${(Number(it.price) || 0).toFixed(2)}" aria-label="Price" />
      <select class="form-input sc-cat" aria-label="Category">${catOpts(CATS.includes(it.category) ? it.category : 'other')}</select>
      <select class="form-input sc-loc" aria-label="Storage">${locOpts(['fridge', 'freezer', 'pantry'].includes(it.location) ? it.location : 'fridge')}</select>
      <input class="form-input sc-days" type="number" min="0" step="1" value="${days}" aria-label="Days until expiry" />
      <button type="button" class="icon-btn sc-del" aria-label="Remove line">✕</button></div>`;
  }

  function setupScanEditor() {
    const wrap = document.querySelector('#receipt-results-container .receipt-data-table-wrapper');
    if (!wrap || !scannedReceiptItems.length) return;
    const first = scannedReceiptItems[0] || {};
    const rd = validYMD(first.purchase_date) && first.purchase_date <= today() ? first.purchase_date : '';
    const file = ($('receipt-file').files || [])[0];
    scan = { id: newId(), file: file ? file.name : '' };
    wrap.innerHTML = `
      <p class="pg-muted" style="margin-bottom:10px">Check what the AI read. Fix anything wrong, untick lines you do not want in your pantry, then save.</p>
      <div class="sc-fields">
        <div class="form-field"><label class="form-label">Store</label><input class="form-input" id="sc-retailer" value="${esc((first.retailer || '').toString().trim())}" placeholder="Store name" /></div>
        <div class="form-field"><label class="form-label">Purchase date ${rd ? '' : '<span class="pg-muted">(not found on receipt, check it)</span>'}</label><input class="form-input" type="date" id="sc-date" max="${today()}" value="${rd || today()}" /></div>
      </div>
      <div class="sc-grid">
        <div class="sc-row sc-headrow"><span title="Add to pantry">Pantry</span><span>Item</span><span>Qty</span><span>Price (RM)</span><span>Category</span><span>Storage</span><span>Expiry (days)</span><span></span></div>
        <div id="sc-rows">${scannedReceiptItems.map(scanRow).join('')}</div>
      </div>
      <div class="pcm-total">Receipt total <b id="sc-total"></b></div>`;
    const upd = () => { $('sc-total').textContent = RM([...wrap.querySelectorAll('.sc-price')].reduce((s, i) => s + num(i.value), 0)); };
    wrap.addEventListener('input', upd);
    wrap.addEventListener('click', e => { if (e.target.closest('.sc-del')) { e.target.closest('.sc-row').remove(); upd(); } });
    upd();
    const btn = $('add-to-inventory-btn');
    if (btn) btn.textContent = 'Save purchase & add to pantry';
  }

  function resetReceiptUI() {
    scannedReceiptItems = []; scan = null; currentReceiptBase64 = null;
    $('receipt-results-container').innerHTML = '';
    $('receipt-file').value = '';
    $('receipt-preview-box').style.display = 'none';
    const b = $('add-to-inventory-btn'); if (b) { b.style.display = 'none'; b.textContent = 'Add All Items to Inventory ➕'; }
  }

  const _addScanned = window.addScannedItemsToInventory;
  window.addScannedItemsToInventory = async function () {
    if (!scan) { if (scannedReceiptItems.length) return _addScanned.apply(this, arguments); return; }
    if (savingScan) return;
    const rows = [...document.querySelectorAll('#receipt-results-container .sc-row:not(.sc-headrow)')].map(r => ({
      name: r.querySelector('.sc-name').value.trim(), qty: num(r.querySelector('.sc-qty').value) || 1,
      price: r2(num(r.querySelector('.sc-price').value)), category: r.querySelector('.sc-cat').value,
      location: r.querySelector('.sc-loc').value, days: Math.max(parseInt(r.querySelector('.sc-days').value) || 7, 0),
      id: r.dataset.iid, emoji: r.dataset.emoji, add: r.querySelector('.sc-add').checked
    })).filter(i => i.name);
    const date = $('sc-date').value, retailer = $('sc-retailer').value.trim();
    if (!rows.length) { alert('There are no items to save.'); return; }
    if (!validYMD(date) || date > today()) { alert('Pick a valid purchase date (not in the future).'); return; }

    const total = r2(rows.reduce((s, i) => s + i.price, 0));
    const dup = purchases.find(p => p.id !== scan.id && p.date === date && Math.abs(p.total - total) < 0.005 && (p.retailer || '').toLowerCase() === retailer.toLowerCase());
    if (dup && !confirm('A purchase with the same date, store and total is already saved. Save this one anyway?')) return;

    savingScan = true;
    const btn = $('add-to-inventory-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    // 先存购买记录（inPantry 先全是 false，等食物真的写进 pantry 后再标记）
    const items = rows.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, category: i.category, emoji: i.emoji, inPantry: false }));
    try {
      // 固定 ID：同一张收据无论点几次确认，都只会写入同一份文档
      await col().doc(scan.id).set({ ...toDoc({ date, retailer, receiptRef: scan.file, items }), userId: currentUser.uid, source: 'receipt', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch (e) {
      console.error(e);
      toast('Could not save the purchase, so nothing was added to your pantry. Try again.');
      savingScan = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Save purchase & add to pantry'; }
      return;
    }
    // 再把勾选的行加入 pantry，并且和这张购买记录连起来
    const entries = rows.map((r, i) => r.add ? { i, name: r.name, qty: r.qty, location: r.location, expiry: (() => { const e = new Date(); e.setDate(e.getDate() + r.days); return ymd(e); })() } : null).filter(Boolean);
    const sid = scan.id, res = await addItemsToPantry(sid, items, entries);
    savingScan = false;
    if (btn) btn.disabled = false;
    resetReceiptUI();      // 购买记录已经存好了：剩下没加进去的可以到 Purchases 页面再加，避免重复添加
    if (res.error) { toast(`Purchase saved, but only ${res.added} of ${entries.length} item(s) reached your pantry. Add the rest from the Purchases page.`, 5000); switchView('purchases'); open.add(sid); renderPurchases(); return; }
    toast(`Purchase saved. ${res.added} item${res.added === 1 ? '' : 's'} added to your pantry.`);
    switchView('pantry');
  };

  // ═════════ 7. Purchases ↔ Pantry 连接 ═════════
  // 把一批商品写进 pantry（每件食物带着 purchaseId + purchaseItemId），再回头把购买记录里这些行标记为 inPantry。
  // entries: [{ i: 商品在 items 里的位置, name, qty, location, expiry }]
  async function addItemsToPantry(pid, items, entries) {
    const next = items.map(cleanItem);            // 旧记录没有 ID 的行在这里补上
    const done = new Set(); let error = null;
    for (const e of entries) {
      const it = next[e.i];
      try {
        await addFood({
          name: e.name, expiry: e.expiry, emoji: it.emoji || CAT_ICON[it.category] || '🍽️', qty: String(e.qty),
          note: 'From purchase', location: e.location, category: it.category, price: it.price,
          purchaseId: pid, purchaseItemId: it.id
        });
        done.add(e.i);
      } catch (ex) { console.error(ex); error = ex; break; }
    }
    if (done.size) {
      try {
        await col().doc(pid).update({ items: next.map((it, i) => ({ ...it, inPantry: it.inPantry || done.has(i) })), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      } catch (ex) { console.error(ex); error = error || ex; }
    }
    return { added: done.size, error };
  }

  // Pantry 卡片上的来源标签
  window.pcChip = f => {
    if (!f.purchaseId) return '';
    const p = purchases.find(x => x.id === f.purchaseId);
    return p ? `<button class="pc-chip" onclick="pcJump('${p.id}')" title="Open this purchase">🧾 ${esc(p.retailer || 'Purchase')} · ${fmtDate(p.date)}</button>` : '';
  };

  // Pantry → 购买记录
  window.pcJump = id => {
    if (bulkMode) return;
    switchView('purchases');
    open.add(id);
    ['pc-q', 'pc-year', 'pc-month', 'pc-from', 'pc-to'].forEach(i => $(i).value = '');
    renderPurchases();
    const el = $('pc-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // 购买记录 → Pantry（直接过滤出那件食物）
  window.pcFindInPantry = (pid, idx) => {
    const p = purchases.find(x => x.id === pid), it = p && p.items[idx];
    if (!it) return;
    const food = foods.find(f => f.purchaseId === pid && f.purchaseItemId === it.id);
    const q = food ? food.name : it.name;
    switchView('pantry');
    $('search-input').value = q; handleSearch(q);
    $('loc-filter').value = 'all'; handleLocationFilter('all');
  };

  // 「加入 pantry」弹窗
  let pp = null, ppSaving = false;
  const ppErr = m => { const e = $('pp-error'); e.textContent = m; e.className = 'auth-error' + (m ? ' show' : ''); };
  window.pcToPantry = (pid, idx) => {
    const p = purchases.find(x => x.id === pid); if (!p) return;
    const list = (p.items || []).map((it, i) => ({ it, i })).filter(x => itemStatus(p, x.it).k === 'none' && (idx === undefined || x.i === idx));
    if (!list.length) { toast('Everything here is already in your pantry'); return; }
    openPantryModal(p, list);
  };
  function openPantryModal(p, list) {
    pp = { p };
    $('pp-sub').textContent = `From ${p.retailer || 'your purchase'} on ${fmtDateFull(p.date)}. Untick anything you do not want in your pantry (for example food that is already eaten).`;
    $('pp-rows').innerHTML = list.map(({ it, i }) => {
      const cat = CATS.includes(it.category) ? it.category : 'other', loc = LOC_BY_CAT[cat];
      return `<div class="pp-row" data-i="${i}" data-cat="${cat}">
        <input type="checkbox" class="pp-on" checked aria-label="Add to pantry" />
        <input class="form-input pp-name" value="${esc(it.name)}" aria-label="Item name" />
        <input class="form-input pp-qty" value="${esc(it.qty)}" aria-label="Quantity" />
        <select class="form-input pp-loc" aria-label="Storage">${locOpts(loc)}</select>
        <input class="form-input pp-exp" type="date" value="${expiryFor(loc, cat)}" aria-label="Expiry date" /></div>`;
    }).join('');
    ppErr('');
    $('pp-save').disabled = false; $('pp-save').textContent = 'Add to pantry';
    $('pp-overlay').classList.add('open');
  }
  $('pp-rows').addEventListener('input', e => { if (e.target.classList.contains('pp-exp')) e.target.dataset.dirty = '1'; });
  $('pp-rows').addEventListener('change', e => {       // 换存放位置 → 如果过期日还没被手动改过，就按新位置重新估算
    if (!e.target.classList.contains('pp-loc')) return;
    const row = e.target.closest('.pp-row'), exp = row.querySelector('.pp-exp');
    if (!exp.dataset.dirty) exp.value = expiryFor(e.target.value, row.dataset.cat);
  });
  window.ppClose = () => { $('pp-overlay').classList.remove('open'); pp = null; };
  window.ppSave = async () => {
    if (ppSaving || !pp) return;
    const entries = [...$('pp-rows').querySelectorAll('.pp-row')].filter(r => r.querySelector('.pp-on').checked).map(r => ({
      i: +r.dataset.i, name: r.querySelector('.pp-name').value.trim(), qty: r.querySelector('.pp-qty').value.trim() || '1',
      location: r.querySelector('.pp-loc').value, expiry: r.querySelector('.pp-exp').value
    }));
    if (!entries.length) return ppErr('Tick at least one item, or close this window.');
    if (entries.some(e => !e.name)) return ppErr('Give every ticked item a name.');
    if (entries.some(e => !validYMD(e.expiry))) return ppErr('Pick an expiry date for every ticked item.');
    ppSaving = true; $('pp-save').disabled = true; $('pp-save').textContent = 'Adding...';
    const { p } = pp;
    const res = await addItemsToPantry(p.id, p.items, entries);
    ppSaving = false;
    if (res.error) {
      $('pp-save').disabled = false; $('pp-save').textContent = 'Add to pantry';
      if (!res.added) return ppErr('Could not add to your pantry. Check your connection and try again.');
      ppClose(); toast(`Only ${res.added} of ${entries.length} item(s) reached your pantry. Add the rest again from this purchase.`, 5000); return;
    }
    ppClose(); toast(`${res.added} item${res.added === 1 ? '' : 's'} added to your pantry.`);
  };

  // 食物被吃掉 / 记为浪费 / 过期日变化 → app.js 会重画 pantry，这里顺带刷新购买记录里的状态
  if (_render) window.render = function () { _render.apply(this, arguments); try { renderAll(); } catch (e) { console.error(e); } };
  if (_renderWaste) window.renderWasteLog = function () { _renderWaste.apply(this, arguments); try { renderAll(); } catch (e) { console.error(e); } };

  // 初始化：重画侧边栏（加入两个新入口）和当前语言
  try { renderSidebar(); } catch (e) { console.error(e); }
  renderAll();
})();
