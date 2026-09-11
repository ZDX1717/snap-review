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

test('三个页面内容同宽:首页/题库页模块与刷题配置区都走阅读档', () => {
    // 实测教训:首页卡片与 .quiz-settings 都没有 max-width,桌面上撑满 952px(页面档),
    // 而刷题容器/结果页走 640px 阅读档 → "首页明显比后俩页宽"(👤 反馈)。
    // 同宽靠档位令牌保证,不靠逐页调。
    const cssText = String(cssNoComments);
    const want = [
        '#home-section > .operation-card',
        '#banks-section > .banks-list',
        '.quiz-settings',
    ];
    for (const sel of want) {
        const re = new RegExp(sel.replace(/[.#>]/g, (c) => '\\' + c) + '[^{]*\\{([^}]*)\\}');
        const m = cssText.match(re);
        assert.ok(m, `应有 ${sel} 的规则`);
        assert.ok(
            /max-width\s*:\s*var\(--reading-width\)/.test(m[1]),
            `${sel} 应走阅读档宽度(否则与其它页不同宽)`,
        );
    }
    // 刷题容器与结果页原本就走阅读档,一并对齐验证
    for (const sel of ['.quiz-container', '.quiz-result']) {
        const re = new RegExp(sel.replace(/[.#]/g, (c) => '\\' + c) + '[^{]*\\{([^}]*)\\}');
        assert.ok(/max-width\s*:\s*var\(--reading-width\)/.test(cssText.match(re)[1]), `${sel} 应走阅读档`);
    }
});

test('按钮类必须显式声明 border(否则露出浏览器默认黑边)', () => {
    // 回归:合并重复的 .nav-btn 规则时漏掉了 border:none,
    // 结果导航按钮戴上浏览器默认边框,表现为"按钮周围出现黑边"。
    // 判据:每个"作为按钮用"的类,其规则里必须出现 border 声明(border:none 或自定义边框)。
    const cssText = String(cssNoComments);
    const buttonClasses = ['\.nav-btn', '\.action-btn', '\.theme-opt', '\.card-link',
        '\.prompt-toggle', '\.favorite-btn', '\\.delete-btn', '\.foot-toggle'];
    const missing = [];
    for (const cls of buttonClasses) {
        // 取该类的**基础**规则:选择器的第一项必须正好是该类(不含伪类/祖先选择器),
        // 否则会误命中 `.quiz-meta .favorite-btn` 这类复合规则(其 body 里自然没有 border)
        const re = new RegExp('(?:^|\\})[^{}]*?(?:^|[\\n,])\\s*' + cls + '\\s*\\{([^}]*)\\}', 'm');
        const m = cssText.match(re);
        if (!m) continue;                       // 该类可能只在复合选择器里出现
        // 注意:必须排除 border-radius —— 它含 'border' 子串,会让判据形同虚设
        const hasBorderDecl = /(^|[;{\s])border(-width|-style|-color|-top|-right|-bottom|-left)?\s*:/.test(m[1]);
        if (!hasBorderDecl) missing.push(cls.replace('\\', ''));
    }
    assert.deepStrictEqual(missing, [], `这些按钮类缺少 border 声明,会露出默认黑边: ${missing.join(', ')}`);
});

test('刷题元信息并入下方操作区:进度条已移除,手机单行且按钮收窄', () => {
    // 👤 要求:删进度条,把「1/45 判断 收藏 连对」放到下一题/结束刷题按钮左边。
    const cssText = String(cssNoComments);

    // ① 进度条元素与其样式都已移除
    assert.ok(!html.includes('quiz-progress'), '进度条元素应已移除');
    assert.ok(!/quiz-progress/.test(cssText), '进度条样式应已移除');
    assert.ok(!html.includes('question-header'), '题目头部元素应已移除');

    // ② 元信息位于操作区内,且在按钮组之前(左)
    const controls = html.slice(html.indexOf('class="quiz-controls"'), html.indexOf('</div>', html.indexOf('class="quiz-actions"')));
    assert.ok(controls.includes('class="quiz-meta"'), '操作区内应有 .quiz-meta');
    assert.ok(controls.indexOf('quiz-meta') < controls.indexOf('quiz-actions'), '元信息应在按钮组之前(左侧)');
    for (const id of ['question-number', 'favorite-btn']) {
        assert.ok(controls.includes(`id="${id}"`), `元信息应包含 #${id}`);
    }
    // 题型已移到题干之前(👤 要求),不再留在状态栏里
    assert.ok(!controls.includes('id="question-type"'), '题型不应再留在状态栏');
    assert.ok(
        html.indexOf('id="question-type"') < html.indexOf('id="question-text"'),
        '题型应出现在题干之前',
    );
    // 连对(🔥)展示功能已按 👤 要求整体删除,不得残留元素/样式/代码
    assert.ok(!html.includes('streak-badge'), '连对徽标元素应已删除');
    assert.ok(!/streak-badge/.test(cssText), '连对徽标样式应已删除');
    assert.ok(!/updateStreakBadge/.test(readFileSync(path.join(root, 'src', 'quiz.js'), 'utf8')),
        'updateStreakBadge 代码应已删除');

    // ③ 收藏按钮在元信息行内不得再靠右(它原在题目头部靠右,自带 margin-left:auto)
    const favOverride = cssText.match(/\.quiz-meta \.favorite-btn\s*\{([^}]*)\}/);
    assert.ok(favOverride, '应有 .quiz-meta .favorite-btn 覆盖规则');
    assert.ok(/margin-left\s*:\s*0/.test(favOverride[1]), '元信息行内收藏按钮必须清掉 margin-left:auto');

    // ④ 手机端:元信息另起一行(column),按钮行保持单行不换行
    // 手机端:操作条必须是**单行**(row + nowrap),元信息在左、按钮在右。
    const mediaIdx = cssText.indexOf('max-width: 768px');
    assert.ok(mediaIdx > -1, '应有手机媒体查询');
    const after = cssText.slice(mediaIdx);
    // ⚠️ 必须取"位于手机媒体查询之后"的那条规则:文件里 .quiz-controls 还有桌面版本(更靠前),
    // 直接用 after 段匹配会命中桌面规则(判据错位)。这里按出现位置过滤。
    const rulesFrom = (re) => {
        const out = [];
        let m;
        const rx = new RegExp(re.source, 'g');
        while ((m = rx.exec(cssText)) !== null) {
            if (m.index >= mediaIdx) out.push(m[1]);
        }
        return out;
    };
    const mcList = rulesFrom(/\.quiz-controls\s*\{([^}]*)\}/);
    assert.ok(mcList.length > 0, '手机端应有 .quiz-controls 规则');
    const mc = mcList[mcList.length - 1];
    assert.ok(/flex-direction\s*:\s*row/.test(mc), '手机端操作条应为单行(row)');
    assert.ok(/flex-wrap\s*:\s*nowrap/.test(mc), '手机端操作条不得换行');
    const maList = rulesFrom(/\.quiz-actions\s*\{([^}]*)\}/);
    assert.ok(maList.some(b => /flex-wrap\s*:\s*nowrap/.test(b)), '手机端按钮组不得换行');
    // 按钮必须自然宽度(收窄),不能再 flex:1 平分或 width:100% 撑满。
    // ⚠️ 覆盖必须用 #id 选择器:上方"拇指热区"规则用 id 给了 width:100%,
    // 类选择器特异性不够、会被压住(实测三键各 236px → 换行 → "只看得到一个按钮")。
    const mobileBtnRules = rulesFrom(/\.quiz-actions #(?:prev-question|submit-answer|next-question|end-quiz)-btn[^{]*\{([^}]*)\}/);
    assert.ok(mobileBtnRules.length > 0, '手机端应用 #id 选择器覆盖按钮宽度');
    assert.ok(mobileBtnRules.some(b => /width\s*:\s*auto/.test(b)), '按钮须覆盖为 width:auto');
    assert.ok(mobileBtnRules.some(b => /flex\s*:\s*0 0 auto/.test(b)), '按钮应 flex:0 0 auto');
    // 翻页键允许压缩,保证三键同处一行
    const shrink = rulesFrom(/flex\s*:\s*0 1 auto/);
    assert.ok(shrink.length > 0, '翻页键应允许压缩(flex:0 1 auto)以保持单行');
});

test('状态栏按钮:智能切题在,确认答案已删', () => {
    assert.ok(html.includes('智能切题'), '按钮文案应为「智能切题」');
    assert.ok(!html.includes('submit-answer-btn'), '「确认答案」按钮元素应已移除');
    assert.ok(!html.includes('确认答案'), '「确认答案」文案应已移除');
});

test('状态栏左区:状态一行在上,收藏与智能切题并排在下一行', () => {
    const i = html.indexOf('class="quiz-meta"');
    const meta = html.slice(i, html.indexOf('</div>', html.indexOf('quiz-meta-row')));
    assert.ok(meta.includes('class="quiz-status"'), '左区应有状态指示块');
    assert.ok(meta.includes('class="quiz-meta-row"'), '左区应有并排行容器');
    // 收藏与智能切题都在并排行里,且收藏在左
    const row = meta.slice(meta.indexOf('quiz-meta-row'));
    assert.ok(row.indexOf('favorite-btn') < row.indexOf('auto-next-toggle'), '收藏应在智能切题左侧');
    // 智能切题不得再留在状态行里
    const status = meta.slice(meta.indexOf('class="quiz-status"'), meta.indexOf('quiz-meta-row'));
    assert.ok(!status.includes('auto-next-toggle'), '智能切题不应再在状态行内');
    // 并排行必须是 flex
    const cssText = String(cssNoComments);
    const m = cssText.match(/\.quiz-meta-row\s*\{([^}]*)\}/);
    assert.ok(m && /display\s*:\s*flex/.test(m[1]), '.quiz-meta-row 应为 flex 并排');
});

// ==================== 答题卡抽屉(P0-6.1)====================
test('答题卡抽屉在 <main> 之外(公理:浮层不受 section 显隐牵连)', () => {
    const mainEnd = html.indexOf('</main>');
    const pos = html.indexOf('id="answer-card-drawer"');
    assert.ok(pos !== -1, '答题卡抽屉不存在');
    // 抽屉是 position:fixed 的浮层:待在 main 内会受祖先滚动/包含块牵连
    assert.ok(pos > mainEnd, '答题卡抽屉必须在 <main> 之外');
    for (const id of ['answer-card-backdrop', 'answer-card-grid', 'answer-card-close']) {
        assert.ok(html.indexOf(`id="${id}"`) > mainEnd, `${id} 必须在 <main> 之外`);
    }
});

test('答题卡入口住在刷题状态栏的进度位置', () => {
    // 👤 定调:入口就是状态栏里的进度本身,不得另起一个常驻按钮
    const metaStart = html.indexOf('id="quiz-status-text"');
    const metaEnd = html.indexOf('</div>', html.indexOf('class="quiz-meta"'));
    const openPos = html.indexOf('id="answer-card-open"');
    assert.ok(openPos !== -1, '答题卡入口按钮不存在');
    assert.ok(openPos > metaStart && openPos < metaEnd, '答题卡入口必须在刷题状态栏内');
    // 进度数字仍然是那个被显示的元素(别把 #question-number 挪走,刷题进度靠它)
    const openTag = html.slice(openPos, html.indexOf('</button>', openPos));
    assert.ok(openTag.includes('id="question-number"'), '进度 #question-number 必须仍在入口按钮内');
    assert.ok(openTag.includes('aria-haspopup="dialog"'), '入口应有 aria-haspopup 语义');
});

test('答题卡抽屉:遮罩层级必须高于弹窗(否则弹窗里打开会被盖住)', () => {
    const backdrop = cssNoComments.match(/\.answer-card-backdrop\s*\{[^}]*\}/);
    const drawer = cssNoComments.match(/\.answer-card-drawer\s*\{[^}]*\}/);
    assert.ok(backdrop && drawer, '应有遮罩与抽屉的样式规则');
    const zOf = (rule) => Number((rule[0].match(/z-index\s*:\s*(\d+)/) || [])[1]);
    assert.ok(zOf(backdrop) > 1000, `遮罩 z-index 应高于弹窗(1000),实际 ${zOf(backdrop)}`);
    assert.ok(zOf(drawer) > zOf(backdrop), '抽屉必须高于自己的遮罩,否则被遮罩挡住点不到');
    assert.ok(/position\s*:\s*fixed/.test(drawer[0]), '抽屉应 position: fixed 相对视口定位');
});

test('答题卡三态样式齐备,且未答用虚线框(不只靠颜色区分)', () => {
    for (const state of ['correct', 'wrong', 'blank']) {
        const rule = cssNoComments.match(new RegExp(`\\.answer-card-cell\\.${state}\\s*\\{[^}]*\\}`));
        assert.ok(rule, `缺 .answer-card-cell.${state} 样式`);
    }
    const blank = cssNoComments.match(/\.answer-card-cell\.blank\s*\{[^}]*\}/)[0];
    assert.ok(/border-style\s*:\s*dashed/.test(blank), '未答必须用虚线框,不能只靠颜色');
    // 当前题用 outline:改边框会覆盖三态底色(当前题也可能是已答对的题)
    const current = cssNoComments.match(/\.answer-card-cell\.current\s*\{[^}]*\}/);
    assert.ok(current, '缺 .answer-card-cell.current 样式');
    assert.ok(/outline\s*:/.test(current[0]), '当前题应用 outline 而非 border');
    assert.ok(!/border\s*:/.test(current[0].replace(/outline[^;]*;/g, '')), '当前题不得覆盖 border(会吃掉三态底色)');
});

test('答题卡样式不得写死像素宽度(宽度走档位令牌)', () => {
    const drawer = cssNoComments.match(/\.answer-card-drawer\s*\{[^}]*\}/)[0];
    assert.ok(!/max-width\s*:\s*\d+px/.test(drawer), '抽屉不得写死 max-width 像素');
    assert.ok(/var\(--pad-x\)/.test(drawer), '抽屉左右内边距应复用 --pad-x(与三页统一内边距一致)');
});
