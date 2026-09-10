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

test('暗色模式:三档切换打 data-theme、持久化、auto 跟随系统', async () => {
    const { run, store } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            document: { documentElement: { dataset: {} } },  // 沙箱补 html 元素
            matchMedia: () => ({ matches: true, addEventListener() {} }),  // 系统暗色
        },
    }));
    run(`init()`);
    // auto + 系统暗 → dark
    assert.strictEqual(run(`document.documentElement.dataset.theme`), 'dark');
    // 手动选亮 → light 且持久
    run(`setThemeSetting('light')`);
    assert.strictEqual(run(`document.documentElement.dataset.theme`), 'light');
    assert.strictEqual(store.get('themeSetting'), 'light');
    // 手动选暗
    run(`setThemeSetting('dark')`);
    assert.strictEqual(run(`document.documentElement.dataset.theme`), 'dark');
    // 回 auto → 跟随系统(暗)
    run(`setThemeSetting('auto')`);
    assert.strictEqual(run(`document.documentElement.dataset.theme`), 'dark');
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
    run(`previewData[0].include = true; renderPreview()`);
    run(`previewTargetBankSelect.value = 'AI测试库'`);
    run(`commitPreviewImport()`);
    run(`editBank('AI测试库')`);
    run(`state.editIndex = 2; renderBankEditor()`);
    const note = String(elements['editor-ai-note'].innerHTML);
    assert.ok(note.includes('缺答案'), '待修题要有橙色说明');
});

test('历史标记日志:AI 题人工保存后转"曾AI整理";待补题补答后转"曾待补";仅 × 删除', async () => {
    let noAns = false;  // 宿主侧开关:第二次 AI 调用返回无答案输出
    const h = await import('./helpers/vm-harness.mjs').then(m => m.loadApp({
        sandboxExtras: {
            fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: noAns ? '题目：AI整理但仍无答案\nA：甲\nB：乙' : AI_TEXT } }] }) }),
            AbortController,
        },
    }));
    const { run, store, elements } = h;
    store.set('aiConfig', JSON.stringify(CFG));
    run(`init()`);
    run(`pasteInput.value = '一坨乱原文'`);
    await run(`(async () => { await rescueAiOrganize(); })()`);
    run(`parsePastedText()`);
    run(`previewTargetBankSelect.value = '__new__'`);
    run(`prompt = () => '史库'`);
    run(`commitPreviewImport()`);
    // 补一题缺答案进来,人工补答 → pending 历史
    run(`openImportPreview(parseQuestionsText('1. 待补的题 A.甲 B.乙'))`);
    run(`previewData[0].include = true; renderPreview()`);
    run(`previewTargetBankSelect.value = '史库'`);
    run(`commitPreviewImport()`);
    run(`editBank('史库')`);
    run(`state.editIndex = 2; renderBankEditor()`);
    // 人工补答保存 → 待补标记消散 → 转历史
    run(`editorStem.value = '待补的题'; editorType.value = '判断'; editorAnswer.value = 'A'`);
    run(`editorSaveCurrent(true)`);
    assert.strictEqual(run(`questionBanks['史库'][2].answer`), 'A');
    const marks = h.run(`JSON.stringify(questionBanks['史库'][2].histMarks || [])`);
    assert.ok(marks.includes('pending'), '消散的待补要进历史日志');
    assert.ok(String(elements['editor-hist-row'].innerHTML).includes('曾待补'), '出现"曾待补"chip');
    assert.ok(String(elements['editor-hist-row'].innerHTML).includes('data-hist-del'), 'chip 带 × 删除');
    // 双状态并存:AI 整理但仍缺答案 → 紫橙两行同时显示(第二次 B 路线,输出故意无答案行)
    noAns = true;
    run(`pasteInput.value = '再来一坨乱原文'`);
    await run(`(async () => { await rescueAiOrganize(); })()`);
    run(`parsePastedText()`);
    run(`previewData[0].include = true; renderPreview()`);
    run(`previewTargetBankSelect.value = '史库'`);
    run(`commitPreviewImport()`);
    run(`editBank('史库')`);
    run(`state.editIndex = 3; renderBankEditor()`);
    const both = String(elements['editor-ai-note'].innerHTML);
    assert.ok(both.includes('AI 整理导入') && both.includes('缺答案'), '双状态要两行提示都显示');
    // AI 题人工保存 → ai 标记消散转历史
    run(`state.editIndex = 0; renderBankEditor()`);
    run(`editorType.value = '判断'; editorAnswer.value = 'A'`);
    run(`editorSaveCurrent(true)`);
    const marks0 = h.run(`JSON.stringify(questionBanks['史库'][0].histMarks || [])`);
    assert.ok(marks0.includes('"ai"'), '消散的 AI 标记要进历史日志');
    assert.ok(String(elements['editor-hist-row'].innerHTML).includes('曾 AI 整理'), '出现"曾 AI 整理"chip');
    // × 删除对应条目
    h.elements['editor-hist-row']._listeners.click({ target: { dataset: { histDel: '0' }, id: 'x' } });
    const after = h.run(`JSON.stringify(questionBanks['史库'][0].histMarks || [])`);
    assert.ok(!after.includes('"ai"'), '× 删除对应历史条目');
});


test('错题本收藏:☆ 收藏入收藏夹并变 ★,再点取消;与刷题页收藏互通(按题干匹配)', async () => {
    const { run, elements } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp());
    run(`init()`);
    // 制造一道错题:先导入题库,再走一次答题判错
    run(`questionBanks['错题源'] = [{ content: '易错题一', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', explanation: '' }, { content: '易错题二', type: '单选', options: { A: '甲', B: '乙' }, answer: 'B', explanation: '' }]`);
    run(`currentBankName = '错题源'; questionBank = questionBanks['错题源']`);
    run(`addToErrorBook({ content: '易错题一', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A' }, 'B')`);
    run(`showSection('errors')`);
    run(`updateErrorsList()`);
    run(`state.expandedBanks['错题源'] = true`);
    // 收藏切换:错题项按钮与刷题页调用同一 toggleFavorite(按题干匹配),数据面互通
    run(`toggleFavorite(questionBanks['错题源'][0], '错题源')`);
    assert.strictEqual(run(`favoriteQuestions.length`), 1);
    assert.strictEqual(run(`favoriteQuestions[0].content`), '易错题一');
    // 错题项按钮渲染的 ★/☆ 文案由 updateErrorsList 按 isFav 生成(与 delete 按钮同一渲染路径)
    // 再点同一题收藏 → 取消
    run(`toggleFavorite(questionBanks['错题源'][0], '错题源')`);
    assert.strictEqual(run(`favoriteQuestions.length`), 0);
});

test('按库内嵌(P0-1.9):错题/收藏按 bankName 归入库卡手风琴;杂项兜底;遮挡默认藏答案', async () => {
    const { run, elements } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp());
    run(`init()`);
    run(`questionBanks['史库'] = [{ content: '库内题', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A' }]`);
    run(`errorQuestions = [
        { content: '史库错题', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', userAnswer: 'B', bankName: '史库', analysis: '因为甲' },
        { content: '孤儿错题', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', userAnswer: 'B', bankName: '已删除的库' },
    ]`);
    run(`favoriteQuestions = [{ content: '史库收藏', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', bankName: '史库' }]`);
    run(`updateBanksList()`);
    // 遮挡:错题条目里没有直接的"正确答案"文字(details 内不算外层文本)
    const frag = run(`renderErrorsForBank('史库')`);
    assert.ok(frag, '史库有错题面板');
    // 遮挡:错题条目存在 details/summary("查看答案"),且渲染树顶层不含正确答案文字
    const created = run(`__created`);
    const summary = created.filter(c => c.tag === 'SUMMARY' && String(c.el.textContent).includes('查看答案'));
    assert.ok(summary.length >= 1, '遮挡由 details/summary 承载');
    // 杂项兜底
    run(`updateBanksList()`);
    const created2 = run(`__created`);
    assert.ok(created2.some(c => c.tag === 'H3' && String(c.el.textContent).includes('杂项')), '孤儿错题归入杂项卡');
});

test('重命名题库同步错题/收藏归属(不漂进杂项)', async () => {
    const { run } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp());
    run(`init()`);
    run(`questionBanks['旧名'] = [{ content: '题', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A' }]`);
    run(`errorQuestions = [{ content: '题', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', userAnswer: 'B', bankName: '旧名' }]`);
    run(`favoriteQuestions = [{ content: '题', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A', bankName: '旧名' }]`);
    run(`state.currentRenameBank = '旧名'`);
    run(`renameBankNameInput.value = '新名'`);
    run(`renameBank()`);
    assert.strictEqual(run(`errorQuestions[0].bankName`), '新名');
    assert.strictEqual(run(`favoriteQuestions[0].bankName`), '新名');
    assert.strictEqual(run(`!!questionBanks['新名']`), true);
});

test('回收站:删库打包题+错+藏;恢复完整(同名自动改名);彻底删除;LRU 上限 10', async () => {
    const { run, store } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp());
    run(`init()`);
    run(`questionBanks['要删的库'] = [{ content: '题1', type: '单选', options: { A: '甲', B: '乙' }, answer: 'A' }]`);
    run(`errorQuestions = [{ content: '错1', type: '单选', options: {}, answer: 'A', userAnswer: 'B', bankName: '要删的库' }]`);
    run(`favoriteQuestions = [{ content: '藏1', type: '单选', options: {}, answer: 'A', bankName: '要删的库' }]`);
    run(`state.currentBankName = '要删的库'; questionBank = questionBanks['要删的库']`);
    run(`confirm = () => true`);
    run(`deleteBank('要删的库')`);
    assert.strictEqual(run(`!!questionBanks['要删的库']`), false);
    const bin = JSON.parse(store.get('recycledBanks'));
    assert.ok(bin['要删的库'], '入站');
    assert.strictEqual(bin['要删的库'].errors.length, 1);
    assert.strictEqual(bin['要删的库'].favorites.length, 1);
    assert.strictEqual(run(`errorQuestions.length`), 0);
    // 恢复:无同名 → 原名回归,错/藏合并回
    run(`restoreRecycled('要删的库')`);
    assert.strictEqual(run(`!!questionBanks['要删的库']`), true);
    assert.strictEqual(run(`errorQuestions[0].bankName`), '要删的库');
    assert.strictEqual(run(`favoriteQuestions.length`), 1);
    // 再次删除后,若同名库已重建 → 恢复自动改名避免覆盖
    run(`deleteBank('要删的库')`);
    run(`questionBanks['要删的库'] = []`);
    run(`restoreRecycled('要删的库')`);
    assert.strictEqual(run(`!!questionBanks['要删的库·恢复']`), true);
    // LRU:塞 11 条,最旧被淘汰
    for (let i = 0; i < 11; i++) run(`recycleBankEntry('库${i}', { bank: [] })`);
    const bin2 = JSON.parse(store.get('recycledBanks'));
    assert.ok(Object.keys(bin2).length <= 10, '上限 10 条');
});
