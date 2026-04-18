# DocSeeker 项目规范

## 功能变更同步规则

- **新增功能**：必须同步更新以下位置
  - `docs/PROGRESS.md` - 已完成功能列表
  - `docs/ROADMAP.md` - 里程碑状态
  - `src/pages/GuidePage.tsx` - 关于页功能描述（多语言 i18n）
  - `src/context/LanguageContext.tsx` - 如果涉及翻译文本

- **删除/暂缓功能**：必须从上述位置移除相关描述

- **规则**：代码和文档同步提交，不允许文档落后于代码

## 关于页（GuidePage）更新说明

关于页展示软件功能特性，包含多语言翻译：
- 中文：`guide.feature1` ~ `guide.feature7`
- 英文：对应的英文 key

功能变更时，需要同时更新 i18n 翻译文本。
