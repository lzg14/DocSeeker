import { useState, useMemo } from 'react'
import { useLanguage } from '../context/LanguageContext'

interface QuoteCard {
  id: number
  before: string
  keyword: string
  after: string
  lineNumber: number
}

interface QuoteCardsProps {
  fileName: string
  content: string
  keyword: string
  isLoading?: boolean
  onClose: () => void
}

// Sentence boundary characters for Chinese and English
const SENTENCE_ENDINGS = /[。！？；\n.?!]/

// Count sentences in text (each ending character ends a sentence)
function countSentences(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (SENTENCE_ENDINGS.test(text[i])) {
      count++
    }
  }
  return count
}

// Find sentence start, ensuring at least minSentences sentences
function findSentenceStart(text: string, fromPos: number, minSentences: number = 2): string {
  if (!text) return ''
  const beforeKeyword = text.slice(0, fromPos)
  // Find positions of sentence endings
  const sentenceEnds: number[] = []
  for (let i = 0; i < beforeKeyword.length; i++) {
    if (SENTENCE_ENDINGS.test(beforeKeyword[i])) {
      sentenceEnds.push(i)
    }
  }

  // Need at least minSentences sentences
  if (sentenceEnds.length < minSentences) {
    // Not enough sentences, return all text
    return beforeKeyword.trim()
  }

  // Get start from the beginning of the second-to-last sentence (for minSentences=2)
  const targetEndIndex = sentenceEnds[sentenceEnds.length - minSentences]
  return beforeKeyword.slice(targetEndIndex + 1).trim()
}

// Find sentence end, ensuring at least minSentences sentences
function findSentenceEnd(text: string, fromPos: number, minSentences: number = 2): string {
  if (!text) return ''
  const afterKeyword = text.slice(fromPos)
  // Find positions of sentence endings
  const sentenceEnds: number[] = []
  for (let i = 0; i < afterKeyword.length; i++) {
    if (SENTENCE_ENDINGS.test(afterKeyword[i])) {
      sentenceEnds.push(i)
    }
  }

  // Need at least minSentences sentences
  if (sentenceEnds.length < minSentences) {
    // Not enough sentences, return all text
    return afterKeyword.trim()
  }

  // Get up to the end of the second sentence (for minSentences=2)
  const targetEndIndex = sentenceEnds[minSentences - 1]
  return afterKeyword.slice(0, targetEndIndex + 1).trim()
}

function QuoteCards({ fileName, content, keyword, isLoading = false, onClose }: QuoteCardsProps): JSX.Element {
  const { t } = useLanguage()
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [exportMessage, setExportMessage] = useState('')

  // Minimum context characters before/after keyword (100 chars, max 200 total)
  const MIN_CONTEXT_CHARS = 100
  const MAX_CONTEXT = 200 // maximum before or after

  // Extract all quotes containing the keyword
  const quotes = useMemo((): QuoteCard[] => {
    if (!content || !keyword.trim()) return []

    const result: QuoteCard[] = []
    const lines = content.split('\n')
    const lowerKeyword = keyword.toLowerCase()

    lines.forEach((line, index) => {
      const lowerLine = line.toLowerCase()
      let searchStart = 0
      let position = lowerLine.indexOf(lowerKeyword, searchStart)

      while (position !== -1) {
        const kw = line.slice(position, position + keyword.length)

        // Get the full line as context
        const lineStart = line.lastIndexOf('\n', position) + 1
        const lineEnd = line.indexOf('\n', position)
        const fullLine = line.slice(lineStart, lineEnd > 0 ? lineEnd : line.length)

        // Extract the position in the full line
        const posInLine = position

        // Get content before keyword in the full line
        const beforeContent = fullLine.slice(0, posInLine)
        // Get content after keyword in the full line
        const afterContent = fullLine.slice(posInLine + keyword.length)

        // Find at least 2 sentences before and after keyword
        const sentenceBefore = findSentenceStart(beforeContent, beforeContent.length, 2)
        const sentenceAfter = findSentenceEnd(afterContent, 0, 2)

        // Ensure minimum 100 characters (expand to sentence boundary if needed)
        let beforeText = sentenceBefore
        if (beforeText.length < MIN_CONTEXT_CHARS && beforeContent.length > beforeText.length) {
          // Try to expand to get 100 chars
          const remaining = beforeContent.slice(0, beforeContent.length - sentenceBefore.length)
          beforeText = remaining + sentenceBefore
          // Expand back to sentence boundary
          beforeText = findSentenceStart(beforeContent, beforeContent.length, 1) || beforeText
        }

        let afterText = sentenceAfter
        if (afterText.length < MIN_CONTEXT_CHARS && afterContent.length > afterText.length) {
          // Try to expand to get 100 chars
          const remaining = afterContent.slice(sentenceAfter.length)
          afterText = sentenceAfter + remaining
          // Expand to sentence boundary
          afterText = findSentenceEnd(afterContent, 0, 1) || afterText
        }

        // Cap at 200 characters max
        const finalBefore = beforeText.slice(-200) || beforeText
        const finalAfter = afterText.slice(0, 200) || afterText

        // Only include if we have at least some content
        if (finalBefore.length > 0 || finalAfter.length > 0) {
          result.push({
            id: result.length,
            before: finalBefore,
            keyword: kw,
            after: finalAfter,
            lineNumber: index + 1
          })
        }

        searchStart = position + keyword.length
        position = lowerLine.indexOf(lowerKeyword, searchStart)
      }
    })

    return result
  }, [content, keyword])

  const handleCopyCard = (card: QuoteCard) => {
    const text = `${card.before}${card.keyword}${card.after}`
    navigator.clipboard.writeText(text)
    setCopiedId(card.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const handleCopyAll = () => {
    if (quotes.length === 0) return
    const allText = quotes.map((card, i) =>
      `[${i + 1}] ${card.before}${card.keyword}${card.after}`
    ).join('\n\n')

    const header = `# ${fileName}\n## 关键词: ${keyword}\n\n`
    navigator.clipboard.writeText(header + allText)
    setExportMessage(t('quote.copyAllSuccess') || '已复制全部到剪贴板')
    setTimeout(() => setExportMessage(''), 2000)
  }

  const handleExportFile = async (format: 'md' | 'txt') => {
    if (quotes.length === 0) return

    const defaultFileName = fileName.replace(/\.[^.]+$/, '') + `_${keyword}`
    const filePath = await window.electron.saveFileDialog({
      defaultPath: `${defaultFileName}.${format}`,
      filters: format === 'md'
        ? [{ name: 'Markdown', extensions: ['md'] }]
        : [{ name: 'Text', extensions: ['txt'] }]
    })

    if (!filePath) return

    // Generate content based on format
    let content: string
    if (format === 'md') {
      content = `# ${fileName}\n\n`
      content += `**关键词**: ${keyword}\n`
      content += `**引用数量**: ${quotes.length} 处\n\n`
      content += `---\n\n`

      quotes.forEach((card, i) => {
        content += `## 引用 ${i + 1}\n`
        content += `**行号**: 第 ${card.lineNumber} 行\n\n`
        content += `> ${card.before}**${card.keyword}**${card.after}\n\n`
      })
    } else {
      content = `=== ${fileName} ===\n`
      content += `关键词: ${keyword}\n`
      content += `共 ${quotes.length} 处引用\n`
      content += `${'='.repeat(40)}\n\n`

      quotes.forEach((card, i) => {
        content += `[引用 ${i + 1}] 第 ${card.lineNumber} 行\n`
        content += `...${card.before}${card.keyword}${card.after}...\n\n`
      })
    }

    // Save to file via IPC
    try {
      const result = await window.electron.saveTextToFile(filePath, content)
      if (result.success) {
        setExportMessage(t('quote.exportSuccess') || '已保存到文件')
      } else {
        setExportMessage(t('quote.exportFailed') || '保存失败: ' + result.error)
      }
      setTimeout(() => setExportMessage(''), 3000)
    } catch (err) {
      console.error('Failed to save file:', err)
      setExportMessage(t('quote.exportFailed') || '保存失败')
      setTimeout(() => setExportMessage(''), 3000)
    }
  }

  if (!keyword.trim()) {
    return (
      <div className="quote-cards-overlay" onClick={onClose}>
        <div className="quote-cards-modal" onClick={e => e.stopPropagation()}>
          <div className="quote-cards-header">
            <h3>{t('quote.title') || '提取文献卡片'}</h3>
            <button className="quote-cards-close" onClick={onClose}>×</button>
          </div>
          <div className="quote-cards-empty">
            {t('quote.enterKeyword') || '请输入关键词'}
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="quote-cards-overlay" onClick={onClose}>
        <div className="quote-cards-modal" onClick={e => e.stopPropagation()}>
          <div className="quote-cards-header">
            <h3>{t('quote.title') || '提取文献卡片'}</h3>
            <button className="quote-cards-close" onClick={onClose}>×</button>
          </div>
          <div className="quote-cards-loading">
            正在加载文件内容...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="quote-cards-overlay" onClick={onClose}>
      <div className="quote-cards-modal" onClick={e => e.stopPropagation()}>
        <div className="quote-cards-header">
          <h3>{t('quote.title') || '提取文献卡片'}</h3>
          <button className="quote-cards-close" onClick={onClose}>×</button>
        </div>

        <div className="quote-cards-info">
          <span className="quote-file-name">{fileName}</span>
          <span className="quote-keyword">关键词: {keyword}</span>
          <span className="quote-count">{t('quote.found') || '找到'}{quotes.length}{t('quote.citations') || '处引用'}</span>
        </div>

        <div className="quote-cards-actions">
          <button className="btn btn-secondary" onClick={handleCopyAll} disabled={quotes.length === 0}>
            {t('quote.copyAll') || '复制全部'}
          </button>
          <button className="btn btn-secondary" onClick={() => handleExportFile('md')} disabled={quotes.length === 0}>
            {t('quote.exportMd') || '导出 MD'}
          </button>
          <button className="btn btn-secondary" onClick={() => handleExportFile('txt')} disabled={quotes.length === 0}>
            {t('quote.exportTxt') || '导出 TXT'}
          </button>
          {exportMessage && (
            <span className="quote-export-message">{exportMessage}</span>
          )}
        </div>

        <div className="quote-cards-list">
          {quotes.length === 0 ? (
            <div className="quote-cards-empty">
              {t('quote.noResults') || '未找到相关引用（前后文需至少50字）'}
            </div>
          ) : (
            quotes.map(card => (
              <div key={card.id} className="quote-card">
                <div className="quote-card-header">
                  <span className="quote-card-number">#{card.id + 1}</span>
                  <span className="quote-card-line">{t('quote.line') || '第'}{card.lineNumber}{t('quote.lineSuffix') || '行'}</span>
                  <button
                    className="quote-card-copy"
                    onClick={() => handleCopyCard(card)}
                  >
                    {copiedId === card.id ? (t('quote.copied') || '已复制') : (t('quote.copy') || '复制')}
                  </button>
                </div>
                <div className="quote-card-content">
                  <span className="quote-context">{card.before}</span>
                  <span className="quote-keyword-highlight">{card.keyword}</span>
                  <span className="quote-context">{card.after}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default QuoteCards
