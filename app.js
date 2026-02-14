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

// 初始化
function init() {
    // 加载本地存储的数据
    loadFromLocalStorage();

    // 更新题库选择下拉框
    updateBankSelect();
    
    // 设置事件监听器
    setupEventListeners();
    
    // 显示首页
    showSection('home');
}

// 从本地存储加载数据
function loadFromLocalStorage() {
    const savedBanks = localStorage.getItem('questionBanks');
    const savedErrors = localStorage.getItem('errorQuestions');
    
    if (savedBanks) {
        questionBanks = JSON.parse(savedBanks);
        // 加载第一个题库作为当前题库
        const bankNames = Object.keys(questionBanks);
        if (bankNames.length > 0) {
            currentBankName = bankNames[0];
            questionBank = questionBanks[currentBankName];
        }
    } else {
        // 向后兼容：如果有旧的questionBank数据，迁移到新的结构
        const savedQuestions = localStorage.getItem('questionBank');
        if (savedQuestions) {
            questionBank = JSON.parse(savedQuestions);
            questionBanks[currentBankName] = questionBank;
        }
    }
    
    if (savedErrors) {
        errorQuestions = JSON.parse(savedErrors);
    }
}

// 保存数据到本地存储
function saveToLocalStorage() {
    questionBanks[currentBankName] = questionBank;
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
            // 合并所有题库
            questionBank = [];
            Object.values(questionBanks).forEach(bank => {
                questionBank = [...questionBank, ...bank];
            });
        } else {
            // 选择特定题库
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
        const importedQuestions = parseQuestions(content);
        
        if (importedQuestions.length === 0) {
            showImportStatus('导入失败：文件中没有找到有效的题目', 'error');
            return;
        }
        
        // 根据导入模式处理题目
        const importMode = document.querySelector('input[name="import-mode"]:checked').value;

        // 从文件名提取题库名（去掉扩展名）
        const bankName = file.name.replace(/\.[^/.]+$/, '');
        
        if (importMode === 'replace') {
            // 替换当前题库
            questionBank = importedQuestions;
            questionBanks[currentBankName] = questionBank;
        } else {
            // 追加模式：创建新题库或追加到现有题库
            if (questionBanks[bankName]) {
                // 如果题库已存在，追加到该题库
                questionBanks[bankName] = [...questionBanks[bankName], ...importedQuestions];
            } else {
                // 如果题库不存在，创建新题库
                questionBanks[bankName] = importedQuestions;
            }
            // 切换到新导入的题库
            currentBankName = bankName;
            questionBank = questionBanks[currentBankName];
        }
        
        // 保存到本地存储
        saveToLocalStorage();
        
        // 更新题库选择下拉框
        updateBankSelect();

        showImportStatus(`成功导入 ${importedQuestions.length} 道题目到题库：${bankName}`, 'success');
        
        // 重置文件输入
        fileInput.value = '';
        fileName.textContent = '未选择文件';
    };
    
    reader.readAsText(file);
}

// 解析题目内容 - 简化版，高容错性
function parseQuestions(content) {
    const questions = [];
    // 支持两种分隔方式：以#开头或以"题目："开头
    const questionBlocks = content.split(/(?=^\s*#)|(?=^\s*题目：)/m).filter(block => block.trim());
    
    questionBlocks.forEach(block => {
        const question = {
            title: '',
            content: '',
            explanation: '',
            options: {},
            optionExplanations: {},
            answer: '',
            analysis: '',
            type: '单选'
        };
        
        const lines = block.trim().split('\n');
        
        lines.forEach(line => {
            const trimmedLine = line.trim();
            
            // 支持多种分隔符：：、: 、空格等
            const parseField = (prefixes, startIndex = 0) => {
                for (const prefix of prefixes) {
                    if (trimmedLine.startsWith(prefix)) {
                        return trimmedLine.substring(prefix.length).trim();
                    }
                }
                return null;
            };

            // 解析题目内容
            const content = parseField(['题目：', '题目:', '题目 ']);
            if (content) question.content = content;

            // 解析题目解释（可选）
            const explanation = parseField(['题目解释：', '题目解释:', '题目解释 ']);
            if (explanation) question.explanation = explanation;

            // 解析答案
            const answer = parseField(['答案：', '答案:', '答案 ']);
            if (answer) question.answer = answer.toUpperCase();

            // 解析解析（可选）
            const analysis = parseField(['解析：', '解析:', '解析 ']);
            if (analysis) question.analysis = analysis;

            // 解析类型（可选，会自动根据答案判断）
            const type = parseField(['类型：', '类型:', '类型 ']);
            if (type) question.type = type;

            // 解析选项 - 支持多种格式：A：、A.、A、等
            const optionMatch = trimmedLine.match(/^([A-Z])[：.、\s](.+)$/);
            if (optionMatch) {
                const optionKey = optionMatch[1];
                const optionValue = optionMatch[2];
                question.options[optionKey] = optionValue;
            }

            // 解析选项解释（可选）
            const optionExpMatch = trimmedLine.match(/^([A-Z])解释[：.、\s](.+)$/);
            if (optionExpMatch) {
                const optionKey = optionExpMatch[1];
                const optionValue = optionExpMatch[2];
                question.optionExplanations[optionKey] = optionValue;
            }
        });
        
        // 自动判断题型（根据答案长度）
        if (question.answer) {
            question.type = question.answer.length > 1 ? '多选' : '单选';
        }

        // 只有当题目有内容且有答案时才添加到题库
        if (question.content && question.answer) {
            questions.push(question);
        }
    });
    
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
        
        // 根据题目类型创建不同的输入元素
        let inputElement;
        if (question.type === '单选') {
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
    
    if (question.type === '单选') {
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
    
    // 检查答案是否正确
    const isCorrect = userAnswer === question.answer;
    
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
    
    totalQuestions.textContent = currentQuiz.length;
    correctAnswers.textContent = correctCount;
    wrongAnswers.textContent = wrongCount;
    accuracy.textContent = `${((correctCount / currentQuiz.length) * 100).toFixed(1)}%`;
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

    saveToLocalStorage();
    updateBankSelect();
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
document.addEventListener('DOMContentLoaded', init);