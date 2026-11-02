// --- script_timing_compare.js: Signal Timing Plan Adjustment & Left/Right Synchronous Comparison Controller ---

(function (global) {
    'use strict';

    // Deterministic Mulberry32 PRNG for 100% identical vehicle spawning across Left (Baseline) & Right (Adjusted)
    function createSeededRng(seed) {
        let a = (seed >>> 0) || 123456789;
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    class TimingCompareController {
        constructor() {
            this.isActive = false;
            this.networkData = null;
            this.baselineSim = null;
            this.adjustedSim = null;
            this.selectedNodeId = null;
            this.compareSeed = 12345;

            // Original & Adjusted timing configurations keyed by nodeId
            this.originalConfigs = {};
            this.adjustedConfigs = {};

            // DOM references
            this.splitOverlay = null;
            this.panel = null;
            this.isMinimized = false;

            // Panel drag state
            this.dragState = { active: false, startX: 0, startY: 0, initLeft: 0, initTop: 0 };

            this.kpiUpdateTimer = 0;
        }

        initDOM() {
            const container = document.getElementById('canvas-container');
            if (!container) return;

            // 1. Split-screen viewport badges & center divider
            if (!document.getElementById('timing-compare-split-ui')) {
                const splitUI = document.createElement('div');
                splitUI.id = 'timing-compare-split-ui';
                splitUI.innerHTML = `
                    <div class="tc-split-divider"></div>
                    <div class="tc-split-vs-badge">SYNC COMPARE</div>
                    <div class="tc-viewport-badge tc-badge-left">
                        <div class="tc-badge-title">
                            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#94a3b8;"></span>
                            <span>左視窗：未調整 (原始時制)</span>
                        </div>
                        <div class="tc-badge-metrics" id="tc-left-live-badge">
                            <span>車速 <strong id="tc-left-speed">--</strong> km/h</span>
                            <span>停等 <strong id="tc-left-queue">--</strong> 輛</span>
                        </div>
                    </div>
                    <div class="tc-viewport-badge tc-badge-right">
                        <div class="tc-badge-title">
                            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#38bdf8;"></span>
                            <span>右視窗：調整後 (新時制)</span>
                        </div>
                        <div class="tc-badge-metrics" id="tc-right-live-badge">
                            <span>車速 <strong id="tc-right-speed">--</strong> km/h</span>
                            <span>停等 <strong id="tc-right-queue">--</strong> 輛</span>
                        </div>
                    </div>
                `;
                container.appendChild(splitUI);
                this.splitOverlay = splitUI;
            } else {
                this.splitOverlay = document.getElementById('timing-compare-split-ui');
            }

            // 2. Floating Timing Compare Control Panel
            if (!document.getElementById('timing-compare-panel')) {
                const panel = document.createElement('div');
                panel.id = 'timing-compare-panel';
                panel.innerHTML = `
                    <div class="tc-panel-header" id="tc-panel-header">
                        <div class="tc-panel-title">
                            <i class="fa-solid fa-scale-balanced" style="color:#38bdf8;"></i>
                            <span>時制比較與週期/時相調整</span>
                        </div>
                        <div class="tc-panel-header-actions">
                            <button type="button" class="tc-icon-btn" id="tc-btn-minimize" title="最小化/展開">
                                <i class="fa-solid fa-minus"></i>
                            </button>
                            <button type="button" class="tc-icon-btn" id="tc-btn-close" title="關閉時制比較">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>

                    <div class="tc-panel-body">
                        <!-- 1. 路口選擇與 2D/3D 視角切換 -->
                        <div class="tc-section">
                            <div class="tc-section-hdr">
                                <span><i class="fa-solid fa-traffic-light" style="color:#f59e0b;"></i> 選擇號誌路口 (或點擊地圖路口)</span>
                                <div class="tc-view-switch" title="切換 2D 或 3D 左右同步比較視窗">
                                    <button type="button" class="tc-view-btn active" id="tc-view-2d-btn">2D 比較</button>
                                    <button type="button" class="tc-view-btn" id="tc-view-3d-btn">3D 比較</button>
                                </div>
                            </div>
                            <div class="tc-node-select-row">
                                <select id="tc-node-select" class="tc-select"></select>
                            </div>
                        </div>

                        <!-- 2. 路口週期數值調整 -->
                        <div class="tc-section">
                            <div class="tc-section-hdr">
                                <span><i class="fa-solid fa-arrows-rotate" style="color:#38bdf8;"></i> 路口週期數值 (Cycle)</span>
                                <span id="tc-cycle-meta-text" style="font-family:'Roboto Mono',monospace;font-size:0.7rem;">原 --s ➔ --s</span>
                            </div>
                            <div class="tc-cycle-row">
                                <input type="range" id="tc-cycle-slider" min="20" max="240" step="1" value="70">
                                <input type="number" id="tc-cycle-input" class="tc-num-input" min="20" max="240" step="1" value="70">
                                <span style="font-size:0.72rem;color:#94a3b8;">s</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:0.68rem;color:#94a3b8;">
                                <span id="tc-clearance-info">固定黃燈+全紅清道: --s</span>
                                <span id="tc-avail-green-info" style="color:#4ade80;">可用綠燈總和: --s</span>
                            </div>
                        </div>

                        <!-- 3. 時相配置視覺化對比條 (未調整 vs 調整後) -->
                        <div class="tc-section">
                            <div class="tc-section-hdr">
                                <span><i class="fa-solid fa-bars-staggered" style="color:#a855f7;"></i> 週期時相結構對比 (即時步階)</span>
                                <span id="tc-live-phase-timer" style="font-family:'Roboto Mono',monospace;font-size:0.68rem;color:#38bdf8;">t = 0.0s</span>
                            </div>
                            <div class="tc-split-bars-wrap">
                                <div class="tc-bar-row">
                                    <span class="tc-bar-lbl">未調整</span>
                                    <div class="tc-bar-track" id="tc-bar-orig">
                                        <div class="tc-bar-playhead" id="tc-playhead-orig" style="left:0%;"></div>
                                    </div>
                                </div>
                                <div class="tc-bar-row">
                                    <span class="tc-bar-lbl" style="color:#38bdf8;">調整後</span>
                                    <div class="tc-bar-track" id="tc-bar-adj">
                                        <div class="tc-bar-playhead" id="tc-playhead-adj" style="left:0%;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. 各時相秒數滑動拉桿 (綠燈自動配平) -->
                        <div class="tc-section">
                            <div class="tc-section-hdr">
                                <span><i class="fa-solid fa-sliders" style="color:#22c55e;"></i> 各綠燈時相秒數調整 (自動連動配平)</span>
                            </div>
                            <div id="tc-phases-container" class="tc-phases-list"></div>
                        </div>

                        <!-- 5. 同步模擬即時績效對比 -->
                        <div class="tc-section">
                            <div class="tc-section-hdr">
                                <span><i class="fa-solid fa-chart-simple" style="color:#f43f5e;"></i> 左右同步模擬即時指標 (未調整 vs 調整後)</span>
                            </div>
                            <div class="tc-kpi-grid">
                                <div class="tc-kpi-card">
                                    <div class="tc-kpi-label">選取路口周邊停等車輛</div>
                                    <div class="tc-kpi-vals">
                                        <span id="tc-kpi-node-queue">0 vs 0 輛</span>
                                        <span id="tc-kpi-node-queue-diff" class="tc-diff-pill diff-zero">0</span>
                                    </div>
                                </div>
                                <div class="tc-kpi-card">
                                    <div class="tc-kpi-label">選取路口周邊平均車速</div>
                                    <div class="tc-kpi-vals">
                                        <span id="tc-kpi-node-speed">0.0 vs 0.0</span>
                                        <span id="tc-kpi-node-speed-diff" class="tc-diff-pill diff-zero">0%</span>
                                    </div>
                                </div>
                                <div class="tc-kpi-card">
                                    <div class="tc-kpi-label">全路網總停等車輛</div>
                                    <div class="tc-kpi-vals">
                                        <span id="tc-kpi-net-queue">0 vs 0 輛</span>
                                        <span id="tc-kpi-net-queue-diff" class="tc-diff-pill diff-zero">0</span>
                                    </div>
                                </div>
                                <div class="tc-kpi-card">
                                    <div class="tc-kpi-label">全路網平均車速 (km/h)</div>
                                    <div class="tc-kpi-vals">
                                        <span id="tc-kpi-net-speed">0.0 vs 0.0</span>
                                        <span id="tc-kpi-net-speed-diff" class="tc-diff-pill diff-zero">0%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="tc-panel-footer">
                        <button type="button" class="tc-btn tc-btn-primary" id="tc-btn-restart-sync" title="以相同隨機種子從 0 秒重新同步模擬左右視窗">
                            <i class="fa-solid fa-rotate-right"></i>
                            <span>從頭同步重測</span>
                        </button>
                        <button type="button" class="tc-btn" id="tc-btn-reset-node" title="還原當前選取路口的原始時制">
                            <i class="fa-solid fa-undo"></i>
                            <span>還原路口</span>
                        </button>
                        <button type="button" class="tc-btn" id="tc-btn-reset-all" title="還原所有路口的原始時制">
                            <span>全部還原</span>
                        </button>
                    </div>
                `;
                container.appendChild(panel);
                this.panel = panel;
                this.bindPanelEvents();
            } else {
                this.panel = document.getElementById('timing-compare-panel');
            }
        }

        bindPanelEvents() {
            if (!this.panel) return;

            const minBtn = document.getElementById('tc-btn-minimize');
            if (minBtn) {
                minBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.isMinimized = !this.isMinimized;
                    this.panel.classList.toggle('is-minimized', this.isMinimized);
                    minBtn.innerHTML = this.isMinimized
                        ? '<i class="fa-solid fa-expand"></i>'
                        : '<i class="fa-solid fa-minus"></i>';
                });
            }

            const closeBtn = document.getElementById('tc-btn-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const toggle = document.getElementById('timingCompareToggle');
                    if (toggle) {
                        toggle.checked = false;
                        toggle.dispatchEvent(new Event('change'));
                    } else {
                        this.setActive(false);
                    }
                });
            }

            // Panel header dragging
            const header = document.getElementById('tc-panel-header');
            if (header) {
                header.addEventListener('mousedown', (e) => {
                    if (e.target.closest('button')) return;
                    this.dragState.active = true;
                    this.dragState.startX = e.clientX;
                    this.dragState.startY = e.clientY;
                    const rect = this.panel.getBoundingClientRect();
                    const parentRect = this.panel.parentElement.getBoundingClientRect();
                    this.dragState.initLeft = rect.left - parentRect.left;
                    this.dragState.initTop = rect.top - parentRect.top;
                    e.preventDefault();
                });

                window.addEventListener('mousemove', (e) => {
                    if (!this.dragState.active || !this.panel) return;
                    const parentRect = this.panel.parentElement.getBoundingClientRect();
                    let newLeft = this.dragState.initLeft + (e.clientX - this.dragState.startX);
                    let newTop = this.dragState.initTop + (e.clientY - this.dragState.startY);
                    newLeft = Math.max(6, Math.min(parentRect.width - this.panel.offsetWidth - 6, newLeft));
                    newTop = Math.max(6, Math.min(parentRect.height - 44, newTop));
                    this.panel.style.left = `${newLeft}px`;
                    this.panel.style.top = `${newTop}px`;
                    this.panel.style.right = 'auto';
                });

                window.addEventListener('mouseup', () => {
                    this.dragState.active = false;
                });
            }

            // 2D / 3D comparison mode switch inside panel
            const btn2D = document.getElementById('tc-view-2d-btn');
            const btn3D = document.getElementById('tc-view-3d-btn');
            if (btn2D) {
                btn2D.addEventListener('click', () => {
                    const toolbar2DBtn = document.getElementById('display2DBtn');
                    if (toolbar2DBtn) toolbar2DBtn.click();
                });
            }
            if (btn3D) {
                btn3D.addEventListener('click', () => {
                    const toolbar3DBtn = document.getElementById('display3DBtn');
                    if (toolbar3DBtn) toolbar3DBtn.click();
                });
            }

            // Node dropdown change
            const nodeSelect = document.getElementById('tc-node-select');
            if (nodeSelect) {
                nodeSelect.addEventListener('change', (e) => {
                    this.selectNode(e.target.value);
                });
            }

            // Cycle slider & number input
            const cycleSlider = document.getElementById('tc-cycle-slider');
            const cycleInput = document.getElementById('tc-cycle-input');
            if (cycleSlider) {
                cycleSlider.addEventListener('input', (e) => {
                    if (!this.selectedNodeId) return;
                    this.setCycleDuration(this.selectedNodeId, parseFloat(e.target.value));
                });
            }
            if (cycleInput) {
                cycleInput.addEventListener('change', (e) => {
                    if (!this.selectedNodeId) return;
                    this.setCycleDuration(this.selectedNodeId, parseFloat(e.target.value));
                });
            }

            // Footer action buttons
            const btnRestart = document.getElementById('tc-btn-restart-sync');
            if (btnRestart) {
                btnRestart.addEventListener('click', () => {
                    this.restartSyncSimulation();
                });
            }

            const btnResetNode = document.getElementById('tc-btn-reset-node');
            if (btnResetNode) {
                btnResetNode.addEventListener('click', () => {
                    if (this.selectedNodeId) {
                        this.resetNodeTiming(this.selectedNodeId);
                    }
                });
            }

            const btnResetAll = document.getElementById('tc-btn-reset-all');
            if (btnResetAll) {
                btnResetAll.addEventListener('click', () => {
                    this.resetAllTimings();
                });
            }
        }

        syncViewModeButtons(is3D) {
            const btn2D = document.getElementById('tc-view-2d-btn');
            const btn3D = document.getElementById('tc-view-3d-btn');
            if (btn2D) btn2D.classList.toggle('active', !is3D);
            if (btn3D) btn3D.classList.toggle('active', !!is3D);
        }

        /**
         * Parses an intersection's schedule to distinguish Adjustable Green Phases vs Fixed Clearance Steps (Yellow/All-Red)
         */
        analyzeSchedule(tfl) {
            const schedule = tfl.schedule || [];
            const reverseGroupNames = {};
            if (tfl.groupNameMap) {
                for (const [name, gid] of Object.entries(tfl.groupNameMap)) {
                    reverseGroupNames[String(gid)] = name;
                }
            }

            // 1. Identify pure Green phases (has Green and no Yellow)
            let greenIndices = [];
            schedule.forEach((period, idx) => {
                const sigs = Object.values(period.signals || {});
                const hasGreen = sigs.includes('Green');
                const hasYellow = sigs.includes('Yellow');
                if (hasGreen && !hasYellow) {
                    greenIndices.push(idx);
                }
            });

            // Fallback if all green periods also had Yellow
            if (greenIndices.length === 0) {
                schedule.forEach((period, idx) => {
                    const sigs = Object.values(period.signals || {});
                    if (sigs.includes('Green')) greenIndices.push(idx);
                });
            }

            let fixedLostTime = 0;
            schedule.forEach((period, idx) => {
                if (!greenIndices.includes(idx)) {
                    fixedLostTime += period.duration;
                }
            });

            // Build human-readable labels for each green phase
            const greenPhaseLabels = greenIndices.map((stepIdx, orderIdx) => {
                const period = schedule[stepIdx];
                const activeNames = [];
                for (const [gid, sig] of Object.entries(period.signals || {})) {
                    if (sig === 'Green') {
                        const friendly = reverseGroupNames[String(gid)] || `G${gid}`;
                        if (!activeNames.includes(friendly)) activeNames.push(friendly);
                    }
                }
                const groupTag = activeNames.length > 0 ? activeNames.join(', ') : `Step ${stepIdx + 1}`;
                return `時相 ${orderIdx + 1} (${groupTag})`;
            });

            return {
                greenIndices,
                greenPhaseLabels,
                fixedLostTime
            };
        }

        /**
         * Captures initial signal timing configs from networkData
         */
        initTimingConfigs(netData) {
            this.networkData = netData;
            this.originalConfigs = {};
            this.adjustedConfigs = {};

            if (!netData || !netData.trafficLights) return;

            netData.trafficLights.forEach(tfl => {
                const nodeId = String(tfl.nodeId);
                const schedCopy = JSON.parse(JSON.stringify(tfl.schedule || []));
                const cycle = schedCopy.reduce((sum, p) => sum + p.duration, 0);
                const analysis = this.analyzeSchedule(tfl);

                this.originalConfigs[nodeId] = {
                    nodeId: tfl.nodeId,
                    cycleDuration: cycle,
                    timeShift: tfl.timeShift || 0,
                    schedule: JSON.parse(JSON.stringify(schedCopy)),
                    lights: JSON.parse(JSON.stringify(tfl.lights || {})),
                    groupNameMap: JSON.parse(JSON.stringify(tfl.groupNameMap || {})),
                    allGroupIds: [...(tfl.allGroupIds || [])],
                    advancedConfig: tfl.advancedConfig ? JSON.parse(JSON.stringify(tfl.advancedConfig)) : null,
                    greenIndices: [...analysis.greenIndices],
                    greenPhaseLabels: [...analysis.greenPhaseLabels],
                    fixedLostTime: analysis.fixedLostTime
                };

                this.adjustedConfigs[nodeId] = JSON.parse(JSON.stringify(this.originalConfigs[nodeId]));
            });

            const nodeIds = Object.keys(this.adjustedConfigs);
            if (nodeIds.length > 0 && (!this.selectedNodeId || !this.adjustedConfigs[this.selectedNodeId])) {
                this.selectedNodeId = nodeIds[0];
            }
        }

        /**
         * Creates an isolated clone of networkData with independent TrafficLightControllers and mutable state
         */
        createIsolatedNetwork(baseNetData, configsMap) {
            const TrafficLightCtrlClass = global.TrafficLightController;
            const clonedTrafficLights = (baseNetData.trafficLights || []).map(origTfl => {
                const cfg = configsMap[String(origTfl.nodeId)];
                const tflConfig = {
                    nodeId: origTfl.nodeId,
                    schedule: cfg ? JSON.parse(JSON.stringify(cfg.schedule)) : JSON.parse(JSON.stringify(origTfl.schedule || [])),
                    lights: origTfl.lights ? JSON.parse(JSON.stringify(origTfl.lights)) : {},
                    timeShift: cfg ? (cfg.timeShift || 0) : (origTfl.timeShift || 0),
                    advancedConfig: origTfl.advancedConfig ? JSON.parse(JSON.stringify(origTfl.advancedConfig)) : null,
                    allGroupIds: [...(origTfl.allGroupIds || [])],
                    groupNameMap: origTfl.groupNameMap ? { ...origTfl.groupNameMap } : {}
                };
                return new TrafficLightCtrlClass(tflConfig);
            });

            // Shallow-clone links so currentLOS or dynamic flags don't collide
            const clonedLinks = {};
            if (baseNetData.links) {
                for (const [lid, linkObj] of Object.entries(baseNetData.links)) {
                    clonedLinks[lid] = { ...linkObj };
                }
            }

            // Shallow-clone roadMarkings so two_stage_box waitingCount is isolated
            const clonedMarkings = (baseNetData.roadMarkings || []).map(m => ({ ...m, waitingCount: 0 }));

            return {
                ...baseNetData,
                links: clonedLinks,
                roadMarkings: clonedMarkings,
                trafficLights: clonedTrafficLights
            };
        }

        /**
         * Builds both Baseline (Left) and Adjusted (Right) Simulation instances with identical seeded PRNGs
         */
        buildDualSimulations() {
            if (!this.networkData || !global.Simulation) return;

            const seedInput = document.getElementById('citySeedInput');
            this.compareSeed = seedInput ? (parseInt(seedInput.value, 10) || 12345) : 12345;

            const baselineNet = this.createIsolatedNetwork(this.networkData, this.originalConfigs);
            const adjustedNet = this.createIsolatedNetwork(this.networkData, this.adjustedConfigs);

            const origRandom = Math.random;
            try {
                // 1. Construct Baseline Simulation with deterministic init PRNG
                Math.random = createSeededRng(this.compareSeed);
                this.baselineSim = new global.Simulation(baselineNet);
                this.baselineSim.spawnRng = createSeededRng(this.compareSeed + 101);
                this.baselineSim.simRng = createSeededRng(this.compareSeed + 202);
                this.baselineSim.trafficLights.forEach(tfl => tfl.update(0));

                // 2. Construct Adjusted Simulation with the exact same deterministic init PRNG
                Math.random = createSeededRng(this.compareSeed);
                this.adjustedSim = new global.Simulation(adjustedNet);
                this.adjustedSim.spawnRng = createSeededRng(this.compareSeed + 101);
                this.adjustedSim.simRng = createSeededRng(this.compareSeed + 202);
                this.adjustedSim.trafficLights.forEach(tfl => tfl.update(0));
            } finally {
                Math.random = origRandom;
            }
        }

        /**
         * Activates or deactivates Timing Comparison Mode
         */
        setActive(active, netData) {
            this.initDOM();
            if (netData) {
                this.initTimingConfigs(netData);
            } else if (!this.networkData && global.networkData) {
                this.initTimingConfigs(global.networkData);
            }

            this.isActive = !!active;

            if (this.splitOverlay) {
                this.splitOverlay.classList.toggle('is-visible', this.isActive);
            }
            if (this.panel) {
                this.panel.style.display = this.isActive ? 'flex' : 'none';
            }

            if (this.isActive) {
                this.buildDualSimulations();
                this.renderNodeSelector();
                this.renderSelectedNodeControls();
                this.updateLiveMetricsUI();
            }
        }

        /**
         * Steps both Baseline and Adjusted simulations in lockstep
         */
        update(dt) {
            if (!this.isActive || !this.baselineSim || !this.adjustedSim) return;
            if (dt <= 0) return;

            const maxSubstep = 0.033;
            let remaining = dt;
            while (remaining > 0) {
                const step = Math.min(remaining, maxSubstep);
                this.baselineSim.update(step);
                this.adjustedSim.update(step);
                remaining -= step;
            }

            this.updatePlayheadsUI();
            this.kpiUpdateTimer += dt;
            if (this.kpiUpdateTimer >= 0.25) {
                this.kpiUpdateTimer = 0;
                this.updateLiveMetricsUI();
            }
        }

        /**
         * Selects an intersection for editing & inspection
         */
        selectNode(nodeId) {
            const strId = String(nodeId);
            if (!this.adjustedConfigs[strId]) return;
            this.selectedNodeId = strId;
            const nodeSelect = document.getElementById('tc-node-select');
            if (nodeSelect && nodeSelect.value !== strId) {
                nodeSelect.value = strId;
            }
            this.renderSelectedNodeControls();
            this.updatePlayheadsUI();
            this.updateLiveMetricsUI();
            if (typeof global.triggerTimingCompareRedraw === 'function') {
                global.triggerTimingCompareRedraw();
            }
        }

        /**
         * Handles clicking on an intersection polygon in the 2D canvas
         */
        handleMapClick(worldX, worldY) {
            if (!this.isActive || !this.networkData || !this.networkData.nodes) return false;
            for (const [nodeId, node] of Object.entries(this.networkData.nodes)) {
                if (!this.adjustedConfigs[String(nodeId)]) continue;
                if (node.polygon && node.polygon.length >= 3 && this.isPointInPolygon({ x: worldX, y: worldY }, node.polygon)) {
                    this.selectNode(String(nodeId));
                    return true;
                }
            }
            return false;
        }

        isPointInPolygon(p, polygon) {
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                if (((polygon[i].y > p.y) !== (polygon[j].y > p.y)) &&
                    (p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                    inside = !inside;
                }
            }
            return inside;
        }

        isNodeModified(nodeId) {
            const orig = this.originalConfigs[nodeId];
            const adj = this.adjustedConfigs[nodeId];
            if (!orig || !adj) return false;
            if (Math.abs(orig.cycleDuration - adj.cycleDuration) >= 0.5) return true;
            for (let i = 0; i < orig.schedule.length; i++) {
                if (Math.abs((orig.schedule[i]?.duration || 0) - (adj.schedule[i]?.duration || 0)) >= 0.5) {
                    return true;
                }
            }
            return false;
        }

        /**
         * Changes the cycle duration of `nodeId`, keeping Yellow/All-Red fixed and scaling Green phases proportionally
         */
        setCycleDuration(nodeId, newCycleInput) {
            const cfg = this.adjustedConfigs[nodeId];
            const orig = this.originalConfigs[nodeId];
            if (!cfg || !orig) return;

            const K = cfg.greenIndices.length;
            if (K === 0) return;

            const minGreen = 5;
            const fixedLost = cfg.fixedLostTime;
            const minCycle = Math.ceil(fixedLost + K * minGreen);
            const maxCycle = Math.max(240, Math.ceil(orig.cycleDuration * 2));

            let targetCycle = Math.round(Number(newCycleInput) || orig.cycleDuration);
            targetCycle = Math.max(minCycle, Math.min(maxCycle, targetCycle));

            const targetTotalGreen = Math.max(K * minGreen, targetCycle - fixedLost);
            const currentGreens = cfg.greenIndices.map(idx => cfg.schedule[idx].duration);
            const currentTotalGreen = currentGreens.reduce((a, b) => a + b, 0);

            const newGreens = currentGreens.map(g => {
                const ratio = currentTotalGreen > 0 ? (g / currentTotalGreen) : (1 / K);
                return Math.max(minGreen, Math.round(ratio * targetTotalGreen));
            });

            // Distribute any integer rounding remainder so sum(newGreens) === targetTotalGreen
            let diff = Math.round(targetTotalGreen - newGreens.reduce((a, b) => a + b, 0));
            let safety = 0;
            while (diff !== 0 && safety < 100) {
                for (let i = 0; i < K && diff !== 0; i++) {
                    if (diff > 0) {
                        newGreens[i] += 1;
                        diff -= 1;
                    } else if (diff < 0 && newGreens[i] > minGreen) {
                        newGreens[i] -= 1;
                        diff += 1;
                    }
                }
                safety++;
            }

            cfg.greenIndices.forEach((schedIdx, orderIdx) => {
                cfg.schedule[schedIdx].duration = newGreens[orderIdx];
            });
            cfg.cycleDuration = fixedLost + newGreens.reduce((a, b) => a + b, 0);

            this.applyConfigToAdjustedSim(nodeId);
            this.updateControlsValuesInPlace();
            this.renderNodeSelectorOptionsText();
            if (typeof global.triggerTimingCompareRedraw === 'function') {
                global.triggerTimingCompareRedraw();
            }
        }

        /**
         * Adjusts a single Green Phase duration via slider while keeping Cycle Duration constant and auto-balancing other Green Phases
         */
        setGreenPhaseDuration(nodeId, greenOrderIdx, newGreenValInput) {
            const cfg = this.adjustedConfigs[nodeId];
            if (!cfg) return;

            const K = cfg.greenIndices.length;
            if (K <= 1) return;

            const minGreen = 5;
            const fixedLost = cfg.fixedLostTime;
            const totalAvailGreen = Math.round(cfg.cycleDuration - fixedLost);
            const maxSingleGreen = Math.max(minGreen, totalAvailGreen - (K - 1) * minGreen);

            const targetGreen = Math.max(minGreen, Math.min(maxSingleGreen, Math.round(Number(newGreenValInput) || minGreen)));
            const currentGreens = cfg.greenIndices.map(idx => cfg.schedule[idx].duration);
            currentGreens[greenOrderIdx] = targetGreen;

            if (K === 2) {
                const otherIdx = greenOrderIdx === 0 ? 1 : 0;
                currentGreens[otherIdx] = Math.max(minGreen, totalAvailGreen - targetGreen);
            } else {
                const remTarget = totalAvailGreen - targetGreen;
                const otherIndices = [];
                let otherSum = 0;
                for (let i = 0; i < K; i++) {
                    if (i !== greenOrderIdx) {
                        otherIndices.push(i);
                        otherSum += currentGreens[i];
                    }
                }

                otherIndices.forEach(idx => {
                    const ratio = otherSum > 0 ? (currentGreens[idx] / otherSum) : (1 / otherIndices.length);
                    currentGreens[idx] = Math.max(minGreen, Math.round(ratio * remTarget));
                });

                let diff = Math.round(totalAvailGreen - currentGreens.reduce((a, b) => a + b, 0));
                let safety = 0;
                while (diff !== 0 && safety < 100) {
                    for (const idx of otherIndices) {
                        if (diff === 0) break;
                        if (diff > 0) {
                            currentGreens[idx] += 1;
                            diff -= 1;
                        } else if (diff < 0 && currentGreens[idx] > minGreen) {
                            currentGreens[idx] -= 1;
                            diff += 1;
                        }
                    }
                    safety++;
                }
            }

            cfg.greenIndices.forEach((schedIdx, idx) => {
                cfg.schedule[schedIdx].duration = currentGreens[idx];
            });
            cfg.cycleDuration = fixedLost + currentGreens.reduce((a, b) => a + b, 0);

            this.applyConfigToAdjustedSim(nodeId);
            this.updateControlsValuesInPlace();
            this.renderNodeSelectorOptionsText();
            if (typeof global.triggerTimingCompareRedraw === 'function') {
                global.triggerTimingCompareRedraw();
            }
        }

        /**
         * Immediately updates the live TrafficLightController inside adjustedSim
         */
        applyConfigToAdjustedSim(nodeId) {
            if (!this.adjustedSim || !this.adjustedSim.trafficLights) return;
            const cfg = this.adjustedConfigs[String(nodeId)];
            if (!cfg) return;

            const tfl = this.adjustedSim.trafficLights.find(t => String(t.nodeId) === String(nodeId));
            if (tfl) {
                tfl.schedule = JSON.parse(JSON.stringify(cfg.schedule));
                tfl.cycleDuration = cfg.cycleDuration;
                tfl.timeShift = cfg.timeShift || 0;
                tfl.update(this.adjustedSim.time);
            }
        }

        resetNodeTiming(nodeId) {
            const strId = String(nodeId);
            if (!this.originalConfigs[strId]) return;
            this.adjustedConfigs[strId] = JSON.parse(JSON.stringify(this.originalConfigs[strId]));
            this.applyConfigToAdjustedSim(strId);
            this.renderNodeSelectorOptionsText();
            this.renderSelectedNodeControls();
            if (typeof global.triggerTimingCompareRedraw === 'function') {
                global.triggerTimingCompareRedraw();
            }
        }

        resetAllTimings() {
            for (const nodeId of Object.keys(this.originalConfigs)) {
                this.adjustedConfigs[nodeId] = JSON.parse(JSON.stringify(this.originalConfigs[nodeId]));
                this.applyConfigToAdjustedSim(nodeId);
            }
            this.renderNodeSelectorOptionsText();
            this.renderSelectedNodeControls();
            if (typeof global.triggerTimingCompareRedraw === 'function') {
                global.triggerTimingCompareRedraw();
            }
        }

        /**
         * Resets both Left (Baseline) and Right (Adjusted) simulations to t = 0.00s with identical seed
         */
        restartSyncSimulation() {
            this.buildDualSimulations();
            if (typeof global.onTimingCompareRestart === 'function') {
                global.onTimingCompareRestart();
            }
            this.updatePlayheadsUI();
            this.updateLiveMetricsUI();
        }

        renderNodeSelector() {
            const select = document.getElementById('tc-node-select');
            if (!select) return;
            select.innerHTML = '';

            const nodeIds = Object.keys(this.adjustedConfigs);
            if (nodeIds.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '(無號誌路口)';
                select.appendChild(opt);
                return;
            }

            nodeIds.forEach(nodeId => {
                const opt = document.createElement('option');
                opt.value = nodeId;
                opt.selected = (nodeId === String(this.selectedNodeId));
                select.appendChild(opt);
            });
            this.renderNodeSelectorOptionsText();
        }

        renderNodeSelectorOptionsText() {
            const select = document.getElementById('tc-node-select');
            if (!select) return;
            Array.from(select.options).forEach(opt => {
                const nodeId = opt.value;
                const orig = this.originalConfigs[nodeId];
                const adj = this.adjustedConfigs[nodeId];
                if (!orig || !adj) return;
                const modified = this.isNodeModified(nodeId);
                opt.textContent = `路口 Node ${nodeId} (週期: ${Math.round(orig.cycleDuration)}s ➔ ${Math.round(adj.cycleDuration)}s)${modified ? ' ● 已調整' : ''}`;
            });
        }

        /**
         * Renders the cycle slider, visual split bars, and green phase sliders for the selected node
         */
        renderSelectedNodeControls() {
            const nodeId = String(this.selectedNodeId);
            const orig = this.originalConfigs[nodeId];
            const adj = this.adjustedConfigs[nodeId];
            if (!orig || !adj) return;

            const K = adj.greenIndices.length;
            const minGreen = 5;
            const minCycle = Math.ceil(adj.fixedLostTime + Math.max(1, K) * minGreen);
            const maxCycle = Math.max(240, Math.ceil(orig.cycleDuration * 2));

            const cycleSlider = document.getElementById('tc-cycle-slider');
            const cycleInput = document.getElementById('tc-cycle-input');
            if (cycleSlider) {
                cycleSlider.min = minCycle;
                cycleSlider.max = maxCycle;
                cycleSlider.value = Math.round(adj.cycleDuration);
            }
            if (cycleInput) {
                cycleInput.min = minCycle;
                cycleInput.max = maxCycle;
                cycleInput.value = Math.round(adj.cycleDuration);
            }

            // Build Green Phase Sliders DOM
            const phasesContainer = document.getElementById('tc-phases-container');
            if (phasesContainer) {
                phasesContainer.innerHTML = '';
                const totalAvailGreen = Math.round(adj.cycleDuration - adj.fixedLostTime);
                const maxSingleGreen = Math.max(minGreen, totalAvailGreen - Math.max(0, K - 1) * minGreen);

                adj.greenIndices.forEach((schedIdx, orderIdx) => {
                    const label = adj.greenPhaseLabels[orderIdx] || `綠燈時相 ${orderIdx + 1}`;
                    const curDur = Math.round(adj.schedule[schedIdx].duration);
                    const origDur = Math.round(orig.schedule[schedIdx].duration);

                    const item = document.createElement('div');
                    item.className = 'tc-phase-item';
                    item.innerHTML = `
                        <div class="tc-phase-item-hdr">
                            <span class="tc-phase-name">
                                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#22c55e;"></span>
                                <span>${label}</span>
                            </span>
                            <span class="tc-phase-meta">
                                <span>原 ${origDur}s</span>
                                <span id="tc-phase-diff-${orderIdx}" class="tc-diff-pill diff-zero">0s</span>
                            </span>
                        </div>
                        <div class="tc-phase-slider-row">
                            <input type="range" class="tc-phase-slider" id="tc-phase-slider-${orderIdx}"
                                data-order="${orderIdx}" min="${minGreen}" max="${maxSingleGreen}" step="1" value="${curDur}"
                                ${K <= 1 ? 'disabled' : ''}>
                            <input type="number" class="tc-num-input tc-phase-input" id="tc-phase-input-${orderIdx}"
                                data-order="${orderIdx}" min="${minGreen}" max="${maxSingleGreen}" step="1" value="${curDur}"
                                ${K <= 1 ? 'disabled' : ''}>
                            <span style="font-size:0.7rem;color:#94a3b8;">s</span>
                        </div>
                    `;
                    phasesContainer.appendChild(item);

                    const slider = item.querySelector('.tc-phase-slider');
                    const numInp = item.querySelector('.tc-phase-input');
                    if (slider) {
                        slider.addEventListener('input', (e) => {
                            this.setGreenPhaseDuration(nodeId, orderIdx, parseFloat(e.target.value));
                        });
                    }
                    if (numInp) {
                        numInp.addEventListener('change', (e) => {
                            this.setGreenPhaseDuration(nodeId, orderIdx, parseFloat(e.target.value));
                        });
                    }
                });
            }

            this.buildSplitBarSegments('tc-bar-orig', 'tc-playhead-orig', orig);
            this.buildSplitBarSegments('tc-bar-adj', 'tc-playhead-adj', adj);
            this.updateControlsValuesInPlace();
        }

        buildSplitBarSegments(trackId, playheadId, cfg) {
            const track = document.getElementById(trackId);
            if (!track) return;
            const playhead = document.getElementById(playheadId);
            track.innerHTML = '';

            let greenOrder = 0;
            cfg.schedule.forEach((period, idx) => {
                const seg = document.createElement('div');
                const isGreen = cfg.greenIndices.includes(idx);
                const sigs = Object.values(period.signals || {});
                let segClass = 'seg-red';
                if (isGreen) {
                    segClass = `seg-green-${greenOrder % 4}`;
                    greenOrder++;
                } else if (sigs.includes('Yellow')) {
                    segClass = 'seg-yellow';
                }
                seg.className = `tc-bar-seg ${segClass}`;
                seg.dataset.schedIdx = idx;
                const pct = cfg.cycleDuration > 0 ? (period.duration / cfg.cycleDuration) * 100 : 0;
                seg.style.width = `${pct}%`;
                seg.textContent = period.duration >= 6 ? `${Math.round(period.duration)}s` : '';
                seg.title = `Step ${idx + 1}: ${Math.round(period.duration)}s`;
                track.appendChild(seg);
            });

            if (playhead) {
                track.appendChild(playhead);
            } else {
                const ph = document.createElement('div');
                ph.id = playheadId;
                ph.className = 'tc-bar-playhead';
                ph.style.left = '0%';
                track.appendChild(ph);
            }
        }

        /**
         * Updates slider positions, numeric inputs, diff badges, and split bar widths in-place without recreating DOM
         */
        updateControlsValuesInPlace() {
            const nodeId = String(this.selectedNodeId);
            const orig = this.originalConfigs[nodeId];
            const adj = this.adjustedConfigs[nodeId];
            if (!orig || !adj) return;

            const K = adj.greenIndices.length;
            const minGreen = 5;
            const totalAvailGreen = Math.round(adj.cycleDuration - adj.fixedLostTime);
            const maxSingleGreen = Math.max(minGreen, totalAvailGreen - Math.max(0, K - 1) * minGreen);

            // 1. Cycle controls
            const cycleSlider = document.getElementById('tc-cycle-slider');
            const cycleInput = document.getElementById('tc-cycle-input');
            const cycleMeta = document.getElementById('tc-cycle-meta-text');
            const clearanceInfo = document.getElementById('tc-clearance-info');
            const availGreenInfo = document.getElementById('tc-avail-green-info');

            const origC = Math.round(orig.cycleDuration);
            const adjC = Math.round(adj.cycleDuration);
            const cDiff = adjC - origC;

            if (cycleSlider && document.activeElement !== cycleSlider) cycleSlider.value = adjC;
            if (cycleInput && document.activeElement !== cycleInput) cycleInput.value = adjC;
            if (cycleMeta) {
                const diffStr = cDiff > 0 ? `+${cDiff}s` : (cDiff < 0 ? `${cDiff}s` : '±0s');
                const color = cDiff > 0 ? '#4ade80' : (cDiff < 0 ? '#f87171' : '#94a3b8');
                cycleMeta.innerHTML = `原 ${origC}s ➔ <strong style="color:#38bdf8;">${adjC}s</strong> <span style="color:${color};">(${diffStr})</span>`;
            }
            if (clearanceInfo) clearanceInfo.textContent = `固定黃燈+全紅: ${Math.round(adj.fixedLostTime)}s`;
            if (availGreenInfo) availGreenInfo.textContent = `可用綠燈總和: ${totalAvailGreen}s`;

            // 2. Green phase sliders & diff badges
            adj.greenIndices.forEach((schedIdx, orderIdx) => {
                const curDur = Math.round(adj.schedule[schedIdx].duration);
                const origDur = Math.round(orig.schedule[schedIdx].duration);
                const diff = curDur - origDur;

                const slider = document.getElementById(`tc-phase-slider-${orderIdx}`);
                const numInp = document.getElementById(`tc-phase-input-${orderIdx}`);
                const diffEl = document.getElementById(`tc-phase-diff-${orderIdx}`);

                if (slider) {
                    slider.max = maxSingleGreen;
                    if (document.activeElement !== slider) slider.value = curDur;
                }
                if (numInp) {
                    numInp.max = maxSingleGreen;
                    if (document.activeElement !== numInp) numInp.value = curDur;
                }
                if (diffEl) {
                    diffEl.className = `tc-diff-pill ${diff > 0 ? 'diff-pos' : (diff < 0 ? 'diff-neg' : 'diff-zero')}`;
                    diffEl.textContent = diff > 0 ? `+${diff}s` : `${diff}s`;
                }
            });

            // 3. Adjusted split bar segment widths
            const adjTrack = document.getElementById('tc-bar-adj');
            if (adjTrack) {
                const segs = adjTrack.querySelectorAll('.tc-bar-seg');
                segs.forEach(seg => {
                    const idx = parseInt(seg.dataset.schedIdx, 10);
                    const p = adj.schedule[idx];
                    if (p) {
                        const pct = adj.cycleDuration > 0 ? (p.duration / adj.cycleDuration) * 100 : 0;
                        seg.style.width = `${pct}%`;
                        seg.textContent = p.duration >= 6 ? `${Math.round(p.duration)}s` : '';
                        seg.title = `Step ${idx + 1}: ${Math.round(p.duration)}s`;
                    }
                });
            }
        }

        updatePlayheadsUI() {
            if (!this.isActive || !this.baselineSim || !this.adjustedSim || !this.selectedNodeId) return;
            const nodeId = String(this.selectedNodeId);
            const orig = this.originalConfigs[nodeId];
            const adj = this.adjustedConfigs[nodeId];
            if (!orig || !adj) return;

            const t = this.baselineSim.time;
            const timerEl = document.getElementById('tc-live-phase-timer');
            if (timerEl) timerEl.textContent = `t = ${t.toFixed(1)}s`;

            const phOrig = document.getElementById('tc-playhead-orig');
            if (phOrig && orig.cycleDuration > 0) {
                const eff = t - (orig.timeShift || 0);
                const tc = ((eff % orig.cycleDuration) + orig.cycleDuration) % orig.cycleDuration;
                phOrig.style.left = `${(tc / orig.cycleDuration) * 100}%`;
            }

            const phAdj = document.getElementById('tc-playhead-adj');
            if (phAdj && adj.cycleDuration > 0) {
                const eff = t - (adj.timeShift || 0);
                const tc = ((eff % adj.cycleDuration) + adj.cycleDuration) % adj.cycleDuration;
                phAdj.style.left = `${(tc / adj.cycleDuration) * 100}%`;
            }
        }

        computeSimStats(sim, focusNodeId) {
            if (!sim || !sim.vehicles) {
                return { netAvgSpeed: 0, netQueue: 0, nodeAvgSpeed: 0, nodeQueue: 0 };
            }
            const vehicles = sim.vehicles;
            let netTotalSpeed = 0;
            let netQueue = 0;

            let nodeCx = null, nodeCy = null;
            const node = sim.network && sim.network.nodes ? sim.network.nodes[focusNodeId] : null;
            if (node && node.polygon && node.polygon.length > 0) {
                nodeCx = 0; nodeCy = 0;
                node.polygon.forEach(p => { nodeCx += p.x; nodeCy += p.y; });
                nodeCx /= node.polygon.length;
                nodeCy /= node.polygon.length;
            }

            let nodeVehCount = 0;
            let nodeTotalSpeed = 0;
            let nodeQueue = 0;

            for (let i = 0; i < vehicles.length; i++) {
                const v = vehicles[i];
                const spdKmh = (v.speed || 0) * 3.6;
                netTotalSpeed += spdKmh;
                if (spdKmh < 3.6) netQueue++;

                if (nodeCx !== null) {
                    const dist = Math.hypot(v.x - nodeCx, v.y - nodeCy);
                    if (dist <= 100) {
                        nodeVehCount++;
                        nodeTotalSpeed += spdKmh;
                        if (spdKmh < 3.6) nodeQueue++;
                    }
                }
            }

            return {
                netAvgSpeed: vehicles.length > 0 ? netTotalSpeed / vehicles.length : 0,
                netQueue,
                nodeAvgSpeed: nodeVehCount > 0 ? nodeTotalSpeed / nodeVehCount : 0,
                nodeQueue
            };
        }

        updateLiveMetricsUI() {
            if (!this.isActive || !this.baselineSim || !this.adjustedSim) return;

            const baseStats = this.computeSimStats(this.baselineSim, this.selectedNodeId);
            const adjStats = this.computeSimStats(this.adjustedSim, this.selectedNodeId);

            // Top viewport badges
            const leftSpd = document.getElementById('tc-left-speed');
            const leftQ = document.getElementById('tc-left-queue');
            const rightSpd = document.getElementById('tc-right-speed');
            const rightQ = document.getElementById('tc-right-queue');

            if (leftSpd) leftSpd.textContent = baseStats.netAvgSpeed.toFixed(1);
            if (leftQ) leftQ.textContent = baseStats.netQueue;
            if (rightSpd) rightSpd.textContent = adjStats.netAvgSpeed.toFixed(1);
            if (rightQ) rightQ.textContent = adjStats.netQueue;

            // Panel KPI cards
            const setKpi = (valId, diffId, baseVal, adjVal, isLowerBetter, isPercent, unitStr = '') => {
                const valEl = document.getElementById(valId);
                const diffEl = document.getElementById(diffId);
                if (valEl) {
                    valEl.textContent = isPercent
                        ? `${baseVal.toFixed(1)} ➔ ${adjVal.toFixed(1)}`
                        : `${baseVal} ➔ ${adjVal}${unitStr}`;
                }
                if (diffEl) {
                    const rawDiff = adjVal - baseVal;
                    if (Math.abs(rawDiff) < 0.05) {
                        diffEl.className = 'tc-diff-pill diff-zero';
                        diffEl.textContent = '0';
                    } else {
                        const isBetter = isLowerBetter ? (rawDiff < 0) : (rawDiff > 0);
                        diffEl.className = `tc-diff-pill ${isBetter ? 'diff-pos' : 'diff-neg'}`;
                        if (isPercent) {
                            const pct = baseVal > 0.1 ? ((rawDiff / baseVal) * 100) : 0;
                            diffEl.textContent = `${rawDiff > 0 ? '+' : ''}${pct.toFixed(0)}%`;
                        } else {
                            diffEl.textContent = `${rawDiff > 0 ? '+' : ''}${Math.round(rawDiff)}`;
                        }
                    }
                }
            };

            setKpi('tc-kpi-node-queue', 'tc-kpi-node-queue-diff', baseStats.nodeQueue, adjStats.nodeQueue, true, false, '輛');
            setKpi('tc-kpi-node-speed', 'tc-kpi-node-speed-diff', baseStats.nodeAvgSpeed, adjStats.nodeAvgSpeed, false, true);
            setKpi('tc-kpi-net-queue', 'tc-kpi-net-queue-diff', baseStats.netQueue, adjStats.netQueue, true, false, '輛');
            setKpi('tc-kpi-net-speed', 'tc-kpi-net-speed-diff', baseStats.netAvgSpeed, adjStats.netAvgSpeed, false, true);
        }

        /**
         * Draws a highlight ring & label around the selected intersection in 2D mode
         */
        drawSelectedNodeHighlight2D(ctx, sim, scale, isAdjustedSide) {
            if (!this.isActive || !this.selectedNodeId || !sim || !sim.network || !sim.network.nodes) return;
            const node = sim.network.nodes[this.selectedNodeId];
            if (!node || !node.polygon || node.polygon.length === 0) return;

            let cx = 0, cy = 0;
            let maxR = 18;
            node.polygon.forEach(p => { cx += p.x; cy += p.y; });
            cx /= node.polygon.length;
            cy /= node.polygon.length;
            node.polygon.forEach(p => {
                const d = Math.hypot(p.x - cx, p.y - cy);
                if (d + 8 > maxR) maxR = d + 8;
            });

            ctx.save();
            ctx.strokeStyle = isAdjustedSide ? 'rgba(56, 189, 248, 0.9)' : 'rgba(148, 163, 184, 0.85)';
            ctx.lineWidth = Math.max(1.5, 2.5 / scale);
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.beginPath();
            ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            const tfl = sim.trafficLights ? sim.trafficLights.find(t => String(t.nodeId) === String(this.selectedNodeId)) : null;
            if (tfl) {
                const phaseInfo = tfl.getPhaseDetails ? tfl.getPhaseDetails(sim.time) : { remaining: 0 };
                const fontSize = Math.max(9, Math.min(14, 11 / scale));
                ctx.font = `bold ${fontSize}px 'Roboto Mono', sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const labelText = `Node ${this.selectedNodeId} | 週期 ${Math.round(tfl.cycleDuration)}s (剩 ${Math.ceil(phaseInfo.remaining)}s)`;
                const textW = ctx.measureText(labelText).width + 10 / scale;
                const boxH = fontSize * 1.45;
                const boxY = cy - maxR - 6 / scale;

                ctx.fillStyle = isAdjustedSide ? 'rgba(2, 132, 199, 0.9)' : 'rgba(30, 41, 59, 0.88)';
                ctx.fillRect(cx - textW / 2, boxY - boxH, textW, boxH);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(labelText, cx, boxY - boxH * 0.15);
            }
            ctx.restore();
        }
    }

    global.TimingCompareController = TimingCompareController;
    global.timingCompareController = new TimingCompareController();
})(window);

