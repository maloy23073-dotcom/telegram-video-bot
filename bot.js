require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { Sequelize, DataTypes } = require('sequelize');
const express = require('express');
const path = require('path');

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

// Инициализация PostgreSQL через Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: false
});

// Модели базы данных
const User = sequelize.define('User', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    username: DataTypes.STRING,
    first_name: DataTypes.STRING,
    last_name: DataTypes.STRING
}, { timestamps: true });

const Call = sequelize.define('Call', {
    call_code: { type: DataTypes.STRING, unique: true },
    creator_id: DataTypes.INTEGER,
    creator_username: DataTypes.STRING,
    call_name: { type: DataTypes.STRING, defaultValue: '' },
    status: { type: DataTypes.STRING, defaultValue: 'active' },
    ended_at: DataTypes.DATE
}, { timestamps: true });

const CallParticipant = sequelize.define('CallParticipant', {
    user_id: DataTypes.INTEGER,
    username: DataTypes.STRING,
    left_at: DataTypes.DATE
}, { timestamps: true });

// Связи между таблицами
Call.hasMany(CallParticipant, { foreignKey: 'call_id' });
CallParticipant.belongsTo(Call, { foreignKey: 'call_id' });

// Инициализация Express для Webhooks
const app = express();
app.use(express.json());

// Инициализация бота с Webhooks
const bot = new TelegramBot(TOKEN, { webHook: true });
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
async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ PostgreSQL connected successfully');

        await sequelize.sync({ force: false });
        console.log('✅ Database tables synchronized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        process.exit(1);
    }
}

// Функция для сохранения/обновления информации о пользователе
async function saveUser(user) {
    try {
        await User.upsert({
            user_id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name
        });
    } catch (error) {
        console.error('❌ Save user error:', error);
    }
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
    saveUser(msg.from);

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
    const user = callbackQuery.from;

    try {
        if (data === 'new_call') {
            await handleNewCall(chatId, user);
        } else if (data === 'join_call') {
            await handleJoinCall(chatId);
        } else if (data === 'my_calls') {
            await handleMyCalls(chatId, user);
        }
    } catch (error) {
        console.error('Callback error:', error);
        bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте снова.");
    }

    bot.answerCallbackQuery(callbackQuery.id);
});

// Обработчик создания нового звонка
async function handleNewCall(chatId, user) {
    const callCode = generateCallCode();

    try {
        // Сохраняем звонок в базу данных
        const call = await Call.create({
            call_code: callCode,
            creator_id: user.id,
            creator_username: user.username || user.first_name
        });

        // Добавляем создателя как участника
        await CallParticipant.create({
            call_id: call.id,
            user_id: user.id,
            username: user.username || user.first_name
        });

        // Формируем ссылку для присоединения к звонку
        const callLink = `${WEB_APP_URL}?call_code=${callCode}&user_id=${user.id}`;

        const message = `✅ Звонок создан!\n\nКод звонка: <code>${callCode}</code>\n\nПрисоединиться: ${callLink}`;

        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Create call error:', error);
        bot.sendMessage(chatId, "❌ Не удалось создать звонок. Попробуйте снова.");
    }
}

// Обработчик присоединения к звонку
async function handleJoinCall(chatId) {
    bot.sendMessage(chatId, "Введите код звонка:", {
        reply_markup: {
            force_reply: true,
            selective: true
        }
    }).then(sentMsg => {
        // Ожидаем ответ с кодом звонка
        bot.onReplyToMessage(chatId, sentMsg.message_id, async (msg) => {
            const callCode = msg.text.trim().toUpperCase();

            try {
                // Ищем звонок в базе данных
                const call = await Call.findOne({ where: { call_code: callCode, status: 'active' } });

                if (!call) {
                    bot.sendMessage(chatId, "❌ Звонок не найден или уже завершен.");
                    return;
                }

                // Формируем ссылку для присоединения
                const callLink = `${WEB_APP_URL}?call_code=${callCode}&user_id=${msg.from.id}`;
                bot.sendMessage(chatId, `✅ Присоединиться к звонку: ${callLink}`);
            } catch (error) {
                console.error('Join call error:', error);
                bot.sendMessage(chatId, "❌ Произошла ошибка. Попробуйте снова.");
            }
        });
    });
}

// Обработчик просмотра своих звонки
async function handleMyCalls(chatId, user) {
    try {
        // Ищем активные звонки пользователя
        const calls = await Call.findAll({
            where: { creator_id: user.id, status: 'active' },
            include: [{
                model: CallParticipant,
                where: { user_id: user.id },
                required: false
            }],
            order: [['createdAt', 'DESC']],
            limit: 5
        });

        if (calls.length === 0) {
            bot.sendMessage(chatId, "У вас нет активных звонков.");
            return;
        }

        let message = "📋 Ваши активные звонки:\n\n";
        calls.forEach(call => {
            const callLink = `${WEB_APP_URL}?call_code=${call.call_code}&user_id=${user.id}`;
            message += `🔹 ${call.call_name || 'Без названия'} (Код: <code>${call.call_code}</code>)\nПрисоединиться: ${callLink}\n\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('My calls error:', error);
        bot.sendMessage(chatId, "❌ Не удалось загрузить список звонков.");
    }
}

// Обработчик текстовых сообщений
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return; // Пропускаем команды

    saveUser(msg.from);
});

// Инициализация и запуск сервера
async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Bot server running on port ${PORT}`);
            console.log(`🌐 Webhook URL: ${RENDER_URL}/bot${TOKEN}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Обработчики ошибок
bot.on('error', (error) => console.error('❌ Bot error:', error));
bot.on('polling_error', (error) => console.error('❌ Polling error:', error));

// Запуск сервера
startServer();

console.log('✅ Bot configured for Webhooks');