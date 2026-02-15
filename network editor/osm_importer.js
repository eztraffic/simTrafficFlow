/**
 * osm_importer.js
 * 負責處理 OpenStreetMap 的顯示、搜尋、座標計算與畫面截圖
 */
const OSMImporter = (() => {
    let map = null;
    let mapLayer = null;
    let modalElement = null;

    // 初始化地圖與模態視窗
    function init() {
        // 建立 Modal 的 HTML 結構 (如果尚未存在)
        if (!document.getElementById('osm-modal')) {
            createModalHTML();
        }
        
        modalElement = document.getElementById('osm-modal');
        
        // 綁定搜尋按鈕
        document.getElementById('osm-search-btn').addEventListener('click', () => {
            searchLocation(document.getElementById('osm-search-input').value);
        });

        // 綁定 Enter 鍵搜尋
        document.getElementById('osm-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchLocation(e.target.value);
        });
        
        // 綁定關閉按鈕
        document.getElementById('osm-close-btn').addEventListener('click', close);
        
        // 綁定匯入按鈕
        document.getElementById('osm-capture-btn').addEventListener('click', executeImport);
    }

    // 動態建立 Modal HTML (避免污染 main.html 太嚴重)
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
        }).setView([24.1375386,120.684663], 17);

        // 使用 OpenStreetMap Tile
        mapLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            // 關鍵：必須允許 Cross-Origin 才能在 Canvas 中繪製並導出為 DataURL
            crossOrigin: true 
        }).addTo(map);

        // 監聽移動事件以更新座標資訊
        map.on('moveend', updateInfo);
        map.on('zoomend', updateInfo);
        
        // 初始更新
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

        // 計算實際公尺數 (Haversine 距離)
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

    // 截圖核心邏輯：手動繪製 Tile 到 Canvas
    // --- [修正] 截圖核心邏輯：使用 getBoundingClientRect 確保精確對齊 ---
    async function captureMapImage() {
        return new Promise((resolve, reject) => {
            const mapContainer = document.getElementById('osm-map');
            // 取得地圖容器在視窗中的絕對位置
            const mapRect = mapContainer.getBoundingClientRect();
            
            const width = mapContainer.clientWidth;
            const height = mapContainer.clientHeight;
            
            // 建立暫存 Canvas
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            // 填滿背景色 (避免透明區域)
            ctx.fillStyle = '#e5e5e5';
            ctx.fillRect(0, 0, width, height);

            // 獲取 Leaflet 的 Tile 容器內的圖片
            // 修正：直接抓取所有 .leaflet-tile 類別的圖片，這包含了目前顯示的所有圖層
            const tiles = mapContainer.querySelectorAll('.leaflet-tile');
            const totalTiles = tiles.length;
            let loadedCount = 0;

            if (totalTiles === 0) {
                reject("No map tiles found.");
                return;
            }

            // 繪製函數
            const drawTiles = () => {
                Array.from(tiles).forEach(img => {
                    // [修正重點]：不解析 transform，直接計算相對位置
                    // 1. 取得圖磚在螢幕上的絕對位置
                    const imgRect = img.getBoundingClientRect();

                    // 2. 計算圖磚相對於地圖容器左上角的偏移量 (x, y)
                    const x = imgRect.left - mapRect.left;
                    const y = imgRect.top - mapRect.top;
                    
                    const drawW = imgRect.width;
                    const drawH = imgRect.height;

                    // 3. 只有當圖片與畫布有交集時才繪製 (優化效能，並防止邊緣殘影)
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
                // 輸出為 Data URL
                resolve(canvas.toDataURL('image/png'));
            };

            // 簡單延遲確保 Leaflet DOM 更新完成
            setTimeout(drawTiles, 100);
        });
    }

    async function executeImport() {
        const btn = document.getElementById('osm-capture-btn');
        btn.textContent = "Capturing & Processing...";
        btn.disabled = true;

        try {
            // 1. 取得當前地圖資訊
            const info = updateInfo();
            
            // 2. 截圖 (取得 Base64)
            const dataUrl = await captureMapImage();
            
            // 3. 呼叫主程式回調
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
        init(); // 確保已初始化
        modalElement.style.display = 'flex';
        // Leaflet 需要在容器可見後調整大小
        setTimeout(() => {
            if (map) map.invalidateSize();
            else initMap();
        }, 100);
    }

    function close() {
        if (modalElement) modalElement.style.display = 'none';
    }

    // 公開 API
    return {
        open: open
    };
})();