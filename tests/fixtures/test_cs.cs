// DocSeeker C# Test
using System;
using System.Collections.Generic;

namespace DocSeeker.Test
{
    public class Program
    {
        public static void Main(string[] args)
        {
            Console.WriteLine("DocSeeker C# Test");
            var processor = new DataProcessor();
            processor.Process("测试数据");
        }
    }

    public class DataProcessor
    {
        private List<string> _cache = new List<string>();

        public void Process(string data)
        {
            _cache.Add(data);
        }
    }
}
