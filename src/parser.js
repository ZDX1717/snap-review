// ==================== 纯函数解析核心(无 DOM / 无存储依赖) ====================
// 职责:任意格式文本 → 标准题目对象;答案规范化;判分指纹。
// 允许依赖:无。禁止:document / localStorage / state。

export const OPTION_LINE_RE = /^\s*([A-Ha-h])\s*[.、:：．)）,，]\s*(.+)$/;

export const OPTION_EXPLAIN_RE = /^\s*([A-Ha-h])\s*解释\s*[:：]\s*(.+)$/;

export const QUESTION_NUM_RE = /^(\d{1,3})\s*[.、)）．]\s*(.*)$/;

export const JUDGE_QUESTION_RE = /^判断题\s*[:：]\s*(.*)$/;

export const TITLE_RE = /^#\s*(.*)$/;

export const ANALYSIS_RE = /^(?:答案解析|解析)\s*[:：]\s*(.+)$/;

export const EXPLAIN_RE = /^(?:题目解释|题干解释)\s*[:：]\s*(.+)$/;

export const TYPE_RE = /^(?:类型|题型)\s*[:：]\s*(.+)$/;

export const QUESTION_FIELD_RE = /^题目\s*[:：]\s*(.*)$/;

export const FULL_ANSWER_RE = /^(?:【?参考答案】?|【?标准答案】?|【?正确答案】?|【?答案】?|答案)\s*[:：]\s*(.+?)\s*[。.]?$/;

export const FULL_ANSWER_SPACED_RE = /^(?:【?参考答案】?|【?标准答案】?|【?正确答案】?|【?答案】?|答案)\s+((?:[A-Ha-h√×对错]+)(?:[\s、,，]+[A-Ha-h√×对错]+)*)\s*[。.]?$/;

export const INLINE_ANSWER_RE = /(^|[\s(（,，;；。？！：、])(?:【?参考答案】?|【?标准答案】?|【?正确答案】?|【?答案】?|答案)\s*[:：]?\s*((?:正确|错误)|[A-Ha-h√×对错](?:[\s、,，]*[A-Ha-h√×对错])*)\s*[。.]?\s*$/;

export const JUDGE_TRUE_RE = /^(对|正确|√|T|Y)$/i;

export const JUDGE_FALSE_RE = /^(错|错误|×|X|F|N)$/i;


// 整行答案（必须带冒号，避免把普通句子误判成答案行）
// 空格分隔的纯答案行，如"答案 A" / "参考答案 B"
// 行尾行内答案（家族C），要求"答案"前是行首、空白或中文标点，避免误伤选项文字
// 分组1=前导字符(裁剪时保留),分组2=答案内容（支持多字母，如"答案：AB"）
// 拆分行内选项（家族C）："题干 A.xx B.yy C.zz" → { stem, options }
// 要求至少两个选项且从 A 开始连续编号，避免把题干中"A、B两类"这类文字误拆
export function splitInlineOptions(text) {
    // 分组1=前导字符(题干裁剪时保留),分组2=选项字母
    const re = /(^|[\s(（,，;；。？！：、…""''「」『』（）【】《》<>])\s*([A-Ha-h])\s*[.、:：．)）]\s*/g;
    const markers = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        markers.push({
            key: m[2].toUpperCase(),
            stemEnd: m.index + m[1].length,
            textStart: re.lastIndex,
        });
    }
    if (markers.length < 2 || markers[0].key !== 'A') return null;
    for (let i = 0; i < markers.length; i++) {
        if (markers[i].key !== String.fromCharCode(65 + i)) return null;
    }
    const options = {};
    markers.forEach((mk, i) => {
        const end = i + 1 < markers.length ? markers[i + 1].stemEnd : text.length;
        options[mk.key] = text.slice(mk.textStart, end).replace(/\s+/g, ' ').trim();
    });
    const stem = text.slice(0, markers[0].stemEnd).replace(/\s+/g, ' ').trim();
    return { stem, options };
}

// 题型/答案/选项的最终规范化（导入与预览提交时都会调用，幂等）
export function finalizeQuestion(q) {
    q.title = (q.title || '').trim();
    q.content = (q.content || '').trim();
    q.analysis = (q.analysis || '').trim();
    q.explanation = (q.explanation || '').trim();
    const rawAnswer = (q.answer || '').toUpperCase().replace(/\s+/g, '');

    const hint = (q.type || '').replace(/题$/, '');
    const isJudge = hint === '判断' || JUDGE_TRUE_RE.test(rawAnswer) || JUDGE_FALSE_RE.test(rawAnswer);

    if (isJudge) {
        q.type = '判断';
        const meaningful = Object.values(q.options).some(v => v && v.length > 2);
        if (!meaningful) {
            // 统一选项为 A正确 / B错误，保证刷题界面与判分一致
            q.options = { A: '正确', B: '错误' };
        }
        if (JUDGE_TRUE_RE.test(rawAnswer)) q.answer = 'A';
        else if (JUDGE_FALSE_RE.test(rawAnswer)) q.answer = 'B';
        else if (/^[AB]$/.test(rawAnswer)) q.answer = rawAnswer;
        else q.answer = '';
    } else {
        q.answer = rawAnswer.replace(/[^A-H]/g, '');
        q.type = q.answer.length > 1 ? '多选' : '单选';
    }

    // 置信度：预览时用于提示"需要人工看一眼"的题
    let conf = 1.0;
    const optCount = Object.keys(q.options).length;
    if (!q.answer) conf -= 0.5;
    if (optCount === 0) conf -= 0.4;
    else if (optCount < 2) conf -= 0.3;
    if (!q.analysis) conf -= 0.1;
    q.confidence = Math.max(0, Math.min(1, conf));
    q.raw = Array.isArray(q.raw) ? q.raw.join('\n') : (q.raw || '');

    if (!q.content) return null; // 没有题干的散行直接丢弃
    return q;
}

// 查重指纹：题干（去空白）+ 全部选项文本。同一题重新导入（即使改了答案）会被识别为重复；
// 题干相同但选项不同的题（如"下列说法正确的是()"）不会被误判
export function questionDedupKey(q) {
    const stem = (q.content || '').replace(/\s+/g, '');
    const opts = Object.keys(q.options || {}).sort()
        .map(k => k + ':' + (q.options[k] || '').replace(/\s+/g, ''))
        .join('');
    return stem + '|' + opts;
}

// 主解析器：逐行状态机，同时覆盖家族 A/B/C/D
export function parseQuestionsText(content) {
    const questions = [];
    const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
    let cur = null;

    const newQuestion = () => {
        cur = {
            title: '', content: '', explanation: '', options: {}, optionExplanations: {},
            answer: '', analysis: '', type: '', confidence: 1.0, raw: []
        };
    };
    const flush = () => {
        if (!cur) return;
        const q = finalizeQuestion(cur);
        if (q) questions.push(q);
        cur = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, '').trim();
        if (!line) continue;

        // 1. "# 标题" → 新题开始
        const titleM = line.match(TITLE_RE);
        if (titleM) {
            flush();
            newQuestion();
            cur.title = titleM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }

        // 2. 剥离行尾行内答案（家族C："…… 答案：B"）
        let body = line;
        let inlineAnswer = null;
        const ansM = body.match(INLINE_ANSWER_RE);
        if (ansM) {
            inlineAnswer = ansM[2];
            // 裁剪时保留前导字符（如"？"），避免题干丢失标点
            body = body.slice(0, ansM.index + ansM[1].length).trim();
        }

        // 3. 字段行（顺序重要：题目解释/解析 必须先于 题目/答案 判断）
        const explainM = body.match(EXPLAIN_RE);
        if (explainM) {
            if (!cur) newQuestion();
            cur.explanation = explainM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }
        const analysisM = body.match(ANALYSIS_RE);
        if (analysisM) {
            if (!cur) newQuestion();
            cur.analysis = analysisM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }
        const typeM = body.match(TYPE_RE);
        if (typeM) {
            if (!cur) newQuestion();
            cur.type = typeM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }
        const fieldM = body.match(QUESTION_FIELD_RE);
        if (fieldM) {
            if (cur && cur.content) flush(); // 家族A连续两题之间靠"题目："分隔
            if (!cur) newQuestion();
            cur.content = fieldM[1].trim();
            if (inlineAnswer) cur.answer = inlineAnswer;
            cur.raw.push(rawLine);
            continue;
        }

        // 3.5 整行答案
        const fullAnsM = body.match(FULL_ANSWER_RE) || body.match(FULL_ANSWER_SPACED_RE);
        if (fullAnsM) {
            if (!cur) newQuestion();
            cur.answer = fullAnsM[1].trim();
            cur.raw.push(rawLine);
            continue;
        }

        // 4. "1. 题干"编号行 → 新题（家族B/C）
        const numM = body.match(QUESTION_NUM_RE);
        if (numM) {
            const afterNum = numM[2].trim();
            const split = splitInlineOptions(afterNum);
            flush();
            newQuestion();
            cur.raw.push(rawLine);
            if (split) {
                cur.content = split.stem;   // 家族C：题干 + 行内选项
                cur.options = split.options;
            } else {
                cur.content = afterNum;     // 家族B：仅题干，选项在后续行
            }
            if (inlineAnswer) cur.answer = inlineAnswer;
            continue;
        }

        // 5. "判断题：xxx" 开头
        const judgeM = body.match(JUDGE_QUESTION_RE);
        if (judgeM) {
            flush();
            newQuestion();
            cur.raw.push(rawLine);
            cur.content = judgeM[1].trim();
            cur.type = '判断';
            if (inlineAnswer) cur.answer = inlineAnswer;
            continue;
        }

        // 6. 选项解释行（A解释：xxx）
        const opExM = body.match(OPTION_EXPLAIN_RE);
        if (opExM) {
            if (!cur) newQuestion();
            cur.optionExplanations[opExM[1].toUpperCase()] = opExM[2].trim();
            cur.raw.push(rawLine);
            continue;
        }

        // 7. 选项行（A. xxx / A：xxx / A、xxx）
        const opM = body.match(OPTION_LINE_RE);
        if (opM) {
            if (!cur) newQuestion();
            // 选项行内还跟着更多选项时（如"A. 21 B.80 C.443 D.22"），按行内选项拆分
            const lineSplit = splitInlineOptions(body);
            if (lineSplit && Object.keys(lineSplit.options).length > 1) {
                Object.assign(cur.options, lineSplit.options);
                if (!cur.content && lineSplit.stem) cur.content = lineSplit.stem;
            } else {
                cur.options[opM[1].toUpperCase()] = opM[2].trim();
            }
            if (inlineAnswer) cur.answer = inlineAnswer;
            cur.raw.push(rawLine);
            continue;
        }

        // 8. 整行就是答案（行内答案剥离后 body 为空）
        if (inlineAnswer) {
            if (!cur) newQuestion();
            cur.answer = inlineAnswer;
            cur.raw.push(rawLine);
            continue;
        }

        // 9. 其他 → 题干续行（多行题干）；续行里跟行内选项的也支持；没有当前题的散行丢弃
        if (cur) {
            const contSplit = splitInlineOptions(line);
            if (contSplit && Object.keys(contSplit.options).length > 1) {
                // 续行形如"其中正确的是 A. 21 B.80 C.443 D.22"
                Object.assign(cur.options, contSplit.options);
                if (contSplit.stem) {
                    cur.content = cur.content ? cur.content + '\n' + contSplit.stem : contSplit.stem;
                }
            } else if (cur.content) {
                cur.content += '\n' + line;
            } else if (!cur.answer && Object.keys(cur.options).length === 0) {
                cur.content = line;
            }
            cur.raw.push(rawLine);
        }
    }
    flush();
    return questions;
}

// 规范化选项答案：统一大写、只保留选项字母、去重并排序（用于判分比较，
// 避免"CA"vs"AC"、"A、B"vs"AB"这类写法差异导致误判）
export function normalizeAnswerString(answer) {
    return (answer || '')
        .toUpperCase()
        .replace(/[^A-H]/g, '')
        .split('')
        .filter((ch, idx, arr) => arr.indexOf(ch) === idx)
        .sort()
        .join('');
}

// 打乱数组
export function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// 格式化题目用于导出
export function formatQuestionsForExport(questions) {
    return questions.map(q => {
        let text = '';
        if (q.title) text += `# ${q.title}\n`;
        text += `题目：${q.content}\n`;

        Object.keys(q.options || {}).sort().forEach(key => {
            text += `${key}：${q.options[key]}\n`;
        });

        text += `答案：${q.answer}\n`;

        if (q.explanation) text += `题目解释：${q.explanation}\n`;
        if (q.analysis) text += `解析：${q.analysis}\n`;
        if (q.type) text += `类型：${q.type}\n`;

        Object.keys(q.optionExplanations || {}).sort().forEach(key => {
            text += `${key}解释：${q.optionExplanations[key]}\n`;
        });

        return text;
    }).join('\n');
}
