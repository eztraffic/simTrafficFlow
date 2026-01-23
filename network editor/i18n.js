// --- i18n.js ---

const I18N = {
    // 預設語言 (會被 localStorage 或 init 覆寫)
    lang: 'zh',

    // 字典檔
    dict: {
        "zh": {
            // --- 1. Navbar & Toolbar (頂部與工具列) ---
            "Properties": "屬性",
            "Import": "匯入",
            "Import from .sim": "匯入 .sim 檔案",
            "Export": "匯出",
            "Export network to .sim file": "匯出成 .sim 檔案",
            "Select": "選取",
            "Select (V)": "選取 (V)",
            "Link": "路段",
            "Add Link (L)": "新增路段 (L)",
            "Connect": "連接車道",
            "Connect Lanes (C)": "連接車道 (C)",
            "Marking": "標線",
            "Add Marking (K)": "新增標線 (K)",
            "Signal": "號誌",
            "Traffic Light (T)": "編輯號誌 (T)",
            "Flow": "車流",
            "Add Flow (F)": "新增車流 (F)",
            "Sign": "標誌",
            "Speed Sign (R)": "速限標誌 (R)",
            "Pt. Det.": "點偵測",
            "Point Detector (P)": "點偵測器 (P)",
            "Sec. Det.": "區間偵測",
            "Section Detector (S)": "區間偵測器 (S)",
            "Parking": "停車場",
            "Parking Lot (P)": "停車場 (P)",
            "Gate": "出入口",
            "Parking Gate (Shift+P)": "停車場出入口 (Shift+P)",
            "Measure": "測量",
            "Measure (M)": "測量工具 (M)",
            "Image": "背景圖",
            "Background Image (B)": "背景圖片 (B)",
            "Geo Pin": "座標釘",
            "Add Geo Pin (G)": "新增座標釘 (G)",
            "lock(鎖定背景)": "鎖定背景",
            "Ready": "就緒",
            "Editor": "編輯器",

            // --- 2. Status Bar (狀態列提示) ---
            "Tool": "工具",
            "Click to start, click to add points, right-click to finish.": "左鍵點擊開始/增加節點，右鍵點擊結束繪製。",
            "Click to start, click to add points, right-click to finish measurement.": "左鍵點擊開始/增加節點，右鍵點擊結束測量。",
            "Click on an empty area to add a background image placeholder.": "點擊空白區域以新增背景圖片框。",
            "Drag from a red port (lane end) to a blue port (lane start).": "拖曳紅色端點 (車道末端) 至藍色端點 (車道起點) 以建立連接。",
            "Click on an intersection (node) to edit its traffic light schedule.": "點擊路口 (Node) 以編輯交通號誌時相。",
            "點擊 Link 前半段新增起點 (紅色)，點擊後半段新增迄點 (綠色)。": "點擊路段前半部新增起點 (紅)，點擊後半部新增迄點 (綠)。",
            "Click on a Link to place a new speed sign.": "點擊路段以設置速限標誌。",
            "Click to select. Drag a link's handles to edit path. Alt+Click on a link to add a handle. Press DEL to delete.": "點擊選取。拖曳控制點改變路徑。Alt+點擊路段可增加控制點。按 DEL 刪除。",
            "Click on the canvas to place a coordinate reference pin (Max 2).": "點擊畫布以設置座標參考釘 (最多2個)。",
            "Click to add polygon points. Double-click to finish.": "點擊新增多邊形頂點，雙擊結束繪製。",
            "Drag to create a rectangle representing an Entrance or Exit on a Parking Lot boundary.": "在停車場邊界上拖曳出矩形以建立出入口。",

            // --- 3. Properties Panel (屬性面板) ---
            "Select an element on the canvas to see its properties.": "在畫布上選取物件以查看屬性。",
            "Back to Node": "返回節點",

            // Common
            "General": "一般屬性",
            "Name": "名稱",
            "ID": "ID",
            "Actions": "操作",
            "Delete": "刪除",
            "Edit": "編輯",

            // Link
            "Geometry": "幾何資訊",
            "Length": "長度",
            "Total Width": "總寬度",
            "Lanes Configuration": "車道配置",
            "Count": "數量",
            "Individual Widths (m)": "個別車道寬度 (m)",
            "Tip:": "提示:",
            "Alt + Left Click on the road to add a shaping point.": "Alt + 左鍵點擊路段可增加塑形點。",

            // Node
            "Settings": "設定",
            "Links": "連接",
            "Signal Control": "號誌控制",
            "Status": "狀態",
            "Active": "啟用中",
            "No Signal": "無號誌",
            "Time Shift (s)": "時差 (秒)",
            "Edit Schedule": "編輯時相表",
            "Connection Groups": "連接群組",
            "(No Signal)": "(無號誌)",
            "Signal Group": "號誌群組",
            "None": "無",
            "Lanes Connected": "連接車道數",
            "Tools": "工具",
            "Redraw Connections": "重繪連接線",
            "Turning Ratios": "轉向比例",
            "Auto-Calc": "自動計算",
            "From": "來自",
            "To": "前往",
            "Connect links to configure flow ratios.": "連接路段以設定轉向比例。",

            // Detectors (Point/Section)
            "Parent Link": "所屬路段",
            "Position (m)": "位置 (m)",
            "Length (m)": "長度 (m)",
            "Traffic Data": "交通數據",
            "Observed Flow": "觀測流量",
            "Unit: Vehicles per Hour (veh/h)": "單位: 車輛/小時 (veh/h)",
            "Source Configuration": "車流來源設定",
            "Act as Flow Source": "作為車流產生源",
            "Vehicle Mix (Weighted)": "車種組成 (權重)",
            "Type": "種類",
            "Weight": "權重",
            "Add Vehicle Type": "新增車種",
            "Manage Definitions": "管理車種定義",

            // Road Sign
            "On Link": "位於路段",
            "Sign Type": "標誌類型",
            "Speed Limit Start": "速限起點",
            "Speed Limit End": "速限終點",
            "Speed Limit (km/h)": "速限 (km/h)",

            // Connection
            "Topology": "拓撲關係",
            "From Link": "來源路段",
            "From Lane": "來源車道",
            "To Link": "目標路段",
            "To Lane": "目標車道",
            "Via Node": "經過節點",
            "Delete Connection": "刪除連接",

            // Connection Group
            "Group Info": "群組資訊",
            "Total Connections": "連接總數",
            "Management": "管理",

            // Origin
            "Traffic Generation": "車流生成",
            "Configure Schedule": "設定排程",
            "Defines time-based vehicle spawn rates and destinations (OD Mode).": "定義基於時間的車流生成率與目的地 (OD 模式)。",

            // Destination
            "Vehicles reaching this point will be removed from the simulation.": "抵達此點的車輛將從模擬中移除。",

            // Background
            "Image Source": "圖片來源",
            "Replace Image...": "更換圖片...",
            "Format": "格式",
            "Appearance": "外觀",
            "Opacity (%)": "不透明度 (%)",
            "Scale": "縮放比例",
            "Dimensions (px)": "尺寸 (px)",
            "Width": "寬",
            "Height": "高",
            "Use the toggle button at the bottom right of the canvas to Lock/Unlock positioning.": "請使用畫布右下角的按鈕來鎖定/解鎖背景。",
            "Delete Background": "刪除背景",

            // Overpass
            "Top Layer": "上層路段",
            "Bottom Layer": "下層路段",
            "Swap Layer Order": "交換層級順序",

            // Pushpin
            "Canvas Position": "畫布座標",
            "Geo Reference": "地理座標參考",
            "Latitude": "緯度",
            "Longitude": "經度",
            "Used to align the simulation grid with real-world map coordinates (Max 2 pins).": "用於將模擬網格對齊真實地圖座標 (最多2個)。",
            "Delete Pin": "刪除圖釘",

            // Parking Lot
            "Cars": "汽車",
            "Motos": "機車",
            "Simulation Behavior": "模擬行為",
            "Attraction (%)": "吸引機率 (%)",
            "Stay Duration (min)": "停留時間 (分)",
            "Double-click on canvas to finish drawing polygon.": "雙擊畫布以完成多邊形繪製。",
            "Delete Parking Lot": "刪除停車場",

            // Parking Gate
            "Connection Status": "連接狀態",
            "Linked": "已連結",
            "Not Linked": "未連結",
            "Drag onto a Parking Lot boundary.": "請拖曳至停車場邊界上。",
            "Configuration": "配置",
            "Entry Only": "僅入口",
            "Exit Only": "僅出口",
            "Bi-directional": "雙向進出",
            "Rotation (deg)": "旋轉 (度)",
            "Delete Gate": "刪除出入口",

            // Road Marking
            "Stop Line": "停止線",
            "Waiting Area": "機車停等區",
            "Two-Stage Box": "機車待轉區",
            "Placement": "配置位置",
            "Parent Node": "所屬路口",
            "Origin Link": "來源路段",
            "Global X": "全域 X",
            "Global Y": "全域 Y",
            "Active Lanes": "生效車道",
            "Manual Positioning": "手動定位 (自由移動)",
            "You can now drag the box freely (e.g., into the intersection).": "您現在可以自由拖曳方框 (例如拖進路口中央)。",
            "Attached to link lanes. Check \"Manual Positioning\" to detach.": "目前依附於車道。勾選「手動定位」即可分離。",
            "Delete Marking": "刪除標線",

            // --- 4. Modals (彈窗內容) ---
            // Traffic Light Modal
            "Traffic Light Editor": "交通號誌編輯器",
            "Signal Groups": "號誌群組",
            "Phasing Schedule": "時相排程",
            "Manage Groups": "群組管理",
            "Group Name (e.g. S1)": "群組名稱 (如 S1)",
            "Add": "新增",
            "+ Add Phase": "+ 新增時相",
            "Done": "完成",
            "Duration (s)": "持續時間 (秒)",
            "Current:": "目前:",
            "(Click to toggle)": "(點擊切換)",

            // Spawner Modal
            "Vehicle Spawner Editor": "車流產生器編輯器",
            "Time Periods": "時間區段",
            "Vehicle Profiles": "車種參數",
            "+ Add Time Period": "+ 新增時間區段",
            "+ Add New Profile": "+ 新增車種設定",
            "Save Changes": "儲存變更",
            "Global Vehicle Profiles": "全域車種參數設定",
            "Remove": "移除",
            "Duration (sec)": "持續時間 (秒)",
            "Vehicle Count": "車輛總數",
            "Destinations": "目的地分配",
            "Node": "節點",
            "Vehicle Mix": "車種組成",
            "Profile": "參數檔",
            "Intermediate Stops": "中途停靠點",
            "Parking Lot": "停車場",
            "Enter Prob (%)": "進入機率 (%)",
            "Stay (min)": "停留 (分)",
            "Add Destination": "新增目的地",
            "Add Profile": "新增車種",
            "Add Parking Stop": "新增停靠點",
            "(Default Profile)": "(預設參數)",

            // Profile Params
            "Max Speed (m/s)": "最大速度 (m/s)",
            "Max Accel (m/s²)": "最大加速度 (m/s²)",
            "Comf. Decel (m/s²)": "舒適減速度 (m/s²)",
            "Min Gap (m)": "最小間距 (m)",
            "Headway (s)": "車頭時距 (s)",

            // Lane Range Selector Modal
            "CONNECTION SETTINGS": "連接設定",
            "SOURCE": "來源",
            "DEST": "目的",
            "Start Lane": "起始車道",
            "Confirm": "確認",
            "Update": "更新",

            // --- 5. Alerts & Confirms (提示訊息) ---
            "background already exists...": "背景已存在，無法新增。請先刪除現有背景。",
            "Parking lot must have at least 3 points.": "停車場至少需要 3 個頂點。",
            "Group name is empty or already exists.": "群組名稱為空或已存在。",
            "Invalid source lane range.": "來源車道範圍無效。",
            "Invalid destination lane range.": "目標車道範圍無效。",
            "Delete connection group from": "確定要刪除連接群組嗎？從",
            "Delete connection": "確定要刪除連接嗎？",
            "Max 2 Geo Pins allowed": "最多只能設定兩個座標圖釘。",
            "Error loading XML file.": "載入 XML 檔案時發生錯誤。",
            "Cancel": "取消",
        }
    },

    /**
     * 切換語言並更新介面
     */
    setLang: function (newLang) {
        this.lang = newLang;
        // 儲存設定
        localStorage.setItem('simTrafficFlow_lang', newLang);

        // 重新翻譯整個頁面
        this.translateDOM(document.body);

        // 更新下拉選單狀態 (防止程式內部觸發切換時 UI 不同步)
        const select = document.getElementById('languageSelect');
        if (select) select.value = newLang;

        // 如果目前有選取物件，刷新屬性面板以套用新語言
        // (需確保 editor.js 中的 updatePropertiesPanel 可被存取，通常是全域函數)
        if (typeof updatePropertiesPanel === 'function' && typeof selectedObject !== 'undefined') {
            updatePropertiesPanel(selectedObject);
        }

        // 更新狀態列
        if (typeof updateStatusBar === 'function') {
            updateStatusBar();
        }
    },

    /**
     * 核心翻譯函數 (純文字)
     */
    t: function (text) {
        if (!text) return "";
        // 如果是英文模式，直接回傳原文 (這裡假設代碼裡的原文都是英文)
        if (this.lang === 'en') return text;

        const dict = this.dict['zh']; // 目前只支援 zh 對應
        const trimmedText = text.trim();

        // 1. 直接查表
        if (dict[trimmedText]) return text.replace(trimmedText, dict[trimmedText]);

        // 2. 處理 "Key: Value" 格式
        const colonMatch = trimmedText.match(/^([^:]+)(:\s*)(.+)$/);
        if (colonMatch) {
            const key = colonMatch[1];
            if (dict[key]) return dict[key] + colonMatch[2] + colonMatch[3];
        }

        // 3. 處理 "Text (Key)" 格式
        const parenMatch = trimmedText.match(/^([^(]+)(\s*\(.+\))$/);
        if (parenMatch) {
            const key = parenMatch[1].trim();
            if (dict[key]) return dict[key] + parenMatch[2];
        }

        return text;
    },

    /**
     * DOM 翻譯函數 (支援來回切換)
     */
    translateDOM: function (element) {
        if (!element) return;

        // --- 1. 處理屬性 (Attributes) ---
        ['title', 'placeholder'].forEach(attr => {
            if (element.hasAttribute(attr)) {
                // 如果還沒有暫存原始值，先存起來
                if (!element.getAttribute(`data-i18n-orig-${attr}`)) {
                    element.setAttribute(`data-i18n-orig-${attr}`, element.getAttribute(attr));
                }

                // 讀取原始英文值
                const originalValue = element.getAttribute(`data-i18n-orig-${attr}`);

                // 根據當前語言設定值
                if (this.lang === 'zh') {
                    element.setAttribute(attr, this.t(originalValue));
                } else {
                    element.setAttribute(attr, originalValue);
                }
            }
        });

        // --- 2. 遍歷子節點 ---
        element.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                // 略過空白節點
                if (node.nodeValue.trim().length === 0) return;

                // 暫存原始英文文字到節點物件上 (不會顯示在 HTML DOM 結構中，但在記憶體裡)
                if (!node._i18nOrig) {
                    node._i18nOrig = node.nodeValue;
                }

                // 根據語言切換
                if (this.lang === 'zh') {
                    node.nodeValue = this.t(node._i18nOrig);
                } else {
                    node.nodeValue = node._i18nOrig;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // 忽略輸入框的 value，只翻譯 placeholder (已在上面處理)
                if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return;

                // 忽略語言選單本身 (避免選項文字跳動)
                if (node.id === 'languageSelect') return;

                // 遞迴處理
                this.translateDOM(node);
            }
        });
    }
};
