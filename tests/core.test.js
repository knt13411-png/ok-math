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
test('문자: 전화번호 정규화 · 휴대폰 판별 · 표시 형식', () => {
  assert.equal(C.normalizePhone('010-1234-5678'), '01012345678');
  assert.equal(C.normalizePhone('+82 10 1234 5678'), '01012345678');
  assert.ok(C.isMobile('010 1234 5678'));
  assert.ok(C.isMobile('011-123-4567'));
  assert.ok(!C.isMobile('02-123-4567'), '유선 번호는 문자 불가');
  assert.ok(!C.isMobile(''));
  assert.equal(C.formatPhone('01012345678'), '010-1234-5678');
  assert.equal(C.formatPhone('0221234567'), '02-2123-4567');
  assert.equal(C.formatPhone('021234567'), '02-123-4567');
  assert.equal(C.formatPhone('0311234567'), '031-123-4567');
});

test('문자: 바이트 계산과 SMS/LMS 구분', () => {
  assert.equal(C.smsBytes('abc 123'), 7);
  assert.equal(C.smsBytes('안녕'), 4);
  assert.equal(C.smsBytes('[OK수학] 안내'), 13);
  assert.equal(C.smsType(90), 'SMS');
  assert.equal(C.smsType(91), 'LMS');
  assert.equal(C.smsType(2001), 'OVER');
});

test('문자: 템플릿 변수 치환', () => {
  const s = C.createStudent({
    name: '김민준', grade: 'm2', school: 'OK중', parentName: '김정희',
    progress: { 'm2-01': { status: 'done' }, 'm2-02': { status: 'doing' } },
    tests: [{ date: '2026-10-01', unitId: 'm2-02', score: 64 }],
    wrongs: [{ unitId: 'm2-02', type: '계산 실수' }]
  });
  const t = C.renderTemplate('{보호자}님, {학생}({학년}, {학교}) {날짜} 진도 {진도율}% 평균 {최근평균} 오답 {미해결오답} 보완 {보완단원} {없는변수}', s, { today: TODAY });
  assert.equal(t, '김정희님, 김민준(중2, OK중) 11월 4일 진도 9% 평균 64 오답 1 보완 식의 계산 {없는변수}');
  const noParent = C.createStudent({ name: '이서연', grade: 'e3' });
  assert.equal(C.renderTemplate('{보호자}님 {최근평균} {보완단원}', noParent, { today: TODAY }), '이서연 학부모님 - 특별히 없음');
  const rep = C.renderTemplate('{리포트}', s, { today: TODAY });
  assert.match(rep, /^■ 진도: 중2 과정 11단원 중 1단원 완료/);
  assert.ok(!rep.includes('학습 리포트 ('), '리포트 변수에는 제목 줄이 빠짐');
  assert.deepEqual(C.templateVars('{학생} {학생} {보호자} {foo}'), ['학생', '보호자']);
  C.MESSAGE_TEMPLATES.forEach(tp => assert.ok(C.templateVars(tp.body).length >= 0 && tp.body.length > 10, tp.name));
});

test('문자: 수신자 목록 (보호자/학생/둘 다, 번호 없음 처리)', () => {
  const a = C.createStudent({ id: 'a', name: '가', parentPhone: '010-1111-2222', phone: '' });
  const b = C.createStudent({ id: 'b', name: '나', parentPhone: '02-123-4567', phone: '01033334444' });
  const p = C.buildRecipients([a, b], 'parent');
  assert.deepEqual(p.map(r => [r.key, r.valid]), [['a:parent', true], ['b:parent', false]]);
  assert.equal(p[0].display, '010-1111-2222');
  assert.equal(p[0].who, '가 학부모');
  const both = C.buildRecipients([a, b], 'both');
  assert.equal(both.length, 4);
  assert.deepEqual(both.filter(r => r.valid).map(r => r.key), ['a:parent', 'b:student']);
  assert.ok(both.find(r => r.key === 'a:student').missing);
});

test('문자: 문자 앱 링크와 CSV', () => {
  assert.equal(C.smsHref('010-1234-5678', '안녕 & 반가워', false), 'sms:01012345678?body=%EC%95%88%EB%85%95%20%26%20%EB%B0%98%EA%B0%80%EC%9B%8C');
  assert.equal(C.smsHref(['01011112222'], 'hi', true), 'sms:01011112222&body=hi');
  assert.equal(C.smsHref(['01011112222', '01033334444'], 'hi', true), 'sms:/open?addresses=01011112222,01033334444&body=hi');
  const csv = C.messagesCSV([{ who: '김정희', roleLabel: '보호자', phone: '01012345678', text: '줄1\n"인용"' }]);
  assert.ok(csv.startsWith('\uFEFF"이름","구분","전화번호","메시지","바이트","유형"\r\n'));
  assert.ok(csv.includes('"김정희","보호자","010-1234-5678","줄1\n""인용""","10","SMS"'));
});

test('문자: 템플릿 · 발송 기록 백업 유지', () => {
  const db = C.normalizeDB({
    students: [{ id: 's', name: '가' }],
    templates: [{ id: 't1', name: '내 공지', body: '내용' }, { name: '빈 것', body: '' }],
    messages: [{ id: 'm1', at: '2026-11-04T10:00:00.000Z', mode: 'single', template: '공지사항', body: 'x', total: 2, opened: 1, skipped: 1, recipients: [{ name: '가', role: 'parent', phone: '01012345678', status: 'opened' }] }]
  });
  assert.deepEqual(db.templates, [{ id: 't1', name: '내 공지', body: '내용' }]);
  assert.equal(db.messages[0].mode, 'single');
  assert.equal(db.messages[0].opened, 1);
  assert.equal(db.messages[0].recipients[0].status, 'opened');
  const old = C.normalizeDB({ students: [] });
  assert.deepEqual([old.templates, old.messages], [[], []], '예전 백업에는 빈 목록');
  const sample = C.sampleDB(TODAY);
  assert.equal(sample.students.filter(s => C.isMobile(s.parentPhone)).length, 5, '샘플 1명은 보호자 번호 없음');
});