// --- START OF FILE script_pedestrian_sim.js ---

// 常態分佈產生器 (Central Limit Theorem approximation)
function randNormal(min, max) {
    let rand = 0;
    for (let i = 0; i < 6; i += 1) rand += Math.random();
    rand = rand / 6; // 近似 0~1 的常態分佈
    return min + rand * (max - min);
}

class Pedestrian {
    constructor(id, startPoint, endPoint, width, crosswalk, spawner, crossTwice) {
        this.id = id;
        this.spawner = spawner;
        this.network = spawner.network;
        this.crosswalks = [crosswalk]; // 記錄要走的行穿線
        this.currentCrosswalkIndex = 0;
        this.crossTwice = crossTwice;

        // 屬性設定
        this.isMale = Math.random() > 0.5;
        this.height = randNormal(1.4, 1.9); // 140cm ~ 190cm
        this.baseSpeed = Math.random() > 0.2 ? 1.0 : 0.8; // 80% 1.0m/s, 20% 0.8m/s
        this.speed = this.baseSpeed;

        // 橫向偏移 (在行穿線寬度內隨機，避免排成一直線)
        this.lateralOffset = (Math.random() - 0.5) * (width * 0.8);

        // 狀態與幾何
        this.state = 'WAITING'; // WAITING, CROSSING, FINISHED
        this.setupPath(startPoint, endPoint);

        // 3D/2D 渲染資源
        this.mesh = null;
        this.walkCycle = Math.random() * Math.PI * 2; // 動畫相位
    }

    setupPath(p1, p2) {
        // 計算方向與實際起終點 (加上橫向偏移)
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;

        this.startPos = { x: p1.x + nx * this.lateralOffset, y: p1.y + ny * this.lateralOffset };
        this.endPos = { x: p2.x + nx * this.lateralOffset, y: p2.y + ny * this.lateralOffset };

        this.x = this.startPos.x;
        this.y = this.startPos.y;
        this.angle = Math.atan2(dy, dx);
        this.pathLength = len;
        this.distanceTraveled = 0;
    }

    update(dt, tfl, allPedestrians) {
        if (this.state === 'FINISHED') return;

        // 取得當前行穿線綁定的號誌狀態
        const cw = this.crosswalks[this.currentCrosswalkIndex];
        let signal = 'Green'; // 無號誌預設為綠燈
        if (tfl && cw.turnGroupId) {
            signal = tfl.getSignalForTurnGroup(cw.turnGroupId);
        }

        if (this.state === 'WAITING') {
            // ★[修改] 只有正港的綠燈 (Green = 行綠) 才可以起步
            // 避免行人在行閃 (Yellow) 時才開始過馬路
            if (signal === 'Green') {
                this.state = 'CROSSING';
                this.speed = this.baseSpeed;
            }
        }
        else if (this.state === 'CROSSING') {
            // ★ [修改] 走到一半遇到 Yellow(行閃) 或 Red(行停遲閉)，自動加快腳步清道
            if (signal === 'Yellow' || signal === 'Red') {
                this.speed = 1.5;
            } else {
                this.speed = this.baseSpeed;
            }

            // 簡單防碰撞 (同向且橫向偏移接近者，避免穿模)
            let actualSpeed = this.speed;
            for (const other of allPedestrians) {
                if (other.id === this.id || other.state !== 'CROSSING') continue;
                if (other.currentCrosswalkIndex !== this.currentCrosswalkIndex) continue;

                // 若兩者距離很近 (小於 0.6m)，且在正前方
                const distFwd = other.distanceTraveled - this.distanceTraveled;
                const distLat = Math.abs(other.lateralOffset - this.lateralOffset);
                if (distFwd > 0 && distFwd < 0.6 && distLat < 0.4) {
                    actualSpeed = Math.min(actualSpeed, other.speed * 0.9); // 減速跟隨
                }
            }

            // 移動
            this.distanceTraveled += actualSpeed * dt;
            this.walkCycle += actualSpeed * dt * 5.0; // 步伐動畫頻率

            // 抵達對面
            if (this.distanceTraveled >= this.pathLength) {
                this.handleEndOfCrosswalk();
            } else {
                // 更新座標
                const ratio = this.distanceTraveled / this.pathLength;
                this.x = this.startPos.x + (this.endPos.x - this.startPos.x) * ratio;
                this.y = this.startPos.y + (this.endPos.y - this.startPos.y) * ratio;
            }
        }
    }

    handleEndOfCrosswalk() {
        if (this.crossTwice && this.currentCrosswalkIndex === 0) {
            // 尋找第二條行穿線 (需與第一條不同，且端點靠近目前位置)
            const nextCw = this.spawner.findConnectingCrosswalk(this.crosswalks[0], this.x, this.y);
            if (nextCw) {
                this.crosswalks.push(nextCw);
                this.currentCrosswalkIndex = 1;
                this.state = 'WAITING';
                // 設定新路徑 (看從 p1 出發還是 p2 出發)
                const d1 = Math.hypot(this.x - nextCw.p1.x, this.y - nextCw.p1.y);
                const d2 = Math.hypot(this.x - nextCw.p2.x, this.y - nextCw.p2.y);
                if (d1 < d2) this.setupPath(nextCw.p1, nextCw.p2);
                else this.setupPath(nextCw.p2, nextCw.p1);
                return;
            }
        }
        // 沒有二次穿越或找不到，結束
        this.state = 'FINISHED';
    }
}

class PedestrianSimManager {
    constructor(simulation, network) {
        this.simulation = simulation;
        this.network = network;
        this.pedestrians = [];
        this.spawners = [];
        this.pedIdCounter = 0;

        this.initSpawners();

        // 3D 群組
        if (typeof THREE !== 'undefined') {
            this.group3D = new THREE.Group();
            this.group3D.name = "PedestriansGroup";
        }
    }

    initSpawners() {
        for (const nodeId in this.network.nodes) {
            const node = this.network.nodes[nodeId];
            if (node.pedestrianVolume && node.pedestrianVolume > 0) {
                // ★ [修改] 接收封裝好的物件
                const extracted = this.extractCrosswalks(nodeId);
                const crosswalks = extracted.cws;
                const diagonals = extracted.diagonals;

                if (crosswalks.length > 0) {
                    this.spawners.push({
                        nodeId: nodeId,
                        volume: node.pedestrianVolume,
                        interval: 3600 / node.pedestrianVolume,
                        timer: Math.random() * (3600 / node.pedestrianVolume),
                        crossOnceProb: node.crossOnceProb !== undefined ? node.crossOnceProb : 100,
                        crossTwiceProb: node.crossTwiceProb || 0,
                        crosswalks: crosswalks,
                        diagonals: diagonals, // ★ 儲存對角線以供使用

                        findConnectingCrosswalk: (currentCw, x, y) => {
                            for (const cw of crosswalks) {
                                if (cw.id === currentCw.id) continue;
                                const d1 = Math.hypot(x - cw.p1.x, y - cw.p1.y);
                                const d2 = Math.hypot(x - cw.p2.x, y - cw.p2.y);
                                if (d1 < 10 || d2 < 10) return cw;
                            }
                            return null;
                        }
                    });
                }
            }
        }
    }

    extractCrosswalks(nodeId) {
        const cws = [];
        const diagonals = []; // ★ 新增對角線陣列
        if (!this.network.roadMarkings) return cws;

        this.network.roadMarkings.forEach(mark => {
            if (mark.type === 'crosswalk') {
                let belongsToNode = (mark.nodeId === nodeId);
                if (!belongsToNode && mark.linkId) {
                    const link = this.network.links[mark.linkId];
                    if (link && (link.source === nodeId || link.destination === nodeId)) {
                        belongsToNode = true;
                    }
                }

                if (belongsToNode) {
                    const lineData = window.calculateCrosswalkLine ? window.calculateCrosswalkLine(mark, this.network) : null;
                    if (lineData) {
                        let turnGroupId = null;

                        // ★ [新增] 1. 優先使用 XML 中明確綁定的行人號誌群組
                        if (mark.signalGroupId) {
                            turnGroupId = mark.signalGroupId;
                        }
                        // ★ [相容舊版] 2. 若未綁定，使用幾何推算平行的車輛直行號誌
                        else {
                            const cwVecX = lineData.p2.x - lineData.p1.x;
                            const cwVecY = lineData.p2.y - lineData.p1.y;
                            const node = this.network.nodes[nodeId];
                            if (node && node.transitions) {
                                for (const t of node.transitions) {
                                    if (t.sourceLinkId !== t.destLinkId && t.turnGroupId) {
                                        const srcL = this.network.links[t.sourceLinkId];
                                        const dstL = this.network.links[t.destLinkId];
                                        if (srcL && dstL) {
                                            const srcPath = srcL.lanes[t.sourceLaneIndex || 0]?.path;
                                            const dstPath = dstL.lanes[t.destLaneIndex || 0]?.path;
                                            if (srcPath && dstPath && srcPath.length > 0 && dstPath.length > 0) {
                                                const pSrc = srcPath[srcPath.length - 1];
                                                const pDst = dstPath[0];
                                                const dx = pDst.x - pSrc.x;
                                                const dy = pDst.y - pSrc.y;
                                                const len = Math.hypot(dx, dy);
                                                if (len > 0.1) {
                                                    const dot = (cwVecX * dx + cwVecY * dy) / (Math.hypot(cwVecX, cwVecY) * len);
                                                    if (Math.abs(dot) > 0.8) { turnGroupId = t.turnGroupId; break; }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        cws.push({ id: mark.id, p1: lineData.p1, p2: lineData.p2, width: lineData.width, turnGroupId: turnGroupId });
                    }
                }
            }
            // ★★★ [新增] 讀取對角線資料給行人使用 ★★★
            else if (mark.type === 'diagonal_crosswalk' && mark.nodeId === nodeId) {
                // 將角落對分，形成兩條 4m 寬的 X 型虛擬通道
                diagonals.push({
                    id: mark.id + '_1',
                    p1: mark.corners[0],
                    p2: mark.corners[2],
                    width: 4.0, // ★ 通道總寬 4m
                    turnGroupId: mark.signalGroupId
                });
                diagonals.push({
                    id: mark.id + '_2',
                    p1: mark.corners[1],
                    p2: mark.corners[3],
                    width: 4.0, // ★ 通道總寬 4m
                    turnGroupId: mark.signalGroupId
                });
            }
        });
        return { cws, diagonals }; // 回傳物件
    }

    update(dt) {
        // 1. 處理生成
        this.spawners.forEach(sp => {
            sp.timer += dt;
            if (sp.timer >= sp.interval) {
                sp.timer -= sp.interval;
                
                const rand = Math.random() * 100;
                let crossTwice = rand > sp.crossOnceProb && rand <= (sp.crossOnceProb + sp.crossTwiceProb);

                let cw;
                // ★★★ 需求 4: 模擬行人動畫時，讓需走兩次行穿線的行人，才改走對角線 ★★★
                if (crossTwice && sp.diagonals && sp.diagonals.length > 0) {
                    // 若這路口有對角線，且被分配要走兩次，則直接分配對角線
                    cw = sp.diagonals[Math.floor(Math.random() * sp.diagonals.length)];
                    // 因為對角線一次就穿越完了，所以關閉 crossTwice 的兩段式尋路邏輯
                    crossTwice = false; 
                } else {
                    // 若無對角線，或只需走一次，就走一般斑馬線
                    cw = sp.crosswalks[Math.floor(Math.random() * sp.crosswalks.length)];
                }

                // 決定過馬路方向 (50% 機率 p1->p2 或 p2->p1)
                const startP = Math.random() > 0.5 ? cw.p1 : cw.p2;
                const endP = startP === cw.p1 ? cw.p2 : cw.p1;

                const ped = new Pedestrian(`ped_${this.pedIdCounter++}`, startP, endP, cw.width, cw, sp, crossTwice);
                this.pedestrians.push(ped);
            }
        });

        // 2. 處理移動與狀態
        this.pedestrians.forEach(ped => {
            // 【修復關鍵】：crosswalk 裡面沒有 spawner 屬性，
            // 應直接讀取行人身上綁定的 ped.spawner.nodeId 來獲取對應的號誌。
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === ped.spawner.nodeId);

            ped.update(dt, tfl, this.pedestrians);
            this.update3DMesh(ped); // 更新 3D
        });

        // 3. 清理已完成的行人
        this.pedestrians = this.pedestrians.filter(ped => {
            if (ped.state === 'FINISHED') {
                if (ped.mesh && this.group3D) this.group3D.remove(ped.mesh);
                return false;
            }
            return true;
        });
    }

    draw2D(ctx, worldToScreen2D, scale) {
        ctx.save();
        this.pedestrians.forEach(ped => {
            const pos = worldToScreen2D(ped.x, ped.y);
            ctx.beginPath();
            // 直接使用真實世界單位大小 (例如半徑 0.4 公尺)
            ctx.arc(pos.x, pos.y, 0.4, 0, Math.PI * 2);
            ctx.fillStyle = ped.isMale ? '#3b82f6' : '#ec4899'; // 男藍女粉
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            // 線條寬度依據畫布縮放做反比，使其保持細緻
            ctx.lineWidth = 1 / scale;
            ctx.stroke();
        });
        ctx.restore();
    }

    // --- 簡單的 3D 生成與動畫 ---
    // --- 簡單的 3D 生成與動畫 ---
    update3DMesh(ped) {
        if (!this.group3D) return;

        if (!ped.mesh) {
            ped.mesh = new THREE.Group();

            // 基礎顏色
            const shirtColor = ped.isMale ? 0x3b82f6 : 0xec4899;
            const pantsColor = 0x1e293b;
            const skinColor = 0xfcbda1;

            const matShirt = new THREE.MeshLambertMaterial({ color: shirtColor });
            const matPants = new THREE.MeshLambertMaterial({ color: pantsColor });
            const matSkin = new THREE.MeshLambertMaterial({ color: skinColor });

            // 比例參數 (依據身高動態調整)
            const scaleH = ped.height / 1.7; // 以 1.7m 為基準

            // 將行人正面建構朝向 +X 軸 (與車輛一致)
            // 身體 (Torso) - 寬度在 Z 軸(0.4)，厚度在 X 軸(0.25)
            const bodyGeo = new THREE.BoxGeometry(0.25, 0.6 * scaleH, 0.4);
            const body = new THREE.Mesh(bodyGeo, matShirt);
            body.position.y = 0.9 * scaleH;
            body.castShadow = true;
            ped.mesh.add(body);

            // 頭 (Head)
            const headGeo = new THREE.BoxGeometry(0.22, 0.22 * scaleH, 0.22);
            const head = new THREE.Mesh(headGeo, matSkin);
            head.position.y = 1.3 * scaleH;
            head.castShadow = true;
            ped.mesh.add(head);

            // 雙腳 (Legs) - 寬度在 Z，厚度在 X
            const legGeo = new THREE.BoxGeometry(0.15, 0.6 * scaleH, 0.15);
            // 調整幾何體中心點到頂部 (髖關節)，方便沿 Z 軸旋轉擺動
            legGeo.translate(0, -0.3 * scaleH, 0);

            // 左腳 (-Z 側)
            const legL = new THREE.Mesh(legGeo, matPants);
            legL.position.set(0, 0.6 * scaleH, -0.1);
            legL.castShadow = true;
            ped.mesh.legL = legL;
            ped.mesh.add(legL);

            // 右腳 (+Z 側)
            const legR = new THREE.Mesh(legGeo, matPants);
            legR.position.set(0, 0.6 * scaleH, 0.1);
            legR.castShadow = true;
            ped.mesh.legR = legR;
            ped.mesh.add(legR);

            // 雙臂 (Arms)
            const armGeo = new THREE.BoxGeometry(0.12, 0.5 * scaleH, 0.12);
            // 調整幾何體中心點到肩膀
            armGeo.translate(0, -0.25 * scaleH, 0);

            // 左手 (-Z 側)
            const armL = new THREE.Mesh(armGeo, matSkin);
            armL.position.set(0, 1.15 * scaleH, -0.26);
            armL.castShadow = true;
            ped.mesh.armL = armL;
            ped.mesh.add(armL);

            // 右手 (+Z 側)
            const armR = new THREE.Mesh(armGeo, matSkin);
            armR.position.set(0, 1.15 * scaleH, 0.26);
            armR.castShadow = true;
            ped.mesh.armR = armR;
            ped.mesh.add(armR);

            this.group3D.add(ped.mesh);
        }

        // 更新座標與旋轉 (直接使用與車輛完全相同的旋轉公式，無須額外補償)
        ped.mesh.position.set(ped.x, 0, ped.y);
        ped.mesh.rotation.y = -ped.angle;

        // 更新步行動畫 (沿 Z 軸旋轉以產生前後擺動)
        if (ped.state === 'CROSSING') {
            const swing = Math.sin(ped.walkCycle) * 0.5; // 擺動幅度
            ped.mesh.legL.rotation.z = swing;
            ped.mesh.legR.rotation.z = -swing;
            // 手臂與腳反向擺動 (符合人類走路習慣)
            ped.mesh.armL.rotation.z = -swing;
            ped.mesh.armR.rotation.z = swing;
        } else {
            // 站立不動
            ped.mesh.legL.rotation.z = 0;
            ped.mesh.legR.rotation.z = 0;
            ped.mesh.armL.rotation.z = 0;
            ped.mesh.armR.rotation.z = 0;
        }
    }
}

// 暴露給全域
window.PedestrianManagerSim = PedestrianSimManager;

// --- END OF FILE script_pedestrian_sim.js ---