// DocSeeker Go Test
package main

import (
    "fmt"
    "strings"
)

type DataProcessor struct {
    cache []string
}

func NewDataProcessor() *DataProcessor {
    return &DataProcessor{}
}

func (p *DataProcessor) Process(data string) {
    p.cache = append(p.cache, strings.ToUpper(data))
}

func main() {
    fmt.Println("DocSeeker Go Test - Go 编程语言")
    processor := NewDataProcessor()
    processor.Process("测试数据")
}
