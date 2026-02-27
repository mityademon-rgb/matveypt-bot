// bot.js - Главный файл бота
import dotenv from 'dotenv';
dotenv.config();
console.log("BOOT FILE:", import.meta.url);
console.log("BOOT MARK:", "BOTJS_REAL_2026_02_27");
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { analyzeMessage } from './agent.js';
import { calculatePackages } from './pricing.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();
const WEBAPP_BASE_URL = process.env.WEBAPP_BASE_URL || 'https://matveypt-bot-production.up.railway.app';

const sessions = new Map();

// ПОСТОЯННАЯ КЛАВИАТУРА
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '📺 О канале' }, { text: '🎯 Рекламные возможности' }],
    [{ text: '💰 Посчитать бюджет' }],
    [{ text: '📞 Связаться с менеджером' }]
  ],
  resize_keyboard: true,
  persistent: true
};

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ MatveyPT Bot is running!');
});

app.post('/api/calculate', (req, res) => {
  const { intent, platforms, duration } = req.body;
  const packages = calculatePackages(intent, {
    duration: duration || '1m',
@@ -490,83 +491,83 @@ bot.on('callback_query', async (query) => {
      }
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg.web_app_data) {
    await handleWebAppData(msg);
    return;
  }

  const text = msg.text;

  if (text?.startsWith('/') || msg.contact) return;

  if (text === '📺 О канале') {
  const keyboard = {
    inline_keyboard: [[
      {
        text: '📺 Открыть страницу канала',
        web_app: {
          url: 'https://matveypt-bot-production.up.railway.app/about.html'
          url: `${WEBAPP_BASE_URL}/about.html`
        }
      }
    ]]
  };
  await bot.sendMessage(chatId, '📺 Информация о канале — открывайте! 👇', { reply_markup: keyboard });
  return;
}


  if (text === '🎯 Рекламные возможности') {
  const keyboard = {
    inline_keyboard: [[
      {
        text: '🎯 Открыть рекламные форматы',
        web_app: {
          url: 'https://matveypt-bot-production.up.railway.app/advertising.html'
          url: `${WEBAPP_BASE_URL}/advertising.html`
        }
      }
    ]]
  };
  await bot.sendMessage(chatId, '🎯 Рекламные возможности — открывайте! 👇', { reply_markup: keyboard });
  return;
}


  if (text === '💰 Посчитать бюджет') {
    const keyboard = {
      inline_keyboard: [[
        {
          text: '🧮 Открыть калькулятор',
          web_app: {
            url: 'https://matveypt-bot-production.up.railway.app/calculator.html'
            url: `${WEBAPP_BASE_URL}/calculator.html`
          }
        }
      ]]
    };

    await bot.sendMessage(chatId, '💰 Калькулятор бюджета — открывайте! 👇', { reply_markup: keyboard });
    return;
  }

  if (text === '📞 Связаться с менеджером') {
    const keyboard = {
      inline_keyboard: [[
        { text: '💬 Написать', url: `https://t.me/${process.env.MANAGER_USERNAME}` }
      ]]
    };
    await bot.sendMessage(chatId, 'Свяжитесь с менеджером:', { reply_markup: keyboard });
    return;
  }

  const session = sessions.get(chatId) || {
    stage: 'greeting',
    context: [],
    brief: {
      telegramUsername: msg.from.username || null,
      firstName: msg.from.first_name || null
