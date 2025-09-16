require('dotenv').config(); // Добавьте эту строку в самом начале

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

// В разделе инициализации БД замените текущий код на:
db.serialize(() => {
    // Таблица звонков
    db.run(`CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creator_id INTEGER NOT NULL,
        scheduled_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
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

bot.onText(/\/newcall/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        // Шаг 1: Запрос названия звонка
        await bot.sendMessage(chatId, "📝 Введите название звонка:");

        const titleMsg = await new Promise((resolve, reject) => {
            const handler = (msg) => {
                if (msg.chat.id === chatId && !msg.text.startsWith('/')) {
                    bot.removeListener('message', handler);
                    resolve(msg);
                }
            };
            bot.on('message', handler);
            setTimeout(() => reject(new Error('Timeout')), 60000);
        });

        // Шаг 2: Запрос времени
        await bot.sendMessage(chatId, "🕐 На какое время? (Формат: ГГГГ-ММ-ДД ЧЧ:ММ)\nПример: 2024-12-25 15:30");

        const timeMsg = await new Promise((resolve, reject) => {
            const handler = (msg) => {
                if (msg.chat.id === chatId && !msg.text.startsWith('/')) {
                    bot.removeListener('message', handler);
                    resolve(msg);
                }
            };
            bot.on('message', handler);
            setTimeout(() => reject(new Error('Timeout')), 60000);
        });

        // Шаг 3: Запрос длительности
        await bot.sendMessage(chatId, "⏱ Продолжительность в минутах?\nПример: 30");

        const durationMsg = await new Promise((resolve, reject) => {
            const handler = (msg) => {
                if (msg.chat.id === chatId && !msg.text.startsWith('/')) {
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
        db.run(
            `INSERT INTO calls (creator_id, scheduled_time, duration_minutes, title) VALUES (?, ?, ?, ?)`,
            [chatId, timeMsg.text, duration, titleMsg.text],
            function(err) {
                if (err) {
                    console.error('Database insert error:', err);
                    return bot.sendMessage(chatId, "❌ Ошибка при создании звонка");
                }

                const callId = this.lastID;
                const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;

                const message = `
✅ Звонок создан!

📋 Название: ${titleMsg.text}
📅 Время: ${timeMsg.text}
⏱ Длительность: ${duration} минут
🔗 Ссылка: ${joinLink}
🎯 ID: ${callId}

Теперь пригласите участников командой:
/invite ${callId} @username
                `;

                // Создаем уведомление за 5 минут до звонка
                const callTime = new Date(timeMsg.text);
                const notificationTime = new Date(callTime.getTime() - 5 * 60000);

                db.run(
                    `INSERT INTO notifications (call_id, user_id, type, scheduled_time) VALUES (?, ?, ?, ?)`,
                    [callId, chatId, '5min_reminder', notificationTime.toISOString()]
                );

                bot.sendMessage(chatId, message).catch(console.error);
            }
        );

    } catch (error) {
        console.error('Newcall error:', error);
        bot.sendMessage(chatId, "❌ Ошибка. Попробуйте /newcall снова");
    }
});

// ===== КОМАНДА /mycalls =====
bot.onText(/\/mycalls/, (msg) => {
    const chatId = msg.chat.id;

    // Получаем созданные звонки
    db.all(`SELECT * FROM calls WHERE creator_id = ? ORDER BY created_at DESC`, [chatId], (err, createdCalls) => {
        if (err) {
            console.error('Mycalls error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка базы данных");
        }

        // Получаем принятые приглашения
        db.all(`SELECT c.* FROM calls c 
                JOIN invitations i ON c.id = i.call_id 
                WHERE i.user_id = ? AND i.status = 'accepted' 
                ORDER BY c.scheduled_time DESC`, [chatId], (err, invitedCalls) => {
            if (err) {
                console.error('Mycalls error:', err);
                return bot.sendMessage(chatId, "❌ Ошибка базы данных");
            }

            if (createdCalls.length === 0 && invitedCalls.length === 0) {
                return bot.sendMessage(chatId, "📭 Нет активных звонков");
            }

            let message = "📅 Ваши звонки:\n\n";

            if (createdCalls.length > 0) {
                message += "👑 Созданные вами:\n";
                createdCalls.forEach((call, index) => {
                    message += `${index + 1}. ${call.title}\n`;
                    message += `   📅 ${call.scheduled_time} (${call.duration_minutes} мин)\n`;
                    message += `   🎯 ID: ${call.id} | Status: ${call.status}\n\n`;
                });
            }

            if (invitedCalls.length > 0) {
                message += "📩 Приглашения:\n";
                invitedCalls.forEach((call, index) => {
                    message += `${index + 1}. ${call.title}\n`;
                    message += `   📅 ${call.scheduled_time} (${call.duration_minutes} мин)\n`;
                    message += `   🎯 ID: ${call.id}\n\n`;
                });
            }

            bot.sendMessage(chatId, message).catch(console.error);
        });
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
            return bot.sendMessage(chatId, "❌ Звонок не найден");
        }

        bot.sendMessage(chatId, "✅ Звонок отменен").catch(console.error);
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

    // Проверяем существование звонка и права доступа
    db.get(`SELECT * FROM calls WHERE id = ? AND creator_id = ?`, [callId, chatId], (err, call) => {
        if (err) {
            console.error('Invite error:', err);
            return bot.sendMessage(chatId, "❌ Ошибка базы данных");
        }

        if (!call) {
            return bot.sendMessage(chatId, "❌ Звонк не найден или у вас нет прав для приглашения");
        }

        // Получаем ID пользователя по username
        bot.getChatMember(username.replace('@', ''), username.replace('@', ''))
            .then(chatMember => {
                const invitedUserId = chatMember.user.id;

                // Добавляем приглашение в БД
                db.run(
                    `INSERT INTO invitations (call_id, user_id, status) VALUES (?, ?, ?)`,
                    [callId, invitedUserId, 'pending'],
                    function(err) {
                        if (err) {
                            console.error('Invitation error:', err);
                            return bot.sendMessage(chatId, "❌ Ошибка при отправке приглашения");
                        }

                        // Отправляем приглашение пользователю
                        const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;
                        const inviteMessage = `
🎉 Вас пригласили на видеозвонок!

📋 Название: ${call.title}
📅 Время: ${call.scheduled_time}
⏱ Длительность: ${call.duration_minutes} минут
👤 Организатор: @${msg.from.username}

🔗 Присоединиться: ${joinLink}

✅ Принять: /accept ${callId}
❌ Отклонить: /decline ${callId}
                        `;

                        bot.sendMessage(invitedUserId, inviteMessage)
                            .then(() => {
                                bot.sendMessage(chatId, `✅ Приглашение отправлено пользователю ${username}`);

                                // Создаем уведомление за 5 минут до звонка для приглашенного
                                const callTime = new Date(call.scheduled_time);
                                const notificationTime = new Date(callTime.getTime() - 5 * 60000);

                                db.run(
                                    `INSERT INTO notifications (call_id, user_id, type, scheduled_time) VALUES (?, ?, ?, ?)`,
                                    [callId, invitedUserId, '5min_reminder', notificationTime.toISOString()]
                                );
                            })
                            .catch(error => {
                                console.error('Send invite error:', error);
                                bot.sendMessage(chatId, `❌ Не удалось отправить приглашение пользователю ${username}`);
                            });
                    }
                );
            })
            .catch(error => {
                console.error('Get user error:', error);
                bot.sendMessage(chatId, `❌ Пользователь ${username} не найден`);
            });
    });
});

// ===== КОМАНДА /accept =====
bot.onText(/\/accept(?: (\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];

    if (!callId) {
        return bot.sendMessage(chatId, "❌ Укажите ID звонка\nПример: /accept 5");
    }

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
                    return bot.sendMessage(chatId, "✅ Приглашение принято");
                }

                const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;
                const message = `
✅ Вы приняли приглашение на звонок!

📋 ${call.title}
📅 ${call.scheduled_time}
🔗 ${joinLink}

Напоминание придет за 5 минут до начала.
                `;

                bot.sendMessage(chatId, message);

                // Уведомляем организатора
                bot.sendMessage(call.creator_id, `✅ Пользователь @${msg.from.username} принял приглашение на звонок "${call.title}"`);
            });
        }
    );
});

// ===== КОМАНДА /decline =====
bot.onText(/\/decline(?: (\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];

    if (!callId) {
        return bot.sendMessage(chatId, "❌ Укажите ID звонка\nПример: /decline 5");
    }

    db.run(
        `UPDATE invitations SET status = 'declined' WHERE call_id = ? AND user_id = ?`,
        [callId, chatId],
        function(err) {
            if (err) {
                console.error('Decline error:', err);
                return bot.sendMessage(chatId, "❌ Ошибка отклонения приглашения");
            }

            if (this.changes === 0) {
                return bot.sendMessage(chatId, "❌ Приглашение не найдено");
            }

            // Удаляем уведомление для этого пользователя
            db.run(`DELETE FROM notifications WHERE call_id = ? AND user_id = ?`, [callId, chatId]);

            // Получаем информацию о звонке
            db.get(`SELECT * FROM calls WHERE id = ?`, [callId], (err, call) => {
                if (err || !call) {
                    return bot.sendMessage(chatId, "✅ Приглашение отклонено");
                }

                // Уведомляем организатора
                bot.sendMessage(call.creator_id, `❌ Пользователь @${msg.from.username} отклонил приглашение на звонок "${call.title}"`);
            });

            bot.sendMessage(chatId, "✅ Приглашение отклонено");
        }
    );
});

function sendNotification(userId, callId, type) {
    db.get(`SELECT * FROM calls WHERE id = ?`, [callId], (err, call) => {
        if (err || !call) return;

        const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;
        let message = '';

        if (type === '5min_reminder') {
            message = `
⏰ Напоминание: через 5 минут начинается звонок!

📋 ${call.title}
📅 ${call.scheduled_time}
⏱ ${call.duration_minutes} минут
🔗 ${joinLink}

Приготовьтесь к подключению!
            `;
        }

        bot.sendMessage(userId, message)
            .then(() => {
                // Помечаем уведомление как отправленное
                db.run(`UPDATE notifications SET sent = TRUE WHERE call_id = ? AND user_id = ? AND type = ?`,
                    [callId, userId, type]);
            })
            .catch(error => {
                console.error('Notification send error:', error);
            });
    });
}

// Проверка уведомлений каждую минуту
setInterval(() => {
    const now = new Date().toISOString();

    db.all(`SELECT * FROM notifications WHERE scheduled_time <= ? AND sent = FALSE`, [now], (err, notifications) => {
        if (err) return console.error('Notification check error:', err);

        notifications.forEach(notification => {
            sendNotification(notification.user_id, notification.call_id, notification.type);
        });
    });
}, 60000); // Проверка каждую минуту

console.log('✅ Bot started successfully');