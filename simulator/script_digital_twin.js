// --- START OF FILE script_digital_twin.js ---
const DigitalTwinLogic = {
    // 輔助函數：取得 XML 標籤 (兼容有/無 tm: 命名空間)
    getChildNodes: function(parent, tagName) {
        let nodes = parent.getElementsByTagName(tagName);
        if (nodes.length === 0) nodes = parent.getElementsByTagName('tm:' + tagName);
        return Array.from(nodes);
    },

    // 1. 解析 AdvancedScheduling 標籤
    parseAdvancedScheduling: function(networkEl) {
        const advEls = this.getChildNodes(networkEl, 'AdvancedScheduling');
        if (advEls.length === 0) return null;
        
        const advEl = advEls[0];
        if (advEl.getAttribute('enabled') !== 'true') return null;

        const config = {
            schedules: {},
            dailyPlans: {},
            weekly: {}
        };

        // A. 讀取 Schedules
        const scheduleDefs = this.getChildNodes(advEl, 'ScheduleDef');
        scheduleDefs.forEach(schedEl => {
            const id = schedEl.getAttribute('id');
            const timeShift = parseFloat(schedEl.getAttribute('timeShift')) || 0;
            const phases = [];
            let cycleDuration = 0;

            const phaseEls = this.getChildNodes(schedEl, 'Phase');
            phaseEls.forEach(phaseEl => {
                const duration = parseFloat(phaseEl.getAttribute('duration'));
                const signals = [];
                const signalEls = this.getChildNodes(phaseEl, 'Signal');
                
                signalEls.forEach(sigEl => {
                    signals.push({
                        groupId: sigEl.getAttribute('groupId'),
                        state: sigEl.getAttribute('state') // Green, Red, Yellow
                    });
                });
                phases.push({ duration, signals });
                cycleDuration += duration;
            });

            config.schedules[id] = { id, timeShift, phases, cycleDuration };
        });

        // B. 讀取 DailyPlans
        const planEls = this.getChildNodes(advEl, 'Plan');
        planEls.forEach(planEl => {
            const id = planEl.getAttribute('id');
            const timeSwitches = [];
            
            const switchEls = this.getChildNodes(planEl, 'TimeSwitch');
            switchEls.forEach(swEl => {
                const timeStr = swEl.getAttribute('time'); // "HH:MM"
                const parts = timeStr.split(':');
                const startSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
                timeSwitches.push({
                    startSeconds: startSeconds,
                    scheduleId: swEl.getAttribute('scheduleId')
                });
            });

            // 確保按時間順序排序
            timeSwitches.sort((a, b) => a.startSeconds - b.startSeconds);
            config.dailyPlans[id] = timeSwitches;
        });

        // C. 讀取 WeeklyAssignment
        const dayEls = this.getChildNodes(advEl, 'Day');
        dayEls.forEach(dayEl => {
            const dayOfWeek = parseInt(dayEl.getAttribute('dayOfWeek'), 10);
            config.weekly[dayOfWeek] = dayEl.getAttribute('planId');
        });

        return config;
    },

    // 2. 依據真實時間計算當前號誌狀態
    updateTrafficLight: function(advConfig, allGroupIds) {
        const now = new Date();
        // JS getDay(): 0(Sun) - 6(Sat). 轉換為 1(Mon) - 7(Sun) 以符合常規 XML 設定
        let dayOfWeek = now.getDay(); 
        dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek; 

        // 當日 00:00:00 起算的秒數
        const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;

        // 預設全部紅燈
        let newStates = {};
        allGroupIds.forEach(gid => newStates[gid] = 'Red');

        if (!advConfig) return newStates;

        // A. 尋找當日對應的 Plan
        const planId = advConfig.weekly[dayOfWeek];
        if (!planId || !advConfig.dailyPlans[planId]) return newStates;
        
        const plan = advConfig.dailyPlans[planId];
        let activeScheduleId = plan[0].scheduleId; // 預設拿第一個

        // B. 尋找當下時間對應的 Schedule
        for (let i = 0; i < plan.length; i++) {
            if (currentSeconds >= plan[i].startSeconds) {
                activeScheduleId = plan[i].scheduleId;
            }
        }

        const sched = advConfig.schedules[activeScheduleId];
        if (!sched || sched.cycleDuration <= 0) return newStates;

        // C. 計算相位 (Phase)
        const effectiveTime = currentSeconds - sched.timeShift;
        let timeInCycle = ((effectiveTime % sched.cycleDuration) + sched.cycleDuration) % sched.cycleDuration;

        for (const phase of sched.phases) {
            if (timeInCycle < phase.duration) {
                // 將該相位的綠燈/黃燈寫入
                for (const sig of phase.signals) {
                    newStates[sig.groupId] = sig.state;
                }
                break;
            }
            timeInCycle -= phase.duration;
        }

        return newStates;
    },

    // 3. 格式化數位孿生時間顯示 (HH:MM:SS)
    formatTime: function() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
};
// --- END OF FILE script_digital_twin.js ---