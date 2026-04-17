# 文档扫描功能健壮性改造方案

## 问题总结

### 1. 根本原因
| 问题 | 根因 | 影响 |
|------|------|------|
| PPTX/XLSX/ZIP 解析卡住 | 第三方库同步操作无法被中断 | 扫描永久挂起 |
| ZIP 内 Office 文件损坏 | 微信等工具传输时截断文件 | xlsx/jszip 库卡住 |
| 问题定位困难 | 缺乏详细日志 | 无法快速定位 |

### 2. 当前状态
- ✅ 已完成：统一超时保护（15秒）
- ✅ 已完成：文件大小检测和限制（>100MB 跳过）
- ✅ 已完成：ZIP 头部快速损坏检测
- ✅ 已完成：详细日志（[EXTRACT]/[WARN]/[ERROR] 分级）
- ✅ 已完成：ZIP 内 Office 文件跳过处理（微信传输易损坏）
- ✅ 已完成：快速搜索默认打开文件夹

---

## 改造方案

### Phase 1: 基础保护层（必须）

#### 1.1 统一超时保护工具
```typescript
// 工具函数
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ])
}
```

#### 1.2 文件大小限制
| 文件类型 | 最大处理大小 | 超过处理方式 |
|----------|-------------|-------------|
| 独立文件 | 100MB | 跳过内容提取，只记录元数据 |
| ZIP 内文件 | 50MB | 跳过 Office 文件，只提取文本文件 |
| PDF | 50MB | 跳过 |

#### 1.3 损坏文件快速检测
```
PPTX/XLSX/ODF 文件 → 检测 ZIP 头部 (504b0304)
  ├─ 有效 → 继续处理
  └─ 无效/损坏 → 跳过，记录警告日志
```

#### 1.4 ZIP 内跳过 Office 文件
- **原因**：微信等工具传输时，ZIP 内 Office 文件经常损坏
- **处理**：跳过 .docx/.xlsx/.pptx/.odt/.ods/.odp
- **保留**：.txt/.md/.json/.xml/.csv/.eml/.mbox（纯文本格式）

---

### Phase 2: 日志与监控

#### 2.1 日志分级
```
[SCAN]     - 扫描进度（每个文件）
[EXTRACT]  - 内容提取开始/结束
[WARN]     - 警告（跳过文件、损坏等）
[ERROR]    - 错误（异常情况）
[TIMEOUT]  - 超时（已触发的超时）
```

#### 2.2 日志内容规范
```typescript
// 格式：[标签] 操作 - 详情 - 耗时
[WARN]  [ZIP]   Skip corrupted Office file: xxx.xlsx
[WARN]  [SCAN]  Skip large file (>100MB): xxx.pdf
[INFO]  [SCAN]  Processing: /path/to/file.xlsx
[INFO]  [EXTRACT] Done: /path/to/file.xlsx - 1250ms
```

---

### Phase 3: 错误处理策略

#### 3.1 错误恢复机制
```
文件处理失败
  ├─ 超时 → 跳过，记录日志
  ├─ 损坏 → 跳过，记录日志
  ├─ 无权限 → 跳过，记录日志
  └─ 未知错误 → 跳过，记录日志，继续下一个
```

#### 3.2 永不阻塞原则
- 所有文件操作必须有超时
- Worker 线程必须能响应主线程消息
- UI 必须保持可交互

---

### Phase 4: 性能优化

#### 4.1 批量处理
- 每 50 个文件发送一次批次到主线程
- 使用 `setImmediate` 让出控制权

#### 4.2 流式处理（可选优化）
- 大文件使用流式读取
- 避免一次性加载到内存

---

## 实现清单

### 优先级 P0（必须）
- [x] 统一超时保护工具
- [x] ZIP 内 Office 文件跳过
- [x] 文件大小检测和限制
- [x] ZIP 头部快速损坏检测
- [x] 日志分级和格式化

### 实现细节

#### 常量定义
```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024  // 100MB
const MAX_ZIP_INTERNAL_SIZE = 50 * 1024 * 1024  // 50MB
const TIMEOUT_MS = 15000  // 统一 15 秒超时
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])  // "PK\x03\x04"
```

#### 工具函数
```typescript
// 检测 ZIP 头部
function isValidZip(buffer: Buffer): boolean

// 格式化文件大小
function formatSize(bytes: number): string

// 统一超时保护
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>
```

#### 各提取函数保护
| 函数 | 大小检查 | ZIP 头部检测 | 超时 |
|------|---------|-------------|------|
| extractTextFromDocx | ✅ | - | ✅ |
| extractTextFromXlsx | ✅ | ✅ | ✅ |
| extractTextFromPptx | ✅ | ✅ | ✅ |
| extractTextFromPdf | ✅ | - | ✅ |
| extractTextFromOdf | ✅ | ✅ | ✅ |
| extractTextFromChm | ✅ | ✅ | ✅ |
| extractTextFromEpub | ✅ | ✅ | ✅ |
| extractTextFromZip | - | ✅ | ✅ |

### 优先级 P1（重要）
- [ ] 进度报告细化（预估剩余时间）
- [ ] 错误统计报告
- [ ] 用户可配置的跳过规则

### 优先级 P2（可选）
- [ ] 流式处理大文件
- [ ] 并行处理独立文件
- [ ] 缓存已处理文件的结果

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 超时设置过短 | 正常大文件被跳过 | 用户可配置超时时间 |
| 跳过 Office 文件 | ZIP 内 Office 内容丢失 | 在 UI 显示跳过原因 |
| 损坏检测误判 | 正常文件被跳过 | 仅检测已知损坏模式 |

---

## 测试计划

### 测试用例
1. 损坏的 PPTX 文件 → 应在 10 秒内跳过
2. 损坏的 XLSX 文件（ZIP内） → 应被跳过
3. 100MB+ 大文件 → 应只提取元数据
4. 正常的 50MB PPTX → 应在 30 秒内完成
5. 网络路径上的文件 → 应有超时保护
6. 无权限访问的文件 → 应跳过并记录

### 回归测试
- 确保现有正常文件仍能正常处理
- 确保扫描进度显示正常
- 确保搜索功能不受影响
