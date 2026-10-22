const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());

// ==========================================
// 1. 取得 TDX Access Token (含快取)
// ==========================================
let cachedToken = null;
let tokenExpiry = 0;

async function getTDXToken() {
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }
    const authUrl = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.TDX_CLIENT_ID);
    params.append('client_secret', process.env.TDX_CLIENT_SECRET);

    const response = await axios.post(authUrl, params, {
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
    });
    cachedToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
    return cachedToken;
}

// ==========================================
// 2. 時刻表 API
// ==========================================
app.get('/api/timetable', async (req, res) => {
    try {
        const { origin, destination, date } = req.query;
        if (!origin || !destination || !date) return res.status(400).json({ error: '缺少參數' });
        
        const token = await getTDXToken();
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/${origin}/to/${destination}/${date}?$format=JSON`;
        
        const response = await axios.get(tdxUrl, { headers: { Authorization: `Bearer ${token}` } });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: '時刻表錯誤', details: error.message });
    }
});

// ==========================================
// 3. 票價 API
// ==========================================
app.get('/api/fare', async (req, res) => {
    try {
        const { origin, destination } = req.query;
        if (!origin || !destination) return res.status(400).json({ error: '缺少參數' });
        
        const token = await getTDXToken();
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v2/Rail/TRA/ODFare/${origin}/to/${destination}?$format=JSON`;
        
        const response = await axios.get(tdxUrl, { headers: { Authorization: `Bearer ${token}` } });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: '票價錯誤', details: error.message });
    }
});

// ==========================================
// 4. 完整停靠站 API (使用 OD/Inclusive 端點)
// ==========================================
app.get('/api/stops', async (req, res) => {
    try {
        const { trainNo, date, origin, destination } = req.query;
        
        // 注意：這裡必須包含 origin 和 destination，因為我們改用了 Inclusive 端點
        if (!trainNo || !date || !origin || !destination) {
            return res.status(400).json({ error: '缺少參數 (需 trainNo, date, origin, destination)' });
        }

        const token = await getTDXToken();

        // 改用 OD/Inclusive 端點，它會回傳包含中間所有停靠站的完整陣列
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/Inclusive/${origin}/to/${destination}/${date}?$format=JSON`;

        const response = await axios.get(tdxUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        // 從回傳的所有班次中，篩選出使用者點擊的那個車次
        const allTrains = response.data.TrainTimetables || [];
        const targetTrain = allTrains.find(t => String(t.TrainInfo.TrainNo) === String(trainNo));

        if (!targetTrain) {
            return res.status(404).json({ error: `找不到車次 ${trainNo} 的資料` });
        }

        // 將單一班次的完整資料回傳給前端
        res.json(targetTrain);
    } catch (error) {
        console.error('TDX 停靠站錯誤:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: '停靠站錯誤', details: error.message });
    }
});

// ==========================================
// 5. 啟動伺服器
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`後端伺服器正在 http://localhost:${PORT} 運行中...`);
});