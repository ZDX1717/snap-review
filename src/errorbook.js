import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';

// 通知题库页的库卡内嵌面板重绘。**不得直接 import bank.js** ——
// bank.js 已 import 本模块的 toggleFavorite,反向引用会炸模块加载(架构铁律 4),
// 故用 document 自定义事件(与 bank.js:1793 的监听约定一致)。
function notifyEmbedsDirty() {
    if (typeof CustomEvent !== 'undefined' && document.dispatchEvent) {
        document.dispatchEvent(new CustomEvent('zquiz:embeds-dirty'));
    }
}

// ==================== errorbook.js ====================
// 职责:错题本**数据层**(入库 / 连对移出 / 单条删除 / 清空)。
// ⚠️ 这里**不再有任何渲染代码**:错题列表早已并入题库页的库卡内嵌面板
//    (`bank.js` 的 `renderErrorsForBank` / `buildErrorItem`),独立列表页(#errors-list)已下线。
//    历史:2026-09-11 清掉了一段"独立列表渲染"死代码 —— 它靠 `if (!errorsList) return` 自我屏蔽,
//    而测试桩会自动建出该元素,于是**测试一直在覆盖永不执行的代码**。同类问题勿再引入。

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


// 删除错题
export function deleteError(index) {
    if (confirm('确定要删除这道错题吗？')) {
        state.errorQuestions.splice(index, 1);
        saveToLocalStorage();
        notifyEmbedsDirty();
    }
}


// 清空错题本
export function clearErrors() {
    if (confirm('确定要清空所有错题吗？')) {
        state.errorQuestions = [];
        saveToLocalStorage();
        notifyEmbedsDirty();
    }
}
