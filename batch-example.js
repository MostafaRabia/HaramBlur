/**
 * Batch processing example for HaramBlur CLI
 * Process multiple images in a directory
 */

const { detectImage, applyBlur } = require("./index.js");
const fs = require("fs");
const path = require("path");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];

async function processDirectory(inputDir, outputDir, options = {}) {
    const settings = {
        strictness: options.strictness || 0.5,
        blurAmount: options.blurAmount || 20,
    };

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get all image files
    const files = fs.readdirSync(inputDir).filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return IMAGE_EXTENSIONS.includes(ext);
    });

    if (files.length === 0) {
        console.log("No image files found in directory");
        return;
    }

    console.log(`Found ${files.length} images to process\n`);

    const results = {
        total: files.length,
        blurred: 0,
        clean: 0,
        errors: 0,
    };

    // Process each file
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const inputPath = path.join(inputDir, file);
        const outputPath = path.join(outputDir, file);

        console.log(`[${i + 1}/${files.length}] Processing: ${file}`);

        try {
            const result = await detectImage(inputPath, settings);

            if (result.shouldBlur) {
                await applyBlur(inputPath, outputPath, settings.blurAmount);
                console.log(`  ✓ Blurred (${result.reason})\n`);
                results.blurred++;
            } else {
                fs.copyFileSync(inputPath, outputPath);
                console.log(`  ✓ Clean\n`);
                results.clean++;
            }
        } catch (error) {
            console.error(`  ✗ Error: ${error.message}\n`);
            results.errors++;
        }
    }

    // Print summary
    console.log("=".repeat(50));
    console.log("SUMMARY:");
    console.log(`Total processed: ${results.total}`);
    console.log(`Blurred: ${results.blurred}`);
    console.log(`Clean: ${results.clean}`);
    console.log(`Errors: ${results.errors}`);
    console.log("=".repeat(50));

    return results;
}

// Example usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log(
            "Usage: node batch-example.js <input-dir> <output-dir> [strictness]"
        );
        console.log("Example: node batch-example.js ./images ./processed 0.5");
        process.exit(1);
    }

    const [inputDir, outputDir, strictness] = args;

    if (!fs.existsSync(inputDir)) {
        console.error(`Error: Input directory not found: ${inputDir}`);
        process.exit(1);
    }

    processDirectory(inputDir, outputDir, {
        strictness: strictness ? parseFloat(strictness) : 0.5,
        blurAmount: 20,
    })
        .then((results) => {
            console.log("\n✓ Batch processing complete!");
            process.exit(results.errors > 0 ? 1 : 0);
        })
        .catch((error) => {
            console.error("Failed:", error);
            process.exit(1);
        });
}

module.exports = { processDirectory };
