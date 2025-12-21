// --- START OF FILE script02.js ---

document.addEventListener('DOMContentLoaded', () => {
    // --- I18N Setup ---
    const translations = {
        'zh-Hant': {
            appTitle: '路網微觀交通模擬 (2D/3D)',
            selectFileLabel: '選擇路網檔案：',
            viewModeLabel: '3D 模式:',
            displayStats: '統計',
            display2D: '2D',
            display3D: '3D',
            syncRotateLabel: '2D 同步3D旋轉:',
            btnLoadFirst: '請先載入檔案',
            btnStart: '開始模擬',
            btnPause: '暫停模擬',
            btnResume: '繼續模擬',
            hideStatsPanel: '隱藏統計',
            showStatsPanel: '顯示統計',
            simSpeedLabel: '模擬速度:',
            simTimeLabel: '模擬時間:',
            trafficLightToggle: '路口燈號:',
            pointMeterToggle: '定點偵測器:',
            sectionMeterToggle: '區間偵測器:',
            statsTitle: '統計數據',
            vehicleCountChartTitle: '車輛數 (輛)',
            avgSpeedChartTitle: '平均速度 (km/h)',
            realtimeStatsTitle: '即時數據 (全域)',
            tableHeaderTime: '時間 (s)',
            tableHeaderVehicles: '車輛數',
            tableHeaderAvgSpeed: '平均速度 (km/h)',
            alertParseError: '解析XML檔案時發生錯誤。',
            alertLoadError: '解析模型或載入底圖時發生錯誤。',
            canvasPlaceholder: '請從上方選擇一個 XML 檔案以載入路網',
            chartTimeAxis: '模擬時間 (s)',
            chartVehicleAxis: '車輛數',
            chartSpeedAxis: '平均速度 (km/h)',
            meterChartSpeedAxis: '車速 (km/h)',
            sectionChartSpeedAxis: '平均速率 (km/h)',
            meterTitle: '點偵測器',
            sectionMeterTitle: '區間偵測器',
            laneLabel: '車道',
            allLanesLabel: '不分車道',
            allLanesAvgRateLabel: '不分車道平均速率',
            imageLoadError: '無法載入底圖',
            dragPegmanHint: '拖曳小人至道路以進入街景',
            flyoverLabel: '鳥瞰:', // 新增
            droneLabel: '無人機:',
            layerLabel: '顯示:',
            layerBoth: '建築 + 底圖',
            layerBuildings: '僅建築',
            layerBasemap: '僅底圖',
            layerNone: '均無'
        },
        'en': {
            appTitle: 'simTrafficFlow (2D/3D)',
            selectFileLabel: 'Select Network File:',
            viewModeLabel: '3D Mode:',
            displayStats: 'Stats',
            display2D: '2D',
            display3D: '3D',
            syncRotateLabel: 'Sync 2D rotation:',
            btnLoadFirst: 'Please Load a File',
            btnStart: 'Start Simulation',
            btnPause: 'Pause Simulation',
            btnResume: 'Resume Simulation',
            hideStatsPanel: 'Hide Stats',
            showStatsPanel: 'Show Stats',
            simSpeedLabel: 'Sim Speed:',
            simTimeLabel: 'Sim Time:',
            trafficLightToggle: 'Junction Lights:',
            pointMeterToggle: 'Point Detectors:',
            sectionMeterToggle: 'Section Detectors:',
            statsTitle: 'Statistics',
            vehicleCountChartTitle: 'Vehicle Count',
            avgSpeedChartTitle: 'Average Speed (km/h)',
            realtimeStatsTitle: 'Real-time Data (Global)',
            tableHeaderTime: 'Time (s)',
            tableHeaderVehicles: 'Vehicles',
            tableHeaderAvgSpeed: 'Avg. Speed (km/h)',
            alertParseError: 'Error parsing XML file.',
            alertLoadError: 'Error parsing model or loading background image.',
            canvasPlaceholder: 'Please select an XML file above to load the network',
            chartTimeAxis: 'Simulation Time (s)',
            chartVehicleAxis: 'Vehicle Count',
            chartSpeedAxis: 'Average Speed (km/h)',
            meterChartSpeedAxis: 'Speed (km/h)',
            sectionChartSpeedAxis: 'Average Rate (km/h)',
            meterTitle: 'Point Detector',
            sectionMeterTitle: 'Section Detector',
            laneLabel: 'Lane',
            allLanesLabel: 'All Lanes',
            allLanesAvgRateLabel: 'All Lanes Average Rate',
            imageLoadError: 'Could not load background image',
            dragPegmanHint: 'Drag Pegman to road for Street View',
            flyoverLabel: 'Auto Flyover:', // 新增
            droneLabel: 'Drone:',
            layerLabel: 'Display:',
            layerBoth: 'Builds + Map',
            layerBuildings: 'Buildings Only',
            layerBasemap: 'Basemap Only',
            layerNone: 'None',
        }
    };

    let currentLang = 'zh-Hant';
    let currentViewMode = '2D';

    let isDisplay2D = true;
    let isDisplay3D = false;

    let isRotationSyncEnabled = true;

    let wasSplitActive = false;
    let splitStartAzimuth = 0;
    let has3DHeadingChangedSinceSplit = false;

    let viewRotation2D = 0;
    let initialViewRotation2D = 0;
    let networkCenter2D = null;

    function setLanguage(lang) {
        currentLang = lang;
        const dict = translations[lang];
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.textContent = dict[key];
        });
        document.title = dict.appTitle;
        updateButtonText();
        updateDisplayButtons();
        initializeCharts();
        if (networkData) {
            setupMeterCharts(networkData.speedMeters);
            setupSectionMeterCharts(networkData.sectionMeters);
            statsData.forEach(data => updateStatsUI(data, true));
        }
        document.getElementById('placeholder-text').textContent = dict.canvasPlaceholder;

        const pegman = document.getElementById('pegman-icon');
        if (pegman) pegman.title = dict.dragPegmanHint;

        // [新增] 更新下拉選單選項文字
        //const dict = translations[lang];
        const options = layerSelector.options;
        for (let i = 0; i < options.length; i++) {
            const key = options[i].getAttribute('data-i18n');
            if (dict[key]) options[i].textContent = dict[key];
        }
    }

    function updateButtonText() {
        const dict = translations[currentLang];
        if (!simulation) {
            startStopButton.textContent = dict.btnLoadFirst;
        } else if (isRunning) {
            startStopButton.textContent = dict.btnPause;
        } else {
            if (simulation.time > 0) startStopButton.textContent = dict.btnResume;
            else startStopButton.textContent = dict.btnStart;
        }
    }

    function resizeStatsCharts() {
        if (vehicleCountChart) vehicleCountChart.resize();
        if (avgSpeedChart) avgSpeedChart.resize();
        Object.values(meterCharts).forEach((chart) => {
            if (chart && typeof chart.resize === 'function') chart.resize();
        });
        Object.values(sectionMeterCharts).forEach((chart) => {
            if (chart && typeof chart.resize === 'function') chart.resize();
        });
    }

    function setStatsPanelVisible(visible) {
        isStatsPanelVisible = visible;
        if (statsPanel) statsPanel.classList.toggle('is-hidden', !visible);
        updateDisplayButtons();
        requestAnimationFrame(() => {
            onWindowResize();
            resizeStatsCharts();
        });
    }

    function setButtonActive(btn, active) {
        if (!btn) return;
        btn.classList.toggle('is-active', !!active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    function get3DAzimuth() {
        if (!camera) return 0;
        if (controls && controls.enabled && typeof controls.getAzimuthalAngle === 'function') {
            return controls.getAzimuthalAngle();
        }
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        // Map camera forward direction onto XZ plane; yaw is measured around +Y.
        // We use atan2(x, z) so that 0 means looking toward +Z.
        return Math.atan2(-dir.x, -dir.z);
    }

    function angleDeltaRad(a, b) {
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    function sync2DRotationFrom3D() {
        if (!isDisplay2D || !isDisplay3D) return;
        if (!isRotationSyncEnabled) return;
        viewRotation2D = -get3DAzimuth();
    }

    function applyDisplayState() {
        if (!isDisplay2D && !isDisplay3D) {
            isDisplay2D = true;
        }

        if (isDisplay2D && isDisplay3D) {
            setStatsPanelVisible(false);
        }

        canvasContainer.classList.toggle('is-split', isDisplay2D && isDisplay3D);
        canvas2D.style.display = isDisplay2D ? 'block' : 'none';
        container3D.style.display = isDisplay3D ? 'block' : 'none';

        const isSplit = isDisplay2D && isDisplay3D;
        if (syncRotationContainer && syncRotationToggle) {
            syncRotationContainer.style.display = isSplit ? 'flex' : 'none';

            // Only apply defaults when entering split mode.
            if (isSplit && !wasSplitActive) {
                syncRotationToggle.checked = true;
                isRotationSyncEnabled = true;
                splitStartAzimuth = get3DAzimuth();
                has3DHeadingChangedSinceSplit = false;
            }

            // Leaving split mode: disable sync, and reset internal tracking.
            if (!isSplit && wasSplitActive) {
                isRotationSyncEnabled = false;
                has3DHeadingChangedSinceSplit = false;
            }
        }

        const pegman = document.getElementById('pegman-icon');
        if (pegman) {
            pegman.style.display = (isDisplay2D && networkData && !isDisplay3D) ? 'block' : 'none';
        }

        currentViewMode = isDisplay3D ? '3D' : '2D';

        if (!isDisplay3D) {
            if (isFlyoverActive && flyoverToggle) {
                flyoverToggle.checked = false;
                setFlyoverMode(false);
            }
            if (isDroneActive && droneToggle) {
                droneToggle.checked = false;
                setDroneMode(false);
            }
        }

        if (isDisplay2D && !isDisplay3D) {
            viewRotation2D = initialViewRotation2D;
        }

        if (isSplit) {
            if (!isRotationSyncEnabled) {
                viewRotation2D = initialViewRotation2D;
            } else {
                // Keep 2D aligned with load-time orientation until 3D heading changes.
                // (Sync becomes effective after the 3D camera has actually rotated.)
                sync2DRotationFrom3D();
            }
        }

        wasSplitActive = isSplit;

        updateDisplayButtons();
        onWindowResize();

        if (isDisplay2D && !isRunning) redraw2D();
        if (isDisplay3D) {
            update3DVisibility();
            updateLayerVisibility();
            if (renderer && scene && camera) renderer.render(scene, camera);
        }
    }

    function updateDisplayButtons() {
        setButtonActive(displayStatsBtn, isStatsPanelVisible);
        setButtonActive(display2DBtn, isDisplay2D);
        setButtonActive(display3DBtn, isDisplay3D);

        if (displayStatsBtn) {
            const statsAllowed = !(isDisplay2D && isDisplay3D);
            displayStatsBtn.disabled = !statsAllowed;
            if (!statsAllowed) {
                setButtonActive(displayStatsBtn, false);
            }
        }
    }

    // --- DOM Elements ---
    const langSelector = document.getElementById('langSelector');
    const fileInput = document.getElementById('xmlFileInput');
    const canvasContainer = document.getElementById('canvas-container');
    const placeholderText = document.getElementById('placeholder-text');
    const canvas2D = document.getElementById('networkCanvas');
    const ctx2D = canvas2D.getContext('2d');
    const container3D = document.getElementById('threejs-container');
    const startStopButton = document.getElementById('startStopButton');
    const displayStatsBtn = document.getElementById('displayStatsBtn');
    const display2DBtn = document.getElementById('display2DBtn');
    const display3DBtn = document.getElementById('display3DBtn');
    const syncRotationContainer = document.getElementById('syncRotationContainer');
    const syncRotationToggle = document.getElementById('syncRotationToggle');
    const speedSlider = document.getElementById('speedSlider');
    const speedValueSpan = document.getElementById('speedValue');
    const simTimeSpan = document.getElementById('simulationTime');
    const showPathsToggle = document.getElementById('showPathsToggle');
    const showPointMetersToggle = document.getElementById('showPointMetersToggle');
    const showSectionMetersToggle = document.getElementById('showSectionMetersToggle');
    const statsPanel = document.getElementById('stats-panel');
    const statsTableBody = document.getElementById('statsTableBody');
    const vehicleCountChartCanvas = document.getElementById('vehicleCountChart').getContext('2d');
    const avgSpeedChartCanvas = document.getElementById('avgSpeedChart').getContext('2d');
    const meterChartsContainer = document.getElementById('meter-charts-container');
    const sectionMeterChartsContainer = document.getElementById('section-meter-charts-container');
    const flyoverToggle = document.getElementById('flyoverToggle'); // 新增
    const droneToggle = document.getElementById('droneToggle');
    const layerSelector = document.getElementById('layerSelector'); // 新增

    // --- State Variables ---
    let simulation = null;
    let networkData = null;
    let isRunning = false;
    let lastTimestamp = 0;
    let animationFrameId = null;
    let simulationSpeed = parseInt(speedSlider.value, 10);
    let showTurnPaths = false;
    let showPointMeters = true;
    let showSectionMeters = true;
    let isStatsPanelVisible = true;

    // --- 2D View Variables ---
    let scale = 1.0;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let panDownPos = { x: 0, y: 0 };
    let panWasDrag = false;

    // --- 3D View Variables ---
    let scene, camera, renderer, controls;
    let vehicleMeshes = new Map();
    let networkGroup = new THREE.Group();
    let debugGroup = new THREE.Group();
    let signalPathsGroup = new THREE.Group();
    let trafficLightsGroup = new THREE.Group();
    let trafficLightMeshes = [];

    const LANE_COLORS = ['rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 206, 86)', 'rgb(75, 192, 192)', 'rgb(153, 102, 255)', 'rgb(255, 159, 64)'];

    // --- Statistics Variables ---
    let statsData = [];
    let lastLoggedIntegerTime = -1;
    let vehicleCountChart = null;
    let avgSpeedChart = null;
    let meterCharts = {};
    let sectionMeterCharts = {};

    // --- Pegman (Street View) Variables ---
    let isDraggingPegman = false;
    let pegmanGhost = null;
    let currentHoveredLink = null;
    let lastValidLink = null;
    let lastValidDropPos = null;

    // --- Flyover Variables (新增) ---
    let isFlyoverActive = false;
    let flyoverController = null; // 新增控制器實例
    let flyoverBaseTime = 0;
    let flyoverCenter = { x: 0, y: 0 };
    let flyoverRadiusX = 100;
    let flyoverRadiusZ = 100;

    let isDroneActive = false;
    let droneController = null;

    let isChaseActive = false;
    let chaseVehicleId = null;
    let chaseRaycaster = new THREE.Raycaster();
    let chasePointerNdc = new THREE.Vector2();
    let chaseSmoothedPos = new THREE.Vector3();
    let chaseSmoothedLookAt = new THREE.Vector3();
    let chaseIsFirstFrame = true;
    const chaseEyeHeight = 1.4;
    const chaseForwardOffset = 1.2;
    const chaseLookAhead = 25.0;
    const chaseLerpFactor = 0.2;

    let basemapGroup = new THREE.Group(); // 新增底圖群組

    // --- City Generation Variables ---
    let cityGroup = new THREE.Group(); // 裝載所有城市物件
    const citySeedInput = document.getElementById('citySeedInput');
    const regenCityBtn = document.getElementById('regenCityBtn');
    // --- Event Listeners (新增) ---
    regenCityBtn.addEventListener('click', () => {
        if (networkData) {
            const seed = parseInt(citySeedInput.value, 10) || 12345;
            generateCity(networkData, seed);
        }
    });

    const PEGMAN_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F5B921" style="width:100%;height:100%;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.5));">
        <circle cx="12" cy="5" r="3"/>
        <path d="M12 9c-2.5 0-5 1.5-5 4v6h3v-4h4v4h3v-6c0-2.5-2.5-4-5-4z"/>
    </svg>`;

    // --- Event Listeners ---
    langSelector.addEventListener('change', (e) => setLanguage(e.target.value));

    if (displayStatsBtn) {
        displayStatsBtn.addEventListener('click', () => {
            if (isDisplay2D && isDisplay3D) return;
            setStatsPanelVisible(!isStatsPanelVisible);
        });
    }

    if (display2DBtn) {
        display2DBtn.addEventListener('click', () => {
            const next = !isDisplay2D;
            if (!next && !isDisplay3D) return;
            isDisplay2D = next;
            applyDisplayState();
        });
    }

    if (display3DBtn) {
        display3DBtn.addEventListener('click', () => {
            const next = !isDisplay3D;
            if (!next && !isDisplay2D) return;
            isDisplay3D = next;
            applyDisplayState();
        });
    }

    if (syncRotationToggle) {
        syncRotationToggle.addEventListener('change', (e) => {
            isRotationSyncEnabled = !!e.target.checked;
            if (isDisplay2D && isDisplay3D) {
                if (isRotationSyncEnabled) {
                    has3DHeadingChangedSinceSplit = true;
                    sync2DRotationFrom3D();
                } else {
                    has3DHeadingChangedSinceSplit = false;
                    viewRotation2D = initialViewRotation2D;
                }
                if (!isRunning) redraw2D();
            }
        });
    }

    fileInput.addEventListener('change', handleFileSelect);
    startStopButton.addEventListener('click', toggleSimulation);
    speedSlider.addEventListener('input', (e) => {
        simulationSpeed = parseInt(e.target.value, 10);
        speedValueSpan.textContent = `${simulationSpeed}x`;
    });
    showPathsToggle.addEventListener('change', (e) => {
        showTurnPaths = e.target.checked;
        if (isDisplay2D && !isRunning) redraw2D();
        if (isDisplay3D) update3DVisibility();
    });
    showPointMetersToggle.addEventListener('change', (e) => {
        showPointMeters = e.target.checked;
        if (isDisplay2D && !isRunning) redraw2D();
        if (isDisplay3D) update3DVisibility();
    });
    showSectionMetersToggle.addEventListener('change', (e) => {
        showSectionMeters = e.target.checked;
        if (isDisplay2D && !isRunning) redraw2D();
        if (isDisplay3D) update3DVisibility();
    });

    canvas2D.addEventListener('wheel', handleZoom2D);
    canvas2D.addEventListener('mousedown', handlePanStart2D);
    canvas2D.addEventListener('mousemove', handlePanMove2D);
    canvas2D.addEventListener('mouseup', handlePanEnd2D);
    canvas2D.addEventListener('mouseleave', handlePanEnd2D);
    canvas2D.addEventListener('click', handle2DVehiclePick);

    // --- Layer Selector ---
    layerSelector.addEventListener('change', () => {
        updateLayerVisibility();
    });

    // --- Flyover Event Listeners ---

    // 1. 開關切換
    flyoverToggle.addEventListener('change', (e) => {
        setFlyoverMode(e.target.checked);
    });

    if (droneToggle) {
        droneToggle.addEventListener('change', (e) => {
            setDroneMode(e.target.checked);
        });
    }

    // 2. 使用者介入時自動退出 (Mouse Down / Wheel)
    // 只有在 3D 模式且巡航開啟時才偵聽
    container3D.addEventListener('mousedown', interruptFlyover);
    container3D.addEventListener('wheel', interruptFlyover);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isChaseActive) {
            stopChaseMode();
        }
    });

    function interruptFlyover() {
        if (isFlyoverActive) {
            flyoverToggle.checked = false;
            setFlyoverMode(false);
        }
    }

    function setFlyoverMode(active) {
        if (!isDisplay3D) {
            if (active) {
                setViewMode('3D');
            }
        }

        isFlyoverActive = active;

        if (active) {
            if (!animationFrameId) {
                lastTimestamp = performance.now();
                animationFrameId = requestAnimationFrame(simulationLoop);
            }
            if (isDroneActive && droneToggle) {
                droneToggle.checked = false;
                setDroneMode(false);
            }
            if (isChaseActive) stopChaseMode();
            if (controls) controls.enabled = false;

            const seed = parseInt(citySeedInput.value, 10) || 12345;
            if (networkData) {
                flyoverController = new RoadFlyoverController(networkData, seed);
            }
        } else {
            if (controls) {
                controls.enabled = true;
                camera.up.set(0, 1, 0);
                controls.update();
            }
            flyoverController = null;
        }
    }

    function updateFlyoverCamera() {
        if (!isFlyoverActive || !camera || !flyoverController) return;

        const dt = 0.016;
        flyoverController.update(dt, camera);
    }

    function setDroneMode(active) {
        if (active) {
            if (!isDisplay3D) {
                isDisplay3D = true;
                applyDisplayState();
            }
        }

        isDroneActive = !!active;

        if (active) {
            if (!animationFrameId) {
                lastTimestamp = performance.now();
                animationFrameId = requestAnimationFrame(simulationLoop);
            }
            if (isChaseActive) stopChaseMode();
            if (isFlyoverActive) {
                flyoverToggle.checked = false;
                setFlyoverMode(false);
            }

            if (controls) controls.enabled = false;
            if (camera) camera.up.set(0, 1, 0);
            droneController = new DroneController();
            if (camera) droneController.syncFromCamera(camera);
        } else {
            droneController = null;
            if (controls) {
                controls.enabled = true;
                controls.update();
            }
        }
    }

    function updateDroneCamera(dt) {
        if (!isDroneActive || !camera || !droneController) return;
        droneController.update(dt, camera);
    }

    function clampNumber(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function applyDeadzone(value, deadzone) {
        const v = value || 0;
        const dz = deadzone == null ? 0.15 : deadzone;
        const av = Math.abs(v);
        if (av <= dz) return 0;
        return (v - Math.sign(v) * dz) / (1 - dz);
    }

    function getPreferredGamepad() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : null;
        if (!pads) return null;
        const list = Array.from(pads).filter(Boolean);
        if (list.length === 0) return null;
        const preferred = list.find(p => /playstation|ps3|sony/i.test(p.id || ''));
        return preferred || list[0];
    }

    class DroneController {
        constructor() {
            this.yaw = 0;
            this.pitch = 0;
            this.baseSpeed = 30;
            this.turboMultiplier = 3;
            this.yawSpeed = 2.2;
            this.pitchSpeed = 1.6;
            this.verticalSpeed = 18;
        }

        syncFromCamera(camera) {
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            this.yaw = Math.atan2(dir.x, dir.z);
            this.pitch = Math.asin(clampNumber(dir.y, -1, 1));
        }

        update(dt, camera) {
            const t = clampNumber(dt || 0.016, 0.001, 0.05);
            const pad = getPreferredGamepad();

            let lx = 0;
            let ly = 0;
            let rx = 0;
            let ry = 0;
            let up = 0;
            let down = 0;
            let turbo = 0;

            if (pad) {
                lx = applyDeadzone(pad.axes?.[0] || 0, 0.15);
                ly = applyDeadzone(pad.axes?.[1] || 0, 0.15);
                rx = applyDeadzone(pad.axes?.[2] || 0, 0.15);
                ry = applyDeadzone(pad.axes?.[3] || 0, 0.15);

                up = (pad.buttons?.[5]?.value || (pad.buttons?.[5]?.pressed ? 1 : 0)) ? 1 : 0;
                down = (pad.buttons?.[4]?.value || (pad.buttons?.[4]?.pressed ? 1 : 0)) ? 1 : 0;
                turbo = pad.buttons?.[7]?.value || (pad.buttons?.[7]?.pressed ? 1 : 0) || 0;

                if (pad.buttons?.[12]?.pressed) up = 1;
                if (pad.buttons?.[13]?.pressed) down = 1;
            }

            this.yaw += (-rx) * this.yawSpeed * t;
            this.pitch += (-ry) * this.pitchSpeed * t;
            this.pitch = clampNumber(this.pitch, -1.35, 1.35);

            const speed = this.baseSpeed * (turbo > 0.6 ? this.turboMultiplier : 1);

            const forwardAmount = -ly;
            const strafeAmount = -lx;
            const verticalAmount = (up ? 1 : 0) - (down ? 1 : 0);

            const cosPitch = Math.cos(this.pitch);
            const sinPitch = Math.sin(this.pitch);
            const sinYaw = Math.sin(this.yaw);
            const cosYaw = Math.cos(this.yaw);

            const forward = new THREE.Vector3(sinYaw * cosPitch, sinPitch, cosYaw * cosPitch);
            const right = new THREE.Vector3(cosYaw, 0, -sinYaw);
            const upVec = new THREE.Vector3(0, 1, 0);

            camera.position.addScaledVector(forward, forwardAmount * speed * t);
            camera.position.addScaledVector(right, strafeAmount * speed * t);
            camera.position.addScaledVector(upVec, verticalAmount * this.verticalSpeed * t);

            const lookAt = new THREE.Vector3().copy(camera.position).add(forward);
            camera.up.set(0, 1, 0);
            camera.lookAt(lookAt);
        }
    }

    function startChaseMode(vehicleId, options = {}) {
        if (!vehicleId) return;
        const { force3D = true } = options;
        if (force3D && !isDisplay3D) {
            setViewMode('3D');
        }
        if (isFlyoverActive) {
            flyoverToggle.checked = false;
            setFlyoverMode(false);
        }
        isChaseActive = true;
        chaseVehicleId = vehicleId;
        chaseIsFirstFrame = true;
        if (force3D || isDisplay3D) {
            if (controls) controls.enabled = false;
            if (camera) camera.up.set(0, 1, 0);
        }
    }

    function stopChaseMode() {
        isChaseActive = false;
        chaseVehicleId = null;
        chaseIsFirstFrame = true;
        if (controls) {
            controls.enabled = true;
            controls.update();
        }
    }

    function updateChaseCamera() {
        if (!isChaseActive || !camera || !simulation || !chaseVehicleId) return;
        const v = simulation.vehicles.find(vv => vv.id === chaseVehicleId);
        if (!v) {
            stopChaseMode();
            return;
        }

        const fx = Math.cos(v.angle);
        const fz = Math.sin(v.angle);

        const desiredPos = new THREE.Vector3(
            v.x + fx * chaseForwardOffset,
            chaseEyeHeight,
            v.y + fz * chaseForwardOffset
        );
        const desiredLookAt = new THREE.Vector3(
            v.x + fx * chaseLookAhead,
            chaseEyeHeight,
            v.y + fz * chaseLookAhead
        );

        if (chaseIsFirstFrame) {
            camera.position.copy(desiredPos);
            chaseSmoothedPos.copy(desiredPos);
            chaseSmoothedLookAt.copy(desiredLookAt);
            chaseIsFirstFrame = false;
        } else {
            chaseSmoothedPos.lerp(desiredPos, chaseLerpFactor);
            chaseSmoothedLookAt.lerp(desiredLookAt, chaseLerpFactor);
            camera.position.copy(chaseSmoothedPos);
        }

        if (camera.position.distanceToSquared(chaseSmoothedLookAt) > 0.1) {
            camera.lookAt(chaseSmoothedLookAt);
        }
    }

    function handle3DVehiclePick(e) {
        if (!isDisplay3D || !camera || !renderer) return;
        if (isFlyoverActive || isDroneActive) return;

        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        chasePointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        chasePointerNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        chaseRaycaster.setFromCamera(chasePointerNdc, camera);
        const roots = Array.from(vehicleMeshes.values());
        if (roots.length === 0) return;
        const hits = chaseRaycaster.intersectObjects(roots, true);
        if (hits.length === 0) return;
        const hitObj = hits[0].object;
        const vehicleId = hitObj?.userData?.vehicleId;
        if (!vehicleId) return;
        startChaseMode(vehicleId);
    }



    window.addEventListener('resize', onWindowResize);

    // --- Initialization ---
    init3D();
    resizeCanvas2D();
    createPegmanUI();
    setLanguage(currentLang);
    applyDisplayState();
    startStopButton.disabled = true;


    // ===================================================================
    // Pegman & Street View Logic
    // ===================================================================
    function createPegmanUI() {
        const pegman = document.createElement('div');
        pegman.id = 'pegman-icon';
        pegman.style.width = '40px';
        pegman.style.height = '40px';
        pegman.innerHTML = PEGMAN_SVG;
        pegman.style.position = 'absolute';
        pegman.style.bottom = '30px';
        pegman.style.right = '30px';
        pegman.style.cursor = 'grab';
        pegman.style.zIndex = '1000';
        pegman.style.backgroundColor = 'white';
        pegman.style.borderRadius = '4px';
        pegman.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        pegman.style.display = 'none';

        canvasContainer.appendChild(pegman);
        pegman.addEventListener('mousedown', startPegmanDrag);
    }

    function startPegmanDrag(e) {
        e.preventDefault();
        if (!isDisplay2D || !networkData) return;

        isDraggingPegman = true;
        currentHoveredLink = null;
        lastValidLink = null;
        lastValidDropPos = null;

        pegmanGhost = document.createElement('div');
        pegmanGhost.style.width = '40px';
        pegmanGhost.style.height = '40px';
        pegmanGhost.innerHTML = PEGMAN_SVG;
        pegmanGhost.style.position = 'fixed';
        pegmanGhost.style.zIndex = '2000';
        pegmanGhost.style.pointerEvents = 'none';
        pegmanGhost.style.left = (e.clientX - 20) + 'px';
        pegmanGhost.style.top = (e.clientY - 35) + 'px';
        pegmanGhost.style.transform = 'rotate(-10deg) scale(1.2)';

        document.body.appendChild(pegmanGhost);

        document.addEventListener('mousemove', movePegman);
        document.addEventListener('mouseup', dropPegman);
    }

    function movePegman(e) {
        if (!isDraggingPegman) return;
        pegmanGhost.style.left = (e.clientX - 20) + 'px';
        pegmanGhost.style.top = (e.clientY - 35) + 'px';

        const rect = canvas2D.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldX = (mouseX - panX) / scale;
            const worldY = (mouseY - panY) / scale;

            // Use the "lenient" finding logic
            const hitLink = findLinkAt(worldX, worldY, true);

            if (hitLink) {
                // We are over a link
                if (hitLink !== currentHoveredLink) {
                    currentHoveredLink = hitLink;
                    redraw2D();
                }
                // Update persistent valid state
                lastValidLink = hitLink;
                lastValidDropPos = { x: worldX, y: worldY };
            } else {
                // Not strictly over a link, but we don't clear lastValidLink here
                // Just clear the visual highlight
                if (currentHoveredLink) {
                    currentHoveredLink = null;
                    redraw2D();
                }
            }
        } else {
            if (currentHoveredLink) {
                currentHoveredLink = null;
                redraw2D();
            }
        }
    }

    function dropPegman(e) {
        if (!isDraggingPegman) return;
        isDraggingPegman = false;

        if (pegmanGhost && pegmanGhost.parentNode) {
            document.body.removeChild(pegmanGhost);
        }
        pegmanGhost = null;
        document.removeEventListener('mousemove', movePegman);
        document.removeEventListener('mouseup', dropPegman);

        const rect = canvas2D.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - panX) / scale;
        const worldY = (mouseY - panY) / scale;

        // Logic to determine drop:
        // Priority 1: Current active hover
        let targetLink = currentHoveredLink;
        let targetPos = { x: worldX, y: worldY };

        // Priority 2: Fallback checks (Anti-Slip logic)
        // If currentHoveredLink is null (e.g. mouse slipped slightly), 
        // but we had a valid link during this drag, use it.
        if (!targetLink && lastValidLink) {
            // [Improvement] We trust lastValidLink if it exists for this drag session.
            // This prevents the "green but fails" issue by snapping back to the valid road.
            targetLink = lastValidLink;
            if (lastValidDropPos) {
                targetPos = lastValidDropPos;
            }
        }

        // Priority 3: Final fallback (Lenient check at current exact point)
        if (!targetLink) {
            targetLink = findLinkAt(worldX, worldY, true);
        }

        if (targetLink) {
            activateStreetView(targetLink, targetPos.x, targetPos.y);
        }

        // Cleanup
        currentHoveredLink = null;
        lastValidLink = null;
        lastValidDropPos = null;
        redraw2D();
    }

    // "lenient" parameter enables distance-based check
    function findLinkAt(x, y, lenient = false) {
        if (!networkData) return null;

        function insidePoly(point, vs) {
            let x = point.x, y = point.y;
            let inside = false;
            for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
                let xi = vs[i].x, yi = vs[i].y;
                let xj = vs[j].x, yj = vs[j].y;
                let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        function distToSegment(p, v, w) {
            const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
            if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
            let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
        }

        // 1. Precise Check (Polygon)
        for (const linkId in networkData.links) {
            const link = networkData.links[linkId];
            if (link.geometry) {
                for (const geo of link.geometry) {
                    if (geo.points && insidePoly({ x: x, y: y }, geo.points)) {
                        return link;
                    }
                }
            }
        }

        // 2. Lenient Check (Distance to Lane Paths)
        if (lenient) {
            const HIT_TOLERANCE = 15.0; // meters tolerance
            for (const linkId in networkData.links) {
                const link = networkData.links[linkId];
                if (link.lanes) {
                    for (const lane of Object.values(link.lanes)) {
                        const path = lane.path;
                        for (let i = 0; i < path.length - 1; i++) {
                            if (distToSegment({ x: x, y: y }, path[i], path[i + 1]) < HIT_TOLERANCE) {
                                return link;
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    function activateStreetView(link, x, y) {
        // 強制切換到 3D 模式
        setViewMode('3D');

        // 等待一小段時間確保 3D 場景已更新
        setTimeout(() => {
            if (!camera || !controls) return;

            let angle = 0;
            const lanes = Object.values(link.lanes);
            if (lanes.length > 0 && lanes[0].path.length > 1) {
                const path = lanes[0].path;
                let minDst = Infinity;
                let closestIdx = 0;

                // 找到最接近的線段
                for (let i = 0; i < path.length - 1; i++) {
                    const p1 = path[i];
                    const p2 = path[i + 1];
                    const cx = (p1.x + p2.x) / 2;
                    const cy = (p1.y + p2.y) / 2;
                    const dst = Math.hypot(x - cx, y - cy);
                    if (dst < minDst) {
                        minDst = dst;
                        closestIdx = i;
                    }
                }

                const p1 = path[closestIdx];
                const p2 = path[closestIdx + 1];
                angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            }

            // 設置街景相機位置（比車輛稍高）
            const cameraHeight = 2.0; // 2 公尺高
            camera.position.set(x, cameraHeight, y);

            // 設置視角方向（沿著道路方向）
            const lookDistance = 30.0; // 向前看 30 公尺
            const lookAtX = x + Math.cos(angle) * lookDistance;
            const lookAtZ = y + Math.sin(angle) * lookDistance;

            // 重置控制目標
            controls.target.set(lookAtX, cameraHeight, lookAtZ);
            controls.update();

            // 更新場景以立即看到變化
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        }, 50); // 50ms 延遲確保 3D 場景已初始化
    }
    // ===================================================================
    // View Mode Switching
    // ===================================================================
    // ===================================================================
    // View Mode Switching
    // ===================================================================
    function setViewMode(mode) {
        currentViewMode = mode;
        if (mode === '2D') {
            isDisplay2D = true;
            isDisplay3D = false;
        } else {
            isDisplay2D = false;
            isDisplay3D = true;
        }
        applyDisplayState();
    }
    // ===================================================================
    // 2D Rendering Logic (With Background Image)
    // ===================================================================
    function resizeCanvas2D() {
        const rect = canvas2D.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        canvas2D.width = w;
        canvas2D.height = h;
        if (isDisplay2D && !isRunning) redraw2D();
    }

    function autoCenter2D(bounds) {
        if (bounds.minX === Infinity) return;
        const networkWidth = bounds.maxX - bounds.minX;
        const networkHeight = bounds.maxY - bounds.minY;
        if (canvas2D.width <= 0 || canvas2D.height <= 0) return;
        const scaleX = canvas2D.width / (networkWidth + 100);
        const scaleY = canvas2D.height / (networkHeight + 100);
        scale = Math.min(scaleX, scaleY, 1.5);
        const networkCenterX = bounds.minX + networkWidth / 2;
        const networkCenterY = bounds.minY + networkHeight / 2;
        panX = canvas2D.width / 2 - networkCenterX * scale;
        panY = canvas2D.height / 2 - networkCenterY * scale;
    }

    function handleZoom2D(event) {
        event.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = event.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        const mouseX = event.clientX - canvas2D.offsetLeft;
        const mouseY = event.clientY - canvas2D.offsetTop;
        const worldX = (mouseX - panX) / scale;
        const worldY = (mouseY - panY) / scale;
        scale *= zoom;
        panX = mouseX - worldX * scale;
        panY = mouseY - worldY * scale;
        if (!isRunning) redraw2D();
    }
    function handlePanStart2D(event) {
        event.preventDefault();
        isPanning = true;
        panWasDrag = false;
        panStart.x = event.clientX;
        panStart.y = event.clientY;
        panDownPos.x = event.clientX;
        panDownPos.y = event.clientY;
        canvas2D.style.cursor = 'grabbing';
    }

    function handlePanMove2D(event) {
        if (!isPanning) return;
        event.preventDefault();
        const dx = event.clientX - panStart.x;
        const dy = event.clientY - panStart.y;
        if (!panWasDrag) {
            const ddx = event.clientX - panDownPos.x;
            const ddy = event.clientY - panDownPos.y;
            if ((ddx * ddx + ddy * ddy) > 9) panWasDrag = true;
        }
        panX += dx;
        panY += dy;
        panStart.x = event.clientX;
        panStart.y = event.clientY;
        if (!isRunning) redraw2D();
    }

    function handlePanEnd2D() {
        isPanning = false;
        canvas2D.style.cursor = 'grab';
    }

    function redraw2D() {
        if (!isDisplay2D) return;
        ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
        ctx2D.save();
        ctx2D.translate(panX, panY);
        ctx2D.scale(scale, scale);

        if (viewRotation2D !== 0 && networkCenter2D) {
            ctx2D.translate(networkCenter2D.x, networkCenter2D.y);
            ctx2D.rotate(viewRotation2D);
            ctx2D.translate(-networkCenter2D.x, -networkCenter2D.y);
        }

        if (simulation || networkData) {
            drawNetwork2D(networkData, simulation ? simulation.vehicles : null);
        }
        ctx2D.restore();

        drawChaseVehicleOverlay2D();
        drawFlyoverOverlay2D();
        drawDroneOverlay2D();
    }

    function worldToScreen2D(x, y) {
        let wx = x;
        let wy = y;

        if (viewRotation2D !== 0 && networkCenter2D) {
            const cos = Math.cos(viewRotation2D);
            const sin = Math.sin(viewRotation2D);
            const dx = wx - networkCenter2D.x;
            const dy = wy - networkCenter2D.y;
            wx = dx * cos - dy * sin + networkCenter2D.x;
            wy = dx * sin + dy * cos + networkCenter2D.y;
        }

        return {
            x: panX + wx * scale,
            y: panY + wy * scale,
        };
    }

    function screenToWorld2D(screenX, screenY) {
        let wx = (screenX - panX) / scale;
        let wy = (screenY - panY) / scale;

        if (viewRotation2D !== 0 && networkCenter2D) {
            const cos = Math.cos(-viewRotation2D);
            const sin = Math.sin(-viewRotation2D);
            const dx = wx - networkCenter2D.x;
            const dy = wy - networkCenter2D.y;
            wx = dx * cos - dy * sin + networkCenter2D.x;
            wy = dx * sin + dy * cos + networkCenter2D.y;
        }

        return { x: wx, y: wy };
    }

    function pickVehicle2D(worldX, worldY) {
        if (!simulation || !simulation.vehicles) return null;

        let best = null;
        let bestDist2 = Infinity;
        const extra = 1.0;

        for (const v of simulation.vehicles) {
            if (!v) continue;
            const dx = worldX - v.x;
            const dy = worldY - v.y;
            const cos = Math.cos(-v.angle);
            const sin = Math.sin(-v.angle);
            const lx = dx * cos - dy * sin;
            const ly = dx * sin + dy * cos;
            const halfL = (v.length || 4) / 2 + extra;
            const halfW = (v.width || 2) / 2 + extra;
            if (Math.abs(lx) <= halfL && Math.abs(ly) <= halfW) {
                const d2 = dx * dx + dy * dy;
                if (d2 < bestDist2) {
                    bestDist2 = d2;
                    best = v;
                }
            }
        }

        return best ? best.id : null;
    }

    function handle2DVehiclePick(e) {
        if (!isDisplay2D) return;
        if (!simulation) return;
        if (isDraggingPegman) return;
        if (panWasDrag) {
            panWasDrag = false;
            return;
        }

        const rect = canvas2D.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = screenToWorld2D(screenX, screenY);
        const vehicleId = pickVehicle2D(world.x, world.y);
        if (!vehicleId) return;

        startChaseMode(vehicleId, { force3D: false });
        if (!isRunning) redraw2D();
    }

    function drawChaseVehicleOverlay2D() {
        if (!isDisplay2D) return;
        if (!isChaseActive || !chaseVehicleId || !simulation) return;

        const v = simulation.vehicles.find(vv => vv.id === chaseVehicleId);
        if (!v) return;

        const p = worldToScreen2D(v.x, v.y);

        const speedKmh = Math.max(0, v.speed || 0) * 3.6;
        const speedText = `${speedKmh.toFixed(1)} km/h`;

        const anchorX = 12;
        const anchorY = 12;
        const pad = 4;

        ctx2D.save();
        ctx2D.lineWidth = 1;
        ctx2D.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        ctx2D.beginPath();
        ctx2D.moveTo(p.x, p.y);
        ctx2D.lineTo(anchorX, anchorY);
        ctx2D.stroke();

        ctx2D.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
        const metrics = ctx2D.measureText(speedText);
        const boxW = Math.ceil(metrics.width + pad * 2);
        const boxH = 12 + pad * 2;

        ctx2D.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx2D.fillRect(anchorX, anchorY, boxW, boxH);
        ctx2D.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        ctx2D.strokeRect(anchorX, anchorY, boxW, boxH);

        ctx2D.fillStyle = 'rgba(255, 0, 0, 0.95)';
        ctx2D.textAlign = 'left';
        ctx2D.textBaseline = 'top';
        ctx2D.fillText(speedText, anchorX + pad, anchorY + pad);
        ctx2D.restore();
    }

    function drawDroneOverlay2D() {
        if (!isDisplay2D || !isDisplay3D) return;
        if (!isDroneActive) return;
        if (!isRotationSyncEnabled) return;
        if (!camera) return;

        const p = worldToScreen2D(camera.position.x, camera.position.z);
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);

        let dx = dir.x;
        let dy = dir.z;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-6) return;
        const invLen = 1 / Math.sqrt(len2);
        dx *= invLen;
        dy *= invLen;

        let angle = Math.atan2(dy, dx);
        if (networkCenter2D && viewRotation2D !== 0) {
            angle += viewRotation2D;
        }

        ctx2D.save();
        ctx2D.translate(p.x, p.y);
        ctx2D.rotate(angle);

        ctx2D.lineWidth = 2;
        ctx2D.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx2D.fillStyle = 'rgba(0, 180, 255, 0.95)';

        const bodyR = 6;
        ctx2D.beginPath();
        ctx2D.arc(0, 0, bodyR, 0, Math.PI * 2);
        ctx2D.fill();
        ctx2D.stroke();

        const arm = 10;
        const rotorR = 3;
        ctx2D.beginPath();
        ctx2D.moveTo(-arm, 0);
        ctx2D.lineTo(arm, 0);
        ctx2D.stroke();

        ctx2D.beginPath();
        ctx2D.arc(-arm, 0, rotorR, 0, Math.PI * 2);
        ctx2D.arc(arm, 0, rotorR, 0, Math.PI * 2);
        ctx2D.fill();
        ctx2D.stroke();

        const nose = 16;
        ctx2D.beginPath();
        ctx2D.moveTo(bodyR + 2, 0);
        ctx2D.lineTo(nose, 0);
        ctx2D.stroke();

        ctx2D.restore();
    }

    function drawFlyoverOverlay2D() {
        if (!isDisplay2D) return;
        if (!isFlyoverActive) return;
        if (!camera) return;

        const p = worldToScreen2D(camera.position.x, camera.position.z);
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);

        let dx = dir.x;
        let dy = dir.z;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-6) return;
        const invLen = 1 / Math.sqrt(len2);
        dx *= invLen;
        dy *= invLen;

        let angle = Math.atan2(dy, dx);
        if (isDisplay2D && isDisplay3D && isRotationSyncEnabled && networkCenter2D && viewRotation2D !== 0) {
            angle += viewRotation2D;
        }

        const radiusPx = 7;
        const arrowLenPx = 18;
        const arrowWidthPx = 9;
        const baseDist = radiusPx + 2;

        const tipX = p.x + Math.cos(angle) * arrowLenPx;
        const tipY = p.y + Math.sin(angle) * arrowLenPx;
        const baseX = p.x + Math.cos(angle) * baseDist;
        const baseY = p.y + Math.sin(angle) * baseDist;
        const perpX = -Math.sin(angle);
        const perpY = Math.cos(angle);

        const leftX = baseX + perpX * (arrowWidthPx / 2);
        const leftY = baseY + perpY * (arrowWidthPx / 2);
        const rightX = baseX - perpX * (arrowWidthPx / 2);
        const rightY = baseY - perpY * (arrowWidthPx / 2);

        ctx2D.save();
        ctx2D.lineWidth = 2;
        ctx2D.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx2D.fillStyle = 'rgba(255, 215, 0, 0.95)';

        ctx2D.beginPath();
        ctx2D.arc(p.x, p.y, radiusPx, 0, Math.PI * 2);
        ctx2D.fill();
        ctx2D.stroke();

        ctx2D.beginPath();
        ctx2D.moveTo(p.x, p.y);
        ctx2D.lineTo(baseX, baseY);
        ctx2D.stroke();

        ctx2D.beginPath();
        ctx2D.moveTo(tipX, tipY);
        ctx2D.lineTo(leftX, leftY);
        ctx2D.lineTo(rightX, rightY);
        ctx2D.closePath();
        ctx2D.fill();
        ctx2D.stroke();

        ctx2D.restore();
    }

    function drawNetwork2D(netData, vehicles) {
        if (!netData) return;
        const vehiclesOnLink = {};
        const vehiclesInIntersection = [];
        if (vehicles) {
            vehicles.forEach(v => {
                if (v.state === 'onLink') {
                    if (!vehiclesOnLink[v.currentLinkId]) vehiclesOnLink[v.currentLinkId] = [];
                    vehiclesOnLink[v.currentLinkId].push(v);
                } else if (v.state === 'inIntersection' || v.state === 'parking_maneuver') vehiclesInIntersection.push(v);
            });
        }

        if (netData.backgroundTiles) {
            ctx2D.save();
            for (const tile of netData.backgroundTiles) {
                if (tile.image) {
                    ctx2D.globalAlpha = tile.opacity;
                    ctx2D.drawImage(tile.image, tile.x, tile.y, tile.width, tile.height);
                }
            }
            ctx2D.restore();
        }

        // --- Draw Parking Lots (2D) ---
        if (netData.parkingLots) {
            netData.parkingLots.forEach(lot => {
                // 1. 繪製邊界區域
                if (lot.boundary.length > 0) {
                    ctx2D.fillStyle = 'rgba(200, 200, 210, 0.5)'; // 淡灰藍色
                    ctx2D.strokeStyle = '#888899';
                    ctx2D.lineWidth = 1 / scale;

                    ctx2D.beginPath();
                    ctx2D.moveTo(lot.boundary[0].x, lot.boundary[0].y);
                    for (let i = 1; i < lot.boundary.length; i++) {
                        ctx2D.lineTo(lot.boundary[i].x, lot.boundary[i].y);
                    }
                    ctx2D.closePath();
                    ctx2D.fill();
                    ctx2D.stroke();
                }

                // 2. 繪製出入口與連接線
                lot.gates.forEach(gate => {
                    // 連接線
                    if (gate.connector) {
                        ctx2D.strokeStyle = 'rgba(255, 255, 0, 0.6)'; // 黃色連接線
                        ctx2D.lineWidth = 2 / scale; // 稍微粗一點
                        ctx2D.setLineDash([3 / scale, 3 / scale]); // 虛線
                        ctx2D.beginPath();
                        ctx2D.moveTo(gate.connector.x1, gate.connector.y1);
                        ctx2D.lineTo(gate.connector.x2, gate.connector.y2);
                        ctx2D.stroke();
                        ctx2D.setLineDash([]);
                    }

                    // [已移除重複代碼]

                    // [修正] Gate 本體繪製
                    ctx2D.save();
                    ctx2D.translate(gate.x, gate.y);

                    // [修正] 啟用旋轉，使用解析後的弧度
                    if (typeof gate.rotation === 'number') {
                        ctx2D.rotate(gate.rotation);
                    }

                    // 依據 Gate 類型給予不同顏色
                    if (gate.type === 'entry') ctx2D.fillStyle = '#44ff44'; // 綠色入口
                    else if (gate.type === 'exit') ctx2D.fillStyle = '#ff4444'; // 紅色出口
                    else ctx2D.fillStyle = '#ff9900'; // 橘色雙向

                    const gw = Math.max(1, gate.width || 4);
                    const gh = Math.max(1, gate.height || 2);

                    // 繪製矩形 (置中)
                    ctx2D.fillRect(-gw / 2, -gh / 2, gw, gh);

                    // 繪製方向箭頭或邊框以顯示角度
                    ctx2D.strokeStyle = '#ffffff';
                    ctx2D.lineWidth = 0.5 / scale;
                    ctx2D.strokeRect(-gw / 2, -gh / 2, gw, gh);

                    // 畫一個小箭頭指示前方 (X軸正向)
                    ctx2D.beginPath();
                    ctx2D.moveTo(0, 0);
                    ctx2D.lineTo(gw / 2, 0);
                    ctx2D.stroke();

                    ctx2D.restore();
                });

                // 3. 繪製停車格位 (2D)
                if (lot.carCapacity > 0 && lot.boundary.length >= 3) {
                    const SLOT_WIDTH = 2.5;  // 公尺
                    const SLOT_LENGTH = 5.5; // 公尺
                    const SLOT_GAP = 0.1;    // 格位間隙

                    // 計算停車場邊界框
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    lot.boundary.forEach(p => {
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.y > maxY) maxY = p.y;
                    });

                    const lotWidth = maxX - minX;
                    const lotHeight = maxY - minY;
                    const isHorizontal = lotWidth >= lotHeight;

                    // 輔助函式：檢查矩形是否在多邊形內
                    function isSlotInsidePolygon(x, y, w, h, polygon) {
                        const corners = [
                            { x: x, y: y },
                            { x: x + w, y: y },
                            { x: x + w, y: y + h },
                            { x: x, y: y + h }
                        ];
                        return corners.every(c => Geom.Utils.isPointInPolygon(c, polygon));
                    }

                    // 遍歷格子位置，只繪製在多邊形內且未超過容量的格位
                    ctx2D.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx2D.lineWidth = 0.15;
                    ctx2D.fillStyle = 'rgba(80, 80, 90, 0.4)';

                    let drawnCount = 0;
                    let slotsPerFloor = 0; // 計算每層可容納格數
                    const slotW = isHorizontal ? SLOT_WIDTH : SLOT_LENGTH;
                    const slotH = isHorizontal ? SLOT_LENGTH : SLOT_WIDTH;

                    // 第一回合：計算每層實際可放幾格
                    for (let row = 0; ; row++) {
                        const slotY = minY + SLOT_GAP + row * (slotH + SLOT_GAP);
                        if (slotY + slotH > maxY) break;
                        for (let col = 0; ; col++) {
                            const slotX = minX + SLOT_GAP + col * (slotW + SLOT_GAP);
                            if (slotX + slotW > maxX) break;
                            if (isSlotInsidePolygon(slotX, slotY, slotW, slotH, lot.boundary)) {
                                slotsPerFloor++;
                            }
                        }
                    }
                    slotsPerFloor = Math.max(1, slotsPerFloor);
                    const totalFloors = Math.ceil(lot.carCapacity / slotsPerFloor);

                    // 第二回合：繪製第一層的格位
                    for (let row = 0; drawnCount < lot.carCapacity && drawnCount < slotsPerFloor; row++) {
                        const slotY = minY + SLOT_GAP + row * (slotH + SLOT_GAP);
                        if (slotY + slotH > maxY) break;
                        for (let col = 0; drawnCount < lot.carCapacity && drawnCount < slotsPerFloor; col++) {
                            const slotX = minX + SLOT_GAP + col * (slotW + SLOT_GAP);
                            if (slotX + slotW > maxX) break;
                            if (isSlotInsidePolygon(slotX, slotY, slotW, slotH, lot.boundary)) {
                                ctx2D.fillRect(slotX, slotY, slotW, slotH);
                                ctx2D.strokeRect(slotX, slotY, slotW, slotH);
                                drawnCount++;
                            }
                        }
                    }

                    // 顯示樓層數標示 (如果有多層)
                    if (totalFloors > 1) {
                        ctx2D.save();
                        ctx2D.fillStyle = '#ffffff';
                        ctx2D.font = `${Math.max(8, 16 / scale)}px sans-serif`;
                        ctx2D.textAlign = 'center';
                        ctx2D.textBaseline = 'middle';
                        const centerX = (minX + maxX) / 2;
                        const centerY = (minY + maxY) / 2;
                        ctx2D.fillText(`${totalFloors}F`, centerX, centerY);
                        ctx2D.restore();
                    }
                }
            });
        }

        // Draw Nodes
        if (netData.nodes) {
            Object.values(netData.nodes).forEach(node => {
                if (node.polygon) {
                    ctx2D.fillStyle = '#666666';
                    ctx2D.strokeStyle = '#666'; ctx2D.lineWidth = 1 / scale;
                    ctx2D.beginPath();
                    ctx2D.moveTo(node.polygon[0].x, node.polygon[0].y);
                    for (let i = 1; i < node.polygon.length; i++) ctx2D.lineTo(node.polygon[i].x, node.polygon[i].y);
                    ctx2D.closePath(); ctx2D.fill(); ctx2D.stroke();
                }
            });
        }

        // Draw Links (Roads)
        Object.values(netData.links).forEach(link => {
            // Apply Highlight Color if this link is being hovered by Pegman
            if (currentHoveredLink && link.id === currentHoveredLink.id) {
                ctx2D.fillStyle = '#32CD32'; // Lime Green Highlight
            } else {
                ctx2D.fillStyle = '#666666';
            }

            link.geometry.forEach(geo => {
                ctx2D.strokeStyle = '#666'; ctx2D.lineWidth = 1 / scale;
                ctx2D.beginPath();
                ctx2D.moveTo(geo.points[0].x, geo.points[0].y);
                for (let i = 1; i < geo.points.length; i++) ctx2D.lineTo(geo.points[i].x, geo.points[i].y);
                ctx2D.closePath(); ctx2D.fill(); ctx2D.stroke();
            });
            if (link.dividingLines) {
                ctx2D.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx2D.lineWidth = 0.5 / scale; ctx2D.setLineDash([5 / scale, 7 / scale]);
                link.dividingLines.forEach(line => {
                    if (line.path.length > 1) {
                        ctx2D.beginPath(); ctx2D.moveTo(line.path[0].x, line.path[0].y);
                        for (let i = 1; i < line.path.length; i++) ctx2D.lineTo(line.path[i].x, line.path[i].y);
                        ctx2D.stroke();
                    }
                });
                ctx2D.setLineDash([]);
            }
            if (vehiclesOnLink[link.id]) vehiclesOnLink[link.id].forEach(v => drawVehicle2D(v));
        });

        if (vehiclesInIntersection.length > 0) vehiclesInIntersection.forEach(v => drawVehicle2D(v));

        if (showTurnPaths && simulation) {
            ctx2D.lineWidth = 2 / scale;
            simulation.trafficLights.forEach(tfl => {
                const node = netData.nodes[tfl.nodeId];
                if (node) {
                    node.transitions.forEach(transition => {
                        if (transition.bezier && transition.turnGroupId) {
                            const signal = tfl.getSignalForTurnGroup(transition.turnGroupId);
                            if (signal === 'Red') ctx2D.strokeStyle = 'rgba(255, 0, 0, 0.7)';
                            else if (signal === 'Yellow') ctx2D.strokeStyle = 'rgba(255, 193, 7, 0.9)';
                            else ctx2D.strokeStyle = 'rgba(76, 175, 80, 0.7)';
                            const [p0, p1, p2, p3] = transition.bezier.points;
                            ctx2D.beginPath(); ctx2D.moveTo(p0.x, p0.y);
                            ctx2D.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y); ctx2D.stroke();
                        }
                    });
                }
            });
        }

        if (showPointMeters && netData.speedMeters) {
            netData.speedMeters.forEach(meter => {
                const size = 3.5;
                ctx2D.save(); ctx2D.translate(meter.x, meter.y); ctx2D.rotate(meter.angle);
                ctx2D.fillStyle = 'rgba(239, 122, 50, 0.9)'; ctx2D.beginPath();
                ctx2D.moveTo(0, -size * 0.8); ctx2D.lineTo(size, size * 0.8); ctx2D.lineTo(-size, size * 0.8); ctx2D.closePath(); ctx2D.fill();
                ctx2D.restore();
            });
        }
        if (showSectionMeters && netData.sectionMeters) {
            netData.sectionMeters.forEach(meter => {
                const size = 3.0;
                [{ x: meter.startX, y: meter.startY, a: meter.startAngle }, { x: meter.endX, y: meter.endY, a: meter.endAngle }].forEach(p => {
                    ctx2D.save(); ctx2D.translate(p.x, p.y); ctx2D.rotate(p.a);
                    ctx2D.fillStyle = 'rgba(50, 180, 239, 0.9)'; ctx2D.fillRect(-size / 2, -size / 2, size, size);
                    ctx2D.restore();
                });
            });
        }
    }

    function drawVehicle2D(v) {
        ctx2D.save(); ctx2D.translate(v.x, v.y); ctx2D.rotate(v.angle);
        const isChaseVehicle = isChaseActive && chaseVehicleId && v.id === chaseVehicleId;
        ctx2D.fillStyle = isChaseVehicle ? 'rgba(255, 0, 0, 1.0)' : 'rgba(10, 238, 254, 1.0)';
        ctx2D.strokeStyle = '#FFFFFF';
        ctx2D.lineWidth = (isChaseVehicle ? 1.2 : 0.5) / scale;
        ctx2D.beginPath(); ctx2D.rect(-v.length / 2, -v.width / 2, v.length, v.width);
        ctx2D.fill(); ctx2D.stroke(); ctx2D.restore();
    }


    // ===================================================================
    // 3D Rendering Logic (Three.js) - Optimized to prevent flickering
    // ===================================================================

    function init3D() {
        scene = new THREE.Scene();
        // 1. Sky Blue Background
        const skyColor = 0x87CEEB;
        scene.background = new THREE.Color(skyColor);
        scene.fog = new THREE.Fog(skyColor, 200, 5000);

        camera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 1, 10000);
        camera.position.set(0, 500, 500);
        camera.up.set(0, 1, 0);

        // 2. Renderer with Logarithmic Depth Buffer (Crucial for flickering)
        renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        renderer.shadowMap.enabled = true;
        container3D.appendChild(renderer.domElement);

        renderer.domElement.addEventListener('click', handle3DVehiclePick);

        controls = new THREE.OrbitControls(camera, renderer.domElement);

        // 啟用鍵盤監聽，方便筆電使用者平移
        controls.listenToKeyEvents(window);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;
        controls.keyPanSpeed = 20.0;

        controls.addEventListener('change', () => {
            if (!isDisplay2D || !isDisplay3D) return;
            if (!isRotationSyncEnabled) return;
            has3DHeadingChangedSinceSplit = true;
            sync2DRotationFrom3D();
            if (!isRunning) redraw2D();
        });

        // 3. Limit rotation (cannot go below ground)
        controls.maxPolarAngle = Math.PI / 2 - 0.05; // Slightly above horizon

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(100, 500, 100);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 5000;
        const d = 2000;
        dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
        // 4. Shadow Bias to prevent shadow acne flickering
        dirLight.shadow.bias = -0.0005;
        scene.add(dirLight);

        // 5. Ground Plane (Separate distinct layer)
        const groundGeo = new THREE.PlaneGeometry(100000, 100000);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -5.0; // [修正] 大幅降低地面高度，避免遮擋底圖
        ground.receiveShadow = true;
        scene.add(ground);

        scene.add(networkGroup);
        scene.add(debugGroup);
        scene.add(signalPathsGroup);
        scene.add(trafficLightsGroup); // Add traffic light poles group

        // [新增] 加入城市群組
        scene.add(cityGroup);

        // [新增] 加入底圖群組
        scene.add(basemapGroup);
    }

    function onWindowResize() {
        resizeCanvas2D();

        if (camera && renderer) {
            const w = Math.max(1, container3D.clientWidth);
            const h = Math.max(1, container3D.clientHeight);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
    }

    function to3D(x, y, h = 0) {
        return new THREE.Vector3(x, h, y);
    }

    // Creates a traffic light pole with dual-face support.
    // Returns object containing group and lamp arrays for front and back faces.
    function createTrafficLightPole(position, flowAngle, nodeId, linkIdFront, linkIdBack) {
        const poleHeight = 6.0;
        const armLength = 5.0;
        const housingWidth = 4.0;
        const housingHeight = 0.8;
        const housingDepth = 0.8;

        const group = new THREE.Group();
        group.position.copy(position);

        // --- Orientation Logic ---
        const target = new THREE.Vector3(
            position.x + Math.cos(flowAngle) * 10,
            0,
            position.z + Math.sin(flowAngle) * 10
        );
        group.lookAt(target);
        group.rotateY(Math.PI);

        // 1. Vertical Pole
        const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, poleHeight, 16);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0xCCCCCC });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = poleHeight / 2;
        pole.castShadow = true;
        group.add(pole);

        // 2. Horizontal Arm (Extends Left / -X)
        const armGeo = new THREE.CylinderGeometry(0.12, 0.10, armLength, 16);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(-armLength / 2, poleHeight - 0.5, 0);
        arm.castShadow = true;
        group.add(arm);

        // 3. Signal Housing (Black Box)
        const boxGeo = new THREE.BoxGeometry(housingWidth, housingHeight, housingDepth);
        const boxMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        const housing = new THREE.Mesh(boxGeo, boxMat);
        housing.position.set(-armLength + 1.0, poleHeight - 0.5, 0);
        housing.castShadow = true;
        group.add(housing);

        // 4. Lights
        const lampsFront = [];
        const lampsBack = [];
        const lampRadius = 0.25;
        const spacing = 0.7;

        function createArrowShape(type) {
            const shape = new THREE.Shape();
            if (type === 'circle') {
                shape.moveTo(lampRadius, 0);
                shape.absarc(0, 0, lampRadius, 0, Math.PI * 2, false);
            } else if (type === 'straight') {
                shape.moveTo(-0.1, -0.15); shape.lineTo(-0.1, 0.05);
                shape.lineTo(-0.2, 0.05); shape.lineTo(0, 0.25);
                shape.lineTo(0.2, 0.05); shape.lineTo(0.1, 0.05);
                shape.lineTo(0.1, -0.15); shape.lineTo(-0.1, -0.15);
            } else if (type === 'left') {
                shape.moveTo(0.15, -0.1); shape.lineTo(-0.05, -0.1);
                shape.lineTo(-0.05, -0.2); shape.lineTo(-0.25, 0);
                shape.lineTo(-0.05, 0.2); shape.lineTo(-0.05, 0.1);
                shape.lineTo(0.15, 0.1); shape.lineTo(0.15, -0.1);
            } else if (type === 'right') {
                shape.moveTo(-0.15, -0.1); shape.lineTo(0.05, -0.1);
                shape.lineTo(0.05, -0.2); shape.lineTo(0.25, 0);
                shape.lineTo(0.05, 0.2); shape.lineTo(0.05, 0.1);
                shape.lineTo(-0.15, 0.1); shape.lineTo(-0.15, -0.1);
            }
            return shape;
        }

        const lampConfig = [
            { type: 'circle', color: 0xFF0000, name: 'Red' },
            { type: 'circle', color: 0xFFCC00, name: 'Yellow' },
            { type: 'left', color: 0x00FF00, name: 'Left' },
            { type: 'straight', color: 0x00FF00, name: 'Straight' },
            { type: 'right', color: 0x00FF00, name: 'Right' }
        ];

        const visorGeo = new THREE.CylinderGeometry(lampRadius + 0.05, lampRadius + 0.05, 0.2, 16, 1, true, 0, Math.PI);
        const visorMat = new THREE.MeshLambertMaterial({ color: 0x000000, side: THREE.DoubleSide });

        lampConfig.forEach((cfg, idx) => {
            const xOffsetFront = (idx - 2) * spacing;
            const xOffsetBack = -xOffsetFront; // Mirror for back side

            const shape = createArrowShape(cfg.type);
            const geo = new THREE.ShapeGeometry(shape);

            // --- Front Face ---
            // Fix: Use polygonOffset to prevent Z-fighting at acute angles
            const matFront = new THREE.MeshBasicMaterial({
                color: 0x111111,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -4, // Pulls the mesh forward in depth buffer
                polygonOffsetUnits: 1
            });
            const meshFront = new THREE.Mesh(geo, matFront);
            // Fix: Increased Z offset slightly from 0.05 to 0.08 for better physical separation
            meshFront.position.set((-armLength + 1.0) + xOffsetFront, poleHeight - 0.5, housingDepth / 2 + 0.08);
            group.add(meshFront);

            if (cfg.type !== 'circle') {
                const visorFront = new THREE.Mesh(visorGeo, visorMat);
                visorFront.rotation.x = Math.PI / 2;
                visorFront.rotation.z = -Math.PI / 2;
                visorFront.position.set((-armLength + 1.0) + xOffsetFront, poleHeight - 0.5, housingDepth / 2 + 0.18);
                group.add(visorFront);
            }

            lampsFront.push({ mesh: meshFront, material: matFront, config: cfg });

            // --- Back Face ---
            const matBack = new THREE.MeshBasicMaterial({
                color: 0x111111,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: 1
            });
            const meshBack = new THREE.Mesh(geo, matBack);
            meshBack.rotation.y = Math.PI; // Face Back
            // Fix: Increased Z offset (negative)
            meshBack.position.set((-armLength + 1.0) + xOffsetBack, poleHeight - 0.5, -housingDepth / 2 - 0.08);
            group.add(meshBack);

            if (cfg.type !== 'circle') {
                const visorBack = new THREE.Mesh(visorGeo, visorMat);
                visorBack.rotation.x = Math.PI / 2;
                visorBack.rotation.z = -Math.PI / 2;
                visorBack.rotation.y = Math.PI; // Face Back
                visorBack.position.set((-armLength + 1.0) + xOffsetBack, poleHeight - 0.5, -housingDepth / 2 - 0.18);
                group.add(visorBack);
            }

            lampsBack.push({ mesh: meshBack, material: matBack, config: cfg });
        });

        // Store reference for updates with independent link control
        trafficLightMeshes.push({
            nodeId: nodeId,
            linkIdFront: linkIdFront,
            linkIdBack: linkIdBack,
            lampsFront: lampsFront,
            lampsBack: lampsBack
        });

        return group;
    }
    function buildNetwork3D(netData) {
        networkGroup.clear();
        debugGroup.clear();
        signalPathsGroup.clear();
        trafficLightsGroup.clear();
        trafficLightMeshes = [];

        // --- Materials ---
        const roadMat = new THREE.MeshLambertMaterial({ color: 0x555555, side: THREE.DoubleSide });
        const junctionMat = new THREE.MeshLambertMaterial({ color: 0x666666, side: THREE.DoubleSide });
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const meterMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 });
        const sectionMat = new THREE.MeshBasicMaterial({ color: 0x32b4ef, transparent: true, opacity: 0.5 });
        // 停車場材質
        const parkingFloorMat = new THREE.MeshLambertMaterial({ color: 0x9999aa, side: THREE.DoubleSide });
        const parkingConnectorSurfaceMat = new THREE.MeshLambertMaterial({
            color: 0x555555, // 與路面相同顏色
            side: THREE.DoubleSide
        });
        const connectorLineMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
        // 停車格線材質
        const slotLineMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false, // 避免 Z-fighting
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: 1
        });
        const upperFloorMat = new THREE.MeshLambertMaterial({ color: 0x778899, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });

        // --- Helper Functions for Geometry Clipping ---
        const segIntersect = (a, b, c, d) => {
            const r = { x: b.x - a.x, y: b.y - a.y };
            const s = { x: d.x - c.x, y: d.y - c.y };
            const denom = r.x * s.y - r.y * s.x;
            if (Math.abs(denom) < 1e-9) return null;
            const qmp = { x: c.x - a.x, y: c.y - a.y };
            const t = (qmp.x * s.y - qmp.y * s.x) / denom;
            const u = (qmp.x * r.y - qmp.y * r.x) / denom;
            if (t < 0 || t > 1 || u < 0 || u > 1) return null;
            return { t, x: a.x + t * r.x, y: a.y + t * r.y };
        };

        const closestPointOnSegment = (p, a, b) => {
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const apx = p.x - a.x;
            const apy = p.y - a.y;
            const abLen2 = abx * abx + aby * aby;
            if (abLen2 < 1e-12) return { x: a.x, y: a.y };
            let t = (apx * abx + apy * aby) / abLen2;
            if (t < 0) t = 0;
            else if (t > 1) t = 1;
            return { x: a.x + abx * t, y: a.y + aby * t };
        };

        const closestPointOnPolygon = (p, polygon) => {
            if (!polygon || polygon.length < 2) return null;
            let best = null;
            let bestD2 = Infinity;
            for (let i = 0; i < polygon.length; i++) {
                const a = polygon[i];
                const b = polygon[(i + 1) % polygon.length];
                const q = closestPointOnSegment(p, a, b);
                const dx = p.x - q.x;
                const dy = p.y - q.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    best = q;
                }
            }
            return best;
        };

        const firstIntersectionOnSegment = (p0, p1, polygon) => {
            if (!polygon || polygon.length < 2) return null;
            let best = null;
            for (let i = 0; i < polygon.length; i++) {
                const a = polygon[i];
                const b = polygon[(i + 1) % polygon.length];
                const hit = segIntersect(p0, p1, a, b);
                if (!hit) continue;
                if (!best || hit.t < best.t) best = hit;
            }
            return best;
        };

        const firstIntersectionWithLinkGeometry = (p0, p1, link) => {
            if (!link || !link.geometry || link.geometry.length === 0) return null;
            let best = null;
            link.geometry.forEach((geo) => {
                if (!geo || !geo.points || geo.points.length < 2) return;
                const hit = firstIntersectionOnSegment(p0, p1, geo.points);
                if (!hit) return;
                if (!best || hit.t < best.t) best = hit;
            });
            return best;
        };

        // --- 1. Draw Links (Roads) ---
        Object.values(netData.links).forEach(link => {
            if (link.geometry) {
                link.geometry.forEach(geo => {
                    if (geo.points.length < 3) return;
                    const shape = new THREE.Shape();
                    shape.moveTo(geo.points[0].x, -geo.points[0].y);
                    for (let i = 1; i < geo.points.length; i++) shape.lineTo(geo.points[i].x, -geo.points[i].y);
                    const geom = new THREE.ShapeGeometry(shape);
                    geom.rotateX(-Math.PI / 2);
                    const mesh = new THREE.Mesh(geom, roadMat);
                    mesh.receiveShadow = true;
                    mesh.position.y = 0.1;
                    networkGroup.add(mesh);
                });
            }
            if (link.dividingLines) {
                link.dividingLines.forEach(line => {
                    if (line.path.length < 2) return;
                    const points = line.path.map(p => to3D(p.x, p.y, 0.25));
                    const geometry = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMesh = new THREE.Line(geometry, lineMat);
                    networkGroup.add(lineMesh);
                });
            }
        });

        // --- 2. Draw Nodes (Junctions) ---
        Object.values(netData.nodes).forEach(node => {
            if (node.polygon && node.polygon.length >= 3) {
                const shape = new THREE.Shape();
                shape.moveTo(node.polygon[0].x, -node.polygon[0].y);
                for (let i = 1; i < node.polygon.length; i++) shape.lineTo(node.polygon[i].x, -node.polygon[i].y);
                const geom = new THREE.ShapeGeometry(shape);
                geom.rotateX(-Math.PI / 2);
                const mesh = new THREE.Mesh(geom, junctionMat);
                mesh.receiveShadow = true;
                mesh.position.y = 0.2;
                networkGroup.add(mesh);
            }
            // Signal paths visualization
            if (node.transitions) {
                node.transitions.forEach(transition => {
                    if (transition.bezier && transition.turnGroupId) {
                        const [p0, p1, p2, p3] = transition.bezier.points;
                        const curve = new THREE.CubicBezierCurve3(to3D(p0.x, p0.y, 0.5), to3D(p1.x, p1.y, 0.5), to3D(p2.x, p2.y, 0.5), to3D(p3.x, p3.y, 0.5));
                        const points = curve.getPoints(20);
                        const geometry = new THREE.BufferGeometry().setFromPoints(points);
                        const material = new THREE.LineBasicMaterial({ color: 0x4caf50, linewidth: 3 });
                        const curveLine = new THREE.Line(geometry, material);
                        curveLine.userData = { nodeId: node.id, turnGroupId: transition.turnGroupId };
                        signalPathsGroup.add(curveLine);
                    }
                });
            }
        });

        // --- 3. Build Parking Lots (3D) ---
        if (netData.parkingLots) {
            netData.parkingLots.forEach(lot => {
                // A. 建立停車場地面 (Floor)
                if (lot.boundary.length >= 3) {
                    const shape = new THREE.Shape();
                    shape.moveTo(lot.boundary[0].x, -lot.boundary[0].y);
                    for (let i = 1; i < lot.boundary.length; i++) {
                        shape.lineTo(lot.boundary[i].x, -lot.boundary[i].y);
                    }
                    const geom = new THREE.ShapeGeometry(shape);
                    geom.rotateX(-Math.PI / 2);
                    const mesh = new THREE.Mesh(geom, parkingFloorMat);
                    // 地面高度 0.05
                    mesh.position.y = 0.05;
                    mesh.receiveShadow = true;
                    networkGroup.add(mesh);
                }

                // B. 建立出入口 (Gates) 與 連接路面 (Connectors)
                lot.gates.forEach(gate => {
                    const gateWidth = gate.width || 4.0;
                    // [已移除] 不再使用單色方塊標記，避免與路面/停車場重疊

                    // --- B2. 繪製連接路面 (Connector Surface: 優化貼合邊界) ---
                    // 起點 (Gate 中心) 與 終點 (道路連接點)
                    let pStart = { x: gate.x, y: gate.y };
                    let pEnd = gate.connector ? { x: gate.connector.x2, y: gate.connector.y2 } : null;

                    if (!pEnd) {
                        // 無連接時，根據旋向延伸一段
                        const len = 3.0;
                        const rad = gate.rotation || 0;
                        pEnd = { x: gate.x + Math.cos(rad) * len, y: gate.y + Math.sin(rad) * len };
                    }

                    // 1. 計算輔助參數：方向向量 U 與 垂直向量 P
                    const mainDx = pEnd.x - pStart.x;
                    const mainDy = pEnd.y - pStart.y;
                    const mainLen = Math.hypot(mainDx, mainDy);
                    if (mainLen < 0.01) return;

                    const ux = mainDx / mainLen;
                    const uy = mainDy / mainLen;
                    const px = -uy;
                    const py = ux;
                    const halfW = (gate.width || 4.0) / 2;

                    // 2. 定義左、右兩條「鐵軌」線段的出發點 (相對於 Gate 中心)
                    const gateL = { x: pStart.x + px * halfW, y: pStart.y + py * halfW };
                    const gateR = { x: pStart.x - px * halfW, y: pStart.y - py * halfW };
                    // 終點 (朝著道路方向延伸足够遠，確保能穿過路緣)
                    const roadExtendLen = mainLen + 20; // 加大搜尋範圍
                    const roadL = { x: gateL.x + ux * roadExtendLen, y: gateL.y + uy * roadExtendLen };
                    const roadR = { x: gateR.x + ux * roadExtendLen, y: gateR.y + uy * roadExtendLen };

                    // 3. 分別尋找左、右鐵軌與「停車場邊界」的交點 (V_lot_L, V_lot_R)
                    // 如果原本沒嵌套在 lot 內，我們現場搜尋最近的 lot boundary
                    let targetBoundary = lot.boundary;

                    const hitLotL = firstIntersectionOnSegment(gateL, roadL, targetBoundary);
                    const hitLotR = firstIntersectionOnSegment(gateR, roadR, targetBoundary);
                    // 預設為 Gate 位置
                    let V_lot_L = hitLotL ? { x: hitLotL.x, y: hitLotL.y } : (closestPointOnPolygon(gateL, targetBoundary) || { x: gateL.x, y: gateL.y });
                    let V_lot_R = hitLotR ? { x: hitLotR.x, y: hitLotR.y } : (closestPointOnPolygon(gateR, targetBoundary) || { x: gateR.x, y: gateR.y });

                    // 4. 分別尋找左、右鐵軌與「道路邊緣」的交點 (V_road_L, V_road_R)
                    let V_road_L = { x: gateL.x + ux * mainLen, y: gateL.y + uy * mainLen }; // 預設終點
                    let V_road_R = { x: gateR.x + ux * mainLen, y: gateR.y + uy * mainLen }; // 預設終點

                    if (gate.connector && gate.connector.linkId && netData.links[gate.connector.linkId]) {
                        const link = netData.links[gate.connector.linkId];
                        const hitRoadL = firstIntersectionWithLinkGeometry(V_lot_L, roadL, link);
                        const hitRoadR = firstIntersectionWithLinkGeometry(V_lot_R, roadR, link);
                        if (hitRoadL) V_road_L = { x: hitRoadL.x, y: hitRoadL.y };
                        if (hitRoadR) V_road_R = { x: hitRoadR.x, y: hitRoadR.y };
                    } else if (mainLen > 0) {
                        // 若無明確 connector，則嘗試搜尋「所有」道路邊緣
                        let bestHitL = null;
                        let bestHitR = null;
                        Object.values(netData.links).forEach(link => {
                            const hL = firstIntersectionWithLinkGeometry(V_lot_L, roadL, link);
                            const hR = firstIntersectionWithLinkGeometry(V_lot_R, roadR, link);
                            if (hL && (!bestHitL || hL.t < bestHitL.t)) bestHitL = hL;
                            if (hR && (!bestHitR || hR.t < bestHitR.t)) bestHitR = hR;
                        });
                        if (bestHitL) V_road_L = { x: bestHitL.x, y: bestHitL.y };
                        if (bestHitR) V_road_R = { x: bestHitR.x, y: bestHitR.y };
                    }

                    // --- [新增修正] 延伸覆蓋 (Bleed) ---
                    // 為了解決 Z-fighting 與縫隙，我們將計算出的交點稍微往「內」與往「外」延伸
                    // 讓通道面(y=0.12)稍微蓋在停車場地面(y=0.05)與道路(y=0.10)之上
                    const BLEED_AMOUNT = 0.25; // 延伸 0.25 公尺

                    // 輔助函式：沿著向量方向延伸點
                    const extendPoint = (pOrigin, pTarget, dist) => {
                        const dx = pTarget.x - pOrigin.x;
                        const dy = pTarget.y - pOrigin.y;
                        const len = Math.hypot(dx, dy);
                        if (len < 1e-4) return { ...pTarget };
                        const ex = dx / len;
                        const ey = dy / len;
                        return {
                            x: pTarget.x + ex * dist,
                            y: pTarget.y + ey * dist
                        };
                    };

                    const shiftFrom = (pFrom, pTo, dist) => {
                        const dx = pTo.x - pFrom.x;
                        const dy = pTo.y - pFrom.y;
                        const len = Math.hypot(dx, dy);
                        if (len < 1e-4) return { ...pFrom };
                        const ux = dx / len;
                        const uy = dy / len;
                        return { x: pFrom.x + ux * dist, y: pFrom.y + uy * dist };
                    };

                    const signL = Geom.Utils.isPointInPolygon(gateL, targetBoundary) ? -1 : 1;
                    const signR = Geom.Utils.isPointInPolygon(gateR, targetBoundary) ? -1 : 1;
                    const V_lot_L_out = shiftFrom(V_lot_L, gateL, signL * BLEED_AMOUNT);
                    const V_lot_R_out = shiftFrom(V_lot_R, gateR, signR * BLEED_AMOUNT);
                    const V_road_L_out = extendPoint(V_lot_L_out, V_road_L, -BLEED_AMOUNT);
                    const V_road_R_out = extendPoint(V_lot_R_out, V_road_R, -BLEED_AMOUNT);

                    const gapLenL = Math.hypot(V_road_L_out.x - V_lot_L_out.x, V_road_L_out.y - V_lot_L_out.y);
                    const gapLenR = Math.hypot(V_road_R_out.x - V_lot_R_out.x, V_road_R_out.y - V_lot_R_out.y);
                    if (gapLenL < 0.05 || gapLenR < 0.05) return;

                    V_lot_L = V_lot_L_out;
                    V_lot_R = V_lot_R_out;
                    V_road_L = V_road_L_out;
                    V_road_R = V_road_R_out;

                    // 5. 繪製由這四個點組成的自定義面
                    // 設定高度略高於道路(0.1)，以覆蓋接縫
                    const roadHeight = 0.12;

                    const vertices = new Float32Array([
                        V_lot_L.x, roadHeight, V_lot_L.y,
                        V_road_L.x, roadHeight, V_road_L.y,
                        V_lot_R.x, roadHeight, V_lot_R.y,

                        V_road_L.x, roadHeight, V_road_L.y,
                        V_road_R.x, roadHeight, V_road_R.y,
                        V_lot_R.x, roadHeight, V_lot_R.y
                    ]);

                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                    geometry.computeVertexNormals();

                    const mesh = new THREE.Mesh(geometry, parkingConnectorSurfaceMat);
                    mesh.receiveShadow = true;
                    // 稍微提高渲染順序，確保覆蓋在一般路面上
                    mesh.renderOrder = 1001;
                    networkGroup.add(mesh);

                    // [已移除] 輔助黃線，以免重疊在路面上
                });

                // C. 建立停車格位與樓層 (Slots & Floors)
                if (lot.boundary.length >= 3) {
                    const SLOT_WIDTH = 2.5;
                    const SLOT_LENGTH = 5.5;
                    const SLOT_GAP = 0.1;
                    const FLOOR_HEIGHT = 3.0;

                    // 計算邊界
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    lot.boundary.forEach(p => {
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.y > maxY) maxY = p.y;
                    });

                    const lotWidth = maxX - minX;
                    const lotHeight = maxY - minY;
                    const isHorizontal = lotWidth >= lotHeight;
                    const slotW = isHorizontal ? SLOT_WIDTH : SLOT_LENGTH;
                    const slotH = isHorizontal ? SLOT_LENGTH : SLOT_WIDTH;

                    function isSlotInsidePolygon3D(x, y, w, h, polygon) {
                        const corners = [{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }];
                        return corners.every(c => Geom.Utils.isPointInPolygon(c, polygon));
                    }

                    // 計算每層容量
                    let slotsPerFloor = 0;
                    for (let row = 0; ; row++) {
                        const slotY = minY + SLOT_GAP + row * (slotH + SLOT_GAP);
                        if (slotY + slotH > maxY) break;
                        for (let col = 0; ; col++) {
                            const slotX = minX + SLOT_GAP + col * (slotW + SLOT_GAP);
                            if (slotX + slotW > maxX) break;
                            if (isSlotInsidePolygon3D(slotX, slotY, slotW, slotH, lot.boundary)) {
                                slotsPerFloor++;
                            }
                        }
                    }
                    slotsPerFloor = Math.max(1, slotsPerFloor);

                    const renderCapacity = (lot.slots && lot.slots.length > 0) ? lot.slots.length : lot.carCapacity;
                    const totalFloors = (renderCapacity > 0) ? Math.ceil(renderCapacity / slotsPerFloor) : 1;
                    let remainingSlots = (renderCapacity > 0) ? renderCapacity : Math.min(slotsPerFloor, 120);

                    for (let floor = 0; floor < totalFloors; floor++) {
                        const floorY = 0.05 + floor * FLOOR_HEIGHT;
                        const slotsOnThisFloor = Math.min(remainingSlots, slotsPerFloor);
                        remainingSlots -= slotsOnThisFloor;

                        // 上層樓板
                        if (floor > 0) {
                            const shape = new THREE.Shape();
                            shape.moveTo(lot.boundary[0].x, -lot.boundary[0].y);
                            for (let i = 1; i < lot.boundary.length; i++) {
                                shape.lineTo(lot.boundary[i].x, -lot.boundary[i].y);
                            }
                            const floorGeom = new THREE.ShapeGeometry(shape);
                            floorGeom.rotateX(-Math.PI / 2);
                            const floorMesh = new THREE.Mesh(floorGeom, upperFloorMat);
                            floorMesh.position.y = floorY - 0.01;
                            floorMesh.receiveShadow = true;
                            networkGroup.add(floorMesh);
                        }

                        // 繪製停車格線
                        const stripVertices = [];
                        const LINE_W = 0.10;
                        const pushStrip = (ax, az, bx, bz, y, w) => {
                            const dx = bx - ax, dz = bz - az;
                            const L = Math.hypot(dx, dz);
                            if (L < 1e-6) return;
                            const ux = dx / L, uz = dz / L;
                            const px = -uz, pz = ux;
                            const hw = w / 2;
                            stripVertices.push(
                                ax + px * hw, y, az + pz * hw,
                                bx + px * hw, y, bz + pz * hw,
                                ax - px * hw, y, az - pz * hw,
                                bx + px * hw, y, bz + pz * hw,
                                bx - px * hw, y, bz - pz * hw,
                                ax - px * hw, y, az - pz * hw
                            );
                        };

                        let drawnCount = 0;
                        for (let row = 0; drawnCount < slotsOnThisFloor; row++) {
                            const slotY = minY + SLOT_GAP + row * (slotH + SLOT_GAP);
                            if (slotY + slotH > maxY) break;
                            for (let col = 0; drawnCount < slotsOnThisFloor; col++) {
                                const slotX = minX + SLOT_GAP + col * (slotW + SLOT_GAP);
                                if (slotX + slotW > maxX) break;
                                if (isSlotInsidePolygon3D(slotX, slotY, slotW, slotH, lot.boundary)) {
                                    const x1 = slotX, x2 = slotX + slotW;
                                    const z1 = slotY, z2 = (slotY + slotH);
                                    const y = floorY + 0.05;
                                    pushStrip(x1, z1, x1, z2, y, LINE_W);
                                    pushStrip(x2, z1, x2, z2, y, LINE_W);
                                    pushStrip(x1, z2, x2, z2, y, LINE_W);
                                    pushStrip(x1, z1, x2, z1, y, LINE_W);
                                    drawnCount++;
                                }
                            }
                        }

                        if (stripVertices.length > 0) {
                            const lineGeom = new THREE.BufferGeometry();
                            lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stripVertices), 3));
                            const slotLines = new THREE.Mesh(lineGeom, slotLineMat);
                            slotLines.renderOrder = 2000;
                            networkGroup.add(slotLines);
                        }
                    }

                    // 樓層支柱
                    if (totalFloors > 1) {
                        const pillarMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
                        const pillarRadius = 0.3;
                        const pillarHeight = (totalFloors - 1) * FLOOR_HEIGHT;
                        const potentialCorners = [
                            { x: minX + 1, y: minY + 1 }, { x: maxX - 1, y: minY + 1 },
                            { x: minX + 1, y: maxY - 1 }, { x: maxX - 1, y: maxY - 1 }
                        ];
                        potentialCorners.forEach(corner => {
                            if (Geom.Utils.isPointInPolygon(corner, lot.boundary)) {
                                const pillarGeom = new THREE.CylinderGeometry(pillarRadius, pillarRadius, pillarHeight, 8);
                                const pillarMesh = new THREE.Mesh(pillarGeom, pillarMat);
                                pillarMesh.position.set(corner.x, pillarHeight / 2 + 0.06, corner.y); // 注意：這裡的 corner.y 是 Z
                                pillarMesh.castShadow = true;
                                networkGroup.add(pillarMesh);
                            }
                        });
                    }
                }
            });
        }

        // --- 4. Traffic Light Poles ---
        if (simulation && simulation.trafficLights) {
            simulation.trafficLights.forEach(tfl => {
                const node = netData.nodes[tfl.nodeId];
                if (!node) return;
                const incomingLinkIds = [];
                Object.values(netData.links).forEach(l => { if (l.destination === node.id) incomingLinkIds.push(l.id); });

                incomingLinkIds.forEach(linkId => {
                    const link = netData.links[linkId];
                    const lanes = Object.values(link.lanes);
                    if (lanes.length === 0) return;
                    const refLane = lanes[Math.floor(lanes.length / 2)];
                    if (refLane.path.length < 2) return;

                    const pEnd = refLane.path[refLane.path.length - 1];
                    const pPrev = refLane.path[refLane.path.length - 2];
                    const dirX = pEnd.x - pPrev.x;
                    const dirY = pEnd.y - pPrev.y;
                    const len = Math.hypot(dirX, dirY);
                    const nx = dirX / len;
                    const ny = dirY / len;
                    const angle = Math.atan2(ny, nx);
                    const rx = -ny, ry = nx;

                    let roadWidth = 0; lanes.forEach(l => roadWidth += l.width);
                    const offset = roadWidth / 2 + 2.0;
                    const nrX = pEnd.x + rx * offset;
                    const nrY = pEnd.y + ry * offset;
                    const nearRightPos = to3D(nrX, nrY, 0);

                    // Dual face logic check
                    let oppositeLinkId = null;
                    for (const otherId of incomingLinkIds) {
                        if (otherId === linkId) continue;
                        const otherLink = netData.links[otherId];
                        const oLanes = Object.values(otherLink.lanes);
                        if (oLanes.length === 0) continue;
                        const oPath = oLanes[0].path;
                        if (oPath.length < 2) continue;
                        const oP1 = oPath[oPath.length - 2], oP2 = oPath[oPath.length - 1];
                        const oAngle = Math.atan2(oP2.y - oP1.y, oP2.x - oP1.x);
                        let diff = Math.abs(angle - oAngle);
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        if (Math.abs(Math.abs(diff) - Math.PI) < 0.7) {
                            oppositeLinkId = otherId;
                            break;
                        }
                    }

                    const poleGroup = createTrafficLightPole(nearRightPos, angle, node.id, linkId, oppositeLinkId);
                    trafficLightsGroup.add(poleGroup);
                });
            });
        }

        // --- 5. Debug Meters ---
        if (netData.speedMeters) {
            const boxGeo = new THREE.BoxGeometry(2, 6, 2);
            netData.speedMeters.forEach(meter => {
                const mesh = new THREE.Mesh(boxGeo, meterMat);
                mesh.position.set(meter.x, 3, meter.y);
                mesh.name = `meter_point_${meter.id}`;
                debugGroup.add(mesh);
            });
        }
        if (netData.sectionMeters) {
            const boxGeo = new THREE.BoxGeometry(2, 6, 2);
            netData.sectionMeters.forEach(meter => {
                const startMesh = new THREE.Mesh(boxGeo, sectionMat);
                startMesh.position.set(meter.startX, 3, meter.startY);
                startMesh.name = `meter_section_${meter.id}_start`;
                debugGroup.add(startMesh);
                const endMesh = new THREE.Mesh(boxGeo, sectionMat);
                endMesh.position.set(meter.endX, 3, meter.endY);
                endMesh.name = `meter_section_${meter.id}_end`;
                debugGroup.add(endMesh);
            });
        }

        update3DVisibility();
    }

    // --- script02.js ---

    // --- script02.js ---

    function buildBasemap3D(netData) {
        basemapGroup.clear();

        if (!netData.backgroundTiles || netData.backgroundTiles.length === 0) return;

        // 將底圖高度設為 -0.2，確保在地面(-5.0)之上，且不與道路(0.1)衝突
        const yHeight = -0.2;

        netData.backgroundTiles.forEach(tile => {
            if (!tile.image) return;

            const texture = new THREE.Texture(tile.image);

            // 讓 3D 底圖的貼圖方向與 2D Canvas drawImage 一致（避免鏡射翻轉）
            texture.flipY = false;

            texture.center.set(0.5, 0.5);
            texture.rotation = Math.PI;

            // [關鍵修正 1] 設定紋理 Wrapping
            // 對於非 2 的次方尺寸圖片 (NPOT)，必須使用 ClampToEdgeWrapping，否則 WebGL 會拒絕渲染該紋理
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;

            // 濾波器設定
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;

            texture.needsUpdate = true;
            texture.encoding = THREE.sRGBEncoding;

            // [關鍵修正 2] 材質設定
            const isTransparent = (Number.isFinite(tile.opacity) && tile.opacity < 1.0);

            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true, // 保持開啟，以支援 PNG 透明通道
                opacity: isTransparent ? tile.opacity : 1.0,
                color: 0xffffff,
                side: THREE.DoubleSide, // 雙面渲染，防止因 scale -1 導致的面剔除
                depthWrite: true,       // 強制寫入深度，確保它是一個實體層
                depthTest: true
            });

            const geometry = new THREE.PlaneGeometry(tile.width, tile.height);
            const uvs = geometry.attributes.uv;
            for (let i = 0; i < uvs.count; i++) {
                uvs.setX(i, 1 - uvs.getX(i));
            }
            uvs.needsUpdate = true;
            const mesh = new THREE.Mesh(geometry, material);

            // 調整方位
            mesh.rotation.x = -Math.PI / 2;

            // 計算位置
            const centerX = tile.x + tile.width / 2;
            const centerZ = (tile.y + tile.height / 2);

            mesh.position.set(centerX, yHeight, centerZ);

            // [關鍵修正 3] 渲染順序
            // 999 確保它在地面 (通常是 0) 之後繪製
            mesh.renderOrder = 999;

            basemapGroup.add(mesh);
        });

        // 確保群組可見性正確
        updateLayerVisibility();

        // 強制重繪
        if (renderer) renderer.render(scene, camera);
    }


    // 更新圖層可見性
    function updateLayerVisibility() {
        const mode = layerSelector.value;

        // 控制建築 (City)
        if (cityGroup) {
            cityGroup.visible = (mode === 'both' || mode === 'buildings');
        }

        // 控制底圖 (Basemap)
        if (basemapGroup) {
            basemapGroup.visible = (mode === 'both' || mode === 'basemap');
        }

        // 重新渲染
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }

    function update3DVisibility() {
        debugGroup.children.forEach(child => {
            if (child.name.startsWith('meter_point_')) {
                child.visible = showPointMeters;
            } else if (child.name.startsWith('meter_section_')) {
                child.visible = showSectionMeters;
            }
        });
        signalPathsGroup.visible = showTurnPaths;
        trafficLightsGroup.visible = showTurnPaths;
    }

    function update3DSignals() {
        if (!simulation || !showTurnPaths) return;

        // Update Lines
        signalPathsGroup.children.forEach(line => {
            const { nodeId, turnGroupId } = line.userData;
            const tfl = simulation.trafficLights.find(t => t.nodeId === nodeId);
            if (tfl) {
                const signal = tfl.getSignalForTurnGroup(turnGroupId);
                if (signal === 'Red') line.material.color.setHex(0xff0000);
                else if (signal === 'Yellow') line.material.color.setHex(0xffc107);
                else line.material.color.setHex(0x4caf50);
            }
        });

        // Update Poles (Dual Face Logic)
        if (trafficLightMeshes.length > 0) {
            const updateFace = (linkId, lamps, tfl, node) => {
                if (!linkId) {
                    lamps.forEach(l => l.material.color.setHex(0x111111));
                    return;
                }

                const transitions = node.transitions.filter(t => t.sourceLinkId === linkId && t.turnGroupId);
                const inLink = networkData.links[linkId];
                const inAngle = getLinkAngle(inLink, true);

                let stateLeft = 'Red', stateStraight = 'Red', stateRight = 'Red';
                let hasLeft = false, hasStraight = false, hasRight = false;
                let anyYellow = false;

                transitions.forEach(trans => {
                    const signal = tfl.getSignalForTurnGroup(trans.turnGroupId);

                    // --- 計算轉彎角度 (Revised: Use Curve Angle) ---
                    let turnAngle = 0;
                    if (trans.bezier && trans.bezier.points.length > 0) {
                        const pts = trans.bezier.points;
                        const pStart = pts[0];
                        const pEnd = pts[pts.length - 1];
                        const dx = pEnd.x - pStart.x;
                        const dy = pEnd.y - pStart.y;
                        const curveAngle = Math.atan2(dy, dx);

                        let diff = curveAngle - inAngle;
                        while (diff <= -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        turnAngle = diff;
                    } else {
                        const outLink = networkData.links[trans.destLinkId];
                        const outAngle = getLinkAngle(outLink, false);
                        let diff = outAngle - inAngle;
                        while (diff <= -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        turnAngle = diff;
                    }

                    // --- Logic Corrected for Y-Up Coordinate System ---
                    if (turnAngle > 0.2) {
                        hasRight = true;
                        if (signal === 'Green') stateRight = 'Green';
                        if (signal === 'Yellow') anyYellow = true;
                    } else if (turnAngle < -0.2) {
                        hasLeft = true;
                        if (signal === 'Green') stateLeft = 'Green';
                        if (signal === 'Yellow') anyYellow = true;
                    } else {
                        hasStraight = true;
                        if (signal === 'Green') stateStraight = 'Green';
                        if (signal === 'Yellow') anyYellow = true;
                    }
                });

                // Apply Colors
                lamps.forEach(l => l.material.color.setHex(0x111111)); // Reset

                let showRed = true;
                if (stateStraight === 'Green' || stateLeft === 'Green' || stateRight === 'Green' || anyYellow) showRed = false;
                if (stateStraight !== 'Green' && !anyYellow) showRed = true;

                if (showRed) lamps[0].material.color.setHex(lamps[0].config.color);
                if (anyYellow) {
                    lamps[1].material.color.setHex(lamps[1].config.color);
                    lamps[0].material.color.setHex(0x111111);
                }
                if (hasLeft && stateLeft === 'Green') lamps[2].material.color.setHex(lamps[2].config.color);
                if (hasStraight && stateStraight === 'Green') lamps[3].material.color.setHex(lamps[3].config.color);
                if (hasRight && stateRight === 'Green') lamps[4].material.color.setHex(lamps[4].config.color);
            };

            trafficLightMeshes.forEach(poleData => {
                const { nodeId, linkIdFront, linkIdBack, lampsFront, lampsBack } = poleData;
                const tfl = simulation.trafficLights.find(t => t.nodeId === nodeId);
                const node = networkData.nodes[nodeId];

                if (tfl && node) {
                    updateFace(linkIdFront, lampsFront, tfl, node);
                    updateFace(linkIdBack, lampsBack, tfl, node);
                }
            });
        }
    }

    function getLinkAngle(link, isEnd) {
        if (!link) return 0;
        const lanes = Object.values(link.lanes);
        if (lanes.length === 0) return 0;
        const path = lanes[0].path;
        if (path.length < 2) return 0;
        let p1, p2;
        if (isEnd) { p1 = path[path.length - 2]; p2 = path[path.length - 1]; }
        else { p1 = path[0]; p2 = path[1]; }
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }

    // 建立一台更像車子的 Mesh Group (包含車身、車頂、輪胎、車燈)
    function createDetailedCarMesh(length, width, colorValue) {
        const carGroup = new THREE.Group();

        // 為了讓比例好看，我們設定一些高度參數
        const chassisHeight = 0.6; // 底盤高度
        const cabinHeight = 0.5;   // 車頂高度
        const wheelRadius = 0.3;   // 輪胎半徑
        const wheelThickness = 0.25;

        // --- 1. 底盤 (Chassis) - 主色 ---
        // 車頭朝向 +X，所以 Length 是 X 軸，Width 是 Z 軸
        const chassisGeo = new THREE.BoxGeometry(length, chassisHeight, width);
        // 這就是車身的顏色材質
        const paintMat = new THREE.MeshLambertMaterial({ color: colorValue });

        const chassis = new THREE.Mesh(chassisGeo, paintMat);
        chassis.position.y = chassisHeight / 2 + wheelRadius * 0.5; // 抬高，留給輪胎空間
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        carGroup.add(chassis);

        // --- 2. 車頂/車廂 (Cabin) - 頂部車色，側面黑窗 ---
        // 判斷是公車/卡車還是小汽車
        const isLargeVehicle = length > 5.5;

        let cabinGeo, cabinXOffset;
        if (isLargeVehicle) {
            // 大型車：車頂幾乎與車身同長同寬
            cabinGeo = new THREE.BoxGeometry(length - 0.5, 1.2, width - 0.2);
            cabinXOffset = 0;
        } else {
            // 小汽車：車頂較短，且向後偏移
            cabinGeo = new THREE.BoxGeometry(length * 0.55, cabinHeight, width * 0.85);
            cabinXOffset = -length * 0.1;
        }

        // [修改重點]：定義窗戶顏色 (深灰)
        const windowMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

        // [修改重點]：BoxGeometry 的材質陣列順序為：
        // 0: Right (X+), 1: Left (X-), 2: Top (Y+), 3: Bottom (Y-), 4: Front (Z+), 5: Back (Z-)
        // 我們將 Top (2) 設為 paintMat (車身顏色)，其餘設為 windowMat (窗戶)
        // 注意：Three.js 的 BoxGeometry 預設 Z 軸是前後，但我們的車身邏輯可能是 X 軸為前後
        // 不過材質陣列的邏輯是固定的 (Top 永遠是 Index 2)
        const cabinMaterials = [
            windowMat, // Right
            windowMat, // Left
            paintMat,  // Top (車頂！使用車身顏色)
            windowMat, // Bottom
            windowMat, // Front
            windowMat  // Back
        ];

        // 傳入陣列材質
        const cabin = new THREE.Mesh(cabinGeo, cabinMaterials);

        // 位置：在底盤上方
        cabin.position.set(cabinXOffset, chassis.position.y + chassisHeight / 2 + (isLargeVehicle ? 0.6 : cabinHeight / 2), 0);
        cabin.castShadow = true;
        carGroup.add(cabin);

        // --- 3. 輪胎 (Wheels) - 黑色圓柱體 ---
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 16);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

        const wheelX = length * 0.35;
        const wheelZ = width * 0.5 - wheelThickness / 2;
        const wheelY = wheelRadius;

        const positions = [
            { x: wheelX, z: wheelZ },   // 前左
            { x: wheelX, z: -wheelZ },  // 前右
            { x: -wheelX, z: wheelZ },  // 後左
            { x: -wheelX, z: -wheelZ }  // 後右
        ];

        if (isLargeVehicle) {
            positions.push({ x: -wheelX * 0.2, z: wheelZ });
            positions.push({ x: -wheelX * 0.2, z: -wheelZ });
        }

        positions.forEach(p => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(p.x, wheelY, p.z);
            wheel.castShadow = true;
            carGroup.add(wheel);
        });

        // --- 4. 車燈 (Lights) ---
        const headLightGeo = new THREE.BoxGeometry(0.1, 0.2, 0.4);
        const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffcc }); // 亮黃色
        const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // 紅色

        const lightY = chassis.position.y + 0.1;
        const lightZ = width * 0.3;
        const lightX = length / 2;

        const fl = new THREE.Mesh(headLightGeo, headLightMat);
        fl.position.set(lightX, lightY, lightZ);
        carGroup.add(fl);

        const fr = new THREE.Mesh(headLightGeo, headLightMat);
        fr.position.set(lightX, lightY, -lightZ);
        carGroup.add(fr);

        const bl = new THREE.Mesh(headLightGeo, tailLightMat);
        bl.position.set(-lightX, lightY, lightZ);
        carGroup.add(bl);

        const br = new THREE.Mesh(headLightGeo, tailLightMat);
        br.position.set(-lightX, lightY, -lightZ);
        carGroup.add(br);

        return carGroup;
    }

    function update3DScene() {
        if (!simulation) { renderer.render(scene, camera); return; }
        if (showTurnPaths) update3DSignals();

        const vehicles = simulation.vehicles;
        const activeIds = new Set();

        vehicles.forEach(v => {
            activeIds.add(v.id);
            let mesh = vehicleMeshes.get(v.id);

            if (!mesh) {
                const color = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
                mesh = createDetailedCarMesh(v.length, v.width, color);
                mesh.userData.vehicleId = v.id;
                mesh.traverse((child) => {
                    child.userData.vehicleId = v.id;
                });
                scene.add(mesh);
                vehicleMeshes.set(v.id, mesh);
            }

            // 更新位置與角度
            mesh.position.set(v.x, 0, v.y);
            mesh.rotation.y = -v.angle;
        });

        // 移除已經消失的車輛
        for (const [id, mesh] of vehicleMeshes) {
            if (!activeIds.has(id)) {
                scene.remove(mesh);

                // [修正] 更嚴謹的資源釋放邏輯
                mesh.traverse((child) => {
                    if (child.isMesh) {
                        // 釋放幾何體
                        if (child.geometry) {
                            child.geometry.dispose();
                        }

                        // 釋放材質 (需判斷是單一材質還是陣列)
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                // 如果是材質陣列 (例如車頂)，遍歷釋放
                                child.material.forEach(mat => mat.dispose());
                            } else {
                                // 如果是單一材質 (例如輪胎、底盤)，直接釋放
                                child.material.dispose();
                            }
                        }
                    }
                });

                vehicleMeshes.delete(id);
            }
        }

        if (isChaseActive) updateChaseCamera();
        renderer.render(scene, camera);
    }

    function autoCenterCamera3D(bounds) {
        if (bounds.minX === Infinity) return;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const maxDim = Math.max(width, height);
        controls.target.set(centerX, 0, centerY);
        camera.position.set(centerX, maxDim * 0.8, centerY + maxDim * 0.8);
        camera.near = 1;
        camera.far = Math.max(10000, maxDim * 5);
        camera.updateProjectionMatrix();
        controls.update();
    }

    // ===================================================================
    //  City Generation Logic (Procedural & Deterministic)
    // ===================================================================

    // 1. 偽隨機數生成器 (Linear Congruential Generator)
    // 確保輸入相同的種子，產生的隨機序列永遠一致
    class PseudoRandom {
        constructor(seed) {
            this.seed = seed;
        }
        // 回傳 0 ~ 1 之間的浮點數
        next() {
            this.seed = (this.seed * 9301 + 49297) % 233280;
            return this.seed / 233280;
        }
        // 回傳 min ~ max 之間的浮點數
        range(min, max) {
            return min + this.next() * (max - min);
        }
        // 回傳 true/false
        bool(chance = 0.5) {
            return this.next() < chance;
        }
        // 從陣列中隨機挑選
        pick(array) {
            return array[Math.floor(this.next() * array.length)];
        }
    }

    // ===================================================================
    //  Road Flyover Controller (Seamless Rolling Buffer & DFS Backtracking)
    // ===================================================================
    class RoadFlyoverController {
        constructor(network, seed) {
            this.network = network;
            // 假設外部已有定義 PseudoRandom 類別
            this.rng = new PseudoRandom(seed);

            this.visitedLinks = new Set();
            this.historyStack = [];

            // 這是一個連續的點佇列，相機永遠追著這些點跑
            this.pathQueue = [];

            this.speed = 30.0; // 飛行速度

            // 用來平滑視線
            this.tempLookAt = new THREE.Vector3();
            this.currentLookAt = new THREE.Vector3();
            this.isFirstFrame = true;

            // 初始化：隨機選一條路開始
            this.startRandomly();
        }

        startRandomly() {
            const allLinks = Object.values(this.network.links);
            if (allLinks.length === 0) return;

            // 排序以確保固定性
            allLinks.sort((a, b) => a.id.localeCompare(b.id));
            const startLink = this.rng.pick(allLinks);

            this.visitedLinks.add(startLink.id);
            this.historyStack.push({ linkId: startLink.id, reversed: false });

            this.currentDestinationNode = startLink.destination;

            // 建立初始路徑並加入佇列
            const points = this.getPointsFromLink(startLink, false);
            this.appendPoints(points);
        }

        // 核心更新函式 (每幀呼叫)
        update(dt, camera) {
            // 1. 檢查緩衝區是否快用完了？如果剩餘點數少於 10 個，預先加載下一段路
            if (this.pathQueue.length < 10) {
                this.findAndAppendNextRoad();
            }

            if (this.pathQueue.length === 0) return;

            // 第一幀初始化位置與視角
            if (this.isFirstFrame) {
                camera.position.copy(this.pathQueue[0]);
                // 初始化視線目標為前方遠處
                const lookIdx = Math.min(5, this.pathQueue.length - 1);
                this.currentLookAt.copy(this.pathQueue[lookIdx]);
                this.tempLookAt.copy(this.currentLookAt);
                camera.lookAt(this.currentLookAt);
                this.isFirstFrame = false;
                return;
            }

            // 2. 移動邏輯：消耗 distance
            let moveDist = this.speed * dt;
            const currentPos = camera.position;

            while (moveDist > 0 && this.pathQueue.length > 0) {
                const target = this.pathQueue[0];
                const distToTarget = currentPos.distanceTo(target);

                if (distToTarget < moveDist) {
                    // 這一幀可以跨越這個點，繼續前往下一個點
                    moveDist -= distToTarget;
                    currentPos.copy(target); // 物理位置到達該點
                    this.pathQueue.shift();  // 從佇列中移除已通過的點
                } else {
                    // 這一幀只能移動到半途
                    const alpha = moveDist / distToTarget;
                    currentPos.lerp(target, alpha);
                    moveDist = 0; // 移動完畢
                }
            }

            // 3. 視線邏輯 (LookAt)
            // 永遠看向佇列中前方第 N 個點，保證 U-Turn 時視線自然轉向
            const lookAheadCount = 6;
            if (this.pathQueue.length > 0) {
                const lookIdx = Math.min(lookAheadCount, this.pathQueue.length - 1);
                const targetLook = this.pathQueue[lookIdx];

                // 使用 lerp 平滑轉動
                this.tempLookAt.lerp(targetLook, dt * 3.0);

                // 保護機制：避免 LookAt 與 Position 重疊導致相機亂轉
                // [修正] 使用 distanceToSquared 避免錯誤
                if (currentPos.distanceToSquared(this.tempLookAt) > 0.1) {
                    camera.lookAt(this.tempLookAt);
                }
            }
        }

        // 尋找下一條路並追加到佇列
        findAndAppendNextRoad() {
            // 此時我們應該位於 this.currentDestinationNode
            // 尋找從這裡出發的路
            const outgoingLinks = [];
            Object.values(this.network.links).forEach(link => {
                if (link.source === this.currentDestinationNode) outgoingLinks.push(link);
            });

            // 排序
            outgoingLinks.sort((a, b) => a.id.localeCompare(b.id));
            let unvisited = outgoingLinks.filter(l => !this.visitedLinks.has(l.id));

            // 處理循環：若無路可走且已回起點 (堆疊空)，重置記憶但保持位置
            if (unvisited.length === 0 && this.historyStack.length === 0) {
                this.visitedLinks.clear();
                unvisited = outgoingLinks; // 重新開放所有選項
            }

            let nextPoints = [];
            let nextDestNode = null;

            if (unvisited.length > 0) {
                // Case A: 前進 (Forward)
                const nextLink = this.rng.pick(unvisited);
                this.visitedLinks.add(nextLink.id);
                this.historyStack.push({ linkId: nextLink.id, reversed: false });

                nextPoints = this.getPointsFromLink(nextLink, false);
                nextDestNode = nextLink.destination;
            } else {
                // Case B: 折返 (Backtrack)
                const lastStep = this.historyStack.pop();
                if (lastStep) {
                    const prevLink = this.network.links[lastStep.linkId];
                    // 如果上次是正向(false)，這次反向飛(true)
                    const flyReverse = !lastStep.reversed;

                    nextPoints = this.getPointsFromLink(prevLink, flyReverse);
                    nextDestNode = flyReverse ? prevLink.source : prevLink.destination;
                } else {
                    // Case C: 孤立無援 (極罕見)
                    return;
                }
            }

            // 將新點加入佇列
            if (nextPoints.length > 0) {
                this.appendPoints(nextPoints);
                this.currentDestinationNode = nextDestNode;
            }
        }

        // 取得路徑點 (純資料，不修改狀態)
        getPointsFromLink(link, reverse) {
            const lanes = Object.values(link.lanes);
            if (lanes.length === 0) return [];

            // 取中間車道
            const lane = lanes[Math.floor(lanes.length / 2)];
            let pathPoints = lane.path;

            if (reverse) {
                pathPoints = [...pathPoints].reverse();
            }

            const height = 25; // 飛行高度
            return pathPoints.map(p => new THREE.Vector3(p.x, height, p.y));
        }

        // 將新點追加到佇列，並處理接縫
        appendPoints(newPoints) {
            if (newPoints.length === 0) return;

            // [縫合處理]
            // 如果佇列裡已經有點，新路徑的第一個點通常與佇列最後一個點位置重疊
            // 為了避免在同一位置停滯，我們移除新路徑的第一個點
            if (this.pathQueue.length > 0) {
                const lastPoint = this.pathQueue[this.pathQueue.length - 1];
                const firstNew = newPoints[0];

                // 只有在距離極近時才移除 (視為重疊點)
                if (lastPoint.distanceTo(firstNew) < 5.0) {
                    newPoints.shift();
                }
            }

            // 追加到主佇列
            for (const p of newPoints) {
                this.pathQueue.push(p);
            }
        }
    }


    // 2. 城市生成主函式 (包含防重疊碰撞檢測)
    function generateCity(netData, seed) {
        // 清除舊城市
        cityGroup.clear();

        // 初始化隨機生成器
        const rng = new PseudoRandom(seed);

        // 準備幾何體與材質 (InstancedMesh)
        const buildGeo = new THREE.BoxGeometry(1, 1, 1);
        const buildMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const treeGeo = new THREE.ConeGeometry(1, 4, 8);
        const treeMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });

        const buildingsData = [];
        const treesData = [];
        const watersData = [];

        // --- [新增] 空間雜湊 (Spatial Hash) 用於碰撞檢測 ---
        // 將地圖切分成 50x50 的網格，將所有道路線段存入對應網格
        // 用來快速查詢 "這個位置附近有沒有路"
        const gridSize = 50;
        const roadSpatialHash = {};

        function addToHash(x, z, item) {
            const key = `${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`;
            if (!roadSpatialHash[key]) roadSpatialHash[key] = [];
            roadSpatialHash[key].push(item);
        }

        function getFromHash(x, z) {
            const key = `${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`;
            return roadSpatialHash[key] || [];
        }

        // --- 步驟 A: 預處理 - 建立道路禁區 ---

        // 1. 處理路口 (Nodes)
        Object.values(netData.nodes).forEach(node => {
            if (node.polygon && node.polygon.length > 0) {
                // 計算路口中心與概略半徑
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                node.polygon.forEach(p => {
                    // 注意：netData 解析時 y 已經是負值，對應 3D 的 z
                    const px = p.x;
                    const pz = p.y;
                    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
                    minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
                });
                const cx = (minX + maxX) / 2;
                const cz = (minZ + maxZ) / 2;
                // 擴大路口保護半徑 (至少 20m)
                const radius = Math.max(20, Math.hypot(maxX - minX, maxZ - minZ) / 2);

                // 將路口加入九宮格 Hash (因為路口可能跨網格)
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        addToHash(cx + i * gridSize / 2, cz + j * gridSize / 2, { type: 'node', x: cx, z: cz, r: radius });
                    }
                }
            }
        });

        // 2. 處理道路線段 (Links)
        Object.values(netData.links).forEach(link => {
            let totalWidth = 0;
            Object.values(link.lanes).forEach(l => totalWidth += l.width);
            const halfWidth = totalWidth / 2;

            // 使用第一條車道作為參考路徑
            const lanes = Object.values(link.lanes);
            if (lanes.length === 0) return;
            const path = lanes[0].path; // 這是 {x, y} 陣列

            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i];
                const p2 = path[i + 1];
                // 3D 座標映射: path 的 y 對應 3D 的 z
                const seg = {
                    type: 'segment',
                    x1: p1.x, z1: p1.y,
                    x2: p2.x, z2: p2.y,
                    width: halfWidth + 2.0 // 額外加 2米 安全邊界
                };

                // 將線段兩端點加入 Hash
                addToHash(seg.x1, seg.z1, seg);
                addToHash(seg.x2, seg.z2, seg);
                addToHash((seg.x1 + seg.x2) / 2, (seg.z1 + seg.z2) / 2, seg);
            }
        });

        // --- 處理停車場 (新增) ---
        // 為了簡單起見，我們將停車場也視為禁區。
        // 這裡直接使用點在多邊形內的檢測，因為停車場數量通常不多。
        const parkingPolygons = [];
        if (netData.parkingLots) {
            netData.parkingLots.forEach(lot => {
                if (lot.boundary.length >= 3) {
                    parkingPolygons.push(lot.boundary);
                }
            });
        }

        // 輔助函式：點到線段的最短距離平方
        function distToSegmentSquared(px, pz, x1, z1, x2, z2) {
            const l2 = (x1 - x2) ** 2 + (z1 - z2) ** 2;
            if (l2 === 0) return (px - x1) ** 2 + (pz - z1) ** 2;
            let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
            t = Math.max(0, Math.min(1, t));
            return (px - (x1 + t * (x2 - x1))) ** 2 + (pz - (z1 + t * (z2 - z1))) ** 2;
        }

        // 輔助函式：檢查位置是否安全 (不會撞到任何路)
        function isPositionSafe(x, z, radius) {
            // 1. 檢查是否在停車場內 (新增)
            // 由於建築物有半徑，我們簡單檢查中心點是否在多邊形內
            for (const poly of parkingPolygons) {
                if (Geom.Utils.isPointInPolygon({ x: x, y: z }, poly)) {
                    return false; // 在停車場內，不安全
                }
            }

            // 2. 檢查周圍 3x3 的網格
            const cx = Math.floor(x / gridSize);
            const cz = Math.floor(z / gridSize);

            for (let i = -1; i <= 1; i++) {
                for (let j = -1; j <= 1; j++) {
                    const key = `${cx + i},${cz + j}`;
                    const items = roadSpatialHash[key];
                    if (!items) continue;

                    for (const item of items) {
                        if (item.type === 'node') {
                            const dist = Math.hypot(x - item.x, z - item.z);
                            if (dist < (item.r + radius)) return false;
                        } else if (item.type === 'segment') {
                            const distSq = distToSegmentSquared(x, z, item.x1, item.z1, item.x2, item.z2);
                            const safeDist = item.width + radius;
                            if (distSq < safeDist * safeDist) return false;
                        }
                    }
                }
            }
            return true;
        }

        // --- 步驟 B: 沿著道路生成物件 ---
        Object.values(netData.links).forEach(link => {
            let roadWidth = 0;
            Object.values(link.lanes).forEach(l => roadWidth += l.width);

            // 基礎偏移：半路寬 + 3米人行道
            const baseOffset = (roadWidth / 2) + 3.0;

            if (!link.geometry) return;
            const lanes = Object.values(link.lanes);
            if (lanes.length === 0) return;
            const path = lanes[0].path;

            const stepSize = 10; // 間距

            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i];
                const p2 = path[i + 1];
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const steps = Math.floor(dist / stepSize);

                const dx = (p2.x - p1.x) / dist;
                const dy = (p2.y - p1.y) / dist;

                // 法向量
                const nx = -dy;
                const ny = dx;

                for (let j = 1; j <= steps; j++) {
                    // 加入一點隨機抖動，讓建築不那麼死板
                    const jitter = rng.range(-2, 2);
                    const t = ((j * stepSize) + jitter) / dist;
                    if (t < 0 || t > 1) continue;

                    const cx = p1.x + (p2.x - p1.x) * t;
                    const cy = p1.y + (p2.y - p1.y) * t;

                    [-1, 1].forEach(side => {
                        const lotTypeRate = rng.next();

                        // 嘗試放置點：退縮距離 (隨機 2~8 米)
                        const setback = rng.range(2, 8);
                        const totalOffset = baseOffset + setback;

                        const placeX = cx + nx * totalOffset * side;
                        const placeZ = cy + ny * totalOffset * side;

                        // 決定建築物大小 (半徑用於碰撞檢測)
                        // ▼▼▼ 修改這裡 ▼▼▼
                        // 原本是 rng.range(6, 10)，改小一點讓它們更容易擠進去
                        const w = rng.range(5, 8);
                        const d = rng.range(5, 8);
                        const radius = Math.max(w, d) / 1.5; // 估算半徑

                        // [關鍵] 嚴格檢查：這裡會不會撞到別條路？
                        if (!isPositionSafe(placeX, placeZ, radius)) {
                            return; // 撞到了，放棄這個點
                        }

                        const angle = Math.atan2(dy, dx);

                        if (lotTypeRate < 0.6) {
                            // --- 建築 ---
                            const h = rng.range(6, 20);
                            const finalH = (rng.bool(0.05)) ? rng.range(25, 50) : h;
                            const colors = [0xeeeeee, 0xf0f0f0, 0xdcdcdc, 0xfffff0, 0xcceeff, 0xe6e6fa];

                            buildingsData.push({
                                x: placeX, z: placeZ, y: finalH / 2,
                                sx: w, sy: finalH, sz: d,
                                ry: -angle,
                                color: rng.pick(colors)
                            });
                        } else if (lotTypeRate < 0.85) {
                            // --- 樹木 ---
                            // 樹木比較小，檢查半徑小一點
                            if (isPositionSafe(placeX, placeZ, 2.0)) {
                                const numTrees = Math.floor(rng.range(2, 5));
                                for (let k = 0; k < numTrees; k++) {
                                    const tx = placeX + rng.range(-4, 4);
                                    const tz = placeZ + rng.range(-4, 4);
                                    if (isPositionSafe(tx, tz, 1.0)) {
                                        const scale = rng.range(0.8, 1.4);
                                        treesData.push({
                                            x: tx, z: tz, y: 2 * scale,
                                            sx: scale, sy: scale, sz: scale
                                        });
                                    }
                                }
                            }
                        } else if (lotTypeRate < 0.90) {
                            // --- 水池 ---
                            const r = rng.range(6, 12);
                            if (isPositionSafe(placeX, placeZ, r + 2)) {
                                watersData.push({ x: placeX, z: placeZ, r: r });
                            }
                        }
                    });
                }
            }
        });

        // --- 步驟 C: 建立 InstancedMesh (不變) ---
        if (buildingsData.length > 0) {
            const iMesh = new THREE.InstancedMesh(buildGeo, buildMat, buildingsData.length);
            iMesh.castShadow = true;
            iMesh.receiveShadow = true;
            const dummy = new THREE.Object3D();
            const color = new THREE.Color();
            buildingsData.forEach((data, i) => {
                dummy.position.set(data.x, data.y, data.z);
                dummy.rotation.y = data.ry;
                dummy.scale.set(data.sx, data.sy, data.sz);
                dummy.updateMatrix();
                iMesh.setMatrixAt(i, dummy.matrix);
                color.setHex(data.color);
                iMesh.setColorAt(i, color);
            });
            iMesh.instanceMatrix.needsUpdate = true;
            if (iMesh.instanceColor) iMesh.instanceColor.needsUpdate = true;
            cityGroup.add(iMesh);
        }

        if (treesData.length > 0) {
            const iTree = new THREE.InstancedMesh(treeGeo, treeMat, treesData.length);
            iTree.castShadow = true;
            const dummy = new THREE.Object3D();
            treesData.forEach((data, i) => {
                dummy.position.set(data.x, data.y, data.z);
                dummy.scale.set(data.sx * 2, data.sy * 2, data.sz * 2);
                dummy.updateMatrix();
                iTree.setMatrixAt(i, dummy.matrix);
            });
            iTree.instanceMatrix.needsUpdate = true;
            cityGroup.add(iTree);
        }

        const waterGeo = new THREE.CircleGeometry(1, 16);
        const waterMat = new THREE.MeshLambertMaterial({ color: 0x4fa4bc });
        watersData.forEach(data => {
            const water = new THREE.Mesh(waterGeo, waterMat);
            water.rotation.x = -Math.PI / 2;
            water.position.set(data.x, 0.15, data.z);
            water.scale.set(data.r, data.r, 1);
            cityGroup.add(water);
        });

        if (renderer) renderer.render(scene, camera);
    }

    // ===================================================================
    // Main File Handling & Simulation Loop
    // ===================================================================
    function handleFileSelect(event) {
        stopSimulation();
        const file = event.target.files[0];
        if (!file) return;

        resetStatistics();
        placeholderText.style.display = 'none';

        const reader = new FileReader();
        reader.onload = (e) => {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            if (xmlDoc.getElementsByTagName("parsererror").length) {
                alert(translations[currentLang].alertParseError);
                return;
            }

            parseTrafficModel(xmlDoc).then(netData => {
                networkData = netData;
                simulation = new Simulation(networkData);

                autoCenter2D(networkData.bounds);
                networkCenter2D = {
                    x: (networkData.bounds.minX + networkData.bounds.maxX) / 2,
                    y: (networkData.bounds.minY + networkData.bounds.maxY) / 2
                };
                initialViewRotation2D = 0;
                viewRotation2D = initialViewRotation2D;
                buildNetwork3D(networkData);
                // [新增] 建立底圖
                buildBasemap3D(networkData);
                autoCenterCamera3D(networkData.bounds);

                // [新增] 生成城市
                const seed = parseInt(citySeedInput.value, 10) || 12345;
                generateCity(networkData, seed);

                setupMeterCharts(networkData.speedMeters);
                setupSectionMeterCharts(networkData.sectionMeters);

                startStopButton.disabled = false;
                simTimeSpan.textContent = "0.00";
                updateButtonText();

                if (isDisplay2D) redraw2D();
                if (isDisplay3D) update3DScene();

                // Show Pegman if in 2D mode
                const pegman = document.getElementById('pegman-icon');
                if (pegman) pegman.style.display = (isDisplay2D && !isDisplay3D) ? 'block' : 'none';

                updateStatistics(0);
                lastLoggedIntegerTime = 0;

            }).catch(error => {
                console.error("Error parsing model:", error);
                alert(translations[currentLang].alertLoadError);
            });
        };
        reader.readAsText(file);
    }

    function toggleSimulation() {
        if (!simulation) return;
        isRunning = !isRunning;
        if (isRunning) {
            lastTimestamp = performance.now();
            if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(simulationLoop);
            }
        }
        updateButtonText();
    }

    function stopSimulation() {
        isRunning = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        simulation = null;
        networkData = null;

        if (isChaseActive) stopChaseMode();

        if (isFlyoverActive && flyoverToggle) {
            flyoverToggle.checked = false;
            setFlyoverMode(false);
        }

        if (isDroneActive && droneToggle) {
            droneToggle.checked = false;
            setDroneMode(false);
        }

        vehicleMeshes.forEach(mesh => scene.remove(mesh));
        vehicleMeshes.clear();
        networkGroup.clear();
        debugGroup.clear();
        signalPathsGroup.clear();
        trafficLightsGroup.clear(); // Clear poles

        // [新增] 清空城市
        cityGroup.clear();

        basemapGroup.clear();

        renderer.render(scene, camera);

        ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);

        placeholderText.style.display = 'block';

        // Hide Pegman
        const pegman = document.getElementById('pegman-icon');
        if (pegman) pegman.style.display = 'none';

        updateButtonText();
    }

    function simulationLoop(timestamp) {
        animationFrameId = requestAnimationFrame(simulationLoop);

        const frameDt = Math.min((timestamp - lastTimestamp) / 1000.0, 0.05);

        if (isDisplay3D) {
            // [新增] 如果開啟巡航，執行飛行邏輯
            if (isFlyoverActive) {
                updateFlyoverCamera();
            } else if (isDroneActive) {
                updateDroneCamera(frameDt);
            } else {
                // 只有在非巡航模式下才更新控制器 (允許手動操作)
                controls.update();
            }
        }

        if (isRunning && simulation) {
            const realDt = (timestamp - lastTimestamp) / 1000.0;
            const simulationDt = Math.min(realDt, 0.1) * simulationSpeed;

            simulation.update(simulationDt);
            simTimeSpan.textContent = simulation.time.toFixed(2);

            const currentIntegerTime = Math.floor(simulation.time);
            if (currentIntegerTime > lastLoggedIntegerTime) {
                updateStatistics(currentIntegerTime);
                lastLoggedIntegerTime = currentIntegerTime;
            }
        }

        lastTimestamp = timestamp;

        if (isDisplay2D && isDisplay3D && isRotationSyncEnabled) {
            if (!has3DHeadingChangedSinceSplit) {
                const az = get3DAzimuth();
                const d = Math.abs(angleDeltaRad(az, splitStartAzimuth));
                if (d > 0.02) {
                    has3DHeadingChangedSinceSplit = true;
                }
            }
            sync2DRotationFrom3D();
        }

        if (isDisplay2D) {
            if (isRunning || (isDisplay3D && isRotationSyncEnabled)) redraw2D();
        }
        if (isDisplay3D) {
            update3DScene();
        }

        if (!isRunning && !isDisplay3D) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
            return;
        }
    }

    // ===================================================================
    // Simulation Classes & Logic (Unchanged)
    // ===================================================================
    const Geom = {
        Vec: { add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }), sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }), scale: (v, s) => ({ x: v.x * s, y: v.y * s }), dist: (v1, v2) => Math.hypot(v1.x - v2.x, v1.y - v2.y), len: (v) => Math.hypot(v.x, v.y), normalize: (v) => { const l = Geom.Vec.len(v); return l > 0 ? Geom.Vec.scale(v, 1 / l) : { x: 0, y: 0 }; }, normal: (v) => ({ x: -v.y, y: v.x }), angle: (v) => Math.atan2(v.y, v.x), },
        Bezier: { getPoint(t, p0, p1, p2, p3) { const cX = 3 * (p1.x - p0.x); const bX = 3 * (p2.x - p1.x) - cX; const aX = p3.x - p0.x - cX - bX; const cY = 3 * (p1.y - p0.y); const bY = 3 * (p2.y - p1.y) - cY; const aY = p3.y - p0.y - cY - bY; const x = aX * t ** 3 + bX * t ** 2 + cX * t + p0.x; const y = aY * t ** 3 + bY * t ** 2 + cY * t + p0.y; return { x, y }; }, getTangent(t, p0, p1, p2, p3) { const q0 = Geom.Vec.sub(p1, p0); const q1 = Geom.Vec.sub(p2, p1); const q2 = Geom.Vec.sub(p3, p2); const a = Geom.Vec.scale(q0, 3 * (1 - t) ** 2); const b = Geom.Vec.scale(q1, 6 * (1 - t) * t); const c = Geom.Vec.scale(q2, 3 * t ** 2); return Geom.Vec.add(a, Geom.Vec.add(b, c)); }, getLength(p0, p1, p2, p3, steps = 20) { let length = 0; let lastPoint = p0; for (let i = 1; i <= steps; i++) { const t = i / steps; const point = this.getPoint(t, p0, p1, p2, p3); length += Geom.Vec.dist(lastPoint, point); lastPoint = point; } return length; } },
        Utils: {
            // 計算點 p 到線段 v-w 的最近點
            getClosestPointOnSegment: function (p, v, w) {
                const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
                if (l2 === 0) return v;
                let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return {
                    x: v.x + t * (w.x - v.x),
                    y: v.y + t * (w.y - v.y)
                };
            },
            // 判斷點是否在多邊形內
            isPointInPolygon: function (point, vs) {
                let x = point.x, y = point.y;
                let inside = false;
                for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
                    let xi = vs[i].x, yi = vs[i].y;
                    let xj = vs[j].x, yj = vs[j].y;
                    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                return inside;
            }
        }
    };

    class Simulation {
        constructor(network) {
            this.network = network;
            this.time = 0;
            this.vehicles = [];
            this.vehicleIdCounter = 0;
            if (network.staticVehicles) {
                for (const staticVehicleConfig of network.staticVehicles) {
                    const { profile, initialState, startLinkId, startLaneIndex, destinationNodeId } = staticVehicleConfig;
                    const startLink = network.links[startLinkId];
                    if (!startLink) continue;
                    const nextNodeId = startLink.destination;
                    const remainingPath = network.pathfinder.findRoute(nextNodeId, destinationNodeId);
                    const route = remainingPath ? [startLinkId, ...remainingPath] : [startLinkId];
                    const vehicle = new Vehicle(`v-static-${this.vehicleIdCounter++}`, profile, route, network, startLaneIndex, initialState);
                    this.vehicles.push(vehicle);
                }
            }
            this.spawners = network.spawners.map(s => new Spawner(s, network.pathfinder));
            this.trafficLights = network.trafficLights;
            this.speedMeters = network.speedMeters.map(m => ({ ...m, readings: {}, maxAvgSpeed: 0 }));
            this.sectionMeters = network.sectionMeters.map(m => ({ ...m, completedVehicles: [], maxAvgSpeed: 0, lastAvgSpeed: null }));
        }
        update(dt) {
            if (dt <= 0) return;
            this.time += dt;
            this.trafficLights.forEach(tfl => tfl.update(this.time));
            this.spawners.forEach(spawner => {
                const newVehicle = spawner.update(dt, this.network, `v-spawned-${this.vehicleIdCounter}`);
                if (newVehicle) { this.vehicles.push(newVehicle); this.vehicleIdCounter++; }
            });
            this.vehicles.forEach(vehicle => vehicle.update(dt, this.vehicles, this));
            this.vehicles = this.vehicles.filter(v => !v.finished);
        }
    }

    class Pathfinder { constructor(links, nodes) { this.adj = new Map(); for (const linkId in links) { const link = links[linkId]; if (!this.adj.has(link.source)) this.adj.set(link.source, []); this.adj.get(link.source).push({ linkId: link.id, toNode: link.destination }); } } findRoute(startNodeId, endNodeId) { if (!startNodeId || !endNodeId) return null; const q = [[startNodeId, []]]; const visited = new Set([startNodeId]); while (q.length > 0) { const [currentNodeId, path] = q.shift(); if (currentNodeId === endNodeId) return path; const neighbors = this.adj.get(currentNodeId) || []; for (const neighbor of neighbors) { if (!visited.has(neighbor.toNode)) { visited.add(neighbor.toNode); const newPath = [...path, neighbor.linkId]; q.push([neighbor.toNode, newPath]); } } } return null; } }
    class TrafficLightController { constructor(config) { this.nodeId = config.nodeId; this.schedule = config.schedule; this.lights = config.lights; this.timeShift = config.timeShift || 0; this.cycleDuration = this.schedule.reduce((sum, p) => sum + p.duration, 0); this.turnGroupStates = {}; } update(time) { if (this.cycleDuration <= 0) return; const effectiveTime = time - this.timeShift; let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration; for (const period of this.schedule) { if (timeInCycle < period.duration) { for (const [turnGroupId, signal] of Object.entries(period.signals)) { this.turnGroupStates[turnGroupId] = signal; } return; } timeInCycle -= period.duration; } } getSignalForTurnGroup(turnGroupId) { return this.turnGroupStates[turnGroupId] || 'Green'; } }
    class Spawner {
        constructor(config, pathfinder) { this.originNodeId = config.originNodeId; this.periods = config.periods || []; this.pathfinder = pathfinder; this.currentPeriodIndex = -1; this.timeInPeriod = 0; this.active = false; this.spawnInterval = Infinity; this.spawnTimer = 0; this.currentConfig = null; this._switchToNextPeriod(); }
        _switchToNextPeriod() { this.currentPeriodIndex++; if (this.currentPeriodIndex >= this.periods.length) { this.active = false; this.currentConfig = null; return; } this.active = true; this.timeInPeriod = 0; this.currentConfig = this.periods[this.currentPeriodIndex]; this.spawnInterval = this.currentConfig.numVehicles > 0 ? this.currentConfig.duration / this.currentConfig.numVehicles : Infinity; this.spawnTimer = this.spawnInterval; }
        update(dt, network, vehicleId) {
            if (!this.active) return null;
            this.timeInPeriod += dt;
            if (this.timeInPeriod > this.currentConfig.duration) {
                this._switchToNextPeriod();
                if (!this.active) return null;
                return null;
            }
            this.spawnTimer += dt;
            if (this.spawnTimer >= this.spawnInterval) {
                this.spawnTimer -= this.spawnInterval;
                const destination = this.chooseWithWeight(this.currentConfig.destinations);
                const profile = this.chooseWithWeight(this.currentConfig.vehicleProfiles);
                if (!destination || !profile) return null;
                const route = this.pathfinder.findRoute(this.originNodeId, destination.destinationNodeId);
                if (!route || route.length === 0) return null;

                const startLinkId = route[0];
                const startLink = network.links[startLinkId];
                let startLaneIndex = 0;
                if (startLink) {
                    const numLanes = Object.keys(startLink.lanes).length;
                    if (numLanes > 0) {
                        startLaneIndex = Math.floor(Math.random() * numLanes);
                    }
                }

                // --- [修改] 處理停車任務 ---
                let assignedStop = null;
                if (this.currentConfig.stops && this.currentConfig.stops.length > 0) {
                    // 簡單處理：遍歷所有可能的停靠點，依機率決定是否停靠
                    for (const stop of this.currentConfig.stops) {
                        if (Math.random() * 100 < stop.probability) {
                            assignedStop = { ...stop }; // 複製任務
                            break; // 暫時只支援停一個
                        }
                    }
                }

                const v = new Vehicle(vehicleId, profile, route, network, startLaneIndex);
                if (assignedStop) {
                    v.assignParkingTask(assignedStop, network);
                }
                return v;
                // ---------------------------
            }
            return null;
        }
        chooseWithWeight(items) { if (!items || items.length === 0) return null; const totalWeight = items.reduce((sum, item) => sum + item.weight, 0); if (totalWeight <= 0) return items[0]; let random = Math.random() * totalWeight; for (const item of items) { random -= item.weight; if (random <= 0) return item; } return items[items.length - 1]; }
    }
    class Vehicle {
        constructor(id, profile, route, network, startLaneIndex = 0, initialState = null) {
            this.id = id;
            this.length = profile.length;
            this.width = profile.width;
            this.originalMaxSpeed = profile.params.maxSpeed;
            this.maxSpeed = profile.params.maxSpeed;
            this.maxAccel = profile.params.maxAcceleration;
            this.comfortDecel = profile.params.comfortDeceleration;
            this.minGap = profile.params.minDistance;
            this.headwayTime = profile.params.desiredHeadwayTime;
            this.delta = 4;
            this.accel = 0;
            this.route = route;
            this.currentLinkIndex = 0;
            this.currentLinkId = route[0];
            this.currentLaneIndex = startLaneIndex;
            this.x = 0; this.y = 0; this.angle = 0;
            this.finished = false;
            this.state = 'onLink';
            this.currentPath = null;
            this.currentPathLength = 0;
            this.currentTransition = null;
            this.nextSignIndex = 0;
            this.speed = initialState ? initialState.speed : 0;
            this.distanceOnPath = initialState ? initialState.distanceOnPath : 0;
            this.sectionEntryData = {};
            this.laneChangeState = null;
            this.laneChangeGoal = null;
            this.laneChangeCooldown = 0;
            this.lastBlockInfo = null;
            this._debugBlockLogCooldown = 0;

            // --- [新增] 停車相關狀態 ---
            this.parkingTask = null; // { lotId, duration, gate, connector }
            this.parkingState = 'none'; // 'none', 'approaching', 'entering', 'parked', 'exiting'
            this.parkingTimer = 0;
            this.parkingStartSimTime = null;
            this.parkingAnimTime = 0;
            this.parkingOriginPos = { x: 0, y: 0, angle: 0 }; // 進場動畫起點
            this.parkingTargetPos = { x: 0, y: 0, angle: 0 }; // 停車格位置
            // -------------------------

            this.initializePosition(network);
        }

        assignParkingTask(stopConfig, network) {
            // 尋找對應的停車場
            const lot = network.parkingLots.find(p => p.id === stopConfig.parkingLotId);
            if (!lot || !lot.gates || lot.gates.length === 0) return;

            // 尋找所有合法的入口 (Entry 或 Bidirectional) 且連接到路網
            const validGates = [];
            for (const gate of lot.gates) {
                if (gate.connector &&
                    this.route.includes(gate.connector.linkId) &&
                    (gate.type === 'entry' || gate.type === 'bidirectional')) {
                    validGates.push(gate);
                }
            }

            // 若有合適的入口，隨機選擇一個
            if (validGates.length > 0) {
                const chosenGate = validGates[Math.floor(Math.random() * validGates.length)];

                const duration = Number(stopConfig.duration);
                if (!Number.isFinite(duration) || duration < 0) return;

                // [修改重點]：傳入入口座標 (chosenGate.x, chosenGate.y) 以便尋找最近車位
                const slotData = this.getEmptySlotInLot(lot, chosenGate.x, chosenGate.y);

                this.parkingTask = {
                    lotId: lot.id,
                    duration,
                    gate: chosenGate,             // 指定選中的入口
                    connector: chosenGate.connector,
                    targetSpot: slotData,
                    occupiedSlot: slotData.slot
                };
            }
        }

        // 3. [修改] 取得停車場內空位 (使用預計算的格位)
        // [修改重點]：新增 entryX, entryY 參數
        getEmptySlotInLot(lot, entryX, entryY) {
            // 若有預計算的格位陣列
            if (lot.slots && lot.slots.length > 0) {
                // 1. 篩選出所有未被佔用的空位
                const freeSlots = lot.slots.filter(s => !s.occupied);

                if (freeSlots.length > 0) {
                    let bestSlot = null;

                    // 2. 如果有提供入口座標，則尋找距離最近的空位
                    if (typeof entryX === 'number' && typeof entryY === 'number') {
                        let minDistSq = Infinity;
                        for (const slot of freeSlots) {
                            // 計算距離平方 (比開根號快)
                            const dx = slot.x - entryX;
                            const dy = slot.y - entryY;
                            const distSq = dx * dx + dy * dy;

                            if (distSq < minDistSq) {
                                minDistSq = distSq;
                                bestSlot = slot;
                            }
                        }
                    } else {
                        // 如果沒座標 (Fallback)，就拿第一個
                        bestSlot = freeSlots[0];
                    }

                    // 3. 佔用該車位並回傳
                    if (bestSlot) {
                        bestSlot.occupied = true;
                        bestSlot.vehicleId = this.id;
                        return { x: bestSlot.x, y: bestSlot.y, angle: bestSlot.angle, slot: bestSlot };
                    }
                }
            }

            // 回退邏輯 (如果沒有格位資料，隨機停在停車場範圍內)
            const gate = (lot.gates && lot.gates[0]) ? lot.gates[0] : { x: 0, y: 0, rotation: 0 };
            if (lot.boundary.length > 0) {
                let sx = 0, sy = 0;
                lot.boundary.forEach(p => { sx += p.x; sy += p.y; });
                const cx = sx / lot.boundary.length;
                const cy = sy / lot.boundary.length;
                return { x: cx + (Math.random() - 0.5) * 5, y: cy + (Math.random() - 0.5) * 5, angle: Math.random() * 6.28, slot: null };
            }
            return { x: gate.x, y: gate.y, angle: 0, slot: null };
        }
        initializePosition(network) { const link = network.links[this.currentLinkId]; if (!link) { this.finished = true; return; } this.nextSignIndex = 0; const lane = link.lanes[this.currentLaneIndex]; if (!lane || lane.path.length === 0) { this.finished = true; return; } this.currentPath = lane.path; this.currentPathLength = lane.length; this.updateDrawingPosition(network); }
        checkRoadSigns(network) { const link = network.links[this.currentLinkId]; if (!link.roadSigns || this.nextSignIndex >= link.roadSigns.length) { return; } while (this.nextSignIndex < link.roadSigns.length && this.distanceOnPath >= link.roadSigns[this.nextSignIndex].position) { const sign = link.roadSigns[this.nextSignIndex]; if (sign.type === 'limit') { this.maxSpeed = sign.limit; } else if (sign.type === 'no_limit') { this.maxSpeed = this.originalMaxSpeed; } this.nextSignIndex++; } }
        update(dt, allVehicles, simulation) {
            if (this.finished) return;
            const network = simulation.network;

            // --- [修正] 停車狀態機邏輯 ---
            if (this.parkingTask) {
                // 1. 準備進場
                if (this.state === 'onLink' && this.parkingState === 'none') {
                    if (this.currentLinkId === this.parkingTask.connector.linkId) {
                        const distToGate = this.parkingTask.connector.distance;
                        // 距離 5 米內觸發
                        if (Math.abs(this.distanceOnPath - distToGate) < 5.0) {
                            this.parkingState = 'entering';
                            this.state = 'parking_maneuver'; // 脫離道路物理
                            this.parkingAnimTime = 0;
                            this.speed = 10 / 3.6; // 視覺減速
                            this.parkingOriginPos = { x: this.x, y: this.y, angle: this.angle };
                            return; // [重要] 立即返回，防止執行後續道路物理運算
                        }
                    }
                }
                // 2. 進場動畫中
                else if (this.parkingState === 'entering') {
                    this.handleParkingEntry(dt, simulation);
                    return; // 暫停物理更新
                }
                // 3. 已停妥 (計時中)
                else if (this.parkingState === 'parked') {
                    // 初始化計時器
                    if (this.parkingStartSimTime === null) {
                        this.parkingStartSimTime = simulation.time;
                        // ... debug log ...
                    }

                    // 檢查停留時間
                    const elapsed = simulation.time - this.parkingStartSimTime;
                    if (elapsed < this.parkingTask.duration) {
                        return; // 時間未到
                    }

                    // --- [修改重點] 時間到，準備離場，隨機選擇出口 ---
                    this.parkingState = 'exiting';
                    this.parkingAnimTime = 0;
                    this.parkingStartSimTime = null;

                    // 設定離場動畫起點 (目前的停車格)
                    this.parkingOriginPos = { x: this.x, y: this.y, angle: this.angle };

                    // 1. 獲取停車場物件
                    const lot = network.parkingLots.find(p => p.id === this.parkingTask.lotId);
                    let exitGate = this.parkingTask.gate; // 預設使用原本的入口(fallback)

                    if (lot && lot.gates) {
                        // 2. 篩選所有合法的出口 (Exit 或 Bidirectional)
                        const validExitGates = lot.gates.filter(g =>
                            g.connector &&
                            (g.type === 'exit' || g.type === 'bidirectional')
                        );

                        // 3. 隨機選擇一個出口
                        if (validExitGates.length > 0) {
                            exitGate = validExitGates[Math.floor(Math.random() * validExitGates.length)];
                        }
                    }

                    // 4. 更新任務中的 Gate 與 Connector 資訊，讓離場動畫走向新出口
                    this.parkingTask.gate = exitGate;
                    this.parkingTask.connector = exitGate.connector;

                    // 5. 設定離場動畫終點 (出口連接道路的座標)
                    const gate = this.parkingTask.gate;
                    this.parkingTargetPos = { x: gate.connector.x2, y: gate.connector.y2, angle: gate.rotation };

                    // 6. [重要] 更新車輛的道路邏輯狀態
                    // 因為出口可能連接著不同的 Link，或者在同一 Link 的不同位置
                    // 我們需要更新 currentLinkId, currentLinkIndex 以及 distanceOnPath
                    // 這樣當車輛回到 'onLink' 狀態時，才不會瞬間跳回入口處

                    // 檢查出口是否在原本的路線上
                    const newLinkId = gate.connector.linkId;
                    const newRouteIndex = this.route.indexOf(newLinkId);

                    if (newRouteIndex !== -1) {
                        this.currentLinkId = newLinkId;
                        this.currentLinkIndex = newRouteIndex;
                        // 注意：distanceOnPath 會在 handleParkingExit 動畫結束時被更新為 connector.distance
                    } else {
                        // 如果隨機選到的出口連到了不在原本導航路徑上的路 (極端情況)
                        // 這裡可以選擇強制修正 route 或者保持原樣 (這取決於路網設計)
                        // 簡單起見，我們假設所有出口都連回合法路徑，或者僅更新 Link ID
                        this.currentLinkId = newLinkId;
                    }

                    return;
                }
                // 4. 離場動畫中
                else if (this.parkingState === 'exiting') {
                    this.handleParkingExit(dt, simulation);
                    // 如果動畫結束，handleParkingExit 會將狀態設回 'none'
                    if (this.parkingState === 'none') {
                        // 回歸道路邏輯
                        this.state = 'onLink';
                        this.speed = 0; // 重新起步
                        this.parkingTask = null; // 任務結束
                        // 讓它繼續往下執行物理邏輯以更新位置
                    } else {
                        return;
                    }
                }
            }
            // -------------------------------

            const oldDistanceOnPath = this.distanceOnPath;
            if (this._debugBlockLogCooldown > 0) this._debugBlockLogCooldown -= dt;
            if (this.laneChangeCooldown > 0) { this.laneChangeCooldown -= dt; }
            if (this.state === 'onLink') { this.manageLaneChangeProcess(dt, network, allVehicles); }
            if (this.state === 'onLink') { this.checkRoadSigns(network); }
            const { leader, gap } = this.findLeader(allVehicles, network);
            if (typeof window !== 'undefined' && window.DEBUG_BLOCKING && this._debugBlockLogCooldown <= 0) {
                const distanceToEnd = this.currentPathLength - this.distanceOnPath;
                if (this.state === 'onLink' && this.speed <= 0.2 && distanceToEnd >= 0 && distanceToEnd <= 8 && this.lastBlockInfo?.blocked) {
                    this._debugBlockLogCooldown = 1.0;
                    console.log('[blocked]', { time: simulation.time, vehicleId: this.id, linkId: this.currentLinkId, laneIndex: this.currentLaneIndex, speed: this.speed, distanceToEnd, ...this.lastBlockInfo });
                }
            }
            const s_star = this.minGap + Math.max(0, this.speed * this.headwayTime + (this.speed * (this.speed - (leader ? leader.speed : 0))) / (2 * Math.sqrt(this.maxAccel * this.comfortDecel)));
            this.accel = this.maxAccel * (1 - Math.pow(this.speed / this.maxSpeed, this.delta) - Math.pow(s_star / gap, 2));
            this.speed += this.accel * dt;
            if (this.speed < 0) this.speed = 0;
            const isStuckAtEnd = gap <= 0.1 && (this.currentPathLength - this.distanceOnPath) <= 0.1;
            if (isStuckAtEnd) { this.distanceOnPath = this.currentPathLength; this.speed = 0; } else { this.distanceOnPath += this.speed * dt; }
            if (this.state === 'onLink') {
                const metersOnLink = simulation.speedMeters.filter(m => m.linkId === this.currentLinkId);
                metersOnLink.forEach(meter => { if (oldDistanceOnPath < meter.position && this.distanceOnPath >= meter.position) { if (!meter.readings['all']) { meter.readings['all'] = []; } const laneIdx = this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex; if (!meter.readings[laneIdx]) { meter.readings[laneIdx] = []; } meter.readings['all'].push(this.speed); meter.readings[laneIdx].push(this.speed); } });
                const sectionMetersOnLink = simulation.sectionMeters.filter(m => m.linkId === this.currentLinkId);
                sectionMetersOnLink.forEach(meter => { if (!this.sectionEntryData[meter.id] && oldDistanceOnPath < meter.startPosition && this.distanceOnPath >= meter.startPosition) { this.sectionEntryData[meter.id] = { entryTime: simulation.time }; } else if (this.sectionEntryData[meter.id] && oldDistanceOnPath < meter.endPosition && this.distanceOnPath >= meter.endPosition) { const entryTime = this.sectionEntryData[meter.id].entryTime; const travelTime = simulation.time - entryTime; if (travelTime > 0) { const avgSpeedMs = meter.length / travelTime; const avgSpeedKmh = avgSpeedMs * 3.6; meter.completedVehicles.push({ time: simulation.time, speed: avgSpeedKmh }); } delete this.sectionEntryData[meter.id]; } });
            }
            if (this.distanceOnPath > this.currentPathLength) { const leftoverDistance = this.distanceOnPath - this.currentPathLength; this.handlePathTransition(leftoverDistance, network); }
            if (!this.finished) this.updateDrawingPosition(network);
        }

        // 修正 handleParkingEntry 確保時間初始化正確
        handleParkingEntry(dt, simulation) {
            const ANIM_DURATION = 4.0; // 進場動畫耗時
            this.parkingAnimTime += dt;
            const t = Math.min(1, this.parkingAnimTime / ANIM_DURATION);

            // [修正] 使用三次貝茲曲線 (Cubic Bezier)
            // P0: 車輛起始位置
            // P1: 道路上的連接點 (Connector Point) -> 確保車輛先轉入通道口
            // P2: 大門位置 (Gate) -> 沿著通道行駛
            // P3: 停車格位 (Target Spot)

            const p0 = this.parkingOriginPos;
            // 透過 Connector 座標確保車輛看起來是「轉進去」的
            const p1 = { x: this.parkingTask.connector.x2, y: this.parkingTask.connector.y2 };
            const p2 = { x: this.parkingTask.gate.x, y: this.parkingTask.gate.y };
            const p3 = this.parkingTask.targetSpot;

            // 三次貝茲公式
            const invT = 1 - t;
            const invT2 = invT * invT;
            const invT3 = invT2 * invT;
            const t2 = t * t;
            const t3 = t2 * t;

            this.x = invT3 * p0.x + 3 * invT2 * t * p1.x + 3 * invT * t2 * p2.x + t3 * p3.x;
            this.y = invT3 * p0.y + 3 * invT2 * t * p1.y + 3 * invT * t2 * p2.y + t3 * p3.y;

            // 角度計算 (計算切線方向)
            // 為了平滑，我們取稍微前面一點的時間點來計算差值
            const nextT = Math.min(1, t + 0.01);
            const nInvT = 1 - nextT;
            const nInvT2 = nInvT * nInvT;
            const nInvT3 = nInvT2 * nInvT;
            const nt2 = nextT * nextT;
            const nt3 = nt2 * nextT;

            const nx = nInvT3 * p0.x + 3 * nInvT2 * nextT * p1.x + 3 * nInvT * nt2 * p2.x + nt3 * p3.x;
            const ny = nInvT3 * p0.y + 3 * nInvT2 * nextT * p1.y + 3 * nInvT * nt2 * p2.y + nt3 * p3.y;

            const pathAngle = Math.atan2(ny - this.y, nx - this.x);

            // 平滑轉動角度
            const normalizeAngleDiff = (diff) => {
                while (diff <= -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                return diff;
            };
            const smoothstep = (edge0, edge1, x) => {
                const u = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
                return u * u * (3 - 2 * u);
            };

            const targetAngle = (p3 && typeof p3.angle === 'number') ? p3.angle : pathAngle;
            // 最後 20% 的時間慢慢對齊停車格角度
            const w = smoothstep(0.8, 1.0, t);
            this.angle = pathAngle + normalizeAngleDiff(targetAngle - pathAngle) * w;

            // 動畫結束，切換狀態
            if (t >= 1) {
                this.parkingState = 'parked';
                this.parkingAnimTime = 0;
                if (p3 && typeof p3.angle === 'number') this.angle = p3.angle;
                this.parkingStartSimTime = null;
            }
        }

        handleParkingExit(dt, simulation) {
            const ANIM_DURATION = 4.0;
            this.parkingAnimTime += dt;
            const t = Math.min(1, this.parkingAnimTime / ANIM_DURATION);

            // 起點: parkingOriginPos (也就是之前的 targetSpot)
            const p0 = this.parkingOriginPos;
            const p1 = { x: this.parkingTask.gate.x, y: this.parkingTask.gate.y };
            const conn = this.parkingTask.connector;
            const p2 = { x: conn.x2, y: conn.y2 };

            const invT = 1 - t;
            this.x = invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x;
            this.y = invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y;

            const nextT = Math.min(1, t + 0.01);
            const nInvT = 1 - nextT;
            const nx = nInvT * nInvT * p0.x + 2 * nInvT * nextT * p1.x + nextT * nextT * p2.x;
            const ny = nInvT * nInvT * p0.y + 2 * nInvT * nextT * p1.y + nextT * nextT * p2.y;
            this.angle = Math.atan2(ny - this.y, nx - this.x);

            if (t >= 1) {
                // 釋放停車格位
                if (this.parkingTask.occupiedSlot) {
                    this.parkingTask.occupiedSlot.occupied = false;
                    this.parkingTask.occupiedSlot.vehicleId = null;
                }
                this.parkingState = 'none'; // 完成
                this.distanceOnPath = this.parkingTask.connector.distance;
                this.speed = 0;
                this.parkingStartSimTime = null;
            }
        }
        manageLaneChangeProcess(dt, network, allVehicles) {
            if (this.laneChangeState) { this.laneChangeState.progress += dt / this.laneChangeState.duration; if (this.laneChangeState.progress >= 1) { this.currentLaneIndex = this.laneChangeState.toLaneIndex; this.laneChangeState = null; this.laneChangeCooldown = 5.0; } }
            if (!this.laneChangeGoal) { this.handleMandatoryLaneChangeDecision(network, allVehicles); }
            if (!this.laneChangeGoal && this.laneChangeCooldown <= 0) { this.handleDiscretionaryLaneChangeDecision(network, allVehicles); }
            if (this.laneChangeGoal !== null && !this.laneChangeState) { if (this.currentLaneIndex === this.laneChangeGoal) { this.laneChangeGoal = null; } else { const direction = Math.sign(this.laneChangeGoal - this.currentLaneIndex); const nextLaneIndex = this.currentLaneIndex + direction; const safeToChange = this.isSafeToChange(nextLaneIndex, allVehicles); if (safeToChange) { this.laneChangeState = { progress: 0, fromLaneIndex: this.currentLaneIndex, toLaneIndex: nextLaneIndex, duration: 1.5, }; } } }
        }
        buildFallbackTransitionBezier(network, transition) {
            const inLink = network.links[transition.sourceLinkId];
            const outLink = network.links[transition.destLinkId];
            const inLane = inLink?.lanes?.[transition.sourceLaneIndex];
            const outLane = outLink?.lanes?.[transition.destLaneIndex];
            if (!inLane || !outLane) return null;
            const inPath = inLane.path;
            const outPath = outLane.path;
            if (!inPath || inPath.length < 2 || !outPath || outPath.length < 2) return null;

            const p0 = inPath[inPath.length - 1];
            const p3 = outPath[0];
            const inPrev = inPath[inPath.length - 2] || p0;
            const outNext = outPath[1] || p3;

            const dirOutRaw = Geom.Vec.sub(p0, inPrev);
            const dirInRaw = Geom.Vec.sub(outNext, p3);
            const dirOut = Geom.Vec.len(dirOutRaw) > 1e-6 ? Geom.Vec.normalize(dirOutRaw) : Geom.Vec.normalize(Geom.Vec.sub(p3, p0));
            const dirIn = Geom.Vec.len(dirInRaw) > 1e-6 ? Geom.Vec.normalize(dirInRaw) : Geom.Vec.normalize(Geom.Vec.sub(p3, p0));

            const chord = Geom.Vec.dist(p0, p3);
            const d = Math.max(5, Math.min(25, chord * 0.35));
            const p1 = Geom.Vec.add(p0, Geom.Vec.scale(dirOut, d));
            const p2 = Geom.Vec.sub(p3, Geom.Vec.scale(dirIn, d));
            const length = Geom.Bezier.getLength(p0, p1, p2, p3);
            if (!(length > 0)) return null;
            return { points: [p0, p1, p2, p3], length };
        }

        handlePathTransition(leftoverDistance, network) {
            const laneForTransition = (this.laneChangeGoal !== null)
                ? this.laneChangeGoal
                : (this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex);

            this.laneChangeState = null;
            this.laneChangeGoal = null;
            this.laneChangeCooldown = 0;

            if (this.state === 'onLink') {
                const nextLinkIndex = this.currentLinkIndex + 1;
                if (nextLinkIndex >= this.route.length) { this.finished = true; return; }

                const currentLink = network.links[this.currentLinkId];
                const nextLinkId = this.route[nextLinkIndex];
                const destNode = currentLink ? network.nodes[currentLink.destination] : null;
                const transition = destNode?.transitions?.find(t =>
                    t.sourceLinkId === this.currentLinkId &&
                    t.sourceLaneIndex === laneForTransition &&
                    t.destLinkId === nextLinkId
                );

                this.currentTransition = transition || null;
                const bezier = transition ? (transition.bezier || this.buildFallbackTransitionBezier(network, transition)) : null;
                if (bezier && bezier.points && bezier.points.length === 4 && bezier.length > 0) {
                    this.state = 'inIntersection';
                    this.currentPath = bezier.points;
                    this.currentPathLength = bezier.length;
                    this.distanceOnPath = leftoverDistance;
                } else {
                    this.finished = true;
                }
            } else if (this.state === 'inIntersection') {
                this.switchToNextLink(leftoverDistance, network);
            }
        }
        switchToNextLink(leftoverDistance, network) { this.currentLinkIndex++; if (this.currentLinkIndex >= this.route.length) { this.finished = true; return; } this.currentLinkId = this.route[this.currentLinkIndex]; this.currentLaneIndex = this.currentTransition ? this.currentTransition.destLaneIndex : 0; this.currentTransition = null; this.maxSpeed = this.originalMaxSpeed; this.nextSignIndex = 0; const link = network.links[this.currentLinkId]; if (!link || !link.lanes[this.currentLaneIndex]) { this.finished = true; return; } const lane = link.lanes[this.currentLaneIndex]; this.state = 'onLink'; this.currentPath = lane.path; this.currentPathLength = lane.length; this.distanceOnPath = leftoverDistance; }
        findLeader(allVehicles, network) {
            let leader = null;
            let gap = Infinity;
            this.lastBlockInfo = null;
            const distanceToEndOfCurrentPath = this.currentPathLength - this.distanceOnPath;
            for (const other of allVehicles) {
                if (other.id === this.id) continue;
                // 跳過正在進行停車操縱或已停妥的車輛，它們已脫離道路物理
                if (other.parkingState && other.parkingState !== 'none') continue;
                const isSamePath =
                    (this.state === 'onLink' && other.state === 'onLink' && this.currentLinkId === other.currentLinkId &&
                        (this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex) ===
                        (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex)) ||
                    (this.state === 'inIntersection' && other.state === 'inIntersection' && this.currentTransition?.id === other.currentTransition?.id);
                if (isSamePath && other.distanceOnPath > this.distanceOnPath) {
                    const currentGap = other.distanceOnPath - this.distanceOnPath - this.length;
                    if (currentGap < gap) {
                        gap = currentGap;
                        leader = other;
                    }
                }
            }
            if (this.state === 'onLink') {
                const nextLinkIdx = this.currentLinkIndex + 1;
                if (nextLinkIdx < this.route.length) {
                    const finalLane = this.laneChangeGoal !== null
                        ? this.laneChangeGoal
                        : (this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex);
                    const myTransition = network.nodes[network.links[this.currentLinkId].destination]?.transitions.find(t =>
                        t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === finalLane && t.destLinkId === this.route[nextLinkIdx]
                    );
                    if (myTransition) {
                        const transitionLength = myTransition.bezier?.length || 0;
                        const targetDestLinkId = myTransition.destLinkId;
                        const targetDestLaneIndex = myTransition.destLaneIndex;
                        for (const other of allVehicles) {
                            if (other.id === this.id) continue;
                            // 跳過停車中的車輛
                            if (other.parkingState && other.parkingState !== 'none') continue;
                            if (other.state === 'inIntersection' && other.currentTransition?.destLinkId === targetDestLinkId && other.currentTransition?.destLaneIndex === targetDestLaneIndex) {
                                const lookaheadGap = distanceToEndOfCurrentPath + other.distanceOnPath - this.length;
                                if (lookaheadGap < gap) {
                                    gap = lookaheadGap;
                                    leader = other;
                                }
                            }
                            else if (other.state === 'onLink' && other.currentLinkId === targetDestLinkId &&
                                (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex) === targetDestLaneIndex) {
                                const lookaheadGap = distanceToEndOfCurrentPath + transitionLength + other.distanceOnPath - this.length;
                                if (lookaheadGap < gap) {
                                    gap = lookaheadGap;
                                    leader = other;
                                }
                            }
                        }
                    }
                }
            } else if (this.state === 'inIntersection' && this.currentTransition) {
                const targetDestLinkId = this.currentTransition.destLinkId;
                const targetDestLaneIndex = this.currentTransition.destLaneIndex;
                for (const other of allVehicles) {
                    if (other.id === this.id) continue;
                    // 跳過停車中的車輛
                    if (other.parkingState && other.parkingState !== 'none') continue;
                    if (other.state === 'onLink' && other.currentLinkId === targetDestLinkId &&
                        (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex) === targetDestLaneIndex) {
                        const lookaheadGap = distanceToEndOfCurrentPath + other.distanceOnPath - this.length;
                        if (lookaheadGap < gap) {
                            gap = lookaheadGap;
                            leader = other;
                        }
                    }
                }
            }
            if (this.state === 'onLink') {
                const checkDistance = Math.max(80, this.speed * 4);
                if (distanceToEndOfCurrentPath < checkDistance) {
                    const nextLinkIndex = this.currentLinkIndex + 1;
                    if (nextLinkIndex < this.route.length) {
                        const currentLink = network.links[this.currentLinkId];
                        const destNodeId = currentLink.destination;
                        const destNode = network.nodes[destNodeId];
                        const finalLaneForTransition = this.laneChangeGoal !== null
                            ? this.laneChangeGoal
                            : (this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex);
                        const transition = destNode.transitions.find(t =>
                            t.sourceLinkId === this.currentLinkId &&
                            t.sourceLaneIndex === finalLaneForTransition &&
                            t.destLinkId === this.route[nextLinkIndex]
                        );
                        let isBlocked = false;
                        let blockReason = null;
                        let blockDetails = {};
                        if (!transition) {
                            isBlocked = true;
                            blockReason = 'no_transition';
                        } else {
                            const tfl = network.trafficLights.find(t => t.nodeId === destNodeId);
                            if (tfl) {
                                const signal = tfl.getSignalForTurnGroup(transition.turnGroupId);
                                if (signal === 'Red') {
                                    isBlocked = true;
                                    blockReason = 'red_signal';
                                    blockDetails = { myTurnGroupId: transition.turnGroupId, mySignal: signal };
                                }
                                else if (signal === 'Yellow') {
                                    const requiredBrakingDistance = (this.speed * this.speed) / (2 * this.comfortDecel);
                                    if (distanceToEndOfCurrentPath > requiredBrakingDistance) {
                                        isBlocked = true;
                                        blockReason = 'yellow_stop';
                                        blockDetails = { myTurnGroupId: transition.turnGroupId, mySignal: signal };
                                    }
                                }
                            }
                            if (!isBlocked) {
                                const normalizeAngleDiff = (diff) => {
                                    while (diff <= -Math.PI) diff += Math.PI * 2;
                                    while (diff > Math.PI) diff -= Math.PI * 2;
                                    return diff;
                                };

                                const getTurnType = (trans, inAngle) => {
                                    if (!trans) return null;
                                    let turnAngle = 0;
                                    if (trans.bezier && trans.bezier.points && trans.bezier.points.length === 4) {
                                        const pts = trans.bezier.points;
                                        const pNearEnd = pts[2];
                                        const pEnd = pts[3];
                                        const curveAngle = Math.atan2(pEnd.y - pNearEnd.y, pEnd.x - pNearEnd.x);
                                        turnAngle = normalizeAngleDiff(curveAngle - inAngle);
                                    } else {
                                        const outLink = network.links[trans.destLinkId];
                                        const outAngle = getLinkAngle(outLink, false);
                                        turnAngle = normalizeAngleDiff(outAngle - inAngle);
                                    }
                                    if (turnAngle > 0.2) return 'right';
                                    if (turnAngle < -0.2) return 'left';
                                    return 'straight';
                                };

                                const isOncoming = (inAngleA, inAngleB) => {
                                    const diff = Math.abs(normalizeAngleDiff(inAngleA - inAngleB));
                                    return Math.abs(diff - Math.PI) < 0.7;
                                };

                                const myInAngle = getLinkAngle(network.links[this.currentLinkId], true);
                                const myTurnType = getTurnType(transition, myInAngle);
                                const enableLeftTurnYield = (typeof window !== 'undefined' && window.ENABLE_LEFT_TURN_YIELD);

                                if (enableLeftTurnYield && tfl && myTurnType === 'left') {
                                    const ttcYield = 2.5;
                                    const distYield = 10.0;
                                    const stoppedSpeedEps = 0.3;
                                    const stoppedDistEps = 5.0;
                                    for (const other of allVehicles) {
                                        if (other.id === this.id) continue;
                                        // 跳過停車中的車輛
                                        if (other.parkingState && other.parkingState !== 'none') continue;

                                        let otherTransition = null;
                                        let otherDistanceToNode = Infinity;
                                        let otherIsInIntersection = false;
                                        if (other.state === 'inIntersection' && other.currentTransition) {
                                            const otherNodeId = network.links[other.currentTransition.sourceLinkId]?.destination;
                                            if (otherNodeId !== destNodeId) continue;
                                            otherTransition = other.currentTransition;
                                            otherDistanceToNode = 0;
                                            otherIsInIntersection = true;
                                        } else if (other.state === 'onLink') {
                                            const otherLink = network.links[other.currentLinkId];
                                            if (!otherLink || otherLink.destination !== destNodeId) continue;
                                            const otherNextIdx = other.currentLinkIndex + 1;
                                            if (otherNextIdx >= other.route.length) continue;
                                            const otherFinalLane = other.laneChangeGoal !== null
                                                ? other.laneChangeGoal
                                                : (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex);
                                            otherTransition = destNode.transitions.find(t =>
                                                t.sourceLinkId === other.currentLinkId &&
                                                t.sourceLaneIndex === otherFinalLane &&
                                                t.destLinkId === other.route[otherNextIdx]
                                            );
                                            otherDistanceToNode = (other.currentPathLength - other.distanceOnPath);
                                        } else {
                                            continue;
                                        }

                                        if (!otherTransition) continue;
                                        if (otherDistanceToNode > checkDistance) continue;

                                        const otherInAngle = getLinkAngle(network.links[otherTransition.sourceLinkId], true);
                                        if (!isOncoming(myInAngle, otherInAngle)) continue;

                                        const otherTurnType = getTurnType(otherTransition, otherInAngle);
                                        if (otherTurnType !== 'straight') continue;

                                        const otherSpeed = Math.max(0, other.speed);
                                        if (!otherIsInIntersection && otherSpeed <= stoppedSpeedEps && otherDistanceToNode <= stoppedDistEps) continue;

                                        let otherSignal = null;
                                        if (!otherIsInIntersection) {
                                            if (!otherTransition.turnGroupId) continue;
                                            otherSignal = tfl.getSignalForTurnGroup(otherTransition.turnGroupId);
                                            if (otherSignal === 'Red') continue;
                                            if (otherSignal === 'Yellow') {
                                                const otherTtcYellow = otherDistanceToNode / Math.max(otherSpeed, 0.1);
                                                if (otherTtcYellow > ttcYield && otherDistanceToNode > distYield) continue;
                                            }
                                        }

                                        let shouldYield = false;
                                        let otherTtc = null;
                                        if (otherIsInIntersection) {
                                            const otherProgress = (other.currentPathLength > 0) ? (other.distanceOnPath / other.currentPathLength) : 0;
                                            if (otherSpeed > stoppedSpeedEps && otherProgress < 0.85) {
                                                shouldYield = true;
                                            }
                                        } else {
                                            otherTtc = otherDistanceToNode / Math.max(otherSpeed, 0.1);
                                            if (otherDistanceToNode <= distYield || otherTtc <= ttcYield) {
                                                shouldYield = true;
                                            }
                                        }

                                        if (!shouldYield) continue;
                                        isBlocked = true;
                                        blockReason = 'yield_oncoming';
                                        blockDetails = {
                                            myTurnGroupId: transition.turnGroupId,
                                            otherVehicleId: other.id,
                                            otherLinkId: otherTransition.sourceLinkId,
                                            otherTurnGroupId: otherTransition.turnGroupId,
                                            otherSignal,
                                            otherDistanceToNode,
                                            otherSpeed,
                                            otherTtc
                                        };
                                        break;
                                    }
                                }

                                for (const other of allVehicles) {
                                    if (other.id === this.id || other.state !== 'onLink' || other.currentLinkId !== this.currentLinkId) continue;
                                    const otherNextIdx = other.currentLinkIndex + 1;
                                    if (otherNextIdx >= other.route.length) continue;
                                    const otherFinalLane = other.laneChangeGoal !== null
                                        ? other.laneChangeGoal
                                        : (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex);
                                    const otherTransition = destNode.transitions.find(t => t.sourceLinkId === other.currentLinkId && t.sourceLaneIndex === otherFinalLane && t.destLinkId === other.route[otherNextIdx]);
                                    if (otherTransition && otherTransition.destLinkId === transition.destLinkId && otherTransition.destLaneIndex === transition.destLaneIndex) {
                                        if ((other.currentPathLength - other.distanceOnPath) < (this.currentPathLength - this.distanceOnPath)) {
                                            isBlocked = true;
                                            blockReason = 'merge_queue';
                                            blockDetails = { myTurnGroupId: transition.turnGroupId, otherVehicleId: other.id, myDestLinkId: transition.destLinkId, myDestLaneIndex: transition.destLaneIndex };
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (isBlocked && distanceToEndOfCurrentPath < gap) {
                            leader = null;
                            gap = distanceToEndOfCurrentPath;
                            this.lastBlockInfo = { blocked: true, reason: blockReason, nodeId: destNodeId, ...blockDetails };
                        }
                    }
                }
            }
            return { leader, gap: Math.max(0.1, gap) };
        }
        handleMandatoryLaneChangeDecision(network, allVehicles) {
            if (this.laneChangeGoal !== null) return;
            const link = network.links[this.currentLinkId];
            const lane = link.lanes[this.currentLaneIndex];
            if (!lane) return;

            const nextLinkId = this.route[this.currentLinkIndex + 1];
            if (!nextLinkId) return;
            const destNode = network.nodes[link.destination];
            if (!destNode) return;

            const secondLinkId = this.route[this.currentLinkIndex + 2];
            const shortLinkThreshold = (typeof window !== 'undefined' && typeof window.MANDATORY_LC_SHORT_LINK_THRESHOLD === 'number')
                ? window.MANDATORY_LC_SHORT_LINK_THRESHOLD
                : 80;
            let shouldLookahead2 = false;
            if (secondLinkId) {
                const nextLink = network.links[nextLinkId];
                const nextLinkFirstLaneKey = nextLink?.lanes ? Object.keys(nextLink.lanes)[0] : null;
                const nextLinkLength = nextLink?.lanes?.[0]?.length ?? (nextLinkFirstLaneKey !== null ? nextLink?.lanes?.[nextLinkFirstLaneKey]?.length : undefined);
                if (typeof nextLinkLength === 'number' && nextLinkLength < shortLinkThreshold) {
                    shouldLookahead2 = true;
                }
            }

            const canPassFromLane = (laneIndex) => destNode.transitions.some(t =>
                t.sourceLinkId === this.currentLinkId &&
                t.sourceLaneIndex === laneIndex &&
                t.destLinkId === nextLinkId
            );

            const canPassFromLaneConsideringShortNextLink = (laneIndex) => {
                const firstTransitions = destNode.transitions.filter(t =>
                    t.sourceLinkId === this.currentLinkId &&
                    t.sourceLaneIndex === laneIndex &&
                    t.destLinkId === nextLinkId
                );
                if (firstTransitions.length === 0) return false;
                if (!shouldLookahead2) return true;

                const nextLinkDestNodeId = network.links[nextLinkId]?.destination;
                const nextDestNode = nextLinkDestNodeId ? network.nodes[nextLinkDestNodeId] : null;
                if (!nextDestNode || !nextDestNode.transitions) return true;

                for (const t1 of firstTransitions) {
                    const ok = nextDestNode.transitions.some(t2 =>
                        t2.sourceLinkId === nextLinkId &&
                        t2.sourceLaneIndex === t1.destLaneIndex &&
                        t2.destLinkId === secondLinkId
                    );
                    if (ok) return true;
                }
                return false;
            };

            if (canPassFromLaneConsideringShortNextLink(this.currentLaneIndex)) return;

            const suitableLanes = [];
            let minLaneShift = Infinity;
            for (const laneIdx in link.lanes) {
                const targetLane = parseInt(laneIdx, 10);
                if (!canPassFromLaneConsideringShortNextLink(targetLane)) continue;
                const laneShift = Math.abs(targetLane - this.currentLaneIndex);
                minLaneShift = Math.min(minLaneShift, laneShift);
                const { leader } = this.getLaneLeader(targetLane, allVehicles);
                const density = leader ? leader.distanceOnPath - this.distanceOnPath : Infinity;
                suitableLanes.push({ laneIndex: targetLane, density, laneShift });
            }
            if (suitableLanes.length === 0) return;

            const distanceToEnd = lane.length - this.distanceOnPath;
            const lookaheadDistance = Math.max(
                150,
                this.speed * 8,
                (minLaneShift === Infinity ? 0 : minLaneShift * 120)
            );
            const maxStartBase = (typeof window !== 'undefined' && typeof window.MANDATORY_LC_MAX_START_BASE === 'number')
                ? window.MANDATORY_LC_MAX_START_BASE
                : 600;
            const maxStartPerShift = (typeof window !== 'undefined' && typeof window.MANDATORY_LC_MAX_START_PER_SHIFT === 'number')
                ? window.MANDATORY_LC_MAX_START_PER_SHIFT
                : 250;
            const maxStartDistance = Math.max(
                400,
                maxStartBase + (minLaneShift === Infinity ? 0 : minLaneShift * maxStartPerShift)
            );
            if (distanceToEnd > maxStartDistance) return;

            const approachSpeed = Math.max(5, Math.min(this.maxSpeed || 5, Math.max(this.speed, 1)));
            const timeToEnd = distanceToEnd / approachSpeed;
            const requiredTime = 18 + (minLaneShift === Infinity ? 0 : minLaneShift * 8);

            const { leader: currentLeader, gap: currentGap } = this.getLaneLeader(this.currentLaneIndex, allVehicles);
            const congested = !!currentLeader && (this.speed < 6) && (currentGap < 25 || currentLeader.speed < 3);

            if (!congested && distanceToEnd > lookaheadDistance && timeToEnd > requiredTime) return;

            suitableLanes.sort((a, b) => {
                if (a.laneShift !== b.laneShift) return a.laneShift - b.laneShift;
                return b.density - a.density;
            });
            this.laneChangeGoal = suitableLanes[0].laneIndex;
        }
        handleDiscretionaryLaneChangeDecision(network, allVehicles) { if (this.laneChangeGoal !== null || this.laneChangeState !== null || this.laneChangeCooldown > 0) return; const link = network.links[this.currentLinkId]; const nextLinkId = this.route[this.currentLinkIndex + 1]; if (!nextLinkId) return; const destNode = network.nodes[link.destination]; const { leader: currentLeader } = this.getLaneLeader(this.currentLaneIndex, allVehicles); const adjacentLanes = [this.currentLaneIndex - 1, this.currentLaneIndex + 1]; for (const targetLane of adjacentLanes) { if (!link.lanes[targetLane]) continue; const canPassOnTargetLane = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === targetLane && t.destLinkId === nextLinkId); if (!canPassOnTargetLane) continue; const { leader: targetLeader } = this.getLaneLeader(targetLane, allVehicles); const currentGap = currentLeader ? currentLeader.distanceOnPath - this.distanceOnPath : Infinity; const targetGap = targetLeader ? targetLeader.distanceOnPath - this.distanceOnPath : Infinity; const speedAdvantage = targetLeader ? targetLeader.speed - this.speed : 0; const gapAdvantage = targetGap - currentGap; if (gapAdvantage > this.length * 2 && speedAdvantage > 2) { if (this.isSafeToChange(targetLane, allVehicles)) { this.laneChangeGoal = targetLane; return; } } } }
        getLaneLeader(laneIndex, allVehicles) { let leader = null; let gap = Infinity; for (const other of allVehicles) { if (this.id === other.id || other.currentLinkId !== this.currentLinkId) continue; const otherLane = other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex; if (otherLane === laneIndex && other.distanceOnPath > this.distanceOnPath) { const otherGap = other.distanceOnPath - this.distanceOnPath - this.length; if (otherGap < gap) { gap = otherGap; leader = other; } } } return { leader, gap }; }
        // --- [修改] 變換車道安全檢查 (加入雙重匯流與目標車道預判) ---
        isSafeToChange(targetLane, allVehicles) {
            // 1. 基本檢查：目標車道前後是否有空間
            // 檢查目標車道上現有的車輛
            for (const other of allVehicles) {
                if (other.id === this.id) continue;
                // 只檢查同 Link 的車
                if (other.currentLinkId !== this.currentLinkId) continue;

                // 取得對方目前所在的車道 (若正在換車道，取其目標車道)
                const otherLaneIndex = other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex;

                if (otherLaneIndex === targetLane) {
                    // 對方在目標車道
                    const distDiff = other.distanceOnPath - this.distanceOnPath;

                    // 情況 A: 對方在前方 (由後方接近)
                    // 需要保持 minGap + 車長，且考慮速度差
                    if (distDiff > 0) {
                        if (distDiff < (this.length + this.minGap)) return false;
                    }
                    // 情況 B: 對方在後方 (我要切到他前面)
                    else {
                        // 需要確保後方車輛有足夠煞車空間
                        // 如果對方比我快很多，切過去會被撞
                        const gap = -distDiff; // 轉為正值
                        const safeGap = other.length + this.minGap + Math.max(0, (other.speed - this.speed) * 2.0); // 2秒緩衝
                        if (gap < safeGap) return false;
                    }
                }
            }

            // 2. [新增] 進階檢查：是否有「其他人」也想切入同一個目標車道？ (Double Merge Prevention)
            // 例如：我在 Lane 1 想切 Lane 2，另一個人從 Lane 3 也想切 Lane 2
            for (const other of allVehicles) {
                if (other.id === this.id) continue;
                if (other.currentLinkId !== this.currentLinkId) continue;

                // 檢查對方的意圖
                if (other.laneChangeGoal === targetLane || (other.laneChangeState && other.laneChangeState.toLaneIndex === targetLane)) {
                    // 如果有人也想去同個車道，且距離我很近 (例如前後 30公尺內)
                    // 我們就放棄這次變換，避免同時擠進去
                    const distDiff = Math.abs(other.distanceOnPath - this.distanceOnPath);
                    if (distDiff < 30.0) {
                        return false;
                    }
                }
            }

            return true;
        }
        getPositionOnPath(path, distance) {
            let distAcc = 0;
            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i];
                const p2 = path[i + 1];
                const segmentLen = Geom.Vec.dist(p1, p2);
                if (distance >= distAcc && distance <= distAcc + segmentLen) {
                    if (segmentLen < 1e-6) { const nextPoint = path[i + 2] || p2; const segmentVec = Geom.Vec.sub(nextPoint, p1); return { x: p1.x, y: p1.y, angle: Geom.Vec.angle(segmentVec) }; }
                    const ratio = (distance - distAcc) / segmentLen;
                    const segmentVec = Geom.Vec.sub(p2, p1);
                    const x = p1.x + segmentVec.x * ratio;
                    const y = p1.y + segmentVec.y * ratio;
                    const angle = Geom.Vec.angle(segmentVec);
                    return { x, y, angle };
                }
                distAcc += segmentLen;
            }
            if (path.length > 1) { const p1 = path[path.length - 2]; const p2 = path[path.length - 1]; const segmentVec = Geom.Vec.sub(p2, p1); return { x: p2.x, y: p2.y, angle: Geom.Vec.angle(segmentVec) }; }
            return null;
        }
        updateDrawingPosition(network) {
            if (this.state === 'onLink') {
                const link = network.links[this.currentLinkId];
                if (this.laneChangeState) {
                    const fromLane = link.lanes[this.laneChangeState.fromLaneIndex];
                    const toLane = link.lanes[this.laneChangeState.toLaneIndex];
                    if (!fromLane || !toLane) { this.laneChangeState = null; this.updateDrawingPosition(network); return; }
                    const posFrom = this.getPositionOnPath(fromLane.path, this.distanceOnPath);
                    const posTo = this.getPositionOnPath(toLane.path, this.distanceOnPath);
                    if (posFrom && posTo) {
                        const p = this.laneChangeState.progress;
                        this.x = posFrom.x * (1 - p) + posTo.x * p;
                        this.y = posFrom.y * (1 - p) + posTo.y * p;
                        const fromDir = { x: Math.cos(posFrom.angle), y: Math.sin(posFrom.angle) };
                        const toDir = { x: Math.cos(posTo.angle), y: Math.sin(posTo.angle) };
                        const interpDirX = fromDir.x * (1 - p) + toDir.x * p;
                        const interpDirY = fromDir.y * (1 - p) + toDir.y * p;
                        this.angle = Math.atan2(interpDirY, interpDirX);
                    }
                } else {
                    const currentLane = link.lanes[this.currentLaneIndex];
                    if (!currentLane) return;
                    const pos = this.getPositionOnPath(currentLane.path, this.distanceOnPath);
                    if (pos) { this.x = pos.x; this.y = pos.y; this.angle = pos.angle; }
                }
            } else if (this.state === 'inIntersection') {
                const t = this.currentPathLength > 0 ? Math.max(0, Math.min(1, this.distanceOnPath / this.currentPathLength)) : 0;
                const [p0, p1, p2, p3] = this.currentPath;
                const pos = Geom.Bezier.getPoint(t, p0, p1, p2, p3);
                this.x = pos.x;
                this.y = pos.y;
                const tangent = Geom.Bezier.getTangent(t, p0, p1, p2, p3);
                this.angle = Geom.Vec.angle(tangent);
            }
        }
    }

    // --- Stats & Charts Helper Functions ---
    function initializeCharts() {
        if (vehicleCountChart) vehicleCountChart.destroy();
        if (avgSpeedChart) avgSpeedChart.destroy();
        const dict = translations[currentLang];
        const chartOptions = (yAxisTitle) => ({
            responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
            scales: { x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } }, y: { beginAtZero: true, title: { display: true, text: yAxisTitle }, suggestedMax: 10 } },
            plugins: { legend: { display: false } }, elements: { point: { radius: 1 }, line: { tension: 0.1, borderWidth: 2 } }
        });
        vehicleCountChart = new Chart(vehicleCountChartCanvas, { type: 'line', data: { labels: [], datasets: [{ label: dict.chartVehicleAxis, data: [], borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.5)' }] }, options: chartOptions(dict.chartVehicleAxis) });
        avgSpeedChart = new Chart(avgSpeedChartCanvas, { type: 'line', data: { labels: [], datasets: [{ label: dict.chartSpeedAxis, data: [], borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)' }] }, options: chartOptions(dict.chartSpeedAxis) });
    }
    function setupMeterCharts(meters) {
        meterChartsContainer.innerHTML = ''; meterCharts = {}; const dict = translations[currentLang];
        const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis }, ticks: { autoSkip: true, maxRotation: 45, minRotation: 0, } }, y: { beginAtZero: true, title: { display: true, text: dict.meterChartSpeedAxis }, suggestedMax: 60 } }, plugins: { legend: { display: true, position: 'top', } }, elements: { point: { radius: 3 } } };
        meters.forEach(meter => { const chartDiv = document.createElement('div'); chartDiv.className = 'chart-container'; const title = document.createElement('h3'); title.textContent = `${dict.meterTitle} ${meter.id} (${meter.name})`; const canvasEl = document.createElement('canvas'); canvasEl.id = `meter-chart-${meter.id}`; chartDiv.appendChild(title); chartDiv.appendChild(canvasEl); meterChartsContainer.appendChild(chartDiv); const datasets = [{ label: dict.allLanesLabel, data: [], backgroundColor: 'rgba(0, 0, 0, 0.7)', }]; for (let i = 0; i < meter.numLanes; i++) { datasets.push({ label: `${dict.laneLabel} ${i}`, data: [], backgroundColor: LANE_COLORS[i % LANE_COLORS.length] }); } meterCharts[meter.id] = new Chart(canvasEl.getContext('2d'), { type: 'scatter', data: { datasets: datasets }, options: chartOptions }); });
    }
    function setupSectionMeterCharts(meters) {
        sectionMeterChartsContainer.innerHTML = ''; sectionMeterCharts = {}; const dict = translations[currentLang];
        const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } }, y: { beginAtZero: true, title: { display: true, text: dict.sectionChartSpeedAxis }, suggestedMax: 60 } }, plugins: { legend: { display: true, position: 'top', } }, elements: { point: { radius: 2 }, line: { tension: 0.1, borderWidth: 2 } } };
        meters.forEach(meter => { const chartDiv = document.createElement('div'); chartDiv.className = 'chart-container'; const title = document.createElement('h3'); title.textContent = `${dict.sectionMeterTitle} ${meter.id} (${meter.name})`; const canvasEl = document.createElement('canvas'); canvasEl.id = `section-meter-chart-${meter.id}`; chartDiv.appendChild(title); chartDiv.appendChild(canvasEl); sectionMeterChartsContainer.appendChild(chartDiv); const newChart = new Chart(canvasEl.getContext('2d'), { type: 'line', data: { datasets: [{ label: dict.allLanesAvgRateLabel, data: [], borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.5)', }] }, options: chartOptions }); sectionMeterCharts[meter.id] = newChart; });
    }
    function updateStatistics(time) {
        if (!simulation) return;
        const vehicles = simulation.vehicles; const vehicleCount = vehicles.length; let avgSpeedKmh = 0; if (vehicleCount > 0) { const totalSpeed = vehicles.reduce((sum, v) => sum + v.speed, 0); avgSpeedKmh = (totalSpeed / vehicleCount) * 3.6; } maxVehicleCount = Math.max(maxVehicleCount, vehicleCount); maxAvgSpeed = Math.max(maxAvgSpeed, avgSpeedKmh); const newData = { time, count: vehicleCount, speed: avgSpeedKmh }; if (!statsData.some(d => d.time === time)) { statsData.push(newData); } updateStatsUI(newData);
        simulation.speedMeters.forEach(meter => { const chart = meterCharts[meter.id]; if (!chart) return; const dict = translations[currentLang]; let currentMaxSpeed = 0; for (const key in meter.readings) { const readings = meter.readings[key]; if (readings.length > 0) { const totalSpeed = readings.reduce((sum, s) => sum + s, 0); const avgSpeedMs = totalSpeed / readings.length; const meterAvgSpeedKmh = avgSpeedMs * 3.6; currentMaxSpeed = Math.max(currentMaxSpeed, meterAvgSpeedKmh); const label = (key === 'all') ? dict.allLanesLabel : `${dict.laneLabel} ${key}`; const dataset = chart.data.datasets.find(d => d.label === label); if (dataset) { dataset.data.push({ x: time, y: meterAvgSpeedKmh }); } } } meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, currentMaxSpeed); chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60; chart.update('none'); meter.readings = {}; });
        simulation.sectionMeters.forEach(meter => { const chart = sectionMeterCharts[meter.id]; if (!chart) return; if (meter.completedVehicles.length > 0) { const totalSpeed = meter.completedVehicles.reduce((sum, v) => sum + v.speed, 0); const avgSpeed = totalSpeed / meter.completedVehicles.length; chart.data.datasets[0].data.push({ x: time, y: avgSpeed }); meter.lastAvgSpeed = avgSpeed; meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, avgSpeed); } else if (meter.lastAvgSpeed !== null) { chart.data.datasets[0].data.push({ x: time, y: meter.lastAvgSpeed }); } chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60; chart.update('none'); meter.completedVehicles = []; });
    }
    function updateStatsUI(data, isRepopulating = false) { if (!isRepopulating) { const newRow = statsTableBody.insertRow(0); newRow.insertCell(0).textContent = data.time; newRow.insertCell(1).textContent = data.count; newRow.insertCell(2).textContent = data.speed.toFixed(2); if (statsTableBody.rows.length > 200) statsTableBody.deleteRow(-1); } if (vehicleCountChart && !vehicleCountChart.data.labels.includes(data.time)) { vehicleCountChart.data.labels.push(data.time); vehicleCountChart.data.datasets[0].data.push(data.count); vehicleCountChart.options.scales.y.max = maxVehicleCount > 10 ? Math.ceil(maxVehicleCount * 1.1) : 10; vehicleCountChart.update('none'); } if (avgSpeedChart && !avgSpeedChart.data.labels.includes(data.time)) { avgSpeedChart.data.labels.push(data.time); avgSpeedChart.data.datasets[0].data.push(data.speed); avgSpeedChart.options.scales.y.max = maxAvgSpeed > 10 ? Math.ceil(maxAvgSpeed * 1.1) : 10; avgSpeedChart.update('none'); } }
    function resetStatistics() { statsData = []; lastLoggedIntegerTime = -1; maxVehicleCount = 0; maxAvgSpeed = 0; statsTableBody.innerHTML = ''; initializeCharts(); meterChartsContainer.innerHTML = ''; meterCharts = {}; sectionMeterChartsContainer.innerHTML = ''; sectionMeterCharts = {}; }

    // --- Parser (Unchanged) ---
    function parseTrafficModel(xmlDoc) {
        return new Promise((resolve, reject) => {
            const links = {}; const nodes = {}; let spawners = []; let trafficLights = []; const staticVehicles = []; const speedMeters = []; const sectionMeters = []; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; const updateBounds = (p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }; const roadSignVisuals = [];
            const backgroundTiles = []; const imagePromises = []; // Add background tiles array
            const imageTypeMap = { 'PNG': 'png', 'JPG': 'jpeg', 'JPEG': 'jpeg', 'BMP': 'bmp', 'GIF': 'gif', 'TIFF': 'tiff' };

            function getPointAtDistanceAlongPath(path, distance) { let accumulatedLength = 0; for (let i = 0; i < path.length - 1; i++) { const p1 = path[i]; const p2 = path[i + 1]; const segmentLength = Geom.Vec.dist(p1, p2); if (distance >= accumulatedLength && distance <= accumulatedLength + segmentLength) { const ratio = (distance - accumulatedLength) / segmentLength; const segmentVec = Geom.Vec.sub(p2, p1); const point = Geom.Vec.add(p1, Geom.Vec.scale(segmentVec, ratio)); const normal = Geom.Vec.normalize(Geom.Vec.normal(segmentVec)); const angle = Geom.Vec.angle(segmentVec); return { point, normal, angle }; } accumulatedLength += segmentLength; } return null; }

            function getClosestPointOnPathWithDistance(path, point) {
                if (!path || path.length < 2) return null;
                let best = null;
                let accumulatedLength = 0;
                for (let i = 0; i < path.length - 1; i++) {
                    const v = path[i];
                    const w = path[i + 1];
                    const dx = w.x - v.x;
                    const dy = w.y - v.y;
                    const l2 = dx * dx + dy * dy;
                    if (l2 <= 0) continue;

                    let t = ((point.x - v.x) * dx + (point.y - v.y) * dy) / l2;
                    t = Math.max(0, Math.min(1, t));

                    const x = v.x + t * dx;
                    const y = v.y + t * dy;
                    const dist = Math.hypot(point.x - x, point.y - y);
                    const s = accumulatedLength + t * Math.sqrt(l2);

                    if (!best || dist < best.dist) {
                        best = { x, y, dist, s };
                    }

                    accumulatedLength += Math.sqrt(l2);
                }
                return best;
            }
            xmlDoc.querySelectorAll('Link').forEach(linkEl => {
                const linkId = linkEl.querySelector('id').textContent; const sourceNodeId = linkEl.querySelector('sourceNodeId')?.textContent; const destinationNodeId = linkEl.querySelector('destinationNodeId')?.textContent;
                if (!sourceNodeId && !destinationNodeId) { const segs = linkEl.querySelectorAll('Segments > TrapeziumSegment'); if (segs.length > 0) { const wp = linkEl.querySelectorAll('Waypoints > Waypoint'); if (wp.length >= 2) { const firstWpId = segs[0].querySelector('startWaypointId').textContent; const lastWpId = segs[segs.length - 1].querySelector('endWaypointId').textContent; xmlDoc.querySelectorAll('Nodes > *').forEach(nodeEl => { if (nodeEl.querySelector('outgoingLinkId')?.textContent === linkId || nodeEl.querySelector('incomingLinkId')?.textContent === linkId) { const center = nodeEl.querySelector('CircleGeometry > Center'); if (center) { const wpId = Array.from(wp).find(w => w.querySelector('x').textContent === center.querySelector('x').textContent)?.querySelector('id').textContent; if (wpId === firstWpId) links[linkId] = { ...links[linkId], source: nodeEl.querySelector('id').textContent }; if (wpId === lastWpId) links[linkId] = { ...links[linkId], destination: nodeEl.querySelector('id').textContent }; } } }); } } } else { links[linkId] = { id: linkId, source: sourceNodeId, destination: destinationNodeId }; }
                links[linkId] = { ...links[linkId], length: parseFloat(linkEl.querySelector('length').textContent), geometry: [], lanes: {}, dividingLines: [], roadSigns: [] }; const link = links[linkId];
                linkEl.querySelectorAll('Lanes > Lane').forEach(laneEl => { const laneIndex = parseInt(laneEl.querySelector('index').textContent, 10); const laneWidth = parseFloat(laneEl.querySelector('width').textContent); link.lanes[laneIndex] = { index: laneIndex, width: laneWidth, path: [], length: 0 }; }); const numLanes = Object.keys(link.lanes).length; if (numLanes > 1) { for (let i = 0; i < numLanes - 1; i++) { link.dividingLines[i] = { path: [] }; } }
                const centerlinePolyline = []; const waypointsEl = linkEl.querySelectorAll('Waypoints > Waypoint'); const hasWaypoints = waypointsEl.length >= 2;
                if (hasWaypoints) { waypointsEl.forEach(wp => { const x = parseFloat(wp.querySelector('x').textContent); const y = -parseFloat(wp.querySelector('y').textContent); const p = { x, y }; centerlinePolyline.push(p); updateBounds(p); }); } else { const segments = Array.from(linkEl.querySelectorAll('TrapeziumSegment, Segments > TrapeziumSegment')); segments.forEach(segEl => { const ls = segEl.querySelector('LeftSide > Start'); const le = segEl.querySelector('LeftSide > End'); const rs = segEl.querySelector('RightSide > Start'); const re = segEl.querySelector('RightSide > End'); const p1 = { x: parseFloat(ls.querySelector('x').textContent), y: -parseFloat(ls.querySelector('y').textContent) }; const p2 = { x: parseFloat(rs.querySelector('x').textContent), y: -parseFloat(rs.querySelector('y').textContent) }; const p3 = { x: parseFloat(re.querySelector('x').textContent), y: -parseFloat(re.querySelector('y').textContent) }; const p4 = { x: parseFloat(le.querySelector('x').textContent), y: -parseFloat(le.querySelector('y').textContent) }; link.geometry.push({ type: 'trapezium', points: [p1, p2, p3, p4] });[p1, p2, p3, p4].forEach(updateBounds); const centerStart = Geom.Vec.scale(Geom.Vec.add(p1, p2), 0.5); const centerEnd = Geom.Vec.scale(Geom.Vec.add(p4, p3), 0.5); if (centerlinePolyline.length === 0) { centerlinePolyline.push(centerStart); } centerlinePolyline.push(centerEnd); segEl.querySelectorAll('RoadSigns > SpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); const speedLimit = parseFloat(signEl.querySelector('speedLimit').textContent); link.roadSigns.push({ type: 'limit', position, limit: speedLimit }); }); segEl.querySelectorAll('RoadSigns > NoSpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); link.roadSigns.push({ type: 'no_limit', position }); }); }); }
                const miteredNormals = []; if (centerlinePolyline.length > 1) { for (let i = 0; i < centerlinePolyline.length; i++) { let finalNormal; if (i === 0) { const segVec = Geom.Vec.sub(centerlinePolyline[1], centerlinePolyline[0]); finalNormal = Geom.Vec.normalize(Geom.Vec.normal(segVec)); } else if (i === centerlinePolyline.length - 1) { const segVec = Geom.Vec.sub(centerlinePolyline[i], centerlinePolyline[i - 1]); finalNormal = Geom.Vec.normalize(Geom.Vec.normal(segVec)); } else { const v_in = Geom.Vec.sub(centerlinePolyline[i], centerlinePolyline[i - 1]); const v_out = Geom.Vec.sub(centerlinePolyline[i + 1], centerlinePolyline[i]); const n_in = Geom.Vec.normalize(Geom.Vec.normal(v_in)); const n_out = Geom.Vec.normalize(Geom.Vec.normal(v_out)); const miter_vec = Geom.Vec.add(n_in, n_out); if (Geom.Vec.len(miter_vec) < 1e-6) { finalNormal = n_in; } else { const dot_product = n_in.x * n_out.x + n_in.y * n_out.y; const safe_dot = Math.max(-1.0, Math.min(1.0, dot_product)); const cos_half_angle = Math.sqrt((1 + safe_dot) / 2); if (cos_half_angle > 1e-6) { const scale_factor = 1.0 / cos_half_angle; finalNormal = Geom.Vec.scale(Geom.Vec.normalize(miter_vec), scale_factor); } else { finalNormal = n_in; } } } miteredNormals.push(finalNormal); } }
                const orderedLanes = Object.values(link.lanes).sort((a, b) => a.index - b.index); const totalWidth = orderedLanes.reduce((sum, lane) => sum + lane.width, 0);
                if (hasWaypoints && centerlinePolyline.length > 1) { const leftEdgePoints = []; const rightEdgePoints = []; for (let i = 0; i < centerlinePolyline.length; i++) { const centerPoint = centerlinePolyline[i]; const normal = miteredNormals[i]; const halfWidth = totalWidth / 2; leftEdgePoints.push(Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, -halfWidth))); rightEdgePoints.push(Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, halfWidth))); } link.geometry.push({ type: 'polygon', points: [...leftEdgePoints, ...rightEdgePoints.reverse()] }); const segs = linkEl.querySelectorAll('Segments > TrapeziumSegment'); segs.forEach(segEl => { segEl.querySelectorAll('RoadSigns > SpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); const speedLimit = parseFloat(signEl.querySelector('speedLimit').textContent); link.roadSigns.push({ type: 'limit', position, limit: speedLimit }); }); segEl.querySelectorAll('RoadSigns > NoSpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); link.roadSigns.push({ type: 'no_limit', position }); }); }); }
                for (let i = 0; i < centerlinePolyline.length; i++) { const centerPoint = centerlinePolyline[i]; const normal = miteredNormals[i]; let cumulativeWidth = 0; for (let j = 0; j < orderedLanes.length; j++) { const lane = orderedLanes[j]; const laneCenterOffsetFromEdge = cumulativeWidth + lane.width / 2; const offsetFromRoadCenter = laneCenterOffsetFromEdge - totalWidth / 2; const lanePoint = Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, offsetFromRoadCenter)); lane.path.push(lanePoint); cumulativeWidth += lane.width; if (j < orderedLanes.length - 1) { const divider = link.dividingLines[j]; const dividerOffsetFromRoadCenter = cumulativeWidth - totalWidth / 2; const linePoint = Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, dividerOffsetFromRoadCenter)); divider.path.push(linePoint); } } } for (const lane of Object.values(link.lanes)) { lane.length = 0; for (let i = 0; i < lane.path.length - 1; i++) { lane.length += Geom.Vec.dist(lane.path[i], lane.path[i + 1]); } } link.roadSigns.sort((a, b) => a.position - b.position);
            });
            xmlDoc.querySelectorAll('Nodes > *').forEach(nodeEl => { const nodeId = nodeEl.querySelector('id').textContent; nodes[nodeId] = { id: nodeId, transitions: [], turnGroups: {}, polygon: [] }; const node = nodes[nodeId]; nodeEl.querySelectorAll('PolygonGeometry > Point').forEach(p => { const point = { x: parseFloat(p.querySelector('x').textContent), y: -parseFloat(p.querySelector('y').textContent) }; node.polygon.push(point); }); if (node.polygon.length === 0) { const circle = nodeEl.querySelector('CircleGeometry'); if (circle) { const center = circle.querySelector('Center'); const radius = parseFloat(circle.querySelector('radius').textContent); const cx = parseFloat(center.querySelector('x').textContent); const cy = -parseFloat(center.querySelector('y').textContent); for (let i = 0; i < 12; i++) { const angle = (i / 12) * 2 * Math.PI; node.polygon.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }); } } } nodeEl.querySelectorAll('TransitionRule').forEach(ruleEl => { const idEl = ruleEl.querySelector('id'); const sourceLinkEl = ruleEl.querySelector('sourceLinkId'); if (idEl && sourceLinkEl) { const transition = { id: idEl.textContent, sourceLinkId: sourceLinkEl.textContent, sourceLaneIndex: parseInt(ruleEl.querySelector('sourceLaneIndex').textContent, 10), destLinkId: ruleEl.querySelector('destinationLinkId').textContent, destLaneIndex: parseInt(ruleEl.querySelector('destinationLaneIndex').textContent, 10), }; const bezierEl = ruleEl.querySelector('BezierCurveGeometry'); if (bezierEl) { const points = Array.from(bezierEl.querySelectorAll('Point')).map(pEl => ({ x: parseFloat(pEl.querySelector('x').textContent), y: -parseFloat(pEl.querySelector('y').textContent) })); if (points.length === 4) { transition.bezier = { points: points, length: Geom.Bezier.getLength(...points) }; } } node.transitions.push(transition); } }); nodeEl.querySelectorAll('TurnTRGroup').forEach(groupEl => { const groupId = groupEl.querySelector('id').textContent; groupEl.querySelectorAll('TransitionRule').forEach(ruleRefEl => { const ruleIdEl = ruleRefEl.querySelector('transitionRuleId'); if (ruleIdEl) { const ruleId = ruleIdEl.textContent; const transition = node.transitions.find(t => t.id === ruleId); if (transition) transition.turnGroupId = groupId; } }); }); });
            xmlDoc.querySelectorAll('RegularTrafficLightNetwork').forEach(netEl => { const nodeId = netEl.querySelector('regularNodeId').textContent; const config = { nodeId: nodeId, schedule: [], lights: {}, timeShift: 0 }; const timeShiftEl = netEl.querySelector('scheduleTimeShift'); if (timeShiftEl) { config.timeShift = parseFloat(timeShiftEl.textContent) || 0; } netEl.querySelectorAll('TrafficLight').forEach(lightEl => { const lightId = lightEl.querySelector('id').textContent; const turnTRGroupIds = Array.from(lightEl.querySelectorAll('turnTRGroupId')).map(id => id.textContent); config.lights[lightId] = { id: lightId, turnTRGroupIds: turnTRGroupIds }; }); netEl.querySelectorAll('Schedule > TimePeriods > TimePeriod').forEach(periodEl => { const period = { duration: parseFloat(periodEl.querySelector('duration').textContent), signals: {} }; periodEl.querySelectorAll('TrafficLightSignal').forEach(sigEl => { const lightId = sigEl.querySelector('trafficLightId').textContent; const signal = sigEl.querySelector('signal').textContent; const light = config.lights[lightId]; if (light) { light.turnTRGroupIds.forEach(groupId => { period.signals[groupId] = signal; }); } }); config.schedule.push(period); }); trafficLights.push(new TrafficLightController(config)); });
            xmlDoc.querySelectorAll('Origins > Origin').forEach(originEl => {
                const originNodeId = originEl.querySelector('originNodeId').textContent;
                const periods = [];
                originEl.querySelectorAll('TimePeriods > TimePeriod').forEach(timePeriodEl => {
                    const periodConfig = {
                        duration: parseFloat(timePeriodEl.querySelector('duration').textContent),
                        numVehicles: parseInt(timePeriodEl.querySelector('numberOfVehicles').textContent, 10),
                        destinations: [],
                        vehicleProfiles: [],
                        stops: [] // --- [修改] 新增 stops 陣列
                    };

                    timePeriodEl.querySelectorAll('Destinations > Destination').forEach(destEl => {
                        periodConfig.destinations.push({ weight: parseFloat(destEl.querySelector('weight').textContent), destinationNodeId: destEl.querySelector('destinationNodeId').textContent });
                    });

                    // --- [修正] 解析 IntermediateStops ---
                    // 使用 getElementsByTagName 忽略 namespace 前綴 (tm:)
                    const stopsElList = timePeriodEl.getElementsByTagName('IntermediateStops');
                    // 兼容有 namespace 的情況，若找不到則嘗試帶 prefix (雖 getElementsByTagName 通常不分，但部分瀏覽器實作可能有異)
                    const stopsEl = stopsElList.length > 0 ? stopsElList[0] : timePeriodEl.getElementsByTagName('tm:IntermediateStops')[0];

                    if (stopsEl) {
                        // 獲取所有 Stop 子元素 (忽略層級深淺，通常 Stop 是直接子節點)
                        // 若結構固定，用 children 遍歷最保險
                        const stopNodes = stopsEl.children;

                        for (let k = 0; k < stopNodes.length; k++) {
                            const stopEl = stopNodes[k];
                            // 忽略非 Element 節點
                            if (stopEl.nodeType !== 1) continue;

                            // 輔助函數：讀取值 (兼容 tm: 前綴)
                            const getVal = (tag) => {
                                const els = stopEl.getElementsByTagName(tag);
                                return els.length > 0 ? els[0].textContent :
                                    (stopEl.getElementsByTagName('tm:' + tag)[0]?.textContent);
                            };

                            const pId = getVal('parkingLotId');
                            const prob = getVal('probability');
                            const dur = getVal('duration');

                            if (pId) {
                                periodConfig.stops.push({
                                    parkingLotId: pId,
                                    probability: prob ? parseFloat(prob) : 100,
                                    duration: dur ? parseFloat(dur) * 60 : 300 // 單位為分鐘，轉為秒；預設 5 分鐘 (300秒)
                                });
                            }
                        }
                    }
                    // -------------------------------------

                    timePeriodEl.querySelectorAll('VehicleProfiles > VehicleProfile').forEach(profEl => {
                        const driverParams = profEl.querySelector('Parameters');
                        periodConfig.vehicleProfiles.push({
                            weight: parseFloat(profEl.querySelector('weight').textContent),
                            length: parseFloat(profEl.querySelector('RegularVehicle > length').textContent),
                            width: parseFloat(profEl.querySelector('RegularVehicle > width').textContent),
                            params: {
                                maxSpeed: parseFloat(driverParams.querySelector('maxSpeed').textContent),
                                maxAcceleration: parseFloat(driverParams.querySelector('maxAcceleration').textContent),
                                comfortDeceleration: parseFloat(driverParams.querySelector('comfortDeceleration').textContent),
                                minDistance: parseFloat(driverParams.querySelector('minDistance').textContent),
                                desiredHeadwayTime: parseFloat(driverParams.querySelector('desiredHeadwayTime').textContent)
                            }
                        });
                    });
                    periods.push(periodConfig);
                });
                if (periods.length > 0) {
                    spawners.push({ originNodeId, periods });
                }
            });
            xmlDoc.querySelectorAll('Agents > Vehicles > RegularVehicle').forEach(vehicleEl => { const driverParamsEl = vehicleEl.querySelector('Parameters'); const locationEl = vehicleEl.querySelector('LinkLocation'); if (!driverParamsEl || !locationEl) return; const staticVehicle = { profile: { length: parseFloat(vehicleEl.querySelector('length').textContent), width: parseFloat(vehicleEl.querySelector('width').textContent), params: { maxSpeed: parseFloat(driverParamsEl.querySelector('maxSpeed').textContent), maxAcceleration: parseFloat(driverParamsEl.querySelector('maxAcceleration').textContent), comfortDeceleration: parseFloat(driverParamsEl.querySelector('comfortDeceleration').textContent), minDistance: parseFloat(driverParamsEl.querySelector('minDistance').textContent), desiredHeadwayTime: parseFloat(driverParamsEl.querySelector('desiredHeadwayTime').textContent), } }, initialState: { distanceOnPath: parseFloat(locationEl.querySelector('position').textContent), speed: parseFloat(vehicleEl.querySelector('speed').textContent) }, startLinkId: locationEl.querySelector('linkId').textContent, startLaneIndex: parseInt(locationEl.querySelector('laneIndex').textContent, 10), destinationNodeId: vehicleEl.querySelector('CompositeDriver > destinationNodeId').textContent }; staticVehicles.push(staticVehicle); });
            xmlDoc.querySelectorAll('LinkAverageTravelSpeedMeter').forEach(meterEl => { const id = meterEl.querySelector('id').textContent; const name = meterEl.querySelector('name').textContent; const linkId = meterEl.querySelector('linkId').textContent; const position = parseFloat(meterEl.querySelector('position').textContent); const link = links[linkId]; if (!link) return; const numLanes = Object.keys(link.lanes).length; let refPath = []; const laneEntries = Object.values(link.lanes).sort((a, b) => a.index - b.index); if (laneEntries.length > 0) { refPath = laneEntries[0].path; } const posData = getPointAtDistanceAlongPath(refPath, position); if (posData) { const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5; const meterPosition = Geom.Vec.add(posData.point, Geom.Vec.scale(posData.normal, roadCenterlineOffset)); speedMeters.push({ id, name, linkId, position, numLanes, x: meterPosition.x, y: meterPosition.y, angle: posData.angle }); } });
            xmlDoc.querySelectorAll('SectionAverageTravelSpeedMeter').forEach(meterEl => { const id = meterEl.querySelector('id').textContent; const name = meterEl.querySelector('name').textContent; const linkId = meterEl.querySelector('linkId').textContent; const endPosition = parseFloat(meterEl.querySelector('position').textContent); const length = parseFloat(meterEl.querySelector('sectionLength').textContent); const startPosition = endPosition - length; const link = links[linkId]; if (!link) return; let refPath = []; const laneEntries = Object.values(link.lanes).sort((a, b) => a.index - b.index); if (laneEntries.length > 0) { refPath = laneEntries[0].path; } const startPosData = getPointAtDistanceAlongPath(refPath, startPosition); const endPosData = getPointAtDistanceAlongPath(refPath, endPosition); if (startPosData && endPosData) { const numLanes = Object.keys(link.lanes).length; const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5; const startMarkerPos = Geom.Vec.add(startPosData.point, Geom.Vec.scale(startPosData.normal, roadCenterlineOffset)); const endMarkerPos = Geom.Vec.add(endPosData.point, Geom.Vec.scale(endPosData.normal, roadCenterlineOffset)); sectionMeters.push({ id, name, linkId, length, startPosition, endPosition, startX: startMarkerPos.x, startY: startMarkerPos.y, startAngle: startPosData.angle, endX: endMarkerPos.x, endY: endMarkerPos.y, endAngle: endPosData.angle, }); } });

            // --- Parse Background Images ---
            xmlDoc.querySelectorAll('Background > Tile').forEach(tileEl => { const rect = tileEl.querySelector('Rectangle'); const start = rect.querySelector('Start'); const end = rect.querySelector('End'); const imageEl = tileEl.querySelector('Image'); const p1x = parseFloat(start.querySelector('x').textContent); const p1y = -parseFloat(start.querySelector('y').textContent); const p2x = parseFloat(end.querySelector('x').textContent); const p2y = -parseFloat(end.querySelector('y').textContent); const x = Math.min(p1x, p2x); const y = Math.min(p1y, p2y); const width = Math.abs(p2x - p1x); const height = Math.abs(p2y - p1y); const saturationEl = tileEl.querySelector('saturation'); const opacity = saturationEl ? parseFloat(saturationEl.textContent) / 100 : 1.0; const type = imageEl.querySelector('type').textContent.toUpperCase(); const mimeType = imageTypeMap[type] || 'png'; const base64Data = imageEl.querySelector('binaryData').textContent.replace(/\s/g, ''); const img = new Image(); const p = new Promise((imgResolve, imgReject) => { img.onload = () => imgResolve(img); img.onerror = () => imgReject(); }); imagePromises.push(p); img.src = `data:image/${mimeType};base64,${base64Data}`; backgroundTiles.push({ image: img, x, y, width, height, opacity }); });

            // --- Parse Parking Lots (新增功能) ---
            const parkingLots = [];
            xmlDoc.querySelectorAll('ParkingLots > ParkingLot').forEach(lotEl => {
                const id = lotEl.querySelector('id')?.textContent || `parking_${parkingLots.length}`;
                const name = lotEl.querySelector('name')?.textContent || '';

                // 1. 解析邊界
                const boundary = [];
                lotEl.querySelectorAll('Boundary > Point').forEach(p => {
                    boundary.push({
                        x: parseFloat(p.querySelector('x').textContent),
                        y: -parseFloat(p.querySelector('y').textContent) // 注意 Y 軸反轉
                    });
                });

                // 2. 解析出入口
                const gates = [];
                lotEl.querySelectorAll('ParkingGates > ParkingGate').forEach(gateEl => {
                    const gId = gateEl.querySelector('id')?.textContent;
                    const gType = gateEl.querySelector('gateType')?.textContent || 'bidirectional';

                    const geoEl = gateEl.querySelector('Geometry');
                    if (geoEl) {
                        // [修正] 解析幾何參數
                        const gx_tl = parseFloat(geoEl.querySelector('x').textContent);
                        const gy_tl = -parseFloat(geoEl.querySelector('y').textContent); // Y 軸反轉
                        const gw = parseFloat(geoEl.querySelector('width').textContent);
                        const gh = parseFloat(geoEl.querySelector('height').textContent);
                        let rawRotation = parseFloat(geoEl.querySelector('rotation').textContent);

                        // [修正] 角度轉為弧度 (XML 為度，順時針)
                        const gr = rawRotation * (Math.PI / 180.0);

                        // [修正] 計算中心點。XML 座標 (gx_tl, gy_tl) 是左上角，且旋轉是以該點為中心。
                        // 我們在模擬器中需要中心座標，以便 2D/3D 繪製對齊。
                        const cos = Math.cos(gr);
                        const sin = Math.sin(gr);
                        const cx = gx_tl + (gw / 2) * cos - (gh / 2) * sin;
                        const cy = gy_tl + (gw / 2) * sin + (gh / 2) * cos;

                        gates.push({
                            id: gId,
                            type: gType.toLowerCase(),
                            x: cx,
                            y: cy,
                            width: gw,
                            height: gh,
                            rotation: gr,
                            connector: null
                        });
                    }
                });


                // 3. 計算出入口連接道路 (30公尺內)
                gates.forEach(gate => {
                    let minDst = Infinity;
                    let bestPoint = null;
                    let bestLinkId = null;
                    let bestS = null;

                    // 遍歷所有道路尋找最近點
                    Object.values(links).forEach(link => {
                        const lanes = Object.values(link.lanes);
                        if (lanes.length === 0) return;

                        // [修正]：遍歷「每一條車道」，找出離 Gate 最近的那一條
                        // 原本代碼是 const path = lanes[0].path; 這會導致強制連到左側車道
                        lanes.forEach(lane => {
                            const path = lane.path;
                            const best = getClosestPointOnPathWithDistance(path, { x: gate.x, y: gate.y });

                            if (best && best.dist < minDst) {
                                minDst = best.dist;
                                bestPoint = { x: best.x, y: best.y };
                                bestLinkId = link.id;
                                bestS = best.s;
                            }
                        });
                    });

                    // 限制 30 公尺內
                    if (minDst <= 30 && bestPoint && typeof bestS === 'number') {
                        gate.connector = {
                            x1: gate.x, y1: gate.y, // Gate 座標
                            x2: bestPoint.x, y2: bestPoint.y, // 道路上的連接點 (現在會是最近的車道)
                            linkId: bestLinkId,
                            distance: bestS,
                            offset: minDst
                        };
                    }
                });

                // 解析車位數量
                const carCapacity = parseInt(lotEl.querySelector('carCapacity')?.textContent || '0', 10);
                const motoCapacity = parseInt(lotEl.querySelector('motoCapacity')?.textContent || '0', 10);

                // 4. 預先計算停車格位陣列 (供車輛停放使用)
                const slots = [];
                if (carCapacity > 0 && boundary.length >= 3) {
                    const SLOT_WIDTH = 2.5;
                    const SLOT_LENGTH = 5.5;
                    const SLOT_GAP = 0.1;

                    // 計算邊界框
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    boundary.forEach(p => {
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.y > maxY) maxY = p.y;
                    });

                    const lotWidth = maxX - minX;
                    const lotHeight = maxY - minY;
                    const isHorizontal = lotWidth >= lotHeight;
                    const slotW = isHorizontal ? SLOT_WIDTH : SLOT_LENGTH;
                    const slotH = isHorizontal ? SLOT_LENGTH : SLOT_WIDTH;

                    // 輔助函式：檢查矩形是否在多邊形內
                    function isSlotInsidePoly(sx, sy, sw, sh, poly) {
                        const corners = [
                            { x: sx, y: sy },
                            { x: sx + sw, y: sy },
                            { x: sx + sw, y: sy + sh },
                            { x: sx, y: sy + sh }
                        ];
                        return corners.every(c => Geom.Utils.isPointInPolygon(c, poly));
                    }

                    // 遍歷生成格位
                    for (let row = 0; slots.length < carCapacity; row++) {
                        const sy = minY + SLOT_GAP + row * (slotH + SLOT_GAP);
                        if (sy + slotH > maxY) break;
                        for (let col = 0; slots.length < carCapacity; col++) {
                            const sx = minX + SLOT_GAP + col * (slotW + SLOT_GAP);
                            if (sx + slotW > maxX) break;
                            if (isSlotInsidePoly(sx, sy, slotW, slotH, boundary)) {
                                // 格位中心與角度
                                const cx = sx + slotW / 2;
                                const cy = sy + slotH / 2;
                                const angle = isHorizontal ? Math.PI / 2 : 0; // 車頭方向
                                slots.push({
                                    x: cx,
                                    y: cy,
                                    width: slotW,
                                    height: slotH,
                                    angle: angle,
                                    occupied: false,
                                    vehicleId: null
                                });
                            }
                        }
                    }
                }

                parkingLots.push({ id, name, boundary, gates, carCapacity, motoCapacity, slots });
            });

            Promise.all(imagePromises).then(() => {
                resolve({
                    links, nodes, spawners, trafficLights, staticVehicles, speedMeters, sectionMeters,
                    parkingLots,
                    bounds: { minX, minY, maxX, maxY },
                    pathfinder: new Pathfinder(links, nodes),
                    backgroundTiles
                });
            }).catch(() => reject(new Error(translations[currentLang].imageLoadError)));
        });
    }
});
