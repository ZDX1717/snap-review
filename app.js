// 通用大学生刷题系统 JavaScript 代码

// 全局变量
let questionBanks = {}; // 多个题库，key为题库名，value为题目数组
let questionBank = []; // 当前题库（向后兼容）
let errorQuestions = []; // 错题本
let currentQuiz = []; // 当前刷题的题目列表
let currentQuestionIndex = 0; // 当前题目索引
let quizMode = 'immediate'; // 作答方式：'immediate' 逐题模式 | 'exam' 套题模式
let userAnswers = []; // 每题作答记录（下标与 currentQuiz 对应）
let masteryRemovedInSession = 0; // 本轮刷题中因连对达标而移出错题本的题数
let favoriteQuestions = []; // 收藏夹（手动精选的题目）
let correctCount = 0; // 正确题数
let wrongCount = 0; // 错误题数
let isAnswered = false; // 是否已回答当前题
let currentBankName = '默认题库'; // 当前题库名称
let isAllBanksView = false; // 是否处于"全部题库"合并视图（此时 questionBank 是临时合并结果）

// DOM 元素
const btnHome = document.getElementById('btn-home');
const btnQuiz = document.getElementById('btn-quiz');
const btnErrors = document.getElementById('btn-errors');
const homeSection = document.getElementById('home-section');
const quizSection = document.getElementById('quiz-section');
const errorsSection = document.getElementById('errors-section');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const fileName = document.getElementById('file-name');
const importBtn = document.getElementById('import-btn');
const importStatus = document.getElementById('import-status');
const startQuizBtn = document.getElementById('start-quiz-btn');
const quizStatus = document.getElementById('quiz-status');
const quizContainer = document.getElementById('quiz-container');
const questionNumber = document.getElementById('question-number');
const questionType = document.getElementById('question-type');
const questionText = document.getElementById('question-text');
const questionExplanation = document.getElementById('question-explanation');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const nextQuestionBtn = document.getElementById('next-question-btn');
const endQuizBtn = document.getElementById('end-quiz-btn');
const answerFeedback = document.getElementById('answer-feedback');
const answerResult = document.getElementById('answer-result');
const answerExplanation = document.getElementById('answer-explanation');
const quizResult = document.getElementById('quiz-result');
const totalQuestions = document.getElementById('total-questions');
const correctAnswers = document.getElementById('correct-answers');
const wrongAnswers = document.getElementById('wrong-answers');
const accuracy = document.getElementById('accuracy');
const backToOptionsBtn = document.getElementById('back-to-options-btn');
const clearErrorsBtn = document.getElementById('clear-errors-btn');
const reviewErrorsBtn = document.getElementById('review-errors-btn');
const toggleAllBanksBtn = document.getElementById('toggle-all-banks-btn');
const errorsList = document.getElementById('errors-list');
const questionBankSelect = document.getElementById('question-bank-select');
const quizSettings = document.getElementById('quiz-settings');
const btnManage = document.getElementById('btn-manage');
const manageSection = document.getElementById('manage-section');
const createBankBtn = document.getElementById('create-bank-btn');
const exportAllBtn = document.getElementById('export-all-btn');
const exportCurrentBtn = document.getElementById('export-current-btn');
const banksList = document.getElementById('banks-list');
const createBankModal = document.getElementById('create-bank-modal');
const renameBankModal = document.getElementById('rename-bank-modal');
const newBankNameInput = document.getElementById('new-bank-name');
const renameBankNameInput = document.getElementById('rename-bank-name');
const confirmCreateBankBtn = document.getElementById('confirm-create-bank-btn');
const cancelCreateBankBtn = document.getElementById('cancel-create-bank-btn');
const confirmRenameBankBtn = document.getElementById('confirm-rename-bank-btn');
const cancelRenameBankBtn = document.getElementById('cancel-rename-bank-btn');
let currentRenameBank = null; // 当前正在重命名的题库名

// 粘贴导入与预览向导
const pasteInput = document.getElementById('paste-input');
const pasteParseBtn = document.getElementById('paste-parse-btn');
const pasteClearBtn = document.getElementById('paste-clear-btn');
const importPreviewModal = document.getElementById('import-preview-modal');
const previewSummary = document.getElementById('preview-summary');
const previewSelectAll = document.getElementById('preview-select-all');
const previewSkipDupes = document.getElementById('preview-skip-dupes');
const previewList = document.getElementById('preview-list');
const previewTargetBankSelect = document.getElementById('preview-target-bank');
const previewOverwrite = document.getElementById('preview-overwrite');
const previewConfirmBtn = document.getElementById('preview-confirm-btn');
const previewCancelBtn = document.getElementById('preview-cancel-btn');
let previewData = []; // 预览中的待导入题目

// 套题模式与答题回顾
const prevQuestionBtn = document.getElementById('prev-question-btn');
const unansweredCountEl = document.getElementById('unanswered-count');
const answerReview = document.getElementById('answer-review');
const reviewOnlyWrong = document.getElementById('review-only-wrong');
const masteryNote = document.getElementById('mastery-note');
const favoriteBtn = document.getElementById('favorite-btn');
const btnFavorites = document.getElementById('btn-favorites');
const favoritesList = document.getElementById('favorites-list');
const reviewFavoritesBtn = document.getElementById('review-favorites-btn');
const masteryThresholdSelect = document.getElementById('mastery-threshold-select');
// 复习范围选择
const reviewScopeModal = document.getElementById('review-scope-modal');
const scopeBanks = document.getElementById('scope-banks');
const scopeSummary = document.getElementById('scope-summary');
const confirmReviewScopeBtn = document.getElementById('confirm-review-scope-btn');
const cancelReviewScopeBtn = document.getElementById('cancel-review-scope-btn');
// 题库编辑器
const editBankModal = document.getElementById('edit-bank-modal');
const editBankTitle = document.getElementById('edit-bank-title');
const editorQuestionList = document.getElementById('editor-question-list');
const editorForm = document.getElementById('editor-form');
const editorEmpty = document.getElementById('editor-empty');
const editorAddBtn = document.getElementById('editor-add-btn');
const editorStem = document.getElementById('editor-stem');
const editorType = document.getElementById('editor-type');
const editorAnswer = document.getElementById('editor-answer');
const editorOptions = document.getElementById('editor-options');
const editorAddOption = document.getElementById('editor-add-option');
const editorRemoveOption = document.getElementById('editor-remove-option');
const editorExplanation = document.getElementById('editor-explanation');
const editorAnalysis = document.getElementById('editor-analysis');
const editorPrevBtn = document.getElementById('editor-prev-btn');
const editorNextBtn = document.getElementById('editor-next-btn');
const editorDeleteBtn = document.getElementById('editor-delete-btn');
const editorSaveBtn = document.getElementById('editor-save-btn');
const editorCloseBtn = document.getElementById('editor-close-btn');
const editorPosition = document.getElementById('editor-position');
let editBankName = null;  // 正在编辑的题库名
let editIndex = 0;        // 正在编辑的题目下标
let editorDirty = false;  // 表单是否有未保存修改

// 首页快捷入口
const heroStartBtn = document.getElementById('hero-start-btn');
const heroImportBtn = document.getElementById('hero-import-btn');

// 初始化
function init() {
    // 加载本地存储的数据
    loadFromLocalStorage();
    loadCollapsedBanks();
    loadMasterySetting();

    // 更新题库选择下拉框
    updateBankSelect();

    // 初始状态下拉框与实际加载的题库保持一致
    // （页面默认显示"全部题库"，但初始数据只加载了第一个题库，二者必须一致）
    if (Object.keys(questionBanks).length > 0) {
        isAllBanksView = false;
        questionBankSelect.value = currentBankName;
    }
    
    // 设置事件监听器
    setupEventListeners();
    
    // 显示首页
    showSection('home');
}

// 从本地存储加载数据
function loadFromLocalStorage() {
    // 容错：存储数据损坏时重置对应部分，而不是让整个应用崩溃
    try {
        const savedBanks = localStorage.getItem('questionBanks');
        if (savedBanks) {
            const parsed = JSON.parse(savedBanks);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                questionBanks = parsed;
                // 加载第一个题库作为当前题库
                const bankNames = Object.keys(questionBanks);
                if (bankNames.length > 0) {
                    currentBankName = bankNames[0];
                    questionBank = questionBanks[currentBankName];
                }
            }
        } else {
            // 向后兼容：如果有旧的questionBank数据，迁移到新的结构
            const savedQuestions = localStorage.getItem('questionBank');
            if (savedQuestions) {
                const parsedQuestions = JSON.parse(savedQuestions);
                if (Array.isArray(parsedQuestions)) {
                    questionBank = parsedQuestions;
                    questionBanks[currentBankName] = questionBank;
                }
            }
        }
    } catch (e) {
        console.error('题库数据损坏，已重置：', e);
        localStorage.removeItem('questionBanks');
        localStorage.removeItem('questionBank');
        questionBanks = {};
        questionBank = [];
    }

    try {
        const savedErrors = localStorage.getItem('errorQuestions');
        if (savedErrors) {
            const parsedErrors = JSON.parse(savedErrors);
            if (Array.isArray(parsedErrors)) {
                errorQuestions = parsedErrors;
            }
        }
    } catch (e) {
        console.error('错题本数据损坏，已重置：', e);
        localStorage.removeItem('errorQuestions');
        errorQuestions = [];
    }

    try {
        const savedFavorites = localStorage.getItem('favoriteQuestions');
        if (savedFavorites) {
            const parsedFavorites = JSON.parse(savedFavorites);
            if (Array.isArray(parsedFavorites)) {
                favoriteQuestions = parsedFavorites;
            }
        }
    } catch (e) {
        console.error('收藏数据损坏，已重置：', e);
        localStorage.removeItem('favoriteQuestions');
        favoriteQuestions = [];
    }
}

// 保存数据到本地存储
function saveToLocalStorage() {
    // 仅在选定具体题库时回写当前题库，
    // 避免"全部题库"合并视图把合并结果覆盖写进某个真实题库（数据污染）
    if (!isAllBanksView) {
        questionBanks[currentBankName] = questionBank;
    }
    localStorage.setItem('questionBanks', JSON.stringify(questionBanks));
    localStorage.setItem('errorQuestions', JSON.stringify(errorQuestions));
    localStorage.setItem('favoriteQuestions', JSON.stringify(favoriteQuestions));
}

// 设置事件监听器
function setupEventListeners() {
    // 导航按钮
    btnHome.addEventListener('click', () => showSection('home'));
    btnQuiz.addEventListener('click', () => showSection('quiz'));
    btnErrors.addEventListener('click', () => showSection('errors'));
    btnManage.addEventListener('click', () => showSection('manage'));
    
    // 文件上传
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    importBtn.addEventListener('click', importQuestions);

    // 题库选择变化
    questionBankSelect.addEventListener('change', function() {
        const selectedBank = this.value;
        if (selectedBank === 'all') {
            // 合并所有题库为临时视图（此视图下保存时不会回写题库数据）
            isAllBanksView = true;
            questionBank = [];
            Object.values(questionBanks).forEach(bank => {
                questionBank = [...questionBank, ...bank];
            });
        } else {
            // 选择特定题库
            isAllBanksView = false;
            currentBankName = selectedBank;
            questionBank = questionBanks[selectedBank];
        }
    });
    
    // 刷题
    startQuizBtn.addEventListener('click', startQuiz);
    submitAnswerBtn.addEventListener('click', submitAnswer);
    nextQuestionBtn.addEventListener('click', nextQuestion);
    endQuizBtn.addEventListener('click', endQuiz);
    backToOptionsBtn.addEventListener('click', backToQuizOptions);
    
    // 错题本
    clearErrorsBtn.addEventListener('click', clearErrors);
    reviewErrorsBtn.addEventListener('click', reviewErrors);
    toggleAllBanksBtn.addEventListener('click', toggleAllBanks);

    // 收藏夹
    btnFavorites.addEventListener('click', () => showSection('favorites'));
    reviewFavoritesBtn.addEventListener('click', reviewFavorites);
    favoriteBtn.addEventListener('click', toggleFavoriteCurrent);

    // 错题移出规则设置
    masteryThresholdSelect.addEventListener('change', function() {
        masteryThreshold = parseInt(this.value, 10) || 0;
        localStorage.setItem('masteryThresholdSetting', String(masteryThreshold));
        updateErrorsList();
    });

    // 复习范围选择
    confirmReviewScopeBtn.addEventListener('click', () => {
        const { banks, types } = getScopeSelection();
        const questions = errorQuestions.filter(
            q => banks.has(q.bankName || '未知题库') && types.has(q.type)
        );
        if (questions.length === 0) {
            alert('所选范围内没有错题，请调整范围');
            return;
        }
        hideModal(reviewScopeModal);
        startReviewSession(questions);
    });
    cancelReviewScopeBtn.addEventListener('click', () => hideModal(reviewScopeModal));
    reviewScopeModal.addEventListener('change', updateScopeSummary);

    // 题库编辑器
    editorAddBtn.addEventListener('click', editorAddQuestion);
    editorSaveBtn.addEventListener('click', () => editorSaveCurrent(false));
    editorCloseBtn.addEventListener('click', editorClose);
    editorPrevBtn.addEventListener('click', () => editorNavigate(-1));
    editorNextBtn.addEventListener('click', () => editorNavigate(1));
    editorDeleteBtn.addEventListener('click', editorDeleteCurrent);
    editorAddOption.addEventListener('click', () => editorMutateOptions(1));
    editorRemoveOption.addEventListener('click', () => editorMutateOptions(-1));
    editorType.addEventListener('change', () => { editorDirty = true; editorRenderOptions(); });
    editorStem.addEventListener('input', () => { editorDirty = true; });
    editorAnswer.addEventListener('input', () => { editorDirty = true; });
    editorExplanation.addEventListener('input', () => { editorDirty = true; });
    editorAnalysis.addEventListener('input', () => { editorDirty = true; });

    // 题库管理
    createBankBtn.addEventListener('click', () => showModal(createBankModal));
    cancelCreateBankBtn.addEventListener('click', () => hideModal(createBankModal));
    confirmCreateBankBtn.addEventListener('click', createNewBank);
    cancelRenameBankBtn.addEventListener('click', () => hideModal(renameBankModal));
    confirmRenameBankBtn.addEventListener('click', renameBank);
    exportAllBtn.addEventListener('click', exportAllBanks);
    exportCurrentBtn.addEventListener('click', () => exportBank(currentBankName));

    // 粘贴导入
    pasteInput.addEventListener('paste', handlePasteEvent);
    pasteParseBtn.addEventListener('click', parsePastedText);
    pasteClearBtn.addEventListener('click', () => { pasteInput.value = ''; });

    // 导入预览向导
    previewSelectAll.addEventListener('change', togglePreviewSelectAll);
    previewConfirmBtn.addEventListener('click', commitPreviewImport);
    previewCancelBtn.addEventListener('click', () => hideModal(importPreviewModal));

    // 套题模式翻页与答题回顾
    prevQuestionBtn.addEventListener('click', prevQuestion);
    reviewOnlyWrong.addEventListener('change', renderAnswerReview);

    // 首页快捷入口
    heroStartBtn.addEventListener('click', () => showSection('quiz'));
    heroImportBtn.addEventListener('click', () => showSection('manage'));
}

// 显示指定部分
function showSection(sectionName) {
    // 隐藏所有部分
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // 移除所有导航按钮的激活状态
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 显示指定部分
    document.getElementById(`${sectionName}-section`).classList.add('active');
    
    // 激活对应的导航按钮
    document.getElementById(`btn-${sectionName}`).classList.add('active');
    
    // 如果是错题本部分，更新错题列表
    if (sectionName === 'errors') {
        updateErrorsList();
    }

    // 如果是收藏夹部分，更新收藏列表
    if (sectionName === 'favorites') {
        updateFavoritesList();
    }

    // 如果是题库管理部分，更新题库列表
    if (sectionName === 'manage') {
        updateBanksList();
    }
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        fileName.textContent = file.name;
    }
}

// 更新题库选择下拉框
function updateBankSelect() {
    // 保存当前选中的值
    const currentValue = questionBankSelect.value;

    // 清空下拉框
    questionBankSelect.innerHTML = '<option value="all">全部题库</option>';

    // 添加所有题库选项
    Object.keys(questionBanks).forEach(bankName => {
        const option = document.createElement('option');
        option.value = bankName;
        option.textContent = bankName;
        questionBankSelect.appendChild(option);
    });

    // 恢复之前选中的值（如果还存在）
    if (currentValue && (currentValue === 'all' || questionBanks[currentValue])) {
        questionBankSelect.value = currentValue;
    }
}

// 导入题目
function importQuestions() {
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

// ==================== 题目解析（批次1：多格式自动识别） ====================
//
// 支持的格式家族（自动识别，无需用户选择）：
//   A. 字段式：  题目：xxx / A：xxx / 答案：x（原有格式，完整保留）
//   B. 编号式：  1. 题干 / A. 选项（逐行）/ 答案：x（最常见的题库排版）
//   C. 混排式：  1. 题干 A.xx B.xx C.xx D.xx 答案：x（单行，常见于网页/微信复制）
//   D. 判断题：  答案为 对/错/√/×/正确/错误，自动配 A正确/B错误 两个选项
// 每题输出置信度，供导入预览向导提示需要人工确认的题。

const OPTION_LINE_RE = /^\s*([A-Ha-h])\s*[.、:：．)）,，]\s*(.+)$/;
const OPTION_EXPLAIN_RE = /^\s*([A-Ha-h])\s*解释\s*[:：]\s*(.+)$/;
const QUESTION_NUM_RE = /^(\d{1,3})\s*[.、)）．]\s*(.*)$/;
const JUDGE_QUESTION_RE = /^判断题\s*[:：]\s*(.*)$/;
const TITLE_RE = /^#\s*(.*)$/;
const ANALYSIS_RE = /^(?:答案解析|解析)\s*[:：]\s*(.+)$/;
const EXPLAIN_RE = /^(?:题目解释|题干解释)\s*[:：]\s*(.+)$/;
const TYPE_RE = /^(?:类型|题型)\s*[:：]\s*(.+)$/;
const QUESTION_FIELD_RE = /^题目\s*[:：]\s*(.*)$/;
// 整行答案（必须带冒号，避免把普通句子误判成答案行）
const FULL_ANSWER_RE = /^(?:【?参考答案】?|【?标准答案】?|【?正确答案】?|【?答案】?|答案)\s*[:：]\s*(.+?)\s*[。.]?$/;
// 空格分隔的纯答案行，如"答案 A" / "参考答案 B"
const FULL_ANSWER_SPACED_RE = /^(?:【?参考答案】?|【?标准答案】?|【?正确答案】?|【?答案】?|答案)\s+((?:[A-Ha-h√×对错]+)(?:[\s、,，]+[A-Ha-h√×对错]+)*)\s*[。.]?$/;
// 行尾行内答案（家族C），要求"答案"前是行首、空白或中文标点，避免误伤选项文字
// 分组1=前导字符(裁剪时保留),分组2=答案内容（支持多字母，如"答案：AB"）
const INLINE_ANSWER_RE = /(^|[\s(（,，;；。？！：、])(?:【?参考答案】?|【?标准答案】?|【?正确答案】?|【?答案】?|答案)\s*[:：]?\s*((?:正确|错误)|[A-Ha-h√×对错](?:[\s、,，]*[A-Ha-h√×对错])*)\s*[。.]?\s*$/;const JUDGE_TRUE_RE = /^(对|正确|√|T|Y)$/i;
const JUDGE_FALSE_RE = /^(错|错误|×|X|F|N)$/i;

// 拆分行内选项（家族C）："题干 A.xx B.yy C.zz" → { stem, options }
// 要求至少两个选项且从 A 开始连续编号，避免把题干中"A、B两类"这类文字误拆
function splitInlineOptions(text) {
    // 分组1=前导字符(题干裁剪时保留),分组2=选项字母
    const re = /(^|[\s(（,，;；。？！：、…""''「」『』（）【】《》<>])\s*([A-Ha-h])\s*[.、:：．)）]\s*/g;
    const markers = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        markers.push({
            key: m[2].toUpperCase(),
            stemEnd: m.index + m[1].length,
            textStart: re.lastIndex,
        });
    }
    if (markers.length < 2 || markers[0].key !== 'A') return null;
    for (let i = 0; i < markers.length; i++) {
        if (markers[i].key !== String.fromCharCode(65 + i)) return null;
    }
    const options = {};
    markers.forEach((mk, i) => {
        const end = i + 1 < markers.length ? markers[i + 1].stemEnd : text.length;
        options[mk.key] = text.slice(mk.textStart, end).replace(/\s+/g, ' ').trim();
    });
    const stem = text.slice(0, markers[0].stemEnd).replace(/\s+/g, ' ').trim();
    return { stem, options };
}

// 题型/答案/选项的最终规范化（导入与预览提交时都会调用，幂等）
function finalizeQuestion(q) {
    q.title = (q.title || '').trim();
    q.content = (q.content || '').trim();
    q.analysis = (q.analysis || '').trim();
    q.explanation = (q.explanation || '').trim();
    const rawAnswer = (q.answer || '').toUpperCase().replace(/\s+/g, '');

    const hint = (q.type || '').replace(/题$/, '');
    const isJudge = hint === '判断' || JUDGE_TRUE_RE.test(rawAnswer) || JUDGE_FALSE_RE.test(rawAnswer);

    if (isJudge) {
        q.type = '判断';
        const meaningful = Object.values(q.options).some(v => v && v.length > 2);
        if (!meaningful) {
            // 统一选项为 A正确 / B错误，保证刷题界面与判分一致
            q.options = { A: '正确', B: '错误' };
        }
        if (JUDGE_TRUE_RE.test(rawAnswer)) q.answer = 'A';
        else if (JUDGE_FALSE_RE.test(rawAnswer)) q.answer = 'B';
        else if (/^[AB]$/.test(rawAnswer)) q.answer = rawAnswer;
        else q.answer = '';
    } else {
        q.answer = rawAnswer.replace(/[^A-H]/g, '');
        q.type = q.answer.length > 1 ? '多选' : '单选';
    }

    // 置信度：预览时用于提示"需要人工看一眼"的题
    let conf = 1.0;
    const optCount = Object.keys(q.options).length;
    if (!q.answer) conf -= 0.5;
    if (optCount === 0) conf -= 0.4;
    else if (optCount < 2) conf -= 0.3;
    if (!q.analysis) conf -= 0.1;
    q.confidence = Math.max(0, Math.min(1, conf));
    q.raw = Array.isArray(q.raw) ? q.raw.join('\n') : (q.raw || '');

    if (!q.content) return null; // 没有题干的散行直接丢弃
    return q;
}

// 查重指纹：题干（去空白）+ 全部选项文本。同一题重新导入（即使改了答案）会被识别为重复；
// 题干相同但选项不同的题（如"下列说法正确的是()"）不会被误判
function questionDedupKey(q) {
    const stem = (q.content || '').replace(/\s+/g, '');
    const opts = Object.keys(q.options || {}).sort()
        .map(k => k + ':' + (q.options[k] || '').replace(/\s+/g, ''))
        .join('');
    return stem + '|' + opts;
}

// 主解析器：逐行状态机，同时覆盖家族 A/B/C/D
function parseQuestionsText(content) {
    const questions = [];
    const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
    let cur = null;

    const newQuestion = () => {
        cur = {
            title: '', content: '', explanation: '', options: {}, optionExplanations: {},
            answer: '', analysis: '', type: '', confidence: 1.0, raw: []
        };
    };
    const flush = () => {
        if (!cur) return;
        const q = finalizeQuestion(cur);
        if (q) questions.push(q);
        cur = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, '').trim();
        if (!line) continue;

        // 1. "# 标题" → 新题开始
        const titleM = line.match(TITLE_RE);
        if (titleM) {
            flush();
            newQuestion();
            cur.title = titleM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }

        // 2. 剥离行尾行内答案（家族C："…… 答案：B"）
        let body = line;
        let inlineAnswer = null;
        const ansM = body.match(INLINE_ANSWER_RE);
        if (ansM) {
            inlineAnswer = ansM[2];
            // 裁剪时保留前导字符（如"？"），避免题干丢失标点
            body = body.slice(0, ansM.index + ansM[1].length).trim();
        }

        // 3. 字段行（顺序重要：题目解释/解析 必须先于 题目/答案 判断）
        const explainM = body.match(EXPLAIN_RE);
        if (explainM) {
            if (!cur) newQuestion();
            cur.explanation = explainM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }
        const analysisM = body.match(ANALYSIS_RE);
        if (analysisM) {
            if (!cur) newQuestion();
            cur.analysis = analysisM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }
        const typeM = body.match(TYPE_RE);
        if (typeM) {
            if (!cur) newQuestion();
            cur.type = typeM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }
        const fieldM = body.match(QUESTION_FIELD_RE);
        if (fieldM) {
            if (cur && cur.content) flush(); // 家族A连续两题之间靠"题目："分隔
            if (!cur) newQuestion();
            cur.content = fieldM[1].trim();
            if (inlineAnswer) cur.answer = inlineAnswer;
            cur.raw.push(rawLine);
            continue;
        }

        // 3.5 整行答案
        const fullAnsM = body.match(FULL_ANSWER_RE) || body.match(FULL_ANSWER_SPACED_RE);
        if (fullAnsM) {
            if (!cur) newQuestion();
            cur.answer = fullAnsM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }

        // 4. "1. 题干"编号行 → 新题（家族B/C）
        const numM = body.match(QUESTION_NUM_RE);
        if (numM) {
            const afterNum = numM[2].trim();
            const split = splitInlineOptions(afterNum);
            flush();
            newQuestion();
            cur.raw.push(rawLine);
            if (split) {
                cur.content = split.stem;   // 家族C：题干 + 行内选项
                cur.options = split.options;
            } else {
                cur.content = afterNum;     // 家族B：仅题干，选项在后续行
            }
            if (inlineAnswer) cur.answer = inlineAnswer;
            continue;
        }

        // 5. "判断题：xxx" 开头
        const judgeM = body.match(JUDGE_QUESTION_RE);
        if (judgeM) {
            flush();
            newQuestion();
            cur.raw.push(rawLine);
            cur.content = judgeM[1].trim();
            cur.type = '判断';
            if (inlineAnswer) cur.answer = inlineAnswer;
            continue;
        }

        // 6. 选项解释行（A解释：xxx）
        const opExM = body.match(OPTION_EXPLAIN_RE);
        if (opExM) {
            if (!cur) newQuestion();
            cur.optionExplanations[opExM[1].toUpperCase()] = opExM[2].trim();
            cur.raw.push(rawLine);
            continue;
        }

        // 7. 选项行（A. xxx / A：xxx / A、xxx）
        const opM = body.match(OPTION_LINE_RE);
        if (opM) {
            if (!cur) newQuestion();
            // 选项行内还跟着更多选项时（如"A. 21 B.80 C.443 D.22"），按行内选项拆分
            const lineSplit = splitInlineOptions(body);
            if (lineSplit && Object.keys(lineSplit.options).length > 1) {
                Object.assign(cur.options, lineSplit.options);
                if (!cur.content && lineSplit.stem) cur.content = lineSplit.stem;
            } else {
                cur.options[opM[1].toUpperCase()] = opM[2].trim();
            }
            if (inlineAnswer) cur.answer = inlineAnswer;
            cur.raw.push(rawLine);
            continue;
        }

        // 8. 整行就是答案（行内答案剥离后 body 为空）
        if (inlineAnswer) {
            if (!cur) newQuestion();
            cur.answer = inlineAnswer;
            cur.raw.push(rawLine);
            continue;
        }

        // 9. 其他 → 题干续行（多行题干）；续行里跟行内选项的也支持；没有当前题的散行丢弃
        if (cur) {
            const contSplit = splitInlineOptions(line);
            if (contSplit && Object.keys(contSplit.options).length > 1) {
                // 续行形如"其中正确的是 A. 21 B.80 C.443 D.22"
                Object.assign(cur.options, contSplit.options);
                if (contSplit.stem) {
                    cur.content = cur.content ? cur.content + '\n' + contSplit.stem : contSplit.stem;
                }
            } else if (cur.content) {
                cur.content += '\n' + line;
            } else if (!cur.answer && Object.keys(cur.options).length === 0) {
                cur.content = line;
            }
            cur.raw.push(rawLine);
        }
    }
    flush();
    return questions;
}

// 显示导入状态
function showImportStatus(message, type) {
    importStatus.textContent = message;
    importStatus.className = 'status-message';
    importStatus.classList.add(type);
    
    // 3秒后隐藏状态消息
    setTimeout(() => {
        importStatus.className = 'status-message';
    }, 3000);
}

// 开始刷题
function startQuiz() {
    if (questionBank.length === 0) {
        showQuizStatus('请先导入题库', 'error');
        return;
    }
    
    // 获取刷题设置
    quizMode = document.querySelector('input[name="quiz-mode"]:checked').value;
    const questionType = document.querySelector('input[name="question-type"]:checked').value;
    const randomize = document.getElementById('randomize').checked;
    
    // 筛选题目
    let filteredQuestions = [...questionBank];
    
    if (questionType === 'single') {
        filteredQuestions = questionBank.filter(q => q.type === '单选');
    } else if (questionType === 'multiple') {
        filteredQuestions = questionBank.filter(q => q.type === '多选');
    } else if (questionType === 'judge') {
        filteredQuestions = questionBank.filter(q => q.type === '判断');
    }
    
    if (filteredQuestions.length === 0) {
        showQuizStatus('没有符合条件的题目', 'error');
        return;
    }
    
    // 随机打乱题目顺序
    if (randomize) {
        filteredQuestions = shuffleArray(filteredQuestions);
    }
    
    // 初始化刷题状态
    currentQuiz = filteredQuestions;
    currentQuestionIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    userAnswers = new Array(currentQuiz.length).fill('');
    endQuizBtn.textContent = quizMode === 'exam' ? '交卷' : '结束刷题';
    reviewOnlyWrong.checked = false;
    masteryRemovedInSession = 0;
    
    // 显示刷题容器
    quizContainer.classList.remove('hidden');
    quizResult.classList.add('hidden');
    quizSettings.classList.add('hidden');
    
    // 显示第一道题
    displayQuestion();
}

// 显示题目
function displayQuestion() {
    const question = currentQuiz[currentQuestionIndex];
    
    // 更新题目信息
    questionNumber.textContent = `${currentQuestionIndex + 1}/${currentQuiz.length}`;
    questionType.textContent = question.type;
    questionText.textContent = question.content;
    
    // 题目解释：逐题模式作答时可见；套题模式交卷前隐藏（回顾时统一展示）
    if (quizMode !== 'exam') {
        questionExplanation.textContent = question.explanation || '';
        questionExplanation.classList.remove('hidden');
    } else {
        questionExplanation.classList.add('hidden');
    }
    
    // 显示选项（容错：旧版错题记录可能缺字段）
    const optionsContainer = document.querySelector('.options-container');
    optionsContainer.innerHTML = '';

    Object.keys(question.options || {}).sort().forEach(optionKey => {
        const optionItem = document.createElement('div');
        optionItem.className = 'option-item';
        
        // 根据题目类型创建不同的输入元素（多选用 checkbox，单选/判断题用 radio）
        let inputElement;
        if (question.type !== '多选') {
            inputElement = document.createElement('input');
            inputElement.type = 'radio';
            inputElement.name = 'answer';
            inputElement.id = `option-${optionKey.toLowerCase()}`;
            inputElement.value = optionKey;
        } else {
            inputElement = document.createElement('input');
            inputElement.type = 'checkbox';
            inputElement.name = 'answer';
            inputElement.id = `option-${optionKey.toLowerCase()}`;
            inputElement.value = optionKey;
        }
        
        const label = document.createElement('label');
        label.htmlFor = `option-${optionKey.toLowerCase()}`;
        
        const optionLabel = document.createElement('span');
        optionLabel.className = 'option-label';
        optionLabel.textContent = optionKey;
        
        const optionText = document.createElement('span');
        optionText.className = 'option-text';
        optionText.textContent = question.options[optionKey];
        
        label.appendChild(optionLabel);
        label.appendChild(optionText);
        
        optionItem.appendChild(inputElement);
        optionItem.appendChild(label);
        
        // 选项解释：仅逐题模式作答时显示
        if (quizMode !== 'exam' && (question.optionExplanations || {})[optionKey]) {
            const optionExplanation = document.createElement('p');
            optionExplanation.className = 'option-explanation';
            optionExplanation.textContent = question.optionExplanations[optionKey];
            optionItem.appendChild(optionExplanation);
        }
        
        optionsContainer.appendChild(optionItem);
    });
    
    // 恢复套题模式下保存的作答（翻页回来可修改）
    const savedAnswer = userAnswers[currentQuestionIndex] || '';
    if (savedAnswer) {
        optionsContainer.querySelectorAll('input[name="answer"]').forEach(inp => {
            inp.checked = question.type === '多选' ? savedAnswer.includes(inp.value) : inp.value === savedAnswer;
        });
    }

    // 刷新收藏按钮状态
    updateFavoriteButton();

    // 重置答题状态与按钮（逐题模式 vs 套题模式）
    isAnswered = false;
    answerFeedback.classList.add('hidden');
    if (quizMode === 'exam') {
        // 套题模式：作答中不出反馈，可前后翻页
        submitAnswerBtn.classList.add('hidden');
        nextQuestionBtn.classList.remove('hidden');
        if (currentQuestionIndex >= currentQuiz.length - 1) {
            nextQuestionBtn.classList.add('hidden'); // 最后一题用"交卷"
        }
        if (currentQuestionIndex > 0) {
            prevQuestionBtn.classList.remove('hidden');
        } else {
            prevQuestionBtn.classList.add('hidden');
        }
    } else {
        prevQuestionBtn.classList.add('hidden');
        submitAnswerBtn.classList.remove('hidden');
        nextQuestionBtn.classList.add('hidden');
    }
}

// 读取当前题的用户作答（单选/判断返回字母，多选返回排序后的字母串，未选返回 ''）
function collectUserAnswer() {
    const question = currentQuiz[currentQuestionIndex];
    if (question.type !== '多选') { // 单选/判断题：单选框
        const selectedOption = document.querySelector('input[name="answer"]:checked');
        return selectedOption ? selectedOption.value : '';
    }
    const selectedOptions = document.querySelectorAll('input[name="answer"]:checked');
    return Array.from(selectedOptions).map(option => option.value).sort().join('');
}

// 提交答案（逐题模式）
function submitAnswer() {
    const question = currentQuiz[currentQuestionIndex];
    const userAnswer = collectUserAnswer();

    if (!userAnswer) {
        alert(question.type === '多选' ? '请至少选择一个答案' : '请选择一个答案');
        return;
    }

    // 记录作答，供结果页逐题回顾
    userAnswers[currentQuestionIndex] = userAnswer;
    
    // 检查答案是否正确（两侧都规范化后再比较）
    const isCorrect = normalizeAnswerString(userAnswer) === normalizeAnswerString(question.answer);
    
    // 更新答题统计与错题闭环
    let removedFromErrorBook = 0;
    if (isCorrect) {
        correctCount++;
    } else {
        wrongCount++;

        // 将错题添加到错题本
        addToErrorBook(question, userAnswer);
    }
    // 已在错题本中的题：答对累计连对（达阈值自动移出），答错清零
    removedFromErrorBook += updateErrorStreak(question, isCorrect, userAnswer);
    masteryRemovedInSession += removedFromErrorBook;

    // 显示答案反馈
    answerResult.textContent = isCorrect
        ? (removedFromErrorBook > 0
            ? `回答正确！已连对 ${masteryThreshold} 次，移出错题本 🎉`
            : '回答正确！')
        : `回答错误！正确答案是：${question.answer}`;
    answerResult.className = isCorrect ? 'correct-answer' : 'wrong-answer';
    answerExplanation.textContent = question.analysis || '';
    answerFeedback.classList.remove('hidden');
    
    // 更新按钮状态
    isAnswered = true;
    submitAnswerBtn.classList.add('hidden');
    nextQuestionBtn.classList.remove('hidden');
}

// 下一题
function nextQuestion() {
    if (quizMode === 'exam') {
        // 套题模式：先保存当前作答再翻页
        userAnswers[currentQuestionIndex] = collectUserAnswer();
        if (currentQuestionIndex >= currentQuiz.length - 1) {
            finishExam();
            return;
        }
        currentQuestionIndex++;
        displayQuestion();
        return;
    }

    currentQuestionIndex++;

    if (currentQuestionIndex >= currentQuiz.length) {
        // 刷题完成，显示结果
        showQuizResult();
    } else {
        // 显示下一题
        displayQuestion();
    }
}

// 上一题（仅套题模式，已作答内容保留）
function prevQuestion() {
    if (quizMode !== 'exam' || currentQuestionIndex === 0) return;
    userAnswers[currentQuestionIndex] = collectUserAnswer();
    currentQuestionIndex--;
    displayQuestion();
}

// 交卷（套题模式）：统一判分并生成逐题回顾
function finishExam() {
    userAnswers[currentQuestionIndex] = collectUserAnswer();

    correctCount = 0;
    wrongCount = 0;
    let unanswered = 0;

    currentQuiz.forEach((question, idx) => {
        const ua = userAnswers[idx] || '';
        const isCorrect = !!ua && normalizeAnswerString(ua) === normalizeAnswerString(question.answer);
        if (!ua) {
            unanswered++;
            // 未作答按错题处理，便于之后复习
            addToErrorBook(question, '未作答');
        } else if (isCorrect) {
            correctCount++;
        } else {
            wrongCount++;
            addToErrorBook(question, ua);
        }
        // 错题闭环：已在错题本中的题，答对累计连对（达阈值移出）/ 答错清零
        masteryRemovedInSession += updateErrorStreak(question, isCorrect, ua);
    });

    showQuizResult(unanswered);
}

// 显示刷题结果（逐题模式结束/提前结束，或套题模式交卷后）
function showQuizResult(examUnanswered) {
    quizContainer.classList.add('hidden');
    quizResult.classList.remove('hidden');

    let denominator;
    let unanswered = examUnanswered || 0;
    if (quizMode === 'exam') {
        // 套题模式：考试得分按总题数计算，未答数单独展示
        denominator = currentQuiz.length;
    } else {
        // 逐题模式：提前结束时按实际已答题数计算正确率
        denominator = Math.min(currentQuestionIndex + (isAnswered ? 1 : 0), currentQuiz.length);
        unanswered = currentQuiz.length - denominator;
    }

    totalQuestions.textContent = currentQuiz.length;
    correctAnswers.textContent = correctCount;
    wrongAnswers.textContent = wrongCount;
    unansweredCountEl.textContent = unanswered;
    accuracy.textContent = denominator > 0
        ? (quizMode === 'exam'
            ? `${((correctCount / denominator) * 100).toFixed(1)}%`
            : `${((correctCount / denominator) * 100).toFixed(1)}%（已答 ${denominator} 题）`)
        : '0%';

    // 错题闭环提示：本轮因连对达标移出错题本的题
    if (masteryRemovedInSession > 0) {
        masteryNote.textContent = masteryThreshold === 1
            ? `本轮共有 ${masteryRemovedInSession} 题答对后已移出错题本 🎉`
            : `本轮共有 ${masteryRemovedInSession} 题连续答对 ${masteryThreshold} 次，已自动移出错题本 🎉`;
        masteryNote.classList.remove('hidden');
    } else {
        masteryNote.classList.add('hidden');
    }

    renderAnswerReview();
}

// 渲染逐题回顾（结果页：套题模式交卷后 / 逐题模式结束后）
function renderAnswerReview() {
    answerReview.innerHTML = '';
    const onlyWrong = reviewOnlyWrong.checked;

    currentQuiz.forEach((question, idx) => {
        const ua = userAnswers[idx] || '';
        const isCorrect = !!ua && normalizeAnswerString(ua) === normalizeAnswerString(question.answer);
        if (onlyWrong && isCorrect) return; // 未作答视为错题，在"只看错题"中保留

        const item = document.createElement('div');
        item.className = 'review-item' + (!ua ? ' review-unanswered' : (isCorrect ? '' : ' review-wrong'));

        const head = document.createElement('div');
        head.className = 'review-head';

        const num = document.createElement('span');
        num.className = 'review-num';
        num.textContent = `#${idx + 1}`;
        head.appendChild(num);

        const typeBadge = document.createElement('span');
        typeBadge.className = 'badge';
        typeBadge.textContent = question.type;
        head.appendChild(typeBadge);

        const resultBadge = document.createElement('span');
        resultBadge.className = 'badge ' + (isCorrect ? 'ok-badge' : 'warn-badge');
        resultBadge.textContent = !ua ? '未作答' : (isCorrect ? '回答正确' : '回答错误');
        head.appendChild(resultBadge);
        item.appendChild(head);

        const stem = document.createElement('p');
        stem.className = 'review-stem';
        stem.textContent = question.content;
        item.appendChild(stem);

        const optKeys = Object.keys(question.options || {}).sort();
        if (optKeys.length) {
            const opts = document.createElement('div');
            opts.className = 'review-options';
            opts.textContent = optKeys.map(k => `${k}. ${question.options[k]}`).join('　');
            item.appendChild(opts);
        }

        const answers = document.createElement('p');
        answers.className = 'review-answers';
        answers.textContent = `你的答案：${ua || '未作答'}　正确答案：${question.answer}`;
        item.appendChild(answers);

        if (question.analysis) {
            const ana = document.createElement('p');
            ana.className = 'review-analysis';
            ana.textContent = `解析：${question.analysis}`;
            item.appendChild(ana);
        }
        if (question.explanation) {
            const exp = document.createElement('p');
            exp.className = 'review-analysis';
            exp.textContent = `题目解释：${question.explanation}`;
            item.appendChild(exp);
        }

        answerReview.appendChild(item);
    });
}

// 结束刷题（逐题模式）/ 交卷（套题模式）
function endQuiz() {
    if (quizMode === 'exam') {
        const unanswered = userAnswers.filter(a => !a).length;
        const message = unanswered > 0
            ? `还有 ${unanswered} 题未作答，未作答的题将计入错题本。确定交卷吗？`
            : '确定交卷吗？交卷后将统一判分。';
        if (confirm(message)) {
            finishExam();
        }
        return;
    }
    if (confirm('确定要结束刷题吗？')) {
        showQuizResult();
    }
}

// 返回刷题设置
function backToQuizOptions() {
    quizResult.classList.add('hidden');
    quizSettings.classList.remove('hidden');
}

// 添加到错题本
function addToErrorBook(question, userAnswer) {
    // 检查题目是否已在错题本中
    const existingIndex = errorQuestions.findIndex(
        q => q.content === question.content
    );

    if (existingIndex === -1) {
        // 添加新错题
        errorQuestions.push({
            ...question,
            userAnswer,
            bankName: currentBankName,
            correctStreak: 0, // 连对次数：复习/刷题中答对累计，达阈值自动移出
            timestamp: new Date().toISOString()
        });

        // 保存到本地存储
        saveToLocalStorage();
    }
}

// 错题巩固闭环阈值：同一题连续答对 N 次自动移出错题本；0 = 关闭自动移出
let masteryThreshold = 2;

// 错题闭环：已入错题本的题答对 → 连对次数+1（达阈值自动移出，返回移出数）；
// 答错 → 连对次数清零并更新作答记录；不在错题本中的题 → 无操作
function updateErrorStreak(question, isCorrect, userAnswer) {
    if (masteryThreshold === 0) return 0; // 用户关闭了自动移出
    const idx = errorQuestions.findIndex(q => q.content === question.content);
    if (idx === -1) return 0;

    if (isCorrect) {
        const streak = (errorQuestions[idx].correctStreak || 0) + 1;
        if (streak >= masteryThreshold) {
            errorQuestions.splice(idx, 1);
            saveToLocalStorage();
            return 1;
        }
        errorQuestions[idx].correctStreak = streak;
    } else {
        errorQuestions[idx].correctStreak = 0;
        errorQuestions[idx].userAnswer = userAnswer || errorQuestions[idx].userAnswer;
    }
    saveToLocalStorage();
    return 0;
}

// ==================== 收藏夹 ====================

// 切换收藏状态（按题干匹配），返回是否为新增收藏
function toggleFavorite(question, bankName) {
    const idx = favoriteQuestions.findIndex(q => q.content === question.content);
    let added;
    if (idx === -1) {
        favoriteQuestions.push({
            ...question,
            bankName: bankName || '未知题库',
            timestamp: new Date().toISOString()
        });
        added = true;
    } else {
        favoriteQuestions.splice(idx, 1);
        added = false;
    }
    saveToLocalStorage();
    return added;
}

// 刷题界面：收藏/取消收藏当前题
function toggleFavoriteCurrent() {
    const question = currentQuiz[currentQuestionIndex];
    if (!question) return;
    toggleFavorite(question, isAllBanksView ? '未知题库' : currentBankName);
    updateFavoriteButton();
}

// 刷新收藏按钮状态（★ 已收藏 / ☆ 收藏）
function updateFavoriteButton() {
    const question = currentQuiz[currentQuestionIndex];
    const isFav = !!question && favoriteQuestions.some(f => f.content === question.content);
    favoriteBtn.textContent = isFav ? '★ 已收藏' : '☆ 收藏';
    if (isFav) {
        favoriteBtn.classList.add('active');
    } else {
        favoriteBtn.classList.remove('active');
    }
}

// 刷新收藏夹列表
function updateFavoritesList() {
    if (favoriteQuestions.length === 0) {
        favoritesList.innerHTML = '<p class="empty-message">暂无收藏题目，刷题时点击题目右上角的"☆ 收藏"即可加入</p>';
        return;
    }

    favoritesList.innerHTML = '';

    favoriteQuestions.forEach((question, index) => {
        const item = document.createElement('div');
        item.className = 'error-item';

        const title = document.createElement('h4');
        title.textContent = question.content;
        item.appendChild(title);

        const meta = document.createElement('p');
        meta.className = 'favorite-meta';
        meta.textContent = `来源：${question.bankName || '未知题库'} · ${question.type || ''}`;
        item.appendChild(meta);

        if (question.options && Object.keys(question.options).length > 0) {
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'error-options';
            Object.keys(question.options).sort().forEach(key => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'error-option';
                const optionLabel = document.createElement('span');
                optionLabel.className = 'option-label';
                optionLabel.textContent = `${key}：`;
                const optionText = document.createElement('span');
                optionText.className = 'option-text';
                optionText.textContent = question.options[key];
                optionDiv.appendChild(optionLabel);
                optionDiv.appendChild(optionText);
                optionsDiv.appendChild(optionDiv);
            });
            item.appendChild(optionsDiv);
        }

        const correctAnswer = document.createElement('p');
        correctAnswer.className = 'correct-answer';
        correctAnswer.textContent = `正确答案：${question.answer}`;
        item.appendChild(correctAnswer);

        if (question.analysis) {
            const analysis = document.createElement('p');
            analysis.textContent = `解析：${question.analysis}`;
            item.appendChild(analysis);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'delete-btn';
        removeBtn.textContent = '取消收藏';
        removeBtn.addEventListener('click', () => {
            favoriteQuestions.splice(index, 1);
            saveToLocalStorage();
            updateFavoritesList();
        });
        item.appendChild(removeBtn);

        favoritesList.appendChild(item);
    });
}

// 复习收藏：以逐题模式过一遍收藏题
function reviewFavorites() {
    if (favoriteQuestions.length === 0) {
        alert('收藏夹是空的，刷题时点击"☆ 收藏"即可加入');
        return;
    }

    currentQuiz = [...favoriteQuestions];
    currentQuestionIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    userAnswers = new Array(currentQuiz.length).fill('');
    masteryRemovedInSession = 0;
    quizMode = 'immediate';
    endQuizBtn.textContent = '结束刷题';

    showSection('quiz');
    quizContainer.classList.remove('hidden');
    quizResult.classList.add('hidden');
    quizSettings.classList.add('hidden');

    displayQuestion();
}

// 更新错题列表
// 错题本分组展开状态（true = 已展开），持久化到 localStorage；缺省 = 折叠
let expandedBanks = {};

function loadCollapsedBanks() {
    try {
        const saved = localStorage.getItem('errorBookExpandedBanks');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                expandedBanks = parsed;
            }
        }
    } catch (e) {
        expandedBanks = {};
    }
}

function saveCollapsedBanks() {
    try {
        localStorage.setItem('errorBookExpandedBanks', JSON.stringify(expandedBanks));
    } catch (e) { /* 存储异常时静默降级：展开状态不持久化 */ }
}

function updateErrorsList() {
    if (errorQuestions.length === 0) {
        errorsList.innerHTML = '<p class="empty-message">暂无错题记录</p>';
        toggleAllBanksBtn.classList.add('hidden');
        return;
    }
    toggleAllBanksBtn.classList.remove('hidden');

    errorsList.innerHTML = '';

    // 按题库分类错题
    const errorsByBank = {};
    errorQuestions.forEach((question, index) => {
        const bankName = question.bankName || '未知题库';
        if (!errorsByBank[bankName]) {
            errorsByBank[bankName] = [];
        }
        errorsByBank[bankName].push({ question, index });
    });

    const bankNames = Object.keys(errorsByBank);
    updateToggleAllBanksLabel(bankNames);

    // 显示每个题库的错题（可折叠分组，默认折叠）
    bankNames.forEach(bankName => {
        const isCollapsed = !expandedBanks[bankName]; // 缺省折叠

        const group = document.createElement('div');
        group.className = 'bank-group';

        // 分组头部：整行可点击，展开/折叠该题库
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'bank-toggle' + (isCollapsed ? '' : ' expanded');
        toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');

        const chevron = document.createElement('span');
        chevron.className = 'bank-chevron';
        chevron.textContent = '▸';
        toggle.appendChild(chevron);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'bank-toggle-name';
        nameSpan.textContent = bankName;
        toggle.appendChild(nameSpan);

        const countBadge = document.createElement('span');
        countBadge.className = 'bank-count-badge';
        countBadge.textContent = `${errorsByBank[bankName].length} 题`;
        toggle.appendChild(countBadge);

        // 该题库的错题容器
        const bankContainer = document.createElement('div');
        bankContainer.className = 'bank-errors' + (isCollapsed ? ' collapsed' : '');

        toggle.addEventListener('click', () => {
            const nowExpanded = !expandedBanks[bankName];
            expandedBanks[bankName] = nowExpanded;
            saveCollapsedBanks();
            if (nowExpanded) {
                bankContainer.classList.remove('collapsed');
                toggle.classList.add('expanded');
                toggle.setAttribute('aria-expanded', 'true');
            } else {
                bankContainer.classList.add('collapsed');
                toggle.classList.remove('expanded');
                toggle.setAttribute('aria-expanded', 'false');
            }
            updateToggleAllBanksLabel();
        });

        // 显示该题库的错题
        errorsByBank[bankName].forEach(({ question, index }) => {
        const errorItem = document.createElement('div');
        errorItem.className = 'error-item';

        const title = document.createElement('h4');
        title.textContent = question.content;

        const type = document.createElement('p');
        type.textContent = `题型：${question.type}`;

        // 添加选项显示
        let optionsDiv = null;
        if (question.options && Object.keys(question.options).length > 0) {
            optionsDiv = document.createElement('div');
            optionsDiv.className = 'error-options';

            Object.keys(question.options).sort().forEach(key => {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'error-option';

                const optionLabel = document.createElement('span');
                optionLabel.className = 'option-label';
                optionLabel.textContent = `${key}：`;

                const optionText = document.createElement('span');
                optionText.className = 'option-text';
                optionText.textContent = question.options[key];

                optionDiv.appendChild(optionLabel);
                optionDiv.appendChild(optionText);
                optionsDiv.appendChild(optionDiv);
            });
        }

        const correctAnswer = document.createElement('p');
        correctAnswer.className = 'correct-answer';
        correctAnswer.textContent = `正确答案：${question.answer}`;

        const yourAnswer = document.createElement('p');
        yourAnswer.className = 'your-answer';
        yourAnswer.textContent = `你的答案：${question.userAnswer}`;

        const analysis = document.createElement('p');
        analysis.textContent = `解析：${question.analysis || '暂无解析'}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => deleteError(index));

        errorItem.appendChild(title);
        if (question.options && Object.keys(question.options).length > 0) {
            errorItem.appendChild(optionsDiv);
        }
        errorItem.appendChild(type);
        errorItem.appendChild(correctAnswer);
        errorItem.appendChild(yourAnswer);
        if ((question.correctStreak || 0) > 0 && masteryThreshold > 0) {
            const mastery = document.createElement('p');
            mastery.className = 'mastery-note';
            mastery.textContent = `已连对 ${question.correctStreak} 次，再答对 ${masteryThreshold - question.correctStreak} 次自动移出错题本`;
            errorItem.appendChild(mastery);
        }
        errorItem.appendChild(analysis);
        errorItem.appendChild(deleteBtn);

        bankContainer.appendChild(errorItem);
        });

        group.appendChild(toggle);
        group.appendChild(bankContainer);
        errorsList.appendChild(group);
    });
}

// 根据当前展开/折叠状态更新"全部展开/全部折叠"按钮文案（展示将要执行的动作）
function updateToggleAllBanksLabel(bankNameList) {
    const names = bankNameList || new Set(errorQuestions.map(q => q.bankName || '未知题库'));
    const list = Array.isArray(names) ? names : [...names];
    if (list.length === 0) return;
    const anyExpanded = list.some(name => !!expandedBanks[name]);
    toggleAllBanksBtn.textContent = anyExpanded ? '全部折叠' : '全部展开';
}

// 全部展开 / 全部折叠
function toggleAllBanks() {
    const bankNames = new Set(errorQuestions.map(q => q.bankName || '未知题库'));
    const anyExpanded = [...bankNames].some(name => !!expandedBanks[name]);
    // 有展开的组 → 全部折叠；全部已折叠 → 全部展开
    bankNames.forEach(name => { expandedBanks[name] = !anyExpanded; });
    saveCollapsedBanks();
    updateErrorsList();
}

// 删除错题
function deleteError(index) {
    if (confirm('确定要删除这道错题吗？')) {
        errorQuestions.splice(index, 1);
        saveToLocalStorage();
        updateErrorsList();
    }
}

// 清空错题本
function clearErrors() {
    if (confirm('确定要清空所有错题吗？')) {
        errorQuestions = [];
        saveToLocalStorage();
        updateErrorsList();
    }
}

// 复习错题
// ==================== 题库编辑器 ====================

// 加载错题移出规则设置
function loadMasterySetting() {
    const saved = parseInt(localStorage.getItem('masteryThresholdSetting'), 10);
    masteryThreshold = [0, 1, 2, 3].includes(saved) ? saved : 2;
    if (masteryThresholdSelect) masteryThresholdSelect.value = String(masteryThreshold);
}

// 打开题库编辑器
function editBank(bankName) {
    if (!questionBanks[bankName]) return;
    editBankName = bankName;
    editIndex = 0;
    editorDirty = false;
    editBankTitle.textContent = `编辑题库：${bankName}`;
    renderBankEditor();
    showModal(editBankModal);
}

function currentEditBank() {
    return (editBankName && questionBanks[editBankName]) || [];
}

// 未保存修改守卫：返回 true 表示可以继续（已放弃或无修改）
function editorGuard() {
    if (!editorDirty) return true;
    if (confirm('当前题目的修改尚未保存，确定放弃吗？')) {
        editorDirty = false;
        return true;
    }
    return false;
}

// 渲染编辑器整体（题目列表 + 当前题表单）
function renderBankEditor() {
    const questions = currentEditBank();

    editorQuestionList.innerHTML = '';
    questions.forEach((q, idx) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'editor-list-item' + (idx === editIndex ? ' selected' : '');
        item.textContent = `${idx + 1}. ${(q.content || '（无题干）').slice(0, 22)}`;
        item.addEventListener('click', () => {
            if (!editorGuard()) return;
            editIndex = idx;
            renderBankEditor();
        });
        editorQuestionList.appendChild(item);
    });

    if (questions.length === 0 || !questions[editIndex]) {
        editorForm.classList.add('hidden');
        editorEmpty.classList.remove('hidden');
        editorPosition.textContent = '';
        return;
    }
    editorForm.classList.remove('hidden');
    editorEmpty.classList.add('hidden');
    editorRenderForm();
}

// 渲染当前题表单
function editorRenderForm() {
    const q = currentEditBank()[editIndex];
    if (!q) return;

    editorStem.value = q.content || '';
    editorType.value = q.type === '多选' ? '多选' : (q.type === '判断' ? '判断' : '单选');
    editorAnswer.value = q.answer || '';
    editorExplanation.value = q.explanation || '';
    editorAnalysis.value = q.analysis || '';
    editorRenderOptions();
    editorPosition.textContent = `第 ${editIndex + 1} / ${currentEditBank().length} 题`;
    editorDirty = false;

    // 列表选中态
    Array.from(editorQuestionList.children).forEach((el, idx) => {
        if (idx === editIndex) el.classList.add('selected');
        else el.classList.remove('selected');
    });
}

// 渲染选项编辑行（判断题固定 A正确/B错误）
function editorRenderOptions() {
    const q = currentEditBank()[editIndex];
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
        input.addEventListener('input', () => { editorDirty = true; });
        row.appendChild(label);
        row.appendChild(input);
        editorOptions.appendChild(row);
    });
}

// 从表单 DOM 收集当前选项
function editorCollectOptions() {
    const opts = {};
    editorOptions.querySelectorAll('input.editor-option-input').forEach(inp => {
        if (!inp.disabled) opts[inp.dataset.letter] = inp.value;
    });
    return opts;
}

// 增删末尾选项
function editorMutateOptions(delta) {
    if (editorType.value === '判断') return;
    const q = currentEditBank()[editIndex];
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
    editorDirty = true;
    editorRenderOptions();
}

// 保存当前题（silent=true 时不弹提示），返回是否成功
function editorSaveCurrent(silent) {
    const questions = currentEditBank();
    const q = questions[editIndex];
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
    editorDirty = false;
    renderBankEditor();
    if (!silent) alert('本题已保存');
    return true;
}

// 新增题目（空题，未保存前关闭会被清理）
function editorAddQuestion() {
    if (!editorGuard()) return;
    const questions = currentEditBank();
    questions.push({
        content: '', type: '单选', options: { A: '', B: '', C: '', D: '' }, answer: '',
        explanation: '', analysis: '', optionExplanations: {}, confidence: 1, raw: ''
    });
    editIndex = questions.length - 1;
    renderBankEditor();
    editorDirty = true;
    editorStem.focus();
}

// 删除当前题
function editorDeleteCurrent() {
    const questions = currentEditBank();
    if (questions.length === 0) return;
    if (editorDirty && !confirm('当前题目的修改尚未保存，确定放弃并删除吗？')) return;
    if (!confirm(`确定删除第 ${editIndex + 1} 题吗？此操作不可恢复！`)) return;
    questions.splice(editIndex, 1);
    saveToLocalStorage();
    editorDirty = false;
    if (editIndex >= questions.length) editIndex = Math.max(0, questions.length - 1);
    renderBankEditor();
    updateBanksList();
    updateBankSelect();
}

// 编辑器内切换题目
function editorNavigate(delta) {
    const questions = currentEditBank();
    const target = editIndex + delta;
    if (target < 0 || target >= questions.length) return;
    if (!editorGuard()) return;
    editIndex = target;
    renderBankEditor();
}

// 关闭编辑器（清理未保存的空题）
function editorClose() {
    if (!editorGuard()) return;
    const questions = currentEditBank();
    const kept = questions.filter(q => (q.content || '').trim() || (q.answer || '').trim());
    if (kept.length !== questions.length) {
        questionBanks[editBankName] = kept;
        if (currentBankName === editBankName) questionBank = kept;
        saveToLocalStorage();
        refreshQuestionBankView();
    }
    editBankName = null;
    editIndex = 0;
    editorDirty = false;
    hideModal(editBankModal);
    updateBanksList();
}

// 复习错题：先选择范围（按题库/题型），再进入复习
function reviewErrors() {
    if (errorQuestions.length === 0) {
        alert('错题本中没有题目');
        return;
    }

    // 填充题库勾选（默认全选，带题数）
    scopeBanks.innerHTML = '';
    const bankNames = [...new Set(errorQuestions.map(q => q.bankName || '未知题库'))];
    bankNames.forEach(name => {
        const count = errorQuestions.filter(q => (q.bankName || '未知题库') === name).length;
        const label = document.createElement('label');
        label.className = 'inline-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'scope-bank';
        cb.value = name;
        cb.checked = true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(` ${name}（${count} 题）`));
        scopeBanks.appendChild(label);
    });

    updateScopeSummary();
    showModal(reviewScopeModal);
}

// 读取范围选择
function getScopeSelection() {
    const banks = new Set(
        Array.from(document.querySelectorAll('input[name="scope-bank"]:checked')).map(cb => cb.value)
    );
    const types = new Set(
        Array.from(document.querySelectorAll('input[name="scope-type"]:checked')).map(cb => cb.value)
    );
    return { banks, types };
}

// 刷新范围选择摘要
function updateScopeSummary() {
    const { banks, types } = getScopeSelection();
    const count = errorQuestions.filter(
        q => banks.has(q.bankName || '未知题库') && types.has(q.type)
    ).length;
    scopeSummary.textContent = `已选中 ${count} 题`;
}

// 开始一场复习会话
function startReviewSession(questions) {
    currentQuiz = [...questions];
    currentQuestionIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    userAnswers = new Array(currentQuiz.length).fill('');
    masteryRemovedInSession = 0;
    quizMode = 'immediate';
    endQuizBtn.textContent = '结束刷题';

    showSection('quiz'); // 切换到刷题页面
    quizContainer.classList.remove('hidden');
    quizResult.classList.add('hidden');
    quizSettings.classList.add('hidden');

    displayQuestion();
}

// 规范化选项答案：统一大写、只保留选项字母、去重并排序（用于判分比较，
// 避免"CA"vs"AC"、"A、B"vs"AB"这类写法差异导致误判）
function normalizeAnswerString(answer) {
    return (answer || '')
        .toUpperCase()
        .replace(/[^A-H]/g, '')
        .split('')
        .filter((ch, idx, arr) => arr.indexOf(ch) === idx)
        .sort()
        .join('');
}

// 重建当前题目视图：在"全部题库"合并视图下题库发生增删改后调用
function refreshQuestionBankView() {
    if (!isAllBanksView) return;
    questionBank = [];
    Object.values(questionBanks).forEach(bank => {
        questionBank = [...questionBank, ...bank];
    });
}

// 打乱数组
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// 显示刷题状态
function showQuizStatus(message, type) {
    quizStatus.textContent = message;
    quizStatus.className = 'status-message';
    quizStatus.classList.add(type);
    
    // 3秒后隐藏状态消息
    setTimeout(() => {
        quizStatus.className = 'status-message';
    }, 3000);
}

// ==================== 粘贴导入 + 导入预览向导（批次1） ====================

// 把剪贴板里的富文本 HTML 按块级元素拆成行（Word/网页/PDF 复制时保留结构）
function htmlToLines(html) {
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

// 粘贴事件：优先按富文本 HTML 读取（保留段落/表格结构），纯文本走默认行为
function handlePasteEvent(event) {
    const html = event.clipboardData && event.clipboardData.getData('text/html');
    if (!html) return;
    event.preventDefault();
    pasteInput.value = htmlToLines(html).join('\n');
    showImportStatus('已按富文本结构读取剪贴板内容', 'success');
}

function parsePastedText() {
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

// ---------- 导入预览向导 ----------

// 打开预览：questions 为解析结果数组
function openImportPreview(questions) {
    previewData = questions.map(q => ({ q, include: true, warnings: [] }));
    renderPreview();
    showModal(importPreviewModal);
}

function updatePreviewTargetBanks() {
    previewTargetBankSelect.innerHTML = '';
    Object.keys(questionBanks).forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = `${name}（${(questionBanks[name] || []).length} 题）`;
        previewTargetBankSelect.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '＋ 新建题库…';
    previewTargetBankSelect.appendChild(newOpt);
    if (Object.keys(questionBanks).length === 0) {
        previewTargetBankSelect.value = '__new__';
    }
}

function renderPreview() {
    previewList.innerHTML = '';
    const bankKeys = new Set();
    Object.values(questionBanks).forEach(bank => (bank || []).forEach(q => bankKeys.add(questionDedupKey(q))));

    let warnCount = 0;
    previewData.forEach((item, idx) => {
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

function updatePreviewSummary(warnCount) {
    const total = previewData.length;
    const included = previewData.filter(i => i.include).length;
    const warns = (typeof warnCount === 'number')
        ? warnCount
        : previewData.filter(i => i.warnings && i.warnings.length).length;
    previewSummary.textContent = `共解析 ${total} 题，已勾选 ${included} 题，${warns} 题含警告需要留意`;
}

function togglePreviewSelectAll() {
    previewData.forEach(i => { i.include = previewSelectAll.checked; });
    renderPreview();
}

// 确认导入：收集勾选项 → 重新规范化 → 去重 → 写入目标题库
function commitPreviewImport() {
    let targetName = previewTargetBankSelect.value;
    if (targetName === '__new__') {
        const name = (prompt('请输入新题库名称：') || '').trim();
        if (!name) return;
        targetName = name;
    }
    if (!questionBanks[targetName]) questionBanks[targetName] = [];

    const overwrite = previewOverwrite.checked;
    if (overwrite && questionBanks[targetName].length > 0 &&
        !confirm(`确定清空题库"${targetName}"并导入新题目吗？此操作不可恢复！`)) {
        return;
    }

    // 收集勾选且有答案的题（重新规范化保证答案/题型一致）
    const items = [];
    const seen = new Set();
    let droppedNoAnswer = 0;
    for (const item of previewData) {
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
    const existingKeys = new Set((overwrite ? [] : questionBanks[targetName]).map(questionDedupKey));
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
        questionBanks[targetName] = finalItems;
    } else {
        questionBanks[targetName].push(...finalItems);
    }

    // 切换到目标题库
    isAllBanksView = false;
    currentBankName = targetName;
    questionBank = questionBanks[targetName];

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

// 题库管理功能

// 更新题库列表
function updateBanksList() {
    const bankNames = Object.keys(questionBanks);

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
        const questions = questionBanks[bankName] || [];
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

// 显示模态框
function showModal(modal) {
    modal.classList.remove('hidden');
}

// 隐藏模态框
function hideModal(modal) {
    modal.classList.add('hidden');
    if (modal === createBankModal) {
        newBankNameInput.value = '';
    } else if (modal === renameBankModal) {
        renameBankNameInput.value = '';
        currentRenameBank = null;
    }
}

// 创建新题库
function createNewBank() {
    const bankName = newBankNameInput.value.trim();

    if (!bankName) {
        alert('请输入题库名称');
        return;
    }

    if (questionBanks[bankName]) {
        alert('该题库已存在');
        return;
    }

    questionBanks[bankName] = [];
    currentBankName = bankName;
    questionBank = questionBanks[bankName];
    isAllBanksView = false;

    saveToLocalStorage();
    updateBankSelect();
    questionBankSelect.value = bankName;
    updateBanksList();

    hideModal(createBankModal);
    alert('题库创建成功');
}

// 显示重命名模态框
function showRenameModal(bankName) {
    currentRenameBank = bankName;
    renameBankNameInput.value = bankName;
    showModal(renameBankModal);
}

// 重命名题库
function renameBank() {
    const newName = renameBankNameInput.value.trim();

    if (!newName) {
        alert('请输入新名称');
        return;
    }

    if (newName === currentRenameBank) {
        hideModal(renameBankModal);
        return;
    }

    if (questionBanks[newName]) {
        alert('该题库名称已存在');
        return;
    }

    questionBanks[newName] = questionBanks[currentRenameBank];
    delete questionBanks[currentRenameBank];

    if (currentBankName === currentRenameBank) {
        currentBankName = newName;
        questionBank = questionBanks[currentBankName];
    }

    saveToLocalStorage();
    refreshQuestionBankView();
    updateBankSelect();
    updateBanksList();

    hideModal(renameBankModal);
    alert('题库重命名成功');
}

// 删除题库
function deleteBank(bankName) {
    if (!confirm(`确定要删除题库"${bankName}"吗？此操作不可恢复！`)) {
        return;
    }

    if (currentBankName === bankName) {
        const bankNames = Object.keys(questionBanks).filter(name => name !== bankName);
        if (bankNames.length > 0) {
            currentBankName = bankNames[0];
            questionBank = questionBanks[currentBankName];
        } else {
            currentBankName = '默认题库';
            questionBank = [];
            questionBanks[currentBankName] = questionBank;
        }
    }

    delete questionBanks[bankName];

    saveToLocalStorage();
    refreshQuestionBankView();
    updateBankSelect();
    updateBanksList();

    alert('题库删除成功');
}

// 题库一键去重：按"题干+选项"指纹清理重复题（保留最早导入的版本）
function dedupBank(bankName) {
    const questions = questionBanks[bankName] || [];
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
    questionBanks[bankName] = kept;
    if (currentBankName === bankName) {
        questionBank = kept;
    }
    saveToLocalStorage();
    refreshQuestionBankView();
    updateBanksList();
    updateBankSelect();
    alert(`已清理 ${removed} 道重复题目`);
}

// 导出单个题库
function exportBank(bankName) {
    const questions = questionBanks[bankName];
    if (!questions || questions.length === 0) {
        alert('该题库为空，无法导出');
        return;
    }

    const content = formatQuestionsForExport(questions);
    downloadFile(`${bankName}.txt`, content);
}

// 导出所有题库
function exportAllBanks() {
    const bankNames = Object.keys(questionBanks);
    if (bankNames.length === 0) {
        alert('暂无题库可导出');
        return;
    }

    let allContent = '';
    bankNames.forEach(bankName => {
        const questions = questionBanks[bankName];
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

// 格式化题目用于导出
function formatQuestionsForExport(questions) {
    return questions.map(q => {
        let text = '';
        if (q.title) text += `# ${q.title}\n`;
        text += `题目：${q.content}\n`;

        Object.keys(q.options || {}).sort().forEach(key => {
            text += `${key}：${q.options[key]}\n`;
        });

        text += `答案：${q.answer}\n`;

        if (q.explanation) text += `题目解释：${q.explanation}\n`;
        if (q.analysis) text += `解析：${q.analysis}\n`;
        if (q.type) text += `类型：${q.type}\n`;

        Object.keys(q.optionExplanations || {}).sort().forEach(key => {
            text += `${key}解释：${q.optionExplanations[key]}\n`;
        });

        return text;
    }).join('\n');
}

// 下载文件
function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);