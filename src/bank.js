import { state } from './state.js';
import { finalizeQuestion, formatAnswerForDisplay, formatQuestionsForExport, normalizeAnswerString, parseQuestionsText, questionDedupKey } from './parser.js';
import { saveToLocalStorage, loadImportBatches, saveImportBatches, recordImportBatch, loadOverwriteSnapshot, clearOverwriteSnapshot, loadBankVersions, pushBankVersion, loadCollapsedBanks, saveCollapsedBanks } from './storage.js';
import { downloadFile, hideModal, showModal } from './dom.js';
import { docxToText } from './docx.js';
import { OFFICIAL_PROMPT, buildCopyText, copyText } from './prompt.js';
import { toggleFavorite } from './favorites.js';
import { aiConfigReady, aiFixQuestions, aiFormatMaterial, aiMatchKey, aiDiffParts, buildAiNotes, getProvider, normalizeAiConfig, testConnection } from './ai.js';
import { isAiTested, loadAiConfig, loadRecycledBanks, markAiTested, purgeRecycledBank, recycleBank, restoreRecycledBank, saveAiConfig, saveRecycledBanks, recordAiUsage } from './storage.js';

// 本次预览的来源标签(撤销记录展示用),由导入入口设置
let previewSourceLabel = '导入';
// 最近一次导入的原始文本(粘贴内容或上传文档抽取结果),供"提示词+原文"一键合成
let lastRawContent = '';
// 文件填框后的待用来源标签(解析时转正,撤销记录展示用)
let pendingSourceLabel = '';
// 已成功填框的文件:再次点「解析并预览」直接解析输入框,不重读文件
let lastFilledFile = null;

// ==================== bank.js ====================
// 自动拆分自 main.js;依赖方向见各 import。


const fileInput = document.getElementById('file-input');
const importStatus = document.getElementById('import-status');
const questionBankSelect = document.getElementById('question-bank-select');
const banksList = document.getElementById('banks-list');
const createBankModal = document.getElementById('create-bank-modal');
const renameBankModal = document.getElementById('rename-bank-modal');
const newBankNameInput = document.getElementById('new-bank-name');
const renameBankNameInput = document.getElementById('rename-bank-name');
const pasteInput = document.getElementById('paste-input');
const importPreviewModal = document.getElementById('import-preview-modal');
const previewSummary = document.getElementById('preview-summary');
const previewSelectAll = document.getElementById('preview-select-all');
const previewSkipDupes = document.getElementById('preview-skip-dupes');
const previewList = document.getElementById('preview-list');
const previewTargetBankSelect = document.getElementById('preview-target-bank');
const previewOverwrite = document.getElementById('preview-overwrite');
const editBankModal = document.getElementById('edit-bank-modal');
const editBankTitle = document.getElementById('edit-bank-title');
const editorQuestionList = document.getElementById('editor-question-list');
const editorForm = document.getElementById('editor-form');
const editorEmpty = document.getElementById('editor-empty');
const editorStem = document.getElementById('editor-stem');
const editorType = document.getElementById('editor-type');
const editorAnswer = document.getElementById('editor-answer');
const editorOptions = document.getElementById('editor-options');
const editorAddOption = document.getElementById('editor-add-option');
const editorRemoveOption = document.getElementById('editor-remove-option');
const editorExplanation = document.getElementById('editor-explanation');
const editorAnalysis = document.getElementById('editor-analysis');
const editorPosition = document.getElementById('editor-position');
const lastImportInfo = document.getElementById('last-import-info');
const copyPromptBtn = document.getElementById('copy-prompt-btn');
const viewAllBtn = document.getElementById('view-all-btn');
const viewWarnedBtn = document.getElementById('view-warned-btn');
const viewAllCount = document.getElementById('view-all-count');
const viewWarnedCount = document.getElementById('view-warned-count');
const promptToggleBtn = document.getElementById('prompt-toggle-btn');
const promptContent = document.getElementById('prompt-content');
// AI 设置与预览兜底
const aiSettingsBtn = document.getElementById('ai-settings-btn');
const rescueAiBtn = document.getElementById('rescue-ai-btn');
const aiSettingsModal = document.getElementById('ai-settings-modal');
const aiProviderSelect = document.getElementById('ai-provider-select');
const aiBaseUrl = document.getElementById('ai-base-url');
const aiApiKey = document.getElementById('ai-api-key');
const aiModelInput = document.getElementById('ai-model-input');
const aiTestStatus = document.getElementById('ai-test-status');
const aiTestBtn = document.getElementById('ai-test-btn');
const previewAiBtn = document.getElementById('preview-ai-btn');
const previewAiCancelBtn = document.getElementById('preview-ai-cancel-btn');
const previewAiProgress = document.getElementById('preview-ai-progress');
const previewAiProgressFill = document.getElementById('preview-ai-progress-fill');
const previewAiProgressText = document.getElementById('preview-ai-progress-text');
// AI 兜底运行状态(模块级:取消控制器 + 防重入)
let previewAiAbort = null;
let previewAiRunning = false;
// B 路线(救援区)运行状态;第二次点击 = 取消
let rescueAiAbort = null;
let rescueAiRunning = false;
// 输入框内容由 AI 接口生成(解析入预览时打 🤖 标记;手动编辑即失效)
let aiSourcedContent = false;

// 导入题目(按扩展名分流:txt 直读;docx 走零依赖抽取;.doc 明确引导另存)
// 文件选择即读取(0.9.1 重构):所有文件先变文字进输入框,人工过目可编辑,再点「解析并预览」;
// 读不了的(pdf/老版 doc)给两个具体动作:①复制提示词发给 AI ②转换格式/复制文字。
function readFileIntoBox(file) {
    const name = file.name.toLowerCase();

    if (name.endsWith('.pdf')) {
        lastRawContent = '';
        showUnreadableFileNotice(true);
        return;
    }
    if (name.endsWith('.doc') && !name.endsWith('.docx')) {
        lastRawContent = '';
        showUnreadableFileNotice(false);
        return;
    }
    if (file === lastFilledFile && (pasteInput.value || '').trim()) {
        return parsePastedText();  // 已在框里(用户可能改过),点解析就是解析
    }

    // 文字进框(不自动解析:这一眼是人工审查抽取质量的机会)
    const fillBox = (text, label) => {
        lastFilledFile = file;
        aiSourcedContent = false;
        pasteInput.value = text;
        lastRawContent = text;
        pendingSourceLabel = `文件：${file.name}`;
        hideFileNotice();
        showImportStatus(`${label}已读出 ${text.length} 字并填入输入框——可直接编辑，点「解析并预览」继续`, 'success');
    };

    if (name.endsWith('.docx')) {
        file.arrayBuffer()
            .then(buf => docxToText(buf))
            .then(text => fillBox(text, 'Word 文档'))
            .catch(err => showImportStatus(`docx 读取失败：${err && err.message ? err.message : '文件可能损坏'}（老版 .doc 请另存为 .docx，或复制文字粘贴）`, 'error'));
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        fillBox(String(event.target.result), '文件');
    };
    reader.onerror = function() {
        showImportStatus('读取失败：文件读取出错', 'error');
    };
    reader.readAsText(file);
}


// 处理文件选择:按扩展名当场给出指引(PDF/doc 不可解析,第一时间说清替代路径)
export function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        setStatusNeutral();
        return;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
        showUnreadableFileNotice(true);
    } else if (name.endsWith('.doc') && !name.endsWith('.docx')) {
        showUnreadableFileNotice(false);
    } else {
        // 选中即读:文字立刻进输入框,「解析并预览」按钮从此只有一个职责 = 解析
        showImportStatus(`正在读取 ${file.name}…`, 'success');
        readFileIntoBox(file);
    }
}


// 更新题库选择下拉框
export function updateBankSelect() {
    // 保存当前选中的值
    const currentValue = questionBankSelect.value;

    // 清空下拉框
    questionBankSelect.innerHTML = '<option value="all">全部题库</option>';

    // 添加所有题库选项
    Object.keys(state.questionBanks).forEach(bankName => {
        const option = document.createElement('option');
        option.value = bankName;
        option.textContent = bankName;
        questionBankSelect.appendChild(option);
    });

    // 恢复之前选中的值（如果还存在）
    if (currentValue && (currentValue === 'all' || state.questionBanks[currentValue])) {
        questionBankSelect.value = currentValue;
    }
}


// ==================== 官方提示词引导(解析失败的自救通道) ====================

// 展开/收起提示词全文(懒渲染)
export function togglePromptContent() {
    if (!promptContent.textContent) promptContent.textContent = OFFICIAL_PROMPT;
    promptContent.classList.toggle('hidden');
    promptToggleBtn.textContent = promptContent.classList.contains('hidden') ? '查看提示词 ▾' : '收起 ▴';
}

// ==================== 状态区(唯一反馈面:绿=成功 黄=注意 红=错误 灰=中性提示) ====================

// 中性提示:根据当前状态给出下一步指引
function setStatusNeutral() {
    if (!importStatus) return;
    const len = (pasteInput.value || '').trim().length;
    importStatus.textContent = len
        ? `已就绪:${len} 字,点「解析并预览」`
        : '还没有内容：粘贴文字，或点「选择文件」';
    importStatus.className = 'status-line';
}

// 选择文件场景的 HTML 引导(双选项等)也进状态行
function showFileNotice(html, type = 'warning') {
    if (!importStatus) return;
    importStatus.innerHTML = html;
    importStatus.className = 'status-line ' + type;
}
function hideFileNotice() {
    setStatusNeutral();
}

// 读不了的格式:两类文件各给两条互不混淆的路。
// PDF:① AI 提取(AI 聊天能读 PDF 文件,按钮直发提示词) ② 复制文字。
// 老 .doc:AI 聊天也读不了 .doc,不存在"发给 AI"选项 → ① 另存为 .docx 重选 ② 直接复制文字。
function showUnreadableFileNotice(isPdf) {
    if (isPdf) {
        showFileNotice(
            '<b>📄 PDF 不能直接读，两个办法：</b>' +
            '<div class="file-notice-actions"><button type="button" id="file-ai-copy-btn" class="action-btn secondary">① 📋 复制提示词，去豆包/Kimi 让 AI 提取</button></div>' +
            '<p class="file-notice-hint">① 步骤：点上方按钮复制提示词 → 打开豆包 / Kimi / DeepSeek → <b>把 PDF 文件附到对话里</b> → 粘贴提示词发送 → 把 AI 回复全文粘回输入框。注意：此法会把材料上传给该 AI 服务。</p>' +
            '<p class="file-notice-hint">② 不想用 AI：直接在 PDF 里选中文字复制，粘贴到输入框（任何格式通用）。</p>',
            'warning'
        );
        return;
    }
    showFileNotice(
        '<b>📄 老版 .doc 不能直接读，两个办法：</b>' +
        '<p class="file-notice-hint">① <b>转格式（推荐）</b>：用 Word / WPS 打开 → 另存为 <b>.docx</b> → 回来重新选择文件，文字会自动读进输入框。</p>' +
        '<p class="file-notice-hint">② <b>复制文字</b>：直接在 .doc 里选中文字复制，粘贴到输入框（任何格式通用）。</p>' +
        '<p class="file-notice-hint">提示：转成 .docx 导入后若格式仍乱，可用预览页的「🤖 AI 兜底整理」一键清理。</p>',
        'warning'
    );
}

// 状态行内动态按钮的事件委托(innerHTML 重建不丢监听)
importStatus.addEventListener('click', (e) => {
    if (e && e.target && e.target.id === 'file-ai-copy-btn') copyOfficialPrompt(true);
});

export async function copyOfficialPrompt(forcePromptOnly = false) {
    // forcePromptOnly:PDF/doc 场景没有文字可合并,只要提示词(防止误合并上一次的原文)
    const material = forcePromptOnly ? '' : ((pasteInput.value || '').trim() || lastRawContent);
    const ok = await copyText(buildCopyText(OFFICIAL_PROMPT, material));
    if (ok) {
        copyPromptBtn.textContent = material
            ? `✓ 已复制提示词+题目(${material.length} 字)`
            : '✓ 已复制提示词';
        setTimeout(() => { copyPromptBtn.textContent = '📋 一键复制提示词+题目'; }, 2500);
        showImportStatus(material
            ? '已复制提示词+题目原文:整段粘贴给豆包 / Kimi / DeepSeek,把整理结果粘回这里'
            : '提示词已复制:打开豆包 / Kimi / DeepSeek,附上文件后粘贴发送,把 AI 回复粘回输入框', 'success');
    } else {
        showImportStatus('复制失败:请长按提示词文字手动复制', 'error');
    }
}


export function parsePastedText() {
    const text = pasteInput.value;
    if (!text.trim()) {
        showImportStatus('请先粘贴题目内容', 'error');
        return;
    }
    // 来源:文件填框的用文件名,纯粘贴用"粘贴导入"(撤销记录展示用)
    previewSourceLabel = pendingSourceLabel || '粘贴导入';
    pendingSourceLabel = '';
    const importedQuestions = parseQuestionsText(text);
    if (importedQuestions.length === 0) {
        showImportStatus('没有解析出有效题目。试试上方「复制官方提示词」用 AI 整理', 'error');
        return;
    }
    const aiSource = aiSourcedContent;
    aiSourcedContent = false;
    updatePreviewTargetBanks();
    openImportPreview(importedQuestions, aiSource);
}


// 把剪贴板里的富文本 HTML 按块级元素拆成行（Word/网页/PDF 复制时保留结构）
export function htmlToLines(html) {
    if (typeof DOMParser === 'undefined') {
        // 无 DOMParser 环境的兜底
        return html.replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const lines = [];
    const BLOCK = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE']);
    const pushText = (t) => {
        const s = (t || '').replace(/\s+/g, ' ').trim();
        if (s) lines.push(s);
    };
    const walk = (node) => {
        for (const child of node.children) {
            const tag = child.tagName;
            if (tag === 'TR') {
                const cells = Array.from(child.children)
                    .map(td => (td.textContent || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean);
                if (cells.length) lines.push(cells.join(' '));
            } else if (tag === 'UL' || tag === 'OL' || tag === 'TABLE' || tag === 'THEAD' || tag === 'TBODY' || tag === 'TFOOT' ||
                       (BLOCK.has(tag) && child.querySelector('p, div, li, tr'))) {
                walk(child); // 容器元素继续下钻
            } else if (BLOCK.has(tag)) {
                pushText(child.textContent);
            }
            // 行内元素（span/b/i 等）的文本已包含在最近的块级祖先里
        }
    };
    walk(doc.body);
    if (lines.length === 0) {
        return (doc.body.textContent || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }
    return lines;
}


// 显示导入状态:所有提示常驻显示,直到下一个动作覆盖它(绿色读不完的问题即此修)
// 中性态只在明确"回到起点"时出现(清空/读取完成后的初始指引)
export function showImportStatus(message, type) {
    if (!importStatus) return;
    importStatus.textContent = message;
    importStatus.className = 'status-line' + (type ? ' ' + type : '');
}


// 打开预览：questions 为解析结果数组
// 视图切换(双 tab):全部 / 问题题;只切换镜片,不动勾选
export function setPreviewView(warned) {
    state.previewFilterWarned = !!warned;
    renderPreview();
    updatePreviewSummary();
}

// ==================== AI 设置面板(0.9.0 · BYO key) ====================

// 设置面板状态行(.status-message 默认 display:none,必须带 success/error 类才可见)
function setAiTestStatus(message, type) {
    if (!aiTestStatus) return;
    aiTestStatus.textContent = message;
    aiTestStatus.className = 'status-message' + (type ? ' ' + type : '');
}

// 打开设置:把已存配置回填进表单(缺省按当前厂商预设)
export function openAiSettings() {
    const cfg = normalizeAiConfig(loadAiConfig());
    aiProviderSelect.value = cfg.providerId;
    aiBaseUrl.value = cfg.baseUrl;
    aiApiKey.value = cfg.apiKey;
    aiModelInput.value = cfg.model;
    setAiTestStatus('');
    showModal(aiSettingsModal);
}

// 厂商切换:自定义保留手填;预设厂商回填官方地址与默认模型(key 不动)
export function aiProviderChanged() {
    if (aiProviderSelect.value === 'custom') return;
    const p = getProvider(aiProviderSelect.value);
    aiBaseUrl.value = p.baseUrl;
    aiModelInput.value = p.model;
}

// 表单 → 配置;成功返回配置对象,不完整返回 null 并提示
function collectAiConfigFromForm() {
    const cfg = normalizeAiConfig({
        providerId: aiProviderSelect.value,
        baseUrl: aiBaseUrl.value,
        apiKey: aiApiKey.value,
        model: aiModelInput.value,
    });
    if (!aiConfigReady(cfg)) {
        setAiTestStatus('⚠ 接口地址、API Key、模型名都需要填写', 'error');
        return null;
    }
    return cfg;
}

// 测试连接(不保存):极短消息往返验证 key/地址/模型;全程按钮禁用 + 状态可见
export async function testAiConnection() {
    const cfg = collectAiConfigFromForm();
    if (!cfg) return false;
    if (aiTestBtn) aiTestBtn.disabled = true;
    setAiTestStatus('⏳ 正在连接,请稍候(最多 15 秒)…', 'success');
    try {
        const r = await testConnection(cfg);
        markAiTested(cfg);
        updateAiSettingsBadge();
        setAiTestStatus(`✅ 连接成功（模型回复：${r.sample}）`, 'success');
        return true;
    } catch (e) {
        setAiTestStatus('❌ ' + e.message, 'error');
        return false;
    } finally {
        if (aiTestBtn) aiTestBtn.disabled = false;
    }
}

// 保存设置(存本机 localStorage)
export function saveAiSettings() {
    const cfg = collectAiConfigFromForm();
    if (!cfg) return false;
    saveAiConfig(cfg);
    updateAiSettingsBadge();
    setAiTestStatus('✅ 已保存到本机', 'success');
    setTimeout(() => hideModal(aiSettingsModal), 400);
    return true;
}

// 「⚙ AI 已连接 ✓」徽章:配置就绪且与最近一次测试成功的指纹一致才亮
export function updateAiSettingsBadge() {
    if (!aiSettingsBtn) return;
    const cfg = normalizeAiConfig(loadAiConfig());
    const ok = aiConfigReady(cfg) && isAiTested(cfg);
    aiSettingsBtn.textContent = ok ? '⚙ AI 已连接 ✓' : '⚙ AI 设置';
    aiSettingsBtn.classList.toggle('ai-connected', ok);
}

// ==================== 预览 AI 兜底(分块/进度/取消 → 复用预览确认管道) ====================

// 预览页 AI 兜底(0.9.1 重构):只整理**已勾选的题** —— 视图是镜片,勾选是真相。
// 勾选题序列化成官方格式分块发 AI → 解析回填 → 逐题 🤖 徽章写明改动;进度按"已整理 x/N 题"。
export async function previewAiFallback() {
    if (previewAiRunning) return;
    const checkedSlots = state.previewData
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.include);
    if (checkedSlots.length === 0) {
        showPreviewAiText('先勾选要整理的题(可用「问题题」视图快速定位)');
        return;
    }
    const cfg = normalizeAiConfig(loadAiConfig());
    if (!aiConfigReady(cfg)) {
        alert('请先在「⚙ AI 设置」里配置服务商与 API Key(自带 key,仅存本机)');
        openAiSettings();
        return;
    }

    // 快照勾选题(用于按题号匹配回填与改动对比)
    const originals = checkedSlots.map(({ item }) => JSON.parse(JSON.stringify(item.q)));
    const total = originals.length;

    previewAiRunning = true;
    if (typeof AbortController !== 'undefined') previewAiAbort = new AbortController();
    const signal = previewAiAbort ? previewAiAbort.signal : undefined;
    if (previewAiBtn) previewAiBtn.disabled = true;
    if (previewAiCancelBtn) previewAiCancelBtn.classList.remove('hidden');
    if (previewAiProgress) previewAiProgress.classList.remove('hidden');
    if (previewAiProgressFill) previewAiProgressFill.style.width = '5%';
    if (previewAiProgressText) previewAiProgressText.textContent = `连接 AI…(共 ${total} 题)`;

    try {
        const { questions: parsed } = await aiFixQuestions(cfg, originals, {
            signal,
            onProgress: (done, t) => {
                if (previewAiProgressFill) previewAiProgressFill.style.width = Math.round(done / t * 100) + '%';
                if (previewAiProgressText) previewAiProgressText.textContent = `已整理 ${done}/${t} 题`;
            },
        });
        if (previewAiProgressFill) previewAiProgressFill.style.width = '100%';
        recordAiUsage({ trigger: 'preview-fix', total, aiQuestions: parsed.length });

        // 回填:题干+选项精确匹配 → 题干宽松匹配;匹配上的替换并写改动徽章
        const pool = originals.map(q => ({ q, used: false }));
        let replaced = 0, changed = 0;
        parsed.forEach(nu => {
            const hit = pool.find(p => !p.used && aiMatchKey(p.q) === aiMatchKey(nu))
                || pool.find(p => !p.used && p.q && aiMatchKey(p.q, true) === aiMatchKey(nu, true));
            if (!hit) return; // AI 多返回的题:不是用户勾选的内容,忽略
            hit.used = true;
            const slot = checkedSlots[pool.indexOf(hit)];
            const parts = aiDiffParts(hit.q, nu);
            if (parts.length) changed++;
            slot.item.q = nu;
            slot.item.aiNote = parts.length ? 'AI 修改：' + parts.join('，') : (slot.item.aiNote || '');
            replaced++;
        });
        // AI 没回的题:保留原样并明示,不让题目无声消失
        let missing = 0;
        pool.forEach((p, i) => {
            if (!p.used) {
                missing++;
                checkedSlots[i].item.aiNote = 'AI 未返回此题（保留原样）';
            }
        });

        renderPreview();
        let msg = `完成：AI 更新 ${replaced}/${total} 题，其中 ${changed} 题有改动（🤖 标记）`;
        if (missing) msg += `，${missing} 题 AI 未返回已保留原样`;
        showPreviewAiText(msg);
        if (previewSummary) previewSummary.textContent = `🤖 AI 整理完成（${total} 题已处理），请确认后导入`;
    } catch (e) {
        recordAiUsage({ trigger: 'preview-fix', ok: false, total, error: String(e.message || e).slice(0, 120) });
        if (e && /取消/.test(e.message)) {
            showPreviewAiText('已取消');
        } else {
            alert('AI 兜底失败：' + (e.message || e));
            showPreviewAiText('失败：' + String(e.message || e).slice(0, 60));
        }
        renderPreview();
    } finally {
        previewAiRunning = false;
        previewAiAbort = null;
        if (previewAiBtn) previewAiBtn.disabled = false;
        if (previewAiCancelBtn) previewAiCancelBtn.classList.add('hidden');
        setTimeout(() => { if (previewAiProgress) previewAiProgress.classList.add('hidden'); }, 2000);
    }
}

// 进度/结果文字(留在进度条旁,不随 renderPreview 刷掉)
function showPreviewAiText(text) {
    if (previewAiProgress) previewAiProgress.classList.remove('hidden');
    if (previewAiProgressText) previewAiProgressText.textContent = text;
}

// ==================== 救援区 B 路线:AI 接口整理原文 → 自动入输入框 ====================

// 手动编辑输入框即视为脱离 AI 生成状态(程序化赋值不触发 input,不受影响)
pasteInput.addEventListener('input', () => { aiSourcedContent = false; });

export async function rescueAiOrganize() {
    if (rescueAiRunning) {  // 第二次点击 = 取消
        if (rescueAiAbort) rescueAiAbort.abort();
        return;
    }
    const material = (pasteInput.value || '').trim() || (lastRawContent || '').trim();
    if (!material) {
        showImportStatus('没有可整理的内容：先粘贴题目，或点「选择文件」', 'warning');
        return;
    }
    const cfg = normalizeAiConfig(loadAiConfig());
    if (!aiConfigReady(cfg)) {
        showImportStatus('还没有配置 AI 接口：点右上角「⚙ AI 设置」，配置并测试连接后即可使用', 'warning');
        openAiSettings();
        return;
    }

    rescueAiRunning = true;
    if (typeof AbortController !== 'undefined') rescueAiAbort = new AbortController();
    const signal = rescueAiAbort ? rescueAiAbort.signal : undefined;
    if (rescueAiBtn) {
        rescueAiBtn.disabled = true;
        rescueAiBtn.textContent = '🤖 整理中…（点击取消）';
    }
    showImportStatus('🤖 AI 整理中…', 'success');

    try {
        const { text, chunks } = await aiFormatMaterial(cfg, material, {
            signal,
            onProgress: (done, total) => showImportStatus(`🤖 AI 整理中（${done}/${total} 块）…再点一次按钮可取消`, 'success'),
        });
        const parsed = parseQuestionsText(text);
        recordAiUsage({ trigger: 'rescue-organize', chunks, aiQuestions: parsed.length });
        if (parsed.length === 0) {
            showImportStatus('AI 没整理出题目：改用左边 A 路线（复制提示词发给聊天 AI 人工兜底）', 'error');
            return;
        }
        // 结果替换输入框内容,标记 AI 生成;点解析后逐题带 🤖
        aiSourcedContent = true;
        lastFilledFile = null;
        pendingSourceLabel = '';
        pasteInput.value = text;
        lastRawContent = text;
        showImportStatus(`✅ AI 已整理出 ${parsed.length} 题（${chunks} 块原文），已放进输入框——过目后点「解析并预览」`, 'success');
    } catch (e) {
        if (e && /取消/.test(e.message)) {
            showImportStatus('已取消 AI 整理', 'warning');
        } else {
            showImportStatus('AI 整理失败：' + (e.message || e) + '（可改用左边 A 路线）', 'error');
        }
    } finally {
        rescueAiRunning = false;
        rescueAiAbort = null;
        if (rescueAiBtn) {
            rescueAiBtn.disabled = false;
            rescueAiBtn.textContent = '🤖 一键 AI 整理原文';
        }
    }
}

// 清空输入框 + 复位文件选择与 AI 生成标记
export function clearPasteInput() {
    pasteInput.value = '';
    lastRawContent = '';
    aiSourcedContent = false;
    pendingSourceLabel = '';
    lastFilledFile = null;
    if (fileInput) fileInput.value = '';
    setStatusNeutral();
}

// 取消进行中的 AI 兜底
export function cancelPreviewAi() {
    if (previewAiAbort) {
        previewAiAbort.abort();
        if (previewSummary) previewSummary.textContent = '⛔ 已取消 AI 整理';
    }
}

export function openImportPreview(questions, aiSource = false) {
    state.previewFilterWarned = false; // 新一批导入重置筛选
    // 预览防呆:缺答案/选项不足/低置信度(conf ≤ 0.6)的题默认不勾选,用户确认后可手动勾回
    // aiSource:整批来自 AI 接口整理 → 逐题 🤖 生成标记(AI 动过要留痕)
    state.previewData = questions.map(q => ({ q, include: (q.confidence || 0) > 0.6, warnings: [], aiNote: aiSource ? 'AI 生成' : '' }));
    renderPreview();
    showModal(importPreviewModal);
}


export function updatePreviewTargetBanks() {
    previewTargetBankSelect.innerHTML = '';
    Object.keys(state.questionBanks).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = `${name}（${(state.questionBanks[name] || []).length} 题）`;
        previewTargetBankSelect.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '＋ 新建题库…';
    previewTargetBankSelect.appendChild(newOpt);
    if (Object.keys(state.questionBanks).length === 0) {
        previewTargetBankSelect.value = '__new__';
    }
}


export function renderPreview() {
    previewList.innerHTML = '';
    const bankKeys = new Set();
    Object.values(state.questionBanks).forEach(bank => (bank || []).forEach(q => bankKeys.add(questionDedupKey(q))));

    // 第一遍:全量计算警告(筛选只是视图层,不改变勾选与统计)
    state.previewData.forEach(item => {
        const q = item.q;
        const warnings = [];
        if (!q.answer) warnings.push('缺答案');
        if (Object.keys(q.options).length < 2) warnings.push('选项不足');
        if (bankKeys.has(questionDedupKey(q))) warnings.push('与现有题库重复');
        if ((q.confidence || 0) < 0.6) warnings.push('低置信度');
        item.warnings = warnings;
    });

    // 第二遍:按筛选渲染(只看问题题时隐藏无警告项)
    const warnCount = state.previewData.filter(i => i.warnings.length).length;
    state.previewData
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !state.previewFilterWarned || item.warnings.length > 0)
        .forEach(({ item, idx }) => {
        const q = item.q;
        const warnings = item.warnings;

        const box = document.createElement('div');
        box.className = 'preview-item' + (warnings.length ? ' warn' : '') + (item.aiNote ? ' ai-touched' : '');
        const clearAiMark = () => {
            if (!item.aiNote) return;
            item.aiNote = '';
            item.histAI = true;  // 痕迹:导入后记入历史日志
            box.classList.remove('ai-touched');
            const badge = box.querySelector('.ai-badge');
            if (badge && badge.remove) badge.remove();
        };

        const head = document.createElement('div');
        head.className = 'preview-item-head';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = item.include;
        chk.addEventListener('change', () => { item.include = chk.checked; updateSelectAllState(); updatePreviewSummary(); });
        head.appendChild(chk);

        const num = document.createElement('span');
        num.className = 'preview-num';
        num.textContent = `#${idx + 1}`;
        head.appendChild(num);

        const typeBadge = document.createElement('span');
        typeBadge.className = 'badge';
        typeBadge.textContent = q.type || '未知';
        head.appendChild(typeBadge);

        warnings.forEach(w => {
            const b = document.createElement('span');
            b.className = 'badge warn-badge';
            b.textContent = w;
            head.appendChild(b);
        });

        // AI 改动标注(🤖 紫徽章):只有真变了才显示,写明改了什么
        if (item.aiNote) {
            const aiB = document.createElement('span');
            aiB.className = 'badge ai-badge';
            aiB.textContent = '🤖 ' + item.aiNote;
            head.appendChild(aiB);
        }

        const conf = document.createElement('span');
        conf.className = 'preview-conf';
        conf.textContent = `${Math.round((q.confidence || 0) * 100)}%`;
        head.appendChild(conf);
        box.appendChild(head);

        const stem = document.createElement('textarea');
        stem.className = 'preview-stem';
        stem.rows = 2;
        stem.value = q.content;
        stem.addEventListener('input', () => { q.content = stem.value; clearAiMark(); });
        box.appendChild(stem);

        const optsDiv = document.createElement('div');
        optsDiv.className = 'preview-options';
        const optKeys = Object.keys(q.options).sort();
        optsDiv.textContent = optKeys.length
            ? optKeys.map(k => `${k}. ${q.options[k]}`).join('　')
            : '（未解析到选项）';
        box.appendChild(optsDiv);

        const editRow = document.createElement('div');
        editRow.className = 'preview-edit-row';

        const ansLabel = document.createElement('span');
        ansLabel.className = 'preview-answer-label';
        ansLabel.textContent = '答案：';
        editRow.appendChild(ansLabel);

        const ansInput = document.createElement('input');
        ansInput.className = 'preview-answer';
        ansInput.value = q.answer;
        ansInput.placeholder = '如 A / ABC / 对';
        ansInput.addEventListener('input', () => { q.answer = ansInput.value; clearAiMark(); });
        editRow.appendChild(ansInput);

        if (q.analysis) {
            const ana = document.createElement('span');
            ana.className = 'preview-analysis';
            ana.textContent = `解析：${q.analysis}`;
            editRow.appendChild(ana);
        }
        box.appendChild(editRow);

        previewList.appendChild(box);
    });

    // 双 tab 视图:高亮当前 + 计数
    if (viewAllBtn && viewWarnedBtn) {
        viewAllBtn.classList.toggle('active', !state.previewFilterWarned);
        viewWarnedBtn.classList.toggle('active', state.previewFilterWarned);
    }
    if (viewAllCount) viewAllCount.textContent = String(state.previewData.length);
    if (viewWarnedCount) viewWarnedCount.textContent = String(warnCount);
    updateSelectAllState();
    updatePreviewSummary(warnCount);
}


// 三态全选:全勾 → 点击清空;未全勾(含部分/全不选)→ 点击全勾;勾选框本体只作状态显示(粗体横杠=部分选中)
export function togglePreviewSelectAll() {
    const allSelected = state.previewData.length > 0 && state.previewData.every(i => i.include);
    state.previewData.forEach(i => { i.include = !allSelected; });
    renderPreview();
}

// 把预览数据的选择状态同步回"全选"勾选框(checked/indeterminate 双属性)
function updateSelectAllState() {
    if (!previewSelectAll) return;
    const total = state.previewData.length;
    const inc = state.previewData.filter(i => i.include).length;
    previewSelectAll.checked = total > 0 && inc === total;
    previewSelectAll.indeterminate = inc > 0 && inc < total;
}


export function updatePreviewSummary(warnCount) {
    const total = state.previewData.length;
    const included = state.previewData.filter(i => i.include).length;
    const warns = (typeof warnCount === 'number')
        ? warnCount
        : state.previewData.filter(i => i.warnings && i.warnings.length).length;
    previewSummary.textContent = `共解析 ${total} 题，已勾选 ${included} 题，${warns} 题含警告需要留意`;
}


// 确认导入：收集勾选项 → 重新规范化 → 去重 → 写入目标题库
export function commitPreviewImport() {
    let targetName = previewTargetBankSelect.value;
    if (targetName === '__new__') {
        const name = (prompt('请输入新题库名称：') || '').trim();
        if (!name) return;
        targetName = name;
    }
    if (!state.questionBanks[targetName]) state.questionBanks[targetName] = [];

    const overwrite = previewOverwrite.checked;
    if (overwrite && state.questionBanks[targetName].length > 0 &&
        !confirm(`确定清空题库"${targetName}"并导入新题目吗？（覆盖前会自动快照，可恢复）`)) {
        return;
    }

    // 收集勾选项（重新规范化保证答案/题型一致）；缺答案题不再丢弃,入库为"待补"
    const items = [];
    const seen = new Set();
    for (const item of state.previewData) {
        if (!item.include) continue;
        const clone = JSON.parse(JSON.stringify(item.q));
        const finalized = finalizeQuestion(clone);
        if (!finalized) continue;
        if (item.aiNote) {
            finalized.aiSource = 'ai';  // AI 动过 → 永久标注,编辑器可见
        } else if (item.histAI) {
            pushHistMark(finalized, 'ai');  // 预览中已人工改掉 AI 痕迹 → 直接进历史
        }
        const key = questionDedupKey(finalized);
        if (seen.has(key)) continue; // 批内去重
        seen.add(key);
        items.push(finalized);
    }

    // 与目标题库查重
    const existingKeys = new Set((overwrite ? [] : state.questionBanks[targetName]).map(questionDedupKey));
    const finalItems = previewSkipDupes.checked
        ? items.filter(q => !existingKeys.has(questionDedupKey(q)))
        : items;

    if (finalItems.length === 0) {
        alert('没有可导入的题目（均与目标题库重复）');
        return;
    }

    if (overwrite) {
        // 覆盖前自动快照,支持"恢复覆盖前快照"(消灭"此操作不可恢复")
        if (state.questionBanks[targetName].length > 0) {
            pushBankVersion(targetName, '覆盖导入前', state.questionBanks[targetName]);
        }
        state.questionBanks[targetName] = finalItems;
    } else {
        state.questionBanks[targetName].push(...finalItems);
    }

    // 切换到目标题库
    state.isAllBanksView = false;
    state.currentBankName = targetName;
    state.questionBank = state.questionBanks[targetName];

    saveToLocalStorage();
    updateBankSelect();
    questionBankSelect.value = targetName;
    updateBanksList();

    hideModal(importPreviewModal);
    hideFileNotice();
    fileInput.value = '';
    pasteInput.value = '';

    const dupeNote = (items.length - finalItems.length) > 0 ? `（跳过 ${items.length - finalItems.length} 题重复）` : '';
    const pendingImported = finalItems.filter(q => !q.answer).length;
    const pendingNote = pendingImported > 0 ? `，其中 ${pendingImported} 题待补答案（编辑器中可补，刷题时自动排除）` : '';
    showImportStatus(`成功导入 ${finalItems.length} 道题目到题库：${targetName}${dupeNote}${pendingNote}`, 'success');

    // 记录导入批次(供"撤销上次导入"按指纹回滚;手改过的题指纹变化后自动跳过)
    recordImportBatch({
        time: new Date().toISOString(),
        source: previewSourceLabel,
        bank: targetName,
        fingerprints: finalItems.map(questionDedupKey),
        imported: finalItems.length,
    });
    updateLastImportInfo();
}


// ==================== 导入撤销与覆盖快照恢复 ====================

// 撤销最近一次导入:按批次指纹从目标题库移除,并级联清理错题本/收藏中的同指纹条目
export function undoLastImport() {
    const batches = loadImportBatches();
    const last = batches[batches.length - 1];
    if (!last) {
        showImportStatus('没有可撤销的导入记录', 'error');
        return;
    }
    const fpSet = new Set(last.fingerprints || []);
    const bank = state.questionBanks[last.bank] || [];
    const keptBank = bank.filter(q => !fpSet.has(questionDedupKey(q)));
    const removedBank = bank.length - keptBank.length;
    const keptErr = state.errorQuestions.filter(q => !fpSet.has(questionDedupKey(q)));
    const removedErr = state.errorQuestions.length - keptErr.length;
    const keptFav = state.favoriteQuestions.filter(q => !fpSet.has(questionDedupKey(q)));
    const removedFav = state.favoriteQuestions.length - keptFav.length;

    if (removedBank + removedErr + removedFav === 0) {
        // 导入的题已被删除或修改(指纹变化):按设计跳过,不误删,批次作废
        saveImportBatches(batches.slice(0, -1));
        showImportStatus('上次导入的题目已不存在（可能已被删除或修改），无需撤销', 'error');
        updateLastImportInfo();
        return;
    }
    if (!confirm(`撤销 ${last.time.replace('T', ' ').slice(0, 16)} 导入到"${last.bank}"的记录？\n将从题库移除 ${removedBank} 题，并同步移除错题本 ${removedErr} 条、收藏 ${removedFav} 条。`)) {
        return; // 用户取消:批次保留,仍可再次撤销
    }
    state.questionBanks[last.bank] = keptBank;
    state.errorQuestions = keptErr;
    state.favoriteQuestions = keptFav;
    if (state.currentBankName === last.bank) state.questionBank = keptBank;
    saveImportBatches(batches.slice(0, -1));
    saveToLocalStorage();
    updateBankSelect();
    updateBanksList();
    updateLastImportInfo();
    showImportStatus(`已撤销导入：从"${last.bank}"移除 ${removedBank} 题（错题本 ${removedErr} 条、收藏 ${removedFav} 条已同步清理）`, 'success');
}

// 恢复覆盖模式导入前的题库快照
export function restoreOverwriteSnapshot() {
    const snap = loadOverwriteSnapshot();
    if (!snap) {
        showImportStatus('没有可恢复的覆盖前快照（仅覆盖导入时自动生成）', 'error');
        return;
    }
    if (!state.questionBanks[snap.bank]) {
        showImportStatus(`快照对应的题库"${snap.bank}"已被删除，无法恢复`, 'error');
        return;
    }
    if (!confirm(`把题库"${snap.bank}"恢复到覆盖前状态（${snap.questions.length} 题，当前 ${(state.questionBanks[snap.bank] || []).length} 题）？`)) {
        return;
    }
    state.questionBanks[snap.bank] = JSON.parse(JSON.stringify(snap.questions));
    if (state.currentBankName === snap.bank) state.questionBank = state.questionBanks[snap.bank];
    clearOverwriteSnapshot();
    saveToLocalStorage();
    updateBankSelect();
    updateBanksList();
    showImportStatus(`已恢复覆盖前快照：${snap.bank}（${snap.questions.length} 题）`, 'success');
}

// 预览一键"只保留无警告题"(单向过滤,被滤掉的仍可手动勾回)
// 「推荐选择」:无警告题勾上、有警告题取消——与导入默认防呆规则一致,可再手动微调
export function keepCleanOnly() {
    state.previewData.forEach(item => {
        item.include = !(item.warnings && item.warnings.length);
    });
    renderPreview();
    updatePreviewSummary();
}

// 题库管理页展示最近一次导入信息
export function updateLastImportInfo() {
    const batches = loadImportBatches();
    const last = batches[batches.length - 1];
    if (!last) {
        lastImportInfo.textContent = '暂无导入记录';
        return;
    }
    lastImportInfo.textContent = `上次导入：${last.time.replace('T', ' ').slice(0, 16)} · ${last.source} → ${last.bank}（${last.imported} 题）`;
}


// 创建新题库
export function createNewBank() {
    const bankName = newBankNameInput.value.trim();

    if (!bankName) {
        alert('请输入题库名称');
        return;
    }

    if (state.questionBanks[bankName]) {
        alert('该题库已存在');
        return;
    }

    state.questionBanks[bankName] = [];
    state.currentBankName = bankName;
    state.questionBank = state.questionBanks[bankName];
    state.isAllBanksView = false;

    saveToLocalStorage();
    updateBankSelect();
    questionBankSelect.value = bankName;
    updateBanksList();

    hideModal(createBankModal);
    alert('题库创建成功');
}


// 显示重命名模态框
export function showRenameModal(bankName) {
    state.currentRenameBank = bankName;
    renameBankNameInput.value = bankName;
    showModal(renameBankModal);
}


// 重命名题库
export function renameBank() {
    const newName = renameBankNameInput.value.trim();

    if (!newName) {
        alert('请输入新名称');
        return;
    }

    if (newName === state.currentRenameBank) {
        hideModal(renameBankModal);
        return;
    }

    if (state.questionBanks[newName]) {
        alert('该题库名称已存在');
        return;
    }

    state.questionBanks[newName] = state.questionBanks[state.currentRenameBank];
    delete state.questionBanks[state.currentRenameBank];

    // 归属同步(P0-1.9):错题/收藏跟随新库名,避免漂进"杂项"
    const oldName = state.currentRenameBank;
    state.errorQuestions.forEach(q => { if (q.bankName === oldName) q.bankName = newName; });
    state.favoriteQuestions.forEach(q => { if (q.bankName === oldName) q.bankName = newName; });

    if (state.currentBankName === state.currentRenameBank) {
        state.currentBankName = newName;
        state.questionBank = state.questionBanks[state.currentBankName];
    }

    saveToLocalStorage();
    refreshQuestionBankView();
    updateBankSelect();
    updateBanksList();

    hideModal(renameBankModal);
    alert('题库重命名成功');
}


// 删除题库
export function deleteBank(bankName) {
    if (!confirm(`确定删除题库"${bankName}"吗？\n该库的错题与收藏将一并移入回收站,可随时恢复。`)) {
        return;
    }

    // 整体打包入回收站(题 + 该库错题 + 该库收藏)
    recycleBank(bankName, {
        bank: state.questionBanks[bankName] || [],
        errors: state.errorQuestions.filter(q => (q.bankName || '未知题库') === bankName),
        favorites: state.favoriteQuestions.filter(q => (q.bankName || '未知题库') === bankName),
    });
    state.errorQuestions = state.errorQuestions.filter(q => (q.bankName || '未知题库') !== bankName);
    state.favoriteQuestions = state.favoriteQuestions.filter(q => (q.bankName || '未知题库') !== bankName);

    if (state.currentBankName === bankName) {
        const bankNames = Object.keys(state.questionBanks).filter(name => name !== bankName);
        if (bankNames.length > 0) {
            state.currentBankName = bankNames[0];
            state.questionBank = state.questionBanks[state.currentBankName];
        } else {
            state.currentBankName = '默认题库';
            state.questionBank = [];
            state.questionBanks[state.currentBankName] = state.questionBank;
        }
    }

    delete state.questionBanks[bankName];

    saveToLocalStorage();
    refreshQuestionBankView();
    updateBankSelect();
    updateBanksList();

    alert(`题库"${bankName}"已移入回收站(可恢复)`);
}

// ==================== 库级版本快照 UI(P0-1.11) ====================

// ==================== 回收站 UI(P0-1.10) ====================






// 导出单个题库
export function exportBank(bankName) {
    const questions = state.questionBanks[bankName];
    if (!questions || questions.length === 0) {
        alert('该题库为空，无法导出');
        return;
    }

    const content = formatQuestionsForExport(questions);
    downloadFile(`${bankName}.txt`, content);
}


// 导出所有题库
export function exportAllBanks() {
    const bankNames = Object.keys(state.questionBanks);
    if (bankNames.length === 0) {
        alert('暂无题库可导出');
        return;
    }

    let allContent = '';
    bankNames.forEach(bankName => {
        const questions = state.questionBanks[bankName];
        if (questions && questions.length > 0) {
            allContent += `# 题库：${bankName}\n\n`;
            allContent += formatQuestionsForExport(questions);
            allContent += '\n\n';
        }
    });

    if (!allContent) {
        alert('所有题库都为空，无法导出');
        return;
    }

    downloadFile('所有题库.txt', allContent);
}


// 题库一键去重：按"题干+选项"指纹清理重复题（保留最早导入的版本）
export function dedupBank(bankName) {
    const questions = state.questionBanks[bankName] || [];
    pushBankVersion(bankName, '去重前', questions);
    const seen = new Set();
    const kept = [];
    questions.forEach(q => {
        const key = questionDedupKey(q);
        if (seen.has(key)) return;
        seen.add(key);
        kept.push(q);
    });
    const removed = questions.length - kept.length;
    if (removed === 0) {
        alert('该题库没有重复题目');
        return;
    }
    if (!confirm(`发现 ${removed} 道重复题目（按题干+选项判断，保留最早导入的版本），确定清理吗？`)) {
        return;
    }
    state.questionBanks[bankName] = kept;
    if (state.currentBankName === bankName) {
        state.questionBank = kept;
    }
    saveToLocalStorage();
    refreshQuestionBankView();
    updateBanksList();
    updateBankSelect();
    alert(`已清理 ${removed} 道重复题目`);
}


// 打开题库编辑器
export function editBank(bankName) {
    if (!state.questionBanks[bankName]) return;
    state.editBankName = bankName;
    state.editIndex = 0;
    state.editorDirty = false;
    editBankTitle.textContent = `编辑题库：${bankName}`;
    renderBankEditor();
    showModal(editBankModal);
}


// 新增题目（空题，未保存前关闭会被清理）
export function editorAddQuestion() {
    if (!editorGuard()) return;
    const questions = currentEditBank();
    questions.push({
        content: '', type: '单选', options: { A: '', B: '', C: '', D: '' }, answer: '',
        explanation: '', analysis: '', optionExplanations: {}, confidence: 1, raw: ''
    });
    state.editIndex = questions.length - 1;
    renderBankEditor();
    state.editorDirty = true;
    editorStem.focus();
}


// 保存当前题（silent=true 时不弹提示），返回是否成功
export function editorSaveCurrent(silent) {
    const questions = currentEditBank();
    const q = questions[state.editIndex];
    if (!q) return false;

    const stem = editorStem.value.trim();
    const type = editorType.value;
    let answer = (editorAnswer.value || '').toUpperCase().replace(/\s+/g, '');
    let options;

    if (type === '判断') {
        options = { A: '正确', B: '错误' };
        // 允许填 对/错/√/× 等写法
        if (/^(对|正确|√|T|Y)$/.test(answer) || answer === '') answer = 'A';
        else if (/^(错|错误|×|X|F|N)$/.test(answer)) answer = 'B';
        answer = answer.replace(/[^AB]/g, '') || 'A';
    } else {
        options = editorCollectOptions();
        Object.keys(options).forEach(l => {
            if (!options[l].trim()) delete options[l];
        });
        answer = normalizeAnswerString(answer).split('').filter(l => options[l]).join('');
    }

    if (!stem) {
        if (!silent) alert('题干不能为空');
        return false;
    }
    if (!answer) {
        if (!silent) alert('答案无效：请填写有效选项字母（如 A 或 ABC）');
        return false;
    }

    const wasAi = q.aiSource === 'ai';
    const wasPending = !q.answer;
    // 保存前对齐题型与答案:答案是多个字母就必须是多选。
    // 否则会出现"单选 + 答案 AC"——刷题时按单选渲染(只能选一个字母)而永远判不对。
    // 先落值,再归一化 —— 顺序不能反:finalizeQuestion 要读的就是刚采集的 options/answer
    q.content = stem;
    q.options = options;
    q.answer = answer;
    q.explanation = editorExplanation.value.trim();
    q.analysis = editorAnalysis.value.trim();
    // 用户在下拉框里的选择是明确意图,打标记让 finalize 不要用答案长度覆盖它
    q._typeExplicit = true;
    q.type = type;
    finalizeQuestion(q);   // 归一化,并按答案长度纠正题型(多字母 → 多选)
    const finalType = q.type;
    // 人工保存 = 人工核验完成:撤销 AI 标记,并把消散的自动标记记入历史日志
    if (wasAi) {
        delete q.aiSource;
        pushHistMark(q, 'ai');
    }
    if (wasPending && q.answer) pushHistMark(q, 'pending');

    saveToLocalStorage();
    state.editorDirty = false;
    renderBankEditor();
    // 让下拉框反映真正落库的类型(被自动纠正时给出可见反馈)
    editorType.value = finalType;
    if (!silent) {
        alert(finalType !== type
            ? `已按答案自动改为「${finalType}」并保存`
            : '本题已保存');
    }
    return true;
}


// 关闭编辑器（清理未保存的空题）
export function editorClose() {
    if (!editorGuard()) return;
    const questions = currentEditBank();
    const kept = questions.filter(q => (q.content || '').trim() || (q.answer || '').trim());
    if (kept.length !== questions.length) {
        state.questionBanks[state.editBankName] = kept;
        if (state.currentBankName === state.editBankName) state.questionBank = kept;
        saveToLocalStorage();
        refreshQuestionBankView();
    }
    state.editBankName = null;
    state.editIndex = 0;
    state.editorDirty = false;
    state.editorPendingOnly = false;
    hideModal(editBankModal);
    updateBanksList();
}


// 编辑器内切换题目(开启"只看待补"时,在待补题之间跳转)
export function editorNavigate(delta) {
    const questions = currentEditBank();
    if (state.editorPendingOnly) {
        let target = state.editIndex + delta;
        while (target >= 0 && target < questions.length && questions[target].answer) target += delta;
        if (target < 0 || target >= questions.length) return;
        if (!editorGuard()) return;
        state.editIndex = target;
        renderBankEditor();
        return;
    }
    const target = state.editIndex + delta;
    if (target < 0 || target >= questions.length) return;
    if (!editorGuard()) return;
    state.editIndex = target;
    renderBankEditor();
}

// 切换"只看待补答案"筛选
export function editorTogglePendingOnly(checked) {
    state.editorPendingOnly = !!checked;
    const questions = currentEditBank();
    if (state.editorPendingOnly) {
        const firstPending = questions.findIndex(q => !q.answer);
        state.editIndex = firstPending >= 0 ? firstPending : 0;
    }
    renderBankEditor();
}


// 删除当前题
export function editorDeleteCurrent() {
    const questions = currentEditBank();
    if (questions.length === 0) return;
    if (state.editorDirty && !confirm('当前题目的修改尚未保存，确定放弃并删除吗？')) return;
    if (!confirm(`确定删除第 ${state.editIndex + 1} 题吗？此操作不可恢复！`)) return;
    questions.splice(state.editIndex, 1);
    saveToLocalStorage();
    state.editorDirty = false;
    if (state.editIndex >= questions.length) state.editIndex = Math.max(0, questions.length - 1);
    renderBankEditor();
    updateBanksList();
    updateBankSelect();
}


// 增删末尾选项
export function editorMutateOptions(delta) {
    if (editorType.value === '判断') return;
    const q = currentEditBank()[state.editIndex];
    if (!q) return;
    const opts = editorCollectOptions();
    const letters = Object.keys(opts).sort();
    if (delta > 0) {
        if (letters.length >= 8) {
            alert('选项最多 8 个（A-H）');
            return;
        }
        opts[String.fromCharCode(65 + letters.length)] = '';
    } else {
        if (letters.length <= 2) {
            alert('至少保留 2 个选项');
            return;
        }
        const removedLetter = letters[letters.length - 1];
        delete opts[removedLetter];
        editorAnswer.value = normalizeAnswerString(editorAnswer.value)
            .split('').filter(l => opts[l]).join('');
    }
    q.options = opts;
    state.editorDirty = true;
    editorRenderOptions();
}


// 渲染选项编辑行（判断题固定 A正确/B错误）
export function editorRenderOptions() {
    const q = currentEditBank()[state.editIndex];
    if (!q) return;

    editorOptions.innerHTML = '';
    if (editorType.value === '判断') {
        ['正确', '错误'].forEach((text, i) => {
            const row = document.createElement('div');
            row.className = 'editor-option-row';
            const label = document.createElement('span');
            label.className = 'editor-option-letter';
            label.textContent = i === 0 ? 'A' : 'B';
            const input = document.createElement('input');
            input.className = 'editor-option-input';
            input.value = text;
            input.disabled = true;
            row.appendChild(label);
            row.appendChild(input);
            editorOptions.appendChild(row);
        });
        editorAddOption.classList.add('hidden');
        editorRemoveOption.classList.add('hidden');
        return;
    }

    editorAddOption.classList.remove('hidden');
    editorRemoveOption.classList.remove('hidden');
    const source = (q.options && Object.keys(q.options).length > 0)
        ? q.options
        : { A: '', B: '', C: '', D: '' };
    Object.keys(source).sort().forEach(letter => {
        const row = document.createElement('div');
        row.className = 'editor-option-row';
        const label = document.createElement('span');
        label.className = 'editor-option-letter';
        label.textContent = letter;
        const input = document.createElement('input');
        input.className = 'editor-option-input';
        input.dataset.letter = letter;
        input.value = source[letter] || '';
        input.addEventListener('input', () => { state.editorDirty = true; });
        row.appendChild(label);
        row.appendChild(input);
        editorOptions.appendChild(row);
    });
}


// 渲染当前题表单
export function editorRenderForm() {
    const q = currentEditBank()[state.editIndex];
    if (!q) return;

    editorStem.value = q.content || '';
    editorType.value = q.type === '多选' ? '多选' : (q.type === '判断' ? '判断' : '单选');
    editorAnswer.value = q.answer || '';
    editorExplanation.value = q.explanation || '';
    editorAnalysis.value = q.analysis || '';
    editorRenderOptions();
    editorPosition.textContent = `第 ${state.editIndex + 1} / ${currentEditBank().length} 题`;
    state.editorDirty = false;

    // 列表选中态
    Array.from(editorQuestionList.children).forEach((el, idx) => {
        if (idx === state.editIndex) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}


// 从表单 DOM 收集当前选项
export function editorCollectOptions() {
    const opts = {};
    editorOptions.querySelectorAll('input.editor-option-input').forEach(inp => {
        if (!inp.disabled) opts[inp.dataset.letter] = inp.value;
    });
    return opts;
}


// 未保存修改守卫：返回 true 表示可以继续（已放弃或无修改）
export function editorGuard() {
    if (!state.editorDirty) return true;
    if (confirm('当前题目的修改尚未保存，确定放弃吗？')) {
        state.editorDirty = false;
        return true;
    }
    return false;
}


export function currentEditBank() {
    return (state.editBankName && state.questionBanks[state.editBankName]) || [];
}


// 重建当前题目视图：在"全部题库"合并视图下题库发生增删改后调用
export function refreshQuestionBankView() {
    if (!state.isAllBanksView) return;
    state.questionBank = [];
    Object.values(state.questionBanks).forEach(bank => {
        state.questionBank = [...state.questionBank, ...bank];
    });
}


// 更新题库列表

// ==================== 按库内嵌渲染(P0-1.9:错题归题库卡手风琴) ====================

// ==================== 题目卡片(错题 / 收藏 共用一套结构)====================
// 👤 定调 2026-09-11:错题卡与收藏卡**统一设计**,且题型/收藏/删除一律放在**题干上方一行**。
// 结构:`.q-card > .q-card-tags(题型 + 状态徽章 + 收藏 + 删除) + 题干 + 选项 + details(答案/解析)`。
// 与刷题页的 `.question-tags` 同一条规矩:标签行在题干之上、自成一行,不影响题干宽度。

// 题干上方那一行。返回元素,调用方自行 append 到卡片最前。
function buildCardTagRow(question, opts = {}) {
    const row = document.createElement('div');
    row.className = 'question-card-tags';

    // 题型:仍用 ［单选］ 全角括号文案(沿用原有约定,用户与测试都已熟悉)
    const type = document.createElement('span');
    type.className = 'error-type-line';
    type.textContent = `［${question.type || '未知'}］`;
    row.appendChild(type);

    // 状态徽章(收藏卡标"在错题本";错题卡标"已收藏"由按钮本身表达)
    if (opts.statusBadge) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = opts.statusBadge;
        row.appendChild(badge);
    }

    row.appendChild(buildFavoriteButton(question, opts.favoriteText));
    row.appendChild(buildDeleteButton(opts.onDelete));
    return row;
}

// 收藏按钮:两处卡片共用。onClick 缺省即"切换收藏",传入时用调用方的(收藏卡里就是取消收藏)
function buildFavoriteButton(question, text) {
    const isFav = state.favoriteQuestions.some(fq => fq.content === question.content);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'question-card-btn question-card-fav';
    btn.textContent = text !== undefined ? text : (isFav ? '★ 已收藏' : '☆ 收藏');
    btn.addEventListener('click', () => {
        toggleFavorite(question, question.bankName);
        // 跨模块通知:库卡内嵌面板需要整块重绘,但不允许互相 import(见架构铁律 4)
        if (typeof CustomEvent !== 'undefined' && document.dispatchEvent) {
            document.dispatchEvent(new CustomEvent('zquiz:embeds-dirty'));
        }
    });
    return btn;
}

// 删除按钮:onDelete 由调用方给(错题本=移出错题本;收藏=取消收藏)
function buildDeleteButton(onDelete) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'question-card-btn question-card-del';
    btn.textContent = '删除';
    if (onDelete) btn.addEventListener('click', onDelete);
    return btn;
}

// 判断题按对错展示、选择题给「A. 选项原文」(唯一展示入口)
function answerText(answer, question) {
    return answer ? formatAnswerForDisplay(answer, question) : '(未答)';
}

// 生成单个遮挡式错题条目:默认只显示题干;「查看答案」展开后红绿对比 + 解析
// index = 该错题在 state.errorQuestions 中的真实下标(删除用);bankName = 归属库
function buildErrorItem(question, index) {
    const item = document.createElement('div');
    item.className = 'question-card error-card';

    // 题型 + 收藏 + 删除:题干上方一行(👤 定调)
    item.appendChild(buildCardTagRow(question, {
        onDelete: () => {
            state.errorQuestions.splice(index, 1);
            saveToLocalStorage();
            updateBanksList();
        },
    }));

    const title = document.createElement('h4');
    title.textContent = question.content;
    item.appendChild(title);

    // 选项裸露:错题常是"选项没印象了",不列选项无法复盘(👤 反馈:错题本缺选项)
    // 注意**不标注哪个是用户选错的** —— 选错本身没有信息量,且会提前泄底;
    // 正确答案在下方 details 里,靠主动回忆遮挡。
    const optKeys = Object.keys(question.options || {}).sort();
    if (optKeys.length) {
        const opts = document.createElement('p');
        opts.className = 'error-options';
        opts.textContent = optKeys.map(k => `${k}. ${question.options[k]}`).join('　');
        item.appendChild(opts);
    }

    // 主动回忆遮挡:答案/解析藏进 details,展开才见红绿对比
    const reveal = document.createElement('details');
    reveal.className = 'answer-reveal';
    const summary = document.createElement('summary');
    summary.textContent = '查看答案';
    reveal.appendChild(summary);

    const yourAnswer = document.createElement('p');
    yourAnswer.className = 'your-answer';
    yourAnswer.textContent = `你的答案:${answerText(question.userAnswer, question)}`;
    reveal.appendChild(yourAnswer);

    const correctAnswer = document.createElement('p');
    correctAnswer.className = 'correct-answer';
    correctAnswer.textContent = `正确答案:${formatAnswerForDisplay(question.answer, question)}`;
    reveal.appendChild(correctAnswer);

    const analysis = document.createElement('p');
    analysis.textContent = `解析:${question.analysis || question.explanation || '暂无解析'}`;
    reveal.appendChild(analysis);
    item.appendChild(reveal);

    if ((question.correctStreak || 0) > 0 && state.masteryThreshold > 0) {
        const mastery = document.createElement('p');
        mastery.className = 'mastery-note';
        mastery.textContent = `已连对 ${question.correctStreak} 次,再答对 ${state.masteryThreshold - question.correctStreak} 次自动移出错题本`;
        item.appendChild(mastery);
    }

    return item;
}


// 某题库的错题手风琴面板(空库返回 null)
export function renderErrorsForBank(bankName) {
    const indices = [];
    state.errorQuestions.forEach((q, i) => {
        if ((q.bankName || '未知题库') === bankName) indices.push(i);
    });
    if (indices.length === 0) return null;
    const wrap = document.createElement('div');
    wrap.className = 'bank-errors-panel';
    const head = document.createElement('h4');
    head.className = 'bank-panel-title';
    head.textContent = `错题(${indices.length})`;
    wrap.appendChild(head);
    indices.forEach(i => wrap.appendChild(buildErrorItem(state.errorQuestions[i], i)));
    return wrap;
}

// 某题库的收藏面板(空返回 null)
export function renderFavoritesForBank(bankName) {
    const favs = state.favoriteQuestions.filter(fq => (fq.bankName || '未知题库') === bankName);
    if (favs.length === 0) return null;
    const wrap = document.createElement('div');
    wrap.className = 'bank-favorites-panel';
    const head = document.createElement('h4');
    head.className = 'bank-panel-title';
    head.textContent = `收藏(${favs.length})`;
    wrap.appendChild(head);
    favs.forEach(fq => wrap.appendChild(buildFavoriteItem(fq)));
    return wrap;
}

// 单个收藏条目。**与错题卡同一套结构与样式**(👤 定调:两卡统一),
// 差别只有:左条用收藏色、展开区多一行"正确答案"、下方多一个「取消收藏」。
function buildFavoriteItem(fq) {
    const item = document.createElement('div');
    item.className = 'question-card fav-item';

    const inErrors = state.errorQuestions.some(eq => eq.content === fq.content);
    item.appendChild(buildCardTagRow(fq, {
        statusBadge: inErrors ? '📕 在错题本' : '',
        onDelete: () => {
            toggleFavorite(fq, fq.bankName);
            if (typeof CustomEvent !== 'undefined' && document.dispatchEvent) {
                document.dispatchEvent(new CustomEvent('zquiz:embeds-dirty'));
            }
        },
    }));

    const title = document.createElement('h4');
    title.textContent = fq.content;
    item.appendChild(title);

    const optKeys = Object.keys(fq.options || {}).sort();
    if (optKeys.length) {
        const opts = document.createElement('p');
        opts.className = 'error-options';
        opts.textContent = optKeys.map(k => `${k}. ${fq.options[k]}`).join('　');
        item.appendChild(opts);
    }

    // 与错题卡一样走主动回忆遮挡:先自己回忆,再展开对答案
    const reveal = document.createElement('details');
    reveal.className = 'answer-reveal';
    const summary = document.createElement('summary');
    summary.textContent = '查看答案';
    reveal.appendChild(summary);

    const correctAnswer = document.createElement('p');
    correctAnswer.className = 'correct-answer';
    correctAnswer.textContent = `正确答案:${answerText(fq.answer, fq)}`;
    reveal.appendChild(correctAnswer);

    const analysis = document.createElement('p');
    analysis.textContent = `解析:${fq.analysis || fq.explanation || '暂无解析'}`;
    reveal.appendChild(analysis);
    item.appendChild(reveal);

    return item;
}

export function updateBanksList() {
    const bankNames = Object.keys(state.questionBanks);

    if (bankNames.length === 0) {
        banksList.innerHTML = '<p class="empty-message">暂无题库:点右上角「＋ 创建题库」,或回首页导入</p>';
        return;
    }

    banksList.innerHTML = '';

    bankNames.forEach(bankName => {
        const questions = state.questionBanks[bankName] || [];
        const errCount = state.errorQuestions.filter(q => (q.bankName || '未知题库') === bankName).length;
        const favCount = state.favoriteQuestions.filter(q => (q.bankName || '未知题库') === bankName).length;
        const pendingCount = questions.filter(q => !q.answer).length;

        const bankItem = document.createElement('div');
        bankItem.className = 'bank-item';

        // 标题行:库名 + 状态徽章
        // 左上:库名 + 状态徽章
        const bankInfo = document.createElement('div');
        bankInfo.className = 'bank-info';
        const bankTitle = document.createElement('h3');
        bankTitle.textContent = bankName;
        bankInfo.appendChild(bankTitle);
        const badges = document.createElement('div');
        badges.className = 'bank-badges';
        const mkBadge = (text, cls) => { const b = document.createElement('span'); b.className = 'badge ' + (cls || ''); b.textContent = text; badges.appendChild(b); };
        mkBadge(`${questions.length} 题`);
        if (pendingCount > 0) mkBadge(`待补 ${pendingCount}`, 'warn-badge');
        if (errCount > 0) mkBadge(`错 ${errCount}`, 'err-badge');
        if (favCount > 0) mkBadge(`藏 ${favCount}`, 'fav-badge');
        bankInfo.appendChild(badges);

        // 右上:编辑(「开始刷题」已移出题库页;刷题入口统一在刷题页的"题源/选择题库")
        const bankActions = document.createElement('div');
        bankActions.className = 'bank-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn small secondary';
        editBtn.textContent = '✎ 编辑';
        editBtn.addEventListener('click', () => editBank(bankName));
        bankActions.appendChild(editBtn);

        // 左下:错题按钮;右下:收藏按钮
        const cardFoot = document.createElement('div');
        cardFoot.className = 'bank-card-foot';

        const errToggle = document.createElement('button');
        errToggle.className = 'foot-toggle' + (state.expandedBanks['err:' + bankName] ? ' open' : '');
        errToggle.innerHTML = `📕 错题 <b>${errCount}</b>`;
        errToggle.addEventListener('click', () => {
            const open = !state.expandedBanks['err:' + bankName];
            state.expandedBanks['err:' + bankName] = open;
            if (open) state.expandedBanks['fav:' + bankName] = false;  // 互斥:收起收藏
            saveCollapsedBanks();
            updateBanksList();
        });
        cardFoot.appendChild(errToggle);

        const favToggle = document.createElement('button');
        favToggle.className = 'foot-toggle fav' + (state.expandedBanks['fav:' + bankName] ? ' open' : '');
        favToggle.innerHTML = `⭐ 收藏 <b>${favCount}</b>`;
        favToggle.addEventListener('click', () => {
            const open = !state.expandedBanks['fav:' + bankName];
            state.expandedBanks['fav:' + bankName] = open;
            if (open) state.expandedBanks['err:' + bankName] = false;  // 互斥:收起错题
            saveCollapsedBanks();
            updateBanksList();
        });
        cardFoot.appendChild(favToggle);

        bankItem.appendChild(bankInfo);
        bankItem.appendChild(bankActions);
        bankItem.appendChild(cardFoot);

        banksList.appendChild(bankItem);

        // 展开面板(默认折叠):错题在下、收藏在其下,仅点了对应按钮才出现
        if (state.expandedBanks['err:' + bankName]) {
            const errPanel = renderErrorsForBank(bankName);
            if (errPanel) banksList.appendChild(errPanel);
            else {
                const empty = document.createElement('p');
                empty.className = 'empty-message';
                empty.textContent = '本库暂无错题 🎉';
                banksList.appendChild(empty);
            }
        }
        if (state.expandedBanks['fav:' + bankName]) {
            const favPanel = renderFavoritesForBank(bankName);
            if (favPanel) banksList.appendChild(favPanel);
            else {
                const empty = document.createElement('p');
                empty.className = 'empty-message';
                empty.textContent = '本库暂无收藏';
                banksList.appendChild(empty);
            }
        }
        const verPanel = renderVersionsForBank(bankName);
        if (verPanel) banksList.appendChild(verPanel);
    });

    // 杂项兜底:错题/收藏的 bankName 已不在题库列表(库被删等)
    const liveNames = new Set(bankNames);
    const miscNames = new Set();
    state.errorQuestions.forEach(q => { const n = q.bankName || '未知题库'; if (!liveNames.has(n)) miscNames.add(n); });
    state.favoriteQuestions.forEach(q => { const n = q.bankName || '未知题库'; if (!liveNames.has(n)) miscNames.add(n); });
    miscNames.forEach(name => {
        const miscItem = document.createElement('div');
        miscItem.className = 'bank-item misc-bank';
        const info = document.createElement('div');
        info.className = 'bank-info';
        const t = document.createElement('h3');
        t.textContent = `杂项 · ${name}`;
        info.appendChild(t);
        miscItem.appendChild(info);
        miscItem.addEventListener('click', () => {
            state.expandedBanks['misc:' + name] = !state.expandedBanks['misc:' + name];
            saveCollapsedBanks();
            updateBanksList();
        });
        banksList.appendChild(miscItem);
        if (state.expandedBanks['misc:' + name]) {
            const errPanel = renderErrorsForBank(name);
            if (errPanel) banksList.appendChild(errPanel);
            const favPanel = renderFavoritesForBank(name);
            if (favPanel) banksList.appendChild(favPanel);
        }
    });

    if (typeof window !== 'undefined' && !window.__embedsListener) {
        window.__embedsListener = true;  // 仅浏览器注册(vm 沙箱无 window)
        document.addEventListener('zquiz:embeds-dirty', () => updateBanksList());
    }
}// ==================== 库级版本快照 UI(P0-1.11) ====================

function renderVersionsForBank(bankName) {
    const versions = (loadBankVersions()[bankName] || []).slice().reverse();  // 新的在上
    if (versions.length === 0) return null;
    const wrap = document.createElement('div');
    wrap.className = 'bank-versions-panel';
    const head = document.createElement('h4');
    head.className = 'bank-panel-title';
    head.textContent = `🕘 版本(${versions.length})`;
    wrap.appendChild(head);
    versions.forEach(v => {
        const item = document.createElement('div');
        item.className = 'version-item';
        const when = new Date(v.time);
        const info = document.createElement('span');
        info.textContent = `${v.action} · ${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')} · ${(v.questions || []).length} 题`;
        item.appendChild(info);
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'action-btn small';
        restoreBtn.textContent = '恢复此版';
        restoreBtn.addEventListener('click', () => {
            const current = state.questionBanks[bankName] || [];
            if (confirm(`将"${bankName}"恢复到「${v.action}」版本?当前内容会先自动存为新版本。`)) {
                pushBankVersion(bankName, '恢复前自动存', current);
                state.questionBanks[bankName] = JSON.parse(JSON.stringify(v.questions));
                saveToLocalStorage();
                refreshQuestionBankView();
                updateBanksList();
            }
        });
        item.appendChild(restoreBtn);
        wrap.appendChild(item);
    });
    return wrap;
}

// ==================== 回收站 UI(P0-1.10) ====================

export function renderRecycleBin() {
    const list = document.getElementById('recycle-list');
    const binWrap = document.getElementById('recycle-bin');
    if (!list || !binWrap) return;
    const bin = loadRecycledBanks();
    const entries = Object.entries(bin).sort((a, b) => (b[1].deletedAt || '').localeCompare(a[1].deletedAt || ''));
    binWrap.querySelector('summary').textContent = `🗑 回收站 (${entries.length})`;
    list.innerHTML = '';
    if (entries.length === 0) {
        list.innerHTML = '<p class="empty-message">回收站为空</p>';
        return;
    }
    entries.forEach(([name, pkg]) => {
        const item = document.createElement('div');
        item.className = 'recycle-item';
        const when = new Date(pkg.deletedAt);
        const info = document.createElement('span');
        info.textContent = `${name} · ${((pkg.bank) || []).length} 题 · ${when.getMonth() + 1}/${when.getDate()} 删除`;
        item.appendChild(info);
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'action-btn small';
        restoreBtn.textContent = '恢复';
        restoreBtn.addEventListener('click', () => restoreRecycled(name));
        const purgeBtn = document.createElement('button');
        purgeBtn.className = 'action-btn small secondary';
        purgeBtn.textContent = '彻底删除';
        purgeBtn.addEventListener('click', () => {
            if (confirm(`彻底删除"${name}"?此操作不可恢复!`)) {
                purgeRecycledBank(name);
                renderRecycleBin();
            }
        });
        item.appendChild(restoreBtn);
        item.appendChild(purgeBtn);
        list.appendChild(item);
    });
}

export function restoreBankVersion(name, index) {
    const versions = loadBankVersions()[name] || [];
    const v = versions[index];
    if (!v) return false;
    pushBankVersion(name, '恢复前自动存', state.questionBanks[name] || []);
    state.questionBanks[name] = JSON.parse(JSON.stringify(v.questions));
    // 先对齐当前视图引用,再落盘(否则旧引用会把恢复结果覆盖回去)
    if (state.currentBankName === name) state.questionBank = state.questionBanks[name];
    saveToLocalStorage();
    refreshQuestionBankView();
    updateBanksList();
    return true;
}

export function recycleBankEntry(name, pkg) {
    return recycleBank(name, pkg);
}

export function restoreRecycled(name) {
    let target = name;
    if (state.questionBanks[target]) target = `${name}·恢复`;
    const pkg = restoreRecycledBank(name);
    if (!pkg) return;
    state.questionBanks[target] = pkg.bank || [];
    (pkg.errors || []).forEach(e => { e.bankName = target; state.errorQuestions.push(e); });
    (pkg.favorites || []).forEach(f => { f.bankName = target; state.favoriteQuestions.push(f); });
    saveToLocalStorage();
    updateBankSelect();
    updateBanksList();
    renderRecycleBin();
    alert(`已恢复为"${target}"`);
}


// 导出单个题库
function pushHistMark(q, type) {
    if (!q) return;
    q.histMarks = Array.isArray(q.histMarks) ? q.histMarks : [];
    if (q.histMarks.some(m => m.type === type)) return;
    q.histMarks.push({ type, time: new Date().toISOString() });
}


// 行内渲染:走事件委托,innerHTML 重建不丢监听
function renderEditorHistRow(q) {
    const row = document.getElementById('editor-hist-row');
    if (!row) return;
    const marks = (q && Array.isArray(q.histMarks)) ? q.histMarks : [];
    if (marks.length === 0) {
        row.innerHTML = '';
        row.style.display = 'none';
        return;
    }
    row.style.display = '';
    const label = { ai: '🤖 曾 AI 整理', pending: '⏳ 曾待补' };
    row.innerHTML = marks.map((m, i) =>
        `<span class="hist-chip">${label[m.type] || m.type}<button type="button" data-hist-del="${i}" title="删除这条历史标记">×</button></span>`
    ).join('');
}

// 委托处理:删除某条历史标记(即时生效并落盘)
export function editorHistClick(e) {
    const target = e && e.target;
    if (!target || target.dataset.histDel === undefined) return;
    const questions = currentEditBank();
    const q = questions[state.editIndex];
    if (!q || !Array.isArray(q.histMarks)) return;
    q.histMarks.splice(parseInt(target.dataset.histDel, 10), 1);
    if (q.histMarks.length === 0) delete q.histMarks;
    saveToLocalStorage();
    renderEditorHistRow(q);
}

export function renderBankEditor() {
    const questions = currentEditBank();
    const pendingOnly = !!state.editorPendingOnly;

    editorQuestionList.innerHTML = '';
    questions.forEach((q, idx) => {
        if (pendingOnly && q.answer) return; // 只看待补
        const item = document.createElement('button');
        item.type = 'button';
        // 待修改高亮:缺答案(待补)或选项不足的题,橙底标记;AI 标记:紫条 🤖(与预览同色系)
        const needsFix = !q.answer || Object.keys(q.options || {}).length < 2;
        const aiTouched = q.aiSource === 'ai';
        const hasHist = Array.isArray(q.histMarks) && q.histMarks.length > 0;
        item.className = 'editor-list-item' + (idx === state.editIndex ? ' selected' : '') + (needsFix ? ' needs-fix' : '') + (aiTouched ? ' ai-gen' : '');
        item.textContent = `${idx + 1}. ` + (aiTouched ? '🤖 ' : '') + `${(q.content || '（无题干）').slice(0, 22)}` + (!q.answer ? ' ⏳' : (needsFix ? ' ⚠' : '')) + (hasHist ? ' 🕘' : '');
        item.addEventListener('click', () => {
            if (!editorGuard()) return;
            state.editIndex = idx;
            renderBankEditor();
        });
        editorQuestionList.appendChild(item);
    });

    if (questions.length === 0 || !questions[state.editIndex]) {
        editorForm.classList.add('hidden');
        editorEmpty.classList.remove('hidden');
        editorPosition.textContent = pendingOnly ? '没有待补答案的题目 🎉' : '';
        return;
    }
    editorForm.classList.remove('hidden');
    editorEmpty.classList.add('hidden');
    const cur = questions[state.editIndex];
    renderEditorHistRow(cur);
    const aiNoteEl = document.getElementById('editor-ai-note');
    if (aiNoteEl) {
        const aiTouched = cur && cur.aiSource === 'ai';
        const fixes = [];
        if (cur && !cur.answer) fixes.push('缺答案（待补）');
        if (cur && Object.keys(cur.options || {}).length < 2) fixes.push('选项不足');
        const lines = [];
        if (aiTouched) lines.push({ text: '🤖 此题经 AI 整理导入；保存修改后标记自动消除', cls: 'editor-ai-note' });
        if (fixes.length) lines.push({ text: '⚠ 此题' + fixes.join('、') + '；补全并保存后黄色高亮自动消失', cls: 'editor-ai-note fix-note' });
        // 双状态并存(AI 整理但仍缺答案)时,两行提示都显示
        aiNoteEl.innerHTML = lines.map(l => `<div class="${l.cls}">${l.text}</div>`).join('');
        aiNoteEl.className = lines.length ? 'editor-ai-note stacked' : 'editor-ai-note';
    }
    editorRenderForm();
}


// 粘贴事件：优先按富文本 HTML 读取（保留段落/表格结构），纯文本走默认行为
export function handlePasteEvent(event) {
    const html = event.clipboardData && event.clipboardData.getData('text/html');
    if (!html) return;
    event.preventDefault();
    pasteInput.value = htmlToLines(html).join('\n');
    showImportStatus('已按富文本结构读取剪贴板内容', 'success');
}
