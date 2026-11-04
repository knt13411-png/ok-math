/*
 * OK수학 core 로직
 * - 교육과정 데이터, 데이터 정규화, 학습 분석, 리포트 생성
 * - 브라우저(전역 OKCore)와 Node(require) 양쪽에서 동작하도록 UMD 형태로 작성
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OKCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------
  // 1. 교육과정 (2022 개정 교육과정 기준 대표 단원)
  //    초등: 학기 순서대로 1학기 → 2학기 단원 (교과서 출판사마다 단원명이 조금 다를 수 있음)
  //    중등: 대단원
  //    학년 코드: e1~e6 = 초1~초6, m1~m3 = 중1~중3
  // ---------------------------------------------------------------
  const CURRICULUM = {
    e1: [
      '9까지의 수', '여러 가지 모양', '덧셈과 뺄셈', '비교하기', '50까지의 수',
      '100까지의 수', '덧셈과 뺄셈 (1)', '모양과 시각', '덧셈과 뺄셈 (2)', '규칙 찾기', '덧셈과 뺄셈 (3)'
    ],
    e2: [
      '세 자리 수', '여러 가지 도형', '덧셈과 뺄셈', '길이 재기', '분류하기', '곱셈',
      '네 자리 수', '곱셈구구', '길이 재기 (m와 cm)', '시각과 시간', '표와 그래프', '규칙 찾기'
    ],
    e3: [
      '덧셈과 뺄셈', '평면도형', '나눗셈', '곱셈', '길이와 시간', '분수와 소수',
      '곱셈 (2)', '나눗셈 (2)', '원', '분수', '들이와 무게', '자료의 정리 (그림그래프)'
    ],
    e4: [
      '큰 수', '각도', '곱셈과 나눗셈', '평면도형의 이동', '막대그래프', '규칙 찾기',
      '분수의 덧셈과 뺄셈', '삼각형', '소수의 덧셈과 뺄셈', '사각형', '꺾은선그래프', '다각형'
    ],
    e5: [
      '자연수의 혼합 계산', '약수와 배수', '규칙과 대응', '약분과 통분', '분수의 덧셈과 뺄셈', '다각형의 둘레와 넓이',
      '수의 범위와 어림하기', '분수의 곱셈', '합동과 대칭', '소수의 곱셈', '직육면체', '평균과 가능성'
    ],
    e6: [
      '분수의 나눗셈', '각기둥과 각뿔', '소수의 나눗셈', '비와 비율', '여러 가지 그래프', '직육면체의 부피와 겉넓이',
      '분수의 나눗셈 (2)', '소수의 나눗셈 (2)', '공간과 입체', '비례식과 비례배분', '원의 넓이', '원기둥, 원뿔, 구'
    ],
    m1: [
      '소인수분해', '정수와 유리수', '문자의 사용과 식의 계산', '일차방정식',
      '좌표평면과 그래프', '기본 도형', '작도와 합동', '평면도형의 성질',
      '입체도형의 성질', '자료의 정리와 해석'
    ],
    m2: [
      '유리수와 순환소수', '식의 계산', '일차부등식', '연립일차방정식',
      '일차함수와 그래프', '일차함수와 일차방정식의 관계', '삼각형의 성질',
      '사각형의 성질', '도형의 닮음', '피타고라스 정리', '경우의 수와 확률'
    ],
    m3: [
      '제곱근과 실수', '다항식의 곱셈과 인수분해', '이차방정식', '이차함수와 그래프',
      '삼각비', '원의 성질', '대푯값과 산포도', '상관관계'
    ]
  };

  const GRADES = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'm1', 'm2', 'm3'].map(function (key, i) {
    const elem = key[0] === 'e';
    return { key: key, order: i, school: elem ? 'elem' : 'middle', num: Number(key[1]), label: (elem ? '초' : '중') + key[1] };
  });
  const GRADE_MAP = {};
  GRADES.forEach(function (g) { GRADE_MAP[g.key] = g; });
  const SCHOOL_LEVELS = { elem: '초등', middle: '중등' };

  /** 학년 코드 정규화. 예전 데이터의 숫자 학년(1~3)은 중1~중3으로 해석 */
  function normalizeGrade(g) {
    if (GRADE_MAP[g]) return g;
    const s = String(g == null ? '' : g).trim();
    if (GRADE_MAP[s.toLowerCase()]) return s.toLowerCase();
    let m = /^(초|중)\s*([1-6])/.exec(s);
    if (m && GRADE_MAP[(m[1] === '초' ? 'e' : 'm') + m[2]]) return (m[1] === '초' ? 'e' : 'm') + m[2];
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 3) return 'm' + n;
    return 'm1';
  }
  function gradeLabel(key) { const g = GRADE_MAP[normalizeGrade(key)]; return g.label; }
  function gradeOrder(key) { return GRADE_MAP[normalizeGrade(key)].order; }
  function schoolOf(key) { return GRADE_MAP[normalizeGrade(key)].school; }

  const UNITS = [];
  GRADES.forEach(function (g) {
    CURRICULUM[g.key].forEach(function (name, i) {
      UNITS.push({ id: g.key + '-' + String(i + 1).padStart(2, '0'), grade: g.key, name: name });
    });
  });
  const UNIT_MAP = {};
  UNITS.forEach(function (u) { UNIT_MAP[u.id] = u; });

  const TEST_TYPES = ['단원평가', '형성평가', '모의고사', '학교 중간고사', '학교 기말고사', '기타'];
  const WRONG_TYPES = ['개념 부족', '계산 실수', '문제 이해', '시간 부족', '기타'];
  const ATTENDANCE = ['출석', '지각', '결석'];
  const HOMEWORK = ['완료', '일부', '미완료', '없음'];
  const STATUS = { todo: '미시작', doing: '진행 중', done: '완료' };

  function unitsOfGrade(grade) { grade = normalizeGrade(grade); return UNITS.filter(function (u) { return u.grade === grade; }); }
  function unitName(id) { return UNIT_MAP[id] ? UNIT_MAP[id].name : (id ? '(알 수 없는 단원)' : '-'); }
  function unitLabel(id) { const u = UNIT_MAP[id]; return u ? gradeLabel(u.grade) + ' ' + u.name : '-'; }

  // ---------------------------------------------------------------
  // 2. 유틸
  // ---------------------------------------------------------------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')); }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(dateStr, n) {
    const t = Date.parse(dateStr + 'T00:00:00Z') + n * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
  function pct(score, total) {
    score = Number(score); total = Number(total);
    if (!(total > 0) || !isFinite(score)) return null;
    return round1(score / total * 100);
  }
  function pick(list, value, fallback) { return list.indexOf(value) >= 0 ? value : fallback; }
  function str(v, max) { return (v == null ? '' : String(v)).trim().slice(0, max || 500); }

  // ---------------------------------------------------------------
  // 3. 데이터 모델 / 정규화
  // ---------------------------------------------------------------
  function emptyDB() { return { app: 'ok-math', version: 1, students: [] }; }

  function createStudent(input) {
    input = input || {};
    return normalizeStudent(Object.assign({ id: uid(), createdAt: todayStr() }, input));
  }

  function normalizeStudent(s) {
    if (!s || typeof s !== 'object') throw new Error('학생 데이터 형식이 올바르지 않습니다.');
    const name = str(s.name, 30);
    if (!name) throw new Error('학생 이름이 비어 있습니다.');
    const grade = normalizeGrade(s.grade);
    const progress = {};
    if (s.progress && typeof s.progress === 'object') {
      Object.keys(s.progress).forEach(function (k) {
        if (!UNIT_MAP[k]) return;
        const p = s.progress[k] || {};
        const status = STATUS[p.status] ? p.status : 'todo';
        const level = Math.min(5, Math.max(0, parseInt(p.level, 10) || 0));
        if (status === 'todo' && !level) return;
        progress[k] = { status: status, level: level, updatedAt: isDate(p.updatedAt) ? p.updatedAt : todayStr() };
      });
    }
    const tests = (Array.isArray(s.tests) ? s.tests : []).map(function (t) {
      const total = Number(t.total) > 0 ? Number(t.total) : 100;
      const score = Math.min(total, Math.max(0, Number(t.score) || 0));
      return {
        id: str(t.id, 40) || uid(), date: isDate(t.date) ? t.date : todayStr(),
        type: pick(TEST_TYPES, t.type, '기타'), unitId: UNIT_MAP[t.unitId] ? t.unitId : '',
        score: score, total: total, memo: str(t.memo, 300)
      };
    }).sort(byDate);
    const wrongs = (Array.isArray(s.wrongs) ? s.wrongs : []).map(function (w) {
      return {
        id: str(w.id, 40) || uid(), date: isDate(w.date) ? w.date : todayStr(),
        unitId: UNIT_MAP[w.unitId] ? w.unitId : '', source: str(w.source, 100),
        type: pick(WRONG_TYPES, w.type, '기타'), memo: str(w.memo, 500), resolved: !!w.resolved
      };
    }).sort(byDate);
    const logs = (Array.isArray(s.logs) ? s.logs : []).map(function (l) {
      return {
        id: str(l.id, 40) || uid(), date: isDate(l.date) ? l.date : todayStr(),
        attendance: pick(ATTENDANCE, l.attendance, '출석'), homework: pick(HOMEWORK, l.homework, '없음'),
        content: str(l.content, 300), memo: str(l.memo, 500)
      };
    }).sort(byDate);
    return {
      id: str(s.id, 40) || uid(), name: name, grade: grade,
      school: str(s.school, 40), phone: str(s.phone, 30), parentPhone: str(s.parentPhone, 30),
      goal: str(s.goal, 100), memo: str(s.memo, 1000), reportNote: str(s.reportNote, 1000),
      createdAt: isDate(s.createdAt) ? s.createdAt : todayStr(),
      progress: progress, tests: tests, wrongs: wrongs, logs: logs
    };
  }

  function normalizeDB(raw) {
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { throw new Error('JSON 파일을 읽을 수 없습니다.'); }
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.students)) {
      throw new Error('OK수학 백업 파일이 아닙니다. (students 목록이 없음)');
    }
    const seen = {};
    const students = raw.students.map(normalizeStudent).map(function (s) {
      if (seen[s.id]) s.id = uid();
      seen[s.id] = true;
      return s;
    });
    return { app: 'ok-math', version: 1, students: students };
  }

  // ---------------------------------------------------------------
  // 4. 분석
  // ---------------------------------------------------------------
  function progressSummary(student, grade) {
    grade = normalizeGrade(grade || student.grade);
    const units = unitsOfGrade(grade);
    let done = 0, doing = 0;
    const doingNames = [];
    units.forEach(function (u) {
      const p = student.progress[u.id];
      if (p && p.status === 'done') done++;
      else if (p && p.status === 'doing') { doing++; doingNames.push(u.name); }
    });
    return {
      grade: grade, total: units.length, done: done, doing: doing,
      rate: units.length ? Math.round(done / units.length * 100) : 0,
      doingNames: doingNames
    };
  }

  function testStats(student) {
    const list = student.tests.slice().sort(byDate).map(function (t) {
      return Object.assign({}, t, { pct: pct(t.score, t.total) });
    });
    const p = list.map(function (t) { return t.pct; });
    const recent = p.slice(-3), prev = p.slice(-6, -3);
    const recentAvg = avg(recent), prevAvg = avg(prev);
    return {
      count: list.length,
      list: list,
      avg: p.length ? round1(avg(p)) : null,
      recentAvg: recent.length ? round1(recentAvg) : null,
      prevAvg: prev.length ? round1(prevAvg) : null,
      trend: (recent.length && prev.length) ? round1(recentAvg - prevAvg) : null,
      best: p.length ? Math.max.apply(null, p) : null,
      latest: list.length ? list[list.length - 1] : null
    };
  }

  function unitScores(student) {
    const map = {};
    student.tests.forEach(function (t) {
      if (!t.unitId) return;
      (map[t.unitId] = map[t.unitId] || []).push(pct(t.score, t.total));
    });
    const out = {};
    Object.keys(map).forEach(function (k) { out[k] = { avg: round1(avg(map[k])), count: map[k].length }; });
    return out;
  }

  function wrongStats(student) {
    const byType = {};
    WRONG_TYPES.forEach(function (t) { byType[t] = 0; });
    let unresolved = 0;
    student.wrongs.forEach(function (w) { byType[w.type]++; if (!w.resolved) unresolved++; });
    let main = null;
    WRONG_TYPES.forEach(function (t) { if (byType[t] > 0 && (!main || byType[t] > byType[main])) main = t; });
    return { total: student.wrongs.length, unresolved: unresolved, resolved: student.wrongs.length - unresolved, byType: byType, mainType: main };
  }

  function weakUnits(student, limit) {
    const scores = unitScores(student);
    const ids = {};
    Object.keys(scores).forEach(function (k) { ids[k] = true; });
    student.wrongs.forEach(function (w) { if (w.unitId) ids[w.unitId] = true; });
    Object.keys(student.progress).forEach(function (k) { ids[k] = true; });

    const out = [];
    Object.keys(ids).forEach(function (id) {
      let points = 0;
      const reasons = [];
      const sc = scores[id];
      if (sc && sc.avg < 70) { points += 1 + (70 - sc.avg) / 10; reasons.push('평균 ' + sc.avg + '점'); }
      const open = student.wrongs.filter(function (w) { return w.unitId === id && !w.resolved; }).length;
      if (open) { points += open; reasons.push('미해결 오답 ' + open + '개'); }
      const p = student.progress[id];
      if (p && p.level > 0 && p.level <= 2) { points += 3 - p.level; reasons.push('이해도 ' + p.level + '/5'); }
      if (points > 0) out.push({ unitId: id, name: unitName(id), label: unitLabel(id), points: round1(points), reasons: reasons });
    });
    out.sort(function (a, b) { return b.points - a.points; });
    return typeof limit === 'number' ? out.slice(0, limit) : out;
  }

  function logStats(student) {
    const logs = student.logs;
    const n = logs.length;
    const c = { 출석: 0, 지각: 0, 결석: 0 };
    logs.forEach(function (l) { c[l.attendance]++; });
    const hw = logs.filter(function (l) { return l.homework !== '없음'; });
    const hwScore = hw.reduce(function (s, l) { return s + (l.homework === '완료' ? 1 : l.homework === '일부' ? 0.5 : 0); }, 0);
    return {
      count: n, present: c['출석'], late: c['지각'], absent: c['결석'],
      attendRate: n ? Math.round((c['출석'] + c['지각']) / n * 100) : null,
      homeworkRate: hw.length ? Math.round(hwScore / hw.length * 100) : null
    };
  }

  function lastActivity(student) {
    let last = null;
    [student.tests, student.wrongs, student.logs].forEach(function (arr) {
      arr.forEach(function (x) { if (!last || x.date > last) last = x.date; });
    });
    Object.keys(student.progress).forEach(function (k) {
      const d = student.progress[k].updatedAt;
      if (d && (!last || d > last)) last = d;
    });
    return last;
  }

  /** 관리가 필요한 신호 목록. level: high > mid > low */
  function alerts(student, today) {
    today = today || todayStr();
    const out = [];
    const ts = testStats(student);
    if (ts.trend !== null && ts.trend <= -10) out.push({ level: 'high', text: '성적 하락 (최근 3회 평균 ' + ts.trend + '점)' });
    if (ts.recentAvg !== null && ts.recentAvg < 60) out.push({ level: 'high', text: '최근 평균 ' + ts.recentAvg + '점 (60점 미만)' });
    const ws = wrongStats(student);
    if (ws.unresolved >= 5) out.push({ level: 'mid', text: '미해결 오답 ' + ws.unresolved + '개' });
    const recentLogs = student.logs.slice().sort(byDate).slice(-3);
    const absent = recentLogs.filter(function (l) { return l.attendance === '결석'; }).length;
    if (absent >= 2) out.push({ level: 'mid', text: '최근 3회 수업 중 결석 ' + absent + '회' });
    const hwLogs = recentLogs.filter(function (l) { return l.homework !== '없음'; });
    if (hwLogs.length >= 2 && hwLogs.every(function (l) { return l.homework === '미완료'; })) {
      out.push({ level: 'mid', text: '과제 연속 미완료' });
    }
    const last = lastActivity(student);
    if (!last) out.push({ level: 'low', text: '학습 기록 없음' });
    else {
      const gap = daysBetween(last, today);
      if (gap >= 14) out.push({ level: 'low', text: gap + '일째 기록 없음' });
    }
    return out;
  }

  const LEVEL_ORDER = { high: 3, mid: 2, low: 1 };
  function attentionScore(list) { return list.reduce(function (s, a) { return s + LEVEL_ORDER[a.level]; }, 0); }

  function dashboard(db, today) {
    today = today || todayStr();
    const rows = db.students.map(function (s) {
      const al = alerts(s, today);
      return {
        student: s, progress: progressSummary(s), tests: testStats(s), wrongs: wrongStats(s),
        alerts: al, attention: attentionScore(al), last: lastActivity(s)
      };
    });
    const recent = rows.map(function (r) { return r.tests.recentAvg; }).filter(function (v) { return v !== null; });
    return {
      count: rows.length,
      avgProgress: rows.length ? Math.round(avg(rows.map(function (r) { return r.progress.rate; }))) : null,
      avgRecent: recent.length ? round1(avg(recent)) : null,
      unresolved: rows.reduce(function (s, r) { return s + r.wrongs.unresolved; }, 0),
      rows: rows,
      attention: rows.filter(function (r) { return r.alerts.some(function (a) { return a.level !== 'low'; }); })
        .sort(function (a, b) { return b.attention - a.attention; })
    };
  }

  // ---------------------------------------------------------------
  // 5. 리포트
  // ---------------------------------------------------------------
  const PLAN_BY_TYPE = {
    '개념 부족': '취약 단원의 개념을 다시 정리하고, 기본 문제부터 단계적으로 풀어 보겠습니다.',
    '계산 실수': '매 수업 계산 연습 10분과 검산 습관 만들기를 함께 진행하겠습니다.',
    '문제 이해': '문제의 조건에 밑줄을 긋고 식으로 옮기는 연습을 집중적으로 하겠습니다.',
    '시간 부족': '제한 시간을 두고 푸는 실전 연습으로 풀이 속도를 높이겠습니다.',
    '기타': '오답 원인을 함께 점검하며 맞춤 복습을 진행하겠습니다.'
  };

  function signed(n) { return (n > 0 ? '+' : '') + n; }

  function buildReport(student, today) {
    today = today || todayStr();
    const pg = progressSummary(student);
    const ts = testStats(student);
    const ws = wrongStats(student);
    const ls = logStats(student);
    const weak = weakUnits(student, 3);

    const sections = [];
    let prog = gradeLabel(pg.grade) + ' 과정 ' + pg.total + '단원 중 ' + pg.done + '단원 완료 (' + pg.rate + '%)';
    if (pg.doingNames.length) prog += ', 진행 중: ' + pg.doingNames.join(', ');
    sections.push({ title: '진도', text: prog });

    let test;
    if (!ts.count) test = '아직 기록된 평가가 없습니다.';
    else {
      test = '최근 ' + Math.min(3, ts.count) + '회 평균 ' + ts.recentAvg + '점';
      if (ts.trend !== null) test += ' (이전 대비 ' + signed(ts.trend) + '점 ' + (ts.trend > 0 ? '상승' : ts.trend < 0 ? '하락' : '유지') + ')';
      if (ts.count > 3) test += ', 전체 평균 ' + ts.avg + '점';
      test += ', 최고 ' + ts.best + '점';
    }
    sections.push({ title: '평가', text: test });

    let wr;
    if (!ws.total) wr = '기록된 오답이 없습니다.';
    else {
      wr = '총 ' + ws.total + '문항 중 ' + ws.resolved + '문항 해결, 미해결 ' + ws.unresolved + '문항';
      if (ws.mainType) wr += ' / 주요 원인: ' + ws.mainType + '(' + ws.byType[ws.mainType] + ')';
    }
    sections.push({ title: '오답', text: wr });

    let att;
    if (!ls.count) att = '수업 기록이 없습니다.';
    else {
      att = '수업 ' + ls.count + '회, 출석률 ' + ls.attendRate + '%';
      if (ls.absent) att += ' (결석 ' + ls.absent + '회)';
      if (ls.homeworkRate !== null) att += ', 과제 수행률 ' + ls.homeworkRate + '%';
    }
    sections.push({ title: '출결·과제', text: att });

    sections.push({
      title: '보완 단원',
      text: weak.length ? weak.map(function (w) { return w.label + '(' + w.reasons.join(', ') + ')'; }).join(' / ') : '특별히 취약한 단원이 발견되지 않았습니다.'
    });

    const plans = [];
    if (weak.length) plans.push(weak[0].name + ' 단원을 우선 복습하겠습니다.');
    if (ws.mainType) plans.push(PLAN_BY_TYPE[ws.mainType]);
    if (ts.trend !== null && ts.trend >= 5) plans.push('성적이 오르고 있어 현재 학습 흐름을 유지하겠습니다.');
    if (!plans.length) plans.push('현재 진도에 맞춰 꾸준히 학습을 이어가겠습니다.');
    sections.push({ title: '지도 계획', text: plans.join(' ') });

    if (student.reportNote) sections.push({ title: '선생님 코멘트', text: student.reportNote });

    const title = '[OK수학] ' + student.name + ' 학생 학습 리포트 (' + today + ')';
    const text = title + '\n' + sections.map(function (s) { return '■ ' + s.title + ': ' + s.text; }).join('\n');
    return { title: title, date: today, sections: sections, text: text, progress: pg, tests: ts, wrongs: ws, logs: ls, weak: weak };
  }

  // ---------------------------------------------------------------
  // 6. 샘플 데이터 (시드 고정 → 항상 같은 결과)
  // ---------------------------------------------------------------
  function seeded(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function sampleDB(today) {
    today = today || todayStr();
    const rnd = seeded(20261104);
    const profiles = [
      { name: '김민준', grade: 'm2', school: 'OK중학교', goal: '기말 90점', base: 78, slope: 2, done: 4, wrongBias: '계산 실수', absent: 0 },
      { name: '이서연', grade: 'm1', school: '한빛중학교', goal: '수학 자신감 키우기', base: 88, slope: 0.5, done: 6, wrongBias: '문제 이해', absent: 0 },
      { name: '박지호', grade: 'm3', school: 'OK중학교', goal: '고등 선행 준비', base: 74, slope: -3.5, done: 3, wrongBias: '개념 부족', absent: 2 },
      { name: '최하은', grade: 'm2', school: '새솔중학교', goal: '기초 다지기', base: 55, slope: 1, done: 2, wrongBias: '개념 부족', absent: 1 },
      { name: '한지우', grade: 'e5', school: 'OK초등학교', goal: '분수 계산 정확도 높이기', base: 84, slope: 1.5, done: 5, wrongBias: '계산 실수', absent: 0 },
      { name: '윤서아', grade: 'e3', school: '푸른초등학교', goal: '곱셈·나눗셈 기초 완성', base: 66, slope: -2.5, done: 3, wrongBias: '문제 이해', absent: 1 }
    ];
    const students = profiles.map(function (p, idx) {
      const units = unitsOfGrade(p.grade);
      const progress = {};
      units.forEach(function (u, i) {
        if (i < p.done) progress[u.id] = { status: 'done', level: Math.min(5, Math.max(1, Math.round(p.base / 20 + (rnd() - 0.5) * 2))), updatedAt: addDays(today, -40 + i * 6) };
        else if (i === p.done) progress[u.id] = { status: 'doing', level: p.base < 60 ? 2 : 3, updatedAt: addDays(today, -3) };
      });
      const tests = [];
      for (let i = 0; i < 6; i++) {
        const u = units[Math.min(i, p.done)];
        const score = Math.max(20, Math.min(100, Math.round(p.base + p.slope * i + (rnd() - 0.5) * 8)));
        tests.push({ id: 'sample-' + (idx + 1) + '-t' + i, date: addDays(today, -52 + i * 9), type: i === 5 ? '모의고사' : '단원평가', unitId: u.id, score: score, total: 100 });
      }
      const wrongs = [];
      const nWrong = p.base < 60 ? 9 : p.slope < 0 ? 7 : 5;
      for (let i = 0; i < nWrong; i++) {
        const u = units[Math.min(Math.floor(rnd() * (p.done + 1)), units.length - 1)];
        const type = rnd() < 0.55 ? p.wrongBias : WRONG_TYPES[Math.floor(rnd() * 4)];
        wrongs.push({
          id: 'sample-' + (idx + 1) + '-w' + i, date: addDays(today, -45 + i * 5), unitId: u.id, source: '교재 p.' + (20 + Math.floor(rnd() * 150)) + ' ' + (1 + Math.floor(rnd() * 12)) + '번',
          type: type, memo: '', resolved: i < nWrong - (p.base < 60 ? 6 : 2)
        });
      }
      const logs = [];
      for (let i = 0; i < 8; i++) {
        const isAbsent = i >= 8 - p.absent;
        logs.push({
          id: 'sample-' + (idx + 1) + '-l' + i, date: addDays(today, -28 + i * 4),
          attendance: isAbsent ? '결석' : (rnd() < 0.1 ? '지각' : '출석'),
          homework: isAbsent ? '미완료' : (rnd() < 0.7 ? '완료' : '일부'),
          content: units[Math.min(p.done, Math.floor(i / 3) + Math.max(0, p.done - 2))].name + ' 수업', memo: ''
        });
      }
      return createStudent({
        id: 'sample-' + (idx + 1), name: p.name, grade: p.grade, school: p.school, goal: p.goal,
        createdAt: addDays(today, -60), progress: progress, tests: tests, wrongs: wrongs, logs: logs
      });
    });
    return { app: 'ok-math', version: 1, students: students };
  }

  return {
    CURRICULUM: CURRICULUM, UNITS: UNITS, TEST_TYPES: TEST_TYPES, WRONG_TYPES: WRONG_TYPES,
    ATTENDANCE: ATTENDANCE, HOMEWORK: HOMEWORK, STATUS: STATUS,
    GRADES: GRADES, SCHOOL_LEVELS: SCHOOL_LEVELS,
    normalizeGrade: normalizeGrade, gradeLabel: gradeLabel, gradeOrder: gradeOrder, schoolOf: schoolOf,
    unitsOfGrade: unitsOfGrade, unitName: unitName, unitLabel: unitLabel,
    uid: uid, pct: pct, todayStr: todayStr, addDays: addDays, daysBetween: daysBetween,
    emptyDB: emptyDB, createStudent: createStudent, normalizeStudent: normalizeStudent, normalizeDB: normalizeDB,
    progressSummary: progressSummary, testStats: testStats, unitScores: unitScores, wrongStats: wrongStats,
    weakUnits: weakUnits, logStats: logStats, lastActivity: lastActivity, alerts: alerts, dashboard: dashboard,
    buildReport: buildReport, sampleDB: sampleDB
  };
});
