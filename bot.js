require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const express = require('express');

// ===== КОНФИГУРАЦИЯ =====
const TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-mini-app.com';
const PORT = process.env.PORT || 3000;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || `https://your-render-app.onrender.com`;

// Проверка обязательных переменных
if (!TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required!');
    process.exit(1);
}

console.log('=== BOT CONFIGURATION ===');
console.log('BOT_TOKEN:', TOKEN ? '✅ Set' : '❌ Not set');
console.log('WEB_APP_URL:', WEB_APP_URL);
console.log('RENDER_URL:', RENDER_URL);

// Инициализация БД
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Database error:', err);
    else console.log('✅ Database connected');
});

// Инициализация Express для Webhooks
const app = express();
app.use(express.json());

// Инициализация бота с Webhooks
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${RENDER_URL}/bot${TOKEN}`);

// Webhook endpoint
app.post(`/bot${TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'telegram-bot' });
});

// Функция инициализации базы данных
function initializeDatabase() {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ Users table error:', err);
        else console.log('✅ Users table ready');
    });

    // Таблица звонков
    db.run(`CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_code TEXT UNIQUE NOT NULL,
        creator_id INTEGER NOT NULL,
        creator_username TEXT,
        call_name TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME
    )`, (err) => {
        if (err) console.error('❌ Calls table error:', err);
        else console.log('✅ Calls table ready');
    });

    // Таблица участников звонков
    db.run(`CREATE TABLE IF NOT EXISTS call_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME,
        FOREIGN KEY (call_id) REFERENCES calls (id)
    )`, (err) => {
        if (err) console.error('❌ Call participants table error:', err);
        else console.log('✅ Call participants table ready');
    });
}

// Вызов инициализации БД
initializeDatabase();

// Функция для сохранения/обновления информации о пользователе
function saveUser(user) {
    db.run(
        `INSERT OR REPLACE INTO users (user_id, username, first_name, last_name) 
         VALUES (?, ?, ?, ?)`,
        [user.id, user.username, user.first_name, user.last_name],
        (err) => {
            if (err) console.error('❌ Save user error:', err);
        }
    );
}

// Генерация 6-символьного кода
const generateCallCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// ===== ОБРАБОТЧИКИ КОМАНД =====

// /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    const keyboard = {
        inline_keyboard: [
            [{ text: "📞 Создать звонок", callback_data: 'new_call' }],
            [{ text: "🔗 Присоединиться к звонку", callback_data: 'join_call' }],
            [{ text: "📋 Мои звонки", callback_data: 'my_calls' }]
        ]
    };

    const text = `👋 Привет! Я бот для видеозвонков в Telegram Mini App.`;

    bot.sendMessage(chatId, text, { reply_markup: keyboard });
});

// Обработка callback кнопок
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    try {
        if (data === 'new_call') {
            await handleNewCall(chatId, callbackQuery.from);
        } else if (data === 'join_call') {
            await handleJoinCall(chatId);
        } else if (data === 'my_calls') {
            await handleMyCalls(chatId);
        }
    } catch (error) {
        console.error('Callback error:', error);
        bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте снова.");
    }

    bot.answerCallbackQuery(callbackQuery.id);
});

// ... остальные обработчики команд (handleNewCall, handleJoinCall, etc.)
// должны быть такими же как в предыдущей версии

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bot server running on port ${PORT}`);
    console.log(`🌐 Webhook URL: ${RENDER_URL}/bot${TOKEN}`);
});

// Обработчики ошибок
bot.on('error', (error) => console.error('❌ Bot error:', error));
bot.on('polling_error', (error) => console.error('❌ Polling error:', error));

console.log('✅ Bot configured for Webhooks');