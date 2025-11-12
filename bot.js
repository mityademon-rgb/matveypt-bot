// bot.js - Главный файл бота
import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import { analyzeMessage } from './agent.js';
import { calculatePackages } from './pricing.js';
import { random, greetings } from './texts.js';

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
      task: null,
      executor: null,
      goal: null,
      creative: null,
      targetAudience: null
    },
    calculatorShown: false,
    contactShared: false,
    managerCalled: false,
    managerNotifiedAt: null
  });
  
  const greeting = random(greetings);
  await bot.sendMessage(chatId, greeting);
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const contactRequest = `Чтобы я мог передать вам презентацию и коммерческое предложение, поделитесь контактом 👇

Или напишите удобный способ связи (телефон/email):`;

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
  const menuKeyboard = {
    keyboard: [
      [{ text: '📋 Мой бриф' }, { text: '🧮 Калькулятор' }],
      [{ text: '💬 Связаться с менеджером' }],
      [{ text: '❓ Помощь' }, { text: '🔄 Начать заново' }]
    ],
    resize_keyboard: true,
    persistent: true
  };
  
  await bot.sendMessage(msg.chat.id, 'Меню открыто 👇', {
    reply_markup: menuKeyboard
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

Проект:
🎯 ${brief.task || 'не определена'}
🚀 ${brief.goal || 'не определена'}
💡 ${brief.creative || 'не обсуждался'}
👥 ${brief.targetAudience || 'не определена'}

Статус:
🧮 Калькулятор: ${session.calculatorShown ? '✅' : '❌'}
📞 Менеджер звонил: ${session.managerCalled ? '✅' : '❌'}`;

  await bot.sendMessage(chatId, briefText);
});

bot.onText(/\/calculator/, async (msg) => {
  await bot.sendMessage(msg.chat.id, `📊 ${process.env.WEB_APP_URL || 'http://localhost:3000'}/calculator.html`);
});

// === ОБРАБОТКА КОНТАКТОВ ===
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  
  const session = sessions.get(chatId);
  if (!session) return;
  
  session.brief.phone = contact.phone_number;
  session.brief.firstName = contact.first_name;
  session.contactShared = true;
  sessions.set(chatId, session);
  
  await bot.sendMessage(chatId, `Отлично! Записал: ${contact.phone_number} ✅`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  const keyboard = {
    inline_keyboard: [[
      { 
        text: '🎯 Выбрать задачу',
        web_app: { 
          url: `${process.env.WEB_APP_URL || 'http://localhost:3000'}/menu.html`
        }
      }
    ]]
  };

  await bot.sendMessage(chatId, 'Откройте меню и выберите что вам нужно 👇', {
    reply_markup: keyboard
  });
  
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
    
    // СОХРАНЯЕМ ВЫБОР В БРИФ
    session.brief.task = data.intent;
    sessions.set(chatId, session);
    
    // ПОДТВЕРЖДАЕМ ВЫБОР
    const confirmMessage = `✅ Выбрано: ${data.title}\n\nОтлично! Теперь расскажите подробнее о вашем проекте:`;
    await bot.sendMessage(chatId, confirmMessage);
    
    // УВЕДОМЛЯЕМ МЕНЕДЖЕРА
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
  
  // ОБРАБОТКА КНОПОК МЕНЮ
  if (text === '📋 Мой бриф') {
    const session = sessions.get(chatId);
    if (!session) {
      await bot.sendMessage(chatId, '❌ Сессия не найдена. Напишите /start');
      return;
    }
    
    const brief = session.brief;
    const briefText = `📋 ВАШ БРИФ:\n\n👤 ${brief.firstName || 'не указано'}\n📱 ${brief.phone || 'не указан'}\n🎯 ${brief.task || 'не определена'}\n🚀 ${brief.goal || 'не определена'}`;
    await bot.sendMessage(chatId, briefText);
    return;
  }
  
  if (text === '🧮 Калькулятор') {
    await bot.sendMessage(chatId, `📊 ${process.env.WEB_APP_URL || 'http://localhost:3000'}/calculator.html`);
    return;
  }
  
  if (text === '💬 Связаться с менеджером') {
    const keyboard = {
      inline_keyboard: [[
        { text: '💬 Написать', url: `https://t.me/${process.env.MANAGER_USERNAME}` }
      ]]
    };
    await bot.sendMessage(chatId, 'Свяжитесь с менеджером:', { reply_markup: keyboard });
    return;
  }
  
  if (text === '❓ Помощь') {
    const help = `📚 Команды:\n\n/start — Начать\n/brief — Ваш бриф\n/calculator — Калькулятор\n/menu — Меню\n/app — Mini App\n\nИспользуйте кнопки внизу! 😊`;
    await bot.sendMessage(chatId, help);
    return;
  }
  
  if (text === '🔄 Начать заново') {
    sessions.delete(chatId);
    await bot.sendMessage(chatId, 'Сброшено! Напишите /start');
    return;
  }
  
  const session = sessions.get(chatId) || {
    stage: 'greeting',
    context: [],
    brief: {},
    calculatorShown: false,
    contactShared: false,
    managerCalled: false
  };
  
  try {
    const lowerText = text.toLowerCase();
    
    // СБОР КОНТАКТОВ
    if (!session.contactShared && session.stage === 'greeting') {
      const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (phoneRegex.test(text.replace(/\s/g, ''))) {
        session.brief.phone = text.replace(/\s/g, '');
        session.contactShared = true;
        
        await bot.sendMessage(chatId, `Отлично! Записал: ${session.brief.phone} ✅`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        const keyboard = {
          inline_keyboard: [[
            { 
              text: '🎯 Выбрать задачу',
              web_app: { 
                url: `${process.env.WEB_APP_URL || 'http://localhost:3000'}/menu.html`
              }
            }
          ]]
        };

        await bot.sendMessage(chatId, 'Откройте меню и выберите что вам нужно 👇', {
          reply_markup: keyboard
        });
        
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
        
        await bot.sendMessage(chatId, `Отлично! Записал: ${session.brief.email} ✅`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        const keyboard = {
          inline_keyboard: [[
            { 
              text: '🎯 Выбрать задачу',
              web_app: { 
                url: `${process.env.WEB_APP_URL || 'http://localhost:3000'}/menu.html`
              }
            }
          ]]
        };

        await bot.sendMessage(chatId, 'Откройте меню и выберите что вам нужно 👇', {
          reply_markup: keyboard
        });
        
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
    
    // AI
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
        
        const briefMessage = `🔔 ЭСКАЛАЦИЯ\n\n👤 ${brief.firstName}\n📱 ${brief.phone || 'нет'}\n💬 @${brief.telegramUsername || 'нет'}\n\n🎯 ${brief.task || '?'}\n🚀 ${brief.goal || '?'}\n\nНаписать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}\n\nДиалог:\n${context}`;
        
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
    console.log('🔍 Проверка калькулятора:', {
      readyForCalculator: aiResponse.readyForCalculator,
      calculatorShown: session.calculatorShown
    });

    if (aiResponse.readyForCalculator === true && !session.calculatorShown) {
      session.calculatorShown = true;
      sessions.set(chatId, session);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalMessage = `Открывайте калькулятор 👇\n\n📊 ${process.env.WEB_APP_URL || 'http://localhost:3000'}/calculator.html\n\nВыберете формат, платформы и пакет!`;

      await bot.sendMessage(chatId, finalMessage);
      console.log('✅ Ссылка на калькулятор отправлена');
      
      // УВЕДОМЛЕНИЕ МЕНЕДЖЕРУ
      const managerChatId = process.env.MANAGER_CHAT_ID;
      if (managerChatId) {
        const brief = session.brief;
        const context = session.context.slice(-6).map(m => {
          const role = m.role === 'user' ? '👤' : '🤖';
          return `${role} ${m.content.substring(0, 120)}`;
        }).join('\n\n');
        
        const urgentMessage = `🚨 ГОРЯЧИЙ ЛИД! 🚨
⏰ СРОЧНО! Клиент открыл калькулятор!

━━━━━━━━━━━━━━━━━━━━
📞 КОНТАКТЫ:
━━━━━━━━━━━━━━━━━━━━

👤 ${brief.firstName || 'Не указано'}
📱 ${brief.phone || 'НЕТ'}
💬 @${brief.telegramUsername || 'нет'}
🆔 ${chatId}

Написать:
https://t.me/${brief.telegramUsername || `user?id=${chatId}`}

━━━━━━━━━━━━━━━━━━━━
🎯 БРИФ:
━━━━━━━━━━━━━━━━━━━━

Задача: ${brief.task || '?'}
Цель: ${brief.goal || '?'}
Креатив: ${brief.creative || 'не обсуждался'}
ЦА: ${brief.targetAudience || 'не выяснена'}

━━━━━━━━━━━━━━━━━━━━
💬 ДИАЛОГ:
━━━━━━━━━━━━━━━━━━━━

${context}

━━━━━━━━━━━━━━━━━━━━
⚡ ДЕЙСТВИЯ:
━━━━━━━━━━━━━━━━━━━━

1. ПОЗВОНИТЬ: ${brief.phone || '+74993940060'}
2. Написать (ссылка выше)
3. Обсудить пакет
4. Закрыть на оплату

🔥 НЕ УПУСТИТЬ!

⏰ ${new Date().toLocaleTimeString('ru-RU')}`;

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
          console.log(`🚨 Критическое уведомление отправлено (клиент ${brief.firstName})`);
          
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
          
          try {
            const simpleMessage = `🚨 ГОРЯЧИЙ ЛИД!\n\nКлиент: ${brief.firstName}\nТелефон: ${brief.phone || 'нет'}\nTelegram: @${brief.telegramUsername || 'нет'}\n\nЗадача: ${brief.task || '?'}\nЦель: ${brief.goal || '?'}\n\nНаписать: https://t.me/${brief.telegramUsername || `user?id=${chatId}`}\n\nЗВОНИТЬ СРОЧНО!`;
            await bot.sendMessage(managerChatId, simpleMessage);
            console.log('✅ Упрощённое уведомление отправлено');
          } catch (err2) {
            console.error('❌ Даже упрощённое не отправилось:', err2.message);
          }
        
