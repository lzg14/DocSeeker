// DocSeeker Scala Test
class DataProcessor {
  val cache = scala.collection.mutable.ListBuffer[String]()

  def process(data: String): Unit = {
    cache += data.toUpperCase
  }
}

object Main extends App {
  println("DocSeeker Scala Test - Scala 编程语言")
  val processor = new DataProcessor()
  processor.process("测试数据")
}
