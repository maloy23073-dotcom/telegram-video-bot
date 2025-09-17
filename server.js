require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);

// Используем порт из переменных окружения или 3000 по умолчанию
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint для Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'telegram-video-bot'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Telegram Video Bot Server',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            signal: '/signal (POST)'
        }
    });
});

// ... остальной код server.js без изменений ...