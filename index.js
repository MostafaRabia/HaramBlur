#!/usr/bin/env node

/**
 * HaramBlur CLI
 * Command-line tool to detect and blur inappropriate content in images
 * Usage: node index.js input.jpg output.jpg
 */

const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage, Canvas, Image } = require("canvas");

// Setup tf globals for browser compatibility
global.HTMLCanvasElement = Canvas;
global.HTMLImageElement = Image;
global.ImageData = Canvas.ImageData || function () {};

const tf = require("@tensorflow/tfjs");
const nsfwjs = require("nsfwjs");

const NSFW_CONFIG = {
    size: 224,
};

// Default settings from constants.js
const DEFAULT_SETTINGS = {
    status: true,
    blurAmount: 20,
    blurMale: false,
    blurFemale: true,
    strictness: 0.5,
};

const containsNsfw = (nsfwDetections, strictness = 0.5) => {
    if (!nsfwDetections?.length) return false;

    // nsfwjs returns: Porn, Sexy, Hentai, Neutral, Drawing
    // We consider Porn, Sexy, and Hentai as NSFW
    const nsfwCategories = ["Porn", "Sexy", "Hentai"];

    for (const prediction of nsfwDetections) {
        if (nsfwCategories.includes(prediction.className)) {
            // Adjust threshold based on strictness (0 = more strict, 1 = less strict)
            const threshold = 0.3 + strictness * 0.4; // ranges from 0.3 to 0.7
            if (prediction.probability > threshold) {
                return true;
            }
        }
    }

    return false;
};

class Detector {
    constructor() {
        this._nsfwModel = null;
    }

    async initNsfwModel() {
        console.log("Initializing NSFW model...");
        // Load from nsfwjs default (hosted model)
        // Note: For offline usage, you can implement a custom loader
        this._nsfwModel = await nsfwjs.load();
        console.log("NSFW model initialized");
    }

    async nsfwModelClassify(image) {
        if (!this._nsfwModel) await this.initNsfwModel();
        if (!image) return [];

        try {
            const predictions = await this._nsfwModel.classify(image);
            return predictions;
        } catch (error) {
            console.error("NSFW Detection Error:", error);
            throw error;
        }
    }
}

async function detectImage(imagePath, settings = DEFAULT_SETTINGS) {
    const detector = new Detector();

    // Load and initialize model
    await detector.initNsfwModel();

    // Load image
    console.log(`Loading image: ${imagePath}`);
    const image = await loadImage(imagePath);

    // Create canvas for image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    console.log("Running detection...");

    // Run NSFW detection
    const nsfwResult = await detector.nsfwModelClassify(canvas);
    console.log(
        "NSFW result:",
        nsfwResult
            .map((r) => `${r.className}: ${(r.probability * 100).toFixed(2)}%`)
            .join(", ")
    );

    const strictness = settings.strictness;
    if (containsNsfw(nsfwResult, strictness)) {
        return { shouldBlur: true, reason: "nsfw", predictions: nsfwResult };
    }

    return { shouldBlur: false, reason: "clear", predictions: nsfwResult };
}

async function applyBlur(inputPath, outputPath, blurAmount = 20) {
    const image = await loadImage(inputPath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Draw image
    ctx.drawImage(image, 0, 0);

    // Apply blur filter
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(image, 0, 0);

    // Save output
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(outputPath, buffer);
    console.log(`Blurred image saved to: ${outputPath}`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error(
            "Usage: node index.js <input-image> <output-image> [--strictness=0.5] [--blur-amount=20]"
        );
        console.error("\nOptions:");
        console.error(
            "  --strictness=N     Detection strictness (0-1, default: 0.5, lower=more strict)"
        );
        console.error(
            "  --blur-amount=N    Blur intensity in pixels (default: 20)"
        );
        console.error("\nExample:");
        console.error(
            "  node index.js input.jpg output.jpg --strictness=0.5 --blur-amount=20"
        );
        process.exit(1);
    }

    const inputPath = args[0];
    const outputPath = args[1];

    // Parse options
    const settings = { ...DEFAULT_SETTINGS };
    let blurAmount = 20;

    for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith("--strictness=")) {
            settings.strictness = parseFloat(arg.split("=")[1]);
        } else if (arg.startsWith("--blur-amount=")) {
            blurAmount = parseInt(arg.split("=")[1]);
        }
    }

    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    try {
        const result = await detectImage(inputPath, settings);

        console.log("\n=== Detection Result ===");
        console.log(`Should blur: ${result.shouldBlur}`);
        console.log(`Reason: ${result.reason}`);

        if (result.shouldBlur) {
            console.log("\nApplying blur...");
            await applyBlur(inputPath, outputPath, blurAmount);
        } else {
            console.log(
                "\nNo inappropriate content detected. Copying original image..."
            );
            fs.copyFileSync(inputPath, outputPath);
            console.log(`Image saved to: ${outputPath}`);
        }

        console.log("\n✓ Done!");
    } catch (error) {
        console.error("Error processing image:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { detectImage, applyBlur };
