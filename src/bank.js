import { state } from './state.js';
import { finalizeQuestion, formatQuestionsForExport, normalizeAnswerString, parseQuestionsText, questionDedupKey } from './parser.js';
import { saveToLocalStorage } from './storage.js';
import { downloadFile, hideModal, showModal } from './dom.js';

// ==================== bank.js ====================
// 自动拆分自 main.js;依赖方向见各 import。


const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
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

// 导入题目
export function importQuestions() {
    const file = fileInput.files[0];
    if (!file) {
        showImportStatus('请先选择一个文件', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const content = event.target.result;
        const importedQuestions = parseQuestionsText(content);

        if (importedQuestions.length === 0) {
            showImportStatus('导入失败：文件中没有找到有效的题目', 'error');
            return;
        }

        // 解析结果先进入预览向导，由用户确认后再导入
        updatePreviewTargetBanks();
        openImportPreview(importedQuestions);
    };

    reader.readAsText(file);
}


// 处理文件选择
export function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        fileName.textContent = file.name;
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


export function parsePastedText() {
    const text = pasteInput.value;
    if (!text.trim()) {
        showImportStatus('请先粘贴题目内容', 'error');
        return;
    }
    const importedQuestions = parseQuestionsText(text);
    if (importedQuestions.length === 0) {
        showImportStatus('没有解析出有效题目，请检查内容格式', 'error');
        return;
    }
    updatePreviewTargetBanks();
    openImportPreview(importedQuestions);
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


// 显示导入状态
export function showImportStatus(message, type) {
    importStatus.textContent = message;
    importStatus.className = 'status-message';
    importStatus.classList.add(type);
    
    // 3秒后隐藏状态消息
    setTimeout(() => {
        importStatus.className = 'status-message';
    }, 3000);
}


// 打开预览：questions 为解析结果数组
export function openImportPreview(questions) {
    state.previewData = questions.map(q => ({ q, include: true, warnings: [] }));
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

    let warnCount = 0;
    state.previewData.forEach((item, idx) => {
        const q = item.q;
        const warnings = [];
        if (!q.answer) warnings.push('缺答案');
        if (Object.keys(q.options).length < 2) warnings.push('选项不足');
        if (bankKeys.has(questionDedupKey(q))) warnings.push('与现有题库重复');
        if ((q.confidence || 0) < 0.6) warnings.push('低置信度');
        item.warnings = warnings;
        if (warnings.length) warnCount++;

        const box = document.createElement('div');
        box.className = 'preview-item' + (warnings.length ? ' warn' : '');

        const head = document.createElement('div');
        head.className = 'preview-item-head';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = item.include;
        chk.addEventListener('change', () => { item.include = chk.checked; updatePreviewSummary(); });
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

        const conf = document.createElement('span');
        conf.className = 'preview-conf';
        conf.textContent = `${Math.round((q.confidence || 0) * 100)}%`;
        head.appendChild(conf);
        box.appendChild(head);

        const stem = document.createElement('textarea');
        stem.className = 'preview-stem';
        stem.rows = 2;
        stem.value = q.content;
        stem.addEventListener('input', () => { q.content = stem.value; });
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
        ansInput.addEventListener('input', () => { q.answer = ansInput.value; });
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

    updatePreviewSummary(warnCount);
}


export function togglePreviewSelectAll() {
    state.previewData.forEach(i => { i.include = previewSelectAll.checked; });
    renderPreview();
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
        !confirm(`确定清空题库"${targetName}"并导入新题目吗？此操作不可恢复！`)) {
        return;
    }

    // 收集勾选且有答案的题（重新规范化保证答案/题型一致）
    const items = [];
    const seen = new Set();
    let droppedNoAnswer = 0;
    for (const item of state.previewData) {
        if (!item.include) continue;
        const clone = JSON.parse(JSON.stringify(item.q));
        const finalized = finalizeQuestion(clone);
        if (!finalized) continue;
        if (!finalized.answer) { droppedNoAnswer++; continue; }
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
        alert(droppedNoAnswer > 0
            ? `没有可导入的题目：${droppedNoAnswer} 题缺少答案，请在预览中补填答案后重试`
            : '没有可导入的题目（均与目标题库重复）');
        return;
    }

    if (overwrite) {
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
    fileInput.value = '';
    fileName.textContent = '未选择文件';
    pasteInput.value = '';

    const dupeNote = (items.length - finalItems.length) > 0 ? `（跳过 ${items.length - finalItems.length} 题重复）` : '';
    showImportStatus(`成功导入 ${finalItems.length} 道题目到题库：${targetName}${dupeNote}`, 'success');
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
    if (!confirm(`确定要删除题库"${bankName}"吗？此操作不可恢复！`)) {
        return;
    }

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

    alert('题库删除成功');
}


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

    q.content = stem;
    q.type = type;
    q.options = options;
    q.answer = answer;
    q.explanation = editorExplanation.value.trim();
    q.analysis = editorAnalysis.value.trim();

    saveToLocalStorage();
    state.editorDirty = false;
    renderBankEditor();
    if (!silent) alert('本题已保存');
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
    hideModal(editBankModal);
    updateBanksList();
}


// 编辑器内切换题目
export function editorNavigate(delta) {
    const questions = currentEditBank();
    const target = state.editIndex + delta;
    if (target < 0 || target >= questions.length) return;
    if (!editorGuard()) return;
    state.editIndex = target;
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
export function updateBanksList() {
    const bankNames = Object.keys(state.questionBanks);

    if (bankNames.length === 0) {
        banksList.innerHTML = '<p class="empty-message">暂无题库</p>';
        return;
    }

    banksList.innerHTML = '';

    bankNames.forEach(bankName => {
        const bankItem = document.createElement('div');
        bankItem.className = 'bank-item';

        const bankInfo = document.createElement('div');
        bankInfo.className = 'bank-info';

        const bankTitle = document.createElement('h3');
        bankTitle.textContent = bankName;

        const bankCount = document.createElement('p');
        const questions = state.questionBanks[bankName] || [];
        bankCount.textContent = `题目数量：${questions.length}`;

        const bankActions = document.createElement('div');
        bankActions.className = 'bank-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn secondary';
        editBtn.textContent = '编辑';
        editBtn.addEventListener('click', () => editBank(bankName));

        const renameBtn = document.createElement('button');
        renameBtn.className = 'action-btn secondary';
        renameBtn.textContent = '重命名';
        renameBtn.addEventListener('click', () => showRenameModal(bankName));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn secondary';
        deleteBtn.style.backgroundColor = '#dc3545';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => deleteBank(bankName));

        const exportBtn = document.createElement('button');
        exportBtn.className = 'action-btn secondary';
        exportBtn.textContent = '导出';
        exportBtn.addEventListener('click', () => exportBank(bankName));

        const dedupBtn = document.createElement('button');
        dedupBtn.className = 'action-btn secondary';
        dedupBtn.textContent = '去重';
        dedupBtn.addEventListener('click', () => dedupBank(bankName));

        bankActions.appendChild(editBtn);
        bankActions.appendChild(renameBtn);
        bankActions.appendChild(dedupBtn);
        bankActions.appendChild(deleteBtn);
        bankActions.appendChild(exportBtn);

        bankInfo.appendChild(bankTitle);
        bankInfo.appendChild(bankCount);

        bankItem.appendChild(bankInfo);
        bankItem.appendChild(bankActions);

        banksList.appendChild(bankItem);
    });
}


// 渲染编辑器整体（题目列表 + 当前题表单）
export function renderBankEditor() {
    const questions = currentEditBank();

    editorQuestionList.innerHTML = '';
    questions.forEach((q, idx) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'editor-list-item' + (idx === state.editIndex ? ' selected' : '');
        item.textContent = `${idx + 1}. ${(q.content || '（无题干）').slice(0, 22)}`;
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
        editorPosition.textContent = '';
        return;
    }
    editorForm.classList.remove('hidden');
    editorEmpty.classList.add('hidden');
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
