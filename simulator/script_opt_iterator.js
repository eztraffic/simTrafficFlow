// --- START OF FILE script_opt_iterator.js (修正版 - 全局總進度條) ---

class OptimizationLooper {
    constructor(controller) {
        this.controller = controller; // 參照 OptimizerController
        
        // 狀態管理
        this.state = 'IDLE'; // 'IDLE', 'SAMPLING'
        
        this.totalIterationsRequested = 0; // ★ 新增：總共要跑幾輪
        this.remainingIterations = 0;      // 剩餘幾輪
        
        this.sampleTimer = 0;
        this.sampleDuration = 120; 
        
        // 數據收集容器
        this.realtimeLinkSpeeds = {}; 
        this.realtimeTurnCounts = {}; 
    }

    // --- 控制介面 ---

    startIteration(count, duration) {
        if (count <= 0) return;
        
        this.totalIterationsRequested = count; // ★ 記錄總數
        this.remainingIterations = count;
        this.sampleDuration = duration;
        
        this.resetSamplingData();
        this.state = 'SAMPLING';
        this.sampleTimer = this.sampleDuration;
        
        console.log(`[Looper] Started sequence. Total: ${count}, Duration/Iter: ${duration}s`);
        
        // 初始化 UI
        this.updateProgressUI(); 
    }

    stop() {
        this.state = 'IDLE';
        this.remainingIterations = 0;
        this.controller.updateStatusText("Iteration Stopped", '#999');
        this.controller.updateProgressBar(0, "Stopped");
    }

    // --- 核心循環 ---

    update(dt) {
        if (this.state !== 'SAMPLING') return;

        this.sampleTimer -= dt;

        // ★★★ 修正：計算全局總進度 ★★★
        this.updateProgressUI();

        if (this.sampleTimer <= 0) {
            this.performAdjustment();
        }
    }

    // ★ 抽離出 UI 更新邏輯
    updateProgressUI() {
        // 1. 計算目前是第幾輪 (0-based index)
        // 例如總共5輪，剩5輪時為第0輪，剩1輪時為第4輪
        const currentIterIndex = this.totalIterationsRequested - this.remainingIterations;
        
        // 2. 計算這一輪已經過了幾秒
        const timePassedInCurrent = this.sampleDuration - this.sampleTimer;

        // 3. 計算總累積時間 (已完成輪次總秒數 + 當前輪次已過秒數)
        const totalTimePassed = (currentIterIndex * this.sampleDuration) + timePassedInCurrent;

        // 4. 計算總目標時間
        const grandTotalTime = this.totalIterationsRequested * this.sampleDuration;

        // 5. 計算百分比
        let percent = (totalTimePassed / grandTotalTime) * 100;
        percent = Math.min(100, Math.max(0, percent)); // 限制在 0-100

        // 6. 計算剩餘總秒數
        const totalTimeLeft = Math.ceil(grandTotalTime - totalTimePassed);

        // 7. 格式化文字: "Iter 1/5 (115s left)"
        const iterText = `Iter ${currentIterIndex + 1}/${this.totalIterationsRequested}`;
        const timeText = `${totalTimeLeft}s left`;
        
        this.controller.updateProgressBar(percent, `${iterText} (${timeText})`);
        
        // 更新狀態文字 (只在每輪剛開始時更新一次顏色即可，這裡保持常態更新也無妨)
        if (this.controller.statusText.textContent.indexOf('Sampling') === -1) {
             this.controller.updateStatusText(`Sampling... ${iterText}`, '#3b82f6');
        }
    }

    // --- 資料收集 ---

    collectLinkData(linkId, travelTime, distance) {
        if (this.state !== 'SAMPLING') return;
        if (travelTime <= 0.1) return;

        const speedMs = distance / travelTime;
        if (speedMs < 0.1 || speedMs > 40) return;

        if (!this.realtimeLinkSpeeds[linkId]) {
            this.realtimeLinkSpeeds[linkId] = { sumSpeed: 0, count: 0 };
        }
        this.realtimeLinkSpeeds[linkId].sumSpeed += speedMs;
        this.realtimeLinkSpeeds[linkId].count++;
    }

    collectTurnData(nodeId, turnGroupId) {
        if (this.state !== 'SAMPLING') return;
        
        if (!this.realtimeTurnCounts[nodeId]) {
            this.realtimeTurnCounts[nodeId] = {};
        }
        if (!this.realtimeTurnCounts[nodeId][turnGroupId]) {
            this.realtimeTurnCounts[nodeId][turnGroupId] = 0;
        }
        this.realtimeTurnCounts[nodeId][turnGroupId]++;
    }

    resetSamplingData() {
        this.realtimeLinkSpeeds = {};
        this.realtimeTurnCounts = {};
    }

    // --- 參數修正與應用 ---

    performAdjustment() {
        console.log(`[Looper] Optimization triggered for Iteration #${this.totalIterationsRequested - this.remainingIterations + 1}`);

        // 1. 計算平均實際車速
        const avgSpeedMap = {};
        for (const [linkId, data] of Object.entries(this.realtimeLinkSpeeds)) {
            if (data.count > 0) {
                avgSpeedMap[linkId] = data.sumSpeed / data.count;
            }
        }

        // 2. 計算實際流率
        const actualFlowCounts = {};
        for (const [nodeId, groups] of Object.entries(this.realtimeTurnCounts)) {
            actualFlowCounts[nodeId] = {};
            for (const [gid, count] of Object.entries(groups)) {
                // Rate = (Count / SampleDuration) * 3600
                const rate = (count / this.sampleDuration) * 3600;
                actualFlowCounts[nodeId][gid] = rate;
            }
        }

        // 3. 注入 Controller
        this.controller.mergeFlowCounts(actualFlowCounts, 0.7);
        this.controller.setRealtimeLinkSpeeds(avgSpeedMap);
        this.controller.runIterationUpdate(); 

        // 4. 準備下一輪
        this.remainingIterations--;
        
        if (this.remainingIterations > 0) {
            this.resetSamplingData();
            this.sampleTimer = this.sampleDuration; 
            // 狀態文字更新會在 update 的 updateProgressUI 中自動處理
        } else {
            this.state = 'IDLE';
            console.log("[Looper] All iterations completed.");
            this.controller.updateStatusText("Iteration Complete", '#10b981');
            this.controller.updateProgressBar(100, "Done");
            this.controller.onIterationSequenceComplete(); 
        }
    }
}