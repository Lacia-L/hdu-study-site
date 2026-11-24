/* 杭电学习站 v2 —— 学院班级版
   功能：课程库浏览/搜索 · 学院班级培养计划 · 我的课程导入(学习通复制粘贴) ·
        课程学习/复习 · 分章习题练习 · 错题集(localStorage)
   数据源：data/courses.js(window.COURSES 68门课) + data/programs.js(window.PROGRAMS) */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* 课程名归一化：去括号注/空格/尾缀A1、A2、H 等 */
  function normName(n) {
    let s = String(n || '');
    s = s.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
    s = s.replace(/[\s，,]/g, '');
    s = s.replace(/[A-Za-z]?[12]$/, '');           // 高等数学A1 → 高等数学
    s = s.replace(/（[甲乙]）$/, '');               // 已被上面括号规则处理，双保险
    return s;
  }
  /* 站内课程索引：按归一化名称匹配 */
  const LIB = {};
  window.COURSES.forEach(c => { LIB[normName(c.name)] = c; });
  function findCourse(name) {
    const k = normName(name);
    if (!k) return null;
    if (LIB[k]) return LIB[k];
    if (k.length >= 3) {
      for (const key in LIB) {
        if (key.includes(k) || (k.includes(key) && key.length >= 3)) return LIB[key];
      }
    }
    return null;
  }

  /* ---------- 状态 ---------- */
  const K = { theme: 'hdu_theme', cls: 'hdu_myclass', mine: 'hdu_mycourses', wrong: 'hdu_wrongbook' };
  let state = {
    theme: store.get(K.theme, 'light'),
    myclass: store.get(K.cls, null),        // {collegeId, majorId}
    mine: store.get(K.mine, []),            // [{name, courseId|null}]
    wrong: store.get(K.wrong, {}),          // {courseId: [q,...]}
    cat: '全部', search: '', college: '全部', scope: 'all'
  };
  const saveMine = () => store.set(K.mine, state.mine);
  const saveWrong = () => { store.set(K.wrong, state.wrong); updateWrongCount(); };
  const wrongTotal = () => Object.values(state.wrong).reduce((a, b) => a + b.length, 0);
  function updateWrongCount() {
    const n = wrongTotal();
    $('#wrongCount').textContent = n ? `(${n})` : '';
  }

  /* ---------- 主题 ---------- */
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme === 'dark' ? 'dark' : 'light';
    $('#themeBtn').setAttribute('aria-label', state.theme === 'dark' ? '切换到浅色' : '切换到深色');
  }
  $('#themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    store.set(K.theme, state.theme); applyTheme();
  });

  /* ---------- 游戏层：XP / 等级 / 连续打卡 ---------- */
  const GK = 'hdu_game';
  const LEVELS = [0, 120, 300, 560, 900, 1350, 1950, 2700, 3600, 4700, 6000, 8000];
  const TITLES = ['新手上路', '勤学小将', '学习达人', '进阶学霸', '卷王本王', '学神'];
  const todayStr = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD
  let game = store.get(GK, null) || { xp: 0, streak: 0, lastCheck: '', checks: [] };
  function levelOf(xp) { let l = 1; for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) l = i + 1; return l; }
  function titleOf(l) { return TITLES[Math.min(TITLES.length - 1, Math.floor((l - 1) / 2))]; }
  function saveGame() { store.set(GK, game); }
  function addXp(n) { if (!n) return; game.xp += n; saveGame(); renderGame(); }
  function toast(msg) {
    let t = document.getElementById('hduToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'hduToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:300;background:#111827;color:#fff;padding:11px 18px;border-radius:14px;font-size:13px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.28);opacity:0;transition:opacity .25s,transform .25s;max-width:88vw;text-align:center;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(-6px)'; });
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%)'; }, 1900);
  }
  function renderGame() {
    const R = $('#gbRing'); if (!R) return;
    const l = levelOf(game.xp), cur = LEVELS[l - 1] || 0, next = LEVELS[l] || cur + 1;
    const pct = Math.max(0, Math.min(100, Math.round((game.xp - cur) / (next - cur) * 100)));
    R.style.setProperty('--p', pct);
    const set = (sel, v) => { const e = $(sel); if (e) e.textContent = v; };
    set('#gbLevel', l); set('#gbName', `Lv.${l} · ${titleOf(l)}`); set('#gbXpText', `${game.xp} XP`);
    set('#gbStreak', `🔥 连续 ${game.streak} 天`);
    const fill = $('#gbXpFill'); if (fill) fill.style.width = pct + '%';
    const btn = $('#gbCheckin');
    if (btn) {
      const done = game.lastCheck === todayStr();
      btn.classList.toggle('done', done); btn.disabled = done;
      btn.textContent = done ? '✅ 今日已打卡' : '📅 每日打卡';
    }
  }
  function doCheckin() {
    if (game.lastCheck === todayStr()) return;
    const y = new Date(Date.now() - 864e5).toLocaleDateString('sv');
    game.streak = (game.lastCheck === y) ? game.streak + 1 : 1;
    game.lastCheck = todayStr();
    if (!Array.isArray(game.checks)) game.checks = [];
    game.checks.push(game.lastCheck);
    saveGame(); addXp(20); renderGame();
    toast(`🎉 打卡成功，连续 ${game.streak} 天！+20 XP`);
  }
  (function wireGame() {
    const btn = $('#gbCheckin');
    if (btn) btn.addEventListener('click', doCheckin);
    renderGame();
  })();
  window.Game = { addXp, renderGame };

  /* ---------- 视图切换 ---------- */
  const VIEWS = ['home', 'viewPlan', 'viewMy', 'viewWrong', 'viewCourse'];
  function show(view, push) {
    VIEWS.forEach(v => { $('#' + v).hidden = (v !== view); });
    const activeNav = { home: 'home', viewPlan: 'plan', viewMy: 'my', viewWrong: 'wrong' }[view];
    $$('.nav-link, .bottomnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === activeNav));
    if (view === 'viewMy') renderMy();
    if (view === 'viewWrong') renderWrongbook();
    window.scrollTo({ top: 0 });
    if (push !== false) location.hash = ({ home: '', viewPlan: '#plan', viewMy: '#my', viewWrong: '#wrong', viewCourse: '' }[view] || '');
    refreshMath();
  }
  $$('[data-nav]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    const n = a.dataset.nav;
    show({ home: 'home', plan: 'viewPlan', my: 'viewMy', wrong: 'viewWrong' }[n]);
  }));

  /* 公式里的中文包进 \text{}，避免 KaTeX 数学模式警告 */
  function katexMath(t) {
    return String(t || '').replace(/[\u4e00-\u9fa5]+/g, m => '\\text{' + m + '}');
  }

  /* 公式卡片：兼容两种写法——
     1) 纯 LaTeX（老课程约定）：外层用 $$ 包裹，中文自动转 \\text{}；
     2) 已自带 \\(..\\) / \\[..\\] / $$ 分隔符（部分新课程把公式+行内说明一起写）：
        原样输出，交给 refreshMath 的 auto-render 按分隔符解析，避免 \\( 混进 $$ 造成 KaTeX 报错。 */
  function formulaMathHTML(t) {
    const s = String(t || '');
    if (/\\\(|\\\[|\$\$/.test(s)) return esc(s);
    return '$$' + esc(katexMath(s)) + '$$';
  }

  /* KaTeX 渲染 */
  /* KaTeX 按需加载：首屏不加载 20 个字体文件，只有渲染公式时才拉取 */
  let katexPromise = null;
  function ensureKatex() {
    if (katexPromise) return katexPromise;
    katexPromise = new Promise(resolve => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'assets/katex/katex.min.css?v=31';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'assets/katex/katex.min.js?v=31';
      js.onload = () => {
        const ar = document.createElement('script');
        ar.src = 'assets/katex/contrib/auto-render.min.js?v=31';
        ar.onload = () => resolve(true);
        ar.onerror = () => resolve(false);
        document.head.appendChild(ar);
      };
      js.onerror = () => resolve(false);
      document.head.appendChild(js);
    });
    return katexPromise;
  }
  window.ensureKatex = ensureKatex;

  function refreshMath() {
    if (!window.renderMathInElement && !window.katex) { ensureKatex().then(() => refreshMath()); return; }
    if (window.renderMathInElement) {
      try {
        renderMathInElement(document.body, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ], throwOnError: false, strict: false
        });
      } catch (e) {}
    }
  }

  /* ================= 首页：课程库（全校总目录） ================= */
  const CAT = window.CATALOG || [];
  const CAT_ORDER = ['通识公共课','学科基础课','专业课','实践环节','课外实践','通识选修'];
  const present = new Set(CAT.map(e => e.category));
  const CAT_CATS = ['全部', ...CAT_ORDER.filter(c => present.has(c)), ...[...present].filter(c => !CAT_ORDER.includes(c))];
  function catById(uid) { return CAT.find(e => e.uid === uid); }
  function catByName(nm) { const k = normName(nm); return CAT.find(e => normName(e.name) === k); }
  function renderPills() {
    $('#catPills').innerHTML = CAT_CATS.map(c =>
      `<button class="pill ${c === state.cat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    $$('#catPills .pill').forEach(b => b.addEventListener('click', () => { state.cat = b.dataset.cat; renderPills(); renderGrid(); }));
  }
  function renderCollegeFilter() {
    const sel = $('#collegeSel2'); if (!sel) return;
    const cols = [...new Set(CAT.flatMap(e => e.colleges))].sort();
    sel.innerHTML = `<option value="全部">全部学院（${cols.length}）</option>` +
      cols.map(c => `<option value="${esc(c)}" ${c === state.college ? 'selected' : ''}>${esc(c)}</option>`).join('');
    sel.onchange = () => { state.college = sel.value; renderGrid(); };
  }
  function renderScopeToggle() {
    $$('#scopeToggle .scope-btn').forEach(b => b.addEventListener('click', () => {
      state.scope = b.dataset.scope;
      $$('#scopeToggle .scope-btn').forEach(x => x.classList.toggle('active', x === b));
      renderGrid();
    }));
  }
  function catMatch(e, kw) {
    if (state.cat !== '全部' && e.category !== state.cat) return false;
    if (state.college && state.college !== '全部' && !e.colleges.includes(state.college)) return false;
    if (state.scope === 'built' && !e.hasContent) return false;
    if (!kw) return true;
    return e.name.toLowerCase().includes(kw) || e.majors.some(m => m.toLowerCase().includes(kw));
  }
  function renderGrid() {
    const kw = state.search.trim().toLowerCase();
    const list = CAT.filter(e => catMatch(e, kw));
    $('#searchEmpty').hidden = list.length > 0;
    const builtN = list.filter(e => e.hasContent).length;
    const lc = $('#libCount'); if (lc) lc.textContent = `共 ${list.length} 门 · 已建库 ${builtN} 门`;
    $('#courseGrid').innerHTML = list.map(e => {
      if (e.hasContent) {
        const c = window.COURSES.find(x => x.id === e.courseId) || {};
        const qs = (c.chapters || []).reduce((a, s) => a + (s.questions || []).length, 0);
        const chs = (c.chapters || []).length;
        return `<div class="course-card is-built" data-uid="${esc(e.uid)}">
          <div class="cc-top"><span class="cc-emoji">${esc((e.name || '课').trim().slice(0, 1))}</span>
            <span class="cc-name">${esc(e.name)}</span>
            <span class="cc-cat">${esc(e.category)}</span></div>
          <div class="cc-desc"><span>${esc(c.desc || '')}</span></div>
          <div class="cc-meta"><span class="tag ok">✓ 已建库</span><span>${chs} 章 · ${qs} 题</span><span class="go">学习 · 练习 →</span></div>
        </div>`;
      }
      const pub = e.majorCount >= 30 ? '全校通用' : (e.majorCount >= 8 ? `${e.majorCount} 个专业` : '专业专属');
      const cr = e.credit ? `<span>${esc(e.credit)} 学分</span>` : '';
      return `<div class="course-card is-todo" data-uid="${esc(e.uid)}">
        <div class="cc-top"><span class="cc-emoji cc-emoji-soft">${esc((e.name || '课').trim().slice(0, 1))}</span>
          <span class="cc-name">${esc(e.name)}</span>
          <span class="cc-cat">${esc(e.category)}</span></div>
      <div class="cc-desc"><span>${esc(e.nature || '')}${e.nature ? ' · ' : ''}${esc(e.colleges.slice(0, 3).join('、'))}${e.colleges.length > 3 ? ' 等' + e.colleges.length + ' 个学院' : ''}</span></div>
          <div class="cc-meta"><span class="tag plain">${esc(pub)}</span>${cr}<span>内容建设中</span><span class="go">查看目录 →</span></div>
        </div>`;
    }).join('');
    $$('#courseGrid .course-card').forEach(card =>
      card.addEventListener('click', () => openCatalogEntry(card.dataset.uid)));
  }
  $('#searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderGrid(); });

  /* 目录详情：只呈现真实来源信息，不编造内容 */
  function openCatalogEntry(uid) {
    const e = catById(uid); if (!e) return;
    if (e.hasContent) { openCourse(e.courseId); return; }
    const v = $('#viewCourse');
    const majors = e.majors.map(m => m.split('/').pop());
    v.innerHTML = `
      <div class="crumb"><a data-nav="home2">课程库</a> / ${esc(e.category)}</div>
      <div class="course-head">
        <div class="ch-top">
          <span class="ch-emoji" style="background:linear-gradient(135deg,#94A3B8,#64748B)">${esc((e.name || '课').trim().slice(0, 1))}</span>
          <div style="flex:1">
            <h2 class="ch-name">${esc(e.name)} <span class="ch-cat">${esc(e.category)}</span></h2>
            <div class="ch-meta"><span>覆盖 ${e.collegeCount} 个学院 · ${e.majorCount} 个专业</span>
              ${e.credit ? `<span>${esc(e.credit)} 学分</span>` : ''}
              <span>${e.majorCount >= 30 ? '全校通用课' : e.majorCount >= 8 ? '学科平台课' : '专业专属课'}</span></div>
          </div>
        </div>
        <div class="advice-card"><b>🚧 本课内容建设中。</b> 该课程来自杭电 2025 级本科教学计划总表，已收录进全校课程总目录；
          知识点讲解与配套习题正在按优先级（全校通用 → 学科平台 → 专业必修/选择性必修）逐门补充，补完并通过校对后开放学习。
          以下开课学院/专业、学分、课程性质等信息均取自教学计划总表的真实数据。</div>
        <div class="sec-label">开设本专业（${e.majors.length}）</div>
        <div class="kp-list">${majors.map(m => `<span class="kp">${esc(m)}</span>`).join('')}</div>
        <div class="sec-label">所属学院（${e.colleges.length}）</div>
        <div class="kp-list">${e.colleges.map(m => `<span class="kp">${esc(m)}</span>`).join('')}</div>
      </div>`;
    $('.crumb [data-nav]', v).addEventListener('click', (ev) => { ev.preventDefault(); show('home'); });
    show('viewCourse', false);
  }


  /* 首页「我的班级」快捷卡 */
  const P2 = window.PROGRAMS2 || { colleges: [], electives: [] };
  const P2BASE = parseInt((P2.grade || '2025')) || 2025;
  function p2college(name) { return P2.colleges.find(c => c.name === name); }
  function p2major(name, cname) { const c = p2college(cname); return c && c.majors.find(m => m.name === name); }
  function cnNo(i) { return ['一','二','三','四','五','六'][i - 1] || i; }
  function termSection(c) {
    const yi = parseInt(c.year);
    if (!yi) return { ln: 99, tn: 99, key: 'x-x', label: '开课学期待核对' };
    const ln = Math.max(1, yi - P2BASE + 1);
    const tn = parseInt(c.term) || 1;
    return { ln, tn, key: ln + '-' + tn, label: `第${cnNo(ln)}学年 · 第${tn}学期` };
  }
  function renderMyClassCard() {
    const box = $('#myClassCard');
    const mc = state.myclass;
    if (!mc || !mc.college) { box.hidden = true; return; }
    const col = p2college(mc.college); const mj = col && col.majors.find(m => m.name === mc.major);
    if (!col || !mj) { box.hidden = true; return; }
    let total = 0, libCount = 0;
    mj.courses.forEach(cs => { total++; if (findCourse(cs.name)) libCount++; });
    box.hidden = false;
    box.innerHTML = `<div><div class="t">我的专业：${esc(col.name)} · ${esc(mj.name)}</div>
      <div class="d">培养计划共 ${new Set(mj.courses.map(x=>x.name)).size} 门课（${total} 条排课），其中 ${libCount} 门已建学习库</div></div>
      <div class="ops">
        <button class="btn-primary" data-go="plan">查看我的培养计划</button>
        <button class="btn-ghost" data-clear="1">更换专业</button>
      </div>`;
    $('[data-go]', box).addEventListener('click', () => show('viewPlan'));
    $('[data-clear]', box).addEventListener('click', () => { state.myclass = null; store.del(K.cls); renderMyClassCard(); renderBadge(); });
    renderBadge();
  }
  function renderBadge() {
    const b = $('#myBadge'), mc = state.myclass;
    if (!mc || !mc.major) { b.hidden = true; return; }
    b.hidden = false; b.textContent = mc.major;
  }

  /* ================= 培养计划（2025 级全校教学计划） ================= */
  function renderPlanSelectors() {
    const sel = $('#collegeSel'); if (!sel) return;
    sel.innerHTML = P2.colleges.map(c =>
      `<option value="${esc(c.name)}">${esc(c.name)}（${c.majors.length}）</option>`).join('');
    if (state.myclass && state.myclass.college) sel.value = state.myclass.college;
    fillMajors(sel.value, state.myclass && state.myclass.major);
    sel.onchange = () => fillMajors(sel.value, null);
    const gsel = $('#gradeSel');
    if (gsel) { gsel.innerHTML = `<option>${esc(P2.grade || '2025')}级</option>`; gsel.disabled = true; }
  }
  function fillMajors(collegeName, pickMajor) {
    const msel = $('#majorSel'); if (!msel) return;
    const col = p2college(collegeName); if (!col) return;
    msel.disabled = false;
    msel.innerHTML = col.majors.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
    if (pickMajor && col.majors.some(m => m.name === pickMajor)) msel.value = pickMajor;
    renderPlanBody(collegeName, msel.value);
    msel.onchange = () => renderPlanBody(collegeName, msel.value);
  }
  function renderPlanBody(collegeName, majorName) {
    const col = p2college(collegeName); if (!col) return;
    const mj = col.majors.find(m => m.name === majorName) || col.majors[0];
    if (!mj) return;
    const uniq = {};
    mj.courses.forEach(c => { const k = normName(c.name); if (!uniq[k]) uniq[k] = c; });
    const totalU = Object.keys(uniq).length;
    let libU = 0; Object.values(uniq).forEach(c => { if (findCourse(c.name)) libU++; });
    $('#planSrc').innerHTML = `数据来源：<b>${esc(P2.source || '杭电本科教学计划总表')}</b> · ${esc(P2.grade)}级`;

    // 按学年学期分组
    const secs = {};
    mj.courses.forEach(c => { const t = termSection(c); (secs[t.key] = secs[t.key] || { label: t.label, ln: t.ln, tn: t.tn, rows: [] }).rows.push(c); });
    const secList = Object.values(secs).sort((a, b) => a.ln - b.ln || a.tn - b.tn);

    const body = $('#planBody');
    let html = `<div class="plan-layout">
      <aside class="plan-side">
        <h3 class="pj-name">${esc(mj.name)}</h3>
        <div class="pj-grade">${esc(col.name)} · ${esc(P2.grade)}级</div>
        <div class="ch-meta" style="margin-bottom:12px">
          <span>共 ${totalU} 门课</span><span>已建库 ${libU} 门</span><span>${secList.length} 个学期</span>
        </div>
        <div class="sec-label">课程类别分布</div>
        <div class="kp-list">${(() => { const m = {}; mj.courses.forEach(c => m[c.category] = (m[c.category] || 0) + 1);
          return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="kp">${esc(k)} ${v}</span>`).join(''); })()}</div>
        <div class="sec-label">数据说明</div>
        <p class="hint" style="margin:0">课程清单、学分、学时、开课部门、课程性质均来自 ${esc(P2.grade)} 级本科教学计划总表（学院官网公开）。已建库课程可进入完整学习·练习，未建库课程点开可查看其真实目录信息。</p>
      </aside>
      <div class="plan-main">`;

    secList.forEach(sec => {
      html += `<div class="group-card"><h3 class="group-title">${esc(sec.label)} <span class="n">${sec.rows.length} 门</span></h3>`;
      sec.rows.forEach(cs => {
        const hit = findCourse(cs.name);
        const catRow = catByName(cs.name);
        const isReq = (cs.nature || '').includes('必修') || (cs.nature || '').includes('核心');
        html += `<div class="course-row ${isReq ? 'is-core' : ''}">
          <span class="nm">${esc(cs.name)}</span>
          <span class="rp" style="color:var(--ink-3);font-size:11.5px">${esc(cs.credit ? cs.credit + '学分' : '')}${cs.credit && cs.category ? ' · ' : ''}${esc(cs.category || '')}${(cs.assess) ? ' · ' + esc(cs.assess) : ''}</span>
          <span class="ops">${hit
            ? `<a class="chip" data-go-course="${esc(hit.id)}">学习 · 练习</a>
               <button class="chip" data-add-my="${esc(cs.name)}">+ 我的课程</button>`
            : (catRow ? `<a class="chip" data-go-cat="${esc(catRow.uid)}">查看目录</a>` : `<span class="chip plain">未建库</span>`)
              + `<button class="chip" data-add-my="${esc(cs.name)}">+ 我的课程</button>`}</span>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div></div>`;
    body.innerHTML = html;
    $$('#planBody [data-go-course]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openCourse(a.dataset.goCourse); }));
    $$('#planBody [data-go-cat]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openCatalogEntry(a.dataset.goCat); }));
    $$('#planBody [data-add-my]').forEach(b => b.addEventListener('click', () => {
      addMine(b.dataset.addMy); b.textContent = '已加入'; setTimeout(() => { b.textContent = '+ 我的课程'; }, 1200);
    }));
  }

  $('#saveMyClass').addEventListener('click', () => {
    const college = $('#collegeSel').value, major = $('#majorSel').value;
    state.myclass = { college, major };
    store.set(K.cls, state.myclass);
    renderMyClassCard(); renderBadge();
    const btn = $('#saveMyClass'); btn.textContent = '已保存';
    setTimeout(() => { btn.textContent = '设为我的专业'; }, 1500);
  });


  /* ================= 我的课程（导入） ================= */
  function addMine(rawName) {
    const nm = rawName.trim().replace(/\s+/g, ' ');
    if (!nm) return;
    if (state.mine.some(m => normName(m.name) === normName(nm))) return;
    const hit = findCourse(nm);
    state.mine.push({ name: nm, courseId: hit ? hit.id : null });
    saveMine();
  }
  /* 解析粘贴文本：兼容课程清单/培养计划表格。
     每行提取"中文课程名"，剔除学分(如 3.0)、学时、学期、必修/选修、课程代码等杂质。 */
  function parseCourseLines(txt) {
    const JUNK_TOKEN = /^(\d+(\.\d+)?|\d+周|\d+学时|\d+学分|第?[一二三四五六七八九十\d]+学期|必修|选修|限选|任选|考试|考查|学分|学时|周数|备注|学期|开课学期|考核方式|通识必修|通识选修|公共必修|公共选修|学科必修|学科选修|专业必修|专业选修|实践必修|实践选修|必修课|选修课|实践课|实践环节|课内教学|通识公共课|学科\(?专业\)?基础课|专业课|通识|学科|专业|公共|数理类|军体类|思政类|综合素?养类?)$/;
    const out = [];
    String(txt || '').split(/[\n\r]+/).forEach(rawLine => {
      let line = rawLine.trim().replace(/\s+/g, ' ');
      if (!line) return;
      // 整行丢弃：表头/标题/说明行
      if (/计划表|指导性教学计划|课程名称|培养方案|课程类别|课程性质|毕业要求|课程代码|修读要求|注\d|^[-—=#*\d\s]+$/.test(line)) return;
      line.split(/[、，,;；|]+/).forEach(seg0 => {
        let seg = seg0.trim().replace(/\s+/g, ' ');
        if (!seg || seg.length < 2 || seg.length > 40) return;
        // 逐 token 过滤杂质
        const kept = seg.split(' ').filter(t => {
          if (!t) return false;
          if (/[A-Z]{2,}\d{4,}/.test(t) || /^[A-Z]\d{5,}\*?$/.test(t)) return false; // 课程代码
          if (JUNK_TOKEN.test(t)) return false;               // 类别/性质/学分/学期
          if (/^\d+(\.\d+)?$/.test(t)) return false;         // 数字
          return true;
        });
        seg = kept.join(' ').trim();
        if (!seg || seg.length < 2 || seg.length > 30) return;
        if (!/[\u4e00-\u9fa5]/.test(seg)) return;
        if (/^[\u4e00-\u9fa5]{1,4}(类|环节|模块|要求|说明|课程)$/.test(seg)) return;
        if (!out.includes(seg)) out.push(seg);
      });
    });
    return out;
  }
  $('#importBtn').addEventListener('click', () => {
    const txt = $('#importText').value;
    const parts = parseCourseLines(txt);
    let added = 0;
    parts.forEach(p => { const before = state.mine.length; addMine(p); if (state.mine.length > before) added++; });
    $('#importText').value = '';
    renderMy();
    alert(`解析完成：识别出 ${parts.length} 条，新增 ${added} 门课程。`);
  });
  $('#clearMyBtn').addEventListener('click', () => {
    if (confirm('确定清空我的课程清单？')) { state.mine = []; saveMine(); renderMy(); }
  });
  function renderMy() {
    const body = $('#myBody');
    if (!state.mine.length) {
      body.innerHTML = `<div class="empty-tip">还没有导入课程。把培养计划或课程名单粘贴到上面即可</div>`;
      $('#adviceBody').innerHTML = '';
      return;
    }
    let html = '';
    state.mine.forEach((m, i) => {
      const hit = m.courseId ? window.COURSES.find(c => c.id === m.courseId) : null;
      html += `<div class="my-row">
        <span class="nm">${esc(m.name)}</span>
        ${hit ? `<span class="tag ok">已匹配站内库：${esc(hit.name)}（${(hit.chapters || []).length}章 / ${(hit.chapters || []).reduce((a, s) => a + (s.questions || []).length, 0)}题）</span>
          <span class="ops"><a class="chip" data-go="${esc(hit.id)}">学习</a>
          <a class="chip" data-quiz="${esc(hit.id)}">练习</a></span>`
        : `<span class="tag no">未建库 · 可对照培养计划复习</span>
          <span class="ops"><button class="chip" data-del="${i}">移除</button></span>`}
      </div>`;
    });
    body.innerHTML = html;
    $$('#myBody [data-go]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openCourse(a.dataset.go); }));
    $$('#myBody [data-quiz]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openQuiz(a.dataset.quiz); }));
    $$('#myBody [data-del]').forEach(b => b.addEventListener('click', () => {
      state.mine.splice(+b.dataset.del, 1); saveMine(); renderMy();
    }));
    renderAdvice();
  }
  /* 复习建议：基于错题统计 */
  function renderAdvice() {
    const box = $('#adviceBody');
    const wrong = state.wrong;
    const entries = Object.entries(wrong).filter(([, v]) => v.length);
    if (!entries.length) {
      box.innerHTML = `<div class="advice-card"><h3>复习建议</h3><p class="plan-tip">暂无错题记录。先去「练习」里做几组题，系统会根据你的错题分布给出针对性建议。</p></div>`;
      return;
    }
    const rows = entries.map(([cid, qs]) => {
      const c = window.COURSES.find(x => x.id === cid);
      const chapCount = {};
      qs.forEach(q => { chapCount[q.chTitle] = (chapCount[q.chTitle] || 0) + 1; });
      const weak = Object.entries(chapCount).sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([t, n]) => `${t}(${n}题)`).join('、');
      return { name: c ? c.name : cid, n: qs.length, weak, id: cid };
    }).sort((a, b) => b.n - a.n);
    box.innerHTML = `<div class="advice-card"><h3>复习建议 · 按错题分布生成</h3>
      <ol>${rows.map(r => `<li><b>${esc(r.name)}</b>：错题 ${r.n} 道，最薄弱章节 → ${esc(r.weak)}。建议先重读这些章节的知识点，再做「${esc(r.name)} · 练习」巩固。
        <a class="chip" data-go="${esc(r.id)}">去复习</a></li>`).join('')}</ol></div>`;
    $$('#adviceBody [data-go]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openCourse(a.dataset.go); }));
  }

  /* ================= 课程详情 ================= */
  let curCourse = null;
  function openCourse(id) {
    const c = window.COURSES.find(x => x.id === id);
    if (!c) return;
    curCourse = c;
    const v = $('#viewCourse');
    const chs = c.chapters || [];
    const qs = chs.reduce((a, s) => a + (s.questions || []).length, 0);
    v.innerHTML = `
      <div class="crumb"><a data-nav="home2">课程库</a> / ${esc(c.category)}</div>
      <div class="course-head">
        <div class="ch-top">
          <span class="ch-emoji">${esc((c.name || '课').trim().slice(0, 1))}</span>
          <div style="flex:1">
            <h2 class="ch-name">${esc(c.name)} <span class="ch-cat">${esc(c.category)}</span></h2>
            <p class="ch-desc">${esc(c.desc)}</p>
            <div class="ch-meta">${(c.meta || []).map(m => `<span>${esc(m)}</span>`).join('')}
              <span>${chs.length} 章 · ${qs} 题</span></div>
          </div>
        </div>
        <div class="tabs">
          <button class="tab active" data-tab="learn">学习</button>
          <button class="tab" data-tab="review">复习</button>
          <button class="tab" data-tab="quiz">练习</button>
          <button class="tab" data-tab="papers">模拟卷</button>
        </div>
        <div id="tabBody"></div>
      </div>`;
    $('.crumb [data-nav]', v).addEventListener('click', (e) => { e.preventDefault(); show('home'); });
    $$('.tab', v).forEach(t => t.addEventListener('click', () => {
      $$('.tab', v).forEach(x => x.classList.remove('active')); t.classList.add('active');
      renderTab(t.dataset.tab);
    }));
    show('viewCourse', false);
    renderTab('learn');
  }
  function renderTab(tab) {
    const c = curCourse, body = $('#tabBody');
    const chs = c.chapters || [];
    if (tab === 'learn') {
      let html = '';
      chs.forEach(s => {
        html += `<div class="section-card">
          <h3>${esc(s.chapter || '')} · ${esc(s.title || '')}</h3>
          <div class="kp-list">${(s.knowledgePoints || []).map(k => `<span class="kp">${esc(k)}</span>`).join('')}</div>
          ${s.hint ? `<p class="hint">${esc(s.hint)}</p>` : ''}
        </div>`;
      });
      const mods = c.modules || [];
      if (mods.length) {
        html += `<div class="mod-toolbar">
          <span class="mod-tip">展开任意一章看「书面讲解 + 通俗理解」</span>
          <span class="mod-act"><button type="button" data-modall="open">展开全部</button><button type="button" data-modall="close">收起全部</button></span>
        </div>`;
      }
      mods.forEach((m, mi) => {
        const secs = (m.sections || []).map(sec =>
          `<p><b>${esc(sec.h4 || '')}</b></p><div>${sec.body || ''}</div>`).join('');
        const terms = (m.terms || []).map(t => `<div class="term">
            <div class="term-name">${esc(t.name || '')}</div>
            ${t.plain ? `<div class="term-plain"><span class="lbl">通俗说</span>${t.plain}</div>` : ''}
            ${t.example ? `<div class="term-ex"><span class="lbl">举例</span>${t.example}</div>` : ''}
          </div>`).join('');
        html += `<details class="mod"${mi === 0 ? ' open' : ''}><summary>${esc(m.index || '')} ${esc(m.title || '')}</summary>
          <div class="body">${m.sub ? `<p class="mod-sub">${esc(m.sub)}</p>` : ''}${secs}
          ${terms ? `<div class="mod-terms"><div class="mod-terms-h">通俗理解</div>${terms}</div>` : ''}</div></details>`;
      });
      body.innerHTML = html || '<div class="empty-tip">该课程暂无章节讲解</div>';
      $$('#tabBody [data-modall]').forEach(b => b.addEventListener('click', () => {
        const open = b.dataset.modall === 'open';
        $$('#tabBody details.mod').forEach(d => { d.open = open; });
      }));
    } else if (tab === 'review') {
      let html = '';
      chs.forEach(s => {
        html += `<div class="section-card">
          <h3>${esc(s.chapter || '')} · ${esc(s.title || '')}</h3>
          <div class="kp-list">${(s.knowledgePoints || []).map(k => `<span class="kp">${esc(k)}</span>`).join('')}</div>
          <div class="ops"><button class="btn-primary" data-quiz-ch="${esc(s.chapter || '')}">练这一章 · ${(s.questions || []).length} 题</button></div>
        </div>`;
      });
      if ((c.formulas || []).length) {
        html += `<div class="section-card"><h3>公式卡片</h3><div class="formula-grid">` +
          c.formulas.map(f => `<div class="formula-card"><div class="t">${esc(f.title)}</div>
            <div class="m">${formulaMathHTML(f.math)}</div><div class="n">${esc(f.note || '')}</div></div>`).join('') +
          `</div></div>`;
      }
      body.innerHTML = html || '<div class="empty-tip">暂无复习内容</div>';
      $$('#tabBody [data-quiz-ch]').forEach(b => b.addEventListener('click', () => {
        const s = chs.find(x => (x.chapter || '') === b.dataset.quizCh);
        if (s) startQuiz(c, [s], `${c.name} · ${s.chapter}`);
      }));
    } else if (tab === 'quiz') {
      body.innerHTML = `<div class="section-card"><h3>分章练习</h3>
        <p class="plan-tip">选择章节开始练习；答错的题自动进入「错题集」。</p>
        ${chs.map(s => `<div class="course-row"><span class="nm">${esc(s.chapter)} · ${esc(s.title)}</span>
          <span class="ops"><button class="chip" data-ch="${esc(s.chapter)}">开始 ${(s.questions || []).length} 题</button></span></div>`).join('')}
        ${chs.length ? `<div class="course-row"><span class="nm"><b>整门课混合练习</b></span>
          <span class="ops"><button class="chip" data-ch="__ALL__">开始 ${chs.reduce((a, s) => a + (s.questions || []).length, 0)} 题</button></span></div>` : ''}
      </div>`;
      $$('#tabBody [data-ch]').forEach(b => b.addEventListener('click', () => {
        const list = b.dataset.ch === '__ALL__' ? chs : chs.filter(x => x.chapter === b.dataset.ch);
        if (list.length) startQuiz(c, list, b.dataset.ch === '__ALL__' ? `${c.name} · 全书混合` : `${c.name} · ${b.dataset.ch}`);
      }));
    } else if (tab === 'papers') {
      const papers = c.papers || [];
      body.innerHTML = papers.length ? papers.map((p, i) =>
        `<div class="section-card"><h3>${esc(p.title || p.paper)}</h3>
          <p class="plan-tip">${esc(p.hint || '')}（${(p.questions || []).length} 题）</p>
          <button class="btn-primary" data-paper="${i}">开始作答</button></div>`).join('')
        : '<div class="empty-tip">该课程暂无模拟卷</div>';
      $$('#tabBody [data-paper]').forEach(b => b.addEventListener('click', () => {
        const p = papers[+b.dataset.paper];
        startQuiz(c, [{ chapter: p.paper || '模拟卷', title: p.title, questions: p.questions || [] }], `${c.name} · ${p.paper || '模拟卷'}`);
      }));
    }
    refreshMath();
  }

  /* ================= 练习答题 ================= */
  const DIFF = { easy: '基础', mid: '进阶', hard: '挑战' };
  /* 知识点归一化 key：优先 tags[0]，否则去掉「📎 知识点：」前缀的 kp */
  function normKp(q) {
    if (q && q.tags && q.tags[0]) return String(q.tags[0]).trim();
    if (q && q.kp) return String(q.kp).replace(/^[^一-龥A-Za-z0-9]+/, '').replace(/^知识点[:：]?\s*/, '').trim();
    return '';
  }
  /* 全站知识点索引：key -> [{__cid, chTitle, q}]，懒加载 */
  let __KP_INDEX = null;
  function kpIndex() {
    if (__KP_INDEX) return __KP_INDEX;
    const map = {};
    (window.COURSES || []).forEach(c => (c.chapters || []).forEach(ch => (ch.questions || []).forEach(q => {
      const k = normKp(q);
      if (!k) return;
      (map[k] = map[k] || []).push({ __cid: c.id, chTitle: `${ch.chapter || ''} ${ch.title || ''}`.trim(), q });
    })));
    return (__KP_INDEX = map);
  }
  function optionLetterFromAnswer(ansHtml) {
    const txt = String(ansHtml || '').replace(/<[^>]+>/g, '');
    const m = txt.match(/[A-Z]/);
    return m ? m[0] : null;
  }
  function startQuiz(course, chapters, label) {
    const v = $('#viewCourse');
    const all = [];
    chapters.forEach(s => (s.questions || []).forEach(q => all.push({ ...q, chTitle: `${s.chapter || ''} ${s.title || ''}`.trim(), __cid: q.__cid || s.__cid || course.id })));
    if (!all.length) { alert('该章节暂无题目'); return; }
    let idx = 0, right = 0, wrongList = [];
    /* 同类题再练：答错后把同知识点的其它题插到当前题后面，最多 2 道，去重，不对同类题再派生 */
    function stemKey(x) { return String((x && x.stem) || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').slice(0, 48); }
    function addVariants(q) {
      if (q._variant) return 0;
      const k = normKp(q); if (!k) return 0;
      const pool = kpIndex()[k] || [];
      const sameCourse = pool.filter(o => o.__cid === course.id);
      const cand = (sameCourse.length ? sameCourse : pool).map(o => o.q);
      const seen = new Set(all.map(x => stemKey(x)));
      const extra = [];
      for (const x of cand) {
        const key = stemKey(x);
        if (!key || seen.has(key)) continue;
        seen.add(key); extra.push(x);
        if (extra.length >= 2) break;
      }
      if (!extra.length) return 0;
      extra.forEach((x, i) => {
        all.splice(idx + 1 + i, 0, { ...x, chTitle: `同类巩固 · ${k}`, __cid: x.__cid || course.id, _variant: true });
      });
      return extra.length;
    }
    v.innerHTML = `<div class="crumb"><a id="qzBack">返回课程</a> · ${esc(label)}</div>
      <div class="quiz-wrap">
        <div class="quiz-top"><span id="qzProg"></span><span id="qzScore"></span></div>
        <div class="qbar"><i id="qzBar" style="width:0%"></i></div>
        <div id="qzBody"></div>
      </div>`;
    $('#qzBack').addEventListener('click', () => openCourse(course.id));
    function paint() {
      const q = all[idx];
      $('#qzProg').textContent = `第 ${idx + 1} / ${all.length} 题 · ${q.chTitle}`;
      $('#qzScore').textContent = `答对 ${right} · 答错 ${wrongList.length}`;
      $('#qzBar').style.width = `${(idx / all.length) * 100}%`;
      const body = $('#qzBody');
      const isChoice = (q.type === '选择题' || q.type === '判断题') && (q.options || []).length >= 2;
      let html = `<div class="q-card">
        <div><span class="q-type">${esc(q.type || '题目')}</span><span class="q-diff">${DIFF[q.difficulty] || ''} ${esc(q.number || '')}</span>${q._variant ? '<span class="q-diff" style="color:var(--brand,#2563EB);font-weight:700"> 🎯 同类巩固</span>' : ''}</div>
        <div class="q-stem-wrap">${q.stem || ''}</div>`;
      if (isChoice) {
        html += `<div class="q-opts">${q.options.map((o, i) =>
          `<button class="q-opt" data-opt="${i}" data-k="${"ABCD"[i] || i + 1}">${esc(o.replace(/^\s*[A-H][．.、]\s*/, ""))}</button>`).join('')}</div>
          <div id="qzFeedback"></div>
          <div class="q-nav"><button class="btn-ghost" id="qzQuit">结束练习</button>
          <button class="btn-primary" id="qzNext" disabled>下一题 →</button></div>`;
      } else {
        html += `<details class="mod"><summary>做完了？点开看参考答案</summary>
          <div class="body"><p><b>参考答案：</b></p><div>${q.answer || ''}</div></div></details>
          <div class="q-selfops"><span>对照答案自评：</span>
            <button class="btn-primary" id="qzSelfRight">我答对了</button>
            <button class="btn-ghost" id="qzSelfWrong">我答错了</button></div>
          <div id="qzFeedback"></div>
          <div class="q-nav"><button class="btn-ghost" id="qzQuit">结束练习</button>
          <button class="btn-primary" id="qzNext" disabled>下一题 →</button></div>`;
      }
      body.innerHTML = html + '</div>';
      refreshMath();

      const ansLetter = isChoice ? optionLetterFromAnswer(q.answer) : null;
      let answered = false;
      function markWrong() {
        wrongList.push(q);
        const cid = q.__cid || course.id;
        const arr = (state.wrong[cid] || []).filter(x => !(x.number === q.number && x.chTitle === q.chTitle));
        arr.push({ ...q, chTitle: q.chTitle, ts: Date.now() });
        state.wrong[cid] = arr; saveWrong();
      }
      if (isChoice) {
        $$('#qzBody .q-opt').forEach(btn => btn.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const pick = 'ABCDEFGH'[+btn.dataset.opt];
          const okPick = ansLetter && pick === ansLetter;
          $$('#qzBody .q-opt').forEach(b => {
            b.disabled = true;
            const bl = 'ABCDEFGH'[+b.dataset.opt];
            if (bl === ansLetter) b.classList.add('right');
          });
          if (!okPick) btn.classList.add('wrong');
          let varN = 0;
          if (okPick) { right++; if (window.Game) Game.addXp(q._variant ? 6 : 10); $('.q-card').classList.add('q-right-flash'); }
          else { markWrong(); varN = addVariants(q); }
          $('#qzScore').textContent = `答对 ${right} · 答错 ${wrongList.length}`;
          $('#qzFeedback').innerHTML = `<div class="q-explain">
            <div class="ans ${okPick ? '' : 'bad'}">${okPick ? `回答正确` : `答错了，正确答案：${esc(ansLetter || '见解析')}`}</div>
            <div class="cheer">${okPick ? cheerOf(CHEER_RIGHT) : cheerOf(CHEER_WRONG)}</div>
            <div>${q.explain || ''}</div>
            <div>${q.kp ? `<span class="kp">${esc(String(q.kp).replace(/^[^\u4e00-\u9fa5A-Za-z]+/, ''))}</span>` : ''}</div>
            ${(!okPick && varN) ? `<div class="cheer" style="color:var(--brand,#2563EB);font-weight:700">🎯 已加练 ${varN} 道同类题，趁热把这个知识点练透</div>` : ''}</div>`;
          $('#qzNext').disabled = false;
          refreshMath();
        }));
      } else {
        $('#qzSelfRight').addEventListener('click', () => {
          if (answered) return; answered = true; right++; if (window.Game) Game.addXp(8);
          $('#qzScore').textContent = `答对 ${right} · 答错 ${wrongList.length}`;
          $('#qzFeedback').innerHTML = `<div class="q-explain"><div class="ans">答对了</div><div class="cheer">${cheerOf(CHEER_RIGHT)}</div>
            <div>${q.explain || ''}</div></div>`;
          $('#qzNext').disabled = false;
          refreshMath();
        });
        $('#qzSelfWrong').addEventListener('click', () => {
          if (answered) return; answered = true; markWrong(); const varN = addVariants(q);
          $('#qzScore').textContent = `答对 ${right} · 答错 ${wrongList.length}`;
          $('#qzFeedback').innerHTML = `<div class="q-explain"><div class="ans">已收录进错题集</div><div class="cheer">${cheerOf(CHEER_WRONG)}</div>
            <div>${q.explain || ''}</div>
            ${varN ? `<div class="cheer" style="color:var(--brand,#2563EB);font-weight:700">🎯 已加练 ${varN} 道同类题，趁热把这个知识点练透</div>` : ''}</div>`;
          $('#qzNext').disabled = false;
          refreshMath();
        });
      }
      $('#qzNext').addEventListener('click', () => {
        idx++;
        if (idx >= all.length) finish(); else paint();
      });
      $('#qzQuit').addEventListener('click', () => { answered = true; finish(); });
    }
    function finish() {
      const acc = Math.round(right / all.length * 100);
      v.querySelector('.quiz-wrap').innerHTML = `<div class="q-card quiz-result">
        <div class="big">${acc >= 85 ? 'A' : acc >= 60 ? 'B' : 'C'}</div>
        <h3>练习完成：${esc(label)}</h3>
        <p class="sub">共 ${all.length} 题 · 答对 ${right} 题 · 正确率 ${acc}%<br>
        ${wrongList.length ? `错题 ${wrongList.length} 道已自动收进「错题集」，去重做它们吧。` : '全对，这一章可以过了'}</p>
        <p class="sub" style="color:var(--brand);font-weight:600">${acc >= 85 ? CHEER_HI[(Math.random()*CHEER_HI.length)|0] : acc >= 60 ? CHEER_MID[(Math.random()*CHEER_MID.length)|0] : CHEER_LOW[(Math.random()*CHEER_LOW.length)|0]}</p>
        <div class="ops" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn-primary" id="qzAgain">再来一遍</button>
          <button class="btn-ghost" id="qzBackCourse">返回课程</button>
          <button class="btn-ghost" id="qzGoWrong">查看错题集</button></div>
      </div>`;
      $('#qzAgain').addEventListener('click', () => startQuiz(course, chapters, label));
      $('#qzBackCourse').addEventListener('click', () => openCourse(course.id));
      $('#qzGoWrong').addEventListener('click', () => show('viewWrong'));
      location.hash = '';
    }
    paint();
    show('viewCourse', false);
  }
  function openQuiz(courseId) { openCourse(courseId); renderTab('quiz'); }

  /* ================= 错题集 ================= */
  function renderWrongbook() {
    const body = $('#wrongBody');
    const entries = Object.entries(state.wrong).filter(([, v]) => v.length);
    $('#wrongRedoAll').style.display = entries.length ? '' : 'none';
    $('#wrongClear').style.display = entries.length ? '' : 'none';
    if (!entries.length) {
      body.innerHTML = `<div class="empty-tip">错题集还是空的，继续保持<br>去课程练习页答题，答错的题会出现在这里。</div>`;
      return;
    }
    let html = '';
    entries.forEach(([cid, qs]) => {
      const c = window.COURSES.find(x => x.id === cid);
      html += `<div class="wb-course"><div class="wb-head">
        <h3>${esc(c ? c.name : cid)}</h3><span class="tag no">${qs.length} 道</span></div>`;
      qs.forEach((q, qi) => {
        const isChoice = (q.type === '选择题' || q.type === '判断题') && (q.options || []).length >= 2;
        html += `<div class="wb-q" data-cid="${esc(cid)}" data-qi="${qi}">
          <div class="meta">${esc(q.chTitle || '')} · ${esc(q.type || '')} · ${esc(q.number || '')} · 错于 ${new Date(q.ts || Date.now()).toLocaleDateString()}</div>
          <div class="q-stem-wrap" style="font-size:14px">${q.stem || ''}</div>
          <div class="ops">
            ${isChoice ? `<button class="chip" data-redo="1">重做</button>` : `<button class="chip" data-showans="1">看答案</button>
            <button class="chip" data-self="1">我已掌握（移除）</button>`}
            <button class="chip" data-remove="1">移除</button>
          </div>
          <div class="wb-fb"></div></div>`;
      });
      html += `</div>`;
    });
    body.innerHTML = html;
    $$('#wrongBody .wb-q').forEach(card => {
      const cid = card.dataset.cid, qi = +card.dataset.qi;
      const c = window.COURSES.find(x => x.id === cid);
      const q = state.wrong[cid][qi];
      const fb = $('.wb-fb', card);
      const removeQ = () => {
        state.wrong[cid].splice(qi, 1);
        if (!state.wrong[cid].length) delete state.wrong[cid];
        saveWrong(); renderWrongbook();
      };
      const ansLetter = optionLetterFromAnswer(q.answer);
      $('[data-showans]', card) && $('[data-showans]', card).addEventListener('click', () => {
        fb.innerHTML = `<div class="q-explain"><div class="ans">参考答案：${q.answer || ''}</div><div>${q.explain || ''}</div></div>`;
        refreshMath();
      });
      $('[data-self]', card) && $('[data-self]', card).addEventListener('click', removeQ);
      $('[data-remove]', card).addEventListener('click', removeQ);
      $('[data-redo]', card) && $('[data-redo]', card).addEventListener('click', () => {
        fb.innerHTML = `<div class="q-opts">${q.options.map((o, i) =>
          `<button class="q-opt" data-opt="${i}" data-k="${"ABCD"[i] || i + 1}">${esc(o.replace(/^\s*[A-H][．.、]\s*/, ""))}</button>`).join('')}</div>`;
        $$('button.q-opt', fb).forEach(btn => btn.addEventListener('click', () => {
          const pick = 'ABCDEFGH'[+btn.dataset.opt];
          if (ansLetter && pick === ansLetter) {
            btn.classList.add('right');
            fb.insertAdjacentHTML('beforeend', `<div class="q-explain"><div class="ans">答对了，已移出错题集</div></div>`);
            setTimeout(removeQ, 900);
          } else {
            btn.classList.add('wrong');
            fb.insertAdjacentHTML('beforeend', `<div class="q-explain"><div class="ans">仍不对，正确答案是 ${esc(ansLetter)}。</div><div>${q.explain || ''}</div></div>`);
            refreshMath();
          }
        }));
        refreshMath();
      });
    });
  }
  $('#wrongClear').addEventListener('click', () => {
    if (confirm('确定清空全部错题？')) { state.wrong = {}; saveWrong(); renderWrongbook(); }
  });
  $('#wrongRedoAll').addEventListener('click', () => {
    const entries = Object.entries(state.wrong).filter(([, v]) => v.length);
    if (!entries.length) return;
    const chapters = entries.map(([id, qs]) => {
      const cc = window.COURSES.find(x => x.id === id);
      const label = cc ? cc.name : id;
      return { chapter: '错题重做 · ' + label, title: '', __cid: id, questions: qs.map(q => ({ ...q, __cid: id })) };
    });
    startQuiz({ id: '__ghost__', name: '错题重做' }, chapters, '错题集 · 全部重做');
  });

  /* ================= 回到顶部 / hash 路由 ================= */
  window.addEventListener('scroll', () => {
    $('#backTop').classList.toggle('show', window.scrollY > 400);
  });
  $('#backTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));


  /* ================= 鼓励语 ================= */
  const CHEER_RIGHT = [
    '漂亮，这题拿下了', '稳！继续保持', '答得又快又准', '这波很扎实', '手感不错，乘胜追击',
    '知识点吃透了，真棒', '就是这种状态', '厉害，看来复习到位了', '思路很清晰', '满分操作',
    '对得漂亮，下一题也是你的', '这题完全没给你机会', '正确率就是这样一点点攒起来的', '稳稳的，很安心', '保持这个节奏'
  ];
  const CHEER_WRONG = [
    '没关系，错题才是进步的素材', '错一次记一次，考场上就不会错了', '别灰心，看看解析再走', '这题交给我帮你记住，重做时再见',
    '错得好，现在暴露比考试暴露强多了', '查漏补缺，正是复习的意义', '深呼吸，看一眼解析，下一题翻盘', '慢就是快，弄懂比刷量重要',
    '每个学霸都是从错题堆里站起来的', '这题有点意思，收进错题集慢慢盘', '不亏，赚到了一个知识点', '错题已收录，回头再战它',
    '搞不懂才是常态，搞懂就是升级', '这一步不算白走，解析看完就值', '稳住，正确率是练出来的'
  ];
  const DAILY_QUOTES = [
    '每天进步一点点，学期末就是一大截。',
    '复习的最佳时间是开学初，其次是现在。',
    '不求刷完所有题，但求每道题都有收获。',
    '把今天的错题弄懂，就是今天最好的成绩。',
    '专注 25 分钟，胜过心不在焉两小时。',
    '基础题不丢分，难题就有底气。',
    '你今天练的每一道题，都在为考试那天铺路。',
    '别和别人比进度，和昨天的自己比正确率。',
    '知识点的敌人不是难，是忘——所以要多回头。',
    '先看懂，再做题，最后讲给自己听。',
    '错题本是你的私人考官，多去看看它。',
    '今天也是离“学扎实”更近的一天。',
    '公式别背，用两道题把它焊在脑子里。',
    '累的时候做几道选择题，动起来就有状态。',
    '把手机放远一点，效率翻倍。',
    '一章一章啃，再厚的书也会变薄。',
    '现在多错一道，考试就少慌一分。',
    '慢慢来，比较快。',
    '复习的本质是重复，重复的尽头是牢固。',
    '今天的你，只需要比昨天多弄懂一个问题。',
    '相信积累的力量，题目不会辜负你。',
    '与其焦虑考试，不如现在做三道题。',
    '睡好觉，脑子才会好好帮你复习。',
    '写下“今天要复习哪章”，就成功了一半。',
    '看解析的时候慢一点，那是涨分最快的时刻。',
    '小步快跑，天天向上。',
    '考点就那些，每练一题就少一个盲区。',
    '坚持到这里的你，已经很了不起了。',
    '把“我不会”变成“我练过”。',
    '状态不好就刷简单题，找回信心再攻坚。',
    '行动是治愈焦虑的特效药。'
  ];
  const CHEER_HI = ['太稳了，这章基本拿捏', '这正确率，考试就这个感觉', '高手，是练出来的'];
  const CHEER_MID = ['正确率过半，接下来专攻错题就能再上一个台阶', '及格线上了，把错题重做一遍就能拉开差距', '有底子了，错题集里再捞一轮'];
  const CHEER_LOW = ['这轮是侦察，错题都记下了，重做一轮就是提升', '别急，从错题入手，第二轮会完全不一样', '起步阶段错了很正常，重要的是开始重做'];
  function cheerOf(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function dailyQuote() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const day = Math.floor((now - start) / 864e5);
    return DAILY_QUOTES[day % DAILY_QUOTES.length];
  }

  /* ================= 启动 ================= */
  const totalCh = window.COURSES.reduce((a, c) => a + (c.chapters || []).length, 0);
  const totalQ = window.COURSES.reduce((a, c) => a + (c.chapters || []).reduce((x, s2) => x + (s2.questions || []).length, 0), 0);
  const totalMj = (window.PROGRAMS2 && window.PROGRAMS2.stats ? window.PROGRAMS2.stats.majorCount : (window.PROGRAMS ? window.PROGRAMS.colleges.reduce((a, c) => a + c.majors.length, 0) : 0));
  const totalCol = (window.PROGRAMS2 && window.PROGRAMS2.stats) ? window.PROGRAMS2.stats.collegeCount : 0;
  const totalCat = (window.CATALOG || []).length;
  $('#heroSub').textContent = '杭电全校通用学习站：收录全部培养计划课程，选学院、专业、年级看计划，按章节学知识点，按题目练手，答错自动进错题集并推同类题再练。';
  $('#heroQuote').textContent = dailyQuote();
  $('#heroStats').innerHTML = `
    <div class="stat"><b>${totalCat}</b><span>门全校课程</span></div>
    <div class="stat"><b>${window.COURSES.length}</b><span>门已建库</span></div>
    <div class="stat"><b>${totalQ}</b><span>道练习题</span></div>
    <div class="stat"><b>${totalMj}</b><span>个专业方案</span></div>`;
  applyTheme(); renderPills(); renderCollegeFilter(); renderScopeToggle(); renderGrid(); renderMyClassCard(); renderPlanSelectors(); updateWrongCount();
  const h = location.hash;
  if (h === '#plan') show('viewPlan', false);
  else if (h === '#my') show('viewMy', false);
  else if (h === '#wrong') show('viewWrong', false);
  else show('home', false);
})();

/* 直接就绪：无开场动画 */
document.body.classList.add("ready");

/* ============ 启动加载层收尾 ============ */
(function(){
  const boot = document.getElementById('boot');
  if (!boot) return;
  const tip = document.getElementById('bootTip');
  const slow = setTimeout(() => {
    if (tip) tip.textContent = '网络较慢，仍在下载课程数据，请不要关闭页面…';
  }, 6000);
  const hide = () => {
    clearTimeout(slow);
    boot.classList.add('done');
    setTimeout(() => { boot.style.display = 'none'; }, 400);
  };
  if (document.readyState === 'complete') setTimeout(hide, 60);
  else window.addEventListener('load', () => setTimeout(hide, 60));
  // 兜底：即使个别资源失败也不让遮罩卡住
  setTimeout(hide, 25000);
})();
