# 列表虚拟化优化技术方案

## 1. 背景与目标

### 1.1 问题描述

当前 `FileList.tsx` 使用 `files.map()` 一次性渲染所有文件，当搜索结果达到数千甚至上万条时：

- **DOM 节点爆炸** — 10000 条结果 = ~100000+ DOM 节点
- **渲染卡顿** — 首次渲染可能需要 1-3 秒
- **滚动卡顿** — 滚动时浏览器需要计算大量不可见元素
- **内存占用高** — 大量 DOM 节点占用内存

### 1.2 优化目标

| 指标 | 优化前 | 优化后目标 |
|------|--------|-----------|
| 渲染 10000 条 | 2-3s | <100ms |
| 滚动帧率 | 10-20fps | 60fps |
| DOM 节点数 | ~100000 | ~50-100 (可见区域) |
| 内存占用 | 高 | 降低 50%+ |

## 2. 技术方案

### 2.1 选型

推荐使用 **`@tanstack/react-virtual`**（原 react-virtual），原因：

| 方案 | 优点 | 缺点 |
|------|------|------|
| @tanstack/react-virtual | 轻量(4KB)、API 简洁、TS 支持好 | 需手动管理容器 |
| react-window | 成熟稳定 | API 较旧 |
| react-virtualized | 功能全 | 包体积大(10KB+) |

**安装**：
```bash
npm install @tanstack/react-virtual
```

### 2.2 核心实现

#### 2.2.1 基础虚拟列表

```tsx
// FileList.tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function FileList({ files, ... }): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56, // 预估每行高度
    overscan: 10, // 预渲染上下 10 行，减少白屏
  })

  return (
    <div ref={parentRef} className="file-list-container" style={{ overflow: 'auto', height: '100%' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const file = files[virtualRow.index]
          return (
            <div
              key={file.id}
              style={{
                position: 'absolute',
                top: virtualRow.start,
                width: '100%',
              }}
            >
              {/* 原有行内容 */}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

#### 2.2.2 固定行高优化

由于每行高度固定(56px)，可以使用 `、固定行高` 模式获得更好性能：

```tsx
const rowHeight = 56

const virtualizer = useVirtualizer({
  count: files.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => rowHeight,
  overscan: 10,
})
```

### 3. 需要保留的功能

| 功能 | 实现位置 | 注意事项 |
|------|----------|----------|
| 单文件选中 | `selectedFile` + `onSelectFile` | 虚拟列表中正常运作 |
| 多选（复选框） | `selectedFiles` + `onToggleSelect` | 需确保虚拟行内 checkbox 可点击 |
| 全选 | `onSelectAll` | 虚拟列表中正常运作 |
| 右键菜单 | `onContextMenu` | 虚拟列表中正常运作 |
| 文件高亮 | `highlightName` | 虚拟列表中正常运作 |
| 摘要显示 | `snippets` | 虚拟列表中正常运作 |
| 空状态 | `hasSearched` + `files.length === 0` | 需在虚拟列表外处理 |
| 表头 | 表头固定，内容虚拟滚动 | 需分两层 |

## 4. 详细实现

### 4.1 目录结构

```
src/components/
├── FileList.tsx          # 虚拟列表主组件
├── FileListHeader.tsx    # 固定表头
└── FileListRow.tsx       # 行组件（可选拆分）
```

### 4.2 FileList.tsx 重构

```tsx
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FileRecord } from '../types'

const ROW_HEIGHT = 56

interface FileListProps {
  files: FileRecord[]
  selectedFile: FileRecord | null
  onSelectFile: (file: FileRecord) => void
  formatSize: (bytes: number) => string
  hasSearched: boolean
  snippets?: Record<string, string>
  searchQuery?: string
  selectedFiles?: Set<number>
  onToggleSelect?: (fileId: number) => void
  onSelectAll?: (select: boolean) => void
}

export default function FileList({
  files,
  selectedFile,
  onSelectFile,
  formatSize,
  hasSearched,
  snippets = {},
  searchQuery = '',
  selectedFiles,
  onToggleSelect,
  onSelectAll,
}: FileListProps): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)

  // 虚拟列表
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15, // 预渲染更多行
  })

  // 空状态
  if (!hasSearched) {
    return <div className="file-list-empty">...</div>
  }
  if (files.length === 0) {
    return <div className="file-list-empty">...</div>
  }

  return (
    <div className="file-list-wrapper">
      {/* 表头 */}
      <div className="file-table-header">
        {selectedFiles && onToggleSelect && onSelectAll && (
          <div style={{ width: 40 }}>
            <input
              type="checkbox"
              checked={selectedFiles.size === files.length}
              onChange={(e) => onSelectAll(e.target.checked)}
            />
          </div>
        )}
        <div className="file-name-header">名称</div>
        <div>类型</div>
        <div>大小</div>
        <div>修改时间</div>
      </div>

      {/* 虚拟滚动区域 */}
      <div
        ref={parentRef}
        className="file-list-container"
        style={{ overflow: 'auto', height: 'calc(100% - 40px)' }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const file = files[virtualRow.index]
            const isSelected = selectedFile?.id === file.id
            const isChecked = selectedFiles?.has(file.id ?? -1) ?? false

            return (
              <div
                key={file.id}
                className={`file-row ${isSelected ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: virtualRow.start,
                  width: '100%',
                  height: ROW_HEIGHT,
                }}
                onClick={() => onSelectFile(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
              >
                {selectedFiles && onToggleSelect && (
                  <div
                    style={{ width: 40 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleSelect(file.id!)
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect(file.id!)}
                    />
                  </div>
                )}
                {/* ... 其余单元格 */}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

### 4.3 样式调整

```css
.file-list-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.file-list-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 确保虚拟列表容器有明确高度 */
.file-list-wrapper {
  contain: strict;
}
```

## 5. 高级优化

### 5.1 搜索结果限制

防止一次返回过多结果：

```typescript
// search.ts 或 shardManager.ts
const MAX_SEARCH_RESULTS = 2000

export async function searchFiles(query: string): Promise<FileRecord[]> {
  const results = await performFtsSearch(query)
  return results.slice(0, MAX_SEARCH_RESULTS)
}
```

### 5.2 React.memo 优化

对行组件进行 memo 化：

```tsx
const FileRow = React.memo(({ file, ... }) => {
  // 行内容
}, (prev, next) => {
  // 自定义比较逻辑
  return prev.file.id === next.file.id &&
         prev.file.name === next.file.name &&
         prev.selected === next.selected
})
```

### 5.3 滚动位置保持

搜索结果变化时保持滚动位置：

```tsx
const scrollPositionRef = useRef(0)

useEffect(() => {
  // 搜索结果变化时恢复位置
  if (parentRef.current && scrollPositionRef.current > 0) {
    parentRef.current.scrollTop = scrollPositionRef.current
  }
}, [files])

const handleScroll = () => {
  if (parentRef.current) {
    scrollPositionRef.current = parentRef.current.scrollTop
  }
}
```

## 6. 风险与注意事项

### 6.1 右键菜单定位

虚拟列表中右键菜单定位可能需要调整：

```tsx
const handleContextMenu = (e: React.MouseEvent, file: FileRecord) => {
  e.preventDefault()

  // 计算菜单位置（考虑滚动偏移）
  const rect = e.currentTarget.getBoundingClientRect()
  const scrollTop = parentRef.current?.scrollTop ?? 0

  setContextMenu({
    visible: true,
    x: e.clientX,
    y: rect.top + scrollTop, // 调整为列表容器内的坐标
    file,
  })
}
```

### 6.2 滚动条问题

虚拟列表滚动条需要特殊处理：

```css
/* 确保滚动条不会因为动态高度计算闪烁 */
.file-list-container {
  contain: strict;
}
```

### 6.3 性能测试

建议在完成后进行性能测试：

```javascript
// 控制台执行
console.time('render')
// 执行搜索
console.timeEnd('render')

// 监控帧率
performance.measure('frame', 'frame')
```

## 7. 实施计划

| 阶段 | 任务 | 工作量 |
|------|------|--------|
| 1 | 安装 @tanstack/react-virtual | 5min |
| 2 | 重构 FileList 实现基础虚拟列表 | 2h |
| 3 | 保留所有交互功能（选中、右键、多选） | 1h |
| 4 | 样式调整与测试 | 1h |
| 5 | 性能验证（10000 条数据） | 30min |
| 6 | 滚动位置保持等细节优化 | 30min |

**总工期**：约 5-6 小时

## 8. 替代方案（不改代码）

如果暂时不想重构代码，可以尝试：

| 方案 | 说明 |
|------|------|
| 搜索结果分页 | 在 SearchPage 限制返回数量 |
| CSS contain | 添加 `contain: strict` 减少重排 |

```css
.file-list-container > div {
  contain: strict;
}
```

---

## 附录：参考资源

- [@tanstack/react-virtual 文档](https://tanstack.com/virtual/latest/docs/framework/react/examples/list)
- [MDN: CSS contain](https://developer.mozilla.org/en-US/docs/Web/CSS/contain)
