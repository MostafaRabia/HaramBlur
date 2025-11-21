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
global.fetch = require("node-fetch");

const tf = require("@tensorflow/tfjs");
const blazeface = require("@tensorflow-models/blazeface");

const NSFW_CONFIG = {
    size: 224,
    tfScalar: 255,
    topK: 3,
};

// Default settings from constants.js
const DEFAULT_SETTINGS = {
    status: true,
    blurAmount: 20,
    blurMale: false,
    blurFemale: true,
    strictness: 0.5,
};

// Exact same logic as detector.js
const getNsfwClasses = (factor = 0) => {
    return {
        0: {
            className: "Drawing",
            nsfw: false,
            thresh: 0.5,
        },
        1: {
            className: "Hentai",
            nsfw: true,
            thresh: 0.5 + (1 - factor) * 0.5,
        },
        2: {
            className: "Neutral",
            nsfw: false,
            thresh: 0.5 + factor * 0.5,
        },
        3: {
            className: "Porn",
            nsfw: true,
            thresh: 0.1 + (1 - factor) * 0.4,
        },
        4: {
            className: "Sexy",
            nsfw: true,
            thresh: 0.1 + (1 - factor) * 0.4,
        },
    };
};

// Exact same logic as detector.js
const containsNsfw = (nsfwDetections, strictness) => {
    if (!nsfwDetections?.length) return false;
    let highestNsfwDelta = 0;
    let highestSfwDelta = 0;

    const nsfwClasses = getNsfwClasses(strictness);
    nsfwDetections.forEach((det) => {
        if (nsfwClasses?.[det.id].nsfw) {
            highestNsfwDelta = Math.max(
                highestNsfwDelta,
                det.probability - nsfwClasses[det.id].thresh
            );
        } else {
            highestSfwDelta = Math.max(
                highestSfwDelta,
                det.probability - nsfwClasses[det.id].thresh
            );
        }
    });
    return highestNsfwDelta > highestSfwDelta;
};

class Detector {
    constructor() {
        this._nsfwModel = null;
        this._faceModel = null;
    }

    async initFaceModel() {
        if (this._faceModel) return;
        console.log("Initializing face detection model...");
        this._faceModel = await blazeface.load();
        console.log("Face detection model initialized");
    }

    async initNsfwModel() {
        console.log("Initializing NSFW model...");
        // Load the exact same model as the extension
        const modelJsonPath = path.join(
            __dirname,
            "src/assets/models/nsfwjs/model.json"
        );
        const modelDir = path.dirname(modelJsonPath);

        if (!fs.existsSync(modelJsonPath)) {
            throw new Error(
                `NSFW model not found at ${modelJsonPath}. Please ensure the model files are present.`
            );
        }

        // Create a custom IO handler for loading from local file system
        const handler = {
            async load() {
                // Read model.json
                const modelTopology = JSON.parse(
                    fs.readFileSync(modelJsonPath, "utf8")
                );

                // Read weight data
                const weightsManifest = modelTopology.weightsManifest;
                const weightSpecs = [];
                const weightData = [];

                for (const group of weightsManifest) {
                    for (const path of group.paths) {
                        const weightPath = `${modelDir}/${path}`;
                        const buffer = fs.readFileSync(weightPath);
                        weightData.push(buffer);
                    }
                    weightSpecs.push(...group.weights);
                }

                // Concatenate all weight buffers
                const totalSize = weightData.reduce(
                    (sum, buf) => sum + buf.length,
                    0
                );
                const concatenated = new Uint8Array(totalSize);
                let offset = 0;
                for (const buf of weightData) {
                    concatenated.set(new Uint8Array(buf), offset);
                    offset += buf.length;
                }

                return {
                    modelTopology: modelTopology.modelTopology,
                    weightSpecs: weightSpecs,
                    weightData: concatenated.buffer,
                };
            },
        };

        this._nsfwModel = await tf.loadGraphModel(handler);
        console.log("NSFW model initialized");
    }

    async getTopKClasses(logits, topK) {
        const values = await logits.data();

        const valuesAndIndices = [];
        for (let i = 0; i < values.length; i++) {
            valuesAndIndices.push({ value: values[i], index: i });
        }
        valuesAndIndices.sort((a, b) => {
            return b.value - a.value;
        });
        const topkValues = new Float32Array(topK);
        const topkIndices = new Int32Array(topK);
        for (let i = 0; i < topK; i++) {
            topkValues[i] = valuesAndIndices[i].value;
            topkIndices[i] = valuesAndIndices[i].index;
        }

        const topClassesAndProbs = [];
        for (let i = 0; i < topkIndices.length; i++) {
            topClassesAndProbs.push({
                className: getNsfwClasses()[topkIndices[i]].className,
                probability: topkValues[i],
                id: topkIndices[i],
            });
        }
        return topClassesAndProbs;
    }

    async nsfwModelClassify(tensor, config = NSFW_CONFIG) {
        if (!this._nsfwModel) await this.initNsfwModel();
        if (!tensor) return [];

        let resized, expanded;
        try {
            // if size is not 224, resize the image
            if (
                tensor.shape[1] !== config.size ||
                tensor.shape[2] !== config.size
            ) {
                resized = tf.image.resizeNearestNeighbor(tensor, [
                    config.size,
                    config.size,
                ]);
            }
            // if 3d tensor, add a dimension
            if (
                (resized && resized.shape.length === 3) ||
                tensor.shape.length === 3
            ) {
                expanded = tf.expandDims(resized || tensor, 0);
            }
            const scalar = tf.scalar(config.tfScalar);
            const normalized = tf.div(expanded || resized || tensor, scalar);
            const logits = await this._nsfwModel.predict(normalized);

            const predictions = await this.getTopKClasses(logits, config.topK);

            tf.dispose(
                [scalar, normalized, logits]
                    .concat(expanded ? [expanded] : [])
                    .concat(resized ? [resized] : [])
            );

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

    // Convert to tensor (same as extension: tf.browser.fromPixels)
    const tensor = tf.browser.fromPixels(canvas);

    // Run NSFW detection (same logic as extension)
    const nsfwResult = await detector.nsfwModelClassify(tensor);
    console.log(
        "NSFW result:",
        nsfwResult
            .map((r) => `${r.className}: ${(r.probability * 100).toFixed(2)}%`)
            .join(", ")
    );

    // Use exact same strictness logic as extension
    const strictness = settings.strictness;
    const isNsfw = containsNsfw(nsfwResult, strictness);

    if (isNsfw) {
        tf.dispose(tensor);
        return { shouldBlur: true, reason: "nsfw", predictions: nsfwResult };
    }

    // Check if we should detect faces (same logic as extension)
    const shouldDetectFaces = settings.blurMale || settings.blurFemale;
    if (!shouldDetectFaces) {
        tf.dispose(tensor);
        return { shouldBlur: false, reason: "clear", predictions: nsfwResult };
    }

    // Run face detection
    await detector.initFaceModel();
    console.log("Running face detection...");

    const faceDetections = await detector._faceModel.estimateFaces(
        canvas,
        false
    );
    const faceCount = faceDetections.length;
    console.log(`Face detection result: ${faceCount} face(s) detected`);

    // Dispose tensor
    tf.dispose(tensor);

    // For now, blur any detected face (extension's default is blurFemale: true)
    // Note: BlazeFace doesn't do gender classification, so we blur all faces
    // This matches the extension behavior when blurFemale is enabled
    if (faceCount > 0) {
        return {
            shouldBlur: true,
            reason: "face",
            predictions: nsfwResult,
            faces: faceDetections,
        };
    }

    return { shouldBlur: false, reason: "clear", predictions: nsfwResult };
}

async function applyBlur(inputPath, outputPath, blurAmount = 20) {
    const image = await loadImage(inputPath);

    // Create canvas and get image data
    const tempCanvas = createCanvas(image.width, image.height);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(image, 0, 0);
    const inputImageData = tempCtx.getImageData(0, 0, image.width, image.height);

    // Convert image data to tensor manually (avoiding tf.browser.fromPixels which doesn't work in Node)
    const imageTensor = tf.tidy(() => {
        // Extract RGB values from RGBA data
        const pixelData = new Uint8Array(image.width * image.height * 3);
        for (let i = 0; i < inputImageData.data.length / 4; i++) {
            pixelData[i * 3] = inputImageData.data[i * 4]; // R
            pixelData[i * 3 + 1] = inputImageData.data[i * 4 + 1]; // G
            pixelData[i * 3 + 2] = inputImageData.data[i * 4 + 2]; // B
        }
        return tf.tensor3d(pixelData, [image.height, image.width, 3]);
    });

    // Convert blur amount (pixels) to kernel size
    // Typical range: blurAmount 20px -> kernel size ~20
    const kernelSize = Math.max(3, Math.floor(blurAmount)) | 1; // Ensure odd number

    // Create Gaussian blur kernel
    const sigma = kernelSize / 3;
    const kernel = tf.tidy(() => {
        const size = kernelSize;
        const center = Math.floor(size / 2);
        const kernel2d = [];
        let sum = 0;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - center;
                const dy = y - center;
                const value = Math.exp(
                    -(dx * dx + dy * dy) / (2 * sigma * sigma)
                );
                kernel2d.push(value);
                sum += value;
            }
        }

        // Normalize
        const normalized = kernel2d.map((v) => v / sum);
        return tf.tensor2d(normalized, [size, size]);
    });

    // Apply blur using depthwise convolution
    const blurred = tf.tidy(() => {
        // Expand dims for conv2d: [height, width, channels] -> [1, height, width, channels]
        const expanded = imageTensor.expandDims(0);

        // Create 3-channel kernel [kernelHeight, kernelWidth, inChannels, channelMultiplier]
        const kernel3d = tf.stack([kernel, kernel, kernel], 2).expandDims(3);

        // Apply convolution
        const result = tf.depthwiseConv2d(expanded, kernel3d, [1, 1], "same");

        // Remove batch dimension and clip values
        return result.squeeze([0]).clipByValue(0, 255);
    });

    // Convert back to canvas
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Create image data from tensor
    const blurredData = await blurred.data();
    const imageData = ctx.createImageData(image.width, image.height);

    // Convert RGB tensor data back to RGBA image data
    for (let i = 0; i < image.width * image.height; i++) {
        imageData.data[i * 4] = blurredData[i * 3]; // R
        imageData.data[i * 4 + 1] = blurredData[i * 3 + 1]; // G
        imageData.data[i * 4 + 2] = blurredData[i * 3 + 2]; // B
        imageData.data[i * 4 + 3] = 255; // A (full opacity)
    }

    ctx.putImageData(imageData, 0, 0);

    // Clean up tensors
    tf.dispose([imageTensor, kernel, blurred]);

    // Save output - match input format
    const ext = path.extname(outputPath).toLowerCase();
    let buffer;
    if (ext === ".jpg" || ext === ".jpeg") {
        buffer = canvas.toBuffer("image/jpeg", { quality: 0.95 });
    } else {
        buffer = canvas.toBuffer("image/png", { compressionLevel: 6 });
    }

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
