require('dotenv').config(); // Добавьте эту строку в самом начале

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Main route
app.get('/', (req, res) => {
    const publicPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(publicPath)) {
        res.sendFile(publicPath);
    } else {
        res.send('Video Call Server is Running');
    }
});

// WebRTC signaling
const calls = new Map();
app.post('/signal', (req, res) => {
    try {
        const { callId, type, data } = req.body;
        if (!callId) {
            return res.status(400).json({ error: 'callId is required' });
        }

        if (!calls.has(callId)) {
            calls.set(callId, {});
        }

        const callData = calls.get(callId);
        switch (type) {
            case 'offer':
                callData.offer = data;
                break;
            case 'answer':
                callData.answer = data;
                break;
            case 'get-offer':
                return res.json({ offer: callData.offer });
            case 'get-answer':
                return res.json({ answer: callData.answer });
            case 'ice-candidate':
                if (!callData.candidates) callData.candidates = [];
                callData.candidates.push(data);
                break;
            case 'get-candidates':
                return res.json({ candidates: callData.candidates || [] });
            default:
                return res.status(400).json({ error: 'Invalid type' });
        }
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Signal error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});