#!/usr/bin/env node

/**
 * HaramBlur CLI
 * Command-line tool to detect and blur inappropriate content in images
 * Usage: node index.js input.jpg output.jpg
 */

const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage, Canvas, Image, ImageData } = require("canvas");
const { canvasRGBA } = require("stackblur-canvas");
const originalFetch = require("node-fetch");

// Patch fetch to handle file:// URLs
global.fetch = async (url, init) => {
    if (url && url.startsWith("file://")) {
        try {
            const filePath = url.replace("file://", "");
            const content = fs.readFileSync(filePath);
            return {
                ok: true,
                status: 200,
                json: async () => JSON.parse(content.toString()),
                arrayBuffer: async () =>
                    content.buffer.slice(
                        content.byteOffset,
                        content.byteOffset + content.byteLength
                    ),
                headers: { get: () => null },
            };
        } catch (e) {
            return { ok: false, status: 404, statusText: e.message };
        }
    }
    return originalFetch(url, init);
};

// Mock browser environment for Human browser build
global.window = global;
global.document = {
    createElement: (tag) => {
        if (tag === 'canvas') return new Canvas(100, 100);
        return {};
    },
    getElementById: () => null,
};
global.screen = { width: 1920, height: 1080 };
global.navigator = { userAgent: 'node' };
global.HTMLCanvasElement = Canvas;
global.HTMLImageElement = Image;
global.ImageData = ImageData;

// Use browser build to avoid tfjs-node dependency
// We will dynamically import the ESM build
let Human;

// We don't strictly need to set global.HTMLCanvasElement etc if we pass the canvas directly to Human,
// but it helps with some internal checks.
global.Canvas = Canvas;
global.Image = Image;
global.ImageData = ImageData;

const NSFW_CONFIG = {
    size: 224,
    tfScalar: 255,
    topK: 3,
};

// Default settings
const DEFAULT_SETTINGS = {
    status: true,
    blurAmount: 25,
    blurMale: false,
    blurFemale: true,
    strictness: 0.4,
};

// === Logic from detector.js ===

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

const genderPredicate = (gender, score, detectMale, detectFemale) => {
    const mPredicate =
        (gender === "male" && score > 0.3) ||
        (gender === "female" && score < 0.2);

    const fePredicate = gender === "female" && score > 0.25;

    if (detectMale && detectFemale) return mPredicate || fePredicate;

    if (detectMale && !detectFemale) {
        return mPredicate;
    }
    if (!detectMale && detectFemale) {
        return fePredicate;
    }

    return false;
};

const containsGenderFace = (detections, detectMale, detectFemale) => {
    if (!detections?.face?.length) {
        return false;
    }

    const faces = detections.face;
    if (detectMale || detectFemale)
        return faces.some(
            (face) =>
                face.age > 20 &&
                genderPredicate(
                    face.gender,
                    face.genderScore,
                    detectMale,
                    detectFemale
                )
        );
    else return false;
};

// === Detector Class ===

class Detector {
    constructor() {
        this._human = null;
        this._nsfwModel = null;
    }

    async initHuman() {
        if (this._human) return;

        if (!Human) {
            console.log("Importing Human ESM...");
            const module = await import(path.join(__dirname, "node_modules/@vladmandic/human/dist/human.esm.js"));
            Human = module.Human || module.default;
        }

        console.log("Initializing Human...");

        const config = {
            // Use local models from node_modules
            modelBasePath: "file://" + path.join(__dirname, "node_modules/@vladmandic/human/models/"),
            backend: "cpu", // Use cpu backend
            debug: false,
            cacheSensitivity: 0,
            filter: { enabled: false },
            face: {
                enabled: true,
                iris: { enabled: false },
                mesh: { enabled: false },
                emotion: { enabled: false },
                detector: {
                    modelPath: "blazeface.json",
                    maxDetected: 5, // Increased from 2 to catch more
                    minConfidence: 0.25,
                },
                description: {
                    enabled: true,
                    modelPath: "faceres.json",
                },
            },
            body: { enabled: false },
            hand: { enabled: false },
            object: { enabled: false },
            gesture: { enabled: false },
        };

        this._human = new Human(config);
        await this._human.load();
        console.log("Human initialized");
    }

    async initNsfwModel() {
        if (this._nsfwModel) return;
        if (!this._human) await this.initHuman();

        console.log("Initializing NSFW model...");
        const tf = this._human.tf;
        const modelPath = "file://" + path.join(__dirname, "src/assets/models/nsfwjs/model.json");

        // Check if model exists
        if (!fs.existsSync(path.join(__dirname, "src/assets/models/nsfwjs/model.json"))) {
            throw new Error(`NSFW model not found at ${modelPath}`);
        }

        this._nsfwModel = await tf.loadGraphModel(modelPath);
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
        if (!this._human) await this.initHuman();
        if (!this._nsfwModel) await this.initNsfwModel();

        const tf = this._human.tf;
        if (!tensor) return [];

        let resized, expanded;
        try {
            // Cast to float32 as some ops require it
            const floatTensor = tf.cast(tensor, 'float32');

            // if size is not 224, resize the image
            if (
                floatTensor.shape[1] !== config.size ||
                floatTensor.shape[2] !== config.size
            ) {
                resized = tf.image.resizeNearestNeighbor(floatTensor, [
                    config.size,
                    config.size,
                ]);
            }
            // if 3d tensor, add a dimension
            if (
                (resized && resized.shape.length === 3) ||
                floatTensor.shape.length === 3
            ) {
                expanded = tf.expandDims(resized || floatTensor, 0);
            }
            const scalar = tf.scalar(config.tfScalar);
            const normalized = tf.div(expanded || resized || floatTensor, scalar);
            const logits = await this._nsfwModel.predict(normalized);

            const predictions = await this.getTopKClasses(logits, config.topK);

            tf.dispose(
                [scalar, normalized, logits, floatTensor]
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

// === Main Logic ===

async function detectImage(imagePath, settings = DEFAULT_SETTINGS) {
    const detector = new Detector();

    // Load and initialize models
    await detector.initHuman();
    await detector.initNsfwModel();

    // Load image
    console.log(`Loading image: ${imagePath}`);
    const image = await loadImage(imagePath);

    // Create canvas for image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    console.log("Running detection...");

    // 1. NSFW Detection
    // Convert to tensor using Human's tf
    const tf = detector._human.tf;
    const tensor = tf.browser.fromPixels(canvas);

    const nsfwResult = await detector.nsfwModelClassify(tensor);
    console.log(
        "NSFW result:",
        nsfwResult
            .map((r) => `${r.className}: ${(r.probability * 100).toFixed(2)}%`)
            .join(", ")
    );

    const strictness = settings.strictness;
    const isNsfw = containsNsfw(nsfwResult, strictness);

    if (isNsfw) {
        tf.dispose(tensor);
        return { shouldBlur: true, reason: "nsfw", predictions: nsfwResult };
    }

    // 2. Face Detection (with Gender)
    const shouldDetectFaces = settings.blurMale || settings.blurFemale;
    if (!shouldDetectFaces) {
        tf.dispose(tensor);
        return { shouldBlur: false, reason: "clear", predictions: nsfwResult };
    }

    console.log("Running face detection...");
    // Human.detect can take the tensor or canvas. 
    // Since we have the tensor, we can use it, but Human might expect image/canvas for best results with its internal processing.
    // Let's pass the tensor.
    const humanResult = await detector._human.detect(tensor);

    console.log(`Face detection result: ${humanResult.face.length} face(s) detected`);
    if (humanResult.face.length > 0) {
        humanResult.face.forEach((face, i) => {
            console.log(`  Face ${i + 1}: Gender=${face.gender} (${(face.genderScore * 100).toFixed(1)}%), Age=${face.age.toFixed(1)}`);
        });
    }

    const facesToBlur = [];
    if (humanResult.face.length > 0) {
        humanResult.face.forEach((face) => {
            if (genderPredicate(face.gender, face.genderScore, settings.blurMale, settings.blurFemale)) {
                facesToBlur.push(face.box); // [x, y, width, height]
            }
        });
    }

    tf.dispose(tensor);

    if (facesToBlur.length > 0) {
        return {
            shouldBlur: true,
            reason: "face",
            predictions: nsfwResult,
            faces: humanResult.face,
            regions: facesToBlur,
        };
    }

    return { shouldBlur: false, reason: "clear", predictions: nsfwResult };
}

async function applyBlur(inputPath, outputPath, blurAmount = 25, regions = []) {
    const image = await loadImage(inputPath);

    // Create canvas with image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    if (regions && regions.length > 0) {
        // Blur specific regions (with expansion and grayscale)
        regions.forEach((box) => {
            // box is [x, y, width, height]
            // Expand the region asymmetrically - more vertical for full body coverage
            const widthExpansionFactor = 1.8;  // Less horizontal expansion
            const heightExpansionFactor = 3.5; // More vertical expansion for full body

            const originalX = box[0];
            const originalY = box[1];
            const originalW = box[2];
            const originalH = box[3];

            const expandedW = originalW * widthExpansionFactor;
            const expandedH = originalH * heightExpansionFactor;

            // Asymmetric vertical expansion: 20% upward, 80% downward
            const expandedX = originalX - (expandedW - originalW) / 2;  // Centered horizontally
            const expandedY = originalY - (expandedH - originalH) * 0.2; // 20% expansion upward

            // Ensure coordinates are within bounds
            const x = Math.max(0, Math.floor(expandedX));
            const y = Math.max(0, Math.floor(expandedY));
            const w = Math.min(image.width - x, Math.floor(expandedW));
            const h = Math.min(image.height - y, Math.floor(expandedH));

            if (w > 0 && h > 0) {
                console.log(`Blurring expanded region: x=${x}, y=${y}, w=${w}, h=${h} (original: ${Math.floor(originalW)}x${Math.floor(originalH)})`);

                // Get the image data for this region
                const imageData = ctx.getImageData(x, y, w, h);
                const data = imageData.data;

                // Apply grayscale to the region
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    data[i] = gray;     // R
                    data[i + 1] = gray; // G
                    data[i + 2] = gray; // B
                    // data[i + 3] is alpha, leave unchanged
                }

                // Put the grayscale data back
                ctx.putImageData(imageData, x, y);

                // Apply blur to the region
                canvasRGBA(canvas, x, y, w, h, blurAmount);
            }
        });
    } else {
        // Full blur (fallback or for NSFW)
        console.log("Applying full image blur with grayscale");

        // Apply grayscale to entire image
        const imageData = ctx.getImageData(0, 0, image.width, image.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);

        // Apply blur
        canvasRGBA(canvas, 0, 0, image.width, image.height, blurAmount);
    }

    // Save output
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
            "Usage: node index.js <input-image> <output-image> [options]"
        );
        console.error("\nOptions:");
        console.error("  --strictness=N     Detection strictness (0-1, default: 0.5)");
        console.error("  --blur-amount=N    Blur intensity in pixels (default: 25)");
        console.error("  --blur-male=B      Blur males (true/false, default: false)");
        console.error("  --blur-female=B    Blur females (true/false, default: true)");
        process.exit(1);
    }

    const inputPath = args[0];
    const outputPath = args[1];

    // Parse options
    const settings = { ...DEFAULT_SETTINGS };
    let blurAmount = 25; // Matching extension default (25%)

    for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith("--strictness=")) {
            settings.strictness = parseFloat(arg.split("=")[1]);
        } else if (arg.startsWith("--blur-amount=")) {
            blurAmount = parseInt(arg.split("=")[1]);
        } else if (arg.startsWith("--blur-male=")) {
            settings.blurMale = arg.split("=")[1] === "true";
        } else if (arg.startsWith("--blur-female=")) {
            settings.blurFemale = arg.split("=")[1] === "true";
        }
    }

    console.log("Settings:", JSON.stringify(settings, null, 2));

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
            // If reason is NSFW, we might want full blur, but for now let's stick to regions if available
            // If it's NSFW but no faces, regions will be undefined/empty, so applyBlur will do full blur.
            // If it's face, regions will be populated.
            await applyBlur(inputPath, outputPath, blurAmount, result.regions);
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
