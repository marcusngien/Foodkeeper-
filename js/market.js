// market.js — 放在 account.js 后面加载（… → purchase.js → account.js → market.js）
// Business 的「告示板」：平台只做撮合，不负责配送。
//   Seller   发布剩余食物：Donate（捐赠）或 Sell（出售）。临期没人领 → 提醒转成出售给 Buyer。
//   Receiver 只看到「同一个州」里的 Donate 告示，决定接不接；接了以后双方才交换联系方式，自己安排取货。
//   Buyer    浏览出售告示（沼气 / 废物转能源 / 食物回收），表示有兴趣，由 Seller 联系。
// 数据：listings/{id}                    告示本体（公开部分）
//       listings/{id}/private/ownerContact  Seller 联系方式（只有 owner 和已接受的 receiver 看得到）
//       interests/{listingId}__{buyerUid}   Buyer 的意向
// 权限全部由 firestore.rules 把关；只有 Verified 的 Business 才能用。
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const A = () => window.fkAccount;
  const can = c => A().can(c);
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  const uid = () => (auth.currentUser || {}).uid;

  const CAT = { produce: 'Fruit & vegetables', bakery: 'Bread & bakery', dairy: 'Dairy & eggs', meat: 'Meat & seafood', cooked: 'Cooked meals', dry: 'Dry & packaged', drinks: 'Drinks', other: 'Other' };
  const UNITS = ['kg', 'pcs', 'packs', 'boxes', 'trays', 'L'];
  const SOON_DAYS = 2;                                       // 距离过期 ≤ 2 天还没人领 → 警告
  const VIEWS = ['biz-mine', 'biz-board', 'biz-deals'];
  const LS = { open: ['Open', 'blue'], accepted: ['Accepted', 'amber'], completed: ['Completed', 'green'], cancelled: ['Cancelled', ''] };

  IC['biz-mine']  = '<path d="M4 7l2-3h12l2 3"/><path d="M5 7v13h14V7"/><path d="M9 20v-6h6v6"/>';
  IC['biz-board'] = '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h10M9 21h6"/>';
  IC['biz-deals'] = '<path d="M20 6L9 17l-5-5"/>';

  // ───────── 工具 ─────────
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const daysLeft = d => d ? Math.round((Date.parse(d + 'T00:00:00') - Date.parse(today() + 'T00:00:00')) / 864e5) : null;
  const expLabel = d => { const n = daysLeft(d); return n === null ? 'No expiry date' : n < 0 ? `expired ${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'expires today' : n === 1 ? 'expires tomorrow' : `expires in ${n} days`; };
  const ts = l => (l.createdAt && l.createdAt.seconds) || 9e12;
  const money = p => (p === null || p === undefined || p === '') ? '' : Number(p) === 0 ? 'Free' : 'RM ' + Number(p).toFixed(2);
  const chipLS = l => { const [t, c] = LS[l.status] || [l.status, '']; return `<span class="st-chip ${c}">${l.mode === 'sell' && l.status === 'completed' ? 'Sold' : t}</span>`; };
  const tag = m => `<span class="mk-tag ${m}">${m === 'donate' ? 'Donate' : 'Sell'}</span>`;
  const contactLine = c => c ? [c.person, c.phone, c.email].filter(Boolean).map(esc).join(' · ') : '–';
  const card = (t, b, tint = '') => `<section class="pg-card ${tint}"><h4>${t}</h4>${b}</section>`;
  const kpi = (v, l) => `<div class="pg-kpi"><span class="pg-kpi-num">${v}</span><span class="pg-kpi-lbl">${l}</span></div>`;
  const hero = (tone, title, text) => `<header class="pg-hero tone-${tone}"><div><h2>${title}</h2><p>${text}</p></div><div class="pg-art" aria-hidden="true"><svg viewBox="0 0 160 110" fill="none" stroke="var(--tone)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="24" y="18" width="112" height="72" rx="8"/><path d="M44 40h40M44 56h72M44 72h56"/><path d="M60 100h40" stroke="#F4D84A" stroke-width="4"/></svg></div></header>`;
  const empty = (icon, text) => `<div class="empty"><div class="empty-icon">${icon}</div><p>${text}</p></div>`;

  // ───────── 状态 + 监听 ─────────
  const data = { mine: [], donations: [], sales: [], pickups: [], interestsIn: [], interestsMine: [] };
  const errs = {};
  let unsubs = {}, sig = '', curView = null, formOpen = false, editId = null, formMode = 'donate', boardTab = null, busy = false;
  const contacts = {}, loading = new Set();

  function stop() {
    Object.values(unsubs).forEach(u => { try { u(); } catch (e) {} }); unsubs = {};
    Object.keys(data).forEach(k => data[k] = []); Object.keys(errs).forEach(k => delete errs[k]);
    Object.keys(contacts).forEach(k => delete contacts[k]); loading.clear();
    sig = ''; curView = null; formOpen = false; editId = null; boardTab = null; busy = false;
  }
  auth.onAuthStateChanged(stop);

  function watch(key, q) {
    if (unsubs[key]) return;
    unsubs[key] = q.onSnapshot(snap => { data[key] = snap.docs.map(d => ({ id: d.id, ...d.data() })); delete errs[key]; changed(); },
      e => { console.error('market ' + key, e); data[key] = []; errs[key] = e.code || 'error'; changed(); });
  }
  function ensureWatches() {
    const b = A().business(), u = uid();
    if (!b || !u || A().status() !== 'verified') return;
    const s = [u, b.state, (b.capabilities || []).join(',')].join('|');
    if (s !== sig) { const keep = curView; stop(); curView = keep; sig = s; }
    const L = db.collection('listings');
    if (can('seller'))   { watch('mine', L.where('ownerUid', '==', u)); watch('interestsIn', db.collection('interests').where('ownerUid', '==', u)); }
    if (can('receiver')) { watch('donations', L.where('mode', '==', 'donate').where('state', '==', b.state).where('status', '==', 'open')); watch('pickups', L.where('acceptedUid', '==', u)); }
    if (can('buyer'))    { watch('sales', L.where('mode', '==', 'sell').where('status', '==', 'open')); watch('interestsMine', db.collection('interests').where('buyerUid', '==', u)); }
  }
  function changed() {
    if (A().workspace() !== 'business') return;
    const v = A().view();
    if (VIEWS.includes(v) && v === curView) paint();
    else if (v === 'biz-home') A().refresh();
  }

  // ───────── 导航 ─────────
  function nav() {
    if (A().status() !== 'verified') return [];
    const out = [];
    if (can('seller')) out.push(['biz-mine', 'My listings']);
    if (can('receiver') && can('buyer')) out.push(['biz-board', 'Board'], ['biz-deals', 'My activity']);
    else if (can('receiver')) out.push(['biz-board', 'Donation board'], ['biz-deals', 'My pickups']);
    else if (can('buyer')) out.push(['biz-board', 'Marketplace'], ['biz-deals', 'My interests']);
    return out;
  }
  const allowed = v => nav().some(n => n[0] === v);
  const label = id => { const n = nav().find(x => x[0] === id); return n ? n[1] : { 'biz-mine': 'My listings', 'biz-board': 'Board', 'biz-deals': 'My activity' }[id]; };

  // ───────── 渲染入口（由 account.js 调用）─────────
  function render(view, root) {
    curView = view;
    if (view !== 'biz-mine') { formOpen = false; editId = null; }
    if (!allowed(view)) {
      root.innerHTML = `<section class="pg-view pg-biz">${hero('blue', 'Available after verification', 'The food board opens once your organisation is verified and has a role.')}
        ${card('What happens next', '<p class="pg-muted">Finish your organisation profile and submit it for review. When it is approved, Receivers see donations in their state, Sellers can post surplus food and Buyers can browse sale listings.</p><div class="pg-actions"><button class="pg-btn solid" onclick="bizGo(\'biz-profile\')">Open organisation profile</button></div>')}</section>`;
      return;
    }
    ensureWatches();
    if (view === 'biz-mine' && formOpen && $('mk-shell') && $('mk-shell').dataset.view === view) { paint(); return; }          // 正在填表：只更新列表
    const t = { 'biz-mine': ['green', 'My listings', 'Post surplus food to donate or sell. We only match you with people. You arrange pickup directly.'],
                'biz-board': ['green', label('biz-board'), can('receiver') ? 'Donations from sellers in your state. Accept the ones you can collect.' : 'Surplus food and food-recovery material for sale.'],
                'biz-deals': ['blue', label('biz-deals'), 'Confirm what you collected, or follow up on the offers you showed interest in.'] }[view];
    root.innerHTML = `<section class="pg-view pg-biz" id="mk-shell" data-view="${view}">${hero(...t)}<div id="mk-top"></div><div id="mk-dyn"></div></section>`;
    if (view === 'biz-mine') drawTop();
    paint();
  }
  function paint() {
    const el = $('mk-dyn'); if (!el || !allowed(curView)) return;
    el.innerHTML = curView === 'biz-mine' ? mineHtml() : curView === 'biz-board' ? boardHtml() : dealsHtml();
  }
  const errBox = keys => keys.some(k => errs[k]) ? `<div class="auth-error show">Could not load the board. Make sure the latest <b>firestore.rules</b> are published, then reload.</div>` : '';

  // ───────── Seller：我的发布 ─────────
  function mineHtml() {
    const list = data.mine.slice().sort((a, b) => ts(b) - ts(a));
    const open = list.filter(l => l.status === 'open'), acc = list.filter(l => l.status === 'accepted'), done = list.filter(l => l.status === 'completed');
    const soon = open.filter(l => l.mode === 'donate' && daysLeft(l.expiry) !== null && daysLeft(l.expiry) <= SOON_DAYS);
    const warn = soon.map(l => `<div class="mk-warn"><span aria-hidden="true">${ic('alert')}</span><div><b>No receiver yet for “${esc(l.title)}”</b>It ${esc(expLabel(l.expiry))} and nobody has accepted it. It may end up as waste. Consider selling it to a food-recovery buyer, such as a biogas or waste-to-energy company.<br><button class="pg-btn solid" onclick="fkMarket.convert('${l.id}')">Convert to sale</button></div></div>`).join('');
    return `${errBox(['mine'])}
      <section class="pg-strip">${kpi(open.length, 'Open')}${kpi(acc.length, 'Accepted')}${kpi(done.length, 'Completed')}${kpi(data.interestsIn.length, 'Buyer interests')}</section>
      ${warn}
      ${list.length ? `<div class="mk-list">${list.map(sellerRow).join('')}</div>` : empty(ic('box'), 'No listings yet. Post your first surplus item above.')}`;
  }
  function sellerRow(l) {
    const n = daysLeft(l.expiry), live = l.status === 'open' || l.status === 'accepted';
    const soon = l.status === 'open' && n !== null && n <= SOON_DAYS;
    const ints = data.interestsIn.filter(i => i.listingId === l.id);
    let sub = '';
    if (l.status === 'accepted' || (l.status === 'completed' && l.acceptedBy)) sub = `<div class="mk-sub"><b>${l.status === 'accepted' ? 'Accepted by' : 'Collected by'} ${esc(l.acceptedBy.orgName || 'a receiver')}</b><br>${contactLine(l.acceptedBy)}<br><small>Contact them to arrange pickup. Mark it completed once it is collected.</small></div>`;
    else if (l.mode === 'sell' && l.status === 'open') sub = `<div class="mk-sub"><b>${ints.length ? ints.length + ' interested buyer' + (ints.length > 1 ? 's' : '') : 'No buyers yet'}</b>${ints.length ? `<ul>${ints.map(i => `<li>${esc(i.buyerOrg || 'Buyer')}<br><small>${contactLine(i.contact)}${i.message ? '<br>“' + esc(i.message) + '”' : ''}</small></li>`).join('')}</ul>` : ''}</div>`;
    const acts = [];
    if (l.status === 'open') {
      acts.push(`<button class="pg-btn line" onclick="fkMarket.edit('${l.id}')">Edit</button>`);
      if (l.mode === 'donate') acts.push(`<button class="pg-btn line" onclick="fkMarket.convert('${l.id}')">Convert to sale</button>`);
      if (l.mode === 'sell') acts.push(`<button class="pg-btn solid" onclick="fkMarket.finish('${l.id}')">Mark as sold</button>`);
    }
    if (l.status === 'accepted') acts.push(`<button class="pg-btn solid" onclick="fkMarket.finish('${l.id}')">Mark completed</button>`);
    if (live) acts.push(`<button class="pg-btn line" onclick="fkMarket.cancel('${l.id}')">Cancel listing</button>`);
    return `<article class="mk-item ${soon ? 'soon' : ''} ${live ? '' : 'gone'}">
      <div class="mk-title">${esc(l.title)} ${tag(l.mode)} ${chipLS(l)}</div>
      <div class="mk-side">${l.mode === 'sell' ? `<span class="mk-price">${money(l.price)}</span>` : ''}</div>
      <div class="mk-meta"><span><b>${esc(l.qty)} ${esc(l.unit)}</b></span><span>${esc(CAT[l.category] || '')}</span><span>${l.expiry ? 'Best before ' + esc(l.expiry) + ' · ' + esc(expLabel(l.expiry)) : 'No expiry date'}</span>${l.note ? `<span>${esc(l.note)}</span>` : ''}</div>
      ${sub}${acts.length ? `<div class="mk-acts">${acts.join('')}</div>` : ''}</article>`;
  }

  // 发布 / 编辑表单（和列表分开渲染，列表刷新不会丢掉正在填的内容）
  function drawTop() {
    const top = $('mk-top'); if (!top) return;
    if (!formOpen) { top.innerHTML = `<div class="biz-actions"><button class="pg-btn solid" onclick="fkMarket.openForm()">+ New listing</button></div>`; return; }
    const l = editId ? data.mine.find(x => x.id === editId) : null, v = l || {};
    const convertMsg = editId && l && l.mode === 'donate' && formMode === 'sell' ? '<div class="biz-banner" style="margin-bottom:12px">Converting to a sale. Set a price below (0 means free collection by a buyer).</div>' : '';
    top.innerHTML = card(editId ? 'Edit listing' : 'New listing', `${convertMsg}
      <div class="auth-error" id="mk-err"></div>
      <div class="form-field"><div class="mk-seg" role="radiogroup" aria-label="Listing type">
        <label><input type="radio" name="mk-mode" value="donate" ${formMode === 'donate' ? 'checked' : ''}><span>Donate</span></label>
        <label><input type="radio" name="mk-mode" value="sell" ${formMode === 'sell' ? 'checked' : ''}><span>Sell</span></label></div></div>
      <div class="mk-form-grid">
        <div class="form-field w2"><label class="form-label" for="mk-title">What is it?</label><input class="form-input" id="mk-title" maxlength="120" placeholder="e.g. Day-old bread, 40 loaves" value="${esc(v.title || '')}"></div>
        <div class="form-field w2"><label class="form-label" for="mk-cat">Category</label><select class="form-input" id="mk-cat">${Object.entries(CAT).map(([k, t]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="form-field"><label class="form-label" for="mk-qty">Quantity</label><input class="form-input" id="mk-qty" type="number" min="0" step="any" value="${esc(v.qty ?? '')}"></div>
        <div class="form-field"><label class="form-label" for="mk-unit">Unit</label><select class="form-input" id="mk-unit">${UNITS.map(u => `<option ${v.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="form-field"><label class="form-label" for="mk-exp">Best before</label><input class="form-input" id="mk-exp" type="date" min="${today()}" value="${esc(v.expiry || '')}"></div>
        <div class="form-field" id="mk-price-f"><label class="form-label" for="mk-price">Price (RM)</label><input class="form-input" id="mk-price" type="number" min="0" step="0.01" value="${esc(v.price ?? '')}"></div>
        <div class="form-field w4"><label class="form-label" for="mk-note">Pickup details <span class="pg-muted">(optional, shown to the other side)</span></label><input class="form-input" id="mk-note" maxlength="200" placeholder="e.g. Back door, after 6pm" value="${esc(v.note || '')}"></div>
      </div>
      <div class="biz-actions"><button class="pg-btn solid" id="mk-save" onclick="fkMarket.save()">${editId ? 'Save changes' : 'Post listing'}</button><button class="pg-btn line" onclick="fkMarket.closeForm()">Cancel</button></div>
      <p class="pg-muted">Your contact details are only shared with the receiver who accepts a donation, or with the buyers you reply to.</p>`);
    const sync = () => { formMode = (document.querySelector('input[name="mk-mode"]:checked') || {}).value || 'donate'; $('mk-price-f').style.display = formMode === 'sell' ? '' : 'none'; };
    document.querySelectorAll('input[name="mk-mode"]').forEach(r => r.addEventListener('change', sync)); sync();
  }
  const formErr = m => { const e = $('mk-err'); if (!e) return; e.textContent = m; e.className = 'auth-error' + (m ? ' show' : ''); if (m) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  // ───────── Receiver / Buyer：告示板 ─────────
  function boardHtml() {
    const r = can('receiver'), b = can('buyer');
    if (!boardTab || (boardTab === 'donate' && !r) || (boardTab === 'sell' && !b)) boardTab = r ? 'donate' : 'sell';
    const tabs = r && b ? `<div class="pg-chips"><button class="pg-chip blue ${boardTab === 'donate' ? 'on' : ''}" onclick="fkMarket.tab('donate')">Donations (${data.donations.filter(live).length})</button><button class="pg-chip blue ${boardTab === 'sell' ? 'on' : ''}" onclick="fkMarket.tab('sell')">For sale (${data.sales.filter(live).length})</button></div>` : '';
    return `${errBox(['donations', 'sales'])}${tabs}${boardTab === 'donate' ? donationList() : saleList()}`;
  }
  const live = l => { const n = daysLeft(l.expiry); return n === null || n >= 0; };
  function donationList() {
    const mine = (A().business() || {}).district, list = data.donations.filter(live)
      .sort((a, b) => (b.district === mine) - (a.district === mine) || (daysLeft(a.expiry) ?? 999) - (daysLeft(b.expiry) ?? 999));
    if (!list.length) return empty(ic('hand'), `No open donations in ${esc((A().business() || {}).state || 'your state')} right now. New ones appear here as soon as sellers post them.`);
    return `<div class="mk-list">${list.map(l => {
      const near = l.district === mine, n = daysLeft(l.expiry);
      return `<article class="mk-item ${n !== null && n <= SOON_DAYS ? 'soon' : ''}"><div class="mk-title">${esc(l.title)} ${tag('donate')}</div><div class="mk-side"></div>
        <div class="mk-meta"><span><b>${esc(l.qty)} ${esc(l.unit)}</b></span><span>${esc(CAT[l.category] || '')}</span><span>From <b>${esc(l.orgName)}</b></span><span>${esc(l.district)}${near ? ' · your district' : ''}</span><span>${l.expiry ? 'Best before ' + esc(l.expiry) + ' · ' + esc(expLabel(l.expiry)) : ''}</span>${l.note ? `<span>${esc(l.note)}</span>` : ''}</div>
        <div class="mk-acts"><button class="pg-btn solid" onclick="fkMarket.accept('${l.id}')">Accept this donation</button></div></article>`;
    }).join('')}</div>`;
  }
  function saleList() {
    const st = (A().business() || {}).state, sent = new Set(data.interestsMine.map(i => i.listingId));
    const list = data.sales.filter(live).sort((a, b) => (b.state === st) - (a.state === st) || (daysLeft(a.expiry) ?? 999) - (daysLeft(b.expiry) ?? 999));
    if (!list.length) return empty(ic('recycle'), 'No items for sale right now. Check back soon.');
    return `<div class="mk-list">${list.map(l => `<article class="mk-item"><div class="mk-title">${esc(l.title)} ${tag('sell')}</div><div class="mk-side"><span class="mk-price">${money(l.price)}</span></div>
      <div class="mk-meta"><span><b>${esc(l.qty)} ${esc(l.unit)}</b></span><span>${esc(CAT[l.category] || '')}</span><span>From <b>${esc(l.orgName)}</b></span><span>${esc([l.district, l.state].filter(Boolean).join(', '))}</span><span>${l.expiry ? esc(expLabel(l.expiry)) : ''}</span>${l.note ? `<span>${esc(l.note)}</span>` : ''}</div>
      <div class="mk-acts">${sent.has(l.id) ? `<span class="st-chip green">Interest sent</span><button class="pg-btn line" onclick="fkMarket.withdraw('${l.id}__${uid()}')">Withdraw</button>` : `<button class="pg-btn solid" onclick="fkMarket.interest('${l.id}')">I am interested</button>`}</div></article>`).join('')}</div>`;
  }

  // ───────── Receiver / Buyer：我的活动 ─────────
  function dealsHtml() {
    let h = errBox(['pickups', 'interestsMine']);
    if (can('receiver')) {
      const list = data.pickups.slice().sort((a, b) => ts(b) - ts(a));
      list.filter(l => l.status === 'accepted' || l.status === 'completed').forEach(loadContact);
      h += `<h4 class="section-label">${can('buyer') ? 'Pickups' : 'Accepted donations'}</h4>` + (list.length ? `<div class="mk-list">${list.map(l => {
        const c = contacts[l.id], acts = l.status === 'accepted' ? `<button class="pg-btn solid" onclick="fkMarket.received('${l.id}')">Confirm received</button><button class="pg-btn line" onclick="fkMarket.handBack('${l.id}')">Hand back</button>` : '';
        return `<article class="mk-item ${l.status === 'accepted' ? '' : 'gone'}"><div class="mk-title">${esc(l.title)} ${tag('donate')} ${chipLS(l)}</div><div class="mk-side"></div>
          <div class="mk-meta"><span><b>${esc(l.qty)} ${esc(l.unit)}</b></span><span>From <b>${esc(l.orgName)}</b> · ${esc(l.district)}</span>${l.expiry ? `<span>Best before ${esc(l.expiry)}</span>` : ''}${l.note ? `<span>${esc(l.note)}</span>` : ''}</div>
          ${l.status === 'accepted' ? `<div class="mk-sub"><b>Contact the seller to arrange pickup</b><br>${c ? contactLine(c) : '<small>Loading contact…</small>'}</div>` : ''}${acts ? `<div class="mk-acts">${acts}</div>` : ''}</article>`;
      }).join('')}</div>` : empty(ic('inbox'), 'Nothing accepted yet. Donations you accept show up here.'));
    }
    if (can('buyer')) {
      const list = data.interestsMine.slice().sort((a, b) => ts(b) - ts(a));
      h += `<h4 class="section-label">${can('receiver') ? 'Buyer interests' : 'Your interests'}</h4>` + (list.length ? `<div class="mk-list">${list.map(i => `<article class="mk-item"><div class="mk-title">${esc(i.listingTitle || 'Listing')} ${tag('sell')}</div><div class="mk-side"></div>
        <div class="mk-meta"><span>Seller <b>${esc(i.ownerOrg || '')}</b></span>${i.message ? `<span>“${esc(i.message)}”</span>` : ''}</div>
        <div class="mk-sub"><small>The seller can see your contact details and will reach out to you.</small></div>
        <div class="mk-acts"><button class="pg-btn line" onclick="fkMarket.withdraw('${i.id}')">Withdraw interest</button></div></article>`).join('')}</div>` : empty(ic('recycle'), 'No interests yet. Browse the marketplace and tap “I am interested”.'));
    }
    return h;
  }
  function loadContact(l) {
    if (contacts[l.id] || loading.has(l.id)) return; loading.add(l.id);
    db.collection('listings').doc(l.id).collection('private').doc('ownerContact').get()
      .then(s => { contacts[l.id] = s.exists ? s.data() : { person: 'Not available' }; }).catch(e => { console.error(e); contacts[l.id] = { person: 'Not available' }; })
      .finally(() => { loading.delete(l.id); if (curView === 'biz-deals') paint(); });
  }

  // ───────── 动作 ─────────
  const guard = async (fn, fail) => {
    if (busy) return; busy = true;
    try { await fn(); } catch (e) { console.error(e); toast(e.message === 'taken' ? 'Someone else already accepted this donation.' : e.code === 'permission-denied' ? 'The server refused this. The item may have changed. Reload and try again.' : (fail || 'Something went wrong. Try again.'), 4200); }
    busy = false;
  };
  const upd = (id, patch) => db.collection('listings').doc(id).update({ ...patch, updatedAt: stamp() });

  const api = {
    nav, label, render, homeCard,
    tab(t) { boardTab = t; paint(); },
    openForm() { formOpen = true; editId = null; formMode = 'donate'; drawTop(); const t = $('mk-title'); if (t) t.focus(); },
    closeForm() { formOpen = false; editId = null; drawTop(); },
    edit(id) { const l = data.mine.find(x => x.id === id); if (!l) return; formOpen = true; editId = id; formMode = l.mode; drawTop(); $('mk-top').scrollIntoView({ behavior: 'smooth' }); },
    convert(id) {
      if (A().view() !== 'biz-mine') { window.bizGo('biz-mine'); }
      const l = data.mine.find(x => x.id === id); if (!l) return;
      formOpen = true; editId = id; formMode = 'sell'; drawTop(); $('mk-top').scrollIntoView({ behavior: 'smooth' });
    },
    save() {
      const g = id => ($(id) || {}).value || '', b = A().business();
      const title = g('mk-title').trim(), qty = parseFloat(g('mk-qty')), exp = g('mk-exp'), price = g('mk-price');
      if (!title) return formErr('Enter what you are offering.');
      if (!(qty > 0)) return formErr('Enter a quantity greater than 0.');
      if (!exp) return formErr('Choose a best-before date.');
      if (exp < today()) return formErr('That date has already passed.');
      if (formMode === 'sell' && (price === '' || !(parseFloat(price) >= 0))) return formErr('Enter a price (0 for free collection).');
      formErr('');
      const f = { mode: formMode, title, category: g('mk-cat'), qty, unit: g('mk-unit'), expiry: exp, price: formMode === 'sell' ? Math.round(parseFloat(price) * 100) / 100 : null, note: g('mk-note').trim() };
      guard(async () => {
        const u = uid();
        if (editId) await upd(editId, f);
        else {
          const ref = db.collection('listings').doc(), batch = db.batch(), c = b.contact || {};
          batch.set(ref, { ...f, ownerUid: u, orgName: b.orgName, state: b.state, district: b.district, status: 'open', acceptedUid: '', acceptedBy: null, createdAt: stamp(), updatedAt: stamp() });
          batch.set(ref.collection('private').doc('ownerContact'), { person: c.person || '', phone: c.phone || '', email: c.email || '' });
          await batch.commit();
        }
        toast(editId ? 'Listing updated' : 'Listing posted'); formOpen = false; editId = null; drawTop();
      }, 'Could not save the listing.');
    },
    cancel(id) { if (confirm('Cancel this listing? It disappears from the board.')) guard(async () => { await upd(id, { status: 'cancelled' }); toast('Listing cancelled'); }); },
    finish(id) { guard(async () => { await upd(id, { status: 'completed', completedAt: stamp() }); toast('Marked as completed'); }); },
    accept(id) {
      if (!confirm('Accept this donation? The seller will see your contact details and you arrange pickup together.')) return;
      guard(async () => {
        const b = A().business(), c = b.contact || {}, ref = db.collection('listings').doc(id);
        await db.runTransaction(async tx => {
          const s = await tx.get(ref);
          if (!s.exists || s.data().status !== 'open') throw new Error('taken');
          tx.update(ref, { status: 'accepted', acceptedUid: uid(), acceptedBy: { uid: uid(), orgName: b.orgName, person: c.person || '', phone: c.phone || '', email: c.email || '' }, updatedAt: stamp() });
        });
        toast('Accepted. Contact the seller to arrange pickup.', 4000);
      });
    },
    received(id) { guard(async () => { await upd(id, { status: 'completed', completedAt: stamp() }); toast('Thanks for confirming'); }); },
    handBack(id) { if (confirm('Hand this donation back to the board so another receiver can take it?')) guard(async () => { await upd(id, { status: 'open', acceptedUid: '', acceptedBy: null }); toast('Handed back'); }); },
    interest(id) {
      const l = data.sales.find(x => x.id === id), b = A().business(); if (!l || !b) return;
      const msg = prompt('Add a short message for the seller (optional):', ''); if (msg === null) return;
      guard(async () => {
        const c = b.contact || {};
        await db.collection('interests').doc(id + '__' + uid()).set({ listingId: id, listingTitle: l.title, ownerUid: l.ownerUid, ownerOrg: l.orgName, buyerUid: uid(), buyerOrg: b.orgName, contact: { person: c.person || '', phone: c.phone || '', email: c.email || '' }, message: msg.trim().slice(0, 300), createdAt: stamp() });
        toast('Interest sent. The seller will contact you.', 3600);
      }, 'Could not send your interest.');
    },
    withdraw(iid) { guard(async () => { await db.collection('interests').doc(iid).delete(); toast('Interest withdrawn'); }); }
  };
  window.fkMarket = api;

  // Business 首页上的入口卡片 + 临期提醒
  function homeCard() {
    const n = nav(); if (!n.length) return '';
    ensureWatches();
    const soon = data.mine.filter(l => l.mode === 'donate' && l.status === 'open' && daysLeft(l.expiry) !== null && daysLeft(l.expiry) <= SOON_DAYS);
    const warn = soon.length ? `<div class="mk-warn"><span aria-hidden="true">${ic('alert')}</span><div><b>${soon.length} donation${soon.length > 1 ? 's' : ''} close to expiry with no receiver</b>They may go to waste. You can convert them to a sale for food-recovery buyers.<br><button class="pg-btn solid" onclick="bizGo('biz-mine')">Review listings</button></div></div>` : '';
    const text = [can('seller') && 'post surplus food', can('receiver') && 'accept donations near you', can('buyer') && 'browse food-resource listings'].filter(Boolean).join(', ');
    return card('Food board', `<p class="pg-muted">Here you can ${text}. We match people; pickup and payment are arranged directly between you.</p>${warn}<div class="pg-actions">${n.map(([id, l]) => `<button class="pg-btn line" onclick="bizGo('${id}')">${l}</button>`).join('')}</div>`, 'tint-green');
  }
})();
