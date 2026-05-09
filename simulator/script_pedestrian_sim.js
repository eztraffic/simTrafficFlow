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
        this.crosswalks = [crosswalk];
        this.currentCrosswalkIndex = 0;
        this.crossTwice = crossTwice;

        // 屬性設定
        this.isMale = Math.random() > 0.5;
        this.height = randNormal(1.4, 1.9);
        this.baseSpeed = Math.random() > 0.2 ? 1.2 : 0.9; // 稍微提升步速
        this.speed = this.baseSpeed;

        this.lateralOffset = (Math.random() - 0.5) * (width * 0.8);

        // 狀態與幾何
        this.state = 'WAITING'; // WAITING, CROSSING, WAITING_AT_ISLAND, FINISHED
        this.setupPath(startPoint, endPoint);

        // ★★★ 修正：只有當該斑馬線具備植栽庇護島，且非對角線時，才允許中途停留 ★★★
        this.hasRefuge = crosswalk.hasRefuge && !crosswalk.isDiagonal;
        this.midPoint = this.pathLength / 2;

        this.mesh = null;
        this.walkCycle = Math.random() * Math.PI * 2;
    }

    setupPath(p1, p2) {
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

    // ★ 接收 simTime 參數以便計算剩餘秒數
    update(dt, tfl, allPedestrians, simTime) {
        if (this.state === 'FINISHED') return;

        const cw = this.crosswalks[this.currentCrosswalkIndex];
        let signal = 'Green';
        let remainingTime = 999; // 預設充裕時間

        if (tfl && cw.turnGroupId) {
            // 獲取基礎燈號
            let baseSignal = tfl.getSignalForTurnGroup(cw.turnGroupId);
            // 獲取剩餘時間 (如果有實作此函數)
            remainingTime = tfl.getPedestrianRemainingTime ? tfl.getPedestrianRemainingTime(simTime, cw.turnGroupId) : 999;

            // ★ 如果幾何推算判定這是一組「衝突車流」，則進行燈號反轉
            if (cw.invertSignal) {
                if (baseSignal === 'Red') {
                    signal = 'Green';
                } else if (baseSignal === 'Yellow') {
                    signal = 'Red'; // 車流黃燈時，行人視同紅燈禁止起步
                } else {
                    signal = 'Red';
                }
            } else {
                signal = baseSignal;
            }
        }

        if (this.state === 'WAITING') {
            if (signal === 'Green') {
                this.state = 'CROSSING';
                this.speed = this.baseSpeed;
            }
        }
        else if (this.state === 'WAITING_AT_ISLAND') {
            // ★ 行人在庇護島等待，直到下一次變成綠燈
            if (signal === 'Green') {
                this.state = 'CROSSING';
                this.speed = this.baseSpeed;
            }
        }
        else if (this.state === 'CROSSING') {
            // ★★★ 計算目標點：預設是走到對面 (pathLength) ★★★
            let targetDistance = this.pathLength;

            // 判斷是否需要停在中央庇護島
            if (this.hasRefuge && this.distanceTraveled < this.midPoint) {
                // 計算若要走到「對面」，需要的時間
                const distToTarget = this.pathLength - this.distanceTraveled;
                const timeNeeded = distToTarget / this.baseSpeed;

                // 如果剩餘秒數不夠，或者已經是黃/紅燈了，把目標設為中央庇護島
                if (timeNeeded > remainingTime || signal === 'Yellow' || signal === 'Red') {
                    targetDistance = this.midPoint;
                }
            }

            // 依據號誌與目標調整步伐
            // 如果目標是對面，且燈號快結束了，加速跑完；若目標只是庇護島則維持原速
            if (targetDistance === this.pathLength && (signal === 'Yellow' || signal === 'Red')) {
                this.speed = 1.8; // 加速跑起來
            } else {
                this.speed = this.baseSpeed;
            }

            // 簡單防碰撞
            let actualSpeed = this.speed;
            for (const other of allPedestrians) {
                if (other.id === this.id || other.state !== 'CROSSING') continue;
                if (other.currentCrosswalkIndex !== this.currentCrosswalkIndex) continue;
                const distFwd = other.distanceTraveled - this.distanceTraveled;
                const distLat = Math.abs(other.lateralOffset - this.lateralOffset);
                if (distFwd > 0 && distFwd < 0.6 && distLat < 0.4) {
                    actualSpeed = Math.min(actualSpeed, other.speed * 0.9);
                }
            }

            // 移動
            this.distanceTraveled += actualSpeed * dt;
            this.walkCycle += actualSpeed * dt * 5.0;

            // ★★★ 抵達檢測 ★★★
            if (targetDistance === this.midPoint && this.distanceTraveled >= this.midPoint) {
                // 剛好走到中央庇護島
                this.distanceTraveled = this.midPoint; // 釘在庇護島上
                this.state = 'WAITING_AT_ISLAND';      // 切換狀態等待
            }
            else if (this.distanceTraveled >= this.pathLength) {
                // 走完全程
                this.handleEndOfCrosswalk();
            }

            // 更新座標 (如果還沒抵達終點)
            if (this.state !== 'FINISHED') {
                const ratio = this.distanceTraveled / this.pathLength;
                this.x = this.startPos.x + (this.endPos.x - this.startPos.x) * ratio;
                this.y = this.startPos.y + (this.endPos.y - this.startPos.y) * ratio;
            }
        }
    }

    handleEndOfCrosswalk() {
        if (this.crossTwice && this.currentCrosswalkIndex === 0) {
            const nextCw = this.spawner.findConnectingCrosswalk(this.crosswalks[0], this.x, this.y);
            if (nextCw) {
                this.crosswalks.push(nextCw);
                this.currentCrosswalkIndex = 1;
                this.state = 'WAITING';
                const d1 = Math.hypot(this.x - nextCw.p1.x, this.y - nextCw.p1.y);
                const d2 = Math.hypot(this.x - nextCw.p2.x, this.y - nextCw.p2.y);
                if (d1 < d2) this.setupPath(nextCw.p1, nextCw.p2);
                else this.setupPath(nextCw.p2, nextCw.p1);
                return;
            }
        }
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
        if (!this.network.roadMarkings) return { cws, diagonals };

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
                        let invertSignal = false; // ★ 修正：將變數提早到最外層宣告，解決 ReferenceError

                        // 1. 優先使用 XML 中明確綁定的行人號誌群組
                        if (mark.signalGroupId) {
                            turnGroupId = mark.signalGroupId;
                        }
                        // 2. 若未綁定，使用幾何推算平行的車輛號誌
                        else {
                            let cwVecX = lineData.p2.x - lineData.p1.x;
                            let cwVecY = lineData.p2.y - lineData.p1.y;
                            if (lineData.roadAngle !== undefined) {
                                cwVecX = -Math.sin(lineData.roadAngle);
                                cwVecY = Math.cos(lineData.roadAngle);
                            }
                            const cwLen = Math.hypot(cwVecX, cwVecY);
                            if (cwLen > 0) { cwVecX /= cwLen; cwVecY /= cwLen; }

                            const node = this.network.nodes[nodeId];
                            let bestType = -1; // 紀錄最佳匹配權重

                            if (node && node.transitions) {
                                for (const t of node.transitions) {
                                    if (t.sourceLinkId !== t.destLinkId && t.turnGroupId) {
                                        const srcL = this.network.links[t.sourceLinkId];
                                        const dstL = this.network.links[t.destLinkId];
                                        if (srcL && dstL) {
                                            const getRobustAngle = (lane, isEnd) => {
                                                if (!lane || !lane.path || lane.path.length < 2) return 0;
                                                const path = lane.path;
                                                let p1, p2;
                                                if (isEnd) {
                                                    p1 = path[Math.max(0, path.length - 5)];
                                                    p2 = path[path.length - 1];
                                                } else {
                                                    p1 = path[0];
                                                    p2 = path[Math.min(path.length - 1, 4)];
                                                }
                                                return Math.atan2(p2.y - p1.y, p2.x - p1.x);
                                            };

                                            const inAngle = getRobustAngle(srcL.lanes[t.sourceLaneIndex || 0], true);
                                            const outAngle = getRobustAngle(dstL.lanes[t.destLaneIndex || 0], false);

                                            let diff = Math.abs(outAngle - inAngle);
                                            while (diff > Math.PI) diff -= Math.PI * 2;
                                            diff = Math.abs(diff);

                                            const vX = Math.cos(inAngle);
                                            const vY = Math.sin(inAngle);
                                            // dot 接近 1 代表平行，接近 0 代表垂直
                                            const dot = Math.abs(cwVecX * vX + cwVecY * vY);

                                            // 權重 3：最優先尋找平行且直行的伴隨車流
                                            if (diff < 0.8 && dot > 0.85) {
                                                if (bestType < 3) {
                                                    bestType = 3;
                                                    turnGroupId = t.turnGroupId;
                                                    invertSignal = false;
                                                }
                                            }
                                            // 權重 2：退而尋找平行的轉彎車流
                                            else if (dot > 0.85) {
                                                if (bestType < 2) {
                                                    bestType = 2;
                                                    turnGroupId = t.turnGroupId;
                                                    invertSignal = false;
                                                }
                                            }
                                            // 權重 1：尋找位於同一道路的衝突車流，採用反轉燈號 (專治T型/特殊路口)
                                            else if (dot < 0.5 && (t.sourceLinkId == mark.linkId || t.destLinkId == mark.linkId)) {
                                                if (bestType < 1) {
                                                    bestType = 1;
                                                    turnGroupId = t.turnGroupId;
                                                    invertSignal = true; 
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // 新增：判斷此斑馬線是否有植栽庇護島
                        let hasRefuge = false;
                        if (mark.spanToLinkId && this.network.medians) {
                            const median = this.network.medians.find(m =>
                                (m.l1Id === mark.linkId && m.l2Id === mark.spanToLinkId) ||
                                (m.l1Id === mark.spanToLinkId && m.l2Id === mark.linkId)
                            );
                            if (median && median.gapWidth > 1.2) {
                                hasRefuge = true;
                            }
                        }

                        cws.push({
                            id: mark.id,
                            p1: lineData.p1,
                            p2: lineData.p2,
                            width: lineData.width,
                            turnGroupId: turnGroupId,
                            invertSignal: invertSignal, // ★ 這裡現在可以正確讀取到變數了
                            isDiagonal: false,
                            hasRefuge: hasRefuge
                        });
                    }
                }
            }
            // 讀取對角線資料給行人使用
            else if (mark.type === 'diagonal_crosswalk' && mark.nodeId === nodeId) {
                // ★ 標記這是對角線行穿線 (isDiagonal: true)
                diagonals.push({
                    id: mark.id + '_1',
                    p1: mark.corners[0],
                    p2: mark.corners[2],
                    width: 4.0,
                    turnGroupId: mark.signalGroupId,
                    isDiagonal: true
                });
                diagonals.push({
                    id: mark.id + '_2',
                    p1: mark.corners[1],
                    p2: mark.corners[3],
                    width: 4.0,
                    turnGroupId: mark.signalGroupId,
                    isDiagonal: true
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
                if (crossTwice && sp.diagonals && sp.diagonals.length > 0) {
                    cw = sp.diagonals[Math.floor(Math.random() * sp.diagonals.length)];
                    crossTwice = false;
                } else {
                    cw = sp.crosswalks[Math.floor(Math.random() * sp.crosswalks.length)];
                }

                const startP = Math.random() > 0.5 ? cw.p1 : cw.p2;
                const endP = startP === cw.p1 ? cw.p2 : cw.p1;

                const ped = new Pedestrian(`ped_${this.pedIdCounter++}`, startP, endP, cw.width, cw, sp, crossTwice);
                this.pedestrians.push(ped);
            }
        });

        // 2. 處理移動與狀態
        this.pedestrians.forEach(ped => {
            const tfl = this.simulation.trafficLights.find(t => t.nodeId === ped.spawner.nodeId);

            // ★ 修改：傳入 this.simulation.time 以供計算剩餘秒數
            ped.update(dt, tfl, this.pedestrians, this.simulation.time);

            this.update3DMesh(ped);
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
    update3DMesh(ped) {
        if (!this.group3D) return;

        if (!ped.mesh) {
            ped.mesh = new THREE.Group();

            // ★★★ 新增這行：為行人模型綁定 ID，讓點擊射線能辨識 ★★★
            ped.mesh.userData.pedestrianId = ped.id;

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