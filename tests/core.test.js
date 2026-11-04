// 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const TODAY = '2026-11-04';

function student(extra) {
  return C.createStudent(Object.assign({ name: '테스트', grade: 'm2' }, extra));
}

test('교육과정: 학년별 단원 수와 고유 ID', () => {
  assert.deepEqual(C.GRADES.map(g => g.label), ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3']);
  assert.equal(C.unitsOfGrade('m1').length, 10);
  assert.equal(C.unitsOfGrade('m2').length, 11);
  assert.equal(C.unitsOfGrade('m3').length, 8);
  ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].forEach(g => assert.ok(C.unitsOfGrade(g).length >= 11, g + ' 단원 수'));
  assert.equal(C.unitLabel('e5-02'), '초5 약수와 배수');
  assert.equal(C.unitLabel('e6-04'), '초6 비와 비율');
  const ids = C.UNITS.map(u => u.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(C.unitName('m2-04'), '연립일차방정식');
  assert.equal(C.unitLabel('m3-05'), '중3 삼각비');
});

test('날짜 유틸', () => {
  assert.equal(C.addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(C.daysBetween('2026-10-21', TODAY), 14);
  assert.equal(C.pct(45, 50), 90);
  assert.equal(C.pct(10, 0), null);
});

test('학생 정규화: 이름 필수, 학년 범위 보정, 잘못된 값 정리', () => {
  assert.throws(() => C.createStudent({ name: '  ' }), /이름/);
  const s = C.createStudent({
    name: ' 홍길동 ', grade: 3,
    progress: { 'm3-01': { status: 'done', level: 9 }, 'bad-id': { status: 'done' } },
    tests: [{ date: '2026-10-02', score: 130, total: 100, type: '없는유형' }, { date: 'oops', score: 50 }],
    wrongs: [{ unitId: 'm3-01', type: '계산 실수' }]
  });
  assert.equal(s.name, '홍길동');
  assert.equal(s.grade, 'm3', '예전 숫자 학년 3 → 중3');
  assert.deepEqual(Object.keys(s.progress), ['m3-01']);
  assert.equal(s.progress['m3-01'].level, 5);
  assert.equal(s.tests[0].score, 100, '만점 초과 점수는 만점으로 보정');
  assert.equal(s.tests[0].type, '기타');
  assert.equal(s.wrongs[0].resolved, false);
});

test('백업 가져오기: 형식 검사와 중복 ID 처리', () => {
  assert.throws(() => C.normalizeDB('{not json'), /JSON/);
  assert.throws(() => C.normalizeDB({ foo: 1 }), /백업 파일/);
  const db = C.normalizeDB(JSON.stringify({ students: [{ id: 'a', name: '가' }, { id: 'a', name: '나' }] }));
  assert.equal(db.students.length, 2);
  assert.notEqual(db.students[0].id, db.students[1].id);
});

test('진도 요약', () => {
  const s = student({ progress: { 'm2-01': { status: 'done' }, 'm2-02': { status: 'done' }, 'm2-03': { status: 'doing', level: 3 }, 'm1-01': { status: 'done' } } });
  const p = C.progressSummary(s);
  assert.equal(p.grade, 'm2');
  assert.equal(p.total, 11);
  assert.equal(p.done, 2);
  assert.equal(p.doing, 1);
  assert.equal(p.rate, 18);
  assert.deepEqual(p.doingNames, ['일차부등식']);
  assert.equal(C.progressSummary(s, 'm1').done, 1, '다른 학년 진도는 따로 집계');
});

test('평가 통계: 평균, 최근 3회, 추세', () => {
  const scores = [60, 70, 80, 70, 80, 90];
  const s = student({ tests: scores.map((sc, i) => ({ date: C.addDays('2026-09-01', i * 7), score: sc, total: 100 })) });
  const t = C.testStats(s);
  assert.equal(t.count, 6);
  assert.equal(t.avg, 75);
  assert.equal(t.recentAvg, 80);
  assert.equal(t.prevAvg, 70);
  assert.equal(t.trend, 10);
  assert.equal(t.best, 90);
  assert.equal(t.latest.score, 90);
  const half = student({ tests: [{ date: TODAY, score: 18, total: 20 }] });
  assert.equal(C.testStats(half).avg, 90, '만점이 100이 아니어도 백분율로 환산');
  assert.equal(C.testStats(half).trend, null);
});

test('취약 단원: 낮은 점수 + 미해결 오답 + 낮은 이해도 가중', () => {
  const s = student({
    tests: [
      { date: '2026-10-01', unitId: 'm2-04', score: 50, total: 100 },
      { date: '2026-10-02', unitId: 'm2-05', score: 95, total: 100 }
    ],
    wrongs: [
      { unitId: 'm2-04', type: '개념 부족' }, { unitId: 'm2-04', type: '계산 실수' },
      { unitId: 'm2-05', type: '계산 실수', resolved: true }, { unitId: 'm2-06', type: '문제 이해' }
    ],
    progress: { 'm2-07': { status: 'doing', level: 1 } }
  });
  const w = C.weakUnits(s);
  assert.equal(w[0].unitId, 'm2-04');
  assert.ok(w[0].reasons.includes('평균 50점'));
  assert.ok(w[0].reasons.includes('미해결 오답 2개'));
  assert.ok(!w.some(x => x.unitId === 'm2-05'), '잘 하는 단원은 제외');
  assert.ok(w.some(x => x.unitId === 'm2-07'));
  assert.equal(C.weakUnits(s, 1).length, 1);
});

test('오답·출결 통계', () => {
  const s = student({
    wrongs: [{ type: '계산 실수' }, { type: '계산 실수', resolved: true }, { type: '개념 부족' }],
    logs: [
      { date: '2026-10-01', attendance: '출석', homework: '완료' },
      { date: '2026-10-03', attendance: '지각', homework: '일부' },
      { date: '2026-10-05', attendance: '결석', homework: '미완료' },
      { date: '2026-10-07', attendance: '출석', homework: '없음' }
    ]
  });
  const w = C.wrongStats(s);
  assert.equal(w.total, 3);
  assert.equal(w.unresolved, 2);
  assert.equal(w.mainType, '계산 실수');
  const l = C.logStats(s);
  assert.equal(l.attendRate, 75);
  assert.equal(l.homeworkRate, 50, '과제 없음은 제외: (1 + 0.5 + 0) / 3');
});

test('관리 알림: 성적 하락, 결석, 장기 미기록', () => {
  const drop = student({ tests: [90, 90, 90, 70, 72, 68].map((sc, i) => ({ date: C.addDays('2026-10-01', i * 5), score: sc })) });
  const a = C.alerts(drop, TODAY);
  assert.ok(a.some(x => x.level === 'high' && x.text.includes('성적 하락')));

  const absent = student({ logs: ['출석', '결석', '결석'].map((at, i) => ({ date: C.addDays('2026-10-28', i * 2), attendance: at, homework: '미완료' })) });
  const b = C.alerts(absent, TODAY);
  assert.ok(b.some(x => x.text.includes('결석 2회')));

  const idle = student({ logs: [{ date: '2026-10-01' }] });
  assert.ok(C.alerts(idle, TODAY).some(x => x.text === '34일째 기록 없음'));
  assert.ok(C.alerts(student(), TODAY).some(x => x.text === '학습 기록 없음'));
});

test('리포트 생성: 섹션과 문자 메시지 텍스트', () => {
  const s = student({
    name: '김민준', reportNote: '집중력이 좋아졌어요.',
    progress: { 'm2-01': { status: 'done' }, 'm2-02': { status: 'doing' } },
    tests: [{ date: '2026-10-01', unitId: 'm2-01', score: 62 }],
    wrongs: [{ unitId: 'm2-01', type: '계산 실수' }, { unitId: 'm2-01', type: '계산 실수' }]
  });
  const r = C.buildReport(s, TODAY);
  assert.equal(r.title, '[OK수학] 김민준 학생 학습 리포트 (2026-11-04)');
  const titles = r.sections.map(x => x.title);
  assert.deepEqual(titles, ['진도', '평가', '오답', '출결·과제', '보완 단원', '지도 계획', '선생님 코멘트']);
  assert.match(r.text, /11단원 중 1단원 완료 \(9%\), 진행 중: 식의 계산/);
  assert.match(r.text, /주요 원인: 계산 실수\(2\)/);
  assert.match(r.text, /유리수와 순환소수 단원을 우선 복습/);
  assert.match(r.text, /검산 습관/);
});

test('샘플 데이터와 대시보드', () => {
  const db = C.sampleDB(TODAY);
  assert.equal(db.students.length, 6);
  assert.deepEqual(db.students.map(s => C.schoolOf(s.grade)).filter(x => x === 'elem').length, 2, '초등 샘플 2명');
  const again = C.sampleDB(TODAY);
  assert.deepEqual(db, again, '시드 고정으로 항상 같은 샘플');
  const d = C.dashboard(db, TODAY);
  assert.equal(d.count, 6);
  assert.ok(d.avgProgress > 0 && d.avgProgress <= 100);
  assert.ok(d.attention.length >= 1);
  assert.ok(d.attention.some(r => r.student.name === '박지호'), '성적 하락 + 결석 학생이 관리 대상');
  assert.deepEqual(C.normalizeDB(JSON.parse(JSON.stringify(db))), db, '백업 → 복원 왕복 시 데이터 유지');
});

test('학년 코드: 예전 데이터 호환과 입력 변환', () => {
  assert.equal(C.normalizeGrade(2), 'm2');
  assert.equal(C.normalizeGrade('1'), 'm1');
  assert.equal(C.normalizeGrade('e4'), 'e4');
  assert.equal(C.normalizeGrade('초6'), 'e6');
  assert.equal(C.normalizeGrade('중 3'), 'm3');
  assert.equal(C.normalizeGrade('e9'), 'm1', '알 수 없는 값은 기본값');
  assert.equal(C.gradeLabel('e2'), '초2');
  assert.ok(C.gradeOrder('e6') < C.gradeOrder('m1'));
  // v1 백업(숫자 학년, m단원 ID)이 그대로 열리는지
  const old = C.normalizeDB({ students: [{ id: 'x', name: '옛학생', grade: 2, progress: { 'm2-01': { status: 'done' } } }] });
  assert.equal(old.students[0].grade, 'm2');
  assert.equal(C.progressSummary(old.students[0]).done, 1);
});

test('초등 학생: 진도·리포트·취약 단원', () => {
  const s = C.createStudent({
    name: '초등이', grade: 'e5',
    progress: { 'e5-01': { status: 'done' }, 'e5-02': { status: 'doing', level: 2 } },
    tests: [{ date: '2026-10-01', unitId: 'e5-02', score: 60 }],
    wrongs: [{ unitId: 'e5-02', type: '계산 실수' }]
  });
  const p = C.progressSummary(s);
  assert.equal(p.total, 12);
  assert.equal(p.done, 1);
  assert.equal(C.weakUnits(s)[0].label, '초5 약수와 배수');
  const r = C.buildReport(s, TODAY);
  assert.match(r.text, /초5 과정 12단원 중 1단원 완료 \(8%\), 진행 중: 약수와 배수/);
  assert.match(r.text, /약수와 배수 단원을 우선 복습/);
});