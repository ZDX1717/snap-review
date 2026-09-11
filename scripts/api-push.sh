#!/usr/bin/env bash
# api-push.sh —— 443 阻断时的 Git Data API 推送管道(绕开 github.com,走 api.github.com)
# 用法:bash scripts/api-push.sh   (在本地 commit 之后、push 超时/失败时执行)
# 前提:gh CLI 已认证;远端 main == 本地 HEAD~1(干净 fast-forward);不支持 merge 冲突场景
# 细节:SOP 与字节对齐经验见 docs(复盘报告);经验:①对象时区按 %aI/%cI 原样保留(勿转 UTC)
#       ②消息无尾换行($() 自带剥离)③重建对象一律从 API/git 取值,禁止手打哈希
set -euo pipefail
REPO=ZDX1717/zquiz
cd "$(dirname "$0")/.."

REMOTE=$(gh api "repos/$REPO/git/refs/heads/main" --jq '.object.sha')
LOCAL=$(git rev-parse HEAD)
PARENT=$(git rev-parse HEAD~1)
if [ "$REMOTE" != "$PARENT" ]; then
    echo "远端 main($REMOTE) 不是本地父提交($PARENT),先人工核对"; exit 1;
fi
BASE_TREE=$(git rev-parse HEAD~1^{tree})
LOCAL_TREE=$(git rev-parse HEAD^{tree})
DATE_A=$(git show -s --format=%aI HEAD)   # author ISO(含原时区;amend 后与 committer 可能不同)
DATE_C=$(git show -s --format=%cI HEAD)   # committer ISO
EP_A=$(git show -s --format=%at HEAD)     # author epoch(对齐重建用)
EP_C=$(git show -s --format=%ct HEAD)     # committer epoch
OFF_A=$(echo "$DATE_A" | grep -oE '[+-][0-9]{2}:?[0-9]{2}$' | tr -d ':')
OFF_C=$(echo "$DATE_C" | grep -oE '[+-][0-9]{2}:?[0-9]{2}$' | tr -d ':')
AN=$(git show -s --format=%an HEAD)
AE=$(git show -s --format=%ae HEAD)
MSG=$(git show -s --format=%B HEAD)       # 命令替换自动去尾换行,与 GitHub 存储行为一致

mapfile -t FILES < <(git diff --name-only HEAD~1 HEAD)

echo "[1/4] POST blobs(${#FILES[@]} 个)"
ENTRIES=""
first=1
for f in "${FILES[@]}"; do
    # 大文件必须走 --input:见 api-push-multi.sh 里的同款说明(Linux 单参数上限 128KB)
    b=$(base64 -w0 "$f" | jq -Rs '{content: ., encoding: "base64"}' \
        | gh api "repos/$REPO/git/blobs" --input - --jq '.sha')
    l=$(git hash-object "$f")
    echo "  $f $b"
    [ "$b" = "$l" ] || { echo "FAIL blob $f"; exit 1; }
    [ $first -eq 1 ] && first=0 || ENTRIES+=","
    # mode 取真实值(可执行脚本是 100755,硬写 644 会让 tree 对不上) —— 见 api-push-multi.sh 里的同款说明
    m=$(git ls-tree HEAD -- "$f" | awk '{print $1}')
    ENTRIES+=$(jq -n --arg path "$f" --arg sha "$b" --arg mode "$m" '{path:$path, mode:$mode, type:"blob", sha:$sha}')
done

echo "[2/4] POST tree"
TREE_JSON=$(jq -n --arg bt "$BASE_TREE" --argjson arr "[$ENTRIES]" '{base_tree:$bt, tree:$arr}')
TREE_API=$(echo "$TREE_JSON" | gh api "repos/$REPO/git/trees" --input - --jq '.sha')
echo "  api=$TREE_API local=$LOCAL_TREE"
[ "$TREE_API" = "$LOCAL_TREE" ] || { echo "FAIL: tree mismatch"; exit 1; }

echo "[3/4] POST commit (author=$DATE_A committer=$DATE_C, msg 无尾换行)"
BODY=$(jq -n --arg t "$TREE_API" --arg p "$PARENT" --arg m "$MSG" \
    --arg da "$DATE_A" --arg dc "$DATE_C" --arg an "$AN" --arg ae "$AE" \
    '{tree:$t, parents:[$p], message:$m,
      author:{name:$an, email:$ae, date:$da},
      committer:{name:$an, email:$ae, date:$dc}}')
COMMIT_API=$(echo "$BODY" | gh api "repos/$REPO/git/commits" --input - --jq '.sha')
echo "  api=$COMMIT_API local=$LOCAL"

echo "[4/4] PATCH refs/heads/main"
gh api -X PATCH "repos/$REPO/git/refs/heads/main" -f sha="$COMMIT_API" --jq '.object.sha'

if [ "$COMMIT_API" = "$LOCAL" ]; then
    echo "OK: 远端与本地 SHA 一致,零分叉"
else
    echo "  sha 不一致 → 自动对齐:按远端对象字节重建本地提交(常见差因:消息尾换行/时区)"
    printf 'tree %s\nparent %s\nauthor %s <%s> %s %s\ncommitter %s <%s> %s %s\n\n%s' \
        "$TREE_API" "$PARENT" "$AN" "$AE" "$EP_A" "$OFF_A" "$AN" "$AE" "$EP_C" "$OFF_C" "$MSG" > /tmp/__align_c
    NEW=$(git hash-object -t commit /tmp/__align_c -w)
    if [ "$NEW" = "$COMMIT_API" ]; then
        git reset --hard "$NEW"
        echo "  已对齐本地 → $NEW(零分叉)"
    else
        echo "  自动对齐失败,请人工排查(检查时区/消息尾换行/epoch)"; exit 3
    fi
fi
