console.log('🚀 Starting server and bot...');

// Start server
try {
    require('./server.js');
    console.log('✅ Server started');
} catch (error) {
    console.error('❌ Server failed:', error);
}

// Start bot with delay
setTimeout(() => {
    try {
        require('./bot.js');
        console.log('✅ Bot started');
    } catch (error) {
        console.error('❌ Bot failed:', error);
    }
}, 3000);