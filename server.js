require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// WebRTC signaling
const activeCalls = new Map();

app.post('/signal', (req, res) => {
    try {
        const { callCode, type, data } = req.body;

        if (!callCode) {
            return res.status(400).json({ error: 'callCode is required' });
        }

        if (!type) {
            return res.status(400).json({ error: 'type is required' });
        }

        if (!activeCalls.has(callCode)) {
            activeCalls.set(callCode, {
                offers: new Map(),
                answers: new Map(),
                candidates: new Map(),
                createdAt: Date.now()
            });
        }

        const callData = activeCalls.get(callCode);

        switch (type) {
            case 'offer':
                callData.offers.set(data.userId, data.offer);
                break;

            case 'answer':
                callData.answers.set(data.userId, data.answer);
                break;

            case 'ice-candidate':
                if (!callData.candidates.has(data.userId)) {
                    callData.candidates.set(data.userId, []);
                }
                callData.candidates.get(data.userId).push(data.candidate);
                break;

            case 'get-offers':
                return res.json({ offers: Array.from(callData.offers.entries()) });

            case 'get-answers':
                return res.json({ answers: Array.from(callData.answers.entries()) });

            case 'get-candidates':
                const userCandidates = callData.candidates.get(data.userId) || [];
                return res.json({ candidates: userCandidates });

            case 'leave-call':
                callData.offers.delete(data.userId);
                callData.answers.delete(data.userId);
                callData.candidates.delete(data.userId);
                break;

            default:
                return res.status(400).json({ error: 'Invalid type' });
        }

        res.json({ status: 'success', callCode });

    } catch (error) {
        console.error('Signal error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Очистка неактивных звонков
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    for (const [callCode, callData] of activeCalls.entries()) {
        if (now - callData.createdAt > oneHour) {
            activeCalls.delete(callCode);
            console.log(`Cleaned up inactive call: ${callCode}`);
        }
    }
}, 30 * 60 * 1000);

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WebRTC Server running on port ${PORT}`);
});