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
        background: null, // <-- ADD THIS LINE
        overpasses: {}, // <--- 新增此行
        pushpins: {}, // <--- 新增此行
        parkingLots: {}, // <--- 新增此行
        parkingGates: {}, // <--- 新增此行
        roadMarkings: {}, // <--- 請務必在全域變數這裡加入這一行
    };
    let idCounter = 0;
    let selectedObject = null;
    let currentModalOrigin = null;
    let lastSelectedNodeForProperties = null; // <--- 新增此行
    let trafficLightIcons = []; // <--- 【請新增此行】用於儲存號誌圖示
    let nodeSettingsIcons = []; // <--- 【請新增此行】用於儲存路口設定圖示

    // --- DOM ELEMENTS ---
    const canvasContainer = document.getElementById('canvas-container');
    const propertiesContent = document.getElementById('properties-content');
    const statusBar = document.getElementById('status-bar');

    let lastActiveNodeTab = 'tab-settings'; // [新增] 用於記憶 Node 屬性面板當前的分頁
    let lastActiveLinkTab = 'tab-link-general'; // <--- [新增] 記憶 Link 面板的分頁

    // --- DATA MODELS ---
    // 我們將 numLanes 參數改為 lanesOrNumLanes
    function createLink(points, lanesOrNumLanes = 2) {
        const id = `link_${++idCounter}`;
        let lanes;

        // 判斷傳入的是數字還是陣列
        if (Array.isArray(lanesOrNumLanes)) {
            lanes = lanesOrNumLanes.map(width => ({ width: width }));
        } else {
            lanes = Array.from({ length: lanesOrNumLanes }, () => ({ width: LANE_WIDTH }));
        }

        const link = {
            id,
            name: id, // <--- [新增] 初始化名稱，預設為 ID
            type: 'Link',
            waypoints: points,
            lanes,
            startNodeId: null,
            endNodeId: null,
            konvaGroup: new Konva.Group({ id, draggable: false }),
            konvaHandles: [],
        };

        network.links[id] = link;
        layer.add(link.konvaGroup);
        drawLink(link);
        return link;
    }

    function createNode(x, y) {
        const id = `node_${++idCounter}`;
        const node = {
            id,
            type: 'Node',
            x,
            y,
            incomingLinkIds: new Set(),
            outgoingLinkIds: new Set(),
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
        return node;
    }

    function createConnection(sourceLink, sourceLaneIndex, destLink, destLaneIndex, node, points, color = 'rgba(0, 255, 0, 0.7)') {
        const id = `conn_${++idCounter}`;
        const conn = {
            id,
            type: 'Connection',
            sourceLinkId: sourceLink.id,
            sourceLaneIndex,
            destLinkId: destLink.id,
            destLaneIndex,
            nodeId: node.id,
            bezierPoints: points, // Note: This now stores just [startPoint, endPoint]
            konvaControls: [],
            konvaBezier: new Konva.Line({
                id,
                points: points.flatMap(p => [p.x, p.y]),
                stroke: color,
                strokeWidth: 0.5,
                hitStrokeWidth: 10,
                lineCap: 'round',
                tension: 0, // A tension of 0 ensures a straight line
                listening: true,
            })
        };
        network.connections[id] = conn;
        layer.add(conn.konvaBezier);
        conn.konvaBezier.moveToBottom();
        node.konvaShape.moveToBottom();
        return conn;
    }
    function createDetector(type, link, position, endPosition = null) {
        const id = `det_${++idCounter}`;
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

    function createRoadSign(link, position) {
        const id = `sign_${++idCounter}`;
        const sign = {
            id,
            type: 'RoadSign',
            linkId: link.id,
            position,
            signType: 'start',
            speedLimit: 30,
            konvaShape: new Konva.Circle({
                id,
                radius: 6,
                stroke: 'black',
                strokeWidth: 2,
                draggable: true, // The shape is always draggable when its layer is listening
                listening: true,
            }),
        };
        network.roadSigns[id] = sign;
        layer.add(sign.konvaShape);

        sign.konvaShape.on('dragmove', function () {
            // 1. Get the real-time position of the mouse pointer on the stage.
            const pointerPos = stage.getPointerPosition();

            // 2. Convert pointer position to the layer's coordinate system.
            const localPos = layer.getAbsoluteTransform().copy().invert().point(pointerPos);

            // 3. Project the mouse position onto the link's polyline to find the new distance.
            const { dist } = projectPointOnPolyline(localPos, link.waypoints);
            const clampedDist = Math.max(0, Math.min(dist, getPolylineLength(link.waypoints)));

            // 4. Update the sign's data model with the new calculated distance.
            sign.position = clampedDist;

            // 5. Calculate the new visual position for the sign based on the clamped distance.
            const newPt = getPointAlongPolyline(link.waypoints, clampedDist);
            const normal = getNormal(newPt.vec);

            // --- FIX: Use getLinkTotalWidth to calculate the correct road width for offset ---
            const totalWidth = getLinkTotalWidth(link);
            const offset = (totalWidth / 2) + 8;
            // --- END OF FIX ---

            const newVisualPos = add(newPt.point, scale(normal, offset));

            // 6. Manually set the sign's position. This overrides Konva's default drag behavior.
            sign.konvaShape.position(newVisualPos);

            // 7. Update the properties panel in real-time.
            if (selectedObject && selectedObject.id === sign.id) {
                updatePropertiesPanel(sign);
            }

            // We must manually redraw the layer because we are overriding the default drag mechanism.
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
        } else if (obj.type === 'Connection') {
            konvaObj = obj.konvaBezier;
        } else if (obj.type === 'ConnectionGroup') {
            konvaObj = obj.konvaLine;
            drawConnectionGroupIndicators(obj);
        } else if (obj.type === 'Link') {
            konvaObj = obj.konvaGroup;
            drawWaypointHandles(obj);
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
            if (obj.locked) {
                return;
            }
            konvaObj = obj.konvaGroup;
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
                layer.batchDraw();
            });
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
        } else if (obj.type === 'RoadMarking') {
            konvaObj = obj.konvaGroup;

            // --- [修正重點開始] ---
            // 判斷是否為可自由操作模式 (Node 模式 或 Link 上的 Free 模式)
            const isFreeMode = obj.nodeId || (obj.markingType === 'two_stage_box' && obj.isFree);

            // 無論是否鎖定，都建立 Transformer 以顯示選取框
            const tr = new Konva.Transformer({
                nodes: [konvaObj],
                centeredScaling: true,
                resizeEnabled: false, // 標線大小由屬性面板數值控制，不透過變形框
                rotateEnabled: isFreeMode, // 只有自由模式允許旋轉
                borderStroke: 'blue',
                anchorStroke: 'blue',
                // 如果是鎖定模式(依附車道)，隱藏所有控制點，只顯示藍色邊框
                enabledAnchors: isFreeMode ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []
            });

            layer.add(tr);
            tr.moveToTop();
            obj.konvaTransformer = tr;

            // 只有在允許自由移動時，才監聽變形結束事件
            if (isFreeMode) {
                konvaObj.on('transformend', () => {
                    obj.rotation = konvaObj.rotation();
                    obj.x = konvaObj.x();
                    obj.y = konvaObj.y();
                    updatePropertiesPanel(obj);
                });
            }
            // --- [修正重點結束] ---
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
    // 完整替換此函數
    function deselectAll() {
        clearLaneIndicators();
        lastSelectedNodeForProperties = null;

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
            }
            else if (obj.type === 'Connection') {
                konvaObj = obj.konvaBezier;
            } else if (obj.type === 'ConnectionGroup') {
                konvaObj = obj.konvaLine;
            } else if (obj.type === 'Link') {
                konvaObj = obj.konvaGroup;
                destroyWaypointHandles(obj);
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
            } else if (obj.type === 'Overpass') { // <--- 新增 Overpass 處理
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
                konvaObj = obj.konvaGroup;
            }

            if (konvaObj && obj.type !== 'Background' && obj.type !== 'Overpass' && obj.type !== 'ParkingLot') {
                konvaObj.setAttr('shadowOpacity', 0);
            }
        }
        selectedObject = null;
        updatePropertiesPanel(null);
    }
    function createOrigin(link, position) {
        const id = `origin_${++idCounter}`;
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
        const id = `dest_${++idCounter}`;
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


    function getLanePath(link, laneIndex) {
        if (!link || !link.lanes || link.waypoints.length < 2 || laneIndex >= link.lanes.length) return [];

        // 根據每個車道的寬度計算總寬度和特定車道的偏移
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

    function drawLink(link) {
        link.konvaGroup.destroyChildren();

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

        const clickableArea = new Konva.Line({
            id: link.id,
            points: link.waypoints.flatMap(p => [p.x, p.y]),
            stroke: 'transparent',
            strokeWidth: totalWidth + 8, // 使用新的總寬度
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

        // --- FIX: Use getLinkTotalWidth to calculate the correct road width for offset ---
        const totalWidth = getLinkTotalWidth(link);
        const offset = (totalWidth / 2) + 8;
        // --- END OF FIX ---

        const pos = add(point, scale(normal, offset));

        sign.konvaShape.position(pos);
        sign.konvaShape.fill(sign.signType === 'start' ? '#dc3545' : 'white');
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

        if (allLinks.length === 0) return [];

        const allCornerPoints = [];
        const centerlinePoints = [];

        for (const link of allLinks) {
            if (!link || !link.lanes || link.lanes.length === 0 || !link.waypoints || link.waypoints.length < 2) continue;

            const isTrulyIncoming = node.incomingLinkIds.has(link.id);
            const isTrulyOutgoing = node.outgoingLinkIds.has(link.id);

            let p_node, p_adj;
            const startPoint = link.waypoints[0];
            const endPoint = link.waypoints[link.waypoints.length - 1];

            // --- 恢復原始的、較為複雜但經過驗證的端點判斷邏輯 ---
            if (isTrulyIncoming && !isTrulyOutgoing) {
                p_node = endPoint; p_adj = link.waypoints[link.waypoints.length - 2];
            } else if (isTrulyOutgoing && !isTrulyIncoming) {
                p_node = startPoint; p_adj = link.waypoints[1];
            } else {
                // 這個 fallback 邏輯對於處理初始連接或複雜路口至關重要
                let startPointProximity = 0, endPointProximity = 0;
                allLinks.forEach(otherLink => {
                    if (otherLink === link || !otherLink.waypoints || otherLink.waypoints.length < 1) return;
                    startPointProximity += vecLen(getVector(startPoint, otherLink.waypoints[0]));
                    startPointProximity += vecLen(getVector(startPoint, otherLink.waypoints[otherLink.waypoints.length - 1]));
                    endPointProximity += vecLen(getVector(endPoint, otherLink.waypoints[0]));
                    endPointProximity += vecLen(getVector(endPoint, otherLink.waypoints[otherLink.waypoints.length - 1]));
                });
                if (endPointProximity < startPointProximity) {
                    p_node = endPoint; p_adj = link.waypoints[link.waypoints.length - 2];
                } else {
                    p_node = startPoint; p_adj = link.waypoints[1];
                }
            }

            if (!p_node || !p_adj) continue;

            centerlinePoints.push(p_node);
            const vec = normalize(getVector(p_adj, p_node));
            const normal = getNormal(vec);

            // --- 整合新的寬度計算方式 ---
            const totalWidth = getLinkTotalWidth(link);
            const p_l = add(p_node, scale(normal, totalWidth / 2));
            const p_r = add(p_node, scale(normal, -totalWidth / 2));

            allCornerPoints.push(p_l, p_r);
        }

        if (allCornerPoints.length < 3) {
            if (node.x !== undefined) return [node.x - 5, node.y - 5, node.x + 5, node.y - 5, node.x + 5, node.y + 5, node.x - 5, node.y + 5];
            return [];
        }

        const center = centerlinePoints.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        center.x /= centerlinePoints.length;
        center.y /= centerlinePoints.length;

        allCornerPoints.sort((a, b) => {
            const angleA = Math.atan2(a.y - center.y, a.x - center.x);
            const angleB = Math.atan2(b.y - center.y, b.x - center.x);
            return angleA - angleB;
        });

        return allCornerPoints.flatMap(p => [p.x, p.y]);
    }

    function drawNode(node, ctx, shape) {
        const polygonPoints = getNodePolygonPoints(node);

        if (polygonPoints.length < 6) {
            // Fallback to a simple circle if polygon can't be computed
            ctx.beginPath();
            ctx.arc(node.x, node.y, 10, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
            return;
        }

        // Draw the computed polygon
        ctx.beginPath();
        ctx.moveTo(polygonPoints[0], polygonPoints[1]);
        for (let i = 2; i < polygonPoints.length; i += 2) {
            ctx.lineTo(polygonPoints[i], polygonPoints[i + 1]);
        }
        ctx.closePath();
        ctx.fillStrokeShape(shape);
        // Reset transform to avoid affecting other drawings on the layer
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function getLinkTotalWidth(link) {
        if (!link || !link.lanes) return 0;
        return link.lanes.reduce((sum, lane) => sum + lane.width, 0);
    }
    // --- START: NEW MEASUREMENT FUNCTIONS ---

    function createMeasurement(points) {
        const id = `measure_${++idCounter}`;
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


    // --- TOOL MANAGEMENT ---
    // --- TOOL MANAGEMENT ---
    // 完整替換此函數
    function setTool(toolName) {
        activeTool = toolName;
        deselectAll(); // Reset selection and update properties panel
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

        if (network.background) {
            network.background.konvaGroup.listening(false);
        }

        // 2. 清理
        layer.find('.lane-port').forEach(port => port.destroy());
        if (tempShape) { tempShape.destroy(); tempShape = null; }
        if (tempMeasureText) { tempMeasureText.destroy(); tempMeasureText = null; }

        // 清除所有輔助圖示 (號誌編輯圖示 & 選取模式圖示)
        clearTrafficLightIcons();
        clearNodeSettingsIcons(); // <--- 【新增】

        // 3. 根據工具啟用互動
        switch (toolName) {
            case 'select':
                // 【新增】顯示路口設定圖示
                showNodeSettingsIcons();

                // 為所有可選物件啟用監聽
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
                if (network.background && !network.background.locked) {
                    network.background.konvaGroup.listening(true);
                }
                stage.container().style.cursor = 'default';
                Object.values(network.pushpins).forEach(p => p.konvaGroup.listening(true));
                break;

            case 'edit-tfl':
                // 顯示號誌編輯圖示
                showTrafficLightIcons();
                // 仍然讓 Node 可監聽，但圖示會在最上層
                Object.values(network.nodes).forEach(node => node.konvaShape.listening(true));
                stage.container().style.cursor = 'default';
                break;

            case 'connect-lanes':
                stage.container().style.cursor = 'default';
                showLanePorts();
                layer.find('.lane-port').forEach(port => port.moveToTop());
                break;

            case 'add-link':
            case 'measure':
            case 'add-background':
            case 'add-parking-lot':
                stage.container().style.cursor = 'crosshair';
                break;

            case 'add-parking-gate':
                stage.container().style.cursor = 'crosshair';
                Object.values(network.parkingLots).forEach(p => p.konvaGroup.listening(false));
                Object.values(network.parkingGates).forEach(g => g.konvaGroup.listening(true));
                break;

            case 'add-flow':
            case 'add-road-sign':
            case 'add-point-detector':
            case 'add-section-detector':
                Object.values(network.links).forEach(l => l.konvaGroup.listening(true));
                stage.container().style.cursor = 'pointer';
                break;

            case 'add-pushpin':
                stage.container().style.cursor = 'crosshair';
                Object.values(network.pushpins).forEach(p => p.konvaGroup.listening(true));
                break;

            case 'add-marking':
                Object.values(network.links).forEach(l => l.konvaGroup.listening(true));
                Object.values(network.nodes).forEach(n => n.konvaShape.listening(true));
                stage.container().style.cursor = 'pointer';
                break;

            default:
                stage.container().style.cursor = 'default';
                break;
        }

        updateStatusBar();
    }

    // --- 新增：顯示交通號誌編輯圖示 ---
    function showTrafficLightIcons() {
        clearTrafficLightIcons(); // 先清除舊的，避免重複
        const scale = 1 / stage.scaleX(); // 計算反向縮放比例，確保圖示大小恆定

        Object.values(network.nodes).forEach(node => {
            // 建立一個群組包裹圖示
            const group = new Konva.Group({
                x: node.x,
                y: node.y,
                name: 'tfl-icon-wrapper', // 設定名稱以便縮放時選取
                listening: true, // 確保可被點擊
                scaleX: scale,
                scaleY: scale
            });

            // 1. 白色圓形背景 (確保容易點擊且與背景有對比)
            const bg = new Konva.Circle({
                radius: 12,
                fill: '#f8f9fa',
                stroke: '#333',
                strokeWidth: 1,
                shadowColor: 'black',
                shadowBlur: 3,
                shadowOpacity: 0.3
            });

            // 2. 號誌 Emoji 圖示
            const icon = new Konva.Text({
                text: '🚦',
                fontSize: 18,
                align: 'center',
                verticalAlign: 'middle',
                listening: false // 讓點擊事件穿透到群組
            });
            // 將 Emoji 居中
            icon.offsetX(icon.width() / 2);
            icon.offsetY(icon.height() / 2 - 1); // 微調垂直位置

            group.add(bg, icon);

            // --- 事件處理 ---

            // 滑鼠移入效果
            group.on('mouseenter', () => {
                stage.container().style.cursor = 'pointer';
                bg.fill('#e2e6ea'); // 變深色
                bg.stroke('blue');
                layer.batchDraw();
            });

            // 滑鼠移出效果
            group.on('mouseleave', () => {
                stage.container().style.cursor = 'default';
                bg.fill('#f8f9fa'); // 恢復原色
                bg.stroke('#333');
                layer.batchDraw();
            });

            // 點擊開啟編輯器
            group.on('click tap', (e) => {
                e.cancelBubble = true; // 阻止事件冒泡，避免觸發底下的 Node 點擊
                showTrafficLightEditor(node);

                // 選項：點擊後自動切回選取模式，或者保持在編輯模式
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

    // --- 新增：顯示路口(Node)設定圖示 ---
    function showNodeSettingsIcons() {
        clearNodeSettingsIcons(); // 清除舊的
        const scale = 1 / stage.scaleX(); // 反向縮放

        Object.values(network.nodes).forEach(node => {
            // 建立群組
            const group = new Konva.Group({
                x: node.x,
                y: node.y,
                name: 'node-setting-icon-wrapper', // 用於縮放識別
                listening: true,
                scaleX: scale,
                scaleY: scale
            });

            // 1. 圓形背景 (淺藍色以示區別，帶陰影)
            const bg = new Konva.Circle({
                radius: 10,
                fill: '#e3f2fd', // 淺藍色
                stroke: '#1565c0', // 深藍邊框
                strokeWidth: 1,
                shadowColor: 'black',
                shadowBlur: 3,
                shadowOpacity: 0.3
            });

            // 2. 設定(齒輪)圖示
            const icon = new Konva.Text({
                text: '⚙️',
                fontSize: 14,
                align: 'center',
                verticalAlign: 'middle',
                listening: false
            });
            icon.offsetX(icon.width() / 2);
            icon.offsetY(icon.height() / 2 - 1);

            group.add(bg, icon);

            // --- 事件處理 ---

            group.on('mouseenter', () => {
                stage.container().style.cursor = 'pointer';
                bg.fill('#bbdefb'); // 移入變色
                bg.strokeWidth(2);
                layer.batchDraw();
            });

            group.on('mouseleave', () => {
                stage.container().style.cursor = 'default';
                bg.fill('#e3f2fd'); // 恢復
                bg.strokeWidth(1);
                layer.batchDraw();
            });

            // 點擊選取該 Node
            group.on('click tap', (e) => {
                e.cancelBubble = true; // 阻止冒泡
                selectObject(node);    // 激活 Node 設定
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

        // 獲取當前縮放比例的倒數，用於維持 UI 元素在螢幕上的大小恆定
        const portScale = 1 / stage.scaleX();

        for (const linkId in network.links) {
            const link = network.links[linkId];
            if (!link.lanes || link.lanes.length === 0 || !link.waypoints || link.waypoints.length < 2) continue;

            // --- 繪製每個車道的「起點」和「終點」連接埠 (圓形) ---
            for (let i = 0; i < link.lanes.length; i++) {
                const lanePath = getLanePath(link, i);
                if (!lanePath || lanePath.length < 2) continue;

                const startPos = lanePath[0];
                const endPos = lanePath[lanePath.length - 1];

                // 藍色起點埠 (接收連接)
                const startPort = new Konva.Circle({
                    x: startPos.x, y: startPos.y, radius: PORT_RADIUS, fill: 'blue',
                    stroke: 'white',
                    strokeWidth: 2 / portScale, // <-- MODIFIED: 根據縮放調整描邊寬度
                    draggable: true,
                    name: 'lane-port',
                    scaleX: portScale, // <-- MODIFIED: 應用反向縮放
                    scaleY: portScale, // <-- MODIFIED: 應用反向縮放
                });
                startPort.setAttr('meta', { linkId: link.id, laneIndex: i, portType: 'start' });
                layer.add(startPort);

                // 紅色終點埠 (發起連接)
                const endPort = new Konva.Circle({
                    x: endPos.x, y: endPos.y, radius: PORT_RADIUS, fill: 'red',
                    stroke: 'white',
                    strokeWidth: 2 / portScale, // <-- MODIFIED: 根據縮放調整描邊寬度
                    draggable: true,
                    name: 'lane-port',
                    scaleX: portScale, // <-- MODIFIED: 應用反向縮放
                    scaleY: portScale, // <-- MODIFIED: 應用反向縮放
                });
                endPort.setAttr('meta', { linkId: link.id, laneIndex: i, portType: 'end' });
                layer.add(endPort);
            }

            // --- 繪製「群組連接」箭頭 ---
            if (ENABLE_GROUP_CONNECT) {
                const linkLength = getPolylineLength(link.waypoints);
                const upstreamDist = Math.max(0, linkLength - 15);
                const { point: upstreamPoint, vec: upstreamVec } = getPointAlongPolyline(link.waypoints, upstreamDist);

                const groupPort = new Konva.Text({
                    x: upstreamPoint.x,
                    y: upstreamPoint.y,
                    text: '●',
                    fontSize: 20, // <-- 基底字體大小保持不變
                    fill: '#8B0000',
                    stroke: 'white',
                    strokeWidth: 1 / portScale, // <-- MODIFIED: 根據縮放調整描邊寬度
                    align: 'center',
                    verticalAlign: 'middle',
                    rotation: Konva.Util.radToDeg(Math.atan2(upstreamVec.y, upstreamVec.x)) - 90,
                    name: 'group-connect-port',
                    draggable: true,
                    // v-- NEW: 應用與其他UI元素相同的反向縮放邏輯 --v
                    scaleX: portScale,
                    scaleY: portScale
                    // ^-- END OF NEW --^
                });
                // 偏移量應在縮放前計算，以確保文字中心對齊
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
            case 'measure': text += " - Click to start, click to add points, right-click to finish measurement."; break;
            case 'add-background': text += " - Click on an empty area to add a background image placeholder."; break; // <-- NEW LINE
            case 'connect-lanes': text += " - Drag from a red port (lane end) to a blue port (lane start)."; break;
            case 'edit-tfl': text += " - Click on an intersection (node) to edit its traffic light schedule."; break;
            case 'add-flow': text += " - 點擊 Link 前半段新增起點 (紅色)，點擊後半段新增迄點 (綠色)。"; break;
            case 'add-road-sign': text += " - Click on a Link to place a new speed sign."; break;
            case 'select': text += " - Click to select. Drag a link's handles to edit path. Alt+Click on a link to add a handle. Press DEL to delete."; break;
            case 'add-pushpin': text += " - Click on the canvas to place a coordinate reference pin (Max 2)."; break;
            case 'add-parking-lot': text += " - Click to add polygon points. Double-click to finish."; break; // <--- Fix: status bar text
            case 'add-parking-gate': text += " - Drag to create a rectangle representing an Entrance or Exit on a Parking Lot boundary."; break;

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

            // 【修改】加入 .node-setting-icon-wrapper
            layer.find('.lane-port, .group-connect-port, .control-point, .waypoint-handle, .measurement-handle, .tfl-icon-wrapper, .node-setting-icon-wrapper').forEach(p => {
                p.scale({ x: newPortScale, y: newPortScale });
            });
            layer.find('.lane-port').forEach(p => p.strokeWidth(2 / newScale));

            layer.find('.lane-indicator').forEach(indicator => {
                indicator.scale({ x: newPortScale, y: newPortScale });
            });

            // Redraw all persistent measurements to adjust their line width and text scale
            Object.values(network.measurements).forEach(m => drawMeasurement(m));

            drawGrid();
        });

        stage.on('mousedown', (e) => {
            if (e.evt.button === 1) {
                isPanning = true;
                lastPointerPosition = stage.getPointerPosition();
                stage.container().style.cursor = 'grabbing';
                e.evt.preventDefault();
                return;
            }

            if (e.evt.button === 0 && e.target === stage) {
                // [修改] 將 connect-lanes 加入不自動平移的清單，以便進行框選
                if (activeTool !== 'add-link' && activeTool !== 'measure' &&
                    !(activeTool === 'connect-lanes' && connectMode === 'box') && // <--- 新增此判斷
                    activeTool !== 'add-background' &&
                    activeTool !== 'add-pushpin' && activeTool !== 'add-parking-lot' && activeTool !== 'add-parking-gate') {

                    isPanning = true;
                    lastPointerPosition = stage.getPointerPosition();
                    stage.container().style.cursor = 'grabbing';
                    e.evt.preventDefault();
                    return;
                }
            }

            // --- [新增] Connect Box Mode 的開始繪製邏輯 ---
            if (activeTool === 'connect-lanes' && connectMode === 'box') {
                if (e.target !== stage) return;

                const pos = {
                    x: (e.evt.layerX - stage.x()) / stage.scaleX(),
                    y: (e.evt.layerY - stage.y()) / stage.scaleY(),
                };

                tempShape = new Konva.Rect({
                    x: pos.x,
                    y: pos.y,
                    width: 0,
                    height: 0,
                    stroke: '#00D2FF',
                    strokeWidth: 1 / stage.scaleX(),
                    fill: 'rgba(0, 210, 255, 0.2)',
                    listening: false,
                    name: 'selection-box'
                });
                layer.add(tempShape);
                tempShape.setAttr('startPos', pos);
                return;
            }
            // --- [新增結束] ---

            // 在 stage.on('mousedown') 內加入
            if (activeTool === 'add-parking-gate') {
                if (e.target !== stage) return; // 避免點到其他物件
                isPanning = false;
                const pos = {
                    x: (e.evt.layerX - stage.x()) / stage.scaleX(),
                    y: (e.evt.layerY - stage.y()) / stage.scaleY(),
                };

                // 開始繪製暫存矩形
                tempShape = new Konva.Rect({
                    x: pos.x,
                    y: pos.y,
                    width: 0,
                    height: 0,
                    stroke: 'orange',
                    strokeWidth: 2,
                    listening: false
                });
                layer.add(tempShape);
                // 暫存起始點以便計算寬高
                tempShape.setAttr('startPos', pos);
                return;
            }

            handleStageClick(e);
        });

        stage.on('mouseup', (e) => {
            // --- [新增] Connect Box Mode 的完成邏輯 ---
            if (activeTool === 'connect-lanes' && connectMode === 'box' && tempShape) {
                // 取得標準化的矩形參數
                const rectBox = {
                    x: tempShape.x(),
                    y: tempShape.y(),
                    width: tempShape.width(),
                    height: tempShape.height()
                };

                // 移除視覺選取框
                tempShape.destroy();
                tempShape = null;

                // 執行自動連結演算法 (如果框框夠大，避免誤觸)
                if (rectBox.width > 2 || rectBox.height > 2) {
                    autoConnectLanesInSelection(rectBox);
                }

                layer.batchDraw();
                return;
            }
            // --- [新增結束] ---

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
            if ((activeTool === 'add-link' || activeTool === 'measure' || activeTool === 'add-parking-lot') && tempShape) {
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
        });

        stage.on('dblclick', (e) => {
            // Finalization logic is moved to the 'contextmenu' (right-click) handler.
            // This handler is now empty for these tools.
        });

        // Right-click handler to finalize drawing
        // 在 init() 函數中，找到 'contextmenu' 事件監聽器並替換它
        stage.on('contextmenu', (e) => {
            e.evt.preventDefault();

            if ((activeTool === 'add-link' || activeTool === 'measure') && tempShape) {
                const currentPoints = tempShape.points();
                const finalRawPoints = currentPoints.slice(0, -2);
                const finalPoints = [];
                for (let i = 0; i < finalRawPoints.length; i += 2) {
                    finalPoints.push({ x: finalRawPoints[i], y: finalRawPoints[i + 1] });
                }

                if (activeTool === 'add-link') {
                    if (finalPoints.length > 1) {
                        const newLink = createLink(finalPoints);
                        selectObject(newLink);
                        updateAllOverpasses(); // <--- 新增呼叫
                    }
                    if (tempShape) tempShape.destroy();
                    tempShape = null;
                    setTool('select');
                } else if (activeTool === 'measure') {
                    if (finalPoints.length > 1) {
                        const newMeasurement = createMeasurement(finalPoints);
                        selectObject(newMeasurement);
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
            if (e.target.name() === 'parking-vertex-handle') {
                return;
            }
            // ---------------------------

            if (e.target.name() === 'measurement-handle') {
                return;
            }

            if (['lane-port', 'control-point', 'waypoint-handle', 'length-handle'].includes(e.target.name())) {
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

            if (network.background) {
                const bgGroup = network.background.konvaGroup;
                if (bgGroup && (clickedShape === bgGroup || bgGroup.isAncestorOf(clickedShape))) {
                    if (network.background.locked) {
                        deselectAll();
                        return;
                    }
                    selectObject(network.background);
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
                    || network.roadMarkings[group.id()];

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
        // --- 修改後 (新代碼) ---
        document.getElementById('toolbar').addEventListener('click', (e) => {
            // [修正] 使用 closest 以支援 FontAwesome 圖示點擊
            const btn = e.target.closest('.tool-btn');
            if (btn) {
                setTool(btn.dataset.tool);
            }
        });

        document.getElementById('exportXmlBtn').addEventListener('click', exportXML);

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
                case 'escape':
                    if (tempShape) { tempShape.destroy(); tempShape = null; }
                    if (tempMeasureText) { tempMeasureText.destroy(); tempMeasureText = null; }
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
            if (['control-point', 'waypoint-handle', 'length-handle'].includes(e.target.name())) return;
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
                    handleConnection(sourceMeta, destMeta);
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

            if (['lane-port', 'control-point', 'waypoint-handle', 'length-handle'].includes(e.target.name())) {
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

            if (network.background) {
                const bgGroup = network.background.konvaGroup;
                if (bgGroup && (clickedShape === bgGroup || bgGroup.isAncestorOf(clickedShape))) {
                    if (network.background.locked) {
                        deselectAll();
                        return;
                    }
                    selectObject(network.background);
                    return;
                }
            }

            const group = clickedShape.findAncestor('Group');

            if (group && group.id()) {
                const obj = network.links[group.id()]
                    || network.detectors[group.id()]
                    || network.measurements[group.id()]
                    || network.parkingLots[group.id()];

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
                deleteNode(obj.id);
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
            // ADD THIS CASE
            case 'Measurement':
                deleteMeasurement(obj.id);
                break;
            case 'Background': deleteBackground();
                break; // <-- ADD THIS CASE				
            case 'ConnectionGroup':
                deleteConnectionGroup(obj);
                break;
            case 'ParkingLot': // <--- Ensure ParkingLot delete is here too from previous context if it existed, otherwise add it
                deleteParkingLot(obj.id);
                break;
            case 'ParkingGate':
                deleteParkingGate(obj.id);
                break;
            case 'Overpass': // <--- 新增 Overpass 刪除處理
                // Overpass 是自動生成的，通常不手動刪除。
                // 但如果需要，可以這樣實現：
                obj.konvaRect.destroy();
                delete network.overpasses[obj.id];
                break;
            // 在 switch (obj.type) 中加入
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

    function deleteNode(nodeId) {
        const node = network.nodes[nodeId];
        if (!node) return;

        // Delete connections passing through this node
        Object.values(network.connections).forEach(conn => {
            if (conn.nodeId === nodeId) {
                deleteConnection(conn.id);
            }
        });

        // Delete associated traffic light data
        if (network.trafficLights[nodeId]) delete network.trafficLights[nodeId];

        // Only delete the node if it's not connecting any links
        if (node.incomingLinkIds.size === 0 && node.outgoingLinkIds.size === 0) {
            node.konvaShape.destroy();
            delete network.nodes[nodeId];
        }

        updateAllOverpasses(); // <--- 在函數結尾新增呼叫
    }

    // --- 刪除單一連接線 ---
    function deleteConnection(connId) {
        const conn = network.connections[connId];
        if (!conn) return;

        // 1. 從交通號誌群組中移除此連接線的 ID
        // (避免刪除線後，號誌還以為這條線存在)
        const nodeId = conn.nodeId;
        const tfl = network.trafficLights[nodeId];
        if (tfl && tfl.signalGroups) {
            Object.values(tfl.signalGroups).forEach(group => {
                const index = group.connIds.indexOf(connId);
                if (index > -1) {
                    group.connIds.splice(index, 1);
                }
            });
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

    function handleStageClick(e) {
        // *** THIS IS THE FIX ***
        // Only process left-clicks (e.evt.button === 0).
        // This prevents the mousedown event of a right-click from incorrectly adding a point.
        if (e.evt.button !== 0) {
            return;
        }

        const clickedShape = e.target;
        const pos = {
            x: (e.evt.layerX - stage.x()) / stage.scaleX(),
            y: (e.evt.layerY - stage.y()) / stage.scaleY(),
        };

        if (activeTool === 'add-link') {
            if (e.target !== stage) return;
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
        } else if (activeTool === 'measure') {
            if (e.target !== stage) return;

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
            if (e.target !== stage) return;
            if (network.background) {
                alert(I18N.t("背景已存在，無法新增。請先刪除現有背景。"));
                setTool('select');
                return;
            }
            const newBg = createBackground(pos);
            if (newBg) {
                selectObject(newBg);
            }
            setTool('select');
        }
        else if (activeTool === 'edit-tfl') {
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
                setTool('select');
            }
        } else if (activeTool === 'add-road-sign') {
            const shape = stage.getIntersection(stage.getPointerPosition());
            if (shape && shape.parent && network.links[shape.parent.id()]) {
                const link = network.links[shape.parent.id()];
                let { dist } = projectPointOnPolyline(pos, link.waypoints);
                const newSign = createRoadSign(link, dist);
                selectObject(newSign);
                setTool('select');
            }
        } else if (activeTool === 'add-flow') {
            let linkId = clickedShape.id();
            if (!linkId && clickedShape.parent) { linkId = clickedShape.parent.id(); }
            const link = network.links[linkId];
            if (link) {
                const linkLength = getPolylineLength(link.waypoints);
                const { dist } = projectPointOnPolyline(pos, link.waypoints);
                const hasOrigin = Object.values(network.origins).some(o => o.linkId === link.id);
                const hasDestination = Object.values(network.destinations).some(d => d.linkId === link.id);
                if (dist < linkLength / 2) {
                    if (hasOrigin) { alert(I18N.t(`Link ${link.id} already has an Origin.`)); return; }
                    const originPosition = Math.min(5, linkLength * 0.1);
                    const newOrigin = createOrigin(link, originPosition);
                    selectObject(newOrigin);
                }
                else {
                    if (hasDestination) { alert(I18N.t(`Link ${link.id} already has a Destination.`)); return; }
                    const destPosition = Math.max(linkLength - 5, linkLength * 0.9);
                    const newDest = createDestination(link, destPosition);
                    selectObject(newDest);
                }
                setTool('select');
            }
        } else if (activeTool === 'add-pushpin') {
            if (e.target !== stage) return; // 避免點到其他物件
            const newPin = createPushpin(pos);
            if (newPin) {
                selectObject(newPin);
                setTool('select'); // 放完一個自動切回選取模式
            }
        } else if (activeTool === 'add-parking-lot') {
            // Allow clicking anywhere to start/continue drawing
            // if (e.target !== stage) return;

            // 如果還沒有暫存形狀，則開始新的多邊形
            if (!tempShape) {
                // 使用閉合的線來表示多邊形預覽
                tempShape = new Konva.Line({
                    points: [pos.x, pos.y, pos.x, pos.y], // 起始點重複一次，構成最初的線段
                    stroke: 'purple',
                    strokeWidth: 2,
                    closed: true, // 閉合形狀
                    fill: 'rgba(128, 0, 128, 0.2)', // 半透明填充
                    listening: false
                });
                layer.add(tempShape);
            } else {
                // 新增點到多邊形
                const currentPoints = tempShape.points();
                // 在最後兩個座標（滑鼠跟隨點）之前插入新的固定點

                // 替換最後一組點為固定點
                currentPoints[currentPoints.length - 2] = pos.x;
                currentPoints[currentPoints.length - 1] = pos.y;

                // 加入新的動態點（稍後會由 mousemove 更新）
                currentPoints.push(pos.x, pos.y);

                tempShape.points(currentPoints);
            }
            layer.batchDraw(); // <--- Fix: Ensure changes are rendered
        } else if (activeTool === 'add-marking') {
            // 檢查點擊到的是 Link 還是 Node
            let targetLink = null;
            let targetNode = null;

            // 檢查是否點擊到 Group (Link/Node)
            const clickedGroup = e.target.findAncestor('Group');
            if (clickedGroup) {
                if (network.links[clickedGroup.id()]) targetLink = network.links[clickedGroup.id()];
                else if (network.nodes[clickedGroup.id()]) targetNode = network.nodes[clickedGroup.id()];
            } else {
                // 直接點擊 Shape
                if (network.nodes[e.target.id()]) targetNode = network.nodes[e.target.id()];
            }

            if (targetLink) {
                // 在 Link 上新增，預設為停止線
                const { dist } = projectPointOnPolyline(pos, targetLink.waypoints);
                const mk = createRoadMarking('stop_line', targetLink, dist);
                selectObject(mk);
                setTool('select');
            } else if (targetNode) {
                // 在 Node 上新增，預設為兩段式左轉
                // 使用 Node 中心或點擊位置
                const mk = createRoadMarking('two_stage_box', targetNode, pos);
                selectObject(mk);
                setTool('select');
            }
        }
    }
    // 監聽雙擊事件以完成多邊形繪製
    document.addEventListener('dblclick', () => {
        if (activeTool === 'add-parking-lot' && tempShape) {
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
        }
    });

    function createParkingLot(points, autoSelect = true) {
        const id = `parking_${++idCounter}`;
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
        return parkingLot;
    }

    // --- 新增：座標轉換輔助函數 ---
    function getLocalPoint(group, absPoint) {
        const transform = group.getAbsoluteTransform().copy();
        transform.invert();
        return transform.point(absPoint);
    }

    function getAbsolutePoint(group, localPoint) {
        const transform = group.getAbsoluteTransform();
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

        Object.values(network.connections).forEach(conn => {
            let needsUpdate = false;

            // conn.bezierPoints is now [startPoint, endPoint]
            if (conn.sourceLinkId === linkId) {
                const sourceLanePath = getLanePath(modifiedLink, conn.sourceLaneIndex);
                if (sourceLanePath.length > 0) {
                    const newP1 = sourceLanePath[sourceLanePath.length - 1];
                    conn.bezierPoints[0] = newP1; // Update start point at index 0
                    needsUpdate = true;
                }
            }

            if (conn.destLinkId === linkId) {
                const destLanePath = getLanePath(modifiedLink, conn.destLaneIndex);
                if (destLanePath.length > 0) {
                    const newP4 = destLanePath[0];
                    conn.bezierPoints[1] = newP4; // Update end point at index 1
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                conn.konvaBezier.points(conn.bezierPoints.flatMap(p => [p.x, p.y]));
                // No controls to redraw.
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

    // --- [修正] 框選自動連結演算法 (最大化連接策略) ---
    function autoConnectLanesInSelection(rect) {
        console.log("AutoConnect Box:", rect);

        // [設定] 連結距離閾值 (公尺) - 稍微調大以容許寬路口
        const CONNECT_THRESHOLD = 50;

        const candidates = { sources: [], dests: [] };

        // 1. 空間搜尋：篩選端點在框內的 Link
        Object.values(network.links).forEach(link => {
            if (!link.waypoints || link.waypoints.length < 2) return;

            const startPoint = link.waypoints[0];
            const endPoint = link.waypoints[link.waypoints.length - 1];

            // 檢查是否為「下游路段」(起點在框內)
            const startInBox =
                startPoint.x >= rect.x && startPoint.x <= rect.x + rect.width &&
                startPoint.y >= rect.y && startPoint.y <= rect.y + rect.height;

            if (startInBox) candidates.dests.push(link);

            // 檢查是否為「上游路段」(終點在框內)
            const endInBox =
                endPoint.x >= rect.x && endPoint.x <= rect.x + rect.width &&
                endPoint.y >= rect.y && endPoint.y <= rect.y + rect.height;

            if (endInBox) candidates.sources.push(link);
        });

        console.log(`Found candidates: ${candidates.sources.length} sources, ${candidates.dests.length} destinations.`);

        let connectionCount = 0;

        // 2. 雙重迴圈進行配對
        candidates.sources.forEach(srcLink => {
            candidates.dests.forEach(dstLink => {
                // 防止自己連自己
                if (srcLink.id === dstLink.id) return;

                // 計算端點距離
                const pEnd = srcLink.waypoints[srcLink.waypoints.length - 1];
                const pStart = dstLink.waypoints[0];
                const dist = Math.sqrt(Math.pow(pEnd.x - pStart.x, 2) + Math.pow(pEnd.y - pStart.y, 2));

                // 若距離符合，則判斷連結邏輯
                if (dist <= CONNECT_THRESHOLD) {
                    const turnDir = getTurnDirection(srcLink, dstLink);
                    console.log(`Connecting ${srcLink.id} -> ${dstLink.id} [${turnDir}] Dist:${dist.toFixed(1)}`);

                    const srcLanes = srcLink.lanes.length;
                    const dstLanes = dstLink.lanes.length;

                    // 核心邏輯：可以建立幾條連接？取兩者最小值
                    const laneCount = Math.min(srcLanes, dstLanes);
                    const newIds = [];

                    for (let k = 0; k < laneCount; k++) {
                        let srcIdx, dstIdx;

                        // 3. 車道映射策略 (Lane Mapping Strategy)
                        if (turnDir === 'right') {
                            // [右轉]: 靠右對齊 (Right-Align)
                            // 邏輯：從最外側(最大index)開始配對
                            // 例如 3車道轉2車道： Src[2]->Dst[1], Src[1]->Dst[0]
                            srcIdx = srcLanes - 1 - k;
                            dstIdx = dstLanes - 1 - k;
                        } else {
                            // [直行 / 左轉 / 迴轉]: 靠左對齊 (Left-Align)
                            // 邏輯：從最內側(最小index)開始配對 (符合靠右行駛規則)
                            // 例如 3車道轉2車道： Src[0]->Dst[0], Src[1]->Dst[1]
                            srcIdx = k;
                            dstIdx = k;
                        }

                        // 建立連接
                        const srcMeta = { linkId: srcLink.id, laneIndex: srcIdx, portType: 'end' };
                        const dstMeta = { linkId: dstLink.id, laneIndex: dstIdx, portType: 'start' };

                        const newConn = handleConnection(srcMeta, dstMeta);
                        if (newConn) {
                            newIds.push(newConn.id);
                            connectionCount++;
                        }
                    }

                    // 4. 建立 Connection Group 視覺效果 (綠色粗線)
                    if (newIds.length > 0) {
                        // 取得共用的 Node ID (這些連接應該會匯聚到同一個 Node)
                        // 我們取最後一條建立的連接來查詢 Node ID
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
            // 簡單提示
            // alert(`Auto-connected ${connectionCount} lanes.`);
            console.log(`Auto-connected ${connectionCount} lanes.`);
        }
    }


    // --- [輔助] 繪製/更新群組視覺物件 ---
    function drawConnectionGroupVisual(srcLink, dstLink, newIds, commonNodeId) {
        const p1 = srcLink.waypoints[srcLink.waypoints.length - 1];
        const p4 = dstLink.waypoints[0];

        // 檢查是否已經有這組 Link 對的視覺線條
        const existingVisual = layer.find('.group-connection-visual').find(shape => {
            const meta = shape.getAttr('meta');
            return meta && meta.sourceLinkId === srcLink.id && meta.destLinkId === dstLink.id;
        });

        if (!existingVisual) {
            // 建立新的視覺線條
            const groupLine = new Konva.Line({
                points: [p1.x, p1.y, p4.x, p4.y],
                stroke: 'darkgreen',
                strokeWidth: 2,
                hitStrokeWidth: 20, // 增加點擊範圍
                name: 'group-connection-visual',
                listening: true,
            });

            const newMeta = {
                type: 'ConnectionGroup',
                connectionIds: newIds,
                nodeId: commonNodeId,
                sourceLinkId: srcLink.id,
                destLinkId: dstLink.id
            };
            groupLine.setAttr('meta', newMeta);
            layer.add(groupLine);
            groupLine.moveToBottom();

            // 確保 Node 在線條之上
            if (network.nodes[commonNodeId]) {
                network.nodes[commonNodeId].konvaShape.moveToTop();
            }
        } else {
            // 更新現有線條的 connectionIds
            const meta = existingVisual.getAttr('meta');
            // 合併並去重 ID
            const updatedIds = [...new Set([...meta.connectionIds, ...newIds])];
            meta.connectionIds = updatedIds;
            existingVisual.setAttr('meta', meta);
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

            // Update the connection's data model (which is just [start, end])
            conn.bezierPoints = [p1, p4];

            // Update the Konva shape with the new points
            conn.konvaBezier.points(conn.bezierPoints.flatMap(p => [p.x, p.y]));

            // No controls to draw, so the 'if selected' block is removed.
        });

        // --- 2. Redraw connection group visuals ---
        // The visual shape for groups will automatically update
        // because its sceneFunc depends on the link waypoints which have changed.
        // We just need to ensure the layer is redrawn.

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

    // 完整替換此函數
    function drawWaypointHandles(link) {
        destroyWaypointHandles(link);

        const scale = 1 / stage.scaleX();

        link.waypoints.forEach((waypoint, index) => {
            const handle = new Konva.Circle({
                x: waypoint.x,
                y: waypoint.y,
                radius: 5,
                fill: 'white',
                stroke: '#007bff',
                strokeWidth: 2,
                draggable: true,
                name: 'waypoint-handle',
                scaleX: scale,
                scaleY: scale,
            });

            handle.setAttr('meta', { linkId: link.id, waypointIndex: index });

            handle.on('dragmove', (e) => {
                const movedHandle = e.target;
                const meta = movedHandle.getAttr('meta');
                const targetLink = network.links[meta.linkId];

                targetLink.waypoints[meta.waypointIndex] = { x: movedHandle.x(), y: movedHandle.y() };

                drawLink(targetLink);
                updateConnectionEndpoints(targetLink.id);
                updateAllDetectorsOnLink(targetLink.id);
                updateFlowPointsOnLink(targetLink.id);
                updateRoadSignsOnLink(targetLink.id);
                updateAllOverpasses(); // <--- 新增呼叫

                updatePropertiesPanel(targetLink);

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
        const id = existingId || `gate_${++idCounter}`;

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

    // --- START: ROAD MARKING FUNCTIONS ---

    // --- 修改 createRoadMarking ---
    function createRoadMarking(type, parentObj, positionOrPos) {
        const id = `mark_${++idCounter}`;

        let initX = 0, initY = 0, initPos = 0;

        if (typeof positionOrPos === 'object' && positionOrPos !== null) {
            initX = positionOrPos.x;
            initY = positionOrPos.y;
        } else if (typeof positionOrPos === 'number') {
            initPos = positionOrPos;
        }

        const marking = {
            id,
            type: 'RoadMarking',
            markingType: type,

            linkId: parentObj.type === 'Link' ? parentObj.id : null,
            nodeId: parentObj.type === 'Node' ? parentObj.id : null,

            position: initPos,
            laneIndices: [],

            length: 5,
            width: 2.5,

            x: initX,
            y: initY,
            rotation: 0,

            // [新增] 自由移動模式標記
            isFree: false,

            konvaGroup: new Konva.Group({ id, draggable: false, name: 'road-marking-group' })
        };

        if (marking.linkId) {
            const link = network.links[marking.linkId];
            if (link) {
                marking.laneIndices = link.lanes.map((_, i) => i);
            }
        }

        // 初始拖曳設定
        marking.konvaGroup.draggable(true);

        network.roadMarkings[id] = marking;
        layer.add(marking.konvaGroup);

        // 拖曳事件
        marking.konvaGroup.on('dragmove', function (e) {
            // [修改重點] 判斷邏輯：如果是 Node 模式 OR (Link 模式但開啟了自由移動)
            if (marking.nodeId || (marking.linkId && marking.isFree)) {
                // 自由移動模式：更新 x, y
                marking.x = this.x();
                marking.y = this.y();
                updatePropertiesPanel(marking);
            }
            else if (marking.linkId) {
                // 鎖定車道模式：計算投影距離
                const link = network.links[marking.linkId];
                const pointerPos = stage.getPointerPosition();
                const localPos = layer.getAbsoluteTransform().copy().invert().point(pointerPos);
                const { dist } = projectPointOnPolyline(localPos, link.waypoints);
                const clampedDist = Math.max(0, Math.min(dist, getPolylineLength(link.waypoints)));

                marking.position = clampedDist;
                drawRoadMarking(marking);
                updatePropertiesPanel(marking);
            }
        });

        drawRoadMarking(marking);
        return marking;
    }

    function drawRoadMarking(marking) {
        marking.konvaGroup.destroyChildren();

        const LINE_COLOR = 'white';
        const STROKE_WIDTH = 0.5;
        // [修正] 增加點擊判定範圍 (隱形邊框寬度)
        const HIT_WIDTH = 15;

        // 判斷是否使用「車道依附模式」
        const isLaneAttached = marking.linkId && !marking.isFree;

        if (isLaneAttached) {
            const link = network.links[marking.linkId];
            if (!link || marking.laneIndices.length === 0) return;

            const selectedLanes = marking.laneIndices.sort((a, b) => a - b);
            const minLane = selectedLanes[0];
            const maxLane = selectedLanes[selectedLanes.length - 1];

            const totalWidth = getLinkTotalWidth(link);
            let cumWidthStart = 0;
            for (let i = 0; i < minLane; i++) cumWidthStart += link.lanes[i].width;
            let cumWidthEnd = 0;
            for (let i = 0; i <= maxLane; i++) cumWidthEnd += link.lanes[i].width;

            const offsetLeft = cumWidthStart - totalWidth / 2;
            const offsetRight = cumWidthEnd - totalWidth / 2;

            const { point, vec } = getPointAlongPolyline(link.waypoints, marking.position);
            const normal = getNormal(vec);

            const p1 = add(point, scale(normal, offsetLeft));
            const p2 = add(point, scale(normal, offsetRight));

            if (marking.markingType === 'stop_line') {
                const line = new Konva.Line({
                    points: [p1.x, p1.y, p2.x, p2.y],
                    stroke: LINE_COLOR,
                    strokeWidth: STROKE_WIDTH,
                    hitStrokeWidth: HIT_WIDTH, // [修正] 讓停止線容易被點到
                    listening: true, // 確保可監聽
                    name: 'marking-shape'
                });
                marking.konvaGroup.add(line);
            }
            else if (marking.markingType === 'waiting_area' || marking.markingType === 'two_stage_box') {
                const startDist = Math.max(0, marking.position - marking.length);
                const { point: backPoint, vec: backVec } = getPointAlongPolyline(link.waypoints, startDist);
                const backNormal = getNormal(backVec);

                const p3 = add(backPoint, scale(backNormal, offsetRight));
                const p4 = add(backPoint, scale(backNormal, offsetLeft));

                const rect = new Konva.Line({
                    points: [p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y],
                    closed: true,
                    stroke: LINE_COLOR,
                    strokeWidth: STROKE_WIDTH,
                    hitStrokeWidth: HIT_WIDTH,
                    fill: 'rgba(0,0,0,0)', // [修正] 透明填充，讓點擊內部也能選取
                    listening: true,
                    name: 'marking-shape'
                });
                marking.konvaGroup.add(rect);
            }

            marking.konvaGroup.position({ x: 0, y: 0 });
            marking.konvaGroup.rotation(0);

        } else {
            // 自由模式 (Node 模式 或 Link 的 Free 模式)
            const rectWidth = marking.length;
            const rectHeight = marking.width;

            const rect = new Konva.Rect({
                x: -rectWidth / 2,
                y: -rectHeight / 2,
                width: rectWidth,
                height: rectHeight,
                stroke: LINE_COLOR,
                strokeWidth: STROKE_WIDTH,
                hitStrokeWidth: HIT_WIDTH,
                fill: 'rgba(0,0,0,0)', // [修正] 透明填充
                listening: true,
                name: 'marking-shape'
            });

            marking.konvaGroup.add(rect);
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

    // 完整替換 updatePropertiesPanel 函數
    function updatePropertiesPanel(obj) {
        propertiesContent.innerHTML = '';

        // --- [新增] 針對 Connect 工具的面板顯示 ---
        if (activeTool === 'connect-lanes' && !obj) {
            propertiesContent.innerHTML = `
                <div class="prop-section-header">Connection Tool Mode</div>
                <div class="prop-group">
                    <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;">
                        <input type="radio" name="connMode" value="manual" ${connectMode === 'manual' ? 'checked' : ''}>
                        <span><i class="fa-solid fa-hand-pointer"></i> Manual (Drag Ports)</span>
                    </label>
                    <div class="prop-hint">Drag from Red port to Blue port.</div>
                    
                    <label style="display:flex; align-items:center; gap:8px; margin-top:12px; cursor:pointer;">
                        <input type="radio" name="connMode" value="box" ${connectMode === 'box' ? 'checked' : ''}>
                        <span><i class="fa-regular fa-square-check"></i> Box Selection (Auto)</span>
                    </label>
                    <div class="prop-hint">Draw a box to connect all matching links inside.</div>
                </div>
                <hr>
                <div class="prop-section-header">Instructions</div>
                <p style="font-size:0.85rem; color:var(--text-muted);">
                    <strong>Box Mode:</strong> Draws a rectangle. Any "Link End" and "Link Start" within the box that are close to each other will be automatically connected.
                </p>
            `;

            // 綁定切換事件
            document.querySelectorAll('input[name="connMode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    connectMode = e.target.value;
                    // 切換游標樣式以提示使用者
                    stage.container().style.cursor = connectMode === 'box' ? 'crosshair' : 'default';
                });
            });
            return;
        }
        // --- [新增結束] ---

        if (!obj) {
            propertiesContent.innerHTML = '<p>Select an element to edit</p>';
            return;
        }


        // 檢查是否需要顯示「返回節點」按鈕 (用於在編輯連接線時快速跳回節點)
        let content = '';
        if (lastSelectedNodeForProperties && (obj.type === 'Connection' || obj.type === 'ConnectionGroup')) {
            content += `<button id="back-to-node-btn" class="tool-btn-secondary">⬅️ Back to Node ${lastSelectedNodeForProperties.id}</button><hr>`;
        }
        content += `<h4>${obj.type}: ${obj.id}</h4>`;

        // 針對連接線相關物件，顯示號誌群組選擇器
        if (obj.type === 'Connection' || obj.type === 'ConnectionGroup') {
            const nodeId = obj.nodeId;
            const tfl = network.trafficLights[nodeId];

            if (tfl && tfl.signalGroups && Object.keys(tfl.signalGroups).length > 0) {
                let currentGroupId = '';
                const firstConnId = (obj.type === 'Connection') ? obj.id : obj.connectionIds[0];

                if (firstConnId) {
                    for (const group of Object.values(tfl.signalGroups)) {
                        if (group.connIds.includes(firstConnId)) {
                            currentGroupId = group.id;
                            break;
                        }
                    }
                }

                content += `<div class="prop-group">
                            <label for="prop-tfl-group">🚦 Signal Group</label>
                            <select id="prop-tfl-group">
                                <option value="">None</option>
                                ${Object.keys(tfl.signalGroups).map(id =>
                    `<option value="${id}" ${id === currentGroupId ? 'selected' : ''}>${id}</option>`
                ).join('')}
                            </select>
                        </div>`;
            }
        }

        switch (obj.type) {
            case 'Link':
                // 定義分頁按鈕 HTML
                const getLinkTabClass = (tabName) => lastActiveLinkTab === tabName ? 'active' : '';
                const getLinkContentClass = (tabName) => lastActiveLinkTab === tabName ? 'active' : '';

                content += `
                <div class="prop-tab-header">
                    <button class="prop-tab-btn ${getLinkTabClass('tab-link-general')}" data-target="tab-link-general">
                        <i class="fa-solid fa-road"></i> General
                    </button>
                    <button class="prop-tab-btn ${getLinkTabClass('tab-link-conns')}" data-target="tab-link-conns">
                        <i class="fa-solid fa-link"></i> Connections
                    </button>
                </div>`;

                // --- TAB 1: GENERAL (原有的屬性設定) ---
                content += `<div id="tab-link-general" class="prop-tab-content ${getLinkContentClass('tab-link-general')}">`;

                // ... (原有的 General 內容) ...
                content += `<div class="prop-section-header">General</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Name</span>
                                <input type="text" id="prop-link-name" class="prop-input" value="${obj.name || obj.id}">
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;

                content += `<div class="prop-section-header">Geometry</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Length</span>
                                <span class="prop-value-text">${getPolylineLength(obj.waypoints).toFixed(2)} m</span>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Total Width</span>
                                <span class="prop-value-text">${getLinkTotalWidth(obj).toFixed(2)} m</span>
                            </div>`;

                content += `<div class="prop-section-header">Lanes Configuration</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Count</span>
                                <input type="number" id="prop-lanes" class="prop-input" value="${obj.lanes.length}" min="1" max="10">
                            </div>`;

                content += `<label class="prop-label" style="font-size:0.75rem; margin-top:8px; display:block;">Individual Widths (m)</label>`;
                content += `<div class="prop-grid-container" id="lane-widths-container">`;
                obj.lanes.forEach((lane, index) => {
                    content += `<div class="prop-grid-item">
                                    <span class="prop-grid-label">L${index + 1}</span>
                                    <input type="number" id="prop-lane-width-${index}" class="prop-grid-input prop-lane-width" data-index="${index}" value="${lane.width.toFixed(2)}" step="0.1" min="1">
                                </div>`;
                });
                content += `</div>`;

                content += `<div class="prop-hint">
                                <i class="fa-solid fa-circle-info"></i> 
                                <strong>Tip:</strong> Alt + Left Click on the road to add a shaping point.
                            </div>`;

                content += `</div>`; // End Tab 1


                // --- TAB 2: CONNECTIONS (連結清單) ---
                content += `<div id="tab-link-conns" class="prop-tab-content ${getLinkContentClass('tab-link-conns')}">`;
                content += `<div class="prop-section-header">Outgoing Connections</div>`;

                // 搜尋所有以此 Link 為起點的連接
                const outgoingConns = Object.values(network.connections)
                    .filter(c => c.sourceLinkId === obj.id)
                    .sort((a, b) => a.sourceLaneIndex - b.sourceLaneIndex || a.destLaneIndex - b.destLaneIndex);

                if (outgoingConns.length > 0) {
                    content += `<div class="conn-list-container" style="display:flex; flex-direction:column; gap:8px;">`;
                    outgoingConns.forEach(conn => {
                        const destLink = network.links[conn.destLinkId];
                        const destName = destLink ? (destLink.name || destLink.id) : conn.destLinkId;

                        // [修正] 加入 class "conn-list-item" 與 data-conn-id，用於滑鼠移入高亮
                        content += `
                        <div class="prop-card conn-list-item" data-conn-id="${conn.id}" style="padding: 8px; border-left: 3px solid #3b82f6; cursor:default;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="font-size:0.85rem; color:var(--text-main);">
                                    <span style="font-weight:bold; color:#2563eb;">Lane ${conn.sourceLaneIndex + 1}</span>
                                    <i class="fa-solid fa-arrow-right" style="margin:0 6px; color:#94a3b8; font-size:0.75rem;"></i>
                                    <span>${destName}</span>
                                    <span style="font-size:0.75rem; color:#64748b; background:#f1f5f9; padding:1px 4px; border-radius:3px;">L${conn.destLaneIndex + 1}</span>
                                </div>
                                <button class="btn-mini btn-del-single-conn" data-id="${conn.id}" title="Remove Connection" style="color:#ef4444; border:1px solid #fecaca; background:#fff;">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>`;
                    });
                    content += `</div>`;
                } else {
                    content += `<div class="prop-hint" style="text-align:center; padding:20px 0;">
                                    <i class="fa-solid fa-link-slash" style="font-size:1.5rem; color:#cbd5e1; margin-bottom:8px;"></i><br>
                                    No outgoing connections.
                                </div>`;
                }

                content += `</div>`; // End Tab 2
                break;

            case 'Node':
                // 1. 定義分頁按鈕 HTML (調整順序：Settings -> Links -> Flow)
                // 根據 lastActiveNodeTab 決定哪個按鈕有 active class
                const getTabClass = (tabName) => lastActiveNodeTab === tabName ? 'active' : '';

                content += `
                <div class="prop-tab-header">
                    <button class="prop-tab-btn ${getTabClass('tab-settings')}" data-target="tab-settings">
                        <i class="fa-solid fa-sliders"></i> Settings
                    </button>
                    <button class="prop-tab-btn ${getTabClass('tab-conn')}" data-target="tab-conn">
                        <i class="fa-solid fa-network-wired"></i> Links
                    </button>
                    <button class="prop-tab-btn ${getTabClass('tab-flow')}" data-target="tab-flow">
                        <i class="fa-solid fa-arrow-right-arrow-left"></i> Flow
                    </button>
                </div>`;

                // 2. 準備各分頁內容容器
                const getContentClass = (tabName) => lastActiveNodeTab === tabName ? 'active' : '';

                // --- TAB 1: SETTINGS (Signal Control Only) ---
                content += `<div id="tab-settings" class="prop-tab-content ${getContentClass('tab-settings')}">`;

                // Signal Control Header
                content += `<div class="prop-section-header">Signal Control</div>`;

                const tflData = network.trafficLights[obj.id] || { timeShift: 0 };
                const hasSignal = tflData.schedule && tflData.schedule.length > 0;

                // 1. Status
                content += `<div class="prop-row">
                                <span class="prop-label">Status</span>
                                ${hasSignal
                        ? '<span class="prop-status-indicator success" style="padding:2px 8px; margin:0;">Active</span>'
                        : '<span class="prop-status-indicator" style="padding:2px 8px; margin:0; background:#f1f5f9; color:#94a3b8;">No Signal</span>'}
                            </div>`;

                // 2. Time Shift (Moved Up)
                content += `<div class="prop-row">
                                <span class="prop-label">Time Shift (s)</span>
                                <input type="number" id="prop-tfl-shift" class="prop-input" value="${tflData.timeShift}" min="0" step="1">
                            </div>`;

                // 3. Edit Button (Moved Down)
                content += `<button id="edit-tfl-btn" class="btn-action" style="width:100%; margin-top:8px;">
                                <i class="fa-solid fa-traffic-light"></i> Edit Schedule
                            </button>`;

                content += `</div>`; // End Tab 1


                // --- TAB 2: LINKS (Connection Groups) ---
                content += `<div id="tab-conn" class="prop-tab-content ${getContentClass('tab-conn')}">`;
                content += `<div class="prop-section-header">Connection Groups</div>`;

                // Logic for groups
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
                    const tflDataForGroup = network.trafficLights[obj.id] || { signalGroups: {} };
                    const signalGroupOptions = Object.keys(tflDataForGroup.signalGroups || {});

                    relatedGroups.forEach(group => {
                        // Logic to find current signal group ... (保持不變)
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

                        // Dropdown HTML ... (保持不變)
                        let signalSelectHtml = `<select class="prop-select prop-group-signal-select" data-group-json='${JSON.stringify(group.connectionIds)}' style="font-size:0.8rem; padding:2px;">`;
                        signalSelectHtml += `<option value="">(No Signal)</option>`;
                        signalGroupOptions.forEach(sgId => {
                            const selected = sgId === currentSignalGroupId ? "selected" : "";
                            signalSelectHtml += `<option value="${sgId}" ${selected}>${sgId}</option>`;
                        });
                        signalSelectHtml += `</select>`;

                        // 3. 渲染卡片
                        // [修正重點] 加入 class "connection-group-card" 和 data-source/data-dest
                        content += `<div class="prop-card connection-group-card" 
                                         data-source="${group.sourceLinkId}" 
                                         data-dest="${group.destLinkId}"
                                         id="${group.domId}" 
                                         style="cursor:default;">
                                         
                                        <!-- Header Row -->
                                        <div class="prop-card-row" style="margin-bottom:8px; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">
                                            <span style="font-weight:700; font-size:0.85rem; color:var(--text-main);">
                                                ${group.sourceLinkId} <i class="fa-solid fa-arrow-right" style="font-size:0.7rem; color:#94a3b8;"></i> ${group.destLinkId}
                                            </span>
                                            
                                            <!-- Buttons -->
                                            <div style="display:flex; gap:6px;">
                                                <button class="btn-mini group-edit-btn" title="Edit Lanes" data-source="${group.sourceLinkId}" data-dest="${group.destLinkId}" style="background:#f1f5f9; border:1px solid #e2e8f0; color:var(--text-muted);">
                                                    <i class="fa-solid fa-pen"></i>
                                                </button>
                                                <button class="btn-mini group-delete-btn" title="Delete Group" data-source="${group.sourceLinkId}" data-dest="${group.destLinkId}" style="background:#fff; border:1px solid #fecaca; color:#ef4444;">
                                                    <i class="fa-solid fa-trash-can"></i>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <!-- Info Row -->
                                        <div class="prop-card-row">
                                            <span class="prop-card-label">Lanes Connected</span>
                                            <span style="font-size:0.8rem; font-weight:600; color:var(--text-main);">${group.connectionIds.length}</span>
                                        </div>

                                        <!-- Control Row -->
                                        <div class="prop-card-row" style="margin-top:6px;">
                                            <span class="prop-card-label"><i class="fa-solid fa-traffic-light"></i> Signal Group</span>
                                            <div style="flex:1; margin-left:8px;">
                                                ${signalSelectHtml}
                                            </div>
                                        </div>
                                    </div>`;
                    });
                } else {
                    content += `<div style="font-size:0.8rem; color:#94a3b8; font-style:italic; padding:4px;">No connection groups found.</div>`;
                }

                content += `<div class="prop-section-header" style="margin-top:16px;">Tools</div>`;
                content += `<button id="redraw-node-connections-btn" class="btn-action" style="width:100%;">
                                <i class="fa-solid fa-rotate"></i> Redraw Connections
                            </button>`;
                content += `</div>`; // End Tab 2


                // --- TAB 3: FLOW (Turning Ratios) ---
                content += `<div id="tab-flow" class="prop-tab-content ${getContentClass('tab-flow')}">`;
                content += `<div class="prop-section-header" style="display:flex; justify-content:space-between; align-items:center;">
                                Turning Ratios
                                <button id="btn-auto-calc-turns" class="btn-mini" style="background:#e0f2fe; color:#0284c7;">Auto-Calc</button>
                            </div>`;

                const incomingLinks = [...obj.incomingLinkIds];
                const outgoingLinks = [...obj.outgoingLinkIds];
                if (!obj.turningRatios) obj.turningRatios = {};

                if (incomingLinks.length > 0 && outgoingLinks.length > 0) {
                    content += `<div id="turning-ratios-container">`;
                    incomingLinks.forEach(inLink => {
                        content += `<div class="prop-card" style="padding:8px; background:#f8fafc;">`;

                        // [修正] 加入 class "turn-ratio-header" 與 data-link，用於滑鼠移入高亮來源路段
                        content += `<div class="turn-ratio-header" data-link="${inLink}" style="font-size:0.8rem; font-weight:700; color:#475569; margin-bottom:6px; border-bottom:1px solid #e2e8f0; padding-bottom:4px; cursor:default;">
                                        From ${inLink}
                                    </div>`;

                        outgoingLinks.forEach(outLink => {
                            const ratio = (obj.turningRatios[inLink] && obj.turningRatios[inLink][outLink] !== undefined)
                                ? obj.turningRatios[inLink][outLink] : 0;
                            const percent = (ratio * 100).toFixed(1);

                            // [修正] 加入 class "turn-ratio-row" 與 data-from/to，用於滑鼠移入高亮轉向路徑
                            content += `<div class="prop-row turn-ratio-row" data-from="${inLink}" data-to="${outLink}" style="margin-bottom:4px; padding:2px; border-radius:4px; cursor:default;">
                                            <span class="prop-label" style="font-size:0.75rem;">To ${outLink}</span>
                                            <div style="display:flex; align-items:center; gap:4px;">
                                                <input type="number" class="prop-turn-ratio prop-input" style="width:50px; padding:2px;" data-from="${inLink}" data-to="${outLink}" value="${percent}" min="0" max="100" step="1">
                                                <span style="font-size:0.75rem; color:#64748b;">%</span>
                                            </div>
                                        </div>`;
                        });
                        content += `</div>`;
                    });
                    content += `</div>`;
                } else {
                    content += `<div class="prop-hint">Connect links to configure flow ratios.</div>`;
                }
                content += `</div>`; // End Tab 3

                break;

            case 'PointDetector':
            case 'SectionDetector':
                const isSection = obj.type === 'SectionDetector';

                // --- SECTION: GENERAL ---
                content += `<div class="prop-section-header">General</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Name</span>
                                <input type="text" id="prop-det-name" class="prop-input" value="${obj.name}">
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Parent Link</span>
                                <input type="text" class="prop-input" value="${obj.linkId}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Position (m)</span>
                                <input type="number" step="0.5" id="prop-det-pos" class="prop-input" value="${obj.position.toFixed(2)}">
                            </div>`;

                if (isSection) {
                    content += `<div class="prop-row">
                                    <span class="prop-label">Length (m)</span>
                                    <input type="number" step="0.5" id="prop-det-len" class="prop-input" value="${(obj.length || 0).toFixed(2)}">
                                </div>`;
                }

                // --- SECTION: TRAFFIC DATA ---
                content += `<div class="prop-section-header">Traffic Data</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Observed Flow</span>
                                <input type="number" id="prop-det-flow" class="prop-input" value="${obj.observedFlow || 0}" min="0">
                            </div>`;
                content += `<div class="prop-hint" style="margin-top:4px; font-size:0.7rem; padding:4px;">
                                Unit: Vehicles per Hour (veh/h)
                            </div>`;

                // --- SECTION: SOURCE CONFIG ---
                content += `<div class="prop-section-header">Source Configuration</div>`;

                // Checkbox Row
                content += `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding: 6px; background: #fff; border: 1px solid var(--border-light); border-radius: 4px;">
                                <label for="prop-det-is-source" style="font-size:0.85rem; color:var(--text-main); font-weight:500; cursor:pointer;">
                                    Act as Flow Source
                                </label>
                                <input type="checkbox" id="prop-det-is-source" ${obj.isSource ? 'checked' : ''} style="cursor:pointer;">
                            </div>`;

                // Vehicle Mix List (Conditional)
                if (obj.isSource) {
                    // Ensure profiles exist
                    if (!network.vehicleProfiles) network.vehicleProfiles = {};
                    const profileOptions = Object.keys(network.vehicleProfiles);
                    if (profileOptions.length === 0) {
                        network.vehicleProfiles['default'] = { id: 'default', length: 4.5, width: 1.8, maxSpeed: 16.67, maxAcceleration: 1.5, comfortDeceleration: 3.0, minDistance: 2.0, desiredHeadwayTime: 1.5 };
                        profileOptions.push('default');
                    }
                    if (!obj.spawnProfiles) obj.spawnProfiles = [];
                    if (obj.spawnProfileId) { // Compatibility migration
                        obj.spawnProfiles.push({ profileId: obj.spawnProfileId, weight: 1.0 });
                        delete obj.spawnProfileId;
                    }
                    if (obj.spawnProfiles.length === 0) {
                        obj.spawnProfiles.push({ profileId: 'default', weight: 1.0 });
                    }

                    content += `<label class="prop-label" style="margin-bottom:6px; display:block;">Vehicle Mix (Weighted)</label>`;
                    content += `<div id="det-profiles-list">`;

                    obj.spawnProfiles.forEach((entry, idx) => {
                        const dropdownHtml = generateDropdown(`det-prof-sel-${idx}`, profileOptions, entry.profileId);
                        // Inject class into generated dropdown
                        const styledDropdown = dropdownHtml.replace('<select', '<select class="prop-select" style="padding:2px 4px; font-size:0.8rem;"');

                        content += `
                        <div class="prop-card">
                            <div class="prop-card-row">
                                <span class="prop-card-label">Type</span>
                                <div style="flex:1; margin-left:8px;">${styledDropdown}</div>
                            </div>
                            <div class="prop-card-row">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span class="prop-card-label">Weight</span>
                                    <input type="number" step="0.1" class="det-prof-weight prop-card-input" data-index="${idx}" value="${entry.weight}">
                                </div>
                                <button class="det-prof-del-btn btn-mini btn-mini-danger" data-index="${idx}">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>`;
                    });
                    content += `</div>`; // End list

                    // Add Buttons
                    content += `<button id="btn-add-det-profile" class="btn-full">
                                    <i class="fa-solid fa-plus"></i> Add Vehicle Type
                                </button>`;
                    content += `<button id="btn-manage-profiles" class="btn-full" style="background:#f1f5f9; color:var(--text-muted); border-style:solid; margin-top:8px;">
                                    <i class="fa-solid fa-gear"></i> Manage Definitions
                                </button>`;
                }
                break;

            case 'RoadSign':
                // --- SECTION: GENERAL ---
                content += `<div class="prop-section-header">General</div>`;

                // ID (唯讀)
                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;

                // Link ID (唯讀)
                content += `<div class="prop-row">
                                <span class="prop-label">Parent Link</span>
                                <input type="text" class="prop-input" value="${obj.linkId}" disabled>
                            </div>`;

                // --- SECTION: CONFIGURATION ---
                content += `<div class="prop-section-header">Configuration</div>`;

                // Sign Type (下拉選單)
                content += `<div class="prop-row">
                                <span class="prop-label">Sign Type</span>
                                <select id="prop-sign-type" class="prop-select">
                                    <option value="start" ${obj.signType === 'start' ? 'selected' : ''}>Speed Limit Start</option>
                                    <option value="end" ${obj.signType === 'end' ? 'selected' : ''}>Speed Limit End</option>
                                </select>
                            </div>`;

                // Speed Limit (僅在 start 類型顯示)
                // 注意：.prop-row 預設是 flex，隱藏時設為 none
                const limitDisplay = (obj.signType === 'start') ? 'flex' : 'none';
                content += `<div class="prop-row" id="prop-speed-limit-row" style="display: ${limitDisplay};">
                                <span class="prop-label">Limit (km/h)</span>
                                <input type="number" id="prop-speed-limit" class="prop-input" value="${obj.speedLimit}" min="0">
                            </div>`;

                // Position
                content += `<div class="prop-row">
                                <span class="prop-label">Position (m)</span>
                                <input type="number" step="0.1" id="prop-sign-pos" class="prop-input" value="${obj.position.toFixed(2)}">
                            </div>`;

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Actions</div>`;
                content += `<button id="btn-delete-sign" class="btn-danger-outline">
                                <i class="fa-solid fa-trash-can"></i> Delete Road Sign
                            </button>`;
                break;

            case 'Connection':
                // --- SECTION: GENERAL ---
                content += `<div class="prop-section-header">General</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;

                // --- SECTION: TOPOLOGY ---
                content += `<div class="prop-section-header">Topology</div>`;

                // Source
                content += `<div class="prop-row">
                                <span class="prop-label">From Link</span>
                                <input type="text" class="prop-input" value="${obj.sourceLinkId}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">From Lane</span>
                                <input type="text" class="prop-input" value="L${obj.sourceLaneIndex + 1}" disabled>
                            </div>`;

                // Destination
                content += `<div class="prop-row" style="margin-top:8px;">
                                <span class="prop-label">To Link</span>
                                <input type="text" class="prop-input" value="${obj.destLinkId}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">To Lane</span>
                                <input type="text" class="prop-input" value="L${obj.destLaneIndex + 1}" disabled>
                            </div>`;

                // Via Node
                content += `<div class="prop-row" style="margin-top:8px;">
                                <span class="prop-label">Via Node</span>
                                <input type="text" class="prop-input" value="${obj.nodeId}" disabled>
                            </div>`;

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Actions</div>`;
                content += `<button id="prop-conn-delete-btn" class="btn-danger-outline">
                                <i class="fa-solid fa-trash-can"></i> Delete Connection
                            </button>`;
                break;

            case 'ConnectionGroup':
                // --- SECTION: GROUP INFO ---
                content += `<div class="prop-section-header">Group Info</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">From Link</span>
                                <input type="text" class="prop-input" value="${obj.sourceLinkId}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">To Link</span>
                                <input type="text" class="prop-input" value="${obj.destLinkId}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Via Node</span>
                                <input type="text" class="prop-input" value="${obj.nodeId}" disabled>
                            </div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Total Connections</span>
                                <span class="prop-value-text" style="font-weight:bold; color:var(--primary);">${obj.connectionIds.length}</span>
                            </div>`;

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Management</div>`;
                content += `<div class="btn-group-row">
                                <button id="edit-group-btn" class="btn-action">
                                    <i class="fa-solid fa-pen-to-square"></i> Edit
                                </button>
                                <button id="delete-group-btn" class="btn-action" style="color:#ef4444; border-color:#fecaca;">
                                    <i class="fa-solid fa-trash-can"></i> Delete
                                </button>
                            </div>`;
                break;

            case 'Origin':
                // --- SECTION: GENERAL ---
                content += `<div class="prop-section-header">General</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Parent Link</span>
                                <input type="text" class="prop-input" value="${obj.linkId}" disabled>
                            </div>`;

                // --- SECTION: GENERATION ---
                content += `<div class="prop-section-header">Traffic Generation</div>`;

                content += `<button id="configure-spawner-btn" class="btn-action" style="width:100%; justify-content:center; gap:6px;">
                                <i class="fa-solid fa-clock"></i> Configure Schedule
                            </button>`;

                content += `<div class="prop-hint">
                                <i class="fa-solid fa-circle-info"></i> 
                                Defines time-based vehicle spawn rates and destinations (OD Mode).
                            </div>`;
                break;

            case 'Destination':
                // --- SECTION: GENERAL ---
                content += `<div class="prop-section-header">General</div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Parent Link</span>
                                <input type="text" class="prop-input" value="${obj.linkId}" disabled>
                            </div>`;
                content += `<div class="prop-hint">
                                Vehicles reaching this point will be removed from the simulation.
                            </div>`;
                break;

            case 'Background':
                // --- SECTION: SOURCE ---
                content += `<div class="prop-section-header">Image Source</div>`;

                content += `<button id="prop-bg-file-btn" class="btn-action" style="width:100%; justify-content:center; gap:6px;">
                                <i class="fa-regular fa-folder-open"></i> Replace Image...
                            </button>`;
                content += `<input type="file" id="prop-bg-file-input" style="display: none;" accept="image/*">`;

                if (obj.imageType) {
                    content += `<div class="prop-row" style="margin-top:8px;">
                                    <span class="prop-label">Format</span>
                                    <input type="text" class="prop-input" value="${obj.imageType}" disabled>
                                </div>`;
                }

                // --- SECTION: APPEARANCE ---
                content += `<div class="prop-section-header">Appearance</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Opacity (%)</span>
                                <input type="number" id="prop-bg-opacity" class="prop-input" value="${obj.opacity}" min="0" max="100" step="10">
                            </div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Scale</span>
                                <input type="number" id="prop-bg-scale" class="prop-input" value="${obj.scale.toFixed(2)}" min="0.01" step="0.01">
                            </div>`;

                // --- SECTION: DIMENSIONS ---
                content += `<div class="prop-section-header">Dimensions (px)</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Width</span>
                                <input type="text" class="prop-input" value="${(obj.width).toFixed(0)}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Height</span>
                                <input type="text" class="prop-input" value="${(obj.height).toFixed(0)}" disabled>
                            </div>`;

                content += `<div class="prop-hint">
                                <i class="fa-solid fa-lock"></i> 
                                Use the toggle button at the bottom right of the canvas to Lock/Unlock positioning.
                            </div>`;

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Actions</div>`;
                // 注意：這裡假設 deleteSelectedObject() 會處理 Background，或是你可以呼叫 deleteBackground()
                content += `<button onclick="deleteSelectedObject()" class="btn-danger-outline">
                                <i class="fa-solid fa-trash-can"></i> Delete Background
                            </button>`;
                break;

            case 'Overpass':
                const bottomLinkId = obj.linkId1 === obj.topLinkId ? obj.linkId2 : obj.linkId1;
                content += `<div class="prop-group">
                            <label>Top Layer</label>
                            <p style="font-weight: bold;">${obj.topLinkId}</p>
                        </div>`;
                content += `<div class="prop-group">
                            <label>Bottom Layer</label>
                            <p>${bottomLinkId}</p>
                        </div>`;
                content += `<button id="swap-overpass-btn" class="tool-btn">Swap Layer Order</button>`;
                break;

            case 'Pushpin':
                // --- SECTION: CANVAS COORDINATES ---
                content += `<div class="prop-section-header">Canvas Position</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">X</span>
                                <input type="number" class="prop-input" value="${obj.x.toFixed(2)}" disabled>
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">Y</span>
                                <input type="number" class="prop-input" value="${obj.y.toFixed(2)}" disabled>
                            </div>`;

                // --- SECTION: GEO REFERENCE ---
                content += `<div class="prop-section-header">Geo Reference</div>`;

                // 使用 border-left 色條來區分 Lat/Lon
                content += `<div class="prop-row" style="border-left: 3px solid #ef4444; padding-left: 8px;">
                                <span class="prop-label">Latitude</span>
                                <input type="number" id="prop-pin-lat" class="prop-input" value="${obj.lat}" step="0.000001">
                            </div>`;

                content += `<div class="prop-row" style="border-left: 3px solid #3b82f6; padding-left: 8px;">
                                <span class="prop-label">Longitude</span>
                                <input type="number" id="prop-pin-lon" class="prop-input" value="${obj.lon}" step="0.000001">
                            </div>`;

                content += `<div class="prop-hint">
                                <i class="fa-solid fa-map-pin"></i> 
                                Used to align the simulation grid with real-world map coordinates (Max 2 pins).
                            </div>`;

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Actions</div>`;
                content += `<button id="btn-delete-pin" class="btn-danger-outline">
                                <i class="fa-solid fa-trash-can"></i> Delete Pin
                            </button>`;
                break;

            case 'ParkingLot':
                // --- SECTION: GENERAL ---
                content += `<div class="prop-section-header">General</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Name</span>
                                <input type="text" id="prop-pl-name" class="prop-input" value="${obj.name}">
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;

                // --- SECTION: CAPACITY ---
                content += `<div class="prop-section-header">Capacity</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label"><i class="fa-solid fa-car"></i> Cars</span>
                                <input type="number" id="prop-pl-car" class="prop-input" value="${obj.carCapacity}" min="0">
                            </div>`;
                content += `<div class="prop-row">
                                <span class="prop-label"><i class="fa-solid fa-motorcycle"></i> Motos</span>
                                <input type="number" id="prop-pl-moto" class="prop-input" value="${obj.motoCapacity}" min="0">
                            </div>`;

                // --- SECTION: SIMULATION ---
                content += `<div class="prop-section-header">Simulation Behavior</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Attraction (%)</span>
                                <input type="number" id="prop-pl-attr" class="prop-input" value="${obj.attractionProb || 0}" min="0" max="100" step="1">
                            </div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Stay Duration (min)</span>
                                <input type="number" id="prop-pl-duration" class="prop-input" value="${obj.stayDuration || 0}" min="0" step="1">
                            </div>`;

                content += `<div class="prop-hint">
                                <i class="fa-solid fa-circle-info"></i> 
                                Double-click on canvas to finish drawing polygon.
                            </div>`;

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Actions</div>`;
                content += `<button id="btn-delete-pl" class="btn-danger-outline">
                                <i class="fa-solid fa-trash-can"></i> Delete Parking Lot
                            </button>`;
                break;

            case 'ParkingGate':
                // --- SECTION: STATUS ---
                content += `<div class="prop-section-header">Connection Status</div>`;

                const linkedPl = obj.parkingLotId ? network.parkingLots[obj.parkingLotId] : null;
                if (linkedPl) {
                    content += `<div class="prop-status-indicator success">
                                    <i class="fa-solid fa-link"></i>
                                    <div>
                                        <div>Linked</div>
                                        <div style="font-size:0.75rem; opacity:0.8;">${linkedPl.name}</div>
                                    </div>
                                </div>`;
                } else {
                    content += `<div class="prop-status-indicator error">
                                    <i class="fa-solid fa-link-slash"></i>
                                    <div>
                                        <div>Not Linked</div>
                                        <div style="font-size:0.75rem; opacity:0.8;">Drag onto a Parking Lot boundary.</div>
                                    </div>
                                </div>`;
                }

                // --- SECTION: CONFIGURATION ---
                content += `<div class="prop-section-header">Configuration</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Type</span>
                                <select id="prop-gate-type" class="prop-select">
                                    <option value="entry" ${obj.gateType === 'entry' ? 'selected' : ''}>Entry Only</option>
                                    <option value="exit" ${obj.gateType === 'exit' ? 'selected' : ''}>Exit Only</option>
                                    <option value="bidirectional" ${obj.gateType === 'bidirectional' ? 'selected' : ''}>Bi-directional</option>
                                </select>
                            </div>`;

                // --- SECTION: GEOMETRY ---
                content += `<div class="prop-section-header">Geometry</div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Rotation (deg)</span>
                                <input type="number" id="prop-gate-rotation" class="prop-input" value="${(obj.rotation || 0).toFixed(1)}">
                            </div>`;

                content += `<div class="prop-row">
                                <span class="prop-label">Width (m)</span>
                                <input type="text" class="prop-input" value="${obj.width.toFixed(2)}" disabled>
                            </div>`;

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Actions</div>`;
                content += `<button id="btn-delete-gate" class="btn-danger-outline">
                                <i class="fa-solid fa-trash-can"></i> Delete Gate
                            </button>`;
                break;
            case 'RoadMarking':
                // --- SECTION: GENERAL ---
                content += `<div class="prop-section-header">General</div>`;

                // ID (Read-only)
                content += `<div class="prop-row">
                                <span class="prop-label">ID</span>
                                <input type="text" class="prop-input" value="${obj.id}" disabled>
                            </div>`;

                // Type Select
                content += `<div class="prop-row">
                                <span class="prop-label">Type</span>
                                <select id="prop-mark-type" class="prop-select">
                                    <option value="stop_line" ${obj.markingType === 'stop_line' ? 'selected' : ''}>Stop Line</option>
                                    <option value="waiting_area" ${obj.markingType === 'waiting_area' ? 'selected' : ''}>Waiting Area</option>
                                    <option value="two_stage_box" ${obj.markingType === 'two_stage_box' ? 'selected' : ''}>Two-Stage Box</option>
                                </select>
                            </div>`;

                // --- SECTION: PLACEMENT ---
                content += `<div class="prop-section-header">Placement</div>`;

                // 判斷是否為 Link 上的鎖定模式
                if (obj.linkId && !obj.isFree) {
                    content += `<div class="prop-row">
                                    <span class="prop-label">Parent Link</span>
                                    <input type="text" class="prop-input" value="${obj.linkId}" disabled>
                                </div>`;

                    content += `<div class="prop-row">
                                    <span class="prop-label">Position (m)</span>
                                    <input type="number" step="0.5" id="prop-mark-pos" class="prop-input" value="${obj.position.toFixed(2)}">
                                </div>`;

                    // Lane Selection (Grid Layout)
                    const link = network.links[obj.linkId];
                    if (link) {
                        content += `<label class="prop-label" style="margin-top:8px; display:block;">Active Lanes</label>`;
                        content += `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; padding: 4px; border: 1px solid var(--border-light); border-radius: 4px; background: #fff;">`;

                        link.lanes.forEach((_, idx) => {
                            const checked = obj.laneIndices.includes(idx) ? 'checked' : '';
                            content += `<label style="font-size: 0.8rem; display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; background: #f8fafc; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-light);">
                                            <input type="checkbox" class="prop-mark-lane" value="${idx}" ${checked}>
                                            L${idx + 1}
                                        </label>`;
                        });
                        content += `</div>`;
                    }
                }
                // 自由模式或 Node 模式
                else {
                    const parentLabel = obj.nodeId ? "Parent Node" : "Origin Link";
                    const parentId = obj.nodeId || obj.linkId;

                    content += `<div class="prop-row">
                                    <span class="prop-label">${parentLabel}</span>
                                    <input type="text" class="prop-input" value="${parentId}" disabled>
                                </div>`;

                    content += `<div class="prop-row">
                                    <span class="prop-label">Global X</span>
                                    <input type="text" class="prop-input" value="${obj.x.toFixed(2)}" disabled>
                                </div>`;
                    content += `<div class="prop-row">
                                    <span class="prop-label">Global Y</span>
                                    <input type="text" class="prop-input" value="${obj.y.toFixed(2)}" disabled>
                                </div>`;
                    content += `<div class="prop-row">
                                    <span class="prop-label">Rotation (deg)</span>
                                    <input type="number" id="prop-mark-rot" class="prop-input" value="${(obj.rotation || 0).toFixed(1)}">
                                </div>`;
                }

                // --- SECTION: DIMENSIONS (若非停止線) ---
                if (obj.markingType !== 'stop_line') {
                    content += `<div class="prop-section-header">Dimensions</div>`;
                    content += `<div class="prop-row">
                                    <span class="prop-label">Length (m)</span>
                                    <input type="number" step="0.1" id="prop-mark-len" class="prop-input" value="${obj.length}">
                                </div>`;

                    // Width 僅在自由模式或 Two-Stage Box 顯示
                    if (obj.markingType === 'two_stage_box' && (obj.nodeId || obj.isFree)) {
                        content += `<div class="prop-row">
                                        <span class="prop-label">Width (m)</span>
                                        <input type="number" step="0.1" id="prop-mark-wid" class="prop-input" value="${obj.width.toFixed(2)}">
                                    </div>`;
                    }
                }

                // --- SECTION: CONFIGURATION (自由移動開關) ---
                if (obj.markingType === 'two_stage_box' && obj.linkId) {
                    content += `<div class="prop-section-header">Configuration</div>`;

                    // 使用 Flex Row 讓 Checkbox 與文字對齊
                    content += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <input type="checkbox" id="prop-mark-isfree" ${obj.isFree ? 'checked' : ''} style="cursor: pointer;">
                                    <label for="prop-mark-isfree" style="font-size: 0.85rem; color: var(--text-main); cursor: pointer;">
                                        Manual Positioning
                                    </label>
                                </div>`;

                    if (obj.isFree) {
                        content += `<div class="prop-hint" style="margin-top:0;">
                                        <i class="fa-solid fa-hand-pointer"></i> 
                                        You can now drag the box freely (e.g., into the intersection).
                                    </div>`;
                    } else {
                        content += `<div class="prop-hint" style="margin-top:0;">
                                        Attached to link lanes. Check "Manual Positioning" to detach.
                                    </div>`;
                    }
                }

                // --- SECTION: ACTIONS ---
                content += `<div class="prop-section-header">Actions</div>`;
                content += `<button id="btn-delete-marking" class="btn-danger-outline">
                                <i class="fa-solid fa-trash-can"></i> Delete Marking
                            </button>`;
                break;
        }

        propertiesContent.innerHTML = content;
        attachPropertiesEventListeners(obj);
        I18N.translateDOM(propertiesContent);
    }

    // 完整替換此函數
    // 完整替換 attachPropertiesEventListeners 函數
    function attachPropertiesEventListeners(obj) {
        if (!obj) return;

        // --- 通用：分頁切換邏輯 (針對 Node) ---
        if (obj.type === 'Node') {
            const tabBtns = document.querySelectorAll('.prop-tab-btn');
            const tabContents = document.querySelectorAll('.prop-tab-content');

            tabBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // 1. 移除所有 active 狀態
                    tabBtns.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));

                    // 2. 激活當前選取
                    const targetId = btn.dataset.target;
                    btn.classList.add('active');
                    const targetContent = document.getElementById(targetId);
                    if (targetContent) targetContent.classList.add('active');

                    // 3. 更新全域狀態，記住使用者選擇
                    lastActiveNodeTab = targetId;
                });
            });
        }

        // --- 通用：返回節點按鈕 (針對連接線編輯) ---
        const backBtn = document.getElementById('back-to-node-btn');
        if (backBtn && lastSelectedNodeForProperties) {
            backBtn.addEventListener('click', () => {
                const nodeToReturnTo = lastSelectedNodeForProperties;
                lastSelectedNodeForProperties = null; // 清除狀態
                selectObject(nodeToReturnTo);
            });
        }

        // --- 輔助函數：高亮顯示 Link (用於 Node 面板互動) ---
        function clearLinkHighlights() {
            layer.find('.link-highlight').forEach(rect => rect.destroy());
        }

        function highlightLink(linkId) {
            const link = network.links[linkId];
            if (!link || !link.waypoints || link.waypoints.length < 2) return;

            const totalWidth = getLinkTotalWidth(link);
            const halfWidth = totalWidth / 2 + 5;
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

            const highlightRect = new Konva.Shape({
                sceneFunc: (ctx, shape) => {
                    if (leftBoundary.length < 2) return;
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
                fill: 'rgba(255, 0, 43, 0.67)',
                name: 'link-highlight',
                listening: false
            });

            layer.add(highlightRect);
            highlightRect.moveToBottom();
            layer.batchDraw();
        }

        // ============================================================
        // Type-Specific Listeners
        // ============================================================

        // --- NODE ---
        if (obj.type === 'Node') {
            // 1. [新增] 轉向比例輸入框監聽
            document.querySelectorAll('.prop-turn-ratio').forEach(input => {
                input.addEventListener('change', (e) => {
                    const fromId = e.target.dataset.from;
                    const toId = e.target.dataset.to;
                    let val = parseFloat(e.target.value);

                    // 驗證範圍 0-100
                    if (isNaN(val)) val = 0;
                    val = Math.max(0, Math.min(100, val));
                    e.target.value = val;

                    if (!obj.turningRatios) obj.turningRatios = {};
                    if (!obj.turningRatios[fromId]) obj.turningRatios[fromId] = {};

                    // 儲存為 0.0 ~ 1.0 的小數
                    obj.turningRatios[fromId][toId] = val / 100.0;
                });
            });

            // 2. [新增] 自動計算按鈕 (Auto-Calc)
            const autoCalcBtn = document.getElementById('btn-auto-calc-turns');
            if (autoCalcBtn) {
                autoCalcBtn.addEventListener('click', () => {
                    const outgoingLinks = [...obj.outgoingLinkIds];
                    const outFlows = {};
                    let totalOutFlow = 0;

                    // 步驟 A: 收集所有出口路段的偵測器流量
                    outgoingLinks.forEach(linkId => {
                        let linkFlow = 0;
                        Object.values(network.detectors).forEach(det => {
                            if (det.linkId === linkId && det.observedFlow > 0) {
                                // 取該路段上最大的流量值 (假設同路段流量一致)
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

                    // 步驟 B: 計算比例並更新 Node 資料
                    if (!obj.turningRatios) obj.turningRatios = {};

                    // 假設：所有入口的車流，都依照出口流量的比例進行分配
                    [...obj.incomingLinkIds].forEach(fromId => {
                        if (!obj.turningRatios[fromId]) obj.turningRatios[fromId] = {};

                        outgoingLinks.forEach(toId => {
                            const ratio = outFlows[toId] / totalOutFlow;
                            obj.turningRatios[fromId][toId] = ratio;
                        });
                    });

                    // 步驟 C: 更新介面
                    updatePropertiesPanel(obj);
                    alert("轉向比例已根據偵測器流量自動更新。");
                });
            }

            // 3. Traffic Light Settings
            if (!network.trafficLights[obj.id]) {
                network.trafficLights[obj.id] = { nodeId: obj.id, timeShift: 0, signalGroups: {}, schedule: [] };
            }
            document.getElementById('prop-tfl-shift').addEventListener('change', (e) => {
                network.trafficLights[obj.id].timeShift = parseInt(e.target.value, 10) || 0;
            });
            document.getElementById('edit-tfl-btn').addEventListener('click', () => showTrafficLightEditor(obj));

            // 4. Connection Group Selectors (Highlighting & Selection)
            document.querySelectorAll('.prop-group-selector').forEach(link => {
                link.addEventListener('mouseenter', (e) => {
                    const groupId = e.target.id;
                    const matches = groupId.match(/group-selector-(.+)-(.+)/);
                    if (matches) {
                        clearLinkHighlights();
                        highlightLink(matches[1]); // source
                        highlightLink(matches[2]); // dest
                    }
                });
                link.addEventListener('mouseleave', () => clearLinkHighlights());
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    clearLinkHighlights();
                    const nodeWeAreLeaving = obj;
                    // Find the konva object for this group
                    const clickedGroupShape = layer.find('.group-connection-visual').find(shape => {
                        const meta = shape.getAttr('meta');
                        return meta && `group-selector-${meta.sourceLinkId}-${meta.destLinkId}` === link.id;
                    });

                    if (clickedGroupShape) {
                        const meta = clickedGroupShape.getAttr('meta');
                        const groupObjectToSelect = {
                            id: `group_${meta.sourceLinkId}_to_${meta.destLinkId}`,
                            ...meta,
                            konvaLine: clickedGroupShape,
                        };
                        selectObject(groupObjectToSelect);
                        lastSelectedNodeForProperties = nodeWeAreLeaving;
                        updatePropertiesPanel(groupObjectToSelect);
                    }
                });
            });

            // 5. Individual Connection Selectors
            document.querySelectorAll('.prop-conn-selector').forEach(link => {
                link.addEventListener('mouseenter', (e) => {
                    const connId = e.target.id.replace('conn-selector-', '');
                    const conn = network.connections[connId];
                    if (conn && conn.konvaBezier) {
                        if (!conn.konvaBezier.getAttr('originalStroke')) {
                            conn.konvaBezier.setAttr('originalStroke', conn.konvaBezier.stroke());
                            conn.konvaBezier.setAttr('originalStrokeWidth', conn.konvaBezier.strokeWidth());
                        }
                        conn.konvaBezier.stroke('#dc3545');
                        conn.konvaBezier.strokeWidth(2);
                        layer.batchDraw();
                    }
                });
                link.addEventListener('mouseleave', (e) => {
                    const connId = e.target.id.replace('conn-selector-', '');
                    const conn = network.connections[connId];
                    if (conn && conn.konvaBezier) {
                        const originalStroke = conn.konvaBezier.getAttr('originalStroke');
                        const originalStrokeWidth = conn.konvaBezier.getAttr('originalStrokeWidth');
                        if (originalStroke) {
                            conn.konvaBezier.stroke(originalStroke);
                            conn.konvaBezier.strokeWidth(originalStrokeWidth);
                            conn.konvaBezier.setAttr('originalStroke', null);
                            conn.konvaBezier.setAttr('originalStrokeWidth', null);
                            layer.batchDraw();
                        }
                    }
                });
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const nodeWeAreLeaving = obj;
                    const connId = e.target.id.replace('conn-selector-', '');
                    const connToSelect = network.connections[connId];
                    if (connToSelect) {
                        e.target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
                        selectObject(connToSelect);
                        lastSelectedNodeForProperties = nodeWeAreLeaving;
                        updatePropertiesPanel(connToSelect);
                    }
                });
            });

            // =======================================================
            // ★★★ [請從這裡開始，貼上/替換 以下 Connection Groups 相關代碼] ★★★
            // 原本這裡可能有針對 .prop-group-selector 的監聽，請用下面的新代碼取代
            // =======================================================

            // [監聽 A] Connection Group 的 Signal Group 下拉選單
            document.querySelectorAll('.prop-group-signal-select').forEach(select => {
                // [關鍵修正] 防止點擊下拉選單時觸發任何父層事件
                select.addEventListener('click', (e) => {
                    e.stopPropagation();
                });

                // 處理數值變更
                select.addEventListener('change', (e) => {
                    e.stopPropagation(); // 變更時也阻擋冒泡
                    const connIdsToUpdate = JSON.parse(e.target.dataset.groupJson);
                    const newGroupId = e.target.value;
                    const tfl = network.trafficLights[obj.id];
                    if (!tfl) return;

                    // 從所有群組移除
                    Object.values(tfl.signalGroups).forEach(group => {
                        group.connIds = group.connIds.filter(id => !connIdsToUpdate.includes(id));
                    });

                    // 加入新群組
                    if (newGroupId && tfl.signalGroups[newGroupId]) {
                        tfl.signalGroups[newGroupId].connIds.push(...connIdsToUpdate);
                    }
                });
            });

            // [監聽 B] Edit 按鈕 (保持不變)
            document.querySelectorAll('.group-edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sourceLink = network.links[btn.dataset.source];
                    const destLink = network.links[btn.dataset.dest];

                    let targetGroupObj = null;
                    const groupShapes = layer.find('.group-connection-visual');
                    for (let shape of groupShapes) {
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

            // [監聽 C] Delete 按鈕 (保持不變)
            document.querySelectorAll('.group-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sourceId = btn.dataset.source;
                    const destId = btn.dataset.dest;

                    if (confirm(I18N.t(`Delete connection group from ${sourceId} to ${destId}?`))) {
                        let targetGroupObj = null;
                        const groupShapes = layer.find('.group-connection-visual');
                        for (let shape of groupShapes) {
                            const meta = shape.getAttr('meta');
                            if (meta && meta.sourceLinkId === sourceId && meta.destLinkId === destId) {
                                targetGroupObj = { id: shape.id(), ...meta, konvaLine: shape };
                                break;
                            }
                        }

                        if (targetGroupObj) {
                            deleteConnectionGroup(targetGroupObj);
                            updatePropertiesPanel(obj);
                        }
                    }
                });
            });

            // =======================================================
            // [新增] Flow Tab 的高亮互動 (Hover Highlight)
            // =======================================================

            // 1. 滑鼠移到 "From Link" 標題：高亮來源路段
            document.querySelectorAll('.turn-ratio-header').forEach(header => {
                header.addEventListener('mouseenter', (e) => {
                    clearLinkHighlights();
                    highlightLink(e.target.dataset.link);
                });
                header.addEventListener('mouseleave', () => {
                    clearLinkHighlights();
                });
            });

            // 2. 滑鼠移到 "To Link" 列：高亮 來源(From) 與 目的(To) 兩條路段，形成路徑視覺
            document.querySelectorAll('.turn-ratio-row').forEach(row => {
                row.addEventListener('mouseenter', (e) => {
                    // 停止冒泡，避免觸發外層 Card 的 hover (如果外層也有效果的話)
                    e.stopPropagation();

                    clearLinkHighlights();
                    highlightLink(e.target.dataset.from); // 高亮來源
                    highlightLink(e.target.dataset.to);   // 高亮目的

                    // 視覺回饋：讓該列背景變深一點點
                    e.target.style.backgroundColor = '#e2e8f0';
                });
                row.addEventListener('mouseleave', (e) => {
                    clearLinkHighlights();
                    e.target.style.backgroundColor = 'transparent';
                });
            });

            // =======================================================

            // =======================================================
            // [新增] Links Tab 的高亮互動 (Connection Groups)
            // =======================================================
            document.querySelectorAll('.connection-group-card').forEach(card => {
                card.addEventListener('mouseenter', (e) => {
                    // 清除舊高亮
                    clearLinkHighlights();

                    // 讀取這張卡片紀錄的來源與目的 Link ID
                    const srcId = e.currentTarget.dataset.source;
                    const dstId = e.currentTarget.dataset.dest;

                    // 高亮這兩條路，形成視覺路徑
                    if (srcId) highlightLink(srcId);
                    if (dstId) highlightLink(dstId);

                    // 視覺回饋：讓卡片邊框稍微明顯一點
                    e.currentTarget.style.borderColor = 'var(--primary)';
                });

                card.addEventListener('mouseleave', (e) => {
                    clearLinkHighlights();
                    // 恢復邊框
                    e.currentTarget.style.borderColor = ''; // 恢復 CSS 定義的顏色 (var(--border-light))
                });
            });
            // =======================================================

            // 6. Redraw Connections
            const redrawBtn = document.getElementById('redraw-node-connections-btn');
            if (redrawBtn) {
                redrawBtn.addEventListener('click', () => {
                    redrawNodeConnections(obj.id);
                });
            }
        }

        // --- DETECTOR (Point & Section) ---
        if (obj.type.includes('Detector')) {
            const flowInput = document.getElementById('prop-det-flow');
            if (flowInput) {
                flowInput.addEventListener('change', (e) => {
                    obj.observedFlow = parseFloat(e.target.value) || 0;
                });
            }

            const sourceCheck = document.getElementById('prop-det-is-source');
            if (sourceCheck) {
                sourceCheck.addEventListener('change', (e) => {
                    obj.isSource = e.target.checked;
                    updatePropertiesPanel(obj);
                });
            }

            // [新增] 處理權重列表的事件監聽
            if (obj.isSource) {
                // 1. 下拉選單變更 (利用事件委派或直接綁定，這裡用 id 查找)
                obj.spawnProfiles.forEach((_, idx) => {
                    const sel = document.getElementById(`det-prof-sel-${idx}`);
                    if (sel) {
                        sel.addEventListener('change', (e) => {
                            obj.spawnProfiles[idx].profileId = e.target.value;
                        });
                    }
                });

                // 2. 權重變更
                document.querySelectorAll('.det-prof-weight').forEach(input => {
                    input.addEventListener('change', (e) => {
                        const idx = parseInt(e.target.dataset.index);
                        obj.spawnProfiles[idx].weight = parseFloat(e.target.value) || 1.0;
                    });
                });

                // 3. 刪除按鈕
                document.querySelectorAll('.det-prof-del-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(e.target.dataset.index);
                        obj.spawnProfiles.splice(idx, 1);
                        updatePropertiesPanel(obj);
                    });
                });

                // 4. 新增按鈕
                const addBtn = document.getElementById('btn-add-det-profile');
                if (addBtn) {
                    addBtn.addEventListener('click', () => {
                        // 預設加入第一個可用的 profile
                        const firstKey = Object.keys(network.vehicleProfiles)[0] || 'default';
                        obj.spawnProfiles.push({ profileId: firstKey, weight: 1.0 });
                        updatePropertiesPanel(obj);
                    });
                }
            }

            // [新增] 車輛種類選擇 (如果顯示的話)
            // [重要] 確保這段監聽器存在
            const profileSelect = document.getElementById('prop-det-profile');
            if (profileSelect) {
                profileSelect.addEventListener('change', (e) => {
                    obj.spawnProfileId = e.target.value;
                });
            }

            const manageProfilesBtn = document.getElementById('btn-manage-profiles');
            if (manageProfilesBtn) {
                manageProfilesBtn.addEventListener('click', () => {
                    // 1. 建立假 Origin 以開啟 Modal
                    const dummyOrigin = { id: 'Global_Profiles', periods: [] };
                    currentModalOrigin = dummyOrigin;

                    document.getElementById('spawner-modal-title').textContent = `Global Vehicle Profiles`;

                    // 2. 顯示 Modal 並強制切換到 Profile 分頁
                    renderSpawnerProfilesTab();
                    document.getElementById('spawner-modal').style.display = 'block';

                    const profileTab = document.querySelector('.tab-link[data-tab="spawner-profiles"]');
                    const periodsTab = document.querySelector('.tab-link[data-tab="spawner-periods"]');

                    if (profileTab) {
                        profileTab.classList.add('active');
                        const tabContent = document.getElementById('spawner-profiles');
                        if (tabContent) tabContent.classList.add('active');

                        // 隱藏另一個分頁的內容
                        const periodsContent = document.getElementById('spawner-periods');
                        if (periodsContent) periodsContent.classList.remove('active');
                        const periodsTabLink = document.querySelector('.tab-link[data-tab="spawner-periods"]');
                        if (periodsTabLink) periodsTabLink.classList.remove('active');
                    }

                    if (periodsTab) periodsTab.style.display = 'none'; // 隱藏時間分頁按鈕

                    // 3. 修改 Save 按鈕行為
                    const saveBtn = document.getElementById('spawner-save-btn');

                    saveBtn.onclick = () => {
                        const profileElements = document.querySelectorAll('#spawner-profiles-list .spawner-profile-item');
                        const updatedProfiles = {};
                        profileElements.forEach(div => {
                            const newId = div.querySelector('.profile-id').value;
                            const newProfile = { id: newId };
                            div.querySelectorAll('.profile-prop').forEach(input => { newProfile[input.dataset.prop] = parseFloat(input.value); });
                            updatedProfiles[newId] = newProfile;
                        });
                        network.vehicleProfiles = updatedProfiles;

                        // 關閉視窗並恢復
                        document.getElementById('spawner-modal').style.display = 'none';
                        if (periodsTab) periodsTab.style.display = 'inline-block';
                        currentModalOrigin = null;

                        // 重新整理屬性面板以更新下拉選單
                        updatePropertiesPanel(obj);
                    };
                });
            }

            // 基本屬性監聽
            const nameInput = document.getElementById('prop-det-name');
            if (nameInput) nameInput.addEventListener('change', e => { obj.name = e.target.value; });

            const posInput = document.getElementById('prop-det-pos');
            if (posInput) posInput.addEventListener('change', e => {
                let newPos = parseFloat(e.target.value);
                if (obj.type === 'SectionDetector' && newPos < obj.length) {
                    newPos = obj.length;
                    e.target.value = newPos.toFixed(2);
                }
                obj.position = newPos;
                drawDetector(obj);
                layer.batchDraw();
            });

            if (obj.type === 'SectionDetector') {
                const lenInput = document.getElementById('prop-det-len');
                if (lenInput) lenInput.addEventListener('change', e => {
                    let newLen = parseFloat(e.target.value);
                    if (obj.position < newLen) {
                        newLen = obj.position;
                        e.target.value = newLen.toFixed(2);
                    }
                    obj.length = newLen;
                    drawDetector(obj);
                    layer.batchDraw();
                });
            }
        }

        // --- LINK ---
        if (obj.type === 'Link') {
            // [新增] 監聽名稱變更
            const nameInput = document.getElementById('prop-link-name');
            if (nameInput) {
                nameInput.addEventListener('change', (e) => {
                    obj.name = e.target.value;
                });
            }

            document.getElementById('prop-lanes').addEventListener('change', (e) => {
                const newLaneCount = parseInt(e.target.value, 10);
                const currentLaneCount = obj.lanes.length;

                if (newLaneCount > currentLaneCount) {
                    for (let i = 0; i < newLaneCount - currentLaneCount; i++) {
                        const lastLaneWidth = currentLaneCount > 0 ? obj.lanes[currentLaneCount - 1].width : LANE_WIDTH;
                        obj.lanes.push({ width: lastLaneWidth });
                    }
                } else if (newLaneCount < currentLaneCount) {
                    obj.lanes.splice(newLaneCount);
                }

                drawLink(obj);
                updateConnectionEndpoints(obj.id);
                updateFlowPointsOnLink(obj.id);
                updateAllDetectorsOnLink(obj.id);
                updateRoadSignsOnLink(obj.id);
                if (activeTool === 'connect-lanes') { showLanePorts(); }
                layer.batchDraw();
                updatePropertiesPanel(obj);
            });

            document.querySelectorAll('.prop-lane-width').forEach(input => {
                input.addEventListener('change', (e) => {
                    const laneIndex = parseInt(e.target.dataset.index, 10);
                    const newWidth = parseFloat(e.target.value);

                    if (!isNaN(newWidth) && newWidth > 0) {
                        obj.lanes[laneIndex].width = newWidth;
                        drawLink(obj);
                        updateConnectionEndpoints(obj.id);
                        updateFlowPointsOnLink(obj.id);
                        updateAllDetectorsOnLink(obj.id);
                        updateRoadSignsOnLink(obj.id);
                        if (activeTool === 'connect-lanes') { showLanePorts(); }
                        layer.batchDraw();
                        updatePropertiesPanel(obj);
                    }
                });
            });

            // 1. [新增] 分頁切換邏輯
            const tabBtns = document.querySelectorAll('.prop-tab-btn');
            const tabContents = document.querySelectorAll('.prop-tab-content');

            tabBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // 移除所有 active
                    tabBtns.forEach(b => b.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));

                    // 啟用當前
                    const targetId = btn.dataset.target;
                    btn.classList.add('active');
                    const targetContent = document.getElementById(targetId);
                    if (targetContent) targetContent.classList.add('active');

                    // 記憶狀態
                    lastActiveLinkTab = targetId;
                });
            });

            // 2. [新增] 刪除單一連接線的按鈕
            document.querySelectorAll('.btn-del-single-conn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const connId = btn.dataset.id;
                    const conn = network.connections[connId];

                    if (conn) {
                        deleteConnection(connId);
                        layer.batchDraw();
                        updatePropertiesPanel(obj);
                    }
                });
            });

            // --- [新增] 車道高亮輔助函數 ---
            function clearLaneHighlights() {
                layer.find('.lane-highlight').forEach(shape => shape.destroy());
                layer.batchDraw();
            }

            function highlightLane(link, laneIndex) {
                if (!link || !link.waypoints || link.waypoints.length < 2) return;

                // 1. 計算該車道的左右邊界偏移量
                const totalWidth = getLinkTotalWidth(link);
                let cumulativeWidth = 0;
                for (let i = 0; i < laneIndex; i++) {
                    cumulativeWidth += link.lanes[i].width;
                }
                const currentLaneWidth = link.lanes[laneIndex].width;

                // 計算相對於路中心的偏移 (Normal 指向左側，負值為右側)
                // Left Boundary (Lane Outer edge)
                const offsetLeft = (cumulativeWidth + currentLaneWidth) - totalWidth / 2;
                // Right Boundary (Lane Inner edge)
                const offsetRight = cumulativeWidth - totalWidth / 2;

                const waypoints = link.waypoints;
                const polyPointsLeft = [];
                const polyPointsRight = [];

                // 2. 遍歷路徑點生成幾何形狀
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

                    polyPointsLeft.push(add(p_curr, scale(normal, offsetLeft)));
                    polyPointsRight.push(add(p_curr, scale(normal, offsetRight)));
                }

                // 3. 繪製紅色高亮區域
                const laneShape = new Konva.Shape({
                    sceneFunc: (ctx, shape) => {
                        ctx.beginPath();
                        if (polyPointsLeft.length < 2) return;

                        // 順向繪製左邊界
                        ctx.moveTo(polyPointsLeft[0].x, polyPointsLeft[0].y);
                        for (let i = 1; i < polyPointsLeft.length; i++) {
                            ctx.lineTo(polyPointsLeft[i].x, polyPointsLeft[i].y);
                        }
                        // 逆向繪製右邊界以閉合多邊形
                        for (let i = polyPointsRight.length - 1; i >= 0; i--) {
                            ctx.lineTo(polyPointsRight[i].x, polyPointsRight[i].y);
                        }
                        ctx.closePath();
                        ctx.fillStrokeShape(shape);
                    },
                    fill: 'rgba(255, 0, 43, 0.67)', // 與 Node 高亮一致的紅色
                    name: 'lane-highlight',
                    listening: false
                });

                layer.add(laneShape);
                laneShape.moveToTop(); // 確保蓋在路面上
            }

            // --- [新增] 清單滑鼠懸停事件 ---
            document.querySelectorAll('.conn-list-item').forEach(item => {
                item.addEventListener('mouseenter', (e) => {
                    // 防止冒泡
                    e.stopPropagation();

                    const connId = item.dataset.connId;
                    const conn = network.connections[connId];
                    if (conn) {
                        const srcLink = network.links[conn.sourceLinkId];
                        const dstLink = network.links[conn.destLinkId];

                        clearLaneHighlights(); // 清除舊的

                        // 高亮來源車道
                        if (srcLink) highlightLane(srcLink, conn.sourceLaneIndex);
                        // 高亮目標車道
                        if (dstLink) highlightLane(dstLink, conn.destLaneIndex);

                        layer.batchDraw();

                        // 視覺回饋：讓卡片背景變深
                        item.style.backgroundColor = '#eef2ff';
                    }
                });

                item.addEventListener('mouseleave', (e) => {
                    clearLaneHighlights();
                    item.style.backgroundColor = ''; // 恢復背景
                });
            });
        }

        // --- CONNECTION (單一連接線) ---
        if (obj.type === 'Connection') {
            const deleteBtn = document.getElementById('prop-conn-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    // 建議加入確認對話框，避免誤刪
                    if (confirm(I18N.t(`Delete connection ${obj.id}?`))) {
                        deleteConnection(obj.id); // 呼叫刪除函數
                        deselectAll();            // 取消選取
                        layer.batchDraw();        // 重繪畫面
                    }
                });
            }
        }

        // --- CONNECTION GROUP (連接群組) ---
        if (obj.type === 'ConnectionGroup') {
            // 編輯按鈕
            const editBtn = document.getElementById('edit-group-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    const sourceLink = network.links[obj.sourceLinkId];
                    const destLink = network.links[obj.destLinkId];
                    if (sourceLink && destLink) {
                        // 取得目前滑鼠位置或螢幕中心作為彈出位置
                        const modalPos = { x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 150 };
                        showLaneRangeSelector(sourceLink, destLink, modalPos, obj);
                    }
                });
            }

            // 刪除按鈕
            const deleteGroupBtn = document.getElementById('delete-group-btn');
            if (deleteGroupBtn) {
                deleteGroupBtn.addEventListener('click', () => {
                    if (confirm(I18N.t(`Delete connection group (contains ${obj.connectionIds.length} connections)?`))) {
                        deleteConnectionGroup(obj); // 呼叫群組刪除函數
                        deselectAll();
                        layer.batchDraw();
                    }
                });
            }
        }


        // --- TRAFFIC LIGHT SIGNAL GROUP SELECTOR (For Connection/Group) ---
        const tflGroupSelect = document.getElementById('prop-tfl-group');
        if (tflGroupSelect) {
            tflGroupSelect.addEventListener('change', (e) => {
                const newGroupId = e.target.value;
                const nodeId = obj.nodeId;
                const tfl = network.trafficLights[nodeId];
                if (!tfl) return;

                const connIdsToUpdate = (obj.type === 'Connection') ? [obj.id] : obj.connectionIds;

                Object.values(tfl.signalGroups).forEach(group => {
                    group.connIds = group.connIds.filter(id => !connIdsToUpdate.includes(id));
                });

                if (newGroupId && tfl.signalGroups[newGroupId]) {
                    tfl.signalGroups[newGroupId].connIds.push(...connIdsToUpdate);
                }
            });
        }

        // --- ORIGIN ---
        if (obj.type === 'Origin') {
            document.getElementById('configure-spawner-btn').addEventListener('click', () => showSpawnerEditor(obj));
        }

        // --- ROAD SIGN ---
        if (obj.type === 'RoadSign') {
            // 類型變更
            const typeSelect = document.getElementById('prop-sign-type');
            if (typeSelect) {
                typeSelect.addEventListener('change', e => {
                    obj.signType = e.target.value;
                    // 切換速限輸入框的顯示狀態 (注意這裡改用 style.display = 'flex' 以維持排版)
                    const limitRow = document.getElementById('prop-speed-limit-row');
                    if (limitRow) {
                        limitRow.style.display = (obj.signType === 'start') ? 'flex' : 'none';
                    }
                    drawRoadSign(obj);
                    layer.batchDraw();
                });
            }

            // 速限變更
            const limitInput = document.getElementById('prop-speed-limit');
            if (limitInput) {
                limitInput.addEventListener('change', e => {
                    obj.speedLimit = parseFloat(e.target.value);
                });
            }

            // 位置變更
            const posInput = document.getElementById('prop-sign-pos');
            if (posInput) {
                posInput.addEventListener('change', e => {
                    obj.position = parseFloat(e.target.value);
                    drawRoadSign(obj);
                    layer.batchDraw();
                });
            }

            // 刪除按鈕
            const delBtn = document.getElementById('btn-delete-sign');
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    deleteRoadSign(obj.id); // 確保您有定義此函數或使用 deleteSelectedObject()
                    deselectAll();
                    layer.batchDraw();
                });
            }
        }

        // --- BACKGROUND ---
        if (obj.type === 'Background') {
            const fileBtn = document.getElementById('prop-bg-file-btn');
            const fileInput = document.getElementById('prop-bg-file-input');
            const opacityInput = document.getElementById('prop-bg-opacity');
            const scaleInput = document.getElementById('prop-bg-scale');

            fileBtn.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', (e) => {
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
                        const newWidth = image.width;
                        const newHeight = image.height;
                        obj.konvaGroup.width(newWidth);
                        obj.konvaGroup.height(newHeight);
                        obj.konvaImage.width(newWidth);
                        obj.konvaImage.height(newHeight);
                        obj.konvaBorder.width(newWidth);
                        obj.konvaBorder.height(newHeight);
                        obj.konvaGroup.scale({ x: currentScale, y: currentScale });
                        obj.width = newWidth * currentScale;
                        obj.height = newHeight * currentScale;
                        layer.batchDraw();
                    };
                };
                reader.readAsDataURL(file);
            });

            opacityInput.addEventListener('input', (e) => {
                const newOpacity = parseInt(e.target.value, 10);
                if (isNaN(newOpacity)) return;
                obj.opacity = Math.max(0, Math.min(100, newOpacity));
                obj.konvaGroup.opacity(obj.opacity / 100);
                layer.batchDraw();
            });

            scaleInput.addEventListener('change', (e) => {
                const newScale = parseFloat(e.target.value);
                if (isNaN(newScale) || newScale <= 0) return;
                obj.scale = newScale;
                obj.konvaGroup.scale({ x: newScale, y: newScale });
                layer.batchDraw();
            });
        }

        // --- OVERPASS ---
        if (obj.type === 'Overpass') {
            const swapBtn = document.getElementById('swap-overpass-btn');
            if (swapBtn) {
                swapBtn.addEventListener('click', () => {
                    const currentTop = obj.topLinkId;
                    obj.topLinkId = (currentTop === obj.linkId1) ? obj.linkId2 : obj.linkId1;
                    applyOverpassOrder(obj);
                    updateAllOverpasses();
                    layer.batchDraw();
                    updatePropertiesPanel(obj);
                });
            }
        }

        // --- PUSHPIN ---
        if (obj.type === 'Pushpin') {
            const latInput = document.getElementById('prop-pin-lat');
            const lonInput = document.getElementById('prop-pin-lon');
            const delBtn = document.getElementById('btn-delete-pin');

            if (latInput) latInput.addEventListener('change', (e) => {
                obj.lat = parseFloat(e.target.value) || 0;
                drawPushpin(obj);
                layer.batchDraw();
            });

            if (lonInput) lonInput.addEventListener('change', (e) => {
                obj.lon = parseFloat(e.target.value) || 0;
                drawPushpin(obj);
                layer.batchDraw();
            });

            if (delBtn) delBtn.addEventListener('click', () => {
                deleteSelectedObject();
            });
        }

        // --- PARKING LOT ---
        // --- PARKING LOT ---
        if (obj.type === 'ParkingLot') {
            const nameInput = document.getElementById('prop-pl-name');
            const carInput = document.getElementById('prop-pl-car');
            const motoInput = document.getElementById('prop-pl-moto');
            // [新增] 取得 DOM 元素
            const attrInput = document.getElementById('prop-pl-attr');
            // [新增] 取得 DOM 元素
            const durInput = document.getElementById('prop-pl-duration');
            const delBtn = document.getElementById('btn-delete-pl');

            if (nameInput) nameInput.addEventListener('change', (e) => { obj.name = e.target.value; });
            if (carInput) carInput.addEventListener('change', (e) => { obj.carCapacity = parseInt(e.target.value) || 0; });
            if (motoInput) motoInput.addEventListener('change', (e) => { obj.motoCapacity = parseInt(e.target.value) || 0; });

            // [新增] 監聽事件並驗證範圍 0-100
            if (attrInput) {
                attrInput.addEventListener('change', (e) => {
                    let val = parseFloat(e.target.value);
                    if (isNaN(val)) val = 0;
                    val = Math.max(0, Math.min(100, val)); // 限制範圍
                    e.target.value = val;
                    obj.attractionProb = val;
                });
            }
            // [新增] 監聽 Stay Duration 變更
            if (durInput) {
                durInput.addEventListener('change', (e) => {
                    let val = parseFloat(e.target.value);
                    if (isNaN(val) || val < 0) val = 0; // 確保非負數
                    e.target.value = val;
                    obj.stayDuration = val;
                });
            }

            if (delBtn) delBtn.addEventListener('click', () => {
                deleteParkingLot(obj.id);
                deselectAll();
                layer.batchDraw();
            });
        }

        // --- PARKING GATE ---
        if (obj.type === 'ParkingGate') {
            const typeSelect = document.getElementById('prop-gate-type');
            const rotationInput = document.getElementById('prop-gate-rotation');
            const delBtn = document.getElementById('btn-delete-gate');

            if (typeSelect) {
                typeSelect.addEventListener('change', (e) => {
                    obj.gateType = e.target.value;
                    updateGateVisual(obj);
                });
            }
            if (rotationInput) {
                rotationInput.addEventListener('change', (e) => {
                    const newRot = parseFloat(e.target.value);
                    if (!isNaN(newRot)) {
                        obj.rotation = newRot;
                        obj.konvaGroup.rotation(newRot);
                        checkGateAssociation(obj);
                        layer.batchDraw();
                    }
                });
            }
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    deleteParkingGate(obj.id);
                });
            }
        }

        if (obj.type === 'RoadMarking') {
            const typeSel = document.getElementById('prop-mark-type');
            const posIn = document.getElementById('prop-mark-pos');
            const rotIn = document.getElementById('prop-mark-rot');
            const lenIn = document.getElementById('prop-mark-len');
            const widIn = document.getElementById('prop-mark-wid');
            const delBtn = document.getElementById('btn-delete-marking');

            if (typeSel) {
                typeSel.addEventListener('change', (e) => {
                    obj.markingType = e.target.value;
                    // 類型變更可能需要重新設定預設值
                    if (obj.markingType === 'stop_line') {
                        // Stop line doesn't use length/width
                    } else if (obj.markingType === 'waiting_area') {
                        if (!obj.length) obj.length = 5;
                    } else if (obj.markingType === 'two_stage_box') {
                        if (!obj.length) obj.length = 5;
                        if (!obj.width) obj.width = 2.5;
                    }
                    drawRoadMarking(obj);
                    layer.batchDraw();
                    updatePropertiesPanel(obj); // 刷新面板顯示不同欄位
                });
            }

            if (posIn) posIn.addEventListener('change', e => { obj.position = parseFloat(e.target.value); drawRoadMarking(obj); layer.batchDraw(); });
            if (rotIn) rotIn.addEventListener('change', e => { obj.rotation = parseFloat(e.target.value); obj.konvaGroup.rotation(obj.rotation); layer.batchDraw(); });
            if (lenIn) lenIn.addEventListener('change', e => { obj.length = parseFloat(e.target.value); drawRoadMarking(obj); layer.batchDraw(); });
            if (widIn) widIn.addEventListener('change', e => { obj.width = parseFloat(e.target.value); drawRoadMarking(obj); layer.batchDraw(); });

            // Lane checkboxes
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
                });
            });

            if (delBtn) delBtn.addEventListener('click', () => {
                if (obj.konvaGroup) obj.konvaGroup.destroy();
                delete network.roadMarkings[obj.id];
                deselectAll();
                layer.batchDraw();
            });
        }

        // --- 在 attachPropertiesEventListeners 內加入 prop-mark-isfree 的處理 ---
        const isFreeCb = document.getElementById('prop-mark-isfree');

        if (isFreeCb) {
            isFreeCb.addEventListener('change', (e) => {
                const isFree = e.target.checked;
                obj.isFree = isFree;

                if (isFree) {
                    // 從「自動車道」切換到「手動自由」
                    // 關鍵：必須計算當前的視覺寬度與位置，並「固化」(Snapshot) 到物件屬性中
                    const link = network.links[obj.linkId];
                    if (link) {
                        // 1. [關鍵修正] 計算目前勾選車道的總寬度，並設為物件寬度
                        // 這樣切換後，矩形寬度就會維持原本在車道上的樣子
                        const selectedLanes = obj.laneIndices.sort((a, b) => a - b);
                        if (selectedLanes.length > 0) {
                            let totalW = 0;
                            selectedLanes.forEach(idx => {
                                if (link.lanes[idx]) {
                                    totalW += link.lanes[idx].width;
                                }
                            });
                            obj.width = totalW; // 將計算出的總寬度存入物件
                        } else {
                            // 防呆：如果沒選車道，給個預設值
                            obj.width = 2.5;
                        }

                        // 2. 計算目前的視覺中心點 (X, Y) 以便無縫接軌
                        const { point, vec } = getPointAlongPolyline(link.waypoints, obj.position);
                        const normal = getNormal(vec);
                        const linkTotalW = getLinkTotalWidth(link);

                        // 找出選取車道的中心偏移量
                        const minLane = selectedLanes[0];
                        const maxLane = selectedLanes[selectedLanes.length - 1];

                        let startW = 0;
                        for (let i = 0; i < minLane; i++) startW += link.lanes[i].width;

                        let endW = 0;
                        for (let i = 0; i <= maxLane; i++) endW += link.lanes[i].width;

                        // 計算該車道群組的中心相對於路中央的偏移
                        const centerOffset = (startW + endW) / 2 - linkTotalW / 2;

                        // 計算前緣中心
                        const frontCenter = add(point, scale(normal, centerOffset));

                        // 退後 length/2 才是矩形幾何中心 (Konva Rect 預設定位點)
                        // 注意：這裡假設 length 已經存在
                        const backVec = scale(normalize(vec), -1);
                        const centerPos = add(frontCenter, scale(backVec, (obj.length || 5) / 2));

                        // 寫入絕對座標
                        obj.x = centerPos.x;
                        obj.y = centerPos.y;

                        // 計算並寫入角度 (轉為角度制)
                        obj.rotation = Konva.Util.radToDeg(Math.atan2(vec.y, vec.x));

                        // 強制更新 Konva Group 的狀態，避免畫面跳動
                        obj.konvaGroup.position({ x: obj.x, y: obj.y });
                        obj.konvaGroup.rotation(obj.rotation);
                    }
                } else {
                    // 從「手動」切回「自動」
                    // 不需要特別做什麼，因為 drawRoadMarking 會自動改回讀取 laneIndices 和 position
                }

                // 更新狀態：重新選取(顯示/隱藏 Transformer)、重繪、更新面板(顯示 Width 欄位)
                selectObject(obj);
                drawRoadMarking(obj);
                layer.batchDraw();
                updatePropertiesPanel(obj);
            });
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
                // --- START OF VISUAL CHANGE: Revert to Line with hitStrokeWidth ---
                const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1];
                const p4 = destLink.waypoints[0];

                const groupLine = new Konva.Line({
                    points: [p1.x, p1.y, p4.x, p4.y],
                    stroke: 'darkgreen',        // The visible dark green line
                    strokeWidth: 2,             // Make it a thin line
                    name: 'group-connection-visual',
                    listening: true,            // Must be true to capture clicks
                    hitStrokeWidth: 20          // KEY: Creates a large, invisible clickable area around the line
                });
                // --- END OF VISUAL CHANGE ---

                const newMeta = {
                    type: 'ConnectionGroup', connectionIds: newConnectionIds,
                    nodeId: commonNodeId, sourceLinkId: sourceLink.id, destLinkId: destLink.id
                };
                groupLine.setAttr('meta', newMeta);
                layer.add(groupLine);

                const newGroupObject = {
                    id: `group_${newMeta.sourceLinkId}_to_${newMeta.destLinkId}`,
                    ...newMeta,
                    konvaLine: groupLine,
                };

                groupLine.moveToBottom();
                if (network.nodes[commonNodeId]) {
                    network.nodes[commonNodeId].konvaShape.moveToTop();
                }

                selectObject(newGroupObject);
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
    function showTrafficLightEditor(node) {
        currentModalNode = node;
        document.getElementById('tfl-modal-title').textContent = `Traffic Light Editor for ${node.id}`;

        if (!network.trafficLights[node.id]) {
            network.trafficLights[node.id] = { nodeId: node.id, timeShift: 0, signalGroups: {}, schedule: [] };
        }

        renderTflGroupingTab();
        renderTflPhasingTab();
        document.getElementById('traffic-light-modal').style.display = 'block';
        I18N.translateDOM(document.getElementById('traffic-light-modal'));
    }

    function renderTflGroupingTab() {
        const tflData = network.trafficLights[currentModalNode.id];
        const groupManagementDiv = document.getElementById('tfl-group-management');
        groupManagementDiv.innerHTML = '';

        Object.values(tflData.signalGroups).forEach(group => {
            const groupItem = document.createElement('div');
            groupItem.className = 'tfl-group-item';
            groupItem.innerHTML = `
                <input type="text" class="tfl-group-name-input" value="${group.id}" data-old-id="${group.id}">
                <span class="delete-group-btn" data-group-id="${group.id}" title="Delete Group">×</span>
            `;
            groupManagementDiv.appendChild(groupItem);
        });

        document.getElementById('tfl-add-group-btn').onclick = () => {
            const newGroupNameInput = document.getElementById('tfl-new-group-name');
            const name = newGroupNameInput.value.trim();
            if (name && !tflData.signalGroups[name]) {
                tflData.signalGroups[name] = { id: name, connIds: [] };
                newGroupNameInput.value = '';
                renderTflGroupingTab();
                renderTflPhasingTab();
            } else {
                alert(I18N.t('Group name is empty or already exists.'));
            }
        };

        groupManagementDiv.querySelectorAll('.tfl-group-name-input').forEach(input => {
            input.onchange = (e) => {
                const oldId = e.target.dataset.oldId;
                const newId = e.target.value.trim();
                if (newId && oldId !== newId && !tflData.signalGroups[newId]) {
                    const groupData = tflData.signalGroups[oldId];
                    groupData.id = newId;
                    delete tflData.signalGroups[oldId];
                    tflData.signalGroups[newId] = groupData;

                    // Update schedule with new group ID
                    tflData.schedule.forEach(phase => {
                        if (phase.signals[oldId]) {
                            phase.signals[newId] = phase.signals[oldId];
                            delete phase.signals[oldId];
                        }
                    });
                    renderTflGroupingTab();
                    renderTflPhasingTab();
                } else if (newId !== oldId) {
                    e.target.value = oldId; // Revert if name is invalid
                    alert('Group name is empty or already exists.');
                }
            };
        });

        groupManagementDiv.querySelectorAll('.delete-group-btn').forEach(btn => {
            btn.onclick = (e) => {
                const groupId = e.target.dataset.groupId;
                delete tflData.signalGroups[groupId];
                tflData.schedule.forEach(phase => delete phase.signals[groupId]);
                renderTflGroupingTab();
                renderTflPhasingTab();
                // Refresh properties panel if a related object is selected
                if (selectedObject && (selectedObject.type === 'Connection' || selectedObject.type === 'ConnectionGroup')) {
                    updatePropertiesPanel(selectedObject);
                }
            };
        });
    }

    function renderTflPhasingTab() {
        const tflData = network.trafficLights[currentModalNode.id];
        const tableHead = document.querySelector('#tfl-schedule-table thead');
        const tableBody = document.querySelector('#tfl-schedule-table tbody');

        tableHead.innerHTML = '';
        tableBody.innerHTML = '';

        const signalGroupIds = Object.keys(tflData.signalGroups);

        // 渲染表頭
        // --- 修正表頭生成 ---
        // 移除多餘的 inline style，讓 CSS 控制對齊
        let headerHtml = '<tr><th style="width: 100px;">Duration (s)</th>';

        // 生成多個 Group Name 表頭
        signalGroupIds.forEach(id => {
            headerHtml += `<th>${id}</th>`;
        });

        headerHtml += '<th style="width: 80px;">Actions</th></tr>';
        tableHead.innerHTML = headerHtml;

        // 渲染表格內容
        let bodyHtml = '';
        tflData.schedule.forEach((phase, phaseIndex) => {
            bodyHtml += `<tr>`;

            // Duration Input
            bodyHtml += `<td><input type="number" class="tfl-duration-input prop-input" data-phase="${phaseIndex}" value="${phase.duration}" min="1" style="text-align:center;"></td>`;

            // Signal Blocks (修改處)
            signalGroupIds.forEach(id => {
                const signal = phase.signals[id] || 'Red';
                // 將文字轉換為 CSS class
                const colorClass = `signal-${signal.toLowerCase()}`;

                bodyHtml += `<td>
                                <div class="signal-block ${colorClass}" 
                                     data-phase="${phaseIndex}" 
                                     data-group-id="${id}" 
                                     title="Current: ${signal} (Click to toggle)">
                                </div>
                             </td>`;
            });

            // Delete Button
            bodyHtml += `<td><button class="tfl-delete-phase-btn btn-danger-outline" data-phase="${phaseIndex}" style="padding: 4px 8px; font-size: 0.8rem; margin:0 auto;">Delete</button></td></tr>`;
        });
        tableBody.innerHTML = bodyHtml;

        // 綁定事件：Duration 變更
        tableBody.querySelectorAll('.tfl-duration-input').forEach(input => {
            input.onchange = (e) => {
                const phaseIndex = e.target.dataset.phase;
                tflData.schedule[phaseIndex].duration = parseInt(e.target.value, 10) || 30;
            };
        });

        // 綁定事件：點擊色塊切換燈號 (修改處)
        tableBody.querySelectorAll('.signal-block').forEach(block => {
            block.onclick = (e) => {
                const phaseIndex = e.target.dataset.phase;
                const groupId = e.target.dataset.groupId;

                // 定義切換順序：紅 -> 綠 -> 黃 -> 紅
                const signals = ['Green', 'Yellow', 'Red'];
                const currentSignal = tflData.schedule[phaseIndex].signals[groupId] || 'Red';

                // 找到下一個顏色
                // 如果目前是 Red (index -1 or 2)，下一個是 Green (index 0)
                // 如果目前是 Green (index 0)，下一個是 Yellow (index 1)
                let nextIndex = 0;
                if (currentSignal === 'Green') nextIndex = 1; // -> Yellow
                else if (currentSignal === 'Yellow') nextIndex = 2; // -> Red
                else nextIndex = 0; // -> Green (Red or undefined goes to Green)

                tflData.schedule[phaseIndex].signals[groupId] = signals[nextIndex];

                // 重新渲染以更新視圖
                renderTflPhasingTab();
            };
        });

        // 綁定事件：刪除 Phase
        tableBody.querySelectorAll('.tfl-delete-phase-btn').forEach(btn => {
            btn.onclick = (e) => {
                const phaseIndex = e.target.dataset.phase;
                tflData.schedule.splice(phaseIndex, 1);
                renderTflPhasingTab();
            };
        });

        // Add Phase 按鈕邏輯保持不變
        document.getElementById('tfl-add-phase-btn').onclick = () => {
            tflData.schedule.push({ duration: 30, signals: {} });
            renderTflPhasingTab();
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

        if (!origin.periods) { origin.periods = []; }
        if (Object.keys(network.vehicleProfiles).length === 0) {
            network.vehicleProfiles['default'] = { id: 'default', length: 4.5, width: 1.8, maxSpeed: 16.67, maxAcceleration: 1.5, comfortDeceleration: 3.0, minDistance: 2.0, desiredHeadwayTime: 1.5, };
        }

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

        periodsList.querySelectorAll('.add-prof-btn').forEach(btn => {
            btn.onclick = () => {
                spawnerData.periods = readPeriodsFromUI();
                (spawnerData.periods[btn.dataset.index].profiles ??= []).push({ profileId: 'default', weight: 1 });
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
            network.vehicleProfiles[newId] = { ...network.vehicleProfiles['default'], id: newId };
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
    function resetWorkspace() {
        deselectAll();
        layer.destroyChildren();
        gridLayer.destroyChildren();

        if (typeof measureGroup !== 'undefined') measureGroup.destroyChildren();

        network = {
            // [修正] 將導航模式預設為 HYBRID，表示同時支援 OD 路徑與轉向率
            navigationMode: 'HYBRID',
            links: {}, nodes: {}, connections: {}, detectors: {},
            vehicleProfiles: {},
            trafficLights: {}, measurements: {}, background: null,
            overpasses: {},
            pushpins: {},
            parkingLots: {},
            parkingGates: {},
            roadSigns: {}, origins: {}, destinations: {},
            roadMarkings: {}
        };
        idCounter = 0;
        selectedObject = null;
        currentModalOrigin = null;

        // [修正] 移除對 simulationModeSelect DOM 的操作
        // const modeSelect = document.getElementById('simulationModeSelect');
        // if (modeSelect) modeSelect.value = 'od_path';

        drawGrid();
        updatePropertiesPanel(null);
    }
    // 完整替換此函數
    // 完整替換 createAndLoadNetworkFromXML 函數
    function createAndLoadNetworkFromXML(xmlString) {
        stage.position({ x: 0, y: 0 });
        stage.scale({ x: 1, y: 1 });
        resetWorkspace();

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

            // --- FIX: 修正車道讀取邏輯 (深入 Segments 尋找) ---
            const laneWidths = [];
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
                    laneWidths.push(w ? parseFloat(w) : LANE_WIDTH);
                });
            }
            if (laneWidths.length === 0) laneWidths.push(LANE_WIDTH, LANE_WIDTH);
            // --- END FIX ---

            const newLink = createLink(waypoints, laneWidths);
            xmlLinkIdMap.set(xmlId, newLink.id);

            // [新增] 如果 XML 有名稱則套用，否則使用 ID
            if (xmlName) {
                newLink.name = xmlName;
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
                    // 確保是 Element 節點
                    if (signNode.nodeType !== 1) return;

                    const pos = parseFloat(getChildValue(signNode, "position"));

                    // 建立物件
                    const newSign = createRoadSign(newLink, pos);
                    // 雖然 XML 沒存 ID，但 createRoadSign 會自動產 ID，這裡確保計數器同步
                    syncIdCounter(newSign.id);

                    // 處理 Namespace (例如 tm:SpeedLimitSign -> SpeedLimitSign)
                    const tagName = signNode.localName || signNode.nodeName.split(':').pop();

                    if (tagName === 'SpeedLimitSign') {
                        const speed = parseFloat(getChildValue(signNode, "speedLimit")); // XML 是 m/s
                        newSign.signType = 'start';
                        newSign.speedLimit = speed * 3.6; // 轉回 km/h
                    } else if (tagName === 'NoSpeedLimitSign') {
                        newSign.signType = 'end';
                    }

                    // 確保視覺位置正確
                    drawRoadSign(newSign);
                });
            }
            // --- 修正結束 ---
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
                    const trGroupsEl = getChildrenByLocalName(nodeEl, "TurnTRGroups")[0];
                    let groupMap = null;
                    if (trGroupsEl) {
                        groupMap = new Map();
                        getChildrenByLocalName(trGroupsEl, "TurnTRGroup").forEach(gEl => {
                            const gId = getChildValue(gEl, "id");
                            const gName = getChildValue(gEl, "name");
                            const rulesEl = getChildrenByLocalName(gEl, "TransitionRules")[0];
                            const connIds = [];
                            if (rulesEl) {
                                getChildrenByLocalName(rulesEl, "TransitionRule").forEach(trEl => {
                                    connIds.push(getChildValue(trEl, "transitionRuleId"));
                                });
                            }
                            groupMap.set(gId, { name: gName, connXmlIds: connIds });
                        });
                    }
                    xmlNodeDataMap.set(xmlId, { groups: groupMap, turningRatios: turningRatios });
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
                                    if (nodeData && nodeData.turningRatios) {
                                        const createdNode = network.nodes[newConn.nodeId];
                                        if (createdNode) {
                                            createdNode.turningRatios = nodeData.turningRatios;
                                        }
                                    }
                                } else {
                                    newConn.nodeId = xmlNodeIdMap.get(xmlRegNodeId);
                                }

                                const geom = getChildrenByLocalName(ruleEl, "BezierCurveGeometry")[0];
                                if (geom) {
                                    const ptsContainer = getChildrenByLocalName(geom, "ReferencePoints")[0] || getChildrenByLocalName(geom, "Points")[0];
                                    if (ptsContainer) {
                                        const points = [];
                                        getChildrenByLocalName(ptsContainer, "Point").forEach(pEl => {
                                            points.push({
                                                x: parseFloat(getChildValue(pEl, "x")),
                                                y: parseFloat(getChildValue(pEl, "y")) * C_SYSTEM_Y_INVERT
                                            });
                                        });
                                        if (points.length >= 2) {
                                            newConn.bezierPoints = [points[0], points[points.length - 1]];
                                            newConn.konvaBezier.points(newConn.bezierPoints.flatMap(p => [p.x, p.y]));
                                        }
                                    }
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
            const p1 = sourceLink.waypoints[sourceLink.waypoints.length - 1];
            const p4 = destLink.waypoints[0];

            const groupLine = new Konva.Line({
                points: [p1.x, p1.y, p4.x, p4.y],
                stroke: 'darkgreen',
                strokeWidth: 2,
                name: 'group-connection-visual',
                listening: true,
                hitStrokeWidth: 20
            });
            const groupMeta = {
                type: 'ConnectionGroup',
                connectionIds: connectionsInGroup.map(c => c.id),
                nodeId: nodeId,
                sourceLinkId: sourceLink.id,
                destLinkId: destLink.id
            };
            groupLine.setAttr('meta', groupMeta);
            layer.add(groupLine);

            connectionsInGroup.forEach(conn => {
                conn.konvaBezier.visible(false);
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
                    const internalConnIds = groupInfo.connXmlIds
                        .map(xmlConnId => xmlConnIdMap.get(xmlConnId))
                        .filter(Boolean);
                    tflData.signalGroups[groupName] = { id: groupName, connIds: internalConnIds };
                });

                const scheduleEl = getChildrenByLocalName(tflEl, "Schedule")[0];
                const periodsEl = getChildrenByLocalName(scheduleEl, "TimePeriods")[0];
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
        if (Object.keys(network.vehicleProfiles).length === 0) {
            network.vehicleProfiles['default'] = { id: 'default', length: 4.5, width: 1.8, maxSpeed: 16.67, maxAcceleration: 1.5, comfortDeceleration: 3.0, minDistance: 2.0, desiredHeadwayTime: 1.5 };
        }

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
                    newPl.name = name;
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
                    det.name = name;
                    det.observedFlow = !isNaN(flowVal) ? flowVal : 0;
                    det.isSource = isSrcVal;
                    det.spawnProfiles = spawnProfiles; // <--- 將解析出的列表存入物件
                    syncIdCounter(det.id);
                } else if (tagName === 'SectionAverageTravelSpeedMeter') {
                    const len = parseFloat(getChildValue(meterEl, "sectionLength"));
                    const det = createDetector('SectionDetector', link, pos + len);
                    det.name = name;
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
        const bgEl = xmlDoc.querySelector("Background > Tile");
        if (bgEl) {
            try {
                const rectEl = getChildrenByLocalName(bgEl, "Rectangle")[0];
                const startEl = getChildrenByLocalName(rectEl, "Start")[0];
                const endEl = getChildrenByLocalName(rectEl, "End")[0];
                const startX = parseFloat(getChildValue(startEl, "x"));
                const startY = parseFloat(getChildValue(startEl, "y")) * C_SYSTEM_Y_INVERT;
                const endX = parseFloat(getChildValue(endEl, "x"));
                const endY = parseFloat(getChildValue(endEl, "y")) * C_SYSTEM_Y_INVERT;
                const saturation = parseInt(getChildValue(bgEl, "saturation"), 10);

                const imgEl = getChildrenByLocalName(bgEl, "Image")[0];
                const imageType = getChildValue(imgEl, "type");
                const binaryData = getChildValue(imgEl, "binaryData");
                const dataUrl = `data:image/${imageType.toLowerCase()};base64,${binaryData}`;

                const newBg = createBackground({ x: startX, y: startY });
                if (newBg) {
                    newBg.locked = true;
                    newBg.width = Math.abs(endX - startX);
                    newBg.height = Math.abs(endY - startY);
                    newBg.opacity = saturation;
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

        // --- 13. Road Markings (Modified for IsFree & Two-Stage) ---
        const markingsContainer = xmlDoc.getElementsByTagName("RoadMarkings")[0] || xmlDoc.getElementsByTagName("tm:RoadMarkings")[0];
        if (markingsContainer) {
            getChildrenByLocalName(markingsContainer, "RoadMarking").forEach(mkEl => {
                const type = getChildValue(mkEl, "type");
                const linkXmlId = getChildValue(mkEl, "linkId");
                const nodeXmlId = getChildValue(mkEl, "nodeId");

                let parentObj = null;
                let posOrPosObj = 0;

                // 1. 決定 Parent 與初始參數
                if (linkXmlId) {
                    const internalLinkId = xmlLinkIdMap.get(linkXmlId);
                    parentObj = network.links[internalLinkId];
                    // Link 模式先讀取路徑距離 (作為 Auto 模式的基準)
                    posOrPosObj = parseFloat(getChildValue(mkEl, "position"));
                } else if (nodeXmlId) {
                    // Node 模式：簡單反查或忽略 ID 匹配 (視系統實作)，這裡主要依賴座標
                    // 為了相容性，這裡嘗試用座標尋找最近的 Node (Fallback)
                    const targetX = parseFloat(getChildValue(mkEl, "x"));
                    const targetY = parseFloat(getChildValue(mkEl, "y")) * C_SYSTEM_Y_INVERT;

                    // 嘗試找最近的 Node
                    let minDist = Infinity;
                    Object.values(network.nodes).forEach(n => {
                        const d = Math.sqrt(Math.pow(n.x - targetX, 2) + Math.pow(n.y - targetY, 2));
                        if (d < minDist) { minDist = d; parentObj = n; }
                    });

                    posOrPosObj = { x: targetX, y: targetY };
                }

                if (parentObj) {
                    // 2. 建立物件
                    const newMark = createRoadMarking(type, parentObj, posOrPosObj);

                    // 3. 讀取屬性
                    const lanesStr = getChildValue(mkEl, "laneIndices");
                    if (lanesStr) {
                        newMark.laneIndices = lanesStr.split(',').map(Number);
                    }

                    const lenVal = getChildValue(mkEl, "length");
                    if (lenVal) newMark.length = parseFloat(lenVal);

                    const widVal = getChildValue(mkEl, "width");
                    if (widVal) newMark.width = parseFloat(widVal);

                    // 4. 處理 IsFree 與絕對座標定位
                    const isFreeVal = getChildValue(mkEl, "isFree");
                    const xVal = getChildValue(mkEl, "x");
                    const yVal = getChildValue(mkEl, "y");
                    const rotVal = getChildValue(mkEl, "rotation");

                    // 如果 XML 標記為 Free，或是 Link 上的兩段式左轉 (隱含可能移動過)
                    if (isFreeVal === 'true' || (type === 'two_stage_box' && linkXmlId)) {
                        if (isFreeVal === 'true') {
                            newMark.isFree = true;
                        }

                        // 強制套用絕對座標
                        if (xVal && yVal) {
                            newMark.x = parseFloat(xVal);
                            newMark.y = parseFloat(yVal) * C_SYSTEM_Y_INVERT;
                            newMark.konvaGroup.position({ x: newMark.x, y: newMark.y });
                        }

                        if (rotVal) {
                            newMark.rotation = parseFloat(rotVal);
                            newMark.konvaGroup.rotation(newMark.rotation);
                        }
                    } else if (nodeXmlId && rotVal) {
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

        layer.batchDraw();
        updateStatusBar();
        setTool('select');
    }

    // 完整替換此函數
    // 完整替換 exportXML 函數
    function exportXML() {
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
                xml += `              <tm:Lane><tm:index>${j}</tm:index><tm:length>${linkLength.toFixed(4)}</tm:length><tm:width>${lane.width.toFixed(2)}</tm:width><tm:prevLaneIndex>-1</tm:prevLaneIndex><tm:nextLaneIndex>-1</tm:nextLaneIndex></tm:Lane>\n`;
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
                    } else {
                        xml += '              <tm:NoSpeedLimitSign>\n';
                        xml += `                <tm:position>${sign.position.toFixed(4)}</tm:position>\n`;
                        xml += '                <tm:side>Left</tm:side>\n';
                        xml += '              </tm:NoSpeedLimitSign>\n';
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

            xml += '        <tm:Waypoints>\n';
            link.waypoints.forEach((wp, index) => { xml += `          <tm:Waypoint><tm:id>${index}</tm:id><tm:x>${wp.x.toFixed(4)}</tm:x><tm:y>${(wp.y * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Waypoint>\n`; });
            xml += '        </tm:Waypoints>\n      </tm:Link>\n';
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
                    const p4 = conn.bezierPoints[1];
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
                if (tflData && tflData.signalGroups && Object.keys(tflData.signalGroups).length > 0) {
                    const groupNameToNumericId = {}; let turnTRGroupIdCounter = 0;
                    xml += '        <tm:TurnTRGroups>\n';
                    Object.values(tflData.signalGroups).forEach(group => {
                        const numericTurnTRGroupId = turnTRGroupIdCounter++; groupNameToNumericId[group.id] = numericTurnTRGroupId;
                        xml += `          <tm:TurnTRGroup><tm:id>${numericTurnTRGroupId}</tm:id><tm:name>${group.id}</tm:name>\n`;
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
                    xml += '        </tm:TurnTRGroups>\n';
                    tflGroupMappings[node.id] = groupNameToNumericId;
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

                if (numericLinkId !== undefined || numericNodeId !== undefined) {
                    xml += '      <tm:RoadMarking>\n';
                    xml += `        <tm:id>${mark.id}</tm:id>\n`;
                    xml += `        <tm:type>${mark.markingType}</tm:type>\n`;

                    // 匯出自由移動狀態
                    if (mark.isFree) {
                        xml += `        <tm:isFree>true</tm:isFree>\n`;
                    }

                    if (numericLinkId !== undefined) {
                        xml += `        <tm:linkId>${numericLinkId}</tm:linkId>\n`;
                        xml += `        <tm:position>${mark.position.toFixed(4)}</tm:position>\n`;
                        xml += `        <tm:laneIndices>${mark.laneIndices.join(',')}</tm:laneIndices>\n`;

                        // [修改重點] 如果是自由模式 OR 兩段式左轉，必須匯出絕對座標與旋轉
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

                    xml += `        <tm:length>${(mark.length || 0).toFixed(4)}</tm:length>\n`;
                    xml += `        <tm:width>${(mark.width || 0).toFixed(4)}</tm:width>\n`;
                    xml += '      </tm:RoadMarking>\n';
                }
            });
            xml += '    </tm:RoadMarkings>\n';
        }
        xml += '  </tm:RoadNetwork>\n';

        // --- 4. Agents (Traffic Control & Spawners) ---
        xml += '  <tm:Agents>\n';
        xml += '    <tm:TrafficLightNetworks>\n';
        for (const tfl of Object.values(network.trafficLights)) {
            if (!tfl.schedule || tfl.schedule.length === 0) continue;
            const nodeNumId = regularNodeIdMap.get(tfl.nodeId); if (nodeNumId === undefined) continue;
            xml += `      <tm:RegularTrafficLightNetwork><tm:regularNodeId>${nodeNumId}</tm:regularNodeId>\n`;
            const groupMap = tflGroupMappings[tfl.nodeId];
            if (groupMap) {
                xml += '        <tm:TrafficLights>\n';
                Object.entries(groupMap).forEach(([groupName, numericTurnTRGroupId]) => { xml += `          <tm:TrafficLight><tm:id>${numericTurnTRGroupId}</tm:id><tm:name>${groupName}</tm:name><tm:Placement><tm:turnTRGroupId>${numericTurnTRGroupId}</tm:turnTRGroupId></tm:Placement></tm:TrafficLight>\n`; });
                xml += '        </tm:TrafficLights>\n';
            }
            xml += `        <tm:scheduleTimeShift>${tfl.timeShift || 0}</tm:scheduleTimeShift>\n`;
            xml += '        <tm:Schedule><tm:TimePeriods>\n';
            tfl.schedule.forEach(phase => {
                xml += `          <tm:TimePeriod><tm:duration>${phase.duration}</tm:duration>\n`;
                if (groupMap) {
                    Object.values(tfl.signalGroups).forEach(group => {
                        const numericTurnTRGroupId = groupMap[group.id];
                        if (numericTurnTRGroupId !== undefined) {
                            const signal = phase.signals[group.id] || 'Red';
                            xml += `            <tm:TrafficLightSignal><tm:trafficLightId>${numericTurnTRGroupId}</tm:trafficLightId><tm:signal>${signal}</tm:signal></tm:TrafficLightSignal>\n`;
                        }
                    });
                }
                xml += '          </tm:TimePeriod>\n';
            });
            xml += '        </tm:TimePeriods></tm:Schedule>\n      </tm:RegularTrafficLightNetwork>\n';
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
        if (network.background) {
            const bg = network.background;
            const group = bg.konvaGroup;
            const startX = group.x();
            const startY = group.y();
            const width = group.width() * group.scaleX();
            const height = group.height() * group.scaleY();
            const endX = startX + width;
            const endY = startY + height;
            xml += '  <tm:Background>\n';
            xml += '    <tm:Tile>\n';
            xml += '      <tm:Rectangle>\n';
            xml += `        <tm:Start><tm:x>${startX.toFixed(4)}</tm:x><tm:y>${(startY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:Start>\n`;
            xml += `        <tm:End><tm:x>${endX.toFixed(4)}</tm:x><tm:y>${(endY * C_SYSTEM_Y_INVERT).toFixed(4)}</tm:y></tm:End>\n`;
            xml += '      </tm:Rectangle>\n';
            xml += `      <tm:saturation>${bg.opacity}</tm:saturation>\n`;
            if (bg.imageDataUrl) {
                const base64Data = bg.imageDataUrl.split(',')[1];
                xml += '      <tm:Image>\n';
                xml += `        <tm:type>${bg.imageType}</tm:type>\n`;
                xml += `        <tm:binaryData>${base64Data}</tm:binaryData>\n`;
                xml += '      </tm:Image>\n';
            }
            xml += '    </tm:Tile>\n';
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

        xml += '</tm:TrafficModel>';

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
        if (network.background) {
            alert("背景已存在，無法新增。");
            return null;
        }

        const id = 'background_0';
        const bgObject = {
            id,
            type: 'Background',
            x: pos.x,
            y: pos.y,
            width: 200,
            height: 150,
            scale: 1.0,
            opacity: 50,
            //locked: false, // 新增鎖定狀態
            imageDataUrl: null,
            imageType: null,
            konvaGroup: null,
            konvaTransformer: null
        };

        // 創建群組
        const group = new Konva.Group({
            id: id,
            x: bgObject.x,
            y: bgObject.y,
            width: bgObject.width,
            height: bgObject.height,
            draggable: true,
            name: 'background-group'
        });

        // 創建圖片物件
        const image = new Konva.Image({
            x: 0,
            y: 0,
            width: bgObject.width,
            height: bgObject.height,
            listening: true
        });

        // 創建透明背景矩形作為點擊區域
        const hitArea = new Konva.Rect({
            x: 0,
            y: 0,
            width: bgObject.width,
            height: bgObject.height,
            fill: 'rgba(0,0,0,0.01)',
            listening: true
        });

        // 創建邊框
        const border = new Konva.Rect({
            x: 0,
            y: 0,
            width: bgObject.width,
            height: bgObject.height,
            stroke: '#007bff',
            strokeWidth: 2,
            dash: [5, 5],
            listening: false
        });

        group.add(image, hitArea, border);
        layer.add(group);
        group.moveToBottom();

        // 儲存參照
        bgObject.konvaGroup = group;
        bgObject.konvaImage = image
        bgObject.konvaHitArea = hitArea
        bgObject.konvaBorder = border

        network.background = bgObject;

        // [修正] 更新工具列狀態，這會顯示 #bg-lock-section
        updateBackgroundLockState();

        return bgObject;
    }
    function deleteBackground() {
        if (!network.background) return;

        // 清理 Transformer
        if (network.background.konvaTransformer) {
            network.background.konvaTransformer.destroy();
            network.background.konvaTransformer = null;
        }

        // 清理群組
        if (network.background.konvaGroup) {
            network.background.konvaGroup.destroy();
            network.background.konvaGroup = null;
        }

        network.background = null;

        // 隱藏浮動鎖定按鈕
        updateBackgroundLockState();

        layer.batchDraw();
    }
    function initBackgroundLock() {
        // [修改] 改為選取工具列上的元素
        const lockSection = document.getElementById('bg-lock-section');
        const lockDivider = document.getElementById('bg-lock-divider');
        const lockCheckbox = document.getElementById('bg-lock-checkbox');
        const lockIcon = document.getElementById('bg-lock-icon');

        if (!lockCheckbox) return;

        lockCheckbox.addEventListener('change', (e) => {
            if (!network.background) return;

            const isLocked = e.target.checked;
            network.background.locked = isLocked;

            if (network.background.konvaGroup) {
                network.background.konvaGroup.draggable(!isLocked);
                network.background.konvaGroup.listening(!isLocked);

                // 如果有 hitArea 也要處理
                if (network.background.konvaHitArea) {
                    network.background.konvaHitArea.listening(!isLocked);
                }
            }

            // 更新圖示：鎖定時顯示鎖頭，解鎖顯示開鎖
            if (lockIcon) {
                lockIcon.className = isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
            }

            // 如果背景被鎖定且當前選中的是背景，則取消選取
            if (isLocked && selectedObject && selectedObject.id === network.background.id) {
                deselectAll();
            }

            layer.batchDraw();
        });
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

        const id = `pin_${++idCounter}`;
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
     */
    // 完整替換此函數
    function updateAllOverpasses() {
        // 1. 清理舊的 overpass 物件和 Konva 圖形
        Object.values(network.overpasses).forEach(op => {
            if (op.konvaRect) op.konvaRect.destroy();
        });
        network.overpasses = {};

        const linkIds = Object.keys(network.links);
        const checkedPairs = new Set(); // 避免重複檢查

        // 2. 遍歷所有 Link 對
        for (let i = 0; i < linkIds.length; i++) {
            for (let j = i + 1; j < linkIds.length; j++) {
                const link1 = network.links[linkIds[i]];
                const link2 = network.links[linkIds[j]];

                // --- 廣泛階段：快速篩選 ---
                // 如果外包圍盒不重疊，則直接跳過，節省效能
                if (!Konva.Util.haveIntersection(link1.konvaGroup.getClientRect(), link2.konvaGroup.getClientRect())) {
                    continue;
                }

                // --- 精確階段：多邊形交叉檢測 ---
                const traps1 = getLinkTrapeziums(link1);
                const traps2 = getLinkTrapeziums(link2);
                const allIntersectionPoints = [];

                // 遍歷兩個 Link 的所有梯形路段組合
                for (const trap1 of traps1) {
                    for (const trap2 of traps2) {

                        // 檢查 trap1 的邊是否與 trap2 的邊相交
                        for (let k = 0; k < 4; k++) {
                            for (let l = 0; l < 4; l++) {
                                const intersection = lineSegmentIntersection(
                                    trap1[k], trap1[(k + 1) % 4],
                                    trap2[l], trap2[(l + 1) % 4]
                                );
                                if (intersection) {
                                    allIntersectionPoints.push(intersection);
                                }
                            }
                        }

                        // 檢查 trap1 的頂點是否在 trap2 內部
                        for (const vertex of trap1) {
                            if (isPointInPolygon(vertex, trap2)) {
                                allIntersectionPoints.push(vertex);
                            }
                        }

                        // 檢查 trap2 的頂點是否在 trap1 內部
                        for (const vertex of trap2) {
                            if (isPointInPolygon(vertex, trap1)) {
                                allIntersectionPoints.push(vertex);
                            }
                        }
                    }
                }

                // 3. 如果找到了任何交叉點/包含點，則創建 Overpass 物件
                if (allIntersectionPoints.length > 0) {
                    // 計算所有交點的最小外包圍盒，這就是精確的紅色框範圍
                    const intersectionBox = getBoundingBoxOfPoints(allIntersectionPoints);

                    const id = `overpass_${link1.id}_${link2.id}`;

                    const rect = new Konva.Rect({
                        id: id,
                        x: intersectionBox.x,
                        y: intersectionBox.y,
                        width: intersectionBox.width,
                        height: intersectionBox.height,
                        stroke: 'red',
                        strokeWidth: 2 / stage.scaleX(), // 讓框線寬度在縮放時保持一致
                        fill: 'rgba(255, 0, 0, 0.1)',
                        listening: true,
                    });
                    layer.add(rect);

                    const overpass = {
                        id: id,
                        type: 'Overpass',
                        linkId1: link1.id,
                        linkId2: link2.id,
                        // 尋找已存在的 Overpass 資訊來決定 topLinkId，否則使用預設值
                        topLinkId: network.overpasses[id]?.topLinkId || link2.id,
                        konvaRect: rect,
                    };

                    network.overpasses[id] = overpass;
                    applyOverpassOrder(overpass);
                }
            }
        }

        // 確保所有 Overpass 框都在其對應的 Link 之上，以便點擊
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
});
