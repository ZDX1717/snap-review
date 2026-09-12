#!/usr/bin/env bash
# probe.sh —— 唯一允许启动 headless 浏览器的入口(2026-09-11:服务器曾因反复启动 chromium 爆内存)
#
# 为什么需要它:这台机器总内存只有 2GB,DSH 自身就占约 770MB。
# 一个 headless chromium 约 150~300MB,而"起了忘关/关了没杀干净"会迅速堆到几个 GB ——
# 实测把整台服务器打爆过一次。因此浏览器探针必须:
#   ① 带**内存上限**(--js-flags 限 V8 堆 + ulimit 限进程),最坏情况也只是探针自己死;
#   ② **无论怎么退出都清理**(trap EXIT/INT/TERM),不留孤儿渲染进程;
#   ③ **一次一个**,不并行、不复用常驻实例。
#
# 用法:bash scripts/probe.sh <脚本.mjs> [参数...]
#   脚本通过 argv[2] 收到 CDP 的 webSocketDebuggerUrl(与之前手工起浏览器时一致)。
set -euo pipefail
cd "$(dirname "$0")/.."

SCRIPT="${1:?用法: bash scripts/probe.sh <脚本.mjs> [参数...]}"
shift || true
PORT="${PROBE_PORT:-9334}"
SRV_PORT="${PROBE_SRV_PORT:-8934}"
PROFILE="$(mktemp -d /tmp/zquiz-probe-XXXXXX)"
PIDFILE="$PROFILE/chrome.pid"
SRVFILE="$PROFILE/srv.pid"
# V8 堆上限:256MB 足够跑我们这个页面;OS 层再兜一道
CHROME_MEM_MB="${PROBE_CHROME_MEM_MB:-512}"
NODE_MEM_MB="${PROBE_NODE_MEM_MB:-256}"

cleanup() {
    local rc=$?
    # 先杀浏览器(连带其渲染子进程),再关静态服务器,最后删临时 profile
    if [ -f "$PIDFILE" ]; then
        kill -TERM "$(cat "$PIDFILE")" 2>/dev/null || true
        sleep 0.4
        kill -KILL "$(cat "$PIDFILE")" 2>/dev/null || true
    fi
    if [ -f "$SRVFILE" ]; then
        kill -TERM "$(cat "$SRVFILE")" 2>/dev/null || true
    fi
    # 兜底:按 profile 目录精确匹配残留进程(不误伤别人的 chromium)
    pkill -KILL -f "$PROFILE" 2>/dev/null || true
    pkill -KILL -f "systemd-run.*$PROFILE" 2>/dev/null || true
    rm -rf "$PROFILE"
    printf '\n[probe] 已清理(退出码 %s);浏览器与静态服务均已关闭\n' "$rc"
}
trap cleanup EXIT INT TERM

# 静态服务器(file:// 会被 CORS 拦掉 ES modules)
( exec python3 -m http.server "$SRV_PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) &
echo $! > "$SRVFILE"
sleep 1

# 起浏览器:限内存、限堆、不用 GPU、单进程 profile
CHROME_ARGS=(chromium --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage
    --remote-debugging-port="$PORT" --user-data-dir="$PROFILE"
    --js-flags="--max-old-space-size=256"
    --disable-extensions --disable-background-networking --disable-sync
    --renderer-process-limit=1 --no-first-run --no-default-browser-check
    about:blank)
# ⚠️ `--js-flags=--max-old-space-size` 只管 V8 堆,**不限制进程总内存** ——
#    实测峰值仍会到 ~990MB(渲染进程各自有堆)。要真正兜住,必须用 cgroup 限物理内存。
#    有 systemd-run 就用它给一个 cgroup(超了直接被内核杀,最坏也只是探针自己死);
#    没有则退回 ulimit -v(限的是虚拟地址空间,数值要给宽些,否则 chromium 起不来)。
if command -v systemd-run >/dev/null 2>&1; then
    setsid systemd-run --scope --quiet \
        -p MemoryMax="${CHROME_MEM_MB}M" -p MemorySwapMax=128M \
        "${CHROME_ARGS[@]}" >"$PROFILE/chrome.log" 2>&1 &
else
    ( ulimit -v $((CHROME_MEM_MB * 3 * 1024)); exec "${CHROME_ARGS[@]}" >"$PROFILE/chrome.log" 2>&1 ) &
fi
CHROME_PID=$!
echo $CHROME_PID > "$PIDFILE"

# 等 CDP 就绪(最多 15s),顺便把内存上限打到进程组上
for i in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:$PORT/json/version" -o "$PROFILE/cdp.json" 2>/dev/null; then
        WS=$(sed -n 's/.*"webSocketDebuggerUrl"\s*:\s*"\([^"]*\)".*/\1/p' "$PROFILE/cdp.json")
        [ -n "$WS" ] && break
    fi
    sleep 0.5
done
if [ -z "${WS:-}" ]; then
    echo "[probe] CDP 未就绪;最后响应: $(head -c 200 "$PROFILE/cdp.json" 2>/dev/null || echo '(无)')"
fi
if [ -z "${WS:-}" ]; then
    echo "[probe] 浏览器没起来(端口 $PORT);启动日志尾:"
    tail -5 "$PROFILE/chrome.log" 2>/dev/null || echo '(无日志)'
    exit 1
fi
# 取一个可用的 page target
TARGET=$(curl -sf "http://127.0.0.1:$PORT/json/new?about:blank" -o "$PROFILE/t.json" 2>/dev/null && sed -n 's/.*"webSocketDebuggerUrl"\s*:\s*"\([^"]*\)".*/\1/p' "$PROFILE/t.json" || true)
if [ -z "${TARGET:-}" ]; then
    curl -sf "http://127.0.0.1:$PORT/json/list" -o "$PROFILE/l.json" 2>/dev/null || true
    TARGET=$(sed -n 's/.*"webSocketDebuggerUrl"\s*:\s*"\([^"]*\)".*/\1/p' "$PROFILE/l.json" | head -1)
fi
echo "[probe] 浏览器就绪(限 ${CHROME_MEM_MB}MB / V8 堆 256MB),静态服务 127.0.0.1:$SRV_PORT"

# 跑探针脚本;Node 侧也限内存,避免脚本自己吃爆
NODE_OPTIONS="--max-old-space-size=$NODE_MEM_MB" node "$SCRIPT" "$TARGET" "$@"
