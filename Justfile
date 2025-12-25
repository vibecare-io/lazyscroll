# LazyScroll - Chrome Extension for gesture-based scrolling

# Default recipe - show available commands
default:
    @just --list

# Install dependencies
install:
    bun install

# Open Chrome extensions page
open-extensions:
    open "chrome://extensions"

# Watch for file changes and rebuild (future use)
dev:
    @echo "Load extension from chrome://extensions > Load unpacked"
    @echo "Extension will auto-reload on file changes in Chrome"

# Clean build artifacts
clean:
    rm -rf node_modules bun.lockb

# Reinstall dependencies
reinstall: clean install

# Lint JavaScript files
lint:
    bunx eslint src/ popup/ offscreen/ --ext .js

# Format code
fmt:
    bunx prettier --write "src/**/*.js" "popup/**/*.{js,css,html}" "offscreen/**/*.{js,html}"

# Package extension for distribution
package:
    #!/usr/bin/env bash
    mkdir -p dist
    zip -r dist/lazyscroll.zip \
        manifest.json \
        src/ \
        popup/ \
        sidebar/ \
        assets/ \
        lib/ \
        -x "*.DS_Store" -x "*.map"
    echo "Created dist/lazyscroll.zip"

# Show project structure
tree:
    @find . -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" -o -name "*.json" \) | grep -v node_modules | sort

# Generate new icons (requires ImageMagick)
icons:
    #!/usr/bin/env bash
    cd assets/icons
    magick -background "#667eea" -size 16x16 xc:"#667eea" icon16.png
    magick -background "#667eea" -size 48x48 xc:"#667eea" icon48.png
    magick -background "#667eea" -size 128x128 xc:"#667eea" icon128.png
    @echo "Icons regenerated"
