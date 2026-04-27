# Changelog

## [Unreleased]

### feat

- **文献引用卡片**：新增从文档中提取关键词引用的功能。点击文件后可提取包含关键词的引用（前后至少2个完整句子，各100字以上），支持复制全部、导出为 MD/TXT 格式。支持 PDF、Word、Excel、PPT、TXT、MD 等77种文档格式。

### fix

- 修复文献引用提取功能在关键词靠近文档开头或结尾时返回0条结果的问题

## [0.1.0] - 2026-04-18

### refactor

- 删除迁移模块（`migration.ts`），迁移功能不再需要
- 将 `meta.ts` 重命名为 `config.ts`，统一管理所有应用配置
- 简化 `initDatabase()`，移除迁移逻辑

### docs

- `README.md` 添加数据库架构、技术栈、提交规范等开发指南
- `ROADMAP.md` 更新冷启动优化状态（分片架构已完成）
- `master-plan.md` 删除迁移相关章节，更新模块清单
