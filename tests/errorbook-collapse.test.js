import assert from 'node:assert';
import { loadApp, makeEl } from './helpers/vm-harness.mjs';

const { run, elements, store, alerts, sandbox, domContentLoadedCount } = await loadApp();

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const setup = `
    errorQuestions = [
        { content: 'Q1', type: '单选', options: {A:'x'}, answer: 'A', bankName: '高数', userAnswer: 'B' },
        { content: 'Q2', type: '单选', options: {A:'y'}, answer: 'B', bankName: '高数', userAnswer: 'A' },
        { content: 'Q3', type: '判断', options: {A:'正确',B:'错误'}, answer: 'A', bankName: '英语', userAnswer: '未作答' },
    ];
`;

console.log('== 展开状态持久化 ==');
test('保存/加载展开状态(缺省折叠语义)', () => {
    run(`expandedBanks = { '高数': true, '英语': false }; saveCollapsedBanks();`);
    assert.strictEqual(store.get('errorBookExpandedBanks'), JSON.stringify({ '高数': true, '英语': false }));
    run(`expandedBanks = {}; loadCollapsedBanks();`);
    assert.strictEqual(run('expandedBanks["高数"]'), true);
    assert.strictEqual(run('expandedBanks["英语"]'), false);
});
test('损坏的展开状态安全重置', () => {
    store.set('errorBookExpandedBanks', '{bad');
    run('loadCollapsedBanks()');
    assert.strictEqual(run('Object.keys(expandedBanks).length'), 0);
});

console.log('== 默认折叠 + 全部展开/折叠 ==');
test('缺省(无状态)→ 全部折叠,按钮文案"全部展开"', () => {
    run(setup + ` expandedBanks = {}; updateErrorsList();`);
    assert.strictEqual(elements['toggle-all-banks-btn'].textContent, '全部展开');
});
test('点击 → 全部展开,按钮变"全部折叠"', () => {
    run('toggleAllBanks()');
    assert.strictEqual(run('expandedBanks["高数"]'), true);
    assert.strictEqual(run('expandedBanks["英语"]'), true);
    assert.strictEqual(elements['toggle-all-banks-btn'].textContent, '全部折叠');
});
test('再次点击 → 全部折叠', () => {
    run('toggleAllBanks()');
    assert.strictEqual(run('expandedBanks["高数"]'), false);
    assert.strictEqual(run('expandedBanks["英语"]'), false);
    assert.strictEqual(elements['toggle-all-banks-btn'].textContent, '全部展开');
});
test('部分展开时点击 → 全部折叠', () => {
    run(setup + ` expandedBanks = { '高数': false, '英语': true }; updateErrorsList();`);
    assert.strictEqual(elements['toggle-all-banks-btn'].textContent, '全部折叠');
    run('toggleAllBanks()');
    assert.strictEqual(run('expandedBanks["英语"]'), false);
    assert.strictEqual(run('expandedBanks["高数"]'), false);
});
test('持久化状态在重新渲染时生效', () => {
    run(setup + ` expandedBanks = { '英语': true }; updateErrorsList();`);
    assert.strictEqual(elements['toggle-all-banks-btn'].textContent, '全部折叠');
});

console.log('== 边界 ==');
test('空错题本渲染路径不报错', () => {
    run(`errorQuestions = []; updateErrorsList();`);
    assert.ok(true);
});
test('未知名错题归入"未知题库"分组', () => {
    run(`errorQuestions = [{ content: 'Q9', type: '单选', answer: 'A', userAnswer: 'B' }]; updateErrorsList();`);
    assert.strictEqual(elements['toggle-all-banks-btn'].textContent, '全部展开');
});
test('删除错题后重新渲染不报错', () => {
    run(setup + ` expandedBanks = {}; updateErrorsList(); deleteError(0);`);
    assert.strictEqual(run('errorQuestions.length'), 2);
});

console.log(`\n全部通过:${passed} 项断言组 ✅`);
