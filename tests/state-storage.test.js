// 存储层测试:真实 import + localStorage 桩
import test from 'node:test';
import assert from 'node:assert';
import { state } from '../src/state.js';
import {
    loadFromLocalStorage, saveToLocalStorage, loadMasterySetting,
    loadCollapsedBanks, saveCollapsedBanks,
} from '../src/storage.js';

const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
};

test('损坏的题库数据 → 安全重置不崩溃', () => {
    store.set('questionBanks', '{oops not json');
    loadFromLocalStorage();
    assert.strictEqual(Object.keys(state.questionBanks).length, 0);
});

test('正常数据加载并定位当前题库', () => {
    store.set('questionBanks', JSON.stringify({ '政治': [{ content: '题', answer: 'A' }] }));
    loadFromLocalStorage();
    assert.strictEqual(state.currentBankName, '政治');
    assert.strictEqual(state.isAllBanksView, false);
});

test('错题移出规则加载(含非法值回退默认 2,支持 0=关闭)', () => {
    store.set('masteryThresholdSetting', '3');
    assert.strictEqual(loadMasterySetting(), 3);
    store.set('masteryThresholdSetting', '99');
    assert.strictEqual(loadMasterySetting(), 2);
    store.set('masteryThresholdSetting', '0');
    assert.strictEqual(loadMasterySetting(), 0);
    state.masteryThreshold = 0;
});

test('错题本展开状态持久化往返', () => {
    state.expandedBanks = { '高数': true };
    saveCollapsedBanks();
    state.expandedBanks = {};
    loadCollapsedBanks();
    assert.strictEqual(state.expandedBanks['高数'], true);
});

test('保存不丢收藏与错题', () => {
    state.favoriteQuestions = [{ content: 'F1' }];
    state.errorQuestions = [{ content: 'E1' }];
    saveToLocalStorage();
    state.favoriteQuestions = [];
    state.errorQuestions = [];
    loadFromLocalStorage();
    assert.strictEqual(state.favoriteQuestions.length, 1);
    assert.strictEqual(state.errorQuestions.length, 1);
});
