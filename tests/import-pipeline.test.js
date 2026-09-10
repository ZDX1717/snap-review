import test from 'node:test';
import assert from 'node:assert';
import { loadApp, makeEl } from './helpers/vm-harness.mjs';

const { run, elements, store, alerts, sandbox, domContentLoadedCount } = await loadApp({ promptValue: 'AI题库' });

const P = (s) => run(`parseQuestionsText(${JSON.stringify(s)})`);

test('DOMContentLoaded 只注册一次', () => assert.strictEqual(domContentLoadedCount.n, 1));
test("normalizeAnswerString('CA')==='AC'", () => assert.strictEqual(run("normalizeAnswerString('CA')"), 'AC'));
test('损坏 JSON 不崩溃', () => {
    store.set('questionBanks', '{bad');
    run('loadFromLocalStorage()');
    assert.strictEqual(Object.keys(run('questionBanks')).length, 0);
});

test('完整字段(解释/选项解释/解析/类型)全部保留', () => {
    const qs = P(`# 单选题1
题目：福祸相依体现了（）
A：矛盾的同一性
A解释：矛盾双方相互依存
B：矛盾的斗争性
答案：A
解析：契合同一性定义
类型：单选`);
    assert.strictEqual(qs.length, 1);
    const q = qs[0];
    assert.strictEqual(q.title, '单选题1');
    assert.strictEqual(q.content, '福祸相依体现了'); // 空答题槽括号按噪音清除
    assert.strictEqual(q.options.A, '矛盾的同一性');
    assert.strictEqual(q.optionExplanations.A, '矛盾双方相互依存');
    assert.strictEqual(q.answer, 'A');
    assert.strictEqual(q.analysis, '契合同一性定义');
    assert.strictEqual(q.type, '单选');
});
test('连续多题(无#分隔)', () => {
    const qs = P(`题目：第一题
A：甲
B：乙
答案：A
题目：第二题
A：丙
B：丁
答案：B`);
    assert.strictEqual(qs.length, 2);
    assert.strictEqual(qs[0].content, '第一题');
    assert.strictEqual(qs[1].content, '第二题');
});

test('多题+选项+答案+解析', () => {
    const qs = P(`1. 下列哪个是编程语言？
A. Python
B. HTML
C. HTTP
D. TCP
答案：A
解析：Python 是编程语言

2. 下列哪些属于前端技术？
A. HTML
B. CSS
C. JavaScript
D. SQL
答案：ABC`);
    assert.strictEqual(qs.length, 2);
    assert.strictEqual(qs[0].content, '下列哪个是编程语言？');
    assert.strictEqual(qs[0].options.A, 'Python');
    assert.strictEqual(qs[0].options.D, 'TCP');
    assert.strictEqual(qs[0].answer, 'A');
    assert.strictEqual(qs[0].type, '单选');
    assert.strictEqual(qs[0].analysis, 'Python 是编程语言');
    assert.strictEqual(qs[1].type, '多选');
    assert.strictEqual(qs[1].answer, 'ABC');
});
test('多行题干保留换行', () => {
    const qs = P(`1. 下列关于马克思主义的说法
正确的是哪一个？
A. 选项一
B. 选项二
答案：A`);
    assert.strictEqual(qs[0].content, '下列关于马克思主义的说法\n正确的是哪一个？');
});

test('题干+行内选项+行内答案', () => {
    const qs = P(`1. 一年有几个月？A.10 B.11 C.12 D.13 答案：C
2. 光速约为每秒多少公里？A.3万 B.30万 C.300万 答案：B`);
    assert.strictEqual(qs.length, 2);
    assert.strictEqual(qs[0].content, '一年有几个月？');
    assert.deepStrictEqual(Object.keys(qs[0].options), ['A', 'B', 'C', 'D']);
    assert.strictEqual(qs[0].options.C, '12');
    assert.strictEqual(qs[0].answer, 'C');
    assert.strictEqual(qs[1].options.B, '30万');
});
test('选项前是中文标点(？A.10)', () => {
    const qs = P(`1. 地球绕太阳转吗？A.是 B.否 答案：A`);
    assert.strictEqual(qs[0].content, '地球绕太阳转吗？');
    assert.strictEqual(qs[0].options.B, '否');
});
test('题干含"A、B"文字不被误拆', () => {
    const qs = P(`1. 下列说法A、B正确的是哪个？答案：A`);
    assert.strictEqual(qs[0].content, '下列说法A、B正确的是哪个？');
    assert.deepStrictEqual(Object.keys(qs[0].options), []);
});

test('答案"对"→ 判断题,A正确B错误', () => {
    const qs = P(`1. 中国的首都是北京。
答案：对`);
    const q = qs[0];
    assert.strictEqual(q.type, '判断');
    assert.strictEqual(q.options.A, '正确');
    assert.strictEqual(q.options.B, '错误');
    assert.strictEqual(q.answer, 'A');
});
test('答案"错误"/"√"→ B/A', () => {
    assert.strictEqual(P(`1. 地球是方的。答案：错误`)[0].answer, 'B');
    assert.strictEqual(P(`1. 水的化学式是H2O。答案：√`)[0].answer, 'A');
});
test('"判断题："开头 + 答案A', () => {
    const qs = P(`判断题：太阳从东边升起。
答案：A`);
    assert.strictEqual(qs[0].type, '判断');
    assert.strictEqual(qs[0].answer, 'A');
});

test('类型提示与答案矛盾时以答案推断为准(判分自洽)', () => {
    const qs = P(`题目：测试
A：甲
B：乙
答案：A
类型：多选`);
    assert.strictEqual(qs[0].type, '单选'); // 答案 A 是单字母 → 单选,判分以答案为根本
});
test('缺答案 → 保留进预览并降低置信度', () => {
    const qs = P(`1. 没有答案的题
A. 甲
B. 乙`);
    assert.strictEqual(qs.length, 1);
    assert.strictEqual(qs[0].answer, '');
    assert.ok(qs[0].confidence < 0.6);
});
test('finalizeQuestion 幂等', () => {
    const before = JSON.stringify(P(`1. 测试 A.1 B.2 答案：B`)[0]);
    const q2 = run(`(() => { const q = parseQuestionsText(${JSON.stringify('1. 测试 A.1 B.2 答案：B')})[0]; return JSON.stringify(finalizeQuestion(q)); })()`);
    assert.strictEqual(q2, before);
});

test('HTML 标签转行', () => {
    const lines = run(`htmlToLines('<p>1. 题目一</p><p>A. 甲</p>答案：A')`);
    assert.ok(lines.some(l => l.includes('题目一')));
    assert.ok(!lines.some(l => l.includes('<p>')));
});

test('批内去重 + 目标题库查重 + 正确入库', () => {
    run(`
        questionBanks = { '目标': [{ content: '已存在的题', options: {A:'甲',B:'乙'}, answer: 'A', type: '单选', confidence: 1, raw: '' }] };
        previewData = [
            { include: true, q: parseQuestionsText('1. 全新题目？A.甲 B.乙 答案：A')[0] },
            { include: true, q: parseQuestionsText('2. 全新题目？A.甲 B.乙 答案：A')[0] },  // 与第1题批内重复(同题干同答案? 不同题干,不重复)
            { include: true, q: parseQuestionsText('3. 已存在的题 A.甲 B.乙 答案：A')[0] }, // 与目标题库重复
            { include: true, q: parseQuestionsText('4. 缺答案的题 A.甲 B.乙')[0] },        // 缺答案被丢弃
            { include: false, q: parseQuestionsText('5. 未勾选 A.甲 B.乙 答案：A')[0] },
        ];
        previewData[1].q.content = '全新题目？'; // 改成和第1题完全一样 → 批内重复
        previewTargetBankSelect.value = '目标';
        previewOverwrite.checked = false;
        previewSkipDupes.checked = true;
        commitPreviewImport();
    `);
    const target = JSON.parse(run('JSON.stringify(questionBanks["目标"])'));
    // 第1题入库;第2题批内重复跳过;第3题与目标重复跳过;第4题缺答案入库为"待补";第5题未勾选
    assert.strictEqual(target.length, 3);
    assert.strictEqual(target.filter(q => q.content === '全新题目？').length, 1);
    assert.ok(target.some(q => q.content === '已存在的题'));
    const pending = target.find(q => q.content === '缺答案的题');
    assert.ok(pending && pending.answer === ''); // 待补答案,不判分不出题
});
test('新建题库(prompt) + 导入后切换当前题库', () => {
    run(`
        previewData = [{ include: true, q: parseQuestionsText('1. 新题？A.甲 B.乙 答案：A')[0] }];
        previewTargetBankSelect.value = '__new__';
        previewOverwrite.checked = false;
        previewSkipDupes.checked = true;
        commitPreviewImport();
    `);
    assert.ok(run('questionBanks["AI题库"]').length === 1);
    assert.strictEqual(run('currentBankName'), 'AI题库');
    assert.strictEqual(run('isAllBanksView'), false);
});
test('覆盖模式(overwrite)清空目标后导入', () => {
    run(`
        previewData = [{ include: true, q: parseQuestionsText('1. 覆盖后的题 A.甲 B.乙 答案：B')[0] }];
        previewTargetBankSelect.value = 'AI题库';
        previewOverwrite.checked = true;
        commitPreviewImport();
    `);
    const bank = JSON.parse(run('JSON.stringify(questionBanks["AI题库"])'));
    assert.strictEqual(bank.length, 1);
    assert.strictEqual(bank[0].content, '覆盖后的题');
});

