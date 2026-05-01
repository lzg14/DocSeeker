// DocSeeker Rust Test File
// Test module demonstrating Rust syntax highlighting

use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// DocSeeker configuration
const NAME: &str = "DocSeeker";
const VERSION: &str = "1.0.0";

/// File record structure
#[derive(Debug, Clone)]
struct FileRecord {
    id: u64,
    path: String,
    name: String,
    size: u64,
    content: Option<String>,
}

/// DocSeeker scanner implementation
struct DocSeekerScanner {
    path: String,
    files: Vec<FileRecord>,
}

impl DocSeekerScanner {
    /// Create a new scanner
    fn new(path: &str) -> Self {
        Self {
            path: path.to_string(),
            files: Vec::new(),
        }
    }

    /// Scan directory for files
    fn scan(&mut self) -> usize {
        if let Ok(entries) = fs::read_dir(&self.path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(metadata) = entry.metadata() {
                        self.files.push(FileRecord {
                            id: self.files.len() as u64 + 1,
                            path: path.to_string_lossy().to_string(),
                            name: path.file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                            size: metadata.len(),
                            content: None,
                        });
                    }
                }
            }
        }
        self.files.len()
    }

    /// Search files containing keyword
    fn search(&self, keyword: &str) -> Vec<&FileRecord> {
        self.files
            .iter()
            .filter(|f| f.name.contains(keyword))
            .collect()
    }
}

fn main() {
    println!("DocSeeker Rust Test");

    let mut scanner = DocSeekerScanner::new("/tmp");
    let count = scanner.scan();
    println!("Found {} files", count);

    let results = scanner.search("DocSeeker");
    println!("Found {} files with keyword", results.len());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scanner_creation() {
        let scanner = DocSeekerScanner::new("/tmp");
        assert_eq!(scanner.files.len(), 0);
    }
}
