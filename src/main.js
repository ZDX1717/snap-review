import { buildAiNotes } from './ai.js';
import { state } from './state.js';
import { applyTheme, initTheme, setThemeSetting } from './theme.js';
import { finalizeQuestion, formatQuestionsForExport, normalizeAnswerString, parseQuestionsText, questionDedupKey, shuffleArray, splitInlineOptions } from './parser.js';
import { loadCollapsedBanks, loadFromLocalStorage, loadMasterySetting, saveCollapsedBanks, saveToLocalStorage, recordImportBatch } from './storage.js';
import { downloadFile, hideModal, showModal } from './dom.js';
import { addToErrorBook, clearErrors, deleteError, toggleAllBanks, updateErrorStreak, updateErrorsList, updateToggleAllBanksLabel } from './errorbook.js';
import { toggleFavorite, updateFavoritesList } from './favorites.js';
import { backToQuizOptions, collectUserAnswer, displayQuestion, endQuiz, finishExam, getScopeSelection, nextQuestion, prevQuestion, renderAnswerReview, reviewErrors, showQuizResult, showQuizStatus, showSection, startQuiz, startReviewSession, submitAnswer, toggleFavoriteCurrent, updateFavoriteButton, updateScopeSummary } from './quiz.js';
import { commitPreviewImport, createNewBank, currentEditBank, dedupBank, deleteBank, editBank, editorAddQuestion, editorClose, editorCollectOptions, editorDeleteCurrent, editorGuard, editorTogglePendingOnly, setPreviewView, editorMutateOptions, openAiSettings, aiProviderChanged, testAiConnection, saveAiSettings, previewAiFallback, cancelPreviewAi, rescueAiOrganize, updateAiSettingsBadge, editorNavigate, editorRenderForm, editorRenderOptions, editorSaveCurrent, exportAllBanks, exportBank, handleFileSelect, handlePasteEvent, htmlToLines, clearPasteInput, editorHistClick, keepCleanOnly, openImportPreview, parsePastedText, refreshQuestionBankView, togglePromptContent, copyOfficialPrompt, renameBank, renderBankEditor, renderPreview, restoreOverwriteSnapshot, showImportStatus, showRenameModal, togglePreviewSelectAll, undoLastImport, updateBankSelect, updateBanksList, updateLastImportInfo, updatePreviewSummary, updatePreviewTargetBanks, renderErrorsForBank, renderRecycleBin, restoreRecycled, recycleBankEntry } from './bank.js';

// Zquiz · 期末周刷题 —— 应用装配入口
// 依赖方向:main → 业务模块(quiz/errorbook/favorites/bank/dom)→ parser/storage/state。
// 禁止反向 import:业务模块不得引用 main。


// Zquiz · 期末周刷题 —— 应用装配入口
// 依赖方向:main → 业务模块(quiz/errorbook/favorites/bank/dom)→ parser/storage/state。
// 禁止反向 import:业务模块不得引用 main。


// Zquiz · 期末周刷题 —— 应用装配入口
// 依赖方向:main → 业务模块(quiz/errorbook/favorites/bank/dom)→ parser/storage/state。
// 禁止反向 import:业务模块不得引用 main。


// Zquiz · 期末周刷题 —— 应用装配入口
// 依赖方向:main → 业务模块(quiz/errorbook/favorites/bank/dom)→ parser/storage/state。
// 禁止反向 import:业务模块不得引用 main。


// Zquiz · 期末周刷题 —— 应用装配入口
// 依赖方向:main → 业务模块(quiz/errorbook/favorites/bank/dom)→ parser/storage/state。
// 禁止反向 import:业务模块不得引用 main。





// DOM 元素
const btnHome = document.getElementById('btn-home');
const btnQuiz = document.getElementById('btn-quiz');
const homeSection = document.getElementById('home-section');
const quizSection = document.getElementById('quiz-section');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
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
const errorsList = document.getElementById('errors-list');
const questionBankSelect = document.getElementById('question-bank-select');
const quizSettings = document.getElementById('quiz-settings');
const btnBanks = document.getElementById('btn-banks');
const createBankBtn = document.getElementById('create-bank-btn');
const exportAllBtn = document.getElementById('export-all-btn');
const banksList = document.getElementById('banks-list');
const createBankModal = document.getElementById('create-bank-modal');
const renameBankModal = document.getElementById('rename-bank-modal');
const newBankNameInput = document.getElementById('new-bank-name');
const renameBankNameInput = document.getElementById('rename-bank-name');
const confirmCreateBankBtn = document.getElementById('confirm-create-bank-btn');
const cancelCreateBankBtn = document.getElementById('cancel-create-bank-btn');
const confirmRenameBankBtn = document.getElementById('confirm-rename-bank-btn');
const cancelRenameBankBtn = document.getElementById('cancel-rename-bank-btn');

// 粘贴导入与预览向导
const pasteInput = document.getElementById('paste-input');
const pasteParseBtn = document.getElementById('paste-parse-btn');
const pasteClearBtn = document.getElementById('paste-clear-btn');
const importPreviewModal = document.getElementById('import-preview-modal');
const previewSummary = document.getElementById('preview-summary');
const previewSelectAll = document.getElementById('preview-select-all');
const previewCleanBtn = document.getElementById('preview-clean-btn');
const copyPromptBtn = document.getElementById('copy-prompt-btn');
const promptToggleBtn = document.getElementById('prompt-toggle-btn');
const viewAllBtn = document.getElementById('view-all-btn');
const viewWarnedBtn = document.getElementById('view-warned-btn');
const undoImportBtn = document.getElementById('undo-import-btn');
const restoreSnapshotBtn = document.getElementById('restore-snapshot-btn');
const previewSkipDupes = document.getElementById('preview-skip-dupes');
const previewList = document.getElementById('preview-list');
const previewTargetBankSelect = document.getElementById('preview-target-bank');
const previewOverwrite = document.getElementById('preview-overwrite');
const previewConfirmBtn = document.getElementById('preview-confirm-btn');
const previewCancelBtn = document.getElementById('preview-cancel-btn');
// AI 设置与预览兜底
const aiSettingsBtn = document.getElementById('ai-settings-btn');
const rescueAiBtn = document.getElementById('rescue-ai-btn');
const aiSettingsModal = document.getElementById('ai-settings-modal');
const aiProviderSelect = document.getElementById('ai-provider-select');
const aiTestBtn = document.getElementById('ai-test-btn');
const aiSaveBtn = document.getElementById('ai-save-btn');
const aiCancelBtn = document.getElementById('ai-cancel-btn');
const previewAiBtn = document.getElementById('preview-ai-btn');
const previewAiCancelBtn = document.getElementById('preview-ai-cancel-btn');

// 套题模式与答题回顾
const prevQuestionBtn = document.getElementById('prev-question-btn');
const unansweredCountEl = document.getElementById('unanswered-count');
const answerReview = document.getElementById('answer-review');
const reviewOnlyWrong = document.getElementById('review-only-wrong');
const masteryNote = document.getElementById('mastery-note');
const favoriteBtn = document.getElementById('favorite-btn');
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
const editorPendingOnly = document.getElementById('editor-pending-only');
const editorHistRow = document.getElementById('editor-hist-row');
const editorCloseBtn = document.getElementById('editor-close-btn');
const editorPosition = document.getElementById('editor-position');

// 首页快捷入口
const themeSwitch = document.getElementById('theme-switch');
const heroStartBtn = document.getElementById('hero-start-btn');
const heroImportBtn = document.getElementById('hero-import-btn');

// 初始化
function init() {
    // 主题(暗色模式)先行,避免闪白
    initTheme();

    // 加载本地存储的数据
    loadFromLocalStorage();
    loadCollapsedBanks();
    masteryThresholdSelect.value = String(loadMasterySetting());

    // 更新题库选择下拉框与最近导入信息;AI 连接徽章
    updateBankSelect();
    updateLastImportInfo();
    updateAiSettingsBadge();

    // 初始状态下拉框与实际加载的题库保持一致
    // （页面默认显示"全部题库"，但初始数据只加载了第一个题库，二者必须一致）
    if (Object.keys(state.questionBanks).length > 0) {
        state.isAllBanksView = false;
        questionBankSelect.value = state.currentBankName;
    }
    
    // 设置事件监听器
    setupEventListeners();
    
    // 显示首页
    showSection('home');
}

// 设置事件监听器
function setupEventListeners() {
    // 导航按钮
    btnHome.addEventListener('click', () => showSection('home'));
    btnQuiz.addEventListener('click', () => showSection('quiz'));
    btnBanks.addEventListener('click', () => showSection('banks'));
    
    // 文件上传
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // 题库选择变化
    questionBankSelect.addEventListener('change', function() {
        const selectedBank = this.value;
        if (selectedBank === 'all') {
            // 合并所有题库为临时视图（此视图下保存时不会回写题库数据）
            state.isAllBanksView = true;
            state.questionBank = [];
            Object.values(state.questionBanks).forEach(bank => {
                state.questionBank = [...state.questionBank, ...bank];
            });
        } else {
            // 选择特定题库
            state.isAllBanksView = false;
            state.currentBankName = selectedBank;
            state.questionBank = state.questionBanks[selectedBank];
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

    // 收藏夹
    reviewFavoritesBtn.addEventListener('click', reviewFavorites);
    favoriteBtn.addEventListener('click', toggleFavoriteCurrent);

    // 错题移出规则设置
    masteryThresholdSelect.addEventListener('change', function() {
        state.masteryThreshold = parseInt(this.value, 10) || 0;
        localStorage.setItem('masteryThresholdSetting', String(state.masteryThreshold));
        updateErrorsList();
    });

    // 复习范围选择
    confirmReviewScopeBtn.addEventListener('click', () => {
        const { banks, types } = getScopeSelection();
        const questions = state.errorQuestions.filter(
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
    editorPendingOnly.addEventListener('change', (e) => editorTogglePendingOnly(e.target.checked));
    editorHistRow.addEventListener('click', editorHistClick);
    editorPrevBtn.addEventListener('click', () => editorNavigate(-1));
    editorNextBtn.addEventListener('click', () => editorNavigate(1));
    editorDeleteBtn.addEventListener('click', editorDeleteCurrent);
    editorAddOption.addEventListener('click', () => editorMutateOptions(1));
    editorRemoveOption.addEventListener('click', () => editorMutateOptions(-1));
    editorType.addEventListener('change', () => { state.editorDirty = true; editorRenderOptions(); });
    editorStem.addEventListener('input', () => { state.editorDirty = true; });
    editorAnswer.addEventListener('input', () => { state.editorDirty = true; });
    editorExplanation.addEventListener('input', () => { state.editorDirty = true; });
    editorAnalysis.addEventListener('input', () => { state.editorDirty = true; });

    // 题库管理
    createBankBtn.addEventListener('click', () => showModal(createBankModal));
    cancelCreateBankBtn.addEventListener('click', () => hideModal(createBankModal));
    confirmCreateBankBtn.addEventListener('click', createNewBank);
    cancelRenameBankBtn.addEventListener('click', () => hideModal(renameBankModal));
    confirmRenameBankBtn.addEventListener('click', renameBank);
    exportAllBtn.addEventListener('click', exportAllBanks);

    // 粘贴导入
    pasteInput.addEventListener('paste', handlePasteEvent);
    pasteParseBtn.addEventListener('click', parsePastedText);
    copyPromptBtn.addEventListener('click', copyOfficialPrompt);
    promptToggleBtn.addEventListener('click', togglePromptContent);
    viewAllBtn.addEventListener('click', () => setPreviewView(false));
    viewWarnedBtn.addEventListener('click', () => setPreviewView(true));
    pasteClearBtn.addEventListener('click', clearPasteInput);

    // 导入预览向导
    previewSelectAll.addEventListener('change', togglePreviewSelectAll);
    previewCleanBtn.addEventListener('click', keepCleanOnly);

    // 导入撤销与覆盖快照恢复
    undoImportBtn.addEventListener('click', undoLastImport);
    restoreSnapshotBtn.addEventListener('click', restoreOverwriteSnapshot);
    previewConfirmBtn.addEventListener('click', commitPreviewImport);

    // AI 设置与预览兜底(0.9.0)
    aiSettingsBtn.addEventListener('click', openAiSettings);
    rescueAiBtn.addEventListener('click', rescueAiOrganize);
    aiProviderSelect.addEventListener('change', aiProviderChanged);
    aiTestBtn.addEventListener('click', testAiConnection);
    aiSaveBtn.addEventListener('click', saveAiSettings);
    aiCancelBtn.addEventListener('click', () => hideModal(aiSettingsModal));
    previewAiBtn.addEventListener('click', previewAiFallback);
    previewAiCancelBtn.addEventListener('click', cancelPreviewAi);
    previewCancelBtn.addEventListener('click', () => hideModal(importPreviewModal));

    // 套题模式翻页与答题回顾
    prevQuestionBtn.addEventListener('click', prevQuestion);
    reviewOnlyWrong.addEventListener('change', renderAnswerReview);

    // 主题三档开关(事件委托)
    themeSwitch.addEventListener('click', (e) => {
        const opt = e.target && e.target.closest ? e.target.closest('.theme-opt') : null;
        if (opt) setThemeSetting(opt.dataset.themeOpt);
    });

    // 首页快捷入口
    heroStartBtn.addEventListener('click', () => showSection('quiz'));
    heroImportBtn.addEventListener('click', () => { pasteInput.focus(); });
}





// ==================== 题目解析（批次1：多格式自动识别） ====================
//
// 支持的格式家族（自动识别，无需用户选择）：
//   A. 字段式：  题目：xxx / A：xxx / 答案：x（原有格式，完整保留）
//   B. 编号式：  1. 题干 / A. 选项（逐行）/ 答案：x（最常见的题库排版）
//   C. 混排式：  1. 题干 A.xx B.xx C.xx D.xx 答案：x（单行，常见于网页/微信复制）
//   D. 判断题：  答案为 对/错/√/×/正确/错误，自动配 A正确/B错误 两个选项
// 每题输出置信度，供导入预览向导提示需要人工确认的题。















// ==================== 收藏夹 ====================





// 复习收藏：以逐题模式过一遍收藏题
function reviewFavorites() {
    if (state.favoriteQuestions.length === 0) {
        alert('收藏夹是空的，刷题时点击"☆ 收藏"即可加入');
        return;
    }

    state.currentQuiz = [...state.favoriteQuestions];
    state.currentQuestionIndex = 0;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.userAnswers = new Array(state.currentQuiz.length).fill('');
    state.masteryRemovedInSession = 0;
    state.quizMode = 'immediate';
    endQuizBtn.textContent = '结束刷题';

    showSection('quiz');
    quizContainer.classList.remove('hidden');
    quizResult.classList.add('hidden');
    quizSettings.classList.add('hidden');

    displayQuestion();
}

// 更新错题列表






// 复习错题
// ==================== 题库编辑器 ====================




















// ==================== 粘贴导入 + 导入预览向导（批次1） ====================




// ---------- 导入预览向导 ----------







// 题库管理功能












// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// ==================== 测试钩子(仅 Node vm 测试环境挂载) ====================
// 浏览器中 window 存在,本代码不执行,不污染任何全局。
if (typeof window === 'undefined') {
    globalThis.__zquiz = {
        state,
        addToErrorBook,
        backToQuizOptions,
        applyTheme,
        setThemeSetting,
        clearErrors,
        clearPasteInput,
        collectUserAnswer,
        commitPreviewImport,
        keepCleanOnly,
        createNewBank,
        currentEditBank,
        dedupBank,
        deleteBank,
        restoreOverwriteSnapshot,
        deleteError,
        displayQuestion,
        undoLastImport,
        updateLastImportInfo,
        downloadFile,
        editBank,
        editorAddQuestion,
        editorClose,
        editorCollectOptions,
        editorDeleteCurrent,
        editorGuard,
        editorMutateOptions,
        editorNavigate,
        editorRenderForm,
        editorRenderOptions,
        editorSaveCurrent,
        editorTogglePendingOnly,
        editorHistClick,
        endQuiz,
        exportAllBanks,
        exportBank,
        finalizeQuestion,
        finishExam,
        formatQuestionsForExport,
        getScopeSelection,
        handleFileSelect,
        handlePasteEvent,
        hideModal,
        htmlToLines,
        init,
        loadCollapsedBanks,
        loadFromLocalStorage,
        loadMasterySetting,
        nextQuestion,
        normalizeAnswerString,
        openImportPreview,
        parsePastedText,
        parseQuestionsText,
        prevQuestion,
        questionDedupKey,
        refreshQuestionBankView,
        recordImportBatch,
        renameBank,
        renderAnswerReview,
        renderBankEditor,
        renderPreview,
        reviewErrors,
        reviewFavorites,
        saveCollapsedBanks,
        saveToLocalStorage,
        setupEventListeners,
        showImportStatus,
        showModal,
        showQuizResult,
        showQuizStatus,
        showRenameModal,
        showSection,
        shuffleArray,
        splitInlineOptions,
        startQuiz,
        startReviewSession,
        submitAnswer,
        toggleAllBanks,
        toggleFavorite,
        toggleFavoriteCurrent,
        togglePreviewSelectAll,
        openAiSettings,
        buildAiNotes,
        aiProviderChanged,
        testAiConnection,
        saveAiSettings,
        previewAiFallback,
        setPreviewView,
        rescueAiOrganize,
        updateAiSettingsBadge,
        cancelPreviewAi,
        updateBankSelect,
        updateBanksList,
        updateErrorStreak,
        updateErrorsList,
        renderErrorsForBank,
        restoreRecycled,
        recycleBankEntry,
        updateFavoriteButton,
        updateFavoritesList,
        updatePreviewSummary,
        updatePreviewTargetBanks,
        updateScopeSummary,
        updateToggleAllBanksLabel,
    };
}
