// ==================== 共享状态(全站唯一可变数据容器) ====================
// 职责:集中存放跨模块数据。允许依赖:无。禁止:任何逻辑与 DOM。
// 注意:ESM 导出为只读绑定,因此暴露 const 对象、只改属性不改绑定。

export const state = {
    // 题库
    questionBanks: {},
    questionBank: [],
    currentBankName: '默认题库',
    isAllBanksView: false,
    // 错题本
    errorQuestions: [],
    expandedBanks: {},
    masteryThreshold: 2,
    // 收藏夹
    favoriteQuestions: [],
    // 刷题会话
    currentQuiz: [],
    currentQuestionIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    isAnswered: false,
    quizMode: 'immediate',
    userAnswers: [],
    masteryRemovedInSession: 0,
    autoNext: false,          // 自动下一题(默认关闭,存本机)
    // 导入预览
    previewData: [],
    previewFilterWarned: false,
    // 题库编辑器
    editBankName: null,
    editIndex: 0,
    editorDirty: false,
    editorPendingOnly: false,
    currentRenameBank: null,
};
