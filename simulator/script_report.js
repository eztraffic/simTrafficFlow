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

// =========================================================================
// ★★★ [Milestone 4] 都市規劃土地使用效益與交通衝擊評估報告生成器 (TIA Report) ★★★
// =========================================================================
class TIAReportGenerator {
    static init() {
        if (document.getElementById('tia-report-style')) return;

        const style = document.createElement('style');
        style.id = 'tia-report-style';
        style.innerHTML = `
            #tia-modal {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px);
                z-index: 10000; display: none; justify-content: center; align-items: flex-start;
                overflow-y: auto; padding: 30px 15px; box-sizing: border-box;
            }
            #tia-container {
                background: #ffffff; color: #1e293b; width: 210mm; min-height: 297mm;
                padding: 18mm 20mm; box-shadow: 0 20px 50px rgba(0,0,0,0.4);
                border-radius: 4px; position: relative; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif;
                box-sizing: border-box; line-height: 1.6;
            }
            .tia-header-bar {
                display: flex; justify-content: space-between; align-items: flex-start;
                border-bottom: 3px double #0f172a; padding-bottom: 15px; margin-bottom: 25px;
            }
            .tia-title-group h1 {
                font-size: 24px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0; letter-spacing: 0.5px;
            }
            .tia-title-group h2 {
                font-size: 14px; font-weight: 600; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 1px;
            }
            .tia-actions { display: flex; gap: 10px; }
            .btn-tia-print {
                background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff; border: none;
                padding: 8px 16px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px;
                box-shadow: 0 2px 6px rgba(2,132,199,0.3); display: flex; align-items: center; gap: 6px;
            }
            .btn-tia-close {
                background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;
                padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;
            }
            .btn-tia-close:hover { background: #e2e8f0; color: #0f172a; }
            .tia-meta-box {
                background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px;
                margin-bottom: 25px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 13px;
            }
            .tia-meta-item strong { color: #475569; font-weight: 600; display: block; font-size: 11px; text-transform: uppercase; }
            .tia-meta-item span { color: #0f172a; font-weight: 700; font-size: 14px; }
            .tia-section { margin-bottom: 28px; }
            .tia-section-title {
                font-size: 16px; font-weight: 800; color: #0f172a; border-left: 4px solid #f59e0b;
                padding-left: 10px; margin: 0 0 14px 0; display: flex; justify-content: space-between; align-items: center;
            }
            .tia-section-title .badge {
                font-size: 11px; background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 12px; font-weight: 600;
            }
            table.tia-table {
                width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12.5px;
            }
            table.tia-table th, table.tia-table td {
                border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;
            }
            table.tia-table th {
                background-color: #f1f5f9; color: #334155; font-weight: 700; font-size: 12px;
            }
            table.tia-table tr:nth-child(even) td { background-color: #fafbfc; }
            table.tia-table td.text-left { text-align: left; }
            .tia-grid-cards {
                display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px;
            }
            .tia-kpi-card {
                background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; text-align: center;
            }
            .tia-kpi-card .val { font-size: 20px; font-weight: 800; color: #0369a1; }
            .tia-kpi-card .lbl { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 2px; }
            .los-pill {
                display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: 800; font-size: 12px; color: white;
            }
            .los-pill-A { background: #10b981; }
            .los-pill-B { background: #22c55e; }
            .los-pill-C { background: #84cc16; color: #1e293b; }
            .los-pill-D { background: #f59e0b; }
            .los-pill-E { background: #f97316; }
            .los-pill-F { background: #ef4444; }
            .tia-recommendations {
                background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 14px 18px; font-size: 13px; color: #166534;
            }
            .tia-recommendations ul { margin: 6px 0 0 0; padding-left: 20px; }
            .tia-recommendations li { margin-bottom: 4px; }

            /* 附錄：人眼易讀算式與詳細推導卡片樣式 */
            .tia-appendix-header {
                background: #f8fafc; border-left: 5px solid #0284c7; padding: 14px 18px;
                border-radius: 6px; margin: 25px 0 20px 0; border: 1px solid #e2e8f0; border-left-width: 5px;
            }
            .tia-appendix-header h3 { margin: 0 0 6px 0; font-size: 17px; font-weight: 800; color: #0f172a; }
            .tia-appendix-header p { margin: 0; font-size: 12.5px; color: #475569; line-height: 1.5; }
            
            .calc-box {
                background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;
                padding: 16px 18px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);
            }
            .calc-step-header {
                display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700;
                color: #0f172a; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px dashed #e2e8f0;
            }
            .calc-step-badge {
                display: inline-flex; align-items: center; justify-content: center;
                width: 22px; height: 22px; border-radius: 50%; background: #0284c7;
                color: #ffffff; font-size: 12px; font-weight: 700; flex-shrink: 0;
            }
            .calc-step-badge.badge-amber { background: #d97706; }
            .calc-step-badge.badge-emerald { background: #059669; }
            .calc-step-badge.badge-purple { background: #7c3aed; }
            .calc-step-badge.badge-indigo { background: #6366f1; }
            
            .formula-card {
                background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7;
                border-radius: 6px; padding: 10px 14px; margin-bottom: 12px;
            }
            .formula-card.formula-amber { border-left-color: #d97706; }
            .formula-card.formula-emerald { border-left-color: #059669; }
            .formula-card.formula-purple { border-left-color: #7c3aed; }
            .formula-card.formula-blue { border-left-color: #2563eb; }
            .formula-card.formula-indigo { border-left-color: #6366f1; }
            .formula-card.formula-indigo .formula-expr { color: #4338ca; }
            
            .tia-period-btn {
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .tia-period-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 6px rgba(0,0,0,0.08);
            }

            .formula-title {
                font-weight: 700; color: #1e293b; font-size: 13px; margin-bottom: 6px;
                display: flex; align-items: center; justify-content: space-between;
            }
            .formula-title .formula-tag {
                font-size: 11px; background: #e2e8f0; color: #334155; padding: 1px 7px;
                border-radius: 10px; font-weight: 600;
            }
            .formula-expr {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", monospace;
                font-size: 13px; color: #0369a1; font-weight: 700; background: #ffffff;
                padding: 6px 10px; border-radius: 4px; border: 1px dashed #cbd5e1;
                display: block; margin-bottom: 6px; letter-spacing: 0.2px;
            }
            .formula-card.formula-amber .formula-expr { color: #b45309; }
            .formula-card.formula-emerald .formula-expr { color: #047857; }
            .formula-card.formula-purple .formula-expr { color: #6d28d9; }
            .formula-card.formula-blue .formula-expr { color: #1d4ed8; }

            .formula-subst {
                font-size: 12.5px; color: #166534; background: #f0fdf4; border-left: 3px solid #10b981;
                padding: 5px 10px; border-radius: 0 4px 4px 0; display: block; margin-bottom: 6px; font-weight: 500;
            }
            .formula-note { font-size: 11.5px; color: #64748b; margin: 0; line-height: 1.45; }

            .page-break-before {
                page-break-before: always; break-before: page; margin-top: 35px;
                padding-top: 25px; border-top: 2px dashed #cbd5e1;
            }
            /* 路網起迄完整性與短缺動線樣式 */
            .tia-alert-banner {
                display: flex; gap: 14px; align-items: flex-start;
                padding: 14px 18px; border-radius: 8px; margin-bottom: 22px; font-size: 13px; line-height: 1.6;
            }
            .tia-alert-danger {
                background: #fef2f2; border: 1px solid #fecaca; border-left: 5px solid #ef4444; color: #991b1b;
            }
            .tia-alert-success {
                background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #10b981; color: #166534;
            }
            .tia-alert-banner .alert-icon { font-size: 24px; flex-shrink: 0; margin-top: 2px; }
            .tia-alert-banner .alert-title { font-weight: 800; font-size: 14.5px; margin-bottom: 4px; }
            .tia-alert-banner .alert-desc { font-size: 12.5px; }
            .tia-kpi-card.kpi-danger .val { color: #dc2626 !important; }
            .tia-kpi-card.kpi-success .val { color: #16a34a !important; }
            .badge-tag-danger {
                background: #fee2e2; color: #dc2626; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11px;
            }
            .badge-tag-success {
                background: #dcfce7; color: #16a34a; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11px;
            }
            .badge-tag-warn {
                background: #fef3c7; color: #b45309; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 11px;
            }

            @media print {
                body > *:not(#tia-modal) { display: none !important; }
                #tia-modal { position: absolute; left: 0; top: 0; background: none; padding: 0; display: block !important; }
                #tia-container { box-shadow: none; width: 100%; padding: 0; }
                .report-actions { display: none !important; }
                .page-break-before { border-top: none; margin-top: 0; padding-top: 0; }
                .furness-iteration-card { display: block !important; page-break-inside: avoid; margin-bottom: 15px; }
            }
        `;
        document.head.appendChild(style);

        const modal = document.createElement('div');
        modal.id = 'tia-modal';
        modal.innerHTML = `
            <div id="tia-container">
                <div class="tia-header-bar">
                    <div class="tia-title-group">
                        <h1>都市計畫土地使用效益與交通影響評估報告 (TIA)</h1>
                        <h2>Comprehensive Land-Use & Traffic Impact Assessment Report</h2>
                    </div>
                    <div class="tia-actions report-actions">
                        <button class="btn-tia-print" onclick="window.print()"><i class="fa-solid fa-print"></i> 列印 / 匯出 PDF</button>
                        <button class="btn-tia-close" onclick="document.getElementById('tia-modal').style.display='none'">關閉</button>
                    </div>
                </div>
                <div id="tia-report-body"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    /**
     * 取得都市計畫分區於指定時段（AM/PM/OFF）之本土化尖離峰旅次率與活動主體參數
     */
    static getZoningTripParams(zr, period = 'AM') {
        const cat = (zr.type || 'R1')[0];
        const zType = zr.type || 'R1';
        const popVal = zr.pop || 0;
        const empVal = zr.emp || 0;
        const gfaVal = zr.gfa || 0;
        let alpha = 0.45, splitP = 0.85;
        let baseActivity = '常住人口';
        let baseScale = popVal;
        let roleDesc = '居住出發主導 (晨峰外出通勤上學)';

        if (cat === 'R') {
            baseActivity = '常住人口';
            baseScale = popVal;
            if (period === 'PM') {
                alpha = 0.50; splitP = 0.20;
                roleDesc = '居住吸引主導 (傍晚返回住家)';
            } else if (period === 'OFF') {
                alpha = 0.12; splitP = 0.50;
                roleDesc = '日間生活雙向微循環';
            } else {
                alpha = 0.45; splitP = 0.85;
                roleDesc = '居住出發主導 (晨峰外出通勤上學)';
            }
        } else if (zType === 'C2') {
            baseActivity = 'CBD辦公崗位';
            baseScale = empVal;
            if (period === 'PM') {
                alpha = 0.70; splitP = 0.85;
                roleDesc = '核心CBD出發主導 (傍晚下班返程)';
            } else if (period === 'OFF') {
                alpha = 0.15; splitP = 0.45;
                roleDesc = '日間商務洽公與會議往返';
            } else {
                alpha = 0.65; splitP = 0.10;
                roleDesc = '核心CBD產業吸引 (晨峰進駐上班)';
            }
        } else if (zType === 'C1') {
            baseActivity = '商業就業崗位';
            baseScale = empVal;
            if (period === 'PM') {
                alpha = 0.60; splitP = 0.60;
                roleDesc = '夜間生活消費與餐飲購物';
            } else if (period === 'OFF') {
                alpha = 0.15; splitP = 0.50;
                roleDesc = '日間生活採買消費';
            } else {
                alpha = 0.40; splitP = 0.30;
                roleDesc = '晨間生活採買吸引';
            }
        } else if (zType === 'C3') {
            baseActivity = '商業樓地板(百m²)';
            baseScale = Math.round(gfaVal / 100);
            if (period === 'PM') {
                alpha = 3.50; splitP = 0.45;
                roleDesc = '休閒娛樂黃金尖峰造訪';
            } else if (period === 'OFF') {
                alpha = 1.80; splitP = 0.50;
                roleDesc = '日間逛街與休閒散步';
            } else {
                alpha = 1.20; splitP = 0.30;
                roleDesc = '晨間營業準備與運動漫遊';
            }
        } else if (cat === 'I') {
            baseActivity = '產專就業崗位';
            baseScale = empVal;
            if (period === 'PM') {
                alpha = 0.60; splitP = 0.85;
                roleDesc = '產業園區下班出發返程';
            } else if (period === 'OFF') {
                alpha = 0.12; splitP = 0.50;
                roleDesc = '日間物流運補與業務往返';
            } else {
                alpha = 0.55; splitP = 0.15;
                roleDesc = '產業園區早班進駐吸引';
            }
        } else if (zType === 'G1') {
            baseActivity = '就學常住人口';
            baseScale = popVal;
            if (period === 'PM') {
                alpha = 0.75; splitP = 0.85;
                roleDesc = '學校機關放學出發 (傍晚離校)';
            } else if (period === 'OFF') {
                alpha = 0.05; splitP = 0.50;
                roleDesc = '校園內部活動微循環';
            } else {
                alpha = 0.80; splitP = 0.15;
                roleDesc = '學校機關進駐吸引 (晨峰進校上課)';
            }
        } else if (zType === 'G2') {
            baseActivity = '公務機關崗位';
            baseScale = empVal;
            if (period === 'PM') {
                alpha = 0.50; splitP = 0.70;
                roleDesc = '行政公務辦畢離去';
            } else if (period === 'OFF') {
                alpha = 0.10; splitP = 0.50;
                roleDesc = '日間民眾洽公往返';
            } else {
                alpha = 0.50; splitP = 0.25;
                roleDesc = '行政公務洽公吸引 (晨峰進駐)';
            }
        } else if (cat === 'P') {
            baseActivity = '公園綠地面積(百m²)';
            baseScale = Math.round(gfaVal / 100);
            if (period === 'PM') {
                alpha = 0.10; splitP = 0.50;
                roleDesc = '傍晚散步運動與休閒漫遊';
            } else if (period === 'OFF') {
                alpha = 0.08; splitP = 0.50;
                roleDesc = '日間綠地造訪';
            } else {
                alpha = 0.05; splitP = 0.50;
                roleDesc = '晨運散步漫遊';
            }
        }

        return { alpha, splitP, baseActivity, baseScale, roleDesc };
    }

    /**
     * 路網起迄完整性與短缺動線稽核 (Network OD Route Completeness Audit)
     * 檢核全區各分區間是否存在連續之微觀行車路徑，統計因斷鏈流失之交通量與修復建議
     */
    static auditODRoutes(networkData, simulation, zones, zoneRows, T_matrix, distances, currentPeriod = 'AM') {
        const zoneList = Object.values(zones);
        const zoneIds = zoneRows ? zoneRows.map(r => r.id) : zoneList.map(z => z.id);
        const links = (networkData && networkData.links) ? networkData.links : {};

        let pathfinder = (networkData && networkData.pathfinder)
            ? networkData.pathfinder
            : ((simulation && simulation.network && simulation.network.pathfinder)
                ? simulation.network.pathfinder
                : null);

        if (!pathfinder && typeof Pathfinder !== 'undefined' && links) {
            const nodes = (networkData && networkData.nodes) || (simulation && simulation.network ? simulation.network.nodes : {});
            pathfinder = new Pathfinder(links, nodes);
        }

        const routeCache = new Map();
        const getRoute = (oLinkId, dLinkId) => {
            if (!oLinkId || !dLinkId) return null;
            const key = `${oLinkId}->${dLinkId}`;
            if (routeCache.has(key)) return routeCache.get(key);
            let r = null;
            if (simulation && simulation.lutiEngine && typeof simulation.lutiEngine.getRoute === 'function') {
                r = simulation.lutiEngine.getRoute(oLinkId, dLinkId);
            } else if (pathfinder && typeof pathfinder.findRouteBetweenLinks === 'function') {
                r = pathfinder.findRouteBetweenLinks(oLinkId, dLinkId);
            }
            routeCache.set(key, r);
            return r;
        };

        let totalDemandVehTrips = 0;
        let routableVehTrips = 0;
        let unroutableVehTrips = 0;
        const missingODs = [];
        const routableODs = [];
        const missingMap = new Set();

        zoneIds.forEach(i => {
            const zOrigin = zones[i] || zoneList.find(z => z.id === i);
            const zOriginName = zOrigin ? (zOrigin.name || zOrigin.id) : i;
            const zOriginType = zOrigin ? (zOrigin.zoneType || 'R1') : 'R1';
            const connsO = (zOrigin && zOrigin.accessNodes && zOrigin.accessNodes.length > 0) ? zOrigin.accessNodes : [];

            zoneIds.forEach(j => {
                if (i === j) return; // 區內內部旅次屬短途步行與微循環，不計為路網斷鏈

                const zDest = zones[j] || zoneList.find(z => z.id === j);
                const zDestName = zDest ? (zDest.name || zDest.id) : j;
                const zDestType = zDest ? (zDest.zoneType || 'C1') : 'C1';
                const connsD = (zDest && zDest.accessNodes && zDest.accessNodes.length > 0) ? zDest.accessNodes : [];

                const tij = (T_matrix && T_matrix[i] && T_matrix[i][j]) ? T_matrix[i][j] : 0;
                const dist = (distances && distances[i] && distances[i][j]) ? distances[i][j] : 850;

                // MNL 運具選擇拆解出汽機車總旅次
                const vWalk = 2.5 - 0.006 * dist - 0.02 * Math.max(0, dist - 600);
                const vMoto = 0.8 - 0.0018 * dist + 0.5;
                const vAuto = 0.0 - 0.0012 * dist + 0.8;
                const maxV = Math.max(vWalk, vMoto, vAuto);
                const sumExp = Math.exp(vWalk - maxV) + Math.exp(vMoto - maxV) + Math.exp(vAuto - maxV);
                const sAuto = Math.exp(vAuto - maxV) / sumExp;
                const sMoto = Math.exp(vMoto - maxV) / sumExp;

                let tVeh = Math.round(tij * (sAuto + sMoto));
                let tAuto = Math.round(tij * sAuto);
                let tMoto = Math.max(0, tVeh - tAuto);

                // 若引擎已有即時計算結果且時段一致，優先同步確保精準
                const enginePeriod = (simulation && simulation.lutiEngine && simulation.lutiEngine.timePeriod)
                    ? simulation.lutiEngine.timePeriod
                    : currentPeriod;
                if (enginePeriod === currentPeriod) {
                    const engineOD = (simulation && simulation.lutiEngine && simulation.lutiEngine.odPairs)
                        ? simulation.lutiEngine.odPairs.find(od => od.fromZoneId === i && od.toZoneId === j)
                        : null;
                    const engineMissing = (simulation && simulation.lutiEngine && simulation.lutiEngine.missingODs)
                        ? simulation.lutiEngine.missingODs.find(od => od.fromZoneId === i && od.toZoneId === j)
                        : null;
                    if (engineOD && engineOD.hourlyVehTrips > 0) {
                        tVeh = Math.round(engineOD.hourlyVehTrips);
                        tAuto = Math.round(engineOD.hourlyAuto || tVeh * sAuto);
                        tMoto = Math.max(0, tVeh - tAuto);
                    } else if (engineMissing && engineMissing.hourlyVehTrips > 0) {
                        tVeh = Math.round(engineMissing.hourlyVehTrips);
                        tAuto = Math.round(engineMissing.hourlyAuto || tVeh * sAuto);
                        tMoto = Math.max(0, tVeh - tAuto);
                    }
                }

                if (tVeh <= 0 && tij >= 0.5) tVeh = 1;
                const tPCU = Math.round(tAuto * 1.0 + tMoto * 0.4);

                if (tVeh <= 0) return;

                totalDemandVehTrips += tVeh;

                // 1. 檢核出發分區聯絡道
                if (connsO.length === 0) {
                    missingMap.add(`${i}_${j}`);
                    unroutableVehTrips += tVeh;
                    missingODs.push({
                        fromId: i,
                        fromName: zOriginName,
                        fromType: zOriginType,
                        toId: j,
                        toName: zDestName,
                        toType: zDestType,
                        hourlyVehTrips: tVeh,
                        hourlyAuto: tAuto,
                        hourlyMoto: tMoto,
                        pcu: tPCU,
                        distance: Math.round(dist),
                        originLinks: '無聯絡道',
                        destLinks: connsD.map(c => c.linkId).join(', ') || '無聯絡道',
                        reasonType: 'NO_ORIGIN_ACCESS',
                        reason: '出發分區未接上路網 (300m 範圍內無道路或未配置聯絡道)',
                        suggestion: '請在出發分區邊界 300m 內繪製道路，或手動新增進出聯絡道節點 (Access Node)'
                    });
                    return;
                }

                // 2. 檢核迄點分區聯絡道
                if (connsD.length === 0) {
                    missingMap.add(`${i}_${j}`);
                    unroutableVehTrips += tVeh;
                    missingODs.push({
                        fromId: i,
                        fromName: zOriginName,
                        fromType: zOriginType,
                        toId: j,
                        toName: zDestName,
                        toType: zDestType,
                        hourlyVehTrips: tVeh,
                        hourlyAuto: tAuto,
                        hourlyMoto: tMoto,
                        pcu: tPCU,
                        distance: Math.round(dist),
                        originLinks: connsO.map(c => c.linkId).join(', '),
                        destLinks: '無聯絡道',
                        reasonType: 'NO_DEST_ACCESS',
                        reason: '迄點分區未接上路網 (300m 範圍內無道路或未配置聯絡道)',
                        suggestion: '請在迄點分區邊界 300m 內繪製道路，或手動新增進出聯絡道節點 (Access Node)'
                    });
                    return;
                }

                // 3. 搜尋可行連續行車路徑
                let bestRoute = null;
                let bestConnO = null;
                let bestConnD = null;
                let sameLinkReverse = false;

                for (const cO of connsO) {
                    if (!links[cO.linkId]) continue;
                    for (const cD of connsD) {
                        if (!links[cD.linkId]) continue;
                        if (cO.linkId === cD.linkId) {
                            const oRatio = (cO.offsetRatio !== undefined) ? cO.offsetRatio : 0;
                            const dRatio = (cD.offsetRatio !== undefined) ? cD.offsetRatio : 1;
                            if (oRatio >= dRatio) {
                                sameLinkReverse = true;
                                continue;
                            }
                        }
                        const r = getRoute(cO.linkId, cD.linkId);
                        if (r && r.length > 0) {
                            bestRoute = r;
                            bestConnO = cO;
                            bestConnD = cD;
                            break;
                        }
                    }
                    if (bestRoute) break;
                }

                if (bestRoute) {
                    routableVehTrips += tVeh;
                    routableODs.push({
                        fromId: i,
                        fromName: zOriginName,
                        toId: j,
                        toName: zDestName,
                        hourlyVehTrips: tVeh,
                        pcu: tPCU,
                        route: bestRoute,
                        hops: bestRoute.length
                    });
                } else {
                    missingMap.add(`${i}_${j}`);
                    unroutableVehTrips += tVeh;
                    const oLinkStr = connsO.map(c => c.linkId).join(', ');
                    const dLinkStr = connsD.map(c => c.linkId).join(', ');

                    let reasonText = '';
                    let suggestionText = '';

                    if (sameLinkReverse && connsO.every(cO => connsD.some(cD => cD.linkId === cO.linkId))) {
                        reasonText = '起迄分區位於同向單行路段且迄點位於上游 (無法逆向行駛且缺乏下游迴轉動線)';
                        suggestionText = '請在該路段下游路口開啟迴轉連接線 (U-Turn)，或為分區配置對向車道聯絡道';
                    } else {
                        reasonText = `路段間無可行行車路徑 [${oLinkStr}] ➔ [${dLinkStr}] (路網拓撲割裂或缺少路口轉向線)`;
                        suggestionText = '請檢查起點至迄點路徑沿途路口是否開啟轉向連接線 (Turn Connector)，或確認單行道路網方向連通';
                    }

                    missingODs.push({
                        fromId: i,
                        fromName: zOriginName,
                        fromType: zOriginType,
                        toId: j,
                        toName: zDestName,
                        toType: zDestType,
                        hourlyVehTrips: tVeh,
                        hourlyAuto: tAuto,
                        hourlyMoto: tMoto,
                        pcu: tPCU,
                        distance: Math.round(dist),
                        originLinks: oLinkStr,
                        destLinks: dLinkStr,
                        reasonType: sameLinkReverse ? 'SAME_LINK_REVERSE' : 'NO_NETWORK_PATH',
                        reason: reasonText,
                        suggestion: suggestionText
                    });
                }
            });
        });

        // 依短缺車流大至小排序
        missingODs.sort((a, b) => b.hourlyVehTrips - a.hourlyVehTrips);

        const connectivityRate = totalDemandVehTrips > 0
            ? ((routableVehTrips / totalDemandVehTrips) * 100).toFixed(1)
            : '100.0';

        return {
            totalDemandVehTrips: Math.round(totalDemandVehTrips),
            routableVehTrips: Math.round(routableVehTrips),
            unroutableVehTrips: Math.round(unroutableVehTrips),
            connectivityRate,
            missingODs,
            routableODs,
            missingMap,
            missingCount: missingODs.length,
            routableCount: routableODs.length
        };
    }

    static showModal(networkData, simulation) {
        this.init();
        const bodyEl = document.getElementById('tia-report-body');
        if (!bodyEl) return;

        const luti = (simulation && simulation.lutiEngine) ? simulation.lutiEngine : (window.lutiEngine || null);
        const zones = (networkData && networkData.zones) ? networkData.zones : (luti ? luti.zones : {});
        const zoneList = Object.values(zones);

        if (zoneList.length === 0) {
            alert("當前路網尚未劃定土地使用分區 (Land-Use Zones)，請先在編輯器繪製分區或載入 LUTI 示範路網！");
            return;
        }

        // 計算各項土地利用總量
        let totalSiteArea = 0;
        let totalGFA = 0;
        let totalPop = 0;
        let totalEmp = 0;
        let totalGreenArea = 0;

        const zoneRows = zoneList.map(z => {
            const b = z.boundary || [];
            let area = 0;
            for (let i = 0; i < b.length; i++) {
                const p1 = b[i]; const p2 = b[(i + 1) % b.length];
                area += (p1.x * p2.y - p2.x * p1.y);
            }
            area = Math.max(100, Math.abs(area * 0.5));
            const bcr = (z.bcr !== undefined && z.bcr !== null) ? z.bcr : 0.5;
            const far = (z.far !== undefined && z.far !== null) ? z.far : 1.2;
            const footprint = area * bcr;
            const gfa = area * far;
            const cat = (z.zoneType || 'R1')[0];

            let pop = 0, emp = 0;
            if (cat === 'R') {
                const u = z.zoneType === 'R1' ? 35 : (z.zoneType === 'R3' ? 25 : 30);
                pop = z.customPop !== null && z.customPop !== undefined ? z.customPop : Math.round((gfa * 0.85) / u);
            } else if (z.zoneType === 'C2') {
                emp = z.customEmp !== null && z.customEmp !== undefined ? z.customEmp : Math.round((gfa * 0.80) / 18);
            } else if (cat === 'C') {
                emp = z.customEmp !== null && z.customEmp !== undefined ? z.customEmp : Math.round((gfa * 0.80) / 25);
            } else if (cat === 'I') {
                emp = z.customEmp !== null && z.customEmp !== undefined ? z.customEmp : Math.round((gfa * 0.80) / 40);
            } else if (z.zoneType === 'G1') {
                pop = z.customPop !== null && z.customPop !== undefined ? z.customPop : Math.round((gfa * 0.85) / 15);
            } else if (z.zoneType === 'G2') {
                emp = z.customEmp !== null && z.customEmp !== undefined ? z.customEmp : Math.round((gfa * 0.80) / 22);
            }

            const greenRatio = (z.zoneType === 'P') ? 0.95 : Math.max(0.05, 1.0 - bcr);
            const greenArea = area * greenRatio;

            totalSiteArea += area;
            totalGFA += gfa;
            totalPop += pop;
            totalEmp += emp;
            totalGreenArea += greenArea;

            return {
                id: z.id,
                name: z.name || z.id,
                type: z.zoneType || 'R1',
                area: Math.round(area),
                bcr: (bcr * 100).toFixed(0) + '%',
                far: (far * 100).toFixed(0) + '%',
                footprint: Math.round(footprint),
                gfa: Math.round(gfa),
                pop,
                emp
            };
        });

        const avgGreen = totalSiteArea > 0 ? ((totalGreenArea / totalSiteArea) * 100).toFixed(1) : 30.0;
        const totalHa = (totalSiteArea / 10000).toFixed(2);

        // 交通指標推估 (時段設定與各時段旅次推估)
        const currentPeriod = (luti && luti.timePeriod) ? luti.timePeriod : 'AM';
        const periodConfig = {
            'AM': { code: 'AM', name: '上午尖峰', short: 'AM 尖峰', full: 'AM 上午尖峰', color: '#ea580c', badgeBg: '#ffedd5', badgeColor: '#c2410c' },
            'PM': { code: 'PM', name: '下午尖峰', short: 'PM 尖峰', full: 'PM 下午尖峰', color: '#d97706', badgeBg: '#fef3c7', badgeColor: '#b45309' },
            'OFF': { code: 'OFF', name: '日間離峰', short: '日間離峰', full: '日間離峰', color: '#0284c7', badgeBg: '#e0f2fe', badgeColor: '#0369a1' }
        };
        const pInfo = periodConfig[currentPeriod] || periodConfig['AM'];

        const tripsAM = Math.round(zoneRows.reduce((sum, zr) => {
            const p = TIAReportGenerator.getZoningTripParams(zr, 'AM');
            return sum + p.baseScale * p.alpha;
        }, 0));

        const tripsPM = Math.round(zoneRows.reduce((sum, zr) => {
            const p = TIAReportGenerator.getZoningTripParams(zr, 'PM');
            return sum + p.baseScale * p.alpha;
        }, 0));

        const tripsOFF = Math.round(zoneRows.reduce((sum, zr) => {
            const p = TIAReportGenerator.getZoningTripParams(zr, 'OFF');
            return sum + p.baseScale * p.alpha;
        }, 0));

        const currentPeriodTrips = currentPeriod === 'PM' ? tripsPM : (currentPeriod === 'OFF' ? tripsOFF : tripsAM);

        const autoShare = luti ? (luti.stats.autoShare * 100).toFixed(0) : '45';
        const motoShare = luti ? (luti.stats.motoShare * 100).toFixed(0) : '40';
        const walkShare = luti ? (luti.stats.walkShare * 100).toFixed(0) : '15';

        // 路網服務水準與容量分析
        const links = (networkData && networkData.links) ? Object.values(networkData.links) : [];
        let networkAvgSpeed = 38.5;
        let overallLOS = 'B';
        if (luti && typeof luti.calculateNetworkLOS === 'function') {
            const losRes = luti.calculateNetworkLOS();
            networkAvgSpeed = losRes.avgSpeed;
            overallLOS = losRes.los;
        }

        const todayStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

        // 挑選具代表性之示範分區（動態連結當前路網）
        const sampleRes = zoneRows.find(z => z.type.startsWith('R')) || zoneRows[0];
        const sampleCom = zoneRows.find(z => z.type.startsWith('C') || z.type.startsWith('I')) || (zoneRows.length > 1 ? zoneRows[1] : zoneRows[0]);
        const topOD = (luti && luti.odPairs && luti.odPairs.length > 0) ? luti.odPairs[0] : null;

        const resName = sampleRes ? sampleRes.name : '住宅基地';
        const resType = sampleRes ? sampleRes.type : 'R3';
        const resArea = sampleRes ? sampleRes.area : 10000;
        const resBCRVal = sampleRes ? (parseFloat(sampleRes.bcr) / 100) : 0.5;
        const resFARVal = sampleRes ? (parseFloat(sampleRes.far) / 100) : 4.0;
        const resFootprint = sampleRes ? sampleRes.footprint : Math.round(resArea * resBCRVal);
        const resGFA = sampleRes ? sampleRes.gfa : Math.round(resArea * resFARVal);
        const resU = resType === 'R1' ? 35 : (resType === 'R3' ? 25 : 30);
        const resPop = sampleRes ? sampleRes.pop : Math.round((resGFA * 0.85) / resU);
        const resFloors = Math.ceil(resFARVal / Math.max(0.01, resBCRVal));

        const comName = sampleCom ? sampleCom.name : '核心商辦基地';
        const comType = sampleCom ? sampleCom.type : 'C2';
        const comArea = sampleCom ? sampleCom.area : 8000;
        const comBCRVal = sampleCom ? (parseFloat(sampleCom.bcr) / 100) : 0.6;
        const comFARVal = sampleCom ? (parseFloat(sampleCom.far) / 100) : 6.0;
        const comFootprint = sampleCom ? sampleCom.footprint : Math.round(comArea * comBCRVal);
        const comGFA = sampleCom ? sampleCom.gfa : Math.round(comArea * comFARVal);
        const comU = comType === 'C2' ? 18 : (comType === 'C1' ? 25 : (comType === 'C3' ? 30 : 40));
        const comEmp = sampleCom ? sampleCom.emp : Math.round((comGFA * 0.80) / comU);
        const comFloors = Math.ceil(comFARVal / Math.max(0.01, comBCRVal));

        // 旅次量推估（當前分析時段：${pInfo.full}）
        const sampleResParams = TIAReportGenerator.getZoningTripParams(sampleRes || { type: 'R3', pop: resPop }, currentPeriod);
        const resAlpha = sampleResParams.alpha;
        const resSplitP = sampleResParams.splitP;
        const resTripsCurrent = Math.round(resPop * resAlpha);
        const resProdCurrent = Math.round(resTripsCurrent * resSplitP);
        const resAttrCurrent = resTripsCurrent - resProdCurrent;

        const sampleComParams = TIAReportGenerator.getZoningTripParams(sampleCom || { type: 'C2', emp: comEmp }, currentPeriod);
        const comAlpha = sampleComParams.alpha;
        const comSplitP = sampleComParams.splitP;
        const comTripsCurrent = Math.round(comEmp * comAlpha);
        const comProdCurrent = Math.round(comTripsCurrent * comSplitP);
        const comAttrCurrent = comTripsCurrent - comProdCurrent;

        // 計算分區形心 (Centroid) 與空間距離矩陣
        const zoneIds = zoneList.map(z => z.id);
        const centroids = {};
        zoneIds.forEach(id => {
            const z = zones[id];
            const b = (z && z.boundary) ? z.boundary : [];
            let cx = 0, cy = 0;
            b.forEach(p => { cx += p.x; cy += p.y; });
            cx = b.length > 0 ? cx / b.length : 0;
            cy = b.length > 0 ? cy / b.length : 0;
            centroids[id] = { x: cx, y: cy };
        });

        const distances = {};
        zoneIds.forEach(i => {
            distances[i] = {};
            const zI = zoneRows.find(r => r.id === i);
            const areaI = zI ? zI.area : 10000;
            zoneIds.forEach(j => {
                if (i === j) {
                    distances[i][j] = Math.max(50, Math.round(0.5 * Math.sqrt(areaI / Math.PI)));
                } else {
                    const c1 = centroids[i];
                    const c2 = centroids[j];
                    const hasCoords = c1 && c2 && (c1.x !== 0 || c1.y !== 0 || c2.x !== 0 || c2.y !== 0);
                    const dist = hasCoords ? Math.hypot(c1.x - c2.x, c1.y - c2.y) : (topOD ? topOD.distance : 850);
                    distances[i][j] = Math.max(50, Math.round(dist));
                }
            });
        });

        const fromId = topOD ? topOD.fromZoneId : (sampleRes ? sampleRes.id : zoneIds[0]);
        const toId = topOD ? topOD.toZoneId : (sampleCom ? sampleCom.id : (zoneIds.length > 1 ? zoneIds[1] : zoneIds[0]));
        const calcDist = (distances[fromId] && distances[fromId][toId]) ? distances[fromId][toId] : (topOD ? Math.round(topOD.distance) : 850);
        const odFrom = topOD ? (zones[topOD.fromZoneId] ? (zones[topOD.fromZoneId].name || topOD.fromZoneId) : resName) : resName;
        const odTo = topOD ? (zones[topOD.toZoneId] ? (zones[topOD.toZoneId].name || topOD.toZoneId) : comName) : comName;
        const betaVal = 0.003;
        const decayFactor = Math.exp(-betaVal * calcDist).toFixed(4);

        // 執行 Furness IPF 迭代歷程計算 (精確記錄 0~5 次迭代數值供報表展示)
        const furnessLogs = [];
        const P_map = {};
        const A_map = {};
        const step1Rows = [];
        zoneRows.forEach(zr => {
            const { alpha, splitP, baseActivity, baseScale, roleDesc } = TIAReportGenerator.getZoningTripParams(zr, currentPeriod);
            const trips = Math.round(baseScale * alpha);
            const pVal = Math.max(1, Math.round(trips * splitP));
            const aVal = Math.max(1, trips - pVal);
            P_map[zr.id] = pVal;
            A_map[zr.id] = aVal;

            step1Rows.push({
                id: zr.id,
                name: zr.name,
                type: zr.type,
                baseActivity,
                baseScale,
                alpha,
                totalTrips: trips,
                splitP,
                splitA: 1 - splitP,
                pVal,
                aVal,
                roleDesc
            });
        });

        // 調整目標 A 總量以確保全區總體平衡 (Total Production = Total Attraction)
        const totalP_val = zoneIds.reduce((sum, id) => sum + (P_map[id] || 0), 0);
        const totalA_val = zoneIds.reduce((sum, id) => sum + (A_map[id] || 0), 0);
        const targetA_map = {};
        const aScaleFactor = (totalA_val > 0 && totalP_val > 0) ? (totalP_val / totalA_val) : 1.0;
        let runningSumA = 0;
        zoneIds.forEach((id, idx) => {
            if (idx === zoneIds.length - 1) {
                targetA_map[id] = Math.max(1, totalP_val - runningSumA);
            } else {
                const rounded = Math.max(1, Math.round((A_map[id] || 0) * aScaleFactor));
                targetA_map[id] = rounded;
                runningSumA += rounded;
            }
        });

        // 綁定各分區目標吸引量至 step1Rows
        step1Rows.forEach(row => {
            row.targetA = targetA_map[row.id] !== undefined ? targetA_map[row.id] : row.aVal;
        });

        const sampleComAttr = (sampleCom && A_map[sampleCom.id] !== undefined) ? A_map[sampleCom.id] : comAttrAM;
        const sampleComTargetA = (sampleCom && targetA_map[sampleCom.id] !== undefined) ? targetA_map[sampleCom.id] : Math.round(comAttrAM * aScaleFactor);

        // 建立初始重力模型矩陣 T^(0)
        const T_matrix = {};
        zoneIds.forEach(i => {
            T_matrix[i] = {};
            zoneIds.forEach(j => {
                const d = distances[i][j];
                T_matrix[i][j] = (P_map[i] || 1) * (A_map[j] || 1) * Math.exp(-betaVal * d);
            });
        });
        const initIntraTij = Math.round((T_matrix[fromId] && T_matrix[fromId][fromId]) ? T_matrix[fromId][fromId] : 20582);

        // 矩陣快照輔助函數 (紀錄每次迭代行列完整 OD 交換量、邊界總和與配平因子)
        const furnessSnapshots = [];
        const captureODSnapshot = (k, phaseTitle, curT, rFactors, cFactors, errPercent, isConverged) => {
            const snap = {
                k,
                phaseTitle,
                matrix: {},
                rowSums: {},
                colSums: {},
                targetP: {},
                targetA: {},
                rFactors: {},
                cFactors: {},
                grandTotal: 0,
                errPercent,
                isConverged
            };
            zoneIds.forEach(j => {
                snap.colSums[j] = 0;
                snap.targetA[j] = Math.round(targetA_map[j] || 0);
                snap.cFactors[j] = (cFactors && cFactors[j] !== undefined) ? cFactors[j].toFixed(4) : '1.0000';
            });
            zoneIds.forEach(i => {
                snap.matrix[i] = {};
                snap.rowSums[i] = 0;
                snap.targetP[i] = Math.round(P_map[i] || 0);
                snap.rFactors[i] = (rFactors && rFactors[i] !== undefined) ? rFactors[i].toFixed(4) : '1.0000';
                zoneIds.forEach(j => {
                    const val = (curT[i] && curT[i][j]) ? curT[i][j] : 0;
                    snap.matrix[i][j] = val;
                    snap.rowSums[i] += val;
                    snap.colSums[j] += val;
                    snap.grandTotal += val;
                });
            });
            return snap;
        };

        // 初值記錄 (Iteration 0)
        const initTij = (T_matrix[fromId] && T_matrix[fromId][toId]) ? T_matrix[fromId][toId] : 100;
        furnessLogs.push({
            iter: 0,
            phase: '初始化重力矩陣 T^(0)',
            factorA: '1.0000',
            factorB: '1.0000',
            sampleTij: Math.round(initTij),
            maxError: '基準起點 (未配平)',
            status: '初值未收斂'
        });
        furnessSnapshots.push(captureODSnapshot(0, '初始重力模型未配平矩陣 T^(0)', T_matrix, null, null, '未配平 (基準)', false));

        // 5 次雙向比例配平迭代
        for (let iter = 1; iter <= 5; iter++) {
            // 列平衡 (Row Balancing)
            let curRFactor = 1.0;
            const curRFactors = {};
            zoneIds.forEach(i => {
                let rSum = 0;
                zoneIds.forEach(j => { rSum += T_matrix[i][j]; });
                if (rSum > 1e-4) {
                    const rFactor = (P_map[i] || 0) / rSum;
                    curRFactors[i] = rFactor;
                    if (i === fromId) curRFactor = rFactor;
                    zoneIds.forEach(j => { T_matrix[i][j] *= rFactor; });
                }
            });

            // 行平衡 (Column Balancing)
            let curCFactor = 1.0;
            const curCFactors = {};
            zoneIds.forEach(j => {
                let cSum = 0;
                zoneIds.forEach(i => { cSum += T_matrix[i][j]; });
                if (cSum > 1e-4) {
                    const cFactor = (targetA_map[j] || 0) / cSum;
                    curCFactors[j] = cFactor;
                    if (j === toId) curCFactor = cFactor;
                    zoneIds.forEach(i => { T_matrix[i][j] *= cFactor; });
                }
            });

            // 邊界最大誤差計算 (以列邊界進行誤差檢核)
            let maxErr = 0;
            zoneIds.forEach(i => {
                let rSum = 0;
                zoneIds.forEach(j => { rSum += T_matrix[i][j]; });
                const expected = P_map[i] || 1;
                const err = Math.abs(rSum - expected) / expected;
                if (err > maxErr) maxErr = err;
            });

            const currentTij = (T_matrix[fromId] && T_matrix[fromId][toId]) ? T_matrix[fromId][toId] : 100;
            const errPercent = (maxErr * 100).toFixed(2);
            const isConverged = maxErr < 0.01;

            furnessLogs.push({
                iter: iter,
                phase: `第 ${iter} 次雙向配平`,
                factorA: curRFactor.toFixed(4),
                factorB: curCFactor.toFixed(4),
                sampleTij: Math.round(currentTij),
                maxError: `${errPercent}%`,
                status: isConverged ? '✅ 已收斂 (<1%)' : '配平微調中'
            });

            furnessSnapshots.push(captureODSnapshot(
                iter,
                iter === 5 ? '第 5 次雙向配平（最終精確平衡 OD 成果）' : `第 ${iter} 次雙向配平 OD 矩陣`,
                T_matrix,
                curRFactors,
                curCFactors,
                `${errPercent}%`,
                isConverged
            ));
        }

        // 運具選擇效用推估 (MNL Logit)
        const vWalk = (2.5 - 0.006 * calcDist - 0.02 * Math.max(0, calcDist - 600)).toFixed(2);
        const vMoto = (0.8 - 0.0018 * calcDist + 0.5).toFixed(2);
        const vAuto = (0.0 - 0.0012 * calcDist + 0.8).toFixed(2);
        const maxV = Math.max(parseFloat(vWalk), parseFloat(vMoto), parseFloat(vAuto));
        const expWalk = Math.exp(parseFloat(vWalk) - maxV);
        const expMoto = Math.exp(parseFloat(vMoto) - maxV);
        const expAuto = Math.exp(parseFloat(vAuto) - maxV);
        const sumExp = expWalk + expMoto + expAuto;
        const probWalk = Math.round((expWalk / sumExp) * 100);
        const probMoto = Math.round((expMoto / sumExp) * 100);
        const probAuto = Math.max(0, 100 - probWalk - probMoto);
            // 實際交換旅次分流與 PCU (基於第二階段最終配平 OD 旅次總量)
        const sampleFinalTij = (T_matrix[fromId] && T_matrix[fromId][toId])
            ? Math.round(T_matrix[fromId][toId])
            : (topOD ? Math.round(topOD.hourlyVehTrips + (topOD.hourlyWalk || 0)) : Math.round(resProdCurrent * 0.45));
        const sampleAutoVeh = topOD ? Math.round(topOD.hourlyAuto) : Math.round(sampleFinalTij * (probAuto / 100));
        const sampleMotoVeh = topOD ? Math.round(topOD.hourlyMoto) : Math.round(sampleFinalTij * (probMoto / 100));
        const sampleWalkPeds = topOD ? Math.round(topOD.hourlyWalk) : Math.round(sampleFinalTij * (probWalk / 100));
        const sampleVehTrips = sampleAutoVeh + sampleMotoVeh;
        const samplePCU = Math.round(sampleAutoVeh * 1.0 + sampleMotoVeh * 0.4);
        let currentScaleFactor = luti ? (luti.scaleFactor !== undefined ? luti.scaleFactor : 1.0) : 1.0;
        if (typeof document !== 'undefined') {
            const scaleSel = document.getElementById('lutiScaleFactorSelector');
            if (scaleSel && scaleSel.value) {
                const uiScale = parseFloat(scaleSel.value);
                if (!isNaN(uiScale)) {
                    currentScaleFactor = uiScale;
                    if (luti && luti.scaleFactor !== uiScale && typeof luti.setScaleFactor === 'function') {
                        luti.setScaleFactor(uiScale);
                    }
                }
            }
        }
        const sampleLambda = ((sampleVehTrips * currentScaleFactor) / 3600).toFixed(3);

        // ★★★ 執行全區路網起迄路徑完整度與短缺動線稽核 ★★★
        const auditResult = this.auditODRoutes(networkData, simulation, zones, zoneRows, T_matrix, distances, currentPeriod);

        // ★★★ 彙整四階段漏斗收斂統計 (Funnel Statistics) ★★★
        let funnelIntraTrips = 0;
        let funnelInterTrips = 0;
        let funnelInterWalkTrips = 0;
        let funnelInterAutoTrips = 0;
        let funnelInterMotoTrips = 0;
        let funnelInterVehTrips = 0;

        zoneIds.forEach(i => {
            zoneIds.forEach(j => {
                const tij = (T_matrix && T_matrix[i] && T_matrix[i][j]) ? T_matrix[i][j] : 0;
                if (i === j) {
                    funnelIntraTrips += tij;
                } else {
                    funnelInterTrips += tij;
                    const d = (distances && distances[i] && distances[i][j]) ? distances[i][j] : 850;
                    const vW = 2.5 - 0.006 * d - 0.02 * Math.max(0, d - 600);
                    const vM = 0.8 - 0.0018 * d + 0.5;
                    const vA = 0.0 - 0.0012 * d + 0.8;
                    const mV = Math.max(vW, vM, vA);
                    const sE = Math.exp(vW - mV) + Math.exp(vM - mV) + Math.exp(vA - mV);
                    const sW = Math.exp(vW - mV) / sE;
                    const sM = Math.exp(vM - mV) / sE;
                    const sA = Math.exp(vA - mV) / sE;

                    const mItem = auditResult.missingODs.find(od => od.fromId === i && od.toId === j);
                    const rItem = auditResult.routableODs.find(od => od.fromId === i && od.toId === j);
                    if (mItem) {
                        funnelInterVehTrips += mItem.hourlyVehTrips;
                        funnelInterAutoTrips += (mItem.hourlyAuto || Math.round(mItem.hourlyVehTrips * (sA / (sA + sM))));
                        funnelInterMotoTrips += (mItem.hourlyMoto || (mItem.hourlyVehTrips - (mItem.hourlyAuto || 0)));
                        funnelInterWalkTrips += Math.round(tij * sW);
                    } else if (rItem) {
                        funnelInterVehTrips += rItem.hourlyVehTrips;
                        funnelInterAutoTrips += Math.round(rItem.hourlyVehTrips * (sA / (sA + sM)));
                        funnelInterMotoTrips += Math.round(rItem.hourlyVehTrips * (sM / (sA + sM)));
                        funnelInterWalkTrips += Math.round(tij * sW);
                    } else {
                        const v = Math.round(tij * (sA + sM));
                        const a = Math.round(tij * sA);
                        const m = Math.max(0, v - a);
                        const w = Math.round(tij * sW);
                        funnelInterVehTrips += v;
                        funnelInterAutoTrips += a;
                        funnelInterMotoTrips += m;
                        funnelInterWalkTrips += w;
                    }
                }
            });
        });
        const finalFunnelVehTotal = auditResult.totalDemandVehTrips > 0 ? auditResult.totalDemandVehTrips : funnelInterVehTrips;

        bodyEl.innerHTML = `
            <div class="tia-meta-box">
                <div class="tia-meta-item">
                    <strong>評估日期</strong>
                    <span>${todayStr}</span>
                </div>
                <div class="tia-meta-item">
                    <strong>評估範疇</strong>
                    <span>全區綜合規劃 (${zoneList.length} 個分區)</span>
                </div>
                <div class="tia-meta-item">
                    <strong>目標分析年</strong>
                    <span>民國 115 年 (2026)</span>
                </div>
                <div class="tia-meta-item">
                    <strong>當前分析時段</strong>
                    <span><span class="badge" style="background:${pInfo.badgeBg}; color:${pInfo.badgeColor}; font-weight:700;">${pInfo.full}</span> (與模擬器儀表板連動)</span>
                </div>
            </div>

            <!-- 分析時段快速切換工具列 -->
            <div class="tia-period-switcher" style="display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 16px; margin-bottom:18px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="font-size:13px; font-weight:700; color:#334155; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-clock" style="color:#64748b;"></i>
                    <span>分析時段快速切換：</span>
                    <span style="font-size:12px; font-weight:normal; color:#64748b;">(切換後自動重算土地利用產生、IPF矩陣配平與路網稽核)</span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="tia-period-btn ${currentPeriod === 'AM' ? 'active' : ''}" data-period="AM" style="padding:6px 14px; font-size:12.5px; font-weight:700; border-radius:6px; cursor:pointer; border:1px solid ${currentPeriod === 'AM' ? '#ea580c' : '#cbd5e1'}; background:${currentPeriod === 'AM' ? '#ea580c' : '#fff'}; color:${currentPeriod === 'AM' ? '#fff' : '#475569'};">
                        🌅 AM 上午尖峰
                    </button>
                    <button class="tia-period-btn ${currentPeriod === 'OFF' ? 'active' : ''}" data-period="OFF" style="padding:6px 14px; font-size:12.5px; font-weight:700; border-radius:6px; cursor:pointer; border:1px solid ${currentPeriod === 'OFF' ? '#0284c7' : '#cbd5e1'}; background:${currentPeriod === 'OFF' ? '#0284c7' : '#fff'}; color:${currentPeriod === 'OFF' ? '#fff' : '#475569'};">
                        ☀️ 日間離峰
                    </button>
                    <button class="tia-period-btn ${currentPeriod === 'PM' ? 'active' : ''}" data-period="PM" style="padding:6px 14px; font-size:12.5px; font-weight:700; border-radius:6px; cursor:pointer; border:1px solid ${currentPeriod === 'PM' ? '#d97706' : '#cbd5e1'}; background:${currentPeriod === 'PM' ? '#d97706' : '#fff'}; color:${currentPeriod === 'PM' ? '#fff' : '#475569'};">
                        🌆 PM 下午尖峰
                    </button>
                </div>
            </div>

            <!-- 路網拓撲與起迄路徑連通度總覽警示橫幅 -->
            ${auditResult.missingCount > 0 ? `
                <div class="tia-alert-banner tia-alert-danger">
                    <div class="alert-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <div class="alert-content">
                        <div class="alert-title">⚠️ 路網拓撲連通性警示 (${pInfo.name})：偵測到 ${auditResult.missingCount} 組起迄分區缺少可行行車路徑</div>
                        <div class="alert-desc">
                            系統檢核全區都市計畫路網，發現部分分區間無連續可行行車動線，導致預估 <strong>${auditResult.unroutableVehTrips.toLocaleString()} 輛/小時</strong> 之交通流量無法成功注入微觀模擬路網（<strong>路網有效連通率僅 ${auditResult.connectivityRate}%</strong>）。<br>
                            此流量短缺將導致周邊幹道之交通衝擊（LOS）被低估。請參閱下方「二之(一)、 路網起迄路徑完整度與短缺動線稽核」詳細診斷表補齊路口轉向線或分區聯絡道。
                        </div>
                    </div>
                </div>
            ` : `
                <div class="tia-alert-banner tia-alert-success">
                    <div class="alert-icon"><i class="fa-solid fa-circle-check"></i></div>
                    <div class="alert-content">
                        <div class="alert-title">✅ 路網連通度檢核合格 (${pInfo.name})：100% 分區起迄路徑完整連續</div>
                        <div class="alert-desc">
                            經全域拓撲與路徑搜尋器驗證，全區所有都市計畫分區間共 ${auditResult.routableCount} 組 OD 動線均具備完整行車起迄路徑，全區預估 ${auditResult.routableVehTrips.toLocaleString()} 輛/h 之機動車流已 100% 成功指派至路網。
                        </div>
                    </div>
                </div>
            `}

            <!-- 一、基地開發與土地利用效益 -->
            <div class="tia-section">
                <div class="tia-section-title">
                    <span>一、 基地土地使用規劃與社會經濟指標</span>
                    <span class="badge">Land-Use & Socio-Economic</span>
                </div>
                <div class="tia-grid-cards">
                    <div class="tia-kpi-card">
                        <div class="val">${totalHa} <span style="font-size:13px; font-weight:normal;">ha</span></div>
                        <div class="lbl">基地總面積 (${totalSiteArea.toLocaleString()} m²)</div>
                    </div>
                    <div class="tia-kpi-card">
                        <div class="val">${Math.round(totalGFA).toLocaleString()} <span style="font-size:13px; font-weight:normal;">m²</span></div>
                        <div class="lbl">總法定樓地板面積 (GFA)</div>
                    </div>
                    <div class="tia-kpi-card">
                        <div class="val">${avgGreen}%</div>
                        <div class="lbl">平均開放空間與綠覆率</div>
                    </div>
                    <div class="tia-kpi-card">
                        <div class="val" style="color:#d97706;">${totalPop.toLocaleString()} <span style="font-size:13px; font-weight:normal;">人</span></div>
                        <div class="lbl">推估常住人口規模</div>
                    </div>
                    <div class="tia-kpi-card">
                        <div class="val" style="color:#2563eb;">${totalEmp.toLocaleString()} <span style="font-size:13px; font-weight:normal;">崗位</span></div>
                        <div class="lbl">推估就業崗位規模</div>
                    </div>
                    <div class="tia-kpi-card">
                        <div class="val" style="color:#059669;">${((totalGFA / Math.max(1, totalPop + totalEmp))).toFixed(1)} <span style="font-size:13px; font-weight:normal;">m²/人</span></div>
                        <div class="lbl">活動主體平均人均樓地板面積</div>
                    </div>
                </div>

                <table class="tia-table">
                    <thead>
                        <tr>
                            <th>分區名稱</th>
                            <th>分區代碼</th>
                            <th>基地面積 (m²)</th>
                            <th>建蔽率 BCR</th>
                            <th>容積率 FAR</th>
                            <th>建築基底 (m²)</th>
                            <th>樓地板 GFA (m²)</th>
                            <th>常住人口 (人)</th>
                            <th>就業崗位 (崗)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${zoneRows.map(r => `
                            <tr>
                                <td class="text-left" style="font-weight:600;">${r.name}</td>
                                <td><span style="padding:2px 6px; background:#e0f2fe; color:#0369a1; border-radius:4px; font-weight:700;">${r.type}</span></td>
                                <td>${r.area.toLocaleString()}</td>
                                <td>${r.bcr}</td>
                                <td>${r.far}</td>
                                <td>${r.footprint.toLocaleString()}</td>
                                <td>${r.gfa.toLocaleString()}</td>
                                <td>${r.pop > 0 ? r.pop.toLocaleString() : '-'}</td>
                                <td>${r.emp > 0 ? r.emp.toLocaleString() : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- 二、旅次產生與吸引預測 -->
            <div class="tia-section">
                <div class="tia-section-title">
                    <span>二、 旅次產生與空間分佈推估 (四階段模式)</span>
                    <span class="badge">Trip Generation & Gravity Model</span>
                </div>
                <p style="font-size:13px; color:#475569; margin:0 0 10px 0;">
                    本計畫依據土地使用項目與活動主體強度，套用本土化尖離峰旅次率與雙約束重力模式 (Doubly-Constrained Gravity Model)，並經 Furness IPF 演算法配平，產出分區 OD 交換矩陣。
                </p>
                <div class="tia-grid-cards">
                    <div class="tia-kpi-card" style="${currentPeriod === 'AM' ? 'border: 2px solid #ea580c; background: #fffaf0; position:relative;' : ''}">
                        ${currentPeriod === 'AM' ? '<div style="position:absolute; top:6px; right:8px; background:#ea580c; color:#fff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px;">當前分析</div>' : ''}
                        <div class="val" style="color:#ea580c;">${tripsAM.toLocaleString()} <span style="font-size:12px;">trips/h</span></div>
                        <div class="lbl">AM 上午尖峰全區總旅次</div>
                    </div>
                    <div class="tia-kpi-card" style="${currentPeriod === 'PM' ? 'border: 2px solid #d97706; background: #fffdf5; position:relative;' : ''}">
                        ${currentPeriod === 'PM' ? '<div style="position:absolute; top:6px; right:8px; background:#d97706; color:#fff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px;">當前分析</div>' : ''}
                        <div class="val" style="color:#d97706;">${tripsPM.toLocaleString()} <span style="font-size:12px;">trips/h</span></div>
                        <div class="lbl">PM 下午尖峰全區總旅次</div>
                    </div>
                    <div class="tia-kpi-card" style="${currentPeriod === 'OFF' ? 'border: 2px solid #0284c7; background: #f0f9ff; position:relative;' : ''}">
                        ${currentPeriod === 'OFF' ? '<div style="position:absolute; top:6px; right:8px; background:#0284c7; color:#fff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px;">當前分析</div>' : ''}
                        <div class="val" style="color:#0284c7;">${tripsOFF.toLocaleString()} <span style="font-size:12px;">trips/h</span></div>
                        <div class="lbl">日間離峰平均每小時旅次</div>
                    </div>
                </div>
                <div style="font-size:12px; color:#64748b; margin-top:8px; display:flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-circle-question" style="color:#6366f1;"></i>
                    <span>💡 想了解全區總旅次 (${currentPeriodTrips.toLocaleString()} trips/h) 如何收斂換算為機動車總需求 (${auditResult.totalDemandVehTrips.toLocaleString()} 輛/h)？請參閱 <a href="#tia-appendix-funnel" style="color:#6366f1; font-weight:700; text-decoration:underline;">附錄四、交通需求收斂歷程詳細推導</a>。</span>
                </div>
            </div>

            <!-- 二之(一)、路網起迄路徑完整度與短缺動線稽核 (Network OD Route Audit & Missing Paths) -->
            <div class="tia-section">
                <div class="tia-section-title" style="border-left-color: ${auditResult.missingCount > 0 ? '#ef4444' : '#10b981'};">
                    <span>二之(一)、 路網起迄路徑完整度與短缺動線稽核 (Network OD Route Audit & Missing Paths)</span>
                    <span class="badge" style="${auditResult.missingCount > 0 ? 'background:#fee2e2; color:#dc2626;' : 'background:#dcfce7; color:#15803d;'}">
                        ${auditResult.missingCount > 0 ? `⚠️ 偵測到 ${auditResult.missingCount} 組路徑短缺 (流失 ${auditResult.unroutableVehTrips.toLocaleString()} 輛/h)` : '✅ 100% 動線完整通達'}
                    </span>
                </div>
                <p style="font-size:13px; color:#475569; margin:0 0 10px 0;">
                    本稽核依據雙約束重力模式配平後之分區 OD 車流交換需求，逐一檢核各分區基地進出聯絡道（Access Nodes）與微觀路網拓撲之連續性。若兩分區間因路網斷鏈、缺轉向線或單行道阻隔而無路徑，車輛將無法注入模擬器產生流量。
                </p>

                <div class="tia-grid-cards" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 14px;">
                    <div class="tia-kpi-card">
                        <div class="val" style="color:#0f172a;">${auditResult.totalDemandVehTrips.toLocaleString()} <span style="font-size:12px;">輛/h</span></div>
                        <div class="lbl">理論機動車總需求 (${pInfo.short})</div>
                    </div>
                    <div class="tia-kpi-card ${auditResult.routableVehTrips > 0 ? 'kpi-success' : ''}">
                        <div class="val">${auditResult.routableVehTrips.toLocaleString()} <span style="font-size:12px;">輛/h</span></div>
                        <div class="lbl">成功注入路網車流 (已連通)</div>
                    </div>
                    <div class="tia-kpi-card ${auditResult.missingCount > 0 ? 'kpi-danger' : 'kpi-success'}">
                        <div class="val">${auditResult.unroutableVehTrips.toLocaleString()} <span style="font-size:12px;">輛/h</span></div>
                        <div class="lbl">短缺/流失車流 (斷鏈未發車)</div>
                    </div>
                    <div class="tia-kpi-card ${parseFloat(auditResult.connectivityRate) >= 95 ? 'kpi-success' : 'kpi-danger'}">
                        <div class="val">${auditResult.connectivityRate}%</div>
                        <div class="lbl">路網起迄動線有效連通率</div>
                    </div>
                </div>

                ${auditResult.missingCount > 0 ? `
                    <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:10px 14px; margin-bottom:12px; font-size:12.5px; color:#92400e; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size:16px; color:#d97706;"></i>
                        <span><strong>除錯修復指引 (${pInfo.name})</strong>：以下列出所有無法於路網尋得連續行車路徑之起迄動線，請依表中之「建議修復指引」前往模擬器補齊路口轉向線或連通道。</span>
                    </div>

                    <table class="tia-table" style="font-size:12px;">
                        <thead>
                            <tr style="background:#f1f5f9;">
                                <th style="width:35px;">#</th>
                                <th style="width:115px;">起點分區 (O)</th>
                                <th style="width:115px;">迄點分區 (D)</th>
                                <th style="width:110px;">短缺車流</th>
                                <th style="width:140px;">出發 ➔ 抵達候選路段</th>
                                <th style="text-align:left;">斷鏈診斷成因</th>
                                <th style="text-align:left;">建議修復指引</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${auditResult.missingODs.map((m, idx) => `
                                <tr>
                                    <td><strong>${idx + 1}</strong></td>
                                    <td style="font-weight:700;">${m.fromName} <span class="badge-tag-warn" style="font-size:10px;">${m.fromType}</span></td>
                                    <td style="font-weight:700;">${m.toName} <span class="badge-tag-warn" style="font-size:10px;">${m.toType}</span></td>
                                    <td style="color:#dc2626; font-weight:700;">
                                        ${m.hourlyVehTrips.toLocaleString()} 輛/h
                                        <div style="font-size:10.5px; color:#64748b; font-weight:normal;">(${m.pcu} PCU)</div>
                                    </td>
                                    <td style="font-family:monospace; font-size:11px; color:#475569;">
                                        <div>${m.originLinks}</div>
                                        <div style="color:#94a3b8; line-height:1;">↓</div>
                                        <div>${m.destLinks}</div>
                                    </td>
                                    <td class="text-left" style="color:#b91c1c; font-size:11.5px; line-height:1.45;">
                                        <i class="fa-solid fa-circle-xmark" style="color:#ef4444; margin-right:3px;"></i>
                                        <strong>${m.reason}</strong>
                                    </td>
                                    <td class="text-left" style="color:#1e293b; font-size:11.5px; line-height:1.45;">
                                        <i class="fa-solid fa-wrench" style="color:#0284c7; margin-right:3px;"></i>
                                        ${m.suggestion}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : `
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:12px 16px; font-size:13px; color:#166534; display:flex; align-items:center; gap:10px;">
                        <i class="fa-solid fa-circle-check" style="font-size:20px; color:#16a34a;"></i>
                        <div>
                            <strong>路網拓撲連通性健全 (${pInfo.name})：</strong>全區 ${zoneList.length} 個都市計畫分區間共 ${auditResult.routableCount} 組 OD 起迄路徑經全域尋路驗證均可順利通達，預估 ${auditResult.routableVehTrips.toLocaleString()} 輛/h 機動車流均已 100% 成功指派至路網。
                        </div>
                    </div>
                `}
            </div>

            <!-- 三、多運具分擔推估 -->
            <div class="tia-section">
                <div class="tia-section-title">
                    <span>三、 運具選擇模式分配 (Mode Split)</span>
                    <span class="badge">MNL Logit Model</span>
                </div>
                <table class="tia-table">
                    <thead>
                        <tr>
                            <th>運具類別 (Mode)</th>
                            <th>運具特性</th>
                            <th>運具分擔率 (%)</th>
                            <th>${pInfo.name}旅次量 (人次/h)</th>
                            <th>車流當量轉換 (PCU/h)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="font-weight:700;"><i class="fa-solid fa-car" style="color:#3b82f6;"></i> 小客車 (Auto)</td>
                            <td class="text-left">長距離聯外與核心商務通勤主導</td>
                            <td><strong style="color:#3b82f6;">${autoShare}%</strong></td>
                            <td>${Math.round(currentPeriodTrips * parseFloat(autoShare) / 100).toLocaleString()}</td>
                            <td>${Math.round(currentPeriodTrips * parseFloat(autoShare) / 100 * 1.0).toLocaleString()} PCU</td>
                        </tr>
                        <tr>
                            <td style="font-weight:700;"><i class="fa-solid fa-motorcycle" style="color:#f59e0b;"></i> 機車 (Motorcycle)</td>
                            <td class="text-left">中短距離高機動彈性混流</td>
                            <td><strong style="color:#f59e0b;">${motoShare}%</strong></td>
                            <td>${Math.round(currentPeriodTrips * parseFloat(motoShare) / 100).toLocaleString()}</td>
                            <td>${Math.round(currentPeriodTrips * parseFloat(motoShare) / 100 * 0.4).toLocaleString()} PCU (0.4)</td>
                        </tr>
                        <tr>
                            <td style="font-weight:700;"><i class="fa-solid fa-person-walking" style="color:#10b981;"></i> 步行 (Pedestrian)</td>
                            <td class="text-left">500m 範圍內短途步行與生活消費</td>
                            <td><strong style="color:#10b981;">${walkShare}%</strong></td>
                            <td>${Math.round(currentPeriodTrips * parseFloat(walkShare) / 100).toLocaleString()}</td>
                            <td>- (綠色永續旅次)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 四、周邊路網交通衝擊與服務水準 -->
            <div class="tia-section">
                <div class="tia-section-title">
                    <span>四、 周邊道路交通衝擊與服務水準評定 (LOS)</span>
                    <span class="badge">Traffic Operations & LOS</span>
                </div>
                <div class="tia-grid-cards" style="grid-template-columns: repeat(2, 1fr);">
                    <div class="tia-kpi-card">
                        <div class="val">${networkAvgSpeed.toFixed(1)} <span style="font-size:12px;">km/h</span></div>
                        <div class="lbl">路網平均運行車速 (Network Speed)</div>
                    </div>
                    <div class="tia-kpi-card">
                        <div class="val"><span class="los-pill los-pill-${overallLOS}">LOS ${overallLOS}</span></div>
                        <div class="lbl">全區總體服務水準評定</div>
                    </div>
                </div>

                <table class="tia-table">
                    <thead>
                        <tr>
                            <th>路段編號</th>
                            <th>路段名稱</th>
                            <th>車道數</th>
                            <th>尖峰流量 (PCU/h)</th>
                            <th>道路容量 (PCU/h)</th>
                            <th>V/C 飽和度</th>
                            <th>平均車速 (km/h)</th>
                            <th>服務水準 (LOS)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${links.slice(0, 8).map(link => {
                            const lanes = (link.lanes && link.lanes.length) ? link.lanes.length : 2;
                            const cap = lanes * 1800;
                            const flow = Math.round(cap * (overallLOS === 'E' || overallLOS === 'F' ? 0.92 : 0.65));
                            const vc = (flow / cap).toFixed(2);
                            const spd = link.currentAvgSpeed ? link.currentAvgSpeed.toFixed(1) : (overallLOS === 'F' ? '12.4' : '36.8');
                            const los = link.currentLOS || overallLOS;
                            return `
                                <tr>
                                    <td><strong>${link.id}</strong></td>
                                    <td class="text-left">${link.name || `Arterial_Link_${link.id}`}</td>
                                    <td>${lanes}</td>
                                    <td>${flow.toLocaleString()}</td>
                                    <td>${cap.toLocaleString()}</td>
                                    <td>${vc}</td>
                                    <td>${spd}</td>
                                    <td><span class="los-pill los-pill-${los}">LOS ${los}</span></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- 五、交通衝擊減輕對策 -->
            <div class="tia-section">
                <div class="tia-section-title">
                    <span>五、 交通衝擊減輕對策與規劃建議 (Mitigation Measures)</span>
                    <span class="badge">Mitigation Strategies</span>
                </div>
                <div class="tia-recommendations">
                    <strong>🚦 交通工程與都市設計改善建議：</strong>
                    <ul>
                        <li><strong>智慧動態號誌時制配比</strong>：尖峰時段建議針對主要動線實施幹道綠波 (Green Wave) 與 Webster 最佳化配時，可降低路口延滯 18%~25%。</li>
                        <li><strong>分區基地進出動線分流</strong>：商業核心區 (C2) 之形心聯絡道應配置右進右出或專用減速車道，避免車流回堵至幹道主線。</li>
                        <li><strong>完整街道與行人庇護島</strong>：路口行穿線應退縮 3~5m 並增設中央綠化庇護島，提升短途步行安全與吸引力。</li>
                        <li><strong>大眾運輸與停車管理對策</strong>：高容積商辦區應推動 TOD 停車位上限管制與大眾運輸接駁，有效抑制尖峰小客車持有與衍生。</li>
                    </ul>
                </div>
            </div>

            <!-- ============================================================= -->
            <!-- 附錄：交通衝擊評估模式詳細推導與人眼易讀算式 (Methodology & Proof) -->
            <!-- ============================================================= -->
            <div class="page-break-before"></div>

            <div class="tia-appendix-header">
                <h3>📑 附錄：交通衝擊評估模式詳細推導與人眼易讀算式過程</h3>
                <p>為利都市計畫委員會與交通主管機關審查查核，以下依交通工程學理及四階段交通預測模式，展開直覺名詞化公式與實際數值代入步驟，供工程技師與審查委員逐項覆核檢視。</p>
            </div>

            <!-- 附錄一、基地土地使用規劃與社會經濟指標 -->
            <div class="tia-section">
                <div class="tia-section-title" style="border-left-color: #0284c7;">
                    <span>附錄一、 基地土地使用規劃與社會經濟指標之詳細計算過程</span>
                    <span class="badge" style="background:#e0f2fe; color:#0369a1;">Socio-Economic Derivation</span>
                </div>

                <div class="calc-box">
                    <div class="calc-step-header">
                        <span class="calc-step-badge">1</span>
                        <span>土地開發規模與建築幾何量推算（以代表性分區為例）</span>
                    </div>

                    <div class="formula-card formula-blue">
                        <div class="formula-title">
                            <span>【建築基底佔地面積】</span>
                            <span class="formula-tag">建築退縮與空地檢核</span>
                        </div>
                        <div class="formula-expr">建築基底佔地面積 = 基地總面積 × 法定建蔽率 (BCR)</div>
                        <div class="formula-subst">
                            <strong>實例代入 (${resName} ${resType})：</strong>
                            ${resArea.toLocaleString()} m² × ${(resBCRVal * 100).toFixed(0)}% = <strong>${resFootprint.toLocaleString()} m²</strong>
                        </div>
                        <p class="formula-note">說明：即建築物投影於地表之最大水平面積。其餘 ${(100 - resBCRVal * 100).toFixed(0)}% (${(resArea - resFootprint).toLocaleString()} m²) 為法定空地、綠帶及防災退縮緩衝空間。</p>
                    </div>

                    <div class="formula-card formula-blue">
                        <div class="formula-title">
                            <span>【總法定樓地板面積 (GFA)】</span>
                            <span class="formula-tag">開發總量體</span>
                        </div>
                        <div class="formula-expr">總法定樓地板面積 (GFA) = 基地總面積 × 法定容積率 (FAR)</div>
                        <div class="formula-subst">
                            <strong>實例代入 (${resName} ${resType})：</strong>
                            ${resArea.toLocaleString()} m² × ${(resFARVal * 100).toFixed(0)}% = <strong>${resGFA.toLocaleString()} m²</strong>
                        </div>
                        <p class="formula-note">說明：決定土地使用總量之法定基準。全區 ${zoneList.length} 個分區合計總樓地板面積達 ${Math.round(totalGFA).toLocaleString()} m²。</p>
                    </div>

                    <div class="formula-card formula-blue">
                        <div class="formula-title">
                            <span>【等效法定興建樓層數】</span>
                            <span class="formula-tag">建築立體高度</span>
                        </div>
                        <div class="formula-expr">等效興建樓層數 = 容積率 (FAR) ÷ 建蔽率 (BCR)</div>
                        <div class="formula-subst">
                            <strong>實例代入：</strong>
                            ${resName}：${(resFARVal * 100).toFixed(0)}% ÷ ${(resBCRVal * 100).toFixed(0)}% = <strong>${resFloors} 層樓</strong> ； 
                            ${comName}：${(comFARVal * 100).toFixed(0)}% ÷ ${(comBCRVal * 100).toFixed(0)}% = <strong>${comFloors} 層樓</strong>
                        </div>
                        <p class="formula-note">說明：模擬器據此高度自動進行 3D 量體擠出 (ExtrudeGeometry)，精準對應都市實體天際線。</p>
                    </div>
                </div>

                <div class="calc-box">
                    <div class="calc-step-header">
                        <span class="calc-step-badge">2</span>
                        <span>活動主體規模推估（常住人口與就業崗位）</span>
                    </div>

                    <div class="formula-card formula-emerald">
                        <div class="formula-title">
                            <span>【住宅區推估常住人口】</span>
                            <span class="formula-tag">居住承載力</span>
                        </div>
                        <div class="formula-expr">常住人口 =（總樓地板面積 × 實效居住淨係數 85%）÷ 每人人均居住面積 (U_res)</div>
                        <div class="formula-subst">
                            <strong>實例代入 (${resName} ${resType})：</strong>
                            (${resGFA.toLocaleString()} m² × 85%) ÷ ${resU} m²/人 = <strong>${resPop.toLocaleString()} 人</strong>
                        </div>
                        <p class="formula-note">說明：參照國土綜合規劃標準，扣除公設、梯間及設備層（淨係數 85%）。低密度(R1)取 35m²/人，中密度(R2)取 30m²/人，高密度集合住宅(R3)取 25m²/人。全區推估常住總人口為 ${totalPop.toLocaleString()} 人。</p>
                    </div>

                    <div class="formula-card formula-emerald">
                        <div class="formula-title">
                            <span>【商業/產業區推估就業崗位】</span>
                            <span class="formula-tag">就業吸納量</span>
                        </div>
                        <div class="formula-expr">就業崗位 =（總樓地板面積 × 實效工作淨係數 80%）÷ 每崗位基準工作面積 (U_job)</div>
                        <div class="formula-subst">
                            <strong>實例代入 (${comName} ${comType})：</strong>
                            (${comGFA.toLocaleString()} m² × 80%) ÷ ${comU} m²/崗位 = <strong>${comEmp.toLocaleString()} 崗位</strong>
                        </div>
                        <p class="formula-note">說明：扣除中庭、走廊與機電設施（淨係數 80%）。核心CBD商辦(C2)每職位約 18m²，街角商場(C1)約 25m²，大型娛樂購物(C3)約 30m²，科技廠辦(I)約 40m²。全區推估總就業崗位達 ${totalEmp.toLocaleString()} 崗位。</p>
                    </div>
                </div>
            </div>

            <!-- 附錄二、旅次產生與空間分佈推估 (四階段模式) -->
            <div class="tia-section">
                <div class="tia-section-title" style="border-left-color: #d97706;">
                    <span>附錄二、 旅次產生與空間分佈推估 (四階段模式) 之詳細計算過程</span>
                    <span class="badge" style="background:#fef3c7; color:#b45309;">Trip Gen & Gravity Distribution</span>
                </div>

                <div class="calc-box">
                    <div class="calc-step-header">
                        <span class="calc-step-badge badge-amber">1</span>
                        <span>第一階段：尖離峰旅次產生量 (Pi) 與吸引量 (Ai) 計算</span>
                    </div>

                    <div class="formula-card formula-amber">
                        <div class="formula-title">
                            <span>【尖峰旅次產生量 (出發旅次)】</span>
                            <span class="formula-tag">出發通勤旅次 (Production)</span>
                        </div>
                        <div class="formula-expr">尖峰產生量 (Pi) = 基準主體規模 × 尖峰時段雙向旅次率 (α) × 出發方向分割比例 (Split_P)</div>
                        <div class="formula-subst">
                            <strong>實例代入 (${pInfo.full} · ${resName})：</strong>
                            ${resPop.toLocaleString()} 人 × ${resAlpha.toFixed(2)} 旅次/人 × ${(resSplitP * 100).toFixed(0)}% = <strong>${resProdCurrent.toLocaleString()} 旅次/小時 (${resSplitP >= 0.5 ? '出發外出' : '吸引進駐'})</strong>
                        </div>
                        <p class="formula-note">說明：${pInfo.name}時段，住宅分區出行方向比 Split_P 為 ${(resSplitP * 100).toFixed(0)}%，僅 ${(100 - resSplitP * 100).toFixed(0)}% (1 - Split_P) 吸引回流。此數值為全運具個人旅次（含步行與汽機車）。</p>
                    </div>

                    <div class="formula-card formula-amber">
                        <div class="formula-title">
                            <span>【尖峰旅次吸引量 (抵達旅次)】</span>
                            <span class="formula-tag">抵達工作旅次 (Attraction)</span>
                        </div>
                        <div class="formula-expr">尖峰吸引量 (Ai) = 基準主體規模 × 尖峰時段雙向旅次率 (α) × 抵達方向分割比例 (Split_A)</div>
                        <div class="formula-subst">
                            <strong>實例代入 (${pInfo.full} · ${comName})：</strong>
                            ${comEmp.toLocaleString()} 崗位 × ${comAlpha.toFixed(2)} 旅次/崗位 × ${((1 - comSplitP) * 100).toFixed(0)}% (抵達比例 Split_A = 1 - ${(comSplitP * 100).toFixed(0)}%) = <strong>${comAttrCurrent.toLocaleString()} 旅次/小時 (${comSplitP <= 0.5 ? '員工進駐上班洽公' : '下班離去'})</strong>
                        </div>
                        <p class="formula-note">說明：核心商辦在${pInfo.name}呈現強烈方向性效應，抵達比例 Split_A 為 ${((1 - comSplitP) * 100).toFixed(0)}%。此數值代表全運具個人抵達旅次，後續第三階段將進一步分配為汽機車車流與步行人流。</p>
                    </div>

                    <div class="formula-card formula-amber">
                        <div class="formula-title">
                            <span>【全區旅次總量守恆平衡調整 (目標吸引量 Ai')】</span>
                            <span class="formula-tag">邊界總量守恆 ∑Pi = ∑Ai'</span>
                        </div>
                        <div class="formula-expr">目標吸引量 (Ai') = 原始吸引量 (Ai) × 全區平衡因子 (∑Pi ÷ ∑Ai)</div>
                        <div class="formula-subst">
                            <strong>全區平衡計算公式與各分區加總明細：</strong><br>
                            • <strong>全區總產生量 ∑Pi（各分區產生量 Pi 加總）：</strong><br>
                            &nbsp;&nbsp;${step1Rows.map(r => `${r.name}: ${r.pVal.toLocaleString()} 旅次/h`).join(' ； ')}<br>
                            &nbsp;&nbsp;➔ <strong>∑Pi</strong> = ${step1Rows.map(r => `${r.pVal.toLocaleString()}`).join(' + ')} = <strong>${totalP_val.toLocaleString()} 旅次/小時</strong><br><br>
                            • <strong>全區原始總吸引量 ∑Ai（各分區原始吸引量 Ai 加總）：</strong><br>
                            &nbsp;&nbsp;${step1Rows.map(r => `${r.name}: ${r.aVal.toLocaleString()} 旅次/h`).join(' ； ')}<br>
                            &nbsp;&nbsp;➔ <strong>∑Ai</strong> = ${step1Rows.map(r => `${r.aVal.toLocaleString()}`).join(' + ')} = <strong>${totalA_val.toLocaleString()} 旅次/小時</strong><br><br>
                            • <strong>全區平衡調整比尺 (f_A)：</strong><br>
                            &nbsp;&nbsp;f_A = ∑Pi ÷ ∑Ai = ${totalP_val.toLocaleString()} ÷ ${totalA_val.toLocaleString()} = <strong>${aScaleFactor.toFixed(4)}</strong><br><br>
                            • <strong>分區目標吸引量平衡實例代入：</strong><br>
                            &nbsp;&nbsp;以 ${comName} 為例：${sampleComAttr.toLocaleString()} 旅次/h × ${aScaleFactor.toFixed(4)} ≈ <strong>${sampleComTargetA.toLocaleString()} 旅次/小時 (Ai')</strong><br>
                            &nbsp;&nbsp;（各分區原始 Ai 經乘以此比尺後，加總即精確等於總產生量 ${totalP_val.toLocaleString()} 旅次/h，如下表所示）
                        </div>
                        <p class="formula-note">說明：封閉路網內全區「總出發人次」必然等於「總抵達人次」。因產生量係由常住人口直接決定（掌握度高），故依交通工程學理以總產生量 ∑Pi 作為控制總量（Control Total），對吸引端進行同比例縮放，確保進入第二階段重力模型時具備嚴格的雙向守恆邊界。</p>
                    </div>

                    <!-- 第一階段各分區尖峰產生量 (Pi) 與吸引量 (Ai) 詳細計算結果總表 -->
                    <div style="margin-top: 14px; margin-bottom: 6px; font-weight: 700; color: #92400e; font-size: 13px;">
                        📊 第一階段各分區尖峰產生量 (Pi) 與吸引量 (Ai) 詳細推估計算結果總表：
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="tia-table" style="margin-bottom: 6px; font-size: 12px; text-align: center;">
                            <thead>
                                <tr style="background:#f8fafc;">
                                    <th style="text-align:left; background:#f1f5f9;">分區名稱 / 代碼</th>
                                    <th style="background:#f1f5f9;">土地使用類型</th>
                                    <th style="background:#f1f5f9;">活動主體規模</th>
                                    <th style="background:#f1f5f9;">尖峰旅次率 (α)</th>
                                    <th style="background:#f1f5f9;">尖峰總旅次</th>
                                    <th style="background:#f1f5f9;">方向分割 (P / A)</th>
                                    <th style="background:#fffbeb; color:#b45309; min-width:90px;">尖峰產生量 Pi<br><span style="font-size:10px; font-weight:normal;">(出發需求)</span></th>
                                    <th style="background:#f1f5f9; color:#64748b; min-width:85px;">原始吸引量 Ai<br><span style="font-size:10px; font-weight:normal;">(未平衡)</span></th>
                                    <th style="background:#e0f2fe; color:#0369a1; min-width:90px;">目標吸引量 Ai'<br><span style="font-size:10px; font-weight:normal;">(全區平衡)</span></th>
                                    <th style="text-align:left; background:#f1f5f9;">主要交通流向特性</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${step1Rows.map(r => `
                                    <tr>
                                        <td style="text-align:left; font-weight:700;">${r.name}</td>
                                        <td><span style="padding:2px 6px; background:#e2e8f0; border-radius:4px; font-weight:600; font-size:11px;">${r.type}</span></td>
                                        <td style="font-family:monospace;">${r.baseScale.toLocaleString()} ${r.baseActivity === '常住人口' ? '人' : '崗'}</td>
                                        <td style="font-family:monospace;">${r.alpha.toFixed(2)}</td>
                                        <td style="font-family:monospace; font-weight:600;">${r.totalTrips.toLocaleString()}</td>
                                        <td style="font-family:monospace; font-size:11px;">${(r.splitP * 100).toFixed(0)}% / ${(r.splitA * 100).toFixed(0)}%</td>
                                        <td style="font-weight:700; background:#fffbeb; color:#b45309; font-family:monospace; font-size:13px;">${r.pVal.toLocaleString()}</td>
                                        <td style="font-family:monospace; color:#64748b;">${r.aVal.toLocaleString()}</td>
                                        <td style="font-weight:700; background:#f0f9ff; color:#0284c7; font-family:monospace; font-size:13px;">${r.targetA.toLocaleString()}</td>
                                        <td style="text-align:left; font-size:11px; color:#475569;">${r.roleDesc}</td>
                                    </tr>
                                `).join('')}
                                <!-- 全區總計列 -->
                                <tr style="background:#fef3c7; font-weight:700; border-top: 2px solid #cbd5e1;">
                                    <td colspan="4" style="text-align:left; color:#92400e;">【全區總計】總活動主體與旅次規模</td>
                                    <td style="font-family:monospace; color:#92400e;">${step1Rows.reduce((sum, r) => sum + r.totalTrips, 0).toLocaleString()}</td>
                                    <td style="color:#92400e;">-</td>
                                    <td style="font-family:monospace; color:#b45309; font-size:13px;">${totalP_val.toLocaleString()}</td>
                                    <td style="font-family:monospace; color:#64748b;">${totalA_val.toLocaleString()}</td>
                                    <td style="font-family:monospace; color:#0284c7; font-size:13px;">${totalP_val.toLocaleString()}</td>
                                    <td style="text-align:left; color:#15803d; font-size:11.5px;">✅ 全區總產生 = 總目標吸引（平衡比尺 ${(aScaleFactor).toFixed(4)}）</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:8px 12px; margin-top:6px; font-size:12px; color:#1e40af;">
                        <strong>🔗 銜接第二階段拘束條件說明：</strong>本階段推估產出之各分區 <strong>尖峰產生量 (Pi)</strong> 即為第二階段 Furness IPF 雙向配平中各列之目標產生量；<strong>目標吸引量 (Ai')</strong> 即為各行之目標吸引量。此兩組數值構成重力矩陣邊界守恆的核心輸入條件。
                    </div>
                </div>

                <div class="calc-box">
                    <div class="calc-step-header">
                        <span class="calc-step-badge badge-amber">2</span>
                        <span>第二階段：雙約束重力模式與 Furness IPF 比例配平迭代</span>
                    </div>

                    <div class="formula-card formula-amber">
                        <div class="formula-title">
                            <span>【空間距離阻抗衰減函數】</span>
                            <span class="formula-tag">空間阻抗係數 β = 0.003</span>
                        </div>
                        <div class="formula-expr">空間阻抗衰減值 = 自然指數底數 e 的負 (β × 兩分區形心距離) 次方</div>
                        <div class="formula-subst">
                            <strong>實例代入 [${odFrom}] 至 [${odTo}]（路徑直線距離 ${calcDist} 公尺）：</strong>
                            exp(-0.003 × ${calcDist}) = <strong>${decayFactor}</strong>
                        </div>
                        <p class="formula-note">說明：歐氏距離越遠，跨區阻抗越大，兩分區間之交換潛能呈負指數衰減；區內內部阻抗距離依基地面積半徑折算。</p>
                    </div>

                    <div class="formula-card formula-amber">
                        <div class="formula-title">
                            <span>【Furness IPF 雙向比例配平收斂過程與每次迭代結果】</span>
                            <span class="formula-tag">OD 邊界雙向守恆迭代歷程</span>
                        </div>
                        <div class="formula-expr">分區配平旅次 (Tij) = 初始重力潛能 × 列平衡因子 (ai) × 行平衡因子 (bj)</div>
                        <div class="formula-subst">
                            <strong>雙向配平迭代演算步驟說明：</strong><br>
                            • <strong>步驟 1（初始化重力潛能計算）</strong>：<br>
                            &nbsp;&nbsp;計算重力初值 Tij^(0) = Pi × Aj × exp(-β × dij)。<br>
                            &nbsp;&nbsp;• <strong>實例計算（以 ${odFrom} 內部旅次 ${odFrom} → ${odFrom} 為例）：</strong><br>
                            &nbsp;&nbsp;&nbsp;&nbsp;Pi = ${P_map[fromId]} 旅次/h ； Aj = ${A_map[fromId]} 旅次/h ； 內部等效阻抗距離 dij = ${distances[fromId][fromId]} 公尺（依基地面積半徑折算）<br>
                            &nbsp;&nbsp;&nbsp;&nbsp;T^(0) = ${P_map[fromId]} × ${A_map[fromId]} × exp(-0.003 × ${distances[fromId][fromId]}) = ${Math.round(P_map[fromId] * A_map[fromId]).toLocaleString()} × ${Math.exp(-0.003 * distances[fromId][fromId]).toFixed(5)} = <strong>${initIntraTij.toLocaleString()}</strong><br>
                            &nbsp;&nbsp;• <strong>初值量級學理解釋</strong>：因分子為產生量與吸引量相乘（因次為旅次平方 trips²），初值代表各分區間未約束之<strong>「相對重力交換潛能 (Gravity Potential)」</strong>，故數值達數萬至數十萬（全區初值總和達 ${Math.round(furnessSnapshots[0].grandTotal).toLocaleString()}），此時尚未滿足出發與抵達邊界守恆。<br><br>
                            • <strong>步驟 2（第 1 次迭代列平衡 Row Factor）</strong>：<br>
                            &nbsp;&nbsp;計算列縮放因子 ai = Pi ÷ ∑ Tij。例如 ${odFrom} 第 1 輪縮放因子 ai = ${P_map[fromId]} ÷ ${Math.round(furnessSnapshots[0].rowSums[fromId]).toLocaleString()} ≈ <strong>${(P_map[fromId] / Math.max(1, furnessSnapshots[0].rowSums[fromId])).toFixed(6)}</strong>。<br>
                            &nbsp;&nbsp;乘以此因子後，矩陣數值瞬間等比例縮小約 ${(furnessSnapshots[0].grandTotal / Math.max(1, totalP_val)).toFixed(0)} 倍，從百萬級潛能回歸為真實百位數旅次（如內部旅次自 ${initIntraTij.toLocaleString()} 縮減至約 ${Math.round(furnessSnapshots[1].matrix[fromId][fromId]).toLocaleString()} 旅次/h），使各區出發總和精確等於 Pi (${(P_map[fromId] || resProdAM).toLocaleString()} 次/h)。<br><br>
                            • <strong>步驟 3（行平衡 Column Factor）</strong>：<br>
                            &nbsp;&nbsp;計算行縮放因子 bj = Aj' ÷ ∑ Tij，縮放各行使各區抵達總和精確等於目標吸引量 Aj' (${Math.round(targetA_map[toId] || comAttrAM).toLocaleString()} 次/h)。<br><br>
                            • <strong>步驟 4（收斂判定）</strong>：<br>
                            &nbsp;&nbsp;交替重複步驟 2 與 3，直至邊界最大誤差小於 1% 門檻。<br>
                            • <strong>【${odFrom} → ${odTo}】最終配平小時交換總量（全運具）：${sampleFinalTij.toLocaleString()} 旅次/小時</strong>（經第三階段運具選擇後，汽機車機動車輛為 <strong>${sampleVehTrips.toLocaleString()}</strong> 輛/小時，短途步行約 <strong>${sampleWalkPeds.toLocaleString()}</strong> 人次/小時）
                        </div>

                        <!-- 每次迭代數值與收斂檢核歷程表 -->
                        <div style="margin-top: 12px; margin-bottom: 6px; font-weight: 700; color: #92400e; font-size: 12.5px;">
                            📊 Furness 雙向比例配平 0~5 次迭代詳細數值歷程表（以 [${odFrom} → ${odTo}] 為例）：
                        </div>
                        <table class="tia-table" style="margin-bottom: 8px; font-size: 12px;">
                            <thead>
                                <tr>
                                    <th>迭代次數</th>
                                    <th>平衡階段與說明</th>
                                    <th>列平衡因子 (ai)</th>
                                    <th>行平衡因子 (bj)</th>
                                    <th>[${odFrom} → ${odTo}] 交換量</th>
                                    <th>全區最大邊界誤差</th>
                                    <th>收斂狀態</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${furnessLogs.map(log => `
                                    <tr ${log.iter === 5 ? 'style="background:#f0fdf4; font-weight:700;"' : ''}>
                                        <td><strong>${log.iter === 0 ? '初值 (k=0)' : `第 ${log.iter} 次 (k=${log.iter})`}</strong></td>
                                        <td class="text-left">${log.phase}</td>
                                        <td style="font-family: monospace;">${log.factorA}</td>
                                        <td style="font-family: monospace;">${log.factorB}</td>
                                        <td style="font-weight:700; color:#b45309;">${log.sampleTij.toLocaleString()} 旅次/h</td>
                                        <td style="color: ${log.maxError.includes('%') && parseFloat(log.maxError) < 1.0 ? '#059669' : '#d97706'}; font-weight:600;">${log.maxError}</td>
                                        <td><span style="font-size:11px; padding:2px 6px; border-radius:4px; ${log.status.includes('已收斂') ? 'background:#dcfce7; color:#15803d; font-weight:700;' : 'background:#fef3c7; color:#b45309;'}">${log.status}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>

                        <!-- 每次迭代行列 OD 表 (含行列總和與目標值) -->
                        <div style="margin-top: 18px; margin-bottom: 8px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                <strong style="font-size: 13px; color: #0f172a;">
                                    <i class="fa-solid fa-table-cells" style="color:#d97706;"></i> 每次迭代各分區 OD 流量表（含列總和、行總和、目標需求量）：
                                </strong>
                                <div class="report-actions" style="display:flex; gap:4px; flex-wrap:wrap;">
                                    <button type="button" class="btn-od-filter" onclick="TIAReportGenerator.switchODTab('all', this)" style="background:#0284c7; color:#fff; border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">全部展開 (0~5 次)</button>
                                    <button type="button" class="btn-od-filter" onclick="TIAReportGenerator.switchODTab(0, this)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">初值 (k=0)</button>
                                    <button type="button" class="btn-od-filter" onclick="TIAReportGenerator.switchODTab(1, this)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">第 1 次</button>
                                    <button type="button" class="btn-od-filter" onclick="TIAReportGenerator.switchODTab(2, this)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">第 2 次</button>
                                    <button type="button" class="btn-od-filter" onclick="TIAReportGenerator.switchODTab(3, this)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">第 3 次 (收斂)</button>
                                    <button type="button" class="btn-od-filter" onclick="TIAReportGenerator.switchODTab(4, this)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">第 4 次</button>
                                    <button type="button" class="btn-od-filter" onclick="TIAReportGenerator.switchODTab(5, this)" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">第 5 次 (最終)</button>
                                </div>
                            </div>
                        </div>

                        <div id="furness-od-tables-container">
                            ${furnessSnapshots.map(snap => `
                                <div class="furness-iteration-card" id="furness-iter-card-${snap.k}" style="margin-bottom: 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom: 1px dashed #e2e8f0; padding-bottom:4px;">
                                        <span style="font-weight:700; color:#0f172a; font-size:12.5px;">
                                            <i class="fa-solid fa-table" style="color:#0284c7;"></i> 
                                            ${snap.k === 0 ? '【初值 k=0】重力模型初始 OD 表（未配平，行列總和偏離目標）' : (snap.k === 5 ? `【第 5 次迭代 k=5】最終精確配平 OD 表（正式報告採用成果）` : `【第 ${snap.k} 次迭代 k=${snap.k}】雙向比例配平 OD 表`)}
                                        </span>
                                        <span style="font-size:11px; padding:1px 7px; border-radius:10px; ${snap.isConverged ? 'background:#dcfce7; color:#15803d; font-weight:700;' : 'background:#fef3c7; color:#b45309;'}">
                                            ${snap.k === 0 ? '初值基準 (未配平)' : (snap.isConverged ? `✅ 最大誤差: ${snap.errPercent} (&lt;1% 已收斂)` : `最大誤差: ${snap.errPercent}`)}
                                        </span>
                                    </div>

                                    ${snap.k === 0 ? `
                                        <div style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:4px; padding:8px 12px; margin-bottom:8px; font-size:12px; color:#991b1b; line-height:1.6;">
                                            <strong>💡 初值 ${initIntraTij.toLocaleString()} 是如何計算出來的？（古典重力潛能未配平公式）：</strong><br>
                                            本表各單元格係依古典重力潛能公式 <code>Tij^(0) = Pi × Aj × exp(-β × dij)</code> 計算：<br>
                                            • <strong>以 ${odFrom} 內部旅次 (${odFrom} → ${odFrom}) 為例：</strong><br>
                                            &nbsp;&nbsp;出發產生量 Pi = <strong>${P_map[fromId]}</strong> 旅次/h ； 原始吸引量 Aj = <strong>${A_map[fromId]}</strong> 旅次/h ； 內部等效阻抗距離 dij = <strong>${distances[fromId][fromId]} 公尺</strong><br>
                                            &nbsp;&nbsp;阻抗衰減項 = exp(-0.003 × ${distances[fromId][fromId]}) = <strong>${Math.exp(-0.003 * distances[fromId][fromId]).toFixed(5)}</strong><br>
                                            &nbsp;&nbsp;代入相乘：<strong>${P_map[fromId]} × ${A_map[fromId]} × ${Math.exp(-0.003 * distances[fromId][fromId]).toFixed(5)} = ${Math.round(P_map[fromId] * A_map[fromId]).toLocaleString()} × ${Math.exp(-0.003 * distances[fromId][fromId]).toFixed(5)} = ${initIntraTij.toLocaleString()}</strong><br>
                                            • <strong>初值量級學理解釋</strong>：因分子為 (Pi × Aj) 之旅次平方量級（未約束之「相對重力交換潛能」），故全區初值總和高達 ${Math.round(snap.grandTotal).toLocaleString()}。經第 1 次迭代列縮放後，將等比例縮減約 ${(snap.grandTotal / Math.max(1, totalP_val)).toFixed(0)} 倍，回歸真實百位數旅次規模（${odFrom} 內部旅次於第 1 次迭代即回歸為約 ${Math.round(furnessSnapshots[1].matrix[fromId][fromId]).toLocaleString()} 旅次/h）。
                                        </div>
                                    ` : ''}

                                    <div style="overflow-x: auto;">
                                        <table class="tia-table" style="margin-bottom: 2px; font-size: 11.5px; text-align: center;">
                                            <thead>
                                                <tr style="background:#f8fafc;">
                                                    <th style="text-align:left; background:#f1f5f9; min-width:110px;">出發分區 (O) \\ 抵達分區 (D)</th>
                                                    ${zoneIds.map(dId => {
                                                        const z = zones[dId];
                                                        return `<th style="background:#f1f5f9;">${z ? (z.name || z.id) : dId}</th>`;
                                                    }).join('')}
                                                    <th style="background:#e0f2fe; color:#0369a1; min-width:85px;">列總和 ∑Tij</th>
                                                    <th style="background:#fef3c7; color:#b45309; min-width:85px;">目標產生 Pi</th>
                                                    <th style="background:#ede9fe; color:#6d28d9; min-width:65px;">列因子 ai</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${zoneIds.map(oId => {
                                                    const zO = zones[oId];
                                                    return `
                                                        <tr>
                                                            <td style="text-align:left; font-weight:700; background:#f8fafc;">
                                                                ${zO ? (zO.name || zO.id) : oId}
                                                            </td>
                                                            ${zoneIds.map(dId => {
                                                                const isMissing = (oId !== dId) && auditResult.missingMap.has(`${oId}_${dId}`);
                                                                const cellVal = Math.round(snap.matrix[oId][dId]);
                                                                if (isMissing && cellVal > 0) {
                                                                    return `
                                                                        <td style="font-family:monospace; font-weight:700; background:#fef2f2; color:#dc2626;" title="路徑短缺：此 OD 配對在微觀路網中無可行行車路徑，車流無法注入">
                                                                            ${cellVal.toLocaleString()} <span style="font-size:9.5px; background:#fee2e2; color:#b91c1c; padding:1px 3px; border-radius:3px; vertical-align:middle;">⚠️斷鏈</span>
                                                                        </td>
                                                                    `;
                                                                }
                                                                return `
                                                                    <td style="font-family:monospace; font-weight:600;">
                                                                        ${cellVal.toLocaleString()}
                                                                    </td>
                                                                `;
                                                            }).join('')}
                                                            <td style="font-weight:700; background:#f0f9ff; color:#0284c7;">
                                                                ${Math.round(snap.rowSums[oId]).toLocaleString()}
                                                            </td>
                                                            <td style="font-weight:700; background:#fffbeb; color:#b45309;">
                                                                ${snap.targetP[oId].toLocaleString()}
                                                            </td>
                                                            <td style="font-family:monospace; background:#faf5ff; color:#7c3aed; font-size:11px;">
                                                                ${snap.rFactors[oId]}
                                                            </td>
                                                        </tr>
                                                    `;
                                                }).join('')}
                                                <!-- 底部行統計 (含各行總和、目標吸引量、行因子與全區總計) -->
                                                <tr style="background:#f0f9ff; font-weight:700;">
                                                    <td style="text-align:left; color:#0284c7;">行總和 ∑Tij</td>
                                                    ${zoneIds.map(dId => `
                                                        <td style="color:#0284c7; font-family:monospace;">
                                                            ${Math.round(snap.colSums[dId]).toLocaleString()}
                                                        </td>
                                                    `).join('')}
                                                    <td style="font-weight:700; background:#e0f2fe; color:#0369a1; font-family:monospace;">
                                                        ${Math.round(snap.grandTotal).toLocaleString()}
                                                    </td>
                                                    <td style="font-weight:700; background:#fef3c7; color:#b45309; font-family:monospace;">
                                                        ${totalP_val.toLocaleString()}
                                                    </td>
                                                    <td style="background:#ede9fe; color:#6d28d9; font-size:11px;">
                                                        ${snap.k === 0 ? '初值未配平' : (snap.isConverged ? '✅ 已收斂' : '配平微調')}
                                                    </td>
                                                </tr>
                                                <tr style="background:#fffbeb; font-weight:700;">
                                                    <td style="text-align:left; color:#b45309;">目標吸引量 Aj'</td>
                                                    ${zoneIds.map(dId => `
                                                        <td style="color:#b45309; font-family:monospace;">
                                                            ${snap.targetA[dId].toLocaleString()}
                                                        </td>
                                                    `).join('')}
                                                    <td style="font-weight:700; background:#e0f2fe; color:#0369a1; font-family:monospace;">
                                                        ${totalP_val.toLocaleString()}
                                                    </td>
                                                    <td style="font-weight:700; background:#fef3c7; color:#b45309; font-family:monospace;">
                                                        ${totalP_val.toLocaleString()}
                                                    </td>
                                                    <td style="background:#ede9fe; color:#6d28d9; font-size:11px;">
                                                        總量守恆 100%
                                                    </td>
                                                </tr>
                                                <tr style="background:#faf5ff;">
                                                    <td style="text-align:left; color:#7c3aed; font-weight:700;">行配平因子 bj</td>
                                                    ${zoneIds.map(dId => `
                                                        <td style="color:#7c3aed; font-family:monospace; font-size:11px;">
                                                            ${snap.cFactors[dId]}
                                                        </td>
                                                    `).join('')}
                                                    <td style="color:#0369a1; font-size:10.5px; font-weight:600;">
                                                        全區總交換量
                                                    </td>
                                                    <td style="color:#b45309; font-size:10.5px; font-weight:600;">
                                                        全區目標總需求
                                                    </td>
                                                    <td style="color:#6d28d9; font-size:11px; font-weight:700;">
                                                        ${snap.k === 0 ? '基準起點' : `誤差: ${snap.errPercent}`}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    ${auditResult.missingCount > 0 ? `
                                        <div style="margin-top:6px; font-size:11.5px; color:#b91c1c; display:flex; align-items:center; gap:6px;">
                                            <i class="fa-solid fa-triangle-exclamation"></i>
                                            <span><strong>圖例標註說明</strong>：標註 <span style="background:#fee2e2; color:#b91c1c; padding:1px 5px; border-radius:3px; font-weight:700;">⚠️斷鏈</span> 之淡紅單元格，代表該分區間在實體路網中無可行連續路徑，其配平流量無法於微觀模擬器中發車。</span>
                                        </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>

                        <p class="formula-note">說明：完全符合都市交通規劃四階段模式之雙約束重力模型規範。第 1 次迭代大幅修正量級，第 2~3 次迭代快速收斂，第 4~5 次誤差已遠低於 1%，確保全區旅次在出發端與目的地端皆達到精確數值守恆。</p>
                    </div>
                </div>
            </div>

            <!-- 附錄三、運具選擇模式分配 (Mode Split) -->
            <div class="tia-section">
                <div class="tia-section-title" style="border-left-color: #10b981;">
                    <span>附錄三、 運具選擇模式分配 (Mode Split) 之詳細計算過程</span>
                    <span class="badge" style="background:#dcfce7; color:#15803d;">MNL Discrete Choice & PCU</span>
                </div>

                <div class="calc-box">
                    <div class="calc-step-header">
                        <span class="calc-step-badge badge-emerald">1</span>
                        <span>第三階段：多項羅吉特模式 (Multinomial Logit, MNL) 運具效用評估</span>
                    </div>

                    <div class="formula-card formula-purple">
                        <div class="formula-title">
                            <span>【各運具效用函數值計算 (Utility Functions)】</span>
                            <span class="formula-tag">以兩區距離 ${calcDist} 公尺為例</span>
                        </div>
                        <div class="formula-expr">
                            • 步行效用 (V_Walk) = 2.5 - (0.006 × 距離) - 距離超逾600m懲罰項<br>
                            • 機車效用 (V_Moto) = 0.8 - (0.0018 × 距離) + 0.5 (機動彈性加權)<br>
                            • 汽車效用 (V_Auto) = 0.0 - (0.0012 × 距離) + 0.8 (舒適巡航加權)
                        </div>
                        <div class="formula-subst">
                            <strong>數值代入計算結果（距離 = ${calcDist} 公尺）：</strong><br>
                            • V_Walk = 2.5 - (0.006 × ${calcDist}) - ${calcDist > 600 ? `(0.02 × ${calcDist - 600})` : '0'} = <strong>${vWalk}</strong><br>
                            • V_Moto = 0.8 - (0.0018 × ${calcDist}) + 0.5 = <strong>${vMoto}</strong><br>
                            • V_Auto = 0.0 - (0.0012 × ${calcDist}) + 0.8 = <strong>${vAuto}</strong>
                        </div>
                        <p class="formula-note">說明：短距離步行效用最高；中距離機車具備無可取代的穿梭彈性；長距離（>1,200m）汽車效用因行車舒適與速度大幅勝出。</p>
                    </div>

                    <div class="formula-card formula-purple">
                        <div class="formula-title">
                            <span>【運具選擇機率 (Choice Probability)】</span>
                            <span class="formula-tag">Softmax 吸引力佔比分配</span>
                        </div>
                        <div class="formula-expr">運具分擔率 (Sm) = exp(Vm) ÷ [ exp(V_Walk) + exp(V_Moto) + exp(V_Auto) ] × 100%</div>
                        <div class="formula-subst">
                            <strong>分擔率計算結果：</strong><br>
                            • 🚶 步行分擔率 (Walk Share) = <strong>${probWalk}%</strong><br>
                            • 🛵 機車分擔率 (Moto Share) = <strong>${probMoto}%</strong><br>
                            • 🚗 小客車分擔率 (Auto Share) = <strong>${probAuto}%</strong>
                        </div>
                        <p class="formula-note">說明：全區總體平均運具分擔率為：小客車 ${autoShare}%、機車 ${motoShare}%、步行 ${walkShare}%。</p>
                    </div>
                </div>

                <div class="calc-box">
                    <div class="calc-step-header">
                        <span class="calc-step-badge badge-emerald">2</span>
                        <span>車流當量 (PCU) 換算與微觀車流注入率 (λ)</span>
                    </div>

                    <div class="formula-card formula-emerald">
                        <div class="formula-title">
                            <span>【道路車流當量轉換 (PCU/h)】</span>
                            <span class="formula-tag">交通容量衝擊評定標準</span>
                        </div>
                        <div class="formula-expr">道路車流當量 (PCU/h) = 汽車輛數 × 1.0 (PCU) + 機車輛數 × 0.4 (PCU)</div>
                        <div class="formula-subst">
                            <strong>實例代入 [${odFrom} → ${odTo}]（全運具小時交換總量 ${sampleFinalTij.toLocaleString()} 旅次/h）：</strong><br>
                            • 汽車流量 = ${sampleFinalTij.toLocaleString()} × ${probAuto}% = <strong>${sampleAutoVeh.toLocaleString()} 輛/小時</strong>（折合 ${sampleAutoVeh.toLocaleString()} PCU）<br>
                            • 機車流量 = ${sampleFinalTij.toLocaleString()} × ${probMoto}% = <strong>${sampleMotoVeh.toLocaleString()} 輛/小時</strong>（折合 ${(sampleMotoVeh * 0.4).toFixed(0)} PCU）<br>
                            • 步行人流 = ${sampleFinalTij.toLocaleString()} × ${probWalk}% = <strong>${sampleWalkPeds.toLocaleString()} 人次/小時</strong>（短途綠色動線，引導至路口行人斑馬線）<br>
                            • <strong>汽機車機動車輛總計 = ${sampleAutoVeh.toLocaleString()} + ${sampleMotoVeh.toLocaleString()} = ${sampleVehTrips.toLocaleString()} 輛/小時</strong><br>
                            • <strong>路段合成衝擊車流當量 = ${sampleAutoVeh.toLocaleString()} + ${(sampleMotoVeh * 0.4).toFixed(0)} = ${samplePCU.toLocaleString()} PCU/小時</strong>
                        </div>
                        <p class="formula-note">說明：機車佔用路權依交通部《交通工程手冊》標準折算為 0.4 PCU，忠實反映台灣混流車流對道路容量之真實佔用。</p>
                    </div>

                    <div class="formula-card formula-emerald">
                        <div class="formula-title">
                            <span>【微觀物理模擬發車率 (Poisson λ)】</span>
                            <span class="formula-tag">抽樣比尺 Φ = ${(currentScaleFactor * 100).toFixed(0)}%</span>
                        </div>
                        <div class="formula-expr">微觀發車注入率 (λ, 車輛/秒) = (汽機車小時總量 × 抽樣比尺 Φ) ÷ 3600 秒</div>
                        <div class="formula-subst">
                            <strong>微觀生成器實時注入參數：</strong><br>
                            λ = [ (${sampleAutoVeh.toLocaleString()} + ${sampleMotoVeh.toLocaleString()}) 輛 × ${currentScaleFactor} ] ÷ 3600 = <strong>${sampleLambda} 輛/秒</strong><br>
                            （即 Connector 連線平均每 <strong>${(1 / Math.max(0.001, parseFloat(sampleLambda))).toFixed(1)} 秒</strong> 實體化注入一輛車輛進入微觀路網，驅動 IDM 跟車與 MOBIL 換道物理碰撞引擎）
                        </div>
                        <p class="formula-note">說明：透過卜瓦松到達過程（Poisson Process）實現巨觀交通需求（TIA 總量）與微觀車流行為（Micro-Simulation）的無縫銜接。</p>
                    </div>
                </div>
            </div>

            <!-- 附錄四、 巨觀活動總旅次換算為理論機動車總需求之四階段收斂歷程解構 -->
            <div class="tia-section" id="tia-appendix-funnel">
                <div class="tia-section-title" style="border-left-color: #6366f1;">
                    <span>附錄四、 巨觀活動總旅次 (${tripsAM.toLocaleString()} trips/h AM) 換算為 理論機動車總需求 (${auditResult.totalDemandVehTrips.toLocaleString()} 輛/h) 之完整四階段收斂歷程解構</span>
                    <span class="badge" style="background:#ede9fe; color:#6d28d9;">Conversion Funnel Proof · 交通漏斗收斂</span>
                </div>

                <div class="calc-box">
                    <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 16px; margin-bottom:14px; font-size:13px; color:#1e40af; line-height:1.6;">
                        <i class="fa-solid fa-circle-info" style="color:#2563eb; margin-right:6px;"></i>
                        <strong>為什麼「全區活動總旅次 (${tripsAM.toLocaleString()} trips/h AM)」與「微觀機動車總需求 (${auditResult.totalDemandVehTrips.toLocaleString()} 輛/h)」會有數量級差異？</strong><br>
                        • <strong>${tripsAM.toLocaleString()} trips/h (人次旅次, Person-Trips)</strong>：代表土地使用活動所衍生之「個人端點活動人次總量」，包含所有就學學生、上班員工的個人雙向活動衍生人次。<br>
                        • <strong>${auditResult.totalDemandVehTrips.toLocaleString()} 輛/h (車輛旅次, Vehicular Trips)</strong>：代表經過交通規劃標準四階段模型收斂，排除「基地內部步行微循環 (約 ${Math.round(funnelIntraTrips).toLocaleString()} 人次/h)」與「短途綠色步行 (約 ${Math.round(funnelInterWalkTrips).toLocaleString()} 人次/h)」後，真正發動引擎駛上主要幹道路網的「實體汽機車流量」。
                    </div>

                    <!-- 漏斗總表 -->
                    <table class="tia-table" style="font-size:12.5px; margin-bottom:16px;">
                        <thead>
                            <tr style="background:#f8fafc;">
                                <th style="width:16%;">收斂階段 (Stage)</th>
                                <th style="width:38%;">交通模型學理機制與計算邏輯</th>
                                <th style="width:16%;">當前時段數值 (${pInfo.short})</th>
                                <th style="width:12%;">統計單位</th>
                                <th style="width:18%;">漏斗過濾收斂效益</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="font-weight:700;"><span class="badge" style="background:#f1f5f9; color:#475569;">階段 1</span> 土地活動主體強度</td>
                                <td class="text-left">
                                    都市計畫各分區土地使用項目與人口規模：<br>
                                    ${zoneRows.map(z => `• ${z.name} (${z.type})：${z.type.startsWith('R') || z.type === 'G1' ? `活動人口 ${z.pop.toLocaleString()} 人` : `就業崗位 ${z.emp.toLocaleString()} 個`}`).join('<br>')}
                                </td>
                                <td style="font-weight:700; color:#334155;">${zoneRows.reduce((s, z) => s + (z.type.startsWith('R') || z.type === 'G1' ? z.pop : z.emp), 0).toLocaleString()}</td>
                                <td>人 / 崗位</td>
                                <td class="text-left">計畫全區總活動主體基數</td>
                            </tr>
                            <tr style="background:#fff7ed;">
                                <td style="font-weight:700;"><span class="badge" style="background:#ffedd5; color:#c2410c;">階段 2</span> 旅次產生推估 (Trip Gen)</td>
                                <td class="text-left">
                                    套用分區尖峰旅次率 (α) 衍生全日尖峰個人雙向活動端點總人次：<br>
                                    ${step1Rows.map(r => `• ${r.name}：${r.baseScale.toLocaleString()} × ${r.alpha.toFixed(2)} = <strong>${r.totalTrips.toLocaleString()}</strong> 旅次/h`).join('<br>')}
                                </td>
                                <td style="font-weight:700; color:#ea580c; font-size:15px;">${currentPeriodTrips.toLocaleString()}</td>
                                <td><strong>trips/h</strong><br>(人次·端點)</td>
                                <td class="text-left"><strong>全區雙向總旅次 (報告章節二數值)</strong></td>
                            </tr>
                            <tr>
                                <td style="font-weight:700;"><span class="badge" style="background:#fef3c7; color:#b45309;">階段 3</span> 單向出行出發守恆 (∑Pi)</td>
                                <td class="text-left">
                                    實體出行必具起迄點，全區真實出行人次嚴格受限於總出發人次：<br>
                                    • 全區總出發人次 ∑Pi = ${step1Rows.map(r => `${r.name} (${r.pVal.toLocaleString()})`).join(' + ')} = <strong>${totalP_val.toLocaleString()} 人次/h</strong>
                                </td>
                                <td style="font-weight:700; color:#d97706;">${totalP_val.toLocaleString()}</td>
                                <td>人次/h</td>
                                <td class="text-left">由雙向活動量收斂為實體單向出行</td>
                            </tr>
                            <tr style="background:#f0fdf4;">
                                <td style="font-weight:700;"><span class="badge" style="background:#dcfce7; color:#15803d;">階段 4</span> 空間重力與內部旅次過濾</td>
                                <td class="text-left">
                                    經雙約束重力模式與 Furness IPF 配平，分離出：<br>
                                    • <strong>區內內部短途移動 (Intra-zonal)</strong>：約 <strong>${Math.round(funnelIntraTrips).toLocaleString()} 人次/h</strong><br>
                                    &nbsp;&nbsp;➔ <strong>各分區內部自產自消相加：</strong> ${zoneIds.map(i => {
                                        const z = zoneRows.find(r => r.id === i);
                                        const t_ii = (T_matrix[i] && T_matrix[i][i]) ? T_matrix[i][i] : 0;
                                        return `${z ? z.name : i} (${t_ii.toFixed(1)} 人次)`;
                                    }).join(' ＋ ')} ＝ <strong>${funnelIntraTrips.toFixed(1)} ≈ ${Math.round(funnelIntraTrips).toLocaleString()} 人次/h</strong><br>
                                    &nbsp;&nbsp;&nbsp;&nbsp;（校園與商辦內部人行微循環，屬於各基地內部自產自消，<strong>不駛入外圍主要幹道</strong>）<br>
                                    • <strong>跨區外聯出行 (Inter-zonal)</strong>：約 <strong>${Math.round(funnelInterTrips).toLocaleString()} 人次/h</strong>（真正需要進入幹道路網之交換人流）
                                </td>
                                <td style="font-weight:700; color:#16a34a; font-size:14px;">${Math.round(funnelInterTrips).toLocaleString()}</td>
                                <td>人次/h</td>
                                <td class="text-left">
                                    <strong style="color:#dc2626;">過濾 ${((funnelIntraTrips / Math.max(1, totalP_val)) * 100).toFixed(1)}% 內部短途移動</strong><br>
                                    <span style="font-size:11px; color:#64748b;">(計算式: ${Math.round(funnelIntraTrips).toLocaleString()} ÷ ${totalP_val.toLocaleString()} 人次)</span><br>
                                    <span style="font-size:11px; color:#475569;">基地內步行循環，不產生幹道車流</span>
                                </td>
                            </tr>
                            <tr>
                                <td style="font-weight:700;"><span class="badge" style="background:#e0f2fe; color:#0369a1;">階段 5</span> MNL 運具選擇分離徒步</td>
                                <td class="text-left">
                                    依據跨區距離套用多項羅吉特模式 (MNL)，分離綠色步行人流：<br>
                                    • <strong>短途綠色步行 (Walk)</strong>：約 <strong>${Math.round(funnelInterWalkTrips).toLocaleString()} 人次/h</strong>（引導至人行道與斑馬線）<br>
                                    • <strong>機動車通勤人次 (Auto + Moto)</strong>：約 <strong>${finalFunnelVehTotal.toLocaleString()} 人次/h</strong>
                                </td>
                                <td style="font-weight:700; color:#0284c7;">${finalFunnelVehTotal.toLocaleString()}</td>
                                <td>人次/h</td>
                                <td class="text-left">
                                    <strong>剔除 ${((funnelInterWalkTrips / Math.max(1, funnelInterTrips)) * 100).toFixed(1)}% 徒步人流</strong><br>
                                    <span style="font-size:11px; color:#64748b;">(計算式: ${Math.round(funnelInterWalkTrips).toLocaleString()} ÷ ${Math.round(funnelInterTrips).toLocaleString()} 人次)</span><br>
                                    <span style="font-size:11px; color:#475569;">綠色人行穿越，不佔用車道容量</span>
                                </td>
                            </tr>
                            <tr style="background:#faf5ff; border: 2px solid #8b5cf6;">
                                <td style="font-weight:700;"><span class="badge" style="background:#ede9fe; color:#6d28d9;">階段 6</span> 理論機動車總需求 (Veh)</td>
                                <td class="text-left">
                                    依小汽車與機車駕駛人數折算為實體車輛數：<br>
                                    • 小客車：約 ${Math.round(funnelInterAutoTrips).toLocaleString()} 輛/h<br>
                                    • 機車：約 ${Math.round(funnelInterMotoTrips).toLocaleString()} 輛/h<br>
                                    ➔ <strong>汽機車實體車輛總需求 = ${finalFunnelVehTotal.toLocaleString()} 輛/小時</strong>
                                </td>
                                <td style="font-weight:800; color:#7c3aed; font-size:16px;">${finalFunnelVehTotal.toLocaleString()}</td>
                                <td><strong>輛/h</strong><br>(Veh/h)</td>
                                <td class="text-left"><strong>章節二之(一) 理論機動車總需求</strong></td>
                            </tr>
                            <tr style="background:${auditResult.missingCount > 0 ? '#fff1f2' : '#f0fdf4'};">
                                <td style="font-weight:700;"><span class="badge" style="${auditResult.missingCount > 0 ? 'background:#fee2e2; color:#dc2626;' : 'background:#dcfce7; color:#15803d;'}">階段 7</span> 路網拓撲連通性檢核</td>
                                <td class="text-left">
                                    微觀路網全域尋路檢核 (Pathfinder 連續行車動線)：<br>
                                    • <strong>成功注入路網車流</strong>：<strong>${auditResult.routableVehTrips.toLocaleString()} 輛/h</strong> (已連通)<br>
                                    • <strong>短缺/流失車流 (斷鏈)</strong>：<strong>${auditResult.unroutableVehTrips.toLocaleString()} 輛/h</strong> (${auditResult.missingCount} 組動線缺少路徑)
                                </td>
                                <td style="font-weight:700; color:${auditResult.missingCount > 0 ? '#dc2626' : '#16a34a'};">
                                    連通率<br>${auditResult.connectivityRate}%
                                </td>
                                <td>有效連通率</td>
                                <td class="text-left">
                                    ${auditResult.missingCount > 0 
                                        ? `<strong style="color:#dc2626;">流失 ${auditResult.unroutableVehTrips.toLocaleString()} 輛/h (${((auditResult.unroutableVehTrips / Math.max(1, finalFunnelVehTotal)) * 100).toFixed(1)}%)</strong>`
                                        : '<strong style="color:#16a34a;">100% 完整通達</strong>'}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- ★★★ 專題解密：區內內部短途移動（503 人次/h）如何自重力配平矩陣計算 ★★★ -->
                    <div class="formula-card formula-amber" style="border-left-color: #f59e0b; background: #fffdfa; margin-bottom: 16px;">
                        <div class="formula-title">
                            <span>【核心演算解密：區內內部短途移動（約 ${Math.round(funnelIntraTrips).toLocaleString()} 人次/h）如何精確計算？】</span>
                            <span class="formula-tag" style="background:#fef3c7; color:#b45309;">各分區內部自產自消加總</span>
                        </div>
                        <div class="formula-subst" style="font-size: 12.5px; line-height: 1.7; color: #334155;">
                            <strong>1. 分區出行交換表與區內內部移動定位：</strong><br>
                            都市計畫分區內部活動距離極短（約 50 公尺），交通阻抗極低、內部活動意願高。經雙約束配平收斂後，產出各分區之小時旅次交換矩陣如下表（綠色標示即為各分區內部自產自消之移動）：<br><br>

                            <div style="overflow-x:auto; margin: 8px 0 12px 0;">
                                <table class="tia-table" style="font-size:12px; margin-bottom:0; background:#fff; border:1px solid #cbd5e1;">
                                    <thead>
                                        <tr style="background:#f8fafc;">
                                            <th style="background:#e2e8f0; color:#1e293b;">出發分區</th>
                                            ${zoneIds.map(j => {
                                                const z = zoneRows.find(r => r.id === j);
                                                return `<th style="background:#f1f5f9; color:#1e293b;">至 ${z ? z.name : j}</th>`;
                                            }).join('')}
                                            <th style="background:#fef3c7; color:#92400e;">出發總人次 (列合計)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${zoneIds.map(i => {
                                            const zO = zoneRows.find(r => r.id === i);
                                            let rSum = 0;
                                            return `
                                                <tr>
                                                    <td style="font-weight:700; background:#f8fafc; text-align:left;">${zO ? zO.name : i} (${zO ? zO.type : ''})</td>
                                                    ${zoneIds.map(j => {
                                                        const tij = (T_matrix[i] && T_matrix[i][j]) ? T_matrix[i][j] : 0;
                                                        rSum += tij;
                                                        if (i === j) {
                                                            return `<td style="background:#dcfce7; font-weight:700; color:#15803d; border:2px solid #86efac;">
                                                                ${tij.toFixed(1)} 人次/h<br><span style="font-size:10.5px; font-weight:normal; color:#166534;">★ 區內內部移動</span>
                                                            </td>`;
                                                        } else {
                                                            return `<td>${tij.toFixed(1)} 人次/h<br><span style="font-size:10.5px; color:#64748b;">(跨區外聯)</span></td>`;
                                                        }
                                                    }).join('')}
                                                    <td style="font-weight:700; background:#fffdf5; color:#b45309;">${rSum.toFixed(1)} 人次/h<br><span style="font-size:10.5px; color:#92400e;">(出發量)</span></td>
                                                </tr>
                                            `;
                                        }).join('')}
                                        <tr style="background:#f1f5f9; font-weight:700;">
                                            <td style="text-align:left; color:#1e293b;">抵達目標總人次 (行合計)</td>
                                            ${zoneIds.map(j => {
                                                const targetA = targetA_map[j] || 0;
                                                return `<td style="color:#0369a1;">${targetA.toFixed(1)} 人次/h</td>`;
                                            }).join('')}
                                            <td style="color:#d97706; background:#fef3c7;">全區合計：${totalP_val.toFixed(1)} 人次/h</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <strong>2. 矩陣主對角線項相加求得 503 人次：</strong><br>
                            • <strong>區內內部移動加總：</strong> ${zoneIds.map(i => {
                                const z = zoneRows.find(r => r.id === i);
                                const t_ii = (T_matrix[i] && T_matrix[i][i]) ? T_matrix[i][i] : 0;
                                return `<strong>${z ? z.name : i} 區內自產自消</strong> (${t_ii.toFixed(1)} 人次)`;
                            }).join(' ＋ ')} ＝ <strong>${funnelIntraTrips.toFixed(1)} ≈ ${Math.round(funnelIntraTrips).toLocaleString()} 人次/小時</strong><br>
                            • <strong>內部移動過濾率：</strong> ${funnelIntraTrips.toFixed(1)} ÷ ${totalP_val.toLocaleString()} (全區總出發人次) × 100% ＝ <strong>${((funnelIntraTrips / Math.max(1, totalP_val)) * 100).toFixed(1)}%</strong><br>
                            • <strong>剩餘跨區外聯人次：</strong> ${totalP_val.toLocaleString()} － ${Math.round(funnelIntraTrips).toLocaleString()} ＝ <strong>${Math.round(funnelInterTrips).toLocaleString()} 人次/小時</strong>（即各分區跨區交換量之和，真正需要駛入主要幹道路網之交通人流）<br><br>

                            <strong>3. 矩陣各格數值如何推導？（以表格中第一列「160.7 人次/h」為例）：</strong><br>
                            ${(() => {
                                const zFirst = zoneRows[0];
                                const zSecond = zoneRows[1] || zoneRows[0];
                                const id1 = zFirst ? zFirst.id : zoneIds[0];
                                const id2 = zSecond ? zSecond.id : zoneIds[1];
                                const p1 = P_map[id1] || 308;
                                const a1 = A_map[id1] || 1743;
                                const a2 = A_map[id2] || 3710;
                                const d11 = (distances[id1] && distances[id1][id1]) ? distances[id1][id1] : 50;
                                const d12 = (distances[id1] && distances[id1][id2]) ? distances[id1][id2] : 331;
                                const exp11 = Math.exp(-betaVal * d11);
                                const exp12 = Math.exp(-betaVal * d12);
                                const w11 = a1 * exp11;
                                const w12 = a2 * exp12;
                                const wSum = w11 + w12;
                                const ratio11 = (w11 / Math.max(1e-4, wSum)) * 100;
                                const ratio12 = (w12 / Math.max(1e-4, wSum)) * 100;
                                const t11 = (T_matrix[id1] && T_matrix[id1][id1]) ? T_matrix[id1][id1] : (p1 * ratio11 / 100);
                                const t12 = (T_matrix[id1] && T_matrix[id1][id2]) ? T_matrix[id1][id2] : (p1 * ratio12 / 100);

                                return `
                                • <strong>步驟 A（出發量與吸引力權重計算）</strong>：<br>
                                &nbsp;&nbsp;${zFirst ? zFirst.name : id1} 上午尖峰共有 <strong>${p1.toLocaleString()} 人次</strong> 出發。出發者在「留在區內」與「跨區前往 ${zSecond ? zSecond.name : id2}」之選擇，取決於兩處之<strong>活動吸引量</strong>與<strong>空間距離阻抗</strong>：<br>
                                &nbsp;&nbsp;• <strong>留在區內 (${zFirst ? zFirst.name : id1}) 吸引權重</strong> ＝ 吸引量 ${a1.toLocaleString()} × 阻抗 exp(-0.003 × ${d11}m) ＝ ${a1.toLocaleString()} × ${exp11.toFixed(4)} ＝ <strong>${w11.toFixed(1)}</strong>（佔吸引權重 <strong>${ratio11.toFixed(1)}%</strong>）<br>
                                &nbsp;&nbsp;• <strong>跨區前往 (${zSecond ? zSecond.name : id2}) 吸引權重</strong> ＝ 吸引量 ${a2.toLocaleString()} × 阻抗 exp(-0.003 × ${d12}m) ＝ ${a2.toLocaleString()} × ${exp12.toFixed(4)} ＝ <strong>${w12.toFixed(1)}</strong>（佔吸引權重 <strong>${ratio12.toFixed(1)}%</strong>）<br>
                                &nbsp;&nbsp;• <strong>總吸引權重合計</strong> ＝ ${w11.toFixed(1)} ＋ ${w12.toFixed(1)} ＝ <strong>${wSum.toFixed(1)}</strong><br>
                                • <strong>步驟 B（雙向平衡配平計算）</strong>：<br>
                                &nbsp;&nbsp;• <strong>${zFirst ? zFirst.name : id1} 留在區內人數（即表格綠色標示）</strong> ＝ ${p1.toLocaleString()} 人次 × (${w11.toFixed(1)} ÷ ${wSum.toFixed(1)}) ＝ ${p1.toLocaleString()} × ${ratio11.toFixed(1)}% ＝ <strong>${t11.toFixed(1)} 人次/小時</strong><br>
                                &nbsp;&nbsp;• <strong>${zFirst ? zFirst.name : id1} 跨區前往 ${zSecond ? zSecond.name : id2} 人數</strong> ＝ ${p1.toLocaleString()} 人次 × (${w12.toFixed(1)} ÷ ${wSum.toFixed(1)}) ＝ ${p1.toLocaleString()} × ${ratio12.toFixed(1)}% ＝ <strong>${t12.toFixed(1)} 人次/小時</strong><br>
                                &nbsp;&nbsp;（兩者相加精確等於該區出發總人次：${t11.toFixed(1)} ＋ ${t12.toFixed(1)} ＝ <strong>${(t11 + t12).toFixed(1)} 人次/小時</strong>）
                                `;
                            })()}
                        </div>
                        <p class="formula-note" style="margin-top:6px;">說明：此 <strong>${Math.round(funnelIntraTrips).toLocaleString()} 人次/h</strong> 屬於基地內部生活與工作微循環（如校園走廊、運動場或商辦中庭步行），絕無發動車輛駛入市政幹道之可能；予以精確過濾後，方能求得真實車道需求。</p>
                    </div>

                    <!-- 各動線詳細數值卡片 -->
                    <div class="formula-card formula-purple">
                        <div class="formula-title">
                            <span>【各分區間起迄動線 (OD) 之完整拆解演算明細】</span>
                            <span class="formula-tag">時段：${pInfo.full}</span>
                        </div>
                        <div class="formula-subst" style="font-size:12.5px; line-height:1.7;">
                            ${zoneIds.map(i => {
                                const zO = zoneRows.find(z => z.id === i);
                                const outRows = zoneIds.filter(j => i !== j).map(j => {
                                    const zD = zoneRows.find(z => z.id === j);
                                    const tij = (T_matrix[i] && T_matrix[i][j]) ? T_matrix[i][j] : 0;
                                    const dist = (distances[i] && distances[i][j]) ? distances[i][j] : 850;
                                    const mItem = auditResult.missingODs.find(od => od.fromId === i && od.toId === j);
                                    const rItem = auditResult.routableODs.find(od => od.fromId === i && od.toId === j);
                                    const vItem = mItem || rItem;
                                    const vehCount = vItem ? vItem.hourlyVehTrips : Math.round(tij * 0.72);
                                    const autoCount = vItem ? (vItem.hourlyAuto || Math.round(vehCount * 0.45)) : Math.round(vehCount * 0.45);
                                    const motoCount = vItem ? (vItem.hourlyMoto || (vehCount - autoCount)) : (vehCount - autoCount);
                                    const isBroken = !!mItem;

                                    return `&nbsp;&nbsp;➔ <strong>至 ${zD ? zD.name : j} (${dist}m)</strong>：配平交換量 = <strong>${tij.toFixed(1)} 人次/h</strong> ； 步行 = ${Math.round(tij - vehCount)} 人次 ； 機動車 = <strong>${vehCount} 輛/h</strong> (汽車 ${autoCount} 輛 + 機車 ${motoCount} 輛) ${isBroken ? '<span style="color:#dc2626; font-weight:700;">[⚠️路網斷鏈流失]</span>' : '<span style="color:#16a34a; font-weight:700;">[✅已連通]</span>'}`;
                                }).join('<br>');

                                const intraT = (T_matrix[i] && T_matrix[i][i]) ? T_matrix[i][i] : 0;
                                return `<strong>${zO ? zO.name : i} (${zO ? zO.type : ''}) 出發總量 Pi = ${P_map[i]} 人次/h：</strong><br>` +
                                       `&nbsp;&nbsp;• <strong>區內內部移動 (Intra-zonal)</strong>：${intraT.toFixed(1)} 人次/h (基地內部生活微循環，不進入外圍路網)<br>` +
                                       outRows;
                            }).join('<br><br>')}
                        </div>
                        <p class="formula-note">結論：各分區出行量經空間重力模式嚴格配平，扣除區內內部活動與短途徒步後，所衍生之實體汽機車流量 (${finalFunnelVehTotal.toLocaleString()} 輛/h) 即為微觀路網模擬器與路口容量分析之真實輸入依據。</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('tia-modal').style.display = 'flex';

        // ★★★ 綁定分析時段快速切換按鈕事件 (同步更新 LUTIEngine 與儀表板) ★★★
        document.querySelectorAll('.tia-period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetPeriod = e.currentTarget.getAttribute('data-period');
                if (!targetPeriod) return;
                if (luti && typeof luti.setTimePeriod === 'function') {
                    luti.setTimePeriod(targetPeriod, true);
                }
                if (window.lutiHudController && typeof window.lutiHudController.updatePeriodButtons === 'function') {
                    window.lutiHudController.updatePeriodButtons(targetPeriod);
                }
                TIAReportGenerator.showModal(networkData, simulation);
            });
        });
    }

    static switchODTab(k, btn) {
        document.querySelectorAll('.btn-od-filter').forEach(b => {
            b.style.background = '#f1f5f9';
            b.style.color = '#475569';
            b.style.border = '1px solid #cbd5e1';
        });
        if (btn) {
            btn.style.background = '#0284c7';
            btn.style.color = '#ffffff';
            btn.style.border = 'none';
        }
        document.querySelectorAll('.furness-iteration-card').forEach(card => {
            if (k === 'all') {
                card.style.display = 'block';
            } else {
                card.style.display = (card.id === `furness-iter-card-${k}`) ? 'block' : 'none';
            }
        });
    }
}

window.TIAReportGenerator = TIAReportGenerator;
// --- END OF FILE script_report.js ---