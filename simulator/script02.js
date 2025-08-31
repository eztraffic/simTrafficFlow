// --- START OF FILE script02.js (MODIFIED FOR I18N - FULL VERSION) ---

document.addEventListener('DOMContentLoaded', () => {
    // --- START: I18N (Internationalization) Setup ---
    const translations = {
        'zh-Hant': {
            appTitle: 'Traffic Flow simulation (路網微觀交通模擬)',
            selectFileLabel: '選擇路網檔案：',
            btnLoadFirst: '請先載入檔案',
            btnStart: '開始模擬',
            btnPause: '暫停模擬',
            btnResume: '繼續模擬',
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
            imageLoadError: '無法載入底圖'
        },
        'en': {
            appTitle: 'simTrafficFlow',
            selectFileLabel: 'Select Network File:',
            btnLoadFirst: 'Please Load a File',
            btnStart: 'Start Simulation',
            btnPause: 'Pause Simulation',
            btnResume: 'Resume Simulation',
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
            imageLoadError: 'Could not load background image'
        }
    };

    let currentLang = 'zh-Hant'; // Default language

    function setLanguage(lang) {
        currentLang = lang;
        const dict = translations[lang];

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                el.textContent = dict[key];
            }
        });

        // Update document title
        document.title = dict.appTitle;

        // Update dynamic elements like buttons and charts
        updateButtonText();

        // Re-initialize charts to update titles and labels
        // This will also clear the chart data, which will be repopulated
        initializeCharts();
        if (networkData) { // If data is loaded, re-setup the specific charts
            setupMeterCharts(networkData.speedMeters);
            setupSectionMeterCharts(networkData.sectionMeters);
            // Repopulate main charts from existing historical data
            statsData.forEach(data => updateStatsUI(data, true));
        }

        // Redraw canvas for placeholder text update
        redraw();
    }

    function updateButtonText() {
        const dict = translations[currentLang];
        if (!simulation) {
            startStopButton.textContent = dict.btnLoadFirst;
        } else if (isRunning) {
            startStopButton.textContent = dict.btnPause;
        } else {
            // Check if simulation has started at all
            if (simulation.time > 0) {
                startStopButton.textContent = dict.btnResume;
            } else {
                startStopButton.textContent = dict.btnStart;
            }
        }
    }
    // --- END: I18N Setup ---

    // --- DOM 元素獲取 ---
    const langSelector = document.getElementById('langSelector');
    const fileInput = document.getElementById('xmlFileInput');
    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('networkCanvas');
    const ctx = canvas.getContext('2d');
    const startStopButton = document.getElementById('startStopButton');
    const speedSlider = document.getElementById('speedSlider');
    const speedValueSpan = document.getElementById('speedValue');
    const simTimeSpan = document.getElementById('simulationTime');
    const showPathsToggle = document.getElementById('showPathsToggle');
    const showPointMetersToggle = document.getElementById('showPointMetersToggle');
    const showSectionMetersToggle = document.getElementById('showSectionMetersToggle');
    const statsTableBody = document.getElementById('statsTableBody');
    const vehicleCountChartCanvas = document.getElementById('vehicleCountChart').getContext('2d');
    const avgSpeedChartCanvas = document.getElementById('avgSpeedChart').getContext('2d');
    const meterChartsContainer = document.getElementById('meter-charts-container');
    const sectionMeterChartsContainer = document.getElementById('section-meter-charts-container');


    // --- 全域狀態變數 ---
    let simulation = null; let networkData = null; let isRunning = false;
    let lastTimestamp = 0; let animationFrameId = null;
    let simulationSpeed = parseInt(speedSlider.value, 10);
    let showTurnPaths = false;
    let showPointMeters = true;
    let showSectionMeters = true;

    // --- 視圖控制變數 ---
    let scale = 1.0; let panX = 0; let panY = 0;
    let isPanning = false; let panStart = { x: 0, y: 0 };

    // --- 統計相關變數 ---
    let statsData = [];
    let lastLoggedIntegerTime = -1;
    let vehicleCountChart = null;
    let avgSpeedChart = null;
    let maxVehicleCount = 0;
    let maxAvgSpeed = 0;
    let meterCharts = {};
    let sectionMeterCharts = {};

    const LANE_COLORS = [
        'rgb(255, 99, 132)', // Red
        'rgb(54, 162, 235)', // Blue
        'rgb(255, 206, 86)', // Yellow
        'rgb(75, 192, 192)', // Teal
        'rgb(153, 102, 255)',// Purple
        'rgb(255, 159, 64)'  // Orange
    ];


    // --- 事件監聽器設定 ---
    langSelector.addEventListener('change', (e) => setLanguage(e.target.value));
    fileInput.addEventListener('change', handleFileSelect);
    startStopButton.addEventListener('click', toggleSimulation);
    speedSlider.addEventListener('input', (e) => {
        simulationSpeed = parseInt(e.target.value, 10);
        speedValueSpan.textContent = `${simulationSpeed}x`;
    });
    showPathsToggle.addEventListener('change', (e) => {
        showTurnPaths = e.target.checked;
        if (!isRunning) redraw();
    });
    showPointMetersToggle.addEventListener('change', (e) => {
        showPointMeters = e.target.checked;
        if (!isRunning) redraw();
    });
    showSectionMetersToggle.addEventListener('change', (e) => {
        showSectionMeters = e.target.checked;
        if (!isRunning) redraw();
    });
    canvas.addEventListener('wheel', handleZoom);
    canvas.addEventListener('mousedown', handlePanStart);
    canvas.addEventListener('mousemove', handlePanMove);
    canvas.addEventListener('mouseup', handlePanEnd);
    canvas.addEventListener('mouseleave', handlePanEnd);
    window.addEventListener('resize', resizeCanvas);

    // --- 初始化 ---
    resizeCanvas();
    setLanguage(currentLang); // Set initial language and charts
    startStopButton.disabled = true;

    // ===================================================================
    // 幾何計算輔助工具 (無變更)
    // ===================================================================
    const Geom = {
        Vec: { add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }), sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }), scale: (v, s) => ({ x: v.x * s, y: v.y * s }), dist: (v1, v2) => Math.hypot(v1.x - v2.x, v1.y - v2.y), len: (v) => Math.hypot(v.x, v.y), normalize: (v) => { const l = Geom.Vec.len(v); return l > 0 ? Geom.Vec.scale(v, 1 / l) : { x: 0, y: 0 }; }, normal: (v) => ({ x: -v.y, y: v.x }), angle: (v) => Math.atan2(v.y, v.x), },
        Bezier: { getPoint(t, p0, p1, p2, p3) { const cX = 3 * (p1.x - p0.x); const bX = 3 * (p2.x - p1.x) - cX; const aX = p3.x - p0.x - cX - bX; const cY = 3 * (p1.y - p0.y); const bY = 3 * (p2.y - p1.y) - cY; const aY = p3.y - p0.y - cY - bY; const x = aX * t ** 3 + bX * t ** 2 + cX * t + p0.x; const y = aY * t ** 3 + bY * t ** 2 + cY * t + p0.y; return { x, y }; }, getTangent(t, p0, p1, p2, p3) { const q0 = Geom.Vec.sub(p1, p0); const q1 = Geom.Vec.sub(p2, p1); const q2 = Geom.Vec.sub(p3, p2); const a = Geom.Vec.scale(q0, 3 * (1 - t) ** 2); const b = Geom.Vec.scale(q1, 6 * (1 - t) * t); const c = Geom.Vec.scale(q2, 3 * t ** 2); return Geom.Vec.add(a, Geom.Vec.add(b, c)); }, getLength(p0, p1, p2, p3, steps = 20) { let length = 0; let lastPoint = p0; for (let i = 1; i <= steps; i++) { const t = i / steps; const point = this.getPoint(t, p0, p1, p2, p3); length += Geom.Vec.dist(lastPoint, point); lastPoint = point; } return length; } }
    };

    // ===================================================================
    // Simulation 類別 (無變更)
    // ===================================================================
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
            this.speedMeters = network.speedMeters.map(m => ({
                ...m,
                readings: {},
                maxAvgSpeed: 0
            }));
            this.sectionMeters = network.sectionMeters.map(m => ({
                ...m,
                completedVehicles: [],
                maxAvgSpeed: 0,
                lastAvgSpeed: null
            }));
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
        drawTurnPaths(ctx) { ctx.save(); ctx.lineWidth = 2 / scale; for (const nodeId in this.network.nodes) { const node = this.network.nodes[nodeId]; const tfl = this.trafficLights.find(t => t.nodeId === nodeId); for (const transition of node.transitions) { if (transition.bezier && transition.bezier.points) { let signal = 'Green'; if (tfl && transition.turnGroupId) { signal = tfl.getSignalForTurnGroup(transition.turnGroupId); } switch (signal) { case 'Red': ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)'; break; case 'Yellow': ctx.strokeStyle = 'rgba(255, 193, 7, 0.9)'; break; case 'Green': default: ctx.strokeStyle = 'rgba(76, 175, 80, 0.7)'; break; } const [p0, p1, p2, p3] = transition.bezier.points; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y); ctx.stroke(); } } } ctx.restore(); }		
		draw(ctx) {
            // 1. 正常繪製路網、路上的車輛、以及在路口內的車輛。
            //    此時，所有車輛會根據其所在路段的繪製順序 (處理天橋等情況) 被畫好。
            //    但這個階段，部分車輛可能會被之後繪製的燈號線覆蓋。
            drawNetwork(this.network, this.network.links, this.vehicles);

            // 2. 繪製燈號轉向路徑 (紅/黃/綠線)。
            //    這會覆蓋在步驟 1 中已繪製的圖層之上。
            if (showTurnPaths) {
                this.drawTurnPaths(ctx);
            }

            // 3. 繪製其他交通號誌視覺效果 (若有)。
            this.trafficLights.forEach(tfl => tfl.draw(ctx, this.network));

            // 4. 【關鍵修正】為了讓車輛不被燈號線覆蓋，我們再次繪製所有「物理上在路口內」的車輛。
            //    這包括中心點在路口內的車輛，以及車身部分進入或尚未完全離開路口的車輛。
            //    這次重繪會將它們呈現在燈號線等所有先前圖層的上方。
            const vehiclesToRedraw = this.vehicles.filter(v => {
                // 情況 A：車輛的中心點在路口內 (state 為 'inIntersection')。
                if (v.state === 'inIntersection') {
                    return true;
                }

                // 情況 B：車輛的中心點在路段上 (state 為 'onLink')，但車身與路口重疊。
                // 檢查車頭是否已伸入下一個路口。
                const isEntering = v.distanceOnPath + v.length / 2 > v.currentPathLength;
                
                // 檢查車尾是否還留在上一個路口。
                // (剛切換到新路段時，distanceOnPath 很小)
                const isExiting = v.distanceOnPath - v.length / 2 < 0;

                return isEntering || isExiting;
            });

            vehiclesToRedraw.forEach(v => v.draw(ctx));
        }
	}

    // ===================================================================
    // Pathfinder, TFL, Spawner 類別 (無變更)
    // ===================================================================
    class Pathfinder { constructor(links, nodes) { this.adj = new Map(); for (const linkId in links) { const link = links[linkId]; if (!this.adj.has(link.source)) this.adj.set(link.source, []); this.adj.get(link.source).push({ linkId: link.id, toNode: link.destination }); } } findRoute(startNodeId, endNodeId) { if (!startNodeId || !endNodeId) return null; const q = [[startNodeId, []]]; const visited = new Set([startNodeId]); while (q.length > 0) { const [currentNodeId, path] = q.shift(); if (currentNodeId === endNodeId) return path; const neighbors = this.adj.get(currentNodeId) || []; for (const neighbor of neighbors) { if (!visited.has(neighbor.toNode)) { visited.add(neighbor.toNode); const newPath = [...path, neighbor.linkId]; q.push([neighbor.toNode, newPath]); } } } return null; } }
    class TrafficLightController { constructor(config) { this.nodeId = config.nodeId; this.schedule = config.schedule; this.lights = config.lights; this.timeShift = config.timeShift || 0; this.cycleDuration = this.schedule.reduce((sum, p) => sum + p.duration, 0); this.turnGroupStates = {}; } update(time) { if (this.cycleDuration <= 0) return; const effectiveTime = time - this.timeShift; let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration; for (const period of this.schedule) { if (timeInCycle < period.duration) { for (const [turnGroupId, signal] of Object.entries(period.signals)) { this.turnGroupStates[turnGroupId] = signal; } return; } timeInCycle -= period.duration; } } getSignalForTurnGroup(turnGroupId) { return this.turnGroupStates[turnGroupId] || 'Green'; } draw(ctx, network) { } }
    class Spawner {
        constructor(config, pathfinder) { this.originNodeId = config.originNodeId; this.periods = config.periods || []; this.pathfinder = pathfinder; this.currentPeriodIndex = -1; this.timeInPeriod = 0; this.active = false; this.spawnInterval = Infinity; this.spawnTimer = 0; this.currentConfig = null; this._switchToNextPeriod(); }
        _switchToNextPeriod() { this.currentPeriodIndex++; if (this.currentPeriodIndex >= this.periods.length) { this.active = false; this.currentConfig = null; return; } this.active = true; this.timeInPeriod = 0; this.currentConfig = this.periods[this.currentPeriodIndex]; this.spawnInterval = this.currentConfig.numVehicles > 0 ? this.currentConfig.duration / this.currentConfig.numVehicles : Infinity; this.spawnTimer = this.spawnInterval; }
        update(dt, network, vehicleId) { if (!this.active) return null; this.timeInPeriod += dt; if (this.timeInPeriod > this.currentConfig.duration) { this._switchToNextPeriod(); if (!this.active) return null; return null; } this.spawnTimer += dt; if (this.spawnTimer >= this.spawnInterval) { this.spawnTimer -= this.spawnInterval; const destination = this.chooseWithWeight(this.currentConfig.destinations); const profile = this.chooseWithWeight(this.currentConfig.vehicleProfiles); if (!destination || !profile) return null; const route = this.pathfinder.findRoute(this.originNodeId, destination.destinationNodeId); if (!route || route.length === 0) return null; const startLinkId = route[0]; const startLink = network.links[startLinkId]; let startLaneIndex = 0; if (startLink) { const numLanes = Object.keys(startLink.lanes).length; if (numLanes > 0) { startLaneIndex = Math.floor(Math.random() * numLanes); } } return new Vehicle(vehicleId, profile, route, network, startLaneIndex); } return null; }
        chooseWithWeight(items) { if (!items || items.length === 0) return null; const totalWeight = items.reduce((sum, item) => sum + item.weight, 0); if (totalWeight <= 0) return items[0]; let random = Math.random() * totalWeight; for (const item of items) { random -= item.weight; if (random <= 0) return item; } return items[items.length - 1]; }
    }

    // ===================================================================
    // Vehicle 類別 (無變更)
    // ===================================================================
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
            this.initializePosition(network);
        }
        initializePosition(network) { const link = network.links[this.currentLinkId]; if (!link) { this.finished = true; return; } this.nextSignIndex = 0; const lane = link.lanes[this.currentLaneIndex]; if (!lane || lane.path.length === 0) { this.finished = true; return; } this.currentPath = lane.path; this.currentPathLength = lane.length; this.updateDrawingPosition(network); }
        checkRoadSigns(network) { const link = network.links[this.currentLinkId]; if (!link.roadSigns || this.nextSignIndex >= link.roadSigns.length) { return; } while (this.nextSignIndex < link.roadSigns.length && this.distanceOnPath >= link.roadSigns[this.nextSignIndex].position) { const sign = link.roadSigns[this.nextSignIndex]; if (sign.type === 'limit') { this.maxSpeed = sign.limit; } else if (sign.type === 'no_limit') { this.maxSpeed = this.originalMaxSpeed; } this.nextSignIndex++; } }
        update(dt, allVehicles, simulation) {
            if (this.finished) return;
            const network = simulation.network;
            const oldDistanceOnPath = this.distanceOnPath;
            if(this.laneChangeCooldown > 0) {
                this.laneChangeCooldown -= dt;
            }
            if (this.state === 'onLink') {
                this.manageLaneChangeProcess(dt, network, allVehicles);
            }
            if (this.state === 'onLink') { this.checkRoadSigns(network); }
            const { leader, gap } = this.findLeader(allVehicles, network);
            const s_star = this.minGap + Math.max(0, this.speed * this.headwayTime + (this.speed * (this.speed - (leader ? leader.speed : 0))) / (2 * Math.sqrt(this.maxAccel * this.comfortDecel)));
            this.accel = this.maxAccel * (1 - Math.pow(this.speed / this.maxSpeed, this.delta) - Math.pow(s_star / gap, 2));
            this.speed += this.accel * dt;
            if (this.speed < 0) this.speed = 0;
            const isStuckAtEnd = gap <= 0.1 && (this.currentPathLength - this.distanceOnPath) <= 0.1;
            if (isStuckAtEnd) {
                 this.distanceOnPath = this.currentPathLength;
                 this.speed = 0;
            } else {
                 this.distanceOnPath += this.speed * dt;
            }
            if (this.state === 'onLink') {
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
            if (this.distanceOnPath > this.currentPathLength) {
                const leftoverDistance = this.distanceOnPath - this.currentPathLength;
                this.handlePathTransition(leftoverDistance, network);
            }
            if (!this.finished) this.updateDrawingPosition(network);
        }
        manageLaneChangeProcess(dt, network, allVehicles) {
            if (this.laneChangeState) {
                this.laneChangeState.progress += dt / this.laneChangeState.duration;
                if (this.laneChangeState.progress >= 1) {
                    this.currentLaneIndex = this.laneChangeState.toLaneIndex;
                    this.laneChangeState = null;
                    this.laneChangeCooldown = 5.0;
                }
            }
            if (!this.laneChangeGoal) {
                 this.handleMandatoryLaneChangeDecision(network, allVehicles);
            }
            if (!this.laneChangeGoal && this.laneChangeCooldown <= 0) {
                this.handleDiscretionaryLaneChangeDecision(network, allVehicles);
            }
            if (this.laneChangeGoal !== null && !this.laneChangeState) {
                if (this.currentLaneIndex === this.laneChangeGoal) {
                    this.laneChangeGoal = null;
                } else {
                    const direction = Math.sign(this.laneChangeGoal - this.currentLaneIndex);
                    const nextLaneIndex = this.currentLaneIndex + direction;
                    const safeToChange = this.isSafeToChange(nextLaneIndex, allVehicles);
                    if (safeToChange) {
                        this.laneChangeState = {
                            progress: 0,
                            fromLaneIndex: this.currentLaneIndex,
                            toLaneIndex: nextLaneIndex,
                            duration: 1.5,
                        };
                    }
                }
            }
        }
        handlePathTransition(leftoverDistance, network) {
            this.laneChangeState = null;
            this.laneChangeGoal = null;
            this.laneChangeCooldown = 0;
            if (this.state === 'onLink') {
                const nextLinkIndex = this.currentLinkIndex + 1;
                if (nextLinkIndex >= this.route.length) { this.finished = true; return; }
                const currentLink = network.links[this.currentLinkId];
                const nextLinkId = this.route[nextLinkIndex];
                const destNode = network.nodes[currentLink.destination];
                const transition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === this.currentLaneIndex && t.destLinkId === nextLinkId);
                this.currentTransition = transition;
                if (transition && transition.bezier) {
                    this.state = 'inIntersection';
                    this.currentPath = transition.bezier.points;
                    this.currentPathLength = transition.bezier.length;
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
            const distanceToEndOfCurrentPath = this.currentPathLength - this.distanceOnPath;
            for (const other of allVehicles) {
                if (other.id === this.id) continue;
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
                    const finalLane = this.laneChangeGoal !== null ? this.laneChangeGoal : this.currentLaneIndex;
                    const myTransition = network.nodes[network.links[this.currentLinkId].destination]?.transitions.find(t =>
                        t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === finalLane && t.destLinkId === this.route[nextLinkIdx]
                    );
                    if (myTransition) {
                        const transitionLength = myTransition.bezier?.length || 0;
                        const targetDestLinkId = myTransition.destLinkId;
                        const targetDestLaneIndex = myTransition.destLaneIndex;
                        for (const other of allVehicles) {
                            if (other.id === this.id) continue;
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
                        const finalLaneForTransition = this.laneChangeGoal !== null ? this.laneChangeGoal : this.currentLaneIndex;
                        const transition = destNode.transitions.find(t =>
                            t.sourceLinkId === this.currentLinkId &&
                            t.sourceLaneIndex === finalLaneForTransition &&
                            t.destLinkId === this.route[nextLinkIndex]
                        );
                        let isBlocked = false;
                        if (!transition) {
                            isBlocked = true;
                        } else {
                            const tfl = network.trafficLights.find(t => t.nodeId === destNodeId);
                            if (tfl) {
                                const signal = tfl.getSignalForTurnGroup(transition.turnGroupId);
                                if (signal === 'Red') {
                                    isBlocked = true;
                                }
                                else if (signal === 'Yellow') {
                                    const requiredBrakingDistance = (this.speed * this.speed) / (2 * this.comfortDecel);
                                    if (distanceToEndOfCurrentPath > requiredBrakingDistance) {
                                        isBlocked = true;
                                    }
                                }
                            }
                            if (!isBlocked) {
                                 for (const other of allVehicles) {
                                    if (other.id === this.id || other.state !== 'onLink' || other.currentLinkId !== this.currentLinkId) continue;
                                    const otherNextIdx = other.currentLinkIndex + 1;
                                    if (otherNextIdx >= other.route.length) continue;
                                    const otherFinalLane = other.laneChangeGoal !== null ? other.laneChangeGoal : other.currentLaneIndex;
                                    const otherTransition = destNode.transitions.find(t => t.sourceLinkId === other.currentLinkId && t.sourceLaneIndex === otherFinalLane && t.destLinkId === other.route[otherNextIdx]);
                                    if (otherTransition && otherTransition.destLinkId === transition.destLinkId && otherTransition.destLaneIndex === transition.destLaneIndex) {
                                        if ((other.currentPathLength - other.distanceOnPath) < (this.currentPathLength - this.distanceOnPath)) {
                                            isBlocked = true;
                                            break;
                                        }
                                    }
                                 }
                            }
                        }
                        if (isBlocked && distanceToEndOfCurrentPath < gap) {
                            leader = null;
                            gap = distanceToEndOfCurrentPath;
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
            const distanceToEnd = lane.length - this.distanceOnPath;
            if (distanceToEnd > 150) return;
            const nextLinkId = this.route[this.currentLinkIndex + 1];
            if (!nextLinkId) return;
            const destNode = network.nodes[link.destination];
            const canPass = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === this.currentLaneIndex && t.destLinkId === nextLinkId);
            if (canPass) return;
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
            const link = network.links[this.currentLinkId];
            const nextLinkId = this.route[this.currentLinkIndex + 1];
            if (!nextLinkId) return;
            const destNode = network.nodes[link.destination];
            const { leader: currentLeader } = this.getLaneLeader(this.currentLaneIndex, allVehicles);
            const adjacentLanes = [this.currentLaneIndex - 1, this.currentLaneIndex + 1];
            for (const targetLane of adjacentLanes) {
                if (!link.lanes[targetLane]) continue;
                const canPassOnTargetLane = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === targetLane && t.destLinkId === nextLinkId);
                if (!canPassOnTargetLane) continue;
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
                    if (otherGap < gap) {
                        gap = otherGap;
                        leader = other;
                    }
                }
            }
            return { leader, gap };
        }
        isSafeToChange(targetLane, allVehicles) {
            return !allVehicles.some(v =>
                v.id !== this.id &&
                v.currentLinkId === this.currentLinkId &&
                (v.laneChangeState ? v.laneChangeState.toLaneIndex : v.currentLaneIndex) === targetLane &&
                this.distanceOnPath > v.distanceOnPath && (this.distanceOnPath - v.distanceOnPath) < (v.length + this.minGap)
            );
        }
        getPositionOnPath(path, distance) {
            let distAcc = 0;
            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i];
                const p2 = path[i + 1];
                const segmentLen = Geom.Vec.dist(p1, p2);
                if (distance >= distAcc && distance <= distAcc + segmentLen) {
                    if (segmentLen < 1e-6) {
                        const nextPoint = path[i+2] || p2;
                        const segmentVec = Geom.Vec.sub(nextPoint, p1);
                        return { x: p1.x, y: p1.y, angle: Geom.Vec.angle(segmentVec) };
                    }
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
                if (this.laneChangeState) {
                    const fromLane = link.lanes[this.laneChangeState.fromLaneIndex];
                    const toLane = link.lanes[this.laneChangeState.toLaneIndex];
                    if (!fromLane || !toLane) {
                        this.laneChangeState = null;
                        this.updateDrawingPosition(network);
                        return;
                    }
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
                    if (pos) {
                        this.x = pos.x;
                        this.y = pos.y;
                        this.angle = pos.angle;
                    }
                }
            } else if (this.state === 'inIntersection') {
                const t = this.distanceOnPath / this.currentPathLength;
                const [p0, p1, p2, p3] = this.currentPath;
                const pos = Geom.Bezier.getPoint(t, p0, p1, p2, p3);
                this.x = pos.x;
                this.y = pos.y;
                const tangent = Geom.Bezier.getTangent(t, p0, p1, p2, p3);
                this.angle = Geom.Vec.angle(tangent);
            }
        }
        draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.fillStyle = 'rgba(10, 238, 254, 1.0)'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 0.5 / scale; ctx.beginPath(); ctx.rect(-this.length / 2, -this.width / 2, this.length, this.width); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }

    // --- 檔案處理與模擬啟動 ---
    function handleFileSelect(event) {
        stopSimulation();
        const file = event.target.files[0];
        if (!file) return;

        showPointMetersToggle.checked = true;
        showSectionMetersToggle.checked = true;
        showPointMeters = true;
        showSectionMeters = true;

        resetStatistics();

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
                setupMeterCharts(networkData.speedMeters);
                setupSectionMeterCharts(networkData.sectionMeters);

                autoCenterAndZoom(networkData.bounds);
                startStopButton.disabled = false;
                simTimeSpan.textContent = "0.00";
                updateButtonText();
                redraw();
                updateStatistics(0);
                lastLoggedIntegerTime = 0;
            }).catch(error => {
                console.error("Error parsing model or loading background:", error);
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
            animationFrameId = requestAnimationFrame(simulationLoop);
        } else {
            cancelAnimationFrame(animationFrameId);
        }
        updateButtonText();
    }

    function stopSimulation() {
        isRunning = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        simulation = null;
        networkData = null;
        updateButtonText();
    }

    function simulationLoop(timestamp) {
        if (!isRunning || !simulation) return;
        const realDt = (timestamp - lastTimestamp) / 1000.0;
        lastTimestamp = timestamp;
        const simulationDt = realDt * simulationSpeed;

        simulation.update(simulationDt);
        simTimeSpan.textContent = simulation.time.toFixed(2);

        const currentIntegerTime = Math.floor(simulation.time);
        if (currentIntegerTime > lastLoggedIntegerTime) {
            updateStatistics(currentIntegerTime);
            lastLoggedIntegerTime = currentIntegerTime;
        }

        redraw();
        animationFrameId = requestAnimationFrame(simulationLoop);
    }
    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(scale, scale);
        if (simulation) {
            simulation.draw(ctx);
        } else if (networkData) {
            drawNetwork(networkData, networkData.links);
        } else {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#888';
            ctx.font = "16px sans-serif";
            const currentPan = ctx.getTransform();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillText(translations[currentLang].canvasPlaceholder, canvas.width / 2, canvas.height / 2);
            ctx.setTransform(currentPan);
        }
        ctx.restore();
    }

    // --- 統計相關函數 ---
    function initializeCharts() {
        if (vehicleCountChart) vehicleCountChart.destroy();
        if (avgSpeedChart) avgSpeedChart.destroy();

        const dict = translations[currentLang];
        const chartOptions = (yAxisTitle) => ({
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 200 },
            scales: {
                x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } },
                y: { beginAtZero: true, title: { display: true, text: yAxisTitle }, suggestedMax: 10 }
            },
            plugins: { legend: { display: false } },
            elements: { point: { radius: 1 }, line: { tension: 0.1, borderWidth: 2 } }
        });

        vehicleCountChart = new Chart(vehicleCountChartCanvas, {
            type: 'line',
            data: { labels: [], datasets: [{ label: dict.chartVehicleAxis, data: [], borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.5)' }] },
            options: chartOptions(dict.chartVehicleAxis)
        });

        avgSpeedChart = new Chart(avgSpeedChartCanvas, {
            type: 'line',
            data: { labels: [], datasets: [{ label: dict.chartSpeedAxis, data: [], borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)' }] },
            options: chartOptions(dict.chartSpeedAxis)
        });
    }

    function setupMeterCharts(meters) {
        meterChartsContainer.innerHTML = '';
        meterCharts = {};
        const dict = translations[currentLang];
        const chartOptions = {
            responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
            scales: {
                x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis }, ticks: { autoSkip: true, maxRotation: 45, minRotation: 0, } },
                y: { beginAtZero: true, title: { display: true, text: dict.meterChartSpeedAxis }, suggestedMax: 60 }
            },
            plugins: { legend: { display: true, position: 'top', } },
            elements: { point: { radius: 3 } }
        };
        meters.forEach(meter => {
            const chartDiv = document.createElement('div');
            chartDiv.className = 'chart-container';
            const title = document.createElement('h3');
            title.textContent = `${dict.meterTitle} ${meter.id} (${meter.name})`;
            const canvasEl = document.createElement('canvas');
            canvasEl.id = `meter-chart-${meter.id}`;
            chartDiv.appendChild(title);
            chartDiv.appendChild(canvasEl);
            meterChartsContainer.appendChild(chartDiv);
            const datasets = [{ label: dict.allLanesLabel, data: [], backgroundColor: 'rgba(0, 0, 0, 0.7)', }];
            for (let i = 0; i < meter.numLanes; i++) { datasets.push({ label: `${dict.laneLabel} ${i}`, data: [], backgroundColor: LANE_COLORS[i % LANE_COLORS.length] }); }
            meterCharts[meter.id] = new Chart(canvasEl.getContext('2d'), { type: 'scatter', data: { datasets: datasets }, options: chartOptions });
        });
    }

    function setupSectionMeterCharts(meters) {
        sectionMeterChartsContainer.innerHTML = '';
        sectionMeterCharts = {};
        const dict = translations[currentLang];
        const chartOptions = {
            responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
            scales: {
                x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } },
                y: { beginAtZero: true, title: { display: true, text: dict.sectionChartSpeedAxis }, suggestedMax: 60 }
            },
            plugins: { legend: { display: true, position: 'top', } },
            elements: { point: { radius: 2 }, line: { tension: 0.1, borderWidth: 2 } }
        };

        meters.forEach(meter => {
            const chartDiv = document.createElement('div');
            chartDiv.className = 'chart-container';
            const title = document.createElement('h3');
            title.textContent = `${dict.sectionMeterTitle} ${meter.id} (${meter.name})`;
            const canvasEl = document.createElement('canvas');
            canvasEl.id = `section-meter-chart-${meter.id}`;
            chartDiv.appendChild(title);
            chartDiv.appendChild(canvasEl);
            sectionMeterChartsContainer.appendChild(chartDiv);

            const newChart = new Chart(canvasEl.getContext('2d'), {
                type: 'line',
                data: {
                    datasets: [{
                        label: dict.allLanesAvgRateLabel,
                        data: [],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    }]
                },
                options: chartOptions
            });
            sectionMeterCharts[meter.id] = newChart;
        });
    }

    function updateStatistics(time) {
        if (!simulation) return;

        const vehicles = simulation.vehicles;
        const vehicleCount = vehicles.length;
        let avgSpeedKmh = 0;
        if (vehicleCount > 0) {
            const totalSpeed = vehicles.reduce((sum, v) => sum + v.speed, 0);
            avgSpeedKmh = (totalSpeed / vehicleCount) * 3.6;
        }
        maxVehicleCount = Math.max(maxVehicleCount, vehicleCount);
        maxAvgSpeed = Math.max(maxAvgSpeed, avgSpeedKmh);
        const newData = { time, count: vehicleCount, speed: avgSpeedKmh };
        if (!statsData.some(d => d.time === time)) {
            statsData.push(newData);
        }
        updateStatsUI(newData);

        simulation.speedMeters.forEach(meter => {
            const chart = meterCharts[meter.id];
            if (!chart) return;
            const dict = translations[currentLang];
            let currentMaxSpeed = 0;
            for (const key in meter.readings) {
                const readings = meter.readings[key];
                if (readings.length > 0) {
                    const totalSpeed = readings.reduce((sum, s) => sum + s, 0);
                    const avgSpeedMs = totalSpeed / readings.length;
                    const meterAvgSpeedKmh = avgSpeedMs * 3.6;
                    currentMaxSpeed = Math.max(currentMaxSpeed, meterAvgSpeedKmh);
                    const label = (key === 'all') ? dict.allLanesLabel : `${dict.laneLabel} ${key}`;
                    const dataset = chart.data.datasets.find(d => d.label === label);
                    if (dataset) { dataset.data.push({ x: time, y: meterAvgSpeedKmh }); }
                }
            }
            meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, currentMaxSpeed);
            chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60;
            chart.update('none');
            meter.readings = {};
        });

        simulation.sectionMeters.forEach(meter => {
            const chart = sectionMeterCharts[meter.id];
            if (!chart) return;
            if (meter.completedVehicles.length > 0) {
                const totalSpeed = meter.completedVehicles.reduce((sum, v) => sum + v.speed, 0);
                const avgSpeed = totalSpeed / meter.completedVehicles.length;
                chart.data.datasets[0].data.push({ x: time, y: avgSpeed });
                meter.lastAvgSpeed = avgSpeed;
                meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, avgSpeed);
            } else if (meter.lastAvgSpeed !== null) {
                chart.data.datasets[0].data.push({ x: time, y: meter.lastAvgSpeed });
            }
            chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60;
            chart.update('none');
            meter.completedVehicles = [];
        });
    }

    function updateStatsUI(data, isRepopulating = false) {
        if (!isRepopulating) {
            const newRow = statsTableBody.insertRow(0);
            newRow.insertCell(0).textContent = data.time;
            newRow.insertCell(1).textContent = data.count;
            newRow.insertCell(2).textContent = data.speed.toFixed(2);
            if (statsTableBody.rows.length > 200) statsTableBody.deleteRow(-1);
        }

        if (vehicleCountChart && !vehicleCountChart.data.labels.includes(data.time)) {
             vehicleCountChart.data.labels.push(data.time);
             vehicleCountChart.data.datasets[0].data.push(data.count);
             vehicleCountChart.options.scales.y.max = maxVehicleCount > 10 ? Math.ceil(maxVehicleCount * 1.1) : 10;
             vehicleCountChart.update('none');
        }

        if (avgSpeedChart && !avgSpeedChart.data.labels.includes(data.time)) {
            avgSpeedChart.data.labels.push(data.time);
            avgSpeedChart.data.datasets[0].data.push(data.speed);
            avgSpeedChart.options.scales.y.max = maxAvgSpeed > 10 ? Math.ceil(maxAvgSpeed * 1.1) : 10;
            avgSpeedChart.update('none');
        }
    }

    function resetStatistics() {
        statsData = []; lastLoggedIntegerTime = -1; maxVehicleCount = 0; maxAvgSpeed = 0;
        statsTableBody.innerHTML = '';
        initializeCharts(); // Re-init with correct language
        meterChartsContainer.innerHTML = '';
        meterCharts = {};
        sectionMeterChartsContainer.innerHTML = '';
        sectionMeterCharts = {};
    }


    // ===================================================================
    // 繪圖與解析函數 (無變更)
    // ===================================================================
    function drawNetwork(netData, links, vehicles = null) {
        if (!netData) return;
        const vehiclesOnLink = {};
        const vehiclesInIntersection = [];
        if (vehicles) {
            vehicles.forEach(v => {
                if (v.state === 'onLink') {
                    if (!vehiclesOnLink[v.currentLinkId]) {
                        vehiclesOnLink[v.currentLinkId] = [];
                    }
                    vehiclesOnLink[v.currentLinkId].push(v);
                } else if (v.state === 'inIntersection') {
                    vehiclesInIntersection.push(v);
                }
            });
        }
        if (netData.backgroundTiles) {
            ctx.save();
            for (const tile of netData.backgroundTiles) {
                ctx.globalAlpha = tile.opacity;
                ctx.drawImage(tile.image, tile.x, tile.y, tile.width, tile.height);
            }
            ctx.restore();
        }

        // [MODIFIED] Draw nodes (intersections) first to act as the bottom layer
        if (netData.nodes) {
            Object.values(netData.nodes).forEach(node => {
                if (node.polygon) {
                    ctx.fillStyle = '#666666';
                    ctx.strokeStyle = '#666';
                    ctx.lineWidth = 1 / scale;
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.moveTo(node.polygon[0].x, node.polygon[0].y);
                    for (let i = 1; i < node.polygon.length; i++) ctx.lineTo(node.polygon[i].x, node.polygon[i].y);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
            });
        }
        
        const linksToDraw = netData.drawOrder || Object.keys(netData.links);
        for (const linkId of linksToDraw) {
            const link = netData.links[linkId];
            if (!link) continue;
            link.geometry.forEach(geo => {
                ctx.strokeStyle = '#666';
                ctx.fillStyle = '#666666';
                ctx.lineWidth = 1 / scale;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(geo.points[0].x, geo.points[0].y);
                for (let i = 1; i < geo.points.length; i++) ctx.lineTo(geo.points[i].x, geo.points[i].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            });
            if (link.dividingLines && link.dividingLines.length > 0) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.lineWidth = 0.5 / scale;
                ctx.setLineDash([5 / scale, 7 / scale]);
                for (const line of link.dividingLines) {
                    if (line.path.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(line.path[0].x, line.path[0].y);
                        for (let i = 1; i < line.path.length; i++) {
                            ctx.lineTo(line.path[i].x, line.path[i].y);
                        }
                        ctx.stroke();
                    }
                }
            }
            if (vehiclesOnLink[linkId]) {
                vehiclesOnLink[linkId].forEach(v => v.draw(ctx));
            }
        }

        // [MODIFIED] The node drawing block was moved above the link drawing block.

        if (vehiclesInIntersection.length > 0) {
            vehiclesInIntersection.forEach(v => v.draw(ctx));
        }
        if (netData.roadSignVisuals) { for (const sign of netData.roadSignVisuals) { ctx.save(); ctx.translate(sign.x, sign.y); const signRadius = 1.0; const lineWidth = 0.2; const fontSize = 1.2; if (sign.type === 'limit') { ctx.beginPath(); ctx.arc(0, 0, signRadius, 0, 2 * Math.PI); ctx.fillStyle = 'red'; ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = lineWidth; ctx.stroke(); const speedKmh = Math.round(sign.limit * 3.6); ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${fontSize}px sans-serif`; ctx.fillText(speedKmh, 0, 0); } else if (sign.type === 'no_limit') { ctx.beginPath(); ctx.arc(0, 0, signRadius, 0, 2 * Math.PI); ctx.fillStyle = 'white'; ctx.fill(); ctx.strokeStyle = 'black'; ctx.lineWidth = lineWidth; ctx.stroke(); } ctx.restore(); } }
        if (showPointMeters && netData.speedMeters) { for (const meter of netData.speedMeters) { const link = links[meter.linkId]; if (!link) continue; const size = 3.5; const offsetDist = size * 1.5; const dirVec = { x: Math.cos(meter.angle), y: Math.sin(meter.angle) }; const normalVec = { x: -dirVec.y, y: dirVec.x }; const upstreamOffset = offsetDist; const idTextPosX = meter.x - dirVec.x * upstreamOffset; const idTextPosY = meter.y - dirVec.y * upstreamOffset; ctx.save(); ctx.translate(idTextPosX, idTextPosY); ctx.rotate(meter.angle); ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 0.8 / scale; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${size}px sans-serif`; ctx.strokeText(meter.id, 0, 0); ctx.fillText(meter.id, 0, 0); ctx.restore(); ctx.save(); ctx.translate(meter.x, meter.y); ctx.rotate(meter.angle); ctx.fillStyle = 'rgba(239, 122, 50, 0.9)'; ctx.strokeStyle = 'black'; ctx.lineWidth = 0.4 / scale; ctx.beginPath(); ctx.moveTo(0, -size * 0.8); ctx.lineTo(size, size * 0.8); ctx.lineTo(-size, size * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${size * 0.8}px sans-serif`; ctx.fillText('S', 0, size * 0.3); ctx.restore(); const numLanes = meter.numLanes; const laneWidth = 3.5; const downstreamOffset = offsetDist; for (let i = 0; i < numLanes; i++) { const laneOffset = (i - (numLanes - 1) / 2) * laneWidth; const textPosX = meter.x + dirVec.x * downstreamOffset + normalVec.x * laneOffset; const textPosY = meter.y + dirVec.y * downstreamOffset + normalVec.y * laneOffset; ctx.save(); ctx.translate(textPosX, textPosY); ctx.rotate(meter.angle); ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 0.6 / scale; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${laneWidth * 0.8}px sans-serif`; ctx.strokeText(i, 0, 0); ctx.fillText(i, 0, 0); ctx.restore(); } } }
        if (showSectionMeters && netData.sectionMeters) {
            const size = 3.0;
            const drawSectionMarker = (x, y, angle) => {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(angle);
                ctx.fillStyle = 'rgba(50, 180, 239, 0.9)';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 0.4 / scale;
                ctx.beginPath();
                ctx.rect(-size / 2, -size / 2, size, size);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${size * 0.8}px sans-serif`;
                ctx.fillText('S', 0, size * 0.1);
                ctx.restore();
            };
            for (const meter of netData.sectionMeters) {
                drawSectionMarker(meter.startX, meter.startY, meter.startAngle);
                drawSectionMarker(meter.endX, meter.endY, meter.endAngle);
                const offsetDist = size * 1.5;
                const startDirVec = { x: Math.cos(meter.startAngle), y: Math.sin(meter.startAngle) };
                const idTextStartX = meter.startX - startDirVec.x * offsetDist;
                const idTextStartY = meter.startY - startDirVec.y * offsetDist;
                ctx.save();
                ctx.translate(idTextStartX, idTextStartY);
                ctx.rotate(meter.startAngle);
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 0.8 / scale;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${size}px sans-serif`;
                ctx.strokeText(meter.id, 0, 0);
                ctx.fillText(meter.id, 0, 0);
                ctx.restore();
                const endDirVec = { x: Math.cos(meter.endAngle), y: Math.sin(meter.endAngle) };
                const idTextEndX = meter.endX + endDirVec.x * offsetDist;
                const idTextEndY = meter.endY + endDirVec.y * offsetDist;
                ctx.save();
                ctx.translate(idTextEndX, idTextEndY);
                ctx.rotate(meter.endAngle);
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 0.8 / scale;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${size}px sans-serif`;
                ctx.strokeText(meter.id, 0, 0);
                ctx.fillText(meter.id, 0, 0);
                ctx.restore();
            }
        }
        ctx.setLineDash([]);
    }
    function parseTrafficModel(xmlDoc) {
        return new Promise((resolve, reject) => {
            const links = {}; const nodes = {}; let spawners = []; let trafficLights = [];
            const staticVehicles = []; const speedMeters = [];
            const sectionMeters = [];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const updateBounds = (p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
            const roadSignVisuals = []; const backgroundTiles = []; const imagePromises = [];

            function getPointAtDistanceAlongPath(path, distance) { let accumulatedLength = 0; for (let i = 0; i < path.length - 1; i++) { const p1 = path[i]; const p2 = path[i + 1]; const segmentLength = Geom.Vec.dist(p1, p2); if (distance >= accumulatedLength && distance <= accumulatedLength + segmentLength) { const ratio = (distance - accumulatedLength) / segmentLength; const segmentVec = Geom.Vec.sub(p2, p1); const point = Geom.Vec.add(p1, Geom.Vec.scale(segmentVec, ratio)); const normal = Geom.Vec.normalize(Geom.Vec.normal(segmentVec)); const angle = Geom.Vec.angle(segmentVec); return { point, normal, angle }; } accumulatedLength += segmentLength; } return null; }

            xmlDoc.querySelectorAll('Link').forEach(linkEl => {
                const linkId = linkEl.querySelector('id').textContent;
                const sourceNodeId = linkEl.querySelector('sourceNodeId')?.textContent;
                const destinationNodeId = linkEl.querySelector('destinationNodeId')?.textContent;

                if (!sourceNodeId && !destinationNodeId) {
                    const segs = linkEl.querySelectorAll('Segments > TrapeziumSegment');
                    if(segs.length > 0) {
                        const wp = linkEl.querySelectorAll('Waypoints > Waypoint');
                        if(wp.length >= 2){
                            const firstWpId = segs[0].querySelector('startWaypointId').textContent;
                            const lastWpId = segs[segs.length-1].querySelector('endWaypointId').textContent;
                            xmlDoc.querySelectorAll('Nodes > *').forEach(nodeEl => {
                                if(nodeEl.querySelector('outgoingLinkId')?.textContent === linkId || nodeEl.querySelector('incomingLinkId')?.textContent === linkId){
                                    const center = nodeEl.querySelector('CircleGeometry > Center');
                                    if(center){
                                        const wpId = Array.from(wp).find(w => w.querySelector('x').textContent === center.querySelector('x').textContent)?.querySelector('id').textContent;
                                        if(wpId === firstWpId) links[linkId] = { ...links[linkId], source: nodeEl.querySelector('id').textContent};
                                        if(wpId === lastWpId) links[linkId] = { ...links[linkId], destination: nodeEl.querySelector('id').textContent};
                                    }
                                }
                            });
                        }
                    }
                } else {
                    links[linkId] = { id: linkId, source: sourceNodeId, destination: destinationNodeId };
                }

                links[linkId] = {
                    ...links[linkId],
                    length: parseFloat(linkEl.querySelector('length').textContent),
                    geometry: [], lanes: {}, dividingLines: [], roadSigns: []
                };
                const link = links[linkId];

                linkEl.querySelectorAll('Lanes > Lane').forEach(laneEl => {
                    const laneIndex = parseInt(laneEl.querySelector('index').textContent, 10);
                    const laneWidth = parseFloat(laneEl.querySelector('width').textContent);
                    link.lanes[laneIndex] = {
                        index: laneIndex,
                        width: laneWidth,
                        path: [],
                        length: 0
                    };
                });
                const numLanes = Object.keys(link.lanes).length;
                if (numLanes > 1) {
                    for (let i = 0; i < numLanes - 1; i++) {
                        link.dividingLines[i] = { path: [] };
                    }
                }
                const centerlinePolyline = [];
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
                    if (centerlinePolyline.length === 0) {
                        centerlinePolyline.push(centerStart);
                    }
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
            xmlDoc.querySelectorAll('Nodes > *').forEach(nodeEl => { const nodeId = nodeEl.querySelector('id').textContent; nodes[nodeId] = { id: nodeId, transitions: [], turnGroups: {}, polygon: [] }; const node = nodes[nodeId]; nodeEl.querySelectorAll('PolygonGeometry > Point').forEach(p => { const point = {x: parseFloat(p.querySelector('x').textContent), y: -parseFloat(p.querySelector('y').textContent)}; node.polygon.push(point); }); if(node.polygon.length === 0){ const circle = nodeEl.querySelector('CircleGeometry'); if(circle){ const center = circle.querySelector('Center'); const radius = parseFloat(circle.querySelector('radius').textContent); const cx = parseFloat(center.querySelector('x').textContent); const cy = -parseFloat(center.querySelector('y').textContent); for(let i=0; i < 12; i++){ const angle = (i/12) * 2 * Math.PI; node.polygon.push({x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle)}); } } } nodeEl.querySelectorAll('TransitionRule').forEach(ruleEl => { const idEl = ruleEl.querySelector('id'); const sourceLinkEl = ruleEl.querySelector('sourceLinkId'); if (idEl && sourceLinkEl) { const transition = { id: idEl.textContent, sourceLinkId: sourceLinkEl.textContent, sourceLaneIndex: parseInt(ruleEl.querySelector('sourceLaneIndex').textContent, 10), destLinkId: ruleEl.querySelector('destinationLinkId').textContent, destLaneIndex: parseInt(ruleEl.querySelector('destinationLaneIndex').textContent, 10), }; const bezierEl = ruleEl.querySelector('BezierCurveGeometry'); if (bezierEl) { const points = Array.from(bezierEl.querySelectorAll('Point')).map(pEl => ({ x: parseFloat(pEl.querySelector('x').textContent), y: -parseFloat(pEl.querySelector('y').textContent) })); if(points.length === 4) { transition.bezier = { points: points, length: Geom.Bezier.getLength(...points) }; } } node.transitions.push(transition); } }); nodeEl.querySelectorAll('TurnTRGroup').forEach(groupEl => { const groupId = groupEl.querySelector('id').textContent; groupEl.querySelectorAll('TransitionRule').forEach(ruleRefEl => { const ruleIdEl = ruleRefEl.querySelector('transitionRuleId'); if (ruleIdEl) { const ruleId = ruleIdEl.textContent; const transition = node.transitions.find(t => t.id === ruleId); if (transition) transition.turnGroupId = groupId; } }); }); });
            xmlDoc.querySelectorAll('RegularTrafficLightNetwork').forEach(netEl => { const nodeId = netEl.querySelector('regularNodeId').textContent; const config = { nodeId: nodeId, schedule: [], lights: {}, timeShift: 0 }; const timeShiftEl = netEl.querySelector('scheduleTimeShift'); if (timeShiftEl) { config.timeShift = parseFloat(timeShiftEl.textContent) || 0; } netEl.querySelectorAll('TrafficLight').forEach(lightEl => { const lightId = lightEl.querySelector('id').textContent; const turnTRGroupIds = Array.from(lightEl.querySelectorAll('turnTRGroupId')).map(id => id.textContent); config.lights[lightId] = { id: lightId, turnTRGroupIds: turnTRGroupIds }; }); netEl.querySelectorAll('Schedule > TimePeriods > TimePeriod').forEach(periodEl => { const period = { duration: parseFloat(periodEl.querySelector('duration').textContent), signals: {} }; periodEl.querySelectorAll('TrafficLightSignal').forEach(sigEl => { const lightId = sigEl.querySelector('trafficLightId').textContent; const signal = sigEl.querySelector('signal').textContent; const light = config.lights[lightId]; if (light) { light.turnTRGroupIds.forEach(groupId => { period.signals[groupId] = signal; }); } }); config.schedule.push(period); }); trafficLights.push(new TrafficLightController(config)); });
            xmlDoc.querySelectorAll('Origins > Origin').forEach(originEl => { const originNodeId = originEl.querySelector('originNodeId').textContent; const periods = []; originEl.querySelectorAll('TimePeriods > TimePeriod').forEach(timePeriodEl => { const periodConfig = { duration: parseFloat(timePeriodEl.querySelector('duration').textContent), numVehicles: parseInt(timePeriodEl.querySelector('numberOfVehicles').textContent, 10), destinations: [], vehicleProfiles: [] }; timePeriodEl.querySelectorAll('Destinations > Destination').forEach(destEl => { periodConfig.destinations.push({ weight: parseFloat(destEl.querySelector('weight').textContent), destinationNodeId: destEl.querySelector('destinationNodeId').textContent }); }); timePeriodEl.querySelectorAll('VehicleProfiles > VehicleProfile').forEach(profEl => { const driverParams = profEl.querySelector('Parameters'); periodConfig.vehicleProfiles.push({ weight: parseFloat(profEl.querySelector('weight').textContent), length: parseFloat(profEl.querySelector('RegularVehicle > length').textContent), width: parseFloat(profEl.querySelector('RegularVehicle > width').textContent), params: { maxSpeed: parseFloat(driverParams.querySelector('maxSpeed').textContent), maxAcceleration: parseFloat(driverParams.querySelector('maxAcceleration').textContent), comfortDeceleration: parseFloat(driverParams.querySelector('comfortDeceleration').textContent), minDistance: parseFloat(driverParams.querySelector('minDistance').textContent), desiredHeadwayTime: parseFloat(driverParams.querySelector('desiredHeadwayTime').textContent) } }); }); periods.push(periodConfig); }); if (periods.length > 0) { spawners.push({ originNodeId, periods }); } });
            xmlDoc.querySelectorAll('Agents > Vehicles > RegularVehicle').forEach(vehicleEl => { const driverParamsEl = vehicleEl.querySelector('Parameters'); const locationEl = vehicleEl.querySelector('LinkLocation'); if (!driverParamsEl || !locationEl) return; const staticVehicle = { profile: { length: parseFloat(vehicleEl.querySelector('length').textContent), width: parseFloat(vehicleEl.querySelector('width').textContent), params: { maxSpeed: parseFloat(driverParamsEl.querySelector('maxSpeed').textContent), maxAcceleration: parseFloat(driverParamsEl.querySelector('maxAcceleration').textContent), comfortDeceleration: parseFloat(driverParamsEl.querySelector('comfortDeceleration').textContent), minDistance: parseFloat(driverParamsEl.querySelector('minDistance').textContent), desiredHeadwayTime: parseFloat(driverParamsEl.querySelector('desiredHeadwayTime').textContent), } }, initialState: { distanceOnPath: parseFloat(locationEl.querySelector('position').textContent), speed: parseFloat(vehicleEl.querySelector('speed').textContent) }, startLinkId: locationEl.querySelector('linkId').textContent, startLaneIndex: parseInt(locationEl.querySelector('laneIndex').textContent, 10), destinationNodeId: vehicleEl.querySelector('CompositeDriver > destinationNodeId').textContent }; staticVehicles.push(staticVehicle); });
            xmlDoc.querySelectorAll('LinkAverageTravelSpeedMeter').forEach(meterEl => { const id = meterEl.querySelector('id').textContent; const name = meterEl.querySelector('name').textContent; const linkId = meterEl.querySelector('linkId').textContent; const position = parseFloat(meterEl.querySelector('position').textContent); const link = links[linkId]; if (!link) return; const numLanes = Object.keys(link.lanes).length; let refPath = []; const laneEntries = Object.values(link.lanes).sort((a,b) => a.index - b.index); if (laneEntries.length > 0) { refPath = laneEntries[0].path; } const posData = getPointAtDistanceAlongPath(refPath, position); if (posData) { const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5; const meterPosition = Geom.Vec.add(posData.point, Geom.Vec.scale(posData.normal, roadCenterlineOffset)); speedMeters.push({ id, name, linkId, position, numLanes, x: meterPosition.x, y: meterPosition.y, angle: posData.angle }); } });
            xmlDoc.querySelectorAll('SectionAverageTravelSpeedMeter').forEach(meterEl => { const id = meterEl.querySelector('id').textContent; const name = meterEl.querySelector('name').textContent; const linkId = meterEl.querySelector('linkId').textContent; const endPosition = parseFloat(meterEl.querySelector('position').textContent); const length = parseFloat(meterEl.querySelector('sectionLength').textContent); const startPosition = endPosition - length; const link = links[linkId]; if (!link) return; let refPath = []; const laneEntries = Object.values(link.lanes).sort((a,b) => a.index - b.index); if (laneEntries.length > 0) { refPath = laneEntries[0].path; } const startPosData = getPointAtDistanceAlongPath(refPath, startPosition); const endPosData = getPointAtDistanceAlongPath(refPath, endPosition); if (startPosData && endPosData) { const numLanes = Object.keys(link.lanes).length; const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5; const startMarkerPos = Geom.Vec.add(startPosData.point, Geom.Vec.scale(startPosData.normal, roadCenterlineOffset)); const endMarkerPos = Geom.Vec.add(endPosData.point, Geom.Vec.scale(endPosData.normal, roadCenterlineOffset)); sectionMeters.push({ id, name, linkId, length, startPosition, endPosition, startX: startMarkerPos.x, startY: startMarkerPos.y, startAngle: startPosData.angle, endX: endMarkerPos.x, endY: endMarkerPos.y, endAngle: endPosData.angle, }); } });
            const allLinkIds = Object.keys(links); const overpassElementMap = new Map(); xmlDoc.querySelectorAll('Overpasses > Overpass > Elements > Element').forEach(el => { overpassElementMap.set(el.querySelector('Id').textContent, el.querySelector('LinkId').textContent); }); const adj = new Map(); const inDegree = new Map(); allLinkIds.forEach(id => { adj.set(id, new Set()); inDegree.set(id, 0); }); xmlDoc.querySelectorAll('Overpasses > Overpass > ElementaryPairs > Pair').forEach(pairEl => { const bottomLinkId = overpassElementMap.get(pairEl.querySelector('Bottom').textContent); const topLinkId = overpassElementMap.get(pairEl.querySelector('Top').textContent); if (bottomLinkId && topLinkId && links[bottomLinkId] && links[topLinkId]) { if (!adj.get(bottomLinkId).has(topLinkId)) { adj.get(bottomLinkId).add(topLinkId); inDegree.set(topLinkId, inDegree.get(topLinkId) + 1); } } }); const queue = allLinkIds.filter(id => inDegree.get(id) === 0); const drawOrder = []; while (queue.length > 0) { const u = queue.shift(); drawOrder.push(u); for (const v of adj.get(u)) { inDegree.set(v, inDegree.get(v) - 1); if (inDegree.get(v) === 0) { queue.push(v); } } }
            for (const link of Object.values(links)) { if (link.roadSigns && link.roadSigns.length > 0) { const laneEntries = Object.values(link.lanes); if (laneEntries.length === 0) continue; const numLanes = laneEntries.length; const referencePath = laneEntries.sort((a,b) => a.index - b.index)[0].path; for (const sign of link.roadSigns) { const posData = getPointAtDistanceAlongPath(referencePath, sign.position); if (posData) { const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5; const signPosition = Geom.Vec.add(posData.point, Geom.Vec.scale(posData.normal, roadCenterlineOffset)); roadSignVisuals.push({ ...sign, x: signPosition.x, y: signPosition.y }); } } } }
            const imageTypeMap = { 'PNG': 'png', 'JPG': 'jpeg', 'JPEG': 'jpeg', 'BMP': 'bmp', 'GIF': 'gif', 'TIFF': 'tiff' };
            xmlDoc.querySelectorAll('Background > Tile').forEach(tileEl => { const rect = tileEl.querySelector('Rectangle'); const start = rect.querySelector('Start'); const end = rect.querySelector('End'); const imageEl = tileEl.querySelector('Image'); const p1x = parseFloat(start.querySelector('x').textContent); const p1y = -parseFloat(start.querySelector('y').textContent); const p2x = parseFloat(end.querySelector('x').textContent); const p2y = -parseFloat(end.querySelector('y').textContent); const x = Math.min(p1x, p2x); const y = Math.min(p1y, p2y); const width = Math.abs(p2x - p1x); const height = Math.abs(p2y - p1y); const saturationEl = tileEl.querySelector('saturation'); const opacity = saturationEl ? parseFloat(saturationEl.textContent) / 100 : 1.0; const type = imageEl.querySelector('type').textContent.toUpperCase(); const mimeType = imageTypeMap[type] || 'png'; const base64Data = imageEl.querySelector('binaryData').textContent; const img = new Image(); const p = new Promise((imgResolve, imgReject) => { img.onload = () => imgResolve(img); img.onerror = () => imgReject(); }); imagePromises.push(p); img.src = `data:image/${mimeType};base64,${base64Data}`; backgroundTiles.push({ image: img, x, y, width, height, opacity }); });

            Promise.all(imagePromises).then(() => {
                resolve({
                    links, nodes, spawners, trafficLights, staticVehicles,
                    speedMeters,
                    sectionMeters,
                    bounds: { minX, minY, maxX, maxY },
                    pathfinder: new Pathfinder(links, nodes),
                    drawOrder: drawOrder.length === allLinkIds.length ? drawOrder : allLinkIds,
                    roadSignVisuals,
                    backgroundTiles
                });
            }).catch(() => reject(new Error(translations[currentLang].imageLoadError)));
        });
    }

    // --- 輔助函數 (無變更) ---
    function resizeCanvas() { canvas.width = canvasContainer.clientWidth; canvas.height = canvasContainer.clientHeight; redraw(); }
    function autoCenterAndZoom(bounds) { if (bounds.minX === Infinity) return; const networkWidth = bounds.maxX - bounds.minX; const networkHeight = bounds.maxY - bounds.minY; if (canvas.width <= 0 || canvas.height <= 0) return; const scaleX = canvas.width / (networkWidth + 100); const scaleY = canvas.height / (networkHeight + 100); scale = Math.min(scaleX, scaleY, 1.5); const networkCenterX = bounds.minX + networkWidth / 2; const networkCenterY = bounds.minY + networkHeight / 2; panX = canvas.width / 2 - networkCenterX * scale; panY = canvas.height / 2 - networkCenterY * scale; }
    function handleZoom(event) { event.preventDefault(); const zoomIntensity = 0.1; const wheel = event.deltaY < 0 ? 1 : -1; const zoom = Math.exp(wheel * zoomIntensity); const mouseX = event.clientX - canvas.offsetLeft; const mouseY = event.clientY - canvas.offsetTop; const worldX = (mouseX - panX) / scale; const worldY = (mouseY - panY) / scale; scale *= zoom; panX = mouseX - worldX * scale; panY = mouseY - worldY * scale; if (!isRunning) redraw(); }
    function handlePanStart(event) { event.preventDefault(); isPanning = true; panStart.x = event.clientX; panStart.y = event.clientY; canvas.style.cursor = 'grabbing'; }
    function handlePanMove(event) { if (!isPanning) return; event.preventDefault(); const dx = event.clientX - panStart.x; const dy = event.clientY - panStart.y; panX += dx; panY += dy; panStart.x = event.clientX; panStart.y = event.clientY; if (!isRunning) redraw(); }
    function handlePanEnd() { isPanning = false; canvas.style.cursor = 'grab'; }
});

// --- END OF FILE script02.js (MODIFIED FOR I18N - FULL VERSION) ---

