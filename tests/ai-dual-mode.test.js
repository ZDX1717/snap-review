// P1-1 AI 双模式:模式一「格式整理(不改内容)」与模式二「生成答案与解析」的分界与约束。
// 分层:纯函数直连模块(不经过 vm 桩);涉及 UI 的部分另在 ai.test.js / question-card 里覆盖。
import test from 'node:test';
import assert from 'node:assert';
import { ANSWER_PROMPT, OFFICIAL_PROMPT, FORMAT_MODE_NAME } from '../src/prompt.js';
import {
    aiAnswerQuestions, isUndetermined, mergeAiAnswers, questionsNeedingAi, questionsNeedingAnswer, serializeForAnswer,
} from '../src/ai.js';
import { finalizeQuestion, formatQuestionsForExport, parseQuestionsText } from '../src/parser.js';

const Q = (over = {}) => ({
    content: '下列属于行政处罚种类的有', type: '多选',
    options: { A: '警告', B: '罚款', C: '拘役', D: '吊销许可证' },
    answer: '', analysis: '', ...over,
});

// ---------- 模式一:改名与"不改内容"承诺 ----------
test('模式一有统一名称,且两条提示词都强调"不许猜答案"', () => {
    assert.ok(FORMAT_MODE_NAME.includes('不改内容'), '模式一名称必须明示不改内容');
    assert.ok(/绝对不许猜答案|不许推断|只能抄自材料原文/.test(OFFICIAL_PROMPT),
        '模式一提示词必须明确禁止猜答案');
});

test('两条提示词是分开的:模式二才允许给答案,且要求无法确定时如实说', () => {
    assert.notStrictEqual(ANSWER_PROMPT, OFFICIAL_PROMPT, '模式二必须是独立提示词');
    assert.ok(/无法确定/.test(ANSWER_PROMPT), '模式二必须允许「无法确定」这个合法输出');
    assert.ok(/宁可说无法确定/.test(ANSWER_PROMPT), '必须明确"宁可不猜"');
    assert.ok(/原样照抄/.test(ANSWER_PROMPT), '模式二也不许改题干/选项');
    // 模式一不得出现"给答案"的授权
    assert.ok(!/你判断的最可能答案/.test(OFFICIAL_PROMPT));
});

// ---------- 模式二:编排与合并 ----------
test('待补口径:缺答案 或 缺解析;两样都齐的题一律不送', () => {
    const list = [
        Q(),                                   // 答案、解析全缺 → 要补
        Q({ answer: 'A' }),                    // 缺解析 → 要补(但答案不许被改)
        Q({ answer: '', analysis: '已有解析' }), // 缺答案 → 要补
        Q({ answer: 'B', analysis: 'x' }),      // 全齐 → 不送
    ];
    const todo = questionsNeedingAi(list);
    assert.strictEqual(todo.length, 3, '缺答案或缺解析的都该进待补列表');
    assert.ok(todo.every(q => !q.answer || !q.analysis), '全齐的题不得进待补列表');
});

test('只缺解析的题会被送出,故另设"严格只补答案"的口径(少外传已有答案)', () => {
    const list = [Q(), Q({ answer: 'A' }), Q({ answer: '', analysis: '已有解析' }), Q({ answer: 'B', analysis: 'x' })];
    // 严格口径:只挑真正缺答案的 —— 送出的文本里就不会带任何"用户已有答案"
    const strict = questionsNeedingAnswer(list);
    assert.strictEqual(strict.length, 2);
    assert.ok(strict.every(q => !q.answer), '严格口径下不得含任何已有答案的题');
    strict.forEach(q => {
        assert.ok(!serializeForAnswer(q).includes('答案'), '严格口径送出的文本里不该出现"答案"');
    });
});

test('送 AI 的文本不含已有答案(既不暴露用户答案,也不给模型改写的机会)', () => {
    const t = serializeForAnswer(Q({ answer: 'ABD', explanation: '考行政处罚' }));
    assert.ok(t.includes('题目：'), '含题干');
    assert.ok(t.includes('A：警告'), '含选项');
    assert.ok(t.includes('题目解释：考行政处罚'), '含题干解释');
    assert.ok(!t.includes('答案'), '不得把已有答案送出去');
});

test('「无法确定」是合法输出,且不得落库', () => {
    assert.strictEqual(isUndetermined('无法确定'), true);
    assert.strictEqual(isUndetermined('无法确定（题目缺少选项内容）'), true);
    assert.strictEqual(isUndetermined('ABD'), false);
    const target = Q();
    const r = mergeAiAnswers([target], [{ content: target.content, options: target.options, answer: '无法确定', analysis: '题目信息不全' }]);
    assert.strictEqual(target.answer, '', '无法确定不得写进答案');
    assert.strictEqual(target.answerSource, undefined, '不得打 AI 来源标');
    assert.strictEqual(r.undetermined, 1);
    assert.ok(r.details[0].parts.join().includes('无法确定'), '要如实告诉用户"没定下来"');
});

test('合并:只补空白,绝不覆盖已有答案与解析', () => {
    const a = Q();
    const b = Q({ answer: 'AB', analysis: '人工写的解析' });
    const c = Q({ answer: 'ABD', analysis: '' });
    const produced = [
        { content: a.content, options: a.options, answer: 'ABD', analysis: 'AI 给的解析' },
        { content: b.content, options: b.options, answer: 'A', analysis: 'AI 想覆盖的解析' },
        { content: c.content, options: c.options, answer: 'A', analysis: 'AI 补的解析' },
    ];
    const r = mergeAiAnswers([a, b, c], produced);
    // a:全空 → 补答案+解析
    assert.strictEqual(a.answer, 'ABD');
    assert.strictEqual(a.analysis, 'AI 给的解析');
    assert.strictEqual(a.answerSource, 'ai');
    assert.strictEqual(a.analysisSource, 'ai');
    // b:答案与解析都有 → 一个字都不许动
    assert.strictEqual(b.answer, 'AB', '已有答案绝不被覆盖');
    assert.strictEqual(b.analysis, '人工写的解析', '已有解析绝不被覆盖');
    assert.strictEqual(b.answerSource, undefined, '未被 AI 改过就不该有 AI 标记');
    // c:有答案缺解析 → 只补解析,答案不动、答案来源保持"人"
    assert.strictEqual(c.answer, 'ABD');
    assert.strictEqual(c.analysis, 'AI 补的解析');
    assert.strictEqual(c.answerSource, undefined, '答案没被 AI 碰过 → 不该打成 AI');
    assert.strictEqual(c.analysisSource, 'ai');
    assert.strictEqual(r.answerFilled, 1);
    assert.strictEqual(r.analysisFilled, 2);
});

test('编排:分块调用并把 ANSWER_PROMPT 作为 system,进度按题数上报', async () => {
    const list = Array.from({ length: 10 }, (_, i) => Q({ content: '题' + i, options: { A: 'x', B: 'y' }, answer: '' }));
    const seen = [];
    const f = async (url, init) => {
        const body = JSON.parse(init.body);
        seen.push(body.messages[0].content);
        assert.ok(/无法确定/.test(body.messages[0].content), 'system 必须是模式二提示词');
        const echoed = body.messages[1].content.split('\n\n').map(b => b + '\n答案：A\n解析：补的').join('\n\n');
        return { ok: true, json: async () => ({ choices: [{ message: { content: echoed } }] }) };
    };
    const prog = [];
    const cfg = { baseUrl: 'https://api.example/v1', apiKey: 'k', model: 'm' };
    const { questions, total } = await aiAnswerQuestions(cfg, list, {
        fetchImpl: f, timeoutMs: 0, maxPerChunk: 4, onProgress: (d, t) => prog.push(`${d}/${t}`),
    });
    assert.strictEqual(total, 10);
    assert.ok(seen.length >= 3, `10 题按 4 题一块应至少 3 次调用,实际 ${seen.length}`);
    assert.ok(questions.length >= 10, '解析回来的题数应覆盖全部待补题');
    assert.strictEqual(prog[prog.length - 1], '10/10', '进度应报到总数');
});

test('没有待补的题时直接报错,不白花一次请求', async () => {
    let called = false;
    await assert.rejects(
        () => aiAnswerQuestions({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
            [Q({ answer: 'A', analysis: 'x' })],
            { fetchImpl: async () => { called = true; } }),
        /无需补/,
    );
    assert.strictEqual(called, false);
});

// ---------- P1-1.5 导出标注 + 往返 ----------
test('导出把 AI 生成的答案/解析标出来,人工的不标', () => {
    const human = finalizeQuestion(Q({ answer: 'ABD', analysis: '人工解析' }));
    const ai = finalizeQuestion(Q({ answer: 'A', analysis: 'AI 解析', answerSource: 'ai', analysisSource: 'ai' }));
    const txt = formatQuestionsForExport([human, ai]);
    assert.ok(/答案：ABD/.test(txt), '人工答案不标注');
    assert.ok(!/答案(AI 生成)：ABD/.test(txt));
    assert.ok(/答案\(AI 生成\)：A/.test(txt), 'AI 答案必须标注');
    assert.ok(/解析\(AI 生成\)：AI 解析/.test(txt), 'AI 解析必须标注');
});

test('导出 → 再导入 是往返无损的:答案/解析/来源标记都能读回来', () => {
    const src = finalizeQuestion(Q({ answer: 'ABD', analysis: 'AI 解析', answerSource: 'ai', analysisSource: 'ai' }));
    const roundTrip = parseQuestionsText(formatQuestionsForExport([src]))[0];
    assert.ok(roundTrip, '导出文本必须能被自己解析回来');
    assert.strictEqual(roundTrip.answer, 'ABD', '答案不得在往返中丢失');
    assert.strictEqual(roundTrip.analysis, 'AI 解析', '解析不得在往返中丢失');
    assert.strictEqual(roundTrip.answerSource, 'ai', 'AI 来源标记应随文件带回来');
    assert.strictEqual(roundTrip.analysisSource, 'ai');
});

test('普通(不带标记)的导出仍按原样读回,不受后缀改动影响', () => {
    const human = finalizeQuestion(Q({ answer: 'B', analysis: '人写的' }));
    const back = parseQuestionsText(formatQuestionsForExport([human]))[0];
    assert.strictEqual(back.answer, 'B');
    assert.strictEqual(back.analysis, '人写的');
    assert.ok(!back.answerSource, '人工内容不得被误标为 AI');
});
