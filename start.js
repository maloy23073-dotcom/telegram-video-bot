console.log('🚀 Starting server and bot...');

// Загрузка переменных окружения
require('dotenv').config();

// Проверка обязательных переменных
if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required!');
    process.exit(1);
}

if (!process.env.WEB_APP_URL) {
    console.warn('⚠️  WEB_APP_URL not set, using default');
    process.env.WEB_APP_URL = 'https://your-mini-app.com';
}

console.log('=== ENVIRONMENT VARIABLES ===');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Set' : '❌ Not set');
console.log('WEB_APP_URL:', process.env.WEB_APP_URL);
console.log('PORT:', process.env.PORT || 3000);

// Start server
console.log('🔄 Starting server...');
try {
    require('./server.js');
    console.log('✅ Server started successfully');
} catch (error) {
    console.error('❌ Server failed to start:', error.message);
    process.exit(1);
}

// Start bot with delay to ensure server is ready
console.log('⏳ Starting bot in 3 seconds...');
setTimeout(() => {
    try {
        require('./bot.js');
        console.log('✅ Bot started successfully');
        console.log('🎉 All systems operational!');
    } catch (error) {
        console.error('❌ Bot failed to start:', error.message);
        process.exit(1);
    }
}, 3000);

// Обработка graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});