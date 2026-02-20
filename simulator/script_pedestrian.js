// --- START OF FILE script_pedestrian.js ---

const PedestrianManager = {
    textures: {
        redMan: null,
        greenManWalk: null,
        greenManRun: null,
        numbers: {} // 緩存數字紋理 0-99
    },

    // 初始化紋理 (只執行一次)
    init: function () {
        if (this.textures.redMan) return;

        // 1. 繪製小紅人 (站立)
        this.textures.redMan = this.createManTexture('red', false);

        // 2. 繪製小綠人 (走/跑)
        this.textures.greenManWalk = this.createManTexture('green', 'walk');
        this.textures.greenManRun = this.createManTexture('green', 'run');

        // 3. 預先生成數字紋理 (0-99)
        for (let i = 0; i < 100; i++) {
            this.textures.numbers[i] = this.createNumberTexture(i);
        }
    },

    // 輔助：繪製人像 Canvas
    createManTexture: function (color, pose) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // 背景 (黑色底)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 64, 64);

        ctx.fillStyle = color === 'red' ? '#ff3333' : '#33ff33';

        // 簡單繪製人像 (火柴人風格模擬 LED)
        if (color === 'red') {
            // 站立
            ctx.fillRect(28, 10, 8, 8); // 頭
            ctx.fillRect(26, 20, 12, 20); // 身
            ctx.fillRect(26, 42, 4, 18); // 左腳
            ctx.fillRect(34, 42, 4, 18); // 右腳
        } else {
            // 行走/跑步
            ctx.beginPath();
            ctx.arc(32, 14, 5, 0, Math.PI * 2); // 頭
            ctx.fill();

            ctx.lineWidth = 4;
            ctx.strokeStyle = '#33ff33';
            ctx.beginPath();
            // 身體
            ctx.moveTo(32, 20); ctx.lineTo(32, 38);
            // 手腳依姿態變化
            if (pose === 'walk') {
                ctx.moveTo(32, 24); ctx.lineTo(20, 34); // 左手
                ctx.moveTo(32, 24); ctx.lineTo(44, 34); // 右手
                ctx.moveTo(32, 38); ctx.lineTo(24, 54); // 左腳
                ctx.moveTo(32, 38); ctx.lineTo(40, 54); // 右腳
            } else {
                // 跑
                ctx.moveTo(32, 24); ctx.lineTo(18, 20); // 左手擺動
                ctx.moveTo(32, 24); ctx.lineTo(46, 28); // 右手擺動
                ctx.moveTo(32, 38); ctx.lineTo(18, 48); // 左腳大跨
                ctx.moveTo(32, 38); ctx.lineTo(42, 48); // 右腳後踢
            }
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter; // 保持像素感
        return tex;
    },

    // 輔助：繪製數字 Canvas
       // ★★★ [修正]：改為繪製七段顯示器風格的數字 ★★★
    createNumberTexture: function (num) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; 
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // 1. 背景設為全黑 (模擬 LED 滅掉的狀態)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 64, 64);

        // 2. 設定繪圖參數
        // 我們畫白色，這樣材質顏色 (material.color) 設紅或綠時才能正確染色
        ctx.fillStyle = '#ffffff'; 

        // 3. 定義七段顯示器的邏輯
        // 每一段的位置 (x, y, w, h) 相對於單個數字的左上角
        // 假設單個數字寬 22, 高 38, 線條厚度 4
        // 
        //      A
        //    F   B
        //      G
        //    E   C
        //      D
        
        const thickness = 4;
        const width = 20;
        const height = 18; // 上半部與下半部的高度

        // 定義 7 個線段的路徑 (相對於數字原點 ox, oy)
        // 為了美觀，線段之間留 1px 間隙
        const drawSegment = (ox, oy, id) => {
            switch (id) {
                case 0: // A (上)
                    ctx.fillRect(ox + 2, oy, width - 4, thickness);
                    break;
                case 1: // B (右上)
                    ctx.fillRect(ox + width - thickness, oy + 2, thickness, height - 4);
                    break;
                case 2: // C (右下)
                    ctx.fillRect(ox + width - thickness, oy + height + 2, thickness, height - 4);
                    break;
                case 3: // D (下)
                    ctx.fillRect(ox + 2, oy + 2 * height, width - 4, thickness);
                    break;
                case 4: // E (左下)
                    ctx.fillRect(ox, oy + height + 2, thickness, height - 4);
                    break;
                case 5: // F (左上)
                    ctx.fillRect(ox, oy + 2, thickness, height - 4);
                    break;
                case 6: // G (中)
                    ctx.fillRect(ox + 2, oy + height, width - 4, thickness);
                    break;
            }
        };

        // 數字對應的線段開關 (0~9) -> [A, B, C, D, E, F, G]
        const digitMap = [
            [1, 1, 1, 1, 1, 1, 0], // 0
            [0, 1, 1, 0, 0, 0, 0], // 1 (靠右)
            [1, 1, 0, 1, 1, 0, 1], // 2
            [1, 1, 1, 1, 0, 0, 1], // 3
            [0, 1, 1, 0, 0, 1, 1], // 4
            [1, 0, 1, 1, 0, 1, 1], // 5
            [1, 0, 1, 1, 1, 1, 1], // 6
            [1, 1, 1, 0, 0, 0, 0], // 7
            [1, 1, 1, 1, 1, 1, 1], // 8
            [1, 1, 1, 1, 0, 1, 1]  // 9
        ];

        // 繪製單個數字的函式
        const drawDigit = (x, y, digit) => {
            const segments = digitMap[digit];
            segments.forEach((isOn, index) => {
                if (isOn) drawSegment(x, y, index);
            });
        };

        // 4. 計算十位數與個位數
        const tens = Math.floor(num / 10);
        const ones = num % 10;

        // 5. 在畫布上繪製兩個數字
        // 左邊數字位置 (x=8, y=12)
        drawDigit(8, 12, tens);
        // 右邊數字位置 (x=36, y=12)
        drawDigit(36, 12, ones);

        const tex = new THREE.CanvasTexture(canvas);
        // 使用 LinearFilter 讓邊緣稍微柔和一點，比較像發光體，如果不喜歡糊糊的可以用 NearestFilter
        tex.minFilter = THREE.LinearFilter; 
        return tex;
    },
    // 建立行人號誌 3D 物件 (Housing + Top Mesh + Bottom Mesh)
    createMesh: function () {
        // 強制檢查是否已初始化，若無則執行
        if (!this.textures.redMan) {
            this.init();
        }

        const group = new THREE.Group();

        // 1. 燈箱外殼 (寬 2.5, 高 5.0, 深 0.8) - 縮小比例配合場景
        // 假設場景單位 1 = 1公尺，這裡設小一點
        const boxGeo = new THREE.BoxGeometry(1.0, 2.2, 0.5);
        const boxMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const housing = new THREE.Mesh(boxGeo, boxMat);
        group.add(housing);

        // 2. 上方燈面 (人像)
        const planeGeo = new THREE.PlaneGeometry(0.8, 0.8);
        // 預設紅人
        const manMat = new THREE.MeshBasicMaterial({ map: this.textures.redMan, transparent: true });
        const manMesh = new THREE.Mesh(planeGeo, manMat);
        manMesh.position.set(0, 0.55, 0.26); // 稍微突出
        group.add(manMesh);

        // 3. 下方燈面 (數字)
        const numMat = new THREE.MeshBasicMaterial({ map: this.textures.numbers[99], transparent: true, color: 0xff3333 });
        const numMesh = new THREE.Mesh(planeGeo, numMat);
        numMesh.position.set(0, -0.55, 0.26);
        group.add(numMesh);

        // 遮陽板 (Visor) - 簡單的黑色片
        const visorGeo = new THREE.BoxGeometry(0.9, 0.05, 0.4);
        const visorTop = new THREE.Mesh(visorGeo, boxMat);
        visorTop.position.set(0, 1.0, 0.4);
        group.add(visorTop);
        const visorMid = new THREE.Mesh(visorGeo, boxMat);
        visorMid.position.set(0, 0.0, 0.4);
        group.add(visorMid);

        // 儲存參照以便更新
        group.userData = {
            manMesh: manMesh,
            numMesh: numMesh,
            lastSecond: -1 // 用於優化更新頻率
        };

        return group;
    },

    // 核心更新邏輯
    update: function(pedGroup, state, remainingTime, globalTime) {
        if (!pedGroup) return;
        
        const data = pedGroup.userData;

        // 1. 秒數防呆處理
        // 如果 remainingTime 是 undefined 或 NaN，預設為 0
        // 使用 Math.ceil 進位 (例如 9.1秒 顯示 10)
        let seconds = 0;
        if (typeof remainingTime === 'number' && !isNaN(remainingTime)) {
            seconds = Math.max(0, Math.ceil(remainingTime));
        }

        // 限制數字在 0~99 之間 (超過 99 顯示 99)
        const numKey = Math.min(99, seconds);

        // --- 狀態判定與更新 ---
        
        if (state === 'Green') {
            // === 行人綠燈模式 ===
            
            // A. 更新人像動畫 (小綠人)
            // 倒數 > 10秒: 慢走 (每 500ms 切換一幀)
            // 倒數 <= 10秒: 快跑 (每 150ms 切換一幀)
            const isUrgent = seconds <= 10;
            const toggleRate = isUrgent ? 150 : 500; // 毫秒
            
            // 利用全域時間計算當前動畫幀 (0 或 1)
            const frame = Math.floor(globalTime * 1000 / toggleRate) % 2;

            // 切換貼圖：Frame 0 用走路姿態，Frame 1 用跑步姿態，模擬動態
            if (this.textures.greenManWalk && this.textures.greenManRun) {
                data.manMesh.material.map = (frame === 0) ? this.textures.greenManWalk : this.textures.greenManRun;
            }
            
            // 確保顏色正確 (白色疊加貼圖原色)
            data.manMesh.material.color.setHex(0xffffff); 
            data.manMesh.visible = true;

            // B. 更新倒數數字 (綠色)
            // 優化：只有當秒數改變或狀態改變時才更新材質與顏色
            if (data.lastSecond !== seconds || data.lastState !== 'Green') {
                if (this.textures.numbers[numKey]) {
                    data.numMesh.material.map = this.textures.numbers[numKey];
                    // 台灣行人號誌綠燈倒數通常為綠色
                    data.numMesh.material.color.setHex(0x33ff33); 
                }
                data.lastSecond = seconds;
                data.lastState = 'Green';
            }

        } else {
            // === 行人紅燈模式 ===
            
            // A. 顯示小紅人 (靜止)
            if (this.textures.redMan) {
                data.manMesh.material.map = this.textures.redMan;
            }
            data.manMesh.material.color.setHex(0xffffff);
            data.manMesh.visible = true;

            // B. 更新倒數數字 (紅色)
            // 台灣部分號誌紅燈時也會倒數，顏色為紅色
            if (data.lastSecond !== seconds || data.lastState !== 'Red') {
                if (this.textures.numbers[numKey]) {
                    data.numMesh.material.map = this.textures.numbers[numKey];
                    // 紅燈倒數為紅色
                    data.numMesh.material.color.setHex(0xff3333); 
                }
                data.lastSecond = seconds;
                data.lastState = 'Red';
            }
        }
    }
};