# Face Detection Limitation in CLI

## Issue

The user reported that the extension blurs an image, but the CLI doesn't blur the same image, even though we claim the CLI uses "100% identical logic."

## Root Cause

The browser extension has **TWO types of detection**:

1. **NSFW Detection** - Detects pornographic/sexy/hentai content
2. **Face Detection** - Detects faces and blurs based on gender (male/female)

The CLI currently only implements **NSFW detection**, not face detection.

## User's Test Case

The user tested an image that produced these predictions:

```
Neutral: 99.87%
Sexy: 0.13%
Drawing: 0.00%
```

With strictness=0.5:

-   Sexy threshold = 0.3, probability = 0.0013, delta = -0.2987 (NSFW, negative)
-   Neutral threshold = 0.75, probability = 0.9987, delta = 0.2487 (SFW, positive)

**Result**: Highest NSFW delta (0) < Highest SFW delta (0.2487) → No blur

This is the CORRECT result for NSFW detection! The image is 99.87% Neutral, which means it's NOT NSFW content.

However, the extension DOES blur this image, which means:

-   The extension is blurring it due to **FACE DETECTION**, not NSFW detection
-   The image likely contains a face (probably female, since default settings are `blurFemale: true`)
-   The CLI doesn't implement face detection, so it doesn't blur it

## Why Face Detection Isn't Implemented

Face detection in the extension uses the [Human.js](https://github.com/vladmandic/human) library, which requires:

-   `@tensorflow/tfjs-node` for Node.js environments
-   Browser-specific APIs that don't work in Node.js

Attempts to install `@tensorflow/tfjs-node` fail with:

```
Error: TAR_BAD_ARCHIVE: Unrecognized archive format
```

The Human.js library loads differently in browser vs Node.js:

-   **Browser**: Loaded via `<script>` tag, sets `window.Human`
-   **Node.js**: Requires `@tensorflow/tfjs-node`, which we can't install

## Extension's Detection Flow

From `src/offscreen.js`:

```javascript
const runDetection = async (img, isVideo = false) => {
    // Step 1: NSFW Detection
    const nsfwResult = await detector.nsfwModelClassify(tensor);
    if (containsNsfw(nsfwResult, strictness)) {
        return "nsfw"; // Blur due to NSFW
    }

    // Step 2: Face Detection (if enabled)
    if (!settings.shouldDetectGender()) {
        return false; // Skip face detection
    }
    const predictions = await detector.humanModelClassify(tensor);
    if (containsGenderFace(predictions, detectMale, detectFemale)) {
        return "face"; // Blur due to face
    }

    return false; // Don't blur
};
```

## What Works vs What Doesn't

### ✅ Works Identically

-   **NSFW Detection**: 100% identical logic
    -   Same model files
    -   Same thresholds
    -   Same delta comparison
    -   Same predictions

### ❌ Not Implemented

-   **Face Detection**: Not available in CLI
    -   Gender-based face detection
    -   Age filtering (only blur faces >20 years old)
    -   Male/female detection options

## Solutions

### Option 1: Document the Limitation (Current approach)

-   Clearly state CLI only does NSFW detection
-   Explain why face detection isn't available
-   Guide users to test with NSFW images, not face images

### Option 2: Find a Workaround for Face Detection

Potential approaches:

1. Try to use Human.js browser version with jsdom or similar
2. Use a different face detection library that works in Node.js
3. Implement custom face detection using TensorFlow.js models directly
4. Wait for @tensorflow/tfjs-node installation issues to be resolved

### Option 3: CLI as NSFW-Only Tool

-   Accept that CLI is for NSFW detection only
-   Position it as a specialized tool for content moderation
-   Extension remains the full-featured option with both detections

## Current Status

**Chosen approach**: Option 1 + Option 3

-   CLI is documented as NSFW detection only
-   Clear limitations section in README
-   NSFW detection is 100% identical to extension
-   Face detection is a known limitation

## Testing Recommendations

To verify the CLI works correctly:

1. **Test with NSFW content** (not just faces):

    - Images with pornographic content
    - Sexually suggestive images
    - Hentai/anime content

2. **Test with different strictness levels**:

    ```bash
    node index.js image.jpg output.jpg --strictness=0.0  # Most strict
    node index.js image.jpg output.jpg --strictness=0.5  # Balanced
    node index.js image.jpg output.js --strictness=1.0  # Least strict
    ```

3. **Compare with extension on NSFW images**:
    - Disable face detection in extension settings (`blurMale: false, blurFemale: false`)
    - Test the same image in both extension and CLI
    - Results should be identical

## Future Work

If we want to add face detection:

1. Research alternative face detection libraries for Node.js
2. Investigate jsdom or similar for browser API emulation
3. Consider implementing a face detection model from scratch using TensorFlow.js
4. Monitor @tensorflow/tfjs-node for bug fixes

## Conclusion

The CLI implements 100% identical NSFW detection logic to the extension. The difference the user observed is because:

-   Their image is NOT NSFW content (99.87% Neutral)
-   The extension blurs it due to face detection (likely a female face)
-   The CLI doesn't implement face detection yet

This is a known limitation, not a bug in the NSFW detection logic.
