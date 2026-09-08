import assert from 'node:assert';
import { loadApp, makeEl } from './helpers/vm-harness.mjs';

const { run, elements, store, alerts, sandbox, domContentLoadedCount } = await loadApp();

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };
const Q = (content, answer) => ({ content, type: '单选', options: {A:'甲',B:'乙'}, answer, analysis: '', explanation: '', confidence: 1, raw: '' });

console.log('== 功能1:错题移出规则可配置 ==');
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

console.log('== 功能2:复习范围选择 ==');
test('范围过滤:题库×题型组合', () => {
    sandbox.document.querySelectorAll = (sel) => {
        if (sel.includes('scope-bank')) return [{ value: '高数' }, { value: '英语' }];
        if (sel.includes('scope-type')) return [{ value: '单选' }, { value: '判断' }];
        return [];
    };
    run(`errorQuestions = [
        { content: 'a', type: '单选', bankName: '高数' },
        { content: 'b', type: '多选', bankName: '高数' },
        { content: 'c', type: '判断', bankName: '英语' },
        { content: 'd', type: '单选', bankName: '数学' },
    ];`);
    run(`const { banks, types } = getScopeSelection();
        globalThis.__filtered = errorQuestions.filter(q => banks.has(q.bankName || '未知题库') && types.has(q.type));`);
    assert.strictEqual(run('globalThis.__filtered.length'), 2);
});
test('开始复习会话:逐题模式+计数归零', () => {
    run(`startReviewSession([{ content: 'r1', type: '单选' }, { content: 'r2', type: '判断' }]);`);
    assert.strictEqual(run('currentQuiz.length'), 2);
    assert.strictEqual(run('quizMode'), 'immediate');
    assert.strictEqual(run('correctCount'), 0);
});

console.log('== 功能3:题库编辑器 ==');
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

console.log(`\n全部通过:${passed} 项断言组 ✅`);
