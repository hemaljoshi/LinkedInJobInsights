#!/bin/bash

# LinkedIn Job Insights - Build Script
# Creates separate builds for Chrome and Firefox

echo "🚀 Building LinkedIn Job Insights Extension..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist

# Create directories
mkdir -p dist/chrome
mkdir -p dist/firefox

echo "📦 Building Chrome version..."
# Chrome build (Manifest V3)
cp manifest.json dist/chrome/
cp content.js dist/chrome/
cp background.js dist/chrome/
cp styles.css dist/chrome/
cp README.md dist/chrome/
cp -r icons dist/chrome/

# Copy images if they exist
if [ -f "icon.png" ]; then cp icon.png dist/chrome/; fi
if [ -f "close.png" ]; then cp close.png dist/chrome/; fi
if [ -f "refresh.png" ]; then cp refresh.png dist/chrome/; fi
if [ -f "screenshot.png" ]; then cp screenshot.png dist/chrome/; fi

echo "🦊 Building Firefox version..."
# Firefox build (Manifest V2)
cp manifest-firefox.json dist/firefox/manifest.json
cp content.js dist/firefox/
cp background.js dist/firefox/
cp styles.css dist/firefox/
cp README.md dist/firefox/
cp -r icons dist/firefox/

# Copy images if they exist
if [ -f "icon.png" ]; then cp icon.png dist/firefox/; fi
if [ -f "close.png" ]; then cp close.png dist/firefox/; fi
if [ -f "refresh.png" ]; then cp refresh.png dist/firefox/; fi
if [ -f "screenshot.png" ]; then cp screenshot.png dist/firefox/; fi

echo ""
echo "✅ Build complete!"
echo ""
echo "📂 Build locations:"
echo "   Chrome: dist/chrome/"
echo "   Firefox: dist/firefox/"
echo ""
echo "📝 Installation instructions:"
echo ""
echo "Chrome/Edge:"
echo "  1. Go to chrome://extensions/"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select the 'dist/chrome' folder"
echo ""
echo "Firefox:"
echo "  1. Go to about:debugging#/runtime/this-firefox"
echo "  2. Click 'Load Temporary Add-on'"
echo "  3. Navigate to 'dist/firefox' folder"
echo "  4. Select the 'manifest.json' file"
echo ""
echo "🎉 Happy coding!"