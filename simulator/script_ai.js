// --- START OF FILE script_ai.js ---

// Q-Learning 演算法核心
class QLearningAgent {
    constructor(nodeId) {
        this.nodeId = nodeId;
        this.qTable = {};
        this.alpha = 0.1;    // 學習率
        this.gamma = 0.9;    // 折扣因子
        this.epsilon = 1.0;  // 探索率 (初期完全隨機)
        this.epsilonMin = 0.01;
        this.epsilonDecay = 0.995;
    }

    getQ(state, action) {
        return this.qTable[`${state}_${action}`] || 0;
    }

    learn(state, action, reward, nextState) {
        const currentQ = this.getQ(state, action);
        // 比較 3 個動作 (0, 1, 2) 的最大值
        const maxNextQ = Math.max(
            this.getQ(nextState, 0),
            this.getQ(nextState, 1),
            this.getQ(nextState, 2)
        );

        const newQ = currentQ + this.alpha * (reward + this.gamma * maxNextQ - currentQ);
        this.qTable[`${state}_${action}`] = newQ;
    }

    chooseAction(state) {
        // Epsilon-Greedy 策略
        if (Math.random() < this.epsilon) {
            this.lastMode = "RND"; // ★ 新增：標記為隨機 (Random)
            return Math.floor(Math.random() * 3);
        }

        this.lastMode = "Q";   // ★ 新增：標記為查表 (Q-Table)

        const q0 = this.getQ(state, 0); // Keep
        const q1 = this.getQ(state, 1); // Next
        const q2 = this.getQ(state, 2); // Default

        // 比較大小取出最佳動作
        if (q0 >= q1 && q0 >= q2) return 0;
        if (q1 >= q0 && q1 >= q2) return 1;
        return 2;
    }

    decayEpsilon() {
        if (this.epsilon > this.epsilonMin) {
            this.epsilon *= this.epsilonDecay;
        }
    }
}

// AI 總控制器
class AIController {
    constructor(simulation) {
        this.simulation = simulation;
        this.agents = {};
        this.isActive = false;
        this.isLearningEnabled = true;

        // 協作模式
        this.isCooperative = false;
        this.topologyCache = null;

        this.stepTimer = 0;
        this.decisionInterval = 2.0;

        // ★★★ 新增：最小綠燈時間限制 (秒) ★★★
        // 防止 AI 頻繁切換 (Anti-Short-Cycling)
        this.minGreenDuration = 3.0;

        this.currentEpisodeRewards = {};
        this.episodeSteps = 0;

        // ★★★ 新增：浮窗控制與拖曳狀態 ★★★
        this.showOverlay = true;       // 顯示開關
        this.nodeOffsets = {};         // 記錄每個路口的浮窗偏移量 {nodeId: {x, y}}
        this.hitBoxes = [];            // 記錄當前幀所有浮窗的位置 (用於碰撞檢測)
        this.dragState = null;         // 當前拖曳狀態 { nodeId, startX, startY, originalOffsetX, originalOffsetY }
        this.lastState = {};
        this.lastAction = {};
        this.lastActionType = {}; // ★ 新增：儲存每個路口的決策類型 (Q or RND)

        this.chart = null;
        this.nodeColors = {};
    }

    setActive(active) {
        this.isActive = active;
        const panel = document.getElementById('ai-training-panel');
        if (panel) panel.style.display = active ? 'flex' : 'none';
        if (active && !this.chart) this.initChart();
    }

    setLearningEnabled(enabled) { this.isLearningEnabled = enabled; }

    setCooperative(enabled) {
        this.isCooperative = enabled;
        if (enabled && !this.topologyCache) this.buildTopology();
        console.log(`AI Cooperative Mode: ${enabled ? 'ON' : 'OFF'}`);
    }

    buildTopology() {
        this.topologyCache = {};
        const network = this.simulation.network;
        Object.values(network.links).forEach(link => {
            const fromNode = link.source;
            const toNode = link.destination;
            if (fromNode && toNode) {
                if (!this.topologyCache[fromNode]) {
                    this.topologyCache[fromNode] = new Set();
                }
                this.topologyCache[fromNode].add(toNode);
            }
        });
    }

    getDownstreamNodes(nodeId) {
        if (!this.topologyCache) this.buildTopology();
        const targets = this.topologyCache[nodeId];
        return targets ? Array.from(targets) : [];
    }

    // PCU 轉換等級 (0~5)
    //toQueueLevel(pcu) {
    //  if (pcu <= 0) return 0;
    //if (pcu <= 2) return 1;
    //if (pcu <= 5) return 2;
    //if (pcu <= 9) return 3;
    //if (pcu <= 14) return 4;
    //return 5;
    //}

    // PCU 轉換等級 (0~5)
    toQueueLevel(pcu) {
        if (pcu <= 0) return 0;
        if (pcu <= 10) return 1;
        if (pcu <= 20) return 2;
        return 3;
    }

    // 計算特定時相的排隊量 (含 PCU 加權)
    getPhaseQueuePCU(nodeId, tfl, phaseIndex) {
        const node = this.simulation.network.nodes[nodeId];
        if (!node) return 0;

        const targetPhase = tfl.schedule[phaseIndex];
        if (!targetPhase) return 0;

        // 1. 找出該時相是「綠燈」的 TurnGroup ID
        const greenGroupIds = [];
        for (const [groupId, signal] of Object.entries(targetPhase.signals)) {
            if (signal === 'Green') greenGroupIds.push(groupId);
        }

        if (greenGroupIds.length === 0) return 0;

        // 2. 找出屬於這些 Group 的進入車道
        const activeLaneKeys = new Set();
        node.transitions.forEach(trans => {
            if (trans.turnGroupId && greenGroupIds.includes(trans.turnGroupId)) {
                activeLaneKeys.add(`${trans.sourceLinkId}_${trans.sourceLaneIndex}`);
            }
        });

        // 3. 計算 PCU
        let pcuTotal = 0;
        this.simulation.vehicles.forEach(v => {
            const key = `${v.currentLinkId}_${v.currentLaneIndex}`;
            if (activeLaneKeys.has(key) && v.speed < 1.0) {
                const distToStop = v.currentPathLength - v.distanceOnPath;
                if (distToStop < 120) {
                    pcuTotal += (v.isMotorcycle ? 0.3 : 1.0);
                }
            }
        });

        return Math.ceil(pcuTotal);
    }

    // 計算路口總排隊量 (用於 Reward)
    getTotalQueuePCU(nodeId) {
        const node = this.simulation.network.nodes[nodeId];
        if (!node) return 0;
        const incomingLinkIds = [];
        Object.values(this.simulation.network.links).forEach(link => {
            if (link.destination === nodeId) incomingLinkIds.push(link.id);
        });
        let pcuTotal = 0;
        this.simulation.vehicles.forEach(v => {
            if (incomingLinkIds.includes(v.currentLinkId) && v.speed < 8.0) {
                const distToStop = v.currentPathLength - v.distanceOnPath;
                if (distToStop < 120) pcuTotal += (v.isMotorcycle ? 0.3 : 1.0);
            }
        });
        return Math.ceil(pcuTotal);
    }

    getState(nodeId, tfl, currentPhaseIdx, elapsedInPhase) {
        // 1. 時間等級 (用於狀態特徵)
        let timeLevel = 0;
        if (elapsedInPhase > 10) timeLevel = 1;
        if (elapsedInPhase > 20) timeLevel = 2;
        if (elapsedInPhase > 30) timeLevel = 3;

        // 2. 當前時相排隊量
        const currPcu = this.getPhaseQueuePCU(nodeId, tfl, currentPhaseIdx);
        const currLevel = this.toQueueLevel(currPcu);

        // 3. 下一個「有效綠燈」時相排隊量 (跳過黃/紅)
        let nextGreenPhaseIdx = (currentPhaseIdx + 1) % tfl.schedule.length;

        for (let i = 0; i < tfl.schedule.length; i++) {
            const potentialPhase = tfl.schedule[nextGreenPhaseIdx];
            let hasGreen = false;
            for (const sig of Object.values(potentialPhase.signals)) {
                if (sig === 'Green') {
                    hasGreen = true;
                    break;
                }
            }
            if (hasGreen) {
                break;
            } else {
                nextGreenPhaseIdx = (nextGreenPhaseIdx + 1) % tfl.schedule.length;
            }
        }

        const nextPcu = this.getPhaseQueuePCU(nodeId, tfl, nextGreenPhaseIdx);
        const nextLevel = this.toQueueLevel(nextPcu);

        // State: [步階]_[時間]_[當前排隊]_[下一有效排隊]
        return `${currentPhaseIdx}_${timeLevel}_${currLevel}_${nextLevel}`;
    }

    update(dt) {
        if (!this.isActive || !this.simulation) return;

        this.stepTimer += dt;
        if (this.stepTimer < this.decisionInterval) return;

        // 記錄實際經過的時間，用於 Action 0 補償
        const timeToCompensate = this.stepTimer;
        this.stepTimer = 0;

        const trafficLights = this.simulation.trafficLights;

        trafficLights.forEach(tfl => {
            const nodeId = tfl.nodeId;
            if (!this.agents[nodeId]) {
                this.agents[nodeId] = new QLearningAgent(nodeId);
            }
            const agent = this.agents[nodeId];

            // --- 算出當前 Phase 資訊 ---
            const cycleTime = tfl.cycleDuration;
            const effectiveTime = this.simulation.time - tfl.timeShift;
            let timeInCycle = ((effectiveTime % cycleTime) + cycleTime) % cycleTime;

            let currentPhaseIdx = 0;
            let tempTime = timeInCycle;
            for (let i = 0; i < tfl.schedule.length; i++) {
                if (tempTime < tfl.schedule[i].duration) {
                    currentPhaseIdx = i;
                    break;
                }
                tempTime -= tfl.schedule[i].duration;
            }
            const elapsedInPhase = tempTime; // 當前綠燈已持續時間

            // 1. 獲取狀態
            const currentState = this.getState(nodeId, tfl, currentPhaseIdx, elapsedInPhase);

            // 2. 計算獎勵 (含協作)
            const localQueue = this.getTotalQueuePCU(nodeId);
            let reward = -localQueue;

            if (this.isCooperative) {
                const downstreamNodes = this.getDownstreamNodes(nodeId);
                let downstreamQueueTotal = 0;
                downstreamNodes.forEach(dsNodeId => {
                    downstreamQueueTotal += this.getTotalQueuePCU(dsNodeId);
                });
                reward -= (downstreamQueueTotal * 0.5);
            }

            if (!this.currentEpisodeRewards[nodeId]) this.currentEpisodeRewards[nodeId] = 0;
            this.currentEpisodeRewards[nodeId] += reward;

        // 3. 學習 (Q-Table 更新)
            if (this.isLearningEnabled && this.lastState[nodeId] !== undefined) {
                agent.learn(this.lastState[nodeId], this.lastAction[nodeId], reward, currentState);
            }

            // 4. 決策與執行
            // 自行計算當前時相剩餘時間與是否安全介入，取代不存在的 getCurrentStateInfo
            const currentPhase = tfl.schedule[currentPhaseIdx];
            const timeRemainingInPhase = currentPhase.duration - elapsedInPhase;
            
            // 判斷當前時相是否可安全介入：只要該時相內有任何「綠燈(Green)」，就允許 AI 延長或切斷
            // 如果是全紅燈或黃燈過渡期，則視為不可介入，讓它自然流動
            let isSafeToIntervene = false;
            for (const sig of Object.values(currentPhase.signals)) {
                if (sig === 'Green') {
                    isSafeToIntervene = true;
                    break;
                }
            }

            const stateInfo = {
                isSafeToIntervene: isSafeToIntervene,
                timeRemainingInPhase: timeRemainingInPhase
            };

            let action = 0;

            if (stateInfo.isSafeToIntervene) {
                action = agent.chooseAction(currentState);action = agent.chooseAction(currentState);

                // ★★★ 新增：記錄決策模式 ★★★
                this.lastActionType[nodeId] = agent.lastMode;

                // --- 防護 A: 強制最小綠燈時間 (針對 Action 1: Next) ---
                if (action === 1 && elapsedInPhase < this.minGreenDuration) {
                    action = 2; // Default
                }

                // ★★★ [新增] 防護 B: 防止回溯至上一時相 (針對 Action 0: Keep) ★★★
                // 如果當前綠燈剛開始（經過時間 < 補償時間），執行 Keep 會導致時間倒退回上一時相（如黃燈）
                // 這會導致步階判定錯誤 (Index - 1)，造成高亮往上跳。
                if (action === 0 && elapsedInPhase < timeToCompensate) {
                    action = 2; // 強制 Default，讓時間自然流動，直到深入綠燈區間
                }

                if (action === 0) {
                    // Action 0: Keep (延長/凍結)
                    tfl.timeShift += timeToCompensate;

                    // 防止閃爍修正 (Flicker Fix) - 用於延長綠燈尾端
                    // --- 替換掉原本的 tfl.getCurrentStateInfo，手動計算更新後的剩餘時間 ---
                    const updatedEffectiveTime = this.simulation.time - tfl.timeShift;
                    let updatedTimeInCycle = ((updatedEffectiveTime % cycleTime) + cycleTime) % cycleTime;
                    
                    let updatedPhaseIdx = 0;
                    let updatedElapsed = updatedTimeInCycle;
                    for (let i = 0; i < tfl.schedule.length; i++) {
                        if (updatedElapsed < tfl.schedule[i].duration) {
                            updatedPhaseIdx = i;
                            break;
                        }
                        updatedElapsed -= tfl.schedule[i].duration;
                    }
                    const updatedTimeRemaining = tfl.schedule[updatedPhaseIdx].duration - updatedElapsed;
                    // ------------------------------------------------------------------

                    const neededDuration = this.decisionInterval + 0.5;

                    if (updatedTimeRemaining < neededDuration) {
                        const extraShift = neededDuration - updatedTimeRemaining;
                        tfl.timeShift += extraShift;
                    }
                }
                else if (action === 1) {
                    // Action 1: Next (切斷)
                    // 強制結束當前綠燈
                    if (stateInfo.timeRemainingInPhase > 0) {
                        // 確保微小誤差下也能跨過邊界
                        tfl.timeShift -= (stateInfo.timeRemainingInPhase + 0.05);
                    }
                }
                else if (action === 2) {
                    // Action 2: Default (順其自然)
                }
            } else {
                // 不安全期間：強制 Default
                action = 2;
            }

            this.lastState[nodeId] = currentState;
            this.lastAction[nodeId] = action;
        });

        // 更新圖表 (維持原樣)
        this.episodeSteps++;
        if (this.episodeSteps % 20 === 0) {
            // ... (維持原樣)
            const avgRewardsPerNode = {};
            let globalSum = 0;
            let nodeCount = 0;
            for (const [nid, total] of Object.entries(this.currentEpisodeRewards)) {
                const avg = total / 20;
                avgRewardsPerNode[nid] = avg;
                globalSum += avg;
                nodeCount++;
            }
            const globalAvg = nodeCount > 0 ? globalSum / nodeCount : 0;
            this.updateChart(globalAvg, avgRewardsPerNode);
            this.currentEpisodeRewards = {};
            if (this.isLearningEnabled) {
                Object.values(this.agents).forEach(a => a.decayEpsilon());
            }
        }
    }

    // --- 圖表管理 (Chart.js) ---
    getNodeColor(str) {
        if (this.nodeColors[str]) return this.nodeColors[str];
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        const hex = "#" + "00000".substring(0, 6 - c.length) + c;
        this.nodeColors[str] = hex;
        return hex;
    }

    initChart() {
        const ctx = document.getElementById('aiTrainingChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Average (All)', data: [], borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.2)', tension: 0.3, borderWidth: 3, pointRadius: 0, order: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
                plugins: {
                    legend: {
                        display: true, position: 'top',
                        labels: { boxWidth: 10, font: { size: 10 }, usePointStyle: true },
                        onClick: function (e, legendItem, legend) {
                            const index = legendItem.datasetIndex;
                            const ci = legend.chart;
                            if (ci.isDatasetVisible(index)) { ci.hide(index); legendItem.hidden = true; }
                            else { ci.show(index); legendItem.hidden = false; }
                        }
                    },
                    tooltip: { enabled: true, mode: 'index', position: 'nearest' }
                },
                scales: { x: { display: false }, y: { beginAtZero: false, grid: { color: '#e5e5e5' } } }
            }
        });
    }

    updateChart(globalAvg, nodeDataMap) {
        if (!this.chart) return;
        const episodeNum = this.chart.data.labels.length + 1;
        this.chart.data.labels.push(episodeNum);
        this.chart.data.datasets[0].data.push(globalAvg);
        Object.entries(nodeDataMap).forEach(([nodeId, val]) => {
            let dataset = this.chart.data.datasets.find(ds => ds.label === nodeId);
            if (!dataset) {
                const color = this.getNodeColor(nodeId);
                dataset = { label: nodeId, data: new Array(this.chart.data.labels.length - 1).fill(null), borderColor: color, backgroundColor: color, tension: 0.1, borderWidth: 1, pointRadius: 0, hidden: true, order: 1 };
                this.chart.data.datasets.push(dataset);
                dataset.data.push(val);
            } else {
                dataset.data.push(val);
            }
        });
        if (this.chart.data.labels.length > 50) {
            this.chart.data.labels.shift();
            this.chart.data.datasets.forEach(ds => { if (ds.data.length > 0) ds.data.shift(); });
        }
        this.chart.update('none');
        const infoEl = document.getElementById('ai-stats-info');
        if (infoEl) {
            const eps = Object.values(this.agents)[0]?.epsilon.toFixed(3) || "1.000";
            infoEl.innerHTML = `Eps: ${eps} | Avg R: ${globalAvg.toFixed(1)}`;
        }
    }

    exportModel() {
        const data = JSON.stringify(this.agents);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `traffic_ai_model_${Date.now()}.json`;
        a.click();
    }

    importModel(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.agents = {};
                for (const [nodeId, agentData] of Object.entries(data)) {
                    const newAgent = new QLearningAgent(nodeId);
                    newAgent.qTable = agentData.qTable || {};
                    newAgent.epsilon = 0.01;
                    this.agents[nodeId] = newAgent;
                }
                alert("AI 模型載入成功！");
                if (this.chart) { this.chart.destroy(); this.chart = null; this.initChart(); }
            } catch (err) { alert("模型解析失敗"); console.error(err); }
        };
        reader.readAsText(file);
    }

    // ★★★ 新增：繪製 AI 資訊浮窗 (由 script02.js 的 redraw2D 呼叫) ★★★
    // ★★★ 修改後的 drawOverlay：在每一行顯示該步階的排隊量 ★★★
    // ★★★ 修改後的 drawOverlay：加入最小綠燈鎖定 (MinGreen Lock) 提示 ★★★
    // ★★★ 修改後的 drawOverlay：加入決策模式 (Q/RND) 顯示 ★★★
    // ★★★ 修改後的 drawOverlay：支援開關與拖曳 ★★★
    drawOverlay(ctx, worldToScreenFunc, scale) {
        // 1. 基本檢查：如果 AI 沒開，或使用者關閉浮窗，則不畫
        if (!this.isActive || !this.simulation || !this.showOverlay) return;

        // LOD: 縮放比例太小時隱藏
        const showDetails = scale > 0.4;
        if (!showDetails) return;

        // 2. 清空碰撞區 (每一幀重新計算)
        this.hitBoxes = [];

        ctx.save();
        ctx.font = "11px 'Roboto Mono', monospace";
        ctx.textBaseline = "top";

        const trafficLights = this.simulation.trafficLights;
        const time = this.simulation.time;

        trafficLights.forEach(tfl => {
            if (!this.agents[tfl.nodeId]) return;

            const node = this.simulation.network.nodes[tfl.nodeId];
            if (!node) return;

            // 計算路口螢幕座標
            let cx = 0, cy = 0;
            if (node.polygon && node.polygon.length > 0) {
                node.polygon.forEach(p => { cx += p.x; cy += p.y; });
                cx /= node.polygon.length;
                cy /= node.polygon.length;
            } else { return; }
            const screenPos = worldToScreenFunc(cx, cy);

            // --- 準備資料 ---
            const cycleTime = tfl.cycleDuration;
            if (cycleTime <= 0) return;

            const effectiveTime = time - tfl.timeShift;
            let timeInCycle = ((effectiveTime % cycleTime) + cycleTime) % cycleTime;

            let currentPhaseIdx = 0;
            let tempTime = timeInCycle;
            for (let i = 0; i < tfl.schedule.length; i++) {
                if (tempTime < tfl.schedule[i].duration) {
                    currentPhaseIdx = i;
                    break;
                }
                tempTime -= tfl.schedule[i].duration;
            }

            const elapsedInPhase = tempTime;
            const currentPhaseRemaining = tfl.schedule[currentPhaseIdx].duration - elapsedInPhase;
            const currQ = this.getPhaseQueuePCU(tfl.nodeId, tfl, currentPhaseIdx);

            let nextGreenPhaseIdx = (currentPhaseIdx + 1) % tfl.schedule.length;
            for (let k = 0; k < tfl.schedule.length; k++) {
                const potentialPhase = tfl.schedule[nextGreenPhaseIdx];
                let hasGreen = false;
                for (const sig of Object.values(potentialPhase.signals)) {
                    if (sig === 'Green') { hasGreen = true; break; }
                }
                if (hasGreen) break;
                else nextGreenPhaseIdx = (nextGreenPhaseIdx + 1) % tfl.schedule.length;
            }
            const nextQ = this.getPhaseQueuePCU(tfl.nodeId, tfl, nextGreenPhaseIdx);

            // --- 佈局參數 ---
            const lineHeight = 14;
            const padding = 6;
            const headerHeight = 30;
            const boxWidth = 180;
            const totalHeight = headerHeight + (tfl.schedule.length * lineHeight) + (padding * 2);

            // ★★★ 關鍵：套用使用者拖曳的偏移量 ★★★
            const userOffset = this.nodeOffsets[tfl.nodeId] || { x: 0, y: 0 };

            // 預設位置：路口左下角 (Left-Bottom)
            // 加上 userOffset
            const defaultOffsetX = -boxWidth - 20;
            const defaultOffsetY = 20;

            const boxX = screenPos.x + defaultOffsetX + userOffset.x;
            const boxY = screenPos.y + defaultOffsetY + userOffset.y;

            // ★ 註冊碰撞區 (HitBox) 用於點擊檢測 ★
            this.hitBoxes.push({
                nodeId: tfl.nodeId,
                x: boxX,
                y: boxY,
                w: boxWidth,
                h: totalHeight
            });

            // --- 繪圖 ---
            // 連接線 (只在偏移不遠時畫，或者畫到 Box 的最近點)
            ctx.beginPath();
            ctx.moveTo(screenPos.x, screenPos.y);
            // 連到浮窗的右上角 (或其他動態點，這裡簡化連到右上)
            ctx.lineTo(boxX + boxWidth, boxY);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // 背景與邊框
            ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
            ctx.fillRect(boxX, boxY, boxWidth, totalHeight);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(boxX, boxY, boxWidth, totalHeight);

            // 標題與模式
            const actionCode = this.lastAction[tfl.nodeId];
            const mode = this.lastActionType[tfl.nodeId];
            let modeStr = (mode === "Q") ? "(Q)" : (mode === "RND" ? "(RND)" : "");

            let actionText = "WAIT";
            let actionColor = "#aaa";

            if (elapsedInPhase < this.minGreenDuration) {
                const lockRemaining = this.minGreenDuration - elapsedInPhase;
                actionText = `LOCK:${lockRemaining.toFixed(1)}s`;
                actionColor = "#ffa500";
            } else {
                if (actionCode === 0) { actionText = "KEEP"; actionColor = "#4f4"; }
                else if (actionCode === 1) { actionText = "NEXT"; actionColor = "#f44"; }
                else if (actionCode === 2) { actionText = "DEF."; actionColor = "#ccc"; }
            }

            // Header Row 1
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px 'Roboto Mono', monospace";
            ctx.fillText(`Node:${tfl.nodeId}`, boxX + padding, boxY + padding);

            ctx.textAlign = "right";
            ctx.fillStyle = actionColor;
            const actionX = boxX + boxWidth - padding - (modeStr ? 35 : 0);
            ctx.fillText(`[${actionText}]`, actionX, boxY + padding);

            if (modeStr) {
                ctx.fillStyle = (mode === "RND") ? "#d8b4fe" : "#a5f3fc";
                ctx.font = "10px 'Roboto Mono', monospace";
                ctx.fillText(modeStr, boxX + boxWidth - padding, boxY + padding);
            }
            ctx.textAlign = "left";

            // Header Row 2
            ctx.fillStyle = "#4db8ff";
            ctx.font = "11px 'Roboto Mono', monospace";
            ctx.fillText(`CurQ:${currQ} | NxtQ:${nextQ}`, boxX + padding, boxY + padding + 14);

            // Line
            ctx.beginPath();
            ctx.moveTo(boxX, boxY + headerHeight);
            ctx.lineTo(boxX + boxWidth, boxY + headerHeight);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
            ctx.stroke();

            // Rows
            let currentY = boxY + padding + headerHeight;
            tfl.schedule.forEach((phase, idx) => {
                const isCurrent = (idx === currentPhaseIdx);
                if (isCurrent) {
                    if (elapsedInPhase < this.minGreenDuration) ctx.fillStyle = "rgba(255, 165, 0, 0.25)";
                    else ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
                    ctx.fillRect(boxX, currentY - 1, boxWidth, lineHeight);
                }

                ctx.fillStyle = isCurrent ? "#ffff00" : "#ccc";
                ctx.textAlign = "left";
                ctx.fillText(`#${idx} (${phase.duration}s)`, boxX + padding, currentY);

                const phaseQ = this.getPhaseQueuePCU(tfl.nodeId, tfl, idx);
                ctx.textAlign = "right";
                const rightEdge = boxX + boxWidth - padding;

                ctx.fillStyle = (phaseQ > 0) ? "#ff9999" : "#666";
                ctx.fillText(`Q:${phaseQ}`, rightEdge - 45, currentY);

                if (isCurrent) {
                    ctx.fillStyle = "#ffff00";
                    ctx.fillText(`${currentPhaseRemaining.toFixed(1)}s`, rightEdge, currentY);
                }

                ctx.textAlign = "left";
                currentY += lineHeight;
            });
        });

        ctx.restore();
    }

    // ★★★ 新增：處理滑鼠按下 (回傳 true 代表點擊到浮窗，需攔截地圖拖曳) ★★★
    handleMouseDown(mouseX, mouseY) {
        if (!this.isActive || !this.showOverlay) return false;

        // 檢查滑鼠是否點擊在任何一個浮窗的範圍內 (反向遍歷，因為後畫的在上層)
        for (let i = this.hitBoxes.length - 1; i >= 0; i--) {
            const box = this.hitBoxes[i];
            if (mouseX >= box.x && mouseX <= box.x + box.w &&
                mouseY >= box.y && mouseY <= box.y + box.h) {

                // 命中！開始拖曳
                const currentOffset = this.nodeOffsets[box.nodeId] || { x: 0, y: 0 };
                this.dragState = {
                    nodeId: box.nodeId,
                    startX: mouseX,
                    startY: mouseY,
                    originOffX: currentOffset.x,
                    originOffY: currentOffset.y
                };
                return true; // 告訴 script02.js：我處理了這個事件，不要拖曳地圖
            }
        }
        return false;
    }

    // ★★★ 新增：處理滑鼠移動 ★★★
    handleMouseMove(mouseX, mouseY) {
        if (!this.dragState) return false;

        const dx = mouseX - this.dragState.startX;
        const dy = mouseY - this.dragState.startY;

        // 更新該路口的偏移量
        this.nodeOffsets[this.dragState.nodeId] = {
            x: this.dragState.originOffX + dx,
            y: this.dragState.originOffY + dy
        };
        return true;
    }

    // ★★★ 新增：處理滑鼠放開 ★★★
    handleMouseUp() {
        if (this.dragState) {
            this.dragState = null;
            return true;
        }
        return false;
    }
}