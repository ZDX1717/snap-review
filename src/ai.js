// ==================== AI 客户端(0.9.0 · AI 导入) ====================
// 职责:OpenAI 兼容 chat/completions 客户端 + 厂商预设 + 材料分块 + AI 兜底编排。
// 允许依赖:prompt.js(官方提示词)。禁止:state / storage / DOM(全部经参数注入,vm 测试可跑)。
// CORS 已实测(2026-09-09):智谱/DeepSeek 回显 Origin 放行,硅基流动 `*` —— 浏览器可直连。

import { OFFICIAL_PROMPT } from './prompt.js';
import { normalizeAnswerString, parseQuestionsText } from './parser.js';

// 厂商预设:按成本排序;baseUrl 均为 OpenAI 兼容根(不含 /chat/completions)
export const AI_PROVIDERS = [
    { id: 'zhipu', name: '智谱 GLM-4-Flash（免费）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'siliconflow', name: '硅基流动（免费档）', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
];

export function getProvider(id) {
    return AI_PROVIDERS.find(p => p.id === id) || AI_PROVIDERS[0];
}

// 配置兜底:缺字段时按厂商预设补齐(apiKey 永不默认)
export function normalizeAiConfig(cfg) {
    const c = (cfg && typeof cfg === 'object') ? cfg : {};
    const provider = getProvider(c.providerId);
    return {
        providerId: provider.id,
        baseUrl: (c.baseUrl || provider.baseUrl || '').trim().replace(/\/+$/, ''),
        apiKey: (c.apiKey || '').trim(),
        model: (c.model || provider.model || '').trim(),
    };
}

export function aiConfigReady(cfg) {
    const c = normalizeAiConfig(cfg);
    return !!(c.baseUrl && c.apiKey && c.model);
}

// 接口地址安全校验(2026-09-11 加,安全审计 §4.3)。
// 背景:请求会带 `Authorization: Bearer <你的 API Key>` 发往这个地址 ——
// **填谁就等于把 Key 交给谁**。若从他人处抄来一份含"自定义 baseUrl"的配置,
// Key 就会被发到对方服务器。故:
//   ① 拒绝明文 http(Key 会明文过网);
//   ② 放行 https,以及本机回环地址( http://localhost / 127.0.0.1 / ::1 —— 本地调试与自建代理要用);
//   ③ 拒绝非 http(s) 协议(防止 file://、data: 之类被当成接口地址)。
// 返回 null = 通过;否则返回可直接展示给用户的原因。
export function aiBaseUrlProblem(baseUrl) {
    const raw = (baseUrl || '').trim();
    if (!raw) return '接口地址不能为空';
    let u;
    try {
        u = new URL(raw);
    } catch (e) {
        return '接口地址格式不对(需要完整网址,如 https://api.example.com/v1)';
    }
    if (u.protocol === 'https:') return null;
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (u.protocol === 'http:' && isLoopback) return null;   // 本机调试放行
    if (u.protocol === 'http:') return '明文 http 会让 API Key 在网络上裸奔,请改用 https://';
    return `不支持的协议 ${u.protocol}(只能用 https,或本机 http)`;
}

// OpenAI 兼容 chat 调用(非流式)。fetchImpl 可注入(测试);timeoutMs 仅在支持 AbortController 的环境生效。
export async function chatCompletion(config, messages, { signal, timeoutMs = 60000, fetchImpl } = {}) {
    const cfg = normalizeAiConfig(config);
    if (!cfg.baseUrl || !cfg.model) throw new Error('AI 配置不完整:请先在「AI 设置」里填好接口地址与模型');
    if (!cfg.apiKey) throw new Error('AI 配置不完整:缺少 API Key');
    // 🔒 出口守卫:地址不安全就**绝不发起请求** —— 否则 Key 已经发出去了,再提示也晚了。
    // (表单侧也有同样的校验;这里是"就算配置从别处来也拦得住"的第二道)
    const problem = aiBaseUrlProblem(cfg.baseUrl);
    if (problem) throw new Error('接口地址不安全:' + problem);
    const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) throw new Error('当前环境不支持网络请求');

    let ctrl = null;
    let sig = signal;
    if (!sig && timeoutMs > 0 && typeof AbortController !== 'undefined') {
        ctrl = new AbortController();
        sig = ctrl.signal;
        setTimeout(() => ctrl.abort(), timeoutMs); // vm 沙箱 setTimeout 是空桩,无害
    }

    let resp;
    try {
        resp = await f(cfg.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
            body: JSON.stringify({ model: cfg.model, messages, stream: false }),
            signal: sig,
        });
    } catch (e) {
        if (e && e.name === 'AbortError') throw new Error('AI 请求已取消');
        throw new Error('AI 请求失败(网络/CORS):' + (e && e.message ? e.message : e));
    }
    if (!resp.ok) {
        let detail = '';
        try { detail = (await resp.text()).slice(0, 200); } catch (e) { /* 忽略 */ }
        throw new Error(`AI 接口返回 ${resp.status}${detail ? ':' + detail : ''}`);
    }
    const data = await resp.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string') throw new Error('AI 返回格式异常:缺少 choices[0].message.content');
    return content;
}

// 连接测试:发一句极短消息,2xx 且有 content 即通
export async function testConnection(config, opts = {}) {
    const content = await chatCompletion(config, [{ role: 'user', content: '请回复:OK' }], { timeoutMs: 15000, ...opts });
    return { ok: true, sample: content.trim().slice(0, 40) };
}

// 材料分块:按空行分段 → 逐段累积到 maxChars;超长单段按行累积硬切。保证原文无丢失、不重排。
export function splitIntoChunks(text, { maxChars = 2800 } = {}) {
    const src = (text || '').replace(/\r\n/g, '\n').trim();
    if (!src) return [];
    const blocks = src.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    const chunks = [];
    let cur = '';
    const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
    for (const block of blocks) {
        if (block.length > maxChars) {
            push(); // 先封前一块
            for (const line of block.split('\n')) {
                if ((cur + '\n' + line).trim().length > maxChars) push();
                cur = cur ? cur + '\n' + line : line;
            }
            push();
        } else if ((cur + '\n\n' + block).length > maxChars) {
            push();
            cur = block;
        } else {
            cur = cur ? cur + '\n\n' + block : block;
        }
    }
    push();
    return chunks;
}

// AI 兜底编排:官方提示词 + 逐块整理 → 拼回纯文本(交回 parser 走同一套规则解析)。
// onProgress(done, total);signal 支持取消;返回 { text, chunks }。
export async function aiFormatMaterial(config, material, { signal, onProgress, maxChars = 2800, timeoutMs, fetchImpl } = {}) {
    const chunks = splitIntoChunks(material, { maxChars });
    if (chunks.length === 0) throw new Error('没有可整理的内容');
    const outs = [];
    for (let i = 0; i < chunks.length; i++) {
        const content = await chatCompletion(
            config,
            [
                { role: 'system', content: OFFICIAL_PROMPT },
                { role: 'user', content: chunks[i] },
            ],
            { signal, timeoutMs, fetchImpl }
        );
        outs.push(content.trim());
        if (onProgress) onProgress(i + 1, chunks.length);
    }
    return { text: outs.join('\n\n'), chunks: chunks.length };
}

// ==================== AI 修改对比(供预览逐题标注) ====================

// AI 修改对比:找出 nu 相对 orig 变了什么(答案/选项/题型/题干),返回人类可读片段
export function aiDiffParts(orig, nu) {
    const parts = [];
    const oa = normalizeAnswerString(orig.answer || ''), na = normalizeAnswerString(nu.answer || '');
    if (oa !== na) parts.push(na ? (oa ? `答案 ${oa}→${na}` : `补入答案 ${na}`) : '答案被清空');
    const ok = Object.keys(orig.options || {}).sort(), nk = Object.keys(nu.options || {}).sort();
    const optsChanged = ok.join(',') !== nk.join(',') ||
        ok.some(k => (orig.options[k] || '').replace(/\s+/g, '') !== (nu.options[k] || '').replace(/\s+/g, ''));
    if (optsChanged) parts.push('选项调整');
    if ((orig.type || '') !== (nu.type || '')) parts.push(`题型 ${orig.type || '?'}→${nu.type || '?'}`);
    if ((orig.content || '').replace(/\s+/g, '') !== (nu.content || '').replace(/\s+/g, '')) parts.push('题干调整');
    return parts;
}

// 匹配键:题干+选项全归一(AI 换空白不影响匹配)
export function aiMatchKey(q, stemOnly) {
    const stem = (q.content || '').replace(/\s+/g, '');
    if (stemOnly) return stem;
    const opts = Object.keys(q.options || {}).sort().map(k => k + ':' + (q.options[k] || '').replace(/\s+/g, '')).join(',');
    return stem + '|' + opts;
}

// 为 AI 整理结果逐题生成标注:精确匹配 → 宽松匹配(题干) → 视为 AI 新拆出的题;没变的不标
export function buildAiNotes(originals, parsed) {
    const pool = originals.map(q => ({ q, used: false }));
    return parsed.map(nu => {
        let orig = null;
        let hit = pool.find(p => !p.used && aiMatchKey(p.q) === aiMatchKey(nu));
        if (hit) {
            orig = hit.q; hit.used = true;
        } else {
            hit = pool.find(p => !p.used && p.q && aiMatchKey(p.q, true) === aiMatchKey(nu, true));
            if (hit) { orig = hit.q; hit.used = true; }
        }
        if (!orig) return 'AI 新拆出（规则解析未发现此题）';
        const parts = aiDiffParts(orig, nu);
        return parts.length ? 'AI 修改：' + parts.join('，') : '';
    });
}

// ==================== 按题 AI 修复(预览页「AI 兜底整理」的编排) ====================

// 序列化单题为官方格式(与提示词要求的输出格式一致,让 AI 只做"改格式不改内容")
export function serializeQuestion(q) {
    const lines = ['题目：' + (q.content || '')];
    Object.keys(q.options || {}).sort().forEach(k => lines.push(k + '：' + (q.options[k] || '')));
    if (q.answer) lines.push('答案：' + q.answer);
    if (q.explanation) lines.push('解析：' + q.explanation);
    return lines.join('\n');
}

// 勾选题分块:每块 ≤ maxChars 且 ≤ 10 题;记录起始题号用于回填
export function groupQuestionChunks(questions, { maxChars = 2400, maxPerChunk = 10 } = {}) {
    const chunks = [];
    let cur = [], curLen = 0, start = 0;
    questions.forEach((q, i) => {
        const t = serializeQuestion(q);
        if (cur.length && (curLen + t.length > maxChars || cur.length >= maxPerChunk)) {
            chunks.push({ start, count: cur.length });
            cur = []; curLen = 0; start = i;
        }
        cur.push(t); curLen += t.length + 1;
    });
    if (cur.length) chunks.push({ start, count: cur.length });
    return chunks;
}

// 按题修复:逐块发官方提示词 → 结果交回 parser 解析;进度按"已整理题数"上报。
// 返回 { questions: 解析后的题, total: 送修题数 } —— 由调用方按题号匹配回填。
export async function aiFixQuestions(config, questions, { signal, onProgress, timeoutMs, fetchImpl } = {}) {
    if (!Array.isArray(questions) || questions.length === 0) throw new Error('没有要整理的题');
    const chunks = groupQuestionChunks(questions);
    const total = questions.length;
    let done = 0;
    const outs = [];
    for (const chunk of chunks) {
        const batch = questions.slice(chunk.start, chunk.start + chunk.count).map(serializeQuestion).join('\n\n');
        const content = await chatCompletion(
            config,
            [
                { role: 'system', content: OFFICIAL_PROMPT },
                { role: 'user', content: batch },
            ],
            { signal, timeoutMs, fetchImpl }
        );
        outs.push(content.trim());
        done += chunk.count;
        if (onProgress) onProgress(done, total);
    }
    const parsed = parseQuestionsText(outs.join('\n\n'));
    return { questions: parsed, total };
}
