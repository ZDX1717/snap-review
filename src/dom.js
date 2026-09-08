import { state } from './state.js';

// ==================== dom.js ====================
// 自动拆分自 main.js;依赖方向见各 import。


const createBankModal = document.getElementById('create-bank-modal');
const renameBankModal = document.getElementById('rename-bank-modal');
const newBankNameInput = document.getElementById('new-bank-name');
const renameBankNameInput = document.getElementById('rename-bank-name');

// 显示模态框
export function showModal(modal) {
    modal.classList.remove('hidden');
}


// 隐藏模态框
export function hideModal(modal) {
    modal.classList.add('hidden');
    if (modal === createBankModal) {
        newBankNameInput.value = '';
    } else if (modal === renameBankModal) {
        renameBankNameInput.value = '';
        state.currentRenameBank = null;
    }
}


// 下载文件
export function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
