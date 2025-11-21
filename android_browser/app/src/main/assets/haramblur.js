(function () {
    console.log("HaramBlur: Injection started");

    // Configuration
    const CONFIG = {
        blurAmount: 25,
        isGray: true,
        modelUrl: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/', // Load models from CDN
        humanConfig: {
            backend: 'webgl',
            modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
            face: { enabled: true, detector: { rotation: false }, iris: { enabled: false }, description: { enabled: false }, emotion: { enabled: false } },
            body: { enabled: false },
            hand: { enabled: false },
            object: { enabled: false },
            gesture: { enabled: false },
            filter: { enabled: false }
        }
    };

    // Helper to load script dynamically
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${url}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Helper to create blurred base64 image (Extension Logic)
    async function createBlurredImage(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');

        // Draw original image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Apply Blur and Grayscale using Canvas (since we need to generate base64)
        // Note: The extension uses CSS for visual blur, but to replace src with base64 
        // that LOOKS blurred, we need to actually blur the canvas data.
        // Since we don't have the extension's CSS filter available in the canvas context directly,
        // we will use a simple box blur or stackblur if available. 
        // For simplicity and performance in this injection, we'll use a low-res scale approach + CSS on the element.

        // Actually, to match extension exactly:
        // Extension applies CSS filter: blur(25px) grayscale(100%)
        // AND replaces src with base64.
        // The base64 in the extension seems to be the RESULT of the blur?
        // Or does it just replace src to avoid hotlinking/tracking?
        // The user said "Extension replaces img.src with blurred base64".

        // Let's try to approximate the canvas blur.
        ctx.filter = `blur(${CONFIG.blurAmount}px) ${CONFIG.isGray ? 'grayscale(100%)' : ''}`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.8);
    }

    // Main Logic
    async function init() {
        try {
            // Load Human Library
            if (typeof human === 'undefined') {
                console.log("HaramBlur: Loading Human library...");
                await loadScript('https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js');
            }

            const humanInstance = new Human.Human(CONFIG.humanConfig);
            console.log("HaramBlur: Human library loaded. Warming up...");
            await humanInstance.warmup();
            console.log("HaramBlur: Ready!");

            // Process existing images
            processImages(humanInstance);

            // Observe for new images
            const observer = new MutationObserver((mutations) => {
                processImages(humanInstance);
            });
            observer.observe(document.body, { childList: true, subtree: true });

        } catch (e) {
            console.error("HaramBlur: Initialization failed", e);
        }
    }

    async function processImages(human) {
        const images = document.querySelectorAll('img:not([data-hb-processed])');
        for (const img of images) {
            // Mark as processed to avoid loops
            img.dataset.hbProcessed = "true";

            // Skip small images
            if (img.width < 50 || img.height < 50) continue;

            try {
                // Detect
                const result = await human.detect(img);

                // Check for Face
                if (result.face && result.face.length > 0) {
                    console.log("HaramBlur: Face detected", img.src);
                    applyBlur(img);
                }
            } catch (err) {
                console.error("HaramBlur: Detection error", err);
            }
        }
    }

    async function applyBlur(img) {
        try {
            // 1. Apply CSS immediately for instant feedback
            img.style.filter = `blur(${CONFIG.blurAmount}px) ${CONFIG.isGray ? 'grayscale(100%)' : ''}`;
            img.style.transition = 'filter 0.2s';

            // 2. Generate Base64 replacement (Optional but requested to match extension)
            // This might be heavy on mobile, so we can stick to CSS for now unless user insists.
            // User said: "Extension replaces src with base64".
            // Let's do it.

            const originalSrc = img.src;
            const blurredBase64 = await createBlurredImage(img);

            img.dataset.hbOriginalSrc = originalSrc;
            img.src = blurredBase64;
            img.dataset.hbReplaced = "true";

            // Keep CSS filter as backup/enhancement
            img.style.filter = `blur(${CONFIG.blurAmount}px) ${CONFIG.isGray ? 'grayscale(100%)' : ''}`;

        } catch (e) {
            console.error("HaramBlur: Blur application failed", e);
        }
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
