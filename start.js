console.log('🚀 Starting Telegram Video Bot...');

require('dotenv').config();

// Проверка обязательных переменных
if (!process.env.BOT_TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required!');
    process.exit(1);
}

console.log('=== ENVIRONMENT VARIABLES ===');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Set' : '❌ Not set');
console.log('WEB_APP_URL:', process.env.WEB_APP_URL || 'Not set');
console.log('PORT:', process.env.PORT || 3000);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Not set');

// Запускаем бота и сигнальный сервер
try {
    // Запускаем бота
    require('./bot.js');
    console.log('✅ Bot started successfully with Webhooks');

    // Запускаем сигнальный сервер на другом порту, если нужно
    if (process.env.RUN_SIGNALING_SERVER === 'true') {
        const signalingPort = parseInt(process.env.PORT || 3000) + 1;
        process.env.PORT = signalingPort;
        require('./server.js');
        console.log(`✅ Signaling server started on port ${signalingPort}`);
    }
} catch (error) {
    console.error('❌ Failed to start:', error.message);
    process.exit(1);
}

// Обработка graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});