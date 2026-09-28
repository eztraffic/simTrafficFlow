// --- sim_worker.js: High-Performance Multi-Threaded Simulation Worker ---
// Runs IDM, MOBIL, Traffic Light Controllers, Spawners, and LUTI on a dedicated background CPU thread.

if (typeof importScripts === 'function') {
    try {
        importScripts('sim_engine_core.js');
    } catch (e) {
        console.warn('[SimWorker] importScripts failed, engine may have been pre-bundled or inlined:', e);
    }
}

(function () {
    let simulation = null;
    let networkData = null;
    let isRunning = false;
    let simulationSpeed = 3.0;
    let lastTimestamp = 0;
    let loopTimeoutId = null;

    // Monotonic integer ID mapper for compact binary buffer communication
    let nextVehicleNumId = 1;
    const vehicleNumIdMap = new Map(); // string ID -> numId
    const prevVehicleIds = new Set();

    // Recycled ArrayBuffer pool (Double-buffering zero-copy)
    const recycledVehicleBuffers = [];
    const recycledPedBuffers = [];

    function getRecycledVehicleBuffer(floatCount) {
        if (recycledVehicleBuffers.length > 0) {
            const buf = recycledVehicleBuffers.pop();
            if (buf.length >= floatCount) return buf;
        }
        return new Float32Array(Math.max(floatCount, 2048));
    }

    function getRecycledPedBuffer(floatCount) {
        if (recycledPedBuffers.length > 0) {
            const buf = recycledPedBuffers.pop();
            if (buf.length >= floatCount) return buf;
        }
        return new Float32Array(Math.max(floatCount, 512));
    }

    function getNumId(strId) {
        let numId = vehicleNumIdMap.get(strId);
        if (!numId) {
            numId = nextVehicleNumId++;
            vehicleNumIdMap.set(strId, numId);
        }
        return numId;
    }

    // --- Core Simulation Loop ---
    function tick() {
        if (!isRunning || !simulation) {
            loopTimeoutId = null;
            return;
        }

        const now = performance.now();
        let dt = (now - lastTimestamp) / 1000.0;
        lastTimestamp = now;

        // Prevent huge delta spikes on tab unfocus
        if (dt > 0.05) dt = 0.05;

        // Scale by simulation speed
        const targetSimDt = dt * simulationSpeed;

        // Substep physics in chunks of <= 0.033s for IDM numerical stability
        const maxSubstep = 0.033;
        let remaining = targetSimDt;
        while (remaining > 0) {
            const step = Math.min(remaining, maxSubstep);
            simulation.update(step);
            remaining -= step;
        }

        // Send binary snapshot to Main Thread
        sendSnapshot();

        // Target ~60Hz dispatch (approx 16ms)
        loopTimeoutId = setTimeout(tick, 16);
    }

    function sendSnapshot() {
        if (!simulation) return;

        const vehicles = simulation.vehicles || [];
        const vehicleCount = vehicles.length;
        const currentIds = new Set();
        const newVehicles = [];
        const removedVehicleIds = [];

        // 1. Check newly spawned vehicles and populate currentIds
        for (let i = 0; i < vehicleCount; i++) {
            const v = vehicles[i];
            currentIds.add(v.id);
            if (!prevVehicleIds.has(v.id)) {
                const numId = getNumId(v.id);
                newVehicles.push({
                    id: v.id,
                    numId: numId,
                    length: v.length,
                    width: v.width,
                    isMotorcycle: !!v.isMotorcycle,
                    colorCode: v.colorCode || 0
                });
            }
        }

        // 2. Check despawned/finished vehicles
        for (const oldId of prevVehicleIds) {
            if (!currentIds.has(oldId)) {
                removedVehicleIds.push(oldId);
                vehicleNumIdMap.delete(oldId);
            }
        }

        // Update tracking set
        prevVehicleIds.clear();
        for (const id of currentIds) prevVehicleIds.add(id);

        // 3. Pack Vehicle Float32Array
        // Format: [numId, x, y, angle, speed, length, width, flags, colorCode, laneIndex] (10 floats)
        const vFloatCount = vehicleCount * 10;
        const vBuffer = getRecycledVehicleBuffer(vFloatCount);

        let totalSpeed = 0;
        for (let i = 0; i < vehicleCount; i++) {
            const v = vehicles[i];
            const base = i * 10;
            totalSpeed += v.speed || 0;

            vBuffer[base] = getNumId(v.id);
            vBuffer[base + 1] = v.x;
            vBuffer[base + 2] = v.y;
            vBuffer[base + 3] = v.angle;
            vBuffer[base + 4] = v.speed;
            vBuffer[base + 5] = v.length;
            vBuffer[base + 6] = v.width;

            // Flags bitmask:
            // bit 0-1: blinker (0 = none, 1 = left, 2 = right)
            // bit 2: isBraking
            // bit 3: isMotorcycle
            // bit 4: isPlayerControlled
            let flags = 0;
            if (v.blinker === 'left') flags |= 1;
            else if (v.blinker === 'right') flags |= 2;
            if (v.isBraking || v.speed < 1.0) flags |= 4;
            if (v.isMotorcycle) flags |= 8;
            if (v.isPlayerControlled) flags |= 16;
            vBuffer[base + 7] = flags;

            vBuffer[base + 8] = v.colorCode || 0;
            vBuffer[base + 9] = v.currentLaneIndex || 0;
        }

        // 4. Pack Signal States
        const signalStates = {};
        if (simulation.trafficLights) {
            for (let i = 0; i < simulation.trafficLights.length; i++) {
                const tfl = simulation.trafficLights[i];
                signalStates[tfl.nodeId] = tfl.turnGroupStates || {};
            }
        }

        // 5. Pack Pedestrian Float32Array (if present)
        let pBuffer = null;
        let pCount = 0;
        if (simulation.pedManager && simulation.pedManager.pedestrians) {
            const peds = simulation.pedManager.pedestrians;
            pCount = peds.length;
            const pFloatCount = pCount * 6;
            pBuffer = getRecycledPedBuffer(pFloatCount);

            for (let i = 0; i < pCount; i++) {
                const p = peds[i];
                const base = i * 6;
                pBuffer[base] = i + 1;
                pBuffer[base + 1] = p.x;
                pBuffer[base + 2] = p.y;
                pBuffer[base + 3] = p.angle || 0;
                pBuffer[base + 4] = p.speed || 0;
                let stateCode = 0;
                if (p.state === 'CROSSING') stateCode = 1;
                else if (p.state === 'WAITING_AT_ISLAND') stateCode = 2;
                else if (p.state === 'FINISHED') stateCode = 3;
                pBuffer[base + 5] = stateCode;
            }
        }

        const avgSpeedKmh = vehicleCount > 0 ? (totalSpeed / vehicleCount) * 3.6 : 0;

        // 6. Gather meter readings if any
        let speedMeterData = null;
        let sectionMeterData = null;
        if (simulation.speedMeters && simulation.speedMeters.length > 0) {
            speedMeterData = [];
            for (let i = 0; i < simulation.speedMeters.length; i++) {
                const sm = simulation.speedMeters[i];
                if (sm.readings && Object.keys(sm.readings).length > 0) {
                    speedMeterData.push({ id: sm.id, readings: sm.readings });
                    sm.readings = {};
                }
            }
        }
        if (simulation.sectionMeters && simulation.sectionMeters.length > 0) {
            sectionMeterData = [];
            for (let i = 0; i < simulation.sectionMeters.length; i++) {
                const scm = simulation.sectionMeters[i];
                if (scm.completedVehicles && scm.completedVehicles.length > 0) {
                    sectionMeterData.push({ id: scm.id, completed: scm.completedVehicles });
                    scm.completedVehicles = [];
                }
            }
        }

        // 7. Gather LUTI stats if any
        let lutiStats = null;
        if (simulation.lutiEngine && simulation.lutiEngine.stats) {
            lutiStats = {
                stats: simulation.lutiEngine.stats,
                timePeriod: simulation.lutiEngine.timePeriod,
                diurnalMultiplier: simulation.lutiEngine.diurnalMultiplier
            };
        }

        // Transferable transfer list (Zero-Copy)
        const transferList = [vBuffer.buffer];
        if (pBuffer) transferList.push(pBuffer.buffer);

        self.postMessage({
            type: 'FRAME_SNAPSHOT',
            simTime: simulation.time,
            vehicleCount: vehicleCount,
            vehicleBuffer: vBuffer,
            newVehicles: newVehicles,
            removedVehicleIds: removedVehicleIds,
            signalStates: signalStates,
            speedMeterData: speedMeterData,
            sectionMeterData: sectionMeterData,
            lutiStats: lutiStats,
            pedCount: pCount,
            pedBuffer: pBuffer,
            stats: {
                activeVehicleCount: vehicleCount,
                avgSpeedKmh: avgSpeedKmh,
                time: simulation.time
            }
        }, transferList);
    }

    // --- Worker Command Dispatcher ---
    self.onmessage = function (e) {
        const msg = e.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'INIT_NETWORK': {
                try {
                    networkData = msg.payload.networkData;

                    // Rebuild Pathfinder graph inside Worker
                    networkData.pathfinder = new Pathfinder(networkData.links, networkData.nodes);

                    // Compute conflict matrix
                    if (typeof computeNetworkConflicts === 'function') {
                        computeNetworkConflicts(networkData);
                    }

                    // Instantiate pure Simulation core
                    simulation = new Simulation(networkData);

                    // Reset counters
                    nextVehicleNumId = 1;
                    vehicleNumIdMap.clear();
                    prevVehicleIds.clear();

                    self.postMessage({
                        type: 'INIT_SUCCESS',
                        payload: {
                            time: simulation.time,
                            spawnerCount: simulation.spawners.length,
                            trafficLightCount: simulation.trafficLights.length
                        }
                    });
                } catch (err) {
                    console.error('[SimWorker] Failed to init network:', err);
                    self.postMessage({
                        type: 'INIT_ERROR',
                        error: err && err.message ? err.message : String(err)
                    });
                }
                break;
            }

            case 'START': {
                isRunning = true;
                lastTimestamp = performance.now();
                if (!loopTimeoutId) {
                    tick();
                }
                break;
            }

            case 'PAUSE': {
                isRunning = false;
                if (loopTimeoutId) {
                    clearTimeout(loopTimeoutId);
                    loopTimeoutId = null;
                }
                break;
            }

            case 'SET_SPEED': {
                if (typeof msg.payload?.speed === 'number') {
                    simulationSpeed = Math.max(0.1, Math.min(msg.payload.speed, 50.0));
                }
                break;
            }

            case 'STEP': {
                if (simulation) {
                    const stepDt = msg.payload?.dt || 0.05;
                    simulation.update(stepDt);
                    sendSnapshot();
                }
                break;
            }

            case 'RECYCLE_BUFFER': {
                // Buffer returned from main thread for zero-copy double buffering
                if (msg.buffer) {
                    recycledVehicleBuffers.push(new Float32Array(msg.buffer));
                }
                if (msg.pedBuffer) {
                    recycledPedBuffers.push(new Float32Array(msg.pedBuffer));
                }
                break;
            }

            case 'DRIVE_INPUT': {
                if (simulation && simulation.vehicles) {
                    const { vehicleId, accel, targetLateralOffset, isPlayerControlled } = msg.payload;
                    const v = simulation.vehicles.find(veh => veh.id === vehicleId);
                    if (v) {
                        v.isPlayerControlled = isPlayerControlled;
                        if (accel !== undefined) v.accel = accel;
                        if (targetLateralOffset !== undefined) v.targetLateralOffset = targetLateralOffset;
                    }
                }
                break;
            }

            case 'POLICE_OVERRIDE': {
                if (simulation && simulation.trafficLights) {
                    const { nodeId, timeShiftDelta, setTimeShift } = msg.payload;
                    const tfl = simulation.trafficLights.find(t => t.nodeId === nodeId);
                    if (tfl) {
                        if (setTimeShift !== undefined) {
                            tfl.timeShift = setTimeShift;
                        } else if (timeShiftDelta !== undefined) {
                            tfl.timeShift += timeShiftDelta;
                        }
                    }
                }
                break;
            }

            case 'SET_LUTI_PERIOD': {
                if (simulation && simulation.lutiEngine) {
                    simulation.lutiEngine.setTimePeriod(msg.payload.period);
                }
                break;
            }

            case 'SET_LUTI_SCALE': {
                if (simulation && simulation.lutiEngine && typeof simulation.lutiEngine.setScaleFactor === 'function') {
                    simulation.lutiEngine.setScaleFactor(msg.payload.scaleFactor);
                }
                break;
            }

            case 'UPDATE_ZONE_PROPERTY': {
                if (simulation && simulation.lutiEngine) {
                    simulation.lutiEngine.updateZoneProperty(msg.payload.zoneId, msg.payload.props);
                }
                break;
            }

            case 'QUERY_VEHICLE': {
                if (simulation && simulation.vehicles) {
                    const v = simulation.vehicles.find(veh => veh.id === msg.payload.vehicleId);
                    if (v) {
                        self.postMessage({
                            type: 'QUERY_VEHICLE_RESULT',
                            queryId: msg.queryId,
                            data: {
                                id: v.id,
                                profileId: v.profileId,
                                length: v.length,
                                width: v.width,
                                isMotorcycle: v.isMotorcycle,
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
                            }
                        });
                    } else {
                        self.postMessage({
                            type: 'QUERY_VEHICLE_RESULT',
                            queryId: msg.queryId,
                            data: null
                        });
                    }
                }
                break;
            }

            case 'RESET': {
                isRunning = false;
                if (loopTimeoutId) {
                    clearTimeout(loopTimeoutId);
                    loopTimeoutId = null;
                }
                simulation = null;
                networkData = null;
                nextVehicleNumId = 1;
                vehicleNumIdMap.clear();
                prevVehicleIds.clear();
                break;
            }
        }
    };
})();
