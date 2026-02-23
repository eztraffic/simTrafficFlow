// --- START OF FILE script_report.js ---
class SignalReportGenerator {
    static init() {
        if (document.getElementById('signal-report-style')) return;

        // 注入報表專用 CSS (加入分頁設定與選擇器樣式)
        const style = document.createElement('style');
        style.id = 'signal-report-style';
        style.innerHTML = `
            #report-modal {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.8); z-index: 9999; display: none;
                justify-content: center; align-items: flex-start; overflow-y: auto; padding: 20px;
            }
            #report-container {
                background: white; color: black; width: 210mm; min-height: 297mm; 
                padding: 10mm; box-shadow: 0 0 15px rgba(0,0,0,0.5); position: relative;
                font-family: "Microsoft JhengHei", sans-serif;
            }
            .report-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .report-header h1 { font-size: 24px; margin: 0; font-weight: bold; }
            
            /* 控制列樣式 */
            .report-controls {
                background: #f0f4f8; padding: 10px; border-radius: 6px; margin-bottom: 20px;
                border: 1px solid #ccc;
            }
            .report-controls-top { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; }
            .node-selector-container { 
                display: flex; flex-wrap: wrap; gap: 10px; max-height: 100px; overflow-y: auto; 
                padding: 5px; background: #fff; border: 1px inset #ddd; border-radius: 4px;
            }
            .node-checkbox-label { cursor: pointer; display: flex; align-items: center; font-size: 14px; background: #e2e8f0; padding: 4px 8px; border-radius: 4px; }
            .node-checkbox-label input { margin-right: 5px; }
            
            /* 按鈕樣式 */
            .btn-print { background: #06b6d4; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 4px; font-weight: bold; }
            .btn-close { background: #ff4444; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 4px; font-weight: bold; margin-left: 10px; }
            .btn-mini-action { background: #64748b; color: white; border: none; padding: 4px 8px; cursor: pointer; border-radius: 4px; font-size: 12px; }
            .btn-render { background: #10b981; color: white; border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; font-weight: bold; }

            /* 表格與分頁樣式 */
            .page-break {
                page-break-after: always; /* 列印時強制換頁 */
                break-after: page;
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 2px dashed #aaa;
            }
            .page-break:last-child { border-bottom: none; page-break-after: auto; break-after: auto; margin-bottom: 0; }
            
            table.timing-table { width: 100%; border-collapse: collapse; border: 3px solid black; text-align: center; font-size: 14px; }
            table.timing-table th, table.timing-table td { border: 1px solid black; padding: 6px 4px; }
            table.timing-table th { background-color: #f2f2f2; font-weight: bold; }
            table.timing-table .section-title { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 5px; font-weight: bold; width: 30px; }
            table.timing-table .bold-border { border-bottom: 3px solid black; }
            .phase-diagram-container { width: 100px; height: 100px; margin: 0 auto; border: 1px solid #ccc; background: #fafafa;}
            
            @media print {
                body > *:not(#report-modal) { display: none !important; }
                #report-modal { position: absolute; left: 0; top: 0; background: none; padding: 0; overflow: visible; display: block; }
                #report-container { box-shadow: none; width: 100%; padding: 0; }
                .report-actions { display: none !important; }
                .page-break { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
            }
        `;
        document.head.appendChild(style);

        const modal = document.createElement('div');
        modal.id = 'report-modal';
        modal.innerHTML = `
            <div id="report-container">
                <div class="report-header report-actions">
                    <h1 id="report-title">路口號誌時制計畫表</h1>
                    <div>
                        <button class="btn-print" onclick="window.print()"><i class="fa-solid fa-print"></i> 列印 / 匯出 PDF</button>
                        <button class="btn-close" onclick="document.getElementById('report-modal').style.display='none'">關閉</button>
                    </div>
                </div>
                
                <!-- 選擇器區塊 (列印時隱藏) -->
                <div class="report-controls report-actions">
                    <div class="report-controls-top">
                        <span style="font-weight: bold;"><i class="fa-solid fa-filter"></i> 選擇要匯出的路口：</span>
                        <div>
                            <button class="btn-mini-action" onclick="SignalReportGenerator.selectAll(true)">全選</button>
                            <button class="btn-mini-action" onclick="SignalReportGenerator.selectAll(false)">全不選</button>
                            <button class="btn-render" onclick="SignalReportGenerator.renderSelected()" style="margin-left: 10px;"><i class="fa-solid fa-rotate-right"></i> 重新生成報表</button>
                        </div>
                    </div>
                    <div id="node-selector-list" class="node-selector-container"></div>
                </div>

                <!-- 報表內容渲染區 -->
                <div id="report-content"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 全選/全不選輔助函式
    static selectAll(checked) {
        document.querySelectorAll('.node-checkbox').forEach(cb => cb.checked = checked);
    }

    // 啟動 Modal 並載入路口清單
    static showModal(networkData, defaultSelectedNodeId = null) {
        this.init();
        this.networkData = networkData;

        const signalNodes = networkData.trafficLights.map(t => t.nodeId);
        if (signalNodes.length === 0) {
            alert("目前載入的路網中沒有包含任何號誌路口！");
            return;
        }

        // 產生 Checkbox 清單
        const selectorList = document.getElementById('node-selector-list');
        selectorList.innerHTML = '';
        
        signalNodes.forEach(nodeId => {
            const isChecked = defaultSelectedNodeId ? (nodeId === defaultSelectedNodeId) : true;
            const lbl = document.createElement('label');
            lbl.className = 'node-checkbox-label';
            lbl.innerHTML = `<input type="checkbox" value="${nodeId}" class="node-checkbox" ${isChecked ? 'checked' : ''}> 路口 ${nodeId}`;
            selectorList.appendChild(lbl);
        });

        document.getElementById('report-modal').style.display = 'flex';
        
        // 立即渲染一次
        this.renderSelected();
    }

    // 收集被選取的路口並執行批次渲染
    static renderSelected() {
        const checkboxes = document.querySelectorAll('.node-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        
        const contentDiv = document.getElementById('report-content');

        if(selectedIds.length === 0) {
            contentDiv.innerHTML = '<div style="padding: 30px; text-align: center; color: #666; font-size: 18px;">請於上方勾選至少一個路口以生成報表。</div>';
            return;
        }

        let combinedHtml = '';
        this.drawingQueue = []; // 重置繪圖佇列

        // 遍歷選取的路口，組合 HTML
        selectedIds.forEach(nodeId => {
            combinedHtml += this.generateSingleNodeHTML(nodeId, this.networkData);
        });

        contentDiv.innerHTML = combinedHtml;

        // 等待 DOM 渲染完畢後，執行 Canvas 繪製
        setTimeout(() => {
            this.drawingQueue.forEach(task => {
                this.drawPhaseDiagram(task.canvasId, task.nodeId, task.greenGroups, this.networkData);
            });
        }, 150);
    }

    // --- 核心資料轉換邏輯 ---
    static extractPhases(scheduleDef) {
        let phases = [];
        let currentPhase = { G: 0, Y: 0, R: 0, greenGroups: [] };
        const periods = scheduleDef.phases || scheduleDef;
        
        for (let period of periods) {
            let hasGreen = false;
            let hasYellow = false;
            let periodGroups = [];

            let entries = Array.isArray(period.signals) ? period.signals : Object.entries(period.signals).map(([k,v]) => ({groupId: k, state: v}));

            for (let sig of entries) {
                if (sig.state === 'Green') { hasGreen = true; periodGroups.push(sig.groupId); }
                if (sig.state === 'Yellow') hasYellow = true;
            }

            if (hasGreen) {
                if (currentPhase.G > 0 && currentPhase.Y > 0) {
                    phases.push(currentPhase);
                    currentPhase = { G: 0, Y: 0, R: 0, greenGroups: [] };
                }
                currentPhase.G += period.duration;
                currentPhase.greenGroups = [...new Set([...currentPhase.greenGroups, ...periodGroups])];
            } else if (hasYellow) {
                currentPhase.Y += period.duration;
            } else {
                currentPhase.R += period.duration;
            }
        }
        if (currentPhase.G > 0 || currentPhase.Y > 0) phases.push(currentPhase);
        return phases;
    }

    static formatTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    // --- 產生單一路口的 HTML ---
    static generateSingleNodeHTML(nodeId, networkData) {
        const tflCtrl = networkData.trafficLights.find(t => t.nodeId === nodeId);
        if (!tflCtrl) return '';

        const advConfig = tflCtrl.advancedConfig;
        let plans = [];
        let maxPhasesCount = 0;
        let dailyPlansMapping = [];
        let weeklyMapping = {1:'A', 2:'A', 3:'A', 4:'A', 5:'A', 6:'B', 7:'B'};

        if (advConfig && Object.keys(advConfig.schedules).length > 0) {
            Object.values(advConfig.schedules).forEach(sched => {
                const extractedPhases = this.extractPhases(sched);
                maxPhasesCount = Math.max(maxPhasesCount, extractedPhases.length);
                plans.push({ id: sched.id, cycle: sched.cycleDuration, offset: sched.timeShift, phases: extractedPhases });
            });
            if (Object.keys(advConfig.dailyPlans).length > 0) {
                const firstPlanKey = Object.keys(advConfig.dailyPlans)[0];
                const switches = advConfig.dailyPlans[firstPlanKey];
                for(let i=0; i<switches.length; i++) {
                    const st = this.formatTime(switches[i].startSeconds);
                    const ed = (i < switches.length - 1) ? this.formatTime(switches[i+1].startSeconds) : '24:00';
                    dailyPlansMapping.push({ id: i+1, time: `${st} - ${ed}`, planId: switches[i].scheduleId });
                }
            }
            if (Object.keys(advConfig.weekly).length > 0) weeklyMapping = advConfig.weekly;
        } else {
            const extractedPhases = this.extractPhases(tflCtrl.schedule);
            maxPhasesCount = extractedPhases.length;
            plans.push({ id: '1', cycle: tflCtrl.cycleDuration, offset: tflCtrl.timeShift, phases: extractedPhases });
            dailyPlansMapping.push({ id: 1, time: '00:00 - 24:00', planId: '1' });
        }

        // 加上 page-break class 進行分頁
        let html = `<div class="page-break">`;
        html += `<div style="margin-bottom: 10px; font-size: 18px;"><b>路口編號：</b> ${nodeId}</div>`;
        html += `
            <table class="timing-table">
                <tr>
                    <td rowspan="4" class="section-title">時制計畫</td>
                    <th>時制</th>
                    ${plans.map(p => `<th>${p.id}</th>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<th>-</th>').join('')}
                </tr>
                <tr>
                    <th>時差</th>
                    ${plans.map(p => `<td>${p.offset}</td>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('')}
                </tr>
                <tr>
                    <th>週期</th>
                    ${plans.map(p => `<td>${p.cycle}</td>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('')}
                </tr>
                <tr class="bold-border">
                    <th>燈號</th>
                    ${plans.map(p => `<th>秒數</th>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<th>秒數</th>').join('')}
                </tr>
        `;

        for (let i = 0; i < maxPhasesCount; i++) {
            ['G', 'Y', 'R'].forEach((light, idx) => {
                const isLast = (i === maxPhasesCount - 1 && light === 'R');
                html += `<tr ${isLast ? 'class="bold-border"' : ''}>`;
                if (idx === 0) html += `<td rowspan="3" class="section-title">第${i+1}時相</td>`;
                html += `<th>${light}${i+1}</th>`;
                plans.forEach(p => {
                    const phase = p.phases[i];
                    html += `<td>${phase ? phase[light] : '-'}</td>`;
                });
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;
            });
        }
        html += `</table>`;

        const refPhases = plans[0].phases;
        const lowerRowCount = Math.max(7, maxPhasesCount);

        html += `
            <table class="timing-table" style="border-top: none;">
                <tr>
                    <td rowspan="${lowerRowCount + 1}" class="section-title" style="border-top: none; border-bottom: none;">時相行車簡圖</td>
                    <th>時相</th>
                    <th colspan="2">行車簡圖 (自動化生成)</th>
                    <th colspan="3">時段管制計畫</th>
                    <th>星期</th>
                    <th>型態</th>
                </tr>
        `;

        for (let i = 0; i < maxPhasesCount; i++) {
            const timePlanRow = dailyPlansMapping[i] || { id: '', time: '', planId: '' };
            const dayMap = {0: '一', 1: '二', 2: '三', 3: '四', 4: '五', 5: '六', 6: '日'};
            const dayType = weeklyMapping[i+1] || '-';
            
            // 獨立的 Canvas ID
            const canvasId = `phase-canvas-${nodeId}-${i}`;

            html += `
                <tr>
                    <th>G${i+1}</th>
                    <td colspan="2"><canvas id="${canvasId}" class="phase-diagram-container" width="200" height="200"></canvas></td>
                    <td>${timePlanRow.id}</td>
                    <td>${timePlanRow.time}</td>
                    <td>${timePlanRow.planId}</td>
                    <td>${dayMap[i] || ''}</td>
                    <td>${dayType}</td>
                </tr>
            `;

            // 將畫圖任務加入佇列
            if (refPhases[i]) {
                this.drawingQueue.push({ canvasId, nodeId, greenGroups: refPhases[i].greenGroups });
            }
        }
        
        for(let i = maxPhasesCount; i < lowerRowCount; i++) {
            const timePlanRow = dailyPlansMapping[i] || { id: '', time: '', planId: '' };
            const dayMap = {0: '一', 1: '二', 2: '三', 3: '四', 4: '五', 5: '六', 6: '日'};
            const dayType = weeklyMapping[i+1] || '-';
            html += `
                <tr>
                    <td colspan="3" style="border-top: none; border-bottom: none; border-left: none; border-right: 1px solid black;"></td>
                    <td>${timePlanRow.id}</td>
                    <td>${timePlanRow.time}</td>
                    <td>${timePlanRow.planId}</td>
                    <td>${dayMap[i] || ''}</td>
                    <td>${dayType}</td>
                </tr>
            `;
        }

        html += `</table></div>`; // 結束 page-break div
        return html;
    }

    // --- Canvas 繪圖邏輯 ---
    static drawPhaseDiagram(canvasId, nodeId, greenGroups, networkData) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const node = networkData.nodes[nodeId];
        if (!node || node.polygon.length === 0) return;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        node.polygon.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        
        const padding = 30;
        minX -= padding; maxX += padding; minY -= padding; maxY += padding;
        
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const scale = Math.min(canvas.width / (maxX - minX), canvas.height / (maxY - minY)) * 0.9;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        ctx.fillStyle = '#e0e0e0';
        ctx.strokeStyle = '#999999';
        ctx.lineWidth = 1.5 / scale;

        Object.values(networkData.links).forEach(link => {
            if (link.source === nodeId || link.destination === nodeId) {
                link.geometry.forEach(geo => {
                    if (geo.points && geo.points.length > 2) {
                        ctx.beginPath();
                        ctx.moveTo(geo.points[0].x, geo.points[0].y);
                        for(let i=1; i<geo.points.length; i++) ctx.lineTo(geo.points[i].x, geo.points[i].y);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                    }
                });
            }
        });

        ctx.beginPath();
        ctx.moveTo(node.polygon[0].x, node.polygon[0].y);
        for(let i=1; i<node.polygon.length; i++) ctx.lineTo(node.polygon[i].x, node.polygon[i].y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#00aa00';
        ctx.fillStyle = '#00aa00';
        ctx.lineWidth = 4 / scale;

        node.transitions.forEach(trans => {
            if (trans.turnGroupId && greenGroups.includes(trans.turnGroupId) && trans.bezier) {
                const pts = trans.bezier.points;
                if(pts.length === 4) {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
                    ctx.stroke();

                    const q0 = { x: pts[2].x - pts[1].x, y: pts[2].y - pts[1].y };
                    const q1 = { x: pts[3].x - pts[2].x, y: pts[3].y - pts[2].y };
                    const angle = Math.atan2(q1.y, q1.x);
                    const arrowSize = 6 / scale;
                    
                    ctx.beginPath();
                    ctx.moveTo(pts[3].x, pts[3].y);
                    ctx.lineTo(pts[3].x - arrowSize * Math.cos(angle - Math.PI/6), pts[3].y - arrowSize * Math.sin(angle - Math.PI/6));
                    ctx.lineTo(pts[3].x - arrowSize * Math.cos(angle + Math.PI/6), pts[3].y - arrowSize * Math.sin(angle + Math.PI/6));
                    ctx.closePath();
                    ctx.fill();
                }
            }
        });

        ctx.restore();
    }
}
// --- END OF FILE script_report.js ---