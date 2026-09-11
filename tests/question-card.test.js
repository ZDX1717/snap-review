// 题目卡片统一(👤 定调 2026-09-11):错题卡与收藏卡同一套结构,
// 题型 / 收藏 / 删除 一律在**题干上方一行**。
// 这里断言的是**真正在生产里跑的那条渲染路径**(库卡内嵌面板),
// 而不是 errorbook.js/favorites.js 里的旧列表(那两个容器已不在 index.html 里)。
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { loadApp } from './helpers/vm-harness.mjs';

const { run, sandbox } = await loadApp();
run(`init()`);

// 取某次渲染新产生的元素。⚠️ __created 的条目是 {tag, el}:只取 el 会让 `e.tag` 恒为 undefined,
// 结构断言(如"是不是 DETAILS")会静默落空;只取条目又会让 e.className 之类读不到。
// 故把 tag 挂到元素上(桩元素本就允许挂自定义字段),用例统一按"元素"访问。
const createdSince = (mark) => sandbox.__created.slice(mark).map(c => { c.el.__tag = c.tag; return c.el; });
const tagOf = (el) => el.__tag;
const renderErrors = (mark) => { run(`renderErrorsForBank('史库')`); return createdSince(mark); };
const renderFavs = (mark) => { run(`renderFavoritesForBank('史库')`); return createdSince(mark); };

const setup = `
    questionBanks['史库'] = [{ content: '库内题', type: '单选', options: {A:'甲',B:'乙'}, answer: 'A' }];
    errorQuestions = [{ content: '史库错题', type: '判断', options: {A:'正确',B:'错误'}, answer: 'A', userAnswer: 'B', bankName: '史库', analysis: '因为甲' }];
    favoriteQuestions = [{ content: '史库收藏', type: '多选', options: {A:'甲',B:'乙',C:'丙'}, answer: 'AC', bankName: '史库' }];
`;

test('错题卡:题型/收藏/删除 都在题干上方的一行里', () => {
    run(setup);
    const mark = sandbox.__created.length;
    const els = renderErrors(mark);
    const row = els.find(e => String(e.className).includes('question-card-tags'));
    assert.ok(row, '错题卡应有标签行 question-card-tags');
    const labels = row.children.map(c => String(c.textContent));
    assert.ok(labels.some(t => /［判断］/.test(t)), '标签行应含题型 ［判断］');
    assert.ok(labels.some(t => /收藏/.test(t)), '标签行应含收藏按钮');
    assert.ok(labels.some(t => /^删除$/.test(t)), '标签行应含删除按钮');
    // 顺序:题型 → 收藏 → 删除(👤 提法)
    const idxOf = (re) => labels.findIndex(t => re.test(t));
    assert.ok(idxOf(/［/) < idxOf(/收藏/), '题型应在收藏之前');
    assert.ok(idxOf(/收藏/) < idxOf(/^删除$/), '收藏应在删除之前');
});

test('错题卡:标签行是卡片的首个子元素(题干之下不再有动作行)', () => {
    run(setup);
    const mark = sandbox.__created.length;
    const els = renderErrors(mark);
    const card = els.find(e => String(e.className).includes('question-card'));
    assert.ok(card, '应有卡片元素');
    const first = String(card.children[0] && card.children[0].className);
    assert.ok(first.includes('question-card-tags'), `标签行必须是卡片第一个子元素,实际 ${first}`);
    // 旧的"动作行在卡片末尾"结构必须消失
    assert.ok(!els.some(e => String(e.className).includes('error-actions')), '不得再出现 error-actions 动作行');
    assert.ok(!els.some(e => String(e.className).includes('fav-toggle-btn')), '不得再出现旧收藏按钮类名');
});

test('收藏卡:与错题卡同一套结构与类名,同样标签行在题干上方', () => {
    run(setup);
    const mark = sandbox.__created.length;
    const els = renderFavs(mark);
    const card = els.find(e => String(e.className).includes('question-card'));
    assert.ok(card, '收藏卡必须也用 .question-card 基础类(否则按类选卡的代码会漏掉它)');
    assert.ok(String(card.className).includes('fav-item'), '收藏卡应带 fav-item 修饰类以区分左条颜色');
    const row = card.children[0];
    assert.ok(String(row.className).includes('question-card-tags'), '收藏卡的标签行也必须在卡片最前(题干之上)');
    const labels = row.children.map(c => String(c.textContent));
    assert.ok(labels.some(t => /［多选］/.test(t)), '收藏卡标签行应含题型');
    assert.ok(labels.some(t => /收藏/.test(t)), '收藏卡标签行应含收藏按钮');
    assert.ok(labels.some(t => /^删除$/.test(t)), '收藏卡标签行应含删除按钮');
});

test('两卡同构:标签行的子元素类名序列一致(只差状态徽章)', () => {
    run(setup);
    let mark = sandbox.__created.length;
    const errRow = renderErrors(mark).find(e => String(e.className).includes('question-card-tags'));
    // 制造"收藏也在错题本"的情形 → 收藏卡会多一个状态徽章
    run(`errorQuestions.push({ content: '史库收藏', type: '多选', bankName: '史库', userAnswer: 'A', answer: 'AC' })`);
    mark = sandbox.__created.length;
    const favRow = renderFavs(mark).find(e => String(e.className).includes('question-card-tags'));
    const kindOf = (el) => {
        const c = String(el.className);
        if (c.includes('error-type-line')) return '题型';
        if (c.includes('badge')) return '徽章';
        if (c.includes('question-card-fav')) return '收藏';
        if (c.includes('question-card-del')) return '删除';
        return '其它:' + c;
    };
    assert.deepStrictEqual(errRow.children.map(kindOf), ['题型', '收藏', '删除'], '错题卡标签行构成');
    assert.deepStrictEqual(favRow.children.map(kindOf), ['题型', '徽章', '收藏', '删除'], '收藏卡标签行构成(多一个状态徽章)');
});

test('两卡的答案区都走主动回忆遮挡(details),不在折叠态泄露答案', () => {
    run(setup);
    let mark = sandbox.__created.length;
    let els = renderErrors(mark);
    assert.ok(els.some(e => tagOf(e) === 'DETAILS' && String(e.className).includes('answer-reveal')), '错题卡应遮挡');
    mark = sandbox.__created.length;
    els = renderFavs(mark);
    assert.ok(els.some(e => tagOf(e) === 'DETAILS' && String(e.className).includes('answer-reveal')), '收藏卡也应遮挡(统一设计)');
    // 折叠态:正确答案文字必须写在 details 内部,而不是直接挂在卡片上
    const card = els.find(e => String(e.className).includes('question-card'));
    const directlyOnCard = card.children.filter(c => String(c.textContent).includes('正确答案'));
    assert.strictEqual(directlyOnCard.length, 0, '正确答案不得直接挂在卡片上(必须藏在 details 里)');
});

test('判断题答案展示为 对/错,不显示裸 A/B(两卡同规)', () => {
    run(setup);
    const mark = sandbox.__created.length;
    const els = renderErrors(mark);
    const answers = els.filter(e => /你的答案|正确答案/.test(String(e.textContent))).map(e => String(e.textContent));
    assert.ok(answers.some(t => /正确答案:对/.test(t)), '判断题正确答案应显示「对」,实际:' + JSON.stringify(answers));
    assert.ok(!answers.some(t => /答案[：:]\s*[AB]\s*$/.test(t)), '不得显示裸 A/B');
});

test('标签行不得随内容折行(折行会把题干推下去)', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const m = css.match(/\.question-card-tags\s*\{([^}]*)\}/);
    assert.ok(m, '缺 .question-card-tags 规则');
    assert.ok(/display\s*:\s*flex/.test(m[1]), '标签行应为 flex');
    assert.ok(/flex-wrap\s*:\s*nowrap/.test(m[1]), '标签行必须 nowrap');
    // 三个成员各自按内容占宽,不许互相挤
    assert.ok(/flex\s*:\s*0 0 auto/.test(css.match(/\.question-card-btn\s*\{([^}]*)\}/)[1]),
        '卡片按钮应 flex:0 0 auto');
});
