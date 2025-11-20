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

The CLI tool uses **the exact same NSFW detection model and logic** as the browser extension to analyze images for inappropriate content. When detected, it applies a blur filter to the output image. The model is loaded from the local `src/assets/models/nsfwjs/` directory, ensuring 100% consistency with the extension's behavior.

### Detection Categories

The tool detects and blurs images containing:

-   Pornographic content
-   Sexually suggestive content (Sexy)
-   Hentai content

Safe content categories (not blurred):

-   Neutral images
-   Drawings/artwork (non-explicit)

## Features

-   **100% identical detection logic** to the HaramBlur browser extension
-   **Same NSFW model** loaded from local files
-   **Same strictness algorithm** with exact threshold calculations
-   **Configurable strictness** to match your preferences
-   **Adjustable blur intensity**
-   **Fast processing** using TensorFlow.js
-   **Fully offline** - no external model downloads needed

## Requirements

-   Node.js 14 or higher
-   npm or yarn

## Programmatic Usage

You can also use HaramBlur as a module in your Node.js applications:

```javascript
const { detectImage, applyBlur } = require("./index.js");

async function processImage(inputPath, outputPath) {
    const settings = {
        strictness: 0.5,
        blurAmount: 20,
    };

    const result = await detectImage(inputPath, settings);

    if (result.shouldBlur) {
        await applyBlur(inputPath, outputPath, settings.blurAmount);
    }

    return result;
}
```

See `example.js` for a complete example, and `batch-example.js` for batch processing multiple images.

### Batch Processing

Process multiple images in a directory:

```bash
node batch-example.js ./input-directory ./output-directory 0.5
```

## Notes

-   The model is loaded from `src/assets/models/nsfwjs/` directory
-   Uses the exact same model files as the browser extension
-   No external downloads needed - fully offline
-   Supported image formats: PNG, JPEG, JPG
-   The tool preserves the original image and creates a new output file
-   Detection thresholds are calculated using the same formula as the extension

## Privacy

All processing is done locally on your machine. No images are sent to external servers (except for the initial model download from the official nsfwjs CDN).

## Related

This CLI tool is part of the HaramBlur project. For the browser extension version, see the main [README.MD](README.MD).

## License

Same as the main HaramBlur project.
