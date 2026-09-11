import test from 'node:test';
import assert from 'node:assert';
import { loadApp, makeEl } from './helpers/vm-harness.mjs';

const { run, elements, store, alerts, sandbox, domContentLoadedCount } = await loadApp();

const Q = (content, answer) => ({ content, type: '单选', options: {A:'甲',B:'乙'}, answer, analysis: '', explanation: '', confidence: 1, raw: '' });

test('阈值 0(关闭):答对不追踪不移出', () => {
    run(`masteryThreshold = 0;
        errorQuestions = [{ ...${JSON.stringify(Q('题1','A'))}, userAnswer: 'B', correctStreak: 0 }];`);
    assert.strictEqual(run(`updateErrorStreak(${JSON.stringify(Q('题1','A'))}, true, 'A')`), 0);
    assert.strictEqual(run('errorQuestions.length'), 1);
});
test('阈值 1:答对一次即移出', () => {
    run(`masteryThreshold = 1;
        errorQuestions = [{ ...${JSON.stringify(Q('题2','A'))}, userAnswer: 'B', correctStreak: 0 }];`);
    assert.strictEqual(run(`updateErrorStreak(${JSON.stringify(Q('题2','A'))}, true, 'A')`), 1);
    assert.strictEqual(run('errorQuestions.length'), 0);
});
test('阈值 3:连对三次才移出', () => {
    run(`masteryThreshold = 3;
        errorQuestions = [{ ...${JSON.stringify(Q('题3','A'))}, userAnswer: 'B', correctStreak: 0 }];`);
    const q = JSON.stringify(Q('题3','A'));
    run(`updateErrorStreak(${q}, true, 'A'); updateErrorStreak(${q}, true, 'A');`);
    assert.strictEqual(run('errorQuestions.length'), 1);
    assert.strictEqual(run(`updateErrorStreak(${q}, true, 'A')`), 1);
    assert.strictEqual(run('errorQuestions.length'), 0);
});
test('设置加载与持久化(含非法值回退)', () => {
    store.set('masteryThresholdSetting', '3');
    run('loadMasterySetting()');
    assert.strictEqual(run('masteryThreshold'), 3);
    store.set('masteryThresholdSetting', '99');
    run('loadMasterySetting()');
    assert.strictEqual(run('masteryThreshold'), 2);
    store.set('masteryThresholdSetting', '0');
    run('loadMasterySetting()');
    assert.strictEqual(run('masteryThreshold'), 0);
});

test('题源解析:三种来源各自返回对应题目池', () => {
    run(`questionBank = [{ content: 'q1', type: '单选', answer: 'A' }];
        errorQuestions = [{ content: 'e1', type: '单选', bankName: '高数' }, { content: 'e2', type: '判断', bankName: '英语' }];
        favoriteQuestions = [{ content: 'f1', type: '多选' }];`);
    assert.strictEqual(run(`getSourcePool('bank').length`), 1);
    assert.strictEqual(run(`getSourcePool('errors').length`), 2);
    assert.strictEqual(run(`getSourcePool('favorites').length`), 1);
    // 返回的是副本,改动题源池不得影响 state(防串改)
    run(`getSourcePool('errors').push({ content: 'x' })`);
    assert.strictEqual(run('errorQuestions.length'), 2);
});

test('题源池 + 题型筛选:错题本按题型过滤', () => {
    run(`errorQuestions = [
        { content: 'a', type: '单选', bankName: '高数', answer: 'A' },
        { content: 'b', type: '多选', bankName: '高数', answer: 'AB' },
        { content: 'c', type: '判断', bankName: '英语', answer: 'A' },
    ];`);
    run(`globalThis.__onlySingle = getSourcePool('errors').filter(q => q.type === '单选');`);
    assert.strictEqual(run('globalThis.__onlySingle.length'), 1);
    assert.strictEqual(run('globalThis.__onlySingle[0].content'), 'a');
});
test('题源 UI:「选择题库」常驻不消失,标签随题源改写并给出题数', () => {
    run(`errorQuestions = [{ content: 'e1', type: '单选', bankName: 'T' }];
         favoriteQuestions = [{ content: 'f1', type: '多选' }];`);
    const pick = (v) => { sandbox.document.querySelector = (sel) =>
        sel.includes('question-source') ? { value: v } : makeEl(); };
    // 通过 DOM 接口取,保证与 main.js 内 getElementById 拿到同一实例
    const hint = sandbox.document.getElementById('source-hint');
    const label = sandbox.document.getElementById('bank-select-label');

    pick('bank');
    run(`updateSourceUI()`);
    assert.strictEqual(label.textContent, '选择题库：');
    assert.ok(hint.classList.contains('hidden') === true, '题库题源不应有额外提示');

    // 👤 验收反馈:切到错题/收藏时「选择题库」不得消失(避免布局跳动)
    pick('errors');
    run(`updateSourceUI()`);
    assert.strictEqual(label.textContent, '错题所在题库：', '标签应改写而非隐藏控件');
    assert.ok(String(hint.textContent).includes('错题本共 1 题'), '应显示错题数');

    pick('favorites');
    run(`updateSourceUI()`);
    assert.strictEqual(label.textContent, '收藏题所在题库：');
    assert.ok(String(hint.textContent).includes('收藏夹共 1 题'), '应显示收藏数');

    // 空集合:给出"还没有题目"而不是数字 0
    run(`favoriteQuestions = []`);
    run(`updateSourceUI()`);
    assert.ok(String(hint.textContent).includes('还没有题目'), '空收藏夹应提示还没有题目');

    sandbox.document.querySelector = () => makeEl();
});
test('题源=错题本:startQuiz 出题并归零计数(题源即复习入口)', () => {
    run(`
        errorQuestions = [{ content: 'r1', type: '单选', options: {A:'x',B:'y'}, answer: 'A', bankName: 'T' },
                          { content: 'r2', type: '判断', options: {A:'正确',B:'错误'}, answer: 'A', bankName: 'T' }];
        correctCount = 9; wrongCount = 9;
    `);
    sandbox.document.querySelector = (sel) => {
        if (sel.includes('question-source')) return { value: 'errors' };
        if (sel.includes('quiz-mode')) return { value: 'immediate' };
        if (sel.includes('question-type')) return { value: 'all' };
        return makeEl();
    };
    run(`startQuiz()`);
    sandbox.document.querySelector = () => makeEl();
    assert.strictEqual(run('currentQuiz.length'), 2);
    assert.strictEqual(run('quizMode'), 'immediate');
    assert.strictEqual(run('correctCount'), 0);
    assert.strictEqual(run('wrongCount'), 0);
});

test('题库题源不得按 bankName 过滤(导入的题不带该字段,会整库被滤掉)', () => {
    // 回归:曾把"选择题库"的 bankName 过滤套用到题库题源上,
    // 而导入的题靠"属于哪个库数组"表达归属、没有 bankName → currentQuiz 变成 0 题。
    run(`state.questionBanks = { x: [
            { content: '有答案', type: '单选', options:{A:'甲',B:'乙'}, answer: 'A' },
            { content: '没答案', type: '单选', options:{A:'甲',B:'乙'}, answer: '' },
         ] };
         state.questionBank = state.questionBanks['x'];`);
    const orig = sandbox.document;
    sandbox.document.getElementById = ((o) => (id) =>
        id === 'question-bank-select' ? { value: 'x' } : o(id))(sandbox.document.getElementById);
    run(`startQuiz()`);
    assert.strictEqual(run('currentQuiz.length'), 1, '待补题被排除后应剩 1 题,而不是被 bankName 过滤清空');
    assert.strictEqual(run('currentQuiz[0].content'), '有答案');
});
test('题源取值健壮性:空串/未渲染一律回退题库', () => {
    assert.strictEqual(run(`readQuizSource()`), 'bank', '测试桩 value 为 \'\' 时应回退题库');
});

test('选择题库对错题/收藏题源同样生效(按 bankName 收窄)', () => {
    run(`errorQuestions = [
            { content: 'a', type: '单选', options:{A:'x',B:'y'}, answer: 'A', bankName: '高数' },
            { content: 'b', type: '单选', options:{A:'x',B:'y'}, answer: 'A', bankName: '英语' },
            { content: 'c', type: '判断', options:{A:'正确',B:'错误'}, answer: 'A', bankName: '高数' },
         ];`);
    const withBank = (bank) => {
        sandbox.document.querySelector = (sel) => {
            if (sel.includes('question-source')) return { value: 'errors' };
            if (sel.includes('quiz-mode')) return { value: 'immediate' };
            if (sel.includes('question-type')) return { value: 'all' };
            return makeEl();
        };
        sandbox.document.getElementById = ((orig) => (id) =>
            id === 'question-bank-select' ? { value: bank } : orig(id))(sandbox.document.getElementById);
    };
    withBank('高数');
    run(`startQuiz()`);
    assert.strictEqual(run('currentQuiz.length'), 2, '选「高数」应只出该库的 2 道错题');

    withBank('英语');
    run(`startQuiz()`);
    assert.strictEqual(run('currentQuiz.length'), 1);
    assert.strictEqual(run('currentQuiz[0].content'), 'b');
});

test('判断题保存:选项强制 A正确/B错误,对错写法归一', () => {
    run(`questionBanks = { 'T': [${JSON.stringify(Q('原题', 'A'))}] };
        editBankName = 'T'; editIndex = 0;
        editorStem.value = '地球是圆的'; editorType.value = '判断'; editorAnswer.value = '对';
        editorExplanation.value = ''; editorAnalysis.value = '确实';`);
    assert.strictEqual(run(`editorSaveCurrent(false)`), true);
    const saved = JSON.parse(run('JSON.stringify(questionBanks["T"][0])'));
    assert.strictEqual(saved.type, '判断');
    assert.deepStrictEqual(saved.options, { A: '正确', B: '错误' });
    assert.strictEqual(saved.answer, 'A');
});
test('单选保存:从 DOM 收集选项,过滤空白选项与无效答案字母', () => {
    elements['editor-options'].querySelectorAll = () => ([
        { dataset: { letter: 'A' }, value: '选项甲', disabled: false },
        { dataset: { letter: 'B' }, value: '选项乙', disabled: false },
        { dataset: { letter: 'C' }, value: '   ', disabled: false },   // 空白 → 清除
    ]);
    run(`questionBanks = { 'T': [${JSON.stringify(Q('原题', 'A'))}] };
        editBankName = 'T'; editIndex = 0;
        editorStem.value = '新题干'; editorType.value = '单选'; editorAnswer.value = 'AC';`);
    assert.strictEqual(run(`editorSaveCurrent(true)`), true);
    const saved = JSON.parse(run('JSON.stringify(questionBanks["T"][0])'));
    assert.deepStrictEqual(saved.options, { A: '选项甲', B: '选项乙' });
    assert.strictEqual(saved.answer, 'A'); // C 选项空白,答案里剔除
});
test('空题干保存被拦截', () => {
    alerts.length = 0;
    run(`questionBanks = { 'T': [${JSON.stringify(Q('原题', 'A'))}] };
        editBankName = 'T'; editIndex = 0; editorStem.value = '  ';`);
    assert.strictEqual(run('editorSaveCurrent(false)'), false);
    assert.ok(alerts[0].includes('题干'));
    assert.strictEqual(run('questionBanks["T"][0].content'), '原题'); // 未被覆盖
});
test('新增空题 → 关闭时自动清理', () => {
    run(`questionBanks = { 'T': [${JSON.stringify(Q('已有题', 'A'))}] };
        currentBankName = 'T'; questionBank = questionBanks['T']; isAllBanksView = false;
        editBankName = 'T'; editIndex = 0; editorDirty = false;
        editorAddQuestion();`);
    assert.strictEqual(run('questionBanks["T"].length'), 2);
    run('editorClose()');
    assert.strictEqual(run('questionBanks["T"].length'), 1); // 空题被清理
});
test('编辑器导航越界保护', () => {
    run(`questionBanks = { 'T': [${JSON.stringify(Q('唯一题', 'A'))}] };
        editBankName = 'T'; editIndex = 0; editorDirty = false;`);
    run('editorNavigate(1); editorNavigate(1);');
    assert.strictEqual(run('editIndex'), 0);
});


test('题型与答案一致性:单选答案改成 AC 后自动变多选(防"单选+多字母"死题)', async () => {
    // 关卡 bug:编辑器里把答案从 A 改成 AC 却没改题型 → type='单选' 而 answer='AC',
    // 刷题时按单选渲染(控件只能选一个字母)→ 永远判不对。
    // 注意:本文件前面的用例会永久改写 elements['editor-options'].querySelectorAll,
    // 故这里用**独立 app 实例**,避免继承那份带空选项的桩。
    const app = await loadApp();
    app.elements['editor-options'].querySelectorAll = () => ([
        { dataset: { letter: 'A' }, value: '选项甲', disabled: false },
        { dataset: { letter: 'B' }, value: '选项乙', disabled: false },
        { dataset: { letter: 'C' }, value: '选项丙', disabled: false },
    ]);
    app.run(`questionBanks = { 'T': [${JSON.stringify(Q('原题', 'A'))}] };
        editBankName = 'T'; editIndex = 0;
        editorStem.value = '原题'; editorType.value = '单选'; editorAnswer.value = 'AC';`);
    assert.strictEqual(app.run('editorSaveCurrent(true)'), true);
    const saved = JSON.parse(app.run('JSON.stringify(questionBanks["T"][0])'));
    assert.strictEqual(saved.answer, 'AC');
    assert.strictEqual(saved.type, '多选', '答案多字母必须自动改为多选');
    assert.strictEqual(app.run('editorType.value'), '多选', '下拉框应回显真正落库的类型');
});

test('题型与答案一致性:finalizeQuestion 兜底纠正历史坏数据', async () => {
    const app = await loadApp();
    app.run(`globalThis.__q1 = finalizeQuestion({ content:'x', type:'单选', options:{A:'甲',B:'乙',C:'丙'}, answer:'AC' })`);
    assert.strictEqual(app.run('__q1.type'), '多选', '应纠正为多选');
    // 导入材料写「类型:多选」但答案是单字母 → 仍以答案为准判为单选(既有规则,判分自洽)
    app.run(`globalThis.__q2 = finalizeQuestion({ content:'x', type:'多选', options:{A:'甲',B:'乙'}, answer:'A' })`);
    assert.strictEqual(app.run('__q2.type'), '单选', '导入路径:类型提示服从答案');
    // 但编辑器里**用户亲手选**的多选必须保留(多选只有一个正确项是合法形态)
    app.run(`globalThis.__q4 = finalizeQuestion({ content:'x', type:'多选', options:{A:'甲',B:'乙'}, answer:'A', _typeExplicit:true })`);
    assert.strictEqual(app.run('__q4.type'), '多选', '编辑器显式选的多选应保留');
    assert.ok(!('_typeExplicit' in JSON.parse(app.run('JSON.stringify(__q4)'))), '内部标记不得落库');
    // 判断题不受影响
    app.run(`globalThis.__q3 = finalizeQuestion({ content:'x', type:'判断', options:{A:'正确',B:'错误'}, answer:'A' })`);
    assert.strictEqual(app.run('__q3.type'), '判断', '判断题不应被改编');
});
