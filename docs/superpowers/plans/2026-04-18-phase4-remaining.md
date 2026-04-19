# Phase 4 剩余功能实施计划

> 维护人：lizhgb
> 更新日期：2026-04-19
> 状态：已完成

---

## 一、M4.1 缩略图预览

### 背景

当前 `FileList` 仅显示文件类型图标，搜索结果无法直观预览内容。本任务为图片和 PDF 文件生成缩略图，在结果列表 hover 和详情面板中展示。

### 架构设计

```
electron/main/
  thumbnail.ts         ← 缩略图生成服务（主进程）
  thumbnailCache.ts    ← 缩略图 LRU 缓存（内存 + 磁盘）
  pdfThumbnail.ts     ← PDF 缩略图 stub
```

**生成策略：**
- 图片（jpg/png/gif/bmp/webp）：Electron `nativeImage.resize()`，最大 200×200
- PDF：pdfjs-dist stub（Windows Electron 主进程暂不支持，返回 null）
- 缓存键：`SHA256(path + mtime)` → 避免重复生成
- 缓存存储：`AppData/Roaming/DocSeeker/thumbnails/{hash}.png`
- 缓存上限：磁盘 50MB，超出按访问时间淘汰

**IPC 接口：**
```
thumbnail-get   →  { path: string } → { dataUrl: string } | null
thumbnail-clear →  清理磁盘缓存
```

### 已完成任务

| 任务 | 说明 | 状态 |
|------|------|------|
| Task 1 | ThumbnailCache LRU 磁盘缓存 | ✅ 已完成 |
| Task 2 | 图片缩略图生成 + FileDetail 展示 | ✅ 已完成 |
| Task 3 | PDF 缩略图（pdfjs-dist stub） | ✅ 已完成（Windows stub） |

---

## 二、M4.4 跨平台评估（文档任务）

### 已完成任务

| 任务 | 说明 | 状态 |
|------|------|------|
| Task 4 | 跨平台评估报告 | ✅ 已完成 |

评估结论：
- macOS：完全可行，建议优先（预估 3 个月）
- Linux：完全可行，优先级低（预估 4-6 个月）
- CHM：不可行（Windows 特有格式）

---

## 三、M4.6 去重功能 UI 集成

### 已完成任务

| 任务 | 说明 | 状态 |
|------|------|------|
| Task 5 | 去重后端 + SearchPage UI toggle | ✅ 已完成 |

去重策略：
- 按文件 `hash` 分组，无 hash 按 `path` 分组
- 保留 `updated_at` 最新的条目
- SearchPage 工具栏新增 🔗 去重按钮

---

## 四、提交记录

```
feat(thumbnailCache): 实现 ThumbnailCache LRU 磁盘缓存
feat(thumbnail): 新增图片缩略图生成模块
feat(ipc): 注册 thumbnail-get IPC handler
feat(preload): 暴露 thumbnailGet API 到渲染进程
feat(ui): FileDetail 组件新增图片缩略图展示
fix(thumbnail): 修正缓存写入键值一致性
fix(thumbnailCache): 修复淘汰测试数据量与 jest 版本
refactor(thumbnailCache): 清理代码质量
feat(thumbnail): 添加 pdfjs-dist stub
docs: 添加跨平台评估报告
feat(dedup): 添加去重功能与 SearchPage toggle
```

---

## 五、验收标准

- [x] M4.1: 图片文件在 FileDetail 中显示缩略图，缓存命中不再重新生成
- [x] M4.4: `docs/CROSSPLATFORM.md` 包含 macOS/Linux 可行性评估
- [x] M4.6: SearchPage 工具栏显示去重按钮，勾选后搜索结果按 hash 过滤
