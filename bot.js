// bot.js - Главный файл бота (MatveyPT / Showcase Mode)
import dotenv from 'dotenv';
dotenv.config();
console.log("BOOT MARK:", "MATVEYPT_MAIN_OK__2026_02_27__SHOWCASE_MENU");

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { analyzeMessage } from './agent.js';
import { calculatePackages } from './pricing.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();

const sessions = new Map();

// === CONFIG ===
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://matveypt-bot-production.up.railway.app').replace(/\/$/, '');
const AUDIO_EXPLAIN_URL = process.env.AUDIO_EXPLAIN_URL || null;

// SHOWCASE VISUALS MAP (ключ -> URL)
const VISUALS = {
  ecosystem: `${PUBLIC_BASE_URL}/showcase/01_ecosystem_ptk.jpg`,
  structure: `${PUBLIC_BASE_URL}/showcase/02_portal_structure.jpg`,
  journey: `${PUBLIC_BASE_URL}/showcase/03_traveler_journey.jpg`,
  route: `${PUBLIC_BASE_URL}/showcase/04_route_attraction.jpg`,
  choice: `${PUBLIC_BASE_URL}/showcase/05_moment_of_choice.jpg`,
  hotel: `${PUBLIC_BASE_URL}/showcase/06_hotel_broadcast.jpg`,
  levels: `${PUBLIC_BASE_URL}/showcase/07_partnership_levels.jpg`
};

function shouldOfferAudioByTriggers(text = '') {
  const t = (text || '').toLowerCase();
  return (
    t.includes('не понял') ||
    t.includes('не поняла') ||
    t.includes('сложно') ||
    t.includes('не ясно') ||
    t.includes('непонятно') ||
    t.includes('много текста') ||
    t.includes('коротко') ||
    t.includes('голосом') ||
    t.includes('аудио') ||
    t.includes('послушать')
  );
}

async function sendVisualIfNeeded(chatId, visualKey) {
  if (!visualKey) return;
  const url = VISUALS[visualKey];
  if (!url) return;

  try {
    await bot.sendPhoto(chatId, url, {
      caption: 'Смотрите 👇',
      disable_notification: true
    });
  } catch (err) {
    console.error('❌ Ошибка отправки визуала:', err.message);
  }
}

async function offerAudioIfNeeded(chatId) {
  if (!AUDIO_EXPLAIN_URL) {
    await bot.sendMessage(
      chatId,
      'Если удобнее — могу объяснить голосом (короткое аудио на 2–3 минуты). Скажете “голосом” — включу.'
    );
    return;
  }

  const keyboard = {
    inline_keyboard: [[{ text: '▶️ Послушать объяснение', url: AUDIO_EXPLAIN_URL }]]
  };

  await bot.sendMessage(chatId, 'Если удобнее — можно послушать короткое объяснение (2–3 минуты).', {
    reply_markup: keyboard
  });
}

// === NEW MAIN KEYBOARD (без слова “реклама”) ===
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: '🧭 Стать партнёром маршрутов' }, { text: '📺 О портале PTK' }],
    [{ text: '🧮 Посчитать роль и бюджет' }],
    [{ text: '🎬 Как это работает (2 минуты)' }],
    [{ text: '📞 Передать контакт продюсеру' }]
  ],
  resize_keyboard: true,
  persistent: true
};

// === EXPRESS ===
app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ MatveyPT Bot is running!');
});

// Calculator helper endpoint (если используете)
app.post('/api/calculate', (req, res) => {
  const { intent, platforms, duration } = req.body;
  const packages = calculatePackages(intent, {
    duration: duration || '1m',
    platforms: platforms || ['air'],
    hasCreative: intent === 'production' || intent === 'combo'
  });
  res.json(packages);
});

// ENDPOINT: данные из webapp-калькулятора
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
    managerMessage += `💰 ИТОГО: ${Number(data.total || 0).toLocaleString('ru-RU')} ₽\n`;
    managerMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (data.production && data.production.length > 0) {
      managerMessage += `🎬 Производство (${Number(data.productionPrice || 0).toLocaleString('ru-RU')} ₽):\n`;
      data.production.forEach(item => {
        managerMessage += `   ✓ ${item}\n`;
      });
      managerMessage += `\n`;
    }

    if (data.blogger) {
      managerMessage += `👤 Блогер: ${data.blogger}\n`;
      managerMessage += `💵 ${Number(data.bloggerPrice || 0).toLocaleString('ru-RU')} ₽\n\n`;
    }

    if (data.package) {
      managerMessage += `📺 Пакет: ${data.package}\n`;
      managerMessage += `💵 ${Number(data.packagePrice || 0).toLocaleString('ru-RU')} ₽\n\n`;
    }

    managerMessage += `⏰ ${new Date().toLocaleString('ru-RU')}\n\n`;
    managerMessage += `🔥 ЗВОНИТЬ СРОЧНО — КЛИЕНТ ГОРЯЧИЙ!`;

    const managerKeyboard = chatId
      ? {
          inline_keyboard: [
            [
              {
                text: '💬 Написать клиенту',
                url: `tg://user?id=${chatId}`
              }
            ],
            [
              { text: '✅ Я позвонил', callback_data: `called_${chatId}` },
              { text: '🎉 Сделка закрыта', callback_data: `closed_${chatId}` }
            ]
          ]
        }
      : undefined;

    await bot.sendMessage(managerChatId, managerMessage, { reply_markup: managerKeyboard });

    if (chatId) {
      let clientMessage = `✅ Ваш расчёт получен!\n\n💰 ИТОГО: ${Number(data.total || 0).toLocaleString('ru-RU')} ₽\n\n`;

      if (data.production && data.production.length > 0) {
        clientMessage += `🎬 Производство (${Number(data.productionPrice || 0).toLocaleString('ru-RU')} ₽):\n`;
        data.production.forEach(item => {
          clientMessage += `   • ${item}\n`;
        });
        clientMessage += `\n`;
      }

      if (data.blogger) {
        clientMessage += `👤 Блогер: ${data.blogger} (${Number(data.bloggerPrice || 0).toLocaleString('ru-RU')} ₽)\n\n`;
      }

      if (data.package) {
        clientMessage += `📺 Пакет: ${data.package} (${Number(data.packagePrice || 0).toLocaleString('ru-RU')} ₽)\n\n`;
      }

      clientMessage += `Продюсер скоро свяжется с вами.`;

      await bot.sendMessage(chatId, clientMessage, { reply_markup: MAIN_KEYBOARD });
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

// === MANAGER REMINDER ===
async function sendReminderToManager(chatId, brief) {
  const managerChatId = process.env.MANAGER_CHAT_ID;
  if (!managerChatId) return;

  const reminderMessage =
    `⏰ НАПОМИНАНИЕ!\n\n` +
    `Клиент ${brief.firstName || 'без имени'} открыл калькулятор 15 минут назад.\n\n` +
    `📱 Телефон: ${brief.phone || 'НЕТ'}\n` +
    `💬 Telegram: @${brief.telegramUsername || 'нет'}\n\n` +
    `⚠️ КЛИЕНТ МОЖЕТ ОСТЫТЬ — ЗВОНИТЕ!\n\n` +
    `Время: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, reminderMessage);
    console.log(`⏰ Напоминание отправлено (chatId: ${chatId})`);
  } catch (err) {
    console.error('❌ Ошибка напоминания:', err.message);
  }
}

// === WEB_APP_DATA handler (калькулятор внутри Telegram WebApp) ===
async function handleWebAppData(msg) {
  const chatId = msg.chat.id;

  console.log('🎯 WEB_APP_DATA получен!');
  console.log('Raw data:', msg.web_app_data);

  try {
    const data = JSON.parse(msg.web_app_data.data);
    console.log('📊 Данные распарсены:', data);

    const session = sessions.get(chatId);
    const brief =
      session?.brief || {
        firstName: msg.from.first_name,
        telegramUsername: msg.from.username,
        phone: null
      };

    let clientMessage = `✅ Ваш расчёт получен!\n\n💰 ИТОГО: ${Number(data.total || 0).toLocaleString('ru-RU')} ₽\n\n`;

    if (data.production && data.production.length > 0) {
      clientMessage += `🎬 Производство (${Number(data.productionPrice || 0).toLocaleString('ru-RU')} ₽):\n`;
      data.production.forEach(item => {
        clientMessage += `   • ${item}\n`;
      });
      clientMessage += `\n`;
    }

    if (data.blogger) {
      clientMessage += `👤 Блогер: ${data.blogger} (${Number(data.bloggerPrice || 0).toLocaleString('ru-RU')} ₽)\n\n`;
    }

    if (data.package) {
      clientMessage += `📺 Пакет: ${data.package} (${Number(data.packagePrice || 0).toLocaleString('ru-RU')} ₽)\n\n`;
    }

    clientMessage += `Продюсер скоро свяжется с вами.`;

    await bot.sendMessage(chatId, clientMessage, { reply_markup: MAIN_KEYBOARD });

    // notify manager
    const managerChatId = process.env.MANAGER_CHAT_ID;
    if (managerChatId) {
      let managerMessage = `🔥 НОВЫЙ РАСЧЁТ ИЗ КАЛЬКУЛЯТОРА!\n\n`;
      managerMessage += `👤 ${brief.firstName || 'Не указано'}\n`;
      managerMessage += `📱 ${brief.phone || 'НЕТ'}\n`;
      managerMessage += `💬 @${brief.telegramUsername || 'нет'}\n`;
      managerMessage += `🆔 Chat ID: ${chatId}\n\n`;

      managerMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
      managerMessage += `💰 ИТОГО: ${Number(data.total || 0).toLocaleString('ru-RU')} ₽\n`;
      managerMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (data.production && data.production.length > 0) {
        managerMessage += `🎬 Производство (${Number(data.productionPrice || 0).toLocaleString('ru-RU')} ₽):\n`;
        data.production.forEach(item => {
          managerMessage += `   ✓ ${item}\n`;
        });
        managerMessage += `\n`;
      }

      if (data.blogger) {
        managerMessage += `👤 Блогер: ${data.blogger}\n`;
        managerMessage += `💵 ${Number(data.bloggerPrice || 0).toLocaleString('ru-RU')} ₽\n\n`;
      }

      if (data.package) {
        managerMessage += `📺 Пакет: ${data.package}\n`;
        managerMessage += `💵 ${Number(data.packagePrice || 0).toLocaleString('ru-RU')} ₽\n\n`;
      }

      managerMessage += `⏰ ${new Date().toLocaleString('ru-RU')}\n\n`;
      managerMessage += `🔥 ЗВОНИТЬ СРОЧНО — КЛИЕНТ ГОРЯЧИЙ!`;

      const managerKeyboard = {
        inline_keyboard: [
          [
            {
              text: '💬 Написать клиенту',
              url: brief.telegramUsername ? `https://t.me/${brief.telegramUsername}` : `tg://user?id=${chatId}`
            }
          ],
          [
            { text: '✅ Я позвонил', callback_data: `called_${chatId}` },
            { text: '🎉 Сделка закрыта', callback_data: `closed_${chatId}` }
          ]
        ]
      };

      await bot.sendMessage(managerChatId, managerMessage, { reply_markup: managerKeyboard });
    }

    // update session
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
    await bot.sendMessage(chatId, '😅 Ошибка обработки. Попробуйте ещё раз или напишите продюсеру напрямую.', {
      reply_markup: MAIN_KEYBOARD
    });
  }
}

// === COMMANDS ===
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
      goal: null,
      season: null
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false,
    managerNotifiedAt: null
  });

  // Видео-приветствие (если ссылка живёт — оставляем)
  try {
    await bot.sendVideo(chatId, 'https://1tourtv.ru/wp-content/uploads/2025/11/658563002.mp4', {
      caption: `Привет! 👋 Я Матвей — продюсер маршрутов “Первого туристического”.`,
      reply_markup: MAIN_KEYBOARD,
      supports_streaming: true
    });
  } catch (err) {
    console.error('❌ Ошибка отправки видео:', err.message);
    await bot.sendMessage(chatId, `Привет! 👋 Я Матвей — продюсер маршрутов “Первого туристического”.`, {
      reply_markup: MAIN_KEYBOARD
    });
  }

  await new Promise(resolve => setTimeout(resolve, 1200));

  const greeting =
    `Я не про “размещение”. Я про момент, когда человека уже тянет в поездку — и он выбирает.\n\n` +
    `Чтобы не потеряться: как вас зовут? И оставьте контакт 👇`;

  const contactKeyboard = {
    keyboard: [
      [{ text: '📱 Поделиться контактом', request_contact: true }],
      [{ text: '✍️ Написать вручную' }],
      [{ text: '🧭 Стать партнёром маршрутов' }, { text: '📺 О портале PTK' }],
      [{ text: '🧮 Посчитать роль и бюджет' }],
      [{ text: '🎬 Как это работает (2 минуты)' }],
      [{ text: '📞 Передать контакт продюсеру' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  await bot.sendMessage(chatId, greeting, { reply_markup: contactKeyboard });
});

bot.onText(/\/menu/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Меню 👇', { reply_markup: MAIN_KEYBOARD });
});

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(msg.chat.id, `Ваш Chat ID: ${msg.chat.id}`, { reply_markup: MAIN_KEYBOARD });
});

bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  const managerChatId = process.env.MANAGER_CHAT_ID;

  await bot.sendMessage(
    chatId,
    `🧪 Проверяю настройки...\n\nТвой Chat ID: ${chatId}\nMANAGER_CHAT_ID: ${managerChatId || 'НЕ НАСТРОЕН'}\nPUBLIC_BASE_URL: ${PUBLIC_BASE_URL}\nAUDIO_EXPLAIN_URL: ${AUDIO_EXPLAIN_URL || 'не задан'}\n\nОтправляю тестовое уведомление...`,
    { reply_markup: MAIN_KEYBOARD }
  );

  if (!managerChatId) {
    await bot.sendMessage(chatId, '❌ MANAGER_CHAT_ID не настроен', { reply_markup: MAIN_KEYBOARD });
    return;
  }

  const testMessage =
    `🧪 ТЕСТОВОЕ УВЕДОМЛЕНИЕ\n\n` +
    `От: ${msg.from.first_name}\nChat ID: ${chatId}\nTelegram: @${msg.from.username || 'нет'}\n\n` +
    `Если видишь это — работает! ✅\n\n` +
    `Время: ${new Date().toLocaleTimeString('ru-RU')}`;

  try {
    await bot.sendMessage(managerChatId, testMessage);
    await bot.sendMessage(chatId, `✅ Отправлено на ${managerChatId}`, { reply_markup: MAIN_KEYBOARD });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Ошибка: ${err.message}`, { reply_markup: MAIN_KEYBOARD });
  }
});

bot.onText(/\/clients/, async (msg) => {
  const chatId = msg.chat.id;

  if (chatId.toString() !== process.env.MANAGER_CHAT_ID) {
    await bot.sendMessage(chatId, '❌ Команда только для менеджера', { reply_markup: MAIN_KEYBOARD });
    return;
  }

  if (sessions.size === 0) {
    await bot.sendMessage(chatId, '📭 Нет активных сессий');
    return;
  }

  let clientsList = `👥 АКТИВНЫЕ КЛИЕНТЫ: ${sessions.size}\n\n`;

  sessions.forEach((session, clientChatId) => {
    const brief = session.brief;
    clientsList +=
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 ${brief.firstName || 'Без имени'}\n` +
      `📱 ${brief.phone || '❌ нет'}\n` +
      `💬 @${brief.telegramUsername || 'нет'}\n` +
      `🏢 ${brief.companyName || '?'}\n` +
      `🎯 ${brief.task || '?'}\n` +
      `🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}\n\n`;
  });

  await bot.sendMessage(chatId, clientsList);
});

bot.onText(/\/brief/, async (msg) => {
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);

  if (!session) {
    await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start', { reply_markup: MAIN_KEYBOARD });
    return;
  }

  const brief = session.brief;
  const briefText =
    `📋 ВАШ БРИФ:\n\n` +
    `Контакты:\n👤 ${brief.firstName || 'не указано'}\n📱 ${brief.phone || 'не указан'}\n💬 @${brief.telegramUsername || 'нет'}\n\n` +
    `Компания:\n🏢 ${brief.companyName || 'не указано'}\n💼 ${brief.companyBusiness || 'не указано'}\n📍 ${brief.city || 'не указано'}\n\n` +
    `Проект:\n🎯 ${brief.task || 'не определена'}\n🗓️ ${brief.season || 'не определено'}\n🎬 ${brief.format || 'не определен'}\n👥 ${brief.targetAudience || 'не определена'}\n💡 ${brief.creative || 'не обсуждался'}\n📺 ${brief.placement || 'не определено'}\n\n` +
    `Статус:\n🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}\n📞 Менеджер звонил: ${session.managerCalled ? '✅' : '❌'}`;

  await bot.sendMessage(chatId, briefText, { reply_markup: MAIN_KEYBOARD });
});

// === CONTACT SHARE ===
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

  await bot.sendMessage(chatId, `Отлично! Записал ✅`, { reply_markup: MAIN_KEYBOARD });
  await new Promise(resolve => setTimeout(resolve, 800));
  await bot.sendMessage(chatId, `Теперь по-взрослому: вы кто по формату — отель/объект/регион/сервис?`, {
    reply_markup: MAIN_KEYBOARD
  });

  const managerChatId = process.env.MANAGER_CHAT_ID;
  if (managerChatId) {
    const notif =
      `📞 НОВЫЙ КОНТАКТ\n\n` +
      `Имя: ${contact.first_name}\n` +
      `Телефон: ${contact.phone_number}\n` +
      `Telegram: @${msg.from.username || 'нет'}\n` +
      `ID: ${chatId}`;

    try {
      await bot.sendMessage(managerChatId, notif);
    } catch (err) {
      console.error('Failed to notify manager:', err);
    }
  }
});

// === CALLBACKS ===
bot.on('callback_query', async (query) => {
  const data = query.data;

  if (data.startsWith('called_')) {
    const clientChatId = data.replace('called_', '');
    const session = sessions.get(Number(clientChatId));

    if (session) {
      session.managerCalled = true;
      sessions.set(Number(clientChatId), session);
      await bot.answerCallbackQuery(query.id, { text: '✅ Отмечено!' });

      try {
        await bot.editMessageText(query.message.text + '\n\n✅ МЕНЕДЖЕР ПОЗВОНИЛ\n⏰ ' + new Date().toLocaleTimeString('ru-RU'), {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id
        });
      } catch (err) {
        console.error('Ошибка редактирования:', err.message);
      }

      await bot.sendMessage(Number(clientChatId), `Наш продюсер скоро свяжется с вами 😊`, {
        reply_markup: MAIN_KEYBOARD
      });
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Сессия не найдена' });
    }
    return;
  }

  if (data.startsWith('closed_')) {
    const clientChatId = data.replace('closed_', '');
    const session = sessions.get(Number(clientChatId));

    if (session) {
      sessions.delete(Number(clientChatId));
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
    return;
  }
});

// === MAIN MESSAGE HANDLER ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg.web_app_data) {
    await handleWebAppData(msg);
    return;
  }

  const text = msg.text;

  // не трогаем команды и контакт (у них свои обработчики)
  if (text?.startsWith('/') || msg.contact) return;

  // Быстрый режим аудио по триггерам (не ломая диалог)
  if (shouldOfferAudioByTriggers(text)) {
    try {
      await offerAudioIfNeeded(chatId);
    } catch (err) {
      console.error('❌ Ошибка offerAudioIfNeeded:', err.message);
    }
  }

  // === MENU BUTTONS (новая концепция) ===
  if (text === '📺 О портале PTK') {
    const keyboard = {
      inline_keyboard: [[
        {
          text: 'Открыть',
          web_app: { url: `${PUBLIC_BASE_URL}/partner.html` }
        }
      ]]
    };

    await bot.sendMessage(chatId, '📺 Портал PTK — навигатор выбора путешествий 👇', {
      reply_markup: keyboard
    });
    return;
  }

  if (text === '🧭 Стать партнёром маршрутов') {
    const keyboard = {
      inline_keyboard: [[
        {
          text: 'Открыть витрину партнёрства',
          web_app: { url: `${PUBLIC_BASE_URL}/partner.html` } // сделай страницу partner.html в public
        }
      ]]
    };

    await bot.sendMessage(
      chatId,
      '🧭 Здесь не “размещение”. Здесь — роль в маршрутах, где люди уже выбирают.\n\nОткрываем витрину 👇',
      { reply_markup: keyboard }
    );

    // опорная картинка “экосистема”
    await sendVisualIfNeeded(chatId, 'ecosystem');
    return;
  }

  if (text === '🧮 Посчитать роль и бюджет') {
    const keyboard = {
      inline_keyboard: [[
        {
          text: 'Открыть калькулятор',
          web_app: { url: `${PUBLIC_BASE_URL}/calculator.html` }
        }
      ]]
    };

    await bot.sendMessage(chatId, '🧮 Давайте прикинем роль и бюджет без гаданий 👇', {
      reply_markup: keyboard
    });
    return;
  }

  if (text === '🎬 Как это работает (2 минуты)') {
    await bot.sendMessage(
      chatId,
      'Смотрите.\nРеклама — это когда вас прерывают.\nА мы делаем так, что вас выбирают.\n\nПредставьте: человек планирует поездку. Он читает подборку маршрутов — и вы там не как баннер, а как логичная часть путешествия.\nВ этот момент вы уже не «вариант», вы — решение.'
    );

    await sendVisualIfNeeded(chatId, 'choice');
    await offerAudioIfNeeded(chatId);
    return;
  }

  if (text === '📞 Передать контакт продюсеру') {
    const keyboard = {
      keyboard: [
        [{ text: '📱 Поделиться контактом', request_contact: true }],
        [{ text: '✍️ Написать телефон вручную' }],
        [{ text: '↩️ Назад в меню' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    await bot.sendMessage(chatId, 'Ок. Чтобы продюсер не потерял вас — дайте контакт 👇', {
      reply_markup: keyboard
    });
    return;
  }

  if (text === '↩️ Назад в меню') {
    await bot.sendMessage(chatId, 'Меню 👇', { reply_markup: MAIN_KEYBOARD });
    return;
  }

  // === SESSION ===
  const session = sessions.get(chatId) || {
    stage: 'greeting',
    context: [],
    brief: {
      telegramUsername: msg.from.username || null,
      firstName: msg.from.first_name || null,
      phone: null,
      email: null
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false,
    managerNotifiedAt: null
  };

  try {
    // если контакт ещё не получали — ловим телефон/email
    if (!session.contactShared && session.stage === 'greeting') {
      const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (typeof text === 'string' && phoneRegex.test(text.replace(/\s/g, ''))) {
        session.brief.phone = text.replace(/\s/g, '');
        session.contactShared = true;

        await bot.sendMessage(chatId, `Отлично! Записал ✅`, { reply_markup: MAIN_KEYBOARD });
        await new Promise(resolve => setTimeout(resolve, 800));
        await bot.sendMessage(chatId, `Супер. Теперь скажите: вы кто по формату — отель/объект/регион/сервис?`, {
          reply_markup: MAIN_KEYBOARD
        });

        const managerChatId = process.env.MANAGER_CHAT_ID;
        if (managerChatId) {
          await bot.sendMessage(
            managerChatId,
            `📞 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nТелефон: ${session.brief.phone}\nTelegram: @${msg.from.username || 'нет'}`
          );
        }

        sessions.set(chatId, session);
        return;
      }

      if (typeof text === 'string' && emailRegex.test(text)) {
        session.brief.email = text;
        session.contactShared = true;

        await bot.sendMessage(chatId, `Отлично! Записал ✅`, { reply_markup: MAIN_KEYBOARD });
        await new Promise(resolve => setTimeout(resolve, 800));
        await bot.sendMessage(chatId, `Супер. Теперь скажите: вы кто по формату — отель/объект/регион/сервис?`, {
          reply_markup: MAIN_KEYBOARD
        });

        const managerChatId = process.env.MANAGER_CHAT_ID;
        if (managerChatId) {
          await bot.sendMessage(
            managerChatId,
            `📧 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nEmail: ${session.brief.email}\nTelegram: @${msg.from.username || 'нет'}`
          );
        }

        sessions.set(chatId, session);
        return;
      }

      if (text?.toLowerCase() === '✍️ написать вручную' || text === '✍️ Написать телефон вручную') {
        await bot.sendMessage(chatId, 'Напишите телефон или email:', { reply_markup: MAIN_KEYBOARD });
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

    // merge brief
    if (aiResponse.brief) {
      Object.keys(aiResponse.brief).forEach(key => {
        if (aiResponse.brief[key] && aiResponse.brief[key] !== 'null') {
          session.brief[key] = aiResponse.brief[key];
        }
      });
    }

    // offer audio if AI decided so
    if (aiResponse.offerAudio === true) {
      await offerAudioIfNeeded(chatId);
    }

    // escalation
    if (aiResponse.confidence < 0.3) {
      const managerUsername = process.env.MANAGER_USERNAME;
      const keyboard = managerUsername
        ? { inline_keyboard: [[{ text: '💬 Написать продюсеру', url: `https://t.me/${managerUsername}` }]] }
        : undefined;

      await bot.sendMessage(
        chatId,
        `Понял. Давайте не гадать — передам продюсеру, он уточнит детали и предложит лучший заход.`,
        keyboard ? { reply_markup: keyboard } : undefined
      );

      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        const brief = session.brief;
        const context = session.context
          .slice(-10)
          .map(m => {
            const role = m.role === 'user' ? '👤' : '🤖';
            return `${role} ${String(m.content || '').substring(0, 200)}`;
          })
          .join('\n\n');

        const briefMessage =
          `🔔 ЭСКАЛАЦИЯ\n\n` +
          `👤 ${brief.firstName || 'без имени'}\n` +
          `📱 ${brief.phone || 'нет'}\n` +
          `💬 @${brief.telegramUsername || 'нет'}\n\n` +
          `🏢 ${brief.companyName || '?'}\n` +
          `💼 ${brief.companyBusiness || '?'}\n` +
          `📍 ${brief.city || '?'}\n` +
          `🎯 ${brief.task || '?'}\n` +
          `🗓️ ${brief.season || '?'}\n\n` +
          `Диалог:\n${context}`;

        const managerKeyboard = {
          inline_keyboard: [[
            {
              text: '💬 Ответить',
              url: msg.from.username ? `https://t.me/${msg.from.username}` : `tg://user?id=${chatId}`
            }
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

    // main answer
    if (aiResponse.message) {
      await bot.sendMessage(chatId, aiResponse.message, { reply_markup: MAIN_KEYBOARD });
    }

    // visual as continuation (max 1)
    await sendVisualIfNeeded(chatId, aiResponse.visualKey);

    // calculator suggestion
    if (aiResponse.readyForCalculator === true && !session.calculatorShown) {
      session.calculatorShown = true;
      sessions.set(chatId, session);

      await new Promise(resolve => setTimeout(resolve, 900));
      await bot.sendMessage(
        chatId,
        'Ок, давайте прикинем роль и бюджет. Жмите “🧮 Посчитать роль и бюджет” — калькулятор откроется сразу. 👇',
        { reply_markup: MAIN_KEYBOARD }
      );

      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        const brief = session.brief;

        const urgentMessage =
          `🚨 ГОРЯЧИЙ ЛИД!\n\n` +
          `👤 ${brief.firstName || 'Не указано'}\n` +
          `📱 ${brief.phone || 'НЕТ'}\n` +
          `💬 @${brief.telegramUsername || 'нет'}\n\n` +
          `🏢 ${brief.companyName || '?'}\n` +
          `💼 ${brief.companyBusiness || '?'}\n` +
          `📍 ${brief.city || '?'}\n` +
          `🎯 ${brief.task || '?'}\n` +
          `🗓️ ${brief.season || '?'}\n\n` +
          `🔥 ЗВОНИТЬ СРОЧНО!`;

        const urgentKeyboard = {
          inline_keyboard: [
            [
              {
                text: '💬 Написать клиенту',
                url: brief.telegramUsername ? `https://t.me/${brief.telegramUsername}` : `tg://user?id=${chatId}`
              }
            ],
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
    await bot.sendMessage(chatId, 'Произошла ошибка 😅 Попробуйте ещё раз или напишите /start', {
      reply_markup: MAIN_KEYBOARD
    });
  }
});

console.log('🤖 Bot started!');
