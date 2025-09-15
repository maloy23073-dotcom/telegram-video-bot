const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Хранилище для WebRTC офферов (временное, для демо)
const calls = new Map();

// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Сигнальный сервер для WebRTC
app.post('/signal', (req, res) => {
  const { callId, type, data } = req.body;
  
  if (!calls.has(callId)) {
    calls.set(callId, {});
  }
  
  const callData = calls.get(callId);
  
  switch (type) {
    case 'offer':
      callData.offer = data;
      res.json({ status: 'offer received' });
      break;
      
    case 'answer':
      callData.answer = data;
      res.json({ status: 'answer received' });
      break;
      
    case 'get-offer':
      res.json({ offer: callData.offer || null });
      break;
      
    case 'get-answer':
      res.json({ answer: callData.answer || null });
      break;
      
    default:
      res.status(400).json({ error: 'Unknown signal type' });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});