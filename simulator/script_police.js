// --- START OF FILE script_police.js ---

class PoliceController {
    constructor(simulation) {
        this.simulation = simulation;
        this.isActive = false;
        this.selectedNodeId = null;
        this.hudElement = document.getElementById('police-hud');

        // 按鍵狀態
        this.isHoldingP = false;
        this.hasPressedN = false;

        this.bindEvents();
    }

    bindEvents() {
        window.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            if (e.key.toLowerCase() === 'p') this.isHoldingP = true;
            if (e.key.toLowerCase() === 'n') this.hasPressedN = true;
        });

        window.addEventListener('keyup', (e) => {
            if (!this.isActive) return;
            if (e.key.toLowerCase() === 'p') this.isHoldingP = false;
        });
    }

    setActive(active) {
        this.isActive = active;
        if (this.hudElement) {
            this.hudElement.style.display = active ? 'block' : 'none';
        }
        if (!active) {
            this.selectedNodeId = null;
            this.isHoldingP = false;
        }
    }

    // 處理滑鼠點擊 (在 2D 畫布上)
    handleMapClick(worldX, worldY, networkNodes) {
        if (!this.isActive) return;

        let bestNodeId = null;
        let minDist = Infinity;
        const SELECT_RADIUS = 30.0; // 點擊容許半徑

        // 尋找最近的有號誌路口
        for (const nodeId in networkNodes) {
            const node = networkNodes[nodeId];

            // 檢查該路口是否有號誌機
            if (!this.simulation || !this.simulation.trafficLights) continue;
            const hasLight = this.simulation.trafficLights.some(t => t.nodeId === nodeId);
            if (!hasLight) continue;

            // 計算距離 (假設 node 有 polygon，取幾何中心)
            let cx = 0, cy = 0;
            if (node.polygon && node.polygon.length > 0) {
                let sumX = 0, sumY = 0;
                node.polygon.forEach(p => { sumX += p.x; sumY += p.y; });
                cx = sumX / node.polygon.length;
                cy = sumY / node.polygon.length;
            }

            const dist = Math.hypot(worldX - cx, worldY - cy);
            if (dist < SELECT_RADIUS && dist < minDist) {
                minDist = dist;
                bestNodeId = nodeId;
            }
        }

        if (bestNodeId) {
            this.selectedNodeId = bestNodeId;
            this.showHUDMessage(`已選定路口: ${bestNodeId}`);
        } else {
            this.selectedNodeId = null;
            this.showHUDMessage("未選中路口");
        }
    }

    showHUDMessage(msg) {
        const msgEl = document.getElementById('police-hud-message');
        if (msgEl) {
            msgEl.textContent = msg;
            msgEl.style.opacity = 1;
            
            // 清除之前的 timeout 以避免閃爍 (選擇性優化，但原本的邏輯覆蓋也堪用)
            if (this.msgTimeout) clearTimeout(this.msgTimeout);
            
            this.msgTimeout = setTimeout(() => { 
                msgEl.style.opacity = 0; 
            }, 2000);
        }
    }

    // 每幀更新 (處理號誌控制邏輯)
    // dt 必須是「模擬時間增量 (simulationDt)」，而非真實時間增量
    update(dt) {
        if (!this.isActive || !this.selectedNodeId) {
            this.hasPressedN = false; // 重置觸發
            return;
        }

        const tfl = this.simulation.trafficLights.find(t => t.nodeId === this.selectedNodeId);
        if (!tfl) return;

        // 獲取當前號誌狀態資訊
        // 需確保 script02.js 中的 TrafficLightController 有實作 getCurrentStateInfo 方法
        const stateInfo = tfl.getCurrentStateInfo ? tfl.getCurrentStateInfo(this.simulation.time) : { isSafeToIntervene: false };

        if (stateInfo.isSafeToIntervene) {
            // 情境一：按住 P (凍結)
            if (this.isHoldingP) {
                // 原理：simulation.time 增加了 dt，我們也把 shift 增加 dt
                // effectiveTime = (time + dt) - (shift + dt) = time - shift (不變)
                tfl.timeShift += dt;
                
                // ★ 新增：顯示提示訊息
                this.showHUDMessage("號誌鎖定中");
            }

            // 情境二：按下 N (跳下一階)
            if (this.hasPressedN) {
                // 原理：減少 timeShift，讓 effectiveTime 瞬間增加「剩餘時間」
                // 微調：多加 0.05 確保跨過邊界
                if (stateInfo.timeRemainingInPhase) {
                    tfl.timeShift -= (stateInfo.timeRemainingInPhase + 0.05);
                    this.showHUDMessage("強制切換步階");
                }
                this.hasPressedN = false; // 單次觸發
            }
        } else {
            // 如果現在是黃燈或全紅，忽略指令，並重置單次觸發鍵
            if (this.hasPressedN) {
                // 也可以選擇在這裡顯示 "禁止操作 (黃燈/全紅)"
            }
            this.hasPressedN = false;
        }
    }

    // 繪製 2D 標記 (紅色空心圓)
    // transformFunc: 傳入 worldToScreen2D 函式
    draw(ctx, transformFunc) {
        if (!this.isActive || !this.selectedNodeId || !this.simulation || !this.simulation.network) return;

        const node = this.simulation.network.nodes[this.selectedNodeId];
        if (!node || !node.polygon || node.polygon.length === 0) return;

        // 1. 計算路口世界座標中心
        let cx = 0, cy = 0;
        node.polygon.forEach(p => { cx += p.x; cy += p.y; });
        cx /= node.polygon.length;
        cy /= node.polygon.length;

        // 2. 將世界座標轉換為螢幕座標 (解決偏移與跟隨問題)
        const screenPos = transformFunc(cx, cy);

        // 3. 繪製
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);

        // 紅色空心圓圈 (固定螢幕大小：半徑 20px)
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.lineWidth = 3; // 固定線寬
        ctx.strokeStyle = '#ff0000';
        ctx.stroke();

        // 閃爍填充效果
        const blink = Math.sin(Date.now() / 150) * 0.5 + 0.5;
        ctx.globalAlpha = blink * 0.3;
        ctx.fillStyle = '#ff0000';
        ctx.fill();

        ctx.restore();
    }
}