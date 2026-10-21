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

app.get('/api/timetable', async (req, res) => {
    try {
        const { origin, destination, date } = req.query;

        if (!origin || !destination || !date) {
            return res.status(400).json({ error: '請提供 origin, destination, date 參數' });
        }

        const token = await getTDXToken();
        
        // 方案一：v3 端点，日期格式保持 YYYY-MM-DD
        const tdxUrl = `https://tdx.transportdata.tw/api/basic/v3/Rail/TRA/DailyTrainTimetable/OD/${origin}/to/${destination}/${date}?$format=JSON`;

        const response = await axios.get(tdxUrl, {
            headers: { Authorization: `Bearer ${token}` }
        });

        res.json(response.data);
    } catch (error) {
        console.error('TDX API 錯誤詳細資訊:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: '無法取得時刻表資料', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`後端伺服器正在 http://localhost:${PORT} 運行中...`);
});