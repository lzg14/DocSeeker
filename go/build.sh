#!/bin/bash
# DocSeeker Go Monitor Cross-Compile Script
# Usage: ./build.sh [macos|windows|linux|all]

set -e

cd "$(dirname "$0")"

PLATFORM="${1:-all}"
OUTPUT_DIR="$(pwd)"

build_macos() {
    echo "Building macOS version..."
    GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 go build -o docseeker-monitor .
    echo "Built: docseeker-monitor (macOS x64)"
}

build_macos_arm64() {
    echo "Building macOS ARM64 version..."
    GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 go build -o docseeker-monitor-arm64 .
    echo "Built: docseeker-monitor-arm64 (macOS ARM64)"
}

build_windows() {
    echo "Building Windows version..."
    GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o docseeker-monitor.exe .
    echo "Built: docseeker-monitor.exe (Windows x64)"
}

build_linux() {
    echo "Building Linux version..."
    GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o docseeker-monitor-linux .
    echo "Built: docseeker-monitor-linux (Linux x64)"
}

case "$PLATFORM" in
    macos)
        build_macos
        ;;
    macos-arm64)
        build_macos_arm64
        ;;
    windows)
        build_windows
        ;;
    linux)
        build_linux
        ;;
    all)
        build_macos
        build_macos_arm64
        build_windows
        build_linux
        ;;
    *)
        echo "Usage: $0 [macos|macos-arm64|windows|linux|all]"
        exit 1
        ;;
esac

echo ""
echo "Build complete!"
ls -la docseeker-monitor* 2>/dev/null || true
