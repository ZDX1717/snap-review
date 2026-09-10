import test from 'node:test';
import assert from 'node:assert';
import { loadApp, makeEl } from './helpers/vm-harness.mjs';

const { run, elements, store, alerts, sandbox, domContentLoadedCount } = await loadApp();

const Q = (content, answer) => ({ content, type: '单选', options: {A:'甲',B:'乙'}, answer, analysis: 'x', confidence: 1, raw: '' });

test('同题干同选项不同答案 → 同一题(重复)', () => {
    const k1 = run(`questionDedupKey(${JSON.stringify(Q('题A', 'A'))})`);
    const k2 = run(`questionDedupKey(${JSON.stringify(Q('题A', 'B'))})`);
    assert.strictEqual(k1, k2);
});
test('同题干不同选项 → 不同题(不误判)', () => {
    const q1 = Q('下列说法正确的是()', 'A');
    const q2 = Q('下列说法正确的是()', 'A');
    q2.options = {A:'丙',B:'丁'};
    assert.notStrictEqual(run(`questionDedupKey(${JSON.stringify(q1)})`), run(`questionDedupKey(${JSON.stringify(q2)})`));
});

test('答对一次 → 连对1,不移出;答错 → 清零并更新作答', () => {
    run(`errorQuestions = [{ ...${JSON.stringify(Q('错题1','A'))}, userAnswer: 'B', bankName: 'T', correctStreak: 0 }];`);
    assert.strictEqual(run(`updateErrorStreak(${JSON.stringify(Q('错题1','A'))}, true, 'A')`), 0);
    assert.strictEqual(run('errorQuestions[0].correctStreak'), 1);
    assert.strictEqual(run(`updateErrorStreak(${JSON.stringify(Q('错题1','A'))}, false, 'C')`), 0);
    assert.strictEqual(run('errorQuestions[0].correctStreak'), 0);
    assert.strictEqual(run('errorQuestions[0].userAnswer'), 'C');
});
test('连对2次 → 自动移出错题本', () => {
    run(`errorQuestions = [{ ...${JSON.stringify(Q('错题2','A'))}, userAnswer: 'B', bankName: 'T', correctStreak: 1 }];`);
    assert.strictEqual(run(`updateErrorStreak(${JSON.stringify(Q('错题2','A'))}, true, 'A')`), 1);
    assert.strictEqual(run('errorQuestions.length'), 0);
});
test('不在错题本的题 → 无操作', () => {
    run('errorQuestions = [];');
    assert.strictEqual(run(`updateErrorStreak(${JSON.stringify(Q('不在本子','A'))}, true, 'A')`), 0);
});
test('逐题模式答对错本题 → 反馈文案带移出提示', () => {
    const selEl = makeEl(); selEl.value = 'A';
    sandbox.document.querySelector = () => selEl;
    alerts.length = 0;
    run(`quizMode = 'immediate';
        currentQuiz = [${JSON.stringify(Q('巩固题','A'))}];
        userAnswers = ['']; currentQuestionIndex = 0;
        correctCount = 0; wrongCount = 0; masteryRemovedInSession = 0;
        errorQuestions = [{ ...${JSON.stringify(Q('巩固题','A'))}, userAnswer: 'B', bankName: 'T', correctStreak: 1 }];
        questionBanks = {T: currentQuiz}; currentBankName = 'T'; questionBank = currentQuiz; isAllBanksView = false;
        submitAnswer();`);
    assert.ok(elements['answer-result'].textContent.includes('移出错题本'));
    assert.strictEqual(run('errorQuestions.length'), 0);
    sandbox.document.querySelector = () => makeEl();
});

test('切换收藏:加入→列表+1并持久化,再切→移除', () => {
    run(`favoriteQuestions = [];`);
    assert.strictEqual(run(`toggleFavorite(${JSON.stringify(Q('好题','A'))}, '高数')`), true);
    assert.strictEqual(run('favoriteQuestions.length'), 1);
    assert.strictEqual(JSON.parse(store.get('favoriteQuestions')).length, 1);
    assert.strictEqual(run(`toggleFavorite(${JSON.stringify(Q('好题','A'))}, '高数')`), false);
    assert.strictEqual(run('favoriteQuestions.length'), 0);
});
test('收藏按钮状态刷新', () => {
    run(`favoriteQuestions = [${JSON.stringify(Q('好题','A'))}];
        currentQuiz = [${JSON.stringify(Q('好题','A'))}]; currentQuestionIndex = 0;
        updateFavoriteButton();`);
    assert.strictEqual(elements['favorite-btn'].textContent, '★ 已收藏');
    run(`favoriteQuestions = []; updateFavoriteButton();`);
    assert.strictEqual(elements['favorite-btn'].textContent, '☆ 收藏');
});
test('收藏夹作为题源:返回收藏题目池(副本)', () => {
    run(`favoriteQuestions = [${JSON.stringify(Q('收藏1','A'))}, ${JSON.stringify(Q('收藏2','B'))}];`);
    assert.strictEqual(run(`getSourcePool('favorites').length`), 2);
    run(`getSourcePool('favorites').push({ content: 'x' })`);
    assert.strictEqual(run('favoriteQuestions.length'), 2, '题源池是副本,不得串改 state');
});
test('空收藏夹作为题源 → 池为空(startQuiz 负责提示)', () => {
    run(`favoriteQuestions = [];`);
    assert.strictEqual(run(`getSourcePool('favorites').length`), 0);
});
test('收藏数据损坏安全重置', () => {
    store.set('favoriteQuestions', '[bad');
    run('loadFromLocalStorage()');
    assert.strictEqual(run('favoriteQuestions.length'), 0);
});
test('题库一键去重', () => {
    alerts.length = 0;
    const q1 = Q('重复题', 'A');
    const q2 = Q('重复题', 'B'); // 同题干同选项 → 重复
    const q3 = Q('独立题', 'A');
    run(`questionBanks = { 'T': [${JSON.stringify(q1)}, ${JSON.stringify(q2)}, ${JSON.stringify(q3)}] };
        currentBankName = 'T'; questionBank = questionBanks['T']; isAllBanksView = false;
        dedupBank('T');`);
    assert.strictEqual(run('questionBanks["T"].length'), 2);
    assert.ok(alerts.some(a => a.includes('已清理 1')));
});

