// DOM 结构回归:所有模态框必须位于任何 section/main 之外
// (复习范围弹窗曾被隐藏 section 连带隐藏,点复习错题"没反应"的根因)
// 注:review-scope-modal 已随"题源"改造退役(复习不再走范围弹窗),此处不再列入;
// 但这条守卫对**现存**模态框继续有效——新增模态框请一并加进下面的清单。
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const css = readFileSync(path.join(root, 'styles.css'), 'utf8');

test('所有模态框均在 <main> 之外', () => {
    const mainEnd = html.indexOf('</main>');
    for (const id of ['create-bank-modal', 'rename-bank-modal', 'import-preview-modal', 'edit-bank-modal', 'ai-settings-modal']) {
        const pos = html.indexOf(`id="${id}"`);
        assert.ok(pos !== -1, `模态框 ${id} 不存在`);
        assert.ok(pos > mainEnd, `模态框 ${id} 仍在 <main> 内,会被隐藏 section 连带隐藏`);
    }
});

test('每个 section 内不得残留模态框', () => {
    for (const m of html.matchAll(/<section id="([^"]+)"/g)) {
        const secStart = html.indexOf(m[0]);
        const secEnd = html.indexOf('</section>', secStart);
        assert.ok(!html.slice(secStart, secEnd).includes('class="modal'), `${m[1]} 内残留模态框`);
    }
});

// 断言 CSS 前先去掉注释:否则"不要写 overflow:hidden"这类注释本身会被当成规则命中
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

test('标题栏悬浮(sticky)的前提:container 不得有 overflow 裁剪', () => {
    // position:sticky 会被祖先的 overflow:hidden/auto/scroll 裁剪而静默失效。
    // 这里守卫该前提,否则有人为了"圆角裁切"加回 overflow:hidden 就会悄悄破坏吸顶。
    const containerRule = cssNoComments.match(/\.container\s*\{[^}]*\}/);
    assert.ok(containerRule, '应有 .container 规则');
    assert.ok(
        !/overflow\s*:\s*(hidden|auto|scroll)/.test(containerRule[0]),
        '.container 不得设置 overflow 裁剪,否则 header 的 sticky 会失效',
    );

    const headerRule = cssNoComments.match(/^header\s*\{[^}]*\}/m);
    assert.ok(headerRule, '应有 header 规则');
    assert.ok(/position\s*:\s*sticky/.test(headerRule[0]), 'header 应 position: sticky');
    assert.ok(/top\s*:/.test(headerRule[0]), 'header 应设置吸顶偏移 top');
    assert.ok(/z-index\s*:.+/.test(headerRule[0]), 'header 应设置 z-index 以浮在内容之上');
});

test('主题开关住在标题栏里(每个 tab 都能切主题)', () => {
    const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
    assert.ok(header.includes('id="theme-switch"'), '主题开关应在 header 内');
    assert.ok(header.includes('data-theme-opt="dark"'), '暗色档位应在 header 内');
    // 首页不得再有第二个开关
    assert.strictEqual((html.match(/id="theme-switch"/g) || []).length, 1, 'theme-switch 只能有一个');
});
