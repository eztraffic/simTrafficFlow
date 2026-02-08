// 獨立的時空圖檢視器類別
class TimeSpaceDiagramViewer {
    constructor() {
        this.modalId = 'tsd-modal';
        this.canvasId = 'tsd-canvas';
        this.isVisible = false;
        this.showFwd = true;
        this.showRev = true;
    }

    show(data) {
        this.data = data;
        this.createDOM();
        this.draw();
        this.isVisible = true;
    }

    hide() {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.remove();
        this.isVisible = false;
    }

    createDOM() {
        this.hide();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = this.modalId;
        Object.assign(modalOverlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '9999',
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        });

        const content = document.createElement('div');
        Object.assign(content.style, {
            backgroundColor: '#fff', width: '95%', maxWidth: '1200px', height: '85vh',
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            padding: '12px 16px', borderBottom: '1px solid #eee',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#f8f9fa', color: '#333'
        });

        const titleArea = document.createElement('div');
        titleArea.style.display = 'flex';
        titleArea.style.alignItems = 'center';
        titleArea.style.gap = '15px';

        const titleText = document.createElement('span');
        titleText.style.fontWeight = 'bold';
        titleText.style.fontSize = '1.1rem';

        // ★★★ 根據 forwardPassable 決定標題 ★★★
        const forwardPassable = this.data.forwardPassable !== false;
        if (this.data.isBidirectional) {
            titleText.textContent = "📉 雙向路徑時空圖 (Dual-Direction TSD)";
        } else if (!forwardPassable) {
            titleText.textContent = "📉 逆向路徑時空圖 (Reverse-Only TSD)";
        } else {
            titleText.textContent = "📉 路徑時空圖 (Time-Space Diagram)";
        }
        titleArea.appendChild(titleText);

        const legendArea = document.createElement('div');
        Object.assign(legendArea.style, {
            fontSize: '0.8rem', display: 'flex', gap: '10px', userSelect: 'none'
        });

        const createLegendBtn = (label, color, borderColor, isFwd) => {
            const btn = document.createElement('div');
            Object.assign(btn.style, {
                display: 'flex', alignItems: 'center', cursor: 'pointer',
                padding: '4px 8px', borderRadius: '4px', transition: 'all 0.2s',
                border: '1px solid transparent'
            });

            const updateState = () => {
                const isActive = isFwd ? this.showFwd : this.showRev;
                btn.style.opacity = isActive ? '1' : '0.4';
                btn.style.filter = isActive ? 'none' : 'grayscale(100%)';
                btn.style.backgroundColor = isActive ? '#fff' : '#f0f0f0';
                btn.style.borderColor = isActive ? '#ddd' : 'transparent';
            };

            const dot = document.createElement('span');
            Object.assign(dot.style, {
                width: '12px', height: '12px', marginRight: '6px',
                backgroundColor: color, border: `1px solid ${borderColor}`
            });

            btn.appendChild(dot);
            btn.appendChild(document.createTextNode(label));

            btn.onclick = () => {
                if (isFwd) this.showFwd = !this.showFwd;
                else this.showRev = !this.showRev;
                updateState();
                this.draw();
            };

            updateState();
            return btn;
        };

        // ★★★ 修改：根據 forwardPassable 決定圖例顯示 ★★★
        if (forwardPassable) {
            // 順向可通行：顯示順向按鈕
            const fwdBtn = createLegendBtn('順向 (Fwd)', 'rgba(76, 175, 80, 0.4)', 'green', true);
            legendArea.appendChild(fwdBtn);
        } else {
            // 順向不可通行：顯示「逆向」按鈕（實際上是唯一方向）
            const revOnlyBtn = createLegendBtn('逆向 (Rev)', 'rgba(33, 150, 243, 0.4)', 'blue', true);
            legendArea.appendChild(revOnlyBtn);
        }

        if (this.data.isBidirectional) {
            const revBtn = createLegendBtn('逆向 (Rev)', 'rgba(33, 150, 243, 0.4)', 'blue', false);
            legendArea.appendChild(revBtn);
        }

        titleArea.appendChild(legendArea);
        header.appendChild(titleArea);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '✕';
        Object.assign(closeBtn.style, {
            background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#666'
        });
        closeBtn.onclick = () => this.hide();
        header.appendChild(closeBtn);

        const canvasContainer = document.createElement('div');
        Object.assign(canvasContainer.style, {
            flex: '1', position: 'relative', overflow: 'hidden', padding: '10px', backgroundColor: '#fff'
        });

        const canvas = document.createElement('canvas');
        canvas.id = this.canvasId;
        canvasContainer.appendChild(canvas);

        content.appendChild(header);
        content.appendChild(canvasContainer);
        modalOverlay.appendChild(content);
        document.body.appendChild(modalOverlay);

        modalOverlay.onclick = (e) => { if (e.target === modalOverlay) this.hide(); };

        new ResizeObserver(() => this.draw()).observe(canvasContainer);
    }

    draw() {
        const canvas = document.getElementById(this.canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;

        const w = container.clientWidth;
        const h = container.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
        }

        ctx.resetTransform();
        ctx.scale(dpr, dpr);

        const margin = { top: 40, right: 30, bottom: 50, left: 70 };
        const graphW = w - margin.left - margin.right;
        const graphH = h - margin.top - margin.bottom;

        const displayCycles = 3;
        const maxCycle = this.data.maxCycle;
        const maxTime = maxCycle * displayCycles;
        const maxDist = this.data.totalDist;

        const timeToX = (t) => margin.left + (t / maxTime) * graphW;
        const distToY = (d) => margin.top + graphH - ((d / maxDist) * graphH);

        // 1. 背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        // 2. 網格
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let t = 0; t <= maxTime; t += maxCycle / 2) {
            const x = timeToX(t);
            const isFullCycle = t % maxCycle === 0;
            ctx.strokeStyle = isFullCycle ? '#e0e0e0' : '#f5f5f5';
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + graphH);

            if (isFullCycle) {
                ctx.fillStyle = '#666';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${t}s`, x, margin.top + graphH + 15);
            }
        }
        ctx.stroke();

        // 3. 繪製路口燈號
        const barHeight = 16;
        const halfBar = barHeight / 2;
        const signalColors = {
            'Green': '#4caf50',
            'Yellow': '#ffc107',
            'Red': '#e53935'
        };

        const drawSignalBar = (node, phases, offsetY, height) => {
            const nodeCycle = node.cycle || maxCycle;
            const startC = Math.floor(-node.offset / nodeCycle) - 1;
            const endC = Math.ceil((maxTime - node.offset) / nodeCycle) + 1;

            for (let c = startC; c <= endC; c++) {
                const cycleBase = c * nodeCycle;
                let currentRelTime = 0;

                phases.forEach(phase => {
                    const absStart = cycleBase + node.offset + currentRelTime;
                    const absEnd = absStart + phase.duration;
                    const x1 = timeToX(absStart);
                    const x2 = timeToX(absEnd);
                    const drawX1 = Math.max(margin.left, x1);
                    const drawX2 = Math.min(margin.left + graphW, x2);

                    if (drawX2 > drawX1) {
                        ctx.fillStyle = signalColors[phase.signal] || '#eee';
                        ctx.fillRect(drawX1, distToY(node.dist) + offsetY, (drawX2 - drawX1) + 0.5, height);
                    }
                    currentRelTime += phase.duration;
                });
            }
        };

        this.data.nodes.forEach(node => {
            const y = distToY(node.dist);

            ctx.strokeStyle = '#ddd';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, y);
            ctx.lineTo(margin.left + graphW, y);
            ctx.stroke();

            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Node ${node.id}`, margin.left - 10, y - 6);
            ctx.font = '10px sans-serif';
            ctx.fillStyle = '#888';
            ctx.fillText(`C:${node.cycle}s`, margin.left - 10, y + 6);

            if (this.data.isBidirectional && node.reversePhases) {
                if (this.showFwd) drawSignalBar(node, node.phases, -halfBar, halfBar - 1);
                if (this.showRev) drawSignalBar(node, node.reversePhases, 1, halfBar - 1);
                if (this.showFwd && this.showRev) {
                    ctx.fillStyle = '#fff'; ctx.fillRect(margin.left, y - 0.5, graphW, 1);
                }
            } else {
                if (this.showFwd) drawSignalBar(node, node.phases, -halfBar / 2, barHeight);
            }
        });

        // 4. 計算並繪製綠波
        const speedMs = this.data.speed / 3.6;
        if (speedMs <= 0 || this.data.nodes.length < 2) return;

        const getGreenStatus = (node, direction) => {
            const phases = (direction === 1) ? node.phases : (node.reversePhases || node.phases);
            const intervals = [];
            let accum = 0;
            phases.forEach(p => {
                if (p.signal === 'Green') intervals.push({ start: accum, end: accum + p.duration });
                accum += p.duration;
            });
            return (localTime) => intervals.some(i => localTime >= i.start && localTime <= i.end);
        };

        const nodeCheckersFwd = this.data.nodes.map(n => ({ ...n, checkGreen: getGreenStatus(n, 1) }));
        const nodeCheckersRev = this.data.isBidirectional ? this.data.nodes.map(n => ({ ...n, checkGreen: getGreenStatus(n, -1) })) : [];

        // ★★★ 重構：先計算綠波帶，再根據物理可通行性決定繪製 ★★★
        const simulateBands = (checkers, direction) => {
            const travelTimeTotal = maxDist / speedMs;
            const scanStart = -maxCycle;
            const scanEnd = maxTime + maxCycle;
            const step = 0.5;

            let activeBandStart = null;
            const validBands = [];

            for (let t = scanStart; t <= scanEnd; t += step) {
                let allGreen = true;
                for (let node of checkers) {
                    let arrivalTime;
                    if (direction === 1) arrivalTime = t + (node.dist / speedMs);
                    else arrivalTime = t + (maxDist - node.dist) / speedMs;

                    const nodeCycle = node.cycle || maxCycle;
                    let localTime = (arrivalTime - node.offset) % nodeCycle;
                    if (localTime < 0) localTime += nodeCycle;

                    if (!node.checkGreen(localTime)) {
                        allGreen = false;
                        break;
                    }
                }

                if (allGreen) {
                    if (activeBandStart === null) activeBandStart = t;
                } else {
                    if (activeBandStart !== null) {
                        if (t - activeBandStart >= 1.0) validBands.push({ start: activeBandStart, end: t - step });
                        activeBandStart = null;
                    }
                }
            }
            if (activeBandStart !== null) validBands.push({ start: activeBandStart, end: scanEnd });

            return validBands;
        };

        const drawBands = (validBands, direction, colorFill, colorStroke) => {
            const travelTimeTotal = maxDist / speedMs;

            validBands.forEach(band => {
                const t1 = band.start;
                const t2 = band.end;
                let px1, px2, px3, px4;
                let pyStart, pyEnd;

                if (direction === 1) {
                    px1 = timeToX(t1); px2 = timeToX(t2);
                    px3 = timeToX(t2 + travelTimeTotal); px4 = timeToX(t1 + travelTimeTotal);
                    pyStart = distToY(0); pyEnd = distToY(maxDist);
                } else {
                    px1 = timeToX(t1); px2 = timeToX(t2);
                    px3 = timeToX(t2 + travelTimeTotal); px4 = timeToX(t1 + travelTimeTotal);
                    pyStart = distToY(maxDist); pyEnd = distToY(0);
                }

                if (Math.max(px1, px2, px3, px4) < 0 || Math.min(px1, px2, px3, px4) > w) return;

                ctx.beginPath();
                ctx.moveTo(px1, pyStart); ctx.lineTo(px2, pyStart);
                ctx.lineTo(px3, pyEnd); ctx.lineTo(px4, pyEnd);
                ctx.closePath();

                if (direction === -1) ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = colorFill;
                ctx.fill();
                if (direction === -1) ctx.globalCompositeOperation = 'source-over';

                ctx.strokeStyle = colorStroke;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px1, pyStart); ctx.lineTo(px4, pyEnd);
                ctx.moveTo(px2, pyStart); ctx.lineTo(px3, pyEnd);
                ctx.stroke();

                const width = t2 - t1;
                if (width > 1.0 && px1 > 0 && px1 < w) {
                    ctx.fillStyle = (direction === 1) ? '#2e7d32' : '#1565c0';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${width.toFixed(1)}s`, (px1 + px2) / 2, pyStart + (direction === 1 ? -5 : 15));
                }
            });
        };

        // ★★★ 計算順向與逆向的綠波帶 ★★★
        const forwardPassable = this.data.forwardPassable !== false;

        // 當順向不可通行時，雖然我們取名為 fwdCheckers/fwdBands，但實際上這些資料代表逆向路徑
        // 且 node.dist 已經被反轉 (Node 0 = MaxDist)。
        // 因此物理上車輛是從 MaxDist 往 0 移動，必須使用 direction = -1 的公式來計算到達時間。
        const calcDirection = forwardPassable ? 1 : -1;

        const fwdBands = simulateBands(nodeCheckersFwd, calcDirection);
        const revBands = this.data.isBidirectional && nodeCheckersRev.length > 0
            ? simulateBands(nodeCheckersRev, -1)
            : [];

        // ★★★ 繪製邏輯：根據 forwardPassable 決定繪製策略 ★★★
        if (forwardPassable) {
            // 順向可通行：正常繪製順向及逆向
            const fwdPassable = fwdBands.length > 0;
            const revPassable = revBands.length > 0;

            if (fwdPassable && this.showFwd) {
                drawBands(fwdBands, 1, 'rgba(76, 175, 80, 0.25)', 'rgba(46, 125, 50, 0.6)');
            }
            if (this.data.isBidirectional && this.showRev && revPassable) {
                drawBands(revBands, -1, 'rgba(33, 150, 243, 0.25)', 'rgba(21, 101, 192, 0.6)');
            }
        } else {
            // ★★★ 順向不可通行：主路徑實際上是逆向路徑 ★★★
            // fwdBands 現在是用 calcDirection = -1 正確計算出來的
            const mainPathPassable = fwdBands.length > 0;
            if (mainPathPassable && this.showFwd) {
                drawBands(fwdBands, -1, 'rgba(33, 150, 243, 0.25)', 'rgba(21, 101, 192, 0.6)');
            }
        }

        ctx.fillStyle = '#333';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("Time (seconds)", margin.left + graphW / 2, h - 15);

        ctx.save();
        ctx.translate(20, margin.top + graphH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText("Distance (meters)", 0, 0);
        ctx.restore();
    }
}

// 主控制器
class OptimizerController {
    constructor() {
        this.simulation = null;
        this.isActive = false;
        this.currentMode = 'greenwave';

        this.panel = document.getElementById('opt-panel');
        this.statusText = document.getElementById('opt-status');
        this.optionsContainer = this.panel ? this.panel.querySelector('.panel-options') : null;
        this.actionContainer = this.panel ? this.panel.querySelector('.panel-actions') : null;

        const headerTitle = this.panel ? this.panel.querySelector('.panel-header-mini span') : null;
        if (headerTitle) headerTitle.textContent = "🚦 號誌優化";

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

        this.saturationFlow = 1800;
        this.originalSchedules = {};
        this.originalOffsets = {};
        this.originalCycles = {};
        this.flowCounts = {};
        this.pickingMode = null;
        this.cardOffsets = {};
        this.overlayHitboxes = [];
        this.dragState = { active: false, nodeId: null, startX: 0, startY: 0 };
        this.visibleOverlayIds = new Set();

        // --- 新增屬性 ---
        this.isMinimized = false;
        this.dockIcon = null;

        this.looper = new OptimizationLooper(this);
        this.isIterating = false;
        this.realtimeLinkSpeeds = {};
        this.tsdViewer = new TimeSpaceDiagramViewer();

        // ★★★ 初始化 Dock UI 與樣式 ★★★
        this.injectCustomStyles();
        this.createDockIcon();
        this.bindGlobalEvents();
    }

    // ★★★ 修改：注入 CSS，設定 1.5秒 動畫 ★★★
    injectCustomStyles() {
        if (document.getElementById('opt-custom-styles')) return;
        const style = document.createElement('style');
        style.id = 'opt-custom-styles';
        style.textContent = `
            /* 縮小按鈕樣式 */
            .btn-win-minimize {
                background: transparent;
                border: none;
                color: #666;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 4px;
                font-weight: bold;
                font-size: 16px;
                line-height: 1;
                margin-left: auto;
                margin-right: 8px;
            }
            .btn-win-minimize:hover {
                background-color: #e0e0e0;
                color: #000;
            }

            /* Dock Icon 樣式 */
            #opt-dock-icon {
                position: fixed;
                bottom: 30px; 
                right: 80px; /* 位於 Pegman 左側 */
                width: 40px;
                height: 40px;
                background-color: #1f2937;
                border: 2px solid #8b5cf6;
                border-radius: 50%;
                display: none;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                z-index: 2000;
                transition: transform 0.2s; /* Icon 本身的 hover 效果維持快速 */
                font-size: 20px;
            }
            #opt-dock-icon:hover {
                transform: scale(1.1);
                background-color: #374151;
            }
            
            /* ★★★ 面板動畫過渡設定：改為 1.5s ★★★ */
            #opt-panel {
                /* 使用 cubic-bezier 模擬吸入效果的非線性速度 */
                transition: transform 1.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 1.5s ease-in-out;
                /* 明確設定 transform-origin 為中心 */
                transform-origin: center center;
                will-change: transform, opacity;
            }
        `;
        document.head.appendChild(style);
    }

    // ★★★ 新增：建立 Dock 圖示 ★★★
    createDockIcon() {
        if (document.getElementById('opt-dock-icon')) return;

        this.dockIcon = document.createElement('div');
        this.dockIcon.id = 'opt-dock-icon';
        this.dockIcon.innerHTML = '🚦'; // 號誌圖示
        this.dockIcon.title = "還原號誌優化面板";

        this.dockIcon.onclick = () => {
            this.toggleMinimize(false);
        };

        document.body.appendChild(this.dockIcon);
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
        this.isIterating = false;
        if (this.isActive) this.renderUI();
        this.triggerRedraw();
    }

    setActive(active) {
        this.isActive = active;
        if (this.panel) {
            if (active) {
                if (this.isMinimized) {
                    // 如果之前是最小化的，還原它
                    this.toggleMinimize(false);
                } else {
                    this.panel.style.display = 'flex';
                    // 確保沒有殘留的 transform
                    this.panel.style.transform = '';
                    this.panel.style.opacity = '1';
                }
                this.renderUI();
                this.triggerRedraw();
            } else {
                this.panel.style.display = 'none';
                if (this.dockIcon) this.dockIcon.style.display = 'none';
                this.isMinimized = false;
            }
        }
    }


    triggerRedraw() {
        window.dispatchEvent(new Event('resize'));
    }

    bindGlobalEvents() {
        const btnStart = document.getElementById('btn-opt-start');
        if (btnStart) {
            btnStart.textContent = "執行優化";
            btnStart.onclick = () => this.runOptimization();
        }

        const btnExport = document.getElementById('btn-opt-export');
        if (btnExport) {
            btnExport.onclick = () => this.exportConfig();
        }

        const fileImport = document.getElementById('file-opt-import');
        if (fileImport) {
            const newImport = fileImport.cloneNode(true);
            fileImport.parentNode.replaceChild(newImport, fileImport);
            newImport.addEventListener('change', (e) => this.importConfig(e));
        }

        const btnReset = document.getElementById('btn-opt-reset');
        if (btnReset) btnReset.remove();
    }

    renderUI() {
        if (!this.optionsContainer) return;
        this.optionsContainer.innerHTML = '';

        // --- 1. 修改 Header (加入縮小按鈕) ---
        const header = this.panel.querySelector('.panel-header-mini');
        if (header) {
            // 清空舊內容並重新建立結構
            header.innerHTML = '';

            const titleSpan = document.createElement('span');
            titleSpan.innerHTML = "🚦 號誌優化";
            header.appendChild(titleSpan);

            const statusSpan = document.createElement('span');
            statusSpan.id = 'opt-status';
            statusSpan.className = 'stats-info';
            statusSpan.textContent = this.statusText ? this.statusText.textContent : "Ready";
            statusSpan.style.marginLeft = "8px";
            header.appendChild(statusSpan);
            this.statusText = statusSpan; // 更新參照

            // 加入縮小按鈕 (_)
            const minBtn = document.createElement('button');
            minBtn.className = 'btn-win-minimize';
            minBtn.innerHTML = '－'; // Windows 風格橫線
            minBtn.title = "最小化";
            minBtn.onclick = (e) => {
                e.stopPropagation(); // 防止觸發拖曳
                this.toggleMinimize(true);
            };
            header.appendChild(minBtn);
        }

        // 1. 參數設定區 (原代碼)
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

        this.renderPathSelectorUI();
        this.renderRouteInfoUI();
        this.renderNodeListAndProgressUI();
        this.updateActionButton();
        if (this.isIterating) {
            this.updateActionButtonToIteration();
        }
    }

    renderPathSelectorUI() {
        const pickGroup = document.createElement('div');
        pickGroup.className = 'path-selector-group';
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
                    display:flex; align-items:center; justify-content:center; 
                    padding:4px; border:1px solid #ccc; border-radius:4px; 
                    cursor:pointer; font-size:0.8rem; height:32px; width:100%; background:#f8f9fa;">
                    <span style="margin-right:4px;">${icon}</span>
                    <span style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.75rem;">${valueText}</span>
                    ${isSet ? '<span class="btn-clear-selection" data-type="' + type + '" style="margin-left:4px; color:#999; font-size:0.7rem;">✕</span>' : ''}
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
    }

    renderRouteInfoUI() {
        if (this.gwConfig.pathNodes.length > 1) {
            const infoDiv = document.createElement('div');
            infoDiv.style.fontSize = '0.75rem';
            infoDiv.style.color = '#64748b';
            infoDiv.style.marginBottom = '6px';
            infoDiv.style.textAlign = 'center';
            infoDiv.textContent = this.getRouteInfoString();
            this.optionsContainer.appendChild(infoDiv);

            // 雙向權重滑桿
            if (this.gwConfig.isBidirectional) {
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
                // 提示訊息
                const warnDiv = document.createElement('div');
                Object.assign(warnDiv.style, {
                    background: 'rgba(59, 130, 246, 0.1)', color: '#1e40af', border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '4px', padding: '4px 8px', fontSize: '0.7rem', marginBottom: '4px'
                });
                warnDiv.innerHTML = '<i class="fa-solid fa-circle-info"></i> 轉向路徑模式：時空圖將顯示轉向時相。';
                this.optionsContainer.appendChild(warnDiv);
            }

            // --- ★★★ 按鈕群組區域 ★★★ ---
            const btnGroup = document.createElement('div');
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '6px'; // 按鈕間距
            btnGroup.style.marginTop = '4px';
            btnGroup.style.marginBottom = '8px';

            // 左側按鈕: 檢視時空圖
            const tsdBtn = document.createElement('button');
            tsdBtn.className = 'btn-mini';
            tsdBtn.style.flex = '1';
            tsdBtn.style.background = '#ffffff';
            tsdBtn.style.color = '#334155';
            tsdBtn.style.border = '1px solid #cbd5e1';
            tsdBtn.style.cursor = 'pointer';
            tsdBtn.onmouseover = () => { tsdBtn.style.background = '#f1f5f9'; };
            tsdBtn.onmouseout = () => { tsdBtn.style.background = '#ffffff'; };
            tsdBtn.innerHTML = '<i class="fa-solid fa-chart-line"></i> 檢視路徑時空圖';
            tsdBtn.onclick = () => this.openTimeSpaceDiagram();
            btnGroup.appendChild(tsdBtn);

            // 右側按鈕: 執行優化 (僅在迭代模式啟動後顯示)
            if (this.isIterating) {
                const quickOptBtn = document.createElement('button');
                quickOptBtn.className = 'btn-mini';
                quickOptBtn.style.flex = '1';
                quickOptBtn.style.background = '#ecfdf5'; // 淺綠底
                quickOptBtn.style.color = '#059669';      // 深綠字
                quickOptBtn.style.border = '1px solid #6ee7b7';
                quickOptBtn.style.cursor = 'pointer';
                quickOptBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> 執行優化';

                quickOptBtn.onmouseover = () => { quickOptBtn.style.background = '#d1fae5'; };
                quickOptBtn.onmouseout = () => { quickOptBtn.style.background = '#ecfdf5'; };

                quickOptBtn.onclick = () => {
                    // 僅執行靜態計算，不觸發 looper 迭代
                    this.applyGreenWave();
                    this.triggerRedraw();
                    this.updateStatusText("Updated (Static)", "#10b981");

                    // 如果時空圖正開著，立即刷新它
                    if (this.tsdViewer && this.tsdViewer.isVisible) {
                        this.openTimeSpaceDiagram();
                    }
                };
                btnGroup.appendChild(quickOptBtn);
            }

            this.optionsContainer.appendChild(btnGroup);
            // --- 按鈕群組結束 ---
        }
    }

    renderNodeListAndProgressUI() {
        // Node 列表
        if (this.gwConfig.pathNodes.length > 0) {
            const listHeader = document.createElement('div');
            listHeader.style.fontSize = '0.75rem';
            listHeader.style.fontWeight = '600';
            listHeader.style.marginTop = '8px';
            listHeader.style.marginBottom = '4px';
            listHeader.textContent = `路徑節點 (${this.gwConfig.pathNodes.length})`;
            this.optionsContainer.appendChild(listHeader);

            const gridContainer = document.createElement('div');
            Object.assign(gridContainer.style, {
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px',
                maxHeight: '120px', overflowY: 'auto', border: '1px solid #eee',
                padding: '4px', borderRadius: '4px', backgroundColor: '#f9f9f9'
            });

            this.gwConfig.pathNodes.forEach((nodeId) => {
                const item = document.createElement('label');
                Object.assign(item.style, {
                    display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem',
                    padding: '2px 4px', background: '#fff', border: '1px solid #ddd', borderRadius: '3px', cursor: 'pointer',
                    whiteSpace: 'nowrap', overflow: 'hidden'
                });

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.style.cursor = 'pointer';
                checkbox.checked = this.visibleOverlayIds.has(nodeId);
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) this.visibleOverlayIds.add(nodeId); else this.visibleOverlayIds.delete(nodeId);
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

        // 進度條 (保持不變)
        const progressContainer = document.createElement('div');
        progressContainer.id = 'opt-progress-container';
        progressContainer.style.marginTop = '8px';
        progressContainer.style.display = 'none';
        progressContainer.innerHTML = `<div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#666; margin-bottom:2px;"><span>採樣進度</span><span id="opt-progress-text">0%</span></div><div style="width:100%; height:4px; background:#eee; border-radius:2px; overflow:hidden;"><div id="opt-progress-bar" style="width:0%; height:100%; background:#3b82f6; transition:width 0.2s;"></div></div>`;
        this.optionsContainer.appendChild(progressContainer);
    }

    // ★★★ 修改：縮放邏輯 (1.5秒 緩慢動畫 - 修正方向與座標計算) ★★★
    toggleMinimize(shouldMinimize) {
        if (!this.panel || !this.dockIcon) return;

        // 防止動畫中重複點擊
        if (this.isAnimating) return;
        this.isAnimating = true;

        if (shouldMinimize) {
            // --- 執行縮小 (由上至下吸入) ---
            this.isMinimized = true;
            this.dockIcon.style.display = 'flex';

            // 關鍵：先強制 Reflow 讓 Dock Icon 有實際座標，否則 getBoundingClientRect 只有 (0,0)
            this.dockIcon.offsetHeight;

            const iconRect = this.dockIcon.getBoundingClientRect();
            const panelRect = this.panel.getBoundingClientRect();

            const iconCenterX = iconRect.left + iconRect.width / 2;
            const iconCenterY = iconRect.top + iconRect.height / 2;

            const panelCenterX = panelRect.left + panelRect.width / 2;
            const panelCenterY = panelRect.top + panelRect.height / 2;

            const transX = iconCenterX - panelCenterX;
            const transY = iconCenterY - panelCenterY;

            this.panel.style.transformOrigin = 'center center';
            this.panel.style.transform = `translate(${transX}px, ${transY}px) scale(0.05)`;
            this.panel.style.opacity = '0';

            setTimeout(() => {
                this.panel.style.display = 'none';
                this.isAnimating = false;
            }, 1500);

        } else {
            // --- 執行還原 (由下至上彈出) ---
            this.isMinimized = false;

            // 1. 先顯示面板但暫停動畫 + 清除舊 Transform 以便測量原始位置
            this.panel.style.display = 'flex';
            this.panel.style.transition = 'none';
            this.panel.style.transform = '';

            // 2. 強制 Reflow 並測量目前的原始佈局位置
            this.panel.offsetHeight;

            const panelRect = this.panel.getBoundingClientRect();
            const iconRect = this.dockIcon.getBoundingClientRect();

            const iconCenterX = iconRect.left + iconRect.width / 2;
            const iconCenterY = iconRect.top + iconRect.height / 2;
            const panelCenterX = panelRect.left + panelRect.width / 2;
            const panelCenterY = panelRect.top + panelRect.height / 2;

            const transX = iconCenterX - panelCenterX;
            const transY = iconCenterY - panelCenterY;

            // 3. 設定動畫起始狀態 (瞬間移動到 Icon 位置)
            this.panel.style.transformOrigin = 'center center';
            this.panel.style.transform = `translate(${transX}px, ${transY}px) scale(0.05)`;
            this.panel.style.opacity = '0';

            // 4. 強制渲染起始狀態
            this.panel.offsetHeight;

            // 5. 啟動過渡效果並還原至原始位置
            this.panel.style.transition = 'transform 1.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 1.5s ease-in-out';
            this.panel.style.transform = '';
            this.panel.style.opacity = '1';

            setTimeout(() => {
                this.dockIcon.style.display = 'none';
                this.isAnimating = false;
            }, 1500);
        }
    }

    updateActionButton() {
        const btnStart = document.getElementById('btn-opt-start');
        if (!btnStart) return;
        btnStart.disabled = this.gwConfig.pathNodes.length < 2;
    }

    // --- Open TSD (修正版：處理雙向邏輯及順向不可通行情況) ---
    openTimeSpaceDiagram() {
        if (this.gwConfig.pathNodes.length < 2) return;

        const nodesData = [];
        let maxCycle = 0;

        const isBidirectional = this.gwConfig.isBidirectional;
        const forwardPassable = this.gwConfig.forwardPassable !== false; // 預設為 true
        const net = this.simulation.network;
        const revLinks = this.gwConfig.reversePathLinks || [];

        const totalDistance = this.gwConfig.pathDistances[this.gwConfig.pathDistances.length - 1];

        this.gwConfig.pathNodes.forEach((nodeId, idx) => {
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            let dist = this.gwConfig.pathDistances[idx];

            // ★★★ 修正：當順向不可通行（使用逆向路徑）時，反轉距離 ★★★
            // 這樣 Node 0 (逆向起點) 會在 MaxDist (圖表頂部)
            // Node N (逆向終點) 會在 0 (圖表底部)
            // 視覺上形成 Top-Left -> Bottom-Right 的效果
            if (!forwardPassable) {
                dist = totalDistance - dist;
            }

            if (tfl) {
                if (tfl.cycleDuration > maxCycle) maxCycle = tfl.cycleDuration;

                // ★★★ 修改：根據 forwardPassable 決定如何計算時相 ★★★
                let fwdPhases = null;
                let revPhases = null;

                const inLink = idx > 0 ? this.gwConfig.pathLinks[idx - 1] : null;
                const outLink = idx < this.gwConfig.pathLinks.length ? this.gwConfig.pathLinks[idx] : null;

                if (forwardPassable) {
                    // 順向可通行：計算順向時相
                    fwdPhases = this.getSignalSequence(nodeId, inLink, outLink, tfl);

                    if (isBidirectional) {
                        // 雙向：計算逆向時相
                        const revInLinkObj = revLinks.find(lId => net.links[lId] && net.links[lId].destination === nodeId);
                        const revOutLinkObj = revLinks.find(lId => net.links[lId] && net.links[lId].source === nodeId);
                        const revInLink = revInLinkObj ? revInLinkObj : null;
                        const revOutLink = revOutLinkObj ? revOutLinkObj : null;
                        revPhases = this.getSignalSequence(nodeId, revInLink, revOutLink, tfl);
                    }
                } else {
                    // ★★★ 順向不可通行：路徑是逆向的，以「主路徑」作為顯示的唯一方向 ★★★
                    // 當前 pathLinks 實際上是逆向路徑，所以用它來計算時相
                    fwdPhases = this.getSignalSequence(nodeId, inLink, outLink, tfl);
                    // 不設置 revPhases，因為沒有雙向
                }

                nodesData.push({
                    id: nodeId,
                    dist: dist,
                    offset: tfl.timeShift || 0,
                    cycle: tfl.cycleDuration,
                    phases: fwdPhases,
                    reversePhases: revPhases
                });
            }
        });

        if (maxCycle === 0) maxCycle = 60;

        const chartData = {
            nodes: nodesData,
            maxCycle: maxCycle,
            speed: this.gwConfig.designSpeed,
            totalDist: this.gwConfig.pathDistances[this.gwConfig.pathDistances.length - 1],
            isBidirectional: isBidirectional,
            forwardPassable: forwardPassable  // ★★★ 傳遞順向可通行性旗標 ★★★
        };

        this.tsdViewer.show(chartData);
    }

    // 獲取完整時相序列 (紅黃綠)
    getSignalSequence(nodeId, inLink, outLink, tfl) {
        let targetGroupId = null;
        const node = this.simulation.network.nodes[nodeId];

        if (node) {
            let candidates = [];

            // 1. 篩選符合出入路徑的所有 Transition (可能有多條，對應不同車道)
            if (inLink && outLink) {
                candidates = node.transitions.filter(t => t.sourceLinkId === inLink && t.destLinkId === outLink);
            } else if (!inLink && outLink) {
                // 起點模式
                candidates = node.transitions.filter(t => t.destLinkId === outLink);
            } else if (inLink && !outLink) {
                // 終點模式
                candidates = node.transitions.filter(t => t.sourceLinkId === inLink);
            }

            // 2. 優先選取「有綁定號誌群組」的規則
            const activeTransition = candidates.find(t => t.turnGroupId) || candidates[0];

            if (activeTransition) {
                targetGroupId = activeTransition.turnGroupId;
            }
        }

        const result = [];
        if (!targetGroupId) {
            result.push({ signal: 'Red', duration: tfl.cycleDuration });
            return result;
        }

        for (const period of tfl.schedule) {
            const signal = period.signals[targetGroupId];
            result.push({ signal: signal, duration: period.duration });
        }
        return result;
    }

    // ★★★ 補回的 getGreenPhaseStart 方法 ★★★
    getGreenPhaseStart(nodeId, inLinkId, outLinkId, tfl) {
        if (!tfl || !tfl.schedule) return 0;
        let targetGroupId = null;
        const node = this.simulation.network.nodes[nodeId];

        if (node) {
            let candidates = [];
            if (inLinkId && outLinkId) {
                candidates = node.transitions.filter(t => t.sourceLinkId === inLinkId && t.destLinkId === outLinkId);
            } else if (!inLinkId && outLinkId) {
                candidates = node.transitions.filter(t => t.destLinkId === outLinkId);
            } else if (inLinkId && !outLinkId) {
                candidates = node.transitions.filter(t => t.sourceLinkId === inLinkId);
            }
            // 優先選取綁定號誌的規則
            const activeTransition = candidates.find(t => t.turnGroupId) || candidates[0];
            if (activeTransition) targetGroupId = activeTransition.turnGroupId;
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

    handleMouseDown(worldX, worldY) {
        if (!this.isActive || !this.simulation) return false;
        if (this.pickingMode) {
            let clickedNodeId = null;
            for (const nodeId in this.simulation.network.nodes) {
                const node = this.simulation.network.nodes[nodeId];
                if (node.polygon && this.isPointInPolygon({ x: worldX, y: worldY }, node.polygon)) {
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
        for (let i = this.overlayHitboxes.length - 1; i >= 0; i--) {
            const box = this.overlayHitboxes[i];
            if (!this.visibleOverlayIds.has(box.nodeId)) continue;
            if (screenX >= box.x && screenX <= box.x + box.w &&
                screenY >= box.y && screenY <= box.y + box.h) {
                this.dragState.active = true;
                this.dragState.nodeId = box.nodeId;
                this.dragState.startX = screenX;
                this.dragState.startY = screenY;
                const currentOffset = this.cardOffsets[box.nodeId] || { x: 0, y: 0 };
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

        const net = this.simulation.network;

        // ★★★ 輔助函數：驗證路徑連續性並收集節點資訊 ★★★
        const validatePathContinuity = (pathLinks, expectedStartNode) => {
            if (!pathLinks || pathLinks.length === 0) {
                return { valid: false, nodeSeq: [], distSeq: [], totalAngleChange: 0 };
            }

            const nodeSeq = [];
            const distSeq = [];
            let totalDist = 0;
            let totalAngleChange = 0;
            let lastAngle = null;
            let prevNodeId = expectedStartNode;

            for (let i = 0; i < pathLinks.length; i++) {
                const linkId = pathLinks[i];
                const link = net.links[linkId];

                // 檢查 Link 是否存在
                if (!link) {
                    console.warn(`calculateRoutePath: Link ${linkId} not found`);
                    return { valid: false, nodeSeq: [], distSeq: [], totalAngleChange: 0 };
                }

                // 檢查連續性：Link 的 source 必須等於前一個節點
                if (link.source !== prevNodeId) {
                    console.warn(`calculateRoutePath: Path discontinuity at Link ${linkId}, expected source ${prevNodeId}, got ${link.source}`);
                    return { valid: false, nodeSeq: [], distSeq: [], totalAngleChange: 0 };
                }

                // 檢查 destination 是否有效（不是 -1 或無效值）
                if (!link.destination || link.destination === '-1' || link.destination === -1) {
                    console.warn(`calculateRoutePath: Invalid destination at Link ${linkId}: ${link.destination}`);
                    return { valid: false, nodeSeq: [], distSeq: [], totalAngleChange: 0 };
                }

                // 第一個 Link：加入起點
                if (i === 0) {
                    nodeSeq.push(link.source);
                    distSeq.push(0);
                }

                // 計算距離與角度
                totalDist += link.length || 0;
                nodeSeq.push(link.destination);
                distSeq.push(totalDist);

                if (link.lanes && link.lanes[0] && link.lanes[0].path && link.lanes[0].path.length > 1) {
                    const path = link.lanes[0].path;
                    const p1 = path[0];
                    const p2 = path[path.length - 1];
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    if (lastAngle !== null) {
                        let diff = Math.abs(angle - lastAngle);
                        if (diff > Math.PI) diff = 2 * Math.PI - diff;
                        totalAngleChange += diff;
                    }
                    lastAngle = angle;
                }

                prevNodeId = link.destination;
            }

            return { valid: true, nodeSeq, distSeq, totalAngleChange };
        };

        // 1. 計算並驗證順向路徑 (Start -> End)
        const fwdPathLinks = net.pathfinder.findRoute(startNodeId, endNodeId);
        const fwdResult = validatePathContinuity(fwdPathLinks, startNodeId);
        const forwardPassable = fwdResult.valid;

        // 2. 計算並驗證逆向路徑 (End -> Start)
        const revPathLinks = net.pathfinder.findRoute(endNodeId, startNodeId);
        const revResult = validatePathContinuity(revPathLinks, endNodeId);
        const reversePassable = revResult.valid;

        // ★★★ 如果順向和逆向都不可通行，清空資料並返回 ★★★
        if (!forwardPassable && !reversePassable) {
            this.gwConfig.pathNodes = [];
            this.gwConfig.pathLinks = [];
            this.gwConfig.reversePathLinks = [];
            this.gwConfig.pathDistances = [];
            this.gwConfig.hasTurns = false;
            this.gwConfig.forwardPassable = false;
            this.visibleOverlayIds.clear();
            return;
        }

        // ★★★ 決定主路徑：優先使用順向，若順向不可通行則使用逆向 ★★★
        let primaryPathLinks, primaryResult;

        if (forwardPassable) {
            // 順向可通行：以順向為主路徑
            primaryPathLinks = fwdPathLinks;
            primaryResult = fwdResult;
        } else {
            // 順向不可通行，逆向可通行：以逆向為主路徑
            primaryPathLinks = revPathLinks;
            primaryResult = revResult;
        }

        this.gwConfig.pathNodes = primaryResult.nodeSeq;
        this.gwConfig.pathLinks = primaryPathLinks;
        this.gwConfig.pathDistances = primaryResult.distSeq;
        this.gwConfig.hasTurns = primaryResult.totalAngleChange > 0.8;
        this.gwConfig.forwardPassable = forwardPassable;

        // 4. 判斷是否為雙向路徑
        let isBi = false;

        if (forwardPassable && reversePassable) {
            // 順向可通行時，檢查逆向是否經過相同節點
            const revNodeSet = new Set(revResult.nodeSeq);

            // 嚴格檢查：順向路徑上的每一個節點，都必須存在於逆向路徑的節點集合中
            const allNodesPresent = fwdResult.nodeSeq.every(nodeId => revNodeSet.has(nodeId));
            if (allNodesPresent) {
                isBi = true;
            }
        }
        // 注意：當順向不可通行時，isBidirectional = false，因為只有單向可通行

        this.gwConfig.reversePathLinks = isBi ? revPathLinks : [];
        this.gwConfig.isBidirectional = isBi;

        if (this.gwConfig.hasTurns && this.gwConfig.directionWeight === undefined) {
            this.gwConfig.directionWeight = 0.5;
        }

        this.visibleOverlayIds = new Set(primaryResult.nodeSeq);
    }

    getRouteInfoString() {
        const len = this.gwConfig.pathNodes.length;
        if (len < 2) return '';
        const dist = this.gwConfig.pathDistances[this.gwConfig.pathDistances.length - 1];
        const typeStr = this.gwConfig.isBidirectional ? '雙向' : '單向';
        return `路徑: ${len}路口, ${(dist / 1000).toFixed(2)}km ${typeStr}`;
    }

    update(dt) { }
    registerVehiclePass(nodeId, turnGroupId, isMotorcycle) { }

    runOptimization() {
        if (this.gwConfig.pathNodes.length < 2) { alert("無有效路徑！"); return; }

        if (this.isIterating) {
            const iterInput = document.getElementById('inp-iter-count');
            const count = iterInput ? parseInt(iterInput.value) : 5;

            let maxCycle = 60;
            this.gwConfig.pathNodes.forEach(nodeId => {
                const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
                if (tfl && tfl.cycleDuration > maxCycle) {
                    maxCycle = tfl.cycleDuration;
                }
            });
            const sampleTime = Math.ceil(maxCycle * 3);

            const btn = document.getElementById('btn-opt-start');
            if (btn) { btn.disabled = true; btn.textContent = "迭代中..."; }

            const pContainer = document.getElementById('opt-progress-container');
            if (pContainer) pContainer.style.display = 'block';

            this.looper.startIteration(count, sampleTime);
            return;
        }

        const inpSpeed = document.getElementById('inp-speed');
        if (inpSpeed) this.gwConfig.designSpeed = parseFloat(inpSpeed.value);
        const inpSat = document.getElementById('inp-sat');
        if (inpSat) this.saturationFlow = parseFloat(inpSat.value);

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

        this.statusText.textContent = "Optimized (Static)";
        this.statusText.style.color = "#10b981";

        this.isIterating = true;
        this.updateActionButtonToIteration();

        // ★★★ 新增這一行：強制刷新 UI，讓「執行優化」按鈕出現在時空圖按鈕旁邊 ★★★
        this.renderUI();
    }

    updateActionButtonToIteration() {
        const btnStart = document.getElementById('btn-opt-start');
        if (!btnStart) return;

        btnStart.textContent = "繼續迭代";

        let iterGroup = document.getElementById('iter-input-group');
        if (!iterGroup) {
            iterGroup = document.createElement('div');
            iterGroup.id = 'iter-input-group';
            iterGroup.style.display = 'inline-flex';
            iterGroup.style.alignItems = 'center';
            iterGroup.style.gap = '4px';
            iterGroup.style.marginRight = '8px';
            iterGroup.innerHTML = `
                <span style="font-size:0.7rem; color:#666;">次數:</span>
                <input type="number" id="inp-iter-count" value="5" style="width:40px; padding:2px; font-size:0.8rem; border:1px solid #ccc; border-radius:3px;">
            `;
            if (this.actionContainer) {
                this.actionContainer.insertBefore(iterGroup, this.actionContainer.firstChild);
            }
        }
    }

    onIterationSequenceComplete() {
        const btnStart = document.getElementById('btn-opt-start');
        if (btnStart) {
            btnStart.disabled = false;
            btnStart.textContent = "繼續迭代";
        }
    }

    updateProgressBar(percent, text) {
        const bar = document.getElementById('opt-progress-bar');
        const txt = document.getElementById('opt-progress-text');
        if (bar) bar.style.width = `${percent}%`;
        if (txt) txt.textContent = text;
    }

    updateStatusText(text, color) {
        if (this.statusText) {
            this.statusText.textContent = text;
            this.statusText.style.color = color;
        }
    }

    mergeFlowCounts(actualCounts, alpha = 0.5) {
        for (const [nodeId, groups] of Object.entries(actualCounts)) {
            if (!this.flowCounts[nodeId]) this.flowCounts[nodeId] = {};
            for (const [gid, actualRate] of Object.entries(groups)) {
                const oldRate = this.flowCounts[nodeId][gid] || 0;
                this.flowCounts[nodeId][gid] = oldRate * (1 - alpha) + actualRate * alpha;
            }
        }
    }

    setRealtimeLinkSpeeds(speedMap) {
        this.realtimeLinkSpeeds = speedMap;
    }

    runIterationUpdate() {
        this.applyGreenWave();
        this.triggerRedraw();
    }

    calculateTheoreticalDemand() {
        console.log("Calculating theoretical traffic demand...");
        const demandCounts = {};
        const net = this.simulation.network;
        let maxSimDuration = 1;
        this.simulation.spawners.forEach(s => {
            let d = 0; s.periods.forEach(p => d += p.duration);
            if (d > maxSimDuration) maxSimDuration = d;
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
                    if (w > 0) pPcu = p / w;
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
                        const linkOutId = route[i + 1];
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
            if (node.transitions) {
                node.transitions.forEach(t => {
                    if (t.turnGroupId && t.tempVolume > 0) {
                        if (!demandCounts[node.id]) demandCounts[node.id] = {};
                        const rate = (t.tempVolume / maxSimDuration) * 3600;
                        demandCounts[node.id][t.turnGroupId] = rate;
                        delete t.tempVolume;
                    }
                });
            }
        });

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
            if (hasYellow || !hasGreen) fixedLostTime += period.duration;
            else {
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
        const fwdLinks = this.gwConfig.pathLinks;
        // 取得在 calculateRoutePath 中計算出的逆向 Link 列表
        const revLinks = this.gwConfig.reversePathLinks || [];

        if (path.length < 2) return;

        let maxCycle = 0;
        const nodeParams = {};

        // 1. 計算 Webster 最佳週期與綠燈分配 (此區塊邏輯保持不變)
        path.forEach(nodeId => {
            const counts = this.flowCounts[nodeId] || {};
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            if (tfl) {
                const res = this.calcWebsterParams(nodeId, counts, tfl.schedule);
                if (res) {
                    if (res.cycle > maxCycle) maxCycle = res.cycle;
                    nodeParams[nodeId] = res;
                } else {
                    const origC = tfl.schedule.reduce((a, b) => a + b.duration, 0);
                    if (origC > maxCycle) maxCycle = origC;
                    nodeParams[nodeId] = { cycle: origC, newSplits: tfl.schedule.map(p => p.duration) };
                }
            }
        });

        maxCycle = Math.min(180, Math.max(60, maxCycle));
        const speedMsDefault = this.gwConfig.designSpeed / 3.6;
        const dists = this.gwConfig.pathDistances;

        // 權重計算：若是雙向則使用拉桿值，否則視為 0 (順向優先)
        const weight = this.gwConfig.isBidirectional ? (this.gwConfig.directionWeight || 0) : 0;
        const net = this.simulation.network;

        // 2. 應用設定並計算 Offset
        path.forEach((nodeId, idx) => {
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            if (!tfl) return;

            // 應用新的綠燈時間 (Split)
            const params = nodeParams[nodeId];
            let fixedTime = 0;
            let adjustableTimeInParams = 0;
            const greenIndices = [];

            tfl.schedule.forEach((period, pIdx) => {
                let isFixed = false;
                let hasYellow = false;
                let hasGreen = false;
                for (const sig of Object.values(period.signals)) {
                    if (sig === 'Yellow') hasYellow = true;
                    else if (sig === 'Green') hasGreen = true;
                }
                if (hasYellow || !hasGreen) isFixed = true;

                if (isFixed) fixedTime += params.newSplits[pIdx];
                else {
                    greenIndices.push(pIdx);
                    adjustableTimeInParams += params.newSplits[pIdx];
                }
            });

            const newTotalGreen = Math.max(0, maxCycle - fixedTime);

            tfl.schedule.forEach((period, pIdx) => {
                if (greenIndices.includes(pIdx)) {
                    let ratio = 0;
                    if (adjustableTimeInParams > 0) ratio = params.newSplits[pIdx] / adjustableTimeInParams;
                    period.duration = newTotalGreen * ratio;
                } else {
                    period.duration = params.newSplits[pIdx];
                }
            });

            tfl.cycleDuration = maxCycle;

            // --- ★★★ 核心修正開始：分別計算順向與逆向的綠燈起始點 ★★★ ---

            // A. 順向 Link 識別
            const fwdIn = idx > 0 ? fwdLinks[idx - 1] : null;
            const fwdOut = idx < fwdLinks.length ? fwdLinks[idx] : null;

            // B. 逆向 Link 識別
            let revIn = null;
            let revOut = null;
            if (this.gwConfig.isBidirectional) {
                // 從 reversePathLinks 中找出與當前 Node 相連的 Link
                // revIn: 進入此 Node (destination == nodeId)
                // revOut: 離開此 Node (source == nodeId)
                // 注意：reversePathLinks 的順序是從終點回到起點
                if (revLinks.length > 0) {
                    revIn = revLinks.find(lid => net.links[lid] && net.links[lid].destination === nodeId) || null;
                    revOut = revLinks.find(lid => net.links[lid] && net.links[lid].source === nodeId) || null;
                }
            }

            // C. 獲取各自的綠燈起始時間
            const phaseStartFwd = this.getGreenPhaseStart(nodeId, fwdIn, fwdOut, tfl);

            // 如果是雙向，計算逆向專屬的綠燈起始點；如果是單向，設為 0 或與順向相同皆可 (因 weight 為 0)
            const phaseStartRev = this.gwConfig.isBidirectional
                ? this.getGreenPhaseStart(nodeId, revIn, revOut, tfl)
                : phaseStartFwd;

            // D. 計算累計行駛時間 (Travel Time)
            if (idx === 0) {
                this.gwConfig.accumulatedTimeFwd = [0];
            }
            const accTimeFwd = this.gwConfig.accumulatedTimeFwd[idx] || 0;

            if (idx < path.length - 1) {
                const nextLinkId = fwdLinks[idx];
                const segmentDist = dists[idx + 1] - dists[idx];
                let segSpeed = speedMsDefault;
                if (this.realtimeLinkSpeeds[nextLinkId]) segSpeed = Math.max(2, this.realtimeLinkSpeeds[nextLinkId]);
                this.gwConfig.accumulatedTimeFwd[idx + 1] = accTimeFwd + (segmentDist / segSpeed);
            }

            // E. 計算 Offset
            // 順向目標：車輛到達 (accTimeFwd) 時，剛好是順向綠燈開始 (phaseStartFwd)
            const offsetFwd = accTimeFwd - phaseStartFwd;

            // 逆向目標：車輛到達 (對稱於 -accTimeFwd) 時，剛好是逆向綠燈開始 (phaseStartRev)
            // 這裡修正了原本使用 phaseStartFwd 的錯誤
            const offsetBwd = -(accTimeFwd) - phaseStartRev;

            // F. 線性插值計算最終 Shift
            let finalShift = offsetFwd * (1 - weight) + offsetBwd * weight;
            finalShift = ((finalShift % maxCycle) + maxCycle) % maxCycle;

            tfl.timeShift = finalShift;
            tfl.optMode = 'GREEN_WAVE';
            tfl.gwIndex = idx + 1;
        });
    }

    drawOverlay(ctx, worldToScreenFunc, scale) {
        if (!this.isActive || !this.simulation) return;
        const nodesToDraw = this.gwConfig.pathNodes;
        if (nodesToDraw.length === 0) return;

        this.overlayHitboxes = [];
        ctx.save();
        ctx.font = "11px 'Roboto Mono', monospace";
        ctx.textBaseline = "top";

        nodesToDraw.forEach((nodeId, idx) => {
            if (!this.visibleOverlayIds.has(nodeId)) return;
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === nodeId);
            const node = this.simulation.network.nodes[nodeId];
            if (!node || !tfl) return;

            let cx = 0, cy = 0;
            node.polygon.forEach(p => { cx += p.x; cy += p.y; });
            cx /= node.polygon.length;
            cy /= node.polygon.length;
            const center = worldToScreenFunc(cx, cy);
            const offset = this.cardOffsets[nodeId] || { x: 0, y: 0 };

            const baseX = center.x - 200 + offset.x;
            const baseY = center.y + 50 + offset.y;

            const gwIndex = idx + 1;

            if (scale <= 0.5) this.drawSimpleBadge(ctx, { x: baseX + 100, y: baseY }, tfl, nodeId, gwIndex);
            else this.drawJunctionInfoCard(ctx, baseX, baseY, nodeId, tfl, center, gwIndex);
        });
        ctx.restore();
    }

    drawSimpleBadge(ctx, pos, tfl, nodeId, gwIndex) {
        const label = `GW #${gwIndex}`;
        const color = '#8b5cf6';
        const w = 40, h = 20;
        ctx.fillStyle = color;
        ctx.fillRect(pos.x, pos.y, w, h);
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(label, pos.x + w / 2, pos.y + 4);
        this.overlayHitboxes.push({ nodeId, x: pos.x, y: pos.y, w, h });
    }

    drawJunctionInfoCard(ctx, x, y, nodeId, tfl, center, gwIndex) {
        const boxW = 180;
        const lineHeight = 16;
        const padding = 8;
        const headerH = 24;

        const rows = tfl.schedule.map((p, i) => {
            const origP = this.originalSchedules[nodeId] ? this.originalSchedules[nodeId][i] : null;
            const diff = origP ? p.duration - origP.duration : 0;
            let sigColor = '#ccc';
            const signals = Object.values(p.signals);
            if (signals.includes('Green')) sigColor = '#4ade80';
            else if (signals.includes('Yellow')) sigColor = '#facc15';
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
        ctx.fillText(`Node ${nodeId} (GW #${gwIndex})`, x + padding, y + 6);

        let curY = y + headerH + padding;
        ctx.font = "11px 'Roboto Mono', monospace";
        ctx.fillStyle = '#cbd5e1';

        const origCycle = this.originalCycles[nodeId] || 0;
        const cycleDiff = tfl.cycleDuration - origCycle;
        const cycDiffStr = Math.abs(cycleDiff) > 0.1 ? `(${cycleDiff > 0 ? '+' : ''}${cycleDiff.toFixed(0)})` : '';

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
        ctx.beginPath(); ctx.moveTo(x + 4, curY); ctx.lineTo(x + boxW - 4, curY); ctx.stroke();

        curY += 4;
        ctx.font = "11px 'Roboto Mono', monospace";

        rows.forEach(row => {
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText(`#${row.idx}`, x + padding, curY);
            ctx.fillStyle = row.color;
            ctx.beginPath();
            ctx.arc(x + padding + 36, curY + 4, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f8fafc';
            ctx.fillText(`${row.dur}s`, x + padding + 60, curY);
            if (row.diff !== '-') {
                ctx.fillStyle = row.diff.includes('+') ? '#4ade80' : '#f87171';
                if (row.diff === '0.0') ctx.fillStyle = '#64748b';
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

    importConfig(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const configs = data.configs || data;
                let count = 0;

                const importedNodes = [];

                if (data.meta && data.meta.description) {
                    const match = data.meta.description.match(/Green Wave \((\d+)km\/h\)/);
                    if (match && match[1]) {
                        this.gwConfig.designSpeed = parseInt(match[1]);
                    }
                }

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
                            importedNodes.push({ id: nodeId, index: cfg.gwIndex });
                        }
                        count++;
                    }
                });

                event.target.value = '';

                if (count > 0) {
                    if (importedNodes.length > 0) {
                        importedNodes.sort((a, b) => a.index - b.index);
                        this.gwConfig.pathNodes = importedNodes.map(n => n.id);
                        this.gwConfig.startNodeId = this.gwConfig.pathNodes[0];
                        this.gwConfig.endNodeId = this.gwConfig.pathNodes[this.gwConfig.pathNodes.length - 1];
                        this.visibleOverlayIds = new Set(this.gwConfig.pathNodes);

                        if (this.gwConfig.startNodeId && this.gwConfig.endNodeId) {
                            this.calculateRoutePath();
                        }
                    }

                    alert(`匯入成功 (${count} 路口)。`);
                    this.statusText.textContent = "Imported";
                    this.statusText.style.color = "#8b5cf6";

                    this.isIterating = true;
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