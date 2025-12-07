// --- START OF FILE script02.js ---

document.addEventListener('DOMContentLoaded', () => {
    // --- I18N Setup ---
    const translations = {
        'zh-Hant': {
            appTitle: '路網微觀交通模擬 (2D/3D)',
            selectFileLabel: '選擇路網檔案：',
            viewModeLabel: '3D 模式:',
            btnLoadFirst: '請先載入檔案',
            btnStart: '開始模擬',
            btnPause: '暫停模擬',
            btnResume: '繼續模擬',
            simSpeedLabel: '模擬速度:',
            simTimeLabel: '模擬時間:',
            trafficLightToggle: '路口燈號:',
            pointMeterToggle: '定點偵測器:',
            sectionMeterToggle: '區間偵測器:',
            statsTitle: '統計數據',
            vehicleCountChartTitle: '車輛數 (輛)',
            avgSpeedChartTitle: '平均速度 (km/h)',
            realtimeStatsTitle: '即時數據 (全域)',
            tableHeaderTime: '時間 (s)',
            tableHeaderVehicles: '車輛數',
            tableHeaderAvgSpeed: '平均速度 (km/h)',
            alertParseError: '解析XML檔案時發生錯誤。',
            alertLoadError: '解析模型或載入底圖時發生錯誤。',
            canvasPlaceholder: '請從上方選擇一個 XML 檔案以載入路網',
            chartTimeAxis: '模擬時間 (s)',
            chartVehicleAxis: '車輛數',
            chartSpeedAxis: '平均速度 (km/h)',
            meterChartSpeedAxis: '車速 (km/h)',
            sectionChartSpeedAxis: '平均速率 (km/h)',
            meterTitle: '點偵測器',
            sectionMeterTitle: '區間偵測器',
            laneLabel: '車道',
            allLanesLabel: '不分車道',
            allLanesAvgRateLabel: '不分車道平均速率',
            imageLoadError: '無法載入底圖',
            dragPegmanHint: '拖曳小人至道路以進入街景'
        },
        'en': {
            appTitle: 'simTrafficFlow (2D/3D)',
            selectFileLabel: 'Select Network File:',
            viewModeLabel: '3D Mode:', 
            btnLoadFirst: 'Please Load a File',
            btnStart: 'Start Simulation',
            btnPause: 'Pause Simulation',
            btnResume: 'Resume Simulation',
            simSpeedLabel: 'Sim Speed:',
            simTimeLabel: 'Sim Time:',
            trafficLightToggle: 'Junction Lights:',
            pointMeterToggle: 'Point Detectors:',
            sectionMeterToggle: 'Section Detectors:',
            statsTitle: 'Statistics',
            vehicleCountChartTitle: 'Vehicle Count',
            avgSpeedChartTitle: 'Average Speed (km/h)',
            realtimeStatsTitle: 'Real-time Data (Global)',
            tableHeaderTime: 'Time (s)',
            tableHeaderVehicles: 'Vehicles',
            tableHeaderAvgSpeed: 'Avg. Speed (km/h)',
            alertParseError: 'Error parsing XML file.',
            alertLoadError: 'Error parsing model or loading background image.',
            canvasPlaceholder: 'Please select an XML file above to load the network',
            chartTimeAxis: 'Simulation Time (s)',
            chartVehicleAxis: 'Vehicle Count',
            chartSpeedAxis: 'Average Speed (km/h)',
            meterChartSpeedAxis: 'Speed (km/h)',
            sectionChartSpeedAxis: 'Average Rate (km/h)',
            meterTitle: 'Point Detector',
            sectionMeterTitle: 'Section Detector',
            laneLabel: 'Lane',
            allLanesLabel: 'All Lanes',
            allLanesAvgRateLabel: 'All Lanes Average Rate',
            imageLoadError: 'Could not load background image',
            dragPegmanHint: 'Drag Pegman to road for Street View'
        }
    };

    let currentLang = 'zh-Hant';
    let currentViewMode = '2D'; 

    function setLanguage(lang) {
        currentLang = lang;
        const dict = translations[lang];
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.textContent = dict[key];
        });
        document.title = dict.appTitle;
        updateButtonText();
        initializeCharts();
        if (networkData) {
            setupMeterCharts(networkData.speedMeters);
            setupSectionMeterCharts(networkData.sectionMeters);
            statsData.forEach(data => updateStatsUI(data, true));
        }
        document.getElementById('placeholder-text').textContent = dict.canvasPlaceholder;
        
        const pegman = document.getElementById('pegman-icon');
        if(pegman) pegman.title = dict.dragPegmanHint;
    }

    function updateButtonText() {
        const dict = translations[currentLang];
        if (!simulation) {
            startStopButton.textContent = dict.btnLoadFirst;
        } else if (isRunning) {
            startStopButton.textContent = dict.btnPause;
        } else {
            if (simulation.time > 0) startStopButton.textContent = dict.btnResume;
            else startStopButton.textContent = dict.btnStart;
        }
    }

    // --- DOM Elements ---
    const langSelector = document.getElementById('langSelector');
    const viewModeToggle = document.getElementById('viewModeToggle'); 
    const fileInput = document.getElementById('xmlFileInput');
    const canvasContainer = document.getElementById('canvas-container');
    const placeholderText = document.getElementById('placeholder-text');
    const canvas2D = document.getElementById('networkCanvas');
    const ctx2D = canvas2D.getContext('2d');
    const container3D = document.getElementById('threejs-container');
    const startStopButton = document.getElementById('startStopButton');
    const speedSlider = document.getElementById('speedSlider');
    const speedValueSpan = document.getElementById('speedValue');
    const simTimeSpan = document.getElementById('simulationTime');
    const showPathsToggle = document.getElementById('showPathsToggle');
    const showPointMetersToggle = document.getElementById('showPointMetersToggle');
    const showSectionMetersToggle = document.getElementById('showSectionMetersToggle');
    const statsTableBody = document.getElementById('statsTableBody');
    const vehicleCountChartCanvas = document.getElementById('vehicleCountChart').getContext('2d');
    const avgSpeedChartCanvas = document.getElementById('avgSpeedChart').getContext('2d');
    const meterChartsContainer = document.getElementById('meter-charts-container');
    const sectionMeterChartsContainer = document.getElementById('section-meter-charts-container');

    // --- State Variables ---
    let simulation = null;
    let networkData = null;
    let isRunning = false;
    let lastTimestamp = 0;
    let animationFrameId = null;
    let simulationSpeed = parseInt(speedSlider.value, 10);
    let showTurnPaths = false;
    let showPointMeters = true;
    let showSectionMeters = true;

    // --- 2D View Variables ---
    let scale = 1.0; 
    let panX = 0; 
    let panY = 0;
    let isPanning = false; 
    let panStart = { x: 0, y: 0 };

    // --- 3D View Variables ---
    let scene, camera, renderer, controls;
    let vehicleMeshes = new Map(); 
    let networkGroup = new THREE.Group();
    let debugGroup = new THREE.Group(); 
    let signalPathsGroup = new THREE.Group();
    let trafficLightsGroup = new THREE.Group(); 
    let trafficLightMeshes = []; 

    const LANE_COLORS = ['rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 206, 86)', 'rgb(75, 192, 192)', 'rgb(153, 102, 255)', 'rgb(255, 159, 64)'];

    // --- Statistics Variables ---
    let statsData = [];
    let lastLoggedIntegerTime = -1;
    let vehicleCountChart = null;
    let avgSpeedChart = null;
    let meterCharts = {};
    let sectionMeterCharts = {};

    // --- Pegman (Street View) Variables ---
    let isDraggingPegman = false;
    let pegmanGhost = null;
    let currentHoveredLink = null;
    let lastValidLink = null; 
    let lastValidDropPos = null; 
    
    const PEGMAN_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F5B921" style="width:100%;height:100%;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.5));">
        <circle cx="12" cy="5" r="3"/>
        <path d="M12 9c-2.5 0-5 1.5-5 4v6h3v-4h4v4h3v-6c0-2.5-2.5-4-5-4z"/>
    </svg>`;

    // --- Event Listeners ---
    langSelector.addEventListener('change', (e) => setLanguage(e.target.value));
    
    viewModeToggle.addEventListener('change', (e) => {
        setViewMode(e.target.checked ? '3D' : '2D');
    });

    fileInput.addEventListener('change', handleFileSelect);
    startStopButton.addEventListener('click', toggleSimulation);
    speedSlider.addEventListener('input', (e) => {
        simulationSpeed = parseInt(e.target.value, 10);
        speedValueSpan.textContent = `${simulationSpeed}x`;
    });
    showPathsToggle.addEventListener('change', (e) => {
        showTurnPaths = e.target.checked;
        if(currentViewMode === '2D' && !isRunning) redraw2D();
        if(currentViewMode === '3D') update3DVisibility();
    });
    showPointMetersToggle.addEventListener('change', (e) => {
        showPointMeters = e.target.checked;
        if(currentViewMode === '2D' && !isRunning) redraw2D();
        if(currentViewMode === '3D') update3DVisibility();
    });
    showSectionMetersToggle.addEventListener('change', (e) => {
        showSectionMeters = e.target.checked;
        if(currentViewMode === '2D' && !isRunning) redraw2D();
        if(currentViewMode === '3D') update3DVisibility();
    });

    canvas2D.addEventListener('wheel', handleZoom2D);
    canvas2D.addEventListener('mousedown', handlePanStart2D);
    canvas2D.addEventListener('mousemove', handlePanMove2D);
    canvas2D.addEventListener('mouseup', handlePanEnd2D);
    canvas2D.addEventListener('mouseleave', handlePanEnd2D);
    
    window.addEventListener('resize', onWindowResize);

    // --- Initialization ---
    init3D(); 
    resizeCanvas2D(); 
    createPegmanUI(); 
    setLanguage(currentLang);
    setViewMode('2D'); 
    startStopButton.disabled = true;


    // ===================================================================
    // Pegman & Street View Logic
    // ===================================================================
    function createPegmanUI() {
        const pegman = document.createElement('div');
        pegman.id = 'pegman-icon';
        pegman.style.width = '40px';
        pegman.style.height = '40px';
        pegman.innerHTML = PEGMAN_SVG;
        pegman.style.position = 'absolute';
        pegman.style.bottom = '30px';
        pegman.style.right = '30px';
        pegman.style.cursor = 'grab';
        pegman.style.zIndex = '1000';
        pegman.style.backgroundColor = 'white';
        pegman.style.borderRadius = '4px';
        pegman.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        pegman.style.display = 'none'; 

        canvasContainer.appendChild(pegman);
        pegman.addEventListener('mousedown', startPegmanDrag);
    }

    function startPegmanDrag(e) {
        e.preventDefault();
        if (currentViewMode !== '2D' || !networkData) return;

        isDraggingPegman = true;
        currentHoveredLink = null;
        lastValidLink = null;
        lastValidDropPos = null;
        
        pegmanGhost = document.createElement('div');
        pegmanGhost.style.width = '40px';
        pegmanGhost.style.height = '40px';
        pegmanGhost.innerHTML = PEGMAN_SVG;
        pegmanGhost.style.position = 'fixed';
        pegmanGhost.style.zIndex = '2000';
        pegmanGhost.style.pointerEvents = 'none';
        pegmanGhost.style.left = (e.clientX - 20) + 'px';
        pegmanGhost.style.top = (e.clientY - 35) + 'px';
        pegmanGhost.style.transform = 'rotate(-10deg) scale(1.2)';
        
        document.body.appendChild(pegmanGhost);

        document.addEventListener('mousemove', movePegman);
        document.addEventListener('mouseup', dropPegman);
    }

    function movePegman(e) {
        if (!isDraggingPegman) return;
        pegmanGhost.style.left = (e.clientX - 20) + 'px';
        pegmanGhost.style.top = (e.clientY - 35) + 'px';

        const rect = canvas2D.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldX = (mouseX - panX) / scale;
            const worldY = (mouseY - panY) / scale;

            // Use the "lenient" finding logic
            const hitLink = findLinkAt(worldX, worldY, true); 
            
            if (hitLink) {
                // We are over a link
                if (hitLink !== currentHoveredLink) {
                    currentHoveredLink = hitLink;
                    redraw2D();
                }
                // Update persistent valid state
                lastValidLink = hitLink;
                lastValidDropPos = { x: worldX, y: worldY };
            } else {
                // Not strictly over a link, but we don't clear lastValidLink here
                // Just clear the visual highlight
                if (currentHoveredLink) {
                    currentHoveredLink = null;
                    redraw2D();
                }
            }
        } else {
            if (currentHoveredLink) {
                currentHoveredLink = null;
                redraw2D();
            }
        }
    }

    function dropPegman(e) {
        if (!isDraggingPegman) return;
        isDraggingPegman = false;
        
        if(pegmanGhost && pegmanGhost.parentNode) {
            document.body.removeChild(pegmanGhost);
        }
        pegmanGhost = null;
        document.removeEventListener('mousemove', movePegman);
        document.removeEventListener('mouseup', dropPegman);

        const rect = canvas2D.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - panX) / scale;
        const worldY = (mouseY - panY) / scale;

        // Logic to determine drop:
        // Priority 1: Current active hover
        let targetLink = currentHoveredLink;
        let targetPos = { x: worldX, y: worldY };

        // Priority 2: Fallback checks (Anti-Slip logic)
        // If currentHoveredLink is null (e.g. mouse slipped slightly), 
        // but we had a valid link during this drag, use it.
        if (!targetLink && lastValidLink) {
            // [Improvement] We trust lastValidLink if it exists for this drag session.
            // This prevents the "green but fails" issue by snapping back to the valid road.
            targetLink = lastValidLink;
            if (lastValidDropPos) {
                targetPos = lastValidDropPos;
            }
        }

        // Priority 3: Final fallback (Lenient check at current exact point)
        if (!targetLink) {
            targetLink = findLinkAt(worldX, worldY, true);
        }

        if (targetLink) {
            activateStreetView(targetLink, targetPos.x, targetPos.y);
        }
        
        // Cleanup
        currentHoveredLink = null;
        lastValidLink = null;
        lastValidDropPos = null;
        redraw2D();
    }

    // "lenient" parameter enables distance-based check
    function findLinkAt(x, y, lenient = false) {
        if (!networkData) return null;
        
        function insidePoly(point, vs) {
            let x = point.x, y = point.y;
            let inside = false;
            for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
                let xi = vs[i].x, yi = vs[i].y;
                let xj = vs[j].x, yj = vs[j].y;
                let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        function distToSegment(p, v, w) {
            const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
            if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
            let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
        }
        
        // 1. Precise Check (Polygon)
        for (const linkId in networkData.links) {
            const link = networkData.links[linkId];
            if (link.geometry) {
                for (const geo of link.geometry) {
                    if (geo.points && insidePoly({x: x, y: y}, geo.points)) {
                        return link;
                    }
                }
            }
        }

        // 2. Lenient Check (Distance to Lane Paths)
        if (lenient) {
            const HIT_TOLERANCE = 15.0; // meters tolerance
            for (const linkId in networkData.links) {
                const link = networkData.links[linkId];
                if (link.lanes) {
                    for (const lane of Object.values(link.lanes)) {
                        const path = lane.path;
                        for (let i = 0; i < path.length - 1; i++) {
                            if (distToSegment({x:x, y:y}, path[i], path[i+1]) < HIT_TOLERANCE) {
                                return link;
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

function activateStreetView(link, x, y) {
    // 強制切換到 3D 模式
    viewModeToggle.checked = true;
    setViewMode('3D');
    
    // 等待一小段時間確保 3D 場景已更新
    setTimeout(() => {
        if (!camera || !controls) return;
        
        let angle = 0;
        const lanes = Object.values(link.lanes);
        if (lanes.length > 0 && lanes[0].path.length > 1) {
            const path = lanes[0].path;
            let minDst = Infinity;
            let closestIdx = 0;
            
            // 找到最接近的線段
            for(let i = 0; i < path.length - 1; i++) {
                const p1 = path[i];
                const p2 = path[i+1];
                const cx = (p1.x + p2.x) / 2;
                const cy = (p1.y + p2.y) / 2;
                const dst = Math.hypot(x - cx, y - cy);
                if(dst < minDst) {
                    minDst = dst;
                    closestIdx = i;
                }
            }
            
            const p1 = path[closestIdx];
            const p2 = path[closestIdx + 1];
            angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        }
        
        // 設置街景相機位置（比車輛稍高）
        const cameraHeight = 2.0; // 2 公尺高
        camera.position.set(x, cameraHeight, y);
        
        // 設置視角方向（沿著道路方向）
        const lookDistance = 30.0; // 向前看 30 公尺
        const lookAtX = x + Math.cos(angle) * lookDistance;
        const lookAtZ = y + Math.sin(angle) * lookDistance;
        
        // 重置控制目標
        controls.target.set(lookAtX, cameraHeight, lookAtZ);
        controls.update();
        
        // 更新場景以立即看到變化
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }, 50); // 50ms 延遲確保 3D 場景已初始化
}
    // ===================================================================
    // View Mode Switching
    // ===================================================================
function setViewMode(mode) {
    currentViewMode = mode;
    const pegman = document.getElementById('pegman-icon');
    
    if (mode === '2D') {
        canvas2D.style.display = 'block';
        container3D.style.display = 'none';
        if(pegman && networkData) pegman.style.display = 'block'; 
        resizeCanvas2D();
        redraw2D();
    } else {
        canvas2D.style.display = 'none';
        container3D.style.display = 'block';
        if(pegman) pegman.style.display = 'none'; 
        onWindowResize(); 
        
        // 確保 3D 場景立即更新
        setTimeout(() => {
            if (camera && controls && simulation) {
                // 如果已經有模擬，更新車輛位置
                update3DScene();
            } else {
                // 否則渲染空白場景
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }
            }
        }, 10);
    }
}
    // ===================================================================
    // 2D Rendering Logic (With Background Image)
    // ===================================================================
    function resizeCanvas2D() {
        canvas2D.width = canvasContainer.clientWidth;
        canvas2D.height = canvasContainer.clientHeight;
        if (currentViewMode === '2D' && !isRunning) redraw2D();
    }

    function autoCenter2D(bounds) {
        if (bounds.minX === Infinity) return;
        const networkWidth = bounds.maxX - bounds.minX;
        const networkHeight = bounds.maxY - bounds.minY;
        if (canvas2D.width <= 0 || canvas2D.height <= 0) return;
        const scaleX = canvas2D.width / (networkWidth + 100);
        const scaleY = canvas2D.height / (networkHeight + 100);
        scale = Math.min(scaleX, scaleY, 1.5);
        const networkCenterX = bounds.minX + networkWidth / 2;
        const networkCenterY = bounds.minY + networkHeight / 2;
        panX = canvas2D.width / 2 - networkCenterX * scale;
        panY = canvas2D.height / 2 - networkCenterY * scale;
    }

    function handleZoom2D(event) {
        event.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = event.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        const mouseX = event.clientX - canvas2D.offsetLeft;
        const mouseY = event.clientY - canvas2D.offsetTop;
        const worldX = (mouseX - panX) / scale;
        const worldY = (mouseY - panY) / scale;
        scale *= zoom;
        panX = mouseX - worldX * scale;
        panY = mouseY - worldY * scale;
        if (!isRunning) redraw2D();
    }
    function handlePanStart2D(event) { event.preventDefault(); isPanning = true; panStart.x = event.clientX; panStart.y = event.clientY; canvas2D.style.cursor = 'grabbing'; }
    function handlePanMove2D(event) { if (!isPanning) return; event.preventDefault(); const dx = event.clientX - panStart.x; const dy = event.clientY - panStart.y; panX += dx; panY += dy; panStart.x = event.clientX; panStart.y = event.clientY; if (!isRunning) redraw2D(); }
    function handlePanEnd2D() { isPanning = false; canvas2D.style.cursor = 'grab'; }

    function redraw2D() {
        if (currentViewMode !== '2D') return;
        ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
        ctx2D.save();
        ctx2D.translate(panX, panY);
        ctx2D.scale(scale, scale);
        
        if (simulation || networkData) {
            drawNetwork2D(networkData, simulation ? simulation.vehicles : null);
        }
        ctx2D.restore();
    }

    function drawNetwork2D(netData, vehicles) {
        if (!netData) return;
        const vehiclesOnLink = {};
        const vehiclesInIntersection = [];
        if (vehicles) {
            vehicles.forEach(v => {
                if (v.state === 'onLink') {
                    if (!vehiclesOnLink[v.currentLinkId]) vehiclesOnLink[v.currentLinkId] = [];
                    vehiclesOnLink[v.currentLinkId].push(v);
                } else if (v.state === 'inIntersection') vehiclesInIntersection.push(v);
            });
        }

        if (netData.backgroundTiles) {
            ctx2D.save();
            for (const tile of netData.backgroundTiles) {
                if (tile.image) {
                    ctx2D.globalAlpha = tile.opacity;
                    ctx2D.drawImage(tile.image, tile.x, tile.y, tile.width, tile.height);
                }
            }
            ctx2D.restore();
        }

        // Draw Nodes
        if (netData.nodes) {
            Object.values(netData.nodes).forEach(node => {
                if (node.polygon) {
                    ctx2D.fillStyle = '#666666'; 
                    ctx2D.strokeStyle = '#666'; ctx2D.lineWidth = 1 / scale;
                    ctx2D.beginPath();
                    ctx2D.moveTo(node.polygon[0].x, node.polygon[0].y);
                    for (let i = 1; i < node.polygon.length; i++) ctx2D.lineTo(node.polygon[i].x, node.polygon[i].y);
                    ctx2D.closePath(); ctx2D.fill(); ctx2D.stroke();
                }
            });
        }
        
        // Draw Links (Roads)
        Object.values(netData.links).forEach(link => {
            // Apply Highlight Color if this link is being hovered by Pegman
            if (currentHoveredLink && link.id === currentHoveredLink.id) {
                ctx2D.fillStyle = '#32CD32'; // Lime Green Highlight
            } else {
                ctx2D.fillStyle = '#666666';
            }
            
            link.geometry.forEach(geo => {
                ctx2D.strokeStyle = '#666'; ctx2D.lineWidth = 1 / scale;
                ctx2D.beginPath();
                ctx2D.moveTo(geo.points[0].x, geo.points[0].y);
                for (let i = 1; i < geo.points.length; i++) ctx2D.lineTo(geo.points[i].x, geo.points[i].y);
                ctx2D.closePath(); ctx2D.fill(); ctx2D.stroke();
            });
            if (link.dividingLines) {
                ctx2D.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx2D.lineWidth = 0.5 / scale; ctx2D.setLineDash([5 / scale, 7 / scale]);
                link.dividingLines.forEach(line => {
                    if (line.path.length > 1) {
                        ctx2D.beginPath(); ctx2D.moveTo(line.path[0].x, line.path[0].y);
                        for (let i = 1; i < line.path.length; i++) ctx2D.lineTo(line.path[i].x, line.path[i].y);
                        ctx2D.stroke();
                    }
                });
                ctx2D.setLineDash([]);
            }
            if (vehiclesOnLink[link.id]) vehiclesOnLink[link.id].forEach(v => drawVehicle2D(v));
        });

        if (vehiclesInIntersection.length > 0) vehiclesInIntersection.forEach(v => drawVehicle2D(v));

        if (showTurnPaths && simulation) {
            ctx2D.lineWidth = 2 / scale;
            simulation.trafficLights.forEach(tfl => {
                const node = netData.nodes[tfl.nodeId];
                if(node) {
                     node.transitions.forEach(transition => {
                         if(transition.bezier && transition.turnGroupId) {
                             const signal = tfl.getSignalForTurnGroup(transition.turnGroupId);
                             if (signal === 'Red') ctx2D.strokeStyle = 'rgba(255, 0, 0, 0.7)';
                             else if (signal === 'Yellow') ctx2D.strokeStyle = 'rgba(255, 193, 7, 0.9)';
                             else ctx2D.strokeStyle = 'rgba(76, 175, 80, 0.7)';
                             const [p0, p1, p2, p3] = transition.bezier.points;
                             ctx2D.beginPath(); ctx2D.moveTo(p0.x, p0.y);
                             ctx2D.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y); ctx2D.stroke();
                         }
                     });
                }
            });
        }

        if (showPointMeters && netData.speedMeters) {
            netData.speedMeters.forEach(meter => {
                const size = 3.5;
                ctx2D.save(); ctx2D.translate(meter.x, meter.y); ctx2D.rotate(meter.angle);
                ctx2D.fillStyle = 'rgba(239, 122, 50, 0.9)'; ctx2D.beginPath(); 
                ctx2D.moveTo(0, -size * 0.8); ctx2D.lineTo(size, size * 0.8); ctx2D.lineTo(-size, size * 0.8); ctx2D.closePath(); ctx2D.fill();
                ctx2D.restore();
            });
        }
        if (showSectionMeters && netData.sectionMeters) {
             netData.sectionMeters.forEach(meter => {
                const size = 3.0;
                [ {x: meter.startX, y: meter.startY, a: meter.startAngle}, {x: meter.endX, y: meter.endY, a: meter.endAngle} ].forEach(p => {
                    ctx2D.save(); ctx2D.translate(p.x, p.y); ctx2D.rotate(p.a);
                    ctx2D.fillStyle = 'rgba(50, 180, 239, 0.9)'; ctx2D.fillRect(-size/2, -size/2, size, size);
                    ctx2D.restore();
                });
             });
        }
    }

    function drawVehicle2D(v) {
        ctx2D.save(); ctx2D.translate(v.x, v.y); ctx2D.rotate(v.angle);
        ctx2D.fillStyle = 'rgba(10, 238, 254, 1.0)'; ctx2D.strokeStyle = '#FFFFFF'; ctx2D.lineWidth = 0.5 / scale;
        ctx2D.beginPath(); ctx2D.rect(-v.length / 2, -v.width / 2, v.length, v.width);
        ctx2D.fill(); ctx2D.stroke(); ctx2D.restore();
    }


    // ===================================================================
    // 3D Rendering Logic (Three.js) - Optimized to prevent flickering
    // ===================================================================

    function init3D() {
        scene = new THREE.Scene();
        // 1. Sky Blue Background
        const skyColor = 0x87CEEB; 
        scene.background = new THREE.Color(skyColor); 
        scene.fog = new THREE.Fog(skyColor, 200, 5000); 

        camera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 1, 10000);
        camera.position.set(0, 500, 500); 
        camera.up.set(0, 1, 0); 

        // 2. Renderer with Logarithmic Depth Buffer (Crucial for flickering)
        renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        renderer.shadowMap.enabled = true;
        container3D.appendChild(renderer.domElement);

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        
        // 啟用鍵盤監聽，方便筆電使用者平移
        controls.listenToKeyEvents(window); 
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true; 
        controls.keyPanSpeed = 20.0; 

        // 3. Limit rotation (cannot go below ground)
        controls.maxPolarAngle = Math.PI / 2 - 0.05; // Slightly above horizon

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(100, 500, 100);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 5000;
        const d = 2000;
        dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
        // 4. Shadow Bias to prevent shadow acne flickering
        dirLight.shadow.bias = -0.0005; 
        scene.add(dirLight);

        // 5. Ground Plane (Separate distinct layer)
        const groundGeo = new THREE.PlaneGeometry(100000, 100000);
        const groundMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }); 
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2; 
        ground.position.y = -1.0; // Lower the ground significantly
        ground.receiveShadow = true;
        scene.add(ground);

        scene.add(networkGroup);
        scene.add(debugGroup);
        scene.add(signalPathsGroup); 
        scene.add(trafficLightsGroup); // Add traffic light poles group
    }

    function onWindowResize() {
        resizeCanvas2D();
        
        if (camera && renderer) {
            camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
        }
    }

    function to3D(x, y, h = 0) {
        return new THREE.Vector3(x, h, y); 
    }

// Creates a traffic light pole with dual-face support.
    // Returns object containing group and lamp arrays for front and back faces.
    function createTrafficLightPole(position, flowAngle, nodeId, linkIdFront, linkIdBack) {
        const poleHeight = 6.0;
        const armLength = 5.0;
        const housingWidth = 4.0; 
        const housingHeight = 0.8;
        const housingDepth = 0.8;
        
        const group = new THREE.Group();
        group.position.copy(position);

        // --- Orientation Logic ---
        const target = new THREE.Vector3(
            position.x + Math.cos(flowAngle) * 10,
            0,
            position.z + Math.sin(flowAngle) * 10
        );
        group.lookAt(target); 
        group.rotateY(Math.PI);

        // 1. Vertical Pole
        const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, poleHeight, 16);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0xCCCCCC });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = poleHeight / 2;
        pole.castShadow = true;
        group.add(pole);

        // 2. Horizontal Arm (Extends Left / -X)
        const armGeo = new THREE.CylinderGeometry(0.12, 0.10, armLength, 16);
        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.rotation.z = Math.PI / 2; 
        arm.position.set(-armLength / 2, poleHeight - 0.5, 0);
        arm.castShadow = true;
        group.add(arm);

        // 3. Signal Housing (Black Box)
        const boxGeo = new THREE.BoxGeometry(housingWidth, housingHeight, housingDepth);
        const boxMat = new THREE.MeshLambertMaterial({ color: 0x111111 }); 
        const housing = new THREE.Mesh(boxGeo, boxMat);
        housing.position.set(-armLength + 1.0, poleHeight - 0.5, 0); 
        housing.castShadow = true;
        group.add(housing);

        // 4. Lights
        const lampsFront = [];
        const lampsBack = [];
        const lampRadius = 0.25;
        const spacing = 0.7;

        function createArrowShape(type) {
            const shape = new THREE.Shape();
            if (type === 'circle') {
                shape.absarc(0, 0, lampRadius, 0, Math.PI * 2, false);
            } else if (type === 'straight') {
                shape.moveTo(-0.1, -0.15); shape.lineTo(-0.1, 0.05);
                shape.lineTo(-0.2, 0.05); shape.lineTo(0, 0.25);
                shape.lineTo(0.2, 0.05); shape.lineTo(0.1, 0.05);
                shape.lineTo(0.1, -0.15); shape.lineTo(-0.1, -0.15);
            } else if (type === 'left') {
                shape.moveTo(0.15, -0.1); shape.lineTo(-0.05, -0.1); 
                shape.lineTo(-0.05, -0.2); shape.lineTo(-0.25, 0);   
                shape.lineTo(-0.05, 0.2); shape.lineTo(-0.05, 0.1);
                shape.lineTo(0.15, 0.1); shape.lineTo(0.15, -0.1);
            } else if (type === 'right') {
                shape.moveTo(-0.15, -0.1); shape.lineTo(0.05, -0.1);
                shape.lineTo(0.05, -0.2); shape.lineTo(0.25, 0);
                shape.lineTo(0.05, 0.2); shape.lineTo(0.05, 0.1);
                shape.lineTo(-0.15, 0.1); shape.lineTo(-0.15, -0.1);
            }
            return shape;
        }

        const lampConfig = [
            { type: 'circle', color: 0xFF0000, name: 'Red' },     
            { type: 'circle', color: 0xFFCC00, name: 'Yellow' },  
            { type: 'left', color: 0x00FF00, name: 'Left' },    
            { type: 'straight', color: 0x00FF00, name: 'Straight' },
            { type: 'right', color: 0x00FF00, name: 'Right' }     
        ];

        const visorGeo = new THREE.CylinderGeometry(lampRadius + 0.05, lampRadius + 0.05, 0.2, 16, 1, true, 0, Math.PI);
        const visorMat = new THREE.MeshLambertMaterial({ color: 0x000000, side: THREE.DoubleSide });

        lampConfig.forEach((cfg, idx) => {
            const xOffsetFront = (idx - 2) * spacing; 
            const xOffsetBack = -xOffsetFront; // Mirror for back side
            
            const shape = createArrowShape(cfg.type);
            const geo = new THREE.ShapeGeometry(shape);
            
            // --- Front Face ---
            // Fix: Use polygonOffset to prevent Z-fighting at acute angles
            const matFront = new THREE.MeshBasicMaterial({ 
                color: 0x111111, 
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -4, // Pulls the mesh forward in depth buffer
                polygonOffsetUnits: 1
            });
            const meshFront = new THREE.Mesh(geo, matFront);
            // Fix: Increased Z offset slightly from 0.05 to 0.08 for better physical separation
            meshFront.position.set((-armLength + 1.0) + xOffsetFront, poleHeight - 0.5, housingDepth / 2 + 0.08);
            group.add(meshFront);

            const visorFront = new THREE.Mesh(visorGeo, visorMat);
            visorFront.rotation.x = Math.PI / 2; 
            visorFront.rotation.z = -Math.PI / 2; 
            visorFront.position.set((-armLength + 1.0) + xOffsetFront, poleHeight - 0.5, housingDepth / 2 + 0.18);
            group.add(visorFront);
            
            lampsFront.push({ mesh: meshFront, material: matFront, config: cfg });

            // --- Back Face ---
            const matBack = new THREE.MeshBasicMaterial({ 
                color: 0x111111, 
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -4, 
                polygonOffsetUnits: 1
            });
            const meshBack = new THREE.Mesh(geo, matBack);
            meshBack.rotation.y = Math.PI; // Face Back
            // Fix: Increased Z offset (negative)
            meshBack.position.set((-armLength + 1.0) + xOffsetBack, poleHeight - 0.5, -housingDepth / 2 - 0.08);
            group.add(meshBack);

            const visorBack = new THREE.Mesh(visorGeo, visorMat);
            visorBack.rotation.x = Math.PI / 2; 
            visorBack.rotation.z = -Math.PI / 2; 
            visorBack.rotation.y = Math.PI; // Face Back
            visorBack.position.set((-armLength + 1.0) + xOffsetBack, poleHeight - 0.5, -housingDepth / 2 - 0.18);
            group.add(visorBack);

            lampsBack.push({ mesh: meshBack, material: matBack, config: cfg });
        });

        // Store reference for updates with independent link control
        trafficLightMeshes.push({
            nodeId: nodeId,
            linkIdFront: linkIdFront,
            linkIdBack: linkIdBack,
            lampsFront: lampsFront,
            lampsBack: lampsBack
        });

        return group;
    }
    function buildNetwork3D(netData) {
        networkGroup.clear();
        debugGroup.clear();
        signalPathsGroup.clear();
        trafficLightsGroup.clear();
        trafficLightMeshes = [];

        const roadMat = new THREE.MeshLambertMaterial({ color: 0x555555, side: THREE.DoubleSide });
        const junctionMat = new THREE.MeshLambertMaterial({ color: 0x666666, side: THREE.DoubleSide });
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
        const meterMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 });
        const sectionMat = new THREE.MeshBasicMaterial({ color: 0x32b4ef, transparent: true, opacity: 0.5 });

        // Draw Links & Nodes (Same as before)
        Object.values(netData.links).forEach(link => {
            if (link.geometry) {
                link.geometry.forEach(geo => {
                    if (geo.points.length < 3) return;
                    const shape = new THREE.Shape();
                    shape.moveTo(geo.points[0].x, -geo.points[0].y);
                    for (let i = 1; i < geo.points.length; i++) shape.lineTo(geo.points[i].x, -geo.points[i].y);
                    const geom = new THREE.ShapeGeometry(shape);
                    geom.rotateX(-Math.PI / 2); 
                    const mesh = new THREE.Mesh(geom, roadMat);
                    mesh.receiveShadow = true;
                    mesh.position.y = 0.1;
                    networkGroup.add(mesh);
                });
            }
            if (link.dividingLines) {
                link.dividingLines.forEach(line => {
                    if (line.path.length < 2) return;
                    const points = line.path.map(p => to3D(p.x, p.y, 0.25));
                    const geometry = new THREE.BufferGeometry().setFromPoints(points);
                    const lineMesh = new THREE.Line(geometry, lineMat);
                    networkGroup.add(lineMesh);
                });
            }
        });

        Object.values(netData.nodes).forEach(node => {
            if (node.polygon && node.polygon.length >= 3) {
                const shape = new THREE.Shape();
                shape.moveTo(node.polygon[0].x, -node.polygon[0].y);
                for (let i = 1; i < node.polygon.length; i++) shape.lineTo(node.polygon[i].x, -node.polygon[i].y);
                const geom = new THREE.ShapeGeometry(shape);
                geom.rotateX(-Math.PI / 2);
                const mesh = new THREE.Mesh(geom, junctionMat);
                mesh.receiveShadow = true;
                mesh.position.y = 0.2; 
                networkGroup.add(mesh);
            }
            if (node.transitions) {
                node.transitions.forEach(transition => {
                    if (transition.bezier && transition.turnGroupId) {
                        const [p0, p1, p2, p3] = transition.bezier.points;
                        const curve = new THREE.CubicBezierCurve3(to3D(p0.x, p0.y, 0.5), to3D(p1.x, p1.y, 0.5), to3D(p2.x, p2.y, 0.5), to3D(p3.x, p3.y, 0.5));
                        const points = curve.getPoints(20);
                        const geometry = new THREE.BufferGeometry().setFromPoints(points);
                        const material = new THREE.LineBasicMaterial({ color: 0x4caf50, linewidth: 3 }); 
                        const curveLine = new THREE.Line(geometry, material);
                        curveLine.userData = { nodeId: node.id, turnGroupId: transition.turnGroupId };
                        signalPathsGroup.add(curveLine);
                    }
                });
            }
        });

        // --- Generate Traffic Light Poles (Near-Right Only with Dual Link Logic) ---
        if (simulation && simulation.trafficLights) {
            simulation.trafficLights.forEach(tfl => {
                const node = netData.nodes[tfl.nodeId];
                if (!node) return;

                const incomingLinkIds = [];
                Object.values(netData.links).forEach(l => { if (l.destination === node.id) incomingLinkIds.push(l.id); });

                incomingLinkIds.forEach(linkId => {
                    const link = netData.links[linkId];
                    const lanes = Object.values(link.lanes);
                    if (lanes.length === 0) return;
                    const refLane = lanes[Math.floor(lanes.length / 2)];
                    if (refLane.path.length < 2) return;

                    // 1. Determine Position & Angle for Near-Right Pole
                    const pEnd = refLane.path[refLane.path.length - 1];
                    const pPrev = refLane.path[refLane.path.length - 2];
                    const dirX = pEnd.x - pPrev.x;
                    const dirY = pEnd.y - pPrev.y;
                    const len = Math.hypot(dirX, dirY);
                    const nx = dirX / len; 
                    const ny = dirY / len;
                    const angle = Math.atan2(ny, nx);
                    const rx = -ny; const ry = nx;
                    let roadWidth = 0; lanes.forEach(l => roadWidth += l.width);
                    const offset = roadWidth / 2 + 2.0; 
                    const nrX = pEnd.x + rx * offset;
                    const nrY = pEnd.y + ry * offset;
                    const nearRightPos = to3D(nrX, nrY, 0);

                    // 2. Identify Opposite Link (for Back Face Control)
                    let oppositeLinkId = null;
                    const currentAngle = angle;
                    for (const otherId of incomingLinkIds) {
                        if (otherId === linkId) continue;
                        const otherLink = netData.links[otherId];
                        const otherLanes = Object.values(otherLink.lanes);
                        if(otherLanes.length === 0) continue;
                        // Calculate simplified angle for other link
                        const oPath = otherLanes[0].path;
                        if(oPath.length < 2) continue;
                        const oP1 = oPath[oPath.length-2]; const oP2 = oPath[oPath.length-1];
                        const oAngle = Math.atan2(oP2.y - oP1.y, oP2.x - oP1.x);
                        
                        // Check if angles are roughly opposite (PI diff)
                        let diff = Math.abs(currentAngle - oAngle);
                        while(diff > Math.PI) diff -= Math.PI*2;
                        diff = Math.abs(diff);
                        if (Math.abs(diff - Math.PI) < 0.7) { // Tolerance approx 40 deg
                            oppositeLinkId = otherId;
                            break;
                        }
                    }

                    // 3. Create Pole
                    const poleGroup = createTrafficLightPole(nearRightPos, angle, node.id, linkId, oppositeLinkId);
                    trafficLightsGroup.add(poleGroup);
                });
            });
        }

        if (netData.speedMeters) {
            const boxGeo = new THREE.BoxGeometry(2, 6, 2);
            netData.speedMeters.forEach(meter => {
                const mesh = new THREE.Mesh(boxGeo, meterMat);
                mesh.position.set(meter.x, 3, meter.y);
                mesh.name = `meter_point_${meter.id}`;
                debugGroup.add(mesh);
            });
        }
        if (netData.sectionMeters) {
            const boxGeo = new THREE.BoxGeometry(2, 6, 2);
            netData.sectionMeters.forEach(meter => {
                const startMesh = new THREE.Mesh(boxGeo, sectionMat);
                startMesh.position.set(meter.startX, 3, meter.startY);
                startMesh.name = `meter_section_${meter.id}_start`;
                debugGroup.add(startMesh);
                const endMesh = new THREE.Mesh(boxGeo, sectionMat);
                endMesh.position.set(meter.endX, 3, meter.endY);
                endMesh.name = `meter_section_${meter.id}_end`;
                debugGroup.add(endMesh);
            });
        }
        update3DVisibility();
    }

    function update3DVisibility() {
        debugGroup.children.forEach(child => {
            if (child.name.startsWith('meter_point_')) {
                child.visible = showPointMeters;
            } else if (child.name.startsWith('meter_section_')) {
                child.visible = showSectionMeters;
            }
        });
        signalPathsGroup.visible = showTurnPaths;
        trafficLightsGroup.visible = showTurnPaths; 
    }

    function update3DSignals() {
        if (!simulation || !showTurnPaths) return;

        // Update Lines
        signalPathsGroup.children.forEach(line => {
            const { nodeId, turnGroupId } = line.userData;
            const tfl = simulation.trafficLights.find(t => t.nodeId === nodeId);
            if (tfl) {
                const signal = tfl.getSignalForTurnGroup(turnGroupId);
                if (signal === 'Red') line.material.color.setHex(0xff0000); 
                else if (signal === 'Yellow') line.material.color.setHex(0xffc107); 
                else line.material.color.setHex(0x4caf50); 
            }
        });

        // Update Poles (Dual Face Logic)
        if (trafficLightMeshes.length > 0) {
            const updateFace = (linkId, lamps, tfl, node) => {
                if (!linkId) {
                    lamps.forEach(l => l.material.color.setHex(0x111111));
                    return;
                }

                const transitions = node.transitions.filter(t => t.sourceLinkId === linkId && t.turnGroupId);
                const inLink = networkData.links[linkId];
                const inAngle = getLinkAngle(inLink, true);

                let stateLeft = 'Red', stateStraight = 'Red', stateRight = 'Red';
                let hasLeft = false, hasStraight = false, hasRight = false;
                let anyYellow = false;

                transitions.forEach(trans => {
                    const signal = tfl.getSignalForTurnGroup(trans.turnGroupId);
                    
                    // --- 計算轉彎角度 (Revised: Use Curve Angle) ---
                    let turnAngle = 0;
                    if (trans.bezier && trans.bezier.points.length > 0) {
                        const pts = trans.bezier.points;
                        const pStart = pts[0];
                        const pEnd = pts[pts.length - 1];
                        const dx = pEnd.x - pStart.x;
                        const dy = pEnd.y - pStart.y;
                        const curveAngle = Math.atan2(dy, dx);
                        
                        let diff = curveAngle - inAngle;
                        while (diff <= -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        turnAngle = diff;
                    } else {
                        const outLink = networkData.links[trans.destLinkId];
                        const outAngle = getLinkAngle(outLink, false);
                        let diff = outAngle - inAngle;
                        while (diff <= -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        turnAngle = diff;
                    }

                    // --- Logic Corrected for Y-Up Coordinate System ---
                    if (turnAngle > 0.2) { 
                        hasRight = true;
                        if (signal === 'Green') stateRight = 'Green';
                        if (signal === 'Yellow') anyYellow = true;
                    } else if (turnAngle < -0.2) { 
                        hasLeft = true;
                        if (signal === 'Green') stateLeft = 'Green';
                        if (signal === 'Yellow') anyYellow = true;
                    } else { 
                        hasStraight = true;
                        if (signal === 'Green') stateStraight = 'Green';
                        if (signal === 'Yellow') anyYellow = true;
                    }
                });

                // Apply Colors
                lamps.forEach(l => l.material.color.setHex(0x111111)); // Reset

                let showRed = true;
                if (stateStraight === 'Green' || stateLeft === 'Green' || stateRight === 'Green' || anyYellow) showRed = false;
                if (stateStraight !== 'Green' && !anyYellow) showRed = true;
                
                if (showRed) lamps[0].material.color.setHex(lamps[0].config.color);
                if (anyYellow) {
                    lamps[1].material.color.setHex(lamps[1].config.color);
                    lamps[0].material.color.setHex(0x111111);
                }
                if (hasLeft && stateLeft === 'Green') lamps[2].material.color.setHex(lamps[2].config.color);
                if (hasStraight && stateStraight === 'Green') lamps[3].material.color.setHex(lamps[3].config.color);
                if (hasRight && stateRight === 'Green') lamps[4].material.color.setHex(lamps[4].config.color);
            };

            trafficLightMeshes.forEach(poleData => {
                const { nodeId, linkIdFront, linkIdBack, lampsFront, lampsBack } = poleData;
                const tfl = simulation.trafficLights.find(t => t.nodeId === nodeId);
                const node = networkData.nodes[nodeId];
                
                if (tfl && node) {
                    updateFace(linkIdFront, lampsFront, tfl, node);
                    updateFace(linkIdBack, lampsBack, tfl, node);
                }
            });
        }
    }

    function getLinkAngle(link, isEnd) {
        if (!link) return 0;
        const lanes = Object.values(link.lanes);
        if (lanes.length === 0) return 0;
        const path = lanes[0].path;
        if (path.length < 2) return 0;
        let p1, p2;
        if (isEnd) { p1 = path[path.length - 2]; p2 = path[path.length - 1]; } 
        else { p1 = path[0]; p2 = path[1]; }
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }

    function update3DScene() {
        if (!simulation) { renderer.render(scene, camera); return; }
        if (showTurnPaths) update3DSignals();

        const vehicles = simulation.vehicles;
        const activeIds = new Set();
        const vehicleGeo = new THREE.BoxGeometry(1, 1, 1); 
        
        vehicles.forEach(v => {
            activeIds.add(v.id);
            let mesh = vehicleMeshes.get(v.id);
            if (!mesh) {
                const color = new THREE.Color().setHSL(Math.random(), 0.7, 0.5);
                const mat = new THREE.MeshStandardMaterial({ color: color });
                mesh = new THREE.Mesh(vehicleGeo, mat);
                mesh.castShadow = true;
                scene.add(mesh);
                vehicleMeshes.set(v.id, mesh);
            }
            mesh.position.set(v.x, v.width * 0.5 + 0.3, v.y);
            mesh.scale.set(v.length, 1.8, v.width); 
            mesh.rotation.y = -v.angle;
        });

        for (const [id, mesh] of vehicleMeshes) {
            if (!activeIds.has(id)) {
                scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
                vehicleMeshes.delete(id);
            }
        }
        renderer.render(scene, camera);
    }
    
    function autoCenterCamera3D(bounds) {
        if (bounds.minX === Infinity) return;
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const maxDim = Math.max(width, height);
        controls.target.set(centerX, 0, centerY);
        camera.position.set(centerX, maxDim * 0.8, centerY + maxDim * 0.8);
        camera.near = 1;
        camera.far = Math.max(10000, maxDim * 5);
        camera.updateProjectionMatrix();
        controls.update();
    }


    // ===================================================================
    // Main File Handling & Simulation Loop
    // ===================================================================
    function handleFileSelect(event) {
        stopSimulation();
        const file = event.target.files[0];
        if (!file) return;

        resetStatistics();
        placeholderText.style.display = 'none';

        const reader = new FileReader();
        reader.onload = (e) => {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "application/xml");
            if (xmlDoc.getElementsByTagName("parsererror").length) {
                alert(translations[currentLang].alertParseError);
                return;
            }

            parseTrafficModel(xmlDoc).then(netData => {
                networkData = netData;
                simulation = new Simulation(networkData);
                
                autoCenter2D(networkData.bounds);
                buildNetwork3D(networkData);
                autoCenterCamera3D(networkData.bounds);

                setupMeterCharts(networkData.speedMeters);
                setupSectionMeterCharts(networkData.sectionMeters);

                startStopButton.disabled = false;
                simTimeSpan.textContent = "0.00";
                updateButtonText();
                
                if(currentViewMode === '2D') redraw2D();
                else update3DScene();
                
                // Show Pegman if in 2D mode
                const pegman = document.getElementById('pegman-icon');
                if(pegman && currentViewMode === '2D') pegman.style.display = 'block';

                updateStatistics(0);
                lastLoggedIntegerTime = 0;

            }).catch(error => {
                console.error("Error parsing model:", error);
                alert(translations[currentLang].alertLoadError);
            });
        };
        reader.readAsText(file);
    }

    function toggleSimulation() {
        if (!simulation) return;
        isRunning = !isRunning;
        if (isRunning) {
            lastTimestamp = performance.now();
            requestAnimationFrame(simulationLoop);
        }
        updateButtonText();
    }

    function stopSimulation() {
        isRunning = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        simulation = null;
        networkData = null;
        
        vehicleMeshes.forEach(mesh => scene.remove(mesh));
        vehicleMeshes.clear();
        networkGroup.clear();
        debugGroup.clear();
        signalPathsGroup.clear();
        trafficLightsGroup.clear(); // Clear poles
        renderer.render(scene, camera);
        
        ctx2D.clearRect(0, 0, canvas2D.width, canvas2D.height);
        
        placeholderText.style.display = 'block';
        
        // Hide Pegman
        const pegman = document.getElementById('pegman-icon');
        if(pegman) pegman.style.display = 'none';

        updateButtonText();
    }

    function simulationLoop(timestamp) {
        animationFrameId = requestAnimationFrame(simulationLoop);
        
        if(currentViewMode === '3D') {
            controls.update();
        }

        if (isRunning && simulation) {
            const realDt = (timestamp - lastTimestamp) / 1000.0;
            const simulationDt = Math.min(realDt, 0.1) * simulationSpeed; 

            simulation.update(simulationDt);
            simTimeSpan.textContent = simulation.time.toFixed(2);

            const currentIntegerTime = Math.floor(simulation.time);
            if (currentIntegerTime > lastLoggedIntegerTime) {
                updateStatistics(currentIntegerTime);
                lastLoggedIntegerTime = currentIntegerTime;
            }
        }
        
        lastTimestamp = timestamp;
        
        if(currentViewMode === '2D') {
            if(isRunning) redraw2D(); 
        } else {
            update3DScene(); 
        }
    }

    // ===================================================================
    // Simulation Classes & Logic (Unchanged)
    // ===================================================================
    const Geom = {
        Vec: { add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }), sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }), scale: (v, s) => ({ x: v.x * s, y: v.y * s }), dist: (v1, v2) => Math.hypot(v1.x - v2.x, v1.y - v2.y), len: (v) => Math.hypot(v.x, v.y), normalize: (v) => { const l = Geom.Vec.len(v); return l > 0 ? Geom.Vec.scale(v, 1 / l) : { x: 0, y: 0 }; }, normal: (v) => ({ x: -v.y, y: v.x }), angle: (v) => Math.atan2(v.y, v.x), },
        Bezier: { getPoint(t, p0, p1, p2, p3) { const cX = 3 * (p1.x - p0.x); const bX = 3 * (p2.x - p1.x) - cX; const aX = p3.x - p0.x - cX - bX; const cY = 3 * (p1.y - p0.y); const bY = 3 * (p2.y - p1.y) - cY; const aY = p3.y - p0.y - cY - bY; const x = aX * t ** 3 + bX * t ** 2 + cX * t + p0.x; const y = aY * t ** 3 + bY * t ** 2 + cY * t + p0.y; return { x, y }; }, getTangent(t, p0, p1, p2, p3) { const q0 = Geom.Vec.sub(p1, p0); const q1 = Geom.Vec.sub(p2, p1); const q2 = Geom.Vec.sub(p3, p2); const a = Geom.Vec.scale(q0, 3 * (1 - t) ** 2); const b = Geom.Vec.scale(q1, 6 * (1 - t) * t); const c = Geom.Vec.scale(q2, 3 * t ** 2); return Geom.Vec.add(a, Geom.Vec.add(b, c)); }, getLength(p0, p1, p2, p3, steps = 20) { let length = 0; let lastPoint = p0; for (let i = 1; i <= steps; i++) { const t = i / steps; const point = this.getPoint(t, p0, p1, p2, p3); length += Geom.Vec.dist(lastPoint, point); lastPoint = point; } return length; } }
    };

    class Simulation {
        constructor(network) {
            this.network = network;
            this.time = 0;
            this.vehicles = [];
            this.vehicleIdCounter = 0;
            if (network.staticVehicles) {
                for (const staticVehicleConfig of network.staticVehicles) {
                    const { profile, initialState, startLinkId, startLaneIndex, destinationNodeId } = staticVehicleConfig;
                    const startLink = network.links[startLinkId];
                    if (!startLink) continue;
                    const nextNodeId = startLink.destination;
                    const remainingPath = network.pathfinder.findRoute(nextNodeId, destinationNodeId);
                    const route = remainingPath ? [startLinkId, ...remainingPath] : [startLinkId];
                    const vehicle = new Vehicle(`v-static-${this.vehicleIdCounter++}`, profile, route, network, startLaneIndex, initialState);
                    this.vehicles.push(vehicle);
                }
            }
            this.spawners = network.spawners.map(s => new Spawner(s, network.pathfinder));
            this.trafficLights = network.trafficLights;
            this.speedMeters = network.speedMeters.map(m => ({ ...m, readings: {}, maxAvgSpeed: 0 }));
            this.sectionMeters = network.sectionMeters.map(m => ({ ...m, completedVehicles: [], maxAvgSpeed: 0, lastAvgSpeed: null }));
        }
        update(dt) {
            if (dt <= 0) return;
            this.time += dt;
            this.trafficLights.forEach(tfl => tfl.update(this.time));
            this.spawners.forEach(spawner => {
                const newVehicle = spawner.update(dt, this.network, `v-spawned-${this.vehicleIdCounter}`);
                if (newVehicle) { this.vehicles.push(newVehicle); this.vehicleIdCounter++; }
            });
            this.vehicles.forEach(vehicle => vehicle.update(dt, this.vehicles, this));
            this.vehicles = this.vehicles.filter(v => !v.finished);
        }
    }

    class Pathfinder { constructor(links, nodes) { this.adj = new Map(); for (const linkId in links) { const link = links[linkId]; if (!this.adj.has(link.source)) this.adj.set(link.source, []); this.adj.get(link.source).push({ linkId: link.id, toNode: link.destination }); } } findRoute(startNodeId, endNodeId) { if (!startNodeId || !endNodeId) return null; const q = [[startNodeId, []]]; const visited = new Set([startNodeId]); while (q.length > 0) { const [currentNodeId, path] = q.shift(); if (currentNodeId === endNodeId) return path; const neighbors = this.adj.get(currentNodeId) || []; for (const neighbor of neighbors) { if (!visited.has(neighbor.toNode)) { visited.add(neighbor.toNode); const newPath = [...path, neighbor.linkId]; q.push([neighbor.toNode, newPath]); } } } return null; } }
    class TrafficLightController { constructor(config) { this.nodeId = config.nodeId; this.schedule = config.schedule; this.lights = config.lights; this.timeShift = config.timeShift || 0; this.cycleDuration = this.schedule.reduce((sum, p) => sum + p.duration, 0); this.turnGroupStates = {}; } update(time) { if (this.cycleDuration <= 0) return; const effectiveTime = time - this.timeShift; let timeInCycle = ((effectiveTime % this.cycleDuration) + this.cycleDuration) % this.cycleDuration; for (const period of this.schedule) { if (timeInCycle < period.duration) { for (const [turnGroupId, signal] of Object.entries(period.signals)) { this.turnGroupStates[turnGroupId] = signal; } return; } timeInCycle -= period.duration; } } getSignalForTurnGroup(turnGroupId) { return this.turnGroupStates[turnGroupId] || 'Green'; } }
    class Spawner {
        constructor(config, pathfinder) { this.originNodeId = config.originNodeId; this.periods = config.periods || []; this.pathfinder = pathfinder; this.currentPeriodIndex = -1; this.timeInPeriod = 0; this.active = false; this.spawnInterval = Infinity; this.spawnTimer = 0; this.currentConfig = null; this._switchToNextPeriod(); }
        _switchToNextPeriod() { this.currentPeriodIndex++; if (this.currentPeriodIndex >= this.periods.length) { this.active = false; this.currentConfig = null; return; } this.active = true; this.timeInPeriod = 0; this.currentConfig = this.periods[this.currentPeriodIndex]; this.spawnInterval = this.currentConfig.numVehicles > 0 ? this.currentConfig.duration / this.currentConfig.numVehicles : Infinity; this.spawnTimer = this.spawnInterval; }
        update(dt, network, vehicleId) { if (!this.active) return null; this.timeInPeriod += dt; if (this.timeInPeriod > this.currentConfig.duration) { this._switchToNextPeriod(); if (!this.active) return null; return null; } this.spawnTimer += dt; if (this.spawnTimer >= this.spawnInterval) { this.spawnTimer -= this.spawnInterval; const destination = this.chooseWithWeight(this.currentConfig.destinations); const profile = this.chooseWithWeight(this.currentConfig.vehicleProfiles); if (!destination || !profile) return null; const route = this.pathfinder.findRoute(this.originNodeId, destination.destinationNodeId); if (!route || route.length === 0) return null; const startLinkId = route[0]; const startLink = network.links[startLinkId]; let startLaneIndex = 0; if (startLink) { const numLanes = Object.keys(startLink.lanes).length; if (numLanes > 0) { startLaneIndex = Math.floor(Math.random() * numLanes); } } return new Vehicle(vehicleId, profile, route, network, startLaneIndex); } return null; }
        chooseWithWeight(items) { if (!items || items.length === 0) return null; const totalWeight = items.reduce((sum, item) => sum + item.weight, 0); if (totalWeight <= 0) return items[0]; let random = Math.random() * totalWeight; for (const item of items) { random -= item.weight; if (random <= 0) return item; } return items[items.length - 1]; }
    }
    class Vehicle {
        constructor(id, profile, route, network, startLaneIndex = 0, initialState = null) {
            this.id = id;
            this.length = profile.length;
            this.width = profile.width;
            this.originalMaxSpeed = profile.params.maxSpeed;
            this.maxSpeed = profile.params.maxSpeed;
            this.maxAccel = profile.params.maxAcceleration;
            this.comfortDecel = profile.params.comfortDeceleration;
            this.minGap = profile.params.minDistance;
            this.headwayTime = profile.params.desiredHeadwayTime;
            this.delta = 4;
            this.accel = 0;
            this.route = route;
            this.currentLinkIndex = 0;
            this.currentLinkId = route[0];
            this.currentLaneIndex = startLaneIndex;
            this.x = 0; this.y = 0; this.angle = 0;
            this.finished = false;
            this.state = 'onLink';
            this.currentPath = null;
            this.currentPathLength = 0;
            this.currentTransition = null;
            this.nextSignIndex = 0;
            this.speed = initialState ? initialState.speed : 0;
            this.distanceOnPath = initialState ? initialState.distanceOnPath : 0;
            this.sectionEntryData = {};
            this.laneChangeState = null;
            this.laneChangeGoal = null;
            this.laneChangeCooldown = 0;
            this.initializePosition(network);
        }
        initializePosition(network) { const link = network.links[this.currentLinkId]; if (!link) { this.finished = true; return; } this.nextSignIndex = 0; const lane = link.lanes[this.currentLaneIndex]; if (!lane || lane.path.length === 0) { this.finished = true; return; } this.currentPath = lane.path; this.currentPathLength = lane.length; this.updateDrawingPosition(network); }
        checkRoadSigns(network) { const link = network.links[this.currentLinkId]; if (!link.roadSigns || this.nextSignIndex >= link.roadSigns.length) { return; } while (this.nextSignIndex < link.roadSigns.length && this.distanceOnPath >= link.roadSigns[this.nextSignIndex].position) { const sign = link.roadSigns[this.nextSignIndex]; if (sign.type === 'limit') { this.maxSpeed = sign.limit; } else if (sign.type === 'no_limit') { this.maxSpeed = this.originalMaxSpeed; } this.nextSignIndex++; } }
        update(dt, allVehicles, simulation) {
            if (this.finished) return;
            const network = simulation.network;
            const oldDistanceOnPath = this.distanceOnPath;
            if(this.laneChangeCooldown > 0) { this.laneChangeCooldown -= dt; }
            if (this.state === 'onLink') { this.manageLaneChangeProcess(dt, network, allVehicles); }
            if (this.state === 'onLink') { this.checkRoadSigns(network); }
            const { leader, gap } = this.findLeader(allVehicles, network);
            const s_star = this.minGap + Math.max(0, this.speed * this.headwayTime + (this.speed * (this.speed - (leader ? leader.speed : 0))) / (2 * Math.sqrt(this.maxAccel * this.comfortDecel)));
            this.accel = this.maxAccel * (1 - Math.pow(this.speed / this.maxSpeed, this.delta) - Math.pow(s_star / gap, 2));
            this.speed += this.accel * dt;
            if (this.speed < 0) this.speed = 0;
            const isStuckAtEnd = gap <= 0.1 && (this.currentPathLength - this.distanceOnPath) <= 0.1;
            if (isStuckAtEnd) { this.distanceOnPath = this.currentPathLength; this.speed = 0; } else { this.distanceOnPath += this.speed * dt; }
            if (this.state === 'onLink') {
                const metersOnLink = simulation.speedMeters.filter(m => m.linkId === this.currentLinkId);
                metersOnLink.forEach(meter => { if (oldDistanceOnPath < meter.position && this.distanceOnPath >= meter.position) { if (!meter.readings['all']) { meter.readings['all'] = []; } const laneIdx = this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex; if (!meter.readings[laneIdx]) { meter.readings[laneIdx] = []; } meter.readings['all'].push(this.speed); meter.readings[laneIdx].push(this.speed); } });
                const sectionMetersOnLink = simulation.sectionMeters.filter(m => m.linkId === this.currentLinkId);
                sectionMetersOnLink.forEach(meter => { if (!this.sectionEntryData[meter.id] && oldDistanceOnPath < meter.startPosition && this.distanceOnPath >= meter.startPosition) { this.sectionEntryData[meter.id] = { entryTime: simulation.time }; } else if (this.sectionEntryData[meter.id] && oldDistanceOnPath < meter.endPosition && this.distanceOnPath >= meter.endPosition) { const entryTime = this.sectionEntryData[meter.id].entryTime; const travelTime = simulation.time - entryTime; if (travelTime > 0) { const avgSpeedMs = meter.length / travelTime; const avgSpeedKmh = avgSpeedMs * 3.6; meter.completedVehicles.push({ time: simulation.time, speed: avgSpeedKmh }); } delete this.sectionEntryData[meter.id]; } });
            }
            if (this.distanceOnPath > this.currentPathLength) { const leftoverDistance = this.distanceOnPath - this.currentPathLength; this.handlePathTransition(leftoverDistance, network); }
            if (!this.finished) this.updateDrawingPosition(network);
        }
        manageLaneChangeProcess(dt, network, allVehicles) {
            if (this.laneChangeState) { this.laneChangeState.progress += dt / this.laneChangeState.duration; if (this.laneChangeState.progress >= 1) { this.currentLaneIndex = this.laneChangeState.toLaneIndex; this.laneChangeState = null; this.laneChangeCooldown = 5.0; } }
            if (!this.laneChangeGoal) { this.handleMandatoryLaneChangeDecision(network, allVehicles); }
            if (!this.laneChangeGoal && this.laneChangeCooldown <= 0) { this.handleDiscretionaryLaneChangeDecision(network, allVehicles); }
            if (this.laneChangeGoal !== null && !this.laneChangeState) { if (this.currentLaneIndex === this.laneChangeGoal) { this.laneChangeGoal = null; } else { const direction = Math.sign(this.laneChangeGoal - this.currentLaneIndex); const nextLaneIndex = this.currentLaneIndex + direction; const safeToChange = this.isSafeToChange(nextLaneIndex, allVehicles); if (safeToChange) { this.laneChangeState = { progress: 0, fromLaneIndex: this.currentLaneIndex, toLaneIndex: nextLaneIndex, duration: 1.5, }; } } }
        }
        handlePathTransition(leftoverDistance, network) { this.laneChangeState = null; this.laneChangeGoal = null; this.laneChangeCooldown = 0; if (this.state === 'onLink') { const nextLinkIndex = this.currentLinkIndex + 1; if (nextLinkIndex >= this.route.length) { this.finished = true; return; } const currentLink = network.links[this.currentLinkId]; const nextLinkId = this.route[nextLinkIndex]; const destNode = network.nodes[currentLink.destination]; const transition = destNode.transitions.find(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === this.currentLaneIndex && t.destLinkId === nextLinkId); this.currentTransition = transition; if (transition && transition.bezier) { this.state = 'inIntersection'; this.currentPath = transition.bezier.points; this.currentPathLength = transition.bezier.length; this.distanceOnPath = leftoverDistance; } else { this.finished = true; } } else if (this.state === 'inIntersection') { this.switchToNextLink(leftoverDistance, network); } }
        switchToNextLink(leftoverDistance, network) { this.currentLinkIndex++; if (this.currentLinkIndex >= this.route.length) { this.finished = true; return; } this.currentLinkId = this.route[this.currentLinkIndex]; this.currentLaneIndex = this.currentTransition ? this.currentTransition.destLaneIndex : 0; this.currentTransition = null; this.maxSpeed = this.originalMaxSpeed; this.nextSignIndex = 0; const link = network.links[this.currentLinkId]; if (!link || !link.lanes[this.currentLaneIndex]) { this.finished = true; return; } const lane = link.lanes[this.currentLaneIndex]; this.state = 'onLink'; this.currentPath = lane.path; this.currentPathLength = lane.length; this.distanceOnPath = leftoverDistance; }
        findLeader(allVehicles, network) {
             let leader = null;
            let gap = Infinity;
            const distanceToEndOfCurrentPath = this.currentPathLength - this.distanceOnPath;
            for (const other of allVehicles) {
                if (other.id === this.id) continue;
                const isSamePath =
                    (this.state === 'onLink' && other.state === 'onLink' && this.currentLinkId === other.currentLinkId &&
                     (this.laneChangeState ? this.laneChangeState.toLaneIndex : this.currentLaneIndex) ===
                     (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex)) ||
                    (this.state === 'inIntersection' && other.state === 'inIntersection' && this.currentTransition?.id === other.currentTransition?.id);
                if (isSamePath && other.distanceOnPath > this.distanceOnPath) {
                    const currentGap = other.distanceOnPath - this.distanceOnPath - this.length;
                    if (currentGap < gap) {
                        gap = currentGap;
                        leader = other;
                    }
                }
            }
            if (this.state === 'onLink') {
                const nextLinkIdx = this.currentLinkIndex + 1;
                if (nextLinkIdx < this.route.length) {
                    const finalLane = this.laneChangeGoal !== null ? this.laneChangeGoal : this.currentLaneIndex;
                    const myTransition = network.nodes[network.links[this.currentLinkId].destination]?.transitions.find(t =>
                        t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === finalLane && t.destLinkId === this.route[nextLinkIdx]
                    );
                    if (myTransition) {
                        const transitionLength = myTransition.bezier?.length || 0;
                        const targetDestLinkId = myTransition.destLinkId;
                        const targetDestLaneIndex = myTransition.destLaneIndex;
                        for (const other of allVehicles) {
                            if (other.id === this.id) continue;
                            if (other.state === 'inIntersection' && other.currentTransition?.destLinkId === targetDestLinkId && other.currentTransition?.destLaneIndex === targetDestLaneIndex) {
                                 const lookaheadGap = distanceToEndOfCurrentPath + other.distanceOnPath - this.length;
                                 if (lookaheadGap < gap) {
                                     gap = lookaheadGap;
                                     leader = other;
                                 }
                            }
                            else if (other.state === 'onLink' && other.currentLinkId === targetDestLinkId &&
                                    (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex) === targetDestLaneIndex) {
                                 const lookaheadGap = distanceToEndOfCurrentPath + transitionLength + other.distanceOnPath - this.length;
                                 if (lookaheadGap < gap) {
                                     gap = lookaheadGap;
                                     leader = other;
                                 }
                            }
                        }
                    }
                }
            } else if (this.state === 'inIntersection' && this.currentTransition) {
                 const targetDestLinkId = this.currentTransition.destLinkId;
                 const targetDestLaneIndex = this.currentTransition.destLaneIndex;
                 for (const other of allVehicles) {
                     if (other.id === this.id) continue;
                     if (other.state === 'onLink' && other.currentLinkId === targetDestLinkId &&
                         (other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex) === targetDestLaneIndex) {
                         const lookaheadGap = distanceToEndOfCurrentPath + other.distanceOnPath - this.length;
                         if (lookaheadGap < gap) {
                             gap = lookaheadGap;
                             leader = other;
                         }
                     }
                 }
            }
            if (this.state === 'onLink') {
                const checkDistance = Math.max(80, this.speed * 4);
                if (distanceToEndOfCurrentPath < checkDistance) {
                    const nextLinkIndex = this.currentLinkIndex + 1;
                    if (nextLinkIndex < this.route.length) {
                        const currentLink = network.links[this.currentLinkId];
                        const destNodeId = currentLink.destination;
                        const destNode = network.nodes[destNodeId];
                        const finalLaneForTransition = this.laneChangeGoal !== null ? this.laneChangeGoal : this.currentLaneIndex;
                        const transition = destNode.transitions.find(t =>
                            t.sourceLinkId === this.currentLinkId &&
                            t.sourceLaneIndex === finalLaneForTransition &&
                            t.destLinkId === this.route[nextLinkIndex]
                        );
                        let isBlocked = false;
                        if (!transition) {
                            isBlocked = true;
                        } else {
                            const tfl = network.trafficLights.find(t => t.nodeId === destNodeId);
                            if (tfl) {
                                const signal = tfl.getSignalForTurnGroup(transition.turnGroupId);
                                if (signal === 'Red') {
                                    isBlocked = true;
                                }
                                else if (signal === 'Yellow') {
                                    const requiredBrakingDistance = (this.speed * this.speed) / (2 * this.comfortDecel);
                                    if (distanceToEndOfCurrentPath > requiredBrakingDistance) {
                                        isBlocked = true;
                                    }
                                }
                            }
                            if (!isBlocked) {
                                 for (const other of allVehicles) {
                                    if (other.id === this.id || other.state !== 'onLink' || other.currentLinkId !== this.currentLinkId) continue;
                                    const otherNextIdx = other.currentLinkIndex + 1;
                                    if (otherNextIdx >= other.route.length) continue;
                                    const otherFinalLane = other.laneChangeGoal !== null ? other.laneChangeGoal : other.currentLaneIndex;
                                    const otherTransition = destNode.transitions.find(t => t.sourceLinkId === other.currentLinkId && t.sourceLaneIndex === otherFinalLane && t.destLinkId === other.route[otherNextIdx]);
                                    if (otherTransition && otherTransition.destLinkId === transition.destLinkId && otherTransition.destLaneIndex === transition.destLaneIndex) {
                                        if ((other.currentPathLength - other.distanceOnPath) < (this.currentPathLength - this.distanceOnPath)) {
                                            isBlocked = true;
                                            break;
                                        }
                                    }
                                 }
                            }
                        }
                        if (isBlocked && distanceToEndOfCurrentPath < gap) {
                            leader = null;
                            gap = distanceToEndOfCurrentPath;
                        }
                    }
                }
            }
            return { leader, gap: Math.max(0.1, gap) };
        }
        handleMandatoryLaneChangeDecision(network, allVehicles) { if (this.laneChangeGoal !== null) return; const link = network.links[this.currentLinkId]; const lane = link.lanes[this.currentLaneIndex]; if (!lane) return; const distanceToEnd = lane.length - this.distanceOnPath; if (distanceToEnd > 150) return; const nextLinkId = this.route[this.currentLinkIndex + 1]; if (!nextLinkId) return; const destNode = network.nodes[link.destination]; const canPass = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === this.currentLaneIndex && t.destLinkId === nextLinkId); if (canPass) return; const suitableLanes = []; for (const laneIdx in link.lanes) { const targetLane = parseInt(laneIdx, 10); const canPassOnNewLane = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === targetLane && t.destLinkId === nextLinkId); if (canPassOnNewLane) { const { leader } = this.getLaneLeader(targetLane, allVehicles); const density = leader ? leader.distanceOnPath - this.distanceOnPath : Infinity; suitableLanes.push({ laneIndex: targetLane, density }); } } if (suitableLanes.length > 0) { suitableLanes.sort((a, b) => b.density - a.density); this.laneChangeGoal = suitableLanes[0].laneIndex; } }
        handleDiscretionaryLaneChangeDecision(network, allVehicles) { if (this.laneChangeGoal !== null || this.laneChangeState !== null || this.laneChangeCooldown > 0) return; const link = network.links[this.currentLinkId]; const nextLinkId = this.route[this.currentLinkIndex + 1]; if (!nextLinkId) return; const destNode = network.nodes[link.destination]; const { leader: currentLeader } = this.getLaneLeader(this.currentLaneIndex, allVehicles); const adjacentLanes = [this.currentLaneIndex - 1, this.currentLaneIndex + 1]; for (const targetLane of adjacentLanes) { if (!link.lanes[targetLane]) continue; const canPassOnTargetLane = destNode.transitions.some(t => t.sourceLinkId === this.currentLinkId && t.sourceLaneIndex === targetLane && t.destLinkId === nextLinkId); if (!canPassOnTargetLane) continue; const { leader: targetLeader } = this.getLaneLeader(targetLane, allVehicles); const currentGap = currentLeader ? currentLeader.distanceOnPath - this.distanceOnPath : Infinity; const targetGap = targetLeader ? targetLeader.distanceOnPath - this.distanceOnPath : Infinity; const speedAdvantage = targetLeader ? targetLeader.speed - this.speed : 0; const gapAdvantage = targetGap - currentGap; if (gapAdvantage > this.length * 2 && speedAdvantage > 2) { if (this.isSafeToChange(targetLane, allVehicles)) { this.laneChangeGoal = targetLane; return; } } } }
        getLaneLeader(laneIndex, allVehicles) { let leader = null; let gap = Infinity; for (const other of allVehicles) { if (this.id === other.id || other.currentLinkId !== this.currentLinkId) continue; const otherLane = other.laneChangeState ? other.laneChangeState.toLaneIndex : other.currentLaneIndex; if (otherLane === laneIndex && other.distanceOnPath > this.distanceOnPath) { const otherGap = other.distanceOnPath - this.distanceOnPath - this.length; if (otherGap < gap) { gap = otherGap; leader = other; } } } return { leader, gap }; }
        isSafeToChange(targetLane, allVehicles) { return !allVehicles.some(v => v.id !== this.id && v.currentLinkId === this.currentLinkId && (v.laneChangeState ? v.laneChangeState.toLaneIndex : v.currentLaneIndex) === targetLane && this.distanceOnPath > v.distanceOnPath && (this.distanceOnPath - v.distanceOnPath) < (v.length + this.minGap)); }
        getPositionOnPath(path, distance) {
            let distAcc = 0;
            for (let i = 0; i < path.length - 1; i++) {
                const p1 = path[i];
                const p2 = path[i + 1];
                const segmentLen = Geom.Vec.dist(p1, p2);
                if (distance >= distAcc && distance <= distAcc + segmentLen) {
                    if (segmentLen < 1e-6) { const nextPoint = path[i+2] || p2; const segmentVec = Geom.Vec.sub(nextPoint, p1); return { x: p1.x, y: p1.y, angle: Geom.Vec.angle(segmentVec) }; }
                    const ratio = (distance - distAcc) / segmentLen;
                    const segmentVec = Geom.Vec.sub(p2, p1);
                    const x = p1.x + segmentVec.x * ratio;
                    const y = p1.y + segmentVec.y * ratio;
                    const angle = Geom.Vec.angle(segmentVec);
                    return { x, y, angle };
                }
                distAcc += segmentLen;
            }
            if (path.length > 1) { const p1 = path[path.length - 2]; const p2 = path[path.length - 1]; const segmentVec = Geom.Vec.sub(p2, p1); return { x: p2.x, y: p2.y, angle: Geom.Vec.angle(segmentVec) }; }
            return null;
        }
        updateDrawingPosition(network) {
            if (this.state === 'onLink') {
                const link = network.links[this.currentLinkId];
                if (this.laneChangeState) {
                    const fromLane = link.lanes[this.laneChangeState.fromLaneIndex];
                    const toLane = link.lanes[this.laneChangeState.toLaneIndex];
                    if (!fromLane || !toLane) { this.laneChangeState = null; this.updateDrawingPosition(network); return; }
                    const posFrom = this.getPositionOnPath(fromLane.path, this.distanceOnPath);
                    const posTo = this.getPositionOnPath(toLane.path, this.distanceOnPath);
                    if (posFrom && posTo) {
                        const p = this.laneChangeState.progress;
                        this.x = posFrom.x * (1 - p) + posTo.x * p;
                        this.y = posFrom.y * (1 - p) + posTo.y * p;
                        const fromDir = { x: Math.cos(posFrom.angle), y: Math.sin(posFrom.angle) };
                        const toDir = { x: Math.cos(posTo.angle), y: Math.sin(posTo.angle) };
                        const interpDirX = fromDir.x * (1 - p) + toDir.x * p;
                        const interpDirY = fromDir.y * (1 - p) + toDir.y * p;
                        this.angle = Math.atan2(interpDirY, interpDirX);
                    }
                } else {
                    const currentLane = link.lanes[this.currentLaneIndex];
                    if (!currentLane) return;
                    const pos = this.getPositionOnPath(currentLane.path, this.distanceOnPath);
                    if (pos) { this.x = pos.x; this.y = pos.y; this.angle = pos.angle; }
                }
            } else if (this.state === 'inIntersection') {
                const t = this.distanceOnPath / this.currentPathLength;
                const [p0, p1, p2, p3] = this.currentPath;
                const pos = Geom.Bezier.getPoint(t, p0, p1, p2, p3);
                this.x = pos.x;
                this.y = pos.y;
                const tangent = Geom.Bezier.getTangent(t, p0, p1, p2, p3);
                this.angle = Geom.Vec.angle(tangent);
            }
        }
    }

    // --- Stats & Charts Helper Functions ---
    function initializeCharts() {
        if (vehicleCountChart) vehicleCountChart.destroy();
        if (avgSpeedChart) avgSpeedChart.destroy();
        const dict = translations[currentLang];
        const chartOptions = (yAxisTitle) => ({
            responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
            scales: { x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } }, y: { beginAtZero: true, title: { display: true, text: yAxisTitle }, suggestedMax: 10 } },
            plugins: { legend: { display: false } }, elements: { point: { radius: 1 }, line: { tension: 0.1, borderWidth: 2 } }
        });
        vehicleCountChart = new Chart(vehicleCountChartCanvas, { type: 'line', data: { labels: [], datasets: [{ label: dict.chartVehicleAxis, data: [], borderColor: 'rgb(54, 162, 235)', backgroundColor: 'rgba(54, 162, 235, 0.5)' }] }, options: chartOptions(dict.chartVehicleAxis) });
        avgSpeedChart = new Chart(avgSpeedChartCanvas, { type: 'line', data: { labels: [], datasets: [{ label: dict.chartSpeedAxis, data: [], borderColor: 'rgb(255, 99, 132)', backgroundColor: 'rgba(255, 99, 132, 0.5)' }] }, options: chartOptions(dict.chartSpeedAxis) });
    }
    function setupMeterCharts(meters) {
        meterChartsContainer.innerHTML = ''; meterCharts = {}; const dict = translations[currentLang];
        const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis }, ticks: { autoSkip: true, maxRotation: 45, minRotation: 0, } }, y: { beginAtZero: true, title: { display: true, text: dict.meterChartSpeedAxis }, suggestedMax: 60 } }, plugins: { legend: { display: true, position: 'top', } }, elements: { point: { radius: 3 } } };
        meters.forEach(meter => { const chartDiv = document.createElement('div'); chartDiv.className = 'chart-container'; const title = document.createElement('h3'); title.textContent = `${dict.meterTitle} ${meter.id} (${meter.name})`; const canvasEl = document.createElement('canvas'); canvasEl.id = `meter-chart-${meter.id}`; chartDiv.appendChild(title); chartDiv.appendChild(canvasEl); meterChartsContainer.appendChild(chartDiv); const datasets = [{ label: dict.allLanesLabel, data: [], backgroundColor: 'rgba(0, 0, 0, 0.7)', }]; for (let i = 0; i < meter.numLanes; i++) { datasets.push({ label: `${dict.laneLabel} ${i}`, data: [], backgroundColor: LANE_COLORS[i % LANE_COLORS.length] }); } meterCharts[meter.id] = new Chart(canvasEl.getContext('2d'), { type: 'scatter', data: { datasets: datasets }, options: chartOptions }); });
    }
    function setupSectionMeterCharts(meters) {
        sectionMeterChartsContainer.innerHTML = ''; sectionMeterCharts = {}; const dict = translations[currentLang];
        const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, scales: { x: { type: 'linear', title: { display: true, text: dict.chartTimeAxis } }, y: { beginAtZero: true, title: { display: true, text: dict.sectionChartSpeedAxis }, suggestedMax: 60 } }, plugins: { legend: { display: true, position: 'top', } }, elements: { point: { radius: 2 }, line: { tension: 0.1, borderWidth: 2 } } };
        meters.forEach(meter => { const chartDiv = document.createElement('div'); chartDiv.className = 'chart-container'; const title = document.createElement('h3'); title.textContent = `${dict.sectionMeterTitle} ${meter.id} (${meter.name})`; const canvasEl = document.createElement('canvas'); canvasEl.id = `section-meter-chart-${meter.id}`; chartDiv.appendChild(title); chartDiv.appendChild(canvasEl); sectionMeterChartsContainer.appendChild(chartDiv); const newChart = new Chart(canvasEl.getContext('2d'), { type: 'line', data: { datasets: [{ label: dict.allLanesAvgRateLabel, data: [], borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.5)', }] }, options: chartOptions }); sectionMeterCharts[meter.id] = newChart; });
    }
    function updateStatistics(time) {
        if (!simulation) return;
        const vehicles = simulation.vehicles; const vehicleCount = vehicles.length; let avgSpeedKmh = 0; if (vehicleCount > 0) { const totalSpeed = vehicles.reduce((sum, v) => sum + v.speed, 0); avgSpeedKmh = (totalSpeed / vehicleCount) * 3.6; } maxVehicleCount = Math.max(maxVehicleCount, vehicleCount); maxAvgSpeed = Math.max(maxAvgSpeed, avgSpeedKmh); const newData = { time, count: vehicleCount, speed: avgSpeedKmh }; if (!statsData.some(d => d.time === time)) { statsData.push(newData); } updateStatsUI(newData);
        simulation.speedMeters.forEach(meter => { const chart = meterCharts[meter.id]; if (!chart) return; const dict = translations[currentLang]; let currentMaxSpeed = 0; for (const key in meter.readings) { const readings = meter.readings[key]; if (readings.length > 0) { const totalSpeed = readings.reduce((sum, s) => sum + s, 0); const avgSpeedMs = totalSpeed / readings.length; const meterAvgSpeedKmh = avgSpeedMs * 3.6; currentMaxSpeed = Math.max(currentMaxSpeed, meterAvgSpeedKmh); const label = (key === 'all') ? dict.allLanesLabel : `${dict.laneLabel} ${key}`; const dataset = chart.data.datasets.find(d => d.label === label); if (dataset) { dataset.data.push({ x: time, y: meterAvgSpeedKmh }); } } } meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, currentMaxSpeed); chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60; chart.update('none'); meter.readings = {}; });
        simulation.sectionMeters.forEach(meter => { const chart = sectionMeterCharts[meter.id]; if (!chart) return; if (meter.completedVehicles.length > 0) { const totalSpeed = meter.completedVehicles.reduce((sum, v) => sum + v.speed, 0); const avgSpeed = totalSpeed / meter.completedVehicles.length; chart.data.datasets[0].data.push({ x: time, y: avgSpeed }); meter.lastAvgSpeed = avgSpeed; meter.maxAvgSpeed = Math.max(meter.maxAvgSpeed, avgSpeed); } else if (meter.lastAvgSpeed !== null) { chart.data.datasets[0].data.push({ x: time, y: meter.lastAvgSpeed }); } chart.options.scales.y.max = meter.maxAvgSpeed > 10 ? Math.ceil(meter.maxAvgSpeed * 1.1) : 60; chart.update('none'); meter.completedVehicles = []; });
    }
    function updateStatsUI(data, isRepopulating = false) { if (!isRepopulating) { const newRow = statsTableBody.insertRow(0); newRow.insertCell(0).textContent = data.time; newRow.insertCell(1).textContent = data.count; newRow.insertCell(2).textContent = data.speed.toFixed(2); if (statsTableBody.rows.length > 200) statsTableBody.deleteRow(-1); } if (vehicleCountChart && !vehicleCountChart.data.labels.includes(data.time)) { vehicleCountChart.data.labels.push(data.time); vehicleCountChart.data.datasets[0].data.push(data.count); vehicleCountChart.options.scales.y.max = maxVehicleCount > 10 ? Math.ceil(maxVehicleCount * 1.1) : 10; vehicleCountChart.update('none'); } if (avgSpeedChart && !avgSpeedChart.data.labels.includes(data.time)) { avgSpeedChart.data.labels.push(data.time); avgSpeedChart.data.datasets[0].data.push(data.speed); avgSpeedChart.options.scales.y.max = maxAvgSpeed > 10 ? Math.ceil(maxAvgSpeed * 1.1) : 10; avgSpeedChart.update('none'); } }
    function resetStatistics() { statsData = []; lastLoggedIntegerTime = -1; maxVehicleCount = 0; maxAvgSpeed = 0; statsTableBody.innerHTML = ''; initializeCharts(); meterChartsContainer.innerHTML = ''; meterCharts = {}; sectionMeterChartsContainer.innerHTML = ''; sectionMeterCharts = {}; }

    // --- Parser (Unchanged) ---
    function parseTrafficModel(xmlDoc) {
        return new Promise((resolve, reject) => {
            const links = {}; const nodes = {}; let spawners = []; let trafficLights = []; const staticVehicles = []; const speedMeters = []; const sectionMeters = []; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; const updateBounds = (p) => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }; const roadSignVisuals = [];
            const backgroundTiles = []; const imagePromises = []; // Add background tiles array
            const imageTypeMap = { 'PNG': 'png', 'JPG': 'jpeg', 'JPEG': 'jpeg', 'BMP': 'bmp', 'GIF': 'gif', 'TIFF': 'tiff' };

            function getPointAtDistanceAlongPath(path, distance) { let accumulatedLength = 0; for (let i = 0; i < path.length - 1; i++) { const p1 = path[i]; const p2 = path[i + 1]; const segmentLength = Geom.Vec.dist(p1, p2); if (distance >= accumulatedLength && distance <= accumulatedLength + segmentLength) { const ratio = (distance - accumulatedLength) / segmentLength; const segmentVec = Geom.Vec.sub(p2, p1); const point = Geom.Vec.add(p1, Geom.Vec.scale(segmentVec, ratio)); const normal = Geom.Vec.normalize(Geom.Vec.normal(segmentVec)); const angle = Geom.Vec.angle(segmentVec); return { point, normal, angle }; } accumulatedLength += segmentLength; } return null; }
            xmlDoc.querySelectorAll('Link').forEach(linkEl => {
                const linkId = linkEl.querySelector('id').textContent; const sourceNodeId = linkEl.querySelector('sourceNodeId')?.textContent; const destinationNodeId = linkEl.querySelector('destinationNodeId')?.textContent;
                if (!sourceNodeId && !destinationNodeId) { const segs = linkEl.querySelectorAll('Segments > TrapeziumSegment'); if(segs.length > 0) { const wp = linkEl.querySelectorAll('Waypoints > Waypoint'); if(wp.length >= 2){ const firstWpId = segs[0].querySelector('startWaypointId').textContent; const lastWpId = segs[segs.length-1].querySelector('endWaypointId').textContent; xmlDoc.querySelectorAll('Nodes > *').forEach(nodeEl => { if(nodeEl.querySelector('outgoingLinkId')?.textContent === linkId || nodeEl.querySelector('incomingLinkId')?.textContent === linkId){ const center = nodeEl.querySelector('CircleGeometry > Center'); if(center){ const wpId = Array.from(wp).find(w => w.querySelector('x').textContent === center.querySelector('x').textContent)?.querySelector('id').textContent; if(wpId === firstWpId) links[linkId] = { ...links[linkId], source: nodeEl.querySelector('id').textContent}; if(wpId === lastWpId) links[linkId] = { ...links[linkId], destination: nodeEl.querySelector('id').textContent}; } } }); } } } else { links[linkId] = { id: linkId, source: sourceNodeId, destination: destinationNodeId }; }
                links[linkId] = { ...links[linkId], length: parseFloat(linkEl.querySelector('length').textContent), geometry: [], lanes: {}, dividingLines: [], roadSigns: [] }; const link = links[linkId];
                linkEl.querySelectorAll('Lanes > Lane').forEach(laneEl => { const laneIndex = parseInt(laneEl.querySelector('index').textContent, 10); const laneWidth = parseFloat(laneEl.querySelector('width').textContent); link.lanes[laneIndex] = { index: laneIndex, width: laneWidth, path: [], length: 0 }; }); const numLanes = Object.keys(link.lanes).length; if (numLanes > 1) { for (let i = 0; i < numLanes - 1; i++) { link.dividingLines[i] = { path: [] }; } }
                const centerlinePolyline = []; const waypointsEl = linkEl.querySelectorAll('Waypoints > Waypoint'); const hasWaypoints = waypointsEl.length >= 2;
                if (hasWaypoints) { waypointsEl.forEach(wp => { const x = parseFloat(wp.querySelector('x').textContent); const y = -parseFloat(wp.querySelector('y').textContent); const p = {x, y}; centerlinePolyline.push(p); updateBounds(p); }); } else { const segments = Array.from(linkEl.querySelectorAll('TrapeziumSegment, Segments > TrapeziumSegment')); segments.forEach(segEl => { const ls = segEl.querySelector('LeftSide > Start'); const le = segEl.querySelector('LeftSide > End'); const rs = segEl.querySelector('RightSide > Start'); const re = segEl.querySelector('RightSide > End'); const p1 = { x: parseFloat(ls.querySelector('x').textContent), y: -parseFloat(ls.querySelector('y').textContent) }; const p2 = { x: parseFloat(rs.querySelector('x').textContent), y: -parseFloat(rs.querySelector('y').textContent) }; const p3 = { x: parseFloat(re.querySelector('x').textContent), y: -parseFloat(re.querySelector('y').textContent) }; const p4 = { x: parseFloat(le.querySelector('x').textContent), y: -parseFloat(le.querySelector('y').textContent) }; link.geometry.push({ type: 'trapezium', points: [p1, p2, p3, p4] }); [p1, p2, p3, p4].forEach(updateBounds); const centerStart = Geom.Vec.scale(Geom.Vec.add(p1, p2), 0.5); const centerEnd = Geom.Vec.scale(Geom.Vec.add(p4, p3), 0.5); if (centerlinePolyline.length === 0) { centerlinePolyline.push(centerStart); } centerlinePolyline.push(centerEnd); segEl.querySelectorAll('RoadSigns > SpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); const speedLimit = parseFloat(signEl.querySelector('speedLimit').textContent); link.roadSigns.push({ type: 'limit', position, limit: speedLimit }); }); segEl.querySelectorAll('RoadSigns > NoSpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); link.roadSigns.push({ type: 'no_limit', position }); }); }); }
                const miteredNormals = []; if (centerlinePolyline.length > 1) { for (let i = 0; i < centerlinePolyline.length; i++) { let finalNormal; if (i === 0) { const segVec = Geom.Vec.sub(centerlinePolyline[1], centerlinePolyline[0]); finalNormal = Geom.Vec.normalize(Geom.Vec.normal(segVec)); } else if (i === centerlinePolyline.length - 1) { const segVec = Geom.Vec.sub(centerlinePolyline[i], centerlinePolyline[i - 1]); finalNormal = Geom.Vec.normalize(Geom.Vec.normal(segVec)); } else { const v_in = Geom.Vec.sub(centerlinePolyline[i], centerlinePolyline[i - 1]); const v_out = Geom.Vec.sub(centerlinePolyline[i + 1], centerlinePolyline[i]); const n_in = Geom.Vec.normalize(Geom.Vec.normal(v_in)); const n_out = Geom.Vec.normalize(Geom.Vec.normal(v_out)); const miter_vec = Geom.Vec.add(n_in, n_out); if (Geom.Vec.len(miter_vec) < 1e-6) { finalNormal = n_in; } else { const dot_product = n_in.x * n_out.x + n_in.y * n_out.y; const safe_dot = Math.max(-1.0, Math.min(1.0, dot_product)); const cos_half_angle = Math.sqrt((1 + safe_dot) / 2); if (cos_half_angle > 1e-6) { const scale_factor = 1.0 / cos_half_angle; finalNormal = Geom.Vec.scale(Geom.Vec.normalize(miter_vec), scale_factor); } else { finalNormal = n_in; } } } miteredNormals.push(finalNormal); } }
                const orderedLanes = Object.values(link.lanes).sort((a, b) => a.index - b.index); const totalWidth = orderedLanes.reduce((sum, lane) => sum + lane.width, 0);
                if (hasWaypoints && centerlinePolyline.length > 1) { const leftEdgePoints = []; const rightEdgePoints = []; for (let i = 0; i < centerlinePolyline.length; i++) { const centerPoint = centerlinePolyline[i]; const normal = miteredNormals[i]; const halfWidth = totalWidth / 2; leftEdgePoints.push(Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, -halfWidth))); rightEdgePoints.push(Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, halfWidth))); } link.geometry.push({ type: 'polygon', points: [...leftEdgePoints, ...rightEdgePoints.reverse()] }); const segs = linkEl.querySelectorAll('Segments > TrapeziumSegment'); segs.forEach(segEl => { segEl.querySelectorAll('RoadSigns > SpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); const speedLimit = parseFloat(signEl.querySelector('speedLimit').textContent); link.roadSigns.push({ type: 'limit', position, limit: speedLimit }); }); segEl.querySelectorAll('RoadSigns > NoSpeedLimitSign').forEach(signEl => { const position = parseFloat(signEl.querySelector('position').textContent); link.roadSigns.push({ type: 'no_limit', position }); }); }); }
                for (let i = 0; i < centerlinePolyline.length; i++) { const centerPoint = centerlinePolyline[i]; const normal = miteredNormals[i]; let cumulativeWidth = 0; for (let j = 0; j < orderedLanes.length; j++) { const lane = orderedLanes[j]; const laneCenterOffsetFromEdge = cumulativeWidth + lane.width / 2; const offsetFromRoadCenter = laneCenterOffsetFromEdge - totalWidth / 2; const lanePoint = Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, offsetFromRoadCenter)); lane.path.push(lanePoint); cumulativeWidth += lane.width; if (j < orderedLanes.length - 1) { const divider = link.dividingLines[j]; const dividerOffsetFromRoadCenter = cumulativeWidth - totalWidth / 2; const linePoint = Geom.Vec.add(centerPoint, Geom.Vec.scale(normal, dividerOffsetFromRoadCenter)); divider.path.push(linePoint); } } } for (const lane of Object.values(link.lanes)) { lane.length = 0; for (let i = 0; i < lane.path.length - 1; i++) { lane.length += Geom.Vec.dist(lane.path[i], lane.path[i + 1]); } } link.roadSigns.sort((a, b) => a.position - b.position);
            });
            xmlDoc.querySelectorAll('Nodes > *').forEach(nodeEl => { const nodeId = nodeEl.querySelector('id').textContent; nodes[nodeId] = { id: nodeId, transitions: [], turnGroups: {}, polygon: [] }; const node = nodes[nodeId]; nodeEl.querySelectorAll('PolygonGeometry > Point').forEach(p => { const point = {x: parseFloat(p.querySelector('x').textContent), y: -parseFloat(p.querySelector('y').textContent)}; node.polygon.push(point); }); if(node.polygon.length === 0){ const circle = nodeEl.querySelector('CircleGeometry'); if(circle){ const center = circle.querySelector('Center'); const radius = parseFloat(circle.querySelector('radius').textContent); const cx = parseFloat(center.querySelector('x').textContent); const cy = -parseFloat(center.querySelector('y').textContent); for(let i=0; i < 12; i++){ const angle = (i/12) * 2 * Math.PI; node.polygon.push({x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle)}); } } } nodeEl.querySelectorAll('TransitionRule').forEach(ruleEl => { const idEl = ruleEl.querySelector('id'); const sourceLinkEl = ruleEl.querySelector('sourceLinkId'); if (idEl && sourceLinkEl) { const transition = { id: idEl.textContent, sourceLinkId: sourceLinkEl.textContent, sourceLaneIndex: parseInt(ruleEl.querySelector('sourceLaneIndex').textContent, 10), destLinkId: ruleEl.querySelector('destinationLinkId').textContent, destLaneIndex: parseInt(ruleEl.querySelector('destinationLaneIndex').textContent, 10), }; const bezierEl = ruleEl.querySelector('BezierCurveGeometry'); if (bezierEl) { const points = Array.from(bezierEl.querySelectorAll('Point')).map(pEl => ({ x: parseFloat(pEl.querySelector('x').textContent), y: -parseFloat(pEl.querySelector('y').textContent) })); if(points.length === 4) { transition.bezier = { points: points, length: Geom.Bezier.getLength(...points) }; } } node.transitions.push(transition); } }); nodeEl.querySelectorAll('TurnTRGroup').forEach(groupEl => { const groupId = groupEl.querySelector('id').textContent; groupEl.querySelectorAll('TransitionRule').forEach(ruleRefEl => { const ruleIdEl = ruleRefEl.querySelector('transitionRuleId'); if (ruleIdEl) { const ruleId = ruleIdEl.textContent; const transition = node.transitions.find(t => t.id === ruleId); if (transition) transition.turnGroupId = groupId; } }); }); });
            xmlDoc.querySelectorAll('RegularTrafficLightNetwork').forEach(netEl => { const nodeId = netEl.querySelector('regularNodeId').textContent; const config = { nodeId: nodeId, schedule: [], lights: {}, timeShift: 0 }; const timeShiftEl = netEl.querySelector('scheduleTimeShift'); if (timeShiftEl) { config.timeShift = parseFloat(timeShiftEl.textContent) || 0; } netEl.querySelectorAll('TrafficLight').forEach(lightEl => { const lightId = lightEl.querySelector('id').textContent; const turnTRGroupIds = Array.from(lightEl.querySelectorAll('turnTRGroupId')).map(id => id.textContent); config.lights[lightId] = { id: lightId, turnTRGroupIds: turnTRGroupIds }; }); netEl.querySelectorAll('Schedule > TimePeriods > TimePeriod').forEach(periodEl => { const period = { duration: parseFloat(periodEl.querySelector('duration').textContent), signals: {} }; periodEl.querySelectorAll('TrafficLightSignal').forEach(sigEl => { const lightId = sigEl.querySelector('trafficLightId').textContent; const signal = sigEl.querySelector('signal').textContent; const light = config.lights[lightId]; if (light) { light.turnTRGroupIds.forEach(groupId => { period.signals[groupId] = signal; }); } }); config.schedule.push(period); }); trafficLights.push(new TrafficLightController(config)); });
            xmlDoc.querySelectorAll('Origins > Origin').forEach(originEl => { const originNodeId = originEl.querySelector('originNodeId').textContent; const periods = []; originEl.querySelectorAll('TimePeriods > TimePeriod').forEach(timePeriodEl => { const periodConfig = { duration: parseFloat(timePeriodEl.querySelector('duration').textContent), numVehicles: parseInt(timePeriodEl.querySelector('numberOfVehicles').textContent, 10), destinations: [], vehicleProfiles: [] }; timePeriodEl.querySelectorAll('Destinations > Destination').forEach(destEl => { periodConfig.destinations.push({ weight: parseFloat(destEl.querySelector('weight').textContent), destinationNodeId: destEl.querySelector('destinationNodeId').textContent }); }); timePeriodEl.querySelectorAll('VehicleProfiles > VehicleProfile').forEach(profEl => { const driverParams = profEl.querySelector('Parameters'); periodConfig.vehicleProfiles.push({ weight: parseFloat(profEl.querySelector('weight').textContent), length: parseFloat(profEl.querySelector('RegularVehicle > length').textContent), width: parseFloat(profEl.querySelector('RegularVehicle > width').textContent), params: { maxSpeed: parseFloat(driverParams.querySelector('maxSpeed').textContent), maxAcceleration: parseFloat(driverParams.querySelector('maxAcceleration').textContent), comfortDeceleration: parseFloat(driverParams.querySelector('comfortDeceleration').textContent), minDistance: parseFloat(driverParams.querySelector('minDistance').textContent), desiredHeadwayTime: parseFloat(driverParams.querySelector('desiredHeadwayTime').textContent) } }); }); periods.push(periodConfig); }); if (periods.length > 0) { spawners.push({ originNodeId, periods }); } });
            xmlDoc.querySelectorAll('Agents > Vehicles > RegularVehicle').forEach(vehicleEl => { const driverParamsEl = vehicleEl.querySelector('Parameters'); const locationEl = vehicleEl.querySelector('LinkLocation'); if (!driverParamsEl || !locationEl) return; const staticVehicle = { profile: { length: parseFloat(vehicleEl.querySelector('length').textContent), width: parseFloat(vehicleEl.querySelector('width').textContent), params: { maxSpeed: parseFloat(driverParamsEl.querySelector('maxSpeed').textContent), maxAcceleration: parseFloat(driverParamsEl.querySelector('maxAcceleration').textContent), comfortDeceleration: parseFloat(driverParamsEl.querySelector('comfortDeceleration').textContent), minDistance: parseFloat(driverParamsEl.querySelector('minDistance').textContent), desiredHeadwayTime: parseFloat(driverParamsEl.querySelector('desiredHeadwayTime').textContent), } }, initialState: { distanceOnPath: parseFloat(locationEl.querySelector('position').textContent), speed: parseFloat(vehicleEl.querySelector('speed').textContent) }, startLinkId: locationEl.querySelector('linkId').textContent, startLaneIndex: parseInt(locationEl.querySelector('laneIndex').textContent, 10), destinationNodeId: vehicleEl.querySelector('CompositeDriver > destinationNodeId').textContent }; staticVehicles.push(staticVehicle); });
            xmlDoc.querySelectorAll('LinkAverageTravelSpeedMeter').forEach(meterEl => { const id = meterEl.querySelector('id').textContent; const name = meterEl.querySelector('name').textContent; const linkId = meterEl.querySelector('linkId').textContent; const position = parseFloat(meterEl.querySelector('position').textContent); const link = links[linkId]; if (!link) return; const numLanes = Object.keys(link.lanes).length; let refPath = []; const laneEntries = Object.values(link.lanes).sort((a,b) => a.index - b.index); if (laneEntries.length > 0) { refPath = laneEntries[0].path; } const posData = getPointAtDistanceAlongPath(refPath, position); if (posData) { const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5; const meterPosition = Geom.Vec.add(posData.point, Geom.Vec.scale(posData.normal, roadCenterlineOffset)); speedMeters.push({ id, name, linkId, position, numLanes, x: meterPosition.x, y: meterPosition.y, angle: posData.angle }); } });
            xmlDoc.querySelectorAll('SectionAverageTravelSpeedMeter').forEach(meterEl => { const id = meterEl.querySelector('id').textContent; const name = meterEl.querySelector('name').textContent; const linkId = meterEl.querySelector('linkId').textContent; const endPosition = parseFloat(meterEl.querySelector('position').textContent); const length = parseFloat(meterEl.querySelector('sectionLength').textContent); const startPosition = endPosition - length; const link = links[linkId]; if (!link) return; let refPath = []; const laneEntries = Object.values(link.lanes).sort((a,b) => a.index - b.index); if (laneEntries.length > 0) { refPath = laneEntries[0].path; } const startPosData = getPointAtDistanceAlongPath(refPath, startPosition); const endPosData = getPointAtDistanceAlongPath(refPath, endPosition); if (startPosData && endPosData) { const numLanes = Object.keys(link.lanes).length; const roadCenterlineOffset = (numLanes - 1) / 2 * 3.5; const startMarkerPos = Geom.Vec.add(startPosData.point, Geom.Vec.scale(startPosData.normal, roadCenterlineOffset)); const endMarkerPos = Geom.Vec.add(endPosData.point, Geom.Vec.scale(endPosData.normal, roadCenterlineOffset)); sectionMeters.push({ id, name, linkId, length, startPosition, endPosition, startX: startMarkerPos.x, startY: startMarkerPos.y, startAngle: startPosData.angle, endX: endMarkerPos.x, endY: endMarkerPos.y, endAngle: endPosData.angle, }); } });
            
            // --- Parse Background Images ---
            xmlDoc.querySelectorAll('Background > Tile').forEach(tileEl => { const rect = tileEl.querySelector('Rectangle'); const start = rect.querySelector('Start'); const end = rect.querySelector('End'); const imageEl = tileEl.querySelector('Image'); const p1x = parseFloat(start.querySelector('x').textContent); const p1y = -parseFloat(start.querySelector('y').textContent); const p2x = parseFloat(end.querySelector('x').textContent); const p2y = -parseFloat(end.querySelector('y').textContent); const x = Math.min(p1x, p2x); const y = Math.min(p1y, p2y); const width = Math.abs(p2x - p1x); const height = Math.abs(p2y - p1y); const saturationEl = tileEl.querySelector('saturation'); const opacity = saturationEl ? parseFloat(saturationEl.textContent) / 100 : 1.0; const type = imageEl.querySelector('type').textContent.toUpperCase(); const mimeType = imageTypeMap[type] || 'png'; const base64Data = imageEl.querySelector('binaryData').textContent; const img = new Image(); const p = new Promise((imgResolve, imgReject) => { img.onload = () => imgResolve(img); img.onerror = () => imgReject(); }); imagePromises.push(p); img.src = `data:image/${mimeType};base64,${base64Data}`; backgroundTiles.push({ image: img, x, y, width, height, opacity }); });

            Promise.all(imagePromises).then(() => {
                resolve({ links, nodes, spawners, trafficLights, staticVehicles, speedMeters, sectionMeters, bounds: { minX, minY, maxX, maxY }, pathfinder: new Pathfinder(links, nodes), backgroundTiles });
            }).catch(() => reject(new Error(translations[currentLang].imageLoadError)));
        });
    }
});
