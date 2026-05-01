<?php
// DocSeeker PHP Test

class DataProcessor {
    private $cache = [];

    public function process($data) {
        $this->cache[] = strtoupper($data);
    }
}

echo "DocSeeker PHP Test - PHP 编程语言\n";
$processor = new DataProcessor();
$processor->process("测试数据");
