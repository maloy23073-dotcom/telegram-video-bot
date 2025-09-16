const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ===== КОНФИГУРАЦИЯ =====
const TOKEN = process.env.BOT_TOKEN || '8474432468:AAE7xQulaUCRxrCS4iKHxMT3EXXXSHa_ZyQ';
const SERVER_URL = process.env.SERVER_URL || 'https://telegram-video-bot-vvfl.onrender.com';

// Проверка переменных окружения
console.log('🤖 Bot script started!');
console.log('=== ENV VARIABLES ===');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Set' : '❌ Not set');
console.log('SERVER_URL:', process.env.SERVER_URL || 'Using default');
console.log('=====================');

if (!TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required!');
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
const db = new sqlite3.Database(path.join(__dirname, 'calls.db'));

// Обработчики ошибок
bot.on('error', (error) => console.error('❌ Bot error:', error));
bot.on('polling_error', (error) => console.error('❌ Polling error:', error));

// Проверка подключения к боту
bot.getMe().then((me) => {
    console.log(`✅ Bot @${me.username} started successfully`);
}).catch((error) => {
    console.error('❌ Bot authentication failed:', error);
    process.exit(1);
});

// Создаем таблицу для хранения звонков
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            creator_id INTEGER NOT NULL,
            participant_id INTEGER,
            scheduled_time TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            status TEXT DEFAULT 'scheduled',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('❌ Database error:', err);
        else console.log('✅ Database initialized');
    });
});

// ===== КОМАНДА /start =====
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeText = `
👋 Привет! Я бот для организации видеозвонков прямо в Telegram.

*📋 Команды:*
/newcall - Создать новый звонок
/mycalls - Мои запланированные звонки
/cancelcall - Отменить звонок
/help - Помощь

Создай звонок, укажи время и длительность, а я пришлю ссылку-приглашение!
    `;

    bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' })
        .catch(error => console.error('Send message error:', error));
});

// ===== КОМАНДА /help =====
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `
*🎯 Доступные команды:*

*📅 Создание звонка:*
/newcall - Создать новый видеозвонок
• Укажите дату и время
• Укажите продолжительность
• Получите ссылку-приглашение

*📋 Управление звонками:*
/mycalls - Показать все ваши звонки
/cancelcall [ID] - Отменить звонок
• Пример: /cancelcall 5

*❓ Помощь:*
/help - Показать это сообщение

*💡 Подсказка:* Для отмены звонка используйте ID из команды /mycalls
    `;

    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' })
        .catch(error => console.error('Send message error:', error));
});

// ===== КОМАНДА /newcall =====
bot.onText(/\/newcall/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`User ${chatId} started new call creation`);

    // Создаем объект для хранения состояния пользователя
    const userState = {
        step: 'asking_time',
        time: null,
        duration: null
    };

    // Функция для обработки ответов пользователя
    const responseHandler = (responseMsg) => {
        if (responseMsg.chat.id !== chatId) return;

        if (userState.step === 'asking_time') {
            userState.time = responseMsg.text;
            userState.step = 'asking_duration';

            console.log(`User ${chatId} set time: ${userState.time}`);

            bot.sendMessage(chatId, "⏱ *Какова продолжительность звонка?* (в минутах)\nНапример: 30", {
                parse_mode: 'Markdown',
                reply_markup: { force_reply: true }
            }).then(() => {
                // Ждем следующий ответ
                bot.once('message', responseHandler);
            }).catch(error => {
                console.error('Error asking duration:', error);
            });

        } else if (userState.step === 'asking_duration') {
            const duration = parseInt(responseMsg.text);

            if (isNaN(duration) || duration <= 0) {
                bot.sendMessage(chatId, "❌ Пожалуйста, введите корректное число для длительности (больше 0)\n\nНапример: 30", {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                }).then(() => {
                    // Повторно ждем ответ с длительностью
                    bot.once('message', responseHandler);
                });
                return;
            }

            userState.duration = duration;
            console.log(`User ${chatId} set duration: ${userState.duration} minutes`);

            // Сохраняем звонок в базу данных
            db.run(
                `INSERT INTO calls (creator_id, scheduled_time, duration_minutes) VALUES (?, ?, ?)`,
                [chatId, userState.time, userState.duration],
                function(err) {
                    if (err) {
                        console.error('Database insert error:', err);
                        bot.sendMessage(chatId, "❌ Ошибка при создании звонка");
                        return;
                    }

                    const callId = this.lastID;
                    const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;

                    const message = `
✅ *Звонок создан!*

📅 Время: ${userState.time}
⏱ Длительность: ${userState.duration} минут
🔗 Ссылка: ${joinLink}
🎯 ID звонка: ${callId}

*Перешлите ссылку вашему собеседнику!*
Для отмены: /cancelcall ${callId}
                    `;

                    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
                        .then(() => {
                            console.log(`Call created successfully for user ${chatId}, ID: ${callId}`);
                        })
                        .catch(error => {
                            console.error('Send message error:', error);
                        });
                }
            );
        }
    };

    // Начинаем процесс - спрашиваем время
    bot.sendMessage(chatId, "🕐 *На какое время планируем звонок?*\nВведите в формате: ГГГГ-ММ-ДД ЧЧ:ММ\nНапример: 2024-12-25 15:30", {
        parse_mode: 'Markdown',
        reply_markup: { force_reply: true }
    }).then(() => {
        // Ждем первый ответ (время)
        bot.once('message', responseHandler);
    }).catch(error => {
        console.error('Error asking time:', error);
        bot.sendMessage(chatId, "❌ Произошла ошибка, попробуйте снова");
    });
});

// ===== КОМАНДА /mycalls =====
bot.onText(/\/mycalls/, (msg) => {
    const chatId = msg.chat.id;

    console.log(`User ${chatId} requested their calls`);

    db.all(
        `SELECT id, scheduled_time, duration_minutes, status, created_at 
         FROM calls WHERE creator_id = ? 
         ORDER BY scheduled_time DESC`,
        [chatId],
        (err, rows) => {
            if (err) {
                console.error('❌ Database error in /mycalls:', err);
                return bot.sendMessage(chatId, "❌ Ошибка при загрузке ваших звонков");
            }

            if (!rows || rows.length === 0) {
                return bot.sendMessage(chatId,
                    "📭 У вас пока нет запланированных звонков\n\n" +
                    "Создайте первый звонок командой /newcall"
                );
            }

            let message = "🎯 *Ваши запланированные звонки:*\n\n";

            rows.forEach((call, index) => {
                const statusIcon = call.status === 'scheduled' ? '⏰' : '✅';
                const statusText = call.status === 'scheduled' ? 'Запланирован' : 'Завершен';

                message += `${index + 1}. ${statusIcon} *${call.scheduled_time}*\n`;
                message += `   ⏱ ${call.duration_minutes} мин. | 📊 ${statusText}\n`;
                message += `   🆔 ID: ${call.id} | 📅 ${call.created_at.split(' ')[0]}\n\n`;
            });

            message += "\n*❌ Для отмены:* /cancelcall [ID]\n";
            message += "*📅 Создать новый:* /newcall\n";
            message += "*❓ Помощь:* /help";

            bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }).catch(error => {
                console.error('Error sending mycalls message:', error);
            });
        }
    );
});

// ===== КОМАНДА /cancelcall =====
bot.onText(/\/cancelcall(?:\s+(\d+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const callId = match[1];

    if (!callId) {
        return bot.sendMessage(chatId,
            "❌ *Укажите ID звонка для отмены*\n\n" +
            "Пример: /cancelcall 5\n\n" +
            "Посмотреть ID ваших звонков: /mycalls",
            { parse_mode: 'Markdown' }
        );
    }

    // Проверяем существование звонка и права пользователя
    db.get(
        `SELECT id, scheduled_time FROM calls WHERE id = ? AND creator_id = ?`,
        [callId, chatId],
        (err, call) => {
            if (err) {
                console.error('Database error in /cancelcall:', err);
                return bot.sendMessage(chatId, "❌ Ошибка при проверке звонка");
            }

            if (!call) {
                return bot.sendMessage(chatId,
                    "❌ *Звонк не найден!*\n\n" +
                    "Возможно:\n" +
                    "• ID указан неверно\n" +
                    "• Это не ваш звонк\n" +
                    "• Звонк уже отменен\n\n" +
                    "Проверьте ваши звонки: /mycalls",
                    { parse_mode: 'Markdown' }
                );
            }

            // Удаляем звонок
            db.run(
                `DELETE FROM calls WHERE id = ? AND creator_id = ?`,
                [callId, chatId],
                function(err) {
                    if (err) {
                        console.error('Database delete error:', err);
                        return bot.sendMessage(chatId, "❌ Ошибка при отмене звонка");
                    }

                    if (this.changes === 0) {
                        return bot.sendMessage(chatId, "❌ Не удалось отменить звонк");
                    }

                    const successMessage = `
✅ *Звонок отменен!*

📅 Было запланировано: ${call.scheduled_time}
🆔 ID: ${callId}

*❌ Звонок успешно удален*
                    `;

                    bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' })
                        .catch(error => console.error('Send message error:', error));
                }
            );
        }
    );
});

// ===== АВТОМАТИЧЕСКАЯ ПРОВЕРКА ЗВОНКОВ =====
setInterval(() => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

    db.all(
        `SELECT * FROM calls WHERE scheduled_time LIKE ? AND status = 'scheduled'`,
        [`${now}%`],
        (err, rows) => {
            if (err) {
                console.error('Database select error:', err);
                return;
            }

            rows.forEach(call => {
                const joinLink = `${SERVER_URL}/call.html?call_id=${call.id}`;
                const message = `🎉 *Время звонка!*\n\nПрисоединяйтесь по ссылке: ${joinLink}`;

                bot.sendMessage(call.creator_id, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            {
                                text: "Присоединиться к звонку",
                                web_app: { url: joinLink }
                            }
                        ]]
                    }
                }).catch(error => {
                    console.error('Send notification error:', error);
                });

                db.run(`UPDATE calls SET status = 'active' WHERE id = ?`, [call.id], (err) => {
                    if (err) console.error('Database update error:', err);
                });
            });
        }
    );
}, 60000);

console.log('🔄 Бот запущен и готов к работе!');