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

test('品牌块:logo + 右下小字,tagline 是 h1 的嵌套 small', () => {
    const header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
    assert.ok(/<h1[^>]*class="brand"/.test(header), 'h1 应带 class="brand"(保留一级标题语义)');
    assert.ok(header.includes('Zquiz'), '应显示 Zquiz');
    assert.ok(/<small class="brand-tagline">期末周刷题助手<\/small>/.test(header), 'tagline 应是 h1 内的 small');
});

test('开始刷题按钮必须全屏宽隐藏(不能只写在手机媒体查询里)', () => {
    // 回归:该规则原先只写在 @media (max-width:768px) 内,
    // 导致桌面上"结果页上方还挂着一个开始刷题按钮"(👤 反馈)。
    // 判据:把所有媒体查询整体剔除后,该规则仍应存在 —— 剔除后不存在即说明它是手机专属。
    const stripMedia = (cssText) => {
        let out = '', i = 0;
        while (i < cssText.length) {
            const at = cssText.indexOf('@media', i);
            if (at === -1) { out += cssText.slice(i); break; }
            out += cssText.slice(i, at);
            const open = cssText.indexOf('{', at);
            let depth = 1, j = open + 1;
            while (j < cssText.length && depth > 0) {
                if (cssText[j] === '{') depth++;
                else if (cssText[j] === '}') depth--;
                j++;
            }
            i = j;
        }
        return out;
    };
    const noMedia = stripMedia(String(cssNoComments));
    assert.ok(
        noMedia.includes('#start-quiz-btn'),
        '#start-quiz-btn 的隐藏规则必须有一条不在任何媒体查询内(否则桌面端失效)',
    );
    assert.ok(
        /#quiz-result:not\(\.hidden\)\)\s*#start-quiz-btn/.test(String(cssNoComments)),
        '隐藏规则需覆盖 #quiz-result 显示时的状态(结果页也要隐藏该按钮)',
    );
});

test('首个模块上方不留空白:main 无上内边距 + 首元素 margin-top 归零', () => {
    // 👤 两次反馈"模块框上面空白太大"。根因是 main 的 32px 上内边距,
    // 且子元素自带上外边距会把它抵消掉,所以两处都要守。
    const cssText = String(cssNoComments);
    const mains = [...cssText.matchAll(/(?:^|[\s,])main\s*\{([^}]*)\}/g)].map(m => m[1]);
    assert.ok(mains.length >= 1, '应有 main 规则');
    for (const body of mains) {
        const pad = (body.match(/padding\s*:\s*([^;]+)/) || [])[1];
        if (pad) {
            const top = pad.trim().split(/\s+/)[0];
            assert.strictEqual(top, '0', `main 的 padding 上值应为 0,实际 ${top}`);
        }
    }
    assert.ok(
        /\.section\.active\s*>\s*\*:first-child\s*\{[^}]*margin-top\s*:\s*0/.test(cssText),
        '每个分区的首元素应 margin-top:0,否则会抵消 main 的收窄',
    );
});

test('品牌小字紧随 logo 的右下角(在同一行,不单独占一行)', () => {
    const cssText = String(cssNoComments);
    const brand = cssText.match(/h1\.brand\s*\{([^}]*)\}/);
    assert.ok(brand, '应有 h1.brand 规则');
    // 不得再用"纵向堆叠 + 右对齐"的旧方案(会让小字多占一行)
    assert.ok(!/flex-direction\s*:\s*column/.test(brand[1]), 'h1.brand 不应为 column 布局');
    const tagline = cssText.match(/\.brand-tagline\s*\{([^}]*)\}/);
    assert.ok(tagline, '应有 .brand-tagline 规则');
    assert.ok(/font-size\s*:\s*10px/.test(tagline[1]), '小字应为 10px');
});
