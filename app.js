/* OK수학 화면 로직 (바닐라 JS, 해시 라우팅, localStorage 저장) */
(function () {
  'use strict';
  const C = window.OKCore;
  const KEY = 'okmath.v1';
  const $ = (sel, el) => (el || document).querySelector(sel);
  const app = $('#app');
  const modal = $('#modal');

  // ------------------------------------------------------------- 저장소
  let db = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? C.normalizeDB(raw) : C.emptyDB();
    } catch (e) {
      console.error(e);
      return C.emptyDB();
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('저장에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.'); }
  }
  function findStudent(id) { return db.students.find(s => s.id === id); }
  function replaceStudent(s) {
    const clean = C.normalizeStudent(s);
    const i = db.students.findIndex(x => x.id === clean.id);
    if (i >= 0) db.students[i] = clean; else db.students.push(clean);
    save();
    return clean;
  }
  function hashParts() { return location.hash.replace(/^#\/?/, '').split('/'); }
  function currentStudent() { const p = hashParts(); return p[0] === 'student' ? findStudent(p[1]) : null; }

  // ------------------------------------------------------------- 표시 도우미
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => C.todayStr();
  const heroDate = () => { const d = new Date(); return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + '일월화수목금토'[d.getDay()] + '요일'; };
  const fmt = (n, unit) => (n === null || n === undefined ? '-' : n + (unit || ''));
  function trendHtml(t) {
    if (t === null || t === undefined) return '<span class="muted">-</span>';
    if (t > 0) return '<span class="up">▲ ' + t + '</span>';
    if (t < 0) return '<span class="down">▼ ' + Math.abs(t) + '</span>';
    return '<span class="muted">유지</span>';
  }
  const bar = (rate, cls) => '<div class="bar ' + (cls || '') + '"><span style="width:' + Math.max(0, Math.min(100, rate || 0)) + '%"></span></div>';
  const alertBadges = list => list.map(a => '<span class="badge ' + a.level + '">' + esc(a.text) + '</span>').join('');
  const icon = (name, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const stat = (label, value, unit, sub, ic, tone) =>
    '<div class="card stat' + (tone ? ' tone-' + tone : '') + '"><div class="stat-top"><span class="label">' + label + '</span>' + (ic ? '<span class="icon">' + icon(ic) + '</span>' : '') + '</div>' +
    '<div class="value">' + value + (value !== '-' && unit ? '<small>' + unit + '</small>' : '') + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  const initial = name => esc(String(name || '?').trim().charAt(0));
  const avatar = (s, lg) => '<span class="avatar' + (C.schoolOf(s.grade) === 'elem' ? ' elem' : '') + (lg ? ' lg' : '') + '" aria-hidden="true">' + initial(s.name) + '</span>';
  const progressCell = rate => '<div class="progress-cell">' + bar(rate) + '<span>' + rate + '%</span></div>';

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  const GL = g => C.gradeLabel(g);
  const gradeBadge = g => '<span class="badge ' + (C.schoolOf(g) === 'elem' ? 'elem' : '') + '">' + GL(g) + '</span>';
  function gradeOptions(selected, withGroups) {
    return Object.keys(C.SCHOOL_LEVELS).map(level => {
      const opts = C.GRADES.filter(g => g.school === level).map(g =>
        '<option value="' + g.key + '"' + (g.key === selected ? ' selected' : '') + '>' + g.label + '</option>').join('');
      return withGroups
        ? '<option value="' + level + '"' + (level === selected ? ' selected' : '') + '>' + C.SCHOOL_LEVELS[level] + ' 전체</option>' + opts
        : '<optgroup label="' + C.SCHOOL_LEVELS[level] + '">' + opts + '</optgroup>';
    }).join('');
  }
  /** 현재 학년을 맨 앞에, 나머지는 초1 → 중3 순서 */
  function gradesByDistance(cur) {
    cur = C.normalizeGrade(cur);
    return [cur].concat(C.GRADES.map(g => g.key).filter(k => k !== cur));
  }
  function unitOptionsHtml(selected, cur) {
    let html = '<option value="">단원 선택 안 함</option>';
    (cur ? gradesByDistance(cur) : C.GRADES.map(g => g.key)).forEach(g => {
      html += '<optgroup label="' + GL(g) + '">' + C.unitsOfGrade(g).map(u =>
        '<option value="' + u.id + '"' + (u.id === selected ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</optgroup>';
    });
    return html;
  }
  function defaultUnit(s) {
    const doing = C.unitsOfGrade(s.grade).find(u => s.progress[u.id] && s.progress[u.id].status === 'doing');
    return doing ? doing.id : '';
  }

  let chartSeq = 0;
  function lineChart(list) {
    if (!list.length) return '<p class="empty">평가를 기록하면 성적 추이 그래프가 그려집니다.</p>';
    const data = list.slice(-12);
    const W = 640, H = 220, L = 34, R = 18, T = 22, B = 32, iw = W - L - R, ih = H - T - B;
    const x = i => L + (data.length === 1 ? iw / 2 : i * iw / (data.length - 1));
    const y = v => T + ih - v / 100 * ih;
    const gid = 'chartFill' + (++chartSeq);
    let svg = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop class="fill-stop" offset="0" stop-opacity=".28"/><stop class="fill-stop" offset="1" stop-opacity="0"/></linearGradient></defs>';
    [0, 25, 50, 75, 100].forEach(v => {
      svg += '<line class="grid-line" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      svg += '<text class="axis-label" x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    });
    const pts = data.map((d, i) => x(i).toFixed(1) + ',' + y(d.pct).toFixed(1));
    svg += '<path class="area" style="fill:url(#' + gid + ')" d="M' + pts.join(' L') + ' L' + x(data.length - 1) + ',' + (T + ih) + ' L' + x(0) + ',' + (T + ih) + ' Z"/>';
    svg += '<path class="line" d="M' + pts.join(' L') + '"/>';
    data.forEach((d, i) => {
      svg += '<circle class="dot" cx="' + x(i) + '" cy="' + y(d.pct) + '" r="4.5"><title>' + esc(d.date + ' ' + d.type + ' ' + d.pct + '점') + '</title></circle>';
      svg += '<text class="val" x="' + x(i) + '" y="' + (y(d.pct) - 10) + '" text-anchor="middle">' + Math.round(d.pct) + '</text>';
      svg += '<text class="axis-label" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' + d.date.slice(5).replace('-', '/') + '</text>';
    });
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="성적 추이 그래프 (100점 환산)">' + svg + '</svg></div>';
  }

  // ------------------------------------------------------------- 모달 폼
  function openForm(cfg) {
    $('#modalTitle').textContent = cfg.title;
    $('#modalError').textContent = '';
    $('#modalSubmit').textContent = cfg.submitLabel || '저장';
    $('#modalBody').innerHTML = cfg.fields.map(fieldHtml).join('');
    modal._onSubmit = cfg.onSubmit;
    modal.showModal();
    const first = $('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) first.focus();
  }
  function fieldHtml(f) {
    const id = 'f_' + f.name;
    const v = f.value == null ? '' : f.value;
    const req = f.required ? ' required' : '';
    if (f.type === 'checkbox') {
      return '<label class="check full"><input type="checkbox" id="' + id + '" name="' + f.name + '"' + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    }
    let input;
    if (f.type === 'select') {
      const opts = f.optionsHtml || f.options.map(o => {
        const val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
        return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>';
      }).join('');
      input = '<select id="' + id + '" name="' + f.name + '"' + req + '>' + opts + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea id="' + id + '" name="' + f.name + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(v) + '</textarea>';
    } else {
      const extra = ['min', 'max', 'step'].map(k => (f[k] != null ? ' ' + k + '="' + f[k] + '"' : '')).join('');
      input = '<input type="' + (f.type || 'text') + '" id="' + id + '" name="' + f.name + '" value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '"' + extra + req + '>';
    }
    const full = f.full || f.type === 'textarea' ? ' class="full"' : '';
    return '<label' + full + ' for="' + id + '"><span>' + esc(f.label) + (f.required ? ' *' : '') + '</span>' + input + '</label>';
  }
  $('#modalForm').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const els = Array.from(form.elements).filter(el => el.name);
    const missing = els.find(el => el.required && !String(el.value).trim());
    if (missing) {
      const lab = missing.closest('label').querySelector('span').textContent.replace(' *', '');
      $('#modalError').textContent = lab + ' 항목을 입력해 주세요.';
      missing.focus();
      return;
    }
    const values = {};
    els.forEach(el => { values[el.name] = el.type === 'checkbox' ? el.checked : String(el.value).trim(); });
    try {
      modal._onSubmit(values);
      modal.close();
      route();
    } catch (err) {
      $('#modalError').textContent = err.message;
    }
  });
  modal.addEventListener('click', e => { if (e.target.hasAttribute('data-close') || e.target === modal) modal.close(); });

  // ------------------------------------------------------------- 폼 정의
  function studentForm(s) {
    s = s || {};
    openForm({
      title: s.id ? '학생 정보 수정' : '학생 추가',
      fields: [
        { name: 'name', label: '이름', value: s.name, required: true, placeholder: '홍길동' },
        { name: 'grade', label: '학년', type: 'select', optionsHtml: gradeOptions(s.grade || 'm1') },
        { name: 'school', label: '학교', value: s.school, placeholder: 'OK초등학교 / OK중학교' },
        { name: 'goal', label: '학습 목표', value: s.goal, placeholder: '기말 90점' },
        { name: 'phone', label: '학생 연락처', type: 'tel', value: s.phone },
        { name: 'parentPhone', label: '보호자 연락처', type: 'tel', value: s.parentPhone },
        { name: 'memo', label: '특이사항 메모', type: 'textarea', value: s.memo, placeholder: '학습 성향, 상담 내용 등' }
      ],
      onSubmit: v => {
        if (s.id) {
          replaceStudent(Object.assign({}, s, v));
          toast('학생 정보를 수정했습니다.');
        } else {
          const ns = C.createStudent(v);
          db.students.push(ns);
          save();
          toast(ns.name + ' 학생을 추가했습니다.');
          location.hash = '#/student/' + ns.id;
        }
      }
    });
  }

  const RECORDS = {
    tests: {
      label: '평가',
      fields: (s, it) => [
        { name: 'date', label: '날짜', type: 'date', value: it.date || today(), required: true },
        { name: 'type', label: '평가 유형', type: 'select', value: it.type || '단원평가', options: C.TEST_TYPES },
        { name: 'unitId', label: '단원', type: 'select', full: true, optionsHtml: unitOptionsHtml(it.id ? it.unitId : defaultUnit(s), s.grade) },
        { name: 'score', label: '점수', type: 'number', value: it.score, required: true, min: 0, step: 'any' },
        { name: 'total', label: '만점', type: 'number', value: it.total || 100, required: true, min: 1, step: 'any' },
        { name: 'memo', label: '메모', type: 'textarea', value: it.memo }
      ],
      validate: v => {
        const score = Number(v.score), total = Number(v.total);
        if (!(total > 0)) throw new Error('만점은 0보다 커야 합니다.');
        if (!(score >= 0) || score > total) throw new Error('점수는 0점 이상, 만점(' + total + ') 이하로 입력해 주세요.');
        v.score = score; v.total = total;
      }
    },
    wrongs: {
      label: '오답',
      fields: (s, it) => [
        { name: 'date', label: '날짜', type: 'date', value: it.date || today(), required: true },
        { name: 'type', label: '오답 원인', type: 'select', value: it.type || '개념 부족', options: C.WRONG_TYPES },
        { name: 'unitId', label: '단원', type: 'select', full: true, optionsHtml: unitOptionsHtml(it.id ? it.unitId : defaultUnit(s), s.grade) },
        { name: 'source', label: '문제 출처', value: it.source, full: true, placeholder: '예) 교재 p.52 3번', required: true },
        { name: 'memo', label: '틀린 이유 / 바른 풀이 메모', type: 'textarea', value: it.memo },
        { name: 'resolved', label: '다시 풀어서 해결함', type: 'checkbox', value: it.resolved }
      ]
    },
    logs: {
      label: '수업 기록',
      fields: (s, it) => [
        { name: 'date', label: '날짜', type: 'date', value: it.date || today(), required: true },
        { name: 'attendance', label: '출결', type: 'select', value: it.attendance || '출석', options: C.ATTENDANCE },
        { name: 'homework', label: '과제', type: 'select', value: it.homework || '완료', options: C.HOMEWORK },
        { name: 'content', label: '수업 내용', value: it.content, placeholder: '예) 연립방정식 활용 문제' },
        { name: 'memo', label: '메모', type: 'textarea', value: it.memo, placeholder: '수업 태도, 다음 과제 등' }
      ]
    }
  };

  function recordForm(kind, s, itemId) {
    const R = RECORDS[kind];
    const item = itemId ? s[kind].find(x => x.id === itemId) : {};
    if (!item) return;
    openForm({
      title: R.label + (itemId ? ' 수정' : ' 기록 추가'),
      fields: R.fields(s, item),
      onSubmit: v => {
        if (R.validate) R.validate(v);
        const list = s[kind].slice();
        if (itemId) list[list.findIndex(x => x.id === itemId)] = Object.assign({}, item, v);
        else list.push(Object.assign({ id: C.uid() }, v));
        replaceStudent(Object.assign({}, s, { [kind]: list }));
        toast(R.label + ' 기록을 저장했습니다.');
      }
    });
  }
  function deleteRecord(kind, s, itemId) {
    if (!confirm(RECORDS[kind].label + ' 기록을 삭제할까요?')) return;
    replaceStudent(Object.assign({}, s, { [kind]: s[kind].filter(x => x.id !== itemId) }));
    toast('삭제했습니다.');
    route();
  }

  // ------------------------------------------------------------- 화면: 대시보드
  function emptyHero() {
    return '<div class="card hero-empty"><div class="illust">' + icon('users') + '</div><h2>OK수학에 오신 것을 환영합니다</h2>' +
      '<p>학생을 등록하고 진도·평가·오답·수업 기록을 쌓으면 학생별 취약 단원 분석과 학부모 리포트가 자동으로 만들어집니다.</p>' +
      '<div class="row-actions"><button class="btn primary" data-action="add-student">' + icon('plus') + '첫 학생 추가</button>' +
      '<button class="btn" data-action="load-sample">샘플 데이터로 둘러보기</button></div>' +
      '<ul class="feature-list"><li><b>초1 ~ 중3 진도</b>2022 개정 단원별 상태와 이해도</li>' +
      '<li><b>자동 분석</b>취약 단원 · 성적 하락 알림</li><li><b>학부모 리포트</b>문자 복사 · PDF 저장</li></ul></div>';
  }

  function renderDashboard() {
    const d = C.dashboard(db, today());
    if (!d.count) {
      app.innerHTML = '<div class="page-head"><div><h1>대시보드</h1></div></div>' + emptyHero();
      return;
    }
    const attention = d.attention.length
      ? '<ul class="weak-list">' + d.attention.map((r, i) =>
        '<li class="clickable" data-href="#/student/' + r.student.id + '" tabindex="0"><span class="who"><span class="rank">' + (i + 1) + '</span>' + avatar(r.student) + esc(r.student.name) + ' <span class="muted small">' + GL(r.student.grade) + '</span></span>' +
        '<span class="alerts" style="margin:0">' + alertBadges(r.alerts) + '</span></li>').join('') + '</ul>'
      : '<p class="empty">지금은 특별히 관리가 필요한 학생이 없습니다.</p>';
    const rows = d.rows.slice().sort((a, b) => b.attention - a.attention || a.student.name.localeCompare(b.student.name, 'ko')).map(r =>
      '<tr class="clickable" data-href="#/student/' + r.student.id + '" tabindex="0">' +
      '<td><span class="name-cell">' + avatar(r.student) + esc(r.student.name) + '</span></td><td>' + gradeBadge(r.student.grade) + '</td>' +
      '<td>' + progressCell(r.progress.rate) + '</td>' +
      '<td>' + fmt(r.tests.recentAvg, '점') + '</td><td>' + trendHtml(r.tests.trend) + '</td>' +
      '<td>' + (r.wrongs.unresolved ? '<span class="badge mid">' + r.wrongs.unresolved + '</span>' : '<span class="badge ok">0</span>') + '</td>' +
      '<td class="hide-sm muted small">' + (r.last || '-') + '</td></tr>').join('');
    app.innerHTML =
      '<section class="hero"><div><span class="hero-date">' + heroDate() + '</span><h1>오늘의 학습 관리</h1>' +
      '<p>학생 ' + d.count + '명 중 <b>' + d.attention.length + '명</b>에게 관심이 필요해요.' + (d.unresolved ? ' 미해결 오답이 ' + d.unresolved + '문항 남아 있습니다.' : '') + '</p></div>' +
      '<div class="row-actions"><button class="btn" data-action="add-student">' + icon('plus') + '학생 추가</button><a class="btn glass" href="#/students">학생 목록</a></div></section>' +
      '<div class="grid cols-4">' +
      stat('관리 학생', d.count, '명', '초등 ' + d.rows.filter(r => C.schoolOf(r.student.grade) === 'elem').length + ' · 중등 ' + d.rows.filter(r => C.schoolOf(r.student.grade) === 'middle').length, 'users', 'violet') +
      stat('평균 진도율', fmt(d.avgProgress), '%', '현재 학년 과정 기준', 'target', 'green') +
      stat('최근 평균 점수', fmt(d.avgRecent), '점', '학생별 최근 3회 평균', 'chart') +
      stat('미해결 오답', d.unresolved, '문항', '전체 학생 합계', 'book', 'orange') + '</div>' +
      '<div class="card"><div class="card-head"><h2>' + icon('alert') + '관리가 필요한 학생 <span class="count">' + d.attention.length + '</span></h2><span class="muted small">성적 하락 · 60점 미만 · 결석 · 과제 · 오답 누적 기준</span></div>' + attention + '</div>' +
      '<div class="card"><div class="card-head"><h2>학생별 현황</h2></div><div class="table-wrap"><table>' +
      '<thead><tr><th>이름</th><th>학년</th><th>진도율</th><th>최근 평균</th><th>추세</th><th>미해결 오답</th><th class="hide-sm">마지막 기록</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  // ------------------------------------------------------------- 화면: 학생 목록
  const filter = { q: '', grade: '' };
  function renderStudents() {
    app.innerHTML =
      '<div class="page-head"><div><h1>학생 관리</h1><p>등록 학생 ' + db.students.length + '명</p></div>' +
      '<div class="toolbar"><label class="search">' + icon('search') + '<input type="search" id="q" placeholder="이름·학교 검색" aria-label="학생 검색" value="' + esc(filter.q) + '"></label>' +
      '<select id="gradeFilter" aria-label="학년 필터"><option value="">전체 학년</option>' + gradeOptions(filter.grade, true) + '</select>' +
      '<button class="btn primary" data-action="add-student">' + icon('plus') + '학생 추가</button></div></div><div id="studentList"></div>';
    $('#q').addEventListener('input', e => { filter.q = e.target.value; renderStudentList(); });
    $('#gradeFilter').addEventListener('change', e => { filter.grade = e.target.value; renderStudentList(); });
    renderStudentList();
  }
  function renderStudentList() {
    const q = filter.q.trim().toLowerCase();
    const list = db.students
      .filter(s => (!filter.grade || s.grade === filter.grade || C.schoolOf(s.grade) === filter.grade) && (!q || (s.name + ' ' + s.school).toLowerCase().includes(q)))
      .sort((a, b) => C.gradeOrder(a.grade) - C.gradeOrder(b.grade) || a.name.localeCompare(b.name, 'ko'));
    const box = $('#studentList');
    if (!db.students.length) { box.innerHTML = emptyHero(); return; }
    if (!list.length) { box.innerHTML = '<div class="card empty">검색 결과가 없습니다.</div>'; return; }
    box.innerHTML = '<div class="student-cards">' + list.map(s => {
      const pg = C.progressSummary(s), ts = C.testStats(s), ws = C.wrongStats(s), al = C.alerts(s, today());
      return '<a class="card student-card" href="#/student/' + s.id + '">' +
        '<div class="top">' + avatar(s) + '<div><div class="name">' + esc(s.name) + '</div><div class="school">' + (esc(s.school) || '학교 미입력') + '</div></div>' + gradeBadge(s.grade) + '</div>' +
        '<dl class="kv"><dt>진도</dt><dd>' + progressCell(pg.rate) + '</dd>' +
        '<dt>최근 평균</dt><dd>' + fmt(ts.recentAvg, '점') + ' ' + trendHtml(ts.trend) + '</dd>' +
        '<dt>미해결 오답</dt><dd>' + ws.unresolved + '문항</dd></dl>' +
        (al.length ? '<div class="alerts">' + alertBadges(al) + '</div>' : '') + '</a>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------- 화면: 학생 상세
  const TABS = [['overview', '개요'], ['progress', '진도'], ['tests', '평가'], ['wrongs', '오답노트'], ['logs', '수업일지'], ['report', '리포트']];
  let wrongFilter = 'open';

  function renderStudent(s, tab) {
    if (!TABS.some(t => t[0] === tab)) tab = 'overview';
    const meta = [s.school, s.goal && '목표: ' + s.goal, s.parentPhone && '보호자 ' + s.parentPhone].filter(Boolean).map(esc).join(' · ');
    app.innerHTML =
      '<div class="page-head no-print" style="margin-bottom:14px"><a href="#/students" class="back-link">' + icon('back') + '학생 목록</a></div>' +
      '<div class="card no-print"><div class="profile"><div class="profile-main">' + avatar(s, true) + '<div><h1>' + esc(s.name) + ' ' + gradeBadge(s.grade) + '</h1>' +
      '<div class="meta">' + (meta || '추가 정보 없음') + '</div>' + (s.memo ? '<p class="memo">' + esc(s.memo) + '</p>' : '') + '</div></div>' +
      '<div class="row-actions"><button class="btn" data-action="edit-student">정보 수정</button><button class="btn danger" data-action="delete-student">삭제</button></div></div></div>' +
      '<nav class="tabs no-print" aria-label="학생 메뉴">' + TABS.map(t => '<a href="#/student/' + s.id + '/' + t[0] + '" class="' + (t[0] === tab ? 'active' : '') + '">' + t[1] + '</a>').join('') + '</nav>' +
      '<div id="tabBody"></div>';
    renderTab(s, tab);
  }
  function renderTab(s, tab) {
    const body = $('#tabBody');
    const open = Array.from(body.querySelectorAll('details[open]')).map(d => d.dataset.grade);
    body.innerHTML = TAB_RENDER[tab](s);
    open.forEach(g => { const d = body.querySelector('details[data-grade="' + g + '"]'); if (d) d.open = true; });
  }

  const TAB_RENDER = {
    overview: s => {
      const pg = C.progressSummary(s), ts = C.testStats(s), ws = C.wrongStats(s), ls = C.logStats(s);
      const weak = C.weakUnits(s, 5), al = C.alerts(s, today());
      return '<div class="grid cols-4">' +
        stat('진도율 (' + GL(s.grade) + ')', pg.rate, '%', pg.done + '/' + pg.total + '단원 완료', 'target', 'green') +
        stat('최근 3회 평균', fmt(ts.recentAvg), '점', '추세 ' + trendHtml(ts.trend), 'chart') +
        stat('미해결 오답', ws.unresolved, '문항', '전체 ' + ws.total + '문항', 'book', 'orange') +
        stat('출석률', fmt(ls.attendRate), '%', '과제 수행률 ' + fmt(ls.homeworkRate, '%'), 'calendar', 'cyan') + '</div>' +
        '<div class="grid cols-2 mt">' +
        '<div class="card"><div class="card-head"><h2>' + icon('chart') + '성적 추이</h2><span class="muted small">100점 환산</span></div>' + lineChart(ts.list) + '</div>' +
        '<div class="card"><div class="card-head"><h2>' + icon('target') + '보완이 필요한 단원</h2></div>' +
        (weak.length ? '<ul class="weak-list">' + weak.map(w => '<li><b>' + esc(w.label) + '</b><span class="muted small">' + esc(w.reasons.join(' · ')) + '</span></li>').join('') + '</ul>'
          : '<p class="empty">평가·오답·이해도를 기록하면 취약 단원을 찾아 드립니다.</p>') +
        (al.length ? '<h3 style="margin-top:16px">관리 알림</h3><div class="alerts">' + alertBadges(al) + '</div>' : '') + '</div></div>';
    },

    progress: s => {
      const grades = gradesByDistance(s.grade);
      return grades.map(g => {
        const pg = C.progressSummary(s, g);
        const rows = C.unitsOfGrade(g).map(u => {
          const p = s.progress[u.id] || { status: 'todo', level: 0 };
          return '<div class="unit-row"><div><b>' + esc(u.name) + '</b>' + (p.updatedAt ? ' <span class="muted small">' + p.updatedAt + '</span>' : '') + '</div>' +
            '<div class="seg" role="group" aria-label="' + esc(u.name) + ' 진행 상태">' + Object.keys(C.STATUS).map(k =>
              '<button type="button" data-action="set-status" data-unit="' + u.id + '" data-status="' + k + '" aria-pressed="' + (p.status === k) + '">' + C.STATUS[k] + '</button>').join('') + '</div>' +
            '<select data-action="set-level" data-unit="' + u.id + '" aria-label="' + esc(u.name) + ' 이해도"><option value="0">이해도 -</option>' +
            [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (p.level === n ? ' selected' : '') + '>이해도 ' + n + ' ' + '★'.repeat(n) + '</option>').join('') + '</select></div>';
        }).join('');
        if (g === s.grade) {
          return '<div class="card"><div class="card-head"><h2>' + GL(g) + ' 과정 <span class="muted small">현재 학년</span></h2>' +
            '<div style="display:flex;gap:10px;align-items:center;min-width:230px">' + bar(pg.rate, 'green') + '<span class="small">' + pg.done + '/' + pg.total + ' 완료 (' + pg.rate + '%)</span></div></div>' + rows + '</div>';
        }
        return '<div class="card"><details class="grade-block" data-grade="' + g + '"><summary>' + GL(g) + ' 과정 (' + (C.gradeOrder(g) < C.gradeOrder(s.grade) ? '복습' : '선행') + ') · ' + pg.done + '/' + pg.total + ' 완료</summary>' + rows + '</details></div>';
      }).join('') + '<p class="muted small">단원은 2022 개정 교육과정 기준 대표 단원입니다 (초등은 1학기 → 2학기 순, 교과서에 따라 단원명이 다를 수 있음). 이전 학년은 복습, 다음 학년은 선행으로 표시됩니다. 이해도(1~5)가 2 이하인 단원은 취약 단원 분석에 반영됩니다.</p>';
    },

    tests: s => {
      const ts = C.testStats(s);
      const rows = ts.list.slice().reverse().map(t =>
        '<tr><td>' + t.date + '</td><td>' + esc(t.type) + '</td><td>' + esc(C.unitLabel(t.unitId)) + '</td>' +
        '<td>' + t.score + ' / ' + t.total + '</td><td><b>' + t.pct + '</b></td><td class="small muted">' + esc(t.memo) + '</td>' +
        '<td><div class="row-actions"><button class="btn sm" data-action="edit-tests" data-id="' + t.id + '">수정</button><button class="btn sm danger" data-action="delete-tests" data-id="' + t.id + '">삭제</button></div></td></tr>').join('');
      return '<div class="card"><div class="card-head"><h2>성적 추이</h2><button class="btn primary" data-action="add-tests">+ 평가 기록</button></div>' + lineChart(ts.list) + '</div>' +
        '<div class="card"><div class="card-head"><h2>평가 기록</h2><span class="muted small">' + ts.count + '건 · 전체 평균 ' + fmt(ts.avg, '점') + ' · 최고 ' + fmt(ts.best, '점') + '</span></div>' +
        (ts.count ? '<div class="table-wrap"><table><thead><tr><th>날짜</th><th>유형</th><th>단원</th><th>점수</th><th>환산</th><th>메모</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<p class="empty">아직 평가 기록이 없습니다.</p>') + '</div>';
    },

    wrongs: s => {
      const ws = C.wrongStats(s);
      const max = Math.max(1, ...C.WRONG_TYPES.map(t => ws.byType[t]));
      const list = s.wrongs.filter(w => wrongFilter === 'all' || !w.resolved).slice().reverse();
      const rows = list.map(w =>
        '<tr class="' + (w.resolved ? 'resolved' : '') + '"><td>' + w.date + '</td><td>' + esc(C.unitLabel(w.unitId)) + '</td><td>' + esc(w.source) + '</td>' +
        '<td><span class="badge ' + (w.type === '계산 실수' ? 'mid' : w.type === '개념 부족' ? 'high' : '') + '">' + esc(w.type) + '</span></td>' +
        '<td class="memo-cell small">' + esc(w.memo) + '</td>' +
        '<td><label class="small"><input type="checkbox" data-action="toggle-wrong" data-id="' + w.id + '"' + (w.resolved ? ' checked' : '') + '> 해결</label></td>' +
        '<td><div class="row-actions"><button class="btn sm" data-action="edit-wrongs" data-id="' + w.id + '">수정</button><button class="btn sm danger" data-action="delete-wrongs" data-id="' + w.id + '">삭제</button></div></td></tr>').join('');
      return '<div class="grid cols-2">' +
        '<div class="card"><div class="card-head"><h2>오답 원인 분석</h2><span class="muted small">총 ' + ws.total + '문항</span></div><div class="type-bars">' +
        C.WRONG_TYPES.map(t => '<div class="item"><span>' + t + '</span>' + bar(ws.byType[t] / max * 100, 'orange') + '<b>' + ws.byType[t] + '</b></div>').join('') + '</div></div>' +
        '<div class="card stat"><div class="label">해결 현황</div><div class="value">' + ws.resolved + '<small>/ ' + ws.total + ' 해결</small></div>' +
        bar(ws.total ? ws.resolved / ws.total * 100 : 0, 'green') +
        '<p class="small muted">' + (ws.mainType ? '가장 많은 원인은 <b>' + ws.mainType + '</b>입니다.' : '오답을 기록하면 원인을 분석해 드립니다.') + '</p></div></div>' +
        '<div class="card"><div class="card-head"><h2>오답노트</h2><div class="toolbar">' +
        '<button class="btn sm' + (wrongFilter === 'open' ? ' primary' : '') + '" data-action="wrong-filter" data-value="open">미해결 (' + ws.unresolved + ')</button>' +
        '<button class="btn sm' + (wrongFilter === 'all' ? ' primary' : '') + '" data-action="wrong-filter" data-value="all">전체 (' + ws.total + ')</button>' +
        '<button class="btn primary" data-action="add-wrongs">+ 오답 추가</button></div></div>' +
        (list.length ? '<div class="table-wrap"><table><thead><tr><th>날짜</th><th>단원</th><th>출처</th><th>원인</th><th>메모</th><th>상태</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<p class="empty">' + (ws.total ? '미해결 오답이 없습니다. 잘했어요!' : '아직 오답 기록이 없습니다.') + '</p>') + '</div>';
    },

    logs: s => {
      const ls = C.logStats(s);
      const rows = s.logs.slice().reverse().map(l =>
        '<tr><td>' + l.date + '</td><td><span class="badge ' + (l.attendance === '결석' ? 'high' : l.attendance === '지각' ? 'mid' : 'ok') + '">' + l.attendance + '</span></td>' +
        '<td>' + l.homework + '</td><td>' + esc(l.content) + '</td><td class="small muted">' + esc(l.memo) + '</td>' +
        '<td><div class="row-actions"><button class="btn sm" data-action="edit-logs" data-id="' + l.id + '">수정</button><button class="btn sm danger" data-action="delete-logs" data-id="' + l.id + '">삭제</button></div></td></tr>').join('');
      return '<div class="card"><div class="card-head"><h2>수업일지 · 출결 · 과제</h2><button class="btn primary" data-action="add-logs">+ 수업 기록</button></div>' +
        '<p class="small muted" style="margin-top:0">수업 ' + ls.count + '회 · 출석 ' + ls.present + ' · 지각 ' + ls.late + ' · 결석 ' + ls.absent + ' · 출석률 ' + fmt(ls.attendRate, '%') + ' · 과제 수행률 ' + fmt(ls.homeworkRate, '%') + '</p>' +
        (ls.count ? '<div class="table-wrap"><table><thead><tr><th>날짜</th><th>출결</th><th>과제</th><th>수업 내용</th><th>메모</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<p class="empty">아직 수업 기록이 없습니다.</p>') + '</div>';
    },

    report: s => {
      const r = C.buildReport(s, today());
      return '<div class="report">' +
        '<div class="card no-print"><div class="card-head"><h2>선생님 코멘트</h2><span class="muted small">리포트 마지막에 함께 표시됩니다</span></div>' +
        '<textarea id="reportNote" placeholder="예) 이번 달 수업 집중도가 많이 좋아졌습니다.">' + esc(s.reportNote) + '</textarea>' +
        '<div class="row-actions" style="margin-top:10px"><button class="btn" data-action="save-note">코멘트 저장</button>' +
        '<button class="btn" data-action="copy-report">문자용 텍스트 복사</button><button class="btn primary" data-action="print-report">인쇄 / PDF 저장</button></div></div>' +
        '<div class="card"><div class="report-paper" id="reportPaper">' +
        '<header><div><div class="rp-brand"><img src="icons/favicon.svg" alt="">OK수학</div><h2>' + esc(s.name) + ' 학생 학습 리포트</h2></div><div class="muted small" style="text-align:right">' + r.date + '<br>' + GL(s.grade) + (s.school ? ' · ' + esc(s.school) : '') + '</div></header>' +
        '<div class="report-kpis"><div><b>' + r.progress.rate + '%</b><span>진도율</span></div><div><b>' + fmt(r.tests.recentAvg) + '</b><span>최근 평균</span></div>' +
        '<div><b>' + r.wrongs.unresolved + '</b><span>미해결 오답</span></div><div><b>' + fmt(r.logs.attendRate, '%') + '</b><span>출석률</span></div></div>' +
        (r.tests.count ? lineChart(r.tests.list) : '') +
        r.sections.map(sec => '<div class="report-sec"><h3>' + esc(sec.title) + '</h3><p>' + esc(sec.text) + '</p></div>').join('') +
        '</div></div></div>';
    }
  };

  // ------------------------------------------------------------- 화면: 데이터 관리
  function renderData() {
    const records = db.students.reduce((n, s) => n + s.tests.length + s.wrongs.length + s.logs.length, 0);
    const size = new Blob([localStorage.getItem(KEY) || '']).size;
    app.innerHTML =
      '<div class="page-head"><div><h1>데이터 관리</h1><p>모든 데이터는 서버 없이 이 브라우저(localStorage)에 저장됩니다.</p></div></div>' +
      '<div class="grid cols-4">' + stat('학생', db.students.length, '명', '', 'users', 'violet') + stat('누적 기록', records, '건', '평가·오답·수업', 'file') + stat('저장 용량', (size / 1024).toFixed(1), 'KB', '이 기기 저장소', 'database', 'cyan') + stat('오늘', today().slice(5).replace('-', '/'), '', '', 'calendar', 'green') + '</div>' +
      appCard() +
      '<div class="grid cols-2 mt">' +
      '<div class="card"><h2>백업 / 복원</h2><p class="muted small">다른 컴퓨터로 옮기거나 브라우저 데이터를 지우기 전에 백업 파일(JSON)을 내려받으세요.</p>' +
      '<div class="row-actions"><button class="btn primary" data-action="export">백업 파일 내보내기</button><button class="btn" data-action="import">백업 파일 가져오기</button></div>' +
      '<input type="file" id="importFile" accept=".json,application/json" hidden></div>' +
      '<div class="card"><h2>샘플 · 초기화</h2><p class="muted small">샘플 학생 6명(초등 2명 포함)을 추가해 기능을 둘러볼 수 있습니다. 초기화하면 모든 데이터가 삭제됩니다.</p>' +
      '<div class="row-actions"><button class="btn" data-action="load-sample">샘플 학생 추가</button><button class="btn danger" data-action="reset-all">전체 데이터 삭제</button></div></div></div>';
    $('#importFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then(text => {
        const next = C.normalizeDB(text);
        if (!confirm('백업 파일의 학생 ' + next.students.length + '명으로 현재 데이터를 교체할까요?')) return;
        db = next; save(); toast('백업을 복원했습니다.'); route();
      }).catch(err => alert(err.message)).finally(() => { e.target.value = ''; });
    });
  }

  // ------------------------------------------------------------- 앱(PWA) · 화면 설정
  const UI_KEY = 'okmath.ui';
  let deferredInstall = null;
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function loadUI() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch (e) { return {}; } }
  function saveUI(patch) { const ui = Object.assign(loadUI(), patch); try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* 무시 */ } return ui; }
  function applyUI() {
    const root = document.documentElement;
    const ui = loadUI();
    const dark = ui.theme ? ui.theme === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.size = ui.size === 'lg' ? 'lg' : 'md';
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(b => {
      b.setAttribute('aria-pressed', String(dark));
      const u = b.querySelector('.theme-ic use'); if (u) u.setAttribute('href', dark ? '#i-sun' : '#i-moon');
      const l = b.querySelector('.theme-label'); if (l) l.textContent = dark ? '라이트 모드' : '다크 모드';
      b.setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
    });
    document.querySelectorAll('[data-action="toggle-size"]').forEach(b => b.setAttribute('aria-pressed', String(root.dataset.size === 'lg')));
    document.querySelectorAll('[data-action="install-app"]').forEach(b => { b.hidden = !deferredInstall || isStandalone(); });
  }
  function appCard() {
    const installed = isStandalone();
    const how = isIOS()
      ? '<ol class="install-steps"><li>Safari에서 이 페이지를 엽니다.</li><li>화면 아래 <b>공유</b> 버튼을 누릅니다.</li><li><b>홈 화면에 추가</b>를 선택합니다.</li></ol>'
      : '<ol class="install-steps"><li>Chrome · Edge · 삼성 인터넷에서 아래 <b>앱 설치</b> 버튼을 누르거나</li><li>주소창 오른쪽의 설치 아이콘(또는 메뉴 → <b>앱 설치 / 홈 화면에 추가</b>)을 선택합니다.</li></ol>';
    return '<div class="card mt"><div class="card-head"><h2>' + icon('phone') + '앱으로 사용하기</h2>' +
      '<span class="app-status' + (installed ? '' : ' off') + '">' + (installed ? '앱으로 실행 중' : '브라우저에서 실행 중') + '</span></div>' +
      '<p class="muted small" style="margin-top:0">휴대폰 홈 화면이나 PC에 설치하면 앱처럼 전체 화면으로 열리고, 인터넷이 없어도 사용할 수 있습니다. 데이터는 기기마다 따로 저장되므로 기기를 바꿀 때는 백업 파일을 이용하세요.</p>' +
      (installed ? '' : how + (deferredInstall ? '<div class="row-actions mt"><button class="btn primary" data-action="install-app">' + icon('download') + '앱 설치</button></div>' : '')) + '</div>';
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; applyUI(); if (hashParts()[0] === 'data') route(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; applyUI(); toast('OK수학 앱을 설치했습니다.'); });
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => { if (!loadUI().theme) applyUI(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.warn('서비스 워커 등록 실패', err)); });
  }

  // ------------------------------------------------------------- 이벤트
  function withStudent(fn) { return el => { const s = currentStudent(); if (s) fn(s, el); }; }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return Promise.resolve();
  }

  const ACTIONS = {
    'add-student': () => studentForm(null),
    'edit-student': withStudent(s => studentForm(s)),
    'delete-student': withStudent(s => {
      if (!confirm(s.name + ' 학생과 모든 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
      db.students = db.students.filter(x => x.id !== s.id); save();
      toast('삭제했습니다.'); location.hash = '#/students';
    }),
    'set-status': withStudent((s, el) => {
      const cur = s.progress[el.dataset.unit] || { status: 'todo', level: 0 };
      setProgress(s, el.dataset.unit, Object.assign({}, cur, { status: el.dataset.status }));
    }),
    'wrong-filter': withStudent((s, el) => { wrongFilter = el.dataset.value; renderTab(s, 'wrongs'); }),
    'save-note': withStudent(s => { replaceStudent(Object.assign({}, s, { reportNote: $('#reportNote').value })); toast('코멘트를 저장했습니다.'); route(); }),
    'copy-report': withStudent(s => {
      const note = $('#reportNote').value;
      const text = C.buildReport(Object.assign({}, s, { reportNote: note }), today()).text;
      copyText(text).then(() => toast('리포트 텍스트를 복사했습니다.'), () => toast('복사에 실패했습니다.'));
    }),
    'print-report': () => window.print(),
    'toggle-theme': () => { saveUI({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); applyUI(); },
    'toggle-size': () => { const lg = document.documentElement.dataset.size !== 'lg'; saveUI({ size: lg ? 'lg' : 'md' }); applyUI(); toast(lg ? '큰 글씨로 보여 드릴게요.' : '기본 글씨 크기로 돌아왔어요.'); },
    'install-app': () => {
      if (!deferredInstall) { location.hash = '#/data'; return; }
      deferredInstall.prompt();
      deferredInstall.userChoice.finally(() => { deferredInstall = null; applyUI(); if (hashParts()[0] === 'data') route(); });
    },
    'export': () => {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ok-math-backup-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('백업 파일을 내려받았습니다.');
    },
    'import': () => $('#importFile').click(),
    'load-sample': () => {
      const sample = C.sampleDB(today()).students.filter(s => !findStudent(s.id));
      if (!sample.length) { toast('샘플 학생이 이미 추가되어 있습니다.'); return; }
      db.students = db.students.concat(sample); save();
      toast('샘플 학생 ' + sample.length + '명을 추가했습니다.');
      location.hash = '#/dashboard'; route();
    },
    'reset-all': () => {
      if (!confirm('모든 학생과 기록을 삭제할까요? 백업하지 않았다면 되돌릴 수 없습니다.')) return;
      db = C.emptyDB(); save(); toast('전체 데이터를 삭제했습니다.'); route();
    }
  };
  Object.keys(RECORDS).forEach(kind => {
    ACTIONS['add-' + kind] = withStudent(s => recordForm(kind, s, null));
    ACTIONS['edit-' + kind] = withStudent((s, el) => recordForm(kind, s, el.dataset.id));
    ACTIONS['delete-' + kind] = withStudent((s, el) => deleteRecord(kind, s, el.dataset.id));
  });

  function setProgress(s, unitId, next) {
    const progress = Object.assign({}, s.progress);
    next.updatedAt = today();
    if (next.status === 'todo' && !next.level) delete progress[unitId]; else progress[unitId] = next;
    const ns = replaceStudent(Object.assign({}, s, { progress: progress }));
    renderTab(ns, 'progress');
  }

  const CHANGES = {
    'set-level': withStudent((s, el) => {
      const cur = s.progress[el.dataset.unit] || { status: 'todo', level: 0 };
      setProgress(s, el.dataset.unit, Object.assign({}, cur, { level: Number(el.value) }));
    }),
    'toggle-wrong': withStudent((s, el) => {
      const wrongs = s.wrongs.map(w => (w.id === el.dataset.id ? Object.assign({}, w, { resolved: el.checked }) : w));
      replaceStudent(Object.assign({}, s, { wrongs: wrongs }));
      toast(el.checked ? '해결 완료로 표시했습니다.' : '미해결로 되돌렸습니다.');
      route();
    })
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && ACTIONS[el.dataset.action] && el.tagName !== 'SELECT' && el.type !== 'checkbox') {
      e.preventDefault();
      ACTIONS[el.dataset.action](el);
      return;
    }
    const row = e.target.closest('[data-href]');
    if (row) location.hash = row.dataset.href;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-href]')) location.hash = e.target.dataset.href;
  });
  app.addEventListener('change', e => {
    const el = e.target.closest('[data-action]');
    if (el && CHANGES[el.dataset.action]) CHANGES[el.dataset.action](el);
  });
  window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); route(); } });

  // ------------------------------------------------------------- 라우터
  function route() {
    const p = hashParts();
    const view = p[0] || 'dashboard';
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (view === 'student' ? 'students' : view)));
    const s = view === 'student' ? findStudent(p[1]) : null;
    if (view === 'students') renderStudents();
    else if (s) renderStudent(s, p[2] || 'overview');
    else if (view === 'data') renderData();
    else renderDashboard();
    document.title = (s ? s.name + ' · ' : '') + 'OK수학 · 초·중등 수학 개인별 관리';
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  applyUI();
  route();
})();
