/**
 * osm_importer.js
 * 負責處理 OpenStreetMap 的顯示、搜尋、座標計算與畫面截圖
 */
const OSMImporter = (() => {
    let map = null;
    let mapLayer = null;
    let modalElement = null;

    // 逆向地理投影計算：將畫布上的世界座標 (X, Y) 轉換回經緯度 (Lat, Lon)
    function getCanvasCenterGPS() {
        const net = window.network;
        const stg = window.stage;
        if (!net || !stg) return null;

        // 必須存在剛好兩個地理對位圖釘
        const pins = Object.values(net.pushpins || {});
        if (pins.length < 2) {
            return null;
        }
        const C1 = pins[0];
        const C2 = pins[1];

        // 經緯度轉麥卡托投影
        function latLonToMercator(lat, lon) {
            const R = 6378137;
            const mx = R * lon * Math.PI / 180;
            const my = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
            return { x: mx, y: my };
        }

        const cm1 = latLonToMercator(C1.lat, C1.lon);
        const cm2 = latLonToMercator(C2.lat, C2.lon);

        // 取得目前 Konva 視角在世界座標中的中心點
        const centerScreenX = stg.width() / 2;
        const centerScreenY = stg.height() / 2;
        const worldCenter = {
            x: (centerScreenX - stg.x()) / stg.scaleX(),
            y: (centerScreenY - stg.y()) / stg.scaleY()
        };

        const dxc = C2.x - C1.x;
        const dyc = C2.y - C1.y;
        const Lc2 = dxc * dxc + dyc * dyc;
        if (Lc2 === 0) {
            return { lat: C1.lat, lon: C1.lon };
        }

        // 投影到相對圖釘 1 的相對向量比例 (u, v)
        const deltaXc = worldCenter.x - C1.x;
        const deltaYc = worldCenter.y - C1.y;

        const u = (deltaXc * dxc + deltaYc * dyc) / Lc2;
        const v = (deltaYc * dxc - deltaXc * dyc) / Lc2;

        // 映射回麥卡托投影平面座標 (需處理 Y 軸向下反轉)
        const Xg1 = cm1.x, Yg1 = -cm1.y;
        const Xg2 = cm2.x, Yg2 = -cm2.y;
        const dXg = Xg2 - Xg1;
        const dYg = Yg2 - Yg1;

        const dXp = u * dXg - v * dYg;
        const dYp = u * dYg + v * dXg;

        const Xp = Xg1 + dXp;
        const Yp = Yg1 + dYp;

        const mx_p = Xp;
        const my_p = -Yp;

        // 麥卡托投影座標還原為經緯度
        function mercatorToLatLon(mx, my) {
            const R = 6378137;
            const lon = (mx * 180) / (Math.PI * R);
            const lat = (360 / Math.PI) * Math.atan(Math.exp(my / R)) - 90;
            return { lat, lon };
        }

        return mercatorToLatLon(mx_p, my_p);
    }

    // 初始化地圖與模態視窗
    function init() {
        // 建立 Modal 的 HTML 結構 (如果尚未存在)
        if (!document.getElementById('osm-modal')) {
            createModalHTML();
        }

        modalElement = document.getElementById('osm-modal');

        // 1. 綁定搜尋按鈕
        document.getElementById('osm-search-btn').addEventListener('click', () => {
            searchLocation(document.getElementById('osm-search-input').value);
        });

        // 綁定 Enter 鍵搜尋
        document.getElementById('osm-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchLocation(e.target.value);
        });

        // 2. 綁定關閉按鈕
        document.getElementById('osm-close-btn').addEventListener('click', close);

        // 3. 綁定匯入按鈕
        document.getElementById('osm-capture-btn').addEventListener('click', executeImport);

        // 4. 綁定「對齊到畫布中心」按鈕
        const centerBtn = document.getElementById('osm-center-to-canvas-btn');
        if (centerBtn) {
            // 利用克隆節點清除舊的監聽器，防止重複初始化
            const newCenterBtn = centerBtn.cloneNode(true);
            centerBtn.parentNode.replaceChild(newCenterBtn, centerBtn);

            newCenterBtn.addEventListener('click', () => {
                const gps = getCanvasCenterGPS();
                if (!gps) {
                    const alertMsg = (typeof I18N !== 'undefined' && I18N.t)
                        ? I18N.t("Please set exactly 2 Geo Pins on the canvas first to calibrate coordinates.")
                        : "請先在畫布上設定 2 個 Geo Pin 圖釘以校正座標系統！";
                    alert(alertMsg);
                    return;
                }
                if (map) {
                    // 將 Leaflet 地圖視角移動到算出的世界中心經緯度
                    map.setView([gps.lat, gps.lon], map.getZoom());
                    updateInfo();
                }
            });
        }
    }

    // 動態建立 Modal HTML
    function createModalHTML() {
        const div = document.createElement('div');
        div.innerHTML = `
        <div id="osm-modal" class="modal" style="display:none; z-index: 2000;">
            <div class="modal-content large" style="width: 90%; height: 90%; display:flex; flex-direction:column; padding:0;">
                <div class="modal-header" style="padding: 15px; border-bottom: 1px solid #eee;">
                    <h2 style="margin:0;">Import OpenStreetMap Background</h2>
                    <span class="close-button" id="osm-close-btn" style="cursor:pointer; font-size:1.5rem;">×</span>
                </div>
                <div class="modal-body" style="flex:1; display:flex; padding:0; overflow:hidden;">
                    <!-- 左側控制區 -->
                    <div style="width: 300px; padding: 20px; background: #f8f9fa; border-right: 1px solid #ddd; display:flex; flex-direction:column; gap:15px; z-index:1001;">
                        <div class="input-group">
                            <label style="font-weight:bold; margin-bottom:5px; display:block;">Search Location</label>
                            <div style="display:flex; gap:5px;">
                                <input type="text" id="osm-search-input" class="prop-input" placeholder="e.g. Taipei Main Station" style="flex:1;">
                                <button id="osm-search-btn" class="btn-secondary" style="padding:5px 10px;"><i class="fa-solid fa-magnifying-glass"></i></button>
                            </div>
                        </div>
                        
                        <div style="background:white; padding:10px; border-radius:4px; border:1px solid #ddd; font-size: 0.9rem;">
                            <p style="margin:0 0 5px 0;"><strong>Bounds (Lat/Lon):</strong></p>
                            <div id="osm-bounds-text" style="font-family:monospace; color:#555;">-</div>
                        </div>

                        <div style="background:white; padding:10px; border-radius:4px; border:1px solid #ddd; font-size: 0.9rem;">
                            <p style="margin:0 0 5px 0;"><strong>Real World Size:</strong></p>
                            <div id="osm-size-text" style="font-family:monospace; color:#007bff; font-weight:bold;">-</div>
                        </div>

                        <div style="margin-top:auto;">
                            <p style="font-size:0.85rem; color:#666; line-height:1.4;">
                                <i class="fa-solid fa-circle-info"></i> 
                                Pan and Zoom the map. The <strong>entire visible area</strong> will be captured as the background image.
                            </p>
                            <button id="osm-capture-btn" class="btn-primary" style="width:100%; justify-content:center; padding:10px;">
                                <i class="fa-solid fa-download"></i> Import & Calibrate
                            </button>
                        </div>
                    </div>
                    
                    <!-- 右側地圖區 -->
                    <div id="osm-map-container" style="flex:1; position: relative;">
                        <div id="osm-map" style="width: 100%; height: 100%; background:#e5e5e5;"></div>
                        <!-- 中心十字準星 -->
                        <div style="position:absolute; top:50%; left:50%; width:20px; height:20px; margin-left:-10px; margin-top:-10px; pointer-events:none; z-index:1000;">
                            <svg viewBox="0 0 20 20" style="stroke:red; stroke-width:2; drop-shadow: 1px 1px 2px white;">
                                <line x1="10" y1="0" x2="10" y2="20" />
                                <line x1="0" y1="10" x2="20" y2="10" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div);
    }

    // 初始化 Leaflet 地圖
    function initMap() {
        if (map) return;

        // 預設位置 (台中車站)
        map = L.map('osm-map', {
            attributionControl: false,
            zoomControl: true
        }).setView([24.1375386, 120.684663], 17);

        const googleHybridLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20, crossOrigin: true
        });
        const googleStreetLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20, crossOrigin: true
        });

        const taiwanPhotoLayer = L.tileLayer('https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}', {
            maxZoom: 20,
            crossOrigin: true,
            attribution: '© 內政部國土測繪中心'
        });

        const taiwanEmapLayer = L.tileLayer('https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}', {
            maxZoom: 20,
            crossOrigin: true,
            attribution: '© 內政部國土測繪中心'
        });

        const cartoStreetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19, crossOrigin: true
        });
        const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19, crossOrigin: true
        });

        googleHybridLayer.addTo(map);

        const baseMaps = {
            "🛰️ 衛星+標籤 (Google)": googleHybridLayer,
            "🇹🇼 台灣官方空照 (國土測繪)": taiwanPhotoLayer,
            "🛰️ 純衛星圖 (Esri 備用)": esriSatLayer,
            "🗺️ 街道地圖 (Google)": googleStreetLayer,
            "🇹🇼 台灣官方地圖 (國土測繪)": taiwanEmapLayer,
            "🗺️ 街道地圖 (CartoDB 備用)": cartoStreetLayer
        };

        L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

        map.on('moveend', updateInfo);
        map.on('zoomend', updateInfo);

        setTimeout(updateInfo, 500);
    }

    function updateInfo() {
        if (!map) return;
        const bounds = map.getBounds();
        const center = map.getCenter();
        const north = bounds.getNorth();
        const south = bounds.getSouth();
        const east = bounds.getEast();
        const west = bounds.getWest();

        const heightMeters = map.distance([north, center.lng], [south, center.lng]);
        const widthMeters = map.distance([center.lat, west], [center.lat, east]);

        document.getElementById('osm-bounds-text').innerHTML =
            `N: ${north.toFixed(5)}<br>S: ${south.toFixed(5)}<br>E: ${east.toFixed(5)}<br>W: ${west.toFixed(5)}`;

        document.getElementById('osm-size-text').innerHTML =
            `Width:  ${widthMeters.toFixed(1)} m<br>Height: ${heightMeters.toFixed(1)} m`;

        return { widthMeters, heightMeters, bounds };
    }

    async function searchLocation(query) {
        if (!query) return;
        const btn = document.getElementById('osm-search-btn');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await resp.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                map.setView([lat, lon], 16);
            } else {
                alert("Location not found.");
            }
        } catch (e) {
            console.error(e);
            alert("Search failed.");
        } finally {
            btn.innerHTML = originalHtml;
        }
    }

    async function captureMapImage() {
        return new Promise((resolve, reject) => {
            const mapContainer = document.getElementById('osm-map');
            const mapRect = mapContainer.getBoundingClientRect();

            const width = mapContainer.clientWidth;
            const height = mapContainer.clientHeight;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#e5e5e5';
            ctx.fillRect(0, 0, width, height);

            const tiles = mapContainer.querySelectorAll('.leaflet-tile');
            const totalTiles = tiles.length;

            if (totalTiles === 0) {
                reject("No map tiles found.");
                return;
            }

            const drawTiles = () => {
                Array.from(tiles).forEach(img => {
                    const imgRect = img.getBoundingClientRect();
                    const x = imgRect.left - mapRect.left;
                    const y = imgRect.top - mapRect.top;

                    const drawW = imgRect.width;
                    const drawH = imgRect.height;

                    if (x + drawW > 0 && y + drawH > 0 && x < width && y < height) {
                        if (img.complete) {
                            try {
                                ctx.drawImage(img, x, y, drawW, drawH);
                            } catch (e) {
                                console.warn("Tile draw error (CORS?):", e);
                            }
                        }
                    }
                });
                resolve(canvas.toDataURL('image/png'));
            };

            setTimeout(drawTiles, 100);
        });
    }

    async function executeImport() {
        const btn = document.getElementById('osm-capture-btn');
        btn.textContent = "Capturing & Processing...";
        btn.disabled = true;

        try {
            const info = updateInfo();
            const dataUrl = await captureMapImage();

            if (window.handleOSMImportCallback) {
                window.handleOSMImportCallback({
                    imageData: dataUrl,
                    widthMeters: info.widthMeters,
                    heightMeters: info.heightMeters,
                    bounds: info.bounds
                });
            }

            close();

        } catch (err) {
            console.error(err);
            alert("Error capturing map: " + err.message);
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-download"></i> Import & Calibrate';
            btn.disabled = false;
        }
    }

    function open() {
        init();
        modalElement.style.display = 'flex';
        setTimeout(() => {
            if (map) map.invalidateSize();
            else initMap();
        }, 100);
    }

    function close() {
        if (modalElement) modalElement.style.display = 'none';
    }

    return {
        open: open
    };
})();