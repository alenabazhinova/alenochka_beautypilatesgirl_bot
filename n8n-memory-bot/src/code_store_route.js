// ── Узел: «Store & Route» (Telegram) ──────────────────────────────
// Сохраняет каждое сообщение в долгую память воркфлоу и определяет,
// что хочет пользователь.
//   • Команды: /summary, /ask, /q (ответ ПО ИСТОРИИ), /chat (свободный вопрос
//     ВНЕ контекста — ответ + сохраняем вопрос в память), /help.
//   • Группы: то же + обращение через @упоминание бота или reply на его
//     сообщение — тогда AI сам понимает по тексту, что нужно (выжимка/вопрос/мнение).
//
// 🔐 ИЗОЛЯЦИЯ: память разделена по chatId. У каждого чата (личка, группа A,
// группа B …) своя отдельная история — они НЕ видят друг друга.

// ─────────────────────────────────────────────────────────────────
// ⚙️ НАСТРОЙКИ
// Имя бота БЕЗ "@" (то, что после @ в его адресе). Нужно для распознавания
// обращения в группах. Узнать: открой бота → его @username.
const BOT_USERNAME = 'ВАШ_БОТ_БЕЗ_СОБАКИ';

// 🔒 ДОСТУП. Telegram ID тех, кому можно. /start покажет твой ID.
// Пустой массив [] = доступ открыт всем.
const ALLOWED_USERS = [
  // 123456789,
];
// ─────────────────────────────────────────────────────────────────

const incoming = $input.first().json;
const msg = incoming.message || incoming;
const text = (msg.text || '').trim();
const chatId = msg.chat && msg.chat.id;
const chatType = (msg.chat && msg.chat.type) || 'private';
const userId = msg.from && msg.from.id;
const userName =
  (msg.from && (msg.from.first_name || msg.from.username)) || 'Unknown';
const date = new Date((msg.date || Date.now() / 1000) * 1000).toISOString();

// Отдельное хранилище истории для КАЖДОГО чата (изоляция)
const data = $getWorkflowStaticData('global');
if (!data.chats) data.chats = {};
const chatKey = String(chatId);
if (!data.chats[chatKey]) data.chats[chatKey] = [];

const isCommand = text.startsWith('/');
const allowed = ALLOWED_USERS.length === 0 || ALLOWED_USERS.includes(userId);

// Чужой пользователь: на команды/обращения — отказ, обычные сообщения тихо игнор.
if (!allowed) {
  if (isCommand) {
    return [
      {
        json: {
          intent: 'denied',
          chatId,
          reply:
            '⛔ Это приватный бот.\nТвой Telegram ID: ' +
            userId +
            '\nПередай его владельцу, чтобы получить доступ.',
          needsLLM: false,
          hasReply: true,
          historyCount: data.chats[chatKey].length,
        },
      },
    ];
  }
  return [{ json: { intent: 'ignored', chatId, needsLLM: false, hasReply: false } }];
}

// ── Распознаём обращение в группе (@бот или reply на сообщение бота) ──
const isGroup = chatType === 'group' || chatType === 'supergroup';
const lower = text.toLowerCase();
const botTag = '@' + (BOT_USERNAME || '').toLowerCase();
const isMentioned = !!BOT_USERNAME && lower.includes(botTag);
const replyFrom = msg.reply_to_message && msg.reply_to_message.from;
const isReplyToBot = !!(
  replyFrom &&
  BOT_USERNAME &&
  replyFrom.username &&
  replyFrom.username.toLowerCase() === BOT_USERNAME.toLowerCase()
);
const addressed = isGroup && (isMentioned || isReplyToBot);

let intent = 'store';
let question = '';

if (lower === '/start' || lower === '/help') {
  intent = 'help';
} else if (lower.startsWith('/summary')) {
  intent = 'summary';
} else if (lower.startsWith('/ask')) {
  intent = 'ask';
  question = text.replace(/^\/ask(@\w+)?/i, '').trim();
} else if (lower.startsWith('/q')) {
  intent = 'ask';
  question = text.replace(/^\/q(@\w+)?/i, '').trim();
} else if (lower.startsWith('/chat')) {
  intent = 'chat';
  question = text.replace(/^\/chat(@\w+)?/i, '').trim();
} else if (addressed) {
  // Обращение без слэша: убираем упоминание и отдаём текст на «умную» обработку
  const cleanText = BOT_USERNAME
    ? text.replace(new RegExp('@' + BOT_USERNAME, 'ig'), '').trim()
    : text;
  if (cleanText) {
    intent = 'smart';
    question = cleanText;
  }
}

// /ask или /chat без текста — покажем помощь
if ((intent === 'ask' || intent === 'chat') && !question) intent = 'help';

// Кладём в память ЭТОГО чата: обычное сообщение (text) ИЛИ вопрос из /chat (question)
const toStore = intent === 'store' ? text : intent === 'chat' ? question : '';
if (toStore) {
  data.chats[chatKey].push({ user: userName, text: toStore, date });
  if (data.chats[chatKey].length > 500) {
    data.chats[chatKey] = data.chats[chatKey].slice(-500);
  }
}

// История ТОЛЬКО этого чата в виде текста для модели
const history = data.chats[chatKey];
const historyText = history
  .map((h) => `[${h.date.slice(0, 16).replace('T', ' ')}] ${h.user}: ${h.text}`)
  .join('\n');

let systemPrompt = '';
let userPrompt = '';
let reply = '';

if (intent === 'summary') {
  systemPrompt =
    'Ты — ассистент, который делает краткую структурированную выжимку из переписки в Telegram-чате. Отвечай на русском. Выдели блоки: 📌 Основные темы, ✅ Принятые решения, ❓ Открытые вопросы/задачи, 💬 Ключевые мнения участников.';
  userPrompt = `Вот история переписки:\n\n${historyText || '(история пуста)'}\n\nСделай краткую выжимку.`;
} else if (intent === 'ask') {
  systemPrompt =
    'Ты — ассистент с памятью о переписке в Telegram-чате. Отвечай ТОЛЬКО на основе предоставленной истории. Если в истории нет ответа — честно скажи, что в беседе это не обсуждалось. Отвечай на русском, кратко и по делу. Если спрашивают твоё мнение — дай его, опираясь на контекст беседы.';
  userPrompt = `История переписки:\n\n${historyText || '(история пуста)'}\n\nВопрос: ${question}`;
} else if (intent === 'smart') {
  systemPrompt =
    'Ты — ассистент с памятью о переписке в Telegram-чате. Пользователь обратился к тебе. Пойми по его сообщению, что нужно: если он просит выжимку/итоги/саммари беседы — сделай краткую структурированную выжимку (темы, решения, открытые вопросы, мнения). Иначе ответь на его вопрос или просьбу, опираясь ТОЛЬКО на историю беседы; если в истории нет ответа — честно скажи. Если просит мнение — дай его на основе контекста. Отвечай на русском, по делу.';
  userPrompt = `История переписки:\n\n${historyText || '(история пуста)'}\n\nОбращение пользователя: ${question}`;
} else if (intent === 'chat') {
  systemPrompt =
    'Ты — дружелюбный AI-ассистент. Отвечай на вопрос пользователя СВОБОДНО, как обычный AI, на любую тему — НЕ ограничивайся историей чата. Недавняя переписка дана ниже лишь как доп. контекст: используй её, только если это уместно. Отвечай на русском, по делу.';
  userPrompt = `Доп. контекст (недавняя переписка):\n\n${historyText || '(пусто)'}\n\nВопрос пользователя: ${question}`;
} else if (intent === 'help') {
  reply =
    '👋 Привет! Я приватный бот с памятью беседы.\n\n' +
    'Твой Telegram ID: ' + userId + '\n' +
    'ID этого чата: ' + chatId + '\n\n' +
    'Команды:\n' +
    '• /summary — выжимка этой беседы\n' +
    '• /ask <вопрос> — ответ ПО ИСТОРИИ беседы\n' +
    '• /q <вопрос> — то же, короче\n' +
    '• /chat <вопрос> — свободный вопрос ВНЕ контекста (ответ сохраняется в память)\n\n' +
    'В группе можно и без команд — упомяни меня (@' +
    (BOT_USERNAME || 'бот') +
    ') или ответь (reply) на моё сообщение.\n\n' +
    '🔐 У каждого чата своя отдельная память — беседы не пересекаются.\n' +
    `Сейчас в памяти этого чата: ${history.length} сообщений.`;
}

const needsLLM =
  intent === 'summary' || intent === 'ask' || intent === 'smart' || intent === 'chat';
const hasReply = reply !== '';

return [
  {
    json: {
      intent,
      chatId,
      question,
      reply,
      systemPrompt,
      userPrompt,
      needsLLM,
      hasReply,
      historyCount: history.length,
    },
  },
];
