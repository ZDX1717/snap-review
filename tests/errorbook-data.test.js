// 错题本**数据层**(errorbook.js):入库 / 连对移出 / 单条删除 / 清空。
// ⚠️ 这里刻意只测数据与事件,不测渲染 —— 错题列表的渲染已并入库卡内嵌面板
//    (`bank.js` 的 renderErrorsForBank),test 里断言它的地方在 question-card.test.js。
//    历史:本文件之前叫 errorbook-collapse.test.js,10 条用例**全在覆盖一段死掉的独立列表渲染**
//    (2026-09-11 删除该段死代码时一并删掉;其中真正有价值的"展开状态持久化"两条
//     早已由 state-storage.test.js 的「错题本展开状态持久化往返」覆盖)。
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { loadApp } from './helpers/vm-harness.mjs';

const { run, store, sandbox, elements } = await loadApp();
run(`init()`);

// 记录 document 上派发的自定义事件(跨模块通知通道,架构铁律 4)
const dispatched = [];
const originalDispatch = sandbox.document.dispatchEvent;
sandbox.document.dispatchEvent = (evt) => { dispatched.push(evt && evt.type); return originalDispatch.call(sandbox.document, evt); };

test('入库:同一题干不重复入库,不同题干各自入库', () => {
    run(`errorQuestions = []`);
    run(`addToErrorBook({ content: 'Q1', type: '单选', answer: 'A' }, 'B')`);
    run(`addToErrorBook({ content: 'Q1', type: '单选', answer: 'A' }, 'C')`);   // 同题再错 → 不重复
    run(`addToErrorBook({ content: 'Q2', type: '单选', answer: 'A' }, 'B')`);
    assert.strictEqual(run(`errorQuestions.length`), 2);
    assert.strictEqual(run(`errorQuestions[0].userAnswer`), 'B', '同一题不应被后来的作答覆盖');
    // 落盘
    assert.ok(JSON.parse(store.get('errorQuestions')).length === 2, '入库应持久化');
});

test('连对达阈值自动移出;阈值 0 表示关闭(不移出)', () => {
    run(`errorQuestions = [{ content: 'Q1', type: '单选', answer: 'A', userAnswer: 'B', correctStreak: 0, bankName: '库' }]`);
    run(`masteryThreshold = 2`);
    assert.strictEqual(run(`updateErrorStreak({ content: 'Q1' }, true, 'A')`), 0, '第一次答对只计数');
    assert.strictEqual(run(`errorQuestions[0].correctStreak`), 1);
    assert.strictEqual(run(`updateErrorStreak({ content: 'Q1' }, true, 'A')`), 1, '达阈值应报告移出 1 条');
    assert.strictEqual(run(`errorQuestions.length`), 0);
    // 关闭移出
    run(`errorQuestions = [{ content: 'Q1', type: '单选', answer: 'A', userAnswer: 'B', correctStreak: 0 }]; masteryThreshold = 0;`);
    assert.strictEqual(run(`updateErrorStreak({ content: 'Q1' }, true, 'A')`), 0);
    assert.strictEqual(run(`errorQuestions.length`), 1, '关闭后连对再多也不移出');
});

test('答错清零连对并更新作答记录', () => {
    // ⚠️ 必须显式复位阈值:用例间共享同一模块实例,上一个用例把 masteryThreshold 设成了 0,
    // 而 updateErrorStreak 在阈值为 0 时**直接返回**(那是"关闭自动移出"的语义)
    run(`masteryThreshold = 2`);
    run(`errorQuestions = [{ content: 'Q1', type: '单选', answer: 'A', userAnswer: 'B', correctStreak: 1 }]`);
    run(`updateErrorStreak({ content: 'Q1' }, false, 'C')`);
    assert.strictEqual(run(`errorQuestions[0].correctStreak`), 0);
    assert.strictEqual(run(`errorQuestions[0].userAnswer`), 'C');
});

test('删除单条错题:数量减一、落盘、并通知库卡重绘', () => {
    run(`errorQuestions = [{ content: 'Q1', type: '单选', answer: 'A' }, { content: 'Q2', type: '单选', answer: 'A' }]`);
    dispatched.length = 0;
    run(`deleteError(0)`);
    assert.strictEqual(run(`errorQuestions.length`), 1);
    assert.strictEqual(run(`errorQuestions[0].content`), 'Q2', '应删掉指定下标那条');
    assert.strictEqual(JSON.parse(store.get('errorQuestions')).length, 1, '应落盘');
    // 跨模块刷新必须走事件(不得反过来 import bank.js,否则循环依赖炸模块加载)
    assert.ok(dispatched.includes('zquiz:embeds-dirty'), '删除后应派发 zquiz:embeds-dirty 通知库卡重绘');
});

test('清空错题本:全清、落盘、并通知库卡重绘', () => {
    run(`errorQuestions = [{ content: 'Q1', type: '单选', answer: 'A' }, { content: 'Q2', type: '单选', answer: 'A' }]`);
    dispatched.length = 0;
    run(`clearErrors()`);
    assert.strictEqual(run(`errorQuestions.length`), 0);
    assert.strictEqual(JSON.parse(store.get('errorQuestions')).length, 0, '应落盘');
    assert.ok(dispatched.includes('zquiz:embeds-dirty'), '清空后应派发通知');
});

test('取消确认时删除/清空都不生效', async () => {
    const h = await import('./helpers/vm-harness.mjs').then(m => m.loadApp({ confirmResult: false }));
    h.run(`init(); errorQuestions = [{ content: 'Q1', type: '单选', answer: 'A' }, { content: 'Q2', type: '单选', answer: 'A' }];`);
    h.run(`clearErrors()`);
    assert.strictEqual(h.run(`errorQuestions.length`), 2, '取消确认不应清空');
    h.run(`deleteError(0)`);
    assert.strictEqual(h.run(`errorQuestions.length`), 2, '取消确认不应删除');
});

test('生成本模块时不得引用 HTML 里不存在的容器(死渲染路径防复归)', () => {
    // 与 dom-structure 的同类守卫呼应:本模块已无渲染代码,不得再取 #errors-list
    // ⚠️ 必须先剥注释:否则"历史:删掉了 #errors-list 渲染"这句注释本身会被判成违规
    const src = readFileSync(new URL('../src/errorbook.js', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/errors-list/.test(src), 'errorbook.js 不得再引用 #errors-list(该页面已下线)');
    assert.ok(!/createElement\(/.test(src), 'errorbook.js 不得再有 DOM 渲染');
});

test('「清空错题本」按钮真的绑了事件(防"点了没反应")', () => {
    // 🚨 这条来自本次重构的真实回归:清理死代码时我用字符串替换删掉了
    //    `clearErrorsBtn.addEventListener('click', clearErrors);` —— 按钮从此点了没反应,
    //    而全套测试当时**全绿**(没有任何测试点过这个按钮)。测试装置里元素桩会记录监听器,
    //    故这里可以直接断言"click 监听确实存在"。
    const btn = elements['clear-errors-btn'];
    assert.ok(btn, '沙箱里应有 clear-errors-btn 元素桩');
    assert.strictEqual(typeof btn._listeners.click, 'function', '「清空错题本」必须有 click 监听');
});
