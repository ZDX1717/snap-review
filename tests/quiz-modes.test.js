import test from 'node:test';
import assert from 'node:assert';
import { loadApp, makeEl } from './helpers/vm-harness.mjs';

const { run, elements, store, alerts, sandbox, domContentLoadedCount } = await loadApp();

// 通用三题:q1 单选(A) / q2 多选(CA→判 AC) / q3 判断(A)
const setupQuiz = `
    quizMode = 'exam';
    currentQuiz = [
        { content: 'Q1', type: '单选', options: {A:'1',B:'2'}, answer: 'A', analysis: 'a1', explanation: '', confidence: 1, raw: '' },
        { content: 'Q2', type: '多选', options: {A:'1',B:'2',C:'3'}, answer: 'CA', analysis: '', explanation: '', confidence: 1, raw: '' },
        { content: 'Q3', type: '判断', options: {A:'正确',B:'错误'}, answer: 'A', analysis: '', explanation: '', confidence: 1, raw: '' },
    ];
    errorQuestions = [];
    questionBanks = { 'T': currentQuiz };
    currentBankName = 'T';
    questionBank = currentQuiz;
    isAllBanksView = false;
`;

test('下一题前进,上一题回退,作答不丢失', () => {
    // 真实浏览器中翻页时 displayQuestion 会把已保存答案恢复到界面上,
    // 这里用桩模拟"恢复后的选中状态"(q1 单选选中 A)
    const selEl = makeEl();
    selEl.value = 'A';
    sandbox.document.querySelector = () => selEl;
    run(setupQuiz + ` userAnswers = ['A','','']; currentQuestionIndex = 1; prevQuestion();`);
    assert.strictEqual(run('currentQuestionIndex'), 0);
    assert.strictEqual(run('userAnswers[0]'), 'A'); // 回退时保存当前作答,原值不丢
    sandbox.document.querySelector = () => makeEl();
});
test('逐题模式没有上一题按钮逻辑', () => {
    run(setupQuiz + ` quizMode = 'immediate'; currentQuestionIndex = 1; prevQuestion();`);
    assert.strictEqual(run('currentQuestionIndex'), 1); // 不应回退
});

test('判分正确:对2/错0/未答1,未作答入错题本', () => {
    run(setupQuiz + ` userAnswers = ['A', 'CA', '']; currentQuestionIndex = 2; finishExam();`);
    assert.strictEqual(run('correctCount'), 2);
    assert.strictEqual(run('wrongCount'), 0);
    const errs = JSON.parse(run('JSON.stringify(errorQuestions)'));
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].content, 'Q3');
    assert.strictEqual(errs[0].userAnswer, '未作答');
});
test('多选答案规范化判分(CA 答卷 vs CA 标准答案)', () => {
    // setupQuiz 里 q2 标准答案 'CA',作答 'CA' 判对 —— normalizeAnswerString 双侧规范化
    // 当前题(idx2)的界面选中状态用桩模拟为 'A'
    const selEl = makeEl();
    selEl.value = 'A';
    sandbox.document.querySelector = () => selEl;
    run(setupQuiz + ` userAnswers = ['A', 'CA', 'A']; currentQuestionIndex = 2; finishExam();`);
    assert.strictEqual(run('correctCount'), 3);
    sandbox.document.querySelector = () => makeEl();
});
test('错题入错题本', () => {
    const selEl = makeEl();
    selEl.value = 'B';
    sandbox.document.querySelector = () => selEl; // 当前题(idx0)界面上选的是 B
    run(setupQuiz + ` userAnswers = ['B', 'CA', 'A']; currentQuestionIndex = 0; finishExam();`);
    const errs = JSON.parse(run('JSON.stringify(errorQuestions)'));
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].content, 'Q1');
    assert.strictEqual(errs[0].userAnswer, 'B');
    assert.strictEqual(run('correctCount'), 2);
    assert.strictEqual(run('wrongCount'), 1);
    sandbox.document.querySelector = () => makeEl();
});

test('套题模式正确率按总题数,未答数展示', () => {
    run(setupQuiz + ` userAnswers = ['A', 'CA', '']; currentQuestionIndex = 2; finishExam();`);
    assert.strictEqual(elements['accuracy'].textContent, '66.7%');
    assert.strictEqual(String(elements['unanswered-count'].textContent), '1');
    // 套题模式分母即总题数,不需要"已答 N 题"补充说明
    assert.strictEqual(String(elements['answered-note'].textContent), '');
});
test('逐题模式提前结束:正确率按已答数,未答数补齐', () => {
    run(setupQuiz + `
        quizMode = 'immediate';
        correctCount = 1; wrongCount = 1;
        currentQuestionIndex = 1; isAnswered = true;   // 答完2题(1对1错)就结束
        showQuizResult();
    `);
    // 重设计:正确率只留数字(大字),补充说明移到旁侧小字
    assert.strictEqual(elements['accuracy'].textContent, '50.0%');
    assert.ok(String(elements['answered-note'].textContent).includes('已答 2 题'));
    assert.strictEqual(String(elements['unanswered-count'].textContent), '1');
    // 50% 偏低 → 红色;≥60% → 绿色(让"好不好"一眼可见)
    assert.ok(elements['accuracy'].classList.contains('bad'), '50% 应标红');
});
test('逐题模式答题记录进入回顾列表(渲染不报错)', () => {
    const selEl = makeEl();
    selEl.value = 'B';
    sandbox.document.querySelector = () => selEl; // 模拟选中 B
    run(setupQuiz + `
        quizMode = 'immediate';
        userAnswers = [''];
        currentQuestionIndex = 0;
        correctCount = 0; wrongCount = 0;
        submitAnswer();
    `);
    assert.strictEqual(run('userAnswers[0]'), 'B');           // 已记录
    assert.strictEqual(run('wrongCount'), 1);                  // Q1 答B,标准A → 错
    const errs = JSON.parse(run('JSON.stringify(errorQuestions)'));
    assert.strictEqual(errs.length, 1);
    sandbox.document.querySelector = () => makeEl();
});

test('题源=错题本:startQuiz 从错题池出题且强制逐题模式', () => {
    run(setupQuiz + `
        errorQuestions = [{ content: 'E1', type: '单选', options: {A:'x',B:'y'}, answer: 'A', bankName: 'T' }];
        __sourceChoice = 'errors';
    `);
    // 让 startQuiz 读到我们指定的题源单选值
    sandbox.document.querySelector = (sel) => {
        if (sel.includes('question-source')) return { value: run('__sourceChoice') };
        if (sel.includes('quiz-mode')) return { value: 'exam' };
        if (sel.includes('question-type')) return { value: 'all' };
        return makeEl();
    };
    run(`startQuiz()`);
    assert.strictEqual(run('currentQuiz.length'), 1);
    assert.strictEqual(run('currentQuiz[0].content'), 'E1');
    sandbox.document.querySelector = () => makeEl();
});

test('题源池为空时给出各自指引(错题本/收藏夹)', () => {
    run(setupQuiz + `errorQuestions = []; favoriteQuestions = []; __sourceChoice = 'errors';`);
    sandbox.document.querySelector = (sel) => {
        if (sel.includes('question-source')) return { value: run('__sourceChoice') };
        return makeEl();
    };
    run(`startQuiz()`);
    assert.ok(String(elements['quiz-status'].textContent).includes('错题本'), '应提示错题本为空并给出下一步');
    sandbox.document.querySelector = () => makeEl();
});


test('套题模式翻页按钮常驻:顺序为 上一题/下一题/交卷,首末题只禁用不隐藏', () => {
    // 回归:旧版在首题隐藏"上一题"、末题隐藏"下一题",按钮随位置忽隐忽现,
    // 看起来像"上一题和下一题在循环"(👤 反馈)。现改为始终可见,边界处禁用。
    const btn = (id) => elements[id];
    run(setupQuiz + ` currentQuestionIndex = 0; displayQuestion();`);
    assert.ok(!btn('prev-question-btn').classList.contains('hidden'), '首题:「上一题」也必须可见');
    assert.strictEqual(btn('prev-question-btn').disabled, true, '首题:「上一题」应禁用');
    assert.ok(!btn('next-question-btn').classList.contains('hidden'), '首题:「下一题」应可见');
    assert.strictEqual(btn('next-question-btn').disabled, false, '首题:「下一题」应可用');
    assert.ok(!btn('end-quiz-btn').classList.contains('hidden'), '「交卷」应常驻');
    assert.strictEqual(String(btn('end-quiz-btn').textContent), '交卷', '套题模式该按钮文案为「交卷」');

    // 末题:下一题禁用(而不是隐藏),交卷仍可点
    run(setupQuiz + ` currentQuestionIndex = 2; displayQuestion();`);
    assert.ok(!btn('next-question-btn').classList.contains('hidden'), '末题:「下一题」也必须可见');
    assert.strictEqual(btn('next-question-btn').disabled, true, '末题:「下一题」应禁用');
    assert.strictEqual(btn('prev-question-btn').disabled, false, '末题:「上一题」应可用');
});

test('末题禁用后点击「下一题」不得重复交卷(禁用必须真挡住 click)', () => {
    // 回归:仅用 pointer-events:none 时,程序化 .click() 仍会触发 finishExam,
    // 造成重复计数。必须用原生 disabled。
    run(setupQuiz + ` userAnswers = ['A', 'CA', '']; currentQuestionIndex = 2; displayQuestion();`);
    const before = run('correctCount');
    const n = elements['next-question-btn'];
    n.disabled = true;                    // 与 UI 一致
    if (n._listeners && n._listeners.click) n._listeners.click();   // 模拟点击
    assert.strictEqual(run('correctCount'), before, '禁用状态下点击不应改变计分');
});
