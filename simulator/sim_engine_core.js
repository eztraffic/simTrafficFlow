(function(global) {
// --- sim_engine_core.js: Core Simulation Mathematical & Physics Engine ---


class SpatialGrid {
    constructor(cellSize = 35) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    clear() {
        this.cells.clear();
    }
    _key(cx, cy) {
        return (cx << 16) ^ (cy & 0xFFFF);
    }
    insert(vehicle) {
        const cx = Math.floor(vehicle.x / this.cellSize);
        const cy = Math.floor(vehicle.y / this.cellSize);
        const k = this._key(cx, cy);
        let list = this.cells.get(k);
        if (!list) {
            list = [];
            this.cells.set(k, list);
        }
        list.push(vehicle);
    }
    getNearby(x, y, radius = 80) {
        const minCX = Math.floor((x - radius) / this.cellSize);
        const maxCX = Math.floor((x + radius) / this.cellSize);
        const minCY = Math.floor((y - radius) / this.cellSize);
        const maxCY = Math.floor((y + radius) / this.cellSize);
        const nearby = [];
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const list = this.cells.get(this._key(cx, cy));
                if (list) {
                    for (let i = 0; i < list.length; i++) {
                        nearby.push(list[i]);
                    }
                }
            }
        }
        return nearby;
    }
}


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
            },
            // [新增] 取得折線總長
            getPolylineLength: function (points) {
                let length = 0;
                for (let i = 0; i < points.length - 1; i++) {
                    length += Geom.Vec.dist(points[i], points[i + 1]);
                }
                return length;
            },
            // [新增] 依距離取得折線上的點
            getPointAlongPolyline: function (points, distance) {
                let traveled = 0;
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i], p2 = points[i + 1];
                    const segmentLen = Geom.Vec.dist(p1, p2);
                    if (segmentLen > 0 && traveled + segmentLen >= distance) {
                        const ratio = (distance - traveled) / segmentLen;
                        const segmentVec = Geom.Vec.sub(p2, p1);
                        return {
                            point: Geom.Vec.add(p1, Geom.Vec.scale(segmentVec, ratio)),
                            vec: Geom.Vec.normalize(segmentVec)
                        };
                    }
                    traveled += segmentLen;
                }
                if (points.length >= 2) {
                    const lastVec = Geom.Vec.normalize(Geom.Vec.sub(points[points.length - 1], points[points.length - 2]));
                    return { point: points[points.length - 1], vec: lastVec };
                }
                return { point: points[0], vec: { x: 1, y: 0 } };
            },
            // [新增] 等距重取樣 (用於 Lane-based 車道中心線計算)
            resamplePolyline: function (points, numSegments) {
                if (!points || points.length < 2) return points;
                let totalLength = Geom.Utils.getPolylineLength(points);
                if (totalLength === 0) return points;
                let step = totalLength / numSegments;
                let resampled = [points[0]];
                for (let i = 1; i < numSegments; i++) {
                    let result = Geom.Utils.getPointAlongPolyline(points, step * i);
                    if (result && result.point) resampled.push(result.point);
                }
                resampled.push(points[points.length - 1]);
                return resampled;
            },
            // [新增] 計算點 point 到折線 path 的最近點與累積里程 (s)
            getClosestPointOnPathWithDistance: function (path, point) {
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
        }
    };

    function getClosestPointOnPathWithDistance(path, point) {
        return Geom.Utils.getClosestPointOnPathWithDistance(path, point);
    }
    global.getClosestPointOnPathWithDistance = getClosestPointOnPathWithDistance;

    // =================================================================
    // ★★★ [新增] Lane-Based 標線樣式與幾何生成輔助 ★★★
    // =================================================================
    const STROKE_TYPES = {
        'boundary': { color: '#f97316', dash: [], width: 0.1, label: 'Boundary' },
        'yellow_dashed': { color: '#eab308', dash: [3, 3], width: 0.1, label: 'Yellow Dashed' },
        'yellow_double': { color: '#eab308', dual: true, leftDash: [], rightDash: [], width: 0.1, gap: 0.2, label: 'Yellow Double' },
        'yellow_solid_dashed': { color: '#eab308', dual: true, leftDash: [], rightDash: [3, 3], width: 0.1, gap: 0.2, label: 'Yellow Solid/Dash' },
        'yellow_dashed_solid': { color: '#eab308', dual: true, leftDash: [3, 3], rightDash: [], width: 0.1, gap: 0.2, label: 'Yellow Dash/Solid' },
        'white_solid': { color: '#ffffff', dash: [], width: 0.1, label: 'White Solid' },
        'white_dashed': { color: '#ffffff', dash: [3, 3], width: 0.1, label: 'White Dashed' },
        'white_double': { color: '#ffffff', dual: true, leftDash: [], rightDash: [], width: 0.1, gap: 0.2, label: 'White Double' },
        'white_solid_dashed': { color: '#ffffff', dual: true, leftDash: [], rightDash: [3, 3], width: 0.1, gap: 0.2, label: 'White Solid/Dash' },
        'white_dashed_solid': { color: '#ffffff', dual: true, leftDash: [3, 3], rightDash: [], width: 0.1, gap: 0.2, label: 'White Dash/Solid' }
    };

    function getOffsetPolyline(points, offset) {
        if (points.length < 2) return [];
        const newPoints = [];
        for (let i = 0; i < points.length; i++) {
            const p_curr = points[i];
            let normal;
            if (i === 0) {
                normal = Geom.Vec.normalize(Geom.Vec.normal(Geom.Vec.sub(points[1], points[0])));
            } else if (i === points.length - 1) {
                normal = Geom.Vec.normalize(Geom.Vec.normal(Geom.Vec.sub(points[i], points[i - 1])));
            } else {
                const v1 = Geom.Vec.normalize(Geom.Vec.sub(points[i], points[i - 1]));
                const v2 = Geom.Vec.normalize(Geom.Vec.sub(points[i + 1], points[i]));
                const n1 = Geom.Vec.normal(v1);
                const dotProduct = v1.x * v2.x + v1.y * v2.y;
                if (Math.abs(dotProduct) > 0.999) {
                    normal = n1;
                } else {
                    const miterVec = Geom.Vec.normalize(Geom.Vec.add(v1, v2));
                    const miterNormal = Geom.Vec.normal(miterVec);
                    const miterLength = 1 / (miterNormal.x * n1.x + miterNormal.y * n1.y);
                    if (Math.abs(miterLength) > 4) {
                        normal = Geom.Vec.normalize(Geom.Vec.add(n1, Geom.Vec.normal(v2)));
                    } else {
                        normal = Geom.Vec.scale(miterNormal, miterLength);
                    }
                }
            }
            newPoints.push(Geom.Vec.add(p_curr, Geom.Vec.scale(normal, offset)));
        }
        return newPoints;
    }

    class Pathfinder {
        constructor(links, nodes) {
            this.links = links;
            this.nodes = nodes;
            this.adj = new Map();
            for (const linkId in links) {
                const link = links[linkId];
                if (!link.source || link.source === '-1' || link.source === -1) continue;
                if (!this.adj.has(link.source)) this.adj.set(link.source, []);
                this.adj.get(link.source).push({ linkId: link.id, toNode: link.destination });
            }
        }
        findRoute(startNodeId, endNodeId) {
            if (!startNodeId || !endNodeId) return null;
            const q = [[startNodeId, []]];
            const visited = new Set([startNodeId]);
            while (q.length > 0) {
                const [currentNodeId, path] = q.shift();
                if (currentNodeId === endNodeId) return path;
                const neighbors = this.adj.get(currentNodeId) || [];
                for (const neighbor of neighbors) {

                    // ★★★ [新增] 防止 -1 蟲洞現象 ★★★
                    if (neighbor.toNode === '-1' || neighbor.toNode === -1) continue;

                    if (!visited.has(neighbor.toNode)) {
                        visited.add(neighbor.toNode);
                        const newPath = [...path, neighbor.linkId];
                        q.push([neighbor.toNode, newPath]);
                    }
                }
            }
            return null;
        }

        // ★★★ [Milestone 3] 路段至路段全域尋標器 (Link-to-Link Pathfinder) ★★★
        findRouteBetweenLinks(startLinkId, endLinkId) {
            if (!startLinkId || !endLinkId) return null;
            if (startLinkId === endLinkId) return [startLinkId];

            const startLink = this.links ? this.links[startLinkId] : null;
            const endLink = this.links ? this.links[endLinkId] : null;
            if (!startLink || !endLink) return null;

            const isValidNode = (n) => n && n !== '-1' && n !== -1 && (!this.nodes || this.nodes[n]);

            // 1. 若兩路段透過中間合法節點相連，優先呼叫節點級尋標 (排除 -1 虛擬端點)
            if (isValidNode(startLink.destination) && isValidNode(endLink.source)) {
                if (startLink.destination === endLink.source) {
                    return [startLinkId, endLinkId];
                }
                const betweenNodes = this.findRoute(startLink.destination, endLink.source);
                if (betweenNodes !== null) {
                    return [startLinkId, ...betweenNodes, endLinkId];
                }
            }

            // 2. 直接在 Link 圖拓撲上進行廣度優先搜尋 (BFS)
            const q = [[startLinkId]];
            const visited = new Set([startLinkId]);
            while (q.length > 0) {
                const currPath = q.shift();
                const currLinkId = currPath[currPath.length - 1];
                if (currLinkId === endLinkId) return currPath;
                const curL = this.links ? this.links[currLinkId] : null;
                if (!curL || !isValidNode(curL.destination)) continue;
                const neighbors = this.adj.get(curL.destination) || [];
                for (const n of neighbors) {
                    if (n.toNode === '-1' || n.toNode === -1) continue;
                    if (!visited.has(n.linkId)) {
                        visited.add(n.linkId);
                        q.push([...currPath, n.linkId]);
                    }
                }
            }
            return null;
        }
    }

    class TrafficLightController {
        constructor(config) {
            this.nodeId = config.nodeId;
            this.schedule = config.schedule;
            this.lights = config.lights;
            this.timeShift = config.timeShift || 0;
            this.advancedConfig = config.advancedConfig;
            this.allGroupIds = config.allGroupIds || [];
            this.groupNameMap = config.groupNameMap || {}; // ★ 新增：名稱對應表 (例如 "P1" -> "2")
            this.cycleDuration = (this.schedule || []).reduce((sum, p) => sum + p.duration, 0);
            this.turnGroupStates = {};
        }

        update(time) {
            if (typeof isDigitalTwinMode !== "undefined" && isDigitalTwinMode && this.advancedConfig && typeof DigitalTwinLogic !== "undefined") {
                this.turnGroupStates = DigitalTwinLogic.updateTrafficLight(this.advancedConfig, this.allGroupIds);
                return;
            }
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
            // ★ 支援傳入 "P1" 等名稱，自動轉為 "2" 等內部 ID
            const actualId = this.groupNameMap[turnGroupId] || turnGroupId;
            return this.turnGroupStates[actualId] || 'Green';
        }

        getPhaseDetails(time) {
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

        getTimeToNextGreen(time, targetGroupIds) {
            if (this.cycleDuration <= 0 || !targetGroupIds || targetGroupIds.length === 0) return 0;

            // ★ 將傳入的 "P1" 轉換為實際的 "2"
            const actualIds = targetGroupIds.map(id => this.groupNameMap[id] || id);

            const effectiveTime = time - this.timeShift;
            let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration;
            let currentPeriodIndex = 0;
            for (let i = 0; i < this.schedule.length; i++) {
                if (timeInCycle < this.schedule[i].duration) {
                    currentPeriodIndex = i;
                    break;
                }
                timeInCycle -= this.schedule[i].duration;
            }

            const currentPeriod = this.schedule[currentPeriodIndex];
            const isCurrentGreen = actualIds.some(gid => currentPeriod.signals[gid] === 'Green');
            if (isCurrentGreen) return 0;

            let totalWaitTime = currentPeriod.duration - timeInCycle;
            let i = (currentPeriodIndex + 1) % this.schedule.length;
            let safetyCounter = 0;

            while (i !== currentPeriodIndex && safetyCounter < this.schedule.length) {
                const period = this.schedule[i];
                const isGreen = actualIds.some(gid => period.signals[gid] === 'Green');
                if (isGreen) return totalWaitTime;
                totalWaitTime += period.duration;
                i = (i + 1) % this.schedule.length;
                safetyCounter++;
            }
            return totalWaitTime;
        }
        // ★★★ [新增此方法] 專門給行人號誌使用：計算包含綠燈與黃燈(行閃)的總剩餘秒數 ★★★
        getPedestrianRemainingTime(time, groupId) {
            if (this.cycleDuration <= 0 || !groupId) return 0;
            const actualId = this.groupNameMap[groupId] || groupId;
            const effectiveTime = time - this.timeShift;
            let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration;

            let currentPeriodIndex = 0;
            for (let i = 0; i < this.schedule.length; i++) {
                if (timeInCycle < this.schedule[i].duration) {
                    currentPeriodIndex = i;
                    break;
                }
                timeInCycle -= this.schedule[i].duration;
            }

            const currentPeriod = this.schedule[currentPeriodIndex];
            const currentState = currentPeriod.signals[actualId] || 'Green';

            // 如果現在是紅燈，顯示距離下一個綠燈的等待時間
            if (currentState === 'Red') {
                return this.getTimeToNextGreen(time, [groupId]);
            } else {
                // 如果現在是綠燈或行閃(黃)，計算直到變成紅燈前的「總剩餘時間」
                let totalRemaining = currentPeriod.duration - timeInCycle;
                let i = (currentPeriodIndex + 1) % this.schedule.length;
                let safetyCounter = 0;
                while (i !== currentPeriodIndex && safetyCounter < this.schedule.length) {
                    const period = this.schedule[i];
                    const state = period.signals[actualId] || 'Green';
                    if (state === 'Red') break; // 遇到紅燈就停止累加
                    totalRemaining += period.duration;
                    i = (i + 1) % this.schedule.length;
                    safetyCounter++;
                }
                return totalRemaining;
            }
        }

    }

    /**
 * 輔助函數：取得道路最上游（起點處）即存在的合法車道索引
 * 針對 lane-based (stroke-based) 路網，排除下游才產生的附加車道
 */
    function getUpstreamAllowedLanes(link, profile, network) {
        if (!link || !link.lanes) return [];

        const profileId = profile ? (profile.profileId || profile.id) : null;

        return Object.values(link.lanes)
            .filter(l => {
                // 1. 基本車種限制過濾
                if (l.allowedVehicles && l.allowedVehicles.length > 0) {
                    if (!profileId || !l.allowedVehicles.includes(profileId)) {
                        return false;
                    }
                }

                // 2. 針對 Lane-based (Stroke-based) 路段的起點判定
                if (link.geometryType === 'lane-based' && link.strokes) {
                    const leftStroke = link.strokes.find(st => st.id === l.leftStrokeId);
                    const rightStroke = link.strokes.find(st => st.id === l.rightStrokeId);

                    // 判定起點存在門檻值（通常 s_min 在 5.0 公尺或總長 10% 內視為起點車道）
                    const startThreshold = Math.min(5.0, link.length * 0.1);

                    // 如果該車道的左側或右側邊界線是在下游才開始（s_min > 門檻值），代表其為附加車道，排除之
                    if (leftStroke && typeof leftStroke.s_min === 'number' && leftStroke.s_min > startThreshold) {
                        return false;
                    }
                    if (rightStroke && typeof rightStroke.s_min === 'number' && rightStroke.s_min > startThreshold) {
                        return false;
                    }
                }

                return true;
            })
            .map(l => l.index);
    }
    // =================================================================
    // [新增] 偵測器發車器：依據觀測流量產生車輛
    // 請將此類別放在 Simulation 類別之前
    // [修正] 偵測器發車器：依據觀測流量產生車輛 (支援多車種權重)
    // 將原本的 DetectorSpawner 替換或修改為以下內容

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
                    // ★ 使用修正後的輔助函數，過濾出最上游起點即存在的合法車道
                    const allowedLanes = getUpstreamAllowedLanes(startLink, profile, network);

                    if (allowedLanes.length > 0) {
                        startLaneIndex = allowedLanes[Math.floor(Math.random() * allowedLanes.length)];
                    } else {
                        return null; // 若無合適的最上游車道，則跳過此發車
                    }
                }

                // --- 處理停車任務 ---
                let assignedStop = null;
                if (this.currentConfig.stops && this.currentConfig.stops.length > 0) {
                    for (const stop of this.currentConfig.stops) {
                        if (Math.random() * 100 < stop.probability) {
                            assignedStop = { ...stop };
                            break;
                        }
                    }
                }

                const v = new Vehicle(vehicleId, profile, route, network, startLaneIndex);
                if (assignedStop) {
                    v.assignParkingTask(assignedStop, network);
                }
                return v;
            }
            return null;
        }
        chooseWithWeight(items) { if (!items || items.length === 0) return null; const totalWeight = items.reduce((sum, item) => sum + item.weight, 0); if (totalWeight <= 0) return items[0]; let random = Math.random() * totalWeight; for (const item of items) { random -= item.weight; if (random <= 0) return item; } return items[items.length - 1]; }
    }


    class DetectorSpawner {
        constructor(meter, network) {
            this.linkId = meter.linkId;
            this.meterId = meter.id;
            this.meterName = meter.name; // ★ 記錄 XML 中的 <tm:name> (例如 V014940)

            // 換算流量：輛/小時 -> 發車間隔(秒)
            this.interval = meter.observedFlow > 0 ? 3600 / meter.observedFlow : Infinity;
            this.spawnTimer = 0;

            this.spawnProfiles = meter.spawnProfiles || [];

            if (this.spawnProfiles.length === 0) {
                const fallbackId = meter.spawnProfileId || 'default';
                this.spawnProfiles.push({ profileId: fallbackId, weight: 1 });
            }
        }

        // ★★★ 新增：供外部 API 動態更新流量與權重的方法 ★★★
        updateData(hourlyFlow, newProfiles) {
            // 更新發車間隔
            this.interval = hourlyFlow > 0 ? 3600 / hourlyFlow : Infinity;

            // 更新車種權重
            if (newProfiles && newProfiles.length > 0) {
                this.spawnProfiles = newProfiles;
            }
        }

        update(dt, network, vehicleIdGenerator) {
            if (this.interval === Infinity) return null;

            this.spawnTimer += dt;
            if (this.spawnTimer >= this.interval) {
                this.spawnTimer -= this.interval;

                const link = network.links[this.linkId];
                if (!link) return null;

                const chosenProfileEntry = this.chooseWithWeight(this.spawnProfiles);
                if (!chosenProfileEntry) return null;

                const profile = network.vehicleProfiles[chosenProfileEntry.profileId];
                if (!profile) return null;

                // ★ 使用修正後的輔助函數，確保車輛產生於最上游既存車道
                const allowedLanes = getUpstreamAllowedLanes(link, profile, network);

                if (allowedLanes.length === 0) return null; // 無合法車道，放棄生成

                const laneIndex = allowedLanes[Math.floor(Math.random() * allowedLanes.length)];
                const vehicleId = `v-flow-${vehicleIdGenerator()}`;

                return new Vehicle(vehicleId, profile, [this.linkId], network, laneIndex);
            }
            return null;
        }

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


    // =================================================================
    // ★★★ [Milestone 3] 土地使用與交通整合旅次需求生成引擎 (LUTI Engine) ★★★
    // 實作都市規劃經典四階段模式 (Four-Step Model)：
    // 1. 人口與就業推估 (Socio-Economic Engine)
    // 2. 旅次產生與吸引推估 (Trip Generation Engine)
    // 3. 雙約束重力模式與 Furness IPF 配平 (Trip Distribution Engine)
    // 4. MNL 運具分配模式與卜瓦松微觀抽樣 (Mode Split & Downscaled Micro-Injection)
    // =================================================================

    class LUTIEngine {
        constructor(simulation, network) {
            this.simulation = simulation;
            this.network = network;
            this.zones = network.zones || {};
            this.timePeriod = 'AM'; // 'AM', 'OFF', 'PM'
            this.timeOfDay = 8.0;   // 0.0 ~ 24.0 小時 (預設 AM 尖峰 08:00)
            this.is24hDynamic = false;
            this.speedMultiplier24h = 30; // 預設 30 倍速動態演繹
            this.diurnalMultiplier = 1.0;
            this.showHeatmap = false;
            let defaultScale = 1.0;
            if (typeof document !== 'undefined') {
                const scaleSel = document.getElementById('lutiScaleFactorSelector');
                if (scaleSel && scaleSel.value) defaultScale = parseFloat(scaleSel.value) || 1.0;
            }
            this.scaleFactor = defaultScale;
            this.routeCache = new Map();
            this.odPairs = [];
            this.missingODs = [];
            this.generatedVehiclesCount = 0;
            this.initialBurstDone = false;

            this.stats = {
                totalPop: 0,
                totalEmp: 0,
                totalGFA: 0,
                totalProduction: 0,
                totalAttraction: 0,
                hourlyAutoTrips: 0,
                hourlyMotoTrips: 0,
                hourlyWalkTrips: 0,
                autoShare: 0,
                motoShare: 0,
                walkShare: 0,
                routableVehTrips: 0,
                unroutableVehTrips: 0,
                totalDemandVehTrips: 0,
                connectivityRate: 1.0
            };

            this.ensureVehicleProfiles();
            this.autoConnectZones();
            this.recalculate();
        }

        /**
         * 確保路網中存在 LUTI 專屬的小客車與機車 Profile
         */
        ensureVehicleProfiles() {
            if (!this.network.vehicleProfiles) {
                this.network.vehicleProfiles = {};
            }

            // 1. 小客車 Profile (Car)
            if (!this.network.vehicleProfiles['luti_car']) {
                this.network.vehicleProfiles['luti_car'] = {
                    id: 'luti_car',
                    length: 4.6,
                    width: 1.8,
                    params: {
                        maxSpeed: 15.0, // ~54 km/h
                        maxAcceleration: 2.5,
                        comfortDeceleration: 3.0,
                        minDistance: 2.0,
                        desiredHeadwayTime: 1.2
                    }
                };
            }

            // 2. 機車 Profile (Motorcycle) - width < 1.2 觸發機車動力學與外觀
            if (!this.network.vehicleProfiles['luti_moto']) {
                this.network.vehicleProfiles['luti_moto'] = {
                    id: 'luti_moto',
                    length: 2.0,
                    width: 0.8,
                    params: {
                        maxSpeed: 14.0, // ~50 km/h
                        maxAcceleration: 3.5,
                        comfortDeceleration: 3.5,
                        minDistance: 1.0,
                        desiredHeadwayTime: 0.8
                    }
                };
            }
        }

        /**
         * 計算多邊形面積 (m²)
         */
        calculatePolygonArea(pts) {
            if (!pts || pts.length < 3) return 1000;
            let area = 0;
            for (let i = 0; i < pts.length; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % pts.length];
                area += (p1.x * p2.y - p2.x * p1.y);
            }
            return Math.max(100, Math.abs(area * 0.5));
        }

        /**
         * 計算平均綠覆率 (%)
         */
        calculateGreenCoverage() {
            let totalSiteArea = 0;
            let totalGreenArea = 0;
            for (const zId in this.zones) {
                const z = this.zones[zId];
                const area = this.calculatePolygonArea(z.boundary);
                const bcr = (z.bcr !== undefined && z.bcr !== null) ? z.bcr : 0.5;
                const greenRatio = (z.zoneType === 'P') ? 0.95 : Math.max(0.05, 1.0 - bcr);
                totalSiteArea += area;
                totalGreenArea += area * greenRatio;
            }
            return totalSiteArea > 0 ? ((totalGreenArea / totalSiteArea) * 100) : 35.0;
        }

        /**
         * 24小時都市標準時段係數 (Diurnal Curve)
         */
        getDiurnalFactor(hour) {
            hour = (hour % 24 + 24) % 24;
            const profile = [
                { h: 0, f: 0.06 }, { h: 5, f: 0.08 }, { h: 6, f: 0.35 },
                { h: 7, f: 0.75 }, { h: 8, f: 1.00 }, { h: 9, f: 0.80 },
                { h: 10, f: 0.48 }, { h: 12, f: 0.52 }, { h: 14, f: 0.45 },
                { h: 16, f: 0.65 }, { h: 17, f: 0.90 }, { h: 18, f: 1.00 },
                { h: 19, f: 0.75 }, { h: 21, f: 0.38 }, { h: 22, f: 0.18 },
                { h: 24, f: 0.06 }
            ];
            for (let i = 0; i < profile.length - 1; i++) {
                if (hour >= profile[i].h && hour <= profile[i + 1].h) {
                    const t = (hour - profile[i].h) / (profile[i + 1].h - profile[i].h);
                    return profile[i].f + t * (profile[i + 1].f - profile[i].f);
                }
            }
            return 0.5;
        }

        /**
         * 設定 24 小時連續時鐘時刻 (hour: 0.0 ~ 24.0)
         */
        setTimeOfDay(hour, autoAdjustVisual = true) {
            hour = (hour % 24 + 24) % 24;
            this.timeOfDay = hour;
            this.diurnalMultiplier = this.getDiurnalFactor(hour);

            let newPeriod = 'OFF';
            if (hour >= 6.5 && hour < 10.5) newPeriod = 'AM';
            else if (hour >= 10.5 && hour < 16.0) newPeriod = 'OFF';
            else if (hour >= 16.0 && hour < 20.0) newPeriod = 'PM';
            else newPeriod = 'OFF';

            if (newPeriod !== this.timePeriod) {
                this.setTimePeriod(newPeriod, false);
            } else {
                for (const od of this.odPairs) {
                    let lambda = ((od.hourlyVehTrips * this.scaleFactor) / 3600) * this.diurnalMultiplier;
                    if (od.hourlyVehTrips >= 30 && lambda < 0.04) {
                        lambda = Math.max(lambda, 0.04 * this.diurnalMultiplier);
                    }
                    od.lambda = lambda;
                }
            }

            if (this.simulation && this.simulation.pedManager && typeof this.simulation.pedManager.updateLUTIVolumes === 'function') {
                this.simulation.pedManager.updateLUTIVolumes(this.stats.hourlyWalkTrips, this.timePeriod, this.diurnalMultiplier);
            }

            if (autoAdjustVisual && (typeof window !== 'undefined' ? window.Visual3D : null) && typeof Visual3D.setLightingTimeOfDay === 'function') {
                Visual3D.setLightingTimeOfDay(hour);
            }
        }

        /**
         * 切換時段 (AM / OFF / PM)
         */
        setTimePeriod(period, adjustHour = true) {
            const validPeriods = ['AM', 'OFF', 'PM'];
            if (!validPeriods.includes(period)) period = 'AM';
            this.timePeriod = period;

            if (adjustHour) {
                if (period === 'AM') this.timeOfDay = 8.0;
                else if (period === 'OFF') this.timeOfDay = 13.5;
                else if (period === 'PM') this.timeOfDay = 17.8;
                this.diurnalMultiplier = this.getDiurnalFactor(this.timeOfDay);

                if ((typeof window !== 'undefined' ? window.Visual3D : null) && typeof Visual3D.setLightingPeriod === 'function') {
                    Visual3D.setLightingPeriod(period);
                }
            }

            this.recalculate();

            const sel = (typeof document !== 'undefined') ? document.getElementById('lutiPeriodSelector') : null;
            if (sel && sel.value !== period) {
                sel.value = period;
            }

            if ((typeof window !== 'undefined' ? window.lutiHudController : null)) {
                (typeof window !== 'undefined' ? window.lutiHudController : null).updatePeriodButtons(period);
            }
        }

        /**
         * 動態調整微觀發車抽樣尺度 (Scale Factor)
         */
        setScaleFactor(factor) {
            this.scaleFactor = Math.max(0.01, Math.min(1.0, factor));
            for (const od of this.odPairs) {
                let lambda = ((od.hourlyVehTrips * this.scaleFactor) / 3600) * (this.diurnalMultiplier || 1.0);
                if (od.hourlyVehTrips >= 30 && lambda < 0.04) {
                    lambda = Math.max(lambda, 0.04 * (this.diurnalMultiplier || 1.0));
                }
                od.lambda = lambda;
            }
            console.log(`[LUTIEngine] 車流抽樣尺度已調整為 ${(this.scaleFactor * 100).toFixed(0)}%`);
        }

        /**
         * 若分區未指定聯絡道，自動以邊界垂足投影建立形心聯絡道 (Auto Connect)
         */
        autoConnectZones() {
            if (!this.network.links || Object.keys(this.network.links).length === 0) return;

            Object.values(this.zones).forEach(zone => {
                const boundary = zone.boundary || [];
                let cx = 0, cy = 0;
                if (boundary.length > 0) {
                    boundary.forEach(p => { cx += p.x; cy += p.y; });
                    cx /= boundary.length;
                    cy /= boundary.length;
                }

                if (zone.accessNodes && zone.accessNodes.length > 0) {
                    let hasValid = false;
                    zone.accessNodes.forEach(c => {
                        if (this.network.links[c.linkId]) {
                            hasValid = true;
                            const lk = this.network.links[c.linkId];
                            const pts = lk.waypoints || lk.centerline || [];
                            if (pts.length > 0) {
                                const ratio = (c.offsetRatio !== undefined) ? c.offsetRatio : 0.5;
                                const idx = Math.min(pts.length - 1, Math.floor(ratio * (pts.length - 1)));
                                c.roadPoint = pts[idx];
                            }
                            if (!c.accessPoint || (c.accessPoint.x === 0 && c.accessPoint.y === 0 && (cx !== 0 || cy !== 0))) {
                                c.accessPoint = { x: cx, y: cy };
                            }
                        }
                    });
                    if (hasValid) return; // 已有合法聯絡道
                }

                if (boundary.length < 3) return;

                // 搜尋 300m 範圍內最近路段 (可連結至多 2 條不同路段，支援雙向幹道路網)
                const candidates = [];
                Object.values(this.network.links).forEach(link => {
                    const pts = link.waypoints || link.centerline || [];
                    if (pts.length < 2) return;

                    let linkMinDist = Infinity;
                    let bestProjDist = 0;
                    let bestAccessPt = { x: cx, y: cy };
                    let bestRoadPt = null;

                    for (let i = 0; i < boundary.length; i++) {
                        const p1 = boundary[i];
                        const p2 = boundary[(i + 1) % boundary.length];
                        for (let t = 0; t <= 1; t += 0.25) {
                            const bp = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
                            const proj = getClosestPointOnPathWithDistance(pts, bp);
                            if (proj && proj.dist < linkMinDist) {
                                linkMinDist = proj.dist;
                                bestProjDist = proj.s;
                                bestAccessPt = bp;
                                bestRoadPt = { x: proj.x, y: proj.y };
                            }
                        }
                    }

                    if (linkMinDist <= 300) {
                        const linkLen = link.length || 100;
                        const offsetRatio = Math.max(0, Math.min(1, bestProjDist / Math.max(0.001, linkLen)));
                        candidates.push({
                            link,
                            dist: linkMinDist,
                            offsetRatio,
                            accessPoint: bestAccessPt,
                            roadPoint: bestRoadPt
                        });
                    }
                });

                candidates.sort((a, b) => a.dist - b.dist);
                if (candidates.length > 0) {
                    zone.accessNodes = candidates.slice(0, 2).map((cand, idx) => ({
                        id: `conn_${zone.id}_auto_${idx}`,
                        linkId: cand.link.id,
                        offsetRatio: cand.offsetRatio,
                        gateType: 'bidirectional',
                        accessPoint: cand.accessPoint,
                        roadPoint: cand.roadPoint
                    }));
                }
            });
        }

        /**
         * 1. 旅次產生與吸引推估 (Trip Generation Engine)
         */
        calculateTripGeneration(zones, timePeriod) {
            const P = {};
            const A = {};
            const socio = {};

            let totalPop = 0;
            let totalEmp = 0;
            let totalGFA = 0;
            let totalP = 0;
            let totalA = 0;

            Object.values(zones).forEach(zone => {
                const zId = zone.id;
                const boundary = zone.boundary || [];
                const siteArea = this.calculatePolygonArea(boundary);
                const bcr = (zone.bcr !== undefined && zone.bcr !== null && !isNaN(zone.bcr)) ? zone.bcr : 0.5;
                const far = (zone.far !== undefined && zone.far !== null && !isNaN(zone.far)) ? zone.far : 1.2;
                const gfa = siteArea * far;
                totalGFA += gfa;

                const zType = zone.zoneType || 'R1';
                const cat = zType[0];

                let pop = 0;
                let emp = 0;

                if (cat === 'R') {
                    const uRes = (zType === 'R1') ? 35 : ((zType === 'R3') ? 25 : 30);
                    pop = (zone.customPop !== null && zone.customPop !== undefined && !isNaN(zone.customPop))
                        ? zone.customPop : Math.round((gfa * 0.85) / uRes);
                } else if (zType === 'C1') {
                    emp = (zone.customEmp !== null && zone.customEmp !== undefined && !isNaN(zone.customEmp))
                        ? zone.customEmp : Math.round((gfa * 0.80) / 25);
                } else if (zType === 'C2') {
                    emp = (zone.customEmp !== null && zone.customEmp !== undefined && !isNaN(zone.customEmp))
                        ? zone.customEmp : Math.round((gfa * 0.80) / 18);
                } else if (zType === 'C3') {
                    emp = (zone.customEmp !== null && zone.customEmp !== undefined && !isNaN(zone.customEmp))
                        ? zone.customEmp : Math.round((gfa * 0.80) / 30);
                } else if (cat === 'I') {
                    emp = (zone.customEmp !== null && zone.customEmp !== undefined && !isNaN(zone.customEmp))
                        ? zone.customEmp : Math.round((gfa * 0.80) / 40);
                } else if (zType === 'G1') {
                    pop = (zone.customPop !== null && zone.customPop !== undefined && !isNaN(zone.customPop))
                        ? zone.customPop : Math.round((gfa * 0.85) / 15);
                } else if (zType === 'G2') {
                    emp = (zone.customEmp !== null && zone.customEmp !== undefined && !isNaN(zone.customEmp))
                        ? zone.customEmp : Math.round((gfa * 0.80) / 22);
                }

                totalPop += pop;
                totalEmp += emp;
                socio[zId] = { siteArea, gfa, bcr, far, pop, emp };

                let pi = 0, ai = 0;
                if (cat === 'R') {
                    const base = pop;
                    let alpha = 0.45, splitP = 0.85;
                    if (timePeriod === 'PM') { alpha = 0.50; splitP = 0.20; }
                    else if (timePeriod === 'OFF') { alpha = 0.12; splitP = 0.50; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                } else if (zType === 'C2') {
                    const base = emp;
                    let alpha = 0.65, splitP = 0.10;
                    if (timePeriod === 'PM') { alpha = 0.70; splitP = 0.85; }
                    else if (timePeriod === 'OFF') { alpha = 0.15; splitP = 0.45; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                } else if (zType === 'C1') {
                    const base = emp;
                    let alpha = 0.40, splitP = 0.30;
                    if (timePeriod === 'PM') { alpha = 0.60; splitP = 0.60; }
                    else if (timePeriod === 'OFF') { alpha = 0.15; splitP = 0.50; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                } else if (zType === 'C3') {
                    const base = gfa / 100;
                    let alpha = 1.20, splitP = 0.30;
                    if (timePeriod === 'PM') { alpha = 3.50; splitP = 0.45; }
                    else if (timePeriod === 'OFF') { alpha = 1.80; splitP = 0.50; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                } else if (cat === 'I') {
                    const base = emp;
                    let alpha = 0.55, splitP = 0.15;
                    if (timePeriod === 'PM') { alpha = 0.60; splitP = 0.85; }
                    else if (timePeriod === 'OFF') { alpha = 0.12; splitP = 0.50; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                } else if (zType === 'G1') {
                    const base = pop;
                    let alpha = 0.80, splitP = 0.15;
                    if (timePeriod === 'PM') { alpha = 0.75; splitP = 0.85; }
                    else if (timePeriod === 'OFF') { alpha = 0.05; splitP = 0.50; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                } else if (zType === 'G2') {
                    const base = emp;
                    let alpha = 0.50, splitP = 0.25;
                    if (timePeriod === 'PM') { alpha = 0.50; splitP = 0.70; }
                    else if (timePeriod === 'OFF') { alpha = 0.10; splitP = 0.50; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                } else if (cat === 'P') {
                    const base = gfa / 100;
                    let alpha = 0.05, splitP = 0.50;
                    if (timePeriod === 'PM') { alpha = 0.10; splitP = 0.50; }
                    else if (timePeriod === 'OFF') { alpha = 0.08; splitP = 0.50; }
                    const trips = base * alpha;
                    pi = Math.round(trips * splitP);
                    ai = Math.round(trips * (1 - splitP));
                }

                P[zId] = Math.max(1, pi);
                A[zId] = Math.max(1, ai);
                totalP += P[zId];
                totalA += A[zId];
            });

            this.stats.totalPop = totalPop;
            this.stats.totalEmp = totalEmp;
            this.stats.totalGFA = totalGFA;
            this.stats.totalProduction = totalP;
            this.stats.totalAttraction = totalA;

            return { P, A, socio };
        }

        /**
         * 2. 雙約束重力模式與 Furness IPF 配平
         */
        calculateTripDistribution(zones, P, A) {
            const zoneIds = Object.keys(zones);
            const distances = {};
            const centroids = {};

            zoneIds.forEach(id => {
                const b = zones[id].boundary || [];
                let cx = 0, cy = 0;
                b.forEach(p => { cx += p.x; cy += p.y; });
                cx = b.length > 0 ? cx / b.length : 0;
                cy = b.length > 0 ? cy / b.length : 0;
                centroids[id] = { x: cx, y: cy };
            });

            zoneIds.forEach(i => {
                distances[i] = {};
                zoneIds.forEach(j => {
                    if (i === j) {
                        const area = this.calculatePolygonArea(zones[i].boundary);
                        distances[i][j] = 0.5 * Math.sqrt(area / Math.PI);
                    } else {
                        const c1 = centroids[i];
                        const c2 = centroids[j];
                        distances[i][j] = Math.max(20, Math.hypot(c1.x - c2.x, c1.y - c2.y));
                    }
                });
            });

            const beta = 0.003;
            const T = {};
            zoneIds.forEach(i => {
                T[i] = {};
                zoneIds.forEach(j => {
                    const dist = distances[i][j];
                    T[i][j] = (P[i] || 1) * (A[j] || 1) * Math.exp(-beta * dist);
                });
            });

            const sumP = zoneIds.reduce((sum, id) => sum + (P[id] || 0), 0);
            const sumA = zoneIds.reduce((sum, id) => sum + (A[id] || 0), 0);
            const targetA = {};
            if (sumA > 0 && sumP > 0) {
                const aFactor = sumP / sumA;
                zoneIds.forEach(id => { targetA[id] = (A[id] || 0) * aFactor; });
            } else {
                zoneIds.forEach(id => { targetA[id] = A[id] || 0; });
            }

            for (let iter = 0; iter < 5; iter++) {
                zoneIds.forEach(i => {
                    let rSum = 0;
                    zoneIds.forEach(j => { rSum += T[i][j]; });
                    if (rSum > 1e-4) {
                        const rFactor = (P[i] || 0) / rSum;
                        zoneIds.forEach(j => { T[i][j] *= rFactor; });
                    }
                });

                zoneIds.forEach(j => {
                    let cSum = 0;
                    zoneIds.forEach(i => { cSum += T[i][j]; });
                    if (cSum > 1e-4) {
                        const cFactor = (targetA[j] || 0) / cSum;
                        zoneIds.forEach(i => { T[i][j] *= cFactor; });
                    }
                });
            }

            return { ODMatrix: T, distances };
        }

        /**
         * 3. 運具分配模式與微觀抽樣
         */
        applyModeSplitAndDownscaling(ODMatrix, distances) {
            const zoneIds = Object.keys(this.zones);
            const odPairs = [];
            const missingODs = [];
            let routableVehTrips = 0;
            let unroutableVehTrips = 0;

            let totalAuto = 0;
            let totalMoto = 0;
            let totalWalk = 0;

            zoneIds.forEach(i => {
                zoneIds.forEach(j => {
                    const tij = ODMatrix[i][j] || 0;
                    const d = distances[i][j] || 100;

                    const vWalk = 2.5 - 0.006 * d - 0.02 * Math.max(0, d - 600);
                    const vMoto = 0.8 - 0.0018 * d + 0.5;
                    const vAuto = 0.0 - 0.0012 * d + 0.8;

                    const maxV = Math.max(vWalk, vMoto, vAuto);
                    const eW = Math.exp(vWalk - maxV);
                    const eM = Math.exp(vMoto - maxV);
                    const eA = Math.exp(vAuto - maxV);
                    const sumE = eW + eM + eA;

                    const sWalk = eW / sumE;
                    const sMoto = eM / sumE;
                    const sAuto = eA / sumE;

                    const tAuto = tij * sAuto;
                    const tMoto = tij * sMoto;
                    const tWalk = tij * sWalk;
                    const tVeh = tAuto + tMoto;

                    totalAuto += tAuto;
                    totalMoto += tMoto;
                    totalWalk += tWalk;

                    if (i !== j && tVeh > 0) {
                        const zOrigin = this.zones[i];
                        const zDest = this.zones[j];

                        const originConns = (zOrigin.accessNodes && zOrigin.accessNodes.length > 0) ? zOrigin.accessNodes : [];
                        const destConns = (zDest.accessNodes && zDest.accessNodes.length > 0) ? zDest.accessNodes : [];

                        let bestRoute = null;
                        let bestConnO = null;
                        let bestConnD = null;
                        let sameLinkReverse = false;

                        for (const cO of originConns) {
                            if (!this.network.links[cO.linkId]) continue;
                            for (const cD of destConns) {
                                if (!this.network.links[cD.linkId]) continue;
                                if (cO.linkId === cD.linkId) {
                                    const oRatio = (cO.offsetRatio !== undefined) ? cO.offsetRatio : 0;
                                    const dRatio = (cD.offsetRatio !== undefined) ? cD.offsetRatio : 1;
                                    if (oRatio >= dRatio) {
                                        sameLinkReverse = true;
                                        continue;
                                    }
                                }
                                const r = this.getRoute(cO.linkId, cD.linkId);
                                if (r && r.length > 0) {
                                    bestRoute = r;
                                    bestConnO = cO;
                                    bestConnD = cD;
                                    break;
                                }
                            }
                            if (bestRoute) break;
                        }

                        if (bestRoute && bestConnO && bestConnD) {
                            const connO = bestConnO;
                            const connD = bestConnD;

                            // 微觀注入率 lambda (Vehicles/sec) = (T_Veh * Phi) / 3600 * diurnalMultiplier
                            let lambda = ((tVeh * this.scaleFactor) / 3600) * (this.diurnalMultiplier || 1.0);
                            // 小型沙盒保護：主要通道至少維持每 15~25 秒有一輛車進入路網，避免畫面長時間冷清
                            if (tVeh >= 30 && lambda < 0.04) {
                                lambda = Math.max(lambda, 0.04 * (this.diurnalMultiplier || 1.0));
                            }
                            const pAuto = sAuto / (sAuto + sMoto + 1e-6);

                            odPairs.push({
                                fromZoneId: i,
                                toZoneId: j,
                                originLink: connO.linkId,
                                destLink: connD.linkId,
                                originConnector: connO,
                                destConnector: connD,
                                route: bestRoute,
                                lambda: lambda,
                                pAuto: pAuto,
                                hourlyVehTrips: tVeh,
                                hourlyAuto: tAuto,
                                hourlyMoto: tMoto,
                                hourlyWalk: tWalk,
                                distance: d
                            });
                            routableVehTrips += tVeh;
                        } else {
                            unroutableVehTrips += tVeh;
                            const oLinkStr = originConns.map(c => c.linkId).join(', ') || '無聯絡道';
                            const dLinkStr = destConns.map(c => c.linkId).join(', ') || '無聯絡道';
                            let reason = '出發與迄點路段間無可行行車路徑 (缺少路口轉向線或單行道阻隔)';
                            if (originConns.length === 0) reason = '出發分區未接上路網 (300m內無道路或未配置聯絡道)';
                            else if (destConns.length === 0) reason = '迄點分區未接上路網 (300m內無道路或未配置聯絡道)';
                            else if (sameLinkReverse) reason = '起迄位於同向單行路段且迄點在上游 (無法逆行且無下游迴轉道)';

                            missingODs.push({
                                fromZoneId: i,
                                fromZoneName: zOrigin.name || i,
                                fromZoneType: zOrigin.zoneType || 'R1',
                                toZoneId: j,
                                toZoneName: zDest.name || j,
                                toZoneType: zDest.zoneType || 'C1',
                                hourlyVehTrips: Math.round(tVeh),
                                hourlyAuto: Math.round(tAuto),
                                hourlyMoto: Math.round(tMoto),
                                hourlyWalk: Math.round(tWalk),
                                originLinks: oLinkStr,
                                destLinks: dLinkStr,
                                reason: reason
                            });
                        }
                    }
                });
            });

            this.odPairs = odPairs;
            this.missingODs = missingODs;
            const totalVeh = totalAuto + totalMoto + totalWalk;
            this.stats.hourlyAutoTrips = totalAuto;
            this.stats.hourlyMotoTrips = totalMoto;
            this.stats.hourlyWalkTrips = totalWalk;
            this.stats.autoShare = totalVeh > 0 ? (totalAuto / totalVeh) : 0;
            this.stats.motoShare = totalVeh > 0 ? (totalMoto / totalVeh) : 0;
            this.stats.walkShare = totalVeh > 0 ? (totalWalk / totalVeh) : 0;
            this.stats.routableVehTrips = Math.round(routableVehTrips);
            this.stats.unroutableVehTrips = Math.round(unroutableVehTrips);
            this.stats.totalDemandVehTrips = Math.round(routableVehTrips + unroutableVehTrips);
            this.stats.connectivityRate = (routableVehTrips + unroutableVehTrips > 0)
                ? (routableVehTrips / (routableVehTrips + unroutableVehTrips))
                : 1.0;

            console.log(`[LUTIEngine] 重算完成 (${this.timePeriod}): 活躍 OD 通道數=${odPairs.length}, 預估小時車流=${Math.round(totalAuto + totalMoto)} 輛/h (汽車 ${(this.stats.autoShare*100).toFixed(0)}%, 機車 ${(this.stats.motoShare*100).toFixed(0)}%)`);
            if (missingODs.length > 0) {
                console.warn(`[LUTIEngine] ⚠️ 警告：偵測到 ${missingODs.length} 組 OD 路徑短缺，共 ${Math.round(unroutableVehTrips)} 輛/h 車流無法進入路網！`);
            }
        }

        /**
         * 重新計算全套 LUTI 模型
         */
        recalculate() {
            this.routeCache.clear();
            const { P, A } = this.calculateTripGeneration(this.zones, this.timePeriod);
            const { ODMatrix, distances } = this.calculateTripDistribution(this.zones, P, A);
            this.applyModeSplitAndDownscaling(ODMatrix, distances);
            this.initialBurstDone = false;

            if (this.simulation && this.simulation.pedManager && typeof this.simulation.pedManager.updateLUTIVolumes === 'function') {
                this.simulation.pedManager.updateLUTIVolumes(this.stats.hourlyWalkTrips, this.timePeriod, this.diurnalMultiplier);
            }
        }

        /**
         * 檢查產生點之車道安全車距
         */
        isLaneClear(network, linkId, laneIndex, targetDist, safeBuffer = 6.0) {
            if (!this.simulation || !this.simulation.vehicles) return true;
            for (const v of this.simulation.vehicles) {
                if (v.currentLinkId === linkId && v.currentLaneIndex === laneIndex && v.state === 'onLink') {
                    if (Math.abs(v.distanceOnPath - targetDist) < safeBuffer) {
                        return false;
                    }
                }
            }
            return true;
        }

        /**
         * 取得或計算兩路段間的行車路徑
         */
        getRoute(originLinkId, destLinkId) {
            const key = `${originLinkId}->${destLinkId}`;
            if (this.routeCache.has(key)) {
                return this.routeCache.get(key);
            }
            if (!this.network.pathfinder) return null;
            const route = this.network.pathfinder.findRouteBetweenLinks(originLinkId, destLinkId);
            this.routeCache.set(key, route);
            return route;
        }

        /**
         * 每一模擬幀更新
         */
        update(dt, network, vehicleIdGenerator) {
            if (this.is24hDynamic) {
                const spd = this.speedMultiplier24h || 30;
                this.timeOfDay = (this.timeOfDay + (dt * spd / 3600)) % 24;
                this.setTimeOfDay(this.timeOfDay, true);
            }

            if (!this.odPairs || this.odPairs.length === 0) return [];
            const spawnedVehicles = [];

            if (!this.initialBurstDone) {
                this.initialBurstDone = true;
                for (const od of this.odPairs) {
                    if (od.lambda <= 0) continue;
                    // 開局預熱：主幹道依長度在出發路段散布 3~4 輛車，次要道散布 1~2 輛車
                    const burstCount = od.hourlyVehTrips > 80 ? 3 : (od.hourlyVehTrips > 15 ? 2 : 1);
                    for (let k = 0; k < burstCount; k++) {
                        const v = this.spawnVehicleForOD(od, network, vehicleIdGenerator, k * 28.0);
                        if (v) spawnedVehicles.push(v);
                    }
                }
            }

            for (const od of this.odPairs) {
                if (od.lambda <= 0) continue;
                const pSpawn = 1 - Math.exp(-od.lambda * dt);
                if (Math.random() < pSpawn) {
                    const v = this.spawnVehicleForOD(od, network, vehicleIdGenerator);
                    if (v) spawnedVehicles.push(v);
                }
            }

            return spawnedVehicles;
        }

        /**
         * 為指定 OD 建立並實體化一輛微觀車輛
         */
        spawnVehicleForOD(od, network, vehicleIdGenerator, offsetBonus = 0) {
            const route = od.route || this.getRoute(od.originLink, od.destLink);
            if (!route || route.length === 0) return null;

            const startLink = network.links[od.originLink];
            if (!startLink) return null;

            const isAuto = Math.random() < od.pAuto;
            const profileId = isAuto ? 'luti_car' : 'luti_moto';
            const profile = network.vehicleProfiles[profileId] || network.vehicleProfiles['default'];
            if (!profile) return null;

            const allowedLanes = getUpstreamAllowedLanes(startLink, profile, network);
            if (allowedLanes.length === 0) return null;
            const laneIndex = allowedLanes[Math.floor(Math.random() * allowedLanes.length)];

            const linkLen = startLink.length || 100;
            const baseDist = (od.originConnector.offsetRatio !== undefined ? od.originConnector.offsetRatio : 0) * linkLen;
            const targetDist = baseDist + offsetBonus;
            const safeDist = Math.max(0, Math.min(targetDist, Math.max(0, linkLen - 12)));

            const safeBuffer = isAuto ? 7.0 : 4.0;
            if (!this.isLaneClear(network, od.originLink, laneIndex, safeDist, safeBuffer)) {
                return null;
            }

            const vehicleId = `v-luti-${vehicleIdGenerator()}`;
            const initSpeed = Math.min(7.0, (profile.params.maxSpeed || 15) * 0.5);

            const vehicle = new Vehicle(
                vehicleId,
                profile,
                [...route],
                network,
                laneIndex,
                { speed: initSpeed, distanceOnPath: safeDist }
            );

            vehicle.lutiOriginZone = od.fromZoneId;
            vehicle.lutiDestZone = od.toZoneId;

            const destLink = network.links[od.destLink];
            if (destLink) {
                const destLen = destLink.length || 100;
                const destOffset = (od.destConnector.offsetRatio !== undefined ? od.destConnector.offsetRatio : 0.8) * destLen;
                vehicle.destConnectorDist = Math.max(10, Math.min(destOffset, destLen - 5));
            }

            this.generatedVehiclesCount++;
            return vehicle;
        }

        /**
         * ★★★ [Milestone 4] 全域與各路段道路服務水準 (LOS A ~ F) 評估 ★★★
         */
        calculateNetworkLOS() {
            let totalSpeed = 0;
            let count = 0;
            const linkStats = {};

            if (this.simulation && this.simulation.vehicles) {
                for (const v of this.simulation.vehicles) {
                    if (v.state === 'onLink' || v.state === 'inIntersection') {
                        const spdKmh = Math.max(0, (v.speed || 0) * 3.6);
                        totalSpeed += spdKmh;
                        count++;
                        if (v.currentLinkId) {
                            if (!linkStats[v.currentLinkId]) {
                                linkStats[v.currentLinkId] = { totalSpd: 0, vehCount: 0 };
                            }
                            linkStats[v.currentLinkId].totalSpd += spdKmh;
                            linkStats[v.currentLinkId].vehCount++;
                        }
                    }
                }
            }

            const totalDemand = (this.stats.totalProduction + this.stats.totalAttraction) * (this.diurnalMultiplier || 1.0);
            let avgSpeed = 42.0;
            if (count > 0) {
                avgSpeed = totalSpeed / count;
            } else {
                if (totalDemand > 12000) avgSpeed = 11.5;
                else if (totalDemand > 8000) avgSpeed = 16.5;
                else if (totalDemand > 5000) avgSpeed = 24.0;
                else if (totalDemand > 3000) avgSpeed = 33.0;
                else avgSpeed = 42.0;
            }

            let overallLOS = 'A';
            if (avgSpeed >= 40.0) overallLOS = 'A';
            else if (avgSpeed >= 32.0) overallLOS = 'B';
            else if (avgSpeed >= 24.0) overallLOS = 'C';
            else if (avgSpeed >= 18.0) overallLOS = 'D';
            else if (avgSpeed >= 12.0) overallLOS = 'E';
            else overallLOS = 'F';

            const bottleneckLinks = [];
            if (this.network && this.network.links) {
                for (const lkId in this.network.links) {
                    const lk = this.network.links[lkId];
                    const stat = linkStats[lkId];
                    let lkSpd = stat && stat.vehCount > 0 ? (stat.totalSpd / stat.vehCount) : avgSpeed;
                    let lkLOS = 'A';
                    if (lkSpd >= 40.0) lkLOS = 'A';
                    else if (lkSpd >= 32.0) lkLOS = 'B';
                    else if (lkSpd >= 24.0) lkLOS = 'C';
                    else if (lkSpd >= 18.0) lkLOS = 'D';
                    else if (lkSpd >= 12.0) lkLOS = 'E';
                    else lkLOS = 'F';

                    lk.currentAvgSpeed = lkSpd;
                    lk.currentLOS = lkLOS;
                    if (lkLOS === 'E' || lkLOS === 'F') {
                        bottleneckLinks.push(lkId);
                    }
                }
            }

            return {
                avgSpeed,
                los: overallLOS,
                bottleneckLinks,
                activeVehicles: count,
                hasSevereCongestion: (overallLOS === 'E' || overallLOS === 'F' || bottleneckLinks.length > 0)
            };
        }

        /**
         * 動態調整分區屬性 (即時長成 3D 建築與重算旅次)
         */
        updateZoneProperty(zoneId, props) {
            if (!this.zones[zoneId]) return;
            const zone = this.zones[zoneId];
            Object.assign(zone, props);
            if (this.network.zones && this.network.zones[zoneId]) {
                Object.assign(this.network.zones[zoneId], props);
            }
            this.recalculate();

            if ((typeof window !== 'undefined' && typeof window.generateCity === 'function')) {
                const seedInput = (typeof document !== 'undefined') ? document.getElementById('citySeedInput') : null;
                const seed = seedInput ? (parseInt(seedInput.value, 10) || 12345) : 12345;
                window.generateCity(this.network, seed);
            }

            if (typeof redraw2D === 'function') {
                redraw2D();
            }

            if ((typeof window !== 'undefined' ? window.lutiHudController : null)) {
                (typeof window !== 'undefined' ? window.lutiHudController : null).refreshStats();
            }
        }

        /**
         * 取得全域都市交通統計指標
         */
        getSummary() {
            let activeLutiVehicles = 0;
            if (this.simulation && this.simulation.vehicles) {
                activeLutiVehicles = this.simulation.vehicles.filter(v => v.lutiOriginZone).length;
            }
            return {
                ...this.stats,
                timePeriod: this.timePeriod,
                timeOfDay: this.timeOfDay,
                diurnalMultiplier: this.diurnalMultiplier,
                activeVehicles: activeLutiVehicles,
                totalSpawned: this.generatedVehiclesCount
            };
        }
    }

    // =========================================================================
    // ★★★ [Milestone 4] LUTI 都市規劃與交通指標儀表板控制器 (LUTIHUDController) ★★★
    // =========================================================================

// --- START OF FILE script_pedestrian_sim.js ---

// 常態分佈產生器 (Central Limit Theorem approximation)
function randNormal(min, max) {
    let rand = 0;
    for (let i = 0; i < 6; i += 1) rand += Math.random();
    rand = rand / 6; // 近似 0~1 的常態分佈
    return min + rand * (max - min);
}

// 多樣化行人服飾、膚色與髮型配色庫
var PED_MALE_SHIRTS = typeof PED_MALE_SHIRTS !== 'undefined' ? PED_MALE_SHIRTS : [0x2563eb, 0x0284c7, 0xdc2626, 0x059669, 0x334155, 0xd97706, 0x7c3aed, 0xf1f5f9, 0x0f766e, 0xeab308, 0x475569];
var PED_FEMALE_SHIRTS = typeof PED_FEMALE_SHIRTS !== 'undefined' ? PED_FEMALE_SHIRTS : [0xec4899, 0xf43f5e, 0x06b6d4, 0xfbbf24, 0xa855f7, 0xfef3c7, 0x10b981, 0x38bdf8, 0x991b1b, 0xf97316, 0x6366f1];
var PED_PANTS = typeof PED_PANTS !== 'undefined' ? PED_PANTS : [0x1e293b, 0x0f172a, 0x475569, 0xc2b280, 0x18181b, 0x334155, 0x27272a, 0x3f3f46];
var PED_SKINS = typeof PED_SKINS !== 'undefined' ? PED_SKINS : [0xfde2d1, 0xfcbda1, 0xe5a77f, 0xc88358, 0x8d5524];
var PED_HAIRS = typeof PED_HAIRS !== 'undefined' ? PED_HAIRS : [0x1c1917, 0x292524, 0x451a03, 0x78350f, 0x9a3412, 0xd97706];
var PED_SHOES = typeof PED_SHOES !== 'undefined' ? PED_SHOES : [0xf8fafc, 0x18181b, 0x334155, 0x52525b, 0x7c2d12];

class Pedestrian {
    constructor(id, startPoint, endPoint, width, crosswalk, spawner, crossTwice) {
        this.id = id;
        this.spawner = spawner;
        this.network = spawner.network;
        this.crosswalks = [crosswalk];
        this.currentCrosswalkIndex = 0;
        this.crossTwice = crossTwice;

        // 屬性設定
        this.isMale = Math.random() > 0.5;
        this.height = randNormal(1.4, 1.9);
        this.baseSpeed = Math.random() > 0.2 ? 1.2 : 0.9; // 稍微提升步速
        this.speed = this.baseSpeed;

        this.shirtColor = this.isMale
            ? PED_MALE_SHIRTS[(Math.random() * PED_MALE_SHIRTS.length) | 0]
            : PED_FEMALE_SHIRTS[(Math.random() * PED_FEMALE_SHIRTS.length) | 0];
        this.pantsColor = PED_PANTS[(Math.random() * PED_PANTS.length) | 0];
        this.skinColor = PED_SKINS[(Math.random() * PED_SKINS.length) | 0];
        this.hairColor = PED_HAIRS[(Math.random() * PED_HAIRS.length) | 0];
        this.shoeColor = PED_SHOES[(Math.random() * PED_SHOES.length) | 0];

        this.lateralOffset = (Math.random() - 0.5) * (width * 0.8);

        // 狀態與幾何
        this.state = 'WAITING'; // WAITING, CROSSING, WAITING_AT_ISLAND, FINISHED
        this.setupPath(startPoint, endPoint);

        // ★★★ 修正：只有當該斑馬線具備植栽庇護島，且非對角線時，才允許中途停留 ★★★
        this.hasRefuge = crosswalk.hasRefuge && !crosswalk.isDiagonal;
        this.midPoint = this.pathLength / 2;

        this.mesh = null;
        this.walkCycle = Math.random() * Math.PI * 2;
    }

    setupPath(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;

        this.startPos = { x: p1.x + nx * this.lateralOffset, y: p1.y + ny * this.lateralOffset };
        this.endPos = { x: p2.x + nx * this.lateralOffset, y: p2.y + ny * this.lateralOffset };

        this.x = this.startPos.x;
        this.y = this.startPos.y;
        this.angle = Math.atan2(dy, dx);
        this.pathLength = len;
        this.distanceTraveled = 0;
    }

    // ★ 接收 simTime 參數以便計算剩餘秒數
    update(dt, tfl, allPedestrians, simTime) {
        if (this.state === 'FINISHED') return;

        const cw = this.crosswalks[this.currentCrosswalkIndex];
        let signal = 'Green';
        let remainingTime = 999; // 預設充裕時間

        if (tfl && cw.turnGroupId) {
            // 獲取基礎燈號
            let baseSignal = tfl.getSignalForTurnGroup(cw.turnGroupId);
            // 獲取剩餘時間 (如果有實作此函數)
            remainingTime = tfl.getPedestrianRemainingTime ? tfl.getPedestrianRemainingTime(simTime, cw.turnGroupId) : 999;

            // ★ 如果幾何推算判定這是一組「衝突車流」，則進行燈號反轉
            if (cw.invertSignal) {
                if (baseSignal === 'Red') {
                    signal = 'Green';
                } else if (baseSignal === 'Yellow') {
                    signal = 'Red'; // 車流黃燈時，行人視同紅燈禁止起步
                } else {
                    signal = 'Red';
                }
            } else {
                signal = baseSignal;
            }
        }

        if (this.state === 'WAITING') {
            if (signal === 'Green') {
                this.state = 'CROSSING';
                this.speed = this.baseSpeed;
            }
        }
        else if (this.state === 'WAITING_AT_ISLAND') {
            // ★ 行人在庇護島等待，直到下一次變成綠燈
            if (signal === 'Green') {
                this.state = 'CROSSING';
                this.speed = this.baseSpeed;
            }
        }
        else if (this.state === 'CROSSING') {
            // ★★★ 計算目標點：預設是走到對面 (pathLength) ★★★
            let targetDistance = this.pathLength;

            // 判斷是否需要停在中央庇護島
            if (this.hasRefuge && this.distanceTraveled < this.midPoint) {
                // 計算若要走到「對面」，需要的時間
                const distToTarget = this.pathLength - this.distanceTraveled;
                const timeNeeded = distToTarget / this.baseSpeed;

                // 如果剩餘秒數不夠，或者已經是黃/紅燈了，把目標設為中央庇護島
                if (timeNeeded > remainingTime || signal === 'Yellow' || signal === 'Red') {
                    targetDistance = this.midPoint;
                }
            }

            // 依據號誌與目標調整步伐
            // 如果目標是對面，且燈號快結束了，加速跑完；若目標只是庇護島則維持原速
            if (targetDistance === this.pathLength && (signal === 'Yellow' || signal === 'Red')) {
                this.speed = 1.8; // 加速跑起來
            } else {
                this.speed = this.baseSpeed;
            }

            // 簡單防碰撞
            let actualSpeed = this.speed;
            for (const other of allPedestrians) {
                if (other.id === this.id || other.state !== 'CROSSING') continue;
                if (other.currentCrosswalkIndex !== this.currentCrosswalkIndex) continue;
                const distFwd = other.distanceTraveled - this.distanceTraveled;
                const distLat = Math.abs(other.lateralOffset - this.lateralOffset);
                if (distFwd > 0 && distFwd < 0.6 && distLat < 0.4) {
                    actualSpeed = Math.min(actualSpeed, other.speed * 0.9);
                }
            }

            // 移動
            this.distanceTraveled += actualSpeed * dt;
            this.walkCycle += actualSpeed * dt * 5.0;

            // ★★★ 抵達檢測 ★★★
            if (targetDistance === this.midPoint && this.distanceTraveled >= this.midPoint) {
                // 剛好走到中央庇護島
                this.distanceTraveled = this.midPoint; // 釘在庇護島上
                this.state = 'WAITING_AT_ISLAND';      // 切換狀態等待
            }
            else if (this.distanceTraveled >= this.pathLength) {
                // 走完全程
                this.handleEndOfCrosswalk();
            }

            // 更新座標 (如果還沒抵達終點)
            if (this.state !== 'FINISHED') {
                const ratio = this.distanceTraveled / this.pathLength;
                this.x = this.startPos.x + (this.endPos.x - this.startPos.x) * ratio;
                this.y = this.startPos.y + (this.endPos.y - this.startPos.y) * ratio;
            }
        }
    }

    handleEndOfCrosswalk() {
        if (this.crossTwice && this.currentCrosswalkIndex === 0) {
            const nextCw = this.spawner.findConnectingCrosswalk(this.crosswalks[0], this.x, this.y);
            if (nextCw) {
                this.crosswalks.push(nextCw);
                this.currentCrosswalkIndex = 1;
                this.state = 'WAITING';
                const d1 = Math.hypot(this.x - nextCw.p1.x, this.y - nextCw.p1.y);
                const d2 = Math.hypot(this.x - nextCw.p2.x, this.y - nextCw.p2.y);
                if (d1 < d2) this.setupPath(nextCw.p1, nextCw.p2);
                else this.setupPath(nextCw.p2, nextCw.p1);
                return;
            }
        }
        this.state = 'FINISHED';
    }
}

class PedestrianSimManager {
    constructor(simulation, network) {
        this.simulation = simulation;
        this.network = network;
        this.pedestrians = [];
        this.spawners = [];
        this.pedIdCounter = 0;

        this.initSpawners();
        this.initLUTISpawners();

        // 3D 群組
        if (typeof THREE !== 'undefined') {
            this.group3D = (typeof THREE !== 'undefined') ? new THREE.Group() : null;
            this.group3D.name = "PedestriansGroup";
        }
    }

    initLUTISpawners() {
        if (!this.network.zones || Object.keys(this.network.zones).length === 0) return;
        if (!this.network.roadMarkings) return;

        // 收集所有標線斑馬線
        const allCrosswalks = [];
        this.network.roadMarkings.forEach(mark => {
            if (mark.type === 'crosswalk' || mark.type === 'diagonal_crosswalk') {
                const lineData = (typeof window !== "undefined" && window.calculateCrosswalkLine) ? window.calculateCrosswalkLine(mark, this.network) : null;
                if (lineData) {
                    const midX = (lineData.p1.x + lineData.p2.x) / 2;
                    const midY = (lineData.p1.y + lineData.p2.y) / 2;
                    allCrosswalks.push({
                        mark,
                        lineData,
                        mid: { x: midX, y: midY },
                        nodeId: mark.nodeId,
                        turnGroupId: mark.signalGroupId || null,
                        invertSignal: false,
                        cw: {
                            id: mark.id,
                            p1: lineData.p1,
                            p2: lineData.p2,
                            width: lineData.width || 3.0,
                            turnGroupId: mark.signalGroupId || null,
                            invertSignal: false,
                            isDiagonal: mark.type === 'diagonal_crosswalk',
                            hasRefuge: false
                        }
                    });
                }
            }
        });

        if (allCrosswalks.length === 0) return;

        const lutiEngine = this.simulation ? this.simulation.lutiEngine : ((typeof window !== "undefined" && window.lutiEngine) || (typeof self !== "undefined" && self.lutiEngine) || null);
        const walkTrips = lutiEngine && lutiEngine.stats ? (lutiEngine.stats.hourlyWalkTrips || 150) : 150;
        const scaleFactor = lutiEngine ? (lutiEngine.scaleFactor || 0.05) : 0.05;

        // 找出所有鄰近分區 (< 500m) 之斑馬線並建立 LUTI 生成器
        allCrosswalks.forEach(item => {
            let minDist = Infinity;
            let nearestZone = null;
            Object.values(this.network.zones).forEach(zone => {
                const b = zone.boundary || [];
                let cx = 0, cy = 0;
                b.forEach(p => { cx += p.x; cy += p.y; });
                if (b.length > 0) { cx /= b.length; cy /= b.length; }
                const d = Math.hypot(item.mid.x - cx, item.mid.y - cy);
                if (d < minDist) {
                    minDist = d;
                    nearestZone = zone;
                }
            });

            if (minDist <= 500) {
                const existing = this.spawners.find(s => s.nodeId === item.nodeId && s.isLuti);
                if (existing) {
                    if (!existing.crosswalks.some(c => c.id === item.cw.id)) {
                        existing.crosswalks.push(item.cw);
                    }
                    return;
                }

                // 換算微觀小時發出人數 (保持微觀模擬自然流暢)
                const baseVolume = Math.max(30, Math.min(220, Math.round(walkTrips * scaleFactor * (1 - minDist / 650) * 1.5)));
                const spawner = {
                    nodeId: item.nodeId || `luti_node_${item.mark.id}`,
                    isLuti: true,
                    nearestZoneId: nearestZone ? nearestZone.id : null,
                    distanceToZone: minDist,
                    baseVolume: baseVolume,
                    volume: baseVolume,
                    interval: 3600 / baseVolume,
                    timer: Math.random() * (3600 / baseVolume),
                    crossOnceProb: 80,
                    crossTwiceProb: 20,
                    crosswalks: [item.cw],
                    diagonals: [],
                    findConnectingCrosswalk: (currentCw, x, y) => {
                        for (const cw of spawner.crosswalks) {
                            if (cw.id === currentCw.id) continue;
                            const d1 = Math.hypot(x - cw.p1.x, y - cw.p1.y);
                            const d2 = Math.hypot(x - cw.p2.x, y - cw.p2.y);
                            if (d1 < 10 || d2 < 10) return cw;
                        }
                        return null;
                    }
                };
                this.spawners.push(spawner);
            }
        });

        console.log(`[PedestrianSim] 成功對接 LUTI 短途步行需求，共掛載 ${this.spawners.filter(s => s.isLuti).length} 處斑馬線行人生成器。`);
    }

    /**
     * 時段或 24 小時晝夜動態演繹時，即時動態調整行人生成強度
     */
    updateLUTIVolumes(hourlyWalkTrips, period = 'AM', diurnalFactor = 1.0) {
        let periodMultiplier = 1.0;
        if (period === 'AM') periodMultiplier = 1.35;
        else if (period === 'PM') periodMultiplier = 1.45;
        else if (period === 'OFF') periodMultiplier = 0.85;

        this.spawners.forEach(sp => {
            if (!sp.isLuti) return;
            const targetVol = Math.max(15, Math.min(300, Math.round(sp.baseVolume * periodMultiplier * diurnalFactor)));
            sp.volume = targetVol;
            sp.interval = 3600 / Math.max(1, targetVol);
        });

        // 若當前行人過少且切換時段，立即觸發首發行人提供即時視覺回饋
        if (this.spawners.some(s => s.isLuti) && this.pedestrians.length < 3) {
            const sp = this.spawners.find(s => s.isLuti);
            if (sp && sp.crosswalks.length > 0) {
                const cw = sp.crosswalks[0];
                const startP = Math.random() > 0.5 ? cw.p1 : cw.p2;
                const endP = startP === cw.p1 ? cw.p2 : cw.p1;
                const ped = new Pedestrian(`ped_luti_${this.pedIdCounter++}`, startP, endP, cw.width, cw, sp, false);
                this.pedestrians.push(ped);
            }
        }
    }

    initSpawners() {
        for (const nodeId in this.network.nodes) {
            const node = this.network.nodes[nodeId];
            if (node.pedestrianVolume && node.pedestrianVolume > 0) {
                // ★ [修改] 接收封裝好的物件
                const extracted = this.extractCrosswalks(nodeId);
                const crosswalks = extracted.cws;
                const diagonals = extracted.diagonals;

                if (crosswalks.length > 0) {
                    this.spawners.push({
                        nodeId: nodeId,
                        volume: node.pedestrianVolume,
                        interval: 3600 / node.pedestrianVolume,
                        timer: Math.random() * (3600 / node.pedestrianVolume),
                        crossOnceProb: node.crossOnceProb !== undefined ? node.crossOnceProb : 100,
                        crossTwiceProb: node.crossTwiceProb || 0,
                        crosswalks: crosswalks,
                        diagonals: diagonals, // ★ 儲存對角線以供使用

                        findConnectingCrosswalk: (currentCw, x, y) => {
                            for (const cw of crosswalks) {
                                if (cw.id === currentCw.id) continue;
                                const d1 = Math.hypot(x - cw.p1.x, y - cw.p1.y);
                                const d2 = Math.hypot(x - cw.p2.x, y - cw.p2.y);
                                if (d1 < 10 || d2 < 10) return cw;
                            }
                            return null;
                        }
                    });
                }
            }
        }
    }

    extractCrosswalks(nodeId) {
        const cws = [];
        const diagonals = []; // ★ 新增對角線陣列
        if (!this.network.roadMarkings) return { cws, diagonals };

        this.network.roadMarkings.forEach(mark => {
            if (mark.type === 'crosswalk') {
                let belongsToNode = (mark.nodeId === nodeId);
                if (!belongsToNode && mark.linkId) {
                    const link = this.network.links[mark.linkId];
                    if (link && (link.source === nodeId || link.destination === nodeId)) {
                        belongsToNode = true;
                    }
                }

                if (belongsToNode) {
                    const lineData = (typeof window !== "undefined" && window.calculateCrosswalkLine) ? window.calculateCrosswalkLine(mark, this.network) : null;
                    if (lineData) {
                        let turnGroupId = null;
                        let invertSignal = false; // ★ 修正：將變數提早到最外層宣告，解決 ReferenceError

                        // 1. 優先使用 XML 中明確綁定的行人號誌群組
                        if (mark.signalGroupId) {
                            turnGroupId = mark.signalGroupId;
                        }
                        // 2. 若未綁定，使用幾何推算平行的車輛號誌
                        else {
                            let cwVecX = lineData.p2.x - lineData.p1.x;
                            let cwVecY = lineData.p2.y - lineData.p1.y;
                            if (lineData.roadAngle !== undefined) {
                                cwVecX = -Math.sin(lineData.roadAngle);
                                cwVecY = Math.cos(lineData.roadAngle);
                            }
                            const cwLen = Math.hypot(cwVecX, cwVecY);
                            if (cwLen > 0) { cwVecX /= cwLen; cwVecY /= cwLen; }

                            const node = this.network.nodes[nodeId];
                            let bestType = -1; // 紀錄最佳匹配權重

                            if (node && node.transitions) {
                                for (const t of node.transitions) {
                                    if (t.sourceLinkId !== t.destLinkId && t.turnGroupId) {
                                        const srcL = this.network.links[t.sourceLinkId];
                                        const dstL = this.network.links[t.destLinkId];
                                        if (srcL && dstL) {
                                            const getRobustAngle = (lane, isEnd) => {
                                                if (!lane || !lane.path || lane.path.length < 2) return 0;
                                                const path = lane.path;
                                                let p1, p2;
                                                if (isEnd) {
                                                    p1 = path[Math.max(0, path.length - 5)];
                                                    p2 = path[path.length - 1];
                                                } else {
                                                    p1 = path[0];
                                                    p2 = path[Math.min(path.length - 1, 4)];
                                                }
                                                return Math.atan2(p2.y - p1.y, p2.x - p1.x);
                                            };

                                            const inAngle = getRobustAngle(srcL.lanes[t.sourceLaneIndex || 0], true);
                                            const outAngle = getRobustAngle(dstL.lanes[t.destLaneIndex || 0], false);

                                            let diff = Math.abs(outAngle - inAngle);
                                            while (diff > Math.PI) diff -= Math.PI * 2;
                                            diff = Math.abs(diff);

                                            const vX = Math.cos(inAngle);
                                            const vY = Math.sin(inAngle);
                                            // dot 接近 1 代表平行，接近 0 代表垂直
                                            const dot = Math.abs(cwVecX * vX + cwVecY * vY);

                                            // 權重 3：最優先尋找平行且直行的伴隨車流
                                            if (diff < 0.8 && dot > 0.85) {
                                                if (bestType < 3) {
                                                    bestType = 3;
                                                    turnGroupId = t.turnGroupId;
                                                    invertSignal = false;
                                                }
                                            }
                                            // 權重 2：退而尋找平行的轉彎車流
                                            else if (dot > 0.85) {
                                                if (bestType < 2) {
                                                    bestType = 2;
                                                    turnGroupId = t.turnGroupId;
                                                    invertSignal = false;
                                                }
                                            }
                                            // 權重 1：尋找位於同一道路的衝突車流，採用反轉燈號 (專治T型/特殊路口)
                                            else if (dot < 0.5 && (t.sourceLinkId == mark.linkId || t.destLinkId == mark.linkId)) {
                                                if (bestType < 1) {
                                                    bestType = 1;
                                                    turnGroupId = t.turnGroupId;
                                                    invertSignal = true; 
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // 新增：判斷此斑馬線是否有植栽庇護島
                        let hasRefuge = false;
                        if (mark.spanToLinkId && this.network.medians) {
                            const median = this.network.medians.find(m =>
                                (m.l1Id === mark.linkId && m.l2Id === mark.spanToLinkId) ||
                                (m.l1Id === mark.spanToLinkId && m.l2Id === mark.linkId)
                            );
                            if (median && median.gapWidth > 1.2) {
                                hasRefuge = true;
                            }
                        }

                        cws.push({
                            id: mark.id,
                            p1: lineData.p1,
                            p2: lineData.p2,
                            width: lineData.width,
                            turnGroupId: turnGroupId,
                            invertSignal: invertSignal, // ★ 這裡現在可以正確讀取到變數了
                            isDiagonal: false,
                            hasRefuge: hasRefuge
                        });
                    }
                }
            }
            // 讀取對角線資料給行人使用
            else if (mark.type === 'diagonal_crosswalk' && mark.nodeId === nodeId) {
                // ★ 標記這是對角線行穿線 (isDiagonal: true)
                diagonals.push({
                    id: mark.id + '_1',
                    p1: mark.corners[0],
                    p2: mark.corners[2],
                    width: 4.0,
                    turnGroupId: mark.signalGroupId,
                    isDiagonal: true
                });
                diagonals.push({
                    id: mark.id + '_2',
                    p1: mark.corners[1],
                    p2: mark.corners[3],
                    width: 4.0,
                    turnGroupId: mark.signalGroupId,
                    isDiagonal: true
                });
            }
        });
        return { cws, diagonals }; // 回傳物件
    }

    update(dt) {
        // 1. 處理生成
        this.spawners.forEach(sp => {
            sp.timer += dt;
            if (sp.timer >= sp.interval) {
                sp.timer -= sp.interval;

                const rand = Math.random() * 100;
                let crossTwice = rand > sp.crossOnceProb && rand <= (sp.crossOnceProb + sp.crossTwiceProb);

                let cw;
                if (crossTwice && sp.diagonals && sp.diagonals.length > 0) {
                    cw = sp.diagonals[Math.floor(Math.random() * sp.diagonals.length)];
                    crossTwice = false;
                } else {
                    cw = sp.crosswalks[Math.floor(Math.random() * sp.crosswalks.length)];
                }

                const startP = Math.random() > 0.5 ? cw.p1 : cw.p2;
                const endP = startP === cw.p1 ? cw.p2 : cw.p1;

                const ped = new Pedestrian(`ped_${this.pedIdCounter++}`, startP, endP, cw.width, cw, sp, crossTwice);
                this.pedestrians.push(ped);
            }
        });

        // 2. 處理移動與狀態
        this.pedestrians.forEach(ped => {
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === ped.spawner.nodeId);

            // ★ 修改：傳入 this.simulation.time 以供計算剩餘秒數
            ped.update(dt, tfl, this.pedestrians, this.simulation.time);

            this.update3DMesh(ped);
        });

        // 3. 清理已完成的行人與其 3D 資源
        this.pedestrians = this.pedestrians.filter(ped => {
            if (ped.state === 'FINISHED') {
                if (ped.mesh) {
                    if (this.group3D) this.group3D.remove(ped.mesh);
                    ped.mesh.traverse(child => {
                        if (child.isMesh) {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                child.material.disposed = true;
                                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                                else child.material.dispose();
                            }
                        }
                    });
                }
                return false;
            }
            return true;
        });
    }

    draw2D(ctx, worldToScreen2D, scale) {
        ctx.save();
        this.pedestrians.forEach(ped => {
            const pos = worldToScreen2D(ped.x, ped.y);
            ctx.beginPath();
            // 直接使用真實世界單位大小 (例如半徑 0.4 公尺)
            ctx.arc(pos.x, pos.y, 0.4, 0, Math.PI * 2);
            ctx.fillStyle = ped.shirtColor ? ('#' + ped.shirtColor.toString(16).padStart(6, '0')) : (ped.isMale ? '#3b82f6' : '#ec4899');
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            // 線條寬度依據畫布縮放做反比，使其保持細緻
            ctx.lineWidth = 1 / scale;
            ctx.stroke();
        });
        ctx.restore();
    }

    // --- 高精緻度 3D 行人生成、夜景受光與動畫 ---
    update3DMesh(ped) {
        if (!this.group3D) return;

        if (!ped.mesh) {
            ped.mesh = new THREE.Group();

            // 為行人模型綁定 ID，讓點擊射線能辨識
            ped.mesh.userData.pedestrianId = ped.id;

            const shirtColor = ped.shirtColor || (ped.isMale ? 0x2563eb : 0xec4899);
            const pantsColor = ped.pantsColor || 0x1e293b;
            const skinColor = ped.skinColor || 0xfcbda1;
            const hairColor = ped.hairColor || 0x292524;
            const shoeColor = ped.shoeColor || 0xf8fafc;

            // MeshStandardMaterial 接收路燈 / 車頭燈的真實自然投射
            const matShirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.58, metalness: 0.02 });
            const matPants = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.68, metalness: 0.02 });
            const matSkin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.52, metalness: 0.0 });
            const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.65, metalness: 0.05 });
            const matShoes = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.55, metalness: 0.10 });

            // 註冊至 Visual3D 夜景材質管理器，日夜模式切換時自動調節夜間反光與微發光
            if (typeof window !== "undefined" && window.Visual3D && typeof Visual3D.registerPedestrianMaterial === "function") {
                Visual3D.registerPedestrianMaterial(matShirt, shirtColor, false);
                Visual3D.registerPedestrianMaterial(matPants, pantsColor, false);
                Visual3D.registerPedestrianMaterial(matSkin, skinColor, true);
                Visual3D.registerPedestrianMaterial(matHair, hairColor, false);
                Visual3D.registerPedestrianMaterial(matShoes, shoeColor, false);
            }

            // 比例參數 (依據身高動態調整)
            const scaleH = ped.height / 1.7; // 以 1.7m 為基準

            // 將行人正面建構朝向 +X 軸 (與車輛一致)
            // 1. 身體 (Torso) - 寬度在 Z 軸(0.4)，厚度在 X 軸(0.25)
            const bodyGeo = new THREE.BoxGeometry(0.25, 0.6 * scaleH, 0.4);
            const body = new THREE.Mesh(bodyGeo, matShirt);
            body.position.y = 0.9 * scaleH;
            body.castShadow = true;
            body.receiveShadow = true;
            ped.mesh.add(body);

            // 2. 頭部 (Head)
            const headGeo = new THREE.BoxGeometry(0.22, 0.22 * scaleH, 0.22);
            const head = new THREE.Mesh(headGeo, matSkin);
            head.position.y = 1.3 * scaleH;
            head.castShadow = true;
            head.receiveShadow = true;
            ped.mesh.add(head);

            // 3. 髮型/帽子 (Hair Cap)
            const hairGeo = new THREE.BoxGeometry(0.24, 0.09 * scaleH, 0.24);
            const hair = new THREE.Mesh(hairGeo, matHair);
            hair.position.y = 1.42 * scaleH;
            hair.castShadow = true;
            ped.mesh.add(hair);

            // 4. 雙腿與鞋履 (Legs & Shoes)
            const legGeo = new THREE.BoxGeometry(0.15, 0.52 * scaleH, 0.15);
            legGeo.translate(0, -0.26 * scaleH, 0);

            const shoeGeo = new THREE.BoxGeometry(0.18, 0.10 * scaleH, 0.15);
            shoeGeo.translate(0.02, -0.56 * scaleH, 0);

            // 左腿群組
            const legLGroup = new THREE.Group();
            legLGroup.position.set(0, 0.6 * scaleH, -0.1);
            const legL = new THREE.Mesh(legGeo, matPants);
            legL.castShadow = true;
            legL.receiveShadow = true;
            const shoeL = new THREE.Mesh(shoeGeo, matShoes);
            shoeL.castShadow = true;
            shoeL.receiveShadow = true;
            legLGroup.add(legL, shoeL);
            ped.mesh.legL = legLGroup;
            ped.mesh.add(legLGroup);

            // 右腿群組
            const legRGroup = new THREE.Group();
            legRGroup.position.set(0, 0.6 * scaleH, 0.1);
            const legR = new THREE.Mesh(legGeo, matPants);
            legR.castShadow = true;
            legR.receiveShadow = true;
            const shoeR = new THREE.Mesh(shoeGeo, matShoes);
            shoeR.castShadow = true;
            shoeR.receiveShadow = true;
            legRGroup.add(legR, shoeR);
            ped.mesh.legR = legRGroup;
            ped.mesh.add(legRGroup);

            // 5. 雙臂 (Arms)
            const armUpperGeo = new THREE.BoxGeometry(0.12, 0.32 * scaleH, 0.12);
            armUpperGeo.translate(0, -0.16 * scaleH, 0);
            const armLowerGeo = new THREE.BoxGeometry(0.10, 0.20 * scaleH, 0.10);
            armLowerGeo.translate(0, -0.40 * scaleH, 0);

            // 左手 (-Z 側)
            const armLGroup = new THREE.Group();
            armLGroup.position.set(0, 1.15 * scaleH, -0.26);
            const armLUpper = new THREE.Mesh(armUpperGeo, matShirt);
            armLUpper.castShadow = true;
            const armLLower = new THREE.Mesh(armLowerGeo, matSkin);
            armLLower.castShadow = true;
            armLGroup.add(armLUpper, armLLower);
            ped.mesh.armL = armLGroup;
            ped.mesh.add(armLGroup);

            // 右手 (+Z 側)
            const armRGroup = new THREE.Group();
            armRGroup.position.set(0, 1.15 * scaleH, 0.26);
            const armRUpper = new THREE.Mesh(armUpperGeo, matShirt);
            armRUpper.castShadow = true;
            const armRLower = new THREE.Mesh(armLowerGeo, matSkin);
            armRLower.castShadow = true;
            armRGroup.add(armRUpper, armRLower);
            ped.mesh.armR = armRGroup;
            ped.mesh.add(armRGroup);

            this.group3D.add(ped.mesh);
        }

        // 更新座標與旋轉
        ped.mesh.position.set(ped.x, 0, ped.y);
        ped.mesh.rotation.y = -ped.angle;

        // 更新步行動畫 (沿 Z 軸旋轉以產生前後擺動)
        if (ped.state === 'CROSSING') {
            const swing = Math.sin(ped.walkCycle) * 0.5; // 擺動幅度
            ped.mesh.legL.rotation.z = swing;
            ped.mesh.legR.rotation.z = -swing;
            // 手臂與腳反向擺動 (符合人類走路習慣)
            ped.mesh.armL.rotation.z = -swing;
            ped.mesh.armR.rotation.z = swing;
        } else {
            // 站立不動
            ped.mesh.legL.rotation.z = 0;
            ped.mesh.legR.rotation.z = 0;
            ped.mesh.armL.rotation.z = 0;
            ped.mesh.armR.rotation.z = 0;
        }
    }
}

// 暴露給全域
if (typeof window !== 'undefined') window.PedestrianManagerSim = PedestrianSimManager; if (typeof self !== 'undefined') self.PedestrianManagerSim = PedestrianSimManager;

// --- END OF FILE script_pedestrian_sim.js ---

    class Vehicle {
        constructor(id, profile, route, network, startLaneIndex = 0, initialState = null) {
            this.id = id;
            this.profileId = profile.id; // [新增] 記錄本車的 Profile ID
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
            this.swarmTransitionDuration = 0; // 新增：蜂群模式過渡計時器

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
            this.blinker = 'none'; // 'none', 'left', 'right'

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

        // [新增] 檢查該車道是否允許本車進入
        isLaneAllowed(network, linkId, laneIndex) {
            const link = network.links[linkId];
            if (!link || !link.lanes[laneIndex]) return false;
            const lane = link.lanes[laneIndex];
            // 若為空陣列或未定義，代表不限制 (全部車種皆可)
            if (!lane.allowedVehicles || lane.allowedVehicles.length === 0) return true;
            return lane.allowedVehicles.includes(this.profileId);
        }
        // =================================================================
        // ★★★ [新增] 檢查是否允許跨越標線換道 (依照一實一虛、雙實線規則) ★★★
        // =================================================================
        canCrossStroke(network, linkId, currentLaneIdx, targetLaneIdx) {
            const link = network.links[linkId];
            // 傳統道路維持現狀
            if (!link || link.geometryType !== 'lane-based') return true;

            const currentLane = link.lanes[currentLaneIdx];
            if (!currentLane) return true;

            const isMovingLeft = targetLaneIdx < currentLaneIdx;

            // 找出要跨越的那條邊界線
            const strokeIdToCheck = isMovingLeft ? currentLane.leftStrokeId : currentLane.rightStrokeId;
            if (!strokeIdToCheck) return true;

            const stroke = link.strokes.find(s => s.id === strokeIdToCheck);
            if (!stroke) return true;

            const type = stroke.type;

            // 1. 雙實線 (雙白或雙黃) -> 絕對禁止跨越
            if (type === 'white_double' || type === 'yellow_double') {
                return false;
            }

            // 2. 一實一虛判定
            if (isMovingLeft) {
                // 車向左切：面對的是標線的「右側」
                // white_dashed_solid 代表「左虛右實」，右邊是實線 -> 禁止跨越
                if (type === 'white_dashed_solid' || type === 'yellow_dashed_solid') return false;
            } else {
                // 車向右切：面對的是標線的「左側」
                // white_solid_dashed 代表「左實右虛」，左邊是實線 -> 禁止跨越
                if (type === 'white_solid_dashed' || type === 'yellow_solid_dashed') return false;
            }

            // 3. 單一白實線 (white_solid) -> 依要求維持現狀 (允許跨越)
            return true;
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

                // 修改為：
                this.updateLateralPosition(dt, network);
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
            // --- 加入在 Vehicle.update 函數內的開頭處 ---
            if (typeof this.filterCooldown !== 'undefined' && this.filterCooldown > 0) {
                this.filterCooldown -= dt;
            }
            if (this.launchDelay > 0) {
                this.launchDelay -= dt;
                if (this.launchDelay <= 0) {
                    // 延遲結束，正式啟動蜂群模式
                    // [改善 #8] 提高最小安全距離，防止蜂群穿模
                    this.swarmTimer = 4.0;
                    this.minGap = 0.3;
                    this.headwayTime = 0.4;
                    this.maxAccel = this.originalMaxAccel * 1.5;
                    this.launchDelay = 0;
                } else {
                    // 還在反應時間內，保持靜止或維持原狀
                    // 如果是剛起步，這會讓它多停留在原地一下
                }
            }

            // ==========================================
            // 決定方向燈狀態 (Turn Signal Logic)
            // ==========================================
            // ==========================================
            // 決定方向燈狀態 (Turn Signal Logic) - [修正後代碼]
            // ==========================================
            this.blinker = 'none';

            // 1. 兩段式左轉前往待轉區 (優先)
            if (this.twoStageState === 'moving_to_box') {
                this.blinker = 'right';
            }
            // 2. 變換車道 (執行中 或 意圖)
            else if (this.laneChangeState) {
                this.blinker = (this.laneChangeState.toLaneIndex > this.laneChangeState.fromLaneIndex) ? 'right' : 'left';
            } else if (this.laneChangeGoal !== null && this.laneChangeGoal !== this.currentLaneIndex) {
                this.blinker = (this.laneChangeGoal > this.currentLaneIndex) ? 'right' : 'left';
            }
            // 3. [新增] 一般路口轉彎判斷
            else if (this.state === 'inIntersection' && this.currentTransition && this.currentTransition.bezier) {
                // 透過貝茲曲線的起點與終點角度差來判斷轉向
                const pts = this.currentTransition.bezier.points;
                if (pts.length >= 4) {
                    // 計算進入角度
                    const angleStart = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
                    // 計算離開角度
                    const angleEnd = Math.atan2(pts[3].y - pts[2].y, pts[3].x - pts[2].x);

                    let diff = angleEnd - angleStart;
                    // 角度正規化 (-PI ~ PI)
                    while (diff <= -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;

                    // 閾值判斷 (約 17度以上視為轉彎)
                    // Canvas座標系(Y-Down): 順時針(右轉)為正，逆時針(左轉)為負
                    if (diff > 0.3) {
                        this.blinker = 'right';
                    } else if (diff < -0.3) {
                        this.blinker = 'left';
                    }
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

            // 機車鑽車決策
            if (this.isMotorcycle && this.state === 'onLink') {
                this.decideLaneFiltering(allVehicles, network);
            }

            // =================================================================
            // ★★★[終極無抖動版] 交通錐群集融合、精準閃避與阻擋換道系統 ★★★
            // =================================================================
            if (!this.isMotorcycle && !this.laneChangeState) {
                this.targetLateralOffset = 0; // 汽車預設維持置中
            }

            // ★★★ [修正 1] 如果正在換道，應以當前「真實偏移量」作為避障雷達的偵測基準
            let originalTarget = this.laneChangeState ? this.lateralOffset : this.targetLateralOffset;

            this.coneForcedLaneChange = false;
            this.coneBlockingGap = Infinity;
            // =================================================================
            // ★★★[終極修正] 槽化線嚴格避障與防穿模 (基於未來軌跡多邊形碰撞) ★★★
            // =================================================================
            if (network.channelizationPolygons && network.channelizationPolygons.length > 0) {
                const dynamicLookahead = Math.max(20.0, this.speed * 3.0);
                const step = 1.5; // 每 1.5m 檢查一次未來軌跡

                for (const poly of network.channelizationPolygons) {
                    const dSq = (this.x - poly[0].x) ** 2 + (this.y - poly[0].y) ** 2;
                    if (dSq > (dynamicLookahead + 60) ** 2) continue;

                    for (let s = 0; s <= dynamicLookahead; s += step) {
                        const checkDist = this.distanceOnPath + s;
                        let ptX, ptY, ptAngle;

                        if (checkDist <= this.currentPathLength) {
                            if (this.state === 'inIntersection' && this.currentPath && this.currentPath.length >= 4) {
                                const t = checkDist / this.currentPathLength;
                                const pt = Geom.Bezier.getPoint(t, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);
                                ptX = pt.x; ptY = pt.y;
                                const tg = Geom.Bezier.getTangent(t, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);
                                ptAngle = Math.atan2(tg.y, tg.x);
                            } else if (this.currentPath && this.currentPath.length >= 2) {
                                const posData = this.getPositionOnPath(this.currentPath, checkDist);
                                if (posData) { ptX = posData.x; ptY = posData.y; ptAngle = posData.angle; }
                            }
                        } else if (this.currentPath && this.currentPath.length >= 2) {
                            const posData = this.getPositionOnPath(this.currentPath, this.currentPathLength);
                            if (posData) {
                                const extra = checkDist - this.currentPathLength;
                                ptX = posData.x + Math.cos(posData.angle) * extra;
                                ptY = posData.y + Math.sin(posData.angle) * extra;
                                ptAngle = posData.angle;
                            }
                        }

                        if (ptX !== undefined) {
                            // ★ 關鍵：使用「真實當前偏移量」進行軌跡預判
                            const fX = ptX - Math.sin(ptAngle) * this.lateralOffset;
                            const fY = ptY + Math.cos(ptAngle) * this.lateralOffset;

                            if (Geom.Utils.isPointInPolygon({ x: fX, y: fY }, poly)) {
                                const gapToPoly = s - (this.length / 2) - 0.5;

                                // ★★★ 核心修正 1：通知導航系統，此車道被擋，必須盡快換道！
                                this.coneForcedLaneChange = true;

                                // ★★★ 核心修正 2：計算向外閃避的目標點
                                let cx = 0, cy = 0;
                                poly.forEach(p => { cx += p.x; cy += p.y; });
                                cx /= poly.length; cy /= poly.length;
                                const dot = (-Math.sin(ptAngle)) * (cx - fX) + Math.cos(ptAngle) * (cy - fY);
                                const dodgeAmount = dot > 0 ? -1.8 : 1.8;

                                this.targetLateralOffset = originalTarget + dodgeAmount;
                                const limit = this.isMotorcycle ? 2.5 : 3.5;
                                this.targetLateralOffset = Math.max(-limit, Math.min(limit, this.targetLateralOffset));

                                // ★★★ 核心修正 3：預判「極限閃避」是否依舊會撞上 (代表多邊形佔滿整個車道)
                                const dodgeX = ptX - Math.sin(ptAngle) * this.targetLateralOffset;
                                const dodgeY = ptY + Math.cos(ptAngle) * this.targetLateralOffset;
                                const willStillHit = Geom.Utils.isPointInPolygon({ x: dodgeX, y: dodgeY }, poly);

                                // 只有在「無法閃避」且「距離過近」時，才啟動強制煞停
                                const criticalBrakeDist = Math.max(5.0, this.speed * 2.0);
                                if (willStillHit && gapToPoly < criticalBrakeDist) {
                                    this.coneBlockingGap = Math.min(this.coneBlockingGap, Math.max(0.1, gapToPoly));
                                    if (this.laneChangeState) {
                                        this.laneChangeState = null;
                                        this.laneChangeCooldown = 2.0;
                                        this.targetLateralOffset = 0;
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
            // =================================================================
            // 輔助函式：合併重疊的障礙物區間 (Merge Intervals)
            const mergeIntervals = (intervals) => {
                if (intervals.length === 0) return [];
                intervals.sort((a, b) => a.min - b.min);
                const merged = [intervals[0]];
                for (let i = 1; i < intervals.length; i++) {
                    const last = merged[merged.length - 1];
                    const curr = intervals[i];
                    if (curr.min <= last.max) {
                        last.max = Math.max(last.max, curr.max);
                        last.fwdDist = Math.min(last.fwdDist, curr.fwdDist);
                        last.physicalMin = Math.min(last.physicalMin, curr.physicalMin);
                        last.physicalMax = Math.max(last.physicalMax, curr.physicalMax);
                    } else {
                        merged.push(curr);
                    }
                }
                return merged;
            };

            // -------------------------------------------------------------
            // 情境 1：直行路段 (On Link)
            // -------------------------------------------------------------
            if (this.state === 'onLink') {
                const link = network.links[this.currentLinkId];
                if (link && link.trafficCones && link.trafficCones.length > 0) {
                    const laneWidth = link.lanes[this.currentLaneIndex] ? link.lanes[this.currentLaneIndex].width : 3.5;
                    const myHalfWidth = this.width / 2;
                    const coneRadius = 0.25;

                    const racingBuffer = this.isMotorcycle ? 0.4 : 0.8;
                    const requiredClearance = myHalfWidth + coneRadius + racingBuffer;
                    const physicalClearance = myHalfWidth + coneRadius + 0.15;

                    const lookaheadTime = 3.5;
                    const dynamicLookahead = Math.max(40.0, this.maxSpeed * lookaheadTime);

                    // 1. 收集所有視野內的交通錐橫向阻擋區間
                    let rawIntervals = [];

                    for (const cone of link.trafficCones) {
                        const dx = cone.x - this.x;
                        const dy = cone.y - this.y;
                        const cos = Math.cos(this.angle);
                        const sin = Math.sin(this.angle);

                        const fwdDist = dx * cos + dy * sin;
                        const sideDist = -dx * sin + dy * cos;

                        if (fwdDist > -1.5 && fwdDist < dynamicLookahead) {
                            rawIntervals.push({
                                min: sideDist - requiredClearance,
                                max: sideDist + requiredClearance,
                                fwdDist: fwdDist,
                                physicalMin: sideDist - physicalClearance,
                                physicalMax: sideDist + physicalClearance
                            });
                        }
                    }

                    // 2. 融合相鄰的交通錐成為一道「隱形牆」
                    const mergedIntervals = mergeIntervals(rawIntervals);

                    if (mergedIntervals.length > 0) {
                        const blockingInterval = mergedIntervals.find(inv => originalTarget >= inv.min && originalTarget <= inv.max);

                        if (blockingInterval) {
                            const overshoot = this.isMotorcycle ? 0.2 : 0.4;
                            const leftOffset = blockingInterval.min - overshoot;
                            const rightOffset = blockingInterval.max + overshoot;
                            const maxAllowedOffset = (laneWidth / 2) - myHalfWidth + 0.4;

                            // ★ 評估左右閃避的代價 (Cost)
                            const evaluateCost = (offset) => {
                                let cost = Math.abs(offset - this.lateralOffset); // 基礎代價：移動距離
                                if (Math.abs(offset) > maxAllowedOffset) cost += 1000; // 越界懲罰
                                if (mergedIntervals.some(inv => offset > inv.physicalMin && offset < inv.physicalMax)) cost += 5000; // 撞其他錐懲罰
                                return cost;
                            };

                            const costLeft = evaluateCost(leftOffset);
                            const costRight = evaluateCost(rightOffset);
                            let expectedOffset = this.pickDodgeSideWithHysteresis(costLeft, costRight, leftOffset, rightOffset);

                            const clampedOffset = Math.max(originalTarget - maxAllowedOffset, Math.min(originalTarget + maxAllowedOffset, expectedOffset));

                            const isImpassable = mergedIntervals.some(inv => clampedOffset > inv.physicalMin && clampedOffset < inv.physicalMax);
                            const currentlyHitting = mergedIntervals.some(inv => this.lateralOffset > inv.physicalMin && this.lateralOffset < inv.physicalMax);

                            // ★ 動態煞車：確保在橫移安全前不會撞上 (解決車速過快壓過圓錐的問題)
                            if (blockingInterval.fwdDist > 0) {
                                let needsBrake = false;
                                if (isImpassable) {
                                    needsBrake = true;
                                } else if (currentlyHitting) {
                                    const distToSlide = Math.abs(clampedOffset - this.lateralOffset);
                                    const latSpeed = this.isMotorcycle ? 3.0 : 2.0;
                                    const safeFwdDist = (distToSlide / latSpeed) * this.speed + 1.0;
                                    if (blockingInterval.fwdDist < safeFwdDist) needsBrake = true;
                                }

                                if (needsBrake) {
                                    if (!this.isMotorcycle) this.coneForcedLaneChange = true;

                                    // ★★★ [修正 2] 移除 !this.laneChangeState 限制，換道中若被擋住也要強制煞車！
                                    const stopGap = blockingInterval.fwdDist - (this.length / 2) - coneRadius - 1.0;
                                    this.coneBlockingGap = Math.min(this.coneBlockingGap, Math.max(0.1, stopGap));

                                    // ★★★ [修正 3] 若正在換道卻發現撞上實體障礙(槽化線)，強制取消換道並退回
                                    if (this.laneChangeState && stopGap < 5.0) {
                                        this.laneChangeState = null;
                                        this.laneChangeCooldown = 2.0;
                                        this.targetLateralOffset = 0; // 回正
                                    }
                                }
                            }

                            this.targetLateralOffset = clampedOffset;
                        } else {
                            // 預防回切碰撞：目標雖沒被擋，但「回歸路線」被擋住時，保持目前閃避姿態
                            const pathBlocked = mergedIntervals.find(inv =>
                                (this.lateralOffset >= inv.min && originalTarget <= inv.max) ||
                                (this.lateralOffset <= inv.max && originalTarget >= inv.min)
                            );
                            if (pathBlocked && pathBlocked.fwdDist > -1.0) {
                                if (this.lateralOffset > pathBlocked.max) {
                                    this.targetLateralOffset = pathBlocked.max + 0.1;
                                } else if (this.lateralOffset < pathBlocked.min) {
                                    this.targetLateralOffset = pathBlocked.min - 0.1;
                                }
                            }
                        }
                    }
                }
            }
            // -------------------------------------------------------------
            // 情境 2：路口內部 (In Intersection) - 貝茲曲線跟隨
            // -------------------------------------------------------------
            else if (this.state === 'inIntersection' && this.currentPath && this.currentPath.length >= 4) {
                const freeCones = network.freeRoadSigns ? network.freeRoadSigns.filter(s => s.signType === 'traffic_cone') : [];

                if (freeCones.length > 0) {
                    const myHalfWidth = this.width / 2;
                    const coneRadius = 0.25;

                    const racingBuffer = this.isMotorcycle ? 0.5 : 1.0;
                    const requiredClearance = myHalfWidth + coneRadius + racingBuffer;
                    const physicalClearance = myHalfWidth + coneRadius + 0.15;

                    const lookaheadTime = this.isMotorcycle ? 2.0 : 3.0;
                    const dynamicLookahead = Math.max(15.0, this.speed * lookaheadTime);

                    let isDodging = false;

                    // [改善 1] 縮小步距，提高貝茲曲線投影精度，消弭目標跳動
                    const step = 0.5;
                    const distToEnd = this.currentPathLength - this.distanceOnPath;
                    const searchEnd = Math.min(this.currentPathLength, this.distanceOnPath + dynamicLookahead);

                    // [改善 2] 搜尋起點稍微往後退，避免車輛剛越過交通錐瞬間，投影點被迫往前跳躍
                    const searchStart = Math.max(0, this.distanceOnPath - 3.0);

                    let rawIntervals = [];

                    for (const cone of freeCones) {
                        const dx = cone.x - this.x;
                        const dy = cone.y - this.y;
                        if (dx * dx + dy * dy > dynamicLookahead * dynamicLookahead) continue;

                        let minConeDistSq = Infinity;
                        let bestS = searchStart;
                        let bestSign = 0;

                        for (let s = searchStart; s <= searchEnd; s += step) {
                            const t = s / this.currentPathLength;
                            const pt = Geom.Bezier.getPoint(t, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);

                            const cDx = cone.x - pt.x;
                            const cDy = cone.y - pt.y;
                            const cDistSq = cDx * cDx + cDy * cDy;

                            if (cDistSq < minConeDistSq) {
                                minConeDistSq = cDistSq;
                                bestS = s;
                                const tg = Geom.Bezier.getTangent(t, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);
                                const tgLen = Math.hypot(tg.x, tg.y);
                                if (tgLen > 0) {
                                    const normalX = -tg.y / tgLen;
                                    const normalY = tg.x / tgLen;
                                    bestSign = (cDx * normalX + cDy * normalY);
                                }
                            }
                        }

                        const fwdDist = bestS - this.distanceOnPath;
                        // [改善 3] 放寬後方判定範圍至 -3.0，確保車尾完全通過前，避障目標不會突變消失
                        // [改善 3] 放寬後方判定範圍至 -3.0，確保車尾完全通過前，避障目標不會突變消失
                        if (fwdDist > -3.0 && fwdDist < dynamicLookahead) {
                            const effectiveSign = bestSign < 0 ? -1 : 1; // 避免 sign(0) 導致歸零
                            const sideDist = effectiveSign * Math.sqrt(minConeDistSq);
                            rawIntervals.push({
                                min: sideDist - requiredClearance,
                                max: sideDist + requiredClearance,
                                fwdDist: fwdDist,
                                physicalMin: sideDist - physicalClearance,
                                physicalMax: sideDist + physicalClearance
                            });
                        }
                    }

                    const mergedIntervals = mergeIntervals(rawIntervals);

                    if (mergedIntervals.length > 0) {
                        const blockingInterval = mergedIntervals.find(inv => originalTarget >= inv.min && originalTarget <= inv.max);

                        if (blockingInterval) {
                            isDodging = true;

                            const overshoot = this.isMotorcycle ? 0.3 : 0.6;
                            const leftOffset = blockingInterval.min - overshoot;
                            const rightOffset = blockingInterval.max + overshoot;
                            const limit = this.isMotorcycle ? 2.5 : 3.5;

                            // ★ 建立路口動態代價系統：綜合評估待轉區與待轉車輛
                            const evaluateCost = (offset) => {
                                let cost = Math.abs(offset - this.lateralOffset);
                                if (Math.abs(offset) > limit) cost += 1000;
                                if (mergedIntervals.some(inv => offset > inv.physicalMin && offset < inv.physicalMax)) cost += 5000;

                                // 預判車輛偏移後的真實世界座標
                                const nx = -Math.sin(this.angle);
                                const ny = Math.cos(this.angle);
                                const projX = this.x + nx * (offset - this.lateralOffset);
                                const projY = this.y + ny * (offset - this.lateralOffset);

                                // 懲罰：閃避路線太靠近待轉格子
                                if (network.twoStageBoxMap) {
                                    for (const nodeId in network.twoStageBoxMap) {
                                        for (const box of network.twoStageBoxMap[nodeId]) {
                                            const distSq = (projX - box.x) ** 2 + (projY - box.y) ** 2;
                                            if (distSq < 25) cost += (25 - Math.sqrt(distSq)) * 20;
                                        }
                                    }
                                }
                                // 懲罰：閃避路線太靠近正在待轉的機車
                                for (const other of allVehicles) {
                                    if (other.id === this.id) continue;
                                    if (other.twoStageState === 'waiting' || other.twoStageState === 'moving_to_box') {
                                        const distSq = (projX - other.x) ** 2 + (projY - other.y) ** 2;
                                        if (distSq < 25) cost += (25 - Math.sqrt(distSq)) * 30; // 5米半徑雷達
                                    }
                                }
                                return cost;
                            };

                            const costLeft = evaluateCost(leftOffset);
                            const costRight = evaluateCost(rightOffset);
                            let expectedOffset = this.pickDodgeSideWithHysteresis(costLeft, costRight, leftOffset, rightOffset);

                            const clampedOffset = Math.max(-limit, Math.min(limit, expectedOffset));

                            const isImpassable = mergedIntervals.some(inv => clampedOffset > inv.physicalMin && clampedOffset < inv.physicalMax);
                            const currentlyHitting = mergedIntervals.some(inv => this.lateralOffset > inv.physicalMin && this.lateralOffset < inv.physicalMax);

                            // ★ 動態煞車：橫移需要時間，如果來不及橫移完畢就撞上，必須踩煞車減速！
                            if (blockingInterval.fwdDist > 0) {
                                let needsBrake = false;
                                if (isImpassable) {
                                    needsBrake = true;
                                } else if (currentlyHitting) {
                                    const distToSlide = Math.abs(clampedOffset - this.lateralOffset);
                                    const latSpeed = this.isMotorcycle ? 3.0 : 2.0;
                                    const safeFwdDist = (distToSlide / latSpeed) * this.speed + 1.0;
                                    if (blockingInterval.fwdDist < safeFwdDist) needsBrake = true;
                                }

                                if (needsBrake) {
                                    // ★★★[修正 4] 取消換道限制，路口內觸碰槽化線嚴格煞車
                                    const stopGap = blockingInterval.fwdDist - (this.length / 2) - coneRadius - 0.5;
                                    this.coneBlockingGap = Math.min(this.coneBlockingGap, Math.max(0.1, stopGap));

                                    // 路口內若有未完成的換道意圖被阻擋，也予以取消
                                    if (this.laneChangeState && stopGap < 5.0) {
                                        this.laneChangeState = null;
                                        this.laneChangeCooldown = 2.0;
                                    }
                                }
                            }

                            this.targetLateralOffset = clampedOffset;
                        } else {
                            const pathBlocked = mergedIntervals.find(inv =>
                                (this.lateralOffset >= inv.min && originalTarget <= inv.max) ||
                                (this.lateralOffset <= inv.max && originalTarget >= inv.min)
                            );
                            if (pathBlocked && pathBlocked.fwdDist > -1.0) {
                                isDodging = true;
                                if (this.lateralOffset > pathBlocked.max) {
                                    this.targetLateralOffset = pathBlocked.max + 0.2;
                                } else if (this.lateralOffset < pathBlocked.min) {
                                    this.targetLateralOffset = pathBlocked.min - 0.2;
                                }
                            }
                        }
                    }

                    // [改善 4] 強制收斂機制優化：不論有沒有在 Dodge，只要快出路口就將 Target 平滑壓回 0
                    if (distToEnd < 6.0) {
                        const decayFactor = Math.pow(distToEnd / 6.0, 2);
                        this.targetLateralOffset = originalTarget + (this.targetLateralOffset - originalTarget) * decayFactor;
                    }
                }
            }
            // =================================================================


            // 更新橫向位置
            //this.updateLateralPosition(dt);

            // 更新橫向位置
            this.updateLateralPosition(dt, network);

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

                    // [改善 #8] 蜂群參數（提高安全下限）vs 原始參數
                    const swarmMinGap = 0.3;
                    const swarmHeadway = 0.4;
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
                        // ★ 穿模修復：與車道邊界緩衝一致 (0.3m)
                        const maxSafe = (targetLane.width / 2) - (this.width / 2) - 0.3;
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
                        // [改善 #8] 啟動群體模式，但保留最低安全距離
                        this.swarmTimer = 3.0;
                        this.minGap = 0.3;
                        this.headwayTime = 0.4;

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
            // 將 const 替換為 let，因為我們可能需要修改 gap 和 leader
            let { leader, gap } = this.findLeader(allVehicles, network);

            // ★★★ [新增] 交通錐全車道阻擋煞停邏輯 ★★★
            if (this.coneBlockingGap < gap) {
                gap = Math.max(0.1, this.coneBlockingGap);
                leader = null; // 視為虛擬靜止障礙物，觸發 IDM 煞車
            }
            // ==========================================
            // ★★★[新增] 行人防撞與轉向禮讓邏輯 (保守淨空策略) ★★★
            // ==========================================
            if (simulation && simulation.pedManager) {
                const pedGap = this.detectPedestrianConflict(simulation);
                if (pedGap < gap) {
                    let finalPedGap = pedGap;

                    // 【保守策略：路口防堵死】
                    // 如果車輛還在路段上 (還沒進路口)，且行人衝突點位在路口內或對向出口
                    if (this.state === 'onLink') {
                        const distToEnd = this.currentPathLength - this.distanceOnPath;

                        // 如果衝突點比路口起點還遠 (代表行人在路口內或對面)
                        if (pedGap > distToEnd) {
                            // 計算到停止線的實際距離
                            let actualDistToStop = distToEnd - (this.length / 2);
                            let checkLane = this.currentLaneIndex;
                            if (this.laneChangeState && this.laneChangeState.progress > 0.5) {
                                checkLane = this.laneChangeState.toLaneIndex;
                            }

                            let stopLinePos;
                            if (this.isMotorcycle) {
                                stopLinePos = simulation.network.motoStopLineMap ? simulation.network.motoStopLineMap[this.currentLinkId]?.[checkLane] : undefined;
                            } else {
                                stopLinePos = simulation.network.stopLineMap ? simulation.network.stopLineMap[this.currentLinkId]?.[checkLane] : undefined;
                            }

                            if (stopLinePos !== undefined) {
                                actualDistToStop = stopLinePos - this.distanceOnPath - (this.length / 2);
                            }

                            // 如果車頭還沒越過停止線 (給予 1.0m 容錯，防止已經微凸的車倒退)
                            if (actualDistToStop > -1.0) {
                                // --- 飢餓防止機制 (Patience Timer) ---
                                if (actualDistToStop < 5.0 && this.speed < 1.0) {
                                    this.yieldWaitTime = (this.yieldWaitTime || 0) + dt;
                                } else if (this.speed > 2.0) {
                                    this.yieldWaitTime = 0; // 車速提起來就重置耐心
                                }

                                // 容忍極限：等待低於 5 秒，乖乖停在停止線前
                                if ((this.yieldWaitTime || 0) < 5.0) {
                                    finalPedGap = actualDistToStop + this.minGap - 0.5;
                                } else {
                                    // 等超過 5 秒失去耐性：以極慢速度往前擠 (Creeping)，準備在黃燈清空
                                    this.speed = Math.min(this.speed, 2.0);
                                    // 讓 gap 回復為原本的 pedGap，車輛會緩慢開進路口並在行人前方停下
                                }
                            }
                        }
                    }

                    gap = Math.max(0.1, finalPedGap);
                    leader = null; // 視為虛擬靜止障礙物，強迫車輛排隊煞停
                } else {
                    this.yieldWaitTime = 0; // 沒遇到行人衝突，重置計時
                }
            } else {
                this.yieldWaitTime = 0;
            }
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
            // ★★★ [修復] 同車道煞停穿模：運動學煞停計算 + 動態防護膜 ★★★
            // =================================================================
            if (leader) {
                const speedDiff = this.speed - leader.speed;
                const criticalGap = this.minGap + 0.3; // 臨界安全距離

                // 當間距逼近安全極限且正在接近時，觸發運動學煞停
                if (gap <= criticalGap && speedDiff > 0) {
                    const distAvailable = Math.max(0.01, gap - this.minGap);
                    const targetSpeed = Math.max(0, leader.speed);
                    // v^2 = u^2 + 2as => a = (v_target^2 - v_self^2) / (2 * dist)
                    const reqDecel = (this.speed * this.speed - targetSpeed * targetSpeed) / (2 * distAvailable);
                    // 限制減速在 4.0 ~ 9.0 m/s² 之間，避免數值震盪
                    this.accel = Math.min(this.accel, -Math.min(9.0, Math.max(4.0, reqDecel)));
                }
            }

            // 1. 先根據加速度更新速度
            this.speed += this.accel * dt;
            if (this.speed < 0) this.speed = 0;

            const oldDistanceOnPath = this.distanceOnPath;
            let moveDist = this.speed * dt;

            // 2. 絕對物理防穿透 (防微步 Creeping 與高速 Teleport)
            const isStuckAtEnd = gap <= 0.05 && (this.currentPathLength - this.distanceOnPath) <= 0.05;

            if (isStuckAtEnd) {
                // 卡在路段末端
                moveDist = Math.max(0, this.currentPathLength - this.distanceOnPath);
                this.speed = 0;
            } else if (leader) {
                // ★ 動態防護膜：依據當前速度與時間步長自動調整緩衝，消除離散誤差
                const dynamicBuffer = 0.02 + Math.min(0.15, this.speed * 0.008);
                const safeThreshold = Math.max(0.02, gap - dynamicBuffer);

                if (moveDist > safeThreshold) {
                    moveDist = safeThreshold;

                    // ★ 核心防穿模：若已貼近至 minGap 容差內，直接定桿，徹底消除後車擠入
                    if (gap <= this.minGap + 0.12) {
                        this.speed = 0;
                        moveDist = 0; // 本幀停止移動
                    } else {
                        // 否則限制移動距離，並同步速度不超過前車
                        this.speed = Math.min(this.speed, Math.max(0, leader.speed));
                    }
                }
            }


            // 3. 套用絕對安全的移動距離
            this.distanceOnPath += moveDist;

            // 收集數據
            this.collectMeterData(oldDistanceOnPath, simulation);

            // ★★★ [Milestone 3] LUTI 目的地吸收判定 ★★★
            if (this.lutiDestZone && this.currentLinkIndex >= this.route.length - 1) {
                if (this.destConnectorDist !== undefined && this.destConnectorDist !== null) {
                    if (this.distanceOnPath >= this.destConnectorDist) {
                        this.finished = true;
                        return;
                    }
                }
            }

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
            * 計算鑽車空隙位置（精確防穿模版）
            * 座標系：+ (正值) 代表靠左，- (負值) 代表靠右
            */
        findFilteringGap(leader, halfWidth) {
            const leaderOffset = leader.lateralOffset || 0;
            const leaderHalf = leader.width / 2;
            const myHalf = this.width / 2;
            const safeMargin = 0.3; // 鑽車縫的額外安全緩衝

            // 計算左側與右側的剩餘絕對空間
            // 左邊界為 +halfWidth，右邊界為 -halfWidth
            const leftSpace = halfWidth - (leaderOffset + leaderHalf);
            const rightSpace = (leaderOffset - leaderHalf) - (-halfWidth);

            const needSpace = myHalf * 2 + safeMargin;

            // 優先選擇空間較大且足夠容納機車的一側
            if (leftSpace > rightSpace && leftSpace >= needSpace) {
                // 往左鑽：貼著前車左緣 + 我的半寬 + 緩衝
                return Math.min(halfWidth - myHalf, leaderOffset + leaderHalf + myHalf + safeMargin);
            } else if (rightSpace >= needSpace) {
                // 往右鑽：貼著前車右緣 - 我的半寬 - 緩衝
                return Math.max(-halfWidth + myHalf, leaderOffset - leaderHalf - myHalf - safeMargin);
            }

            // 如果兩邊空間都不夠 (例如被大車塞滿)，強迫閃避到空間較大那側的極限邊緣
            if (leftSpace > rightSpace) {
                return halfWidth - myHalf;
            } else {
                return -halfWidth + myHalf;
            }
        }

        /**
        * 更新橫向位置 (Kinematic Bicycle Model + PD Damping)
        * 高敏捷度版本：修正閃避交通錐過慢的問題，提升方向盤反應速度
        */
        updateLateralPosition(dt, network) {
            if (typeof this.yawBias === 'undefined') this.yawBias = 0;
            if (typeof this.steeringAngle === 'undefined') this.steeringAngle = 0;
            if (typeof this.lateralVelocity === 'undefined') this.lateralVelocity = 0;

            // ==========================================
            // 邊界上限 (迴圈外先算一次)
            // ==========================================
            let maxLimit = 1.5;
            if (network && this.state === 'onLink') {
                const link = network.links[this.currentLinkId];
                if (link && link.lanes[this.currentLaneIndex]) {
                    // ★ 穿模修復：邊界保留 0.3m 緩衝（涵蓋後照鏡/方向燈視覺外凸），
                    //   確保貼邊機車與鄰車道居中汽車的邏輯足跡不接觸
                    maxLimit = Math.max(0, (link.lanes[this.currentLaneIndex].width / 2) - (this.width / 2) - 0.3);
                }
            } else if (this.state === 'inIntersection') {
                maxLimit = 4.0;
            }

            const diff0 = this.targetLateralOffset - this.lateralOffset;
            const L = Math.max(1.0, this.length * 0.65); // 軸距

            // ==========================================
            // 敏捷度提升 1：提高最低虛擬動力
            // 當車輛被交通錐擋住而降速時，保證有足夠的動力把車頭「推」出去
            // ==========================================
            let kinSpeed = this.speed;
            if (Math.abs(diff0) > 0.1 && this.speed < 2.0) {
                // 原本是 0.5，提升到 2.0，確保低速閃避依然俐落
                kinSpeed = 2.0;
            }

            // ==========================================
            // ★ 蛇行修復：提高機車阻尼、微降增益
            // 舊參數 kd=0.6 對短軸距機車阻尼不足，閉迴路處於欠阻尼狀態，
            // 疊加顯式歐拉積分在大 dt 時會繞目標左右震盪 = 蛇行。
            // ==========================================
            const kp = this.isMotorcycle ? 2.1 : 1.8;   // 對橫向誤差的反應強度
            const kd = this.isMotorcycle ? 1.3 : 0.9;   // 阻尼：防止切太快衝過頭
            const maxHeading = this.isMotorcycle ? 0.85 : 0.75; // 最大車頭偏角
            const steerGain = this.isMotorcycle ? 3.0 : 2.5;    // 方向盤跟隨目標角度的強度
            const maxSteer = this.isMotorcycle ? 0.8 : 0.65;    // 方向盤極限打角
            const steerSpeed = this.isMotorcycle ? 15.0 : 10.0; // 方向盤轉動速度

            // ==========================================
            // ★ 蛇行修復：固定子步長積分 (每步 ≤ 20ms)
            // 模擬倍率 × 低幀率時 dt 可達 0.1~5 秒，單步歐拉會讓
            // yawRate 積分發散。子步長讓行為與幀率/倍率無關且收斂。
            // ==========================================
            let remaining = Math.min(Math.max(dt, 0), 0.5);
            const MAX_STEP = 0.02;

            while (remaining > 1e-6) {
                const h = Math.min(MAX_STEP, remaining);
                remaining -= h;

                let desiredHeading = 0;

                // 進入靜區 (小於 2cm 誤差) 視為直行
                if (Math.abs(this.targetLateralOffset - this.lateralOffset) > 0.02) {
                    const curDiff = this.targetLateralOffset - this.lateralOffset;
                    const currentLatVel = kinSpeed * Math.sin(this.yawBias);
                    desiredHeading = (curDiff * kp) - (currentLatVel * kd);

                    // 放寬車頭最大允許偏角，讓車可以「斜切」出去 (汽車約43度，機車約49度)
                    desiredHeading = Math.max(-maxHeading, Math.min(maxHeading, desiredHeading));
                }

                // 強化方向盤馬達 (Steering Actuator)
                const headingError = desiredHeading - this.yawBias;
                const desiredSteering = Math.max(-maxSteer, Math.min(maxSteer, headingError * steerGain));
                this.steeringAngle += (desiredSteering - this.steeringAngle) * (1.0 - Math.exp(-h * steerSpeed));

                // 運動學計算
                const yawRate = (kinSpeed / L) * Math.tan(this.steeringAngle);
                this.yawBias += yawRate * h;

                // 強制收斂機制 (消滅直行時的奈米級抖動)
                if (Math.abs(this.targetLateralOffset - this.lateralOffset) < 0.02 && Math.abs(desiredHeading) < 0.01) {
                    this.yawBias *= Math.exp(-h * 8.0);
                    this.steeringAngle *= Math.exp(-h * 8.0);
                }

                // ★ 安全夾限：任何殘餘暫態都不允許產生誇張車頭偏角
                if (this.yawBias > maxHeading) this.yawBias = maxHeading;
                else if (this.yawBias < -maxHeading) this.yawBias = -maxHeading;

                // 更新橫向位置
                this.lateralVelocity = kinSpeed * Math.sin(this.yawBias);
                this.lateralOffset += this.lateralVelocity * h;

                // ==========================================
                // 邊界保護 (防止閃避過頭撞牆，每個子步都檢查)
                // ==========================================
                if (this.lateralOffset > maxLimit) {
                    this.lateralOffset = maxLimit;
                    if (this.yawBias > 0) { this.yawBias *= 0.5; this.steeringAngle *= 0.5; }
                    if (this.lateralVelocity > 0) this.lateralVelocity = 0;
                } else if (this.lateralOffset < -maxLimit) {
                    this.lateralOffset = -maxLimit;
                    if (this.yawBias < 0) { this.yawBias *= 0.5; this.steeringAngle *= 0.5; }
                    if (this.lateralVelocity < 0) this.lateralVelocity = 0;
                }
            }

            this.currentYawBias = this.yawBias;
        }

        // ==================================================================================
        // ★ 蛇行修復：閃避側遲滯 (Hysteresis)
        // 記住 3 秒內的閃避側；另一側的代價必須明顯更低 (margin) 才允許換邊，
        // 避免 evaluateCost 因自身橫移而每幀翻轉左右選擇，造成 S 形來回擺盪。
        // ==================================================================================
        pickDodgeSideWithHysteresis(costLeft, costRight, leftOffset, rightOffset) {
            const now = (typeof simulation !== 'undefined' && simulation) ? simulation.time : 0;
            if (typeof this._dodgeSideTime === 'undefined') this._dodgeSideTime = -999;
            const fresh = (now - this._dodgeSideTime) < 3.0;
            const MARGIN = 0.8;

            let useLeft;
            if (fresh && this._dodgeSide === 1) {
                useLeft = costLeft <= costRight + MARGIN;          // 維持左側，除非右側明顯更便宜
            } else if (fresh && this._dodgeSide === -1) {
                useLeft = !(costRight <= costLeft + MARGIN);       // 維持右側
            } else {
                useLeft = costLeft < costRight;                    // 無記憶：純代價比較
            }

            this._dodgeSide = useLeft ? 1 : -1;
            this._dodgeSideTime = now;
            return useLeft ? leftOffset : rightOffset;
        }

        decideLaneFiltering(allVehicles, network) {
            if (this.isPreparingForTwoStageTurn(network)) return;
            if (!this.isMotorcycle || this.state !== 'onLink') return;

            // ★★★ [新增] 速度過低(例如等紅燈)時，禁止進行鑽車縫與游離決策
            if (this.speed < 1.0) return;

            // 只要不是因為交通錐強制閃避，或正在劇烈橫移，就可以重新決策
            if (this.coneForcedLaneChange || Math.abs(this.targetLateralOffset - this.lateralOffset) > 0.5) return;

            // 引入決策冷卻時間，避免每幀變換目標導致蛇行抖動
            if (typeof this.filterCooldown === 'undefined') this.filterCooldown = 0;
            if (this.filterCooldown > 0) return;

            const link = network.links[this.currentLinkId];
            if (!link) return;
            const myLane = link.lanes[this.currentLaneIndex];
            const laneWidth = myLane ? myLane.width : 3.0;

            const { leader, gap } = this.findLeader(allVehicles, network);

            // 取得車道容許的最大偏移量 (邊緣保留 0.4m 緩衝)
            const maxOffset = Math.max(0, (laneWidth / 2) - (this.width / 2) - 0.4);
            if (maxOffset <= 0.1) return; // 車道太窄，維持原狀

            // 主動錯位邏輯：當前方 30 米內有車時
            if (leader && gap < 30) {
                const leaderOffset = leader.lateralOffset || 0;
                const myOffset = this.targetLateralOffset;

                // 如果我跟前車橫向對齊了（相差小於 0.8m），主動尋找縫隙交錯
                if (Math.abs(myOffset - leaderOffset) < 0.8) {
                    const leftSpace = maxOffset - leaderOffset;
                    const rightSpace = leaderOffset - (-maxOffset);

                    let shiftDirection = 0;
                    if (leftSpace > rightSpace + 0.5) shiftDirection = 1;      // 左側空間大，往左偏
                    else if (rightSpace > leftSpace + 0.5) shiftDirection = -1;// 右側空間大，往右偏
                    // ★ 蛇行修復：空間差不多時延續目前橫移方向，取代隨機選邊，
                    //   避免前後機車連續決策左右交替、互相引發 S 形擺盪
                    else shiftDirection = (this.targetLateralOffset >= this.lateralOffset) ? 1 : -1;

                    // 新目標：前車位置錯開 1.2 公尺
                    let newTarget = leaderOffset + (shiftDirection * 1.2);

                    // 防止撞牆
                    newTarget = Math.max(-maxOffset, Math.min(maxOffset, newTarget));

                    this.targetLateralOffset = newTarget;
                    this.filterCooldown = 1.5 + Math.random() * 2.0; // 冷卻 1.5 ~ 3.5 秒
                }
            }
            // 自然游離邏輯：前方空曠且車道寬度大於 2 公尺時
            else if (maxOffset > 1.0) {
                // 機車會傾向回到自己專屬的隨機偏好位置，打破同縱列排隊的現象
                const preferredOffset = (this.preferredBias || 0) * maxOffset;

                if (Math.abs(this.targetLateralOffset - preferredOffset) > 0.5) {
                    this.targetLateralOffset = preferredOffset;
                    this.filterCooldown = 4.0 + Math.random() * 3.0; // 慢慢飄移，冷卻長
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
                // [修正] 只過濾出「來源車道」與「目標車道」皆允許本車通行的 Transitions
                const transitions = node.transitions.filter(t =>
                    t.sourceLinkId === this.currentLinkId &&
                    t.destLinkId === selectedLinkId &&
                    this.isLaneAllowed(network, t.sourceLinkId, t.sourceLaneIndex) &&
                    this.isLaneAllowed(network, t.destLinkId, t.destLaneIndex)
                );

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
                const destNodeId = currentLink ? currentLink.destination : null;
                const destNode = destNodeId ? network.nodes[destNodeId] : null;

                // 若目標路口節點不存在或無轉向過渡線 (例如直連路段或邊界端點)，直接切換至下一路段
                if (!destNode || !destNode.transitions) {
                    this.switchToNextLink(leftoverDistance, network);
                    return;
                }

                // --- 兩段式左轉判定 (機車專用) ---
                if (this.isMotorcycle) {
                    const nextLinkObj = network.links[nextLinkId];
                    const isLeftTurn = this.checkIsLeftTurn(network, currentLink, nextLinkObj);

                    if (isLeftTurn) {
                        const boxes = network.twoStageBoxMap ? network.twoStageBoxMap[destNodeId] : null;

                        if (boxes && boxes.length > 0) {
                            const targetBox = this.findBestBox(boxes, currentLink);
                            if (targetBox) {
                                this.state = 'inIntersection';
                                this.twoStageState = 'moving_to_box';
                                this.waitingBox = targetBox;
                                this.currentTransition = null;

                                this.maxSpeed = 20 / 3.6;
                                this.accel = 0;
                                if (typeof targetBox.waitingCount === 'undefined') targetBox.waitingCount = 0;
                                const idx = targetBox.waitingCount;
                                targetBox.waitingCount++;

                                const bikeW = 0.8;
                                const bikeL = 2.0;
                                const padding = 0.5;
                                const boxW = Math.max(parseFloat(targetBox.width) || 4.0, 2.0);
                                const boxL = Math.max(parseFloat(targetBox.length) || 2.5, 2.0);
                                const capacityPerRow = Math.max(1, Math.floor((boxW - padding) / bikeW));
                                const col = idx % capacityPerRow;
                                const row = Math.floor(idx / capacityPerRow);

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

                                const cornerFR_x = targetBox.x + (vecFwd.x * boxL / 2) + (vecRight.x * boxW / 2);
                                const cornerFR_y = targetBox.y + (vecFwd.y * boxL / 2) + (vecRight.y * boxW / 2);
                                const moveLeft = padding + (col * bikeW) + (bikeW / 2);
                                const moveBack = padding + (row * bikeL) + (bikeL / 2);

                                const endPos = {
                                    x: cornerFR_x - (vecRight.x * moveLeft) - (vecFwd.x * moveBack),
                                    y: cornerFR_y - (vecRight.y * moveLeft) - (vecFwd.y * moveBack)
                                };

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

                                return;
                            }
                        }
                    }
                }

                // =================================================================
                // 路口車道自我修復邏輯 (防死亡交叉)
                // =================================================================
                let transition = destNode.transitions.find(t =>
                    t.sourceLinkId === this.currentLinkId &&
                    t.sourceLaneIndex === this.currentLaneIndex &&
                    t.destLinkId === nextLinkId &&
                    this.isLaneAllowed(network, nextLinkId, t.destLaneIndex)
                );

                if (!transition) {
                    transition = destNode.transitions.find(t =>
                        t.sourceLinkId === this.currentLinkId &&
                        t.destLinkId === nextLinkId &&
                        this.isLaneAllowed(network, nextLinkId, t.destLaneIndex)
                    );
                }

                if (!transition) {
                    const baseTransition = destNode.transitions.find(t =>
                        t.sourceLinkId === this.currentLinkId &&
                        t.destLinkId === nextLinkId
                    );

                    if (baseTransition) {
                        const nextLinkObj = network.links[nextLinkId];
                        if (nextLinkObj) {
                            const allowedLanes = Object.keys(nextLinkObj.lanes)
                                .map(Number)
                                .filter(idx => this.isLaneAllowed(network, nextLinkId, idx));

                            if (allowedLanes.length > 0) {
                                let bestLane = allowedLanes[0];
                                let minDiff = Math.abs(this.currentLaneIndex - bestLane);
                                for (const l of allowedLanes) {
                                    const diff = Math.abs(this.currentLaneIndex - l);
                                    if (diff < minDiff) {
                                        minDiff = diff;
                                        bestLane = l;
                                    }
                                }
                                transition = { ...baseTransition, destLaneIndex: bestLane };
                            } else {
                                transition = baseTransition;
                            }
                        }
                    }
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

                        const maxCurveOffset = 1.0;
                        this.targetLateralOffset = Math.max(-maxCurveOffset, Math.min(maxCurveOffset, this.targetLateralOffset));

                        const points = transition.bezier.points.map(p => ({ x: p.x, y: p.y }));
                        this.currentPath = points;

                        // =================================================================
                        // ★★★ [關鍵修復] 雙端點動態軌跡補償與真實長度估算 ★★★
                        // =================================================================

                        const bezierP0 = points[0];
                        const currentLaneObj = currentLink.lanes[this.currentLaneIndex];

                        // 【修復 1】取得當前車道的真正末端座標，避免使用落後一幀的 this.x/y 導致起點回彈
                        const posData = this.getPositionOnPath(currentLaneObj.path, currentLaneObj.length);

                        if (posData) {
                            const nx = -Math.sin(posData.angle);
                            const ny = Math.cos(posData.angle);
                            // 真實起點：車道末端中心 + 車輛目前的橫向偏移
                            const perfectStartX = posData.x + nx * this.lateralOffset;
                            const perfectStartY = posData.y + ny * this.lateralOffset;

                            this.startCorrection = {
                                dx: perfectStartX - bezierP0.x,
                                dy: perfectStartY - bezierP0.y
                            };
                        } else {
                            this.startCorrection = { dx: this.x - bezierP0.x, dy: this.y - bezierP0.y };
                        }

                        // 吸收橫向偏移
                        this.lateralOffset = 0;
                        this.targetLateralOffset = 0;

                        // 計算終點誤差
                        const bezierP3 = points[3];
                        let endDx = 0, endDy = 0;
                        const nextLinkObj = network.links[nextLinkId];
                        if (nextLinkObj && nextLinkObj.lanes[transition.destLaneIndex]) {
                            const trueStartPoint = nextLinkObj.lanes[transition.destLaneIndex].path[0];
                            if (trueStartPoint) {
                                endDx = trueStartPoint.x - bezierP3.x;
                                endDy = trueStartPoint.y - bezierP3.y;
                            }
                        }
                        this.endCorrection = { dx: endDx, dy: endDy };

                        // 【修復 2】數值積分估算變形後(Morphed)的真實曲線長度，防瞬間移動
                        let trueLength = 0;
                        let lastX = bezierP0.x + this.startCorrection.dx;
                        let lastY = bezierP0.y + this.startCorrection.dy;
                        const steps = 15; // 取 15 段進行平滑估算

                        for (let i = 1; i <= steps; i++) {
                            const t_val = i / steps;
                            const pt = Geom.Bezier.getPoint(t_val, points[0], points[1], points[2], points[3]);

                            const t2_val = t_val * t_val;
                            const t3_val = t2_val * t_val;
                            const wStart = 1.0 - 3.0 * t2_val + 2.0 * t3_val;
                            const wEnd = 3.0 * t2_val - 2.0 * t3_val;

                            const currX = pt.x + this.startCorrection.dx * wStart + this.endCorrection.dx * wEnd;
                            const currY = pt.y + this.startCorrection.dy * wStart + this.endCorrection.dy * wEnd;

                            trueLength += Math.hypot(currX - lastX, currY - lastY);
                            lastX = currX;
                            lastY = currY;
                        }

                        // 覆寫 XML 給的理論長度，改用物理拉長/縮短後的真實長度
                        this.currentPathLength = Math.max(0.1, trueLength);
                        // =================================================================

                        this.distanceOnPath = leftoverDistance;
                    } else {
                        this.finished = true;
                    }
                }
            } else if (this.state === 'inIntersection') {
                if (this.twoStageState === 'leaving_box') {
                    this.twoStageState = 'none';
                    this.waitingBox = null;

                    this.switchToNextLink(leftoverDistance, network);

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
                            const rand = Math.random();
                            if (rand < 0.6) this.preferredBias = -0.5 - (Math.random() * 0.4);
                            else if (rand < 0.8) this.preferredBias = (Math.random() - 0.5) * 0.4;
                            else this.preferredBias = 0.5 + (Math.random() * 0.4);

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
            if (!node || !node.transitions) return true;

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
        // --- [新增] 輔助：判斷是否右轉 ---
        checkIsRightTurn(network, linkIn, linkOut) {
            if (!linkIn || !linkOut) return false;
            const getAngle = (l, isStart) => {
                const lanes = Object.values(l.lanes);
                if (lanes.length === 0) return 0;
                const path = lanes[0].path;
                if (path.length < 2) return 0;
                const p1 = isStart ? path[0] : path[path.length - 2];
                const p2 = isStart ? path[1] : path[path.length - 1];
                return Math.atan2(p2.y - p1.y, p2.x - p1.x);
            };
            const a1 = getAngle(linkIn, false);
            const a2 = getAngle(linkOut, true);
            let diff = a2 - a1;
            while (diff <= -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            // Canvas座標系(Y-Down)：右轉為正角度
            return (diff > 0.2 && diff < 2.8);
        }

        // --- [新增] 輔助：判斷是否準備進行右轉 ---
        isPreparingForRightTurn(network) {
            if (!this.isMotorcycle) return false;
            const nextLinkIndex = this.currentLinkIndex + 1;
            if (nextLinkIndex >= this.route.length) return false;

            const currentLink = network.links[this.currentLinkId];
            const nextLinkId = this.route[nextLinkIndex];
            const nextLink = network.links[nextLinkId];
            if (!currentLink || !nextLink) return false;

            return this.checkIsRightTurn(network, currentLink, nextLink);
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
            if (!destNode || !destNode.transitions) return;

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

            // =================================================================
            // ★★★ [修正] 兩段式左轉機車預判起步時，應看「直行」燈號 ★★★
            // =================================================================
            let effectiveTurnGroupId = myTransition.turnGroupId;

            if (this.isPreparingForTwoStageTurn(network)) {
                let straightTransition = destNode.transitions.find(t => {
                    if (t.sourceLinkId !== this.currentLinkId) return false;
                    const srcLink = network.links[t.sourceLinkId];
                    const dstLink = network.links[t.destLinkId];
                    if (!srcLink || !dstLink) return false;

                    const a1 = getLinkAngle(srcLink, true);
                    const a2 = getLinkAngle(dstLink, false);
                    let diff = a2 - a1;
                    while (diff <= -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;

                    return Math.abs(diff) < 0.6 && t.turnGroupId;
                });

                if (straightTransition) {
                    effectiveTurnGroupId = straightTransition.turnGroupId;
                }
            }

            const signal = tfl.getSignalForTurnGroup(effectiveTurnGroupId);

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
            // ===========================================
            // ★★★ [新增] 重置路口補償狀態 ★★★
            // ===========================================
            this.startCorrection = null;
            this.endCorrection = null;
            // ===========================================

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

                // [改善 #8] 蜂群模式再次觸發，但保留最低安全距離
                this.swarmTimer = 4.0;
                this.minGap = 0.3;
                this.headwayTime = 0.4;
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

                // 換道期間持續碰撞監控
                if (this.laneChangeState.progress < 1) {
                    const toLane = this.laneChangeState.toLaneIndex;
                    for (const other of allVehicles) {
                        if (other.id === this.id) continue;
                        if (other.currentLinkId !== this.currentLinkId) continue;
                        const otherEffectiveLane = other.laneChangeState
                            ? other.laneChangeState.toLaneIndex
                            : other.currentLaneIndex;
                        if (otherEffectiveLane !== toLane) continue;
                        const distDiff = other.distanceOnPath - this.distanceOnPath;

                        // 前方近距離車輛
                        if (distDiff > 0) {
                            const realGap = distDiff - (other.length / 2) - (this.length / 2);
                            if (realGap < this.minGap * 0.5) {
                                this.laneChangeState = null;
                                this.laneChangeCooldown = 3.0;
                                this.targetLateralOffset = 0;
                                return;
                            }
                        }
                        // 後方快速接近車輛
                        if (distDiff < 0 && distDiff > -(this.length + other.length + 5)) {
                            const approachSpeed = other.speed - this.speed;
                            if (approachSpeed > 3.0) {
                                this.laneChangeState = null;
                                this.laneChangeCooldown = 3.0;
                                this.targetLateralOffset = 0;
                                return;
                            }
                        }
                    }
                }

                if (this.laneChangeState && this.laneChangeState.progress >= 1) {
                    this.currentLaneIndex = this.laneChangeState.toLaneIndex;
                    this.lateralOffset = this.laneChangeState.endOffset;
                    if (this.isMotorcycle) {
                        this.targetLateralOffset = this.lateralOffset;
                    } else {
                        this.targetLateralOffset = 0;
                    }
                    this.laneChangeState = null;
                    this.laneChangeCooldown = 5.0;

                    // ★★★ 加入這兩行重置角度狀態 ★★★
                    this.yawBias = 0;
                    this.steeringAngle = 0;
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

                    // =========================================================
                    // ★★★ [新增] 最終物理防線：執行換道前，嚴格攔截禁止跨越的標線
                    // 解決 decideNextLink 產生的強制目標覆蓋問題
                    // =========================================================
                    if (!this.canCrossStroke(network, this.currentLinkId, this.currentLaneIndex, nextLaneIndex)) {
                        // 標線不允許跨越，車輛被困在當前車道，取消換道意圖
                        this.laneChangeGoal = null;
                        this.laneChangeCooldown = 2.0; // 給予冷卻，避免每幀重複計算
                        return; // 拒絕執行
                    }
                    // =========================================================

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
            // ★★★ [新增] 交通錐佔用全車道：緊急強制換道 ★★★
            // =================================================================
            if (this.coneForcedLaneChange) {
                const adjacentLanes = [this.currentLaneIndex - 1, this.currentLaneIndex + 1];
                let bestLane = null;
                let maxGap = -1; // 尋找最空曠的安全車道

                for (const targetLane of adjacentLanes) {
                    if (link.lanes[targetLane] && this.isLaneAllowed(network, this.currentLinkId, targetLane)) {
                        // ★ [新增] 檢查實體標線是否允許跨越
                        if (!this.canCrossStroke(network, this.currentLinkId, this.currentLaneIndex, targetLane)) continue;
                        // ★★★ [新增防呆] 確保隔壁避難車道前方沒有槽化線，否則換過去還是死路一條 ★★★
                        let hitsPolygon = false;
                        if (network.channelizationPolygons) {
                            for (let s = 2.0; s <= 25.0; s += 3.0) {
                                const checkDist = this.distanceOnPath + s;
                                if (checkDist <= link.lanes[targetLane].length) {
                                    const posData = this.getPositionOnPath(link.lanes[targetLane].path, checkDist);
                                    if (posData && network.channelizationPolygons.some(poly => Geom.Utils.isPointInPolygon({ x: posData.x, y: posData.y }, poly))) {
                                        hitsPolygon = true; break;
                                    }
                                }
                            }
                        }
                        if (hitsPolygon) continue; // 這條車道也有槽化線，放棄！

                        // 檢查換過去是否安全 (不會撞到旁邊的車)
                        if (this.isSafeToChange(targetLane, allVehicles)) {
                            const { leader } = this.getLaneLeader(targetLane, allVehicles);
                            const gapToLeader = leader ? leader.distanceOnPath - this.distanceOnPath : Infinity;

                            if (gapToLeader > maxGap) {
                                maxGap = gapToLeader;
                                bestLane = targetLane;
                            }
                        }
                    }
                }

                if (bestLane !== null) {
                    this.laneChangeGoal = bestLane;
                }
                return; // 若受壓迫，優先處理此換道
            }
            // =================================================================/ =================================================================

            const distanceToEnd = lane.length - this.distanceOnPath;
            if (distanceToEnd < 2.0) return;
            if (distanceToEnd > 150) return;

            // ... (下方保持原有的標準 Graph 換道邏輯) ...
            const nextLinkId = this.route[this.currentLinkIndex + 1];
            if (!nextLinkId) return;
            const destNode = network.nodes[link.destination];
            if (!destNode || !destNode.transitions) return;
            const canPass = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === this.currentLaneIndex && t.destLinkId === nextLinkId);
            if (canPass) return;

            // 尋找可通行的車道
            const suitableLanes = [];
            for (const laneIdx in link.lanes) {
                const targetLane = parseInt(laneIdx, 10);

                // [新增] 檢查這條車道是否允許本車駛入
                if (!this.isLaneAllowed(network, this.currentLinkId, targetLane)) continue;
                // ★ [新增] 檢查實體標線是否允許跨越 (只適用於相鄰車道，跨多車道時先擋第一關)
                if (Math.abs(this.currentLaneIndex - targetLane) === 1) {
                    if (!this.canCrossStroke(network, this.currentLinkId, this.currentLaneIndex, targetLane)) continue;
                }
                // ★★★ [終極修正] 檢查目標車道前方是否有槽化線，若有則直接放棄該車道 ★★★
                let hitsPolygon = false;
                if (network.channelizationPolygons) {
                    for (let s = 5.0; s <= 20.0; s += 5.0) {
                        const checkDist = this.distanceOnPath + s;
                        if (checkDist <= link.lanes[targetLane].length) {
                            const posData = this.getPositionOnPath(link.lanes[targetLane].path, checkDist);
                            if (posData && network.channelizationPolygons.some(poly => Geom.Utils.isPointInPolygon({ x: posData.x, y: posData.y }, poly))) {
                                hitsPolygon = true; break;
                            }
                        }
                    }
                }
                if (hitsPolygon) continue;
                // [修正] 同時檢查銜接的目標車道是否也允許
                const canPassOnNewLane = destNode.transitions.some(t =>
                    t.sourceLinkId === this.currentLinkId &&
                    t.sourceLaneIndex === targetLane &&
                    t.destLinkId === nextLinkId &&
                    this.isLaneAllowed(network, t.destLinkId, t.destLaneIndex)
                );
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
            if (!destNode || !destNode.transitions) return;

            if (this.isMotorcycle && this.currentLaneIndex < maxLaneIndex) {
                const targetLane = this.currentLaneIndex + 1;
                if (link.lanes[targetLane] && this.isLaneAllowed(network, this.currentLinkId, targetLane)) {

                    // ★ [新增] 檢查機車超車時，標線是否允許跨越 (實虛線規則)
                    if (this.canCrossStroke(network, this.currentLinkId, this.currentLaneIndex, targetLane)) {

                        // ★★★ [終極修正] 機車超車避開槽化線 ★★★
                        let hitsPolygon = false;
                        if (network.channelizationPolygons) {
                            for (let s = 5.0; s <= 20.0; s += 5.0) {
                                const checkDist = this.distanceOnPath + s;
                                if (checkDist <= link.lanes[targetLane].length) {
                                    const posData = this.getPositionOnPath(link.lanes[targetLane].path, checkDist);
                                    if (posData && network.channelizationPolygons.some(poly => Geom.Utils.isPointInPolygon({ x: posData.x, y: posData.y }, poly))) {
                                        hitsPolygon = true; break;
                                    }
                                }
                            }
                        }

                        // 如果沒有撞到槽化線，才繼續後續判斷
                        if (!hitsPolygon) {
                            const canPass = destNode.transitions.some(t =>
                                t.sourceLinkId === this.currentLinkId &&
                                t.sourceLaneIndex === targetLane &&
                                t.destLinkId === nextLinkId &&
                                this.isLaneAllowed(network, t.destLinkId, t.destLaneIndex)
                            );

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
                }
            }

            const adjacentLanes = [this.currentLaneIndex - 1, this.currentLaneIndex + 1];
            const { leader: currentLeader } = this.getLaneLeader(this.currentLaneIndex, allVehicles);
            for (const targetLane of adjacentLanes) {
                if (!link.lanes[targetLane]) continue;
                if (!this.isLaneAllowed(network, this.currentLinkId, targetLane)) continue;

                // ★ [新增] 檢查一般車輛換道時，標線是否允許跨越 (實虛線規則)
                if (!this.canCrossStroke(network, this.currentLinkId, this.currentLaneIndex, targetLane)) continue;

                // ★★★ [終極修正] 一般換道避開槽化線 ★★★
                let hitsPolygon = false;
                if (network.channelizationPolygons) {
                    for (let s = 5.0; s <= 20.0; s += 5.0) {
                        const checkDist = this.distanceOnPath + s;
                        if (checkDist <= link.lanes[targetLane].length) {
                            const posData = this.getPositionOnPath(link.lanes[targetLane].path, checkDist);
                            if (posData && network.channelizationPolygons.some(poly => Geom.Utils.isPointInPolygon({ x: posData.x, y: posData.y }, poly))) {
                                hitsPolygon = true; break;
                            }
                        }
                    }
                }
                if (hitsPolygon) continue; // 發現槽化線，放棄這條車道

                if (this.isMotorcycle && targetLane < this.currentLaneIndex) {
                    if (currentLeader && currentLeader.speed > 0.5) continue;
                }
                const canPass = destNode.transitions.some(t =>
                    t.sourceLinkId === this.currentLinkId &&
                    t.sourceLaneIndex === targetLane &&
                    t.destLinkId === nextLinkId &&
                    this.isLaneAllowed(network, t.destLinkId, t.destLaneIndex)
                );
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
            // ==========================================
            // [P0 修正] 兩段式前往待轉區：基礎前車偵測 (取代盲目豁免)
            // ==========================================
            if (this.twoStageState === 'moving_to_box') {
                let closestGap = Infinity;
                let closestLeader = null;
                const scanRange = 30.0; // 掃描前方 30 公尺

                // 使用當前路徑切線角度作為前進向量
                const cosA = Math.cos(this.angle);
                const sinA = Math.sin(this.angle);

                for (const other of allVehicles) {
                    if (other.id === this.id) continue;
                    // 忽略已經在待轉區停等或離開的車輛，避免誤判擋住路徑
                    if (other.twoStageState === 'waiting' || other.twoStageState === 'leaving_box') continue;

                    const dx = other.x - this.x;
                    const dy = other.y - this.y;

                    // 投影至機車當前行進方向 (Forward) 與側向 (Side)
                    const fwdDist = dx * cosA + dy * sinA;
                    const sideDist = Math.abs(-dx * sinA + dy * cosA);

                    // 判斷是否在前方掃描區內
                    if (fwdDist > 0 && fwdDist < scanRange) {
                        // 動態橫向安全閾值：雙方半寬 + 0.3m 緩衝
                        const safeSideThreshold = (this.width / 2) + (other.width / 2) + 0.3;

                        if (sideDist < safeSideThreshold) {
                            // 計算實際車頭至前方車尾的淨空距離
                            const gap = fwdDist - (this.length / 2) - (other.length / 2);
                            if (gap < closestGap) {
                                closestGap = gap;
                                closestLeader = other;
                            }
                        }
                    }
                }
                // 回傳偵測結果，若無前車則給予合理大距離 (避免下游除以零或邏輯異常)
                return { leader: closestLeader, gap: Math.max(0.1, closestGap) };
            }
            // ==========================================

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
                    // ★ 穿模修復：閾值 = 兩車半寬和（車身恰好接觸）+ 5cm 緩衝
                    // 舊值 0.4m 讓兩台 0.8m 機車中心距 0.4m 時車身互疊 0.4m
                    safeLatThreshold = ((this.width + other.width) / 2) + 0.05;

                    // 蜂群模式：允許把手交錯，但確保車身不重疊 (90%)
                    if (this.swarmTimer > 0) {
                        safeLatThreshold = ((this.width + other.width) / 2) * 0.9;
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

                // =========================================================
                // IDM 標準跟車檢查 + 協作讓道 (Cooperative Yielding)
                // =========================================================
                // =========================================================
                // IDM 標準跟車檢查 + 協作讓道 (Cooperative Yielding) [修正版]
                // =========================================================
                let isSameContext = false;
                let isMergingIntoMyLane = false; // 對方是否「企圖」切入我的車道

                // 1. 判斷基本路段一致性
                const onSameLink = (this.state === 'onLink' && other.state === 'onLink' && this.currentLinkId === other.currentLinkId);
                const inSameIntersection = (this.state === 'inIntersection' && other.state === 'inIntersection' && this.currentTransition?.id === other.currentTransition?.id);

                if (onSameLink || inSameIntersection) {

                    // ★★★ [修復換道盲區]：我必須同時看「現在的車道」與「正要切過去的目標車道」
                    const myLanes = [this.currentLaneIndex];
                    if (this.laneChangeState) myLanes.push(this.laneChangeState.toLaneIndex);

                    const otherLanes = [other.currentLaneIndex];
                    if (other.laneChangeState) otherLanes.push(other.laneChangeState.toLaneIndex);

                    // 只要我們的車道範圍有交集，就視為在同一個物理空間，啟動防撞
                    if (myLanes.some(l => otherLanes.includes(l))) {
                        isSameContext = true;
                    }
                    // 情況 B (協作讓道)：他還在隔壁車道，但在我前方，且有切入意圖
                    else if (other.distanceOnPath > this.distanceOnPath) {

                        // ★★★ [新增] 方向燈意圖判斷 (Visual Intent) ★★★
                        // 判斷對方的燈號是否指向我的車道
                        let visualIntentToMerge = false;

                        // 假設 laneIndex 越大越靠右 (0:最左, N:最右)
                        // 如果他在我左邊 (Lane - 1) 且打右燈 ('right') -> 想切進來
                        if (other.currentLaneIndex === this.currentLaneIndex - 1 && other.blinker === 'right') {
                            visualIntentToMerge = true;
                        }
                        // 如果他在我右邊 (Lane + 1) 且打左燈 ('left') -> 想切進來
                        else if (other.currentLaneIndex === this.currentLaneIndex + 1 && other.blinker === 'left') {
                            visualIntentToMerge = true;
                        }

                        // 判斷依據：原本的 AI Goal 或 視覺方向燈
                        if (other.laneChangeGoal === this.currentLaneIndex || visualIntentToMerge) {
                            isMergingIntoMyLane = true;
                            isSameContext = true;
                        }
                    }
                }

                if (isSameContext) {
                    const distDiff = other.distanceOnPath - this.distanceOnPath;
                    if (distDiff > 0) {
                        // 如果是物理上已經擋住我，或者是他正在打燈準備切進來
                        if (isBlocking(other) || isMergingIntoMyLane) {
                            let currentGap = distDiff - (this.length / 2) - (other.length / 2);

                            // ★ 協作讓道魔法：欺騙 IDM 模型 ★
                            if (isMergingIntoMyLane && !other.laneChangeState) {
                                // 當偵測到對方打方向燈想切入時：
                                // 我們「人為縮短」感知的距離。
                                // IDM 算式會以為前車很近，進而鬆油門或煞車，製造出空隙讓對方切入。

                                // 調整幅度：原本減 3.0，現在可以根據相對速度微調
                                // 如果我比他快很多，要減更多 gap 來強迫煞車
                                const speedRel = this.speed - other.speed;
                                const penalty = (speedRel > 0) ? 5.0 : 3.0; // 如果我比較快，加大懲罰距離讓煞車更明顯

                                currentGap = Math.max(1.0, currentGap - penalty);
                            }

                            if (currentGap < gap) {
                                gap = currentGap;
                                leader = other;
                            }
                        }
                    }
                }
                // =========================================================
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
            // --- C. [改善 #4] 通用路口軌跡衝突偵測 ---
            /* ★★★ 將以下這幾行直接刪除 ★★★
            {
                const intersectionGap = this.detectIntersectionConflict(allVehicles, network);
                if (intersectionGap < gap) {
                    gap = intersectionGap;
                    leader = null;
                }
            }
            */

            // =================================================================
            // ★★★ [新增] 直前 OBB 物理防穿模雷達 (解決微小轉向卡點) ★★★
            // 專治：前車在路口內微小轉向(如等待左轉)，後方直行車因目的地不同而忽略前車
            // =================================================================
            if (this.state === 'onLink') {
                const cosA = Math.cos(this.angle);
                const sinA = Math.sin(this.angle);

                for (const other of allVehicles) {
                    if (other.id === this.id) continue;

                    // 只抓已經進入路口的車輛 (可能正在等待轉彎)
                    if (other.state !== 'inIntersection') continue;

                    // 忽略正在機車待轉區的機車 (不干擾正常車道)
                    if (other.twoStageState === 'waiting' || other.twoStageState === 'moving_to_box') continue;

                    const dx = other.x - this.x;
                    const dy = other.y - this.y;
                    const distSq = dx * dx + dy * dy;

                    // 掃描前方 30 公尺內 (30^2 = 900)
                    if (distSq < 900) {
                        const fwdA = dx * cosA + dy * sinA;

                        // 確保對方在我車頭前方
                        if (fwdA > 0 && fwdA < 30) {
                            const sideA = Math.abs(-dx * sinA + dy * cosA);

                            // ★ OBB 動態投影：計算對方車體投影到我橫向的有效寬度
                            // 當對方微轉向時，這個寬度會包覆它的傾斜車身
                            const angleDiff = other.angle - this.angle;
                            const effWidthB = Math.abs(Math.cos(angleDiff)) * other.width + Math.abs(Math.sin(angleDiff)) * other.length;

                            // 加上我的半寬與安全緩衝，求出橫向碰撞半徑
                            const hitMargin = (this.width / 2) + (effWidthB / 2) + 0.3;

                            // 如果對方的橫向偏移小於碰撞半徑，代表實體已經擋住我了！
                            if (sideA < hitMargin) {
                                // 計算真實「車頭到車尾」的物理距離
                                const effLengthB = Math.abs(Math.sin(angleDiff)) * other.width + Math.abs(Math.cos(angleDiff)) * other.length;
                                const physGap = fwdA - (this.length / 2) - (effLengthB / 2) - 0.2;

                                if (physGap > -1.0 && physGap < gap) {
                                    gap = Math.max(0.1, physGap);
                                    leader = other; // 強制將該車設為前車，觸發 IDM 煞車
                                }
                            }
                        }
                    }
                }
            }

            // 4. [修正核心] 預判：檢查號誌、路口衝突、下游回堵
            if (this.state === 'onLink') {
                // =================================================================
                // ★★★ [改善 #8] 彈射起步豁免邏輯 (Launch Control) ★★★
                // 不再回傳 Infinity，始終保留碰撞偵測能力
                // =================================================================
                if (this.isMotorcycle && this.swarmTimer > 0) {
                    if (!leader) {
                        // 無前車：給予最大 50m 的感知距離（非 Infinity）
                        return { leader: null, gap: Math.min(gap, 50) };
                    }
                    // 有前車：保證至少 2m 安全距離
                    if (gap > 3.0) {
                        return { leader, gap: Math.min(gap * 1.3, gap + 5) };
                    }
                    return { leader, gap: Math.max(gap, 2.0) };
                }
                // =================================================================

                const checkDistance = Math.max(50, this.speed * 4);

                if (distanceToEndOfCurrentPath < checkDistance) {
                    const nextLinkIndex = this.currentLinkIndex + 1;
                    if (nextLinkIndex < this.route.length) {
                        const currentLink = network.links[this.currentLinkId];
                        const destNode = currentLink ? network.nodes[currentLink.destination] : null;
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

                        let myTransition = null;
                        if (destNode && destNode.transitions) {
                            myTransition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === finalLane && t.destLinkId === nextLinkId);
                            if (!myTransition) {
                                myTransition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.destLinkId === nextLinkId);
                            }
                        }

                        if (myTransition) {
                            const isSignalized = network.trafficLights.some(t => t.nodeId === currentLink.destination);

                            if (isSignalized) {
                                const tfl = network.trafficLights.find(t => t.nodeId === currentLink.destination);
                                if (tfl) {
                                    // =================================================================
                                    // ★★★ [修正] 兩段式左轉機車進入待轉區前，應看「直行」燈號，而非「左轉」燈號 ★★★
                                    // =================================================================
                                    let effectiveTurnGroupId = myTransition.turnGroupId;

                                    if (this.isPreparingForTwoStageTurn(network)) {
                                        // 在該路口尋找「直行」的 Transition
                                        let straightTransition = destNode.transitions.find(t => {
                                            if (t.sourceLinkId !== this.currentLinkId) return false;
                                            const srcLink = network.links[t.sourceLinkId];
                                            const dstLink = network.links[t.destLinkId];
                                            if (!srcLink || !dstLink) return false;

                                            // 利用全域的 getLinkAngle 計算進出角度差
                                            const a1 = getLinkAngle(srcLink, true);
                                            const a2 = getLinkAngle(dstLink, false);
                                            let diff = a2 - a1;
                                            while (diff <= -Math.PI) diff += Math.PI * 2;
                                            while (diff > Math.PI) diff -= Math.PI * 2;

                                            // 角度差小於 0.6 rad (約 35度) 視為直行
                                            return Math.abs(diff) < 0.6 && t.turnGroupId;
                                        });

                                        // 若成功找到直行路徑，將號誌群組竄改為直行號誌
                                        if (straightTransition) {
                                            effectiveTurnGroupId = straightTransition.turnGroupId;
                                        }
                                    }

                                    const signal = tfl.getSignalForTurnGroup(effectiveTurnGroupId);
                                    if (signal === 'Red' || signal === 'Yellow') {
                                        let shouldStop = false;
                                        let obstacleDistance = distanceToEndOfCurrentPath;
                                        let stopLinePos;
                                        let actualDistToStop = 0; // 真實物理距離

                                        // 依據車種讀取不同的停止線設定
                                        if (this.isMotorcycle) {
                                            stopLinePos = network.motoStopLineMap ? network.motoStopLineMap[this.currentLinkId]?.[finalLane] : undefined;
                                        } else {
                                            stopLinePos = network.stopLineMap ? network.stopLineMap[this.currentLinkId]?.[finalLane] : undefined;
                                        }

                                        // =================================================================
                                        // ★★★[修復 3] 扣除車頭長度，並加入 IDM 煞車補償 ★★★
                                        // =================================================================
                                        if (stopLinePos !== undefined) {
                                            // 必須扣除車身前半段 (this.length / 2)，計算「車頭」到停止線的真實距離
                                            actualDistToStop = stopLinePos - this.distanceOnPath - (this.length / 2);

                                            if (actualDistToStop >= 0) {
                                                // 為了讓 IDM 剛好停在線上 (IDM 會在 gap == minGap 時煞停)
                                                // 我們把 gap 灌水 minGap，這樣車頭就會完美貼著停止線 0.5m 處停下
                                                obstacleDistance = actualDistToStop + this.minGap - 0.5;
                                                shouldStop = true;
                                            } else if (actualDistToStop > -3.0) {
                                                // 車頭稍微越界 (<3m 容錯，例如被推擠或煞車不及)，立即定桿煞停！
                                                obstacleDistance = 0.1;
                                                shouldStop = true;
                                            } else {
                                                // 已越界超過 3m，實質上已進入路口，直接放行避免卡死在斑馬線上
                                                shouldStop = false;
                                            }
                                        } else {
                                            // 若完全沒畫標線，預設以路段末端為準
                                            actualDistToStop = distanceToEndOfCurrentPath - (this.length / 2);
                                            obstacleDistance = actualDistToStop + this.minGap - 0.5;
                                            shouldStop = true;
                                        }

                                        // 執行煞車邏輯
                                        if (signal === 'Red') {
                                            if (shouldStop && obstacleDistance < gap) {
                                                leader = null;
                                                gap = Math.max(0.1, obstacleDistance);
                                            }
                                        } else if (signal === 'Yellow') {
                                            // 判斷煞車距離時，必須使用真實距離 (actualDistToStop) 而非灌水的 obstacleDistance
                                            const requiredBrakingDistance = (this.speed * this.speed) / (2 * this.comfortDecel);
                                            if (shouldStop && actualDistToStop > requiredBrakingDistance && obstacleDistance < gap) {
                                                leader = null;
                                                gap = Math.max(0.1, obstacleDistance);
                                            }
                                        }
                                    }
                                }
                            }

                            // ============== 開始替換 ==============
                            const nextLinkTargetLane = myTransition.destLaneIndex;
                            const transitionLen = myTransition.bezier ? myTransition.bezier.length : 10.0;

                            let targetLeaderGap = Infinity;
                            let targetLeader = null;
                            let minTargetDist = Infinity;
                            let tailVehicleSpeed = 0;

                            for (const other of allVehicles) {
                                if (other.id === this.id) continue;
                                let isTarget = false;
                                let distInNext = 0;

                                // 1. 對方已經在目標路段上
                                if (other.state === 'onLink' && other.currentLinkId === nextLinkId && other.currentLaneIndex === nextLinkTargetLane) {
                                    isTarget = true;
                                    distInNext = other.distanceOnPath;
                                }
                                // 2. 對方已經在路口內，且目的地跟我一樣
                                else if (other.state === 'inIntersection' && other.currentTransition?.destLinkId === nextLinkId && other.currentTransition?.destLaneIndex === nextLinkTargetLane) {
                                    if (other.twoStageState && other.twoStageState !== 'none') {
                                        isTarget = false; // 待轉機車不算
                                    } else {
                                        isTarget = true;
                                        distInNext = -(transitionLen - other.distanceOnPath);
                                    }
                                }
                                // =================================================================
                                // ★★★ [新增] 3. 預判匯流：對方跟我一樣還在等紅燈，但目的地車道重疊！ ★★★
                                // =================================================================
                                else if (other.state === 'onLink' && other.currentLinkId === this.currentLinkId && other.currentLaneIndex !== this.currentLaneIndex) {
                                    const otherNextLinkIndex = other.currentLinkIndex + 1;
                                    if (otherNextLinkIndex < other.route.length) {
                                        const otherNextLinkId = other.route[otherNextLinkIndex];
                                        const otherDestNode = currentLink ? network.nodes[currentLink.destination] : null;

                                        // 找出對方的過彎規則
                                        let otherTrans = null;
                                        if (otherDestNode && otherDestNode.transitions) {
                                            otherTrans = otherDestNode.transitions.find(t => t.sourceLinkId === other.currentLinkId && t.sourceLaneIndex === other.currentLaneIndex && t.destLinkId === otherNextLinkId);
                                            if (!otherTrans) {
                                                otherTrans = otherDestNode.transitions.find(t => t.sourceLinkId === other.currentLinkId && t.destLinkId === otherNextLinkId);
                                            }
                                        }

                                        // 如果他的終點 Link 與 車道，跟我們完全一樣 (發生匯流衝突)
                                        if (otherTrans && otherTrans.destLinkId === nextLinkId && otherTrans.destLaneIndex === nextLinkTargetLane) {
                                            const myDistToEnd = distanceToEndOfCurrentPath;
                                            const otherDistToEnd = other.currentPathLength - other.distanceOnPath;

                                            // 誰離停止線比較遠 (或距離一樣但我 ID 較大)，誰就當小弟讓行 (拉鍊式匯流)
                                            if (myDistToEnd > otherDistToEnd || (Math.abs(myDistToEnd - otherDistToEnd) < 0.5 && this.id > other.id)) {
                                                isTarget = true;
                                                // 預估對方在路口內的領先距離
                                                distInNext = -(transitionLen + otherDistToEnd);
                                            }
                                        }
                                    }
                                }

                                if (isTarget) {
                                    // 1. 計算物理追撞距離
                                    const physicalGap = (distanceToEndOfCurrentPath + transitionLen + distInNext) - (this.length / 2) - (other.length / 2);

                                    // 機車起步與邊界並排豁免邏輯
                                    if (this.isMotorcycle && other.isMotorcycle && this.state === 'onLink' && other.state === 'onLink') {
                                        const isSwarmStart = (this.swarmTimer > 0) || (this.speed < 3.0 && other.speed > 0.1);
                                        if (isSwarmStart) {
                                            targetLeaderGap = Math.min(targetLeaderGap, physicalGap * 0.7);
                                            continue;
                                        }
                                    }

                                    if (physicalGap < targetLeaderGap) {
                                        targetLeaderGap = physicalGap;
                                        targetLeader = other;
                                    }

                                    // 2. 記錄用以判斷路口是否回堵
                                    const rearDist = distInNext - (other.length / 2);
                                    if (rearDist < minTargetDist) {
                                        minTargetDist = rearDist;
                                        tailVehicleSpeed = other.speed;
                                    }
                                }
                            }

                            // 將目標車道的最後一台車納入標準跟車考量
                            if (targetLeaderGap < gap) {
                                gap = targetLeaderGap;
                                leader = targetLeader;
                            }

                            // ★★★ [核心修復] 保持路口淨空邏輯 (Clear Intersection Rule) ★★★
                            // 目的：避免下游塞車時，車輛依然開進路口導致打死結 (Gridlock)
                            if (minTargetDist !== Infinity) {
                                // 計算需要的空間：車長 + 安全緩衝 (汽車2m，機車0.5m容忍度較高)
                                const requiredSpace = this.length + (this.isMotorcycle ? 0.5 : 2.0);

                                // 若下游空間不足以容納本車，且車流緩慢(塞車狀態)
                                if (minTargetDist < requiredSpace && tailVehicleSpeed < 3.0) {

                                    // 計算本車到停止線的實際距離
                                    let actualDistToStop = distanceToEndOfCurrentPath - (this.length / 2);
                                    let stopLinePos;
                                    if (this.isMotorcycle) {
                                        stopLinePos = network.motoStopLineMap ? network.motoStopLineMap[this.currentLinkId]?.[finalLane] : undefined;
                                    } else {
                                        stopLinePos = network.stopLineMap ? network.stopLineMap[this.currentLinkId]?.[finalLane] : undefined;
                                    }

                                    if (stopLinePos !== undefined) {
                                        actualDistToStop = stopLinePos - this.distanceOnPath - (this.length / 2);
                                    }

                                    // 若車頭還沒完全越過停止線(給予2m容錯避免急煞倒退)，強制在停止線煞停
                                    if (actualDistToStop > -2.0) {
                                        const stopLineGap = actualDistToStop + this.minGap - 0.5;
                                        if (stopLineGap < gap) {
                                            gap = Math.max(0.1, stopLineGap);
                                            leader = null; // 設為虛擬障礙物，強制煞車不進路口
                                        }
                                    }
                                }
                            }
                            // ============== 結束替換 ==============
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
                // =========================================================
                // [終極版] 路口內貝茲曲線防穿模與匯流/交叉邏輯
                // =========================================================
                // =========================================================
                // [終極無死結版] 非對稱 OBB 動態雷達與匯流防撞
                // =========================================================
            } else if (this.state === 'inIntersection' && this.currentTransition) {
                const myDestLink = this.currentTransition.destLinkId;
                const myDestLane = this.currentTransition.destLaneIndex;

                for (const other of allVehicles) {
                    if (other.id === this.id) continue;

                    // 忽略正在待轉的機車
                    if (this.twoStageState === 'moving_to_box' ||
                        other.twoStageState === 'moving_to_box' ||
                        other.twoStageState === 'waiting') {
                        continue;
                    }

                    // =========================================================
                    // 1. 目的地匯流預判 (Merge Check)
                    // 解決平行切入同一車道時的擠壓問題
                    // =========================================================
                    if (other.state === 'onLink' && other.currentLinkId === myDestLink && other.currentLaneIndex === myDestLane) {
                        const myDistToExit = this.currentPathLength - this.distanceOnPath;
                        const lookaheadGap = myDistToExit + other.distanceOnPath - (this.length / 2) - (other.length / 2);
                        if (lookaheadGap > -1.0 && lookaheadGap < gap) {
                            gap = Math.max(0.1, lookaheadGap);
                            leader = other;
                        }
                        continue; // 已在出口車道，交由上述處理即可
                    }

                    if (other.state === 'inIntersection' && other.currentTransition &&
                        other.currentTransition.destLinkId === myDestLink &&
                        other.currentTransition.destLaneIndex === myDestLane) {

                        const myDistToExit = this.currentPathLength - this.distanceOnPath;
                        const otherDistToExit = other.currentPathLength - other.distanceOnPath;

                        // 誰離出口遠，誰就讓行 (拉鍊式匯流)
                        if (myDistToExit > otherDistToExit) {
                            const mergeGap = (myDistToExit - otherDistToExit) - (this.length / 2) - (other.length / 2);
                            if (mergeGap > -1.0 && mergeGap < gap) {
                                gap = Math.max(0.1, mergeGap);
                                leader = other;
                            }
                        }
                    }

                    // =========================================================
                    // 2. ★ 非對稱 OBB 物理雷達 (Asymmetric Physical Radar) ★
                    // 解決同車道分岔、T型側撞、X型交叉與死結問題
                    // =========================================================
                    if (other.state === 'inIntersection' || other.state === 'onLink') {
                        const dx = other.x - this.x;
                        const dy = other.y - this.y;
                        const distSq = dx * dx + dy * dy;

                        // 只掃描半徑 15米 內的車輛
                        if (distSq < 225) {
                            // --- 本車視角 (A看B) ---
                            const fwdA = dx * Math.cos(this.angle) + dy * Math.sin(this.angle);
                            const sideA = Math.abs(-dx * Math.sin(this.angle) + dy * Math.cos(this.angle));

                            // --- 他車視角 (B看A) ---
                            const fwdB = -dx * Math.cos(other.angle) - dy * Math.sin(other.angle);
                            const sideB = Math.abs(dx * Math.sin(other.angle) - dy * Math.cos(other.angle));

                            // --- 動態計算 OBB 投影碰撞寬度 ---
                            const angleDiff = other.angle - this.angle;
                            const effWidthB = Math.abs(Math.cos(angleDiff)) * other.width + Math.abs(Math.sin(angleDiff)) * other.length;
                            const effLengthB = Math.abs(Math.sin(angleDiff)) * other.width + Math.abs(Math.cos(angleDiff)) * other.length;
                            const effWidthA = Math.abs(Math.cos(angleDiff)) * this.width + Math.abs(Math.sin(angleDiff)) * this.length;

                            const hitMarginA = (this.width / 2) + (effWidthB / 2) + 0.3; // A 撞 B 的橫向容許值
                            const hitMarginB = (other.width / 2) + (effWidthA / 2) + 0.3; // B 撞 A 的橫向容許值

                            // 判定是否在彼此的「正前方撞擊區」
                            const AisHittingB = (fwdA > 0 && sideA < hitMarginA);
                            const BisHittingA = (fwdB > 0 && sideB < hitMarginB);

                            if (AisHittingB) {
                                let shouldYield = false;

                                if (BisHittingA) {
                                    // 【情況 1：互相衝向對方 (X型交叉)】-> 啟動路權分數打破死結
                                    const myScore = (this.distanceOnPath / this.currentPathLength) + (this.speed * 0.05) + (this.id > other.id ? 0.01 : -0.01);
                                    let otherScore = 0;

                                    if (other.state === 'inIntersection') {
                                        otherScore = (other.distanceOnPath / other.currentPathLength) + (other.speed * 0.05);
                                    } else {
                                        otherScore = 999; // 已經在直行路段上的車具有絕對路權
                                    }

                                    if (myScore < otherScore) {
                                        shouldYield = true; // 我分數低，我讓
                                    }
                                } else {
                                    // 【情況 2：單方面阻擋 (T型側撞 / 追尾)】
                                    // 我快撞到對方了，但對方並沒有衝向我 (例如汽車停在路口，機車從側面靠近)
                                    // 無視分數，我絕對必須踩煞車！對方不會踩煞車，完美破除死結！
                                    shouldYield = true;
                                }

                                // 執行煞車計算
                                if (shouldYield) {
                                    // 計算車頭到對方車體的距離
                                    const physGap = fwdA - (this.length / 2) - (effLengthB / 2) - 0.2;
                                    if (physGap > -1.0 && physGap < gap) {
                                        gap = Math.max(0.1, physGap);
                                        leader = other;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return { leader, gap: Math.max(0.1, gap) };
        }
        // ==================================================================================
        // ★★★ 防碰撞與預判邏輯核心群 (請確保這三個函數都在 class Vehicle 內部) ★★★
        // ==================================================================================

        /**
                 *[終極優化版] 偵測行人衝突 (Pedestrian Yielding)
                 */
        detectPedestrianConflict(simulation) {
            let minVirtualGap = Infinity;
            if (!simulation || !simulation.pedManager) return minVirtualGap;

            if (this.twoStageState === 'moving_to_box' || this.twoStageState === 'waiting') {
                return minVirtualGap;
            }

            const peds = simulation.pedManager.pedestrians;
            if (peds.length === 0) return minVirtualGap;

            const myHalfWidth = this.width / 2;
            // ★ 關鍵修改：將預判距離從 20.0 提高到 45.0，讓車輛在停止線前就能看穿整個路口
            const maxLookahead = 45.0;
            const sampleStep = 1.0;

            let endPt = { x: this.x, y: this.y };
            let endTangentX = Math.cos(this.angle);
            let endTangentY = Math.sin(this.angle);

            if (this.currentPath && this.currentPath.length >= 2) {
                if (this.state === 'inIntersection' && this.currentPath.length >= 4) {
                    endPt = Geom.Bezier.getPoint(1.0, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);
                    const tg = Geom.Bezier.getTangent(1.0, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);
                    const tgLen = Math.hypot(tg.x, tg.y);
                    if (tgLen > 0) { endTangentX = tg.x / tgLen; endTangentY = tg.y / tgLen; }
                } else {
                    const posData = this.getPositionOnPath(this.currentPath, this.currentPathLength);
                    if (posData) {
                        endPt = { x: posData.x, y: posData.y };
                        endTangentX = Math.cos(posData.angle);
                        endTangentY = Math.sin(posData.angle);
                    }
                }
            }

            for (const ped of peds) {
                if (ped.state !== 'CROSSING') continue;

                const distSq = (ped.x - this.x) ** 2 + (ped.y - this.y) ** 2;
                if (distSq > 1600) continue; // 過濾 40m 以上的行人

                const pedDx = ped.endPos.x - ped.startPos.x;
                const pedDy = ped.endPos.y - ped.startPos.y;
                const pedLen = Math.hypot(pedDx, pedDy);
                const pedDirX = pedLen > 0 ? pedDx / pedLen : 0;
                const pedDirY = pedLen > 0 ? pedDy / pedLen : 0;

                let conflictDistance = null;

                for (let dist = 0; dist <= maxLookahead; dist += sampleStep) {
                    const s = this.distanceOnPath + dist;
                    let pt, tangentX, tangentY;

                    if (s <= this.currentPathLength) {
                        if (this.state === 'inIntersection' && this.currentPath && this.currentPath.length >= 4) {
                            const t = s / this.currentPathLength;
                            pt = Geom.Bezier.getPoint(t, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);
                            const tg = Geom.Bezier.getTangent(t, this.currentPath[0], this.currentPath[1], this.currentPath[2], this.currentPath[3]);
                            const tgLen = Math.hypot(tg.x, tg.y);
                            tangentX = tgLen > 0 ? tg.x / tgLen : Math.cos(this.angle);
                            tangentY = tgLen > 0 ? tg.y / tgLen : Math.sin(this.angle);
                        } else if (this.currentPath && this.currentPath.length >= 2) {
                            const posData = this.getPositionOnPath(this.currentPath, s);
                            if (!posData) continue;
                            pt = { x: posData.x, y: posData.y };
                            tangentX = Math.cos(posData.angle);
                            tangentY = Math.sin(posData.angle);
                        } else {
                            continue;
                        }
                    } else {
                        const extraDist = s - this.currentPathLength;
                        pt = {
                            x: endPt.x + endTangentX * extraDist,
                            y: endPt.y + endTangentY * extraDist
                        };
                        tangentX = endTangentX;
                        tangentY = endTangentY;
                    }

                    const assumedSpeed = Math.max(this.speed, 2.0);
                    const timeToReach = dist / assumedSpeed;

                    const futurePedX = ped.x + pedDirX * ped.speed * timeToReach;
                    const futurePedY = ped.y + pedDirY * ped.speed * timeToReach;

                    const dSqCurrent = (ped.x - pt.x) ** 2 + (ped.y - pt.y) ** 2;
                    const dSqFuture = (futurePedX - pt.x) ** 2 + (futurePedY - pt.y) ** 2;

                    const safeRadius = myHalfWidth + 1.2;
                    const safeRadiusSq = safeRadius * safeRadius;

                    if (dSqCurrent < safeRadiusSq || dSqFuture < safeRadiusSq) {
                        const normalX = -tangentY;
                        const normalY = tangentX;

                        const vecToPedX = ped.x - pt.x;
                        const vecToPedY = ped.y - pt.y;

                        const side = vecToPedX * normalX + vecToPedY * normalY;
                        const pedVelSide = pedDirX * normalX + pedDirY * normalY;

                        const isMovingAway = (side * pedVelSide) > 0;

                        if (isMovingAway && Math.abs(side) > myHalfWidth + 0.3) {
                            continue;
                        }

                        conflictDistance = dist;
                        break;
                    }
                }

                if (conflictDistance !== null) {
                    const requiredGap = conflictDistance - 2.0 - (this.length / 2);
                    if (requiredGap < minVirtualGap) {
                        minVirtualGap = Math.max(0.1, requiredGap);
                    }
                }
            }
            return minVirtualGap;
        }


        // ==================================================================================

        /**
                 * 偵測右轉衝突 (Right Hook Detection)
                 */
        detectRightTurnConflict(allVehicles, network) {
            let isTurningRight = false;

            if (this.state === 'inIntersection' && this.currentTransition) {
                const pStart = this.currentTransition.bezier ? this.currentTransition.bezier.points[0] : null;
                const pEnd = this.currentTransition.bezier ? this.currentTransition.bezier.points[3] : null;
                if (pStart && pEnd) {
                    const startAngle = Math.atan2(pStart.y - this.y, pStart.x - this.x);
                    const endAngle = Math.atan2(pEnd.y - pStart.y, pEnd.x - pStart.x);
                    let diff = endAngle - this.angle;
                    while (diff <= -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;

                    if (diff < -0.2 && diff > -2.5) isTurningRight = true;
                }
            }

            if (!isTurningRight) return Infinity;

            let minVirtualGap = Infinity;

            const scanDistFwd = 10.0;
            const scanDistBack = -10.0;
            const scanDistSide = 5.0;

            const cos = Math.cos(this.angle);
            const sin = Math.sin(this.angle);
            const rx = sin;
            const ry = -cos;
            const fx = cos;
            const fy = sin;

            for (const other of allVehicles) {
                if (!other.isMotorcycle) continue;
                if (other.id === this.id) continue;

                const distSq = (other.x - this.x) ** 2 + (other.y - this.y) ** 2;
                if (distSq > 400) continue;

                const dx = other.x - this.x;
                const dy = other.y - this.y;

                const fwdProj = dx * fx + dy * fy;
                const latProj = dx * rx + dy * ry;

                if (latProj > 0.5 && latProj < scanDistSide &&
                    fwdProj > scanDistBack && fwdProj < scanDistFwd) {

                    let angleDiff = other.angle - this.angle;
                    while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

                    // ★ 修正核心：當並排機車「靜止」且「不在正前方」時，不強迫汽車定桿
                    // 只有機車有車速 (speed > 1.0) 或者它已經卡在你正前方時 (fwdProj > 1.5) 才禮讓
                    if ((Math.abs(angleDiff) < 0.8 && other.speed > 1.0) || fwdProj > 1.5) {
                        const penalty = Math.max(0.5, latProj / 1.5);
                        minVirtualGap = Math.min(minVirtualGap, penalty);
                    }
                }
            }
            return minVirtualGap;
        }


        detectIntersectionConflict(allVehicles, network) {
            // =========================================================
            // ★★★ [修正] 起步防追撞 (Launch Anti-Rear-End) ★★★
            // 專治：機車 swarm 起步撞前車，並修復轉彎後的停頓卡頓
            // =========================================================
            // 改善點：加入 distanceOnPath > 5.0 過濾剛轉彎角度未回正的狀態
            if (this.state === 'onLink' && this.speed < 6.0 && this.distanceOnPath > 5.0) {

                let minStartGap = Infinity;

                const cos = Math.cos(this.angle);
                const sin = Math.sin(this.angle);

                for (const other of allVehicles) {
                    if (other.id === this.id) continue;

                    // 只看「同方向 + 同路段」
                    if (other.currentLinkId !== this.currentLinkId) continue;

                    // ★ 關鍵修正 1：利用穩定的 1D 拓樸距離過濾，必須真的在我們「前方」
                    const distDiff = other.distanceOnPath - this.distanceOnPath;
                    if (distDiff <= 0 || distDiff > 20.0) continue; // 排除後方車與遠處車輛

                    // 向量投影 (檢測實際物理方向)
                    const dx = other.x - this.x;
                    const dy = other.y - this.y;

                    const fwd = dx * cos + dy * sin;
                    const side = Math.abs(-dx * sin + dy * cos);

                    // ★ 關鍵修正 2：收窄橫向判定，改為「雙方半寬 + 0.3m 緩衝」
                    // 這樣才不會把隔壁車道的車子誤判為正前方障礙
                    if (fwd > 0 && side < ((this.width + other.width) / 2 + 0.3)) {

                        const gap = fwd - (this.length / 2) - (other.length / 2);

                        // 動態安全距離
                        const relSpeed = this.speed - other.speed;
                        const safeGap =
                            1.2 +                 // 基礎安全距離 (微調至 1.2m 讓起步更順)
                            this.speed * 0.5 +    // 速度補償
                            Math.max(0, relSpeed) * 1.2; // 追撞補償

                        if (gap < safeGap) {
                            minStartGap = Math.min(minStartGap, gap);
                        }
                    }
                }

                if (minStartGap < Infinity) {
                    return Math.max(0.1, minStartGap);
                }
            }

            const EPS = 1e-6;

            if (this.state !== 'inIntersection' && this.state !== 'onLink') return Infinity;

            const distToEnd = this.currentPathLength - this.distanceOnPath;
            if (this.state === 'onLink' && distToEnd > 30) return Infinity;

            let minGap = Infinity;

            const sigmoid = (x) => 1 / (1 + Math.exp(-x));

            // =========================================================
            // 1️⃣ 建立衝突圖（Conflict Graph）
            // =========================================================
            const graph = new Map();
            for (const v of allVehicles) {
                graph.set(v.id, []);
            }

            for (let i = 0; i < allVehicles.length; i++) {
                for (let j = i + 1; j < allVehicles.length; j++) {
                    const a = allVehicles[i];
                    const b = allVehicles[j];

                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const distSq = dx * dx + dy * dy;

                    // 30m 內才建立衝突關係
                    //const near = Math.max(0, 900 - distSq) / 900; // soft version
                    // ★ [修正 2-1] 45m 內建立衝突關係 (原為 30m，提前偵測避免高速穿模)
                    const near = Math.max(0, 2025 - distSq) / 2025; // 45^2 = 2025
                    if (near > 0) {
                        graph.get(a.id).push(b.id);
                        graph.get(b.id).push(a.id);
                    }
                }
            }

            // =========================================================
            // 2️⃣ 計算優先權（Priority Score）
            // =========================================================
            const priorityMap = new Map();

            for (const v of allVehicles) {
                const wait = v.waitTime || 0;

                const progress = v.distanceOnPath / Math.max(0.1, v.currentPathLength);

                const urgency = 1 - progress;

                const speedFactor = v.speed;

                // 可自行調權重
                const score =
                    2.0 * wait +
                    3.0 * urgency +
                    0.5 * speedFactor;

                priorityMap.set(v.id, score);
            }

            // =========================================================
            // 3️⃣ 全局排序（Scheduling）
            // =========================================================
            const order = allVehicles
                .map(v => ({
                    id: v.id,
                    score: priorityMap.get(v.id)
                }))
                .sort((a, b) => b.score - a.score)
                .map(v => v.id);

            // =========================================================
            // 4️⃣ 分配時間窗（Time Slots）
            // =========================================================
            const slotMap = new Map();

            const baseSlotTime = 2.0; // 每車通過時間（秒）

            for (let i = 0; i < order.length; i++) {
                slotMap.set(order[i], i * baseSlotTime);
            }

            const mySlot = slotMap.get(this.id) || 0;

            // =========================================================
            // 5️⃣ 轉成連續讓行決策（核心）
            // =========================================================
            for (const other of allVehicles) {
                if (other.id === this.id) continue;
                if (other.state !== 'inIntersection' && other.state !== 'onLink') continue;

                const otherSlot = slotMap.get(other.id) || 0;

                // 👉 時間差（核心）
                const dt = otherSlot - mySlot;

                // 👉 轉成連續讓行機率（無 if）
                const yieldProb = sigmoid(dt);

                // =====================================================
                // 距離（仍保留物理安全）
                // =====================================================
                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy + EPS);

                const myRadius = Math.max(this.width, this.length) / 2;
                const otherRadius = Math.max(other.width, other.length) / 2;

                const safeDist = myRadius + otherRadius + 0.4;

                // 緊急風險（避免穿模）
                const emergency = Math.max(0, (safeDist - dist) / safeDist);

                const brakingGap = Math.max(
                    0.1,
                    dist - (this.length / 2) - otherRadius - 0.4
                );

                const gap =
                    yieldProb * brakingGap +
                    (1 - yieldProb) * Infinity;

                const finalGap =
                    emergency * 0.1 +
                    (1 - emergency) * gap;

                minGap = Math.min(minGap, finalGap);
            }

            // =========================================================
            // 6️⃣ 停止線控制（保留）
            // =========================================================
            if (this.state === 'onLink') {
                let checkLane = this.currentLaneIndex;
                if (this.laneChangeState && this.laneChangeState.progress > 0.5) {
                    checkLane = this.laneChangeState.toLaneIndex;
                }

                let stopLinePos;
                if (this.isMotorcycle) {
                    stopLinePos = network.motoStopLineMap?.[this.currentLinkId]?.[checkLane];
                } else {
                    stopLinePos = network.stopLineMap?.[this.currentLinkId]?.[checkLane];
                }

                let distToStop;
                if (stopLinePos !== undefined) {
                    distToStop = stopLinePos - this.distanceOnPath - this.length / 2;
                } else {
                    distToStop = distToEnd - this.length / 2;
                }

                const stopFactor = sigmoid((distToStop + 1.0) * 2);

                const stopGap = Math.max(
                    0.1,
                    distToStop + this.minGap - 0.5
                );

                minGap = Math.min(
                    minGap,
                    stopFactor * stopGap + (1 - stopFactor) * minGap
                );
            }

            return minGap;
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

                // ★ 穿模修復：與 updateLateralPosition 邊界一致 (0.3m 緩衝)
                const limit = Math.max(0, (currentLane.width / 2) - (this.width / 2) - 0.3);
                if (this.lateralOffset > limit) this.lateralOffset = limit;
                if (this.lateralOffset < -limit) this.lateralOffset = -limit;

                if (this.laneChangeState) {
                    // 換車道邏輯維持不變 (它內部已經有獨立的 parabolic yawBias)
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

                        // === [修改] 將計算出的動態偏轉角疊加到原本的路線角度上 ===
                        this.angle = angle + (this.currentYawBias || 0);
                    }
                }
            } else if (this.state === 'inIntersection' || this.state === 'parking_maneuver') {
                if (!this.currentPath || this.currentPath.length < 2) return;

                if (this.currentPath.length === 2) {
                    const p0 = this.currentPath[0];
                    const p1 = this.currentPath[1];

                    let t = 0;
                    if (this.currentPathLength > 0.001) {
                        t = this.distanceOnPath / this.currentPathLength;
                    }
                    t = Math.max(0, Math.min(1.0, t));

                    this.x = p0.x + (p1.x - p0.x) * t;
                    this.y = p0.y + (p1.y - p0.y) * t;

                    if (this.twoStageState !== 'waiting') {
                        // === [修改] 直線進入待轉區/停車區時，也要加上偏轉角 ===
                        this.angle = Math.atan2(p1.y - p0.y, p1.x - p0.x) + (this.currentYawBias || 0);
                    }

                } else if (this.currentPath.length >= 4) {
                    const t = this.distanceOnPath / this.currentPathLength;
                    const [p0, p1, p2, p3] = this.currentPath;

                    const safeT = Math.max(0, Math.min(1.0, t));

                    const pos = Geom.Bezier.getPoint(safeT, p0, p1, p2, p3);
                    const tangent = Geom.Bezier.getTangent(safeT, p0, p1, p2, p3);

                    let trueTangentX = tangent.x;
                    let trueTangentY = tangent.y;

                    if (this.startCorrection && this.endCorrection) {
                        const t2 = safeT * safeT;
                        const t3 = t2 * safeT;

                        const weightStart = 1.0 - 3.0 * t2 + 2.0 * t3;
                        const weightEnd = 3.0 * t2 - 2.0 * t3;

                        pos.x += this.startCorrection.dx * weightStart + this.endCorrection.dx * weightEnd;
                        pos.y += this.startCorrection.dy * weightStart + this.endCorrection.dy * weightEnd;

                        const derivStart = -6.0 * safeT + 6.0 * t2;
                        const derivEnd = 6.0 * safeT - 6.0 * t2;

                        trueTangentX += this.startCorrection.dx * derivStart + this.endCorrection.dx * derivEnd;
                        trueTangentY += this.startCorrection.dy * derivStart + this.endCorrection.dy * derivEnd;
                    }

                    const angle = Math.atan2(trueTangentY, trueTangentX);

                    const nx = -Math.sin(angle);
                    const ny = Math.cos(angle);

                    this.x = pos.x + nx * this.lateralOffset;
                    this.y = pos.y + ny * this.lateralOffset;

                    // === [修改] 貝茲曲線(彎道避障)也要加上偏轉角 ===
                    this.angle = angle + (this.currentYawBias || 0);
                }
            }
        }
    }
    // --- Stats & Charts Helper Functions ---

    class Simulation {
        constructor(network) {
            this.network = network;
            this.time = 0;
            this.vehicles = [];
            this.vehicleIdCounter = 0;
            this.spatialGrid = new SpatialGrid(35);

            // ★★★ [Milestone 3] 載入 LUTI 旅次需求生成引擎 ★★★
            if (network.zones && Object.keys(network.zones).length > 0) {
                this.lutiEngine = new LUTIEngine(this, network);
                if (typeof window !== 'undefined') window.lutiEngine = this.lutiEngine; if (typeof self !== 'undefined') self.lutiEngine = this.lutiEngine;
            } else {
                this.lutiEngine = null;
                if (typeof window !== 'undefined') window.lutiEngine = null; if (typeof self !== 'undefined') self.lutiEngine = null;
            }


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

            // ==================================================================================
            // ★★★ [修復] 重新設計停止線計算邏輯，確保各種標線的優先順序與覆蓋關係 ★★★
            // ==================================================================================
            // ★★★★★ [關鍵修正] 將建立好的 Map 掛載到 network 物件上，讓 Vehicle 讀得到 ★★★★★
            this.network.twoStageBoxMap = this.twoStageBoxMap;
            this.stopLineMap = {};
            this.motoStopLineMap = {};

            if (network.roadMarkings) {
                network.roadMarkings.forEach(mark => {
                    if (!mark.linkId) return; // 必須綁定在 Link 上才有意義

                    // ★ [修復 1] 若未指定車道 (laneIndices 為空)，預設套用至該路段「所有車道」
                    let targetLanes = mark.laneIndices;
                    if (!targetLanes || targetLanes.length === 0) {
                        if (network.links[mark.linkId] && network.links[mark.linkId].lanes) {
                            targetLanes = Object.keys(network.links[mark.linkId].lanes).map(Number);
                        } else {
                            return;
                        }
                    }

                    if (!this.stopLineMap[mark.linkId]) this.stopLineMap[mark.linkId] = {};
                    if (!this.motoStopLineMap[mark.linkId]) this.motoStopLineMap[mark.linkId] = {};

                    targetLanes.forEach(laneIdx => {
                        let carStopPos = Infinity;
                        let motoStopPos = Infinity;

                        // ★[修復 2] 依照標線類型，精確定義汽機車的絕對停止位置
                        if (mark.type === 'stop_line') {
                            // 實體停止線：汽車與機車都必須停在線前
                            carStopPos = mark.position;
                            motoStopPos = mark.position;
                        } else if (mark.type === 'crosswalk') {
                            // 斑馬線：無論汽機車，絕對不能停在斑馬線上 (預留 0.5m 緩衝)
                            const cwHalfDepth = (mark.length || 3.0) / 2;
                            carStopPos = mark.position - cwHalfDepth - 0.5;
                            motoStopPos = mark.position - cwHalfDepth - 0.5;
                        } else if (mark.type === 'two_stage_box') {
                            // 機車待轉區：不作為直行路段的紅燈停止線依據
                        } else {
                            // 機車停等區 (waiting_area) 或其他標線：
                            // 汽車：必須停在機車停等區的「後端」(上游)，再扣除 0.5m 視覺緩衝
                            carStopPos = mark.position - (mark.length || 3.0) - 0.5;
                            // 機車：允許進入機車停等區，因此不受此線限制 (維持 Infinity)
                        }

                        // ★ 關鍵：比較並儲存「最上游」(數值最小) 的合法停止點，確保不互相覆蓋
                        if (carStopPos !== Infinity) {
                            const currCar = this.stopLineMap[mark.linkId][laneIdx];
                            this.stopLineMap[mark.linkId][laneIdx] = (currCar === undefined) ? carStopPos : Math.min(currCar, carStopPos);
                        }
                        if (motoStopPos !== Infinity) {
                            const currMoto = this.motoStopLineMap[mark.linkId][laneIdx];
                            this.motoStopLineMap[mark.linkId][laneIdx] = (currMoto === undefined) ? motoStopPos : Math.min(currMoto, motoStopPos);
                        }
                    });
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
            this.spawners = (network.spawners || []).map(s => (s instanceof Spawner ? s : new Spawner(s, network.pathfinder)));

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
            this.trafficLights = (network.trafficLights || []).map(t => (t instanceof TrafficLightController ? t : new TrafficLightController(t)));
            network.trafficLights = this.trafficLights;
            this.speedMeters = (network.speedMeters || []).map(m => ({ ...m, readings: {}, maxAvgSpeed: 0 }));
            this.sectionMeters = (network.sectionMeters || []).map(m => ({ ...m, completedVehicles: [], maxAvgSpeed: 0, lastAvgSpeed: null }));

            // ★ 初始化行人管理器
            const PedCls = (typeof PedestrianSimManager !== "undefined") ? PedestrianSimManager : ((typeof self !== "undefined" && self.PedestrianManagerSim) ? self.PedestrianManagerSim : ((typeof window !== "undefined" && window.PedestrianManagerSim) ? window.PedestrianManagerSim : null));
            if (PedCls) {
                this.pedManager = new PedCls(this, network);
                // ★★★ [Milestone 4] 連動 LUTI 步行需求與周邊 500m 斑馬線/路口行人產生器 ★★★
                if (this.lutiEngine && typeof this.pedManager.initLUTISpawners === 'function') {
                    this.pedManager.initLUTISpawners(network, this.lutiEngine);
                }
            }

            // =================================================================
            // ★★★ [終極修正] 保存槽化線真實多邊形，用於未來軌跡碰撞檢測 ★★★
            // =================================================================
            this.network.channelizationPolygons = [];
            if (network.roadMarkings) {
                network.roadMarkings.forEach(mk => {
                    if (mk.type === 'channelization' && mk.points && mk.points.length > 2) {
                        this.network.channelizationPolygons.push(mk.points);
                    }
                });
            }
            // =================================================================
        } // 這是 constructor 的結束大括號

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

            // ★★★ [Milestone 3] LUTI 旅次生成引擎微觀交通發布更新 ★★★
            if (this.lutiEngine) {
                const lutiVehicles = this.lutiEngine.update(dt, this.network, () => this.vehicleIdCounter++);
                if (lutiVehicles && lutiVehicles.length > 0) {
                    for (const lv of lutiVehicles) {
                        this.vehicles.push(lv);
                    }
                }
            }

            
            if (this.spatialGrid) {
                this.spatialGrid.clear();
                for (let i = 0; i < this.vehicles.length; i++) {
                    this.spatialGrid.insert(this.vehicles[i]);
                }
                for (let i = 0; i < this.vehicles.length; i++) {
                    const v = this.vehicles[i];
                    const nearby = this.spatialGrid.getNearby(v.x, v.y, 80);
                    v.update(dt, nearby, this);
                }
            } else {
                this.vehicles.forEach(vehicle => vehicle.update(dt, this.vehicles, this));
            }

            this.vehicles = this.vehicles.filter(v => !v.finished);

            // ★ 更新行人
            if (this.pedManager) {
                this.pedManager.update(dt);
            }
        }
    }



const SimCore = {
    SpatialGrid,
    Geom,
    Pathfinder,
    TrafficLightController,
    Spawner,
    DetectorSpawner,
    LUTIEngine,
    Vehicle,
    Pedestrian,
    PedestrianSimManager,
    Simulation,
    computeNetworkConflicts,
    getUpstreamAllowedLanes
};

if (typeof window !== 'undefined') {
    window.SimCore = SimCore;
    window.Geom = Geom;
    window.Pathfinder = Pathfinder;
    window.TrafficLightController = TrafficLightController;
    window.Spawner = Spawner;
    window.DetectorSpawner = DetectorSpawner;
    window.LUTIEngine = LUTIEngine;
    window.Vehicle = Vehicle;
    window.Simulation = Simulation;
    window.computeNetworkConflicts = computeNetworkConflicts;
    window.getUpstreamAllowedLanes = getUpstreamAllowedLanes;
}
if (typeof self !== 'undefined') {
    self.SimCore = SimCore;
    self.SpatialGrid = SpatialGrid;
    self.Geom = Geom;
    self.Pathfinder = Pathfinder;
    self.TrafficLightController = TrafficLightController;
    self.Spawner = Spawner;
    self.DetectorSpawner = DetectorSpawner;
    self.LUTIEngine = LUTIEngine;
    self.Vehicle = Vehicle;
    self.Simulation = Simulation;
    self.computeNetworkConflicts = computeNetworkConflicts;
    self.getUpstreamAllowedLanes = getUpstreamAllowedLanes;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimCore;
}

})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : globalThis));
