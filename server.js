require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Используем порт из переменных окружения или 3001 по умолчанию
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация PostgreSQL
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    },
    logging: false
});

// Модель для хранения сигналов WebRTC
const Signal = sequelize.define('Signal', {
    call_code: DataTypes.STRING,
    user_id: DataTypes.INTEGER,
    type: DataTypes.STRING, // offer, answer, ice-candidate
    data: DataTypes.TEXT,   // JSON данные сигнала
}, { timestamps: true });

// Хранилище активных соединений
const connections = new Map();

// WebSocket соединения
wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const callCode = urlParams.get('call_code');
    const userId = urlParams.get('user_id');

    if (!callCode || !userId) {
        ws.close();
        return;
    }

    // Сохраняем соединение
    const connectionId = `${callCode}_${userId}`;
    connections.set(connectionId, ws);
    console.log(`✅ User ${userId} connected to call ${callCode}`);

    // Отправляем историю сигналов новому участнику
    Signal.findAll({
        where: { call_code: callCode },
        order: [['createdAt', 'ASC']]
    }).then(signals => {
        signals.forEach(signal => {
            if (signal.user_id !== parseInt(userId)) {
                ws.send(JSON.stringify({
                    type: signal.type,
                    data: JSON.parse(signal.data),
                    from: signal.user_id
                }));
            }
        });
    });

    // Обработка входящих сообщений
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);

            // Сохраняем сигнал в базу данных
            await Signal.create({
                call_code: callCode,
                user_id: userId,
                type: message.type,
                data: JSON.stringify(message.data)
            });

            // Пересылаем сигнал всем участникам, кроме отправителя
            connections.forEach((client, id) => {
                if (id !== connectionId && id.startsWith(callCode) && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: message.type,
                        data: message.data,
                        from: userId
                    }));
                }
            });
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    // Обработка закрытия соединения
    ws.on('close', () => {
        connections.delete(connectionId);
        console.log(`❌ User ${userId} disconnected from call ${callCode}`);
    });
});

// REST endpoint для сигналов (для совместимости)
app.post('/signal', async (req, res) => {
    try {
        const { callCode, type, data, userId } = req.body;

        // Сохраняем сигнал в базу данных
        await Signal.create({
            call_code: callCode,
            user_id: userId,
            type: type,
            data: JSON.stringify(data)
        });

        // Отправляем успешный ответ
        res.json({ status: 'ok' });
    } catch (error) {
        console.error('Signal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint для Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'telegram-video-signaling'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Telegram Video Signaling Server',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            signal: '/signal (POST)',
            websocket: '/ (WebSocket)'
        }
    });
});

// Инициализация базы данных
async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ Signaling PostgreSQL connected successfully');

        await sequelize.sync({ force: false });
        console.log('✅ Signaling database tables synchronized');
    } catch (error) {
        console.error('❌ Signaling database initialization error:', error);
    }
}

// Запуск сервера
initializeDatabase().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Signaling server running on port ${PORT}`);
    });
});

module.exports = app;