// bot.js - Главный файл бота
import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { analyzeMessage } from './agent.js';
import { calculatePackages } from './pricing.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();

const sessions = new Map();

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
// ENDPOINT ДЛЯ ПОЛУЧЕНИЯ ДАННЫХ ИЗ КАЛЬКУЛЯТОРА
app.post('/api/budget', async (req, res) => {
  console.log('💰 POST /api/budget получен!');
  console.log('Body:', req.body);

  try {
    const data = req.body;
    const chatId = data.chatId || null;
    const managerChatId = process.env.MANAGER_CHAT_ID;

    if (!managerChatId) {
      console.error('❌ MANAGER_CHAT_ID не настроен');
      return res.status(500).json({ success: false, error: 'Manager not configured' });
    }

    // ФОРМИРУЕМ СООБЩЕНИЕ МЕНЕДЖЕРУ
    let managerMessage = `🔥 НОВЫЙ РАСЧЁТ ИЗ КАЛЬКУЛЯТОРА!\n\n`;
    
    if (chatId) {
      const session = sessions.get(chatId);
      if (session && session.brief) {
        managerMessage += `👤 ${session.brief.firstName || 'Не указано'}\n`;
        managerMessage += `📱 ${session.brief.phone || 'НЕТ'}\n`;
        managerMessage += `💬 @${session.brief.telegramUsername || 'нет'}\n`;
      }
      managerMessage += `🆔 Chat ID: ${chatId}\n\n`;
    } else {
      managerMessage += `⚠️ Анонимный расчёт (chatId не передан)\n\n`;
    }

    managerMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
    managerMessage += `💰 ИТОГО: ${data.total.toLocaleString('ru-RU')} ₽\n`;
    managerMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (data.production && data.production.length > 0) {
      managerMessage += `🎬 Производство (${data.productionPrice.toLocaleString('ru-RU')} ₽):\n`;
      data.production.forEach(item => {
        managerMessage += `   ✓ ${item}\n`;
      });
      managerMessage += `\n`;
    }

    if (data.blogger) {
      managerMessage += `👤 Блогер: ${data.blogger}\n`;
      managerMessage += `💵 ${data.bloggerPrice.toLocaleString('ru-RU')} ₽\n\n`;
    }

    if (data.package) {
      managerMessage += `📺 Пакет: ${data.package}\n`;
      managerMessage += `💵 ${data.packagePrice.toLocaleString('ru-RU')} ₽\n\n`;
    }

    managerMessage += `⏰ ${new Date().toLocaleString('ru-RU')}\n\n`;
    managerMessage += `🔥 ЗВОНИТЬ СРОЧНО — КЛИЕНТ ГОРЯЧИЙ!`;

    const managerKeyboard = chatId ? {
      inline_keyboard: [
        [{
          text: '💬 Написать клиенту',
          url: `tg://user?id=${chatId}`
        }],
        [
          { text: '✅ Я позвонил', callback_data: `called_${chatId}` },
          { text: '🎉 Сделка закрыта', callback_data: `closed_${chatId}` }
        ]
      ]
    } : undefined;

    // ОТПРАВЛЯЕМ МЕНЕДЖЕРУ
    await bot.sendMessage(managerChatId, managerMessage, {
      reply_markup: managerKeyboard
    });

    console.log(`✅ Уведомление отправлено менеджеру через HTTP POST`);

    // ОТПРАВЛЯЕМ КЛИЕНТУ (если есть chatId)
    if (chatId) {
      let clientMessage = `✅ Ваш расчёт получен!\n\n💰 ИТОГО: ${data.total.toLocaleString('ru-RU')} ₽\n\n`;

      if (data.production && data.production.length > 0) {
        clientMessage += `🎬 Производство (${data.productionPrice.toLocaleString('ru-RU')} ₽):\n`;
        data.production.forEach(item => {
          clientMessage += `   • ${item}\n`;
        });
        clientMessage += `\n`;
      }

      if (data.blogger) {
        clientMessage += `👤 Блогер: ${data.blogger} (${data.bloggerPrice.toLocaleString('ru-RU')} ₽)\n\n`;
      }

      if (data.package) {
        clientMessage += `📺 Пакет: ${data.package} (${data.packagePrice.toLocaleString('ru-RU')} ₽)\n\n`;
      }

      clientMessage += `Наш продюсер скоро свяжется с вами! 😊`;

      await bot.sendMessage(chatId, clientMessage);
      console.log(`✅ Подтверждение отправлено клиенту`);
    }

    res.json({ success: true, message: 'Budget calculation received' });

  } catch (err) {
    console.error('❌ Ошибка обработки POST /api/budget:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});

async function sendReminderToManager(chatId, brief) {
  const managerChatId = process.env.MANAGER_CHAT_ID;
  if (!managerChatId) return;

  const reminderMessage = `⏰ НАПОМИНАНИЕ!\n\nКлиент ${brief.firstName} открыл калькулятор 15 минут назад!\n\n📱 Телефон: ${brief.phone || 'НЕТ'}\n💬 Telegram: @${brief.telegramUsername || 'нет'}\n\n⚠️ КЛИЕНТ МОЖЕТ ОСТЫТЬ — ЗВОНИТЕ СРОЧНО!\n\nНаписать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}\n\nВремя: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, reminderMessage);
    console.log(`⏰ Напоминание отправлено (клиент ${brief.firstName})`);
  } catch (err) {
    console.error('❌ Ошибка отправки напоминания:', err.message);
  }
}

/**
 * ОБРАБОТКА ДАННЫХ ИЗ WEB APP (КАЛЬКУЛЯТОР)
 * СЮДА ПРИЛЕТАЕТ payload из Telegram.WebApp.sendData(...)
 */
async function handleWebAppData(msg) {
  const chatId = msg.chat.id;

  console.log('🎯 WEB_APP_DATA получен!');
  console.log('Raw data:', msg.web_app_data);

  try {
    const data = JSON.parse(msg.web_app_data.data);
    console.log('📊 Данные распарсены:', data);

    const session = sessions.get(chatId);
    const brief = session?.brief || {
      firstName: msg.from.first_name,
      telegramUsername: msg.from.username,
      phone: null
    };

    // Сообщение клиенту
    let clientMessage = `✅ Ваш расчёт получен!\n\n💰 ИТОГО: ${data.total.toLocaleString('ru-RU')} ₽\n\n`;

    if (data.production && data.production.length > 0) {
      clientMessage += `🎬 Производство (${data.productionPrice.toLocaleString('ru-RU')} ₽):\n`;
      data.production.forEach(item => {
        clientMessage += `   • ${item}\n`;
      });
      clientMessage += `\n`;
    }

    if (data.blogger) {
      clientMessage += `👤 Блогер: ${data.blogger} (${data.bloggerPrice.toLocaleString('ru-RU')} ₽)\n\n`;
    }

    if (data.package) {
      clientMessage += `📺 Пакет: ${data.package} (${data.packagePrice.toLocaleString('ru-RU')} ₽)\n\n`;
    }

    clientMessage += `Наш продюсер скоро свяжется с вами для уточнения деталей! 😊`;

    await bot.sendMessage(chatId, clientMessage);

    // Сообщение менеджеру
    const managerChatId = process.env.MANAGER_CHAT_ID;
    if (managerChatId) {
      let managerMessage = `🔥 НОВЫЙ РАСЧЁТ ИЗ КАЛЬКУЛЯТОРА!\n\n`;
      managerMessage += `👤 ${brief.firstName || 'Не указано'}\n`;
      managerMessage += `📱 ${brief.phone || 'НЕТ'}\n`;
      managerMessage += `💬 @${brief.telegramUsername || 'нет'}\n`;
      managerMessage += `🆔 Chat ID: ${chatId}\n\n`;

      managerMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
      managerMessage += `💰 ИТОГО: ${data.total.toLocaleString('ru-RU')} ₽\n`;
      managerMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (data.production && data.production.length > 0) {
        managerMessage += `🎬 Производство (${data.productionPrice.toLocaleString('ru-RU')} ₽):\n`;
        data.production.forEach(item => {
          managerMessage += `   ✓ ${item}\n`;
        });
        managerMessage += `\n`;
      }

      if (data.blogger) {
        managerMessage += `👤 Блогер: ${data.blogger}\n`;
        managerMessage += `💵 ${data.bloggerPrice.toLocaleString('ru-RU')} ₽\n\n`;
      }

      if (data.package) {
        managerMessage += `📺 Пакет размещения: ${data.package}\n`;
        managerMessage += `💵 ${data.packagePrice.toLocaleString('ru-RU')} ₽\n\n`;
      }

      managerMessage += `⏰ ${new Date().toLocaleString('ru-RU')}\n\n`;
      managerMessage += `🔥 ЗВОНИТЬ СРОЧНО — КЛИЕНТ ГОРЯЧИЙ!`;

      const managerKeyboard = {
        inline_keyboard: [
          [{
            text: '💬 Написать клиенту',
            url: brief.telegramUsername
              ? `https://t.me/${brief.telegramUsername}`
              : `tg://user?id=${chatId}`
          }],
          [
            { text: '✅ Я позвонил', callback_data: `called_${chatId}` },
            { text: '🎉 Сделка закрыта', callback_data: `closed_${chatId}` }
          ]
        ]
      };

      await bot.sendMessage(managerChatId, managerMessage, {
        reply_markup: managerKeyboard
      });

      console.log(`✅ Уведомление отправлено менеджеру (${managerChatId})`);
    }

    // Обновляем сессию
    if (session) {
      session.calculatorShown = true;
      session.brief.lastCalculation = {
        total: data.total,
        package: data.package,
        production: data.production,
        blogger: data.blogger,
        timestamp: Date.now()
      };
      sessions.set(chatId, session);
    }

  } catch (err) {
    console.error('❌ Ошибка обработки web_app_data:', err);
    await bot.sendMessage(chatId, '😅 Ошибка обработки. Попробуйте ещё раз или напишите продюсеру напрямую.');
  }
}

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

  const greeting = `Привет! 👋 

Я Матвей — высокоинтеллектуальный виртуальный продюсер Первого Туристического канала.

Помогаю подобрать рекламные решения, креативы и рассчитать бюджет. Общаюсь по-человечески — без воды и сложных слов! 😊

Внизу есть кнопки — можете в любой момент узнать подробности о канале, рекламных возможностях или посчитать бюджет! 📊

Давайте знакомиться! Как вас зовут и чем занимаетесь? 🚀`;

  const mainKeyboard = {
    keyboard: [
      [{ text: '📺 О канале' }, { text: '🎯 Рекламные возможности' }],
      [{ text: '💰 Посчитать бюджет' }],
      [{ text: '📞 Связаться с менеджером' }]
    ],
    resize_keyboard: true,
    persistent: true
  };

  await bot.sendMessage(chatId, greeting, { reply_markup: mainKeyboard });
  await new Promise(resolve => setTimeout(resolve, 2000));

  const contactRequest = `Чтобы я мог отправить вам коммерческое предложение после расчёта, поделитесь контактом 👇`;
  const contactKeyboard = {
    keyboard: [
      [{ text: '📱 Поделиться контактом', request_contact: true }],
      [{ text: '✍️ Написать вручную' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await bot.sendMessage(chatId, contactRequest, { reply_markup: contactKeyboard });
});

bot.onText(/\/menu/, async (msg) => {
  const mainKeyboard = {
    keyboard: [
      [{ text: '📺 О канале' }, { text: '🎯 Рекламные возможности' }],
      [{ text: '💰 Посчитать бюджет' }],
      [{ text: '📞 Связаться с менеджером' }]
    ],
    resize_keyboard: true,
    persistent: true
  };

  await bot.sendMessage(msg.chat.id, 'Меню открыто 👇', { reply_markup: mainKeyboard });
});

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(msg.chat.id, `Ваш Chat ID: ${msg.chat.id}`);
});

bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  const managerChatId = process.env.MANAGER_CHAT_ID;

  await bot.sendMessage(chatId, `🧪 Проверяю настройки...\n\nТвой Chat ID: ${chatId}\nMANAGER_CHAT_ID: ${managerChatId || 'НЕ НАСТРОЕН'}\n\nОтправляю тестовое уведомление...`);

  if (!managerChatId) {
    await bot.sendMessage(chatId, '❌ MANAGER_CHAT_ID не настроен');
    return;
  }

  const testMessage = `🧪 ТЕСТОВОЕ УВЕДОМЛЕНИЕ\n\nОт: ${msg.from.first_name}\nChat ID: ${chatId}\nTelegram: @${msg.from.username || 'нет'}\n\nЕсли видишь это — работает! ✅\n\nВремя: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, testMessage);
    await bot.sendMessage(chatId, `✅ Отправлено на ${managerChatId}`);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Ошибка: ${err.message}`);
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
    clientsList += `━━━━━━━━━━━━━━━━━━━━\n👤 ${brief.firstName || 'Без имени'}\n📱 ${brief.phone || '❌ нет'}\n💬 @${brief.telegramUsername || 'нет'}\n🏢 ${brief.companyName || '?'}\n🎯 ${brief.task || '?'}\n🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}\n\n`;
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
  const briefText = `📋 ВАШ БРИФ:\n\nКонтакты:\n👤 ${brief.firstName || 'не указано'}\n📱 ${brief.phone || 'не указан'}\n💬 @${brief.telegramUsername || 'нет'}\n\nКомпания:\n🏢 ${brief.companyName || 'не указано'}\n💼 ${brief.companyBusiness || 'не указано'}\n📍 ${brief.city || 'не указано'}\n\nПроект:\n🎯 ${brief.task || 'не определена'}\n🎬 ${brief.format || 'не определен'}\n👥 ${brief.targetAudience || 'не определена'}\n💡 ${brief.creative || 'не обсуждался'}\n📺 ${brief.placement || 'не определено'}\n\nСтатус:\n🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}\n📞 Менеджер звонил: ${session.managerCalled ? '✅' : '❌'}`;

  await bot.sendMessage(chatId, briefText);
});

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

  const mainKeyboard = {
    keyboard: [
      [{ text: '📺 О канале' }, { text: '🎯 Рекламные возможности' }],
      [{ text: '💰 Посчитать бюджет' }],
      [{ text: '📞 Связаться с менеджером' }]
    ],
    resize_keyboard: true,
    persistent: true
  };

  await bot.sendMessage(chatId, `Отлично! Записал ✅`, { reply_markup: mainKeyboard });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await bot.sendMessage(chatId, `А теперь главный вопрос: что будем рекламировать? 🎯`);

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
        await bot.editMessageText(query.message.text + '\n\n✅ МЕНЕДЖЕР ПОЗВОНИЛ\n⏰ ' + new Date().toLocaleTimeString('ru-RU'), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id
        });
      } catch (err) {
        console.error('Ошибка редактирования:', err.message);
      }

      await bot.sendMessage(clientChatId, `Наш менеджер скоро свяжется с вами 😊`);
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
  }
  else if (data.startsWith('closed_')) {
    const clientChatId = data.replace('closed_', '');
    const session = sessions.get(clientChatId);

    if (session) {
      sessions.delete(clientChatId);
      await bot.answerCallbackQuery(query.id, { text: '🎉 Сделка закрыта!' });

      try {
        await bot.editMessageText(query.message.text + '\n\n🎉 СДЕЛКА ЗАКРЫТА!\n⏰ ' + new Date().toLocaleTimeString('ru-RU'), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id
        });
      } catch (err) {
        console.error('Ошибка редактирования:', err.message);
      }
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
  }
});

// ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // 1) ЕСЛИ ЭТО ДАННЫЕ ИЗ WEB APP — ОБРАБАТЫВАЕМ И СРАЗУ ВЫХОДИМ
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
          text: '📺 Открыть презентацию',
          url: 'https://docs.google.com/presentation/d/e/2PACX-1vTEA3JfmzSzA6Fx3ZNf5bsNK1YLII7GfMtM_bsUwkTJZB0McdLxkaRjDwi61VdkNT20jTVxUFe7rY_w/pub?start=false&loop=false&delayms=3000'
        }
      ]]
    };
    await bot.sendMessage(chatId, '📺 Презентация о канале — открывайте! 👇', { reply_markup: keyboard });
    return;
  }

  if (text === '🎯 Рекламные возможности') {
    const keyboard = {
      inline_keyboard: [[
        {
          text: '🎯 Открыть презентацию',
          url: 'https://docs.google.com/presentation/d/e/2PACX-1vRyZ_PkaWPEr5zKj_mlns-oSDO8bSbU4oUGgzAFce7DbmD0Xr0fC4DcKwxRFjEZaOSQ7Ulp1bChNVcD/pub?start=false&loop=false&delayms=3000'
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
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false
  };

  try {
    const lowerText = text?.toLowerCase() || '';

    if (!session.contactShared && session.stage === 'greeting') {
      const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (phoneRegex.test(text.replace(/\s/g, ''))) {
        session.brief.phone = text.replace(/\s/g, '');
        session.contactShared = true;

        const mainKeyboard = {
          keyboard: [
            [{ text: '📺 О канале' }, { text: '🎯 Рекламные возможности' }],
            [{ text: '💰 Посчитать бюджет' }],
            [{ text: '📞 Связаться с менеджером' }]
          ],
          resize_keyboard: true,
          persistent: true
        };

        await bot.sendMessage(chatId, `Отлично! Записал ✅`, { reply_markup: mainKeyboard });
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

        const mainKeyboard = {
          keyboard: [
            [{ text: '📺 О канале' }, { text: '🎯 Рекламные возможности' }],
            [{ text: '💰 Посчитать бюджет' }],
            [{ text: '📞 Связаться с менеджером' }]
          ],
          resize_keyboard: true,
          persistent: true
        };

        await bot.sendMessage(chatId, `Отлично! Записал ✅`, { reply_markup: mainKeyboard });
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
        await bot.sendMessage(chatId, 'Напишите телефон или email:');
        return;
      }
    }

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

    if (aiResponse.confidence < 0.3) {
      const keyboard = {
        inline_keyboard: [[
          { text: '💬 Написать менеджеру', url: `https://t.me/${process.env.MANAGER_USERNAME}` }
        ]]
      };

      await bot.sendMessage(chatId, `Отличный вопрос! 🤔\n\nПередаю менеджеру — он разберётся детально.`, { reply_markup: keyboard });

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

    if (aiResponse.message) {
      await bot.sendMessage(chatId, aiResponse.message);
    }

    if (aiResponse.readyForCalculator === true && !session.calculatorShown) {
      session.calculatorShown = true;
      sessions.set(chatId, session);

      await new Promise(resolve => setTimeout(resolve, 1000));
      await bot.sendMessage(chatId, 'Давайте прикинем бюджет! Жмите кнопку внизу "💰 Посчитать бюджет" — я уже ввёл начальные данные! 🧮👇');

      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        const brief = session.brief;
        const urgentMessage = `🚨 ГОРЯЧИЙ ЛИД!\n\n👤 ${brief.firstName || 'Не указано'}\n📱 ${brief.phone || 'НЕТ'}\n💬 @${brief.telegramUsername || 'нет'}\n\n🏢 ${brief.companyName || '?'}\n💼 ${brief.companyBusiness || '?'}\n🎯 ${brief.task || '?'}\n👥 ${brief.targetAudience || '?'}\n\nНаписать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}\n\n🔥 ЗВОНИТЬ СРОЧНО!`;

        const urgentKeyboard = {
          inline_keyboard: [
            [{ text: '💬 Написать клиенту', url: brief.telegramUsername ? `https://t.me/${brief.telegramUsername}` : `tg://user?id=${chatId}` }],
            [
              { text: '✅ Я позвонил', callback_data: `called_${chatId}` },
              { text: '🎉 Сделка закрыта', callback_data: `closed_${chatId}` }
            ]
          ]
        };

        try {
          await bot.sendMessage(managerChatId, urgentMessage, { reply_markup: urgentKeyboard });
          session.managerNotifiedAt = Date.now();
          sessions.set(chatId, session);

          setTimeout(() => {
            const currentSession = sessions.get(chatId);
            if (currentSession && !currentSession.managerCalled) {
              sendReminderToManager(chatId, currentSession.brief);
            }
          }, 15 * 60 * 1000);
        } catch (err) {
          console.error('❌ Ошибка отправки менеджеру:', err.message);
        }
      }
    }

    sessions.set(chatId, session);

  } catch (err) {
    console.error('Ошибка обработки сообщения:', err);
    await bot.sendMessage(chatId, 'Произошла ошибка 😅 Попробуйте ещё раз или напишите /start');
  }
});

console.log('🤖 Bot started!');
