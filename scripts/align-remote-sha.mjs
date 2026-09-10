#!/usr/bin/env node
// align-remote-sha.mjs —— 把本地待推提交对齐成"GitHub 存储后的 SHA"
//
// 背景:GitHub 在存储提交时会剥掉消息尾部的换行。尾换行是 commit 对象的一部分,
// 所以 API 造出来的远端 SHA 永远不等于本地 SHA。若想让 git 侧也"零分叉"
// (git status / 分支比较不再显示差异),就在 push 后用本脚本按远端规则重写本地提交。
//
// 用法:node scripts/align-remote-sha.mjs <锚点sha> <远端HEAD sha>
//   锚点 = 推送前远端所在的提交(第一个待对齐提交的父提交)
//   远端HEAD = 推送后远端 main 的 sha(用 gh api 取)
// 效果:重写 [锚点..HEAD] 的本地提交(仅去掉消息尾换行),把分支指到与远端一致的 SHA。
// 内容(tree/作者/时间/消息正文)完全不变;随后 git status 应显示干净。
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [anchor, remoteHead] = process.argv.slice(2);
if (!anchor || !remoteHead) {
    console.error('用法: node scripts/align-remote-sha.mjs <锚点sha> <远端HEAD sha>');
    process.exit(1);
}
const out = (c) => execSync(c, { encoding: 'utf8' }).trim();

const commits = out(`git rev-list --reverse ${anchor}..HEAD`).split('\n').filter(Boolean);
if (commits.length === 0) { console.log('无可对齐提交'); process.exit(0); }

let parent = anchor;
for (const c of commits) {
    // 必须读对象原文:git show --format=%B 会额外补一个 pretty-printer 换行
    const obj = execSync(`git cat-file commit ${c}`, { encoding: 'latin1' });
    const i = obj.indexOf('\n\n');
    const header = obj.slice(0, i).replace(/^parent .*$/m, `parent ${parent}`);
    const msg = obj.slice(i + 2).replace(/\n+$/, '');   // GitHub 的剥离规则
    writeFileSync('/tmp/__align_obj', Buffer.from(header + '\n\n' + msg, 'latin1'));
    parent = out('git hash-object -t commit -w /tmp/__align_obj');
    console.log(`  ${c.slice(0, 7)} -> ${parent.slice(0, 7)}`);
}

if (parent !== remoteHead) {
    console.error(`\nFAIL 对齐结果 ${parent} != 远端 ${remoteHead},未改动分支;请人工核对`);
    process.exit(2);
}
execSync(`git update-ref refs/heads/main ${parent}`);
console.log(`\nOK: 本地已对齐到远端 ${parent.slice(0, 7)}(零分叉)`);
