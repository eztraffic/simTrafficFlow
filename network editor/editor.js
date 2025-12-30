// --- START OF COMPLETE editor.js FILE ---

document.addEventListener('DOMContentLoaded', () => {

    // --- GLOBAL STATE & CONFIG ---
    const ENABLE_GROUP_CONNECT = true; // <--- 新增此行：設為 true 即可顯示快速連接箭頭
    const LANE_WIDTH = 3.5;
    const PORT_RADIUS = 5;
    const C_SYSTEM_Y_INVERT = -1;

    let stage, layer, gridLayer; // <-- MODIFIED: Removed measureGroup
    let activeTool = 'select';
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

    // --- DOM ELEMENTS ---
    const canvasContainer = document.getElementById('canvas-container');
    const propertiesContent = document.getElementById('properties-content');
    const statusBar = document.getElementById('status-bar');

    // --- DATA MODELS ---
    // 我們將 numLanes 參數改為 lanesOrNumLanes
    function createLink(points, lanesOrNumLanes = 2) {
        const id = `link_${++idCounter}`;
        let lanes;

        // 判斷傳入的是數字還是陣列
        if (Array.isArray(lanesOrNumLanes)) {
            // 如果是陣列，直接使用它 (從 XML 匯入時會是這種情況)
            lanes = lanesOrNumLanes.map(width => ({ width: width }));
        } else {
            // 如果是數字，像以前一樣創建陣列 (手動新增 Link 時會是這種情況)
            lanes = Array.from({ length: lanesOrNumLanes }, () => ({ width: LANE_WIDTH }));
        }

        const link = {
            id,
            type: 'Link',
            waypoints: points,
            lanes, // 使用新的 lanes 屬性
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
                obj.konvaLabel.setAttr('shadowColor', 'rgba(0, 150, 255, 1)');
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
        } else if (obj.type === 'Overpass') { // <--- 新增 Overpass 處理
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

            // 只要是 Node 模式，或 (Link 模式但開啟 Free)，就允許旋轉
            if (obj.nodeId || (obj.markingType === 'two_stage_box' && obj.isFree)) {
                const tr = new Konva.Transformer({
                    nodes: [konvaObj],
                    centeredScaling: true,
                    rotateEnabled: true,
                    resizeEnabled: false,
                    borderStroke: 'blue',
                    anchorStroke: 'blue'
                });
                layer.add(tr);
                tr.moveToTop();
                obj.konvaTransformer = tr;

                konvaObj.on('transformend', () => {
                    obj.rotation = konvaObj.rotation();
                    obj.x = konvaObj.x();
                    obj.y = konvaObj.y();
                    updatePropertiesPanel(obj);
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
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });

        // 1. 重置所有物件為不可互動狀態
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
        // 確保標線在非選取模式下不可互動
        if (network.roadMarkings) {
            Object.values(network.roadMarkings).forEach(r => r.konvaGroup.listening(false));
        }

        if (network.background) {
            network.background.konvaGroup.listening(false);
        }

        // 2. 清理臨時繪圖元素
        layer.find('.lane-port').forEach(port => port.destroy());
        if (tempShape) { tempShape.destroy(); tempShape = null; }
        if (tempMeasureText) { tempMeasureText.destroy(); tempMeasureText = null; }

        // 3. 根據選擇的工具啟用特定物件的互動
        switch (toolName) {
            case 'select':
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
                // 讓標線可被選取
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
                Object.values(network.nodes).forEach(node => node.konvaShape.listening(true));
                stage.container().style.cursor = 'pointer';
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

            // --- 新增的標線工具 ---
            case 'add-marking':
                // 開啟 Link 和 Node 的監聽，以便點擊新增
                Object.values(network.links).forEach(l => l.konvaGroup.listening(true));
                Object.values(network.nodes).forEach(n => n.konvaShape.listening(true));
                stage.container().style.cursor = 'pointer';
                break;
            // ------------------

            default:
                stage.container().style.cursor = 'default';
                break;
        }

        updateStatusBar();
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
        statusBar.textContent = text;
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

            layer.find('.lane-port, .group-connect-port, .control-point, .waypoint-handle, .measurement-handle').forEach(p => {
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
                if (activeTool !== 'add-link' && activeTool !== 'measure' && activeTool !== 'add-background' && activeTool !== 'add-pushpin' && activeTool !== 'add-parking-lot' && activeTool !== 'add-parking-gate') {
                    isPanning = true;
                    lastPointerPosition = stage.getPointerPosition();
                    stage.container().style.cursor = 'grabbing';
                    e.evt.preventDefault();
                    return;
                }
            }

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
                    || network.pushpins[group.id()];

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
        document.getElementById('toolbar').addEventListener('click', (e) => {
            if (e.target.classList.contains('tool-btn')) {
                setTool(e.target.dataset.tool);
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
                    alert("Error loading XML file. See console for details.");
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

        document.getElementById('simulationModeSelect').addEventListener('change', (e) => {
            network.navigationMode = (e.target.value === 'flow_turning') ? 'FLOW_BASED' : 'OD_BASED';
            console.log("Simulation Mode changed to:", network.navigationMode);
        });

        initModals();
        setTool('select');
        initBackgroundLock();
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

    function deleteConnection(connId) {
        const conn = network.connections[connId];
        if (!conn) return;

        // Remove from traffic light signal groups
        const tfl = network.trafficLights[conn.nodeId];
        if (tfl && tfl.signalGroups) {
            Object.values(tfl.signalGroups).forEach(group => {
                const index = group.connIds.indexOf(connId);
                if (index > -1) group.connIds.splice(index, 1);
            });
        }

        // Cleanup Konva objects
        // destroyConnectionControls(conn); // <--- 移除了此行
        conn.konvaBezier.destroy();
        delete network.connections[connId];
    }
    function deleteDetector(detId) {
        const det = network.detectors[detId];
        if (!det) return;

        det.konvaGroup.destroy();
        delete network.detectors[detId];
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
                alert("背景已存在，無法新增。請先刪除現有背景。");
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
                    if (hasOrigin) { alert(`Link ${link.id} already has an Origin.`); return; }
                    const originPosition = Math.min(5, linkLength * 0.1);
                    const newOrigin = createOrigin(link, originPosition);
                    selectObject(newOrigin);
                }
                else {
                    if (hasDestination) { alert(`Link ${link.id} already has a Destination.`); return; }
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
                alert("Parking lot must have at least 3 points.");
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

        // 步驟 1: 精準尋找候選節點
        // 只有當一個節點已經是 sourceLink 的終點，或 destLink 的起點時，它才是一個候選節點。
        // 這避免了基於距離的模糊判斷。
        const candidateNodeIds = new Set();
        Object.values(network.nodes).forEach(node => {
            // 如果 sourceLink 已經作為一個 incoming link 連接到這個 node，則此 node 為候選
            if (node.incomingLinkIds.has(sourceLink.id)) {
                candidateNodeIds.add(node.id);
            }
            // 如果 destLink 已經作為一個 outgoing link 從這個 node 出發，則此 node 亦為候選
            if (node.outgoingLinkIds.has(destLink.id)) {
                candidateNodeIds.add(node.id);
            }
        });

        let survivingNode;
        const candidatesArray = [...candidateNodeIds];

        // 步驟 2: 根據候選節點的數量決定行為
        if (candidatesArray.length === 0) {
            // --- 情況 A: 找不到任何候選節點 ---
            // 這表示我們正在創建一個全新的路口。
            const sourceLanePath = getLanePath(sourceLink, sourceMeta.laneIndex);
            const destLanePath = getLanePath(destLink, destMeta.laneIndex);
            if (sourceLanePath.length < 2 || destLanePath.length < 2) return null;

            const p1 = sourceLanePath.slice(-1)[0];
            const p4 = destLanePath[0];
            const intersectionCenter = { x: (p1.x + p4.x) / 2, y: (p1.y + p4.y) / 2 };
            survivingNode = createNode(intersectionCenter.x, intersectionCenter.y);

        } else {
            // --- 情況 B: 找到一個或多個候選節點 ---
            // 我們需要將所有候選節點合併為一個。

            // 選擇第一個候選節點作為「倖存者」
            const survivingNodeId = candidatesArray[0];
            survivingNode = network.nodes[survivingNodeId];

            // 如果有多於一個候選節點，則進行合併操作
            if (candidatesArray.length > 1) {
                for (let i = 1; i < candidatesArray.length; i++) {
                    const doomedNodeId = candidatesArray[i];
                    const doomedNode = network.nodes[doomedNodeId];
                    if (!doomedNode || doomedNodeId === survivingNodeId) continue;

                    // 1. 將被合併節點的 Link 關係轉移給倖存節點
                    doomedNode.incomingLinkIds.forEach(id => survivingNode.incomingLinkIds.add(id));
                    doomedNode.outgoingLinkIds.forEach(id => survivingNode.outgoingLinkIds.add(id));

                    // 2. 更新所有指向被合併節點的 Connection，使其指向倖存節點
                    Object.values(network.connections).forEach(conn => {
                        if (conn.nodeId === doomedNodeId) conn.nodeId = survivingNodeId;
                    });

                    // 3. 合併交通號誌資料
                    if (network.trafficLights[doomedNodeId]) {
                        if (!network.trafficLights[survivingNodeId]) {
                            // 如果倖存者沒有號誌，直接繼承
                            network.trafficLights[survivingNodeId] = network.trafficLights[doomedNodeId];
                            network.trafficLights[survivingNodeId].nodeId = survivingNodeId;
                        }
                        // (可選) 也可以在這裡實現更複雜的號誌組合併邏輯
                        delete network.trafficLights[doomedNodeId];
                    }

                    // 4. 從畫布和資料模型中刪除被合併的節點
                    doomedNode.konvaShape.destroy();
                    delete network.nodes[doomedNodeId];
                }
            }
        }
        // --- END: 全新的節點合併邏輯 ---


        // 步驟 3: 更新倖存節點的 Link 關係
        survivingNode.incomingLinkIds.add(sourceLink.id);
        survivingNode.outgoingLinkIds.add(destLink.id);

        // --- MODIFICATION: The logic for calculating bezier control points is removed ---
        const sourceLanePath = getLanePath(sourceLink, sourceMeta.laneIndex);
        const destLanePath = getLanePath(destLink, destMeta.laneIndex);
        if (sourceLanePath.length < 2 || destLanePath.length < 2) return null;

        const p1 = sourceLanePath.slice(-1)[0];
        const p4 = destLanePath[0];

        // The newConnection now takes only start and end points
        const newConnection = createConnection(sourceLink, sourceMeta.laneIndex, destLink, destMeta.laneIndex, survivingNode, [p1, p4], color);

        // 步驟 5: 強制重繪節點
        // 因為我們修改了節點的 incoming/outgoing LinkIds，這會影響其形狀。
        // 我們必須清除 Konva Shape 的快取，以強制 Konva 重新執行 drawNode()。
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
                    hitStrokeWidth: 1.0,
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
                    hitStrokeWidth: 1.0,
                    fill: null,
                    name: 'marking-shape'
                });
                marking.konvaGroup.add(rect);
            }

            marking.konvaGroup.position({ x: 0, y: 0 });
            marking.konvaGroup.rotation(0);

        } else {
            // [修改重點] 自由模式 (Node 模式 或 Link 的 Free 模式)
            // 因為旋轉角度是以「車道方向」為 X 軸：
            // Konva Rect 的 width (X軸) 應該對應標線的 length (縱深)
            // Konva Rect 的 height (Y軸) 應該對應標線的 width (橫寬)

            const rectWidth = marking.length; // 視覺上的 X 軸長度
            const rectHeight = marking.width; // 視覺上的 Y 軸長度

            const rect = new Konva.Rect({
                x: -rectWidth / 2,
                y: -rectHeight / 2,
                width: rectWidth,   // 這裡填入 length
                height: rectHeight, // 這裡填入 width
                stroke: LINE_COLOR,
                strokeWidth: STROKE_WIDTH,
                hitStrokeWidth: 1.0,
                fill: null,
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
        if (!obj) {
            propertiesContent.innerHTML = '<p>Select an element on the canvas to see its properties.</p>';
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
                content += `<div class="prop-group">
                            <label for="prop-lanes">Number of Lanes</label>
                            <input type="number" id="prop-lanes" value="${obj.lanes.length}" min="1" max="10">
                        </div>`;

                content += `<div class="prop-group" id="lane-widths-container">
                            <label>Lane Widths (m)</label>`;
                obj.lanes.forEach((lane, index) => {
                    content += `<div class="lane-width-item" style="display: flex; align-items: center; margin-bottom: 5px;">
                                <label for="prop-lane-width-${index}" style="margin-right: 10px; font-weight: normal; margin-bottom: 0;">Lane ${index + 1}:</label>
                                <input type="number" id="prop-lane-width-${index}" class="prop-lane-width" data-index="${index}" value="${lane.width.toFixed(2)}" step="0.1" min="1">
                            </div>`;
                });
                content += `</div>`;

                content += `<div class="prop-group">
                            <label>Total Width</label>
                            <p>${getLinkTotalWidth(obj).toFixed(2)} m</p>
                        </div>`;

                content += `<div class="prop-group">
                            <label>Length</label>
                            <p>${getPolylineLength(obj.waypoints).toFixed(2)} m</p>
                        </div>`;

                content += `<div class="prop-group">
                            <label>Hint</label>
                            <p>Alt + Left Click: Add a turning point to the road segment</p>
                        </div>`;
                break;

            case 'Node':
                const tflData = network.trafficLights[obj.id] || { timeShift: 0 };

                // --- [新增] 轉向邏輯設定區塊 (針對流量模式) ---
                content += `<hr><h5>🔄 Turning Logic (Flow Mode)</h5>`;
                content += `<div style="margin-bottom: 10px;">
                                <button id="btn-auto-calc-turns" class="tool-btn" style="background-color:#17a2b8; color:white; width:100%;">Auto-Calc from Detectors</button>
                                <small style="color:#666; display:block; margin-top:4px;">Uses downstream detectors to set ratios.</small>
                            </div>`;

                const incomingLinks = [...obj.incomingLinkIds];
                const outgoingLinks = [...obj.outgoingLinkIds];

                // 確保資料結構存在
                if (!obj.turningRatios) obj.turningRatios = {};

                if (incomingLinks.length > 0 && outgoingLinks.length > 0) {
                    content += `<div id="turning-ratios-container" style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; padding: 5px;">`;
                    incomingLinks.forEach(inLink => {
                        content += `<div class="turning-group" style="margin-bottom:12px; padding-bottom:8px; border-bottom:1px dashed #ccc;">`;
                        content += `<strong style="color:#333;">From Link ${inLink}:</strong>`;

                        outgoingLinks.forEach(outLink => {
                            // 取得現有比率 (0.0 ~ 1.0)，若無則預設 0
                            const ratio = (obj.turningRatios[inLink] && obj.turningRatios[inLink][outLink] !== undefined)
                                ? obj.turningRatios[inLink][outLink]
                                : 0;
                            const percent = (ratio * 100).toFixed(1);

                            content += `<div style="display:flex; align-items:center; margin-top:4px; justify-content:space-between;">
                                            <span style="font-size:0.9em;">➡ To ${outLink}:</span>
                                            <div style="display:flex; align-items:center;">
                                                <input type="number" class="prop-turn-ratio" data-from="${inLink}" data-to="${outLink}" value="${percent}" min="0" max="100" step="1" style="width:60px; text-align:right;">
                                                <span style="margin-left:4px;">%</span>
                                            </div>
                                        </div>`;
                        });
                        content += `</div>`;
                    });
                    content += `</div>`;
                } else {
                    content += `<p style="font-size:0.8em; color:grey; font-style:italic;">Add incoming & outgoing links to configure turning ratios.</p>`;
                }
                // ----------------------------------------------------

                content += `<hr><h5>🚦 Traffic Light Control</h5>`;
                content += `<div class="prop-group"><label for="prop-tfl-shift">Schedule Time Shift (sec)</label><input type="number" id="prop-tfl-shift" value="${tflData.timeShift}" min="0" step="1"></div>`;
                content += `<button id="edit-tfl-btn" class="tool-btn">Edit Traffic Light Table</button>`;

                content += `<div class="prop-group" style="margin-top:10px;"><label>Incoming Links</label><ul>${[...obj.incomingLinkIds].map(id => `<li>${id}</li>`).join('')}</ul><label>Outgoing Links</label><ul>${[...obj.outgoingLinkIds].map(id => `<li>${id}</li>`).join('')}</ul></div>`;

                // 顯示關聯的連接群組
                const relatedGroups = [];
                layer.find('.group-connection-visual').forEach(groupShape => {
                    const meta = groupShape.getAttr('meta');
                    if (meta && meta.nodeId === obj.id) {
                        relatedGroups.push({
                            domId: `group-selector-${meta.sourceLinkId}-${meta.destLinkId}`,
                            sourceLinkId: meta.sourceLinkId,
                            destLinkId: meta.destLinkId,
                            konvaLine: groupShape
                        });
                    }
                });

                if (relatedGroups.length > 0) {
                    content += `<hr><h5>🔗 Connection Groups</h5>`;
                    content += `<ul class="prop-list">`;
                    relatedGroups.forEach(group => {
                        content += `<li><a href="#" class="prop-group-selector" id="${group.domId}" title="Select this Connection Group">From ${group.sourceLinkId} to ${group.destLinkId}</a></li>`;
                    });
                    content += `</ul>`;
                }

                // 顯示獨立連接
                const connectionsAtNode = Object.values(network.connections).filter(c => c.nodeId === obj.id);
                const groupedConnIds = new Set();
                relatedGroups.forEach(group => {
                    const meta = group.konvaLine.getAttr('meta');
                    if (meta && meta.connectionIds) {
                        meta.connectionIds.forEach(id => groupedConnIds.add(id));
                    }
                });

                const individualConnections = connectionsAtNode.filter(c => !groupedConnIds.has(c.id));

                if (individualConnections.length > 0) {
                    content += `<hr><h5>🔗 Individual Connections</h5>`;
                    content += `<ul class="prop-list">`;
                    individualConnections.forEach(conn => {
                        content += `<li><a href="#" class="prop-conn-selector" id="conn-selector-${conn.id}" title="Select this Connection">From ${conn.sourceLinkId} (L${conn.sourceLaneIndex}) → ${conn.destLinkId} (L${conn.destLaneIndex})</a></li>`;
                    });
                    content += `</ul>`;
                }
                content += `<hr><button id="redraw-node-connections-btn" class="tool-btn" style="font-size:0.85em;">🔄 Redraw Connections</button>`;
                break;

            case 'PointDetector':
            case 'SectionDetector':
                content += `<div class="prop-group"><label for="prop-det-name">Name</label><input type="text" id="prop-det-name" value="${obj.name}"></div>`;
                content += `<div class="prop-group"><label>Link</label><p>${obj.linkId}</p></div>`;
                content += `<div class="prop-group"><label for="prop-det-pos">Position (m)</label><input type="number" step="0.1" id="prop-det-pos" value="${obj.position.toFixed(2)}"></div>`;
                if (obj.type === 'SectionDetector') {
                    content += `<div class="prop-group"><label for="prop-det-len">Length (m)</label><input type="number" step="0.1" id="prop-det-len" value="${(obj.length || 0).toFixed(2)}"></div>`;
                }

                // --- [修正] 流量與車輛設定區塊 ---
                content += `<hr><h5>Flow Configuration</h5>`;
                content += `<div class="prop-group">
                                <label for="prop-det-flow" style="color:#0056b3; font-weight:bold;">Observed Flow (veh/hr)</label>
                                <input type="number" id="prop-det-flow" value="${obj.observedFlow || 0}" min="0">
                                <small style="color:#666;">Used to drive traffic generation.</small>
                            </div>`;

                content += `<div class="prop-group" style="margin-top:8px;">
                                <label style="display:flex; align-items:center; cursor:pointer;">
                                    <input type="checkbox" id="prop-det-is-source" ${obj.isSource ? 'checked' : ''} style="width:auto; margin-right:8px; cursor:pointer;">
                                    <strong>Set as Flow Source</strong>
                                </label>
                                <small style="color:#666; display:block; margin-left:24px;">Mark this detector as a boundary input.</small>
                            </div>`;

                // [新增] 這裡就是漏掉的邏輯：只有勾選為 Source 時，才渲染車輛選單
                if (obj.isSource) {
                    // 確保 vehicleProfiles 存在
                    if (!network.vehicleProfiles) network.vehicleProfiles = {};

                    const profiles = Object.keys(network.vehicleProfiles);
                    // 如果還沒定義過任何 Profile，預設加入一個 default
                    if (profiles.length === 0) {
                        network.vehicleProfiles['default'] = { id: 'default', length: 4.5, width: 1.8, maxSpeed: 16.67, maxAcceleration: 1.5, comfortDeceleration: 3.0, minDistance: 2.0, desiredHeadwayTime: 1.5 };
                        profiles.push('default');
                    }

                    const currentProfile = obj.spawnProfileId || 'default';

                    content += `<div class="prop-group" style="background-color:#f0f8ff; padding:10px; border:1px solid #cce5ff; border-radius:4px; margin-top:5px;">
                                    <label for="prop-det-profile" style="color:#004085;">Vehicle Type to Spawn:</label>
                                    <select id="prop-det-profile" style="width:100%; margin-bottom:5px;">
                                        ${profiles.map(pid => `<option value="${pid}" ${pid === currentProfile ? 'selected' : ''}>${pid}</option>`).join('')}
                                    </select>
                                    <button id="btn-manage-profiles" class="tool-btn" style="width:100%; font-size:0.85em; background-color:#6c757d; color:white;">⚙️ Manage Vehicle Types</button>
                                </div>`;
                }
                // ---------------------------
                break;

            case 'RoadSign':
                content += `<div class="prop-group"><label>On Link</label><p>${obj.linkId}</p></div>`;
                content += `<div class="prop-group"><label for="prop-sign-type">Sign Type</label>
                            <select id="prop-sign-type">
                                <option value="start" ${obj.signType === 'start' ? 'selected' : ''}>Speed Limit Start</option>
                                <option value="end" ${obj.signType === 'end' ? 'selected' : ''}>Speed Limit End</option>
                            </select>
                        </div>`;
                content += `<div class="prop-group" id="prop-speed-limit-group" style="display: ${obj.signType === 'start' ? 'block' : 'none'};">
                            <label for="prop-speed-limit">Speed Limit (km/h)</label>
                            <input type="number" id="prop-speed-limit" value="${obj.speedLimit}" min="0">
                        </div>`;
                content += `<div class="prop-group"><label for="prop-sign-pos">Position (m)</label><input type="number" step="0.1" id="prop-sign-pos" value="${obj.position.toFixed(2)}"></div>`;
                break;

            case 'Connection':
                content += `<p>From: ${obj.sourceLinkId} (Lane ${obj.sourceLaneIndex})</p><p>To: ${obj.destLinkId} (Lane ${obj.destLaneIndex})</p><p>Via: ${obj.nodeId}</p>`;
                content += `<button id="prop-conn-delete-btn" class="tool-btn" style="background-color: #dc3545; color: white; margin-top: 15px; width: 100%;">Delete Connection</button>`;
                break;

            case 'ConnectionGroup':
                content += `<p>From Link: ${obj.sourceLinkId}</p>`;
                content += `<p>To Link: ${obj.destLinkId}</p>`;
                content += `<p>Via Node: ${obj.nodeId}</p>`;
                content += `<p>Represents: <strong>${obj.connectionIds.length}</strong> individual connections.</p>`;
                content += `<div style="display: flex; gap: 10px; margin-top: 15px;">`;
                content += `<button id="edit-group-btn" class="tool-btn" style="flex: 1; background-color: #007bff; color: white;">Edit</button>`;
                content += `<button id="delete-group-btn" class="tool-btn" style="flex: 1; background-color: #dc3545; color: white;">Delete</button>`;
                content += `</div>`;
                break;

            case 'Origin':
                content += `<div class="prop-group"><label>On Link</label><p>${obj.linkId}</p></div>`;
                content += `<hr><h5>🚗 Vehicle Spawner</h5>`;
                content += `<p>Configure time-based vehicle generation (OD Mode).</p>`;
                content += `<button id="configure-spawner-btn" class="tool-btn">Configure Spawner</button>`;
                break;

            case 'Destination':
                content += `<div class="prop-group"><label>On Link</label><p>${obj.linkId}</p></div>`;
                break;

            case 'Background':
                content += `
                <div class="prop-group">
                    <button id="prop-bg-file-btn" class="tool-btn" style="width: 100%;">選擇圖片檔案</button>
                    <input type="file" id="prop-bg-file-input" style="display: none;" accept="image/jpeg,image/png,image/gif,image/bmp,image/tiff">
                </div>
                <div class="prop-group">
                    <label for="prop-bg-opacity">透明度 (%)</label>
                    <input type="number" id="prop-bg-opacity" value="${obj.opacity}" min="0" max="100" step="1">
                </div>
                <div class="prop-group">
                    <label for="prop-bg-scale">縮放</label>
                    <input type="number" id="prop-bg-scale" value="${obj.scale.toFixed(2)}" min="0.01" step="0.01">
                </div>
            `;
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
                content += `<div class="prop-group">
                                <label>Canvas X</label>
                                <input type="number" disabled value="${obj.x.toFixed(2)}">
                            </div>
                            <div class="prop-group">
                                <label>Canvas Y</label>
                                <input type="number" disabled value="${obj.y.toFixed(2)}">
                            </div>
                            <hr>
                            <div class="prop-group">
                                <label for="prop-pin-lat" style="color:red; font-weight:bold;">Latitude</label>
                                <input type="number" id="prop-pin-lat" value="${obj.lat}" step="0.000001">
                            </div>
                            <div class="prop-group">
                                <label for="prop-pin-lon" style="color:blue; font-weight:bold;">Longitude</label>
                                <input type="number" id="prop-pin-lon" value="${obj.lon}" step="0.000001">
                            </div>
                            <div class="prop-group">
                                <button id="btn-delete-pin" class="tool-btn" style="background-color: #dc3545; width:100%; margin-top:10px;">Delete Pin</button>
                            </div>`;
                break;

            case 'ParkingLot':
                content += `<div class="prop-group">
                            <label for="prop-pl-name">Name</label>
                            <input type="text" id="prop-pl-name" value="${obj.name}">
                        </div>
                        <div class="prop-group">
                            <label>ID</label>
                            <input type="text" disabled value="${obj.id}">
                        </div>
                        <div class="prop-group">
                            <label for="prop-pl-car">Car Spaces</label>
                            <input type="number" id="prop-pl-car" value="${obj.carCapacity}" min="0">
                        </div>
                        <div class="prop-group">
                            <label for="prop-pl-moto">Motorcycle Spaces</label>
                            <input type="number" id="prop-pl-moto" value="${obj.motoCapacity}" min="0">   
                        </div>
                        <!-- [新增] 吸引機率輸入框 -->
                        <div class="prop-group">
                            <label for="prop-pl-attr">Attraction Prob (%)</label>
                            <input type="number" id="prop-pl-attr" value="${obj.attractionProb || 0}" min="0" max="100" step="1">
                        </div>
                        <!-- [結束新增] -->
                        <!-- [新增] 停留時間輸入框 -->
                        <div class="prop-group">
                            <label for="prop-pl-duration">Stay Duration (min)</label>
                            <input type="number" id="prop-pl-duration" value="${obj.stayDuration || 0}" min="0" step="1">
                        </div>
                        <!-- [結束新增] -->
                        <div class="prop-group">
                            <button id="btn-delete-pl" class="tool-btn" style="background-color: #dc3545; width:100%; margin-top:10px;">Delete Parking Lot</button>
                        </div>`;
                break;

            case 'ParkingGate':
                const linkedPl = obj.parkingLotId ? network.parkingLots[obj.parkingLotId] : null;
                const statusColor = linkedPl ? 'green' : 'red';
                const statusText = linkedPl ? `Linked to: ${linkedPl.name}` : 'Not linked';

                content += `<div class="prop-group">
                                <label style="color:${statusColor}; font-weight:bold;">${statusText}</label>
                            </div>
                            <div class="prop-group">
                                <label for="prop-gate-type">Gate Type</label>
                                <select id="prop-gate-type">
                                    <option value="entry" ${obj.gateType === 'entry' ? 'selected' : ''}>Entry</option>
                                    <option value="exit" ${obj.gateType === 'exit' ? 'selected' : ''}>Exit</option>
                                    <option value="bidirectional" ${obj.gateType === 'bidirectional' ? 'selected' : ''}>Entry & Exit</option>
                                </select>
                            </div>
                            <div class="prop-group">
                                <label for="prop-gate-rotation">Rotation (deg)</label>
                                <input type="number" id="prop-gate-rotation" value="${(obj.rotation || 0).toFixed(1)}">
                            </div>
                            <div class="prop-group">
                                <button id="btn-delete-gate" class="tool-btn" style="background-color: #dc3545; width:100%; margin-top:10px;">Delete Gate</button>
                            </div>`;
                break;
            case 'RoadMarking':
                content += `<div class="prop-group">
                    <label>Marking Type</label>
                    <select id="prop-mark-type">
                        <option value="stop_line" ${obj.markingType === 'stop_line' ? 'selected' : ''}>Stop Line (停止線)</option>
                        <option value="waiting_area" ${obj.markingType === 'waiting_area' ? 'selected' : ''}>Scooter Waiting Area (機車停等區)</option>
                        <option value="two_stage_box" ${obj.markingType === 'two_stage_box' ? 'selected' : ''}>Two-Stage Turn Box (兩段式左轉)</option>
                    </select>
                </div>`;

                if (obj.linkId) {
                    content += `<div class="prop-group"><label>On Link</label><p>${obj.linkId}</p></div>`;

                    // [新增] 針對 Link 上的 Two-Stage Box，顯示「自由移動」切換開關
                    if (obj.markingType === 'two_stage_box') {
                        content += `<div class="prop-group" style="background:#fff3cd; padding:5px; border-radius:4px;">
                            <label style="display:flex; align-items:center; cursor:pointer; color:#856404;">
                                <input type="checkbox" id="prop-mark-isfree" ${obj.isFree ? 'checked' : ''} style="width:auto; margin-right:8px;">
                                <strong>Manual Position (Move to Intersection)</strong>
                            </label>
                        </div>`;
                    }

                    if (!obj.isFree) {
                        // 鎖定模式顯示 Position 和 Lane
                        content += `<div class="prop-group"><label>Position (m)</label><input type="number" step="0.5" id="prop-mark-pos" value="${obj.position.toFixed(2)}"></div>`;
                        content += `<div class="prop-group"><label>Lanes Covered</label><div style="display:flex; flex-wrap:wrap; gap:10px;">`;
                        const link = network.links[obj.linkId];
                        if (link) {
                            link.lanes.forEach((_, idx) => {
                                const checked = obj.laneIndices.includes(idx) ? 'checked' : '';
                                content += `<label style="font-weight:normal; font-size:0.9em;"><input type="checkbox" class="prop-mark-lane" value="${idx}" ${checked}> L${idx + 1}</label>`;
                            });
                        }
                        content += `</div></div>`;
                    } else {
                        // 自由模式顯示座標 (Link 模式下也可以顯示座標)
                        content += `<div class="prop-group"><label>X</label><input type="number" disabled value="${obj.x.toFixed(2)}"></div>`;
                        content += `<div class="prop-group"><label>Y</label><input type="number" disabled value="${obj.y.toFixed(2)}"></div>`;
                        content += `<div class="prop-group"><label>Rotation</label><input type="number" id="prop-mark-rot" value="${(obj.rotation || 0).toFixed(1)}"></div>`;
                    }
                }
                else if (obj.nodeId) {
                    content += `<div class="prop-group"><label>On Node</label><p>${obj.nodeId}</p></div>`;
                    content += `<div class="prop-group"><label>Rotation (deg)</label><input type="number" id="prop-mark-rot" value="${(obj.rotation || 0).toFixed(1)}"></div>`;
                }

                // Length
                if (obj.markingType !== 'stop_line') {
                    content += `<div class="prop-group"><label>Length (m)</label><input type="number" step="0.1" id="prop-mark-len" value="${obj.length}"></div>`;
                }

                // Width: 僅在 Free 模式 (Link 的自由模式 或 Node 模式) 顯示
                if (obj.markingType === 'two_stage_box' && (obj.nodeId || obj.isFree)) {
                    content += `<div class="prop-group"><label>Width (m)</label><input type="number" step="0.1" id="prop-mark-wid" value="${obj.width.toFixed(2)}"></div>`;
                }

                content += `<button id="btn-delete-marking" class="tool-btn" style="background-color: #dc3545; width:100%; margin-top:10px;">Delete Marking</button>`;
                break;
        }

        propertiesContent.innerHTML = content;
        attachPropertiesEventListeners(obj);
    }

    // 完整替換此函數
    // 完整替換 attachPropertiesEventListeners 函數
    function attachPropertiesEventListeners(obj) {
        if (!obj) return;

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
                fill: 'rgba(255, 255, 0, 0.4)',
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
            // [新增] 流量設定
            const flowInput = document.getElementById('prop-det-flow');
            if (flowInput) {
                flowInput.addEventListener('change', (e) => {
                    obj.observedFlow = parseFloat(e.target.value) || 0;
                });
            }

            // [新增] 是否為發生源 (勾選後重繪面板以顯示/隱藏 Profile 設定)
            const sourceCheck = document.getElementById('prop-det-is-source');
            if (sourceCheck) {
                sourceCheck.addEventListener('change', (e) => {
                    obj.isSource = e.target.checked;
                    updatePropertiesPanel(obj);
                });
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
        }

        // --- CONNECTION ---
        if (obj.type === 'Connection') {
            const deleteBtn = document.getElementById('prop-conn-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    deleteSelectedObject();
                });
            }
        }

        // --- CONNECTION GROUP ---
        if (obj.type === 'ConnectionGroup') {
            document.getElementById('edit-group-btn').addEventListener('click', () => {
                const sourceLink = network.links[obj.sourceLinkId];
                const destLink = network.links[obj.destLinkId];
                if (sourceLink && destLink) {
                    const modalPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                    showLaneRangeSelector(sourceLink, destLink, modalPos, obj);
                }
            });
            document.getElementById('delete-group-btn').addEventListener('click', () => {
                deleteConnectionGroup(obj);
                deselectAll();
                layer.batchDraw();
            });
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
            document.getElementById('prop-sign-type').addEventListener('change', e => {
                obj.signType = e.target.value;
                document.getElementById('prop-speed-limit-group').style.display = (obj.signType === 'start') ? 'block' : 'none';
                drawRoadSign(obj);
                layer.batchDraw();
            });
            document.getElementById('prop-speed-limit').addEventListener('change', e => {
                obj.speedLimit = parseFloat(e.target.value);
            });
            document.getElementById('prop-sign-pos').addEventListener('change', e => {
                obj.position = parseFloat(e.target.value);
                drawRoadSign(obj);
                layer.batchDraw();
            });
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
                alert('Group name is empty or already exists.');
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
        let headerHtml = '<tr><th>Duration (sec)</th>';
        signalGroupIds.forEach(id => headerHtml += `<th>${id}</th>`);
        headerHtml += '<th>Actions</th></tr>';
        tableHead.innerHTML = headerHtml;

        let bodyHtml = '';
        tflData.schedule.forEach((phase, phaseIndex) => {
            bodyHtml += `<tr>`;
            bodyHtml += `<td><input type="number" class="tfl-duration-input" data-phase="${phaseIndex}" value="${phase.duration}" min="1"></td>`;
            signalGroupIds.forEach(id => {
                const signal = phase.signals[id] || 'Red';
                bodyHtml += `<td class="signal-cell signal-${signal.toLowerCase()}" data-phase="${phaseIndex}" data-group-id="${id}">${signal}</td>`;
            });
            bodyHtml += `<td><button class="tfl-delete-phase-btn" data-phase="${phaseIndex}">Delete</button></td></tr>`;
        });
        tableBody.innerHTML = bodyHtml;

        tableBody.querySelectorAll('.tfl-duration-input').forEach(input => {
            input.onchange = (e) => {
                const phaseIndex = e.target.dataset.phase;
                tflData.schedule[phaseIndex].duration = parseInt(e.target.value, 10) || 30;
            };
        });
        tableBody.querySelectorAll('.signal-cell').forEach(cell => {
            cell.onclick = (e) => {
                const phaseIndex = e.target.dataset.phase;
                const groupId = e.target.dataset.groupId;
                const signals = ['Green', 'Yellow', 'Red'];
                const currentSignal = tflData.schedule[phaseIndex].signals[groupId] || 'Red';
                const nextSignal = signals[(signals.indexOf(currentSignal) + 1) % 3];
                tflData.schedule[phaseIndex].signals[groupId] = nextSignal;
                renderTflPhasingTab();
            };
        });
        tableBody.querySelectorAll('.tfl-delete-phase-btn').forEach(btn => {
            btn.onclick = (e) => {
                const phaseIndex = e.target.dataset.phase;
                tflData.schedule.splice(phaseIndex, 1);
                renderTflPhasingTab();
            };
        });
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
    }

    function renderSpawnerPeriodsTab() {
        const spawnerData = currentModalOrigin;
        const periodsList = document.getElementById('spawner-periods-list');

        // 輔助函數：從目前的UI讀取所有週期的設定 (包含 Destination, Profiles, 和新增的 Stops)
        const readPeriodsFromUI = () => {
            const periods = [];
            const uiPeriodElements = periodsList.querySelectorAll('.spawner-period');

            uiPeriodElements.forEach((div) => {
                const newPeriod = {
                    duration: parseInt(div.querySelector('.period-duration').value, 10) || 3600,
                    numVehicles: parseInt(div.querySelector('.period-num-vehicles').value, 10) || 100,
                    destinations: [],
                    profiles: [],
                    stops: [] // <--- 新增
                };

                // 讀取 destinations 表格
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

                // 讀取 profiles 表格
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

                // 讀取 stops (Parking) 表格 <--- 新增讀取邏輯
                div.querySelectorAll('.stops-table tbody tr').forEach(row => {
                    const select = row.cells[0].querySelector('select'); // Parking Lot ID
                    const probInput = row.cells[1].querySelector('input'); // Probability
                    const durInput = row.cells[2].querySelector('input');  // Duration

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

        // --- 核心渲染邏輯 ---
        periodsList.innerHTML = '';
        (spawnerData.periods || []).forEach((period, index) => {
            // 準備 Parking Lots 的選項
            const parkingOptions = Object.values(network.parkingLots).map(pl => pl.id);
            const parkingLabels = Object.values(network.parkingLots).map(pl => `${pl.name || pl.id}`);

            // 為了生成帶有名稱的下拉選單，我們需要自定義 generateDropdown
            const generateParkingDropdown = (id, selectedValue) => {
                if (parkingOptions.length === 0) return '<span>No Parking Lots</span>';
                let html = `<select id="${id}">`;
                parkingOptions.forEach((optId, idx) => {
                    const label = parkingLabels[idx];
                    const selected = optId === selectedValue ? 'selected' : '';
                    html += `<option value="${optId}" ${selected}>${label}</option>`;
                });
                html += `</select>`;
                return html;
            };

            const periodDiv = document.createElement('div');
            periodDiv.className = 'spawner-period';
            periodDiv.innerHTML = `<div style="display: flex; justify-content: space-between;"><h4>Period ${index + 1}</h4><button class="delete-period-btn" data-index="${index}">× Delete Period</button></div>
                <div class="spawner-grid">
                    <div><label>Duration (s)</label><input type="number" class="period-duration" data-index="${index}" value="${period.duration || 3600}"></div>
                    <div><label>Number of Vehicles</label><input type="number" class="period-num-vehicles" data-index="${index}" value="${period.numVehicles || 100}"></div>
                </div>
                <div class="spawner-grid">
                    <div>
                        <h5>Destinations</h5>
                        <table class="spawner-table dest-table" data-index="${index}">
                            <thead><tr><th>Destination</th><th>Weight</th><th></th></tr></thead>
                            <tbody>${(period.destinations || []).map((dest, d_idx) => `<tr><td>${generateDropdown(`dest-sel-${index}-${d_idx}`, Object.keys(network.destinations), dest.nodeId)}</td><td><input type="number" step="0.1" value="${dest.weight || 1}"></td><td><button class="delete-row-btn">×</button></td></tr>`).join('')}</tbody>
                        </table>
                        <button class="add-dest-btn" data-index="${index}">+ Add Destination</button>
                    </div>
                    <div>
                        <h5>Vehicle Profiles</h5>
                        <table class="spawner-table profile-table" data-index="${index}">
                            <thead><tr><th>Profile</th><th>Weight</th><th></th></tr></thead>
                            <tbody>${(period.profiles || []).map((prof, p_idx) => `<tr><td>${generateDropdown(`prof-sel-${index}-${p_idx}`, Object.keys(network.vehicleProfiles), prof.profileId)}</td><td><input type="number" step="0.1" value="${prof.weight || 1}"></td><td><button class="delete-row-btn">×</button></td></tr>`).join('')}</tbody>
                        </table>
                        <button class="add-prof-btn" data-index="${index}">+ Add Profile</button>
                    </div>
                </div>
                <!-- 新增：中途點 (Parking Stops) 區塊 -->
                <div style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 5px;">
                    <h5>Intermediate Stops (Parking Lots)</h5>
                    <table class="spawner-table stops-table" data-index="${index}" style="width: 100%;">
                        <thead><tr><th>Parking Lot</th><th>Enter Prob (%)</th><th>Duration (min)</th><th></th></tr></thead>
                        <tbody>${(period.stops || []).map((stop, s_idx) => `
                            <tr>
                                <td>${generateParkingDropdown(`stop-sel-${index}-${s_idx}`, stop.parkingLotId)}</td>
                                <td><input type="number" step="1" min="0" max="100" value="${stop.probability || 0}"></td>
                                <td><input type="number" step="1" min="0" value="${stop.duration || 0}"></td>
                                <td><button class="delete-row-btn">×</button></td>
                            </tr>
                        `).join('')}</tbody>
                    </table>
                    <button class="add-stop-btn" data-index="${index}">+ Add Parking Stop</button>
                </div>
                `;
            periodsList.appendChild(periodDiv);
        });

        // --- 事件監聽器綁定 ---

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

        // 新增：Add Stop 按鈕事件
        periodsList.querySelectorAll('.add-stop-btn').forEach(btn => {
            btn.onclick = () => {
                spawnerData.periods = readPeriodsFromUI();
                // 預設第一個停車場ID (如果有的話)
                const firstPlId = Object.keys(network.parkingLots)[0] || '';
                (spawnerData.periods[btn.dataset.index].stops ??= []).push({
                    parkingLotId: firstPlId,
                    probability: 0,
                    duration: 0
                });
                renderSpawnerPeriodsTab();
            };
        });

        periodsList.querySelectorAll('.delete-row-btn').forEach(btn => {
            btn.onclick = (e) => {
                spawnerData.periods = readPeriodsFromUI();
                const row = e.target.closest('tr');
                const table = e.target.closest('table');
                const periodIndex = table.dataset.index;
                const rowIndex = row.rowIndex - 1; // header is row 0

                if (table.classList.contains('dest-table')) {
                    (spawnerData.periods[periodIndex].destinations ??= []).splice(rowIndex, 1);
                } else if (table.classList.contains('profile-table')) {
                    (spawnerData.periods[periodIndex].profiles ??= []).splice(rowIndex, 1);
                } else if (table.classList.contains('stops-table')) {
                    // 新增：刪除 Stop
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
            profileDiv.className = 'spawner-profile-item';
            profileDiv.innerHTML = `<div style="display: flex; justify-content: space-between;"><h4>Profile: <input type="text" class="profile-id" value="${profile.id}" ${profile.id === 'default' ? 'readonly' : ''}></h4>${profile.id !== 'default' ? `<button class="delete-profile-btn" data-id="${profile.id}">×</button>` : ''}</div><div class="spawner-grid"><div><label>Length (m)</label><input type="number" step="0.1" class="profile-prop" data-prop="length" value="${profile.length}"></div><div><label>Width (m)</label><input type="number" step="0.1" class="profile-prop" data-prop="width" value="${profile.width}"></div><div><label>Max Speed (m/s)</label><input type="number" step="0.1" class="profile-prop" data-prop="maxSpeed" value="${profile.maxSpeed}"></div><div><label>Max Accel (m/s²)</label><input type="number" step="0.1" class="profile-prop" data-prop="maxAcceleration" value="${profile.maxAcceleration}"></div><div><label>Comfort Decel (m/s²)</label><input type="number" step="0.1" class="profile-prop" data-prop="comfortDeceleration" value="${profile.comfortDeceleration}"></div><div><label>Min Gap (m)</label><input type="number" step="0.1" class="profile-prop" data-prop="minDistance" value="${profile.minDistance}"></div><div><label>Headway Time (s)</label><input type="number" step="0.1" class="profile-prop" data-prop="desiredHeadwayTime" value="${profile.desiredHeadwayTime}"></div></div>`;
            profilesList.appendChild(profileDiv);
        });
        document.getElementById('spawner-add-profile-btn').onclick = () => { const newId = `profile_${Object.keys(network.vehicleProfiles).length}`; network.vehicleProfiles[newId] = { ...network.vehicleProfiles['default'], id: newId }; renderSpawnerProfilesTab(); };
        profilesList.querySelectorAll('.delete-profile-btn').forEach(btn => { btn.onclick = () => { delete network.vehicleProfiles[btn.dataset.id]; renderSpawnerProfilesTab(); }; });
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
            navigationMode: 'OD_BASED',
            links: {}, nodes: {}, connections: {}, detectors: {},
            vehicleProfiles: {},
            trafficLights: {}, measurements: {}, background: null,
            overpasses: {},
            pushpins: {},
            parkingLots: {},
            parkingGates: {},
            roadSigns: {}, origins: {}, destinations: {},
            roadMarkings: {} // <--- 新增此行
        };
        idCounter = 0;
        selectedObject = null;
        currentModalOrigin = null;

        const modeSelect = document.getElementById('simulationModeSelect');
        if (modeSelect) modeSelect.value = 'od_path';

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

        // --- 1. Links ---
        const linkElements = xmlDoc.querySelectorAll("RoadNetwork > Links > Link");
        linkElements.forEach(linkEl => {
            const xmlId = getChildValue(linkEl, "id");
            syncIdCounter(xmlId);

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

            // RoadSigns
            const signsContainer = getChildrenByLocalName(linkEl, "RoadSigns")[0];
            if (signsContainer) {
                Array.from(signsContainer.children).forEach(signNode => {
                    const pos = parseFloat(getChildValue(signNode, "position"));
                    const newSign = createRoadSign(newLink, pos);
                    syncIdCounter(newSign.id);

                    const tagName = signNode.localName || signNode.nodeName.split(':').pop();
                    if (tagName === 'SpeedLimitSign') {
                        const speed = parseFloat(getChildValue(signNode, "speedLimit"));
                        newSign.signType = 'start';
                        newSign.speedLimit = speed * 3.6;
                    } else if (tagName === 'NoSpeedLimitSign') {
                        newSign.signType = 'end';
                    }
                    drawRoadSign(newSign);
                });
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
                const flowVal = parseFloat(getChildValue(meterEl, "observedFlow"));
                const isSrcVal = getChildValue(meterEl, "isSource") === 'true';
                const profileIdVal = getChildValue(meterEl, "spawnProfileId");

                if (tagName === 'LinkAverageTravelSpeedMeter') {
                    const det = createDetector('PointDetector', link, pos);
                    det.name = name;
                    det.observedFlow = !isNaN(flowVal) ? flowVal : 0;
                    det.isSource = isSrcVal;
                    if (profileIdVal) det.spawnProfileId = profileIdVal;
                    syncIdCounter(det.id);
                } else if (tagName === 'SectionAverageTravelSpeedMeter') {
                    const len = parseFloat(getChildValue(meterEl, "sectionLength"));
                    const det = createDetector('SectionDetector', link, pos + len);
                    det.name = name;
                    det.length = len;
                    det.observedFlow = !isNaN(flowVal) ? flowVal : 0;
                    det.isSource = isSrcVal;
                    if (profileIdVal) det.spawnProfileId = profileIdVal;
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
                const modeSelect = document.getElementById('simulationModeSelect');
                if (modeSelect) {
                    modeSelect.value = (mode === 'FLOW_BASED') ? 'flow_turning' : 'od_path';
                }
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
        xml += `<tm:TrafficModel parserVersion="1.2" xmlns:tm="http://traffic.cos.ru/cossim/TrafficModelDefinitionFile0.1">\n`;

        // --- 1. Global Parameters ---
        xml += `  <tm:ModelParameters>\n`;
        xml += `    <tm:randomSeed>${Math.floor(Math.random() * 100000)}</tm:randomSeed>\n`;
        xml += `    <tm:immutableVehiclesPercent>70</tm:immutableVehiclesPercent>\n`;
        // [新增] 寫入導航模式
        xml += `    <tm:NavigationMode>${network.navigationMode || 'OD_BASED'}</tm:NavigationMode>\n`;
        xml += `  </tm:ModelParameters>\n`;

        xml += '  <tm:RoadNetwork>\n';

        // --- 2. Links ---
        xml += '    <tm:Links>\n';
        for (const link of Object.values(network.links)) {
            const numericId = linkIdMap.get(link.id);
            if (numericId === undefined) continue;
            xml += `      <tm:Link>\n`;
            xml += `        <tm:id>${numericId}</tm:id>\n`;

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

                // [新增] 匯出 observedFlow, isSource, spawnProfileId
                xml += `      <tm:observedFlow>${detector.observedFlow || 0}</tm:observedFlow>\n`;
                xml += `      <tm:isSource>${detector.isSource || false}</tm:isSource>\n`;
                if (detector.isSource && detector.spawnProfileId) {
                    xml += `      <tm:spawnProfileId>${detector.spawnProfileId}</tm:spawnProfileId>\n`;
                }

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

                // [新增] 匯出 observedFlow, isSource, spawnProfileId
                xml += `      <tm:observedFlow>${detector.observedFlow || 0}</tm:observedFlow>\n`;
                xml += `      <tm:isSource>${detector.isSource || false}</tm:isSource>\n`;
                if (detector.isSource && detector.spawnProfileId) {
                    xml += `      <tm:spawnProfileId>${detector.spawnProfileId}</tm:spawnProfileId>\n`;
                }

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

        // 顯示浮動鎖定按鈕
        const lockFloat = document.getElementById('bg-lock-float');
        if (lockFloat) {
            lockFloat.style.display = 'block';
        }

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
        const lockFloat = document.getElementById('bg-lock-float');
        const lockCheckbox = document.getElementById('bg-lock-checkbox');

        if (!lockFloat || !lockCheckbox) return;

        lockCheckbox.addEventListener('change', (e) => {
            if (!network.background) return;

            const isLocked = e.target.checked;
            network.background.locked = isLocked;

            // FIX: 直接控制 draggability 和 listening 狀態
            if (network.background.konvaGroup) {
                network.background.konvaGroup.draggable(!isLocked); // <--- 主要修正：防止拖曳
                network.background.konvaGroup.listening(!isLocked); // <--- 防止點擊和選取
                network.background.konvaHitArea.listening(!isLocked);
            }

            // 更新顯示文字
            const span = lockFloat.querySelector('span');
            if (span) {
                span.textContent = isLocked ? '🔒 背景已鎖定' : '🔓 鎖定背景';
            }

            // 如果背景被鎖定且當前選中的是背景，則取消選取
            if (isLocked && selectedObject && selectedObject.id === network.background.id) {
                deselectAll();
            }

            layer.batchDraw();
        });

        // 初始隱藏
        lockFloat.style.display = 'none';
    }
    function updateBackgroundLockState() {
        const lockFloat = document.getElementById('bg-lock-float');
        const lockCheckbox = document.getElementById('bg-lock-checkbox');

        if (!lockFloat || !lockCheckbox) return;

        if (network.background) {
            lockFloat.style.display = 'block';
            lockCheckbox.checked = network.background.locked || false;

            // 更新顯示文字
            const span = lockFloat.querySelector('span');
            if (span) {
                span.textContent = network.background.locked ? '🔒 背景已鎖定' : '🔓 鎖定背景';
            }
        } else {
            lockFloat.style.display = 'none';
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
});
