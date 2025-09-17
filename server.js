require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.ALLOWED_ORIGINS?.split(',') || []
        : '*'
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); // Serve from root

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Main route
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({
            message: 'Video Call Server is Running',
            version: '1.0.0',
            endpoints: {
                health: '/health',
                signal: '/signal (POST)',
                stats: '/stats'
            }
        });
    }
});

// Call page
app.get('/call.html', (req, res) => {
    const callPath = path.join(__dirname, 'call.html');
    if (fs.existsSync(callPath)) {
        res.sendFile(callPath);
    } else {
        res.status(404).json({ error: 'Call page not found' });
    }
});

// Статистика вызовов
app.get('/stats', (req, res) => {
    const stats = {
        totalCalls: calls.size,
        activeCalls: Array.from(calls.entries()).filter(([_, data]) =>
            data.offer || data.answer
        ).length,
        calls: Array.from(calls.entries()).map(([callId, data]) => ({
            callId,
            hasOffer: !!data.offer,
            hasAnswer: !!data.answer,
            candidateCount: data.candidates ? data.candidates.length : 0,
            createdAt: data.createdAt || 'unknown'
        }))
    };
    res.json(stats);
});

// Очистка старых вызовов (каждый час)
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [callId, callData] of calls.entries()) {
        if (callData.createdAt && (now - callData.createdAt > oneHour)) {
            calls.delete(callId);
            console.log(`Cleaned up old call: ${callId}`);
        }
    }
}, 60 * 60 * 1000);

// WebRTC signaling
const calls = new Map();

app.post('/signal', (req, res) => {
    try {
        const { callId, type, data } = req.body;

        if (!callId) {
            return res.status(400).json({
                error: 'callId is required',
                code: 'MISSING_CALL_ID'
            });
        }

        if (!type) {
            return res.status(400).json({
                error: 'type is required',
                code: 'MISSING_TYPE'
            });
        }

        if (!calls.has(callId)) {
            calls.set(callId, {
                createdAt: Date.now(),
                candidates: []
            });
        }

        const callData = calls.get(callId);

        switch (type) {
            case 'offer':
                callData.offer = data;
                callData.offerTimestamp = Date.now();
                console.log(`Offer received for call: ${callId}`);
                break;

            case 'answer':
                if (!callData.offer) {
                    return res.status(400).json({
                        error: 'No offer found for this call',
                        code: 'NO_OFFER'
                    });
                }
                callData.answer = data;
                callData.answerTimestamp = Date.now();
                console.log(`Answer received for call: ${callId}`);
                break;

            case 'get-offer':
                if (!callData.offer) {
                    return res.status(404).json({
                        error: 'Offer not found',
                        code: 'OFFER_NOT_FOUND'
                    });
                }
                return res.json({
                    offer: callData.offer,
                    timestamp: callData.offerTimestamp
                });

            case 'get-answer':
                if (!callData.answer) {
                    return res.status(404).json({
                        error: 'Answer not found',
                        code: 'ANSWER_NOT_FOUND'
                    });
                }
                return res.json({
                    answer: callData.answer,
                    timestamp: callData.answerTimestamp
                });

            case 'ice-candidate':
                if (!data || !data.candidate) {
                    return res.status(400).json({
                        error: 'Invalid candidate data',
                        code: 'INVALID_CANDIDATE'
                    });
                }
                callData.candidates.push({
                    candidate: data.candidate,
                    sdpMid: data.sdpMid,
                    sdpMLineIndex: data.sdpMLineIndex,
                    timestamp: Date.now()
                });
                console.log(`ICE candidate received for call: ${callId}`);
                break;

            case 'get-candidates':
                return res.json({
                    candidates: callData.candidates || [],
                    count: callData.candidates ? callData.candidates.length : 0
                });

            case 'end-call':
                calls.delete(callId);
                console.log(`Call ended: ${callId}`);
                return res.json({ status: 'call ended' });

            default:
                return res.status(400).json({
                    error: 'Invalid type',
                    code: 'INVALID_TYPE',
                    validTypes: [
                        'offer', 'answer', 'get-offer', 'get-answer',
                        'ice-candidate', 'get-candidates', 'end-call'
                    ]
                });
        }

        res.json({
            status: 'success',
            callId,
            type,
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('Signal error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

// Обработка 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl
    });
});

// Глобальная обработка ошибок
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        code: 'SERVER_ERROR'
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
    console.log(`📈 Statistics available at http://localhost:${PORT}/stats`);
});