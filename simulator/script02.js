// --- START OF FILE script02.js ---

document.addEventListener('DOMContentLoaded', () => {
    // --- I18N Setup ---
    const translations = {
        'zh-Hant': {
            appTitle: 'simTrafficFlow',
            selectFileLabel: '路網檔案',
            // --- 新增/更新以下兩行 ---
            loadSceneLabel: '場景',
            canvasPlaceholder: '請從上方載入路網檔案開始模擬',
            // -----------------------
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
            layerNone: '均無',
            lblPoint: '定點',    // 或 'Point'
            lblSection: '區間',  // 或 'Section'
            lblDetector: '偵測器' // 或 'Detectors'
        },
        'en': {
            appTitle: 'simTrafficFlow (2D/3D)',
            selectFileLabel: 'Select Network File:',
            // --- 新增/更新以下兩行 ---
            loadSceneLabel: 'Scene',
            canvasPlaceholder: 'Please load a network file from above to start.',
            // -----------------------
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
            lblLights: 'Lights',
            lblFlyover: 'Flyover',
            lblDrone: 'Drone',
            lblPoint: 'Point',
            lblSection: 'Section',
            lblDetector: 'Detector'
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

            if (isSplit && !wasSplitActive) {
                syncRotationToggle.checked = true;
                isRotationSyncEnabled = true;
                splitStartAzimuth = get3DAzimuth();
                has3DHeadingChangedSinceSplit = false;
            }

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
                sync2DRotationFrom3D();
            }
        }

        wasSplitActive = isSplit;

        updateDisplayButtons();

        // --- 關鍵修改：強制觸發 Resize 以更新畫布大小 ---
        requestAnimationFrame(() => {
            onWindowResize();
        });

        if (isDisplay2D && !isRunning) redraw2D();

        // --- 關鍵修改：若進入 3D 模式且迴圈未啟動，立即啟動迴圈 ---
        if (isDisplay3D) {
            update3DVisibility();
            updateLayerVisibility();

            // 確保 OrbitControls 等待更新，即使模擬暫停
            if (!animationFrameId) {
                lastTimestamp = performance.now();
                animationFrameId = requestAnimationFrame(simulationLoop);
            }
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
    // ★★★ 新增這行：用來儲存所有行人號誌的參照，以便 update 迴圈使用 ★★★
    let pedestrianMeshes = [];

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

    // --- Drive Mode Variables ---
    let driveController = null;
    const driveToggle = document.getElementById('driveToggle');
    const hudElement = document.getElementById('drive-hud');

    // --- Police Mode Variables ---
    let policeController = null;
    const policeToggle = document.getElementById('policeToggle');

    // --- AI Mode Variables ---
    let aiController = null;
    const aiToggle = document.getElementById('aiToggle');
    const aiLearningToggle = document.getElementById('aiLearningToggle');
    const aiCoopToggle = document.getElementById('aiCoopToggle');
    const aiShowActionToggle = document.getElementById('aiShowActionToggle');
    const btnExportAI = document.getElementById('btnExportAI');
    const fileImportAI = document.getElementById('fileImportAI');

    // --- City Generation Variables ---
    let cityGroup = new THREE.Group(); // 裝載所有城市物件
    let customModelsGroup = new THREE.Group();
    let cloudGroup = new THREE.Group(); // ★ [新增] 雲朵群組
    // --- 新增：城市動畫物件列表 ---
    let animatedCityObjects = [];
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
    const aiShowInfoToggle = document.getElementById('aiShowInfoToggle');
    if (aiShowInfoToggle) {
        aiShowInfoToggle.addEventListener('change', (e) => {
            if (aiController) {
                aiController.showOverlay = e.target.checked;
                if (!isRunning) redraw2D(); // 暫停時立即更新
            }
        });
    }

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

    const sceneFileInput = document.getElementById('sceneFileInput');
    if (sceneFileInput) {
        // 移除舊的監聽器以免重複綁定 (如果有的話)
        sceneFileInput.removeEventListener('change', handleSceneFileSelect);
        sceneFileInput.addEventListener('change', handleSceneFileSelect);
    }
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
    canvas2D.addEventListener('mousedown', (e) => {
        const rect = canvas2D.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // ★★★ [新增] 優先處理 Optimizer 的 Overlay 拖曳 ★★★
        if (typeof optimizerController !== 'undefined' && optimizerController.isActive) {
            // 如果點擊了資訊卡，攔截事件，不進行地圖拖曳或 Picking
            if (optimizerController.handleOverlayMouseDown(mouseX, mouseY)) {
                return;
            }

            // 保持原有的路徑 Picking 邏輯 (worldX, worldY)
            const worldPos = screenToWorld2D(mouseX, mouseY);
            if (optimizerController.handleMouseDown(worldPos.x, worldPos.y)) {
                return;
            }
        }

        // ★★★ 修正重點：使用 screenToWorld2D 來獲取正確的世界座標 ★★★
        // 這會自動處理 Pan, Scale 以及 Rotation (旋轉)
        const worldPos = screenToWorld2D(mouseX, mouseY);
        const worldX = worldPos.x;
        const worldY = worldPos.y;

        // 優先檢查：是否點擊了 AI 或 優化器的互動元素？
        if (typeof optimizerController !== 'undefined' && optimizerController.isActive) {
            // 將正確的世界座標傳給優化控制器
            if (optimizerController.handleMouseDown(worldX, worldY)) {
                // 如果回傳 true，代表點到了路口，直接返回，不觸發地圖拖曳
                return;
            }
        }

        // 如果是員警模式，優先處理路口選擇
        if (policeToggle && policeToggle.checked && policeController) {
            // 呼叫 Police Controller 判定
            if (simulation && simulation.network) {
                policeController.handleMapClick(worldX, worldY, simulation.network.nodes);
                if (!isRunning) redraw2D(); // 重繪以顯示紅圈
            }
        }

        // ★★★ 優先檢查：是否點擊了 AI 資訊浮窗？ (這部分維持原樣) ★★★
        if (aiController && aiController.isActive) {
            // 如果點到了浮窗，handleMouseDown 會回傳 true
            if (aiController.handleMouseDown(mouseX, mouseY)) {
                return;
            }
        }

        // 呼叫原有的 Pan Start (地圖拖曳)
        handlePanStart2D(e);
    });

    canvas2D.addEventListener('mousemove', (e) => {
        const rect = canvas2D.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // ★★★ [新增] 處理 Overlay 拖曳移動 ★★★
        if (typeof optimizerController !== 'undefined' && optimizerController.isActive) {
            if (optimizerController.handleOverlayMouseMove(mouseX, mouseY)) {
                return;
            }
        }

        // ★★★ 優先檢查：是否正在拖曳 AI 資訊浮窗？ ★★★
        if (aiController && aiController.isActive) {
            if (aiController.handleMouseMove(mouseX, mouseY)) {
                if (!isRunning) redraw2D(); // 暫停時需手動重繪以顯示拖曳效果
                return; // 阻止地圖移動
            }
        }

        handlePanMove2D(e);
    });

    canvas2D.addEventListener('mouseup', (e) => {
        // ★★★ [新增] 釋放 Overlay 拖曳 ★★★
        if (typeof optimizerController !== 'undefined' && optimizerController.isActive) {
            if (optimizerController.handleOverlayMouseUp()) {
                return;
            }
        }
        // ★★★ 釋放浮窗拖曳 ★★★
        if (aiController) {
            aiController.handleMouseUp();
        }

        handlePanEnd2D();
    });

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
    if (droneToggle) {
        droneToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (driveToggle) {
                    driveToggle.checked = false;
                    if (hudElement) hudElement.style.display = 'none';
                    if (driveController) driveController.reset();
                }
                if (policeToggle) {
                    policeToggle.checked = false;
                    if (policeController) policeController.setActive(false);
                }
                if (aiToggle) {
                    aiToggle.checked = false;
                    if (aiController) aiController.setActive(false);
                }
            }
            setDroneMode(e.target.checked);
        });
    }

    // 初始化員警控制器 (預留空物件供全域參照)
    policeController = new PoliceController({ trafficLights: [], network: null });

    // 初始化 AI 控制器
    aiController = new AIController({ trafficLights: [], network: null });

    // 員警模式切換
    if (policeToggle) {
        policeToggle.addEventListener('change', (e) => {
            const active = e.target.checked;

            if (active) {
                // 互斥邏輯：關閉其他模式
                if (aiToggle) { aiToggle.checked = false; aiController.setActive(false); }
                if (driveToggle) driveToggle.checked = false;
                if (driveController) driveController.reset();
                if (hudElement) hudElement.style.display = 'none';

                if (flyoverToggle) { flyoverToggle.checked = false; setFlyoverMode(false); }
                if (droneToggle) { droneToggle.checked = false; setDroneMode(false); }
                if (isChaseActive) stopChaseMode();

                // 檢查是否已載入模擬
                if (!simulation) {
                    alert("請先載入路網檔案！");
                    e.target.checked = false;
                    return;
                }

                // 更新 Controller 的參照 (確保指向最新的 simulation)
                policeController.simulation = simulation;
                policeController.setActive(true);

            } else {
                policeController.setActive(false);
            }
        });
    }

    // 監聽器：互斥開關
    if (driveToggle) {
        driveToggle.addEventListener('change', (e) => {
            const active = e.target.checked;

            // 互斥邏輯
            if (active) {
                if (aiToggle) { aiToggle.checked = false; aiController.setActive(false); }
                if (flyoverToggle) flyoverToggle.checked = false;
                setFlyoverMode(false);
                if (droneToggle) droneToggle.checked = false;
                setDroneMode(false);
                if (policeToggle) {
                    policeToggle.checked = false;
                    if (policeController) policeController.setActive(false);
                }
                if (isChaseActive) stopChaseMode();

                // 顯示 HUD
                if (hudElement) hudElement.style.display = 'block';

                // 如果尚未載入模擬，提示
                if (!simulation) {
                    alert("請先載入路網檔案！");
                    e.target.checked = false;
                    return;
                }

                // 更新控制器參考
                if (!driveController) {
                    driveController = new DriveController(simulation, camera, null);
                } else {
                    driveController.simulation = simulation;
                    driveController.camera = camera;
                }
                driveController.reset();
                driveController.showHUDMessage("請點擊選擇車輛", "info");

            } else {
                // 關閉駕駛模式
                if (hudElement) hudElement.style.display = 'none';
                if (driveController) driveController.reset();

                // 恢復相機控制
                if (controls) {
                    controls.enabled = true;
                    if (camera) camera.up.set(0, 1, 0);
                }
            }
        });
    }

    // 修改原有的 flyover 監聽器，加入關閉 driveToggle 的邏輯
    if (flyoverToggle) {
        flyoverToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (driveToggle) {
                    driveToggle.checked = false;
                    if (hudElement) hudElement.style.display = 'none';
                    if (driveController) driveController.reset();
                }
                if (policeToggle) {
                    policeToggle.checked = false;
                    if (policeController) policeController.setActive(false);
                }
                if (aiToggle) {
                    aiToggle.checked = false;
                    if (aiController) aiController.setActive(false);
                }
            }
            setFlyoverMode(e.target.checked);
        });
    }

    // AI 模式切換
    if (aiToggle) {
        aiToggle.addEventListener('change', (e) => {
            const active = e.target.checked;

            if (active) {
                // 互斥：關閉其他模式
                if (policeToggle) { policeToggle.checked = false; policeController.setActive(false); }
                if (driveToggle) { driveToggle.checked = false; if (driveController) driveController.reset(); }
                if (hudElement) hudElement.style.display = 'none';

                if (!simulation) {
                    alert("請先載入路網！");
                    e.target.checked = false;
                    return;
                }

                aiController.simulation = simulation;
                aiController.setActive(true);
            } else {
                aiController.setActive(false);
            }
        });
    }

    // --- Optimizer Toggle ---
    const optToggle = document.getElementById('optToggle');

    if (optToggle) {
        optToggle.addEventListener('change', (e) => {
            const active = e.target.checked;

            if (active) {
                // 互斥邏輯：關閉 AI、員警、駕駛等模式
                if (aiToggle) { aiToggle.checked = false; aiController.setActive(false); }
                if (policeToggle) { policeToggle.checked = false; policeController.setActive(false); }
                if (driveToggle) { driveToggle.checked = false; if (driveController) driveController.reset(); }
                if (hudElement) hudElement.style.display = 'none';

                // 檢查是否已載入路網
                if (!simulation) {
                    alert("請先載入路網檔案！");
                    e.target.checked = false;
                    return;
                }

                // 確保控制器拿到最新的 simulation 參照
                optimizerController.setSimulation(simulation);
                optimizerController.setActive(true);
            } else {
                optimizerController.setActive(false);
            }

            // 若在暫停狀態，觸發重繪以更新面板
            if (!isRunning && isDisplay2D) redraw2D();
        });
    }

    // AI 匯出入按鈕
    if (btnExportAI) {
        btnExportAI.addEventListener('click', () => {
            if (aiController) aiController.exportModel();
        });
    }
    if (fileImportAI) {
        fileImportAI.addEventListener('change', (e) => {
            if (e.target.files.length > 0 && aiController) {
                aiController.importModel(e.target.files[0]);

                // 匯入後，確保學習開關與協作開關的狀態與 UI 同步
                aiController.setLearningEnabled(aiLearningToggle.checked);
                aiController.setCooperative(aiCoopToggle.checked); // 同步協作狀態
            }
        });
    }

    // ★★★ 新增：學習開關監聽 ★★★
    if (aiLearningToggle) {
        aiLearningToggle.addEventListener('change', (e) => {
            if (aiController) {
                aiController.setLearningEnabled(e.target.checked);
            }
        });
    }

    // ★★★ 新增：協作模式開關 ★★★
    if (aiCoopToggle) {
        aiCoopToggle.addEventListener('change', (e) => {
            if (aiController) {
                aiController.setCooperative(e.target.checked);
            }
        });
    }

    if (aiShowActionToggle) {
        aiShowActionToggle.addEventListener('change', () => {
            if (isDisplay2D && !isRunning) redraw2D(); // 暫停時切換可立即看到效果
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

        // 1. 取得目標車輛
        const v = simulation.vehicles.find(vv => vv.id === chaseVehicleId);
        if (!v) {
            stopChaseMode();
            return;
        }

        // 2. 計算目標位置
        const fx = Math.cos(v.angle);
        const fz = Math.sin(v.angle);

        // 參數：chaseForwardOffset (相機在車身後方多少), chaseLookAhead (看向車身前方多少)
        // 注意：這裡使用 v.angle 計算出的向量是車頭方向
        // 若要相機在「車後」，應該是減去方向向量；若要「車頂/車頭視角」，則調整參數
        // 假設 chaseForwardOffset 是正值且放在 Vector3 計算中代表 offset
        // 原始邏輯：
        // desiredPos = v + forward * chaseForwardOffset
        // desiredLookAt = v + forward * chaseLookAhead

        // *修正建議*：為了讓視角更穩定，我們直接計算剛性位置
        const desiredPos = new THREE.Vector3(
            v.x + fx * chaseForwardOffset,
            chaseEyeHeight, // 高度
            v.y + fz * chaseForwardOffset
        );

        const desiredLookAt = new THREE.Vector3(
            v.x + fx * chaseLookAhead,
            chaseEyeHeight, // 視線高度通常與相機等高或略低
            v.y + fz * chaseLookAhead
        );

        // --- [關鍵修改] 移除 Lerp 插值，消除殘影 ---

        // 方案 A: 完全剛性鎖定 (最穩定，無殘影)
        camera.position.copy(desiredPos);
        camera.lookAt(desiredLookAt);

        // 同步更新平滑變數，以免未來切換模式時跳動
        chaseSmoothedPos.copy(desiredPos);
        chaseSmoothedLookAt.copy(desiredLookAt);

        /* 
        // 方案 B (備選): 如果您堅持要有一點點慣性，請將 Lerp 係數提高到 0.8 以上，
        // 並針對 LookAt 使用更強的鎖定，只讓 Position 有微小延遲。
        // 但為了精準模擬，強烈建議使用上方的方案 A。
        */
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

        // 新增邏輯
        if (driveToggle && driveToggle.checked) {
            if (driveController) driveController.setTarget(vehicleId);
            return;
        }

        startChaseMode(vehicleId);
    }



    window.addEventListener('resize', onWindowResize);

    // --- Initialization ---
    init3D();
    resizeCanvas2D();
    createPegmanUI();

    // ★★★ [新增] 自動偵測系統語言邏輯 ★★★
    const browserLang = navigator.language || navigator.userLanguage;
    // 判斷邏輯：只要開頭是 'zh' (包含 zh-TW, zh-CN, zh-HK, zh-SG) 都設為中文，否則英文
    if (browserLang && browserLang.toLowerCase().startsWith('zh')) {
        currentLang = 'zh-Hant';
    } else {
        currentLang = 'en';
    }

    // 同步更新下拉選單的顯示狀態
    if (langSelector) {
        langSelector.value = currentLang;
    }

    // 套用語言
    setLanguage(currentLang);
    // ★★★ 結束 ★★★

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

        // 1. 繪製地圖與車輛 (這部分有 transform)
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

        // =========================================================
        // ★★★ 【新增區塊】：繪製 AI Action 文字 ★★★
        // =========================================================
        if (aiController && aiController.isActive && aiShowActionToggle && aiShowActionToggle.checked) {

            // 定義動作名稱映射
            const actionNames = {
                0: "KEEP",   // 保持當前綠燈
                1: "NEXT",   // 切換下一時相
                2: "DEF."    // 默認 (不安全時/黃紅燈)
            };

            // 設定文字樣式 (在 World Space 中)
            // 字體大小設為 6公尺 (World Unit)，這樣縮放地圖時文字會跟著變大變小
            ctx2D.font = "bold 6px 'Roboto Mono', monospace";
            ctx2D.textAlign = "center";
            ctx2D.textBaseline = "middle";

            // 遍歷所有有 AI 紀錄的路口
            for (const [nodeId, actionCode] of Object.entries(aiController.lastAction)) {
                const node = networkData.nodes[nodeId];
                if (node && node.polygon && node.polygon.length > 0) {

                    // 計算路口多邊形的中心點 (Centroid)
                    let cx = 0, cy = 0;
                    node.polygon.forEach(p => {
                        cx += p.x;
                        cy += p.y;
                    });
                    cx /= node.polygon.length;
                    cy /= node.polygon.length;

                    // 準備文字
                    const text = actionNames[actionCode] || "UNKNOWN";

                    // 繪製文字背景 (半透明黑底，增加可讀性)
                    ctx2D.fillStyle = "rgba(0, 0, 0, 0.4)";
                    // 概抓一個背景框大小
                    const textWidth = ctx2D.measureText(text).width;
                    const boxH = 8;
                    const boxW = textWidth + 4;
                    ctx2D.fillRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH);

                    // 繪製文字 (根據動作給不同顏色，半透明)
                    if (actionCode === 0) ctx2D.fillStyle = "rgba(100, 255, 100, 0.8)"; // Green for Keep
                    else if (actionCode === 1) ctx2D.fillStyle = "rgba(255, 100, 100, 0.8)"; // Red for Next
                    else ctx2D.fillStyle = "rgba(200, 200, 200, 0.6)"; // Gray for Default

                    ctx2D.fillText(text, cx, cy);
                }
            }
        }
        // =========================================================
        ctx2D.restore();
        // --- Restore 之後，座標系回到螢幕像素座標 ---

        // 2. 繪製 Overlays
        drawChaseVehicleOverlay2D();
        drawFlyoverOverlay2D();
        drawDroneOverlay2D();

        // 3. ★ [修正] 繪製員警標記，並傳入轉換函式
        if (policeController && policeToggle && policeToggle.checked) {
            // 傳入 worldToScreen2D 讓 controller 內部計算正確的螢幕位置
            policeController.draw(ctx2D, worldToScreen2D);
        }

        // ★★★ 新增：呼叫 AI 資訊浮窗繪製 ★★★
        // 確保 aiController 存在，且開關已開啟
        if (aiController && aiController.isActive && aiShowActionToggle && aiShowActionToggle.checked) {
            // 傳入 ctx2D, 座標轉換函式, 以及 scale (用於判斷是否顯示細節)
            aiController.drawOverlay(ctx2D, worldToScreen2D, scale);
        }

        // [新增] 繪製優化器的高亮框 (紅框)
        if (typeof optimizerController !== 'undefined' && optimizerController.isActive) {
            optimizerController.drawOverlay(ctx2D, worldToScreen2D, scale);
        }
        // ★★★ 結束新增 ★★★
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

        // 新增邏輯：如果是駕駛模式
        if (driveToggle && driveToggle.checked) {
            if (driveController) driveController.setTarget(vehicleId);
            return; // 攔截，不執行追蹤模式
        }

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

    // 輔助函數：計算路徑上的點 (從 parseTrafficModel 移出以便共用)
    function getPointAtDistanceAlongPath(path, distance) {
        let accumulatedLength = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            const segmentLength = Geom.Vec.dist(p1, p2);
            if (distance >= accumulatedLength && distance <= accumulatedLength + segmentLength) {
                const ratio = (distance - accumulatedLength) / segmentLength;
                const segmentVec = Geom.Vec.sub(p2, p1);
                const point = Geom.Vec.add(p1, Geom.Vec.scale(segmentVec, ratio));
                const normal = Geom.Vec.normalize(Geom.Vec.normal(segmentVec));
                const angle = Geom.Vec.angle(segmentVec);
                return { point, normal, angle };
            }
            accumulatedLength += segmentLength;
        }
        return null;
    }

    // 計算標線的四個角點 (用於 2D 與 3D)
    function calculateMarkingCorners(mark, netData) {
        // 情境 A: 自由模式 或 依附 Node (直接使用絕對座標與寬高)
        // 保持原本的旋轉矩形邏輯不變
        if (mark.isFree || mark.nodeId || (!mark.linkId && mark.x !== 0)) {
            const cx = mark.x;
            const cy = mark.y;
            const w = mark.width / 2;
            const l = (mark.type === 'stop_line' ? 0.5 : mark.length) / 2;
            const rot = (mark.rotation * Math.PI) / 180; // 轉為弧度

            const cos = Math.cos(rot);
            const sin = Math.sin(rot);

            // 回傳四個角點 (順時針: FrontLeft, FrontRight, BackRight, BackLeft)
            return [
                { x: cx + (l * cos - w * sin), y: cy + (l * sin + w * cos) },
                { x: cx + (l * cos + w * sin), y: cy + (l * sin - w * cos) },
                { x: cx + (-l * cos + w * sin), y: cy + (-l * sin - w * cos) },
                { x: cx + (-l * cos - w * sin), y: cy + (-l * sin + w * cos) }
            ];
        }

        // 情境 B: 依附 Link (修正版：貼合道路曲率)
        const link = netData.links[mark.linkId];
        if (!link || !mark.laneIndices || mark.laneIndices.length === 0) return null;

        // 取得車道資訊
        const lanes = Object.values(link.lanes).sort((a, b) => a.index - b.index);
        if (lanes.length === 0) return null;

        // 1. 計算左右邊界相對於路中心的偏移量
        let totalWidth = 0;
        lanes.forEach(l => totalWidth += l.width);

        const sortedIndices = mark.laneIndices.sort((a, b) => a - b);
        const minIdx = sortedIndices[0];
        const maxIdx = sortedIndices[sortedIndices.length - 1];

        let offsetStart = -totalWidth / 2;
        for (let i = 0; i < minIdx; i++) offsetStart += lanes[i].width;

        let offsetEnd = -totalWidth / 2;
        for (let i = 0; i <= maxIdx; i++) offsetEnd += lanes[i].width;

        // 2. 準備路徑參考 (使用第0條車道做為基準)
        // 假設 lane[0] 中心相對於路中心的偏移量
        const lane0Offset = -totalWidth / 2 + lanes[0].width / 2;
        const samplePath = lanes[0].path;

        // 3. 計算前緣 (Front) 座標
        // 這是標線在 position 的位置 (下游)
        const posFront = getPointAtDistanceAlongPath(samplePath, mark.position);
        if (!posFront) return null;

        // 將 Lane0 的點校正回 "路中心"
        const centerFront = Geom.Vec.add(posFront.point, Geom.Vec.scale(posFront.normal, -lane0Offset));
        const pFrontLeft = Geom.Vec.add(centerFront, Geom.Vec.scale(posFront.normal, offsetStart));
        const pFrontRight = Geom.Vec.add(centerFront, Geom.Vec.scale(posFront.normal, offsetEnd));

        // 4. 計算後緣 (Back) 座標 (修正點：重新採樣路徑，而非切線投影)
        // 這是標線在 position - length 的位置 (上游)
        const lengthVal = (mark.type === 'stop_line') ? 0.4 : mark.length;
        const distBack = Math.max(0, mark.position - lengthVal);

        const posBack = getPointAtDistanceAlongPath(samplePath, distBack);
        if (!posBack) return null;

        const centerBack = Geom.Vec.add(posBack.point, Geom.Vec.scale(posBack.normal, -lane0Offset));
        const pBackLeft = Geom.Vec.add(centerBack, Geom.Vec.scale(posBack.normal, offsetStart));
        const pBackRight = Geom.Vec.add(centerBack, Geom.Vec.scale(posBack.normal, offsetEnd));

        // 回傳順序需構成閉合多邊形 (FrontLeft -> FrontRight -> BackRight -> BackLeft)
        return [pFrontLeft, pFrontRight, pBackRight, pBackLeft];
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

        // --- 新增：繪製 Road Markings ---
        if (netData.roadMarkings) {
            netData.roadMarkings.forEach(mark => {
                const corners = calculateMarkingCorners(mark, netData);
                if (!corners) return;

                ctx2D.save();

                // 設定樣式
                if (mark.type === 'stop_line') {
                    ctx2D.strokeStyle = 'white';
                    ctx2D.lineWidth = 0.5 / scale; // 實線寬度
                    ctx2D.beginPath();
                    // 停止線通常只畫前端那一條，或是填滿一個細長矩形
                    ctx2D.moveTo(corners[0].x, corners[0].y);
                    ctx2D.lineTo(corners[1].x, corners[1].y);
                    ctx2D.lineTo(corners[2].x, corners[2].y);
                    ctx2D.lineTo(corners[3].x, corners[3].y);
                    ctx2D.closePath();
                    ctx2D.fillStyle = 'white';
                    ctx2D.fill();
                } else {
                    // 機車停等區 / 兩段式左轉 (空心框)
                    ctx2D.strokeStyle = 'white';
                    ctx2D.lineWidth = 0.3 / scale;
                    ctx2D.beginPath();
                    ctx2D.moveTo(corners[0].x, corners[0].y);
                    ctx2D.lineTo(corners[1].x, corners[1].y);
                    ctx2D.lineTo(corners[2].x, corners[2].y);
                    ctx2D.lineTo(corners[3].x, corners[3].y);
                    ctx2D.closePath();
                    ctx2D.stroke();
                }

                ctx2D.restore();
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

        // 1. 背景色 (天空藍)
        const skyColor = 0x87CEEB;
        scene.background = new THREE.Color(skyColor);
        scene.fog = new THREE.Fog(skyColor, 200, 5000);

        camera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 1, 10000);
        camera.position.set(0, 500, 500);
        camera.up.set(0, 1, 0);

        // 2. Renderer 設定
        renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        renderer.shadowMap.enabled = true;

        // ★★★ [優化] 改善顏色顯示 ★★★
        renderer.outputEncoding = THREE.sRGBEncoding;
        // 加入 Tone Mapping 以增加對比度，解決泛白問題
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;

        container3D.appendChild(renderer.domElement);
        renderer.domElement.addEventListener('click', handle3DVehiclePick);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.listenToKeyEvents(window);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;
        controls.keyPanSpeed = 20.0;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;

        controls.addEventListener('change', () => {
            if (!isDisplay2D || !isDisplay3D) return;
            if (!isRotationSyncEnabled) return;
            has3DHeadingChangedSinceSplit = true;
            sync2DRotationFrom3D();
            if (!isRunning) redraw2D();
        });

        // --- [關鍵修改] 光照設定 (增強對比度) ---

        // 1. 環境光：降低強度 (0.4 -> 0.3)，讓陰影更深一點
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(ambientLight);

        // 2. 半球光：降低強度 (0.8 -> 0.5)，這是導致泛白的主因
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        hemiLight.position.set(0, 200, 0);
        scene.add(hemiLight);

        // 3. 方向光：保持強度，製造主陰影
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(100, 500, 100);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 5000;
        const d = 2000;
        dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.bias = -0.0005;
        scene.add(dirLight);

        // --- [關鍵修改] 地面材質 (改用 Standard 材質以配合光照) ---
        const groundGeo = new THREE.PlaneGeometry(100000, 100000);

        // 改為 Standard 材質，並設定粗糙度(roughness)為 1.0 (不反光)
        // 顏色稍微調深一點 (0x666666 -> 0x555555)
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 1.0,
            metalness: 0.0
        });

        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        ground.receiveShadow = true;
        scene.add(ground);

        scene.add(networkGroup);
        scene.add(debugGroup);
        scene.add(signalPathsGroup);
        scene.add(trafficLightsGroup);
        scene.add(cityGroup);
        scene.add(basemapGroup);
        scene.add(customModelsGroup);

        scene.add(cloudGroup); // ★ [新增] 加入雲朵層
    }

    function onWindowResize() {
        resizeCanvas2D();

        if (camera && renderer && container3D) {
            // 確保取得正確的容器寬高
            const w = Math.max(1, container3D.clientWidth);
            const h = Math.max(1, container3D.clientHeight);

            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);

            // --- 關鍵修改：Resize 後立即重繪一幀，避免閃爍或黑屏 ---
            if (isDisplay3D && !isRunning) {
                renderer.render(scene, camera);
            }
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
        // --- 新增：掛載台灣式行人號誌 ---
        // 僅在有正面連結 (linkIdFront) 時建立，避免重複或背面無路的情況
        // 位置：號誌桿身 (x=0, z=0)，高度約 2.5m (離地)，角度與車輛號誌相同 (面向對街行人)
        // 註：車輛號誌是面向車輛 (rotateY(Math.PI))，行人號誌若要面向"平行車流"的對面，角度應相同。

        if (typeof PedestrianManager !== 'undefined') {
            // Front Pedestrian Light
            if (linkIdFront) {
                const pedGroupFront = PedestrianManager.createMesh();
                pedGroupFront.position.set(0, 2.5, 0.25);
                group.add(pedGroupFront);

                // ★ 修正：存入 pedestrianMeshes
                pedestrianMeshes.push({
                    type: 'pedestrian',
                    mesh: pedGroupFront,
                    nodeId: nodeId,
                    linkId: linkIdFront
                });
            }

            if (linkIdBack) {
                const pedGroupBack = PedestrianManager.createMesh();
                pedGroupBack.position.set(0, 2.5, -0.25);
                pedGroupBack.rotation.y = Math.PI;
                group.add(pedGroupBack);

                // ★ 修正：存入 pedestrianMeshes
                pedestrianMeshes.push({
                    type: 'pedestrian',
                    mesh: pedGroupBack,
                    nodeId: nodeId,
                    linkId: linkIdBack
                });
            }
        }
        // -----------------------------
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
        // ★★★ 新增這行：清空行人號誌陣列 ★★★
        pedestrianMeshes = [];

        // =================================================================
        // [修正] 統一柏油路面材質 (Asphalt)
        // =================================================================
        // 顏色：0x252525 (深灰色，模擬瀝青)
        // 粗糙度：0.9 (不反光，模擬路面質感)
        // =================================================================
        const asphaltMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.1,
            polygonOffset: true,
            polygonOffsetFactor: 1, // 推遠一點點，讓標線(Markings)更容易顯示在上面
            polygonOffsetUnits: 1
        });

        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const meterMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 });
        const sectionMat = new THREE.MeshBasicMaterial({ color: 0x32b4ef, transparent: true, opacity: 0.5 });

        // 停車場地板
        const parkingFloorMat = new THREE.MeshStandardMaterial({
            color: 0x9999aa,
            side: THREE.DoubleSide,
            roughness: 0.8
        });

        // 停車場連接面
        const parkingConnectorSurfaceMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            side: THREE.DoubleSide,
            roughness: 0.9
        });

        const connectorLineMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });

        const slotLineMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: 1
        });

        const upperFloorMat = new THREE.MeshStandardMaterial({
            color: 0x778899,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            roughness: 0.5
        });
        // --- 新增：建立 Road Markings 3D 物件 ---
        if (netData.roadMarkings) {
            const markingMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -2, // 確保畫在路面之上
                polygonOffsetUnits: 1
            });

            const roadMarkingLineMat = new THREE.LineBasicMaterial({
                color: 0xffffff,
                linewidth: 2,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: 1
            });

            netData.roadMarkings.forEach(mark => {
                const corners = calculateMarkingCorners(mark, netData);
                if (!corners) return;

                // 將 2D 點 (x, y) 轉為 3D 點 (x, 0.12, y)
                // 高度設為 0.12，略高於路面(0.1)
                const h = 0.12;
                const points3D = corners.map(p => to3D(p.x, p.y, h));

                if (mark.type === 'stop_line') {
                    // 停止線：實心矩形
                    const shape = new THREE.Shape();
                    shape.moveTo(corners[0].x, -corners[0].y); // 注意 3D 形狀 Y 軸反轉
                    shape.lineTo(corners[1].x, -corners[1].y);
                    shape.lineTo(corners[2].x, -corners[2].y);
                    shape.lineTo(corners[3].x, -corners[3].y);

                    const geom = new THREE.ShapeGeometry(shape);
                    geom.rotateX(-Math.PI / 2);
                    const mesh = new THREE.Mesh(geom, markingMat);
                    mesh.position.y = h;
                    networkGroup.add(mesh);
                } else {
                    // 機車停等區 / 兩段式左轉：線框
                    // 必須閉合
                    points3D.push(points3D[0]);
                    const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
                    const line = new THREE.Line(geometry, roadMarkingLineMat);
                    networkGroup.add(line);
                }
            });
        }

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

        // =================================================================
        // 1. Draw Links (Roads) - 使用 asphaltMat 且高度設為 0.1
        // =================================================================
        Object.values(netData.links).forEach(link => {
            if (link.geometry) {
                link.geometry.forEach(geo => {
                    if (geo.points.length < 3) return;
                    const shape = new THREE.Shape();
                    shape.moveTo(geo.points[0].x, -geo.points[0].y);
                    for (let i = 1; i < geo.points.length; i++) shape.lineTo(geo.points[i].x, -geo.points[i].y);
                    const geom = new THREE.ShapeGeometry(shape);
                    geom.rotateX(-Math.PI / 2);

                    // [修正] 使用統一材質
                    const mesh = new THREE.Mesh(geom, asphaltMat);
                    mesh.receiveShadow = true;

                    // [修正] 高度設為 0.1 (與路口一致)
                    mesh.position.y = 0.1;

                    networkGroup.add(mesh);
                });
            }
            // (分隔線繪製邏輯保持不變)
            if (link.dividingLines) {
                link.dividingLines.forEach(line => {
                    if (line.path.length < 2) return;
                    // 分隔線高度需略高於路面 (0.1 + 0.02)
                    const points = line.path.map(p => to3D(p.x, p.y, 0.12));
                    const geometry = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMesh = new THREE.Line(geometry, lineMat);
                    networkGroup.add(lineMesh);
                });
            }
        });

        // =================================================================
        // 2. Draw Nodes (Junctions) - 使用 asphaltMat 且高度設為 0.1
        // =================================================================
        Object.values(netData.nodes).forEach(node => {
            if (node.polygon && node.polygon.length >= 3) {
                const shape = new THREE.Shape();
                shape.moveTo(node.polygon[0].x, -node.polygon[0].y);
                for (let i = 1; i < node.polygon.length; i++) shape.lineTo(node.polygon[i].x, -node.polygon[i].y);
                const geom = new THREE.ShapeGeometry(shape);
                geom.rotateX(-Math.PI / 2);

                // [修正] 使用與道路完全相同的材質
                const mesh = new THREE.Mesh(geom, asphaltMat);
                mesh.receiveShadow = true;

                // [修正] 高度由原本的 0.2 降為 0.1，與道路平齊
                mesh.position.y = 0.1;

                networkGroup.add(mesh);
            }
            // (Signal paths visualization 保持不變)
            if (node.transitions) {
                node.transitions.forEach(transition => {
                    if (transition.bezier && transition.turnGroupId) {
                        const [p0, p1, p2, p3] = transition.bezier.points;
                        // 轉彎路徑線高度稍微提高到 0.5 避免被路面遮擋
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

        // --- 6. Road Markings (3D) ---
        if (netData.roadMarkings) {
            const whiteMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: 1
            });

            netData.roadMarkings.forEach(mk => {
                // [修正] 動態調整高度
                // 如果是 Link 上的標線，高度 0.12 (高於路面 0.10)
                // 如果是 Free 或 Node 上的標線 (通常在路口)，高度需 > 0.20 (高於路口 0.20)
                let zHeight = 0.12;
                if (mk.isFree || mk.nodeId) {
                    zHeight = 0.22;
                }

                // 處理旋轉：如果是自由模式，轉弧度
                let rotRadians = mk.rotation;
                if (mk.isFree) {
                    rotRadians = mk.rotation * (Math.PI / 180);
                }

                if (mk.type === 'stop_line') {
                    // 實心平面
                    const geo = new THREE.PlaneGeometry(mk.length, mk.width);
                    const mesh = new THREE.Mesh(geo, whiteMat);
                    mesh.position.set(mk.x, zHeight, mk.y);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.rotation.z = -rotRadians;
                    networkGroup.add(mesh);
                } else {
                    // 框線效果 (使用挖空的 Shape)
                    const shape = new THREE.Shape();
                    const w = mk.length / 2;
                    const h = mk.width / 2;

                    // 外框
                    shape.moveTo(-w, -h);
                    shape.lineTo(w, -h);
                    shape.lineTo(w, h);
                    shape.lineTo(-w, h);
                    shape.lineTo(-w, -h);

                    // 內框 (挖空)，線寬設為 0.2m
                    const lineW = 0.2;
                    // 確保不會因為標線太小而導致線寬出錯
                    if (w > lineW && h > lineW) {
                        const holePath = new THREE.Path();
                        holePath.moveTo(-w + lineW, -h + lineW);
                        holePath.lineTo(w - lineW, -h + lineW);
                        holePath.lineTo(w - lineW, h - lineW);
                        holePath.lineTo(-w + lineW, h - lineW);
                        holePath.lineTo(-w + lineW, -h + lineW);
                        shape.holes.push(holePath);
                    }

                    const geo = new THREE.ShapeGeometry(shape);
                    const mesh = new THREE.Mesh(geo, whiteMat);

                    mesh.position.set(mk.x, zHeight, mk.y);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.rotation.z = -rotRadians;
                    networkGroup.add(mesh);
                }
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

        // 判斷是否應該顯示建築
        const showBuildings = (mode === 'both' || mode === 'buildings');

        // 控制建築 (City)
        if (cityGroup) {
            cityGroup.visible = showBuildings;
        }

        // ★★★ [新增] 控制雲朵 (Cloud) ★★★
        // 邏輯：雲朵的可見性與建築同步 (有建築才有雲)
        if (cloudGroup) {
            cloudGroup.visible = showBuildings;
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

        // 1. 更新一般車輛號誌的連線與燈頭 (保持原本邏輯)
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

        if (trafficLightMeshes.length > 0) {
            // ... (原本的 updateFace 邏輯保持不變) ...
            // 為節省篇幅，此處省略 updateFace 定義，請保留您原本修正後的版本
            const updateFace = (linkId, lamps, tfl, node) => {
                if (!lamps || !Array.isArray(lamps)) return;
                if (!linkId) {
                    lamps.forEach(l => l.material.color.setHex(0x111111));
                    return;
                }
                // ... (保留原本車輛號誌更新代碼) ...
                // 若您之前已修正過 updateFace，請維持該版本
                const transitions = node.transitions.filter(t => t.sourceLinkId === linkId && t.turnGroupId);
                const inLink = networkData.links[linkId];
                if (!inLink) return;

                const inAngle = getLinkAngle(inLink, true);

                let stateLeft = 'Red', stateStraight = 'Red', stateRight = 'Red';
                let hasLeft = false, hasStraight = false, hasRight = false;
                let anyYellow = false;

                transitions.forEach(trans => {
                    const signal = tfl.getSignalForTurnGroup(trans.turnGroupId);
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
                        if (outLink) {
                            const outAngle = getLinkAngle(outLink, false);
                            let diff = outAngle - inAngle;
                            while (diff <= -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            turnAngle = diff;
                        }
                    }

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

                lamps.forEach(l => l.material.color.setHex(0x111111));
                let showRed = true;
                if (stateStraight === 'Green' || stateLeft === 'Green' || stateRight === 'Green' || anyYellow) showRed = false;
                if (stateStraight !== 'Green' && !anyYellow) showRed = true;

                if (lamps.length >= 1 && showRed) lamps[0].material.color.setHex(lamps[0].config.color);

                if (anyYellow && lamps.length >= 2) {
                    lamps[1].material.color.setHex(lamps[1].config.color);
                    if (lamps.length >= 1) lamps[0].material.color.setHex(0x111111);
                }

                if (hasLeft && stateLeft === 'Green' && lamps.length >= 3) lamps[2].material.color.setHex(lamps[2].config.color);
                if (hasStraight && stateStraight === 'Green' && lamps.length >= 4) lamps[3].material.color.setHex(lamps[3].config.color);
                if (hasRight && stateRight === 'Green' && lamps.length >= 5) lamps[4].material.color.setHex(lamps[4].config.color);
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

        // --- ★★★ 2. 修正後的行人號誌更新邏輯 ★★★ ---
        if (typeof PedestrianManager !== 'undefined' && pedestrianMeshes.length > 0) {
            pedestrianMeshes.forEach(pedData => {
                const { mesh, nodeId, linkId } = pedData;

                // 1. 取得號誌控制器
                const tfl = simulation.trafficLights.find(t => t.nodeId === nodeId);
                const node = networkData.nodes[nodeId];

                // 預設狀態
                let stateStraight = 'Red';
                let remaining = 0;

                if (tfl && node && linkId) {
                    // 2. 收集該 Link 對應的「直行」TurnGroupIds
                    const inLink = networkData.links[linkId];
                    const straightTurnGroupIds = [];

                    if (inLink) {
                        const inAngle = getLinkAngle(inLink, true);
                        const transitions = node.transitions.filter(t => t.sourceLinkId === linkId && t.turnGroupId);

                        transitions.forEach(trans => {
                            let turnAngle = 0;
                            // 計算轉彎角度 (判斷是否直行)
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
                                if (outLink) {
                                    const outAngle = getLinkAngle(outLink, false);
                                    let diff = outAngle - inAngle;
                                    while (diff <= -Math.PI) diff += Math.PI * 2;
                                    while (diff > Math.PI) diff -= Math.PI * 2;
                                    turnAngle = diff;
                                }
                            }

                            // 判斷是否為直行 (角度容許值 0.6)
                            if (Math.abs(turnAngle) < 0.6) {
                                straightTurnGroupIds.push(trans.turnGroupId);
                            }
                        });
                    }

                    // 3. 判斷當前狀態 (只要有一個直行群組是綠燈，就算綠燈)
                    let isGreen = false;
                    straightTurnGroupIds.forEach(gid => {
                        if (tfl.getSignalForTurnGroup(gid) === 'Green') isGreen = true;
                    });

                    if (isGreen) {
                        stateStraight = 'Green';
                        // 綠燈時：顯示當前週期的剩餘時間
                        const phaseInfo = tfl.getPhaseDetails(simulation.time);
                        remaining = phaseInfo.remaining;
                    } else {
                        stateStraight = 'Red';
                        // 紅燈時 (含黃燈)：計算「直到下一次綠燈」的總等待時間
                        remaining = tfl.getTimeToNextGreen(simulation.time, straightTurnGroupIds);
                    }

                    // 防呆
                    if (isNaN(remaining)) remaining = 0;
                }

                // 4. 更新視覺
                PedestrianManager.update(mesh, stateStraight, remaining, simulation.time);
            });
        }
    }

    function getLinkAngle(link, isEnd) {
        if (!link) return 0;
        const lanes = Object.values(link.lanes);
        if (lanes.length === 0) return 0;
        // 取第一條車道的路徑
        const path = lanes[0].path;
        if (path.length < 2) return 0;

        let p1, p2;
        if (isEnd) {
            // 該路段的末端角度 (進入路口的角度)
            p1 = path[path.length - 2];
            p2 = path[path.length - 1];
        } else {
            // 該路段的起始角度 (離開路口的角度)
            p1 = path[0];
            p2 = path[1];
        }
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }

    // 建立一台更像車子的 Mesh Group (包含車身、車頂、輪胎、車燈)
    function createDetailedCarMesh(length, width, colorValue) {
        const carGroup = new THREE.Group();

        const chassisHeight = 0.6;
        const cabinHeight = 0.5;
        const wheelRadius = 0.3;
        const wheelThickness = 0.25;

        // --- 1. 底盤 (Chassis) ---
        const chassisGeo = new THREE.BoxGeometry(length, chassisHeight, width);

        // ★★★ [修改] 使用 Standard 材質，讓車漆有光澤且顏色飽和 ★★★
        const paintMat = new THREE.MeshStandardMaterial({
            color: colorValue,
            roughness: 0.3,  // 光滑表面
            metalness: 0.3   // 微微的金屬感
        });

        const chassis = new THREE.Mesh(chassisGeo, paintMat);
        chassis.position.y = chassisHeight / 2 + wheelRadius * 0.5;
        chassis.castShadow = true;
        chassis.receiveShadow = true;
        carGroup.add(chassis);

        // --- 2. 車頂/車廂 (Cabin) ---
        const isLargeVehicle = length > 5.5;
        let cabinGeo, cabinXOffset;
        if (isLargeVehicle) {
            cabinGeo = new THREE.BoxGeometry(length - 0.5, 1.2, width - 0.2);
            cabinXOffset = 0;
        } else {
            cabinGeo = new THREE.BoxGeometry(length * 0.55, cabinHeight, width * 0.85);
            cabinXOffset = -length * 0.1;
        }

        // [修改] 窗戶材質改為深黑且反光
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.1,
            metalness: 0.5
        });

        const cabinMaterials = [
            windowMat, // Right
            windowMat, // Left
            paintMat,  // Top (車頂用車漆)
            windowMat, // Bottom
            windowMat, // Front
            windowMat  // Back
        ];

        const cabin = new THREE.Mesh(cabinGeo, cabinMaterials);
        cabin.position.set(cabinXOffset, chassis.position.y + chassisHeight / 2 + (isLargeVehicle ? 0.6 : cabinHeight / 2), 0);
        cabin.castShadow = true;
        carGroup.add(cabin);

        // --- 3. 輪胎 (Wheels) ---
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 16);
        // 輪胎使用粗糙的黑色
        const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9
        });

        const wheelX = length * 0.35;
        const wheelZ = width * 0.5 - wheelThickness / 2;
        const wheelY = wheelRadius;

        const positions = [
            { x: wheelX, z: wheelZ },
            { x: wheelX, z: -wheelZ },
            { x: -wheelX, z: wheelZ },
            { x: -wheelX, z: -wheelZ }
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
        const headLightMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
        const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

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

    // --- 新增：建立機車專用的 3D Mesh ---
    function createMotorcycleMesh(length, width, colorValue) {
        const bikeGroup = new THREE.Group();

        // ★★★ [修改] 使用 Standard 材質增強質感 ★★★
        const paintMat = new THREE.MeshStandardMaterial({
            color: colorValue,
            roughness: 0.4,
            metalness: 0.2
        });

        const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.3, metalness: 0.8 });
        const skinMat = new THREE.MeshLambertMaterial({ color: 0xF1C27D }); // 膚色用 Lambert 即可
        const shirtMat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        const helmetMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });

        // 尺寸參數
        const wheelRadius = 0.25;
        const wheelThickness = 0.1;

        // ... (幾何形狀代碼保持不變，直接複製原本的即可) ...
        // ... 下方代碼省略，只需替換材質定義部分 ...

        // (為了完整性，這裡列出第一部分幾何建立)
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 12);
        const frontWheel = new THREE.Mesh(wheelGeo, darkMat);
        frontWheel.rotation.x = Math.PI / 2;
        frontWheel.position.set(length * 0.35, wheelRadius, 0);
        frontWheel.castShadow = true;
        bikeGroup.add(frontWheel);

        const backWheel = new THREE.Mesh(wheelGeo, darkMat);
        backWheel.rotation.x = Math.PI / 2;
        backWheel.position.set(-length * 0.35, wheelRadius, 0);
        backWheel.castShadow = true;
        bikeGroup.add(backWheel);

        const bodyGeo = new THREE.BoxGeometry(length * 0.5, 0.25, width * 0.4);
        const body = new THREE.Mesh(bodyGeo, paintMat);
        body.position.set(0, wheelRadius + 0.1, 0);
        body.castShadow = true;
        bikeGroup.add(body);

        const forkGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
        const fork = new THREE.Mesh(forkGeo, metalMat);
        fork.position.set(length * 0.25, wheelRadius + 0.35, 0);
        fork.rotation.z = -Math.PI / 6;
        bikeGroup.add(fork);

        const handleBarGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8);
        const handleBar = new THREE.Mesh(handleBarGeo, darkMat);
        handleBar.rotation.x = Math.PI / 2;
        handleBar.position.set(length * 0.22, wheelRadius + 0.6, 0);
        bikeGroup.add(handleBar);

        // ... (騎士與車燈代碼保持不變，使用新的材質變數即可) ...
        const riderGroup = new THREE.Group();
        const torsoGeo = new THREE.BoxGeometry(0.2, 0.45, 0.3);
        const torso = new THREE.Mesh(torsoGeo, shirtMat);
        torso.position.set(-0.1, 0.25, 0);
        torso.castShadow = true;
        riderGroup.add(torso);

        const headGeo = new THREE.BoxGeometry(0.22, 0.25, 0.22);
        const head = new THREE.Mesh(headGeo, helmetMat);
        head.position.set(0, 0.6, 0);
        riderGroup.add(head);

        const armGeo = new THREE.BoxGeometry(0.35, 0.08, 0.08);
        const leftArm = new THREE.Mesh(armGeo, skinMat);
        leftArm.position.set(0.15, 0.35, 0.2);
        leftArm.rotation.y = -0.5;
        leftArm.rotation.z = -0.3;
        riderGroup.add(leftArm);

        const rightArm = new THREE.Mesh(armGeo, skinMat);
        rightArm.position.set(0.15, 0.35, -0.2);
        rightArm.rotation.y = 0.5;
        rightArm.rotation.z = -0.3;
        riderGroup.add(rightArm);

        riderGroup.position.set(-0.1, wheelRadius + 0.3, 0);
        riderGroup.rotation.z = 0.2;
        bikeGroup.add(riderGroup);

        const lightGeo = new THREE.BoxGeometry(0.1, 0.15, 0.15);
        const headLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xFFFFCC }));
        headLight.position.set(length * 0.3, wheelRadius + 0.45, 0);
        bikeGroup.add(headLight);

        return bikeGroup;
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

                // [修改] 根據車寬判斷車種
                // 如果寬度小於 1.0 (機車)，使用 createMotorcycleMesh
                // 否則使用 createDetailedCarMesh
                if (v.width < 1.0) {
                    mesh = createMotorcycleMesh(v.length, v.width, color);
                } else {
                    mesh = createDetailedCarMesh(v.length, v.width, color);
                }

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

        // (後續移除消失車輛的代碼保持不變...)
        for (const [id, mesh] of vehicleMeshes) {
            if (!activeIds.has(id)) {
                scene.remove(mesh);
                mesh.traverse((child) => {
                    if (child.isMesh) {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
                            else child.material.dispose();
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
    // --- 招牌文字與紋理生成工具 ---

    const SIGN_TEXTS = {
        // 台灣風格豎招牌 (直排)
        vertical: [
            "永和豆漿", "快樂牙科", "寶島眼鏡", "光華商場", "錢櫃KTV",
            "補習班", "整形外科", "牛肉麵", "大飯店", "商務旅館",
            "網咖", "按摩養生", "五金行", "機車行", "當鋪",
            "魯肉飯", "便利商店", "彩券行", "熱炒100", "足體養生"
        ],
        // 英文橫式招牌
        horizontal: [
            "HOTEL", "BANK", "CAFE", "FASHION", "TECH",
            "CINEMA", "PUB", "GYM", "MARKET", "OFFICE",
            "AGENCY", "STORE", "MALL", "CLUB", "24H OPEN"
        ]
    };

    // 建立招牌紋理 (CanvasTexture)
    function createSignTexture(text, type, colorHex) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 設定畫布尺寸與字型
        if (type === 'vertical') {
            canvas.width = 64;
            canvas.height = 256;
            ctx.fillStyle = colorHex || '#AA0000'; // 底色
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 邊框 (霓虹燈感)
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            ctx.font = 'bold 40px "Microsoft JhengHei", sans-serif';
            ctx.fillStyle = '#FFFFFF'; // 文字色
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            // 直排文字邏輯
            const startY = 20;
            const lineHeight = 50;
            for (let i = 0; i < text.length; i++) {
                ctx.fillText(text[i], canvas.width / 2, startY + i * lineHeight);
            }
        } else {
            // Horizontal
            canvas.width = 256;
            canvas.height = 64;
            ctx.fillStyle = colorHex || '#003366';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            ctx.font = 'bold 40px Arial, sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        // 優化紋理設定
        texture.minFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    // 預先生成材質池 (避免重複建立 Canvas)
    function generateSignMaterials() {
        const materials = { v: [], h: [] };
        const bgColors = ['#CC0000', '#0066CC', '#009944', '#FF6600', '#333333', '#663399'];

        // 生成豎式材質
        SIGN_TEXTS.vertical.forEach((txt, idx) => {
            const color = bgColors[idx % bgColors.length];
            const tex = createSignTexture(txt, 'vertical', color);
            // 使用 Standard 材質並開啟自發光 (Emissive) 以模擬燈箱/霓虹燈
            const mat = new THREE.MeshStandardMaterial({
                map: tex,
                emissive: new THREE.Color(color),
                emissiveMap: tex,
                emissiveIntensity: 0.8,
                roughness: 0.2,
                metalness: 0.5
            });
            materials.v.push(mat);
        });

        // 生成橫式材質
        SIGN_TEXTS.horizontal.forEach((txt, idx) => {
            const color = bgColors[idx % bgColors.length];
            const tex = createSignTexture(txt, 'horizontal', color);
            const mat = new THREE.MeshStandardMaterial({
                map: tex,
                emissive: new THREE.Color(color),
                emissiveMap: tex,
                emissiveIntensity: 0.6,
                roughness: 0.2
            });
            materials.h.push(mat);
        });

        return materials;
    }
    // =================================================================
    // 遊樂園生成器 (Amusement Park Generator)
    // =================================================================
    const ParkThemes = {
        colors: [0xFF0000, 0xFFFF00, 0x0000FF, 0x00FF00, 0xFF00FF, 0x00FFFF],
        emissive: 0.4
    };

    function createAmusementPark(x, z, radius) {
        const parkGroup = new THREE.Group();
        parkGroup.position.set(x, 0, z);

        // 1. 地面 (Ground)
        const groundGeo = new THREE.CircleGeometry(radius, 64);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x228B22, // 草地綠
            roughness: 0.8
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0.15; // 略高於馬路
        ground.receiveShadow = true;
        parkGroup.add(ground);

        // 2. 圍牆 (Fence)
        const fenceGeo = new THREE.TorusGeometry(radius, 0.5, 16, 100);
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
        const fence = new THREE.Mesh(fenceGeo, fenceMat);
        fence.rotation.x = -Math.PI / 2;
        fence.position.y = 1.0;
        parkGroup.add(fence);

        // 動畫更新回調清單
        const updatables = [];

        // --- A. 摩天輪 (Ferris Wheel) ---
        // 位置：公園後方
        const fwGroup = new THREE.Group();
        fwGroup.position.set(0, 0, radius * 0.5);
        parkGroup.add(fwGroup);

        // 支架
        const baseGeo = new THREE.ConeGeometry(4, 25, 4, 1, true);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, side: THREE.DoubleSide });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 12.5;
        base.rotation.y = Math.PI / 4;
        base.scale.z = 0.5; // 壓扁一點
        fwGroup.add(base);

        // 轉輪主體
        const wheelNode = new THREE.Group();
        wheelNode.position.y = 24;
        fwGroup.add(wheelNode);

        const rimGeo = new THREE.TorusGeometry(18, 0.8, 16, 50);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0xFF0055, emissive: 0xFF0055, emissiveIntensity: 0.5
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        wheelNode.add(rim);

        // 輻條
        const spokeGeo = new THREE.CylinderGeometry(0.2, 0.2, 36);
        const spokeMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
        for (let i = 0; i < 6; i++) {
            const spoke = new THREE.Mesh(spokeGeo, spokeMat);
            spoke.rotation.z = (i / 6) * Math.PI;
            wheelNode.add(spoke);
        }

        // 車廂 (Cabins)
        const numCabins = 12;
        const cabinGeo = new THREE.CylinderGeometry(1.5, 1.2, 2.5, 8);
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x00FFFF, emissive: 0x00FFFF, emissiveIntensity: 0.3 });
        const cabins = [];

        for (let i = 0; i < numCabins; i++) {
            const angle = (i / numCabins) * Math.PI * 2;
            const cx = Math.cos(angle) * 18;
            const cy = Math.sin(angle) * 18;

            const cabinGrp = new THREE.Group();
            cabinGrp.position.set(cx, cy, 0);

            const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
            cabinMesh.rotation.x = Math.PI / 2; // 讓圓柱躺著當車廂
            cabinGrp.add(cabinMesh);

            wheelNode.add(cabinGrp);
            cabins.push(cabinGrp);
        }

        // 摩天輪動畫邏輯
        updatables.push((dt) => {
            const speed = 0.2; // rad/s
            wheelNode.rotation.z -= speed * dt;
            // 車廂保持水平 (逆向旋轉)
            cabins.forEach(c => {
                c.rotation.z = -wheelNode.rotation.z;
            });
        });

        // --- B. 雲霄飛車 (Roller Coaster) ---
        // 位置：環繞公園
        // 建立軌道曲線
        const curvePoints = [];
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const angle = t * Math.PI * 2;
            const r = radius * 0.7 + Math.sin(t * Math.PI * 6) * 5; // 半徑變化

            // [修正處] 將基礎高度從 10 提升到 20
            // 原本: const h = 10 + Math.sin(t * Math.PI * 4) * 8 + Math.cos(t * Math.PI * 2) * 5;
            // 修正後: 確保最低點也在地面以上 (20 - 8 - 5 = 7 > 0)
            const h = 20 + Math.sin(t * Math.PI * 4) * 8 + Math.cos(t * Math.PI * 2) * 5;

            curvePoints.push(new THREE.Vector3(Math.cos(angle) * r, h, Math.sin(angle) * r));
        }
        const trackCurve = new THREE.CatmullRomCurve3(curvePoints, true); // 閉合曲線

        // 軌道模型
        const tubeGeo = new THREE.TubeGeometry(trackCurve, 100, 0.8, 8, true);
        const tubeMat = new THREE.MeshStandardMaterial({ color: 0xFFFF00 });
        const trackMesh = new THREE.Mesh(tubeGeo, tubeMat);
        parkGroup.add(trackMesh);

        // 支柱 (每隔一段距離產生)
        const supportMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const supportGeo = new THREE.BoxGeometry(1, 1, 1);
        for (let i = 0; i < 30; i++) {
            const t = i / 30;
            const pt = trackCurve.getPoint(t);
            const h = pt.y;
            if (h > 2) {
                const pillar = new THREE.Mesh(supportGeo, supportMat);
                pillar.position.set(pt.x, h / 2, pt.z);
                pillar.scale.set(0.8, h, 0.8);
                parkGroup.add(pillar);
            }
        }

        // 雲霄飛車車輛
        const cartGeo = new THREE.BoxGeometry(2, 1.5, 3);
        const cartMat = new THREE.MeshStandardMaterial({ color: 0x0000FF });
        const cart = new THREE.Mesh(cartGeo, cartMat);
        parkGroup.add(cart);

        let coasterProgress = 0;
        updatables.push((dt) => {
            coasterProgress += dt * 0.15; // 速度
            if (coasterProgress > 1) coasterProgress -= 1;

            const pos = trackCurve.getPointAt(coasterProgress);
            //const tangent = trackCurve.getTangentAt(coasterProgress);

            cart.position.copy(pos);
            // 簡單的朝向控制 (LookAt target)
            const lookTarget = trackCurve.getPointAt((coasterProgress + 0.01) % 1);
            cart.lookAt(lookTarget);
        });

        // --- C. 纜車 (Cable Car) ---
        // 位置：橫跨公園左右
        const towerGeo = new THREE.CylinderGeometry(1, 2, 25, 4);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0x666666 });

        // 左塔
        const towerL = new THREE.Mesh(towerGeo, towerMat);
        towerL.position.set(-radius * 0.8, 12.5, 0);
        parkGroup.add(towerL);

        // 右塔
        const towerR = new THREE.Mesh(towerGeo, towerMat);
        towerR.position.set(radius * 0.8, 12.5, 0);
        parkGroup.add(towerR);

        // 纜繩
        const cableGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-radius * 0.8, 24, 0),
            new THREE.Vector3(radius * 0.8, 24, 0)
        ]);
        const cableMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 3 });
        const cable = new THREE.Line(cableGeo, cableMat);
        parkGroup.add(cable);

        // 纜車車廂
        const cableCarGeo = new THREE.BoxGeometry(3, 3, 2);
        const cableCarMat = new THREE.MeshStandardMaterial({ color: 0xFFA500 }); // 橘色
        const cableCar = new THREE.Mesh(cableCarGeo, cableCarMat);
        parkGroup.add(cableCar);

        // 掛勾
        const hookGeo = new THREE.CylinderGeometry(0.1, 0.1, 3);
        const hook = new THREE.Mesh(hookGeo, new THREE.MeshBasicMaterial({ color: 0x333333 }));
        hook.position.y = 1.5;
        cableCar.add(hook);

        let cableCarDir = 1;
        let cableCarPos = 0; // -1 to 1

        updatables.push((dt) => {
            const speed = 0.3;
            cableCarPos += speed * dt * cableCarDir;

            if (cableCarPos > 1) { cableCarPos = 1; cableCarDir = -1; }
            if (cableCarPos < -1) { cableCarPos = -1; cableCarDir = 1; }

            // 插值位置
            const limit = radius * 0.8;
            cableCar.position.set(cableCarPos * limit, 24 - 3, 0); // 纜繩高度減去掛勾長
        });

        return {
            mesh: parkGroup,
            update: (dt) => updatables.forEach(fn => fn(dt))
        };
    }

    // 2. 城市生成主函式 (修正版：包含遊樂園與招牌)
    function generateCity(netData, seed) {
        // 清除舊城市與雲朵
        cityGroup.clear();
        cloudGroup.clear();

        // ★★★ 新增：清除舊的動畫物件 ★★★
        animatedCityObjects = [];

        const rng = new PseudoRandom(seed);

        // =============================================================
        // 都市建築材質 (Shader) - 保持不變
        // =============================================================
        const urbanColors = [
            0xE8E8E8, 0xD2B48C, 0x708090, 0x8FBC8F, 0xBC8F8F,
            0xADD8E6, 0xF0E68C, 0xB0C4DE, 0xFFDAB9
        ];

        const buildMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, vertexColors: false, roughness: 0.5, metalness: 0.1,
        });

        buildMat.onBeforeCompile = (shader) => {
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
                `
                #include <begin_vertex>
                vWindowParams = aWindowParams;
                vInstanceColor = aColor; 
                vec4 worldPos = instanceMatrix * vec4(transformed, 1.0);
                vPos = worldPos.xyz;
                mat3 rotMat = mat3(instanceMatrix[0].xyz, instanceMatrix[1].xyz, instanceMatrix[2].xyz);
                rotMat[0] = normalize(rotMat[0]); rotMat[1] = normalize(rotMat[1]); rotMat[2] = normalize(rotMat[2]);
                vNormalDir = normalize(rotMat * objectNormal);
                `
            );

            shader.fragmentShader = `
                varying vec2 vWindowParams;
                varying vec3 vInstanceColor;
                varying vec3 vPos;
                varying vec3 vNormalDir;
                float myRand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
            ` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                `
                #include <dithering_fragment>
                vec3 lightIntensity = gl_FragColor.rgb;
                vec3 wallColor = vInstanceColor * lightIntensity;
                wallColor = mix(wallColor, vInstanceColor * 0.5, 0.3);
                vec3 finalColor = wallColor;

                float isWall = 1.0 - step(0.98, abs(vNormalDir.y));
                if (isWall > 0.5) {
                    float density = vWindowParams.x; float ratio = vWindowParams.y;
                    vec2 uv = vec2(0.0);
                    float randomOffset = myRand(floor(vPos.xz * 0.1)); 
                    if (abs(vNormalDir.x) > 0.5) { uv = vec2(vPos.z + randomOffset * 10.0, vPos.y); } 
                    else { uv = vec2(vPos.x + randomOffset * 10.0, vPos.y); }
                    float floorHeight = 3.5; float floorY = uv.y;
                    vec2 grid = fract(vec2(uv.x * density, floorY / floorHeight));
                    vec2 cellId = floor(vec2(uv.x * density, floorY / floorHeight));
                    float cellRandom = myRand(cellId);
                    float winX = step(0.5 - ratio/2.0, grid.x) * step(grid.x, 0.5 + ratio/2.0);
                    float winY = step(0.2, grid.y) * step(grid.y, 0.85);
                    float isGroundFloor = 1.0 - step(4.0, floorY);
                    float isWindow = winX * winY * (1.0 - isGroundFloor);
                    vec3 windowBase = vec3(0.2, 0.4, 0.8);
                    float lightIntensity = mix(0.3, 1.2, cellRandom); 
                    vec3 windowColor = windowBase * lightIntensity;
                    if (isWindow > 0.5) { finalColor = windowColor + vec3(0.1); }
                }
                gl_FragColor.rgb = finalColor;
                `
            );
        };

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const buildingsData = [];
        const treesData = [];
        const watersData = [];

        // 空間雜湊
        const gridSize = 50;
        const roadSpatialHash = {};
        function addToHash(x, z, item) {
            const key = `${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`;
            if (!roadSpatialHash[key]) roadSpatialHash[key] = [];
            roadSpatialHash[key].push(item);
        }

        // --- 步驟 A: 預處理 - 建立禁區 ---

        // ★★★ [新增] A-0. 處理自定義場景物件 (Custom Models) ★★★
        if (typeof customModelsGroup !== 'undefined') {
            customModelsGroup.children.forEach(obj => {
                // 計算物件的邊界框
                const box = new THREE.Box3().setFromObject(obj);
                if (box.isEmpty()) return;

                const center = new THREE.Vector3();
                box.getCenter(center);
                const size = new THREE.Vector3();
                box.getSize(size);

                // 計算佔地半徑 (取 X 和 Z 的最大值的一半)
                // 為了安全起見，稍微加大一點半徑 (* 1.1)
                const radius = Math.max(size.x, size.z) / 2 * 1.1;

                // 註冊到空間雜湊
                const cx = center.x;
                const cz = center.z; // 在我們的座標系中，Z 是平面深度

                // 因為物件可能很大，覆蓋多個網格，這裡簡化處理：
                // 如果半徑很大，應該遍歷覆蓋的網格。這裡使用簡單的九宮格注入。
                const gridSpan = Math.ceil(radius / gridSize);
                for (let i = -gridSpan; i <= gridSpan; i++) {
                    for (let j = -gridSpan; j <= gridSpan; j++) {
                        addToHash(
                            cx + i * gridSize,
                            cz + j * gridSize,
                            { type: 'custom_obstacle', x: cx, z: cz, r: radius }
                        );
                    }
                }
            });
        }

        // A-1. 處理路口
        Object.values(netData.nodes).forEach(node => {
            if (node.polygon && node.polygon.length > 0) {
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                node.polygon.forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
                });
                const cx = (minX + maxX) / 2;
                const cz = (minZ + maxZ) / 2;
                const radius = Math.max(20, Math.hypot(maxX - minX, maxZ - minZ) / 2);
                for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) addToHash(cx + i * gridSize / 2, cz + j * gridSize / 2, { type: 'node', x: cx, z: cz, r: radius });
            }
        });

        // A-2. 處理道路
        Object.values(netData.links).forEach(link => {
            let totalWidth = 0;
            Object.values(link.lanes).forEach(l => totalWidth += l.width);
            const lanes = Object.values(link.lanes);
            if (lanes.length === 0) return;
            const path = lanes[0].path;
            const halfWidth = totalWidth / 2;
            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i]; const p2 = path[i + 1];
                const seg = { type: 'segment', x1: p1.x, z1: p1.y, x2: p2.x, z2: p2.y, width: halfWidth + 2.0 };
                addToHash(seg.x1, seg.z1, seg); addToHash(seg.x2, seg.z2, seg); addToHash((seg.x1 + seg.x2) / 2, (seg.z1 + seg.z2) / 2, seg);
            }
        });

        // A-3. 處理停車場
        const parkingPolygons = [];
        if (netData.parkingLots) { netData.parkingLots.forEach(lot => { if (lot.boundary.length >= 3) parkingPolygons.push(lot.boundary); }); }

        function distToSegmentSquared(px, pz, x1, z1, x2, z2) {
            const l2 = (x1 - x2) ** 2 + (z1 - z2) ** 2;
            if (l2 === 0) return (px - x1) ** 2 + (pz - z1) ** 2;
            let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
            t = Math.max(0, Math.min(1, t));
            return (px - (x1 + t * (x2 - x1))) ** 2 + (pz - (z1 + t * (z2 - z1))) ** 2;
        }

        // ★★★ [修正] 安全位置檢查：加入 custom_obstacle 判斷 ★★★
        function isPositionSafe(x, z, radius) {
            for (const poly of parkingPolygons) { if (Geom.Utils.isPointInPolygon({ x: x, y: z }, poly)) return false; }
            const cx = Math.floor(x / gridSize); const cz = Math.floor(z / gridSize);
            // 檢查範圍擴大一點，確保不會離路太近
            for (let i = -2; i <= 2; i++) {
                for (let j = -2; j <= 2; j++) {
                    const items = roadSpatialHash[`${cx + i},${cz + j}`];
                    if (!items) continue;
                    for (const item of items) {
                        if (item.type === 'node') {
                            if (Math.hypot(x - item.x, z - item.z) < (item.r + radius)) return false;
                        } else if (item.type === 'segment') {
                            if (distToSegmentSquared(x, z, item.x1, item.z1, item.x2, item.z2) < (item.width + radius) ** 2) return false;
                        } else if (item.type === 'custom_obstacle' || item.type === 'restricted_zone') {
                            if (Math.hypot(x - item.x, z - item.z) < (item.r + radius)) return false;
                        }
                    }
                }
            }
            return true;
        }

        // =================================================================
        // ★★★ 新增：生成遊樂園 (Amusement Park) ★★★
        // =================================================================
        const PARK_RADIUS = 80; // 遊樂園佔地半徑
        const TRY_COUNT = 50;   // 嘗試次數

        let parkCreated = false;

        // 取得地圖邊界 (避免生成在虛空)
        const mapMinX = netData.bounds.minX !== Infinity ? netData.bounds.minX : -500;
        const mapMaxX = netData.bounds.maxX !== -Infinity ? netData.bounds.maxX : 500;
        const mapMinZ = netData.bounds.minY !== Infinity ? netData.bounds.minY : -500;
        const mapMaxZ = netData.bounds.maxY !== -Infinity ? netData.bounds.maxY : 500;

        for (let i = 0; i < TRY_COUNT; i++) {
            // 隨機選點
            const px = rng.range(mapMinX + PARK_RADIUS, mapMaxX - PARK_RADIUS);
            const pz = rng.range(mapMinZ + PARK_RADIUS, mapMaxZ - PARK_RADIUS);

            // 檢查是否安全 (需要更大的緩衝區，例如 PARK_RADIUS + 10)
            if (isPositionSafe(px, pz, PARK_RADIUS + 10)) {
                // 生成遊樂園物件
                const parkObj = createAmusementPark(px, pz, PARK_RADIUS);

                // 加入場景
                cityGroup.add(parkObj.mesh);

                // 加入動畫迴圈
                animatedCityObjects.push(parkObj);

                // 標記區域為禁區 (寫入 Hash)，防止後續建築生成在遊樂園裡
                const gridSpan = Math.ceil(PARK_RADIUS / gridSize);
                for (let gx = -gridSpan; gx <= gridSpan; gx++) {
                    for (let gz = -gridSpan; gz <= gridSpan; gz++) {
                        addToHash(px + gx * gridSize, pz + gz * gridSize, {
                            type: 'restricted_zone',
                            x: px,
                            z: pz,
                            r: PARK_RADIUS
                        });
                    }
                }

                console.log("Amusement Park generated at:", px, pz);
                parkCreated = true;
                break; // 只要一座
            }
        }

        if (!parkCreated) console.log("Could not find space for Amusement Park.");


        // --- 步驟 B: 生成建築資料 (維持原樣) ---
        Object.values(netData.links).forEach(link => {
            let roadWidth = 0; Object.values(link.lanes).forEach(l => roadWidth += l.width);
            const baseOffset = (roadWidth / 2) + 3.0;
            if (!link.geometry) return;
            const lanes = Object.values(link.lanes);
            if (lanes.length === 0) return;
            const path = lanes[0].path;
            const stepSize = 10;

            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i]; const p2 = path[i + 1];
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const steps = Math.floor(dist / stepSize);
                const dx = (p2.x - p1.x) / dist; const dy = (p2.y - p1.y) / dist;
                const nx = -dy; const ny = dx;

                for (let j = 1; j <= steps; j++) {
                    const jitter = rng.range(-2, 2);
                    const t = ((j * stepSize) + jitter) / dist;
                    if (t < 0 || t > 1) continue;
                    const cx = p1.x + (p2.x - p1.x) * t;
                    const cy = p1.y + (p2.y - p1.y) * t;

                    [-1, 1].forEach(side => {
                        const lotTypeRate = rng.next();
                        const setback = rng.range(2, 8);
                        const totalOffset = baseOffset + setback;
                        const placeX = cx + nx * totalOffset * side;
                        const placeZ = cy + ny * totalOffset * side;
                        const w = rng.range(5, 8);
                        const d = rng.range(5, 8);
                        const radius = Math.max(w, d) / 1.5;

                        // 這裡會呼叫更新後的 isPositionSafe，避開自定義物件
                        if (!isPositionSafe(placeX, placeZ, radius)) return;
                        const angle = Math.atan2(dy, dx);

                        if (lotTypeRate < 0.6) {
                            const h = rng.range(8, 24);
                            const finalH = (rng.bool(0.05)) ? rng.range(30, 60) : h;
                            const winDensity = rng.range(0.2, 0.6);
                            const winRatio = rng.range(0.3, 0.7);

                            buildingsData.push({
                                x: placeX, z: placeZ, y: (finalH / 2) - 0.5,
                                sx: w, sy: finalH + 1.0, sz: d,
                                ry: -angle,
                                color: rng.pick(urbanColors),
                                winParams: { x: winDensity, y: winRatio }
                            });
                        } else if (lotTypeRate < 0.85) {
                            if (isPositionSafe(placeX, placeZ, 2.0)) {
                                const numTrees = Math.floor(rng.range(2, 5));
                                for (let k = 0; k < numTrees; k++) {
                                    const tx = placeX + rng.range(-4, 4);
                                    const tz = placeZ + rng.range(-4, 4);
                                    if (isPositionSafe(tx, tz, 1.0)) {
                                        const scale = rng.range(0.8, 1.4);
                                        treesData.push({ x: tx, z: tz, y: 2 * scale, sx: scale, sy: scale, sz: scale });
                                    }
                                }
                            }
                        } else if (lotTypeRate < 0.90) {
                            const r = rng.range(6, 12);
                            if (isPositionSafe(placeX, placeZ, r + 2)) watersData.push({ x: placeX, z: placeZ, r: r });
                        }
                    });
                }
            }
        });

        // --- 步驟 C: 建立 InstancedMesh (建築) ---
        if (buildingsData.length > 0) {
            const count = buildingsData.length;
            const iMesh = new THREE.InstancedMesh(geometry, buildMat, count);
            iMesh.castShadow = true;
            iMesh.receiveShadow = true;
            const winParamsArray = new Float32Array(count * 2);
            const colorArray = new Float32Array(count * 3);
            const dummy = new THREE.Object3D();
            const color = new THREE.Color();

            buildingsData.forEach((data, i) => {
                dummy.position.set(data.x, data.y, data.z);
                dummy.rotation.y = data.ry;
                dummy.scale.set(data.sx, data.sy, data.sz);
                dummy.updateMatrix();
                iMesh.setMatrixAt(i, dummy.matrix);
                color.setHex(data.color);
                colorArray[i * 3] = color.r; colorArray[i * 3 + 1] = color.g; colorArray[i * 3 + 2] = color.b;
                winParamsArray[i * 2] = data.winParams.x; winParamsArray[i * 2 + 1] = data.winParams.y;
            });

            geometry.setAttribute('aWindowParams', new THREE.InstancedBufferAttribute(winParamsArray, 2));
            geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colorArray, 3));
            iMesh.instanceMatrix.needsUpdate = true;
            cityGroup.add(iMesh);
        }

        // --- 樹木 ---
        if (treesData.length > 0) {
            const treeGeo = new THREE.ConeGeometry(1, 4, 8);
            const treeMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
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

        // --- 水池 ---
        const waterGeo = new THREE.CircleGeometry(1, 16);
        const waterMat = new THREE.MeshLambertMaterial({ color: 0x4fa4bc });
        watersData.forEach(data => {
            const water = new THREE.Mesh(waterGeo, waterMat);
            water.rotation.x = -Math.PI / 2;
            water.position.set(data.x, 0.15, data.z);
            water.scale.set(data.r, data.r, 1);
            cityGroup.add(water);
        });

        // --- 雲層 (維持 V3) ---
        const minX = netData.bounds.minX !== Infinity ? netData.bounds.minX : -500;
        const maxX = netData.bounds.maxX !== -Infinity ? netData.bounds.maxX : 500;
        const minY = netData.bounds.minY !== Infinity ? netData.bounds.minY : -500;
        const maxY = netData.bounds.maxY !== -Infinity ? netData.bounds.maxY : 500;
        const mapArea = (maxX - minX) * (maxY - minY);
        const cloudCoverage = rng.range(0.3, 0.5);
        const avgCloudArea = 4500;
        const totalClouds = Math.max(3, Math.floor((mapArea * cloudCoverage) / avgCloudArea));
        const cloudGeo = new THREE.IcosahedronGeometry(1, 2);
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.9, metalness: 0.0, flatShading: false, transparent: true, opacity: 0.85
        });
        const maxPuffsPerCloud = 20;
        const totalPuffs = totalClouds * maxPuffsPerCloud;
        const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, totalPuffs);
        cloudMesh.castShadow = true; cloudMesh.receiveShadow = true;
        const dummyCloud = new THREE.Object3D();
        let instanceIdx = 0;
        for (let i = 0; i < totalClouds; i++) {
            const margin = 150;
            const cx = rng.range(minX - margin, maxX + margin);
            const cz = rng.range(minY - margin, maxY + margin);
            const baseHeight = rng.range(80, 120);
            const cloudScaleBase = rng.range(12, 35);
            const numPuffs = Math.floor(rng.range(12, maxPuffsPerCloud));
            for (let j = 0; j < numPuffs; j++) {
                const angle = rng.next() * Math.PI * 2;
                const radius = Math.sqrt(rng.next()) * cloudScaleBase * 0.55;
                const offsetX = Math.cos(angle) * radius; const offsetZ = Math.sin(angle) * radius;
                const distRatio = radius / (cloudScaleBase * 0.55);
                const heightPotential = (1 - Math.pow(distRatio, 1.8)) * (cloudScaleBase * 0.7);
                let offsetY = rng.range(-0.1, 1.0) * heightPotential;
                let puffScale = rng.range(0.7, 1.2) * (cloudScaleBase * 0.45);
                let scaleY = puffScale;
                if (offsetY < 1.0) { puffScale *= 1.25; scaleY *= 0.7; offsetY = 0; }
                dummyCloud.position.set(cx + offsetX, baseHeight + offsetY, cz + offsetZ);
                dummyCloud.rotation.set(rng.next() * Math.PI, rng.next() * Math.PI, rng.next() * Math.PI);
                dummyCloud.scale.set(puffScale, scaleY, puffScale);
                dummyCloud.updateMatrix();
                if (instanceIdx < totalPuffs) { cloudMesh.setMatrixAt(instanceIdx++, dummyCloud.matrix); }
            }
        }
        cloudMesh.instanceMatrix.needsUpdate = true;
        cloudGroup.add(cloudMesh);

        if (renderer) renderer.render(scene, camera);

        // =================================================================
        // [修正版] 步驟 D: 生成 3D 招牌 (Signs) (合併您的招牌邏輯)
        // =================================================================
        if (buildingsData.length > 0) {
            const signGroup = new THREE.Group();
            // 注意：這裡假設 generateSignMaterials() 已在外部定義 (請參照先前的對話)
            const signMaterials = (typeof generateSignMaterials === 'function') ? generateSignMaterials() : { v: [], h: [] };

            const geoVertical = new THREE.BoxGeometry(1.2, 4.0, 0.3);
            const geoHorizontal = new THREE.BoxGeometry(4.0, 1.2, 0.2);
            const dummyBuilding = new THREE.Object3D();
            const dummySign = new THREE.Object3D();
            dummyBuilding.add(dummySign);

            buildingsData.forEach(bData => {
                if (bData.sy < 8) return;
                // 設定虛擬建築
                dummyBuilding.position.set(bData.x, bData.y, bData.z);
                dummyBuilding.rotation.y = bData.ry;
                dummyBuilding.scale.set(1, 1, 1);
                dummyBuilding.updateMatrixWorld();

                const halfW = bData.sx / 2;
                const halfH = bData.sy / 2;
                const halfD = bData.sz / 2;
                const choice = rng.next();

                if (choice < 0.35 && signMaterials.h && signMaterials.h.length > 0) {
                    // 英文橫式
                    const mat = rng.pick(signMaterials.h);
                    let targetY = -halfH + 12;
                    const maxY = halfH - 0.6 - 0.2;
                    targetY = Math.min(targetY, maxY);
                    dummySign.position.set(0, targetY, -halfD - 0.15);
                    dummySign.rotation.set(0, Math.PI, 0);
                    dummySign.updateMatrixWorld();
                    const mesh = new THREE.Mesh(geoHorizontal, mat);
                    const scaleFactor = Math.min(1.0, (bData.sx * 0.8) / 4.0);
                    mesh.scale.set(scaleFactor, scaleFactor, 1);
                    const worldPos = new THREE.Vector3(); const worldQuat = new THREE.Quaternion(); const worldScale = new THREE.Vector3();
                    dummySign.matrixWorld.decompose(worldPos, worldQuat, worldScale);
                    mesh.position.copy(worldPos); mesh.quaternion.copy(worldQuat);
                    mesh.castShadow = true;
                    signGroup.add(mesh);
                } else if (choice < 0.65 && bData.sy > 12 && signMaterials.v && signMaterials.v.length > 0) {
                    // 中文豎式
                    const mat = rng.pick(signMaterials.v);
                    const isRight = rng.bool(0.5);
                    const sideDir = isRight ? 1 : -1;
                    let targetY = -halfH + 15;
                    if ((targetY + 2.0) > halfH) targetY = halfH - 2.0 - 0.5;

                    // 1. 位置與旋轉 (維持上一版正確設定)
                    // 位置: 靠近建築側邊 (0.4), 突出於正面牆 (0.8)
                    dummySign.position.set((halfW - 0.1) * sideDir, targetY, -halfD - 0.8);

                    // 旋轉: 寬面垂直於道路
                    dummySign.rotation.set(0, Math.PI / 2, 0);

                    dummySign.updateMatrixWorld();
                    const mesh = new THREE.Mesh(geoVertical, mat);
                    const worldPos = new THREE.Vector3(); const worldQuat = new THREE.Quaternion(); const worldScale = new THREE.Vector3();
                    dummySign.matrixWorld.decompose(worldPos, worldQuat, worldScale);
                    mesh.position.copy(worldPos); mesh.quaternion.copy(worldQuat);
                    mesh.castShadow = true;

                    // --- [修正 3] 雙支架系統 ---
                    const bracketGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6);
                    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

                    // 上支架 (Top Bracket)
                    const bracketTop = new THREE.Mesh(bracketGeo, bracketMat);
                    bracketTop.rotation.z = Math.PI / 2; // 躺平
                    // X=-0.6(接牆), Y=1.5(偏上)
                    bracketTop.position.set(-0.6, 1.5, 0);
                    mesh.add(bracketTop);

                    // 下支架 (Bottom Bracket)
                    const bracketBottom = new THREE.Mesh(bracketGeo, bracketMat);
                    bracketBottom.rotation.z = Math.PI / 2; // 躺平
                    // X=-0.6(接牆), Y=-1.5(偏下)
                    bracketBottom.position.set(-0.6, -1.5, 0);
                    mesh.add(bracketBottom);

                    signGroup.add(mesh);
                }
            });
            cityGroup.add(signGroup);
        }
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
                // [新增] 在這裡插入預計算邏輯
                computeNetworkConflicts(netData);

                networkData = netData;
                simulation = new Simulation(networkData);

                // [新增] 通知優化控制器更新資料
                if (typeof optimizerController !== 'undefined') {
                    optimizerController.setSimulation(simulation);
                }

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

                // --- 關鍵修改：載入完成後，若有 3D 則啟動迴圈 ---
                if (isDisplay3D) {
                    update3DScene();
                    if (!animationFrameId) {
                        lastTimestamp = performance.now();
                        animationFrameId = requestAnimationFrame(simulationLoop);
                    }
                }

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

        // [新增] 清空自定義模型
        customModelsGroup.clear();

        cloudGroup.clear(); // ★ [新增] 清空雲朵

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
            // 優先順序：駕駛 > 巡航 > 無人機 > 一般
            if (driveToggle && driveToggle.checked && driveController && driveController.isActive) {
                // 駕駛模式會自行接管相機
                if (controls) controls.enabled = false;
                // 相機更新在 driveController.update 內執行
            } else if (isFlyoverActive) {
                updateFlyoverCamera();
            } else if (isDroneActive) {
                updateDroneCamera(frameDt);
            } else {
                if (controls) controls.update();
            }

            // ★★★ [新增] 更新城市動畫物件 (摩天輪、雲霄飛車等) ★★★
            // 只有在 3D 模式下才計算動畫，節省效能
            if (animatedCityObjects.length > 0) {
                animatedCityObjects.forEach(obj => {
                    if (obj.update) obj.update(frameDt);
                });
            }
        }

        if (isRunning && simulation) {
            // 1. 先計算模擬時間增量 (包含加速倍率)
            const realDt = (timestamp - lastTimestamp) / 1000.0;
            const simulationDt = Math.min(realDt, 0.1) * simulationSpeed;

            // 2. ★ [修正] 員警邏輯使用 simulationDt，確保與號誌時間同步
            if (policeController && policeToggle && policeToggle.checked) {
                policeController.update(simulationDt);
            }
            // 3. AI (若員警未啟動)
            else if (aiController && aiToggle && aiToggle.checked) {
                aiController.update(simulationDt);
            }

            // 3. 更新模擬核心
            simulation.update(simulationDt);
            simTimeSpan.textContent = simulation.time.toFixed(2);

            // [新增] 優化器更新 (處理採樣計時器)
            if (typeof optimizerController !== 'undefined') {
                optimizerController.update(simulationDt);

                // ★ 新增：更新迭代器 (計時與觸發)
                if (optimizerController.looper) {
                    optimizerController.looper.update(simulationDt);
                }
            }

            const currentIntegerTime = Math.floor(simulation.time);
            if (currentIntegerTime > lastLoggedIntegerTime) {
                updateStatistics(currentIntegerTime);
                lastLoggedIntegerTime = currentIntegerTime;
            }
        }

        if (simulation && driveToggle && driveToggle.checked && driveController) {
            driveController.update(frameDt);
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

        // --- 關鍵確認：停止條件 ---
        // 只有當「沒在跑模擬」且「沒顯示3D」時，才真正停止迴圈
        // 這樣可以保證暫停時，3D 視角(OrbitControls)依然可以操作
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

    // [新增] 偵測器發車器：依據觀測流量產生車輛
    // 請將此類別放在 Simulation 類別之前
    // [修正] 偵測器發車器：依據觀測流量產生車輛 (支援多車種權重)
    class DetectorSpawner {
        constructor(meter, network) {
            this.linkId = meter.linkId;
            // 換算流量：輛/小時 -> 發車間隔(秒)
            this.interval = meter.observedFlow > 0 ? 3600 / meter.observedFlow : Infinity;
            this.spawnTimer = 0; // 初始計時器

            // [修改重點 1] 接收 profiles 列表，而非單一 profileId
            this.spawnProfiles = meter.spawnProfiles || [];

            // 防呆：如果 XML 沒給任何 Profile，給一個預設的
            if (this.spawnProfiles.length === 0) {
                // 嘗試使用舊屬性作為備案
                const fallbackId = meter.spawnProfileId || 'default';
                this.spawnProfiles.push({ profileId: fallbackId, weight: 1 });
            }
        }

        update(dt, network, vehicleIdGenerator) {
            if (this.interval === Infinity) return null;

            this.spawnTimer += dt;
            if (this.spawnTimer >= this.interval) {
                this.spawnTimer -= this.interval;

                const link = network.links[this.linkId];
                if (!link) return null;

                // [修改重點 2] 依據權重選擇車種
                const chosenProfileEntry = this.chooseWithWeight(this.spawnProfiles);
                if (!chosenProfileEntry) return null;

                // 從全域設定中取得該車種的物理參數
                const profile = network.vehicleProfiles[chosenProfileEntry.profileId];

                // 防呆：如果找不到該 Profile 定義 (例如 Import 時漏掉了 GlobalProfiles)
                if (!profile) {
                    // console.warn(`Profile ${chosenProfileEntry.profileId} not found.`);
                    return null;
                }

                // 隨機選擇一條車道發車
                const laneCount = Object.keys(link.lanes).length;
                const laneIndex = Math.floor(Math.random() * laneCount);

                // 建立車輛
                const vehicleId = `v-flow-${vehicleIdGenerator()}`;

                return new Vehicle(vehicleId, profile, [this.linkId], network, laneIndex);
            }
            return null;
        }

        // [修改重點 3] 新增權重選擇輔助函數
        chooseWithWeight(items) {
            if (!items || items.length === 0) return null;

            const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
            if (totalWeight <= 0) return items[0];

            let random = Math.random() * totalWeight;
            for (const item of items) {
                random -= item.weight;
                if (random <= 0) return item;
            }
            return items[items.length - 1];
        }
    }
    // --- [新增] 幾何與衝突預計算工具 ---

    // 1. 擴充 Geom 工具：判斷兩線段是否相交
    Geom.Utils.getLineIntersection = function (p0, p1, p2, p3) {
        const s1_x = p1.x - p0.x;
        const s1_y = p1.y - p0.y;
        const s2_x = p3.x - p2.x;
        const s2_y = p3.y - p2.y;
        const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
        const t = (s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);

        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
            return { x: p0.x + (t * s1_x), y: p0.y + (t * s1_y) }; // 交點
        }
        return null; // 不相交
    };

    // 2. 核心函式：計算全路網的衝突矩陣
    function computeNetworkConflicts(netData) {
        console.log("正在預計算路口衝突矩陣...");

        // 輔助：將 Bezier 轉為多段線段以便檢測交叉
        function getPolylineFromTransition(trans) {
            if (!trans.bezier || trans.bezier.points.length < 2) return [];
            // 取樣 10 個點
            const points = [];
            const [p0, p1, p2, p3] = trans.bezier.points;
            for (let i = 0; i <= 10; i++) {
                points.push(Geom.Bezier.getPoint(i / 10, p0, p1, p2, p3));
            }
            return points;
        }

        // 檢查兩條折線是否相交
        function isPolylineIntersecting(poly1, poly2) {
            for (let i = 0; i < poly1.length - 1; i++) {
                for (let j = 0; j < poly2.length - 1; j++) {
                    if (Geom.Utils.getLineIntersection(poly1[i], poly1[i + 1], poly2[j], poly2[j + 1])) {
                        return true;
                    }
                }
            }
            return false;
        }

        // 遍歷所有路口 (Nodes)
        Object.values(netData.nodes).forEach(node => {
            if (!node.transitions || node.transitions.length < 2) return;

            // 兩兩比對該路口內的所有路徑
            for (let i = 0; i < node.transitions.length; i++) {
                const t1 = node.transitions[i];
                if (!t1.conflictingTransitionIds) t1.conflictingTransitionIds = []; // 初始化

                const poly1 = getPolylineFromTransition(t1);
                // 判斷 t1 是直行還是轉彎 (利用起終點角度差)
                const t1IsTurn = Math.abs(t1.sourceLaneIndex - t1.destLaneIndex) > 0 || t1.sourceLinkId !== t1.destLinkId;
                // 這裡簡單判定：若不同 Link 視為轉彎，這在十字路口可能不夠精確，
                // 但對於衝突檢測，我們主要依賴幾何交叉。

                for (let j = 0; j < node.transitions.length; j++) {
                    if (i === j) continue;
                    const t2 = node.transitions[j];

                    // 排除條件 A：來自同一條 Link 的同一條車道 (分流不撞)
                    if (t1.sourceLinkId === t2.sourceLinkId && t1.sourceLaneIndex === t2.sourceLaneIndex) continue;

                    // 排除條件 B：去往同一條 Link 的同一條車道 (這是匯流，由原有的 findLeader 邏輯處理)
                    if (t1.destLinkId === t2.destLinkId && t1.destLaneIndex === t2.destLaneIndex) continue;

                    // 檢測幾何交叉
                    const poly2 = getPolylineFromTransition(t2);
                    if (isPolylineIntersecting(poly1, poly2)) {
                        t1.conflictingTransitionIds.push(t2.id);
                    }
                }
            }
        });
        console.log("衝突矩陣計算完成。");
    }


    // [修改] Simulation 類別：整合了 OD 模式與 Flow 模式的初始化與更新邏輯
    class Simulation {
        constructor(network) {
            this.network = network;
            this.time = 0;
            this.vehicles = [];
            this.vehicleIdCounter = 0;

            // --- 建立停止線快速查詢表 (區分車種) ---
            this.stopLineMap = {};     // 給汽車用 (需退後)
            this.motoStopLineMap = {}; // 給機車用 (維持原位)

            // --- 建立路口待轉區索引 ---
            this.twoStageBoxMap = {}; // Key: nodeId, Value: Box Object
            if (network.roadMarkings) {
                network.roadMarkings.forEach(mark => {
                    if (mark.type === 'two_stage_box') {
                        // [新增] 初始化待轉區車輛計數器
                        mark.waitingCount = 0;
                        // 如果 XML 有定義 nodeId 最好，沒有的話可能要用座標判定
                        // 這裡假設我們將 box 關聯到最近的 Node
                        let targetNodeId = mark.nodeId;

                        // 如果 XML 沒寫 nodeId，嘗試用距離尋找最近的路口
                        if (!targetNodeId) {
                            let minDst = Infinity;
                            for (const nid in network.nodes) {
                                const node = network.nodes[nid];
                                // 簡單計算到路口多邊形中心的距離
                                // (這裡簡化運算，實務上可視需要精確化)
                                if (node.polygon && node.polygon.length > 0) {
                                    const cx = node.polygon[0].x; // 概略位置
                                    const cy = node.polygon[0].y;
                                    const d = Math.hypot(mark.x - cx, mark.y - cy);
                                    if (d < 60 && d < minDst) { // 30米內
                                        minDst = d;
                                        targetNodeId = nid;
                                    }
                                }
                            }
                        }

                        if (targetNodeId) {
                            // 可能一個路口有多個待轉格，這裡簡化為存入陣列
                            if (!this.twoStageBoxMap[targetNodeId]) {
                                this.twoStageBoxMap[targetNodeId] = [];
                            }
                            this.twoStageBoxMap[targetNodeId].push(mark);
                        }
                    }
                });
            }

            // ★★★★★ [關鍵修正] 將建立好的 Map 掛載到 network 物件上，讓 Vehicle 讀得到 ★★★★★
            this.network.twoStageBoxMap = this.twoStageBoxMap;

            if (network.roadMarkings) {
                // 第一階段：載入標準停止線 (Baseline)
                network.roadMarkings.forEach(mark => {
                    if (mark.type === 'stop_line' && mark.linkId && mark.laneIndices) {
                        if (!this.stopLineMap[mark.linkId]) this.stopLineMap[mark.linkId] = {};
                        if (!this.motoStopLineMap[mark.linkId]) this.motoStopLineMap[mark.linkId] = {};

                        mark.laneIndices.forEach(laneIdx => {
                            this.stopLineMap[mark.linkId][laneIdx] = mark.position;
                            this.motoStopLineMap[mark.linkId][laneIdx] = mark.position;
                        });
                    }
                });

                // 第二階段：偵測機車停等區，並大幅修正一般車輛的停止線
                network.roadMarkings.forEach(mark => {
                    // [修正] 排除 'two_stage_box' (待轉區)，只針對 'waiting_area' (停等區) 計算
                    if (mark.type !== 'stop_line' && mark.type !== 'two_stage_box' && mark.linkId && mark.laneIndices) {
                        if (!this.stopLineMap[mark.linkId]) this.stopLineMap[mark.linkId] = {};

                        // [關鍵修正] 計算汽車應停止的虛擬位置
                        // 1. mark.position: 機車停等區的最前端 (下游停止線)
                        // 2. mark.length: 扣除全長，退回到機車停等區的最後端 (上游白線)
                        // 3. 額外扣除 3.0m: 
                        //    車輛座標位於車身中心，若不額外扣除，車頭(約2m)會伸進格子。
                        //    扣除 3m 可確保車頭與白線之間還有約 0.5~1m 的視覺緩衝。
                        const upstreamEdge = mark.position - mark.length - 0.5;

                        mark.laneIndices.forEach(laneIdx => {
                            const currentStopPos = this.stopLineMap[mark.linkId][laneIdx];

                            // 若該車道原本有停止線，比較兩者位置，取更上游(數值更小)者
                            if (currentStopPos !== undefined) {
                                if (upstreamEdge < currentStopPos) {
                                    this.stopLineMap[mark.linkId][laneIdx] = upstreamEdge;
                                }
                            } else {
                                // 若原本沒有停止線，則以此作為虛擬停止線
                                this.stopLineMap[mark.linkId][laneIdx] = upstreamEdge;
                            }
                        });
                    }
                });
            }

            // 將 Map 掛載到 network 物件上
            this.network.stopLineMap = this.stopLineMap;
            this.network.motoStopLineMap = this.motoStopLineMap;

            // 1. 載入靜態車輛
            if (network.staticVehicles) {
                for (const staticVehicleConfig of network.staticVehicles) {
                    const { profile, initialState, startLinkId, startLaneIndex, destinationNodeId } = staticVehicleConfig;
                    const startLink = network.links[startLinkId];
                    if (!startLink) continue;

                    let route = [startLinkId];
                    if (destinationNodeId) {
                        const nextNodeId = startLink.destination;
                        const remainingPath = network.pathfinder.findRoute(nextNodeId, destinationNodeId);
                        if (remainingPath) route = [startLinkId, ...remainingPath];
                    }

                    const vehicle = new Vehicle(`v-static-${this.vehicleIdCounter++}`, profile, route, network, startLaneIndex, initialState);
                    this.vehicles.push(vehicle);
                }
            }

            // 2. 載入 Spawners
            this.spawners = network.spawners.map(s => new Spawner(s, network.pathfinder));

            // 3. 載入偵測器 Spawners
            this.detectorSpawners = [];
            //if (network.navigationMode === 'HYBRID') {
            if (network.speedMeters) {
                network.speedMeters.forEach(meter => {
                    if (meter.isSource && meter.observedFlow > 0) {
                        this.detectorSpawners.push(new DetectorSpawner(meter, network));
                    }
                });
            }
            if (network.sectionMeters) {
                network.sectionMeters.forEach(meter => {
                    if (meter.isSource && meter.observedFlow > 0) {
                        this.detectorSpawners.push(new DetectorSpawner(meter, network));
                    }
                });
            }
            //}

            // 4. 其他初始化
            this.trafficLights = network.trafficLights;
            this.speedMeters = (network.speedMeters || []).map(m => ({ ...m, readings: {}, maxAvgSpeed: 0 }));
            this.sectionMeters = (network.sectionMeters || []).map(m => ({ ...m, completedVehicles: [], maxAvgSpeed: 0, lastAvgSpeed: null }));
        }

        getStopLinePosition(linkId, laneIndex) {
            if (this.stopLineMap[linkId] && this.stopLineMap[linkId][laneIndex] !== undefined) {
                return this.stopLineMap[linkId][laneIndex];
            }
            return null;
        }

        update(dt) {
            if (dt <= 0) return;
            this.time += dt;

            this.trafficLights.forEach(tfl => tfl.update(this.time));

            this.spawners.forEach(spawner => {
                const newVehicle = spawner.update(dt, this.network, `v-spawned-${this.vehicleIdCounter}`, this.network.navigationMode);
                if (newVehicle) {
                    this.vehicles.push(newVehicle);
                    this.vehicleIdCounter++;
                }
            });

            this.detectorSpawners.forEach(dsp => {
                const newVehicle = dsp.update(dt, this.network, () => this.vehicleIdCounter++);
                if (newVehicle) {
                    this.vehicles.push(newVehicle);
                }
            });

            this.vehicles.forEach(vehicle => vehicle.update(dt, this.vehicles, this));
            this.vehicles = this.vehicles.filter(v => !v.finished);
        }
    }

    class Pathfinder { constructor(links, nodes) { this.adj = new Map(); for (const linkId in links) { const link = links[linkId]; if (!this.adj.has(link.source)) this.adj.set(link.source, []); this.adj.get(link.source).push({ linkId: link.id, toNode: link.destination }); } } findRoute(startNodeId, endNodeId) { if (!startNodeId || !endNodeId) return null; const q = [[startNodeId, []]]; const visited = new Set([startNodeId]); while (q.length > 0) { const [currentNodeId, path] = q.shift(); if (currentNodeId === endNodeId) return path; const neighbors = this.adj.get(currentNodeId) || []; for (const neighbor of neighbors) { if (!visited.has(neighbor.toNode)) { visited.add(neighbor.toNode); const newPath = [...path, neighbor.linkId]; q.push([neighbor.toNode, newPath]); } } } return null; } }
    class TrafficLightController {
        constructor(config) {
            this.nodeId = config.nodeId;
            this.schedule = config.schedule;
            this.lights = config.lights;
            this.timeShift = config.timeShift || 0;
            this.cycleDuration = this.schedule.reduce((sum, p) => sum + p.duration, 0);
            this.turnGroupStates = {};
        }

        update(time) {
            // ... (保持原樣) ...
            if (this.cycleDuration <= 0) return;
            const effectiveTime = time - this.timeShift;
            let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration;

            for (const period of this.schedule) {
                if (timeInCycle < period.duration) {
                    for (const [turnGroupId, signal] of Object.entries(period.signals)) {
                        this.turnGroupStates[turnGroupId] = signal;
                    }
                    return;
                }
                timeInCycle -= period.duration;
            }
        }

        getSignalForTurnGroup(turnGroupId) {
            return this.turnGroupStates[turnGroupId] || 'Green';
        }

        getPhaseDetails(time) {
            // ... (保持原樣) ...
            if (this.cycleDuration <= 0) return { duration: 1, remaining: 0 };
            const effectiveTime = time - this.timeShift;
            let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration;

            for (const period of this.schedule) {
                if (timeInCycle < period.duration) {
                    return {
                        duration: period.duration,
                        remaining: Math.max(0, period.duration - timeInCycle)
                    };
                }
                timeInCycle -= period.duration;
            }
            return { duration: 1, remaining: 0 };
        }

        // ★★★ [新增此方法] 計算距離下一次綠燈還需等待多久 (累積紅燈秒數) ★★★
        getTimeToNextGreen(time, targetGroupIds) {
            if (this.cycleDuration <= 0 || !targetGroupIds || targetGroupIds.length === 0) return 0;

            const effectiveTime = time - this.timeShift;
            let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration;

            // 1. 找到當前所在的週期索引 (index)
            let currentPeriodIndex = 0;
            for (let i = 0; i < this.schedule.length; i++) {
                if (timeInCycle < this.schedule[i].duration) {
                    currentPeriodIndex = i;
                    break;
                }
                timeInCycle -= this.schedule[i].duration;
            }

            // 檢查當前是否已經是綠燈 (若任一目標群組為綠燈，視為綠燈)
            const currentPeriod = this.schedule[currentPeriodIndex];
            const isCurrentGreen = targetGroupIds.some(gid => currentPeriod.signals[gid] === 'Green');

            // 如果現在就是綠燈，等待時間為 0 (由外部邏輯處理綠燈倒數)
            if (isCurrentGreen) return 0;

            // 如果現在是紅/黃燈，開始累加時間
            // 初始等待時間 = 當前週期剩餘時間 (timeInCycle 此時已扣除前面的週期，剩下的就是已過時間)
            let totalWaitTime = currentPeriod.duration - timeInCycle;

            // 2. 往後遍歷週期，直到找到綠燈
            let i = (currentPeriodIndex + 1) % this.schedule.length;
            let safetyCounter = 0; // 防止無窮迴圈

            while (i !== currentPeriodIndex && safetyCounter < this.schedule.length) {
                const period = this.schedule[i];

                // 檢查這個週期是否變綠燈了
                const isGreen = targetGroupIds.some(gid => period.signals[gid] === 'Green');

                if (isGreen) {
                    // 找到綠燈了！停止累加
                    return totalWaitTime;
                } else {
                    // 還是紅/黃燈，累加此週期全部時間
                    totalWaitTime += period.duration;
                }

                i = (i + 1) % this.schedule.length;
                safetyCounter++;
            }

            // 如果繞了一圈都沒綠燈 (全紅)，回傳累積時間
            return totalWaitTime;
        }
    }
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
            this.isPlayerControlled = false; // 新增屬性

            this.twoStageState = 'none'; // 'none', 'moving_to_box', 'waiting', 'leaving_box'
            this.waitingBox = null;      // 暫存目標待轉格

            // =============================================================
            // [自動區分車種]
            // 若車寬小於 1.0 公尺，自動判定為機車。
            // 這將影響：紅燈停車位置、鑽車行為、橫向物理特性。
            // =============================================================
            this.isMotorcycle = this.width < 1.2;

            // --- 駕駛模型參數 ---
            this.originalMaxSpeed = profile.params.maxSpeed;
            this.maxSpeed = profile.params.maxSpeed;
            this.maxAccel = profile.params.maxAcceleration;
            this.comfortDecel = profile.params.comfortDeceleration;
            this.minGap = profile.params.minDistance;
            this.headwayTime = profile.params.desiredHeadwayTime;
            this.delta = 4; // Acceleration exponent

            // ★★★ [修正 1] 新增：備份原始參數，供起步後恢復使用 ★★★
            this.originalMinGap = this.minGap;
            this.originalHeadway = this.headwayTime;
            this.originalMaxAccel = this.maxAccel;
            this.swarmTimer = 0; // 確保初始化

            // --- 橫向控制參數 ---
            this.lateralOffset = 0;       // 當前偏離車道中心的距離 (+左, -右)
            this.targetLateralOffset = 0; // 目標偏移量
            this.lateralSpeed = 1.5;      // 汽車橫向移動速度 (m/s)

            // --- 運動狀態 ---
            this.accel = 0;
            this.speed = initialState ? initialState.speed : 0;
            this.distanceOnPath = initialState ? initialState.distanceOnPath : 0;
            this.x = 0;
            this.y = 0;
            this.angle = 0;

            // --- 導航狀態 ---
            this.route = route; // Array of Link IDs
            this.currentLinkIndex = 0;
            this.currentLinkId = route[0];
            this.currentLaneIndex = startLaneIndex;
            this.finished = false;
            this.state = 'onLink'; // 'onLink', 'inIntersection', 'parking_maneuver'

            // --- 路徑與幾何 ---
            this.currentPath = null;
            this.currentPathLength = 0;
            this.currentTransition = null;
            this.nextSignIndex = 0;

            // --- 換車道狀態 ---
            this.laneChangeState = null;
            this.laneChangeGoal = null;
            this.laneChangeCooldown = 0;

            // --- 數據收集 ---
            this.sectionEntryData = {};

            // --- 停車相關狀態 ---
            this.parkingTask = null; // { lotId, duration, gate, connector, targetSpot, occupiedSlot }
            this.parkingState = 'none'; // 'none', 'approaching', 'entering', 'parked', 'exiting'
            this.parkingTimer = 0;
            this.parkingStartSimTime = null;
            this.parkingAnimTime = 0;
            this.parkingOriginPos = { x: 0, y: 0, angle: 0 };
            this.parkingTargetPos = { x: 0, y: 0, angle: 0 };
            this.checkedParkingGates = new Set(); // 防止重複判定

            // --- 機車專屬：初始化隨機擺動與決策參數 ---
            if (this.isMotorcycle) {
                this.wanderPhase = Math.random() * Math.PI * 2;
                this.wanderSpeed = 0.5 + Math.random() * 1.5;
                this.wanderAmplitude = 0.05 + Math.random() * 0.1;
                this.decisionTimer = 1.0 + Math.random() * 4.0;

                // [修改] 強制機車偏好設為 0 (居中)，不再隨機靠左或靠右
                this.preferredBias = 0;

                // 決定騎乘偏好 (靠左/居中/靠右)
                const rand = Math.random();
                if (rand < 0.6) {
                    this.preferredBias = -0.5 - (Math.random() * 0.4); // 靠右
                } else if (rand < 0.8) {
                    this.preferredBias = (Math.random() - 0.5) * 0.4;  // 居中
                } else {
                    this.preferredBias = 0.5 + (Math.random() * 0.4);  // 靠左(鑽縫)
                }
            }

            this.enterLinkTime = 0; // ★ 新增屬性：記錄進入 Link 的時間

            // 初始化位置
            this.initializePosition(network);
        }

        // ==================================================================================
        // 核心更新循環
        // ==================================================================================
        update(dt, allVehicles, simulation) {
            // 如果是玩家控制，跳過大部分 AI 邏輯
            if (this.isPlayerControlled) {
                // 1. 更新位置 (物理積分) - 簡單版
                // 注意：driveController 已經設定了 this.accel 和 this.targetLateralOffset

                // 速度更新
                this.speed += this.accel * dt;
                if (this.speed < 0) this.speed = 0;

                // 距離更新
                this.distanceOnPath += this.speed * dt;

                // 橫向位置更新 (利用現有的 updateLateralPosition 方法，它會讀取 targetLateralOffset)
                this.updateLateralPosition(dt);

                // 路徑轉換 (處理過彎與切換 Link)
                if (this.distanceOnPath > this.currentPathLength) {
                    const leftoverDistance = this.distanceOnPath - this.currentPathLength;
                    this.handlePathTransition(leftoverDistance, simulation.network);
                }

                // 更新繪圖位置
                this.updateDrawingPosition(simulation.network);

                // ★ 收集數據與 Meter (保留計分功能)
                const oldDistanceOnPath = this.distanceOnPath - this.speed * dt;
                this.collectMeterData(oldDistanceOnPath, simulation);

                return; // ★ 直接返回，不執行 IDM 跟車、換道決策等 AI 邏輯
            }
            if (this.launchDelay > 0) {
                this.launchDelay -= dt;
                if (this.launchDelay <= 0) {
                    // 延遲結束，正式啟動蜂群模式
                    this.swarmTimer = 4.0;
                    this.minGap = 0.1;
                    this.headwayTime = 0.2;
                    this.maxAccel = this.originalMaxAccel * 1.5;
                    this.launchDelay = 0;
                } else {
                    // 還在反應時間內，保持靜止或維持原狀
                    // 如果是剛起步，這會讓它多停留在原地一下
                }
            }

            if (this.finished) return;
            const network = simulation.network;

            // 1. 停車狀態機邏輯
            if (this.parkingTask) {
                if (this.state === 'onLink' && this.parkingState === 'none') {
                    if (this.currentLinkId === this.parkingTask.connector.linkId) {
                        const distToGate = this.parkingTask.connector.distance;
                        if (Math.abs(this.distanceOnPath - distToGate) < 5.0) {
                            this.parkingState = 'entering';
                            this.state = 'parking_maneuver';
                            this.parkingAnimTime = 0;
                            this.speed = 10 / 3.6;
                            this.parkingOriginPos = { x: this.x, y: this.y, angle: this.angle };
                            return;
                        }
                    }
                } else if (this.parkingState === 'entering') {
                    this.handleParkingEntry(dt, simulation);
                    return;
                } else if (this.parkingState === 'parked') {
                    if (this.parkingStartSimTime === null) this.parkingStartSimTime = simulation.time;
                    const elapsed = simulation.time - this.parkingStartSimTime;
                    if (elapsed < this.parkingTask.duration) return;
                    this.prepareForExit(network);
                    return;
                } else if (this.parkingState === 'exiting') {
                    this.handleParkingExit(dt, simulation);
                    if (this.parkingState === 'none') {
                        this.state = 'onLink';
                        this.speed = 0;
                        if (this.parkingTask && this.parkingTask.gate) {
                            this.checkedParkingGates.add(this.parkingTask.gate.id);
                        }
                        this.parkingTask = null;
                    } else {
                        return;
                    }
                }
            }

            // 2. 正常行駛邏輯
            if (this.laneChangeCooldown > 0) { this.laneChangeCooldown -= dt; }

            // 檢查動態停車機會 (Flow Mode)
            this.checkForDynamicParking(network);

            // 機車動力學更新
            if (this.isMotorcycle) {
                this.updateMotorcycleDynamics(dt, network, allVehicles);
            }

            // 更新橫向位置
            this.updateLateralPosition(dt);

            // 機車鑽車決策
            if (this.isMotorcycle && this.state === 'onLink') {
                this.decideLaneFiltering(allVehicles, network);
            }

            // =================================================================
            // ★★★ [修正 2] 綠燈起步加速邏輯 (Green Light Launch) ★★★
            // 目的：當紅燈轉綠燈時，強制縮小安全距離，讓機車能像真實世界一樣「彈射起步」
            // =================================================================
            if (this.isMotorcycle) {
                // 1. 管理計時器與恢復參數
                // [修改後]
                // 需先在 constructor 初始化 this.swarmTransitionDuration = 0;
                if (this.swarmTimer > 0) {
                    this.swarmTimer -= dt;

                    // 倒數結束，進入過渡期
                    if (this.swarmTimer <= 0) {
                        this.swarmTimer = 0;
                        this.swarmTransitionDuration = 2.0; // 設定 2 秒過渡期
                    }
                } else if (this.swarmTransitionDuration > 0) {
                    // 處於過渡期：線性插值恢復參數
                    this.swarmTransitionDuration -= dt;
                    const t = 1.0 - (this.swarmTransitionDuration / 2.0); // t 從 0 變到 1

                    // 輔助函式 (也可寫在外面)
                    const lerp = (start, end, alpha) => start + (end - start) * alpha;

                    // 蜂群參數（調整為合理值）vs 原始參數
                    const swarmMinGap = 0.2;
                    const swarmHeadway = 0.3;
                    const swarmAccel = Math.min(4.5, (this.originalMaxAccel || 3.5) * 1.3);

                    // 漸變恢復
                    this.minGap = lerp(swarmMinGap, this.originalMinGap, t);
                    this.headwayTime = lerp(swarmHeadway, this.originalHeadway, t);
                    this.maxAccel = lerp(swarmAccel, this.originalMaxAccel, t);

                    // 過渡結束，確保數值精確
                    if (this.swarmTransitionDuration <= 0) {
                        this.minGap = this.originalMinGap;
                        this.headwayTime = this.originalHeadway;
                        this.maxAccel = this.originalMaxAccel;
                    }
                }
                // 2. 觸發檢測：如果處於低速且未啟動蜂群模式，檢查號誌
                else if (this.speed < 2.0 && this.state === 'onLink') {
                    this.checkGreenLightLaunch(network);
                }
            }
            // =================================================================

            // Flow Mode 導航決策
            const distToEnd = this.currentPathLength - this.distanceOnPath;
            const hasNextRoute = this.currentLinkIndex + 1 < this.route.length;

            // [修改] 提早決策：只要進入路段，且距離終點小於 2500米 (或任意長距離) 就決定
            // 這樣可以讓機車有足夠的時間從內側車道慢慢切到外側，並防止其在未知路徑時錯誤地超車到內側
            if (this.state === 'onLink' && !hasNextRoute && distToEnd < 2500) {
                this.decideNextLink(network);
            }

            // 換車道決策與執行
            if (this.state === 'onLink') { this.manageLaneChangeProcess(dt, network, allVehicles); }

            // 檢查速限
            if (this.state === 'onLink') { this.checkRoadSigns(network); }
            // ==========================================
            // [新增] 兩段式左轉狀態機更新
            // ==========================================
            // [修正優化版] Step 4: 兩段式左轉狀態機更新
            // ==========================================
            // ==========================================
            // [修正優化版] Step 4: 兩段式左轉狀態機更新
            // ==========================================
            if (this.state === 'inIntersection' && this.twoStageState && this.twoStageState !== 'none') {

                // --- 狀態 1: 正前往待轉區 (Moving) ---
                if (this.twoStageState === 'moving_to_box') {
                    // [修正] 到達判定：距離終點非常近時
                    if (this.distanceOnPath >= this.currentPathLength - 0.5) { // 縮小容許值，確保停在格子裡

                        // 強制狀態切換
                        this.twoStageState = 'waiting';
                        this.speed = 0; // 強制煞停
                        this.accel = 0;
                        this.distanceOnPath = this.currentPathLength; // 釘在終點

                        // 調整車頭朝向：轉向目標道路 (Next Link)
                        const nextLinkId = this.route[this.currentLinkIndex + 1];
                        const nextLink = network.links[nextLinkId];
                        if (nextLink) {
                            const lanes = Object.values(nextLink.lanes);
                            if (lanes.length > 0 && lanes[0].path.length > 1) {
                                const p1 = lanes[0].path[0];
                                const p2 = lanes[0].path[1];
                                this.angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                            }
                        }

                        // 計算起步延遲 (模擬反應時間 + 排隊順序)
                        const estimatedIdx = this.waitingBox ? Math.max(0, this.waitingBox.waitingCount - 1) : 0;
                        const capacityPerRow = 4;
                        const row = Math.floor(estimatedIdx / capacityPerRow);

                        // 第一排反應快，後面反應慢
                        this.startUpDelay = 0.5 + (row * 0.3) + (Math.random() * 0.5);
                    }
                }

                // --- 狀態 2: 在待轉區停等 (Waiting) ---
                else if (this.twoStageState === 'waiting') {
                    // [重要] 強制鎖定位置與速度，防止滑動
                    this.speed = 0;
                    this.accel = 0;

                    // 檢查號誌：只有目標方向綠燈才能走
                    const canGo = this.checkTwoStageSignal(network);

                    if (canGo) {
                        // 處理反應時間延遲
                        if (this.startUpDelay > 0) {
                            this.startUpDelay -= dt;
                            return; // 繼續等
                        }

                        // 綠燈且反應時間到 -> 出發
                        this.twoStageState = 'leaving_box';

                        // 減少待轉區計數
                        if (this.waitingBox && this.waitingBox.waitingCount > 0) {
                            this.waitingBox.waitingCount--;
                        }

                        // [路徑生成] 準備離開格子進入目標車道
                        // (這裡保持原有的 intelligent lane selection 邏輯，不做大幅變動，確保相容性)
                        const nextLinkId = this.route[this.currentLinkIndex + 1];
                        const nextLink = network.links[nextLinkId];
                        const allLaneIndices = Object.keys(nextLink.lanes).map(Number).sort((a, b) => a - b);

                        // 找最近的車道
                        let targetLaneIdx = allLaneIndices[0];
                        let minDistSq = Infinity;
                        allLaneIndices.forEach(idx => {
                            const laneStart = nextLink.lanes[idx].path[0];
                            const d2 = (this.x - laneStart.x) ** 2 + (this.y - laneStart.y) ** 2;
                            if (d2 < minDistSq) { minDistSq = d2; targetLaneIdx = idx; }
                        });

                        const targetLane = nextLink.lanes[targetLaneIdx];
                        this.pendingLaneIndex = targetLaneIdx;

                        // 計算切入偏移量
                        const p1_next = targetLane.path[0];
                        const p2_next = targetLane.path[1];
                        const angle_next = Math.atan2(p2_next.y - p1_next.y, p2_next.x - p1_next.x);
                        const cosN = Math.cos(angle_next);
                        const sinN = Math.sin(angle_next);
                        const nx = -sinN;
                        const ny = cosN;
                        const dx = this.x - p1_next.x;
                        const dy = this.y - p1_next.y;
                        const currentLateralOffset = dx * nx + dy * ny;
                        const maxSafe = (targetLane.width / 2) - (this.width / 2) - 0.1;
                        this.pendingLateralOffset = Math.max(-maxSafe, Math.min(maxSafe, currentLateralOffset));

                        // 設定路徑 (直線加速)
                        const startPos = { x: this.x, y: this.y };
                        const endPos = {
                            x: p1_next.x + nx * this.pendingLateralOffset,
                            y: p1_next.y + ny * this.pendingLateralOffset
                        };

                        // 設定起步參數
                        this.speed = 1.5; // 給予初速防止停滯
                        this.accel = 2.0;
                        this.swarmTimer = 3.0; // 啟動群體模式

                        // 建立離開路徑
                        const distDirect = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
                        // 如果距離很短，直接用直線；距離長用貝茲
                        if (distDirect < 5.0) {
                            this.currentPath = [startPos, endPos];
                            this.currentPathLength = distDirect;
                        } else {
                            const controlLen = distDirect * 0.3;
                            const p1 = { x: startPos.x + Math.cos(this.angle) * controlLen, y: startPos.y + Math.sin(this.angle) * controlLen };
                            const p2 = { x: endPos.x - cosN * controlLen, y: endPos.y - sinN * controlLen };
                            this.currentPath = [startPos, p1, p2, endPos];
                            this.currentPathLength = Geom.Bezier.getLength(startPos, p1, p2, endPos);
                        }

                        this.distanceOnPath = 0;
                        this.waitingBox = null;
                    }
                }
            }
            // ==========================================
            // 跟車模型 (IDM)
            const { leader, gap } = this.findLeader(allVehicles, network);

            // 起步加速邏輯（簡化版）
            // 如果處於起步模式且前方空曠，使用較高但合理的加速度
            if (this.isMotorcycle && this.swarmTimer > 0 && gap > 5.0) {
                // 轉彎時加速度打折
                const corneringFactor = (this.state === 'inIntersection') ? 0.6 : 1.0;

                // 使用 IDM 公式但限制最大加速度
                const idmAccel = this.maxAccel * (1 - Math.pow(this.speed / this.maxSpeed, this.delta));
                this.accel = Math.min(4.0 * corneringFactor, Math.max(2.5 * corneringFactor, idmAccel));
            } else {
                // 標準 IDM 公式
                const s_star = this.minGap + Math.max(0, this.speed * this.headwayTime + (this.speed * (this.speed - (leader ? leader.speed : 0))) / (2 * Math.sqrt(this.maxAccel * this.comfortDecel)));
                this.accel = this.maxAccel * (1 - Math.pow(this.speed / this.maxSpeed, this.delta) - Math.pow(s_star / gap, 2));

                // 機車防過度減速：當接近路口但無實際前車時，維持最小加速度
                if (this.isMotorcycle && !leader && gap > 2.0 && gap < 15.0) {
                    // gap 來自下游預判，但沒有實際前車，維持正加速度
                    this.accel = Math.max(this.accel, 0.5);
                }
            }

            // 限制加速度在合理範圍內（機車最大 4.5 m/s²）
            if (this.isMotorcycle) {
                this.accel = Math.min(this.accel, 4.5);
            }
            // =================================================================
            // ★★★ [優化] 強化追撞防護 (強制物理速度耦合) ★★★
            // =================================================================
            if (this.isMotorcycle && leader) {
                // 1. 計算接近速度 (相對速度)
                // speedDiff > 0 代表我在接近他，且這數值越大代表來得越快
                let speedDiff = this.speed - (leader ? leader.speed : 0);
                // 2. 判定極危險狀況 (不再限制前車速度為 3.0，只看間距與相對速度)
                // 條件 A: 距離非常近 (< 1.5米)
                // 條件 B: 對方速度明顯比我慢 (speedDiff > 1.0 m/s)
                // 條件 C: 已經發生物理重疊 (gap <= 0，這是緊急最後一道防線)
                if (gap <= 0) {
                    // 緊急煞停，這是絕對的
                    this.accel = -10.0;
                } else if (gap < 1.5 && speedDiff > 1.0) {
                    // 危險急煞：前車可能在加速，但我追得太快太近
                    this.accel = -8.5;
                }
                // 3. 保留原本的起步防穿模邏輯 (處理低速跟隨)
                else if (gap < 2.5 && speedDiff > 0) {
                    // 低速防追尾：這處理塞車或怠速狀態
                    if (speedDiff > 1.5) {
                        // 如果我比他快 1.5m/s 以上，不管他多慢，我都急煞
                        this.accel = -9.0;
                    } else if (leader.speed < 2.0) {
                        // 如果他快停了，而我還在動，強制同步速度（耦合）
                        this.accel = -3.0;
                    } else {
                        // 輕微限速，防止追尾輕微碰撞
                        if (speedDiff > 0.2) {
                            this.accel = -2.0;
                        }
                    }
                }
            }
            // =================================================================
            // 更新速度與位置
            this.speed += this.accel * dt;
            if (this.speed < 0) this.speed = 0;

            const oldDistanceOnPath = this.distanceOnPath;
            const isStuckAtEnd = gap <= 0.1 && (this.currentPathLength - this.distanceOnPath) <= 0.1;

            if (isStuckAtEnd) {
                this.distanceOnPath = this.currentPathLength;
                this.speed = 0;
            } else {
                this.distanceOnPath += this.speed * dt;
            }

            // 收集數據
            this.collectMeterData(oldDistanceOnPath, simulation);

            // 路徑轉換
            if (this.distanceOnPath > this.currentPathLength) {
                const leftoverDistance = this.distanceOnPath - this.currentPathLength;
                this.handlePathTransition(leftoverDistance, network);
            }

            // 更新繪圖位置
            if (!this.finished) this.updateDrawingPosition(network);
        }

        // ==================================================================================
        // 停車邏輯
        // ==================================================================================
        checkForDynamicParking(network) {
            if (this.state !== 'onLink' || this.parkingState !== 'none' || this.parkingTask) return;
            for (const lot of network.parkingLots) {
                if (!lot.attractionProb || lot.attractionProb <= 0) continue;
                const validGates = lot.gates.filter(g => g.connector && g.connector.linkId === this.currentLinkId && (g.type === 'entry' || g.type === 'bidirectional'));
                for (const gate of validGates) {
                    if (this.checkedParkingGates.has(gate.id)) continue;
                    const distToGate = gate.connector.distance;
                    const distDiff = distToGate - this.distanceOnPath;
                    if (distDiff > 0 && distDiff < 50) {
                        this.checkedParkingGates.add(gate.id);
                        if (Math.random() * 100 < lot.attractionProb) {
                            const slotData = this.getEmptySlotInLot(lot, gate.x, gate.y);
                            if (slotData) {
                                const durationSeconds = (lot.stayDuration || 1) * 60;
                                this.parkingTask = {
                                    lotId: lot.id,
                                    duration: durationSeconds,
                                    gate: gate,
                                    connector: gate.connector,
                                    targetSpot: slotData,
                                    occupiedSlot: slotData.slot
                                };
                                return;
                            }
                        }
                    }
                }
            }
        }

        assignParkingTask(stopConfig, network) {
            const lot = network.parkingLots.find(p => p.id === stopConfig.parkingLotId);
            if (!lot || !lot.gates || lot.gates.length === 0) return;
            const validGates = [];
            for (const gate of lot.gates) {
                if (gate.connector && this.route.includes(gate.connector.linkId) && (gate.type === 'entry' || gate.type === 'bidirectional')) {
                    validGates.push(gate);
                }
            }
            if (validGates.length > 0) {
                const chosenGate = validGates[Math.floor(Math.random() * validGates.length)];
                const duration = Number(stopConfig.duration);
                const slotData = this.getEmptySlotInLot(lot, chosenGate.x, chosenGate.y);
                if (slotData) {
                    this.parkingTask = {
                        lotId: lot.id,
                        duration: Number.isFinite(duration) ? duration : 300,
                        gate: chosenGate,
                        connector: chosenGate.connector,
                        targetSpot: slotData,
                        occupiedSlot: slotData.slot
                    };
                }
            }
        }

        getEmptySlotInLot(lot, entryX, entryY) {
            if (lot.slots && lot.slots.length > 0) {
                const freeSlots = lot.slots.filter(s => !s.occupied);
                if (freeSlots.length > 0) {
                    let bestSlot = null;
                    if (typeof entryX === 'number' && typeof entryY === 'number') {
                        let minDistSq = Infinity;
                        for (const slot of freeSlots) {
                            const dx = slot.x - entryX;
                            const dy = slot.y - entryY;
                            const distSq = dx * dx + dy * dy;
                            if (distSq < minDistSq) {
                                minDistSq = distSq;
                                bestSlot = slot;
                            }
                        }
                    } else {
                        bestSlot = freeSlots[0];
                    }
                    if (bestSlot) {
                        bestSlot.occupied = true;
                        bestSlot.vehicleId = this.id;
                        return { x: bestSlot.x, y: bestSlot.y, angle: bestSlot.angle, slot: bestSlot };
                    }
                }
            }
            const gate = (lot.gates && lot.gates[0]) ? lot.gates[0] : { x: 0, y: 0, rotation: 0 };
            return { x: gate.x, y: gate.y, angle: 0, slot: null };
        }

        prepareForExit(network) {
            this.parkingState = 'exiting';
            this.parkingAnimTime = 0;
            this.parkingStartSimTime = null;
            this.parkingOriginPos = { x: this.x, y: this.y, angle: this.angle };
            const lot = network.parkingLots.find(p => p.id === this.parkingTask.lotId);
            let exitGate = this.parkingTask.gate;
            if (lot && lot.gates) {
                const validExits = lot.gates.filter(g => g.connector && (g.type === 'exit' || g.type === 'bidirectional'));
                if (validExits.length > 0) exitGate = validExits[Math.floor(Math.random() * validExits.length)];
            }
            this.parkingTask.gate = exitGate;
            this.parkingTask.connector = exitGate.connector;
            this.parkingTargetPos = { x: exitGate.connector.x2, y: exitGate.connector.y2 };
            const newLinkId = exitGate.connector.linkId;
            const newRouteIndex = this.route.indexOf(newLinkId);
            if (newRouteIndex !== -1) {
                this.currentLinkIndex = newRouteIndex;
            }
            this.currentLinkId = newLinkId;
            this.currentLaneIndex = 0;
            this.distanceOnPath = exitGate.connector.distance;
            const link = network.links[newLinkId];
            if (link && link.lanes[this.currentLaneIndex]) {
                this.currentPath = link.lanes[this.currentLaneIndex].path;
                this.currentPathLength = link.lanes[this.currentLaneIndex].length;
            }
        }

        handleParkingEntry(dt, simulation) {
            const ANIM_DURATION = 4.0;
            this.parkingAnimTime += dt;
            const t = Math.min(1, this.parkingAnimTime / ANIM_DURATION);
            const p0 = this.parkingOriginPos;
            const p1 = { x: this.parkingTask.connector.x2, y: this.parkingTask.connector.y2 };
            const p2 = { x: this.parkingTask.gate.x, y: this.parkingTask.gate.y };
            const p3 = this.parkingTask.targetSpot;

            const invT = 1 - t;
            const invT2 = invT * invT;
            const invT3 = invT2 * invT;
            const t2 = t * t;
            const t3 = t2 * t;

            this.x = invT3 * p0.x + 3 * invT2 * t * p1.x + 3 * invT * t2 * p2.x + t3 * p3.x;
            this.y = invT3 * p0.y + 3 * invT2 * t * p1.y + 3 * invT * t2 * p2.y + t3 * p3.y;

            const nextT = Math.min(1, t + 0.01);
            const nInvT = 1 - nextT;
            const nInvT2 = nInvT * nInvT;
            const nInvT3 = nInvT2 * nInvT;
            const nt2 = nextT * nextT;
            const nt3 = nt2 * nextT;
            const nx = nInvT3 * p0.x + 3 * nInvT2 * nextT * p1.x + 3 * nInvT * nt2 * p2.x + nt3 * p3.x;
            const ny = nInvT3 * p0.y + 3 * nInvT2 * nextT * p1.y + 3 * nInvT * nt2 * p2.y + nt3 * p3.y;

            this.angle = Math.atan2(ny - this.y, nx - this.x);

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
            const p0 = this.parkingOriginPos;
            const p1 = { x: this.parkingTask.gate.x, y: this.parkingTask.gate.y };
            const p2 = { x: this.parkingTask.connector.x2, y: this.parkingTask.connector.y2 };

            const invT = 1 - t;
            this.x = invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x;
            this.y = invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y;

            const nextT = Math.min(1, t + 0.01);
            const nInvT = 1 - nextT;
            const nx = nInvT * nInvT * p0.x + 2 * nInvT * nextT * p1.x + nextT * nextT * p2.x;
            const ny = nInvT * nInvT * p0.y + 2 * nInvT * nextT * p1.y + nextT * nextT * p2.y;
            this.angle = Math.atan2(ny - this.y, nx - this.x);

            if (t >= 1) {
                if (this.parkingTask.occupiedSlot) {
                    this.parkingTask.occupiedSlot.occupied = false;
                    this.parkingTask.occupiedSlot.vehicleId = null;
                }
                this.parkingState = 'none';
            }
        }

        // ==================================================================================
        // 橫向控制與機車行為
        // ==================================================================================

        /**
         * 尋找前方最近的車輛（輔助方法）
         */
        findNearbyLeader(allVehicles, maxDist = 15.0) {
            let leader = null;
            let minGap = maxDist;

            for (const other of allVehicles) {
                if (other.id === this.id) continue;
                if (other.currentLinkId !== this.currentLinkId) continue;
                if (other.currentLaneIndex !== this.currentLaneIndex) continue;

                const dist = other.distanceOnPath - this.distanceOnPath;
                if (dist > 0 && dist < minGap) {
                    minGap = dist;
                    leader = other;
                }
            }
            return { leader, gap: leader ? minGap : Infinity };
        }

        /**
         * 計算鑽車空隙位置（輔助方法）
         */
        findFilteringGap(leader, halfWidth) {
            const leaderOffset = leader.lateralOffset || 0;
            const leaderHalfWidth = leader.width / 2;
            const myHalfWidth = this.width / 2;
            const safeMargin = 0.3;

            // 計算左右兩側的可用空間
            const rightSpace = halfWidth - (leaderOffset + leaderHalfWidth);
            const leftSpace = halfWidth + (leaderOffset - leaderHalfWidth);

            // 選擇空間較大的一側
            if (rightSpace > myHalfWidth + safeMargin && rightSpace >= leftSpace) {
                return Math.min(halfWidth - myHalfWidth, leaderOffset + leaderHalfWidth + myHalfWidth + safeMargin);
            } else if (leftSpace > myHalfWidth + safeMargin) {
                return Math.max(-halfWidth + myHalfWidth, leaderOffset - leaderHalfWidth - myHalfWidth - safeMargin);
            }

            // 沒有足夠空間，維持當前位置
            return this.lateralOffset;
        }

        /**
         * 機車動態更新 - 簡化版
         * 三階段處理：兩段式左轉 → 決定目標位置 → 執行
         */
        updateMotorcycleDynamics(dt, network, allVehicles) {
            if (this.state !== 'onLink' || this.laneChangeState) return;

            // 低速時保持當前偏移，避免抖動
            if (this.speed < 0.2) {
                this.targetLateralOffset = this.lateralOffset;
                return;
            }

            const link = network.links[this.currentLinkId];
            if (!link) return;
            const lane = link.lanes[this.currentLaneIndex];
            if (!lane) return;

            // === 階段 1：兩段式左轉特殊處理 ===
            if (this.isPreparingForTwoStageTurn(network)) {
                const laneWidth = lane.width || 3.5;
                const maxRightOffset = (laneWidth / 2) - (this.width / 2) - 0.15;
                this.targetLateralOffset = maxRightOffset;
                this.decisionTimer = 1.0;
                return;
            }

            // === 階段 2：決策計時器檢查 ===
            this.decisionTimer -= dt;
            if (this.decisionTimer > 0) return;

            const laneWidth = lane.width || 3.5;
            const halfWidth = laneWidth / 2 - 0.2;

            // 找前方最近的車輛
            const { leader, gap } = this.findNearbyLeader(allVehicles, 15.0);

            // === 階段 3：根據情況決定目標位置 ===
            if (!leader) {
                // 無前車：維持當前位置或緩慢回歸偏好位置
                if (this.swarmTimer > 0) {
                    // 起步衝刺中：鎖定當前位置
                    this.decisionTimer = 1.0;
                } else {
                    // 【修正】正常行駛：緩慢回歸「個人偏好位置」(例如靠右)
                    // 使用線性插值 (Lerp) 慢慢移動過去
                    const biasPull = 0.05;
                    this.targetLateralOffset = this.targetLateralOffset * (1 - biasPull) + this.preferredBias * biasPull;

                    this.decisionTimer = 2.0 + Math.random();
                }
            } else {
                const leaderOffset = leader.lateralOffset || 0;

                if (gap > 8.0 || leader.speed > this.speed * 0.9) {
                    // 前車較遠或不慢：維持當前位置
                    this.decisionTimer = 1.5 + Math.random();
                } else if (this.speed < 7.0 && leader.width > 1.5) {
                    // 低速且前方是汽車：嘗試找空隙鑽過
                    const newTarget = this.findFilteringGap(leader, halfWidth);
                    // 平滑過渡到新位置
                    this.targetLateralOffset = this.targetLateralOffset * 0.7 + newTarget * 0.3;
                    this.decisionTimer = 0.8 + Math.random() * 0.4;
                } else if (leader.isMotorcycle) {
                    // 前方是機車：微調錯開
                    const offsetStep = (leader.width + this.width) / 2 + 0.3;
                    if (Math.abs(leaderOffset - this.lateralOffset) < offsetStep * 0.8) {
                        // 太靠近，需要錯開
                        const direction = leaderOffset > 0 ? -1 : 1;
                        const adjustment = direction * 0.4;
                        this.targetLateralOffset = Math.max(-halfWidth,
                            Math.min(halfWidth, this.lateralOffset + adjustment));
                    }
                    this.decisionTimer = 0.6 + Math.random() * 0.4;
                } else {
                    // 其他情況：維持當前位置
                    this.decisionTimer = 1.0 + Math.random();
                }
            }

            // 限制目標偏移在車道範圍內
            this.targetLateralOffset = Math.max(-halfWidth, Math.min(halfWidth, this.targetLateralOffset));
        }

        updateLateralPosition(dt) {
            const diff = this.targetLateralOffset - this.lateralOffset;
            if (Math.abs(diff) < 0.005) {
                this.lateralOffset = this.targetLateralOffset;
                return;
            }

            if (this.isMotorcycle) {
                // 速度相關穩定性：高速時橫向移動更慢（模擬重心效應）
                const speedFactor = Math.max(0.3, 1.0 - this.speed / 20.0);

                // 指數平滑：tau 越大，移動越慢越平滑
                const tau = 0.5;
                const alpha = 1 - Math.exp(-dt / tau);

                // 限制最大橫向速度（高速時更穩定）
                const maxLateralSpeed = 1.2 * speedFactor;

                let move = diff * alpha;
                const limit = maxLateralSpeed * dt;
                move = Math.max(-limit, Math.min(limit, move));

                this.lateralOffset += move;
            } else {
                const dir = Math.sign(diff);
                const move = this.lateralSpeed * dt;
                if (Math.abs(diff) < move) {
                    this.lateralOffset = this.targetLateralOffset;
                } else {
                    this.lateralOffset += dir * move;
                }
            }
        }

        decideLaneFiltering(allVehicles, network) {
            // --- [新增] 待轉機車禁止鑽縫 ---
            if (this.isPreparingForTwoStageTurn(network)) return;
            // -----------------------------
            if (!this.isMotorcycle || this.state !== 'onLink' || Math.abs(this.targetLateralOffset) > 0.1) return;
            const link = network.links[this.currentLinkId];
            if (!link) return;
            const myLane = link.lanes[this.currentLaneIndex];
            const laneWidth = myLane ? myLane.width : 3.0;
            const { leader, gap } = this.findLeader(allVehicles, network);
            if (leader && gap < 20) {
                const maxOffset = Math.max(0, (laneWidth / 2) - (this.width / 2) - 0.5);
                if (maxOffset <= 0.1) return;
                for (let i = 0; i < 3; i++) {
                    const randomOffset = (Math.random() * 2 - 1) * maxOffset;
                    const leaderRelativeOffset = leader.lateralOffset || 0;
                    const distToLeader = Math.abs(randomOffset - leaderRelativeOffset);
                    const safeWidth = (this.width + leader.width) / 2 + 0.3;
                    if (distToLeader > safeWidth) {
                        this.targetLateralOffset = randomOffset;
                        break;
                    }
                }
            }
        }

        // ==================================================================================
        // 導航與路徑邏輯
        // ==================================================================================
        initializePosition(network) {
            const link = network.links[this.currentLinkId];
            if (!link) { this.finished = true; return; }
            this.nextSignIndex = 0;
            const lane = link.lanes[this.currentLaneIndex];
            if (!lane || lane.path.length === 0) { this.finished = true; return; }
            this.currentPath = lane.path;
            this.currentPathLength = lane.length;

            // ★ 新增：記錄進入時間
            if (typeof simulation !== 'undefined') {
                this.enterLinkTime = simulation.time;
            }

            this.updateDrawingPosition(network);
        }

        checkRoadSigns(network) {
            const link = network.links[this.currentLinkId];
            if (!link.roadSigns || this.nextSignIndex >= link.roadSigns.length) { return; }
            while (this.nextSignIndex < link.roadSigns.length && this.distanceOnPath >= link.roadSigns[this.nextSignIndex].position) {
                const sign = link.roadSigns[this.nextSignIndex];
                if (sign.type === 'limit') { this.maxSpeed = sign.limit; }
                else if (sign.type === 'no_limit') { this.maxSpeed = this.originalMaxSpeed; }
                this.nextSignIndex++;
            }
        }

        decideNextLink(network) {
            const currentLink = network.links[this.currentLinkId];
            if (!currentLink) return;
            const destNodeId = currentLink.destination;
            const node = network.nodes[destNodeId];
            if (!node) return;
            const ratios = (node.turningRatios && node.turningRatios[this.currentLinkId]) ? node.turningRatios[this.currentLinkId] : null;
            if (!ratios || Object.keys(ratios).length === 0) return;

            // 1. 隨機決定下一條路 (Next Link)
            const rand = Math.random();
            let cumulative = 0;
            let selectedLinkId = null;
            for (const [targetLinkId, prob] of Object.entries(ratios)) {
                cumulative += prob;
                if (rand <= cumulative) {
                    selectedLinkId = targetLinkId;
                    break;
                }
            }

            if (selectedLinkId) {
                this.route.push(selectedLinkId);

                // =================================================================
                // ★★★ [關鍵修正] 最高優先級：如果是待轉機車，強制鎖定最外側車道 ★★★
                // =================================================================
                // 我們必須在系統去查詢 Transition (通常會建議走內側) 之前，就先攔截並覆蓋決策。
                if (this.isPreparingForTwoStageTurn(network)) {
                    const laneIndices = Object.keys(network.links[this.currentLinkId].lanes).map(Number);
                    const rightmostLaneIndex = Math.max(...laneIndices);

                    // 無論現在在哪，目標只有一個：最右邊
                    this.laneChangeGoal = rightmostLaneIndex;

                    // 直接返回，不再執行下方尋找 Transition 的邏輯
                    return;
                }
                // =================================================================

                // 2. 標準邏輯：尋找 Graph 定義的 Transition (僅適用於汽車或非待轉機車)
                const transitions = node.transitions.filter(t => t.sourceLinkId === this.currentLinkId && t.destLinkId === selectedLinkId);
                if (transitions.length > 0) {
                    const myTransition = transitions.find(t => t.sourceLaneIndex === this.currentLaneIndex);
                    if (!myTransition) {
                        let bestTargetLane = transitions[0].sourceLaneIndex;
                        let minDiff = Math.abs(this.currentLaneIndex - bestTargetLane);
                        for (const t of transitions) {
                            const diff = Math.abs(this.currentLaneIndex - t.sourceLaneIndex);
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestTargetLane = t.sourceLaneIndex;
                            }
                        }
                        this.laneChangeGoal = bestTargetLane;
                    }
                }
            }
        }

        handlePathTransition(leftoverDistance, network) {
            this.laneChangeState = null;
            this.laneChangeGoal = null;
            this.laneChangeCooldown = 0;

            // =========================================================
            // [修正重點 1] 狀態攔截：防止待轉過程中的誤切換
            // =========================================================
            if (this.twoStageState === 'waiting') {
                // 正在等待綠燈，絕對不能切換路段
                this.distanceOnPath = this.currentPathLength; // 釘在原地
                this.speed = 0;
                return;
            }

            if (this.twoStageState === 'moving_to_box') {
                // 剛抵達待轉格，由 update() 函數處理煞停與轉向
                // 這裡只需攔截，不讓它執行下方的 switchToNextLink
                return;
            }
            // =========================================================

            if (this.state === 'onLink') {
                const nextLinkIndex = this.currentLinkIndex + 1;
                if (nextLinkIndex >= this.route.length) {
                    this.finished = true;
                    return;
                }

                const currentLink = network.links[this.currentLinkId];
                const nextLinkId = this.route[nextLinkIndex];
                const destNodeId = currentLink.destination;
                const destNode = network.nodes[destNodeId];

                // --- 兩段式左轉判定 (機車專用) ---
                if (this.isMotorcycle) {
                    const nextLinkObj = network.links[nextLinkId];
                    const isLeftTurn = this.checkIsLeftTurn(network, currentLink, nextLinkObj);

                    if (isLeftTurn) {
                        const boxes = network.twoStageBoxMap ? network.twoStageBoxMap[destNodeId] : null;

                        if (boxes && boxes.length > 0) {
                            const targetBox = this.findBestBox(boxes, currentLink);

                            if (targetBox) {
                                // --- 設定進入待轉區的路徑 ---
                                this.state = 'inIntersection';
                                this.twoStageState = 'moving_to_box';
                                this.waitingBox = targetBox;
                                this.currentTransition = null;

                                // 排隊計數
                                if (typeof targetBox.waitingCount === 'undefined') targetBox.waitingCount = 0;
                                const idx = targetBox.waitingCount;
                                targetBox.waitingCount++;

                                // --- 計算排隊座標 (Grid Layout) ---
                                const bikeW = 0.8;
                                const bikeL = 2.0;
                                const padding = 0.5;
                                const boxW = Math.max(parseFloat(targetBox.width) || 4.0, 2.0);
                                const boxL = Math.max(parseFloat(targetBox.length) || 2.5, 2.0);
                                const capacityPerRow = Math.max(1, Math.floor((boxW - padding) / bikeW));
                                const col = idx % capacityPerRow;
                                const row = Math.floor(idx / capacityPerRow);

                                // 計算目標朝向
                                let aimAngle = targetBox.rotation || 0;
                                if (nextLinkObj && nextLinkObj.lanes[0]) {
                                    const p1 = nextLinkObj.lanes[0].path[0];
                                    const p2 = nextLinkObj.lanes[0].path[1];
                                    aimAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                                }

                                const cos = Math.cos(aimAngle);
                                const sin = Math.sin(aimAngle);
                                const vecFwd = { x: cos, y: sin };
                                const vecRight = { x: -sin, y: cos };

                                // 計算終點
                                const cornerFR_x = targetBox.x + (vecFwd.x * boxL / 2) + (vecRight.x * boxW / 2);
                                const cornerFR_y = targetBox.y + (vecFwd.y * boxL / 2) + (vecRight.y * boxW / 2);
                                const moveLeft = padding + (col * bikeW) + (bikeW / 2);
                                const moveBack = padding + (row * bikeL) + (bikeL / 2);

                                const endPos = {
                                    x: cornerFR_x - (vecRight.x * moveLeft) - (vecFwd.x * moveBack),
                                    y: cornerFR_y - (vecRight.y * moveLeft) - (vecFwd.y * moveBack)
                                };

                                // 建立貝茲曲線 (Hook Turn)
                                const startPos = { x: this.x, y: this.y };
                                const distDirect = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
                                const controlLen = distDirect * 0.5;

                                const p1 = {
                                    x: startPos.x + Math.cos(this.angle) * controlLen,
                                    y: startPos.y + Math.sin(this.angle) * controlLen
                                };
                                const p2 = {
                                    x: endPos.x - (vecFwd.x * controlLen * 0.5),
                                    y: endPos.y - (vecFwd.y * controlLen * 0.5)
                                };

                                this.currentPath = [startPos, p1, p2, endPos];
                                this.currentPathLength = Geom.Bezier.getLength(startPos, p1, p2, endPos);
                                this.distanceOnPath = 0;
                                this.lateralOffset = 0;
                                this.targetLateralOffset = 0;

                                return; // 結束，開始前往待轉區
                            }
                        }
                    }
                }
                // ... 一般汽車與無需待轉的邏輯 (保持原樣) ...
                let transition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === this.currentLaneIndex && t.destLinkId === nextLinkId);
                if (!transition) {
                    transition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.destLinkId === nextLinkId);
                }

                this.currentTransition = transition;

                if (transition) {
                    if (typeof optimizerController !== 'undefined' && transition.turnGroupId) {
                        optimizerController.registerVehiclePass(destNodeId, transition.turnGroupId, this.isMotorcycle);
                        if (optimizerController.looper) {
                            optimizerController.looper.collectTurnData(destNodeId, transition.turnGroupId);
                        }
                    }

                    if (transition.bezier) {
                        this.state = 'inIntersection';
                        // 瞬移保護邏輯
                        const points = transition.bezier.points.map(p => ({ x: p.x, y: p.y }));
                        const p0 = points[0];
                        const distSq = (this.x - p0.x) ** 2 + (this.y - p0.y) ** 2;

                        if (distSq > 2.25) {
                            points[0] = { x: this.x, y: this.y };
                            this.lateralOffset = 0;
                            this.targetLateralOffset = 0;
                            const [np0, np1, np2, np3] = points;
                            this.currentPathLength = Geom.Bezier.getLength(np0, np1, np2, np3);
                            this.currentPath = points;
                        } else {
                            this.currentPath = points;
                            this.currentPathLength = transition.bezier.length;
                        }
                        this.distanceOnPath = leftoverDistance;
                    } else {
                        this.finished = true;
                    }
                }
            } else if (this.state === 'inIntersection') {
                // =========================================================
                // [修正重點 2] 只有在 "leaving_box" 結束時，才切換到 Next Link
                // =========================================================
                if (this.twoStageState === 'leaving_box') {
                    // 清理狀態
                    this.twoStageState = 'none';
                    this.waitingBox = null;

                    // 執行切換到下一條道路
                    this.switchToNextLink(leftoverDistance, network);

                    // 重新應用偏移與車道 (防止重疊)
                    if (this.pendingLaneIndex !== undefined) {
                        const link = network.links[this.currentLinkId];
                        if (link && link.lanes[this.pendingLaneIndex]) {
                            this.currentLaneIndex = this.pendingLaneIndex;
                            const lane = link.lanes[this.currentLaneIndex];
                            this.currentPath = lane.path;
                            this.currentPathLength = lane.length;
                        }
                        this.pendingLaneIndex = undefined;
                    }
                    if (this.pendingLateralOffset !== undefined) {
                        this.lateralOffset = this.pendingLateralOffset;
                        this.targetLateralOffset = this.pendingLateralOffset;
                        if (this.isMotorcycle) {
                            const link = network.links[this.currentLinkId];
                            const laneWidth = link.lanes[this.currentLaneIndex]?.width || 3.5;
                            this.preferredBias = Math.max(-0.9, Math.min(0.9, this.pendingLateralOffset / (laneWidth / 2)));
                            this.decisionTimer = 3.0 + Math.random() * 2.0;
                        }
                        this.pendingLateralOffset = undefined;
                    }
                    return;
                }

                // 一般轉彎結束
                this.switchToNextLink(leftoverDistance, network);
            }
        }

        /**
         * [修正版] 檢查兩段式左轉的等待號誌
         * 邏輯：只參考「橫向直行」的綠燈，嚴格排除轉彎信號
         */
        checkTwoStageSignal(network) {
            // 1. 取得我們要去的下一條路 (Next Link)
            const nextLinkId = this.route[this.currentLinkIndex + 1];
            if (!nextLinkId) return true;

            // 2. 取得所在路口與號誌控制器
            const currentLink = network.links[this.currentLinkId];
            if (!currentLink) return true;

            const nodeId = currentLink.destination;
            const tfl = network.trafficLights.find(t => t.nodeId === nodeId);

            // 無號誌，直接走
            if (!tfl) return true;

            const node = network.nodes[nodeId];
            if (!node) return true;

            // --- 內部輔助：計算道路角度 ---
            const getLinkAngle = (l, isStart) => {
                if (!l) return 0;
                const lanes = Object.values(l.lanes);
                if (lanes.length === 0) return 0;
                const path = lanes[0].path;
                if (path.length < 2) return 0;
                // 取頭尾向量
                const p1 = isStart ? path[0] : path[path.length - 2];
                const p2 = isStart ? path[1] : path[path.length - 1];
                return Math.atan2(p2.y - p1.y, p2.x - p1.x);
            };

            // 目標道路的角度 (出射角)
            const nextLinkObj = network.links[nextLinkId];
            const targetOutAngle = getLinkAngle(nextLinkObj, true);

            // 3. 遍歷所有「進入目標道路」的路徑
            const targetTransitions = node.transitions.filter(t => t.destLinkId === nextLinkId);

            let hasStraightGreen = false;

            for (const t of targetTransitions) {
                // 排除來自「我原本道路」的信號 (避免看到自己的左轉燈就衝出去)
                if (t.sourceLinkId === this.currentLinkId) continue;

                // 取得這條路徑來源道路的角度
                const srcLink = network.links[t.sourceLinkId];
                const srcInAngle = getLinkAngle(srcLink, false);

                // 計算角度差 (Diff)
                let diff = targetOutAngle - srcInAngle;
                while (diff <= -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;

                // --- [關鍵] 判斷是否為「直行」車流 ---
                // 直行的角度差應該接近 0 (允許誤差 ±0.6 rad，約 35度)
                // Canvas 座標系下，直行 diff ≈ 0
                const isStraightFlow = Math.abs(diff) < 0.6;

                if (isStraightFlow) {
                    // 只有當這條是「直行」路徑時，才檢查它的燈號
                    let signal = 'Green'; // 預設無管制為綠燈
                    if (t.turnGroupId) {
                        signal = tfl.getSignalForTurnGroup(t.turnGroupId);
                    }

                    // 必須是嚴格的綠燈 (Green)
                    if (signal === 'Green') {
                        hasStraightGreen = true;
                        break; // 找到一個直行綠燈即可放行
                    }
                }
            }

            // 如果找不到直行綠燈 (代表全紅 或 只有對向左轉/右轉燈亮)，則保持紅燈等待
            return hasStraightGreen;
        }
        // ==========================================================

        // 輔助函式：判斷是否左轉 (利用向量外積或角度差)
        checkIsLeftTurn(network, linkIn, linkOut) {
            if (!linkIn || !linkOut) return false;

            // 取得道路角度的輔助函式
            const getAngle = (l, isStart) => {
                const lanes = Object.values(l.lanes);
                if (lanes.length === 0) return 0;
                // 取第一條車道做代表
                const path = lanes[0].path;
                if (path.length < 2) return 0;

                const p1 = isStart ? path[0] : path[path.length - 2];
                const p2 = isStart ? path[1] : path[path.length - 1];
                return Math.atan2(p2.y - p1.y, p2.x - p1.x);
            };

            const a1 = getAngle(linkIn, false); // 進入路口的道路角度
            const a2 = getAngle(linkOut, true); // 離開路口的道路角度 (目標路段)

            let diff = a2 - a1;
            // 正規化角度差至 -PI ~ +PI
            while (diff <= -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            // Canvas座標系(Y-Down)特性：
            // 左轉是 負角度 (例如 0 -> -1.57)
            // 右轉是 正角度 (例如 0 -> +1.57)

            // 判定為左轉的條件：角度差在 -0.2 (約-11度) 到 -2.8 (約-160度) 之間
            // 這排除了直行 (接近 0) 和 右轉 (正值) 以及 迴轉 (接近 +/- 3.14)
            return (diff < -0.2 && diff > -2.8);
        }

        // --- [新增] 輔助：判斷是否準備進行兩段式左轉 ---
        isPreparingForTwoStageTurn(network) {
            if (!this.isMotorcycle) return false;

            // 檢查是否還有下一條路
            const nextLinkIndex = this.currentLinkIndex + 1;
            if (nextLinkIndex >= this.route.length) return false;

            const currentLink = network.links[this.currentLinkId];
            const nextLinkId = this.route[nextLinkIndex];
            const nextLink = network.links[nextLinkId];
            if (!currentLink || !nextLink) return false;

            // 1. 檢查是否為左轉
            const isLeft = this.checkIsLeftTurn(network, currentLink, nextLink);
            if (!isLeft) return false;

            // 2. 檢查該路口是否有待轉區
            const destNodeId = currentLink.destination;
            const boxes = network.twoStageBoxMap ? network.twoStageBoxMap[destNodeId] : null;

            return (boxes && boxes.length > 0);
        }

        // 輔助函式：找待轉格 (通常在車輛右前方)
        findBestBox(boxes, currentLink) {
            if (!boxes || boxes.length === 0) return null;
            if (!currentLink) return null;

            // 1. 計算目前道路的行駛方向 (Forward Vector)
            const lanes = Object.values(currentLink.lanes);
            if (lanes.length === 0) return null;

            // 取最外側車道的末端向量
            const path = lanes[lanes.length - 1].path;
            if (path.length < 2) return null;

            const pEnd = path[path.length - 1];
            const pPrev = path[path.length - 2];

            // 計算單位向量 (Forward)
            const dx = pEnd.x - pPrev.x;
            const dy = pEnd.y - pPrev.y;
            const len = Math.hypot(dx, dy);
            const fx = dx / len; // Forward X
            const fy = dy / len; // Forward Y

            // 計算右側向量 (Right Vector): (dy, -dx) 在 Canvas Y-Down 座標系
            // Canvas座標: X向右, Y向下. 
            // 若前進(1,0)東, 右側應為(0,1)南. -> (dy, -dx) => (0, -1) 錯了
            // 若前進(1,0)東, 右側應為(0,1)南. 
            // 向量旋轉 90度順時針: (x, y) -> (-y, x)
            const rx = -fy;
            const ry = fx;

            let bestBox = null;
            let maxScore = -Infinity;

            // 2. 評分所有格子
            for (const box of boxes) {
                // 計算 車道末端 到 格子 的向量
                const vx = box.x - pEnd.x;
                const vy = box.y - pEnd.y;

                // 投影量 (Dot Product)
                const forwardProj = vx * fx + vy * fy; // 在前進方向的距離
                const rightProj = vx * rx + vy * ry;   // 在右側方向的距離

                // 條件 A: 格子必須在路口內 (前進方向 > 0)
                // 條件 B: 格子必須在右側 (右側方向 > 0，允許稍微偏左一點點的寬容度 > -2.0)
                if (forwardProj > 0 && rightProj > -2.0) {

                    // 評分公式：我們偏好「右前方」最遠的那個角落
                    // 權重：越靠前越好 (穿過路口)，越靠右越好
                    const score = forwardProj + rightProj;

                    if (score > maxScore) {
                        maxScore = score;
                        bestBox = box;
                    }
                }
            }

            // 如果找不到符合「右前方」條件的格子，回傳 null (觸發直接左轉 fallback)
            return bestBox;
        }
        // 在 Vehicle 類別中新增此方法
        checkGreenLightLaunch(network) {
            // 1. 取得當前路段與下一路段資訊
            const currentLink = network.links[this.currentLinkId];
            if (!currentLink) return;

            // 距離路口太遠不需要檢查 (節省效能)，例如只檢查最後 50 公尺
            const distToEnd = this.currentPathLength - this.distanceOnPath;
            if (distToEnd > 50) return;

            const nextLinkIndex = this.currentLinkIndex + 1;
            if (nextLinkIndex >= this.route.length) return;
            const nextLinkId = this.route[nextLinkIndex];

            // 2. 找到控制該路徑的號誌 Transition
            const destNode = network.nodes[currentLink.destination];
            if (!destNode) return;

            // 尋找對應的 Transition (先找特定車道，再找通用規則)
            let myTransition = destNode.transitions.find(t =>
                t.sourceLinkId === this.currentLinkId &&
                t.sourceLaneIndex === this.currentLaneIndex &&
                t.destLinkId === nextLinkId
            );

            if (!myTransition) {
                myTransition = destNode.transitions.find(t =>
                    t.sourceLinkId === this.currentLinkId &&
                    t.destLinkId === nextLinkId
                );
            }

            if (!myTransition || !myTransition.turnGroupId) return;

            // 3. 檢查號誌狀態
            const tfl = network.trafficLights.find(t => t.nodeId === currentLink.destination);
            if (!tfl) return;

            const signal = tfl.getSignalForTurnGroup(myTransition.turnGroupId);

            // 4. 如果是綠燈，且我現在還用著很保守的 minGap，就啟動「蜂群起步」
            // [修改後]
            if (signal === 'Green') {
                // 模擬反應延遲：距離停止線越遠，反應越慢 (波動效應)
                // 假設每 1 公尺延遲 0.05 秒 + 隨機 0.2 秒
                const distDelay = (distToEnd / 10.0) * 0.1;
                const randomDelay = Math.random() * 0.3;

                // 設定一個倒數計時器來啟動蜂群模式 (需在 update 中處理這個計時器)
                // 為了簡化，我們直接用 setTimeout 或者增加一個屬性 this.launchDelay
                // 這裡示範增加屬性法 (需要在 update 裡扣除)

                if (!this.launchDelay) {
                    this.launchDelay = distDelay + randomDelay;
                }
            }
        }

        switchToNextLink(leftoverDistance, network) {
            // ★ 新增：在切換 Link 之前 (代表離開了舊 Link)，收集舊 Link 的數據
            if (typeof optimizerController !== 'undefined' && optimizerController.looper && typeof simulation !== 'undefined') {
                const duration = simulation.time - this.enterLinkTime;
                // 傳入：LinkID, 行駛時間, 路段長度
                optimizerController.looper.collectLinkData(this.currentLinkId, duration, this.currentPathLength);
            }

            // 1. 標準切換邏輯 (保持原樣)
            this.currentLinkIndex++;
            if (this.currentLinkIndex >= this.route.length) {
                this.finished = true;
                return;
            }
            this.currentLinkId = this.route[this.currentLinkIndex];
            this.currentLaneIndex = this.currentTransition ? this.currentTransition.destLaneIndex : 0;
            this.currentTransition = null;
            this.nextSignIndex = 0;

            // ★ 新增：更新進入時間
            if (typeof simulation !== 'undefined') {
                this.enterLinkTime = simulation.time;
            }

            const link = network.links[this.currentLinkId];
            if (!link || !link.lanes[this.currentLaneIndex]) {
                this.finished = true;
                return;
            }

            const lane = link.lanes[this.currentLaneIndex];
            this.state = 'onLink';
            this.currentPath = lane.path;
            this.currentPathLength = lane.length;
            this.distanceOnPath = leftoverDistance;

            this.maxSpeed = this.originalMaxSpeed;

            if (this.isMotorcycle) {
                // --- A. 跟車距離差異化 (Headway Time) ---
                const baseHeadway = 1.2;
                const randomFactor = (Math.random() * 1.2) - 0.4; // -0.4 ~ +0.8
                this.headwayTime = Math.max(0.5, baseHeadway + randomFactor);

                // --- B. 極速差異化 (Top Speed Variance) ---
                const speedFactor = 0.9 + Math.random() * 0.2;

                // [優化] 這裡的蜂群模式再次觸發，確保過路口後繼續加速一段時間
                this.swarmTimer = 4.0; // 重置計時器
                this.minGap = 0.1;
                this.headwayTime = 0.2;
                this.maxAccel = this.originalMaxAccel * 1.5;

            } else {
                this.headwayTime = 1.5 + (Math.random() * 0.5);
            }
        }

        // ==================================================================================
        // 換車道邏輯
        // ==================================================================================
        manageLaneChangeProcess(dt, network, allVehicles) {
            if (this.laneChangeState) {
                this.laneChangeState.progress += dt / this.laneChangeState.duration;
                if (this.laneChangeState.progress >= 1) {
                    this.currentLaneIndex = this.laneChangeState.toLaneIndex;
                    this.lateralOffset = this.laneChangeState.endOffset;
                    if (this.isMotorcycle) {
                        this.targetLateralOffset = this.lateralOffset;
                    } else {
                        this.targetLateralOffset = 0;
                    }
                    this.laneChangeState = null;
                    this.laneChangeCooldown = 5.0;
                }
            }
            if (!this.laneChangeGoal) { this.handleMandatoryLaneChangeDecision(network, allVehicles); }
            if (!this.laneChangeGoal && this.laneChangeCooldown <= 0) { this.handleDiscretionaryLaneChangeDecision(network, allVehicles); }
            if (this.laneChangeGoal !== null && !this.laneChangeState) {
                if (this.currentLaneIndex === this.laneChangeGoal) {
                    this.laneChangeGoal = null;
                } else {
                    const direction = Math.sign(this.laneChangeGoal - this.currentLaneIndex);
                    const nextLaneIndex = this.currentLaneIndex + direction;
                    const safeToChange = this.isSafeToChange(nextLaneIndex, allVehicles);
                    if (safeToChange) {
                        const link = network.links[this.currentLinkId];
                        const targetLane = link.lanes[nextLaneIndex];
                        let calculatedEndOffset = 0;
                        if (targetLane) {
                            const maxSafeOffset = Math.max(0, (targetLane.width / 2) - (this.width / 2) - 0.3);
                            if (direction > 0) {
                                calculatedEndOffset = -maxSafeOffset * 0.8;
                            } else {
                                calculatedEndOffset = maxSafeOffset * 0.8;
                            }
                        }
                        this.laneChangeState = {
                            progress: 0,
                            fromLaneIndex: this.currentLaneIndex,
                            toLaneIndex: nextLaneIndex,
                            duration: 2.0,
                            startOffset: this.lateralOffset,
                            endOffset: calculatedEndOffset
                        };
                    }
                }
            }
        }

        handleMandatoryLaneChangeDecision(network, allVehicles) {
            if (this.laneChangeGoal !== null) return;
            const link = network.links[this.currentLinkId];
            const lane = link.lanes[this.currentLaneIndex];
            if (!lane) return;

            // =================================================================
            // [修正] 兩段式左轉：絕對優先權 (加強版)
            // =================================================================
            const distToEnd = this.currentPathLength - this.distanceOnPath;
            if (this.isPreparingForTwoStageTurn(network) && distToEnd < 100.0) {
                const laneIndices = Object.keys(link.lanes).map(Number);
                const rightmostLaneIndex = Math.max(...laneIndices);

                // 如果不在最外側，強制往右切
                if (this.currentLaneIndex < rightmostLaneIndex) {
                    // 檢查右側安全性 (簡化版：只要不是極度危險就切，或者等待下一幀)
                    if (this.isSafeToChange(this.currentLaneIndex + 1, allVehicles)) {
                        this.laneChangeGoal = this.currentLaneIndex + 1;
                    }
                    // ★ 關鍵：強制阻斷，不讓下方的 Graph 邏輯有機會叫它往左切
                    return;
                }
                // 已經在最右側，直接返回，什麼都不做 (保持在右側)
                return;
            }
            // =================================================================

            const distanceToEnd = lane.length - this.distanceOnPath;
            if (distanceToEnd < 2.0) return;
            if (distanceToEnd > 150) return;

            // ... (下方保持原有的標準 Graph 換道邏輯) ...
            const nextLinkId = this.route[this.currentLinkIndex + 1];
            if (!nextLinkId) return;
            const destNode = network.nodes[link.destination];
            const canPass = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === this.currentLaneIndex && t.destLinkId === nextLinkId);
            if (canPass) return;

            // 尋找可通行的車道
            const suitableLanes = [];
            for (const laneIdx in link.lanes) {
                const targetLane = parseInt(laneIdx, 10);
                const canPassOnNewLane = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === targetLane && t.destLinkId === nextLinkId);
                if (canPassOnNewLane) {
                    const { leader } = this.getLaneLeader(targetLane, allVehicles);
                    const density = leader ? leader.distanceOnPath - this.distanceOnPath : Infinity;
                    suitableLanes.push({ laneIndex: targetLane, density });
                }
            }
            if (suitableLanes.length > 0) {
                suitableLanes.sort((a, b) => b.density - a.density);
                this.laneChangeGoal = suitableLanes[0].laneIndex;
            }
        }

        handleDiscretionaryLaneChangeDecision(network, allVehicles) {
            if (this.laneChangeGoal !== null || this.laneChangeState !== null || this.laneChangeCooldown > 0) return;

            // --- [新增] 如果要待轉，禁止為了超車而換道 (尤其是往左) ---
            if (this.isPreparingForTwoStageTurn(network)) {
                return;
            }
            // -----------------------------------------------------
            const link = network.links[this.currentLinkId];
            const laneIndices = Object.keys(link.lanes).map(Number);
            const maxLaneIndex = Math.max(...laneIndices);
            const nextLinkId = this.route[this.currentLinkIndex + 1];
            if (!nextLinkId) return;
            const destNode = network.nodes[link.destination];

            if (this.isMotorcycle && this.currentLaneIndex < maxLaneIndex) {
                const targetLane = this.currentLaneIndex + 1;
                if (link.lanes[targetLane]) {
                    const canPass = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === targetLane && t.destLinkId === nextLinkId);
                    if (canPass) {
                        if (this.isSafeToChange(targetLane, allVehicles)) {
                            if (Math.random() < 0.95) {
                                this.laneChangeGoal = targetLane;
                                return;
                            }
                        }
                    }
                }
            }

            const adjacentLanes = [this.currentLaneIndex - 1, this.currentLaneIndex + 1];
            const { leader: currentLeader } = this.getLaneLeader(this.currentLaneIndex, allVehicles);
            for (const targetLane of adjacentLanes) {
                if (!link.lanes[targetLane]) continue;
                if (this.isMotorcycle && targetLane < this.currentLaneIndex) {
                    if (currentLeader && currentLeader.speed > 0.5) continue;
                }
                const canPass = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === targetLane && t.destLinkId === nextLinkId);
                if (!canPass) continue;
                const { leader: targetLeader } = this.getLaneLeader(targetLane, allVehicles);
                const currentGap = currentLeader ? currentLeader.distanceOnPath - this.distanceOnPath : Infinity;
                const targetGap = targetLeader ? targetLeader.distanceOnPath - this.distanceOnPath : Infinity;
                const speedAdvantage = targetLeader ? targetLeader.speed - this.speed : 0;
                const gapAdvantage = targetGap - currentGap;
                if (gapAdvantage > this.length * 2 && speedAdvantage > 2) {
                    if (this.isSafeToChange(targetLane, allVehicles)) {
                        this.laneChangeGoal = targetLane;
                        return;
                    }
                }
            }
        }

        getLaneLeader(laneIndex, allVehicles) {
            let leader = null;
            let gap = Infinity;
            for (const other of allVehicles) {
                if (this.id === other.id || other.currentLinkId !== this.currentLinkId) continue;
                const otherLane = other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex;
                if (otherLane === laneIndex && other.distanceOnPath > this.distanceOnPath) {
                    const otherGap = other.distanceOnPath - this.distanceOnPath - this.length;
                    if (otherGap < gap) { gap = otherGap; leader = other; }
                }
            }
            return { leader, gap };
        }

        isSafeToChange(targetLane, allVehicles) {
            for (const other of allVehicles) {
                if (other.id === this.id) continue;
                if (other.currentLinkId !== this.currentLinkId) continue;
                const otherLaneIndex = other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex;

                if (otherLaneIndex === targetLane) {
                    const distDiff = other.distanceOnPath - this.distanceOnPath;

                    if (distDiff > 0) {
                        // 前方車輛檢查 (other 在我前面)
                        // [修正] 判定距離需考慮兩車半長
                        // 條件: (中心距 - 前車半長 - 後車半長) > 最小安全距離
                        const realGap = distDiff - (other.length / 2) - (this.length / 2);
                        if (realGap < this.minGap) return false;

                    } else {
                        // 後方車輛檢查 (other 在我後面)
                        const gap = -distDiff; // 這是中心距

                        // [修正] 安全距離需要加上兩車半長
                        // 安全條件: (中心距 - 前車半長 - 後車半長) > (後車.minGap + 速度差緩衝)
                        // 即: gap > (this.len/2 + other.len/2) + other.minGap + ...

                        // 這裡 other 是後車，this 是前車(要切入的車)
                        const requiredGap = (this.length / 2) + (other.length / 2) +
                            this.minGap +
                            Math.max(0, (other.speed - this.speed) * 2.0);

                        if (gap < requiredGap) return false;
                    }
                }
            }
            return true;
        }

        // ==================================================================================
        // 跟車與路權邏輯 (包含紅燈停止位置修正)
        // ==================================================================================
        findLeader(allVehicles, network) {
            // 1. [既有邏輯] 進入待轉區：盲衝 (保持不變)
            if (this.twoStageState === 'moving_to_box') {
                return { leader: null, gap: Infinity };
            }

            let leader = null;
            let gap = Infinity;
            const distanceToEndOfCurrentPath = this.currentPathLength - this.distanceOnPath;

            // 輔助函式：計算絕對橫向位置
            const getAbsLatPos = (v) => {
                const link = network.links[v.currentLinkId];
                if (!link) return 0;
                let cumWidth = 0;
                for (let i = 0; i < v.currentLaneIndex; i++) {
                    if (link.lanes[i]) cumWidth += link.lanes[i].width;
                }
                const myLaneWidth = link.lanes[v.currentLaneIndex] ? link.lanes[v.currentLaneIndex].width : 3.5;
                return cumWidth + (myLaneWidth / 2) + v.lateralOffset;
            };

            const myAbsPos = getAbsLatPos(this);

            const isBlocking = (other) => {
                const otherAbsPos = getAbsLatPos(other);
                const latDist = Math.abs(myAbsPos - otherAbsPos);
                let safeLatThreshold;

                // [修改後]
                if (this.isMotorcycle && other.isMotorcycle) {
                    // 正常保持 0.4m
                    safeLatThreshold = 0.4;

                    // 蜂群模式：允許把手交錯，但確保車身不撞
                    // (車寬平均和的一半) * 0.8，約等於允許 20% 的視覺邊緣重疊(後照鏡)
                    if (this.swarmTimer > 0) {
                        safeLatThreshold = ((this.width + other.width) / 2) * 0.8;
                    }
                } else {
                    safeLatThreshold = (this.width / 2) + (other.width / 2) + 0.2;
                }
                return latDist < safeLatThreshold;
            };

            // --- 遍歷所有車輛 (保持不變) ---
            for (const other of allVehicles) {
                if (other.id === this.id) continue;

                // 機車群體起步豁免
                if (this.twoStageState === 'leaving_box') {
                    if (other.twoStageState === 'leaving_box' ||
                        other.twoStageState === 'waiting' ||
                        other.twoStageState === 'moving_to_box') {
                        continue;
                    }
                }

                // 幾何安全網 (Geometric Safety Net)
                if (other.twoStageState === 'leaving_box' || other.twoStageState === 'waiting') {
                    if (!this.isMotorcycle && other.twoStageState === 'waiting') {
                        const distSq = (other.x - this.x) ** 2 + (other.y - this.y) ** 2;
                        if (distSq > 36) continue;
                    }

                    const dx = other.x - this.x;
                    const dy = other.y - this.y;
                    const cos = Math.cos(this.angle);
                    const sin = Math.sin(this.angle);
                    const fwdDist = dx * cos + dy * sin;
                    const sideDist = -dx * sin + dy * cos;

                    if (fwdDist > 0 && fwdDist < 50) {
                        const collisionWidth = (this.width / 2) + (other.width / 2) + 0.3;
                        if (Math.abs(sideDist) < collisionWidth) {
                            const currentGap = fwdDist - (this.length / 2) - (other.length / 2);
                            if (currentGap < gap) {
                                gap = currentGap;
                                leader = other;
                            }
                        }
                    }
                }

                // IDM 標準跟車檢查
                let isSameContext = false;
                if (this.state === 'onLink' && other.state === 'onLink' && this.currentLinkId === other.currentLinkId) {
                    isSameContext = true;
                } else if (this.state === 'inIntersection' && other.state === 'inIntersection' && this.currentTransition?.id === other.currentTransition?.id) {
                    isSameContext = true;
                }

                if (isSameContext) {
                    const distDiff = other.distanceOnPath - this.distanceOnPath;
                    if (distDiff > 0) {
                        if (isBlocking(other)) {
                            const currentGap = distDiff - (this.length / 2) - (other.length / 2);

                            // ============================================================
                            // 機車跟車邏輯（修改版：回歸標準判定）
                            // ============================================================
                            // 移除針對機車扣除 0.3m 的邏輯，完全遵循 XML 的 minDistance
                            if (currentGap < gap) {
                                gap = currentGap;
                                leader = other;
                            }
                            // ============================================================
                            // ============================================================
                        }
                    }
                }
            }
            // --- B. [新增] 右轉禮讓直行邏輯 (Right Hook Protection) ---
            // 只有「汽車」且「正在路口或接近路口」時才檢查
            if (!this.isMotorcycle && (this.state === 'inIntersection' || (this.state === 'onLink' && distanceToEndOfCurrentPath < 30))) {
                const conflictGap = this.detectRightTurnConflict(allVehicles, network);

                // 如果偵測到衝突，conflictGap 會是一個很小的數值 (例如 2.0米)
                // 這會強制覆蓋掉原本的 Gap，讓車子以為前面有障礙物
                if (conflictGap < gap) {
                    gap = conflictGap;
                    // 我們不設定實體 leader，因為這是虛擬障礙物，但 gap 的縮小足以觸發 IDM 減速
                    leader = null;
                }
            }
            // 4. [修正核心] 預判：檢查號誌、路口衝突、下游回堵
            if (this.state === 'onLink') {
                // =================================================================
                // ★★★ [新增] 彈射起步豁免邏輯 (Launch Control) ★★★
                // 如果正處於起步衝刺期 (swarmTimer > 0)，且前方沒有極近的物理障礙，
                // 強制無視交通號誌與安全距離，全力加速。
                // =================================================================
                if (this.isMotorcycle && this.swarmTimer > 0) {
                    // 起步衝刺期：允許機車更順暢地進入路口
                    // 僅在完全沒車時回傳 Infinity，有車則誠實回報
                    if (!leader) {
                        return { leader: null, gap: Infinity };
                    }
                    // 如果有前車但間距較大（> 3m），仍允許積極加速
                    if (gap > 3.0) {
                        return { leader, gap: gap * 1.5 }; // 放大間距，減少減速
                    }
                    return { leader, gap };
                }
                // =================================================================

                const checkDistance = Math.max(50, this.speed * 4);

                if (distanceToEndOfCurrentPath < checkDistance) {
                    const nextLinkIndex = this.currentLinkIndex + 1;
                    if (nextLinkIndex < this.route.length) {
                        const currentLink = network.links[this.currentLinkId];
                        const destNode = network.nodes[currentLink.destination];
                        const nextLinkId = this.route[nextLinkIndex];

                        // ★★★★★ [關鍵修正開始] ★★★★★
                        // 修正變數 finalLane 的定義。
                        // 舊邏輯：直接取 laneChangeGoal，導致車還沒換道就看錯燈號。
                        // 新邏輯：預設看當前車道。只有當換道動作已經「實質進行過半」時，才看目標車道。

                        let checkLane = this.currentLaneIndex;
                        if (this.laneChangeState && this.laneChangeState.progress > 0.5) {
                            checkLane = this.laneChangeState.toLaneIndex;
                        }
                        const finalLane = checkLane;
                        // ★★★★★ [關鍵修正結束] ★★★★★

                        let myTransition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === finalLane && t.destLinkId === nextLinkId);
                        if (!myTransition) {
                            myTransition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.destLinkId === nextLinkId);
                        }

                        if (myTransition) {
                            const isSignalized = network.trafficLights.some(t => t.nodeId === currentLink.destination);

                            if (isSignalized) {
                                const tfl = network.trafficLights.find(t => t.nodeId === currentLink.destination);
                                if (tfl) {
                                    const signal = tfl.getSignalForTurnGroup(myTransition.turnGroupId);
                                    if (signal === 'Red' || signal === 'Yellow') {
                                        let shouldStop = false;
                                        let obstacleDistance = distanceToEndOfCurrentPath;
                                        let stopLinePos;

                                        // 依據車種讀取不同的停止線設定
                                        if (this.isMotorcycle) {
                                            stopLinePos = network.motoStopLineMap ? network.motoStopLineMap[this.currentLinkId]?.[finalLane] : undefined;
                                        } else {
                                            stopLinePos = network.stopLineMap ? network.stopLineMap[this.currentLinkId]?.[finalLane] : undefined;
                                        }

                                        if (stopLinePos !== undefined) {
                                            const distToStopLine = stopLinePos - this.distanceOnPath;
                                            if (distToStopLine >= 0) {
                                                obstacleDistance = distToStopLine;
                                                shouldStop = true;
                                            } else {
                                                obstacleDistance = distanceToEndOfCurrentPath;
                                                shouldStop = true;
                                            }
                                        } else {
                                            obstacleDistance = distanceToEndOfCurrentPath;
                                            shouldStop = true;
                                        }
                                        if (signal === 'Red') {
                                            if (shouldStop && obstacleDistance < gap) {
                                                leader = null;
                                                gap = Math.max(0.1, obstacleDistance);
                                            }
                                        } else if (signal === 'Yellow') {
                                            const requiredBrakingDistance = (this.speed * this.speed) / (2 * this.comfortDecel);
                                            if (shouldStop && obstacleDistance > requiredBrakingDistance && obstacleDistance < gap) {
                                                leader = null;
                                                gap = Math.max(0.1, obstacleDistance);
                                            }
                                        }
                                    }
                                }
                            }

                            const nextLinkTargetLane = myTransition.destLaneIndex;
                            const transitionLen = myTransition.bezier ? myTransition.bezier.length : 10.0;

                            for (const other of allVehicles) {
                                if (other.id === this.id) continue;
                                let isTarget = false;
                                let distInNext = 0;

                                if (other.state === 'onLink' && other.currentLinkId === nextLinkId && other.currentLaneIndex === nextLinkTargetLane) {
                                    isTarget = true;
                                    distInNext = other.distanceOnPath;
                                } else if (other.state === 'inIntersection' && other.currentTransition?.destLinkId === nextLinkId && other.currentTransition?.destLaneIndex === nextLinkTargetLane) {
                                    if (other.twoStageState && other.twoStageState !== 'none') {
                                        isTarget = false;
                                    } else {
                                        isTarget = true;
                                        distInNext = -(transitionLen - other.distanceOnPath);
                                    }
                                }
                                if (isTarget) {
                                    // 下游預判間距修正
                                    const physicalGap = (distanceToEndOfCurrentPath + transitionLen + distInNext) - (this.length / 2) - (other.length / 2);
                                    // =================================================================
                                    // ★★★ [修復增強版] 機車起步與邊界並排豁免邏輯 ★★★
                                    // =================================================================
                                    if (this.isMotorcycle && other.isMotorcycle) {

                                        // 判斷是否處於「起步衝刺」或「低速跟隨」狀態
                                        // 1. 我正在起步模式 (swarmTimer > 0)
                                        // 2. 或者我速度很慢但前車有在動 (防止死鎖)
                                        const isSwarmStart = (this.swarmTimer > 0) || (this.speed < 3.0 && other.speed > 0.1);

                                        // 條件 A: 高速並排 (既有邏輯) -> 速度 > 1.5 且距離近
                                        // 條件 B: 起步並排 (新增邏輯) -> 處於起步狀態 且 前車只要有微小移動 (> 0.1) 就不視為障礙
                                        if ((other.speed > 1.5 && physicalGap < 8.0) ||
                                            (isSwarmStart && physicalGap < 5.0 && other.speed > 0.1)) {

                                            // 視為並排或群體起步，忽略此 Gap，避免 IDM 誤判煞車
                                            continue;
                                        }
                                    }
                                    // =================================================================
                                    if (isSignalized) {
                                        const spaceAvailable = distInNext > (this.length + 1.0);
                                        const isCongested = !spaceAvailable && other.speed < 2.0;
                                        if (isCongested) {
                                            const stopLineGap = distanceToEndOfCurrentPath;
                                            gap = Math.min(gap, stopLineGap, physicalGap);
                                        } else {
                                            gap = Math.min(gap, physicalGap);
                                        }
                                    } else {
                                        gap = Math.min(gap, physicalGap);
                                    }
                                }
                            }
                        } else {
                            // 如果當前車道沒有合法的 Transition (例如在直行車道卻想左轉)，
                            // 則視為路徑盡頭，車輛會減速停在當前車道的路口，而不會因為看錯燈號而急煞。
                            if (distanceToEndOfCurrentPath < gap) {
                                leader = null;
                                gap = Math.max(0.1, distanceToEndOfCurrentPath);
                            }
                        }
                    }
                }
            } else if (this.state === 'inIntersection' && this.currentTransition) {
                const targetDestLinkId = this.currentTransition.destLinkId;
                const targetDestLaneIndex = this.currentTransition.destLaneIndex;

                for (const other of allVehicles) {
                    if (other.id === this.id) continue;
                    if (this.twoStageState === 'moving_to_box') {
                        if (other.twoStageState === 'moving_to_box' || other.twoStageState === 'waiting') {
                            continue;
                        }
                    }
                    if (other.state === 'onLink' && other.currentLinkId === targetDestLinkId && other.currentLaneIndex === targetDestLaneIndex) {
                        if (isBlocking(other)) {
                            // 路口內預判間距修正
                            const lookaheadGap = (distanceToEndOfCurrentPath + other.distanceOnPath) - (this.length / 2) - (other.length / 2);
                            if (lookaheadGap < gap) {
                                gap = Math.max(0.1, lookaheadGap);
                                leader = other;
                            }
                        }
                    }
                }
            }
            return { leader, gap: Math.max(0.1, gap) };
        }

        /**
         * [新增] 偵測右轉衝突 (Right Hook Detection)
         * 回傳：如果有衝突，回傳一個虛擬的小 Gap 值；如果沒有，回傳 Infinity
         */
        detectRightTurnConflict(allVehicles, network) {
            // 1. 判斷自己是否正在右轉 (或準備右轉)
            let isTurningRight = false;

            // 方法：比較當前角度與下一條路的角度
            // 如果在路口內
            if (this.state === 'inIntersection' && this.currentTransition) {
                // 使用 Transition 的起終點角度差
                // 簡單判定：貝茲曲線角度變化。若角度往順時針變化超過一定閾值，視為右轉。
                // (注意：在標準數學座標，順時針是角度減少，Delta < 0)

                // 簡化判定：檢查 TurnGroupId 的訊號類型，或者檢查幾何
                // 這裡使用幾何判定：
                const pStart = this.currentTransition.bezier ? this.currentTransition.bezier.points[0] : null;
                const pEnd = this.currentTransition.bezier ? this.currentTransition.bezier.points[3] : null;
                if (pStart && pEnd) {
                    const startAngle = Math.atan2(pStart.y - this.y, pStart.x - this.x); // 近似
                    const endAngle = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
                    let diff = endAngle - this.angle;
                    while (diff <= -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;

                    // 閾值：-0.2 rad (約 11度) ~ -2.5 rad
                    if (diff < -0.2 && diff > -2.5) isTurningRight = true;
                }
            }
            // 如果在路段上 (接近路口)
            else if (this.state === 'onLink') {
                // 預判下一個 Transition
                // 簡化：如果目前在最外側車道，且下一條路是接續的，假設可能右轉風險較低
                // 但如果汽車不在最外側，而機車在更外側，就有風險。
                // 這裡為了效能與簡化，主要針對「已進入路口」或「路口極近處」做保護
                // 若要精確預判，需讀取 route 的下一條 link 計算角度，此處暫略，主要依靠 Intersection 狀態
            }

            if (!isTurningRight) return Infinity;

            // 2. 掃描危險區域 (右側與右後方)
            let minVirtualGap = Infinity;

            // 定義危險區參數
            const scanDistFwd = 10.0;  // 前方掃描距離
            const scanDistBack = -10.0; // 後方掃描距離 (盲點)
            const scanDistSide = 5.0;   // 右側寬度

            // 計算本車的右側向量 (假設 angle 是標準逆時針弧度)
            const cos = Math.cos(this.angle);
            const sin = Math.sin(this.angle);
            // 右側向量 (Right Vector): (sin, -cos) 
            const rx = sin;
            const ry = -cos;
            // 前方向量 (Forward Vector)
            const fx = cos;
            const fy = sin;

            for (const other of allVehicles) {
                // 只檢查機車
                if (!other.isMotorcycle) continue;
                if (other.id === this.id) continue;

                // 排除對向車道的車 (簡單過濾：距離太遠就跳過)
                const distSq = (other.x - this.x) ** 2 + (other.y - this.y) ** 2;
                if (distSq > 400) continue; // > 20m 忽略

                // 計算相對位置 (投影)
                const dx = other.x - this.x;
                const dy = other.y - this.y;

                // 投影到前方軸 (Longitudinal)
                const fwdProj = dx * fx + dy * fy;
                // 投影到右側軸 (Lateral) -> 正值代表在右邊
                const latProj = dx * rx + dy * ry;

                // 判斷是否在危險區內
                // 1. 在我右邊 (latProj > 0) 且不遠 (latProj < 5m)
                // 2. 在我前後範圍內 (-10m ~ +10m)
                if (latProj > 0.5 && latProj < scanDistSide &&
                    fwdProj > scanDistBack && fwdProj < scanDistFwd) {

                    // 3. 判斷機車意圖：必須是「直行」或「速度夠快」
                    // 如果機車也在右轉，那沒衝突；如果機車直行，就有衝突
                    // 這裡簡單判定：如果機車跟我的角度差不大 (代表它在直行)，或者它速度比我快

                    let angleDiff = other.angle - this.angle;
                    while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                    // 如果機車角度相對我是直的 ( abs(diff) < 0.5 )，視為直行車
                    // 或者機車速度 > 10km/h
                    if (Math.abs(angleDiff) < 0.8 || other.speed > 2.0) {
                        // ★ 觸發禮讓機制 ★
                        // 計算一個虛擬的 Gap，讓 IDM 煞車
                        // 我們希望車子停在衝突點之前，或是直接急煞

                        // 虛擬 Gap 設為 2.0 公尺 (強迫減速，但不至於瞬間定桿穿模)
                        // 如果機車很近，Gap 設更小
                        const penalty = Math.max(0.5, latProj / 2); // 越近越危險
                        minVirtualGap = Math.min(minVirtualGap, penalty);
                    }
                }
            }

            return minVirtualGap;
        }

        // ==================================================================================
        // 輔助與繪圖
        // ==================================================================================
        collectMeterData(oldDistanceOnPath, simulation) {
            const metersOnLink = simulation.speedMeters.filter(m => m.linkId === this.currentLinkId);
            metersOnLink.forEach(meter => {
                if (oldDistanceOnPath < meter.position && this.distanceOnPath >= meter.position) {
                    if (!meter.readings['all']) { meter.readings['all'] = []; }
                    const laneIdx = this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex;
                    if (!meter.readings[laneIdx]) { meter.readings[laneIdx] = []; }
                    meter.readings['all'].push(this.speed);
                    meter.readings[laneIdx].push(this.speed);
                }
            });
            const sectionMetersOnLink = simulation.sectionMeters.filter(m => m.linkId === this.currentLinkId);
            sectionMetersOnLink.forEach(meter => {
                if (!this.sectionEntryData[meter.id] && oldDistanceOnPath < meter.startPosition && this.distanceOnPath >= meter.startPosition) {
                    this.sectionEntryData[meter.id] = { entryTime: simulation.time };
                }
                else if (this.sectionEntryData[meter.id] && oldDistanceOnPath < meter.endPosition && this.distanceOnPath >= meter.endPosition) {
                    const entryTime = this.sectionEntryData[meter.id].entryTime;
                    const travelTime = simulation.time - entryTime;
                    if (travelTime > 0) {
                        const avgSpeedMs = meter.length / travelTime;
                        const avgSpeedKmh = avgSpeedMs * 3.6;
                        meter.completedVehicles.push({ time: simulation.time, speed: avgSpeedKmh });
                    }
                    delete this.sectionEntryData[meter.id];
                }
            });
        }

        getPositionOnPath(path, distance) {
            let distAcc = 0;
            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i];
                const p2 = path[i + 1];
                const segmentLen = Geom.Vec.dist(p1, p2);
                if (distance >= distAcc && distance <= distAcc + segmentLen) {
                    if (segmentLen < 1e-6) return { x: p1.x, y: p1.y, angle: 0 };
                    const ratio = (distance - distAcc) / segmentLen;
                    const segmentVec = Geom.Vec.sub(p2, p1);
                    const x = p1.x + segmentVec.x * ratio;
                    const y = p1.y + segmentVec.y * ratio;
                    const angle = Geom.Vec.angle(segmentVec);
                    return { x, y, angle };
                }
                distAcc += segmentLen;
            }
            if (path.length > 1) {
                const p1 = path[path.length - 2];
                const p2 = path[path.length - 1];
                const segmentVec = Geom.Vec.sub(p2, p1);
                return { x: p2.x, y: p2.y, angle: Geom.Vec.angle(segmentVec) };
            }
            return null;
        }

        updateDrawingPosition(network) {
            if (this.state === 'onLink') {
                const link = network.links[this.currentLinkId];
                const currentLane = link.lanes[this.currentLaneIndex];
                if (!currentLane) return;

                const limit = Math.max(0, (currentLane.width / 2) - (this.width / 2) - 0.1);
                if (this.lateralOffset > limit) this.lateralOffset = limit;
                if (this.lateralOffset < -limit) this.lateralOffset = -limit;

                if (this.laneChangeState) {
                    const fromLane = link.lanes[this.laneChangeState.fromLaneIndex];
                    const toLane = link.lanes[this.laneChangeState.toLaneIndex];

                    if (fromLane && toLane) {
                        const getExtendedPos = (lane, dist) => {
                            if (dist <= lane.length) {
                                return this.getPositionOnPath(lane.path, dist);
                            } else {
                                const pEnd = lane.path[lane.path.length - 1];
                                const pPrev = lane.path[lane.path.length - 2];
                                if (!pEnd || !pPrev) return this.getPositionOnPath(lane.path, lane.length);

                                const dx = pEnd.x - pPrev.x;
                                const dy = pEnd.y - pPrev.y;
                                const len = Math.hypot(dx, dy);
                                const ux = dx / len;
                                const uy = dy / len;
                                const diff = dist - lane.length;

                                return {
                                    x: pEnd.x + ux * diff,
                                    y: pEnd.y + uy * diff,
                                    angle: Math.atan2(uy, ux)
                                };
                            }
                        };

                        const posFrom = getExtendedPos(fromLane, this.distanceOnPath);
                        const posTo = getExtendedPos(toLane, this.distanceOnPath);

                        if (posFrom && posTo) {
                            const p = this.laneChangeState.progress;
                            const t = p * p * (3 - 2 * p);

                            const angleFrom = posFrom.angle;
                            const nxFrom = -Math.sin(angleFrom);
                            const nyFrom = Math.cos(angleFrom);
                            const realStartX = posFrom.x + nxFrom * this.laneChangeState.startOffset;
                            const realStartY = posFrom.y + nyFrom * this.laneChangeState.startOffset;

                            const angleTo = posTo.angle;
                            const nxTo = -Math.sin(angleTo);
                            const nyTo = Math.cos(angleTo);
                            const realEndX = posTo.x + nxTo * this.laneChangeState.endOffset;
                            const realEndY = posTo.y + nyTo * this.laneChangeState.endOffset;

                            this.x = realStartX * (1 - t) + realEndX * t;
                            this.y = realStartY * (1 - t) + realEndY * t;

                            const fromDir = { x: Math.cos(angleFrom), y: Math.sin(angleFrom) };
                            const toDir = { x: Math.cos(angleTo), y: Math.sin(angleTo) };
                            const interpDirX = fromDir.x * (1 - p) + toDir.x * p;
                            const interpDirY = fromDir.y * (1 - p) + toDir.y * p;

                            const laneDiff = this.laneChangeState.toLaneIndex - this.laneChangeState.fromLaneIndex;
                            const yawBias = laneDiff * 0.15 * Math.sin(p * Math.PI);

                            this.angle = Math.atan2(interpDirY, interpDirX) + yawBias;
                        }
                    }
                } else {
                    const posData = this.getPositionOnPath(currentLane.path, this.distanceOnPath);
                    if (posData) {
                        const angle = posData.angle;
                        const nx = -Math.sin(angle);
                        const ny = Math.cos(angle);
                        this.x = posData.x + nx * this.lateralOffset;
                        this.y = posData.y + ny * this.lateralOffset;
                        this.angle = angle;
                    }
                }
            } else if (this.state === 'inIntersection' || this.state === 'parking_maneuver') {
                // ★★★★★ [關鍵修正] 支援 直線(2點) 與 貝茲曲線(4點) 兩種模式 ★★★★★

                // 防呆：如果 path 遺失，直接返回
                if (!this.currentPath || this.currentPath.length < 2) return;

                if (this.currentPath.length === 2) {
                    // --- 直線模式 (兩段式左轉/停車) ---
                    const p0 = this.currentPath[0];
                    const p1 = this.currentPath[1];

                    let t = 0;
                    if (this.currentPathLength > 0.001) {
                        t = this.distanceOnPath / this.currentPathLength;
                    }
                    t = Math.max(0, Math.min(1.0, t));

                    // 線性插值
                    this.x = p0.x + (p1.x - p0.x) * t;
                    this.y = p0.y + (p1.y - p0.y) * t;

                    // 角度：沿著直線方向
                    // (如果是待轉區 Waiting 狀態，angle 會在 update 裡被強制覆蓋為朝向目標路口，所以這裡算出的值可能會被蓋過，沒關係)
                    if (this.twoStageState !== 'waiting') {
                        this.angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
                    }

                } else if (this.currentPath.length >= 4) {
                    // --- 貝茲曲線模式 (一般轉彎) ---
                    const t = this.distanceOnPath / this.currentPathLength;
                    const [p0, p1, p2, p3] = this.currentPath;

                    const safeT = Math.max(0, Math.min(1.0, t));

                    const pos = Geom.Bezier.getPoint(safeT, p0, p1, p2, p3);
                    const tangent = Geom.Bezier.getTangent(safeT, p0, p1, p2, p3);
                    const angle = Geom.Vec.angle(tangent);

                    const nx = -Math.sin(angle);
                    const ny = Math.cos(angle);

                    this.x = pos.x + nx * this.lateralOffset;
                    this.y = pos.y + ny * this.lateralOffset;
                    this.angle = angle;
                }
            }
        }
    }
    // --- Stats & Charts Helper Functions ---
    function initializeCharts() {
        if (vehicleCountChart) vehicleCountChart.destroy();
        if (avgSpeedChart) avgSpeedChart.destroy();
        const dict = translations[currentLang];
        // Chart options 保持不變
        const chartOptions = (yAxisTitle) => ({
            responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
            scales: { x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } }, y: { beginAtZero: true, title: { display: true, text: yAxisTitle }, suggestedMax: 10 } },
            plugins: { legend: { display: false } }, elements: { point: { radius: 1 }, line: { tension: 0.1, borderWidth: 2 } }
        });
        vehicleCountChart = new Chart(vehicleCountChartCanvas, { type: 'line', data: { labels: [], datasets: [{ label: dict.chartVehicleAxis, data: [], borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.5)' }] }, options: chartOptions(dict.chartVehicleAxis) });
        avgSpeedChart = new Chart(avgSpeedChartCanvas, { type: 'line', data: { labels: [], datasets: [{ label: dict.chartSpeedAxis, data: [], borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)' }] }, options: chartOptions(dict.chartSpeedAxis) });
    }
    // [修正] 定點偵測器圖表生成：適配新的 CSS (.chart-card > .chart-box)
    function setupMeterCharts(meters) {
        meterChartsContainer.innerHTML = '';
        meterCharts = {};
        const dict = translations[currentLang];

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false, // 關鍵：讓它隨父容器 (.chart-box) 縮放
            animation: { duration: 0 },
            scales: {
                x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis }, ticks: { autoSkip: true, maxRotation: 45, minRotation: 0, } },
                y: { beginAtZero: true, title: { display: true, text: dict.meterChartSpeedAxis }, suggestedMax: 60 }
            },
            plugins: { legend: { display: true, position: 'top', } },
            elements: { point: { radius: 3 } }
        };

        meters.forEach(meter => {
            // 1. 建立外層卡片 (Chart Card)
            const cardDiv = document.createElement('div');
            cardDiv.className = 'chart-card'; // 改用新版 class

            // 2. 建立標題
            const title = document.createElement('h3');
            title.textContent = `${dict.meterTitle} ${meter.id} (${meter.name})`;
            cardDiv.appendChild(title);

            // 3. 建立圖表容器 (Chart Box) - 用於控制高度
            const boxDiv = document.createElement('div');
            boxDiv.className = 'chart-box'; // 改用新版 class

            // 4. 建立 Canvas
            const canvasEl = document.createElement('canvas');
            canvasEl.id = `meter-chart-${meter.id}`;

            boxDiv.appendChild(canvasEl);
            cardDiv.appendChild(boxDiv);
            meterChartsContainer.appendChild(cardDiv);

            const datasets = [{ label: dict.allLanesLabel, data: [], backgroundColor: 'rgba(0, 0, 0, 0.7)', }];
            for (let i = 0; i < meter.numLanes; i++) {
                datasets.push({ label: `${dict.laneLabel} ${i}`, data: [], backgroundColor: LANE_COLORS[i % LANE_COLORS.length] });
            }
            meterCharts[meter.id] = new Chart(canvasEl.getContext('2d'), { type: 'scatter', data: { datasets: datasets }, options: chartOptions });
        });
    }

    // [修正] 區間偵測器圖表生成：適配新的 CSS (.chart-card > .chart-box)
    function setupSectionMeterCharts(meters) {
        sectionMeterChartsContainer.innerHTML = '';
        sectionMeterCharts = {};
        const dict = translations[currentLang];

        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false, // 關鍵
            animation: { duration: 0 },
            scales: {
                x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } },
                y: { beginAtZero: true, title: { display: true, text: dict.sectionChartSpeedAxis }, suggestedMax: 60 }
            },
            plugins: { legend: { display: true, position: 'top', } },
            elements: { point: { radius: 2 }, line: { tension: 0.1, borderWidth: 2 } }
        };

        meters.forEach(meter => {
            // 1. 建立外層卡片
            const cardDiv = document.createElement('div');
            cardDiv.className = 'chart-card';

            // 2. 建立標題
            const title = document.createElement('h3');
            title.textContent = `${dict.sectionMeterTitle} ${meter.id} (${meter.name})`;
            cardDiv.appendChild(title);

            // 3. 建立圖表容器
            const boxDiv = document.createElement('div');
            boxDiv.className = 'chart-box';

            // 4. 建立 Canvas
            const canvasEl = document.createElement('canvas');
            canvasEl.id = `section-meter-chart-${meter.id}`;

            boxDiv.appendChild(canvasEl);
            cardDiv.appendChild(boxDiv);
            sectionMeterChartsContainer.appendChild(cardDiv);

            const newChart = new Chart(canvasEl.getContext('2d'), { type: 'line', data: { datasets: [{ label: dict.allLanesAvgRateLabel, data: [], borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.5)', }] }, options: chartOptions });
            sectionMeterCharts[meter.id] = newChart;
        });
    }
    function updateStatistics(time) {
        if (!simulation) return;
        const vehicles = simulation.vehicles; const vehicleCount = vehicles.length; let avgSpeedKmh = 0; if (vehicleCount > 0) { const totalSpeed = vehicles.reduce((sum, v) => sum + v.speed, 0); avgSpeedKmh = (totalSpeed / vehicleCount) * 3.6; } maxVehicleCount = Math.max(maxVehicleCount, vehicleCount); maxAvgSpeed = Math.max(maxAvgSpeed, avgSpeedKmh); const newData = { time, count: vehicleCount, speed: avgSpeedKmh }; if (!statsData.some(d => d.time === time)) { statsData.push(newData); } updateStatsUI(newData);
        simulation.speedMeters.forEach(meter => { const chart = meterCharts[meter.id]; if (!chart) return; const dict = translations[currentLang]; let currentMaxSpeed = 0; for (const key in meter.readings) { const readings = meter.readings[key]; if (readings.length > 0) { const totalSpeed = readings.reduce((sum, s) => sum + s, 0); const avgSpeedMs = totalSpeed / readings.length; const meterAvgSpeedKmh = avgSpeedMs * 3.6; currentMaxSpeed = Math.max(currentMaxSpeed, meterAvgSpeedKmh); const label = (key === 'all') ? dict.allLanesLabel : `${dict.laneLabel} ${key}`; const dataset = chart.data.datasets.find(d => d.label === label); if (dataset) { dataset.data.push({ x: time, y: meterAvgSpeedKmh }); } } } meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, currentMaxSpeed); chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60; chart.update('none'); meter.readings = {}; });
        simulation.sectionMeters.forEach(meter => { const chart = sectionMeterCharts[meter.id]; if (!chart) return; if (meter.completedVehicles.length > 0) { const totalSpeed = meter.completedVehicles.reduce((sum, v) => sum + v.speed, 0); const avgSpeed = totalSpeed / meter.completedVehicles.length; chart.data.datasets[0].data.push({ x: time, y: avgSpeed }); meter.lastAvgSpeed = avgSpeed; meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, avgSpeed); } else if (meter.lastAvgSpeed !== null) { chart.data.datasets[0].data.push({ x: time, y: meter.lastAvgSpeed }); } chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60; chart.update('none'); meter.completedVehicles = []; });
    }
    function updateStatsUI(data, isRepopulating = false) { if (!isRepopulating) { const newRow = statsTableBody.insertRow(0); newRow.insertCell(0).textContent = data.time; newRow.insertCell(1).textContent = data.count; newRow.insertCell(2).textContent = data.speed.toFixed(2); if (statsTableBody.rows.length > 200) statsTableBody.deleteRow(-1); } if (vehicleCountChart && !vehicleCountChart.data.labels.includes(data.time)) { vehicleCountChart.data.labels.push(data.time); vehicleCountChart.data.datasets[0].data.push(data.count); vehicleCountChart.options.scales.y.max = maxVehicleCount > 10 ? Math.ceil(maxVehicleCount * 1.1) : 10; vehicleCountChart.update('none'); } if (avgSpeedChart && !avgSpeedChart.data.labels.includes(data.time)) { avgSpeedChart.data.labels.push(data.time); avgSpeedChart.data.datasets[0].data.push(data.speed); avgSpeedChart.options.scales.y.max = maxAvgSpeed > 10 ? Math.ceil(maxAvgSpeed * 1.1) : 10; avgSpeedChart.update('none'); } }
    function resetStatistics() { statsData = []; lastLoggedIntegerTime = -1; maxVehicleCount = 0; maxAvgSpeed = 0; statsTableBody.innerHTML = ''; initializeCharts(); meterChartsContainer.innerHTML = ''; meterCharts = {}; sectionMeterChartsContainer.innerHTML = ''; sectionMeterCharts = {}; }

    // --- Parser ---
    function parseTrafficModel(xmlDoc) {
        return new Promise((resolve, reject) => {
            const links = {};
            const nodes = {};
            let spawners = [];
            let trafficLights = [];
            const staticVehicles = [];
            const speedMeters = [];
            const sectionMeters = [];
            const vehicleProfiles = {};
            let navigationMode = 'OD_BASED';

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const updateBounds = (p) => {
                minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
            };

            const backgroundTiles = [];
            const imagePromises = [];
            const imageTypeMap = { 'PNG': 'png', 'JPG': 'jpeg', 'JPEG': 'jpeg', 'BMP': 'bmp', 'GIF': 'gif', 'TIFF': 'tiff' };

            // =========================================================
            // [修正] 補上缺失的 XML 解析輔助函式
            // =========================================================
            function getChildrenByLocalName(parent, localName) {
                if (!parent) return [];
                return Array.from(parent.children).filter(child => {
                    const nodeName = child.localName || child.baseName || child.nodeName.split(':').pop();
                    return nodeName === localName;
                });
            }

            function getChildValue(parent, localName) {
                const children = getChildrenByLocalName(parent, localName);
                return children.length > 0 ? children[0].textContent : null;
            }
            // =========================================================


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

            // --- 1. 解析全域參數 ---
            const paramsEl = xmlDoc.getElementsByTagName("ModelParameters")[0] || xmlDoc.getElementsByTagName("tm:ModelParameters")[0];
            if (paramsEl) {
                const modeEl = paramsEl.getElementsByTagName("NavigationMode")[0] || paramsEl.getElementsByTagName("tm:NavigationMode")[0];
                if (modeEl) navigationMode = modeEl.textContent;
            }

            // [新增] 解析 GlobalVehicleProfiles
            const globalProfEl = xmlDoc.getElementsByTagName("GlobalVehicleProfiles")[0] || xmlDoc.getElementsByTagName("tm:GlobalVehicleProfiles")[0];
            if (globalProfEl) {
                const profiles = globalProfEl.querySelectorAll('VehicleProfile, tm\\:VehicleProfile');
                profiles.forEach(profEl => {
                    const pId = profEl.getAttribute('id');
                    const vehicleEl = profEl.querySelector('RegularVehicle') || profEl.querySelector('tm\\:RegularVehicle');
                    const paramsEl = profEl.querySelector('Parameters') || profEl.querySelector('tm\\:Parameters');

                    if (pId && vehicleEl && paramsEl) {
                        vehicleProfiles[pId] = {
                            id: pId,
                            length: parseFloat(vehicleEl.querySelector('length, tm\\:length').textContent),
                            width: parseFloat(vehicleEl.querySelector('width, tm\\:width').textContent),
                            params: {
                                maxSpeed: parseFloat(paramsEl.querySelector('maxSpeed, tm\\:maxSpeed').textContent),
                                maxAcceleration: parseFloat(paramsEl.querySelector('maxAcceleration, tm\\:maxAcceleration').textContent),
                                comfortDeceleration: parseFloat(paramsEl.querySelector('comfortDeceleration, tm\\:comfortDeceleration').textContent),
                                minDistance: parseFloat(paramsEl.querySelector('minDistance, tm\\:minDistance').textContent),
                                desiredHeadwayTime: parseFloat(paramsEl.querySelector('desiredHeadwayTime, tm\\:desiredHeadwayTime').textContent)
                            }
                        };
                    }
                });
            }

            // --- 2. 解析 Links ---
            xmlDoc.querySelectorAll('Link').forEach(linkEl => {
                const linkId = linkEl.querySelector('id').textContent;
                const sourceNodeId = linkEl.querySelector('sourceNodeId')?.textContent;
                const destinationNodeId = linkEl.querySelector('destinationNodeId')?.textContent;

                links[linkId] = {
                    id: linkId,
                    source: sourceNodeId,
                    destination: destinationNodeId,
                    length: parseFloat(linkEl.querySelector('length').textContent),
                    geometry: [],
                    lanes: {},
                    dividingLines: [],
                    roadSigns: []
                };
                const link = links[linkId];

                linkEl.querySelectorAll('Lanes > Lane').forEach(laneEl => {
                    const laneIndex = parseInt(laneEl.querySelector('index').textContent, 10);
                    const laneWidth = parseFloat(laneEl.querySelector('width').textContent);
                    link.lanes[laneIndex] = { index: laneIndex, width: laneWidth, path: [], length: 0 };
                });

                const numLanes = Object.keys(link.lanes).length;
                if (numLanes > 1) {
                    for (let i = 0; i < numLanes - 1; i++) {
                        link.dividingLines[i] = { path: [] };
                    }
                }

                const centerlinePolyline = [];
                const waypointsEl = linkEl.querySelectorAll('Waypoints > Waypoint');
                const hasWaypoints = waypointsEl.length >= 2;

                if (hasWaypoints) {
                    waypointsEl.forEach(wp => {
                        const x = parseFloat(wp.querySelector('x').textContent);
                        const y = -parseFloat(wp.querySelector('y').textContent);
                        const p = { x, y };
                        centerlinePolyline.push(p);
                        updateBounds(p);
                    });
                } else {
                    const segments = Array.from(linkEl.querySelectorAll('TrapeziumSegment, Segments > TrapeziumSegment'));
                    segments.forEach(segEl => {
                        const ls = segEl.querySelector('LeftSide > Start');
                        const le = segEl.querySelector('LeftSide > End');
                        const rs = segEl.querySelector('RightSide > Start');
                        const re = segEl.querySelector('RightSide > End');
                        const p1 = { x: parseFloat(ls.querySelector('x').textContent), y: -parseFloat(ls.querySelector('y').textContent) };
                        const p2 = { x: parseFloat(rs.querySelector('x').textContent), y: -parseFloat(rs.querySelector('y').textContent) };
                        const p3 = { x: parseFloat(re.querySelector('x').textContent), y: -parseFloat(re.querySelector('y').textContent) };
                        const p4 = { x: parseFloat(le.querySelector('x').textContent), y: -parseFloat(le.querySelector('y').textContent) };
                        link.geometry.push({ type: 'trapezium', points: [p1, p2, p3, p4] });
                        [p1, p2, p3, p4].forEach(updateBounds);

                        const centerStart = Geom.Vec.scale(Geom.Vec.add(p1, p2), 0.5);
                        const centerEnd = Geom.Vec.scale(Geom.Vec.add(p4, p3), 0.5);
                        if (centerlinePolyline.length === 0) centerlinePolyline.push(centerStart);
                        centerlinePolyline.push(centerEnd);

                        segEl.querySelectorAll('RoadSigns > SpeedLimitSign').forEach(signEl => {
                            const position = parseFloat(signEl.querySelector('position').textContent);
                            const speedLimit = parseFloat(signEl.querySelector('speedLimit').textContent);
                            link.roadSigns.push({ type: 'limit', position, limit: speedLimit });
                        });
                        segEl.querySelectorAll('RoadSigns > NoSpeedLimitSign').forEach(signEl => {
                            const position = parseFloat(signEl.querySelector('position').textContent);
                            link.roadSigns.push({ type: 'no_limit', position });
                        });
                    });
                }

                const miteredNormals = [];
                if (centerlinePolyline.length > 1) {
                    for (let i = 0; i < centerlinePolyline.length; i++) {
                        let finalNormal;
                        if (i === 0) {
                            const segVec = Geom.Vec.sub(centerlinePolyline[1], centerlinePolyline[0]);
                            finalNormal = Geom.Vec.normalize(Geom.Vec.normal(segVec));
                        } else if (i === centerlinePolyline.length - 1) {
                            const segVec = Geom.Vec.sub(centerlinePolyline[i], centerlinePolyline[i - 1]);
                            finalNormal = Geom.Vec.normalize(Geom.Vec.normal(segVec));
                        } else {
                            const v_in = Geom.Vec.sub(centerlinePolyline[i], centerlinePolyline[i - 1]);
                            const v_out = Geom.Vec.sub(centerlinePolyline[i + 1], centerlinePolyline[i]);
                            const n_in = Geom.Vec.normalize(Geom.Vec.normal(v_in));
                            const n_out = Geom.Vec.normalize(Geom.Vec.normal(v_out));
                            const miter_vec = Geom.Vec.add(n_in, n_out);
                            if (Geom.Vec.len(miter_vec) < 1e-6) {
                                finalNormal = n_in;
                            } else {
                                const dot_product = n_in.x * n_out.x + n_in.y * n_out.y;
                                const safe_dot = Math.max(-1.0, Math.min(1.0, dot_product));
                                const cos_half_angle = Math.sqrt((1 + safe_dot) / 2);
                                if (cos_half_angle > 1e-6) {
                                    const scale_factor = 1.0 / cos_half_angle;
                                    finalNormal = Geom.Vec.scale(Geom.Vec.normalize(miter_vec), scale_factor);
                                } else {
                                    finalNormal = n_in;
                                }
                            }
                        }
                        miteredNormals.push(finalNormal);
                    }
                }

                const orderedLanes = Object.values(link.lanes).sort((a, b) => a.index - b.index);
                const totalWidth = orderedLanes.reduce((sum, lane) => sum + lane.width, 0);

                if (hasWaypoints && centerlinePolyline.length > 1) {
                    const leftEdgePoints = [];
                    const rightEdgePoints = [];
                    for (let i = 0; i < centerlinePolyline.length; i++) {
                        const centerPoint = centerlinePolyline[i];
                        const normal = miteredNormals[i];
                        const halfWidth = totalWidth / 2;
                        leftEdgePoints.push(Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, -halfWidth)));
                        rightEdgePoints.push(Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, halfWidth)));
                    }
                    link.geometry.push({ type: 'polygon', points: [...leftEdgePoints, ...rightEdgePoints.reverse()] });

                    if (link.roadSigns.length === 0) {
                        const segs = linkEl.querySelectorAll('Segments > TrapeziumSegment');
                        segs.forEach(segEl => {
                            segEl.querySelectorAll('RoadSigns > SpeedLimitSign').forEach(signEl => {
                                const position = parseFloat(signEl.querySelector('position').textContent);
                                const speedLimit = parseFloat(signEl.querySelector('speedLimit').textContent);
                                link.roadSigns.push({ type: 'limit', position, limit: speedLimit });
                            });
                            segEl.querySelectorAll('RoadSigns > NoSpeedLimitSign').forEach(signEl => {
                                const position = parseFloat(signEl.querySelector('position').textContent);
                                link.roadSigns.push({ type: 'no_limit', position });
                            });
                        });
                    }
                }

                for (let i = 0; i < centerlinePolyline.length; i++) {
                    const centerPoint = centerlinePolyline[i];
                    const normal = miteredNormals[i];
                    let cumulativeWidth = 0;
                    for (let j = 0; j < orderedLanes.length; j++) {
                        const lane = orderedLanes[j];
                        const laneCenterOffsetFromEdge = cumulativeWidth + lane.width / 2;
                        const offsetFromRoadCenter = laneCenterOffsetFromEdge - totalWidth / 2;
                        const lanePoint = Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, offsetFromRoadCenter));
                        lane.path.push(lanePoint);
                        cumulativeWidth += lane.width;
                        if (j < orderedLanes.length - 1) {
                            const divider = link.dividingLines[j];
                            const dividerOffsetFromRoadCenter = cumulativeWidth - totalWidth / 2;
                            const linePoint = Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, dividerOffsetFromRoadCenter));
                            divider.path.push(linePoint);
                        }
                    }
                }
                for (const lane of Object.values(link.lanes)) {
                    lane.length = 0;
                    for (let i = 0; i < lane.path.length - 1; i++) {
                        lane.length += Geom.Vec.dist(lane.path[i], lane.path[i + 1]);
                    }
                }
                link.roadSigns.sort((a, b) => a.position - b.position);
            });

            // --- 3. 解析 Nodes ---
            xmlDoc.querySelectorAll('Nodes > *').forEach(nodeEl => {
                const nodeId = nodeEl.querySelector('id').textContent;
                nodes[nodeId] = { id: nodeId, transitions: [], turnGroups: {}, polygon: [], turningRatios: {} };
                const node = nodes[nodeId];

                nodeEl.querySelectorAll('PolygonGeometry > Point').forEach(p => {
                    const point = { x: parseFloat(p.querySelector('x').textContent), y: -parseFloat(p.querySelector('y').textContent) };
                    node.polygon.push(point);
                });
                if (node.polygon.length === 0) {
                    const circle = nodeEl.querySelector('CircleGeometry');
                    if (circle) {
                        const center = circle.querySelector('Center');
                        const radius = parseFloat(circle.querySelector('radius').textContent);
                        const cx = parseFloat(center.querySelector('x').textContent);
                        const cy = -parseFloat(center.querySelector('y').textContent);
                        for (let i = 0; i < 12; i++) {
                            const angle = (i / 12) * 2 * Math.PI;
                            node.polygon.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
                        }
                    }
                }

                nodeEl.querySelectorAll('TransitionRule').forEach(ruleEl => {
                    const idEl = ruleEl.querySelector('id');
                    const sourceLinkEl = ruleEl.querySelector('sourceLinkId');
                    if (idEl && sourceLinkEl) {
                        const transition = {
                            id: idEl.textContent,
                            sourceLinkId: sourceLinkEl.textContent,
                            sourceLaneIndex: parseInt(ruleEl.querySelector('sourceLaneIndex').textContent, 10),
                            destLinkId: ruleEl.querySelector('destinationLinkId').textContent,
                            destLaneIndex: parseInt(ruleEl.querySelector('destinationLaneIndex').textContent, 10),
                        };
                        const bezierEl = ruleEl.querySelector('BezierCurveGeometry');
                        if (bezierEl) {
                            const points = Array.from(bezierEl.querySelectorAll('Point')).map(pEl => ({ x: parseFloat(pEl.querySelector('x').textContent), y: -parseFloat(pEl.querySelector('y').textContent) }));
                            if (points.length === 4) {
                                transition.bezier = { points: points, length: Geom.Bezier.getLength(...points) };
                            }
                        }
                        node.transitions.push(transition);
                    }
                });

                nodeEl.querySelectorAll('TurnTRGroup').forEach(groupEl => {
                    const groupId = groupEl.querySelector('id').textContent;
                    groupEl.querySelectorAll('TransitionRule').forEach(ruleRefEl => {
                        const ruleIdEl = ruleRefEl.querySelector('transitionRuleId');
                        if (ruleIdEl) {
                            const ruleId = ruleIdEl.textContent;
                            const transition = node.transitions.find(t => t.id === ruleId);
                            if (transition) transition.turnGroupId = groupId;
                        }
                    });
                });

                const trContainer = nodeEl.querySelector('TurningRatios');
                if (trContainer) {
                    let incomingList = trContainer.getElementsByTagName('IncomingLink');
                    if (incomingList.length === 0) incomingList = trContainer.getElementsByTagName('tm:IncomingLink');
                    const incomingEls = Array.from(incomingList);

                    incomingEls.forEach(inEl => {
                        const fromId = inEl.getAttribute('id');
                        node.turningRatios[fromId] = {};

                        let turnList = inEl.getElementsByTagName('TurnTo');
                        if (turnList.length === 0) turnList = inEl.getElementsByTagName('tm:TurnTo');
                        const turnEls = Array.from(turnList);

                        turnEls.forEach(turnEl => {
                            const toId = turnEl.getAttribute('linkId');
                            const prob = parseFloat(turnEl.getAttribute('probability'));
                            node.turningRatios[fromId][toId] = prob;
                        });
                    });
                }
            });

            // --- 4. 解析 Traffic Lights ---
            xmlDoc.querySelectorAll('RegularTrafficLightNetwork').forEach(netEl => {
                const nodeId = netEl.querySelector('regularNodeId').textContent;
                const config = { nodeId: nodeId, schedule: [], lights: {}, timeShift: 0 };
                const timeShiftEl = netEl.querySelector('scheduleTimeShift');
                if (timeShiftEl) {
                    config.timeShift = parseFloat(timeShiftEl.textContent) || 0;
                }
                netEl.querySelectorAll('TrafficLight').forEach(lightEl => {
                    const lightId = lightEl.querySelector('id').textContent;
                    const turnTRGroupIds = Array.from(lightEl.querySelectorAll('turnTRGroupId')).map(id => id.textContent);
                    config.lights[lightId] = { id: lightId, turnTRGroupIds: turnTRGroupIds };
                });
                netEl.querySelectorAll('Schedule > TimePeriods > TimePeriod').forEach(periodEl => {
                    const period = { duration: parseFloat(periodEl.querySelector('duration').textContent), signals: {} };
                    periodEl.querySelectorAll('TrafficLightSignal').forEach(sigEl => {
                        const lightId = sigEl.querySelector('trafficLightId').textContent;
                        const signal = sigEl.querySelector('signal').textContent;
                        const light = config.lights[lightId];
                        if (light) {
                            light.turnTRGroupIds.forEach(groupId => { period.signals[groupId] = signal; });
                        }
                    });
                    config.schedule.push(period);
                });
                trafficLights.push(new TrafficLightController(config));
            });

            // --- 5. 解析 Origins & Vehicle Profiles ---
            let importedProfileCounter = 0;
            xmlDoc.querySelectorAll('Origins > Origin').forEach(originEl => {
                const originNodeId = originEl.querySelector('originNodeId').textContent;
                const periods = [];
                originEl.querySelectorAll('TimePeriods > TimePeriod').forEach(timePeriodEl => {
                    const periodConfig = {
                        duration: parseFloat(timePeriodEl.querySelector('duration').textContent),
                        numVehicles: parseInt(timePeriodEl.querySelector('numberOfVehicles').textContent, 10),
                        stops: [],
                        destinations: [],
                        vehicleProfiles: []
                    };
                    timePeriodEl.querySelectorAll('Destinations > Destination').forEach(destEl => {
                        periodConfig.destinations.push({
                            weight: parseFloat(destEl.querySelector('weight').textContent),
                            destinationNodeId: destEl.querySelector('destinationNodeId').textContent
                        });
                    });

                    let stopsElList = timePeriodEl.getElementsByTagName('IntermediateStops');
                    if (stopsElList.length === 0) stopsElList = timePeriodEl.getElementsByTagName('tm:IntermediateStops');

                    if (stopsElList.length > 0) {
                        const stopsEl = stopsElList[0];
                        for (let k = 0; k < stopsEl.children.length; k++) {
                            const stopEl = stopsEl.children[k];
                            if (stopEl.nodeType !== 1) continue;

                            const getVal = (tag) => {
                                const els = stopEl.getElementsByTagName(tag);
                                if (els.length > 0) return els[0].textContent;
                                const elsNS = stopEl.getElementsByTagName('tm:' + tag);
                                return elsNS.length > 0 ? elsNS[0].textContent : null;
                            };

                            const pId = getVal('parkingLotId');
                            const prob = getVal('probability');
                            const dur = getVal('duration');

                            if (pId) {
                                periodConfig.stops.push({
                                    parkingLotId: pId,
                                    probability: prob ? parseFloat(prob) : 100,
                                    duration: dur ? parseFloat(dur) * 60 : 300
                                });
                            }
                        }
                    }

                    timePeriodEl.querySelectorAll('VehicleProfiles > VehicleProfile').forEach(profEl => {
                        const driverParams = profEl.querySelector('Parameters');
                        const vehicleEl = profEl.querySelector('RegularVehicle');

                        const profileData = {
                            length: parseFloat(vehicleEl.querySelector('length').textContent),
                            width: parseFloat(vehicleEl.querySelector('width').textContent),
                            params: {
                                maxSpeed: parseFloat(driverParams.querySelector('maxSpeed').textContent),
                                maxAcceleration: parseFloat(driverParams.querySelector('maxAcceleration').textContent),
                                comfortDeceleration: parseFloat(driverParams.querySelector('comfortDeceleration').textContent),
                                minDistance: parseFloat(driverParams.querySelector('minDistance').textContent),
                                desiredHeadwayTime: parseFloat(driverParams.querySelector('desiredHeadwayTime').textContent)
                            }
                        };

                        const profileId = `imported_profile_${importedProfileCounter++}`;
                        profileData.id = profileId;
                        vehicleProfiles[profileId] = profileData;

                        periodConfig.vehicleProfiles.push({ weight: parseFloat(profEl.querySelector('weight').textContent), ...profileData });
                    });
                    periods.push(periodConfig);
                });
                if (periods.length > 0) {
                    spawners.push({ originNodeId, periods });
                }
            });

            // --- 6. 解析 Static Vehicles ---
            xmlDoc.querySelectorAll('Agents > Vehicles > RegularVehicle').forEach(vehicleEl => {
                const driverParamsEl = vehicleEl.querySelector('Parameters');
                const locationEl = vehicleEl.querySelector('LinkLocation');
                if (!driverParamsEl || !locationEl) return;
                const staticVehicle = {
                    profile: {
                        length: parseFloat(vehicleEl.querySelector('length').textContent),
                        width: parseFloat(vehicleEl.querySelector('width').textContent),
                        params: {
                            maxSpeed: parseFloat(driverParamsEl.querySelector('maxSpeed').textContent),
                            maxAcceleration: parseFloat(driverParamsEl.querySelector('maxAcceleration').textContent),
                            comfortDeceleration: parseFloat(driverParamsEl.querySelector('comfortDeceleration').textContent),
                            minDistance: parseFloat(driverParamsEl.querySelector('minDistance').textContent),
                            desiredHeadwayTime: parseFloat(driverParamsEl.querySelector('desiredHeadwayTime').textContent),
                        }
                    },
                    initialState: {
                        distanceOnPath: parseFloat(locationEl.querySelector('position').textContent),
                        speed: parseFloat(vehicleEl.querySelector('speed').textContent)
                    },
                    startLinkId: locationEl.querySelector('linkId').textContent,
                    startLaneIndex: parseInt(locationEl.querySelector('laneIndex').textContent, 10),
                    destinationNodeId: vehicleEl.querySelector('CompositeDriver > destinationNodeId').textContent
                };
                staticVehicles.push(staticVehicle);
            });

            // --- 7. 解析 Meters ---
            const parseSpawnProfiles = (meterEl) => {
                const profiles = [];
                const spEl = meterEl.querySelector('SpawnProfiles') || meterEl.querySelector('tm\\:SpawnProfiles');

                if (spEl) {
                    const entries = spEl.querySelectorAll('ProfileEntry') || spEl.querySelectorAll('tm\\:ProfileEntry');
                    entries.forEach(entry => {
                        const pid = entry.querySelector('profileId')?.textContent || entry.querySelector('tm\\:profileId')?.textContent;
                        const wStr = entry.querySelector('weight')?.textContent || entry.querySelector('tm\\:weight')?.textContent;
                        const w = parseFloat(wStr);

                        if (pid) {
                            profiles.push({ profileId: pid, weight: !isNaN(w) ? w : 1.0 });
                        }
                    });
                }

                if (profiles.length === 0) {
                    const oldIdEl = meterEl.querySelector('spawnProfileId') || meterEl.querySelector('tm\\:spawnProfileId');
                    if (oldIdEl && oldIdEl.textContent) {
                        profiles.push({ profileId: oldIdEl.textContent, weight: 1.0 });
                    }
                }
                return profiles;
            };


            // LinkAverageTravelSpeedMeter
            xmlDoc.querySelectorAll('LinkAverageTravelSpeedMeter').forEach(meterEl => {
                const id = meterEl.querySelector('id').textContent;
                const name = meterEl.querySelector('name').textContent;
                const linkId = meterEl.querySelector('linkId').textContent;
                const position = parseFloat(meterEl.querySelector('position').textContent);

                const obsFlowEl = meterEl.querySelector('observedFlow');
                const isSrcEl = meterEl.querySelector('isSource');

                const spawnProfiles = parseSpawnProfiles(meterEl);

                const link = links[linkId];
                if (!link) return;
                const numLanes = Object.keys(link.lanes).length;
                let refPath = [];
                const laneEntries = Object.values(link.lanes).sort((a, b) => a.index - b.index);
                if (laneEntries.length > 0) { refPath = laneEntries[0].path; }

                const posData = getPointAtDistanceAlongPath(refPath, position);
                if (posData) {
                    const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5;
                    const meterPosition = Geom.Vec.add(posData.point, Geom.Vec.scale(posData.normal, roadCenterlineOffset));

                    speedMeters.push({
                        id, name, linkId, position, numLanes,
                        x: meterPosition.x, y: meterPosition.y, angle: posData.angle,
                        observedFlow: obsFlowEl ? parseFloat(obsFlowEl.textContent) : 0,
                        isSource: isSrcEl ? (isSrcEl.textContent === 'true') : false,
                        spawnProfiles: spawnProfiles
                    });
                }
            });

            // SectionAverageTravelSpeedMeter
            xmlDoc.querySelectorAll('SectionAverageTravelSpeedMeter').forEach(meterEl => {
                const id = meterEl.querySelector('id').textContent;
                const name = meterEl.querySelector('name').textContent;
                const linkId = meterEl.querySelector('linkId').textContent;
                const endPosition = parseFloat(meterEl.querySelector('position').textContent);
                const length = parseFloat(meterEl.querySelector('sectionLength').textContent);
                const startPosition = endPosition - length;

                const obsFlowEl = meterEl.querySelector('observedFlow');
                const isSrcEl = meterEl.querySelector('isSource');

                const spawnProfiles = parseSpawnProfiles(meterEl);

                const link = links[linkId];
                if (!link) return;
                let refPath = [];
                const laneEntries = Object.values(link.lanes).sort((a, b) => a.index - b.index);
                if (laneEntries.length > 0) { refPath = laneEntries[0].path; }

                const startPosData = getPointAtDistanceAlongPath(refPath, startPosition);
                const endPosData = getPointAtDistanceAlongPath(refPath, endPosition);

                if (startPosData && endPosData) {
                    const numLanes = Object.keys(link.lanes).length;
                    const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5;
                    const startMarkerPos = Geom.Vec.add(startPosData.point, Geom.Vec.scale(startPosData.normal, roadCenterlineOffset));
                    const endMarkerPos = Geom.Vec.add(endPosData.point, Geom.Vec.scale(endPosData.normal, roadCenterlineOffset));

                    sectionMeters.push({
                        id, name, linkId, length, startPosition, endPosition,
                        startX: startMarkerPos.x, startY: startMarkerPos.y, startAngle: startPosData.angle,
                        endX: endMarkerPos.x, endY: endMarkerPos.y, endAngle: endPosData.angle,
                        observedFlow: obsFlowEl ? parseFloat(obsFlowEl.textContent) : 0,
                        isSource: isSrcEl ? (isSrcEl.textContent === 'true') : false,
                        spawnProfiles: spawnProfiles
                    });
                }
            });

            // 解析 RoadMarkings
            const roadMarkings = [];
            const markingNodes = xmlDoc.querySelectorAll('RoadMarkings > RoadMarking');
            if (markingNodes.length > 0) {
                markingNodes.forEach(mkEl => {
                    const id = mkEl.querySelector('id').textContent;
                    const type = mkEl.querySelector('type').textContent;
                    const linkId = mkEl.querySelector('linkId')?.textContent;
                    const nodeId = mkEl.querySelector('nodeId')?.textContent;

                    const mk = {
                        id, type, linkId, nodeId,
                        position: parseFloat(mkEl.querySelector('position')?.textContent || 0),
                        length: parseFloat(mkEl.querySelector('length')?.textContent || 0),
                        width: parseFloat(mkEl.querySelector('width')?.textContent || 0),
                        x: parseFloat(mkEl.querySelector('x')?.textContent || 0),
                        y: -parseFloat(mkEl.querySelector('y')?.textContent || 0), // Y軸反轉適配
                        rotation: parseFloat(mkEl.querySelector('rotation')?.textContent || 0),
                        laneIndices: [],
                        isFree: mkEl.querySelector('isFree')?.textContent === 'true'
                    };

                    const laneIndicesStr = mkEl.querySelector('laneIndices')?.textContent;
                    if (laneIndicesStr) {
                        mk.laneIndices = laneIndicesStr.split(',').map(Number);
                    }

                    roadMarkings.push(mk);
                });
            }

            // --- 8. 解析背景圖片 ---
            xmlDoc.querySelectorAll('Background > Tile').forEach(tileEl => {
                const rect = tileEl.querySelector('Rectangle');
                const start = rect.querySelector('Start');
                const end = rect.querySelector('End');
                const imageEl = tileEl.querySelector('Image');
                const p1x = parseFloat(start.querySelector('x').textContent);
                const p1y = -parseFloat(start.querySelector('y').textContent);
                const p2x = parseFloat(end.querySelector('x').textContent);
                const p2y = -parseFloat(end.querySelector('y').textContent);
                const x = Math.min(p1x, p2x);
                const y = Math.min(p1y, p2y);
                const width = Math.abs(p2x - p1x);
                const height = Math.abs(p2y - p1y);
                const saturationEl = tileEl.querySelector('saturation');
                const opacity = saturationEl ? parseFloat(saturationEl.textContent) / 100 : 1.0;
                const type = imageEl.querySelector('type').textContent.toUpperCase();
                const mimeType = imageTypeMap[type] || 'png';
                const base64Data = imageEl.querySelector('binaryData').textContent.replace(/\s/g, '');
                const img = new Image();
                const p = new Promise((imgResolve, imgReject) => { img.onload = () => imgResolve(img); img.onerror = () => imgReject(); });
                imagePromises.push(p);
                img.src = `data:image/${mimeType};base64,${base64Data}`;
                backgroundTiles.push({ image: img, x, y, width, height, opacity });
            });

            // --- 9. 解析停車場 ---
            const parkingLots = [];
            xmlDoc.querySelectorAll('ParkingLots > ParkingLot').forEach(lotEl => {
                const id = lotEl.querySelector('id')?.textContent || `parking_${parkingLots.length}`;
                const name = lotEl.querySelector('name')?.textContent || '';

                const getTagVal = (tag) => {
                    const el = lotEl.querySelector(tag) || lotEl.querySelector('tm:' + tag);
                    return el ? el.textContent : null;
                };

                const attrProbStr = getTagVal('attractionProb');
                const stayDurStr = getTagVal('stayDuration');

                const attractionProb = attrProbStr ? parseFloat(attrProbStr) : 0;
                const stayDuration = stayDurStr ? parseFloat(stayDurStr) : 0;

                const boundary = [];
                lotEl.querySelectorAll('Boundary > Point').forEach(p => {
                    boundary.push({
                        x: parseFloat(p.querySelector('x').textContent),
                        y: -parseFloat(p.querySelector('y').textContent)
                    });
                });

                const gates = [];
                lotEl.querySelectorAll('ParkingGates > ParkingGate').forEach(gateEl => {
                    const gId = gateEl.querySelector('id')?.textContent;
                    const gType = gateEl.querySelector('gateType')?.textContent || 'bidirectional';

                    const geoEl = gateEl.querySelector('Geometry');
                    if (geoEl) {
                        const gx_tl = parseFloat(geoEl.querySelector('x').textContent);
                        const gy_tl = -parseFloat(geoEl.querySelector('y').textContent);
                        const gw = parseFloat(geoEl.querySelector('width').textContent);
                        const gh = parseFloat(geoEl.querySelector('height').textContent);
                        let rawRotation = parseFloat(geoEl.querySelector('rotation').textContent);

                        const gr = rawRotation * (Math.PI / 180.0);

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

                gates.forEach(gate => {
                    let minDst = Infinity;
                    let bestPoint = null;
                    let bestLinkId = null;
                    let bestS = null;

                    Object.values(links).forEach(link => {
                        const lanes = Object.values(link.lanes);
                        if (lanes.length === 0) return;

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

                    if (minDst <= 30 && bestPoint && typeof bestS === 'number') {
                        gate.connector = {
                            x1: gate.x, y1: gate.y,
                            x2: bestPoint.x, y2: bestPoint.y,
                            linkId: bestLinkId,
                            distance: bestS,
                            offset: minDst
                        };
                    }
                });

                const carCapacity = parseInt(lotEl.querySelector('carCapacity')?.textContent || '0', 10);
                const motoCapacity = parseInt(lotEl.querySelector('motoCapacity')?.textContent || '0', 10);

                const slots = [];
                if (carCapacity > 0 && boundary.length >= 3) {
                    const SLOT_WIDTH = 2.5;
                    const SLOT_LENGTH = 5.5;
                    const SLOT_GAP = 0.1;

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

                    function isSlotInsidePoly(sx, sy, sw, sh, poly) {
                        const corners = [
                            { x: sx, y: sy },
                            { x: sx + sw, y: sy },
                            { x: sx + sw, y: sy + sh },
                            { x: sx, y: sy + sh }
                        ];
                        return corners.every(c => Geom.Utils.isPointInPolygon(c, poly));
                    }

                    for (let row = 0; slots.length < carCapacity; row++) {
                        const sy = minY + SLOT_GAP + row * (slotH + SLOT_GAP);
                        if (sy + slotH > maxY) break;
                        for (let col = 0; slots.length < carCapacity; col++) {
                            const sx = minX + SLOT_GAP + col * (slotW + SLOT_GAP);
                            if (sx + slotW > maxX) break;
                            if (isSlotInsidePoly(sx, sy, slotW, slotH, boundary)) {
                                const cx = sx + slotW / 2;
                                const cy = sy + slotH / 2;
                                const angle = isHorizontal ? Math.PI / 2 : 0;
                                slots.push({
                                    x: cx, y: cy, width: slotW, height: slotH,
                                    angle: angle, occupied: false, vehicleId: null
                                });
                            }
                        }
                    }
                }
                parkingLots.push({
                    id, name, boundary, gates,
                    carCapacity, motoCapacity, slots,
                    attractionProb, stayDuration
                });
            });

            Promise.all(imagePromises).then(() => {
                resolve({
                    links,
                    nodes,
                    spawners,
                    trafficLights,
                    staticVehicles,
                    speedMeters,
                    sectionMeters,
                    parkingLots,
                    roadMarkings, // <--- 加入這行
                    bounds: { minX, minY, maxX, maxY },
                    pathfinder: new Pathfinder(links, nodes),
                    backgroundTiles,
                    navigationMode,
                    vehicleProfiles
                });
            }).catch(() => reject(new Error(translations[currentLang].imageLoadError)));
        });
    }

    // ===================================================================
    // [新增] 場景編輯器 XML 載入邏輯
    // ===================================================================

    function handleSceneFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(e.target.result, "application/xml");

            if (xmlDoc.getElementsByTagName("parsererror").length) {
                alert("場景 XML 解析錯誤：格式不正確");
                return;
            }

            // 呼叫載入主函式
            loadCustomSceneObjects(xmlDoc);

            // UX 優化：載入後自動切換到 3D 模式，讓使用者立刻看到結果
            const display3DBtn = document.getElementById('display3DBtn');
            if (display3DBtn && !isDisplay3D) {
                display3DBtn.click();
            }
        };
        reader.readAsText(file);
    }

    function loadCustomSceneObjects(xmlDoc) {
        // 確保 customModelsGroup 已定義
        if (typeof customModelsGroup === 'undefined') {
            console.error("錯誤：customModelsGroup 未定義，請確認 init3D() 中已加入 scene.add(customModelsGroup);");
            return;
        }

        // 清空舊模型
        customModelsGroup.clear();

        const loader = new THREE.GLTFLoader();
        const objects = xmlDoc.querySelectorAll('StaticModel');

        console.log(`正在處理 ${objects.length} 個自定義場景物件...`);

        // 輔助函式：忽略 XML 命名空間尋找子節點
        const findChild = (parent, tagName) => {
            for (let i = 0; i < parent.children.length; i++) {
                const node = parent.children[i];
                const name = node.localName || node.nodeName.split(':').pop();
                if (name === tagName) return node;
            }
            return null;
        };

        const promises = [];

        objects.forEach((modelEl, index) => {
            const binaryDataEl = findChild(modelEl, 'BinaryData');
            const pathEl = findChild(modelEl, 'Path');
            const posEl = findChild(modelEl, 'Position');
            const rotEl = findChild(modelEl, 'Rotation');
            const sclEl = findChild(modelEl, 'Scale');

            if (!posEl || !rotEl || !sclEl) {
                console.warn(`跳過第 ${index} 個模型：變換參數缺失`);
                return;
            }

            const xmlX = parseFloat(posEl.getAttribute('x'));
            const xmlY = parseFloat(posEl.getAttribute('y'));
            const xmlZ = parseFloat(posEl.getAttribute('z'));

            const targetPos = new THREE.Vector3(xmlX, xmlZ, -xmlY);
            const targetRot = new THREE.Euler(
                parseFloat(rotEl.getAttribute('x')),
                parseFloat(rotEl.getAttribute('y')),
                parseFloat(rotEl.getAttribute('z'))
            );
            const targetScale = new THREE.Vector3(
                parseFloat(sclEl.getAttribute('x')),
                parseFloat(sclEl.getAttribute('y')),
                parseFloat(sclEl.getAttribute('z'))
            );

            // 建立 Promise 處理非同步載入
            const p = new Promise((resolve) => {
                const onLoad = (gltf) => {
                    const mesh = gltf.scene;
                    mesh.position.copy(targetPos);
                    mesh.rotation.copy(targetRot);
                    mesh.scale.copy(targetScale);
                    mesh.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    // 更新世界矩陣，確保 BoundingBox 計算正確
                    mesh.updateMatrixWorld(true);

                    customModelsGroup.add(mesh);
                    resolve(); // 載入完成
                };

                const onError = (err) => {
                    console.warn("模型載入失敗:", err);
                    resolve(); // 即使失敗也 resolve，讓流程繼續
                };

                if (binaryDataEl && binaryDataEl.textContent.trim().length > 20) {
                    try {
                        loader.load(binaryDataEl.textContent, onLoad, undefined, onError);
                    } catch (e) {
                        console.error("Base64 解析失敗", e);
                        resolve();
                    }
                } else if (pathEl && pathEl.textContent.trim() !== "") {
                    loader.load(pathEl.textContent, onLoad, undefined, onError);
                } else {
                    resolve();
                }
            });

            promises.push(p);
        });

        // ★★★ 關鍵：等待所有模型載入後，重新生成城市 ★★★
        Promise.all(promises).then(() => {
            console.log("所有場景物件載入完成，正在重新生成城市以避開障礙...");

            // 讀取當前的 Seed
            const citySeedInput = document.getElementById('citySeedInput');
            const seed = parseInt(citySeedInput.value, 10) || 12345;

            // 確保路網數據存在
            if (networkData) {
                generateCity(networkData, seed);
            }
        });
    }
});