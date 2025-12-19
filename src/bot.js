const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Токен бота (из переменной окружения или локально)
const token = process.env.TELEGRAM_BOT_TOKEN || '7970494384:AAGK7b0yPDFocAoG4Mb0zA6kZvCmApBmNYU';

// ID заказчика для пересылки видео (получите его через @userinfobot в Telegram)
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;

// Создаем бота
const bot = new TelegramBot(token, { polling: true });

// Создаем простой HTTP сервер для Render (чтобы Web Service не падал)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Grinch Bot is running! 🎄');
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP сервер запущен на порту ${PORT}`);
});

// Хранилище состояний пользователей (в продакшене использовать БД)
const userStates = {};

// Этапы квеста
const STATES = {
  START: 'start',
  TASK_1: 'task_1', // Несмеяна
  TASK_2: 'task_2', // Оратор
  TASK_3: 'task_3', // Елка
  TASK_4: 'task_4', // Танец
  TASK_5: 'task_5', // Финал (ожидание последнего видео)
  COMPLETED: 'completed'
};

// Сообщения об ошибке (когда пользователь отправляет текст вместо видео)
const ERROR_MESSAGES = [
  'Я не умею читать, я умею смотреть страдания. Пришли ВИДЕО!',
  'Текст не является пруфом. Видео или подарок уничтожается.',
  'Буквы? Фу. Какая гадость. Я не собираюсь читать твои мемуары. Я хочу видеть, как ты позоришься. Видео в студию!',
  'Бла-бла-бла. Столько шума, и ноль визуализации. Мое сердце сейчас уменьшилось еще на два размера от скуки. Видео или бан!',
  'Еще одно текстовое сообщение, и я отправлю твой подарок в /dev/null. Камера на телефоне для кого придумана?',
  'Ты правда думаешь, что я буду это читать? Я украл Рождество ради зрелища, а не ради чтения! Свет, камера, мотор!',
  'Текст — это баг. Видео — это фича. Не заставляй меня писать тикет на твою некомпетентность. Снимай кружочек!',
  'Я не верю ни единому твоему напечатанному слову. Пруфы или не было. Только видео-формат, только хардкор.',
  'Оставь эту писанину для отчетов в Jira. Здесь территория кринжа. Мне нужны движущиеся пиксели!',
  'Мои глаза болят от твоего шрифта. Развлекай меня визуально, смертный, или подарок останется у меня.',
  'Ты пытаешься торговаться текстом с тем, у кого вместо души — кусок заплесневелого кода? Жалкая попытка. ВИДЕО!'
];

// Сообщения о просмотре видео (случайный выбор)
const WATCHING_MESSAGES = [
  '👀 Гринч просматривает твое видео...',
  '🎬 Гринч изучает твои страдания...',
  '📹 Гринч наслаждается твоим унижением...',
  '🔍 Гринч анализирует уровень кринжа...',
  '😈 Гринч смакует твое выполнение...',
  '🎥 Гринч оценивает твои мучения...'
];

// Сообщения об ожидании отчета (случайный выбор)
const WAITING_MESSAGES = [
  '⏳ Гринч ожидает видео/кружок отчет',
  '📹 Давай же, покажи мне свои страдания! Видео/кружок!',
  '🎯 Где доказательства? Видео/кружок - живо!',
  '⚡ Не тяни! Гринч хочет видеть твой отчет!',
  '🎪 Шоу должно продолжаться! Видео/кружок!',
  '💥 Камера! Мотор! Кружочек! Действие!'
];

// Путь к папке с видео
const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

// Функция для получения пути к видео по номеру
function getVideoPath(number) {
  const files = fs.readdirSync(VIDEOS_DIR).filter(f => f.startsWith(`${number}_`));
  if (files.length > 0) {
    return path.join(VIDEOS_DIR, files[0]);
  }
  return null;
}

// Функция для получения случайного сообщения об ошибке
function getRandomErrorMessage() {
  return ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)];
}

// Функция для получения случайного сообщения о просмотре
function getRandomWatchingMessage() {
  return WATCHING_MESSAGES[Math.floor(Math.random() * WATCHING_MESSAGES.length)];
}

// Функция для получения случайного сообщения об ожидании
function getRandomWaitingMessage() {
  return WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)];
}

// Функция для отправки видео
async function sendVideo(chatId, videoNumber, options = {}) {
  const videoPath = getVideoPath(videoNumber);

  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error(`Видео ${videoNumber} не найдено в папке videos/`);
    await bot.sendMessage(chatId, `⚠️ Видео ${videoNumber} не найдено. Пожалуйста, добавьте файл с именем ${videoNumber}_*.mp4 в папку videos/`);
    return false;
  }

  try {
    await bot.sendVideo(chatId, videoPath, options);
    return true;
  } catch (error) {
    console.error(`Ошибка отправки видео ${videoNumber}:`, error);
    return false;
  }
}

// Инициализация состояния пользователя
function initUserState(userId) {
  if (!userStates[userId]) {
    userStates[userId] = { state: STATES.START };
  }
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  initUserState(userId);
  userStates[userId].state = STATES.START;

  // Отправляем приветственное видео с кнопкой
  await sendVideo(chatId, 0, {
    reply_markup: {
      inline_keyboard: [[
        { text: 'Начать поиск багов', callback_data: 'start_quest' }
      ]]
    }
  });
});

// Обработчик нажатия на кнопку "Начать поиск багов"
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data === 'start_quest') {
    initUserState(userId);
    userStates[userId].state = STATES.TASK_1;

    // Отправляем первое задание (Несмеяна)
    await bot.answerCallbackQuery(query.id);
    await sendVideo(chatId, 1);
    // Сразу отправляем напоминание
    await bot.sendMessage(chatId, getRandomWaitingMessage());
  }
});

// Основной обработчик сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Игнорируем команды
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }

  initUserState(userId);
  const currentState = userStates[userId].state;

  // Если пользователь на старте, игнорируем сообщения
  if (currentState === STATES.START) {
    return;
  }

  // Если квест завершен
  if (currentState === STATES.COMPLETED) {
    await bot.sendMessage(chatId, 'Квест уже завершен! Надеюсь, ты нашел свой подарок! 🎁');
    return;
  }

  // Проверяем тип сообщения
  const hasVideo = msg.video || msg.video_note;
  const hasPhoto = msg.photo;

  // Если пользователь отправил фото
  if (hasPhoto) {
    await bot.sendMessage(chatId, '📸 Фотографии не принимаются! Только видео или кружочки!');
    return;
  }

  // Если пользователь отправил видео или кружочек
  if (hasVideo) {
    // Отправляем случайное сообщение о просмотре
    await bot.sendMessage(chatId, getRandomWatchingMessage());

    // Пересылаем видео заказчику (если указан ADMIN_CHAT_ID)
    if (ADMIN_CHAT_ID) {
      try {
        const userName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name || 'Пользователь';
        const userInfo = `👤 От: ${userName} (ID: ${userId})\n🎬 Этап: ${currentState}`;

        // Пересылаем видео
        if (msg.video) {
          await bot.sendVideo(ADMIN_CHAT_ID, msg.video.file_id, { caption: userInfo });
        } else if (msg.video_note) {
          await bot.sendVideoNote(ADMIN_CHAT_ID, msg.video_note.file_id);
          await bot.sendMessage(ADMIN_CHAT_ID, userInfo);
        }
      } catch (error) {
        console.error('Ошибка при пересылке видео админу:', error.message);
      }
    }

    // Переходим к следующему этапу
    switch (currentState) {
      case STATES.TASK_1:
        // После первого задания -> Задание "Оратор"
        userStates[userId].state = STATES.TASK_2;
        await sendVideo(chatId, 2);
        // Напоминание о загрузке видео
        await bot.sendMessage(chatId, getRandomWaitingMessage());
        break;

      case STATES.TASK_2:
        // После второго задания -> Задание "Елка"
        userStates[userId].state = STATES.TASK_3;
        await sendVideo(chatId, 3);
        // Напоминание о загрузке видео
        await bot.sendMessage(chatId, getRandomWaitingMessage());
        break;

      case STATES.TASK_3:
        // После третьего задания -> Задание "Танец"
        userStates[userId].state = STATES.TASK_4;
        await sendVideo(chatId, 4);
        // Напоминание о загрузке видео
        await bot.sendMessage(chatId, getRandomWaitingMessage());
        break;

      case STATES.TASK_4:
        // После четвертого задания -> Отправляем видео 5, затем сообщения, затем видео 6
        userStates[userId].state = STATES.TASK_5;

        // Отправляем видео 5
        await sendVideo(chatId, 5);

        // Отправляем сообщения о смене персонажей
        await bot.sendMessage(chatId, 'Гринч покинул(а) чат');
        await bot.sendMessage(chatId, 'Санта Клаус зашел(а)в чат');

        // Отправляем видео 6
        await sendVideo(chatId, 6);
        break;

      case STATES.TASK_5:
        // После последнего видео -> Квест завершен
        userStates[userId].state = STATES.COMPLETED;
        break;
    }
  } else {
    // Если пользователь отправил что-то другое (текст, документы, стикеры и т.д.)
    await bot.sendMessage(chatId, getRandomErrorMessage());
  }
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error);
});

console.log('🎄 Бот "Гринч украл тайного Санту" запущен!');
console.log('📁 Убедитесь, что в папке videos/ есть следующие файлы:');
console.log('   0_*.mp4 - Приветственное видео');
console.log('   1_*.mp4 - Задание "Несмеяна"');
console.log('   2_*.mp4 - Задание "Оратор"');
console.log('   3_*.mp4 - Задание "Елка"');
console.log('   4_*.mp4 - Задание "Танец"');
console.log('   5_*.mp4 - Финал (последнее задание от Гринча)');
console.log('   6_*.mp4 - Финальное видео с подарком (от Санты)');
