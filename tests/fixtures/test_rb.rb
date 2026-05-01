# DocSeeker Ruby Test
class DataProcessor
  def initialize
    @cache = []
  end

  def process(data)
    @cache << data.upcase
  end
end

puts "DocSeeker Ruby Test - Ruby 编程语言"
processor = DataProcessor.new
processor.process("测试数据")
