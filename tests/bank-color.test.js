// 题库卡配色(👤 定调 2026-09-11):去掉左侧蓝装饰条,改低饱和底色+边框;
// 默认与其它卡片一致的灰;编辑器内可选 5 色 + 灰。
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { loadApp, makeEl } from './helpers/vm-harness.mjs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const { run, store, elements, sandbox } = await loadApp();
run(`init()`);

test('卡片不再有左侧蓝装饰条,改为整圈边框', () => {
    const rule = css.match(/\.bank-item\s*\{([^}]*)\}/);
    assert.ok(rule, '应有 .bank-item 规则');
    assert.ok(!/border-left\s*:\s*4px\s*solid\s*var\(--c-primary\)/.test(rule[1]),
        '左侧 4px 主色装饰条必须去掉');
    assert.ok(/border\s*:\s*1px\s*solid/.test(rule[1]), '应改为 1px 整圈边框');
    assert.ok(/background-color\s*:\s*var\(--c-surface\)/.test(rule[1]),
        '缺省必须是普通卡片底色(与其它卡片一致)');
});

test('五个颜色各有 data-color 规则,且底色/边框都来自成对令牌', () => {
    const colors = ['blue', 'green', 'red', 'amber', 'teal'];
    for (const c of colors) {
        const re = new RegExp(`\\.bank-item\\[data-color="${c}"\\]\\s*\\{([^}]*)\\}`);
        const m = css.match(re);
        assert.ok(m, `缺 .bank-item[data-color="${c}"] 规则`);
        assert.ok(new RegExp(`background-color\\s*:\\s*var\\(--c-bank-${c}\\)`).test(m[1]),
            `${c} 的底色应取自 --c-bank-${c}`);
        assert.ok(new RegExp(`border-color\\s*:\\s*var\\(--c-bank-${c}-border\\)`).test(m[1]),
            `${c} 的边框应取自 --c-bank-${c}-border`);
    }
});

test('暗色下每个色都有对应值(浅底直接套会在暗色下刺眼)', () => {
    const dark = css.slice(css.indexOf('html[data-theme="dark"]'));
    for (const c of ['blue', 'green', 'red', 'amber', 'teal']) {
        assert.ok(new RegExp(`--c-bank-${c}\\s*:`).test(dark), `暗色缺 --c-bank-${c}`);
        assert.ok(new RegExp(`--c-bank-${c}-border\\s*:`).test(dark), `暗色缺 --c-bank-${c}-border`);
    }
});

test('配色数据层:默认灰、设色落盘、灰即清除、非法值被拒', () => {
    run(`questionBanks = { '库A': [], '库B': [] }; bankColors = {}`);
    assert.strictEqual(run(`bankColorOf('库A')`), 'grey', '缺省是灰');
    assert.strictEqual(run(`setBankColor('库A', 'blue')`), true);
    assert.strictEqual(run(`bankColorOf('库A')`), 'blue');
    assert.strictEqual(JSON.parse(store.get('bankColors'))['库A'], 'blue', '应落盘');
    // 灰 = 缺省语义 → 不留冗余字段
    run(`setBankColor('库A', 'grey')`);
    assert.strictEqual(run(`bankColorOf('库A')`), 'grey');
    assert.strictEqual(store.get('bankColors'), undefined, '全灰时不该留空表');
    // 非法值
    assert.strictEqual(run(`setBankColor('库A', 'rainbow')`), false, '不认识的色名必须拒绝');
    assert.strictEqual(run(`bankColorOf('库A')`), 'grey');
    // 损坏数据 → 退回灰,不炸
    run(`bankColors = { '库B': 'nonsense' }`);
    assert.strictEqual(run(`bankColorOf('库B')`), 'grey');
});

test('库卡按配色带 data-color;灰色不写属性(保持与其它卡片同构)', () => {
    run(`questionBanks = { '灰库': [], '蓝库': [] }; bankColors = { '蓝库': 'blue' }; isAllBanksView = true`);
    const mark = sandbox.__created.length;
    run(`updateBanksList()`);
    const items = sandbox.__created.slice(mark).filter(c => String(c.el.className) === 'bank-item').map(c => c.el);
    assert.ok(items.length >= 2, `应有 2 张库卡,实际 ${items.length}`);
    const byName = new Map();
    sandbox.__created.slice(mark).filter(c => c.tag === 'H3').forEach(c => byName.set(String(c.el.textContent), c.el));
    // 用属性记录查找:桩的 getAttribute 可读
    const gray = items.find(i => i.getAttribute('data-color') === null);
    const blue = items.find(i => i.getAttribute('data-color') === 'blue');
    assert.ok(gray, '灰色库卡不应带 data-color');
    assert.ok(blue, '蓝库卡应带 data-color="blue"');
});

test('配色随库名迁移(改个名颜色不该丢)', () => {
    run(`questionBanks = { '旧库': [] }; bankColors = { '旧库': 'teal' }`);
    elements['rename-bank-name'].value = '新库';
    run(`state.currentRenameBank = '旧库'; renameBank()`);   // 走真实重命名入口
    assert.strictEqual(run(`bankColorOf('新库')`), 'teal', '重命名后配色应跟随新库名');
    assert.strictEqual(run(`bankColorOf('旧库')`), 'grey', '旧库名不该残留配色');
});

test('删库时一并清掉配色(否则重建同名库会莫名带色)', () => {
    run(`questionBanks = { '待删': [] }; bankColors = { '待删': 'red' }`);
    run(`deleteBank('待删')`);
    assert.strictEqual(run(`bankColorOf('待删')`), 'grey');
    assert.ok(!(JSON.parse(store.get('bankColors') || '{}'))['待删'], '落盘里也不该留着');
});

test('色板在编辑器里渲染 6 档(灰 + 5 色),当前色带 active', () => {
    run(`questionBanks = { '色库': [] }; bankColors = { '色库': 'amber' }; state.editBankName = '色库'`);
    const mark = sandbox.__created.length;
    run(`renderBankColorPicker()`);
    const swatches = sandbox.__created.slice(mark)
        .filter(c => c.tag === 'BUTTON' && String(c.el.className).includes('bank-color-swatch')).map(c => c.el);
    assert.strictEqual(swatches.length, 6, '应有 6 档:灰 + 蓝绿红琥珀青');
    const values = sandbox.__created.slice(mark)
        .filter(c => c.tag === 'BUTTON' && String(c.el.className).includes('bank-color-swatch'))
        .map(c => c.el.dataset.color);
    assert.deepStrictEqual(values, ['grey', 'blue', 'green', 'red', 'amber', 'teal']);
    const active = sandbox.__created.slice(mark)
        .filter(c => c.tag === 'BUTTON' && String(c.el.className).includes('active'))
        .map(c => c.el.dataset.color);
    assert.deepStrictEqual(active, ['amber'], '当前色应带 active');
});
