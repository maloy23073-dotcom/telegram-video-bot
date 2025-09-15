// start.js - запускает и сервер и бота
console.log('🚀 Starting server and bot simultaneously...');

// Запускаем сервер
require('./server.js');

// Даем серверу время запуститься, потом запускаем бота
setTimeout(() => {
    console.log('🤖 Starting bot...');
    try {
        require('./bot.js');
        console.log('✅ Bot started successfully');
    } catch (error) {
        console.error('❌ Bot failed to start:', error);
    }
}, 3000);