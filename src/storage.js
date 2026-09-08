// ==================== 存储层(唯一允许触碰 localStorage 的模块) ====================
// 职责:读写 localStorage + 损坏降级 + schema 迁移点。允许依赖:state。禁止:DOM。

import { state } from './state.js';

// 从本地存储加载数据
export function loadFromLocalStorage() {
    // 容错：存储数据损坏时重置对应部分，而不是让整个应用崩溃
    try {
        const savedBanks = localStorage.getItem('questionBanks');
        if (savedBanks) {
            const parsed = JSON.parse(savedBanks);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                state.questionBanks = parsed;
                // 加载第一个题库作为当前题库
                const bankNames = Object.keys(state.questionBanks);
                if (bankNames.length > 0) {
                    state.currentBankName = bankNames[0];
                    state.questionBank = state.questionBanks[state.currentBankName];
                }
            }
        } else {
            // 向后兼容：如果有旧的questionBank数据，迁移到新的结构
            const savedQuestions = localStorage.getItem('questionBank');
            if (savedQuestions) {
                const parsedQuestions = JSON.parse(savedQuestions);
                if (Array.isArray(parsedQuestions)) {
                    state.questionBank = parsedQuestions;
                    state.questionBanks[state.currentBankName] = state.questionBank;
                }
            }
        }
    } catch (e) {
        console.error('题库数据损坏，已重置：', e);
        localStorage.removeItem('questionBanks');
        localStorage.removeItem('questionBank');
        state.questionBanks = {};
        state.questionBank = [];
    }

    try {
        const savedErrors = localStorage.getItem('errorQuestions');
        if (savedErrors) {
            const parsedErrors = JSON.parse(savedErrors);
            if (Array.isArray(parsedErrors)) {
                state.errorQuestions = parsedErrors;
            }
        }
    } catch (e) {
        console.error('错题本数据损坏，已重置：', e);
        localStorage.removeItem('errorQuestions');
        state.errorQuestions = [];
    }

    try {
        const savedFavorites = localStorage.getItem('favoriteQuestions');
        if (savedFavorites) {
            const parsedFavorites = JSON.parse(savedFavorites);
            if (Array.isArray(parsedFavorites)) {
                state.favoriteQuestions = parsedFavorites;
            }
        }
    } catch (e) {
        console.error('收藏数据损坏，已重置：', e);
        localStorage.removeItem('favoriteQuestions');
        state.favoriteQuestions = [];
    }
}

// 保存数据到本地存储
export function saveToLocalStorage() {
    // 仅在选定具体题库时回写当前题库，
    // 避免"全部题库"合并视图把合并结果覆盖写进某个真实题库（数据污染）
    if (!state.isAllBanksView) {
        state.questionBanks[state.currentBankName] = state.questionBank;
    }
    localStorage.setItem('questionBanks', JSON.stringify(state.questionBanks));
    localStorage.setItem('errorQuestions', JSON.stringify(state.errorQuestions));
    localStorage.setItem('favoriteQuestions', JSON.stringify(state.favoriteQuestions));
}

export function loadCollapsedBanks() {
    try {
        const saved = localStorage.getItem('errorBookExpandedBanks');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                state.expandedBanks = parsed;
            }
        }
    } catch (e) {
        state.expandedBanks = {};
    }
}

export function saveCollapsedBanks() {
    try {
        localStorage.setItem('errorBookExpandedBanks', JSON.stringify(state.expandedBanks));
    } catch (e) { /* 存储异常时静默降级：展开状态不持久化 */ }
}

// 加载错题移出规则设置
export function loadMasterySetting() {
    const saved = parseInt(localStorage.getItem('masteryThresholdSetting'), 10);
    state.masteryThreshold = [0, 1, 2, 3].includes(saved) ? saved : 2;
    return state.masteryThreshold;
}
