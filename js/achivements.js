// achievements.js — 放在 market.js 后面加载（app.js → home.js → pages.js → purchase.js → account.js → market.js → achievements.js）
// 成就系统：29 个徽章 × 7 个类别 × 3 个等级（铜 / 银 / 金），全部用 SVG 几何线条画出来，带颜色和动画。
//   · 不改 app.js / home.js / pages.js：用「包装现有函数」的方式统计（和 home.js 的做法一样）
//   · 进度存在 Firestore：users/{uid}/data/settings 里的 ach 字段（和 quizBest 同一个文档）
//   · 页面、侧边栏入口、首页卡片、解锁庆祝动画都在这个文件里
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const RM = n => 'RM ' + (Number(n) || 0).toFixed(2);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseYMD = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const kpi = (v, l) => `<div class="pg-kpi"><span class="pg-kpi-num">${v}</span><span class="pg-kpi-lbl">${l}</span></div>`;
  const card = (t, b, tint = '') => `<section class="pg-card ${tint}"><h4>${t}</h4>${b}</section>`;

  // ═════════ 1. 类别 / 等级 / 积分 ═════════
  const CATS = {
    pantry:  { name: 'Pantry',     c1: '#5fd08f', c2: '#0f6b45', acc: '#ffe27a' },
    kitchen: { name: 'Kitchen',    c1: '#ffa24d', c2: '#e04a12', acc: '#fff1b8' },
    saver:   { name: 'Savings',    c1: '#ffd54a', c2: '#d98f00', acc: '#7a4300' },
    clean:   { name: 'Zero waste', c1: '#74b9f5', c2: '#2563b0', acc: '#c9ff9e' },
    plan:    { name: 'Planning',   c1: '#4fe0cf', c2: '#0e8076', acc: '#ffe27a' },
    learn:   { name: 'Learning',   c1: '#b69cff', c2: '#5b3fc0', acc: '#ffe27a' },
    habit:   { name: 'Habits',     c1: '#ff8fb3', c2: '#c92a64', acc: '#ffe9a8' }
  };
  const TIER = { 1: 'Bronze', 2: 'Silver', 3: 'Gold' };
  const PTS = { 1: 10, 2: 25, 3: 50 };
  const LEVELS = [
    { name: 'Seedling', at: 0 }, { name: 'Sprout', at: 30 }, { name: 'Gardener', at: 80 },
    { name: 'Cook', at: 160 }, { name: 'Chef', at: 280 }, { name: 'Harvester', at: 430 }, { name: 'Food Keeper', at: 600 }
  ];
  const levelOf = pts => {
    let i = 0; LEVELS.forEach((l, k) => { if (pts >= l.at) i = k; });
    const cur = LEVELS[i], nxt = LEVELS[i + 1];
    return { i, n: i + 1, name: cur.name, next: nxt || null, toNext: nxt ? nxt.at - pts : 0, pct: nxt ? (pts - cur.at) / (nxt.at - cur.at) * 100 : 100 };
  };

  // ═════════ 2. 徽章图案（几何线条，坐标以 0,0 为中心，约 ±22）═════════
  // e-s 白色线 · e-a 强调色线 · e-f 半透明填充 · e-fill 线 + 淡填充
  const E = {
    jar: '<path class="e-s e-fill" d="M-11 -9h22v26a4 4 0 0 1-4 4h-14a4 4 0 0 1-4-4z"/><path class="e-s" d="M-8 -9v-6h16v6"/><path class="e-a" d="M-11 3h22"/><circle class="e-f" cx="0" cy="12" r="3"/>',
    crate: '<rect class="e-s e-fill" x="-21" y="2" width="19" height="17" rx="3"/><rect class="e-s e-fill" x="2" y="2" width="19" height="17" rx="3"/><rect class="e-s e-fill" x="-9.5" y="-17" width="19" height="17" rx="3"/><path class="e-a" d="M-16 10.5h9M7 10.5h9M-4.5 -8.5h9"/>',
    cabinet: '<rect class="e-s e-fill" x="-17" y="-18" width="34" height="38" rx="3"/><path class="e-s" d="M0 -18v38M-17 1h34"/><path class="e-a" d="M-8.5 -12l3.5 3.5-3.5 3.5-3.5-3.5zM8.5 -12l3.5 3.5-3.5 3.5-3.5-3.5z"/><path class="e-a" d="M-4 6v9M4 6v9"/>',
    plate: '<circle class="e-s" r="17"/><circle class="e-s e-fill" r="10.5"/><path class="e-a" d="M-5 .5l3.5 3.5 7-8"/>',
    pot: '<path class="e-s e-fill" d="M-16 -2h32v14a8 8 0 0 1-8 8h-16a8 8 0 0 1-8-8z"/><path class="e-s" d="M-20 -2h40M-16 4h-4M16 4h4"/><path class="e-a e-steam" d="M-6 -8c-3-3 3-5 0-9M6 -8c-3-3 3-5 0-9"/>',
    crown: '<path class="e-s e-fill" d="M-18 14l-3-26 11 11 10-17 10 17 11-11-3 26z"/><path class="e-s" d="M-18 20h36"/><circle class="e-a" cx="0" cy="4" r="2.5"/>',
    hourglass: '<path class="e-s e-fill" d="M-13 -19h26l-13 19zM-13 19h26l-13-19z"/><path class="e-s" d="M-16 -19h32M-16 19h32"/><path class="e-a" d="M-6 15h12"/>',
    shield: '<path class="e-s e-fill" d="M0 -20l16 6v10c0 10-7 17-16 21-9-4-16-11-16-21v-10z"/><path class="e-a" d="M3 -10l-7 11h6l-2 9 8-12h-6z"/>',
    clock: '<circle class="e-s e-fill" r="14"/><path class="e-s" d="M0 -7v7l5 3"/><path class="e-a" d="M0 -22v-3M0 22v3M-22 0h-3M22 0h3M-15.5 -15.5l-2-2M15.5 -15.5l2-2M-15.5 15.5l-2 2M15.5 15.5l2 2"/>',
    coin: '<circle class="e-s e-fill" r="17"/><circle class="e-s" r="12.5" stroke-opacity=".45"/><path class="e-a" d="M5 -6c-1-2.5-3-3.5-5-3.5-3 0-5 1.7-5 4 0 6 10 3 10 9 0 2.5-2 4-5 4-2.5 0-4.5-1-5.5-3.5M0 -13v3.5M0 7.5v3.5"/>',
    coins: '<path class="e-s e-fill" d="M-16 4v8c0 3 7 5 16 5s16-2 16-5V4"/><path class="e-s e-fill" d="M-16 -6v10c0 3 7 5 16 5s16-2 16-5V-6"/><ellipse class="e-s e-fill" cx="0" cy="-6" rx="16" ry="5"/><path class="e-a" d="M-6 -6h12"/>',
    gem: '<path class="e-s e-fill" d="M-14 -8l6-10h16l6 10-14 26z"/><path class="e-s" d="M-14 -8h28M-5 -8l5 26M5 -8l-5 26M-8 -18l3 10M8 -18l-3 10"/><path class="e-a" d="M-3 -14h6"/>',
    notebook: '<rect class="e-s e-fill" x="-14" y="-18" width="26" height="36" rx="4"/><path class="e-s" d="M-7 -8h12M-7 0h12M-7 8h7"/><path class="e-a" d="M8 14l11-11 4 4-11 11-5 1z"/>',
    leaf: '<path class="e-s e-fill" d="M-15 15C-15 -3 -4 -15 16 -15 16 5 5 15 -15 15z"/><path class="e-a" d="M-15 15L7 -7"/>',
    calendar: '<rect class="e-s e-fill" x="-17" y="-14" width="34" height="32" rx="5"/><path class="e-s" d="M-17 -4h34M-9 -19v8M9 -19v8"/><path class="e-a" d="M-8 8l5 5 10-11"/>',
    globe: '<circle class="e-s e-fill" r="17"/><path class="e-s" d="M-17 0h34M0 -17c-9 9-9 25 0 34M0 -17c9 9 9 25 0 34"/><path class="e-a" d="M7 -14c0-4 4-7 9-7 0 5-3 8-9 7z"/>',
    cart: '<path class="e-s" d="M-20 -16h6l5 24h22l4-16h-26"/><circle class="e-s e-fill" cx="-4" cy="16" r="3"/><circle class="e-s e-fill" cx="12" cy="16" r="3"/><path class="e-a" d="M-5 0l4 4 8-8"/>',
    clipboard: '<rect class="e-s e-fill" x="-14" y="-16" width="28" height="35" rx="4"/><path class="e-s e-fill" d="M-6 -20h12v6h-12z"/><path class="e-a" d="M-8 -4l3 3 5-6M-8 8l3 3 5-6"/><path class="e-s" d="M4 -3h6M4 9h6"/>',
    bowl: '<path class="e-s e-fill" d="M-18 4h36a18 18 0 0 1-36 0z"/><path class="e-s" d="M-22 4h44"/><path class="e-a e-spark" d="M0 -20l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
    book: '<g transform="translate(0 5)"><path class="e-s e-fill" d="M0 -6c-4-4-12-5-18-4v26c6-1 14 0 18 4 4-4 12-5 18-4v-26c-6-1-14 0-18 4z"/><path class="e-s" d="M0 -6v26"/></g><path class="e-a e-spark" d="M0 -22l2.5 5 5.5.8-4 3.8 1 5.4L0 -9.9l-5 2.6 1-5.4-4-3.8 5.5-.8z"/>',
    receipt: '<path class="e-s e-fill" d="M-13 -19h26v38l-4.3-3-4.3 3-4.4-3-4.3 3-4.4-3-4.3 3z"/><path class="e-s" d="M-7 -10h14M-7 -2h14M-7 6h8"/><g class="e-scanwrap"><path class="e-a" d="M-19 -2h38"/></g>',
    bars: '<path class="e-s" d="M-19 19h38"/><rect class="e-s e-fill" x="-15" y="4" width="7" height="15" rx="1.5"/><rect class="e-s e-fill" x="-3.5" y="-6" width="7" height="25" rx="1.5"/><rect class="e-s e-fill" x="8" y="-14" width="7" height="33" rx="1.5"/><path class="e-a" d="M-16 -4l10-8 8 5 12-12"/>',
    question: '<circle class="e-s e-fill" r="17"/><path class="e-s" d="M-6 -6a6 6 0 1 1 8.5 5.4c-2 1-2.5 2.5-2.5 4.6"/><path class="e-a" d="M0 11.5v.5"/>',
    bulb: '<path class="e-s e-fill" d="M0 -20a12 12 0 0 0-7 21.8c1.2 1 2 2.4 2 4.2h10c0-1.8.8-3.2 2-4.2A12 12 0 0 0 0 -20z"/><path class="e-s" d="M-5 15h10M-3 19.5h6"/><path class="e-a" d="M-3 -6l3 5 3-5"/>',
    target: '<circle class="e-s" r="18"/><circle class="e-s e-fill" r="11"/><circle class="e-f" r="4.5"/><path class="e-a" d="M0 0L17 -17M10 -18h8v8"/>',
    compass: '<circle class="e-s e-fill" r="18"/><path class="e-s" d="M0 -18v4M0 14v4M-18 0h4M14 0h4"/><path class="e-a e-needle" d="M9 -9l-4.5 13.5-13.5 4.5 4.5-13.5z"/>',
    dots: '<circle class="e-s e-fill" cx="-14" cy="0" r="5"/><circle class="e-s e-fill" cx="0" cy="0" r="5"/><circle class="e-s e-fill" cx="14" cy="0" r="5"/><path class="e-s" d="M-9 0h4M5 0h4M-18 13h36"/><path class="e-a" d="M-16.5 0l2 2 3.5-4M-2.5 0l2 2 3.5-4M11.5 0l2 2 3.5-4"/>',
    flame: '<g transform="translate(-14 -13.5) scale(1.17)"><path class="e-s e-fill" d="M12 21c-4 0-6.5-2.7-6.5-6 0-3 2-4.8 3.2-7 .4 1.8 1.3 2.7 2.3 3 0-3 1-6 3.5-8 .3 3 3.5 5 3.5 11 0 4-2.3 7-6 7z"/></g><path class="e-a" d="M0 9c-2.5 0-4-1.5-4-3.5 0-1.8 1.5-2.7 2-4 1.5 1 2 1.5 2 2.7 1 .5 2 1.5 2 3 0 1.2-.8 1.8-2 1.8z"/>',
    hive: '<path class="e-s e-fill" d="M0 -20l17 10v20l-17 10-17-10v-20z"/><path class="e-a" d="M0 -10l8.5 5v10l-8.5 5-8.5-5v-10z"/><circle class="e-f" r="3"/>'
  };

  // ═════════ 3. 29 个成就 ═════════
  // val(m) 返回当前进度；goal 是目标；go 是「去哪里完成」的页面
  const D = (id, cat, tier, title, desc, goal, unit, val, em, go) => ({ id, cat, tier, title, desc, goal, unit, val, em, go });
  const DEFS = [
    D('first-stock',    'pantry',  1, 'First Stock',       'Add your first ingredient to the pantry.',               1,   'item',           m => m.added,     'jar',       'pantry'),
    D('well-stocked',   'pantry',  2, 'Well Stocked',      'Add 25 ingredients in total.',                           25,  'item',           m => m.added,     'crate',     'pantry'),
    D('pantry-master',  'pantry',  3, 'Pantry Master',     'Add 100 ingredients in total.',                          100, 'item',           m => m.added,     'cabinet',   'pantry'),

    D('first-bite',     'kitchen', 1, 'Eaten, Not Binned', 'Mark an ingredient as consumed.',                        1,   'item',           m => m.consumed,  'plate',     'pantry'),
    D('kitchen-hero',   'kitchen', 2, 'Kitchen Hero',      'Use up 20 ingredients.',                                 20,  'item',           m => m.consumed,  'pot',       'pantry'),
    D('kitchen-legend', 'kitchen', 3, 'Kitchen Legend',    'Use up 75 ingredients.',                                 75,  'item',           m => m.consumed,  'crown',     'pantry'),
    D('last-minute',    'kitchen', 1, 'Last-Minute Save',  'Use an ingredient in its final days, before it expires.', 1,  'rescue',         m => m.rescued,   'hourglass', 'pantry'),
    D('expiry-ninja',   'kitchen', 2, 'Expiry Ninja',      'Rescue 10 ingredients in their final days.',             10,  'rescue',         m => m.rescued,   'shield',    'pantry'),
    D('beat-the-clock', 'kitchen', 3, 'Beat the Clock',    'Rescue 30 ingredients in their final days.',             30,  'rescue',         m => m.rescued,   'clock',     'pantry'),

    D('pocket-saver',   'saver',   1, 'Pocket Saver',      'Use up RM 10 of food before it expires.',                10,  'RM',             m => m.savedRM,   'coin',      'pantry'),
    D('penny-wise',     'saver',   2, 'Penny Wise',        'Use up RM 50 of food before it expires.',                50,  'RM',             m => m.savedRM,   'coins',     'pantry'),
    D('big-saver',      'saver',   3, 'Big Saver',         'Use up RM 200 of food before it expires.',               200, 'RM',             m => m.savedRM,   'gem',       'pantry'),

    D('honest-logger',  'clean',   1, 'Honest Logger',     'Log a wasted item. Knowing what you waste is the first step.', 1, 'entry',     m => m.wasteLogged, 'notebook', 'waste'),
    D('clean-week',     'clean',   1, 'Clean Week',        'Finish a full week with nothing logged as waste.',       1,   'clean week',     m => m.bestClean, 'leaf',      'waste'),
    D('clean-month',    'clean',   2, 'Clean Month',       'Four clean weeks in a row.',                             4,   'clean week',     m => m.bestClean, 'calendar',  'waste'),
    D('eco-streak',     'clean',   3, 'Eco Streak',        'Eight clean weeks in a row.',                            8,   'clean week',     m => m.bestClean, 'globe',     'leaderboard'),

    D('list-checker',   'plan',    1, 'List Checker',      'Tick off 5 items on your shopping list.',                5,   'tick',          m => m.shopped,   'cart',      'shopping'),
    D('list-pro',       'plan',    2, 'List Pro',          'Tick off 30 items on your shopping list.',               30,  'tick',          m => m.shopped,   'clipboard', 'shopping'),
    D('sous-chef',      'plan',    1, 'AI Sous-Chef',      'Generate a zero-waste menu from your pantry.',           1,   'menu',          m => m.recipes,   'bowl',      'recipes'),
    D('menu-maestro',   'plan',    2, 'Menu Maestro',      'Generate 10 zero-waste menus.',                          10,  'menu',          m => m.recipes,   'book',      'recipes'),
    D('receipt-reader', 'plan',    1, 'Receipt Reader',    'Scan a receipt and add it to your pantry.',              1,   'receipt',       m => m.receipts,  'receipt',   'receipt'),
    D('bookkeeper',     'plan',    2, 'Bookkeeper',        'Keep 10 purchase records.',                              10,  'record',        m => m.purchases, 'bars',      'purchases'),

    D('curious-mind',   'learn',   1, 'Curious Mind',      'Finish the food waste quiz with at least one right answer.', 1, 'right answer', m => m.quizBest, 'question',  'quiz'),
    D('sharp-mind',     'learn',   2, 'Sharp Mind',        'Score 80% or more in the quiz.',                         80,  '%',             m => m.quizPct,   'bulb',      'quiz'),
    D('perfect-score',  'learn',   3, 'Perfect Score',     'Answer every quiz question correctly.',                  100, '%',             m => m.quizPct,   'target',    'quiz'),
    D('explorer',       'learn',   2, 'Explorer',          'Visit 8 different pages in Food Keeper.',                8,   'page',          m => m.visited,   'compass',   null),

    D('regular',        'habit',   1, 'Regular',           'Open Food Keeper on 3 different days.',                  3,   'day',           m => m.daysTotal, 'dots',      null),
    D('week-warrior',   'habit',   2, 'Week Warrior',      'Use Food Keeper 7 days in a row.',                       7,   'day in a row',  m => m.bestDays,  'flame',     null),
    D('dedicated',      'habit',   3, 'Dedicated Keeper',  'Use Food Keeper on 30 different days.',                  30,  'day',           m => m.daysTotal, 'hive',      null)
  ];
  const BY_ID = Object.fromEntries(DEFS.map(d => [d.id, d]));
  const ALL_PTS = DEFS.reduce((s, d) => s + PTS[d.tier], 0);

  // ═════════ 4. 徽章形状 + 全局渐变 ═════════
  const pt = (a, r, cx = 48, cy = 48) => (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
  const SHAPES = {
    1: 'M48 8a40 40 0 1 1 0 80a40 40 0 1 1 0-80z',                                                         // 铜：圆
    2: Array.from({ length: 6 }, (_, k) => (k ? 'L' : 'M') + pt(-Math.PI / 2 + k * Math.PI / 3, 42)).join('') + 'z',   // 银：六边形
    3: Array.from({ length: 16 }, (_, k) => (k ? 'L' : 'M') + pt(-Math.PI / 2 + k * Math.PI / 8, k % 2 ? 38 : 43.5)).join('') + 'z' // 金：八芒徽章
  };
  const polyPts = (n, r, rot, cx = 80, cy = 80) => Array.from({ length: n }, (_, k) => pt(rot + k * 2 * Math.PI / n, r, cx, cy)).join(' ');

  function injectDefs() {
    if ($('ach-defs')) return;
    const grads = Object.entries(CATS).map(([k, c]) => `<linearGradient id="abg-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.c1}"/><stop offset="1" stop-color="${c.c2}"/></linearGradient>`).join('');
    document.body.insertAdjacentHTML('afterbegin', `
      <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false" id="ach-defs"><defs>
        ${grads}
        <linearGradient id="abr-1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1b17c"/><stop offset="1" stop-color="#a9602a"/></linearGradient>
        <linearGradient id="abr-2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#97a4b8"/></linearGradient>
        <linearGradient id="abr-3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a0"/><stop offset="1" stop-color="#e0a100"/></linearGradient>
        <linearGradient id="ab-shine-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="am-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fd08f"/><stop offset=".55" stop-color="#F4D84A"/><stop offset="1" stop-color="#4C91D8"/></linearGradient>
      </defs></svg>`);
  }

  // ═════════ 5. 徽章 SVG ═════════
  let uidn = 0;
  function badge(d, on, pct, draw) {
    const c = CATS[d.cat], id = 'abc' + (++uidn), shape = SHAPES[d.tier];
    const emb = (E[d.em] || '').replace(/<(path|circle|rect|ellipse)\b/g, '<$1 pathLength="1"');
    const lock = '<g class="ab-lockg" transform="translate(74 74)"><circle r="10"/><rect x="-4" y="-1" width="8" height="6.4" rx="1.4"/><path d="M-2.6 -1v-2.2a2.6 2.6 0 0 1 5.2 0v2.2"/></g>';
    const spark = (x, y, k) => `<path class="sp s${k}" d="M${x} ${y - 6}l1.6 4.4 4.4 1.6-4.4 1.6L${x} ${y + 6}l-1.6-4.4-4.4-1.6 4.4-1.6z"/>`;
    return `<svg class="ab t${d.tier} ${on ? 'on' : 'lock'}${draw ? ' draw' : ''}" viewBox="0 0 96 96" style="--c1:${c.c1};--c2:${c.c2};--acc:${c.acc}" aria-hidden="true" focusable="false">
      <defs><clipPath id="${id}"><path d="${shape}"/></clipPath></defs>
      ${on
        ? '<circle class="ab-ring" cx="48" cy="48" r="47.5"/>'
        : `<circle class="ab-track" cx="48" cy="48" r="47.5"/><circle class="ab-arc" cx="48" cy="48" r="47.5" pathLength="100" style="--off:${(100 - pct).toFixed(1)}"/>`}
      <path class="ab-shape" d="${shape}" fill="${on ? `url(#abg-${d.cat})` : 'var(--surface2)'}" stroke="${on ? `url(#abr-${d.tier})` : 'var(--border2)'}" stroke-width="3.2" stroke-linejoin="round"/>
      <g clip-path="url(#${id})">
        <circle class="ab-glow" cx="34" cy="26" r="28"/>
        ${on ? '<g transform="rotate(24 48 48)"><rect class="ab-shine" x="-34" y="-12" width="22" height="120" fill="url(#ab-shine-g)"/></g>' : ''}
      </g>
      <circle class="ab-inner" cx="48" cy="48" r="31"/>
      <g class="ab-emb" transform="translate(48 48)">${emb}</g>
      ${on && d.tier === 3 ? `<g class="ab-sp">${spark(84, 16, 1)}${spark(10, 30, 2)}${spark(82, 80, 3)}</g>` : ''}
      ${on ? '' : lock}
    </svg>`;
  }

  // 等级奖章（首页 / 成就页横幅共用）
  function medallion(lv, pct, mini) {
    return `<svg class="am${mini ? ' mini' : ''}" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <g class="am-spin"><polygon class="am-hex" points="${polyPts(6, 74, -Math.PI / 2)}"/></g>
      <g class="am-rspin"><polygon class="am-tri a" points="${polyPts(3, 66, -Math.PI / 2)}"/><polygon class="am-tri b" points="${polyPts(3, 66, Math.PI / 2)}"/></g>
      <circle class="am-track" cx="80" cy="80" r="52"/>
      <circle class="am-arc" cx="80" cy="80" r="52" pathLength="100" style="--off:${(100 - Math.max(0, Math.min(100, pct))).toFixed(1)}"/>
      <g class="am-orbit"><circle class="am-dot" cx="80" cy="28" r="5"/></g>
      <text class="am-l" x="80" y="68" text-anchor="middle">LEVEL</text>
      <text class="am-n" x="80" y="104" text-anchor="middle">${lv.n}</text>
    </svg>`;
  }

  // ═════════ 6. 状态 ═════════
  let ach = blank();
  let ready = false, dirty = false, wasteDocs = null, purchases = null, unsubW = null, unsubP = null;
  let quietUntil = 0, saveTimer = null, sig = '', teaserSig = '';
  let fState = 'all', fCat = 'all', intro = false, goTimer = null;

  function blank() { return { counts: {}, unlocked: {}, seen: {}, days: [], visited: [], start: '' }; }
  function normalise(a) {
    a = a && typeof a === 'object' ? a : {};
    return {
      counts: Object.assign({}, a.counts), unlocked: Object.assign({}, a.unlocked), seen: Object.assign({}, a.seen),
      days: Array.isArray(a.days) ? a.days.filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).slice(-120) : [],
      visited: Array.isArray(a.visited) ? a.visited.filter(v => typeof v === 'string') : [],
      start: typeof a.start === 'string' ? a.start : ''
    };
  }
  const pack = () => JSON.parse(JSON.stringify(ach));

  const _saveSetting = window.saveSetting;
  function save() {
    saveTimer = null; dirty = false;
    try { _saveSetting({ ach: pack() }); } catch (e) { console.error(e); }
  }
  function mark() {
    if (!ready) return;
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }
  function bump(key, n = 1) {
    if (!ready) return;
    ach.counts[key] = Math.round(((ach.counts[key] || 0) + n) * 100) / 100;
    mark();
  }
  function touchDay() {
    if (!ready) return;
    const t = today();
    if (!ach.days.includes(t)) {
      ach.days.push(t); ach.days.sort(); if (ach.days.length > 120) ach.days = ach.days.slice(-120);
      ach.counts.daysTotal = (ach.counts.daysTotal || 0) + 1;
      mark();
    }
  }

  // 连续使用天数
  function dayStats() {
    const ds = [...new Set(ach.days)].sort();
    let best = 0, run = 0, prev = null;
    ds.forEach(s => { const d = parseYMD(s); run = prev && Math.round((d - prev) / 864e5) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; });
    const cur = prev && Math.round((parseYMD(today()) - prev) / 864e5) <= 1 ? run : 0;
    return { best, cur };
  }

  // 连续「零浪费周」：只算整周（周一到周日）、那一周有打开过 app、而且没有任何浪费记录
  function weekStart(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function cleanWeeks() {
    if (!wasteDocs || !ach.start) return { cur: 0, best: 0 };
    let first = weekStart(parseYMD(ach.start));
    if (ymd(first) !== ach.start) first.setDate(first.getDate() + 7);   // 起始那周不是整周就跳过
    const thisW = weekStart(new Date());
    const wasteW = new Set(wasteDocs.map(w => w.date).filter(Boolean).map(s => ymd(weekStart(parseYMD(s)))));
    const activeW = new Set(ach.days.map(s => ymd(weekStart(parseYMD(s)))));
    let run = 0, best = 0;
    for (const w = new Date(first); w < thisW; w.setDate(w.getDate() + 7)) {
      const k = ymd(w);
      if (activeW.has(k) && !wasteW.has(k)) { run++; best = Math.max(best, run); } else run = 0;
    }
    return { cur: run, best };
  }

  function metrics() {
    const c = ach.counts, qn = (typeof QUIZ_QUESTIONS !== 'undefined' && QUIZ_QUESTIONS.length) || 1;
    const q = (settings && settings.quizBest) || 0, cw = cleanWeeks(), ds = dayStats();
    return {
      added: Math.max(c.added || 0, foods.length),
      consumed: c.consumed || 0, rescued: c.rescued || 0, savedRM: c.savedRM || 0,
      wasteLogged: wasteDocs ? wasteDocs.length : 0,
      bestClean: Math.max(c.bestClean || 0, cw.best), curClean: cw.cur,
      shopped: c.shopped || 0, recipes: c.recipes || 0, receipts: c.receipts || 0,
      purchases: purchases ? purchases.length : 0,
      quizBest: q, quizPct: Math.round(q / qn * 100),
      visited: ach.visited.length,
      daysTotal: Math.max(c.daysTotal || 0, ach.days.length),
      bestDays: Math.max(c.bestDays || 0, ds.best), curDays: ds.cur
    };
  }
  function states(m) {
    return DEFS.map(d => {
      const value = Math.max(0, d.val(m)), date = ach.unlocked[d.id] || null;
      return { d, value, pct: Math.min(100, Math.floor(value / d.goal * 100)), on: !!date, date, seen: !!ach.seen[d.id] };
    });
  }
  const ptsOf = st => st.filter(s => s.on).reduce((a, s) => a + PTS[s.d.tier], 0);
  const ptsNow = () => Object.keys(ach.unlocked).reduce((a, id) => a + (BY_ID[id] ? PTS[BY_ID[id].tier] : 0), 0);
  const unseen = () => Object.keys(ach.unlocked).filter(id => BY_ID[id] && !ach.seen[id]).length;

  function fmtVal(s) {
    const d = s.d, v = Math.min(s.value, d.goal);
    if (d.unit === 'RM') return `RM ${v.toFixed(2)} / RM ${d.goal}`;
    if (d.unit === '%') return `${v}% / ${d.goal}%`;
    return `${Math.floor(v)} / ${d.goal} ${d.unit}${d.goal > 1 ? 's' : ''}`;
  }
  function toGo(s) {
    const d = s.d, left = d.goal - s.value;
    if (d.unit === 'RM') return `RM ${Math.max(0, left).toFixed(2)} to go`;
    if (d.unit === '%') return `${Math.max(1, Math.ceil(left))}% to go`;
    return `${Math.max(1, Math.ceil(left))} to go`;
  }

  // ═════════ 7. 判定 ═════════
  function evaluate(live) {
    if (!ready) return;
    const before = ptsNow(), m = metrics();
    let changed = false;
    [['bestClean', m.bestClean], ['bestDays', m.bestDays], ['daysTotal', m.daysTotal]].forEach(([k, v]) => {
      if ((ach.counts[k] || 0) !== v) { ach.counts[k] = v; changed = true; }
    });
    const fresh = [];
    DEFS.forEach(d => { if (!ach.unlocked[d.id] && d.val(m) >= d.goal) { ach.unlocked[d.id] = today(); fresh.push(d); changed = true; } });
    const loud = fresh.length && (live || Date.now() > quietUntil);   // 刚登录那几秒是「补发」，不弹窗，只在页面里标 NEW
    if (loud) fresh.forEach(d => { ach.seen[d.id] = 1; });
    if (changed) mark();
    if (loud) {
      const l0 = levelOf(before), l1 = levelOf(ptsNow());
      queuePop(fresh, l1.i > l0.i ? l1 : null);
    }
    refreshUI();
  }

  function refreshUI() {
    updateDot();
    if (typeof currentView !== 'undefined' && currentView === 'achievements') renderPage(false);
    refreshTeaser();
  }

  // ═════════ 8. 页面 ═════════
  function sigOf(st, m) {
    return st.map(s => s.d.id + ':' + s.pct + (s.on ? 1 : 0) + (s.seen ? 1 : 0)).join('|') + '#' + fState + fCat + m.curDays + m.curClean;
  }

  function cardHTML(s, i) {
    const d = s.d, c = CATS[d.cat];
    return `<button class="ach-card ${s.on ? 'on' : 'lock'}" style="--c1:${c.c1};--c2:${c.c2};--i:${i}" onclick="achOpen('${d.id}')" aria-label="${esc(d.title)}, ${s.on ? 'earned' : s.pct + '% done'}">
      <span class="ab-wrap">${badge(d, s.on, s.pct, intro)}</span>
      <span class="ach-txt">
        <b>${esc(d.title)}</b>
        <span class="d">${esc(d.desc)}</span>
        ${s.on
          ? `<small class="ach-date">Earned ${esc(fmtDateFull(s.date))} · +${PTS[d.tier]} pts</small>`
          : `<span class="pg-bar ach-bar"><i style="width:${s.pct}%"></i></span><small>${esc(fmtVal(s))}</small>`}
      </span>
      ${s.on && !s.seen ? '<em class="ach-new">NEW</em>' : ''}
    </button>`;
  }

  function matches(s) {
    if (fCat !== 'all' && s.d.cat !== fCat) return false;
    if (fState === 'on') return s.on;
    if (fState === 'progress') return !s.on && s.pct > 0;
    if (fState === 'lock') return !s.on && s.pct === 0;
    return true;
  }

  function renderPage(first) {
    const root = $('view-achievements');
    if (!root) return;
    if (!ready) { $('ach-main').innerHTML = '<div class="empty"><p>Loading your achievements…</p></div>'; return; }
    const m = metrics(), st = states(m), s2 = sigOf(st, m);
    if (!first && s2 === sig) return;
    sig = s2;

    const pts = ptsOf(st), lv = levelOf(pts), got = st.filter(s => s.on).length;
    const bg = '<svg class="ach-bg" viewBox="0 0 600 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="b1"><polygon points="60,150 100,80 140,150"/></g><g class="b2"><polygon points="470,40 510,64 510,108 470,132 430,108 430,64"/></g><g class="b3"><circle cx="330" cy="160" r="26"/></g><g class="b4"><rect x="250" y="30" width="34" height="34" rx="5"/></g><g class="b5"><polygon points="560,160 580,190 540,190"/></g></svg>';
    $('ach-hero').innerHTML = `
      ${bg}
      <div>
        <h2>Small habits, big badges.</h2>
        <p>${got ? `${got} of ${DEFS.length} badges earned.` : 'Your first badge is one ingredient away.'} Stock, cook, save and waste less. Everything is counted for you.</p>
        <div class="pg-actions">
          <button class="pg-btn solid" onclick="switchView('pantry')">Open my pantry</button>
          <button class="pg-btn line" onclick="switchView('quiz')">Take the quiz</button>
        </div>
      </div>
      <div class="pg-art ach-art" aria-hidden="true">${medallion(lv, pts / ALL_PTS * 100)}</div>`;
    $('ach-strip').innerHTML = kpi(`${got}/${DEFS.length}`, 'Badges earned') + kpi(pts, `Points · ${lv.name}`) + kpi(m.curDays, `Day streak${m.bestDays > m.curDays ? ' · best ' + m.bestDays : ''}`) + kpi(m.curClean, 'Clean weeks in a row');

    const cnt = { all: st.length, on: st.filter(s => s.on).length, progress: st.filter(s => !s.on && s.pct > 0).length, lock: st.filter(s => !s.on && s.pct === 0).length };
    const chip = (kind, v, label, n, dot) => `<button class="pg-chip ${(kind === 'state' ? fState : fCat) === v ? 'on' : ''}" onclick="achSet('${kind}','${v}')" aria-pressed="${(kind === 'state' ? fState : fCat) === v}">${dot ? `<i class="ach-dot" style="background:${dot}"></i>` : ''}${label} <b>${n}</b></button>`;
    const chips =
      `<div class="pg-chips ach-chips">${[['all', 'All'], ['on', 'Earned'], ['progress', 'In progress'], ['lock', 'Not started']].map(([v, l]) => chip('state', v, l, cnt[v])).join('')}</div>` +
      `<div class="pg-chips ach-chips">${chip('cat', 'all', 'All types', DEFS.length)}${Object.entries(CATS).map(([k, c]) => chip('cat', k, c.name, st.filter(s => s.d.cat === k && s.on).length + '/' + st.filter(s => s.d.cat === k).length, c.c1)).join('')}</div>`;

    let idx = 0;
    const secs = Object.entries(CATS).map(([k, c]) => {
      const all = st.filter(s => s.d.cat === k), items = all.filter(matches);
      if (!items.length) return '';
      const e = all.filter(s => s.on).length;
      return `<section class="ach-sec" style="--c1:${c.c1};--c2:${c.c2}">
        <div class="ach-sec-h"><span class="ach-sec-dot"></span><h3>${c.name}</h3><span class="ach-sec-n">${e}/${all.length}</span><span class="ach-sec-bar"><i style="width:${e / all.length * 100}%"></i></span></div>
        <div class="ach-grid">${items.map(s => cardHTML(s, idx++)).join('')}</div></section>`;
    }).join('') || `<div class="empty"><div class="empty-icon">${ic('search')}</div><p>No badges match these filters.</p></div>`;
    $('ach-main').innerHTML = chips + `<div class="ach-secs">${secs}</div>`;

    // 右侧栏
    const next = st.filter(s => !s.on).sort((a, b) => b.pct - a.pct || a.d.goal - b.d.goal).slice(0, 4);
    const recent = st.filter(s => s.on).sort((a, b) => (b.date || '').localeCompare(a.date || '') || PTS[b.d.tier] - PTS[a.d.tier]).slice(0, 4);
    const mini = s => `<li><button class="ach-row" onclick="achOpen('${s.d.id}')"><span class="ab-wrap sm">${badge(s.d, s.on, s.pct, false)}</span><span class="pg-grow"><b>${esc(s.d.title)}</b>${s.on ? `<small>${esc(fmtDate(s.date))} · +${PTS[s.d.tier]} pts</small>` : `<span class="pg-bar ach-bar" style="--c1:${CATS[s.d.cat].c1};--c2:${CATS[s.d.cat].c2}"><i style="width:${s.pct}%"></i></span><small>${esc(toGo(s))}</small>`}</span></button></li>`;
    const tierDemo = t => `<span class="ach-tier"><span class="ab-wrap xs">${badge({ id: 'x', cat: 'pantry', tier: t, em: ['plate', 'pot', 'crown'][t - 1] }, true, 100, false)}</span><b>${TIER[t]}</b><small>${PTS[t]} pts</small></span>`;
    $('ach-side').innerHTML =
      card(`Level ${lv.n} · ${lv.name}`, `<div class="pg-kpi-num">${pts}<small class="ach-of"> / ${ALL_PTS} pts</small></div>
        <div class="pg-row"><div class="pg-row-top"><span>${lv.next ? 'Next: ' + lv.next.name : 'Top level reached'}</span><b>${lv.next ? lv.toNext + ' pts to go' : 'Well done'}</b></div><div class="pg-bar big ach-lvbar"><i style="width:${lv.pct}%"></i></div></div>`, 'tint-yellow') +
      card('Next up', next.length ? `<ul class="ach-list">${next.map(mini).join('')}</ul>` : '<p class="pg-muted">Every badge is earned. You are a true Food Keeper.</p>') +
      card('Recently earned', recent.length ? `<ul class="ach-list">${recent.map(mini).join('')}</ul>` : '<p class="pg-muted">Nothing yet. Add an ingredient to earn your first badge.</p>', 'tint-green') +
      card('Badge tiers', `<div class="ach-tiers">${[1, 2, 3].map(tierDemo).join('')}</div><p class="pg-muted">Rarer badges are worth more points. Points raise your level.</p>`);

    if (first) { clearTimeout(goTimer); root.classList.add('go'); goTimer = setTimeout(() => { root.classList.remove('go'); intro = false; }, 2400); }
  }

  window.achSet = (kind, v) => {
    if (kind === 'state') fState = v; else fCat = v;
    const root = $('view-achievements'); root.classList.add('go'); clearTimeout(goTimer); goTimer = setTimeout(() => root.classList.remove('go'), 1200);
    renderPage(true);
  };

  // 点开单个成就
  window.achOpen = id => {
    const d = BY_ID[id]; if (!d || !ready) return;
    const s = states(metrics()).find(x => x.d.id === id), c = CATS[d.cat];
    $('ach-modal-body').innerHTML = `
      <div class="ach-md" style="--c1:${c.c1};--c2:${c.c2}">
        <div class="ach-md-badge ${s.on ? 'on' : ''}">${badge(d, s.on, s.pct, true)}</div>
        <h3>${esc(d.title)}</h3>
        <p>${esc(d.desc)}</p>
        <div class="ach-meta"><span style="--k:${c.c1}">${c.name}</span><span>${TIER[d.tier]}</span><span>+${PTS[d.tier]} pts</span></div>
        ${s.on
          ? `<div class="ach-status on">Earned on ${esc(fmtDateFull(s.date))}</div>`
          : `<div class="pg-row"><div class="pg-row-top"><span>${esc(fmtVal(s))}</span><b>${esc(toGo(s))}</b></div><div class="pg-bar big ach-bar"><i style="width:${s.pct}%"></i></div></div>`}
        ${d.go && !s.on ? `<button class="pg-btn solid" onclick="achClose();switchView('${d.go}')">Go to ${esc(navLabel(d.go))}</button>` : ''}
      </div>`;
    $('ach-overlay').classList.add('open');
  };
  window.achClose = () => $('ach-overlay') && $('ach-overlay').classList.remove('open');

  // 「NEW」标记：进页面 1.8 秒后算已读
  function markSeenSoon() {
    setTimeout(() => {
      if (currentView !== 'achievements' || !ready) return;
      let n = 0;
      Object.keys(ach.unlocked).forEach(id => { if (BY_ID[id] && !ach.seen[id]) { ach.seen[id] = 1; n++; } });
      if (!n) return;
      mark();
      document.querySelectorAll('.ach-new').forEach(e => e.classList.add('out'));
      const m = metrics(); sig = sigOf(states(m), m);
      updateDot();
    }, 1800);
  }

  // ═════════ 9. 解锁庆祝 ═════════
  let popQueue = [], popOpen = false, popTimer = null;
  function queuePop(defs, lvl) { defs.forEach((d, i) => popQueue.push({ d, lvl: i === defs.length - 1 ? lvl : null })); if (!popOpen) nextPop(); }
  function nextPop() {
    const it = popQueue.shift();
    if (!it) { popOpen = false; return; }
    popOpen = true;
    const d = it.d, c = CATS[d.cat];
    const cols = [c.c1, c.c2, '#ffd54a', '#ffffff', '#4C91D8'], shapes = ['tri', 'sq', 'dia', 'dot'];
    const parts = Array.from({ length: 24 }, (_, i) => {
      const a = i / 24 * Math.PI * 2 + (Math.random() - .5) * .3, r = 120 + Math.random() * 100, sz = 8 + Math.random() * 10;
      return `<i class="${shapes[i % 4]}" style="--tx:${(Math.cos(a) * r).toFixed(0)}px;--ty:${(Math.sin(a) * r).toFixed(0)}px;--r:${(Math.random() * 540 - 270).toFixed(0)}deg;--s:${sz.toFixed(0)}px;--cl:${cols[i % cols.length]};--dl:${(Math.random() * .12).toFixed(2)}s"></i>`;
    }).join('');
    const el = document.createElement('div');
    el.className = 'ach-pop';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Achievement unlocked');
    el.style.cssText = `--c1:${c.c1};--c2:${c.c2}`;
    el.innerHTML = `<div class="ach-pop-card" onclick="event.stopPropagation()">
      <div class="ach-rays"></div><div class="ach-ripple"></div><div class="ach-ripple r2"></div><div class="ach-burst">${parts}</div>
      <div class="ach-pop-badge">${badge(d, true, 100, true)}</div>
      <small class="ach-pop-label">Achievement unlocked</small>
      <h3>${esc(d.title)}</h3><p>${esc(d.desc)}</p>
      <div class="ach-pop-pts">+${PTS[d.tier]} pts · ${TIER[d.tier]}</div>
      ${it.lvl ? `<div class="ach-lvup">Level up! You are now level ${it.lvl.n}, ${esc(it.lvl.name)}.</div>` : ''}
      <div class="ach-pop-btns"><button class="pg-btn solid" data-a="ok">${popQueue.length ? 'Next' : 'Nice!'}</button><button class="pg-btn line" data-a="view">See all badges</button></div>
    </div>`;
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (a && a.dataset.a === 'view') { closePop(el); switchView('achievements'); } else closePop(el);
    });
    document.body.appendChild(el);
    el.querySelector('[data-a="ok"]').focus({ preventScroll: true });
    clearTimeout(popTimer);
    popTimer = setTimeout(() => closePop(el), popQueue.length ? 3200 : 6500);
  }
  function closePop(el) {
    if (!el || el.dataset.closing) return;
    el.dataset.closing = '1'; clearTimeout(popTimer);
    el.classList.add('out');
    setTimeout(() => { el.remove(); nextPop(); }, 260);
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const p = document.querySelector('.ach-pop:not(.out)');
    if (p) closePop(p); else achClose();
  });

  // ═════════ 10. 侧边栏红点 + 首页卡片 ═════════
  function updateDot() {
    const btn = document.querySelector('#sidebar .nav-item[data-v="achievements"]');
    if (!btn) return;
    const n = ready ? unseen() : 0;
    let dot = btn.querySelector('.ach-navdot');
    if (!n) { if (dot) dot.remove(); return; }
    if (!dot) { dot = document.createElement('em'); dot.className = 'ach-navdot'; btn.appendChild(dot); }
    dot.textContent = n > 9 ? '9+' : n;
  }

  function teaserHTML() {
    if (!ready) return '';
    const m = metrics(), st = states(m), pts = ptsOf(st), lv = levelOf(pts), got = st.filter(s => s.on).length;
    const on = st.filter(s => s.on).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 3);
    const nx = st.filter(s => !s.on).sort((a, b) => b.pct - a.pct).slice(0, 5 - on.length);
    const mb = [...on, ...nx].map(s => `<button class="hd-ach-b ${s.on ? 'on' : ''}" onclick="achOpen('${s.d.id}')" title="${esc(s.d.title)}${s.on ? '' : ' · ' + s.pct + '%'}" aria-label="${esc(s.d.title)}"><span class="ab-wrap sm">${badge(s.d, s.on, s.pct, false)}</span></button>`).join('');
    return `<section class="hd-ach" aria-label="Achievements">
      <div class="hd-ach-lv">${medallion(lv, pts / ALL_PTS * 100, true)}</div>
      <div class="hd-ach-info">
        <h3>${ic('achievements')} Achievements</h3>
        <p>Level ${lv.n}, ${esc(lv.name)} · ${got} of ${DEFS.length} badges${unseen() ? ` · <b>${unseen()} new</b>` : ''}</p>
        <div class="pg-bar"><i style="width:${lv.pct.toFixed(0)}%"></i></div>
        <small>${lv.next ? lv.toNext + ' pts to ' + esc(lv.next.name) : 'Top level reached'}</small>
      </div>
      <div class="hd-ach-badges">${mb}</div>
      <button class="hd-link" onclick="switchView('achievements')">View all</button>
    </section>`;
  }
  function injectTeaser() {
    const el = $('home-dashboard');
    if (!el || el.querySelector('.hd-ach')) return;
    const html = teaserHTML();
    if (!html) return;
    const life = el.querySelector('.hd-life');
    if (life) life.insertAdjacentHTML('beforebegin', html); else el.insertAdjacentHTML('beforeend', html);
    const m = metrics(); teaserSig = sigOf(states(m), m) + '|' + unseen();
  }
  function refreshTeaser() {
    const t = document.querySelector('.hd-ach');
    if (!t) { injectTeaser(); return; }
    const m = metrics(), key = sigOf(states(m), m) + '|' + unseen();
    if (key === teaserSig) return;
    teaserSig = key;
    t.outerHTML = teaserHTML();
  }

  // ═════════ 11. 注册页面 / 导航 ═════════
  ['en', 'ms', 'zh'].forEach(l => { TRANSLATIONS[l].achievements = { en: 'Achievements', ms: 'Pencapaian', zh: '成就' }[l]; });
  IC.achievements = '<path d="M12 2.8l7.6 4.4v8.8L12 20.4l-7.6-4.4V7.2z"/><path d="M12 8l1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.6-3 1.6.6-3.2-2.4-2.3 3.3-.5z"/>';
  ALL_VIEWS.push('achievements');
  OUTSIDE_VIEWS.push('achievements');
  MENUS.outside.push({ view: 'achievements', icon: ic('achievements') });
  NAV_COMMUNITY.push('achievements');
  injectDefs();

  $('main-outside').insertAdjacentHTML('beforeend', `
    <section id="view-achievements" class="view-section pg-view pg-achievements" style="display:none">
      <header class="pg-hero tone-yellow ach-hero" id="ach-hero"></header>
      <section class="pg-strip" id="ach-strip"></section>
      <div class="pg-body">
        <div class="pg-main" id="ach-main"></div>
        <aside class="pg-side" id="ach-side"></aside>
      </div>
    </section>`);
  $('app').insertAdjacentHTML('beforeend', `
    <div class="overlay" id="ach-overlay" onclick="achClose()">
      <div class="modal ach-modal" onclick="event.stopPropagation()">
        <div class="modal-header"><h2>Achievement</h2><button class="modal-close" onclick="achClose()" aria-label="Close">${ic('x')}</button></div>
        <div class="modal-body" id="ach-modal-body"></div>
      </div>
    </div>`);
  try { renderMenus(); } catch (e) {}

  // ═════════ 12. 包装现有函数（只统计，不改原来的行为）═════════
  function resetState() {
    [unsubW, unsubP].forEach(u => u && u()); unsubW = unsubP = null;
    clearTimeout(saveTimer);
    ach = blank(); ready = false; dirty = false; wasteDocs = null; purchases = null; sig = ''; teaserSig = ''; popQueue = [];
    document.querySelectorAll('.ach-pop').forEach(p => p.remove()); popOpen = false;
  }

  const wrap = (name, make) => { const orig = window[name]; if (typeof orig === 'function') window[name] = make(orig); };

  // 登录 / 登出
  wrap('startCloudSync', orig => function (uid) {
    resetState();
    const r = orig.apply(this, arguments);
    try {
      unsubW = db.collection('users').doc(uid).collection('waste').onSnapshot(s => { wasteDocs = s.docs.map(d => d.data()); evaluate(false); }, e => console.warn('achievements: waste', e));
      unsubP = db.collection('users').doc(uid).collection('purchases').onSnapshot(s => { purchases = s.docs.map(d => d.data()); evaluate(false); }, e => { purchases = null; console.warn('achievements: purchases', e); });
    } catch (e) { console.error(e); }
    return r;
  });
  wrap('stopAllListeners', orig => function () { const r = orig.apply(this, arguments); resetState(); return r; });

  // 云端设置到了：载入进度
  wrap('applySettings', orig => function () {
    const r = orig.apply(this, arguments);
    try {
      if (!dirty) ach = normalise(settings.ach);
      if (!ready) { ready = true; quietUntil = Date.now() + 6000; }
      if (!ach.start) { ach.start = today(); mark(); }
      touchDay();
      evaluate(false);
    } catch (e) { console.error(e); }
    return r;
  });

  // 测验：quizBest 写进云端时判定
  wrap('saveSetting', orig => function (patch) {
    const r = orig.apply(this, arguments);
    if (patch && 'quizBest' in patch) evaluate(true);   // settings 已经在本地更新了，马上判定
    return r;
  });

  // 添加食材（手动、扫描收据、购买记录加入 pantry 都走 addFood）
  wrap('addFood', orig => async function () { const r = await orig.apply(this, arguments); bump('added'); touchDay(); evaluate(true); return r; });

  // 标记已食用（单个 / 批量）
  function credit(items) {
    items.forEach(f => {
      bump('consumed');
      const dl = daysLeft(f.expiry);
      if (dl >= 0) { bump('savedRM', Number(f.price) || 0); if (dl <= notifDays) bump('rescued'); }
    });
    touchDay(); evaluate(true);
  }
  wrap('eatFood', orig => async function (id) { const f = foods.find(x => x.id === id); const r = await orig.apply(this, arguments); if (f) credit([f]); return r; });
  wrap('bulkEat', orig => async function () {
    const items = Array.from(selectedIds).map(id => foods.find(x => x.id === id)).filter(Boolean);
    const r = await orig.apply(this, arguments);
    if (items.length) credit(items);
    return r;
  });

  // 购物清单打勾
  wrap('toggleShopCheck', orig => function (i) {
    const was = shopItems[i] && shopItems[i].checked;
    const r = orig.apply(this, arguments);
    if (shopItems[i] && !was && shopItems[i].checked) { bump('shopped'); evaluate(true); }
    return r;
  });

  // AI 菜单 / 收据入库（成功才算）
  wrap('generateAICustomMenu', orig => async function () {
    const r = await orig.apply(this, arguments);
    const box = $('recipes-list-container');
    if (box && box.querySelector('.ai-generated-html')) { bump('recipes'); evaluate(true); }
    return r;
  });
  wrap('addScannedItemsToInventory', orig => async function () {
    const n = scannedReceiptItems.length;
    const r = await orig.apply(this, arguments);
    if (n && scannedReceiptItems.length === 0) { bump('receipts'); evaluate(true); }
    return r;
  });

  // 页面切换：记录「去过哪些页面」+ 打开成就页时播放入场动画
  wrap('switchView', orig => function (v) {
    const r = orig.apply(this, arguments);
    try {
      if (ready && ALL_VIEWS.includes(v) && !ach.visited.includes(v)) { ach.visited.push(v); mark(); evaluate(true); }
      if (v === 'achievements') { intro = true; renderPage(true); markSeenSoon(); }
    } catch (e) { console.error(e); }
    return r;
  });

  // 首页卡片 + 侧边栏红点
  wrap('renderHome', orig => function () { const r = orig.apply(this, arguments); try { injectTeaser(); } catch (e) { console.error(e); } return r; });
  wrap('renderSidebar', orig => function () { const r = orig.apply(this, arguments); updateDot(); return r; });
  try { renderSidebar(); } catch (e) {}   // 如果已经登录，把「成就」入口补进侧边栏
})();
