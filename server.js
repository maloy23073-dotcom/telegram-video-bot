const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint - ОБЯЗАТЕЛЬНЫЙ для Render
app.get('/health', (req, res) => {
    console.log('✅ Health check passed');
    res.status(200).send('OK');
});

// Основной маршрут
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Video Call Server</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    text-align: center; 
                    padding: 50px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                    margin: 0;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                }
                a {
                    color: #fff;
                    text-decoration: underline;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎥 Video Call Server</h1>
                <p>Server is running successfully on Render!</p>
                <p>✅ <a href="/health">Health Check</a> - should return "OK"</p>
                <p>🔄 <a href="/">Main Page</a> - this page</p>
            </div>
        </body>
        </html>
    `);
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`✅ Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 Main page: http://localhost:${PORT}/`);
});