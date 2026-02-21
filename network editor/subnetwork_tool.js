/**
 * subnetwork_tool.js
 * 修正版 v2：加入滑鼠跟隨預覽線條 (Rubber-banding)
 */

const SubNetworkTool = {
    isActive: false,
    mode: 'idle', // 'idle', 'drawing', 'selected'
    polygonPoints: [], // 儲存已確定的點 [x1, y1, x2, y2, ...]
    tempPolygonLine: null,
    selectionGroup: null, 
    selectedData: {
        nodeIds: new Set(),
        linkIds: new Set(),
        otherIds: new Set()
    },
    dragStartPos: null,

    // 初始化
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

    // 清除狀態
    reset: function() {
        this.mode = 'idle';
        this.polygonPoints = [];
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

    // 處理滑鼠點擊 (加入固定點)
    handleMouseDown: function(pos) {
        if (this.mode === 'selected') return;

        // 開始繪製或加入新點
        if (this.mode === 'idle' || this.mode === 'drawing') {
            this.mode = 'drawing';
            this.polygonPoints.push(pos.x, pos.y);
            
            // 如果線條物件還不存在，建立它
            if (!this.tempPolygonLine && window.layer) {
                this.tempPolygonLine = new Konva.Line({
                    points: this.polygonPoints, // 初始只有起點
                    stroke: '#00D2FF',
                    strokeWidth: 2,
                    closed: false,
                    dash: [10, 5],
                    listening: false
                });
                window.layer.add(this.tempPolygonLine);
            }
            
            // 立即重繪，確保點擊後線條狀態正確
            if (window.layer) window.layer.batchDraw();
        }
    },

    // 處理滑鼠移動 (顯示預覽線：固定點 + 滑鼠位置)
    handleMouseMove: function(pos) {
        if (this.mode === 'drawing' && this.tempPolygonLine) {
            // 複製已確定的點
            const currentPoints = [...this.polygonPoints];
            
            // 加入當前滑鼠位置作為暫時的最後一點
            currentPoints.push(pos.x, pos.y);
            
            // 更新線條形狀
            this.tempPolygonLine.points(currentPoints);
            
            // 重繪圖層
            if (window.layer) window.layer.batchDraw();
        }
    },

    // 處理雙擊 (完成框選)
    handleDoubleClick: function() {
        // 只有當點數足夠構成多邊形時才完成 (至少3個點 => 6個座標數值)
        // 注意：polygonPoints 存的是點擊的點，不包含正在跟隨滑鼠的那個點
        if (this.mode === 'drawing' && this.polygonPoints.length >= 6) { 
            this.finishSelection();
        }
    },

    // 完成選取
    finishSelection: function() {
        // 建立多邊形頂點陣列 [{x,y}, ...]
        const poly = [];
        for(let i=0; i<this.polygonPoints.length; i+=2) {
            poly.push({x: this.polygonPoints[i], y: this.polygonPoints[i+1]});
        }

        // 移除暫存線
        if(this.tempPolygonLine) {
            this.tempPolygonLine.destroy();
            this.tempPolygonLine = null;
        }

        this.selectedData.nodeIds.clear();
        this.selectedData.linkIds.clear();

        if (!window.network) return;

        // 判定 Node 是否在內
        Object.values(window.network.nodes).forEach(node => {
            if (this.isPointInPolygon({x: node.x, y: node.y}, poly)) {
                this.selectedData.nodeIds.add(node.id);
            }
        });

        // 判定 Link 是否在內
        Object.values(window.network.links).forEach(link => {
            let inCount = 0;
            link.waypoints.forEach(wp => {
                if(this.isPointInPolygon(wp, poly)) inCount++;
            });
            // 只要有任何一個 waypoint 在框內，就視為選取
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

    // 建立選取框 (Transformer Group)
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
            dash: [10, 5]
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

// 移動實際資料
        moveNetworkData: function(dx, dy) {
        if (!window.network) return;

        // 1. 移動 Nodes
        this.selectedData.nodeIds.forEach(id => {
            const node = window.network.nodes[id];
            
            // 更新資料模型座標
            node.x += dx;
            node.y += dy;
            
            // 【修正重點】：
            // 移除原本的 node.konvaShape.position({x: node.x, y: node.y});
            // 因為 drawNode 內部是直接讀取 Link 的「絕對座標」來繪製多邊形的。
            // 如果我們改變 shape 的 position，會導致加上絕對座標後產生雙重位移。
            // 因此，確保 shape 的起點維持在 (0, 0)，並清除快取讓它根據新的 Link 座標自然重繪即可。
            if(node.konvaShape) {
                node.konvaShape.position({ x: 0, y: 0 });
                node.konvaShape.clearCache(); // 強制清除快取以利重繪
            }
            
            // 這會更新單一連接線 (Bezier Curves)
            if (window.redrawNodeConnections) window.redrawNodeConnections(id);
        });

        // 2. 移動 Links
        this.selectedData.linkIds.forEach(id => {
            const link = window.network.links[id];
            // 更新所有路徑點
            link.waypoints = link.waypoints.map(wp => ({ x: wp.x + dx, y: wp.y + dy }));
            
            // 重繪 Link 及其附屬物件
            if (window.drawLink) window.drawLink(link);
            if (window.updateConnectionEndpoints) window.updateConnectionEndpoints(link.id);
            if (window.updateAllDetectorsOnLink) window.updateAllDetectorsOnLink(link.id);
            if (window.updateFlowPointsOnLink) window.updateFlowPointsOnLink(link.id);
            if (window.updateRoadSignsOnLink) window.updateRoadSignsOnLink(link.id);
        });

        // 3. 移動 Connection Groups (綠色粗線)
        if (window.layer) {
            // 找出所有連接群組的視覺線條
            const groupLines = window.layer.find('.group-connection-visual');
            
            groupLines.forEach(line => {
                const meta = line.getAttr('meta');
                if (!meta) return;

                // 檢查此群組的來源或目的路段是否在這次移動的選取範圍內
                const isSourceMoved = this.selectedData.linkIds.has(meta.sourceLinkId);
                const isDestMoved = this.selectedData.linkIds.has(meta.destLinkId);

                // 如果任一端點被移動，就需要更新線條位置
                if (isSourceMoved || isDestMoved) {
                    const srcLink = window.network.links[meta.sourceLinkId];
                    const dstLink = window.network.links[meta.destLinkId];

                    if (srcLink && dstLink && srcLink.waypoints.length > 0 && dstLink.waypoints.length > 0) {
                        // 取得更新後的座標：來源路段的末端 -> 目的路段的開頭
                        const p1 = srcLink.waypoints[srcLink.waypoints.length - 1]; 
                        const p4 = dstLink.waypoints[0];
                        
                        // 更新線條座標
                        line.points([p1.x, p1.y, p4.x, p4.y]);
                    }
                }
            });
        }
        
        // 更新立體交叉
        if (window.updateAllOverpasses) window.updateAllOverpasses();
        
        // 批次重繪
        if (window.layer) window.layer.batchDraw();
    },
// 複製選取區域
    duplicateSelection: function() {
        if (!window.network) return;
        if (this.selectedData.nodeIds.size === 0 && this.selectedData.linkIds.size === 0) return;

        const idMap = {};       // Node 和 Link 的 ID 對照表: OldID -> NewID
        const connIdMap = {};   // Connection 的 ID 對照表: OldConnID -> NewConnID
        
        const newNodes = new Set();
        const newLinks = new Set();
        
        const offsetX = 30; 
        const offsetY = 30;

        // ---------------------------------------------------------
        // 1. 複製 Nodes
        // ---------------------------------------------------------
        this.selectedData.nodeIds.forEach(oldId => {
            const oldNode = window.network.nodes[oldId];
            const newNode = window.createNode(oldNode.x + offsetX, oldNode.y + offsetY);
            idMap[oldId] = newNode.id;
            newNodes.add(newNode.id);
        });

        // ---------------------------------------------------------
        // 2. 複製 Links
        // ---------------------------------------------------------
        this.selectedData.linkIds.forEach(oldId => {
            const oldLink = window.network.links[oldId];
            const newWaypoints = oldLink.waypoints.map(wp => ({ x: wp.x + offsetX, y: wp.y + offsetY }));
            
            // 複製車道資訊
            const laneData = oldLink.lanes.map(l => l.width);
            
            const newLink = window.createLink(newWaypoints, laneData);
            newLink.name = oldLink.name ? `${oldLink.name}_copy` : `${newLink.id}`;
            idMap[oldId] = newLink.id;
            newLinks.add(newLink.id);
        });

// ---------------------------------------------------------
        // 3. 重建 Link 與 Node 的實體端點關係 (依賴 Node 屬性，而非脆弱的 Link 屬性)
        // ---------------------------------------------------------
        this.selectedData.nodeIds.forEach(oldId => {
            const oldNode = window.network.nodes[oldId];
            const newNode = window.network.nodes[idMap[oldId]];

            // 複製 outgoing (離開路口的) 關係
            oldNode.outgoingLinkIds.forEach(oldLinkId => {
                if (idMap[oldLinkId]) { // 如果這條路段也被一併複製了
                    const newLinkId = idMap[oldLinkId];
                    newNode.outgoingLinkIds.add(newLinkId);
                    window.network.links[newLinkId].startNodeId = newNode.id; // 順便修復 link 端點
                }
            });

            // 複製 incoming (進入路口的) 關係
            oldNode.incomingLinkIds.forEach(oldLinkId => {
                if (idMap[oldLinkId]) {
                    const newLinkId = idMap[oldLinkId];
                    newNode.incomingLinkIds.add(newLinkId);
                    window.network.links[newLinkId].endNodeId = newNode.id; // 順便修復 link 端點
                }
            });
        });

        // ---------------------------------------------------------
        // 4. 複製 Connections (並修復拓撲邏輯)
        // ---------------------------------------------------------
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
                        
                        // 記錄舊 ID 對應新 ID
                        connIdMap[conn.id] = newConn.id;

                        // ★★★ [關鍵修正] ★★★
                        // 必須明確告訴 Node 它擁有這些進入與離開的 Link
                        // 否則模擬器在建立路口拓撲時會找不到對應關係而報錯
                        if (nodeObj) {
                            nodeObj.incomingLinkIds.add(newSrcLinkID);
                            nodeObj.outgoingLinkIds.add(newDstLinkID);
                        }
                    }
                }
            }
        });

        // ---------------------------------------------------------
        // 5. 複製轉向比例 (Turning Ratios)
        // ---------------------------------------------------------
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

        // ---------------------------------------------------------
        // 6. 複製交通號誌 (Traffic Lights) 與 Signal Groups
        // ---------------------------------------------------------
        this.selectedData.nodeIds.forEach(oldId => {
            const oldTfl = window.network.trafficLights[oldId];
            if (oldTfl) {
                const newTfl = JSON.parse(JSON.stringify(oldTfl));
                newTfl.nodeId = idMap[oldId];
                
                const newSignalGroups = {};
                Object.keys(newTfl.signalGroups).forEach(groupName => {
                    const oldGroup = newTfl.signalGroups[groupName];
                    const newConnIds = [];
                    
                    oldGroup.connIds.forEach(oldConnId => {
                        if (connIdMap[oldConnId]) {
                            newConnIds.push(connIdMap[oldConnId]);
                        }
                    });
                    
                    if (newConnIds.length > 0) {
                        newSignalGroups[groupName] = {
                            id: groupName,
                            connIds: newConnIds
                        };
                    }
                });
                
                newTfl.signalGroups = newSignalGroups;
                window.network.trafficLights[newTfl.nodeId] = newTfl;
            }
        });

        // ---------------------------------------------------------
        // 7. 複製連接群組視覺 (Connection Groups Visuals)
        // ---------------------------------------------------------
        if (window.layer) {
            const existingGroupLines = window.layer.find('.group-connection-visual');
            existingGroupLines.forEach(line => {
                const meta = line.getAttr('meta');
                if (!meta || !meta.connectionIds) return;

                const newGroupConnIds = [];
                let allExist = true;

                for (let oldConnId of meta.connectionIds) {
                    if (connIdMap[oldConnId]) {
                        newGroupConnIds.push(connIdMap[oldConnId]);
                    } else {
                        allExist = false; 
                    }
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
                            points: [p1.x, p1.y, p4.x, p4.y],
                            stroke: 'darkgreen',
                            strokeWidth: 2,
                            hitStrokeWidth: 20,
                            name: 'group-connection-visual',
                            listening: true,
                        });

                        const newMeta = {
                            type: 'ConnectionGroup',
                            connectionIds: newGroupConnIds,
                            nodeId: newNodeId,
                            sourceLinkId: newSourceLinkId,
                            destLinkId: newDestLinkId
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

        // ---------------------------------------------------------
        // 完成
        // ---------------------------------------------------------
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
            <div class="prop-hint">
                <i class="fa-solid fa-arrows-up-down-left-right"></i> Drag the blue box to move.<br>
                <i class="fa-solid fa-link"></i> Use "Connect (C)" tool to link with other networks.
            </div>
        `;
        
        const dupBtn = document.getElementById('subnet-duplicate-btn');
        if(dupBtn) dupBtn.onclick = () => this.duplicateSelection();
    }
};

window.SubNetworkTool = SubNetworkTool;