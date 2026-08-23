/**
 * Visual3D — Photorealistic 3D Visual & Atmospheric System for simTrafficFlow
 * Modeled and optimized after "夜景參考.html" for cinema-grade night visual effects.
 * Compatible with Three.js r147 (PBR Materials, EffectComposer Bloom, Shader Injections, InstancedMesh Batching)
 * 
 * Features:
 * - Post-Processing Pipeline: HalfFloat EffectComposer + UnrealBloomPass + VignettePass
 * - Atmospheric Cosmic Sky: Deep midnight navy Rayleigh/Mie dome, luminous Moon with Corona, Twinkling Star Field
 * - Vehicle Fleet: Clearcoat PBR paint, Headlight Lens-Flare Glare Sprites, Dynamic Forward Ground Pools, High-Dynamic Brake Taillights
 * - Street Infrastructure: Warm glowing streetlamps with lens-flare sprites, exponential radial ground light pools, soft volumetric cones
 * - Architectural City Skyline: Procedural Facades with multi-color lit windows, illuminated ground-floor storefronts, glowing neon signs, rooftop aviation beacons
 * - 3D Traffic Signal Lights: Additive blooming signal glow sprites for Red/Yellow/Green phases
 * - Multi-scale procedural PBR Asphalt, Concrete & Grass with World-UV projection
 * - Real-time animation system for clouds, water waves, and vehicle light dynamics
 */
(function (global) {
    'use strict';

    const Visual3D = {
        enabled: true,
        version: '3.0.0',
        state: {
            scene: null,
            renderer: null,
            camera: null,
            composer: null,
            bloomPass: null,
            vignettePass: null,
            sunDir: null,
            moonDir: null,
            sunLight: null,
            moonLight: null,
            ambientLight: null,
            hemiLight: null,
            fillLight: null,
            sky: null,
            skyMat: null,
            ground: null,
            dayEnvMap: null,
            nightEnvMap: null,
            clouds: null,
            starPoints: null,
            starMat: null,
            moonSprite: null,
            waterMeshes: [],
            animatedProps: [],
            elapsedTime: 0,
            cloudDrift: 0,
            isNight: false,
            nightFactor: 0.0,
            targetNightFactor: 0.0,
            lampPools: [],
            lampCones: [],
            lampGlowMats: [],
            lampGlowSprites: [],
            buildingMats: [],
            pedestrianMats: [],
            vehicleLightGroups: [],
            signalGlows: [],
            lampHeads: [],
            lampLightPool: [],
            headLightPool: [],
            headFillPool: [],
            brakeLightPool: [],
            dynLightsReady: false,
            dynLightsEnabled: false,
            dynScanTimer: 0.0,
            dynQuality: 2,
            dynFpsEma: 0.0,
            dynQCheckAt: -1,
            dynQLastChange: -99
        }
    };

    // Global texture and material caches
    const CACHE = {};
    const PAINT_CACHE = new Map();

    // =========================================================================
    // Pooled Dynamic Real-Light Configuration (路燈/車燈實際照亮周圍物件)
    // physicallyCorrectLights = true → intensity 單位為燭光 (candela)
    // 經柔和校準：路燈與車燈投射舒適光源，物件清晰可辨、完全不刺眼
    // =========================================================================
    const DYN_LIGHT_CFG = {
        // 路燈：PointLight 柔和溫潤照射 (550 cd，半徑 28m)，自然覆蓋人行道與斑馬線
        lamp:      { count: 8, color: 0xffd2a8, intensity: 550,  distance: 28, decay: 2.0, maxRangeSq: 280 * 280 },
        // 車頭燈：瞄準前方 0.85m 高度（車身與行人軀幹），投射真實車燈光束 (850 cd，半徑 32m)
        headlight: { count: 6, color: 0xfffae8, intensity: 850,  distance: 32, angle: 0.76, penumbra: 0.50, decay: 2.0, maxRangeSq: 280 * 280 },
        // 近場補光：車頭前方短距柔光
        headFill:  { count: 6, color: 0xfff0d8, intensity: 180,  distance: 12, decay: 2.0, maxRangeSq: 280 * 280 },
        brake:     { count: 3, color: 0xff2010, intensity: 35,   distance: 6,  decay: 2.0, maxRangeSq: 180 * 180 },
        scanInterval: 0.28,
        posLerpSpeed: 11.0,
        intensityLerpSpeed: 6.0,
        beamReach: 15,
        beamTargetY: 0.85,
        fillForward: 2.6,
        // 自動品質調節：依實際 FPS 增減作用中的光源槽位
        quality: {
            levels: [
                { lamp: 5, headlight: 3, brake: 0 },   // low — 效能不佳時
                { lamp: 7, headlight: 5, brake: 2 },   // medium
                { lamp: 8, headlight: 6, brake: 3 }    // high — 預設
            ],
            downMs: 27.0,   // 平均帧時間高於此值 → 降級 (~37fps)
            upMs: 20.0,     // 平均帧時間低於此值 → 升級 (~50fps)
            checkEverySec: 2.0,
            dwellSec: 6.0   // 兩次升降級之間最短間隔，避免震盪
        }
    };

    // 夜間整體曝光／環境光（微亮舒適的都市夜景，建築、道路、樹木、車輛與行人清晰可見）
    const NIGHT_LOOK = {
        ambientColor: 0x5a524a,
        ambientIntensity: 0.58,
        hemiSky: 0x48586c,
        hemiGround: 0x2e2c28,
        hemiIntensity: 0.65,
        moonColor: 0xa8c0dc,
        moonIntensity: 0.55,
        fillColor: 0x423e3a,
        fillIntensity: 0.28,
        exposure: 1.18,
        bloomStrength: 0.20,
        bloomThreshold: 0.90,
        bloomRadius: 0.35,
        vignetteDarkness: 0.22,
        vignetteOffset: 1.15,
        fogNear: 500,
        fogFar: 9800,
        horizon: 0x181c24
    };

    // =========================================================================
    // 1. Color Palettes & Texture Helpers
    // =========================================================================
    const URBAN_COLORS = [
        0xe6e4df, 0xdcd8d0, 0xc8c3b9, 0xb0b7bd, 0x9ca5ac,
        0xc9bea8, 0xd6cab7, 0xbbc4cb, 0x8a959f, 0xcfc8bd,
        0xafb8b2, 0xe2dbcf, 0x9a8e81, 0xb2aa9e, 0x7c868f,
        0xd1c9bc, 0xb0bac2, 0xd6d1c8, 0x8b847b, 0xc0c8c6
    ];

    const VEHICLE_COLORS = [
        // Pure & Pearl Whites
        0xffffff, 0xf8fafc, 0xf1f5f9, 0xe2e8f0,
        // Metallic Silvers & Platinum
        0xd1d5db, 0xc5cbd3, 0x9ca3af, 0xb0b8c2,
        // Vibrant Blues & Sky / Electric Blues
        0x2563eb, 0x3b82f6, 0x0284c7, 0x0ea5e9, 0x1d4ed8, 0x38bdf8,
        // Radiant Sports Reds & Crimson
        0xef4444, 0xdc2626, 0xf43f5e, 0xe11d48, 0xb91c1c,
        // Sunny Taxis, Yellows & Warm Ambers
        0xfbbf24, 0xf59e0b, 0xfacc15, 0xd97706,
        // Dynamic Sports Orange
        0xf97316, 0xea580c,
        // Emerald & Fresh Greens
        0x10b981, 0x059669, 0x16a34a, 0x22c55e,
        // Elegant Champagne, Rose Gold & Warm Titanium
        0xd4b483, 0xcab07e, 0xbea472,
        // Modern Charcoal & Deep Blue-Grey
        0x475569, 0x334155, 0x1e3a8a
    ];

    const FOLIAGE_COLORS = [
        0x387a2b, 0x489435, 0x2e6622, 0x54a83c, 0x2b5e20,
        0x5fb844, 0x6ac44d, 0x3d822d, 0x4d9c38, 0x337225
    ];

    function hexColor(n) {
        return new THREE.Color(n);
    }

    function pickVehicleColor() {
        const hex = VEHICLE_COLORS[(Math.random() * VEHICLE_COLORS.length) | 0];
        return new THREE.Color(hex);
    }

    function getAnisotropy(renderer) {
        try {
            return Math.min(16, renderer.capabilities.getMaxAnisotropy());
        } catch (e) {
            return 4;
        }
    }

    function hash2(x, y) {
        const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
        return s - Math.floor(s);
    }

    function makeCanvas(width, height) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height || width;
        return { canvas: c, ctx: c.getContext('2d') };
    }

    function canvasTexture(canvas, renderer, srgb = true, repeat = 1) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat, repeat);
        tex.anisotropy = renderer ? getAnisotropy(renderer) : 4;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        if (srgb) tex.encoding = THREE.sRGBEncoding;
        tex.needsUpdate = true;
        return tex;
    }

    // =========================================================================
    // 2. Procedural Glow, Headlight, Lamp & Lens-Flare Textures
    // =========================================================================

    /**
     * Radial soft glow texture (Lens Flare Glare Sprite & Light Bloom Core)
     * 絲滑平順的高斯衰減曲線，極低中心亮度，徹底消除白熱光斑
     */
    function getRadialGlowTexture() {
        if (CACHE.glowTex) return CACHE.glowTex;
        const size = 128;
        const { canvas, ctx } = makeCanvas(size, size);
        const r = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        r.addColorStop(0.0, 'rgba(255, 245, 210, 0.70)');
        r.addColorStop(0.18, 'rgba(255, 220, 150, 0.35)');
        r.addColorStop(0.45, 'rgba(255, 180, 80, 0.10)');
        r.addColorStop(0.75, 'rgba(230, 130, 30, 0.02)');
        r.addColorStop(1.0, 'rgba(200, 100, 10, 0.0)');
        ctx.fillStyle = r;
        ctx.fillRect(0, 0, size, size);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        CACHE.glowTex = tex;
        return tex;
    }

    /**
     * Forward road ground pool texture for car headlights
     */
    function getHeadlightGroundPoolTexture() {
        if (CACHE.headlightGroundPoolTex) return CACHE.headlightGroundPoolTex;
        const width = 512, height = 256;
        const { canvas, ctx } = makeCanvas(width, height);
        ctx.clearRect(0, 0, width, height);

        const drawLobe = (cx, cy, rx, ry, alpha) => {
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
            grad.addColorStop(0.0, `rgba(255, 250, 228, ${alpha * 0.45})`);
            grad.addColorStop(0.30, `rgba(255, 238, 195, ${alpha * 0.26})`);
            grad.addColorStop(0.65, `rgba(250, 215, 150, ${alpha * 0.08})`);
            grad.addColorStop(0.88, `rgba(235, 185, 100, ${alpha * 0.02})`);
            grad.addColorStop(1.0, 'rgba(210, 150, 60, 0.0)');

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1.0, ry / rx);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        // Forward dual-headlight reach + central forward beam fill
        drawLobe(width * 0.38, height * 0.32, width * 0.36, height * 0.28, 0.88);
        drawLobe(width * 0.38, height * 0.68, width * 0.36, height * 0.28, 0.88);
        drawLobe(width * 0.52, height * 0.50, width * 0.44, height * 0.44, 0.70);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        CACHE.headlightGroundPoolTex = tex;
        return tex;
    }

    /**
     * Forward dual-headlight beam texture for ground projection
     */
    function getHeadlightBeamTexture() {
        if (CACHE.headlightBeamTex) return CACHE.headlightBeamTex;
        return getHeadlightGroundPoolTexture();
    }

    function getSingleHeadlightBeamTexture() {
        if (CACHE.singleHeadlightTex) return CACHE.singleHeadlightTex;
        const size = 256;
        const { canvas, ctx } = makeCanvas(size, size);
        ctx.clearRect(0, 0, size, size);

        const grad = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.42, size * 0.56);
        grad.addColorStop(0.0, 'rgba(255, 250, 228, 0.35)');
        grad.addColorStop(0.30, 'rgba(255, 238, 195, 0.20)');
        grad.addColorStop(0.65, 'rgba(250, 215, 150, 0.05)');
        grad.addColorStop(0.88, 'rgba(235, 185, 100, 0.01)');
        grad.addColorStop(1.0, 'rgba(210, 150, 60, 0.0)');

        ctx.save();
        ctx.translate(size * 0.5, size * 0.42);
        ctx.scale(0.72, 1);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.56, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        CACHE.singleHeadlightTex = tex;
        return tex;
    }

    /**
     * Broad warm golden streetlight pool on roadway/sidewalk with smooth exponential Gaussian falloff
     * 溫暖微光的 3000K 鈉燈路燈地面光池，半透明薄紗感，多燈重疊亦永不泛白
     */
    function getStreetlightPoolTexture() {
        if (CACHE.streetLightPoolTex) return CACHE.streetLightPoolTex;
        const size = 512;
        const { canvas, ctx } = makeCanvas(size, size);
        ctx.clearRect(0, 0, size, size);

        const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
        grad.addColorStop(0.0, 'rgba(255, 215, 130, 0.35)');
        grad.addColorStop(0.25, 'rgba(255, 195, 100, 0.20)');
        grad.addColorStop(0.55, 'rgba(240, 155, 60, 0.07)');
        grad.addColorStop(0.80, 'rgba(210, 115, 25, 0.02)');
        grad.addColorStop(1.0, 'rgba(170, 65, 0, 0.0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(size * 0.5, size * 0.5, size * 0.5, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        CACHE.streetLightPoolTex = tex;
        return tex;
    }

    function getTailGlowTexture() {
        if (CACHE.tailGlowTex) return CACHE.tailGlowTex;
        const size = 128;
        const { canvas, ctx } = makeCanvas(size, size);
        ctx.clearRect(0, 0, size, size);

        const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
        grad.addColorStop(0.0, 'rgba(255, 28, 38, 0.45)');
        grad.addColorStop(0.35, 'rgba(240, 18, 28, 0.20)');
        grad.addColorStop(0.70, 'rgba(200, 12, 22, 0.04)');
        grad.addColorStop(1.0, 'rgba(180, 0, 10, 0.0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(size * 0.5, size * 0.5, size * 0.5, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        CACHE.tailGlowTex = tex;
        return tex;
    }

    // =========================================================================
    // 3. Procedural PBR Textures (Asphalt, Concrete, Grass)
    // =========================================================================
    function noiseFill(ctx, size, base, variation, tint) {
        const img = ctx.createImageData(size, size);
        const d = img.data;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = (y * size + x) * 4;
                const n1 = hash2(x * 0.45, y * 0.45);
                const n2 = hash2(x * 0.12, y * 0.12);
                const n3 = hash2(x * 0.03, y * 0.03);
                const n = (n1 * 0.5 + n2 * 0.35 + n3 * 0.15);
                const v = variation * (n - 0.5);
                d[i] = Math.max(0, Math.min(255, base[0] + v + (tint ? tint[0] * n : 0)));
                d[i + 1] = Math.max(0, Math.min(255, base[1] + v + (tint ? tint[1] * n : 0)));
                d[i + 2] = Math.max(0, Math.min(255, base[2] + v + (tint ? tint[2] * n : 0)));
                d[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    // =========================================================================
    // 7. Vehicle Models with Headlight Lens Flares & Ground Pools
    // =========================================================================
    function getPaint(colorValue) {
        const key = (colorValue && colorValue.isColor) ? colorValue.getHex() : (colorValue | 0);
        if (PAINT_CACHE.has(key)) return PAINT_CACHE.get(key);
        // Clearcoat lacquer automotive paint: low metalness for vibrant daylight diffuse, high clearcoat reflection
        const mat = new THREE.MeshPhysicalMaterial({
            color: key,
            roughness: 0.15,
            metalness: 0.08,
            clearcoat: 1.0,
            clearcoatRoughness: 0.03,
            envMapIntensity: 2.40
        });
        applyVehicleNightEnv(mat);
        PAINT_CACHE.set(key, mat);
        return mat;
    }

    // 夜間降低車漆/玻璃環境反射強度，讓路燈與車頭燈的實際照亮更明顯
    function applyVehicleNightEnv(mat) {
        if (!mat || !('envMapIntensity' in mat)) return;
        if (mat.userData.envBase === undefined) mat.userData.envBase = mat.envMapIntensity;
        mat.envMapIntensity = Visual3D.state.isNight ? mat.userData.envBase * 0.55 : mat.userData.envBase;
    }

    function sharedCarMats() {
        if (CACHE.carMats) return CACHE.carMats;
        CACHE.carMats = {            glass: new THREE.MeshPhysicalMaterial({
                color: 0x6482a0,
                roughness: 0.02,
                metalness: 0.05,
                transparent: true,
                opacity: 0.50,
                envMapIntensity: 3.0,
                clearcoat: 1.0,
                clearcoatRoughness: 0.03
            }),
            darkGlass: new THREE.MeshStandardMaterial({
                color: 0x2e3f52,
                roughness: 0.05,
                metalness: 0.10,
                envMapIntensity: 2.50
            }),
            tire: new THREE.MeshStandardMaterial({
                color: 0x2e3036,
                roughness: 0.85,
                metalness: 0.05
            }),
            rim: new THREE.MeshStandardMaterial({
                color: 0xf5f8fc,
                roughness: 0.15,
                metalness: 0.88,
                envMapIntensity: 2.2
            }),
            plastic: new THREE.MeshStandardMaterial({
                color: 0x3e444c,
                roughness: 0.50,
                metalness: 0.08
            }),
            chrome: new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.04,
                metalness: 0.98,
                envMapIntensity: 2.5
            }),
            headlight: new THREE.MeshStandardMaterial({
                color: 0xfffef5,
                emissive: 0xfff4cf,
                emissiveIntensity: 0.80,
                roughness: 0.12,
                metalness: 0.25
            }),
            taillight: new THREE.MeshStandardMaterial({
                color: 0xa81818,
                emissive: 0xff2020,
                emissiveIntensity: 0.75,
                roughness: 0.18
            }),
            plate: new THREE.MeshStandardMaterial({
                color: 0xfbf9f2,
                roughness: 0.40,
                metalness: 0.10
            }),
            caliper: new THREE.MeshStandardMaterial({
                color: 0xe02828,
                roughness: 0.28,
                metalness: 0.5
            }),
            cargoBox: new THREE.MeshStandardMaterial({
                color: 0xf0f3f6,
                roughness: 0.40,
                metalness: 0.10
            }),
            skin: new THREE.MeshStandardMaterial({ color: 0xfcd5b4, roughness: 0.60 }),
            jacket: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.55 }),
            pants: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 }),
            helmet: new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.12, metalness: 0.08, envMapIntensity: 2.0, clearcoat: 1.0 })
        };
        Object.keys(CACHE.carMats).forEach(k => applyVehicleNightEnv(CACHE.carMats[k]));
        return CACHE.carMats;
    }

    function getAsphaltMaps(renderer) {
        if (CACHE.asphalt) return CACHE.asphalt;
        const size = 512;
        const { canvas, ctx } = makeCanvas(size);

        // Base modern sunlit slate-gray asphalt albedo
        noiseFill(ctx, size, [72, 76, 82], 18, [2, 2, 1]);

        // Aggregate stones (fine gravel specks)
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 0.4 + Math.random() * 1.5;
            const shade = 65 + Math.random() * 60;
            ctx.fillStyle = `rgba(${shade},${shade - 1},${shade - 3},${0.35 + Math.random() * 0.45})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Longitudinal tire wear streaks
        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 20; i++) {
            ctx.strokeStyle = Math.random() > 0.4 ? '#8a8e96' : '#282b30';
            ctx.lineWidth = 3 + Math.random() * 8;
            ctx.beginPath();
            const sx = Math.random() * size;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx + (Math.random() - 0.5) * 10, size);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Roughness map
        const { canvas: roughC, ctx: roughCtx } = makeCanvas(size);
        noiseFill(roughCtx, size, [220, 220, 220], 40);
        roughCtx.globalAlpha = 0.15;
        for (let i = 0; i < 10; i++) {
            roughCtx.fillStyle = '#999999';
            roughCtx.fillRect(Math.random() * size, 0, 15 + Math.random() * 25, size);
        }
        roughCtx.globalAlpha = 1;

        CACHE.asphalt = {
            map: canvasTexture(canvas, renderer, true),
            rough: canvasTexture(roughC, renderer, false)
        };
        return CACHE.asphalt;
    }

    function getGrassMap(renderer) {
        if (CACHE.grass) return CACHE.grass;
        const size = 512;
        const { canvas, ctx } = makeCanvas(size);
        // Vibrant sunny spring green
        noiseFill(ctx, size, [125, 175, 75], 28, [-10, 15, -12]);

        for (let i = 0; i < 3200; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.fillStyle = `rgba(${85 + Math.random() * 55},${145 + Math.random() * 80},${45 + Math.random() * 40},0.4)`;
            ctx.fillRect(x, y, 1, 2 + Math.random() * 4);
        }
        CACHE.grass = canvasTexture(canvas, renderer, true);
        return CACHE.grass;
    }

    function getConcreteMap(renderer) {
        if (CACHE.concrete) return CACHE.concrete;
        const size = 512;
        const { canvas, ctx } = makeCanvas(size);
        // Clean bright sunny pedestrian sidewalk pavers
        noiseFill(ctx, size, [210, 208, 202], 16, [3, 2, 0]);

        // Tile / Paver seam lines
        ctx.strokeStyle = 'rgba(140, 138, 132, 0.4)';
        ctx.lineWidth = 1.2;
        const step = size / 8;
        for (let x = 0; x <= size; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, size);
            ctx.stroke();
        }
        for (let y = 0; y <= size; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.lineTo(size, y);
            ctx.stroke();
        }

        CACHE.concrete = canvasTexture(canvas, renderer, true);
        return CACHE.concrete;
    }

    function worldUVMaterial(baseParams, tex, scale, renderer) {
        const mat = new THREE.MeshStandardMaterial(baseParams);
        const maps = typeof tex === 'function' ? tex(renderer) : tex;
        const map = maps.map || maps;
        const rough = maps.rough || null;

        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uWorldMap = { value: map };
            shader.uniforms.uWorldScale = { value: scale };
            shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
            );
            shader.fragmentShader = `
                uniform sampler2D uWorldMap;
                uniform float uWorldScale;
                varying vec3 vWorldPos;
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                 vec2 wuv = vWorldPos.xz * uWorldScale;
                 vec3 wtex = texture2D(uWorldMap, wuv).rgb;
                 diffuseColor.rgb *= wtex;`
            );
        };
        mat.customProgramCacheKey = () => 'world-uv-' + scale + '-' + (baseParams.color || '');
        if (rough) {
            mat.roughnessMap = rough;
            mat.roughness = 1.0;
        }
        return mat;
    }

    function createAsphaltMaterial(renderer) {
        const maps = getAsphaltMaps(renderer);
        const mat = worldUVMaterial({
            color: 0xcccccc,
            roughness: 0.65,
            metalness: 0.14,
            envMapIntensity: 1.25,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        }, maps, 0.20, renderer);
        mat.customProgramCacheKey = () => 'asphalt-world-v4';
        return mat;
    }

    function createGrassMaterial(renderer) {
        return worldUVMaterial({
            color: 0x88c84d,
            roughness: 0.90,
            metalness: 0.0,
            envMapIntensity: 0.25
        }, getGrassMap(renderer), 0.16, renderer);
    }

    function createConcreteMaterial(renderer) {
        return worldUVMaterial({
            color: 0xf4f1e8,
            roughness: 0.70,
            metalness: 0.08,
            envMapIntensity: 0.95,
            side: THREE.DoubleSide
        }, getConcreteMap(renderer), 0.26, renderer);
    }

    // =========================================================================
    // 4. Atmospheric Sky, Moon, Stars & Calibrated Lighting
    // =========================================================================
    function createSky(sunDir) {
        const geo = new THREE.SphereGeometry(9500, 32, 16);
        const moonDir = new THREE.Vector3(-0.45, 0.78, -0.42).normalize();
        Visual3D.state.moonDir = moonDir;

        const mat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            uniforms: {
                uSun: { value: sunDir.clone() },
                uMoon: { value: moonDir.clone() },
                uTime: { value: 0.0 },
                uNight: { value: Visual3D.state.isNight ? 1.0 : 0.0 }
            },
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vDir = w.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vDir;
                uniform vec3 uSun;
                uniform vec3 uMoon;
                uniform float uTime;
                uniform float uNight;
                
                float hash12(vec2 p) {
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }

                float hash31(vec3 p) {
                    p = fract(p * 0.1031);
                    p += dot(p, p.yzx + 33.33);
                    return fract((p.x + p.y) * p.z);
                }
                
                void main() {
                    vec3 dir = normalize(vDir);
                    float h = dir.y;
                    
                    // --- 1. Daytime Atmosphere (Sunny Azure Sky) ---
                    vec3 dayZenith = vec3(0.12, 0.44, 0.96);    // Deep vibrant crystalline azure
                    vec3 dayMidSky = vec3(0.38, 0.72, 1.0);     // Brilliant luminous sky-blue
                    vec3 dayHorizon = vec3(0.92, 0.96, 1.0);    // Warm sunny horizon
                    vec3 dayGround = vec3(0.72, 0.80, 0.70);
                    
                    vec3 dayCol = mix(dayHorizon, dayMidSky, smoothstep(0.0, 0.35, h));
                    dayCol = mix(dayCol, dayZenith, smoothstep(0.20, 0.85, h));
                    dayCol = mix(dayGround, dayCol, smoothstep(-0.15, 0.05, h));
                    
                    // Sun Disc & Corona Glow
                    vec3 sDir = normalize(uSun);
                    float cosSun = max(dot(dir, sDir), 0.0);
                    float sunDisk = pow(cosSun, 400.0);
                    float sunCorona = pow(cosSun, 16.0) * 0.75;
                    float sunGlow = pow(cosSun, 3.5) * 0.35;
                    
                    dayCol += vec3(1.0, 0.98, 0.92) * sunDisk * 5.0;
                    dayCol += vec3(1.0, 0.92, 0.75) * sunCorona;
                    dayCol += vec3(1.0, 0.88, 0.65) * sunGlow;
                    
                    float dayHaze = exp(-max(h, 0.0) * 3.5) * 0.06;
                    dayCol += vec3(0.94, 0.97, 1.0) * dayHaze;
                    
                    // --- 2. Nighttime Atmosphere (Subtle midnight twilight sky with gentle horizon glow) ---
                    vec3 nightZenith = vec3(0.04, 0.05, 0.08);   // Gentle midnight indigo-navy
                    vec3 nightMidSky = vec3(0.08, 0.10, 0.14);   // Twilight slate
                    vec3 nightHorizon = vec3(0.14, 0.15, 0.18);  // Atmospheric city skyglow on horizon
                    vec3 nightGround = vec3(0.03, 0.03, 0.04);
                    
                    vec3 nightCol = mix(nightHorizon, nightMidSky, smoothstep(0.0, 0.38, h));
                    nightCol = mix(nightCol, nightZenith, smoothstep(0.22, 0.88, h));
                    nightCol = mix(nightGround, nightCol, smoothstep(-0.15, 0.05, h));
                    
                    // --- High-Density Anti-Aliased Sparkling Star Field ---
                    if (h > 0.01) {
                        float starMask = smoothstep(0.01, 0.18, h);
                        
                        // Tier 1: Prominent Bright Stars
                        vec3 starDir1 = dir * 140.0;
                        vec3 starCell1 = floor(starDir1);
                        float starHash1 = hash31(starCell1);
                        if (starHash1 > 0.965) {
                            float twinkle1 = 0.70 + 0.30 * sin(uTime * 2.8 + starHash1 * 50.0);
                            vec3 cellCenter1 = starCell1 + 0.5 + (vec3(hash31(starCell1 + 1.1), hash31(starCell1 + 2.2), hash31(starCell1 + 3.3)) - 0.5) * 0.7;
                            float starDist1 = length(starDir1 - cellCenter1);
                            float starInt1 = smoothstep(0.28, 0.02, starDist1) * twinkle1 * starMask;
                            vec3 starCol1 = mix(vec3(1.0, 1.0, 1.0), vec3(1.0, 0.94, 0.85), hash12(starCell1.xy));
                            nightCol += starCol1 * starInt1 * 2.8;
                        }
                        
                        // Tier 2: Medium Sparkling Stars
                        vec3 starDir2 = dir * 260.0;
                        vec3 starCell2 = floor(starDir2);
                        float starHash2 = hash31(starCell2 + 7.7);
                        if (starHash2 > 0.972) {
                            float twinkle2 = 0.60 + 0.40 * sin(uTime * 3.5 + starHash2 * 75.0);
                            vec3 cellCenter2 = starCell2 + 0.5 + (vec3(hash31(starCell2 + 4.1), hash31(starCell2 + 5.2), hash31(starCell2 + 6.3)) - 0.5) * 0.7;
                            float starDist2 = length(starDir2 - cellCenter2);
                            float starInt2 = smoothstep(0.24, 0.02, starDist2) * twinkle2 * starMask;
                            vec3 starCol2 = mix(vec3(0.92, 0.96, 1.0), vec3(1.0, 0.97, 0.90), hash12(starCell2.xy));
                            nightCol += starCol2 * starInt2 * 2.2;
                        }
                        
                        // Tier 3: Fine Cosmic Star Dust
                        vec3 starDir3 = dir * 420.0;
                        vec3 starCell3 = floor(starDir3);
                        float starHash3 = hash31(starCell3 + 19.3);
                        if (starHash3 > 0.982) {
                            float starDist3 = length(fract(starDir3) - 0.5);
                            float starInt3 = smoothstep(0.20, 0.02, starDist3) * starMask * 0.85;
                            nightCol += vec3(0.95, 0.97, 1.0) * starInt3 * 1.5;
                        }
                    }
                    
                    // Moon Disc & Lunar Corona
                    vec3 mDir = normalize(uMoon);
                    float cosMoon = max(dot(dir, mDir), 0.0);
                    float moonDisk = pow(cosMoon, 520.0);
                    float moonCorona = pow(cosMoon, 32.0) * 0.14;
                    float moonGlow = pow(cosMoon, 10.0) * 0.04;
                    
                    nightCol += vec3(0.98, 0.99, 1.0) * moonDisk * 3.5;
                    nightCol += vec3(0.75, 0.85, 1.0) * moonCorona;
                    nightCol += vec3(0.40, 0.52, 0.70) * moonGlow;
                    
                    // Subtle night horizon warm mist
                    float nightHaze = exp(-max(h, 0.0) * 3.6) * 0.08;
                    nightCol += vec3(0.32, 0.24, 0.16) * nightHaze;
                    
                    // --- 3. Final Day-Night Blend ---
                    vec3 finalCol = mix(dayCol, nightCol, clamp(uNight, 0.0, 1.0));
                    gl_FragColor = vec4(finalCol, 1.0);
                }
            `
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = -1000;
        mesh.name = 'visual3d-sky';
        Visual3D.state.skyMat = mat;
        return mesh;
    }

    function bakeEnvMap(renderer, sunDir) {
        const envScene = new THREE.Scene();
        const envGeo = new THREE.SphereGeometry(9500, 16, 16);
        const envMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {
                uSun: { value: sunDir.clone() },
                uMoon: { value: new THREE.Vector3(-0.45, 0.78, -0.42).normalize() },
                uTime: { value: 0.0 },
                uNight: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vDir = w.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vDir;
                uniform vec3 uSun;
                void main() {
                    vec3 dir = normalize(vDir);
                    float h = dir.y;
                    vec3 dayZenith = vec3(0.12, 0.44, 0.96);
                    vec3 dayMidSky = vec3(0.38, 0.72, 1.0);
                    vec3 dayHorizon = vec3(0.92, 0.96, 1.0);
                    vec3 dayGround = vec3(0.72, 0.80, 0.70);
                    vec3 dayCol = mix(dayHorizon, dayMidSky, smoothstep(0.0, 0.35, h));
                    dayCol = mix(dayCol, dayZenith, smoothstep(0.20, 0.85, h));
                    dayCol = mix(dayGround, dayCol, smoothstep(-0.15, 0.05, h));
                    gl_FragColor = vec4(dayCol, 1.0);
                }
            `
        });
        const envSky = new THREE.Mesh(envGeo, envMat);
        envScene.add(envSky);

        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileCubemapShader();
        const rt = pmrem.fromScene(envScene, 0.04, 0.1, 2500);
        pmrem.dispose();

        envGeo.dispose();
        envMat.dispose();
        return rt.texture;
    }

    function bakeNightEnvMap(renderer) {
        const envScene = new THREE.Scene();
        const envGeo = new THREE.SphereGeometry(9500, 16, 16);
        const envMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            uniforms: {},
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vec4 w = modelMatrix * vec4(position, 1.0);
                    vDir = w.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vDir;
                void main() {
                    vec3 dir = normalize(vDir);
                    float h = dir.y;
                    // Night city environment map with deep midnight sky and soft subtle street reflections
                    vec3 skyZenith = vec3(0.02, 0.03, 0.05);
                    vec3 skyHorizon = vec3(0.05, 0.06, 0.08);
                    vec3 cityLights = vec3(0.20, 0.14, 0.06);
                    vec3 groundBounce = vec3(0.02, 0.02, 0.02);
                    
                    vec3 col = mix(skyHorizon, skyZenith, smoothstep(0.0, 0.45, max(h, 0.0)));
                    // Subtle skyline warm reflection band
                    float cityBand = exp(-abs(h) * 12.0) * 0.12;
                    col += cityLights * cityBand;
                    col = mix(groundBounce, col, smoothstep(-0.15, 0.05, h));
                    gl_FragColor = vec4(col, 1.0);
                }
            `
        });
        const envSky = new THREE.Mesh(envGeo, envMat);
        envScene.add(envSky);

        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileCubemapShader();
        const rt = pmrem.fromScene(envScene, 0.04, 0.1, 2500);
        pmrem.dispose();

        envGeo.dispose();
        envMat.dispose();
        return rt.texture;
    }

    function createGround(renderer) {
        const geo = new THREE.PlaneGeometry(120000, 120000);
        const mat = createGrassMaterial(renderer);
        mat.color.setHex(0x88c84d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = -0.55;
        mesh.receiveShadow = true;
        mesh.name = 'visual3d-ground';
        return mesh;
    }

    function enhanceRenderer(renderer) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = Visual3D.state.isNight ? NIGHT_LOOK.exposure : 1.52;
        if ('physicallyCorrectLights' in renderer) {
            renderer.physicallyCorrectLights = true;
        }
        renderer.shadowMap.autoUpdate = true;
    }

    // =========================================================================
    // 5. Post-Processing Pipeline (EffectComposer & UnrealBloomPass)
    // =========================================================================
    function setupComposer(renderer, scene, camera) {
        if (!renderer || !scene || !camera) return null;
        if (typeof THREE.EffectComposer === 'undefined' || typeof THREE.UnrealBloomPass === 'undefined') {
            return null;
        }

        try {
            const size = new THREE.Vector2();
            renderer.getSize(size);
            const pixelRatio = renderer.getPixelRatio() || 1;
            const w = size.x || window.innerWidth;
            const h = size.y || window.innerHeight;

            let renderTarget = null;
            if (THREE.HalfFloatType) {
                renderTarget = new THREE.WebGLRenderTarget(w, h, {
                    type: THREE.HalfFloatType,
                    format: THREE.RGBAFormat,
                    samples: 4
                });
            }

            const composer = new THREE.EffectComposer(renderer, renderTarget);
            composer.setPixelRatio(pixelRatio);
            composer.setSize(w, h);

            const renderPass = new THREE.RenderPass(scene, camera);
            composer.addPass(renderPass);

            // UnrealBloomPass: strength, radius, threshold (tuned to avoid pure-white burnout)
            const isNight = !!Visual3D.state.isNight;
            const bloomPass = new THREE.UnrealBloomPass(
                new THREE.Vector2(w, h),
                isNight ? NIGHT_LOOK.bloomStrength : 0.10,
                isNight ? NIGHT_LOOK.bloomRadius : 0.40,
                isNight ? NIGHT_LOOK.bloomThreshold : 0.98
            );
            composer.addPass(bloomPass);

            let vignettePass = null;
            if (typeof THREE.VignetteShader !== 'undefined') {
                vignettePass = new THREE.ShaderPass(THREE.VignetteShader);
                vignettePass.uniforms.offset.value = isNight ? NIGHT_LOOK.vignetteOffset : 1.20;
                vignettePass.uniforms.darkness.value = isNight ? NIGHT_LOOK.vignetteDarkness : 0.18;
                composer.addPass(vignettePass);
            }

            Visual3D.state.composer = composer;
            Visual3D.state.bloomPass = bloomPass;
            Visual3D.state.vignettePass = vignettePass;
            return composer;
        } catch (e) {
            console.warn('[Visual3D] EffectComposer setup fallback:', e);
            return null;
        }
    }

    function render(scene, camera) {
        const sc = scene || Visual3D.state.scene;
        const cam = camera || Visual3D.state.camera;
        const ren = Visual3D.state.renderer;
        if (!ren || !sc || !cam) return;

        if (!Visual3D.state.composer) {
            setupComposer(ren, sc, cam);
        }

        if (Visual3D.state.composer) {
            Visual3D.state.composer.render();
        } else {
            ren.render(sc, cam);
        }
    }

    function onResize(w, h) {
        if (Visual3D.state.composer) {
            Visual3D.state.composer.setSize(w, h);
        }
        if (Visual3D.state.bloomPass) {
            Visual3D.state.bloomPass.resolution.set(w, h);
        }
    }

    function install(scene, renderer, camera) {
        Visual3D.state.scene = scene;
        Visual3D.state.renderer = renderer;
        Visual3D.state.camera = camera;

        enhanceRenderer(renderer);

        const sunDir = new THREE.Vector3(0.45, 0.85, 0.35).normalize();
        Visual3D.state.sunDir = sunDir;

        const dayHorizon = 0xebf5ff;
        const nightHorizon = NIGHT_LOOK.horizon;
        const horizon = Visual3D.state.isNight ? nightHorizon : dayHorizon;
        scene.background = new THREE.Color(horizon);
        scene.fog = new THREE.Fog(horizon, Visual3D.state.isNight ? NIGHT_LOOK.fogNear : 2500, Visual3D.state.isNight ? NIGHT_LOOK.fogFar : 18000);

        if (camera) {
            camera.fov = 50;
            camera.near = 0.4;
            camera.far = 18000;
            camera.updateProjectionMatrix();
        }

        // 1. Sky Dome
        const sky = createSky(sunDir);
        scene.add(sky);
        Visual3D.state.sky = sky;

        // 2. Moon Corona Sprite
        const moonDir = Visual3D.state.moonDir || new THREE.Vector3(-0.45, 0.78, -0.42).normalize();
        const moonMat = new THREE.SpriteMaterial({
            map: getRadialGlowTexture(),
            color: 0xfff0d0,
            transparent: true,
            opacity: Visual3D.state.isNight ? 0.90 : 0,
            fog: false,
            depthWrite: false
        });
        const moonSprite = new THREE.Sprite(moonMat);
        moonSprite.scale.setScalar(450);
        moonSprite.position.copy(moonDir).multiplyScalar(4000);
        scene.add(moonSprite);
        Visual3D.state.moonSprite = moonSprite;

        // 3. Twinkling Stars (Clean Shader Star System)
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
        const starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.0,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false
        });
        const starPoints = new THREE.Points(starGeo, starMat);
        scene.add(starPoints);
        Visual3D.state.starPoints = starPoints;
        Visual3D.state.starMat = starMat;

        // 4. Calibrated Lighting System (Warm Ambient & Natural Low-Poly Night Lighting)
        const ambient = new THREE.AmbientLight(
            Visual3D.state.isNight ? NIGHT_LOOK.ambientColor : 0xe8f2fc,
            Visual3D.state.isNight ? NIGHT_LOOK.ambientIntensity : 0.95
        );
        ambient.name = 'visual3d-ambient';
        scene.add(ambient);
        Visual3D.state.ambientLight = ambient;

        const hemi = new THREE.HemisphereLight(
            Visual3D.state.isNight ? NIGHT_LOOK.hemiSky : 0xd6eeff,
            Visual3D.state.isNight ? NIGHT_LOOK.hemiGround : 0x98b882,
            Visual3D.state.isNight ? NIGHT_LOOK.hemiIntensity : 1.10
        );
        hemi.position.set(0, 500, 0);
        hemi.name = 'visual3d-hemi';
        scene.add(hemi);
        Visual3D.state.hemiLight = hemi;

        // Directional Sun
        const sun = new THREE.DirectionalLight(0xfff8ea, Visual3D.state.isNight ? 0.0 : 4.5);
        sun.position.copy(sunDir).multiplyScalar(1200);
        sun.castShadow = true;
        sun.shadow.mapSize.set(4096, 4096);
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 4500;
        const d = 2000;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        sun.shadow.bias = -0.00025;
        sun.shadow.normalBias = 0.025;
        sun.name = 'visual3d-sun';
        scene.add(sun);
        Visual3D.state.sunLight = sun;

        // Moonlight (Active at night - Soft Warm City Ambient Moon)
        const moonLight = new THREE.DirectionalLight(
            NIGHT_LOOK.moonColor,
            Visual3D.state.isNight ? NIGHT_LOOK.moonIntensity : 0.0
        );
        moonLight.position.copy(moonDir).multiplyScalar(1200);
        moonLight.castShadow = false;
        moonLight.name = 'visual3d-moon';
        scene.add(moonLight);
        Visual3D.state.moonLight = moonLight;

        // Fill Light
        const fill = new THREE.DirectionalLight(
            Visual3D.state.isNight ? NIGHT_LOOK.fillColor : 0xd0e6f8,
            Visual3D.state.isNight ? NIGHT_LOOK.fillIntensity : 0.85
        );
        fill.position.set(-450, 250, -350);
        fill.name = 'visual3d-fill';
        scene.add(fill);
        Visual3D.state.fillLight = fill;

        // 5. Ground plane
        const ground = createGround(renderer);
        scene.add(ground);
        Visual3D.state.ground = ground;

        // 6. Baked PMREM Environment Reflections (Day & Night City Lights)
        try {
            const dayEnv = bakeEnvMap(renderer, sunDir);
            const nightEnv = bakeNightEnvMap(renderer);
            Visual3D.state.dayEnvMap = dayEnv;
            Visual3D.state.nightEnvMap = nightEnv;
            scene.environment = Visual3D.state.isNight ? nightEnv : dayEnv;
        } catch (err) {
            console.warn('[Visual3D] Env map bake fallback:', err);
        }

        // 7. Setup EffectComposer postprocessing
        setupComposer(renderer, scene, camera);

        return Visual3D.state;
    }

    // =========================================================================
    // 6. Procedural Architecture, Facade Shader & Lit Storefronts
    // =========================================================================
    function applyBuildingShader(material) {
        material.roughness = 0.60;
        material.metalness = 0.08;
        material.envMapIntensity = 0.55;

        if (!Visual3D.state.buildingMats.includes(material)) {
            Visual3D.state.buildingMats.push(material);
        }

        material.onBeforeCompile = (shader) => {
            material.userData.shader = shader;
            shader.uniforms.uNight = { value: Visual3D.state.isNight ? 1.0 : 0.0 };

            shader.vertexShader = `
                attribute vec2 aWindowParams;
                attribute vec3 aColor;
                varying vec2 vWindowParams;
                varying vec3 vInstanceColor;
                varying vec3 vPos;
                varying vec3 vNormalDir;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 vWindowParams = aWindowParams;
                 vInstanceColor = aColor;
                 vec4 worldPos = instanceMatrix * vec4(transformed, 1.0);
                 vPos = worldPos.xyz;
                 mat3 rotMat = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
                 rotMat[0] = normalize(rotMat[0]);
                 rotMat[1] = normalize(rotMat[1]);
                 rotMat[2] = normalize(rotMat[2]);
                 vNormalDir = normalize(rotMat * objectNormal);`
            );

            shader.fragmentShader = `
                varying vec2 vWindowParams;
                varying vec3 vInstanceColor;
                varying vec3 vPos;
                varying vec3 vNormalDir;
                uniform float uNight;
                
                float hash21(vec2 p) {
                    p = fract(p * vec2(233.34, 851.73));
                    p += dot(p, p + 23.45);
                    return fract(p.x * p.y);
                }
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                 float isWin = 0.0;
                 float isFrame = 0.0;
                 float isShop = 0.0;
                 vec3 winEmissive = vec3(0.0);
                 vec3 shopEmissive = vec3(0.0);
                 vec3 wallEmissive = vec3(0.0);
                 vec3 nrm = normalize(vNormalDir);
                 float isRoof = step(0.72, abs(nrm.y));
                 float isWall = 1.0 - isRoof;
                 vec3 wall = vInstanceColor;
                 
                 // Ambient occlusion & subtle height dirt gradient
                 float dirt = exp(-max(vPos.y, 0.0) * 0.10) * 0.10;
                 wall *= (1.0 - dirt);
                 
                 // Maintain visible architectural wall color and form in night mode
                 if (uNight > 0.05) {
                     wall = max(wall * 0.40, vec3(0.18, 0.17, 0.16));
                 }
                 
                 // Architectural floor slabs
                 float floorH = 3.5;
                 float slab = step(0.92, fract(vPos.y / floorH));
                 wall *= (1.0 - slab * 0.14 * isWall);
                 
                 if (isRoof > 0.5) {
                     float g = hash21(floor(vPos.xz * 2.2));
                     wall = mix(vec3(0.24, 0.23, 0.22), vec3(0.34, 0.32, 0.30), g);
                 } else {
                     float density = max(vWindowParams.x, 0.18);
                     float ratio = clamp(vWindowParams.y, 0.30, 0.80);
                     float randomOffset = hash21(floor(vPos.xz * 0.08));
                     
                     vec2 uv;
                     if (abs(nrm.x) > abs(nrm.z)) uv = vec2(vPos.z + randomOffset * 10.0, vPos.y);
                     else uv = vec2(vPos.x + randomOffset * 10.0, vPos.y);
                     
                     vec2 cell = vec2(uv.x * density, uv.y / floorH);
                     vec2 grid = fract(cell);
                     vec2 cellId = floor(cell);
                     float cellRandom = hash21(cellId);
                     
                     // Window & Frame boundaries with distinct window pane mullions
                     float winX = step(0.5 - ratio * 0.5, grid.x) * step(grid.x, 0.5 + ratio * 0.5);
                     float winY = step(0.20, grid.y) * step(grid.y, 0.84);
                     float frameX = step(0.5 - ratio * 0.5 - 0.035, grid.x) * step(grid.x, 0.5 + ratio * 0.5 + 0.035);
                     float frameY = step(0.16, grid.y) * step(grid.y, 0.88);
                     
                     // Window pane divider mullions (cozy multi-pane windows)
                     float mullionX = step(0.045, abs(grid.x - 0.5));
                     float mullionY = step(0.055, abs(grid.y - 0.52));
                     float isPane = winX * winY * mullionX * mullionY;
                     
                     float isGround = 1.0 - step(3.8, uv.y);
                     isWin = winX * winY * (1.0 - isGround);
                     isFrame = frameX * frameY * (1.0 - isGround) * (1.0 - isWin);
                     
                     // Ground floor commercial storefronts & display windows
                     float shop = isGround * step(0.14, grid.y) * step(grid.y, 0.92) * step(0.08, grid.x) * step(grid.x, 0.92);
                     
                     // Pure Warm Golden & Honey Amber palette
                     float isLit = step(0.56, cellRandom);
                     float colPick = hash21(cellId + 1.8);
                     vec3 warmLitColor = colPick < 0.35 ? vec3(1.0, 0.76, 0.24) :  // Rich Golden Yellow
                                        (colPick < 0.68 ? vec3(1.0, 0.62, 0.16) :  // Warm Honey Amber
                                        (colPick < 0.88 ? vec3(1.0, 0.84, 0.38) :  // Soft Cozy Yellow
                                                          vec3(1.0, 0.54, 0.10))); // Deep Sunset Amber
                     
                     vec3 darkGlass = mix(vec3(0.06, 0.06, 0.07), wall * 0.30, 0.4);
                     vec3 paneColor = mix(darkGlass, warmLitColor, isLit);
                     vec3 glassColor = mix(wall * 0.30, paneColor, isPane);
                     
                     if (isLit > 0.5 && isPane > 0.5) {
                         winEmissive = warmLitColor * uNight * 0.88;
                     }
                     
                     // Ground floor commercial storefront display (cozy warm amber)
                     if (shop > 0.5) {
                         isShop = 1.0;
                         vec3 shopLight = mix(vec3(1.0, 0.75, 0.30), vec3(1.0, 0.60, 0.18), hash21(cellId + 5.0));
                         float neonRoll = hash21(cellId + 9.0);
                         vec3 neonColor = neonRoll < 0.30 ? vec3(1.0, 0.35, 0.15) :
                                         (neonRoll < 0.60 ? vec3(1.0, 0.75, 0.20) :
                                         (neonRoll < 0.85 ? vec3(0.35, 0.85, 1.0) : vec3(0.30, 0.95, 0.50)));
                         vec3 activeShop = mix(shopLight, neonColor, step(0.78, grid.y) * 0.75);
                         shopEmissive = activeShop * uNight * 0.90;
                         diffuseColor.rgb = activeShop;
                         isWin = 1.0;
                     } else if (isWin > 0.5) {
                         diffuseColor.rgb = glassColor;
                     } else if (isFrame > 0.5) {
                         diffuseColor.rgb = wall * 0.65;
                     } else {
                         diffuseColor.rgb = wall;
                     }
                 }
                 if (isRoof > 0.5) diffuseColor.rgb = wall;
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
                 if (isRoof < 0.5) {
                     if (isShop > 0.5) {
                         totalEmissiveRadiance += shopEmissive;
                     } else if (isWin > 0.5) {
                         totalEmissiveRadiance += winEmissive;
                     }
                 }`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                `#include <roughnessmap_fragment>
                 roughnessFactor = mix(roughnessFactor, 0.10, isWin);
                 roughnessFactor = mix(roughnessFactor, 0.90, isRoof);`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <metalnessmap_fragment>',
                `#include <metalnessmap_fragment>
                 metalnessFactor = mix(metalnessFactor, 0.65, isWin);`
            );
        };
        material.customProgramCacheKey = () => 'urban-facade-v6';
        return material;
    }

    // =========================================================================
    // 7. Vehicle Models with Headlight Lens Flares & Ground Pools
    // =========================================================================
    function addWheel(group, x, y, z, radius, thickness, mats) {
        const wheelGroup = new THREE.Group();
        wheelGroup.position.set(x, y, z);

        // 1. Rubber Tire
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 20), mats.tire);
        tire.rotation.x = Math.PI / 2;
        tire.castShadow = true;
        wheelGroup.add(tire);

        // 2. Alloy Rim
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, thickness * 1.05, 18), mats.rim);
        rim.rotation.x = Math.PI / 2;
        wheelGroup.add(rim);

        // 3. Central Hub & Spokes
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, thickness * 1.12, 12), mats.chrome);
        hub.rotation.x = Math.PI / 2;
        wheelGroup.add(hub);

        // 4. Brake Caliper Accent
        const caliper = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.45, radius * 0.25, thickness * 0.8), mats.caliper);
        caliper.position.set(radius * 0.3, radius * 0.25, 0);
        wheelGroup.add(caliper);

        group.add(wheelGroup);
    }

    function addIndicators(group, length, width, lightY, size) {
        const indGeo = new THREE.BoxGeometry(size, size * 1.3, size);
        const mkMat = () => new THREE.MeshStandardMaterial({
            color: 0x331400,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.30,
            metalness: 0.30
        });

        const x = length / 2 - 0.02;
        const z = width / 2 + 0.01;

        const fl = new THREE.Mesh(indGeo, mkMat()); fl.position.set(x, lightY, -z);
        const fr = new THREE.Mesh(indGeo, mkMat()); fr.position.set(x, lightY, z);
        const bl = new THREE.Mesh(indGeo, mkMat()); bl.position.set(-x, lightY, -z);
        const br = new THREE.Mesh(indGeo, mkMat()); br.position.set(-x, lightY, z);

        group.add(fl, fr, bl, br);
        group.userData.indicators = {
            left: [fl, bl],
            right: [fr, br]
        };
    }

    function createCar(length, width, colorValue) {
        const g = new THREE.Group();
        const mats = sharedCarMats();
        const paint = getPaint(colorValue);

        const isBus = length > 8.5;
        const isTruck = length > 5.8 && !isBus;
        const isSUV = length > 4.6 && length <= 5.8 && width > 1.95;
        const isVan = length > 5.0 && !isTruck && !isBus && !isSUV;

        const wheelR = isBus ? 0.48 : (isTruck ? 0.44 : (isSUV ? 0.36 : Math.min(0.33, Math.max(0.25, length * 0.072))));
        const wheelT = Math.min(0.28, width * 0.17);
        const wheelY = wheelR;
        const wheelZ = width * 0.5 - wheelT * 0.42;
        const wheelX = length * (isBus || isTruck ? 0.38 : 0.32);

        // Body proportions
        const bodyH = isBus ? 1.65 : (isTruck ? 0.78 : (isSUV ? 0.72 : (isVan ? 0.88 : 0.56)));
        const bodyY = wheelR * 0.55 + bodyH * 0.5;

        // 1. Lower Chassis & Aerodynamic Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(length * 0.98, bodyH, width * 0.96), paint);
        body.position.y = bodyY;
        body.castShadow = true;
        body.receiveShadow = true;
        g.add(body);

        // 2. Plastic Lower Rocker Panels / Skirt
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(length * 0.96, 0.12, width * 0.98), mats.plastic);
        skirt.position.y = bodyY - bodyH * 0.5 + 0.04;
        g.add(skirt);

        if (isBus) {
            // Bus Cabin & Glass
            const cabin = new THREE.Mesh(new THREE.BoxGeometry(length * 0.93, 1.42, width * 0.92), mats.darkGlass);
            cabin.position.set(0.04, bodyY + bodyH * 0.5 + 0.60, 0);
            cabin.castShadow = true;
            g.add(cabin);

            // Bus Roof
            const roof = new THREE.Mesh(new THREE.BoxGeometry(length * 0.92, 0.14, width * 0.88), paint);
            roof.position.set(0, cabin.position.y + 0.74, 0);
            g.add(roof);

            // Roof AC Pod Units
            const acUnit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 0.9), mats.plastic);
            acUnit.position.set(-length * 0.12, roof.position.y + 0.18, 0);
            g.add(acUnit);

            // Front Route Destination Matrix Screen (Taipei Transit style)
            const signMat = new THREE.MeshStandardMaterial({
                color: 0x111111,
                emissive: 0xff9900,
                emissiveIntensity: Visual3D.state.isNight ? 1.6 : 0.8
            });
            const sign = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, width * 0.65), signMat);
            sign.position.set(length * 0.46, cabin.position.y + 0.45, 0);
            g.add(sign);

        } else if (isTruck) {
            // Logistics Truck Driver Cab
            const cab = new THREE.Mesh(new THREE.BoxGeometry(length * 0.28, 1.25, width * 0.92), paint);
            cab.position.set(length * 0.33, bodyY + bodyH * 0.5 + 0.50, 0);
            cab.castShadow = true;
            g.add(cab);

            // Cab Windshield & Windows
            const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(length * 0.19, 0.75, width * 0.94), mats.darkGlass);
            cabGlass.position.set(length * 0.37, cab.position.y + 0.16, 0);
            g.add(cabGlass);

            // Cargo Container Box
            const cargo = new THREE.Mesh(new THREE.BoxGeometry(length * 0.62, 1.65, width * 0.94), mats.cargoBox);
            cargo.position.set(-length * 0.14, bodyY + bodyH * 0.5 + 0.75, 0);
            cargo.castShadow = true;
            g.add(cargo);

        } else {
            // Passenger Car / Sedan / SUV / Van Cabin
            const cabinLen = isSUV ? length * 0.58 : (isVan ? length * 0.70 : length * 0.50);
            const cabinH = isSUV ? 0.68 : (isVan ? 0.85 : 0.52);
            const cabinW = width * 0.86;
            const cabinY = bodyY + bodyH * 0.5 + cabinH * 0.5;
            const cabinX = isVan ? -length * 0.02 : -length * 0.08;

            const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinLen, cabinH, cabinW), paint);
            cabin.position.set(cabinX, cabinY, 0);
            cabin.castShadow = true;
            g.add(cabin);

            const glassH = cabinH * 0.68;
            const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(cabinLen * 0.76, glassH, cabinW + 0.02), mats.darkGlass);
            sideGlass.position.set(cabinX, cabinY - 0.02, 0);
            g.add(sideGlass);

            const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, cabinH * 0.75, cabinW * 0.90), mats.glass);
            frontGlass.position.set(cabinX + cabinLen * 0.50 + 0.01, cabinY - cabinH * 0.08, 0);
            g.add(frontGlass);

            const backGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, cabinH * 0.70, cabinW * 0.88), mats.glass);
            backGlass.position.set(cabinX - cabinLen * 0.50 - 0.01, cabinY - cabinH * 0.08, 0);
            g.add(backGlass);

            const hood = new THREE.Mesh(new THREE.BoxGeometry(length * 0.28, bodyH * 0.36, width * 0.90), paint);
            hood.position.set(length * 0.28, bodyY + bodyH * 0.28, 0);
            hood.castShadow = true;
            g.add(hood);

            if (!isSUV && !isVan) {
                const trunk = new THREE.Mesh(new THREE.BoxGeometry(length * 0.18, bodyH * 0.30, width * 0.88), paint);
                trunk.position.set(-length * 0.38, bodyY + bodyH * 0.25, 0);
                trunk.castShadow = true;
                g.add(trunk);
            }

            if (isSUV) {
                const railGeo = new THREE.BoxGeometry(cabinLen * 0.80, 0.04, 0.04);
                const railL = new THREE.Mesh(railGeo, mats.chrome);
                railL.position.set(cabinX, cabinY + cabinH * 0.50 + 0.02, cabinW * 0.42);
                const railR = railL.clone();
                railR.position.z *= -1;
                g.add(railL, railR);
            }
        }

        // Bumpers (Front & Rear)
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, width * 0.94), mats.plastic);
        const fb = bumper.clone();
        fb.position.set(length * 0.5 - 0.02, wheelR + 0.26, 0);
        const rb = bumper.clone();
        rb.position.set(-length * 0.5 + 0.02, wheelR + 0.26, 0);
        g.add(fb, rb);

        // LED Projector Headlights
        const isNight = !!Visual3D.state.isNight;
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0xfffae6,
            emissive: 0xfffae6,
            emissiveIntensity: isNight ? 1.2 : 0.80,
            roughness: 0.12,
            metalness: 0.35
        });
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.28), hlMat);
        hl.position.set(length * 0.5, wheelR + 0.40, width * 0.28);
        const hr = hl.clone();
        hr.position.z *= -1;
        g.add(hl, hr);

        // LED Taillight Clusters (Unique instance for independent brake response)
        const tlMat = new THREE.MeshStandardMaterial({
            color: 0x880e0e,
            emissive: 0xff2020,
            emissiveIntensity: isNight ? 0.85 : 0.75,
            roughness: 0.20
        });
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.26), tlMat);
        tl.position.set(-length * 0.5, wheelR + 0.40, width * 0.28);
        const tr = tl.clone();
        tr.position.z *= -1;
        g.add(tl, tr);

        // Side-view Mirrors
        const mirGeo = new THREE.BoxGeometry(0.18, 0.12, 0.08);
        const ml = new THREE.Mesh(mirGeo, mats.plastic);
        ml.position.set(length * 0.12, bodyY + bodyH * 0.45, width * 0.47);
        const mr = ml.clone();
        mr.position.z *= -1;
        g.add(ml, mr);

        // License Plates
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.32), mats.plate);
        const fp = plate.clone();
        fp.position.set(length * 0.5 + 0.02, wheelR + 0.26, 0);
        const rp = plate.clone();
        rp.position.set(-length * 0.5 - 0.02, wheelR + 0.26, 0);
        g.add(fp, rp);

        // Wheels
        addWheel(g, wheelX, wheelY, wheelZ, wheelR, wheelT, mats);
        addWheel(g, wheelX, wheelY, -wheelZ, wheelR, wheelT, mats);
        addWheel(g, -wheelX, wheelY, wheelZ, wheelR, wheelT, mats);
        addWheel(g, -wheelX, wheelY, -wheelZ, wheelR, wheelT, mats);
        if (isTruck || isBus) {
            addWheel(g, -wheelX * 0.45, wheelY, wheelZ, wheelR, wheelT, mats);
            addWheel(g, -wheelX * 0.45, wheelY, -wheelZ, wheelR, wheelT, mats);
        }

        // Indicators
        addIndicators(g, length, width, wheelR + 0.40, 0.12);

        // =========================================================
        // Photorealistic Night Vehicle Lighting (Lens Flare Sprites & Forward Pools)
        // =========================================================

        // 1. Headlight Lens-Flare Glare Sprites (Mounted directly on each front headlight)
        const headGlowMat = new THREE.SpriteMaterial({
            map: getRadialGlowTexture(),
            color: 0xfff2d6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.20
        });
        const glowL = new THREE.Sprite(headGlowMat);
        glowL.scale.setScalar(0.26);
        glowL.position.set(length * 0.5 + 0.08, wheelR + 0.40, width * 0.28);
        glowL.visible = isNight;
        g.add(glowL);

        const glowR = new THREE.Sprite(headGlowMat);
        glowR.scale.setScalar(0.26);
        glowR.position.set(length * 0.5 + 0.08, wheelR + 0.40, -width * 0.28);
        glowR.visible = isNight;
        g.add(glowR);

        // 2. Forward Ground Headlight Pool (Subtle asphalt illumination ahead of vehicle)
        const poolReach = Math.max(12.0, length * 2.2);
        const poolWidth = width * 1.8;
        const poolGeo = new THREE.PlaneGeometry(poolReach, poolWidth);
        poolGeo.rotateX(-Math.PI / 2);
        poolGeo.translate(length * 0.5 + poolReach * 0.5, 0.14, 0);

        const poolMat = new THREE.MeshBasicMaterial({
            map: getHeadlightGroundPoolTexture(),
            transparent: true,
            opacity: 0.36,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        });
        const groundPoolMesh = new THREE.Mesh(poolGeo, poolMat);
        groundPoolMesh.visible = isNight;
        groundPoolMesh.renderOrder = 9;
        g.add(groundPoolMesh);

        // 3. Taillight Ground Glow (Soft red illumination behind vehicle)
        const tailGlowGeo = new THREE.PlaneGeometry(width * 1.4, 2.0);
        tailGlowGeo.rotateX(-Math.PI / 2);
        tailGlowGeo.translate(-length * 0.5 - 0.8, 0.14, 0);

        const tailGlowMat = new THREE.MeshBasicMaterial({
            map: getTailGlowTexture(),
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        });
        const tailGlowMesh = new THREE.Mesh(tailGlowGeo, tailGlowMat);
        tailGlowMesh.visible = isNight;
        tailGlowMesh.renderOrder = 9;
        g.add(tailGlowMesh);

        g.userData.nightLights = {
            groundBeam: groundPoolMesh,
            glowSprites: [glowL, glowR],
            tailGlow: tailGlowMesh,
            tailGlowMat: tailGlowMat,
            headlights: [hl, hr],
            taillights: [tl, tr],
            hlMat: hlMat,
            tlMat: tlMat,
            beamOffset: length * 0.5 + 0.15,
            beamY: wheelR + 0.42
        };
        Visual3D.state.vehicleLightGroups.push(g.userData.nightLights);

        return g;
    }

    function createMotorcycle(length, width, colorValue) {
        const g = new THREE.Group();
        const mats = sharedCarMats();
        const paint = getPaint(colorValue);
        const isNight = !!Visual3D.state.isNight;

        const wheelR = 0.28;
        const wheelT = 0.10;

        // Front Wheel with Alloy Rim
        const fwGroup = new THREE.Group();
        const fw = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelT, 16), mats.tire);
        fw.rotation.x = Math.PI / 2;
        fw.castShadow = true;
        fwGroup.add(fw);

        const fwRim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, wheelT * 1.05, 14), mats.rim);
        fwRim.rotation.x = Math.PI / 2;
        fwGroup.add(fwRim);

        const fwHub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.24, wheelR * 0.24, wheelT * 1.15, 10), mats.chrome);
        fwHub.rotation.x = Math.PI / 2;
        fwGroup.add(fwHub);

        fwGroup.position.set(length * 0.36, wheelR, 0);
        g.add(fwGroup);

        // Rear Wheel with Alloy Rim
        const bwGroup = fwGroup.clone();
        bwGroup.position.x = -length * 0.36;
        g.add(bwGroup);

        const body = new THREE.Mesh(new THREE.BoxGeometry(length * 0.48, 0.24, width * 0.44), paint);
        body.position.set(0, wheelR + 0.12, 0);
        body.castShadow = true;
        g.add(body);

        const tank = new THREE.Mesh(new THREE.BoxGeometry(length * 0.24, 0.18, width * 0.34), paint);
        tank.position.set(length * 0.09, wheelR + 0.28, 0);
        g.add(tank);

        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.60, 0.07), mats.chrome);
        fork.position.set(length * 0.28, wheelR + 0.34, 0);
        fork.rotation.z = -Math.PI / 7;
        g.add(fork);

        // ★ 穿模修復：把手長度隨車寬收縮（原固定 0.64 會超出窄車身模擬足跡）
        const barLen = Math.min(0.52, width * 1.0);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, barLen, 8), mats.plastic);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(length * 0.24, wheelR + 0.62, 0);
        g.add(bar);

        const isDelivery = Math.random() < 0.35;
        if (isDelivery) {
            const deliveryColors = [0x00c060, 0xf43f5e, 0xfbbf24, 0x2563eb];
            const boxColor = deliveryColors[(Math.random() * deliveryColors.length) | 0];
            const boxMat = new THREE.MeshStandardMaterial({ color: boxColor, roughness: 0.35, metalness: 0.05 });
            const deliveryBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.42), boxMat);
            deliveryBox.position.set(-length * 0.30, wheelR + 0.46, 0);
            deliveryBox.castShadow = true;
            g.add(deliveryBox);
        }

        // Rider with dynamic stylish jacket & helmet
        const rider = new THREE.Group();
        const jacketColors = [0x2563eb, 0xd97706, 0x059669, 0xdc2626, 0x475569, 0x7c3aed, 0x0284c7, 0x334155, 0xf59e0b];
        const helmetColors = [0xf8fafc, 0xf59e0b, 0xef4444, 0x2563eb, 0x10b981, 0x334155];
        const jacketMat = new THREE.MeshStandardMaterial({
            color: jacketColors[(Math.random() * jacketColors.length) | 0],
            roughness: 0.55
        });
        const helmetMat = new THREE.MeshPhysicalMaterial({
            color: helmetColors[(Math.random() * helmetColors.length) | 0],
            roughness: 0.12,
            metalness: 0.08,
            envMapIntensity: 2.0,
            clearcoat: 1.0
        });

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.44, 0.28), jacketMat);
        torso.position.set(-0.06, 0.26, 0);
        torso.castShadow = true;
        rider.add(torso);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), helmetMat);
        head.position.set(0.02, 0.62, 0);
        head.castShadow = true;
        rider.add(head);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.18), mats.darkGlass);
        visor.position.set(0.11, 0.60, 0);
        rider.add(visor);

        const armGeo = new THREE.BoxGeometry(0.08, 0.22, 0.08);
        const forearmGeo = new THREE.BoxGeometry(0.07, 0.22, 0.07);
        const handGeo = new THREE.BoxGeometry(0.08, 0.07, 0.08);

        const leftUpperArm = new THREE.Mesh(armGeo, jacketMat);
        leftUpperArm.position.set(0.10, 0.32, 0.18);
        leftUpperArm.rotation.set(0.12, -0.15, -0.65);
        const leftForearm = new THREE.Mesh(forearmGeo, jacketMat);
        leftForearm.position.set(0.24, 0.22, 0.18);
        leftForearm.rotation.set(-0.08, 0.25, -1.15);
        const leftHand = new THREE.Mesh(handGeo, mats.skin);
        // ★ 穿模修復：手部內收至把手上（原 ±0.26 超出窄車身模擬足跡）
        leftHand.position.set(0.33, 0.16, barLen * 0.40);
        rider.add(leftUpperArm, leftForearm, leftHand);

        const rightUpperArm = new THREE.Mesh(armGeo, jacketMat);
        rightUpperArm.position.set(0.10, 0.32, -0.18);
        rightUpperArm.rotation.set(-0.12, 0.15, -0.65);
        const rightForearm = new THREE.Mesh(forearmGeo, jacketMat);
        rightForearm.position.set(0.24, 0.22, -0.18);
        rightForearm.rotation.set(0.08, -0.25, -1.15);
        const rightHand = new THREE.Mesh(handGeo, mats.skin);
        rightHand.position.set(0.33, 0.16, -barLen * 0.40);
        rider.add(rightUpperArm, rightForearm, rightHand);

        const thighGeo = new THREE.BoxGeometry(0.22, 0.10, 0.10);
        const legGeo = new THREE.BoxGeometry(0.09, 0.20, 0.09);

        const leftThigh = new THREE.Mesh(thighGeo, mats.pants);
        leftThigh.position.set(0.06, 0.07, 0.12);
        leftThigh.rotation.set(0.15, 0.10, -0.40);
        const leftLeg = new THREE.Mesh(legGeo, mats.pants);
        leftLeg.position.set(0.16, -0.06, 0.14);
        leftLeg.rotation.set(0, 0, 0.20);

        const rightThigh = new THREE.Mesh(thighGeo, mats.pants);
        rightThigh.position.set(0.06, 0.07, -0.12);
        rightThigh.rotation.set(-0.15, -0.10, -0.40);
        const rightLeg = new THREE.Mesh(legGeo, mats.pants);
        rightLeg.position.set(0.16, -0.06, -0.14);
        rightLeg.rotation.set(0, 0, 0.20);

        rider.add(leftThigh, leftLeg, rightThigh, rightLeg);
        rider.position.set(-0.06, wheelR + 0.26, 0);
        rider.rotation.z = 0.18;
        g.add(rider);

        // LED Headlight & Taillight
        const hlMat = new THREE.MeshStandardMaterial({
            color: 0xfffae6,
            emissive: 0xfffae6,
            emissiveIntensity: isNight ? 1.2 : 0.80,
            roughness: 0.12
        });
        const headLight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), hlMat);
        headLight.position.set(length * 0.32, wheelR + 0.46, 0);
        g.add(headLight);

        const tlMat = new THREE.MeshStandardMaterial({
            color: 0x880e0e,
            emissive: 0xff2020,
            emissiveIntensity: isNight ? 0.85 : 0.75,
            roughness: 0.20
        });
        const tailGeo = new THREE.BoxGeometry(0.06, 0.10, 0.14);
        const tailMesh = new THREE.Mesh(tailGeo, tlMat);
        tailMesh.position.set(-length * 0.36, wheelR + 0.38, 0);
        g.add(tailMesh);

        // Headlight Lens Flare Sprite (柔和微縮光暈)
        const headGlowMat = new THREE.SpriteMaterial({
            map: getRadialGlowTexture(),
            color: 0xfff2d6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.20
        });
        const glowSprite = new THREE.Sprite(headGlowMat);
        glowSprite.scale.setScalar(0.24);
        glowSprite.position.set(length * 0.32 + 0.06, wheelR + 0.46, 0);
        glowSprite.visible = isNight;
        g.add(glowSprite);

        // Ground Light Pool (Elevated to y = 0.14 above asphalt)
        const beamLen = 7.0;
        const beamW = 1.4;
        const groundBeamGeo = new THREE.PlaneGeometry(beamLen, beamW);
        groundBeamGeo.rotateX(-Math.PI / 2);
        groundBeamGeo.translate(length * 0.32 + beamLen * 0.5, 0.14, 0);

        const groundBeamMat = new THREE.MeshBasicMaterial({
            map: getSingleHeadlightBeamTexture(),
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        });
        const groundBeamMesh = new THREE.Mesh(groundBeamGeo, groundBeamMat);
        groundBeamMesh.visible = isNight;
        groundBeamMesh.renderOrder = 9;
        g.add(groundBeamMesh);

        // Tail Ground Glow
        const tailGlowGeo = new THREE.PlaneGeometry(0.85, 1.2);
        tailGlowGeo.rotateX(-Math.PI / 2);
        tailGlowGeo.translate(-length * 0.36 - 0.5, 0.14, 0);

        const tailGlowMat = new THREE.MeshBasicMaterial({
            map: getTailGlowTexture(),
            transparent: true,
            opacity: 0.10,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        });
        const tailGlowMesh = new THREE.Mesh(tailGlowGeo, tailGlowMat);
        tailGlowMesh.visible = isNight;
        tailGlowMesh.renderOrder = 9;
        g.add(tailGlowMesh);

        g.userData.nightLights = {
            groundBeam: groundBeamMesh,
            glowSprites: [glowSprite],
            tailGlow: tailGlowMesh,
            tailGlowMat: tailGlowMat,
            headlights: [headLight],
            taillights: [tailMesh],
            hlMat: hlMat,
            tlMat: tlMat,
            beamOffset: length * 0.32 + 0.12,
            beamY: wheelR + 0.46
        };
        Visual3D.state.vehicleLightGroups.push(g.userData.nightLights);

        return g;
    }

    // =========================================================================
    // 8. City Dressing & Street Infrastructure (Trees, Lamps, Curbs, Roofs)
    // =========================================================================
    function createTreeInstanced(treesData) {
        const group = new THREE.Group();
        if (!treesData || !treesData.length) return group;

        const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 2.0, 7);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x4f3622,
            roughness: 0.95,
            metalness: 0.0
        });

        const canopyGeo = new THREE.IcosahedronGeometry(1.25, 1);
        const canopyMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.85,
            metalness: 0.0,
            vertexColors: false
        });

        const iTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, treesData.length);
        const iCanopy = new THREE.InstancedMesh(canopyGeo, canopyMat, treesData.length);
        iTrunk.castShadow = true;
        iCanopy.castShadow = true;
        iCanopy.receiveShadow = true;
        iTrunk.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const c = new THREE.Color();

        treesData.forEach((data, i) => {
            const s = data.sx || 1;
            dummy.position.set(data.x, 1.0 * s, data.z);
            dummy.rotation.set(0, (data.x + data.z) * 0.15, 0);
            dummy.scale.set(s, 1.2 * s, s);
            dummy.updateMatrix();
            iTrunk.setMatrixAt(i, dummy.matrix);

            dummy.position.set(data.x, 2.4 * s, data.z);
            dummy.scale.set(1.35 * s, 1.20 * s, 1.30 * s);
            dummy.updateMatrix();
            iCanopy.setMatrixAt(i, dummy.matrix);

            c.setHex(FOLIAGE_COLORS[i % FOLIAGE_COLORS.length]);
            iCanopy.setColorAt(i, c);
        });

        iTrunk.instanceMatrix.needsUpdate = true;
        iCanopy.instanceMatrix.needsUpdate = true;
        if (iCanopy.instanceColor) iCanopy.instanceColor.needsUpdate = true;

        group.add(iTrunk, iCanopy);
        return group;
    }

    function createWaterMesh(data) {
        const geo = new THREE.CircleGeometry(1, 36);
        const mat = new THREE.MeshPhysicalMaterial({
            color: 0x2ca0b8,
            roughness: 0.04,
            metalness: 0.10,
            transparent: true,
            opacity: 0.90,
            envMapIntensity: 1.8,
            clearcoat: 1.0,
            clearcoatRoughness: 0.06
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(data.x, 0.12, data.z);
        mesh.scale.set(data.r, data.r, 1);
        mesh.receiveShadow = true;

        Visual3D.state.waterMeshes.push(mesh);
        return mesh;
    }

    function createClouds(minX, maxX, minY, maxY, rng) {
        const group = new THREE.Group();
        const mapArea = Math.max(1, (maxX - minX) * (maxY - minY));
        const totalClouds = Math.max(5, Math.min(22, Math.floor(mapArea / 85000)));

        const geo = new THREE.SphereGeometry(1, 10, 8);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.90,
            metalness: 0.0,
            transparent: true,
            opacity: 0.88,
            envMapIntensity: 0.30,
            depthWrite: false
        });

        const puffsPerCloud = 12;
        const totalPuffs = totalClouds * puffsPerCloud;
        const mesh = new THREE.InstancedMesh(geo, mat, totalPuffs);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;

        const dummy = new THREE.Object3D();
        let idx = 0;

        for (let i = 0; i < totalClouds; i++) {
            const cx = rng.range(minX - 220, maxX + 220);
            const cz = rng.range(minY - 220, maxY + 220);
            const h = rng.range(150, 240);
            const base = rng.range(22, 45);

            for (let j = 0; j < puffsPerCloud && idx < totalPuffs; j++) {
                const a = rng.next() * Math.PI * 2;
                const r = Math.sqrt(rng.next()) * base * 0.75;
                dummy.position.set(cx + Math.cos(a) * r, h + rng.range(-3, 8), cz + Math.sin(a) * r);
                dummy.scale.set(base * rng.range(0.38, 0.75), base * rng.range(0.18, 0.35), base * rng.range(0.38, 0.75));
                dummy.rotation.set(0, rng.next() * Math.PI, 0);
                dummy.updateMatrix();
                mesh.setMatrixAt(idx++, dummy.matrix);
            }
        }

        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.drift = true;
        group.add(mesh);
        Visual3D.state.clouds = group;
        return group;
    }

    function createUrbanPark(x, z, radius) {
        const park = new THREE.Group();
        park.position.set(x, 0, z);

        const ground = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshStandardMaterial({
            color: 0x62b23a,
            roughness: 0.90,
            metalness: 0.0
        }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0.12;
        ground.receiveShadow = true;
        park.add(ground);

        const path = new THREE.Mesh(new THREE.RingGeometry(radius * 0.40, radius * 0.54, 48), new THREE.MeshStandardMaterial({
            color: 0xe6e1d5,
            roughness: 0.85
        }));
        path.rotation.x = -Math.PI / 2;
        path.position.y = 0.14;
        park.add(path);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, 0.24, 8, 48), new THREE.MeshStandardMaterial({
            color: 0x88929e,
            roughness: 0.55
        }));
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = 0.25;
        park.add(rim);

        const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.9, 0.75, 24), new THREE.MeshStandardMaterial({
            color: 0xb0b8c0,
            roughness: 0.48,
            metalness: 0.18
        }));
        basin.position.y = 0.48;
        basin.castShadow = true;
        park.add(basin);

        const water = new THREE.Mesh(new THREE.CircleGeometry(3.9, 24), new THREE.MeshPhysicalMaterial({
            color: 0x2ca0b8,
            roughness: 0.04,
            metalness: 0.10,
            transparent: true,
            opacity: 0.90,
            envMapIntensity: 1.8
        }));
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.84;
        park.add(water);

        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.8, 8), new THREE.MeshStandardMaterial({
            color: 0xb2b8be,
            metalness: 0.65,
            roughness: 0.28
        }));
        spout.position.y = 1.45;
        park.add(spout);

        const benchWood = new THREE.MeshStandardMaterial({ color: 0x5c381e, roughness: 0.85 });
        const benchIron = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.55 });
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const bx = Math.cos(a) * radius * 0.64;
            const bz = Math.sin(a) * radius * 0.64;

            const bench = new THREE.Group();
            const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.52), benchWood);
            seat.position.y = 0.45;
            bench.add(seat);

            const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.46, 0.08), benchWood);
            back.position.set(0, 0.72, -0.23);
            bench.add(back);

            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.08), benchIron);
            const l1 = leg.clone(); l1.position.set(-0.72, 0.22, 0.18);
            const l2 = leg.clone(); l2.position.set(0.72, 0.22, 0.18);
            const l3 = leg.clone(); l3.position.set(-0.72, 0.22, -0.18);
            const l4 = leg.clone(); l4.position.set(0.72, 0.22, -0.18);
            bench.add(l1, l2, l3, l4);

            bench.position.set(bx, 0, bz);
            bench.rotation.y = -a + Math.PI / 2;
            bench.castShadow = true;
            park.add(bench);
        }

        const treeLocal = [];
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2 + 0.18;
            const r = radius * (0.74 + (i % 3) * 0.06);
            treeLocal.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, sx: 1.15 + (i % 4) * 0.12 });
        }
        const trees = createTreeInstanced(treeLocal);
        park.add(trees);

        return {
            mesh: park,
            update: function () {}
        };
    }

    // =========================================================================
    // Road & Lane Spatial Detection
    // =========================================================================
    function isPointInPoly2D(px, pz, poly) {
        if (!poly || poly.length < 3) return false;
        let inside = false;
        const n = poly.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = poly[i].x !== undefined ? poly[i].x : poly[i][0];
            const zi = poly[i].y !== undefined ? poly[i].y : (poly[i].z !== undefined ? poly[i].z : poly[i][1]);
            const xj = poly[j].x !== undefined ? poly[j].x : poly[j][0];
            const zj = poly[j].y !== undefined ? poly[j].y : (poly[j].z !== undefined ? poly[j].z : poly[j][1]);

            const intersect = ((zi > pz) !== (zj > pz)) &&
                (px < (xj - xi) * (pz - zi) / (zj - zi + 1e-12) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function distToSegmentSq(px, pz, x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 1e-12) {
            const dpx = px - x1, dpz = pz - z1;
            return dpx * dpx + dpz * dpz;
        }
        let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + t * dx;
        const cz = z1 + t * dz;
        const diffX = px - cx;
        const diffZ = pz - cz;
        return diffX * diffX + diffZ * diffZ;
    }

    function isPointInTriangle2D(px, pz, ax, az, bx, bz, cx, cz) {
        const v0x = cx - ax, v0z = cz - az;
        const v1x = bx - ax, v1z = bz - az;
        const v2x = px - ax, v2z = pz - az;

        const dot00 = v0x * v0x + v0z * v0z;
        const dot01 = v0x * v1x + v0z * v1z;
        const dot02 = v0x * v2x + v0z * v2z;
        const dot11 = v1x * v1x + v1z * v1z;
        const dot12 = v1x * v2x + v1z * v2z;

        const denom = dot00 * dot11 - dot01 * dot01;
        if (Math.abs(denom) < 1e-12) return false;
        const invDenom = 1.0 / denom;
        const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
        const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

        return (u >= -0.01) && (v >= -0.01) && (u + v <= 1.01);
    }

    function buildRoadSpatialIndex() {
        const scene = Visual3D.state.scene;
        const triangles = [];
        const polygons = [];
        const segments = [];

        if (scene) {
            const tempV1 = new THREE.Vector3();
            const tempV2 = new THREE.Vector3();
            const tempV3 = new THREE.Vector3();

            scene.traverse((obj) => {
                if (!obj.isMesh || !obj.geometry) return;
                
                const isNetworkChild = (obj.parent && obj.parent.name === 'networkGroup') ||
                    (obj.parent && obj.parent.children && obj.position && obj.position.y <= 0.25 && obj.position.y >= 0.04);
                const mat = obj.material;
                const isRoadMat = mat && (
                    mat === CACHE.asphaltMat ||
                    (mat.name && (mat.name.includes('asphalt') || mat.name.includes('road'))) ||
                    (mat.customProgramCacheKey && mat.customProgramCacheKey().includes('asphalt')) ||
                    (mat.polygonOffsetFactor && mat.polygonOffsetFactor >= 1) ||
                    (obj.position && obj.position.y >= 0.05 && obj.position.y <= 0.22 && !mat.wireframe)
                );

                if (obj.name && (obj.name.includes('car') || obj.name.includes('tree') || obj.name.includes('building') || obj.name.includes('cloud') || obj.name.includes('water') || obj.name.includes('pedestrian'))) return;
                if (obj.geometry.type === 'BoxGeometry' && obj.scale && obj.scale.y > 1.0) return;

                if (isRoadMat || isNetworkChild) {
                    obj.updateMatrixWorld(true);
                    const geo = obj.geometry;
                    const pos = geo.attributes.position;
                    const index = geo.index;
                    const matWorld = obj.matrixWorld;

                    if (pos) {
                        if (index) {
                            for (let i = 0; i < index.count; i += 3) {
                                tempV1.fromBufferAttribute(pos, index.getX(i)).applyMatrix4(matWorld);
                                tempV2.fromBufferAttribute(pos, index.getX(i + 1)).applyMatrix4(matWorld);
                                tempV3.fromBufferAttribute(pos, index.getX(i + 2)).applyMatrix4(matWorld);
                                triangles.push({
                                    ax: tempV1.x, az: tempV1.z,
                                    bx: tempV2.x, bz: tempV2.z,
                                    cx: tempV3.x, cz: tempV3.z
                                });
                            }
                        } else {
                            for (let i = 0; i < pos.count; i += 3) {
                                tempV1.fromBufferAttribute(pos, i).applyMatrix4(matWorld);
                                tempV2.fromBufferAttribute(pos, i + 1).applyMatrix4(matWorld);
                                tempV3.fromBufferAttribute(pos, i + 2).applyMatrix4(matWorld);
                                triangles.push({
                                    ax: tempV1.x, az: tempV1.z,
                                    bx: tempV2.x, bz: tempV2.z,
                                    cx: tempV3.x, cz: tempV3.z
                                });
                            }
                        }
                    }
                }
            });
        }

        const netData = Visual3D.state.networkData || (typeof window !== 'undefined' ? (window.networkData || window.netData) : null);
        if (netData) {
            if (netData.links) {
                const links = Array.isArray(netData.links) ? netData.links : Object.values(netData.links);
                links.forEach((l) => {
                    let lanes = [];
                    if (l && l.lanes) {
                        if (Array.isArray(l.lanes)) lanes = l.lanes;
                        else if (typeof l.lanes === 'object') lanes = Object.values(l.lanes);
                    }
                    lanes.forEach((lane) => {
                        if (!lane || typeof lane !== 'object') return;
                        const path = lane.path || lane.points || lane.waypoints;
                        if (path && path.length >= 2) {
                            for (let i = 0; i < path.length - 1; i++) {
                                const p1 = path[i], p2 = path[i + 1];
                                if (!p1 || !p2) continue;
                                segments.push({
                                    x1: p1.x, z1: p1.y !== undefined ? p1.y : p1.z,
                                    x2: p2.x, z2: p2.y !== undefined ? p2.y : p2.z,
                                    radiusSq: Math.pow((lane.width || 3.5) * 0.65, 2)
                                });
                            }
                        }
                    });
                });
            }
            if (netData.nodes) {
                const nodes = Array.isArray(netData.nodes) ? netData.nodes : Object.values(netData.nodes);
                nodes.forEach((n) => {
                    if (n.polygon && n.polygon.length >= 3) {
                        polygons.push(n.polygon);
                    }
                });
            }
        }

        return {
            isInside: function (px, pz, tolerance = 0) {
                for (let i = 0; i < polygons.length; i++) {
                    if (isPointInPoly2D(px, pz, polygons[i])) return true;
                }
                for (let i = 0; i < triangles.length; i++) {
                    const t = triangles[i];
                    if (isPointInTriangle2D(px, pz, t.ax, t.az, t.bx, t.bz, t.cx, t.cz)) return true;
                }
                for (let i = 0; i < segments.length; i++) {
                    const s = segments[i];
                    const dSq = distToSegmentSq(px, pz, s.x1, s.z1, s.x2, s.z2);
                    if (dSq <= s.radiusSq + tolerance * tolerance) return true;
                }
                return false;
            }
        };
    }

    function createSidewalks(items, renderer) {
        const group = new THREE.Group();
        if (!items || !items.length) return group;

        const spatial = buildRoadSpatialIndex();

        const validItems = items.filter(d => {
            const hw = (d.sx || 8.0) * 0.48;
            const hl = (d.sz || 2.25) * 0.48;
            const angle = d.ry || 0;
            const cosR = Math.cos(angle);
            const sinR = Math.sin(angle);
            const fx = -sinR, fz = cosR;
            const rx = sinR, rz = cosR;

            const samplePoints = [
                { x: d.x, z: d.z },
                { x: d.x + fx * hl + rx * hw, z: d.z + fz * hl + rz * hw },
                { x: d.x + fx * hl - rx * hw, z: d.z + fz * hl - rz * hw },
                { x: d.x - fx * hl + rx * hw, z: d.z - fz * hl + rz * hw },
                { x: d.x - fx * hl - rx * hw, z: d.z - fz * hl - rz * hw }
            ];

            for (let p = 0; p < samplePoints.length; p++) {
                if (spatial.isInside(samplePoints[p].x, samplePoints[p].z, 0.15)) {
                    return false;
                }
            }
            return true;
        });

        if (!validItems.length) return group;

        const geo = new THREE.BoxGeometry(1, 0.14, 1);
        const mat = createConcreteMaterial(renderer);
        const mesh = new THREE.InstancedMesh(geo, mat, validItems.length);
        mesh.receiveShadow = true;
        mesh.castShadow = false;

        const dummy = new THREE.Object3D();
        validItems.forEach((d, i) => {
            dummy.position.set(d.x, 0.08, d.z);
            dummy.rotation.set(0, d.ry || 0, 0);
            dummy.scale.set(d.sx || 8.0, 1, d.sz || 2.25);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
        return group;
    }

    function createLamps(items) {
        const group = new THREE.Group();
        if (!items || !items.length) return group;

        const spatial = buildRoadSpatialIndex();

        const validItems = items.filter(d => {
            if (spatial.isInside(d.x, d.z, 0.35)) return false;
            return true;
        });

        if (!validItems.length) return group;

        // 重置路燈燈頭位置登錄 (城市重建時避免殘留舊座標)
        Visual3D.state.lampHeads.length = 0;

        const poleGeo = new THREE.CylinderGeometry(0.07, 0.10, 6.4, 8);
        poleGeo.translate(0, 3.2, 0);

        const armGeo = new THREE.BoxGeometry(2.2, 0.08, 0.08);
        armGeo.translate(1.10, 6.25, 0);

        const headGeo = new THREE.BoxGeometry(0.52, 0.14, 0.28);
        headGeo.translate(2.20, 6.12, 0);

        const metal = new THREE.MeshStandardMaterial({
            color: 0x2e333a,
            roughness: 0.38,
            metalness: 0.70
        });

        const isNight = !!Visual3D.state.isNight;

        const glowMat = new THREE.MeshStandardMaterial({
            color: isNight ? 0xffdf80 : 0xfff4d2,
            emissive: isNight ? 0xff9020 : 0xfae088,
            emissiveIntensity: isNight ? 0.75 : 0.50,
            roughness: 0.25
        });
        glowMat.name = 'lampGlowMat';
        Visual3D.state.lampGlowMats.push(glowMat);

        const iPole = new THREE.InstancedMesh(poleGeo, metal, validItems.length);
        const iArm = new THREE.InstancedMesh(armGeo, metal, validItems.length);
        const iHead = new THREE.InstancedMesh(headGeo, glowMat, validItems.length);
        iPole.castShadow = true;
        iArm.castShadow = true;

        // Ground Light Pools (InstancedMesh - 柔和溫暖的 14m 地面光池)
        const poolGeo = new THREE.PlaneGeometry(14.0, 14.0);
        poolGeo.rotateX(-Math.PI / 2);

        const poolMat = new THREE.MeshBasicMaterial({
            map: getStreetlightPoolTexture(),
            transparent: true,
            opacity: 0.32,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            side: THREE.DoubleSide
        });
        const iPool = new THREE.InstancedMesh(poolGeo, poolMat, validItems.length);
        iPool.visible = isNight;
        iPool.renderOrder = 8;
        Visual3D.state.lampPools.push(iPool);

        // Lamp Head Lens Flare Sprite Material (細緻柔和小光暈)
        const spriteMat = new THREE.SpriteMaterial({
            map: getRadialGlowTexture(),
            color: 0xffaa38,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: isNight ? 0.18 : 0.0,
            depthWrite: false
        });

        const dummy = new THREE.Object3D();
        const poolDummy = new THREE.Object3D();

        validItems.forEach((d, i) => {
            dummy.position.set(d.x, 0, d.z);
            dummy.rotation.set(0, d.ry || 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            iPole.setMatrixAt(i, dummy.matrix);
            iArm.setMatrixAt(i, dummy.matrix);
            iHead.setMatrixAt(i, dummy.matrix);

            const headOffset = 2.20;
            const ry = d.ry || 0;
            const hx = d.x + headOffset * Math.cos(ry);
            const hz = d.z - headOffset * Math.sin(ry);

            // 登錄燈頭世界座標，供動態真實光源池 (PointLight) 每帧挑選最近路燈
            Visual3D.state.lampHeads.push({ x: hx, y: 6.02, z: hz });

            // Elevated to y = 0.14 to sit cleanly above asphalt (y = 0.10) and markings (y = 0.12)
            poolDummy.position.set(hx, 0.14, hz);
            poolDummy.rotation.set(0, ry, 0);
            poolDummy.scale.set(1, 1, 1);
            poolDummy.updateMatrix();
            iPool.setMatrixAt(i, poolDummy.matrix);

            // Lamp Luminaire Head Glare Sprite (精緻小巧 0.28m)
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.set(hx, 6.12, hz);
            sprite.scale.setScalar(0.28);
            sprite.visible = isNight;
            group.add(sprite);
            Visual3D.state.lampGlowSprites.push(sprite);
        });

        iPole.instanceMatrix.needsUpdate = true;
        iArm.instanceMatrix.needsUpdate = true;
        iHead.instanceMatrix.needsUpdate = true;
        iPool.instanceMatrix.needsUpdate = true;

        group.add(iPole, iArm, iHead, iPool);
        return group;
    }

    function createRoofDetails(buildingsData) {
        const group = new THREE.Group();
        const items = [];
        const beaconItems = [];

        buildingsData.forEach((b) => {
            if (b.sy < 14) return;
            const topY = b.y + b.sy * 0.5;

            // 1. Primary HVAC Chiller / Elevator Penthouse
            items.push({
                x: b.x + (b.sx * 0.18),
                y: topY + 0.45,
                z: b.z + (b.sz * 0.12),
                sx: 1.6, sy: 0.85, sz: 1.2,
                ry: b.ry
            });

            // 2. Secondary Rooftop Water Tank or Vent Unit
            if (b.sy > 35) {
                items.push({
                    x: b.x - (b.sx * 0.20),
                    y: topY + 0.70,
                    z: b.z - (b.sz * 0.15),
                    sx: 0.9, sy: 1.35, sz: 0.9,
                    ry: b.ry
                });

                // Red Aviation Obstruction Beacon Light atop skyscraper
                beaconItems.push({
                    x: b.x,
                    y: topY + 1.6,
                    z: b.z
                });
            }
        });

        if (items.length) {
            const geo = new THREE.BoxGeometry(1, 1, 1);
            const mat = new THREE.MeshStandardMaterial({
                color: 0x646b73,
                roughness: 0.52,
                metalness: 0.40
            });

            const mesh = new THREE.InstancedMesh(geo, mat, items.length);
            mesh.castShadow = true;
            const dummy = new THREE.Object3D();

            items.forEach((d, i) => {
                dummy.position.set(d.x, d.y, d.z);
                dummy.rotation.y = d.ry || 0;
                dummy.scale.set(d.sx, d.sy, d.sz);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            });

            mesh.instanceMatrix.needsUpdate = true;
            group.add(mesh);
        }

        // Add skyscraper red beacon glow sprites
        if (beaconItems.length) {
            const beaconMat = new THREE.SpriteMaterial({
                map: getRadialGlowTexture(),
                color: 0xff1a1a,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                transparent: true,
                opacity: Visual3D.state.isNight ? 0.95 : 0.0
            });
            beaconItems.forEach(b => {
                const s = new THREE.Sprite(beaconMat);
                s.position.set(b.x, b.y, b.z);
                s.scale.setScalar(1.8);
                s.visible = !!Visual3D.state.isNight;
                group.add(s);
                Visual3D.state.lampGlowSprites.push(s);
            });
        }

        return group;
    }

    function createLotPads(buildingsData, renderer) {
        const group = new THREE.Group();
        if (!buildingsData || !buildingsData.length) return group;

        const geo = new THREE.BoxGeometry(1, 0.08, 1);
        const mat = createConcreteMaterial(renderer);
        const mesh = new THREE.InstancedMesh(geo, mat, buildingsData.length);
        mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        buildingsData.forEach((b, i) => {
            dummy.position.set(b.x, 0.02, b.z);
            dummy.rotation.y = b.ry || 0;
            dummy.scale.set(b.sx + 2.4, 1, b.sz + 2.4);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
        return group;
    }

    // =========================================================================
    // 9. 3D Traffic Signal Blooming Glow Sprites
    // =========================================================================
    function createSignalGlow(colorHex) {
        const mat = new THREE.SpriteMaterial({
            map: getRadialGlowTexture(),
            color: colorHex || 0x34c759,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.25
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.setScalar(0.28);
        sprite.visible = false;
        Visual3D.state.signalGlows.push(sprite);
        return sprite;
    }

    // =========================================================================
    // 10. Night Mode Controller, Vehicle & Pedestrian Cleaners
    // =========================================================================
    function cleanVehicleLights() {
        Visual3D.state.vehicleLightGroups = Visual3D.state.vehicleLightGroups.filter(l => {
            return l.groundBeam && l.groundBeam.parent;
        });
    }

    // 行人材質註冊與夜間自適應管理
    function registerPedestrianMaterial(mat, baseHex, isSkin) {
        if (!mat) return;
        mat.userData.baseColor = baseHex !== undefined ? baseHex : mat.color.getHex();
        mat.userData.isSkin = !!isSkin;
        mat.userData.nightEmissive = isSkin ? 0x24140c : 0x181a20;
        Visual3D.state.pedestrianMats.push(mat);
        applyPedestrianNightEnv(mat);
    }

    function applyPedestrianNightEnv(mat) {
        if (!mat || !mat.userData) return;
        const isNight = !!Visual3D.state.isNight;
        if (mat.userData.baseColor !== undefined) {
            if (isNight) {
                // 夜間提供細緻的環境光響應與微發光，確保暗處輪廓清晰且受燈光照耀時立體分明
                mat.emissive.setHex(mat.userData.nightEmissive || 0x16181e);
                mat.emissiveIntensity = 0.55;
                mat.roughness = mat.userData.isSkin ? 0.52 : 0.60;
            } else {
                mat.emissive.setHex(0x000000);
                mat.emissiveIntensity = 0.0;
                mat.roughness = mat.userData.isSkin ? 0.55 : 0.70;
            }
        }
    }

    function cleanPedestrianMaterials() {
        // 清理已銷毀的行人材質
        Visual3D.state.pedestrianMats = Visual3D.state.pedestrianMats.filter(m => m && !m.disposed);
    }

    // =========================================================================
    // 10a. Pooled Dynamic Real-Light System (路燈與車燈實際照亮周圍物件)
    //  以固定數量的 SpotLight/PointLight 組成光池，每帧依相機視角動態指派給
    //  最近的路燈與車輛，讓夜間光源真正照射到地面、建築、樹木與其他車輛。
    // =========================================================================

    // Lazy temp objects (avoid per-frame GC pressure)
    let _dynTemps = null;
    function ensureDynTemps() {
        if (_dynTemps) return _dynTemps;
        _dynTemps = {
            a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(),
            focus: { x: 0, z: 0 },
            lampCand: [],
            headCand: [],
            brakeCand: []
        };
        return _dynTemps;
    }

    function ensureDynamicLightPools() {
        if (Visual3D.state.dynLightsReady) return true;
        const scene = Visual3D.state.scene;
        if (!scene || typeof THREE.SpotLight === 'undefined') return false;

        const mkSpot = (cfg) => {
            const sp = new THREE.SpotLight(cfg.color, 0, cfg.distance, cfg.angle, cfg.penumbra, cfg.decay);
            sp.position.set(0, -500, 0);
            sp.target.position.set(0, -500, 0);
            sp.castShadow = false;
            sp.visible = false;
            sp.userData.dynGoalIntensity = 0;
            sp.userData.dynGoalPos = new THREE.Vector3(0, -500, 0);
            sp.userData.dynGoalTarget = new THREE.Vector3(0, -500, 0);
            sp.userData.dynActive = false;
            scene.add(sp);
            scene.add(sp.target);
            return sp;
        };

        const mkPoint = (cfg) => {
            const p = new THREE.PointLight(cfg.color, 0, cfg.distance, cfg.decay);
            p.position.set(0, -500, 0);
            p.castShadow = false;
            p.visible = false;
            p.userData.dynGoalIntensity = 0;
            p.userData.dynGoalPos = new THREE.Vector3(0, -500, 0);
            p.userData.dynActive = false;
            scene.add(p);
            return p;
        };

        // 路燈用 PointLight：全向照射才能打到車身、行人與建築立面
        for (let i = 0; i < DYN_LIGHT_CFG.lamp.count; i++) Visual3D.state.lampLightPool.push(mkPoint(DYN_LIGHT_CFG.lamp));
        for (let i = 0; i < DYN_LIGHT_CFG.headlight.count; i++) Visual3D.state.headLightPool.push(mkSpot(DYN_LIGHT_CFG.headlight));
        for (let i = 0; i < DYN_LIGHT_CFG.headFill.count; i++) Visual3D.state.headFillPool.push(mkPoint(DYN_LIGHT_CFG.headFill));
        for (let i = 0; i < DYN_LIGHT_CFG.brake.count; i++) Visual3D.state.brakeLightPool.push(mkPoint(DYN_LIGHT_CFG.brake));

        Visual3D.state.dynLightsReady = true;
        console.log('[Visual3D] Dynamic light pools ready:',
            Visual3D.state.lampLightPool.length + Visual3D.state.headLightPool.length +
            Visual3D.state.headFillPool.length + Visual3D.state.brakeLightPool.length, 'real lights');
        return true;
    }

    // 依品質等級設定作用中的光源槽位 (超出的槽位隱藏以節省 GPU)
    function applyDynQuality(level) {
        const st = Visual3D.state;
        const q = Math.max(0, Math.min(DYN_LIGHT_CFG.quality.levels.length - 1, level));
        const lims = DYN_LIGHT_CFG.quality.levels[q];
        st.dynQuality = q;
        st.dynQLastChange = st.elapsedTime;

        // 僅在槽位增減時切換 visible (罕見事件，單次 shader 重建可接受)
        const trim = (pool, n) => pool.forEach((l, i) => {
            const active = st.dynLightsEnabled && i < n;
            l.visible = active;
            if (!active) {
                l.userData.dynActive = false;
                l.userData.dynGoalIntensity = 0;
                l.intensity = 0;
            }
        });

        trim(st.lampLightPool, lims.lamp);
        trim(st.headLightPool, lims.headlight);
        trim(st.headFillPool, lims.headlight);
        trim(st.brakeLightPool, lims.brake);
        console.log('[Visual3D] Dynamic light quality →', ['low', 'medium', 'high'][q]);
    }

    // 相機射線與地面交點作為「關注點」，挑選附近光源
    function computeCameraFocus(t) {
        const cam = Visual3D.state.camera;
        if (!cam) { t.x = 0; t.z = 0; return t; }
        cam.getWorldDirection(_dynTemps.a);
        const o = cam.position;
        if (_dynTemps.a.y < -0.03) {
            const dist = -o.y / _dynTemps.a.y;
            if (dist > 0 && dist < 30000) {
                t.x = o.x + _dynTemps.a.x * dist;
                t.z = o.z + _dynTemps.a.z * dist;
                return t;
            }
        }
        const hxz = Math.hypot(_dynTemps.a.x, _dynTemps.a.z);
        if (hxz > 1e-4) {
            t.x = o.x + (_dynTemps.a.x / hxz) * 320;
            t.z = o.z + (_dynTemps.a.z / hxz) * 320;
            return t;
        }
        t.x = o.x; t.z = o.z;
        return t;
    }

    // 每帧平滑移動/淡入淡出已指派的光源，避免切換時突兀跳動
    // 注意：不在此處切換 visible (避免中途觸發 shader 重新編譯卡頓)，
    //       光源可見性僅由 setDynamicLightsEnabled 於日夜切換時批次管理。
    function smoothDynamicLights(dt) {
        const kPos = 1 - Math.exp(-DYN_LIGHT_CFG.posLerpSpeed * dt);
        const kInt = 1 - Math.exp(-DYN_LIGHT_CFG.intensityLerpSpeed * dt);

        const snapIfFar = (l, hasTarget) => {
            const ud = l.userData;
            // 初次從池底升起、或改指派到遠處車輛時直接跳位，避免半秒無光
            if (l.position.y < -50 || l.position.distanceToSquared(ud.dynGoalPos) > 40 * 40) {
                l.position.copy(ud.dynGoalPos);
                if (hasTarget && ud.dynGoalTarget) l.target.position.copy(ud.dynGoalTarget);
                return true;
            }
            return false;
        };

        const smoothSpot = (l) => {
            const ud = l.userData;
            if (!snapIfFar(l, true)) {
                l.position.lerp(ud.dynGoalPos, kPos);
                l.target.position.lerp(ud.dynGoalTarget, kPos);
            }
            l.target.updateMatrixWorld();
            l.intensity += (ud.dynGoalIntensity - l.intensity) * kInt;
            if (!ud.dynActive && l.intensity < 0.5) l.intensity = 0;
        };

        const smoothPoint = (p) => {
            const ud = p.userData;
            if (!snapIfFar(p, false)) p.position.lerp(ud.dynGoalPos, kPos);
            p.intensity += (ud.dynGoalIntensity - p.intensity) * kInt;
            if (!ud.dynActive && p.intensity < 0.4) p.intensity = 0;
        };

        Visual3D.state.lampLightPool.forEach(smoothPoint);
        Visual3D.state.headLightPool.forEach(smoothSpot);
        Visual3D.state.headFillPool.forEach(smoothPoint);
        Visual3D.state.brakeLightPool.forEach(smoothPoint);
    }

    function updateDynamicLights(dt) {
        const st = Visual3D.state;
        if (!st.dynLightsEnabled || !st.isNight) return;
        if (!ensureDynamicLightPools()) return;
        const T = ensureDynTemps();
        const QC = DYN_LIGHT_CFG.quality;

        // 每帧平滑過渡
        smoothDynamicLights(dt);

        // --- FPS 自動品質調節 (指數移動平均，每 checkEverySec 評估一次) ---
        st.dynFpsEma = st.dynFpsEma > 0 ? st.dynFpsEma * 0.92 + dt * 0.08 : dt;
        if (st.dynQCheckAt < 0) st.dynQCheckAt = st.elapsedTime;
        if (st.elapsedTime - st.dynQCheckAt >= QC.checkEverySec &&
            st.elapsedTime - st.dynQLastChange >= QC.dwellSec) {
            const avgMs = st.dynFpsEma * 1000;
            if (avgMs > QC.downMs && st.dynQuality > 0) {
                applyDynQuality(st.dynQuality - 1);
                st.dynFpsEma = dt; // 重置觀測
            } else if (avgMs < QC.upMs && st.dynQuality < QC.levels.length - 1) {
                applyDynQuality(st.dynQuality + 1);
                st.dynFpsEma = dt;
            }
            st.dynQCheckAt = st.elapsedTime;
        }

        // 掃描節流：每 scanInterval 秒重新評估最近光源分配
        st.dynScanTimer += dt;
        if (st.dynScanTimer < DYN_LIGHT_CFG.scanInterval) return;
        st.dynScanTimer = 0;

        computeCameraFocus(T.focus);
        const fx = T.focus.x, fz = T.focus.z;
        const lims = QC.levels[st.dynQuality];

        // ---------------------------------------------------------------
        // A. 路燈：指派最近的燈頭位置
        // ---------------------------------------------------------------
        const lampCfg = DYN_LIGHT_CFG.lamp;
        const lampCand = T.lampCand;
        lampCand.length = 0;
        const heads = st.lampHeads;
        for (let i = 0; i < heads.length; i++) {
            const h = heads[i];
            const dx = h.x - fx, dz = h.z - fz;
            const d2 = dx * dx + dz * dz;
            if (d2 < lampCfg.maxRangeSq) lampCand.push({ d2: d2, h: h });
        }
        lampCand.sort((p, q) => p.d2 - q.d2);

        st.lampLightPool.forEach((pl, i) => {
            const cand = i < lims.lamp ? lampCand[i] : null;
            const ud = pl.userData;
            if (!cand) {
                ud.dynActive = false;
                ud.dynGoalIntensity = 0;
                return;
            }
            ud.dynActive = true;
            ud.dynGoalIntensity = lampCfg.intensity;
            // 略降於燈頭，讓能量更集中在路面、車身與行人高度
            ud.dynGoalPos.set(cand.h.x, Math.max(4.2, cand.h.y - 1.4), cand.h.z);
        });

        // ---------------------------------------------------------------
        // B. 車輛頭燈：指派最近的車輛 (真實 SpotLight 向前投射)
        // ---------------------------------------------------------------
        cleanVehicleLights();
        const headCfg = DYN_LIGHT_CFG.headlight;
        const headCand = T.headCand;
        headCand.length = 0;
        const brakeCfg = DYN_LIGHT_CFG.brake;
        const brakeCand = T.brakeCand;
        brakeCand.length = 0;

        st.vehicleLightGroups.forEach((nl) => {
            const grp = nl.groundBeam.parent;
            const gp = grp.position;
            const dx = gp.x - fx, dz = gp.z - fz;
            const d2 = dx * dx + dz * dz;
            if (d2 < headCfg.maxRangeSq) headCand.push({ d2: d2, nl: nl, grp: grp });
            // 煞車中 (script02 每帧會把 tlMat.emissiveIntensity 提升到 1.6)
            if (lims.brake > 0 && nl.tlMat && nl.tlMat.emissiveIntensity > 1.2 && d2 < brakeCfg.maxRangeSq) {
                brakeCand.push({ d2: d2, nl: nl, grp: grp });
            }
        });

        headCand.sort((p, q) => p.d2 - q.d2);
        brakeCand.sort((p, q) => p.d2 - q.d2);

        st.headLightPool.forEach((sp, i) => {
            const cand = i < lims.headlight ? headCand[i] : null;
            const ud = sp.userData;
            if (!cand) {
                ud.dynActive = false;
                ud.dynGoalIntensity = 0;
                return;
            }
            const grp = cand.grp;
            // 車頭朝向：局部 +X 軸轉世界座標
            T.b.set(1, 0, 0).applyQuaternion(grp.quaternion);
            T.b.y = 0;
            if (T.b.lengthSq() < 1e-6) T.b.set(1, 0, 0);
            T.b.normalize();

            const beamOff = cand.nl.beamOffset !== undefined ? cand.nl.beamOffset : 2.2;
            const beamY = cand.nl.beamY !== undefined ? cand.nl.beamY : 0.75;

            ud.dynActive = true;
            ud.dynGoalIntensity = headCfg.intensity;
            ud.dynGoalPos.set(
                grp.position.x + T.b.x * beamOff,
                beamY,
                grp.position.z + T.b.z * beamOff
            );
            // 瞄準車身/行人高度，而非地面，讓光束真正打到前方物件
            ud.dynGoalTarget.set(
                grp.position.x + T.b.x * (beamOff + DYN_LIGHT_CFG.beamReach),
                DYN_LIGHT_CFG.beamTargetY,
                grp.position.z + T.b.z * (beamOff + DYN_LIGHT_CFG.beamReach)
            );
        });

        // 近場補光：車頭前方短距 PointLight，照亮交會行人與鄰近車輛側面
        const fillCfg = DYN_LIGHT_CFG.headFill;
        st.headFillPool.forEach((pl, i) => {
            const cand = i < lims.headlight ? headCand[i] : null;
            const ud = pl.userData;
            if (!cand) {
                ud.dynActive = false;
                ud.dynGoalIntensity = 0;
                return;
            }
            const grp = cand.grp;
            T.b.set(1, 0, 0).applyQuaternion(grp.quaternion);
            T.b.y = 0;
            if (T.b.lengthSq() < 1e-6) T.b.set(1, 0, 0);
            T.b.normalize();
            const beamOff = cand.nl.beamOffset !== undefined ? cand.nl.beamOffset : 2.2;
            ud.dynActive = true;
            ud.dynGoalIntensity = fillCfg.intensity;
            ud.dynGoalPos.set(
                grp.position.x + T.b.x * (beamOff + DYN_LIGHT_CFG.fillForward),
                1.05,
                grp.position.z + T.b.z * (beamOff + DYN_LIGHT_CFG.fillForward)
            );
        });

        st.brakeLightPool.forEach((pl, i) => {
            const cand = i < lims.brake ? brakeCand[i] : null;
            const ud = pl.userData;
            if (!cand) {
                ud.dynActive = false;
                ud.dynGoalIntensity = 0;
                return;
            }
            const grp = cand.grp;
            T.c.set(-1, 0, 0).applyQuaternion(grp.quaternion);
            T.c.y = 0;
            if (T.c.lengthSq() < 1e-6) T.c.set(-1, 0, 0);
            T.c.normalize();

            ud.dynActive = true;
            ud.dynGoalIntensity = brakeCfg.intensity;
            ud.dynGoalPos.set(
                grp.position.x + T.c.x * 1.8,
                0.55,
                grp.position.z + T.c.z * 1.8
            );
        });
    }

    function setDynamicLightsEnabled(enabled) {
        const st = Visual3D.state;
        if (enabled && st.isNight) {
            st.dynLightsEnabled = true;
            st.dynQCheckAt = -1; // 重置 FPS 觀測窗口
            if (ensureDynamicLightPools()) {
                // 批次套用品質槽位 (單次 shader 重建，之後運行中不再切換)
                applyDynQuality(st.dynQuality);
            }
            return;
        }
        // 日間或關閉：釋放所有池內光源並隱藏
        st.dynLightsEnabled = false;
        const release = (l) => {
            if (!l) return;
            l.userData.dynActive = false;
            l.userData.dynGoalIntensity = 0;
            l.intensity = 0;
            l.visible = false;
        };
        st.lampLightPool.forEach(release);
        st.headLightPool.forEach(release);
        st.headFillPool.forEach(release);
        st.brakeLightPool.forEach(release);
    }

    function setNightMode(isNight) {
        Visual3D.state.isNight = !!isNight;
        const targetNight = isNight ? 1.0 : 0.0;
        Visual3D.state.nightFactor = targetNight;
        Visual3D.state.targetNightFactor = targetNight;

        const scene = Visual3D.state.scene;
        const renderer = Visual3D.state.renderer;

        // 1. Sky Uniform
        if (Visual3D.state.skyMat && Visual3D.state.skyMat.uniforms && Visual3D.state.skyMat.uniforms.uNight) {
            Visual3D.state.skyMat.uniforms.uNight.value = targetNight;
        }
        if (Visual3D.state.sky && Visual3D.state.sky.material && Visual3D.state.sky.material.uniforms && Visual3D.state.sky.material.uniforms.uNight) {
            Visual3D.state.sky.material.uniforms.uNight.value = targetNight;
        }

        // 2. Moon Sprite
        if (Visual3D.state.moonSprite && Visual3D.state.moonSprite.material) {
            Visual3D.state.moonSprite.material.opacity = isNight ? 0.92 : 0.0;
        }

        // 3. Scene Background, Fog & Environment Reflections
        if (scene) {
            const dayHorizon = 0xebf5ff;
            const nightHorizon = NIGHT_LOOK.horizon;
            const horizon = isNight ? nightHorizon : dayHorizon;
            scene.background = new THREE.Color(horizon);
            if (scene.fog) {
                scene.fog.color.setHex(horizon);
                scene.fog.near = isNight ? NIGHT_LOOK.fogNear : 2500;
                scene.fog.far = isNight ? NIGHT_LOOK.fogFar : 18000;
            }
            if (Visual3D.state.nightEnvMap && Visual3D.state.dayEnvMap) {
                scene.environment = isNight ? Visual3D.state.nightEnvMap : Visual3D.state.dayEnvMap;
            } else if (Visual3D.state.dayEnvMap) {
                scene.environment = Visual3D.state.dayEnvMap;
            }
        }

        // 4. Calibrated Lighting System (Warm Ambient & Low-Poly Form)
        if (Visual3D.state.ambientLight) {
            Visual3D.state.ambientLight.color.setHex(isNight ? NIGHT_LOOK.ambientColor : 0xe8f2fc);
            Visual3D.state.ambientLight.intensity = isNight ? NIGHT_LOOK.ambientIntensity : 0.95;
        }
        if (Visual3D.state.hemiLight) {
            Visual3D.state.hemiLight.color.setHex(isNight ? NIGHT_LOOK.hemiSky : 0xd6eeff);
            Visual3D.state.hemiLight.groundColor.setHex(isNight ? NIGHT_LOOK.hemiGround : 0x98b882);
            Visual3D.state.hemiLight.intensity = isNight ? NIGHT_LOOK.hemiIntensity : 1.10;
        }
        if (Visual3D.state.sunLight) {
            Visual3D.state.sunLight.intensity = isNight ? 0.0 : 4.5;
        }
        if (Visual3D.state.moonLight) {
            Visual3D.state.moonLight.color.setHex(NIGHT_LOOK.moonColor);
            Visual3D.state.moonLight.intensity = isNight ? NIGHT_LOOK.moonIntensity : 0.0;
        }
        if (Visual3D.state.fillLight) {
            Visual3D.state.fillLight.color.setHex(isNight ? NIGHT_LOOK.fillColor : 0xd0e6f8);
            Visual3D.state.fillLight.intensity = isNight ? NIGHT_LOOK.fillIntensity : 0.85;
        }

        // 5. Post-Processing Bloom, Vignette & Tone Mapping Exposure
        if (renderer) {
            renderer.toneMappingExposure = isNight ? NIGHT_LOOK.exposure : 1.52;
        }
        if (Visual3D.state.bloomPass) {
            Visual3D.state.bloomPass.strength = isNight ? NIGHT_LOOK.bloomStrength : 0.10;
            Visual3D.state.bloomPass.threshold = isNight ? NIGHT_LOOK.bloomThreshold : 0.98;
            Visual3D.state.bloomPass.radius = isNight ? NIGHT_LOOK.bloomRadius : 0.40;
        }
        if (Visual3D.state.vignettePass && Visual3D.state.vignettePass.uniforms) {
            Visual3D.state.vignettePass.uniforms.darkness.value = isNight ? NIGHT_LOOK.vignetteDarkness : 0.18;
            Visual3D.state.vignettePass.uniforms.offset.value = isNight ? NIGHT_LOOK.vignetteOffset : 1.20;
        }

        // 6. Shared Vehicle Materials (Soft, natural vehicle glow)
        const carMats = sharedCarMats();
        if (carMats.headlight) {
            carMats.headlight.emissive.setHex(isNight ? 0xfffae6 : 0xfff0c8);
            carMats.headlight.emissiveIntensity = isNight ? 1.2 : 0.80;
        }
        if (carMats.taillight) {
            carMats.taillight.emissive.setHex(isNight ? 0xff2020 : 0x7a0000);
            carMats.taillight.emissiveIntensity = isNight ? 0.85 : 0.75;
        }

        // 6a. 夜間降低車漆/玻璃環境反射強度，讓路燈與車頭燈的實際漫反射更明顯
        Object.keys(carMats).forEach(k => applyVehicleNightEnv(carMats[k]));
        PAINT_CACHE.forEach(applyVehicleNightEnv);

        // 6b. 行人材質夜間可見度與受光優化
        cleanPedestrianMaterials();
        Visual3D.state.pedestrianMats.forEach(applyPedestrianNightEnv);

        // 7. Streetlight Lamp Heads, Pools, Sprites & Dynamic PointLights
        Visual3D.state.lampGlowMats.forEach(mat => {
            mat.emissive.setHex(isNight ? 0xff9020 : 0xfae088);
            mat.emissiveIntensity = isNight ? 0.75 : 0.50;
        });
        Visual3D.state.lampPools.forEach(mesh => {
            mesh.visible = isNight;
        });
        Visual3D.state.lampCones.forEach(mesh => {
            mesh.visible = isNight;
        });
        Visual3D.state.lampGlowSprites.forEach(sprite => {
            sprite.visible = isNight;
            if (sprite.material) sprite.material.opacity = isNight ? 0.18 : 0.0;
        });

        // 8. Clouds
        if (Visual3D.state.clouds) {
            Visual3D.state.clouds.visible = !isNight;
        }

        // 9. Active Vehicle Night Lights (Lens Flare Sprites, Beams, Tail Glows)
        cleanVehicleLights();
        Visual3D.state.vehicleLightGroups.forEach(lights => {
            if (lights.groundBeam) lights.groundBeam.visible = isNight;
            if (lights.glowSprites) lights.glowSprites.forEach(s => s.visible = isNight);
            if (lights.volumetricBeams) lights.volumetricBeams.forEach(b => b.visible = isNight);
            if (lights.tailGlow) lights.tailGlow.visible = isNight;
            if (lights.hlMat) lights.hlMat.emissiveIntensity = isNight ? 1.2 : 0.80;
            if (lights.tlMat) lights.tlMat.emissiveIntensity = isNight ? 0.85 : 0.75;
        });

        // 9a. Pooled Dynamic Real Lights — 讓路燈與車燈真正照亮周圍物件
        setDynamicLightsEnabled(isNight);

        // 10. Building Shader Window Illumination
        if (Visual3D.state.buildingMats) {
            Visual3D.state.buildingMats.forEach(mat => {
                if (mat.userData && mat.userData.shader && mat.userData.shader.uniforms && mat.userData.shader.uniforms.uNight) {
                    mat.userData.shader.uniforms.uNight.value = targetNight;
                }
            });
        }
    }

    // =========================================================================
    // 11. Animation & Real-time Update Loop
    // =========================================================================
    function update(dt, cloudGroup) {
        if (!dt) return;
        Visual3D.state.elapsedTime += dt;
        Visual3D.state.cloudDrift += dt * 0.40;

        // 0. Pooled dynamic real lights (路燈/車燈實際照亮周圍物件)
        updateDynamicLights(dt);

        // 1. Cloud drifting
        const cGroup = cloudGroup || Visual3D.state.clouds;
        if (cGroup && cGroup.children) {
            cGroup.children.forEach((child) => {
                child.position.x = Math.sin(Visual3D.state.cloudDrift * 0.04) * 12;
                child.position.z = Math.cos(Visual3D.state.cloudDrift * 0.03) * 9;
            });
        }

        // 2. Animated Sky Time Uniform
        const skyMat = Visual3D.state.skyMat || (Visual3D.state.sky && Visual3D.state.sky.material);
        if (skyMat && skyMat.uniforms) {
            if (skyMat.uniforms.uTime) {
                skyMat.uniforms.uTime.value = Visual3D.state.elapsedTime;
            }
            if (skyMat.uniforms.uNight) {
                skyMat.uniforms.uNight.value = Visual3D.state.nightFactor;
            }
        }
    }

    // Export module
    Visual3D.URBAN_COLORS = URBAN_COLORS;
    Visual3D.VEHICLE_COLORS = VEHICLE_COLORS;
    Visual3D.install = install;
    Visual3D.setupComposer = setupComposer;
    Visual3D.render = render;
    Visual3D.onResize = onResize;
    Visual3D.enhanceRenderer = enhanceRenderer;
    Visual3D.createAsphaltMaterial = createAsphaltMaterial;
    Visual3D.createGrassMaterial = createGrassMaterial;
    Visual3D.createConcreteMaterial = createConcreteMaterial;
    Visual3D.applyBuildingShader = applyBuildingShader;
    Visual3D.createCar = createCar;
    Visual3D.createMotorcycle = createMotorcycle;
    Visual3D.pickVehicleColor = pickVehicleColor;
    Visual3D.createTreeInstanced = createTreeInstanced;
    Visual3D.createWaterMesh = createWaterMesh;
    Visual3D.createClouds = createClouds;
    Visual3D.createUrbanPark = createUrbanPark;
    Visual3D.createSidewalks = createSidewalks;
    Visual3D.createLamps = createLamps;
    Visual3D.createRoofDetails = createRoofDetails;
    Visual3D.createLotPads = createLotPads;
    Visual3D.createSignalGlow = createSignalGlow;
    Visual3D.buildRoadSpatialIndex = buildRoadSpatialIndex;
    Visual3D.isRoadArea = function (px, pz, tolerance) {
        const spatial = buildRoadSpatialIndex();
        return spatial.isInside(px, pz, tolerance || 0);
    };
    Visual3D.setNightMode = setNightMode;
    Visual3D.cleanVehicleLights = cleanVehicleLights;
    Visual3D.registerPedestrianMaterial = registerPedestrianMaterial;
    Visual3D.applyPedestrianNightEnv = applyPedestrianNightEnv;
    Visual3D.cleanPedestrianMaterials = cleanPedestrianMaterials;
    Visual3D.updateDynamicLights = updateDynamicLights;
    Visual3D.setDynamicLightsEnabled = setDynamicLightsEnabled;
    Visual3D.DYN_LIGHT_CFG = DYN_LIGHT_CFG;
    Visual3D.update = update;
    Visual3D.hexColor = hexColor;

    global.Visual3D = Visual3D;
})(window);
