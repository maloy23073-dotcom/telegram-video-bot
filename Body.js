const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ===== КОНФИГУРАЦИЯ =====
// ===== КОНФИГУРАЦИЯ =====
const TOKEN = process.env.BOT_TOKEN || '8474432468:AAE7xQulaUCRxrCS4iKHxMT3EXXXSHa_ZyQ';
const SERVER_URL = process.env.SERVER_URL || 'https://telegram-video-bot-vvfl.onrender.com'; // Исправьте на ваш URL

// Проверка переменных окружения
console.log('🤖 Bot script started!');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? 'SET' : 'NOT SET');
console.log('=== ENV VARIABLES ===');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Set' : '❌ Not set');
console.log('SERVER_URL:', process.env.SERVER_URL || 'Using default');
console.log('=====================');

if (!TOKEN) {
    console.error('❌ ERROR: BOT_TOKEN is required!');
    process.exit(1);
}

if (!SERVER_URL || SERVER_URL === 'https://telegram-video-bot-vvfl.onrender.com') {
    console.error('❌ ERROR: SERVER_URL is not configured!');
    process.exit(1);
}
// ========================
// ========================

const bot = new TelegramBot(TOKEN, { polling: true });
const db = new sqlite3.Database(path.join(__dirname, 'calls.db'));

// Обработчик ошибок бота
bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
});

// Обработчик успешного запуска
bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error);
});

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
    if (err) {
      console.error('❌ Database error:', err);
    } else {
      console.log('✅ Database initialized');
    }
  });
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeText = `
👋 Привет! Я бот для организации видеозвонков прямо в Telegram.

*Команды:*
/newcall - Создать новый звонок
/mycalls - Посмотреть мои запланированные звонки

Создай звонок, укажи время и длительность, а я пришлю ссылку-приглашение тебе и твоему собеседнику!
  `;

  bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' })
    .catch(error => console.error('Send message error:', error));
});

// Обработчик команды /newcall
bot.onText(/\/newcall/, (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "🕐 *На какое время планируем звонок?*\nВведите в формате: ГГГГ-ММ-ДД ЧЧ:ММ\nНапример: 2024-12-25 15:30", { parse_mode: 'Markdown' })
    .then(() => {
      bot.once('message', (timeMsg) => {
        if (timeMsg.chat.id === chatId) {
          bot.sendMessage(chatId, "⏱ *Какова продолжительность звонка?* (в минутах)\nНапример: 30", { parse_mode: 'Markdown' })
            .then(() => {
              bot.once('message', (durationMsg) => {
                if (durationMsg.chat.id === chatId) {
                  const duration = parseInt(durationMsg.text);

                  if (isNaN(duration)) {
                    return bot.sendMessage(chatId, "❌ Пожалуйста, введите число для длительности");
                  }

                  // Сохраняем звонок в базу данных
                  db.run(
                    `INSERT INTO calls (creator_id, scheduled_time, duration_minutes) VALUES (?, ?, ?)`,
                    [chatId, timeMsg.text, duration],
                    function(err) {
                      if (err) {
                        console.error('Database insert error:', err);
                        return bot.sendMessage(chatId, "❌ Ошибка при создании звонка");
                      }

                      const callId = this.lastID;
                      const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;

                      const message = `
✅ *Звонок создан!*

📅 Время: ${timeMsg.text}
⏱ Длительность: ${duration} минут
🔗 Ссылка для присоединения: ${joinLink}

Перешлите эту ссылку вашему собеседнику!
                      `;

                      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
                        .catch(error => console.error('Send message error:', error));
                    }
                  );
                }
              });
            })
            .catch(error => console.error('Send message error:', error));
        }
      });
    })
    .catch(error => console.error('Send message error:', error));
});

// Проверка запланированных звонков каждую минуту
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

console.log('🔄 Бот запускается...');