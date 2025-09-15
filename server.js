const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Health check endpoint - ОБЯЗАТЕЛЬНО ДОБАВЬТЕ
app.get('/health', (req, res) => {
    console.log('Health check passed at', new Date().toISOString());
    res.status(200).send('OK');
});

// Основной маршрут
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Video Call Server</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 50px; 
                    background: #667eea;
                    color: white;
                }
            </style>
        </head>
        <body>
            <h1>✅ Video Call Server is Running</h1>
            <p>Health check: <a href="/health" style="color: white;">/health</a></p>
        </body>
        </html>
    `);
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});