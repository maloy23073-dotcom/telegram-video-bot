const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ===== КОНФИГУРАЦИЯ =====
// ===== КОНФИГУРАЦИЯ =====
const TOKEN = process.env.BOT_TOKEN || '8474432468:AAE7xQulaUCRxrCS4iKHxMT3EXXXSHa_ZyQ'; // Используем переменные окружения
const SERVER_URL = process.env.SERVER_URL || 'https://your-domain.com'; // Render сам подставит свой URL
// ========================
// ========================

const bot = new TelegramBot(TOKEN, { polling: true });
const db = new sqlite3.Database(path.join(__dirname, 'calls.db'));

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
  `);
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
  
  bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
});

// Обработчик команды /newcall
bot.onText(/\/newcall/, (msg) => {
  const chatId = msg.chat.id;
  const steps = {
    askTime: 1,
    askDuration: 2,
    askParticipant: 3
  };
  
  let userState = { step: steps.askTime };
  
  bot.sendMessage(chatId, "🕐 *На какое время планируем звонок?*\nВведите в формате: ГГГГ-ММ-ДД ЧЧ:ММ\nНапример: 2024-12-25 15:30", { parse_mode: 'Markdown' })
    .then(() => {
      // Ждем ответа пользователя
      bot.once('message', (timeMsg) => {
        if (timeMsg.chat.id === chatId) {
          userState.time = timeMsg.text;
          userState.step = steps.askDuration;
          
          bot.sendMessage(chatId, "⏱ *Какова продолжительность звонка?* (в минутах)\nНапример: 30", { parse_mode: 'Markdown' })
            .then(() => {
              bot.once('message', (durationMsg) => {
                if (durationMsg.chat.id === chatId) {
                  userState.duration = parseInt(durationMsg.text);
                  userState.step = steps.askParticipant;
                  
                  // Сохраняем звонок в базу данных
                  db.run(
                    `INSERT INTO calls (creator_id, scheduled_time, duration_minutes) VALUES (?, ?, ?)`,
                    [chatId, userState.time, userState.duration],
                    function(err) {
                      if (err) {
                        return bot.sendMessage(chatId, "❌ Ошибка при создании звонка");
                      }
                      
                      const callId = this.lastID;
                      const joinLink = `${SERVER_URL}/call.html?call_id=${callId}`;
                      
                      const message = `
✅ *Звонок создан!*

📅 Время: ${userState.time}
⏱ Длительность: ${userState.duration} минут
🔗 Ссылка для присоединения: ${joinLink}

Перешлите эту ссылку вашему собеседнику!
                      `;
                      
                      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                    }
                  );
                }
              });
            });
        }
      });
    });
});

// Проверка запланированных звонков каждую минуту
setInterval(() => {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  
  db.all(
    `SELECT * FROM calls WHERE scheduled_time LIKE ? AND status = 'scheduled'`,
    [`${now}%`],
    (err, rows) => {
      if (err) throw err;
      
      rows.forEach(call => {
        const joinLink = `${SERVER_URL}/call.html?call_id=${call.id}`;
        const message = `🎉 *Время звонка!*\n\nПрисоединяйтесь по ссылке: ${joinLink}`;
        
        // Отправляем сообщение создателю
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
        });
        
        // Помечаем звонок как активный
        db.run(`UPDATE calls SET status = 'active' WHERE id = ?`, [call.id]);
      });
    }
  );
}, 60000); // Проверяем каждую минуту

console.log('Бот запущен...');