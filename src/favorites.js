import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';

// ==================== favorites.js ====================
// 自动拆分自 main.js;依赖方向见各 import。


const favoritesList = document.getElementById('favorites-list');

// 切换收藏状态（按题干匹配），返回是否为新增收藏
export function toggleFavorite(question, bankName) {
    const idx = state.favoriteQuestions.findIndex(q => q.content === question.content);
    let added;
    if (idx === -1) {
        state.favoriteQuestions.push({
            ...question,
            bankName: bankName || '未知题库',
            timestamp: new Date().toISOString()
        });
        added = true;
    } else {
        state.favoriteQuestions.splice(idx, 1);
        added = false;
    }
    saveToLocalStorage();
    return added;
}


// 刷新收藏夹列表
export function updateFavoritesList() {
    if (state.favoriteQuestions.length === 0) {
        favoritesList.innerHTML = '<p class="empty-message">暂无收藏题目，刷题时点击题目右上角的"☆ 收藏"即可加入</p>';
        return;
    }

    favoritesList.innerHTML = '';

    state.favoriteQuestions.forEach((question, index) => {
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
            state.favoriteQuestions.splice(index, 1);
            saveToLocalStorage();
            updateFavoritesList();
        });
        item.appendChild(removeBtn);

        favoritesList.appendChild(item);
    });
}
