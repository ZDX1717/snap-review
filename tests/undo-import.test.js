// 导入撤销/覆盖快照/预览防呆测试(vm 沙箱驱动 bank.js)
// 三组各自独立的 app 实例:必须用 describe 包裹 —— node:test 里同一层级的多个
// before 会在任何用例执行前全部跑完,若平铺会让后面的启动覆盖前面的状态。
import test, { describe, before } from 'node:test';
import assert from 'node:assert';
import { loadApp } from './helpers/vm-harness.mjs';

const mkQ = (content) => ({ content, type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', confidence: 1, bankName: '刑法' });

describe('导入批次记录 + 撤销上次导入', () => {
    let run, elements, store;
    before(async () => {
        ({ run, elements, store } = await loadApp({ confirmResult: true }));

        run(`questionBanks = { '刑法': [${JSON.stringify(mkQ('OLD'))}] }; currentBankName = '刑法'; questionBank = questionBanks['刑法'];`);
        run(`errorQuestions = [{ ...${JSON.stringify(mkQ('NEW1'))}, userAnswer: 'B' }]; favoriteQuestions = [{ ...${JSON.stringify(mkQ('NEW2'))} }];`);
        run(`previewData = [
            { q: ${JSON.stringify(mkQ('NEW1'))}, include: true, warnings: [] },
            { q: ${JSON.stringify(mkQ('NEW2'))}, include: true, warnings: [] },
        ];`);
        elements['preview-target-bank'].value = '刑法';
        elements['preview-skip-dupes'].checked = true;
        elements['preview-overwrite'].checked = false;
        run('commitPreviewImport()');
    });

    test('导入成功且批次已记录(指纹 2 条,信息栏刷新)', () => {
        assert.strictEqual(run(`questionBanks['刑法'].length`), 3);
        const batches = JSON.parse(store.get('importBatches'));
        assert.strictEqual(batches.length, 1);
        assert.strictEqual(batches[0].fingerprints.length, 2);
        assert.strictEqual(batches[0].bank, '刑法');
        assert.ok(elements['last-import-info'].textContent.includes('刑法'));
    });

    test('撤销:题库/错题本/收藏按指纹级联清理', () => {
        run('undoLastImport()');
        assert.strictEqual(run(`questionBanks['刑法'].length`), 1);
        assert.strictEqual(run(`questionBanks['刑法'][0].content`), 'OLD');
        assert.strictEqual(run('errorQuestions.length'), 0);
        assert.strictEqual(run('favoriteQuestions.length'), 0);
        assert.strictEqual(JSON.parse(store.get('importBatches')).length, 0);
    });

    test('手改过的题指纹已变,撤销自动跳过不误删', async () => {
        const app = await loadApp({ confirmResult: true });
        const r = app.run;
        r(`questionBanks = { '刑法': [${JSON.stringify(mkQ('NEW1'))}] }; currentBankName = '刑法'; questionBank = questionBanks['刑法'];`);
        r(`recordImportBatch({ time: 't', source: '测试', bank: '刑法', fingerprints: [questionDedupKey(questionBanks['刑法'][0])], imported: 1 });`);
        r(`questionBanks['刑法'][0].content = 'NEW1-改';`); // 用户手改 → 指纹变化
        r('undoLastImport()');
        assert.strictEqual(r(`questionBanks['刑法'].length`), 1); // 未被误删
        assert.strictEqual(r(`questionBanks['刑法'][0].content`), 'NEW1-改');
        assert.strictEqual(JSON.parse(app.store.get('importBatches')).length, 0); // 批次作废
    });

    test('取消确认:批次保留,可再次撤销', async () => {
        const app = await loadApp({ confirmResult: false });
        const r = app.run;
        r(`questionBanks = { '刑法': [${JSON.stringify(mkQ('NEW1'))}] }; currentBankName = '刑法'; questionBank = questionBanks['刑法'];`);
        r(`recordImportBatch({ time: 't', source: '测试', bank: '刑法', fingerprints: [questionDedupKey(questionBanks['刑法'][0])], imported: 1 });`);
        r('undoLastImport()'); // confirm=false → 取消
        assert.strictEqual(r(`questionBanks['刑法'].length`), 1);
        assert.strictEqual(JSON.parse(app.store.get('importBatches')).length, 1); // 批次仍在
    });
});

describe('覆盖前快照与恢复', () => {
    let run, elements, store;
    before(async () => {
        ({ run, elements, store } = await loadApp({ confirmResult: true }));
        run(`questionBanks = { '英语': [${JSON.stringify(mkQ('OLD1'))}, ${JSON.stringify(mkQ('OLD2'))}] }; currentBankName = '英语'; questionBank = questionBanks['英语'];`);
        run(`previewData = [{ q: ${JSON.stringify(mkQ('REPLACED'))}, include: true, warnings: [] }];`);
        elements['preview-target-bank'].value = '英语';
        elements['preview-skip-dupes'].checked = true;
        elements['preview-overwrite'].checked = true;
        run('commitPreviewImport()');
    });

    test('覆盖导入成功且自动存"覆盖导入前"版本', () => {
        assert.strictEqual(run(`questionBanks['英语'].length`), 1);
        assert.strictEqual(run(`questionBanks['英语'][0].content`), 'REPLACED');
        const versions = JSON.parse(store.get('bankVersions'));
        assert.strictEqual(versions['英语'][0].action, '覆盖导入前');
        assert.strictEqual(versions['英语'][0].questions.length, 2);
    });

    test('恢复此版本:题库还原,当前内容先自动存版', () => {
        run(`restoreBankVersion('英语', 0)`);
        assert.strictEqual(run(`questionBanks['英语'].length`), 2);
        assert.strictEqual(run(`questionBanks['英语'][0].content`), 'OLD1');
        assert.strictEqual(store.get('overwriteSnapshot'), undefined);
    });
});

describe('预览防呆', () => {
    let run;
    before(async () => {
        ({ run } = await loadApp({ confirmResult: true }));
    });

    test('低置信度/缺答案题默认不勾选', () => {
        const good = mkQ('好题');
        const noAns = { ...mkQ('没答案'), answer: '', confidence: 0.1 }; // 真实形态:finalize 会因缺答案压低置信度
        run(`openImportPreview([${JSON.stringify(good)}, ${JSON.stringify(noAns)}]);`);
        assert.strictEqual(run('previewData[0].include'), true);
        assert.strictEqual(run('previewData[1].include'), false);
    });

    test('只保留无警告题(单向过滤,可手动勾回)', () => {
        const good = mkQ('好题');
        const noAns = { ...mkQ('没答案'), answer: '' };
        run(`openImportPreview([${JSON.stringify(good)}, ${JSON.stringify(noAns)}]);`);
        run(`previewData[1].include = true; keepCleanOnly();`);
        assert.strictEqual(run('previewData[0].include'), true);
        assert.strictEqual(run('previewData[1].include'), false);
    });
});

describe('版本记录:可删、不空存、挂在题库设置里(👤 2026-09-11)', () => {
    let run, store, sandbox, elements;
    before(async () => {
        ({ run, store, sandbox, elements } = await loadApp({ confirmResult: true }));
        run(`init()`);
    });

    test('删版本:列表少一条并落盘;删空了连键一起清掉', () => {
        run(`bankVersions = {}; questionBanks = { '甲库': [${JSON.stringify(mkQ('A'))}] }`);
        run(`pushBankVersion('甲库', '覆盖导入前', [${JSON.stringify(mkQ('X'))}])`);
        run(`pushBankVersion('甲库', '去重前', [${JSON.stringify(mkQ('Y'))}])`);
        assert.strictEqual(run(`loadBankVersions()['甲库'].length`), 2);
        // 删第 0 条(较早的那条)
        assert.strictEqual(run(`deleteBankVersion('甲库', 0)`), true);
        assert.strictEqual(run(`loadBankVersions()['甲库'].length`), 1);
        assert.strictEqual(run(`loadBankVersions()['甲库'][0].action`), '去重前', '删掉的应是指定下标那条');
        assert.strictEqual(JSON.parse(store.get('bankVersions'))['甲库'].length, 1, '应落盘');
        // 删掉最后一条 → 键一起清掉(不留空数组)
        run(`deleteBankVersion('甲库', 0)`);
        assert.ok(!('甲库' in run(`loadBankVersions()`)), '删空后不应留下空数组');
        // 越界与不存在的库:安全返回 false
        assert.strictEqual(run(`deleteBankVersion('甲库', 0)`), false);
        assert.strictEqual(run(`deleteBankVersion('没这库', 0)`), false);
    });

    test('去重:没有重复时不存版本(别让无意义的安全网占满 3 个槽)', () => {
        run(`bankVersions = {}`);
        run(`questionBanks = { '乙库': [${JSON.stringify(mkQ('P1'))}, ${JSON.stringify(mkQ('P2'))}] }`);
        run(`dedupBank('乙库')`);
        assert.strictEqual(run(`loadBankVersions()['乙库']`), undefined,
            '没有重复就不该产生版本(旧实现一进来就存版,空点一次也留一条)');
        // 真有重复时才存
        run(`questionBanks['乙库'].push(${JSON.stringify(mkQ('P1'))})`);
        run(`dedupBank('乙库')`);
        assert.strictEqual(run(`loadBankVersions()['乙库'].length`), 1);
        assert.strictEqual(run(`loadBankVersions()['乙库'][0].action`), '去重前');
    });

    test('版本面板在「题库设置」里渲染,每条都带恢复与删除', () => {
        run(`bankVersions = {}`);
        run(`questionBanks = { '丙库': [${JSON.stringify(mkQ('Q1'))}] }`);
        run(`pushBankVersion('丙库', '覆盖导入前', [${JSON.stringify(mkQ('Z1'))}])`);
        run(`state.editBankName = '丙库'; state.editIndex = 0; renderBankEditor()`);
        const mark = sandbox.__created.length;
        run(`renderBankEditor()`);
        const created = sandbox.__created.slice(mark);
        const rows = created.filter(c => String(c.el.className).includes('version-item'));
        assert.ok(rows.length >= 1, '版本面板应渲染出条目');
        const btns = created.filter(c => c.tag === 'BUTTON' && String(c.el.className).includes('version-del'));
        assert.ok(btns.length >= 1, '每条版本都要有删除键(👤 反馈的缺口)');
        const restore = created.filter(c => c.tag === 'BUTTON' && String(c.el.textContent).includes('恢复此版'));
        assert.ok(restore.length >= 1, '每条版本都要有恢复键');
        // 面板必须挂在题库设置容器里,而不是库卡上
        const admin = created.filter(c => String(c.el.className).includes('bank-versions-panel'));
        assert.ok(admin.length >= 1, '版本面板应渲染');
        assert.strictEqual(run(`document.getElementById('editor-bank-admin') ? 1 : 0`), 1);
    });
});

describe('删库后回收站立刻更新(👤 反馈的 bug)', () => {
    let run, store, elements, sandbox;
    before(async () => {
        ({ run, store, elements, sandbox } = await loadApp({ confirmResult: true }));
        run(`init()`);
    });

    test('删库:进回收站 + 计数与列表当场刷新(不用刷页面)', () => {
        run(`questionBanks = { '要删的库': [${JSON.stringify(mkQ('D1'))}, ${JSON.stringify(mkQ('D2'))}], '留下的库': [${JSON.stringify(mkQ('K1'))}] }`);
        run(`bankVersions = {}; bankColors = { '要删的库': 'blue' }`);
        elements['recycle-count'].textContent = '(0)';   // 先按"空回收站"起跑(不预热,免得依赖未挂钩子的函数)
        // 记录删库过程中新创建的元素:回收站条目会被重建 → 能观察到 renderRecycleBin 真的跑了
        const mark = sandbox.__created.length;
        run(`deleteBank('要删的库')`);
        const created = sandbox.__created.slice(mark);

        // ① 库里没了
        assert.ok(!('要删的库' in run(`questionBanks`)), '库应已删除');
        // ② 回收站里有了(题+错+藏整体打包)
        const bin = JSON.parse(store.get('recycledBanks'));
        assert.ok(bin['要删的库'], '应已进回收站');
        assert.strictEqual(bin['要删的库'].bank.length, 2, '题目应整体打包进回收站');
        // ③ **当场**刷新:回收站条目被重建 + 计数变了
        const recycleRows = created.filter(c => String(c.el.className).includes('recycle-item'));
        assert.ok(recycleRows.length >= 1,
            '删库后应重建回收站条目(旧实现漏了 renderRecycleBin,要刷页面才更新 —— 👤 反馈的 bug)');
        assert.strictEqual(elements['recycle-count'].textContent, '(1)', '回收站计数应当场变成 1');
        // ④ 顺带:配色不残留(库没了,按库名存的颜色也该清掉)
        assert.strictEqual(run(`Object.prototype.hasOwnProperty.call(bankColors, '要删的库')`), false,
            '删库应一并清掉它的卡片配色');
    });
});
