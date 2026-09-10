// vm 沙箱测试装置:在带 DOM/localStorage 桩的上下文中加载全部 src 模块(ESM)。
// 需以 node --experimental-vm-modules 运行。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const { SourceTextModule } = vm;
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

export function makeEl() {
    return {
        _listeners: {},
        addEventListener(type, fn) { this._listeners[type] = fn; },
        setAttribute() {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        style: {}, appendChild() {}, textContent: '', value: '', innerHTML: '', files: [],
        checked: false, placeholder: '', rows: 0, dataset: {},
        querySelectorAll: () => [], type: '', children: [], disabled: false,
        focus() {},
    };
}

// 扫描 src/*.js 收集所有 DOM 常量(名字 → 元素 id),供注入 __zquiz 供测试驱动
function collectDomPairs() {
    const pairs = [];
    for (const f of ['state.js', 'parser.js', 'storage.js', 'main.js', 'dom.js', 'errorbook.js', 'favorites.js', 'quiz.js', 'bank.js']) {
        const srcText = readFileSync(path.join(SRC, f), 'utf8');
        for (const m of srcText.matchAll(/const (\w+) = document\.getElementById\('([\w-]+)'\)/g)) {
            pairs.push([m[1], m[2]]);
        }
    }
    return pairs;
}

export async function loadApp({ confirmResult = true, promptValue = 'x', sandboxExtras = {} } = {}) {
    const alerts = [];
    const elements = {};
    const store = new Map();
    const domContentLoadedCount = { n: 0 };

    const sandbox = {
        ...sandboxExtras,
        document: {
            getElementById: (id) => (elements[id] ||= makeEl()),
            querySelector: () => makeEl(),
            querySelectorAll: () => [],
            createElement: () => makeEl(),
            createTextNode: (t) => ({ text: t }),
            addEventListener(type) { if (type === 'DOMContentLoaded') domContentLoadedCount.n++; },
            body: makeEl(),
        },
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        },
        alert(msg) { alerts.push(msg); },
        confirm() { return confirmResult; },
        prompt() { return promptValue; },
        setTimeout() { return 0; },
        console,
    };
    // 文档级注入(如 documentElement),供主题等访问 document.documentElement 的模块测试
    if (sandboxExtras.document) Object.assign(sandbox.document, sandboxExtras.document);
    const context = vm.createContext(sandbox);

    const loaded = new Map();
    async function loadModule(spec) {
        if (loaded.has(spec)) return loaded.get(spec);
        const mod = new SourceTextModule(
            readFileSync(path.join(SRC, spec), 'utf8'),
            { identifier: spec, context }
        );
        loaded.set(spec, mod); // 先占位,防循环依赖死递归
        await mod.link(async (specifier) => loadModule(specifier.replace('./', '')));
        await mod.evaluate();
        return mod;
    }
    await loadModule('main.js');

    // 把模块内部的 DOM 常量对象挂到 __zquiz(与模块共享同一实例,测试可直接驱动)
    const domConsts = {};
    for (const [name, id] of collectDomPairs()) {
        if (elements[id]) domConsts[name] = elements[id];
    }
    sandbox.__inject = domConsts;
    vm.runInContext('Object.assign(globalThis.__zquiz, __inject)', context);

    // with(state) 让测试表达式继续用迁移前的裸状态名;with(__zquiz) 提供内部函数。
    // 表达式模式失败(含 let/const 的多语句)时回退到语句模式。
    const run = (expr) => {
        try {
            return vm.runInContext(
                `(function(){ with (globalThis.__zquiz) { with (__zquiz.state) { return (${expr}); } } })()`,
                context
            );
        } catch (e) {
            if (e?.name !== 'SyntaxError') throw e; // vm 上下文的 SyntaxError 不是宿主实例
            return vm.runInContext(
                `(function(){ with (globalThis.__zquiz) { with (__zquiz.state) { ${expr} } } })()`,
                context
            );
        }
    };

    return { run, elements, store, alerts, sandbox, domContentLoadedCount };
}
