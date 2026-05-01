#!/usr/bin/env python3
"""
DocSeeker Python Test File
Test script demonstrating Python syntax highlighting
"""

import os
import sys
import json
from typing import List, Dict, Optional

# DocSeeker test configuration
CONFIG = {
    "name": "DocSeeker",
    "version": "1.0.0",
    "test": True
}

class DocSeekerScanner:
    """Test class for DocSeeker file scanning"""

    def __init__(self, path: str):
        self.path = path
        self.files: List[str] = []

    def scan(self) -> int:
        """Scan directory for files"""
        count = 0
        for root, dirs, files in os.walk(self.path):
            for file in files:
                self.files.append(os.path.join(root, file))
                count += 1
        return count

    def search(self, keyword: str) -> List[str]:
        """Search files containing keyword"""
        results = []
        for file in self.files:
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    if keyword in f.read():
                        results.append(file)
            except:
                pass
        return results

def main():
    """Main test function"""
    scanner = DocSeekerScanner("/tmp")
    print(f"DocSeeker test - Scanning {scanner.path}")
    count = scanner.scan()
    print(f"Found {count} files")
    results = scanner.search("DocSeeker")
    print(f"Found {len(results)} files with keyword")

if __name__ == "__main__":
    main()
