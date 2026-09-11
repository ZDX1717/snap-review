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

test('答题卡各态:答对 / 答错 / 未答 / 已选未判分', () => {
    // 已判分: 0 对、1 错(答 B 而正确答案 AC)、2 未判分但已选、3 对
    const { cells, summary } = buildCardCells(Q, ['A', 'B', 'CA', 'B'], { 0: true, 1: true, 3: true }, 1);
    assert.deepStrictEqual(cells.map(c => c.status), ['correct', 'wrong', 'picked', 'correct']);
    assert.deepStrictEqual(summary, { total: 4, correct: 2, wrong: 1, blank: 0, picked: 1 });
});

test('未判分的勾选一律不显示对错(逐题模式:勾了没确认;套题模式:还没交卷)', () => {
    // 这是上一批修过的真实 bug 的翻版:userAnswers 有值 ≠ 已判分。
    // 未判分时只能落到中性的 picked / blank,绝不允许出现 correct / wrong。
    const { cells, summary } = buildCardCells(Q, ['A', 'CA', '', ''], {}, 0);
    assert.deepStrictEqual(cells.map(c => c.status), ['picked', 'picked', 'blank', 'blank']);
    assert.strictEqual(summary.correct, 0);
    assert.strictEqual(summary.wrong, 0);
    assert.strictEqual(summary.blank, 2);
    assert.strictEqual(summary.picked, 2);
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
// ⚠️ 必须显式 resetGradingState():判分台账是模块内部状态,会跨用例残留 ——
// 不清的话"上一例 submitAnswer 判过的题"会让下一例的格子带着对错,复现出只在特定顺序下出现的假 bug。
const setupQuiz = (mode = 'immediate') => `
    resetGradingState();
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

test('逐题模式:未判分的勾选不得显示对错(不冒充已判)', () => {
    // 模拟"选了但没确认":userAnswers 有值、q_graded 无记录
    const cells = cellsAfterRender(setupQuiz('immediate') + ` userAnswers = ['A', '', '', '']; openAnswerCard();`);
    assert.ok(cells[0].classList.contains('picked'), '勾了没确认的题应为中性的 picked');
    assert.strictEqual(cells[0].classList.contains('correct'), false, '不得显示为答对');
    assert.strictEqual(cells[0].classList.contains('wrong'), false, '不得显示为答错');
});

test('套题模式交卷前:绝不显示对错(👤 报的 bug:交卷前标对错 = 泄题)', () => {
    const cells = cellsAfterRender(setupQuiz('exam') + ` userAnswers = ['A', 'A', '', '']; currentQuestionIndex = 1; openAnswerCard();`);
    assert.ok(cells[0].classList.contains('picked'), '套题答过的题应为中性的 picked 态');
    assert.ok(cells[1].classList.contains('picked'), '套题答过的题应为中性的 picked 态');
    assert.ok(cells[2].classList.contains('blank'), '未作答应为 blank');
    // 铁律:交卷前任何格子都不得出现对错态
    for (const [i, c] of cells.entries()) {
        assert.ok(!c.classList.contains('correct'), `第 ${i + 1} 题交卷前不得显示"答对"`);
        assert.ok(!c.classList.contains('wrong'), `第 ${i + 1} 题交卷前不得显示"答错"`);
    }
});

test('套题模式交卷后才显示对错', () => {
    // 交卷 = 判分时刻,此后答题卡才允许标对错。
    // ⚠️ 交卷前把 currentQuestionIndex 放到一个**本来就空**的槽位,再交卷:
    //    finishExam() 会先把自己那题的 DOM 选择收进 userAnswers —— 桩里 DOM 是空的,
    //    落在已作答的槽位上会把答案冲掉(那是桩的局限,不是产品 bug:真机 DOM 有选中态可收)。
    const cells = cellsAfterRender(setupQuiz('exam') + ` userAnswers = ['A', 'B', '', 'B']; currentQuestionIndex = 2; finishExam(); openAnswerCard();`);
    assert.ok(cells[0].classList.contains('correct'), '交卷后答对应为 correct');
    assert.ok(cells[1].classList.contains('wrong'), '交卷后答错应为 wrong');
    assert.ok(cells[3].classList.contains('correct'), '交卷后答对应为 correct');
    assert.ok(cells[2].classList.contains('wrong'), '交卷后未作答应记为错(进错题本)');
});

test('新开一局后套题不再残留"已交卷"状态(否则一开局就泄露对错)', () => {
    run(setupQuiz('exam') + ` userAnswers = ['A', 'B', '', '']; finishExam();`);
    // 上一局已交卷 → 重新开始同一套题
    const cells = cellsAfterRender(setupQuiz('exam') + ` userAnswers = ['A', '', '', '']; openAnswerCard();`);
    assert.ok(cells[0].classList.contains('picked'), '新一局应回到"已选未判分"');
    assert.ok(!cells[0].classList.contains('correct'), '新一局不得继承上一局的对错');
    assert.ok(!cells[1].classList.contains('wrong'), '新一局不得继承上一局的错题标记');
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
