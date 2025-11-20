/**
 * Example script showing how to use HaramBlur CLI programmatically
 */

const { detectImage, applyBlur } = require("./index.js");
const fs = require("fs");

async function processImage(inputPath, outputPath, options = {}) {
    const settings = {
        strictness: options.strictness || 0.5,
        blurAmount: options.blurAmount || 20,
    };

    try {
        console.log(`Processing: ${inputPath}`);

        // Detect inappropriate content
        const result = await detectImage(inputPath, settings);

        console.log("Detection result:", {
            shouldBlur: result.shouldBlur,
            reason: result.reason,
        });

        // Apply blur if needed
        if (result.shouldBlur) {
            await applyBlur(inputPath, outputPath, settings.blurAmount);
            console.log(`✓ Blurred image saved to: ${outputPath}`);
        } else {
            fs.copyFileSync(inputPath, outputPath);
            console.log(`✓ Clean image saved to: ${outputPath}`);
        }

        return result;
    } catch (error) {
        console.error("Error:", error.message);
        throw error;
    }
}

// Example usage
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log("Usage: node example.js <input> <output> [strictness]");
        console.log("Example: node example.js photo.jpg output.jpg 0.5");
        process.exit(1);
    }

    const [input, output, strictness] = args;

    processImage(input, output, {
        strictness: strictness ? parseFloat(strictness) : 0.5,
        blurAmount: 20,
    })
        .then(() => {
            console.log("\nDone!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("Failed:", error);
            process.exit(1);
        });
}

module.exports = { processImage };
