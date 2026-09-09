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

// ==================== 导入批次记录(撤销)与覆盖前快照 ====================

// 批次记录:最近 5 次;损坏时静默降级为无记录(仅失去撤销能力,不影响题库数据)
export function loadImportBatches() {
    try {
        const arr = JSON.parse(localStorage.getItem('importBatches') || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

export function saveImportBatches(batches) {
    try {
        while (batches.length > 5) batches.shift();
        localStorage.setItem('importBatches', JSON.stringify(batches));
    } catch (e) { /* 静默降级 */ }
}

export function recordImportBatch(batch) {
    const batches = loadImportBatches();
    batches.push(batch);
    saveImportBatches(batches);
}

export function saveOverwriteSnapshot(bankName, questions) {
    try {
        localStorage.setItem('overwriteSnapshot', JSON.stringify({ bank: bankName, time: new Date().toISOString(), questions }));
    } catch (e) { /* 题库过大等异常时静默降级:快照不可用,覆盖流程不受影响 */ }
}

export function loadOverwriteSnapshot() {
    try {
        const s = JSON.parse(localStorage.getItem('overwriteSnapshot') || 'null');
        return (s && s.bank && Array.isArray(s.questions)) ? s : null;
    } catch (e) {
        return null;
    }
}

export function clearOverwriteSnapshot() {
    try { localStorage.removeItem('overwriteSnapshot'); } catch (e) { /* 静默 */ }
}

// ==================== AI 配置(BYO key)与触发埋点 ====================

// 读取 AI 配置;损坏/缺字段由 ai.js 的 normalizeAiConfig 兜底,这里只保证 JSON 安全
export function loadAiConfig() {
    try {
        return JSON.parse(localStorage.getItem('aiConfig') || 'null') || {};
    } catch (e) {
        return {};
    }
}

export function saveAiConfig(cfg) {
    try {
        localStorage.setItem('aiConfig', JSON.stringify(cfg || {}));
    } catch (e) { /* 静默降级:配置不持久化,本次会话仍可用 */ }
}

// 「AI 已连接 ✓」徽章:保存最近一次测试成功的配置指纹;配置变更未复测则失配(徽章熄灭)
export function markAiTested(cfg) {
    try {
        localStorage.setItem('aiConfigTested', JSON.stringify(cfg || {}));
    } catch (e) { /* 静默 */ }
}

export function isAiTested(cfg) {
    try {
        return !!cfg && localStorage.getItem('aiConfigTested') === JSON.stringify(cfg);
    } catch (e) {
        return false;
    }
}

// AI 兜底触发埋点:最近 50 条;用于统计"多少导入需要 AI 救"(规则算法投入决策依据)
export function loadAiUsage() {
    try {
        const arr = JSON.parse(localStorage.getItem('aiUsage') || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

export function recordAiUsage(entry) {
    try {
        const arr = loadAiUsage();
        arr.push({ time: new Date().toISOString(), ...(entry || {}) });
        while (arr.length > 50) arr.shift();
        localStorage.setItem('aiUsage', JSON.stringify(arr));
    } catch (e) { /* 埋点失败不影响主流程 */ }
}
