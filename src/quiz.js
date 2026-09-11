import { state } from './state.js';
import { formatAnswerForDisplay, normalizeAnswerString, shuffleArray } from './parser.js';
import { addToErrorBook, updateErrorStreak, updateErrorsList } from './errorbook.js';
import { toggleFavorite, updateFavoritesList } from './favorites.js';
import { updateBanksList, updateLastImportInfo, renderRecycleBin } from './bank.js';

// ==================== quiz.js ====================
// 自动拆分自 main.js;依赖方向见各 import。


const quizStatus = document.getElementById('quiz-status');
const quizContainer = document.getElementById('quiz-container');
const questionNumber = document.getElementById('question-number');
const questionType = document.getElementById('question-type');
const questionText = document.getElementById('question-text');
const questionExplanation = document.getElementById('question-explanation');
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
const answeredNote = document.getElementById('answered-note');
const quizSettings = document.getElementById('quiz-settings');
const prevQuestionBtn = document.getElementById('prev-question-btn');
const unansweredCountEl = document.getElementById('unanswered-count');
const answerReview = document.getElementById('answer-review');
const reviewOnlyWrong = document.getElementById('review-only-wrong');
const masteryNote = document.getElementById('mastery-note');
const favoriteBtn = document.getElementById('favorite-btn');
const autoNextBtn = document.getElementById('auto-next-toggle');

// 开始刷题
// 题源 → 题目池。"复习错题/收藏"不再是独立入口,而是与题库并列的题源;
// 范围(哪些库/哪些题型)由「题源 + 选择题库 + 题型」三组设置共同表达,
// 因此原先的复习范围弹窗(#review-scope-modal)已退役。
// 题源取值:只认这三种,其余(空串/未渲染/旧 DOM/测试桩)一律回退题库。
// 不能只判断"元素是否存在"——测试桩会返回 value 为 '' 的元素,空串是非法题源。
export const QUIZ_SOURCES = ['bank', 'errors', 'favorites'];

export function getSourcePool(source) {
    if (source === 'errors') return [...state.errorQuestions];
    if (source === 'favorites') return [...state.favoriteQuestions];
    return [...state.questionBank];
}

// 读取当前题源(带合法性回退)
export function readQuizSource() {
    const el = document.querySelector('input[name="question-source"]:checked');
    const v = el ? el.value : '';
    return QUIZ_SOURCES.includes(v) ? v : 'bank';
}

// 题源为空时的提示文案(每种来源给出各自的下一步动作指引)
const EMPTY_SOURCE_HINT = {
    bank: '请先导入题库',
    errors: '错题本还没有题目——刷题时答错或未作答的题会自动进来',
    favorites: '收藏夹还没有题目——刷题时点 ☆ 收藏即可加入',
};

export function startQuiz() {
    cancelAutoNext();
    // 题源:题库 / 错题本 / 收藏夹
    const source = readQuizSource();
    let pool = getSourcePool(source);

    if (pool.length === 0) {
        showQuizStatus(EMPTY_SOURCE_HINT[source] || '没有可刷的题目', 'error');
        return;
    }

    // 获取刷题设置
    state.quizMode = document.querySelector('input[name="quiz-mode"]:checked').value;
    const questionType = document.querySelector('input[name="question-type"]:checked').value;
    const randomize = document.getElementById('randomize').checked;

    // 「选择题库」对三种题源都生效,但实现方式不同:
    //  - 题库题源:state.questionBank 已由下拉框 change 处理按库收窄 —— 此处**必须不再按 bankName 过滤**。
    //    导入的题不带 bankName(靠"属于哪个库数组"表达归属),按 bankName 过滤会把整库题全滤掉。
    //  - 错题/收藏题源:这两类在入库时会写入 bankName(见 errorbook/favorites),故按 bankName 收窄。
    if (source !== 'bank') {
        const bankSel = document.getElementById('question-bank-select');
        const bankChoice = bankSel ? bankSel.value : 'all';
        if (bankChoice && bankChoice !== 'all') {
            pool = pool.filter(q => (q.bankName || '未知题库') === bankChoice);
        }
    }

    // 筛选题目(题型过滤对三种题源一视同仁)
    let filteredQuestions = pool;

    if (questionType === 'single') {
        filteredQuestions = pool.filter(q => q.type === '单选');
    } else if (questionType === 'multiple') {
        filteredQuestions = pool.filter(q => q.type === '多选');
    } else if (questionType === 'judge') {
        filteredQuestions = pool.filter(q => q.type === '判断');
    }

    // 待补答案的题自动排除(无法判分);全部被排除时给出明确指引
    const pendingCount = filteredQuestions.filter(q => !q.answer).length;
    filteredQuestions = filteredQuestions.filter(q => q.answer);

    if (filteredQuestions.length === 0) {
        showQuizStatus(pendingCount > 0
            ? `没有符合条件的题目（有 ${pendingCount} 题待补答案，请在题库编辑器中补齐后再刷）`
            : '没有符合条件的题目', 'error');
        return;
    }
    
    // 随机打乱题目顺序
    if (randomize) {
        filteredQuestions = shuffleArray(filteredQuestions);
    }
    
    // 初始化刷题状态
    state.currentQuiz = filteredQuestions;
    state.currentQuestionIndex = 0;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.userAnswers = new Array(state.currentQuiz.length).fill('');
    endQuizBtn.textContent = state.quizMode === 'exam' ? '交卷' : '结束刷题';
    reviewOnlyWrong.checked = false;
    state.masteryRemovedInSession = 0;
    Object.keys(q_feedback).forEach(k => delete q_feedback[k]);
    
    // 显示刷题容器
    quizContainer.classList.remove('hidden');
    quizResult.classList.add('hidden');
    quizSettings.classList.add('hidden');
    
    // 显示第一道题
    displayQuestion();
}


// 显示题目
export function displayQuestion() {
    const question = state.currentQuiz[state.currentQuestionIndex];
    
    // 更新题目信息
    questionNumber.textContent = `${state.currentQuestionIndex + 1}/${state.currentQuiz.length}`;
    questionType.textContent = question.type;
    questionText.textContent = question.content;


    
    // 题目解释：逐题模式作答时可见；套题模式交卷前隐藏（回顾时统一展示）
    if (state.quizMode !== 'exam') {
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

        // 方案 A:卡片选中态 + 逐题模式单选/判断点选即判
        inputElement.addEventListener('change', () => {
            optionItem.classList.toggle('selected', inputElement.checked);
            clearQuizHint();   // 已动手选择 → 提示自然失效
            if (inputElement.checked && question.type !== '多选') {
                optionsContainer.querySelectorAll('.option-item').forEach(o => o.classList.remove('selected'));
                optionItem.classList.add('selected');
                if (state.quizMode !== 'exam' && !state.isAnswered) submitAnswer();
            }
            // 多选:不自动判分 —— 由「下一题」承担"确认答案"的职责(👤 决定)
        });
        
        // 选项解释：仅逐题模式作答时显示
        if (state.quizMode !== 'exam' && (question.optionExplanations || {})[optionKey]) {
            const optionExplanation = document.createElement('p');
            optionExplanation.className = 'option-explanation';
            optionExplanation.textContent = question.optionExplanations[optionKey];
            optionItem.appendChild(optionExplanation);
        }
        
        optionsContainer.appendChild(optionItem);
    });
    
    // 翻页回来时恢复已保存的作答(套题可改;逐题回看时为只读展示)
    // ⚠️ 必须同时恢复卡片高亮:原生 radio/checkbox 是**视觉隐藏**的(选中态由 .option-item.selected
    // 的卡片高亮表达),只设 inp.checked 时界面上"看不到刚才选了啥"(👤 反馈的 bug)。
    const savedAnswer = state.userAnswers[state.currentQuestionIndex] || '';
    if (savedAnswer) {
        optionsContainer.querySelectorAll('.option-item').forEach(optionItem => {
            const inp = optionItem.querySelector('input[name="answer"]');
            if (!inp) return;
            inp.checked = question.type === '多选' ? savedAnswer.includes(inp.value) : inp.value === savedAnswer;
            optionItem.classList.toggle('selected', inp.checked);
        });
    }

    // 回到这一题时先把"上一题的残留"清掉(反馈区/末尾按钮高亮)
    answerFeedback.classList.add('hidden');
    answerResult.textContent = '';
    answerExplanation.textContent = '';
    endQuizBtn.classList.remove('ready');
    state.isAnswered = false;

    // 刷新收藏按钮状态
    updateFavoriteButton();
    // 自动下一题按钮只在逐题模式出现(套题模式不支持,见 shouldAutoNext)
    if (autoNextBtn) autoNextBtn.classList.toggle('hidden', state.quizMode === 'exam');

    // 重置答题状态与按钮（逐题模式 vs 套题模式）
    if (state.quizMode === 'exam') {
        // 套题模式:上一题 / 下一题 / 交卷 **从左到右常驻**。
        // 旧版在首题隐藏"上一题"、末题隐藏"下一题",于是按钮会随位置忽隐忽现,
        // 看起来像"上一题和下一题在循环"(👤 反馈的 bug)。
        // 现在改为**始终可见**,只在边界置灰禁用 —— 位置稳定,不会造成误解。
        // ⚠️ 必须显式 remove('hidden'):该按钮在 HTML 里初始带 hidden,
        // 只设置禁用态会留下 hidden,导致"按钮不见了"(👤 反馈的 bug)。
        prevQuestionBtn.classList.remove('hidden');
        nextQuestionBtn.classList.remove('hidden');
        setNavEnabled(prevQuestionBtn, state.currentQuestionIndex > 0);
        setNavEnabled(nextQuestionBtn, state.currentQuestionIndex < state.currentQuiz.length - 1);
    } else {
        // 逐题模式:上一题 | 下一题 | 结束刷题(👤 要求逐题模式也能回看)
        prevQuestionBtn.classList.remove('hidden');
        setNavEnabled(prevQuestionBtn, state.currentQuestionIndex > 0);
        // 单选/判断点卡片即判分;多选勾选后点「下一题」即确认并判分
        nextQuestionBtn.classList.remove('hidden');
        setNavEnabled(nextQuestionBtn, state.currentQuestionIndex < state.currentQuiz.length - 1);

        // 逐题模式:回到已判分的题时复现当时的结果(着色/反馈/解析)——👤 要求"保留判分结果和解析"
        if (state.userAnswers[state.currentQuestionIndex]) {
            state.isAnswered = true;
            restoreGradedAnswer(question, state.userAnswers[state.currentQuestionIndex]);
        }
    }

    markEndButtonReady();
    bindQuizGestures();
}

// 翻页按钮的"可见但不可用"状态:保持位置稳定,仅置灰并屏蔽点击。
// 必须用**原生 disabled 属性** —— 仅 pointer-events:none 挡不住程序化 .click(),
// 末题误点"下一题"会重复交卷、重复计数(测试已复现)。
// 禁用态外观由 CSS 显式接管(.action-btn:disabled),不依赖浏览器默认样式。
function setNavEnabled(btn, enabled) {
    if (!btn) return;
    btn.disabled = !enabled;
}

// 每题的"判分反馈"留档(index → {text, cls, explanation}),回看时原样复现。
// 不重新推导文案:当次可能有"已连对 N 次,移出错题本"等上下文信息,重建会丢。
const q_feedback = {};

// 选项卡片判分标色(对绿/错红/正确项高亮)并禁改。
// 抽成函数是为了让"回看已判分的题"能复用同一套着色,而不是各写一份。
function paintGradedOptions(question, userAnswer, isCorrect, optsContainer) {
    const host = optsContainer || document.querySelector('.options-container');
    if (!host) return;
    const correctSet = new Set(normalizeAnswerString(question.answer).split(''));
    const userSet = new Set(normalizeAnswerString(userAnswer || '').split(''));
    host.querySelectorAll('.option-item').forEach(item => {
        const inp = item.querySelector('input[name="answer"]');
        if (!inp) return;
        inp.disabled = true;
        // 判分后的选中态改由 correct/incorrect 承载(绿/红),不再用 .selected 的琥珀底
        item.classList.remove('selected');
        if (correctSet.has(inp.value)) item.classList.add('correct-card', 'correct');
        if (userSet.has(inp.value) && !isCorrect) item.classList.add('wrong-card', 'incorrect');
    });
}

// 最后一题的「结束刷题 / 交卷」在判分完成后变色,提示"可以收尾了"(👤 要求)
function markEndButtonReady() {
    const isLast = state.currentQuestionIndex >= state.currentQuiz.length - 1;
    endQuizBtn.classList.toggle('ready', isLast && state.isAnswered);
}

// 回看已判分的题:把判分着色、反馈文案与解析一并恢复(👤 要求)
// ⚠️ 逐题模式下这一题已经判过分,回看是"复现当时的结果",不是让用户重答。
function restoreGradedAnswer(question, userAnswer) {
    if (!userAnswer) return;
    const isCorrect = normalizeAnswerString(userAnswer) === normalizeAnswerString(question.answer);
    const saved = q_feedback[state.currentQuestionIndex];
    if (saved) {
        // 原样复现当次反馈(文案与样式都照搬)
        answerResult.textContent = saved.text;
        answerResult.className = saved.cls;
        answerExplanation.textContent = saved.explanation;
    } else {
        // 无留档(如跨会话/直接跳题):回退到按答案推导
        answerResult.textContent = isCorrect
            ? '回答正确！'
            : `回答错误！正确答案是：${formatAnswerForDisplay(question.answer, question)}`;
        answerResult.className = isCorrect ? 'correct-answer' : 'wrong-answer';
        answerExplanation.textContent = question.analysis || '';
    }
    answerFeedback.classList.remove('hidden');
    paintGradedOptions(question, userAnswer, isCorrect);
    markEndButtonReady();
}

// ==================== 行内轻提示 ====================
// 替代 alert:用于"还没选答案就想切题/结束"这类提醒。
// 显示在状态栏上方的窄条里,选中答案即消失,不打断操作。
let hintTimer = null;

export function showQuizHint(text) {
    const el = document.getElementById('quiz-hint');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    if (hintTimer !== null) cancelTimer(hintTimer);
    hintTimer = setTimeout(() => { el.classList.add('hidden'); hintTimer = null; }, 2200);
}

export function clearQuizHint() {
    const el = document.getElementById('quiz-hint');
    if (el) el.classList.add('hidden');
    if (hintTimer !== null) { cancelTimer(hintTimer); hintTimer = null; }
}

// ==================== 自动下一题 ====================
// 语义(👤 需求,按模式区分):
//   逐题模式:答**对**才自动翻页;答错**停留**在当前题(要看解析、消化错因)。
//   套题模式:作答后一律自动翻页(套题本就不即时反馈,停着没有意义)。
// 细节:
//   · 延迟 900ms 再翻,留出看反馈/选项判色动画的时间,避免"闪一下就没了"。
//   · 最后一题不自动翻(逐题模式交由用户点「结束刷题」;套题模式点「交卷」)。
//   · 任何手动翻页/结束/离开都会取消待执行的定时器,防止"手点完又被自动带走"。
const AUTO_NEXT_DELAY_MS = 450;   // 切题要跟手;450ms 足够看清判定色而不拖沓(👤:快点)
let autoNextTimer = null;

function cancelAutoNext() {
    if (autoNextTimer !== null) {
        cancelTimer(autoNextTimer);
        autoNextTimer = null;
    }
}

// 定时器工具守卫:vm 测试沙箱只桩了 setTimeout,没有 clearTimeout
function cancelTimer(id) {
    if (typeof clearTimeout === 'function') clearTimeout(id);
}

// 纯判定:这次作答之后该不该自动翻页。抽出成纯函数以便单测
// (vm 沙箱的 setTimeout 是空实现,定时器本身在测试里不会触发)
export function shouldAutoNext(isCorrect, { autoNext, quizMode, index, total } = {}) {
    if (!autoNext) return false;                       // 开关关闭 → 永不自动
    // 套题模式**不支持**自动下一题(👤 决定):套题是整组作答+交卷后统一判分,
    // 作答时并不知道对错,"答对才翻"无从谈起,一律自动翻又会让用户没机会检查/回改。
    if (quizMode === 'exam') return false;
    if (!isCorrect) return false;                     // 逐题模式答错 → 停留消化解析
    return index < total - 1;                          // 最后一题不自动翻(留给「结束刷题」)
}

// 作答后调用:是否安排自动翻页由模式与对错共同决定
function scheduleAutoNext(isCorrect) {
    cancelAutoNext();
    if (!shouldAutoNext(isCorrect, {
        autoNext: state.autoNext,
        quizMode: state.quizMode,
        index: state.currentQuestionIndex,
        total: state.currentQuiz.length,
    })) return;
    autoNextTimer = setTimeout(() => {
        autoNextTimer = null;
        // 兜底:期间可能已结束或换题,状态不一致就不动
        if (quizContainer.classList.contains('hidden')) return;
        nextQuestion();
    }, AUTO_NEXT_DELAY_MS);
}

// 方案 A:左右滑切题 + 长按收藏(仅绑定一次)
function bindQuizGestures() {
    const host = document.querySelector('.quiz-container');
    if (!host || host.dataset.gestureBound) return;
    host.dataset.gestureBound = '1';
    let tsX = 0, tsY = 0, pressTimer = null;
    host.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        tsX = t.clientX; tsY = t.clientY;
        pressTimer = setTimeout(() => toggleFavoriteCurrent(), 600); // 长按收藏
    }, { passive: true });
    host.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
    host.addEventListener('touchend', (e) => {
        clearTimeout(pressTimer);
        const t = e.changedTouches[0];
        const dx = t.clientX - tsX, dy = t.clientY - tsY;
        if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
        const isLast = state.currentQuestionIndex >= state.currentQuiz.length - 1;
        if (dx < 0) { // 左滑:下一题(未作答的题按"确认答案"处理)
            // 最后一题不允许用手势前进 —— 收尾必须走「结束刷题」/「交卷」,避免误滑结束
            if (isLast) return;
            advanceNext();
        } else if (state.currentQuestionIndex > 0) {
            prevQuestion(); // 右滑:上一题(逐题模式也能回看,答过的题已锁定不可改)
        }
    }, { passive: true });
}


// 读取当前题的用户作答（单选/判断返回字母，多选返回排序后的字母串，未选返回 ''）
export function collectUserAnswer() {
    const question = state.currentQuiz[state.currentQuestionIndex];
    if (question.type !== '多选') { // 单选/判断题：单选框
        const selectedOption = document.querySelector('input[name="answer"]:checked');
        return selectedOption ? selectedOption.value : '';
    }
    const selectedOptions = document.querySelectorAll('input[name="answer"]:checked');
    return Array.from(selectedOptions).map(option => option.value).sort().join('');
}


// 提交答案（逐题模式）
export function submitAnswer() {
    const question = state.currentQuiz[state.currentQuestionIndex];
    const userAnswer = collectUserAnswer();

    if (!userAnswer) {
        // 不用 alert 弹窗(👤 要求):内联提示更轻,且不打断视线
        showQuizHint(question.type === '多选' ? '请至少选择一个答案' : '请先选择答案');
        return;
    }
    clearQuizHint();

    // 记录作答，供结果页逐题回顾
    state.userAnswers[state.currentQuestionIndex] = userAnswer;
    
    // 检查答案是否正确（两侧都规范化后再比较）
    const isCorrect = normalizeAnswerString(userAnswer) === normalizeAnswerString(question.answer);
    
    // 更新答题统计与错题闭环
    let removedFromErrorBook = 0;
    if (isCorrect) {
        state.correctCount++;
    } else {
        state.wrongCount++;

        // 将错题添加到错题本
        addToErrorBook(question, userAnswer);
    }
    // 已在错题本中的题：答对累计连对（达阈值自动移出），答错清零
    removedFromErrorBook += updateErrorStreak(question, isCorrect, userAnswer);
    scheduleAutoNext(isCorrect);
    state.masteryRemovedInSession += removedFromErrorBook;

    // 显示答案反馈
    answerResult.textContent = isCorrect
        ? (removedFromErrorBook > 0
            ? `回答正确！已连对 ${state.masteryThreshold} 次，移出错题本 🎉`
            : '回答正确！')
        : `回答错误！正确答案是：${formatAnswerForDisplay(question.answer, question)}`;
    answerResult.className = isCorrect ? 'correct-answer' : 'wrong-answer';
    answerExplanation.textContent = question.analysis || '';
    answerFeedback.classList.remove('hidden');
    // 留档:回看这一题时原样复现(含"已连对 N 次,移出错题本"这类当次提示)
    q_feedback[state.currentQuestionIndex] = {
        text: answerResult.textContent,
        cls: answerResult.className,
        explanation: answerExplanation.textContent,
    };

    paintGradedOptions(question, userAnswer, isCorrect);

    // 更新按钮状态
    state.isAnswered = true;   // ⚠️ 必须在 markEndButtonReady 之前:它读的正是这个状态
    nextQuestionBtn.classList.remove('hidden');
    // 最后一题判分完成后,让「结束刷题 / 交卷」变色提示收尾(👤 要求)
    markEndButtonReady();
}


// 下一题
// 「下一题」与左滑手势共用的推进器:逐题模式下**未作答的题按"确认答案"处理**。
// 背景:多选的「确认答案」按钮已删除(👤 决定),改由"任何切题动作即确认"承担 ——
// 点「下一题」或左滑都算提交。收在这一处,避免两条入口各写一份判定而漂移。
export function advanceNext() {
    if (state.quizMode !== 'exam' && !state.isAnswered) {
        // 未作答:以当前勾选判分。若一选项都没选,submitAnswer 会给出内联提示并返回,
        // 此时**必须留在本题**(👤 反馈:原来提示完仍会跳过,等于把题跳过去了)。
        if (!collectUserAnswer()) { submitAnswer(); return; }
        submitAnswer();
    }
    cancelAutoNext();   // 判分可能刚安排了自动切题,手动/手势推进优先,取消它
    nextQuestion();
}

export function nextQuestion() {
    cancelAutoNext();   // 手动翻页优先,取消待执行的自动翻页
    if (state.quizMode === 'exam') {
        // 套题模式：先保存当前作答再翻页
        state.userAnswers[state.currentQuestionIndex] = collectUserAnswer();
        // 套题模式不做自动翻页(见 shouldAutoNext 注释)
        if (state.currentQuestionIndex >= state.currentQuiz.length - 1) {
            finishExam();
            return;
        }
        state.currentQuestionIndex++;
        displayQuestion();
        return;
    }

    state.currentQuestionIndex++;

    if (state.currentQuestionIndex >= state.currentQuiz.length) {
        // 刷题完成，显示结果
        showQuizResult();
    } else {
        // 显示下一题
        displayQuestion();
    }
}


// 上一题（仅套题模式，已作答内容保留）
export function prevQuestion() {
    cancelAutoNext();   // 手动翻页优先,取消待执行的自动翻页
    if (state.currentQuestionIndex === 0) return;
    // 逐题模式也可回看(👤 要求)。已作答的题已锁定并记分,回看不改分;
    // 仅当该题尚未作答时才把当前勾选保存下来,避免覆盖已判定的记录。
    if (state.quizMode === 'exam' || !state.userAnswers[state.currentQuestionIndex]) {
        state.userAnswers[state.currentQuestionIndex] = collectUserAnswer();
    }
    state.currentQuestionIndex--;
    displayQuestion();
}


// 交卷（套题模式）：统一判分并生成逐题回顾
export function finishExam() {
    state.userAnswers[state.currentQuestionIndex] = collectUserAnswer();

    state.correctCount = 0;
    state.wrongCount = 0;
    let unanswered = 0;

    state.currentQuiz.forEach((question, idx) => {
        const ua = state.userAnswers[idx] || '';
        const isCorrect = !!ua && normalizeAnswerString(ua) === normalizeAnswerString(question.answer);
        if (!ua) {
            unanswered++;
            // 未作答按错题处理，便于之后复习
            addToErrorBook(question, '未作答');
        } else if (isCorrect) {
            state.correctCount++;
        } else {
            state.wrongCount++;
            addToErrorBook(question, ua);
        }
        // 错题闭环：已在错题本中的题，答对累计连对（达阈值移出）/ 答错清零
        state.masteryRemovedInSession += updateErrorStreak(question, isCorrect, ua);
    });

    showQuizResult(unanswered);
}


// 显示刷题结果（逐题模式结束/提前结束，或套题模式交卷后）
export function showQuizResult(examUnanswered) {
    quizContainer.classList.add('hidden');
    quizResult.classList.remove('hidden');

    let denominator;
    let unanswered = examUnanswered || 0;
    if (state.quizMode === 'exam') {
        // 套题模式：考试得分按总题数计算，未答数单独展示
        denominator = state.currentQuiz.length;
    } else {
        // 逐题模式：提前结束时按实际已答题数计算正确率
        denominator = Math.min(state.currentQuestionIndex + (state.isAnswered ? 1 : 0), state.currentQuiz.length);
        unanswered = state.currentQuiz.length - denominator;
    }

    totalQuestions.textContent = state.currentQuiz.length;
    correctAnswers.textContent = state.correctCount;
    wrongAnswers.textContent = state.wrongCount;
    unansweredCountEl.textContent = unanswered;
    // 正确率只显示数字(大字);"已答 N 题"移到旁侧小字,避免数字和说明挤在一格里
    accuracy.textContent = denominator > 0
        ? `${((state.correctCount / denominator) * 100).toFixed(1)}%`
        : '0%';
    if (answeredNote) {
        // 逐题模式提前结束时,分母是"已答数",须说明;套题模式分母即总题数,无需重复
        answeredNote.textContent = (denominator > 0 && denominator < state.currentQuiz.length)
            ? `· 已答 ${denominator} 题`
            : '';
    }
    // 正确率着色:达标绿、偏低红,让"好不好"一眼可见(纯灰则无判断信息)
    if (accuracy.classList) {
        accuracy.classList.remove('ok', 'bad');
        if (denominator > 0) {
            const pct = (state.correctCount / denominator) * 100;
            accuracy.classList.add(pct >= 60 ? 'ok' : 'bad');
        }
    }

    // 错题闭环提示：本轮因连对达标移出错题本的题
    if (state.masteryRemovedInSession > 0) {
        masteryNote.textContent = state.masteryThreshold === 1
            ? `本轮共有 ${state.masteryRemovedInSession} 题答对后已移出错题本 🎉`
            : `本轮共有 ${state.masteryRemovedInSession} 题连续答对 ${state.masteryThreshold} 次，已自动移出错题本 🎉`;
        masteryNote.classList.remove('hidden');
    } else {
        masteryNote.classList.add('hidden');
    }

    renderAnswerReview();
}


// 渲染逐题回顾（结果页：套题模式交卷后 / 逐题模式结束后）
export function renderAnswerReview() {
    answerReview.innerHTML = '';
    const onlyWrong = reviewOnlyWrong.checked;

    state.currentQuiz.forEach((question, idx) => {
        const ua = state.userAnswers[idx] || '';
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
        answers.textContent = `你的答案：${ua ? formatAnswerForDisplay(ua, question) : '未作答'}　正确答案：${formatAnswerForDisplay(question.answer, question)}`;
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
export function endQuiz() {
    cancelAutoNext();
    if (state.quizMode === 'exam') {
        const unanswered = state.userAnswers.filter(a => !a).length;
        const message = unanswered > 0
            ? `还有 ${unanswered} 题未作答，未作答的题将计入错题本。确定交卷吗？`
            : '确定交卷吗？交卷后将统一判分。';
        if (confirm(message)) {
            finishExam();
        }
        return;
    }
    // 逐题模式:结束前先把当前题按已勾选判分 ——
    // 否则末题若是多选,选完直接点「结束刷题」会被记成"未作答"(👤 反馈的 bug)。
    // 一选项都没选时只提示、仍允许结束(不该被提示困住)。
    if (!state.isAnswered && collectUserAnswer()) submitAnswer();
    if (confirm('确定要结束刷题吗？')) {
        showQuizResult();
    }
}


// 返回刷题设置
export function backToQuizOptions() {
    cancelAutoNext();
    quizResult.classList.add('hidden');
    quizSettings.classList.remove('hidden');
}


// 显示指定部分
export function showSection(sectionName) {
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

    // 底部导航切换时滚回顶部(移动端标准行为;vm 沙箱无 window,guarded)
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
    
    // 题库页:库列表 + 错题 + 收藏 + 最近导入一并刷新
    if (sectionName === 'banks') {
        updateBanksList();
        updateErrorsList();
        updateFavoritesList();
        updateLastImportInfo();
        renderRecycleBin();
    }
}


// 刷新收藏按钮状态（★ 已收藏 / ☆ 收藏）
export function updateFavoriteButton() {
    const question = state.currentQuiz[state.currentQuestionIndex];
    const isFav = !!question && state.favoriteQuestions.some(f => f.content === question.content);
    favoriteBtn.textContent = isFav ? '★ 已收藏' : '☆ 收藏';
    if (isFav) {
        favoriteBtn.classList.add('active');
    } else {
        favoriteBtn.classList.remove('active');
    }
}


// 刷题界面：收藏/取消收藏当前题
export function toggleFavoriteCurrent() {
    const question = state.currentQuiz[state.currentQuestionIndex];
    if (!question) return;
    toggleFavorite(question, state.isAllBanksView ? '未知题库' : state.currentBankName);
    updateFavoriteButton();
}


// 显示刷题状态
export function showQuizStatus(message, type) {
    quizStatus.textContent = message;
    quizStatus.className = 'status-message';
    quizStatus.classList.add(type);
    
    // 3秒后隐藏状态消息
    setTimeout(() => {
        quizStatus.className = 'status-message';
    }, 3000);
}
