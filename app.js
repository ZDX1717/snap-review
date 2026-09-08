// 通用大学生刷题系统 JavaScript 代码

// 全局变量
let questionBanks = {}; // 多个题库，key为题库名，value为题目数组
let questionBank = []; // 当前题库（向后兼容）
let errorQuestions = []; // 错题本
let currentQuiz = []; // 当前刷题的题目列表
let currentQuestionIndex = 0; // 当前题目索引
let quizMode = 'with-explanation'; // 刷题模式
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

// 初始化
function init() {
    // 加载本地存储的数据
    loadFromLocalStorage();

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

// 查重键：题干（去空白）+ 规范化答案
function questionDedupKey(q) {
    return (q.content || '').replace(/\s+/g, '') + '|' + (q.answer || '').toUpperCase().replace(/[^A-H]/g, '');
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
    
    // 根据刷题模式显示题目解释
    if (quizMode === 'with-explanation') {
        questionExplanation.textContent = question.explanation || '';
        questionExplanation.classList.remove('hidden');
    } else {
        questionExplanation.classList.add('hidden');
    }
    
    // 显示选项
    const optionsContainer = document.querySelector('.options-container');
    optionsContainer.innerHTML = '';
    
    Object.keys(question.options).sort().forEach(optionKey => {
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
        
        // 根据刷题模式显示选项解释
        if (quizMode === 'with-explanation' && question.optionExplanations[optionKey]) {
            const optionExplanation = document.createElement('p');
            optionExplanation.className = 'option-explanation';
            optionExplanation.textContent = question.optionExplanations[optionKey];
            optionItem.appendChild(optionExplanation);
        }
        
        optionsContainer.appendChild(optionItem);
    });
    
    // 重置答题状态
    isAnswered = false;
    answerFeedback.classList.add('hidden');
    submitAnswerBtn.classList.remove('hidden');
    nextQuestionBtn.classList.add('hidden');
}

// 提交答案
function submitAnswer() {
    const question = currentQuiz[currentQuestionIndex];
    let userAnswer;
    
    if (question.type !== '多选') { // 单选/判断题：单选框
        const selectedOption = document.querySelector('input[name="answer"]:checked');
        if (!selectedOption) {
            alert('请选择一个答案');
            return;
        }
        userAnswer = selectedOption.value;
    } else {
        const selectedOptions = document.querySelectorAll('input[name="answer"]:checked');
        if (selectedOptions.length === 0) {
            alert('请至少选择一个答案');
            return;
        }
        userAnswer = Array.from(selectedOptions).map(option => option.value).sort().join('');
    }
    
    // 检查答案是否正确（两侧都规范化后再比较）
    const isCorrect = normalizeAnswerString(userAnswer) === normalizeAnswerString(question.answer);
    
    // 更新答题统计
    if (isCorrect) {
        correctCount++;
    } else {
        wrongCount++;
        
        // 将错题添加到错题本
        addToErrorBook(question, userAnswer);
    }
    
    // 显示答案反馈
    answerResult.textContent = isCorrect ? '回答正确！' : `回答错误！正确答案是：${question.answer}`;
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
    currentQuestionIndex++;
    
    if (currentQuestionIndex >= currentQuiz.length) {
        // 刷题完成，显示结果
        showQuizResult();
    } else {
        // 显示下一题
        displayQuestion();
    }
}

// 显示刷题结果
function showQuizResult() {
    quizContainer.classList.add('hidden');
    quizResult.classList.remove('hidden');
    
    // 已答题数：提前结束刷题时按实际已答题数计算正确率，而不是按总题数
    const answeredCount = Math.min(currentQuestionIndex + (isAnswered ? 1 : 0), currentQuiz.length);
    totalQuestions.textContent = currentQuiz.length;
    correctAnswers.textContent = correctCount;
    wrongAnswers.textContent = wrongCount;
    accuracy.textContent = answeredCount > 0
        ? `${((correctCount / answeredCount) * 100).toFixed(1)}%（已答 ${answeredCount} 题）`
        : '0%';
}

// 结束刷题
function endQuiz() {
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
            timestamp: new Date().toISOString()
        });
        
        // 保存到本地存储
        saveToLocalStorage();
    }
}

// 更新错题列表
function updateErrorsList() {
    if (errorQuestions.length === 0) {
        errorsList.innerHTML = '<p class="empty-message">暂无错题记录</p>';
        return;
    }
    
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

    // 显示每个题库的错题
    Object.keys(errorsByBank).forEach(bankName => {
        // 创建题库标题
        const bankTitle = document.createElement('div');
        bankTitle.className = 'bank-title';
        bankTitle.textContent = `${bankName} (${errorsByBank[bankName].length}题)`;
        errorsList.appendChild(bankTitle);

        // 创建题库容器
        const bankContainer = document.createElement('div');
        bankContainer.className = 'bank-errors';

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
        errorItem.appendChild(analysis);
        errorItem.appendChild(deleteBtn);
        
        bankContainer.appendChild(errorItem);
        });

        errorsList.appendChild(bankContainer);
    });
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
function reviewErrors() {
    if (errorQuestions.length === 0) {
        alert('错题本中没有题目');
        return;
    }
    
    // 使用错题作为刷题内容
    currentQuiz = [...errorQuestions];
    currentQuestionIndex = 0;
    correctCount = 0;
    wrongCount = 0;
    quizMode = 'with-explanation';
    
    // 显示刷题容器
    quizContainer.classList.remove('hidden');
    quizResult.classList.add('hidden');
    quizSettings.classList.add('hidden');
    
    // 显示第一道题
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

        bankActions.appendChild(renameBtn);
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