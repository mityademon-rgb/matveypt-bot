// bot.js — MatveyPT Universal Bot (anti-loop + audio реально отправляется + сценарий после контакта)
import dotenv from 'dotenv';
dotenv.config();
console.log('BOOT MARK:', 'MATVEYPT_UNIVERSAL_BOT_V3__2026_02_27');

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { analyzeMessage } from './agent.js';
import { calculatePackages } from './pricing.js';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const app = express();

const sessions = new Map();

// === CONFIG ===
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://matveypt-bot-production.up.railway.app').replace(/\/$/, '');
const AUDIO_EXPLAIN_URL = process.env.AUDIO_EXPLAIN_URL || `${PUBLIC_BASE_URL}/showcase/audio_promo.mp3`;

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

function nowMs() {
  return Date.now();
}

function normText(t = '') {
  return String(t || '').trim();
}

function normLower(t = '') {
  return normText(t).toLowerCase();
}

function isYes(t = '') {
  const s = normLower(t);
  return (
    s === 'да' ||
    s === 'ага' ||
    s === 'угу' ||
    s === 'понял' ||
    s === 'поняла' ||
    s === 'ок' ||
    s === 'okay' ||
    s === 'окей' ||
    s === 'конечно' ||
    s === 'разобрался' ||
    s === 'разобралась' ||
    s === 'понятно' ||
    s === 'всё понял' ||
    s === 'всё поняла'
  );
}

function isNo(t = '') {
  const s = normLower(t);
  return (
    s === 'нет' ||
    s === 'неа' ||
    s === 'не понял' ||
    s === 'не поняла' ||
    s === 'непонятно' ||
    s === 'не ясно' ||
    s === 'сложно' ||
    s === 'поясните' ||
    s === 'объясните'
  );
}

function isAudioIntent(t = '') {
  const s = normLower(t);
  return (
    s.includes('голос') ||
    s.includes('аудио') ||
    s.includes('послуш') ||
    (s.includes('включи') && s.includes('аудио')) ||
    s.includes('где аудио') ||
    s === '🎧 послушаю 2 минуты'
  );
}

function isNeutralOk(t = '') {
  const s = normLower(t);
  return s === 'ок' || s === 'окей' || s === 'хорошо' || s === 'понял' || s === 'понятно' || s === 'давай';
}

function shouldOfferAudioByTriggers(text = '') {
  const t = normLower(text);
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

function ensureSession(chatId, msg) {
  let session = sessions.get(chatId);
  if (session) return session;

  session = {
    stage: 'greeting', // greeting | await_contact | await_understanding | await_explain_choice | awaiting_business | chat
    context: [],
    brief: {
      telegramUsername: msg?.from?.username || null,
      firstName: msg?.from?.first_name || null,
      phone: null,
      email: null,
      companyName: null,
      companyBusiness: null,
      city: null,
      targetAudience: null,
      task: null,
      season: null
    },

    calculatorShown: false,
    contactShared: false,

    // anti-repeat
    lastUserText: null,
    lastUserAt: 0,
    lastUserMsgId: 0,
    lastBotText: null,
    lastBotAt: 0,

    // visuals
    lastVisualKey: null,
    lastVisualAt: 0,

    // loop/stop controls
    turns: 0,
    loopHits: 0,
    lastAIPrefix: null,
    hardStop: false
  };

  sessions.set(chatId, session);
  return session;
}

function deRepeatOpener(message, session) {
  const text = normText(message);
  if (!text) return text;

  const prev = normText(session?.lastBotText || '');
  const prevStart = prev.slice(0, 80).toLowerCase();
  const curStart = text.slice(0, 80).toLowerCase();

  // Не начинаем каждый раз "Смотрите"
  if (curStart.startsWith('смотрите') && prevStart.startsWith('смотрите')) {
    return text.replace(/^Смотрите\s*,?\s*/i, 'Кстати, ');
  }

  // Точный повтор текста
  if (prev && text === prev) {
    return 'Понял. Давайте без повтора: где вы находитесь и на какой сезон хотите усилиться?';
  }

  return text;
}

async function sendVisualIfNeeded(chatId, visualKey, session = null) {
  if (!visualKey) return;
  const url = VISUALS[visualKey];
  if (!url) return;

  if (session) {
    const lastKey = session.lastVisualKey || null;
    const lastAt = session.lastVisualAt || 0;

    // не повторяем один и тот же ключ подряд
    if (lastKey === visualKey) return;

    // не чаще раза в 90 сек
    if (nowMs() - lastAt < 90_000) return;
  }

  try {
    await bot.sendPhoto(chatId, url, {
      caption: 'Визуально 👇',
      disable_notification: true
    });

    if (session) {
      session.lastVisualKey = visualKey;
      session.lastVisualAt = nowMs();
    }
  } catch (err) {
    console.error('❌ Ошибка отправки визуала:', err.message);
  }
}

async function sendAudioExplain(chatId) {
  try {
    await bot.sendAudio(chatId, AUDIO_EXPLAIN_URL, {
      caption:
        '🎧 2 минуты — “как это работает”.\n\nПосле прослушивания напишите: вы — отель/объект/регион/бренд и где вы географически.'
    });
  } catch (e) {
    await bot.sendMessage(chatId, `🎧 Не смог отправить файлом. Вот ссылка: ${AUDIO_EXPLAIN_URL}`);
  }
}

async function askUnderstanding(chatId) {
  const keyboard = {
    keyboard: [[{ text: '✅ Да, понял(а)' }, { text: '❌ Нет, поясните' }], [{ text: '↩️ В меню' }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await bot.sendMessage(chatId, 'Вы разобрались, как мы работаем? (да/нет)', { reply_markup: keyboard });
}

async function askExplainChoice(chatId) {
  const keyboard = {
    keyboard: [
      [{ text: '🎧 Послушаю 2 минуты' }, { text: '📝 В двух словах' }],
      [{ text: '↩️ В меню' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await bot.sendMessage(chatId, 'Ок. Что удобнее: 🎧 послушать 2 минуты или 📝 объясню в двух словах?', {
    reply_markup: keyboard
  });
}

async function explainInTwoWords(chatId) {
  await bot.sendMessage(
    chatId,
    'В двух словах: мы не “перебиваем” человека рекламой. Мы попадаем в момент выбора — маршруты, подборки, истории — и встраиваем партнёра так, что он выглядит естественным решением.'
  );
}

async function askBusinessType(chatId) {
  const keyboard = {
    keyboard: [
      [{ text: '🏨 Отель/курорт' }, { text: '📍 Объект/активность' }],
      [{ text: '🗺️ Регион/город' }, { text: '🏷️ Бренд/сервис' }],
      [{ text: '↩️ В меню' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  };

  await bot.sendMessage(chatId, 'Ок, теперь по делу: вы кто по формату?', { reply_markup: keyboard });
}

// === MAIN KEYBOARD ===
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

app.get('/', (req, res) => res.send('✅ MatveyPT Bot is running!'));

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
  try {
    const data = req.body;
    const chatId = data.chatId || null;
    const managerChatId = process.env.MANAGER_CHAT_ID;

    if (!managerChatId) return res.status(500).json({ success: false, error: 'Manager not configured' });

    // Поддержка двух типов (старый и новый)
    const calcType = String(data.type || '');

    if (calcType === 'partner_calc') {
      const biz = data.businessType || null;
      const city = data.city || null;
      const goal = data.goal || null;
      const season = data.season || null;
      const level = data.level || null;
      const addons = Array.isArray(data.addons) ? data.addons : [];
      const total = Number(data.total || 0);

      let managerMessage = `🔥 ЗАЯВКА ИЗ КАЛЬКУЛЯТОРА (ПАРТНЁРСТВО)\n\n`;

      if (chatId) {
        const session = sessions.get(chatId);
        if (session && session.brief) {
          managerMessage += `👤 ${session.brief.firstName || 'Не указано'}\n`;
          managerMessage += `📱 ${session.brief.phone || session.brief.email || 'НЕТ'}\n`;
          managerMessage += `💬 @${session.brief.telegramUsername || 'нет'}\n`;
        }
        managerMessage += `🆔 Chat ID: ${chatId}\n\n`;
      }

      managerMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
      managerMessage += `💰 ИТОГО: ${total.toLocaleString('ru-RU')} ₽\n`;
      managerMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;
      managerMessage += `🏢 Формат: ${biz || '—'}\n`;
      managerMessage += `📍 География: ${city || '—'}\n`;
      managerMessage += `🎯 Цель: ${goal || '—'}\n`;
      managerMessage += `🗓️ Сезон: ${season || '—'}\n`;
      managerMessage += `⭐️ Уровень: ${level || '—'}\n`;

      if (addons.length) {
        managerMessage += `\n➕ Усиления:\n`;
        addons.forEach(a => (managerMessage += `   ✓ ${a}\n`));
      }

      if (data.comment) {
        managerMessage += `\n📝 Комментарий: ${String(data.comment).substring(0, 500)}\n`;
      }

      managerMessage += `\n⏰ ${new Date().toLocaleString('ru-RU')}\n`;
      managerMessage += `\n🔥 СВЯЗАТЬСЯ СЕЙЧАС — ЛИД ГОРЯЧИЙ`;

      const managerKeyboard = chatId
        ? {
            inline_keyboard: [
              [{ text: '💬 Написать клиенту', url: `tg://user?id=${chatId}` }],
              [
                { text: '✅ Я позвонил', callback_data: `called_${chatId}` },
                { text: '🎉 Сделка закрыта', callback_data: `closed_${chatId}` }
              ]
            ]
          }
        : undefined;

      await bot.sendMessage(managerChatId, managerMessage, { reply_markup: managerKeyboard });

      if (chatId) {
        await bot.sendMessage(chatId, '✅ Принято! Я передал расчёт продюсеру. Он свяжется с вами.', {
          reply_markup: MAIN_KEYBOARD
        });
      }

      return res.json({ success: true });
    }

    // Legacy
    let managerMessage = `🔥 НОВЫЙ РАСЧЁТ ИЗ КАЛЬКУЛЯТОРА!\n\n`;

    if (chatId) {
      const session = sessions.get(chatId);
      if (session && session.brief) {
        managerMessage += `👤 ${session.brief.firstName || 'Не указано'}\n`;
        managerMessage += `📱 ${session.brief.phone || session.brief.email || 'НЕТ'}\n`;
        managerMessage += `💬 @${session.brief.telegramUsername || 'нет'}\n`;
      }
      managerMessage += `🆔 Chat ID: ${chatId}\n\n`;
    }

    managerMessage += `━━━━━━━━━━━━━━━━━━━━\n`;
    managerMessage += `💰 ИТОГО: ${Number(data.total || 0).toLocaleString('ru-RU')} ₽\n`;
    managerMessage += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    await bot.sendMessage(managerChatId, managerMessage);

    if (chatId) {
      await bot.sendMessage(chatId, '✅ Принято! Я передал расчёт продюсеру.', { reply_markup: MAIN_KEYBOARD });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Ошибка /api/budget:', err.message);
    return res.status(500).json({ success: false });
  }
});

// === START COMMANDS ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const session = ensureSession(chatId, msg);

  // сбрасываем сценарий
  session.stage = 'await_contact';
  session.context = [];
  session.contactShared = false;
  session.calculatorShown = false;
  session.turns = 0;
  session.loopHits = 0;
  session.lastAIPrefix = null;
  session.hardStop = false;

  sessions.set(chatId, session);

  await bot.sendMessage(chatId, 'Привет! 👋 Я Матвей — продюсер партнёрств “Первого туристического”.', {
    reply_markup: MAIN_KEYBOARD
  });

  await new Promise(resolve => setTimeout(resolve, 600));

  const contactKeyboard = {
    keyboard: [
      [{ text: '📱 Поделиться контактом', request_contact: true }],
      [{ text: '✍️ Написать вручную' }],
      [{ text: '↩️ В меню' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  await bot.sendMessage(chatId, 'Чтобы не потеряться: оставьте контакт (телефон или email) 👇', {
    reply_markup: contactKeyboard
  });
});

bot.onText(/\/menu/, async (msg) => {
  await bot.sendMessage(msg.chat.id, 'Меню 👇', { reply_markup: MAIN_KEYBOARD });
});

bot.onText(/\/myid/, async (msg) => {
  await bot.sendMessage(msg.chat.id, `Ваш Chat ID: ${msg.chat.id}`, { reply_markup: MAIN_KEYBOARD });
});

// === CONTACT SHARE ===
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;

  const session = ensureSession(chatId, msg);

  session.brief.phone = contact.phone_number;
  session.brief.firstName = contact.first_name;
  session.brief.telegramUsername = msg.from.username || null;
  session.contactShared = true;

  // после контакта — сценарий понимания
  session.stage = 'await_understanding';
  session.turns = 0;
  session.loopHits = 0;
  session.lastAIPrefix = null;
  session.hardStop = false;

  sessions.set(chatId, session);

  await bot.sendMessage(chatId, 'Отлично, записал ✅', { reply_markup: MAIN_KEYBOARD });
  await new Promise(resolve => setTimeout(resolve, 400));
  await askUnderstanding(chatId);

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
      console.error('Failed to notify manager:', err.message);
    }
  }
});

// === CALLBACKS (менеджер) ===
bot.on('callback_query', async (query) => {
  const data = query.data;

  if (data.startsWith('called_')) {
    const clientChatId = Number(data.replace('called_', ''));
    await bot.answerCallbackQuery(query.id, { text: '✅ Отмечено!' });
    try {
      await bot.editMessageText(
        query.message.text + `\n\n✅ МЕНЕДЖЕР ПОЗВОНИЛ\n⏰ ${new Date().toLocaleTimeString('ru-RU')}`,
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
    } catch (err) {
      console.error('Ошибка редактирования:', err.message);
    }
    try {
      await bot.sendMessage(clientChatId, 'Наш продюсер скоро свяжется с вами 😊', { reply_markup: MAIN_KEYBOARD });
    } catch {}
    return;
  }

  if (data.startsWith('closed_')) {
    const clientChatId = Number(data.replace('closed_', ''));
    if (sessions.has(clientChatId)) sessions.delete(clientChatId);
    await bot.answerCallbackQuery(query.id, { text: '🎉 Сделка закрыта!' });
    try {
      await bot.editMessageText(
        query.message.text + `\n\n🎉 СДЕЛКА ЗАКРЫТА!\n⏰ ${new Date().toLocaleTimeString('ru-RU')}`,
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
    } catch (err) {
      console.error('Ошибка редактирования:', err.message);
    }
    return;
  }

  await bot.answerCallbackQuery(query.id);
});

// === WEBAPP DATA HANDLER ===
async function handleWebAppData(msg) {
  const chatId = msg.chat.id;
  ensureSession(chatId, msg);
  try {
    const data = JSON.parse(msg.web_app_data.data || '{}');
    console.log('📦 web_app_data:', data);
    await bot.sendMessage(chatId, '✅ Принял данные из калькулятора.', { reply_markup: MAIN_KEYBOARD });
  } catch (err) {
    console.error('❌ web_app_data parse error:', err.message);
  }
}

// === MAIN MESSAGE HANDLER ===
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg.web_app_data) {
    await handleWebAppData(msg);
    return;
  }

  const textRaw = msg.text;
  if (!textRaw) return;
  if (textRaw.startsWith('/') || msg.contact) return;

  const text = normText(textRaw);
  const session = ensureSession(chatId, msg);

  // anti-duplicate (Telegram/railway иногда присылает дубль)
  const msgId = Number(msg.message_id || 0);
  if (msgId && session.lastUserMsgId === msgId) return;

  if (text && session.lastUserText && normLower(text) === normLower(session.lastUserText)) {
    if (nowMs() - (session.lastUserAt || 0) < 12_000) {
      session.lastUserMsgId = msgId;
      sessions.set(chatId, session);
      return;
    }
  }

  session.lastUserText = text || null;
  session.lastUserAt = nowMs();
  session.lastUserMsgId = msgId;
  sessions.set(chatId, session);

  // Навигация
  if (text === '↩️ В меню') {
    await bot.sendMessage(chatId, 'Меню 👇', { reply_markup: MAIN_KEYBOARD });
    return;
  }

  // === Меню-кнопки ===
  if (text === '📺 О портале PTK') {
    const keyboard = {
      inline_keyboard: [[{ text: 'Открыть', web_app: { url: `${PUBLIC_BASE_URL}/partner.html` } }]]
    };
    await bot.sendMessage(chatId, '📺 Портал PTK — навигатор выбора путешествий 👇', { reply_markup: keyboard });
    return;
  }

  if (text === '🧭 Стать партнёром маршрутов') {
    const keyboard = {
      inline_keyboard: [[{ text: 'Открыть витрину', web_app: { url: `${PUBLIC_BASE_URL}/partner.html` } }]]
    };
    await bot.sendMessage(
      chatId,
      '🧭 Здесь не “размещение”. Здесь — роль в маршрутах, где люди уже выбирают.\n\nОткрываю витрину 👇',
      { reply_markup: keyboard }
    );
    await sendVisualIfNeeded(chatId, 'ecosystem', session);
    return;
  }

  if (text === '🧮 Посчитать роль и бюджет') {
    const keyboard = {
      inline_keyboard: [[{ text: 'Открыть калькулятор', web_app: { url: `${PUBLIC_BASE_URL}/calculator.html` } }]]
    };
    await bot.sendMessage(chatId, '🧮 Давайте прикинем роль и бюджет 👇', { reply_markup: keyboard });
    return;
  }

  if (text === '🎬 Как это работает (2 минуты)') {
    session.stage = 'await_explain_choice';
    sessions.set(chatId, session);
    await bot.sendMessage(
      chatId,
      'Хотите: 🎧 послушать фрагмент (2 минуты) или 📝 объясню в двух словах?',
      { reply_markup: MAIN_KEYBOARD }
    );
    await sendVisualIfNeeded(chatId, 'choice', session);
    await askExplainChoice(chatId);
    return;
  }

  if (text === '📞 Передать контакт продюсеру') {
    session.stage = 'await_contact';
    session.hardStop = true;
    sessions.set(chatId, session);

    const keyboard = {
      keyboard: [
        [{ text: '📱 Поделиться контактом', request_contact: true }],
        [{ text: '✍️ Написать вручную' }],
        [{ text: '↩️ В меню' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };

    await bot.sendMessage(chatId, 'Ок. Чтобы продюсер не потерял вас — оставьте контакт 👇', { reply_markup: keyboard });
    return;
  }

  // === Контакт вручную ===
  if (!session.contactShared && session.stage === 'await_contact') {
    const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,12}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (text === '✍️ Написать вручную') {
      await bot.sendMessage(chatId, 'Напишите телефон или email:', { reply_markup: MAIN_KEYBOARD });
      return;
    }

    if (phoneRegex.test(text.replace(/\s/g, ''))) {
      session.brief.phone = text.replace(/\s/g, '');
      session.contactShared = true;
      session.stage = 'await_understanding';
      session.turns = 0;
      session.loopHits = 0;
      session.lastAIPrefix = null;
      session.hardStop = false;
      sessions.set(chatId, session);

      await bot.sendMessage(chatId, 'Записал ✅', { reply_markup: MAIN_KEYBOARD });
      await new Promise(resolve => setTimeout(resolve, 400));
      await askUnderstanding(chatId);

      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        await bot.sendMessage(
          managerChatId,
          `📞 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nТелефон: ${session.brief.phone}\nTelegram: @${msg.from.username || 'нет'}\nID: ${chatId}`
        );
      }
      return;
    }

    if (emailRegex.test(text)) {
      session.brief.email = text;
      session.contactShared = true;
      session.stage = 'await_understanding';
      session.turns = 0;
      session.loopHits = 0;
      session.lastAIPrefix = null;
      session.hardStop = false;
      sessions.set(chatId, session);

      await bot.sendMessage(chatId, 'Записал ✅', { reply_markup: MAIN_KEYBOARD });
      await new Promise(resolve => setTimeout(resolve, 400));
      await askUnderstanding(chatId);

      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        await bot.sendMessage(
          managerChatId,
          `📧 НОВЫЙ КОНТАКТ\n\nИмя: ${msg.from.first_name}\nEmail: ${session.brief.email}\nTelegram: @${msg.from.username || 'нет'}\nID: ${chatId}`
        );
      }
      return;
    }

    await bot.sendMessage(chatId, 'Чтобы не потеряться: отправьте телефон/email или нажмите “Поделиться контактом”.', {
      reply_markup: MAIN_KEYBOARD
    });
    return;
  }

  // === Сценарий после контакта ===
  if (session.stage === 'await_understanding') {
    if (isYes(text)) {
      session.stage = 'awaiting_business';
      sessions.set(chatId, session);
      await askBusinessType(chatId);
      return;
    }

    if (isNo(text)) {
      session.stage = 'await_explain_choice';
      sessions.set(chatId, session);
      await askExplainChoice(chatId);
      return;
    }

    // Если человек написал "хорошо/ок" — это НЕ повод уходить в AI-болтовню
    if (isNeutralOk(text)) {
      await askUnderstanding(chatId);
      return;
    }

    await askUnderstanding(chatId);
    return;
  }

  if (session.stage === 'await_explain_choice') {
    if (text === '🎧 Послушаю 2 минуты' || isAudioIntent(text)) {
      await sendAudioExplain(chatId);
      session.stage = 'awaiting_business';
      sessions.set(chatId, session);
      await new Promise(resolve => setTimeout(resolve, 300));
      await askBusinessType(chatId);
      return;
    }

    if (text === '📝 В двух словах' || isNo(text)) {
      await explainInTwoWords(chatId);
      session.stage = 'awaiting_business';
      sessions.set(chatId, session);
      await new Promise(resolve => setTimeout(resolve, 300));
      await askBusinessType(chatId);
      return;
    }

    // нейтральное "ок" — снова предложим выбор, не уходим в AI
    if (isNeutralOk(text)) {
      await askExplainChoice(chatId);
      return;
    }

    await askExplainChoice(chatId);
    return;
  }

  if (session.stage === 'awaiting_business') {
    const s = normLower(text);

    if (s.includes('отел') || s.includes('курорт')) session.brief.companyBusiness = 'отель';
    else if (s.includes('объект') || s.includes('актив')) session.brief.companyBusiness = 'объект';
    else if (s.includes('регион') || s.includes('город')) session.brief.companyBusiness = 'регион';
    else if (s.includes('бренд') || s.includes('сервис')) session.brief.companyBusiness = 'бренд/сервис';
    else if (text === '🏨 Отель/курорт') session.brief.companyBusiness = 'отель';
    else if (text === '📍 Объект/активность') session.brief.companyBusiness = 'объект';
    else if (text === '🗺️ Регион/город') session.brief.companyBusiness = 'регион';
    else if (text === '🏷️ Бренд/сервис') session.brief.companyBusiness = 'бренд/сервис';

    session.stage = 'chat';
    session.turns = 0;
    session.loopHits = 0;
    session.lastAIPrefix = null;
    session.hardStop = false;

    sessions.set(chatId, session);
    // не return — дальше AI продолжит с нормальным контекстом
  }

  // === Audio anytime ===
  if (isAudioIntent(text)) {
    await sendAudioExplain(chatId);
    return;
  }

  // === Если человек явно не понимает — не болтаем, даём выбор объяснения ===
  if (shouldOfferAudioByTriggers(text)) {
    session.stage = 'await_explain_choice';
    sessions.set(chatId, session);
    await askExplainChoice(chatId);
    return;
  }

  // === STOP: если уже начали собирать контакт — не болтаем ===
  if (session.hardStop === true && !session.contactShared) {
    await bot.sendMessage(
      chatId,
      'Ок. Чтобы не гонять слова: нажмите “📞 Передать контакт продюсеру” или “🧮 Посчитать роль и бюджет”.',
      { reply_markup: MAIN_KEYBOARD }
    );
    return;
  }

  // === HARD LIMIT: режем бесконечные диалоги ===
  const MAX_TURNS = 6;
  if (session.turns >= MAX_TURNS) {
    session.hardStop = true;
    sessions.set(chatId, session);

    await bot.sendMessage(
      chatId,
      'Ок, картину собрал. Дальше — в цифры или в контакт, иначе мы будем болтать бесконечно.\n\n🧮 “Посчитать роль и бюджет”\n📞 “Передать контакт продюсеру”',
      { reply_markup: MAIN_KEYBOARD }
    );
    return;
  }

  // === AI DIALOGUE ===
  try {
    await bot.sendChatAction(chatId, 'typing');

    const contextToSend = session.context.slice(-12);
    const aiResponse = await analyzeMessage(text, contextToSend);

    session.turns += 1;

    // loop guard: одинаковый префикс подряд = петля
    const prefix = normLower(String(aiResponse.message || '').slice(0, 140));
    const prevPrefix = normLower(String(session.lastAIPrefix || '').slice(0, 140));
    if (prefix && prevPrefix && prefix === prevPrefix) session.loopHits += 1;
    else session.loopHits = 0;
    session.lastAIPrefix = prefix || null;

    if (session.loopHits >= 1) {
      session.hardStop = true;
      sessions.set(chatId, session);
      await bot.sendMessage(
        chatId,
        'Понял. Чтобы не повторяться: давайте лучше зафиксируем всё в расчёте или передам продюсеру.',
        { reply_markup: MAIN_KEYBOARD }
      );
      return;
    }

    session.context.push(
      { role: 'user', content: text },
      { role: 'assistant', content: aiResponse.message || '' }
    );

    // бриф (мягко)
    if (aiResponse.brief && typeof aiResponse.brief === 'object') {
      Object.keys(aiResponse.brief).forEach((k) => {
        const v = aiResponse.brief[k];
        if (v && v !== 'null' && String(v).trim() !== '') session.brief[k] = v;
      });
    }

    if (aiResponse.confidence < 0.3) {
      const managerUsername = process.env.MANAGER_USERNAME;
      const keyboard = managerUsername
        ? { inline_keyboard: [[{ text: '💬 Написать продюсеру', url: `https://t.me/${managerUsername}` }]] }
        : undefined;

      session.hardStop = true;
      sessions.set(chatId, session);

      await bot.sendMessage(
        chatId,
        'Давайте не гадать — передам продюсеру, он быстро уточнит детали и предложит лучший заход.',
        keyboard ? { reply_markup: keyboard } : undefined
      );
      return;
    }

    if (aiResponse.message) {
      const finalText = deRepeatOpener(aiResponse.message, session);
      session.lastBotText = finalText;
      session.lastBotAt = nowMs();
      sessions.set(chatId, session);
      await bot.sendMessage(chatId, finalText, { reply_markup: MAIN_KEYBOARD });
    }

    await sendVisualIfNeeded(chatId, aiResponse.visualKey, session);

    if (aiResponse.readyForCalculator === true && !session.calculatorShown) {
      session.calculatorShown = true;
      sessions.set(chatId, session);
      await new Promise(resolve => setTimeout(resolve, 400));
      await bot.sendMessage(chatId, 'Ок. Чтобы перейти к цифрам — жмите “🧮 Посчитать роль и бюджет”.', {
        reply_markup: MAIN_KEYBOARD
      });
    }

    sessions.set(chatId, session);
  } catch (error) {
    console.error('❌ Ошибка обработки сообщения:', error.message);
    await bot.sendMessage(
      chatId,
      'Поймал технический сбой 😅 Давайте по-простому: оставьте контакт — продюсер быстро всё разложит.',
      { reply_markup: MAIN_KEYBOARD }
    );
  }
});

// === START SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
