// 待补池测试:缺答案题入库/刷题排除/编辑器只看待补
import assert from 'node:assert';
import { loadApp } from './helpers/vm-harness.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

console.log('== 待补池 ==');
{
    const { run, elements } = await loadApp({ confirmResult: true });

    run(`questionBanks = {}; previewData = [
        { include: true, q: parseQuestionsText('1. 有答案 A.甲 B.乙 答案：A')[0] },
        { include: true, q: parseQuestionsText('2. 没答案 A.甲 B.乙')[0] },
    ];`);
    run(`previewOverwrite.checked = false; previewSkipDupes.checked = true;`);
    elements['preview-target-bank'].value = '__new__'; // prompt 桩返回 'x' → 新库名 x
    run('commitPreviewImport()');

    test('缺答案题入库为待补(不丢弃)', () => {
        assert.strictEqual(run(`questionBanks['x'].length`), 2);
        assert.strictEqual(run(`questionBanks['x'].filter(q => !q.answer).length`), 1);
        assert.ok(elements['import-status'].textContent.includes('待补答案'));
    });

    test('刷题自动排除待补题', () => {
        run(`questionBank = questionBanks['x']; currentBankName = 'x';`);
        run('startQuiz()');
        assert.strictEqual(run('currentQuiz.length'), 1);
        assert.strictEqual(run('currentQuiz[0].answer'), 'A');
    });

    test('全部待补时明确报错指引', () => {
        run(`questionBank = questionBanks['x'].filter(q => !q.answer);`);
        run('startQuiz()'); // 早退:不动旧会话,给出指引
        assert.strictEqual(run('currentQuiz.length'), 1);
        assert.ok(elements['quiz-status'].textContent.includes('待补答案'));
    });

    test('编辑器"只看待补答案"筛选与跳转', () => {
        run(`questionBank = questionBanks['x']; editBank('x');`);
        assert.strictEqual(run('editIndex'), 0);
        run('editorTogglePendingOnly(true)');
        assert.strictEqual(run('editIndex'), 1); // 跳到第一道待补(index 1)
        assert.strictEqual(run(`questionBanks['x'][1].answer`), '');
        run('editorNavigate(1)'); // 后面没有待补 → 不动
        assert.strictEqual(run('editIndex'), 1);
        run('editorNavigate(-1)'); // 前面没有待补 → 不动
        assert.strictEqual(run('editIndex'), 1);
    });
}

console.log(`\n通过 ${passed} 组`);
