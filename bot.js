require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ===== КОНФИГУРАЦИЯ =====
const TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://telegram-video-bot-vvfl.onrender.com';

// Генерация 6-символьного кода
const generateCallCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// Проверка переменных окружения
console.log('=== BOT STARTING ===');
console.log('BOT_TOKEN:', TOKEN ? '✅ Set' : '❌ Not set');
console.log('WEB_APP_URL:', WEB_APP_URL);

if (!TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required!');
    process.exit(1);
}

// Инициализация БД
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Database error:', err);
    else console.log('✅ Database connected');
});

// Инициализация бота
const bot = new TelegramBot(TOKEN, {
    polling: true,
    request: {
        timeout: 30000
    }
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

    // Таблица звонков (ПЕРЕДЕЛАНА под 6-символьные коды)
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

// Сохраняем информацию о пользователе при любом сообщении
bot.on('message', (msg) => {
    if (msg.from) {
        saveUser(msg.from);
    }
});

// Обработчики ошибок
bot.on('error', (error) => console.error('❌ Bot error:', error));
bot.on('polling_error', (error) => console.error('❌ Polling error:', error));

// Проверка подключения
bot.getMe()
    .then((me) => {
        console.log(`✅ Bot @${me.username} started`);
        bot.options.username = me.username;
    })
    .catch((error) => {
        console.error('❌ Bot auth failed:', error);
        process.exit(1);
    });

// ===== КОМАНДА /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    const keyboard = {
        inline_keyboard: [
            [{ text: "📞 Создать звонок", callback_data: 'new_call' }],
            [{ text: "🔗 Присоединиться к звонку", callback_data: 'join_call' }],
            [{ text: "📋 Мои звонки", callback_data: 'my_calls' }]
        ]
    };

    const text = `
👋 Привет! Я бот для видеозвонков в Telegram Mini App.

🚀 Возможности:
• Создавайте видеозвонки прямо в Telegram
• Приглашайте друзей по 6-символьному коду
• Общайтесь лицом к лицу в реальном времени

Выберите действие:
    `;

    bot.sendMessage(chatId, text, {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
    }).catch(console.error);
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

// Обработка создания звонка
async function handleNewCall(chatId, user) {
    try {
        await bot.sendMessage(chatId, "📝 Придумайте название для вашего звонка:");

        const nameMsg = await new Promise((resolve, reject) => {
            const handler = (msg) => {
                if (msg.chat.id === chatId) {
                    bot.removeListener('message', handler);
                    resolve(msg);
                }
            };
            bot.on('message', handler);
            setTimeout(() => reject(new Error('Timeout')), 30000);
        });

        const callName = nameMsg.text;
        const callCode = generateCallCode();

        // Сохраняем звонок в БД
        db.run(
            `INSERT INTO calls (call_code, creator_id, creator_username, call_name) VALUES (?, ?, ?, ?)`,
            [callCode, chatId, user.username, callName],
            function(err) {
                if (err) {
                    console.error('New call error:', err);
                    return bot.sendMessage(chatId, "❌ Ошибка создания звонка");
                }

                const webAppUrl = `${WEB_APP_URL}?call_code=${callCode}&user_id=${chatId}&creator=true`;

                const keyboard = {
                    inline_keyboard: [[
                        {
                            text: "🎥 Начать звонок",
                            web_app: { url: webAppUrl }
                        }
                    ]]
                };

                const message = `
✅ *Звонок создан!*

📞 Название: ${callName}
🔢 Код: \`${callCode}\`
👤 Создатель: @${user.username}

Поделитесь этим кодом с друзьями чтобы они могли присоединиться!

*Команда для присоединения:*
\`/join ${callCode}\`
                `;

                bot.sendMessage(chatId, message, {
                    reply_markup: keyboard,
                    parse_mode: 'Markdown'
                });
            }
        );

    } catch (error) {
        console.error('New call error:', error);
        bot.sendMessage(chatId, "❌ Ошибка. Попробуйте снова");
    }
}

// Обработка присоединения к звонку
async function handleJoinCall(chatId) {
    try {
        await bot.sendMessage(chatId, "🔢 Введите 6-символьный код звонка:");

        const codeMsg = await new Promise((resolve, reject) => {
            const handler = (msg) => {
                if (msg.chat.id === chatId && msg.text && msg.text.length === 6) {
                    bot.removeListener('message', handler);
                    resolve(msg);
                }
            };
            bot.on('message', handler);
            setTimeout(() => reject(new Error('Timeout')), 30000);
        });

        const callCode = codeMsg.text.toUpperCase();

        // Проверяем существование звонка
        db.get(`SELECT * FROM calls WHERE call_code = ? AND status = 'active'`, [callCode], (err, call) => {
            if (err || !call) {
                return bot.sendMessage(chatId, "❌ Звонок не найден или уже завершен");
            }

            // Добавляем пользователя в участники
            db.run(
                `INSERT INTO call_participants (call_id, user_id, username) VALUES (?, ?, ?)`,
                [call.id, chatId, codeMsg.from.username],
                function(err) {
                    if (err) {
                        return bot.sendMessage(chatId, "❌ Ошибка присоединения к звонку");
                    }

                    const webAppUrl = `${WEB_APP_URL}?call_code=${callCode}&user_id=${chatId}`;

                    const keyboard = {
                        inline_keyboard: [[
                            {
                                text: "🎥 Перейти к звонку",
                                web_app: { url: webAppUrl }
                            }
                        ]]
                    };

                    bot.sendMessage(chatId, `✅ Вы присоединились к звонку "${call.call_name}"\nКод: ${callCode}`, {
                        reply_markup: keyboard
                    });

                    // Уведомляем создателя
                    bot.sendMessage(call.creator_id, `👋 @${codeMsg.from.username} присоединился к вашему звонку "${call.call_name}"`);
                }
            );
        });

    } catch (error) {
        console.error('Join call error:', error);
        bot.sendMessage(chatId, "❌ Время ожидания истекло. Попробуйте снова.");
    }
}

// Показ активных звонков пользователя
async function handleMyCalls(chatId) {
    db.all(`
        SELECT c.*, COUNT(cp.id) as participants_count 
        FROM calls c 
        LEFT JOIN call_participants cp ON c.id = cp.call_id 
        WHERE c.creator_id = ? AND c.status = 'active' 
        GROUP BY c.id
    `, [chatId], (err, calls) => {
        if (err) {
            console.error('My calls error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка получения списка звонков");
        }

        if (calls.length === 0) {
            return bot.sendMessage(chatId, "📭 У вас нет активных звонков");
        }

        let message = "📋 Ваши активные звонки:\n\n";

        calls.forEach(call => {
            message += `🔸 *${call.call_name}*\n`;
            message += `🆔 Код: \`${call.call_code}\`\n`;
            message += `👥 Участников: ${call.participants_count}\n`;
            message += `🕐 Создан: ${new Date(call.created_at).toLocaleString('ru-RU')}\n`;
            message += "────────────────────\n";
        });

        message += "\nПоделитесь кодом с друзьями чтобы они могли присоединиться!";

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });
}

// ===== КОМАНДА /join =====
bot.onText(/\/join (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const callCode = match[1].toUpperCase();

    if (callCode.length !== 6) {
        return bot.sendMessage(chatId, "❌ Код должен состоять из 6 символов");
    }

    // Проверяем существование звонка
    db.get(`SELECT * FROM calls WHERE call_code = ? AND status = 'active'`, [callCode], (err, call) => {
        if (err || !call) {
            return bot.sendMessage(chatId, "❌ Звонок не найден или уже завершен");
        }

        // Добавляем пользователя в участники
        db.run(
            `INSERT INTO call_participants (call_id, user_id, username) VALUES (?, ?, ?)`,
            [call.id, chatId, msg.from.username],
            function(err) {
                if (err) {
                    return bot.sendMessage(chatId, "❌ Ошибка присоединения к звонку");
                }

                const webAppUrl = `${WEB_APP_URL}?call_code=${callCode}&user_id=${chatId}`;

                const keyboard = {
                    inline_keyboard: [[
                        {
                            text: "🎥 Перейти к звонку",
                            web_app: { url: webAppUrl }
                        }
                    ]]
                };

                bot.sendMessage(chatId, `✅ Вы присоединились к звонку "${call.call_name}"`, {
                    reply_markup: keyboard
                });

                // Уведомляем создателя
                bot.sendMessage(call.creator_id, `👋 @${msg.from.username} присоединился к вашему звонку "${call.call_name}"`);
            }
        );
    });
});

// ===== КОМАНДА /endcall =====
bot.onText(/\/endcall(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callCode = match[1] ? match[1].toUpperCase() : null;

    if (callCode) {
        // Завершаем конкретный звонок по коду
        db.get(`SELECT * FROM calls WHERE call_code = ? AND creator_id = ?`, [callCode, chatId], (err, call) => {
            if (err || !call) {
                return bot.sendMessage(chatId, "❌ Звонок не найден или у вас нет прав для его завершения");
            }

            endCall(call.id, chatId);
        });
    } else {
        // Завершаем все активные звонки пользователя
        db.all(`SELECT * FROM calls WHERE creator_id = ? AND status = 'active'`, [chatId], (err, calls) => {
            if (err || calls.length === 0) {
                return bot.sendMessage(chatId, "❌ У вас нет активных звонков");
            }

            calls.forEach(call => {
                endCall(call.id, chatId);
            });

            bot.sendMessage(chatId, `✅ Все ваши звонки завершены`);
        });
    }
});

// Функция завершения звонка
function endCall(callId, creatorId) {
    db.run(
        `UPDATE calls SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [callId],
        function(err) {
            if (err) {
                console.error('End call error:', err);
                return;
            }

            // Уведомляем всех участников
            db.all(`SELECT user_id FROM call_participants WHERE call_id = ?`, [callId], (err, participants) => {
                participants.forEach(participant => {
                    if (participant.user_id !== creatorId) {
                        bot.sendMessage(participant.user_id, "📞 Звонок был завершен создателем").catch(console.error);
                    }
                });
            });

            bot.sendMessage(creatorId, "✅ Звонок завершен");
        }
    );
}

// ===== КОМАНДА /help =====
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const text = `
🎯 *Доступные команды:*

📞 */newcall* - Создать новый видеозвонок
🔗 */join [КОД]* - Присоединиться к звонку по коду
📋 */mycalls* - Мои активные звонки
❌ */endcall [КОД]* - Завершить звонок

💡 *Примеры:*
\`/join ABC123\` - присоединиться к звонку с кодом ABC123
\`/endcall ABC123\` - завершить звонок с кодом ABC123

🚀 *Быстрый старт:*
1. Создайте звонок: /newcall
2. Придумайте название
3. Поделитесь 6-символьным кодом с друзьями
4. Они смогут присоединиться: /join ВАШ_КОД
    `;

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// Очистка старых завершенных звонков (каждый час)
setInterval(() => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    db.run(`DELETE FROM calls WHERE status = 'ended' AND ended_at < ?`, [oneDayAgo], function(err) {
        if (!err && this.changes > 0) {
            console.log(`🧹 Очищено ${this.changes} старых звонков`);
        }
    });
}, 60 * 60 * 1000);

console.log('✅ Bot started successfully');