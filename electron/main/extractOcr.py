#!/usr/bin/env python3
"""
从 PDF 提取图片并用 Windows OCR CLI 识别文字。
调用方式: python extractOcr.py <pdf_path> <ocr_cli_path> [--lang <lang>]
输出: JSON格式识别结果
"""
import sys
import json
import os
import tempfile
import shutil
import subprocess
import argparse

try:
    import fitz
except ImportError:
    print(json.dumps({"error": "PyMuPDF not installed"}))
    sys.exit(1)

def extract_images_from_pdf(pdf_path, output_dir):
    """从 PDF 提取所有图片到临时目录"""
    doc = fitz.open(pdf_path)
    images = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        imgs = page.get_images()
        for img_index, img in enumerate(imgs):
            xref = img[0]
            base = doc.extract_image(xref)
            ext = base['ext']
            img_data = base['image']
            img_path = os.path.join(output_dir, f'page{page_num+1:04d}_img{img_index}.{ext}')
            with open(img_path, 'wb') as f:
                f.write(img_data)
            images.append(img_path)
    doc.close()
    return images

def ocr_image(cli_path, img_path, lang):
    """调用 windows-media-ocr CLI 识别单张图片"""
    cmd = [cli_path, '--language', lang, '--file', img_path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            return None
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return None
    except Exception:
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('pdf_path')
    parser.add_argument('ocr_cli_path')
    parser.add_argument('--lang', default='zh-Hans-CN')
    args = parser.parse_args()

    pdf_path = args.pdf_path
    cli_path = args.ocr_cli_path

    tmp_dir = tempfile.mkdtemp(prefix='docseeker_ocr_')
    try:
        img_paths = extract_images_from_pdf(pdf_path, tmp_dir)
        if not img_paths:
            print(json.dumps({"text": "", "images": 0, "error": None}))
            return

        all_texts = []
        for img_path in img_paths:
            result = ocr_image(cli_path, img_path, args.lang)
            if result and result.get('Text'):
                all_texts.append(result['Text'])

        full_text = ' '.join(all_texts)
        print(json.dumps({"text": full_text, "images": len(img_paths), "error": None}))
    except Exception as e:
        print(json.dumps({"text": "", "images": 0, "error": str(e)}))
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == '__main__':
    main()