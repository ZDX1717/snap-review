// 答题卡抽屉(P0-6.1):三态判定 + 跳题 + 抽屉状态
// 分两层:纯函数层(直连 parser.js,无桩、无 DOM)与集成层(vm 桩,验"点了真的调用到函数")
import test from 'node:test';
import assert from 'node:assert';
import { buildCardCells } from '../src/parser.js';
import { loadApp } from './helpers/vm-harness.mjs';

// ---------- 纯函数层 ----------
const Q = [
    { content: 'Q1', type: '单选', options: { A: '1', B: '2' }, answer: 'A' },
    { content: 'Q2', type: '多选', options: { A: '1', B: '2', C: '3' }, answer: 'CA' },
    { content: 'Q3', type: '判断', options: { A: '正确', B: '错误' }, answer: 'A' },
    { content: 'Q4', type: '单选', options: { A: '1', B: '2' }, answer: 'B' },
];

test('答题卡三态:答对 / 答错 / 未答', () => {
    // 已判分: 0 对、1 错(答 B 而正确答案 AC)、2 未判分、3 对
    const { cells, summary } = buildCardCells(Q, ['A', 'B', '', 'B'], { 0: true, 1: true, 3: true }, 1);
    assert.deepStrictEqual(cells.map(c => c.status), ['correct', 'wrong', 'blank', 'correct']);
    assert.deepStrictEqual(summary, { total: 4, correct: 2, wrong: 1, blank: 1 });
});

test('未判分的勾选不得冒充已答(勾了没确认 = 未答)', () => {
    // 这是上一批修过的真实 bug 的翻版:userAnswers 有值 ≠ 已判分
    const { cells, summary } = buildCardCells(Q, ['A', 'CA', '', ''], {}, 0);
    assert.deepStrictEqual(cells.map(c => c.status), ['blank', 'blank', 'blank', 'blank']);
    assert.strictEqual(summary.correct, 0);
    assert.strictEqual(summary.blank, 4);
});

test('多选按集合比对:CA 与 AC 视为答对', () => {
    const { cells } = buildCardCells(Q, ['', 'CA', '', ''], { 1: true }, 0);
    assert.strictEqual(cells[1].status, 'correct');
});

test('当前题标记跟随 currentIndex,且只有一个', () => {
    const { cells } = buildCardCells(Q, [], {}, 2);
    assert.deepStrictEqual(cells.map(c => c.current), [false, false, true, false]);
});

test('题型简写:单选/多选/判断 → 单/多/判,未知题型留空', () => {
    const { cells } = buildCardCells([...Q, { content: 'Q5', type: '填空', answer: 'x' }], [], {}, 0);
    assert.deepStrictEqual(cells.map(c => c.typeShort), ['单', '多', '判', '单', '']);
});

test('格子数据不含题干与答案(防偷看答案)', () => {
    const { cells } = buildCardCells(Q, ['A', '', '', ''], { 0: true }, 0);
    cells.forEach(c => {
        const keys = Object.keys(c);
        assert.ok(!keys.includes('content'), '不得把题干带进答题卡');
        assert.ok(!keys.includes('answer'), '不得把答案带进答题卡');
    });
});

test('空卷/脏输入不炸', () => {
    assert.deepStrictEqual(buildCardCells([], [], {}, 0).cells, []);
    assert.strictEqual(buildCardCells(undefined, undefined, undefined, 0).summary.total, 0);
    // 题数组里有空洞(理论上不会,但答题卡是给人看的,不能因此整页崩)
    const { cells } = buildCardCells([{ content: 'x', type: '单选', answer: 'A' }, null], [], {}, 0);
    assert.strictEqual(cells[1].status, 'blank');
    assert.strictEqual(cells[1].typeShort, '');
});

// ---------- 集成层(vm 桩) ----------
const { run, elements, sandbox } = await loadApp();

// 四题:q1 单选(A) / q2 多选(AC) / q3 判断(A) / q4 单选(B)
const setupQuiz = (mode = 'immediate') => `
    quizMode = '${mode}';
    currentQuiz = [
        { content: 'Q1', type: '单选', options: {A:'1',B:'2'}, answer: 'A', analysis: '', explanation: '', confidence: 1, raw: '' },
        { content: 'Q2', type: '多选', options: {A:'1',B:'2',C:'3'}, answer: 'CA', analysis: '', explanation: '', confidence: 1, raw: '' },
        { content: 'Q3', type: '判断', options: {A:'正确',B:'错误'}, answer: 'A', analysis: '', explanation: '', confidence: 1, raw: '' },
        { content: 'Q4', type: '单选', options: {A:'1',B:'2'}, answer: 'B', analysis: '', explanation: '', confidence: 1, raw: '' },
    ];
    userAnswers = ['', '', '', ''];
    currentQuestionIndex = 0;
`;
// 取最近一次渲染的格子:不清空 __created(其他模块也在往里塞元素),而是记录渲染前的水位,只认新增段
const cellsAfterRender = (code) => {
    const mark = sandbox.__created.length;
    run(code);
    return sandbox.__created.slice(mark)
        .filter(c => c.tag === 'BUTTON' && String(c.el.className).includes('answer-card-cell'))
        .map(c => c.el);
};

test('打开答题卡:抽屉出现、遮罩出现、入口 aria-expanded 置真', () => {
    run(setupQuiz() + ` openAnswerCard();`);
    assert.strictEqual(run('isAnswerCardOpen()'), true);
    assert.strictEqual(elements['answer-card-drawer'].classList.contains('hidden'), false);
    assert.strictEqual(elements['answer-card-backdrop'].classList.contains('hidden'), false);
    assert.strictEqual(elements['answer-card-open'].getAttribute('aria-expanded'), 'true');
});

test('渲染出与题数相等的格子,且当前题带 current 类', () => {
    const cells = cellsAfterRender(setupQuiz() + ` currentQuestionIndex = 2; openAnswerCard();`);
    assert.strictEqual(cells.length, 4, `应渲染 4 个格子,实际 ${cells.length}`);
    assert.deepStrictEqual(cells.map(c => c.textContent), ['1', '2', '3', '4']);
    assert.ok(cells[2].classList.contains('current'), '第 3 题应为当前题');
    assert.ok(cells[0].classList.contains('blank'), '未作答的题应为 blank 态');
    // 题型标记:格子里带一个"单/多/判"角标
    const badges = sandbox.__created
        .filter(c => c.tag === 'SPAN' && String(c.el.className).includes('answer-card-type'))
        .map(c => c.el.textContent);
    assert.deepStrictEqual(badges.slice(-4), ['单', '多', '判', '单']);
});

test('逐题模式:未判分的勾选在卡上仍是未答(不冒充)', () => {
    // 模拟"选了但没确认":userAnswers 有值、q_graded 无记录
    const cells = cellsAfterRender(setupQuiz('immediate') + ` userAnswers = ['A', '', '', '']; openAnswerCard();`);
    assert.ok(cells[0].classList.contains('blank'), '勾了没确认的题不得显示为答对');
    assert.strictEqual(cells[0].classList.contains('correct'), false);
});

test('套题模式:有作答即视为已判分,错题上红', () => {
    const cells = cellsAfterRender(setupQuiz('exam') + ` userAnswers = ['A', 'A', '', '']; currentQuestionIndex = 1; openAnswerCard();`);
    assert.ok(cells[0].classList.contains('correct'), '套题模式答对应为 correct');
    assert.ok(cells[1].classList.contains('wrong'), '套题模式答错应为 wrong');
    assert.ok(cells[2].classList.contains('blank'), '套题模式未作答应为 blank');
});

test('跳题:落到目标题、抽屉自动收起、进度同步刷新', () => {
    run(setupQuiz() + ` openAnswerCard(); jumpToQuestion(3);`);
    assert.strictEqual(run('currentQuestionIndex'), 3);
    assert.strictEqual(run('isAnswerCardOpen()'), false, '跳完应自动收起,不挡着题目');
    assert.strictEqual(elements['question-number'].textContent, '4/4', '状态栏进度必须跟着跳题走');
});

test('跳题越界不生效(不把索引搞坏)', () => {
    run(setupQuiz() + ` currentQuestionIndex = 1; jumpToQuestion(9);`);
    assert.strictEqual(run('currentQuestionIndex'), 1);
    run(setupQuiz() + ` currentQuestionIndex = 1; jumpToQuestion(-1);`);
    assert.strictEqual(run('currentQuestionIndex'), 1);
});

test('切到别的页面时抽屉收起(不跨页残留)', () => {
    run(setupQuiz() + ` openAnswerCard();`);
    assert.strictEqual(run('isAnswerCardOpen()'), true);
    run(`showSection('banks');`);
    assert.strictEqual(run('isAnswerCardOpen()'), false);
});

test('toggle 语义:一次开、再关(入口点击不该互相抵消)', () => {
    run(setupQuiz() + ` toggleAnswerCard();`);
    assert.strictEqual(run('isAnswerCardOpen()'), true);
    run(`toggleAnswerCard();`);
    assert.strictEqual(run('isAnswerCardOpen()'), false);
});
