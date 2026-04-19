# M1.4 实时文件监控 — E2E 测试指南

## 前置条件

- Go 编译产物 `usn-monitor.exe` 已就绪
- DocSeeker 已从源码启动（`npm run dev`）

## 测试步骤

### T1: 启用监控

1. 打开 DocSeeker → 设置页面
2. 找到"实时文件监控" section
3. 启用开关
4. 预期：状态栏显示 监控中

### T2: 创建文件测试

1. 在任意监控目录下新建文件 `echo "test" > D:/TestWatch/test-file.txt`
2. 在 DocSeeker 中搜索 `test-file`
3. 预期：新文件出现在搜索结果中

### T3: 修改文件测试

1. 修改 `D:/TestWatch/test-file.txt` 内容
2. 预期：搜索结果中该文件内容版本更新

### T4: 重命名文件测试

1. 执行 `mv D:/TestWatch/test-file.txt D:/TestWatch/test-renamed.txt`
2. 预期：旧路径文件消失，新路径文件出现

### T5: 删除文件夹测试

1. 创建 `D:/TestWatch/SubFolder/test2.txt`
2. 执行 `rm -rf D:/TestWatch/SubFolder`
3. 预期：SubFolder 下所有文件从搜索索引中删除

### T6: 关闭监控

1. 设置页面关闭实时监控开关
2. 预期：状态栏显示 监控已停止

## 回归测试

- 普通文件搜索功能不受影响
- 设置页其他配置不受影响