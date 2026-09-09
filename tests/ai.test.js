// AI 模块测试(0.9.0):厂商预设/配置规范化 + chat 客户端(假 fetch) + 分块 + 编排 + 存储 + 预览兜底集成
import assert from 'node:assert';
import test from 'node:test';
import { AI_PROVIDERS, normalizeAiConfig, aiConfigReady, chatCompletion, testConnection, splitIntoChunks, aiFormatMaterial } from '../src/ai.js';
import { loadAiConfig, saveAiConfig, loadAiUsage, recordAiUsage } from '../src/storage.js';
import { buildAiNotes } from '../src/ai.js';

// ---------- 厂商预设与配置 ----------
test('厂商预设:三家直连厂商在列,CORS 实测结论不入配置', () => {
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

test('testConnection:连通返回 sample;异常上抛', async () => {
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

test('splitIntoChunks:超长单段按行硬切', () => {
    const long = Array.from({ length: 20 }, (_, i) => '第' + i + '行这是一条很长很长的题目内容用来撑爆单块限制').join('\n');
    const chunks = splitIntoChunks(long, { maxChars: 120 });
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every(c => c.length <= 120 + 40)); // 行级硬切允许略超一行
    assert.strictEqual(chunks.join('\n'), long);
    assert.deepStrictEqual(splitIntoChunks(''), []);
});

// ---------- 编排 ----------
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

        for (let i = 0; i < 55; i++) recordAiUsage({ trigger: 'preview-fallback', chunks: 1, aiQuestions: i });
        const usage = loadAiUsage();
        assert.strictEqual(usage.length, 50);
        assert.strictEqual(usage[49].aiQuestions, 54); // 保留最近
        assert.ok(usage[0].time);
    } finally {
        delete globalThis.localStorage;
    }
});

// ---------- 预览兜底集成(vm 沙箱,假 fetch) ----------
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

test('previewAiFallback:AI 文本替换预览列表并走同一防呆;埋点记录;缺配置引导打开设置', async () => {
    const { run, store, alerts } = await import('./helpers/vm-harness.mjs').then(h => h.loadApp({
        sandboxExtras: {
            fetch: async (url, init) => ({ ok: true, json: async () => ({ choices: [{ message: { content: AI_TEXT } }] }) }),
            AbortController,
        },
    }));
    // 场景 1:缺配置 → 提示并打开设置,不动预览
    run(`pasteInput.value = '有原文但没配置'`);
    run(`previewAiFallback()`);
    await new Promise(r => setTimeout(r, 0));
    assert.ok(alerts.some(m => m.includes('AI 设置')));
    assert.strictEqual(run(`previewData.length`), 0);

    // 场景 2:配置就绪 + 有原文 → 整理结果替换预览,低置信防呆默认不勾(此批无警告,应全勾)
    store.set('aiConfig', JSON.stringify(CFG));
    run(`pasteInput.value = '乱七八糟的原文一坨\\n\\n再来一坨'`);
    await run(`(async () => { await previewAiFallback(); })()`);
    assert.strictEqual(run(`previewData.length`), 2);
    assert.strictEqual(run(`previewData[0].q.content`), '1+1等于几?');
    assert.strictEqual(run(`previewData[0].include`), true);
    assert.strictEqual(run(`previewData[1].q.answer`), 'C');
    // AI 改动标注:原文预览为空 → 全部视为 AI 新拆出
    assert.ok(String(run(`previewData[0].aiNote`)).includes('AI 新拆出'));
    const usage = JSON.parse(store.get('aiUsage'));
    assert.strictEqual(usage.length, 1);
    assert.strictEqual(usage[0].trigger, 'preview-fallback');
    assert.strictEqual(usage[0].aiQuestions, 2);
});

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
