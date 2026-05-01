// DocSeeker Swift Test
import Foundation

class DataProcessor {
    var cache: [String] = []

    func process(_ data: String) {
        cache.append(data.uppercased())
    }
}

print("DocSeeker Swift Test - Swift 编程语言")
let processor = DataProcessor()
processor.process("测试数据")
