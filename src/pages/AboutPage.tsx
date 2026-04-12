function AboutPage(): JSX.Element {
  return (
    <div className="settings-page">
      <h2 className="page-title">关于 DocSeeker</h2>

      <div className="settings-section">
        <div className="settings-card">
          <div className="about-content">
            <div className="about-logo">🔍</div>
            <div className="about-name">DocSeeker</div>
            <div className="about-version">版本 1.0.0</div>
            <div className="about-desc">
              个人长期积累文档的搜索工具，支持全文搜索、定时扫描、重复文件检测等功能。
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">联系方式</div>
        <div className="settings-card">
          <div className="about-contact">
            <div className="contact-item">
              <span className="contact-icon">✉️</span>
              <div>
                <div className="contact-label">电子邮件</div>
                <div className="contact-value">docseeker@example.com</div>
              </div>
            </div>
            <div className="contact-item">
              <span className="contact-icon">🐙</span>
              <div>
                <div className="contact-label">GitHub</div>
                <div className="contact-value">github.com/docseeker/docseeker</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">许可证</div>
        <div className="settings-card">
          <div className="about-license">
            本项目基于 MIT 许可证开源。
          </div>
        </div>
      </div>
    </div>
  )
}

export default AboutPage
