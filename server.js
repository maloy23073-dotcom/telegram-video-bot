const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint - ОБЯЗАТЕЛЬНО ДОБАВЬТЕ ЭТО
app.get('/health', (req, res) => {
    console.log('Health check passed');
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
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
            </style>
        </head>
        <body>
            <h1>🎥 Video Call Server</h1>
            <p>Server is running successfully!</p>
            <p>Health check: <a href="/health" style="color: white;">/health</a></p>
        </body>
        </html>
    `);
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
});