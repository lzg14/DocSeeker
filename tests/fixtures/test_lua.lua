-- DocSeeker Lua Test
local DataProcessor = {}
DataProcessor.__index = DataProcessor

function DataProcessor.new()
    local self = setmetatable({}, DataProcessor)
    self.cache = {}
    return self
end

function DataProcessor:process(data)
    table.insert(self.cache, string.upper(data))
end

print("DocSeeker Lua Test - Lua 编程语言")
local processor = DataProcessor.new()
processor:process("测试数据")
