import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';

// ==================== favorites.js ====================
// 职责:收藏夹**数据层**(按题干匹配的收藏切换)。渲染在题库页的库卡内嵌面板里
// (`bank.js` 的 `renderFavoritesForBank` / `buildFavoriteItem`)。
// 历史:2026-09-11 删掉了此处的独立列表渲染死代码(#favorites-list 已下线),理由同 errorbook.js:
// 它靠 `if (!favoritesList) return` 自我屏蔽,而测试桩会自动建出该元素 —— 测试一直在覆盖死代码。

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
