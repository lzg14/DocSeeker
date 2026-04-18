# Changelog

## [Unreleased]

## [0.1.0] - 2026-04-18

### refactor

- 删除迁移模块（`migration.ts`），迁移功能不再需要
- 将 `meta.ts` 重命名为 `config.ts`，统一管理所有应用配置
- 简化 `initDatabase()`，移除迁移逻辑

### docs

- `README.md` 添加数据库架构、技术栈、提交规范等开发指南
- `ROADMAP.md` 更新冷启动优化状态（分片架构已完成）
- `master-plan.md` 删除迁移相关章节，更新模块清单
