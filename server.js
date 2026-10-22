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

// 1. 時刻表 API
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

// 2. 票價 API
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

// 3. 完整停靠站 API (最終修正版)
app.get('/api/stops', async (req, res) => {
    try {
        const { trainNo, date } = req.query;
        if (!trainNo || !date) return res.status(400).json({ error: '缺少參數' });
        
        const token = await getTDXToken();
        
        // 改用 TrainDate 查詢並用 $filter 過濾車次，這是 TDX 官方標準寫法
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/TrainDate/${date}?$filter=TrainNo eq '${trainNo}'&$format=JSON`;
        
        const response = await axios.get(tdxUrl, { headers: { Authorization: `Bearer ${token}` } });
        res.json(response.data);
    } catch (error) {
        // 如果 TDX 還是報錯，把詳細錯誤印出來
        console.error('TDX 停靠站錯誤:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: '停靠站錯誤', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`後端伺服器正在 http://localhost:${PORT} 運行中...`);
});