# HaramBlur CLI Tool

Command-line tool to detect and blur inappropriate content in images using the same detection models as the HaramBlur browser extension.

## Installation

```bash
# Clone the repository
git clone https://github.com/MostafaRabia/HaramBlur.git
cd HaramBlur

# Install dependencies
npm install
```

## Usage

Basic usage:

```bash
node index.js <input-image> <output-image>
```

### Examples

Process an image with default settings:

```bash
node index.js input.jpg output.jpg
```

Adjust detection strictness (0 = more strict, 1 = less strict):

```bash
node index.js input.jpg output.jpg --strictness=0.3
```

Increase blur amount:

```bash
node index.js input.jpg output.jpg --blur-amount=30
```

Combine options:

```bash
node index.js input.jpg output.jpg --strictness=0.5 --blur-amount=25
```

## Options

-   `--strictness=N` - Detection strictness level (0-1, default: 0.5)
    -   Lower values = more strict detection
    -   Higher values = less strict detection
-   `--blur-amount=N` - Blur intensity in pixels (default: 20)
    -   Higher values = more blur

## How It Works

The CLI tool uses the NSFW detection model from [nsfwjs](https://github.com/infinitered/nsfwjs/) to analyze images for inappropriate content. When detected, it applies a blur filter to the output image.

### Detection Categories

The tool detects and blurs images containing:

-   Pornographic content
-   Sexually suggestive content (Sexy)
-   Hentai content

Safe content categories (not blurred):

-   Neutral images
-   Drawings/artwork (non-explicit)

## Features

-   **Same detection logic** as the HaramBlur browser extension
-   **Configurable strictness** to match your preferences
-   **Adjustable blur intensity**
-   **Fast processing** using TensorFlow.js
-   **Offline capable** (after first model download)

## Requirements

-   Node.js 14 or higher
-   npm or yarn

## Notes

-   On first run, the tool will download the NSFW detection model (approximately 3MB)
-   The model is cached locally for subsequent runs
-   Supported image formats: PNG, JPEG, JPG
-   The tool preserves the original image and creates a new output file

## Privacy

All processing is done locally on your machine. No images are sent to external servers (except for the initial model download from the official nsfwjs CDN).

## Related

This CLI tool is part of the HaramBlur project. For the browser extension version, see the main [README.MD](README.MD).

## License

Same as the main HaramBlur project.
