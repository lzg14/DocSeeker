# DocSeeker PowerShell Test
# PowerShell 脚本测试

class DataProcessor {
    [System.Collections.ArrayList]$Cache

    DataProcessor() {
        $this.Cache = [System.Collections.ArrayList]::new()
    }

    [void]Process([string]$Data) {
        [void]$this.Cache.Add($Data.ToUpper())
    }
}

Write-Host "DocSeeker PowerShell Test - PowerShell 脚本"
$processor = [DataProcessor]::new()
$processor.Process("测试数据")
