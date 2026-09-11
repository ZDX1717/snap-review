// ==================== 官方 AI 提示词(解析失败的自救通道) ====================
// 职责:两条官方提示词(格式整理 / 生成答案与解析)+ 触发判定 + 剪贴板复制。
// 允许依赖:无(降级复制用 DOM)。禁止:state / parser。
// 设计与对齐校验:reports/官方AI提示词设计.md
//
// ⚠️ 两条提示词的**分界线 = 改不改内容**(研判结论 2026-09-10):
//   ① 格式整理(OFFICIAL_PROMPT):只搬格式,**一个字的答案都不许自己造**;
//   ② 生成答案与解析(ANSWER_PROMPT):**只给缺的题**造答案,且必须先审后存、永久标注。
//   用户看到的名字必须能一眼区分这两件事,所以模式一统一叫「AI 格式整理(不改内容)」。

// 模式一的用户可见名称。UI 文案、按钮、提示统一用它,**不要再另起说法**
// (历史上有"AI 兜底""一键整理""AI 整理"三种叫法,用户分不清它是"改格式"还是"改内容")。
export const FORMAT_MODE_NAME = 'AI 格式整理(不改内容)';

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
4. **答案只能抄自材料原文**:材料里没有答案、或只有模糊线索的题,**直接省略"答案："这一行**。
   绝对不许猜答案、不许推断、不许用你自己的知识补一个"应该是"的答案
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

// 模式二的提示词:**这里允许 AI 给答案**,因为目的就是补上材料缺失的答案。
// 但要求「给最可能的答案 + 说明依据」,且信息不足时**必须**说"无法确定"而不是硬猜。
export const ANSWER_PROMPT = `你是一个应试题目助手。用户给你的每道题都**缺少答案或解析**,请逐题补上。

【输出格式】严格照抄输入结构,只在每题末尾补上这两行(顺序固定):
题目：<题干,原样照抄>
A：<选项,原样照抄>
答案：<你判断的最可能答案>
解析：<≤80 字,说明为什么是这个答案>

【硬性规则】
1. **题干与选项必须原样照抄**,一个字都不许改、不许"顺手修错别字"
2. 每道题的题数、顺序与输入完全一致;不要合并、不要拆分、不要新增题
3. 答案写法:单选一个字母(如 B);多选字母连写(如 ABD);判断题写"对"或"错"
4. **信息不足就写"无法确定"**:题干残缺、选项缺失、或你自己也没有把握时,
   "答案："写「无法确定」,并在"解析："里用一句话说明缺什么。**宁可说无法确定,也不许硬猜**
5. 解析只讲"为什么选它",≤80 字,不要展开讲知识点、不要列参考资料
6. 不要输出任何其他内容:没有开场白、没有总结、不要用代码块
7. 材料里如果已经给了答案(题目里带了"答案：X"),**直接沿用那个答案**,不要改成你的判断

【示例】
输入:
题目：下列属于行政处罚种类的有
A：警告
B：罚款
C：拘役
D：吊销许可证
输出:
题目：下列属于行政处罚种类的有
A：警告
B：罚款
答案：ABD
解析：拘役是刑罚而非行政处罚；警告、罚款、吊销许可证均属行政处罚种类。

现在开始补答案与解析。`;

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
