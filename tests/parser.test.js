// 解析核心测试:真实 import,不经过 vm 桩
import test from 'node:test';
import assert from 'node:assert';
import {
    parseQuestionsText, finalizeQuestion, normalizeAnswerString, questionDedupKey,
} from '../src/parser.js';

const P = (s) => parseQuestionsText(s);

test('答案规范化:大小写/分隔符/去重/排序', () => {
    assert.strictEqual(normalizeAnswerString('CA'), 'AC');
    assert.strictEqual(normalizeAnswerString('a、b'), 'AB');
    assert.strictEqual(normalizeAnswerString('AAB'), 'AB');
    assert.strictEqual(normalizeAnswerString('AC') === normalizeAnswerString('CA'), true);
    assert.strictEqual(normalizeAnswerString('b'), 'B');
});

test('家族A:字段式完整解析(解释/选项解释/解析/类型全保留)', () => {
    const qs = P(`# 单选题1
题目：福祸相依体现了（）
A：矛盾的同一性
A解释：矛盾双方相互依存
B：矛盾的斗争性
答案：A
解析：契合同一性定义
类型：单选`);
    assert.strictEqual(qs.length, 1);
    assert.strictEqual(qs[0].title, '单选题1');
    assert.strictEqual(qs[0].content, '福祸相依体现了（）');
    assert.strictEqual(qs[0].options.A, '矛盾的同一性');
    assert.strictEqual(qs[0].optionExplanations.A, '矛盾双方相互依存');
    assert.strictEqual(qs[0].answer, 'A');
    assert.strictEqual(qs[0].analysis, '契合同一性定义');
    assert.strictEqual(qs[0].type, '单选');
});

test('家族B:编号式逐行 + 多行题干', () => {
    const qs = P(`1. 下列哪个是编程语言？
A. Python
B. HTML
答案：A
解析：Python 是编程语言

2. 下列哪些属于前端技术？
A. HTML
B. CSS
答案：ABC`);
    assert.strictEqual(qs.length, 2);
    assert.strictEqual(qs[0].answer, 'A');
    assert.strictEqual(qs[0].type, '单选');
    assert.strictEqual(qs[1].type, '多选');
});

test('家族C:单行混排(题干+行内选项+行内答案)', () => {
    const qs = P(`1. 一年有几个月？A.10 B.11 C.12 D.13 答案：C
2. HTTPS使用的端口号是？
A. 21 B.80 C.443 D.22 答案：D`);
    assert.strictEqual(qs[0].content, '一年有几个月？');
    assert.strictEqual(qs[0].options.C, '12');
    assert.strictEqual(qs[1].options.D, '22');
    assert.strictEqual(qs[1].answer, 'D');
});

test('家族D:判断题自动配 A正确/B错误', () => {
    assert.strictEqual(P(`1. 中国的首都是北京。答案：对`)[0].answer, 'A');
    assert.strictEqual(P(`1. 地球是方的。答案：错误`)[0].answer, 'B');
    const q = P(`1. 水的化学式是H2O。答案：√`)[0];
    assert.strictEqual(q.type, '判断');
    assert.deepStrictEqual(q.options, { A: '正确', B: '错误' });
});

test('finalizeQuestion 幂等 + 缺答案保留进预览', () => {
    const before = JSON.stringify(P(`1. 测试 A.1 B.2 答案：B`)[0]);
    const again = JSON.stringify(finalizeQuestion(P(`1. 测试 A.1 B.2 答案：B`)[0]));
    assert.strictEqual(again, before);
    const noAns = P(`1. 没有答案的题
A. 甲
B. 乙`);
    assert.strictEqual(noAns[0].answer, '');
    assert.ok(noAns[0].confidence < 0.6);
});

test('去重指纹:同题干同选项不同答案=重复;同题干不同选项=不同', () => {
    assert.strictEqual(questionDedupKey({ content: '题A', options: { A: '甲' } }),
                       questionDedupKey({ content: '题A ', options: { A: '甲' } }));   // 选项相同、答案不同 → 重复
    assert.notStrictEqual(questionDedupKey({ content: '题A', options: { A: '甲' } }),
                          questionDedupKey({ content: '题A', options: { A: '丙' } })); // 选项文本不同 → 不同题
});
