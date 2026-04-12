interface DirectoryPickerProps {
  onScan: (dirPath: string) => void
  isScanning: boolean
}

function DirectoryPicker({ onScan, isScanning }: DirectoryPickerProps): JSX.Element {
  const handleSelectDirectory = async (): Promise<void> => {
    const dirPath = await window.electron.selectDirectory()
    if (dirPath) {
      onScan(dirPath)
    }
  }

  return (
    <div className="directory-picker">
      <button className="btn btn-primary" onClick={handleSelectDirectory} disabled={isScanning}>
        {isScanning ? '扫描中...' : '选择目录并扫描'}
      </button>
    </div>
  )
}

export default DirectoryPicker
