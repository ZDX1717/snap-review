// DOM 结构回归:所有模态框必须位于任何 section/main 之外
// (复习范围弹窗曾被隐藏 section 连带隐藏,点复习错题"没反应"的根因)
// 注:review-scope-modal 已随"题源"改造退役(复习不再走范围弹窗),此处不再列入;
// 但这条守卫对**现存**模态框继续有效——新增模态框请一并加进下面的清单。
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const html = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

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
