// --- START OF COMPLETE editor.js FILE ---

document.addEventListener('DOMContentLoaded', () => {

    // --- GLOBAL STATE & CONFIG ---
    const ENABLE_GROUP_CONNECT = true; // <--- 新增此行：設為 true 即可顯示快速連接箭頭
    const LANE_WIDTH = 3.5;
    const PORT_RADIUS = 5;
    const C_SYSTEM_Y_INVERT = -1;

    let stage, layer, gridLayer; // <-- MODIFIED: Removed measureGroup
    let activeTool = 'select';
    let connectMode = 'manual'; // 'manual' (拖曳) 或 'box' (框選)
    let markingMode = 'standard'; // <--- 新增此行：'standard' 或 'channelization'
    let intersectionMode = 'zone'; // 'zone' (挖空) 或 'point' (中心聚合)
    let tempShape = null;
    let tempMeasureText = null;
    let isPanning = false;
    let lastPointerPosition;
    let laneIndicators = [];

    let network = {
        links: {},
        nodes: {},
        connections: {},
        detectors: {},
        roadSigns: {},
        origins: {},
        destinations: {},
        vehicleProfiles: {},
        trafficLights: {},
        measurements: {}, // <-- ADD THIS LINE
        backgrounds: {}, // <--- 替換為 backgrounds: {}
        background: null, // <-- ADD THIS LINE
        overpasses: {}, // <--- 新增此行
        pushpins: {}, // <--- 新增此行
        parkingLots: {}, // <--- 新增此行
        parkingGates: {}, // <--- 新增此行
        roadMarkings: {}, // <--- 請務必在全域變數這裡加入這一行
        zones: {}, // <--- 土地使用分區 (Milestone 1)
    };
    // --- 新增：Link 建立設定 ---
    let linkCreationSettings = {
        isTwoWay: false,       // 是否為雙向
        drivingSide: 'right',  // 'right' (RHT) | 'left' (LHT)
        lanesPerDir: 2,        // 單向車道數
        medianWidth: 2.0,      // [新增] 分隔島寬度 (預設 2.0 米)
        mode: 'parametric'       // 'standard' (既有中心線) 或 'lane-based' (多邊形車道)
    };

    // --- [新增] Lane-based 標線語意字典 (依據真實公尺比例調整) ---
    const STROKE_TYPES = {
        // width: 0.2 (公尺寬), dash: [4, 6] 代表 4公尺實線配6公尺空白, gap: 0.2 (雙線間距 20公分)
        'boundary': { color: '#f97316', dash: [], width: 0.8, label: 'Boundary (路面邊線)' },
        'yellow_dashed': { color: '#eab308', dash: [4, 6], width: 0.8, label: 'Yellow Dashed (單黃虛線)' },
        'yellow_double': { color: '#eab308', dual: true, leftDash: [], rightDash: [], width: 0.8, gap: 0.2, label: 'Yellow Double (雙黃實線)' },
        'yellow_solid_dashed': { color: '#eab308', dual: true, leftDash: [], rightDash: [4, 6], width: 0.8, gap: 0.2, label: 'Yellow Solid/Dash (左實右虛)' },
        'yellow_dashed_solid': { color: '#eab308', dual: true, leftDash: [4, 6], rightDash: [], width: 0.8, gap: 0.2, label: 'Yellow Dash/Solid (左虛右實)' },

        'white_solid': { color: '#ffffff', dash: [], width: 0.8, label: 'White Solid (白實線)' },
        'white_dashed': { color: '#ffffff', dash: [4, 6], width: 0.8, label: 'White Dashed (白虛線)' },
        'white_double': { color: '#ffffff', dual: true, leftDash: [], rightDash: [], width: 0.8, gap: 0.2, label: 'White Double (雙白實線)' },
        'white_solid_dashed': { color: '#ffffff', dual: true, leftDash: [], rightDash: [4, 6], width: 0.8, gap: 0.2, label: 'White Solid/Dash (左實右虛)' },
        'white_dashed_solid': { color: '#ffffff', dual: true, leftDash: [4, 6], rightDash: [], width: 0.8, gap: 0.2, label: 'White Dash/Solid (左虛右實)' }
    };
    // --- [修改] 專業級軌跡語意配色字典 (改為低調統一的風格) ---
    const TRAJECTORY_COLORS = {
        'straight': 'rgba(59, 130, 246, 0.85)', // 亮藍色
        'right': 'rgba(16, 185, 129, 0.85)', // 翠綠色
        'left': 'rgba(245, 158, 11, 0.85)', // 橘黃色
        'u-turn': 'rgba(139, 92, 246, 0.85)', // 紫色
        'default': 'rgba(0, 210, 255, 0.85)'   // 青色
    };

    // --- [新增] 計算貝茲曲線 4 個控制點 ---
    function calculateBezierPoints(pStart, vStart, pEnd, vEnd, turnDir, totalWidth) {
        const dist = vecLen(getVector(pStart, pEnd));

        // 控制點延伸距離 (預設為端點直線距離的 40%)
        let ctrlDist1 = dist * 0.4;
        let ctrlDist2 = dist * 0.4;

        // 如果是迴轉 (U-Turn)，端點距離很近，必須強制向外擴張以形成水滴狀迴圈
        if (turnDir === 'u-turn') {
            const minBulge = Math.max(dist * 2, totalWidth * 1.5, 20);
            ctrlDist1 = minBulge;
            ctrlDist2 = minBulge;
        }

        const cp1 = add(pStart, scale(vStart, ctrlDist1));
        const cp2 = add(pEnd, scale(vEnd, -ctrlDist2)); // 終點向量需反轉延伸

        return [pStart, cp1, cp2, pEnd];
    }

    // --- [新增] 獲取貝茲曲線中點 (t=0.5) 的座標與切線角度 (供畫箭頭使用) ---
    function getBezierMidpointAndAngle(p0, p1, p2, p3) {
        // 座標計算 (Cubic Bezier at t=0.5)
        const x = 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x;
        const y = 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y;

        // 切線向量計算 (Derivative at t=0.5)
        const vx = 0.75 * (p1.x - p0.x) + 1.5 * (p2.x - p1.x) + 0.75 * (p3.x - p2.x);
        const vy = 0.75 * (p1.y - p0.y) + 1.5 * (p2.y - p1.y) + 0.75 * (p3.y - p2.y);

        const angle = Math.atan2(vy, vx) * (180 / Math.PI);
        return { x, y, angle };
    }
    // --- [新增] Lane-based 草稿狀態 ---
    let draftCurrentStrokeType = 'boundary';
    let draftLaneStrokes = []; // 儲存使用者畫的每一條線 { type: string, konvaLine: Object }
    let appendingStrokeToLink = null; // <--- 新增此行：紀錄正在手動添加標線的 Link
    let idCounter = 0;
    let selectedObject = null;
    let currentModalOrigin = null;
    let lastSelectedNodeForProperties = null; // <--- 新增此行
    let trafficLightIcons = []; // <--- 【請新增此行】用於儲存號誌圖示
    let nodeSettingsIcons = []; // <--- 【請新增此行】用於儲存路口設定圖示
    let bgSettingsIcon = null; // <--- 【新增此行】用於儲存背景圖設定圖示

    // --- [新增] Undo/Redo 狀態變數 ---
    const MAX_HISTORY = 15;
    let undoStack = [];
    let redoStack = [];
    let isRestoringState = false; // 防止復原過程中觸發儲存

    window.importPrefix = ""; // 儲存匯入時的時間戳前綴

    // 全域 ID 產生器
    window.generateId = function (type) {
        return `${window.importPrefix || ""}${type}_${++idCounter}`;
    };
    // --- [新增] 狀態管理核心函數 ---

    /**
     * 產生當前路網的 XML 字串 (從原 exportXML 邏輯抽離)
     */
    function generateXMLString() {
        // 這裡我們直接呼叫修改後的 exportXML 邏輯
        // 請參閱下方步驟 3 對 exportXML 的修改
        // 這裡回傳的是 XML string
        return serializeNetworkToXML();
    }

    /**
     * 儲存當前狀態到 Undo Stack
     * 應在任何會改變路網的操作「之後」呼叫
     */
    function saveState() {
        if (isRestoringState) return;

        const currentState = {
            xml: serializeNetworkToXML(),
            view: {
                x: stage.x(),
                y: stage.y(),
                scale: stage.scaleX()
            }
        };

        // 如果堆疊頂端狀態與當前相同，則不重複儲存 (簡單防抖)
        if (undoStack.length > 0) {
            const lastState = undoStack[undoStack.length - 1];
            if (lastState.xml === currentState.xml) return;
        }

        undoStack.push(currentState);

        // 限制步數
        if (undoStack.length > MAX_HISTORY + 1) { // +1 是因為包含當前狀態
            undoStack.shift();
        }

        // 新的動作發生時，清空 Redo
        redoStack = [];
        updateUndoRedoButtons();
    }

    /**
     * 執行復原
     */
    function performUndo() {
        if (undoStack.length <= 1) return; // 至少要保留初始狀態

        isRestoringState = true;

        // 1. 將當前狀態移入 Redo
        const currentState = undoStack.pop();
        redoStack.push(currentState);

        // 2. 取出上一個狀態
        const prevState = undoStack[undoStack.length - 1];

        // 3. 載入狀態
        restoreStateFromSnapshot(prevState);

        isRestoringState = false;
        updateUndoRedoButtons();
    }

    /**
     * 執行重做
     */
    function performRedo() {
        if (redoStack.length === 0) return;

        isRestoringState = true;

        // 1. 取出 Redo 狀態
        const nextState = redoStack.pop();

        // 2. 存回 Undo
        undoStack.push(nextState);

        // 3. 載入狀態
        restoreStateFromSnapshot(nextState);

        isRestoringState = false;
        updateUndoRedoButtons();
    }

    /**
     * 輔助：從快照恢復路網與視角
     */
    function restoreStateFromSnapshot(state) {
        if (!state) return;

        try {
            // 使用現有的 XML 載入函數
            createAndLoadNetworkFromXML(state.xml);

            // 恢復視角
            stage.position({ x: state.view.x, y: state.view.y });
            stage.scale({ x: state.view.scale, y: state.view.scale });

            // 重新繪製 grid 與更新 UI
            drawGrid();

            // 確保比例尺相關的 UI (如 ports) 大小正確
            const newPortScale = 1 / state.view.scale;
            layer.find('.lane-port, .group-connect-port, .control-point, .waypoint-handle, .measurement-handle').forEach(p => {
                p.scale({ x: newPortScale, y: newPortScale });
            });
            layer.batchDraw();

        } catch (e) {
            console.error("Undo/Redo failed:", e);
        }
    }

    function updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.disabled = undoStack.length <= 1;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }

    // --- DOM ELEMENTS ---
    const canvasContainer = document.getElementById('canvas-container');
    const propertiesContent = document.getElementById('properties-content');
    const statusBar = document.getElementById('status-bar');

    let lastActiveNodeTab = 'tab-settings'; // [新增] 用於記憶 Node 屬性面板當前的分頁
    let isSynchroMode = false; // Synchro 快速建模與視覺車道轉向模式
    var synchroDraftStart = null;
    var synchroDraftPreviewGroup = null;
    var synchroSnapIndicatorGroup = null;
    let lastActiveLinkTab = 'tab-link-general'; // <--- [新增] 記憶 Link 面板的分頁

    // --- DATA MODELS ---
    // 我們將 numLanes 參數改為 lanesOrNumLanes
    function createLink(points, lanesOrNumLanes = 2) {
        const id = window.generateId('link');
        const link = {
            id, name: id, type: 'Link',
            waypoints: points, lanes: [],
            startNodeId: null, endNodeId: null,
            konvaGroup: new Konva.Group({ id, draggable: false }),
            konvaHandles: [],
        };

        // Determine initial lanes
        let initialLanes = [];
        if (Array.isArray(lanesOrNumLanes)) {
            initialLanes = lanesOrNumLanes.map(width => ({ width: width, allowedVehicleProfiles: [] }));
        } else {
            initialLanes = Array.from({ length: lanesOrNumLanes }, () => ({ width: LANE_WIDTH, allowedVehicleProfiles: [] }));
        }

        // [新增] 依據目前的建立模式，賦予不同的幾何設定
        if (linkCreationSettings.mode === 'parametric') {
            link.geometryType = 'parametric';
            link.lanes = initialLanes; // 必須先賦予 lanes，引擎才能正確讀取寬度
            link.parametricConfig = {
                throughLanes: initialLanes.length,
                leftPocket: { exists: false, lanes: 1, length: 30, taper: 15 },
                rightPocket: { exists: false, lanes: 1, length: 30, taper: 15 },
                _prevLL: 0,
                _prevTL: initialLanes.length,
                _prevRL: 0
            };
            generateParametricStrokes(link); // 呼叫數學引擎產生實體點
        } else if (linkCreationSettings.mode === 'lane-based') {
            link.geometryType = 'lane-based';
            link.lanes = initialLanes;
        } else {
            link.geometryType = 'standard';
            link.lanes = initialLanes;
        }

        network.links[id] = link;
        layer.add(link.konvaGroup);
        drawLink(link);
        return link;
    }

    function createNode(x, y) {
        const id = window.generateId('node');
        const node = {
            id,
            type: 'Node',
            x,
            y,
            incomingLinkIds: new Set(),
            outgoingLinkIds: new Set(),
            pedestrianVolume: 0,
            crossOnceProb: 100,
            crossTwiceProb: 0,
            konvaShape: new Konva.Shape({
                id,
                x: 0,
                y: 0,
                sceneFunc: (ctx, shape) => { drawNode(node, ctx, shape); },
                fill: 'rgba(100, 100, 255, 0.3)',
                stroke: 'rgba(100, 100, 255, 0.8)',
                strokeWidth: 0.1,
                listening: true,
            }),
        };
        network.nodes[id] = node;
        layer.add(node.konvaShape);
        if (typeof setupSynchroNodeDrag === 'function') {
            setupSynchroNodeDrag(node);
        }
        return node;
    }

    function createConnection(sourceLink, sourceLaneIndex, destLink, destLaneIndex, node, points, color = 'rgba(0, 255, 0, 0.7)') {
        const id = window.generateId('conn');

        // 計算貝茲曲線點位
        const turnDir = getTurnDirection(sourceLink, destLink);
        let bezierPts = points;
        if (points.length === 2) {
            const vStart = normalize(getVector(sourceLink.waypoints[sourceLink.waypoints.length - 2], points[0]));
            const vEnd = normalize(getVector(points[1], destLink.waypoints[1]));
            bezierPts = calculateBezierPoints(points[0], vStart, points[1], vEnd, turnDir, getLinkTotalWidth(sourceLink));
        }

        const conn = {
            id,
            type: 'Connection',
            sourceLinkId: sourceLink.id,
            sourceLaneIndex,
            destLinkId: destLink.id,
            destLaneIndex,
            nodeId: node.id,
            bezierPoints: bezierPts, // 儲存 4 個控制點
            konvaControls: [],
            konvaBezier: new Konva.Line({
                id,
                points: bezierPts.flatMap(p => [p.x, p.y]),
                stroke: color,
                strokeWidth: 1, // 【關鍵修改】最細線寬
                bezier: true,   // 開啟貝茲曲線
                // 移除了 dash 屬性，變成連續實線
                hitStrokeWidth: 10,
                lineCap: 'round',
                listening: true,
            })
        };
        network.connections[id] = conn;
        layer.add(conn.konvaBezier);
        conn.konvaBezier.moveToBottom();
        return conn;
    }
    function createDetector(type, link, position, endPosition = null) {
        const id = window.generateId('det');
        const detector = {
            id,
            type,
            name: id,
            linkId: link.id,
            position,
            konvaGroup: new Konva.Group({ id, draggable: true }),
        };
        if (type === 'SectionDetector') {
            detector.length = endPosition ? (endPosition - position) : 20; // Default length 20
        }
        network.detectors[id] = detector;
        layer.add(detector.konvaGroup);
        drawDetector(detector);
        return detector;
    }

    function createRoadSign(link, position, lateralOffset = null, signType = 'start') {
        const id = window.generateId('sign');

        const sign = {
            id,
            type: 'RoadSign',
            linkId: link.id,
            position,
            lateralOffset: lateralOffset,
            signType: signType, // 建立時直接套用傳入的類型
            speedLimit: 30,
            konvaShape: new Konva.Shape({
                id,
                draggable: true,
                listening: true,
                sceneFunc: (ctx, shape) => {
                    const type = sign.signType;
                    if (type === 'start' || type === 'end') {
                        ctx.beginPath();
                        ctx.arc(0, 0, 6, 0, Math.PI * 2, false);
                        ctx.closePath();
                        ctx.fillStyle = type === 'start' ? '#dc3545' : 'white';
                        ctx.fill();
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'black';
                        ctx.stroke();
                    } else if (type === 'traffic_cone') {
                        const size = 0.40;
                        ctx.beginPath();
                        ctx.rect(-size / 2, -size / 2, size, size);
                        ctx.closePath();
                        ctx.fillStyle = '#ff0000';
                        ctx.fill();
                        ctx.lineWidth = 0.05;
                        ctx.strokeStyle = 'white';
                        ctx.stroke();
                    }
                    ctx.fillStrokeShape(shape);
                },
                hitFunc: (ctx, shape) => {
                    ctx.beginPath();
                    ctx.arc(0, 0, 12, 0, Math.PI * 2, false);
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }
            }),
        };

        // 只有在剛被工具點擊建立(尚未有偏移值)時，才賦予預設值
        if (sign.lateralOffset === null) {
            const totalWidth = getLinkTotalWidth(link);
            if (signType === 'traffic_cone') {
                sign.lateralOffset = 0; // 交通錐預設放中央
            } else {
                sign.lateralOffset = (totalWidth / 2) + 8; // 一般標誌放路緣
            }
        }

        network.roadSigns[id] = sign;
        layer.add(sign.konvaShape);

        sign.konvaShape.on('dragmove', function (e) {
            e.cancelBubble = true;
            const pointerPos = stage.getPointerPosition();
            const localPos = layer.getAbsoluteTransform().copy().invert().point(pointerPos);

            const { dist } = projectPointOnPolyline(localPos, link.waypoints);
            const clampedDist = Math.max(0, Math.min(dist, getPolylineLength(link.waypoints)));
            sign.position = clampedDist;

            const newPt = getPointAlongPolyline(link.waypoints, clampedDist);
            const normal = getNormal(newPt.vec);
            const totalWidth = getLinkTotalWidth(link);

            if (sign.signType === 'traffic_cone') {
                const v = getVector(newPt.point, localPos);
                const proj = v.x * normal.x + v.y * normal.y;
                sign.lateralOffset = Math.max(-totalWidth / 2, Math.min(totalWidth / 2, proj));
            } else {
                sign.lateralOffset = (totalWidth / 2) + 8;
            }

            const newVisualPos = add(newPt.point, scale(normal, sign.lateralOffset));
            sign.konvaShape.position(newVisualPos);

            if (selectedObject && selectedObject.id === sign.id) {
                updatePropertiesPanel(sign);
            }

            layer.batchDraw();
        });

        drawRoadSign(sign);
        return sign;
    }
    // 修正後的 selectObject 函數完整程式碼
    // 修正後的 selectObject 函數完整程式碼
    // 完整替換此函數
    function selectObject(obj) {
        if (!obj) return;

        deselectAll(); // 首先取消選取任何先前選取的物件
        selectedObject = obj;
        let konvaObj;

        // 根據物件類型決定主要的 Konva 物件並套用選取效果
        if (obj.type.includes('Detector')) {
            konvaObj = obj.konvaGroup;
            konvaObj.draggable(true);
        } else if (obj.type === 'RoadSign') {
            konvaObj = obj.konvaShape;
            konvaObj.draggable(true); // 明確啟用拖曳
        } else if (obj.type === 'Node') {
            konvaObj = obj.konvaShape;
            drawNodeHandles(obj); // <--- 新增這行：選取 Node 時畫出控制點
        } else if (obj.type === 'Connection') {
            konvaObj = obj.konvaBezier;
        } else if (obj.type === 'ConnectionGroup') {
            konvaObj = obj.konvaLine;
            drawConnectionGroupIndicators(obj);
        } else if (obj.type === 'Link') {
            konvaObj = obj.konvaGroup;
            drawWaypointHandles(obj);

            // --- [修改] 點選 Link 時：顯示各車道的連接線，隱藏相關 Node 內的所有群組線 ---
            Object.values(network.connections).forEach(conn => {
                // 顯示屬於這個 Link 的單車道細線
                if (conn.sourceLinkId === obj.id || conn.destLinkId === obj.id) {
                    if (conn.konvaBezier) {
                        conn.konvaBezier.visible(true);
                    }
                }
            });

            // 只要群組線所屬的 Node 是該 Link 的起點或終點，就全部隱藏
            layer.find('.group-connection-visual').forEach(groupVis => {
                const meta = groupVis.getAttr('meta');
                if (meta && meta.nodeId && (meta.nodeId === obj.startNodeId || meta.nodeId === obj.endNodeId)) {
                    groupVis.visible(false);
                }
            });
            // --------------------------------------------------------

        } else if (obj.type === 'Origin' || obj.type === 'Destination') {
            konvaObj = obj.konvaShape;
            if (obj.konvaLabel) {
                obj.konvaLabel.setAttr('shadowColor', 'rgba(255, 132, 0, 1)');
                obj.konvaLabel.setAttr('shadowBlur', 5);
                obj.konvaLabel.setAttr('shadowOpacity', 0.9);
            }
        } else if (obj.type === 'Measurement') {
            konvaObj = obj.konvaGroup;
            drawMeasurementHandles(obj);
        } else if (obj.type === 'Background') {
            konvaObj = obj.konvaGroup;
            // 如果背景沒有鎖定，才加上 Konva.Transformer 變形框
            if (!obj.locked) {
                const tr = new Konva.Transformer({
                    nodes: [konvaObj],
                    keepRatio: true,
                    borderStroke: 'blue',
                    anchorStroke: 'blue',
                    anchorFill: 'white',
                    anchorSize: 10,
                    rotationSnaps: [0, 90, 180, 270],
                    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
                });
                layer.add(tr);
                tr.moveToTop();
                obj.konvaTransformer = tr;
                konvaObj.on('transformend', () => {
                    if (obj.locked) return;
                    obj.x = konvaObj.x();
                    obj.y = konvaObj.y();
                    obj.scale = konvaObj.scaleX();
                    obj.width = konvaObj.width() * konvaObj.scaleX();
                    obj.height = konvaObj.height() * konvaObj.scaleY();
                    updatePropertiesPanel(obj);
                    saveState();
                    layer.batchDraw();
                });
            }
        } else if (obj.type === 'Overpass') {
            konvaObj = obj.konvaRect;
            // 我們使用邊框顏色來表示選取，而不是陰影
            konvaObj.stroke('blue');
            konvaObj.strokeWidth(4);
        } else if (obj.type === 'ParkingLot') {
            konvaObj = obj.konvaGroup;
            const tr = new Konva.Transformer({
                nodes: [konvaObj],
                keepRatio: false,
                borderStroke: 'blue',
                anchorStroke: 'blue',
                anchorFill: 'white',
                rotationSnaps: [0, 90, 180, 270],
                shouldOverdrawWholeArea: true,
                anchorSize: 8 // 變形框錨點大小
            });
            layer.add(tr);
            tr.moveToTop();
            obj.konvaTransformer = tr;

            // 繪製控制點
            drawParkingLotHandles(obj);

            // *** 新增：當 Group 本身被拖曳或變形時，更新控制點位置 ***
            konvaObj.on('dragmove transform', () => {
                updateParkingLotHandlePositions(obj);
            });

            konvaObj.on('transformend dragend', () => {
                updatePropertiesPanel(obj);
                // 結束時重繪以確保精確
                drawParkingLotHandles(obj);
            });
        } else if (obj.type === 'Zone') {
            konvaObj = obj.konvaGroup;
            obj.konvaGroup.draggable(true);
            drawZoneHandles(obj);

            konvaObj.on('dragmove.zone_select transform.zone_select', () => {
                updateZoneHandlePositions(obj);
                if (selectedObject && selectedObject.id === obj.id) {
                    updatePropertiesPanelDynamicValues(obj);
                }
            });

            konvaObj.on('transformend.zone_select dragend.zone_select', () => {
                autoGenerateCentroidConnectors(obj);
                updateZoneConnectorsVisual(obj);
                updatePropertiesPanel(obj);
                drawZoneHandles(obj);
                saveState();
            });
        } else if (obj.type === 'RoadMarking') {
            konvaObj = obj.konvaGroup;
            if (obj.markingType === 'channelization') {
                const tr = new Konva.Transformer({
                    nodes: [konvaObj], keepRatio: false, borderStroke: 'blue', anchorStroke: 'blue', anchorFill: 'white', rotationSnaps: [0, 90, 180, 270], shouldOverdrawWholeArea: true, anchorSize: 8
                });
                layer.add(tr); tr.moveToTop(); obj.konvaTransformer = tr;
                drawChannelizationHandles(obj);

                // 【修正重點】加入 .ch_select 命名空間
                konvaObj.on('dragmove.ch_select transform.ch_select', () => updateChannelizationHandlePositions(obj));
                konvaObj.on('transformend.ch_select', () => {
                    obj.x = konvaObj.x(); obj.y = konvaObj.y(); obj.rotation = konvaObj.rotation();
                    const polygon = konvaObj.findOne('.marking-shape');
                    if (polygon) {
                        const pts = polygon.points();
                        for (let i = 0; i < pts.length; i += 2) {
                            const abs = konvaObj.getTransform().point({ x: pts[i], y: pts[i + 1] });
                            obj.points[i] = abs.x; obj.points[i + 1] = abs.y;
                        }
                    }
                    updatePropertiesPanel(obj); drawChannelizationHandles(obj);
                    // 【修正重點】變形結束後觸發存檔
                    saveState();
                });
            } else {
                const isFreeMode = obj.nodeId || (obj.markingType === 'two_stage_box' && obj.isFree);
                const tr = new Konva.Transformer({
                    nodes: [konvaObj], centeredScaling: true, resizeEnabled: false, rotateEnabled: isFreeMode, borderStroke: 'blue', anchorStroke: 'blue', enabledAnchors: isFreeMode ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []
                });
                layer.add(tr); tr.moveToTop(); obj.konvaTransformer = tr;
                if (isFreeMode) konvaObj.on('transformend', () => {
                    obj.rotation = konvaObj.rotation(); obj.x = konvaObj.x(); obj.y = konvaObj.y(); updatePropertiesPanel(obj);
                });
            }
        }

        // 套用視覺陰影效果到選取的 Konva 物件
        if (konvaObj && obj.type !== 'Background' && obj.type !== 'Overpass' && obj.type !== 'ParkingLot') {
            konvaObj.setAttr('shadowColor', 'rgba(0, 150, 255, 1)');
            konvaObj.setAttr('shadowBlur', 10);
            konvaObj.setAttr('shadowOpacity', 0.9);
        }

        // 更新屬性面板以顯示選取物件的詳細資訊
        updatePropertiesPanel(obj);
    }

    // 完整替換此函數
    function deselectAll() {
        clearLaneIndicators();
        lastSelectedNodeForProperties = null;

        // --- [新增修正] 強制清除所有屬性面板 Hover 時產生的暫存高亮圖形，防止殘留 ---
        layer.find('.link-highlight, .lane-polygon-highlight, .bg-list-highlight').forEach(shape => shape.destroy());
        // --------------------------------------------------------------------------

        if (selectedObject) {
            let konvaObj;
            const obj = selectedObject;

            if (obj.type.includes('Detector')) {
                konvaObj = obj.konvaGroup;
                konvaObj.draggable(false);
            }
            else if (obj.type === 'RoadSign') {
                konvaObj = obj.konvaShape;
                konvaObj.draggable(false);
            }
            else if (obj.type === 'Node') {
                konvaObj = obj.konvaShape;
                destroyNodeHandles(obj); // <--- 取消選取時清除控制點
            }
            else if (obj.type === 'Connection') {
                konvaObj = obj.konvaBezier;
            } else if (obj.type === 'ConnectionGroup') {
                konvaObj = obj.konvaLine;
            } else if (obj.type === 'Link') {
                konvaObj = obj.konvaGroup;
                destroyWaypointHandles(obj);

                // --- [修改] 取消點選 Link 時：隱藏各車道連接線，恢復相關 Node 內的所有群組線 ---
                Object.values(network.connections).forEach(conn => {
                    if (conn.sourceLinkId === obj.id || conn.destLinkId === obj.id) {
                        if (conn.konvaBezier) {
                            conn.konvaBezier.visible(false);
                        }
                    }
                });

                layer.find('.group-connection-visual').forEach(groupVis => {
                    const meta = groupVis.getAttr('meta');
                    if (meta && meta.nodeId && (meta.nodeId === obj.startNodeId || meta.nodeId === obj.endNodeId)) {
                        groupVis.visible(true);
                    }
                });
                // --------------------------------------------------------

            } else if (obj.type === 'Origin' || obj.type === 'Destination') {
                konvaObj = obj.konvaShape;
                if (obj.konvaLabel) {
                    obj.konvaLabel.setAttr('shadowOpacity', 0);
                }
            } else if (obj.type === 'Measurement') {
                konvaObj = obj.konvaGroup;
                destroyMeasurementHandles(obj);
                if (obj.konvaTransformer) {
                    obj.konvaTransformer.destroy();
                    obj.konvaTransformer = null;
                }
                konvaObj = obj.konvaGroup;
            } else if (obj.type === 'Overpass') {
                konvaObj = obj.konvaRect;
                // 恢復原來的紅色邊框
                konvaObj.stroke('red');
                konvaObj.strokeWidth(2);
            } else if (obj.type === 'ParkingLot') {
                if (obj.konvaTransformer) {
                    obj.konvaTransformer.destroy();
                    obj.konvaTransformer = null;
                }
                // 移除事件監聽，避免記憶體洩漏或錯誤觸發
                obj.konvaGroup.off('dragmove transform');
                obj.konvaGroup.off('transformend dragend');

                destroyParkingLotHandles(obj); // 清除控制點
                konvaObj = obj.konvaGroup;
            } else if (obj.type === 'RoadMarking') {
                if (obj.konvaTransformer) {
                    obj.konvaTransformer.destroy();
                    obj.konvaTransformer = null;
                }
                if (obj.markingType === 'channelization') {
                    // 只移除附帶命名空間的事件，保留基礎的 dragmove/dragend
                    obj.konvaGroup.off('.ch_select');
                    destroyChannelizationHandles(obj);
                }
                konvaObj = obj.konvaGroup;
            } else if (obj.type === 'Zone') {
                obj.konvaGroup.draggable(false);
                obj.konvaGroup.off('.zone_select');
                destroyZoneHandles(obj);
                konvaObj = obj.konvaGroup;
            }

            if (konvaObj && obj.type !== 'Background' && obj.type !== 'Overpass' && obj.type !== 'ParkingLot' && obj.type !== 'Zone') {
                konvaObj.setAttr('shadowOpacity', 0);
            }
        }

        selectedObject = null;
        updatePropertiesPanel(null);
        layer.batchDraw(); // 確保清除高亮後畫面即時更新
    }
    function createOrigin(link, position) {
        const id = window.generateId('origin');
        // --- FIX: Use getLinkTotalWidth instead of link.numLanes ---
        const totalWidth = getLinkTotalWidth(link);
        const origin = {
            id,
            type: 'Origin',
            linkId: link.id,
            position,
            periods: [],
            konvaShape: new Konva.Arc({
                id,
                innerRadius: (totalWidth / 2) + 2,
                outerRadius: (totalWidth / 2) + 10,
                angle: 180,
                fill: 'rgba(220, 53, 69, 0.8)',
                stroke: 'black',
                strokeWidth: 1,
                listening: true,
            }),
            konvaLabel: new Konva.Text({
                text: id,
                fontSize: 12,
                fill: '#333',
                listening: false,
            }),
        };
        network.origins[id] = origin;
        layer.add(origin.konvaShape);
        layer.add(origin.konvaLabel);
        drawOrigin(origin);
        return origin;
    }
    function createDestination(link, position) {
        const id = window.generateId('dest');
        // --- FIX: Use getLinkTotalWidth instead of link.numLanes ---
        const totalWidth = getLinkTotalWidth(link);
        const destination = {
            id,
            type: 'Destination',
            linkId: link.id,
            position,
            konvaShape: new Konva.Arc({
                id,
                innerRadius: (totalWidth / 2) + 2,
                outerRadius: (totalWidth / 2) + 10,
                angle: 180,
                fill: 'rgba(40, 167, 69, 0.8)',
                stroke: 'black',
                strokeWidth: 1,
                listening: true,
            }),
            konvaLabel: new Konva.Text({
                text: id,
                fontSize: 12,
                fill: '#333',
                listening: false,
            }),
        };
        network.destinations[id] = destination;
        layer.add(destination.konvaShape);
        layer.add(destination.konvaLabel);
        drawDestination(destination);
        return destination;
    }
    // --- GEOMETRY & DRAWING HELPERS ---
    /**
     * 根據中心線產生偏移後的平行線座標
     * @param {Array<{x, y}>} points - 原始中心線座標
     * @param {number} offset - 偏移量 (+ 為法向量方向, - 為反向)
     * @returns {Array<{x, y}>} - 偏移後的座標陣列
     */
    function getOffsetPolyline(points, offset) {
        if (points.length < 2) return [];

        const newPoints = [];
        for (let i = 0; i < points.length; i++) {
            const p_curr = points[i];
            let normal;

            // 計算頂點法向量 (與 drawLink 中的邏輯一致)
            if (i === 0) {
                const p_next = points[i + 1];
                normal = getNormal(normalize(getVector(p_curr, p_next)));
            } else if (i === points.length - 1) {
                const p_prev = points[i - 1];
                normal = getNormal(normalize(getVector(p_prev, p_curr)));
            } else {
                const p_prev = points[i - 1];
                const p_next = points[i + 1];
                normal = getMiterNormal(p_prev, p_curr, p_next);
            }

            // 根據法向量與偏移量計算新座標
            newPoints.push(add(p_curr, scale(normal, offset)));
        }
        return newPoints;
    }

    // ==========================================
    // [新增] Parametric Intersection Mode 數學引擎
    // ==========================================
    window.generateParametricStrokes = function (link) {
        const config = link.parametricConfig;
        if (!config) return;

        const LL = config.leftPocket.exists ? config.leftPocket.lanes : 0;
        const TL = config.throughLanes || 1;
        const RL = config.rightPocket.exists ? config.rightPocket.lanes : 0;
        const totalStrokes = LL + TL + RL + 1;
        const totalLanes = LL + TL + RL;

        // --- 車道映射 (Lane Mapping) ---
        const prevLL = config._prevLL !== undefined ? config._prevLL : 0;
        const prevTL = config._prevTL !== undefined ? config._prevTL : (link.lanes ? link.lanes.length : 1);
        const prevRL = config._prevRL !== undefined ? config._prevRL : 0;

        const newLanes = [];

        for (let i = 0; i < LL; i++) {
            if (i < prevLL && link.lanes[i]) newLanes.push(link.lanes[i]);
            else newLanes.push({ width: LANE_WIDTH, allowedVehicleProfiles: [] });
        }
        for (let i = 0; i < TL; i++) {
            if (i < prevTL && link.lanes[prevLL + i]) newLanes.push(link.lanes[prevLL + i]);
            else newLanes.push({ width: LANE_WIDTH, allowedVehicleProfiles: [] });
        }
        for (let i = 0; i < RL; i++) {
            if (i < prevRL && link.lanes[prevLL + prevTL + i]) newLanes.push(link.lanes[prevLL + prevTL + i]);
            else newLanes.push({ width: LANE_WIDTH, allowedVehicleProfiles: [] });
        }

        config._prevLL = LL;
        config._prevTL = TL;
        config._prevRL = RL;

        link.lanes = newLanes;

        const waypoints = link.waypoints;
        if (waypoints.length < 2) return;

        const totalLen = getPolylineLength(waypoints);

        let importantDistances = [0, totalLen];
        if (LL > 0) {
            importantDistances.push(totalLen - config.leftPocket.length);
            importantDistances.push(totalLen - (config.leftPocket.length + config.leftPocket.taper));
        }
        if (RL > 0) {
            importantDistances.push(totalLen - config.rightPocket.length);
            importantDistances.push(totalLen - (config.rightPocket.length + config.rightPocket.taper));
        }

        let curL = 0;
        for (let i = 0; i < waypoints.length - 1; i++) {
            importantDistances.push(curL);
            curL += vecLen(getVector(waypoints[i], waypoints[i + 1]));
        }

        const roundedTotalLen = Math.round(totalLen * 1000) / 1000;
        importantDistances = [...new Set(importantDistances.map(d => Math.round(d * 1000) / 1000))]
            .filter(d => d >= -0.001 && d <= roundedTotalLen + 0.001)
            .sort((a, b) => a - b);

        const getParametricStrokeType = (idx, LL, TL, RL) => {
            const total = LL + TL + RL;
            if (idx === 0 || idx === total) return 'boundary'; // 最外側左右邊界
            return 'white_dashed';
        };

        const newStrokes = Array.from({ length: totalStrokes }, (_, i) => ({
            id: (link.strokes && link.strokes[i]) ? link.strokes[i].id : (window.generateId ? window.generateId('stroke') : `stroke_${++idCounter}`),
            type: getParametricStrokeType(i, LL, TL, RL),
            points: []
        }));

        const getNormalAtD = (d) => {
            let cl = 0;
            for (let i = 0; i < waypoints.length - 1; i++) {
                const p1 = waypoints[i];
                const p2 = waypoints[i + 1];
                const segL = vecLen(getVector(p1, p2));
                if (Math.abs(d - cl) < 0.001) return (i === 0) ? getNormal(normalize(getVector(p1, p2))) : getMiterNormal(waypoints[i - 1], p1, p2);
                if (Math.abs(d - (cl + segL)) < 0.001 && i === waypoints.length - 2) return getNormal(normalize(getVector(p1, p2)));
                if (d > cl && d < cl + segL) return getNormal(normalize(getVector(p1, p2)));
                cl += segL;
            }
            return getNormal(normalize(getVector(waypoints[waypoints.length - 2], waypoints[waypoints.length - 1])));
        };

        let throughWidth = 0;
        for (let i = LL; i < LL + TL; i++) throughWidth += link.lanes[i].width;

        const throughLeftEdge = -throughWidth / 2;
        const throughRightEdge = throughWidth / 2;

        const baseOffsets = [];
        let totalLeftPocketWidth = 0;
        for (let i = 0; i < LL; i++) totalLeftPocketWidth += link.lanes[i].width;

        let currentOffset = throughLeftEdge - totalLeftPocketWidth;
        baseOffsets[0] = currentOffset; // 最左側外緣

        for (let i = 0; i < totalLanes; i++) {
            currentOffset += link.lanes[i].width;
            baseOffsets[i + 1] = currentOffset;
        }

        importantDistances.forEach(d => {
            const { point } = getPointAlongPolyline(waypoints, d);
            const normal = getNormalAtD(d);
            const distFromEnd = totalLen - d;

            let leftExpRatio = 0;
            if (LL > 0) {
                const len = config.leftPocket.length;
                const tap = config.leftPocket.taper;
                if (distFromEnd <= len + 0.001) leftExpRatio = 1;
                else if (distFromEnd <= len + tap) leftExpRatio = 1 - ((distFromEnd - len) / tap);
            }

            let rightExpRatio = 0;
            if (RL > 0) {
                const len = config.rightPocket.length;
                const tap = config.rightPocket.taper;
                if (distFromEnd <= len + 0.001) rightExpRatio = 1;
                else if (distFromEnd <= len + tap) rightExpRatio = 1 - ((distFromEnd - len) / tap);
            }

            for (let idx = 0; idx < totalStrokes; idx++) {
                let offset = 0;
                if (idx <= LL) {
                    offset = throughLeftEdge + (baseOffsets[idx] - throughLeftEdge) * leftExpRatio;
                } else if (idx <= LL + TL) {
                    offset = baseOffsets[idx];
                } else {
                    offset = throughRightEdge + (baseOffsets[idx] - throughRightEdge) * rightExpRatio;
                }

                newStrokes[idx].points.push(add(point, scale(normal, offset)));
            }
        });

        link.strokes = newStrokes;

        for (let i = 0; i < totalLanes; i++) {
            link.lanes[i].leftStrokeId = newStrokes[i].id;
            link.lanes[i].rightStrokeId = newStrokes[i + 1].id;
        }
    };


    function getVector(p1, p2) { return { x: p2.x - p1.x, y: p2.y - p1.y }; }
    function vecLen(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
    function normalize(v) { const l = vecLen(v); return l > 0 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 }; }
    function getNormal(v) { return { x: -v.y, y: v.x }; }
    function add(p1, p2) { return { x: p1.x + p2.x, y: p1.y + p2.y }; }
    function scale(v, s) { return { x: v.x * s, y: v.y * s }; }
    function dot(v1, v2) { return v1.x * v2.x + v1.y * v2.y; }

    function getPointAlongPolyline(points, distance) {
        let traveled = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const segmentVec = getVector(p1, p2);
            const segmentLen = vecLen(segmentVec);
            if (segmentLen > 0 && traveled + segmentLen >= distance) {
                const remainingDist = distance - traveled;
                const ratio = remainingDist / segmentLen;
                return {
                    point: add(p1, scale(segmentVec, ratio)),
                    vec: normalize(segmentVec),
                };
            }
            traveled += segmentLen;
        }
        const lastVec = normalize(getVector(points[points.length - 2], points[points.length - 1]));
        return { point: points[points.length - 1], vec: lastVec };
    }
    /**
         * [新增幾何輔助] 參數化重取樣：將一條不規則的折線，等距切割成 numSegments 段，
         * 回傳包含 (numSegments + 1) 個點的陣列。
         * 這能確保兩條長短、點數不同的邊界線，能有一對一的點位來計算中心線。
         */
    function resamplePolyline(points, numSegments) {
        if (points.length < 2) return points;

        let totalLength = getPolylineLength(points);
        if (totalLength === 0) return points; // 防呆：長度為0直接回傳

        let step = totalLength / numSegments;
        let resampled = [points[0]]; // 第一個點必定是起點

        for (let i = 1; i < numSegments; i++) {
            let result = getPointAlongPolyline(points, step * i);
            if (result && result.point) {
                resampled.push(result.point);
            }
        }

        resampled.push(points[points.length - 1]); // 最後一個點必定是終點
        return resampled;
    }
    function getPolylineLength(points) {
        let length = 0;
        for (let i = 0; i < points.length - 1; i++) {
            length += vecLen(getVector(points[i], points[i + 1]));
        }
        return length;
    }

    function getMiterNormal(p_prev, p_curr, p_next) {
        const v1 = normalize(getVector(p_prev, p_curr));
        const v2 = normalize(getVector(p_curr, p_next));

        const normal1 = getNormal(v1);

        const dotProduct = dot(v1, v2);
        if (Math.abs(dotProduct) > 0.999) {
            return normal1;
        }

        const miterVec = normalize(add(v1, v2));
        const miterNormal = getNormal(miterVec);

        const miterLength = 1 / dot(miterNormal, normal1);
        if (miterLength > 4) {
            return normalize(add(normal1, getNormal(v2)));
        }

        return miterNormal;
    }
    // --- [新增] 點對線段的精確投影 ---
    function projectPointOnSegment(pt, p1, p2) {
        const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
        if (l2 === 0) return p1;
        let t = ((pt.x - p1.x) * (p2.x - p1.x) + (pt.y - p1.y) * (p2.y - p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }

    // --- [新增] 動態拓撲分析：計算實質接觸邊界的連接埠 ---
    function getLaneBasedPorts(link) {
        if (!link || !link.strokes || link.strokes.length < 2 || !link.lanes) return { startPorts: [], endPorts: [] };

        const leftBound = link.strokes[0].points;
        const rightBound = link.strokes[link.strokes.length - 1].points;

        const pNW = leftBound[0];
        const pNE = rightBound[0];
        const pSW = leftBound[leftBound.length - 1];
        const pSE = rightBound[rightBound.length - 1];

        const startPorts = [];
        const endPorts = [];
        const EPSILON = 2.0; // 接觸判定容差

        // 遍歷實體車道 (而非遍歷標線)，精準找出接觸門的 Port
        link.lanes.forEach((lane, laneIdx) => {
            let leftStroke = link.strokes.find(s => s.id == lane.leftStrokeId);
            let rightStroke = link.strokes.find(s => s.id == lane.rightStrokeId);

            // 舊資料防呆：找不到 ID 則回歸預設 Index
            if (!leftStroke) leftStroke = link.strokes[laneIdx];
            if (!rightStroke) rightStroke = link.strokes[laneIdx + 1] || link.strokes[link.strokes.length - 1];
            if (!leftStroke || !rightStroke) return;

            const ptLFirst = leftStroke.points[0];
            const ptLLast = leftStroke.points[leftStroke.points.length - 1];
            const ptRFirst = rightStroke.points[0];
            const ptRLast = rightStroke.points[rightStroke.points.length - 1];

            // 判斷該車道的起點門 (Start Gate)
            let dLStart = vecLen(getVector(ptLFirst, projectPointOnSegment(ptLFirst, pNW, pNE)));
            let dRStart = vecLen(getVector(ptRFirst, projectPointOnSegment(ptRFirst, pNW, pNE)));
            if (dLStart < EPSILON && dRStart < EPSILON && vecLen(getVector(ptLFirst, ptRFirst)) > 0.5) {
                startPorts.push({ laneIndex: laneIdx, point: { x: (ptLFirst.x + ptRFirst.x) / 2, y: (ptLFirst.y + ptRFirst.y) / 2 } });
            }

            // 判斷該車道的終點門 (End Gate)
            let dLEnd = vecLen(getVector(ptLLast, projectPointOnSegment(ptLLast, pSW, pSE)));
            let dREnd = vecLen(getVector(ptRLast, projectPointOnSegment(ptRLast, pSW, pSE)));
            if (dLEnd < EPSILON && dREnd < EPSILON && vecLen(getVector(ptLLast, ptRLast)) > 0.5) {
                endPorts.push({ laneIndex: laneIdx, point: { x: (ptLLast.x + ptRLast.x) / 2, y: (ptLLast.y + ptRLast.y) / 2 } });
            }
        });

        return { startPorts, endPorts };
    }

    function getLanePath(link, laneIndex) {
        if (!link || !link.lanes || link.waypoints.length < 2 || laneIndex < 0) return [];

        // --- [新增] Lane-Based 多型路徑計算 ---
        if ((link.geometryType === 'lane-based' || link.geometryType === 'parametric') && link.strokes && link.strokes.length > 1) {
            const lane = link.lanes[laneIndex];

            // ★★★ [核心修正] 利用 ID 尋找真實標線 ★★★
            let leftStroke, rightStroke;
            if (lane && lane.leftStrokeId !== undefined && lane.rightStrokeId !== undefined) {
                leftStroke = link.strokes.find(s => s.id == lane.leftStrokeId);
                rightStroke = link.strokes.find(s => s.id == lane.rightStrokeId);
            }

            // 舊資料防呆：找不到 ID 則回歸 Index
            if (!leftStroke) leftStroke = link.strokes[laneIndex];
            if (!rightStroke) rightStroke = link.strokes[laneIndex + 1] || link.strokes[link.strokes.length - 1];

            if (leftStroke && rightStroke) {
                const SEGMENTS = 20;
                const resampledLeft = resamplePolyline(leftStroke.points, SEGMENTS);
                const resampledRight = resamplePolyline(rightStroke.points, SEGMENTS);

                const path = [];
                const safeSegments = Math.min(resampledLeft.length - 1, resampledRight.length - 1);
                for (let i = 0; i <= safeSegments; i++) {
                    path.push({
                        x: (resampledLeft[i].x + resampledRight[i].x) / 2,
                        y: (resampledLeft[i].y + resampledRight[i].y) / 2
                    });
                }

                // 強制將起點/終點對齊到實體接觸門(Gates)所產生的 Port，確保貝茲曲線完美銜接
                const ports = getLaneBasedPorts(link);
                const sPort = ports.startPorts.find(p => p.laneIndex === laneIndex);
                const ePort = ports.endPorts.find(p => p.laneIndex === laneIndex);

                if (sPort && path.length > 0) path[0] = sPort.point;
                if (ePort && path.length > 0) path[path.length - 1] = ePort.point;

                return path;
            }
        }

        // --- 原本 Standard 模式的 Offset 邏輯 ---
        if (laneIndex >= link.lanes.length) return [];
        const totalWidth = getLinkTotalWidth(link);
        let cumulativeWidth = 0;
        for (let i = 0; i < laneIndex; i++) {
            cumulativeWidth += link.lanes[i].width;
        }
        const laneCenterOffset = cumulativeWidth + link.lanes[laneIndex].width / 2;
        const offset = laneCenterOffset - totalWidth / 2;

        const lanePath = [];
        const waypoints = link.waypoints;

        for (let i = 0; i < waypoints.length; i++) {
            const p_curr = waypoints[i];
            let normal;

            if (i === 0) {
                const p_next = waypoints[i + 1];
                normal = getNormal(normalize(getVector(p_curr, p_next)));
            } else if (i === waypoints.length - 1) {
                const p_prev = waypoints[i - 1];
                normal = getNormal(normalize(getVector(p_prev, p_curr)));
            } else {
                const p_prev = waypoints[i - 1];
                const p_next = waypoints[i + 1];
                normal = getMiterNormal(p_prev, p_curr, p_next);
            }
            lanePath.push(add(p_curr, scale(normal, offset)));
        }
        return lanePath;
    }

    // ==========================================
    // [新增/修改] Lane-Based 空間排序與幾何運算核心
    // ==========================================

    /**
     * 計算單一點到不規則折線的「最短帶號距離 (Signed Distance)」
     * 正值代表點在折線的右側，負值代表在左側 (依據折線前進方向)
     */
    function getSignedDistToPolyline(pt, polyline) {
        let minDist = Infinity;
        let bestSign = 1;

        for (let i = 0; i < polyline.length - 1; i++) {
            const p1 = polyline[i];
            const p2 = polyline[i + 1];

            // 找出點到該線段的最短投影點
            const proj = projectPointOnSegment(pt, p1, p2);
            const dist = vecLen(getVector(pt, proj));

            if (dist < minDist) {
                minDist = dist;
                // 利用該段線段的「局部法向量 (Local Normal)」來判斷左右
                const segVec = normalize(getVector(p1, p2));
                const rightNormal = getNormal(segVec); // 指向右側
                const vToPt = getVector(p1, pt);
                bestSign = dot(vToPt, rightNormal) >= 0 ? 1 : -1;
            }
        }
        return minDist * bestSign;
    }

    /**
     * 計算一整條標線 (Stroke) 相對於基準線 (Reference Line) 的平均空間位置
     * 透過多點採樣，完美克服偏心、曲折或長短不一造成的誤判
     */
    function getAverageSignedDist(strokePoints, refPolyline) {
        // 將標線等距切成 5 個採樣點 (0%, 25%, 50%, 75%, 100%)
        const samples = resamplePolyline(strokePoints, 4);
        let sumDist = 0;
        for (let pt of samples) {
            sumDist += getSignedDistToPolyline(pt, refPolyline);
        }
        return sumDist / samples.length;
    }

    /**
     * 將使用者畫的任意標線陣列，按空間位置 (由左至右) 精確排序
     */
    function spatialSortStrokes(strokes) {
        if (strokes.length <= 1) return strokes;

        // 取第一條線作為空間基準軸
        const baseLine = strokes[0].rawPoints;

        strokes.forEach(stroke => {
            // 計算整條線相對基準軸的平均位置 (越負越在左，越正越在右)
            stroke.projectionDist = getAverageSignedDist(stroke.rawPoints, baseLine);
        });

        return strokes.sort((a, b) => a.projectionDist - b.projectionDist);
    }

    // 當對向車道 (Backward Link) 共用同一條不對稱標線時，視覺語意必須反轉
    function flipStrokeSemantics(strokeType) {
        const flipMap = {
            'yellow_solid_dashed': 'yellow_dashed_solid',
            'yellow_dashed_solid': 'yellow_solid_dashed',
            'white_solid_dashed': 'white_dashed_solid',
            'white_dashed_solid': 'white_solid_dashed'
        };
        return flipMap[strokeType] || strokeType;
    }

    // --- [新增輔助函數] 標線語意反轉 ---
    // 當對向車道 (Backward Link) 共用同一條不對稱標線時，視覺語意必須反轉
    function flipStrokeSemantics(strokeType) {
        const flipMap = {
            'yellow_solid_dashed': 'yellow_dashed_solid',
            'yellow_dashed_solid': 'yellow_solid_dashed',
            'white_solid_dashed': 'white_dashed_solid',
            'white_dashed_solid': 'white_solid_dashed'
        };
        return flipMap[strokeType] || strokeType;
    }

    /**
     * Lane-Based 生成引擎 (支援黃線偏心自動切割雙向)
     */
    function generateLaneBasedLink(strokesArray) {
        if (strokesArray.length < 2) return;

        // 1. 統一所有標線的初始方向 (防呆：防止使用者反著畫)
        // 以第一條畫的線(通常是邊界或黃線)為總基準方向
        const globalBasePts = strokesArray[0].rawPoints;
        const globalBaseVec = normalize(getVector(globalBasePts[0], globalBasePts[globalBasePts.length - 1]));

        strokesArray.forEach(s => {
            const sPts = s.rawPoints;
            const sVec = normalize(getVector(sPts[0], sPts[sPts.length - 1]));
            // 如果這條線的大方向與基準線相反，先將其點位反轉對齊
            if (dot(sVec, globalBaseVec) < 0) {
                s.rawPoints.reverse();
            }
        });

        // 2. 尋找「基準分割線」 (尋找黃線)
        let centerStrokeIndex = -1;
        for (let i = 0; i < strokesArray.length; i++) {
            if (strokesArray[i].type.includes('yellow')) {
                centerStrokeIndex = i;
                break;
            }
        }

        // ==========================================
        // [模式 A] 單向路段 (無黃線)
        // ==========================================
        if (centerStrokeIndex === -1) {
            const sortedStrokes = spatialSortStrokes(strokesArray);
            const logicalLaneCount = Math.max(1, sortedStrokes.length - 1);
            const newLink = createLink([{ x: 0, y: 0 }, { x: 1, y: 1 }], logicalLaneCount);

            newLink.name = `LaneBased_${idCounter}`;
            newLink.geometryType = 'lane-based';
            newLink.strokes = sortedStrokes.map(s => ({ type: s.type, points: s.rawPoints }));

            updateLaneBasedGeometry(newLink);
            drawLink(newLink);
            selectObject(newLink);
            saveState();
            return;
        }

        // ==========================================
        // [模式 B] 雙向路段 (以黃線為基準軸切割)
        // ==========================================
        const centerStroke = strokesArray[centerStrokeIndex];
        const forwardStrokes = [];
        const backwardStrokes = [];

        // 3. 空間分流：利用積分採樣判斷標線在黃線的左邊還是右邊
        strokesArray.forEach((stroke, idx) => {
            if (idx === centerStrokeIndex) return;

            // 計算這條線相對於黃線的平均距離
            const avgDist = getAverageSignedDist(stroke.rawPoints, centerStroke.rawPoints);
            const strokeCopy = { type: stroke.type, rawPoints: [...stroke.rawPoints] };

            if (avgDist > 0.1) {
                forwardStrokes.push(strokeCopy);  // 在右側 -> 順向車道
            } else if (avgDist < -0.1) {
                backwardStrokes.push(strokeCopy); // 在左側 -> 逆向車道
            }
        });

        // 4. 處理順向路段 (Forward Link)
        if (forwardStrokes.length > 0) {
            forwardStrokes.push({ type: centerStroke.type, rawPoints: [...centerStroke.rawPoints] });

            const sortedF = spatialSortStrokes(forwardStrokes);
            const linkF = createLink([{ x: 0, y: 0 }, { x: 1, y: 1 }], Math.max(1, sortedF.length - 1));
            linkF.name = `LaneBased_${idCounter}_F`;
            linkF.geometryType = 'lane-based';

            // ★★★ [核心修正] 生成時必須明確賦予 Stroke ID ★★★
            linkF.strokes = sortedF.map((s, idx) => ({ id: `${idx}`, type: s.type, points: s.rawPoints }));
            // 明確綁定左右邊界 ID
            linkF.lanes.forEach((lane, idx) => {
                lane.leftStrokeId = `${idx}`;
                lane.rightStrokeId = `${idx + 1}`;
            });

            updateLaneBasedGeometry(linkF);
            drawLink(linkF);

            centerStroke.forwardLinkId = linkF.id;
        }

        // 5. 處理逆向路段 (Backward Link)
        if (backwardStrokes.length > 0) {
            const flippedType = flipStrokeSemantics(centerStroke.type);
            backwardStrokes.push({ type: flippedType, rawPoints: [...centerStroke.rawPoints] });

            let sortedB = spatialSortStrokes(backwardStrokes);
            sortedB.reverse();
            sortedB.forEach(s => s.rawPoints.reverse());

            const linkB = createLink([{ x: 0, y: 0 }, { x: 1, y: 1 }], Math.max(1, sortedB.length - 1));
            linkB.name = `LaneBased_${idCounter}_B`;
            linkB.geometryType = 'lane-based';

            // ★★★ [核心修正] 生成時必須明確賦予 Stroke ID ★★★
            linkB.strokes = sortedB.map((s, idx) => ({ id: `${idx}`, type: s.type, points: s.rawPoints }));
            // 明確綁定左右邊界 ID
            linkB.lanes.forEach((lane, idx) => {
                lane.leftStrokeId = `${idx}`;
                lane.rightStrokeId = `${idx + 1}`;
            });

            updateLaneBasedGeometry(linkB);
            drawLink(linkB);

            if (centerStroke.forwardLinkId) {
                const linkF = network.links[centerStroke.forwardLinkId];
                linkF.pairInfo = { pairId: linkB.id, type: 'forward', medianWidth: 0.2 };
                linkB.pairInfo = { pairId: linkF.id, type: 'backward', medianWidth: 0.2 };
            }
        }

        saveState();
        layer.batchDraw();
    }
    /**
         * [新增] 共用更新：更新中心線與所有附屬物件的位置
         */
    function updateDependencies(link) {
        updateConnectionEndpoints(link.id);
        updateAllDetectorsOnLink(link.id);
        updateFlowPointsOnLink(link.id);
        updateRoadSignsOnLink(link.id);
        updateAllOverpasses();
    }

    /**
     * [新增] Lane-based 幾何同步：當標線被編輯時，重算虛擬中心線 (Waypoints)
     */
    function updateLaneBasedGeometry(link) {
        if (!link.strokes || link.strokes.length < 2) return;

        const SEGMENTS = 20;
        // 取最左與最右邊界來計算平均中心線
        const leftBound = link.strokes[0].points;
        const rightBound = link.strokes[link.strokes.length - 1].points;

        const resampledLeft = resamplePolyline(leftBound, SEGMENTS);
        const resampledRight = resamplePolyline(rightBound, SEGMENTS);

        const safeSegments = Math.min(SEGMENTS, resampledLeft.length - 1, resampledRight.length - 1);
        const centerPoints = [];

        for (let i = 0; i <= safeSegments; i++) {
            if (resampledLeft[i] && resampledRight[i]) {
                centerPoints.push({
                    x: (resampledLeft[i].x + resampledRight[i].x) / 2,
                    y: (resampledLeft[i].y + resampledRight[i].y) / 2
                });
            }
        }

        if (centerPoints.length >= 2) {
            link.waypoints = centerPoints;
        }
    }
    function drawLink(link) {
        link.konvaGroup.destroyChildren();

        // [新增] 取得透明度設定，預設為 1 (100% 不透明)
        const opacity = link.roadOpacity !== undefined ? link.roadOpacity : 1;

        // ==========================================
        // [新增] Lane-Based 多型渲染邏輯
        // ==========================================
        if ((link.geometryType === 'lane-based' || link.geometryType === 'parametric') && link.strokes) {
            // 1. 畫底層灰黑色路面
            const leftPoints = link.strokes[0].points;
            const rightPoints = link.strokes[link.strokes.length - 1].points;

            const roadShape = new Konva.Shape({
                sceneFunc: (ctx, shape) => {
                    if (leftPoints.length < 2 || rightPoints.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
                    for (let i = 1; i < leftPoints.length; i++) ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
                    for (let i = rightPoints.length - 1; i >= 0; i--) ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
                    ctx.closePath();
                    ctx.fillShape(shape);
                },
                fill: '#444',
                listening: true,
                id: link.id,
                name: 'road-surface', // <--- [新增] 命名以便尋找
                opacity: opacity      // <--- [新增] 套用透明度
            });
            link.konvaGroup.add(roadShape);

            // 2. 依照語意畫出標線
            link.strokes.forEach(stroke => {
                const style = STROKE_TYPES[stroke.type] || STROKE_TYPES['boundary'];

                if (style.dual) {
                    const offset = style.gap / 2;

                    // ★★★ [修正重點] Konva 座標系的 Y 軸向下，平移的法向量預設指向車流行進方向的「右側」 ★★★
                    // 因此，物理世界車道的「左側 (Left)」應為 -offset，「右側 (Right)」應為 +offset
                    const ptsLeft = getOffsetPolyline(stroke.points, -offset);
                    const ptsRight = getOffsetPolyline(stroke.points, offset);

                    if (ptsLeft.length > 0) {
                        const lineLeft = new Konva.Line({
                            points: ptsLeft.flatMap(p => [p.x, p.y]),
                            stroke: style.color, strokeWidth: style.width,
                            dash: style.leftDash, listening: false, lineCap: 'round', lineJoin: 'round'
                        });
                        link.konvaGroup.add(lineLeft);
                    }
                    if (ptsRight.length > 0) {
                        const lineRight = new Konva.Line({
                            points: ptsRight.flatMap(p => [p.x, p.y]),
                            stroke: style.color, strokeWidth: style.width,
                            dash: style.rightDash, listening: false, lineCap: 'round', lineJoin: 'round'
                        });
                        link.konvaGroup.add(lineRight);
                    }
                } else {
                    const flatPoints = stroke.points.flatMap(p => [p.x, p.y]);
                    const line = new Konva.Line({
                        points: flatPoints,
                        stroke: style.color, strokeWidth: style.width,
                        dash: style.dash, listening: false, lineCap: 'round', lineJoin: 'round'
                    });
                    link.konvaGroup.add(line);
                }
            });

            if (typeof drawSynchroGroundArrowsOnLink === 'function') {
                drawSynchroGroundArrowsOnLink(link);
            }
            return; // Lane-based 畫完直接返回
        }

        // ==========================================
        // (以下保留原本 Standard Link 的 drawLink 邏輯)
        // ==========================================
        const totalWidth = getLinkTotalWidth(link);
        const halfWidth = totalWidth / 2;

        const roadShape = new Konva.Shape({
            sceneFunc: (ctx, shape) => {
                if (link.waypoints.length < 2) return;

                const waypoints = link.waypoints;
                const leftBoundary = [];
                const rightBoundary = [];

                for (let i = 0; i < waypoints.length; i++) {
                    const p_curr = waypoints[i];
                    let normal;

                    if (i === 0) {
                        const p_next = waypoints[i + 1];
                        normal = getNormal(normalize(getVector(p_curr, p_next)));
                    } else if (i === waypoints.length - 1) {
                        const p_prev = waypoints[i - 1];
                        normal = getNormal(normalize(getVector(p_prev, p_curr)));
                    } else {
                        const p_prev = waypoints[i - 1];
                        const p_next = waypoints[i + 1];
                        normal = getMiterNormal(p_prev, p_curr, p_next);
                    }

                    leftBoundary.push(add(p_curr, scale(normal, halfWidth)));
                    rightBoundary.push(add(p_curr, scale(normal, -halfWidth)));
                }

                ctx.beginPath();
                ctx.moveTo(leftBoundary[0].x, leftBoundary[0].y);
                for (let i = 1; i < leftBoundary.length; i++) {
                    ctx.lineTo(leftBoundary[i].x, leftBoundary[i].y);
                }
                for (let i = rightBoundary.length - 1; i >= 0; i--) {
                    ctx.lineTo(rightBoundary[i].x, rightBoundary[i].y);
                }
                ctx.closePath();
                ctx.fillShape(shape);
            },
            fill: '#666',
            listening: false,
            name: 'road-surface', // <--- [新增] 命名以便尋找
            opacity: opacity      // <--- [新增] 套用透明度
        });
        link.konvaGroup.add(roadShape);

        // 繪製車道分隔線
        let cumulativeWidth = 0;
        for (let i = 0; i < link.lanes.length - 1; i++) {
            cumulativeWidth += link.lanes[i].width;
            const dividerOffset = cumulativeWidth - halfWidth;

            const dividerPath = [];
            const waypoints = link.waypoints;
            for (let j = 0; j < waypoints.length; j++) {
                const p_curr = waypoints[j];
                let normal;
                if (j === 0) {
                    normal = getNormal(normalize(getVector(waypoints[j], waypoints[j + 1])));
                } else if (j === waypoints.length - 1) {
                    normal = getNormal(normalize(getVector(waypoints[j - 1], waypoints[j])));
                } else {
                    normal = getMiterNormal(waypoints[j - 1], p_curr, waypoints[j + 1]);
                }
                dividerPath.push(add(p_curr, scale(normal, dividerOffset)));
            }

            if (dividerPath.length < 1) continue;
            const flatPoints = dividerPath.flatMap(p => [p.x, p.y]);
            const divider = new Konva.Line({
                points: flatPoints,
                stroke: 'white',
                strokeWidth: 1,
                dash: [10, 10],
                listening: false,
                tension: 0,
            });
            link.konvaGroup.add(divider);
        }

        if (typeof drawSynchroGroundArrowsOnLink === 'function') {
            drawSynchroGroundArrowsOnLink(link);
        }

        const clickableArea = new Konva.Line({
            id: link.id,
            points: link.waypoints.flatMap(p => [p.x, p.y]),
            stroke: 'transparent',
            strokeWidth: totalWidth + 8,
            lineCap: 'round',
            lineJoin: 'round',
        });
        link.konvaGroup.add(clickableArea);
    }

    function drawDetector(detector) {
        // 1. 清理舊的圖形元素
        detector.konvaGroup.destroyChildren();
        const link = network.links[detector.linkId];
        if (!link || link.waypoints.length < 2) return;

        const konvaGroup = detector.konvaGroup;

        // 2. 根據偵測器類型繪製視覺外觀
        if (detector.type === 'PointDetector') {
            const shape = new Konva.RegularPolygon({
                sides: 3, radius: 8, fill: 'orange', stroke: 'black', strokeWidth: 1,
                name: 'detector-body'
            });
            konvaGroup.add(shape);
        } else if (detector.type === 'SectionDetector') {
            // --- 區段偵測器 (SectionDetector) ---

            // 下游固定點 (位於群組原點)
            const endVis = new Konva.Rect({
                x: -2, y: -8, width: 4, height: 16, fill: 'cyan',
                name: 'detector-body'
            });
            // 連接線
            const lineVis = new Konva.Line({
                points: [-(detector.length), 0, 0, 0],
                stroke: 'cyan', strokeWidth: 2,
                name: 'detector-body'
            });
            // 上游可拖曳的藍色拉桿
            const lengthHandle = new Konva.Rect({
                x: -(detector.length), y: -10,
                width: 8, height: 20,
                fill: 'blue', stroke: 'white', strokeWidth: 1,
                draggable: true,
                name: 'length-handle'
            });

            // --- *** 最終修正：拉桿拖曳邏輯 *** ---
            lengthHandle.on('dragmove', (e) => {
                // 1. 防止事件冒泡，避免觸發整個群組的拖曳
                e.cancelBubble = true;

                // 2. 獲取滑鼠在畫布(layer)上的即時座標
                const pointerPos = stage.getPointerPosition();
                const localPos = layer.getAbsoluteTransform().copy().invert().point(pointerPos);

                // 3. 將滑鼠座標投影到 Link 路徑上，得到新的上游點位置 (dist)
                const { dist } = projectPointOnPolyline(localPos, link.waypoints);

                // 4. 計算新的偵測器長度。長度 = (固定的下游點位置) - (新的上游點位置)
                //    同時確保上游點不會超過下游點 (dist <= detector.position)，所以長度恆為正。
                const newLength = Math.max(0, detector.position - Math.min(dist, detector.position));

                // 5. 更新偵測器物件的資料模型
                detector.length = newLength;

                // 6. 更新視覺元素
                // 6a. 更新連接線的點，點是相對於父群組原點（下游點）的
                lineVis.points([-newLength, 0, 0, 0]);

                // 6b. 手動設置拉桿的位置，覆蓋 Konva 的預設拖曳行為。
                //     位置也是相對於父群組的。我們只需更新其 x 座標，並重設 y 座標以防垂直飄移。
                const handle = e.target;
                handle.x(-newLength);
                handle.y(-10);

                // 7. 即時更新屬性面板
                if (selectedObject && selectedObject.id === detector.id) {
                    updatePropertiesPanel(detector);
                }

                // 8. 因為我們手動控制拉桿位置，所以需要手動重繪圖層
                layer.batchDraw();
            });

            // 拖曳結束時，再次確保 Y 座標正確，防止任何殘留的飄移
            lengthHandle.on('dragend', (e) => {
                e.cancelBubble = true;
                e.target.y(-10);
                layer.batchDraw();
            });

            // 拖曳開始時，僅需阻止事件冒泡即可
            lengthHandle.on('dragstart', (e) => {
                e.cancelBubble = true;
            });

            konvaGroup.add(endVis, lineVis, lengthHandle);
        }

        // 3. 定位與旋轉整個偵測器群組
        const updateDetectorGroupPosition = () => {
            // 群組的基準點是其下游的固定點
            const { point, vec } = getPointAlongPolyline(link.waypoints, detector.position);
            const normal = getNormal(vec);

            // --- FIX: Use getLinkTotalWidth to calculate the correct road width for offset ---
            const totalWidth = getLinkTotalWidth(link);
            const offset = (totalWidth / 2) + 5;
            // --- END OF FIX ---

            const pos = add(point, scale(normal, offset));

            konvaGroup.position(pos);
            konvaGroup.rotation(Konva.Util.radToDeg(Math.atan2(vec.y, vec.x)));
        };

        updateDetectorGroupPosition();

        // 4. 整個偵測器群組 (主體) 的拖曳邏輯 (與 RoadSign 類似)
        konvaGroup.draggable(true);

        konvaGroup.on('dragstart', (e) => {
            // 如果拖曳是從藍色拉桿開始的，則停止群組的拖曳
            if (e.target.name() === 'length-handle') {
                konvaGroup.stopDrag();
                e.cancelBubble = true;
            }
        });

        konvaGroup.on('dragmove', (e) => {
            // 此事件只應在拖曳主體時觸發
            if (e.target.name() === 'length-handle') return;

            const pointerPos = stage.getPointerPosition();
            const localPos = layer.getAbsoluteTransform().copy().invert().point(pointerPos);
            const { dist } = projectPointOnPolyline(localPos, link.waypoints);

            const maxPos = getPolylineLength(link.waypoints);
            const minPos = detector.type === 'SectionDetector' ? detector.length : 0;

            detector.position = Math.max(minPos, Math.min(dist, maxPos));

            updateDetectorGroupPosition();

            if (selectedObject && selectedObject.id === detector.id) {
                updatePropertiesPanel(detector);
            }
            layer.batchDraw();
        });
    }
    function drawRoadSign(sign) {
        const link = network.links[sign.linkId];
        if (!link || link.waypoints.length < 2) return;

        const { point, vec } = getPointAlongPolyline(link.waypoints, sign.position);
        const normal = getNormal(vec);
        const totalWidth = getLinkTotalWidth(link);

        if (sign.signType === 'traffic_cone') {
            sign.konvaShape.rotation(Konva.Util.radToDeg(Math.atan2(vec.y, vec.x)));
        } else {
            // 一般標誌強制確保釘在路緣 (避免舊資料出錯)
            sign.lateralOffset = (totalWidth / 2) + 8;
            sign.konvaShape.rotation(0);
        }

        const pos = add(point, scale(normal, sign.lateralOffset));
        sign.konvaShape.position(pos);
    }
    function drawOrigin(origin) {
        const link = network.links[origin.linkId];
        if (!link || link.waypoints.length < 2) return;

        const { point, vec } = getPointAlongPolyline(link.waypoints, origin.position);
        const rotationDegrees = Konva.Util.radToDeg(Math.atan2(vec.y, vec.x));

        origin.konvaShape.position({ x: point.x, y: point.y });
        origin.konvaShape.rotation(rotationDegrees - 90);

        // --- FIX: Use getLinkTotalWidth instead of link.numLanes ---
        const totalWidth = getLinkTotalWidth(link);
        const labelOffset = (totalWidth / 2) + 15;
        const labelAngle = Math.atan2(vec.y, vec.x);
        const labelPos = {
            x: point.x + Math.cos(labelAngle) * labelOffset,
            y: point.y + Math.sin(labelAngle) * labelOffset,
        };
        origin.konvaLabel.position(labelPos);
        origin.konvaLabel.rotation(rotationDegrees);
        origin.konvaLabel.offsetX(origin.konvaLabel.width() / 2);
        origin.konvaLabel.offsetY(origin.konvaLabel.height() / 2);
    }
    function drawDestination(destination) {
        const link = network.links[destination.linkId];
        if (!link || link.waypoints.length < 2) return;

        const { point, vec } = getPointAlongPolyline(link.waypoints, destination.position);
        const rotationDegrees = Konva.Util.radToDeg(Math.atan2(vec.y, vec.x));

        destination.konvaShape.position({ x: point.x, y: point.y });
        destination.konvaShape.rotation(rotationDegrees + 90);

        // --- FIX: Use getLinkTotalWidth instead of link.numLanes ---
        const totalWidth = getLinkTotalWidth(link);
        const labelOffset = (totalWidth / 2) + 15;
        const labelAngle = Math.atan2(vec.y, vec.x);
        const labelPos = {
            x: point.x + Math.cos(labelAngle) * labelOffset,
            y: point.y + Math.sin(labelAngle) * labelOffset,
        };
        destination.konvaLabel.position(labelPos);
        destination.konvaLabel.rotation(rotationDegrees);
        destination.konvaLabel.offsetX(destination.konvaLabel.width() / 2);
        destination.konvaLabel.offsetY(destination.konvaLabel.height() / 2);
    }
    function updateAllDetectorsOnLink(linkId) {
        Object.values(network.detectors).forEach(det => {
            if (det.linkId === linkId) {
                drawDetector(det);
            }
        });
    }

    function updateRoadSignsOnLink(linkId) {
        Object.values(network.roadSigns).forEach(sign => {
            if (sign.linkId === linkId) {
                drawRoadSign(sign);
            }
        });
    }

    function updateFlowPointsOnLink(linkId) {
        const link = network.links[linkId];
        if (!link) return;

        // 當 Link 幾何形狀改變後，重新計算其總長度
        const linkLength = getPolylineLength(link.waypoints);

        // 更新此 Link 上的所有「起點 (Origin)」
        Object.values(network.origins).forEach(o => {
            if (o.linkId === linkId) {
                // 起點的位置是相對於開頭的固定小距離，無需更新其 position 屬性，
                // 直接重繪即可。
                drawOrigin(o);
            }
        });

        // 更新此 Link 上的所有「迄點 (Destination)」
        Object.values(network.destinations).forEach(d => {
            if (d.linkId === linkId) {
                // --- FIX ---
                // 迄點的位置是相對於終點的，所以當 Link 長度改變時，
                // 我們必須根據新的總長度重新計算它的絕對位置 (position)。
                // 這裡我們使用與創建迄點時相同的邏輯。
                d.position = Math.max(linkLength - 5, linkLength * 0.9);

                // 使用更新後的位置來重繪迄點物件
                drawDestination(d);
            }
        });
    }

    function getNodePolygonPoints(node) {
        const allLinkIds = [...new Set([...node.incomingLinkIds, ...node.outgoingLinkIds])];
        const allLinks = allLinkIds.map(id => network.links[id]).filter(Boolean);

        let dynamicPoints = [];

        // 1. 動態計算當前所有連接路段的真實端點
        if (allLinks.length > 0) {
            const allCornerPoints = [];
            const centerlinePoints = [];

            for (const link of allLinks) {
                if (!link || !link.waypoints || link.waypoints.length < 2) continue;

                const isIncoming = node.incomingLinkIds.has(link.id);
                const isOutgoing = node.outgoingLinkIds.has(link.id);

                const connectedEnds = [];
                if (isIncoming && !isOutgoing) connectedEnds.push('end');
                else if (isOutgoing && !isIncoming) connectedEnds.push('start');
                else {
                    const pStart = link.waypoints[0];
                    const pEnd = link.waypoints[link.waypoints.length - 1];
                    const distStart = Math.pow(pStart.x - node.x, 2) + Math.pow(pStart.y - node.y, 2);
                    const distEnd = Math.pow(pEnd.x - node.x, 2) + Math.pow(pEnd.y - node.y, 2);

                    if (distStart < distEnd) connectedEnds.push('start');
                    else connectedEnds.push('end');
                }

                for (const endType of connectedEnds) {
                    if ((link.geometryType === 'lane-based' || link.geometryType === 'parametric') && link.strokes && link.strokes.length >= 2) {
                        const leftStroke = link.strokes[0];
                        const rightStroke = link.strokes[link.strokes.length - 1];

                        if (leftStroke.points.length < 2 || rightStroke.points.length < 2) continue;

                        let pL, pR, pC;
                        if (endType === 'start') {
                            pL = leftStroke.points[0];
                            pR = rightStroke.points[0];
                        } else {
                            pL = leftStroke.points[leftStroke.points.length - 1];
                            pR = rightStroke.points[rightStroke.points.length - 1];
                        }

                        pC = { x: (pL.x + pR.x) / 2, y: (pL.y + pR.y) / 2 };

                        allCornerPoints.push(pL, pR);
                        centerlinePoints.push(pC);
                    } else {
                        if (!link.lanes || link.lanes.length === 0) continue;

                        let p_node, p_adj;
                        if (endType === 'start') {
                            p_node = link.waypoints[0];
                            p_adj = link.waypoints[1];
                        } else {
                            p_node = link.waypoints[link.waypoints.length - 1];
                            p_adj = link.waypoints[link.waypoints.length - 2];
                        }

                        centerlinePoints.push(p_node);
                        const vec = normalize(getVector(p_adj, p_node));
                        const normal = getNormal(vec);
                        const totalWidth = getLinkTotalWidth(link);

                        const p_l = add(p_node, scale(normal, totalWidth / 2));
                        const p_r = add(p_node, scale(normal, -totalWidth / 2));

                        allCornerPoints.push(p_l, p_r);
                    }
                }
            }

            if (allCornerPoints.length >= 3) {
                const center = centerlinePoints.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
                if (centerlinePoints.length > 0) {
                    center.x /= centerlinePoints.length;
                    center.y /= centerlinePoints.length;
                }

                allCornerPoints.sort((a, b) => {
                    const angleA = Math.atan2(a.y - center.y, a.x - center.x);
                    const angleB = Math.atan2(b.y - center.y, b.x - center.x);
                    return angleA - angleB;
                });

                dynamicPoints = allCornerPoints.flatMap(p => [p.x, p.y]);
            }
        }

        // ====================================================================
        // 2. 智慧縫合 (Smart Snapping)：讓自訂點與動態端點結合
        // ====================================================================
        if (node.customPolygonPoints && node.customPolygonPoints.length >= 6) {
            if (dynamicPoints.length > 0) {
                let usedIndices = new Set();

                // 將目前最新的 Link 端點，強制覆蓋到自訂多邊形中「距離它最近」的那個頂點上
                for (let i = 0; i < dynamicPoints.length; i += 2) {
                    const dynX = dynamicPoints[i];
                    const dynY = dynamicPoints[i + 1];

                    let minDist = Infinity;
                    let closestIdx = -1;

                    for (let j = 0; j < node.customPolygonPoints.length; j += 2) {
                        if (usedIndices.has(j)) continue; // 避免多個端點吸附到同一個自訂點
                        const cx = node.customPolygonPoints[j];
                        const cy = node.customPolygonPoints[j + 1];
                        const dist = Math.hypot(cx - dynX, cy - dynY);

                        if (dist < minDist) {
                            minDist = dist;
                            closestIdx = j;
                        }
                    }

                    // 強制吸附更新自訂頂點的座標，達成跟隨效果
                    if (closestIdx !== -1) {
                        node.customPolygonPoints[closestIdx] = dynX;
                        node.customPolygonPoints[closestIdx + 1] = dynY;
                        usedIndices.add(closestIdx);
                    }
                }
            }
            return node.customPolygonPoints;
        }

        // 3. 防呆回退：若無足夠點則給預設方塊
        if (dynamicPoints.length < 6) {
            if (node.x !== undefined) return [node.x - 5, node.y - 5, node.x + 5, node.y - 5, node.x + 5, node.y + 5, node.x - 5, node.y + 5];
            return [];
        }

        return dynamicPoints;
    }

    function drawNode(node, ctx, shape) {
        const isTerminal = typeof isSynchroTerminalNode === 'function' ? isSynchroTerminalNode(node) : false;
        const polygonPoints = isTerminal ? [] : getNodePolygonPoints(node);

        if (isTerminal || polygonPoints.length < 6) {
            // Terminal / Standalone Node: draw a clear Synchro-style Node circle
            const radius = isSynchroMode ? 9.5 : 8.5;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2, false);
            ctx.closePath();
            ctx.fillStrokeShape(shape);

            if (isSynchroMode) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius * 0.42, 0, Math.PI * 2, false);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();
                ctx.restore();
            }
            return;
        }

        // Draw the computed intersection polygon
        ctx.beginPath();
        ctx.moveTo(polygonPoints[0], polygonPoints[1]);
        for (let i = 2; i < polygonPoints.length; i += 2) {
            ctx.lineTo(polygonPoints[i], polygonPoints[i + 1]);
        }
        ctx.closePath();
        ctx.fillStrokeShape(shape);

        if (isSynchroMode) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, 5.5, 0, Math.PI * 2, false);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
            ctx.fill();
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
            ctx.restore();
        }
        // Reset transform to avoid affecting other drawings on the layer
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function getLinkTotalWidth(link) {
        if (!link || !link.lanes) return 0;
        return link.lanes.reduce((sum, lane) => sum + lane.width, 0);
    }
    // --- START: NEW MEASUREMENT FUNCTIONS ---

    function createMeasurement(points) {
        const id = window.generateId('measure');
        const measurement = {
            id,
            type: 'Measurement',
            waypoints: points,
            konvaGroup: new Konva.Group({ id, draggable: true }),
            konvaHandles: [],
        };

        network.measurements[id] = measurement;
        layer.add(measurement.konvaGroup);

        // 當整個群組被拖曳時，更新其內部的 waypoints
        measurement.konvaGroup.on('dragend', () => {
            const group = measurement.konvaGroup;
            measurement.waypoints = measurement.waypoints.map(wp => {
                return {
                    x: wp.x + group.x(),
                    y: wp.y + group.y(),
                };
            });
            // 重設群組位置，並根據新的 waypoint 絕對位置重繪
            group.position({ x: 0, y: 0 });
            drawMeasurement(measurement);
            if (selectedObject && selectedObject.id === id) {
                drawMeasurementHandles(measurement);
            }
        });

        drawMeasurement(measurement);
        return measurement;
    }

    function drawMeasurement(measurement) {
        if (!measurement) return;
        const group = measurement.konvaGroup;
        group.destroyChildren(); // 清除舊的線條和文字

        const scale = 1 / stage.scaleX();
        const waypoints = measurement.waypoints;

        if (waypoints.length < 2) return;

        // 繪製紅線
        const line = new Konva.Line({
            points: waypoints.flatMap(p => [p.x, p.y]),
            stroke: '#dc3545',
            strokeWidth: 2 / scale, // 保持固定寬度
            hitStrokeWidth: 20 / scale, // 增加點擊區域
            listening: true, // 確保線條可以被點擊選取
            name: 'measurement-line'
        });
        group.add(line);

        // 計算總長度並繪製文字
        const totalLength = getPolylineLength(waypoints);
        const centerData = getPointAlongPolyline(waypoints, totalLength / 2);

        const text = new Konva.Text({
            ...centerData.point, // 將文字放在線條中點
            text: `${totalLength.toFixed(1)} m`,
            fontSize: 14,
            fill: 'red',
            stroke: 'red',
            strokeWidth: 0.5,
            align: 'center',
            listening: false,
            scaleX: scale, // 保持固定大小
            scaleY: scale,
        });
        text.offsetX(text.width() / 2 * scale);
        text.offsetY((text.height() / 2 + 5) * scale); // 稍微向上偏移
        group.add(text);

        group.moveToTop();
    }

    function destroyMeasurementHandles(measurement) {
        if (measurement && measurement.konvaHandles) {
            measurement.konvaHandles.forEach(handle => handle.destroy());
            measurement.konvaHandles = [];
        }
    }

    function drawMeasurementHandles(measurement) {
        destroyMeasurementHandles(measurement);
        const scale = 1 / stage.scaleX();

        measurement.waypoints.forEach((waypoint, index) => {
            const handle = new Konva.Circle({
                x: waypoint.x,
                y: waypoint.y,
                radius: 5,
                fill: '#dc3545',
                stroke: 'white',
                strokeWidth: 2,
                draggable: true,
                name: 'measurement-handle',
                scaleX: scale,
                scaleY: scale,
            });

            handle.on('dragmove', () => {
                measurement.waypoints[index] = { x: handle.x(), y: handle.y() };
                // 因為 handle 是獨立於 group 拖曳的，所以直接更新 group 內的物件
                drawMeasurement(measurement);
            });

            // 將 handle 加到 main layer 而不是 group，這樣它們的位置才是絕對的
            layer.add(handle);
            measurement.konvaHandles.push(handle);
            handle.moveToTop();
        });
    }

    function deleteMeasurement(id) {
        const measurement = network.measurements[id];
        if (!measurement) return;

        destroyMeasurementHandles(measurement);
        measurement.konvaGroup.destroy();
        delete network.measurements[id];
    }

    // --- END: NEW MEASUREMENT FUNCTIONS ---	


    function setTool(toolName) {
        if (toolName !== 'subnetwork' && window.SubNetworkTool) {
            SubNetworkTool.reset();
            if (SubNetworkTool.selectionGroup) SubNetworkTool.selectionGroup.destroy();
        }

        activeTool = toolName;
        Object.values(network.nodes || {}).forEach(n => {
            if (n && n.konvaShape) n.konvaShape.draggable(toolName === 'select');
        });
        if (typeof cleanupSynchroDraft === 'function' && toolName !== 'add-link') {
            cleanupSynchroDraft(true);
        }
        if (typeof updateSynchroCanvasHint === 'function') {
            updateSynchroCanvasHint();
        }
        if (toolName !== 'add-zone' && window.redrawingZone) {
            window.redrawingZone = null;
        }
        deselectAll();

        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        // 1. 重置互動狀態
        Object.values(network.links).forEach(l => l.konvaGroup.listening(false));
        Object.values(network.connections).forEach(c => c.konvaBezier.listening(false));
        Object.values(network.nodes).forEach(n => n.konvaShape.listening(false));
        Object.values(network.detectors).forEach(d => d.konvaGroup.listening(false));
        Object.values(network.roadSigns).forEach(s => s.konvaShape.listening(false));
        Object.values(network.origins).forEach(o => o.konvaShape.listening(false));
        Object.values(network.destinations).forEach(d => d.konvaShape.listening(false));
        Object.values(network.measurements).forEach(m => m.konvaGroup.listening(false));
        Object.values(network.overpasses).forEach(o => o.konvaRect.listening(false));
        Object.values(network.parkingLots).forEach(p => p.konvaGroup.listening(false));
        Object.values(network.parkingGates).forEach(g => g.konvaGroup.listening(false));
        if (network.roadMarkings) {
            Object.values(network.roadMarkings).forEach(r => r.konvaGroup.listening(false));
        }
        if (network.zones) {
            Object.values(network.zones).forEach(z => z.konvaGroup.listening(false));
        }

        // --- [修正重點]：將所有背景預設設為不攔截事件 ---
        if (network.backgrounds) {
            Object.values(network.backgrounds).forEach(bg => {
                if (bg.konvaGroup) bg.konvaGroup.listening(false);
                if (bg.konvaHitArea) bg.konvaHitArea.listening(false);
            });
        }

        // 2. 清理 (確保同時清除單車道紅藍點，以及群組的深紅點)
        layer.find('.lane-port, .group-connect-port').forEach(port => port.destroy());
        if (tempShape) { tempShape.destroy(); tempShape = null; }
        if (tempMeasureText) { tempMeasureText.destroy(); tempMeasureText = null; }

        clearTrafficLightIcons();
        clearNodeSettingsIcons();

        // 3. 根據工具啟用互動
        switch (toolName) {
            case 'select':
                showNodeSettingsIcons();

                Object.values(network.links).forEach(l => l.konvaGroup.listening(true));
                Object.values(network.connections).forEach(c => c.konvaBezier.listening(true));
                Object.values(network.nodes).forEach(n => n.konvaShape.listening(true));
                Object.values(network.detectors).forEach(d => d.konvaGroup.listening(true));
                Object.values(network.roadSigns).forEach(s => s.konvaShape.listening(true));
                Object.values(network.origins).forEach(o => o.konvaShape.listening(true));
                Object.values(network.destinations).forEach(d => d.konvaShape.listening(true));
                Object.values(network.measurements).forEach(m => m.konvaGroup.listening(true));
                Object.values(network.overpasses).forEach(o => o.konvaRect.listening(true));
                Object.values(network.parkingLots).forEach(p => p.konvaGroup.listening(true));
                Object.values(network.parkingGates).forEach(g => g.konvaGroup.listening(true));
                if (network.roadMarkings) {
                    Object.values(network.roadMarkings).forEach(r => r.konvaGroup.listening(true));
                }
                if (network.zones) {
                    Object.values(network.zones).forEach(z => z.konvaGroup.listening(true));
                }
                Object.values(network.pushpins).forEach(p => p.konvaGroup.listening(true));

                // --- [修正重點]：只有「未鎖定」的背景才開啟事件攔截，允許被點擊選取 ---
                if (network.backgrounds) {
                    Object.values(network.backgrounds).forEach(bg => {
                        if (bg.konvaGroup && !bg.locked) {
                            bg.konvaGroup.listening(true);
                            if (bg.konvaHitArea) bg.konvaHitArea.listening(true);
                        }
                    });
                }
                stage.container().style.cursor = 'default';
                break;

            case 'edit-tfl':
                showTrafficLightIcons();
                Object.values(network.nodes).forEach(node => node.konvaShape.listening(true));
                stage.container().style.cursor = 'default';
                break;

            case 'connect-lanes':
                stage.container().style.cursor = 'default';
                showLanePorts();
                layer.find('.lane-port').forEach(port => port.moveToTop());
                break;

            case 'add-background':
            case 'add-parking-lot':
            case 'add-intersection':
            case 'add-link':
            case 'measure':
            case 'add-pushpin':
            case 'add-zone':
                stage.container().style.cursor = 'crosshair';
                break;

            case 'add-parking-gate':
                stage.container().style.cursor = 'crosshair';
                Object.values(network.parkingGates).forEach(g => g.konvaGroup.listening(true));
                break;

            case 'append-lane-stroke': // <--- 新增這個 case
                stage.container().style.cursor = 'crosshair';
                break;

            case 'add-flow':
            case 'add-road-sign':
            case 'add-point-detector':
            case 'add-section-detector':
                Object.values(network.links).forEach(l => l.konvaGroup.listening(true));
                stage.container().style.cursor = 'pointer';
                break;

            case 'add-marking':
                Object.values(network.links).forEach(l => l.konvaGroup.listening(true));
                Object.values(network.nodes).forEach(n => n.konvaShape.listening(true));
                stage.container().style.cursor = markingMode === 'channelization' ? 'crosshair' : 'pointer';
                break;

            case 'subnetwork':
                if (window.SubNetworkTool) SubNetworkTool.isActive = true;
                stage.container().style.cursor = 'crosshair';
                break;

            default:
                stage.container().style.cursor = 'default';
                break;
        }

        updateStatusBar();
    }

    // --- 顯示交通號誌編輯圖示 (純向量三色號誌燈箱 + 縮放 LOD) ---
    function showTrafficLightIcons() {
        clearTrafficLightIcons();
        const currentScale = stage.scaleX();
        const scale = 1 / currentScale;
        const isVisible = currentScale >= 0.55; // 縮小低於 55% 時自動隱藏

        Object.values(network.nodes).forEach(node => {
            const group = new Konva.Group({
                x: node.x,
                y: node.y,
                name: 'tfl-icon-wrapper',
                listening: true,
                scaleX: scale,
                scaleY: scale,
                visible: isVisible
            });

            // 1. 圓形白底徽章
            const bg = new Konva.Circle({
                radius: 13,
                fill: '#ffffff',
                stroke: '#334155',
                strokeWidth: 1.5,
                shadowColor: 'rgba(15, 23, 42, 0.25)',
                shadowBlur: 4,
                shadowOffsetY: 1
            });

            // 2. 向量號誌燈箱外殼
            const housing = new Konva.Rect({
                x: -4.5,
                y: -8.5,
                width: 9,
                height: 17,
                cornerRadius: 2.5,
                fill: '#1e293b',
                listening: false
            });

            // 3. 紅、黃、綠三顆向量燈號
            const redDot = new Konva.Circle({ x: 0, y: -5, radius: 1.9, fill: '#ef4444', listening: false });
            const yellowDot = new Konva.Circle({ x: 0, y: 0, radius: 1.9, fill: '#f59e0b', listening: false });
            const greenDot = new Konva.Circle({ x: 0, y: 5, radius: 1.9, fill: '#22c55e', listening: false });

            group.add(bg, housing, redDot, yellowDot, greenDot);

            group.on('mouseenter', () => {
                stage.container().style.cursor = 'pointer';
                bg.fill('#eff6ff');
                bg.stroke('#2563eb');
                bg.strokeWidth(2);
                layer.batchDraw();
            });

            group.on('mouseleave', () => {
                stage.container().style.cursor = 'default';
                bg.fill('#ffffff');
                bg.stroke('#334155');
                bg.strokeWidth(1.5);
                layer.batchDraw();
            });

            group.on('click tap', (e) => {
                e.cancelBubble = true;
                showTrafficLightEditor(node);
                setTool('select');
            });

            layer.add(group);
            trafficLightIcons.push(group);
        });

        layer.batchDraw();
    }

    // --- 新增：清除交通號誌編輯圖示 ---
    function clearTrafficLightIcons() {
        trafficLightIcons.forEach(icon => icon.destroy());
        trafficLightIcons = [];
        layer.batchDraw();
    }

    // --- 顯示路口(Node)設定圖示 (純向量幾何齒輪徽章 + 縮放 LOD) ---
    function showNodeSettingsIcons() {
        clearNodeSettingsIcons();
        const currentScale = stage.scaleX();
        const scale = 1 / currentScale;
        const isVisible = currentScale >= 0.55; // 縮小低於 55% 時自動隱藏

        Object.values(network.nodes).forEach(node => {
            const group = new Konva.Group({
                x: node.x,
                y: node.y,
                name: 'node-setting-icon-wrapper',
                listening: true,
                scaleX: scale,
                scaleY: scale,
                visible: isVisible,
                opacity: 0.85
            });

            // 1. 圓形淺藍底徽章
            const bg = new Konva.Circle({
                radius: 10.5,
                fill: '#f8fafc',
                stroke: '#3b82f6',
                strokeWidth: 1.5,
                shadowColor: 'rgba(15, 23, 42, 0.2)',
                shadowBlur: 3,
                shadowOffsetY: 1
            });

            // 2. 純向量齒輪 (跨平台零跑位)
            const gear = new Konva.Shape({
                listening: false,
                sceneFunc: (ctx, shape) => {
                    const teeth = 6;
                    const outerR = 6.2;
                    const innerR = 4.6;
                    ctx.beginPath();
                    for (let i = 0; i < teeth * 2; i++) {
                        const r = (i % 2 === 0) ? outerR : innerR;
                        const angle = (i * Math.PI) / teeth;
                        const gx = Math.cos(angle) * r;
                        const gy = Math.sin(angle) * r;
                        if (i === 0) ctx.moveTo(gx, gy);
                        else ctx.lineTo(gx, gy);
                    }
                    ctx.closePath();
                    ctx.fillStyle = '#2563eb';
                    ctx.fill();

                    // 中心孔
                    ctx.beginPath();
                    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
                    ctx.fillStyle = '#f8fafc';
                    ctx.fill();
                }
            });

            group.add(bg, gear);

            group.on('mouseenter', () => {
                stage.container().style.cursor = 'pointer';
                group.opacity(1);
                bg.fill('#dbeafe');
                bg.strokeWidth(2);
                layer.batchDraw();
            });

            group.on('mouseleave', () => {
                stage.container().style.cursor = 'default';
                group.opacity(0.85);
                bg.fill('#f8fafc');
                bg.strokeWidth(1.5);
                layer.batchDraw();
            });

            group.on('click tap', (e) => {
                e.cancelBubble = true;
                selectObject(node);
            });

            layer.add(group);
            nodeSettingsIcons.push(group);
        });

        layer.batchDraw();
    }

    // --- 新增：清除路口設定圖示 ---
    function clearNodeSettingsIcons() {
        nodeSettingsIcons.forEach(icon => icon.destroy());
        nodeSettingsIcons = [];
        layer.batchDraw();
    }


    function showLanePorts() {
        // 清除所有舊的連接埠
        layer.find('.lane-port, .group-connect-port').forEach(port => port.destroy());
        const portScale = 1 / stage.scaleX();

        for (const linkId in network.links) {
            const link = network.links[linkId];
            if (!link.waypoints || link.waypoints.length < 2) continue;

            // ==========================================
            // Lane-based 路段的動態拓撲 Port
            // ==========================================
            if ((link.geometryType === 'lane-based' || link.geometryType === 'parametric') && link.strokes && link.strokes.length > 1) {
                const ports = getLaneBasedPorts(link);

                ports.startPorts.forEach(sp => {
                    const startPort = new Konva.Circle({
                        x: sp.point.x, y: sp.point.y, radius: PORT_RADIUS, fill: 'blue',
                        draggable: true, name: 'lane-port', hitStrokeWidth: 15,
                        scaleX: portScale, scaleY: portScale,
                    });
                    startPort.setAttr('meta', { linkId: link.id, laneIndex: sp.laneIndex, portType: 'start' });
                    layer.add(startPort);
                });

                ports.endPorts.forEach(ep => {
                    const endPort = new Konva.Circle({
                        x: ep.point.x, y: ep.point.y, radius: PORT_RADIUS, fill: 'red',
                        draggable: true, name: 'lane-port', hitStrokeWidth: 15,
                        scaleX: portScale, scaleY: portScale,
                    });
                    endPort.setAttr('meta', { linkId: link.id, laneIndex: ep.laneIndex, portType: 'end' });
                    layer.add(endPort);
                });
            }
            // ==========================================
            // 原本 Standard 路段的固定 Port 邏輯
            // ==========================================
            else {
                if (!link.lanes || link.lanes.length === 0) continue;
                for (let i = 0; i < link.lanes.length; i++) {
                    const lanePath = getLanePath(link, i);
                    if (!lanePath || lanePath.length < 2) continue;

                    const startPos = lanePath[0];
                    const endPos = lanePath[lanePath.length - 1];

                    const startPort = new Konva.Circle({
                        x: startPos.x, y: startPos.y, radius: PORT_RADIUS, fill: 'blue',
                        draggable: true, name: 'lane-port', hitStrokeWidth: 15,
                        scaleX: portScale, scaleY: portScale,
                    });
                    startPort.setAttr('meta', { linkId: link.id, laneIndex: i, portType: 'start' });
                    layer.add(startPort);

                    const endPort = new Konva.Circle({
                        x: endPos.x, y: endPos.y, radius: PORT_RADIUS, fill: 'red',
                        draggable: true, name: 'lane-port', hitStrokeWidth: 15,
                        scaleX: portScale, scaleY: portScale,
                    });
                    endPort.setAttr('meta', { linkId: link.id, laneIndex: i, portType: 'end' });
                    layer.add(endPort);
                }
            }

            // --- 繪製「群組連接」箭頭 (保留無框純文字) ---
            if (ENABLE_GROUP_CONNECT) {
                const linkLength = getPolylineLength(link.waypoints);
                const upstreamDist = Math.max(0, linkLength - 15);
                const { point: upstreamPoint, vec: upstreamVec } = getPointAlongPolyline(link.waypoints, upstreamDist);

                const groupPort = new Konva.Text({
                    x: upstreamPoint.x, y: upstreamPoint.y, text: '●', fontSize: 20, fill: '#8B0000',
                    align: 'center', verticalAlign: 'middle', hitStrokeWidth: 15,
                    rotation: Konva.Util.radToDeg(Math.atan2(upstreamVec.y, upstreamVec.x)) - 90,
                    name: 'group-connect-port', draggable: true, scaleX: portScale, scaleY: portScale
                });
                groupPort.offsetX(groupPort.width() / 2);
                groupPort.offsetY(groupPort.height() / 2);
                groupPort.setAttr('meta', { linkId: link.id, portType: 'group-end' });
                layer.add(groupPort);
            }
        }
        layer.batchDraw();
    }
    // --- END OF CORRECTED showLanePorts FUNCTION ---

    function updateStatusBar() {
        let text = `Tool: ${activeTool}`;
        switch (activeTool) {
            case 'add-link': text += " - Click to start, click to add points, right-click to finish."; break;
            case 'append-lane-stroke': text += " - 手繪新車道線：點擊畫布開始繪製，右鍵結束。"; break; // <--- 新增這行
            case 'measure': text += " - Click to start, click to add points, right-click to finish measurement."; break;
            case 'add-background': text += " - Click on an empty area to add a background image placeholder."; break; // <-- NEW LINE
            case 'connect-lanes': text += " - Drag from a red port (lane end) to a blue port (lane start)."; break;
            case 'edit-tfl': text += " - Click on an intersection (node) to edit its traffic light schedule."; break;
            case 'add-flow': text += " - 點擊 Link 前半段新增起點 (紅色)，點擊後半段新增迄點 (綠色)。"; break;
            case 'add-road-sign': text += " - Click on a Link to place a new speed sign."; break;
            case 'select': text += " - Click to select. Drag a link's handles to edit path. Alt+Click on a link to add a handle. Press DEL to delete."; break;
            case 'add-pushpin': text += " - Click on the canvas to place a coordinate reference pin (Max 2)."; break;
            case 'add-parking-lot': text += " - Click to add polygon points. Double-click to finish."; break; // <--- Fix: status bar text
            case 'add-zone':
                text += " - " + (window.redrawingZone ? I18N.t("Click to add zone polygon points. Double-click to finish, Esc to cancel.") : I18N.t("Click to add zone polygon points. Double-click to finish."));
                break;
            case 'add-intersection': text += " - Click to draw polygon points around the intersection area. Double-click to finish."; break;
            case 'add-parking-gate': text += " - Drag to create a rectangle representing an Entrance or Exit on a Parking Lot boundary."; break;
            case 'subnetwork': text += " - Click points to enclose area. Double-click to finish. Drag blue box to move."; break;
        }
        statusBar.textContent = I18N.t(text);
    }

    // --- START OF MODIFICATION: NEW HELPER FUNCTION ---
    function updateMeasurementVisuals() {
        if (!tempShape || !tempMeasureText) return;

        const rawPoints = tempShape.points();
        // Convert flat array [x1, y1, x2, y2] to array of points [{x,y}, {x,y}]
        const points = [];
        for (let i = 0; i < rawPoints.length; i += 2) {
            points.push({ x: rawPoints[i], y: rawPoints[i + 1] });
        }

        if (points.length < 2) return;

        const totalLength = getPolylineLength(points);
        tempMeasureText.text(`${totalLength.toFixed(1)} m`);

        const centerData = getPointAlongPolyline(points, totalLength / 2);
        tempMeasureText.position(centerData.point);
        // Position text slightly above the line
        tempMeasureText.offsetX(tempMeasureText.width() / 2);
        tempMeasureText.offsetY(tempMeasureText.height() + 5);

        layer.batchDraw();
    }
    // --- END OF MODIFICATION ---

    // --- EVENT HANDLERS ---

    // --- START OF CORRECTED `init` FUNCTION ---

    // --- START OF CORRECTED `init` FUNCTION ---

    function init() {
        stage = new Konva.Stage({
            container: 'canvas-container',
            width: canvasContainer.clientWidth,
            height: canvasContainer.clientHeight,
        });
        gridLayer = new Konva.Layer(); stage.add(gridLayer);
        layer = new Konva.Layer(); stage.add(layer);

        // Add a dedicated group for measurement visuals so they can be easily cleared
        measureGroup = new Konva.Group();
        layer.add(measureGroup);

        drawGrid();

        stage.on('wheel', (e) => {
            e.evt.preventDefault();
            const oldScale = stage.scaleX();
            const pointer = stage.getPointerPosition();
            const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale, };
            const scaleBy = 1.1;
            const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
            stage.scale({ x: newScale, y: newScale });
            const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale, };
            stage.position(newPos);

            const newPortScale = 1 / newScale;

            // 當畫布縮小低於 55% 時自動隱藏路口小圖示，放大時自動恢復
            const showNodeBadges = newScale >= 0.55;
            layer.find('.tfl-icon-wrapper, .node-setting-icon-wrapper').forEach(badge => {
                badge.visible(showNodeBadges);
            });

            // 【修改】加入 .bg-setting-icon-wrapper 讓背景圖示也具有無比例尺特性
            layer.find('.lane-port, .group-connect-port, .control-point, .waypoint-handle, .measurement-handle, .tfl-icon-wrapper, .node-setting-icon-wrapper, .node-vertex-handle, .bg-setting-icon-wrapper, .zone-vertex-handle, .zone-midpoint-handle').forEach(p => {
                p.scale({ x: newPortScale, y: newPortScale });
            });

            layer.find('.lane-indicator').forEach(indicator => {
                indicator.scale({ x: newPortScale, y: newPortScale });
            });

            // Redraw all persistent measurements to adjust their line width and text scale
            Object.values(network.measurements).forEach(m => drawMeasurement(m));

            drawGrid();
        });

        stage.on('mousedown', (e) => {
            // 1. 滑鼠中鍵 (滾輪按下去) -> 強制拖曳畫布
            if (e.evt.button === 1) {
                isPanning = true;
                lastPointerPosition = stage.getPointerPosition();
                stage.container().style.cursor = 'grabbing';
                e.evt.preventDefault();
                return;
            }

            // --- [修正重點] 2. 滑鼠左鍵點擊在空白處 (Stage) 或鎖定的背景圖上 ---
            let isBgLocked = false;
            if (e.target !== stage && isDrawableCanvas(e.target)) {
                const group = e.target.findAncestor('Group');
                if (group && group.name() === 'background-group') {
                    const bg = network.backgrounds[group.id()];
                    if (bg && bg.locked) isBgLocked = true;
                }
            }

            if (e.evt.button === 0 && (e.target === stage || isBgLocked)) {
                // 排除清單：如果不是這些工具，則視為拖曳畫布
                if (activeTool !== 'add-link' &&
                    activeTool !== 'append-lane-stroke' && // <--- 新增這行
                    activeTool !== 'measure' &&
                    !(activeTool === 'connect-lanes' && (connectMode === 'box' || connectMode === 'merge')) &&
                    activeTool !== 'add-background' &&
                    activeTool !== 'add-pushpin' &&
                    activeTool !== 'add-parking-lot' &&
                    activeTool !== 'add-parking-gate' &&
                    activeTool !== 'add-zone' &&
                    activeTool !== 'add-intersection' &&
                    !(activeTool === 'add-marking' && markingMode === 'channelization') &&
                    activeTool !== 'subnetwork') {

                    isPanning = true;
                    lastPointerPosition = stage.getPointerPosition();
                    stage.container().style.cursor = 'grabbing';
                    e.evt.preventDefault();
                    return;
                }
            }

            const pointer = stage.getPointerPosition();
            if (!pointer) return; // 防呆

            const worldPos = {
                x: (pointer.x - stage.x()) / stage.scaleX(),
                y: (pointer.y - stage.y()) / stage.scaleY(),
            };

            // --- ⚡ Synchro Mode: 免按右鍵、直接左鍵點兩點(或拖曳)建立兩端 Node 與雙向 Link ---
            if (isSynchroMode && activeTool === 'add-link' && e.evt.button === 0 && typeof handleSynchroMouseDown === 'function') {
                handleSynchroMouseDown(worldPos, e);
                return;
            }

            // --- SubNetwork Tool 邏輯 ---
            if (activeTool === 'subnetwork') {
                if (window.SubNetworkTool && window.SubNetworkTool.mode === 'selected' && !isDrawableCanvas(e.target)) {
                    return;
                }

                if (window.SubNetworkTool) {
                    window.SubNetworkTool.handleMouseDown(worldPos);
                }
                return;
            }

            // --- Connect Box / Merge Box Mode ---
            if (activeTool === 'connect-lanes' && (connectMode === 'box' || connectMode === 'merge')) {
                if (!isDrawableCanvas(e.target)) return; // <--- [修正] 允許在背景上框選連接

                const strokeColor = connectMode === 'merge' ? '#e11d48' : '#00D2FF';
                const fillColor = connectMode === 'merge' ? 'rgba(225, 29, 72, 0.2)' : 'rgba(0, 210, 255, 0.2)';

                tempShape = new Konva.Rect({
                    x: worldPos.x,
                    y: worldPos.y,
                    width: 0,
                    height: 0,
                    stroke: strokeColor,
                    strokeWidth: 1 / stage.scaleX(),
                    fill: fillColor,
                    listening: false,
                    name: 'selection-box'
                });
                layer.add(tempShape);
                tempShape.setAttr('startPos', worldPos);
                return;
            }

            // --- Parking Gate ---
            if (activeTool === 'add-parking-gate') {
                if (!isDrawableCanvas(e.target)) return; // <--- [修正]
                isPanning = false;

                tempShape = new Konva.Rect({
                    x: worldPos.x,
                    y: worldPos.y,
                    width: 0,
                    height: 0,
                    stroke: 'orange',
                    strokeWidth: 2,
                    listening: false
                });
                layer.add(tempShape);
                tempShape.setAttr('startPos', worldPos);
                return;
            }

            // 處理一般點擊 (Add Link, Select 等)
            handleStageClick(e);
        });

        stage.on('mousemove', (e) => {
            // 1. 拖曳畫布 (Panning)
            if (isPanning) {
                const newPointerPosition = stage.getPointerPosition();
                const dx = newPointerPosition.x - lastPointerPosition.x;
                const dy = newPointerPosition.y - lastPointerPosition.y;
                stage.move({ x: dx, y: dy });
                lastPointerPosition = newPointerPosition;
                drawGrid();
                e.evt.preventDefault();
                return;
            }

            // -----------------------------------------------------------
            // 取得精確的世界座標
            // -----------------------------------------------------------
            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const worldPos = {
                x: (pointer.x - stage.x()) / stage.scaleX(),
                y: (pointer.y - stage.y()) / stage.scaleY(),
            };

            // --- ⚡ Synchro Mode: 磁吸圓圈 (Node / Road) 與即時雙向道路預覽 ---
            if (isSynchroMode && activeTool === 'add-link' && typeof handleSynchroMouseMove === 'function') {
                handleSynchroMouseMove(worldPos, e);
                return;
            }

            // --- [新增] 一般 Link 工具與手繪標線模式：顯示游標處左右鍵提示 ---
            if (!isSynchroMode && (activeTool === 'add-link' || activeTool === 'append-lane-stroke')) {
                updateSynchroSnapIndicator(worldPos);
                layer.batchDraw();
            }

            // --- SubNetwork Tool 預覽線條 ---
            if (activeTool === 'subnetwork') {
                if (window.SubNetworkTool) {
                    window.SubNetworkTool.handleMouseMove(worldPos);
                }
                // 不要 return，以免阻擋其他 hover 效果
            }
            // -------------------------------

            // --- [修正重點] Connect Box / Merge Box Mode 拖曳範圍更新 ---
            if (activeTool === 'connect-lanes' && (connectMode === 'box' || connectMode === 'merge') && tempShape) {
                const startPos = tempShape.getAttr('startPos');

                // 計算矩形的新位置與大小 (支援向左/向上拖曳)
                tempShape.x(Math.min(worldPos.x, startPos.x));
                tempShape.y(Math.min(worldPos.y, startPos.y));
                tempShape.width(Math.abs(worldPos.x - startPos.x));
                tempShape.height(Math.abs(worldPos.y - startPos.y));

                layer.batchDraw();
                return;
            }
            // ---------------------------------------------------------

            // --- Parking Gate 拖曳範圍 ---
            if (activeTool === 'add-parking-gate' && tempShape) {
                const startPos = tempShape.getAttr('startPos');
                tempShape.width(worldPos.x - startPos.x);
                tempShape.height(worldPos.y - startPos.y);
                layer.batchDraw();
            }

            // --- Add Link / Measure / Intersection 等工具的動態線條 ---
            if ((activeTool === 'add-link' || activeTool === 'append-lane-stroke') && tempShape) {
                // 【修正】確保 append-lane-stroke 模式下，滑鼠跟隨的線段也會套用正確的樣式
                if (linkCreationSettings.mode === 'lane-based' || activeTool === 'append-lane-stroke') {
                    const style = STROKE_TYPES[draftCurrentStrokeType] || STROKE_TYPES['white_dashed'];
                    // 根據字典動態套用顏色與虛線
                    tempShape.stroke(style.color);
                    tempShape.dash(style.dash || []);
                    tempShape.strokeWidth((style.width || 2) / stage.scaleX()); // 維持螢幕比例
                }

                const points = tempShape.points();
                points[points.length - 2] = worldPos.x;
                points[points.length - 1] = worldPos.y;
                tempShape.points(points);
                layer.batchDraw();
            } else if ((activeTool === 'measure' || activeTool === 'add-parking-lot' || activeTool === 'add-zone' || activeTool === 'add-intersection' || (activeTool === 'add-marking' && markingMode === 'channelization')) && tempShape) {
                const points = tempShape.points();
                // 更新最後一個點為當前滑鼠位置
                points[points.length - 2] = worldPos.x;
                points[points.length - 1] = worldPos.y;
                tempShape.points(points);

                if (activeTool === 'measure') {
                    updateMeasurementVisuals();
                }
                layer.batchDraw();
            }
        });

        stage.on('mouseup', (e) => {
            if (isSynchroMode && activeTool === 'add-link' && e.evt.button === 0 && typeof handleSynchroMouseUp === 'function') {
                const pointer = stage.getPointerPosition();
                if (pointer) {
                    const worldPos = {
                        x: (pointer.x - stage.x()) / stage.scaleX(),
                        y: (pointer.y - stage.y()) / stage.scaleY(),
                    };
                    handleSynchroMouseUp(worldPos, e);
                }
            }

            // --- [修改] 支援 Connect Box 和 Merge Box 的結束框選邏輯 ---
            if (activeTool === 'connect-lanes' && (connectMode === 'box' || connectMode === 'merge') && tempShape) {
                const width = tempShape.width();
                const height = tempShape.height();

                // 忽略太小的誤觸
                if (Math.abs(width) > 2 && Math.abs(height) > 2) {
                    // 標準化 x, y, w, h (處理往上或往左拖曳的負值寬高)
                    const finalX = width > 0 ? tempShape.x() : tempShape.x() + width;
                    const finalY = height > 0 ? tempShape.y() : tempShape.y() + height;
                    const finalW = Math.abs(width);
                    const finalH = Math.abs(height);

                    const rect = { x: finalX, y: finalY, width: finalW, height: finalH };

                    // 執行對應的演算
                    if (connectMode === 'box') {
                        autoConnectLanesInSelection(rect);
                    } else if (connectMode === 'merge') {
                        autoMergeLinksInSelection(rect);
                    }
                }

                // 清除暫存選取框
                tempShape.destroy();
                tempShape = null;
                layer.batchDraw();
                return;
            }
            // --- [修改結束] ---

            if (activeTool === 'add-parking-gate' && tempShape) {
                const width = tempShape.width();
                const height = tempShape.height();

                // 忽略太小的誤觸
                if (Math.abs(width) > 2 && Math.abs(height) > 2) {
                    // 標準化 x, y, w, h (處理負值寬高)
                    const finalX = width > 0 ? tempShape.x() : tempShape.x() + width;
                    const finalY = height > 0 ? tempShape.y() : tempShape.y() + height;
                    const finalW = Math.abs(width);
                    const finalH = Math.abs(height);

                    const newGate = createParkingGate({ x: finalX, y: finalY, width: finalW, height: finalH });
                    selectObject(newGate);
                }

                tempShape.destroy();
                tempShape = null;
                layer.batchDraw();
            }

            if (isPanning) {
                isPanning = false;
                setTool(activeTool);
                e.evt.preventDefault();
            }
        });

        stage.on('mousemove', (e) => {
            if (isPanning) {
                const newPointerPosition = stage.getPointerPosition();
                const dx = newPointerPosition.x - lastPointerPosition.x;
                const dy = newPointerPosition.y - lastPointerPosition.y;
                stage.move({ x: dx, y: dy });
                lastPointerPosition = newPointerPosition;
                drawGrid();
                e.evt.preventDefault();
            }

            // --- [新增] Connect Box Mode 的拖曳繪製邏輯 ---
            if (activeTool === 'connect-lanes' && connectMode === 'box' && tempShape) {
                const pos = {
                    x: (e.evt.layerX - stage.x()) / stage.scaleX(),
                    y: (e.evt.layerY - stage.y()) / stage.scaleY(),
                };
                const startPos = tempShape.getAttr('startPos');

                // 支援向左/向上選取 (負寬高)
                tempShape.x(Math.min(pos.x, startPos.x));
                tempShape.y(Math.min(pos.y, startPos.y));
                tempShape.width(Math.abs(pos.x - startPos.x));
                tempShape.height(Math.abs(pos.y - startPos.y));

                layer.batchDraw();
                return;
            }
            // --- [新增結束] ---

            if (activeTool === 'add-parking-gate' && tempShape) {
                const pos = {
                    x: (e.evt.layerX - stage.x()) / stage.scaleX(),
                    y: (e.evt.layerY - stage.y()) / stage.scaleY(),
                };
                const startPos = tempShape.getAttr('startPos');
                tempShape.width(pos.x - startPos.x);
                tempShape.height(pos.y - startPos.y);
                layer.batchDraw();
            }
            if ((activeTool === 'add-link' || activeTool === 'append-lane-stroke') && tempShape) {
                const pos = stage.getPointerPosition();
                const localPos = { x: (pos.x - stage.x()) / stage.scaleX(), y: (pos.y - stage.y()) / stage.scaleY(), };

                if (linkCreationSettings.mode === 'lane-based') {
                    const style = STROKE_TYPES[draftCurrentStrokeType];
                    // 根據字典動態套用顏色與虛線
                    tempShape.stroke(style.color);
                    tempShape.dash(style.dash);
                    tempShape.strokeWidth(style.width / stage.scaleX()); // 維持螢幕比例
                }

                const points = tempShape.points();
                points[points.length - 2] = localPos.x;
                points[points.length - 1] = localPos.y;
                tempShape.points(points);
                layer.batchDraw();
            } else if ((activeTool === 'measure' || activeTool === 'add-parking-lot' || activeTool === 'add-zone' || activeTool === 'add-intersection' || (activeTool === 'add-marking' && markingMode === 'channelization')) && tempShape) {
                const pos = stage.getPointerPosition();
                const points = tempShape.points();
                const localPos = { x: (pos.x - stage.x()) / stage.scaleX(), y: (pos.y - stage.y()) / stage.scaleY(), };
                points[points.length - 2] = localPos.x;
                points[points.length - 1] = localPos.y;
                tempShape.points(points);

                if (activeTool === 'measure') {
                    updateMeasurementVisuals();
                }
                layer.batchDraw(); // <--- Ensure we see the movement
            }


            // --- 新增：SubNetworkTool 邏輯 ---
            if (activeTool === 'subnetwork') {
                const pos = {
                    x: (e.evt.layerX - stage.x()) / stage.scaleX(),
                    y: (e.evt.layerY - stage.y()) / stage.scaleY(),
                };
                SubNetworkTool.handleMouseMove(pos);
                // 注意：不要 return，讓 Pan 邏輯也能運作 (如果有的話)
            }
            // -------------------------------

        });

        stage.on('dblclick', (e) => {
            if (activeTool === 'add-intersection' && tempShape) {
                // 1. 取得多邊形頂點
                const rawPoints = tempShape.points();
                // 移除最後一個跟隨滑鼠的重複點
                if (rawPoints.length >= 4) { rawPoints.pop(); rawPoints.pop(); }

                // 轉換為點物件陣列 [{x,y}, ...]
                const polyPoints = [];
                for (let i = 0; i < rawPoints.length; i += 2) {
                    polyPoints.push({ x: rawPoints[i], y: rawPoints[i + 1] });
                }

                if (polyPoints.length < 3) {
                    tempShape.destroy(); tempShape = null; return;
                }

                // 2. 執行核心邏輯：切割 Link 並建立 Node
                processManualIntersection(polyPoints);
                saveState(); // [新增]


                // 3. 清理
                tempShape.destroy();
                tempShape = null;
                setTool('select');
            }

            // --- 新增：SubNetworkTool 邏輯 ---
            if (activeTool === 'subnetwork') {
                SubNetworkTool.handleDoubleClick();
                return;
            }
            // -------------------------------

        });

        // Right-click handler to finalize drawing
        // 在 init() 函數中，找到 'contextmenu' 事件監聽器並替換它
        stage.on('contextmenu', (e) => {
            e.evt.preventDefault();
            if (isSynchroMode && activeTool === 'add-link') {
                const pointer = stage.getPointerPosition();
                const worldPos = pointer ? {
                    x: (pointer.x - stage.x()) / stage.scaleX(),
                    y: (pointer.y - stage.y()) / stage.scaleY(),
                } : null;

                if (typeof finishSynchroDraft === 'function') {
                    finishSynchroDraft(worldPos);
                } else if (typeof cleanupSynchroDraft === 'function') {
                    cleanupSynchroDraft(false);
                }
                return;
            }

            if ((activeTool === 'add-link' || activeTool === 'measure' || activeTool === 'append-lane-stroke') && tempShape) {
                const currentPoints = tempShape.points();
                const finalRawPoints = currentPoints.slice(0, -2);
                const finalPoints = [];
                for (let i = 0; i < finalRawPoints.length; i += 2) {
                    finalPoints.push({ x: finalRawPoints[i], y: finalRawPoints[i + 1] });
                }

                // ==========================================
                // [新增] 模式 0：對既有路段手繪新增標線
                // ==========================================
                if (activeTool === 'append-lane-stroke') {
                    if (finalPoints.length > 1 && appendingStrokeToLink) {
                        const link = appendingStrokeToLink;

                        // 1. 將畫好的線加入該路段
                        link.strokes.push({
                            type: draftCurrentStrokeType || 'white_dashed',
                            points: finalPoints
                        });

                        // 2. 由於多了一條分隔線，車道數加 1
                        let lastAllowed = [];
                        if (link.lanes && link.lanes.length > 0) {
                            const prevLaneProfiles = link.lanes[link.lanes.length - 1].allowedVehicleProfiles;
                            if (Array.isArray(prevLaneProfiles)) lastAllowed = [...prevLaneProfiles];
                        }
                        if (!link.lanes) link.lanes = [];
                        link.lanes.push({ width: LANE_WIDTH, allowedVehicleProfiles: lastAllowed });

                        // 3. 空間排序 (左到右)，確保線條順序正確
                        const formattedStrokes = link.strokes.map(s => ({ type: s.type, rawPoints: s.points }));
                        const sortedStrokes = spatialSortStrokes(formattedStrokes);
                        link.strokes = sortedStrokes.map(s => ({ type: s.type, points: s.rawPoints }));

                        // 4. 重算中心線與重繪
                        updateLaneBasedGeometry(link);
                        drawLink(link);
                        drawWaypointHandles(link); // 重建黃色/橘色控制點
                        updateDependencies(link);

                        // 5. 重新選取以更新屬性面板，並存檔
                        selectObject(link);
                        saveState();
                    }
                    if (tempShape) { tempShape.destroy(); tempShape = null; }
                    appendingStrokeToLink = null;
                    setTool('select');
                }
                // ==========================================
                // 模式 1 & 2：原本的 add-link 與 measure 邏輯
                // ==========================================
                else if (activeTool === 'add-link') {
                    // --- [修正重點]：將 parametric 模式與 standard 模式合併處理建立邏輯 ---
                    if (linkCreationSettings.mode === 'standard' || linkCreationSettings.mode === 'parametric' || !linkCreationSettings.mode) {
                        if (finalPoints.length > 1) {
                            let createdSynchroLinks = [];
                            if (isSynchroMode && typeof extendSynchroPointsForTJunctions === 'function') {
                                extendSynchroPointsForTJunctions(finalPoints);
                            }
                            if (linkCreationSettings.isTwoWay) {
                                const lanes = linkCreationSettings.lanesPerDir;
                                const roadWidth = lanes * LANE_WIDTH;
                                const median = linkCreationSettings.medianWidth;
                                const offsetDist = (roadWidth / 2) + (median / 2);

                                let forwardOffset = linkCreationSettings.drivingSide === 'right' ? offsetDist : -offsetDist;
                                let backwardOffset = linkCreationSettings.drivingSide === 'right' ? -offsetDist : offsetDist;

                                const forwardPoints = getOffsetPolyline(finalPoints, forwardOffset);
                                const linkF = createLink(forwardPoints, lanes);
                                linkF.name = `Link_${idCounter} (F)`;

                                let backwardPoints = getOffsetPolyline(finalPoints, backwardOffset);
                                backwardPoints.reverse();
                                const linkB = createLink(backwardPoints, lanes);
                                linkB.name = `Link_${idCounter} (B)`;

                                linkF.pairInfo = { pairId: linkB.id, type: 'forward', medianWidth: median };
                                linkB.pairInfo = { pairId: linkF.id, type: 'backward', medianWidth: median };
                                createdSynchroLinks = [linkF, linkB];
                                selectObject(linkF);
                            } else {
                                const newLink = createLink(finalPoints, linkCreationSettings.lanesPerDir);
                                createdSynchroLinks = [newLink];
                                selectObject(newLink);
                            }
                            updateAllOverpasses();
                            if (isSynchroMode && typeof handleSynchroAutoIntersections === 'function') {
                                handleSynchroAutoIntersections(createdSynchroLinks);
                            }
                            saveState();
                        }
                        if (tempShape) tempShape.destroy();
                        tempShape = null;
                        setTool('select');
                    }
                    else if (linkCreationSettings.mode === 'lane-based') {
                        if (finalPoints.length > 1) {
                            draftLaneStrokes.push({
                                type: draftCurrentStrokeType,
                                konvaLine: tempShape,
                                rawPoints: finalPoints
                            });
                            tempShape.opacity(0.8);
                        } else {
                            tempShape.destroy();
                        }
                        tempShape = null;
                        layer.batchDraw();
                        updatePropertiesPanel(null);
                    }
                }
                else if (activeTool === 'measure') {
                    if (finalPoints.length > 1) {
                        const newMeasurement = createMeasurement(finalPoints);
                        selectObject(newMeasurement);
                        saveState();
                    }
                    if (tempShape) tempShape.destroy();
                    if (tempMeasureText) tempMeasureText.destroy();
                    tempShape = null;
                    tempMeasureText = null;
                }
            }
        });

        // 接著，找到 layer.on('click tap', ...) 事件監聽器並替換它
        layer.on('click tap', (e) => {
            lastSelectedNodeForProperties = null;

            if (activeTool !== 'select') return;

            // --- 在這裡插入你的檢查代碼 ---
            if (e.target.name() === 'parking-vertex-handle' || e.target.name() === 'zone-vertex-handle' || e.target.name() === 'zone-midpoint-handle') {
                return;
            }
            // ---------------------------

            if (e.target.name() === 'measurement-handle') {
                return;
            }

            if (['lane-port', 'control-point', 'waypoint-handle', 'length-handle', 'parking-vertex-handle', 'channelization-vertex-handle', 'zone-vertex-handle', 'zone-midpoint-handle'].includes(e.target.name())) {
                return;
            }

            const clickedShape = e.target;
            const pointerPos = stage.getPointerPosition();

            // --- START: 新增 Overpass 點擊處理 ---
            if (clickedShape.id() && network.overpasses[clickedShape.id()]) {
                selectObject(network.overpasses[clickedShape.id()]);
                return;
            }
            // --- END: 新增 Overpass 點擊處理 ---

            if (clickedShape.name() === 'group-connection-visual') {
                const meta = clickedShape.getAttr('meta');
                const groupObject = {
                    id: `group_${meta.sourceLinkId}_to_${meta.destLinkId}`,
                    ...meta,
                    konvaLine: clickedShape,
                };
                selectObject(groupObject);
                return;
            }

            // 檢查是否點擊到任何一個背景
            for (const bgId in network.backgrounds) {
                const bg = network.backgrounds[bgId];
                const bgGroup = bg.konvaGroup;
                if (bgGroup && (clickedShape === bgGroup || bgGroup.isAncestorOf(clickedShape))) {
                    selectObject(bg);
                    return;
                }
            }

            const group = clickedShape.findAncestor('Group');

            if (group && group.id()) {
                const obj = network.links[group.id()]
                    || network.detectors[group.id()]
                    || network.measurements[group.id()]
                    || network.parkingLots[group.id()]
                    || network.parkingGates[group.id()]
                    || network.pushpins[group.id()]
                    // [修正] 加入這一行，讓點擊事件能找到 RoadMarking 物件
                    || network.roadMarkings[group.id()]
                    || (network.zones && network.zones[group.id()]);

                if (obj) {
                    if (e.evt.altKey && obj.type === 'Link') {
                        const link = obj;
                        const pos = stage.getPointerPosition();
                        const localPos = {
                            x: (pos.x - stage.x()) / stage.scaleX(),
                            y: (pos.y - stage.y()) / stage.scaleY()
                        };

                        const { point: newPoint, index: segmentIndex } = projectPointOnPolylineWithIndex(localPos, link.waypoints);

                        if (newPoint && segmentIndex > -1) {
                            link.waypoints.splice(segmentIndex + 1, 0, newPoint);
                            drawLink(link);
                            updateConnectionEndpoints(link.id);
                            updateAllDetectorsOnLink(link.id);
                            updateFlowPointsOnLink(link.id);
                            updateRoadSignsOnLink(link.id);
                            updateAllOverpasses(); // <--- 新增呼叫

                            if (selectedObject && selectedObject.id === link.id) {
                                drawWaypointHandles(link);
                                updatePropertiesPanel(link);
                            }

                            layer.batchDraw();
                        }
                        e.evt.preventDefault();
                        return;
                    }

                    selectObject(obj);
                    return;
                }
            }

            if (clickedShape.id() && network.roadSigns[clickedShape.id()]) {
                const obj = network.roadSigns[clickedShape.id()];
                selectObject(obj);
                return;
            }

            if (clickedShape.id() && (network.origins[clickedShape.id()] || network.destinations[clickedShape.id()])) {
                const obj = network.origins[clickedShape.id()] || network.destinations[clickedShape.id()];
                selectObject(obj);
                return;
            }

            if (clickedShape.id() && network.nodes[clickedShape.id()]) {
                selectObject(network.nodes[clickedShape.id()]);
                return;
            }

            if (clickedShape.id() && network.connections[clickedShape.id()]) {
                const candidates = Object.values(network.connections).filter(conn =>
                    conn.konvaBezier.isVisible() && conn.konvaBezier.intersects(pointerPos)
                );

                if (candidates.length <= 1) {
                    selectObject(network.connections[clickedShape.id()]);
                } else {
                    const currentlySelectedIndex = selectedObject ? candidates.findIndex(c => c.id === selectedObject.id) : -1;
                    let nextCandidate;
                    if (currentlySelectedIndex !== -1) {
                        const nextIndex = (currentlySelectedIndex + 1) % candidates.length;
                        nextCandidate = candidates[nextIndex];
                    } else {
                        nextCandidate = network.connections[clickedShape.id()];
                    }
                    selectObject(nextCandidate);
                }
                return;
            }

            if (clickedShape === stage) {
                deselectAll();
            }
        });
        const toolbarEl = document.getElementById('toolbar');
        toolbarEl.addEventListener('click', (e) => {
            // 1. 點擊收納群組的下拉切換鈕
            const toggleBtn = e.target.closest('.tool-dropdown-toggle');
            if (toggleBtn) {
                e.stopPropagation();
                const parentDropdown = toggleBtn.closest('.tool-dropdown');
                const wasOpen = parentDropdown.classList.contains('open');
                document.querySelectorAll('.tool-dropdown.open').forEach(d => d.classList.remove('open'));
                if (!wasOpen) parentDropdown.classList.add('open');
                return;
            }

            // 2. 點擊一般工具或收納選單內的工具
            const btn = e.target.closest('.tool-btn');
            if (btn) {
                document.querySelectorAll('.tool-dropdown.open').forEach(d => d.classList.remove('open'));
                if (btn.dataset.tool) {
                    setTool(btn.dataset.tool);

                    // 同步更新收納母鈕的高亮狀態與當前圖示
                    document.querySelectorAll('.tool-dropdown').forEach(dropdown => {
                        const activeChild = dropdown.querySelector(`.tool-btn[data-tool="${btn.dataset.tool}"]`);
                        dropdown.classList.toggle('active', Boolean(activeChild));
                        if (activeChild) {
                            const childIcon = activeChild.querySelector('i');
                            const groupIcon = dropdown.querySelector('.group-icon');
                            if (childIcon && groupIcon) {
                                groupIcon.className = `${childIcon.className} group-icon`;
                            }
                        }
                    });
                }
            }
        });

        // 點擊畫布或其他區域時自動收起下拉選單
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tool-dropdown')) {
                document.querySelectorAll('.tool-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        });

        // --- [新增] 綁定 Undo/Redo 按鈕 ---
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');

        if (undoBtn) undoBtn.addEventListener('click', performUndo);
        if (redoBtn) redoBtn.addEventListener('click', performRedo);

        document.getElementById('exportXmlBtn').addEventListener('click', exportXML);

        const simulate3DBtn = document.getElementById('simulate3DBtn');
        if (simulate3DBtn) {
            simulate3DBtn.addEventListener('click', () => {
                const xml = serializeNetworkToXML();
                try {
                    localStorage.setItem('simTrafficFlow_exportedNetwork', xml);
                } catch (e) {
                    console.warn("Could not save network to localStorage:", e);
                }
                window.open('../simulator/main_01.html?source=editor', '_blank', 'noopener');
            });
        }

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.sim';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        document.getElementById('importXmlBtn').addEventListener('click', () => {
            document.getElementById('importXmlBtn').title = "Import from XML";
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    createAndLoadNetworkFromXML(event.target.result);
                } catch (error) {
                    console.error("Failed to parse or load XML file:", error);
                    alert(I18N.t("Error loading XML file. See console for details."));
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        window.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObject) {
                e.preventDefault();
                deleteSelectedObject();
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'v': setTool('select'); break;
                case 'l': setTool('add-link'); break;
                case 'c': setTool('connect-lanes'); break;
                case 't': setTool('edit-tfl'); break;
                case 'f': setTool('add-flow'); break;
                case 'm': setTool('measure'); break;
                case 'b': setTool('add-background'); break;
                case 'r': setTool('add-road-sign'); break;
                case 'p': setTool('add-point-detector'); break;
                case 's': setTool('add-section-detector'); break;
                case 'z': setTool('add-zone'); break;
                case 'escape':
                    if (tempShape) { tempShape.destroy(); tempShape = null; }
                    if (tempMeasureText) { tempMeasureText.destroy(); tempMeasureText = null; }
                    if (window.redrawingZone) {
                        const prevZone = window.redrawingZone;
                        window.redrawingZone = null;
                        setTool('select');
                        selectObject(prevZone);
                        break;
                    }
                    setTool('select');
                    deselectAll(); break;
                // 在 switch 內加入：
                case 'g': setTool('add-pushpin'); break;
                case 'k': setTool('add-marking'); break;
            }
        });

        layer.on('dragstart', (e) => {
            if (e.target.name() !== 'lane-port') return;
            e.target.moveToTop();
            tempShape = new Konva.Line({
                stroke: 'rgba(255, 255, 0, 0.8)', strokeWidth: 3, lineCap: 'round',
                dash: [10, 5], listening: false, tension: 1,
            });
            layer.add(tempShape);
        });

        layer.on('dragmove', (e) => {
            if (e.target.name() !== 'lane-port' || !tempShape) return;
            const sourcePort = e.target;
            const pos = sourcePort.position();
            const meta = sourcePort.getAttr('meta');
            const sourceLink = network.links[meta.linkId];
            const sourceLanePath = getLanePath(sourceLink, meta.laneIndex);
            if (sourceLanePath.length < 2) return;

            let p1;
            if (meta.portType === 'start') {
                p1 = sourceLanePath[0];
            } else {
                p1 = sourceLanePath[sourceLanePath.length - 1];
            }

            tempShape.points([p1.x, p1.y, pos.x, pos.y]);
        });

        layer.on('dragend', (e) => {
            if (['control-point', 'waypoint-handle', 'length-handle', 'zone-vertex-handle', 'zone-midpoint-handle'].includes(e.target.name())) return;
            const sourcePort = e.target;
            const sourceName = sourcePort.name();

            if (sourceName !== 'lane-port' && sourceName !== 'group-connect-port') return;

            const sourceMeta = sourcePort.getAttr('meta');
            const sourcePos = sourcePort.position();

            let dropTarget = null;
            let minDistance = (sourceName === 'group-connect-port' ? 20 : PORT_RADIUS * 2) * (1 / stage.scaleX());

            layer.find('.lane-port').forEach(potentialTarget => {
                if (potentialTarget.getAttr('meta').portType !== 'start') return;

                const targetPos = potentialTarget.position();
                const distance = Math.sqrt(Math.pow(sourcePos.x - targetPos.x, 2) + Math.pow(sourcePos.y - targetPos.y, 2));

                if (distance < minDistance) {
                    minDistance = distance;
                    dropTarget = potentialTarget;
                }
            });

            if (dropTarget) {
                const destMeta = dropTarget.getAttr('meta');

                if (sourceName === 'lane-port' && sourceMeta.portType === 'end') {
                    // 1. 取得新建的 Connection 物件
                    const newConn = handleConnection(sourceMeta, destMeta);

                    if (newConn) {
                        // 2. 確保單獨的細小連接線保持顯示 (預設為 true，這裡顯式宣告)
                        newConn.konvaBezier.visible(true);

                        // 3. 獲取來源與目標的 Link 物件
                        const sourceLink = network.links[sourceMeta.linkId];
                        const destLink = network.links[destMeta.linkId];

                        // 4. 呼叫自動歸群函數 (確保邏輯上已被加入 Connection Group)
                        if (sourceLink && destLink) {
                            drawConnectionGroupVisual(sourceLink, destLink, [newConn.id], newConn.nodeId);
                        }

                        // 5. 尋找歸群線並將其隱藏
                        const groupShape = layer.find('.group-connection-visual').find(shape => {
                            const meta = shape.getAttr('meta');
                            return meta && meta.sourceLinkId === sourceLink.id && meta.destLinkId === destLink.id;
                        });

                        if (groupShape) {
                            // 隱藏粗綠色群組線
                            groupShape.visible(false);

                            // 確保該群組內的所有單條細線都是顯示狀態
                            // (這能防止使用者先用工具列的 Connect 批量連接，又手動補拉一條線時，發生部分細線被隱藏的衝突)
                            const groupMeta = groupShape.getAttr('meta');
                            if (groupMeta && groupMeta.connectionIds) {
                                groupMeta.connectionIds.forEach(id => {
                                    const conn = network.connections[id];
                                    if (conn && conn.konvaBezier) {
                                        conn.konvaBezier.visible(true);
                                    }
                                });
                            }
                        }

                        // 6. 選取剛剛建立的單一連接線，並打開屬性面板
                        selectObject(newConn);
                        saveState(); // 觸發 Undo/Redo 存檔
                    }
                } else if (sourceName === 'group-connect-port') {
                    const sourceLink = network.links[sourceMeta.linkId];
                    const destLink = network.links[destMeta.linkId];
                    if (sourceLink && destLink) {
                        const pointerPos = stage.getPointerPosition();
                        showLaneRangeSelector(sourceLink, destLink, pointerPos, null);
                    }
                }
            }

            if (tempShape) {
                tempShape.destroy();
                tempShape = null;
            }

            layer.find('.lane-port, .group-connect-port').forEach(p => {
                try {
                    const meta = p.getAttr('meta');
                    const link = network.links[meta.linkId];
                    if (!link || !link.waypoints || link.waypoints.length < 2) { p.destroy(); return; }

                    if (p.name() === 'lane-port') {
                        const lanePath = getLanePath(link, meta.laneIndex);
                        if (lanePath.length > 0) {
                            const pos = (meta.portType === 'start') ? lanePath[0] : lanePath[lanePath.length - 1];
                            p.position({ x: pos.x, y: pos.y });
                        }
                    } else if (p.name() === 'group-connect-port') {
                        const linkLength = getPolylineLength(link.waypoints);
                        const upstreamDist = Math.max(0, linkLength - 15);
                        const { point: upstreamPoint } = getPointAlongPolyline(link.waypoints, upstreamDist);
                        p.position({ x: upstreamPoint.x, y: upstreamPoint.y });
                    }
                } catch (error) { console.error("Error repositioning port:", error, "Port meta:", p.getAttr('meta')); p.destroy(); }
            });
            layer.batchDraw();
        });

        // --- START OF COMPLETE REPLACEMENT FOR layer.on('click tap', ...) ---
        // 完整替換此事件處理器
        layer.on('click tap', (e) => {
            // 當使用者直接在畫布上點擊時，清除「返回節點」的狀態
            lastSelectedNodeForProperties = null; // <--- 新增此行

            if (activeTool !== 'select') return;

            if (e.target.name() === 'measurement-handle') {
                return;
            }

            if (['lane-port', 'control-point', 'waypoint-handle', 'length-handle', 'parking-vertex-handle', 'channelization-vertex-handle', 'node-vertex-handle', 'zone-vertex-handle', 'zone-midpoint-handle'].includes(e.target.name())) {
                return;
            }

            const clickedShape = e.target;
            const pointerPos = stage.getPointerPosition();

            // The logic for group connections is now handled via the properties panel,
            // so this block can be simplified.
            if (clickedShape.name() === 'group-connection-visual') {
                const meta = clickedShape.getAttr('meta');
                const groupObject = {
                    id: `group_${meta.sourceLinkId}_to_${meta.destLinkId}`,
                    ...meta,
                    konvaLine: clickedShape,
                };
                selectObject(groupObject);
                return;
            }

            // 檢查是否點擊到任何一個背景
            for (const bgId in network.backgrounds) {
                const bg = network.backgrounds[bgId];
                const bgGroup = bg.konvaGroup;
                if (bgGroup && (clickedShape === bgGroup || bgGroup.isAncestorOf(clickedShape))) {
                    selectObject(bg);
                    return;
                }
            }

            const group = clickedShape.findAncestor('Group');

            if (group && group.id()) {
                const obj = network.links[group.id()]
                    || network.detectors[group.id()]
                    || network.measurements[group.id()]
                    || network.parkingLots[group.id()]
                    || (network.zones && network.zones[group.id()]);

                if (obj) {
                    if (e.evt.altKey && obj.type === 'Link') {
                        const link = obj;
                        const pos = stage.getPointerPosition();
                        const localPos = {
                            x: (pos.x - stage.x()) / stage.scaleX(),
                            y: (pos.y - stage.y()) / stage.scaleY()
                        };

                        const { point: newPoint, index: segmentIndex } = projectPointOnPolylineWithIndex(localPos, link.waypoints);

                        if (newPoint && segmentIndex > -1) {
                            link.waypoints.splice(segmentIndex + 1, 0, newPoint);
                            if (link.geometryType === 'parametric') generateParametricStrokes(link);
                            drawLink(link);
                            updateConnectionEndpoints(link.id);
                            updateAllDetectorsOnLink(link.id);
                            updateFlowPointsOnLink(link.id);
                            updateRoadSignsOnLink(link.id);

                            if (selectedObject && selectedObject.id === link.id) {
                                drawWaypointHandles(link);
                                updatePropertiesPanel(link);
                            }

                            layer.batchDraw();
                        }
                        e.evt.preventDefault();
                        return;
                    }

                    selectObject(obj);
                    return;
                }
            }

            if (clickedShape.id() && network.roadSigns[clickedShape.id()]) {
                const obj = network.roadSigns[clickedShape.id()];
                selectObject(obj);
                return;
            }

            if (clickedShape.id() && (network.origins[clickedShape.id()] || network.destinations[clickedShape.id()])) {
                const obj = network.origins[clickedShape.id()] || network.destinations[clickedShape.id()];
                selectObject(obj);
                return;
            }

            // Simplified Node selection. Always select the node if it's clicked.
            if (clickedShape.id() && network.nodes[clickedShape.id()]) {
                selectObject(network.nodes[clickedShape.id()]);
                return;
            }

            if (clickedShape.id() && network.connections[clickedShape.id()]) {
                const candidates = Object.values(network.connections).filter(conn =>
                    conn.konvaBezier.isVisible() && conn.konvaBezier.intersects(pointerPos)
                );

                if (candidates.length <= 1) {
                    selectObject(network.connections[clickedShape.id()]);
                } else {
                    const currentlySelectedIndex = selectedObject ? candidates.findIndex(c => c.id === selectedObject.id) : -1;
                    let nextCandidate;
                    if (currentlySelectedIndex !== -1) {
                        const nextIndex = (currentlySelectedIndex + 1) % candidates.length;
                        nextCandidate = candidates[nextIndex];
                    } else {
                        nextCandidate = network.connections[clickedShape.id()];
                    }
                    selectObject(nextCandidate);
                }
                return;
            }

            if (clickedShape === stage) {
                deselectAll();
            }
        });
        window.addEventListener('resize', () => {
            stage.width(canvasContainer.clientWidth);
            stage.height(canvasContainer.clientHeight);
            drawGrid();
        });

        initModals();
        setTool('select');
        initBackgroundLock();

        // --- [新增] 語言初始化邏輯 ---
        const langSelect = document.getElementById('languageSelect');

        // 1. 讀取使用者上次設定，若無則偵測瀏覽器語言
        const savedLang = localStorage.getItem('simTrafficFlow_lang');
        const systemLang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        const initLang = savedLang || systemLang; // 預設邏輯：有存讀存，沒存讀系統

        // 2. 設定下拉選單的值
        if (langSelect) {
            langSelect.value = initLang;

            // 3. 綁定切換事件
            langSelect.addEventListener('change', (e) => {
                // 切換語言時移除 focus，避免按鍵盤快捷鍵(如 Del)時誤觸選單
                e.target.blur();
                I18N.setLang(e.target.value);
            });
        }

        // 4. 執行初次翻譯
        I18N.setLang(initLang);

        // [新增] 綁定 OSM Import 按鈕
        const osmBtn = document.getElementById('osmImportBtn'); // 需在 main.html 增加此按鈕
        if (osmBtn) {
            osmBtn.addEventListener('click', () => {
                // 檢查 OSMImporter 是否已載入
                if (typeof OSMImporter !== 'undefined') {
                    OSMImporter.open();
                } else {
                    alert("OSM Importer module not found. Please check script tags.");
                }
            });
        }

        // [新增] 綁定 "Generate Roads" 按鈕
        const btnGen = document.getElementById('btn-osm-generate');
        if (btnGen) {
            btnGen.addEventListener('click', () => {
                // 從多個背景中尋找帶有地理坐標的 OSM 背景
                const validBg = Object.values(network.backgrounds).find(bg => bg.geoBounds);
                if (!validBg) {
                    alert("No geo-referenced background found. Please Import Map Background first.");
                    return;
                }

                const confirmed = confirm("Generate Roads from OSM?\n\n");
                if (confirmed) {
                    document.body.style.cursor = 'wait';
                    OSMNetworkBuilder.generate(validBg, {
                        autoConnect: true,
                        autoSignal: true,
                        forceIntersect: true
                    }, (result) => {
                        const { newLinks, newNodes, newConnections, newTFLs } = result;

                        Object.assign(network.links, newLinks);
                        Object.assign(network.nodes, newNodes);
                        Object.assign(network.connections, newConnections);
                        Object.assign(network.trafficLights, newTFLs);

                        // 繪圖處理
                        Object.values(newLinks).forEach(l => { layer.add(l.konvaGroup); drawLink(l); });
                        Object.values(newNodes).forEach(n => { layer.add(n.konvaShape); n.konvaShape.clearCache(); });
                        Object.values(newConnections).forEach(c => { layer.add(c.konvaBezier); c.konvaBezier.moveToBottom(); });

                        drawGrid();
                        // 1. 將生成的路段移到下方
                        Object.values(newLinks).forEach(l => l.konvaGroup.moveToBottom());
                        Object.values(newConnections).forEach(c => c.konvaBezier.moveToBottom());

                        // 【修正重點】2. 遍歷所有的地圖背景移至"最"下方，確保墊底
                        Object.values(network.backgrounds).forEach(bg => {
                            if (bg.konvaGroup) bg.konvaGroup.moveToBottom();
                        });

                        Object.values(newNodes).forEach(n => n.konvaShape.moveToTop());

                        layer.batchDraw();
                        document.body.style.cursor = 'default';
                        updateStatusBar();
                        alert(`Generation Complete!\nNodes: ${Object.keys(newNodes).length}\nLinks: ${Object.keys(newLinks).length}`);
                    });
                }
            });
        }

        // 初始化 SubNetworkTool
        if (window.SubNetworkTool) {
            SubNetworkTool.init();
        }
        // --- [新增] 初始化初始狀態 ---
        // 延遲一點執行確保所有圖層初始化完畢
        setTimeout(() => {
            saveState(); // 儲存空白或初始狀態作為起點
        }, 100);
    }

    // --- END OF CORRECTED `init` FUNCTION ---
    // 新增函數
    function deleteParkingGate(id) {
        const gate = network.parkingGates[id];
        if (!gate) return;
        gate.konvaGroup.destroy();
        delete network.parkingGates[id];
        deselectAll();
        layer.batchDraw();
    }

    function deleteSelectedObject() {
        if (!selectedObject) return;

        const obj = selectedObject;

        switch (obj.type) {
            case 'Link':
                deleteLink(obj.id);
                break;
            case 'Node':
                deleteNode(obj.id, true); // <--- [修改] 啟用強制刪除，允許使用 Delete 鍵直接刪除路口
                break;
            case 'Connection':
                deleteConnection(obj.id);
                break;
            case 'PointDetector':
            case 'SectionDetector':
                deleteDetector(obj.id);
                break;
            case 'RoadSign':
                deleteRoadSign(obj.id);
                break;
            case 'Origin':
                deleteOrigin(obj.id);
                break;
            case 'Destination':
                deleteDestination(obj.id);
                break;
            case 'Measurement':
                deleteMeasurement(obj.id);
                break;
            case 'Background':
                deleteBackground(obj.id);
                break;
            case 'ConnectionGroup':
                deleteConnectionGroup(obj);
                break;
            case 'ParkingLot':
                deleteParkingLot(obj.id);
                break;
            case 'Zone':
                deleteZone(obj.id);
                break;
            case 'ParkingGate':
                deleteParkingGate(obj.id);
                break;
            case 'Overpass':
                obj.konvaRect.destroy();
                delete network.overpasses[obj.id];
                break;
            case 'Pushpin':
                deletePushpin(obj.id);
                break;
            case 'RoadMarking':
                if (obj.konvaGroup) obj.konvaGroup.destroy();
                delete network.roadMarkings[obj.id];
                break;
        }

        deselectAll();
        layer.batchDraw();
    }

    function deleteLink(linkId) {
        const link = network.links[linkId];
        if (!link) return;

        // Delete associated connections
        Object.values(network.connections).forEach(conn => {
            if (conn.sourceLinkId === linkId || conn.destLinkId === linkId) {
                deleteConnection(conn.id);
            }
        });

        // Cleanup associated connection group visuals
        layer.find('.group-connection-visual').forEach(groupVisual => {
            const meta = groupVisual.getAttr('meta');
            if (meta && (meta.sourceLinkId === linkId || meta.destLinkId === linkId)) {
                groupVisual.destroy();
            }
        });

        // Delete associated detectors
        Object.values(network.detectors).forEach(det => {
            if (det.linkId === linkId) {
                deleteDetector(det.id);
            }
        });

        // Delete associated road signs
        Object.values(network.roadSigns).forEach(sign => {
            if (sign.linkId === linkId) {
                deleteRoadSign(sign.id);
            }
        });

        // Delete associated origins/destinations
        Object.values(network.origins).forEach(o => {
            if (o.linkId === linkId) deleteOrigin(o.id);
        });
        Object.values(network.destinations).forEach(d => {
            if (d.linkId === linkId) deleteDestination(d.id);
        });

        // Remove link from node references
        Object.values(network.nodes).forEach(node => {
            node.incomingLinkIds.delete(linkId);
            node.outgoingLinkIds.delete(linkId);
        });

        // Cleanup Konva objects
        destroyWaypointHandles(link);
        link.konvaGroup.destroy();
        delete network.links[linkId];
    }
    function deleteDetector(id) {
        const detector = network.detectors[id];
        if (!detector) return;

        // 1. 銷毀 Konva 視覺群組 (這一步最重要，否則畫面上不會消失)
        if (detector.konvaGroup) {
            detector.konvaGroup.destroy();
        }

        // 2. 從資料結構中移除
        delete network.detectors[id];
    }

    function deleteNode(nodeId, force = false) {
        const node = network.nodes[nodeId];
        if (!node) return;

        // --- [新增] 收集受影響的相鄰路段 (Links) 列表，以便稍後重新整理 ---
        const affectedLinkIds = new Set([...node.incomingLinkIds, ...node.outgoingLinkIds]);

        // --- [新增] 清理與此路口相關的 Connection Group 視覺物件 (綠色粗線) ---
        layer.find('.group-connection-visual').forEach(groupVis => {
            const meta = groupVis.getAttr('meta');
            if (meta && meta.nodeId === nodeId) {
                groupVis.destroy();
            }
        });

        // Delete connections passing through this node
        Object.values(network.connections).forEach(conn => {
            if (conn.nodeId === nodeId) {
                deleteConnection(conn.id);
            }
        });

        // Delete associated traffic light data
        if (network.trafficLights[nodeId]) delete network.trafficLights[nodeId];

        // --- 強制刪除時，主動清除周遭路段對此路口的關聯 ---
        if (force) {
            node.incomingLinkIds.forEach(linkId => {
                if (network.links[linkId]) network.links[linkId].endNodeId = null;
            });
            node.outgoingLinkIds.forEach(linkId => {
                if (network.links[linkId]) network.links[linkId].startNodeId = null;
            });
            node.incomingLinkIds.clear();
            node.outgoingLinkIds.clear();
        }

        // Only delete the node if it's not connecting any links
        if (node.incomingLinkIds.size === 0 && node.outgoingLinkIds.size === 0) {
            destroyNodeHandles(node); // 清除可能存在的控制點
            node.konvaShape.destroy();
            delete network.nodes[nodeId];
        }

        // --- 自動重新整理受影響的路段 (Links) ---
        affectedLinkIds.forEach(linkId => {
            const link = network.links[linkId];
            if (link) {
                if (link.geometryType === 'parametric' && typeof window.generateParametricStrokes === 'function') {
                    window.generateParametricStrokes(link);
                }
                drawLink(link);
                updateDependencies(link);
            }
        });

        updateAllOverpasses(); // 在函數結尾更新橋樑檢測

        // --- [新增修正] 刷新畫面上的工具圖示 (設定⚙️與號誌🚦)，避免殘留 ---
        if (activeTool === 'select') {
            showNodeSettingsIcons();
        } else if (activeTool === 'edit-tfl') {
            showTrafficLightIcons();
        }

        layer.batchDraw();     // 確保畫面即時刷新
    }

    // --- 刪除單一連接線 ---
    function deleteConnection(connId) {
        const conn = network.connections[connId];
        if (!conn) return;

        // 1. 從交通號誌群組中移除此連接線的 ID
        // (避免刪除線後，號誌還以為這條線存在)
        const nodeId = conn.nodeId;
        const tfl = network.trafficLights[nodeId];
        if (tfl) {
            if (tfl.signalGroupSets) {
                Object.values(tfl.signalGroupSets).forEach(gs => {
                    Object.values(gs.groups || {}).forEach(group => {
                        const idx = group.connIds.indexOf(connId);
                        if (idx > -1) group.connIds.splice(idx, 1);
                    });
                });
            }
            if (tfl.signalGroups) {
                Object.values(tfl.signalGroups).forEach(group => {
                    const index = group.connIds.indexOf(connId);
                    if (index > -1) {
                        group.connIds.splice(index, 1);
                    }
                });
            }
        }

        // 2. 銷毀 Konva 圖形
        if (conn.konvaBezier) {
            conn.konvaBezier.destroy();
        }
        // 如果有控制點 (Control Points) 也要銷毀
        destroyConnectionControls(conn);

        // 3. 從資料模型中刪除
        delete network.connections[connId];
    }

    // --- 刪除連接群組 ---
    function deleteConnectionGroup(groupObj) {
        if (!groupObj || !groupObj.connectionIds) return;

        // 1. 遍歷群組內的所有 ID，逐一刪除單一連接線
        // (複製一份陣列再遍歷，避免在迴圈中修改陣列長度導致錯誤)
        [...groupObj.connectionIds].forEach(connId => {
            deleteConnection(connId);
        });

        // 2. 刪除群組本身的視覺線條 (綠色粗線)
        if (groupObj.konvaLine) {
            groupObj.konvaLine.destroy();
        }

        // 注意：ConnectionGroup 本身沒有存在 network 物件的頂層 (它是附屬的)，
        // 所以只要銷毀視覺元素並刪除內部的 connections 即可。
    }

    // --- 輔助：銷毀控制點 (如果有的話) ---
    function destroyConnectionControls(conn) {
        if (conn && conn.konvaControls) {
            conn.konvaControls.forEach(c => c.destroy());
            conn.konvaControls = [];
        }
    }

    function deleteRoadSign(signId) {
        const sign = network.roadSigns[signId];
        if (!sign) return;

        sign.konvaShape.destroy();
        delete network.roadSigns[signId];
    }

    function deleteOrigin(originId) {
        const origin = network.origins[originId];
        if (!origin) return;

        origin.konvaShape.destroy();
        origin.konvaLabel.destroy();
        delete network.origins[originId];
    }

    function deleteDestination(destinationId) {
        const dest = network.destinations[destinationId];
        if (!dest) return;

        // Remove references from origins' destination lists
        Object.values(network.origins).forEach(origin => {
            if (origin.periods) {
                origin.periods.forEach(period => {
                    if (period.destinations) {
                        period.destinations = period.destinations.filter(d => d.nodeId !== destinationId);
                    }
                });
            }
        });

        dest.konvaShape.destroy();
        if (dest.konvaLabel) {
            dest.konvaLabel.destroy();
        }
        delete network.destinations[destinationId];

        // If an origin is selected, refresh its properties panel
        if (selectedObject && selectedObject.type === 'Origin') {
            updatePropertiesPanel(selectedObject);
        }
    }

    function deleteConnectionGroup(groupObj) {
        if (!groupObj || !groupObj.connectionIds) return;

        // Delete all individual connections in the group
        groupObj.connectionIds.forEach(connId => {
            deleteConnection(connId);
        });

        // Delete the visual line for the group
        if (groupObj.konvaLine) {
            groupObj.konvaLine.destroy();
        }
    }


    // --- START OF CORRECTED handleStageClick FUNCTION ---
    // --- [新增] 輔助函數：判斷點擊是否落在畫布或背景圖上 ---
    // 這能讓工具 (如新增道路、測量等) 可以在背景圖之上正常作用
    function isDrawableCanvas(target) {
        if (!target) return false;
        if (target === stage) return true;
        if (target.findAncestor) {
            const group = target.findAncestor('Group');
            if (group && group.name() === 'background-group') return true;
        }
        return false;
    }
    function handleStageClick(e) {
        // 確保只處理滑鼠左鍵點擊
        if (e.evt.button !== 0) {
            return;
        }

        const pointer = stage.getPointerPosition();
        const pos = {
            x: (pointer.x - stage.x()) / stage.scaleX(),
            y: (pointer.y - stage.y()) / stage.scaleY(),
        };

        if (activeTool === 'add-link') {
            // ... (原本 add-link 的程式碼保留不動) ...
            if (!isDrawableCanvas(e.target)) return;

            // --- [修正重點]：將 parametric 模式與 standard 模式合併處理草圖線條 ---
            if (linkCreationSettings.mode === 'standard' || linkCreationSettings.mode === 'parametric' || !linkCreationSettings.mode) {
                if (!tempShape) {
                    tempShape = new Konva.Line({ points: [pos.x, pos.y, pos.x, pos.y], stroke: 'cyan', strokeWidth: 2, lineCap: 'round', lineJoin: 'round', listening: false });
                    layer.add(tempShape);
                } else {
                    const currentPoints = tempShape.points();
                    currentPoints[currentPoints.length - 2] = pos.x;
                    currentPoints[currentPoints.length - 1] = pos.y;
                    currentPoints.push(pos.x, pos.y);
                    tempShape.points(currentPoints);
                }
            }
            // --- 區分：Lane-Based 模式 ---
            else if (linkCreationSettings.mode === 'lane-based') {
                if (!tempShape) {
                    const style = STROKE_TYPES[draftCurrentStrokeType];
                    tempShape = new Konva.Line({
                        points: [pos.x, pos.y, pos.x, pos.y],
                        stroke: style.color,
                        strokeWidth: style.width / stage.scaleX(),
                        dash: style.dash,
                        listening: false
                    });
                    layer.add(tempShape);
                } else {
                    const currentPoints = tempShape.points();
                    currentPoints[currentPoints.length - 2] = pos.x;
                    currentPoints[currentPoints.length - 1] = pos.y;
                    currentPoints.push(pos.x, pos.y);
                    tempShape.points(currentPoints);
                }
            }
        }
        // ▼ 新增這段 append-lane-stroke 區塊 ▼
        else if (activeTool === 'append-lane-stroke') {
            if (!isDrawableCanvas(e.target)) return;

            if (!tempShape) {
                const style = STROKE_TYPES[draftCurrentStrokeType] || STROKE_TYPES['white_dashed'];
                tempShape = new Konva.Line({
                    points: [pos.x, pos.y, pos.x, pos.y],
                    stroke: style.color,
                    strokeWidth: style.width / stage.scaleX(),
                    dash: style.dash,
                    listening: false
                });
                layer.add(tempShape);
            } else {
                const currentPoints = tempShape.points();
                currentPoints[currentPoints.length - 2] = pos.x;
                currentPoints[currentPoints.length - 1] = pos.y;
                currentPoints.push(pos.x, pos.y);
                tempShape.points(currentPoints);
            }
        }
        // ▲ 新增區塊結束 ▲
        else if (activeTool === 'measure') {
            if (!isDrawableCanvas(e.target)) return; // <--- [修正] 允許在背景圖上繪製

            if (!tempShape) {
                const scale = 1 / stage.scaleX();
                tempShape = new Konva.Line({ points: [pos.x, pos.y, pos.x, pos.y], stroke: '#dc3545', strokeWidth: 2 / scale, listening: false });
                tempMeasureText = new Konva.Text({ x: pos.x, y: pos.y, text: '0.0 m', fontSize: 14, fill: '#dc3545', listening: false, scaleX: scale, scaleY: scale });
                layer.add(tempShape, tempMeasureText);
                tempShape.moveToTop();
                tempMeasureText.moveToTop();
            } else {
                const currentPoints = tempShape.points();
                currentPoints[currentPoints.length - 2] = pos.x;
                currentPoints[currentPoints.length - 1] = pos.y;
                currentPoints.push(pos.x, pos.y);
                tempShape.points(currentPoints);
                updateMeasurementVisuals();
            }
        } else if (activeTool === 'add-background') {
            if (!isDrawableCanvas(e.target)) return; // <--- [修正] 允許在背景圖上繪製
            const newBg = createBackground(pos);
            if (newBg) {
                selectObject(newBg);
                saveState();
            }
            setTool('select');
        }
        else if (activeTool === 'edit-tfl') {
            const clickedShape = e.target;
            if (clickedShape && clickedShape.id() && network.nodes[clickedShape.id()]) {
                const node = network.nodes[clickedShape.id()];
                showTrafficLightEditor(node);
                setTool('select');
            }
        } else if (activeTool === 'add-point-detector' || activeTool === 'add-section-detector') {
            const shape = stage.getIntersection(stage.getPointerPosition());
            if (shape && shape.parent && network.links[shape.parent.id()]) {
                const link = network.links[shape.parent.id()];
                let { dist } = projectPointOnPolyline(pos, link.waypoints);
                const newDet = createDetector(activeTool === 'add-point-detector' ? 'PointDetector' : 'SectionDetector', link, dist);
                if (newDet.type === 'SectionDetector') {
                    newDet.length = 20;
                    if (newDet.position < newDet.length) { newDet.position = newDet.length; }
                    drawDetector(newDet);
                }
                selectObject(newDet);
                saveState();
                setTool('select');
            }
        } else if (activeTool === 'add-road-sign') {
            const shape = stage.getIntersection(stage.getPointerPosition());
            if (shape && shape.parent && network.links[shape.parent.id()]) {
                const link = network.links[shape.parent.id()];
                let { dist } = projectPointOnPolyline(pos, link.waypoints);
                const newSign = createRoadSign(link, dist);
                selectObject(newSign);
                saveState();
                setTool('select');
            }
        } else if (activeTool === 'add-flow') {
            const clickedShape = e.target;
            let linkId = clickedShape.id();

            if (!network.links[linkId] && clickedShape.parent) {
                linkId = clickedShape.parent.id();
            }

            const link = network.links[linkId];

            if (link) {
                const linkLength = getPolylineLength(link.waypoints);
                const { dist } = projectPointOnPolyline(pos, link.waypoints);

                const hasOrigin = Object.values(network.origins).some(o => o.linkId === link.id);
                const hasDestination = Object.values(network.destinations).some(d => d.linkId === link.id);

                if (dist < linkLength / 2) {
                    if (hasOrigin) {
                        alert(I18N.t(`Link ${link.id} already has an Origin.`));
                        return;
                    }
                    const originPosition = Math.min(5, linkLength * 0.1);
                    const newOrigin = createOrigin(link, originPosition);
                    selectObject(newOrigin);
                    saveState();
                }
                else {
                    if (hasDestination) {
                        alert(I18N.t(`Link ${link.id} already has a Destination.`));
                        return;
                    }
                    const destPosition = Math.max(linkLength - 5, linkLength * 0.9);
                    const newDestination = createDestination(link, destPosition);
                    selectObject(newDestination);
                    saveState();
                }
                setTool('select');
            }
        } else if (activeTool === 'add-intersection') {
            if (!tempShape) {
                tempShape = new Konva.Line({
                    points: [pos.x, pos.y, pos.x, pos.y],
                    stroke: '#ff0000',
                    strokeWidth: 2,
                    closed: true,
                    fill: 'rgba(255, 0, 0, 0.2)',
                    listening: false
                });
                layer.add(tempShape);
            } else {
                const currentPoints = tempShape.points();
                currentPoints.splice(currentPoints.length - 2, 2, pos.x, pos.y, pos.x, pos.y);
                tempShape.points(currentPoints);
            }
            layer.batchDraw();
        } else if (activeTool === 'add-pushpin') {
            if (!isDrawableCanvas(e.target)) return; // <--- [修正] 允許在背景圖上繪製
            const newPin = createPushpin(pos);
            if (newPin) {
                selectObject(newPin);
                saveState();
                setTool('select');
            }
        } else if (activeTool === 'add-parking-lot') {
            if (!tempShape) {
                tempShape = new Konva.Line({
                    points: [pos.x, pos.y, pos.x, pos.y],
                    stroke: 'purple',
                    strokeWidth: 2,
                    closed: true,
                    fill: 'rgba(128, 0, 128, 0.2)',
                    listening: false
                });
                layer.add(tempShape);
            } else {
                const currentPoints = tempShape.points();
                currentPoints[currentPoints.length - 2] = pos.x;
                currentPoints[currentPoints.length - 1] = pos.y;
                currentPoints.push(pos.x, pos.y);
                tempShape.points(currentPoints);
            }
            layer.batchDraw();
        } else if (activeTool === 'add-zone') {
            if (!tempShape) {
                tempShape = new Konva.Line({
                    points: [pos.x, pos.y, pos.x, pos.y],
                    stroke: '#f59e0b',
                    strokeWidth: 2.5,
                    dash: [6, 3],
                    closed: true,
                    fill: 'rgba(245, 158, 11, 0.25)',
                    listening: false
                });
                layer.add(tempShape);
            } else {
                const currentPoints = tempShape.points();
                currentPoints[currentPoints.length - 2] = pos.x;
                currentPoints[currentPoints.length - 1] = pos.y;
                currentPoints.push(pos.x, pos.y);
                tempShape.points(currentPoints);
            }
            layer.batchDraw();
        } else if (activeTool === 'add-marking') {
            if (markingMode === 'channelization') {
                if (!tempShape) {
                    tempShape = new Konva.Line({
                        points: [pos.x, pos.y, pos.x, pos.y],
                        stroke: 'white', strokeWidth: 0.5, closed: true,
                        fill: 'rgba(255, 255, 255, 0.2)', listening: false
                    });
                    layer.add(tempShape);
                } else {
                    const currentPoints = tempShape.points();
                    currentPoints[currentPoints.length - 2] = pos.x;
                    currentPoints[currentPoints.length - 1] = pos.y;
                    currentPoints.push(pos.x, pos.y);
                    tempShape.points(currentPoints);
                }
                layer.batchDraw();
            } else {
                const clickedShape = e.target;
                let targetLink = null, targetNode = null;
                const clickedGroup = clickedShape.findAncestor('Group');
                if (clickedGroup) {
                    if (network.links[clickedGroup.id()]) targetLink = network.links[clickedGroup.id()];
                    else if (network.nodes[clickedGroup.id()]) targetNode = network.nodes[clickedGroup.id()];
                } else {
                    if (network.nodes[clickedShape.id()]) targetNode = network.nodes[clickedShape.id()];
                }
                if (targetLink) {
                    const { dist } = projectPointOnPolyline(pos, targetLink.waypoints);
                    const mk = createRoadMarking('stop_line', targetLink, dist);
                    selectObject(mk); saveState(); setTool('select');
                } else if (targetNode) {
                    const mk = createRoadMarking('two_stage_box', targetNode, pos);
                    selectObject(mk); saveState(); setTool('select');
                }
            }
        }
    }
    // 監聽雙擊事件以完成多邊形繪製
    document.addEventListener('dblclick', () => {
        if (activeTool === 'add-zone' && tempShape) {
            const rawPoints = tempShape.points();
            if (rawPoints.length >= 4) {
                rawPoints.pop();
                rawPoints.pop();
            }

            if (rawPoints.length < 6) {
                alert(I18N.t("Zone must have at least 3 points."));
                tempShape.destroy();
                tempShape = null;
                return;
            }

            const targetZone = (window.redrawingZone && network.zones[window.redrawingZone.id]) ? window.redrawingZone : null;
            window.redrawingZone = null;

            tempShape.destroy();
            tempShape = null;
            setTool('select');

            if (targetZone) {
                applyNewBoundaryToZone(targetZone, rawPoints);
            } else {
                const newZone = createZone(rawPoints);
                if (newZone) {
                    selectObject(newZone);
                }
            }
        } else if (activeTool === 'add-parking-lot' && tempShape) {
            // 完成繪製
            // 移除最後一個動態點（因為雙擊的第二次點擊通常是多餘的，或者重疊的）
            // 但為了簡單起見，我們直接拿目前所有點，過濾掉最後一組如果它太接近前一組

            const rawPoints = tempShape.points();
            // 移除最後一組跟隨滑鼠的點
            if (rawPoints.length >= 4) {
                rawPoints.pop();
                rawPoints.pop();
            }

            if (rawPoints.length < 6) { // 至少需要3個點 (6個座標值) 才能構成多邊形
                alert(I18N.t("Parking lot must have at least 3 points."));
                tempShape.destroy();
                tempShape = null;
                return;
            }

            createParkingLot(rawPoints);

            tempShape.destroy();
            tempShape = null;
            setTool('select');
        } else if (activeTool === 'add-marking' && markingMode === 'channelization' && tempShape) {
            // --- 新增：槽化線完成繪製 ---
            const rawPoints = tempShape.points();
            if (rawPoints.length >= 4) {
                rawPoints.pop(); rawPoints.pop(); // 移除最後一組游標跟隨點
            }
            if (rawPoints.length < 6) { // 最少需三個頂點
                alert(I18N.t("Channelization must have at least 3 points."));
                tempShape.destroy(); tempShape = null; return;
            }
            const mk = createRoadMarking('channelization', null, rawPoints);
            selectObject(mk);
            saveState();

            tempShape.destroy(); tempShape = null;
            setTool('select');
        }
    });

    function createParkingLot(points, autoSelect = true) {
        const id = window.generateId('parking');
        const parkingLot = {
            id,
            type: 'ParkingLot',
            points: points, // [x1, y1, x2, y2, ...]
            name: `Parking Lot ${idCounter}`,
            carCapacity: 0,
            motoCapacity: 0,
            attractionProb: 0, // <--- [新增] 初始化吸引機率，預設為 0%
            stayDuration: 0, // <--- [新增] 初始化停留時間 (分鐘)，預設為 0
            konvaHandles: [], // <--- 新增初始化空陣列
            konvaGroup: new Konva.Group({
                id, draggable: true, name: 'parking-lot-group'
            })
        };

        // 繪製多邊形
        // 計算邊界框以設定 Group 的位置，這樣旋轉和縮放才會正常運作
        const xs = points.filter((_, i) => i % 2 === 0);
        const ys = points.filter((_, i) => i % 2 === 1);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);

        // 將所有點轉換為相對於 Group 原點 (minX, minY) 的座標
        const localPoints = points.map((val, i) => {
            return (i % 2 === 0) ? val - minX : val - minY;
        });

        parkingLot.konvaGroup.position({ x: minX, y: minY });

        const polygon = new Konva.Line({
            points: localPoints,
            stroke: 'black',
            strokeWidth: 2,
            closed: true,
            fill: 'transparent', // 空心
            listening: true, // 必須設為 true 才能被點擊選取
            name: 'parking-lot-shape'
        });

        // 加入文字標籤
        const label = new Konva.Text({
            text: 'P',
            fontSize: 24,
            fontStyle: 'bold',
            fill: 'blue',
            x: (Math.max(...xs) - minX) / 2, // 簡易中心點
            y: (Math.max(...ys) - minY) / 2,
            name: 'parking-lot-label'
        });
        label.offsetX(label.width() / 2);
        label.offsetY(label.height() / 2);

        parkingLot.konvaGroup.add(polygon);
        parkingLot.konvaGroup.add(label);

        network.parkingLots[id] = parkingLot;
        layer.add(parkingLot.konvaGroup);

        if (autoSelect) selectObject(parkingLot);
        saveState();
        return parkingLot;
    }

    // --- 座標轉換輔助函數 (Group 相對於 Layer 的即時座標轉換) ---
    function getLocalPoint(group, layerPoint) {
        const transform = group.getTransform().copy();
        transform.invert();
        return transform.point(layerPoint);
    }

    function getAbsolutePoint(group, localPoint) {
        const transform = group.getTransform();
        return transform.point(localPoint);
    }

    function deleteParkingLot(id) {
        const pl = network.parkingLots[id];
        if (!pl) return;

        if (pl.konvaTransformer) {
            pl.konvaTransformer.destroy();
        }
        pl.konvaGroup.destroy();
        delete network.parkingLots[id];
    }

    function drawChannelizationHandles(marking) {
        destroyChannelizationHandles(marking);
        const group = marking.konvaGroup;

        // 抓取初始的多邊形來建立控制點
        const initialPolygon = group.findOne('.marking-shape');
        if (!initialPolygon) return;

        const polyPoints = initialPolygon.points();
        marking.konvaHandles = [];
        const scale = 1 / stage.scaleX();

        for (let i = 0; i < polyPoints.length; i += 2) {
            const layerPos = group.getTransform().point({ x: polyPoints[i], y: polyPoints[i + 1] });

            const handle = new Konva.Circle({
                x: layerPos.x, y: layerPos.y, radius: 6, fill: '#00d2ff', stroke: 'white',
                strokeWidth: 2 * scale, draggable: true, name: 'channelization-vertex-handle',
                scaleX: scale, scaleY: scale
            });

            handle.setAttr('vertexIndex', i);
            handle.on('dragmove', (e) => {
                // 【修正重點】每次拖曳時都即時去群組裡尋找最新的多邊形，避免操作到被刪除的舊圖形
                const currentPolygon = group.findOne('.marking-shape');
                if (!currentPolygon) return;

                const newLocal = group.getTransform().copy().invert().point({ x: e.target.x(), y: e.target.y() });

                const currentPoints = currentPolygon.points();
                const idx = e.target.getAttr('vertexIndex');
                currentPoints[idx] = newLocal.x;
                currentPoints[idx + 1] = newLocal.y;
                currentPolygon.points(currentPoints); // 更新畫面

                if (marking.konvaTransformer) marking.konvaTransformer.forceUpdate();

                // 更新背後的資料模型
                const newGlobalPos = group.getTransform().point(newLocal);
                marking.points[idx] = newGlobalPos.x;
                marking.points[idx + 1] = newGlobalPos.y;
            });
            handle.on('dragend', () => saveState());

            layer.add(handle);
            marking.konvaHandles.push(handle);
        }
        marking.konvaHandles.forEach(h => h.moveToTop());
        layer.batchDraw();
    }
    function updateChannelizationHandlePositions(marking) {
        if (!marking.konvaHandles) return;
        const group = marking.konvaGroup;
        const polygon = group.findOne('.marking-shape');
        if (!polygon) return;

        const points = polygon.points();
        marking.konvaHandles.forEach(handle => {
            const idx = handle.getAttr('vertexIndex');
            // 【修正】取得相對 Layer 的即時座標
            const layerPos = group.getTransform().point({ x: points[idx], y: points[idx + 1] });
            handle.position(layerPos);
            marking.points[idx] = layerPos.x;
            marking.points[idx + 1] = layerPos.y;
        });
    }

    function destroyChannelizationHandles(marking) {
        if (marking && marking.konvaHandles) {
            marking.konvaHandles.forEach(handle => handle.destroy());
            marking.konvaHandles = [];
        }
    }

    // --- 修改：繪製停車場頂點控制點 (改為放在 Layer 上，確保可點擊) ---
    function drawParkingLotHandles(parkingLot) {
        destroyParkingLotHandles(parkingLot); // 先清除舊的

        const group = parkingLot.konvaGroup;
        const polygon = group.findOne('.parking-lot-shape');
        if (!polygon) return;

        const points = polygon.points(); // 這是相對於群組的座標
        parkingLot.konvaHandles = [];

        // 縮放比例 (用於保持控制點視覺大小一致)
        const scale = 1 / stage.scaleX();

        for (let i = 0; i < points.length; i += 2) {
            const localX = points[i];
            const localY = points[i + 1];

            // 算出絕對座標，將點放在 Layer 上
            const absPos = getAbsolutePoint(group, { x: localX, y: localY });

            const handle = new Konva.Circle({
                x: absPos.x,
                y: absPos.y,
                radius: 8, // 半徑設大一點，確保比變形框的錨點好點選
                fill: '#ff00ff', // 紫色
                stroke: 'white',
                strokeWidth: 2,
                draggable: true,
                name: 'parking-vertex-handle',
                scaleX: scale,
                scaleY: scale
            });

            // 儲存對應的多邊形頂點索引
            handle.setAttr('vertexIndex', i);

            handle.on('dragmove', (e) => {
                // 將 Handle 的新絕對座標轉回 Group 的相對座標
                const node = e.target;
                const newLocal = getLocalPoint(group, { x: node.x(), y: node.y() });

                const currentPoints = polygon.points();
                const idx = node.getAttr('vertexIndex');
                currentPoints[idx] = newLocal.x;
                currentPoints[idx + 1] = newLocal.y;

                polygon.points(currentPoints);

                // 強制更新 Transformer (因為邊界變了)
                if (parkingLot.konvaTransformer) {
                    parkingLot.konvaTransformer.forceUpdate();
                }
            });

            // 加到 Layer 而不是 Group，確保層級最高
            layer.add(handle);
            parkingLot.konvaHandles.push(handle);
        }

        // 確保控制點在最上層 (包含蓋過 Transformer)
        parkingLot.konvaHandles.forEach(h => h.moveToTop());
        layer.batchDraw();
    }

    // --- 新增：更新控制點位置 (用於群組移動時) ---
    function updateParkingLotHandlePositions(parkingLot) {
        if (!parkingLot.konvaHandles) return;
        const group = parkingLot.konvaGroup;
        const polygon = group.findOne('.parking-lot-shape');
        const points = polygon.points();

        parkingLot.konvaHandles.forEach(handle => {
            const idx = handle.getAttr('vertexIndex');
            const localX = points[idx];
            const localY = points[idx + 1];
            // 重新計算絕對位置
            const absPos = getAbsolutePoint(group, { x: localX, y: localY });
            handle.position(absPos);
        });
    }

    // --- 新增：移除停車場頂點控制點 ---
    function destroyParkingLotHandles(parkingLot) {
        if (parkingLot && parkingLot.konvaHandles) {
            parkingLot.konvaHandles.forEach(handle => handle.destroy());
            parkingLot.konvaHandles = [];
        }
    }

    // ============================================================
    // === 土地使用分區 (Land Use Zoning System - Milestone 1) ===
    // ============================================================

    const ZONE_CONFIGS = {
        'R1': {
            name: '低密度住宅區',
            enName: 'Low-Density Residential',
            category: 'R',
            bcr: 0.50,
            far: 1.20,
            unitPop: 35, // m2/人
            unitEmp: 0,
            fillColor: 'rgba(255, 215, 0, 0.40)',
            strokeColor: '#d4af37',
            textColor: '#785f00',
            desc: '低層獨立式/透天住宅，通勤尖峰方向性強'
        },
        'R2': {
            name: '中密度住宅區',
            enName: 'Medium-Density Residential',
            category: 'R',
            bcr: 0.60,
            far: 2.40,
            unitPop: 30,
            unitEmp: 0,
            fillColor: 'rgba(255, 195, 0, 0.42)',
            strokeColor: '#cda800',
            textColor: '#785f00',
            desc: '雙拼與中層公寓住宅，汽機車與短途步行混合'
        },
        'R3': {
            name: '高密度住宅區',
            enName: 'High-Density Residential',
            category: 'R',
            bcr: 0.50,
            far: 4.00,
            unitPop: 25,
            unitEmp: 0,
            fillColor: 'rgba(255, 165, 0, 0.45)',
            strokeColor: '#b87800',
            textColor: '#6b3c00',
            desc: '高層集合住宅/電梯大樓，大眾運輸與步行依賴度高'
        },
        'C1': {
            name: '鄰里商業區',
            enName: 'Neighborhood Commercial',
            category: 'C',
            bcr: 0.60,
            far: 2.40,
            unitPop: 0,
            unitEmp: 25, // m2/崗位
            fillColor: 'rgba(240, 90, 90, 0.40)',
            strokeColor: '#d93838',
            textColor: '#8a1a1a',
            desc: '街角店鋪與日常消費商場，高步行比例'
        },
        'C2': {
            name: '核心商業區 (CBD)',
            enName: 'Central Business District (CBD)',
            category: 'C',
            bcr: 0.70,
            far: 6.00,
            unitPop: 0,
            unitEmp: 18,
            fillColor: 'rgba(235, 55, 55, 0.45)',
            strokeColor: '#c0392b',
            textColor: '#78120c',
            desc: '辦公摩天大樓，早晨強烈吸引、傍晚強烈產生'
        },
        'C3': {
            name: '區域商場/娛樂',
            enName: 'Regional Commercial / Mall',
            category: 'C',
            bcr: 0.60,
            far: 3.60,
            unitPop: 0,
            unitEmp: 30,
            fillColor: 'rgba(236, 72, 153, 0.40)',
            strokeColor: '#db2777',
            textColor: '#831843',
            desc: '巨型購物中心/綜合娛樂城，午後與夜間吸引尖峰'
        },
        'I': {
            name: '科技產業/輕工業',
            enName: 'Industrial / Tech',
            category: 'I',
            bcr: 0.60,
            far: 2.10,
            unitPop: 0,
            unitEmp: 40,
            fillColor: 'rgba(168, 85, 247, 0.40)',
            strokeColor: '#9333ea',
            textColor: '#581c87',
            desc: '廠辦與物流，貨客混合，固定上下工時段'
        },
        'G1': {
            name: '各級學校/文教',
            enName: 'Schools / Institutional',
            category: 'G',
            bcr: 0.50,
            far: 1.50,
            unitPop: 0,
            unitEmp: 0,
            unitStudent: 15,
            fillColor: 'rgba(59, 130, 246, 0.40)',
            strokeColor: '#2563eb',
            textColor: '#1e3a8a',
            desc: '早晨上學超尖峰，接送與通學步行流'
        },
        'G2': {
            name: '機關/醫療院所',
            enName: 'Government / Hospital',
            category: 'G',
            bcr: 0.50,
            far: 3.00,
            unitPop: 0,
            unitEmp: 22,
            fillColor: 'rgba(14, 165, 233, 0.40)',
            strokeColor: '#0284c7',
            textColor: '#0c4a6e',
            desc: '全天穩定行政/門診車流，短暫停車需求大'
        },
        'P': {
            name: '公園綠地/廣場',
            enName: 'Park / Public Space',
            category: 'P',
            bcr: 0.10,
            far: 0.20,
            unitPop: 0,
            unitEmp: 0,
            fillColor: 'rgba(34, 197, 94, 0.40)',
            strokeColor: '#16a34a',
            textColor: '#14532d',
            desc: '純休憩吸引源，主要為步行與機車慢行旅次'
        }
    };

    /**
     * 計算多邊形面積 (Shoelace formula，單位：平方公尺 m²)
     */
    function calculatePolygonArea(points) {
        if (!points || points.length < 6) return 0;
        let area = 0;
        const n = points.length / 2;
        for (let i = 0; i < n; i++) {
            const x0 = points[i * 2];
            const y0 = points[i * 2 + 1];
            const nextIdx = (i + 1) % n;
            const x1 = points[nextIdx * 2];
            const y1 = points[nextIdx * 2 + 1];
            area += (x0 * y1 - x1 * y0);
        }
        return Math.abs(area * 0.5);
    }

    /**
     * 計算多邊形形心 (Centroid Cx, Cy)
     */
    function calculateCentroid(points) {
        if (!points || points.length < 6) {
            return { x: (points && points[0]) || 0, y: (points && points[1]) || 0 };
        }
        let signedArea = 0;
        let cx = 0;
        let cy = 0;
        const n = points.length / 2;

        for (let i = 0; i < n; i++) {
            const x0 = points[i * 2];
            const y0 = points[i * 2 + 1];
            const nextIdx = (i + 1) % n;
            const x1 = points[nextIdx * 2];
            const y1 = points[nextIdx * 2 + 1];
            const cross = (x0 * y1 - x1 * y0);
            signedArea += cross;
            cx += (x0 + x1) * cross;
            cy += (y0 + y1) * cross;
        }

        signedArea = signedArea * 0.5;
        if (Math.abs(signedArea) < 1e-4) {
            let sumX = 0, sumY = 0;
            for (let i = 0; i < points.length; i += 2) {
                sumX += points[i];
                sumY += points[i + 1];
            }
            return { x: sumX / n, y: sumY / n };
        }

        return {
            x: cx / (6 * signedArea),
            y: cy / (6 * signedArea)
        };
    }

    /**
     * 推估常住人口與就業崗位規模 (Socio-Economic Engine)
     */
    function estimateSocioEconomic(zoneType, gfa) {
        const cfg = ZONE_CONFIGS[zoneType] || ZONE_CONFIGS['R1'];
        let pop = 0;
        let emp = 0;

        if (cfg.category === 'R') {
            const etaRes = 0.85;
            pop = Math.round((gfa * etaRes) / (cfg.unitPop || 30));
        } else if (cfg.category === 'C' || cfg.category === 'I') {
            const etaJob = 0.80;
            emp = Math.round((gfa * etaJob) / (cfg.unitEmp || 25));
        } else if (zoneType === 'G1') {
            const etaRes = 0.85;
            pop = Math.round((gfa * etaRes) / 15); // 学生人數
        } else if (zoneType === 'G2') {
            const etaJob = 0.80;
            emp = Math.round((gfa * etaJob) / 22);
        }
        return { pop, emp };
    }

    /**
     * 推估尖離峰產生量與吸引量 (Trip Generation Engine)
     */
    function estimatePeakTrips(zoneType, pop, emp, gfa) {
        const cfg = ZONE_CONFIGS[zoneType] || ZONE_CONFIGS['R1'];
        let amP = 0, amA = 0, pmP = 0, pmA = 0, offP = 0, offA = 0;

        if (cfg.category === 'R') {
            const base = pop;
            const amTrips = base * 0.45;
            amP = Math.round(amTrips * 0.85);
            amA = Math.round(amTrips * 0.15);
            const pmTrips = base * 0.50;
            pmP = Math.round(pmTrips * 0.20);
            pmA = Math.round(pmTrips * 0.80);
            const offTrips = base * 0.12;
            offP = Math.round(offTrips * 0.50);
            offA = Math.round(offTrips * 0.50);
        } else if (zoneType === 'C2') {
            const base = emp;
            const amTrips = base * 0.65;
            amP = Math.round(amTrips * 0.10);
            amA = Math.round(amTrips * 0.90);
            const pmTrips = base * 0.70;
            pmP = Math.round(pmTrips * 0.85);
            pmA = Math.round(pmTrips * 0.15);
            const offTrips = base * 0.15;
            offP = Math.round(offTrips * 0.45);
            offA = Math.round(offTrips * 0.55);
        } else if (zoneType === 'C1') {
            const base = emp;
            const amTrips = base * 0.40;
            amP = Math.round(amTrips * 0.30);
            amA = Math.round(amTrips * 0.70);
            const pmTrips = base * 0.60;
            pmP = Math.round(pmTrips * 0.60);
            pmA = Math.round(pmTrips * 0.40);
            const offTrips = base * 0.15;
            offP = Math.round(offTrips * 0.50);
            offA = Math.round(offTrips * 0.50);
        } else if (zoneType === 'C3') {
            const base = gfa / 100;
            const amTrips = base * 1.20;
            amP = Math.round(amTrips * 0.30);
            amA = Math.round(amTrips * 0.70);
            const pmTrips = base * 3.50;
            pmP = Math.round(pmTrips * 0.45);
            pmA = Math.round(pmTrips * 0.55);
            const offTrips = base * 1.80;
            offP = Math.round(offTrips * 0.50);
            offA = Math.round(offTrips * 0.50);
        } else if (cfg.category === 'I') {
            const base = emp;
            const amTrips = base * 0.55;
            amP = Math.round(amTrips * 0.15);
            amA = Math.round(amTrips * 0.85);
            const pmTrips = base * 0.60;
            pmP = Math.round(pmTrips * 0.85);
            pmA = Math.round(pmTrips * 0.15);
            const offTrips = base * 0.12;
            offP = Math.round(offTrips * 0.50);
            offA = Math.round(offTrips * 0.50);
        } else if (zoneType === 'G1') {
            const base = pop; // 学生
            const amTrips = base * 0.80;
            amP = Math.round(amTrips * 0.15);
            amA = Math.round(amTrips * 0.85);
            const pmTrips = base * 0.75;
            pmP = Math.round(pmTrips * 0.85);
            pmA = Math.round(pmTrips * 0.15);
            const offTrips = base * 0.05;
            offP = Math.round(offTrips * 0.50);
            offA = Math.round(offTrips * 0.50);
        } else if (zoneType === 'G2') {
            const base = emp;
            const amTrips = base * 0.50;
            amP = Math.round(amTrips * 0.25);
            amA = Math.round(amTrips * 0.75);
            const pmTrips = base * 0.50;
            pmP = Math.round(pmTrips * 0.70);
            pmA = Math.round(pmTrips * 0.30);
            const offTrips = base * 0.10;
            offP = Math.round(offTrips * 0.50);
            offA = Math.round(offTrips * 0.50);
        } else if (cfg.category === 'P') {
            const base = gfa / 100;
            const amTrips = base * 0.05;
            amP = Math.round(amTrips * 0.50);
            amA = Math.round(amTrips * 0.50);
            const pmTrips = base * 0.10;
            pmP = Math.round(pmTrips * 0.50);
            pmA = Math.round(pmTrips * 0.50);
            const offTrips = base * 0.05;
            offP = Math.round(offTrips * 0.50);
            offA = Math.round(offTrips * 0.50);
        }

        return { amP, amA, pmP, pmA, offP, offA };
    }

    /**
     * 產出分區畫布標籤文字
     */
    function getZoneDisplayText(zone) {
        const polygon = zone.konvaGroup ? zone.konvaGroup.findOne('.zone-shape') : null;
        const pts = polygon ? polygon.points() : (zone.points || []);
        const siteArea = calculatePolygonArea(pts);
        const bcr = zone.bcr !== undefined ? zone.bcr : 0.5;
        const far = zone.far !== undefined ? zone.far : 1.2;
        const floors = Math.max(1, Math.ceil(far / bcr));
        const gfa = siteArea * far;
        const { pop: autoPop, emp: autoEmp } = estimateSocioEconomic(zone.zoneType, gfa);
        const effPop = (zone.customPop !== null && zone.customPop !== undefined && zone.customPop !== '' && !isNaN(zone.customPop)) ? zone.customPop : autoPop;
        const effEmp = (zone.customEmp !== null && zone.customEmp !== undefined && zone.customEmp !== '' && !isNaN(zone.customEmp)) ? zone.customEmp : autoEmp;
        const trips = estimatePeakTrips(zone.zoneType, effPop, effEmp, gfa);

        const lines = [];
        lines.push(`${zone.name || zone.id} [${zone.zoneType}]`);
        lines.push(`FAR: ${(far * 100).toFixed(0)}% | BCR: ${(bcr * 100).toFixed(0)}%`);
        lines.push(`Floors: ${floors}F (${siteArea.toFixed(0)} m²)`);
        if (effPop > 0) lines.push(`Pop: ${effPop}`);
        if (effEmp > 0) lines.push(`Jobs: ${effEmp}`);
        lines.push(`AM: P${trips.amP}/A${trips.amA} | PM: P${trips.pmP}/A${trips.pmA}`);
        return lines.join('\n');
    }

    /**
     * 建立土地使用分區物件
     */
    function createZone(points, autoSelect = true, customId = null) {
        const cleanedPoints = [];
        for (let i = 0; i < points.length; i += 2) {
            const px = parseFloat(points[i]);
            const py = parseFloat(points[i + 1]);
            if (!isNaN(px) && !isNaN(py)) {
                cleanedPoints.push(px, py);
            }
        }
        if (cleanedPoints.length < 6) return null;

        const id = customId || window.generateId('zone');
        const defaultType = 'R1';
        const config = ZONE_CONFIGS[defaultType] || ZONE_CONFIGS['R1'];

        const xs = [];
        const ys = [];
        for (let i = 0; i < cleanedPoints.length; i += 2) {
            xs.push(cleanedPoints[i]);
            ys.push(cleanedPoints[i + 1]);
        }
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);

        const localPoints = [];
        for (let i = 0; i < cleanedPoints.length; i += 2) {
            localPoints.push(cleanedPoints[i] - minX, cleanedPoints[i + 1] - minY);
        }

        const zone = {
            id,
            name: `Zone ${id.replace(/[^0-9]/g, '') || idCounter}`,
            type: 'Zone',
            zoneType: defaultType,
            points: [...localPoints],
            bcr: config.bcr,
            far: config.far,
            customPop: null,
            customEmp: null,
            autoCalculateTraffic: true,
            accessNodes: [],
            konvaHandles: [],
            konvaGroup: new Konva.Group({
                id,
                x: minX,
                y: minY,
                draggable: false,
                name: 'zone-group'
            })
        };

        const polygon = new Konva.Line({
            points: localPoints,
            stroke: config.strokeColor,
            strokeWidth: 2.5,
            closed: true,
            fill: config.fillColor,
            listening: true,
            name: 'zone-shape'
        });

        const centroid = calculateCentroid(localPoints);
        const label = new Konva.Text({
            text: getZoneDisplayText(zone),
            fontSize: 13,
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'bold',
            fill: config.textColor,
            align: 'center',
            name: 'zone-label',
            listening: false,
            shadowColor: 'white',
            shadowBlur: 3,
            shadowOpacity: 0.9,
            x: centroid.x,
            y: centroid.y
        });
        label.offsetX(label.width() / 2);
        label.offsetY(label.height() / 2);

        zone.konvaGroup.add(polygon);
        zone.konvaGroup.add(label);

        network.zones[id] = zone;
        layer.add(zone.konvaGroup);

        // 土地分區置於路網下方，但保持在背景圖片之上
        zone.konvaGroup.moveToBottom();
        if (network.backgrounds) {
            Object.values(network.backgrounds).forEach(bg => {
                if (bg.konvaGroup) bg.konvaGroup.moveToBottom();
            });
        }

        // ★★★ [Milestone 3] 自動產生形心聯絡道並繪製 ★★★
        autoGenerateCentroidConnectors(zone);
        updateZoneConnectorsVisual(zone);

        if (autoSelect) {
            selectObject(zone);
        }
        saveState();
        layer.batchDraw();
        return zone;
    }

    /**
     * ★★★ [Milestone 3] 自動搜尋最近道路並建立形心聯絡道拓撲 (Centroid Connector Projection) ★★★
     */
    function autoGenerateCentroidConnectors(zone) {
        if (!zone) return;
        if (!network.links || Object.keys(network.links).length === 0) {
            zone.accessNodes = [];
            return;
        }

        const group = zone.konvaGroup;
        const gx = group ? group.x() : 0;
        const gy = group ? group.y() : 0;
        const sx = group ? (group.scaleX() || 1) : 1;
        const sy = group ? (group.scaleY() || 1) : 1;

        const polygon = group ? group.findOne('.zone-shape') : null;
        const localPts = polygon ? polygon.points() : (zone.points || []);
        if (!localPts || localPts.length < 6) return;

        // 計算絕對座標多邊形頂點
        const absVertices = [];
        for (let i = 0; i < localPts.length; i += 2) {
            absVertices.push({
                x: gx + localPts[i] * sx,
                y: gy + localPts[i + 1] * sy
            });
        }

        // 沿邊界採樣測試點 (以約 10~15m 間距採樣)
        const sampledPoints = [];
        const n = absVertices.length;
        for (let i = 0; i < n; i++) {
            const p1 = absVertices[i];
            const p2 = absVertices[(i + 1) % n];
            const segLen = vecLen(getVector(p1, p2));
            const steps = Math.max(1, Math.min(10, Math.ceil(segLen / 12)));
            for (let s = 0; s < steps; s++) {
                const t = s / steps;
                sampledPoints.push({
                    x: p1.x + t * (p2.x - p1.x),
                    y: p1.y + t * (p2.y - p1.y)
                });
            }
        }

        let minDist = Infinity;
        let bestLink = null;
        let bestAccessPt = null;
        let bestProjDist = 0;

        // 搜尋周邊道路 Link
        Object.values(network.links).forEach(link => {
            if (!link.waypoints || link.waypoints.length < 2) return;
            sampledPoints.forEach(bp => {
                const proj = projectPointOnPolyline(bp, link.waypoints);
                if (proj.pointDist < minDist) {
                    minDist = proj.pointDist;
                    bestLink = link;
                    bestAccessPt = bp;
                    bestProjDist = proj.dist;
                }
            });
        });

        if (bestLink) {
            const linkLen = getPolylineLength(bestLink.waypoints);
            const offsetRatio = Math.max(0, Math.min(1, bestProjDist / Math.max(0.001, linkLen)));
            const connId = (zone.accessNodes && zone.accessNodes[0] && zone.accessNodes[0].id) || `conn_${zone.id}_1`;
            zone.accessNodes = [{
                id: connId,
                linkId: bestLink.id,
                offsetRatio: offsetRatio,
                gateType: 'bidirectional',
                accessPoint: { x: bestAccessPt.x, y: bestAccessPt.y }
            }];
        } else {
            zone.accessNodes = [];
        }
    }

    /**
     * ★★★ [Milestone 3] 繪製與更新分區形心聯絡道視覺 (橘色形心、邊界開口與道路投影虛線) ★★★
     */
    function updateZoneConnectorsVisual(zone) {
        if (!zone || !zone.konvaGroup) return;
        const group = zone.konvaGroup;
        // 清理現存聯絡道視覺物件
        group.find('.zone-connector').forEach(node => node.destroy());

        if (!zone.accessNodes || zone.accessNodes.length === 0) {
            autoGenerateCentroidConnectors(zone);
        }

        const polygon = group.findOne('.zone-shape');
        const localPts = polygon ? polygon.points() : (zone.points || []);
        if (!localPts || localPts.length < 6) return;

        const gx = group.x();
        const gy = group.y();
        const sx = group.scaleX() || 1;
        const sy = group.scaleY() || 1;

        const localCentroid = calculateCentroid(localPts);

        // 1. 繪製形心點 (橘色圓形)
        const centroidCircle = new Konva.Circle({
            x: localCentroid.x,
            y: localCentroid.y,
            radius: 5 / sx,
            fill: '#f59e0b',
            stroke: '#ffffff',
            strokeWidth: 2 / sx,
            name: 'zone-connector',
            listening: false,
            shadowColor: 'rgba(0,0,0,0.5)',
            shadowBlur: 3
        });
        group.add(centroidCircle);

        // 2. 繪製聯絡道至道路
        if (zone.accessNodes && zone.accessNodes.length > 0) {
            zone.accessNodes.forEach(conn => {
                const targetLink = network.links[conn.linkId];
                if (!targetLink || !targetLink.waypoints || targetLink.waypoints.length < 2) return;

                const linkLen = getPolylineLength(targetLink.waypoints);
                const alongDist = (conn.offsetRatio !== undefined ? conn.offsetRatio : 0.5) * linkLen;
                const roadPtAbs = getPointAlongPolyline(targetLink.waypoints, alongDist).point;

                const roadPtLocal = {
                    x: (roadPtAbs.x - gx) / sx,
                    y: (roadPtAbs.y - gy) / sy
                };

                const accPtAbs = conn.accessPoint || {
                    x: gx + localCentroid.x * sx,
                    y: gy + localCentroid.y * sy
                };
                const accPtLocal = {
                    x: (accPtAbs.x - gx) / sx,
                    y: (accPtAbs.y - gy) / sy
                };

                // 形心 -> 邊界出入口 (橘色虛線)
                const line1 = new Konva.Line({
                    points: [localCentroid.x, localCentroid.y, accPtLocal.x, accPtLocal.y],
                    stroke: '#f59e0b',
                    strokeWidth: 2 / sx,
                    dash: [5 / sx, 4 / sx],
                    name: 'zone-connector',
                    listening: false
                });
                group.add(line1);

                // 邊界出入口標記 (圓點)
                const accessDot = new Konva.Circle({
                    x: accPtLocal.x,
                    y: accPtLocal.y,
                    radius: 4 / sx,
                    fill: '#f59e0b',
                    stroke: '#ffffff',
                    strokeWidth: 1.5 / sx,
                    name: 'zone-connector',
                    listening: false
                });
                group.add(accessDot);

                // 邊界出入口 -> 道路投影點 (深橘色/紅色虛線)
                const line2 = new Konva.Line({
                    points: [accPtLocal.x, accPtLocal.y, roadPtLocal.x, roadPtLocal.y],
                    stroke: '#ea580c',
                    strokeWidth: 2.2 / sx,
                    dash: [6 / sx, 3 / sx],
                    name: 'zone-connector',
                    listening: false
                });
                group.add(line2);

                // 道路接入點標記 (實心圓)
                const roadDot = new Konva.Circle({
                    x: roadPtLocal.x,
                    y: roadPtLocal.y,
                    radius: 5 / sx,
                    fill: '#ea580c',
                    stroke: '#ffffff',
                    strokeWidth: 2 / sx,
                    name: 'zone-connector',
                    listening: false
                });
                group.add(roadDot);
            });
        }
    }

    /**
     * 更新分區視覺呈現 (填色、邊線、標籤、中心點)
     */
    function updateZoneVisuals(zone, updateHandles = true) {
        if (!zone || !zone.konvaGroup) return;
        const config = ZONE_CONFIGS[zone.zoneType] || ZONE_CONFIGS['R1'];
        const polygon = zone.konvaGroup.findOne('.zone-shape');
        const label = zone.konvaGroup.findOne('.zone-label');

        if (polygon) {
            polygon.fill(config.fillColor);
            polygon.stroke(config.strokeColor);
        }

        if (label && polygon) {
            const pts = polygon.points();
            const centroid = calculateCentroid(pts);
            label.text(getZoneDisplayText(zone));
            label.fill(config.textColor);
            label.position({ x: centroid.x, y: centroid.y });
            label.offsetX(label.width() / 2);
            label.offsetY(label.height() / 2);
        }

        if (updateHandles && zone.konvaHandles && zone.konvaHandles.length > 0) {
            updateZoneHandlePositions(zone);
        }

        // ★ [Milestone 3] 同步更新形心聯絡道視覺
        updateZoneConnectorsVisual(zone);

        layer.batchDraw();
    }

    /**
     * 繪製分區頂點錨點控制點 (放置於 Layer 確保精確操作)
     * - 橘色圓點：既有頂點，可拖曳移動，連按兩下可刪除頂點 (至少保留 3 頂點)
     * - 黃色小點：邊的中點，拖曳即可在該位置插入新頂點
     */
    function drawZoneHandles(zone) {
        destroyZoneHandles(zone);

        const group = zone.konvaGroup;
        if (!group) return;
        const polygon = group.findOne('.zone-shape');
        if (!polygon) return;

        const points = polygon.points();
        zone.konvaHandles = [];

        const scale = 1 / stage.scaleX();

        // 1. 繪製各頂點控制點 (橘色圓形，半徑 8)
        for (let i = 0; i < points.length; i += 2) {
            const localX = points[i];
            const localY = points[i + 1];
            const absPos = getAbsolutePoint(group, { x: localX, y: localY });

            const handle = new Konva.Circle({
                x: absPos.x,
                y: absPos.y,
                radius: 8,
                fill: '#f59e0b',
                stroke: 'white',
                strokeWidth: 2 * scale,
                draggable: true,
                name: 'zone-vertex-handle',
                scaleX: scale,
                scaleY: scale,
                shadowColor: 'rgba(0,0,0,0.3)',
                shadowBlur: 4,
                shadowOffset: { x: 0, y: 1 }
            });

            handle.setAttr('vertexIndex', i);

            handle.on('mouseenter', () => { stage.container().style.cursor = 'move'; });
            handle.on('mouseleave', () => {
                if (activeTool === 'select') stage.container().style.cursor = 'default';
            });

            handle.on('dragmove', (e) => {
                const node = e.target;
                const newLocal = getLocalPoint(group, { x: node.x(), y: node.y() });

                const currentPoints = polygon.points();
                const idx = node.getAttr('vertexIndex');
                currentPoints[idx] = newLocal.x;
                currentPoints[idx + 1] = newLocal.y;

                polygon.points(currentPoints);
                zone.points = [...currentPoints];

                updateZoneVisuals(zone, false);

                if (selectedObject && selectedObject.id === zone.id) {
                    updatePropertiesPanelDynamicValues(zone);
                }
            });

            handle.on('dragend', () => {
                autoGenerateCentroidConnectors(zone);
                updateZoneVisuals(zone, true);
                drawZoneHandles(zone);
                if (selectedObject && selectedObject.id === zone.id) {
                    updatePropertiesPanel(zone);
                }
                saveState();
            });

            // 雙擊頂點以刪除該頂點 (維持至少 3 個頂點 / 6 個座標值)
            handle.on('dblclick', (e) => {
                e.cancelBubble = true;
                const currentPoints = polygon.points();
                if (currentPoints.length <= 6) {
                    alert(I18N.t("Zone must have at least 3 points."));
                    return;
                }
                const idx = handle.getAttr('vertexIndex');
                currentPoints.splice(idx, 2);
                polygon.points(currentPoints);
                zone.points = [...currentPoints];

                autoGenerateCentroidConnectors(zone);
                updateZoneVisuals(zone, true);
                drawZoneHandles(zone);
                if (selectedObject && selectedObject.id === zone.id) {
                    updatePropertiesPanel(zone);
                }
                saveState();
            });

            layer.add(handle);
            zone.konvaHandles.push(handle);
        }

        // 2. 繪製邊的中點控制點 (黃色小圓形，半徑 5，拖曳即可新增頂點)
        for (let i = 0; i < points.length; i += 2) {
            const nextIdx = (i + 2 < points.length) ? i + 2 : 0;
            const x1 = points[i];
            const y1 = points[i + 1];
            const x2 = points[nextIdx];
            const y2 = points[nextIdx + 1];

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const midAbsPos = getAbsolutePoint(group, { x: mx, y: my });

            const midHandle = new Konva.Circle({
                x: midAbsPos.x,
                y: midAbsPos.y,
                radius: 5,
                fill: '#fbbf24',
                stroke: 'white',
                strokeWidth: 1.5 * scale,
                draggable: true,
                name: 'zone-midpoint-handle',
                scaleX: scale,
                scaleY: scale,
                opacity: 0.85
            });

            midHandle.setAttr('edgeStartIndex', i);

            midHandle.on('mouseenter', () => { stage.container().style.cursor = 'crosshair'; });
            midHandle.on('mouseleave', () => {
                if (activeTool === 'select') stage.container().style.cursor = 'default';
            });

            midHandle.on('dragstart', (e) => {
                const currentPoints = polygon.points();
                const insertIdx = (i + 2 <= currentPoints.length) ? i + 2 : currentPoints.length;
                const newLocal = getLocalPoint(group, { x: e.target.x(), y: e.target.y() });
                currentPoints.splice(insertIdx, 0, newLocal.x, newLocal.y);
                polygon.points(currentPoints);
                zone.points = [...currentPoints];
                e.target.setAttr('vertexIndex', insertIdx);
            });

            midHandle.on('dragmove', (e) => {
                const node = e.target;
                const newLocal = getLocalPoint(group, { x: node.x(), y: node.y() });
                const currentPoints = polygon.points();
                const idx = node.getAttr('vertexIndex');
                currentPoints[idx] = newLocal.x;
                currentPoints[idx + 1] = newLocal.y;
                polygon.points(currentPoints);
                zone.points = [...currentPoints];
                updateZoneVisuals(zone, false);
                if (selectedObject && selectedObject.id === zone.id) {
                    updatePropertiesPanelDynamicValues(zone);
                }
            });

            midHandle.on('dragend', () => {
                autoGenerateCentroidConnectors(zone);
                updateZoneVisuals(zone, true);
                drawZoneHandles(zone);
                if (selectedObject && selectedObject.id === zone.id) {
                    updatePropertiesPanel(zone);
                }
                saveState();
            });

            layer.add(midHandle);
            zone.konvaHandles.push(midHandle);
        }

        zone.konvaHandles.forEach(h => h.moveToTop());
        layer.batchDraw();
    }

    /**
     * 更新分區頂點控制點位置 (當 Group 整體移動時同步)
     */
    function updateZoneHandlePositions(zone) {
        if (!zone || !zone.konvaHandles || !zone.konvaGroup) return;
        const group = zone.konvaGroup;
        const polygon = group.findOne('.zone-shape');
        if (!polygon) return;

        const points = polygon.points();
        zone.konvaHandles.forEach(handle => {
            if (handle.name() === 'zone-vertex-handle') {
                const idx = handle.getAttr('vertexIndex');
                if (idx !== undefined && idx < points.length) {
                    const localX = points[idx];
                    const localY = points[idx + 1];
                    const absPos = getAbsolutePoint(group, { x: localX, y: localY });
                    handle.position(absPos);
                }
            } else if (handle.name() === 'zone-midpoint-handle') {
                const segStart = handle.getAttr('edgeStartIndex');
                if (segStart !== undefined && segStart < points.length) {
                    const nextIdx = (segStart + 2 < points.length) ? segStart + 2 : 0;
                    const mx = (points[segStart] + points[nextIdx]) / 2;
                    const my = (points[segStart + 1] + points[nextIdx + 1]) / 2;
                    const absPos = getAbsolutePoint(group, { x: mx, y: my });
                    handle.position(absPos);
                }
            }
        });
    }

    /**
     * 移除分區頂點控制點
     */
    function destroyZoneHandles(zone) {
        if (zone && zone.konvaHandles) {
            zone.konvaHandles.forEach(handle => handle.destroy());
            zone.konvaHandles = [];
        }
    }

    /**
     * 開始重繪土地分區多邊形外框
     */
    function startRedrawingZone(zone) {
        if (!zone) return;
        const target = zone;
        setTool('add-zone');
        window.redrawingZone = target;
        updateStatusBar();
        if (typeof updatePropertiesPanel === 'function') {
            updatePropertiesPanel(null);
        }
    }

    /**
     * 將重繪的新多邊形頂點套用至現存分區 (保留所有既有分區屬性與 ID)
     */
    function applyNewBoundaryToZone(zone, rawPoints) {
        const cleanedPoints = [];
        for (let i = 0; i < rawPoints.length; i += 2) {
            const px = parseFloat(rawPoints[i]);
            const py = parseFloat(rawPoints[i + 1]);
            if (!isNaN(px) && !isNaN(py)) {
                cleanedPoints.push(px, py);
            }
        }
        if (cleanedPoints.length < 6) {
            alert(I18N.t("Zone must have at least 3 points."));
            return;
        }

        const xs = [];
        const ys = [];
        for (let i = 0; i < cleanedPoints.length; i += 2) {
            xs.push(cleanedPoints[i]);
            ys.push(cleanedPoints[i + 1]);
        }
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);

        const localPoints = [];
        for (let i = 0; i < cleanedPoints.length; i += 2) {
            localPoints.push(cleanedPoints[i] - minX, cleanedPoints[i + 1] - minY);
        }

        zone.points = [...localPoints];
        if (zone.konvaGroup) {
            zone.konvaGroup.position({ x: minX, y: minY });
            const polygon = zone.konvaGroup.findOne('.zone-shape');
            if (polygon) {
                polygon.points(localPoints);
            }
            const label = zone.konvaGroup.findOne('.zone-label');
            if (label) {
                const centroid = calculateCentroid(localPoints);
                label.position({ x: centroid.x, y: centroid.y });
                label.offsetX(label.width() / 2);
                label.offsetY(label.height() / 2);
            }
        }

        autoGenerateCentroidConnectors(zone);
        updateZoneVisuals(zone, true);
        selectObject(zone);
        saveState();
        layer.batchDraw();
    }

    /**
     * 刪除分區物件
     */
    function deleteZone(id) {
        const zone = network.zones[id];
        if (!zone) return;
        destroyZoneHandles(zone);
        if (zone.konvaTransformer) {
            zone.konvaTransformer.destroy();
        }
        if (zone.konvaGroup) {
            zone.konvaGroup.destroy();
        }
        delete network.zones[id];
    }

    /**
     * 動態更新屬性面板中的分區計算數值 (不重新渲染整個面板，維持滑鼠或輸入焦點)
     */
    function updatePropertiesPanelDynamicValues(zone) {
        if (!zone) return;
        const polygon = zone.konvaGroup ? zone.konvaGroup.findOne('.zone-shape') : null;
        const pts = polygon ? polygon.points() : (zone.points || []);
        const siteArea = calculatePolygonArea(pts);
        const bcr = zone.bcr !== undefined ? zone.bcr : 0.6;
        const far = zone.far !== undefined ? zone.far : 2.0;
        const gfa = siteArea * far;
        const footprint = siteArea * bcr;
        const floors = Math.max(1, Math.ceil(far / bcr));

        const siteAreaEl = document.getElementById('prop-zone-site-area');
        if (siteAreaEl) siteAreaEl.textContent = `${siteArea.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;

        const footprintEl = document.getElementById('prop-zone-footprint');
        if (footprintEl) footprintEl.textContent = `${footprint.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;

        const gfaEl = document.getElementById('prop-zone-gfa');
        if (gfaEl) gfaEl.textContent = `${gfa.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²`;

        const floorsEl = document.getElementById('prop-zone-floors');
        if (floorsEl) floorsEl.textContent = `${floors} F`;

        const { pop: autoPop, emp: autoEmp } = estimateSocioEconomic(zone.zoneType, gfa);
        const isAuto = zone.autoCalculateTraffic !== false;
        const effPop = (!isAuto && zone.customPop !== null && zone.customPop !== undefined && !isNaN(zone.customPop)) ? zone.customPop : autoPop;
        const effEmp = (!isAuto && zone.customEmp !== null && zone.customEmp !== undefined && !isNaN(zone.customEmp)) ? zone.customEmp : autoEmp;

        const popInput = document.getElementById('prop-zone-pop');
        if (popInput && isAuto) popInput.value = effPop;

        const empInput = document.getElementById('prop-zone-emp');
        if (empInput && isAuto) empInput.value = effEmp;

        const trips = estimatePeakTrips(zone.zoneType, effPop, effEmp, gfa);
        const amEl = document.getElementById('prop-zone-trips-am');
        if (amEl) amEl.textContent = `P: ${trips.amP.toLocaleString()} / A: ${trips.amA.toLocaleString()} trips/h`;

        const pmEl = document.getElementById('prop-zone-trips-pm');
        if (pmEl) pmEl.textContent = `P: ${trips.pmP.toLocaleString()} / A: ${trips.pmA.toLocaleString()} trips/h`;

        const offEl = document.getElementById('prop-zone-trips-off');
        if (offEl) {
            const offP = trips.offP !== undefined ? trips.offP : 0;
            const offA = trips.offA !== undefined ? trips.offA : 0;
            offEl.textContent = `P: ${offP.toLocaleString()} / A: ${offA.toLocaleString()} trips/h`;
        }
    }

    // --- END OF CORRECTED handleStageClick FUNCTION ---
    function projectPointOnPolyline(point, polyline) {
        let minDist = Infinity; let closestDist = 0; let traveled = 0;
        for (let i = 0; i < polyline.length - 1; i++) {
            const p1 = polyline[i]; const p2 = polyline[i + 1];
            const segLen = vecLen(getVector(p1, p2));
            if (segLen === 0) continue;
            const t = ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y)) / (segLen * segLen);
            const tClamped = Math.max(0, Math.min(1, t));
            const projPoint = add(p1, scale(getVector(p1, p2), tClamped));
            const dist = vecLen(getVector(point, projPoint));
            if (dist < minDist) {
                minDist = dist;
                closestDist = traveled + tClamped * segLen;
            }
            traveled += segLen;
        }
        return { dist: closestDist, pointDist: minDist };
    }

    function projectPointOnPolylineWithIndex(point, polyline) {
        let minDistSq = Infinity;
        let bestProjection = { point: null, index: -1 };

        for (let i = 0; i < polyline.length - 1; i++) {
            const p1 = polyline[i];
            const p2 = polyline[i + 1];
            const segLenSq = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);

            if (segLenSq === 0) continue;

            const t = ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y)) / segLenSq;
            const tClamped = Math.max(0, Math.min(1, t));

            const projPoint = {
                x: p1.x + tClamped * (p2.x - p1.x),
                y: p1.y + tClamped * (p2.y - p1.y),
            };

            const distSq = Math.pow(point.x - projPoint.x, 2) + Math.pow(point.y - projPoint.y, 2);

            if (distSq < minDistSq) {
                minDistSq = distSq;
                bestProjection = { point: projPoint, index: i };
            }
        }
        return bestProjection;
    }
    function updateConnectionEndpoints(linkId) {
        const modifiedLink = network.links[linkId];
        if (!modifiedLink) return;

        // 1. 更新單一車道的連接線 (Micro Connections)
        Object.values(network.connections).forEach(conn => {
            let needsUpdate = false;
            if (conn.sourceLinkId === linkId || conn.destLinkId === linkId) {
                const sourceLink = network.links[conn.sourceLinkId];
                const destLink = network.links[conn.destLinkId];

                if (sourceLink && destLink) {
                    const srcPath = getLanePath(sourceLink, conn.sourceLaneIndex);
                    const dstPath = getLanePath(destLink, conn.destLaneIndex);

                    if (srcPath.length >= 2 && dstPath.length >= 2) {
                        const pStart = srcPath[srcPath.length - 1];
                        const pEnd = dstPath[0];
                        const vStart = normalize(getVector(srcPath[srcPath.length - 2], pStart));
                        const vEnd = normalize(getVector(pEnd, dstPath[1]));

                        const turnDir = getTurnDirection(sourceLink, destLink);
                        const bezierPts = calculateBezierPoints(pStart, vStart, pEnd, vEnd, turnDir, getLinkTotalWidth(sourceLink));

                        conn.bezierPoints = bezierPts;
                        conn.konvaBezier.points(bezierPts.flatMap(p => [p.x, p.y]));
                    }
                }
            }
        });

        // 2. 更新群組視覺線條 (Macro Groups)
        layer.find('.group-connection-visual').forEach(groupVisual => {
            const meta = groupVisual.getAttr('meta');
            if (!meta) return;

            if (meta.sourceLinkId === linkId || meta.destLinkId === linkId) {
                const srcLink = network.links[meta.sourceLinkId];
                const dstLink = network.links[meta.destLinkId];
                if (srcLink && dstLink && srcLink.waypoints.length > 1 && dstLink.waypoints.length > 1) {
                    const pStart = srcLink.waypoints[srcLink.waypoints.length - 1];
                    const pEnd = dstLink.waypoints[0];
                    const vStart = normalize(getVector(srcLink.waypoints[srcLink.waypoints.length - 2], pStart));
                    const vEnd = normalize(getVector(pEnd, dstLink.waypoints[1]));

                    const turnDir = getTurnDirection(srcLink, dstLink);
                    const bezierPts = calculateBezierPoints(pStart, vStart, pEnd, vEnd, turnDir, getLinkTotalWidth(srcLink) + getLinkTotalWidth(dstLink));

                    // 【修改】只更新曲線位置，移除箭頭更新邏輯
                    if (typeof groupVisual.findOne === 'function') {
                        const spline = groupVisual.findOne('.trajectory-spline');
                        if (spline) {
                            spline.points(bezierPts.flatMap(p => [p.x, p.y]));
                        }
                    } else if (typeof groupVisual.points === 'function') {
                        groupVisual.points([pStart.x, pStart.y, pEnd.x, pEnd.y]);
                    }
                }
            }
        });
    }
    // --- [新增] 框選自動連結演算法 ---
    function getBearing(p1, p2) {
        // Konva 的 Y 軸向下，這裡計算標準數學角度，後續再做差值處理
        // 使用 atan2(dy, dx)
        return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
    }

    // --- [修正] 判斷轉向關係 (支援直行、左右轉、迴轉) ---
    function getTurnDirection(srcLink, dstLink) {
        if (!srcLink.waypoints || srcLink.waypoints.length < 2) return 'straight';
        if (!dstLink.waypoints || dstLink.waypoints.length < 2) return 'straight';

        // 取得來源路段「末端」的方向向量
        const pSrcEnd = srcLink.waypoints[srcLink.waypoints.length - 1];
        const pSrcPrev = srcLink.waypoints[srcLink.waypoints.length - 2];

        // 取得目的路段「開頭」的方向向量
        const pDstStart = dstLink.waypoints[0];
        const pDstNext = dstLink.waypoints[1];

        const srcAngle = getBearing(pSrcPrev, pSrcEnd);
        const dstAngle = getBearing(pDstStart, pDstNext);

        // 計算角度差 (-180 ~ 180)
        let diff = dstAngle - srcAngle;
        while (diff <= -180) diff += 360;
        while (diff > 180) diff -= 360;

        // --- 寬鬆的角度判斷策略 ---
        // 正值代表順時針轉 (右轉)，負值代表逆時針轉 (左轉)

        // 1. 右轉區間: +30 ~ +150 度 (涵蓋緩右到銳角右轉)
        if (diff >= 30 && diff <= 150) return 'right';

        // 2. 左轉區間: -30 ~ -150 度 (涵蓋緩左到銳角左轉)
        if (diff <= -30 && diff >= -150) return 'left';

        // 3. 迴轉 (U-Turn): 角度差很大 (>150 或 <-150)
        // 在靠右行駛系統中，迴轉通常視為「極左轉」，使用靠左對齊邏輯 (內車道轉內車道)
        if (diff > 150 || diff < -150) return 'u-turn';

        // 4. 其餘視為直行 (-30 ~ +30 度)
        return 'straight';
    }
    // --- [新增] 輔助函數：取得左/右轉附加車道數量 ---
    function getLeftPocketCount(link) {
        if (link.geometryType === 'parametric' && link.parametricConfig && link.parametricConfig.leftPocket && link.parametricConfig.leftPocket.exists) {
            return link.parametricConfig.leftPocket.lanes || 0;
        }
        return 0;
    }

    function getRightPocketCount(link) {
        if (link.geometryType === 'parametric' && link.parametricConfig && link.parametricConfig.rightPocket && link.parametricConfig.rightPocket.exists) {
            return link.parametricConfig.rightPocket.lanes || 0;
        }
        return 0;
    }
    // --- [修正] 框選自動連結演算法 (支援跳過附加車道) ---
    function autoConnectLanesInSelection(rect) {
        console.log("AutoConnect Box:", rect);

        const CONNECT_THRESHOLD = 50;
        const candidates = { sources: [], dests: [] };

        // 1. 空間搜尋：篩選端點在框內的 Link
        Object.values(network.links).forEach(link => {
            if (!link.waypoints || link.waypoints.length < 2) return;

            const startPoint = link.waypoints[0];
            const endPoint = link.waypoints[link.waypoints.length - 1];

            const startInBox = startPoint.x >= rect.x && startPoint.x <= rect.x + rect.width &&
                startPoint.y >= rect.y && startPoint.y <= rect.y + rect.height;
            if (startInBox) candidates.dests.push(link);

            const endInBox = endPoint.x >= rect.x && endPoint.x <= rect.x + rect.width &&
                endPoint.y >= rect.y && endPoint.y <= rect.y + rect.height;
            if (endInBox) candidates.sources.push(link);
        });

        let connectionCount = 0;

        // 2. 雙重迴圈進行配對
        candidates.sources.forEach(srcLink => {
            candidates.dests.forEach(dstLink => {
                if (srcLink.id === dstLink.id) return;

                const pEnd = srcLink.waypoints[srcLink.waypoints.length - 1];
                const pStart = dstLink.waypoints[0];
                const dist = Math.sqrt(Math.pow(pEnd.x - pStart.x, 2) + Math.pow(pEnd.y - pStart.y, 2));

                if (dist <= CONNECT_THRESHOLD) {
                    const turnDir = getTurnDirection(srcLink, dstLink);

                    if (turnDir === 'u-turn') return; // 略過大迴轉

                    // ==================================================
                    // [智慧車道對齊邏輯]
                    // ==================================================
                    let srcStartIdx = 0;
                    let dstStartIdx = 0;
                    let srcLanesForTurn = srcLink.lanes.length;
                    let dstLanesForTurn = dstLink.lanes.length;

                    // 如果是直行，自動跳過左轉附加車道，只針對直行車道進行匹配
                    if (turnDir === 'straight') {
                        const srcLL = getLeftPocketCount(srcLink);
                        const dstLL = getLeftPocketCount(dstLink);
                        srcStartIdx = srcLL;
                        dstStartIdx = dstLL;
                        srcLanesForTurn = Math.max(1, srcLink.lanes.length - srcLL - getRightPocketCount(srcLink));
                        dstLanesForTurn = Math.max(1, dstLink.lanes.length - dstLL - getRightPocketCount(dstLink));
                    }

                    const laneCount = Math.min(srcLanesForTurn, dstLanesForTurn);
                    const newIds = [];

                    for (let k = 0; k < laneCount; k++) {
                        let srcIdx, dstIdx;

                        if (turnDir === 'right') {
                            // [右轉]: 靠右對齊 (從最外側車道開始)
                            srcIdx = srcLink.lanes.length - 1 - k;
                            dstIdx = dstLink.lanes.length - 1 - k;
                        } else {
                            // [直行 / 左轉]: 靠左對齊 (套用起點偏移量)
                            srcIdx = srcStartIdx + k;
                            dstIdx = dstStartIdx + k;
                        }

                        // 防呆：確保索引未超出陣列
                        if (srcIdx >= srcLink.lanes.length || dstIdx >= dstLink.lanes.length) continue;

                        const srcMeta = { linkId: srcLink.id, laneIndex: srcIdx, portType: 'end' };
                        const dstMeta = { linkId: dstLink.id, laneIndex: dstIdx, portType: 'start' };

                        const newConn = handleConnection(srcMeta, dstMeta);
                        if (newConn) {
                            newConn.konvaBezier.visible(false); // 隱藏單車道細線
                            newIds.push(newConn.id);
                            connectionCount++;
                        }
                    }

                    // 建立 Connection Group 視覺效果 (綠色/色碼群組粗線)
                    if (newIds.length > 0) {
                        const lastConnId = newIds[newIds.length - 1];
                        const lastConn = network.connections[lastConnId];
                        const commonNodeId = lastConn ? lastConn.nodeId : null;

                        if (commonNodeId) {
                            drawConnectionGroupVisual(srcLink, dstLink, newIds, commonNodeId);
                        }
                    }
                }
            });
        });

        if (connectionCount > 0) {
            console.log(`Auto-connected ${connectionCount} lanes.`);
        }
    }
    // --- [新增] 路段合併演算法 (Stitching) ---
    function autoMergeLinksInSelection(rect) {
        console.log("AutoMerge Box:", rect);
        const MERGE_DIST_THRESHOLD = 30; // 允許的接合距離誤差 (公尺)
        const MERGE_ANGLE_THRESHOLD = 45; // 允許的角度誤差 (度)

        const candidates = { tails: [], heads: [] };

        // 1. 搜尋框選範圍內的端點
        Object.values(network.links).forEach(link => {
            if (!link.waypoints || link.waypoints.length < 2) return;

            const pStart = link.waypoints[0];
            const pEnd = link.waypoints[link.waypoints.length - 1];

            // 檢查起點是否在框內 (作為下游候選 - Head)
            if (pStart.x >= rect.x && pStart.x <= rect.x + rect.width &&
                pStart.y >= rect.y && pStart.y <= rect.y + rect.height) {
                candidates.heads.push(link);
            }

            // 檢查終點是否在框內 (作為上游候選 - Tail)
            if (pEnd.x >= rect.x && pEnd.x <= rect.x + rect.width &&
                pEnd.y >= rect.y && pEnd.y <= rect.y + rect.height) {
                candidates.tails.push(link);
            }
        });

        let mergeCount = 0;
        const processedIds = new Set(); // 避免重複處理

        // 2. 配對檢查
        candidates.tails.forEach(linkA => { // 上游 (保留)
            if (processedIds.has(linkA.id)) return;

            candidates.heads.forEach(linkB => { // 下游 (將被合併刪除)
                if (processedIds.has(linkB.id)) return;
                if (linkA.id === linkB.id) return;

                // 條件 A: 車道數必須相同
                if (linkA.lanes.length !== linkB.lanes.length) return;

                // 條件 B: 距離夠近
                const pEndA = linkA.waypoints[linkA.waypoints.length - 1];
                const pStartB = linkB.waypoints[0];
                const dist = Math.sqrt(Math.pow(pEndA.x - pStartB.x, 2) + Math.pow(pEndA.y - pStartB.y, 2));

                if (dist > MERGE_DIST_THRESHOLD) return;

                // 條件 C: 方向一致 (避免銳角接合)
                // 計算 A 的末端向量 和 B 的前端向量
                const vecA = getVector(linkA.waypoints[linkA.waypoints.length - 2], pEndA);
                const vecB = getVector(pStartB, linkB.waypoints[1]);
                const angleA = Math.atan2(vecA.y, vecA.x) * (180 / Math.PI);
                const angleB = Math.atan2(vecB.y, vecB.x) * (180 / Math.PI);

                let angleDiff = Math.abs(angleA - angleB);
                if (angleDiff > 180) angleDiff = 360 - angleDiff;

                if (angleDiff > MERGE_ANGLE_THRESHOLD) return;

                // --- 執行合併 ---
                if (confirm(`Merge Link ${linkA.id} and ${linkB.id}?`)) {
                    performLinkMerge(linkA, linkB);
                    processedIds.add(linkA.id);
                    processedIds.add(linkB.id);
                    mergeCount++;
                }
            });
        });

        if (mergeCount > 0) {
            // 更新畫面與狀態
            deselectAll();
            layer.batchDraw();
            saveState();
            alert(`Merged ${mergeCount} pairs of links.`);
        } else {
            console.log("No matching links found for merge.");
        }
    }

    // 執行實際合併動作 (A 吸納 B)
    function performLinkMerge(linkA, linkB) {
        const offsetLength = getPolylineLength(linkA.waypoints);

        // 1. 合併幾何點
        const pEndA = linkA.waypoints[linkA.waypoints.length - 1];
        const pStartB = linkB.waypoints[0];
        const dist = Math.sqrt(Math.pow(pEndA.x - pStartB.x, 2) + Math.pow(pEndA.y - pStartB.y, 2));

        const pointsToAppend = (dist < 1.0) ? linkB.waypoints.slice(1) : linkB.waypoints;
        linkA.waypoints = linkA.waypoints.concat(pointsToAppend);

        // =========================================================
        // [新增修正] 統一並修復幾何模式 (Geometry Type)
        // 確保 Standard 與 Parametric 混合合併時，強制升級為 Parametric
        // =========================================================
        const isAnyParametric = (linkA.geometryType === 'parametric' || linkB.geometryType === 'parametric');
        const isAnyLaneBased = (linkA.geometryType === 'lane-based' || linkB.geometryType === 'lane-based');

        if (isAnyParametric) {
            linkA.geometryType = 'parametric';

            // 決定 Parametric 組態：如果 A 沒有，則繼承 B 的，若都沒有則生成預設值
            if (!linkA.parametricConfig) {
                if (linkB.parametricConfig) {
                    linkA.parametricConfig = JSON.parse(JSON.stringify(linkB.parametricConfig));
                } else {
                    linkA.parametricConfig = {
                        throughLanes: linkA.lanes.length,
                        leftPocket: { exists: false, lanes: 1, length: 30, taper: 15 },
                        rightPocket: { exists: false, lanes: 1, length: 30, taper: 15 },
                        _prevLL: 0,
                        _prevTL: linkA.lanes.length,
                        _prevRL: 0
                    };
                }
            }
        } else if (isAnyLaneBased) {
            // 對於無法完美相接的不規則手繪標線，安全降級為 Standard 以防止破圖
            linkA.geometryType = 'standard';
        }
        // =========================================================

        // 2. 遷移資產 (Assets Migration)
        Object.values(network.detectors).forEach(det => {
            if (det.linkId === linkB.id) { det.linkId = linkA.id; det.position += offsetLength; drawDetector(det); }
        });
        Object.values(network.roadSigns).forEach(sign => {
            if (sign.linkId === linkB.id) { sign.linkId = linkA.id; sign.position += offsetLength; drawRoadSign(sign); }
        });
        Object.values(network.roadMarkings).forEach(mk => {
            if (mk.linkId === linkB.id) { mk.linkId = linkA.id; if (!mk.isFree && !mk.nodeId) { mk.position += offsetLength; } drawRoadMarking(mk); }
        });
        Object.values(network.origins).forEach(o => {
            if (o.linkId === linkB.id) { o.linkId = linkA.id; o.position += offsetLength; drawOrigin(o); }
        });
        Object.values(network.destinations).forEach(d => {
            if (d.linkId === linkB.id) { d.linkId = linkA.id; d.position += offsetLength; drawDestination(d); }
        });

        // 3. 修復拓撲 (Topology) 採用全域掃描防呆
        let midNodeId = null;
        let finalNodeId = null;

        Object.values(network.nodes).forEach(node => {
            if (node.outgoingLinkIds.has(linkB.id)) midNodeId = node.id;
            if (node.incomingLinkIds.has(linkB.id)) finalNodeId = node.id;
        });

        linkA.endNodeId = finalNodeId;

        if (finalNodeId && network.nodes[finalNodeId]) {
            const finalNode = network.nodes[finalNodeId];
            finalNode.incomingLinkIds.delete(linkB.id);
            finalNode.incomingLinkIds.add(linkA.id);
        }

        // 遷移 Turning Ratios (轉向比例)
        Object.values(network.nodes).forEach(node => {
            if (!node.turningRatios) return;
            if (node.turningRatios[linkB.id] !== undefined) {
                node.turningRatios[linkA.id] = node.turningRatios[linkB.id];
                delete node.turningRatios[linkB.id];
            }
            Object.keys(node.turningRatios).forEach(fromId => {
                if (node.turningRatios[fromId][linkB.id] !== undefined) {
                    node.turningRatios[fromId][linkA.id] = node.turningRatios[fromId][linkB.id];
                    delete node.turningRatios[fromId][linkB.id];
                }
            });
        });

        // 4. 更新連接線與群組視覺物件 (Connections & Groups)
        const connsToDelete = [];
        Object.values(network.connections).forEach(conn => {
            if (conn.sourceLinkId === linkA.id && conn.destLinkId === linkB.id) {
                // 這條是連接著 A 和 B 中間的內部線，合併後應該消失
                connsToDelete.push(conn.id);
            } else {
                // 遷移 B 的連接給 A
                if (conn.sourceLinkId === linkB.id) conn.sourceLinkId = linkA.id;
                if (conn.destLinkId === linkB.id) conn.destLinkId = linkA.id;
            }
        });

        // 刪除多餘的內部連接
        connsToDelete.forEach(id => deleteConnection(id));

        // 更新視覺群組 (綠色粗線)
        const groupsToRemove = [];
        layer.find('.group-connection-visual').forEach(groupLine => {
            const meta = groupLine.getAttr('meta');
            if (!meta) return;

            // 如果這個群組剛好是連接著 A 到 B 的 (中間節點)，將其移除
            if (meta.sourceLinkId === linkA.id && meta.destLinkId === linkB.id) {
                groupsToRemove.push(groupLine);
                return;
            }

            let changed = false;
            // 修正 Meta 資料：將原本屬於 B 的 ID 換成 A
            if (meta.sourceLinkId === linkB.id) {
                meta.sourceLinkId = linkA.id;
                changed = true;
            }
            if (meta.destLinkId === linkB.id) {
                meta.destLinkId = linkA.id;
                changed = true;
            }

            if (changed) {
                // 過濾掉可能已被刪除的內部連接 ID
                meta.connectionIds = meta.connectionIds.filter(id => !connsToDelete.includes(id));

                if (meta.connectionIds.length === 0) {
                    groupsToRemove.push(groupLine);
                } else {
                    groupLine.setAttr('meta', meta);
                    // 同步更新綠色粗線在畫布上的端點座標
                    const srcLink = network.links[meta.sourceLinkId];
                    const dstLink = network.links[meta.destLinkId];
                    if (srcLink && dstLink && srcLink.waypoints.length > 0 && dstLink.waypoints.length > 0) {
                        const p1 = srcLink.waypoints[srcLink.waypoints.length - 1];
                        const p4 = dstLink.waypoints[0];
                        groupLine.points([p1.x, p1.y, p4.x, p4.y]);
                    }
                }
            }
        });

        // 清理無效的群組線
        groupsToRemove.forEach(g => g.destroy());

        // 5. 處理中間節點刪除
        if (midNodeId && network.nodes[midNodeId]) {
            const midNode = network.nodes[midNodeId];
            midNode.incomingLinkIds.delete(linkA.id);
            midNode.outgoingLinkIds.delete(linkB.id);

            if (midNode.incomingLinkIds.size === 0 && midNode.outgoingLinkIds.size === 0) {
                if (network.trafficLights[midNodeId]) delete network.trafficLights[midNodeId];
                midNode.konvaShape.destroy();
                delete network.nodes[midNodeId];
            }
        }

        // 6. 刪除 Link B
        linkB.konvaGroup.destroy();
        delete network.links[linkB.id];

        // 7. 重繪 Link A 與更新附屬物件
        // =========================================================
        // [新增修正] 呼叫參數化引擎重新計算座標與標線
        // 因為中心線(waypoints)已改變，必須重算實體標線以免錯位
        // =========================================================
        if (linkA.geometryType === 'parametric') {
            window.generateParametricStrokes(linkA);
        }

        drawLink(linkA);
        updateConnectionEndpoints(linkA.id);
    }

    // 完整替換現有的 drawConnectionGroupVisual 函數
    function drawConnectionGroupVisual(srcLink, dstLink, newIds, commonNodeId) {
        // 檢查是否已經有這組 Link 對的視覺線條，若有則先銷毀重建
        let existingVisual = layer.find('.group-connection-visual').find(shape => {
            const meta = shape.getAttr('meta');
            return meta && meta.sourceLinkId === srcLink.id && meta.destLinkId === dstLink.id;
        });

        const turnDir = getTurnDirection(srcLink, dstLink);
        const color = TRAJECTORY_COLORS[turnDir] || TRAJECTORY_COLORS['default'];

        // 取得端點與向量
        const pStart = srcLink.waypoints[srcLink.waypoints.length - 1];
        const pEnd = dstLink.waypoints[0];
        const vStart = normalize(getVector(srcLink.waypoints[srcLink.waypoints.length - 2], pStart));
        const vEnd = normalize(getVector(pEnd, dstLink.waypoints[1]));

        const totalWidth = getLinkTotalWidth(srcLink) + getLinkTotalWidth(dstLink);
        const bezierPts = calculateBezierPoints(pStart, vStart, pEnd, vEnd, turnDir, totalWidth);

        const groupVisual = new Konva.Group({
            name: 'group-connection-visual',
            listening: true,
        });

        // 1. 平滑實線軌跡 (最細、連續、無箭頭)
        const spline = new Konva.Line({
            points: bezierPts.flatMap(p => [p.x, p.y]),
            bezier: true,
            stroke: color,
            strokeWidth: 1, // 【關鍵修改】最細線寬
            // 移除了 dash 屬性，變成連續實線
            lineCap: 'round',
            hitStrokeWidth: 20, // 保持隱形的點擊範圍夠寬
            name: 'trajectory-spline'
        });

        groupVisual.add(spline);

        // 更新與合併 Meta 資料
        const newMeta = {
            type: 'ConnectionGroup',
            connectionIds: newIds,
            nodeId: commonNodeId,
            sourceLinkId: srcLink.id,
            destLinkId: dstLink.id
        };

        if (existingVisual) {
            const oldMeta = existingVisual.getAttr('meta');
            newMeta.connectionIds = [...new Set([...oldMeta.connectionIds, ...newIds])];
            existingVisual.destroy();
        }

        groupVisual.setAttr('meta', newMeta);
        layer.add(groupVisual);
        groupVisual.moveToBottom();

        // 確保 Node 墊在最底部，讓軌跡浮在上方
        if (network.nodes[commonNodeId]) {
            network.nodes[commonNodeId].konvaShape.moveToBottom();
        }
    }

    function handleConnection(sourceMeta, destMeta, color = 'rgba(0, 255, 0, 0.7)') {
        const sourceLink = network.links[sourceMeta.linkId];
        const destLink = network.links[destMeta.linkId];

        if (!sourceLink || !destLink) return null;

        // 檢查此連接是否已存在
        const alreadyExists = Object.values(network.connections).some(c =>
            c.sourceLinkId === sourceLink.id &&
            c.sourceLaneIndex === sourceMeta.laneIndex &&
            c.destLinkId === destLink.id &&
            c.destLaneIndex === destMeta.laneIndex
        );

        if (alreadyExists) {
            return null;
        }

        // --- START: 全新的、更精確的節點合併邏輯 ---

        // 步驟 1: 精準尋找候選節點 (基於拓撲)
        const candidateNodeIds = new Set();
        Object.values(network.nodes).forEach(node => {
            if (node.incomingLinkIds.has(sourceLink.id)) {
                candidateNodeIds.add(node.id);
            }
            if (node.outgoingLinkIds.has(destLink.id)) {
                candidateNodeIds.add(node.id);
            }
        });

        let survivingNode;
        const candidatesArray = [...candidateNodeIds];

        // 步驟 2: 根據候選節點的數量決定行為
        if (candidatesArray.length === 0) {
            // --- 情況 A: 找不到任何拓撲候選節點 ---
            const sourceLanePath = getLanePath(sourceLink, sourceMeta.laneIndex);
            const destLanePath = getLanePath(destLink, destMeta.laneIndex);
            if (sourceLanePath.length < 2 || destLanePath.length < 2) return null;

            const p1 = sourceLanePath.slice(-1)[0];
            const p4 = destLanePath[0];
            const intersectionCenter = { x: (p1.x + p4.x) / 2, y: (p1.y + p4.y) / 2 };

            // [新增修正] 空間鄰近檢測 (Spatial Merge Check)
            // 如果 XML 定義了兩個重疊但沒有共用 Link 的節點，這裡會強制將它們合併。
            let spatialMatchNode = null;
            const MERGE_RADIUS = 10; // 合併半徑 (公尺)，您可以根據需求調整，10m 通常足夠處理路口重疊

            for (const nodeId in network.nodes) {
                const n = network.nodes[nodeId];
                // 計算現有節點與新連接中心的距離
                const dist = Math.sqrt(Math.pow(n.x - intersectionCenter.x, 2) + Math.pow(n.y - intersectionCenter.y, 2));
                if (dist < MERGE_RADIUS) {
                    spatialMatchNode = n;
                    break;
                }
            }

            if (spatialMatchNode) {
                // 找到了距離很近的孤立節點，進行空間合併
                survivingNode = spatialMatchNode;
            } else {
                // 真的是新路口，建立新節點
                survivingNode = createNode(intersectionCenter.x, intersectionCenter.y);
            }

        } else {
            // --- 情況 B: 找到一個或多個候選節點 (保持原樣) ---
            const survivingNodeId = candidatesArray[0];
            survivingNode = network.nodes[survivingNodeId];

            if (candidatesArray.length > 1) {
                for (let i = 1; i < candidatesArray.length; i++) {
                    const doomedNodeId = candidatesArray[i];
                    const doomedNode = network.nodes[doomedNodeId];
                    if (!doomedNode || doomedNodeId === survivingNodeId) continue;

                    doomedNode.incomingLinkIds.forEach(id => survivingNode.incomingLinkIds.add(id));
                    doomedNode.outgoingLinkIds.forEach(id => survivingNode.outgoingLinkIds.add(id));

                    Object.values(network.connections).forEach(conn => {
                        if (conn.nodeId === doomedNodeId) conn.nodeId = survivingNodeId;
                    });

                    if (network.trafficLights[doomedNodeId]) {
                        if (!network.trafficLights[survivingNodeId]) {
                            network.trafficLights[survivingNodeId] = network.trafficLights[doomedNodeId];
                            network.trafficLights[survivingNodeId].nodeId = survivingNodeId;
                        }
                        delete network.trafficLights[doomedNodeId];
                    }

                    doomedNode.konvaShape.destroy();
                    delete network.nodes[doomedNodeId];
                }
            }
        }
        // --- END: 全新的節點合併邏輯 ---


        // 步驟 3: 更新倖存節點的 Link 關係
        survivingNode.incomingLinkIds.add(sourceLink.id);
        survivingNode.outgoingLinkIds.add(destLink.id);

        // --- 補上這兩行，確保未來複製與合併不再找不到路口 ---
        sourceLink.endNodeId = survivingNode.id;
        destLink.startNodeId = survivingNode.id;

        const sourceLanePath = getLanePath(sourceLink, sourceMeta.laneIndex);
        const destLanePath = getLanePath(destLink, destMeta.laneIndex);
        if (sourceLanePath.length < 2 || destLanePath.length < 2) return null;

        const p1 = sourceLanePath.slice(-1)[0];
        const p4 = destLanePath[0];

        const newConnection = createConnection(sourceLink, sourceMeta.laneIndex, destLink, destMeta.laneIndex, survivingNode, [p1, p4], color);

        if (survivingNode && survivingNode.konvaShape) {
            survivingNode.konvaShape.clearCache();
        }

        layer.batchDraw();

        return newConnection;
    }
    // --- START: NEW FUNCTION FOR REDRAWING CONNECTIONS ---

    /**
     * Redraws all connections and connection groups associated with a given node.
     * This is useful after a link's geometry has been significantly altered.
     * @param {string} nodeId The ID of the node to update.
     */
    function redrawNodeConnections(nodeId) {
        const node = network.nodes[nodeId];
        if (!node) {
            console.error("Node not found for redraw:", nodeId);
            return;
        }

        // --- 1. Redraw individual connection lines ---
        Object.values(network.connections).forEach(conn => {
            if (conn.nodeId !== nodeId) return; // Skip connections not at this node

            const sourceLink = network.links[conn.sourceLinkId];
            const destLink = network.links[conn.destLinkId];
            if (!sourceLink || !destLink) return;

            // --- MODIFICATION: Simplified geometry calculation for straight lines ---
            const sourceLanePath = getLanePath(sourceLink, conn.sourceLaneIndex);
            const destLanePath = getLanePath(destLink, conn.destLaneIndex);
            if (sourceLanePath.length < 2 || destLanePath.length < 2) return;

            const p1 = sourceLanePath.slice(-1)[0];
            const p4 = destLanePath[0];

            // [修正] 計算完整的切線向量與貝茲控制點
            const v1 = normalize(getVector(sourceLanePath[sourceLanePath.length - 2], p1));
            const v4 = normalize(getVector(p4, destLanePath[1]));
            const turnDir = getTurnDirection(sourceLink, destLink);
            const bezierPts = calculateBezierPoints(p1, v1, p4, v4, turnDir, getLinkTotalWidth(sourceLink));

            // 賦予完整的 4 個貝茲控制點
            conn.bezierPoints = bezierPts;
            conn.konvaBezier.points(conn.bezierPoints.flatMap(p => [p.x, p.y]));

            // No controls to draw, so the 'if selected' block is removed.
        });

        // --- 2. Redraw connection group visuals ---
        layer.find('.group-connection-visual').forEach(groupVisual => {
            const meta = groupVisual.getAttr('meta');
            if (meta && meta.nodeId === nodeId) {
                const srcLink = network.links[meta.sourceLinkId];
                const dstLink = network.links[meta.destLinkId];
                if (srcLink && dstLink && srcLink.waypoints.length > 1 && dstLink.waypoints.length > 1) {
                    const pStart = srcLink.waypoints[srcLink.waypoints.length - 1];
                    const pEnd = dstLink.waypoints[0];
                    const vStart = normalize(getVector(srcLink.waypoints[srcLink.waypoints.length - 2], pStart));
                    const vEnd = normalize(getVector(pEnd, dstLink.waypoints[1]));

                    const turnDir = getTurnDirection(srcLink, dstLink);
                    const bezierPts = calculateBezierPoints(pStart, vStart, pEnd, vEnd, turnDir, getLinkTotalWidth(srcLink) + getLinkTotalWidth(dstLink));

                    const spline = typeof groupVisual.findOne === 'function' ? groupVisual.findOne('.trajectory-spline') : null;
                    if (spline) {
                        spline.points(bezierPts.flatMap(p => [p.x, p.y]));
                    } else if (typeof groupVisual.points === 'function') {
                        groupVisual.points(bezierPts.flatMap(p => [p.x, p.y]));
                    }
                }
            }
        });

        console.log(`Connections for node ${nodeId} have been redrawn.`);
        // Trigger a single batch draw to render all changes
        layer.batchDraw();
    }
    // --- END: NEW FUNCTION FOR REDRAWING CONNECTIONS ---

    function drawGrid() {
        // 清除舊的格線
        gridLayer.destroyChildren();

        const width = stage.width();
        const height = stage.height();
        const scale = stage.scaleX();
        const x = stage.x();
        const y = stage.y();

        // 根據縮放級別調整格線間距，以保持視覺清爽
        let step = 50;
        if (scale > 2) step = 25;
        if (scale < 0.5) step = 100;
        if (scale < 0.25) step = 250;

        // 計算可視範圍在「世界座標系」中的邊界
        const topLeft = { x: -x / scale, y: -y / scale };
        const bottomRight = { x: (-x + width) / scale, y: (-y + height) / scale };

        const lightGray = '#ddd';
        const mediumGray = '#ccc';

        // --- START OF MODIFICATION ---

        // 計算需要繪製的第一條和最後一条垂直線的索引
        const firstVerticalIndex = Math.floor(topLeft.x / step);
        const lastVerticalIndex = Math.ceil(bottomRight.x / step);

        // 繪製垂直線
        for (let i = firstVerticalIndex; i <= lastVerticalIndex; i++) {
            const lineX = i * step; // 線條在世界座標系中的 X 位置

            gridLayer.add(new Konva.Line({
                // 點的座標是「世界座標」，Konva 會自動根據舞台的 transform 轉換
                // 線條的 Y 軸範圍就是可視範圍的 Y 軸範圍
                points: [lineX, topLeft.y, lineX, bottomRight.y],
                stroke: i % 5 === 0 ? mediumGray : lightGray,
                // 動態調整線寬，使其在螢幕上看起來總是 1px 寬
                strokeWidth: 1 / scale,
                listening: false, // 格線不需要監聽事件
            }));
        }

        // 計算需要繪製的第一條和最後一条水平線的索引
        const firstHorizontalIndex = Math.floor(topLeft.y / step);
        const lastHorizontalIndex = Math.ceil(bottomRight.y / step);

        // 繪製水平線
        for (let i = firstHorizontalIndex; i <= lastHorizontalIndex; i++) {
            const lineY = i * step; // 線條在世界座標系中的 Y 位置

            gridLayer.add(new Konva.Line({
                // 線條的 X 軸範圍就是可視範圍的 X 軸範圍
                points: [topLeft.x, lineY, bottomRight.x, lineY],
                stroke: i % 5 === 0 ? mediumGray : lightGray,
                strokeWidth: 1 / scale,
                listening: false,
            }));
        }

        // --- END OF MODIFICATION ---

        gridLayer.moveToBottom();
    }
    // --- PROPERTIES PANEL & SELECTION ---

    function destroyWaypointHandles(link) {
        if (link && link.konvaHandles) {
            link.konvaHandles.forEach(handle => handle.destroy());
            link.konvaHandles = [];
        }
    }

    // --- 新增：清除 Node 頂點控制點 ---
    function destroyNodeHandles(node) {
        if (node && node.konvaHandles) {
            node.konvaHandles.forEach(handle => handle.destroy());
            node.konvaHandles = [];
        }
    }

    // --- 新增：繪製 Node 頂點控制點 (包含中點，以利無限新增頂點) ---
    function drawNodeHandles(node) {
        destroyNodeHandles(node);

        const polygonPoints = getNodePolygonPoints(node);
        if (!polygonPoints || polygonPoints.length < 6) return;

        node.konvaHandles = [];
        const scale = 1 / stage.scaleX();

        // 1. 繪製主要的頂點控制點 (紅色實心)
        for (let i = 0; i < polygonPoints.length; i += 2) {
            const handle = new Konva.Circle({
                x: polygonPoints[i],
                y: polygonPoints[i + 1],
                radius: 5,
                fill: '#ef4444',
                stroke: 'white',
                strokeWidth: 1.5,
                hitStrokeWidth: 10, // 增加點擊範圍
                draggable: true,
                name: 'node-vertex-handle',
                scaleX: scale,
                scaleY: scale,
            });

            handle.setAttr('vertexIndex', i);

            handle.on('dragstart', () => {
                // 如果是第一次拖動，將當前的形狀「定型 (Bake)」為自訂形狀
                if (!node.customPolygonPoints) {
                    node.customPolygonPoints = [...getNodePolygonPoints(node)];
                }
            });

            handle.on('dragmove', (e) => {
                const idx = e.target.getAttr('vertexIndex');
                node.customPolygonPoints[idx] = e.target.x();
                node.customPolygonPoints[idx + 1] = e.target.y();
                layer.batchDraw();
            });

            handle.on('dragend', () => {
                updatePropertiesPanel(node);
                drawNodeHandles(node); // 重新繪製以更新相鄰的中點位置
                saveState();
            });

            // 雙擊刪除頂點
            handle.on('dblclick', (e) => {
                if (!node.customPolygonPoints) {
                    node.customPolygonPoints = [...getNodePolygonPoints(node)];
                }
                if (node.customPolygonPoints.length <= 6) {
                    alert(I18N.t("路口多邊形至少需要 3 個頂點。"));
                    return;
                }
                const idx = e.target.getAttr('vertexIndex');
                node.customPolygonPoints.splice(idx, 2); // 移除該點的 x, y
                drawNodeHandles(node); // 重新繪製
                layer.batchDraw();
                updatePropertiesPanel(node);
                saveState();
            });

            layer.add(handle);
            node.konvaHandles.push(handle);
        }

        // 2. 繪製邊的中點控制點 (半透明粉色，拖曳即可新增頂點)
        for (let i = 0; i < polygonPoints.length; i += 2) {
            const nx = (i + 2 < polygonPoints.length) ? polygonPoints[i + 2] : polygonPoints[0];
            const ny = (i + 2 < polygonPoints.length) ? polygonPoints[i + 3] : polygonPoints[1];

            const mx = (polygonPoints[i] + nx) / 2;
            const my = (polygonPoints[i + 1] + ny) / 2;

            const midHandle = new Konva.Circle({
                x: mx, y: my, radius: 4, fill: '#fca5a5', stroke: 'white', strokeWidth: 1,
                hitStrokeWidth: 10,
                draggable: true, name: 'node-vertex-handle', scaleX: scale, scaleY: scale,
                opacity: 0.8
            });

            midHandle.on('dragstart', (e) => {
                if (!node.customPolygonPoints) {
                    node.customPolygonPoints = [...getNodePolygonPoints(node)];
                }
                // 在陣列中插入新的頂點座標
                const insertIdx = i + 2;
                node.customPolygonPoints.splice(insertIdx, 0, e.target.x(), e.target.y());
                e.target.setAttr('newVertexIndex', insertIdx);
            });

            midHandle.on('dragmove', (e) => {
                const idx = e.target.getAttr('newVertexIndex');
                node.customPolygonPoints[idx] = e.target.x();
                node.customPolygonPoints[idx + 1] = e.target.y();
                layer.batchDraw();
            });

            midHandle.on('dragend', () => {
                drawNodeHandles(node); // 將自己變成正式頂點，並重新產生新的中點
                updatePropertiesPanel(node);
                saveState();
            });

            layer.add(midHandle);
            node.konvaHandles.push(midHandle);
        }

        // 把所有點移到最上層
        node.konvaHandles.forEach(h => h.moveToTop());
        layer.batchDraw();
    }

    function drawWaypointHandles(link) {
        destroyWaypointHandles(link);

        const scale = 1 / stage.scaleX();

        // ==========================================
        // [新增] Lane-Based 多型控制點邏輯
        // ==========================================
        if (link.geometryType === 'lane-based' && link.strokes) {
            // [新增] 計算母體多邊形與起訖門，用於約束與磁吸
            const leftBound = link.strokes[0].points;
            const rightBound = link.strokes[link.strokes.length - 1].points;
            const boundingPoly = [...leftBound, ...[...rightBound].reverse()];
            const startGate = [leftBound[0], rightBound[0]];
            const endGate = [leftBound[leftBound.length - 1], rightBound[rightBound.length - 1]];

            link.strokes.forEach((stroke, strokeIdx) => {
                const isBoundary = (strokeIdx === 0 || strokeIdx === link.strokes.length - 1);
                const handleColor = isBoundary ? '#f97316' : '#eab308'; // 邊界用橘色，車道線用黃色

                // 1. 繪製實體控制點 (拖曳修改 / 雙擊刪除)
                for (let i = 0; i < stroke.points.length; i++) {
                    const pt = stroke.points[i];
                    const handle = new Konva.Circle({
                        x: pt.x, y: pt.y, radius: 5, fill: handleColor, stroke: 'white', strokeWidth: 1.5,
                        hitStrokeWidth: 10, draggable: true, name: 'waypoint-handle', scaleX: scale, scaleY: scale
                    });

                    handle.on('dragmove', (e) => {
                        let newPos = { x: e.target.x(), y: e.target.y() };

                        // 【新增】針對內部車道線的磁吸與邊界限制邏輯
                        if (!isBoundary) {
                            const isFirstPt = (i === 0);
                            const isLastPt = (i === stroke.points.length - 1);
                            const SNAP_DIST = 15 / stage.scaleX(); // 螢幕上的 15px 磁吸距離

                            // 1. 磁吸邏輯 (Snapping)
                            if (isFirstPt || isLastPt) {
                                let projStart = projectPointOnSegment(newPos, startGate[0], startGate[1]);
                                let distStart = vecLen(getVector(newPos, projStart));

                                let projEnd = projectPointOnSegment(newPos, endGate[0], endGate[1]);
                                let distEnd = vecLen(getVector(newPos, projEnd));

                                if (distStart < SNAP_DIST && distStart <= distEnd) {
                                    newPos = projStart;
                                } else if (distEnd < SNAP_DIST) {
                                    newPos = projEnd;
                                }
                            }

                            // 2. 邊界限制邏輯 (Constraining)
                            if (!isPointInPolygon(newPos, boundingPoly)) {
                                let closestPt = null;
                                let minDist = Infinity;
                                for (let j = 0; j < boundingPoly.length; j++) {
                                    let p1 = boundingPoly[j];
                                    let p2 = boundingPoly[(j + 1) % boundingPoly.length];
                                    let proj = projectPointOnSegment(newPos, p1, p2);
                                    let d = vecLen(getVector(newPos, proj));
                                    if (d < minDist) { minDist = d; closestPt = proj; }
                                }
                                if (closestPt) newPos = closestPt;
                            }

                            // 強制更新 Konva node 座標，防止滑鼠拉出去
                            e.target.x(newPos.x);
                            e.target.y(newPos.y);
                        }

                        stroke.points[i] = newPos;
                        updateLaneBasedGeometry(link);
                        drawLink(link);
                        updateDependencies(link);

                        // [新增] 同步更新可能顯示中的 Node 控制小圓點
                        if (selectedObject && selectedObject.type === 'Node') {
                            drawNodeHandles(selectedObject);
                        }

                        layer.batchDraw();
                    });

                    handle.on('dragend', () => {
                        drawWaypointHandles(link);
                        updatePropertiesPanel(link);
                        saveState();
                    });

                    handle.on('dblclick', () => {
                        if (stroke.points.length > 2) {
                            stroke.points.splice(i, 1);
                            updateLaneBasedGeometry(link);
                            drawLink(link);
                            drawWaypointHandles(link);
                            updateDependencies(link);
                            layer.batchDraw();
                            saveState();
                        } else {
                            alert(I18N.t ? I18N.t("A line must have at least 2 points.") : "A line must have at least 2 points.");
                        }
                    });

                    layer.add(handle);
                    link.konvaHandles.push(handle);
                }

                // 2. 繪製虛擬中點 (粉紅色，拖曳即新增節點)
                for (let i = 0; i < stroke.points.length - 1; i++) {
                    const p1 = stroke.points[i];
                    const p2 = stroke.points[i + 1];
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;

                    const midHandle = new Konva.Circle({
                        x: mx, y: my, radius: 4, fill: '#fca5a5', stroke: 'white', strokeWidth: 1,
                        hitStrokeWidth: 10, draggable: true, name: 'waypoint-handle', scaleX: scale, scaleY: scale, opacity: 0.8
                    });

                    midHandle.on('dragstart', (e) => {
                        stroke.points.splice(i + 1, 0, { x: e.target.x(), y: e.target.y() });
                    });

                    midHandle.on('dragmove', (e) => {
                        let newPos = { x: e.target.x(), y: e.target.y() };

                        // 【新增】中點剛被拉出來時，也受限於邊界 (簡化版，無磁吸)
                        if (!isBoundary && !isPointInPolygon(newPos, boundingPoly)) {
                            let closestPt = null;
                            let minDist = Infinity;
                            for (let j = 0; j < boundingPoly.length; j++) {
                                let pp1 = boundingPoly[j];
                                let pp2 = boundingPoly[(j + 1) % boundingPoly.length];
                                let proj = projectPointOnSegment(newPos, pp1, pp2);
                                let d = vecLen(getVector(newPos, proj));
                                if (d < minDist) { minDist = d; closestPt = proj; }
                            }
                            if (closestPt) newPos = closestPt;
                            e.target.x(newPos.x);
                            e.target.y(newPos.y);
                        }

                        stroke.points[i + 1] = newPos;
                        updateLaneBasedGeometry(link);
                        drawLink(link);
                        updateDependencies(link);

                        // [新增] 同步更新可能顯示中的 Node 控制小圓點
                        if (selectedObject && selectedObject.type === 'Node') {
                            drawNodeHandles(selectedObject);
                        }

                        layer.batchDraw();
                    });

                    midHandle.on('dragend', () => {
                        drawWaypointHandles(link);
                        updatePropertiesPanel(link);
                        saveState();
                    });

                    layer.add(midHandle);
                    link.konvaHandles.push(midHandle);
                }
            });

            link.konvaHandles.forEach(h => h.moveToTop());
            layer.batchDraw();
            return; // 執行完 Lane-based 邏輯直接跳出
        }

        // ==========================================
        // (以下為保留的 Standard Link 原本控制點邏輯)
        // ==========================================
        link.waypoints.forEach((waypoint, index) => {
            const handle = new Konva.Circle({
                x: waypoint.x, y: waypoint.y, radius: 5, fill: 'white', stroke: '#007bff', strokeWidth: 2,
                draggable: true, name: 'waypoint-handle', scaleX: scale, scaleY: scale,
            });

            handle.setAttr('meta', { linkId: link.id, waypointIndex: index });

            handle.on('dragmove', (e) => {
                const movedHandle = e.target;
                const meta = movedHandle.getAttr('meta');
                const targetLink = network.links[meta.linkId];

                targetLink.waypoints[meta.waypointIndex] = { x: movedHandle.x(), y: movedHandle.y() };

                // [新增] 如果是參數化路段，移動中心點後，即時觸發演算法重算所有標線
                if (targetLink.geometryType === 'parametric') {
                    generateParametricStrokes(targetLink);
                }

                drawLink(targetLink);
                updateDependencies(targetLink); // Ports 與 Beziers 會如橡皮筋般自動彈回定位

                if (selectedObject && selectedObject.id === targetLink.id) {
                    updatePropertiesPanel(targetLink);
                }

                // [新增] 同步更新可能顯示中的 Node 控制小圓點
                if (selectedObject && selectedObject.type === 'Node') {
                    drawNodeHandles(selectedObject);
                }

                layer.batchDraw();
            });

            layer.add(handle);
            link.konvaHandles.push(handle);
        });
    }
    function destroyConnectionControls(conn) {
        if (conn && conn.konvaControls && conn.konvaControls.length > 0) {
            conn.konvaControls.forEach(c => c.destroy());
            conn.konvaControls = [];
        }
    }

    function clearLaneIndicators() {
        laneIndicators.forEach(indicator => indicator.destroy());
        laneIndicators = [];
    }

    function drawConnectionGroupIndicators(groupObject) {
        clearLaneIndicators();
        if (!groupObject || !groupObject.connectionIds) return;

        const scale = 1 / stage.scaleX();

        for (const connId of groupObject.connectionIds) {
            const conn = network.connections[connId];
            if (!conn) continue;

            const sourceLink = network.links[conn.sourceLinkId];
            const destLink = network.links[conn.destLinkId];
            if (!sourceLink || !destLink) continue;

            const sourceLanePath = getLanePath(sourceLink, conn.sourceLaneIndex);
            const destLanePath = getLanePath(destLink, conn.destLaneIndex);

            if (sourceLanePath.length > 0 && destLanePath.length > 0) {
                const sourcePos = sourceLanePath[sourceLanePath.length - 1];
                const destPos = destLanePath[0];

                const indicatorFill = 'rgba(0, 150, 255, 0.8)';

                const sourceIndicator = new Konva.Circle({
                    x: sourcePos.x, y: sourcePos.y,
                    radius: PORT_RADIUS * 0.8,
                    fill: indicatorFill,
                    name: 'lane-indicator',
                    listening: false,
                    scaleX: scale, scaleY: scale
                });

                const destIndicator = new Konva.Circle({
                    x: destPos.x, y: destPos.y,
                    radius: PORT_RADIUS * 0.8,
                    fill: indicatorFill,
                    name: 'lane-indicator',
                    listening: false,
                    scaleX: scale, scaleY: scale
                });

                layer.add(sourceIndicator, destIndicator);
                laneIndicators.push(sourceIndicator, destIndicator);
            }
        }
        layer.batchDraw();
    }

    function drawConnectionControls(conn) {
        destroyConnectionControls(conn);

        const points = conn.bezierPoints;
        const scale = 1 / stage.scaleX();
        const controlColor = '#FFA500';

        const update = () => {
            const newPoints = [
                points[0],
                { x: controlPoint1.x(), y: controlPoint1.y() },
                { x: controlPoint2.x(), y: controlPoint2.y() },
                points[3]
            ];
            conn.bezierPoints = newPoints;
            conn.konvaBezier.points(newPoints.flatMap(p => [p.x, p.y]));
            handle1.points([points[0].x, points[0].y, controlPoint1.x(), controlPoint1.y()]);
            handle2.points([points[3].x, points[3].y, controlPoint2.x(), controlPoint2.y()]);
            layer.batchDraw();
        };

        const controlPoint1 = new Konva.Circle({
            x: points[1].x, y: points[1].y,
            radius: 4,
            fill: controlColor,
            draggable: true,
            name: 'control-point',
            scaleX: scale,
            scaleY: scale
        });

        const controlPoint2 = new Konva.Circle({
            x: points[2].x, y: points[2].y,
            radius: 4,
            fill: controlColor,
            draggable: true,
            name: 'control-point',
            scaleX: scale,
            scaleY: scale
        });

        const handle1 = new Konva.Line({
            points: [points[0].x, points[0].y, points[1].x, points[1].y],
            stroke: controlColor,
            strokeWidth: 1,
            dash: [4, 4],
            listening: false
        });

        const handle2 = new Konva.Line({
            points: [points[3].x, points[3].y, points[2].x, points[2].y],
            stroke: controlColor,
            strokeWidth: 1,
            dash: [4, 4],
            listening: false
        });

        controlPoint1.on('dragmove', update);
        controlPoint2.on('dragmove', update);

        conn.konvaControls = [handle1, handle2, controlPoint1, controlPoint2];
        conn.konvaControls.forEach(c => layer.add(c));
    }

    // 完整替換此函數
    // --- 新增 Parking Gate 相關函數 ---

    function createParkingGate(rect, type = 'entry', existingId = null) {
        const id = existingId || window.generateId('gate');

        const gate = {
            id,
            type: 'ParkingGate',
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            rotation: rect.rotation || 0, // <--- 新增：儲存旋轉角度
            gateType: type, // 'entry', 'exit', 'bidirectional'
            parkingLotId: null, // 關聯的停車場 ID
            konvaGroup: new Konva.Group({
                id,
                x: rect.x,
                y: rect.y,
                rotation: rect.rotation || 0, // <--- 新增：應用初始角度
                draggable: true,
                name: 'parking-gate-group'
            })
        };

        const visualRect = new Konva.Rect({
            width: rect.width,
            height: rect.height,
            fill: 'rgba(255, 165, 0, 0.5)', // Orange transparent
            stroke: 'orange',
            strokeWidth: 2,
            name: 'gate-rect'
        });

        const label = new Konva.Text({
            text: type === 'entry' ? 'IN' : (type === 'exit' ? 'OUT' : 'IO'),
            fontSize: 10,
            fill: 'black',
            align: 'center',
            width: rect.width,
            y: rect.height / 2 - 5,
            name: 'gate-label',
            listening: false
        });

        gate.konvaGroup.add(visualRect, label);

        // 拖曳結束時重新檢測關聯
        gate.konvaGroup.on('dragend', () => {
            gate.x = gate.konvaGroup.x();
            gate.y = gate.konvaGroup.y();
            // rotation 不會因為 drag 改變，但為了保險起見
            gate.rotation = gate.konvaGroup.rotation();
            checkGateAssociation(gate);
            updatePropertiesPanel(gate); // 更新面板顯示關聯結果
        });

        // 變形 (Resize & Rotate) 結束
        const tr = new Konva.Transformer({
            nodes: [gate.konvaGroup],
            keepRatio: false,
            rotateEnabled: true, // <--- 修改：啟用旋轉
            borderStroke: 'blue',
        });

        gate.konvaGroup.on('transformend', () => {
            gate.x = gate.konvaGroup.x();
            gate.y = gate.konvaGroup.y();
            gate.rotation = gate.konvaGroup.rotation(); // <--- 新增：更新角度

            // Konva 變形會改變 scale，我們將其標準化回 width/height
            gate.width = gate.konvaGroup.width() * gate.konvaGroup.scaleX();
            gate.height = gate.konvaGroup.height() * gate.konvaGroup.scaleY();

            // 重置 scale 以避免 Konva 複雜化 (保持視覺一致，將縮放應用到屬性)
            gate.konvaGroup.scaleX(1);
            gate.konvaGroup.scaleY(1);

            visualRect.width(gate.width);
            visualRect.height(gate.height);
            label.width(gate.width);
            label.y(gate.height / 2 - 5);

            checkGateAssociation(gate);
            updatePropertiesPanel(gate);
        });

        // 初始檢測關聯
        checkGateAssociation(gate);

        network.parkingGates[id] = gate;
        layer.add(gate.konvaGroup);
        return gate;
    }

    /**
     * 空間射線自動偵測：尋找指定位置最近的反向路段
     * @param {string} sourceLinkId - 來源路段 ID
     * @param {number} position - 在來源路段上的距離
     * @returns {string|null} - 找到的對向路段 ID，若無則回傳 null
     */
    function findOppositeLink(sourceLinkId, position) {
        const srcLink = network.links[sourceLinkId];
        if (!srcLink) return null;

        const { point: srcPt, vec: srcVec } = getPointAlongPolyline(srcLink.waypoints, position);

        let closestLinkId = null;
        let minDistance = 30; // 最大搜尋半徑 (30 公尺)

        Object.values(network.links).forEach(targetLink => {
            if (targetLink.id === sourceLinkId) return;

            // 將來源點投影到目標路段上
            const projResult = projectPointOnPolyline(srcPt, targetLink.waypoints);

            // 直接使用函數算好的最短直線距離
            const distance = projResult.pointDist;
            const projDist = projResult.dist; // 沿著目標路段的距離

            if (distance < minDistance) {
                // 檢查方向：取得目標路段在投影點的方向向量
                const { vec: targetVec } = getPointAlongPolyline(targetLink.waypoints, projDist);

                // 計算內積 (Dot Product)。若小於 -0.5 (夾角 > 120度)，則視為反向車道
                const dotProd = srcVec.x * targetVec.x + srcVec.y * targetVec.y;
                if (dotProd < -0.5) {
                    minDistance = distance;
                    closestLinkId = targetLink.id;
                }
            }
        });

        return closestLinkId;
    }

    function createRoadMarking(type, parentObj, positionOrPos) {
        const id = window.generateId('mark');
        let initX = 0, initY = 0, initPos = 0;
        let points = null;

        // 支援傳入多邊形陣列
        if (type === 'channelization') {
            points = positionOrPos;
            const xs = points.filter((_, i) => i % 2 === 0);
            const ys = points.filter((_, i) => i % 2 === 1);
            initX = Math.min(...xs);
            initY = Math.min(...ys);
        } else if (typeof positionOrPos === 'object' && positionOrPos !== null) {
            initX = positionOrPos.x; initY = positionOrPos.y;
        } else if (typeof positionOrPos === 'number') {
            initPos = positionOrPos;
        }

        const marking = {
            id, type: 'RoadMarking', markingType: type,
            linkId: parentObj && parentObj.type === 'Link' ? parentObj.id : null,
            nodeId: parentObj && parentObj.type === 'Node' ? parentObj.id : null,
            position: initPos, laneIndices: [],
            length: type === 'crosswalk' ? 3 : 5, width: 2.5,
            x: initX, y: initY, rotation: 0,
            isFree: type === 'channelization' ? true : false,
            spanToLinkId: null, signalGroupId: null,
            color: 'white', // 槽化線預設顏色
            points: points, // 槽化線多邊形頂點
            konvaHandles: [], // 槽化線控制點
            konvaGroup: new Konva.Group({ id, draggable: false, name: 'road-marking-group' })
        };

        if (marking.linkId) {
            const link = network.links[marking.linkId];
            if (link) marking.laneIndices = link.lanes.map((_, i) => i);
        }

        marking.konvaGroup.draggable(true);
        network.roadMarkings[id] = marking;
        layer.add(marking.konvaGroup);

        marking.konvaGroup.on('dragmove', function (e) {
            if (marking.nodeId || (marking.linkId && marking.isFree) || marking.markingType === 'channelization') {
                marking.x = this.x(); marking.y = this.y();
                updatePropertiesPanel(marking);
            }
            else if (marking.linkId) {
                const link = network.links[marking.linkId];
                const pointerPos = stage.getPointerPosition();
                const localPos = layer.getAbsoluteTransform().copy().invert().point(pointerPos);
                const { dist } = projectPointOnPolyline(localPos, link.waypoints);
                marking.position = Math.max(0, Math.min(dist, getPolylineLength(link.waypoints)));
                drawRoadMarking(marking);
                updatePropertiesPanel(marking);
            }
        });

        // 👇【新增這段 dragend 事件】確保拖曳結束時更新絕對座標並儲存
        marking.konvaGroup.on('dragend', function (e) {
            if (marking.markingType === 'channelization') {
                marking.x = this.x();
                marking.y = this.y();
                marking.rotation = this.rotation();

                const polygon = this.findOne('.marking-shape');
                if (polygon) {
                    const pts = polygon.points();
                    for (let i = 0; i < pts.length; i += 2) {
                        // 更新內部記憶體的絕對座標
                        const layerPos = this.getTransform().point({ x: pts[i], y: pts[i + 1] });
                        marking.points[i] = layerPos.x;
                        marking.points[i + 1] = layerPos.y;
                    }
                }
                // 如果拖曳時是選取狀態，重繪控制小藍點對齊
                if (selectedObject && selectedObject.id === marking.id) {
                    drawChannelizationHandles(marking);
                }
            }
            // 標線拖曳結束後，一律觸發系統存檔
            saveState();
        });
        drawRoadMarking(marking);
        return marking;
    }

    function drawRoadMarking(marking) {
        marking.konvaGroup.destroyChildren();

        // 槽化線邏輯保持不變
        if (marking.markingType === 'channelization') {
            const localPoints = marking.points.map((val, i) => (i % 2 === 0) ? val - marking.x : val - marking.y);
            marking.konvaGroup.position({ x: marking.x, y: marking.y });

            const color = marking.color || 'white';

            // --- [修改] 支援綠色三角島視覺 ---
            let strokeColor = 'white';
            let fillColor = 'rgba(255, 255, 255, 0.2)';
            if (color === 'yellow') {
                strokeColor = '#facc15';
                fillColor = 'rgba(250, 204, 21, 0.2)';
            } else if (color === 'green') {
                strokeColor = '#22c55e';
                fillColor = 'rgba(34, 197, 94, 0.6)'; // 不透明度調高
            }

            const polygon = new Konva.Line({
                points: localPoints, stroke: strokeColor, strokeWidth: 0.5,
                closed: true, fill: fillColor, listening: true, name: 'marking-shape'
            });
            // ---------------------------------

            marking.konvaGroup.add(polygon);
            marking.konvaGroup.rotation(marking.rotation);
            return;
        }

        const LINE_COLOR = 'white';
        const STROKE_WIDTH = 0.5;
        const HIT_WIDTH = 5; // 命中範圍加大到 5px

        const isLaneAttached = marking.linkId && !marking.isFree;

        if (isLaneAttached) {
            const link = network.links[marking.linkId];
            if (!link || (marking.laneIndices.length === 0 && marking.markingType !== 'crosswalk')) return;

            const { point, vec } = getPointAlongPolyline(link.waypoints, marking.position);
            const normal = getNormal(vec);
            let p1, p2;

            // =================================================================
            // ★★★ [核心修正] 輔助函數：取得實體標線上的精確座標 ★★★
            // 解決 Lane-Based 模式下寬度漸變，導致標線超出或短缺的問題
            // =================================================================
            const getStrokePoint = (targetLink, strokeIdx, refPt) => {
                if (!targetLink.strokes || targetLink.strokes.length === 0) return refPt;
                let stroke = targetLink.strokes[strokeIdx];
                // 防呆：若找不到指定標線，往外推至最外側邊界
                if (!stroke) stroke = (strokeIdx <= 0) ? targetLink.strokes[0] : targetLink.strokes[targetLink.strokes.length - 1];

                let minDist = Infinity;
                let bestPt = refPt;
                // 利用最短投影距離，找出曲線上最近的那一個點
                for (let i = 0; i < stroke.points.length - 1; i++) {
                    const proj = projectPointOnSegment(refPt, stroke.points[i], stroke.points[i + 1]);
                    const d = vecLen(getVector(refPt, proj));
                    if (d < minDist) { minDist = d; bestPt = proj; }
                }
                return bestPt;
            };

            const isLaneBased = (link.geometryType === 'lane-based' && link.strokes && link.strokes.length >= 2);

            if (marking.markingType === 'crosswalk') {
                // --- 斑馬線 ---
                if (isLaneBased) {
                    p1 = getStrokePoint(link, 0, point); // 絕對左邊界
                    p2 = getStrokePoint(link, link.strokes.length - 1, point); // 絕對右邊界
                } else {
                    const totalWidth = getLinkTotalWidth(link);
                    const halfWidth = totalWidth / 2;
                    p1 = add(point, scale(normal, halfWidth));
                    p2 = add(point, scale(normal, -halfWidth));
                }

                // 處理跨越邏輯 (對向車道)
                if (marking.spanToLinkId && network.links[marking.spanToLinkId]) {
                    const targetLink = network.links[marking.spanToLinkId];
                    const projResult = projectPointOnPolyline(point, targetLink.waypoints);
                    const { point: targetPt } = getPointAlongPolyline(targetLink.waypoints, projResult.dist);
                    const spanVec = getVector(point, targetPt);
                    const dist = vecLen(spanVec);

                    if (dist > 0) {
                        const spanDir = normalize(spanVec);
                        let w1, w2;

                        if (isLaneBased) {
                            w1 = vecLen(getVector(p1, p2)) / 2;
                        } else {
                            w1 = getLinkTotalWidth(link) / 2;
                        }

                        if (targetLink.geometryType === 'lane-based' && targetLink.strokes && targetLink.strokes.length >= 2) {
                            const tpL = getStrokePoint(targetLink, 0, targetPt);
                            const tpR = getStrokePoint(targetLink, targetLink.strokes.length - 1, targetPt);
                            w2 = vecLen(getVector(tpL, tpR)) / 2;
                        } else {
                            w2 = getLinkTotalWidth(targetLink) / 2;
                        }

                        p1 = add(point, scale(spanDir, -w1));
                        p2 = add(targetPt, scale(spanDir, w2));
                    }
                }

                // 繪製斑馬線
                const hitLine = new Konva.Line({
                    points: [p1.x, p1.y, p2.x, p2.y],
                    stroke: 'transparent', strokeWidth: Math.max(HIT_WIDTH, marking.length || 3),
                    listening: true, name: 'marking-hit-area'
                });
                marking.konvaGroup.add(hitLine);

                const line = new Konva.Line({
                    points: [p1.x, p1.y, p2.x, p2.y],
                    stroke: LINE_COLOR, strokeWidth: marking.length || 3, dash: [0.6, 0.6],
                    listening: false, name: 'marking-shape'
                });
                marking.konvaGroup.add(line);

            } else {
                // --- 其他標線 (停止線, 待轉區, 停等區) ---
                const selectedLanes = marking.laneIndices.sort((a, b) => a - b);

                if (isLaneBased) {
                    const minIdx = selectedLanes[0];
                    const maxIdx = selectedLanes[selectedLanes.length - 1];
                    // 在 Lane-Based 中，Lane 0 的左邊界是 Stroke 0，右邊界是 Stroke 1
                    p1 = getStrokePoint(link, minIdx, point);
                    p2 = getStrokePoint(link, maxIdx + 1, point);
                } else {
                    let startW = 0, endW = 0;
                    for (let i = 0; i < selectedLanes[0]; i++) startW += link.lanes[i].width;
                    for (let i = 0; i <= selectedLanes[selectedLanes.length - 1]; i++) endW += link.lanes[i].width;

                    const linkTotalW = getLinkTotalWidth(link);
                    const offsetLeft = startW - linkTotalW / 2;
                    const offsetRight = endW - linkTotalW / 2;

                    p1 = add(point, scale(normal, offsetLeft));
                    p2 = add(point, scale(normal, offsetRight));
                }

                if (marking.markingType === 'stop_line') {
                    const line = new Konva.Line({ points: [p1.x, p1.y, p2.x, p2.y], stroke: LINE_COLOR, strokeWidth: STROKE_WIDTH, hitStrokeWidth: HIT_WIDTH, listening: true, name: 'marking-shape' });
                    marking.konvaGroup.add(line);
                } else if (marking.markingType === 'waiting_area' || marking.markingType === 'two_stage_box') {
                    const startDist = Math.max(0, marking.position - marking.length);
                    const { point: backPoint, vec: backVec } = getPointAlongPolyline(link.waypoints, startDist);

                    let p3, p4;
                    if (isLaneBased) {
                        const minIdx = selectedLanes[0];
                        const maxIdx = selectedLanes[selectedLanes.length - 1];
                        // 注意 p3, p4 的順序 (構成封閉矩形 p1->p2->p3->p4)
                        p3 = getStrokePoint(link, maxIdx + 1, backPoint);
                        p4 = getStrokePoint(link, minIdx, backPoint);
                    } else {
                        const backNormal = getNormal(backVec);
                        let startW = 0, endW = 0;
                        for (let i = 0; i < selectedLanes[0]; i++) startW += link.lanes[i].width;
                        for (let i = 0; i <= selectedLanes[selectedLanes.length - 1]; i++) endW += link.lanes[i].width;
                        const linkTotalW = getLinkTotalWidth(link);
                        const offsetLeft = startW - linkTotalW / 2;
                        const offsetRight = endW - linkTotalW / 2;

                        p3 = add(backPoint, scale(backNormal, offsetRight));
                        p4 = add(backPoint, scale(backNormal, offsetLeft));
                    }

                    const rect = new Konva.Line({ points: [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y], closed: true, stroke: LINE_COLOR, strokeWidth: STROKE_WIDTH, hitStrokeWidth: HIT_WIDTH, fill: 'rgba(0,0,0,0.01)', listening: true, name: 'marking-shape' });
                    marking.konvaGroup.add(rect);
                }
            }

            marking.konvaGroup.position({ x: 0, y: 0 });
            marking.konvaGroup.rotation(0);

        } else {
            // --- 自由模式 ---
            const rectWidth = marking.length || 3;
            let rectHeight = marking.width || 2.5;

            if (marking.markingType === 'crosswalk') {
                if (!marking.width) marking.width = 10;
                rectHeight = marking.width;

                const hitLine = new Konva.Line({
                    points: [0, -rectHeight / 2, 0, rectHeight / 2],
                    stroke: 'transparent',
                    strokeWidth: Math.max(HIT_WIDTH, rectWidth),
                    listening: true,
                    name: 'marking-hit-area'
                });
                const line = new Konva.Line({
                    points: [0, -rectHeight / 2, 0, rectHeight / 2],
                    stroke: LINE_COLOR,
                    strokeWidth: rectWidth,
                    dash: [0.6, 0.6],
                    listening: false,
                    name: 'marking-shape'
                });
                marking.konvaGroup.add(hitLine, line);
            } else {
                const rect = new Konva.Rect({
                    x: -rectWidth / 2, y: -rectHeight / 2, width: rectWidth, height: rectHeight,
                    stroke: LINE_COLOR, strokeWidth: STROKE_WIDTH, hitStrokeWidth: HIT_WIDTH, fill: 'rgba(0,0,0,0.01)', listening: true, name: 'marking-shape'
                });
                marking.konvaGroup.add(rect);
            }

            marking.konvaGroup.position({ x: marking.x, y: marking.y });
            marking.konvaGroup.rotation(marking.rotation);
        }
    }
    // --- END: ROAD MARKING FUNCTIONS ---

    // 檢測 Gate 是否與任何停車場邊緣重疊/相交
    // 檢測 Gate 是否與任何停車場邊緣重疊/相交
    function checkGateAssociation(gate) {
        gate.parkingLotId = null; // 重置

        // <--- 修改：使用 getClientRect() 獲取考慮了旋轉後的實際邊界框
        // 注意：getClientRect 會返回相對於 Layer 的絕對座標
        const gateRect = gate.konvaGroup.getClientRect();

        // 簡單的 AABB 碰撞檢測 + 稍微寬鬆的邊界檢查
        for (const plId in network.parkingLots) {
            const pl = network.parkingLots[plId];
            // 取得停車場的邊界框 (假設 Konva Group 位置正確)
            const plRect = pl.konvaGroup.getClientRect();

            if (Konva.Util.haveIntersection(gateRect, plRect)) {
                // 如果矩形相交，我們再進一步假設這就是關聯的停車場
                gate.parkingLotId = pl.id;

                // 視覺回饋：變色表示已連結
                const rectShape = gate.konvaGroup.findOne('.gate-rect');
                if (rectShape) rectShape.stroke('green');
                break;
            }
        }

        if (!gate.parkingLotId) {
            const rectShape = gate.konvaGroup.findOne('.gate-rect');
            if (rectShape) rectShape.stroke('orange'); // 未連結
        }
    }

    function updateGateVisual(gate) {
        const label = gate.konvaGroup.findOne('.gate-label');
        if (label) {
            label.text(gate.gateType === 'entry' ? 'IN' : (gate.gateType === 'exit' ? 'OUT' : 'IO'));
        }
        layer.batchDraw();
    }

    // =========================================================================
    // [UI 優化輔助函式] 置頂物件識別卡 & 手風琴摺疊面板
    // =========================================================================
    function renderObjectHeaderHTML(obj) {
        const iconMap = {
            'Link': 'fa-road',
            'Node': 'fa-arrows-to-circle',
            'PointDetector': 'fa-video',
            'SectionDetector': 'fa-video-slash',
            'RoadSign': 'fa-sign-hanging',
            'Connection': 'fa-link',
            'ConnectionGroup': 'fa-code-branch',
            'Origin': 'fa-circle-play',
            'Destination': 'fa-flag-checkered',
            'ParkingLot': 'fa-square-parking',
            'ParkingGate': 'fa-door-open',
            'Zone': 'fa-city',
            'RoadMarking': 'fa-lines-leaning',
            'Background': 'fa-image',
            'Pushpin': 'fa-thumbtack',
            'Overpass': 'fa-layer-group'
        };
        const icon = iconMap[obj.type] || 'fa-cube';
        const displayName = (obj.name && obj.name !== obj.id) ? `${obj.name} (${obj.id})` : obj.id;

        return `
            <div class="prop-object-header">
                <div class="prop-object-title-group">
                    <div class="prop-object-icon"><i class="fa-solid ${icon}"></i></div>
                    <div class="prop-object-meta">
                        <span class="prop-object-type">${obj.type}</span>
                        <span class="prop-object-id" title="${displayName}">${displayName}</span>
                    </div>
                </div>
                <button type="button" id="btn-universal-delete-obj" class="btn-header-delete" title="Delete (Del)">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
    }

    function renderAccordionHTML(title, iconClass, bodyHtml, isOpen = true, badgeText = '') {
        const openAttr = isOpen ? 'open' : '';
        const badgeHtml = badgeText ? `<span class="prop-accordion-badge">${badgeText}</span>` : '';
        return `
            <details class="prop-accordion" ${openAttr}>
                <summary>
                    <span style="display:flex; align-items:center; gap:6px;">
                        <i class="${iconClass}" style="color:var(--primary); width:14px; text-align:center;"></i>
                        <span>${title}</span>
                    </span>
                    ${badgeHtml}
                    <i class="fa-solid fa-chevron-down prop-accordion-arrow"></i>
                </summary>
                <div class="prop-accordion-body">
                    ${bodyHtml}
                </div>
            </details>
        `;
    }

    // =========================================================================
    // [核心重構] 更新右側屬性面板
    // =========================================================================
    function updatePropertiesPanel(obj) {
        propertiesContent.innerHTML = '';

        // -----------------------------------------------------------------
        // A. 工具專屬設定面板 (當尚未選取任何物件 !obj 時)
        // -----------------------------------------------------------------

        // 1. Add Zone 工具
        if (activeTool === 'add-zone' && !obj) {
            const _t = (key) => (window.I18N && window.I18N.t ? window.I18N.t(key) : key);
            const isRedraw = !!window.redrawingZone;
            const zoneName = isRedraw ? (window.redrawingZone.name || window.redrawingZone.id) : '';
            propertiesContent.innerHTML = `
                <div class="prop-section-header">${isRedraw ? _t('Redraw Boundary') : _t('Land Use Zoning')}</div>
                <div class="prop-card">
                    <div style="font-weight:700; font-size:0.85rem; color:#ea580c; margin-bottom:6px;">
                        <i class="fa-solid fa-draw-polygon"></i> ${isRedraw ? `${_t('Redraw Boundary')}: ${zoneName}` : _t('Land Use Zone (Z)')}
                    </div>
                    <div style="font-size:0.78rem; color:var(--text-muted); line-height:1.6;">
                        • ${_t('Click to add zone polygon points. Double-click to finish, Esc to cancel.')}<br>
                        • Press <kbd style="background:#e2e8f0; padding:1px 5px; border-radius:3px;">Esc</kbd> to cancel.
                    </div>
                </div>`;
            return;
        }

        // 2. Add Marking 工具 (分段控制器)
        if (activeTool === 'add-marking' && !obj) {
            propertiesContent.innerHTML = `
                <div class="prop-section-header">Marking Tool Mode</div>
                <div class="segmented-control">
                    <label class="segmented-option">
                        <input type="radio" name="markingMode" value="standard" ${markingMode === 'standard' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-Lines-leaning"></i> Standard</span>
                    </label>
                    <label class="segmented-option">
                        <input type="radio" name="markingMode" value="channelization" ${markingMode === 'channelization' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-draw-polygon"></i> 槽化線</span>
                    </label>
                </div>
                <div class="prop-hint">
                    <i class="fa-solid fa-circle-info"></i> 
                    <b>Standard:</b> 點擊路段或路口放置停止線/行穿線/待轉區。<br>
                    <b>槽化線:</b> 連續點擊繪製多邊形，雙擊完成。
                </div>`;
            document.querySelectorAll('input[name="markingMode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    markingMode = e.target.value;
                    stage.container().style.cursor = markingMode === 'channelization' ? 'crosshair' : 'pointer';
                    if (tempShape) { tempShape.destroy(); tempShape = null; layer.batchDraw(); }
                });
            });
            return;
        }

        // 3. Connect Lanes 工具 (分段控制器)
        if (activeTool === 'connect-lanes' && !obj) {
            propertiesContent.innerHTML = `
                <div class="prop-section-header">Connection Tool Mode</div>
                <div class="segmented-control">
                    <label class="segmented-option">
                        <input type="radio" name="connMode" value="manual" ${connectMode === 'manual' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-hand-pointer"></i> 手動</span>
                    </label>
                    <label class="segmented-option">
                        <input type="radio" name="connMode" value="box" ${connectMode === 'box' ? 'checked' : ''}>
                        <span><i class="fa-regular fa-square-check"></i> 框選連線</span>
                    </label>
                    <label class="segmented-option">
                        <input type="radio" name="connMode" value="merge" ${connectMode === 'merge' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-code-merge"></i> 框選合併</span>
                    </label>
                </div>
                <div class="prop-card" style="font-size:0.78rem; color:var(--text-muted); line-height:1.5;">
                    <div style="margin-bottom:6px;"><strong style="color:var(--text-main);">手動 (Manual):</strong> 由紅點拖曳至藍點建立車道連線。</div>
                    <div style="margin-bottom:6px;"><strong style="color:var(--primary);">框選連線 (Box Connect):</strong> 框選路口範圍自動配對直行與左右轉車道。</div>
                    <div><strong style="color:#e11d48;">框選合併 (Stitch Merge):</strong> 將兩條車道數與方向一致的斷開路段縫合為一。</div>
                </div>
            `;
            document.querySelectorAll('input[name="connMode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    connectMode = e.target.value;
                    stage.container().style.cursor = (connectMode === 'box' || connectMode === 'merge') ? 'crosshair' : 'default';
                });
            });
            return;
        }

        // 4. Add Link 工具
        if (activeTool === 'add-link' && !obj) {
            const twoWayDisplay = linkCreationSettings.isTwoWay ? 'block' : 'none';
            const laneBasedDisplay = linkCreationSettings.mode === 'lane-based' ? 'block' : 'none';
            const standardDisplay = (linkCreationSettings.mode === 'standard' || linkCreationSettings.mode === 'parametric') ? 'block' : 'none';

            let strokeOptionsHtml = '';
            for (const [key, prop] of Object.entries(STROKE_TYPES)) {
                const isChecked = draftCurrentStrokeType === key ? 'checked' : '';
                let previewCss = '';
                if (prop.dual) {
                    const lStyle = prop.leftDash.length > 0 ? 'dashed' : 'solid';
                    const rStyle = prop.rightDash.length > 0 ? 'dashed' : 'solid';
                    previewCss = `border-top: 2px ${lStyle} ${prop.color}; border-bottom: 2px ${rStyle} ${prop.color}; height: 6px; width: 24px;`;
                } else {
                    const style = prop.dash && prop.dash.length > 0 ? 'dashed' : 'solid';
                    previewCss = `border-top: 2px ${style} ${prop.color}; width: 24px; height: 0px;`;
                }

                strokeOptionsHtml += `
                    <label style="cursor:pointer; display:flex; align-items:center; gap:8px; margin-bottom:5px; padding:5px 8px; border:1px solid var(--border-light); border-radius:6px; background:#fff;">
                        <input type="radio" name="strokeType" value="${key}" ${isChecked}>
                        <div style="background:#475569; padding:4px; border-radius:3px; display:flex; align-items:center; justify-content:center;">
                            <div style="${previewCss}"></div>
                        </div>
                        <span style="font-size:0.75rem; font-weight:600;">${prop.label}</span>
                    </label>
                `;
            }

            propertiesContent.innerHTML = `
                <div class="prop-section-header">Link Creation Mode</div>
                <div class="segmented-control">
                    <label class="segmented-option" title="自動生成轉向附加車道">
                        <input type="radio" name="linkMode" value="parametric" ${linkCreationSettings.mode === 'parametric' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-sliders"></i> 參數化</span>
                    </label>
                    <label class="segmented-option" title="固定車道寬度">
                        <input type="radio" name="linkMode" value="standard" ${linkCreationSettings.mode === 'standard' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-road"></i> 標準</span>
                    </label>
                    <label class="segmented-option" title="手繪不規則標線">
                        <input type="radio" name="linkMode" value="lane-based" ${linkCreationSettings.mode === 'lane-based' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-pen-nib"></i> 手繪</span>
                    </label>
                </div>

                <!-- Lane-Based Mode 專用控制面板 -->
                <div id="lane-based-draft-panel" style="display: ${laneBasedDisplay};" class="prop-card">
                    <div style="font-weight:700; margin-bottom:8px; font-size:0.8rem; color:var(--text-main);">1. 選擇要繪製的標線型態</div>
                    <div style="max-height:220px; overflow-y:auto; padding-right:2px;">
                        ${strokeOptionsHtml}
                    </div>
                    <div class="prop-stat-box" style="margin:10px 0;">
                        <span class="prop-stat-label">已繪製草稿標線 (需至少2條邊界)</span>
                        <span class="prop-stat-value">${draftLaneStrokes.length} 條</span>
                    </div>
                    <button id="btn-generate-lane-based" class="btn-primary" style="width:100%; margin-bottom:6px;">
                        <i class="fa-solid fa-code-branch"></i> Generate Link
                    </button>
                    <button id="btn-clear-drafts" class="btn-soft" style="color:var(--danger); border-color:#fecaca;">
                        <i class="fa-solid fa-trash-can"></i> Clear Drafts
                    </button>
                </div>

                <!-- Standard / Parametric Mode 專用設定 -->
                <div id="standard-settings-panel" style="display: ${standardDisplay};" class="prop-card">
                    <div class="prop-section-header" style="margin-top:0;">Road Configuration</div>
                    
                    <div style="margin-bottom:10px;">
                        <span class="prop-label" style="display:block; margin-bottom:4px;">Directionality</span>
                        <div class="segmented-control" style="margin-bottom:0;">
                            <label class="segmented-option">
                                <input type="radio" name="linkType" value="one-way" ${!linkCreationSettings.isTwoWay ? 'checked' : ''}>
                                <span>單向 (One-way)</span>
                            </label>
                            <label class="segmented-option">
                                <input type="radio" name="linkType" value="two-way" ${linkCreationSettings.isTwoWay ? 'checked' : ''}>
                                <span>雙向 (Two-way)</span>
                            </label>
                        </div>
                    </div>

                    <div id="driving-side-group" style="display: ${twoWayDisplay}; margin-bottom:10px;">
                        <span class="prop-label" style="display:block; margin-bottom:4px;">Driving Side</span>
                        <div class="segmented-control" style="margin-bottom:0;">
                            <label class="segmented-option">
                                <input type="radio" name="driveSide" value="right" ${linkCreationSettings.drivingSide === 'right' ? 'checked' : ''}>
                                <span>靠右行駛 (RHT)</span>
                            </label>
                            <label class="segmented-option">
                                <input type="radio" name="driveSide" value="left" ${linkCreationSettings.drivingSide === 'left' ? 'checked' : ''}>
                                <span>靠左行駛 (LHT)</span>
                            </label>
                        </div>
                    </div>

                    <div class="prop-row" id="median-width-group" style="display: ${twoWayDisplay ? 'flex' : 'none'};">
                        <span class="prop-label">Median Width (m)</span>
                        <input type="number" id="creation-median" class="prop-input" value="${linkCreationSettings.medianWidth}" min="0" step="0.5" style="max-width:90px;">
                    </div>

                    <div class="prop-row" style="margin-top:8px;">
                        <span class="prop-label">Lanes per Direction</span>
                        <input type="number" id="creation-lanes" class="prop-input" value="${linkCreationSettings.lanesPerDir}" min="1" max="10" style="max-width:90px;">
                    </div>
                </div>
            `;

            document.querySelectorAll('input[name="linkMode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    linkCreationSettings.mode = e.target.value;
                    updatePropertiesPanel(null);
                });
            });

            document.querySelectorAll('input[name="strokeType"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    draftCurrentStrokeType = e.target.value;
                });
            });

            document.getElementById('btn-clear-drafts')?.addEventListener('click', () => {
                draftLaneStrokes.forEach(s => s.konvaLine.destroy());
                draftLaneStrokes = [];
                if (tempShape) { tempShape.destroy(); tempShape = null; }
                layer.batchDraw();
                updatePropertiesPanel(null);
            });

            document.getElementById('btn-generate-lane-based')?.addEventListener('click', () => {
                const bounds = draftLaneStrokes.filter(s => s.type === 'boundary');
                if (bounds.length < 2) {
                    alert("Require at least 2 Boundary lines (Left & Right edge) to generate.");
                    return;
                }
                generateLaneBasedLink(draftLaneStrokes);
                draftLaneStrokes.forEach(s => s.konvaLine.destroy());
                draftLaneStrokes = [];
                layer.batchDraw();
                updatePropertiesPanel(null);
                setTool('select');
            });

            document.querySelectorAll('input[name="linkType"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    linkCreationSettings.isTwoWay = (e.target.value === 'two-way');
                    const sideGroup = document.getElementById('driving-side-group');
                    const medianGroup = document.getElementById('median-width-group');
                    if (sideGroup) sideGroup.style.display = linkCreationSettings.isTwoWay ? 'block' : 'none';
                    if (medianGroup) medianGroup.style.display = linkCreationSettings.isTwoWay ? 'flex' : 'none';
                });
            });

            document.querySelectorAll('input[name="driveSide"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    linkCreationSettings.drivingSide = e.target.value;
                });
            });

            document.getElementById('creation-median')?.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 0;
                linkCreationSettings.medianWidth = val;
                e.target.value = val;
            });

            document.getElementById('creation-lanes')?.addEventListener('change', (e) => {
                let val = parseInt(e.target.value) || 1;
                if (val < 1) val = 1;
                linkCreationSettings.lanesPerDir = val;
                e.target.value = val;
            });
            return;
        }

        // 5. Add Intersection 工具
        if (activeTool === 'add-intersection' && !obj) {
            propertiesContent.innerHTML = `
                <div class="prop-section-header">Intersection Tool Mode</div>
                <div class="segmented-control">
                    <label class="segmented-option">
                        <input type="radio" name="intMode" value="zone" ${intersectionMode === 'zone' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-Vector-square"></i> Zone (挖空)</span>
                    </label>
                    <label class="segmented-option">
                        <input type="radio" name="intMode" value="point" ${intersectionMode === 'point' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-compress"></i> Point (聚合)</span>
                    </label>
                </div>
                <div class="prop-card" style="font-size:0.78rem; color:var(--text-muted); line-height:1.5;">
                    <div style="margin-bottom:6px;"><strong style="color:var(--text-main);">Zone Mode (Clip):</strong> 挖除多邊形內的路段，形成寬敞的路口廣場。</div>
                    <div><strong style="color:var(--text-main);">Point Mode (Snap):</strong> 僅裁切交叉重疊處並將端點聚合至中心。</div>
                </div>
                <div class="prop-hint"><i class="fa-solid fa-pen-nib"></i> 左鍵點擊繪製外框，雙擊完成建立。</div>
            `;
            document.querySelectorAll('input[name="intMode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    intersectionMode = e.target.value;
                });
            });
            return;
        }

        // 6. SubNetwork 工具
        if (activeTool === 'subnetwork' && !obj && window.SubNetworkTool) {
            window.SubNetworkTool.updatePropertiesPanel();
            return;
        }

        // 7. Add Background 工具 (圖層清單)
        if (activeTool === 'add-background' && !obj) {
            let content = `
                <div class="prop-section-header">Background Layers</div>
                <div class="prop-hint" style="margin-top:0; margin-bottom:8px;">
                    <i class="fa-solid fa-image"></i> 點擊畫布空白處新增底圖，或從下方選擇圖層進行編輯。
                </div>`;

            const bgs = Object.values(network.backgrounds);
            if (bgs.length > 0) {
                content += `<div style="display:flex; flex-direction:column; gap:6px;">`;
                [...bgs].reverse().forEach(bg => {
                    const imgThumb = bg.imageDataUrl
                        ? `<img src="${bg.imageDataUrl}" style="width:38px; height:38px; object-fit:cover; border-radius:4px; border:1px solid #e2e8f0;">`
                        : `<div style="width:38px; height:38px; background:#e2e8f0; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8;">N/A</div>`;

                    content += `
                    <div class="prop-card bg-layer-item" data-id="${bg.id}" style="display:flex; align-items:center; justify-content:space-between; padding:8px; margin-bottom:0; cursor:pointer; transition:all 0.2s;">
                        <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                            ${imgThumb}
                            <div style="display:flex; flex-direction:column; overflow:hidden;">
                                <span style="font-weight:600; font-size:0.82rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width: 140px;" title="${bg.name || bg.id}">${bg.name || bg.id}</span>
                                <span style="font-size:0.7rem; color:var(--text-muted);">${bg.locked ? '<i class="fa-solid fa-lock" style="color:#ef4444;"></i> Locked' : '<i class="fa-solid fa-lock-open" style="color:#10b981;"></i> Unlocked'}</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:4px;">
                            <button class="btn-mini btn-bg-toggle-lock" data-id="${bg.id}" title="${bg.locked ? 'Unlock' : 'Lock'}" style="background:#fff; border:1px solid #e2e8f0; color:${bg.locked ? '#ef4444' : '#64748b'};">
                                <i class="fa-solid ${bg.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                            </button>
                            <button class="btn-mini btn-bg-delete" data-id="${bg.id}" title="Delete" style="background:#fff; border:1px solid #fecaca; color:#ef4444;">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>`;
                });
                content += `</div>`;
            } else {
                content += `
                <div style="text-align:center; padding:24px 0; color:#cbd5e1;">
                    <i class="fa-regular fa-images" style="font-size:2rem; margin-bottom:8px;"></i>
                    <p style="font-size:0.85rem; margin:0;">No background layers yet.</p>
                </div>`;
            }

            propertiesContent.innerHTML = content;

            function clearBgHighlights() {
                layer.find('.bg-list-highlight').forEach(shape => shape.destroy());
                layer.batchDraw();
            }

            function highlightBg(bgId) {
                const bg = network.backgrounds[bgId];
                if (!bg || !bg.konvaGroup) return;
                clearBgHighlights();
                const scaleFactor = stage.scaleX() * bg.konvaGroup.scaleX();
                const highlightRect = new Konva.Rect({
                    x: 0, y: 0,
                    width: bg.konvaGroup.width(),
                    height: bg.konvaGroup.height(),
                    stroke: 'red',
                    strokeWidth: 2 / scaleFactor,
                    listening: false,
                    name: 'bg-list-highlight'
                });
                bg.konvaGroup.add(highlightRect);
                highlightRect.moveToTop();
                layer.batchDraw();
            }

            document.querySelectorAll('.bg-layer-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    clearBgHighlights();
                    const bg = network.backgrounds[item.dataset.id];
                    if (bg) selectObject(bg);
                });
                item.addEventListener('mouseenter', () => {
                    item.style.borderColor = 'var(--primary)';
                    item.style.backgroundColor = '#eef2ff';
                    highlightBg(item.dataset.id);
                });
                item.addEventListener('mouseleave', () => {
                    item.style.borderColor = 'var(--border-light)';
                    item.style.backgroundColor = '#ffffff';
                    clearBgHighlights();
                });
            });

            document.querySelectorAll('.btn-bg-toggle-lock').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const bg = network.backgrounds[btn.dataset.id];
                    if (bg) {
                        bg.locked = !bg.locked;
                        if (bg.konvaGroup) {
                            bg.konvaGroup.draggable(!bg.locked);
                            bg.konvaGroup.listening(!bg.locked);
                            if (bg.konvaHitArea) bg.konvaHitArea.listening(!bg.locked);
                        }
                        updatePropertiesPanel(null);
                        saveState();
                        layer.batchDraw();
                    }
                });
            });

            document.querySelectorAll('.btn-bg-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const bgId = btn.dataset.id;
                    if (confirm(typeof I18N !== 'undefined' && I18N.t ? I18N.t("Delete this background layer?") : "Delete this background layer?")) {
                        clearBgHighlights();
                        deleteBackground(bgId);
                        updatePropertiesPanel(null);
                        saveState();
                    }
                });
            });

            if (typeof I18N !== 'undefined' && I18N.translateDOM) {
                I18N.translateDOM(propertiesContent);
            }
            return;
        }

        // 8. 未選取任何物件時的空狀態
        if (!obj) {
            propertiesContent.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-arrow-pointer"></i>
                    <p>Select an element to edit</p>
                </div>`;
            return;
        }

        // -----------------------------------------------------------------
        // B. 已選取物件面板 (Unified Object Inspector)
        // -----------------------------------------------------------------
        let content = '';

        // 若從 Node 點進 Connection / ConnectionGroup，提供返回按鈕
        if (lastSelectedNodeForProperties && (obj.type === 'Connection' || obj.type === 'ConnectionGroup')) {
            content += `
                <button id="back-to-node-btn" class="btn-soft">
                    <i class="fa-solid fa-arrow-left"></i> Back to Node ${lastSelectedNodeForProperties.id}
                </button>`;
        }

        // 1. 統一置頂物件識別卡 (含類型、名稱/ID、右上角刪除圖示)
        content += renderObjectHeaderHTML(obj);

        // 2. Connection / ConnectionGroup 頂部號誌群組快速綁定
        if (obj.type === 'Connection' || obj.type === 'ConnectionGroup') {
            const nodeId = obj.nodeId;
            const tfl = network.trafficLights[nodeId];
            if (tfl) ensureTflGroupSets(tfl);

            const hasAnyGroupSet = tfl && tfl.signalGroupSets && Object.keys(tfl.signalGroupSets).length > 0;
            if (hasAnyGroupSet && (Object.keys(tfl.signalGroups || {}).length > 0 || Object.keys(tfl.signalGroupSets).length > 1)) {
                let currentGroupId = '';
                const firstConnId = (obj.type === 'Connection') ? obj.id : obj.connectionIds[0];

                if (firstConnId && tfl.signalGroups) {
                    for (const group of Object.values(tfl.signalGroups)) {
                        if (group.connIds.includes(firstConnId)) {
                            currentGroupId = group.id;
                            break;
                        }
                    }
                }

                content += `
                    <div class="prop-card" style="background:#f8fafc; margin-bottom:0;">
                        <div class="prop-row">
                            <span class="prop-label" style="font-weight:600; color:#6d28d9;"><i class="fa-solid fa-microchip"></i> 硬體群組</span>
                            <select id="prop-conn-groupset-select" class="prop-select">
                                ${Object.values(tfl.signalGroupSets).map(gs =>
                    `<option value="${gs.id}" ${gs.id === tfl.activeGroupSetId ? 'selected' : ''}>${gs.name || gs.id} (${Object.keys(gs.groups || {}).length}組)</option>`
                ).join('')}
                            </select>
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label" style="font-weight:600;"><i class="fa-solid fa-traffic-light"></i> 點燈群組</span>
                            <select id="prop-tfl-group" class="prop-select">
                                <option value="">None</option>
                                ${Object.keys(tfl.signalGroups || {}).map(id =>
                    `<option value="${id}" ${id === currentGroupId ? 'selected' : ''}>${id}</option>`
                ).join('')}
                            </select>
                        </div>
                    </div>`;
            }
        }

        // 3. 各類型物件專屬內容
        switch (obj.type) {
            // =============================================================
            // CASE: LINK (路段)
            // =============================================================
            case 'Link': {
                const getLinkTabClass = (tabName) => lastActiveLinkTab === tabName ? 'active' : '';
                const outgoingConns = Object.values(network.connections)
                    .filter(c => c.sourceLinkId === obj.id)
                    .sort((a, b) => a.sourceLaneIndex - b.sourceLaneIndex || a.destLaneIndex - b.destLaneIndex);

                content += `
                    <div class="prop-tab-header" style="margin-bottom:4px;">
                        <button class="prop-tab-btn ${getLinkTabClass('tab-link-general')}" data-target="tab-link-general">
                            <i class="fa-solid fa-road"></i> General
                        </button>
                        <button class="prop-tab-btn ${getLinkTabClass('tab-link-conns')}" data-target="tab-link-conns">
                            <i class="fa-solid fa-link"></i> Connections (${outgoingConns.length})
                        </button>
                    </div>`;

                // --- TAB 1: GENERAL ---
                content += `<div id="tab-link-general" class="prop-tab-content ${getLinkTabClass('tab-link-general')}">`;

                // (A) 頂部唯讀幾何儀表板
                content += `
                    <div class="prop-stat-grid cols-3" style="margin-bottom:10px;">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Length</span>
                            <span class="prop-stat-value">${getPolylineLength(obj.waypoints).toFixed(1)}m</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Width</span>
                            <span class="prop-stat-value">${getLinkTotalWidth(obj).toFixed(1)}m</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Lanes</span>
                            <span class="prop-stat-value">${obj.lanes.length}L</span>
                        </div>
                    </div>`;

                // (B) 基本與雙向設定卡
                const isLaneBasedFreeform = (obj.geometryType === 'lane-based');
                content += `<div class="prop-card">`;
                content += `
                    <div class="prop-row">
                        <span class="prop-label">Name</span>
                        <input type="text" id="prop-link-name" class="prop-input" value="${obj.name || obj.id}">
                    </div>
                    <div class="prop-row">
                        <span class="prop-label" title="僅影響編輯器顯示，方便對齊底圖">Opacity</span>
                        <div style="display:flex; align-items:center; gap:8px; flex:1;">
                            <input type="range" id="prop-link-opacity" min="0" max="1" step="0.1" value="${obj.roadOpacity !== undefined ? obj.roadOpacity : 1}" style="flex:1; cursor:pointer;">
                            <span id="prop-link-opacity-val" style="font-size:0.75rem; width:24px; text-align:right; font-family:'Roboto Mono',monospace;">${obj.roadOpacity !== undefined ? obj.roadOpacity : 1}</span>
                        </div>
                    </div>
                    <div class="prop-row" style="margin-bottom:0;">
                        <span class="prop-label">Lane Count</span>
                        <input type="number" id="prop-lanes" class="prop-input" value="${obj.lanes.length}" min="1" max="10" style="max-width:80px;" ${isLaneBasedFreeform ? 'disabled title="手繪標線模式由標線數量決定"' : (obj.geometryType === 'parametric' ? 'disabled title="請由下方參數化設定或 Synchro 面板調整"' : '')}>
                    </div>`;

                if (obj.pairInfo && obj.pairInfo.pairId) {
                    const pairLink = network.links[obj.pairInfo.pairId];
                    if (pairLink) {
                        content += `
                            <div style="border-top:1px dashed var(--border-light); margin-top:8px; padding-top:8px;">
                                <div class="prop-row" style="margin-bottom:4px;">
                                    <span class="prop-label" style="color:var(--primary); font-weight:600;"><i class="fa-solid fa-arrows-left-right"></i> Paired Link</span>
                                    <span style="font-size:0.78rem; font-weight:600; color:#475569;">${pairLink.name || pairLink.id}</span>
                                </div>
                                <div class="prop-row" style="margin-bottom:0;">
                                    <span class="prop-label">Median Width (m)</span>
                                    <input type="number" id="prop-edit-median" class="prop-input" value="${obj.pairInfo.medianWidth}" step="0.5" min="0" style="max-width:80px;">
                                </div>
                            </div>`;
                    }
                }
                content += `</div>`;

                // (C) 手風琴 1：Synchro 視覺化車道數與轉向圖案選單 (預設展開)
                if (typeof renderSynchroLanePickerHTML === 'function') {
                    const synchroHtml = renderSynchroLanePickerHTML(obj, 'link');
                    const turnsBadge = inferSynchroLaneTurns(obj).join(' · ');
                    content += renderAccordionHTML('Synchro 車道與轉向配置', 'fa-solid fa-bolt', synchroHtml, true, turnsBadge);
                }

                // (D) 手風琴 2：Parametric 參數化附加車道設定 或 Lane-Based 標線設定
                if (obj.geometryType === 'parametric' && obj.parametricConfig) {
                    const c = obj.parametricConfig;
                    const lpCount = c.leftPocket.exists ? c.leftPocket.lanes : 0;
                    const rpCount = c.rightPocket.exists ? c.rightPocket.lanes : 0;
                    const paraBadge = `左${lpCount} / 直${c.throughLanes} / 右${rpCount}`;
                    const hasPocketOpen = c.leftPocket.exists || c.rightPocket.exists;

                    const paraBodyHtml = `
                        <div class="prop-row">
                            <span class="prop-label">Through Lanes (主線)</span>
                            <input type="number" id="prop-para-through" class="prop-input" value="${c.throughLanes}" min="1" style="max-width:75px;">
                        </div>

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:8px; margin-top:6px; border-radius:6px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; font-weight:700; color:#334155; cursor:pointer;">
                                <input type="checkbox" id="prop-para-lp-exists" ${c.leftPocket.exists ? 'checked' : ''}> ↰ 左轉附加車道 (Left Pocket)
                            </label>
                            <div id="prop-para-lp-config" style="display:${c.leftPocket.exists ? 'grid' : 'none'}; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:8px;">
                                <div><span style="font-size:0.68rem; color:#64748b; display:block;">車道數</span><input type="number" id="prop-para-lp-lanes" class="prop-input" value="${c.leftPocket.lanes}" min="1"></div>
                                <div><span style="font-size:0.68rem; color:#64748b; display:block;">儲車長(m)</span><input type="number" id="prop-para-lp-len" class="prop-input" value="${c.leftPocket.length}" min="5" step="0.5"></div>
                                <div><span style="font-size:0.68rem; color:#64748b; display:block;">漸變段(m)</span><input type="number" id="prop-para-lp-tap" class="prop-input" value="${c.leftPocket.taper}" min="5" step="0.5"></div>
                            </div>
                        </div>

                        <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:8px; margin-top:6px; border-radius:6px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:0.8rem; font-weight:700; color:#334155; cursor:pointer;">
                                <input type="checkbox" id="prop-para-rp-exists" ${c.rightPocket.exists ? 'checked' : ''}> ↱ 右轉附加車道 (Right Pocket)
                            </label>
                            <div id="prop-para-rp-config" style="display:${c.rightPocket.exists ? 'grid' : 'none'}; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:8px;">
                                <div><span style="font-size:0.68rem; color:#64748b; display:block;">車道數</span><input type="number" id="prop-para-rp-lanes" class="prop-input" value="${c.rightPocket.lanes}" min="1"></div>
                                <div><span style="font-size:0.68rem; color:#64748b; display:block;">儲車長(m)</span><input type="number" id="prop-para-rp-len" class="prop-input" value="${c.rightPocket.length}" min="5" step="0.5"></div>
                                <div><span style="font-size:0.68rem; color:#64748b; display:block;">漸變段(m)</span><input type="number" id="prop-para-rp-tap" class="prop-input" value="${c.rightPocket.taper}" min="5" step="0.5"></div>
                            </div>
                        </div>

                        <button id="btn-bake-to-mesh" class="btn-soft" style="margin-top:8px;" title="轉換後可自由拖曳每一個標線頂點">
                            <i class="fa-solid fa-hammer" style="color:#f59e0b;"></i> 轉為手繪標線模式 (Freeform)
                        </button>
                    `;
                    content += renderAccordionHTML('參數化袋狀車道設定', 'fa-solid fa-sliders', paraBodyHtml, hasPocketOpen, paraBadge);
                }

                if (obj.geometryType === 'lane-based' && obj.strokes) {
                    let strokesBodyHtml = `<div style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px;">`;
                    obj.strokes.forEach((stroke, idx) => {
                        let selectHtml = `<select class="prop-select lb-stroke-type-select" data-index="${idx}" style="flex:1; padding:3px 6px; font-size:0.78rem;">`;
                        for (const [key, prop] of Object.entries(STROKE_TYPES)) {
                            selectHtml += `<option value="${key}" ${stroke.type === key ? 'selected' : ''}>${prop.label}</option>`;
                        }
                        selectHtml += `</select>`;

                        const isBoundary = (idx === 0 || idx === obj.strokes.length - 1);
                        const delBtnHtml = isBoundary
                            ? `<button class="btn-mini" disabled style="background:#f1f5f9; color:#cbd5e1;"><i class="fa-solid fa-lock"></i></button>`
                            : `<button class="btn-mini btn-mini-danger lb-stroke-del-btn" data-index="${idx}"><i class="fa-solid fa-trash-can"></i></button>`;

                        strokesBodyHtml += `
                            <div style="display:flex; align-items:center; gap:6px; background:#f8fafc; padding:4px 6px; border:1px solid var(--border-light); border-radius:5px;">
                                <span style="width:18px; text-align:center; font-size:0.75rem; font-weight:700; color:#64748b;">#${idx}</span>
                                ${selectHtml}
                                ${delBtnHtml}
                            </div>`;
                    });
                    strokesBodyHtml += `</div>`;

                    const getPreviewCss = (prop) => {
                        if (prop.dual) {
                            const lStyle = prop.leftDash.length > 0 ? 'dashed' : 'solid';
                            const rStyle = prop.rightDash.length > 0 ? 'dashed' : 'solid';
                            return `border-top: 2px ${lStyle} ${prop.color}; border-bottom: 2px ${rStyle} ${prop.color}; height: 6px; width: 24px;`;
                        } else {
                            const style = prop.dash && prop.dash.length > 0 ? 'dashed' : 'solid';
                            return `border-top: 2px ${style} ${prop.color}; width: 24px; height: 0px;`;
                        }
                    };

                    let defaultKey = draftCurrentStrokeType === 'boundary' ? 'white_dashed' : draftCurrentStrokeType;
                    if (!STROKE_TYPES[defaultKey]) defaultKey = 'white_dashed';
                    const defaultProp = STROKE_TYPES[defaultKey];

                    let selectedHtml = `
                        <div style="background:#555; padding:4px; border-radius:2px; display:flex; align-items:center; justify-content:center; width:32px;">
                            <div style="${getPreviewCss(defaultProp)}"></div>
                        </div>
                        <span style="font-size:0.75rem; font-weight:600; color:var(--text-main);">${defaultProp.label}</span>`;

                    let customOptionsHtml = '';
                    for (const [key, prop] of Object.entries(STROKE_TYPES)) {
                        customOptionsHtml += `
                            <div class="custom-stroke-option" data-value="${key}" style="display:flex; align-items:center; gap:8px; padding:6px; cursor:pointer; border-bottom:1px solid #e2e8f0;">
                                <div style="background:#555; padding:4px; border-radius:2px; display:flex; align-items:center; justify-content:center; width:32px;">
                                    <div style="${getPreviewCss(prop)}"></div>
                                </div>
                                <span style="font-size:0.75rem; font-weight:600; color:var(--text-main);">${prop.label}</span>
                            </div>`;
                    }

                    strokesBodyHtml += `
                        <div style="display:flex; flex-direction:column; gap:6px; padding:8px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
                            <span style="font-size:0.72rem; font-weight:700; color:#475569;">手繪新增標線 (Append Stroke)</span>
                            <div id="custom-stroke-dropdown" style="position:relative; width:100%; user-select:none;">
                                <div id="custom-stroke-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 8px; background:#fff; border:1px solid #cbd5e1; border-radius:4px; cursor:pointer;">
                                    <div id="custom-stroke-selected" style="display:flex; align-items:center; gap:8px;">${selectedHtml}</div>
                                    <i class="fa-solid fa-chevron-down" style="color:#64748b; font-size:0.75rem;"></i>
                                </div>
                                <div id="custom-stroke-list" style="display:none; position:absolute; top:100%; left:0; width:100%; background:#fff; border:1px solid #cbd5e1; border-radius:4px; margin-top:4px; z-index:100; max-height:200px; overflow-y:auto; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                                    ${customOptionsHtml}
                                </div>
                            </div>
                            <button id="btn-lb-add-stroke" class="btn-soft">
                                <i class="fa-solid fa-pen"></i> Start Drawing Stroke
                            </button>
                        </div>`;

                    content += renderAccordionHTML('手繪標線管理 (Strokes)', 'fa-solid fa-pen-nib', strokesBodyHtml, true, `${obj.strokes.length} 條`);
                }

                // (E) 手風琴 3：各車道寬度與禁行車種微調 (單行緊湊膠囊列，預設收起以保持清爽)
                if (Object.keys(network.vehicleProfiles).length === 0) {
                    network.vehicleProfiles['car'] = { id: 'car', length: 4.5, width: 1.8, maxSpeed: 16.67, maxAcceleration: 3.0, comfortDeceleration: 2.5, minDistance: 2.5, desiredHeadwayTime: 1.5 };
                    network.vehicleProfiles['motor'] = { id: 'motor', length: 2.0, width: 0.8, maxSpeed: 16.67, maxAcceleration: 3.5, comfortDeceleration: 3.0, minDistance: 1.0, desiredHeadwayTime: 0.8 };
                    network.vehicleProfiles['Truck/Bus'] = { id: 'Truck/Bus', length: 12.0, width: 2.6, maxSpeed: 16.67, maxAcceleration: 0.8, comfortDeceleration: 1.0, minDistance: 3.0, desiredHeadwayTime: 3.0 };
                }
                const availableProfiles = Object.keys(network.vehicleProfiles);
                const portsInfo = (obj.geometryType === 'lane-based' || obj.geometryType === 'parametric') ? getLaneBasedPorts(obj) : null;
                const vehShortLabel = { 'car': '🚗Car', 'motor': '🛵Moto', 'Truck/Bus': '🚌Bus' };

                let lanesSetupHtml = `<div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:6px;">游標移至車道列可於畫布高亮預覽；點擊右側車種標籤切換通行權限：</div>`;
                lanesSetupHtml += `<div id="lane-widths-container">`;

                obj.lanes.forEach((lane, index) => {
                    let statusBadge = '';
                    if (portsInfo) {
                        const hasStart = portsInfo.startPorts.some(p => p.laneIndex === index);
                        const hasEnd = portsInfo.endPorts.some(p => p.laneIndex === index);
                        if (hasStart && hasEnd) statusBadge = '<span style="font-size:0.62rem; background:#dcfce7; color:#059669; padding:1px 4px; border-radius:3px;">貫通</span>';
                        else if (!hasStart && hasEnd) statusBadge = '<span style="font-size:0.62rem; background:#fef3c7; color:#d97706; padding:1px 4px; border-radius:3px;">附加</span>';
                        else if (hasStart && !hasEnd) statusBadge = '<span style="font-size:0.62rem; background:#fee2e2; color:#dc2626; padding:1px 4px; border-radius:3px;">縮減</span>';
                        else statusBadge = '<span style="font-size:0.62rem; background:#f1f5f9; color:#64748b; padding:1px 4px; border-radius:3px;">槽化</span>';
                    }

                    const chipsHtml = availableProfiles.map(profId => {
                        const isChecked = (!lane.allowedVehicleProfiles || lane.allowedVehicleProfiles.length === 0 || lane.allowedVehicleProfiles.includes(profId)) ? 'checked' : '';
                        const chipText = vehShortLabel[profId] || profId;
                        return `
                            <label class="veh-chip" title="允許/禁止車種: ${profId}">
                                <input type="checkbox" class="prop-lane-vehicle-cb" data-lane="${index}" value="${profId}" ${isChecked}>
                                ${chipText}
                            </label>`;
                    }).join('');

                    lanesSetupHtml += `
                        <div class="lane-compact-row lane-config-card" data-lane-index="${index}">
                            <div style="display:flex; align-items:center; gap:4px; min-width:56px;">
                                <span style="font-weight:700; font-size:0.78rem; color:#334155;">L${index + 1}</span>
                                ${statusBadge}
                            </div>
                            <div style="display:flex; align-items:center; gap:2px;">
                                <input type="number" id="prop-lane-width-${index}" class="prop-input prop-lane-width" data-index="${index}" value="${lane.width.toFixed(2)}" step="0.1" min="1" style="width:52px; padding:2px 4px; font-size:0.76rem;" ${isLaneBasedFreeform ? 'disabled' : ''}>
                                <span style="font-size:0.68rem; color:#64748b;">m</span>
                            </div>
                            <div class="veh-chip-group">${chipsHtml}</div>
                        </div>`;
                });
                lanesSetupHtml += `</div>`;

                content += renderAccordionHTML('各車道寬度與車種限制', 'fa-solid fa-car-side', lanesSetupHtml, false, `${obj.lanes.length} 車道`);
                content += `</div>`; // End Tab 1

                // --- TAB 2: CONNECTIONS (下游連接清單) ---
                content += `<div id="tab-link-conns" class="prop-tab-content ${getLinkTabClass('tab-link-conns')}">`;
                if (outgoingConns.length > 0) {
                    content += `<div class="conn-list-container" style="display:flex; flex-direction:column; gap:6px;">`;
                    outgoingConns.forEach(conn => {
                        const destLink = network.links[conn.destLinkId];
                        const destName = destLink ? (destLink.name || destLink.id) : conn.destLinkId;
                        content += `
                            <div class="prop-card conn-list-item" data-conn-id="${conn.id}" style="padding:8px 10px; margin-bottom:0; border-left:3px solid var(--primary); cursor:pointer; transition:background 0.15s;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <div style="font-size:0.82rem; color:var(--text-main);">
                                        <span style="font-weight:700; color:var(--primary);">L${conn.sourceLaneIndex + 1}</span>
                                        <i class="fa-solid fa-arrow-right" style="margin:0 6px; color:#94a3b8; font-size:0.7rem;"></i>
                                        <span style="font-weight:600;">${destName}</span>
                                        <span style="font-size:0.72rem; color:#64748b; background:#f1f5f9; padding:1px 5px; border-radius:4px; margin-left:4px;">L${conn.destLaneIndex + 1}</span>
                                    </div>
                                    <button class="btn-mini btn-del-single-conn" data-id="${conn.id}" title="Remove Connection" style="color:#ef4444; border:1px solid #fecaca; background:#fff;">
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                            </div>`;
                    });
                    content += `</div>`;
                } else {
                    content += `
                        <div class="prop-hint" style="text-align:center; padding:24px 0;">
                            <i class="fa-solid fa-link-slash" style="font-size:1.4rem; color:#cbd5e1; margin-bottom:6px;"></i><br>
                            尚無下游車道連接 (No outgoing connections)
                        </div>`;
                }
                content += `</div>`; // End Tab 2
                break;
            }

            // =============================================================
            // CASE: NODE (路口節點)
            // =============================================================
            case 'Node': {
                const getTabClass = (tabName) => lastActiveNodeTab === tabName ? 'active' : '';
                content += `
                    <div class="prop-tab-header" style="margin-bottom:6px;">
                        <button class="prop-tab-btn ${getTabClass('tab-synchro')}" data-target="tab-synchro" title="Synchro 路口各方向車道與轉向設定">
                            <i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> Synchro
                        </button>
                        <button class="prop-tab-btn ${getTabClass('tab-settings')}" data-target="tab-settings">
                            <i class="fa-solid fa-sliders"></i> 號誌/行人
                        </button>
                        <button class="prop-tab-btn ${getTabClass('tab-conn')}" data-target="tab-conn">
                            <i class="fa-solid fa-network-wired"></i> 動線
                        </button>
                        <button class="prop-tab-btn ${getTabClass('tab-flow')}" data-target="tab-flow">
                            <i class="fa-solid fa-arrow-right-arrow-left"></i> 比例
                        </button>
                    </div>`;

                // --- TAB 0: SYNCHRO APPROACH MATRIX (支援方向分頁切換器) ---
                content += `<div id="tab-synchro" class="prop-tab-content ${getTabClass('tab-synchro')}">`;
                if (typeof renderSynchroNodePanelHTML === 'function') {
                    content += renderSynchroNodePanelHTML(obj);
                }
                content += `</div>`;

                // --- TAB 1: SETTINGS (號誌與行人設定) ---
                content += `<div id="tab-settings" class="prop-tab-content ${getTabClass('tab-settings')}">`;
                const tflData = network.trafficLights[obj.id] || { timeShift: 0 };
                const hasSignal = (tflData.schedule && tflData.schedule.length > 0) ||
                    (tflData.advanced && Object.keys(tflData.advanced.schedules).length > 0);

                let displayTimeShift = tflData.timeShift || 0;
                if (tflData.advanced && tflData.advanced.weekly) {
                    const monPlanId = tflData.advanced.weekly[1];
                    if (monPlanId && tflData.advanced.dailyPlans[monPlanId]) {
                        const sw = tflData.advanced.dailyPlans[monPlanId].switches.find(s => s.schedId !== 'NONE');
                        if (sw && tflData.advanced.schedules[sw.schedId]) {
                            displayTimeShift = tflData.advanced.schedules[sw.schedId].timeShift || 0;
                        }
                    }
                }

                content += `
                    <div class="prop-card">
                        <div class="prop-section-header" style="margin-top:0;">Signal Control</div>
                        <div class="prop-row">
                            <span class="prop-label">Signal Status</span>
                            ${hasSignal
                        ? '<span class="prop-status-indicator success" style="padding:2px 8px; margin:0; font-size:0.75rem;">Active</span>'
                        : '<span class="prop-status-indicator" style="padding:2px 8px; margin:0; font-size:0.75rem; background:#f1f5f9; color:#64748b;">No Signal</span>'}
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Time Shift (s)</span>
                            <input type="number" id="prop-tfl-shift" class="prop-input" value="${displayTimeShift}" min="0" step="1" style="max-width:90px;">
                        </div>
                        <button id="edit-tfl-btn" class="btn-primary" style="width:100%; margin-top:6px;">
                            <i class="fa-solid fa-traffic-light"></i> 開啟號誌時制編輯器
                        </button>
                    </div>

                    <div class="prop-card">
                        <div class="prop-section-header" style="margin-top:0;">Pedestrian Settings</div>
                        <div class="prop-row">
                            <span class="prop-label">Volume (ped/h)</span>
                            <input type="number" id="prop-node-ped-vol" class="prop-input" value="${obj.pedestrianVolume || 0}" min="0" step="10" style="max-width:90px;">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Cross Once (%)</span>
                            <input type="number" id="prop-node-cross-once" class="prop-input" value="${obj.crossOnceProb !== undefined ? obj.crossOnceProb : 100}" min="0" max="100" step="1" style="max-width:90px;">
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Cross Twice (%)</span>
                            <input type="number" id="prop-node-cross-twice" class="prop-input" value="${obj.crossTwiceProb || 0}" min="0" max="100" step="1" style="max-width:90px;">
                        </div>
                    </div>

                    <button id="btn-delete-node" class="btn-danger-outline">
                        <i class="fa-solid fa-trash-can"></i> Delete Intersection
                    </button>
                </div>`;

                // --- TAB 2: LINKS (Connection Groups 與幾何微調) ---
                content += `<div id="tab-conn" class="prop-tab-content ${getTabClass('tab-conn')}">`;
                const relatedGroups = [];
                layer.find('.group-connection-visual').forEach(groupShape => {
                    const meta = groupShape.getAttr('meta');
                    if (meta && meta.nodeId === obj.id) {
                        relatedGroups.push({
                            id: groupShape.id(),
                            domId: `group-selector-${meta.sourceLinkId}-${meta.destLinkId}`,
                            ...meta
                        });
                    }
                });

                if (relatedGroups.length > 0) {
                    if (network.trafficLights[obj.id]) ensureTflGroupSets(network.trafficLights[obj.id]);
                    const tflDataForGroup = network.trafficLights[obj.id] || { signalGroups: {}, signalGroupSets: {} };
                    const signalGroupOptions = Object.keys(tflDataForGroup.signalGroups || {});
                    const groupSetList = Object.values(tflDataForGroup.signalGroupSets || {});

                    if (groupSetList.length > 0) {
                        content += `
                            <div class="prop-row" style="background:#f5f3ff; padding:6px 8px; border-radius:6px; border:1px solid #ddd6fe; margin-bottom:8px;">
                                <span class="prop-label" style="color:#6d28d9; font-weight:600; font-size:0.78rem;"><i class="fa-solid fa-microchip"></i> 硬體群組:</span>
                                <select id="prop-node-groupset-select" class="prop-select" style="border-color:#c4b5fd; font-size:0.78rem; padding:3px 6px;">
                                    ${groupSetList.map(gs => `<option value="${gs.id}" ${gs.id === tflDataForGroup.activeGroupSetId ? 'selected' : ''}>${gs.name || gs.id} (${Object.keys(gs.groups || {}).length}組)</option>`).join('')}
                                </select>
                            </div>`;
                    }

                    relatedGroups.forEach(group => {
                        let currentSignalGroupId = "";
                        const firstConnId = group.connectionIds[0];
                        if (firstConnId) {
                            for (const [sgId, sgData] of Object.entries(tflDataForGroup.signalGroups)) {
                                if (sgData.connIds.includes(firstConnId)) {
                                    currentSignalGroupId = sgId;
                                    break;
                                }
                            }
                        }

                        let signalSelectHtml = `<select class="prop-select prop-group-signal-select" data-group-json='${JSON.stringify(group.connectionIds)}' style="font-size:0.78rem; padding:3px 6px;">`;
                        signalSelectHtml += `<option value="">(No Signal)</option>`;
                        signalGroupOptions.forEach(sgId => {
                            const selected = sgId === currentSignalGroupId ? "selected" : "";
                            signalSelectHtml += `<option value="${sgId}" ${selected}>${sgId}</option>`;
                        });
                        signalSelectHtml += `</select>`;

                        // 右轉專用引道摺疊抽屜 (平時收起，不佔用卡片空間)
                        let slipConfigHtml = '';
                        const srcLink = network.links[group.sourceLinkId];
                        const dstLink = network.links[group.destLinkId];
                        if (srcLink && dstLink && getTurnDirection(srcLink, dstLink) === 'right') {
                            slipConfigHtml = `
                                <details style="margin-top:6px; padding-top:6px; border-top:1px dashed #e2e8f0;">
                                    <summary style="font-size:0.72rem; font-weight:600; color:#059669; cursor:pointer; user-select:none;">
                                        <i class="fa-solid fa-code-branch"></i> 展開右轉槽化引道生成器 (Slip Lane)
                                    </summary>
                                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:6px;">
                                        <div style="display:flex; align-items:center; gap:3px;">
                                            <span style="font-size:0.68rem; color:#64748b;">上游(m)</span>
                                            <input type="number" id="slip-up-${group.sourceLinkId}-${group.destLinkId}" class="prop-input" value="20" min="5" step="1" style="width:44px; padding:2px; text-align:center;">
                                        </div>
                                        <div style="display:flex; align-items:center; gap:3px;">
                                            <span style="font-size:0.68rem; color:#64748b;">下游(m)</span>
                                            <input type="number" id="slip-down-${group.sourceLinkId}-${group.destLinkId}" class="prop-input" value="20" min="5" step="1" style="width:44px; padding:2px; text-align:center;">
                                        </div>
                                        <button class="btn-mini btn-macro-slip" data-source="${group.sourceLinkId}" data-dest="${group.destLinkId}" style="background:#10b981; color:#fff; padding:3px 8px; font-weight:600;">
                                            產生引道
                                        </button>
                                    </div>
                                </details>`;
                        }

                        content += `
                            <div class="prop-card connection-group-card" data-source="${group.sourceLinkId}" data-dest="${group.destLinkId}" id="${group.domId}">
                                <div class="prop-card-row" style="margin-bottom:6px;">
                                    <span style="font-weight:700; font-size:0.82rem; color:var(--text-main);">
                                        ${group.sourceLinkId} <i class="fa-solid fa-arrow-right" style="font-size:0.68rem; color:#94a3b8;"></i> ${group.destLinkId}
                                        <span style="font-size:0.7rem; font-weight:600; color:var(--primary); background:#eff6ff; padding:1px 5px; border-radius:4px; margin-left:4px;">${group.connectionIds.length}L</span>
                                    </span>
                                    <div style="display:flex; gap:4px;">
                                        <button class="btn-mini group-edit-btn" title="Edit Lanes" data-source="${group.sourceLinkId}" data-dest="${group.destLinkId}" style="background:#f1f5f9; border:1px solid #e2e8f0; color:var(--text-muted);">
                                            <i class="fa-solid fa-pen"></i>
                                        </button>
                                        <button class="btn-mini group-delete-btn" title="Delete Group" data-source="${group.sourceLinkId}" data-dest="${group.destLinkId}" style="background:#fff; border:1px solid #fecaca; color:#ef4444;">
                                            <i class="fa-solid fa-trash-can"></i>
                                        </button>
                                    </div>
                                </div>
                                <div class="prop-card-row">
                                    <span class="prop-card-label"><i class="fa-solid fa-traffic-light"></i> Signal Group</span>
                                    <div style="flex:1; margin-left:8px;">${signalSelectHtml}</div>
                                </div>
                                ${slipConfigHtml}
                            </div>`;
                    });
                } else {
                    content += `<div class="prop-hint">此路口尚無車道群組連線 (No connection groups)。</div>`;
                }

                content += `
                    <div style="display:flex; gap:6px; margin-top:8px;">
                        <button id="redraw-node-connections-btn" class="btn-soft">
                            <i class="fa-solid fa-rotate"></i> 重繪連線
                        </button>
                        ${obj.customPolygonPoints ? `
                        <button id="reset-node-shape-btn" class="btn-soft" style="color:#d97706; border-color:#fde68a;">
                            <i class="fa-solid fa-eraser"></i> 重設外框
                        </button>` : ''}
                    </div>
                </div>`; // End Tab 2

                // --- TAB 3: FLOW (Turning Ratios) ---
                content += `<div id="tab-flow" class="prop-tab-content ${getTabClass('tab-flow')}">`;
                content += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase;">Turning Ratios</span>
                        <button id="btn-auto-calc-turns" class="btn-mini" style="background:#e0f2fe; color:#0284c7; font-weight:600; padding:3px 8px;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> 依下游偵測器自動推估
                        </button>
                    </div>`;

                const incomingLinks = [...obj.incomingLinkIds];
                const outgoingLinks = [...obj.outgoingLinkIds];
                if (!obj.turningRatios) obj.turningRatios = {};

                if (incomingLinks.length > 0 && outgoingLinks.length > 0) {
                    content += `<div id="turning-ratios-container">`;
                    incomingLinks.forEach(inLink => {
                        content += `
                            <div class="prop-card" style="padding:8px; background:#f8fafc;">
                                <div class="turn-ratio-header" data-link="${inLink}" style="font-size:0.78rem; font-weight:700; color:#334155; margin-bottom:6px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; cursor:default;">
                                    From ${inLink}
                                </div>`;
                        outgoingLinks.forEach(outLink => {
                            const ratio = (obj.turningRatios[inLink] && obj.turningRatios[inLink][outLink] !== undefined)
                                ? obj.turningRatios[inLink][outLink] : 0;
                            const percent = (ratio * 100).toFixed(1);
                            content += `
                                <div class="prop-row turn-ratio-row" data-from="${inLink}" data-to="${outLink}" style="margin-bottom:4px; padding:2px 4px; border-radius:4px; cursor:default;">
                                    <span class="prop-label" style="font-size:0.75rem;">To ${outLink}</span>
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <input type="number" class="prop-turn-ratio prop-input" style="width:58px; padding:2px 4px; font-size:0.78rem;" data-from="${inLink}" data-to="${outLink}" value="${percent}" min="0" max="100" step="1">
                                        <span style="font-size:0.72rem; color:#64748b;">%</span>
                                    </div>
                                </div>`;
                        });
                        content += `</div>`;
                    });
                    content += `</div>`;
                } else {
                    content += `<div class="prop-hint">請先連接進出此路口的車道以設定轉向比例。</div>`;
                }
                content += `</div>`; // End Tab 3
                break;
            }

            // =============================================================
            // CASE: DETECTOR (偵測器)
            // =============================================================
            case 'PointDetector':
            case 'SectionDetector': {
                const isSection = obj.type === 'SectionDetector';
                content += `
                    <div class="prop-stat-grid" style="margin-bottom:8px;">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Parent Link</span>
                            <span class="prop-stat-value">${obj.linkId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Detector Type</span>
                            <span class="prop-stat-value">${isSection ? '區段 (Section)' : '單點 (Point)'}</span>
                        </div>
                    </div>

                    <div class="prop-card">
                        <div class="prop-row">
                            <span class="prop-label">Name</span>
                            <input type="text" id="prop-det-name" class="prop-input" value="${obj.name}">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Position (m)</span>
                            <input type="number" step="0.5" id="prop-det-pos" class="prop-input" value="${obj.position.toFixed(2)}" style="max-width:95px;">
                        </div>
                        ${isSection ? `
                        <div class="prop-row">
                            <span class="prop-label">Length (m)</span>
                            <input type="number" step="0.5" id="prop-det-len" class="prop-input" value="${(obj.length || 0).toFixed(2)}" style="max-width:95px;">
                        </div>` : ''}
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Flow (veh/h)</span>
                            <input type="number" id="prop-det-flow" class="prop-input" value="${obj.observedFlow || 0}" min="0" style="max-width:95px;">
                        </div>
                    </div>

                    <div class="prop-card">
                        <div style="display:flex; align-items:center; justify-content:space-between;">
                            <label for="prop-det-is-source" style="font-size:0.82rem; color:var(--text-main); font-weight:700; cursor:pointer;">
                                <i class="fa-solid fa-circle-play" style="color:var(--success);"></i> 作為車流產生源 (Flow Source)
                            </label>
                            <input type="checkbox" id="prop-det-is-source" ${obj.isSource ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
                        </div>`;

                if (obj.isSource) {
                    if (!network.vehicleProfiles) network.vehicleProfiles = {};
                    const profileOptions = Object.keys(network.vehicleProfiles);
                    if (profileOptions.length === 0) {
                        network.vehicleProfiles['car'] = { id: 'car', length: 4.5, width: 1.8, maxSpeed: 16.67, maxAcceleration: 3.0, comfortDeceleration: 2.5, minDistance: 2.5, desiredHeadwayTime: 1.5 };
                        network.vehicleProfiles['motor'] = { id: 'motor', length: 2.0, width: 0.8, maxSpeed: 16.67, maxAcceleration: 3.5, comfortDeceleration: 3.0, minDistance: 1.0, desiredHeadwayTime: 0.8 };
                        network.vehicleProfiles['Truck/Bus'] = { id: 'Truck/Bus', length: 12.0, width: 2.6, maxSpeed: 16.67, maxAcceleration: 0.8, comfortDeceleration: 1.0, minDistance: 3.0, desiredHeadwayTime: 3.0 };
                        profileOptions.push('car', 'motor', 'Truck/Bus');
                    }
                    if (!obj.spawnProfiles) obj.spawnProfiles = [];
                    if (obj.spawnProfileId) {
                        obj.spawnProfiles.push({ profileId: obj.spawnProfileId, weight: 1.0 });
                        delete obj.spawnProfileId;
                    }
                    if (obj.spawnProfiles.length === 0) {
                        const defaultProfId = profileOptions[0] || 'car';
                        obj.spawnProfiles.push({ profileId: defaultProfId, weight: 1.0 });
                    }

                    content += `<div style="border-top:1px solid var(--border-light); margin-top:8px; padding-top:8px;" id="det-profiles-list">`;
                    obj.spawnProfiles.forEach((entry, idx) => {
                        const dropdownHtml = generateDropdown(`det-prof-sel-${idx}`, profileOptions, entry.profileId)
                            .replace('<select', '<select class="prop-select" style="padding:3px 6px; font-size:0.78rem; flex:1;"');
                        content += `
                            <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; background:#f8fafc; padding:4px 6px; border-radius:5px; border:1px solid var(--border-light);">
                                ${dropdownHtml}
                                <span style="font-size:0.7rem; color:#64748b;">權重</span>
                                <input type="number" step="0.1" class="det-prof-weight prop-card-input" data-index="${idx}" value="${entry.weight}" style="width:48px;">
                                <button class="det-prof-del-btn btn-mini btn-mini-danger" data-index="${idx}">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>`;
                    });
                    content += `</div>`;
                    content += `
                        <div style="display:flex; gap:6px; margin-top:6px;">
                            <button id="btn-add-det-profile" class="btn-soft" style="flex:1;"><i class="fa-solid fa-plus"></i> 新增車種</button>
                            <button id="btn-manage-profiles" class="btn-soft" style="flex:1;"><i class="fa-solid fa-gear"></i> 車種參數</button>
                        </div>`;
                }
                content += `</div>`;
                break;
            }

            // =============================================================
            // CASE: ROAD SIGN (速限標誌 / 交通錐)
            // =============================================================
            case 'RoadSign': {
                content += `
                    <div class="prop-stat-grid" style="margin-bottom:8px;">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Parent Link</span>
                            <span class="prop-stat-value">${obj.linkId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Position</span>
                            <span class="prop-stat-value">${obj.position.toFixed(1)}m</span>
                        </div>
                    </div>

                    <div class="prop-card">
                        <div class="prop-row">
                            <span class="prop-label">Element Type</span>
                            <select id="prop-sign-type" class="prop-select">
                                <option value="start" ${obj.signType === 'start' ? 'selected' : ''}>Speed Limit Start</option>
                                <option value="end" ${obj.signType === 'end' ? 'selected' : ''}>Speed Limit End</option>
                                <option value="traffic_cone" ${obj.signType === 'traffic_cone' ? 'selected' : ''}>Traffic Cone (交通錐)</option>
                            </select>
                        </div>
                        <div class="prop-row" id="prop-speed-limit-row" style="display: ${obj.signType === 'start' ? 'flex' : 'none'};">
                            <span class="prop-label">Limit (km/h)</span>
                            <input type="number" id="prop-speed-limit" class="prop-input" value="${obj.speedLimit}" min="0" style="max-width:90px;">
                        </div>
                        <div class="prop-row" id="prop-cone-offset-row" style="display: ${obj.signType === 'traffic_cone' ? 'flex' : 'none'};">
                            <span class="prop-label">Lateral Offset (m)</span>
                            <input type="number" step="0.1" id="prop-cone-offset" class="prop-input" value="${(obj.lateralOffset || 0).toFixed(2)}" style="max-width:90px;">
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Position (m)</span>
                            <input type="number" step="0.1" id="prop-sign-pos" class="prop-input" value="${obj.position.toFixed(2)}" style="max-width:90px;">
                        </div>
                    </div>`;
                break;
            }

            // =============================================================
            // CASE: CONNECTION & CONNECTION GROUP (車道連線與群組)
            // =============================================================
            case 'Connection': {
                content += `
                    <div class="prop-stat-grid cols-3">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">From</span>
                            <span class="prop-stat-value">${obj.sourceLinkId} <small style="color:var(--primary);">L${obj.sourceLaneIndex + 1}</small></span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">To</span>
                            <span class="prop-stat-value">${obj.destLinkId} <small style="color:var(--primary);">L${obj.destLaneIndex + 1}</small></span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Via Node</span>
                            <span class="prop-stat-value">${obj.nodeId}</span>
                        </div>
                    </div>`;
                break;
            }

            case 'ConnectionGroup': {
                content += `
                    <div class="prop-stat-grid">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">From Link</span>
                            <span class="prop-stat-value">${obj.sourceLinkId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">To Link</span>
                            <span class="prop-stat-value">${obj.destLinkId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Via Node</span>
                            <span class="prop-stat-value">${obj.nodeId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Connected Lanes</span>
                            <span class="prop-stat-value" style="color:var(--primary);">${obj.connectionIds.length} 條</span>
                        </div>
                    </div>
                    <button id="edit-group-btn" class="btn-soft" style="margin-top:8px;">
                        <i class="fa-solid fa-pen-to-square"></i> 調整車道對應範圍 (Edit Range)
                    </button>`;
                break;
            }

            // =============================================================
            // CASE: ORIGIN & DESTINATION (起點與迄點)
            // =============================================================
            case 'Origin': {
                content += `
                    <div class="prop-stat-grid" style="margin-bottom:8px;">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Parent Link</span>
                            <span class="prop-stat-value">${obj.linkId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Time Periods</span>
                            <span class="prop-stat-value">${(obj.periods || []).length} 段</span>
                        </div>
                    </div>
                    <button id="configure-spawner-btn" class="btn-primary" style="width:100%;">
                        <i class="fa-solid fa-clock"></i> Configure Spawner Schedule
                    </button>
                    <div class="prop-hint">設定依時段變化的發車量、車種比例與目的地權重 (OD Mode)。</div>`;
                break;
            }

            case 'Destination': {
                content += `
                    <div class="prop-stat-grid">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Parent Link</span>
                            <span class="prop-stat-value">${obj.linkId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Role</span>
                            <span class="prop-stat-value">車流吸收迄點</span>
                        </div>
                    </div>`;
                break;
            }

            // =============================================================
            // CASE: BACKGROUND (背景底圖)
            // =============================================================
            case 'Background': {
                if (activeTool === 'add-background') {
                    content += `
                        <button id="btn-bg-back-list" class="btn-soft">
                            <i class="fa-solid fa-arrow-left"></i> Back to Layer List
                        </button>`;
                }
                content += `
                    <div class="prop-stat-grid cols-3">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Width</span>
                            <span class="prop-stat-value">${obj.width.toFixed(0)}px</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Height</span>
                            <span class="prop-stat-value">${obj.height.toFixed(0)}px</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Format</span>
                            <span class="prop-stat-value">${obj.imageType || 'IMG'}</span>
                        </div>
                    </div>

                    <div class="prop-card">
                        <div class="prop-row">
                            <span class="prop-label">Name</span>
                            <input type="text" id="prop-bg-name" class="prop-input" value="${obj.name || obj.id}">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label"><i class="fa-solid fa-lock"></i> Locked</span>
                            <input type="checkbox" id="prop-bg-locked" ${obj.locked ? 'checked' : ''} style="cursor:pointer; width:16px; height:16px;">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Opacity (%)</span>
                            <input type="number" id="prop-bg-opacity" class="prop-input" value="${obj.opacity}" min="0" max="100" step="10" style="max-width:90px;">
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Scale</span>
                            <input type="number" id="prop-bg-scale" class="prop-input" value="${obj.scale.toFixed(2)}" min="0.01" step="0.01" style="max-width:90px;">
                        </div>
                    </div>

                    <button id="prop-bg-file-btn" class="btn-soft">
                        <i class="fa-regular fa-folder-open"></i> Replace Image...
                    </button>
                    <input type="file" id="prop-bg-file-input" style="display: none;" accept="image/*">`;
                break;
            }

            // =============================================================
            // CASE: OVERPASS (立體交叉)
            // =============================================================
            case 'Overpass': {
                const bottomLinkId = obj.linkId1 === obj.topLinkId ? obj.linkId2 : obj.linkId1;
                content += `
                    <div class="prop-stat-grid">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Top Layer (高架)</span>
                            <span class="prop-stat-value" style="color:var(--primary);">${obj.topLinkId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Bottom Layer (平面)</span>
                            <span class="prop-stat-value">${bottomLinkId}</span>
                        </div>
                    </div>
                    <button id="swap-overpass-btn" class="btn-soft">
                        <i class="fa-solid fa-retweet"></i> Swap Layer Order (上下對調)
                    </button>
                    <button id="btn-overpass-to-intersection" class="btn-primary" style="width:100%;">
                        <i class="fa-solid fa-network-wired"></i> 轉為平面交叉路口 (Create Intersection)
                    </button>`;
                break;
            }

            // =============================================================
            // CASE: PUSHPIN (地理座標圖釘)
            // =============================================================
            case 'Pushpin': {
                content += `
                    <div class="prop-stat-grid">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Canvas X</span>
                            <span class="prop-stat-value">${obj.x.toFixed(2)}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Canvas Y</span>
                            <span class="prop-stat-value">${obj.y.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="prop-card">
                        <div class="prop-section-header" style="margin-top:0;">Geo Reference (WGS84)</div>
                        <div class="prop-row" style="border-left:3px solid #ef4444; padding-left:8px;">
                            <span class="prop-label">Latitude</span>
                            <input type="number" id="prop-pin-lat" class="prop-input" value="${obj.lat}" step="0.000001">
                        </div>
                        <div class="prop-row" style="border-left:3px solid #3b82f6; padding-left:8px; margin-bottom:0;">
                            <span class="prop-label">Longitude</span>
                            <input type="number" id="prop-pin-lon" class="prop-input" value="${obj.lon}" step="0.000001">
                        </div>
                    </div>`;
                break;
            }

            // =============================================================
            // CASE: PARKING LOT & GATE (停車場與出入口)
            // =============================================================
            case 'ParkingLot': {
                content += `
                    <div class="prop-card">
                        <div class="prop-row">
                            <span class="prop-label">Name</span>
                            <input type="text" id="prop-pl-name" class="prop-input" value="${obj.name}">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label"><i class="fa-solid fa-car"></i> Cars Capacity</span>
                            <input type="number" id="prop-pl-car" class="prop-input" value="${obj.carCapacity}" min="0" style="max-width:90px;">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label"><i class="fa-solid fa-motorcycle"></i> Motos Capacity</span>
                            <input type="number" id="prop-pl-moto" class="prop-input" value="${obj.motoCapacity}" min="0" style="max-width:90px;">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">Attraction (%)</span>
                            <input type="number" id="prop-pl-attr" class="prop-input" value="${obj.attractionProb || 0}" min="0" max="100" step="1" style="max-width:90px;">
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Stay Duration (min)</span>
                            <input type="number" id="prop-pl-duration" class="prop-input" value="${obj.stayDuration || 0}" min="0" step="1" style="max-width:90px;">
                        </div>
                    </div>`;
                break;
            }

            case 'ParkingGate': {
                const linkedPl = obj.parkingLotId ? network.parkingLots[obj.parkingLotId] : null;
                content += `
                    <div class="prop-status-indicator ${linkedPl ? 'success' : 'error'}" style="margin-bottom:0;">
                        <i class="fa-solid ${linkedPl ? 'fa-link' : 'fa-link-slash'}"></i>
                        <div>
                            <div style="font-weight:700;">${linkedPl ? `Linked: ${linkedPl.name}` : 'Not Linked'}</div>
                            <div style="font-size:0.72rem; opacity:0.85;">${linkedPl ? `Width: ${obj.width.toFixed(1)}m` : '請將出入口拖曳至停車場邊界上'}</div>
                        </div>
                    </div>
                    <div class="prop-card">
                        <div class="prop-row">
                            <span class="prop-label">Gate Type</span>
                            <select id="prop-gate-type" class="prop-select">
                                <option value="entry" ${obj.gateType === 'entry' ? 'selected' : ''}>Entry Only (入口)</option>
                                <option value="exit" ${obj.gateType === 'exit' ? 'selected' : ''}>Exit Only (出口)</option>
                                <option value="bidirectional" ${obj.gateType === 'bidirectional' ? 'selected' : ''}>Bi-directional (雙向)</option>
                            </select>
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Rotation (deg)</span>
                            <input type="number" id="prop-gate-rotation" class="prop-input" value="${(obj.rotation || 0).toFixed(1)}" style="max-width:90px;">
                        </div>
                    </div>`;
                break;
            }

            // =============================================================
            // CASE: ZONE (土地使用分區 - 2x2 儀表板 + 手風琴)
            // =============================================================
            case 'Zone': {
                const _t = (key) => (window.I18N && window.I18N.t ? window.I18N.t(key) : key);
                const polygon = obj.konvaGroup.findOne('.zone-shape');
                const pts = polygon ? polygon.points() : (obj.points || []);
                const siteArea = calculatePolygonArea(pts);
                const bcr = obj.bcr !== undefined ? obj.bcr : 0.6;
                const far = obj.far !== undefined ? obj.far : 2.0;
                const gfa = siteArea * far;
                const footprint = siteArea * bcr;
                const floors = Math.max(1, Math.ceil(far / bcr));
                const { pop: autoPop, emp: autoEmp } = estimateSocioEconomic(obj.zoneType, gfa);
                const isAuto = obj.autoCalculateTraffic !== false;
                const effPop = (!isAuto && obj.customPop !== null && obj.customPop !== undefined && !isNaN(obj.customPop)) ? obj.customPop : autoPop;
                const effEmp = (!isAuto && obj.customEmp !== null && obj.customEmp !== undefined && !isNaN(obj.customEmp)) ? obj.customEmp : autoEmp;
                const trips = estimatePeakTrips(obj.zoneType, effPop, effEmp, gfa);
                const curCfg = ZONE_CONFIGS[obj.zoneType] || ZONE_CONFIGS['R1'];

                // (A) 頂部 2x2 建築量體儀表板
                content += `
                    <div class="prop-stat-grid">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">${_t('Site Area')}</span>
                            <span id="prop-zone-site-area" class="prop-stat-value">${siteArea.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">${_t('Footprint Area')}</span>
                            <span id="prop-zone-footprint" class="prop-stat-value">${footprint.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">${_t('Gross Floor Area (GFA)')}</span>
                            <span id="prop-zone-gfa" class="prop-stat-value" style="color:var(--primary);">${gfa.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">${_t('Equivalent Floors')}</span>
                            <span id="prop-zone-floors" class="prop-stat-value" style="color:#d97706;">${floors} F</span>
                        </div>
                    </div>`;

                // (B) 分區類別與建蔽率/容積率卡片
                content += `
                    <div class="prop-card" style="margin-bottom:0;">
                        <div class="prop-row">
                            <span class="prop-label">${_t('Name')}</span>
                            <input type="text" id="prop-zone-name" class="prop-input" value="${obj.name || ''}">
                        </div>
                        <div class="prop-row">
                            <span class="prop-label">${_t('Zoning Type')}</span>
                            <select id="prop-zone-type" class="prop-select">
                                <option value="R1" ${obj.zoneType === 'R1' ? 'selected' : ''}>${_t('R1 - Low-Density Residential')}</option>
                                <option value="R2" ${obj.zoneType === 'R2' ? 'selected' : ''}>${_t('R2 - Medium-Density Residential')}</option>
                                <option value="R3" ${obj.zoneType === 'R3' ? 'selected' : ''}>${_t('R3 - High-Density Residential')}</option>
                                <option value="C1" ${obj.zoneType === 'C1' ? 'selected' : ''}>${_t('C1 - Neighborhood Commercial')}</option>
                                <option value="C2" ${obj.zoneType === 'C2' ? 'selected' : ''}>${_t('C2 - Central Business District (CBD)')}</option>
                                <option value="C3" ${obj.zoneType === 'C3' ? 'selected' : ''}>${_t('C3 - Regional Commercial / Mall')}</option>
                                <option value="I" ${obj.zoneType === 'I' ? 'selected' : ''}>${_t('I - Industrial / Tech')}</option>
                                <option value="G1" ${obj.zoneType === 'G1' ? 'selected' : ''}>${_t('G1 - Schools / Institutional')}</option>
                                <option value="G2" ${obj.zoneType === 'G2' ? 'selected' : ''}>${_t('G2 - Government / Hospital')}</option>
                                <option value="P" ${obj.zoneType === 'P' ? 'selected' : ''}>${_t('P - Park / Green Space')}</option>
                            </select>
                        </div>
                        <div style="font-size:0.72rem; color:var(--text-muted); background:#f8fafc; padding:5px 8px; border-radius:4px; margin-bottom:8px;">
                            <i class="fa-solid fa-circle-info"></i> ${curCfg.desc || ''}
                        </div>
                        <div class="prop-row">
                            <span class="prop-label" title="${_t('Building Coverage Ratio (BCR)')}">建蔽率 BCR</span>
                            <div style="display:flex; align-items:center; gap:6px; flex:1;">
                                <input type="range" id="prop-zone-bcr-slider" min="5" max="100" step="1" value="${Math.round(bcr * 100)}" style="flex:1; cursor:pointer;">
                                <input type="number" id="prop-zone-bcr" class="prop-input" min="5" max="100" step="1" value="${Math.round(bcr * 100)}" style="width:48px; padding:3px 4px;">
                                <span style="font-size:0.75rem; color:#6b7280;">%</span>
                            </div>
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label" title="${_t('Floor Area Ratio (FAR)')}">容積率 FAR</span>
                            <div style="display:flex; align-items:center; gap:6px; flex:1;">
                                <input type="range" id="prop-zone-far-slider" min="10" max="2500" step="5" value="${Math.round(far * 100)}" style="flex:1; cursor:pointer;">
                                <input type="number" id="prop-zone-far" class="prop-input" min="10" max="2500" step="5" value="${Math.round(far * 100)}" style="width:54px; padding:3px 4px;">
                                <span style="font-size:0.75rem; color:#6b7280;">%</span>
                            </div>
                        </div>
                    </div>`;

                // (C) 手風琴 1：社經人口與尖離峰旅次推估 (預設展開)
                const offP = trips.offP !== undefined ? trips.offP : 0;
                const offA = trips.offA !== undefined ? trips.offA : 0;
                const demandsBodyHtml = `
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.78rem; font-weight:600; margin-bottom:8px;">
                        <input type="checkbox" id="prop-zone-autocalc" ${isAuto ? 'checked' : ''}>
                        <span>${_t('Auto Calculate Demands')}</span>
                    </label>
                    <div class="prop-stat-grid" style="margin-bottom:8px;">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">${_t('Estimated Population')}</span>
                            <input type="number" id="prop-zone-pop" class="prop-input" value="${effPop}" min="0" ${isAuto ? 'disabled' : ''} style="margin-top:2px; padding:3px 6px;">
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">${_t('Estimated Employment')}</span>
                            <input type="number" id="prop-zone-emp" class="prop-input" value="${effEmp}" min="0" ${isAuto ? 'disabled' : ''} style="margin-top:2px; padding:3px 6px;">
                        </div>
                    </div>
                    <div style="background:#f8fafc; border:1px solid var(--border-light); border-radius:6px; padding:6px 8px;">
                        <div class="prop-row" style="margin-bottom:4px;">
                            <span style="font-size:0.72rem; color:#475569; font-weight:600;">🌅 ${_t('AM Peak Trips')}</span>
                            <span id="prop-zone-trips-am" style="font-size:0.76rem; font-weight:700; color:#059669;">P: ${trips.amP.toLocaleString()} / A: ${trips.amA.toLocaleString()}</span>
                        </div>
                        <div class="prop-row" style="margin-bottom:4px;">
                            <span style="font-size:0.72rem; color:#475569; font-weight:600;">🌇 ${_t('PM Peak Trips')}</span>
                            <span id="prop-zone-trips-pm" style="font-size:0.76rem; font-weight:700; color:#dc2626;">P: ${trips.pmP.toLocaleString()} / A: ${trips.pmA.toLocaleString()}</span>
                        </div>
                        <div class="prop-row" style="margin-bottom:0;">
                            <span style="font-size:0.72rem; color:#475569; font-weight:600;">🕒 Off-Peak Trips</span>
                            <span id="prop-zone-trips-off" style="font-size:0.76rem; font-weight:700; color:#6b7280;">P: ${offP.toLocaleString()} / A: ${offA.toLocaleString()}</span>
                        </div>
                    </div>`;
                content += renderAccordionHTML(_t('Demands Estimation'), 'fa-solid fa-users', demandsBodyHtml, true, `AM ${trips.amP + trips.amA}/h`);

                // (D) 手風琴 2：形心聯絡道與預設重設
                const conn = (obj.accessNodes && obj.accessNodes[0]) || null;
                const targetLink = conn ? network.links[conn.linkId] : null;
                let connectorBodyHtml = '';
                if (conn && targetLink) {
                    const totalLen = getPolylineLength(targetLink.waypoints);
                    const distOnLink = (conn.offsetRatio || 0) * totalLen;
                    connectorBodyHtml += `
                        <div class="prop-status-indicator success" style="padding:6px 8px; font-size:0.78rem;">
                            <i class="fa-solid fa-link"></i>
                            <div>
                                <div style="font-weight:700;">${_t('Linked')}: ${targetLink.name || targetLink.id}</div>
                                <div style="font-size:0.7rem; opacity:0.85;">Offset: ${((conn.offsetRatio || 0) * 100).toFixed(1)}% (${distOnLink.toFixed(1)}m)</div>
                            </div>
                        </div>`;
                } else {
                    connectorBodyHtml += `
                        <div class="prop-status-indicator error" style="padding:6px 8px; font-size:0.78rem;">
                            <i class="fa-solid fa-link-slash"></i>
                            <div><div style="font-weight:700;">${_t('Not Linked')}</div></div>
                        </div>`;
                }
                connectorBodyHtml += `
                    <div style="display:flex; gap:6px;">
                        <button id="btn-zone-reproject-conn" class="btn-soft" style="flex:1;">
                            <i class="fa-solid fa-arrows-rotate"></i> 重新投影聯絡道
                        </button>
                        <button id="btn-zone-reset-defaults" class="btn-soft" style="flex:1;">
                            <i class="fa-solid fa-rotate-left"></i> 重設法規預設
                        </button>
                    </div>`;
                content += renderAccordionHTML(_t('Centroid Connector'), 'fa-solid fa-route', connectorBodyHtml, false, targetLink ? targetLink.id : 'Unlinked');
                break;
            }

            // =============================================================
            // CASE: ROAD MARKING (道路標線)
            // =============================================================
            case 'RoadMarking': {
                const parentId = obj.nodeId || obj.linkId || 'Free';
                content += `
                    <div class="prop-stat-grid">
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Attached To</span>
                            <span class="prop-stat-value">${parentId}</span>
                        </div>
                        <div class="prop-stat-box">
                            <span class="prop-stat-label">Placement</span>
                            <span class="prop-stat-value">${(obj.isFree || obj.nodeId) ? '自由座標' : `${obj.position.toFixed(1)}m`}</span>
                        </div>
                    </div>

                    <div class="prop-card">
                        <div class="prop-row">
                            <span class="prop-label">Type</span>
                            <select id="prop-mark-type" class="prop-select" ${obj.markingType === 'channelization' ? 'disabled' : ''}>
                                <option value="stop_line" ${obj.markingType === 'stop_line' ? 'selected' : ''}>Stop Line (停止線)</option>
                                <option value="waiting_area" ${obj.markingType === 'waiting_area' ? 'selected' : ''}>Waiting Area (停等區)</option>
                                <option value="two_stage_box" ${obj.markingType === 'two_stage_box' ? 'selected' : ''}>Two-Stage Box (待轉區)</option>
                                <option value="crosswalk" ${obj.markingType === 'crosswalk' ? 'selected' : ''}>Crosswalk (行穿線)</option>
                            </select>
                        </div>`;

                if (obj.markingType === 'channelization') {
                    content += `
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Color</span>
                            <select id="prop-mark-color" class="prop-select">
                                <option value="white" ${obj.color === 'white' ? 'selected' : ''}>White (白槽化線)</option>
                                <option value="yellow" ${obj.color === 'yellow' ? 'selected' : ''}>Yellow (黃槽化線)</option>
                                <option value="green" ${obj.color === 'green' ? 'selected' : ''}>Green (庇護島/人行島)</option>
                            </select>
                        </div>`;
                }

                if (obj.linkId && !obj.isFree) {
                    content += `
                        <div class="prop-row">
                            <span class="prop-label">Position (m)</span>
                            <input type="number" step="0.5" id="prop-mark-pos" class="prop-input" value="${obj.position.toFixed(2)}" style="max-width:90px;">
                        </div>`;

                    if (obj.markingType !== 'crosswalk') {
                        const link = network.links[obj.linkId];
                        if (link) {
                            content += `<div class="prop-row" style="margin-bottom:0;"><span class="prop-label">Active Lanes</span><div class="veh-chip-group" style="flex-wrap:wrap;">`;
                            link.lanes.forEach((_, idx) => {
                                const checked = obj.laneIndices.includes(idx) ? 'checked' : '';
                                content += `
                                    <label class="veh-chip">
                                        <input type="checkbox" class="prop-mark-lane" value="${idx}" ${checked}> L${idx + 1}
                                    </label>`;
                            });
                            content += `</div></div>`;
                        }
                    }
                } else if (obj.markingType !== 'channelization') {
                    content += `
                        <div class="prop-row" style="margin-bottom:0;">
                            <span class="prop-label">Rotation (deg)</span>
                            <input type="number" id="prop-mark-rot" class="prop-input" value="${(obj.rotation || 0).toFixed(1)}" style="max-width:90px;">
                        </div>`;
                }

                if (obj.markingType !== 'stop_line' && obj.markingType !== 'channelization') {
                    content += `
                        <div class="prop-row" style="margin-top:6px;">
                            <span class="prop-label">${obj.markingType === 'crosswalk' ? 'Width (m)' : 'Length (m)'}</span>
                            <input type="number" step="0.1" id="prop-mark-len" class="prop-input" value="${obj.length}" style="max-width:90px;">
                        </div>`;
                    if ((obj.markingType === 'two_stage_box' || obj.markingType === 'crosswalk') && (obj.nodeId || obj.isFree)) {
                        content += `
                            <div class="prop-row">
                                <span class="prop-label">Span Width (m)</span>
                                <input type="number" step="0.1" id="prop-mark-wid" class="prop-input" value="${obj.width.toFixed(2)}" style="max-width:90px;">
                            </div>`;
                    }
                }

                if ((obj.markingType === 'two_stage_box' || obj.markingType === 'crosswalk') && obj.linkId) {
                    content += `
                        <div style="border-top:1px dashed var(--border-light); margin-top:8px; padding-top:6px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:0.78rem; cursor:pointer;">
                                <input type="checkbox" id="prop-mark-isfree" ${obj.isFree ? 'checked' : ''}>
                                <span>Manual Free Positioning (自由拖曳與旋轉)</span>
                            </label>
                        </div>`;
                }
                content += `</div>`; // End Basic Card

                // 行穿線專屬：對向跨越與行人號誌綁定
                if (obj.markingType === 'crosswalk') {
                    let optionsHtml = `<option value="">(無 / None)</option>`;
                    let foundNode = null;
                    if (obj.nodeId) {
                        foundNode = network.nodes[obj.nodeId];
                    } else if (obj.linkId) {
                        const link = network.links[obj.linkId];
                        if (link && link.waypoints.length >= 2) {
                            const len = getPolylineLength(link.waypoints);
                            const closestNodeId = (obj.position < len / 2) ? link.startNodeId : link.endNodeId;
                            if (closestNodeId) foundNode = network.nodes[closestNodeId];
                        }
                    }

                    let markGroupSetHtml = '';
                    let effectiveMarkSignalId = obj.signalGroupId || '';
                    if (foundNode && network.trafficLights[foundNode.id]) {
                        const tfl = network.trafficLights[foundNode.id];
                        ensureTflGroupSets(tfl);
                        if (obj.signalGroupBySet && obj.signalGroupBySet[tfl.activeGroupSetId] !== undefined) {
                            effectiveMarkSignalId = obj.signalGroupBySet[tfl.activeGroupSetId] || '';
                        }
                        const gsList = Object.values(tfl.signalGroupSets || {});
                        if (gsList.length > 0) {
                            markGroupSetHtml = `
                                <div class="prop-row">
                                    <span class="prop-label" style="color:#6d28d9; font-weight:600;">1. 硬體群組</span>
                                    <select id="prop-mark-groupset-select" data-node-id="${foundNode.id}" class="prop-select">
                                        ${gsList.map(gs => `<option value="${gs.id}" ${gs.id === tfl.activeGroupSetId ? 'selected' : ''}>${gs.name || gs.id}</option>`).join('')}
                                    </select>
                                </div>`;
                        }
                        if (tfl.signalGroups) {
                            Object.values(tfl.signalGroups).forEach(sg => {
                                if (sg.type === 'pedestrian') {
                                    const selected = effectiveMarkSignalId === sg.id ? 'selected' : '';
                                    optionsHtml += `<option value="${sg.id}" ${selected}>${sg.id}</option>`;
                                }
                            });
                        }
                    }

                    let cwExtraHtml = `
                        ${markGroupSetHtml}
                        <div class="prop-row">
                            <span class="prop-label">2. 行人燈號</span>
                            <div style="display:flex; gap:4px; flex:1;">
                                <select id="prop-mark-signal-select" class="prop-select" style="flex:1;">${optionsHtml}</select>
                                <input type="text" id="prop-mark-signal-text" class="prop-input" style="width:70px;" value="${effectiveMarkSignalId}" placeholder="ID">
                            </div>
                        </div>`;

                    if (obj.linkId && !obj.isFree) {
                        if (obj.spanToLinkId) {
                            cwExtraHtml += `
                                <div class="prop-status-indicator success" style="padding:6px 8px; font-size:0.75rem; margin-top:6px;">
                                    <i class="fa-solid fa-link"></i> 已跨越至對向: ${obj.spanToLinkId}
                                </div>
                                <button id="btn-remove-span" class="btn-soft" style="color:var(--danger); border-color:#fecaca;">取消跨越對向 (Remove Span)</button>`;
                        } else {
                            cwExtraHtml += `
                                <button id="btn-auto-span" class="btn-soft" style="margin-top:6px;">
                                    <i class="fa-solid fa-wand-magic-sparkles" style="color:var(--primary);"></i> 自動偵測並跨越對向車道
                                </button>`;
                        }
                    }
                    content += renderAccordionHTML('行穿線跨越與號誌綁定', 'fa-solid fa-person-walking', cwExtraHtml, true);
                }
                break;
            }
        }

        propertiesContent.innerHTML = content;
        attachPropertiesEventListeners(obj);
        if (typeof I18N !== 'undefined' && I18N.translateDOM) {
            I18N.translateDOM(propertiesContent);
        }
    }

    // =========================================================================
    // [核心重構] 綁定右側屬性面板事件
    // =========================================================================
    function attachPropertiesEventListeners(obj) {
        if (!obj) return;

        // 0. 綁定置頂識別卡的通用刪除按鈕
        const universalDelBtn = document.getElementById('btn-universal-delete-obj');
        if (universalDelBtn) {
            universalDelBtn.addEventListener('click', () => {
                const msg = (typeof I18N !== 'undefined' && I18N.t)
                    ? I18N.t(`Delete ${obj.type} (${obj.id})?`)
                    : `Delete ${obj.type} (${obj.id})?`;
                if (confirm(msg)) {
                    deleteSelectedObject();
                    saveState();
                }
            });
        }

        // 1. 車道寬度變更事件
        document.querySelectorAll('.prop-lane-width').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0.5) val = 0.5;
                obj.lanes[idx].width = val;

                if (obj.geometryType === 'parametric') {
                    generateParametricStrokes(obj);
                }

                drawLink(obj);
                updateDependencies(obj);
                layer.batchDraw();
                saveState();
            });
        });

        // 2. 分頁切換邏輯 (支援 Node 與 Link)
        const tabBtns = document.querySelectorAll('.prop-tab-btn');
        const tabContents = document.querySelectorAll('.prop-tab-content');

        if (tabBtns.length > 0) {
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    tabBtns.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));

                    const targetId = btn.dataset.target;
                    btn.classList.add('active');
                    const targetContent = document.getElementById(targetId);
                    if (targetContent) targetContent.classList.add('active');

                    if (obj.type === 'Node') {
                        lastActiveNodeTab = targetId;
                    } else if (obj.type === 'Link') {
                        lastActiveLinkTab = targetId;
                    }
                });
            });
        }

        // 3. 返回節點按鈕
        const backBtn = document.getElementById('back-to-node-btn');
        if (backBtn && lastSelectedNodeForProperties) {
            backBtn.addEventListener('click', () => {
                const nodeToReturnTo = lastSelectedNodeForProperties;
                lastSelectedNodeForProperties = null;
                selectObject(nodeToReturnTo);
            });
        }

        // 4. 輔助函數：高亮顯示 Link
        function clearLinkHighlights() {
            layer.find('.link-highlight').forEach(rect => rect.destroy());
        }

        function highlightLink(linkId) {
            const link = network.links[linkId];
            if (!link) return;

            if (link.geometryType === 'lane-based' && link.strokes && link.strokes.length >= 2) {
                const leftStroke = link.strokes[0].points;
                const rightStroke = link.strokes[link.strokes.length - 1].points;

                const highlightShape = new Konva.Shape({
                    sceneFunc: (ctx, shape) => {
                        if (leftStroke.length < 2 || rightStroke.length < 2) return;
                        ctx.beginPath();
                        ctx.moveTo(leftStroke[0].x, leftStroke[0].y);
                        for (let i = 1; i < leftStroke.length; i++) ctx.lineTo(leftStroke[i].x, leftStroke[i].y);
                        for (let i = rightStroke.length - 1; i >= 0; i--) ctx.lineTo(rightStroke[i].x, rightStroke[i].y);
                        ctx.closePath();
                        ctx.fillShape(shape);
                        ctx.strokeShape(shape);
                    },
                    fill: 'rgba(255, 0, 43, 0.67)',
                    stroke: 'rgba(255, 0, 43, 0.3)',
                    strokeWidth: 10,
                    lineJoin: 'round',
                    name: 'link-highlight',
                    listening: false
                });

                layer.add(highlightShape);
                highlightShape.moveToBottom();
                layer.batchDraw();
                return;
            }

            if (!link.waypoints || link.waypoints.length < 2) return;

            const totalWidth = getLinkTotalWidth(link);
            const halfWidth = totalWidth / 2 + 5;
            const waypoints = link.waypoints;
            const leftBoundary = [];
            const rightBoundary = [];

            for (let i = 0; i < waypoints.length; i++) {
                const p_curr = waypoints[i];
                let normal;
                if (i === 0) normal = getNormal(normalize(getVector(p_curr, waypoints[i + 1])));
                else if (i === waypoints.length - 1) normal = getNormal(normalize(getVector(waypoints[i - 1], p_curr)));
                else normal = getMiterNormal(waypoints[i - 1], p_curr, waypoints[i + 1]);

                leftBoundary.push(add(p_curr, scale(normal, halfWidth)));
                rightBoundary.push(add(p_curr, scale(normal, -halfWidth)));
            }

            const highlightRect = new Konva.Shape({
                sceneFunc: (ctx, shape) => {
                    if (leftBoundary.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(leftBoundary[0].x, leftBoundary[0].y);
                    for (let i = 1; i < leftBoundary.length; i++) ctx.lineTo(leftBoundary[i].x, leftBoundary[i].y);
                    for (let i = rightBoundary.length - 1; i >= 0; i--) ctx.lineTo(rightBoundary[i].x, rightBoundary[i].y);
                    ctx.closePath();
                    ctx.fillShape(shape);
                },
                fill: 'rgba(255, 0, 43, 0.67)',
                name: 'link-highlight',
                listening: false
            });

            layer.add(highlightRect);
            highlightRect.moveToBottom();
            layer.batchDraw();
        }

        // ============================================================
        // 各物件類型專屬監聽器
        // ============================================================

        // --- NODE ---
        if (obj.type === 'Node') {
            document.querySelectorAll('.prop-turn-ratio').forEach(input => {
                input.addEventListener('change', (e) => {
                    const fromId = e.target.dataset.from;
                    const toId = e.target.dataset.to;
                    let val = parseFloat(e.target.value);
                    if (isNaN(val)) val = 0;
                    val = Math.max(0, Math.min(100, val));
                    e.target.value = val;

                    if (!obj.turningRatios) obj.turningRatios = {};
                    if (!obj.turningRatios[fromId]) obj.turningRatios[fromId] = {};
                    obj.turningRatios[fromId][toId] = val / 100.0;
                    saveState();
                });
            });

            document.getElementById('btn-auto-calc-turns')?.addEventListener('click', () => {
                const outgoingLinks = [...obj.outgoingLinkIds];
                const outFlows = {};
                let totalOutFlow = 0;

                outgoingLinks.forEach(linkId => {
                    let linkFlow = 0;
                    Object.values(network.detectors).forEach(det => {
                        if (det.linkId === linkId && det.observedFlow > 0) {
                            linkFlow = Math.max(linkFlow, det.observedFlow);
                        }
                    });
                    outFlows[linkId] = linkFlow;
                    totalOutFlow += linkFlow;
                });

                if (totalOutFlow === 0) {
                    alert("無法自動計算：出口路段上未找到偵測器流量數據 (No observed flow found)。");
                    return;
                }

                if (!obj.turningRatios) obj.turningRatios = {};
                [...obj.incomingLinkIds].forEach(fromId => {
                    if (!obj.turningRatios[fromId]) obj.turningRatios[fromId] = {};
                    outgoingLinks.forEach(toId => {
                        obj.turningRatios[fromId][toId] = outFlows[toId] / totalOutFlow;
                    });
                });

                updatePropertiesPanel(obj);
                alert("轉向比例已根據偵測器流量自動更新。");
                saveState();
            });

            if (!network.trafficLights[obj.id]) {
                network.trafficLights[obj.id] = { nodeId: obj.id, timeShift: 0, signalGroups: {}, schedule: [] };
            }

            document.getElementById('prop-tfl-shift')?.addEventListener('change', (e) => {
                const newVal = parseInt(e.target.value, 10) || 0;
                const tfl = network.trafficLights[obj.id];
                tfl.timeShift = newVal;

                if (tfl.advanced && tfl.advanced.weekly) {
                    const monPlanId = tfl.advanced.weekly[1];
                    if (monPlanId && tfl.advanced.dailyPlans[monPlanId]) {
                        const sw = tfl.advanced.dailyPlans[monPlanId].switches.find(s => s.schedId !== 'NONE');
                        if (sw && tfl.advanced.schedules[sw.schedId]) {
                            tfl.advanced.schedules[sw.schedId].timeShift = newVal;
                        }
                    }
                }
                saveState();
            });

            document.getElementById('edit-tfl-btn')?.addEventListener('click', () => showTrafficLightEditor(obj));

            document.getElementById('prop-node-ped-vol')?.addEventListener('change', (e) => {
                let val = parseInt(e.target.value, 10);
                if (isNaN(val) || val < 0) val = 0;
                obj.pedestrianVolume = val;
                e.target.value = val;
                saveState();
            });

            document.getElementById('prop-node-cross-once')?.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 0;
                if (val > 100) val = 100;
                obj.crossOnceProb = val;
                e.target.value = val;
                if (obj.crossOnceProb + (obj.crossTwiceProb || 0) > 100) {
                    obj.crossTwiceProb = 100 - obj.crossOnceProb;
                    const twiceInput = document.getElementById('prop-node-cross-twice');
                    if (twiceInput) twiceInput.value = obj.crossTwiceProb;
                }
                saveState();
            });

            document.getElementById('prop-node-cross-twice')?.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 0;
                if (val > 100) val = 100;
                obj.crossTwiceProb = val;
                e.target.value = val;
                if ((obj.crossOnceProb || 0) + obj.crossTwiceProb > 100) {
                    obj.crossOnceProb = 100 - obj.crossTwiceProb;
                    const onceInput = document.getElementById('prop-node-cross-once');
                    if (onceInput) onceInput.value = obj.crossOnceProb;
                }
                saveState();
            });

            document.getElementById('btn-delete-node')?.addEventListener('click', () => {
                const confirmMsg = (typeof I18N !== 'undefined' && I18N.t)
                    ? I18N.t('Are you sure you want to delete this intersection?')
                    : 'Are you sure you want to delete this intersection?';
                if (confirm(confirmMsg)) {
                    deleteNode(obj.id, true);
                    deselectAll();
                    layer.batchDraw();
                    saveState();
                }
            });

            document.getElementById('prop-node-groupset-select')?.addEventListener('change', (e) => {
                e.stopPropagation();
                const tfl = network.trafficLights[obj.id];
                if (tfl) {
                    setActiveTflGroupSet(tfl, e.target.value);
                    updatePropertiesPanel(obj);
                }
            });

            document.querySelectorAll('.prop-group-signal-select').forEach(select => {
                select.addEventListener('click', (e) => e.stopPropagation());
                select.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const connIdsToUpdate = JSON.parse(e.target.dataset.groupJson);
                    const newGroupId = e.target.value;
                    const tfl = network.trafficLights[obj.id];
                    if (!tfl) return;

                    Object.values(tfl.signalGroups).forEach(group => {
                        group.connIds = group.connIds.filter(id => !connIdsToUpdate.includes(id));
                    });

                    if (newGroupId && tfl.signalGroups[newGroupId]) {
                        tfl.signalGroups[newGroupId].connIds.push(...connIdsToUpdate);
                    }
                    saveState();
                });
            });

            document.querySelectorAll('.group-edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sourceLink = network.links[btn.dataset.source];
                    const destLink = network.links[btn.dataset.dest];
                    let targetGroupObj = null;
                    for (let shape of layer.find('.group-connection-visual')) {
                        const meta = shape.getAttr('meta');
                        if (meta && meta.sourceLinkId === sourceLink.id && meta.destLinkId === destLink.id) {
                            targetGroupObj = { id: shape.id(), ...meta, konvaLine: shape };
                            break;
                        }
                    }
                    if (sourceLink && destLink && targetGroupObj) {
                        const modalPos = { x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 150 };
                        showLaneRangeSelector(sourceLink, destLink, modalPos, targetGroupObj);
                    }
                });
            });

            document.querySelectorAll('.group-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sourceId = btn.dataset.source;
                    const destId = btn.dataset.dest;
                    if (confirm(I18N.t(`Delete connection group from ${sourceId} to ${destId}?`))) {
                        let targetGroupObj = null;
                        for (let shape of layer.find('.group-connection-visual')) {
                            const meta = shape.getAttr('meta');
                            if (meta && meta.sourceLinkId === sourceId && meta.destLinkId === destId) {
                                targetGroupObj = { id: shape.id(), ...meta, konvaLine: shape };
                                break;
                            }
                        }
                        if (targetGroupObj) {
                            deleteConnectionGroup(targetGroupObj);
                            updatePropertiesPanel(obj);
                            saveState();
                        }
                    }
                });
            });

            document.querySelectorAll('.btn-macro-slip').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sourceId = btn.dataset.source;
                    const destId = btn.dataset.dest;
                    const upInput = document.getElementById(`slip-up-${sourceId}-${destId}`);
                    const downInput = document.getElementById(`slip-down-${sourceId}-${destId}`);
                    const upDist = upInput ? (parseFloat(upInput.value) || 20) : 20;
                    const downDist = downInput ? (parseFloat(downInput.value) || 20) : 20;

                    let targetGroupObj = null;
                    layer.find('.group-connection-visual').forEach(shape => {
                        const meta = shape.getAttr('meta');
                        if (meta && meta.sourceLinkId === sourceId && meta.destLinkId === destId) {
                            targetGroupObj = { id: shape.id(), ...meta, konvaLine: shape };
                        }
                    });

                    if (confirm("是否自動建立右轉槽化引道？(這將會依據您設定的距離分割路段並重組拓撲)")) {
                        window.generateSlipLaneMacro(sourceId, destId, targetGroupObj, upDist, downDist);
                    }
                });
            });

            document.querySelectorAll('.turn-ratio-header').forEach(header => {
                header.addEventListener('mouseenter', (e) => {
                    clearLinkHighlights();
                    highlightLink(e.target.dataset.link);
                });
                header.addEventListener('mouseleave', () => clearLinkHighlights());
            });

            document.querySelectorAll('.turn-ratio-row').forEach(row => {
                row.addEventListener('mouseenter', (e) => {
                    e.stopPropagation();
                    clearLinkHighlights();
                    highlightLink(e.currentTarget.dataset.from);
                    highlightLink(e.currentTarget.dataset.to);
                    e.currentTarget.style.backgroundColor = '#e2e8f0';
                });
                row.addEventListener('mouseleave', (e) => {
                    clearLinkHighlights();
                    e.currentTarget.style.backgroundColor = 'transparent';
                });
            });

            document.querySelectorAll('.connection-group-card').forEach(card => {
                card.addEventListener('mouseenter', (e) => {
                    clearLinkHighlights();
                    const srcId = e.currentTarget.dataset.source;
                    const dstId = e.currentTarget.dataset.dest;
                    if (srcId) highlightLink(srcId);
                    if (dstId) highlightLink(dstId);
                    e.currentTarget.style.borderColor = 'var(--primary)';
                });
                card.addEventListener('mouseleave', (e) => {
                    clearLinkHighlights();
                    e.currentTarget.style.borderColor = '';
                });
            });

            document.getElementById('redraw-node-connections-btn')?.addEventListener('click', () => {
                redrawNodeConnections(obj.id);
            });

            document.getElementById('reset-node-shape-btn')?.addEventListener('click', () => {
                obj.customPolygonPoints = null;
                drawNodeHandles(obj);
                layer.batchDraw();
                updatePropertiesPanel(obj);
                saveState();
            });

            if (typeof bindSynchroNodePanelEvents === 'function') {
                bindSynchroNodePanelEvents(propertiesContent, obj);
            }
        }

        // --- DETECTOR ---
        if (obj.type.includes('Detector')) {
            document.getElementById('prop-det-flow')?.addEventListener('change', (e) => {
                obj.observedFlow = parseFloat(e.target.value) || 0;
                saveState();
            });

            document.getElementById('prop-det-is-source')?.addEventListener('change', (e) => {
                obj.isSource = e.target.checked;
                updatePropertiesPanel(obj);
                saveState();
            });

            if (obj.isSource) {
                obj.spawnProfiles.forEach((_, idx) => {
                    document.getElementById(`det-prof-sel-${idx}`)?.addEventListener('change', (e) => {
                        obj.spawnProfiles[idx].profileId = e.target.value;
                        saveState();
                    });
                });

                document.querySelectorAll('.det-prof-weight').forEach(input => {
                    input.addEventListener('change', (e) => {
                        const idx = parseInt(e.target.dataset.index);
                        obj.spawnProfiles[idx].weight = parseFloat(e.target.value) || 1.0;
                        saveState();
                    });
                });

                document.querySelectorAll('.det-prof-del-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.currentTarget.dataset.index);
                        obj.spawnProfiles.splice(idx, 1);
                        updatePropertiesPanel(obj);
                        saveState();
                    });
                });

                document.getElementById('btn-add-det-profile')?.addEventListener('click', () => {
                    const firstKey = Object.keys(network.vehicleProfiles)[0] || 'car';
                    obj.spawnProfiles.push({ profileId: firstKey, weight: 1.0 });
                    updatePropertiesPanel(obj);
                });
            }

            document.getElementById('btn-manage-profiles')?.addEventListener('click', () => {
                const dummyOrigin = { id: 'Global_Profiles', periods: [] };
                currentModalOrigin = dummyOrigin;
                document.getElementById('spawner-modal-title').textContent = `Global Vehicle Profiles`;
                renderSpawnerProfilesTab();
                document.getElementById('spawner-modal').style.display = 'block';

                const profileTab = document.querySelector('.tab-link[data-tab="spawner-profiles"]');
                const periodsTab = document.querySelector('.tab-link[data-tab="spawner-periods"]');

                if (profileTab) {
                    profileTab.classList.add('active');
                    document.getElementById('spawner-profiles')?.classList.add('active');
                    document.getElementById('spawner-periods')?.classList.remove('active');
                    periodsTab?.classList.remove('active');
                }
                if (periodsTab) periodsTab.style.display = 'none';

                document.getElementById('spawner-save-btn').onclick = () => {
                    const profileElements = document.querySelectorAll('#spawner-profiles-list .spawner-profile-item');
                    const updatedProfiles = {};
                    profileElements.forEach(div => {
                        const newId = div.querySelector('.profile-id').value;
                        const newProfile = { id: newId };
                        div.querySelectorAll('.profile-prop').forEach(input => { newProfile[input.dataset.prop] = parseFloat(input.value); });
                        updatedProfiles[newId] = newProfile;
                    });
                    network.vehicleProfiles = updatedProfiles;
                    document.getElementById('spawner-modal').style.display = 'none';
                    if (periodsTab) periodsTab.style.display = 'inline-block';
                    currentModalOrigin = null;
                    updatePropertiesPanel(obj);
                    saveState();
                };
            });

            document.getElementById('prop-det-name')?.addEventListener('change', e => {
                obj.name = e.target.value;
                updatePropertiesPanel(obj);
                saveState();
            });

            document.getElementById('prop-det-pos')?.addEventListener('change', e => {
                let newPos = parseFloat(e.target.value);
                if (obj.type === 'SectionDetector' && newPos < obj.length) {
                    newPos = obj.length;
                    e.target.value = newPos.toFixed(2);
                }
                obj.position = newPos;
                drawDetector(obj);
                layer.batchDraw();
                saveState();
            });

            if (obj.type === 'SectionDetector') {
                document.getElementById('prop-det-len')?.addEventListener('change', e => {
                    let newLen = parseFloat(e.target.value);
                    if (obj.position < newLen) {
                        newLen = obj.position;
                        e.target.value = newLen.toFixed(2);
                    }
                    obj.length = newLen;
                    drawDetector(obj);
                    layer.batchDraw();
                    saveState();
                });
            }
        }

        // --- LINK ---
        if (obj.type === 'Link') {
            document.getElementById('prop-edit-median')?.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 0;
                e.target.value = val;
                updatePairedLinksGeometry(obj, val);
                saveState();
            });

            // 標準模式車道數直接修改
            document.getElementById('prop-lanes')?.addEventListener('change', (e) => {
                let targetCount = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
                if (typeof applySynchroLaneConfig === 'function') {
                    applySynchroLaneConfig(obj, getDefaultSynchroLaneTurns(targetCount));
                    updatePropertiesPanel(obj);
                }
            });

            if (obj.geometryType === 'parametric' && obj.parametricConfig) {
                const c = obj.parametricConfig;
                const updateParametric = () => {
                    generateParametricStrokes(obj);
                    const maxLaneIdx = obj.lanes.length - 1;
                    Object.values(network.connections).forEach(conn => {
                        if (conn.sourceLinkId === obj.id && conn.sourceLaneIndex > maxLaneIdx) deleteConnection(conn.id);
                        if (conn.destLinkId === obj.id && conn.destLaneIndex > maxLaneIdx) deleteConnection(conn.id);
                    });

                    const ll = c.leftPocket && c.leftPocket.exists ? (c.leftPocket.lanes || 1) : 0;
                    const tl = Math.max(1, c.throughLanes || 1);
                    const rl = c.rightPocket && c.rightPocket.exists ? (c.rightPocket.lanes || 1) : 0;
                    const autoTurns = [];
                    for (let i = 0; i < ll; i++) autoTurns.push("L");
                    for (let i = 0; i < tl; i++) {
                        if (tl === 1) autoTurns.push((ll > 0 ? "" : "L") + "T" + (rl > 0 ? "" : "R"));
                        else if (i === 0) autoTurns.push(ll > 0 ? "T" : "LT");
                        else if (i === tl - 1) autoTurns.push(rl > 0 ? "T" : "TR");
                        else autoTurns.push("T");
                    }
                    for (let i = 0; i < rl; i++) autoTurns.push("R");

                    if (typeof applySynchroLaneConfig === "function") {
                        applySynchroLaneConfig(obj, autoTurns, { skipSave: true });
                        if (obj.startNodeId && network.nodes[obj.startNodeId]) {
                            network.nodes[obj.startNodeId].incomingLinkIds.forEach(upInId => {
                                const upInLink = network.links[upInId];
                                if (upInLink) applySynchroLaneConfig(upInLink, inferSynchroLaneTurns(upInLink), { skipSave: true });
                            });
                        }
                    }

                    drawLink(obj);
                    updateDependencies(obj);
                    layer.batchDraw();
                    saveState();
                    updatePropertiesPanel(obj);
                };

                const bindInt = (id, objRef, key) => {
                    document.getElementById(id)?.addEventListener('change', e => {
                        objRef[key] = Math.max(1, parseInt(e.target.value, 10) || 1);
                        updateParametric();
                    });
                };
                const bindFloat = (id, objRef, key) => {
                    document.getElementById(id)?.addEventListener('change', e => {
                        objRef[key] = Math.max(0.1, parseFloat(e.target.value) || 0.1);
                        updateParametric();
                    });
                };

                bindInt('prop-para-through', c, 'throughLanes');
                bindInt('prop-para-lp-lanes', c.leftPocket, 'lanes');
                bindFloat('prop-para-lp-len', c.leftPocket, 'length');
                bindFloat('prop-para-lp-tap', c.leftPocket, 'taper');

                bindInt('prop-para-rp-lanes', c.rightPocket, 'lanes');
                bindFloat('prop-para-rp-len', c.rightPocket, 'length');
                bindFloat('prop-para-rp-tap', c.rightPocket, 'taper');

                document.getElementById('prop-para-lp-exists')?.addEventListener('change', e => {
                    c.leftPocket.exists = e.target.checked;
                    updateParametric();
                });

                document.getElementById('prop-para-rp-exists')?.addEventListener('change', e => {
                    c.rightPocket.exists = e.target.checked;
                    updateParametric();
                });

                document.getElementById('btn-bake-to-mesh')?.addEventListener('click', () => {
                    if (confirm("轉換為手繪標線模式？轉換後將無法再使用拉桿快速調整。")) {
                        obj.geometryType = 'lane-based';
                        delete obj.parametricConfig;
                        drawLink(obj);
                        drawWaypointHandles(obj);
                        updatePropertiesPanel(obj);
                        saveState();
                    }
                });
            }

            document.getElementById('prop-link-name')?.addEventListener('change', (e) => {
                obj.name = e.target.value;
                updatePropertiesPanel(obj);
                saveState();
            });

            const opacityInput = document.getElementById('prop-link-opacity');
            const opacityVal = document.getElementById('prop-link-opacity-val');
            if (opacityInput) {
                opacityInput.addEventListener('input', (e) => {
                    const val = parseFloat(e.target.value);
                    obj.roadOpacity = val;
                    if (opacityVal) opacityVal.textContent = val;
                    const roadShape = obj.konvaGroup.findOne('.road-surface');
                    if (roadShape) {
                        roadShape.opacity(val);
                        layer.batchDraw();
                    }
                });
            }

            if (obj.geometryType === 'lane-based' && obj.strokes) {
                document.querySelectorAll('.lb-stroke-type-select').forEach(select => {
                    select.addEventListener('change', (e) => {
                        const idx = parseInt(e.target.dataset.index, 10);
                        obj.strokes[idx].type = e.target.value;
                        drawLink(obj);
                        layer.batchDraw();
                        saveState();
                    });
                });

                document.querySelectorAll('.lb-stroke-del-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.currentTarget.dataset.index, 10);
                        if (confirm("Remove this divider line? (Will merge adjacent lanes)")) {
                            obj.strokes.splice(idx, 1);
                            if (obj.lanes && obj.lanes.length > 1) obj.lanes.pop();
                            updateLaneBasedGeometry(obj);
                            drawLink(obj);
                            drawWaypointHandles(obj);
                            updateDependencies(obj);
                            updatePropertiesPanel(obj);
                            layer.batchDraw();
                            saveState();
                        }
                    });
                });

                const addStrokeBtn = document.getElementById('btn-lb-add-stroke');
                const customDropdown = document.getElementById('custom-stroke-dropdown');
                const customHeader = document.getElementById('custom-stroke-header');
                const customList = document.getElementById('custom-stroke-list');
                const customSelected = document.getElementById('custom-stroke-selected');

                if (customDropdown && customHeader && customList) {
                    customHeader.addEventListener('click', (e) => {
                        e.stopPropagation();
                        customList.style.display = customList.style.display === 'none' ? 'block' : 'none';
                    });

                    customList.querySelectorAll('.custom-stroke-option').forEach(opt => {
                        opt.addEventListener('click', (e) => {
                            e.stopPropagation();
                            draftCurrentStrokeType = opt.dataset.value;
                            customSelected.innerHTML = opt.innerHTML;
                            customList.style.display = 'none';
                        });
                        opt.addEventListener('mouseenter', () => { opt.style.backgroundColor = '#f1f5f9'; });
                        opt.addEventListener('mouseleave', () => { opt.style.backgroundColor = 'transparent'; });
                    });

                    document.addEventListener('click', (e) => {
                        if (!customDropdown.contains(e.target)) customList.style.display = 'none';
                    }, { once: true });
                }

                if (addStrokeBtn) {
                    addStrokeBtn.addEventListener('click', () => {
                        appendingStrokeToLink = obj;
                        setTool('append-lane-stroke');
                    });
                }
            }

            // TAB 2: Connections 列表互動
            document.querySelectorAll('.conn-list-item').forEach(item => {
                const connId = item.dataset.connId;
                const conn = network.connections[connId];

                item.addEventListener('mouseenter', () => {
                    item.style.backgroundColor = '#eff6ff';
                    if (conn && conn.konvaBezier) {
                        if (!conn.konvaBezier.getAttr('originalStroke')) {
                            conn.konvaBezier.setAttr('originalStroke', conn.konvaBezier.stroke());
                            conn.konvaBezier.setAttr('originalStrokeWidth', conn.konvaBezier.strokeWidth());
                        }
                        conn.konvaBezier.stroke('#fbbf24');
                        conn.konvaBezier.strokeWidth(2);
                        conn.konvaBezier.moveToTop();
                        layer.batchDraw();
                    }
                });

                item.addEventListener('mouseleave', () => {
                    item.style.backgroundColor = '#ffffff';
                    if (conn && conn.konvaBezier) {
                        const originalStroke = conn.konvaBezier.getAttr('originalStroke');
                        const originalStrokeWidth = conn.konvaBezier.getAttr('originalStrokeWidth');
                        if (originalStroke) {
                            conn.konvaBezier.stroke(originalStroke);
                            conn.konvaBezier.strokeWidth(originalStrokeWidth);
                            conn.konvaBezier.setAttr('originalStroke', null);
                            conn.konvaBezier.setAttr('originalStrokeWidth', null);
                        }
                        layer.batchDraw();
                    }
                });

                item.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-del-single-conn')) return;
                    if (conn) {
                        item.dispatchEvent(new MouseEvent('mouseleave'));
                        selectObject(conn);
                    }
                });
            });

            document.querySelectorAll('.btn-del-single-conn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const connId = btn.dataset.id;
                    if (confirm(typeof I18N !== 'undefined' && I18N.t ? I18N.t("Remove this connection?") : "Remove this connection?")) {
                        deleteConnection(connId);
                        layer.find('.group-connection-visual').forEach(g => {
                            const meta = g.getAttr('meta');
                            if (meta && meta.connectionIds) {
                                meta.connectionIds = meta.connectionIds.filter(id => id !== connId);
                                if (meta.connectionIds.length === 0) g.destroy();
                                else g.setAttr('meta', meta);
                            }
                        });
                        updatePropertiesPanel(obj);
                        layer.batchDraw();
                        saveState();
                    }
                });
            });

            // 車種限制 Checkbox 膠囊變更事件
            document.querySelectorAll('.prop-lane-vehicle-cb').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const laneIdx = parseInt(e.target.dataset.lane, 10);
                    const profId = e.target.value;
                    const lane = obj.lanes[laneIdx];

                    if (!lane.allowedVehicleProfiles || lane.allowedVehicleProfiles.length === 0) {
                        lane.allowedVehicleProfiles = Object.keys(network.vehicleProfiles);
                    }

                    if (e.target.checked) {
                        if (!lane.allowedVehicleProfiles.includes(profId)) {
                            lane.allowedVehicleProfiles.push(profId);
                        }
                    } else {
                        lane.allowedVehicleProfiles = lane.allowedVehicleProfiles.filter(id => id !== profId);
                    }
                    saveState();
                });
            });

            // 車道列 Hover 畫布多邊形高亮預覽
            const clearLaneHighlight = () => {
                layer.find('.lane-polygon-highlight').forEach(s => s.destroy());
                layer.batchDraw();
            };

            document.querySelectorAll('.lane-config-card').forEach(card => {
                card.addEventListener('mouseenter', (e) => {
                    const laneIdx = parseInt(e.currentTarget.dataset.laneIndex, 10);
                    const lane = obj.lanes[laneIdx];
                    if (!lane) return;

                    let finalL = [];
                    let finalR = [];

                    if ((obj.geometryType === 'lane-based' || obj.geometryType === 'parametric') && obj.strokes && obj.strokes.length >= 2) {
                        let leftStroke = lane.leftStrokeId !== undefined ? obj.strokes.find(s => String(s.id) === String(lane.leftStrokeId)) : undefined;
                        let rightStroke = lane.rightStrokeId !== undefined ? obj.strokes.find(s => String(s.id) === String(lane.rightStrokeId)) : undefined;

                        if (!leftStroke) leftStroke = obj.strokes[laneIdx];
                        if (!rightStroke) rightStroke = obj.strokes[laneIdx + 1] || obj.strokes[obj.strokes.length - 1];
                        if (!leftStroke || !rightStroke) return;

                        let leftPts = [...leftStroke.points];
                        let rightPts = [...rightStroke.points];

                        const dNorm = Math.hypot(leftPts[0].x - rightPts[0].x, leftPts[0].y - rightPts[0].y) +
                            Math.hypot(leftPts[leftPts.length - 1].x - rightPts[rightPts.length - 1].x, leftPts[leftPts.length - 1].y - rightPts[rightPts.length - 1].y);
                        const dRev = Math.hypot(leftPts[0].x - rightPts[rightPts.length - 1].x, leftPts[0].y - rightPts[rightPts.length - 1].y) +
                            Math.hypot(leftPts[leftPts.length - 1].x - rightPts[0].x, leftPts[leftPts.length - 1].y - rightPts[0].y);

                        if (dRev < dNorm) rightPts.reverse();

                        const getPolyLength = (pts) => {
                            let l = 0;
                            for (let i = 0; i < pts.length - 1; i++) l += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
                            return l;
                        };

                        const getPointAtS = (pts, dist) => {
                            if (dist <= 0) return pts[0];
                            let cur = 0;
                            for (let i = 0; i < pts.length - 1; i++) {
                                const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
                                if (cur + d >= dist) {
                                    const t = (dist - cur) / d;
                                    return { x: pts[i].x + t * (pts[i + 1].x - pts[i].x), y: pts[i].y + t * (pts[i + 1].y - pts[i].y) };
                                }
                                cur += d;
                            }
                            return pts[pts.length - 1];
                        };

                        const projectToPolylineS = (pt, poly) => {
                            let minDist = Infinity, bestS = 0, curL = 0;
                            for (let i = 0; i < poly.length - 1; i++) {
                                const p1 = poly[i], p2 = poly[i + 1];
                                const segL = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                                if (segL === 0) continue;
                                let t = ((pt.x - p1.x) * (p2.x - p1.x) + (pt.y - p1.y) * (p2.y - p1.y)) / (segL * segL);
                                t = Math.max(0, Math.min(1, t));
                                const projX = p1.x + t * (p2.x - p1.x), projY = p1.y + t * (p2.y - p1.y);
                                const d = Math.hypot(pt.x - projX, pt.y - projY);
                                if (d < minDist) { minDist = d; bestS = curL + t * segL; }
                                curL += segL;
                            }
                            return bestS;
                        };

                        const lenL = getPolyLength(leftPts), lenR = getPolyLength(rightPts);
                        const projR0_on_L = projectToPolylineS(rightPts[0], leftPts);
                        const projREnd_on_L = projectToPolylineS(rightPts[rightPts.length - 1], leftPts);
                        const startL = Math.max(0, Math.min(projR0_on_L, projREnd_on_L));
                        const endL = Math.min(lenL, Math.max(projR0_on_L, projREnd_on_L));

                        const projL0_on_R = projectToPolylineS(leftPts[0], rightPts);
                        const projLEnd_on_R = projectToPolylineS(leftPts[leftPts.length - 1], rightPts);
                        const startR = Math.max(0, Math.min(projL0_on_R, projLEnd_on_R));
                        const endR = Math.min(lenR, Math.max(projL0_on_R, projLEnd_on_R));

                        if (endL - startL < 0.1 || endR - startR < 0.1) return;

                        finalL.push(getPointAtS(leftPts, startL));
                        let curL = 0;
                        for (let i = 0; i < leftPts.length - 1; i++) {
                            curL += Math.hypot(leftPts[i + 1].x - leftPts[i].x, leftPts[i + 1].y - leftPts[i].y);
                            if (curL > startL + 0.05 && curL < endL - 0.05) finalL.push(leftPts[i + 1]);
                        }
                        finalL.push(getPointAtS(leftPts, endL));

                        finalR.push(getPointAtS(rightPts, startR));
                        let curR = 0;
                        for (let i = 0; i < rightPts.length - 1; i++) {
                            curR += Math.hypot(rightPts[i + 1].x - rightPts[i].x, rightPts[i + 1].y - rightPts[i].y);
                            if (curR > startR + 0.05 && curR < endR - 0.05) finalR.push(rightPts[i + 1]);
                        }
                        finalR.push(getPointAtS(rightPts, endR));
                    } else {
                        const totalWidth = getLinkTotalWidth(obj);
                        let startOffset = -totalWidth / 2;
                        for (let i = 0; i < laneIdx; i++) startOffset += obj.lanes[i].width;
                        let endOffset = startOffset + lane.width;
                        finalL = getOffsetPolyline(obj.waypoints, startOffset);
                        finalR = getOffsetPolyline(obj.waypoints, endOffset);
                    }

                    if (finalL.length < 2 || finalR.length < 2) return;

                    const highlightShape = new Konva.Shape({
                        sceneFunc: (ctx, shape) => {
                            ctx.beginPath();
                            ctx.moveTo(finalL[0].x, finalL[0].y);
                            for (let i = 1; i < finalL.length; i++) ctx.lineTo(finalL[i].x, finalL[i].y);
                            for (let i = finalR.length - 1; i >= 0; i--) ctx.lineTo(finalR[i].x, finalR[i].y);
                            ctx.closePath();
                            ctx.fillShape(shape);
                            ctx.strokeShape(shape);
                        },
                        fill: 'rgba(59, 130, 246, 0.4)',
                        stroke: '#2563eb',
                        strokeWidth: 2,
                        name: 'lane-polygon-highlight',
                        listening: false
                    });

                    clearLaneHighlight();
                    layer.add(highlightShape);
                    highlightShape.moveToTop();
                    layer.batchDraw();
                });

                card.addEventListener('mouseleave', () => clearLaneHighlight());
            });

            if (typeof bindSynchroLanePickerEvents === 'function') {
                bindSynchroLanePickerEvents(propertiesContent, obj, 'link');
            }
        }

        // --- CONNECTION GROUP ---
        if (obj.type === 'ConnectionGroup') {
            document.getElementById('edit-group-btn')?.addEventListener('click', () => {
                const sourceLink = network.links[obj.sourceLinkId];
                const destLink = network.links[obj.destLinkId];
                if (sourceLink && destLink) {
                    const modalPos = { x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 150 };
                    showLaneRangeSelector(sourceLink, destLink, modalPos, obj);
                }
            });
        }

        // --- CONNECTION / GROUP SIGNAL SELECTOR ---
        document.getElementById('prop-conn-groupset-select')?.addEventListener('change', (e) => {
            const tfl = network.trafficLights[obj.nodeId];
            if (!tfl) return;
            setActiveTflGroupSet(tfl, e.target.value);
            updatePropertiesPanel(obj);
        });

        document.getElementById('prop-tfl-group')?.addEventListener('change', (e) => {
            const newGroupId = e.target.value;
            const tfl = network.trafficLights[obj.nodeId];
            if (!tfl) return;
            ensureTflGroupSets(tfl);

            const connIdsToUpdate = (obj.type === 'Connection') ? [obj.id] : obj.connectionIds;
            Object.values(tfl.signalGroups).forEach(group => {
                group.connIds = group.connIds.filter(id => !connIdsToUpdate.includes(id));
            });

            if (newGroupId && tfl.signalGroups[newGroupId]) {
                tfl.signalGroups[newGroupId].connIds.push(...connIdsToUpdate);
            }
            saveState();
        });

        // --- ORIGIN ---
        if (obj.type === 'Origin') {
            document.getElementById('configure-spawner-btn')?.addEventListener('click', () => showSpawnerEditor(obj));
        }

        // --- ROAD SIGN ---
        if (obj.type === 'RoadSign') {
            document.getElementById('prop-sign-type')?.addEventListener('change', e => {
                const oldType = obj.signType;
                obj.signType = e.target.value;
                const totalWidth = getLinkTotalWidth(network.links[obj.linkId]);

                if (oldType !== 'traffic_cone' && obj.signType === 'traffic_cone') {
                    obj.lateralOffset = 0;
                } else if (obj.signType !== 'traffic_cone') {
                    obj.lateralOffset = (totalWidth / 2) + 8;
                }

                const limitRow = document.getElementById('prop-speed-limit-row');
                const offsetRow = document.getElementById('prop-cone-offset-row');
                if (limitRow) limitRow.style.display = (obj.signType === 'start') ? 'flex' : 'none';
                if (offsetRow) offsetRow.style.display = (obj.signType === 'traffic_cone') ? 'flex' : 'none';

                const offsetInput = document.getElementById('prop-cone-offset');
                if (offsetInput) offsetInput.value = obj.lateralOffset.toFixed(2);

                drawRoadSign(obj);
                layer.batchDraw();
                saveState();
            });

            document.getElementById('prop-speed-limit')?.addEventListener('change', e => {
                obj.speedLimit = parseFloat(e.target.value);
                saveState();
            });

            document.getElementById('prop-sign-pos')?.addEventListener('change', e => {
                obj.position = parseFloat(e.target.value);
                drawRoadSign(obj);
                layer.batchDraw();
                saveState();
            });

            document.getElementById('prop-cone-offset')?.addEventListener('change', e => {
                const totalWidth = getLinkTotalWidth(network.links[obj.linkId]);
                let val = parseFloat(e.target.value);
                val = Math.max(-totalWidth / 2, Math.min(totalWidth / 2, val));
                obj.lateralOffset = val;
                e.target.value = val.toFixed(2);
                drawRoadSign(obj);
                layer.batchDraw();
                saveState();
            });
        }

        // --- BACKGROUND ---
        if (obj.type === 'Background') {
            document.getElementById('btn-bg-back-list')?.addEventListener('click', () => deselectAll());

            document.getElementById('prop-bg-name')?.addEventListener('change', (e) => {
                obj.name = e.target.value;
                updatePropertiesPanel(obj);
                saveState();
            });

            const fileBtn = document.getElementById('prop-bg-file-btn');
            const fileInput = document.getElementById('prop-bg-file-input');
            const opacityInput = document.getElementById('prop-bg-opacity');
            const scaleInput = document.getElementById('prop-bg-scale');
            const lockInput = document.getElementById('prop-bg-locked');

            if (fileBtn && fileInput) fileBtn.addEventListener('click', () => fileInput.click());

            if (fileInput) fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target.result;
                    const image = new window.Image();
                    image.src = dataUrl;
                    image.onload = () => {
                        obj.imageDataUrl = dataUrl;
                        obj.imageType = file.type.split('/')[1].toUpperCase();
                        obj.konvaImage.image(image);
                        const currentScale = obj.scale;
                        obj.width = image.width * currentScale;
                        obj.height = image.height * currentScale;
                        obj.konvaGroup.width(image.width);
                        obj.konvaGroup.height(image.height);
                        obj.konvaImage.width(image.width);
                        obj.konvaImage.height(image.height);
                        obj.konvaBorder.width(image.width);
                        obj.konvaBorder.height(image.height);
                        updatePropertiesPanel(obj);
                        saveState();
                        layer.batchDraw();
                    };
                };
                reader.readAsDataURL(file);
            });

            if (opacityInput) {
                opacityInput.addEventListener('input', (e) => {
                    obj.opacity = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                    obj.konvaGroup.opacity(obj.opacity / 100);
                    layer.batchDraw();
                });
                opacityInput.addEventListener('change', saveState);
            }

            if (scaleInput) {
                scaleInput.addEventListener('change', (e) => {
                    const newScale = parseFloat(e.target.value);
                    if (isNaN(newScale) || newScale <= 0) return;
                    obj.scale = newScale;
                    obj.konvaGroup.scale({ x: newScale, y: newScale });
                    saveState();
                    layer.batchDraw();
                });
            }

            if (lockInput) {
                lockInput.addEventListener('change', (e) => {
                    obj.locked = e.target.checked;
                    if (obj.konvaGroup) {
                        obj.konvaGroup.draggable(!obj.locked);
                        obj.konvaGroup.listening(!obj.locked);
                    }
                    if (obj.konvaHitArea) obj.konvaHitArea.listening(!obj.locked);
                    selectObject(obj);
                    saveState();
                });
            }
        }

        // --- OVERPASS ---
        if (obj.type === 'Overpass') {
            document.getElementById('swap-overpass-btn')?.addEventListener('click', () => {
                const currentTop = obj.topLinkId;
                obj.topLinkId = (currentTop === obj.linkId1) ? obj.linkId2 : obj.linkId1;
                applyOverpassOrder(obj);
                updateAllOverpasses();
                layer.batchDraw();
                updatePropertiesPanel(obj);
            });

            document.getElementById('btn-overpass-to-intersection')?.addEventListener('click', () => {
                const confirmMsg = (typeof I18N !== 'undefined' && I18N.t)
                    ? I18N.t("Convert this overpass into an intersection?")
                    : "Convert this overpass into an intersection?";
                if (confirm(confirmMsg)) {
                    const r = obj.konvaRect;
                    const padding = 5;
                    const polyPoints = [
                        { x: r.x() - padding, y: r.y() - padding },
                        { x: r.x() + r.width() + padding, y: r.y() - padding },
                        { x: r.x() + r.width() + padding, y: r.y() + r.height() + padding },
                        { x: r.x() - padding, y: r.y() + r.height() + padding }
                    ];
                    const originalMode = intersectionMode;
                    intersectionMode = 'point';
                    processManualIntersection(polyPoints);
                    intersectionMode = originalMode;
                    saveState();
                }
            });
        }

        // --- PUSHPIN ---
        if (obj.type === 'Pushpin') {
            document.getElementById('prop-pin-lat')?.addEventListener('change', (e) => {
                obj.lat = parseFloat(e.target.value) || 0;
                drawPushpin(obj);
                layer.batchDraw();
                saveState();
            });
            document.getElementById('prop-pin-lon')?.addEventListener('change', (e) => {
                obj.lon = parseFloat(e.target.value) || 0;
                drawPushpin(obj);
                layer.batchDraw();
                saveState();
            });
        }

        // --- PARKING LOT ---
        if (obj.type === 'ParkingLot') {
            document.getElementById('prop-pl-name')?.addEventListener('change', (e) => { obj.name = e.target.value; updatePropertiesPanel(obj); saveState(); });
            document.getElementById('prop-pl-car')?.addEventListener('change', (e) => { obj.carCapacity = parseInt(e.target.value) || 0; saveState(); });
            document.getElementById('prop-pl-moto')?.addEventListener('change', (e) => { obj.motoCapacity = parseInt(e.target.value) || 0; saveState(); });
            document.getElementById('prop-pl-attr')?.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) val = 0;
                val = Math.max(0, Math.min(100, val));
                e.target.value = val;
                obj.attractionProb = val;
                saveState();
            });
            document.getElementById('prop-pl-duration')?.addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 0;
                e.target.value = val;
                obj.stayDuration = val;
                saveState();
            });
        }

        // --- LAND USE ZONE ---
        if (obj.type === 'Zone') {
            const nameInput = document.getElementById('prop-zone-name');
            const typeSelect = document.getElementById('prop-zone-type');
            const bcrSlider = document.getElementById('prop-zone-bcr-slider');
            const bcrInput = document.getElementById('prop-zone-bcr');
            const farSlider = document.getElementById('prop-zone-far-slider');
            const farInput = document.getElementById('prop-zone-far');
            const autoCalcCheck = document.getElementById('prop-zone-autocalc');
            const popInput = document.getElementById('prop-zone-pop');
            const empInput = document.getElementById('prop-zone-emp');

            if (nameInput) {
                nameInput.addEventListener('input', (e) => {
                    obj.name = e.target.value;
                    updateZoneVisuals(obj, false);
                });
                nameInput.addEventListener('change', () => saveState());
            }

            if (typeSelect) {
                typeSelect.addEventListener('change', (e) => {
                    const newType = e.target.value;
                    obj.zoneType = newType;
                    const cfg = ZONE_CONFIGS[newType] || ZONE_CONFIGS['R1'];
                    obj.bcr = cfg.bcr;
                    obj.far = cfg.far;
                    obj.customPop = null;
                    obj.customEmp = null;
                    updateZoneVisuals(obj, false);
                    updatePropertiesPanel(obj);
                    saveState();
                });
            }

            const updateBcr = (newVal) => {
                const bcrVal = Math.max(5, Math.min(100, newVal));
                obj.bcr = bcrVal / 100;
                if (bcrSlider) bcrSlider.value = bcrVal;
                if (bcrInput) bcrInput.value = bcrVal;
                updateZoneVisuals(obj, false);
                updatePropertiesPanelDynamicValues(obj);
            };

            if (bcrSlider) {
                bcrSlider.addEventListener('input', (e) => updateBcr(parseInt(e.target.value, 10)));
                bcrSlider.addEventListener('change', () => saveState());
            }
            if (bcrInput) {
                bcrInput.addEventListener('change', (e) => {
                    updateBcr(parseInt(e.target.value, 10) || 50);
                    saveState();
                });
            }

            const updateFar = (newVal) => {
                const farVal = Math.max(10, Math.min(2500, newVal));
                obj.far = farVal / 100;
                if (farSlider) farSlider.value = farVal;
                if (farInput) farInput.value = farVal;
                updateZoneVisuals(obj, false);
                updatePropertiesPanelDynamicValues(obj);
            };

            if (farSlider) {
                farSlider.addEventListener('input', (e) => updateFar(parseInt(e.target.value, 10)));
                farSlider.addEventListener('change', () => saveState());
            }
            if (farInput) {
                farInput.addEventListener('change', (e) => {
                    updateFar(parseInt(e.target.value, 10) || 100);
                    saveState();
                });
            }

            if (autoCalcCheck) {
                autoCalcCheck.addEventListener('change', (e) => {
                    obj.autoCalculateTraffic = e.target.checked;
                    if (popInput) popInput.disabled = obj.autoCalculateTraffic;
                    if (empInput) empInput.disabled = obj.autoCalculateTraffic;
                    if (obj.autoCalculateTraffic) {
                        obj.customPop = null;
                        obj.customEmp = null;
                    }
                    updateZoneVisuals(obj, false);
                    updatePropertiesPanelDynamicValues(obj);
                    saveState();
                });
            }

            if (popInput) {
                popInput.addEventListener('change', (e) => {
                    const val = parseInt(e.target.value, 10);
                    obj.customPop = isNaN(val) ? null : Math.max(0, val);
                    updateZoneVisuals(obj, false);
                    updatePropertiesPanelDynamicValues(obj);
                    saveState();
                });
            }
            if (empInput) {
                empInput.addEventListener('change', (e) => {
                    const val = parseInt(e.target.value, 10);
                    obj.customEmp = isNaN(val) ? null : Math.max(0, val);
                    updateZoneVisuals(obj, false);
                    updatePropertiesPanelDynamicValues(obj);
                    saveState();
                });
            }

            document.getElementById('btn-zone-reset-defaults')?.addEventListener('click', () => {
                const cfg = ZONE_CONFIGS[obj.zoneType] || ZONE_CONFIGS['R1'];
                obj.bcr = cfg.bcr;
                obj.far = cfg.far;
                obj.customPop = null;
                obj.customEmp = null;
                obj.autoCalculateTraffic = true;
                updateZoneVisuals(obj, false);
                updatePropertiesPanel(obj);
                saveState();
            });

            document.getElementById('btn-zone-reproject-conn')?.addEventListener('click', () => {
                autoGenerateCentroidConnectors(obj);
                updateZoneVisuals(obj, false);
                updatePropertiesPanel(obj);
                saveState();
            });
        }

        // --- PARKING GATE ---
        if (obj.type === 'ParkingGate') {
            document.getElementById('prop-gate-type')?.addEventListener('change', (e) => {
                obj.gateType = e.target.value;
                updateGateVisual(obj);
                saveState();
            });
            document.getElementById('prop-gate-rotation')?.addEventListener('change', (e) => {
                const newRot = parseFloat(e.target.value);
                if (!isNaN(newRot)) {
                    obj.rotation = newRot;
                    obj.konvaGroup.rotation(newRot);
                    checkGateAssociation(obj);
                    layer.batchDraw();
                    saveState();
                }
            });
        }

        // --- ROAD MARKING ---
        if (obj.type === 'RoadMarking') {
            if (obj.markingType === 'channelization') {
                document.getElementById('prop-mark-color')?.addEventListener('change', (e) => {
                    obj.color = e.target.value;
                    const polygon = obj.konvaGroup.findOne('.marking-shape');
                    if (polygon) {
                        let sc = 'white', fc = 'rgba(255, 255, 255, 0.2)';
                        if (obj.color === 'yellow') { sc = '#facc15'; fc = 'rgba(250, 204, 21, 0.2)'; }
                        if (obj.color === 'green') { sc = '#22c55e'; fc = 'rgba(34, 197, 94, 0.6)'; }
                        polygon.stroke(sc);
                        polygon.fill(fc);
                    } else {
                        drawRoadMarking(obj);
                    }
                    layer.batchDraw();
                    saveState();
                });
            }

            document.getElementById('prop-mark-type')?.addEventListener('change', (e) => {
                obj.markingType = e.target.value;
                if (obj.markingType === 'crosswalk') {
                    if (!obj.length) obj.length = 3;
                } else if (obj.markingType === 'waiting_area' || obj.markingType === 'two_stage_box') {
                    if (!obj.length) obj.length = 5;
                    if (!obj.width) obj.width = 2.5;
                }
                drawRoadMarking(obj);
                layer.batchDraw();
                updatePropertiesPanel(obj);
                saveState();
            });

            document.getElementById('btn-auto-span')?.addEventListener('click', () => {
                const oppositeId = findOppositeLink(obj.linkId, obj.position);
                if (oppositeId) {
                    obj.spanToLinkId = oppositeId;
                    drawRoadMarking(obj);
                    layer.batchDraw();
                    updatePropertiesPanel(obj);
                    saveState();
                } else {
                    alert(I18N.t("No valid opposite link detected within 30m."));
                }
            });

            document.getElementById('btn-remove-span')?.addEventListener('click', () => {
                obj.spanToLinkId = null;
                drawRoadMarking(obj);
                layer.batchDraw();
                updatePropertiesPanel(obj);
                saveState();
            });

            document.getElementById('prop-mark-pos')?.addEventListener('change', e => {
                obj.position = parseFloat(e.target.value);
                drawRoadMarking(obj);
                layer.batchDraw();
                saveState();
            });

            document.getElementById('prop-mark-rot')?.addEventListener('change', e => {
                obj.rotation = parseFloat(e.target.value);
                obj.konvaGroup.rotation(obj.rotation);
                layer.batchDraw();
                saveState();
            });

            document.getElementById('prop-mark-len')?.addEventListener('change', e => {
                obj.length = parseFloat(e.target.value);
                drawRoadMarking(obj);
                layer.batchDraw();
                saveState();
            });

            document.getElementById('prop-mark-wid')?.addEventListener('change', e => {
                obj.width = parseFloat(e.target.value);
                drawRoadMarking(obj);
                layer.batchDraw();
                saveState();
            });

            document.querySelectorAll('.prop-mark-lane').forEach(cb => {
                cb.addEventListener('change', () => {
                    const idx = parseInt(cb.value);
                    if (cb.checked) {
                        if (!obj.laneIndices.includes(idx)) obj.laneIndices.push(idx);
                    } else {
                        obj.laneIndices = obj.laneIndices.filter(i => i !== idx);
                    }
                    drawRoadMarking(obj);
                    layer.batchDraw();
                    saveState();
                });
            });

            document.getElementById('prop-mark-isfree')?.addEventListener('change', (e) => {
                const isFree = e.target.checked;
                obj.isFree = isFree;

                if (isFree) {
                    const link = network.links[obj.linkId];
                    if (link) {
                        if (obj.markingType === 'crosswalk') {
                            let currentSpanWidth = getLinkTotalWidth(link);
                            if (obj.spanToLinkId && network.links[obj.spanToLinkId]) {
                                const targetLink = network.links[obj.spanToLinkId];
                                const { point: pt1 } = getPointAlongPolyline(link.waypoints, obj.position);
                                const { point: pt2 } = projectPointOnPolyline(pt1, targetLink.waypoints);
                                currentSpanWidth = vecLen(getVector(pt1, pt2)) + getLinkTotalWidth(link) / 2 + getLinkTotalWidth(targetLink) / 2;
                            }
                            obj.width = currentSpanWidth;
                        } else {
                            const selectedLanes = obj.laneIndices.sort((a, b) => a - b);
                            if (link.geometryType === 'lane-based' && link.strokes && link.strokes.length >= 2 && selectedLanes.length > 0) {
                                const { point } = getPointAlongPolyline(link.waypoints, obj.position);
                                const getStrokePointForWidth = (targetLink, strokeIdx, refPt) => {
                                    let stroke = targetLink.strokes[strokeIdx];
                                    if (!stroke) stroke = (strokeIdx <= 0) ? targetLink.strokes[0] : targetLink.strokes[targetLink.strokes.length - 1];
                                    let minDist = Infinity, bestPt = refPt;
                                    for (let i = 0; i < stroke.points.length - 1; i++) {
                                        const proj = projectPointOnSegment(refPt, stroke.points[i], stroke.points[i + 1]);
                                        const d = vecLen(getVector(refPt, proj));
                                        if (d < minDist) { minDist = d; bestPt = proj; }
                                    }
                                    return bestPt;
                                };
                                const minIdx = selectedLanes[0];
                                const maxIdx = selectedLanes[selectedLanes.length - 1];
                                const pLeft = getStrokePointForWidth(link, minIdx, point);
                                const pRight = getStrokePointForWidth(link, maxIdx + 1, point);
                                obj.width = vecLen(getVector(pLeft, pRight));
                            } else {
                                let totalW = 0;
                                selectedLanes.forEach(idx => { if (link.lanes[idx]) totalW += link.lanes[idx].width; });
                                obj.width = totalW || 2.5;
                            }
                        }

                        const { point, vec } = getPointAlongPolyline(link.waypoints, obj.position);
                        const backVec = scale(normalize(vec), -1);
                        const centerPos = add(point, scale(backVec, (obj.length || 3) / 2));

                        obj.x = centerPos.x;
                        obj.y = centerPos.y;
                        obj.rotation = Konva.Util.radToDeg(Math.atan2(vec.y, vec.x));
                        obj.konvaGroup.position({ x: obj.x, y: obj.y });
                        obj.konvaGroup.rotation(obj.rotation);
                    }
                }
                selectObject(obj);
                drawRoadMarking(obj);
                layer.batchDraw();
                updatePropertiesPanel(obj);
                saveState();
            });

            if (obj.markingType === 'crosswalk') {
                const markGsSel = document.getElementById('prop-mark-groupset-select');
                const sigSel = document.getElementById('prop-mark-signal-select');
                const sigTxt = document.getElementById('prop-mark-signal-text');

                if (markGsSel) {
                    markGsSel.addEventListener('change', (e) => {
                        const targetNodeId = e.target.dataset.nodeId;
                        const tfl = targetNodeId ? network.trafficLights[targetNodeId] : null;
                        if (tfl) {
                            setActiveTflGroupSet(tfl, e.target.value);
                            if (obj.signalGroupBySet && obj.signalGroupBySet[tfl.activeGroupSetId] !== undefined) {
                                obj.signalGroupId = obj.signalGroupBySet[tfl.activeGroupSetId] || null;
                            }
                            updatePropertiesPanel(obj);
                        }
                    });
                }

                const updateCrosswalkBinding = (val) => {
                    const cleanVal = val !== '' ? val : null;
                    obj.signalGroupId = cleanVal;
                    if (markGsSel && markGsSel.value) {
                        if (!obj.signalGroupBySet) obj.signalGroupBySet = {};
                        if (cleanVal) obj.signalGroupBySet[markGsSel.value] = cleanVal;
                        else delete obj.signalGroupBySet[markGsSel.value];
                    }
                    saveState();
                };

                if (sigSel) {
                    sigSel.addEventListener('change', (e) => {
                        const val = e.target.value;
                        if (sigTxt) sigTxt.value = val;
                        updateCrosswalkBinding(val);
                    });
                }
                if (sigTxt) {
                    sigTxt.addEventListener('change', (e) => {
                        const val = e.target.value;
                        if (sigSel) {
                            const opt = Array.from(sigSel.options).find(o => o.value === val);
                            sigSel.value = opt ? opt.value : '';
                        }
                        updateCrosswalkBinding(val);
                    });
                }
            }
        }
    }
    //N*M
    function old_showLaneRangeSelector(sourceLink, destLink, position, existingGroup = null) {
        const modal = document.getElementById('lane-range-modal');
        const modalContent = document.getElementById('lane-range-modal-content');
        const title = document.getElementById('lr-modal-title');

        const sourceStartInput = document.getElementById('lr-source-start');
        const sourceCountInput = document.getElementById('lr-source-count');
        const destStartInput = document.getElementById('lr-dest-start');
        const destCountInput = document.getElementById('lr-dest-count');
        const confirmBtn = document.getElementById('lr-confirm-btn');
        const cancelBtn = document.getElementById('lr-cancel-btn');

        const isEditing = existingGroup !== null;
        title.textContent = isEditing ? `Edit Connection: ${sourceLink.id} to ${destLink.id}` : `Connect ${sourceLink.id} to ${destLink.id}`;
        confirmBtn.textContent = isEditing ? 'Update' : 'Connect';

        // Set max values based on number of lanes
        sourceStartInput.max = sourceLink.numLanes - 1;
        sourceCountInput.max = sourceLink.numLanes;

        destStartInput.max = destLink.numLanes - 1;
        destCountInput.max = destLink.numLanes;

        if (isEditing) {
            const sourceLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.sourceLaneIndex).filter(i => i !== undefined));
            const destLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.destLaneIndex).filter(i => i !== undefined));

            sourceStartInput.value = Math.min(...sourceLaneIndices);
            sourceCountInput.value = sourceLaneIndices.size;
            destStartInput.value = Math.min(...destLaneIndices);
            destCountInput.value = destLaneIndices.size;
        } else {
            // Default to connecting all lanes
            sourceStartInput.value = 0;
            sourceCountInput.value = sourceLink.numLanes;
            destStartInput.value = 0;
            destCountInput.value = destLink.numLanes;
        }

        // Position the modal
        if (isEditing) {
            // Center the modal if editing
            modalContent.style.left = `calc(50% - 160px)`;
            modalContent.style.top = `calc(50% - 200px)`;
        } else {
            // Position near the cursor if creating
            modalContent.style.left = `${position.x + 15}px`;
            modalContent.style.top = `${position.y - 30}px`;
        }
        modal.style.display = 'block';

        const closeAndCleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = closeAndCleanup;

        confirmBtn.onclick = () => {
            const sourceStart = parseInt(sourceStartInput.value, 10);
            const sourceCount = parseInt(sourceCountInput.value, 10);
            const destStart = parseInt(destStartInput.value, 10);
            const destCount = parseInt(destCountInput.value, 10);

            // Validation
            if (sourceStart < 0 || sourceCount < 1 || (sourceStart + sourceCount) > sourceLink.numLanes) {
                alert(`Invalid source lane range.`); return;
            }
            if (destStart < 0 || destCount < 1 || (destStart + destCount) > destLink.numLanes) {
                alert(`Invalid destination lane range.`); return;
            }

            if (isEditing) {
                deleteConnectionGroup(existingGroup);
            }

            const newConnectionIds = [];
            let commonNodeId = null;

            // Create connections for the specified ranges
            for (let i = sourceStart; i < sourceStart + sourceCount; i++) {
                for (let j = destStart; j < destStart + destCount; j++) {
                    const specificSourceMeta = { linkId: sourceLink.id, laneIndex: i, portType: 'end' };
                    const specificDestMeta = { linkId: destLink.id, laneIndex: j, portType: 'start' };
                    const newConn = handleConnection(specificSourceMeta, specificDestMeta);
                    if (newConn) {
                        newConn.konvaBezier.visible(false); // Hide individual beziers
                        newConnectionIds.push(newConn.id);
                        if (!commonNodeId) commonNodeId = newConn.nodeId; // Grab the node ID
                    }
                }
            }

            if (newConnectionIds.length > 0) {
                const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1];
                const p4 = destLink.waypoints[0];
                const groupLine = new Konva.Line({
                    points: [p1.x, p1.y, p4.x, p4.y],
                    stroke: 'darkgreen', strokeWidth: 3, hitStrokeWidth: 15,
                    name: 'group-connection-visual', listening: true,
                });
                const newMeta = {
                    type: 'ConnectionGroup', connectionIds: newConnectionIds,
                    nodeId: commonNodeId, sourceLinkId: sourceLink.id, destLinkId: destLink.id
                };
                groupLine.setAttr('meta', newMeta);
                layer.add(groupLine);
                groupLine.moveToTop();
                if (network.nodes[commonNodeId]) {
                    network.nodes[commonNodeId].konvaShape.moveToBottom();
                }

                const newGroupObject = {
                    id: `group_${newMeta.sourceLinkId}_to_${newMeta.destLinkId}`,
                    ...newMeta,
                    konvaLine: groupLine,
                };
                selectObject(newGroupObject);
            } else if (isEditing) {
                // If editing resulted in no connections, just deselect
                deselectAll();
            }

            layer.batchDraw();
            closeAndCleanup();
        };
    }

    //直行且會沒分配
    function old2_showLaneRangeSelector(sourceLink, destLink, position, existingGroup = null) {
        const modal = document.getElementById('lane-range-modal');
        const modalContent = document.getElementById('lane-range-modal-content');
        const title = document.getElementById('lr-modal-title');

        const sourceStartInput = document.getElementById('lr-source-start');
        const sourceCountInput = document.getElementById('lr-source-count');
        const destStartInput = document.getElementById('lr-dest-start');
        const destCountInput = document.getElementById('lr-dest-count');
        const confirmBtn = document.getElementById('lr-confirm-btn');
        const cancelBtn = document.getElementById('lr-cancel-btn');

        const isEditing = existingGroup !== null;
        title.textContent = isEditing ? `Edit Connection: ${sourceLink.id} to ${destLink.id}` : `Connect ${sourceLink.id} to ${destLink.id}`;
        confirmBtn.textContent = isEditing ? 'Update' : 'Connect';

        // Set max values based on number of lanes
        sourceStartInput.max = sourceLink.numLanes - 1;
        sourceCountInput.max = sourceLink.numLanes;

        destStartInput.max = destLink.numLanes - 1;
        destCountInput.max = destLink.numLanes;

        if (isEditing) {
            const sourceLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.sourceLaneIndex).filter(i => i !== undefined));
            const destLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.destLaneIndex).filter(i => i !== undefined));

            sourceStartInput.value = Math.min(...sourceLaneIndices);
            sourceCountInput.value = sourceLaneIndices.size;
            destStartInput.value = Math.min(...destLaneIndices);
            destCountInput.value = destLaneIndices.size;
        } else {
            // Default to connecting all lanes
            sourceStartInput.value = 0;
            sourceCountInput.value = sourceLink.numLanes;
            destStartInput.value = 0;
            destCountInput.value = destLink.numLanes;
        }

        // Position the modal
        if (isEditing) {
            // Center the modal if editing
            modalContent.style.left = `calc(50% - 160px)`;
            modalContent.style.top = `calc(50% - 200px)`;
        } else {
            // Position near the cursor if creating
            modalContent.style.left = `${position.x + 15}px`;
            modalContent.style.top = `${position.y - 30}px`;
        }
        modal.style.display = 'block';

        const closeAndCleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = closeAndCleanup;

        confirmBtn.onclick = () => {
            const sourceStart = parseInt(sourceStartInput.value, 10);
            const sourceCount = parseInt(sourceCountInput.value, 10);
            const destStart = parseInt(destStartInput.value, 10);
            const destCount = parseInt(destCountInput.value, 10);

            // Validation
            if (sourceStart < 0 || sourceCount < 1 || (sourceStart + sourceCount) > sourceLink.numLanes) {
                alert(`Invalid source lane range.`); return;
            }
            if (destStart < 0 || destCount < 1 || (destStart + destCount) > destLink.numLanes) {
                alert(`Invalid destination lane range.`); return;
            }

            if (isEditing) {
                deleteConnectionGroup(existingGroup);
            }

            const newConnectionIds = [];
            let commonNodeId = null;

            // --- START OF MODIFICATION ---
            // 核心改動：將 N*M 的巢狀迴圈改為一對一連接的單一迴圈。
            // 我們只連接 min(sourceCount, destCount) 條車道，以實現直行優先。
            const lanesToConnect = Math.min(sourceCount, destCount);

            for (let i = 0; i < lanesToConnect; i++) {
                const sourceLaneIndex = sourceStart + i;
                const destLaneIndex = destStart + i;

                // 檢查計算出的索引是否仍在合法範圍內
                if (sourceLaneIndex >= sourceLink.numLanes || destLaneIndex >= destLink.numLanes) {
                    continue; // 安全性檢查，雖然理論上不應發生
                }

                const specificSourceMeta = { linkId: sourceLink.id, laneIndex: sourceLaneIndex, portType: 'end' };
                const specificDestMeta = { linkId: destLink.id, laneIndex: destLaneIndex, portType: 'start' };
                const newConn = handleConnection(specificSourceMeta, specificDestMeta);

                if (newConn) {
                    newConn.konvaBezier.visible(false); // Hide individual beziers
                    newConnectionIds.push(newConn.id);
                    if (!commonNodeId) commonNodeId = newConn.nodeId; // Grab the node ID
                }
            }
            // --- END OF MODIFICATION ---

            if (newConnectionIds.length > 0) {
                const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1];
                const p4 = destLink.waypoints[0];
                const groupLine = new Konva.Line({
                    points: [p1.x, p1.y, p4.x, p4.y],
                    stroke: 'darkgreen', strokeWidth: 3, hitStrokeWidth: 15,
                    name: 'group-connection-visual', listening: true,
                });
                const newMeta = {
                    type: 'ConnectionGroup', connectionIds: newConnectionIds,
                    nodeId: commonNodeId, sourceLinkId: sourceLink.id, destLinkId: destLink.id
                };
                groupLine.setAttr('meta', newMeta);
                layer.add(groupLine);
                groupLine.moveToTop();
                if (network.nodes[commonNodeId]) {
                    network.nodes[commonNodeId].konvaShape.moveToBottom();
                }

                const newGroupObject = {
                    id: `group_${newMeta.sourceLinkId}_to_${newMeta.destLinkId}`,
                    ...newMeta,
                    konvaLine: groupLine,
                };
                selectObject(newGroupObject);
            } else if (isEditing) {
                // If editing resulted in no connections, just deselect
                deselectAll();
            }

            layer.batchDraw();
            closeAndCleanup();
        };
    }

    //平均策略
    function old2_1_showLaneRangeSelector(sourceLink, destLink, position, existingGroup = null) {
        const modal = document.getElementById('lane-range-modal');
        const modalContent = document.getElementById('lane-range-modal-content');
        const title = document.getElementById('lr-modal-title');

        const sourceStartInput = document.getElementById('lr-source-start');
        const sourceCountInput = document.getElementById('lr-source-count');
        const destStartInput = document.getElementById('lr-dest-start');
        const destCountInput = document.getElementById('lr-dest-count');
        const confirmBtn = document.getElementById('lr-confirm-btn');
        const cancelBtn = document.getElementById('lr-cancel-btn');

        const isEditing = existingGroup !== null;
        title.textContent = isEditing ? `Edit Connection: ${sourceLink.id} to ${destLink.id}` : `Connect ${sourceLink.id} to ${destLink.id}`;
        confirmBtn.textContent = isEditing ? 'Update' : 'Connect';

        // Set max values based on number of lanes
        sourceStartInput.max = sourceLink.numLanes - 1;
        sourceCountInput.max = sourceLink.numLanes;

        destStartInput.max = destLink.numLanes - 1;
        destCountInput.max = destLink.numLanes;

        if (isEditing) {
            const sourceLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.sourceLaneIndex).filter(i => i !== undefined));
            const destLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.destLaneIndex).filter(i => i !== undefined));

            sourceStartInput.value = Math.min(...sourceLaneIndices);
            sourceCountInput.value = sourceLaneIndices.size;
            destStartInput.value = Math.min(...destLaneIndices);
            destCountInput.value = destLaneIndices.size;
        } else {
            // Default to connecting all lanes
            sourceStartInput.value = 0;
            sourceCountInput.value = sourceLink.numLanes;
            destStartInput.value = 0;
            destCountInput.value = destLink.numLanes;
        }

        // Position the modal
        if (isEditing) {
            // Center the modal if editing
            modalContent.style.left = `calc(50% - 160px)`;
            modalContent.style.top = `calc(50% - 200px)`;
        } else {
            // Position near the cursor if creating
            modalContent.style.left = `${position.x + 15}px`;
            modalContent.style.top = `${position.y - 30}px`;
        }
        modal.style.display = 'block';

        const closeAndCleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = closeAndCleanup;

        confirmBtn.onclick = () => {
            const sourceStart = parseInt(sourceStartInput.value, 10);
            const sourceCount = parseInt(sourceCountInput.value, 10);
            const destStart = parseInt(destStartInput.value, 10);
            const destCount = parseInt(destCountInput.value, 10);

            // Validation
            if (sourceStart < 0 || sourceCount < 1 || (sourceStart + sourceCount) > sourceLink.numLanes) {
                alert(`Invalid source lane range.`); return;
            }
            if (destStart < 0 || destCount < 1 || (destStart + destCount) > destLink.numLanes) {
                alert(`Invalid destination lane range.`); return;
            }

            if (isEditing) {
                deleteConnectionGroup(existingGroup);
            }

            const newConnectionIds = [];
            let commonNodeId = null;

            // --- START OF max(N, M) UNIFORM DISTRIBUTION STRATEGY ---
            const sourceIsSmaller = sourceCount < destCount;
            const smallerCount = Math.min(sourceCount, destCount);
            const largerCount = Math.max(sourceCount, destCount);

            // 如果 smallerCount 是 0，則無法進行任何連接
            if (smallerCount === 0) {
                // 如果是編輯模式且沒有連接，則取消選取
                if (isEditing) {
                    deselectAll();
                }
                layer.batchDraw();
                closeAndCleanup();
                return;
            }

            // 計算每條 "較少車道" 基礎上需要負責多少條 "較多車道" 的連接
            const baseConnsPerLane = Math.floor(largerCount / smallerCount);
            // 計算餘數，這些餘數需要從頭開始，逐一分配給前面的車道
            let remainder = largerCount % smallerCount;

            let largerLaneTracker = 0; // 用於追蹤 "較多車道" 的當前索引

            // 遍歷所有 "較少車道"
            for (let i = 0; i < smallerCount; i++) {
                // 決定當前這條 "較少車道" 總共需要建立幾條連接
                let numConnsForThisLane = baseConnsPerLane;
                if (remainder > 0) {
                    numConnsForThisLane++;
                    remainder--;
                }

                // 為當前這條 "較少車道" 建立所需的連接
                for (let j = 0; j < numConnsForThisLane; j++) {
                    let sourceLaneIndex, destLaneIndex;

                    if (sourceIsSmaller) {
                        // 情況1: 來源車道較少 (分流)
                        // 來源車道索引固定為 i
                        // 目標車道索引遞增
                        sourceLaneIndex = sourceStart + i;
                        destLaneIndex = destStart + largerLaneTracker;
                    } else {
                        // 情況2: 目標車道較少 (匯流)
                        // 來源車道索引遞增
                        // 目標車道索引固定為 i
                        sourceLaneIndex = sourceStart + largerLaneTracker;
                        destLaneIndex = destStart + i;
                    }

                    // 建立連接
                    const newConn = handleConnection(
                        { linkId: sourceLink.id, laneIndex: sourceLaneIndex, portType: 'end' },
                        { linkId: destLink.id, laneIndex: destLaneIndex, portType: 'start' }
                    );

                    if (newConn) {
                        newConn.konvaBezier.visible(false); // 隱藏單獨的連接線
                        newConnectionIds.push(newConn.id);
                        if (!commonNodeId) commonNodeId = newConn.nodeId; // 記下共用的節點ID
                    }

                    // 無論是分流還是匯流，"較多車道" 的追蹤器都需要遞增
                    largerLaneTracker++;
                }
            }
            // --- END OF STRATEGY ---

            if (newConnectionIds.length > 0) {
                const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1];
                const p4 = destLink.waypoints[0];
                const groupLine = new Konva.Line({
                    points: [p1.x, p1.y, p4.x, p4.y],
                    stroke: 'darkgreen', strokeWidth: 3, hitStrokeWidth: 15,
                    name: 'group-connection-visual', listening: true,
                });
                const newMeta = {
                    type: 'ConnectionGroup', connectionIds: newConnectionIds,
                    nodeId: commonNodeId, sourceLinkId: sourceLink.id, destLinkId: destLink.id
                };
                groupLine.setAttr('meta', newMeta);
                layer.add(groupLine);
                groupLine.moveToTop();
                if (network.nodes[commonNodeId]) {
                    network.nodes[commonNodeId].konvaShape.moveToBottom();
                }

                const newGroupObject = {
                    id: `group_${newMeta.sourceLinkId}_to_${newMeta.destLinkId}`,
                    ...newMeta,
                    konvaLine: groupLine,
                };
                selectObject(newGroupObject);
            } else if (isEditing) {
                // 如果編輯後沒有任何連接（例如車道數設為0），則取消選取
                deselectAll();
            }

            layer.batchDraw();
            closeAndCleanup();
        };
    }

    // --- START OF COMPLETE REPLACEMENT for showLaneRangeSelector ---
    function showLaneRangeSelector(sourceLink, destLink, position, existingGroup = null) {
        const modal = document.getElementById('lane-range-modal');
        const modalContent = document.getElementById('lane-range-modal-content');
        const title = document.getElementById('lr-modal-title');

        const sourceStartInput = document.getElementById('lr-source-start');
        const sourceCountInput = document.getElementById('lr-source-count');
        const destStartInput = document.getElementById('lr-dest-start');
        const destCountInput = document.getElementById('lr-dest-count');
        const confirmBtn = document.getElementById('lr-confirm-btn');
        const cancelBtn = document.getElementById('lr-cancel-btn');

        const isEditing = existingGroup !== null;
        title.textContent = isEditing ? `Edit Connection: ${sourceLink.id} to ${destLink.id}` : `Connect ${sourceLink.id} to ${destLink.id}`;
        confirmBtn.textContent = isEditing ? 'Update' : 'Connect';

        sourceStartInput.max = sourceLink.lanes.length > 0 ? sourceLink.lanes.length - 1 : 0;
        sourceCountInput.max = sourceLink.lanes.length;

        destStartInput.max = destLink.lanes.length > 0 ? destLink.lanes.length - 1 : 0;
        destCountInput.max = destLink.lanes.length;

        if (isEditing) {
            const sourceLaneIndices = new Set();
            const destLaneIndices = new Set();
            existingGroup.connectionIds.forEach(id => {
                const conn = network.connections[id];
                if (conn) {
                    sourceLaneIndices.add(conn.sourceLaneIndex);
                    destLaneIndices.add(conn.destLaneIndex);
                }
            });

            sourceStartInput.value = sourceLaneIndices.size > 0 ? Math.min(...sourceLaneIndices) : 0;
            sourceCountInput.value = sourceLaneIndices.size;
            destStartInput.value = destLaneIndices.size > 0 ? Math.min(...destLaneIndices) : 0;
            destCountInput.value = destLaneIndices.size;
        } else {
            sourceStartInput.value = 0;
            sourceCountInput.value = sourceLink.lanes.length;
            destStartInput.value = 0;
            destCountInput.value = destLink.lanes.length;
        }

        if (isEditing) {
            modalContent.style.left = `calc(50% - 160px)`;
            modalContent.style.top = `calc(50% - 200px)`;
        } else {
            modalContent.style.left = `${position.x + 15}px`;
            modalContent.style.top = `${position.y - 30}px`;
        }
        modal.style.display = 'block';
        I18N.translateDOM(modal);

        const closeAndCleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = closeAndCleanup;

        confirmBtn.onclick = () => {
            const sourceStart = parseInt(sourceStartInput.value, 10);
            const sourceCount = parseInt(sourceCountInput.value, 10);
            const destStart = parseInt(destStartInput.value, 10);
            const destCount = parseInt(destCountInput.value, 10);

            if (isNaN(sourceStart) || isNaN(sourceCount) || sourceStart < 0 || sourceCount < 0 || (sourceStart + sourceCount) > sourceLink.lanes.length) {
                alert(`Invalid source lane range.`); return;
            }
            if (isNaN(destStart) || isNaN(destCount) || destStart < 0 || destCount < 0 || (destStart + destCount) > destLink.lanes.length) {
                alert(`Invalid destination lane range.`); return;
            }

            if (isEditing) {
                deleteConnectionGroup(existingGroup);
            }

            if (sourceCount === 0 || destCount === 0) {
                deselectAll();
                layer.batchDraw();
                closeAndCleanup();
                return;
            }

            const newConnectionIds = [];
            let commonNodeId = null;

            const connectLanes = (srcIdx, dstIdx) => {
                const newConn = handleConnection(
                    { linkId: sourceLink.id, laneIndex: srcIdx, portType: 'end' },
                    { linkId: destLink.id, laneIndex: dstIdx, portType: 'start' }
                );
                if (newConn) {
                    newConn.konvaBezier.visible(false);
                    newConnectionIds.push(newConn.id);
                    if (!commonNodeId) commonNodeId = newConn.nodeId;
                }
            };

            const lanesToConnectOneToOne = Math.min(sourceCount, destCount);

            for (let i = 0; i < lanesToConnectOneToOne; i++) {
                connectLanes(sourceStart + i, destStart + i);
            }

            if (sourceCount > destCount) {
                const lastDestLaneIndex = destStart + lanesToConnectOneToOne - 1;
                for (let i = lanesToConnectOneToOne; i < sourceCount; i++) {
                    connectLanes(sourceStart + i, lastDestLaneIndex);
                }
            } else if (destCount > sourceCount) {
                const lastSourceLaneIndex = sourceStart + lanesToConnectOneToOne - 1;
                for (let i = lanesToConnectOneToOne; i < destCount; i++) {
                    connectLanes(lastSourceLaneIndex, destStart + i);
                }
            }

            if (newConnectionIds.length > 0) {
                // 直接呼叫新版繪圖函數
                drawConnectionGroupVisual(sourceLink, destLink, newConnectionIds, commonNodeId);

                // 為了讓屬性面板選取生效，我們從 layer 中把剛建好的物件抓出來
                const groupShape = layer.find('.group-connection-visual').find(shape => {
                    const meta = shape.getAttr('meta');
                    return meta && meta.sourceLinkId === sourceLink.id && meta.destLinkId === destLink.id;
                });

                if (groupShape) {
                    const newMeta = groupShape.getAttr('meta');
                    const newGroupObject = {
                        id: `group_${newMeta.sourceLinkId}_to_${newMeta.destLinkId}`,
                        ...newMeta,
                        konvaLine: groupShape,
                    };
                    selectObject(newGroupObject);
                }
            } else if (isEditing) {
                deselectAll();
            }

            layer.batchDraw();
            closeAndCleanup();
        };
    }
    // --- END OF COMPLETE REPLACEMENT for showLaneRangeSelector ---	
    //混合策略
    function old5_showLaneRangeSelector(sourceLink, destLink, position, existingGroup = null) {
        const modal = document.getElementById('lane-range-modal');
        const modalContent = document.getElementById('lane-range-modal-content');
        const title = document.getElementById('lr-modal-title');

        const sourceStartInput = document.getElementById('lr-source-start');
        const sourceCountInput = document.getElementById('lr-source-count');
        const destStartInput = document.getElementById('lr-dest-start');
        const destCountInput = document.getElementById('lr-dest-count');
        const confirmBtn = document.getElementById('lr-confirm-btn');
        const cancelBtn = document.getElementById('lr-cancel-btn');

        const isEditing = existingGroup !== null;
        title.textContent = isEditing ? `Edit Connection: ${sourceLink.id} to ${destLink.id}` : `Connect ${sourceLink.id} to ${destLink.id}`;
        confirmBtn.textContent = isEditing ? 'Update' : 'Connect';

        // Set max values based on number of lanes
        sourceStartInput.max = sourceLink.numLanes - 1;
        sourceCountInput.max = sourceLink.numLanes;

        destStartInput.max = destLink.numLanes - 1;
        destCountInput.max = destLink.numLanes;

        if (isEditing) {
            const sourceLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.sourceLaneIndex).filter(i => i !== undefined));
            const destLaneIndices = new Set(existingGroup.connectionIds.map(id => network.connections[id]?.destLaneIndex).filter(i => i !== undefined));

            sourceStartInput.value = Math.min(...sourceLaneIndices);
            sourceCountInput.value = sourceLaneIndices.size;
            destStartInput.value = Math.min(...destLaneIndices);
            destCountInput.value = destLaneIndices.size;
        } else {
            // Default to connecting all lanes
            sourceStartInput.value = 0;
            sourceCountInput.value = sourceLink.numLanes;
            destStartInput.value = 0;
            destCountInput.value = destLink.numLanes;
        }

        // Position the modal
        if (isEditing) {
            // Center the modal if editing
            modalContent.style.left = `calc(50% - 160px)`;
            modalContent.style.top = `calc(50% - 200px)`;
        } else {
            // Position near the cursor if creating
            modalContent.style.left = `${position.x + 15}px`;
            modalContent.style.top = `${position.y - 30}px`;
        }
        modal.style.display = 'block';

        const closeAndCleanup = () => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        cancelBtn.onclick = closeAndCleanup;

        confirmBtn.onclick = () => {
            const sourceStart = parseInt(sourceStartInput.value, 10);
            const sourceCount = parseInt(sourceCountInput.value, 10);
            const destStart = parseInt(destStartInput.value, 10);
            const destCount = parseInt(destCountInput.value, 10);

            // Validation
            if (sourceStart < 0 || sourceCount < 1 || (sourceStart + sourceCount) > sourceLink.numLanes) {
                alert(`Invalid source lane range.`); return;
            }
            if (destStart < 0 || destCount < 1 || (destStart + destCount) > destLink.numLanes) {
                alert(`Invalid destination lane range.`); return;
            }

            if (isEditing) {
                deleteConnectionGroup(existingGroup);
            }

            const newConnectionIds = [];
            let commonNodeId = null;

            // 輔助函數，用於建立單條連接並處理相關邏輯
            const connectLanes = (srcIdx, dstIdx) => {
                const newConn = handleConnection(
                    { linkId: sourceLink.id, laneIndex: srcIdx, portType: 'end' },
                    { linkId: destLink.id, laneIndex: dstIdx, portType: 'start' }
                );
                if (newConn) {
                    newConn.konvaBezier.visible(false);
                    newConnectionIds.push(newConn.id);
                    if (!commonNodeId) commonNodeId = newConn.nodeId;
                }
            };

            // --- START OF HYBRID STRATEGY ---
            const lanesToConnectOneToOne = Math.min(sourceCount, destCount);

            // 步驟 1: 優先進行一對一的直行連接
            for (let i = 0; i < lanesToConnectOneToOne; i++) {
                connectLanes(sourceStart + i, destStart + i);
            }

            // 步驟 2: 處理剩餘的車道
            if (sourceCount > destCount) {
                // 情況 1: 來源車道較多 (匯流)
                // 找到最後一條被連接的目標車道索引
                const lastDestLaneIndex = destStart + lanesToConnectOneToOne - 1;
                // 遍歷所有多出來的來源車道
                for (let i = lanesToConnectOneToOne; i < sourceCount; i++) {
                    // 將剩餘的來源車道全部連接到最後一條目標車道
                    connectLanes(sourceStart + i, lastDestLaneIndex);
                }
            } else if (destCount > sourceCount) {
                // 情況 2: 目標車道較多 (分流)
                // 找到最後一條被連接的來源車道索引
                const lastSourceLaneIndex = sourceStart + lanesToConnectOneToOne - 1;
                // 遍歷所有多出來的目標車道
                for (let i = lanesToConnectOneToOne; i < destCount; i++) {
                    // 從最後一條來源車道分流出去，連接到所有剩餘的目標車道
                    connectLanes(lastSourceLaneIndex, destStart + i);
                }
            }
            // --- END OF HYBRID STRATEGY ---

            if (newConnectionIds.length > 0) {
                const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1];
                const p4 = destLink.waypoints[0];
                const groupLine = new Konva.Line({
                    points: [p1.x, p1.y, p4.x, p4.y],
                    stroke: 'darkgreen', strokeWidth: 3, hitStrokeWidth: 15,
                    name: 'group-connection-visual', listening: true,
                });
                const newMeta = {
                    type: 'ConnectionGroup', connectionIds: newConnectionIds,
                    nodeId: commonNodeId, sourceLinkId: sourceLink.id, destLinkId: destLink.id
                };
                groupLine.setAttr('meta', newMeta);
                layer.add(groupLine);
                groupLine.moveToTop();
                if (network.nodes[commonNodeId]) {
                    network.nodes[commonNodeId].konvaShape.moveToBottom();
                }

                const newGroupObject = {
                    id: `group_${newMeta.sourceLinkId}_to_${newMeta.destLinkId}`,
                    ...newMeta,
                    konvaLine: groupLine,
                };
                selectObject(newGroupObject);
            } else if (isEditing) {
                // 如果編輯後沒有任何連接（例如車道數設為0），則取消選取
                deselectAll();
            }

            layer.batchDraw();
            closeAndCleanup();
        };
    }

    function initModals() {
        document.querySelectorAll('.modal .close-button').forEach(btn => { btn.addEventListener('click', () => { btn.closest('.modal').style.display = 'none'; }); });
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
        document.querySelectorAll('.tabs .tab-link').forEach(button => {
            button.addEventListener('click', () => {
                const modalBody = button.closest('.modal-body');
                const tabId = button.dataset.tab;

                modalBody.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active'));
                modalBody.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

                button.classList.add('active');
                modalBody.querySelector(`#${tabId}`).classList.add('active');
            });
        });
    }

    // --- Traffic Light Editor ---
    let currentModalNode = null;

    let currentTflPlanId = null;
    let currentTflScheduleId = null; // 記錄目前編輯的時制 ID
    let currentTflGroupSetId = null; // ★ 新增：記錄目前編輯的號誌群組(硬體群組) ID

    // ★ 確保路口具備多套號誌群組 (硬體群組庫 signalGroupSets) 結構並維持向下相容
    function ensureTflGroupSets(tflData) {
        if (!tflData) return;
        if (!tflData.signalGroups) tflData.signalGroups = {};
        if (!tflData.signalGroupSets || Object.keys(tflData.signalGroupSets).length === 0) {
            tflData.signalGroupSets = {
                'GroupSet_1': {
                    id: 'GroupSet_1',
                    name: '預設硬體群組 (A)',
                    groups: tflData.signalGroups
                }
            };
        }
        if (!tflData.activeGroupSetId || !tflData.signalGroupSets[tflData.activeGroupSetId]) {
            tflData.activeGroupSetId = Object.keys(tflData.signalGroupSets)[0];
        }
        tflData.signalGroups = tflData.signalGroupSets[tflData.activeGroupSetId].groups;

        if (tflData.advanced && tflData.advanced.schedules) {
            const defaultGsId = Object.keys(tflData.signalGroupSets)[0];
            Object.values(tflData.advanced.schedules).forEach(sched => {
                if (!sched.groupSetId || !tflData.signalGroupSets[sched.groupSetId]) {
                    sched.groupSetId = defaultGsId;
                }
            });
        }
    }

    function setActiveTflGroupSet(tflData, groupSetId) {
        ensureTflGroupSets(tflData);
        if (tflData.signalGroupSets[groupSetId]) {
            tflData.activeGroupSetId = groupSetId;
            tflData.signalGroups = tflData.signalGroupSets[groupSetId].groups;
        }
    }

    function alignPhasesToGroupSet(phases, groupsObj) {
        if (!Array.isArray(phases) || !groupsObj) return;
        phases.forEach(p => {
            if (!p.signals) p.signals = {};
            const dur = p.duration || 30;
            Object.values(groupsObj).forEach(g => {
                if (g.type === 'pedestrian') {
                    if (!p.signals[g.id] || typeof p.signals[g.id] !== 'object') {
                        if (p.signals[g.id] === 'Green') {
                            p.signals[g.id] = { walk: dur, flash: 0, stop: 0 };
                        } else {
                            const f = dur >= 10 ? 7 : 0;
                            const s = dur >= 10 ? 3 : dur;
                            p.signals[g.id] = { walk: Math.max(0, dur - f - s), flash: f, stop: s };
                        }
                    }
                } else {
                    if (!p.signals[g.id] || typeof p.signals[g.id] !== 'string') {
                        p.signals[g.id] = 'Red';
                    }
                }
            });
            Object.keys(p.signals).forEach(k => {
                if (!groupsObj[k]) delete p.signals[k];
            });
        });
    }

    // ★ 確保指定的硬體群組底下至少有一個時制 (提供 Tab 2 依硬體群組階層管理時制)
    function ensureScheduleForGroupSet(tflData, groupSetId) {
        if (!tflData || !tflData.advanced || !tflData.advanced.schedules || !groupSetId) return null;
        const existing = Object.values(tflData.advanced.schedules).filter(s => s.groupSetId === groupSetId);
        if (existing.length > 0) return existing[0].id;

        let newNum = 1;
        while (tflData.advanced.schedules[`Sched_${newNum}`]) newNum++;
        const newId = `Sched_${newNum}`;
        const gsObj = tflData.signalGroupSets ? tflData.signalGroupSets[groupSetId] : null;
        const dur = 30;
        const signals = {};
        if (gsObj && gsObj.groups) {
            Object.values(gsObj.groups).forEach(g => {
                signals[g.id] = (g.type === 'pedestrian')
                    ? { walk: dur - 10, flash: 7, stop: 3 }
                    : 'Red';
            });
        }
        tflData.advanced.schedules[newId] = {
            id: newId,
            name: `預設時制 (${newNum})`,
            groupSetId: groupSetId,
            timeShift: 0,
            phases: [{ duration: dur, signals }]
        };
        return newId;
    }

    // ★ 通用膠囊分頁列渲染函式 (支援點擊切換、✏️原地改名、🗑️刪除、+新增)
    function renderTflPillBar(containerEl, config) {
        if (!containerEl) return;
        containerEl.innerHTML = '';

        if (config.labelHtml) {
            const labelSpan = document.createElement('span');
            labelSpan.className = 'tfl-pill-bar-label';
            labelSpan.innerHTML = config.labelHtml;
            containerEl.appendChild(labelSpan);
        }

        (config.items || []).forEach(item => {
            const isActive = item.id === config.activeId;
            const pill = document.createElement('div');
            pill.className = 'tfl-pill' + (config.pillClass ? ' ' + config.pillClass : '') + (isActive ? ' active' : '');
            pill.title = config.onRename && isActive ? '雙擊或點選 ✏️ 修改名稱' : item.name;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tfl-pill-name';
            nameSpan.textContent = item.name;
            pill.appendChild(nameSpan);

            if (item.subText) {
                const subSpan = document.createElement('span');
                subSpan.className = 'tfl-pill-sub';
                subSpan.textContent = `(${item.subText})`;
                pill.appendChild(subSpan);
            }

            const startInlineRename = (e) => {
                if (e) e.stopPropagation();
                if (!config.onRename) return;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'tfl-pill-inline-input';
                input.value = item.name;
                let finished = false;

                const commit = () => {
                    if (finished) return;
                    finished = true;
                    const trimmed = input.value.trim();
                    if (trimmed && trimmed !== item.name) {
                        config.onRename(item.id, trimmed);
                    } else {
                        renderTflPillBar(containerEl, config);
                    }
                };

                const cancel = () => {
                    if (finished) return;
                    finished = true;
                    renderTflPillBar(containerEl, config);
                };

                input.onclick = (ev) => ev.stopPropagation();
                input.onkeydown = (ev) => {
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        commit();
                    } else if (ev.key === 'Escape') {
                        ev.preventDefault();
                        cancel();
                    }
                };
                input.onblur = () => commit();

                pill.innerHTML = '';
                pill.appendChild(input);
                input.focus();
                input.select();
            };

            if (isActive && config.onRename) {
                pill.ondblclick = startInlineRename;
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'tfl-pill-icon-btn';
                editBtn.title = '修改名稱';
                editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
                editBtn.onclick = startInlineRename;
                pill.appendChild(editBtn);
            }

            if (isActive && config.onDelete) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'tfl-pill-icon-btn danger';
                delBtn.title = '刪除';
                delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    config.onDelete(item.id);
                };
                pill.appendChild(delBtn);
            }

            pill.onclick = () => {
                if (!isActive && config.onSelect) {
                    config.onSelect(item.id);
                }
            };

            containerEl.appendChild(pill);
        });

        if (config.onAdd) {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'tfl-pill-add-btn';
            addBtn.innerHTML = config.addLabel || '+ 新增';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                config.onAdd();
            };
            containerEl.appendChild(addBtn);
        }
    }

    function showTrafficLightEditor(node) {
        currentModalNode = node;
        document.getElementById('tfl-modal-title').textContent = `Traffic Light Editor for Node ${node.id}`;

        // 1. 如果路口完全沒有號誌資料 (全新建立的路口)，初始化空骨架
        if (!network.trafficLights[node.id]) {
            network.trafficLights[node.id] = {
                nodeId: node.id,
                timeShift: 0,
                signalGroups: {},
                schedule: []
            };
        }

        // 2. 【核心修正】向後相容/資料升級邏輯
        if (!network.trafficLights[node.id].advanced) {
            const legacySchedule = network.trafficLights[node.id].schedule || [];
            const legacyTimeShift = network.trafficLights[node.id].timeShift || 0;

            network.trafficLights[node.id].advanced = {
                schedules: {
                    'Sched_A': {
                        id: 'Sched_A',
                        name: '舊版預設時制 (A)',
                        groupSetId: 'GroupSet_1',
                        timeShift: legacyTimeShift,
                        phases: JSON.parse(JSON.stringify(legacySchedule))
                    }
                },
                dailyPlans: {
                    'Plan_1': {
                        id: 'Plan_1',
                        name: '預設日型態',
                        switches: [{ time: '00:00', schedId: 'Sched_A' }]
                    }
                },
                weekly: { 1: 'Plan_1', 2: 'Plan_1', 3: 'Plan_1', 4: 'Plan_1', 5: 'Plan_1', 6: 'Plan_1', 7: 'Plan_1' }
            };
        }

        // 確保具備多套硬體群組結構
        ensureTflGroupSets(network.trafficLights[node.id]);

        // 3. 取得進階資料
        const advancedData = network.trafficLights[node.id].advanced;

        currentTflGroupSetId = network.trafficLights[node.id].activeGroupSetId;
        currentTflPlanId = Object.keys(advancedData.dailyPlans)[0];
        currentTflScheduleId = Object.keys(advancedData.schedules)[0];

        // 渲染各個 Tab
        renderTflGroupingTab();
        renderTflLibraryTab();
        renderTflDailyPlansTab();
        renderTflWeeklyTab();

        document.getElementById('traffic-light-modal').style.display = 'block';
        I18N.translateDOM(document.getElementById('traffic-light-modal'));
    }

    // 輔助函數：HH:MM 轉分鐘數
    function timeToMins(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    // 輔助函數：取得時制對應的顏色 (視覺化用)
    function getScheduleColor(schedId) {
        if (schedId === 'NONE') return '#cbd5e1'; // 灰色代表無時制
        let hash = 0;
        for (let i = 0; i < schedId.length; i++) hash = schedId.charCodeAt(i) + ((hash << 5) - hash);
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    }

    function renderTflDailyPlansTab() {
        const advancedData = network.trafficLights[currentModalNode.id].advanced;

        // ==========================================
        // [新增] 1. 頂部控制區 (選擇器與新增按鈕)
        // ==========================================
        const selector = document.getElementById('tfl-plan-selector');
        selector.innerHTML = '';

        // 產生下拉選單選項
        Object.values(advancedData.dailyPlans).forEach(plan => {
            const opt = document.createElement('option');
            opt.value = plan.id;
            // 如果使用者有改名，顯示名字，否則顯示 ID
            opt.textContent = plan.name || plan.id;
            if (plan.id === currentTflPlanId) opt.selected = true;
            selector.appendChild(opt);
        });

        // 切換日型態事件
        selector.onchange = (e) => {
            currentTflPlanId = e.target.value;
            renderTflDailyPlansTab(); // 重新渲染下方時間軸與列表
        };

        // 新增日型態事件
        document.getElementById('tfl-add-plan-btn').onclick = () => {
            const newNum = Object.keys(advancedData.dailyPlans).length + 1;
            const newId = `Plan_${newNum}`;

            // 抓取系統裡第一個可用的時制當作預設值，如果沒有就用 NONE
            const firstSchedId = Object.keys(advancedData.schedules)[0] || 'NONE';

            advancedData.dailyPlans[newId] = {
                id: newId,
                name: `自訂型態 ${newNum}`,
                // 新型態預設只有一個 00:00 的觸發點
                switches: [{ time: '00:00', schedId: firstSchedId }]
            };

            currentTflPlanId = newId;
            renderTflDailyPlansTab();
            renderTflWeeklyTab(); // <--- 【補上這行】同步更新週排程的選單
        };

        // 確保 currentTflPlanId 存在 (防呆)
        if (!currentTflPlanId || !advancedData.dailyPlans[currentTflPlanId]) return;

        const currentPlan = advancedData.dailyPlans[currentTflPlanId];

        // 2. 確保 Switches 按照時間先後順序排列 (核心防呆)
        currentPlan.switches.sort((a, b) => timeToMins(a.time) - timeToMins(b.time));

        // ==========================================
        // 3. 渲染上方：視覺化時間軸 (Timeline Bar)
        // ==========================================
        const timelineContainer = document.getElementById('tfl-daily-timeline');
        let timelineHTML = '';

        for (let i = 0; i < currentPlan.switches.length; i++) {
            const sw = currentPlan.switches[i];
            const startMins = timeToMins(sw.time);
            const endMins = (i + 1 < currentPlan.switches.length) ? timeToMins(currentPlan.switches[i + 1].time) : 1440;

            const widthPct = ((endMins - startMins) / 1440) * 100;
            const color = getScheduleColor(sw.schedId);
            const tflRef = network.trafficLights[currentModalNode.id];
            const schedObj = advancedData.schedules[sw.schedId];
            const gsLabel = schedObj && tflRef.signalGroupSets && tflRef.signalGroupSets[schedObj.groupSetId] ? ` [${tflRef.signalGroupSets[schedObj.groupSetId].name}]` : '';
            const schedName = sw.schedId === 'NONE' ? '無時制 (關閉)' : `${schedObj?.name || sw.schedId}${gsLabel}`;

            timelineHTML += `<div class="tfl-timeline-segment" 
                              style="width: ${widthPct}%; background-color: ${color};" 
                              title="${sw.time} 起運行: ${schedName}">
                              ${widthPct > 8 ? `<span class="seg-label">${schedName}</span>` : ''}
                         </div>`;
        }

        timelineHTML += `
        <div class="tfl-timeline-ticks">
            <span style="left:0%">00:00</span>
            <span style="left:25%">06:00</span>
            <span style="left:50%">12:00</span>
            <span style="left:75%">18:00</span>
            <span style="left:100%">24:00</span>
        </div>`;
        timelineContainer.innerHTML = timelineHTML;

        // ==========================================
        // 4. 渲染下方：觸發點列表 (Checkpoints)
        // ==========================================
        const checkpointsContainer = document.getElementById('tfl-daily-checkpoints');
        checkpointsContainer.innerHTML = '';

        // 準備時制下拉選項 (依硬體群組分組顯示)
        let schedOptionsHTML = `<option value="NONE" style="font-weight:bold; color:#ef4444;">[無時制 / 關閉]</option>`;
        const tflForDaily = network.trafficLights[currentModalNode.id];
        if (tflForDaily && tflForDaily.signalGroupSets) {
            Object.values(tflForDaily.signalGroupSets).forEach(gs => {
                const gsScheds = Object.values(advancedData.schedules).filter(s => s.groupSetId === gs.id);
                if (gsScheds.length > 0) {
                    schedOptionsHTML += `<optgroup label="硬體群組：${gs.name || gs.id}">`;
                    gsScheds.forEach(sched => {
                        schedOptionsHTML += `<option value="${sched.id}">${sched.name}</option>`;
                    });
                    schedOptionsHTML += `</optgroup>`;
                }
            });
        } else {
            Object.values(advancedData.schedules).forEach(sched => {
                schedOptionsHTML += `<option value="${sched.id}">${sched.name}</option>`;
            });
        }

        currentPlan.switches.forEach((sw, index) => {
            const isFirst = (index === 0);

            const rowDiv = document.createElement('div');
            rowDiv.className = 'tfl-checkpoint-row';

            let selectHTML = schedOptionsHTML.replace(`value="${sw.schedId}"`, `value="${sw.schedId}" selected`);

            rowDiv.innerHTML = `
            <div class="cp-time">
                <i class="fa-regular fa-clock"></i>
                <input type="time" class="cp-time-input prop-input" data-index="${index}" 
                       value="${sw.time}" ${isFirst ? 'disabled' : 'required'}>
            </div>
            <div class="cp-action">
                <i class="fa-solid fa-arrow-right-long" style="color:#cbd5e1;"></i>切換為
            </div>
            <div class="cp-schedule">
                <select class="cp-sched-select prop-select" data-index="${index}">
                    ${selectHTML}
                </select>
            </div>
            <div class="cp-delete">
                ${!isFirst ? `<button class="btn-mini btn-mini-danger cp-del-btn" data-index="${index}"><i class="fa-solid fa-trash-can"></i></button>` : `<div style="width:28px;"></div>`}
            </div>
        `;
            checkpointsContainer.appendChild(rowDiv);
        });

        // ==========================================
        // 5. 綁定列表事件
        // ==========================================

        // 修改時間 (觸發排序)
        checkpointsContainer.querySelectorAll('.cp-time-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                let newTime = e.target.value;
                if (!newTime) newTime = "00:00";

                const isDuplicate = currentPlan.switches.some((s, i) => i !== idx && s.time === newTime);
                if (isDuplicate) {
                    alert("該時間點已存在設定，請選擇其他時間。");
                    renderTflDailyPlansTab();
                    return;
                }

                currentPlan.switches[idx].time = newTime;
                renderTflDailyPlansTab();
                saveState();
            });
        });

        // 修改時制
        checkpointsContainer.querySelectorAll('.cp-sched-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index);
                currentPlan.switches[idx].schedId = e.target.value;
                renderTflDailyPlansTab();
                saveState();
            });
        });

        // 刪除觸發點
        checkpointsContainer.querySelectorAll('.cp-del-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                currentPlan.switches.splice(idx, 1);
                renderTflDailyPlansTab();
                saveState();
            });
        });

        // 新增觸發點
        document.getElementById('tfl-add-checkpoint-btn').onclick = () => {
            let newTime = "12:00";
            while (currentPlan.switches.some(s => s.time === newTime)) {
                let m = timeToMins(newTime) + 60;
                if (m >= 1440) m = 60;
                const h = Math.floor(m / 60).toString().padStart(2, '0');
                const min = (m % 60).toString().padStart(2, '0');
                newTime = `${h}:${min}`;
            }
            currentPlan.switches.push({ time: newTime, schedId: 'NONE' });
            renderTflDailyPlansTab();
        };
    }

    // ==========================================
    // Tab 4: 週排程渲染 (Weekly Assignment)
    // ==========================================
    function renderTflWeeklyTab() {
        const tflData = network.trafficLights[currentModalNode.id];
        // 確保 advanced 和 weekly 資料存在 (防呆)
        if (!tflData || !tflData.advanced || !tflData.advanced.weekly) return;

        const advancedData = tflData.advanced;
        const weeklyContainer = document.getElementById('tfl-weekly-list');

        // 清空舊內容
        weeklyContainer.innerHTML = '';

        // 1. 產生下拉選單的選項 (選項來自日型態)
        let planOptionsHTML = '';
        Object.values(advancedData.dailyPlans).forEach(plan => {
            // 使用者如果有自訂名稱就顯示名稱，否則顯示 ID
            const displayName = plan.name || plan.id;
            planOptionsHTML += `<option value="${plan.id}">${displayName}</option>`;
        });

        // 2. 建立星期一到星期日的定義陣列
        // 在大部分交通系統中，1=週一，7=週日
        const daysOfWeek = [
            { id: 1, name: 'Monday (週一)', icon: 'fa-calendar-day' },
            { id: 2, name: 'Tuesday (週二)', icon: 'fa-calendar-day' },
            { id: 3, name: 'Wednesday (週三)', icon: 'fa-calendar-day' },
            { id: 4, name: 'Thursday (週四)', icon: 'fa-calendar-day' },
            { id: 5, name: 'Friday (週五)', icon: 'fa-calendar-day' },
            { id: 6, name: 'Saturday (週六)', icon: 'fa-calendar-check', color: '#3b82f6' }, // 週末用不同顏色標示
            { id: 7, name: 'Sunday (週日)', icon: 'fa-calendar-check', color: '#ef4444' }
        ];

        // 3. 渲染 UI
        // 使用一個卡片式容器來包裝這 7 天
        const wrapper = document.createElement('div');
        wrapper.className = 'prop-card';
        wrapper.style.padding = '15px';

        // 加入標題提示
        wrapper.innerHTML = `
        <div class="prop-section-header" style="margin-top:0;">Weekly Assignment</div>
        <div class="prop-hint" style="margin-top:0; margin-bottom:15px;">
            <i class="fa-solid fa-circle-info"></i> 將定義好的「日型態 (Daily Plans)」分配給每週的不同日子。
        </div>
    `;

        // 產生 7 列設定
        daysOfWeek.forEach(day => {
            // 取得該天目前設定的 Plan ID
            const currentPlanForDay = advancedData.weekly[day.id];

            // 替換 HTML 讓目前的 Plan 呈現 selected 狀態
            let selectHTML = planOptionsHTML;
            if (currentPlanForDay) {
                selectHTML = selectHTML.replace(`value="${currentPlanForDay}"`, `value="${currentPlanForDay}" selected`);
            }

            const row = document.createElement('div');
            row.className = 'prop-row';
            row.style.marginBottom = '12px';
            row.style.borderBottom = '1px dashed var(--border-light)';
            row.style.paddingBottom = '8px';

            row.innerHTML = `
            <span class="prop-label" style="font-weight:600; color:${day.color || 'var(--text-main)'}; width: 130px;">
                <i class="fa-solid ${day.icon}" style="margin-right:8px; opacity:0.7;"></i>${day.name}
            </span>
            <select class="prop-select weekly-plan-select" data-day="${day.id}">
                ${selectHTML}
            </select>
        `;

            wrapper.appendChild(row);
        });

        weeklyContainer.appendChild(wrapper);

        // ==========================================
        // 4. 綁定事件：當下拉選單改變時，更新資料模型
        // ==========================================
        weeklyContainer.querySelectorAll('.weekly-plan-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const dayId = parseInt(e.target.dataset.day, 10);
                const selectedPlanId = e.target.value;

                // 更新資料模型
                advancedData.weekly[dayId] = selectedPlanId;

                // 觸發全域儲存 (Undo/Redo 追蹤)
                saveState();
            });
        });
    }

    function renderTflGroupingTab() {
        const tflData = network.trafficLights[currentModalNode.id];
        ensureTflGroupSets(tflData);
        if (!currentTflGroupSetId || !tflData.signalGroupSets[currentTflGroupSetId]) {
            currentTflGroupSetId = tflData.activeGroupSetId;
        }
        setActiveTflGroupSet(tflData, currentTflGroupSetId);
        const currentGroupSet = tflData.signalGroupSets[currentTflGroupSetId];

        // --- 頂部：多套號誌群組(硬體群組)膠囊分頁列 (含 ✏️ 原地改名 / 🗑️ 刪除 / + 新增) ---
        const gsPillsContainer = document.getElementById('tfl-groupset-pills');
        renderTflPillBar(gsPillsContainer, {
            labelHtml: '<i class="fa-solid fa-microchip" style="color:#8b5cf6;"></i> 硬體群組:',
            items: Object.values(tflData.signalGroupSets).map(gs => ({
                id: gs.id,
                name: gs.name || gs.id,
                subText: `${Object.keys(gs.groups || {}).length}群組`
            })),
            activeId: currentTflGroupSetId,
            addLabel: '+ 新增硬體群組',
            onSelect: (selectedGsId) => {
                currentTflGroupSetId = selectedGsId;
                setActiveTflGroupSet(tflData, currentTflGroupSetId);
                renderTflGroupingTab();
                renderTflLibraryTab();
                if (selectedObject) updatePropertiesPanel(selectedObject);
            },
            onRename: (gsId, newName) => {
                if (tflData.signalGroupSets[gsId]) {
                    tflData.signalGroupSets[gsId].name = newName;
                    renderTflGroupingTab();
                    renderTflLibraryTab();
                    renderTflDailyPlansTab();
                    if (selectedObject) updatePropertiesPanel(selectedObject);
                    saveState();
                }
            },
            onDelete: (gsId) => {
                const gsKeys = Object.keys(tflData.signalGroupSets);
                if (gsKeys.length <= 1) {
                    alert('必須保留至少一套號誌群組(硬體群組)。');
                    return;
                }
                const targetGs = tflData.signalGroupSets[gsId];
                if (confirm(`確定要刪除硬體群組「${targetGs ? (targetGs.name || targetGs.id) : gsId}」嗎？`)) {
                    delete tflData.signalGroupSets[gsId];
                    const fallbackGsId = Object.keys(tflData.signalGroupSets)[0];
                    currentTflGroupSetId = fallbackGsId;
                    setActiveTflGroupSet(tflData, fallbackGsId);

                    if (tflData.advanced && tflData.advanced.schedules) {
                        Object.values(tflData.advanced.schedules).forEach(sched => {
                            if (sched.groupSetId === gsId) {
                                sched.groupSetId = fallbackGsId;
                                alignPhasesToGroupSet(sched.phases, tflData.signalGroupSets[fallbackGsId].groups);
                            }
                        });
                    }
                    renderTflGroupingTab();
                    renderTflLibraryTab();
                    renderTflDailyPlansTab();
                    if (selectedObject) updatePropertiesPanel(selectedObject);
                    saveState();
                }
            },
            onAdd: () => {
                let newNum = 1;
                while (tflData.signalGroupSets[`GroupSet_${newNum}`]) newNum++;
                const newGsId = `GroupSet_${newNum}`;
                const clonedGroups = {};
                Object.values(currentGroupSet.groups || {}).forEach(g => {
                    clonedGroups[g.id] = { id: g.id, connIds: [], type: g.type || 'vehicle' };
                });
                tflData.signalGroupSets[newGsId] = {
                    id: newGsId,
                    name: `硬體群組 (${String.fromCharCode(64 + Math.min(26, newNum))})`,
                    groups: clonedGroups
                };
                ensureScheduleForGroupSet(tflData, newGsId);
                currentTflGroupSetId = newGsId;
                setActiveTflGroupSet(tflData, newGsId);
                renderTflGroupingTab();
                renderTflLibraryTab();
                renderTflDailyPlansTab();
                if (selectedObject) updatePropertiesPanel(selectedObject);
                saveState();
            }
        });

        const groupManagementDiv = document.getElementById('tfl-group-management');
        groupManagementDiv.innerHTML = '';

        Object.values(tflData.signalGroups).forEach(group => {
            const groupItem = document.createElement('div');
            groupItem.className = 'tfl-group-item';
            const boundCount = (group.connIds || []).length;
            groupItem.innerHTML = `
                <input type="text" class="tfl-group-name-input" value="${group.id}" data-old-id="${group.id}" style="width: 100px;">
                <select class="tfl-group-type-select prop-select" data-group-id="${group.id}" style="width: 90px; margin-left: 8px;">
                    <option value="vehicle" ${group.type !== 'pedestrian' ? 'selected' : ''}>🚗 車輛</option>
                    <option value="pedestrian" ${group.type === 'pedestrian' ? 'selected' : ''}>🚶 行人</option>
                </select>
                <span style="font-size:0.75rem; color:#64748b; margin-left:8px;">${group.type === 'pedestrian' ? '行穿線綁定' : `已點燈: ${boundCount} 動線`}</span>
                <span class="delete-group-btn" data-group-id="${group.id}" title="Delete Group">×</span>
            `;
            groupManagementDiv.appendChild(groupItem);
        });

        document.getElementById('tfl-add-group-btn').onclick = () => {
            const newGroupNameInput = document.getElementById('tfl-new-group-name');
            const name = newGroupNameInput.value.trim();
            if (name && !tflData.signalGroups[name]) {
                const isPed = name.toUpperCase().startsWith('P');
                tflData.signalGroups[name] = { id: name, connIds: [], type: isPed ? 'pedestrian' : 'vehicle' };

                // 更新使用此套硬體群組的時制
                if (currentTflGroupSetId === Object.keys(tflData.signalGroupSets)[0]) {
                    tflData.schedule.forEach(phase => {
                        phase.signals[name] = isPed ? { walk: phase.duration, flash: 0, stop: 0 } : 'Red';
                    });
                }
                if (tflData.advanced) {
                    Object.values(tflData.advanced.schedules).forEach(sched => {
                        if ((sched.groupSetId || 'GroupSet_1') === currentTflGroupSetId) {
                            sched.phases.forEach(p => {
                                p.signals[name] = isPed ? { walk: p.duration, flash: 0, stop: 0 } : 'Red';
                            });
                        }
                    });
                }
                newGroupNameInput.value = '';
                renderTflGroupingTab();
                renderTflLibraryTab();
                if (selectedObject) updatePropertiesPanel(selectedObject);
                saveState();
            } else {
                alert(I18N.t('Group name is empty or already exists.'));
            }
        };

        // 監聽名稱與類型變更
        groupManagementDiv.querySelectorAll('.tfl-group-name-input').forEach(input => {
            input.onchange = (e) => {
                const oldId = e.target.dataset.oldId;
                const newId = e.target.value.trim();
                if (newId && oldId !== newId && !tflData.signalGroups[newId]) {
                    const groupData = tflData.signalGroups[oldId];
                    groupData.id = newId;
                    delete tflData.signalGroups[oldId];
                    tflData.signalGroups[newId] = groupData;

                    if (currentTflGroupSetId === Object.keys(tflData.signalGroupSets)[0]) {
                        tflData.schedule.forEach(phase => {
                            if (phase.signals[oldId] !== undefined) {
                                phase.signals[newId] = phase.signals[oldId];
                                delete phase.signals[oldId];
                            }
                        });
                    }
                    if (tflData.advanced) {
                        Object.values(tflData.advanced.schedules).forEach(sched => {
                            if ((sched.groupSetId || 'GroupSet_1') === currentTflGroupSetId) {
                                sched.phases.forEach(p => {
                                    if (p.signals[oldId] !== undefined) {
                                        p.signals[newId] = p.signals[oldId];
                                        delete p.signals[oldId];
                                    }
                                });
                            }
                        });
                    }
                    renderTflGroupingTab();
                    renderTflLibraryTab();
                    if (selectedObject) updatePropertiesPanel(selectedObject);
                    saveState();
                } else if (newId !== oldId) {
                    e.target.value = oldId;
                    alert('Group name is empty or already exists.');
                }
            };
        });

        groupManagementDiv.querySelectorAll('.tfl-group-type-select').forEach(select => {
            select.onchange = (e) => {
                const gId = e.target.dataset.groupId;
                const newType = e.target.value;
                tflData.signalGroups[gId].type = newType;

                if (tflData.advanced) {
                    Object.values(tflData.advanced.schedules).forEach(sched => {
                        if ((sched.groupSetId || 'GroupSet_1') === currentTflGroupSetId) {
                            sched.phases.forEach(p => {
                                if (newType === 'pedestrian' && typeof p.signals[gId] === 'string') {
                                    p.signals[gId] = { walk: p.duration, flash: 0, stop: 0 };
                                } else if (newType === 'vehicle' && typeof p.signals[gId] === 'object') {
                                    p.signals[gId] = 'Red';
                                }
                            });
                        }
                    });
                }
                saveState();
                renderTflGroupingTab();
                renderTflLibraryTab();
            };
        });

        groupManagementDiv.querySelectorAll('.delete-group-btn').forEach(btn => {
            btn.onclick = (e) => {
                const groupId = e.target.dataset.groupId;
                delete tflData.signalGroups[groupId];

                if (currentTflGroupSetId === Object.keys(tflData.signalGroupSets)[0]) {
                    tflData.schedule.forEach(phase => delete phase.signals[groupId]);
                }
                if (tflData.advanced) {
                    Object.values(tflData.advanced.schedules).forEach(sched => {
                        if ((sched.groupSetId || 'GroupSet_1') === currentTflGroupSetId) {
                            sched.phases.forEach(p => delete p.signals[groupId]);
                        }
                    });
                }
                renderTflGroupingTab();
                renderTflLibraryTab();
                if (selectedObject) {
                    updatePropertiesPanel(selectedObject);
                }
                saveState();
            };
        });
    }

    function renderTflLibraryTab() {
        const tflData = network.trafficLights[currentModalNode.id];
        ensureTflGroupSets(tflData);
        const advancedData = tflData.advanced;
        if (!advancedData || !advancedData.schedules) return;

        // 1. 決定當前檢視的硬體群組 (與 Tab 1 連動)
        if (!currentTflGroupSetId || !tflData.signalGroupSets[currentTflGroupSetId]) {
            currentTflGroupSetId = tflData.activeGroupSetId || Object.keys(tflData.signalGroupSets)[0];
        }

        // 確保該硬體群組底下至少有一個時制
        ensureScheduleForGroupSet(tflData, currentTflGroupSetId);

        // 篩選出隸屬於當前硬體群組的時制列表
        let schedulesInGroupSet = Object.values(advancedData.schedules).filter(s => s.groupSetId === currentTflGroupSetId);
        if (!currentTflScheduleId || !advancedData.schedules[currentTflScheduleId] || advancedData.schedules[currentTflScheduleId].groupSetId !== currentTflGroupSetId) {
            currentTflScheduleId = schedulesInGroupSet[0].id;
        }

        const currentSchedule = advancedData.schedules[currentTflScheduleId];
        const scheduleGroupSet = tflData.signalGroupSets[currentTflGroupSetId];
        const activeScheduleGroups = scheduleGroupSet ? scheduleGroupSet.groups : tflData.signalGroups;
        alignPhasesToGroupSet(currentSchedule.phases, activeScheduleGroups);

        // --- 第 1 列：先選擇硬體群組 (與 Tab 1 完全對應) ---
        const libGsPillsContainer = document.getElementById('tfl-library-groupset-pills');
        renderTflPillBar(libGsPillsContainer, {
            labelHtml: '<i class="fa-solid fa-microchip" style="color:#8b5cf6;"></i> 硬體群組:',
            items: Object.values(tflData.signalGroupSets).map(gs => {
                const sCount = Object.values(advancedData.schedules).filter(s => s.groupSetId === gs.id).length;
                return {
                    id: gs.id,
                    name: gs.name || gs.id,
                    subText: `${Object.keys(gs.groups || {}).length}燈號 · ${sCount || 1}時制`
                };
            }),
            activeId: currentTflGroupSetId,
            onSelect: (selectedGsId) => {
                currentTflGroupSetId = selectedGsId;
                setActiveTflGroupSet(tflData, currentTflGroupSetId);
                ensureScheduleForGroupSet(tflData, currentTflGroupSetId);
                const gsScheds = Object.values(advancedData.schedules).filter(s => s.groupSetId === currentTflGroupSetId);
                if (gsScheds.length > 0) currentTflScheduleId = gsScheds[0].id;
                renderTflGroupingTab();
                renderTflLibraryTab();
                if (selectedObject) updatePropertiesPanel(selectedObject);
            }
        });

        // --- 第 2 列：該硬體群組底下的時制分頁 (含 ✏️ 原地改名 / 🗑️ 刪除 / + 新增時制) ---
        const schedPillsContainer = document.getElementById('tfl-schedule-pills');
        renderTflPillBar(schedPillsContainer, {
            labelHtml: '<i class="fa-regular fa-clock" style="color:#3b82f6;"></i> 時制:',
            pillClass: 'tfl-pill-schedule',
            items: schedulesInGroupSet.map(sched => ({
                id: sched.id,
                name: sched.name || sched.id
            })),
            activeId: currentTflScheduleId,
            addLabel: '+ 新增時制',
            onSelect: (selectedSchedId) => {
                currentTflScheduleId = selectedSchedId;
                renderTflLibraryTab();
            },
            onRename: (schedId, newName) => {
                if (advancedData.schedules[schedId]) {
                    advancedData.schedules[schedId].name = newName;
                    renderTflLibraryTab();
                    renderTflDailyPlansTab();
                    saveState();
                }
            },
            onDelete: (schedId) => {
                if (schedulesInGroupSet.length <= 1) {
                    alert(I18N.t('此硬體群組下必須保留至少一個時制。'));
                    return;
                }
                const targetSched = advancedData.schedules[schedId];
                if (confirm(I18N.t(`確定要刪除時制「${targetSched ? targetSched.name : schedId}」嗎？`))) {
                    Object.values(advancedData.dailyPlans).forEach(plan => {
                        plan.switches.forEach(sw => {
                            if (sw.schedId === schedId) sw.schedId = 'NONE';
                        });
                    });
                    delete advancedData.schedules[schedId];
                    const remaining = Object.values(advancedData.schedules).filter(s => s.groupSetId === currentTflGroupSetId);
                    currentTflScheduleId = remaining.length > 0 ? remaining[0].id : Object.keys(advancedData.schedules)[0];
                    renderTflLibraryTab();
                    renderTflDailyPlansTab();
                    saveState();
                }
            },
            onAdd: () => {
                let newNum = 1;
                while (advancedData.schedules[`Sched_${newNum}`]) newNum++;
                const newId = `Sched_${newNum}`;
                const dur = 30;
                const initialSignals = {};
                Object.values(activeScheduleGroups || {}).forEach(g => {
                    initialSignals[g.id] = (g.type === 'pedestrian')
                        ? { walk: dur - 10, flash: 7, stop: 3 }
                        : 'Red';
                });
                advancedData.schedules[newId] = {
                    id: newId,
                    name: `自訂時制[${newNum}]`,
                    groupSetId: currentTflGroupSetId,
                    timeShift: 0,
                    phases: [{ duration: dur, signals: initialSignals }]
                };
                currentTflScheduleId = newId;
                renderTflLibraryTab();
                renderTflDailyPlansTab();
                saveState();
            }
        });

        const shiftInput = document.getElementById('tfl-schedule-timeshift');
        if (shiftInput) {
            shiftInput.value = currentSchedule.timeShift || 0;
            shiftInput.onchange = (e) => {
                const newVal = parseInt(e.target.value, 10) || 0;
                currentSchedule.timeShift = newVal;
                if (advancedData.weekly) {
                    const monPlanId = advancedData.weekly[1];
                    if (monPlanId && advancedData.dailyPlans[monPlanId]) {
                        const sw = advancedData.dailyPlans[monPlanId].switches.find(s => s.schedId !== 'NONE');
                        if (sw && sw.schedId === currentTflScheduleId) {
                            tflData.timeShift = newVal;
                            const propShiftInput = document.getElementById('prop-tfl-shift');
                            if (propShiftInput && selectedObject && selectedObject.id === currentModalNode.id) propShiftInput.value = newVal;
                        }
                    }
                }
                saveState();
            };
        }

        // --- 表格區塊：依據當前時制所選擇的號誌群組(硬體群組)渲染 ---
        const tableHead = document.querySelector('#tfl-schedule-table thead');
        const tableBody = document.querySelector('#tfl-schedule-table tbody');

        const vehicleGroups = [];
        const pedestrianGroups = [];
        Object.values(activeScheduleGroups).forEach(g => {
            if (g.type === 'pedestrian') pedestrianGroups.push(g.id);
            else vehicleGroups.push(g.id);
        });

        // 表頭
        let headerHtml = '<tr><th style="width: 80px;">秒數 (s)</th>';
        vehicleGroups.forEach(id => { headerHtml += `<th>🚗 ${id}</th>`; });
        pedestrianGroups.forEach(id => { headerHtml += `<th title="雙擊儲存格套用台灣預設 (閃7停3)">🚶 ${id}</th>`; });
        headerHtml += '<th style="width: 70px;">操作</th></tr>';
        tableHead.innerHTML = headerHtml;

        // 內容
        let bodyHtml = '';
        currentSchedule.phases.forEach((phase, phaseIndex) => {
            bodyHtml += `<tr>`;
            bodyHtml += `<td><input type="number" class="tfl-duration-input prop-input" data-phase="${phaseIndex}" value="${phase.duration}" min="1" style="width:50px; text-align:center;"></td>`;

            // 車輛格子 (點擊循環切換)
            vehicleGroups.forEach(id => {
                const signal = phase.signals[id] || 'Red';
                const colorClass = `signal-${signal.toLowerCase()}`;
                bodyHtml += `<td><div class="signal-block ${colorClass}" data-phase="${phaseIndex}" data-group-id="${id}" title="Current: ${signal}"></div></td>`;
            });

            // 行人格子 (複合式輸入框)
            pedestrianGroups.forEach(id => {
                let pState = phase.signals[id];
                if (!pState || typeof pState !== 'object') {
                    if (pState === 'Green') pState = { walk: phase.duration, flash: 0, stop: 0 };
                    else pState = { walk: 0, flash: 0, stop: phase.duration };
                    phase.signals[id] = pState; // 修正舊資料
                }
                bodyHtml += `
                    <td class="pedestrian-composite-cell" data-phase="${phaseIndex}" data-group="${id}" style="white-space: nowrap; padding: 2px; font-size: 0.75rem; background: #f8fafc; border: 1px solid #e2e8f0;">
                        <div style="display:flex; justify-content:center; align-items:center; gap:2px;">
                            <span style="color:#22c55e;">🟢</span><input type="number" class="p-walk prop-input" data-phase="${phaseIndex}" data-group="${id}" value="${pState.walk}" style="width:30px; padding:0; text-align:center;">
                            <span style="color:#f97316;">🟠</span><input type="number" class="p-flash prop-input" data-phase="${phaseIndex}" data-group="${id}" value="${pState.flash}" style="width:30px; padding:0; text-align:center;">
                            <span style="color:#ef4444;">🔴</span><input type="number" class="p-stop prop-input" data-phase="${phaseIndex}" data-group="${id}" value="${pState.stop}" style="width:30px; padding:0; text-align:center;">
                        </div>
                    </td>`;
            });

            bodyHtml += `<td><button class="tfl-delete-phase-btn btn-mini btn-mini-danger" data-phase="${phaseIndex}"><i class="fa-solid fa-trash-can"></i></button></td></tr>`;
        });
        tableBody.innerHTML = bodyHtml;

        // --- 事件綁定 ---

        // 1. 總時間變更 (連動調整行人紅燈或綠燈)
        tableBody.querySelectorAll('.tfl-duration-input').forEach(input => {
            input.onchange = (e) => {
                const phaseIdx = e.target.dataset.phase;
                const oldDur = currentSchedule.phases[phaseIdx].duration;
                const newDur = parseInt(e.target.value, 10) || 30;
                const diff = newDur - oldDur;
                const phase = currentSchedule.phases[phaseIdx];
                phase.duration = newDur;

                // 所有行人群組時間按比例補齊
                pedestrianGroups.forEach(id => {
                    const pState = phase.signals[id];
                    if (pState) {
                        pState.stop += diff;
                        if (pState.stop < 0) { pState.walk += pState.stop; pState.stop = 0; }
                        if (pState.walk < 0) { pState.flash += pState.walk; pState.walk = 0; }
                    }
                });
                renderTflLibraryTab(); saveState();
            };
        });

        // 2. 行人參數智慧配平 (Auto-Balancing)
        tableBody.querySelectorAll('.p-walk, .p-flash, .p-stop').forEach(input => {
            input.onchange = (e) => {
                const phaseIdx = e.target.dataset.phase;
                const groupId = e.target.dataset.group;
                const type = e.target.className.includes('p-walk') ? 'walk' : (e.target.className.includes('p-flash') ? 'flash' : 'stop');
                let val = parseInt(e.target.value, 10) || 0;
                if (val < 0) val = 0;

                const phase = currentSchedule.phases[phaseIdx];
                const dur = phase.duration;
                const pState = phase.signals[groupId];
                pState[type] = val;

                let sum = pState.walk + pState.flash + pState.stop;
                if (sum !== dur) {
                    let diff = dur - sum;
                    if (diff > 0) {
                        // 時間有剩：優先加給 Stop，若編輯的就是 Stop 則加給 Walk
                        if (type === 'walk') pState.stop += diff;
                        else if (type === 'flash') pState.walk += diff;
                        else pState.walk += diff;
                    } else {
                        // 時間超出：依序從其他屬性扣除
                        let toRemove = -diff;
                        const order = type === 'walk' ? ['stop', 'flash'] : (type === 'flash' ? ['stop', 'walk'] : ['flash', 'walk']);
                        for (let prop of order) {
                            if (toRemove <= 0) break;
                            let deduct = Math.min(pState[prop], toRemove);
                            pState[prop] -= deduct;
                            toRemove -= deduct;
                        }
                        if (toRemove > 0) pState[type] -= toRemove; // 極端情況硬扣
                    }
                }
                renderTflLibraryTab(); saveState();
            };
        });

        // 3. 雙擊行人格子快速套用台灣預設 (閃7停3)
        tableBody.querySelectorAll('.pedestrian-composite-cell').forEach(cell => {
            cell.ondblclick = (e) => {
                // 避免點擊到輸入框時觸發
                if (e.target.tagName === 'INPUT') return;

                const phaseIdx = cell.dataset.phase;
                const groupId = cell.dataset.group;
                const phase = currentSchedule.phases[phaseIdx];
                const pState = phase.signals[groupId];
                const dur = phase.duration;

                let flash = 7; let stop = 3;
                if (dur < 10) { flash = 0; stop = dur; } // 防呆
                pState.flash = flash;
                pState.stop = stop;
                pState.walk = Math.max(0, dur - flash - stop);

                renderTflLibraryTab(); saveState();
            };
        });

        // 4. 車輛狀態切換
        tableBody.querySelectorAll('.signal-block').forEach(block => {
            block.onclick = (e) => {
                const phaseIdx = e.target.dataset.phase;
                const groupId = e.target.dataset.groupId;
                const signals = ['Green', 'Yellow', 'Red'];
                const currentSignal = currentSchedule.phases[phaseIdx].signals[groupId] || 'Red';
                currentSchedule.phases[phaseIdx].signals[groupId] = signals[(currentSignal === 'Green') ? 1 : (currentSignal === 'Yellow' ? 2 : 0)];
                renderTflLibraryTab(); saveState();
            };
        });

        // 5. 刪除與新增步階
        tableBody.querySelectorAll('.tfl-delete-phase-btn').forEach(btn => {
            btn.onclick = (e) => {
                currentSchedule.phases.splice(e.currentTarget.dataset.phase, 1);
                renderTflLibraryTab(); saveState();
            };
        });

        document.getElementById('tfl-add-phase-btn').onclick = () => {
            const dur = 30;
            const newPhase = { duration: dur, signals: {} };
            Object.values(activeScheduleGroups).forEach(g => {
                if (g.type === 'pedestrian') newPhase.signals[g.id] = { walk: dur - 10, flash: 7, stop: 3 };
                else newPhase.signals[g.id] = 'Red';
            });
            currentSchedule.phases.push(newPhase);
            renderTflLibraryTab(); saveState();
        };

        // [新增] 一鍵產生行人專用時相
        let scrambleBtn = document.getElementById('tfl-add-scramble-btn');
        if (!scrambleBtn) {
            scrambleBtn = document.createElement('button');
            scrambleBtn.id = 'tfl-add-scramble-btn';
            scrambleBtn.className = 'btn-action';
            scrambleBtn.style = 'margin-left: 10px; background: #8b5cf6;';
            scrambleBtn.innerHTML = '<i class="fa-solid fa-person-walking"></i> 加入行人專用時相';
            document.getElementById('tfl-add-phase-btn').after(scrambleBtn);
        }
        scrambleBtn.onclick = () => {
            const dur = 30;
            const newPhase = { duration: dur, signals: {} };
            vehicleGroups.forEach(id => newPhase.signals[id] = 'Red');
            pedestrianGroups.forEach(id => newPhase.signals[id] = { walk: dur - 10, flash: 7, stop: 3 });
            currentSchedule.phases.push(newPhase);
            renderTflLibraryTab(); saveState();
        };
    }

    document.getElementById('tfl-save-btn').onclick = () => {
        document.getElementById('traffic-light-modal').style.display = 'none';
        currentModalNode = null;
    };

    // --- Vehicle Spawner Editor Logic ---

    function showSpawnerEditor(origin) {
        currentModalOrigin = origin;
        document.getElementById('spawner-modal-title').textContent = `Vehicle Spawner Editor for ${origin.id}`;

        // --- [修改開始] 初始化 Car, Motor, Truck/Bus ---
        if (Object.keys(network.vehicleProfiles).length === 0) {
            network.vehicleProfiles['car'] = {
                id: 'car', length: 4.5, width: 1.8, maxSpeed: 16.67,
                maxAcceleration: 3.0, comfortDeceleration: 2.5, minDistance: 2.5, desiredHeadwayTime: 1.5
            };
            network.vehicleProfiles['motor'] = {
                id: 'motor', length: 2.0, width: 0.8, maxSpeed: 16.67,
                maxAcceleration: 3.5, comfortDeceleration: 3.0, minDistance: 1.0, desiredHeadwayTime: 0.8
            };
            network.vehicleProfiles['Truck/Bus'] = {
                id: 'Truck/Bus', length: 12.0, width: 2.6, maxSpeed: 16.67,
                maxAcceleration: 0.8, comfortDeceleration: 1.0, minDistance: 3.0, desiredHeadwayTime: 3.0
            };
        }
        // --- [修改結束] ---

        renderSpawnerPeriodsTab();
        renderSpawnerProfilesTab();
        document.getElementById('spawner-modal').style.display = 'block';
        I18N.translateDOM(document.getElementById('spawner-modal'));
    }

    function renderSpawnerPeriodsTab() {
        const spawnerData = currentModalOrigin;
        const periodsList = document.getElementById('spawner-periods-list');

        // 讀取 UI 數據的輔助函數 (保持不變)
        const readPeriodsFromUI = () => {
            const periods = [];
            const uiPeriodElements = periodsList.querySelectorAll('.spawner-period');

            uiPeriodElements.forEach((div) => {
                const newPeriod = {
                    duration: parseInt(div.querySelector('.period-duration').value, 10) || 3600,
                    numVehicles: parseInt(div.querySelector('.period-num-vehicles').value, 10) || 100,
                    destinations: [],
                    profiles: [],
                    stops: []
                };

                // Destinations
                div.querySelectorAll('.dest-table tbody tr').forEach(row => {
                    const select = row.cells[0].querySelector('select');
                    const weightInput = row.cells[1].querySelector('input');
                    if (select && select.value && weightInput) {
                        newPeriod.destinations.push({
                            nodeId: select.value,
                            weight: parseFloat(weightInput.value) || 1
                        });
                    }
                });

                // Profiles
                div.querySelectorAll('.profile-table tbody tr').forEach(row => {
                    const select = row.cells[0].querySelector('select');
                    const weightInput = row.cells[1].querySelector('input');
                    if (select && select.value && weightInput) {
                        newPeriod.profiles.push({
                            profileId: select.value,
                            weight: parseFloat(weightInput.value) || 1
                        });
                    }
                });

                // Stops
                div.querySelectorAll('.stops-table tbody tr').forEach(row => {
                    const select = row.cells[0].querySelector('select');
                    const probInput = row.cells[1].querySelector('input');
                    const durInput = row.cells[2].querySelector('input');

                    if (select && select.value) {
                        newPeriod.stops.push({
                            parkingLotId: select.value,
                            probability: parseFloat(probInput.value) || 0,
                            duration: parseFloat(durInput.value) || 0
                        });
                    }
                });

                periods.push(newPeriod);
            });
            return periods;
        };

        // --- 核心渲染邏輯 (更新結構) ---
        periodsList.innerHTML = '';
        (spawnerData.periods || []).forEach((period, index) => {
            // Parking Dropdown Generator
            const parkingOptions = Object.values(network.parkingLots).map(pl => pl.id);
            const parkingLabels = Object.values(network.parkingLots).map(pl => `${pl.name || pl.id}`);
            const generateParkingDropdown = (id, selectedValue) => {
                if (parkingOptions.length === 0) return '<span style="color:#999; font-style:italic;">No Parking Lots</span>';
                let html = `<select id="${id}" class="prop-select" style="width:100%">`;
                parkingOptions.forEach((optId, idx) => {
                    const label = parkingLabels[idx];
                    const selected = optId === selectedValue ? 'selected' : '';
                    html += `<option value="${optId}" ${selected}>${label}</option>`;
                });
                html += `</select>`;
                return html;
            };

            const periodDiv = document.createElement('div');
            periodDiv.className = 'spawner-period spawner-card'; // 加入 card class
            periodDiv.innerHTML = `
                <!-- 1. Card Header -->
                <div class="spawner-card-header">
                    <div class="spawner-card-title">
                        <i class="fa-regular fa-clock"></i> 
                        Time Period ${index + 1}
                    </div>
                    <button class="delete-period-btn btn-sm" style="color:#ef4444; border:1px solid #fecaca; background:#fff;" data-index="${index}">
                        <i class="fa-solid fa-trash-can"></i> Remove
                    </button>
                </div>

                <!-- 2. Basic Settings Grid -->
                <div class="spawner-grid-row">
                    <div class="spawner-input-group">
                        <label>Duration (sec)</label>
                        <input type="number" class="period-duration prop-input" data-index="${index}" value="${period.duration || 3600}">
                    </div>
                    <div class="spawner-input-group">
                        <label>Vehicle Count</label>
                        <input type="number" class="period-num-vehicles prop-input" data-index="${index}" value="${period.numVehicles || 100}">
                    </div>
                </div>

                <!-- 3. Split Layout for Destinations & Profiles -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <!-- Left: Destinations -->
                    <div>
                        <div class="spawner-sub-header"><i class="fa-solid fa-location-dot"></i> Destinations</div>
                        <table class="spawner-table dest-table" data-index="${index}">
                            <thead>
                                <tr>
                                    <th>Node</th>
                                    <th style="width:70px; text-align:right;">Weight</th>
                                    <th style="width:30px;"></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(period.destinations || []).map((dest, d_idx) => `
                                    <tr>
                                        <td>${generateDropdown(`dest-sel-${index}-${d_idx}`, Object.keys(network.destinations), dest.nodeId).replace('<select', '<select class="prop-select" style="width:100%"')}</td>
                                        <td><input type="number" step="0.1" value="${dest.weight || 1}" class="prop-input" style="text-align:right;"></td>
                                        <td style="text-align:center;"><button class="delete-row-btn btn-icon-only"><i class="fa-solid fa-xmark"></i></button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <button class="add-dest-btn btn-dashed" data-index="${index}">+ Add Destination</button>
                    </div>

                    <!-- Right: Profiles -->
                    <div>
                        <div class="spawner-sub-header"><i class="fa-solid fa-car-side"></i> Vehicle Mix</div>
                        <table class="spawner-table profile-table" data-index="${index}">
                            <thead>
                                <tr>
                                    <th>Profile</th>
                                    <th style="width:70px; text-align:right;">Weight</th>
                                    <th style="width:30px;"></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(period.profiles || []).map((prof, p_idx) => `
                                    <tr>
                                        <td>${generateDropdown(`prof-sel-${index}-${p_idx}`, Object.keys(network.vehicleProfiles), prof.profileId).replace('<select', '<select class="prop-select" style="width:100%"')}</td>
                                        <td><input type="number" step="0.1" value="${prof.weight || 1}" class="prop-input" style="text-align:right;"></td>
                                        <td style="text-align:center;"><button class="delete-row-btn btn-icon-only"><i class="fa-solid fa-xmark"></i></button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <button class="add-prof-btn btn-dashed" data-index="${index}">+ Add Profile</button>
                    </div>
                </div>

                <!-- 4. Intermediate Stops -->
                <div class="spawner-sub-section">
                    <div class="spawner-sub-header"><i class="fa-solid fa-square-parking"></i> Intermediate Stops</div>
                    <table class="spawner-table stops-table" data-index="${index}">
                        <thead>
                            <tr>
                                <th>Parking Lot</th>
                                <th style="width:100px; text-align:right;">Enter Prob (%)</th>
                                <th style="width:100px; text-align:right;">Stay (min)</th>
                                <th style="width:30px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(period.stops || []).map((stop, s_idx) => `
                                <tr>
                                    <td>${generateParkingDropdown(`stop-sel-${index}-${s_idx}`, stop.parkingLotId)}</td>
                                    <td><input type="number" step="1" min="0" max="100" value="${stop.probability || 0}" class="prop-input"></td>
                                    <td><input type="number" step="1" min="0" value="${stop.duration || 0}" class="prop-input"></td>
                                    <td style="text-align:center;"><button class="delete-row-btn btn-icon-only"><i class="fa-solid fa-xmark"></i></button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <button class="add-stop-btn btn-dashed" data-index="${index}">+ Add Parking Stop</button>
                </div>
            `;
            periodsList.appendChild(periodDiv);
        });

        // --- 事件綁定 (保持原有邏輯，僅重新綁定) ---
        // (這部分邏輯不變，因為我們只是換了 HTML 結構的 class，邏輯依賴的 class 名稱如 delete-row-btn 都還在)

        document.getElementById('spawner-add-period-btn').onclick = () => {
            spawnerData.periods = readPeriodsFromUI();
            spawnerData.periods.push({ duration: 3600, numVehicles: 100, destinations: [], profiles: [], stops: [] });
            renderSpawnerPeriodsTab();
        };

        periodsList.querySelectorAll('.delete-period-btn').forEach(btn => {
            btn.onclick = () => {
                spawnerData.periods = readPeriodsFromUI();
                spawnerData.periods.splice(btn.dataset.index, 1);
                renderSpawnerPeriodsTab();
            };
        });

        // Add Destination/Profile/Stop Logic ...
        periodsList.querySelectorAll('.add-dest-btn').forEach(btn => {
            btn.onclick = () => {
                spawnerData.periods = readPeriodsFromUI();
                (spawnerData.periods[btn.dataset.index].destinations ??= []).push({ nodeId: '', weight: 1 });
                renderSpawnerPeriodsTab();
            };
        });

        // 在 renderSpawnerPeriodsTab 函數內找到 .add-prof-btn 的事件監聽
        periodsList.querySelectorAll('.add-prof-btn').forEach(btn => {
            btn.onclick = () => {
                spawnerData.periods = readPeriodsFromUI();
                // [修改] 將 'default' 改為 'car'
                (spawnerData.periods[btn.dataset.index].profiles ??= []).push({ profileId: 'car', weight: 1 });
                renderSpawnerPeriodsTab();
            };
        });

        periodsList.querySelectorAll('.add-stop-btn').forEach(btn => {
            btn.onclick = () => {
                spawnerData.periods = readPeriodsFromUI();
                const firstPlId = Object.keys(network.parkingLots)[0] || '';
                (spawnerData.periods[btn.dataset.index].stops ??= []).push({ parkingLotId: firstPlId, probability: 0, duration: 0 });
                renderSpawnerPeriodsTab();
            };
        });

        // Delete Rows Logic ...
        periodsList.querySelectorAll('.delete-row-btn').forEach(btn => {
            btn.onclick = (e) => {
                spawnerData.periods = readPeriodsFromUI();
                const row = e.target.closest('tr');
                const table = e.target.closest('table');
                const periodIndex = table.dataset.index;
                const rowIndex = row.rowIndex - 1;

                if (table.classList.contains('dest-table')) {
                    (spawnerData.periods[periodIndex].destinations ??= []).splice(rowIndex, 1);
                } else if (table.classList.contains('profile-table')) {
                    (spawnerData.periods[periodIndex].profiles ??= []).splice(rowIndex, 1);
                } else if (table.classList.contains('stops-table')) {
                    (spawnerData.periods[periodIndex].stops ??= []).splice(rowIndex, 1);
                }
                renderSpawnerPeriodsTab();
            };
        });
    }
    function renderSpawnerProfilesTab() {
        const profilesList = document.getElementById('spawner-profiles-list');
        profilesList.innerHTML = '';

        Object.values(network.vehicleProfiles).forEach(profile => {
            const profileDiv = document.createElement('div');
            profileDiv.className = 'spawner-profile-item spawner-card'; // 卡片樣式

            // 是否為預設 (唯讀)
            const isDefault = profile.id === 'default';
            const idInputAttr = isDefault ? 'disabled style="background:#f1f5f9; color:#64748b;"' : '';

            profileDiv.innerHTML = `
                <!-- Header -->
                <div class="spawner-card-header">
                    <div class="spawner-card-title">
                        <i class="fa-solid fa-car"></i>
                        <input type="text" class="profile-id prop-input" value="${profile.id}" ${idInputAttr} style="width:200px; text-align:left; font-weight:bold;">
                    </div>
                    ${!isDefault ? `<button class="delete-profile-btn btn-sm" style="color:#ef4444; border:1px solid #fecaca; background:#fff;" data-id="${profile.id}"><i class="fa-solid fa-trash-can"></i> Remove</button>` : '<span style="font-size:0.75rem; color:#94a3b8;">(Default Profile)</span>'}
                </div>
                
                <!-- Parameters Grid (4 columns) -->
                <div class="profile-params-grid">
                    <div class="spawner-input-group">
                        <label>Length (m)</label>
                        <input type="number" step="0.1" class="profile-prop prop-input" data-prop="length" value="${profile.length}">
                    </div>
                    <div class="spawner-input-group">
                        <label>Width (m)</label>
                        <input type="number" step="0.1" class="profile-prop prop-input" data-prop="width" value="${profile.width}">
                    </div>
                    <div class="spawner-input-group">
                        <label>Max Speed (m/s)</label>
                        <input type="number" step="0.1" class="profile-prop prop-input" data-prop="maxSpeed" value="${profile.maxSpeed}">
                    </div>
                    <div class="spawner-input-group">
                        <label>Max Accel (m/s²)</label>
                        <input type="number" step="0.1" class="profile-prop prop-input" data-prop="maxAcceleration" value="${profile.maxAcceleration}">
                    </div>
                    <div class="spawner-input-group">
                        <label>Comf. Decel (m/s²)</label>
                        <input type="number" step="0.1" class="profile-prop prop-input" data-prop="comfortDeceleration" value="${profile.comfortDeceleration}">
                    </div>
                    <div class="spawner-input-group">
                        <label>Min Gap (m)</label>
                        <input type="number" step="0.1" class="profile-prop prop-input" data-prop="minDistance" value="${profile.minDistance}">
                    </div>
                    <div class="spawner-input-group">
                        <label>Headway (s)</label>
                        <input type="number" step="0.1" class="profile-prop prop-input" data-prop="desiredHeadwayTime" value="${profile.desiredHeadwayTime}">
                    </div>
                    <!-- Empty slot filler or extra param -->
                    <div></div>
                </div>
            `;
            profilesList.appendChild(profileDiv);
        });

        // 綁定事件
        document.getElementById('spawner-add-profile-btn').onclick = () => {
            const newId = `profile_${Object.keys(network.vehicleProfiles).length}`;
            // [修改] 複製來源改為 'car'，若 'car' 不存在（極少見）則複製第一個存在的
            const templateProfile = network.vehicleProfiles['car'] || Object.values(network.vehicleProfiles)[0];
            network.vehicleProfiles[newId] = { ...templateProfile, id: newId };
            renderSpawnerProfilesTab();
        };

        profilesList.querySelectorAll('.delete-profile-btn').forEach(btn => {
            btn.onclick = () => {
                delete network.vehicleProfiles[btn.dataset.id];
                renderSpawnerProfilesTab();
            };
        });
    }

    document.getElementById('spawner-save-btn').onclick = () => {
        const spawnerData = currentModalOrigin;
        if (spawnerData) {
            const periodElements = document.querySelectorAll('#spawner-periods-list .spawner-period');
            spawnerData.periods = [];
            periodElements.forEach((div) => {
                const newPeriod = {
                    duration: parseFloat(div.querySelector('.period-duration').value) || 0,
                    numVehicles: parseInt(div.querySelector('.period-num-vehicles').value) || 0,
                    destinations: [],
                    profiles: [],
                    stops: [] // <--- 新增
                };

                // Destinations
                div.querySelectorAll('.dest-table tbody tr').forEach(row => {
                    const select = row.cells[0].querySelector('select');
                    if (select && select.value) {
                        newPeriod.destinations.push({
                            nodeId: select.value,
                            weight: parseFloat(row.cells[1].querySelector('input').value) || 0
                        });
                    }
                });

                // Profiles
                div.querySelectorAll('.profile-table tbody tr').forEach(row => {
                    const select = row.cells[0].querySelector('select');
                    if (select && select.value) {
                        newPeriod.profiles.push({
                            profileId: select.value,
                            weight: parseFloat(row.cells[1].querySelector('input').value) || 0
                        });
                    }
                });

                // Stops (Parking) <--- 新增
                div.querySelectorAll('.stops-table tbody tr').forEach(row => {
                    const select = row.cells[0].querySelector('select');
                    const probInput = row.cells[1].querySelector('input');
                    const durInput = row.cells[2].querySelector('input');

                    if (select && select.value) {
                        newPeriod.stops.push({
                            parkingLotId: select.value,
                            probability: parseFloat(probInput.value) || 0,
                            duration: parseFloat(durInput.value) || 0
                        });
                    }
                });

                spawnerData.periods.push(newPeriod);
            });
        }

        const profileElements = document.querySelectorAll('#spawner-profiles-list .spawner-profile-item');
        const updatedProfiles = {};
        profileElements.forEach(div => {
            const newId = div.querySelector('.profile-id').value;
            const newProfile = { id: newId };
            div.querySelectorAll('.profile-prop').forEach(input => { newProfile[input.dataset.prop] = parseFloat(input.value); });
            updatedProfiles[newId] = newProfile;
        });
        network.vehicleProfiles = updatedProfiles;

        document.getElementById('spawner-modal').style.display = 'none';
        currentModalOrigin = null;
    };

    function generateDropdown(id, options, selectedValue) {
        if (options.length === 0) return '<span>No options available</span>';
        return `<select id="${id}">${options.map(opt => `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`).join('')}</select>`;
    }

    // --- XML IMPORT/EXPORT ---

    // --- START OF COMPLETE editor.js FILE ---
    // ... (The rest of the file remains the same) ...

    // --- XML IMPORT/EXPORT ---

    // 完整替換此函數
    // 在 resetWorkspace 函數中，確保重置 pushpins
    // --- 修改 resetWorkspace ---
    // 完整替換此函數 (或修改對應部分)
    function resetWorkspace() {
        deselectAll();
        layer.destroyChildren();
        gridLayer.destroyChildren();

        if (typeof measureGroup !== 'undefined') measureGroup.destroyChildren();

        // 重新初始化 network 物件
        network = {
            navigationMode: 'HYBRID',
            links: {}, nodes: {}, connections: {}, detectors: {},
            vehicleProfiles: {},
            trafficLights: {}, measurements: {}, backgrounds: {}, // <--- 替換
            overpasses: {}, pushpins: {}, parkingLots: {}, parkingGates: {},
            roadSigns: {}, origins: {}, destinations: {}, roadMarkings: {}, zones: {}
        };

        // 【關鍵修正】: 必須更新 window.network，讓外部工具 (SubNetworkTool) 能讀取到新的路網資料
        window.network = network;

        idCounter = 0;
        selectedObject = null;
        currentModalOrigin = null;

        drawGrid();
        updatePropertiesPanel(null);
    }
    // 完整替換此函數
    // 完整替換 createAndLoadNetworkFromXML 函數
    function createAndLoadNetworkFromXML(xmlString, isMerge = false) {
        if (!isMerge) {
            stage.position({ x: 0, y: 0 });
            stage.scale({ x: 1, y: 1 });
            resetWorkspace();
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");

        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("Invalid XML format");
        }

        // 輔助：解析 ID 並更新全域計數器
        const syncIdCounter = (idStr) => {
            if (!idStr) return;
            const parts = idStr.split('_');
            const num = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(num) && num > idCounter) {
                idCounter = num;
            }
        };

        // 輔助：比較兩個 Profile 是否相同 (用於去重)
        const isProfileEqual = (p1, p2) => {
            const epsilon = 0.001;
            return Math.abs(p1.length - p2.length) < epsilon &&
                Math.abs(p1.width - p2.width) < epsilon &&
                Math.abs(p1.maxSpeed - p2.maxSpeed) < epsilon &&
                Math.abs(p1.maxAcceleration - p2.maxAcceleration) < epsilon &&
                Math.abs(p1.comfortDeceleration - p2.comfortDeceleration) < epsilon &&
                Math.abs(p1.minDistance - p2.minDistance) < epsilon &&
                Math.abs(p1.desiredHeadwayTime - p2.desiredHeadwayTime) < epsilon;
        };

        // 輔助：尋找或建立 Profile
        let importedProfileCounter = 0;
        const getOrAddProfile = (newProfileData) => {
            // 1. 檢查現有列表中是否已有相同參數的 Profile
            for (const existingId in network.vehicleProfiles) {
                if (isProfileEqual(network.vehicleProfiles[existingId], newProfileData)) {
                    return existingId; // 找到重複的，回傳既有 ID
                }
            }
            // 2. 沒找到，建立新的
            const newId = `imported_profile_${importedProfileCounter++}`;
            newProfileData.id = newId;
            network.vehicleProfiles[newId] = newProfileData;
            return newId;
        };

        const xmlLinkIdMap = new Map();
        const pendingPairs = new Map();
        const xmlNodeIdMap = new Map();
        const xmlConnIdMap = new Map();
        const xmlNodeDataMap = new Map();

        // [新增] 優先解析全域車種定義
        const globalProfilesContainer = xmlDoc.getElementsByTagName("GlobalVehicleProfiles")[0] || xmlDoc.getElementsByTagName("tm:GlobalVehicleProfiles")[0];
        if (globalProfilesContainer) {
            getChildrenByLocalName(globalProfilesContainer, "VehicleProfile").forEach(profEl => {
                const pId = profEl.getAttribute("id");
                const vehicleEl = getChildrenByLocalName(profEl, "RegularVehicle")[0];
                const driverEl = getChildrenByLocalName(getChildrenByLocalName(vehicleEl, "CompositeDriver")[0], "Parameters")[0];

                if (pId && vehicleEl && driverEl) {
                    network.vehicleProfiles[pId] = {
                        id: pId,
                        length: parseFloat(getChildValue(vehicleEl, "length")),
                        width: parseFloat(getChildValue(vehicleEl, "width")),
                        maxSpeed: parseFloat(getChildValue(driverEl, "maxSpeed")),
                        maxAcceleration: parseFloat(getChildValue(driverEl, "maxAcceleration")),
                        comfortDeceleration: parseFloat(getChildValue(driverEl, "comfortDeceleration")),
                        minDistance: parseFloat(getChildValue(driverEl, "minDistance")),
                        desiredHeadwayTime: parseFloat(getChildValue(driverEl, "desiredHeadwayTime"))
                    };
                }
            });
        }

        // --- 1. Links ---
        const linkElements = xmlDoc.querySelectorAll("RoadNetwork > Links > Link");
        linkElements.forEach(linkEl => {
            const xmlId = getChildValue(linkEl, "id");
            syncIdCounter(xmlId);
            // [新增] 讀取 XML 中的名稱
            const xmlName = getChildValue(linkEl, "name");

            const waypoints = [];
            const wpContainer = getChildrenByLocalName(linkEl, "Waypoints")[0];
            if (wpContainer) {
                getChildrenByLocalName(wpContainer, "Waypoint").forEach(wpEl => {
                    waypoints.push({
                        x: parseFloat(getChildValue(wpEl, "x")),
                        y: parseFloat(getChildValue(wpEl, "y")) * C_SYSTEM_Y_INVERT
                    });
                });
            }

            // --- FIX: 修正車道讀取邏輯 (深入 Segments 尋找並加入車種限制解析) ---
            const importedLanes = [];
            let lanesContainer = null;

            // 嘗試從 Segments -> 第一個 Segment 中尋找 Lanes
            const segmentsContainer = getChildrenByLocalName(linkEl, "Segments")[0];
            if (segmentsContainer) {
                const firstSegment = Array.from(segmentsContainer.children).find(c => c.nodeType === 1);
                if (firstSegment) {
                    lanesContainer = getChildrenByLocalName(firstSegment, "Lanes")[0];
                }
            }
            // Fallback: 嘗試直接從 Link 下尋找
            if (!lanesContainer) {
                lanesContainer = getChildrenByLocalName(linkEl, "Lanes")[0];
            }

            if (lanesContainer) {
                getChildrenByLocalName(lanesContainer, "Lane").forEach(laneEl => {
                    const w = getChildValue(laneEl, "width");
                    const laneData = {
                        width: w ? parseFloat(w) : LANE_WIDTH,
                        allowedVehicleProfiles: []
                    };

                    // [新增] 解析 AllowedVehicles
                    const allowedEl = getChildrenByLocalName(laneEl, "AllowedVehicles")[0];
                    if (allowedEl) {
                        getChildrenByLocalName(allowedEl, "VehicleProfileId").forEach(profEl => {
                            laneData.allowedVehicleProfiles.push(profEl.textContent);
                        });
                    }
                    importedLanes.push(laneData);
                });
            }
            if (importedLanes.length === 0) {
                importedLanes.push({ width: LANE_WIDTH, allowedVehicleProfiles: [] }, { width: LANE_WIDTH, allowedVehicleProfiles: [] });
            }
            // --- END FIX ---

            // 只傳入 width 給 createLink (確保相容性)
            const laneWidths = importedLanes.map(l => l.width);
            const newLink = createLink(waypoints, laneWidths);
            xmlLinkIdMap.set(xmlId, newLink.id);

            // ==========================================
            // [修正] 讀取並覆寫 Lane-based / Parametric 幾何特徵
            // ==========================================
            let geoTypeEl = getChildrenByLocalName(linkEl, "geometryType")[0];
            let strokesContainer = getChildrenByLocalName(linkEl, "Strokes")[0];
            let parametricConfigEl = getChildrenByLocalName(linkEl, "EditorParametricConfig")[0];

            if (!geoTypeEl && wpContainer) {
                geoTypeEl = getChildrenByLocalName(wpContainer, "geometryType")[0];
                strokesContainer = getChildrenByLocalName(wpContainer, "Strokes")[0];
                parametricConfigEl = getChildrenByLocalName(wpContainer, "EditorParametricConfig")[0];
            }

            if (geoTypeEl && geoTypeEl.textContent === 'lane-based') {
                newLink.geometryType = 'lane-based';

                // ★★★ [修復] 如果 XML 包含專屬標籤，自動恢復為 Parametric 模式，並啟用拉桿 UI ★★★
                if (parametricConfigEl) {
                    newLink.geometryType = 'parametric';
                    const lpEl = getChildrenByLocalName(parametricConfigEl, "LeftPocket")[0];
                    const rpEl = getChildrenByLocalName(parametricConfigEl, "RightPocket")[0];
                    newLink.parametricConfig = {
                        throughLanes: parseInt(getChildValue(parametricConfigEl, "throughLanes"), 10) || 1,
                        leftPocket: {
                            exists: lpEl ? lpEl.getAttribute("exists") === "true" : false,
                            lanes: lpEl ? parseInt(lpEl.getAttribute("lanes"), 10) : 1,
                            length: lpEl ? parseFloat(lpEl.getAttribute("length")) : 30,
                            taper: lpEl ? parseFloat(lpEl.getAttribute("taper")) : 15
                        },
                        rightPocket: {
                            exists: rpEl ? rpEl.getAttribute("exists") === "true" : false,
                            lanes: rpEl ? parseInt(rpEl.getAttribute("lanes"), 10) : 1,
                            length: rpEl ? parseFloat(rpEl.getAttribute("length")) : 30,
                            taper: rpEl ? parseFloat(rpEl.getAttribute("taper")) : 15
                        }
                    };
                    // ★ 確保匯入時初始化映射基準，否則調整車道會崩潰
                    newLink.parametricConfig._prevLL = newLink.parametricConfig.leftPocket.exists ? newLink.parametricConfig.leftPocket.lanes : 0;
                    newLink.parametricConfig._prevTL = newLink.parametricConfig.throughLanes;
                    newLink.parametricConfig._prevRL = newLink.parametricConfig.rightPocket.exists ? newLink.parametricConfig.rightPocket.lanes : 0;
                }

                if (strokesContainer) {
                    newLink.strokes = [];
                    getChildrenByLocalName(strokesContainer, "Stroke").forEach(strokeNode => {
                        const sId = strokeNode.getAttribute("id");
                        const sType = strokeNode.getAttribute("type");
                        const pts = [];
                        getChildrenByLocalName(strokeNode, "Point").forEach(pNode => {
                            pts.push({
                                x: parseFloat(getChildValue(pNode, "x")),
                                y: parseFloat(getChildValue(pNode, "y")) * C_SYSTEM_Y_INVERT
                            });
                        });
                        newLink.strokes.push({ id: sId, type: sType, points: pts });
                    });
                }

                let polyLanesContainer = getChildrenByLocalName(linkEl, "PolygonLanes")[0];
                if (!polyLanesContainer && wpContainer) {
                    polyLanesContainer = getChildrenByLocalName(wpContainer, "PolygonLanes")[0];
                }

                if (polyLanesContainer) {
                    getChildrenByLocalName(polyLanesContainer, "PolygonLane").forEach(pLaneNode => {
                        const idx = parseInt(pLaneNode.getAttribute("index"), 10);
                        const leftNode = getChildrenByLocalName(pLaneNode, "LeftBoundary")[0];
                        const rightNode = getChildrenByLocalName(pLaneNode, "RightBoundary")[0];

                        // 安全機制：確保車道存在
                        if (!newLink.lanes[idx]) newLink.lanes[idx] = { width: LANE_WIDTH, allowedVehicleProfiles: [] };
                        if (leftNode) newLink.lanes[idx].leftStrokeId = leftNode.getAttribute("strokeId");
                        if (rightNode) newLink.lanes[idx].rightStrokeId = rightNode.getAttribute("strokeId");
                    });
                }

                drawLink(newLink);
            }
            // [新增] 將剛才讀取到的車種限制掛載到建立好的車道物件上
            newLink.lanes.forEach((lane, idx) => {
                if (importedLanes[idx] && importedLanes[idx].allowedVehicleProfiles.length > 0) {
                    lane.allowedVehicleProfiles = importedLanes[idx].allowedVehicleProfiles;
                }
            });

            // [修改] 將匯入的名稱套用前綴以利識別
            newLink.name = (window.importPrefix || "") + (xmlName || newLink.id);

            const synchroLaneTurnsStr = getChildValue(linkEl, "SynchroLaneTurns");
            if (synchroLaneTurnsStr) {
                newLink.synchroLaneTurns = synchroLaneTurnsStr.split(',').map(s => s.trim()).filter(Boolean);
                drawLink(newLink);
            }

            const pairXmlId = getChildValue(linkEl, "pairLinkId");
            const medianWidthStr = getChildValue(linkEl, "medianWidth");

            if (pairXmlId && medianWidthStr) {
                pendingPairs.set(newLink.id, {
                    pairXmlId: pairXmlId,
                    medianWidth: parseFloat(medianWidthStr)
                });
            }

            // --- 修正開始：RoadSigns 讀取邏輯 ---

            // 1. 嘗試從 Segments -> 第一個 Segment 中尋找 RoadSigns (符合目前的 Export 結構)
            let signsContainer = null;
            const segsContainer = getChildrenByLocalName(linkEl, "Segments")[0];
            if (segsContainer) {
                // 找到第一個 Element 類型的子節點 (即 TrapeziumSegment)
                const firstSeg = Array.from(segsContainer.children).find(c => c.nodeType === 1);
                if (firstSeg) {
                    signsContainer = getChildrenByLocalName(firstSeg, "RoadSigns")[0];
                }
            }

            // 2. Fallback: 如果上面沒找到，嘗試直接從 Link 下層尋找 (相容舊版結構)
            if (!signsContainer) {
                signsContainer = getChildrenByLocalName(linkEl, "RoadSigns")[0];
            }

            // 3. 解析並建立 RoadSigns
            if (signsContainer) {
                Array.from(signsContainer.children).forEach(signNode => {
                    if (signNode.nodeType !== 1) return;

                    const pos = parseFloat(getChildValue(signNode, "position"));

                    const lateralOffsetStr = getChildValue(signNode, "lateralOffset");
                    const lateralOffset = lateralOffsetStr ? parseFloat(lateralOffsetStr) : null;

                    // 【先】判斷 XML 標籤名稱取得類型
                    const tagName = signNode.localName || signNode.nodeName.split(':').pop();
                    let parsedSignType = 'start';
                    if (tagName === 'SpeedLimitSign') parsedSignType = 'start';
                    else if (tagName === 'NoSpeedLimitSign') parsedSignType = 'end';
                    else if (tagName === 'TrafficCone') parsedSignType = 'traffic_cone';

                    // 【再】建立物件 (傳入正確的類型與偏移量，避免預設覆蓋)
                    const newSign = createRoadSign(newLink, pos, lateralOffset, parsedSignType);
                    syncIdCounter(newSign.id);

                    if (parsedSignType === 'start') {
                        const speed = parseFloat(getChildValue(signNode, "speedLimit"));
                        newSign.speedLimit = speed * 3.6;
                    }

                    drawRoadSign(newSign);
                });
            }
            // --- 修正結束 ---
        });

        pendingPairs.forEach((data, currentLinkId) => {
            const currentLink = network.links[currentLinkId];
            const pairInternalId = xmlLinkIdMap.get(data.pairXmlId);

            if (currentLink && pairInternalId && network.links[pairInternalId]) {
                currentLink.pairInfo = {
                    pairId: pairInternalId,
                    medianWidth: data.medianWidth,
                    type: 'linked'
                };
            }
        });

        // --- 2. Nodes ---
        const nodesContainer = xmlDoc.querySelector("RoadNetwork > Nodes");
        if (nodesContainer) {
            Array.from(nodesContainer.children).forEach(nodeEl => {
                const xmlId = getChildValue(nodeEl, "id");
                const tagName = nodeEl.localName || nodeEl.nodeName.split(':').pop();

                if (tagName === 'OriginNode') {
                    const outLinkXmlId = getChildValue(nodeEl, "outgoingLinkId");
                    const internalLinkId = xmlLinkIdMap.get(outLinkXmlId);
                    const link = network.links[internalLinkId];
                    if (link) {
                        const linkLength = getPolylineLength(link.waypoints);
                        const originPosition = Math.min(5, linkLength * 0.1);
                        const origin = createOrigin(link, originPosition);
                        syncIdCounter(origin.id);
                        xmlNodeIdMap.set(xmlId, origin.id);
                    }
                } else if (tagName === 'DestinationNode') {
                    const inLinkXmlId = getChildValue(nodeEl, "incomingLinkId");
                    const internalLinkId = xmlLinkIdMap.get(inLinkXmlId);
                    const link = network.links[internalLinkId];
                    if (link) {
                        const linkLength = getPolylineLength(link.waypoints);
                        const destPosition = Math.max(linkLength - 5, linkLength * 0.9);
                        const dest = createDestination(link, destPosition);
                        syncIdCounter(dest.id);
                        xmlNodeIdMap.set(xmlId, dest.id);
                    }
                } else if (tagName === 'RegularNode') {
                    xmlNodeIdMap.set(xmlId, null);

                    // Synchro Turn Volumes
                    const stvContainer = getChildrenByLocalName(nodeEl, "SynchroTurnVolumes")[0];
                    const synchroTurnVolumes = {};
                    if (stvContainer) {
                        getChildrenByLocalName(stvContainer, "IncomingLink").forEach(inEl => {
                            const xmlFromId = inEl.getAttribute("id");
                            const internalFromId = xmlLinkIdMap.get(xmlFromId);
                            if (internalFromId) {
                                synchroTurnVolumes[internalFromId] = {};
                                getChildrenByLocalName(inEl, "TurnVolume").forEach(tvEl => {
                                    const xmlToId = tvEl.getAttribute("linkId");
                                    const vol = parseFloat(tvEl.getAttribute("volume")) || 0;
                                    const internalToId = xmlLinkIdMap.get(xmlToId);
                                    if (internalToId) {
                                        synchroTurnVolumes[internalFromId][internalToId] = vol;
                                    }
                                });
                            }
                        });
                    }

                    // Turning Ratios
                    const trContainer = getChildrenByLocalName(nodeEl, "TurningRatios")[0];
                    const turningRatios = {};
                    if (trContainer) {
                        getChildrenByLocalName(trContainer, "IncomingLink").forEach(inEl => {
                            const xmlFromId = inEl.getAttribute("id");
                            const internalFromId = xmlLinkIdMap.get(xmlFromId);
                            if (internalFromId) {
                                turningRatios[internalFromId] = {};
                                getChildrenByLocalName(inEl, "TurnTo").forEach(turnEl => {
                                    const xmlToId = turnEl.getAttribute("linkId");
                                    const prob = parseFloat(turnEl.getAttribute("probability"));
                                    const internalToId = xmlLinkIdMap.get(xmlToId);
                                    if (internalToId) {
                                        turningRatios[internalFromId][internalToId] = prob;
                                    }
                                });
                            }
                        });
                    }

                    // TFL Groups
                    // TFL Groups
                    const trGroupsEl = getChildrenByLocalName(nodeEl, "TurnTRGroups")[0];
                    let groupMap = null;
                    if (trGroupsEl) {
                        groupMap = new Map();
                        getChildrenByLocalName(trGroupsEl, "TurnTRGroup").forEach(gEl => {
                            const gId = getChildValue(gEl, "id");
                            const gName = getChildValue(gEl, "name");

                            // [修改] 讀取 type 標籤，如果舊版沒有則依名稱判斷 (P 開頭為行人)
                            const typeEl = getChildrenByLocalName(gEl, "type")[0];
                            const gType = typeEl ? typeEl.textContent : (gName.toUpperCase().startsWith('P') ? 'pedestrian' : 'vehicle');

                            const rulesEl = getChildrenByLocalName(gEl, "TransitionRules")[0];
                            const connIds = [];
                            if (rulesEl) {
                                getChildrenByLocalName(rulesEl, "TransitionRule").forEach(trEl => {
                                    connIds.push(getChildValue(trEl, "transitionRuleId"));
                                });
                            }
                            // 加入 type 屬性
                            groupMap.set(gId, { name: gName, connXmlIds: connIds, type: gType });
                        });
                    }

                    const pedVolStr = getChildValue(nodeEl, "pedestrianVolume");
                    const crossOnceStr = getChildValue(nodeEl, "crossOnceProb");
                    const crossTwiceStr = getChildValue(nodeEl, "crossTwiceProb");

                    // ===== 新增這段：讀取自訂多邊形 =====
                    const polyGeoEl = getChildrenByLocalName(nodeEl, "PolygonGeometry")[0];
                    let customPolygonPoints = null;
                    if (polyGeoEl) {
                        customPolygonPoints = [];
                        getChildrenByLocalName(polyGeoEl, "Point").forEach(pEl => {
                            customPolygonPoints.push(parseFloat(getChildValue(pEl, "x")));
                            customPolygonPoints.push(parseFloat(getChildValue(pEl, "y")) * C_SYSTEM_Y_INVERT);
                        });
                    }
                    // ===================================

                    xmlNodeDataMap.set(xmlId, {
                        groups: groupMap,
                        turningRatios: turningRatios,
                        synchroTurnVolumes: synchroTurnVolumes,
                        pedestrianVolume: pedVolStr ? parseFloat(pedVolStr) : 0,
                        crossOnceProb: crossOnceStr ? parseFloat(crossOnceStr) : 100,
                        crossTwiceProb: crossTwiceStr ? parseFloat(crossTwiceStr) : 0,
                        customPolygonPoints: customPolygonPoints // <--- 新增這行存入 Map
                    });
                }
            });
        }

        // --- 3. Connections ---
        if (nodesContainer) {
            getChildrenByLocalName(nodesContainer, "RegularNode").forEach(nodeEl => {
                const rulesContainer = getChildrenByLocalName(nodeEl, "TransitionRules")[0];
                const xmlRegNodeId = getChildValue(nodeEl, "id");

                if (rulesContainer) {
                    getChildrenByLocalName(rulesContainer, "TransitionRule").forEach(ruleEl => {
                        const srcXmlId = getChildValue(ruleEl, "sourceLinkId");
                        const dstXmlId = getChildValue(ruleEl, "destinationLinkId");
                        const srcLane = parseInt(getChildValue(ruleEl, "sourceLaneIndex"), 10);
                        const dstLane = parseInt(getChildValue(ruleEl, "destinationLaneIndex"), 10);

                        const srcLink = network.links[xmlLinkIdMap.get(srcXmlId)];
                        const dstLink = network.links[xmlLinkIdMap.get(dstXmlId)];

                        if (srcLink && dstLink) {
                            const newConn = handleConnection(
                                { linkId: srcLink.id, laneIndex: srcLane, portType: 'end' },
                                { linkId: dstLink.id, laneIndex: dstLane, portType: 'start' }
                            );

                            if (newConn) {
                                const xmlConnId = getChildValue(ruleEl, "id");
                                xmlConnIdMap.set(xmlConnId, newConn.id);
                                syncIdCounter(newConn.id);

                                if (xmlNodeIdMap.get(xmlRegNodeId) === null) {
                                    xmlNodeIdMap.set(xmlRegNodeId, newConn.nodeId);
                                    syncIdCounter(newConn.nodeId);
                                    const nodeData = xmlNodeDataMap.get(xmlRegNodeId);
                                    if (nodeData) {
                                        const createdNode = network.nodes[newConn.nodeId];
                                        if (createdNode) {
                                            if (nodeData.turningRatios) createdNode.turningRatios = nodeData.turningRatios;
                                            if (nodeData.synchroTurnVolumes && Object.keys(nodeData.synchroTurnVolumes).length > 0) {
                                                createdNode.synchroTurnVolumes = nodeData.synchroTurnVolumes;
                                            }
                                            if (nodeData.pedestrianVolume !== undefined) createdNode.pedestrianVolume = nodeData.pedestrianVolume;
                                            if (nodeData.crossOnceProb !== undefined) createdNode.crossOnceProb = nodeData.crossOnceProb;
                                            if (nodeData.crossTwiceProb !== undefined) createdNode.crossTwiceProb = nodeData.crossTwiceProb;

                                            // ===== 新增這段：把多邊形指派給實體 Node =====
                                            if (nodeData.customPolygonPoints && nodeData.customPolygonPoints.length >= 6) {
                                                createdNode.customPolygonPoints = nodeData.customPolygonPoints;
                                            }
                                            // =============================================
                                        }
                                    }
                                } else {
                                    newConn.nodeId = xmlNodeIdMap.get(xmlRegNodeId);
                                }


                            }
                        }
                    });
                }
            });
        }

        // --- 4. Connection Groups ---
        const groupsToRecreate = new Map();
        if (nodesContainer) {
            getChildrenByLocalName(nodesContainer, "RegularNode").forEach(nodeEl => {
                const rulesContainer = getChildrenByLocalName(nodeEl, "TransitionRules")[0];
                if (rulesContainer) {
                    getChildrenByLocalName(rulesContainer, "TransitionRule").forEach(ruleEl => {
                        const groupIdEl = getChildrenByLocalName(ruleEl, "EditorGroupId")[0];
                        if (groupIdEl) {
                            const groupId = groupIdEl.textContent;
                            const xmlConnId = getChildValue(ruleEl, "id");
                            const internalConnId = xmlConnIdMap.get(xmlConnId);
                            const connection = network.connections[internalConnId];
                            if (connection) {
                                if (!groupsToRecreate.has(groupId)) {
                                    groupsToRecreate.set(groupId, []);
                                }
                                groupsToRecreate.get(groupId).push(connection);
                            }
                        }
                    });
                }
            });
        }

        groupsToRecreate.forEach((connectionsInGroup) => {
            if (connectionsInGroup.length === 0) return;
            const firstConn = connectionsInGroup[0];
            const sourceLink = network.links[firstConn.sourceLinkId];
            const destLink = network.links[firstConn.destLinkId];
            const nodeId = firstConn.nodeId;

            if (!sourceLink || !destLink) return;

            // [修正] 放棄舊版直線邏輯，直接呼叫新版繪圖函數，自動產生平滑群組軌跡
            const connIds = connectionsInGroup.map(c => c.id);
            drawConnectionGroupVisual(sourceLink, destLink, connIds, nodeId);

            connectionsInGroup.forEach(conn => {
                conn.konvaBezier.visible(false); // 隱藏單條車道線
            });
        });

        // --- 5. Agents & Origins (Fix: Deduplicate Profiles) ---
        const agentsEl = xmlDoc.querySelector("Agents");

        if (agentsEl) {
            // Traffic Lights
            const tflNetworks = getChildrenByLocalName(getChildrenByLocalName(agentsEl, "TrafficLightNetworks")[0], "RegularTrafficLightNetwork");
            tflNetworks.forEach(tflEl => {
                const xmlNodeId = getChildValue(tflEl, "regularNodeId");
                const internalNodeId = xmlNodeIdMap.get(xmlNodeId);
                if (!internalNodeId || !network.nodes[internalNodeId]) return;

                const timeShift = parseInt(getChildValue(tflEl, "scheduleTimeShift") || 0, 10);
                const nodeData = xmlNodeDataMap.get(xmlNodeId);
                const groupDefinitions = nodeData ? nodeData.groups : null;
                if (!groupDefinitions) return;

                const tflData = { nodeId: internalNodeId, timeShift, signalGroups: {}, schedule: [] };
                network.trafficLights[internalNodeId] = tflData;

                groupDefinitions.forEach((groupInfo, numericGroupId) => {
                    const groupName = groupInfo.name;
                    const internalConnIds = groupInfo.connXmlIds.map(xmlConnId => xmlConnIdMap.get(xmlConnId)).filter(Boolean);
                    // [修改] 將 type 寫入記憶體
                    tflData.signalGroups[groupName] = { id: groupName, connIds: internalConnIds, type: groupInfo.type };
                });

                // --- 解析舊版 (相容) Schedule ---
                const scheduleEl = getChildrenByLocalName(tflEl, "Schedule")[0];
                const periodsEl = scheduleEl ? getChildrenByLocalName(scheduleEl, "TimePeriods")[0] : null;
                if (periodsEl) {
                    getChildrenByLocalName(periodsEl, "TimePeriod").forEach(periodEl => {
                        const phase = {
                            duration: parseInt(getChildValue(periodEl, "duration"), 10),
                            signals: {}
                        };
                        getChildrenByLocalName(periodEl, "TrafficLightSignal").forEach(signalEl => {
                            const numericLightId = getChildValue(signalEl, "trafficLightId");
                            const groupInfo = groupDefinitions.get(numericLightId);
                            if (groupInfo) {
                                phase.signals[groupInfo.name] = getChildValue(signalEl, "signal");
                            }
                        });
                        tflData.schedule.push(phase);
                    });
                }

                // ----------------------------------------------------
                // 【進階排程讀取】解析 AdvancedScheduling 標籤
                // ----------------------------------------------------
                const advEl = getChildrenByLocalName(tflEl, "AdvancedScheduling")[0];
                if (advEl && advEl.getAttribute("enabled") === "true") {
                    tflData.advanced = { schedules: {}, dailyPlans: {}, weekly: {} };

                    // 0. 解析多套號誌群組 (硬體群組庫 SignalGroupSets)
                    const gsContainerEl = getChildrenByLocalName(advEl, "SignalGroupSets")[0];
                    if (gsContainerEl) {
                        tflData.signalGroupSets = {};
                        const activeGsIdAttr = gsContainerEl.getAttribute("activeGroupSetId");
                        getChildrenByLocalName(gsContainerEl, "SignalGroupSet").forEach(gsEl => {
                            const gsId = gsEl.getAttribute("id");
                            const gsName = gsEl.getAttribute("name") || gsId;
                            const groups = {};
                            getChildrenByLocalName(gsEl, "Group").forEach(gEl => {
                                const gId = gEl.getAttribute("id");
                                const gType = gEl.getAttribute("type") || (gId.toUpperCase().startsWith('P') ? 'pedestrian' : 'vehicle');
                                const connXmlIdsStr = gEl.getAttribute("connXmlIds") || "";
                                const internalConnIds = connXmlIdsStr
                                    .split(',')
                                    .map(s => s.trim())
                                    .filter(Boolean)
                                    .map(xId => xmlConnIdMap.get(xId))
                                    .filter(Boolean);
                                groups[gId] = { id: gId, connIds: internalConnIds, type: gType };
                            });
                            tflData.signalGroupSets[gsId] = { id: gsId, name: gsName, groups };
                        });
                        if (activeGsIdAttr && tflData.signalGroupSets[activeGsIdAttr]) {
                            tflData.activeGroupSetId = activeGsIdAttr;
                        }
                    }
                    ensureTflGroupSets(tflData);

                    // 1. 解析時制庫
                    const schedsEl = getChildrenByLocalName(advEl, "Schedules")[0];
                    if (schedsEl) {
                        getChildrenByLocalName(schedsEl, "ScheduleDef").forEach(sDef => {
                            const sId = sDef.getAttribute("id");
                            const sName = sDef.getAttribute("name");
                            const sGroupSetId = sDef.getAttribute("groupSetId") || tflData.activeGroupSetId || 'GroupSet_1';
                            const sShift = parseInt(sDef.getAttribute("timeShift"), 10) || 0;
                            let phases = [];

                            //[新增] 尋找完美的編輯器存檔
                            const editorMacroEl = getChildrenByLocalName(sDef, "EditorMacroPhases")[0];
                            if (editorMacroEl) {
                                try {
                                    phases = JSON.parse(editorMacroEl.textContent);
                                } catch (e) { console.error("Parse MacroPhases failed", e); }
                            }

                            // Fallback: 如果是舊版檔案，將 Micro-phases 原封不動轉入 (行人補齊結構)
                            if (phases.length === 0) {
                                const phasesEl = getChildrenByLocalName(sDef, "Phases")[0];
                                if (phasesEl) {
                                    getChildrenByLocalName(phasesEl, "Phase").forEach(pEl => {
                                        const duration = parseInt(pEl.getAttribute("duration"), 10);
                                        const signals = {};
                                        getChildrenByLocalName(pEl, "Signal").forEach(sigEl => {
                                            const numericId = sigEl.getAttribute("groupId");
                                            const groupInfo = groupDefinitions.get(numericId);
                                            if (groupInfo) {
                                                const state = sigEl.getAttribute("state");
                                                if (groupInfo.type === 'pedestrian') {
                                                    if (state === 'Green') signals[groupInfo.name] = { walk: duration, flash: 0, stop: 0 };
                                                    else if (state === 'Yellow') signals[groupInfo.name] = { walk: 0, flash: duration, stop: 0 };
                                                    else signals[groupInfo.name] = { walk: 0, flash: 0, stop: duration };
                                                } else {
                                                    signals[groupInfo.name] = state;
                                                }
                                            }
                                        });
                                        phases.push({ duration, signals });
                                    });
                                }
                            }
                            tflData.advanced.schedules[sId] = { id: sId, name: sName, groupSetId: sGroupSetId, timeShift: sShift, phases };
                        });
                    }

                    // 2. 解析日型態
                    const plansEl = getChildrenByLocalName(advEl, "DailyPlans")[0];
                    if (plansEl) {
                        getChildrenByLocalName(plansEl, "Plan").forEach(planEl => {
                            const pId = planEl.getAttribute("id");
                            const pName = planEl.getAttribute("name");
                            const switches = [];
                            getChildrenByLocalName(planEl, "TimeSwitch").forEach(swEl => {
                                switches.push({ time: swEl.getAttribute("time"), schedId: swEl.getAttribute("scheduleId") });
                            });
                            tflData.advanced.dailyPlans[pId] = { id: pId, name: pName, switches };
                        });
                    }

                    // 3. 解析週排程
                    const weeklyEl = getChildrenByLocalName(advEl, "WeeklyAssignment")[0];
                    if (weeklyEl) {
                        getChildrenByLocalName(weeklyEl, "Day").forEach(dayEl => {
                            const day = dayEl.getAttribute("dayOfWeek");
                            const pId = dayEl.getAttribute("planId");
                            tflData.advanced.weekly[day] = pId;
                        });
                    }
                } else {
                    // ----------------------------------------------------
                    // 【向後相容 Migration】如果是讀舊檔，在背景自動升級結構
                    // ----------------------------------------------------
                    tflData.advanced = {
                        schedules: {
                            'Sched_A': {
                                id: 'Sched_A',
                                name: '預設時制[0]',
                                timeShift: tflData.timeShift || 0,
                                phases: JSON.parse(JSON.stringify(tflData.schedule)) // 從剛才讀到的舊排程深拷貝
                            }
                        },
                        dailyPlans: {
                            'Plan_1': { id: 'Plan_1', name: '預設日型態', switches: [{ time: '00:00', schedId: 'Sched_A' }] }
                        },
                        weekly: { 1: 'Plan_1', 2: 'Plan_1', 3: 'Plan_1', 4: 'Plan_1', 5: 'Plan_1', 6: 'Plan_1', 7: 'Plan_1' }
                    };
                    ensureTflGroupSets(tflData);
                }
            });

            // Origins & Vehicle Profiles (With Deduplication)
            const originsContainer = getChildrenByLocalName(agentsEl, "Origins")[0];
            if (originsContainer) {
                getChildrenByLocalName(originsContainer, "Origin").forEach(originEl => {
                    const xmlOriginNodeId = getChildValue(originEl, "originNodeId");
                    const internalOriginId = xmlNodeIdMap.get(xmlOriginNodeId);
                    const origin = network.origins[internalOriginId];
                    if (!origin) return;

                    origin.periods = [];
                    const periodsContainer = getChildrenByLocalName(originEl, "TimePeriods")[0];
                    if (periodsContainer) {
                        getChildrenByLocalName(periodsContainer, "TimePeriod").forEach(periodEl => {
                            const period = {
                                duration: parseInt(getChildValue(periodEl, "duration"), 10),
                                numVehicles: parseInt(getChildValue(periodEl, "numberOfVehicles"), 10),
                                destinations: [],
                                profiles: [],
                                stops: []
                            };

                            // Destinations
                            const destsContainer = getChildrenByLocalName(periodEl, "Destinations")[0];
                            if (destsContainer) {
                                getChildrenByLocalName(destsContainer, "Destination").forEach(destEl => {
                                    const xmlDestNodeId = getChildValue(destEl, "destinationNodeId");
                                    const internalDestId = xmlNodeIdMap.get(xmlDestNodeId);
                                    if (internalDestId) {
                                        period.destinations.push({
                                            nodeId: internalDestId,
                                            weight: parseFloat(getChildValue(destEl, "weight"))
                                        });
                                    }
                                });
                            }

                            // Stops
                            const stopsContainer = getChildrenByLocalName(periodEl, "IntermediateStops")[0];
                            if (stopsContainer) {
                                getChildrenByLocalName(stopsContainer, "Stop").forEach(stopEl => {
                                    const plId = getChildValue(stopEl, "parkingLotId");
                                    const prob = getChildValue(stopEl, "probability");
                                    const dur = getChildValue(stopEl, "duration");
                                    if (plId) {
                                        period.stops.push({
                                            parkingLotId: plId,
                                            probability: parseFloat(prob) || 0,
                                            duration: parseFloat(dur) || 0
                                        });
                                    }
                                });
                            }

                            // Profiles with Deduplication
                            const profilesContainer = getChildrenByLocalName(periodEl, "VehicleProfiles")[0];
                            if (profilesContainer) {
                                getChildrenByLocalName(profilesContainer, "VehicleProfile").forEach(profEl => {
                                    const weight = parseFloat(getChildValue(profEl, "weight"));

                                    const vehicleEl = getChildrenByLocalName(profEl, "RegularVehicle")[0];
                                    const driverEl = getChildrenByLocalName(getChildrenByLocalName(vehicleEl, "CompositeDriver")[0], "Parameters")[0];

                                    const parsedProfileData = {
                                        length: parseFloat(getChildValue(vehicleEl, "length")),
                                        width: parseFloat(getChildValue(vehicleEl, "width")),
                                        maxSpeed: parseFloat(getChildValue(driverEl, "maxSpeed")),
                                        maxAcceleration: parseFloat(getChildValue(driverEl, "maxAcceleration")),
                                        comfortDeceleration: parseFloat(getChildValue(driverEl, "comfortDeceleration")),
                                        minDistance: parseFloat(getChildValue(driverEl, "minDistance")),
                                        desiredHeadwayTime: parseFloat(getChildValue(driverEl, "desiredHeadwayTime")),
                                    };

                                    // 使用去重邏輯取得 ID
                                    const profileId = getOrAddProfile(parsedProfileData);

                                    period.profiles.push({ profileId: profileId, weight: weight });
                                });
                            }
                            origin.periods.push(period);
                        });
                    }
                });
            }
        }

        // 若完全沒有設定 Profile，給一個預設值
        // --- [修改開始] 初始化 Car, Motor, Truck/Bus ---
        if (Object.keys(network.vehicleProfiles).length === 0) {
            network.vehicleProfiles['car'] = {
                id: 'car', length: 4.5, width: 1.8, maxSpeed: 16.67,
                maxAcceleration: 3.0, comfortDeceleration: 2.5, minDistance: 2.5, desiredHeadwayTime: 1.5
            };
            network.vehicleProfiles['motor'] = {
                id: 'motor', length: 2.0, width: 0.8, maxSpeed: 16.67,
                maxAcceleration: 3.5, comfortDeceleration: 3.0, minDistance: 1.0, desiredHeadwayTime: 0.8
            };
            network.vehicleProfiles['Truck/Bus'] = {
                id: 'Truck/Bus', length: 12.0, width: 2.6, maxSpeed: 16.67,
                maxAcceleration: 0.8, comfortDeceleration: 1.0, minDistance: 3.0, desiredHeadwayTime: 3.0
            };
        }
        // --- [修改結束] ---

        // --- 6. Parking Lots ---
        const plContainer = xmlDoc.getElementsByTagName("ParkingLots")[0] || xmlDoc.getElementsByTagName("tm:ParkingLots")[0];
        if (plContainer) {
            getChildrenByLocalName(plContainer, "ParkingLot").forEach(plEl => {
                const id = getChildValue(plEl, "id");
                const name = getChildValue(plEl, "name");
                const carCap = parseInt(getChildValue(plEl, "carCapacity") || 0, 10);
                const motoCap = parseInt(getChildValue(plEl, "motoCapacity") || 0, 10);
                const attrProb = parseFloat(getChildValue(plEl, "attractionProb") || 0);
                const stayDur = parseFloat(getChildValue(plEl, "stayDuration") || 0);
                const points = [];
                const boundEl = getChildrenByLocalName(plEl, "Boundary")[0];
                if (boundEl) {
                    getChildrenByLocalName(boundEl, "Point").forEach(pEl => {
                        points.push(parseFloat(getChildValue(pEl, "x")));
                        points.push(parseFloat(getChildValue(pEl, "y")) * C_SYSTEM_Y_INVERT);
                    });
                }

                if (points.length >= 6) {
                    const newPl = createParkingLot(points, false);
                    newPl.name = (window.importPrefix || "") + name;
                    newPl.carCapacity = carCap;
                    newPl.motoCapacity = motoCap;
                    newPl.attractionProb = attrProb;
                    newPl.stayDuration = stayDur;
                    syncIdCounter(newPl.id);

                    const gatesContainer = getChildrenByLocalName(plEl, "ParkingGates")[0];
                    if (gatesContainer) {
                        const gateNodes = getChildrenByLocalName(gatesContainer, "ParkingGate");
                        gateNodes.forEach(gateEl => {
                            const gId = getChildValue(gateEl, "id");
                            const gType = getChildValue(gateEl, "gateType");
                            const geoEl = getChildrenByLocalName(gateEl, "Geometry")[0];

                            if (geoEl) {
                                const gx = parseFloat(getChildValue(geoEl, "x"));
                                const gy = parseFloat(getChildValue(geoEl, "y")) * C_SYSTEM_Y_INVERT;
                                const gw = parseFloat(getChildValue(geoEl, "width"));
                                const gh = parseFloat(getChildValue(geoEl, "height"));
                                const gr = parseFloat(getChildValue(geoEl, "rotation") || 0);

                                const newGate = createParkingGate({ x: gx, y: gy, width: gw, height: gh, rotation: gr }, gType, gId);
                                syncIdCounter(newGate.id);

                                newGate.parkingLotId = newPl.id;
                                const rectShape = newGate.konvaGroup.findOne('.gate-rect');
                                if (rectShape) rectShape.stroke('green');
                            }
                        });
                    }
                }
            });
        }

        // --- 7. Unlinked Parking Gates ---
        const unlinkedContainer = xmlDoc.getElementsByTagName("UnlinkedParkingGates")[0] || xmlDoc.getElementsByTagName("tm:UnlinkedParkingGates")[0];
        if (unlinkedContainer) {
            const gateNodes = getChildrenByLocalName(unlinkedContainer, "ParkingGate");
            gateNodes.forEach(gateEl => {
                const gId = getChildValue(gateEl, "id");
                const gType = getChildValue(gateEl, "gateType");
                const geoEl = getChildrenByLocalName(gateEl, "Geometry")[0];

                if (geoEl) {
                    const gx = parseFloat(getChildValue(geoEl, "x"));
                    const gy = parseFloat(getChildValue(geoEl, "y")) * C_SYSTEM_Y_INVERT;
                    const gw = parseFloat(getChildValue(geoEl, "width"));
                    const gh = parseFloat(getChildValue(geoEl, "height"));
                    const gr = parseFloat(getChildValue(geoEl, "rotation") || 0);

                    const newGate = createParkingGate({ x: gx, y: gy, width: gw, height: gh, rotation: gr }, gType, gId);
                    syncIdCounter(newGate.id);
                }
            });
        }

        // --- 8. Meters ---
        const metersContainer = xmlDoc.querySelector("Meters");
        if (metersContainer) {
            Array.from(metersContainer.children).forEach(meterEl => {
                const tagName = meterEl.localName || meterEl.nodeName.split(':').pop();
                const linkXmlId = getChildValue(meterEl, "linkId");
                const link = network.links[xmlLinkIdMap.get(linkXmlId)];
                if (!link) return;

                const pos = parseFloat(getChildValue(meterEl, "position"));
                const name = getChildValue(meterEl, "name");

                // [讀取 Flow Mode 屬性]
                const flowVal = parseFloat(getChildValue(meterEl, "observedFlow"));
                const isSrcVal = getChildValue(meterEl, "isSource") === 'true';

                // [新增] 解析 SpawnProfiles (支援多車種權重)
                const spawnProfiles = [];

                // 1. 嘗試讀取新的列表結構
                let spListEl = getChildrenByLocalName(meterEl, "SpawnProfiles")[0];
                if (spListEl) {
                    getChildrenByLocalName(spListEl, "ProfileEntry").forEach(entry => {
                        const pId = getChildValue(entry, "profileId");
                        const w = parseFloat(getChildValue(entry, "weight"));
                        if (pId) {
                            spawnProfiles.push({ profileId: pId, weight: w || 1.0 });
                        }
                    });
                }

                // 2. 兼容舊版 XML (如果沒有列表，但有舊的單一 ID)
                const oldPid = getChildValue(meterEl, "spawnProfileId");
                if (spawnProfiles.length === 0 && oldPid) {
                    spawnProfiles.push({ profileId: oldPid, weight: 1.0 });
                }

                // [建立物件並賦值]
                if (tagName === 'LinkAverageTravelSpeedMeter') {
                    const det = createDetector('PointDetector', link, pos);
                    det.name = (window.importPrefix || "") + name;
                    det.observedFlow = !isNaN(flowVal) ? flowVal : 0;
                    det.isSource = isSrcVal;
                    det.spawnProfiles = spawnProfiles; // <--- 將解析出的列表存入物件
                    syncIdCounter(det.id);
                } else if (tagName === 'SectionAverageTravelSpeedMeter') {
                    const len = parseFloat(getChildValue(meterEl, "sectionLength"));
                    const det = createDetector('SectionDetector', link, pos + len);
                    det.name = (window.importPrefix || "") + name;
                    det.length = len;
                    det.observedFlow = !isNaN(flowVal) ? flowVal : 0;
                    det.isSource = isSrcVal;
                    det.spawnProfiles = spawnProfiles; // <--- 將解析出的列表存入物件
                    syncIdCounter(det.id);
                    drawDetector(det);
                }
            });
        }

        // --- 9. Background ---
        const bgContainer = xmlDoc.querySelector("Background") || xmlDoc.getElementsByTagName("tm:Background")[0];
        if (bgContainer) {
            // 抓出所有的 Tile，包含多張背景
            getChildrenByLocalName(bgContainer, "Tile").forEach(bgEl => {
                try {
                    const rectEl = getChildrenByLocalName(bgEl, "Rectangle")[0];
                    const startEl = getChildrenByLocalName(rectEl, "Start")[0];
                    const endEl = getChildrenByLocalName(rectEl, "End")[0];
                    const startX = parseFloat(getChildValue(startEl, "x"));
                    const startY = parseFloat(getChildValue(startEl, "y")) * C_SYSTEM_Y_INVERT;
                    const endX = parseFloat(getChildValue(endEl, "x"));
                    const endY = parseFloat(getChildValue(endEl, "y")) * C_SYSTEM_Y_INVERT;
                    const saturation = parseInt(getChildValue(bgEl, "saturation"), 10);

                    const lockedStr = getChildValue(bgEl, "locked");
                    const isLocked = lockedStr === 'true'; // 向後相容，沒有該標籤視為 false

                    const imgEl = getChildrenByLocalName(bgEl, "Image")[0];
                    if (!imgEl) return;

                    const imageType = getChildValue(imgEl, "type");
                    const binaryData = getChildValue(imgEl, "binaryData");
                    const dataUrl = `data:image/${imageType.toLowerCase()};base64,${binaryData}`;

                    const newBg = createBackground({ x: startX, y: startY });
                    newBg.name = (window.importPrefix || "") + `Imported Map ${idCounter}`;
                    if (newBg) {
                        newBg.locked = isLocked;
                        newBg.konvaGroup.draggable(!isLocked); // 載入鎖定狀態

                        newBg.width = Math.abs(endX - startX);
                        newBg.height = Math.abs(endY - startY);
                        newBg.opacity = saturation || 50;
                        newBg.imageDataUrl = dataUrl;
                        newBg.imageType = imageType;

                        const image = new window.Image();
                        image.src = dataUrl;
                        image.onload = () => {
                            newBg.konvaImage.image(image);
                            const scale = (image.width > 0) ? newBg.width / image.width : 1;
                            newBg.scale = scale;
                            newBg.konvaGroup.width(image.width);
                            newBg.konvaGroup.height(image.height);
                            newBg.konvaGroup.scale({ x: scale, y: scale });
                            newBg.konvaGroup.opacity(newBg.opacity / 100);
                            newBg.konvaImage.width(image.width);
                            newBg.konvaImage.height(image.height);
                            newBg.konvaBorder.width(image.width);
                            newBg.konvaBorder.height(image.height);
                            layer.batchDraw();
                        };
                    }
                } catch (err) {
                    console.error("Failed to parse background from XML:", err);
                }
            });
        }

        // --- 10. GeoAnchors ---
        const anchorsContainer = xmlDoc.getElementsByTagName("GeoAnchors")[0] || xmlDoc.getElementsByTagName("tm:GeoAnchors")[0];
        if (anchorsContainer) {
            getChildrenByLocalName(anchorsContainer, "Anchor").forEach(anchorEl => {
                const ax = parseFloat(getChildValue(anchorEl, "x"));
                const ay = parseFloat(getChildValue(anchorEl, "y")) * C_SYSTEM_Y_INVERT;
                const lat = parseFloat(getChildValue(anchorEl, "lat"));
                const lon = parseFloat(getChildValue(anchorEl, "lon"));
                createPushpin({ x: ax, y: ay }, lat, lon);
            });
        }

        // --- 11. Overpasses ---
        updateAllOverpasses();
        const overpassesContainer = xmlDoc.getElementsByTagName("Overpasses")[0] || xmlDoc.getElementsByTagName("tm:Overpasses")[0];
        if (overpassesContainer) {
            const opNodes = getChildrenByLocalName(overpassesContainer, "Overpass");
            opNodes.forEach(opEl => {
                const pairsEl = getChildrenByLocalName(opEl, "ElementaryPairs")[0];
                const elementsEl = getChildrenByLocalName(opEl, "Elements")[0];
                if (pairsEl && elementsEl) {
                    const pair = getChildrenByLocalName(pairsEl, "Pair")[0];
                    const topTempId = getChildValue(pair, "Top");

                    const els = getChildrenByLocalName(elementsEl, "Element");
                    let topXmlLinkId = null;
                    let bottomXmlLinkId = null;

                    els.forEach(el => {
                        const tempId = getChildValue(el, "Id");
                        const lnk = getChildValue(el, "LinkId");
                        if (tempId === topTempId) topXmlLinkId = lnk;
                        else bottomXmlLinkId = lnk;
                    });

                    if (topXmlLinkId && bottomXmlLinkId) {
                        const topInternalId = xmlLinkIdMap.get(topXmlLinkId);
                        const bottomInternalId = xmlLinkIdMap.get(bottomXmlLinkId);

                        const opId1 = `overpass_${bottomInternalId}_${topInternalId}`;
                        const opId2 = `overpass_${topInternalId}_${bottomInternalId}`;
                        const opObj = network.overpasses[opId1] || network.overpasses[opId2];
                        if (opObj) {
                            opObj.topLinkId = topInternalId;
                            applyOverpassOrder(opObj);
                        }
                    }
                }
            });
        }

        // --- 12. ModelParameters ---
        const paramsEl = xmlDoc.getElementsByTagName("ModelParameters")[0] || xmlDoc.getElementsByTagName("tm:ModelParameters")[0];
        if (paramsEl) {
            const mode = getChildValue(paramsEl, "NavigationMode");
            if (mode) {
                network.navigationMode = mode;
                // [修正] 移除 UI 同步代碼，因為下拉選單已移除
                // const modeSelect = document.getElementById('simulationModeSelect');
                // if (modeSelect) {
                //     modeSelect.value = (mode === 'FLOW_BASED') ? 'flow_turning' : 'od_path';
                // }
            }
        }

        // --- 13. Road Markings (Modified for IsFree & Two-Stage & Channelization) ---
        const markingsContainer = xmlDoc.getElementsByTagName("RoadMarkings")[0] || xmlDoc.getElementsByTagName("tm:RoadMarkings")[0];
        if (markingsContainer) {
            getChildrenByLocalName(markingsContainer, "RoadMarking").forEach(mkEl => {
                const type = getChildValue(mkEl, "type");
                const linkXmlId = getChildValue(mkEl, "linkId");
                const nodeXmlId = getChildValue(mkEl, "nodeId");

                let parentObj = null;
                let posOrPosObj = 0;

                // 1. 決定 Parent 與初始參數 (加入槽化線處理)
                if (type === 'channelization') {
                    const points = [];
                    const boundEl = getChildrenByLocalName(mkEl, "Boundary")[0];
                    if (boundEl) {
                        getChildrenByLocalName(boundEl, "Point").forEach(pEl => {
                            points.push(parseFloat(getChildValue(pEl, "x")));
                            points.push(parseFloat(getChildValue(pEl, "y")) * C_SYSTEM_Y_INVERT);
                        });
                    }
                    posOrPosObj = points; // 將解析好的多邊形座標陣列傳入
                } else if (linkXmlId) {
                    const internalLinkId = xmlLinkIdMap.get(linkXmlId);
                    parentObj = network.links[internalLinkId];
                    posOrPosObj = parseFloat(getChildValue(mkEl, "position"));
                } else if (nodeXmlId) {
                    // Node 模式：嘗試用座標尋找最近的 Node
                    const targetX = parseFloat(getChildValue(mkEl, "x"));
                    const targetY = parseFloat(getChildValue(mkEl, "y")) * C_SYSTEM_Y_INVERT;

                    let minDist = Infinity;
                    Object.values(network.nodes).forEach(n => {
                        const d = Math.sqrt(Math.pow(n.x - targetX, 2) + Math.pow(n.y - targetY, 2));
                        if (d < minDist) { minDist = d; parentObj = n; }
                    });

                    posOrPosObj = { x: targetX, y: targetY };
                }

                // 2. 建立物件
                if (parentObj || type === 'channelization') {
                    const newMark = createRoadMarking(type, parentObj, posOrPosObj);

                    // 槽化線獨有屬性：顏色
                    if (type === 'channelization') {
                        const colorVal = getChildValue(mkEl, "color");
                        if (colorVal) newMark.color = colorVal;
                    }

                    const spanVal = getChildValue(mkEl, "spanToLinkId");
                    if (spanVal) {
                        const internalSpanId = xmlLinkIdMap.get(spanVal);
                        if (internalSpanId) newMark.spanToLinkId = internalSpanId;
                    }

                    // 解析行人號誌綁定
                    const sigGrpVal = getChildValue(mkEl, "signalGroupId");
                    if (sigGrpVal) {
                        newMark.signalGroupId = sigGrpVal;
                    }
                    const sigGrpBySetVal = getChildValue(mkEl, "signalGroupBySet");
                    if (sigGrpBySetVal) {
                        try {
                            newMark.signalGroupBySet = JSON.parse(sigGrpBySetVal);
                        } catch (e) { }
                    }

                    const lanesStr = getChildValue(mkEl, "laneIndices");
                    if (lanesStr) {
                        newMark.laneIndices = lanesStr.split(',').map(Number);
                    }

                    const lenVal = getChildValue(mkEl, "length");
                    if (lenVal) newMark.length = parseFloat(lenVal);

                    const widVal = getChildValue(mkEl, "width");
                    if (widVal) newMark.width = parseFloat(widVal);

                    // 4. 處理 IsFree 與絕對座標定位 (槽化線不需要處理傳統 x, y, rotation)
                    const isFreeVal = getChildValue(mkEl, "isFree");
                    const xVal = getChildValue(mkEl, "x");
                    const yVal = getChildValue(mkEl, "y");
                    const rotVal = getChildValue(mkEl, "rotation");

                    if (isFreeVal === 'true' || (type === 'two_stage_box' && linkXmlId)) {
                        if (isFreeVal === 'true') {
                            newMark.isFree = true;
                        }

                        // 強制套用絕對座標 (避開槽化線)
                        if (xVal && yVal && type !== 'channelization') {
                            newMark.x = parseFloat(xVal);
                            newMark.y = parseFloat(yVal) * C_SYSTEM_Y_INVERT;
                            newMark.konvaGroup.position({ x: newMark.x, y: newMark.y });
                        }

                        if (rotVal && type !== 'channelization') {
                            newMark.rotation = parseFloat(rotVal);
                            newMark.konvaGroup.rotation(newMark.rotation);
                        }
                    } else if (nodeXmlId && rotVal && type !== 'channelization') {
                        // Node 模式的旋轉
                        newMark.rotation = parseFloat(rotVal);
                        newMark.konvaGroup.rotation(newMark.rotation);
                    }

                    // 5. 重繪
                    drawRoadMarking(newMark);
                    syncIdCounter(newMark.id);
                }
            });
        }

        // --- 10. Land Use Zones ---
        const zonesContainer = xmlDoc.getElementsByTagName("LandUseZones")[0] || xmlDoc.getElementsByTagName("tm:LandUseZones")[0];
        if (zonesContainer) {
            getChildrenByLocalName(zonesContainer, "Zone").forEach(zoneEl => {
                const id = getChildValue(zoneEl, "id");
                const name = getChildValue(zoneEl, "name");
                const zoneType = getChildValue(zoneEl, "zoneType") || 'R1';

                let bcr = null, far = null, customPop = null, customEmp = null, autoCalculateTraffic = true;
                const paramEl = getChildrenByLocalName(zoneEl, "parameters")[0];
                if (paramEl) {
                    const bcrStr = getChildValue(paramEl, "bcr");
                    const farStr = getChildValue(paramEl, "far");
                    const popStr = getChildValue(paramEl, "customPop");
                    const empStr = getChildValue(paramEl, "customEmp");
                    const autoStr = getChildValue(paramEl, "autoCalculateTraffic");
                    if (bcrStr !== null && bcrStr !== '') bcr = parseFloat(bcrStr);
                    if (farStr !== null && farStr !== '') far = parseFloat(farStr);
                    if (popStr !== null && popStr !== '' && popStr !== 'null') customPop = parseFloat(popStr);
                    if (empStr !== null && empStr !== '' && empStr !== 'null') customEmp = parseFloat(empStr);
                    if (autoStr !== null && autoStr !== '') autoCalculateTraffic = (autoStr === 'true');
                }

                const points = [];
                const boundEl = getChildrenByLocalName(zoneEl, "Boundary")[0];
                if (boundEl) {
                    getChildrenByLocalName(boundEl, "Point").forEach(pEl => {
                        points.push(parseFloat(getChildValue(pEl, "x")));
                        points.push(parseFloat(getChildValue(pEl, "y")) * C_SYSTEM_Y_INVERT);
                    });
                }

                if (points.length >= 6) {
                    const newZone = createZone(points, false, id);
                    if (newZone) {
                        newZone.name = (window.importPrefix || "") + (name || newZone.name);
                        newZone.zoneType = zoneType;
                        if (bcr !== null && !isNaN(bcr)) newZone.bcr = bcr;
                        if (far !== null && !isNaN(far)) newZone.far = far;
                        newZone.customPop = customPop;
                        newZone.customEmp = customEmp;
                        newZone.autoCalculateTraffic = autoCalculateTraffic;
                        syncIdCounter(newZone.id);

                        // Connectors (if present)
                        const connContainer = getChildrenByLocalName(zoneEl, "Connectors")[0];
                        if (connContainer) {
                            getChildrenByLocalName(connContainer, "Connector").forEach(cEl => {
                                const cId = getChildValue(cEl, "id");
                                const targetLinkId = getChildValue(cEl, "targetLinkId");
                                const offsetRatio = parseFloat(getChildValue(cEl, "offsetRatio") || 0.5);
                                const gateType = getChildValue(cEl, "gateType") || 'bidirectional';
                                const accessX = parseFloat(getChildValue(cEl, "accessX") || 0);
                                const accessY = parseFloat(getChildValue(cEl, "accessY") || 0) * C_SYSTEM_Y_INVERT;
                                newZone.accessNodes.push({
                                    id: cId,
                                    linkId: targetLinkId,
                                    offsetRatio,
                                    gateType,
                                    accessPoint: { x: accessX, y: accessY }
                                });
                            });
                        }

                        // ★ [Milestone 3] 若 XML 未包含 Connectors，自動投影最近道路建立聯絡道
                        if (!newZone.accessNodes || newZone.accessNodes.length === 0) {
                            autoGenerateCentroidConnectors(newZone);
                        }
                        updateZoneVisuals(newZone, false);
                    }
                }
            });
        }

        layer.batchDraw();
        updateStatusBar();
        setTool('select');
    }

    // 完整替換此函數
    // 完整替換 exportXML 函數
    // --- [修改] 重構 exportXML ---

    // 1. 新增此函數 (內容是原本 exportXML 的邏輯，但最後改為 return xml)
    /**
     * [新增] 將 UI 上的「巨觀分相 (Macro-Phases)」編譯為模擬器底層需要的「微觀步階 (Micro-Phases)」
     * 當行人和車道時間不一致時，會自動在時間軸上切割出新的陣列元素。
     */
    function compileMacroPhasesToMicro(macroPhases, groupDefinitions) {
        const microPhases = [];

        macroPhases.forEach(macro => {
            const dur = macro.duration;
            // 尋找該分相內所有狀態改變的時間邊界點 (Time Boundaries)
            const boundaries = new Set([0, dur]);

            Object.entries(macro.signals).forEach(([gId, state]) => {
                const groupInfo = groupDefinitions[gId];
                if (groupInfo && groupInfo.type === 'pedestrian' && typeof state === 'object') {
                    if (state.walk > 0 && state.walk < dur) boundaries.add(state.walk);
                    if (state.walk + state.flash > 0 && state.walk + state.flash < dur) boundaries.add(state.walk + state.flash);
                }
            });

            // 排序邊界點
            const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

            // 根據邊界點切割出微觀步階
            for (let i = 0; i < sortedBoundaries.length - 1; i++) {
                const start = sortedBoundaries[i];
                const end = sortedBoundaries[i + 1];
                const microDur = end - start;
                if (microDur <= 0) continue;

                const microSignals = {};
                Object.entries(macro.signals).forEach(([gId, state]) => {
                    const groupInfo = groupDefinitions[gId];
                    if (!groupInfo) return;

                    if (groupInfo.type === 'pedestrian' && typeof state === 'object') {
                        const mid = start + (microDur / 2.0); // 採樣區間中點以判定狀態
                        if (mid < state.walk) microSignals[gId] = 'Green';
                        else if (mid < state.walk + state.flash) microSignals[gId] = 'Yellow'; // 模擬器通常用 Yellow 代表閃爍
                        else microSignals[gId] = 'Red';
                    } else {
                        microSignals[gId] = (typeof state === 'string') ? state : 'Red';
                    }
                });
                microPhases.push({ duration: microDur, signals: microSignals });
            }
        });
        return microPhases;
    }

    function serializeNetworkToXML() {
        const tflGroupMappings = {};
        const linkIdMap = new Map(), regularNodeIdMap = new Map(), originNodeIdMap = new Map(),
            destinationNodeIdMap = new Map(), connIdMap = new Map(), detectorIdMap = new Map();

        let linkCounter = 0, nodeCounter = 0, connCounter = 0, detectorCounter = 0;

        // 建立 ID 對照表 (將內部 String ID 轉為 XML 需要的整數 ID)
        Object.keys(network.links).forEach(id => linkIdMap.set(id, linkCounter++));
        Object.keys(network.connections).forEach(id => connIdMap.set(id, connCounter++));
        Object.keys(network.nodes).forEach(id => regularNodeIdMap.set(id, nodeCounter++));
        Object.keys(network.origins).forEach(id => originNodeIdMap.set(id, nodeCounter++));
        Object.keys(network.destinations).forEach(id => destinationNodeIdMap.set(id, nodeCounter++));
        Object.keys(network.detectors).forEach(id => detectorIdMap.set(id, detectorCounter++));

        // 建立 Connection Group 的反向查找表
        const connToGroupIdMap = new Map();
        layer.find('.group-connection-visual').forEach((groupLine, index) => {
            const meta = groupLine.getAttr('meta');
            if (meta && meta.type === 'ConnectionGroup' && meta.connectionIds) {
                const groupId = `editor_group_${index}`;
                meta.connectionIds.forEach(connId => {
                    connToGroupIdMap.set(connId, groupId);
                });
            }
        });

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<tm:TrafficModel parserVersion="1.2" xmlns:tm="TrafficModelDefinitionFile0.1">\n`;

        // --- 1. Global Parameters ---
        xml += `  <tm:ModelParameters>\n`;
        xml += `    <tm:randomSeed>${Math.floor(Math.random() * 100000)}</tm:randomSeed>\n`;
        xml += `    <tm:immutableVehiclesPercent>70</tm:immutableVehiclesPercent>\n`;
        // [修正] 確保匯出模式，若無指定則預設為 HYBRID
        xml += `    <tm:NavigationMode>${network.navigationMode || 'HYBRID'}</tm:NavigationMode>\n`;
        xml += `  </tm:ModelParameters>\n`;

        // [新增] 匯出全域車種定義 (確保 Flow Mode 參照的車種存在)
        if (network.vehicleProfiles && Object.keys(network.vehicleProfiles).length > 0) {
            xml += '  <tm:GlobalVehicleProfiles>\n';
            Object.values(network.vehicleProfiles).forEach(prof => {
                xml += `    <tm:VehicleProfile id="${prof.id}">\n`;
                xml += `      <tm:RegularVehicle>\n`;
                xml += `        <tm:length>${prof.length}</tm:length><tm:width>${prof.width}</tm:width>\n`;
                xml += `        <tm:CompositeDriver><tm:Parameters>\n`;
                xml += `          <tm:maxSpeed>${prof.params?.maxSpeed || prof.maxSpeed}</tm:maxSpeed>\n`;
                xml += `          <tm:maxAcceleration>${prof.params?.maxAcceleration || prof.maxAcceleration}</tm:maxAcceleration>\n`;
                xml += `          <tm:comfortDeceleration>${prof.params?.comfortDeceleration || prof.comfortDeceleration}</tm:comfortDeceleration>\n`;
                xml += `          <tm:minDistance>${prof.params?.minDistance || prof.minDistance}</tm:minDistance>\n`;
                xml += `          <tm:desiredHeadwayTime>${prof.params?.desiredHeadwayTime || prof.desiredHeadwayTime}</tm:desiredHeadwayTime>\n`;
                xml += `        </tm:Parameters></tm:CompositeDriver>\n`;
                xml += `      </tm:RegularVehicle>\n`;
                xml += `    </tm:VehicleProfile>\n`;
            });
            xml += '  </tm:GlobalVehicleProfiles>\n';
        }

        xml += '  <tm:RoadNetwork>\n';

        // --- 2. Links ---
        xml += '    <tm:Links>\n';
        for (const link of Object.values(network.links)) {
            const numericId = linkIdMap.get(link.id);
            if (numericId === undefined) continue;
            xml += `      <tm:Link>\n`;
            xml += `        <tm:id>${numericId}</tm:id>\n`;
            // [新增] 匯出名稱，如果沒有則使用 ID
            xml += `        <tm:name>${link.name || link.id}</tm:name>\n`;

            let sourceNodeId = -1, destNodeId = -1;
            const sourceOrigin = Object.values(network.origins).find(o => o.linkId === link.id);
            if (sourceOrigin) sourceNodeId = originNodeIdMap.get(sourceOrigin.id);
            else { const rsn = Object.values(network.nodes).find(n => n.outgoingLinkIds.has(link.id)); if (rsn) sourceNodeId = regularNodeIdMap.get(rsn.id); }

            const destDestination = Object.values(network.destinations).find(d => d.linkId === link.id);
            if (destDestination) destNodeId = destinationNodeIdMap.get(destDestination.id);
            else { const ren = Object.values(network.nodes).find(n => n.incomingLinkIds.has(link.id)); if (ren) destNodeId = regularNodeIdMap.get(ren.id); }

            xml += `        <tm:sourceNodeId>${sourceNodeId !== undefined ? sourceNodeId : -1}</tm:sourceNodeId>\n`;
            xml += `        <tm:destinationNodeId>${destNodeId !== undefined ? destNodeId : -1}</tm:destinationNodeId>\n`;

            const linkLength = getPolylineLength(link.waypoints);
            xml += `        <tm:length>${linkLength.toFixed(4)}</tm:length>\n`;

            const signsOnLink = Object.values(network.roadSigns).filter(s => s.linkId === link.id);

            xml += '        <tm:Segments>\n';
            xml += `          <tm:TrapeziumSegment>\n`;
            xml += `             <tm:id>0</tm:id><tm:length>${linkLength.toFixed(4)}</tm:length><tm:prevSegmentId>-1</tm:prevSegmentId><tm:nextSegmentId>-1</tm:nextSegmentId><tm:startWaypointId>0</tm:startWaypointId><tm:endWaypointId>${link.waypoints.length - 1}</tm:endWaypointId>\n`;

            xml += '            <tm:Lanes>\n';
            for (let j = 0; j < link.lanes.length; j++) {
                const lane = link.lanes[j];
                xml += `              <tm:Lane>\n`;
                xml += `                <tm:index>${j}</tm:index>\n`;
                xml += `                <tm:length>${linkLength.toFixed(4)}</tm:length>\n`;
                xml += `                <tm:width>${lane.width.toFixed(2)}</tm:width>\n`;
                xml += `                <tm:prevLaneIndex>-1</tm:prevLaneIndex>\n`;
                xml += `                <tm:nextLaneIndex>-1</tm:nextLaneIndex>\n`;

                // [新增] 如果有設定車種限制，則匯出 AllowedVehicles
                if (lane.allowedVehicleProfiles && lane.allowedVehicleProfiles.length > 0) {
                    xml += `                <tm:AllowedVehicles>\n`;
                    lane.allowedVehicleProfiles.forEach(prof => {
                        xml += `                  <tm:VehicleProfileId>${prof}</tm:VehicleProfileId>\n`;
                    });
                    xml += `                </tm:AllowedVehicles>\n`;
                }
                xml += `              </tm:Lane>\n`;
            }
            xml += '            </tm:Lanes>\n';

            if (signsOnLink.length > 0) {
                xml += '            <tm:RoadSigns>\n';
                signsOnLink.forEach(sign => {
                    if (sign.signType === 'start') {
                        xml += '              <tm:SpeedLimitSign>\n';
                        xml += `                <tm:position>${sign.position.toFixed(4)}</tm:position>\n`;
                        xml += `                <tm:speedLimit>${(sign.speedLimit / 3.6).toFixed(4)}</tm:speedLimit>\n`; // km/h to m/s
                        xml += '                <tm:side>Left</tm:side>\n';
                        xml += '              </tm:SpeedLimitSign>\n';
                    } else if (sign.signType === 'end') {
                        xml += '              <tm:NoSpeedLimitSign>\n';
                        xml += `                <tm:position>${sign.position.toFixed(4)}</tm:position>\n`;
                        xml += '                <tm:side>Left</tm:side>\n';
                        xml += '              </tm:NoSpeedLimitSign>\n';
                    } else if (sign.signType === 'traffic_cone') {
                        // 新增交通錐的獨立標籤
                        xml += '              <tm:TrafficCone>\n';
                        xml += `                <tm:position>${sign.position.toFixed(4)}</tm:position>\n`;
                        xml += `                <tm:lateralOffset>${(sign.lateralOffset || 0).toFixed(4)}</tm:lateralOffset>\n`;
                        xml += '              </tm:TrafficCone>\n';
                    }
                });
                xml += '            </tm:RoadSigns>\n';
            }

            const p_start = link.waypoints[0];
            const p_end = link.waypoints[link.waypoints.length - 1];
            const start_normal = getNormal(normalize(getVector(p_start, link.waypoints[1])));
            const end_normal = getNormal(normalize(getVector(link.waypoints[link.waypoints.length - 2], p_end)));
            const halfWidth = getLinkTotalWidth(link) / 2;
            const ls = add(p_start, scale(start_normal, halfWidth));
            const rs = add(p_start, scale(start_normal, -halfWidth));
            const le = add(p_end, scale(end_normal, halfWidth));
            const re = add(p_end, scale(end_normal, -halfWidth));

            xml += `            <tm:trapeziumShift>0</tm:trapeziumShift>\n`;
            xml += '            <tm:TrapeziumGeometry>\n';
            xml += `              <tm:LeftSide><tm:Start><tm:x>${ls.x.toFixed(4)}</tm:x><tm:y>${(ls.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Start><tm:End><tm:x>${le.x.toFixed(4)}</tm:x><tm:y>${(le.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:End></tm:LeftSide>\n`;
            xml += `              <tm:RightSide><tm:Start><tm:x>${rs.x.toFixed(4)}</tm:x><tm:y>${(rs.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Start><tm:End><tm:x>${re.x.toFixed(4)}</tm:x><tm:y>${(re.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:End></tm:RightSide>\n`;
            xml += '            </tm:TrapeziumGeometry>\n';
            xml += `          </tm:TrapeziumSegment>\n`;
            xml += '        </tm:Segments>\n';

            // 輸出中心線座標
            xml += '        <tm:Waypoints>\n';
            link.waypoints.forEach((wp, index) => { xml += `          <tm:Waypoint><tm:id>${index}</tm:id><tm:x>${wp.x.toFixed(4)}</tm:x><tm:y>${(wp.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Waypoint>\n`; });
            // [修正] 提早關閉 Waypoints 標籤，不要把其他屬性包進去
            xml += '        </tm:Waypoints>\n';

            if (link.synchroLaneTurns && Array.isArray(link.synchroLaneTurns) && link.synchroLaneTurns.length > 0) {
                xml += `        <tm:SynchroLaneTurns>${link.synchroLaneTurns.join(',')}</tm:SynchroLaneTurns>\n`;
            }

            if (link.pairInfo) {
                const pairXmlId = linkIdMap.get(link.pairInfo.pairId);
                if (pairXmlId !== undefined) {
                    xml += `        <tm:pairLinkId>${pairXmlId}</tm:pairLinkId>\n`;
                    xml += `        <tm:medianWidth>${link.pairInfo.medianWidth}</tm:medianWidth>\n`;
                }
            }

            if (link.geometryType === 'lane-based' || link.geometryType === 'parametric') {
                // 模擬器只認識 lane-based
                xml += `        <tm:geometryType>lane-based</tm:geometryType>\n`;

                // ★★★ [修復] 將 Parametric 拉桿設定存為編輯器專屬標籤，以利下次讀取時恢復 UI ★★★
                if (link.geometryType === 'parametric' && link.parametricConfig) {
                    const c = link.parametricConfig;
                    xml += `        <tm:EditorParametricConfig>\n`;
                    xml += `          <tm:throughLanes>${c.throughLanes}</tm:throughLanes>\n`;
                    xml += `          <tm:LeftPocket exists="${c.leftPocket.exists}" lanes="${c.leftPocket.lanes}" length="${c.leftPocket.length}" taper="${c.leftPocket.taper}" />\n`;
                    xml += `          <tm:RightPocket exists="${c.rightPocket.exists}" lanes="${c.rightPocket.lanes}" length="${c.rightPocket.length}" taper="${c.rightPocket.taper}" />\n`;
                    xml += `        </tm:EditorParametricConfig>\n`;
                }

                xml += `        <tm:Strokes>\n`;
                link.strokes.forEach((stroke) => {
                    // ★★★ [修復] 匯出真實的 stroke.id，解決模擬器讀取不到標線的崩潰問題 ★★★
                    xml += `          <tm:Stroke id="${stroke.id}" type="${stroke.type}">\n`;
                    stroke.points.forEach(p => {
                        xml += `            <tm:Point><tm:x>${p.x.toFixed(4)}</tm:x><tm:y>${(p.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`;
                    });
                    xml += `          </tm:Stroke>\n`;
                });
                xml += `        </tm:Strokes>\n`;

                xml += `        <tm:PolygonLanes>\n`;
                link.lanes.forEach((lane, i) => {
                    // 防呆：確保一定抓得到 strokeId
                    const leftId = lane.leftStrokeId !== undefined ? lane.leftStrokeId : (link.strokes[i] ? link.strokes[i].id : i);
                    const rightId = lane.rightStrokeId !== undefined ? lane.rightStrokeId : (link.strokes[i + 1] ? link.strokes[i + 1].id : i + 1);

                    xml += `          <tm:PolygonLane index="${i}">\n`;
                    xml += `            <tm:LeftBoundary strokeId="${leftId}" />\n`;
                    xml += `            <tm:RightBoundary strokeId="${rightId}" />\n`;
                    xml += `          </tm:PolygonLane>\n`;
                });
                xml += `        </tm:PolygonLanes>\n`;
            }

            xml += '      </tm:Link>\n';
        }
        xml += '    </tm:Links>\n';

        // --- 3. Nodes ---
        xml += '    <tm:Nodes>\n';
        for (const node of Object.values(network.nodes)) {
            const numericId = regularNodeIdMap.get(node.id);
            if (numericId === undefined) continue;
            const connectionsAtNode = Object.values(network.connections).filter(c => c.nodeId === node.id);

            // 只有當該節點有連接線，或者設定了轉向比例時才匯出
            if (connectionsAtNode.length > 0 || (node.turningRatios && Object.keys(node.turningRatios).length > 0)) {
                xml += `      <tm:RegularNode><tm:id>${numericId}</tm:id><tm:name></tm:name>\n`;

                xml += `        <tm:pedestrianVolume>${node.pedestrianVolume || 0}</tm:pedestrianVolume>\n`;
                xml += `        <tm:crossOnceProb>${node.crossOnceProb !== undefined ? node.crossOnceProb : 100}</tm:crossOnceProb>\n`;
                xml += `        <tm:crossTwiceProb>${node.crossTwiceProb || 0}</tm:crossTwiceProb>\n`;

                // [新增] 寫入 Synchro 路口轉向車流量 (veh/h)
                if (node.synchroTurnVolumes && Object.keys(node.synchroTurnVolumes).length > 0) {
                    xml += `        <tm:SynchroTurnVolumes>\n`;
                    Object.entries(node.synchroTurnVolumes).forEach(([fromId, toData]) => {
                        const fromNumId = linkIdMap.get(fromId);
                        if (fromNumId !== undefined) {
                            xml += `          <tm:IncomingLink id="${fromNumId}">\n`;
                            Object.entries(toData).forEach(([toId, vol]) => {
                                const toNumId = linkIdMap.get(toId);
                                if (toNumId !== undefined) {
                                    xml += `            <tm:TurnVolume linkId="${toNumId}" volume="${Math.round(vol || 0)}" />\n`;
                                }
                            });
                            xml += `          </tm:IncomingLink>\n`;
                        }
                    });
                    xml += `        </tm:SynchroTurnVolumes>\n`;
                }

                // [新增] 寫入 Turning Ratios (Flow Mode)
                if (node.turningRatios && Object.keys(node.turningRatios).length > 0) {
                    xml += `        <tm:TurningRatios>\n`;
                    Object.entries(node.turningRatios).forEach(([fromId, toData]) => {
                        const fromNumId = linkIdMap.get(fromId);
                        if (fromNumId !== undefined) {
                            xml += `          <tm:IncomingLink id="${fromNumId}">\n`;
                            Object.entries(toData).forEach(([toId, ratio]) => {
                                const toNumId = linkIdMap.get(toId);
                                if (toNumId !== undefined) {
                                    xml += `            <tm:TurnTo linkId="${toNumId}" probability="${ratio.toFixed(4)}" />\n`;
                                }
                            });
                            xml += `          </tm:IncomingLink>\n`;
                        }
                    });
                    xml += `        </tm:TurningRatios>\n`;
                }

                xml += '        <tm:TransitionRules>\n';
                for (const conn of connectionsAtNode) {
                    const connNumId = connIdMap.get(conn.id); if (connNumId === undefined) continue;
                    const sourceLink = network.links[conn.sourceLinkId];
                    const transitionWidth = (sourceLink && sourceLink.lanes[conn.sourceLaneIndex]) ? sourceLink.lanes[conn.sourceLaneIndex].width : LANE_WIDTH;
                    const p1 = conn.bezierPoints[0];
                    const p4 = conn.bezierPoints[conn.bezierPoints.length - 1];
                    const destLink = network.links[conn.destLinkId];
                    let pointsToExport = [p1, p1, p4, p4];
                    let curveLength = vecLen(getVector(p1, p4));
                    if (sourceLink && destLink && sourceLink.waypoints.length > 1 && destLink.waypoints.length > 1) {
                        const sourceLanePath = getLanePath(sourceLink, conn.sourceLaneIndex);
                        const destLanePath = getLanePath(destLink, conn.destLaneIndex);
                        if (sourceLanePath.length > 1 && destLanePath.length > 1) {
                            const v1 = normalize(getVector(sourceLanePath[sourceLanePath.length - 2], p1));
                            const v2 = normalize(getVector(p4, destLanePath[1]));
                            const distBetweenEnds = vecLen(getVector(p1, p4));
                            const controlPointOffset = distBetweenEnds * 0.4;
                            const p2 = add(p1, scale(v1, controlPointOffset));
                            const p3 = add(p4, scale(v2, -controlPointOffset));
                            pointsToExport = [p1, p2, p3, p4];
                            curveLength = getPolylineLength(pointsToExport);
                        }
                    }
                    xml += `          <tm:TransitionRule><tm:id>${connNumId}</tm:id><tm:length>${curveLength.toFixed(4)}</tm:length><tm:width>${transitionWidth.toFixed(2)}</tm:width>`;
                    xml += `<tm:sourceLinkId>${linkIdMap.get(conn.sourceLinkId)}</tm:sourceLinkId><tm:sourceLaneIndex>${conn.sourceLaneIndex}</tm:sourceLaneIndex><tm:destinationLinkId>${linkIdMap.get(conn.destLinkId)}</tm:destinationLinkId><tm:destinationLaneIndex>${conn.destLaneIndex}</tm:destinationLaneIndex>\n`;
                    if (connToGroupIdMap.has(conn.id)) {
                        xml += `            <tm:EditorGroupId>${connToGroupIdMap.get(conn.id)}</tm:EditorGroupId>\n`;
                    }
                    xml += '            <tm:BezierCurveGeometry><tm:ReferencePoints>\n';
                    pointsToExport.forEach(p => { xml += `              <tm:Point><tm:x>${p.x.toFixed(4)}</tm:x><tm:y>${(p.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`; });
                    xml += '            </tm:ReferencePoints></tm:BezierCurveGeometry>\n          </tm:TransitionRule>\n';
                }
                xml += '        </tm:TransitionRules>\n';

                const tflData = network.trafficLights[node.id];
                if (tflData) ensureTflGroupSets(tflData);
                const gsListForExport = tflData && tflData.signalGroupSets ? Object.values(tflData.signalGroupSets) : [];
                const hasAnyGroupsToExport = gsListForExport.some(gs => Object.keys(gs.groups || {}).length > 0);
                if (tflData && hasAnyGroupsToExport) {
                    const groupNameToNumericId = {};
                    const groupSetToNumericIds = {}; // gsId -> { groupId -> [numericTurnTRGroupId, ...] }
                    const exportedLightsList = [];   // [{ id, name }]
                    let turnTRGroupIdCounter = 0;

                    gsListForExport.forEach(gs => { groupSetToNumericIds[gs.id] = {}; });

                    xml += '        <tm:TurnTRGroups>\n';

                    if (gsListForExport.length === 1) {
                        // 單一硬體群組：100% 維持原有 TurnTRGroup 結構
                        const singleGs = gsListForExport[0];
                        Object.values(singleGs.groups).forEach(group => {
                            const numericTurnTRGroupId = turnTRGroupIdCounter++;
                            groupNameToNumericId[group.id] = numericTurnTRGroupId;
                            groupSetToNumericIds[singleGs.id][group.id] = [numericTurnTRGroupId];
                            exportedLightsList.push({ id: numericTurnTRGroupId, name: group.id });

                            xml += `          <tm:TurnTRGroup><tm:id>${numericTurnTRGroupId}</tm:id><tm:name>${group.id}</tm:name><tm:type>${group.type || 'vehicle'}</tm:type>\n`;
                            const firstConn = network.connections[group.connIds[0]];
                            if (firstConn) {
                                const sourceLink = network.links[firstConn.sourceLinkId], destLink = network.links[firstConn.destLinkId];
                                if (sourceLink && destLink && sourceLink.waypoints.length > 1 && destLink.waypoints.length > 1) {
                                    const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1], p4 = destLink.waypoints[0];
                                    const v1 = normalize(getVector(sourceLink.waypoints[sourceLink.waypoints.length - 2], p1)), v2 = normalize(getVector(p4, destLink.waypoints[1]));
                                    const p2 = add(p1, scale(v1, vecLen(getVector(p1, p4)) * 0.3)), p3 = add(p4, scale(v2, -vecLen(getVector(p1, p4)) * 0.3));
                                    xml += '            <tm:BaseBezierCurve><tm:ReferencePoints>\n';
                                    [p1, p2, p3, p4].forEach(p => { xml += `              <tm:Point><tm:x>${p.x.toFixed(4)}</tm:x><tm:y>${(p.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`; });
                                    xml += '            </tm:ReferencePoints></tm:BaseBezierCurve>\n';
                                }
                            }
                            xml += '            <tm:TransitionRules>\n';
                            group.connIds.forEach(cid => { const mappedId = connIdMap.get(cid); if (mappedId !== undefined) xml += `              <tm:TransitionRule><tm:transitionRuleId>${mappedId}</tm:transitionRuleId></tm:TransitionRule>\n`; });
                            xml += '            </tm:TransitionRules>\n          </tm:TurnTRGroup>\n';
                        });
                    } else {
                        // 多套硬體群組：建立跨配置原子化 TurnTRGroup (Atomic Partitioning)，使模擬器在切換不同硬體群組時制時 100% 相容
                        const allAssignedConnIds = new Set();
                        gsListForExport.forEach(gs => {
                            Object.values(gs.groups || {}).forEach(g => {
                                if (g.type !== 'pedestrian') {
                                    (g.connIds || []).forEach(cid => {
                                        if (connIdMap.has(cid)) allAssignedConnIds.add(cid);
                                    });
                                }
                            });
                        });

                        // 依各套硬體群組歸屬簽章分群
                        const sigToAtom = new Map();
                        allAssignedConnIds.forEach(cid => {
                            const membership = {};
                            const sigParts = [];
                            gsListForExport.forEach(gs => {
                                let foundGId = '';
                                for (const g of Object.values(gs.groups || {})) {
                                    if (g.type !== 'pedestrian' && (g.connIds || []).includes(cid)) {
                                        foundGId = g.id;
                                        break;
                                    }
                                }
                                membership[gs.id] = foundGId;
                                sigParts.push(`${gs.id}:${foundGId}`);
                            });
                            const sig = sigParts.join('|');
                            if (!sigToAtom.has(sig)) {
                                sigToAtom.set(sig, { connIds: [], membership });
                            }
                            sigToAtom.get(sig).connIds.push(cid);
                        });

                        // 輸出每個原子車輛群組
                        sigToAtom.forEach(atom => {
                            const numericId = turnTRGroupIdCounter++;
                            const activeGsId = tflData.activeGroupSetId;
                            const primaryName = atom.membership[activeGsId] || Object.values(atom.membership).find(Boolean) || `G_${numericId}`;
                            const atomName = groupNameToNumericId[primaryName] === undefined ? primaryName : `${primaryName}_${numericId}`;
                            if (groupNameToNumericId[primaryName] === undefined) {
                                groupNameToNumericId[primaryName] = numericId;
                            }
                            groupNameToNumericId[atomName] = numericId;
                            exportedLightsList.push({ id: numericId, name: atomName });

                            Object.entries(atom.membership).forEach(([gsId, gId]) => {
                                if (gId) {
                                    if (!groupSetToNumericIds[gsId][gId]) groupSetToNumericIds[gsId][gId] = [];
                                    groupSetToNumericIds[gsId][gId].push(numericId);
                                }
                            });

                            xml += `          <tm:TurnTRGroup><tm:id>${numericId}</tm:id><tm:name>${atomName}</tm:name><tm:type>vehicle</tm:type>\n`;
                            const firstConn = network.connections[atom.connIds[0]];
                            if (firstConn) {
                                const sourceLink = network.links[firstConn.sourceLinkId], destLink = network.links[firstConn.destLinkId];
                                if (sourceLink && destLink && sourceLink.waypoints.length > 1 && destLink.waypoints.length > 1) {
                                    const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1], p4 = destLink.waypoints[0];
                                    const v1 = normalize(getVector(sourceLink.waypoints[sourceLink.waypoints.length - 2], p1)), v2 = normalize(getVector(p4, destLink.waypoints[1]));
                                    const p2 = add(p1, scale(v1, vecLen(getVector(p1, p4)) * 0.3)), p3 = add(p4, scale(v2, -vecLen(getVector(p1, p4)) * 0.3));
                                    xml += '            <tm:BaseBezierCurve><tm:ReferencePoints>\n';
                                    [p1, p2, p3, p4].forEach(p => { xml += `              <tm:Point><tm:x>${p.x.toFixed(4)}</tm:x><tm:y>${(p.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`; });
                                    xml += '            </tm:ReferencePoints></tm:BaseBezierCurve>\n';
                                }
                            }
                            xml += '            <tm:TransitionRules>\n';
                            atom.connIds.forEach(cid => { const mappedId = connIdMap.get(cid); if (mappedId !== undefined) xml += `              <tm:TransitionRule><tm:transitionRuleId>${mappedId}</tm:transitionRuleId></tm:TransitionRule>\n`; });
                            xml += '            </tm:TransitionRules>\n          </tm:TurnTRGroup>\n';
                        });

                        // 處理尚未綁定 connIds 的車輛群組與所有行人群組
                        const pedNameToNumericId = {};
                        gsListForExport.forEach(gs => {
                            Object.values(gs.groups || {}).forEach(group => {
                                if (group.type === 'pedestrian') {
                                    if (pedNameToNumericId[group.id] === undefined) {
                                        const numericId = turnTRGroupIdCounter++;
                                        pedNameToNumericId[group.id] = numericId;
                                        groupNameToNumericId[group.id] = numericId;
                                        exportedLightsList.push({ id: numericId, name: group.id });
                                        xml += `          <tm:TurnTRGroup><tm:id>${numericId}</tm:id><tm:name>${group.id}</tm:name><tm:type>pedestrian</tm:type>\n            <tm:TransitionRules>\n            </tm:TransitionRules>\n          </tm:TurnTRGroup>\n`;
                                    }
                                    groupSetToNumericIds[gs.id][group.id] = [pedNameToNumericId[group.id]];
                                } else if (!groupSetToNumericIds[gs.id][group.id] || groupSetToNumericIds[gs.id][group.id].length === 0) {
                                    const numericId = turnTRGroupIdCounter++;
                                    if (groupNameToNumericId[group.id] === undefined) groupNameToNumericId[group.id] = numericId;
                                    groupSetToNumericIds[gs.id][group.id] = [numericId];
                                    exportedLightsList.push({ id: numericId, name: group.id });
                                    xml += `          <tm:TurnTRGroup><tm:id>${numericId}</tm:id><tm:name>${group.id}</tm:name><tm:type>vehicle</tm:type>\n            <tm:TransitionRules>\n            </tm:TransitionRules>\n          </tm:TurnTRGroup>\n`;
                                }
                            });
                        });
                    }

                    xml += '        </tm:TurnTRGroups>\n';
                    tflGroupMappings[node.id] = {
                        byName: groupNameToNumericId,
                        byGroupSet: groupSetToNumericIds,
                        lightsList: exportedLightsList
                    };
                }

                const pathPoints = getNodePolygonPoints(node);
                if (pathPoints && pathPoints.length >= 6) {
                    xml += '        <tm:PolygonGeometry>\n';
                    for (let i = 0; i < pathPoints.length; i += 2) { xml += `          <tm:Point><tm:x>${pathPoints[i].toFixed(4)}</tm:x><tm:y>${(pathPoints[i + 1] * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`; }
                    xml += '        </tm:PolygonGeometry>\n';
                }
                xml += `      </tm:RegularNode>\n`;
            }
        }

        // Origins & Destinations (Legacy Support)
        for (const origin of Object.values(network.origins)) {
            const numericId = originNodeIdMap.get(origin.id), outgoingLinkId = linkIdMap.get(origin.linkId);
            if (numericId === undefined || outgoingLinkId === undefined) continue;
            xml += `      <tm:OriginNode><tm:id>${numericId}</tm:id><tm:outgoingLinkId>${outgoingLinkId}</tm:outgoingLinkId>\n`;
            const link = network.links[origin.linkId];
            if (link) {
                const centerPoint = link.waypoints[0];
                xml += `        <tm:CircleGeometry><tm:Center><tm:x>${centerPoint.x.toFixed(4)}</tm:x><tm:y>${(centerPoint.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Center><tm:radius>5.0</tm:radius></tm:CircleGeometry>\n`;
            }
            xml += `      </tm:OriginNode>\n`;
        }
        for (const destination of Object.values(network.destinations)) {
            const numericId = destinationNodeIdMap.get(destination.id), incomingLinkId = linkIdMap.get(destination.linkId);
            if (numericId === undefined || incomingLinkId === undefined) continue;
            xml += `      <tm:DestinationNode><tm:id>${numericId}</tm:id><tm:name></tm:name><tm:incomingLinkId>${incomingLinkId}</tm:incomingLinkId>\n`;
            const link = network.links[destination.linkId];
            if (link) {
                const centerPoint = link.waypoints[link.waypoints.length - 1];
                xml += `        <tm:CircleGeometry><tm:Center><tm:x>${centerPoint.x.toFixed(4)}</tm:x><tm:y>${(centerPoint.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Center><tm:radius>5.0</tm:radius></tm:CircleGeometry>\n`;
            }
            xml += `      </tm:DestinationNode>\n`;
        }
        xml += '    </tm:Nodes>\n';

        // --- Road Markings Export ---
        // --- Road Markings Export (Updated) ---
        if (Object.keys(network.roadMarkings).length > 0) {
            xml += '    <tm:RoadMarkings>\n';
            Object.values(network.roadMarkings).forEach(mark => {
                const numericLinkId = mark.linkId ? linkIdMap.get(mark.linkId) : undefined;
                const numericNodeId = mark.nodeId ? regularNodeIdMap.get(mark.nodeId) : undefined;

                // [修改] 允許 channelization (槽化線) 即使沒有綁定 link/node 也能匯出
                if (numericLinkId !== undefined || numericNodeId !== undefined || mark.markingType === 'channelization') {
                    xml += '      <tm:RoadMarking>\n';
                    xml += `        <tm:id>${mark.id}</tm:id>\n`;
                    xml += `        <tm:type>${mark.markingType}</tm:type>\n`;

                    if (mark.isFree) xml += `        <tm:isFree>true</tm:isFree>\n`;

                    if (mark.spanToLinkId) {
                        const numSpanId = linkIdMap.get(mark.spanToLinkId);
                        if (numSpanId !== undefined) {
                            xml += `        <tm:spanToLinkId>${numSpanId}</tm:spanToLinkId>\n`;
                        }
                    }

                    // 匯出行人號誌綁定
                    if (mark.signalGroupId) {
                        xml += `        <tm:signalGroupId>${mark.signalGroupId}</tm:signalGroupId>\n`;
                    }
                    if (mark.signalGroupBySet && Object.keys(mark.signalGroupBySet).length > 0) {
                        xml += `        <tm:signalGroupBySet><![CDATA[${JSON.stringify(mark.signalGroupBySet)}]]></tm:signalGroupBySet>\n`;
                    }

                    if (numericLinkId !== undefined) {
                        xml += `        <tm:linkId>${numericLinkId}</tm:linkId>\n`;
                        xml += `        <tm:position>${mark.position.toFixed(4)}</tm:position>\n`;
                        xml += `        <tm:laneIndices>${mark.laneIndices.join(',')}</tm:laneIndices>\n`;

                        // 如果是自由模式 OR 兩段式左轉，必須匯出絕對座標與旋轉
                        if (mark.isFree || mark.markingType === 'two_stage_box') {
                            xml += `        <tm:x>${mark.x.toFixed(4)}</tm:x>\n`;
                            xml += `        <tm:y>${(mark.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y>\n`;
                            xml += `        <tm:rotation>${(mark.rotation || 0).toFixed(4)}</tm:rotation>\n`;
                        }
                    } else if (numericNodeId !== undefined) {
                        xml += `        <tm:nodeId>${numericNodeId}</tm:nodeId>\n`;
                        xml += `        <tm:x>${mark.x.toFixed(4)}</tm:x>\n`;
                        xml += `        <tm:y>${(mark.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y>\n`;
                        xml += `        <tm:rotation>${(mark.rotation || 0).toFixed(4)}</tm:rotation>\n`;
                    }

                    // [新增] 匯出槽化線專屬的邊界座標與顏色
                    if (mark.markingType === 'channelization') {
                        xml += `        <tm:color>${mark.color || 'white'}</tm:color>\n`;
                        xml += `        <tm:Boundary>\n`;
                        for (let i = 0; i < mark.points.length; i += 2) {
                            xml += `          <tm:Point><tm:x>${mark.points[i].toFixed(4)}</tm:x><tm:y>${(mark.points[i + 1] * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`;
                        }
                        xml += `        </tm:Boundary>\n`;
                    } else {
                        // 原本其它標線的長寬
                        xml += `        <tm:length>${(mark.length || 0).toFixed(4)}</tm:length>\n`;
                        xml += `        <tm:width>${(mark.width || 0).toFixed(4)}</tm:width>\n`;
                    }

                    xml += '      </tm:RoadMarking>\n';
                }
            });
            xml += '    </tm:RoadMarkings>\n';
        }
        xml += '  </tm:RoadNetwork>\n';

        // --- 4. Agents (Traffic Control & Spawners) ---
        xml += '  <tm:Agents>\n';
        xml += '    <tm:TrafficLightNetworks>\n';
        for (const [nodeKey, tfl] of Object.entries(network.trafficLights)) {
            if (!tfl.nodeId) tfl.nodeId = nodeKey; // ★ 自動修復缺少 nodeId 的號誌資料

            const hasLegacySchedule = tfl.schedule && tfl.schedule.length > 0;
            const hasAdvancedSchedule = tfl.advanced && tfl.advanced.schedules && Object.keys(tfl.advanced.schedules).length > 0;

            if (!hasLegacySchedule && !hasAdvancedSchedule) continue;

            const nodeNumId = regularNodeIdMap.get(tfl.nodeId);
            if (nodeNumId === undefined) continue;

            xml += `      <tm:RegularTrafficLightNetwork><tm:regularNodeId>${nodeNumId}</tm:regularNodeId>\n`;

            ensureTflGroupSets(tfl);
            const mappingInfo = tflGroupMappings[tfl.nodeId];
            if (mappingInfo && mappingInfo.lightsList) {
                xml += '        <tm:TrafficLights>\n';
                mappingInfo.lightsList.forEach(item => {
                    xml += `          <tm:TrafficLight><tm:id>${item.id}</tm:id><tm:name>${item.name}</tm:name><tm:Placement><tm:turnTRGroupId>${item.id}</tm:turnTRGroupId></tm:Placement></tm:TrafficLight>\n`;
                });
                xml += '        </tm:TrafficLights>\n';
            }

            // ----------------------------------------------------
            // 【向下相容】萃取代表性時制 (取週一第一個非 NONE 的時制)
            // ----------------------------------------------------
            let legacyTimeShift = tfl.timeShift || 0;
            let legacyPhases = tfl.schedule || [];
            let legacyGroupSetId = tfl.activeGroupSetId || Object.keys(tfl.signalGroupSets)[0];

            if (tfl.advanced && tfl.advanced.weekly && tfl.advanced.dailyPlans && tfl.advanced.schedules) {
                const monPlanId = tfl.advanced.weekly[1];
                const monPlan = tfl.advanced.dailyPlans[monPlanId];
                if (monPlan && monPlan.switches) {
                    const firstValidSwitch = monPlan.switches.find(s => s.schedId !== 'NONE');
                    if (firstValidSwitch) {
                        const repSched = tfl.advanced.schedules[firstValidSwitch.schedId];
                        if (repSched) {
                            legacyTimeShift = repSched.timeShift || 0;
                            legacyPhases = repSched.phases || [];
                            if (repSched.groupSetId && tfl.signalGroupSets[repSched.groupSetId]) {
                                legacyGroupSetId = repSched.groupSetId;
                            }
                        }
                    }
                }
            }

            const legacyGroupsObj = (tfl.signalGroupSets[legacyGroupSetId] && tfl.signalGroupSets[legacyGroupSetId].groups) || tfl.signalGroups;
            const legacyGsMapping = (mappingInfo && mappingInfo.byGroupSet && mappingInfo.byGroupSet[legacyGroupSetId]) || {};

            // 輸出舊版相容標籤
            xml += `        <tm:scheduleTimeShift>${legacyTimeShift}</tm:scheduleTimeShift>\n`;
            xml += '        <tm:Schedule><tm:TimePeriods>\n';
            const microLegacyPhases = compileMacroPhasesToMicro(legacyPhases, legacyGroupsObj);
            microLegacyPhases.forEach(phase => {
                xml += `          <tm:TimePeriod><tm:duration>${phase.duration}</tm:duration>\n`;
                if (mappingInfo) {
                    const emittedIds = new Set();
                    Object.values(legacyGroupsObj).forEach(group => {
                        const targetIds = legacyGsMapping[group.id] || (mappingInfo.byName[group.id] !== undefined ? [mappingInfo.byName[group.id]] : []);
                        const signal = phase.signals[group.id] || 'Red';
                        targetIds.forEach(numericTurnTRGroupId => {
                            emittedIds.add(numericTurnTRGroupId);
                            xml += `            <tm:TrafficLightSignal><tm:trafficLightId>${numericTurnTRGroupId}</tm:trafficLightId><tm:signal>${signal}</tm:signal></tm:TrafficLightSignal>\n`;
                        });
                    });
                    // 非此硬體群組使用的原子群組預設紅燈
                    mappingInfo.lightsList.forEach(item => {
                        if (!emittedIds.has(item.id)) {
                            xml += `            <tm:TrafficLightSignal><tm:trafficLightId>${item.id}</tm:trafficLightId><tm:signal>Red</tm:signal></tm:TrafficLightSignal>\n`;
                        }
                    });
                }
                xml += '          </tm:TimePeriod>\n';
            });
            xml += '        </tm:TimePeriods></tm:Schedule>\n';

            // ----------------------------------------------------
            // 【進階排程】輸出供新版模擬器與編輯器讀取的標籤
            // ----------------------------------------------------
            if (tfl.advanced) {
                xml += '        <tm:AdvancedScheduling enabled="true">\n';

                // 0. SignalGroupSets (多套硬體號誌群組庫)
                if (tfl.signalGroupSets && Object.keys(tfl.signalGroupSets).length > 0) {
                    xml += `          <tm:SignalGroupSets activeGroupSetId="${tfl.activeGroupSetId || Object.keys(tfl.signalGroupSets)[0]}">\n`;
                    Object.values(tfl.signalGroupSets).forEach(gs => {
                        xml += `            <tm:SignalGroupSet id="${gs.id}" name="${gs.name || gs.id}">\n`;
                        Object.values(gs.groups || {}).forEach(g => {
                            const xmlConnIds = (g.connIds || []).map(cid => connIdMap.get(cid)).filter(id => id !== undefined).join(',');
                            xml += `              <tm:Group id="${g.id}" type="${g.type || 'vehicle'}" connXmlIds="${xmlConnIds}"/>\n`;
                        });
                        xml += `            </tm:SignalGroupSet>\n`;
                    });
                    xml += '          </tm:SignalGroupSets>\n';
                }

                // 1. Schedules (時制庫，包含所選用的 groupSetId)
                xml += '          <tm:Schedules>\n';
                Object.values(tfl.advanced.schedules).forEach(sched => {
                    const schedGsId = (sched.groupSetId && tfl.signalGroupSets[sched.groupSetId]) ? sched.groupSetId : (tfl.activeGroupSetId || Object.keys(tfl.signalGroupSets)[0]);
                    const schedGroupsObj = (tfl.signalGroupSets[schedGsId] && tfl.signalGroupSets[schedGsId].groups) || tfl.signalGroups;
                    const schedGsMap = (mappingInfo && mappingInfo.byGroupSet && mappingInfo.byGroupSet[schedGsId]) || {};

                    xml += `            <tm:ScheduleDef id="${sched.id}" name="${sched.name || sched.id}" groupSetId="${schedGsId}" timeShift="${sched.timeShift || 0}">\n`;

                    const microPhases = compileMacroPhasesToMicro(sched.phases, schedGroupsObj);
                    xml += '              <tm:Phases>\n';
                    microPhases.forEach(mPhase => {
                        xml += `                <tm:Phase duration="${mPhase.duration}">\n`;
                        const emittedIds = new Set();
                        Object.entries(mPhase.signals).forEach(([gId, state]) => {
                            const targetIds = schedGsMap[gId] || (mappingInfo && mappingInfo.byName[gId] !== undefined ? [mappingInfo.byName[gId]] : []);
                            targetIds.forEach(numericGroupId => {
                                emittedIds.add(numericGroupId);
                                xml += `                  <tm:Signal groupId="${numericGroupId}" state="${state}"/>\n`;
                            });
                        });
                        if (mappingInfo && mappingInfo.lightsList) {
                            mappingInfo.lightsList.forEach(item => {
                                if (!emittedIds.has(item.id)) {
                                    xml += `                  <tm:Signal groupId="${item.id}" state="Red"/>\n`;
                                }
                            });
                        }
                        xml += `                </tm:Phase>\n`;
                    });
                    xml += '              </tm:Phases>\n';

                    // 寫入編輯器專屬的巨觀步階紀錄，以利下次完美讀取
                    xml += `              <tm:EditorMacroPhases><![CDATA[${JSON.stringify(sched.phases)}]]></tm:EditorMacroPhases>\n`;
                    xml += `            </tm:ScheduleDef>\n`;
                });
                xml += '          </tm:Schedules>\n';

                // 2. Daily Plans (日型態)
                xml += '          <tm:DailyPlans>\n';
                Object.values(tfl.advanced.dailyPlans).forEach(plan => {
                    xml += `            <tm:Plan id="${plan.id}" name="${plan.name || plan.id}">\n`;
                    plan.switches.forEach(sw => {
                        xml += `              <tm:TimeSwitch time="${sw.time}" scheduleId="${sw.schedId}"/>\n`;
                    });
                    xml += `            </tm:Plan>\n`;
                });
                xml += '          </tm:DailyPlans>\n';

                // 3. Weekly Assignment (週排程)
                xml += '          <tm:WeeklyAssignment>\n';
                Object.entries(tfl.advanced.weekly).forEach(([day, planId]) => {
                    xml += `            <tm:Day dayOfWeek="${day}" planId="${planId}"/>\n`;
                });
                xml += '          </tm:WeeklyAssignment>\n';

                xml += '        </tm:AdvancedScheduling>\n';
            }

            xml += '      </tm:RegularTrafficLightNetwork>\n';
        }
        xml += '    </tm:TrafficLightNetworks>\n';

        xml += '    <tm:Origins>\n';
        for (const origin of Object.values(network.origins)) {
            const originNodeNumId = originNodeIdMap.get(origin.id);
            if (originNodeNumId === undefined || !origin.periods || origin.periods.length === 0) continue;
            xml += `      <tm:Origin>\n`;
            xml += `        <tm:originNodeId>${originNodeNumId}</tm:originNodeId>\n`;
            xml += '        <tm:TimePeriods>\n';
            origin.periods.forEach(period => {
                xml += '          <tm:TimePeriod>\n';
                xml += `            <tm:duration>${period.duration || 3600}</tm:duration>\n`;
                xml += `            <tm:numberOfVehicles>${period.numVehicles || 0}</tm:numberOfVehicles>\n`;
                if (period.destinations && period.destinations.length > 0) {
                    xml += '            <tm:Destinations>\n';
                    period.destinations.forEach(destEntry => {
                        const destNodeNumId = destinationNodeIdMap.get(destEntry.nodeId);
                        if (destNodeNumId !== undefined) {
                            xml += `              <tm:Destination><tm:weight>${destEntry.weight || 1}</tm:weight><tm:destinationNodeId>${destNodeNumId}</tm:destinationNodeId></tm:Destination>\n`;
                        }
                    });
                    xml += '            </tm:Destinations>\n';
                }
                if (period.stops && period.stops.length > 0) {
                    xml += '            <tm:IntermediateStops>\n';
                    period.stops.forEach(stop => {
                        xml += '              <tm:Stop>\n';
                        xml += `                <tm:parkingLotId>${stop.parkingLotId}</tm:parkingLotId>\n`;
                        xml += `                <tm:probability>${stop.probability}</tm:probability>\n`;
                        xml += `                <tm:duration>${stop.duration}</tm:duration>\n`;
                        xml += '              </tm:Stop>\n';
                    });
                    xml += '            </tm:IntermediateStops>\n';
                }
                if (period.profiles && period.profiles.length > 0) {
                    xml += '            <tm:VehicleProfiles>\n';
                    period.profiles.forEach(profEntry => {
                        const profile = network.vehicleProfiles[profEntry.profileId];
                        if (profile) {
                            xml += `              <tm:VehicleProfile><tm:weight>${profEntry.weight || 1}</tm:weight>\n`;
                            xml += '                <tm:RegularVehicle>\n';
                            xml += `                  <tm:vehicleId>0</tm:vehicleId><tm:length>${profile.length}</tm:length><tm:width>${profile.width}</tm:width><tm:class>Car</tm:class>\n`;
                            xml += '                  <tm:CompositeDriver><tm:destinationNodeId>0</tm:destinationNodeId><tm:Parameters>\n';
                            xml += `                    <tm:maxSpeed>${profile.maxSpeed}</tm:maxSpeed><tm:maxAcceleration>${profile.maxAcceleration}</tm:maxAcceleration><tm:comfortDeceleration>${profile.comfortDeceleration}</tm:comfortDeceleration><tm:minDistance>${profile.minDistance}</tm:minDistance><tm:desiredHeadwayTime>${profile.desiredHeadwayTime}</tm:desiredHeadwayTime>\n`;
                            xml += '                    <tm:abruptness>4</tm:abruptness><tm:politeness>0.5</tm:politeness><tm:accThreshold>0.2</tm:accThreshold><tm:intersectionGapTime>3</tm:intersectionGapTime>\n';
                            xml += '                  </tm:Parameters></tm:CompositeDriver>\n';
                            xml += '                </tm:RegularVehicle>\n              </tm:VehicleProfile>\n';
                        }
                    });
                    xml += '            </tm:VehicleProfiles>\n';
                }
                xml += '          </tm:TimePeriod>\n';
            });
            xml += '        </tm:TimePeriods>\n';
            xml += '      </tm:Origin>\n';
        }
        xml += '    </tm:Origins>\n';
        xml += '  </tm:Agents>\n';

        // --- 5. Background ---
        if (Object.keys(network.backgrounds).length > 0) {
            xml += '  <tm:Background>\n';
            for (const bg of Object.values(network.backgrounds)) {
                const group = bg.konvaGroup;
                const startX = group.x();
                const startY = group.y();
                const width = group.width() * group.scaleX();
                const height = group.height() * group.scaleY();
                const endX = startX + width;
                const endY = startY + height;

                xml += '    <tm:Tile>\n';
                xml += '      <tm:Rectangle>\n';
                xml += `        <tm:Start><tm:x>${startX.toFixed(4)}</tm:x><tm:y>${(startY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Start>\n`;
                xml += `        <tm:End><tm:x>${endX.toFixed(4)}</tm:x><tm:y>${(endY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:End>\n`;
                xml += '      </tm:Rectangle>\n';
                xml += `      <tm:saturation>${bg.opacity}</tm:saturation>\n`;
                xml += `      <tm:locked>${bg.locked ? 'true' : 'false'}</tm:locked>\n`; // 記錄鎖定狀態

                if (bg.imageDataUrl) {
                    const base64Data = bg.imageDataUrl.split(',')[1];
                    xml += '      <tm:Image>\n';
                    xml += `        <tm:type>${bg.imageType}</tm:type>\n`;
                    xml += `        <tm:binaryData>${base64Data}</tm:binaryData>\n`;
                    xml += '      </tm:Image>\n';
                }
                xml += '    </tm:Tile>\n';
            }
            xml += '  </tm:Background>\n';
        }

        // --- 6. Meters (With Flow/Source/Profile data) ---
        xml += '  <tm:Meters>\n';

        // [新增] 內部輔助函數：用來產生 SpawnProfiles 的 XML 字串
        // 將此函數放在 Meters 迴圈之前
        const exportSpawnProfiles = (profiles) => {
            let str = '';
            if (profiles && profiles.length > 0) {
                str += `      <tm:SpawnProfiles>\n`;
                profiles.forEach(p => {
                    str += `        <tm:ProfileEntry><tm:profileId>${p.profileId}</tm:profileId><tm:weight>${p.weight}</tm:weight></tm:ProfileEntry>\n`;
                });
                str += `      </tm:SpawnProfiles>\n`;
            }
            return str;
        };

        Object.values(network.detectors).forEach(detector => {
            const numericDetId = detectorIdMap.get(detector.id);
            const numericLinkId = linkIdMap.get(detector.linkId);
            if (numericDetId === undefined || numericLinkId === undefined) return;

            if (detector.type === 'PointDetector') {
                xml += `    <tm:LinkAverageTravelSpeedMeter>\n`;
                xml += `      <tm:id>${numericDetId}</tm:id>\n`;
                xml += `      <tm:name>${detector.name}</tm:name>\n`;
                xml += `      <tm:DataCollectionModes />\n`;
                xml += `      <tm:linkId>${numericLinkId}</tm:linkId>\n`;
                xml += `      <tm:segmentId>0</tm:segmentId>\n`;
                xml += `      <tm:position>${detector.position.toFixed(4)}</tm:position>\n`;

                // [修改] 匯出 Flow Mode 屬性
                xml += `      <tm:observedFlow>${detector.observedFlow || 0}</tm:observedFlow>\n`;
                xml += `      <tm:isSource>${detector.isSource || false}</tm:isSource>\n`;

                // [關鍵修改] 改為呼叫輔助函數輸出列表，取代原本單一的 spawnProfileId
                xml += exportSpawnProfiles(detector.spawnProfiles);

                xml += `    </tm:LinkAverageTravelSpeedMeter>\n`;
            } else if (detector.type === 'SectionDetector') {
                xml += `    <tm:SectionAverageTravelSpeedMeter>\n`;
                xml += `      <tm:id>${numericDetId}</tm:id>\n`;
                xml += `      <tm:name>${detector.name}</tm:name>\n`;
                xml += `      <tm:DataCollectionModes />\n`;
                xml += `      <tm:linkId>${numericLinkId}</tm:linkId>\n`;
                xml += `      <tm:segmentId>0</tm:segmentId>\n`;
                xml += `      <tm:position>${(detector.position - (detector.length || 0)).toFixed(4)}</tm:position>\n`;
                xml += `      <tm:sectionLength>${(detector.length || 0).toFixed(4)}</tm:sectionLength>\n`;

                // [修改] 匯出 Flow Mode 屬性
                xml += `      <tm:observedFlow>${detector.observedFlow || 0}</tm:observedFlow>\n`;
                xml += `      <tm:isSource>${detector.isSource || false}</tm:isSource>\n`;

                // [關鍵修改] 改為呼叫輔助函數輸出列表
                xml += exportSpawnProfiles(detector.spawnProfiles);

                xml += `    </tm:SectionAverageTravelSpeedMeter>\n`;
            }
        });
        xml += '  </tm:Meters>\n';

        // --- 7. Overpasses ---
        if (Object.keys(network.overpasses).length > 0) {
            xml += '  <tm:Overpasses>\n';
            Object.values(network.overpasses).forEach(op => {
                const link1InternalId = op.linkId1;
                const link2InternalId = op.linkId2;
                const topInternalId = op.topLinkId;
                const link1XmlId = linkIdMap.get(link1InternalId);
                const link2XmlId = linkIdMap.get(link2InternalId);
                if (link1XmlId === undefined || link2XmlId === undefined) return;
                const bottomInternalId = topInternalId === link1InternalId ? link2InternalId : link1InternalId;
                const bottomXmlId = linkIdMap.get(bottomInternalId);
                const topXmlId = linkIdMap.get(topInternalId);
                xml += '    <tm:Overpass>\n';
                xml += '      <tm:Elements>\n';
                xml += `        <tm:Element><tm:Id>0</tm:Id><tm:Type>Segment</tm:Type><tm:LinkId>${bottomXmlId}</tm:LinkId><tm:SegmentId>0</tm:SegmentId></tm:Element>\n`;
                xml += `        <tm:Element><tm:Id>1</tm:Id><tm:Type>Segment</tm:Type><tm:LinkId>${topXmlId}</tm:LinkId><tm:SegmentId>0</tm:SegmentId></tm:Element>\n`;
                xml += '      </tm:Elements>\n';
                xml += '      <tm:ElementaryPairs>\n';
                xml += '        <tm:Pair><tm:Bottom>0</tm:Bottom><tm:Top>1</tm:Top></tm:Pair>\n';
                xml += '      </tm:ElementaryPairs>\n';
                xml += '    </tm:Overpass>\n';
            });
            xml += '  </tm:Overpasses>\n';
        }

        // --- 8. GeoAnchors ---
        if (Object.keys(network.pushpins).length > 0) {
            xml += '  <tm:GeoAnchors>\n';
            Object.values(network.pushpins).forEach(pin => {
                xml += '    <tm:Anchor>\n';
                xml += `      <tm:x>${pin.x.toFixed(4)}</tm:x>\n`;
                xml += `      <tm:y>${(pin.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y>\n`;
                xml += `      <tm:lat>${pin.lat.toFixed(8)}</tm:lat>\n`;
                xml += `      <tm:lon>${pin.lon.toFixed(8)}</tm:lon>\n`;
                xml += '    </tm:Anchor>\n';
            });
            xml += '  </tm:GeoAnchors>\n';
        }

        // --- 9. Parking Lots ---
        if (Object.keys(network.parkingLots).length > 0) {
            xml += '  <tm:ParkingLots>\n';
            Object.values(network.parkingLots).forEach(pl => {
                xml += '    <tm:ParkingLot>\n';
                xml += `      <tm:id>${pl.id}</tm:id>\n`;
                xml += `      <tm:name>${pl.name}</tm:name>\n`;
                xml += `      <tm:carCapacity>${pl.carCapacity}</tm:carCapacity>\n`;
                xml += `      <tm:motoCapacity>${pl.motoCapacity}</tm:motoCapacity>\n`;
                // [新增] 匯出 Attraction Probability
                xml += `      <tm:attractionProb>${pl.attractionProb || 0}</tm:attractionProb>\n`;
                // [新增] 匯出 Stay Duration
                xml += `      <tm:stayDuration>${pl.stayDuration || 0}</tm:stayDuration>\n`;
                xml += '      <tm:Boundary>\n';
                const polygon = pl.konvaGroup.findOne('.parking-lot-shape');
                if (!polygon) return;
                const flatPoints = polygon.points();
                for (let i = 0; i < flatPoints.length; i += 2) {
                    const lx = flatPoints[i];
                    const ly = flatPoints[i + 1];
                    const absX = pl.konvaGroup.x() + lx * pl.konvaGroup.scaleX();
                    const absY = pl.konvaGroup.y() + ly * pl.konvaGroup.scaleY();
                    xml += `        <tm:Point><tm:x>${absX.toFixed(4)}</tm:x><tm:y>${(absY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`;
                }
                xml += '      </tm:Boundary>\n';
                const gatesInLot = Object.values(network.parkingGates).filter(g => g.parkingLotId === pl.id);
                if (gatesInLot.length > 0) {
                    xml += '      <tm:ParkingGates>\n';
                    gatesInLot.forEach(gate => {
                        xml += '        <tm:ParkingGate>\n';
                        xml += `          <tm:id>${gate.id}</tm:id>\n`;
                        xml += `          <tm:gateType>${gate.gateType}</tm:gateType>\n`;
                        xml += '          <tm:Geometry>\n';
                        const absX = gate.konvaGroup.x();
                        const absY = gate.konvaGroup.y();
                        const absW = gate.width * gate.konvaGroup.scaleX();
                        const absH = gate.height * gate.konvaGroup.scaleY();
                        xml += `            <tm:x>${absX.toFixed(4)}</tm:x>\n`;
                        xml += `            <tm:y>${(absY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y>\n`;
                        xml += `            <tm:width>${absW.toFixed(4)}</tm:width>\n`;
                        xml += `            <tm:height>${absH.toFixed(4)}</tm:height>\n`;
                        xml += `            <tm:rotation>${(gate.rotation || 0).toFixed(4)}</tm:rotation>\n`;
                        xml += '          </tm:Geometry>\n';
                        xml += '        </tm:ParkingGate>\n';
                    });
                    xml += '      </tm:ParkingGates>\n';
                }
                xml += '    </tm:ParkingLot>\n';
            });
            xml += '  </tm:ParkingLots>\n';
        }

        // --- 10. Unlinked Gates ---
        const unlinkedGates = Object.values(network.parkingGates).filter(g => !g.parkingLotId);
        if (unlinkedGates.length > 0) {
            xml += '  <tm:UnlinkedParkingGates>\n';
            unlinkedGates.forEach(gate => {
                xml += '    <tm:ParkingGate>\n';
                xml += `      <tm:id>${gate.id}</tm:id>\n`;
                xml += `      <tm:gateType>${gate.gateType}</tm:gateType>\n`;
                xml += '      <tm:Geometry>\n';
                const absX = gate.konvaGroup.x();
                const absY = gate.konvaGroup.y();
                const absW = gate.width * gate.konvaGroup.scaleX();
                const absH = gate.height * gate.konvaGroup.scaleY();
                xml += `        <tm:x>${absX.toFixed(4)}</tm:x>\n`;
                xml += `        <tm:y>${(absY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y>\n`;
                xml += `        <tm:width>${absW.toFixed(4)}</tm:width>\n`;
                xml += `        <tm:height>${absH.toFixed(4)}</tm:height>\n`;
                xml += `        <tm:rotation>${(gate.rotation || 0).toFixed(4)}</tm:rotation>\n`;
                xml += '      </tm:Geometry>\n';
                xml += '    </tm:ParkingGate>\n';
            });
            xml += '  </tm:UnlinkedParkingGates>\n';
        }

        // --- 11. Land Use Zones ---
        if (network.zones && Object.keys(network.zones).length > 0) {
            xml += '  <tm:LandUseZones>\n';
            Object.values(network.zones).forEach(zone => {
                xml += '    <tm:Zone>\n';
                xml += `      <tm:id>${zone.id}</tm:id>\n`;
                xml += `      <tm:name>${zone.name || zone.id}</tm:name>\n`;
                xml += `      <tm:zoneType>${zone.zoneType || 'R1'}</tm:zoneType>\n`;
                xml += '      <tm:parameters>\n';
                xml += `        <tm:bcr>${(zone.bcr !== undefined ? zone.bcr : 0.6).toFixed(4)}</tm:bcr>\n`;
                xml += `        <tm:far>${(zone.far !== undefined ? zone.far : 2.0).toFixed(4)}</tm:far>\n`;
                xml += `        <tm:customPop>${zone.customPop !== null && zone.customPop !== undefined ? zone.customPop : ''}</tm:customPop>\n`;
                xml += `        <tm:customEmp>${zone.customEmp !== null && zone.customEmp !== undefined ? zone.customEmp : ''}</tm:customEmp>\n`;
                xml += `        <tm:autoCalculateTraffic>${zone.autoCalculateTraffic !== false}</tm:autoCalculateTraffic>\n`;
                xml += '      </tm:parameters>\n';
                xml += '      <tm:Boundary>\n';
                const polygon = zone.konvaGroup.findOne('.zone-shape');
                if (polygon) {
                    const flatPoints = polygon.points();
                    for (let i = 0; i < flatPoints.length; i += 2) {
                        const lx = flatPoints[i];
                        const ly = flatPoints[i + 1];
                        const absX = zone.konvaGroup.x() + lx * zone.konvaGroup.scaleX();
                        const absY = zone.konvaGroup.y() + ly * zone.konvaGroup.scaleY();
                        xml += `        <tm:Point><tm:x>${absX.toFixed(4)}</tm:x><tm:y>${(absY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Point>\n`;
                    }
                }
                xml += '      </tm:Boundary>\n';
                if (zone.accessNodes && zone.accessNodes.length > 0) {
                    xml += '      <tm:Connectors>\n';
                    zone.accessNodes.forEach(conn => {
                        xml += '        <tm:Connector>\n';
                        xml += `          <tm:id>${conn.id}</tm:id>\n`;
                        const mappedTarget = (typeof linkIdMap !== 'undefined' && linkIdMap.get(conn.linkId) !== undefined) ? linkIdMap.get(conn.linkId) : conn.linkId;
                        xml += `          <tm:targetLinkId>${mappedTarget}</tm:targetLinkId>\n`;
                        xml += `          <tm:offsetRatio>${(conn.offsetRatio || 0.5).toFixed(4)}</tm:offsetRatio>\n`;
                        xml += `          <tm:gateType>${conn.gateType || 'bidirectional'}</tm:gateType>\n`;
                        const ax = conn.accessPoint ? conn.accessPoint.x : 0;
                        const ay = conn.accessPoint ? conn.accessPoint.y * C_SYSTEM_Y_INVERT : 0;
                        xml += `          <tm:accessX>${ax.toFixed(4)}</tm:accessX>\n`;
                        xml += `          <tm:accessY>${ay.toFixed(4)}</tm:accessY>\n`;
                        xml += '        </tm:Connector>\n';
                    });
                    xml += '      </tm:Connectors>\n';
                }
                xml += '    </tm:Zone>\n';
            });
            xml += '  </tm:LandUseZones>\n';
        }

        xml += '</tm:TrafficModel>';

        return xml; // <--- 修改這裡：直接回傳字串
    }

    // 2. 覆蓋舊的 exportXML 函數 (用於按鈕點擊)
    function exportXML() {
        const xml = serializeNetworkToXML();
        try {
            localStorage.setItem('simTrafficFlow_exportedNetwork', xml);
        } catch (e) {
            console.warn("Could not save network to localStorage:", e);
        }
        const blob = new Blob([xml], { type: 'application/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'traffic_network.sim';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // --- 新增：XML 解析輔助函數 ---
    // 安全地獲取指定標籤名稱的直接子元素 (忽略 tm: 前綴)
    function getChildrenByLocalName(parent, localName) {
        if (!parent) return [];
        return Array.from(parent.children).filter(child => {
            // 兼容各種瀏覽器的 XML 解析行為
            const nodeName = child.localName || child.baseName || child.nodeName.split(':').pop();
            return nodeName === localName;
        });
    }

    // 安全地獲取單個子元素的值
    function getChildValue(parent, localName) {
        const children = getChildrenByLocalName(parent, localName);
        return children.length > 0 ? children[0].textContent : null;
    }

    function createBackground(pos) {
        const id = window.generateId('background');
        const bgObject = {
            id,
            type: 'Background',
            name: `Background ${idCounter}`, // 給予預設名稱
            x: pos.x,
            y: pos.y,
            width: 200,
            height: 150,
            scale: 1.0,
            opacity: 50,
            locked: false, // 預設不鎖定，可個別操作
            imageDataUrl: null,
            imageType: null,
            konvaGroup: null,
            konvaTransformer: null
        };

        const group = new Konva.Group({
            id: id,
            x: bgObject.x,
            y: bgObject.y,
            width: bgObject.width,
            height: bgObject.height,
            draggable: true,
            name: 'background-group'
        });

        const image = new Konva.Image({ x: 0, y: 0, width: bgObject.width, height: bgObject.height, listening: true });
        const hitArea = new Konva.Rect({ x: 0, y: 0, width: bgObject.width, height: bgObject.height, fill: 'rgba(0,0,0,0.01)', listening: true });
        const border = new Konva.Rect({ x: 0, y: 0, width: bgObject.width, height: bgObject.height, stroke: '#007bff', strokeWidth: 2, dash: [5, 5], listening: false });

        group.add(image, hitArea, border);
        layer.add(group);
        group.moveToBottom();

        bgObject.konvaGroup = group;
        bgObject.konvaImage = image;
        bgObject.konvaHitArea = hitArea;
        bgObject.konvaBorder = border;

        network.backgrounds[id] = bgObject;
        return bgObject;
    }
    function deleteBackground(id) {
        const bg = network.backgrounds[id];
        if (!bg) return;
        if (bg.konvaTransformer) {
            bg.konvaTransformer.destroy();
            bg.konvaTransformer = null;
        }
        if (bg.konvaGroup) {
            bg.konvaGroup.destroy();
            bg.konvaGroup = null;
        }
        delete network.backgrounds[id];
        layer.batchDraw();
    }
    function initBackgroundLock() {
        const lockCheckbox = document.getElementById('bg-lock-checkbox');
        const lockIcon = document.getElementById('bg-lock-icon');

        if (!lockCheckbox) return;

        lockCheckbox.addEventListener('change', (e) => {
            const isLocked = e.target.checked;
            let deselected = false;

            // --- [修正] 遍歷所有背景圖層 ---
            Object.values(network.backgrounds).forEach(bg => {
                bg.locked = isLocked;

                if (bg.konvaGroup) {
                    bg.konvaGroup.draggable(!isLocked);
                    bg.konvaGroup.listening(!isLocked);
                }
                if (bg.konvaHitArea) {
                    bg.konvaHitArea.listening(!isLocked);
                }

                // 如果背景被鎖定且當前選中的是此背景，則取消選取
                if (isLocked && selectedObject && selectedObject.id === bg.id) {
                    deselected = true;
                }
            });

            if (deselected) {
                deselectAll();
            }

            if (lockIcon) {
                lockIcon.className = isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
            }

            layer.batchDraw();
            saveState();
        });
    }

    function updateBackgroundLockState() {
        const lockSection = document.getElementById('bg-lock-section');
        const lockDivider = document.getElementById('bg-lock-divider');
        const lockCheckbox = document.getElementById('bg-lock-checkbox');
        const lockIcon = document.getElementById('bg-lock-icon');

        if (!lockSection || !lockCheckbox) return;

        const bgs = Object.values(network.backgrounds);

        // --- [修正] 根據是否有任何背景圖層來判斷 ---
        if (bgs.length > 0) {
            lockSection.style.display = 'flex';
            if (lockDivider) lockDivider.style.display = 'block';

            // 以整體狀態為準：若全部鎖定則顯示勾選
            const allLocked = bgs.every(bg => bg.locked);
            lockCheckbox.checked = allLocked;

            if (lockIcon) {
                lockIcon.className = allLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
            }
        } else {
            lockSection.style.display = 'none';
            if (lockDivider) lockDivider.style.display = 'none';
        }
    }

    // --- 替換 updateBackgroundLockState 函數 ---
    function updateBackgroundLockState() {
        const lockSection = document.getElementById('bg-lock-section');
        const lockDivider = document.getElementById('bg-lock-divider');
        const lockCheckbox = document.getElementById('bg-lock-checkbox');
        const lockIcon = document.getElementById('bg-lock-icon');

        if (!lockSection || !lockCheckbox) return;

        if (network.background) {
            // [強制修正] 直接設定為 'flex'，確保瀏覽器一定會顯示它
            // 原本的 '' 依賴 CSS 檔案，若 CSS 有快取問題可能導致失敗
            lockSection.style.display = 'flex';

            if (lockDivider) {
                // 分隔線通常是 block 或 inline-block，這裡設為 block 確保顯示
                lockDivider.style.display = 'block';
            }

            // 同步狀態
            lockCheckbox.checked = network.background.locked || false;
            if (lockIcon) {
                lockIcon.className = network.background.locked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
            }

            console.log("Force showing bg-lock-section: display set to flex");
        } else {
            // 無背景時隱藏
            lockSection.style.display = 'none';
            if (lockDivider) lockDivider.style.display = 'none';
        }
    }

    // --- GEO PUSHPIN FUNCTIONS ---

    function createPushpin(pos, lat = 0.0, lon = 0.0) {
        // 限制最多只能有兩個圖釘
        if (Object.keys(network.pushpins).length >= 2) {
            alert("最多只能設定兩個座標圖釘 (Max 2 Geo Pins allowed).");
            return null;
        }

        const id = window.generateId('pin');
        const pushpin = {
            id,
            type: 'Pushpin',
            x: pos.x,
            y: pos.y,
            lat: lat,
            lon: lon,
            konvaGroup: new Konva.Group({
                id,
                x: pos.x,
                y: pos.y,
                draggable: true,
                name: 'pushpin-group'
            })
        };

        // 繪製圖釘外觀
        const pinShape = new Konva.Circle({
            radius: 10,
            fill: '#ff0000',
            stroke: 'white',
            strokeWidth: 2,
            shadowColor: 'black',
            shadowBlur: 5,
            shadowOpacity: 0.5
        });

        const pinLabel = new Konva.Text({
            text: '📌',
            fontSize: 20,
            x: -10,
            y: -25,
            listening: false
        });

        // 顯示座標文字 (簡化版)
        const coordText = new Konva.Text({
            text: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
            fontSize: 10,
            y: 12,
            fill: 'blue',
            align: 'center',
            listening: false
        });
        coordText.offsetX(coordText.width() / 2);
        pushpin.konvaText = coordText; // 儲存參照以便更新

        pushpin.konvaGroup.add(pinShape, pinLabel, coordText);

        // 拖曳事件：更新資料模型與介面
        pushpin.konvaGroup.on('dragmove', () => {
            pushpin.x = pushpin.konvaGroup.x();
            pushpin.y = pushpin.konvaGroup.y();
            if (selectedObject && selectedObject.id === pushpin.id) {
                // 如果你希望在拖曳時更新屬性面板的 X, Y (選擇性)
            }
        });

        pushpin.konvaGroup.on('dragend', () => {
            // 拖曳結束確保位置更新
            pushpin.x = pushpin.konvaGroup.x();
            pushpin.y = pushpin.konvaGroup.y();
        });

        network.pushpins[id] = pushpin;
        layer.add(pushpin.konvaGroup);
        drawPushpin(pushpin); // 初次繪製
        return pushpin;
    }

    function drawPushpin(pushpin) {
        // 用於更新視覺上的文字
        if (pushpin.konvaText) {
            pushpin.konvaText.text(`${pushpin.lat.toFixed(5)}, ${pushpin.lon.toFixed(5)}`);
            pushpin.konvaText.offsetX(pushpin.konvaText.width() / 2);
        }
    }

    function deletePushpin(id) {
        const pin = network.pushpins[id];
        if (!pin) return;
        pin.konvaGroup.destroy();
        delete network.pushpins[id];
    }


    /**
     * 更新雙向道路的幾何位置以符合新的分隔島寬度
     * @param {Object} linkA - 當前選取的 Link 物件
     * @param {number} newMedianWidth - 新的分隔島寬度
     */
    function updatePairedLinksGeometry(linkA, newMedianWidth) {
        if (!linkA.pairInfo || !linkA.pairInfo.pairId) return;

        const linkB = network.links[linkA.pairInfo.pairId];
        if (!linkB) return; // 配對路段已遺失

        // 1. 驗證節點數量是否一致 (防止使用者手動刪減過節點導致無法配對)
        if (linkA.waypoints.length !== linkB.waypoints.length) {
            alert("Cannot update geometry: The two links have different number of waypoints (likely edited manually).");
            return;
        }

        // 2. 計算目前的「虛擬中心線 (Center Line)」
        // 邏輯：取 A 的點 和 B (反轉後) 的點的平均值
        const centerLinePoints = [];
        const pointsA = linkA.waypoints;
        const pointsB = [...linkB.waypoints].reverse(); // B 是反向的，需轉正來對齊 A

        for (let i = 0; i < pointsA.length; i++) {
            const pA = pointsA[i];
            const pB = pointsB[i];
            centerLinePoints.push({
                x: (pA.x + pB.x) / 2,
                y: (pA.y + pB.y) / 2
            });
        }

        // 3. 計算新的偏移量
        const widthA = getLinkTotalWidth(linkA);
        const widthB = getLinkTotalWidth(linkB);

        // 取得中心線第一個路段的法向量 (指向右側)
        if (centerLinePoints.length < 2) return;
        const vecCenter = normalize(getVector(centerLinePoints[0], centerLinePoints[1]));
        const normalCenter = getNormal(vecCenter); // 指向右側

        // 向量 Center -> A，用內積判斷 A 在左邊還是右邊
        const vecToA = getVector(centerLinePoints[0], pointsA[0]);
        const dotProd = vecToA.x * normalCenter.x + vecToA.y * normalCenter.y;
        const isARight = dotProd > 0;

        // 計算偏移距離 (半路寬 + 半分隔島)
        const distA = (widthA / 2) + (newMedianWidth / 2);
        const distB = (widthB / 2) + (newMedianWidth / 2);

        let offsetA = isARight ? distA : -distA;
        let offsetB = isARight ? -distB : distB; // B 在 A 的對面

        // 4. 生成新中心線座標
        const oldPointsA = [...linkA.waypoints];
        const oldPointsB = [...linkB.waypoints];

        const newPointsA = getOffsetPolyline(centerLinePoints, offsetA);
        let newPointsB = getOffsetPolyline(centerLinePoints, offsetB);
        newPointsB.reverse(); // B 的座標需要再次反轉回反向

        // 5. 套用更新 Waypoints
        linkA.waypoints = newPointsA;
        linkB.waypoints = newPointsB;
        linkA.pairInfo.medianWidth = newMedianWidth;
        linkB.pairInfo.medianWidth = newMedianWidth;

        // ★★★ [修復重點]：根據不同的幾何模式，連動更新實體標線 ★★★
        const updateStrokes = (link, oldWp, newWp) => {
            if (link.geometryType === 'parametric') {
                // 如果是 Parametric 模式，直接呼叫數學引擎重算標線
                generateParametricStrokes(link);
            } else if (link.geometryType === 'lane-based' && link.strokes) {
                // 如果是純手繪 Lane-based 模式，將所有自訂標線依照中心線的位移量進行平移
                const deltaStart = getVector(oldWp[0], newWp[0]);
                link.strokes.forEach(stroke => {
                    stroke.points = stroke.points.map(p => add(p, deltaStart));
                });
                // 重新校正虛擬中心線
                updateLaneBasedGeometry(link);
            }
        };

        updateStrokes(linkA, oldPointsA, newPointsA);
        updateStrokes(linkB, oldPointsB, newPointsB);

        // 6. 重繪與連動更新
        drawLink(linkA);
        drawLink(linkB);

        // 更新連接線、偵測器、路標位置
        [linkA, linkB].forEach(l => {
            updateConnectionEndpoints(l.id);
            updateAllDetectorsOnLink(l.id);
            updateFlowPointsOnLink(l.id);
            updateRoadSignsOnLink(l.id);
        });

        updateAllOverpasses();

        // 如果目前有點選物件，重繪控制點
        if (selectedObject && (selectedObject.id === linkA.id || selectedObject.id === linkB.id)) {
            drawWaypointHandles(selectedObject);
        }

        layer.batchDraw();
    }

    // --- START: NEW OVERPASS MANAGEMENT FUNCTIONS ---

    /**
     * 計算兩個矩形的交集。
     * @param {object} r1 - 矩形1 {x, y, width, height}
     * @param {object} r2 - 矩形2 {x, y, width, height}
     * @returns {object|null} - 返回交集矩形或 null (如果不相交)。
     */
    function getIntersectionRect(r1, r2) {
        const x = Math.max(r1.x, r2.x);
        const y = Math.max(r1.y, r2.y);
        const x2 = Math.min(r1.x + r1.width, r2.x + r2.width);
        const y2 = Math.min(r1.y + r1.height, r2.y + r2.height);

        if (x < x2 && y < y2) {
            return { x, y, width: x2 - x, height: y2 - y };
        }
        return null; // 無交集
    }

    /**
     * 根據 overpass 物件的資料，更新 Konva 圖層上 link 的視覺疊放順序。
     * @param {object} overpass - The overpass data object.
     */
    // 完整替換此函數
    function applyOverpassOrder(overpass) {
        if (!overpass) return;

        // 建立一個包含所有 Overpass 關係的依賴圖
        const dependencies = {}; // key: linkId, value: Set of linkIds that should be below it
        Object.values(network.overpasses).forEach(op => {
            const top = op.topLinkId;
            const bottom = (op.linkId1 === top) ? op.linkId2 : op.linkId1;
            if (!dependencies[top]) dependencies[top] = new Set();
            dependencies[top].add(bottom);
        });

        // 使用拓撲排序的思想來決定繪製順序
        const sortedLinks = [];
        const allLinkIds = new Set(Object.keys(network.links));

        // 找到所有沒有任何 Link 在其之上的 Link (入度為 0 的節點)
        let currentLayer = Object.keys(network.links).filter(id =>
            !Object.values(dependencies).some(deps => deps.has(id))
        );

        while (currentLayer.length > 0) {
            sortedLinks.push(...currentLayer);
            const nextLayer = new Set();

            currentLayer.forEach(bottomId => {
                // 找到所有直接依賴於 currentLayer 中 Link 的上層 Link
                Object.entries(dependencies).forEach(([topId, deps]) => {
                    if (deps.has(bottomId)) {
                        deps.delete(bottomId); // 移除已處理的依賴
                        if (deps.size === 0) {
                            nextLayer.add(topId);
                            delete dependencies[topId];
                        }
                    }
                });
            });
            currentLayer = [...nextLayer];
        }

        // 將排序後的 Link 依序移動到圖層頂部，索引越大的越靠上
        for (const linkId of sortedLinks) {
            const link = network.links[linkId];
            if (link && link.konvaGroup) {
                link.konvaGroup.moveToTop();
            }
        }

        // 將所有節點和 Overpass 框移動到最頂層
        Object.values(network.nodes).forEach(n => n.konvaShape.moveToTop());
        Object.values(network.overpasses).forEach(op => {
            if (op.konvaRect) op.konvaRect.moveToTop();
        });
    }

    /**
     * 遍歷所有 link，偵測交叉點並創建 Overpass 物件和其視覺表示。
     * [修正] 排除共用節點的 Link，避免在路口中心產生錯誤的紅色方框。
     */
    function updateAllOverpasses() {
        // 1. 清理舊的 Overpass (這會清除所有畫面上的紅框)
        Object.values(network.overpasses).forEach(op => {
            if (op.konvaRect) op.konvaRect.destroy();
        });
        network.overpasses = {};

        const linkIds = Object.keys(network.links);

        // 2. 遍歷所有 Link 對
        for (let i = 0; i < linkIds.length; i++) {
            for (let j = i + 1; j < linkIds.length; j++) {
                const link1 = network.links[linkIds[i]];
                const link2 = network.links[linkIds[j]];

                if (!link1 || !link2) continue;

                // --- [關鍵]：如果兩條路共用節點（相連），則跳過檢查 ---
                // 這能防止路口中心點被誤判為立體交叉（紅色方框）
                if (link1.startNodeId && (link1.startNodeId === link2.startNodeId || link1.startNodeId === link2.endNodeId)) continue;
                if (link1.endNodeId && (link1.endNodeId === link2.startNodeId || link1.endNodeId === link2.endNodeId)) continue;
                // -------------------------------------------------------

                // (後續的幾何檢測代碼保持不變...)
                if (!Konva.Util.haveIntersection(link1.konvaGroup.getClientRect(), link2.konvaGroup.getClientRect())) {
                    continue;
                }

                const traps1 = getLinkTrapeziums(link1);
                const traps2 = getLinkTrapeziums(link2);
                const allIntersectionPoints = [];

                for (const trap1 of traps1) {
                    for (const trap2 of traps2) {
                        for (let k = 0; k < 4; k++) {
                            for (let l = 0; l < 4; l++) {
                                const intersection = lineSegmentIntersection(
                                    trap1[k], trap1[(k + 1) % 4],
                                    trap2[l], trap2[(l + 1) % 4]
                                );
                                if (intersection) allIntersectionPoints.push(intersection);
                            }
                        }
                        for (const vertex of trap1) {
                            if (isPointInPolygon(vertex, trap2)) allIntersectionPoints.push(vertex);
                        }
                        for (const vertex of trap2) {
                            if (isPointInPolygon(vertex, trap1)) allIntersectionPoints.push(vertex);
                        }
                    }
                }

                if (allIntersectionPoints.length > 0) {
                    const intersectionBox = getBoundingBoxOfPoints(allIntersectionPoints);
                    const id = `overpass_${link1.id}_${link2.id}`;
                    const rect = new Konva.Rect({
                        id: id,
                        x: intersectionBox.x, y: intersectionBox.y,
                        width: intersectionBox.width, height: intersectionBox.height,
                        stroke: 'red', strokeWidth: 2 / stage.scaleX(),
                        fill: 'rgba(255, 0, 0, 0.1)', listening: true,
                    });
                    layer.add(rect);
                    const overpass = {
                        id: id, type: 'Overpass',
                        linkId1: link1.id, linkId2: link2.id,
                        topLinkId: network.overpasses[id]?.topLinkId || link2.id,
                        konvaRect: rect,
                    };
                    network.overpasses[id] = overpass;
                    applyOverpassOrder(overpass);
                }
            }
        }

        Object.values(network.overpasses).forEach(op => {
            if (op.konvaRect) op.konvaRect.moveToTop();
        });
        layer.batchDraw();
    }
    // --- START: NEW GEOMETRY HELPERS FOR PRECISE INTERSECTION ---

    /**
     * 將一個 Link 物件轉換為構成它的一系列梯形多邊形。
     * @param {object} link - The link object.
     * @returns {Array<Array<{x, y}>>} - An array of polygons, where each polygon is an array of 4 points.
     */
    function getLinkTrapeziums(link) {
        if (!link || !link.waypoints || link.waypoints.length < 2) return [];

        const trapeziums = [];
        const totalWidth = getLinkTotalWidth(link);
        const halfWidth = totalWidth / 2;
        const waypoints = link.waypoints;

        for (let i = 0; i < waypoints.length - 1; i++) {
            const p_start = waypoints[i];
            const p_end = waypoints[i + 1];

            // 計算起點和終點的法線向量
            const start_normal = (i === 0)
                ? getNormal(normalize(getVector(p_start, p_end)))
                : getMiterNormal(waypoints[i - 1], p_start, p_end);

            const end_normal = (i >= waypoints.length - 2)
                ? getNormal(normalize(getVector(p_start, p_end)))
                : getMiterNormal(p_start, p_end, waypoints[i + 2]);

            // 計算梯形的四個頂點
            const p1 = add(p_start, scale(start_normal, halfWidth));  // Left-Start
            const p2 = add(p_start, scale(start_normal, -halfWidth)); // Right-Start
            const p3 = add(p_end, scale(end_normal, -halfWidth));     // Right-End
            const p4 = add(p_end, scale(end_normal, halfWidth));      // Left-End

            trapeziums.push([p1, p2, p3, p4]);
        }
        return trapeziums;
    }

    /**
     * 計算兩條線段 p1-p2 和 p3-p4 的交點。
     * @returns {{x, y}|null} - 返回交點座標或 null。
     */
    function lineSegmentIntersection(p1, p2, p3, p4) {
        const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
        if (d === 0) return null; // 平行線

        const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
        const u = -((p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)) / d;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: p1.x + t * (p2.x - p1.x),
                y: p1.y + t * (p2.y - p1.y),
            };
        }
        return null; // 無交點
    }

    /**
     * 使用 Ray-casting 算法檢查一個點是否在多邊形內部。
     * @param {{x, y}} point - The point to check.
     * @param {Array<{x, y}>} polygon - The polygon vertices.
     * @returns {boolean} - True if the point is inside.
     */
    function isPointInPolygon(point, polygon) {
        let isInside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) isInside = !isInside;
        }
        return isInside;
    }

    /**
     * 計算一組點的最小外包圍盒 (AABB)。
     * @param {Array<{x, y}>} points - The array of points.
     * @returns {object|null} - {x, y, width, height} or null if no points.
     */
    function getBoundingBoxOfPoints(points) {
        if (!points || points.length === 0) return null;

        let minX = points[0].x, maxX = points[0].x;
        let minY = points[0].y, maxY = points[0].y;

        for (let i = 1; i < points.length; i++) {
            minX = Math.min(minX, points[i].x);
            maxX = Math.max(maxX, points[i].x);
            minY = Math.min(minY, points[i].y);
            maxY = Math.max(maxY, points[i].y);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    // --- END: NEW GEOMETRY HELPERS FOR PRECISE INTERSECTION ---
    // --- END: NEW OVERPASS MANAGEMENT FUNCTIONS ---

    // --- INITIALIZE ---
    init();

    // Expose for i18n.js to refresh UI on language change
    window.updatePropertiesPanel = updatePropertiesPanel;
    window.updateStatusBar = updateStatusBar;
    Object.defineProperty(window, 'selectedObject', {
        get: () => selectedObject,
        enumerable: true,
        configurable: true
    });
    // ---------------------------------------------------------
    // [新增] OSM 匯入回調處理 (搭載智慧座標對位)
    // 這是 osm_importer.js 執行完成後呼叫的函數
    // ---------------------------------------------------------
    window.handleOSMImportCallback = function (data) {
        const { imageData, widthMeters, heightMeters, bounds } = data;

        // 檢查畫布上是否已有剛好 2 個圖釘
        const currentPins = Object.values(network.pushpins);
        const hasExistingPins = currentPins.length === 2;

        // 預設參數 (如果沒有圖釘時使用)
        let startX = -widthMeters / 2;
        let startY = -heightMeters / 2;
        let finalWidth = widthMeters;
        let finalHeight = heightMeters;
        let rotationDeg = 0;

        if (hasExistingPins) {
            // ==========================================================
            // 執行精準地理對位 (Mercator to Canvas Affine Transform)
            // ==========================================================
            const C1 = currentPins[0];
            const C2 = currentPins[1];

            // 1. 經緯度轉麥卡托投影，確保比例不失真
            function latLonToMercator(lat, lon) {
                const R = 6378137;
                const mx = R * lon * Math.PI / 180;
                const my = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
                return { x: mx, y: my };
            }

            const cm1 = latLonToMercator(C1.lat, C1.lon);
            const cm2 = latLonToMercator(C2.lat, C2.lon);

            // 2. 空間轉換矩陣：麥卡托座標 -> 當前畫布座標
            function geoToCurrentCanvas(lat, lon) {
                const m = latLonToMercator(lat, lon);
                const Xg1 = cm1.x, Yg1 = -cm1.y; // Canvas Y 向下，做反轉
                const Xg2 = cm2.x, Yg2 = -cm2.y;
                const dXg = Xg2 - Xg1, dYg = Yg2 - Yg1;

                const Xp = m.x, Yp = -m.y;
                const dXp = Xp - Xg1, dYp = Yp - Yg1;

                const Lg2 = dXg * dXg + dYg * dYg;
                if (Lg2 === 0) return { x: C1.x, y: C1.y };

                const u = (dXp * dXg + dYp * dYg) / Lg2;
                const v = (dYp * dXg - dXp * dYg) / Lg2;

                const dxc = C2.x - C1.x;
                const dyc = C2.y - C1.y;

                return {
                    x: C1.x + u * dxc - v * dyc,
                    y: C1.y + u * dyc + v * dxc
                };
            }

            // 3. 計算新地圖邊界 (西北、東北、西南) 在畫布上的實際座標
            const pNW = geoToCurrentCanvas(bounds.getNorth(), bounds.getWest());
            const pNE = geoToCurrentCanvas(bounds.getNorth(), bounds.getEast());
            const pSW = geoToCurrentCanvas(bounds.getSouth(), bounds.getWest());

            // 4. 計算對位後的起點、長寬與旋轉角度
            startX = pNW.x;
            startY = pNW.y;

            const dxW = pNE.x - pNW.x;
            const dyW = pNE.y - pNW.y;
            finalWidth = Math.sqrt(dxW * dxW + dyW * dyW);

            const dxH = pSW.x - pNW.x;
            const dyH = pSW.y - pNW.y;
            finalHeight = Math.sqrt(dxH * dxH + dyH * dyH);

            // 旋轉角度轉換為 degrees 提供給 Konva 使用
            rotationDeg = Math.atan2(dyW, dxW) * (180 / Math.PI);
        }

        const id = `background_${++idCounter}`;

        const bgObject = {
            id: id,
            type: 'Background',
            name: `OSM Map ${idCounter}`,
            x: startX,
            y: startY,
            width: finalWidth,
            height: finalHeight,
            scale: 1.0,
            opacity: 100,
            locked: true, // 匯入的真實地圖預設上鎖
            imageDataUrl: imageData,
            imageType: 'PNG',
            geoBounds: {
                north: bounds.getNorth(), south: bounds.getSouth(),
                east: bounds.getEast(), west: bounds.getWest()
            },
            konvaGroup: null, konvaImage: null, konvaBorder: null
        };

        const group = new Konva.Group({
            id: id,
            x: bgObject.x,
            y: bgObject.y,
            width: bgObject.width,
            height: bgObject.height,
            rotation: rotationDeg,  // 套用計算出的旋轉角度
            draggable: false,
            name: 'background-group'
        });

        const imageObj = new Image();
        imageObj.onload = function () {
            const kImage = new Konva.Image({ x: 0, y: 0, image: imageObj, width: bgObject.width, height: bgObject.height, opacity: 1 });
            const hitArea = new Konva.Rect({ x: 0, y: 0, width: bgObject.width, height: bgObject.height, fill: 'transparent', listening: true });
            const border = new Konva.Rect({ x: 0, y: 0, width: bgObject.width, height: bgObject.height, stroke: '#007bff', strokeWidth: 2 / stage.scaleX(), dash: [10, 10], listening: false });

            group.add(kImage, hitArea, border);
            layer.add(group);

            // 確保被鎖定的地圖圖層移至最下層，並且不攔截點擊事件
            group.moveToBottom();
            bgObject.konvaGroup = group;
            bgObject.konvaImage = kImage;
            bgObject.konvaHitArea = hitArea;
            bgObject.konvaBorder = border;

            network.backgrounds[id] = bgObject;

            if (bgObject.locked) {
                group.listening(false);
            }

            // 【邏輯分歧】如果畫面上原本沒有圖釘，才需要新建圖釘
            if (!hasExistingPins) {
                Object.keys(network.pushpins).forEach(pid => deletePushpin(pid));
                const pinNW = createPushpin({ x: startX, y: startY }, bounds.getNorth(), bounds.getWest());
                const pinSE = createPushpin({ x: startX + finalWidth, y: startY + finalHeight }, bounds.getSouth(), bounds.getEast());
                if (pinNW) pinNW.konvaGroup.draggable(false);
                if (pinSE) pinSE.konvaGroup.draggable(false);
            }

            saveState();
            layer.batchDraw();

            // 顯示對應的提示訊息
            if (hasExistingPins) {
                alert(I18N?.t ? I18N.t(`Map Imported Successfully!\nAligned and scaled based on existing Geo Pins.`) : `地圖已成功匯入！\n並已根據現有圖釘自動校正座標、比例與旋轉。`);
            } else {
                alert(I18N?.t ? I18N.t(`Map Imported Successfully!\nDimensions: ${widthMeters.toFixed(1)}m x ${heightMeters.toFixed(1)}m\nScale auto-calibrated to 1:1.`) : `地圖已成功匯入！\n尺寸: ${widthMeters.toFixed(1)}m x ${heightMeters.toFixed(1)}m\n比例已自動校正。`);
            }
        };
        imageObj.src = imageData;
    };

    /**
     * 處理手動框選路口的核心邏輯 (修正版：Point Mode 自動計算交叉範圍 + 強制更新 Overpass)
     * @param {Array<{x, y}>} polyPoints - 使用者手繪的多邊形頂點陣列
     */
    function processManualIntersection(polyPoints) {
        // ----------------------------------------------------------------
        // 第一階段：決定「切割多邊形 (cuttingPolygon)」與「新節點中心 (cx, cy)」
        // ----------------------------------------------------------------

        let cuttingPolygon = [];
        let cx = 0, cy = 0;

        if (intersectionMode === 'point') {
            const internalIntersections = [];
            const linksToCheck = [];

            // 1. 篩選相關 Link
            Object.values(network.links).forEach(link => {
                const startInside = isPointInPolygon(link.waypoints[0], polyPoints);
                const endInside = isPointInPolygon(link.waypoints[link.waypoints.length - 1], polyPoints);
                if (startInside || endInside) {
                    linksToCheck.push(link);
                } else {
                    for (let i = 0; i < link.waypoints.length - 1; i++) {
                        for (let j = 0; j < polyPoints.length; j++) {
                            const v1 = polyPoints[j];
                            const v2 = polyPoints[(j + 1) % polyPoints.length];
                            if (lineSegmentIntersection(link.waypoints[i], link.waypoints[i + 1], v1, v2)) {
                                linksToCheck.push(link);
                                return;
                            }
                        }
                    }
                }
            });

            // 2. 計算交叉點
            for (let i = 0; i < linksToCheck.length; i++) {
                for (let j = i + 1; j < linksToCheck.length; j++) {
                    const l1 = linksToCheck[i];
                    const l2 = linksToCheck[j];
                    for (let a = 0; a < l1.waypoints.length - 1; a++) {
                        for (let b = 0; b < l2.waypoints.length - 1; b++) {
                            const pt = lineSegmentIntersection(
                                l1.waypoints[a], l1.waypoints[a + 1],
                                l2.waypoints[b], l2.waypoints[b + 1]
                            );
                            if (pt && isPointInPolygon(pt, polyPoints)) {
                                internalIntersections.push(pt);
                            }
                        }
                    }
                }
            }

            if (internalIntersections.length > 0) {
                // 3. 計算包圍盒
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                internalIntersections.forEach(p => {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                });

                // 4. 加上緩衝
                const padding = 5;
                minX -= padding; maxX += padding;
                minY -= padding; maxY += padding;

                cuttingPolygon = [
                    { x: minX, y: minY }, { x: maxX, y: minY },
                    { x: maxX, y: maxY }, { x: minX, y: maxY }
                ];
                cx = (minX + maxX) / 2;
                cy = (minY + maxY) / 2;
            } else {
                // Fallback
                let tx = 0, ty = 0;
                polyPoints.forEach(p => { tx += p.x; ty += p.y; });
                cx = tx / polyPoints.length;
                cy = ty / polyPoints.length;
                const fallbackSize = 2;
                cuttingPolygon = [
                    { x: cx - fallbackSize, y: cy - fallbackSize }, { x: cx + fallbackSize, y: cy - fallbackSize },
                    { x: cx + fallbackSize, y: cy + fallbackSize }, { x: cx - fallbackSize, y: cy + fallbackSize }
                ];
            }
        } else {
            // Zone Mode
            cuttingPolygon = polyPoints;
            let tx = 0, ty = 0;
            polyPoints.forEach(p => { tx += p.x; ty += p.y; });
            cx = tx / polyPoints.length;
            cy = ty / polyPoints.length;
        }

        // ----------------------------------------------------------------
        // 第二階段：執行切割與連接
        // ----------------------------------------------------------------

        const newNode = createNode(cx, cy);
        const linksToRemove = [];
        const linksToAdd = [];
        const linkReplacements = {}; // 記錄母路段與切割後子路段的對應關係

        Object.values(network.links).forEach(link => {
            const intersections = [];
            const isPointInside = (pt) => isPointInPolygon(pt, cuttingPolygon);
            const startInside = isPointInside(link.waypoints[0]);
            const endInside = isPointInside(link.waypoints[link.waypoints.length - 1]);

            if (!startInside && !endInside) {
                let intersectFound = false;
                for (let i = 0; i < link.waypoints.length - 1; i++) {
                    const p1 = link.waypoints[i];
                    const p2 = link.waypoints[i + 1];
                    for (let j = 0; j < cuttingPolygon.length; j++) {
                        const v1 = cuttingPolygon[j];
                        const v2 = cuttingPolygon[(j + 1) % cuttingPolygon.length];
                        if (lineSegmentIntersection(p1, p2, v1, v2)) {
                            intersectFound = true; break;
                        }
                    }
                    if (intersectFound) break;
                }
                if (!intersectFound) return;
            }

            for (let i = 0; i < link.waypoints.length - 1; i++) {
                const p1 = link.waypoints[i];
                const p2 = link.waypoints[i + 1];
                for (let j = 0; j < cuttingPolygon.length; j++) {
                    const v1 = cuttingPolygon[j];
                    const v2 = cuttingPolygon[(j + 1) % cuttingPolygon.length];
                    const intersect = lineSegmentIntersection(p1, p2, v1, v2);
                    if (intersect) {
                        intersections.push({ point: intersect, segIndex: i, dist: vecLen(getVector(p1, intersect)) });
                    }
                }
            }
            intersections.sort((a, b) => (a.segIndex - b.segIndex) || (a.dist - b.dist));

            if (intersections.length === 0) {
                if (startInside && endInside) {
                    linksToRemove.push(link.id);
                    linkReplacements[link.id] = { subLinkIn: null, subLinkOut: null };
                }
            } else {
                if (!startInside && !endInside && intersections.length >= 2) {
                    const entry = intersections[0];
                    const exit = intersections[intersections.length - 1];
                    const p1 = [...link.waypoints.slice(0, entry.segIndex + 1), entry.point];
                    const subLinkIn = createSubLink(link, p1, link.startNodeId, newNode.id, "_In");
                    const p2 = [exit.point, ...link.waypoints.slice(exit.segIndex + 1)];
                    const subLinkOut = createSubLink(link, p2, newNode.id, link.endNodeId, "_Out");
                    linksToAdd.push(subLinkIn, subLinkOut);
                    linksToRemove.push(link.id);
                    linkReplacements[link.id] = { subLinkIn, subLinkOut };
                }
                else if (!startInside && endInside) {
                    const entry = intersections[0];
                    const p = [...link.waypoints.slice(0, entry.segIndex + 1), entry.point];
                    const subLinkIn = createSubLink(link, p, link.startNodeId, newNode.id, "_In");
                    linksToAdd.push(subLinkIn);
                    linksToRemove.push(link.id);
                    linkReplacements[link.id] = { subLinkIn, subLinkOut: null };
                }
                else if (startInside && !endInside) {
                    const exit = intersections[intersections.length - 1];
                    const p = [exit.point, ...link.waypoints.slice(exit.segIndex + 1)];
                    const subLinkOut = createSubLink(link, p, newNode.id, link.endNodeId, "_Out");
                    linksToAdd.push(subLinkOut);
                    linksToRemove.push(link.id);
                    linkReplacements[link.id] = { subLinkIn: null, subLinkOut };
                }
            }
        });

        // 收集受影響的既有外部節點 (以便稍後重新更新幾何與視覺)
        const affectedNodeIds = new Set();

        // 轉移連線、視覺群組、轉向比例與附屬資產至分割後的新子路段
        Object.entries(linkReplacements).forEach(([oldLinkId, { subLinkIn, subLinkOut }]) => {
            const oldLink = network.links[oldLinkId];
            if (!oldLink) return;

            if (subLinkIn && oldLink.startNodeId) {
                affectedNodeIds.add(oldLink.startNodeId);
            }
            if (subLinkOut && oldLink.endNodeId) {
                affectedNodeIds.add(oldLink.endNodeId);
            }

            // 1. 轉移單車道連線 (Connections)
            Object.values(network.connections).forEach(conn => {
                // 原本流入 oldLink 的連線 (在 oldLink.startNode 處)，轉接至 subLinkIn
                if (subLinkIn && conn.destLinkId === oldLinkId) {
                    conn.destLinkId = subLinkIn.id;
                }
                // 原本從 oldLink 流出的連線 (在 oldLink.endNode 處)，轉接至 subLinkOut
                if (subLinkOut && conn.sourceLinkId === oldLinkId) {
                    conn.sourceLinkId = subLinkOut.id;
                }
            });

            // 2. 轉移群組視覺連線 (Group Connection Visuals)
            layer.find('.group-connection-visual').forEach(groupVisual => {
                const meta = groupVisual.getAttr('meta');
                if (!meta) return;

                let updated = false;
                if (subLinkIn && meta.destLinkId === oldLinkId) {
                    meta.destLinkId = subLinkIn.id;
                    updated = true;
                }
                if (subLinkOut && meta.sourceLinkId === oldLinkId) {
                    meta.sourceLinkId = subLinkOut.id;
                    updated = true;
                }
                if (updated) {
                    groupVisual.setAttr('meta', meta);
                }
            });

            // 3. 轉移轉向比例 (Turning Ratios) 與 Synchro 轉向車流量 (synchroTurnVolumes)
            if (subLinkIn && oldLink.startNodeId && network.nodes[oldLink.startNodeId]) {
                const sNode = network.nodes[oldLink.startNodeId];
                if (sNode.turningRatios) {
                    Object.keys(sNode.turningRatios).forEach(fromId => {
                        if (sNode.turningRatios[fromId][oldLinkId] !== undefined) {
                            sNode.turningRatios[fromId][subLinkIn.id] = sNode.turningRatios[fromId][oldLinkId];
                            delete sNode.turningRatios[fromId][oldLinkId];
                        }
                    });
                }
                if (sNode.synchroTurnVolumes) {
                    Object.keys(sNode.synchroTurnVolumes).forEach(fromId => {
                        if (sNode.synchroTurnVolumes[fromId][oldLinkId] !== undefined) {
                            sNode.synchroTurnVolumes[fromId][subLinkIn.id] = sNode.synchroTurnVolumes[fromId][oldLinkId];
                            delete sNode.synchroTurnVolumes[fromId][oldLinkId];
                        }
                    });
                }
            }
            if (subLinkOut && oldLink.endNodeId && network.nodes[oldLink.endNodeId]) {
                const eNode = network.nodes[oldLink.endNodeId];
                if (eNode.turningRatios && eNode.turningRatios[oldLinkId] !== undefined) {
                    eNode.turningRatios[subLinkOut.id] = eNode.turningRatios[oldLinkId];
                    delete eNode.turningRatios[oldLinkId];
                }
                if (eNode.synchroTurnVolumes && eNode.synchroTurnVolumes[oldLinkId] !== undefined) {
                    eNode.synchroTurnVolumes[subLinkOut.id] = eNode.synchroTurnVolumes[oldLinkId];
                    delete eNode.synchroTurnVolumes[oldLinkId];
                }
            }

            // 4. 轉移路段上的附屬資產 (Detectors, Road Signs, Origins, Destinations)
            const origLen = getPolylineLength(oldLink.waypoints);
            const inLen = subLinkIn ? getPolylineLength(subLinkIn.waypoints) : 0;
            const outLen = subLinkOut ? getPolylineLength(subLinkOut.waypoints) : 0;

            Object.values(network.detectors).forEach(det => {
                if (det.linkId === oldLinkId) {
                    if (subLinkIn && det.position <= inLen) {
                        det.linkId = subLinkIn.id;
                    } else if (subLinkOut && det.position >= origLen - outLen) {
                        det.linkId = subLinkOut.id;
                        det.position = Math.max(0, det.position - (origLen - outLen));
                    }
                }
            });

            Object.values(network.roadSigns).forEach(sign => {
                if (sign.linkId === oldLinkId) {
                    if (subLinkIn && sign.position <= inLen) {
                        sign.linkId = subLinkIn.id;
                    } else if (subLinkOut && sign.position >= origLen - outLen) {
                        sign.linkId = subLinkOut.id;
                        sign.position = Math.max(0, sign.position - (origLen - outLen));
                    }
                }
            });

            Object.values(network.origins).forEach(o => {
                if (o.linkId === oldLinkId) {
                    if (subLinkIn && o.position <= inLen) {
                        o.linkId = subLinkIn.id;
                    } else if (subLinkOut && o.position >= origLen - outLen) {
                        o.linkId = subLinkOut.id;
                        o.position = Math.max(0, o.position - (origLen - outLen));
                    }
                }
            });

            Object.values(network.destinations).forEach(d => {
                if (d.linkId === oldLinkId) {
                    if (subLinkIn && d.position <= inLen) {
                        d.linkId = subLinkIn.id;
                    } else if (subLinkOut && d.position >= origLen - outLen) {
                        d.linkId = subLinkOut.id;
                        d.position = Math.max(0, d.position - (origLen - outLen));
                    }
                }
            });

            // 5. 雙向配對資訊 (pairInfo) 轉移
            if (oldLink.pairInfo && oldLink.pairInfo.pairId) {
                const pairRepl = linkReplacements[oldLink.pairInfo.pairId];
                if (pairRepl) {
                    if (subLinkIn && pairRepl.subLinkOut) {
                        subLinkIn.pairInfo = { pairId: pairRepl.subLinkOut.id, type: oldLink.pairInfo.type, medianWidth: oldLink.pairInfo.medianWidth };
                    }
                    if (subLinkOut && pairRepl.subLinkIn) {
                        subLinkOut.pairInfo = { pairId: pairRepl.subLinkIn.id, type: oldLink.pairInfo.type, medianWidth: oldLink.pairInfo.medianWidth };
                    }
                }
            }
        });

        linksToRemove.forEach(id => deleteLink(id));
        linksToAdd.forEach(link => {
            // <--- [新增修正] 根據繼承來的幾何模式，重新計算邊界與標線 --->
            if (link.geometryType === 'parametric') {
                // 呼叫原本寫好的數學引擎，根據新切短的長度重新產生轉向道與標線
                generateParametricStrokes(link);
            } else if (link.geometryType === 'lane-based') {
                // 如果是純手繪 Lane-based 模式，因為不規則多邊形難以完美從中間裁切，
                // 為了避免破圖，安全起見將其降級回 standard 模式
                link.geometryType = 'standard';
            }
            // <------------------------------------------------------->

            layer.add(link.konvaGroup);
            drawLink(link);
        });

        // 更新新路段上繼承的連線端點與資產視覺
        linksToAdd.forEach(link => {
            updateConnectionEndpoints(link.id);
            updateAllDetectorsOnLink(link.id);
            updateFlowPointsOnLink(link.id);
            updateRoadSignsOnLink(link.id);
        });

        // 重新計算並繪製受影響既有節點的連線幾何與視覺
        affectedNodeIds.forEach(nodeId => {
            if (nodeId && nodeId !== newNode.id) {
                redrawNodeConnections(nodeId);
            }
        });

        // --- 這裡呼叫修正後的函數 ---
        autoConnectNode(newNode);

        // 強制更新立體交叉檢查，避免殘留紅框
        updateAllOverpasses();

        layer.batchDraw();
        updatePropertiesPanel(newNode);

        const modeName = intersectionMode === 'zone' ? 'Zone' : 'Point';
        console.log(`Created intersection (${modeName} Mode) with ${linksToAdd.length} links.`);
    }

    /**
     * 輔助：建立分割後的子路段
     */
    function createSubLink(parentLink, waypoints, startNodeId, endNodeId, suffix) {
        // 複製屬性
        const newId = `${parentLink.id}${suffix}_${++idCounter}`; // 確保 ID 唯一

        // 複製車道設定 (深拷貝)
        const newLanes = JSON.parse(JSON.stringify(parentLink.lanes));

        const link = {
            id: newId,
            name: (parentLink.name || parentLink.id) + suffix,
            type: 'Link',
            geometryType: parentLink.geometryType || 'standard', // <--- [修正] 繼承幾何模式
            waypoints: waypoints,
            lanes: newLanes,
            startNodeId: startNodeId,
            endNodeId: endNodeId,
            konvaGroup: new Konva.Group({ id: newId, draggable: false }),
            konvaHandles: [],
        };

        // <--- [修正] 如果母路段是參數化模式，將參數配置深拷貝給子路段 --->
        if (parentLink.parametricConfig) {
            link.parametricConfig = JSON.parse(JSON.stringify(parentLink.parametricConfig));
        }
        if (suffix === '_In' && parentLink.synchroLaneTurns) {
            link.synchroLaneTurns = [...parentLink.synchroLaneTurns];
        }

        network.links[newId] = link;

        // 更新 Node 參照
        if (network.nodes[startNodeId]) network.nodes[startNodeId].outgoingLinkIds.add(newId);
        if (network.nodes[endNodeId]) network.nodes[endNodeId].incomingLinkIds.add(newId);

        return link;
    }

    /**
     * 針對單一節點執行自動連接，邏輯與 Box Selection (autoConnectLanesInSelection) 一致
     * @param {Object} node - 要處理的節點物件
     */
    function autoConnectNode(node) {
        const inLinks = [...node.incomingLinkIds].map(id => network.links[id]).filter(Boolean);
        const outLinks = [...node.outgoingLinkIds].map(id => network.links[id]).filter(Boolean);

        inLinks.forEach(srcLink => {
            outLinks.forEach(dstLink => {
                if (srcLink.id === dstLink.id) return;

                const turnDir = getTurnDirection(srcLink, dstLink);
                if (turnDir === 'u-turn') return; // 略過大迴轉

                // ==================================================
                // [智慧車道對齊邏輯]
                // ==================================================
                let srcStartIdx = 0;
                let dstStartIdx = 0;
                let srcLanesForTurn = srcLink.lanes.length;
                let dstLanesForTurn = dstLink.lanes.length;

                if (turnDir === 'straight') {
                    const srcLL = getLeftPocketCount(srcLink);
                    const dstLL = getLeftPocketCount(dstLink);
                    srcStartIdx = srcLL;
                    dstStartIdx = dstLL;
                    srcLanesForTurn = Math.max(1, srcLink.lanes.length - srcLL - getRightPocketCount(srcLink));
                    dstLanesForTurn = Math.max(1, dstLink.lanes.length - dstLL - getRightPocketCount(dstLink));
                }

                const laneCount = Math.min(srcLanesForTurn, dstLanesForTurn);
                const newIds = [];

                for (let k = 0; k < laneCount; k++) {
                    let srcIdx, dstIdx;

                    if (turnDir === 'right') {
                        srcIdx = srcLink.lanes.length - 1 - k;
                        dstIdx = dstLink.lanes.length - 1 - k;
                    } else {
                        srcIdx = srcStartIdx + k;
                        dstIdx = dstStartIdx + k;
                    }

                    if (srcIdx >= srcLink.lanes.length || dstIdx >= dstLink.lanes.length) continue;

                    const srcMeta = { linkId: srcLink.id, laneIndex: srcIdx, portType: 'end' };
                    const dstMeta = { linkId: dstLink.id, laneIndex: dstIdx, portType: 'start' };

                    const newConn = handleConnection(srcMeta, dstMeta);

                    if (newConn) {
                        newConn.konvaBezier.visible(false); // 隱藏單車道細線
                        newIds.push(newConn.id);
                    }
                }

                if (newIds.length > 0) {
                    drawConnectionGroupVisual(srcLink, dstLink, newIds, node.id);
                }
            });
        });
    }

    // 簡易 Bezier 計算 (給上述 autoConnectNode 使用)
    function calculateBezier(srcLink, srcIdx, dstLink, dstIdx, isTurn) {
        const pStart = getLaneEndpoint(srcLink, srcIdx, false);
        const pEnd = getLaneEndpoint(dstLink, dstIdx, true);

        // 如果不是轉彎，直接直線
        if (!isTurn) return [pStart, pEnd];

        // 簡單控制點
        const tension = 0.5;
        const srcV = normalize(getVector(srcLink.waypoints[srcLink.waypoints.length - 2], srcLink.waypoints[srcLink.waypoints.length - 1]));
        const dstV = normalize(getVector(dstLink.waypoints[0], dstLink.waypoints[1])); // 注意方向

        // 控制點邏輯：Start + Vec * dist * 0.5
        const dist = vecLen(getVector(pStart, pEnd));
        const c1 = add(pStart, scale(srcV, dist * tension));
        const c2 = add(pEnd, scale(dstV, -dist * tension)); // 反向延伸

        return [pStart, c1, c2, pEnd];
    }

    // 取得車道端點 (輔助)
    function getLaneEndpoint(link, laneIdx, isStart) {
        const totalW = getLinkTotalWidth(link);
        let cum = 0;
        for (let i = 0; i < laneIdx; i++) cum += link.lanes[i].width;
        cum += link.lanes[laneIdx].width / 2;
        const offset = cum - totalW / 2;

        const pts = link.waypoints;
        let p1, p2;
        if (isStart) { p1 = pts[0]; p2 = pts[1]; }
        else { p1 = pts[pts.length - 2]; p2 = pts[pts.length - 1]; } // End

        const v = normalize(getVector(p1, p2));
        const n = getNormal(v);

        // 若是 Start，點是 p1 偏移；若是 End，點是 p2 偏移
        const targetP = isStart ? p1 : p2;
        return add(targetP, scale(n, offset));
    }

    window.network = network;
    window.layer = layer;
    window.stage = stage;
    window.createNode = createNode;
    window.createLink = createLink;
    window.createConnection = createConnection;
    window.getLanePath = getLanePath;
    window.drawLink = drawLink;
    window.updateConnectionEndpoints = updateConnectionEndpoints;
    window.updateAllDetectorsOnLink = updateAllDetectorsOnLink;
    window.updateFlowPointsOnLink = updateFlowPointsOnLink;
    window.updateRoadSignsOnLink = updateRoadSignsOnLink;
    window.updateAllOverpasses = updateAllOverpasses;
    window.redrawNodeConnections = redrawNodeConnections;
    window.saveState = saveState;

    // --- 補充暴露給 AI (CDP) 呼叫的基礎函數 ---
    window.createDetector = createDetector;
    window.createRoadSign = createRoadSign;
    window.createOrigin = createOrigin;
    window.createDestination = createDestination;
    window.createRoadMarking = createRoadMarking;
    window.createPushpin = createPushpin;
    window.createParkingLot = createParkingLot;
    window.createParkingGate = createParkingGate;

    // 暴露高階演算法 (用於自動運算)
    window.handleConnection = handleConnection;
    window.autoConnectLanesInSelection = autoConnectLanesInSelection;
    window.autoMergeLinksInSelection = autoMergeLinksInSelection;
    window.processManualIntersection = processManualIntersection;

    // 暴露狀態與 UI 控制
    window.selectObject = selectObject;
    window.deselectAll = deselectAll;
    window.deleteSelectedObject = deleteSelectedObject;
    window.performUndo = performUndo;
    window.performRedo = performRedo;
    window.serializeNetworkToXML = serializeNetworkToXML;
    window.createAndLoadNetworkFromXML = createAndLoadNetworkFromXML;

    // =========================================================================
    // [新增] AI Agent 專用 API (Agent API)
    // 透過 CDP 的 Runtime.evaluate 呼叫這些函數，可繞過滑鼠事件，直接建立與修改路網
    // =========================================================================

    // =========================================================================
    // [新增] 槽化引道巨集生成器 (Slip Lane Generator) 模組
    // =========================================================================

    // 輔助函數：計算兩條無限長直線的交點
    function getLineIntersection(p1, v1, p2, v2) {
        const cross = v1.x * v2.y - v1.y * v2.x;
        if (Math.abs(cross) < 1e-6) return null; // 兩線平行
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const t1 = (dx * v2.y - dy * v2.x) / cross;
        return {
            x: p1.x + t1 * v1.x,
            y: p1.y + t1 * v1.y
        };
    }

    // 輔助函數：精準切割路段並維持拓撲
    function splitLinkAtDistance(link, splitDist) {
        const len = getPolylineLength(link.waypoints);
        if (splitDist <= 5 || splitDist >= len - 5) return { upstream: link, downstream: link, splitNode: null };

        const ptData = getPointAlongPolyline(link.waypoints, splitDist);
        const point = ptData.point;

        let segIndex = 0, curL = 0;
        for (let i = 0; i < link.waypoints.length - 1; i++) {
            const d = vecLen(getVector(link.waypoints[i], link.waypoints[i + 1]));
            if (curL + d >= splitDist - 0.01) { segIndex = i; break; }
            curL += d;
        }

        const splitNode = createNode(point.x, point.y);
        const wpUpstream = [...link.waypoints.slice(0, segIndex + 1), point];
        const wpDownstream = [point, ...link.waypoints.slice(segIndex + 1)];

        const originalEndNode = link.endNodeId;
        const originalId = link.id;

        // 1. 建立下游新路段
        const downstreamLink = createLink(wpDownstream, link.lanes.length);
        downstreamLink.name = link.name ? link.name + " (Cont.)" : "";
        downstreamLink.geometryType = link.geometryType;
        downstreamLink.lanes = JSON.parse(JSON.stringify(link.lanes));
        if (link.parametricConfig) downstreamLink.parametricConfig = JSON.parse(JSON.stringify(link.parametricConfig));

        downstreamLink.startNodeId = splitNode.id;
        downstreamLink.endNodeId = originalEndNode;
        splitNode.outgoingLinkIds.add(downstreamLink.id);
        if (originalEndNode && network.nodes[originalEndNode]) {
            network.nodes[originalEndNode].incomingLinkIds.delete(originalId);
            network.nodes[originalEndNode].incomingLinkIds.add(downstreamLink.id);
        }

        // 2. 修改原始路段 (變成上游)
        link.waypoints = wpUpstream;
        link.endNodeId = splitNode.id;
        splitNode.incomingLinkIds.add(link.id);

        // 3. 轉移離開該路段的連線與資產
        Object.values(network.connections).forEach(conn => {
            if (conn.sourceLinkId === originalId) conn.sourceLinkId = downstreamLink.id;
        });
        layer.find('.group-connection-visual').forEach(g => {
            const meta = g.getAttr('meta');
            if (meta && meta.sourceLinkId === originalId) {
                meta.sourceLinkId = downstreamLink.id;
                g.setAttr('meta', meta);
            }
        });

        // 4. 連接直行車道
        const straightConnIds = [];
        for (let i = 0; i < link.lanes.length; i++) {
            const c = handleConnection(
                { linkId: link.id, laneIndex: i, portType: 'end' },
                { linkId: downstreamLink.id, laneIndex: i, portType: 'start' }
            );
            if (c) { c.konvaBezier.visible(false); straightConnIds.push(c.id); }
        }
        if (straightConnIds.length > 0) {
            drawConnectionGroupVisual(link, downstreamLink, straightConnIds, splitNode.id);
        }

        // 5. 更新標線幾何 (強制避免 Lane-based 模式破圖)
        if (link.geometryType === 'parametric') generateParametricStrokes(link);
        if (downstreamLink.geometryType === 'parametric') generateParametricStrokes(downstreamLink);
        else if (link.geometryType === 'lane-based') {
            link.geometryType = 'standard';
            downstreamLink.geometryType = 'standard';
        }

        drawLink(link); drawLink(downstreamLink);
        updateDependencies(link); updateDependencies(downstreamLink);

        return { upstream: link, downstream: downstreamLink, splitNode };
    }

    // 主函數：巨集生成器 (支援動態上下游距離，已移除綠色槽化島)
    window.generateSlipLaneMacro = function (srcLinkId, dstLinkId, groupObj, upDist = 20, downDist = 20) {
        const originalSrc = network.links[srcLinkId];
        const originalDst = network.links[dstLinkId];
        if (!originalSrc || !originalDst) return;

        const srcLen = getPolylineLength(originalSrc.waypoints);
        const dstLen = getPolylineLength(originalDst.waypoints);

        // 使用傳入的距離作為防呆判斷依據
        if (srcLen <= upDist + 5 || dstLen <= downDist + 5) {
            alert(`路段長度不足，無法生成右轉引道。\n(來源路段長度需大於 ${upDist + 5}m，目的路段長度需大於 ${downDist + 5}m)`);
            return;
        }

        // 1. 拓撲分割 (套用動態距離)
        const srcSplit = splitLinkAtDistance(originalSrc, srcLen - upDist);
        const dstSplit = splitLinkAtDistance(originalDst, downDist);

        const nodeA = srcSplit.splitNode;
        const nodeB = dstSplit.splitNode;
        const srcUp = srcSplit.upstream;
        const srcDown = srcSplit.downstream; // 進入路口的直線
        const dstUp = dstSplit.upstream;     // 離開路口的直線
        const dstDown = dstSplit.downstream;

        // 2. 幾何運算：取得精確的車道中心點
        const srcLaneIdx = srcUp.lanes.length - 1; // 抓最右側車道
        const dstLaneIdx = dstDown.lanes.length - 1;

        const srcLanePath = getLanePath(srcUp, srcLaneIdx);
        const dstLanePath = getLanePath(dstDown, dstLaneIdx);

        if (srcLanePath.length < 2 || dstLanePath.length < 2) return;

        const pRawStart = srcLanePath[srcLanePath.length - 1];
        const pRawEnd = dstLanePath[0];

        const vSrc = normalize(getVector(srcLanePath[Math.max(0, srcLanePath.length - 2)], pRawStart));
        const vDst = normalize(getVector(pRawEnd, dstLanePath[Math.min(dstLanePath.length - 1, 1)]));

        // 核心修復：微微偏移，創造實質連接線長度，解決「模擬器卡車」Bug
        const pStart = add(pRawStart, scale(vSrc, 0.5));
        const pEnd = add(pRawEnd, scale(vDst, -0.5));

        // 尋找交點作為貝茲曲線控制點
        let cp = getLineIntersection(pStart, vSrc, pEnd, vDst);
        if (!cp) {
            cp = { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };
        } else {
            // 防呆：如果控制點跑太遠(角度接近平行)，限制其距離 (採用較大的一方作為基準)
            const d1 = vecLen(getVector(pStart, cp));
            const d2 = vecLen(getVector(pEnd, cp));
            const maxAllowedDist = Math.max(upDist, downDist) * 2;
            if (d1 > maxAllowedDist || d2 > maxAllowedDist) {
                cp = { x: (pStart.x + pEnd.x) / 2, y: (pStart.y + pEnd.y) / 2 };
            }
        }

        // 3. 產生彎曲路段 (Slip Link) 
        const curvePoints = [];
        const NUM_PTS = 8;
        for (let i = 0; i <= NUM_PTS; i++) {
            const t = i / NUM_PTS;
            const x = (1 - t) * (1 - t) * pStart.x + 2 * (1 - t) * t * cp.x + t * t * pEnd.x;
            const y = (1 - t) * (1 - t) * pStart.y + 2 * (1 - t) * t * cp.y + t * t * pEnd.y;
            curvePoints.push({ x, y });
        }

        const slipLink = createLink(curvePoints, 1);
        slipLink.name = `SlipLane_${srcLinkId}_to_${dstLinkId}`;

        // 核心修復：強制轉換為 lane-based 繪製完美的邊界，避免尖角破圖
        slipLink.geometryType = 'lane-based';
        const slipLeftEdge = getOffsetPolyline(curvePoints, -LANE_WIDTH / 2);
        const slipRightEdge = getOffsetPolyline(curvePoints, LANE_WIDTH / 2);

        slipLink.strokes = [
            { id: window.generateId('stroke'), type: 'boundary', points: slipLeftEdge },
            { id: window.generateId('stroke'), type: 'boundary', points: slipRightEdge }
        ];
        slipLink.lanes[0].leftStrokeId = slipLink.strokes[0].id;
        slipLink.lanes[0].rightStrokeId = slipLink.strokes[1].id;

        // 4. 重組連線拓撲
        if (groupObj) deleteConnectionGroup(groupObj);

        // 建立 srcUp -> slipLink 的連線
        const conn1 = handleConnection(
            { linkId: srcUp.id, laneIndex: srcLaneIdx, portType: 'end' },
            { linkId: slipLink.id, laneIndex: 0, portType: 'start' }
        );
        // 建立 slipLink -> dstDown 的連線
        const conn2 = handleConnection(
            { linkId: slipLink.id, laneIndex: 0, portType: 'end' },
            { linkId: dstDown.id, laneIndex: dstLaneIdx, portType: 'start' }
        );

        if (conn1) conn1.konvaBezier.visible(true);
        if (conn2) conn2.konvaBezier.visible(true);

        drawLink(slipLink);
        saveState();
        layer.batchDraw();

        deselectAll(); // 執行後清除選取並確保消除高亮
    };

    window.AgentAPI = {

        /**
         * 獲取當前路網狀態 (唯讀副本，供 AI 分析拓撲)
         */
        getState: function () {
            // 回傳精簡版的路網資料，去除 Konva 循環參照，避免 CDP 序列化失敗
            const state = {
                links: Object.keys(network.links).map(id => ({
                    id,
                    name: network.links[id].name,
                    lanes: network.links[id].lanes.length,
                    waypoints: network.links[id].waypoints
                })),
                nodes: Object.keys(network.nodes).map(id => ({
                    id, x: network.nodes[id].x, y: network.nodes[id].y
                }))
            };
            return state;
        },

        /**
         * 建立路段 (支援雙向道路自動偏移)
         * @param {Array<{x,y}>} points - 座標點陣列 [{x:0, y:0}, {x:100, y:0}]
         * @param {number} lanesPerDir - 單向車道數
         * @param {boolean} isTwoWay - 是否為雙向道路
         * @param {number} medianWidth - 分隔島寬度
         * @returns {string|Array<string>} 建立的路段 ID (單向回傳字串，雙向回傳陣列)
         */
        createRoad: function (points, lanesPerDir = 2, isTwoWay = false, medianWidth = 2.0) {
            if (points.length < 2) return null;
            deselectAll();

            if (!isTwoWay) {
                const newLink = createLink(points, lanesPerDir);
                saveState();
                updateAllOverpasses();
                layer.batchDraw();
                return newLink.id;
            } else {
                // 抽離自原 stage.on('contextmenu') 的雙向道路邏輯
                const roadWidth = lanesPerDir * LANE_WIDTH;
                const offsetDist = (roadWidth / 2) + (medianWidth / 2);

                // 假設右側通行 (Right-Hand Traffic)
                const forwardPoints = getOffsetPolyline(points, offsetDist);
                const linkF = createLink(forwardPoints, lanesPerDir);
                linkF.name = `Link_${idCounter} (F)`;

                let backwardPoints = getOffsetPolyline(points, -offsetDist);
                backwardPoints.reverse();
                const linkB = createLink(backwardPoints, lanesPerDir);
                linkB.name = `Link_${idCounter} (B)`;

                linkF.pairInfo = { pairId: linkB.id, type: 'forward', medianWidth };
                linkB.pairInfo = { pairId: linkF.id, type: 'backward', medianWidth };

                saveState();
                updateAllOverpasses();
                layer.batchDraw();
                return [linkF.id, linkB.id];
            }
        },

        /**
         * 在兩個路段之間建立完整的車道連接 (繞過 UI Modal)
         * 會自動將來源的所有車道與目的的所有車道進行匹配連接
         */
        connectRoads: function (sourceLinkId, destLinkId) {
            const srcLink = network.links[sourceLinkId];
            const dstLink = network.links[destLinkId];
            if (!srcLink || !dstLink) return false;

            const srcLanes = srcLink.lanes.length;
            const dstLanes = dstLink.lanes.length;
            const laneCount = Math.min(srcLanes, dstLanes);

            const newConnectionIds = [];
            let commonNodeId = null;

            // 採用直行對齊邏輯 (1對1)
            for (let i = 0; i < laneCount; i++) {
                const srcMeta = { linkId: srcLink.id, laneIndex: i, portType: 'end' };
                const dstMeta = { linkId: dstLink.id, laneIndex: i, portType: 'start' };
                const newConn = handleConnection(srcMeta, dstMeta);
                if (newConn) {
                    newConn.konvaBezier.visible(false); // 隱藏單獨的貝茲曲線
                    newConnectionIds.push(newConn.id);
                    if (!commonNodeId) commonNodeId = newConn.nodeId;
                }
            }

            // 建立綠色群組線
            if (newConnectionIds.length > 0) {
                const p1 = srcLink.waypoints[srcLink.waypoints.length - 1];
                const p4 = dstLink.waypoints[0];
                const groupLine = new Konva.Line({
                    points: [p1.x, p1.y, p4.x, p4.y],
                    stroke: 'darkgreen', strokeWidth: 2, hitStrokeWidth: 20,
                    name: 'group-connection-visual', listening: true,
                });

                const groupMeta = {
                    type: 'ConnectionGroup', connectionIds: newConnectionIds,
                    nodeId: commonNodeId, sourceLinkId: srcLink.id, destLinkId: dstLink.id
                };
                groupLine.setAttr('meta', groupMeta);
                layer.add(groupLine);
                groupLine.moveToBottom();

                if (network.nodes[commonNodeId]) {
                    network.nodes[commonNodeId].konvaShape.moveToTop();
                }

                saveState();
                layer.batchDraw();
                return true;
            }
            return false;
        },

        /**
         * 在指定範圍內自動建立路口 (模擬 Intersection Tool: Point Mode)
         * @param {number} x, y, width, height - 框選範圍
         */
        createIntersectionInBox: function (x, y, width, height) {
            const rectPoints = [
                { x: x, y: y }, { x: x + width, y: y },
                { x: x + width, y: y + height }, { x: x, y: y + height }
            ];

            // 強制設定為 Point 模式
            const originalMode = intersectionMode;
            intersectionMode = 'point';

            processManualIntersection(rectPoints);

            intersectionMode = originalMode; // 恢復設定
            saveState();
            return true;
        },

        /**
         * 新增物件 (偵測器、號誌、流率點) 到指定路段
         * @param {string} type - 'PointDetector', 'RoadSign', 'Origin', 'Destination'
         * @param {string} linkId - 目標路段 ID
         * @param {number} position - 距離路段起點的公尺數
         */
        addAssetToLink: function (type, linkId, position) {
            const link = network.links[linkId];
            if (!link) return null;

            let obj = null;
            if (type === 'PointDetector' || type === 'SectionDetector') {
                obj = createDetector(type, link, position);
            } else if (type === 'RoadSign') {
                obj = createRoadSign(link, position);
            } else if (type === 'Origin') {
                obj = createOrigin(link, position);
            } else if (type === 'Destination') {
                obj = createDestination(link, position);
            }

            if (obj) {
                saveState();
                layer.batchDraw();
                return obj.id;
            }
            return null;
        }
    };

    // Expose editor helpers on window for automation & testing
    window.setTool = setTool;
    window.createZone = createZone;
    window.deleteZone = deleteZone;
    window.updateZoneVisuals = updateZoneVisuals;
    window.calculatePolygonArea = calculatePolygonArea;
    window.calculateCentroid = calculateCentroid;
    window.autoGenerateCentroidConnectors = autoGenerateCentroidConnectors;
    window.updateZoneConnectorsVisual = updateZoneConnectorsVisual;
    window.serializeNetworkToXML = serializeNetworkToXML;
    window.createAndLoadNetworkFromXML = createAndLoadNetworkFromXML;
    window.selectObject = selectObject;
    window.deselectAll = deselectAll;
    window.updatePropertiesPanel = updatePropertiesPanel;
    Object.defineProperty(window, 'activeTool', {
        get: () => activeTool,
        set: (val) => setTool(val),
        configurable: true
    });
    Object.defineProperty(window, 'selectedObject', {
        get: () => selectedObject,
        set: (val) => selectObject(val),
        configurable: true
    });

    // =========================================================================
    // ⚡ SYNCHRO MODE ENGINE (快速節點/路段建模 + 視覺化車道數與轉向圖案選單)
    // =========================================================================

    var SYNCHRO_TURN_ARROW_MAP = {
        'L': '↰',
        'T': '↑',
        'R': '↱',
        'LT': '↰↑',
        'TR': '↑↱',
        'LR': '↰↱',
        'LTR': '↰↑↱'
    };

    var SYNCHRO_TURN_CYCLE = ['L', 'LT', 'T', 'TR', 'R', 'LTR'];

    var SYNCHRO_PRESET_LIBRARY = {
        1: [
            { turns: ['LTR'], label: '1L 全向共用' },
            { turns: ['LT'], label: '1L 左直共用' },
            { turns: ['TR'], label: '1L 直右共用' }
        ],
        2: [
            { turns: ['L', 'TR'], label: '2L 左專+直右' },
            { turns: ['LT', 'TR'], label: '2L 左直+直右' },
            { turns: ['T', 'TR'], label: '2L 雙直(外右)' }
        ],
        3: [
            { turns: ['L', 'T', 'R'], label: '3L 左+直+右專' },
            { turns: ['L', 'T', 'TR'], label: '3L 左專+雙直右' },
            { turns: ['LT', 'T', 'TR'], label: '3L 左直+直+直右' }
        ],
        4: [
            { turns: ['L', 'T', 'T', 'R'], label: '4L 左+雙直+右專' },
            { turns: ['L', 'T', 'T', 'TR'], label: '4L 左專+參直右' },
            { turns: ['L', 'L', 'T', 'TR'], label: '4L 雙左+雙直右' }
        ]
    };

    function getDefaultSynchroLaneTurns(laneCount) {
        const n = Math.max(1, parseInt(laneCount, 10) || 1);
        if (n === 1) return ['LTR'];
        if (n === 2) return ['LT', 'TR'];
        if (n === 3) return ['L', 'T', 'TR'];
        if (n === 4) return ['L', 'T', 'T', 'R'];
        const middle = Array(Math.max(1, n - 2)).fill('T');
        return ['L', ...middle, 'R'];
    }

    function inferSynchroLaneTurns(link) {
        if (!link || !link.lanes) return ['LTR'];
        const n = link.lanes.length;
        if (Array.isArray(link.synchroLaneTurns) && link.synchroLaneTurns.length === n) {
            return [...link.synchroLaneTurns];
        }
        // Try to infer from existing connections at link.endNodeId
        const laneSets = Array.from({ length: n }, () => new Set());
        let foundAny = false;
        Object.values(network.connections).forEach(conn => {
            if (conn.sourceLinkId === link.id && conn.sourceLaneIndex >= 0 && conn.sourceLaneIndex < n) {
                const dstLink = network.links[conn.destLinkId];
                if (!dstLink) return;
                const dir = getTurnDirection(link, dstLink);
                if (dir === 'left') { laneSets[conn.sourceLaneIndex].add('L'); foundAny = true; }
                else if (dir === 'straight') { laneSets[conn.sourceLaneIndex].add('T'); foundAny = true; }
                else if (dir === 'right') { laneSets[conn.sourceLaneIndex].add('R'); foundAny = true; }
            }
        });
        if (foundAny) {
            const defaults = getDefaultSynchroLaneTurns(n);
            const inferred = laneSets.map((s, idx) => {
                let code = '';
                if (s.has('L')) code += 'L';
                if (s.has('T')) code += 'T';
                if (s.has('R')) code += 'R';
                return code || defaults[idx] || 'T';
            });
            link.synchroLaneTurns = inferred;
            return [...inferred];
        }
        const fallback = getDefaultSynchroLaneTurns(n);
        return fallback;
    }

    // Draw crisp white directional arrows & stop line on the road surface near downstream end
    function drawSynchroGroundArrowsOnLink(link) {
        if (!link || !link.konvaGroup || !link.waypoints || link.waypoints.length < 2) return;
        const hasTurns = Array.isArray(link.synchroLaneTurns) && link.synchroLaneTurns.length > 0;
        const isApproach = Boolean(link.endNodeId && network.nodes[link.endNodeId]);
        if (!hasTurns && !(isSynchroMode && isApproach)) return;

        const totalLen = getPolylineLength(link.waypoints);
        if (totalLen < 6) return;

        const turns = inferSynchroLaneTurns(link);
        const nLanes = link.lanes.length;
        const totalWidth = getLinkTotalWidth(link);
        const halfWidth = totalWidth / 2;

        // 1. Draw stop line near the end of approach links (1.2m from intersection edge)
        if (isApproach) {
            const stopDist = Math.max(0.5, totalLen - 1.2);
            const { point: sp, vec: sVec } = getPointAlongPolyline(link.waypoints, stopDist);
            const sNorm = getNormal(sVec);
            const sp1 = add(sp, scale(sNorm, -halfWidth));
            const sp2 = add(sp, scale(sNorm, halfWidth));
            const stopLine = new Konva.Line({
                points: [sp1.x, sp1.y, sp2.x, sp2.y],
                stroke: 'rgba(255, 255, 255, 0.92)',
                strokeWidth: 0.45,
                listening: false,
                name: 'synchro-ground-stopline'
            });
            link.konvaGroup.add(stopLine);
        }

        // 2. Draw directional arrows on each lane (~6.5m upstream of downstream end)
        const arrowDist = Math.max(3.0, totalLen - Math.min(7.0, totalLen * 0.35));
        const { point: basePt, vec: tangent } = getPointAlongPolyline(link.waypoints, arrowDist);
        const normal = getNormal(tangent);
        const angleDeg = Math.atan2(tangent.y, tangent.x) * (180 / Math.PI) + 90;

        let cumW = 0;
        for (let i = 0; i < nLanes; i++) {
            const lw = link.lanes[i].width || LANE_WIDTH;
            const centerOffset = cumW + lw / 2 - halfWidth;
            cumW += lw;

            const laneCenter = add(basePt, scale(normal, centerOffset));
            const code = turns[i] || 'T';
            const arrowText = SYNCHRO_TURN_ARROW_MAP[code] || '↑';

            const label = new Konva.Text({
                x: laneCenter.x,
                y: laneCenter.y,
                text: arrowText,
                fontSize: code.length >= 3 ? 1.55 : (code.length === 2 ? 1.85 : 2.2),
                fontStyle: 'bold',
                fontFamily: 'Arial, sans-serif',
                fill: 'rgba(255, 255, 255, 0.92)',
                align: 'center',
                verticalAlign: 'middle',
                listening: false,
                name: 'synchro-ground-arrow'
            });
            label.offsetX(label.width() / 2);
            label.offsetY(label.height() / 2);
            label.rotation(angleDeg);
            link.konvaGroup.add(label);
        }
    }

    // Core engine: Apply lane count & per-lane turn movements to a Link and rebuild intersection connections
    function applySynchroLaneConfig(link, laneTurnsArray, options = {}) {
        if (!link || !Array.isArray(laneTurnsArray) || laneTurnsArray.length === 0) return;

        const targetCount = laneTurnsArray.length;
        const currentCount = link.lanes.length;

        // 1. Update lane count on link
        if (targetCount !== currentCount) {
            if (link.geometryType === 'parametric' && link.parametricConfig) {
                const c = link.parametricConfig;
                const ll = c.leftPocket && c.leftPocket.exists ? c.leftPocket.lanes : 0;
                const rl = c.rightPocket && c.rightPocket.exists ? c.rightPocket.lanes : 0;
                c.throughLanes = Math.max(1, targetCount - ll - rl);
                generateParametricStrokes(link);
            } else {
                if (targetCount > currentCount) {
                    for (let i = currentCount; i < targetCount; i++) {
                        link.lanes.push({ width: LANE_WIDTH, allowedVehicleProfiles: [] });
                    }
                } else {
                    link.lanes.length = targetCount;
                }
            }
        }

        link.synchroLaneTurns = [...laneTurnsArray];

        // Redraw link & dependent roadside assets
        drawLink(link);
        updateAllDetectorsOnLink(link.id);
        updateFlowPointsOnLink(link.id);
        updateRoadSignsOnLink(link.id);
        Object.values(network.roadMarkings).forEach(m => {
            if (m.linkId === link.id) {
                if (m.laneIndices) {
                    m.laneIndices = m.laneIndices.filter(idx => idx < link.lanes.length);
                    if (m.laneIndices.length === 0) m.laneIndices = [0];
                }
                drawRoadMarking(m);
            }
        });

        // 2. If link enters an intersection Node, rebuild its outgoing Connections & ConnectionGroups cleanly
        const nodeId = link.endNodeId;
        const node = nodeId ? network.nodes[nodeId] : null;
        if (node) {
            const outLinks = [...node.outgoingLinkIds].map(id => network.links[id]).filter(Boolean);
            const tfl = network.trafficLights[node.id];

            // Record existing signal group assignments by (destLinkId) so we preserve Traffic Light bindings
            const savedGroupByDest = {};
            const savedSetGroupsByDest = {};
            Object.values(network.connections).forEach(conn => {
                if (conn.nodeId === node.id && conn.sourceLinkId === link.id) {
                    if (tfl && tfl.signalGroups) {
                        Object.values(tfl.signalGroups).forEach(g => {
                            if (g.connIds && g.connIds.includes(conn.id)) {
                                savedGroupByDest[conn.destLinkId] = g.id;
                            }
                        });
                    }
                    if (tfl && tfl.signalGroupSets) {
                        Object.values(tfl.signalGroupSets).forEach(gs => {
                            Object.values(gs.groups || {}).forEach(g => {
                                if (g.connIds && g.connIds.includes(conn.id)) {
                                    if (!savedSetGroupsByDest[gs.id]) savedSetGroupsByDest[gs.id] = {};
                                    savedSetGroupsByDest[gs.id][conn.destLinkId] = g.id;
                                }
                            });
                        });
                    }
                }
            });

            // Remove old ConnectionGroup visuals from link.id at this node
            const groupsToRemove = [];
            layer.find('.group-connection-visual').forEach(shape => {
                const meta = shape.getAttr('meta');
                if (meta && meta.nodeId === node.id && meta.sourceLinkId === link.id) {
                    groupsToRemove.push({ id: shape.id(), ...meta, konvaLine: shape });
                }
            });
            groupsToRemove.forEach(g => deleteConnectionGroup(g));

            // Remove any remaining individual connections from link.id at this node
            Object.values(network.connections).forEach(conn => {
                if (conn.nodeId === node.id && conn.sourceLinkId === link.id) {
                    deleteConnection(conn.id);
                }
            });

            // Map outgoing links by turn direction ('left' -> 'L', 'straight' -> 'T', 'right' -> 'R')
            outLinks.forEach(dstLink => {
                if (dstLink.id === link.id) return;
                const turnDir = getTurnDirection(link, dstLink);
                if (turnDir === 'u-turn') return;

                const dirChar = turnDir === 'left' ? 'L' : (turnDir === 'right' ? 'R' : 'T');
                const matchingSrcLanes = [];
                link.synchroLaneTurns.forEach((turnCode, laneIdx) => {
                    if (laneIdx < link.lanes.length && (turnCode || '').includes(dirChar)) {
                        matchingSrcLanes.push(laneIdx);
                    }
                });

                if (matchingSrcLanes.length === 0) return;

                const newIds = [];
                const dstLaneCount = dstLink.lanes.length;
                // 排除目標路段下游才展開的左/右轉專用袋狀車道，確保路口匯入處對齊起點實際存在的主線車道
                const dstLL = getLeftPocketCount(dstLink);
                const dstRL = getRightPocketCount(dstLink);
                const dstValidStart = Math.min(dstLL, Math.max(0, dstLaneCount - 1));
                const dstValidEnd = Math.max(dstValidStart, dstLaneCount - 1 - dstRL);

                matchingSrcLanes.forEach((srcIdx, k) => {
                    let dstIdx = dstValidStart;
                    if (turnDir === 'right') {
                        // Outer-to-outer alignment for right turns (within valid upstream entrance lanes)
                        const offsetFromRight = matchingSrcLanes.length - 1 - k;
                        dstIdx = Math.max(dstValidStart, dstValidEnd - offsetFromRight);
                    } else if (turnDir === 'left') {
                        // Inner-to-inner alignment for left turns (within valid upstream entrance lanes)
                        dstIdx = Math.min(dstValidStart + k, dstValidEnd);
                    } else {
                        // Through lanes alignment (within valid upstream entrance lanes)
                        dstIdx = Math.min(dstValidStart + k, dstValidEnd);
                    }

                    const srcMeta = { linkId: link.id, laneIndex: srcIdx, portType: 'end' };
                    const dstMeta = { linkId: dstLink.id, laneIndex: dstIdx, portType: 'start' };
                    const newConn = handleConnection(srcMeta, dstMeta);
                    if (newConn) {
                        newConn.konvaBezier.visible(false);
                        newIds.push(newConn.id);
                    }
                });

                if (newIds.length > 0) {
                    drawConnectionGroupVisual(link, dstLink, newIds, node.id);

                    // Restore or auto-assign Traffic Light SignalGroup bindings
                    if (tfl) {
                        ensureTflGroupSets(tfl);

                        // 輔助函式：若該轉向為新開啟（無舊綁定紀錄），自動依據方位與轉向推論對應群組
                        const inferFallbackGroupId = (groupsMap) => {
                            if (!groupsMap) return null;
                            // 1. 優先尋找同一進入路段 (link.id) 其他連線已使用的群組
                            const compass = getSynchroApproachCompass(link).code;
                            const isEW = (compass === 'EB' || compass === 'WB');
                            if (turnDir === 'left') {
                                if (isEW && groupsMap['G2']) return 'G2';
                                if (!isEW && groupsMap['G4']) return 'G4';
                            }
                            if (isEW && groupsMap['G1']) return 'G1';
                            if (!isEW && groupsMap['G3']) return 'G3';
                            if (!isEW && groupsMap['G2']) return 'G2';
                            // 2. Fallback 至該路段任一已綁定之群組或第一個車輛群組
                            const existingOnApproach = Object.values(savedGroupByDest)[0];
                            if (existingOnApproach && groupsMap[existingOnApproach]) return existingOnApproach;
                            const firstVehGroup = Object.values(groupsMap).find(g => g.type !== 'pedestrian');
                            return firstVehGroup ? firstVehGroup.id : null;
                        };

                        const targetGId = savedGroupByDest[dstLink.id] || inferFallbackGroupId(tfl.signalGroups);
                        if (targetGId && tfl.signalGroups && tfl.signalGroups[targetGId]) {
                            newIds.forEach(cid => {
                                if (!tfl.signalGroups[targetGId].connIds.includes(cid)) {
                                    tfl.signalGroups[targetGId].connIds.push(cid);
                                }
                            });
                        }

                        if (tfl.signalGroupSets) {
                            Object.entries(tfl.signalGroupSets).forEach(([gsId, gs]) => {
                                if (!gs || !gs.groups) return;
                                const mapByDest = savedSetGroupsByDest[gsId] || {};
                                const gId = mapByDest[dstLink.id] || inferFallbackGroupId(gs.groups);
                                if (gId && gs.groups[gId]) {
                                    newIds.forEach(cid => {
                                        if (!gs.groups[gId].connIds.includes(cid)) {
                                            gs.groups[gId].connIds.push(cid);
                                        }
                                    });
                                }
                            });
                        }
                    }
                }
            });

            // Ensure turningRatios has default weights for active movements
            if (!node.turningRatios) node.turningRatios = {};
            if (!node.turningRatios[link.id]) node.turningRatios[link.id] = {};
            const hasExistingRatios = Object.values(node.turningRatios[link.id]).some(v => v > 0);
            if (!hasExistingRatios) {
                const connectedDests = outLinks.filter(d =>
                    Object.values(network.connections).some(c => c.nodeId === node.id && c.sourceLinkId === link.id && c.destLinkId === d.id)
                );
                if (connectedDests.length > 0) {
                    let rawWeights = {};
                    let sumW = 0;
                    connectedDests.forEach(d => {
                        const dir = getTurnDirection(link, d);
                        const w = dir === 'straight' ? 0.70 : 0.15;
                        rawWeights[d.id] = w;
                        sumW += w;
                    });
                    connectedDests.forEach(d => {
                        node.turningRatios[link.id][d.id] = Number((rawWeights[d.id] / sumW).toFixed(2));
                    });
                }
            }

            redrawNodeConnections(node.id);
        }

        // Also update upstream node connections if link starts at a node
        if (link.startNodeId && network.nodes[link.startNodeId]) {
            redrawNodeConnections(link.startNodeId);
        }

        layer.batchDraw();
        if (!options.skipSave) {
            saveState();
        }
    }

    // Render Synchro Visual Lane & Turn Diagram Picker HTML for a Link (大師級重構：點選車道 + 下方共用大尺寸轉向列)
    function renderSynchroLanePickerHTML(link, prefix = 'link') {
        if (!link || !link.lanes) return '';
        const turns = inferSynchroLaneTurns(link);
        const nLanes = link.lanes.length;
        const uid = `${prefix}_${link.id}`;

        // 記憶目前選中的車道索引，確保切換轉向後焦點不會跳回第 1 車道
        if (typeof link._activeSynchroLaneIdx !== 'number' || link._activeSynchroLaneIdx >= nLanes || link._activeSynchroLaneIdx < 0) {
            link._activeSynchroLaneIdx = 0;
        }
        const activeIdx = link._activeSynchroLaneIdx;
        const activeCode = turns[activeIdx] || 'T';

        const getPosLabel = (i, total) => {
            if (total === 1) return 'L1 全車道';
            if (i === 0) return `L1 內側`;
            if (i === total - 1) return `L${i + 1} 外側`;
            return `L${i + 1} 中線`;
        };

        // 1. 上方車道視覺圖卡：僅顯示大箭頭與車道編號，乾淨無雜訊
        let laneColsHtml = '';
        for (let i = 0; i < nLanes; i++) {
            const code = turns[i] || 'T';
            const arrow = SYNCHRO_TURN_ARROW_MAP[code] || '↑';
            const isSelected = (i === activeIdx);

            laneColsHtml += `
                <div class="synchro-lane-col ${isSelected ? 'selected' : ''}"
                     data-synchro-uid="${uid}" data-lane-select="${i}"
                     title="點擊選取 ${getPosLabel(i, nLanes)}（雙擊可循環切換轉向）">
                    <div class="synchro-lane-arrow-big">${arrow}</div>
                    <div class="synchro-lane-label">${getPosLabel(i, nLanes)}</div>
                    <span class="synchro-lane-code-badge">${code}</span>
                </div>
            `;
        }

        // 2. 下方唯一一排共用大尺寸轉向選擇器
        const sharedPillsHtml = SYNCHRO_TURN_CYCLE.map(opt => `
            <button type="button" class="synchro-turn-pill ${activeCode === opt ? 'active' : ''}"
                    data-synchro-uid="${uid}" data-lane-idx="${activeIdx}" data-turn-code="${opt}"
                    title="設定為 ${SYNCHRO_TURN_ARROW_MAP[opt]} (${opt})">
                <span class="pill-arrow">${SYNCHRO_TURN_ARROW_MAP[opt]}</span>
                <span class="pill-code">${opt}</span>
            </button>
        `).join('');

        // 3. 常用車道範本
        const allQuickPresets = [
            ...(SYNCHRO_PRESET_LIBRARY[nLanes] || []),
            ...[1, 2, 3, 4].filter(k => k !== nLanes).map(k => SYNCHRO_PRESET_LIBRARY[k][1] || SYNCHRO_PRESET_LIBRARY[k][0])
        ].slice(0, 6);

        const currentKey = turns.join(',');
        const presetsHtml = allQuickPresets.map(p => {
            const pKey = p.turns.join(',');
            const isActive = pKey === currentKey;
            const cells = p.turns.map(t => `<span class="synchro-preset-lane-cell">${SYNCHRO_TURN_ARROW_MAP[t] || t}</span>`).join('');
            return `
                <button type="button" class="synchro-preset-card ${isActive ? 'active' : ''}"
                        data-synchro-uid="${uid}" data-preset-turns="${pKey}"
                        title="一鍵套用：${p.label}">
                    <div class="synchro-preset-lanes">${cells}</div>
                    <div class="synchro-preset-caption">${p.label}</div>
                </button>
            `;
        }).join('');

        const countBtnsHtml = [1, 2, 3, 4].map(cnt => `
            <button type="button" class="synchro-count-btn ${nLanes === cnt ? 'active' : ''}"
                    data-synchro-uid="${uid}" data-lane-count="${cnt}">${cnt}L</button>
        `).join('');

        return `
            <div class="synchro-panel-box" data-synchro-box="${uid}" style="margin-bottom:0;">
                <div class="synchro-panel-header">
                    <span>車道數快速切換</span>
                    <div class="synchro-lane-count-bar">
                        ${countBtnsHtml}
                        <button type="button" class="synchro-count-btn" data-synchro-uid="${uid}" data-lane-delta="-1" title="減少 1 車道">−</button>
                        <button type="button" class="synchro-count-btn" data-synchro-uid="${uid}" data-lane-delta="1" title="增加 1 車道">+</button>
                    </div>
                </div>

                <!-- 乾淨的車道圖卡（點擊選擇車道） -->
                <div class="synchro-road-strip">
                    ${laneColsHtml}
                </div>

                <!-- 共用單排大尺寸轉向選擇器 -->
                <div class="synchro-shared-turn-bar">
                    <div class="synchro-shared-turn-header">
                        <span>目前編輯：<strong data-synchro-active-label="${uid}" style="color:#1d4ed8;">${getPosLabel(activeIdx, nLanes)}</strong></span>
                        <span style="font-size:0.68rem; color:#64748b;">點選上方車道切換</span>
                    </div>
                    <div class="synchro-turn-pills">
                        ${sharedPillsHtml}
                    </div>
                </div>

                <details style="margin-top:8px;">
                    <summary style="font-size:0.72rem; color:#92400e; font-weight:700; cursor:pointer; user-select:none; display:flex; align-items:center; justify-content:space-between;">
                        <span><i class="fa-solid fa-swatchbook"></i> 常用車道配置範本 (一鍵套用)</span>
                        <i class="fa-solid fa-chevron-down" style="font-size:0.65rem;"></i>
                    </summary>
                    <div class="synchro-preset-grid" style="margin-top:6px;">
                        ${presetsHtml}
                    </div>
                </details>
            </div>
        `;
    }

    function bindSynchroLanePickerEvents(container, link, prefix = 'link', onAfterUpdate = null) {
        if (!container || !link) return;
        const uid = `${prefix}_${link.id}`;

        const triggerUpdate = (newTurns) => {
            applySynchroLaneConfig(link, newTurns);
            if (typeof onAfterUpdate === 'function') {
                onAfterUpdate(link, newTurns);
            } else if (selectedObject) {
                updatePropertiesPanel(selectedObject);
            }
        };

        // 1. 車道數切換按鈕 (1L, 2L, 3L, 4L)
        container.querySelectorAll(`.synchro-count-btn[data-synchro-uid="${uid}"][data-lane-count]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cnt = parseInt(btn.dataset.laneCount, 10);
                if (!cnt || cnt < 1) return;
                link._activeSynchroLaneIdx = Math.min(link._activeSynchroLaneIdx || 0, cnt - 1);
                triggerUpdate(getDefaultSynchroLaneTurns(cnt));
            });
        });

        // 2. 車道數增減按鈕 (- / +)
        container.querySelectorAll(`.synchro-count-btn[data-synchro-uid="${uid}"][data-lane-delta]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const delta = parseInt(btn.dataset.laneDelta, 10) || 0;
                const nextCount = Math.max(1, Math.min(8, link.lanes.length + delta));
                if (nextCount === link.lanes.length) return;
                link._activeSynchroLaneIdx = Math.min(link._activeSynchroLaneIdx || 0, nextCount - 1);
                triggerUpdate(getDefaultSynchroLaneTurns(nextCount));
            });
        });

        // 3. 點擊上方車道欄位：切換選中車道（雙擊則快速循環切換該車道轉向）
        container.querySelectorAll(`.synchro-lane-col[data-synchro-uid="${uid}"]`).forEach(col => {
            col.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(col.dataset.laneSelect, 10);
                link._activeSynchroLaneIdx = idx;

                // 即時更新選中樣式與下方共用轉向列，不需重建整張路網連線
                const turns = inferSynchroLaneTurns(link);
                const nLanes = link.lanes.length;
                const activeCode = turns[idx] || 'T';

                container.querySelectorAll(`.synchro-lane-col[data-synchro-uid="${uid}"]`).forEach((c, i) => {
                    c.classList.toggle('selected', i === idx);
                });

                const labelEl = container.querySelector(`[data-synchro-active-label="${uid}"]`);
                if (labelEl) {
                    labelEl.textContent = nLanes === 1 ? 'L1 全車道' : (idx === 0 ? 'L1 內側' : (idx === nLanes - 1 ? `L${idx + 1} 外側` : `L${idx + 1} 中線`));
                }

                container.querySelectorAll(`.synchro-turn-pill[data-synchro-uid="${uid}"]`).forEach(pill => {
                    pill.dataset.laneIdx = idx;
                    pill.classList.toggle('active', pill.dataset.turnCode === activeCode);
                });
            });

            // 雙擊車道直接循環切換轉向
            col.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const idx = parseInt(col.dataset.laneSelect, 10);
                link._activeSynchroLaneIdx = idx;
                const turns = inferSynchroLaneTurns(link);
                const cur = turns[idx] || 'T';
                const nextIdx = (SYNCHRO_TURN_CYCLE.indexOf(cur) + 1) % SYNCHRO_TURN_CYCLE.length;
                turns[idx] = SYNCHRO_TURN_CYCLE[nextIdx];
                triggerUpdate(turns);
            });
        });

        // 4. 點擊下方共用轉向按鈕 (L, LT, T, TR, R, LTR)
        container.querySelectorAll(`.synchro-turn-pill[data-synchro-uid="${uid}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.laneIdx, 10);
                const code = btn.dataset.turnCode;
                link._activeSynchroLaneIdx = idx;
                const turns = inferSynchroLaneTurns(link);
                turns[idx] = code;
                triggerUpdate(turns);
            });
        });

        // 5. 點擊常用車道範本卡片
        container.querySelectorAll(`.synchro-preset-card[data-synchro-uid="${uid}"]`).forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const presetStr = card.dataset.presetTurns || '';
                const newTurns = presetStr.split(',').map(s => s.trim()).filter(Boolean);
                if (newTurns.length > 0) {
                    link._activeSynchroLaneIdx = Math.min(link._activeSynchroLaneIdx || 0, newTurns.length - 1);
                    triggerUpdate(newTurns);
                }
            });
        });
    }

    // Compass direction helper for Node approaches (修正末端重合點造成 atan2(0,0)=0 全部誤判為 EB 的問題)
    function getSynchroApproachCompass(link) {
        if (!link || !link.waypoints || link.waypoints.length < 2) {
            return { code: 'APP', label: '進入路段', order: 99, deg: 0 };
        }
        const wps = link.waypoints;
        const p2 = wps[wps.length - 1];
        let p1 = wps[wps.length - 2];

        // 往前尋找距離終點至少 0.5m 的頂點，避免切割路口產生的重合點導致 dx=0, dy=0
        for (let i = wps.length - 2; i >= 0; i--) {
            if (Math.hypot(p2.x - wps[i].x, p2.y - wps[i].y) > 0.5) {
                p1 = wps[i];
                break;
            }
        }

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y; // Konva Y 軸朝下: dy < 0 為北行(NB), dy > 0 為南行(SB)
        const deg = Math.atan2(dy, dx) * (180 / Math.PI); // -180 .. 180

        if (deg >= -45 && deg < 45) return { code: 'EB', label: '東行 (EB →)', order: 1, deg };
        if (deg >= 135 || deg < -135) return { code: 'WB', label: '西行 (← WB)', order: 2, deg };
        if (deg >= -135 && deg < -45) return { code: 'NB', label: '北行 (↑ NB)', order: 3, deg };
        return { code: 'SB', label: '南行 (↓ SB)', order: 4, deg };
    }


    // 判斷進入路段是否為「路網外圍起點路段」(無上游多叉路口匯入)
    function isSynchroBoundaryEntryLink(link) {
        if (!link) return true;
        if (!link.startNodeId || !network.nodes[link.startNodeId]) return true;
        const upNode = network.nodes[link.startNodeId];
        return isSynchroTerminalNode(upNode);
    }

    // 確保某個路口進入路段擁有預設的 synchroTurnVolumes (veh/h)
    function ensureSynchroTurnVolumesForApproach(node, inLink) {
        if (!node || !inLink) return {};
        if (!node.synchroTurnVolumes) node.synchroTurnVolumes = {};
        if (!node.turningRatios) node.turningRatios = {};
        if (!node.turningRatios[inLink.id]) node.turningRatios[inLink.id] = {};

        const outLinks = [...node.outgoingLinkIds].map(id => network.links[id]).filter(Boolean);
        let leftDest = null, straightDest = null, rightDest = null;
        outLinks.forEach(dst => {
            if (dst.id === inLink.id) return;
            const d = getTurnDirection(inLink, dst);
            if (d === 'left') leftDest = dst;
            else if (d === 'straight') straightDest = dst;
            else if (d === 'right') rightDest = dst;
        });

        if (!node.synchroTurnVolumes[inLink.id]) {
            node.synchroTurnVolumes[inLink.id] = {};
            // 若該路段已有偵測器流量，以其為基準；否則預設為 0
            let baseTotal = 0;
            Object.values(network.detectors).forEach(det => {
                if (det.linkId === inLink.id && det.observedFlow > 0) {
                    baseTotal = Math.max(baseTotal, det.observedFlow);
                }
            });
            if (baseTotal <= 0) {
                const upFlow = computeSynchroUpstreamInflow(inLink, 1);
                baseTotal = upFlow !== null && upFlow > 0 ? upFlow : 0; // 改為預設 0
            }

            const rMap = node.turningRatios[inLink.id] || {};
            const activeDests = [leftDest, straightDest, rightDest].filter(Boolean);
            let sumR = 0;
            activeDests.forEach(d => { sumR += (rMap[d.id] !== undefined ? rMap[d.id] : (getTurnDirection(inLink, d) === 'straight' ? 0.7 : 0.15)); });
            if (sumR <= 0) sumR = 1;

            activeDests.forEach(d => {
                const weight = (rMap[d.id] !== undefined ? rMap[d.id] : (getTurnDirection(inLink, d) === 'straight' ? 0.7 : 0.15)) / sumR;
                node.synchroTurnVolumes[inLink.id][d.id] = Math.round(baseTotal * weight);
            });
        }
        return node.synchroTurnVolumes[inLink.id];
    }

    // 計算某條內部路段由「上游路口」各方向匯入的守恆車流量 (veh/h)
    function computeSynchroUpstreamInflow(inLink, depth = 0) {
        if (!inLink || depth > 4) return null;
        if (isSynchroBoundaryEntryLink(inLink)) return null; // 外圍起點無上游路口

        const upNode = network.nodes[inLink.startNodeId];
        if (!upNode) return null;

        let totalFromUpstream = 0;
        let hasAnyUpstreamData = false;

        upNode.incomingLinkIds.forEach(uLinkId => {
            const uLink = network.links[uLinkId];
            if (!uLink || uLink.id === inLink.id) return;
            // 排除與 inLink 互為同路段順逆向的 U-turn
            if (inLink.pairInfo && inLink.pairInfo.pairId === uLink.id) return;

            const uVolMap = ensureSynchroTurnVolumesForApproach(upNode, uLink);
            if (uVolMap && uVolMap[inLink.id] !== undefined) {
                totalFromUpstream += (parseFloat(uVolMap[inLink.id]) || 0);
                hasAnyUpstreamData = true;
            } else if (upNode.turningRatios && upNode.turningRatios[uLink.id] && upNode.turningRatios[uLink.id][inLink.id] !== undefined) {
                const uTotal = Object.values(uVolMap || {}).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
                totalFromUpstream += uTotal * upNode.turningRatios[uLink.id][inLink.id];
                hasAnyUpstreamData = true;
            }
        });

        return hasAnyUpstreamData ? Math.round(totalFromUpstream) : null;
    }

    // 同步將某進入路段的 Synchro 轉向車流量 (veh/h) 換算為 turningRatios 並自動建立/更新外圍發車源 (Source Detector)
    function syncSynchroApproachVolumesAndSource(node, inLink) {
        if (!node || !inLink) return;
        const volMap = ensureSynchroTurnVolumesForApproach(node, inLink);
        const entries = Object.entries(volMap);
        const totalVol = entries.reduce((sum, [, v]) => sum + Math.max(0, parseFloat(v) || 0), 0);

        if (!node.turningRatios) node.turningRatios = {};
        if (!node.turningRatios[inLink.id]) node.turningRatios[inLink.id] = {};

        if (totalVol > 0) {
            entries.forEach(([dstId, v]) => {
                node.turningRatios[inLink.id][dstId] = Number((Math.max(0, parseFloat(v) || 0) / totalVol).toFixed(4));
            });
        } else if (entries.length > 0) {
            const eq = Number((1 / entries.length).toFixed(4));
            entries.forEach(([dstId]) => {
                node.turningRatios[inLink.id][dstId] = eq;
            });
        }

        // 若為外圍起點路段，自動在路段起點建立或更新發車偵測器 (PointDetector isSource = true)
        if (isSynchroBoundaryEntryLink(inLink)) {
            let srcDet = Object.values(network.detectors).find(d => d.linkId === inLink.id && d.type === 'PointDetector');
            if (!srcDet && totalVol > 0) {
                const linkLen = getPolylineLength(inLink.waypoints);
                const pos = Math.min(6, Math.max(2, linkLen * 0.12));
                srcDet = createDetector('PointDetector', inLink, pos);
                srcDet.name = `Synchro_In_${inLink.id}`;
            }
            if (srcDet) {
                srcDet.isSource = totalVol > 0;
                srcDet.observedFlow = Math.round(totalVol);
                if (!srcDet.spawnProfiles || srcDet.spawnProfiles.length === 0) {
                    const defaultProfId = Object.keys(network.vehicleProfiles)[0] || 'car';
                    srcDet.spawnProfiles = [{ profileId: defaultProfId, weight: 1.0 }];
                }
                drawDetector(srcDet);
            }
        } else {
            // 若該路段後來變成內部連接路段，關閉其自動外圍發車源以免重複發車，但更新其觀測流量供參考
            Object.values(network.detectors).forEach(d => {
                if (d.linkId === inLink.id && d.name && d.name.startsWith('Synchro_In_')) {
                    d.isSource = false;
                    d.observedFlow = Math.round(totalVol);
                    drawDetector(d);
                }
            });
        }
    }

    // 將單一進入路段的 (L, T, R) 車流量依比例縮放至完全等於上游匯入流量 (維持本路口轉向比例)
    function balanceSingleSynchroApproachToUpstream(node, inLink) {
        if (!node || !inLink) return false;
        const upstreamVol = computeSynchroUpstreamInflow(inLink);
        if (upstreamVol === null || upstreamVol < 0) return false;

        const volMap = ensureSynchroTurnVolumesForApproach(node, inLink);
        const dstIds = Object.keys(volMap);
        if (dstIds.length === 0) return false;

        const localTotal = dstIds.reduce((s, id) => s + (parseFloat(volMap[id]) || 0), 0);
        if (localTotal <= 0) {
            // 若原本為 0，依 node.turningRatios 或預設直行70%/左右轉15% 分配
            let sumW = 0;
            const weights = {};
            dstIds.forEach(dstId => {
                const dst = network.links[dstId];
                const dir = dst ? getTurnDirection(inLink, dst) : 'straight';
                const w = (node.turningRatios && node.turningRatios[inLink.id] && node.turningRatios[inLink.id][dstId]) || (dir === 'straight' ? 0.7 : 0.15);
                weights[dstId] = w;
                sumW += w;
            });
            dstIds.forEach(dstId => {
                volMap[dstId] = Math.round(upstreamVol * (weights[dstId] / (sumW || 1)));
            });
        } else {
            let assigned = 0;
            let maxDstId = dstIds[0];
            dstIds.forEach(dstId => {
                if ((volMap[dstId] || 0) > (volMap[maxDstId] || 0)) maxDstId = dstId;
                const scaled = Math.round(upstreamVol * ((parseFloat(volMap[dstId]) || 0) / localTotal));
                volMap[dstId] = scaled;
                assigned += scaled;
            });
            // 修正四捨五入差額，確保總和 100% 等於 upstreamVol
            volMap[maxDstId] = Math.max(0, (volMap[maxDstId] || 0) + (upstreamVol - assigned));
        }

        syncSynchroApproachVolumesAndSource(node, inLink);
        return true;
    }

    // 全路網自動流量守恆平衡：由外圍起點往下游傳遞並平衡所有內部路段流量
    function balanceAllSynchroNetworkFlows() {
        const allNodes = Object.values(network.nodes).filter(n => !isSynchroTerminalNode(n));
        // 先同步所有外圍起點的發車源與轉向比例
        allNodes.forEach(n => {
            n.incomingLinkIds.forEach(inId => {
                const inLink = network.links[inId];
                if (inLink) syncSynchroApproachVolumesAndSource(n, inLink);
            });
        });

        // 迭代傳遞最多 8 次以收斂串聯路網
        for (let iter = 0; iter < 8; iter++) {
            let anyChanged = false;
            allNodes.forEach(n => {
                n.incomingLinkIds.forEach(inId => {
                    const inLink = network.links[inId];
                    if (!inLink || isSynchroBoundaryEntryLink(inLink)) return;
                    const upVol = computeSynchroUpstreamInflow(inLink);
                    if (upVol === null) return;
                    const volMap = ensureSynchroTurnVolumesForApproach(n, inLink);
                    const curTotal = Object.values(volMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                    if (Math.abs(curTotal - upVol) >= 1) {
                        balanceSingleSynchroApproachToUpstream(n, inLink);
                        anyChanged = true;
                    }
                });
            });
            if (!anyChanged) break;
        }
        layer.batchDraw();
        saveState();
    }

    function renderSynchroNodePanelHTML(node) {
        if (!node) return '';
        const inLinks = [...node.incomingLinkIds]
            .map(id => network.links[id])
            .filter(Boolean)
            .map(link => ({ link, compass: getSynchroApproachCompass(link) }))
            .sort((a, b) => a.compass.order - b.compass.order);

        if (inLinks.length === 0) {
            return `<div class="prop-hint">此路口尚無進入路段 (Incoming Links)。請在 Synchro 模式下繪製穿越或相交的道路。</div>`;
        }

        // 記憶目前檢視的進入方向索引 (預設為 0，若設為 'all' 則全部展開)
        if (node._activeSynchroAppIdx === undefined) node._activeSynchroAppIdx = 0;
        if (node._activeSynchroAppIdx !== 'all' && node._activeSynchroAppIdx >= inLinks.length) {
            node._activeSynchroAppIdx = 0;
        }

        const outLinks = [...node.outgoingLinkIds].map(id => network.links[id]).filter(Boolean);

        // 1. 方向切換分頁列 (Approach Switcher: [EB] [WB] [NB] [SB] [全部])
        let switcherHtml = `<div class="approach-switcher">`;
        inLinks.forEach(({ link, compass }, idx) => {
            const isActive = node._activeSynchroAppIdx === idx;
            switcherHtml += `
                <button type="button" class="approach-tab-btn ${isActive ? 'active' : ''}"
                        data-app-idx="${idx}" data-highlight-link="${link.id}"
                        title="切換至 ${compass.label} (${link.name || link.id})">
                    ${compass.code} <span style="font-weight:500; opacity:0.8;">(${link.lanes.length}L)</span>
                </button>`;
        });
        if (inLinks.length > 1) {
            const isAll = node._activeSynchroAppIdx === 'all';
            switcherHtml += `
                <button type="button" class="approach-tab-btn ${isAll ? 'active' : ''}" data-app-idx="all" title="展開全部方向">
                    全部
                </button>`;
        }
        switcherHtml += `</div>`;

        // 2. 渲染選定的進入方向卡片
        let cardsHtml = '';
        inLinks.forEach(({ link, compass }, idx) => {
            if (node._activeSynchroAppIdx !== 'all' && node._activeSynchroAppIdx !== idx) return;

            let leftDest = null, straightDest = null, rightDest = null;
            outLinks.forEach(dst => {
                if (dst.id === link.id) return;
                const d = getTurnDirection(link, dst);
                if (d === 'left') leftDest = dst;
                else if (d === 'straight') straightDest = dst;
                else if (d === 'right') rightDest = dst;
            });

            const volMap = ensureSynchroTurnVolumesForApproach(node, link);
            syncSynchroApproachVolumesAndSource(node, link);

            const getVol = (dst) => (dst && volMap[dst.id] !== undefined) ? Math.round(volMap[dst.id]) : 0;
            const getPct = (dst) => {
                if (!dst || !node.turningRatios || !node.turningRatios[link.id]) return 0;
                return Math.round((node.turningRatios[link.id][dst.id] || 0) * 100);
            };

            const localTotal = (leftDest ? getVol(leftDest) : 0) + (straightDest ? getVol(straightDest) : 0) + (rightDest ? getVol(rightDest) : 0);
            const isBoundary = isSynchroBoundaryEntryLink(link);
            const upstreamVol = computeSynchroUpstreamInflow(link);

            let flowStatusHtml = '';
            if (isBoundary) {
                flowStatusHtml = `
                    <div style="margin-top:6px; padding:4px 8px; border-radius:5px; background:#f0fdf4; border:1px solid #bbf7d0; font-size:0.7rem; color:#166534; display:flex; align-items:center; justify-content:space-between;">
                        <span><i class="fa-solid fa-circle-play"></i> 外圍起點 (自動發車源)</span>
                        <b>${localTotal} veh/h</b>
                    </div>`;
            } else if (upstreamVol !== null) {
                const diff = localTotal - upstreamVol;
                if (Math.abs(diff) <= 1) {
                    flowStatusHtml = `
                        <div style="margin-top:6px; padding:4px 8px; border-radius:5px; background:#eff6ff; border:1px solid #bfdbfe; font-size:0.7rem; color:#1e40af; display:flex; align-items:center; justify-content:space-between;">
                            <span><i class="fa-solid fa-check-circle"></i> 與上游 (${link.startNodeId}) 流量守恆</span>
                            <b>${localTotal} veh/h</b>
                        </div>`;
                } else {
                    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
                    flowStatusHtml = `
                        <div style="margin-top:6px; padding:6px 8px; border-radius:5px; background:#fffbeb; border:1px solid #fde68a; font-size:0.7rem; color:#92400e;">
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                                <span><i class="fa-solid fa-triangle-exclamation" style="color:#d97706;"></i> 上游匯入 <b>${upstreamVol}</b> ｜ 本處 <b>${localTotal}</b> (${diffStr})</span>
                            </div>
                            <button type="button" class="btn-mini btn-synchro-balance-single" data-approach-link="${link.id}" style="width:100%; background:#f59e0b; color:#fff; border:none; padding:4px 6px; border-radius:4px; font-weight:700; cursor:pointer;">
                                ⚡ 依上游匯入 (${upstreamVol} veh/h) 平衡本方向
                            </button>
                        </div>`;
                }
            }

            cardsHtml += `
                <div class="synchro-approach-card" data-approach-link="${link.id}">
                    <div class="synchro-approach-title">
                        <span class="synchro-compass-badge">${compass.label}</span>
                        <span style="font-size:0.75rem; font-weight:700; color:#475569;">${link.name || link.id}</span>
                    </div>
                    ${renderSynchroLanePickerHTML(link, 'node_' + node.id)}
                    <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #e2e8f0;">
                        <div style="font-size:0.72rem; font-weight:700; color:#334155; margin-bottom:6px; display:flex; justify-content:space-between;">
                            <span>轉向車流量 (veh/h)</span>
                            <span style="color:var(--primary);">合計 <b>${localTotal}</b> veh/h</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; font-size:0.72rem;">
                            ${leftDest ? `
                                <div style="background:#f8fafc; padding:4px 6px; border-radius:5px; border:1px solid #e2e8f0;">
                                    <div style="display:flex; justify-content:space-between; color:#64748b; font-size:0.65rem; margin-bottom:2px;"><b>↰ 左轉</b><span>${getPct(leftDest)}%</span></div>
                                    <input type="number" class="prop-input synchro-node-vol" data-from="${link.id}" data-to="${leftDest.id}" value="${getVol(leftDest)}" min="0" step="10" style="padding:2px 4px; font-size:0.76rem;">
                                </div>` : `<div style="background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:0.68rem;">無左轉</div>`}
                            ${straightDest ? `
                                <div style="background:#f8fafc; padding:4px 6px; border-radius:5px; border:1px solid #e2e8f0;">
                                    <div style="display:flex; justify-content:space-between; color:#64748b; font-size:0.65rem; margin-bottom:2px;"><b>↑ 直行</b><span>${getPct(straightDest)}%</span></div>
                                    <input type="number" class="prop-input synchro-node-vol" data-from="${link.id}" data-to="${straightDest.id}" value="${getVol(straightDest)}" min="0" step="10" style="padding:2px 4px; font-size:0.76rem;">
                                </div>` : `<div style="background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:0.68rem;">無直行</div>`}
                            ${rightDest ? `
                                <div style="background:#f8fafc; padding:4px 6px; border-radius:5px; border:1px solid #e2e8f0;">
                                    <div style="display:flex; justify-content:space-between; color:#64748b; font-size:0.65rem; margin-bottom:2px;"><b>↱ 右轉</b><span>${getPct(rightDest)}%</span></div>
                                    <input type="number" class="prop-input synchro-node-vol" data-from="${link.id}" data-to="${rightDest.id}" value="${getVol(rightDest)}" min="0" step="10" style="padding:2px 4px; font-size:0.76rem;">
                                </div>` : `<div style="background:#f1f5f9; border-radius:5px; display:flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:0.68rem;">無右轉</div>`}
                        </div>
                        ${flowStatusHtml}
                    </div>
                </div>
            `;
        });

        // 3. 底部快捷號誌與全網流量平衡工具列 (收斂色彩，不搶車道圖視覺焦點)
        const quickToolsHtml = `
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px; padding-top:8px; border-top:1px solid var(--border-light);">
                <div style="display:flex; gap:6px;">
                    <button type="button" id="btn-synchro-quick-2phase" class="btn-soft" style="flex:1;">
                        <i class="fa-solid fa-traffic-light" style="color:#0284c7;"></i> 一鍵二相號誌
                    </button>
                    <button type="button" id="btn-synchro-quick-4phase" class="btn-soft" style="flex:1;">
                        <i class="fa-solid fa-traffic-light" style="color:#7c3aed;"></i> 保護左轉四相
                    </button>
                </div>
                <button type="button" id="btn-synchro-balance-all" class="btn-soft" style="color:#059669; border-color:#a7f3d0; background:#f0fdf4;">
                    <i class="fa-solid fa-scale-balanced"></i> 全路網上下游流量自動守恆平衡
                </button>
            </div>
        `;

        return switcherHtml + cardsHtml + quickToolsHtml;
    }

    // Apply quick 2-phase or 4-phase signal plan to a Node (含 3 秒黃燈清道時間，並支援自動開啟時制庫檢視)
    function applySynchroQuickSignalPlan(node, numPhases = 2, openModal = true) {
        if (!node) return;
        let nodeConns = Object.values(network.connections).filter(c => c.nodeId === node.id);
        if (nodeConns.length === 0) {
            autoConnectNode(node);
            nodeConns = Object.values(network.connections).filter(c => c.nodeId === node.id);
        }

        const ewThruRight = [];
        const ewLeft = [];
        const nsThruRight = [];
        const nsLeft = [];

        // 1. 先依標準羅盤方位 (EB/WB vs NB/SB) 分類
        nodeConns.forEach(conn => {
            const srcLink = network.links[conn.sourceLinkId];
            const dstLink = network.links[conn.destLinkId];
            if (!srcLink || !dstLink) return;
            const compass = getSynchroApproachCompass(srcLink).code;
            const turnDir = getTurnDirection(srcLink, dstLink);
            const isEW = (compass === 'EB' || compass === 'WB');
            if (isEW) {
                if (turnDir === 'left') ewLeft.push(conn.id);
                else ewThruRight.push(conn.id);
            } else {
                if (turnDir === 'left') nsLeft.push(conn.id);
                else nsThruRight.push(conn.id);
            }
        });

        // 2. 防呆：若為斜交路口導致某向完全為空，改以第一條進入路段之軸線夾角 (±45°) 自動切分兩相
        const inLinks = [...node.incomingLinkIds].map(id => network.links[id]).filter(Boolean);
        if (inLinks.length >= 2 && (ewThruRight.length + ewLeft.length === 0 || nsThruRight.length + nsLeft.length === 0)) {
            ewThruRight.length = 0; ewLeft.length = 0;
            nsThruRight.length = 0; nsLeft.length = 0;

            const baseDeg = getSynchroApproachCompass(inLinks[0]).deg;
            const isSameAxisAsBase = (deg) => {
                let diff = Math.abs(((deg - baseDeg) % 180 + 180) % 180);
                if (diff > 90) diff = 180 - diff;
                return diff <= 45;
            };

            nodeConns.forEach(conn => {
                const srcLink = network.links[conn.sourceLinkId];
                const dstLink = network.links[conn.destLinkId];
                if (!srcLink || !dstLink) return;
                const deg = getSynchroApproachCompass(srcLink).deg;
                const turnDir = getTurnDirection(srcLink, dstLink);
                if (isSameAxisAsBase(deg)) {
                    if (turnDir === 'left') ewLeft.push(conn.id);
                    else ewThruRight.push(conn.id);
                } else {
                    if (turnDir === 'left') nsLeft.push(conn.id);
                    else nsThruRight.push(conn.id);
                }
            });
        }

        // 3. 建立包含 3 秒黃燈 (Yellow) 的時相陣列
        let groups = {};
        let phases = [];
        if (numPhases === 4 && (ewLeft.length > 0 || nsLeft.length > 0)) {
            groups = {
                'G1': { id: 'G1', connIds: [...ewThruRight], type: 'vehicle' },
                'G2': { id: 'G2', connIds: [...ewLeft], type: 'vehicle' },
                'G3': { id: 'G3', connIds: [...nsThruRight], type: 'vehicle' },
                'G4': { id: 'G4', connIds: [...nsLeft], type: 'vehicle' }
            };
            phases = [
                { duration: 32, signals: { G1: 'Green', G2: 'Red', G3: 'Red', G4: 'Red' } },
                { duration: 3, signals: { G1: 'Yellow', G2: 'Red', G3: 'Red', G4: 'Red' } },
                { duration: 2, signals: { G1: 'Red', G2: 'Red', G3: 'Red', G4: 'Red' } },
                { duration: 12, signals: { G1: 'Red', G2: 'Green', G3: 'Red', G4: 'Red' } },
                { duration: 3, signals: { G1: 'Red', G2: 'Yellow', G3: 'Red', G4: 'Red' } },
                { duration: 2, signals: { G1: 'Red', G2: 'Red', G3: 'Red', G4: 'Red' } },
                { duration: 32, signals: { G1: 'Red', G2: 'Red', G3: 'Green', G4: 'Red' } },
                { duration: 3, signals: { G1: 'Red', G2: 'Red', G3: 'Yellow', G4: 'Red' } },
                { duration: 2, signals: { G1: 'Red', G2: 'Red', G3: 'Red', G4: 'Red' } },
                { duration: 12, signals: { G1: 'Red', G2: 'Red', G3: 'Red', G4: 'Green' } },
                { duration: 3, signals: { G1: 'Red', G2: 'Red', G3: 'Red', G4: 'Yellow' } },
                { duration: 2, signals: { G1: 'Red', G2: 'Red', G3: 'Red', G4: 'Red' } }
            ];
        } else {
            groups = {
                'G1': { id: 'G1', connIds: [...ewThruRight, ...ewLeft], type: 'vehicle' },
                'G2': { id: 'G2', connIds: [...nsThruRight, ...nsLeft], type: 'vehicle' }
            };
            phases = [
                { duration: 37, signals: { G1: 'Green', G2: 'Red' } },
                { duration: 3, signals: { G1: 'Yellow', G2: 'Red' } },
                { duration: 2, signals: { G1: 'Red', G2: 'Red' } },
                { duration: 37, signals: { G1: 'Red', G2: 'Green' } },
                { duration: 3, signals: { G1: 'Red', G2: 'Yellow' } },
                { duration: 2, signals: { G1: 'Red', G2: 'Red' } }
            ];
        }

        const gsId = 'GroupSet_1';
        const groupsClone = JSON.parse(JSON.stringify(groups));

        network.trafficLights[node.id] = {
            nodeId: node.id,
            timeShift: 0,
            activeGroupSetId: gsId,
            signalGroups: groupsClone,
            signalGroupSets: {
                [gsId]: {
                    id: gsId,
                    name: numPhases === 4 ? '四相保護左轉群組' : '二相標準群組',
                    groups: groupsClone
                }
            },
            schedule: JSON.parse(JSON.stringify(phases)),
            advanced: {
                schedules: {
                    'Sched_A': {
                        id: 'Sched_A',
                        name: numPhases === 4 ? '標準四相時制' : '標準二相時制',
                        groupSetId: gsId,
                        timeShift: 0,
                        phases: JSON.parse(JSON.stringify(phases))
                    }
                },
                dailyPlans: {
                    'Plan_1': { id: 'Plan_1', name: '平日全日時制', switches: [{ time: '00:00', schedId: 'Sched_A' }] }
                },
                weekly: { 1: 'Plan_1', 2: 'Plan_1', 3: 'Plan_1', 4: 'Plan_1', 5: 'Plan_1', 6: 'Plan_1', 7: 'Plan_1' }
            }
        };

        ensureTflGroupSets(network.trafficLights[node.id]);
        saveState();
        updatePropertiesPanel(node);

        // ★ 若由按鈕點擊觸發 (openModal = true)，自動打開號誌編輯器並跳轉至「時制庫 (Schedule Library)」分頁，立即顯示紅綠黃燈表格！
        if (openModal && typeof showTrafficLightEditor === 'function') {
            showTrafficLightEditor(node);
            const libTabBtn = document.querySelector('#traffic-light-modal .tab-link[data-tab="tfl-library"]');
            if (libTabBtn) libTabBtn.click();
        }
    }

    function bindSynchroNodePanelEvents(container, node) {
        if (!container || !node) return;

        // 綁定方向切換按鈕 (Approach Switcher)
        container.querySelectorAll('.approach-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const rawIdx = btn.dataset.appIdx;
                node._activeSynchroAppIdx = rawIdx === 'all' ? 'all' : parseInt(rawIdx, 10);
                updatePropertiesPanel(node);
            });
            btn.addEventListener('mouseenter', () => {
                const linkId = btn.dataset.highlightLink;
                if (linkId) {
                    layer.find('.link-highlight').forEach(r => r.destroy());
                    const l = network.links[linkId];
                    if (l && l.konvaGroup) {
                        l.konvaGroup.opacity(0.75);
                        layer.batchDraw();
                    }
                }
            });
            btn.addEventListener('mouseleave', () => {
                const linkId = btn.dataset.highlightLink;
                if (linkId && network.links[linkId]) {
                    network.links[linkId].konvaGroup.opacity(1);
                    layer.batchDraw();
                }
            });
        });

        // 綁定顯示中的各方向 Synchro 車道選擇器
        node.incomingLinkIds.forEach(linkId => {
            const link = network.links[linkId];
            if (link) {
                bindSynchroLanePickerEvents(container, link, 'node_' + node.id, () => {
                    updatePropertiesPanel(node);
                });
            }
        });

        // 轉向車流量 (veh/h) 輸入框
        container.querySelectorAll('.synchro-node-vol').forEach(input => {
            input.addEventListener('change', (e) => {
                const fromId = e.target.dataset.from;
                const toId = e.target.dataset.to;
                const val = Math.max(0, Math.round(parseFloat(e.target.value) || 0));
                const inLink = network.links[fromId];
                if (!inLink) return;
                const volMap = ensureSynchroTurnVolumesForApproach(node, inLink);
                volMap[toId] = val;
                syncSynchroApproachVolumesAndSource(node, inLink);
                layer.batchDraw();
                saveState();
                updatePropertiesPanel(node);
            });
        });

        // 單一方向流量守恆平衡按鈕
        container.querySelectorAll('.btn-synchro-balance-single').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const inLink = network.links[btn.dataset.approachLink];
                if (inLink && balanceSingleSynchroApproachToUpstream(node, inLink)) {
                    layer.batchDraw();
                    saveState();
                    updatePropertiesPanel(node);
                }
            });
        });

        // 全路網流量守恆平衡與快捷號誌按鈕
        container.querySelector('#btn-synchro-balance-all')?.addEventListener('click', () => {
            balanceAllSynchroNetworkFlows();
            updatePropertiesPanel(node);
        });
        container.querySelector('#btn-synchro-quick-2phase')?.addEventListener('click', () => applySynchroQuickSignalPlan(node, 2));
        container.querySelector('#btn-synchro-quick-4phase')?.addEventListener('click', () => applySynchroQuickSignalPlan(node, 4));
    }

    // =========================================================================
    // ⚡ 正統 SYNCHRO 互動式繪圖與磁吸引擎 (免按右鍵、左鍵點兩點或拖曳即建兩端 Node + 雙向 Link)
    // =========================================================================

    // synchroDraftStart, synchroDraftPreviewGroup, synchroSnapIndicatorGroup initialized at top

    // =========================================================================
    // ⚡ 正統 SYNCHRO 互動式多點繪圖與磁吸引擎 (左鍵連續點轉折點、右鍵結束建立)
    // =========================================================================

    // 判斷 Node 是否為端點節點 (僅連接單一道路方向或尚無轉向連線)
    function isSynchroTerminalNode(node) {
        if (!node) return true;
        const inIds = [...(node.incomingLinkIds || [])].filter(id => network.links[id]);
        const outIds = [...(node.outgoingLinkIds || [])].filter(id => network.links[id]);
        const totalLinks = inIds.length + outIds.length;
        if (totalLinks === 0 || totalLinks === 1) return true;
        if (totalLinks === 2 && inIds.length === 1 && outIds.length === 1) {
            const lIn = network.links[inIds[0]];
            const lOut = network.links[outIds[0]];
            if (lIn && lOut && lIn.pairInfo && lIn.pairInfo.pairId === lOut.id) {
                return true; // 單一雙向道路的端點 Node
            }
        }
        return false;
    }

    // 計算磁吸目標：優先磁吸既有 Node (22m 內) -> 其次磁吸既有道路中心線 (18m 內) -> 否則為自由座標
    function getSynchroSnapTarget(worldPos, excludeNodeId = null) {
        const NODE_SNAP_DIST = 22;
        const LINK_SNAP_DIST = 18;

        // 1. 優先檢查既有 Node
        let bestNode = null;
        let bestNodeDist = NODE_SNAP_DIST;
        Object.values(network.nodes).forEach(node => {
            if (excludeNodeId && node.id === excludeNodeId) return;
            const d = Math.hypot(worldPos.x - node.x, worldPos.y - node.y);
            if (d < bestNodeDist) {
                bestNodeDist = d;
                bestNode = node;
            }
        });
        if (bestNode) {
            return { x: bestNode.x, y: bestNode.y, type: 'node', node: bestNode };
        }

        // 2. 檢查既有道路 Link (若為雙向配對道路，自動磁吸至雙向道路的正中央分隔線)
        let bestLink = null;
        let bestLinkDist = LINK_SNAP_DIST;
        let bestSnapPt = null;

        Object.values(network.links).forEach(link => {
            if (!link.waypoints || link.waypoints.length < 2) return;
            const { dist, pointDist } = projectPointOnPolyline(worldPos, link.waypoints);
            if (pointDist < bestLinkDist) {
                const { point: projPt } = getPointAlongPolyline(link.waypoints, dist);
                let centerPt = projPt;

                if (link.pairInfo && link.pairInfo.pairId && network.links[link.pairInfo.pairId]) {
                    const pairLink = network.links[link.pairInfo.pairId];
                    if (pairLink.waypoints && pairLink.waypoints.length >= 2) {
                        const pairProj = projectPointOnPolyline(projPt, pairLink.waypoints);
                        const { point: pairPt } = getPointAlongPolyline(pairLink.waypoints, pairProj.dist);
                        centerPt = {
                            x: (projPt.x + pairPt.x) / 2,
                            y: (projPt.y + pairPt.y) / 2
                        };
                    }
                }

                for (const n of Object.values(network.nodes)) {
                    if (excludeNodeId && n.id === excludeNodeId) continue;
                    if (Math.hypot(centerPt.x - n.x, centerPt.y - n.y) < 24) {
                        bestNode = n;
                        break;
                    }
                }

                bestLinkDist = pointDist;
                bestLink = link;
                bestSnapPt = centerPt;
            }
        });

        if (bestNode) {
            return { x: bestNode.x, y: bestNode.y, type: 'node', node: bestNode };
        }
        if (bestLink && bestSnapPt) {
            return { x: bestSnapPt.x, y: bestSnapPt.y, type: 'link', link: bestLink };
        }

        return { x: worldPos.x, y: worldPos.y, type: 'free' };
    }

    // 繪製滑鼠游標處的磁吸圓圈與左右鍵操作提示 (同時支援 Synchro 模式與一般 Link 工具)
    function updateSynchroSnapIndicator(worldPos) {
        if (activeTool !== 'add-link' && activeTool !== 'append-lane-stroke') {
            if (synchroSnapIndicatorGroup) {
                synchroSnapIndicatorGroup.destroy();
                synchroSnapIndicatorGroup = null;
                layer.batchDraw();
            }
            return null;
        }

        const scale = 1 / stage.scaleX();
        let snap = { x: worldPos.x, y: worldPos.y, type: 'free' };
        let ringColor = '#0ea5e9';
        let fillColor = 'rgba(14, 165, 233, 0.22)';
        let badgeText = '';
        let radius = 9 * scale;

        if (isSynchroMode && activeTool === 'add-link') {
            // --- A. Synchro 模式：具備節點/道路磁吸 ---
            let excludeId = null;
            if (synchroDraftStart) {
                const pts = synchroDraftStart.points || [synchroDraftStart];
                const lastPt = pts[pts.length - 1];
                if (lastPt && lastPt.node) excludeId = lastPt.node.id;
            }

            snap = getSynchroSnapTarget(worldPos, excludeId);
            const ptCount = synchroDraftStart && synchroDraftStart.points ? synchroDraftStart.points.length : 0;

            badgeText = ptCount === 0
                ? '左鍵點擊：建立起點 Node'
                : `已點 ${ptCount} 點 ｜ 左鍵：加彎折點 ｜ 右鍵：結束建立道路`;

            if (snap.type === 'node') {
                ringColor = '#f59e0b';
                fillColor = 'rgba(245, 158, 11, 0.32)';
                badgeText = ptCount === 0
                    ? `⚡ 左鍵：從既有節點 (${snap.node.id}) 出發`
                    : `⚡ 磁吸節點 (${snap.node.id}) ｜ 左鍵加點 / 右鍵結束`;
                radius = 13 * scale;
            } else if (snap.type === 'link') {
                ringColor = '#10b981';
                fillColor = 'rgba(16, 185, 129, 0.30)';
                badgeText = ptCount === 0
                    ? '⚡ 左鍵：從既有道路切開建立起點 Node'
                    : '⚡ 磁吸道路 (自動切開建立路口) ｜ 左鍵加點 / 右鍵結束';
                radius = 13 * scale;
            }
        } else {
            // --- B. 一般 Link 工具 / 手繪標線模式 ---
            const ptCount = tempShape ? Math.max(1, Math.floor(tempShape.points().length / 2) - 1) : 0;
            const isLaneBased = (linkCreationSettings.mode === 'lane-based' || activeTool === 'append-lane-stroke');

            ringColor = '#2563eb';
            fillColor = 'rgba(37, 99, 235, 0.18)';

            if (ptCount === 0) {
                badgeText = isLaneBased
                    ? '左鍵點擊：設定標線起點'
                    : '左鍵點擊：設定道路起點';
            } else {
                badgeText = isLaneBased
                    ? `已點 ${ptCount} 點 ｜ 左鍵：加折點 ｜ 右鍵：完成此標線`
                    : `已點 ${ptCount} 點 ｜ 左鍵：加彎折點 ｜ 右鍵：完成建立道路`;
            }
        }

        if (!synchroSnapIndicatorGroup) {
            synchroSnapIndicatorGroup = new Konva.Group({ listening: false, name: 'synchro-snap-indicator' });
            layer.add(synchroSnapIndicatorGroup);
        } else {
            synchroSnapIndicatorGroup.destroyChildren();
        }

        const outerCircle = new Konva.Circle({
            x: snap.x,
            y: snap.y,
            radius: radius,
            fill: fillColor,
            stroke: ringColor,
            strokeWidth: 2 * scale,
            dash: snap.type === 'free' ? [] : [4 * scale, 3 * scale],
            listening: false
        });

        const innerDot = new Konva.Circle({
            x: snap.x,
            y: snap.y,
            radius: 3.2 * scale,
            fill: ringColor,
            listening: false
        });

        const label = new Konva.Text({
            x: snap.x + 14 * scale,
            y: snap.y - 18 * scale,
            text: badgeText,
            fontSize: 12 * scale,
            fontStyle: 'bold',
            fill: '#0f172a',
            padding: 3 * scale,
            listening: false
        });

        const labelBg = new Konva.Rect({
            x: label.x() - 2 * scale,
            y: label.y() - 1 * scale,
            width: label.width() + 4 * scale,
            height: label.height() + 2 * scale,
            fill: 'rgba(255, 255, 255, 0.94)',
            stroke: ringColor,
            strokeWidth: 1 * scale,
            cornerRadius: 4 * scale,
            listening: false
        });

        synchroSnapIndicatorGroup.add(outerCircle, innerDot, labelBg, label);
        synchroSnapIndicatorGroup.moveToTop();
        return snap;
    }

    // 繪製多點折線的即時雙向道路與轉折點預覽
    function updateSynchroDraftPreview(cursorSnap) {
        if (!synchroDraftStart) return;
        if (!synchroDraftPreviewGroup) {
            synchroDraftPreviewGroup = new Konva.Group({ listening: false, name: 'synchro-draft-preview' });
            layer.add(synchroDraftPreviewGroup);
        } else {
            synchroDraftPreviewGroup.destroyChildren();
        }

        const confirmedPts = synchroDraftStart.points || [synchroDraftStart];
        const allPts = [...confirmedPts];
        if (cursorSnap) {
            const last = confirmedPts[confirmedPts.length - 1];
            if (!last || Math.hypot(cursorSnap.x - last.x, cursorSnap.y - last.y) > 1) {
                allPts.push(cursorSnap);
            }
        }

        const flatPoints = allPts.flatMap(p => [p.x, p.y]);
        const lanes = linkCreationSettings.lanesPerDir || 2;
        const isTwoWay = linkCreationSettings.isTwoWay !== false;
        const median = linkCreationSettings.medianWidth || 0;
        const totalCorridorW = isTwoWay ? (lanes * LANE_WIDTH * 2 + median) : (lanes * LANE_WIDTH);

        if (allPts.length >= 2) {
            const corridorLine = new Konva.Line({
                points: flatPoints,
                stroke: 'rgba(51, 65, 85, 0.55)',
                strokeWidth: totalCorridorW,
                lineCap: 'butt',
                lineJoin: 'round',
                listening: false
            });
            const centerLine = new Konva.Line({
                points: flatPoints,
                stroke: isTwoWay ? '#facc15' : '#38bdf8',
                strokeWidth: 1.5,
                dash: [4, 4],
                lineJoin: 'round',
                listening: false
            });
            synchroDraftPreviewGroup.add(corridorLine, centerLine);
        }

        // 起點畫藍色大圓圈，中間每個彎折點畫白底橘框轉折點圓圈
        confirmedPts.forEach((pt, idx) => {
            if (idx === 0) {
                synchroDraftPreviewGroup.add(new Konva.Circle({
                    x: pt.x, y: pt.y,
                    radius: 9.5,
                    fill: 'rgba(37, 99, 235, 0.8)',
                    stroke: '#ffffff',
                    strokeWidth: 2,
                    listening: false
                }));
            } else {
                synchroDraftPreviewGroup.add(new Konva.Circle({
                    x: pt.x, y: pt.y,
                    radius: 6,
                    fill: '#ffffff',
                    stroke: '#f59e0b',
                    strokeWidth: 2.5,
                    listening: false
                }));
            }
        });

        if (cursorSnap) {
            synchroDraftPreviewGroup.add(new Konva.Circle({
                x: cursorSnap.x, y: cursorSnap.y,
                radius: 9.5,
                fill: 'rgba(245, 158, 11, 0.85)',
                stroke: '#ffffff',
                strokeWidth: 2,
                listening: false
            }));
        }

        synchroDraftPreviewGroup.moveToTop();
        if (synchroSnapIndicatorGroup) synchroSnapIndicatorGroup.moveToTop();
    }

    // 右鍵結束並建立多點彎折 Synchro 道路
    function finishSynchroDraft(rightClickWorldPos = null) {
        if (!synchroDraftStart) return false;
        const pts = [...(synchroDraftStart.points || [synchroDraftStart])];

        // 若使用者未在最後一點重複按左鍵、而是直接移動滑鼠到終點按右鍵，把右鍵當下的磁吸點也納為終點
        if (rightClickWorldPos && pts.length === 1) {
            const lastPt = pts[pts.length - 1];
            const snap = getSynchroSnapTarget(rightClickWorldPos, lastPt.node ? lastPt.node.id : null);
            if (Math.hypot(snap.x - lastPt.x, snap.y - lastPt.y) >= 5) {
                pts.push(snap);
            }
        }

        if (pts.length >= 2) {
            cleanupSynchroDraft(false, true);
            completeSynchroRoadSegment(pts);
            return true;
        } else {
            cleanupSynchroDraft(false, true);
            return false;
        }
    }

    function cleanupSynchroDraft(clearSnap = false, skipAutoFinish = false) {
        if (!clearSnap && !skipAutoFinish && synchroDraftStart && window.event && window.event.type === 'contextmenu') {
            const pts = synchroDraftStart.points || [synchroDraftStart];
            if (pts.length >= 2) {
                finishSynchroDraft();
                return;
            }
        }

        synchroDraftStart = null;
        if (synchroDraftPreviewGroup) {
            synchroDraftPreviewGroup.destroy();
            synchroDraftPreviewGroup = null;
        }
        if (clearSnap && synchroSnapIndicatorGroup) {
            synchroSnapIndicatorGroup.destroy();
            synchroSnapIndicatorGroup = null;
        }
        layer.batchDraw();
    }

    // 當既有 Node 接上第 2、3、4 條道路時，自動將各進入/離開路段端點退縮 (Setback) 出路口淨空區
    function rebuildSynchroNodeIntersection(node) {
        if (!node) return;
        if (isSynchroTerminalNode(node)) {
            node.konvaShape.moveToTop();
            return;
        }

        const SETBACK = 14;
        const connectedLinks = new Set();

        node.incomingLinkIds.forEach(id => {
            const link = network.links[id];
            if (!link || !link.waypoints || link.waypoints.length < 2) return;
            const pEnd = link.waypoints[link.waypoints.length - 1];
            const pPrev = link.waypoints[link.waypoints.length - 2];
            const segVec = getVector(pPrev, pEnd);
            const segLen = vecLen(segVec);
            if (segLen < SETBACK * 1.6) return;

            const dir = normalize(segVec);
            const relToNode = getVector(pEnd, { x: node.x, y: node.y });
            const lonDist = dot(relToNode, dir);
            if (lonDist < SETBACK - 1) {
                const pullback = SETBACK - lonDist;
                link.waypoints[link.waypoints.length - 1] = add(pEnd, scale(dir, -pullback));
                connectedLinks.add(link);
            }
        });

        node.outgoingLinkIds.forEach(id => {
            const link = network.links[id];
            if (!link || !link.waypoints || link.waypoints.length < 2) return;
            const pStart = link.waypoints[0];
            const pNext = link.waypoints[1];
            const segVec = getVector(pStart, pNext);
            const segLen = vecLen(segVec);
            if (segLen < SETBACK * 1.6) return;

            const dir = normalize(segVec);
            const relFromNode = getVector({ x: node.x, y: node.y }, pStart);
            const lonDist = dot(relFromNode, dir);
            if (lonDist < SETBACK - 1) {
                const pushForward = SETBACK - lonDist;
                link.waypoints[0] = add(pStart, scale(dir, pushForward));
                connectedLinks.add(link);
            }
        });

        node.customPolygonPoints = null;
        connectedLinks.forEach(l => {
            if (l.geometryType === 'parametric') generateParametricStrokes(l);
            drawLink(l);
            updateAllDetectorsOnLink(l.id);
            updateFlowPointsOnLink(l.id);
            updateRoadSignsOnLink(l.id);
        });

        node.incomingLinkIds.forEach(inId => {
            const inLink = network.links[inId];
            if (inLink) {
                const turns = inferSynchroLaneTurns(inLink);
                applySynchroLaneConfig(inLink, turns, { skipSave: true });
            }
        });

        redrawNodeConnections(node.id);
        node.konvaShape.moveToTop();
    }

    // 計算道路走廊半寬 (供 T 字路口跨越切割使用)
    function getRoadCorridorHalfWidth(link) {
        if (!link) return 8;
        const w = getLinkTotalWidth(link);
        if (link.pairInfo && link.pairInfo.pairId && network.links[link.pairInfo.pairId]) {
            const w2 = getLinkTotalWidth(network.links[link.pairInfo.pairId]);
            const med = link.pairInfo.medianWidth || 0;
            return (w + w2 + med) / 2;
        }
        return w / 2;
    }

    // 具備斜接角度補償 (Miter Scale) 的平行線偏移，確保多點彎折雙向道路在轉角處路寬恆定不變形
    function getTrueMiterOffsetPolyline(points, offset) {
        if (!points || points.length < 2) return [];
        const result = [];
        for (let i = 0; i < points.length; i++) {
            const pCurr = points[i];
            if (i === 0) {
                const v = normalize(getVector(pCurr, points[i + 1]));
                result.push(add(pCurr, scale(getNormal(v), offset)));
            } else if (i === points.length - 1) {
                const v = normalize(getVector(points[i - 1], pCurr));
                result.push(add(pCurr, scale(getNormal(v), offset)));
            } else {
                const v1 = normalize(getVector(points[i - 1], pCurr));
                const v2 = normalize(getVector(pCurr, points[i + 1]));
                const n1 = getNormal(v1);
                const n2 = getNormal(v2);
                const miterN = normalize(add(n1, n2));
                const cosHalf = dot(miterN, n1);
                // 補償轉角斜接長度 (1 / cos(θ/2))，並限制最大倍率為 2.5 倍以防極端銳角暴衝
                const miterScale = Math.abs(cosHalf) > 0.4 ? (1 / cosHalf) : 2.5;
                result.push(add(pCurr, scale(miterN, offset * miterScale)));
            }
        }
        return result;
    }

    // 完成一條 Synchro 道路 (支援任意多點彎折折線 snaps 陣列，建立首尾 Node 與連續彎折 Link)
    function completeSynchroRoadSegment(pointsOrStartSnap, legacyEndSnap = null) {
        const snaps = Array.isArray(pointsOrStartSnap)
            ? pointsOrStartSnap
            : [pointsOrStartSnap, legacyEndSnap].filter(Boolean);

        if (snaps.length < 2) return;

        const startSnap = snaps[0];
        const endSnap = snaps[snaps.length - 1];
        const finalPoints = snaps.map(s => ({ x: s.x, y: s.y }));

        if (getPolylineLength(finalPoints) < 8) return;

        // 若起點或終點磁吸在既有道路上 (T 字路口)，將該端微幅延伸跨越目標道路路幅
        if (startSnap.type === 'link' && startSnap.link) {
            const dirStart = normalize(getVector(finalPoints[0], finalPoints[1]));
            const halfSpan = getRoadCorridorHalfWidth(startSnap.link);
            finalPoints[0] = add(finalPoints[0], scale(dirStart, -(halfSpan + 2.5)));
        }
        if (endSnap.type === 'link' && endSnap.link) {
            const n = finalPoints.length;
            const dirEnd = normalize(getVector(finalPoints[n - 2], finalPoints[n - 1]));
            const halfSpan = getRoadCorridorHalfWidth(endSnap.link);
            finalPoints[n - 1] = add(finalPoints[n - 1], scale(dirEnd, halfSpan + 2.5));
        }

        // 1. 僅在「起點」與「終點」建立或重用 Node (中間所有點皆為同一條 Link 的彎折 Waypoints，絕不斷開!)
        const nodeA = (startSnap.type === 'node' && startSnap.node)
            ? startSnap.node
            : (startSnap.type === 'free' ? createNode(startSnap.x, startSnap.y) : null);

        const nodeB = (endSnap.type === 'node' && endSnap.node)
            ? endSnap.node
            : (endSnap.type === 'free' ? createNode(endSnap.x, endSnap.y) : null);

        const lanes = linkCreationSettings.lanesPerDir || 2;
        const isTwoWay = linkCreationSettings.isTwoWay !== false;
        const median = linkCreationSettings.medianWidth || 0;
        let createdLinks = [];

        if (isTwoWay) {
            const roadWidth = lanes * LANE_WIDTH;
            const offsetDist = (roadWidth / 2) + (median / 2);
            const forwardOffset = linkCreationSettings.drivingSide === 'right' ? offsetDist : -offsetDist;
            const backwardOffset = linkCreationSettings.drivingSide === 'right' ? -offsetDist : offsetDist;

            const forwardPoints = getTrueMiterOffsetPolyline(finalPoints, forwardOffset);
            const linkF = createLink(forwardPoints, lanes);
            linkF.name = `Link_${idCounter} (F)`;

            const backwardPoints = getTrueMiterOffsetPolyline(finalPoints, backwardOffset).reverse();
            const linkB = createLink(backwardPoints, lanes);
            linkB.name = `Link_${idCounter} (B)`;

            linkF.pairInfo = { pairId: linkB.id, type: 'forward', medianWidth: median };
            linkB.pairInfo = { pairId: linkF.id, type: 'backward', medianWidth: median };

            if (nodeA) {
                linkF.startNodeId = nodeA.id;
                nodeA.outgoingLinkIds.add(linkF.id);
                linkB.endNodeId = nodeA.id;
                nodeA.incomingLinkIds.add(linkB.id);
            }
            if (nodeB) {
                linkF.endNodeId = nodeB.id;
                nodeB.incomingLinkIds.add(linkF.id);
                linkB.startNodeId = nodeB.id;
                nodeB.outgoingLinkIds.add(linkB.id);
            }
            createdLinks = [linkF, linkB];
        } else {
            const newLink = createLink(finalPoints, lanes);
            if (nodeA) {
                newLink.startNodeId = nodeA.id;
                nodeA.outgoingLinkIds.add(newLink.id);
            }
            if (nodeB) {
                newLink.endNodeId = nodeB.id;
                nodeB.incomingLinkIds.add(newLink.id);
            }
            createdLinks = [newLink];
        }

        // 2. 若起點 nodeA 或終點 nodeB 連接了 2 條以上道路，自動退縮端點並建立路口車道連線
        if (nodeA && !isSynchroTerminalNode(nodeA)) {
            rebuildSynchroNodeIntersection(nodeA);
        }
        if (nodeB && !isSynchroTerminalNode(nodeB)) {
            rebuildSynchroNodeIntersection(nodeB);
        }

        // 3. 檢查是否有與其他既有道路交叉，自動切開建立路口 Node
        updateAllOverpasses();
        handleSynchroAutoIntersections(createdLinks);

        // 4. 將所有 Node 移至最上層
        Object.values(network.nodes).forEach(n => {
            if (n.konvaShape) n.konvaShape.moveToTop();
        });

        if (nodeB && network.nodes[nodeB.id]) {
            selectObject(nodeB);
        } else if (createdLinks[0] && network.links[createdLinks[0].id]) {
            selectObject(createdLinks[0]);
        }

        layer.batchDraw();
        saveState();
    }

    // 左鍵點擊：持續新增起點與彎折點 (絕不在第 2 點斷開，直到按右鍵才結束)
    function handleSynchroMouseDown(worldPos, e) {
        let excludeId = null;
        if (synchroDraftStart && synchroDraftStart.points && synchroDraftStart.points.length > 0) {
            const lastPt = synchroDraftStart.points[synchroDraftStart.points.length - 1];
            if (lastPt && lastPt.node) excludeId = lastPt.node.id;
        }

        const snap = getSynchroSnapTarget(worldPos, excludeId);

        if (!synchroDraftStart) {
            synchroDraftStart = {
                ...snap,
                points: [snap]
            };
            updateSynchroDraftPreview(snap);
            updateSynchroSnapIndicator(worldPos);
            layer.batchDraw();
        } else {
            if (!Array.isArray(synchroDraftStart.points)) {
                synchroDraftStart.points = [synchroDraftStart];
            }
            const pts = synchroDraftStart.points;
            const lastPt = pts[pts.length - 1];
            const dist = Math.hypot(snap.x - lastPt.x, snap.y - lastPt.y);
            if (dist >= 3) {
                pts.push(snap);
                updateSynchroDraftPreview(snap);
                updateSynchroSnapIndicator(worldPos);
                layer.batchDraw();
            }
        }
    }

    function handleSynchroMouseMove(worldPos, e) {
        const snap = updateSynchroSnapIndicator(worldPos);
        if (synchroDraftStart && snap) {
            updateSynchroDraftPreview(snap);
        }
        layer.batchDraw();
    }

    function handleSynchroMouseUp(worldPos, e) {
        // 左鍵放開時絕不結束繪製，僅刷新預覽，讓使用者可無限次點左鍵增加彎折點，直到按右鍵才結束
        if (synchroDraftStart && worldPos) {
            const snap = updateSynchroSnapIndicator(worldPos);
            if (snap) {
                updateSynchroDraftPreview(snap);
            }
            layer.batchDraw();
        }
    }

    // Extend start/end of newly drawn points if they terminate near an existing link (T-junction)
    function extendSynchroPointsForTJunctions(points) {
        if (!points || points.length < 2) return;
        const SNAP_DIST = 22;
        const checkAndExtendEndpoint = (isStart) => {
            const pt = isStart ? points[0] : points[points.length - 1];
            const adj = isStart ? points[1] : points[points.length - 2];
            const dir = normalize(getVector(adj, pt));

            let bestDist = SNAP_DIST;
            let foundLink = null;
            Object.values(network.links).forEach(link => {
                if (!link.waypoints || link.waypoints.length < 2) return;
                for (let i = 0; i < points.length - 1; i++) {
                    for (let j = 0; j < link.waypoints.length - 1; j++) {
                        if (lineSegmentIntersection(points[i], points[i + 1], link.waypoints[j], link.waypoints[j + 1])) {
                            return;
                        }
                    }
                }
                const { pointDist } = projectPointOnPolyline(pt, link.waypoints);
                if (pointDist < bestDist) {
                    bestDist = pointDist;
                    foundLink = link;
                }
            });

            if (foundLink) {
                const halfSpan = getRoadCorridorHalfWidth(foundLink);
                const extendedPt = add(pt, scale(dir, bestDist + halfSpan + 2.5));
                if (isStart) points[0] = extendedPt;
                else points[points.length - 1] = extendedPt;
            }
        };

        checkAndExtendEndpoint(true);
        checkAndExtendEndpoint(false);
    }

    // Cluster overlapping/adjacent overpass boxes and auto-generate intersections + Synchro lane configs
    function handleSynchroAutoIntersections(createdLinks = []) {
        updateAllOverpasses();
        const overpasses = Object.values(network.overpasses || {});
        if (overpasses.length === 0) return;

        const createdIds = new Set((createdLinks || []).map(l => l.id));

        const boxes = overpasses.map(op => {
            // 排除同一條雙向道路順逆向配對自身的交疊誤判
            const l1 = network.links[op.linkId1];
            const l2 = network.links[op.linkId2];
            if (l1 && l2 && l1.pairInfo && l1.pairInfo.pairId === l2.id) return null;
            if (createdIds.size > 0 && !createdIds.has(op.linkId1) && !createdIds.has(op.linkId2)) return null;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            if (op.konvaRect) {
                minX = op.konvaRect.x();
                minY = op.konvaRect.y();
                maxX = minX + op.konvaRect.width();
                maxY = minY + op.konvaRect.height();
            } else if (Array.isArray(op.points)) {
                op.points.forEach(p => {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                });
            }
            return {
                op,
                minX, minY, maxX, maxY,
                cx: (minX + maxX) / 2,
                cy: (minY + maxY) / 2
            };
        }).filter(b => {
            if (!b || !isFinite(b.cx) || !isFinite(b.cy)) return false;
            for (const n of Object.values(network.nodes)) {
                if (!isSynchroTerminalNode(n) && Math.hypot(b.cx - n.x, b.cy - n.y) < 22) {
                    return false;
                }
            }
            return true;
        });

        if (boxes.length === 0) return;

        const CLUSTER_DIST = 42;
        const visited = new Array(boxes.length).fill(false);
        const clusters = [];

        for (let i = 0; i < boxes.length; i++) {
            if (visited[i]) continue;
            visited[i] = true;
            const queue = [boxes[i]];
            const cluster = [boxes[i]];
            while (queue.length > 0) {
                const cur = queue.shift();
                for (let j = 0; j < boxes.length; j++) {
                    if (visited[j]) continue;
                    const dist = Math.hypot(cur.cx - boxes[j].cx, cur.cy - boxes[j].cy);
                    if (dist <= CLUSTER_DIST) {
                        visited[j] = true;
                        queue.push(boxes[j]);
                        cluster.push(boxes[j]);
                    }
                }
            }
            clusters.push(cluster);
        }

        const prevMode = intersectionMode;
        intersectionMode = 'zone';

        const existingNodeIds = new Set(Object.keys(network.nodes));

        clusters.forEach(cluster => {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            cluster.forEach(b => {
                if (b.minX < minX) minX = b.minX;
                if (b.maxX > maxX) maxX = b.maxX;
                if (b.minY < minY) minY = b.minY;
                if (b.maxY > maxY) maxY = b.maxY;
            });
            const pad = 6;
            const rectPoly = [
                { x: minX - pad, y: minY - pad },
                { x: maxX + pad, y: minY - pad },
                { x: maxX + pad, y: maxY + pad },
                { x: minX - pad, y: maxY + pad }
            ];
            processManualIntersection(rectPoly);
        });

        intersectionMode = prevMode;

        Object.values(network.nodes).forEach(node => {
            if (!existingNodeIds.has(node.id)) {
                node.incomingLinkIds.forEach(inId => {
                    const inLink = network.links[inId];
                    if (inLink) {
                        const defaultTurns = inferSynchroLaneTurns(inLink);
                        applySynchroLaneConfig(inLink, defaultTurns, { skipSave: true });
                    }
                });
                if (node.konvaShape) node.konvaShape.moveToTop();
                selectObject(node);
            }
        });

        updateAllOverpasses();
        layer.batchDraw();
    }

    // Synchro Node rubber-band dragging (moves connected link endpoints together with the Node)
    function setupSynchroNodeDrag(node) {
        if (!node || !node.konvaShape) return;
        node.konvaShape.draggable(activeTool === 'select');

        node.konvaShape.on('dragstart', () => {
            if (activeTool !== 'select') {
                node.konvaShape.stopDrag();
                return;
            }
        });

        node.konvaShape.on('dragmove', () => {
            if (activeTool !== 'select') return;
            const dx = node.konvaShape.x();
            const dy = node.konvaShape.y();
            if (dx === 0 && dy === 0) return;

            node.konvaShape.position({ x: 0, y: 0 });
            node.x += dx;
            node.y += dy;

            if (Array.isArray(node.customPolygonPoints)) {
                for (let i = 0; i < node.customPolygonPoints.length; i += 2) {
                    node.customPolygonPoints[i] += dx;
                    node.customPolygonPoints[i + 1] += dy;
                }
            }

            const affectedLinks = new Set();
            node.incomingLinkIds.forEach(id => {
                const l = network.links[id];
                if (l && l.waypoints && l.waypoints.length >= 2) {
                    const last = l.waypoints[l.waypoints.length - 1];
                    last.x += dx;
                    last.y += dy;
                    affectedLinks.add(l);
                }
            });
            node.outgoingLinkIds.forEach(id => {
                const l = network.links[id];
                if (l && l.waypoints && l.waypoints.length >= 2) {
                    const first = l.waypoints[0];
                    first.x += dx;
                    first.y += dy;
                    affectedLinks.add(l);
                }
            });

            affectedLinks.forEach(l => {
                if (l.geometryType === 'parametric') generateParametricStrokes(l);
                drawLink(l);
                updateAllDetectorsOnLink(l.id);
                updateFlowPointsOnLink(l.id);
                updateRoadSignsOnLink(l.id);
                if (l.startNodeId && l.startNodeId !== node.id) redrawNodeConnections(l.startNodeId);
                if (l.endNodeId && l.endNodeId !== node.id) redrawNodeConnections(l.endNodeId);
            });

            redrawNodeConnections(node.id);
            if (selectedObject && selectedObject.id === node.id) {
                drawNodeHandles(node);
            }
            layer.batchDraw();
        });

        node.konvaShape.on('dragend', () => {
            if (activeTool !== 'select') return;
            updateAllOverpasses();
            saveState();
        });
    }

    // 畫布頂部操作提示橫幅
    function updateSynchroCanvasHint() {
        let banner = document.getElementById('synchro-canvas-hint');
        if (!isSynchroMode) {
            if (banner) banner.style.display = 'none';
            return;
        }
        if (!banner) {
            const container = document.getElementById('canvas-container') || document.body;
            banner = document.createElement('div');
            banner.id = 'synchro-canvas-hint';
            banner.style.cssText = 'position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:40; background:#f0f7ff; color:#1e293b; border:1px solid #bfdbfe; border-radius:8px; padding:4px 10px; font-size:0.78rem; display:flex; align-items:center; gap:10px; box-shadow:0 2px 8px rgba(37,99,235,0.08);';
            container.appendChild(banner);
        }
        banner.style.display = 'flex';

        // 預設為畫路（只有當前明確是 select 時才為選取）
        const isDraw = (activeTool !== 'select');

        banner.innerHTML = `
        <div style="display:flex; background:#dbeafe; padding:2px; border-radius:6px; gap:2px;">
            <button type="button" id="synchro-tab-draw" style="
                border:none; cursor:pointer; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:600; display:flex; align-items:center; gap:5px; transition:all 0.15s;
                background:${isDraw ? '#ffffff' : 'transparent'};
                color:${isDraw ? '#1d4ed8' : '#64748b'};
                box-shadow:${isDraw ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'};">
                <i class="fa-solid fa-road"></i> 畫路 (L)
            </button>
            <button type="button" id="synchro-tab-select" style="
                border:none; cursor:pointer; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:600; display:flex; align-items:center; gap:5px; transition:all 0.15s;
                background:${!isDraw ? '#ffffff' : 'transparent'};
                color:${!isDraw ? '#1d4ed8' : '#64748b'};
                box-shadow:${!isDraw ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'};">
                <i class="fa-solid fa-arrow-pointer"></i> 選取 (V)
            </button>
        </div>
        <span style="color:#0369a1; font-size:0.75rem;">
            ${isDraw ? '左鍵點擊加點，右鍵完成' : '點擊路口/路段調整轉向'}
        </span>
    `;

        banner.querySelector('#synchro-tab-draw').onclick = () => setTool('add-link');
        banner.querySelector('#synchro-tab-select').onclick = () => setTool('select');
    }

    function toggleSynchroMode(forceState) {
        isSynchroMode = typeof forceState === 'boolean' ? forceState : !isSynchroMode;
        const btn = document.getElementById('btn-synchro-mode');
        const badge = document.getElementById('synchro-mode-badge');
        if (btn) btn.classList.toggle('synchro-active', isSynchroMode);
        if (badge) badge.textContent = isSynchroMode ? 'ON' : 'OFF';

        cleanupSynchroDraft(true, true);

        if (isSynchroMode) {
            linkCreationSettings.isTwoWay = true;
            const twoWayToggle = document.getElementById('link-twoway-toggle');
            if (twoWayToggle) {
                twoWayToggle.checked = true;
                const medianRow = document.getElementById('median-setting-row');
                if (medianRow) medianRow.style.display = 'flex';
            }
            lastActiveNodeTab = 'tab-synchro';
            setTool('add-link');
        } else {
            updateSynchroCanvasHint();
        }

        Object.values(network.links).forEach(l => drawLink(l));
        Object.values(network.nodes).forEach(n => {
            if (n.konvaShape) n.konvaShape.moveToTop();
        });
        if (selectedObject) {
            updatePropertiesPanel(selectedObject);
        }
        layer.batchDraw();
        return isSynchroMode;
    }

    const synchroModeBtn = document.getElementById('btn-synchro-mode');
    if (synchroModeBtn) {
        synchroModeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止事件冒泡到 toolbar 導致 activeTool 變成 undefined
            toggleSynchroMode();
            if (isSynchroMode) {
                setTool('add-link'); // 強制切換為「畫路」工具
            }
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            toggleSynchroMode();
        } else if (e.key === 'Escape' && isSynchroMode && synchroDraftStart) {
            cleanupSynchroDraft(false, true);
        }
    });

    // Expose Synchro helpers on window for automation & testing
    window.toggleSynchroMode = toggleSynchroMode;
    window.applySynchroLaneConfig = applySynchroLaneConfig;
    window.inferSynchroLaneTurns = inferSynchroLaneTurns;
    window.handleSynchroAutoIntersections = handleSynchroAutoIntersections;
    window.completeSynchroRoadSegment = completeSynchroRoadSegment;
    window.finishSynchroDraft = finishSynchroDraft;
    window.getSynchroSnapTarget = getSynchroSnapTarget;
    window.balanceAllSynchroNetworkFlows = balanceAllSynchroNetworkFlows;
    window.balanceSingleSynchroApproachToUpstream = balanceSingleSynchroApproachToUpstream;
    window.computeSynchroUpstreamInflow = computeSynchroUpstreamInflow;
    Object.defineProperty(window, 'isSynchroMode', {
        get: () => isSynchroMode,
        set: (val) => toggleSynchroMode(Boolean(val)),
        configurable: true
    });
});
