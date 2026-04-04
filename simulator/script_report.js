// --- START OF FILE script_report.js ---
class SignalReportGenerator {
    static init() {
        if (document.getElementById('signal-report-style')) return;

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
            
            .btn-print { background: #06b6d4; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 4px; font-weight: bold; }
            .btn-close { background: #ff4444; color: white; border: none; padding: 8px 15px; cursor: pointer; border-radius: 4px; font-weight: bold; margin-left: 10px; }
            .btn-mini-action { background: #64748b; color: white; border: none; padding: 4px 8px; cursor: pointer; border-radius: 4px; font-size: 12px; }
            .btn-render { background: #10b981; color: white; border: none; padding: 6px 12px; cursor: pointer; border-radius: 4px; font-weight: bold; }

            .page-break {
                page-break-after: always; 
                break-after: page;
                margin-bottom: 40px;
                padding-bottom: 20px;
                border-bottom: 2px dashed #aaa;
            }
            .page-break:last-child { border-bottom: none; page-break-after: auto; break-after: auto; margin-bottom: 0; padding-bottom: 0; }
            
            table.timing-table { width: 100%; border-collapse: collapse; border: 3px solid black; text-align: center; font-size: 13px; }
            table.timing-table th, table.timing-table td { border: 1px solid black; padding: 6px 4px; }
            table.timing-table th { background-color: #f2f2f2; font-weight: bold; }
            table.timing-table .section-title { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 5px; font-weight: bold; width: 30px; }
            table.timing-table .bold-border { border-bottom: 3px solid black; }
            .phase-diagram-container { width: 130px; height: 130px; margin: 0 auto; border: 1px solid #ccc; background: #fafafa; display: block; }
            
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
                
                <div class="report-controls report-actions">
                    <div class="report-controls-top">
                        <span style="font-weight: bold;"><i class="fa-solid fa-filter"></i> 選擇要匯出的路口：</span>
                        <div>
                            <button class="btn-mini-action" onclick="SignalReportGenerator.selectAll(true)">全選</button>
                            <button class="btn-mini-action" onclick="SignalReportGenerator.selectAll(false)">全不選</button>
                            <button class="btn-render" onclick="SignalReportGenerator.renderSelected()" style="margin-left: 10px;"><i class="fa-solid fa-rotate-right"></i> 重新生成</button>
                        </div>
                    </div>
                    <div id="node-selector-list" class="node-selector-container"></div>
                </div>

                <div id="report-content"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    static selectAll(checked) {
        document.querySelectorAll('.node-checkbox').forEach(cb => cb.checked = checked);
    }

    static showModal(networkData, defaultSelectedNodeId = null) {
        this.init();
        this.networkData = networkData;

        const signalNodes = networkData.trafficLights.map(t => t.nodeId);
        if (signalNodes.length === 0) {
            alert("目前載入的路網中沒有包含任何號誌路口！");
            return;
        }

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
        this.renderSelected();
    }

    static renderSelected() {
        const checkboxes = document.querySelectorAll('.node-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        const contentDiv = document.getElementById('report-content');

        if(selectedIds.length === 0) {
            contentDiv.innerHTML = '<div style="padding: 30px; text-align: center; color: #666; font-size: 18px;">請於上方勾選至少一個路口以生成報表。</div>';
            return;
        }

        let combinedHtml = '';
        this.drawingQueue = [];

        selectedIds.forEach(nodeId => {
            combinedHtml += this.generateSingleNodeHTML(nodeId, this.networkData);
        });

        contentDiv.innerHTML = combinedHtml;

        setTimeout(() => {
            this.drawingQueue.forEach(task => {
                this.drawPhaseDiagram(task.canvasId, task.nodeId, task.greenGroups, this.networkData);
            });
        }, 150);
    }

    // ★★★ 智慧型時相解析核心：精準判斷行人專用時相 ★★★
    static extractPhases(scheduleDef, nodeId, networkData) {
        let phases = [];
        let currentPhasePeriods = [];
        const periods = scheduleDef.phases || scheduleDef;
        
        // 1. 取得該路口「車輛專用」的 turnGroupId 集合 (用來判斷是否為行人專用時相)
        const node = networkData.nodes[nodeId];
        const tflCtrl = networkData.trafficLights.find(t => t.nodeId === nodeId);
        const nameMap = tflCtrl && tflCtrl.groupNameMap ? tflCtrl.groupNameMap : {};
        
        let vehicleGroupIds = new Set();
        if (node && node.transitions) {
            node.transitions.forEach(t => {
                if (t.turnGroupId) {
                    const actualId = nameMap[t.turnGroupId] ? String(nameMap[t.turnGroupId]) : String(t.turnGroupId);
                    vehicleGroupIds.add(actualId);
                }
            });
        }

        // 2. 切分原始 periods 成為單獨的 Phase
        for (let i = 0; i < periods.length; i++) {
            let period = periods[i];
            let entries = Array.isArray(period.signals) ? period.signals : Object.entries(period.signals).map(([k,v]) => ({groupId: k, state: v}));
            
            let hasGreen = entries.some(sig => sig.state === 'Green' || sig.state === 'FlashingGreen');
            
            let currentHasYellowOrRed = false;
            if (currentPhasePeriods.length > 0) {
                let hasY = currentPhasePeriods.some(p => {
                    let e = Array.isArray(p.signals) ? p.signals : Object.entries(p.signals).map(([k,v]) => ({state: v}));
                    return e.some(sig => sig.state === 'Yellow');
                });
                
                let lastP = currentPhasePeriods[currentPhasePeriods.length - 1];
                let eLast = Array.isArray(lastP.signals) ? lastP.signals : Object.entries(lastP.signals).map(([k,v]) => ({state: v}));
                let isAllRed = !eLast.some(sig => sig.state === 'Green' || sig.state === 'FlashingGreen' || sig.state === 'Yellow');
                
                if (hasY || isAllRed) currentHasYellowOrRed = true;
            }

            if (hasGreen && currentHasYellowOrRed && currentPhasePeriods.length > 0) {
                phases.push(currentPhasePeriods);
                currentPhasePeriods = [];
            }
            currentPhasePeriods.push(period);
        }
        if (currentPhasePeriods.length > 0) phases.push(currentPhasePeriods);

        // 3. 針對每個 Phase 分析是否為行人專用
        let parsedPhases = phases.map(phasePeriods => {
            let pData = { G: 0, Y: 0, R: 0, pg: '*', pf: '*', pr: '*', displayY: '*', displayR: '*', greenGroups: [] };
            
            // 判斷是否為「行人專用時相」 (該時相內沒有任何車輛軌跡是 Green/FlashingGreen/Yellow)
            let isPedestrianOnly = true;
            for (let p of phasePeriods) {
                let e = Array.isArray(p.signals) ? p.signals : Object.entries(p.signals).map(([k,v]) => ({groupId: k, state: v}));
                for (let sig of e) {
                    const actualId = nameMap[sig.groupId] ? String(nameMap[sig.groupId]) : String(sig.groupId);
                    if ((sig.state === 'Green' || sig.state === 'FlashingGreen' || sig.state === 'Yellow') && vehicleGroupIds.has(actualId)) {
                        isPedestrianOnly = false;
                        break;
                    }
                }
                if (!isPedestrianOnly) break;
            }

            // 收集該時相可通行的群組 (給行車簡圖畫綠色標線用)
            phasePeriods.forEach(p => {
                let e = Array.isArray(p.signals) ? p.signals : Object.entries(p.signals).map(([k,v]) => ({groupId: k, state: v}));
                e.forEach(sig => {
                    if (sig.state === 'Green' || sig.state === 'FlashingGreen') {
                        const actualId = nameMap[sig.groupId] ? String(nameMap[sig.groupId]) : String(sig.groupId);
                        pData.greenGroups.push(actualId);
                    }
                });
            });
            pData.greenGroups = [...new Set(pData.greenGroups)];

            if (isPedestrianOnly) {
                // ============== 情境 B：行人專用時相 ==============
                // 全部分配給行人，車輛黃燈與全紅直接設為 '*'
                let len = phasePeriods.length;
                if (len === 1) {
                    pData.pg = phasePeriods[0].duration;
                } else if (len === 2) {
                    pData.pg = phasePeriods[0].duration;
                    pData.pf = phasePeriods[1].duration;
                } else if (len >= 3) {
                    pData.pg = phasePeriods[0].duration;
                    pData.pf = phasePeriods[1].duration;
                    pData.pr = phasePeriods.slice(2).reduce((sum, p) => sum + p.duration, 0);
                }
                
                pData.G = '*';
                pData.displayY = '*';
                pData.displayR = '*'; 
            } else {
                // ============== 情境 A：一般車輛時相 (或人車共用) ==============
                let yellowIndex = -1;
                for (let i = 0; i < phasePeriods.length; i++) {
                    let e = Array.isArray(phasePeriods[i].signals) ? phasePeriods[i].signals : Object.entries(phasePeriods[i].signals).map(([k,v]) => ({groupId: k, state: v}));
                    if (e.some(sig => {
                        const actualId = nameMap[sig.groupId] ? String(nameMap[sig.groupId]) : String(sig.groupId);
                        return sig.state === 'Yellow' && vehicleGroupIds.has(actualId);
                    })) {
                        yellowIndex = i;
                        break;
                    }
                }

                if (yellowIndex !== -1) {
                    let greenSubPeriods = phasePeriods.slice(0, yellowIndex);
                    pData.G = greenSubPeriods.reduce((sum, p) => sum + p.duration, 0);
                    
                    if (greenSubPeriods.length === 1) {
                        pData.pg = greenSubPeriods[0].duration;
                    } else if (greenSubPeriods.length === 2) {
                        pData.pg = greenSubPeriods[0].duration;
                        pData.pf = greenSubPeriods[1].duration;
                    } else if (greenSubPeriods.length >= 3) {
                        pData.pg = greenSubPeriods[0].duration;
                        pData.pf = greenSubPeriods[1].duration;
                        pData.pr = greenSubPeriods.slice(2).reduce((sum, p) => sum + p.duration, 0);
                    }

                    pData.Y = phasePeriods[yellowIndex].duration;
                    pData.displayY = pData.Y;

                    let redSubPeriods = phasePeriods.slice(yellowIndex + 1);
                    pData.R = redSubPeriods.reduce((sum, p) => sum + p.duration, 0);
                    pData.displayR = pData.R > 0 ? pData.R : '*';
                } else {
                    pData.G = phasePeriods.reduce((sum, p) => sum + p.duration, 0);
                    pData.pg = pData.G;
                    pData.displayY = '*';
                    pData.displayR = '*';
                }
            }

            return pData;
        });

        return parsedPhases;
    }

    static formatTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    static checkHasPedestrianSignals(nodeId, networkData) {
        if (!networkData.roadMarkings) return false;
        return networkData.roadMarkings.some(mark => {
            if (mark.type !== 'crosswalk' && mark.type !== 'diagonal_crosswalk') return false;
            let belongs = (mark.nodeId === nodeId);
            if (!belongs && mark.linkId) {
                const link = networkData.links[mark.linkId];
                if (link && (link.source === nodeId || link.destination === nodeId)) belongs = true;
            }
            return belongs;
        });
    }

    static generateSingleNodeHTML(nodeId, networkData) {
        const tflCtrl = networkData.trafficLights.find(t => t.nodeId === nodeId);
        if (!tflCtrl) return '';

        const advConfig = tflCtrl.advancedConfig;
        let plans = [];
        let maxPhasesCount = 0;
        
        let planKeys = [];
        let plansData = {};
        let maxTimeSegments = 0;
        let weeklyMapping = {1:'A', 2:'A', 3:'A', 4:'A', 5:'A', 6:'B', 7:'B'};

        if (advConfig && Object.keys(advConfig.schedules).length > 0) {
            Object.values(advConfig.schedules).forEach(sched => {
                const extractedPhases = this.extractPhases(sched, nodeId, networkData);
                maxPhasesCount = Math.max(maxPhasesCount, extractedPhases.length);
                plans.push({ id: sched.id, cycle: sched.cycleDuration, offset: sched.timeShift, phases: extractedPhases });
            });

            if (Object.keys(advConfig.dailyPlans).length > 0) {
                planKeys = Object.keys(advConfig.dailyPlans);
                planKeys.forEach(pk => {
                    const switches = advConfig.dailyPlans[pk];
                    maxTimeSegments = Math.max(maxTimeSegments, switches.length);
                    plansData[pk] = switches.map((sw, i) => {
                        const st = this.formatTime(sw.startSeconds);
                        const ed = (i < switches.length - 1) ? this.formatTime(switches[i+1].startSeconds) : '24:00';
                        return { time: `${st} - ${ed}`, scheduleId: sw.scheduleId };
                    });
                });
            }
            if (Object.keys(advConfig.weekly).length > 0) weeklyMapping = advConfig.weekly;
        } else {
            const extractedPhases = this.extractPhases(tflCtrl.schedule, nodeId, networkData);
            maxPhasesCount = extractedPhases.length;
            plans.push({ id: '1', cycle: tflCtrl.cycleDuration, offset: tflCtrl.timeShift, phases: extractedPhases });
            planKeys = ['A'];
            maxTimeSegments = 1;
            plansData['A'] = [{ time: '00:00 - 24:00', scheduleId: '1' }];
        }

        const hasPed = this.checkHasPedestrianSignals(nodeId, networkData);

        let html = `<div class="page-break">`;
        html += `<div style="margin-bottom: 10px; font-size: 18px;"><b>路口編號：</b> ${nodeId}</div>`;
        
        // --- 報表上半部：時相秒數 ---
        html += `
            <table class="timing-table">
                <tr>
                    <td rowspan="4" class="section-title">時制計畫</td>
                    <th colspan="2">時制</th>
                    ${plans.map(p => `<th>${p.id}</th>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<th>-</th>').join('')}
                </tr>
                <tr>
                    <th colspan="2">時差</th>
                    ${plans.map(p => `<td>${p.offset}</td>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('')}
                </tr>
                <tr>
                    <th colspan="2">週期</th>
                    ${plans.map(p => `<td>${p.cycle}</td>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('')}
                </tr>
                <tr class="bold-border">
                    <th colspan="2">燈號</th>
                    ${plans.map(p => `<th>秒數</th>`).join('')}
                    ${Array(Math.max(0, 7 - plans.length)).fill('<th>秒數</th>').join('')}
                </tr>
        `;

        for (let i = 0; i < maxPhasesCount; i++) {
            if (hasPed) {
                html += `<tr>`;
                html += `<td rowspan="5" class="section-title">第${i+1}時相</td>`;
                html += `<th rowspan="3">G${i+1}</th>`;
                html += `<th>行綠</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].pg : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;

                html += `<tr><th>行閃</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].pf : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;

                html += `<tr><th>行停</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].pr : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;

                html += `<tr><th>Y${i+1}</th><th>黃燈</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].displayY : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;

                html += `<tr style="border-bottom: 3px solid black;">`;
                html += `<th>R${i+1}</th><th>全紅</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].displayR : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;
            } else {
                html += `<tr>`;
                html += `<td rowspan="3" class="section-title">第${i+1}時相</td>`;
                html += `<th>G${i+1}</th><th>綠燈</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].G : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;

                html += `<tr><th>Y${i+1}</th><th>黃燈</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].displayY : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;

                html += `<tr style="border-bottom: 3px solid black;">`;
                html += `<th>R${i+1}</th><th>全紅</th>`;
                plans.forEach(p => html += `<td>${p.phases[i] ? p.phases[i].displayR : '-'}</td>`);
                html += Array(Math.max(0, 7 - plans.length)).fill('<td>-</td>').join('');
                html += `</tr>`;
            }
        }
        html += `</table>`;

        // --- 報表下半部 ---
        const refPhases = plans[0].phases;
        const dayMap = {0: '一', 1: '二', 2: '三', 3: '四', 4: '五', 5: '六', 6: '日'};
        const maxRows = Math.max(maxPhasesCount, maxTimeSegments, 7);

        html += `
            <table class="timing-table" style="border-top: none;">
                <tr>
                    <td rowspan="${maxRows + 2}" class="section-title" style="border-top: none; border-bottom: none;">時相行車簡圖</td>
                    <th rowspan="2">時相</th>
                    <th rowspan="2" style="width: 140px;">行車簡圖 (自動生成)</th>
                    
                    <td rowspan="${maxRows + 2}" class="section-title" style="border-top: none; border-bottom: none; width:30px;">時段管制計畫</td>
                    <th rowspan="2">時段</th>
                    ${planKeys.map(k => `<th colspan="2">型態 ${k}</th>`).join('')}
                    
                    <th rowspan="2">星期</th>
                    <th rowspan="2">型態</th>
                </tr>
                <tr>
                    ${planKeys.map(k => `<th>時間</th><th>時制</th>`).join('')}
                </tr>
        `;

        for (let r = 0; r < maxRows; r++) {
            html += `<tr>`;
            
            if (r < maxPhasesCount) {
                const canvasId = `phase-canvas-${nodeId}-${r}`;
                html += `<th>G${r+1}</th><td style="padding: 10px 0;"><canvas id="${canvasId}" class="phase-diagram-container" width="200" height="200"></canvas></td>`;
                if (refPhases[r]) {
                    this.drawingQueue.push({ canvasId, nodeId, greenGroups: refPhases[r].greenGroups });
                }
            } else {
                html += `<td colspan="2" style="border-top: none; border-bottom: none; border-left: none; border-right: 1px solid black;"></td>`;
            }

            if (r < maxTimeSegments) html += `<td>${r+1}</td>`;
            else html += `<td></td>`;

            planKeys.forEach(pk => {
                const step = plansData[pk][r];
                if (step) html += `<td>${step.time}</td><td>${step.scheduleId}</td>`;
                else html += `<td></td><td></td>`;
            });

            if (r < 7) html += `<td>${dayMap[r]}</td><td>${weeklyMapping[r+1] || '-'}</td>`;
            else html += `<td></td><td></td>`;

            html += `</tr>`;
        }

        html += `</table></div>`;
        return html;
    }

    // 取得行穿線真實內部使用的對應群組 ID
    static getCrosswalkSignalGroupId(mark, nodeId, networkData, lineData) {
        let rawId = mark.signalGroupId;

        if (!rawId && lineData) {
            const cwVecX = lineData.p2.x - lineData.p1.x;
            const cwVecY = lineData.p2.y - lineData.p1.y;
            const node = networkData.nodes[nodeId];

            if (node && node.transitions) {
                for (const t of node.transitions) {
                    if (t.sourceLinkId !== t.destLinkId && t.turnGroupId) {
                        const srcL = networkData.links[t.sourceLinkId];
                        const dstL = networkData.links[t.destLinkId];
                        if (srcL && dstL && srcL.lanes[t.sourceLaneIndex || 0] && dstL.lanes[t.destLaneIndex || 0]) {
                            const srcPath = srcL.lanes[t.sourceLaneIndex || 0].path;
                            const dstPath = dstL.lanes[t.destLaneIndex || 0].path;
                            if (srcPath.length > 0 && dstPath.length > 0) {
                                const dx = dstPath[0].x - srcPath[srcPath.length - 1].x;
                                const dy = dstPath[0].y - srcPath[srcPath.length - 1].y;
                                const len = Math.hypot(dx, dy);
                                if (len > 0.1) {
                                    const dot = (cwVecX * dx + cwVecY * dy) / (Math.hypot(cwVecX, cwVecY) * len);
                                    if (Math.abs(dot) > 0.8) {
                                        rawId = t.turnGroupId;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (rawId) {
            const tflCtrl = networkData.trafficLights.find(t => t.nodeId === nodeId);
            if (tflCtrl && tflCtrl.groupNameMap && tflCtrl.groupNameMap[rawId]) {
                return String(tflCtrl.groupNameMap[rawId]);
            }
            return String(rawId);
        }
        return null;
    }

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

        // 3. 繪製行人穿越道 (嚴格聯動綠燈狀態)
        if (networkData.roadMarkings) {
            networkData.roadMarkings.forEach(mark => {
                let belongsToNode = (mark.nodeId === nodeId);
                if (!belongsToNode && mark.linkId) {
                    const link = networkData.links[mark.linkId];
                    if (link && (link.source === nodeId || link.destination === nodeId)) belongsToNode = true;
                }

                if (belongsToNode && (mark.type === 'crosswalk' || mark.type === 'diagonal_crosswalk')) {
                    let lineData = null;
                    if (mark.type === 'crosswalk' && typeof window.calculateCrosswalkLine === 'function') {
                        lineData = window.calculateCrosswalkLine(mark, networkData);
                    }

                    const groupId = this.getCrosswalkSignalGroupId(mark, nodeId, networkData, lineData);
                    const isActive = groupId && greenGroups.includes(String(groupId));

                    ctx.strokeStyle = isActive ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.85)';
                    const dashLen = 2.0 / scale; 
                    ctx.setLineDash([dashLen, dashLen]);
                    ctx.lineCap = 'butt';

                    if (mark.type === 'crosswalk' && lineData) {
                        ctx.lineWidth = lineData.width;
                        ctx.beginPath();
                        ctx.moveTo(lineData.p1.x, lineData.p1.y);
                        ctx.lineTo(lineData.p2.x, lineData.p2.y);
                        ctx.stroke();
                    } 
                    else if (mark.type === 'diagonal_crosswalk' && mark.corners) {
                        ctx.lineWidth = 4.0;
                        const [c0, c1, c2, c3] = mark.corners;
                        ctx.beginPath();
                        ctx.moveTo(c0.x, c0.y); ctx.lineTo(c2.x, c2.y);
                        ctx.moveTo(c1.x, c1.y); ctx.lineTo(c3.x, c3.y);
                        ctx.stroke();
                    }
                    ctx.setLineDash([]); 
                }
            });
        }

        // 4. 繪製車流綠色軌跡與箭頭
        ctx.strokeStyle = '#00aa00';
        ctx.fillStyle = '#00aa00';
        ctx.lineWidth = 4 / scale;

        node.transitions.forEach(trans => {
            if (trans.turnGroupId && greenGroups.includes(String(trans.turnGroupId)) && trans.bezier) {
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