// ── 侧边栏 ──
const NAV_MAIN      = ['home', 'pantry', 'shopping', 'recipes', 'receipt', 'waste'];
const NAV_COMMUNITY = ['leaderboard', 'awareness', 'quiz'];

const NAV_EN = { pantry: 'Pantry Tracker', recipes: 'AI Recipes', receipt: 'Receipt Scanner' };

function navLabel(id) {
  const t = TRANSLATIONS[currentLang];
  if (id === 'home') return stripLead(t.backHome);
  if (currentLang === 'en' && NAV_EN[id]) return NAV_EN[id];
  return stripLead(t[id]);   // 去掉原来的 emoji
}

function navBtn(id) {
  const act = id === 'home' ? 'goHome()' : `switchView('${id}')`;
  return `<button class="nav-item" data-v="${id}" onclick="${act}">${ic(id)}<span>${esc(navLabel(id))}</span></button>`;
}

function renderSidebar() {
  const app = document.getElementById('app');
  if (!app) return;
  let nav = document.getElementById('sidebar');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'sidebar';
    nav.setAttribute('aria-label', 'Main');
    app.insertBefore(nav, app.firstChild);
  }
  const t = TRANSLATIONS[currentLang];
  nav.innerHTML = `
    <button class="sb-brand" onclick="goHome()" aria-label="Food Keeper"><svg viewBox="148 190 1252 480" aria-hidden="true"><use href="#fk-lockup"/></svg></button>
    <div class="sb-group">${NAV_MAIN.map(navBtn).join('')}</div>
    <div class="sb-divider"></div>
    <div class="sb-label">Community</div>
    <div class="sb-group">${NAV_COMMUNITY.map(navBtn).join('')}</div>
    <div class="sb-bottom">
      <button class="nav-item" onclick="openPanel()">${ic('settings')}<span>${esc(t.homeSettings)}</span></button>
    </div>`;
  setNav(currentView || 'home');
}

function setNav(v) {
  const pt = document.getElementById('page-title');
  if (pt) pt.textContent = navLabel(v);
  document.querySelectorAll('#sidebar .nav-item[data-v]').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

// ── 首页 ──
function topWasteWeeks(n) {
  const year = new Date().getFullYear(), weeks = {};
  wasteLog.forEach(w => {
    if (!w.date) return;
    const d = new Date(w.date);
    if (d.getFullYear() !== year) return;
    const k = getWeekNumber(d);
    weeks[k] = (weeks[k] || 0) + (w.price || 0);
  });
  return Object.entries(weeks).map(([week, amount]) => ({ week, amount }))
    .sort((a, b) => b.amount - a.amount).slice(0, n);
}

function renderHome() {
  const el = document.getElementById('home-dashboard');
  if (!el || !currentUser) return;

  const soon    = foods.filter(f => { const d = daysLeft(f.expiry); return d >= 0 && d <= notifDays; });
  const expired = foods.filter(f => daysLeft(f.expiry) < 0);
  const mk      = today().slice(0, 7);
  const waste   = wasteLog.filter(w => w.date?.startsWith(mk)).reduce((s, w) => s + (w.price || 0), 0);
  const preview = [...foods].sort((a, b) => new Date(a.expiry) - new Date(b.expiry)).slice(0, 5);
  const lb      = topWasteWeeks(3);

  const rows = preview.length ? preview.map(f => {
    const b = badgeInfo(daysLeft(f.expiry));
    return `<li class="pv-row">
      <span class="pv-emoji" aria-hidden="true">${esc(f.emoji || '🍽️')}</span>
      <span class="pv-name">${esc(f.name)}${f.qty ? `<small>${esc(f.qty)}</small>` : ''}</span>
      <span class="pv-loc">${LOC_LABEL[f.location] || ''}</span>
      <span class="badge ${b.cls}">${b.text}</span></li>`;
  }).join('') : `<li class="hd-empty">Nothing stored yet. Add your first ingredient to see it here.</li>`;

  el.innerHTML = `
  <section class="hd-hero">
    <div class="hd-hero-text">
      <h2>Make every ingredient count.</h2>
      <p>Know what you have. Use what you need. Waste less food.</p>
      <div class="hd-cta">
        <button class="hd-btn solid" onclick="switchView('pantry')">View my pantry</button>
        <button class="hd-btn line" onclick="switchView('recipes')">Explore recipes</button>
      </div>
    </div>
    <svg class="hd-art" viewBox="0 0 240 150" fill="none" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <path d="M20 128h200" stroke="var(--accent)"/>
      <circle cx="62" cy="96" r="30" stroke="var(--accent)"/><path d="M62 66c0-10 6-16 14-18" stroke="var(--accent)"/>
      <path d="M104 128V70c0-8 6-14 14-14h6c8 0 14 6 14 14v58" stroke="#4C91D8"/><path d="M104 88h34" stroke="#4C91D8"/>
      <path d="M160 128c-6-30 4-62 40-76-2 36-14 62-40 76z" stroke="var(--accent)"/><path d="M160 128c10-22 20-38 34-52" stroke="var(--accent)"/>
      <path d="M176 22l6 12M194 16l-2 14M210 26l-10 8" stroke="#F4D84A" stroke-width="3.4"/>
    </svg>
  </section>

  <section class="hd-overview" aria-label="Kitchen overview">
    <div class="ov-big"><span class="ov-num">${foods.length}</span><span class="ov-lbl">Total ingredients</span></div>
    <div class="ov-warn ${soon.length ? 'on' : ''}"><strong>${soon.length}</strong> expiring within ${notifDays} days${soon.length ? ': ' + esc(soon.slice(0, 2).map(f => f.name).join(', ')) + (soon.length > 2 ? '…' : '') : ''}</div>
    <div class="ov-side"><span><strong>${expired.length}</strong> expired</span><span><strong>RM ${waste.toFixed(2)}</strong> wasted this month</span></div>
  </section>

  <div class="hd-work">
    <section class="hd-pantry">
      <header><h3>${ic('pantry')} Pantry, soonest to expire first</h3><button class="hd-link" onclick="switchView('pantry')">Open pantry</button></header>
      <ul class="pv-list">${rows}</ul>
    </section>
    <section class="hd-recipe">
      <h3>${ic('recipes')} AI Recipe Assistant</h3>
      <p>${foods.length ? 'Builds a zero-waste menu from the items that expire within 7 days.' : 'Add a few ingredients first, then let the assistant plan a menu around them.'}</p>
      <button class="hd-btn blue" onclick="switchView('recipes'); generateAICustomMenu()">Generate menu from my pantry</button>
    </section>
  </div>

  <div class="hd-quick" role="group" aria-label="Quick actions">
    <button onclick="switchView('pantry'); openModal()">${ic('add')}Add ingredient</button>
    <button onclick="switchView('shopping')">${ic('shopping')}Shopping list</button>
    <button onclick="switchView('receipt')">${ic('receipt')}Scan receipt</button>
    <button onclick="switchView('waste')">${ic('waste')}Waste log</button>
  </div>

  <div class="hd-explore">
    <article class="ex-aware">
      <svg class="ex-art" viewBox="0 0 48 48" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="22" cy="26" r="14"/><path d="M8 26h28M22 12c-6 8-6 20 0 28M22 12c6 8 6 20 0 28"/><path d="M34 14c0-6 4-9 10-9 0 6-3 10-10 9z"/></svg>
      <span class="ex-tag">Awareness</span>
      <h3>The food waste crisis</h3>
      <p>Every year, one third of all food produced for human consumption is lost or wasted globally.</p>
      <button class="hd-link" onclick="switchView('awareness')">Read more</button>
    </article>
    <article class="ex-quiz">
      <h3>${ic('quiz')} Quiz</h3>
      <p>${QUIZ_QUESTIONS.length} questions on food waste and the 5R framework.</p>
      <div class="ex-best">Your best: <strong>${settings.quizBest || 0} / ${QUIZ_QUESTIONS.length}</strong></div>
      <button class="hd-btn solid" onclick="switchView('quiz')">Start quiz</button>
    </article>
    <article class="ex-lb">
      <h3>${ic('leaderboard')} Leaderboard</h3>
      ${lb.length ? `<ol>${lb.map((w, i) => `<li><span>#${i + 1} Week ${w.week}${window.weekRange ? ` <small class="lb-range">${window.weekRange(new Date().getFullYear(), w.week)}</small>` : ''}</span><strong>RM ${w.amount.toFixed(2)}</strong></li>`).join('')}</ol>
        <small>Your heaviest waste weeks this year. Beat them next time.</small>`
      : `<p class="hd-empty">No waste logged this year. That is a great start.</p>`}
      <button class="hd-link" onclick="switchView('leaderboard')">View full leaderboard</button>
    </article>
  </div>

  <section class="hd-life" aria-label="Food lifecycle">
    <h3>The Food Keeper journey</h3>
    <ol>
      <li><button onclick="switchView('receipt')"><i></i><b>Purchased</b><small>Receipt scanner</small></button></li>
      <li><button onclick="switchView('pantry')"><i></i><b>Stored</b><small>Pantry tracker</small></button></li>
      <li><button onclick="switchView('shopping')"><i></i><b>Planned</b><small>Shopping list, recipes</small></button></li>
      <li><button onclick="switchView('pantry')"><i></i><b>Consumed</b><small>Mark items as used</small></button></li>
      <li><button onclick="switchView('waste')"><i></i><b>Reviewed</b><small>Waste log</small></button></li>
    </ol>
  </section>`;
}

// ── 包装现有函数（不改 app.js）──
(function () {
  const _switchView = switchView, _goHome = goHome, _render = render,
        _renderWaste = renderWasteLog, _applyTr = applyTranslations;
  window.switchView = v => { _switchView(v); setNav(v); };
  window.goHome = () => { _goHome(); setNav('home'); renderHome(); };
  window.render = () => { _render(); renderHome(); };
  window.renderWasteLog = () => { _renderWaste(); renderHome(); };
  window.applyTranslations = () => { _applyTr(); renderSidebar(); renderHome(); };
})();

// ── 浏览器标签页图标：用同一个 SVG 现场生成，不需要图片文件 ──
(function setFavicon() {
  const link = document.getElementById('fk-favicon'), defs = document.getElementById('fk-defs'), icon = document.getElementById('fk-icon');
  if (!link || !defs || !icon) return;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="148 190 490 470">' + defs.outerHTML + icon.outerHTML + '</svg>';
  const uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
  link.type = 'image/svg+xml'; link.href = uri;
  const img = new Image();       // 再转成 PNG，让不支持 SVG 图标的浏览器（如 Safari）也能显示
  img.onload = () => { try {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    c.getContext('2d').drawImage(img, 0, 0, 64, 64);
    link.type = 'image/png'; link.href = c.toDataURL('image/png');
  } catch (e) {} };
  img.src = uri;
})();
