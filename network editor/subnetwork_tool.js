/**
 * subnetwork_tool.js
 * 修正版 v4：搭載精準地理投影對位演算法 (Absolute Geo-to-Canvas Transform)
 * 完美解決背景地圖接合錯位、變形與比例尺不符的問題，並標示來源圖釘。
 */

const SubNetworkTool = {
    isActive: false,
    mode: 'idle', // 'idle', 'drawing', 'selected'
    polygonPoints: [], // 儲存已確定的點[x1, y1, x2, y2, ...]
    tempPolygonLine: null,
    selectionGroup: null, 
    selectedData: {
        nodeIds: new Set(),
        linkIds: new Set(),
        otherIds: new Set()
    },
    dragStartPos: null,

    init: function() {
        window.addEventListener('keydown', (e) => {
            if (this.isActive && this.mode === 'selected') {
                if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'd')) {
                    e.preventDefault();
                    this.duplicateSelection();
                }
            }
        });
    },

    reset: function() {
        this.mode = 'idle';
        this.polygonPoints =[];
        this.selectedData = { nodeIds: new Set(), linkIds: new Set(), otherIds: new Set() };
        
        if (this.tempPolygonLine) {
            this.tempPolygonLine.destroy();
            this.tempPolygonLine = null;
        }
        if (this.selectionGroup) {
            this.selectionGroup.destroy();
            this.selectionGroup = null;
        }
        
        if (window.layer) window.layer.batchDraw();
        
        const panel = document.getElementById('properties-content');
        if(panel) panel.innerHTML = '<div class="empty-state"><p>Sub-Network Tool Active<br>Click to draw polygon<br>Double-click to finish</p></div>';
    },

    handleMouseDown: function(pos) {
        if (this.mode === 'selected') return;

        if (this.mode === 'idle' || this.mode === 'drawing') {
            this.mode = 'drawing';
            this.polygonPoints.push(pos.x, pos.y);
            
            if (!this.tempPolygonLine && window.layer) {
                this.tempPolygonLine = new Konva.Line({
                    points: this.polygonPoints,
                    stroke: '#00D2FF',
                    strokeWidth: 2,
                    closed: false,
                    dash: [10, 5],
                    listening: false
                });
                window.layer.add(this.tempPolygonLine);
            }
            if (window.layer) window.layer.batchDraw();
        }
    },

    handleMouseMove: function(pos) {
        if (this.mode === 'drawing' && this.tempPolygonLine) {
            const currentPoints =[...this.polygonPoints];
            currentPoints.push(pos.x, pos.y);
            this.tempPolygonLine.points(currentPoints);
            if (window.layer) window.layer.batchDraw();
        }
    },

    handleDoubleClick: function() {
        if (this.mode === 'drawing' && this.polygonPoints.length >= 6) { 
            this.finishSelection();
        }
    },

    finishSelection: function() {
        const poly =[];
        for(let i=0; i<this.polygonPoints.length; i+=2) {
            poly.push({x: this.polygonPoints[i], y: this.polygonPoints[i+1]});
        }

        if(this.tempPolygonLine) {
            this.tempPolygonLine.destroy();
            this.tempPolygonLine = null;
        }

        this.selectedData.nodeIds.clear();
        this.selectedData.linkIds.clear();

        if (!window.network) return;

        Object.values(window.network.nodes).forEach(node => {
            if (this.isPointInPolygon({x: node.x, y: node.y}, poly)) {
                this.selectedData.nodeIds.add(node.id);
            }
        });

        Object.values(window.network.links).forEach(link => {
            let inCount = 0;
            link.waypoints.forEach(wp => {
                if(this.isPointInPolygon(wp, poly)) inCount++;
            });
            if (inCount > 0) { 
                this.selectedData.linkIds.add(link.id);
            }
        });

        if (this.selectedData.nodeIds.size === 0 && this.selectedData.linkIds.size === 0) {
            this.reset();
            alert("No objects selected.");
            return;
        }

        this.mode = 'selected';
        this.createSelectionOverlay();
        this.updatePropertiesPanel();
    },

    createSelectionOverlay: function() {
        if (!window.network) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        this.selectedData.nodeIds.forEach(id => {
            const n = window.network.nodes[id];
            minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
        });
        this.selectedData.linkIds.forEach(id => {
            const l = window.network.links[id];
            l.waypoints.forEach(wp => {
                minX = Math.min(minX, wp.x); minY = Math.min(minY, wp.y);
                maxX = Math.max(maxX, wp.x); maxY = Math.max(maxY, wp.y);
            });
        });

        const padding = 15;
        minX -= padding; minY -= padding;
        maxX += padding; maxY += padding;

        this.selectionGroup = new Konva.Group({
            x: minX,
            y: minY,
            draggable: true,
            name: 'subnetwork-selection-group'
        });

        const rect = new Konva.Rect({
            width: maxX - minX,
            height: maxY - minY,
            stroke: '#00D2FF',
            strokeWidth: 2,
            fill: 'rgba(0, 210, 255, 0.1)',
            dash:[10, 5]
        });

        const label = new Konva.Text({
            text: `Selected: ${this.selectedData.nodeIds.size} Nodes, ${this.selectedData.linkIds.size} Links`,
            y: -25,
            fill: '#00D2FF',
            fontSize: 14,
            fontStyle: 'bold'
        });

        this.selectionGroup.add(rect, label);
        
        if (window.layer) {
            window.layer.add(this.selectionGroup);
            this.selectionGroup.moveToTop();
            window.layer.batchDraw();
        }

        this.selectionGroup.on('dragstart', () => {
            this.dragStartPos = { x: this.selectionGroup.x(), y: this.selectionGroup.y() };
        });

        this.selectionGroup.on('dragend', () => {
            const newPos = { x: this.selectionGroup.x(), y: this.selectionGroup.y() };
            const dx = newPos.x - this.dragStartPos.x;
            const dy = newPos.y - this.dragStartPos.y;
            
            this.moveNetworkData(dx, dy);
            this.dragStartPos = newPos; 
            
            if (window.saveState) window.saveState();
        });
    },

    moveNetworkData: function(dx, dy) {
        if (!window.network) return;

        this.selectedData.nodeIds.forEach(id => {
            const node = window.network.nodes[id];
            node.x += dx;
            node.y += dy;
            if(node.konvaShape) {
                node.konvaShape.position({ x: 0, y: 0 });
                node.konvaShape.clearCache();
            }
            if (window.redrawNodeConnections) window.redrawNodeConnections(id);
        });

        this.selectedData.linkIds.forEach(id => {
            const link = window.network.links[id];
            link.waypoints = link.waypoints.map(wp => ({ x: wp.x + dx, y: wp.y + dy }));
            
            if (window.drawLink) window.drawLink(link);
            if (window.updateConnectionEndpoints) window.updateConnectionEndpoints(link.id);
            if (window.updateAllDetectorsOnLink) window.updateAllDetectorsOnLink(link.id);
            if (window.updateFlowPointsOnLink) window.updateFlowPointsOnLink(link.id);
            if (window.updateRoadSignsOnLink) window.updateRoadSignsOnLink(link.id);
        });

        if (window.layer) {
            const groupLines = window.layer.find('.group-connection-visual');
            groupLines.forEach(line => {
                const meta = line.getAttr('meta');
                if (!meta) return;

                const isSourceMoved = this.selectedData.linkIds.has(meta.sourceLinkId);
                const isDestMoved = this.selectedData.linkIds.has(meta.destLinkId);

                if (isSourceMoved || isDestMoved) {
                    const srcLink = window.network.links[meta.sourceLinkId];
                    const dstLink = window.network.links[meta.destLinkId];

                    if (srcLink && dstLink && srcLink.waypoints.length > 0 && dstLink.waypoints.length > 0) {
                        const p1 = srcLink.waypoints[srcLink.waypoints.length - 1]; 
                        const p4 = dstLink.waypoints[0];
                        line.points([p1.x, p1.y, p4.x, p4.y]);
                    }
                }
            });
        }
        
        if (window.updateAllOverpasses) window.updateAllOverpasses();
        if (window.layer) window.layer.batchDraw();
    },

    duplicateSelection: function() {
        if (!window.network) return;
        if (this.selectedData.nodeIds.size === 0 && this.selectedData.linkIds.size === 0) return;

        const idMap = {};
        const connIdMap = {};
        const newNodes = new Set();
        const newLinks = new Set();
        
        const offsetX = 30; 
        const offsetY = 30;

        this.selectedData.nodeIds.forEach(oldId => {
            const oldNode = window.network.nodes[oldId];
            const newNode = window.createNode(oldNode.x + offsetX, oldNode.y + offsetY);
            idMap[oldId] = newNode.id;
            newNodes.add(newNode.id);
        });

        this.selectedData.linkIds.forEach(oldId => {
            const oldLink = window.network.links[oldId];
            const newWaypoints = oldLink.waypoints.map(wp => ({ x: wp.x + offsetX, y: wp.y + offsetY }));
            const laneData = oldLink.lanes.map(l => l.width);
            const newLink = window.createLink(newWaypoints, laneData);
            newLink.name = oldLink.name ? `${oldLink.name}_copy` : `${newLink.id}`;
            idMap[oldId] = newLink.id;
            newLinks.add(newLink.id);
        });

        this.selectedData.nodeIds.forEach(oldId => {
            const oldNode = window.network.nodes[oldId];
            const newNode = window.network.nodes[idMap[oldId]];

            oldNode.outgoingLinkIds.forEach(oldLinkId => {
                if (idMap[oldLinkId]) {
                    const newLinkId = idMap[oldLinkId];
                    newNode.outgoingLinkIds.add(newLinkId);
                    window.network.links[newLinkId].startNodeId = newNode.id; 
                }
            });

            oldNode.incomingLinkIds.forEach(oldLinkId => {
                if (idMap[oldLinkId]) {
                    const newLinkId = idMap[oldLinkId];
                    newNode.incomingLinkIds.add(newLinkId);
                    window.network.links[newLinkId].endNodeId = newNode.id;
                }
            });
        });

        Object.values(window.network.connections).forEach(conn => {
            const newSrcLinkID = idMap[conn.sourceLinkId];
            const newDstLinkID = idMap[conn.destLinkId];
            const newNodeID = idMap[conn.nodeId]; 

            if (newSrcLinkID && newDstLinkID && newNodeID) {
                const srcLinkObj = window.network.links[newSrcLinkID];
                const dstLinkObj = window.network.links[newDstLinkID];
                const nodeObj = window.network.nodes[newNodeID];

                if (window.getLanePath) {
                    const sourceLanePath = window.getLanePath(srcLinkObj, conn.sourceLaneIndex);
                    const destLanePath = window.getLanePath(dstLinkObj, conn.destLaneIndex);
                    
                    if (sourceLanePath.length > 0 && destLanePath.length > 0) {
                        const p1 = sourceLanePath[sourceLanePath.length - 1];
                        const p4 = destLanePath[0];
                        
                        const newConn = window.createConnection(
                            srcLinkObj, conn.sourceLaneIndex,
                            dstLinkObj, conn.destLaneIndex,
                            nodeObj, [p1, p4]
                        );
                        
                        connIdMap[conn.id] = newConn.id;

                        if (nodeObj) {
                            nodeObj.incomingLinkIds.add(newSrcLinkID);
                            nodeObj.outgoingLinkIds.add(newDstLinkID);
                        }
                    }
                }
            }
        });

        this.selectedData.nodeIds.forEach(oldId => {
            const oldNode = window.network.nodes[oldId];
            const newNode = window.network.nodes[idMap[oldId]];

            if (oldNode.turningRatios) {
                newNode.turningRatios = {};
                Object.keys(oldNode.turningRatios).forEach(fromLinkOldId => {
                    const fromLinkNewId = idMap[fromLinkOldId];
                    if (fromLinkNewId) {
                        newNode.turningRatios[fromLinkNewId] = {};
                        Object.keys(oldNode.turningRatios[fromLinkOldId]).forEach(toLinkOldId => {
                            const toLinkNewId = idMap[toLinkOldId];
                            if (toLinkNewId) {
                                newNode.turningRatios[fromLinkNewId][toLinkNewId] = oldNode.turningRatios[fromLinkOldId][toLinkOldId];
                            }
                        });
                    }
                });
            }
        });

        this.selectedData.nodeIds.forEach(oldId => {
            const oldTfl = window.network.trafficLights[oldId];
            if (oldTfl) {
                const newTfl = JSON.parse(JSON.stringify(oldTfl));
                newTfl.nodeId = idMap[oldId];
                
                const newSignalGroups = {};
                Object.keys(newTfl.signalGroups).forEach(groupName => {
                    const oldGroup = newTfl.signalGroups[groupName];
                    const newConnIds =[];
                    oldGroup.connIds.forEach(oldConnId => {
                        if (connIdMap[oldConnId]) newConnIds.push(connIdMap[oldConnId]);
                    });
                    if (newConnIds.length > 0) {
                        newSignalGroups[groupName] = { id: groupName, connIds: newConnIds };
                    }
                });
                
                newTfl.signalGroups = newSignalGroups;
                window.network.trafficLights[newTfl.nodeId] = newTfl;
            }
        });

        if (window.layer) {
            const existingGroupLines = window.layer.find('.group-connection-visual');
            existingGroupLines.forEach(line => {
                const meta = line.getAttr('meta');
                if (!meta || !meta.connectionIds) return;

                const newGroupConnIds =[];
                let allExist = true;

                for (let oldConnId of meta.connectionIds) {
                    if (connIdMap[oldConnId]) newGroupConnIds.push(connIdMap[oldConnId]);
                    else allExist = false; 
                }

                if (allExist && newGroupConnIds.length > 0) {
                    const newSourceLinkId = idMap[meta.sourceLinkId];
                    const newDestLinkId = idMap[meta.destLinkId];
                    const newNodeId = idMap[meta.nodeId];

                    if (newSourceLinkId && newDestLinkId && newNodeId) {
                        const srcLink = window.network.links[newSourceLinkId];
                        const dstLink = window.network.links[newDestLinkId];
                        const p1 = srcLink.waypoints[srcLink.waypoints.length - 1];
                        const p4 = dstLink.waypoints[0];

                        const groupLine = new Konva.Line({
                            points:[p1.x, p1.y, p4.x, p4.y],
                            stroke: 'darkgreen', strokeWidth: 2, hitStrokeWidth: 20,
                            name: 'group-connection-visual', listening: true,
                        });

                        const newMeta = {
                            type: 'ConnectionGroup', connectionIds: newGroupConnIds,
                            nodeId: newNodeId, sourceLinkId: newSourceLinkId, destLinkId: newDestLinkId
                        };
                        groupLine.setAttr('meta', newMeta);
                        window.layer.add(groupLine);
                        groupLine.moveToBottom();
                        
                        if (window.network.nodes[newNodeId]) {
                            window.network.nodes[newNodeId].konvaShape.moveToTop();
                        }
                    }
                }
            });
        }

        this.reset();
        this.selectedData.nodeIds = newNodes;
        this.selectedData.linkIds = newLinks;
        
        this.mode = 'selected';
        this.createSelectionOverlay();
        
        if (window.saveState) window.saveState();
        if (window.layer) window.layer.batchDraw();
    },

    isPointInPolygon: function(point, vs) {
        let x = point.x, y = point.y;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i].x, yi = vs[i].y;
            let xj = vs[j].x, yj = vs[j].y;
            let intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    // UI 控制面板
    updatePropertiesPanel: function() {
        const panel = document.getElementById('properties-content');
        if (!panel) return;
        
        panel.innerHTML = `
            <div class="prop-section-header">Sub-Network Selection</div>
            <div class="prop-group">
                <div class="prop-row">
                    <span class="prop-label">Nodes Selected</span>
                    <input type="text" class="prop-input" value="${this.selectedData.nodeIds.size}" disabled>
                </div>
                <div class="prop-row">
                    <span class="prop-label">Links Selected</span>
                    <input type="text" class="prop-input" value="${this.selectedData.linkIds.size}" disabled>
                </div>
            </div>
            <div class="prop-section-header">Actions</div>
            <button class="btn-action" id="subnet-duplicate-btn" style="width:100%; margin-bottom:10px;">
                <i class="fa-regular fa-copy"></i> Duplicate & Move
            </button>
            <div class="prop-hint" style="margin-bottom: 15px;">
                <i class="fa-solid fa-arrows-up-down-left-right"></i> Drag the blue box to move.<br>
                <i class="fa-solid fa-link"></i> Use "Connect (C)" tool to link with other networks.
            </div>

            <!-- 匯入外部路網功能 -->
            <div class="prop-section-header" style="color: #8b5cf6;">Import External Network</div>
            <button class="btn-action" id="subnet-import-btn" style="width:100%; background: #8b5cf6; margin-bottom:5px;">
                <i class="fa-solid fa-file-import"></i> Merge .sim / .xml File
            </button>
            <input type="file" id="subnet-import-input" accept=".sim,.xml" style="display:none;">
            <div class="prop-hint">
                <i class="fa-solid fa-map-pin"></i> 
                <strong>Requirement:</strong> Both current and imported networks must have exactly 2 Geo Pins (📌) set for precise spatial alignment.
            </div>
        `;
        
        const dupBtn = document.getElementById('subnet-duplicate-btn');
        if(dupBtn) dupBtn.onclick = () => this.duplicateSelection();

        // 綁定匯入事件
        const importBtn = document.getElementById('subnet-import-btn');
        const importInput = document.getElementById('subnet-import-input');
        if (importBtn && importInput) {
            importBtn.onclick = () => importInput.click();
            importInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.processImportedXML(event.target.result);
                };
                reader.readAsText(file);
                e.target.value = ''; // 歸零以便下次觸發相同檔案
            };
        }
    },

    // =========================================================================
    // 精準地理投影對位核心：無失真轉換 (Absolute Geo-to-Canvas Mercator Transform)
    // =========================================================================
    processImportedXML: function(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");

        // 1. 取得目的地網(當前)的圖釘基準點
        const currentPins = Object.values(window.network.pushpins);
        if (currentPins.length !== 2) {
            alert(I18N?.t ? I18N.t("Current network must have exactly 2 Geo Pins (Pushpins) for alignment.") : "請在當前路網放置恰好兩個座標圖釘以進行絕對對位。");
            return;
        }

        // 2. 取得來源路網(匯入)的圖釘基準點
        const importedAnchorsEl = xmlDoc.getElementsByTagName("GeoAnchors")[0] || xmlDoc.getElementsByTagName("tm:GeoAnchors")[0];
        if (!importedAnchorsEl) {
            alert(I18N?.t ? I18N.t("Imported network does not have Geo Anchors.") : "匯入的路網檔中沒有圖釘座標紀錄。");
            return;
        }
        const importedAnchorNodes = Array.from(importedAnchorsEl.children).filter(c => c.localName === 'Anchor' || c.nodeName.endsWith(':Anchor'));
        if (importedAnchorNodes.length !== 2) {
            alert(I18N?.t ? I18N.t("Imported network must have exactly 2 Geo Anchors.") : "匯入的路網檔必須恰好有兩個圖釘座標。");
            return;
        }

        const getVal = (parent, tag) => {
            const child = Array.from(parent.children).find(c => c.localName === tag || c.nodeName.endsWith(':' + tag));
            return child ? parseFloat(child.textContent) : 0;
        };

        const C_SYSTEM_Y_INVERT = -1; // 引擎內部的 Y 軸反轉參數

        // 來源圖釘 (I1, I2)
        const I1 = {
            x: getVal(importedAnchorNodes[0], "x"),
            y: getVal(importedAnchorNodes[0], "y") * C_SYSTEM_Y_INVERT, // 還原為實際向下增長的畫布座標
            lat: getVal(importedAnchorNodes[0], "lat"),
            lon: getVal(importedAnchorNodes[0], "lon")
        };
        const I2 = {
            x: getVal(importedAnchorNodes[1], "x"),
            y: getVal(importedAnchorNodes[1], "y") * C_SYSTEM_Y_INVERT,
            lat: getVal(importedAnchorNodes[1], "lat"),
            lon: getVal(importedAnchorNodes[1], "lon")
        };

        const C1 = currentPins[0];
        const C2 = currentPins[1];

        // --- 地理投影引擎 (Mercator) ---
        // 1度緯度與經度的物理長短不同，必須映射到平面直角坐標系才不會發生長寬比扭曲
        function latLonToMercator(lat, lon) {
            const R = 6378137;
            const mx = R * lon * Math.PI / 180;
            const my = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
            return { x: mx, y: my };
        }

        const cm1 = latLonToMercator(C1.lat, C1.lon);
        const cm2 = latLonToMercator(C2.lat, C2.lon);

        // 3. 絕對空間轉換引擎：任何經緯度 -> 目的畫布座標 (Current Canvas)
        function geoToCurrentCanvas(lat, lon) {
            const m = latLonToMercator(lat, lon);
            
            // Xg = mx, Yg = -my (to align with Canvas Y-down)
            const Xg1 = cm1.x, Yg1 = -cm1.y;
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

            const x = C1.x + u * dxc - v * dyc;
            const y = C1.y + u * dyc + v * dxc;

            return { x, y };
        }

        // 計算來源圖釘 I1, I2 在「目的畫布」上的實際完美應落點 T1, T2
        const T1 = geoToCurrentCanvas(I1.lat, I1.lon);
        const T2 = geoToCurrentCanvas(I2.lat, I2.lon);

        // 4. 計算畫布到畫布的仿射變換矩陣 (Canvas I -> Canvas T)
        const dxI = I2.x - I1.x;
        const dyI = I2.y - I1.y;
        const LI2 = dxI * dxI + dyI * dyI;

        const dxT = T2.x - T1.x;
        const dyT = T2.y - T1.y;

        // 計算縮放比例
        const scaleFactor = (LI2 > 0) ? Math.sqrt((dxT*dxT + dyT*dyT) / LI2) : 1;

        // 計算角度差，防手抖過濾
        let angleI = Math.atan2(dyI, dxI);
        let angleT = Math.atan2(dyT, dxT);
        let angleDiff = angleT - angleI;
        while(angleDiff > Math.PI) angleDiff -= 2*Math.PI;
        while(angleDiff < -Math.PI) angleDiff += 2*Math.PI;

        let transformPoint;

        // 【極重要防呆機制】：如果兩組圖釘的旋轉角度相差極小 (< 2度)，視為人為點擊誤差。
        // 強制歸零可保護背景圖與格線完全對齊，不發生嚴重畸變旋轉。
        if (Math.abs(angleDiff) < (2 * Math.PI / 180)) {
            angleDiff = 0; // 強制不旋轉
            transformPoint = function(xi, yi) {
                return {
                    x: T1.x + (xi - I1.x) * scaleFactor,
                    y: T1.y + (yi - I1.y) * scaleFactor
                };
            };
        } else {
            // 需要旋轉 (使用者故意放置了不同方向的圖釘)
            const cosR = Math.cos(angleDiff);
            const sinR = Math.sin(angleDiff);
            transformPoint = function(xi, yi) {
                if (LI2 === 0) return { x: T1.x + (xi - I1.x), y: T1.y + (yi - I1.y) };
                const relX = xi - I1.x;
                const relY = yi - I1.y;
                const rx = (relX * cosR - relY * sinR) * scaleFactor;
                const ry = (relX * sinR + relY * cosR) * scaleFactor;
                return { x: T1.x + rx, y: T1.y + ry };
            };
        }

        // ==========================================================
        // 5. 新增：標示原始的來源圖釘 (讓使用者明確看見對位的依據點)
        // 將來源圖釘標記為實體 Node，方便視覺對齊檢查
        // ==========================================================
        const nodesContainer = xmlDoc.getElementsByTagName("Nodes")[0] || xmlDoc.getElementsByTagName("tm:Nodes")[0];
        if (nodesContainer) {
            const createPinMarker = (pin, tPt, index) => {
                const nodeEl = xmlDoc.createElement("tm:RegularNode");
                
                const idEl = xmlDoc.createElement("tm:id");
                // 給一個保證不會衝突的隨機/巨大 ID
                idEl.textContent = "9999" + Math.floor(Math.random() * 1000) + index; 
                nodeEl.appendChild(idEl);
                
                const nameEl = xmlDoc.createElement("tm:name");
                nameEl.textContent = `📍 Imported Pin ${index} (${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)})`;
                nodeEl.appendChild(nameEl);
                
                const polyEl = xmlDoc.createElement("tm:PolygonGeometry");
                const size = 6;
                // 菱形
                const pts =[
                    {x: tPt.x, y: tPt.y - size},
                    {x: tPt.x + size, y: tPt.y},
                    {x: tPt.x, y: tPt.y + size},
                    {x: tPt.x - size, y: tPt.y}
                ];
                
                pts.forEach(p => {
                    const ptEl = xmlDoc.createElement("tm:Point");
                    const xEl = xmlDoc.createElement("tm:x");
                    xEl.textContent = p.x.toFixed(4);
                    // 標記已經處理過，避免全域掃描時被二次轉換！
                    xEl.setAttribute('data-processed', 'true'); 
                    
                    const yEl = xmlDoc.createElement("tm:y");
                    // 寫入 Y 時必須依從 XML 格式 (反轉)
                    yEl.textContent = (p.y * C_SYSTEM_Y_INVERT).toFixed(4);
                    yEl.setAttribute('data-processed', 'true');
                    
                    ptEl.appendChild(xEl);
                    ptEl.appendChild(yEl);
                    polyEl.appendChild(ptEl);
                });
                
                nodeEl.appendChild(polyEl);
                nodesContainer.appendChild(nodeEl);
            };

            // 在應落點上繪製出來源圖釘的位置
            createPinMarker(I1, T1, 1);
            createPinMarker(I2, T2, 2);
        }

        // 6. 【特製化背景圖轉換】，只移動中心並獨立縮放長寬，確保影像方正
        const bgTiles = xmlDoc.querySelectorAll("Tile, tm\\:Tile");
        bgTiles.forEach(tile => {
            const rect = Array.from(tile.children).find(c => c.localName === 'Rectangle' || c.nodeName.endsWith(':Rectangle'));
            if (rect) {
                const s = Array.from(rect.children).find(c => c.localName === 'Start' || c.nodeName.endsWith(':Start'));
                const e = Array.from(rect.children).find(c => c.localName === 'End' || c.nodeName.endsWith(':End'));
                if (s && e) {
                    const sxEl = Array.from(s.children).find(c => c.localName === 'x' || c.nodeName.endsWith(':x'));
                    const syEl = Array.from(s.children).find(c => c.localName === 'y' || c.nodeName.endsWith(':y'));
                    const exEl = Array.from(e.children).find(c => c.localName === 'x' || c.nodeName.endsWith(':x'));
                    const eyEl = Array.from(e.children).find(c => c.localName === 'y' || c.nodeName.endsWith(':y'));

                    const sx = parseFloat(sxEl.textContent);
                    const sy = parseFloat(syEl.textContent) * C_SYSTEM_Y_INVERT;
                    const ex = parseFloat(exEl.textContent);
                    const ey = parseFloat(eyEl.textContent) * C_SYSTEM_Y_INVERT;

                    // 取幾何中心轉換
                    const cx = (sx + ex) / 2;
                    const cy = (sy + ey) / 2;
                    const w = Math.abs(ex - sx);
                    const h = Math.abs(ey - sy);

                    const tCenter = transformPoint(cx, cy); 
                    const newW = w * scaleFactor;
                    const newH = h * scaleFactor;

                    sxEl.textContent = (tCenter.x - newW/2).toFixed(4);
                    exEl.textContent = (tCenter.x + newW/2).toFixed(4);
                    syEl.textContent = ((tCenter.y - newH/2) * C_SYSTEM_Y_INVERT).toFixed(4);
                    eyEl.textContent = ((tCenter.y + newH/2) * C_SYSTEM_Y_INVERT).toFixed(4);

                    // 標記處理過，防止被下方第二波掃描重複轉換
                    sxEl.setAttribute('data-processed', 'true');
                    syEl.setAttribute('data-processed', 'true');
                    exEl.setAttribute('data-processed', 'true');
                    eyEl.setAttribute('data-processed', 'true');
                }
            }
        });

        // 7. 全域掃描轉換其餘所有點座標 (包含路網、號誌、多邊形)
        const allX = xmlDoc.querySelectorAll("x, tm\\:x");
        allX.forEach(xEl => {
            if (xEl.getAttribute('data-processed')) return;
            const yEl = xEl.parentNode.querySelector("y, tm\\:y");
            if (yEl) {
                const x0 = parseFloat(xEl.textContent);
                const y0 = parseFloat(yEl.textContent) * C_SYSTEM_Y_INVERT;
                const t = transformPoint(x0, y0);
                xEl.textContent = t.x.toFixed(4);
                yEl.textContent = (t.y * C_SYSTEM_Y_INVERT).toFixed(4);
                yEl.setAttribute('data-processed', 'true'); // 防呆
            }
        });

        xmlDoc.querySelectorAll("[data-processed]").forEach(el => el.removeAttribute('data-processed'));

        // 8. 將代表長度與寬度的數值進行縮放
        const scalarTags =['length', 'width', 'height', 'sectionLength', 'lateralOffset', 'radius', 'position'];
        scalarTags.forEach(tag => {
            const els = xmlDoc.querySelectorAll(`${tag}, tm\\:${tag}`);
            els.forEach(el => {
                const parent = el.parentNode;
                if (!parent) return;
                const pName = parent.localName || parent.nodeName.split(':').pop();
                // 排除真實車輛大小不該被縮放
                if (['RegularVehicle', 'VehicleProfile', 'Parameters'].includes(pName)) return;
                
                const val = parseFloat(el.textContent);
                if (!isNaN(val)) {
                    el.textContent = (val * scaleFactor).toFixed(4);
                }
            });
        });

        // 9. 若有旋轉標籤 (如 RoadMarking 的 rotation)，補上角度差
        const rotTags = ['rotation', 'tm\\:rotation'];
        rotTags.forEach(tag => {
            const els = xmlDoc.querySelectorAll(tag);
            els.forEach(el => {
                let rot = parseFloat(el.textContent) || 0;
                rot += (angleDiff * 180 / Math.PI);
                el.textContent = rot.toFixed(4);
            });
        });

        // 10. 刪除匯入檔案內的圖釘，不影響目標畫面的兩根圖釘
        importedAnchorsEl.parentNode.removeChild(importedAnchorsEl);

        // 11. 產生精確時間字首 Prefix，作為 ID 自動防衝突冠詞使用
        const now = new Date();
        const prefix = now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0') + "_";
        
        window.importPrefix = prefix;

        // 12. 將完美轉換後的 DOM 還原為字串，送入引擎解析
        const serializer = new XMLSerializer();
        const modifiedXmlString = serializer.serializeToString(xmlDoc);

        try {
            document.body.style.cursor = 'wait';
            window.createAndLoadNetworkFromXML(modifiedXmlString, true);
            alert(I18N?.t ? I18N.t("Network imported and perfectly merged via Geo-Anchors!") : "路網與背景圖已成功匯入並完美依地理座標對位融合！");
        } catch (err) {
            console.error("Merge error:", err);
            alert((I18N?.t ? I18N.t("Failed to merge network: ") : "融合發生錯誤: ") + err.message);
        } finally {
            window.importPrefix = ""; // 務必清空
            if (window.saveState) window.saveState();
            if (window.layer) window.layer.batchDraw();
            document.body.style.cursor = 'default';
        }
    }
};

window.SubNetworkTool = SubNetworkTool;