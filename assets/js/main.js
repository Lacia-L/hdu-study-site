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
    cat: '全部', search: ''
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

  /* KaTeX 渲染 */
  function refreshMath() {
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

  /* ================= 首页：课程库 ================= */
  const CATS = ['全部', ...Object.keys(window.COURSES.reduce((m, c) => (m[c.category] = 1, m), {}))];
  function renderPills() {
    $('#catPills').innerHTML = CATS.map(c =>
      `<button class="pill ${c === state.cat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    $$('#catPills .pill').forEach(b => b.addEventListener('click', () => { state.cat = b.dataset.cat; renderPills(); renderGrid(); }));
  }
  function renderGrid() {
    const kw = state.search.trim().toLowerCase();
    const list = window.COURSES.filter(c => {
      if (state.cat !== '全部' && c.category !== state.cat) return false;
      if (!kw) return true;
      const hay = [c.name, c.desc, (c.chapters || []).map(s => (s.knowledgePoints || []).join(' ')).join(' ')].join(' ').toLowerCase();
      return hay.includes(kw);
    });
    $('#searchEmpty').hidden = list.length > 0;
    $('#courseGrid').innerHTML = list.map(c => {
      const qs = (c.chapters || []).reduce((a, s) => a + (s.questions || []).length, 0);
      const chs = (c.chapters || []).length;
      return `<div class="course-card" data-id="${esc(c.id)}">
        <div class="cc-top"><span class="cc-emoji">${esc((c.name || '课').trim().slice(0, 1))}</span>
          <span class="cc-name">${esc(c.name)}</span>
          <span class="cc-cat">${esc(c.category)}</span></div>
        <div class="cc-desc"><span>${esc(c.desc)}</span></div>
        <div class="cc-meta"><span>${chs} 章</span><span>${qs} 题</span><span class="go">学习 · 练习 →</span></div>
      </div>`;
    }).join('');
    $$('#courseGrid .course-card').forEach(card =>
      card.addEventListener('click', () => openCourse(card.dataset.id)));
  }
  $('#searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderGrid(); });

  /* 首页「我的班级」快捷卡 */
  function renderMyClassCard() {
    const box = $('#myClassCard');
    const mc = state.myclass;
    if (!mc) { box.hidden = true; return; }
    const col = window.PROGRAMS.colleges.find(c => c.id === mc.collegeId);
    const mj = col && col.majors.find(m => m.id === mc.majorId);
    if (!col || !mj) { box.hidden = true; return; }
    let libCount = 0, total = 0;
    if (mj.id === 'zy-jg') {
      window.COURSES.filter(c => c.category !== '通用参考').forEach(c => { total++; libCount++; });
    } else {
      Object.values(mj.groups || {}).forEach(arr => arr.forEach(nm => { total++; if (findCourse(nm)) libCount++; }));
    }
    box.hidden = false;
    box.innerHTML = `<div><div class="t">我的班级：${esc(col.name)} · ${esc(mj.name)}${mc.grade ? ' · ' + esc(mc.grade) : ''}</div>
      <div class="d">培养计划共 ${total} 门课，其中 ${libCount} 门已建学习库（知识点讲解+习题）</div></div>
      <div class="ops">
        <button class="btn-primary" data-go="plan">查看我的培养计划</button>
        <button class="btn-ghost" data-clear="1">更换班级</button>
      </div>`;
    $('[data-go]', box).addEventListener('click', () => show('viewPlan'));
    $('[data-clear]', box).addEventListener('click', () => { state.myclass = null; store.del(K.cls); renderMyClassCard(); renderBadge(); });
    renderBadge();
  }
  function renderBadge() {
    const b = $('#myBadge'), mc = state.myclass;
    if (!mc) { b.hidden = true; return; }
    const col = window.PROGRAMS.colleges.find(c => c.id === mc.collegeId);
    const mj = col && col.majors.find(m => m.id === mc.majorId);
    if (col && mj) { b.hidden = false; b.textContent = mj.name; } else b.hidden = true;
  }

  /* ================= 培养计划 ================= */
  function renderPlanSelectors() {
    const sel = $('#collegeSel'), msel = $('#majorSel');
    sel.innerHTML = window.PROGRAMS.colleges.map(c =>
      `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
    if (state.myclass) sel.value = state.myclass.collegeId;
    fillMajors(sel.value, state.myclass && state.myclass.majorId, state.myclass && state.myclass.grade);
    sel.onchange = () => fillMajors(sel.value, null);
  }
  function fillMajors(collegeId, pickId, pickGrade) {
    const msel = $('#majorSel');
    const col = window.PROGRAMS.colleges.find(c => c.id === collegeId);
    msel.disabled = false;
    msel.innerHTML = col.majors.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    if (pickId) msel.value = pickId;
    fillGrades(collegeId, msel.value, pickGrade);
    msel.onchange = () => fillGrades(collegeId, msel.value, null);
  }
  function fillGrades(collegeId, majorId, pickGrade) {
    const gsel = $('#gradeSel');
    const col = window.PROGRAMS.colleges.find(c => c.id === collegeId);
    const mj = col.majors.find(m => m.id === majorId);
    const grades = mj.grades || [mj.grade];
    gsel.disabled = grades.length <= 1;
    gsel.innerHTML = grades.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    if (pickGrade && grades.includes(pickGrade)) gsel.value = pickGrade;
    renderPlanBody(collegeId, majorId, gsel.value);
    gsel.onchange = () => renderPlanBody(collegeId, majorId, gsel.value);
  }
  function planCourseList(mj) {
    if (mj.id === 'zy-jg') {
      return [{ name: '__ALL_ZY__', groups: { '在修课程（学习通建库）': window.COURSES.filter(c => c.category !== '通用参考').map(c => c.name) } }];
    }
    return [mj];
  }
  function renderPlanBody(collegeId, majorId, grade) {
    const col = window.PROGRAMS.colleges.find(c => c.id === collegeId);
    const mj = col.majors.find(m => m.id === majorId);
    grade = grade || (mj.grades || [mj.grade])[0];
    const gi = (mj.grade_info || {})[grade] || { provenance: mj.provenance, src: mj.src };
    const isZY = mj.id === 'zy-jg';
    const groups = isZY
      ? { '在修课程（学习通建库）': window.COURSES.filter(c => c.category !== '通用参考').map(c => c.name) }
      : ((mj.groups_by_grade || {})[grade] || mj.groups || {});
    const total = Object.values(groups).reduce((a, arr) => a + arr.length, 0);
    let libCount = 0;
    Object.values(groups).forEach(arr => arr.forEach(nm => { if (findCourse(nm)) libCount++; }));
    const provText = { pdf: '官方培养方案 PDF', web: '官网公开页面', 'pdf+curated': '官方 PDF + 整理', curated: '公开资料整理', carried: '相近届次方案（该年级官方版暂未收录）' }[gi.provenance] || gi.provenance;

    $('#planSrc').innerHTML = `数据来源：<b>${esc(provText)}</b> · ${esc(gi.src)}`;
    const body = $('#planBody');
    let html = `<div class="plan-layout">
      <aside class="plan-side">
        <h3 class="pj-name">${esc(mj.name)}</h3>
        <div class="pj-grade">${esc(col.name)} · ${esc(grade)}</div>
        <div class="ch-meta" style="margin-bottom:12px">
          <span>共 ${total} 门课</span><span>已建库 ${libCount} 门</span>
        </div>
        <div class="hint" style="margin:0 0 12px">${esc(col.note || '')}</div>
        ${(mj.core || []).length ? `<div class="sec-label">专业核心课程</div>
        <div class="kp-list">${(mj.core || []).map(n => `<span class="kp">${esc(n)}</span>`).join('')}</div>` : ''}
        <div class="sec-label">数据可信度</div>
        <p class="hint" style="margin:0">${gi.provenance === 'curated'
          ? '该专业仅整理核心课程，非完整培养计划，请以教务处发布为准。'
          : gi.provenance === 'carried'
          ? esc(gi.src)
          : '课程清单来自学院官网公开的培养方案，按课程类别分组。'}</p>
      </aside>
      <div class="plan-main">`;

    Object.entries(groups).forEach(([g, arr]) => {
      html += `<div class="group-card"><h3 class="group-title">${esc(g)} <span class="n">${arr.length} 门</span></h3>`;
      arr.forEach(nm => {
        const hit = findCourse(nm);
        const core = (mj.core || []).some(c => normName(c) === normName(nm));
        html += `<div class="course-row ${core ? 'is-core' : ''}">
          <span class="nm">${esc(nm)}</span>
          <span class="ops">${hit
            ? `<a class="chip" data-go-course="${esc(hit.id)}">学习 · 练习</a>
               <button class="chip" data-add-my="${esc(nm)}">+ 我的课程</button>`
            : `<span class="chip plain">未建库</span>
               <button class="chip" data-add-my="${esc(nm)}">+ 我的课程</button>`}</span>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div></div>`;
    body.innerHTML = html;
    $$('#planBody [data-go-course]').forEach(a => a.addEventListener('click', (e) => {
      e.preventDefault(); openCourse(a.dataset.goCourse);
    }));
    $$('#planBody [data-add-my]').forEach(b => b.addEventListener('click', () => {
      addMine(b.dataset.addMy); b.textContent = '已加入'; setTimeout(() => { b.textContent = '+ 我的课程'; }, 1200);
    }));
  }

  $('#saveMyClass').addEventListener('click', () => {
    const collegeId = $('#collegeSel').value, majorId = $('#majorSel').value, grade = $('#gradeSel').value;
    state.myclass = { collegeId, majorId, grade };
    store.set(K.cls, state.myclass);
    renderMyClassCard(); renderBadge();
    $('#saveMyClass').textContent = '已保存';
    setTimeout(() => { $('#saveMyClass').textContent = '设为我的班级'; }, 1500);
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
      (c.modules || []).forEach(m => {
        html += `<details class="mod"><summary>${esc(m.index || '')} ${esc(m.title || '')}</summary>
          <div class="body">${(m.sections || []).map(sec =>
            `<p><b>${esc(sec.h4 || '')}</b></p><div>${sec.body || ''}</div>`).join('')}</div></details>`;
      });
      body.innerHTML = html || '<div class="empty-tip">该课程暂无章节讲解</div>';
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
            <div class="m">$$${katexMath(f.math)}$$</div><div class="n">${esc(f.note || '')}</div></div>`).join('') +
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
        <div><span class="q-type">${esc(q.type || '题目')}</span><span class="q-diff">${DIFF[q.difficulty] || ''} ${esc(q.number || '')}</span></div>
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
          if (okPick) { right++; $('.q-card').classList.add('q-right-flash'); }
          else markWrong();
          $('#qzScore').textContent = `答对 ${right} · 答错 ${wrongList.length}`;
          $('#qzFeedback').innerHTML = `<div class="q-explain">
            <div class="ans ${okPick ? '' : 'bad'}">${okPick ? `回答正确` : `答错了，正确答案：${esc(ansLetter || '见解析')}`}</div>
            <div class="cheer">${okPick ? cheerOf(CHEER_RIGHT) : cheerOf(CHEER_WRONG)}</div>
            <div>${q.explain || ''}</div>
            <div>${q.kp ? `<span class="kp">${esc(String(q.kp).replace(/^[^\u4e00-\u9fa5A-Za-z]+/, ''))}</span>` : ''}</div></div>`;
          $('#qzNext').disabled = false;
          refreshMath();
        }));
      } else {
        $('#qzSelfRight').addEventListener('click', () => {
          if (answered) return; answered = true; right++;
          $('#qzScore').textContent = `答对 ${right} · 答错 ${wrongList.length}`;
          $('#qzFeedback').innerHTML = `<div class="q-explain"><div class="ans">答对了</div><div class="cheer">${cheerOf(CHEER_RIGHT)}</div>
            <div>${q.explain || ''}</div></div>`;
          $('#qzNext').disabled = false;
          refreshMath();
        });
        $('#qzSelfWrong').addEventListener('click', () => {
          if (answered) return; answered = true; markWrong();
          $('#qzScore').textContent = `答对 ${right} · 答错 ${wrongList.length}`;
          $('#qzFeedback').innerHTML = `<div class="q-explain"><div class="ans">已收录进错题集</div><div class="cheer">${cheerOf(CHEER_WRONG)}</div>
            <div>${q.explain || ''}</div></div>`;
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
  const totalMj = window.PROGRAMS.colleges.reduce((a, c) => a + c.majors.length, 0);
  $('#heroSub').textContent = '给全校学生的复习站：选学院、专业、年级看培养计划，按章节学知识点，按题目练手，错题自动收进错题集。';
  $('#heroQuote').textContent = dailyQuote();
  $('#heroStats').innerHTML = `
    <div class="stat"><b>${window.COURSES.length}</b><span>门建库课程</span></div>
    <div class="stat"><b>${totalCh}</b><span>个章节</span></div>
    <div class="stat"><b>${totalQ}</b><span>道练习题</span></div>
    <div class="stat"><b>${totalMj}</b><span>个专业方案</span></div>`;
  applyTheme(); renderPills(); renderGrid(); renderMyClassCard(); renderPlanSelectors(); updateWrongCount();
  const h = location.hash;
  if (h === '#plan') show('viewPlan', false);
  else if (h === '#my') show('viewMy', false);
  else if (h === '#wrong') show('viewWrong', false);
  else show('home', false);
})();

/* 直接就绪：无开场动画 */
document.body.classList.add("ready");
