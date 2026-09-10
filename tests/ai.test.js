// AI 模块测试(0.9.x):预设/配置 + chat 客户端(假 fetch) + 分块 + 编排 + 存储 + 预览兜底/救援/B 路线集成
import assert from 'node:assert';
import test from 'node:test';
import { AI_PROVIDERS, normalizeAiConfig, aiConfigReady, chatCompletion, testConnection, splitIntoChunks, aiFormatMaterial, aiFixQuestions, serializeQuestion, groupQuestionChunks, buildAiNotes } from '../src/ai.js';
import { loadAiConfig, saveAiConfig, loadAiUsage, recordAiUsage } from '../src/storage.js';

// ---------- 厂商预设与配置 ----------
test('厂商预设:三家直连厂商在列', () => {
    const ids = AI_PROVIDERS.map(p => p.id);
    assert.deepStrictEqual(ids, ['zhipu', 'siliconflow', 'deepseek', 'custom']);
    assert.strictEqual(AI_PROVIDERS[0].model, 'glm-4-flash');
    assert.ok(AI_PROVIDERS[0].name.includes('免费'));
});

test('normalizeAiConfig:按厂商预设补齐 baseUrl/model;去尾斜杠;apiKey 永不默认', () => {
    const cfg = normalizeAiConfig({ providerId: 'zhipu', apiKey: 'k1', baseUrl: 'https://x.example/v4/' });
    assert.strictEqual(cfg.baseUrl, 'https://x.example/v4');
    assert.strictEqual(cfg.model, 'glm-4-flash');
    assert.strictEqual(normalizeAiConfig(null).apiKey, '');
    assert.strictEqual(aiConfigReady(cfg), true);
    assert.strictEqual(aiConfigReady({ ...cfg, apiKey: '' }), false);
});

// ---------- chat 客户端(假 fetch) ----------
function fakeFetch(response) {
    const calls = [];
    const fn = async (url, init) => {
        calls.push({ url, init });
        if (typeof response === 'function') return response(url, init);
        return response;
    };
    fn.calls = calls;
    return fn;
}
const okResp = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '题目：测试题\nA：甲\nB：乙\n答案：A' } }] }) });
const CFG = { providerId: 'zhipu', apiKey: 'k-test', baseUrl: 'https://api.example/v4', model: 'glm-4-flash' };

test('chatCompletion:POST baseUrl+/chat/completions,Bearer 头,非流式,返回 content', async () => {
    const f = fakeFetch(okResp());
    const content = await chatCompletion(CFG, [{ role: 'user', content: 'hi' }], { fetchImpl: f, timeoutMs: 0 });
    assert.match(content, /题目：测试题/);
    const { url, init } = f.calls[0];
    assert.strictEqual(url, 'https://api.example/v4/chat/completions');
    assert.strictEqual(init.method, 'POST');
    assert.strictEqual(init.headers.Authorization, 'Bearer k-test');
    const body = JSON.parse(init.body);
    assert.strictEqual(body.model, 'glm-4-flash');
    assert.strictEqual(body.stream, false);
});

test('chatCompletion:HTTP 错误带状态码;网络异常归类为网络/CORS;配置缺失快速失败', async () => {
    const f = fakeFetch({ ok: false, status: 401, text: async () => 'bad key' });
    await assert.rejects(() => chatCompletion(CFG, [], { fetchImpl: f, timeoutMs: 0 }), /401/);
    const f2 = fakeFetch(async () => { throw new Error('ECONNREFUSED'); });
    await assert.rejects(() => chatCompletion(CFG, [], { fetchImpl: f2, timeoutMs: 0 }), /网络\/CORS/);
    await assert.rejects(() => chatCompletion({ ...CFG, apiKey: '' }, [], { fetchImpl: f, timeoutMs: 0 }), /API Key/);
});

test('testConnection:连通返回 sample', async () => {
    const f = fakeFetch({ ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) });
    const r = await testConnection(CFG, { fetchImpl: f });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.sample, 'OK');
});

test('chatCompletion:传入 signal 时原样透传给 fetch(取消能力)', async () => {
    const f = fakeFetch(okResp());
    const ctrl = new AbortController();
    await chatCompletion(CFG, [{ role: 'user', content: 'x' }], { fetchImpl: f, signal: ctrl.signal, timeoutMs: 0 });
    assert.strictEqual(f.calls[0].init.signal, ctrl.signal);
});

// ---------- 分块 ----------
test('splitIntoChunks:按空行分段累积,不超 maxChars,内容零丢失零重排', () => {
    const blocks = [];
    for (let i = 1; i <= 30; i++) blocks.push(`1、第${i}题题干\nA：甲 B：乙 C：丙 D：丁 答案：A`);
    const material = blocks.join('\n\n');
    const chunks = splitIntoChunks(material, { maxChars: 300 });
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every(c => c.length <= 300));
    assert.strictEqual(chunks.join('\n\n').replace(/\n{2,}/g, '\n\n'), material.replace(/\n{2,}/g, '\n\n'));
});

test('splitIntoChunks:超长单段按行硬切;空材料为空', () => {
    const long = Array.from({ length: 20 }, (_, i) => '第' + i + '行这是一条很长很长的题目内容用来撑爆单块限制').join('\n');
    const chunks = splitIntoChunks(long, { maxChars: 120 });
    assert.ok(chunks.length > 1);
    assert.strictEqual(chunks.join('\n'), long);
    assert.deepStrictEqual(splitIntoChunks(''), []);
});

// ---------- 编排(整篇原文 → 整理文本,救援区 B 路线用) ----------
test('aiFormatMaterial:官方提示词作 system,逐块带进度,结果按块拼回', async () => {
    const f = fakeFetch((url, init) => {
        const body = JSON.parse(init.body);
        assert.strictEqual(body.messages[0].role, 'system');
        assert.ok(body.messages[0].content.includes('题库格式整理助手'));
        return { ok: true, json: async () => ({ choices: [{ message: { content: '题目：' + body.messages[1].content.slice(0, 10) + ' 答案：A' } }] }) };
    });
    const progress = [];
    const material = Array.from({ length: 8 }, (_, i) => `1、题干${i} A：甲 B：乙 答案：A`).join('\n\n');
    const r = await aiFormatMaterial(CFG, material, { fetchImpl: f, maxChars: 120, timeoutMs: 0, onProgress: (d, t) => progress.push(d + '/' + t) });
    assert.ok(r.chunks >= 2);
    assert.strictEqual(progress[progress.length - 1], r.chunks + '/' + r.chunks);
    assert.ok(r.text.includes('题目：'));
});

test('aiFormatMaterial:空材料快速失败', async () => {
    await assert.rejects(() => aiFormatMaterial(CFG, '   ', { fetchImpl: fakeFetch(okResp()), timeoutMs: 0 }), /没有可整理的内容/);
});

// ---------- 按题修复(预览页 AI 兜底用) ----------
test('aiFixQuestions 基元:序列化/分块上限/进度按题数', async () => {
    const q = { content: '题?', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '因为' };
    assert.ok(serializeQuestion(q).includes('题目：题?'));
    assert.ok(serializeQuestion(q).includes('解析：因为'));
    const many = Array.from({ length: 25 }, (_, i) => ({ content: '第' + i + '题很长很长很长很长', options: { A: '甲', B: '乙' }, answer: 'A' }));
    const chunks = groupQuestionChunks(many);
    assert.ok(chunks.length >= 3);
    assert.strictEqual(chunks.reduce((a, c) => a + c.count, 0), 25);
    assert.ok(chunks.every(c => c.count <= 10));
    let last = null;
    const r = await aiFixQuestions(CFG, many.slice(0, 12), { fetchImpl: fakeFetch(okResp()), timeoutMs: 0, onProgress: (d, t) => { last = d + '/' + t; } });
    assert.strictEqual(r.total, 12);
    assert.strictEqual(last, '12/12');
    assert.ok(r.questions.length >= 1);
});

// ---------- 存储层(全局 localStorage 桩) ----------
test('AI 配置与埋点:roundtrip、损坏兜底、埋点上限 50', () => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
    };
    try {
        assert.deepStrictEqual(loadAiConfig(), {});
        saveAiConfig(CFG);
        assert.deepStrictEqual(loadAiConfig(), CFG);
        store.set('aiConfig', '{broken');
        assert.deepStrictEqual(loadAiConfig(), {});
        for (let i = 0; i < 55; i++) recordAiUsage({ trigger: 'preview-fix', chunks: 1, aiQuestions: i });
        const usage = loadAiUsage();
        assert.strictEqual(usage.length, 50);
        assert.strictEqual(usage[49].aiQuestions, 54);
    } finally {
        delete globalThis.localStorage;
    }
});

// ---------- buildAiNotes(改动对比) ----------
test('buildAiNotes:改动逐项写明;未变不标;题干同选项变可宽松匹配', () => {
    const orig = { content: '天空是什么颜色?', options: { A: '红', B: '绿', C: '蓝' }, type: '单选', answer: '' };
    const [noteSame] = buildAiNotes([JSON.parse(JSON.stringify(orig))], [{ ...orig, answer: 'C' }]);
    assert.strictEqual(noteSame, 'AI 修改：补入答案 C');
    const tweaked = { content: '天空是什么颜色?', options: { A: '红', B: '绿', C: '蓝色' }, type: '单选', answer: 'C' };
    const [noteTweak] = buildAiNotes([JSON.parse(JSON.stringify(orig))], [tweaked]);
    assert.ok(noteTweak.includes('选项调整'));
    const identical = { content: '天空是什么颜色?', options: { A: '红', B: '绿', C: '蓝' }, type: '单选', answer: 'C' };
    const [noteNone] = buildAiNotes([{ ...identical }], [JSON.parse(JSON.stringify(identical))]);
    assert.strictEqual(noteNone, '');
});

// ---------- vm 沙箱集成 ----------
const AI_TEXT = `题目：1+1等于几?
A：1
B：2
C：3
D：4
答案：B

题目：天空是什么颜色?
A：红
B：绿
C：蓝
答案：C`;

test('previewAiFallback(勾选语义):未勾选题不进请求;内容没变不打徽章', async () => {
    const calls = [];
    const { run, store } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            fetch: async (url, init) => {
                calls.push(JSON.parse(init.body).messages[1].content);
                return { ok: true, json: async () => ({ choices: [{ message: { content: AI_TEXT } }] }) };
            },
            AbortController,
        },
    }));
    store.set('aiConfig', JSON.stringify(CFG));
    run(`Q3 = ['1. 1+1等于几? A.1 B.2 C.3 D.4 答案：B', '2. 天空是什么颜色? A.红 B.绿 C.蓝 答案：C', '3. AI 漏掉的题 A.甲 B.乙 答案：A']`);
    run(`init()`);
    run(`openImportPreview(parseQuestionsText(Q3.join(String.fromCharCode(10))))`);
    assert.strictEqual(run(`previewData.length`), 3);
    run(`previewData[2].include = false; renderPreview()`);
    await run(`(async () => { await previewAiFallback(); })()`);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].includes('1+1等于几'), '勾选题要进请求');
    assert.ok(!calls[0].includes('AI 漏掉的题'), '未勾选题不进请求');
    assert.strictEqual(run(`previewData[2].q.content`), 'AI 漏掉的题');
    assert.strictEqual(run(`previewData[2].aiNote`), '');
});

test('previewAiFallback:改动写明差异;AI 未返回的题标注保留原样(不无声消失)', async () => {
    const { run, store } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '题目：1+1等于几?\nA：1\nB：二\nC：3\nD：4\n答案：B' } }] }) }),
            AbortController,
        },
    }));
    store.set('aiConfig', JSON.stringify(CFG));
    run(`Q2 = ['1. 1+1等于几? A.1 B.2 C.3 D.4 答案：B', '2. 被漏掉的题 A.甲 B.乙 答案：A']`);
    run(`init()`);
    run(`openImportPreview(parseQuestionsText(Q2.join(String.fromCharCode(10))))`);
    await run(`(async () => { await previewAiFallback(); })()`);
    assert.ok(String(run(`previewData[0].aiNote`)).includes('选项调整'), '改动要写明');
    assert.ok(String(run(`previewData[1].aiNote`)).includes('AI 未返回'), '漏答题要有说明');
    assert.strictEqual(run(`previewData[1].q.content`), '被漏掉的题');
});

test('previewAiFallback:0 勾选 → 引导提示,不发请求', async () => {
    let fetched = 0;
    const { run } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: { fetch: async () => { fetched++; return { ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) }; }, AbortController },
    }));
    run(`init()`);
    run(`openImportPreview(parseQuestionsText('1. 题 A.甲 B.乙 答案：A'))`);
    run(`previewData[0].include = false; renderPreview()`);
    await run(`(async () => { await previewAiFallback(); })()`);
    assert.strictEqual(fetched, 0);
});

test('设置面板回归:测试连接点击后状态可见且成功(锁死静默故障)', async () => {
    const { run, store, elements } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) }) },
    }));
    store.set('aiConfig', JSON.stringify(CFG));
    run(`init()`);
    run(`openAiSettings()`);
    const btn = elements['ai-test-btn'];
    assert.ok(btn._listeners.click, '测试连接按钮必须已绑定 click');
    await btn._listeners.click();
    const st = elements['ai-test-status'];
    assert.ok(st.textContent.includes('连接成功'));
    assert.ok(st.className.includes('success'));
});

test('AI 已连接徽章:测试成功后 ✓;配置变更未复测则熄灭', async () => {
    const { run, store, elements } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: { fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) }) },
    }));
    store.set('aiConfig', JSON.stringify(CFG));
    run(`init()`);
    const btn = elements['ai-settings-btn'];
    assert.strictEqual(btn.textContent, '⚙ AI 设置');
    run(`openAiSettings()`);
    await elements['ai-test-btn']._listeners.click();
    assert.strictEqual(btn.textContent, '⚙ AI 已连接 ✓');
    run(`aiModelInput.value = 'glm-4-plus'`);
    run(`saveAiSettings()`);
    assert.strictEqual(btn.textContent, '⚙ AI 设置');
});

test('救援区 B 路线:AI 接口整理 → 结果入输入框 → 解析后逐题带 AI 生成标记;手动编辑即失效', async () => {
    const { run, store, elements } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: AI_TEXT } }] }) }),
            AbortController,
        },
    }));
    store.set('aiConfig', JSON.stringify(CFG));
    run(`init()`);
    run(`pasteInput.value = '一坨乱原文'`);
    await run(`(async () => { await rescueAiOrganize(); })()`);
    assert.ok(String(run(`pasteInput.value`)).includes('1+1等于几'), '输入框应为 AI 整理结果');
    run(`parsePastedText()`);
    assert.strictEqual(run(`previewData.length`), 2);
    assert.strictEqual(run(`previewData[0].aiNote`), 'AI 生成');
    run(`pasteInput.value = '1. 手写题 A.甲 B.乙 答案：A'`);
    elements['paste-input']._listeners.input();
    run(`parsePastedText()`);
    assert.strictEqual(run(`previewData[0].aiNote`), '');
});

test('统一导入管道回归:PDF 选择 → 双选项提示(AI 提取按钮+隐私说明);.doc 双路不混;委托可用', async () => {
    const { run, elements, alerts } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp());
    run(`init()`);
    run(`fileInput.files = [{ name: '试卷.pdf' }]`);
    run(`handleFileSelect({ target: { files: [{ name: '试卷.pdf' }] } })`);
    const notice = elements['import-status'];
    assert.ok(String(notice.innerHTML).includes('file-ai-copy-btn'), 'PDF 提示要有 AI 提取按钮');
    assert.ok(String(notice.innerHTML).includes('上传给该 AI 服务'), '要有隐私提示');
    assert.ok(String(notice.innerHTML).includes('附到对话里'), 'AI 路径要写明附文件步骤');
    run(`handleFileSelect({ target: { files: [{ name: '试卷.doc' }] } })`);
    const docNotice = String(notice.innerHTML);
    assert.ok(!docNotice.includes('file-ai-copy-btn'), '.doc 不应出现 AI 提取按钮');
    assert.ok(docNotice.includes('另存为') && docNotice.includes('.docx'), '① 必须是转格式');
    assert.ok(docNotice.includes('选中文字复制'), '② 必须是复制文字');
    run(`lastRawContent = '旧的残留原文'`);
    notice._listeners.click({ target: { id: 'file-ai-copy-btn' } });
    await new Promise(r => setTimeout(r, 0));
    assert.ok(String(elements['import-status'].textContent).length > 0, '点击后必须有状态反馈');
    run(`pasteInput.value = ''`);
    run(`parsePastedText()`);
    assert.ok(alerts.length === 0);
});

test('预览全选三态:未全勾→点一次全勾;再点→全不选;部分选中→indeterminate', async () => {
    const { run, elements } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp());
    run(`init()`);
    run(`Q3b = ['1. 甲题 A.一 B.二 答案：A', '2. 乙题 A.一 B.二 答案：B', '3. 丙题(缺答案)']`);
    run(`openImportPreview(parseQuestionsText(Q3b.join(String.fromCharCode(10))))`);
    const all = elements['preview-select-all'];
    assert.strictEqual(run(`previewData.filter(i => i.include).length`), 2);
    assert.strictEqual(all.indeterminate, true);
    assert.strictEqual(all.checked, false);
    all._listeners.change();
    assert.strictEqual(run(`previewData.every(i => i.include)`), true);
    assert.strictEqual(all.checked, true);
    assert.strictEqual(all.indeterminate, false);
    all._listeners.change();
    assert.strictEqual(run(`previewData.some(i => i.include)`), false);
    assert.strictEqual(all.checked, false);
    run(`previewData[0].include = true; renderPreview()`);
    assert.strictEqual(all.indeterminate, true);
});

test('导入按钮职责分离回归:选文件即读进框;解析按钮单监听纯解析;清空复位一切', async () => {
    const { run, elements, alerts } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            // 同步版 FileReader:构造即回调 onload
            FileReader: class { readAsText(f) { this.result = '1. 试卷题 A.甲 B.乙 答案：A'; this.onload({ target: { result: this.result } }); } },
        },
    }));
    run(`init()`);
    run(`handleFileSelect({ target: { files: [{ name: '期试卷.txt' }] } })`);
    // 选完即读:文字应已在输入框,来源标签待用
    assert.ok(String(run(`pasteInput.value`)).includes('试卷题'), '选文件后文字应立即进输入框');
    assert.strictEqual(run(`previewData.length`), 0, '读取本身不触发预览');
    // 点解析(按钮监听=parsePastedText) → 出预览
    elements['paste-parse-btn']._listeners.click();
    assert.strictEqual(run(`previewData.length`), 1);
    // 解析按钮:确认只挂了一个监听且指向解析
    const parseBtn = elements['paste-parse-btn'];
    const listeners = parseBtn._listeners ? Object.keys(parseBtn._listeners) : [];
    assert.strictEqual(listeners.filter(k => k === 'click').length, 1, '解析按钮只允许一个 click 监听');
    // 清空:复位输入框与 AI 标记
    run(`pasteInput.value = '有内容'; aiSourcedContent = true`);
    run(`clearPasteInput()`);
    assert.strictEqual(run(`pasteInput.value`), '');
    assert.strictEqual(String(elements['import-status'].className), 'status-line');
    assert.ok(alerts.length === 0);
});

test('AI 标记持久化:确认导入后 aiSource=ai 写进题库数据(编辑器可见的前提)', async () => {
    const { run, store } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: AI_TEXT } }] }) }),
            AbortController,
        },
    }));
    store.set('aiConfig', JSON.stringify(CFG));
    run(`init()`);
    run(`pasteInput.value = '一坨乱原文'`);
    await run(`(async () => { await rescueAiOrganize(); })()`);
    run(`parsePastedText()`);
    run(`previewTargetBankSelect.value = '__new__'`);
    run(`previewConfirmBtn__fake = true`);
    run(`prompt = () => 'AI测试库'`);
    run(`commitPreviewImport()`);
    assert.strictEqual(run(`questionBanks['AI测试库'][0].aiSource`), 'ai');
    // 对照:非 AI 路径导入的题不带标记
    run(`openImportPreview(parseQuestionsText('1. 普通题 A.甲 B.乙 答案：A'))`);
    run(`previewTargetBankSelect.value = 'AI测试库'`);
    run(`commitPreviewImport()`);
    assert.strictEqual(run(`questionBanks['AI测试库'].some(q => q.content === '普通题' && q.aiSource)`), false);
});

test('编辑器:AI 题人工保存后消标;待修题说明行随状态切换', async () => {
    const { run, store, elements } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: AI_TEXT } }] }) }),
            AbortController,
        },
    }));
    store.set('aiConfig', JSON.stringify(CFG));
    run(`init()`);
    run(`pasteInput.value = '一坨乱原文'`);
    await run(`(async () => { await rescueAiOrganize(); })()`);
    run(`parsePastedText()`);
    run(`prompt = () => 'AI测试库'`);
    run(`previewTargetBankSelect.value = '__new__'`);
    run(`commitPreviewImport()`);
    run(`editBank('AI测试库')`);
    assert.strictEqual(run(`questionBanks['AI测试库'][0].aiSource`), 'ai');
    // 人工保存 → aiSource 消除
    run(`editorStem.value = '人工改过的题'; editorType.value = '判断'; editorAnswer.value = 'A'`);
    run(`editorSaveCurrent(true)`);
    assert.strictEqual(run(`questionBanks['AI测试库'][0].aiSource`), undefined);
    // 待修题(导入一题缺答案) → 说明行走橙字分支
    run(`openImportPreview(parseQuestionsText('1. 缺答案的题 A.甲 B.乙'))`);
    run(`previewTargetBankSelect.value = 'AI测试库'`);
    run(`commitPreviewImport()`);
    run(`editBank('AI测试库')`);
    run(`state.editIndex = 1; renderBankEditor()`);
    const note = String(elements['editor-ai-note'].textContent);
    assert.ok(note.includes('缺答案'), '待修题要有橙色说明');
});
