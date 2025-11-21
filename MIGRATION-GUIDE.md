# Migration Guide: Browser Extension to CLI Tool

This guide helps you understand the differences between the HaramBlur browser extension and the new CLI tool, and how to use both.

## Overview

HaramBlur now offers two ways to use the detection technology:

1. **Browser Extension**: For automatically detecting and blurring content while browsing the web
2. **CLI Tool**: For processing images from the command line or integrating into your own applications

## Key Differences

### Browser Extension

-   **Use Case**: Real-time web browsing protection
-   **Features**:
    -   Face detection (gender-based)
    -   NSFW content detection
    -   Video processing
    -   Hover to unblur
    -   Customizable settings per website
-   **Installation**: Chrome Web Store or manual installation
-   **Platform**: Chrome, Firefox, and other Chromium-based browsers

### CLI Tool

-   **Use Case**: Batch processing, automation, or integration into workflows
-   **Features**:
    -   NSFW content detection
    -   Image processing (not videos)
    -   Configurable strictness
    -   Programmatic API
    -   Batch processing support
-   **Installation**: npm install
-   **Platform**: Node.js (cross-platform)

## Detection Differences

### Browser Extension

The extension uses:

-   **Human.js** for face detection and gender recognition
-   **nsfwjs** for NSFW content detection

Detection can be configured to blur based on:

-   Male faces
-   Female faces
-   NSFW content (Porn, Sexy, Hentai)

### CLI Tool

The CLI currently uses:

-   **nsfwjs** only for NSFW content detection

Detection focuses on:

-   NSFW content (Porn, Sexy, Hentai)

> **Note**: Face detection may be added in future versions of the CLI tool. The current implementation focuses on NSFW detection as the primary use case.

## When to Use Each

### Use the Browser Extension When:

-   You want automatic protection while browsing
-   You need to process videos
-   You want face-based detection
-   You prefer a visual interface with hover-to-unblur

### Use the CLI Tool When:

-   You need to process images in bulk
-   You want to integrate detection into your own applications
-   You need to automate image processing
-   You want to pre-process images before uploading them
-   You're building a content moderation pipeline

## Same Technology, Different Interface

Both the extension and CLI tool use the same core NSFW detection model (nsfwjs), ensuring consistent results across platforms. The detection thresholds and strictness settings work the same way in both.

## Getting Started with CLI

If you're familiar with the browser extension and want to try the CLI:

1. **Installation**:

    ```bash
    npm install
    ```

2. **Basic Usage**:

    ```bash
    node index.js input.jpg output.jpg
    ```

3. **Adjust Strictness** (similar to extension settings):
    ```bash
    node index.js input.jpg output.jpg --strictness=0.5
    ```
    - `0.0` = Most strict (like extension's "Strict" mode)
    - `0.5` = Balanced (like extension's "Normal" mode)
    - `1.0` = Least strict (like extension's "Relaxed" mode)

## Future Roadmap

We plan to enhance the CLI tool to include:

-   Face detection and gender recognition
-   Video processing support
-   More output formats (grayscale, pixelation, etc.)
-   Better offline model support

## Contributing

Both the extension and CLI tool are open source. Contributions are welcome! See the main README for contribution guidelines.

## Support

-   For browser extension issues: Check the extension's popup settings
-   For CLI tool issues: Run with `--help` flag or check CLI-README.md
-   For general questions: Open an issue on GitHub

---

May Allah make this tool beneficial for the Ummah. Don't forget us in your Du'a! 🤲
