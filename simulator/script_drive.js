// --- START OF FILE script_drive.js (Gentle Steering & Coasting) ---

class DriveController {
    constructor(simulation, camera, updateStatsCallback) {
        this.simulation = simulation;
        this.camera = camera;
        this.updateStatsUI = updateStatsCallback;

        this.isActive = false;       
        this.targetVehicleId = null; 
        this.targetVehicle = null;

        // 駕駛狀態
        this.score = 0;
        this.distanceAccumulator = 0;
        this.lastX = 0;
        this.lastY = 0;
        
        // 違規狀態
        this.hasCrashed = false;
        this.hasRunRedLight = false;
        this.redLightCooldown = 0;
        this.crashCooldown = 0;
        
        // 換道冷卻
        this.laneSwitchCooldown = 0;

        // 輸入狀態 (Raw Data 0.0 ~ 1.0)
        this.input = {
            throttle: 0, 
            brake: 0,    
            steer: 0,    // -1.0 ~ 1.0
            startPressed: false
        };

        this.prevStartButtonState = false;
        this.cameraOffset = { x: 0, y: 3.5, z: -8 };

        this.updateHelpText();
    }

    updateHelpText() {
        const hudHint = document.querySelector('.hud-controls-hint');
        if (hudHint) {
            hudHint.innerHTML = `
                <p><span class="btn-icon">START</span> 引擎開關</p>
                <p><span class="btn-icon">L-Stick ↑</span> 加速 <span class="btn-icon">↓</span> 煞車</p>
                <p><span class="btn-icon">L-Stick ↔</span> 轉向 (放開油門保持定速)</p>
            `;
        }
    }

    setTarget(vehicleId) {
        this.targetVehicleId = vehicleId;
        console.log(`[Drive] Target selected: ${vehicleId}. Press START to drive.`);
        this.showHUDMessage("車輛已選定，按 START 啟動引擎", "info");
    }

    reset() {
        this.isActive = false;
        this.targetVehicle = null;
        this.score = 0;
        this.distanceAccumulator = 0;
        this.updateHUD();
    }

    update(dt) {
        this.pollGamepad();

        if (this.input.startPressed) {
            if (this.targetVehicleId && !this.isActive) {
                const v = this.simulation.vehicles.find(v => v.id === this.targetVehicleId);
                if (v) {
                    this.isActive = true;
                    this.targetVehicle = v;
                    this.targetVehicle.isPlayerControlled = true;
                    this.lastX = v.x;
                    this.lastY = v.y;
                    this.showHUDMessage("引擎啟動 - 開始駕駛", "success");
                    if (typeof setViewMode === 'function') setViewMode('3D');
                }
            } else if (this.isActive) {
                this.isActive = false;
                if (this.targetVehicle) {
                    this.targetVehicle.isPlayerControlled = false;
                }
                this.targetVehicle = null;
                this.showHUDMessage("引擎停止 - 自動駕駛接手", "info");
            }
            this.input.startPressed = false; 
        }

        if (!this.isActive || !this.targetVehicle) return;

        if (this.targetVehicle.finished) {
            this.showHUDMessage("行程結束", "info");
            this.reset();
            return;
        }

        if (this.laneSwitchCooldown > 0) this.laneSwitchCooldown -= dt;

        this.applyPhysics(dt);
        this.handleSteeringAndRouting(dt);
        this.checkRules(dt);
        this.updateCamera();
        this.updateHUD();
    }

    pollGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = gamepads[0]; 

        if (!pad) return;

        const deadzone = 0.15; 

        // 轉向
        let steer = pad.axes[0];
        if (Math.abs(steer) < deadzone) steer = 0;

        // 加減速 (Y軸)
        let rawY = pad.axes[1];
        let throttle = 0;
        let brake = 0;

        if (Math.abs(rawY) >= deadzone) {
            if (rawY < 0) {
                throttle = Math.min(1, Math.abs(rawY));
            } else {
                brake = Math.min(1, Math.abs(rawY));
            }
        }

        if (pad.buttons[9].pressed && !this.prevStartButtonState) {
            this.input.startPressed = true;
        }
        this.prevStartButtonState = pad.buttons[9].pressed;

        this.input.steer = steer;
        this.input.brake = brake;
        this.input.throttle = throttle;
    }

    applyPhysics(dt) {
        const v = this.targetVehicle;
        
        // ==========================================
        // [自定義調整] 動力與煞車參數
        // ==========================================
        // baseAccel: 最大加速度 (數值越小，加速越溫和)
        // baseBrake: 最大煞車力道
        // ------------------------------------------
        const baseAccel = v.isMotorcycle ? 5.0 : 4.0; // 原本是 8.0/6.0，已減弱
        const baseBrake = 12.0; 
        
        // friction: 自然滑行阻力
        // ★ 依需求設為 0.0，實現「維持速度」的效果
        const friction = 0.0; 
        // ==========================================

        const throttleForce = Math.pow(this.input.throttle, 2.0); 
        const brakeForce = Math.pow(this.input.brake, 2.0);

        let finalAccel = 0;

        // 油門邏輯
        if (this.input.throttle > 0.01) {
            finalAccel = throttleForce * baseAccel;
        } else {
            // ★ 當沒按油門時，阻力為 0 -> 保持當前速度 (定速巡航)
            finalAccel = -friction;
        }

        // 煞車邏輯 (搖桿向後拉)
        if (this.input.brake > 0.01) {
            finalAccel = -(brakeForce * baseBrake);
        }

        v.accel = finalAccel;

        // 防止倒車
        if (v.speed <= 0 && finalAccel < 0) {
            v.speed = 0;
            v.accel = 0;
        }
    }

    handleSteeringAndRouting(dt) {
        const v = this.targetVehicle;
        const network = this.simulation.network;
        
        if (v.state === 'onLink') {
            const link = network.links[v.currentLinkId];
            if (!link) return;

            const currentLane = link.lanes[v.currentLaneIndex];
            const laneWidth = currentLane ? currentLane.width : 3.5;
            const halfWidth = laneWidth / 2;
            
            // ==========================================
            // [自定義調整] 轉向靈敏度
            // ==========================================
            // baseSensitivity: 數值越小，轉向越慢/越不靈敏
            // 原本是 12.0，這裡大幅減弱至 5.0，讓微調更容易
            // ------------------------------------------
            const baseSensitivity = 5.0; 
            // ==========================================

            const rawSteer = this.input.steer;
            // 三次方曲線 (Cubic) 讓中間區域非常平緩
            const steerCurve = Math.pow(Math.abs(rawSteer), 3.0) * Math.sign(rawSteer);

            const lateralChange = steerCurve * baseSensitivity * speedFactor(v.speed) * dt;
            
            v.targetLateralOffset += lateralChange;
            
            // 漸進式換道
            if (this.laneSwitchCooldown <= 0) {
                if (v.targetLateralOffset > halfWidth) {
                    if (this.attemptSmoothLaneSwitch(v, link, 1, laneWidth)) {
                        this.laneSwitchCooldown = 0.5; 
                    } else {
                        v.targetLateralOffset = halfWidth; 
                    }
                } 
                else if (v.targetLateralOffset < -halfWidth) {
                    if (this.attemptSmoothLaneSwitch(v, link, -1, laneWidth)) {
                        this.laneSwitchCooldown = 0.5;
                    } else {
                        v.targetLateralOffset = -halfWidth;
                    }
                }
            }
        }

        // 路口轉向決策
        const distToEnd = v.currentPathLength - v.distanceOnPath;
        if (v.state === 'onLink' && distToEnd < 60.0) {
            this.overrideRoutingDecision(v);
        }
    }

    attemptSmoothLaneSwitch(v, link, directionSign, laneWidth) {
        const targetIdx = v.currentLaneIndex + directionSign;
        
        if (link.lanes[targetIdx]) {
            v.currentLaneIndex = targetIdx;
            v.currentPath = link.lanes[targetIdx].path;
            v.currentPathLength = link.lanes[targetIdx].length;

            v.lateralOffset -= (directionSign * laneWidth);
            v.targetLateralOffset -= (directionSign * laneWidth);

            v.targetLateralOffset = 0; 
            
            return true;
        }
        return false;
    }

    overrideRoutingDecision(v) {
        const network = this.simulation.network;
        const currentLink = network.links[v.currentLinkId];
        if (!currentLink) return;
        
        const node = network.nodes[currentLink.destination];
        if (!node) return;

        const transitions = node.transitions.filter(t => t.sourceLinkId === v.currentLinkId);
        if (transitions.length === 0) return;

        const options = { left: [], straight: [], right: [] };

        transitions.forEach(t => {
            const outLink = network.links[t.destLinkId];
            if (!outLink) return;
            
            const turnType = this.checkTurnType(network, currentLink, outLink);
            if (turnType === 'left') options.left.push(t.destLinkId);
            else if (turnType === 'right') options.right.push(t.destLinkId);
            else options.straight.push(t.destLinkId);
        });

        let chosenLinkId = null;
        // 增加觸發轉彎的閾值 (需推到底才觸發轉彎)
        const steerThreshold = 0.7; 

        if (this.input.steer < -steerThreshold && options.left.length > 0) {
            chosenLinkId = options.left[0];
            this.showHUDMessage("準備左轉", "info");
        } 
        else if (this.input.steer > steerThreshold && options.right.length > 0) {
            chosenLinkId = options.right[0];
            this.showHUDMessage("準備右轉", "info");
        } 
        else if (options.straight.length > 0) {
            chosenLinkId = options.straight[0];
        } else {
            if (options.left.length > 0) chosenLinkId = options.left[0];
            else if (options.right.length > 0) chosenLinkId = options.right[0];
        }

        if (chosenLinkId) {
            const nextIdx = v.currentLinkIndex + 1;
            if (v.route[nextIdx] !== chosenLinkId) {
                if (v.route.length > nextIdx) {
                    v.route[nextIdx] = chosenLinkId;
                    v.route.length = nextIdx + 1; 
                } else {
                    v.route.push(chosenLinkId);
                }
            }
        }
    }

    checkTurnType(network, linkIn, linkOut) {
        const getAngle = (l, isStart) => {
             const lanes = Object.values(l.lanes);
             if (lanes.length === 0) return 0;
             const path = lanes[0].path;
             if (path.length < 2) return 0;
             const p1 = isStart ? path[0] : path[path.length - 2];
             const p2 = isStart ? path[1] : path[path.length - 1];
             return Math.atan2(p2.y - p1.y, p2.x - p1.x);
        };

        const a1 = getAngle(linkIn, false);
        const a2 = getAngle(linkOut, true);
        let diff = a2 - a1;
        while (diff <= -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        if (diff > 0.2) return 'right';
        if (diff < -0.2) return 'left';
        return 'straight';
    }

    checkRules(dt) {
        const v = this.targetVehicle;
        const network = this.simulation.network;

        const dist = Math.hypot(v.x - this.lastX, v.y - this.lastY);
        if (v.speed > 1.0) {
            this.distanceAccumulator += dist;
            if (this.distanceAccumulator >= 10.0) {
                const points = Math.floor(this.distanceAccumulator / 10.0);
                this.score += points;
                this.distanceAccumulator -= points * 10.0;
            }
        }
        this.lastX = v.x;
        this.lastY = v.y;

        if (this.redLightCooldown > 0) this.redLightCooldown -= dt;

        if (v.state === 'inIntersection' && v.currentTransition && this.redLightCooldown <= 0) {
            const tfl = network.trafficLights.find(t => t.nodeId === network.links[v.currentLinkId]?.destination);
            if (tfl && v.currentTransition.turnGroupId) {
                const signal = tfl.getSignalForTurnGroup(v.currentTransition.turnGroupId);
                if (signal === 'Red' && v.speed > 2.0) { 
                    this.score -= 10;
                    this.showHUDMessage("闖紅燈! -10", "danger");
                    this.redLightCooldown = 5.0;
                }
            }
        }

        if (this.crashCooldown > 0) this.crashCooldown -= dt;
        if (this.crashCooldown <= 0 && v.speed > 1.0) {
            const allVehicles = this.simulation.vehicles;
            let crashed = false;
            for (const other of allVehicles) {
                if (other.id === v.id) continue;
                const d2 = (v.x - other.x)**2 + (v.y - other.y)**2;
                if (d2 < 6.25) { 
                    crashed = true;
                    break;
                }
            }

            if (crashed) {
                this.score -= 5;
                this.showHUDMessage("發生碰撞! -5", "danger");
                this.crashCooldown = 3.0;
                v.speed *= 0.5;
            }
        }
    }

    updateCamera() {
        if (!this.isActive || !this.targetVehicle || !this.camera) return;
        const v = this.targetVehicle;
        const angle = v.angle;
        
        const dynamicDist = 8.0 + (v.speed * 0.1);

        const dirX = Math.cos(angle);
        const dirZ = Math.sin(angle); 

        const targetPos = new THREE.Vector3(
            v.x - dirX * dynamicDist, 
            4.5 + (v.speed * 0.05),
            v.y - dirZ * dynamicDist
        );

        const targetLook = new THREE.Vector3(
            v.x + dirX * 10,
            0.5,
            v.y + dirZ * 10
        );

        this.camera.position.lerp(targetPos, 0.08);
        this.camera.lookAt(targetLook);
    }

    showHUDMessage(text, type) {
        const hudMsg = document.getElementById('drive-hud-message');
        if (hudMsg) {
            hudMsg.textContent = text;
            hudMsg.className = 'hud-message ' + type;
            hudMsg.style.opacity = 1;
            
            if (this.msgTimer) clearTimeout(this.msgTimer);
            this.msgTimer = setTimeout(() => {
                hudMsg.style.opacity = 0;
            }, 3000);
        }
    }

    updateHUD() {
        const hudScore = document.getElementById('drive-hud-score');
        const hudSpeed = document.getElementById('drive-hud-speed');
        
        if (hudScore) hudScore.textContent = `SCORE: ${this.score}`;
        
        if (hudSpeed && this.targetVehicle) {
            const kmh = Math.round(this.targetVehicle.speed * 3.6);
            hudSpeed.textContent = `${kmh} KM/H`;
        }
    }
}

function speedFactor(speed) {
    return Math.max(0.3, 1.0 - (speed / 100.0));
}
