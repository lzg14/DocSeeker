function GuidePage(): JSX.Element {
  return (
    <div className="settings-page">
      <h2 className="page-title">使用说明</h2>

      <div className="settings-section">
        <div className="settings-section-title">功能介绍</div>
        <div className="settings-card">
          <div className="guide-content">
            <p>DocSeeker 是一款高效的本地文档搜索工具，支持全文搜索和定时扫描功能。</p>
            <h3>主要功能</h3>
            <ul>
              <li><strong>全文搜索</strong>：支持搜索文件名和文件内容（docx、xlsx、pdf、txt 等格式）</li>
              <li><strong>定时扫描</strong>：可配置定时任务，自动增量扫描指定文件夹</li>
              <li><strong>重复文件检测</strong>：通过 MD5 哈希快速找出重复文件</li>
              <li><strong>多文件夹管理</strong>：支持同时管理多个扫描目录</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">使用步骤</div>
        <div className="settings-card">
          <div className="guide-content">
            <ol>
              <li>在「配置」中添加要扫描的文件夹</li>
              <li>在「扫描」页面执行首次全量扫描</li>
              <li>根据需要开启定时扫描，自动保持索引更新</li>
              <li>在「搜索」页面输入关键词查找文档</li>
              <li>点击搜索结果可在右侧预览文件，点击「在文件夹中显示」定位文件</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">常见问题</div>
        <div className="settings-card">
          <div className="guide-content">
            <details className="faq-item">
              <summary>为什么搜索不到新添加的文件？</summary>
              <p>请在「扫描」页面执行扫描操作，建立文件索引后即可搜索。</p>
            </details>
            <details className="faq-item">
              <summary>定时扫描不生效？</summary>
              <p>请确保应用保持运行状态，定时扫描功能需要在应用启动时才能触发。</p>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GuidePage
