#!/usr/bin/env python3
"""
extractOcr.py 的单元测试
TDD 流程: 先写测试，再实现代码
"""
import sys
import os
import json
import tempfile
import shutil
import unittest
from unittest.mock import patch, MagicMock

# 测试目标模块
sys.path.insert(0, os.path.dirname(__file__))
import extractOcr


class TestExtractImagesFromPdf(unittest.TestCase):
    """测试 extract_images_from_pdf 函数"""

    def setUp(self):
        """创建临时目录"""
        self.tmp_dir = tempfile.mkdtemp(prefix='tdd_test_')

    def tearDown(self):
        """清理临时目录"""
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    @patch('fitz.open')
    def test_returns_list(self, mock_open):
        """提取图片应返回列表"""
        mock_doc = MagicMock()
        mock_doc.__len__ = MagicMock(return_value=0)
        mock_doc.__getitem__ = MagicMock(return_value=MagicMock(get_images=MagicMock(return_value=[])))
        mock_open.return_value = mock_doc

        result = extractOcr.extract_images_from_pdf(
            'fake_path.pdf',
            self.tmp_dir
        )
        self.assertIsInstance(result, list)

    @patch('fitz.open')
    def test_raises_on_invalid_pdf(self, mock_open):
        """无效 PDF 应抛出异常"""
        mock_open.side_effect = Exception("Invalid PDF")
        with self.assertRaises(Exception):
            extractOcr.extract_images_from_pdf(
                'invalid.pdf',
                self.tmp_dir
            )


class TestOcrImage(unittest.TestCase):
    """测试 ocr_image 函数"""

    def test_returns_none_on_cli_error(self):
        """CLI 执行失败应返回 None"""
        result = extractOcr.ocr_image(
            'nonexistent_cli.exe',
            'fake_image.png',
            'zh-Hans-CN'
        )
        self.assertIsNone(result)

    def test_returns_none_on_invalid_json(self):
        """CLI 返回非 JSON 应返回 None"""
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout='not json'
            )
            result = extractOcr.ocr_image(
                'cli.exe',
                'img.png',
                'zh-Hans-CN'
            )
            self.assertIsNone(result)

    def test_returns_parsed_json_on_success(self):
        """CLI 返回有效 JSON 应解析返回"""
        expected = {"Text": "测试文字"}
        with patch('subprocess.run') as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout=json.dumps(expected)
            )
            result = extractOcr.ocr_image(
                'cli.exe',
                'img.png',
                'zh-Hans-CN'
            )
            self.assertEqual(result, expected)


class TestIntegration(unittest.TestCase):
    """集成测试"""

    def test_main_output_valid_json(self):
        """main() 应输出有效 JSON"""
        with patch('sys.argv', [
            'extractOcr.py',
            'fake.pdf',
            'fake_cli.exe'
        ]):
            with patch('extractOcr.extract_images_from_pdf', return_value=[]):
                # 使用 io.StringIO 捕获输出
                import io
                captured = io.StringIO()
                with patch('sys.stdout', captured):
                    extractOcr.main()
                # 验证输出是有效 JSON
                output = captured.getvalue()
                data = json.loads(output)
                self.assertIn('text', data)
                self.assertIn('images', data)


if __name__ == '__main__':
    unittest.main()