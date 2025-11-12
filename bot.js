// bot.js - Главный файл бота
import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { analyzeMessage } from './agent.js';
import { calculatePackages } from './pricing.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();

// Хранилище сессий
const sessions = new Map();

// Веб-сервер
app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ MatveyPT Bot is running!');
});

app.post('/api/calculate', (req, res) => {
  const { intent, platforms, duration } = req.body;
  const packages = calculatePackages(intent, {
    duration: duration || '1m',
    platforms: platforms || ['air'],
    hasCreative: intent === 'production' || intent === 'combo'
  });
  res.json(packages);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});

// === ФУНКЦИЯ: НАПОМИНАНИЕ МЕНЕДЖЕРУ ===
async function sendReminderToManager(chatId, brief) {
  const managerChatId = process.env.MANAGER_CHAT_ID;
  if (!managerChatId) return;
  
  const reminderMessage = `⏰ НАПОМИНАНИЕ!

Клиент ${brief.firstName} открыл калькулятор 15 минут назад!

📱 Телефон: ${brief.phone || 'НЕТ'}
💬 Telegram: @${brief.telegramUsername || 'нет'}

⚠️ КЛИЕНТ МОЖЕТ ОСТЫТЬ — ЗВОНИТЕ СРОЧНО!

Написать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}

Время: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, reminderMessage);
    console.log(`⏰ Напоминание отправлено (клиент ${brief.firstName})`);
  } catch (err) {
    console.error('❌ Ошибка отправки напоминания:', err.message);
  }
}

// === КОМАНДЫ ===

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  sessions.set(chatId, {
    stage: 'greeting',
    context: [],
    brief: {
      telegramUsername: msg.from.username || null,
      firstName: msg.from.first_name || null,
      phone: null,
      email: null,
      companyName: null,
      companyBusiness: null,
      city: null,
      targetAudience: null,
      task: null,
      format: null,
      creative: null,
      placement: null,
      executor: null,
      goal: null
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false,
    managerNotifiedAt: null
  });
  
  // НОВОЕ ПРИВЕТСТВИЕ
  const greeting = `Привет! 👋 

Я Матвей — высокоинтеллектуальный виртуальный продюсер Первого Туристического канала.

Помогаю подобрать рекламные решения, креативы и рассчитать бюджет. Общаюсь по-человечески — без воды и сложных слов! 😊

Внизу есть кнопки — можете в любой момент узнать подробности о канале, рекламных возможностях или посчитать бюджет! 📊

Давайте знакомиться! Как вас зовут и чем занимаетесь? 🚀`;

  // КНОПКИ ВНИЗУ (ПОСТОЯННЫЕ!)
  const mainKeyboard = {
    keyboard: [
      [
        { text: '📺 О канале' },
        { text: '🎯 Рекламные возможности' }
      ],
      [
        { text: '💰 Посчитать бюджет' }
      ],
      [
        { text: '📞 Связаться с менеджером' }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };

  await bot.sendMessage(chatId, greeting, {
    reply_markup: mainKeyboard
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // ЗАПРОС КОНТАКТА
  const contactRequest = `Чтобы я мог отправить вам коммерческое предложение после расчёта, поделитесь контактом 👇`;

  const contactKeyboard = {
    keyboard: [
      [{ text: '📱 Поделиться контактом', request_contact: true }],
      [{ text: '✍️ Написать вручную' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await bot.sendMessage(chatId, contactRequest, {
    reply_markup: contactKeyboard
  });
});

bot.onText(/\/menu/, async (msg) => {
  const mainKeyboard = {
    keyboard: [
      [
        { text: '📺 О канале' },
        { text: '🎯 Рекламные возможности' }
      ],
      [
        { text: '💰 Посчитать бюджет' }
      ],
      [
        { text: '📞 Связаться с менеджером' }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
  
  await bot.sendMessage(msg.chat.id, 'Меню открыто 👇', {
    reply_markup: mainKeyboard
  });
});

bot.onText(/\/app/, async (msg) => {
  const chatId = msg.chat.id;
  
  const keyboard = {
    inline_keyboard: [[
      { 
        text: '🚀 Открыть меню задач',
        web_app: { 
          url: `${process.env.WEB_APP_URL || 'http://localhost:3000'}/menu.html`
        }
      }
    ]]
  };

  await bot.sendMessage(chatId, 'Выберите задачу в приложении 👇', {
    reply_markup: keyboard
  });
});

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(msg.chat.id, `Ваш Chat ID: ${msg.chat.id}`);
});

bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  const managerChatId = process.env.MANAGER_CHAT_ID;
  
  await bot.sendMessage(chatId, `🧪 Проверяю настройки...

Твой Chat ID: ${chatId}
MANAGER_CHAT_ID: ${managerChatId || 'НЕ НАСТРОЕН'}

Отправляю тестовое уведомление...`);
  
  if (!managerChatId) {
    await bot.sendMessage(chatId, '❌ MANAGER_CHAT_ID не настроен');
    return;
  }
  
  const testMessage = `🧪 ТЕСТОВОЕ УВЕДОМЛЕНИЕ

От: ${msg.from.first_name}
Chat ID: ${chatId}
Telegram: @${msg.from.username || 'нет'}

Если видишь это — работает! ✅

Время: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, testMessage);
    await bot.sendMessage(chatId, `✅ Отправлено на ${managerChatId}`);
    console.log(`✅ Тест отправлен`);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Ошибка: ${err.message}`);
    console.error('❌ Ошибка теста:', err);
  }
});

bot.onText(/\/clients/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (chatId.toString() !== process.env.MANAGER_CHAT_ID) {
    await bot.sendMessage(chatId, '❌ Команда только для менеджера');
    return;
  }
  
  if (sessions.size === 0) {
    await bot.sendMessage(chatId, '📭 Нет активных сессий');
    return;
  }
  
  let clientsList = `👥 АКТИВНЫЕ КЛИЕНТЫ: ${sessions.size}\n\n`;
  
  sessions.forEach((session, clientChatId) => {
    const brief = session.brief;
    clientsList += `━━━━━━━━━━━━━━━━━━━━\n`;
    clientsList += `👤 ${brief.firstName || 'Без имени'}\n`;
    clientsList += `📱 ${brief.phone || '❌ нет'}\n`;
    clientsList += `💬 @${brief.telegramUsername || 'нет'}\n`;
    clientsList += `🏢 ${brief.companyName || '?'}\n`;
    clientsList += `🎯 ${brief.task || '?'}\n`;
    clientsList += `🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}\n\n`;
  });
  
  await bot.sendMessage(chatId, clientsList);
});

bot.onText(/\/brief/, async (msg) => {
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);
  
  if (!session) {
    await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start');
    return;
  }
  
  const brief = session.brief;
  
  const briefText = `📋 ВАШ БРИФ:

Контакты:
👤 ${brief.firstName || 'не указано'}
📱 ${brief.phone || 'не указан'}
💬 @${brief.telegramUsername || 'нет'}

Компания:
🏢 ${brief.companyName || 'не указано'}
💼 ${brief.companyBusiness || 'не указано'}
📍 ${brief.city || 'не указано'}

Проект:
🎯 ${brief.task || 'не определена'}
🎬 ${brief.format || 'не определен'}
👥 ${brief.targetAudience || 'не определена'}
💡 ${brief.creative || 'не обсуждался'}
📺 ${brief.placement || 'не определено'}

Статус:
🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}
📞 Менеджер звонил: ${session.managerCalled ? '✅' : '❌'}`;

  await bot.sendMessage(chatId, briefText);
});

// === ОБРАБОТКА КОНТАКТОВ ===
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  
  const session = sessions.get(chatId);
  if (!session) return;
  
  session.brief.phone = contact.phone_number;
  session.brief.firstName = contact.first_name;
  session.brief.telegramUsername = msg.from.username || null;
  session.contactShared = true;
  sessions.set(chatId, session);
  
  // ВОЗВРАЩАЕМ ПОСТОЯННЫЕ КНОПКИ
  const mainKeyboard = {
    keyboard: [
      [
        { text: '📺 О канале' },
        { text: '🎯 Рекламные возможности' }
      ],
      [
        { text: '💰 Посчитать бюджет' }
      ],
      [
        { text: '📞 Связаться с менеджером' }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
  
  await bot.sendMessage(chatId, `Отлично! Записал ✅`, {
    reply_markup: mainKeyboard
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  // СРАЗУ ГЛАВНЫЙ ВОПРОС
  await bot.sendMessage(chatId, `А теперь главный вопрос: что будем рекламировать? 🎯`);
  
  // УВЕДОМЛЕНИЕ МЕНЕДЖЕРУ
  const managerChatId = process.env.MANAGER_CHAT_ID;
  if (managerChatId) {
    const notif = `📞 НОВЫЙ КОНТАКТ\n\nИмя: ${contact.first_name}\nТелефон: ${contact.phone_number}\nTelegram: @${msg.from.username || 'нет'}\nID: ${chatId}`;
    try {
      await bot.sendMessage(managerChatId, notif);
    } catch (err) {
      console.error('Failed to notify manager:', err);
    }
  }
});

// === ОБРАБОТКА ДАННЫХ ИЗ MINI APP ===
bot.on('web_app_data', async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const data = JSON.parse(msg.web_app_data.data);
    console.log('📱 Данные из Mini App:', data);
    
    const session = sessions.get(chatId);
    if (!session) {
      await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start');
      return;
    }
    
    session.brief.task = data.intent;
    sessions.set(chatId, session);
    
    const confirmMessage = `✅ Выбрано: ${data.title}\n\nОтлично! Теперь расскажите подробнее о вашем проекте:`;
    await bot.sendMessage(chatId, confirmMessage);
    
    const managerChatId = process.env.MANAGER_CHAT_ID;
    if (managerChatId) {
      const brief = session.brief;
      await bot.sendMessage(
        managerChatId, 
        `🎯 Клиент выбрал: ${data.title}\n\n👤 ${brief.firstName}\n💬 @${brief.telegramUsername || 'нет'}`
      );
    }
    
  } catch (err) {
    console.error('❌ Ошибка обработки Mini App:', err);
    await bot.sendMessage(chatId, 'Ошибка обработки данных 😅');
  }
});

// === CALLBACK КНОПКИ ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  
  if (data.startsWith('called_')) {
    const clientChatId = data.replace('called_', '');
    const session = sessions.get(clientChatId);
    
    if (session) {
      session.managerCalled = true;
      sessions.set(clientChatId, session);
      
      await bot.answerCallbackQuery(query.id, { text: '✅ Отмечено!' });
      
      try {
        await bot.editMessageText(
          query.message.text + '\n\n✅ МЕНЕДЖЕР ПОЗВОНИЛ\n⏰ ' + new Date().toLocaleTimeString('ru-RU'),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          }
        );
      } catch (err) {
        console.error('Ошибка редактирования:', err.message);
      }
      
      await bot.sendMessage(clientChatId, `Наш менеджер скоро свяжется с вами 😊`);
      console.log(`✅ Менеджер позвонил клиенту ${session.brief.firstName}`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
  }
  else if (data.startsWith('closed_')) {
    const clientChatId = data.replace('closed_', '');
    const session = sessions.get(clientChatId);
    
    if (session) {
      console.log('💾 Сохраняем закрытую сделку:', session.brief);
      sessions.delete(clientChatId);
      
      await bot.answerCallbackQuery(query.id, { text: '🎉 Сделка закрыта!' });
      
      try {
        await bot.editMessageText(
          query.message.text + '\n\n🎉 СДЕЛКА ЗАКРЫТА!\n⏰ ' + new Date().toLocaleTimeString('ru-RU'),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          }
        );
      } catch (err) {
        console.error('Ошибка редактирования:', err.message);
      }
      
      console.log(`🎉 Сделка закрыта (клиент ${session.brief.firstName})`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
  }
});

// === ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text?.startsWith('/') || msg.contact) return;
  
  // === КНОПКИ МЕНЮ ===
  
  // КНОПКА: О КАНАЛЕ
  if (text === '📺 О канале') {
    const keyboard = {
      inline_keyboard: [[
        { 
          text: '📺 Открыть презентацию',
          url: 'https://docs.google.com/presentation/d/e/2PACX-1vTEA3JfmzSzA6Fx3ZNf5bsNK1YLII7GfMtM_bsUwkTJZB0McdLxkaRjDwi61VdkNT20jTVxUFe7rY_w/pub?start=false&loop=false&delayms=3000'
        }
      ]]
    };
    await bot.sendMessage(chatId, '📺 Презентация о канале — открывайте! 👇', {
      reply_markup: keyboard
    });
    return;
  }
  
  // КНОПКА: РЕКЛАМНЫЕ ВОЗМОЖНОСТИ
  if (text === '🎯 Рекламные возможности') {
    const keyboard = {
      inline_keyboard: [[
        { 
          text: '🎯 Открыть презентацию',
          url: 'https://docs.google.com/presentation/d/e/2PACX-1vRyZ_PkaWPEr5zKj_mlns-oSDO8bSbU4oUGgzAFce7DbmD0Xr0fC4DcKwxRFjEZaOSQ7Ulp1bChNVcD/pub?start=false&loop=false&delayms=3000'
        }
      ]]
    };
    await bot.sendMessage(chatId, '🎯 Рекламные возможности — открывайте! 👇', {
      reply_markup: keyboard
    });
    return;
  }
  
  // КНОПКА: ПОСЧИТАТЬ БЮДЖЕТ
  if (text === '💰 Посчитать бюджет') {
    const session = sessions.get(chatId);
    
    if (!session || !session.contactShared) {
      await bot.sendMessage(chatId, 'Сначала давайте познакомимся! Напишите /start 😊');
      return;
    }
    
    const keyboard = {
      inline_keyboard: [[
        { 
          text: '🧮 Открыть калькулятор',
          web_app: { 
            url: `${process.env.WEB_APP_URL}/calculator.html`
          }
        }
      ]]
    };
    
    await bot.sendMessage(chatId, '💰 Калькулятор бюджета — открывайте! 👇', {
      reply_markup: keyboard
    });
    return;
  }
  
  // КНОПКА: СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ
  if (text === '📞 Связаться с менеджером') {
    const keyboard = {
      inline_keyboard: [[
        { text: '💬 Написать', url: `https://t.me/${process.env.MANAGER_USERNAME}` }
      ]]
    };
    await bot.sendMessage(chatId, 'Свяжитесь с менеджером:', { reply_markup: keyboard });
    return;
  }
  
  // СТАРЫЕ КНОПКИ (на всякий случай)
  if (text === '📋 Мой бриф') {
    const session = sessions.get(chatId);
    if (!session) {
      await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start');
      return;
    }
    
    const brief = session.brief;
    const briefText = `📋 ВАШ БРИФ:\n\n👤 ${brief.firstName || 'не указано'}\n📱 ${brief.phone || 'не указан'}\n🏢 ${brief.companyName || 'не указано'}\n🎯 ${brief.task || 'не определена'}`;
    await bot.sendMessage(chatId, briefText);
    return;
  }
  
  if (text === '❓ Помощь') {
    const help = `📚 Команды:\n\n/start — Начать\n/brief — Ваш бриф\n/menu — Меню\n\nИспользуйте кнопки внизу! 😊`;
    await bot.sendMessage(chatId, help);
    return;
  }
  
  if (text === '🔄 Начать заново') {
    sessions.delete(chatId);
    await bot.sendMessage(chatId, 'Сброшено! Напишите /start');
    return;
  }
  
  // === СЕССИЯ ===
  const session = sessions.get(chatId) || {
    stage: 'greeting',
    context: [],
    brief: {
      telegramUsername: msg.from.username || null,
      firstName: msg.from.first_name || null
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false
  };
  
  try {
    const lowerText = text.toLowerCase();
    
    // СБОР КОНТАКТОВ (если написал вручную)
    if (!session.contactShared && session.stage === 'greeting') {
      const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (phoneRegex.test(text.replace(/\s/g, ''))) {
        session.brief.phone = text.replace(/\s/g, '');
        session.contactShared = true;
        
        // ВОЗВРАЩАЕМ ПОСТОЯННЫЕ КНОПКИ
        const mainKeyboard = {
          keyboard: [
            [
              { text: '📺 О канале' },
              { text: '🎯 Рекламные возможности' }
            ],
            [
              { text: '💰 Посчитать бюджет' }
            ],
            [
              { text: '📞 Связаться с менеджером' }
            ]
          ],
          resize_keyboard: true,
          persistent: true
        };
        
        await bot.sendMessage(chatId, `Отлично! Записал ✅`, {
          reply_markup: mainKeyboard
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        await bot.sendMessage(chatId, `А теперь главный вопрос: что будем рекламировать? 🎯`);
        
        const managerChatId = process.env.MANAGER_CHAT_ID;
        if (managerChatId) {
          await bot.sendMessage(managerChatId, `📞 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nТелефон: ${session.brief.phone}\nTelegram: @${msg.from.username || 'нет'}`);
        }
        
        sessions.set(chatId, session);
        return;
      } 
      else if (emailRegex.test(text)) {
        session.brief.email = text;
        session.contactShared = true;
        
        // ВОЗВРАЩАЕМ ПОСТОЯННЫЕ КНОПКИ
        const mainKeyboard = {
          keyboard: [
            [
              { text: '📺 О канале' },
              { text: '🎯 Рекламные возможности' }
            ],
            [
              { text: '💰 Посчитать бюджет' }
            ],
            [
              { text: '📞 Связаться с менеджером' }
            ]
          ],
          resize_keyboard: true,
          persistent: true
        };
        
        await bot.sendMessage(chatId, `Отлично! Записал ✅`, {
          reply_markup: mainKeyboard
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        await bot.sendMessage(chatId, `А теперь главный вопрос: что будем рекламировать? 🎯`);
        
        const managerChatId = process.env.MANAGER_CHAT_ID;
        if (managerChatId) {
          await bot.sendMessage(managerChatId, `📧 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nEmail: ${session.brief.email}\nTelegram: @${msg.from.username || 'нет'}`);
        }
        
        sessions.set(chatId, session);
        return;
      }
      else if (lowerText === '✍️ написать вручную') {
        await bot.sendMessage(chatId, 'Напишите телефон или email:', { reply_markup: { remove_keyboard: true } });
        return;
      }
    }
    
    // === AI ===
    await bot.sendChatAction(chatId, 'typing');
    
    const contextToSend = session.context.slice(-12);
    const aiResponse = await analyzeMessage(text, contextToSend);
    
    session.context.push(
      { role: 'user', content: text },
      { role: 'assistant', content: aiResponse.message || '' }
    );
    
    if (aiResponse.brief) {
      Object.keys(aiResponse.brief).forEach(key => {
        if (aiResponse.brief[key] && aiResponse.brief[key] !== 'null') {
          session.brief[key] = aiResponse.brief[key];
        }
      });
    }
    
    // ЭСКАЛАЦИЯ
    if (aiResponse.confidence < 0.3) {
      const keyboard = {
        inline_keyboard: [[
          { text: '💬 Написать менеджеру', url: `https://t.me/${process.env.MANAGER_USERNAME}` }
        ]]
      };

      await bot.sendMessage(chatId, `Отличный вопрос! 🤔\n\nПередаю менеджеру — он разберётся детально.`, 
        { reply_markup: keyboard });
      
      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        const brief = session.brief;
        const context = session.context.slice(-10).map(m => {
          const role = m.role === 'user' ? '👤' : '🤖';
          return `${role} ${m.content.substring(0, 150)}`;
        }).join('\n\n');
        
        const briefMessage = `🔔 ЭСКАЛАЦИЯ\n\n👤 ${brief.firstName}\n📱 ${brief.phone || 'нет'}\n💬 @${brief.telegramUsername || 'нет'}\n\n🏢 ${brief.companyName || '?'}\n🎯 ${brief.task || '?'}\n\nНаписать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}\n\nДиалог:\n${context}`;
        
        const managerKeyboard = {
          inline_keyboard: [[
            { text: '💬 Ответить', url: msg.from.username ? `https://t.me/${msg.from.username}` : `tg://user?id=${chatId}` }
          ]]
        };
        
        try {
          await bot.sendMessage(managerChatId, briefMessage, { reply_markup: managerKeyboard });
        } catch (err) {
          console.error('Failed to send manager notification:', err);
        }
      }
      
      sessions.set(chatId, session);
      return;
    }
    
    // ОТВЕТ AI
    if (aiResponse.message) {
      await bot.sendMessage(chatId, aiResponse.message, { parse_mode: 'Markdown' });
    }
    
    // КАЛЬКУЛЯТОР
    if (aiResponse.readyForCalculator === true && !session.calculatorShown) {
      session.calculatorShown = true;
      sessions.set(chatId, session);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // ПРОСТО ТЕКСТ — КНОПКА УЖЕ ВНИЗУ!
      await bot.sendMessage(chatId, 'Давайте прикинем бюджет! Жмите кнопку внизу "💰 Посчитать бюджет" — я уже ввёл начальные данные! 🧮👇');
      
      //
// bot.js - Главный файл бота
import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { analyzeMessage } from './agent.js';
import { calculatePackages } from './pricing.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();

// Хранилище сессий
const sessions = new Map();

// Веб-сервер
app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ MatveyPT Bot is running!');
});

app.post('/api/calculate', (req, res) => {
  const { intent, platforms, duration } = req.body;
  const packages = calculatePackages(intent, {
    duration: duration || '1m',
    platforms: platforms || ['air'],
    hasCreative: intent === 'production' || intent === 'combo'
  });
  res.json(packages);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});

// === ФУНКЦИЯ: НАПОМИНАНИЕ МЕНЕДЖЕРУ ===
async function sendReminderToManager(chatId, brief) {
  const managerChatId = process.env.MANAGER_CHAT_ID;
  if (!managerChatId) return;
  
  const reminderMessage = `⏰ НАПОМИНАНИЕ!

Клиент ${brief.firstName} открыл калькулятор 15 минут назад!

📱 Телефон: ${brief.phone || 'НЕТ'}
💬 Telegram: @${brief.telegramUsername || 'нет'}

⚠️ КЛИЕНТ МОЖЕТ ОСТЫТЬ — ЗВОНИТЕ СРОЧНО!

Написать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}

Время: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, reminderMessage);
    console.log(`⏰ Напоминание отправлено (клиент ${brief.firstName})`);
  } catch (err) {
    console.error('❌ Ошибка отправки напоминания:', err.message);
  }
}

// === КОМАНДЫ ===

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  sessions.set(chatId, {
    stage: 'greeting',
    context: [],
    brief: {
      telegramUsername: msg.from.username || null,
      firstName: msg.from.first_name || null,
      phone: null,
      email: null,
      companyName: null,
      companyBusiness: null,
      city: null,
      targetAudience: null,
      task: null,
      format: null,
      creative: null,
      placement: null,
      executor: null,
      goal: null
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false,
    managerNotifiedAt: null
  });
  
  // НОВОЕ ПРИВЕТСТВИЕ
  const greeting = `Привет! 👋 

Я Матвей — высокоинтеллектуальный виртуальный продюсер Первого Туристического канала.

Помогаю подобрать рекламные решения, креативы и рассчитать бюджет. Общаюсь по-человечески — без воды и сложных слов! 😊

Внизу есть кнопки — можете в любой момент узнать подробности о канале, рекламных возможностях или посчитать бюджет! 📊

Давайте знакомиться! Как вас зовут и чем занимаетесь? 🚀`;

  // КНОПКИ ВНИЗУ (ПОСТОЯННЫЕ!)
  const mainKeyboard = {
    keyboard: [
      [
        { text: '📺 О канале' },
        { text: '🎯 Рекламные возможности' }
      ],
      [
        { text: '💰 Посчитать бюджет' }
      ],
      [
        { text: '📞 Связаться с менеджером' }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };

  await bot.sendMessage(chatId, greeting, {
    reply_markup: mainKeyboard
  });
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // ЗАПРОС КОНТАКТА
  const contactRequest = `Чтобы я мог отправить вам коммерческое предложение после расчёта, поделитесь контактом 👇`;

  const contactKeyboard = {
    keyboard: [
      [{ text: '📱 Поделиться контактом', request_contact: true }],
      [{ text: '✍️ Написать вручную' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await bot.sendMessage(chatId, contactRequest, {
    reply_markup: contactKeyboard
  });
});

bot.onText(/\/menu/, async (msg) => {
  const mainKeyboard = {
    keyboard: [
      [
        { text: '📺 О канале' },
        { text: '🎯 Рекламные возможности' }
      ],
      [
        { text: '💰 Посчитать бюджет' }
      ],
      [
        { text: '📞 Связаться с менеджером' }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
  
  await bot.sendMessage(msg.chat.id, 'Меню открыто 👇', {
    reply_markup: mainKeyboard
  });
});

bot.onText(/\/app/, async (msg) => {
  const chatId = msg.chat.id;
  
  const keyboard = {
    inline_keyboard: [[
      { 
        text: '🚀 Открыть меню задач',
        web_app: { 
          url: `${process.env.WEB_APP_URL || 'http://localhost:3000'}/menu.html`
        }
      }
    ]]
  };

  await bot.sendMessage(chatId, 'Выберите задачу в приложении 👇', {
    reply_markup: keyboard
  });
});

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(msg.chat.id, `Ваш Chat ID: ${msg.chat.id}`);
});

bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  const managerChatId = process.env.MANAGER_CHAT_ID;
  
  await bot.sendMessage(chatId, `🧪 Проверяю настройки...

Твой Chat ID: ${chatId}
MANAGER_CHAT_ID: ${managerChatId || 'НЕ НАСТРОЕН'}

Отправляю тестовое уведомление...`);
  
  if (!managerChatId) {
    await bot.sendMessage(chatId, '❌ MANAGER_CHAT_ID не настроен');
    return;
  }
  
  const testMessage = `🧪 ТЕСТОВОЕ УВЕДОМЛЕНИЕ

От: ${msg.from.first_name}
Chat ID: ${chatId}
Telegram: @${msg.from.username || 'нет'}

Если видишь это — работает! ✅

Время: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, testMessage);
    await bot.sendMessage(chatId, `✅ Отправлено на ${managerChatId}`);
    console.log(`✅ Тест отправлен`);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Ошибка: ${err.message}`);
    console.error('❌ Ошибка теста:', err);
  }
});

bot.onText(/\/clients/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (chatId.toString() !== process.env.MANAGER_CHAT_ID) {
    await bot.sendMessage(chatId, '❌ Команда только для менеджера');
    return;
  }
  
  if (sessions.size === 0) {
    await bot.sendMessage(chatId, '📭 Нет активных сессий');
    return;
  }
  
  let clientsList = `👥 АКТИВНЫЕ КЛИЕНТЫ: ${sessions.size}\n\n`;
  
  sessions.forEach((session, clientChatId) => {
    const brief = session.brief;
    clientsList += `━━━━━━━━━━━━━━━━━━━━\n`;
    clientsList += `👤 ${brief.firstName || 'Без имени'}\n`;
    clientsList += `📱 ${brief.phone || '❌ нет'}\n`;
    clientsList += `💬 @${brief.telegramUsername || 'нет'}\n`;
    clientsList += `🏢 ${brief.companyName || '?'}\n`;
    clientsList += `🎯 ${brief.task || '?'}\n`;
    clientsList += `🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}\n\n`;
  });
  
  await bot.sendMessage(chatId, clientsList);
});

bot.onText(/\/brief/, async (msg) => {
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);
  
  if (!session) {
    await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start');
    return;
  }
  
  const brief = session.brief;
  
  const briefText = `📋 ВАШ БРИФ:

Контакты:
👤 ${brief.firstName || 'не указано'}
📱 ${brief.phone || 'не указан'}
💬 @${brief.telegramUsername || 'нет'}

Компания:
🏢 ${brief.companyName || 'не указано'}
💼 ${brief.companyBusiness || 'не указано'}
📍 ${brief.city || 'не указано'}

Проект:
🎯 ${brief.task || 'не определена'}
🎬 ${brief.format || 'не определен'}
👥 ${brief.targetAudience || 'не определена'}
💡 ${brief.creative || 'не обсуждался'}
📺 ${brief.placement || 'не определено'}

Статус:
🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}
📞 Менеджер звонил: ${session.managerCalled ? '✅' : '❌'}`;

  await bot.sendMessage(chatId, briefText);
});

// === ОБРАБОТКА КОНТАКТОВ ===
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  
  const session = sessions.get(chatId);
  if (!session) return;
  
  session.brief.phone = contact.phone_number;
  session.brief.firstName = contact.first_name;
  session.brief.telegramUsername = msg.from.username || null;
  session.contactShared = true;
  sessions.set(chatId, session);
  
  // ВОЗВРАЩАЕМ ПОСТОЯННЫЕ КНОПКИ
  const mainKeyboard = {
    keyboard: [
      [
        { text: '📺 О канале' },
        { text: '🎯 Рекламные возможности' }
      ],
      [
        { text: '💰 Посчитать бюджет' }
      ],
      [
        { text: '📞 Связаться с менеджером' }
      ]
    ],
    resize_keyboard: true,
    persistent: true
  };
  
  await bot.sendMessage(chatId, `Отлично! Записал ✅`, {
    reply_markup: mainKeyboard
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  // СРАЗУ ГЛАВНЫЙ ВОПРОС
  await bot.sendMessage(chatId, `А теперь главный вопрос: что будем рекламировать? 🎯`);
  
  // УВЕДОМЛЕНИЕ МЕНЕДЖЕРУ
  const managerChatId = process.env.MANAGER_CHAT_ID;
  if (managerChatId) {
    const notif = `📞 НОВЫЙ КОНТАКТ\n\nИмя: ${contact.first_name}\nТелефон: ${contact.phone_number}\nTelegram: @${msg.from.username || 'нет'}\nID: ${chatId}`;
    try {
      await bot.sendMessage(managerChatId, notif);
    } catch (err) {
      console.error('Failed to notify manager:', err);
    }
  }
});

// === ОБРАБОТКА ДАННЫХ ИЗ MINI APP ===
bot.on('web_app_data', async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const data = JSON.parse(msg.web_app_data.data);
    console.log('📱 Данные из Mini App:', data);
    
    const session = sessions.get(chatId);
    if (!session) {
      await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start');
      return;
    }
    
    session.brief.task = data.intent;
    sessions.set(chatId, session);
    
    const confirmMessage = `✅ Выбрано: ${data.title}\n\nОтлично! Теперь расскажите подробнее о вашем проекте:`;
    await bot.sendMessage(chatId, confirmMessage);
    
    const managerChatId = process.env.MANAGER_CHAT_ID;
    if (managerChatId) {
      const brief = session.brief;
      await bot.sendMessage(
        managerChatId, 
        `🎯 Клиент выбрал: ${data.title}\n\n👤 ${brief.firstName}\n💬 @${brief.telegramUsername || 'нет'}`
      );
    }
    
  } catch (err) {
    console.error('❌ Ошибка обработки Mini App:', err);
    await bot.sendMessage(chatId, 'Ошибка обработки данных 😅');
  }
});

// === CALLBACK КНОПКИ ===
bot.on('callback_query', async (query) => {
  const data = query.data;
  
  if (data.startsWith('called_')) {
    const clientChatId = data.replace('called_', '');
    const session = sessions.get(clientChatId);
    
    if (session) {
      session.managerCalled = true;
      sessions.set(clientChatId, session);
      
      await bot.answerCallbackQuery(query.id, { text: '✅ Отмечено!' });
      
      try {
        await bot.editMessageText(
          query.message.text + '\n\n✅ МЕНЕДЖЕР ПОЗВОНИЛ\n⏰ ' + new Date().toLocaleTimeString('ru-RU'),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          }
        );
      } catch (err) {
        console.error('Ошибка редактирования:', err.message);
      }
      
      await bot.sendMessage(clientChatId, `Наш менеджер скоро свяжется с вами 😊`);
      console.log(`✅ Менеджер позвонил клиенту ${session.brief.firstName}`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
  }
  else if (data.startsWith('closed_')) {
    const clientChatId = data.replace('closed_', '');
    const session = sessions.get(clientChatId);
    
    if (session) {
      console.log('💾 Сохраняем закрытую сделку:', session.brief);
      sessions.delete(clientChatId);
      
      await bot.answerCallbackQuery(query.id, { text: '🎉 Сделка закрыта!' });
      
      try {
        await bot.editMessageText(
          query.message.text + '\n\n🎉 СДЕЛКА ЗАКРЫТА!\n⏰ ' + new Date().toLocaleTimeString('ru-RU'),
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id
          }
        );
      } catch (err) {
        console.error('Ошибка редактирования:', err.message);
      }
      
      console.log(`🎉 Сделка закрыта (клиент ${session.brief.firstName})`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
  }
});

// === ОСНОВНОЙ ОБРАБОТЧИК СООБЩЕНИЙ ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text?.startsWith('/') || msg.contact) return;
  
  // === КНОПКИ МЕНЮ ===
  
  // КНОПКА: О КАНАЛЕ
  if (text === '📺 О канале') {
    const keyboard = {
      inline_keyboard: [[
        { 
          text: '📺 Открыть презентацию',
          url: 'https://docs.google.com/presentation/d/e/2PACX-1vTEA3JfmzSzA6Fx3ZNf5bsNK1YLII7GfMtM_bsUwkTJZB0McdLxkaRjDwi61VdkNT20jTVxUFe7rY_w/pub?start=false&loop=false&delayms=3000'
        }
      ]]
    };
    await bot.sendMessage(chatId, '📺 Презентация о канале — открывайте! 👇', {
      reply_markup: keyboard
    });
    return;
  }
  
  // КНОПКА: РЕКЛАМНЫЕ ВОЗМОЖНОСТИ
  if (text === '🎯 Рекламные возможности') {
    const keyboard = {
      inline_keyboard: [[
        { 
          text: '🎯 Открыть презентацию',
          url: 'https://docs.google.com/presentation/d/e/2PACX-1vRyZ_PkaWPEr5zKj_mlns-oSDO8bSbU4oUGgzAFce7DbmD0Xr0fC4DcKwxRFjEZaOSQ7Ulp1bChNVcD/pub?start=false&loop=false&delayms=3000'
        }
      ]]
    };
    await bot.sendMessage(chatId, '🎯 Рекламные возможности — открывайте! 👇', {
      reply_markup: keyboard
    });
    return;
  }
  
  // КНОПКА: ПОСЧИТАТЬ БЮДЖЕТ
  if (text === '💰 Посчитать бюджет') {
    const session = sessions.get(chatId);
    
    if (!session || !session.contactShared) {
      await bot.sendMessage(chatId, 'Сначала давайте познакомимся! Напишите /start 😊');
      return;
    }
    
    const keyboard = {
      inline_keyboard: [[
        { 
          text: '🧮 Открыть калькулятор',
          web_app: { 
            url: `${process.env.WEB_APP_URL}/calculator.html`
          }
        }
      ]]
    };
    
    await bot.sendMessage(chatId, '💰 Калькулятор бюджета — открывайте! 👇', {
      reply_markup: keyboard
    });
    return;
  }
  
  // КНОПКА: СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ
  if (text === '📞 Связаться с менеджером') {
    const keyboard = {
      inline_keyboard: [[
        { text: '💬 Написать', url: `https://t.me/${process.env.MANAGER_USERNAME}` }
      ]]
    };
    await bot.sendMessage(chatId, 'Свяжитесь с менеджером:', { reply_markup: keyboard });
    return;
  }
  
  // СТАРЫЕ КНОПКИ (на всякий случай)
  if (text === '📋 Мой бриф') {
    const session = sessions.get(chatId);
    if (!session) {
      await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start');
      return;
    }
    
    const brief = session.brief;
    const briefText = `📋 ВАШ БРИФ:\n\n👤 ${brief.firstName || 'не указано'}\n📱 ${brief.phone || 'не указан'}\n🏢 ${brief.companyName || 'не указано'}\n🎯 ${brief.task || 'не определена'}`;
    await bot.sendMessage(chatId, briefText);
    return;
  }
  
  if (text === '❓ Помощь') {
    const help = `📚 Команды:\n\n/start — Начать\n/brief — Ваш бриф\n/menu — Меню\n\nИспользуйте кнопки внизу! 😊`;
    await bot.sendMessage(chatId, help);
    return;
  }
  
  if (text === '🔄 Начать заново') {
    sessions.delete(chatId);
    await bot.sendMessage(chatId, 'Сброшено! Напишите /start');
    return;
  }
  
  // === СЕССИЯ ===
  const session = sessions.get(chatId) || {
    stage: 'greeting',
    context: [],
    brief: {
      telegramUsername: msg.from.username || null,
      firstName: msg.from.first_name || null
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false
  };
  
  try {
    const lowerText = text.toLowerCase();
    
    // СБОР КОНТАКТОВ (если написал вручную)
    if (!session.contactShared && session.stage === 'greeting') {
      const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (phoneRegex.test(text.replace(/\s/g, ''))) {
        session.brief.phone = text.replace(/\s/g, '');
        session.contactShared = true;
        
        // ВОЗВРАЩАЕМ ПОСТОЯННЫЕ КНОПКИ
        const mainKeyboard = {
          keyboard: [
            [
              { text: '📺 О канале' },
              { text: '🎯 Рекламные возможности' }
            ],
            [
              { text: '💰 Посчитать бюджет' }
            ],
            [
              { text: '📞 Связаться с менеджером' }
            ]
          ],
          resize_keyboard: true,
          persistent: true
        };
        
        await bot.sendMessage(chatId, `Отлично! Записал ✅`, {
          reply_markup: mainKeyboard
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        await bot.sendMessage(chatId, `А теперь главный вопрос: что будем рекламировать? 🎯`);
        
        const managerChatId = process.env.MANAGER_CHAT_ID;
        if (managerChatId) {
          await bot.sendMessage(managerChatId, `📞 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nТелефон: ${session.brief.phone}\nTelegram: @${msg.from.username || 'нет'}`);
        }
        
        sessions.set(chatId, session);
        return;
      } 
      else if (emailRegex.test(text)) {
        session.brief.email = text;
        session.contactShared = true;
        
        // ВОЗВРАЩАЕМ ПОСТОЯННЫЕ КНОПКИ
        const mainKeyboard = {
          keyboard: [
            [
              { text: '📺 О канале' },
              { text: '🎯 Рекламные возможности' }
            ],
            [
              { text: '💰 Посчитать бюджет' }
            ],
            [
              { text: '📞 Связаться с менеджером' }
            ]
          ],
          resize_keyboard: true,
          persistent: true
        };
        
        await bot.sendMessage(chatId, `Отлично! Записал ✅`, {
          reply_markup: mainKeyboard
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        await bot.sendMessage(chatId, `А теперь главный вопрос: что будем рекламировать? 🎯`);
        
        const managerChatId = process.env.MANAGER_CHAT_ID;
        if (managerChatId) {
          await bot.sendMessage(managerChatId, `📧 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nEmail: ${session.brief.email}\nTelegram: @${msg.from.username || 'нет'}`);
        }
        
        sessions.set(chatId, session);
        return;
      }
      else if (lowerText === '✍️ написать вручную') {
        await bot.sendMessage(chatId, 'Напишите телефон или email:', { reply_markup: { remove_keyboard: true } });
        return;
      }
    }
    
    // === AI ===
    await bot.sendChatAction(chatId, 'typing');
    
    const contextToSend = session.context.slice(-12);
    const aiResponse = await analyzeMessage(text, contextToSend);
    
    session.context.push(
      { role: 'user', content: text },
      { role: 'assistant', content: aiResponse.message || '' }
    );
    
    if (aiResponse.brief) {
      Object.keys(aiResponse.brief).forEach(key => {
        if (aiResponse.brief[key] && aiResponse.brief[key] !== 'null') {
          session.brief[key] = aiResponse.brief[key];
        }
      });
    }
    
    // ЭСКАЛАЦИЯ
    if (aiResponse.confidence < 0.3) {
      const keyboard = {
        inline_keyboard: [[
          { text: '💬 Написать менеджеру', url: `https://t.me/${process.env.MANAGER_USERNAME}` }
        ]]
      };

      await bot.sendMessage(chatId, `Отличный вопрос! 🤔\n\nПередаю менеджеру — он разберётся детально.`, 
        { reply_markup: keyboard });
      
      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        const brief = session.brief;
        const context = session.context.slice(-10).map(m => {
          const role = m.role === 'user' ? '👤' : '🤖';
          return `${role} ${m.content.substring(0, 150)}`;
        }).join('\n\n');
        
        const briefMessage = `🔔 ЭСКАЛАЦИЯ\n\n👤 ${brief.firstName}\n📱 ${brief.phone || 'нет'}\n💬 @${brief.telegramUsername || 'нет'}\n\n🏢 ${brief.companyName || '?'}\n🎯 ${brief.task || '?'}\n\nНаписать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}\n\nДиалог:\n${context}`;
        
        const managerKeyboard = {
          inline_keyboard: [[
            { text: '💬 Ответить', url: msg.from.username ? `https://t.me/${msg.from.username}` : `tg://user?id=${chatId}` }
          ]]
        };
        
        try {
          await bot.sendMessage(managerChatId, briefMessage, { reply_markup: managerKeyboard });
        } catch (err) {
          console.error('Failed to send manager notification:', err);
        }
      }
      
      sessions.set(chatId, session);
      return;
    }
    
    // ОТВЕТ AI
    if (aiResponse.message) {
      await bot.sendMessage(chatId, aiResponse.message, { parse_mode: 'Markdown' });
    }
    
    // КАЛЬКУЛЯТОР
    if (aiResponse.readyForCalculator === true && !session.calculatorShown) {
      session.calculatorShown = true;
      sessions.set(chatId, session);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // ПРОСТО ТЕКСТ — КНОПКА УЖЕ ВНИЗУ!
      await bot.sendMessage(chatId, 'Давайте прикинем бюджет! Жмите кнопку внизу "💰 Посчитать бюджет" — я уже ввёл начальные данные! 🧮👇');
      
      //
