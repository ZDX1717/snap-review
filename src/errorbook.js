import { state } from './state.js';
import { formatAnswerForDisplay } from './parser.js';
import { saveCollapsedBanks, saveToLocalStorage } from './storage.js';
import { toggleFavorite, updateFavoritesList } from './favorites.js';

// ==================== errorbook.js ====================
// 自动拆分自 main.js;依赖方向见各 import。


const toggleAllBanksBtn = document.getElementById('toggle-all-banks-btn');
const errorsList = document.getElementById('errors-list');

// 添加到错题本
export function addToErrorBook(question, userAnswer) {
    // 检查题目是否已在错题本中
    const existingIndex = state.errorQuestions.findIndex(
        q => q.content === question.content
    );

    if (existingIndex === -1) {
        // 添加新错题
        state.errorQuestions.push({
            ...question,
            userAnswer,
            bankName: state.currentBankName,
            correctStreak: 0, // 连对次数：复习/刷题中答对累计，达阈值自动移出
            timestamp: new Date().toISOString()
        });

        // 保存到本地存储
        saveToLocalStorage();
    }
}


// 错题闭环：已入错题本的题答对 → 连对次数+1（达阈值自动移出，返回移出数）；
// 答错 → 连对次数清零并更新作答记录；不在错题本中的题 → 无操作
export function updateErrorStreak(question, isCorrect, userAnswer) {
    if (state.masteryThreshold === 0) return 0; // 用户关闭了自动移出
    const idx = state.errorQuestions.findIndex(q => q.content === question.content);
    if (idx === -1) return 0;

    if (isCorrect) {
        const streak = (state.errorQuestions[idx].correctStreak || 0) + 1;
        if (streak >= state.masteryThreshold) {
            state.errorQuestions.splice(idx, 1);
            saveToLocalStorage();
            return 1;
        }
        state.errorQuestions[idx].correctStreak = streak;
    } else {
        state.errorQuestions[idx].correctStreak = 0;
        state.errorQuestions[idx].userAnswer = userAnswer || state.errorQuestions[idx].userAnswer;
    }
    saveToLocalStorage();
    return 0;
}


export function updateErrorsList() {
    if (!errorsList) return;  // 堆叠面板已移除,错题改库卡内嵌(兼容旧测试:沙箱自动建元素)
    if (state.errorQuestions.length === 0) {
        errorsList.innerHTML = '<p class="empty-message">暂无错题记录</p>';
        toggleAllBanksBtn.classList.add('hidden');
        return;
    }
    toggleAllBanksBtn.classList.remove('hidden');

    errorsList.innerHTML = '';

    // 按题库分类错题
    const errorsByBank = {};
    state.errorQuestions.forEach((question, index) => {
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
        const isCollapsed = !state.expandedBanks[bankName]; // 缺省折叠

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
            const nowExpanded = !state.expandedBanks[bankName];
            state.expandedBanks[bankName] = nowExpanded;
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
        correctAnswer.textContent = `正确答案：${formatAnswerForDisplay(question.answer, question)}`;

        const yourAnswer = document.createElement('p');
        yourAnswer.className = 'your-answer';
        yourAnswer.textContent = `你的答案：${question.userAnswer}`;

        const analysis = document.createElement('p');
        analysis.textContent = `解析：${question.analysis || '暂无解析'}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => deleteError(index));

        // 收藏切换:与刷题页同一收藏夹(按题干匹配)
        const isFav = state.favoriteQuestions.some(fq => fq.content === question.content);
        const favBtn = document.createElement('button');
        favBtn.className = 'fav-toggle-btn';
        favBtn.textContent = isFav ? '★ 已收藏' : '☆ 收藏';
        favBtn.addEventListener('click', () => {
            toggleFavorite(question, question.bankName);
            updateFavoritesList();
            updateErrorsList();  // 重渲染刷新 ☆/★ 状态
        });

        const actionsRow = document.createElement('div');
        actionsRow.className = 'error-actions';
        actionsRow.appendChild(favBtn);
        actionsRow.appendChild(deleteBtn);

        errorItem.appendChild(title);
        if (question.options && Object.keys(question.options).length > 0) {
            errorItem.appendChild(optionsDiv);
        }
        errorItem.appendChild(type);
        errorItem.appendChild(correctAnswer);
        errorItem.appendChild(yourAnswer);
        if ((question.correctStreak || 0) > 0 && state.masteryThreshold > 0) {
            const mastery = document.createElement('p');
            mastery.className = 'mastery-note';
            mastery.textContent = `已连对 ${question.correctStreak} 次，再答对 ${state.masteryThreshold - question.correctStreak} 次自动移出错题本`;
            errorItem.appendChild(mastery);
        }
        errorItem.appendChild(analysis);
        errorItem.appendChild(actionsRow);

        bankContainer.appendChild(errorItem);
        });

        group.appendChild(toggle);
        group.appendChild(bankContainer);
        errorsList.appendChild(group);
    });
}


// 删除错题
export function deleteError(index) {
    if (confirm('确定要删除这道错题吗？')) {
        state.errorQuestions.splice(index, 1);
        saveToLocalStorage();
        updateErrorsList();
    }
}


// 清空错题本
export function clearErrors() {
    if (confirm('确定要清空所有错题吗？')) {
        state.errorQuestions = [];
        saveToLocalStorage();
        updateErrorsList();
    }
}


// 全部展开 / 全部折叠
export function toggleAllBanks() {
    const bankNames = new Set(state.errorQuestions.map(q => q.bankName || '未知题库'));
    const anyExpanded = [...bankNames].some(name => !!state.expandedBanks[name]);
    // 有展开的组 → 全部折叠；全部已折叠 → 全部展开
    bankNames.forEach(name => { state.expandedBanks[name] = !anyExpanded; });
    saveCollapsedBanks();
    updateErrorsList();
}


// 根据当前展开/折叠状态更新"全部展开/全部折叠"按钮文案（展示将要执行的动作）
export function updateToggleAllBanksLabel(bankNameList) {
    if (!toggleAllBanksBtn) return;  // 按钮 已随堆叠面板移除
    const names = bankNameList || new Set(state.errorQuestions.map(q => q.bankName || '未知题库'));
    const list = Array.isArray(names) ? names : [...names];
    if (list.length === 0) return;
    const anyExpanded = list.some(name => !!state.expandedBanks[name]);
    toggleAllBanksBtn.textContent = anyExpanded ? '全部折叠' : '全部展开';
}

