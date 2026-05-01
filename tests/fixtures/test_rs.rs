// DocSeeker Rust Test
use std::collections::HashMap;

struct DataProcessor {
    cache: Vec<String>,
}

impl DataProcessor {
    fn new() -> Self {
        DataProcessor { cache: Vec::new() }
    }

    fn process(&mut self, data: &str) {
        self.cache.push(data.to_uppercase());
    }
}

fn main() {
    println!("DocSeeker Rust Test - Rust 编程语言");
    let mut processor = DataProcessor::new();
    processor.process("测试数据");
}
