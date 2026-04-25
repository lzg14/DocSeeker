# DocSeeker 文档索引

## 快速导航

| 文档 | 说明 |
|------|------|
| [ROADMAP.md](../ROADMAP.md) | 开发路线图，包含四个阶段的里程碑规划 |
| [PROGRESS.md](../PROGRESS.md) | 当前开发进度记录，包含已完成功能和待完善项 |
| [plans/integration-plan.md](./plans/integration-plan.md) | 当前进行中的整合规划 |

## 目录结构

```
docs/
├── README.md                         # 本文档 - 文档索引
├── ROADMAP.md                       # 开发路线图
├── PROGRESS.md                      # 进度记录
└── superpowers/
    ├── plans/                       # 实施计划
    │   ├── master-plan.md                  # 数据库架构重构主计划
    │   ├── robustness-improvement.md        # 健壮性改进方案
    │   ├── integration-plan.md              # 功能整合规划
    │   ├── 2026-04-12-ui-redesign.md       # UI 重设计
    │   ├── 2026-04-15-multi-theme.md       # 多主题系统
    │   └── ...其他计划文档
    └── archive/                     # 已归档（废弃或已完成）
        ├── 2026-04-16-auto-update.md       # 自动更新（已移除）
        ├── 2026-04-18-startup-tray.md            # 窗口行为优化（已实现）
        ├── 2026-04-18-phase3-realtime-preview.md  # 实时预览（暂缓）
        └── COMPETITION.md                        # 竞品分析报告（旧版）
```

## 规划状态

### 进行中
- [integration-plan.md](./plans/integration-plan.md) - 功能整合规划

### 已完成
- master-plan.md - 数据库分片架构重构
- robustness-improvement.md - 扫描健壮性改进
- 2026-04-12-ui-redesign.md - UI 样式升级
- 2026-04-15-multi-theme.md - 多主题系统

### 已归档（功能已实现或暂缓）
- startup-tray.md - 窗口行为优化（功能已实现在 LanguagePage）
- phase3-realtime-preview.md - 实时监控+多格式预览（暂缓）
- COMPETITION.md - 竞品分析
