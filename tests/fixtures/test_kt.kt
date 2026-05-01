// DocSeeker Kotlin Test
class DataProcessor {
    val cache = mutableListOf<String>()

    fun process(data: String) {
        cache.add(data.uppercase())
    }
}

fun main() {
    println("DocSeeker Kotlin Test - Kotlin 编程语言")
    val processor = DataProcessor()
    processor.process("测试数据")
}
