// start.js - запускает и сервер и бота одновременно
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Telegram Video Bot...');
console.log('📋 Starting both server and bot processes');

// Запускаем сервер
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname
});

// Запускаем бота с небольшой задержкой
setTimeout(() => {
    console.log('🤖 Starting bot process...');
    const bot = spawn('node', ['bot.js'], {
        stdio: 'inherit',
        cwd: __dirname
    });

    bot.on('error', (error) => {
        console.error('❌ Bot process error:', error);
    });

    bot.on('exit', (code) => {
        console.log(`🤖 Bot process exited with code ${code}`);
    });
}, 2000);

// Обработка ошибок
server.on('error', (error) => {
    console.error('❌ Server process error:', error);
});

server.on('exit', (code) => {
    console.log(`🌐 Server process exited with code ${code}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});