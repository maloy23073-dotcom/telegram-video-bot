require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ===== КОНФИГУРАЦИЯ =====
const TOKEN = process.env.BOT_TOKEN;
const SERVER_URL = process.env.SERVER_URL || 'https://telegram-video-bot-vvfl.onrender.com';

// Генерация токена
const generateJoinToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Проверка переменных окружения
console.log('=== BOT STARTING ===');
console.log('BOT_TOKEN:', TOKEN ? '✅ Set' : '❌ Not set');
console.log('SERVER_URL:', SERVER_URL);

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

    // Таблица звонков
    db.run(`CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creator_id INTEGER NOT NULL,
        scheduled_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        join_token TEXT NOT NULL,
        title TEXT DEFAULT '',
        status TEXT DEFAULT 'scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('❌ Calls table error:', err);
        else console.log('✅ Calls table ready');
    });

    // Таблица приглашений
    db.run(`CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (call_id) REFERENCES calls (id)
    )`, (err) => {
        if (err) console.error('❌ Invitations table error:', err);
        else console.log('✅ Invitations table ready');
    });

    // Таблица уведомлений
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        sent BOOLEAN DEFAULT FALSE,
        scheduled_time DATETIME NOT NULL,
        FOREIGN KEY (call_id) REFERENCES calls (id)
    )`, (err) => {
        if (err) console.error('❌ Notifications table error:', err);
        else console.log('✅ Notifications table ready');
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
    .then((me) => console.log(`✅ Bot @${me.username} started`))
    .catch((error) => {
        console.error('❌ Bot auth failed:', error);
        process.exit(1);
    });

// ===== КОМАНДА /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const text = `
👋 Привет! Я бот для видеозвонков в Telegram.

📋 Команды:
/newcall - Создать звонок
/mycalls - Мои звонки
/invite - Пригласить участников
/help - Помощь
    `;
    bot.sendMessage(chatId, text).catch(console.error);
});

// Обработчик публичных приглашений
bot.onText(/\/start join_(\d+)_(.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];
    const token = match[2];

    db.get(`SELECT * FROM calls WHERE id = ? AND join_token = ?`, [callId, token], (err, call) => {
        if (err || !call) {
            return bot.sendMessage(chatId, "❌ Приглашение недействительно или expired");
        }

        const joinLink = `${SERVER_URL}/call.html?call_id=${callId}&token=${token}`;

        const message = `
🎉 *Вас пригласили на видеозвонок!*

📅 *Время:* ${call.scheduled_time}
⏱ *Длительность:* ${call.duration_minutes} минут

🔗 *Присоединиться:* ${joinLink}

*Нажмите на ссылку выше чтобы присоединиться к звонку!*
        `;

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    });
});

// ===== КОМАНДА /help =====
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const text = `
🎯 Доступные команды:

📞 /newcall - Создать видеозвонок
📋 /mycalls - Показать ваши звонки
👥 /invite [ID] @username - Пригласить пользователя
✅ /accept [ID] - Принять приглашение
❌ /decline [ID] - Отклонить приглашение
❌ /cancelcall [ID] - Отменить звонок

💡 Примеры:
/invite 5 @username
/accept 5
/decline 5
/cancelcall 5
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

        // Генерируем публичный токен для доступа
        const joinToken = generateJoinToken();

        // Сохранение в БД с публичным токеном
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO calls (creator_id, scheduled_time, duration_minutes, join_token) VALUES (?, ?, ?, ?)`,
                [chatId, timeMsg.text, duration, joinToken],
                function(err) {
                    if (err) return reject(err);
                    resolve({ callId: this.lastID, joinToken });
                }
            );
        }).then(async ({ callId, joinToken }) => {
            const joinLink = `${SERVER_URL}/call.html?call_id=${callId}&token=${joinToken}`;
            const publicInviteLink = `https://t.me/${bot.options.username}?start=join_${callId}_${joinToken}`;

            const message = `
✅ *Звонок создан!*

📅 *Время:* ${timeMsg.text}
⏱ *Длительность:* ${duration} минут
🎯 *ID звонка:* ${callId}

🔗 *Публичная ссылка для присоединения:*
${joinLink}

📩 *Приглашение в Telegram:*
${publicInviteLink}

*Любой пользователь может присоединиться по этим ссылкам!*
            `;

            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        });

    } catch (error) {
        console.error('Newcall error:', error);
        bot.sendMessage(chatId, "❌ Ошибка. Попробуйте /newcall снова");
    }
});

// ===== КОМАНДА /mycalls =====
bot.onText(/\/mycalls/, (msg) => {
    const chatId = msg.chat.id;

    db.all(`SELECT * FROM calls WHERE creator_id = ? ORDER BY created_at DESC`, [chatId], (err, calls) => {
        if (err) {
            console.error('Mycalls error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка получения списка звонков");
        }

        if (calls.length === 0) {
            return bot.sendMessage(chatId, "📭 У вас нет активных звонков");
        }

        let message = "📋 Ваши звонки:\n\n";

        calls.forEach(call => {
            const joinLink = `${SERVER_URL}/call.html?call_id=${call.id}&token=${call.join_token}`;
            message += `🎯 ID: ${call.id}\n`;
            message += `📅 Время: ${call.scheduled_time}\n`;
            message += `⏱ Длительность: ${call.duration_minutes} мин\n`;
            message += `🔗 Ссылка: ${joinLink}\n`;
            message += `📊 Статус: ${call.status}\n`;
            message += "────────────────────\n";
        });

        bot.sendMessage(chatId, message);
    });
});

// ===== КОМАНДА /invite =====
bot.onText(/\/invite(?: (\d+)(?: (@\w+))?)?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];
    const username = match[2];

    if (!callId) {
        return bot.sendMessage(chatId, "❌ Укажите ID звонка\nПример: /invite 5 @username");
    }

    if (!username) {
        return bot.sendMessage(chatId, "❌ Укажите username пользователя\nПример: /invite 5 @username");
    }

    const cleanUsername = username.replace('@', '').toLowerCase();

    // Проверяем существование звонка и права доступа
    db.get(`SELECT * FROM calls WHERE id = ? AND creator_id = ?`, [callId, chatId], (err, call) => {
        if (err) {
            console.error('Invite error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка базы данных");
        }

        if (!call) {
            return bot.sendMessage(chatId, "❌ Звонок не найден или у вас нет прав для приглашения");
        }

        // Ищем пользователя в нашей базе по username
        db.get(`SELECT user_id FROM users WHERE username = ?`, [cleanUsername], (err, user) => {
            if (err) {
                console.error('Find user error:', err);
                return bot.sendMessage(chatId, "❌ Ошибка поиска пользователя");
            }

            if (!user) {
                return bot.sendMessage(chatId, `❌ Пользователь @${cleanUsername} не найден. 
                
Попросите пользователя:
1. Начать диалог с ботом @${bot.options.username}
2. Отправить команду /start
3. После этого можно пригласить его again`);
            }

            const userId = user.user_id;

            // Проверяем, не приглашали ли уже этого пользователя
            db.get(`SELECT * FROM invitations WHERE call_id = ? AND user_id = ?`, [callId, userId], (err, existingInvite) => {
                if (err) {
                    console.error('Check existing invite error:', err);
                    return bot.sendMessage(chatId, "❌ Ошибка проверки приглашения");
                }

                if (existingInvite) {
                    return bot.sendMessage(chatId, `❌ Пользователь @${cleanUsername} уже приглашен на этот звонок`);
                }

                // Сохраняем приглашение в БД
                db.run(
                    `INSERT INTO invitations (call_id, user_id, username, status) VALUES (?, ?, ?, ?)`,
                    [callId, userId, cleanUsername, 'pending'],
                    function(err) {
                        if (err) {
                            console.error('Invitation error:', err);
                            return bot.sendMessage(chatId, "❌ Ошибка при создании приглашения");
                        }

                        // Отправляем приглашение пользователю
                        sendInvitation(userId, call, msg.from.username)
                            .then(() => {
                                bot.sendMessage(chatId, `✅ Приглашение отправлено пользователю @${cleanUsername}`);

                                // Создаем уведомление за 5 минут до звонка
                                const callTime = new Date(call.scheduled_time);
                                const notificationTime = new Date(callTime.getTime() - 5 * 60000);

                                db.run(
                                    `INSERT INTO notifications (call_id, user_id, type, scheduled_time) VALUES (?, ?, ?, ?)`,
                                    [callId, userId, '5min_reminder', notificationTime.toISOString()]
                                );
                            })
                            .catch(error => {
                                console.error('Send invitation error:', error);
                                bot.sendMessage(chatId, `❌ Не удалось отправить приглашение пользователю @${cleanUsername}. 
                                
Возможно, пользователь заблокировал бота.`);
                            });
                    }
                );
            });
        });
    });
});

// Функция для отправки приглашения
function sendInvitation(userId, call, inviterUsername) {
    return new Promise((resolve, reject) => {
        const joinLink = `${SERVER_URL}/call.html?call_id=${call.id}&token=${call.join_token}`;

        const inviteMessage = `
🎉 Вас пригласили на видеозвонок!

📅 Время: ${call.scheduled_time}
⏱ Длительность: ${call.duration_minutes} минут
👤 Организатор: @${inviterUsername}

🔗 Присоединиться: ${joinLink}
        `;

        // Добавляем клавиатуру с кнопками
        const keyboard = {
            inline_keyboard: [
                [
                    { text: "✅ Принять", callback_data: `accept_${call.id}` },
                    { text: "❌ Отклонить", callback_data: `decline_${call.id}` }
                ],
                [
                    { text: "🔗 Перейти к звонку", url: joinLink }
                ]
            ]
        };

        bot.sendMessage(userId, inviteMessage, { reply_markup: keyboard })
            .then(() => resolve())
            .catch(error => reject(error));
    });
}

// Обработка callback-кнопок
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;

    if (data.startsWith('accept_')) {
        const callId = data.replace('accept_', '');
        handleAcceptInvitation(chatId, callId, messageId);
    } else if (data.startsWith('decline_')) {
        const callId = data.replace('decline_', '');
        handleDeclineInvitation(chatId, callId, messageId);
    }
});

// Обработка принятия приглашения
function handleAcceptInvitation(chatId, callId, messageId) {
    db.run(
        `UPDATE invitations SET status = 'accepted' WHERE call_id = ? AND user_id = ?`,
        [callId, chatId],
        function(err) {
            if (err) {
                console.error('Accept error:', err);
                return bot.sendMessage(chatId, "❌ Ошибка принятия приглашения");
            }

            if (this.changes === 0) {
                return bot.sendMessage(chatId, "❌ Приглашение не найдено");
            }

            // Получаем информацию о звонке
            db.get(`SELECT * FROM calls WHERE id = ?`, [callId], (err, call) => {
                if (err || !call) {
                    bot.answerCallbackQuery({ callback_query_id: messageId, text: "✅ Приглашение принято" });
                    return bot.sendMessage(chatId, "✅ Приглашение принято");
                }

                const joinLink = `${SERVER_URL}/call.html?call_id=${callId}&token=${call.join_token}`;
                const message = `
✅ Вы приняли приглашение на звонок!

📅 ${call.scheduled_time}
⏱ ${call.duration_minutes} минут
🔗 ${joinLink}

Напоминание придет за 5 минут до начала.
                `;

                if (messageId) {
                    // Обновляем сообщение с приглашением
                    bot.editMessageText("✅ Приглашение принято", {
                        chat_id: chatId,
                        message_id: messageId
                    });
                }

                bot.sendMessage(chatId, message);

                // Уведомляем организатора
                db.get(`SELECT username FROM users WHERE user_id = ?`, [chatId], (err, user) => {
                    const username = user && user.username ? `@${user.username}` : 'пользователь';
                    bot.sendMessage(call.creator_id, `✅ ${username} принял приглашение на звонок`);
                });

                if (messageId) {
                    bot.answerCallbackQuery({ callback_query_id: messageId, text: "Приглашение принято!" });
                }
            });
        }
    );
}

// Обработка отклонения приглашения
function handleDeclineInvitation(chatId, callId, messageId) {
    db.run(
        `UPDATE invitations SET status = 'declined' WHERE call_id = ? AND user_id = ?`,
        [callId, chatId],
        function(err) {
            if (err) {
                console.error('Decline error:', err);
                return bot.sendMessage(chatId, "❌ Ошибка отклонения приглашения");
            }

            // Удаляем уведомление
            db.run(`DELETE FROM notifications WHERE call_id = ? AND user_id = ?`, [callId, chatId]);

            if (messageId) {
                // Обновляем сообщение
                bot.editMessageText("❌ Приглашение отклонено", {
                    chat_id: chatId,
                    message_id: messageId
                });
            }

            // Уведомляем организатора
            db.get(`SELECT * FROM calls WHERE id = ?`, [callId], (err, call) => {
                if (!err && call) {
                    db.get(`SELECT username FROM users WHERE user_id = ?`, [chatId], (err, user) => {
                        const username = user && user.username ? `@${user.username}` : 'пользователь';
                        bot.sendMessage(call.creator_id, `❌ ${username} отклонил приглашение на звонок`);
                    });
                }
            });

            if (messageId) {
                bot.answerCallbackQuery({ callback_query_id: messageId, text: "Приглашение отклонено" });
            }
        }
    );
}

// ===== КОМАНДА /accept =====
bot.onText(/\/accept(?: (\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];

    if (!callId) {
        return bot.sendMessage(chatId, "❌ Укажите ID звонка\nПример: /accept 5");
    }

    handleAcceptInvitation(chatId, callId, null);
});

// ===== КОМАНДА /decline =====
bot.onText(/\/decline(?: (\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];

    if (!callId) {
        return bot.sendMessage(chatId, "❌ Укажите ID звонка\nПример: /decline 5");
    }

    handleDeclineInvitation(chatId, callId, null);
});

// ===== КОМАНДА /cancelcall =====
bot.onText(/\/cancelcall(?: (\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];

    if (!callId) {
        return bot.sendMessage(chatId, "❌ Укажите ID звонка\nПример: /cancelcall 5");
    }

    db.get(`SELECT * FROM calls WHERE id = ? AND creator_id = ?`, [callId, chatId], (err, call) => {
        if (err) {
            console.error('Cancelcall error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка базы данных");
        }

        if (!call) {
            return bot.sendMessage(chatId, "❌ Звонок не найден или у вас нет прав для отмены");
        }

        db.run(`UPDATE calls SET status = 'cancelled' WHERE id = ?`, [callId], function(err) {
            if (err) {
                console.error('Cancel error:', err);
                return bot.sendMessage(chatId, "❌ Ошибка отмены звонка");
            }

            // Уведомляем приглашенных пользователей
            db.all(`SELECT user_id FROM invitations WHERE call_id = ? AND status = 'accepted'`, [callId], (err, users) => {
                users.forEach(user => {
                    bot.sendMessage(user.user_id, `❌ Звонок ID ${callId} был отменен организатором`).catch(console.error);
                });
            });

            bot.sendMessage(chatId, `✅ Звонок ID ${callId} отменен`);
        });
    });
});

// Функция для отправки уведомлений
setInterval(() => {
    const now = new Date().toISOString().slice(0, 16);
    db.all(`SELECT * FROM calls WHERE scheduled_time LIKE ? AND status = 'scheduled'`, [`${now}%`], (err, rows) => {
        if (err) return console.error('Notification error:', err);

        rows.forEach(call => {
            const joinLink = `${SERVER_URL}/call.html?call_id=${call.id}&token=${call.join_token}`;
            const message = `🎉 *Время звонка!*\n\nПрисоединяйтесь: ${joinLink}`;

            // Отправляем создателю
            bot.sendMessage(call.creator_id, message, { parse_mode: 'Markdown' }).catch(console.error);

            db.run(`UPDATE calls SET status = 'active' WHERE id = ?`, [call.id]);
        });
    });
}, 60000);

// Проверка уведомлений каждую минуту
setInterval(() => {
    const now = new Date().toISOString();

    db.all(`SELECT * FROM notifications WHERE scheduled_time <= ? AND sent = FALSE`, [now], (err, notifications) => {
        if (err) return console.error('Notification check error:', err);

        notifications.forEach(notification => {
            sendNotification(notification.user_id, notification.call_id, notification.type);
        });
    });
}, 60000);

// Функция отправки уведомления
function sendNotification(userId, callId, type) {
    db.get(`SELECT * FROM calls WHERE id = ?`, [callId], (err, call) => {
        if (err || !call) return;

        let message = '';
        if (type === '5min_reminder') {
            const joinLink = `${SERVER_URL}/call.html?call_id=${callId}&token=${call.join_token}`;
            message = `⏰ *Напоминание:* Через 5 минут начинается звонок!\n\n🔗 Присоединиться: ${joinLink}`;
        }

        if (message) {
            bot.sendMessage(userId, message, { parse_mode: 'Markdown' })
                .then(() => {
                    db.run(`UPDATE notifications SET sent = TRUE WHERE user_id = ? AND call_id = ? AND type = ?`,
                        [userId, callId, type]);
                })
                .catch(console.error);
        }
    });
}

console.log('✅ Bot started successfully');