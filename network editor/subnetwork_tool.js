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

        this.selectedData.nodeIds.forEach(id => {
            const node = window.network.nodes[id];
            node.x += dx;
            node.y += dy;
            if(node.konvaShape) node.konvaShape.position({x: node.x, y: node.y});
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
        
        if (window.updateAllOverpasses) window.updateAllOverpasses();
        if (window.layer) window.layer.batchDraw();
    },

    // 複製選取區域
    duplicateSelection: function() {
        if (!window.network) return;
        if (this.selectedData.nodeIds.size === 0 && this.selectedData.linkIds.size === 0) return;

        const idMap = {}; 
        const newNodes = [];
        const offsetX = 30; // 稍微增加偏移量，讓複製後的物件更明顯
        const offsetY = 30;

        // 複製 Nodes
        this.selectedData.nodeIds.forEach(oldId => {
            const oldNode = window.network.nodes[oldId];
            const newNode = window.createNode(oldNode.x + offsetX, oldNode.y + offsetY);
            idMap[oldId] = newNode.id;
            
            if (window.network.trafficLights[oldId]) {
                const oldTfl = window.network.trafficLights[oldId];
                const newTfl = JSON.parse(JSON.stringify(oldTfl));
                newTfl.nodeId = newNode.id;
                newTfl.signalGroups = {}; 
                window.network.trafficLights[newNode.id] = newTfl;
            }
            newNodes.push(newNode.id);
        });

        // 複製 Links
        const newLinks = [];
        this.selectedData.linkIds.forEach(oldId => {
            const oldLink = window.network.links[oldId];
            const newWaypoints = oldLink.waypoints.map(wp => ({ x: wp.x + offsetX, y: wp.y + offsetY }));
            const laneWidths = oldLink.lanes.map(l => l.width);
            
            const newLink = window.createLink(newWaypoints, laneWidths);
            newLink.name = oldLink.name ? `${oldLink.name}_copy` : `${newLink.id}`;
            idMap[oldId] = newLink.id;
            newLinks.push(newLink.id);

            // 重建拓撲關係
            if (oldLink.startNodeId && idMap[oldLink.startNodeId]) {
                newLink.startNodeId = idMap[oldLink.startNodeId];
                window.network.nodes[newLink.startNodeId].outgoingLinkIds.add(newLink.id);
            }
            if (oldLink.endNodeId && idMap[oldLink.endNodeId]) {
                newLink.endNodeId = idMap[oldLink.endNodeId];
                window.network.nodes[newLink.endNodeId].incomingLinkIds.add(newLink.id);
            }
        });

        // 複製 Connections
        Object.values(window.network.connections).forEach(conn => {
            const newSrcLink = idMap[conn.sourceLinkId];
            const newDstLink = idMap[conn.destLinkId];
            const newNodeId = idMap[conn.nodeId]; 

            if (newSrcLink && newDstLink && newNodeId) {
                const srcLinkObj = window.network.links[newSrcLink];
                const dstLinkObj = window.network.links[newDstLink];
                const nodeObj = window.network.nodes[newNodeId];

                if (window.getLanePath) {
                    const sourceLanePath = window.getLanePath(srcLinkObj, conn.sourceLaneIndex);
                    const destLanePath = window.getLanePath(dstLinkObj, conn.destLaneIndex);
                    
                    if (sourceLanePath.length > 0 && destLanePath.length > 0) {
                        const p1 = sourceLanePath[sourceLanePath.length - 1];
                        const p4 = destLanePath[0];
                        
                        window.createConnection(
                            srcLinkObj, conn.sourceLaneIndex,
                            dstLinkObj, conn.destLaneIndex,
                            nodeObj, [p1, p4]
                        );
                    }
                }
            }
        });

        // 完成複製：重置選取並選取新物件
        this.reset();
        this.selectedData.nodeIds = new Set(newNodes);
        this.selectedData.linkIds = new Set(newLinks);
        
        this.mode = 'selected';
        this.createSelectionOverlay();
        
        if (window.saveState) window.saveState();
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