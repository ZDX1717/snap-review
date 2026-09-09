// ==================== 官方 AI 提示词(解析失败的自救通道) ====================
// 职责:官方提示词常量 + 触发判定 + 剪贴板复制。允许依赖:无(降级复制用 DOM)。禁止:state / parser。
// 设计与对齐校验:reports/官方AI提示词设计.md

export const OFFICIAL_PROMPT = `你是一个题库格式整理助手。把用户发给你的原始题目材料,逐题整理成下面的纯文本格式。除了整理结果,不要输出任何其他内容。

【输出格式】
题目：<题干>
A：<选项内容>
B：<选项内容>
C：<选项内容>
D：<选项内容>
答案：<字母>
解析：<材料里原有的解析,原样保留;没有就省略这一行>

【硬性规则】
1. 只调整格式,不改内容:不删题、不加题、不改题意、不改选项文字
2. 有几道题就输出几道题,题与题之间空一行
3. 答案写法:单选写一个字母(如 B);多选字母连写(如 ABD);判断题写"对"或"错"
4. 材料里没有答案的题,直接省略"答案："这一行,绝对不许猜答案
5. 不要给题目加编号,不要用代码块,不要"好的,以下是"之类的开场白和结尾语
6. 原材料里的图片、表格无法转录时,在题干末尾加【原文含图】或【原文含表】,不要试图描述内容

【整理示例】
输入:
1、我国的四大发明是什么?A造纸 B印刷 C火药 D指南针 答案是ABCD
输出:
题目：我国的四大发明是什么?
A：造纸
B：印刷
C：火药
D：指南针
答案：ABCD

现在开始整理。`;

// 低置信度占比阈值:超过它视为"材料大概率很乱",建议走官方提示词路线
export const LOW_CONF_RATIO_THRESHOLD = 0.4;

// 是否建议使用官方提示词:解析出 0 题,或低置信度(conf < 0.6)占比达标
export function needsPromptHelp(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return true;
    const low = questions.filter(q => (q.confidence || 0) < 0.6).length;
    return low / questions.length >= LOW_CONF_RATIO_THRESHOLD;
}

// 合成复制文本:提示词在前,题目原文在后(分隔线隔开);无原文时仅提示词
export function buildCopyText(prompt, material) {
    if (!material || !material.trim()) return prompt;
    return prompt + '\n\n──────── 以下是需要整理的题目原文 ────────\n\n' + material.trim();
}

// 剪贴板复制:优先 Clipboard API(需 HTTPS),降级 execCommand
export async function copyText(text) {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) { /* 走降级 */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        return false;
    }
}
