// 官方提示词模块测试:触发判定 + 提示词内容关键约束
import assert from 'node:assert';
import test from 'node:test';
import { OFFICIAL_PROMPT, needsPromptHelp, LOW_CONF_RATIO_THRESHOLD } from '../src/prompt.js';
import { parseQuestionsText } from '../src/parser.js';

test('触发判定:0 题 → 建议;低置信占比达标 → 建议;健康批次 → 不建议', () => {
    assert.strictEqual(needsPromptHelp([]), true);
    const healthy = parseQuestionsText(`1. 题 A.甲 B.乙 答案：A
2. 题 B.甲 丙.乙 答案：B`.replace('B.甲 丙.乙', 'A.甲 B.乙'));
    assert.strictEqual(needsPromptHelp(healthy), false);
    const messy = parseQuestionsText(`1. 好题 A.甲 B.乙 答案：A
2. 缺答案
3. 也缺答案`);
    // 3 题中 2 题缺答案 → 低置信占比 2/3 ≥ 0.4 → 建议
    assert.strictEqual(needsPromptHelp(messy), true);
    assert.strictEqual(LOW_CONF_RATIO_THRESHOLD, 0.4);
});

test('提示词内容:关键约束齐备(不猜答案/不改内容/格式对齐 parser 字段式)', () => {
    assert.ok(OFFICIAL_PROMPT.includes('题库格式整理助手'));
    assert.ok(OFFICIAL_PROMPT.includes('绝对不许猜答案'));
    assert.ok(OFFICIAL_PROMPT.includes('只调整格式,不改内容'));
    assert.ok(OFFICIAL_PROMPT.includes('多选字母连写'));
    assert.ok(OFFICIAL_PROMPT.includes('判断题写"对"或"错"'));
    assert.ok(OFFICIAL_PROMPT.includes('题目：'));
    assert.ok(OFFICIAL_PROMPT.includes('不要给题目加编号'));
});
