# Face Detection Implementation Blocker

## User Request

The user wants the CLI to include face detection exactly like the browser extension, specifically to blur female faces according to the extension's default settings (`blurFemale: true`).

## Technical Blocker

Face detection cannot be implemented in the current environment due to a dependency installation failure.

### Root Cause

1. **Extension's Face Detection**: Uses `@vladmandic/human` library
2. **Human.js Requirement**: Requires `@tensorflow/tfjs-node` to run in Node.js
3. **Installation Failure**: `@tensorflow/tfjs-node` installation fails with error:
   ```
   Error: TAR_BAD_ARCHIVE: Unrecognized archive format
   ```

### Attempts Made

#### Attempt 1: Install @tensorflow/tfjs-node directly
```bash
npm install @tensorflow/tfjs-node
```
**Result**: Failed with TAR_BAD_ARCHIVE error

#### Attempt 2: Use browser version of Human.js from tfjs/human.js
- Tried loading in vm context
- Issues encountered:
  - `Event` class not defined
  - `TextEncoder` not available
  - TensorFlow backend not properly initialized
  - Backend operations fail with "Cannot read properties of undefined (reading 'backend')"

#### Attempt 3: Setup global environment for Human.js
- Added all browser globals (Event, EventTarget, TextEncoder, etc.)
- Still failed with: `TypeError: this.util.TextEncoder is not a constructor`

#### Attempt 4: Use @vladmandic/human npm package
```javascript
const Human = require('@vladmandic/human');
```
**Result**: Fails because it automatically loads `human.node.js` which requires `@tensorflow/tfjs-node`

## Why @tensorflow/tfjs-node Fails

The TensorFlow.js Node.js backend needs to download and extract native binaries during installation. The error suggests:

1. Network issue downloading the libtensorflow archive
2. Corrupted download
3. Environment-specific issue with tar extraction
4. Possible firewall/proxy blocking the CDN

The specific error occurs when trying to extract:
```
https://storage.googleapis.com/tensorflow/libtensorflow/libtensorflow-cpu-linux-x86_64-2.9.1.tar.gz
```

## Impact

### What Works
- ✅ NSFW detection (100% identical to extension)
- ✅ All NSFW categories (Porn, Sexy, Hentai)
- ✅ Strictness configuration
- ✅ Blur amount configuration

### What Doesn't Work
- ❌ Face detection
- ❌ Gender-based blurring (male/female)
- ❌ Age filtering (>20 years)

## Potential Solutions

### Solution 1: Fix the Environment
**Try in a different environment where tfjs-node can install:**
- Local development machine
- Different CI/CD environment
- Docker container with pre-installed tfjs-node
- Different Node.js version

**Steps:**
```bash
# On a machine with proper network access
npm install @tensorflow/tfjs-node
# Verify it works
node -e "const tf = require('@tensorflow/tfjs-node'); console.log(tf.version)"
```

### Solution 2: Use Alternative Face Detection Library
**Replace Human.js with a Node.js-native face detection library:**

Options:
1. **face-api.js** - Similar to Human.js but with better Node.js support
2. **opencv4nodejs** - OpenCV bindings for Node.js
3. **@tensorflow-models/blazeface** - Google's face detection model

**Pros:**
- Would work in current environment
- Still provides face detection

**Cons:**
- Different from extension's behavior (not 100% identical)
- Different accuracy/performance characteristics
- Would need to adapt gender detection logic

### Solution 3: Create Hybrid Approach
**Use extension's offscreen.js as a service:**
- Run extension in headless Chrome
- CLI sends images to extension via Chrome DevTools Protocol
- Extension processes and returns results

**Pros:**
- 100% identical logic (literally uses extension code)
- Works around Node.js limitations

**Cons:**
- Complex setup
- Requires Chrome/Chromium
- Performance overhead

### Solution 4: Pre-built Native Binaries
**Manually download and configure tfjs-node binaries:**
```bash
# Download pre-built libtensorflow
wget https://storage.googleapis.com/tensorflow/libtensorflow/libtensorflow-cpu-linux-x86_64-2.9.1.tar.gz
# Extract to node_modules/@tensorflow/tfjs-node/deps
# Configure tfjs-node to use local binaries
```

This bypasses the npm installation step that's failing.

## Recommendation

**Immediate**: Document the limitation clearly and provide NSFW detection only

**Short-term**: Try Solution 1 (different environment) or Solution 4 (manual binaries)

**Long-term**: Consider Solution 2 (alternative library) if tfjs-node continues to be problematic

## Current Status

The CLI provides:
- ✅ **NSFW Detection**: 100% identical to extension
- ❌ **Face Detection**: Blocked by tfjs-node installation failure

Users who need face detection should:
1. Use the browser extension (which works perfectly)
2. Try running the CLI in an environment where tfjs-node installs successfully
3. Wait for a workaround implementation using an alternative library

## Testing Face Detection (When Fixed)

Once tfjs-node is available, the code would look like:

```javascript
const Human = require('@vladmandic/human').default;

const human = new Human({
    modelBasePath: "https://cdn.jsdelivr.net/npm/@vladmandic/human/models/",
    backend: "tensorflow",
    face: {
        enabled: true,
        detector: { modelPath: "blazeface.json" },
        description: { enabled: true, modelPath: "faceres.json" }
    }
});

await human.load();
const result = await human.detect(tensor);

// Check for faces
if (result.face && result.face.length > 0) {
    // Apply gender/age logic
}
```

This is exactly what the extension does, and would work identically once the dependency issues are resolved.
