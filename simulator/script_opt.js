// --- START OF FILE script_opt.js (精簡版 - Green Wave Import Sync + Single Row Picker) ---

class OptimizerController {
    constructor() {
        this.simulation = null;
        this.isActive = false;
        
        // 鎖定為 Green Wave 模式
        this.currentMode = 'greenwave'; 

        // UI Cache
        this.panel = document.getElementById('opt-panel');
        this.statusText = document.getElementById('opt-status');
        this.optionsContainer = document.querySelector('.panel-options');
        this.actionContainer = document.querySelector('.panel-actions');

        // 改名標題
        const headerTitle = this.panel ? this.panel.querySelector('.panel-header-mini span') : null;
        if (headerTitle) headerTitle.textContent = "🚦 號誌優化";

        // State Data
        this.gwConfig = {
            startNodeId: null,
            endNodeId: null,
            pathNodes: [],     
            pathLinks: [],     
            pathDistances: [], 
            designSpeed: 50,   
            directionWeight: 0.5, 
            isBidirectional: false,
            hasTurns: false
        };

        // Saturation Flow (PCU/hr)
        this.saturationFlow = 1800;

        // Data Store
        this.originalSchedules = {}; 
        this.originalOffsets = {};   
        this.originalCycles = {};    
        this.flowCounts = {}; 
        
        // Interactive Picking
        this.pickingMode = null; 

        // --- Draggable Overlay State ---
        this.cardOffsets = {}; 
        this.overlayHitboxes = []; 
        this.dragState = {
            active: false,
            nodeId: null,
            startX: 0,
            startY: 0,
            origOffsetX: 0,
            origOffsetY: 0
        };

        // 控制 Overlay 顯示的集合
        this.visibleOverlayIds = new Set();

        this.bindGlobalEvents();
    }

    setSimulation(sim) {
        this.simulation = sim;
        this.resetData();
        console.log("Optimizer: Ready (Green Wave Only).");
    }

    resetData() {
        this.originalSchedules = {};
        this.originalOffsets = {};
        this.originalCycles = {};
        this.flowCounts = {};
        this.gwConfig.startNodeId = null;
        this.gwConfig.endNodeId = null;
        this.gwConfig.pathNodes = [];
        this.gwConfig.pathLinks = [];
        this.cardOffsets = {};
        this.visibleOverlayIds.clear(); 
        if(this.isActive) this.renderUI();
        this.triggerRedraw(); 
    }

    setActive(active) {
        this.isActive = active;
        if (this.panel) this.panel.style.display = active ? 'flex' : 'none';
        if (active) {
            this.renderUI();
            this.triggerRedraw();
        }
    }

    triggerRedraw() {
        window.dispatchEvent(new Event('resize'));
    }

    bindGlobalEvents() {
        const btnStart = document.getElementById('btn-opt-start');
        if (btnStart) {
            btnStart.textContent = "執行優化";
            const newBtn = btnStart.cloneNode(true);
            btnStart.parentNode.replaceChild(newBtn, btnStart);
            newBtn.addEventListener('click', () => this.runOptimization());
        }

        const btnExport = document.getElementById('btn-opt-export');
        if (btnExport) {
            const newBtn = btnExport.cloneNode(true);
            btnExport.parentNode.replaceChild(newBtn, btnExport);
            newBtn.addEventListener('click', () => this.exportConfig());
        }
        
        const fileImport = document.getElementById('file-opt-import');
        if (fileImport) fileImport.addEventListener('change', (e) => this.importConfig(e));

        const btnReset = document.getElementById('btn-opt-reset');
        if (btnReset) btnReset.remove();
    }

    // --- UI Rendering ---
    renderUI() {
        if (!this.optionsContainer) return;
        this.optionsContainer.innerHTML = ''; 

        // 1. 參數設定區
        const paramGroup = document.createElement('div');
        paramGroup.className = 'control-group';
        paramGroup.innerHTML = `
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <div style="flex:1;">
                    <label style="font-size:0.7rem; color:#666;">設計速率 (km/h)</label>
                    <input type="number" id="inp-speed" value="${this.gwConfig.designSpeed}" class="dropdown-light" style="width:100%;">
                </div>
                <div style="flex:1;">
                    <label style="font-size:0.7rem; color:#666;">飽和流率 (PCU)</label>
                    <input type="number" id="inp-sat" value="${this.saturationFlow}" class="dropdown-light" style="width:100%;">
                </div>
            </div>
        `;
        this.optionsContainer.appendChild(paramGroup);

        // 2. 路徑選擇器 (修正為一列三欄 Grid 布局)
        const pickGroup = document.createElement('div');
        pickGroup.className = 'path-selector-group';
        // 使用 Grid 確保嚴格的三欄配置: [按鈕] [箭頭] [按鈕]
        pickGroup.style.display = 'grid';
        pickGroup.style.gridTemplateColumns = '1fr 24px 1fr'; 
        pickGroup.style.alignItems = 'center';
        pickGroup.style.gap = '4px';
        pickGroup.style.marginBottom = '8px';

        const createBtnHTML = (type, nodeId) => {
            const isPicking = this.pickingMode === type;
            const isSet = !!nodeId;
            let icon = type === 'start' ? '🟢' : '🔴';
            let valueText = nodeId ? `Node ${nodeId}` : (isPicking ? '點擊...' : '點選');
            let styleClass = isPicking ? 'picking' : (isSet ? 'selected' : '');
            
            return `
                <div class="pick-btn ${styleClass}" data-type="${type}" style="
                    display:flex; 
                    align-items:center; 
                    justify-content:center; 
                    padding:4px; 
                    border:1px solid #ccc; 
                    border-radius:4px; 
                    cursor:pointer; 
                    font-size:0.8rem; 
                    height:32px;
                    width: 100%;
                    background: #f8f9fa;
                ">
                    <span style="margin-right:4px;">${icon}</span>
                    <span style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem;">${valueText}</span>
                    ${isSet ? '<span class="btn-clear-selection" data-type="'+type+'" style="margin-left:4px; color:#999; font-size:0.7rem;">✕</span>' : ''}
                </div>
            `;
        };

        pickGroup.innerHTML = `
            ${createBtnHTML('start', this.gwConfig.startNodeId)}
            <div style="color:#aaa; font-weight:bold; text-align:center;">➜</div>
            ${createBtnHTML('end', this.gwConfig.endNodeId)}
        `;
        this.optionsContainer.appendChild(pickGroup);

        pickGroup.querySelectorAll('.pick-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = btn.dataset.type;
                if (e.target.classList.contains('btn-clear-selection')) {
                    e.stopPropagation();
                    this.clearPicking(type);
                } else {
                    this.togglePicking(type);
                }
            });
        });

        // 3. 路徑資訊與警告
        if (this.gwConfig.pathNodes.length > 1) {
            const infoDiv = document.createElement('div');
            infoDiv.style.fontSize = '0.75rem';
            infoDiv.style.color = '#64748b';
            infoDiv.style.marginBottom = '6px';
            infoDiv.style.textAlign = 'center';
            infoDiv.textContent = this.getRouteInfoString();
            this.optionsContainer.appendChild(infoDiv);

            if (this.gwConfig.isBidirectional && !this.gwConfig.hasTurns) {
                const sliderGroup = document.createElement('div');
                sliderGroup.className = 'weight-slider-container';
                sliderGroup.innerHTML = `
                    <div class="weight-labels" style="display:flex; justify-content:space-between; font-size:0.7rem; color:#666;">
                        <span>順向優先</span>
                        <span>逆向優先</span>
                    </div>
                    <input type="range" min="0" max="100" value="${this.gwConfig.directionWeight * 100}" class="styled-slider" id="gw-weight-slider" style="width:100%;">
                    <div style="text-align:center; font-size:0.7rem;">權重: <span id="val-weight">${(this.gwConfig.directionWeight * 100).toFixed(0)}</span>%</div>
                `;
                this.optionsContainer.appendChild(sliderGroup);
                
                document.getElementById('gw-weight-slider').addEventListener('input', (e) => {
                    this.gwConfig.directionWeight = parseInt(e.target.value) / 100;
                    document.getElementById('val-weight').textContent = e.target.value;
                });
            } else if (this.gwConfig.hasTurns) {
                const warnDiv = document.createElement('div');
                warnDiv.style.background = 'rgba(255, 193, 7, 0.15)';
                warnDiv.style.color = '#b45309';
                warnDiv.style.border = '1px solid rgba(255, 193, 7, 0.3)';
                warnDiv.style.borderRadius = '4px';
                warnDiv.style.padding = '4px 8px';
                warnDiv.style.fontSize = '0.7rem';
                warnDiv.style.whiteSpace = 'nowrap';
                warnDiv.style.overflow = 'hidden';
                warnDiv.style.textOverflow = 'ellipsis';
                warnDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 偵測到轉向路徑，轉向綠波不適合雙向優化，已鎖定為 100% 順向優先。';
                warnDiv.title = warnDiv.textContent;
                this.optionsContainer.appendChild(warnDiv);
            }
        }

        // 4. Node 列表 (3欄 Grid, Checkbox)
        if (this.gwConfig.pathNodes.length > 0) {
            const listHeader = document.createElement('div');
            listHeader.style.fontSize = '0.75rem';
            listHeader.style.fontWeight = '600';
            listHeader.style.marginTop = '8px';
            listHeader.style.marginBottom = '4px';
            listHeader.textContent = `路徑節點 (${this.gwConfig.pathNodes.length})`;
            this.optionsContainer.appendChild(listHeader);

            const gridContainer = document.createElement('div');
            gridContainer.style.display = 'grid';
            gridContainer.style.gridTemplateColumns = 'repeat(3, 1fr)'; 
            gridContainer.style.gap = '4px';
            gridContainer.style.maxHeight = '120px';
            gridContainer.style.overflowY = 'auto'; 
            gridContainer.style.border = '1px solid #eee';
            gridContainer.style.padding = '4px';
            gridContainer.style.borderRadius = '4px';
            gridContainer.style.backgroundColor = '#f9f9f9';

            this.gwConfig.pathNodes.forEach((nodeId) => {
                const item = document.createElement('label');
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '4px';
                item.style.fontSize = '0.7rem';
                item.style.padding = '2px 4px';
                item.style.background = '#fff';
                item.style.border = '1px solid #ddd';
                item.style.borderRadius = '3px';
                item.style.cursor = 'pointer';
                item.style.whiteSpace = 'nowrap';
                item.style.overflow = 'hidden';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.style.cursor = 'pointer';
                checkbox.checked = this.visibleOverlayIds.has(nodeId);
                
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.visibleOverlayIds.add(nodeId);
                    } else {
                        this.visibleOverlayIds.delete(nodeId);
                    }
                    this.triggerRedraw();
                });

                const textSpan = document.createElement('span');
                textSpan.textContent = `Node ${nodeId}`; 
                textSpan.style.overflow = 'hidden';
                textSpan.style.textOverflow = 'ellipsis';

                item.appendChild(checkbox);
                item.appendChild(textSpan);
                gridContainer.appendChild(item);
            });
            this.optionsContainer.appendChild(gridContainer);
        }

        this.updateActionButton();
    }

    updateActionButton() {
        const btnStart = document.getElementById('btn-opt-start');
        if (!btnStart) return;
        btnStart.disabled = this.gwConfig.pathNodes.length < 2;
    }

    // --- Interaction Logic ---
    togglePicking(type) {
        if (this.pickingMode === type) {
            this.pickingMode = null;
            this.setMapCursor('default');
        } else {
            this.pickingMode = type;
            this.setMapCursor('crosshair');
        }
        this.renderUI();
    }

    clearPicking(type) {
        if (type === 'start') this.gwConfig.startNodeId = null;
        if (type === 'end') this.gwConfig.endNodeId = null;
        
        this.gwConfig.pathNodes = [];
        this.gwConfig.pathLinks = [];
        this.gwConfig.pathDistances = [];
        this.flowCounts = {}; 
        this.visibleOverlayIds.clear(); 
        
        this.pickingMode = null;
        this.setMapCursor('default');
        this.renderUI();
        this.triggerRedraw(); 
    }

    setMapCursor(cursorType) {
        const canvas = document.getElementById('networkCanvas');
        if (canvas) canvas.style.cursor = cursorType;
    }

    // --- Mouse Event Handling ---
    handleMouseDown(worldX, worldY) {
        if (!this.isActive || !this.simulation) return false;

        if (this.pickingMode) {
            let clickedNodeId = null;
            for (const nodeId in this.simulation.network.nodes) {
                const node = this.simulation.network.nodes[nodeId];
                if (node.polygon && this.isPointInPolygon({x: worldX, y: worldY}, node.polygon)) {
                    clickedNodeId = nodeId;
                    break;
                }
            }

            if (clickedNodeId) {
                if (this.pickingMode === 'start') this.gwConfig.startNodeId = clickedNodeId;
                if (this.pickingMode === 'end') this.gwConfig.endNodeId = clickedNodeId;
                
                this.calculateRoutePath();
                this.pickingMode = null;
                this.setMapCursor('default');
                this.renderUI();
                this.triggerRedraw(); 
                return true; 
            }
        }
        
        return false;
    }

    handleOverlayMouseDown(screenX, screenY) {
        if (!this.isActive) return false;
        // 必須檢查 visibleOverlayIds，避免點擊到未顯示的卡片（如果 logic 有漏）
        for (let i = this.overlayHitboxes.length - 1; i >= 0; i--) {
            const box = this.overlayHitboxes[i];
            if (!this.visibleOverlayIds.has(box.nodeId)) continue;

            if (screenX >= box.x && screenX <= box.x + box.w &&
                screenY >= box.y && screenY <= box.y + box.h) {
                
                this.dragState.active = true;
                this.dragState.nodeId = box.nodeId;
                this.dragState.startX = screenX;
                this.dragState.startY = screenY;
                
                const currentOffset = this.cardOffsets[box.nodeId] || {x: 0, y: 0};
                this.dragState.origOffsetX = currentOffset.x;
                this.dragState.origOffsetY = currentOffset.y;
                
                return true; 
            }
        }
        return false;
    }

    handleOverlayMouseMove(screenX, screenY) {
        if (!this.isActive || !this.dragState.active) return false;
        const dx = screenX - this.dragState.startX;
        const dy = screenY - this.dragState.startY;
        this.cardOffsets[this.dragState.nodeId] = {
            x: this.dragState.origOffsetX + dx,
            y: this.dragState.origOffsetY + dy
        };
        this.triggerRedraw();
        return true;
    }

    handleOverlayMouseUp() {
        if (this.dragState.active) {
            this.dragState.active = false;
            this.dragState.nodeId = null;
            return true;
        }
        return false;
    }

    // --- Helper Functions ---
    isPointInPolygon(p, polygon) {
        let isInside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > p.y) !== (polygon[j].y > p.y)) &&
                (p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                isInside = !isInside;
            }
        }
        return isInside;
    }

    calculateRoutePath() {
        const { startNodeId, endNodeId } = this.gwConfig;
        if (!startNodeId || !endNodeId || !this.simulation) return;

        const pathLinks = this.simulation.network.pathfinder.findRoute(startNodeId, endNodeId);
        
        if (!pathLinks || pathLinks.length === 0) {
            this.gwConfig.pathNodes = [];
            this.gwConfig.pathLinks = [];
            this.gwConfig.pathDistances = [];
            this.gwConfig.hasTurns = false;
            this.visibleOverlayIds.clear();
            return;
        }

        const nodeSeq = [startNodeId];
        const distSeq = [0];
        let totalDist = 0;
        let totalAngleChange = 0;
        let lastAngle = null;

        pathLinks.forEach(linkId => {
            const link = this.simulation.network.links[linkId];
            if (link) {
                totalDist += link.length;
                nodeSeq.push(link.destination);
                distSeq.push(totalDist);

                if (link.lanes && link.lanes[0] && link.lanes[0].path.length > 1) {
                    const path = link.lanes[0].path;
                    const p1 = path[0];
                    const p2 = path[path.length-1];
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    if (lastAngle !== null) {
                        let diff = Math.abs(angle - lastAngle);
                        if (diff > Math.PI) diff = 2 * Math.PI - diff;
                        totalAngleChange += diff;
                    }
                    lastAngle = angle;
                }
            }
        });

        this.gwConfig.pathNodes = nodeSeq;
        this.gwConfig.pathLinks = pathLinks;
        this.gwConfig.pathDistances = distSeq;
        this.gwConfig.hasTurns = totalAngleChange > 0.8;

        const reversePath = this.simulation.network.pathfinder.findRoute(endNodeId, startNodeId);
        this.gwConfig.isBidirectional = (reversePath && reversePath.length > 0) && !this.gwConfig.hasTurns;
        
        if (this.gwConfig.hasTurns) {
            this.gwConfig.directionWeight = 0;
        }

        // 自動勾選所有路徑上的 Node
        this.visibleOverlayIds = new Set(nodeSeq);
    }

    getRouteInfoString() {
        const len = this.gwConfig.pathNodes.length;
        if (len < 2) return '';
        const dist = this.gwConfig.pathDistances[this.gwConfig.pathDistances.length - 1];
        const typeStr = this.gwConfig.isBidirectional ? '雙向' : '單向';
        return `路徑: ${len}路口, ${(dist/1000).toFixed(2)}km ${typeStr}`;
    }

    // --- Optimization Logic ---
    update(dt) {} 
    registerVehiclePass(nodeId, turnGroupId, isMotorcycle) {} 

    calculateTheoreticalDemand() {
        console.log("Calculating theoretical traffic demand...");
        const demandCounts = {}; 
        const net = this.simulation.network;

        // Part 1: OD Flow
        let maxSimDuration = 1;
        this.simulation.spawners.forEach(s => {
            let d = 0; s.periods.forEach(p => d += p.duration);
            if(d > maxSimDuration) maxSimDuration = d;
        });

        this.simulation.spawners.forEach(spawner => {
            const originNodeId = spawner.originNodeId;
            spawner.periods.forEach(period => {
                if (period.duration <= 0) return;
                const periodRate = period.numVehicles / period.duration;
                let pPcu = 1.0;
                if (period.vehicleProfiles && period.vehicleProfiles.length > 0) {
                    let w = 0, p = 0;
                    period.vehicleProfiles.forEach(vp => {
                        p += (vp.width < 1.2 ? 0.3 : 1.0) * vp.weight;
                        w += vp.weight;
                    });
                    if(w > 0) pPcu = p / w;
                }
                const totalDestWeight = period.destinations.reduce((a, b) => a + b.weight, 0);
                period.destinations.forEach(dest => {
                    const ratio = totalDestWeight > 0 ? (dest.weight / totalDestWeight) : 0;
                    if (ratio <= 0) return;
                    const pairFlowPcu = periodRate * ratio * pPcu;
                    const route = net.pathfinder.findRoute(originNodeId, dest.destinationNodeId);
                    if (!route || route.length < 2) return;
                    for (let i = 0; i < route.length - 1; i++) {
                        const linkInId = route[i];
                        const linkOutId = route[i+1];
                        const linkIn = net.links[linkInId];
                        const nodeId = linkIn.destination;
                        const node = net.nodes[nodeId];
                        const transition = node.transitions.find(t => t.sourceLinkId === linkInId && t.destLinkId === linkOutId);
                        if (transition && transition.turnGroupId) {
                            if (!transition.tempVolume) transition.tempVolume = 0;
                            transition.tempVolume += pairFlowPcu * period.duration; 
                        }
                    }
                });
            });
        });

        Object.values(net.nodes).forEach(node => {
            if(node.transitions) {
                node.transitions.forEach(t => {
                    if(t.turnGroupId && t.tempVolume > 0) {
                        if (!demandCounts[node.id]) demandCounts[node.id] = {};
                        const rate = (t.tempVolume / maxSimDuration) * 3600;
                        demandCounts[node.id][t.turnGroupId] = rate;
                        delete t.tempVolume;
                    }
                });
            }
        });

        // Part 2: Detector Flow Propagation
        if (this.simulation.detectorSpawners && this.simulation.detectorSpawners.length > 0) {
            console.log(`Processing detectors flow propagation...`);
            this.simulation.detectorSpawners.forEach(det => {
                if (det.interval <= 0 || det.interval === Infinity) return;
                const vehPerHour = 3600 / det.interval;
                let avgPcu = 1.0;
                if (det.spawnProfiles && det.spawnProfiles.length > 0) {
                    let totalW = 0, totalP = 0;
                    det.spawnProfiles.forEach(entry => {
                        const profile = net.vehicleProfiles[entry.profileId];
                        let pcuVal = 1.0; 
                        if (profile) pcuVal = profile.width < 1.2 ? 0.3 : 1.0; 
                        totalP += pcuVal * entry.weight;
                        totalW += entry.weight;
                    });
                    if (totalW > 0) avgPcu = totalP / totalW;
                }
                const sourceFlowPcu = vehPerHour * avgPcu;
                this.propagateDetectorFlow(det.linkId, sourceFlowPcu, demandCounts, 0);
            });
        }

        this.flowCounts = demandCounts;
    }

    propagateDetectorFlow(currentLinkId, flow, counts, depth) {
        if (depth > 12 || flow < 1.0) return;
        const net = this.simulation.network;
        const link = net.links[currentLinkId];
        if (!link) return;
        const nodeId = link.destination;
        const node = net.nodes[nodeId];
        if (!node) return;
        const ratios = node.turningRatios ? node.turningRatios[currentLinkId] : null;
        if (!ratios) return;

        for (const [outLinkId, prob] of Object.entries(ratios)) {
            const outFlow = flow * prob;
            if (outFlow > 0.1) {
                const transition = node.transitions.find(t => t.sourceLinkId === currentLinkId && t.destLinkId === outLinkId);
                if (transition && transition.turnGroupId) {
                    if (!counts[nodeId]) counts[nodeId] = {};
                    if (!counts[nodeId][transition.turnGroupId]) counts[nodeId][transition.turnGroupId] = 0;
                    counts[nodeId][transition.turnGroupId] += outFlow;
                }
                this.propagateDetectorFlow(outLinkId, outFlow, counts, depth + 1);
            }
        }
    }

    runOptimization() {
        if (this.gwConfig.pathNodes.length < 2) { alert("無有效路徑！"); return; }
        
        const inpSpeed = document.getElementById('inp-speed');
        if(inpSpeed) this.gwConfig.designSpeed = parseFloat(inpSpeed.value);
        const inpSat = document.getElementById('inp-sat');
        if(inpSat) this.saturationFlow = parseFloat(inpSat.value);

        this.gwConfig.pathNodes.forEach(nodeId => {
            if (!this.originalSchedules[nodeId]) {
                const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
                if (tfl) {
                    this.originalSchedules[nodeId] = JSON.parse(JSON.stringify(tfl.schedule));
                    this.originalOffsets[nodeId] = tfl.timeShift || 0;
                    this.originalCycles[nodeId] = tfl.cycleDuration;
                }
            }
        });

        this.calculateTheoreticalDemand();
        this.applyGreenWave();
        this.triggerRedraw();
        this.statusText.textContent = "Optimized";
        this.statusText.style.color = "#10b981";
        alert("Green Wave 優化完成！");
    }

    calcWebsterParams(nodeId, counts, schedule) {
        let fixedLostTime = 0; 
        const greenPhaseIndices = []; 
        const greenPhaseRatios = [];  

        schedule.forEach((period, idx) => {
            let hasYellow = false;
            let hasGreen = false;
            let maxY = 0;

            for (const [gid, sig] of Object.entries(period.signals)) {
                if (sig === 'Yellow') hasYellow = true;
                else if (sig === 'Green') {
                    hasGreen = true;
                    const flow = counts[gid] || 0;
                    const y = flow / this.saturationFlow;
                    if (y > maxY) maxY = y;
                }
            }

            if (hasYellow || !hasGreen) {
                fixedLostTime += period.duration; 
            } else {
                greenPhaseIndices.push(idx);
                greenPhaseRatios.push(maxY);
            }
        });

        const Y = greenPhaseRatios.reduce((a, b) => a + b, 0);
        const safeY = Math.min(0.95, Y);

        if (safeY <= 0.01) {
             return { 
                 cycle: schedule.reduce((sum, p) => sum + p.duration, 0), 
                 newSplits: schedule.map(p => p.duration) 
             };
        }

        let Co = (1.5 * fixedLostTime + 5) / (1.0 - safeY);
        Co = Math.max(60, Math.min(180, Co)); 

        const totalAvailableGreen = Math.max(0, Co - fixedLostTime);
        const newSplits = new Array(schedule.length).fill(0);

        schedule.forEach((p, i) => {
            if (!greenPhaseIndices.includes(i)) newSplits[i] = p.duration; 
        });

        let calculatedGreenSum = 0;
        greenPhaseIndices.forEach((idx, i) => {
            const y = greenPhaseRatios[i];
            let g = 0;
            if (safeY > 0) g = (y / safeY) * totalAvailableGreen;
            g = Math.max(10, g); 
            newSplits[idx] = g;
            calculatedGreenSum += g;
        });

        const finalCycle = fixedLostTime + calculatedGreenSum;
        return { cycle: finalCycle, newSplits };
    }

    applyGreenWave() {
        const path = this.gwConfig.pathNodes;
        const links = this.gwConfig.pathLinks;
        if(path.length < 2) return;

        let maxCycle = 0;
        const nodeParams = {};

        path.forEach(nodeId => {
            const counts = this.flowCounts[nodeId] || {};
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            if(tfl) {
                const res = this.calcWebsterParams(nodeId, counts, tfl.schedule);
                if(res) {
                    if(res.cycle > maxCycle) maxCycle = res.cycle;
                    nodeParams[nodeId] = res;
                } else {
                    const origC = tfl.schedule.reduce((a,b)=>a+b.duration, 0);
                    if(origC > maxCycle) maxCycle = origC;
                    nodeParams[nodeId] = { cycle: origC, newSplits: tfl.schedule.map(p=>p.duration) };
                }
            }
        });

        maxCycle = Math.min(180, Math.max(60, maxCycle)); 
        const speedMs = this.gwConfig.designSpeed / 3.6;
        const dists = this.gwConfig.pathDistances;
        const weight = this.gwConfig.hasTurns ? 0 : (this.gwConfig.isBidirectional ? this.gwConfig.directionWeight : 0);

        path.forEach((nodeId, idx) => {
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            if(!tfl) return;

            const params = nodeParams[nodeId];
            let fixedTime = 0;
            let adjustableTimeInParams = 0;
            const greenIndices = [];

            tfl.schedule.forEach((period, pIdx) => {
                let isFixed = false;
                let hasYellow = false;
                let hasGreen = false;
                for(const sig of Object.values(period.signals)) {
                    if(sig === 'Yellow') hasYellow = true;
                    else if(sig === 'Green') hasGreen = true;
                }
                if(hasYellow || !hasGreen) isFixed = true;

                if(isFixed) {
                    fixedTime += params.newSplits[pIdx];
                } else {
                    greenIndices.push(pIdx);
                    adjustableTimeInParams += params.newSplits[pIdx];
                }
            });

            const newTotalGreen = Math.max(0, maxCycle - fixedTime);

            tfl.schedule.forEach((period, pIdx) => {
                if (greenIndices.includes(pIdx)) {
                    let ratio = 0;
                    if (adjustableTimeInParams > 0) {
                        ratio = params.newSplits[pIdx] / adjustableTimeInParams;
                    }
                    period.duration = newTotalGreen * ratio;
                } else {
                    period.duration = params.newSplits[pIdx];
                }
            });

            tfl.cycleDuration = maxCycle; 

            const inLinkId = idx > 0 ? links[idx - 1] : null;
            const outLinkId = idx < links.length ? links[idx] : null;
            const phaseStart = this.getGreenPhaseStart(nodeId, inLinkId, outLinkId, tfl);
            const distFromStart = dists[idx];
            const offsetFwd = (distFromStart / speedMs) - phaseStart;
            const offsetBwd = -(distFromStart / speedMs) - phaseStart; 
            
            let finalShift = offsetFwd * (1 - weight) + offsetBwd * weight;
            finalShift = ((finalShift % maxCycle) + maxCycle) % maxCycle;

            tfl.timeShift = finalShift;
            tfl.optMode = 'GREEN_WAVE';
            tfl.gwIndex = idx + 1; 
        });
    }

    getGreenPhaseStart(nodeId, inLinkId, outLinkId, tfl) {
        if (!tfl || !tfl.schedule) return 0;
        let targetGroupId = null;
        const node = this.simulation.network.nodes[nodeId];
        if (node) {
            if (inLinkId && outLinkId) {
                const transition = node.transitions.find(t => t.sourceLinkId === inLinkId && t.destLinkId === outLinkId);
                if (transition) targetGroupId = transition.turnGroupId;
            } else if (!inLinkId && outLinkId) {
                const transition = node.transitions.find(t => t.destLinkId === outLinkId);
                if (transition) targetGroupId = transition.turnGroupId;
            } else if (inLinkId && !outLinkId) {
                 const transition = node.transitions.find(t => t.sourceLinkId === inLinkId);
                 if (transition) targetGroupId = transition.turnGroupId;
            }
        }
        if (!targetGroupId) return 0;
        let accumulatedTime = 0;
        let found = false;
        for (const period of tfl.schedule) {
            const signal = period.signals[targetGroupId];
            if (signal === 'Green') { found = true; break; }
            accumulatedTime += period.duration;
        }
        return found ? accumulatedTime : 0;
    }

    // --- Overlay Drawing ---
    drawOverlay(ctx, worldToScreenFunc, scale) {
        if (!this.isActive || !this.simulation) return;
        const nodesToDraw = this.gwConfig.pathNodes;
        if (nodesToDraw.length === 0) return;

        this.overlayHitboxes = [];

        ctx.save();
        ctx.font = "11px 'Roboto Mono', monospace";
        ctx.textBaseline = "top";

        nodesToDraw.forEach(nodeId => {
            if (!this.visibleOverlayIds.has(nodeId)) return;

            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            const node = this.simulation.network.nodes[nodeId];
            if (!node || !tfl) return;

            let cx = 0, cy = 0;
            node.polygon.forEach(p => { cx += p.x; cy += p.y; });
            cx /= node.polygon.length;
            cy /= node.polygon.length;
            const center = worldToScreenFunc(cx, cy);

            const offset = this.cardOffsets[nodeId] || {x: 0, y: 0};
            
            const baseX = center.x - 200 + offset.x;
            const baseY = center.y + 50 + offset.y;

            if (scale <= 0.5) {
                this.drawSimpleBadge(ctx, {x: baseX + 100, y: baseY}, tfl, nodeId);
            } else {
                this.drawJunctionInfoCard(ctx, baseX, baseY, nodeId, tfl, center);
            }
        });
        ctx.restore();
    }

    drawSimpleBadge(ctx, pos, tfl, nodeId) {
        const label = `GW #${tfl.gwIndex}`;
        const color = '#8b5cf6';
        const w = 40, h = 20;
        
        ctx.fillStyle = color;
        ctx.fillRect(pos.x, pos.y, w, h);
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(label, pos.x + w/2, pos.y + 4);

        this.overlayHitboxes.push({ nodeId, x: pos.x, y: pos.y, w, h });
    }

    drawJunctionInfoCard(ctx, x, y, nodeId, tfl, center) {
        const boxW = 180;
        const lineHeight = 16;
        const padding = 8;
        const headerH = 24;
        
        const rows = tfl.schedule.map((p, i) => {
            const origP = this.originalSchedules[nodeId] ? this.originalSchedules[nodeId][i] : null;
            const diff = origP ? p.duration - origP.duration : 0;
            let sigColor = '#ccc';
            const signals = Object.values(p.signals);
            if(signals.includes('Green')) sigColor = '#4ade80';
            else if(signals.includes('Yellow')) sigColor = '#facc15';
            else sigColor = '#f87171';
            return { idx: i, color: sigColor, dur: p.duration.toFixed(1), diff: diff !== 0 ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : '-' };
        });

        const totalH = headerH + 24 + (rows.length * lineHeight) + padding * 2 + 8; 

        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(x + boxW, y); 
        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(15, 23, 42, 0.95)"; 
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, boxW, totalH, 6);
        else ctx.rect(x, y, boxW, totalH);
        ctx.fill();
        ctx.strokeStyle = "#8b5cf6"; 
        ctx.lineWidth = 1;
        ctx.stroke();

        this.overlayHitboxes.push({ nodeId, x, y, w: boxW, h: totalH });

        ctx.fillStyle = '#8b5cf6';
        ctx.fillRect(x, y, boxW, headerH); 
        
        ctx.fillStyle = 'white';
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = 'left';
        ctx.fillText(`Node ${nodeId} (GW #${tfl.gwIndex})`, x + padding, y + 6);

        let curY = y + headerH + padding;
        ctx.font = "11px 'Roboto Mono', monospace";
        ctx.fillStyle = '#cbd5e1';
        
        const origCycle = this.originalCycles[nodeId] || 0;
        const cycleDiff = tfl.cycleDuration - origCycle;
        const cycDiffStr = Math.abs(cycleDiff) > 0.1 ? `(${cycleDiff>0?'+':''}${cycleDiff.toFixed(0)})` : '';
        
        ctx.fillText(`Cycle: ${tfl.cycleDuration.toFixed(0)}s ${cycDiffStr}`, x + padding, curY);
        curY += 14;
        ctx.fillText(`Offset: ${tfl.timeShift.toFixed(0)}s`, x + padding, curY);
        
        curY += 18;
        ctx.fillStyle = '#64748b';
        ctx.font = "9px sans-serif";
        ctx.fillText("STEP", x + padding, curY);
        ctx.fillText("SIG", x + padding + 30, curY);
        ctx.fillText("SEC", x + padding + 60, curY);
        ctx.fillText("DIFF", x + padding + 100, curY);
        
        curY += 4;
        ctx.strokeStyle = '#334155';
        ctx.beginPath(); ctx.moveTo(x+4, curY); ctx.lineTo(x+boxW-4, curY); ctx.stroke();
        
        curY += 4;
        ctx.font = "11px 'Roboto Mono', monospace";
        
        rows.forEach(row => {
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText(`#${row.idx}`, x + padding, curY);

            ctx.fillStyle = row.color;
            ctx.beginPath(); 
            ctx.arc(x + padding + 36, curY + 4, 3, 0, Math.PI*2); 
            ctx.fill();

            ctx.fillStyle = '#f8fafc';
            ctx.fillText(`${row.dur}s`, x + padding + 60, curY);

            if(row.diff !== '-') {
                ctx.fillStyle = row.diff.includes('+') ? '#4ade80' : '#f87171'; 
                if(row.diff === '0.0') ctx.fillStyle = '#64748b';
                ctx.fillText(row.diff, x + padding + 100, curY);
            }
            curY += lineHeight;
        });
    }

    exportConfig() {
        const nodesToExport = this.gwConfig.pathNodes;
        if (nodesToExport.length === 0) { alert("無可匯出的路口數據。"); return; }

        const exportData = {
            meta: {
                mode: 'greenwave',
                timestamp: new Date().toISOString(),
                description: `Green Wave (${this.gwConfig.designSpeed}km/h)`
            },
            configs: {}
        };

        let count = 0;
        nodesToExport.forEach(nodeId => {
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            if (tfl) {
                exportData.configs[nodeId] = {
                    cycleDuration: tfl.cycleDuration,
                    timeShift: tfl.timeShift || 0,
                    schedule: tfl.schedule,
                    optMode: tfl.optMode,
                    gwIndex: tfl.gwIndex
                };
                count++;
            }
        });

        if (count === 0) { alert("無資料。"); return; }

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timeStr = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, '');
        a.download = `traffic_gw_${timeStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ★★★ 修正後的 Import Logic：重建視覺狀態 ★★★
    importConfig(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const configs = data.configs || data; 
                let count = 0;
                
                // 用於重建順序的暫存陣列
                const importedNodes = [];

                // 1. 還原 Meta 數據 (例如設計速率)
                if (data.meta && data.meta.description) {
                    const match = data.meta.description.match(/Green Wave \((\d+)km\/h\)/);
                    if (match && match[1]) {
                        this.gwConfig.designSpeed = parseInt(match[1]);
                    }
                }

                // 2. 套用設定到 Traffic Lights 並收集 Node 資訊
                Object.keys(configs).forEach(nodeId => {
                    const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
                    const cfg = configs[nodeId];
                    if (tfl && cfg) {
                        if (!this.originalSchedules[nodeId]) {
                            this.originalSchedules[nodeId] = JSON.parse(JSON.stringify(tfl.schedule));
                            this.originalOffsets[nodeId] = tfl.timeShift || 0;
                            this.originalCycles[nodeId] = tfl.cycleDuration;
                        }
                        if (cfg.schedule) tfl.schedule = cfg.schedule;
                        if (cfg.cycleDuration) tfl.cycleDuration = cfg.cycleDuration;
                        if (cfg.timeShift !== undefined) tfl.timeShift = cfg.timeShift;
                        if (cfg.optMode) tfl.optMode = cfg.optMode;
                        if (cfg.gwIndex) {
                            tfl.gwIndex = cfg.gwIndex;
                            // 收集有 gwIndex 的節點，用於重建路徑清單
                            importedNodes.push({ id: nodeId, index: cfg.gwIndex });
                        }
                        count++;
                    }
                });

                event.target.value = '';

                if (count > 0) {
                    // 3. 重建路徑與 UI 狀態
                    if (importedNodes.length > 0) {
                        // 依照 gwIndex 排序
                        importedNodes.sort((a, b) => a.index - b.index);
                        
                        // 重建路徑節點清單
                        this.gwConfig.pathNodes = importedNodes.map(n => n.id);
                        
                        // 設定起點與終點
                        this.gwConfig.startNodeId = this.gwConfig.pathNodes[0];
                        this.gwConfig.endNodeId = this.gwConfig.pathNodes[this.gwConfig.pathNodes.length - 1];
                        
                        // 全選顯示 (Overlay)
                        this.visibleOverlayIds = new Set(this.gwConfig.pathNodes);
                        
                        // (選擇性) 計算路徑詳細資訊以顯示距離等
                        // 雖然無法完全還原 Links (JSON沒存)，但可透過 calculateRoutePath 的部分邏輯或 pathfinder 來補全
                        // 這裡為了讓 UI 的 "路徑資訊" 顯示正確，我們嘗試重新搜尋一次路徑
                        // 這樣能拿到 distances 和 hasTurns 狀態
                        if (this.gwConfig.startNodeId && this.gwConfig.endNodeId) {
                            this.calculateRoutePath(); 
                        }
                    }

                    alert(`匯入成功 (${count} 路口)。`);
                    this.statusText.textContent = "Imported";
                    this.statusText.style.color = "#8b5cf6"; 
                    
                    // 4. 更新畫面
                    this.renderUI(); 
                    this.triggerRedraw(); 
                } else {
                    alert("匯入失敗：無符合路口。");
                }
            } catch (err) {
                console.error(err);
                alert("匯入失敗：格式錯誤。");
            }
        };
        reader.readAsText(file);
    }
}

const optimizerController = new OptimizerController();