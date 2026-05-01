package com.docseeker;

/**
 * DocSeeker Java Test File
 * Test class demonstrating Java syntax highlighting
 */

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

public class DocSeekerScanner {

    // DocSeeker configuration
    private static final String NAME = "DocSeeker";
    private static final String VERSION = "1.0.0";

    private final String path;
    private final List<String> files;

    public DocSeekerScanner(String path) {
        this.path = path;
        this.files = new ArrayList<>();
    }

    /**
     * Scan directory for files
     * @return number of files found
     */
    public int scan() {
        File directory = new File(path);
        if (!directory.exists() || !directory.isDirectory()) {
            return 0;
        }

        scanDirectory(directory);
        return files.size();
    }

    private void scanDirectory(File directory) {
        File[] contents = directory.listFiles();
        if (contents == null) return;

        for (File file : contents) {
            if (file.isFile()) {
                files.add(file.getAbsolutePath());
            } else if (file.isDirectory()) {
                scanDirectory(file);
            }
        }
    }

    /**
     * Search files containing keyword
     * @param keyword keyword to search
     * @return list of matching files
     */
    public List<String> search(String keyword) {
        List<String> results = new ArrayList<>();
        for (String file : files) {
            try {
                String content = Files.readString(Path.of(file));
                if (content.contains(keyword)) {
                    results.add(file);
                }
            } catch (IOException e) {
                // Skip files that can't be read
            }
        }
        return results;
    }

    public static void main(String[] args) {
        DocSeekerScanner scanner = new DocSeekerScanner("/tmp");
        int count = scanner.scan();
        System.out.println("DocSeeker test - Found " + count + " files");

        List<String> results = scanner.search("DocSeeker");
        System.out.println("Found " + results.size() + " files with keyword");
    }
}
