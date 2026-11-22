// account.js — 放在 purchase.js 后面加载（app.js → home.js → pages.js → purchase.js → account.js）
// 账号系统：Individual / Business 两种账号，同一套登录。
//   · 注册时选账号类型；老用户（没有 account 记录）一律当 Individual，个人数据原样保留
//   · Business = 一个组织档案，带 receiver / seller / buyer 三种能力（可多选）
//   · 验证状态：Draft → Pending Review → Verified / Rejected / Suspended（只有管理员能改成 Verified / Rejected / Suspended）
//   · Individual 可以随时申请 Business 档案，个人记录不受影响，两个工作区可以来回切换
// 数据：users/{uid}/data/account   账号类型
//       businesses/{uid}           组织档案 + 状态
//       businesses/{uid}/private/verification   注册号、文件、审核意见
// 只包装现有函数（switchTab / handleAuth / showSection / renderSidebar / navLabel / goHome / openPanel），不改 app.js。
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const num = v => String(v ?? '').trim();
  const fmtTs = t => { const d = t && t.toDate ? t.toDate() : t && t.seconds ? new Date(t.seconds * 1000) : null; return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'; };
  const kpi = (v, l) => `<div class="pg-kpi"><span class="pg-kpi-num">${v}</span><span class="pg-kpi-lbl">${l}</span></div>`;
  const card = (t, b, tint = '') => `<section class="pg-card ${tint}"><h4>${t}</h4>${b}</section>`;

  // ═════════ 0. 常量 ═════════
  const STATUS = {
    draft:          { label: 'Draft',          tone: 'blue'  },
    pending_review: { label: 'Pending Review', tone: 'amber' },
    verified:       { label: 'Verified',       tone: 'green' },
    rejected:       { label: 'Rejected',       tone: 'red'   },
    suspended:      { label: 'Suspended',      tone: 'red'   }
  };
  const STATUS_TEXT = {
    none:           'Set up your organisation profile to apply for verification.',
    draft:          'Your profile is a draft. Submit it for review when it is complete.',
    pending_review: 'Submitted. We are reviewing your details. The result will show here.',
    verified:       'Your organisation is verified. Your roles are active.',
    rejected:       'Your profile was not approved. Read the feedback, fix the details and submit again.',
    suspended:      'This organisation is suspended. Contact the Food Keeper team.'
  };
  const CAPS = {
    receiver: { label: 'Receiver', icon: '🤲', text: 'Browse donations, accept offers and confirm what you receive.' },
    seller:   { label: 'Seller',   icon: '🏪', text: 'Publish surplus food for donation or sale, and review interest.' },
    buyer:    { label: 'Buyer',    icon: '♻️', text: 'Browse commercial food-resource listings and express interest.' }
  };
  const ORG_TYPES = [
    ['Community receivers', [['orphanage', 'Orphanage', 'receiver'], ['elderly_home', 'Elderly care home', 'receiver'], ['charity', 'Charitable organisation', 'receiver'], ['community_inst', 'Other community institution', 'receiver']]],
    ['Sellers and suppliers', [['supermarket', 'Supermarket', 'seller'], ['restaurant', 'Restaurant or cafe', 'seller'], ['retailer', 'Food retailer', 'seller'], ['distributor', 'Food distributor', 'seller'], ['manufacturer', 'Food manufacturer', 'seller']]],
    ['Food recovery buyers', [['biogas', 'Biogas company', 'buyer'], ['waste_energy', 'Waste-to-energy company', 'buyer'], ['recovery', 'Other food recovery business', 'buyer'], ['gov_energy', 'Government-affiliated energy recovery organisation', 'buyer']]],
    ['Other', [['other', 'Other', '']]]
  ];
  const TYPE_LABEL = {}, TYPE_CAP = {};
  ORG_TYPES.forEach(([, items]) => items.forEach(([k, l, c]) => { TYPE_LABEL[k] = l; TYPE_CAP[k] = c; }));
  // 州 → 常见区（datalist 建议，可以自己输入别的）
  const MY = {
    'Johor': ['Batu Pahat', 'Johor Bahru', 'Kluang', 'Kota Tinggi', 'Kulai', 'Ledang', 'Mersing', 'Muar', 'Pontian', 'Segamat', 'Tangkak'],
    'Kedah': ['Baling', 'Bandar Baharu', 'Kota Setar', 'Kuala Muda', 'Kubang Pasu', 'Kulim', 'Langkawi', 'Padang Terap', 'Pendang', 'Pokok Sena', 'Sik', 'Yan'],
    'Kelantan': ['Bachok', 'Gua Musang', 'Jeli', 'Kota Bharu', 'Kuala Krai', 'Machang', 'Pasir Mas', 'Pasir Puteh', 'Tanah Merah', 'Tumpat'],
    'Melaka': ['Alor Gajah', 'Jasin', 'Melaka Tengah'],
    'Negeri Sembilan': ['Jelebu', 'Jempol', 'Kuala Pilah', 'Port Dickson', 'Rembau', 'Seremban', 'Tampin'],
    'Pahang': ['Bentong', 'Bera', 'Cameron Highlands', 'Jerantut', 'Kuantan', 'Lipis', 'Maran', 'Pekan', 'Raub', 'Rompin', 'Temerloh'],
    'Perak': ['Bagan Datuk', 'Batang Padang', 'Hilir Perak', 'Hulu Perak', 'Kampar', 'Kerian', 'Kinta', 'Kuala Kangsar', 'Larut, Matang dan Selama', 'Manjung', 'Muallim', 'Perak Tengah'],
    'Perlis': ['Kangar', 'Arau', 'Padang Besar'],
    'Pulau Pinang': ['Timur Laut', 'Barat Daya', 'Seberang Perai Utara', 'Seberang Perai Tengah', 'Seberang Perai Selatan'],
    'Sabah': ['Beaufort', 'Beluran', 'Keningau', 'Kinabatangan', 'Kota Belud', 'Kota Kinabalu', 'Kota Marudu', 'Kudat', 'Kunak', 'Lahad Datu', 'Papar', 'Penampang', 'Putatan', 'Ranau', 'Sandakan', 'Semporna', 'Sipitang', 'Tawau', 'Tenom', 'Tuaran'],
    'Sarawak': ['Bintulu', 'Betong', 'Kapit', 'Kuching', 'Lawas', 'Limbang', 'Miri', 'Mukah', 'Samarahan', 'Sarikei', 'Serian', 'Sibu', 'Sri Aman'],
    'Selangor': ['Gombak', 'Hulu Langat', 'Hulu Selangor', 'Klang', 'Kuala Langat', 'Kuala Selangor', 'Petaling', 'Sabak Bernam', 'Sepang'],
    'Terengganu': ['Besut', 'Dungun', 'Hulu Terengganu', 'Kemaman', 'Kuala Nerus', 'Kuala Terengganu', 'Marang', 'Setiu'],
    'W.P. Kuala Lumpur': ['Kuala Lumpur'],
    'W.P. Labuan': ['Labuan'],
    'W.P. Putrajaya': ['Putrajaya']
  };
  const MAX_DOCS = 5, MAX_DOC_BYTES = 5 * 1024 * 1024;

  // ═════════ 1. 状态 ═════════
  let accDoc = null, biz = null, ver = null;            // users/{uid}/data/account · businesses/{uid} · …/private/verification
  let seen = { acc: false, biz: false }, bizError = false;
  let isAdmin = false, ws = null, bizView = 'biz-home', pendingType = null, ready = false, failsafe = null;
  let unsubs = [];
  let form = null;                                      // 企业档案表单的临时状态（待上传的文件、Logo）
  let adminList = [], adminSel = null, adminFilter = 'pending_review', adminErr = '', unsubAdmin = null;
  let busy = false;

  const uidNow = () => (auth.currentUser || {}).uid;
  const accRef = uid => db.collection('users').doc(uid).collection('data').doc('account');
  const bizRef = uid => db.collection('businesses').doc(uid);
  const verRef = uid => db.collection('businesses').doc(uid).collection('private').doc('verification');
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();

  // 老用户没有 account 记录 → Individual；若已有企业档案却没有 account 记录（例如后台导入）→ Business
  const acctType = () => accDoc && accDoc.type ? accDoc.type : biz ? 'business' : (pendingType || 'individual');
  const bizStatus = () => biz ? (biz.status || 'draft') : 'none';
  const chip = s => s === 'none' ? '<span class="st-chip">No profile</span>' : `<span class="st-chip ${STATUS[s].tone}">${STATUS[s].label}</span>`;

  // 给以后的功能用：这个账号现在能不能以某个角色行动（必须是 Verified 且有这个能力）
  window.fkAccount = {
    type: acctType, business: () => biz, status: bizStatus,
    view: () => bizView, workspace: () => ws, refresh: () => { if (ready && ws === 'business') renderBiz(); },
    can: cap => !!biz && bizStatus() === 'verified' && (biz.capabilities || []).includes(cap)
  };

  // ═════════ 2. 注册页：账号类型 ═════════
  (function authScreen() {
    const emailField = $('auth-email').closest('.form-field');
    emailField.insertAdjacentHTML('beforebegin', `
      <div class="form-field" id="acct-type-field" style="display:none">
        <label class="form-label">Account type</label>
        <div class="acct-choice">
          <label class="acct-opt"><input type="radio" name="acct-type" value="individual" checked /><span><b>Individual</b><small>Track my pantry, shopping, waste and spending.</small></span></label>
          <label class="acct-opt"><input type="radio" name="acct-type" value="business" /><span><b>Business</b><small>An organisation that receives, sells or buys surplus food.</small></span></label>
        </div>
        <p class="acct-hint" id="acct-type-hint"></p>
      </div>`);
    const hint = () => { const b = (document.querySelector('input[name="acct-type"]:checked') || {}).value === 'business'; $('acct-type-hint').textContent = b ? 'After you create the account you will fill in your organisation details and send them for verification.' : ''; };
    document.querySelectorAll('input[name="acct-type"]').forEach(r => r.addEventListener('change', hint));

    const _switchTab = window.switchTab;
    window.switchTab = function (mode) { _switchTab(mode); $('acct-type-field').style.display = mode === 'register' ? '' : 'none'; };

    const _handleAuth = window.handleAuth;
    window.handleAuth = async function () {
      const registering = authMode === 'register';
      if (registering) pendingType = (document.querySelector('input[name="acct-type"]:checked') || {}).value || 'individual';
      try { await _handleAuth.apply(this, arguments); }
      finally {
        const u = auth.currentUser;
        if (registering && u) {
          try { await accRef(u.uid).set({ type: pendingType, createdAt: stamp() }); }
          catch (e) { console.error('account type not saved', e); toast('Could not save your account type. You can apply for a Business profile from Settings.', 5000); }
        }
        if (registering) pendingType = null;
      }
    };
  })();

  // ═════════ 3. 页面容器 + 外壳接线 ═════════
  $('app').insertAdjacentHTML('beforeend', `<div id="section-business" style="display:none"><main class="main"><div id="biz-root"></div></main></div>`);
  const pill = document.createElement('span');
  pill.id = 'acct-pill'; pill.className = 'acct-pill';
  $('user-email').parentNode.insertBefore(pill, $('user-email'));

  IC['biz-home'] = IC.home;
  IC['biz-profile'] = '<path d="M4 21V5l8-2v18"/><path d="M12 9l8 2v10"/><path d="M8 8v.01M8 12v.01M8 16v.01M16 15v.01M16 18v.01"/>';
  IC['biz-admin'] = '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>';
  IC.swap = '<path d="M7 7h12l-3-3M17 17H5l3 3"/>';
  const BIZ_LABEL = { 'biz-home': 'Business overview', 'biz-profile': 'Organisation profile', 'biz-admin': 'Verification review' };

  const _showSection = window.showSection;
  window.showSection = function (name) { _showSection(name); $('section-business').style.display = name === 'business' ? '' : 'none'; };

  const _navLabel = window.navLabel;
  const MK_VIEWS = ['biz-mine', 'biz-board', 'biz-deals'];
  window.navLabel = id => BIZ_LABEL[id] || (MK_VIEWS.includes(id) && window.fkMarket && window.fkMarket.label(id)) || _navLabel(id);

  const _goHome = window.goHome;
  window.goHome = function () { if (ws === 'business') bizGo(biz ? 'biz-home' : 'biz-profile'); else _goHome(); };

  const _renderSidebar = window.renderSidebar;
  window.renderSidebar = function () {
    _renderSidebar();
    const nav = $('sidebar'); if (!nav || !ws) return;
    const t = acctType(), bottom = nav.querySelector('.sb-bottom');
    if (ws === 'business') {
      const item = (v, l) => `<button class="nav-item" data-v="${v}" onclick="bizGo('${v}')">${ic(v)}<span>${esc(l || BIZ_LABEL[v])}</span></button>`;
      const mk = (window.fkMarket ? window.fkMarket.nav() : []).map(([v, l]) => item(v, l)).join('');
      const logo = biz && biz.logo ? `<img class="sb-org-logo" src="${esc(biz.logo)}" alt="" />` : '';
      nav.innerHTML = `
        <button class="sb-brand" onclick="goHome()" aria-label="Food Keeper"><svg viewBox="148 190 1252 480" aria-hidden="true"><use href="#fk-lockup"/></svg></button>
        <div class="sb-org">${logo}<div><b>${esc(biz ? biz.orgName : 'Your organisation')}</b>${chip(bizStatus())}</div></div>
        <div class="sb-group">${item('biz-home')}${mk}${item('biz-profile')}${isAdmin ? item('biz-admin') : ''}</div>
        <div class="sb-bottom">
          ${t === 'individual' ? `<button class="nav-item" onclick="setWorkspace('personal')">${ic('swap')}<span>Back to personal</span></button>` : ''}
          <button class="nav-item" onclick="openPanel()">${ic('settings')}<span>${esc(TRANSLATIONS[currentLang].homeSettings)}</span></button>
        </div>`;
      nav.dataset.ws = 'business';
      setNav(bizView);
    } else if (bottom && t === 'individual') {
      nav.dataset.ws = 'personal';
      bottom.insertAdjacentHTML('afterbegin', `<button class="nav-item" onclick="setWorkspace('business')">${ic('biz-profile')}<span>${biz ? 'Business workspace' : 'Apply for Business'}</span></button>`);
    }
  };

  // 设置面板里加一个「Account」区
  (function panel() {
    const body = document.querySelector('#panel-overlay .panel-body');
    body.insertAdjacentHTML('afterbegin', '<div id="acct-panel"></div>');
    const _openPanel = window.openPanel;
    window.openPanel = function () { renderPanel(); _openPanel(); };
  })();
  function renderPanel() {
    const t = acctType(), el = $('acct-panel'); if (!el) return;
    el.innerHTML = `<div class="section-label">Account</div>
      <div class="setting-row"><div><div class="setting-label">${t === 'business' ? 'Business account' : 'Individual account'}</div><div class="setting-desc">${esc(auth.currentUser ? auth.currentUser.email : '')}</div></div></div>
      ${biz ? `<div class="setting-row"><div><div class="setting-label">${esc(biz.orgName || 'Organisation')}</div><div class="setting-desc">${chip(bizStatus())}</div></div><button class="export-btn" onclick="closePanel(); setWorkspace('business')">Open</button></div>` : ''}
      ${t === 'individual' && !biz ? `<div class="setting-row"><div><div class="setting-label">Business profile</div><div class="setting-desc">Apply to receive, sell or buy surplus food as an organisation. Your personal records stay as they are.</div></div><button class="export-btn" onclick="closePanel(); setWorkspace('business')">Apply</button></div>` : ''}
      ${ws === 'business' && t === 'individual' ? `<div class="setting-row"><div><div class="setting-label">Personal workspace</div><div class="setting-desc">Pantry, shopping list, waste log and more.</div></div><button class="export-btn" onclick="closePanel(); setWorkspace('personal')">Switch</button></div>` : ''}
      <div style="height:18px"></div>`;
  }

  // ═════════ 4. 监听 + 工作区 ═════════
  function stopAll() {
    unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = [];
    if (unsubAdmin) { unsubAdmin(); unsubAdmin = null; }
    accDoc = biz = ver = null; seen = { acc: false, biz: false }; bizError = false; isAdmin = false; ws = null; ready = false; form = null;
    adminList = []; adminSel = null; busy = false;
    clearTimeout(failsafe); document.body.classList.remove('fk-acct-loading');
    $('acct-pill').textContent = ''; $('acct-pill').className = 'acct-pill';
    const sb = $('sidebar'); if (sb) sb.dataset.ws = '';
  }

  auth.onAuthStateChanged(user => {
    stopAll();
    if (!user) return;
    document.body.classList.add('fk-acct-loading');          // 先藏起来，等知道是哪种账号再显示，避免先闪出个人首页
    failsafe = setTimeout(() => { if (!ready) { seen.acc = seen.biz = true; maybeReady(); } }, 4000);
    unsubs.push(accRef(user.uid).onSnapshot(s => { accDoc = s.exists ? s.data() : null; seen.acc = true; onChange(); },
      e => { console.error('account listener', e); accDoc = null; seen.acc = true; onChange(); }));
    unsubs.push(bizRef(user.uid).onSnapshot(s => { biz = s.exists ? s.data() : null; bizError = false; seen.biz = true; onChange(); },
      e => { console.error('business listener', e); biz = null; bizError = true; seen.biz = true; onChange(); }));
    unsubs.push(verRef(user.uid).onSnapshot(s => { ver = s.exists ? s.data() : null; if (ready && ws === 'business' && bizView === 'biz-home') renderBiz(); }, () => { ver = null; }));
    user.getIdTokenResult().then(r => { isAdmin = !!(r.claims && r.claims.admin); if (ready) { renderSidebar(); if (ws === 'business' && bizView === 'biz-admin') renderBiz(); } }).catch(() => {});
  });

  function onChange() {
    if (!ready) return maybeReady();
    // 已经在用了：类型 / 状态变了就刷新界面，但不要把人从当前页面拽走
    if (ws === 'personal' && acctType() === 'business') return applyWs('business');
    renderPill(); renderSidebar();
    if (ws === 'business') {
      const typing = bizView === 'biz-profile' && form && form.rendered;       // 正在填表时不重画，免得丢掉输入
      if (!typing) renderBiz();
    }
  }
  function maybeReady() {
    if (ready || !(seen.acc && seen.biz)) return;
    ready = true; clearTimeout(failsafe);
    document.body.classList.remove('fk-acct-loading');
    const t = acctType(), saved = (() => { try { return localStorage.getItem('fk_ws_' + uidNow()); } catch (e) { return null; } })();
    applyWs(t === 'business' ? 'business' : (saved === 'business' && biz ? 'business' : 'personal'));
  }

  window.setWorkspace = w => { if (w === 'personal' && acctType() === 'business') return; applyWs(w); };
  function applyWs(w) {
    ws = w;
    try { localStorage.setItem('fk_ws_' + uidNow(), w); } catch (e) {}
    renderPill();
    if (w === 'business') { form = null; bizGo(biz ? 'biz-home' : 'biz-profile'); }
    else { renderSidebar(); _goHome(); setNav('home'); }
  }
  function renderPill() {
    const el = $('acct-pill'), t = acctType(), s = bizStatus();
    el.textContent = t === 'business' ? `Business · ${s === 'none' ? 'Setup' : STATUS[s].label}` : (biz ? 'Individual + Business' : 'Individual');
    el.className = 'acct-pill ' + (t === 'business' ? 'biz' : '');
  }

  window.bizGo = function (v) {
    if (v === 'biz-admin' && !isAdmin) v = 'biz-home';
    if (MK_VIEWS.includes(v) && !(window.fkMarket && window.fkMarket.nav().some(n => n[0] === v))) v = 'biz-home';
    if (v !== bizView || v === 'biz-profile') form = null;
    bizView = v; ws = 'business';
    showSection('business'); renderSidebar(); renderBiz(); window.scrollTo(0, 0);
  };
  function renderBiz() {
    const root = $('biz-root'); if (!root) return;
    if (bizView === 'biz-profile') renderForm(root);
    else if (bizView === 'biz-admin') renderAdmin(root);
    else if (MK_VIEWS.includes(bizView) && window.fkMarket) window.fkMarket.render(bizView, root);
    else renderHome(root);
  }

  // ═════════ 5. Business 首页 ═════════
  const hero = (tone, title, text, actions = '') => `<header class="pg-hero tone-${tone}"><div><h2>${title}</h2><p>${text}</p>${actions ? `<div class="pg-actions">${actions}</div>` : ''}</div>
    <div class="pg-art" aria-hidden="true"><svg viewBox="0 0 160 110" fill="none" stroke="var(--tone)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M30 98V34l50-14v78"/><path d="M80 44l50 12v42"/><path d="M20 98h120"/><path d="M48 50v.01M48 66v.01M48 82v.01M100 66v.01M100 82v.01" stroke="#F4D84A" stroke-width="4"/></svg></div></header>`;

  function checklist() {
    const f = biz || {}, c = f.contact || {};
    const items = [
      ['Organisation name, type and roles', !!(f.orgName && f.orgType && (f.capabilities || []).length)],
      ['State and district', !!(f.state && f.district)],
      ['Contact person, phone and email', !!(c.person && c.phone && c.email)],
      ['Organisation description', num(f.description).length >= 20],
      ['Registration or licence number', !!(ver && ver.regNo)],
      ['Supporting documents (recommended)', !!(ver && (ver.docs || []).length)]
    ];
    return `<ul class="biz-check">${items.map(([t, ok]) => `<li class="${ok ? 'ok' : ''}"><i>${ok ? '✓' : ''}</i>${t}</li>`).join('')}</ul>`;
  }

  function renderHome(root) {
    const s = bizStatus(), f = biz || {}, c = f.contact || {};
    if (bizError) {
      root.innerHTML = `<section class="pg-view">${card('Business data is not available', '<p class="pg-muted">Could not read the business profile. The Firestore rules probably do not allow the <b>businesses</b> collection yet. Publish the rules from <b>firestore.rules</b> and reload.</p>')}</section>`;
      return;
    }
    const review = ver && ver.review && ver.review.note ? ver.review : null;
    const act = {
      none: `<button class="pg-btn solid" onclick="bizGo('biz-profile')">Set up organisation profile</button>`,
      draft: `<button class="pg-btn solid" onclick="bizGo('biz-profile')">Continue profile</button>`,
      pending_review: `<button class="pg-btn line" onclick="bizGo('biz-profile')">View submission</button>`,
      verified: `<button class="pg-btn line" onclick="bizGo('biz-profile')">View profile</button>`,
      rejected: `<button class="pg-btn solid" onclick="bizGo('biz-profile')">Update and resubmit</button>`,
      suspended: ''
    }[s];
    const tone = { none: 'blue', draft: 'blue', pending_review: 'yellow', verified: 'green', rejected: 'yellow', suspended: 'yellow' }[s];
    const caps = (f.capabilities || []).length
      ? `<div class="biz-caps">${f.capabilities.map(k => `<div class="biz-cap ${window.fkAccount.can(k) ? 'on' : ''}"><span class="biz-cap-i">${CAPS[k].icon}</span><div><b>${CAPS[k].label}</b><p>${CAPS[k].text}</p></div><span class="pg-tag">${window.fkAccount.can(k) ? 'Active' : s === 'verified' ? 'Active' : 'After verification'}</span></div>`).join('')}</div>`
      : '<p class="pg-muted">No roles chosen yet. Pick at least one in your organisation profile.</p>';

    root.innerHTML = `<section class="pg-view pg-biz">
      ${hero(tone, f.orgName ? esc(f.orgName) : 'Welcome to Food Keeper for business.', `${chip(s)} &nbsp;${STATUS_TEXT[s]}`, act)}
      <section class="pg-strip">${kpi(s === 'none' ? '–' : STATUS[s].label, 'Verification status')}${kpi((f.capabilities || []).length || '–', 'Roles')}${kpi(f.state ? esc(f.state) : '–', f.district ? esc(f.district) : 'Region')}${kpi(fmtTs(f.submittedAt), 'Submitted')}</section>
      <div class="pg-body">
        <div class="pg-main">
          ${review ? card(s === 'rejected' ? 'Feedback from the review team' : 'Note from the review team', `<p>${esc(review.note)}</p><p class="pg-muted">${esc(review.by || '')}${review.at ? ' · ' + fmtTs({ seconds: review.at / 1000 }) : ''}</p>`, 'tint-yellow') : ''}
          ${window.fkMarket ? window.fkMarket.homeCard() : ''}
          ${card('Roles', caps)}
          ${biz ? card('Organisation', `<dl class="biz-dl"><dt>Type</dt><dd>${esc(TYPE_LABEL[f.orgType] || f.orgType || '–')}</dd><dt>Location</dt><dd>${esc([f.district, f.state].filter(Boolean).join(', ') || '–')}</dd><dt>Contact</dt><dd>${esc(c.person || '–')}${c.phone ? ' · ' + esc(c.phone) : ''}${c.email ? '<br>' + esc(c.email) : ''}</dd><dt>About</dt><dd>${esc(f.description || '–')}</dd></dl>`) : ''}
        </div>
        <aside class="pg-side">
          ${card('Verification checklist', checklist(), 'tint-green')}
          ${card('Your account', `<p class="pg-muted">One login for everything.${acctType() === 'individual' ? ' Your personal records are untouched. Use <b>Back to personal</b> in the menu to return to them.' : ''}</p>`)}
        </aside>
      </div>
    </section>`;
  }

  // ═════════ 6. 组织档案表单（注册后的 onboarding，也是以后的编辑页）═════════
  const SENS = ['name', 'type', 'cap', 'state', 'district', 'reg', 'docs'];   // Verified 以后要改这些 → 先退回 Draft 重新审核
  const sel = (id, opts, val, ph) => `<select class="form-input" id="${id}"><option value="">${ph}</option>${opts}</select>`;

  function renderForm(root) {
    const s = bizStatus(), f = biz || {}, c = f.contact || {}, v = ver || {};
    const locked = s === 'pending_review' || s === 'suspended';
    const verified = s === 'verified';
    if (!form) form = { docs: (v.docs || []).slice(), queue: [], removed: [], logo: undefined, rendered: false };
    const caps = f.capabilities || [];
    const dis = key => (locked || (verified && SENS.includes(key))) ? 'disabled' : '';
    const typeOpts = ORG_TYPES.map(([g, items]) => `<optgroup label="${g}">${items.map(([k, l]) => `<option value="${k}" ${f.orgType === k ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('');
    const stateOpts = Object.keys(MY).map(k => `<option ${f.state === k ? 'selected' : ''}>${k}</option>`).join('');
    const welcome = s === 'none';
    const note = locked
      ? (s === 'pending_review' ? 'This profile is being reviewed, so it is read-only. You can withdraw it to edit.' : 'This organisation is suspended, so the profile is read-only.')
      : verified ? 'You are verified. Contact details, description, address and logo can be edited freely. Changing the name, type, roles, region or registration details sends the profile back to Draft for review.'
      : s === 'rejected' ? 'Update the details the reviewer asked about, then submit again.' : '';
    const review = v.review && v.review.note && (s === 'rejected' || s === 'draft') ? `<div class="biz-note"><b>Feedback from the review team</b><p>${esc(v.review.note)}</p></div>` : '';
    const logoNow = form.logo === undefined ? (f.logo || '') : form.logo;

    root.innerHTML = `<section class="pg-view pg-biz">
      ${hero(welcome ? 'green' : 'blue', welcome ? 'Set up your organisation' : 'Organisation profile', welcome ? 'Tell us who you are. Save a draft any time, then submit it for verification when it is complete.' : `${chip(s)} &nbsp;${STATUS_TEXT[s]}`)}
      ${note ? `<div class="biz-banner">${note}</div>` : ''}${review}
      <div class="auth-error" id="bf-error"></div>
      <fieldset class="biz-form" ${locked ? 'disabled' : ''}>
        ${card('Organisation', `<div class="bf-grid">
          <div class="form-field bf-wide"><label class="form-label" for="bf-name">Organisation name</label><input class="form-input" id="bf-name" maxlength="120" value="${esc(f.orgName || '')}" ${dis('name')} /></div>
          <div class="form-field"><label class="form-label" for="bf-type">Organisation type</label>${sel('bf-type', typeOpts, f.orgType, 'Choose a type').replace('<select', `<select ${dis('type')}`)}</div>
          <div class="form-field"><label class="form-label">Roles <span class="pg-muted">(pick at least one)</span></label>
            <div class="bf-caps">${Object.entries(CAPS).map(([k, m]) => `<label class="bf-cap"><input type="checkbox" id="bf-cap-${k}" ${caps.includes(k) ? 'checked' : ''} ${dis('cap')} /> <span>${m.icon} ${m.label}</span></label>`).join('')}</div></div>
        </div>`)}
        ${card('Location', `<div class="bf-grid">
          <div class="form-field"><label class="form-label" for="bf-state">State</label>${sel('bf-state', stateOpts, f.state, 'Choose a state').replace('<select', `<select ${dis('state')}`)}</div>
          <div class="form-field"><label class="form-label" for="bf-district">District</label><input class="form-input" id="bf-district" list="bf-districts" value="${esc(f.district || '')}" placeholder="Choose or type" ${dis('district')} /><datalist id="bf-districts"></datalist></div>
          <div class="form-field bf-wide"><label class="form-label" for="bf-address">Address <span class="pg-muted">(optional)</span></label><textarea class="form-input" id="bf-address" rows="2" maxlength="300">${esc(f.address || '')}</textarea>
            <label class="bf-check"><input type="checkbox" id="bf-showaddr" ${f.showAddress ? 'checked' : ''} /> Show this address on my public profile once I am verified</label></div>
        </div>`)}
        ${card('Contact', `<div class="bf-grid">
          <div class="form-field"><label class="form-label" for="bf-person">Contact person</label><input class="form-input" id="bf-person" maxlength="80" value="${esc(c.person || '')}" /></div>
          <div class="form-field"><label class="form-label" for="bf-phone">Phone</label><input class="form-input" id="bf-phone" type="tel" maxlength="20" placeholder="+60 12-345 6789" value="${esc(c.phone || '')}" /></div>
          <div class="form-field"><label class="form-label" for="bf-email">Contact email</label><input class="form-input" id="bf-email" type="email" maxlength="120" value="${esc(c.email || (auth.currentUser ? auth.currentUser.email : ''))}" /></div>
          <div class="form-field"><label class="form-label" for="bf-web">Website <span class="pg-muted">(optional)</span></label><input class="form-input" id="bf-web" maxlength="160" placeholder="https://" value="${esc(c.website || '')}" /></div>
        </div>`)}
        ${card('About', `<div class="form-field"><label class="form-label" for="bf-desc">Organisation description</label><textarea class="form-input" id="bf-desc" rows="4" maxlength="800" placeholder="What does your organisation do, and who do you serve?">${esc(f.description || '')}</textarea></div>
          <div class="form-field"><label class="form-label">Logo <span class="pg-muted">(optional)</span></label>
            <div class="bf-logo"><div class="bf-logo-box" id="bf-logo-box">${logoNow ? `<img src="${esc(logoNow)}" alt="Logo" />` : '<span class="pg-muted">None</span>'}</div>
              <div><input type="file" id="bf-logo-file" accept="image/png,image/jpeg,image/webp" /> ${logoNow ? '<button type="button" class="ghost-btn" id="bf-logo-rm">Remove</button>' : ''}<p class="pg-muted">Shrunk to fit automatically.</p></div></div></div>`)}
        ${card('Verification', `<div class="form-field"><label class="form-label" for="bf-reg">Registration or licence number</label><input class="form-input" id="bf-reg" maxlength="80" placeholder="e.g. SSM number, or ROS / JKM registration" value="${esc(v.regNo || '')}" ${dis('reg')} /></div>
          <div class="form-field"><label class="form-label">Supporting documents <span class="pg-muted">(PDF, JPG or PNG, up to ${MAX_DOCS} files of 5 MB)</span></label>
            <ul class="bf-docs" id="bf-docs"></ul>
            <input type="file" id="bf-docs-file" accept="application/pdf,image/png,image/jpeg" multiple ${dis('docs')} />
            <p class="pg-muted">Only you and the review team can see these files.</p></div>`, 'tint-yellow')}
      </fieldset>
      <div class="biz-actions" id="bf-actions"></div>
    </section>`;
    form.rendered = true;

    const fillDistricts = () => { const st = $('bf-state').value; $('bf-districts').innerHTML = (MY[st] || []).map(d => `<option value="${esc(d)}">`).join(''); };
    fillDistricts();
    $('bf-state').addEventListener('change', () => { $('bf-district').value = ''; fillDistricts(); });
    // 选类型 → 如果还没勾任何角色，就帮忙勾上最常见的那个
    $('bf-type').addEventListener('change', () => {
      const cap = TYPE_CAP[$('bf-type').value];
      if (cap && !Object.keys(CAPS).some(k => $('bf-cap-' + k).checked) && !$('bf-cap-' + cap).disabled) $('bf-cap-' + cap).checked = true;
    });
    $('bf-logo-file').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try { form.logo = await toLogo(file); $('bf-logo-box').innerHTML = `<img src="${esc(form.logo)}" alt="Logo" />`; showFormErr(''); }
      catch (err) { showFormErr(err.message || 'Could not read that image.'); e.target.value = ''; }
    });
    const rm = $('bf-logo-rm'); if (rm) rm.addEventListener('click', () => { form.logo = ''; $('bf-logo-box').innerHTML = '<span class="pg-muted">None</span>'; rm.remove(); });
    $('bf-docs-file').addEventListener('change', e => {
      const files = [...e.target.files];
      for (const file of files) {
        if (form.docs.length + form.queue.length >= MAX_DOCS) { showFormErr(`You can attach up to ${MAX_DOCS} documents.`); break; }
        if (file.size > MAX_DOC_BYTES) { showFormErr(`${file.name} is larger than 5 MB.`); continue; }
        if (!/^(application\/pdf|image\/(png|jpeg))$/.test(file.type)) { showFormErr(`${file.name} is not a PDF, JPG or PNG.`); continue; }
        form.queue.push(file);
      }
      e.target.value = ''; renderDocs();
    });
    $('bf-docs').addEventListener('click', e => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      const [kind, i] = b.dataset.rm.split(':');
      if (kind === 'q') form.queue.splice(+i, 1); else form.removed.push(form.docs.splice(+i, 1)[0]);
      renderDocs();
    });
    renderDocs(); renderActions();
  }

  function renderDocs() {
    const ul = $('bf-docs'); if (!ul) return;
    const canEdit = !$('bf-docs-file').disabled;
    const row = (name, meta, key) => `<li><span class="bf-doc-n">📄 ${esc(name)}</span><small>${meta}</small>${canEdit ? `<button type="button" class="icon-btn" data-rm="${key}" aria-label="Remove ${esc(name)}">✕</button>` : ''}</li>`;
    ul.innerHTML = form.docs.map((d, i) => row(d.name, `${Math.max(1, Math.round((d.size || 0) / 1024))} KB · saved`, 'd:' + i)).join('') +
      form.queue.map((f, i) => row(f.name, `${Math.max(1, Math.round(f.size / 1024))} KB · will upload on save`, 'q:' + i)).join('') ||
      '<li class="pg-muted">No documents attached.</li>';
  }

  function renderActions() {
    const s = bizStatus(), el = $('bf-actions'); if (!el) return;
    const b = (id, cls, t) => `<button type="button" class="pg-btn ${cls}" id="${id}">${t}</button>`;
    let h = '';
    if (s === 'pending_review') h = b('bf-withdraw', 'line', 'Withdraw submission');
    else if (s === 'suspended') h = '';
    else if (s === 'verified') h = b('bf-save-min', 'solid', 'Save changes') + b('bf-reopen', 'line', 'Edit all details (needs re-review)');
    else h = b('bf-submit', 'solid', 'Submit for review') + b('bf-draft', 'line', 'Save draft') + (s === 'none' ? b('bf-later', 'line', 'Finish later') : '');
    el.innerHTML = h;
    const on = (id, fn) => { const x = $(id); if (x) x.addEventListener('click', fn); };
    on('bf-submit', () => saveBusiness(true)); on('bf-draft', () => saveBusiness(false));
    on('bf-save-min', saveMinor); on('bf-reopen', reopenAll); on('bf-withdraw', withdraw);
    on('bf-later', () => { form = null; bizGo('biz-home'); });
  }

  function showFormErr(m) { const e = $('bf-error'); if (!e) return; e.textContent = m; e.className = 'auth-error' + (m ? ' show' : ''); if (m) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const setBusy = (on, label) => { busy = on; document.querySelectorAll('#bf-actions button').forEach(b => { b.disabled = on; }); if (label && $('bf-actions')) { const first = $('bf-actions').querySelector('.solid'); if (first && on) first.dataset.t = first.textContent, first.textContent = label; } if (!on) renderActions(); };

  function readForm() {
    const v = id => { const e = $(id); return e ? e.value.trim() : ''; };
    return {
      orgName: v('bf-name'), orgType: v('bf-type'), capabilities: Object.keys(CAPS).filter(k => $('bf-cap-' + k).checked),
      state: v('bf-state'), district: v('bf-district'), address: v('bf-address'), showAddress: $('bf-showaddr').checked,
      contact: { person: v('bf-person'), phone: v('bf-phone'), email: v('bf-email'), website: v('bf-web') },
      description: v('bf-desc'), regNo: v('bf-reg')
    };
  }
  function validate(d, submit) {
    if (!d.orgName) return 'Enter your organisation name.';
    if (d.contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contact.email)) return 'That contact email does not look right.';
    if (d.contact.website && !/^https?:\/\/\S+\.\S+/.test(d.contact.website)) return 'Start the website with http:// or https://.';
    if (!submit) return '';
    if (!d.orgType) return 'Choose your organisation type.';
    if (!d.capabilities.length) return 'Pick at least one role: Receiver, Seller or Buyer.';
    if (!d.state) return 'Choose your state.';
    if (!d.district) return 'Enter your district.';
    if (!d.contact.person) return 'Enter a contact person.';
    if (!/^\+?[\d\s\-()]{8,18}$/.test(d.contact.phone) || d.contact.phone.replace(/\D/g, '').length < 8) return 'Enter a valid phone number.';
    if (!d.contact.email) return 'Enter a contact email.';
    if (d.description.length < 20) return 'Describe your organisation in at least 20 characters.';
    if (!d.regNo) return 'Enter your registration or licence number.';
    return '';
  }

  const mainDoc = (d, uid) => ({
    ownerUid: uid, ownerEmail: auth.currentUser.email || '',
    orgName: d.orgName, orgType: d.orgType, capabilities: d.capabilities, state: d.state, district: d.district,
    address: d.address, showAddress: d.showAddress, contact: d.contact, description: d.description,
    logo: form.logo === undefined ? ((biz && biz.logo) || '') : form.logo, updatedAt: stamp()
  });

  // Individual 第一次申请 Business 时，先把「我是 Individual」明确写下来，之后不会被误判成 Business 账号
  async function ensureAccountDoc(uid) {
    if (accDoc) return;
    await accRef(uid).set({ type: acctType() === 'business' ? 'business' : 'individual', createdAt: stamp() }, { merge: true });
  }

  async function uploadDocs(uid) {
    if (!form.queue.length) return [];
    if (typeof firebase.storage !== 'function') throw new Error('File upload is not available right now. Remove the files and save, or try again later.');
    const st = firebase.storage(), out = [];
    for (const file of form.queue) {
      const path = `businesses/${uid}/docs/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
      await st.ref(path).put(file, { contentType: file.type });
      out.push({ name: file.name, path, size: file.size, contentType: file.type });
    }
    return out;
  }

  async function saveBusiness(submit) {
    if (busy) return;
    const uid = uidNow(), d = readForm(), err = validate(d, submit);
    if (err) return showFormErr(err);
    if (submit && !confirm('Submit your organisation for review? It becomes read-only while it is being reviewed, and you can withdraw it at any time.')) return;
    showFormErr(''); setBusy(true, submit ? 'Submitting…' : 'Saving…');
    try {
      await ensureAccountDoc(uid);
      const s = bizStatus();
      // 步骤 A：保存档案（一律先存成 Draft；Rejected 也在这里回到 Draft）
      if (s === 'none') await bizRef(uid).set({ ...mainDoc(d, uid), status: 'draft', createdAt: stamp() });
      else await bizRef(uid).update({ ...mainDoc(d, uid), status: 'draft' });
      // 步骤 B：验证资料（注册号 + 文件）
      let newDocs = [];
      try { newDocs = await uploadDocs(uid); } catch (e) { console.error(e); showFormErr(e.message && !/storage\//.test(e.message) ? e.message : 'The documents could not be uploaded. Your details are saved. Check that Firebase Storage is enabled, then try again.'); setBusy(false); form.queue = []; form.rendered = false; return; }
      const docs = form.docs.concat(newDocs);
      await verRef(uid).set({ regNo: d.regNo, docs }, { merge: true });
      if (typeof firebase.storage === 'function') form.removed.forEach(x => firebase.storage().ref(x.path).delete().catch(() => {}));
      // 步骤 C：提交审核
      if (submit) await bizRef(uid).update({ status: 'pending_review', submittedAt: stamp(), updatedAt: stamp() });
      form = null; busy = false;
      toast(submit ? 'Submitted for review' : 'Draft saved');
      bizGo(submit ? 'biz-home' : 'biz-profile');
    } catch (e) {
      console.error(e);
      busy = false; renderActions();
      showFormErr(e.code === 'permission-denied' ? 'The server refused this change. If you just edited a verified or pending profile, reload and try again. Otherwise publish the latest firestore.rules.' : 'Could not save. Check your connection and try again.');
    }
  }

  async function saveMinor() {      // Verified：只改联系方式 / 简介 / 地址 / Logo
    if (busy) return;
    const uid = uidNow(), d = readForm(), err = validate(d, false);
    if (err) return showFormErr(err);
    if (!d.contact.person || !d.contact.phone || !d.contact.email || d.description.length < 20) return showFormErr('Contact person, phone, email and a description of at least 20 characters are required.');
    busy = true; showFormErr('');
    try {
      await bizRef(uid).update({ contact: d.contact, description: d.description, address: d.address, showAddress: d.showAddress, logo: form.logo === undefined ? (biz.logo || '') : form.logo, updatedAt: stamp() });
      form = null; busy = false; toast('Changes saved'); bizGo('biz-profile');
    } catch (e) { console.error(e); busy = false; showFormErr('Could not save. Try again.'); }
  }
  async function reopenAll() {
    if (!confirm('Edit all details? Your profile goes back to Draft and loses its Verified status until it is reviewed again.')) return;
    try { await bizRef(uidNow()).update({ status: 'draft', updatedAt: stamp() }); form = null; toast('Back to Draft'); bizGo('biz-profile'); }
    catch (e) { console.error(e); showFormErr('Could not change the status. Try again.'); }
  }
  async function withdraw() {
    if (!confirm('Withdraw this submission and go back to editing?')) return;
    try { await bizRef(uidNow()).update({ status: 'draft', updatedAt: stamp() }); form = null; toast('Submission withdrawn'); bizGo('biz-profile'); }
    catch (e) { console.error(e); showFormErr('Could not withdraw. Try again.'); }
  }

  // Logo：缩到 256px 以内、转成很小的 data URL，直接存在档案里（不需要 Storage）
  function toLogo(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Use a PNG, JPG or WebP image.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('That image is larger than 5 MB.'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Could not read that image.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read that image.'));
        img.onload = () => {
          const k = Math.min(1, 256 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          let out = c.toDataURL('image/png');
          if (out.length > 150000) out = c.toDataURL('image/jpeg', 0.8);
          if (out.length > 200000) return reject(new Error('That image is too detailed. Try a simpler one.'));
          resolve(out);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ═════════ 7. 管理员审核（只有带 admin 声明的账号才看得到；真正的权限由 Firestore 规则把关）═════════
  function renderAdmin(root) {
    if (!unsubAdmin) {
      unsubAdmin = db.collection('businesses').orderBy('updatedAt', 'desc').onSnapshot(
        snap => { adminList = snap.docs.map(d => ({ uid: d.id, ...d.data() })); adminErr = ''; if (bizView === 'biz-admin' && ready) drawAdmin($('biz-root')); },
        e => { console.error('admin list', e); adminErr = 'Could not load organisations. Your account needs the admin permission, and the firestore.rules must be published.'; if (bizView === 'biz-admin') drawAdmin($('biz-root')); });
    }
    drawAdmin(root);
  }
  function drawAdmin(root) {
    if (!root || bizView !== 'biz-admin') return;
    const rows = adminList.filter(b => adminFilter === 'all' || (b.status || 'draft') === adminFilter);
    const counts = k => adminList.filter(b => (b.status || 'draft') === k).length;
    const cur = adminSel ? adminList.find(b => b.uid === adminSel) : null;
    root.innerHTML = `<section class="pg-view pg-biz">
      ${hero('blue', 'Verification review', 'Approve, reject or suspend organisation profiles. Rejections and suspensions need a note the organisation can read.')}
      ${adminErr ? `<div class="auth-error show">${esc(adminErr)}</div>` : ''}
      <div class="pg-chips">${[['pending_review', 'Pending Review'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['suspended', 'Suspended'], ['draft', 'Draft'], ['all', 'All']].map(([k, l]) => `<button class="pg-chip blue ${adminFilter === k ? 'on' : ''}" onclick="adminFilterSet('${k}')">${l}${k === 'all' ? '' : ` (${counts(k)})`}</button>`).join('')}</div>
      <div class="pg-body"><div class="pg-main">
        ${rows.length ? rows.map(b => `<button class="adm-row ${b.uid === adminSel ? 'on' : ''}" onclick="adminPick('${b.uid}')"><span class="pg-grow"><b>${esc(b.orgName || '(no name)')}</b><small>${esc(TYPE_LABEL[b.orgType] || '')} · ${esc([b.district, b.state].filter(Boolean).join(', '))} · ${(b.capabilities || []).map(k => CAPS[k] ? CAPS[k].label : k).join(', ')}</small></span>${chip(b.status || 'draft')}</button>`).join('') : '<div class="empty"><div class="empty-icon">🗂️</div><p>Nothing in this list.</p></div>'}
      </div><aside class="pg-side" id="adm-side">${cur ? '<p class="pg-muted">Loading…</p>' : card('Details', '<p class="pg-muted">Pick an organisation to review it.</p>')}</aside></div></section>`;
    if (cur) drawAdminDetail(cur);
  }
  window.adminFilterSet = k => { adminFilter = k; adminSel = null; drawAdmin($('biz-root')); };
  window.adminPick = uid => { adminSel = uid; drawAdmin($('biz-root')); };

  async function drawAdminDetail(b) {
    const side = $('adm-side'); if (!side) return;
    let v = {}; try { const s = await verRef(b.uid).get(); v = s.exists ? s.data() : {}; } catch (e) { console.error(e); }
    if (adminSel !== b.uid || !$('adm-side')) return;
    const c = b.contact || {}, st = b.status || 'draft';
    const docs = (v.docs || []).map((d, i) => `<li><a href="#" data-doc="${esc(d.path)}" class="adm-doc">📄 ${esc(d.name)}</a></li>`).join('') || '<li class="pg-muted">No documents.</li>';
    $('adm-side').innerHTML = card(esc(b.orgName || 'Organisation'), `${chip(st)}
      <dl class="biz-dl"><dt>Type</dt><dd>${esc(TYPE_LABEL[b.orgType] || b.orgType || '–')}</dd><dt>Roles</dt><dd>${(b.capabilities || []).map(k => CAPS[k] ? CAPS[k].label : k).join(', ') || '–'}</dd>
      <dt>Region</dt><dd>${esc([b.district, b.state].filter(Boolean).join(', ') || '–')}</dd><dt>Contact</dt><dd>${esc(c.person || '–')} · ${esc(c.phone || '')}<br>${esc(c.email || '')}${c.website ? '<br>' + esc(c.website) : ''}</dd>
      <dt>Registration</dt><dd>${esc(v.regNo || '–')}</dd><dt>Submitted</dt><dd>${fmtTs(b.submittedAt)}</dd><dt>About</dt><dd>${esc(b.description || '–')}</dd></dl>
      <h5>Documents</h5><ul class="bf-docs adm-docs">${docs}</ul>
      ${v.review && v.review.note ? `<p class="pg-muted">Last note: ${esc(v.review.note)}</p>` : ''}
      <textarea class="form-input" id="adm-note" rows="3" placeholder="Note to the organisation (required to reject or suspend)"></textarea>
      <div class="adm-actions">
        <button class="pg-btn solid" onclick="adminSet('verified')">Approve</button>
        <button class="pg-btn line" onclick="adminSet('rejected')">Reject</button>
        <button class="pg-btn line" onclick="adminSet('suspended')">Suspend</button>
        ${st !== 'pending_review' ? '<button class="pg-btn line" onclick="adminSet(\'pending_review\')">Back to review</button>' : ''}
      </div>`);
    $('adm-side').querySelectorAll('.adm-doc').forEach(a => a.addEventListener('click', async e => {
      e.preventDefault();
      try { window.open(await firebase.storage().ref(a.dataset.doc).getDownloadURL(), '_blank', 'noopener'); } catch (err) { console.error(err); toast('Could not open that file.'); }
    }));
  }
  window.adminSet = async function (status) {
    if (busy || !adminSel) return;
    const note = ($('adm-note') || {}).value ? $('adm-note').value.trim() : '';
    if ((status === 'rejected' || status === 'suspended') && !note) { toast('Write a note first so the organisation knows why.'); return; }
    busy = true;
    try {
      const batch = db.batch(), u = auth.currentUser;
      batch.update(bizRef(adminSel), { status, reviewedAt: stamp(), reviewedBy: u.uid, ...(status === 'verified' ? { verifiedAt: stamp() } : {}), updatedAt: stamp() });
      batch.set(verRef(adminSel), { review: { note, by: u.email || u.uid, at: Date.now(), status } }, { merge: true });
      await batch.commit();
      toast('Status set to ' + STATUS[status].label);
    } catch (e) { console.error(e); toast('Could not update the status.'); }
    busy = false;
    drawAdmin($('biz-root'));
  };
})();
