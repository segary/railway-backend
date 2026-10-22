const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());

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

// 時刻表 API (維持不變)
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

// 票價 API (維持不變)
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

// 完整停靠站 API (最終修正版)
app.get('/api/stops', async (req, res) => {
    try {
        const { trainNo, date } = req.query;
        if (!trainNo || !date) return res.status(400).json({ error: '缺少參數' });
        
        const token = await getTDXToken();
        
        // 關鍵修正：改用 v3 的 TrainNo 與 TrainDate 路徑格式
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/TrainNo/${trainNo}/TrainDate/${date}?$format=JSON`;
        
        const response = await axios.get(tdxUrl, { headers: { Authorization: `Bearer ${token}` } });
        res.json(response.data);
    } catch (error) {
        console.error('TDX 停靠站錯誤:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: '停靠站錯誤', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`後端伺服器正在 http://localhost:${PORT} 運行中...`);
});