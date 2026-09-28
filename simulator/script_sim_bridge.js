// --- script_sim_bridge.js: Main Thread Simulation Proxy & Worker Bridge ---
// Bridges Three.js 3D rendering with the dedicated background Simulation Worker.

class SimulationBridge {
    constructor() {
        this.worker = null;
        this.isWorkerReady = false;
        this.isRunning = false;
        // Detect if running under file:// protocol where Web Workers are blocked by browser CORS policy
        this.isFileProtocol = (typeof window !== 'undefined' && window.location.protocol === 'file:');
        this.useMultiThreading = !this.isFileProtocol;
        this.network = null;
        this.time = 0;

        // Active vehicle proxies (accessed by update3DScene and redraw2D)
        this.vehicles = [];
        this.vehiclesByNumId = new Map();
        this.vehiclesByStrId = new Map();

        // Traffic lights proxies
        this.trafficLights = [];
        this.trafficLightMap = new Map();

        // LUTI Engine proxy
        this.lutiEngine = null;

        // Meters proxies
        this.speedMeters = [];
        this.sectionMeters = [];
        this.spawners = [];

        // Query callbacks
        this.pendingQueries = new Map();
        this.querySeq = 0;

        // Frame snapshot subscribers
        this.snapshotCallbacks = [];

        // Local fallback simulation instance
        this.localSimulation = null;
    }

    /**
     * Initializes the Web Worker using standard file or Blob fallback
     */
    initWorker() {
        if (this.isFileProtocol) {
            this.useMultiThreading = false;
            return Promise.reject(new Error("CORS policy: Web Workers cannot run from file:// protocol"));
        }
        if (this.worker) return Promise.resolve(this.worker);

        return new Promise((resolve, reject) => {
            try {
                // 1. Try direct Worker instantiation
                const worker = new Worker('sim_worker.js');
                worker.onerror = (err) => {
                    console.warn('[SimBridge] Direct Worker failed, trying Blob Worker fallback...', err);
                    this.initBlobWorker().then(resolve).catch(reject);
                };
                this.setupWorkerListeners(worker);
                this.worker = worker;
                resolve(worker);
            } catch (e) {
                console.warn('[SimBridge] Direct Worker creation threw error, trying Blob fallback:', e);
                this.initBlobWorker().then(resolve).catch(reject);
            }
        });
    }

    /**
     * Fallback for file:// protocol where direct Worker loading is CORS-blocked
     */
    initBlobWorker() {
        return Promise.all([
            fetch('sim_engine_core.js').then(r => r.text()),
            fetch('sim_worker.js').then(r => r.text())
        ]).then(([coreCode, workerCode]) => {
            const combinedCode = coreCode + '\n;\n' + workerCode;
            const blob = new Blob([combinedCode], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            const worker = new Worker(blobUrl);
            this.setupWorkerListeners(worker);
            this.worker = worker;
            console.log('[SimBridge] Blob Worker created successfully.');
            return worker;
        }).catch(err => {
            console.error('[SimBridge] Both direct and Blob Worker failed. Will use Single-Thread mode:', err);
            this.useMultiThreading = false;
            throw err;
        });
    }

    setupWorkerListeners(worker) {
        worker.onmessage = (e) => {
            const msg = e.data;
            if (!msg || !msg.type) return;

            switch (msg.type) {
                case 'INIT_SUCCESS':
                    this.isWorkerReady = true;
                    console.log('[SimBridge] Simulation Worker is READY.');
                    break;

                case 'FRAME_SNAPSHOT':
                    this.handleFrameSnapshot(msg);
                    break;

                case 'QUERY_VEHICLE_RESULT': {
                    const cb = this.pendingQueries.get(msg.queryId);
                    if (cb) {
                        cb(msg.data);
                        this.pendingQueries.delete(msg.queryId);
                    }
                    break;
                }

                case 'INIT_ERROR':
                    console.error('[SimBridge] Worker reported init error:', msg.error);
                    break;
            }
        };

        worker.onerror = (err) => {
            const detail = err && (err.message || err.filename || err.lineno)
                ? `${err.message || ''} (${err.filename || ''}:${err.lineno || ''})`
                : err;
            console.error('[SimBridge] Worker unhandled error:', detail);
        };
    }

    /**
     * Sanitizes network data into a structured-cloneable object
     */
    sanitizeNetworkData(netData) {
        return {
            links: netData.links,
            nodes: netData.nodes,
            spawners: netData.spawners,
            trafficLights: netData.trafficLights,
            staticVehicles: netData.staticVehicles,
            speedMeters: netData.speedMeters ? netData.speedMeters.map(m => ({
                id: m.id, linkId: m.linkId, name: m.name, position: m.position,
                numLanes: m.numLanes, observedFlow: m.observedFlow,
                spawnProfiles: m.spawnProfiles, isSource: m.isSource
            })) : [],
            sectionMeters: netData.sectionMeters ? netData.sectionMeters.map(m => ({
                id: m.id, name: m.name, startLinkId: m.startLinkId, endLinkId: m.endLinkId,
                startPosition: m.startPosition, endPosition: m.endPosition, length: m.length
            })) : [],
            parkingLots: netData.parkingLots,
            roadMarkings: netData.roadMarkings,
            channelizationPolygons: netData.channelizationPolygons,
            medians: netData.medians,
            freeRoadSigns: netData.freeRoadSigns,
            geoAnchors: netData.geoAnchors,
            zones: netData.zones,
            bounds: netData.bounds,
            navigationMode: netData.navigationMode,
            vehicleProfiles: netData.vehicleProfiles
        };
    }

    /**
     * Loads the traffic model and boots up the Worker
     */
    loadNetwork(netData) {
        this.network = netData;
        this.vehicles = [];
        this.vehiclesByNumId.clear();
        this.vehiclesByStrId.clear();
        this.time = 0;

        // Initialize Traffic Light proxies
        this.trafficLights = [];
        this.trafficLightMap.clear();
        if (netData.trafficLights) {
            netData.trafficLights.forEach(tflConfig => {
                const proxy = {
                    nodeId: tflConfig.nodeId,
                    schedule: tflConfig.schedule,
                    timeShift: tflConfig.timeShift || 0,
                    cycleDuration: (tflConfig.schedule || []).reduce((sum, p) => sum + p.duration, 0),
                    turnGroupStates: {},
                    getSignalForTurnGroup: (turnGroupId) => {
                        return proxy.turnGroupStates[turnGroupId] || 'Green';
                    },
                    getPhaseDetails: (time) => {
                        if (proxy.cycleDuration <= 0) return { duration: 1, remaining: 0 };
                        const eff = time - proxy.timeShift;
                        let t = ((eff % proxy.cycleDuration) + proxy.cycleDuration) % proxy.cycleDuration;
                        for (const p of proxy.schedule) {
                            if (t < p.duration) return { duration: p.duration, remaining: Math.max(0, p.duration - t) };
                            t -= p.duration;
                        }
                        return { duration: 1, remaining: 0 };
                    }
                };
                this.trafficLights.push(proxy);
                this.trafficLightMap.set(proxy.nodeId, proxy);
            });
        }

        // Initialize LUTI Engine
        if (netData.zones && Object.keys(netData.zones).length > 0) {
            const EngineClass = (typeof window !== 'undefined' && window.LUTIEngine) ? window.LUTIEngine : ((typeof LUTIEngine !== 'undefined') ? LUTIEngine : null);
            if (EngineClass) {
                this.lutiEngine = new EngineClass(this, netData);
                // Wrap setTimePeriod and updateZoneProperty to sync with Worker
                const origSetTimePeriod = this.lutiEngine.setTimePeriod.bind(this.lutiEngine);
                this.lutiEngine.setTimePeriod = (period, autoAdjustVisual) => {
                    origSetTimePeriod(period, autoAdjustVisual);
                    if (this.worker && this.useMultiThreading) {
                        this.worker.postMessage({ type: 'SET_LUTI_PERIOD', payload: { period } });
                    }
                };
                const origSetScaleFactor = this.lutiEngine.setScaleFactor ? this.lutiEngine.setScaleFactor.bind(this.lutiEngine) : null;
                if (origSetScaleFactor) {
                    this.lutiEngine.setScaleFactor = (factor) => {
                        origSetScaleFactor(factor);
                        if (this.worker && this.useMultiThreading) {
                            this.worker.postMessage({ type: 'SET_LUTI_SCALE', payload: { scaleFactor: factor } });
                        }
                    };
                    if (typeof document !== 'undefined') {
                        const sel = document.getElementById('lutiScaleFactorSelector');
                        if (sel && sel.value) {
                            const initFactor = parseFloat(sel.value);
                            if (!isNaN(initFactor)) {
                                this.lutiEngine.setScaleFactor(initFactor);
                            }
                        }
                    }
                }
                const origUpdateZone = this.lutiEngine.updateZoneProperty ? this.lutiEngine.updateZoneProperty.bind(this.lutiEngine) : null;
                if (origUpdateZone) {
                    this.lutiEngine.updateZoneProperty = (zoneId, props) => {
                        origUpdateZone(zoneId, props);
                        if (this.worker && this.useMultiThreading) {
                            this.worker.postMessage({ type: 'UPDATE_ZONE_PROPERTY', payload: { zoneId, props } });
                        }
                    };
                }
            } else {
                // Self-contained fallback implementation containing all geometry & stats methods
                const fallbackScale = (typeof document !== 'undefined' && document.getElementById('lutiScaleFactorSelector'))
                    ? (parseFloat(document.getElementById('lutiScaleFactorSelector').value) || 1.0) : 1.0;
                this.lutiEngine = {
                    zones: netData.zones,
                    timePeriod: 'AM',
                    timeOfDay: 8.0,
                    diurnalMultiplier: 1.0,
                    scaleFactor: fallbackScale,
                    stats: {
                        totalPop: 0, totalEmp: 0, totalGFA: 0, totalProduction: 0, totalAttraction: 0,
                        hourlyAutoTrips: 0, hourlyMotoTrips: 0, hourlyWalkTrips: 0,
                        autoShare: 0, motoShare: 0, walkShare: 0
                    },
                    calculatePolygonArea: (pts) => {
                        if (!pts || pts.length < 3) return 0;
                        let area = 0;
                        for (let i = 0; i < pts.length; i++) {
                            const j = (i + 1) % pts.length;
                            area += pts[i].x * pts[j].y;
                            area -= pts[j].x * pts[i].y;
                        }
                        return Math.abs(area) / 2.0;
                    },
                    calculateGreenCoverage: () => 15.0,
                    calculateNetworkLOS: () => ({ avgSpeed: 30.0, los: 'B', activeVehicles: (this.vehicles ? this.vehicles.length : 0) }),
                    setTimePeriod: (period) => {
                        this.lutiEngine.timePeriod = period;
                        if (this.worker && this.useMultiThreading) {
                            this.worker.postMessage({ type: 'SET_LUTI_PERIOD', payload: { period } });
                        }
                    },
                    setScaleFactor: (factor) => {
                        this.lutiEngine.scaleFactor = factor;
                        if (this.worker && this.useMultiThreading) {
                            this.worker.postMessage({ type: 'SET_LUTI_SCALE', payload: { scaleFactor: factor } });
                        }
                    },
                    updateZoneProperty: (zoneId, props) => {
                        if (this.worker && this.useMultiThreading) {
                            this.worker.postMessage({ type: 'UPDATE_ZONE_PROPERTY', payload: { zoneId, props } });
                        }
                    }
                };
            }
            if (typeof window !== 'undefined') window.lutiEngine = this.lutiEngine;
        } else {
            this.lutiEngine = null;
            if (typeof window !== 'undefined') window.lutiEngine = null;
        }

        // Initialize Meters proxies
        this.speedMeters = (netData.speedMeters || []).map(m => ({ ...m, readings: {}, maxAvgSpeed: 0 }));
        this.sectionMeters = (netData.sectionMeters || []).map(m => ({ ...m, completedVehicles: [], maxAvgSpeed: 0, lastAvgSpeed: null }));
        this.spawners = netData.spawners || [];

        if (this.useMultiThreading) {
            return this.initWorker().then(worker => {
                const cleanData = this.sanitizeNetworkData(netData);
                worker.postMessage({
                    type: 'INIT_NETWORK',
                    payload: { networkData: cleanData }
                });
                return this;
            }).catch(err => {
                console.warn('[SimBridge] Initializing local single-thread fallback:', err);
                this.fallbackToSingleThread(netData);
                return this;
            });
        } else {
            this.fallbackToSingleThread(netData);
            return Promise.resolve(this);
        }
    }

    fallbackToSingleThread(netData) {
        this.useMultiThreading = false;
        const SimClass = (typeof window !== 'undefined' && window.Simulation) ? window.Simulation : ((typeof Simulation !== 'undefined') ? Simulation : null);
        if (SimClass) {
            this.localSimulation = new SimClass(netData);
            this.time = this.localSimulation.time;
            this.vehicles = this.localSimulation.vehicles;
            this.trafficLights = this.localSimulation.trafficLights;
            this.lutiEngine = this.localSimulation.lutiEngine;
            if (typeof window !== 'undefined') {
                window.simulation = this.localSimulation;
                window.lutiEngine = this.localSimulation.lutiEngine;
            }
            console.log('[SimBridge] Single-thread Simulation instance created successfully.');
        } else {
            console.warn('[SimBridge] Could not find Simulation class for fallback.');
        }
    }

    /**
     * Simulation tick for fallback single-thread mode
     */
    update(dt) {
        if (this.localSimulation) {
            this.localSimulation.update(dt);
            this.time = this.localSimulation.time;
            this.vehicles = this.localSimulation.vehicles;
            this.trafficLights = this.localSimulation.trafficLights;
            if (this.localSimulation.lutiEngine) {
                this.lutiEngine = this.localSimulation.lutiEngine;
            }
        }
    }

    /**
     * Unpacks binary snapshot and updates vehicle proxies in-place
     */
    handleFrameSnapshot(msg) {
        const { simTime, vehicleCount, vehicleBuffer, newVehicles, removedVehicleIds, signalStates, pedBuffer, pedCount, stats } = msg;

        this.time = simTime;

        // 1. Remove finished vehicles
        if (removedVehicleIds && removedVehicleIds.length > 0) {
            for (let i = 0; i < removedVehicleIds.length; i++) {
                const id = removedVehicleIds[i];
                const proxy = this.vehiclesByStrId.get(id);
                if (proxy) {
                    this.vehiclesByNumId.delete(proxy.numId);
                    this.vehiclesByStrId.delete(id);
                }
            }
            // Rebuild linear vehicles array
            this.vehicles = Array.from(this.vehiclesByStrId.values());
        }

        // 2. Add newly spawned vehicles
        if (newVehicles && newVehicles.length > 0) {
            for (let i = 0; i < newVehicles.length; i++) {
                const nv = newVehicles[i];
                if (!this.vehiclesByStrId.has(nv.id)) {
                    const proxy = {
                        id: nv.id,
                        numId: nv.numId,
                        length: nv.length,
                        width: nv.width,
                        isMotorcycle: nv.isMotorcycle,
                        colorCode: nv.colorCode,
                        x: 0,
                        y: 0,
                        angle: 0,
                        speed: 0,
                        blinker: 'none',
                        isBraking: false,
                        isPlayerControlled: false,
                        currentLaneIndex: 0,
                        finished: false
                    };
                    this.vehiclesByNumId.set(nv.numId, proxy);
                    this.vehiclesByStrId.set(nv.id, proxy);
                    this.vehicles.push(proxy);
                }
            }
        }

        // 3. Update vehicle states from Float32Array
        // Format: [numId, x, y, angle, speed, length, width, flags, colorCode, laneIndex]
        if (vehicleBuffer && vehicleCount > 0) {
            for (let i = 0; i < vehicleCount; i++) {
                const base = i * 10;
                const numId = vehicleBuffer[base];
                const proxy = this.vehiclesByNumId.get(numId);
                if (proxy) {
                    proxy.x = vehicleBuffer[base + 1];
                    proxy.y = vehicleBuffer[base + 2];
                    proxy.angle = vehicleBuffer[base + 3];
                    proxy.speed = vehicleBuffer[base + 4];
                    proxy.length = vehicleBuffer[base + 5];
                    proxy.width = vehicleBuffer[base + 6];

                    const flags = vehicleBuffer[base + 7];
                    const blinkCode = flags & 3;
                    proxy.blinker = blinkCode === 1 ? 'left' : (blinkCode === 2 ? 'right' : 'none');
                    proxy.isBraking = !!(flags & 4);
                    proxy.isMotorcycle = !!(flags & 8);
                    proxy.isPlayerControlled = !!(flags & 16);
                    proxy.colorCode = vehicleBuffer[base + 8];
                    proxy.currentLaneIndex = vehicleBuffer[base + 9];
                }
            }
        }

        // 4. Update traffic signal states
        if (signalStates) {
            for (const [nodeId, groupStates] of Object.entries(signalStates)) {
                const tfl = this.trafficLightMap.get(nodeId);
                if (tfl) {
                    tfl.turnGroupStates = groupStates;
                }
            }
        }

        // 5. Update meter readings from Worker
        if (msg.speedMeterData && msg.speedMeterData.length > 0) {
            for (let i = 0; i < msg.speedMeterData.length; i++) {
                const item = msg.speedMeterData[i];
                const target = this.speedMeters.find(m => m.id === item.id);
                if (target) {
                    target.readings = target.readings || {};
                    for (const [k, v] of Object.entries(item.readings)) {
                        target.readings[k] = (target.readings[k] || []).concat(v);
                    }
                }
            }
        }
        if (msg.sectionMeterData && msg.sectionMeterData.length > 0) {
            for (let i = 0; i < msg.sectionMeterData.length; i++) {
                const item = msg.sectionMeterData[i];
                const target = this.sectionMeters.find(m => m.id === item.id);
                if (target) {
                    target.completedVehicles = (target.completedVehicles || []).concat(item.completed);
                }
            }
        }

        // 6. Update LUTI stats from Worker
        if (msg.lutiStats && this.lutiEngine) {
            this.lutiEngine.stats = msg.lutiStats.stats;
            this.lutiEngine.timePeriod = msg.lutiStats.timePeriod;
            this.lutiEngine.diurnalMultiplier = msg.lutiStats.diurnalMultiplier;
        }

        // 7. Notify subscribers (render updates, stats)
        for (let i = 0; i < this.snapshotCallbacks.length; i++) {
            this.snapshotCallbacks[i](msg);
        }

        // 6. Return ArrayBuffer to Worker for Zero-Copy reuse
        if (this.worker && vehicleBuffer) {
            const transferList = [vehicleBuffer.buffer];
            if (pedBuffer) transferList.push(pedBuffer.buffer);

            this.worker.postMessage({
                type: 'RECYCLE_BUFFER',
                buffer: vehicleBuffer.buffer,
                pedBuffer: pedBuffer ? pedBuffer.buffer : null
            }, transferList);
        }
    }

    // --- Control Interface ---

    start() {
        this.isRunning = true;
        if (this.useMultiThreading && this.worker) {
            this.worker.postMessage({ type: 'START' });
        }
    }

    pause() {
        this.isRunning = false;
        if (this.useMultiThreading && this.worker) {
            this.worker.postMessage({ type: 'PAUSE' });
        }
    }

    setSpeed(speedMultiplier) {
        if (this.useMultiThreading && this.worker) {
            this.worker.postMessage({
                type: 'SET_SPEED',
                payload: { speed: speedMultiplier }
            });
        }
    }

    sendDriveInput(vehicleId, accel, targetLateralOffset, isPlayerControlled) {
        if (this.useMultiThreading && this.worker) {
            this.worker.postMessage({
                type: 'DRIVE_INPUT',
                payload: { vehicleId, accel, targetLateralOffset, isPlayerControlled }
            });
        } else if (this.localSimulation) {
            const v = this.localSimulation.vehicles.find(veh => veh.id === vehicleId);
            if (v) {
                v.isPlayerControlled = isPlayerControlled;
                if (accel !== undefined) v.accel = accel;
                if (targetLateralOffset !== undefined) v.targetLateralOffset = targetLateralOffset;
            }
        }
    }

    sendPoliceOverride(nodeId, timeShiftDelta, setTimeShift) {
        if (this.useMultiThreading && this.worker) {
            this.worker.postMessage({
                type: 'POLICE_OVERRIDE',
                payload: { nodeId, timeShiftDelta, setTimeShift }
            });
        } else if (this.localSimulation) {
            const tfl = this.localSimulation.trafficLights.find(t => t.nodeId === nodeId);
            if (tfl) {
                if (setTimeShift !== undefined) tfl.timeShift = setTimeShift;
                else if (timeShiftDelta !== undefined) tfl.timeShift += timeShiftDelta;
            }
        }
    }

    queryVehicleDetail(vehicleId) {
        if (this.useMultiThreading && this.worker) {
            return new Promise((resolve) => {
                const queryId = ++this.querySeq;
                this.pendingQueries.set(queryId, resolve);
                this.worker.postMessage({
                    type: 'QUERY_VEHICLE',
                    queryId: queryId,
                    payload: { vehicleId }
                });
                // 1.5s timeout safety
                setTimeout(() => {
                    if (this.pendingQueries.has(queryId)) {
                        this.pendingQueries.delete(queryId);
                        resolve(null);
                    }
                }, 1500);
            });
        } else if (this.localSimulation) {
            const v = this.localSimulation.vehicles.find(veh => veh.id === vehicleId);
            return Promise.resolve(v ? {
                id: v.id,
                profileId: v.profileId,
                speed: v.speed,
                speedKmh: v.speed * 3.6,
                accel: v.accel,
                distanceOnPath: v.distanceOnPath,
                currentLinkId: v.currentLinkId,
                currentLaneIndex: v.currentLaneIndex,
                state: v.state,
                blinker: v.blinker,
                isBraking: v.isBraking,
                waitTime: v.yieldWaitTime || 0,
                route: v.route || []
            } : null);
        }
        return Promise.resolve(null);
    }

    reset() {
        this.isRunning = false;
        this.time = 0;
        this.vehicles = [];
        this.vehiclesByNumId.clear();
        this.vehiclesByStrId.clear();
        if (this.useMultiThreading && this.worker) {
            this.worker.postMessage({ type: 'RESET' });
        }
        if (this.localSimulation) {
            this.localSimulation = null;
        }
    }

    onSnapshot(callback) {
        this.snapshotCallbacks.push(callback);
    }
}

// Global bridge instance
window.SimulationBridge = SimulationBridge;
window.simBridge = new SimulationBridge();
