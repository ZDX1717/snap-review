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

test('内容区内边距统一:三页共用一套值(含手机小档)', () => {
    // 演进:先是有 32px 上内边距(模块上方空白太大)→ 改成 0(内容贴住标题栏)→
    // 现在统一为一套令牌。守的是"统一"与"顶部有呼吸位"这两点。
    const cssText = String(cssNoComments);

    // ① 令牌存在且有值
    for (const tok of ['--pad-x', '--pad-top', '--pad-bottom']) {
        assert.ok(new RegExp(`^\\s*${tok}\\s*:\\s*\\d+px`, 'm').test(cssText), `应定义 ${tok}`);
    }

    // ② 桌面 main 使用令牌,而不是写死像素(写死就没法"统一")
    const mainRule = cssText.match(/(?:^|[\s,])main\s*\{([^}]*)\}/);
    assert.ok(mainRule, '应有 main 规则');
    assert.ok(
        /padding\s*:\s*var\(--pad-top\)\s+var\(--pad-x\)\s+var\(--pad-bottom\)/.test(mainRule[1]),
        'main 的 padding 应使用统一令牌',
    );

    // ③ 手机端只覆盖令牌值,不再另写一套 main padding
    const mobileTokens = (cssText.match(/@media[^{]*max-width:\s*768px[^{]*\{[\s\S]*?:root\s*\{([^}]*)\}/) || [])[1];
    assert.ok(mobileTokens, '手机端应覆盖 :root 的间距令牌');
    assert.ok(/--pad-top\s*:\s*\d+px/.test(mobileTokens), '手机端应给 --pad-top 一个非零小档');

    // ④ 顶部不得为 0 —— 曾被设成 0,导致刷题/题库页内容直接贴住标题栏(👤 反馈)
    const top = cssText.match(/--pad-top\s*:\s*(\d+)px/);
    assert.ok(Number(top[1]) > 0, '顶部必须有呼吸位(不得为 0)');
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

test('宽度档位唯一来源:不得在别处写死 max-width 像素', () => {
    // 👤 反馈"首页明显比后俩页宽"。根因是首页卡片没有 max-width,撑满 1000px 页面档,
    // 而刷题/结果页走 640px 阅读档。为了让"三页同宽"成为可守的不变量,
    // 四档宽度全部提为令牌;任何地方再写死 max-width 像素都会破坏一致性。
    const cssText = String(cssNoComments);
    // 排除 :root 里的令牌定义行
    // 只匹配"声明的属性",不匹配 @media 条件(它们不是属性,写法上带括号)
    const offenders = cssText
        .split('\n')
        .filter(l => /(^|[;{\s])max-width\s*:\s*\d+px/.test(l) && !/^\s*--/.test(l) && !/@media/.test(l));
    assert.deepStrictEqual(offenders, [], `不得写死 max-width 像素,应使用档位令牌:\n${offenders.join('\n')}`);

    for (const tok of ['--reading-width', '--modal-sm', '--modal-lg', '--page-width']) {
        assert.ok(new RegExp(`^\\s*${tok}\\s*:\\s*\\d+px`, 'm').test(cssText), `应定义 ${tok}`);
    }
});

test('三页内容同宽:首页与题库页的模块走阅读档', () => {
    const cssText = String(cssNoComments);
    for (const sel of ['#home-section > .operation-card', '#banks-section > .banks-list']) {
        const re = new RegExp(sel.replace(/[.#>]/g, (c) => '\\' + c) + '[^{]*\\{([^}]*)\\}');
        const m = cssText.match(re);
        assert.ok(m, `应有 ${sel} 的宽度规则`);
        assert.ok(/max-width\s*:\s*var\(--reading-width\)/.test(m[1]), `${sel} 应走阅读档宽度`);
    }
});
