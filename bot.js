const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ===== КОНФИГУРАЦИЯ =====
const TOKEN = process.env.BOT_TOKEN;
const SERVER_URL = process.env.SERVER_URL || 'https://telegram-video-bot-vvfl.onrender.com';

// Проверка переменных окружения
console.log('=== BOT STARTING ===');
console.log('BOT_TOKEN:', TOKEN ? '✅ Set' : '❌ Not set');
console.log('SERVER_URL:', SERVER_URL);

if (!TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required!');
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
    polling: true,
    request: {
        timeout: 30000
    }
});

const db = new sqlite3.Database(path.join(__dirname, 'calls.db'));

// Обработчики ошибок
bot.on('error', (error) => console.error('❌ Bot error:', error));
bot.on('polling_error', (error) => console.error('❌ Polling error:', error));

// Проверка подключения
bot.getMe()
    .then((me) => console.log(`✅ Bot @${me.username} started`))
    .catch((error) => {
        console.error('❌ Bot auth failed:', error);
        process.exit(1);
    });

// Инициализация БД
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creator_id INTEGER NOT NULL,
        scheduled_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        status TEXT DEFAULT 'scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ Database error:', err);
        else console.log('✅ Database ready');
    });
});

// ===== КОМАНДА /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const text = `
👋 Привет! Я бот для видеозвонков в Telegram.

📋 Команды:
/newcall - Создать звонок
/mycalls - Мои звонки
/cancelcall - Отменить звонок
/help - Помощь
    `;
    bot.sendMessage(chatId, text).catch(console.error);
});

// ===== КОМАНДА /help =====
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const text = `
🎯 Доступные команды:

📞 /newcall - Создать видеозвонок
📋 /mycalls - Показать ваши звонки
❌ /cancelcall [ID] - Отменить звонок

💡 Пример: /cancelcall 5
    `;
    bot.sendMessage(chatId, text).catch(console.error);
});

// ===== КОМАНДА /newcall =====
bot.onText(/\/newcall/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Шаг 1: Запрос времени
        await bot.sendMessage(chatId, "🕐 На какое время? (Формат: ГГГГ-ММ-ДД ЧЧ:ММ)\nПример: 2024-12-25 15:30");

        const timeMsg = await new Promise((resolve, reject) => {
            const handler = (msg) => {
                if (msg.chat.id === chatId) {
                    bot.removeListener('message', handler);
                    resolve(msg);
                }
            };
            bot.on('message', handler);
            setTimeout(() => reject(new Error('Timeout')), 60000);
        });

        // Шаг 2: Запрос длительности
        await bot.sendMessage(chatId, "⏱ Продолжительность в минутах?\nПример: 30");

        const durationMsg = await new Promise((resolve, reject) => {
            const handler = (msg) => {
                if (msg.chat.id === chatId) {
                    bot.removeListener('message', handler);
                    resolve(msg);
                }
            };
            bot.on('message', handler);
            setTimeout(() => reject(new Error('Timeout')), 60000);
        });

        const duration = parseInt(durationMsg.text);
        if (isNaN(duration) || duration < 1) {
            return bot.sendMessage(chatId, "❌ Введите число больше 0");
        }

        // Сохранение в БД
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO calls (creator_id, scheduled_time, duration_minutes) VALUES (?, ?, ?)`,
                [chatId, timeMsg.text, duration],
                function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                }
            );
        }).then(async (callId) => {
            const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;
            const message = `
✅ Звонок создан!

📅 ${timeMsg.text}
⏱ ${duration} минут
🔗 ${joinLink}
🎯 ID: ${callId}
            `;
            await bot.sendMessage(chatId, message);
        });

    } catch (error) {
        console.error('Newcall error:', error);
        bot.sendMessage(chatId, "❌ Ошибка. Попробуйте /newcall снова");
    }
});

// ===== КОМАНДА /mycalls =====
bot.onText(/\/mycalls/, (msg) => {
    const chatId = msg.chat.id;

    db.all(`SELECT * FROM calls WHERE creator_id = ? ORDER BY created_at DESC`, [chatId], (err, rows) => {
        if (err) {
            console.error('Mycalls error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка базы данных");
        }

        if (rows.length === 0) {
            return bot.sendMessage(chatId, "📭 Нет запланированных звонков");
        }

        let message = "📅 Ваши звонки:\n\n";
        rows.forEach((call, index) => {
            message += `${index + 1}. ${call.scheduled_time} (${call.duration_minutes} мин)\n`;
            message += `   Status: ${call.status} | ID: ${call.id}\n\n`;
        });

        bot.sendMessage(chatId, message).catch(console.error);
    });
});

// ===== КОМАНДА /cancelcall =====
bot.onText(/\/cancelcall(?: (\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];

    if (!callId) {
        return bot.sendMessage(chatId, "❌ Укажите ID звонка\nПример: /cancelcall 5");
    }

    db.run(`DELETE FROM calls WHERE id = ? AND creator_id = ?`, [callId, chatId], function(err) {
        if (err) {
            console.error('Cancelcall error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка отмены");
        }

        if (this.changes === 0) {
            return bot.sendMessage(chatId, "❌ Звонк не найден");
        }

        bot.sendMessage(chatId, "✅ Звонок отменен").catch(console.error);
    });
});

// Автоматические уведомления
setInterval(() => {
    const now = new Date().toISOString().slice(0, 16);
    db.all(`SELECT * FROM calls WHERE scheduled_time LIKE ? AND status = 'scheduled'`, [`${now}%`], (err, rows) => {
        if (err) return console.error('Notification error:', err);

        rows.forEach(call => {
            const joinLink = `${SERVER_URL}/call.html?call_id=${call.id}`;
            const message = `🎉 Время звонка!\n\n${joinLink}`;

            bot.sendMessage(call.creator_id, message).catch(console.error);
            db.run(`UPDATE calls SET status = 'active' WHERE id = ?`, [call.id]);
        });
    });
}, 60000);

console.log('✅ Bot started successfully');