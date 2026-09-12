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

// ==================== 题目列表:复选框 / 筛选 / 批量操作 / 编辑卡片(👤 2026-09-12 重构)====================
// 行的结构:checkbox + 序号 + 题干 + 徽章。点整行(它是 <label>)即勾选 —— 动作只在选中后出现。
function listRows(app) {
    // ⚠️ 测试桩的 innerHTML='' 不会清 children,历史渲染的行都还堆在里面。
    //    每轮渲染的顺序固定是"若干行 + 末尾的 ＋",故从尾部往回走、遇到上一轮的 ＋ 就停 ——
    //    这样拿到的**正好是最后一轮渲染的行**(按 idx 去重会留下已被筛掉的旧行,踩过)。
    const kids = app.elements['editor-question-list'].children;
    const rows = [];
    let i = kids.length - 1;
    if (i >= 0 && kids[i].classList && kids[i].classList.contains('editor-list-add')) i--;
    for (; i >= 0; i--) {
        const el = kids[i];
        if (!el.classList) continue;
        if (el.classList.contains('editor-list-add')) break;
        if (el.classList.contains('q-row')) rows.push(el);
    }
    return rows.reverse();
}
function byClass(el, cls) {
    return (el.children || []).filter(c => c.classList && c.classList.contains(cls));
}
function rowCheck(row) {
    return byClass(row, 'q-row-check')[0];
}
// 模拟"点一下复选框":浏览器里 label 会把它转成 change 事件
function clickCheck(row) {
    const box = rowCheck(row);
    box.checked = !box.checked;
    if (box._listeners && box._listeners.change) box._listeners.change();
    return box.checked;
}

test('列表:每行一个复选框,勾选后批量栏出现(👤 要求:选中才出现删除/编辑)', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { 'T': [${JSON.stringify(Q('第一题', 'A'))}, ${JSON.stringify(Q('第二题', 'A'))}, ${JSON.stringify(Q('第三题', 'A'))}] };
        editBankName = 'T'; editIndex = 0; renderBankEditor();`);
    const rows = listRows(app);
    assert.strictEqual(rows.length, 3, '三道题三行');
    for (const row of rows) {
        assert.ok(rowCheck(row), '每行都要有复选框');
        assert.strictEqual(rowCheck(row).type, 'checkbox', '必须是真正的 checkbox');
    }
    // 没选中 → 批量栏隐藏
    assert.ok(app.elements['editor-bulk-bar'].classList.contains('hidden'), '没选中时批量栏应隐藏');
    // 勾第一行
    assert.strictEqual(clickCheck(listRows(app)[0]), true);
    assert.strictEqual(app.run('editorSelected.length'), 1, '勾选应记进选中集');
    assert.ok(!app.elements['editor-bulk-bar'].classList.contains('hidden'), '选中后批量栏应出现');
    assert.strictEqual(app.elements['editor-bulk-count'].textContent, '已选 1 题');
    // 再勾一行 → 2 题;「编辑」此时禁用(一次只能编辑 1 道)
    clickCheck(listRows(app)[1]);
    assert.strictEqual(app.run('editorSelected.length'), 2);
    assert.strictEqual(app.elements['editor-bulk-edit'].disabled, true, '多选时「编辑」应禁用');
    assert.strictEqual(app.elements['editor-bulk-count'].textContent, '已选 2 题');
    // 取消选择 → 批量栏收回
    app.run('editorClearSelection()');
    assert.strictEqual(app.run('editorSelected.length'), 0);
    assert.ok(app.elements['editor-bulk-bar'].classList.contains('hidden'), '清空选择后批量栏应隐藏');
});

test('列表:行内徽章覆盖题型/待补/缺解析/AI/历史(筛选面板的视觉词典)', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { 'T': [
        { content: '缺答案', type: '单选', options: { A: '甲', B: '乙' }, answer: '' },
        { content: 'AI 补的', type: '多选', options: { A: '甲', B: '乙' }, answer: 'AB', analysis: '因为', analysisSource: 'ai' },
        { content: '带历史', type: '判断', options: { A: '正确', B: '错误' }, answer: 'A', analysis: '解析', histMarks: [{ action: 'x', time: 't' }] }
    ] };
    editBankName = 'T'; editIndex = 0; renderBankEditor();`);
    const rows = listRows(app);
    const texts = rows.map(r => byClass(r, 'q-row-badges')[0].children.map(b => b.textContent).join('|'));
    assert.ok(texts[0].includes('单选') && texts[0].includes('待补'), '第一行应是"单选 + 待补",实际:' + texts[0]);
    assert.ok(texts[1].includes('多选') && texts[1].includes('✍️'), '第二行应标出 AI 补的解析,实际:' + texts[1]);
    assert.ok(!texts[1].includes('缺解析'), '有解析的题不该标"缺解析"');
    assert.ok(texts[2].includes('🕘'), '带历史标记的题应有 🕘,实际:' + texts[2]);
});

test('筛选:组内任一、组间同时;筛选一变就清空多选(绝不删看不见的题)', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { 'T': [
        { content: '待补单选', type: '单选', options: { A: '甲', B: '乙' }, answer: '' },
        { content: '待补判断', type: '判断', options: { A: '正确', B: '错误' }, answer: '' },
        { content: '完整单选', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', analysis: '因为' },
        { content: 'AI多选', type: '多选', options: { A: '甲', B: '乙' }, answer: 'AB', analysis: '因为', aiSource: 'ai' }
    ] };
    editBankName = 'T'; editIndex = 0; renderBankEditor();`);
    const shown = () => listRows(app).map(r => r.dataset.idx);
    assert.deepStrictEqual(shown(), ['0', '1', '2', '3'], '没筛时四道都在');
    // 组内任一:待补答案 或 缺解析
    app.run(`editorToggleFilter('status', 'pending')`);
    assert.deepStrictEqual(shown(), ['0', '1'], '只留待补的两道');
    assert.strictEqual(app.run('activeFilterCount()'), 1);
    assert.strictEqual(app.run('editorPendingOnly'), true, '「只看待补」是 pending 这条筛选项的派生值');
    app.run(`editorToggleFilter('status', 'noAnalysis')`);
    assert.deepStrictEqual(shown(), ['0', '1'], '同组加一项 = 或,结果不变(这两道本来就缺解析)');
    // 组间同时:再叠 AI 维度 → 必须同时满足"待补/缺解析"与"AI 整理过"
    app.run(`editorToggleFilter('ai', 'touched')`);
    assert.deepStrictEqual(shown(), [], '两组同时满足:没有既是待补又经 AI 整理的题');
    app.run(`editorClearFilter()`);
    assert.deepStrictEqual(shown(), ['0', '1', '2', '3'], '清除筛选后全部回来');
    // 题型筛选(组内任一)
    app.run(`editorToggleFilter('type', '判断'); editorToggleFilter('type', '多选')`);
    assert.deepStrictEqual(shown(), ['1', '3'], '单选被排除,判断与多选都在');
    // 多选遇筛选变化 → 清空:不能让"看不见的题"留在选中集里等着被批量删除
    app.run('editorClearFilter(); editorSelectAllVisible()');
    assert.strictEqual(app.run('editorSelected.length'), 4);
    app.run(`editorToggleFilter('type', '单选')`);
    assert.strictEqual(app.run('editorSelected.length'), 0, '筛选一变,选中集必须清空');
    // 筛没了:空态文案要说明"是筛掉了"而不是"库里没题"
    app.run(`editorClearFilter(); editorToggleFilter('status', 'pending'); editorToggleFilter('ai', 'touched')`);
    assert.strictEqual(listRows(app).length, 0);
    assert.ok(/筛选/.test(app.elements['editor-empty'].textContent), '筛没了应提示筛选,而不是"暂无题目"');
});

test('筛选:questionMatchesFilter 的纯函数口径(空组不约束)', async () => {
    const app = await loadApp();
    const q = JSON.stringify({ content: 'x', type: '单选', options: { A: 'a', B: 'b' }, answer: '' });
    assert.strictEqual(app.run(`questionMatchesFilter(${q}, {})`), true, '空筛选 = 全通过');
    assert.strictEqual(app.run(`questionMatchesFilter(${q}, { type: ['单选'] })`), true);
    assert.strictEqual(app.run(`questionMatchesFilter(${q}, { type: ['判断'] })`), false);
    assert.strictEqual(app.run(`questionMatchesFilter(${q}, { status: ['pending'] })`), true);
    assert.strictEqual(app.run(`questionMatchesFilter(${q}, { status: ['noExplanation'] })`), true, '缺解释 → 命中');
    assert.strictEqual(app.run(`questionMatchesFilter(${q}, { status: ['fewOptions'] })`), false, '选项够 2 个 → 不命中');
    assert.strictEqual(app.run(`questionMatchesFilter(${q}, { ai: ['touched'] })`), false);
});

test('批量删除:二次确认;删 ≥2 道先存一版,单删不占版本槽', async () => {
    const app = await loadApp({ confirmResult: true });
    app.run(`bankVersions = {};
        questionBanks = { 'T': [${JSON.stringify(Q('甲', 'A'))}, ${JSON.stringify(Q('乙', 'A'))}, ${JSON.stringify(Q('丙', 'A'))}] };
        editBankName = 'T'; editIndex = 0; renderBankEditor();`);
    // 单删:不留版本(每库只有 3 个槽,删一道也存一版会把槽挤爆)
    app.run('editorSelected.push(currentEditBank()[0]); editorBulkDelete()');
    assert.strictEqual(app.run(`questionBanks['T'].length`), 2);
    assert.strictEqual(app.run(`(loadBankVersions()['T'] || []).length`), 0, '单删不该留版本');
    assert.strictEqual(app.run('editorSelected.length'), 0, '删完要清空选中集');
    // 批量删 2 道:先存一版(可回退)
    app.run('editorSelectAllVisible(); editorBulkDelete()');
    assert.strictEqual(app.run(`questionBanks['T'].length`), 0);
    const vers = JSON.parse(app.run(`JSON.stringify((loadBankVersions()['T'] || []).map(v => v.action))`));
    assert.deepStrictEqual(vers, ['批量删除前'], '批量删除前应自动存一版');
    assert.strictEqual(app.run(`(loadBankVersions()['T'][0].questions || []).length`), 2, '存的是删除前的 2 道');
});

test('批量删除:取消确认则一道不删', async () => {
    const app = await loadApp({ confirmResult: false });
    app.run(`bankVersions = {}; questionBanks = { 'T': [${JSON.stringify(Q('甲', 'A'))}, ${JSON.stringify(Q('乙', 'A'))}] };
        editBankName = 'T'; editIndex = 0; renderBankEditor();
        editorSelected.push(currentEditBank()[0])`);
    assert.strictEqual(app.run('editorBulkDelete()'), false);
    assert.strictEqual(app.run(`questionBanks['T'].length`), 2, '点了取消就不许动数据');
});

test('批量编辑:只对"恰好选中 1 道"生效;点了就开编辑卡片并把字段填好', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { 'T': [${JSON.stringify(Q('第一题', 'A'))}, ${JSON.stringify(Q('第二题', 'B'))}] };
        editBankName = 'T'; editIndex = 0; renderBankEditor();
        editorSelected.push(currentEditBank()[0], currentEditBank()[1])`);
    assert.strictEqual(app.run('editorBulkEdit()'), false, '多选时不该编辑');
    assert.ok(app.alerts.some(a => /一次只能编辑 1 道/.test(a)), '要给一句人话说明为什么不行');
    app.run('editorSelected.length = 0; editorSelected.push(currentEditBank()[1])');
    assert.strictEqual(app.run('editorBulkEdit()'), true);
    assert.strictEqual(app.run('editIndex'), 1, '卡片应停在选中的那道题上');
    assert.strictEqual(app.elements['editor-stem'].value, '第二题', '卡片字段应已填入这道的题干');
    assert.strictEqual(app.elements['editor-answer'].value, 'B');
    assert.strictEqual(app.elements['question-card-title'].textContent, '第 2 / 2 题');
});

test('编辑卡片:保存落到正确的那道题;有未保存修改时关闭要先问一句', async () => {
    const app = await loadApp({ confirmResult: true });
    app.run(`questionBanks = { 'T': [${JSON.stringify(Q('第一题', 'A'))}, ${JSON.stringify(Q('第二题', 'A'))}] };
        editBankName = 'T'; editIndex = 0; renderBankEditor();`);
    app.elements['editor-options']._setQueryAll([
        { dataset: { letter: 'A' }, value: '甲', disabled: false },
        { dataset: { letter: 'B' }, value: '乙', disabled: false },
    ]);
    app.run(`openQuestionCard(1)`);
    assert.strictEqual(app.run('editIndex'), 1);
    app.run(`editorStem.value = '第二题(卡片里改的)'; editorType.value = '单选'; editorAnswer.value = 'A';`);
    assert.strictEqual(app.run('saveQuestionCard()'), true);
    assert.strictEqual(app.run(`questionBanks['T'][1].content`), '第二题(卡片里改的)');
    assert.strictEqual(app.run(`questionBanks['T'][0].content`), '第一题', '别的题不该被动');
    // 未保存就关:守卫要拦一下(confirmResult=true → 放弃并关闭)
    app.run(`openQuestionCard(0); editorStem.value = '改了不保存'`);
    assert.strictEqual(app.run('closeQuestionCard()'), true);
    assert.strictEqual(app.run(`questionBanks['T'][0].content`), '第一题', '没保存的内容不该落库');
});

test('编辑卡片:上一题/下一题只在"看得见的题"之间走,到边界原地不动', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { 'T': [${JSON.stringify(Q('甲', 'A'))}, ${JSON.stringify(Q('乙', ''))}, ${JSON.stringify(Q('丙', 'A'))}] };
        editBankName = 'T'; editIndex = 0; renderBankEditor();`);
    app.run(`openQuestionCard(0)`);
    assert.strictEqual(app.run('editorCardNavigate(1)'), true);
    assert.strictEqual(app.run('editIndex'), 1);
    assert.strictEqual(app.elements['editor-stem'].value, '乙', '卡片字段要跟着换');
    assert.strictEqual(app.run('editorCardNavigate(-1)'), true);
    assert.strictEqual(app.run('editIndex'), 0);
    assert.strictEqual(app.run('editorCardNavigate(-1)'), false, '第一题再往前 → 不动');
    assert.strictEqual(app.run('editIndex'), 0);
    // 筛成"只看待补"后,下一题只在待补题之间走
    app.run(`editorTogglePendingOnly(true)`);
    assert.strictEqual(app.run('editIndex'), 1, '筛选后当前题收窄到第一道待补');
    assert.strictEqual(app.run('editorCardNavigate(1)'), false, '后面没有待补了 → 不动');
});

test('列表:筛后「全选」只选看得见的;新增题目会清掉筛选(否则新题看不见)', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { 'T': [${JSON.stringify(Q('待补一', ''))}, ${JSON.stringify(Q('已答', 'A'))}, ${JSON.stringify(Q('待补二', ''))}] };
        editBankName = 'T'; editIndex = 0; renderBankEditor();`);
    app.run(`editorToggleFilter('status', 'pending'); editorSelectAllVisible()`);
    assert.strictEqual(app.run('editorSelected.length'), 2, '全选 = 选当前筛选下看得见的两道');
    assert.deepStrictEqual(JSON.parse(app.run(`JSON.stringify(editorSelected.map(q => q.content))`)), ['待补一', '待补二']);
    // 新增题目:清筛选(否则新题不满足条件,列表里根本看不见)
    app.run('editorClearSelection(); editorAddQuestion()');
    assert.strictEqual(app.run('activeFilterCount()'), 0, '新增后筛选应被清掉');
    assert.strictEqual(listRows(app).length, 4, '新题应出现在列表里');
    assert.strictEqual(app.run('editIndex'), 3, '并直接打开它的编辑卡片');
});

test('重命名:编辑器正开着这一库时,标题/状态/列表立刻改成新名(bug 2026-09-12)', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { '旧库名': [${JSON.stringify(Q('题目甲', 'A'))}, ${JSON.stringify(Q('题目乙', 'A'))}] }`);
    app.run(`editBank('旧库名')`);          // 真实入口:它同时把库名写进标题栏
    app.run('editIndex = 1; renderBankEditor()');
    const title0 = String(app.elements['edit-bank-title'].textContent);
    assert.ok(title0.includes('旧库名'), '打开时标题应是旧名');
    // 真实顺序:先开对话框(它会把输入框预填成当前名),再改输入框,再确认
    app.run(`showRenameModal('旧库名')`);
    app.elements['rename-bank-name'].value = '新库名';
    app.run('renameBank()');
    // 症状一:标题还挂旧名
    const title1 = String(app.elements['edit-bank-title'].textContent);
    assert.ok(title1.includes('新库名'), '编辑器标题应立刻显示新库名');
    assert.ok(!title1.includes('旧库名'), '标题不该还挂着旧名');
    // 症状二(更致命):editBankName 还指着一个已不存在的键 → currentEditBank() 返回空数组,
    // 表现为"改个名,这库的题全没了",连保存都不知存到哪去
    assert.strictEqual(app.run('editBankName'), '新库名', '编辑器状态里的库名要跟着改');
    assert.strictEqual(app.run('currentEditBank().length'), 2, '改名后不该变成"这库没题了"');
    assert.strictEqual(app.run('editIndex'), 1, '停在第几题不该被重置');
    // 桩的 innerHTML='' 不会清 children,故只断言**最后一次重画**出来的那两行
    const redrawn = listRows(app).slice(-2);
    assert.strictEqual(redrawn.length, 2, '列表应已按新库重画');
    assert.strictEqual(redrawn[1].classList.contains('current'), true, '重画后仍停在原来那一题');
    assert.strictEqual(app.run(`questionBanks['新库名'].length`), 2);
    assert.ok(app.run(`!questionBanks['旧库名']`), '旧库名不该还在');
    // 改名后继续编辑/保存,必须落到新库名上
    app.elements['editor-options']._setQueryAll([
        { dataset: { letter: 'A' }, value: '甲', disabled: false },
        { dataset: { letter: 'B' }, value: '乙', disabled: false },
    ]);
    app.run(`editorStem.value = '题目乙(改名后改的)'; editorType.value = '单选'; editorAnswer.value = 'A';`);
    assert.strictEqual(app.run('editorSaveCurrent(true)'), true);
    assert.strictEqual(app.run(`questionBanks['新库名'][1].content`), '题目乙(改名后改的)');
});

test('重命名:改的不是编辑器里那一库时,不碰编辑器的状态', async () => {
    const app = await loadApp();
    app.run(`questionBanks = { '甲库': [${JSON.stringify(Q('甲题', 'A'))}], '乙库': [${JSON.stringify(Q('乙题', 'A'))}] };
        editBankName = '甲库'; editIndex = 0; renderBankEditor();`);
    app.elements['rename-bank-name'].value = '乙库改名';
    app.run(`state.currentRenameBank = '乙库'; renameBank()`);
    assert.strictEqual(app.run('editBankName'), '甲库', '编辑器仍应停在甲库');
    assert.strictEqual(app.run('currentEditBank().length'), 1);
    assert.strictEqual(app.run(`questionBanks['乙库改名'].length`), 1, '被改的那一库应改名成功');
    assert.strictEqual(app.run(`currentBankName`), '默认题库', '当前选中的库不是被改名那一库,不该被牵连');
});
