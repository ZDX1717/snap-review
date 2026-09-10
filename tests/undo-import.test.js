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
