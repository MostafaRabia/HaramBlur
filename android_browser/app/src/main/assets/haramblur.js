(function () {
    console.log("HaramBlur: Injection started");

    // Configuration
    const CONFIG = {
        blurAmount: 25,
        isGray: true,
        // We are injecting human.js directly, so we don't need to load it from URL.
        // But we still need to point to models.
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

    // Helper to create blurred base64 image
    async function createBlurredImage(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Apply approximate blur
        ctx.filter = `blur(${CONFIG.blurAmount}px) ${CONFIG.isGray ? 'grayscale(100%)' : ''}`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.8);
    }

    // Main Logic
    async function init() {
        try {
            // Check if Human is loaded (it should be injected before this script)
            if (typeof Human === 'undefined' && typeof human === 'undefined') {
                console.error("HaramBlur: Human library NOT found!");
                return;
            }

            console.log("HaramBlur: Initializing Human...");
            // Initialize Human
            const humanInstance = new Human.Human(CONFIG.humanConfig);

            console.log("HaramBlur: Warming up...");
            await humanInstance.warmup();
            console.log("HaramBlur: Ready and Listening!");

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
            img.dataset.hbProcessed = "true";

            if (img.width < 50 || img.height < 50) continue;

            // Mark as processing
            console.log("HaramBlur: Processing", img.src);

            try {
                const result = await human.detect(img);
                if (result.face && result.face.length > 0) {
                    console.log("HaramBlur: Face detected!", img.src);
                    applyBlur(img);
                }
            } catch (err) {
                console.error("HaramBlur: Detection error", err);
            }
        }
    }

    async function applyBlur(img) {
        try {
            // CSS Blur
            img.style.filter = `blur(${CONFIG.blurAmount}px) ${CONFIG.isGray ? 'grayscale(100%)' : ''}`;
            img.style.transition = 'filter 0.2s';

            // Base64 Replacement
            const originalSrc = img.src;
            const blurredBase64 = await createBlurredImage(img);

            img.dataset.hbOriginalSrc = originalSrc;
            img.src = blurredBase64;
            img.dataset.hbReplaced = "true";

            // Keep CSS
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
