const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors()); // 允許前端跨域呼叫

// ==========================================
// 1. 取得 TDX Access Token 的函式 (含快取機制)
// ==========================================
let cachedToken = null;
let tokenExpiry = 0;

async function getTDXToken() {
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken; // 如果還沒過期，直接回傳快取的 Token
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
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 提前 1 分鐘過期
    return cachedToken;
}

// ==========================================
// 2. 查詢時刻表 API (原有功能)
// ==========================================
app.get('/api/timetable', async (req, res) => {
    try {
        const { origin, destination, date } = req.query;

        if (!origin || !destination || !date) {
            return res.status(400).json({ error: '請提供 origin, destination, date 參數' });
        }

        const token = await getTDXToken();
        
        // 使用 v3 的 DailyTrainTimetable 端點，日期格式為 YYYY-MM-DD
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/${origin}/to/${destination}/${date}?$format=JSON`;

        const response = await axios.get(tdxUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        res.json(response.data);
    } catch (error) {
        console.error('TDX 時刻表 API 錯誤:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: '無法取得時刻表資料', details: error.message });
    }
});

// ==========================================
// 3. 查詢票價 API (原有功能)
// ==========================================
app.get('/api/fare', async (req, res) => {
    try {
        const { origin, destination } = req.query;

        if (!origin || !destination) {
            return res.status(400).json({ error: '請提供 origin 和 destination 參數' });
        }

        const token = await getTDXToken();
        
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v2/Rail/TRA/ODFare/${origin}/to/${destination}?$format=JSON`;

        const response = await axios.get(tdxUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        res.json(response.data);
    } catch (error) {
        console.error('TDX 票價 API 錯誤:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: '無法取得票價資料', details: error.message });
    }
});

// ==========================================
// 4. 查詢單一班次完整停靠站 API (全新功能)
// ==========================================
app.get('/api/stops', async (req, res) => {
    try {
        const { trainNo, date } = req.query;

        if (!trainNo || !date) {
            return res.status(400).json({ error: '請提供 trainNo 和 date 參數' });
        }

        const token = await getTDXToken();
        
        // 使用 TDX v3 的特定車次時刻表端點，取得完整停靠站
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/TrainNo/${trainNo}/TrainDate/${date}?$format=JSON`;

        const response = await axios.get(tdxUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        res.json(response.data);
    } catch (error) {
        console.error('TDX 停靠站 API 錯誤:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: '無法取得停靠站資料', details: error.message });
    }
});

// ==========================================
// 5. 啟動伺服器
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`後端伺服器正在 http://localhost:${PORT} 運行中...`);
});