/**
 * osm_network_builder.js
 * 極簡版：只產生 Link (道路)，完全不產生 Node 物件。
 * 避免畫面上出現路口控制點或圖示，交由使用者後續自行處理。
 */
const OSMNetworkBuilder = (() => {

    const CONFIG = {
        defaultLanes: 1,
        laneWidth: 3.5,
        overpassUrl: 'https://overpass-api.de/api/interpreter',
    };

    let lCounter = 0, nCounter = 0;
    const prefix = `osm_${Math.floor(Date.now()/1000)}_`;

    // --------------------------------------------------------
    // [1. 數學函式庫]
    // --------------------------------------------------------
    const MathLib = {
        getVector: (p1, p2) => ({ x: p2.x - p1.x, y: p2.y - p1.y }),
        vecLen: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
        normalize: (v) => { const l = Math.sqrt(v.x*v.x + v.y*v.y); return l > 0 ? { x: v.x/l, y: v.y/l } : { x: 0, y: 0 }; },
        getNormal: (v) => ({ x: -v.y, y: v.x }),
        add: (p1, p2) => ({ x: p1.x + p2.x, y: p1.y + p2.y }),
        scale: (v, s) => ({ x: v.x * s, y: v.y * s }),
    };

    // --------------------------------------------------------
    // [2. 主流程]
    // --------------------------------------------------------
    async function generate(bgData, options = {}, callback) {
        // 1. 下載資料
        const osmData = await fetchOSMData(bgData.geoBounds);
        if (!osmData) return;

        // 2. 基礎生成 (只產生 Link)
        let { newLinks } = buildBaseNetwork(osmData, bgData);

        // 3. 回傳結果
        // newNodes 回傳空物件，確保主程式不會繪製任何節點圖示
        if (callback) callback({ 
            newLinks: newLinks, 
            newNodes: {}, // <--- 關鍵：空物件，沒有 Node
            newConnections: {}, 
            newTFLs: {} 
        });
    }

    // --------------------------------------------------------
    // [3. 路網建構]
    // --------------------------------------------------------
    function createLink(linkStore, points, lanes, sNodeId, eNodeId, name, suffix, tags = {}) {
        const id = `${prefix}link_${++lCounter}${suffix}`;
        const laneObjs = Array.from({ length: lanes }, () => ({ width: CONFIG.laneWidth }));
        
        const link = {
            id, 
            type: 'Link', 
            waypoints: points, 
            lanes: laneObjs,
            startNodeId: sNodeId, // 仍保留 ID 參照，但對應的物件不存在
            endNodeId: eNodeId,   // 仍保留 ID 參照
            name: name ? `${name} ${suffix}` : id,
            tags: tags,
            konvaGroup: new Konva.Group({ id, draggable: false }),
            konvaHandles: []
        };
        linkStore[id] = link;
        return link;
    }

    function buildBaseNetwork(osmData, bgData) {
        const newLinks = {};
        const osmNodes = {};
        const osmWays = [];
        const nodeUsage = {};

        // 解析 OSM 資料結構
        osmData.elements.forEach(el => {
            if (el.type === 'node') {
                osmNodes[el.id] = { lat: el.lat, lon: el.lon };
            } else if (el.type === 'way') {
                osmWays.push(el);
                el.nodes.forEach((nid, idx) => {
                    nodeUsage[nid] = (nodeUsage[nid] || 0) + 1;
                    if (idx === 0 || idx === el.nodes.length - 1) nodeUsage[nid] += 999;
                });
            }
        });

        // 建立 OSM ID 對應 編輯器 ID 的映射表
        // 雖然我們不產生 Node 物件，但我們需要產生 Node ID
        // 這樣 Link 才能知道自己「邏輯上」連接到哪裡 (startNodeId / endNodeId)
        const osmIdToEditorId = {};

        for (const [nid, count] of Object.entries(nodeUsage)) {
            if (count > 1) {
                // 產生一個虛擬的 Node ID，但不建立實體物件
                const nodeId = `${prefix}node_${++nCounter}`;
                osmIdToEditorId[nid] = nodeId;
            }
        }

        // 生成 Links
        osmWays.forEach(way => {
            if (way.nodes.length < 2) return;
            const tags = way.tags || {};
            const isOneWay = tags.oneway === 'yes';
            let numLanes = parseInt(tags.lanes, 10) || 1;
            
            if (!isOneWay && numLanes > 1 && numLanes % 2 === 0) numLanes /= 2;

            let segment = [];
            for (let i = 0; i < way.nodes.length; i++) {
                const nid = way.nodes[i];
                const nodeData = osmNodes[nid];
                if (!nodeData) continue; // 防呆

                const pos = project(nodeData.lat, nodeData.lon, bgData);
                segment.push(pos);

                // 檢查此點是否為邏輯上的斷點 (交叉口或端點)
                const endNodeId = osmIdToEditorId[nid];
                
                if (endNodeId && segment.length > 1) {
                    const startNid = way.nodes[i - segment.length + 1];
                    const startNodeId = osmIdToEditorId[startNid];

                    if (startNodeId && endNodeId) {
                        const offset = (numLanes * CONFIG.laneWidth / 2) + 0.5;
                        
                        // 建立 Links，不傳入 nodeStore，因為我們不想更新 Node 的連結關係
                        if (true) {
                            let pts = JSON.parse(JSON.stringify(segment));
                            if (!isOneWay) pts = getOffsetPoints(pts, offset);
                            createLink(newLinks, pts, numLanes, startNodeId, endNodeId, tags.name, "_F", tags);
                        }
                        if (!isOneWay) {
                            let pts = JSON.parse(JSON.stringify(segment)).reverse();
                            pts = getOffsetPoints(pts, offset);
                            createLink(newLinks, pts, numLanes, endNodeId, startNodeId, tags.name, "_B", tags);
                        }
                    }
                    segment = [pos];
                } else if (endNodeId) { 
                    segment = [pos]; 
                }
            }
        });

        return { newLinks };
    }

    // --------------------------------------------------------
    // [4. 輔助函式]
    // --------------------------------------------------------
    async function fetchOSMData(bounds) {
        const query = `
            [out:json][timeout:25];
            (
              way["highway"]
                 ["highway"!~"footway|cycleway|path|steps|pedestrian|track|service|corridor|elevator|platform|construction"]
                 (${bounds.south},${bounds.west},${bounds.north},${bounds.east});
            );
            out body;
            >;
            out skel qt;
        `;
        try {
            const response = await fetch(CONFIG.overpassUrl, {
                method: 'POST', body: 'data=' + encodeURIComponent(query)
            });
            if (!response.ok) throw new Error("API Error");
            return await response.json();
        } catch (e) {
            console.error(e); alert("OSM Fetch Failed"); return null;
        }
    }

    function project(lat, lon, bgData) {
        const bounds = bgData.geoBounds;
        const latRange = bounds.north - bounds.south;
        const lonRange = bounds.east - bounds.west;
        const yRatio = (bounds.north - lat) / latRange; 
        const xRatio = (lon - bounds.west) / lonRange;
        return { 
            x: bgData.x + xRatio * bgData.width, 
            y: bgData.y + yRatio * bgData.height 
        };
    }

    function getOffsetPoints(points, offset) {
        if (points.length < 2) return points;
        const newPts = [];
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            let n;
            if (i < points.length - 1) n = MathLib.getNormal(MathLib.normalize(MathLib.getVector(p, points[i+1])));
            else n = MathLib.getNormal(MathLib.normalize(MathLib.getVector(points[i-1], p)));
            newPts.push(MathLib.add(p, MathLib.scale(n, offset)));
        }
        return newPts;
    }

    return { generate };
})();