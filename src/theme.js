// ==================== 主题(暗色模式) ====================
// 职责:读设置 → 给 <html> 打 data-theme → 变量层自动换肤。
// 允许依赖:storage。禁止:parser/state。
import { loadThemeSetting, saveThemeSetting } from './storage.js';

function systemDark() {
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

// 应用当前设置到 <html data-theme>;auto 档跟随系统
export function applyTheme() {
    if (typeof document === 'undefined' || !document.documentElement) return;  // vm 沙箱无 documentElement
    const pref = loadThemeSetting();
    const theme = pref === 'auto' ? (systemDark() ? 'dark' : 'light') : pref;
    document.documentElement.dataset.theme = theme;
    // 手机状态栏颜色跟随
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#121417' : '#f5f7fa');
    // 同步三档开关高亮
    if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('.theme-opt').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeOpt === pref);
        });
    }
}

// 用户切换设置(自动/亮/暗),立即生效并持久化
export function setThemeSetting(pref) {
    saveThemeSetting(pref);
    applyTheme();
}

// 初始化:应用 + 监听系统切换(auto 档实时跟随)
export function initTheme() {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').addEventListener) {
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
    }
    applyTheme();
}
