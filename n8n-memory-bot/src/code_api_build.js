// ── Узел: «API build prompt» (Webhook /ask) ───────────────────────
// Принимает { "question": "...", "chatId": "..." } по HTTP, проверяет
// секретный ключ и читает память КОНКРЕТНОГО чата (изоляция по chatId).
// chatId узнаёшь в Telegram командой /start (бот покажет «ID этого чата»).

// 🔒 Секретный ключ доступа к API. Клиент должен прислать его в заголовке
// x-api-key ИЛИ в теле запроса как поле "key". Пустая строка = без проверки.
const API_KEY = 'CHANGE_ME_SECRET';

const root = $input.first().json || {};
const body = root.body || {};
const headers = root.headers || {};
const providedKey = (headers['x-api-key'] || body.key || '').toString();

const data = $getWorkflowStaticData('global');
const chats = data.chats || {};

// Неверный ключ — дальше к модели не пускаем
if (API_KEY && providedKey !== API_KEY) {
  return [
    {
      json: {
        error: true,
        denied: true,
        systemPrompt: '',
        userPrompt: '',
        question: '',
        historyCount: 0,
      },
    },
  ];
}

// Нужен chatId — иначе непонятно, память какой беседы отдавать (изоляция)
const chatKey = body.chatId != null ? String(body.chatId) : '';
if (!chatKey) {
  return [
    {
      json: {
        error: true,
        denied: false,
        noChat: true,
        systemPrompt: '',
        userPrompt: '',
        question: '',
        historyCount: 0,
      },
    },
  ];
}

const history = chats[chatKey] || [];
const historyText = history
  .map((h) => `[${h.date.slice(0, 16).replace('T', ' ')}] ${h.user}: ${h.text}`)
  .join('\n');

const question = (body.question || '').toString().trim();
if (!question) {
  return [
    {
      json: {
        error: true,
        denied: false,
        systemPrompt: '',
        userPrompt: '',
        question: '',
        historyCount: history.length,
      },
    },
  ];
}

const systemPrompt =
  'Ты — ассистент с памятью о переписке. Отвечай на основе истории. Если ответа в истории нет — честно скажи об этом. Русский язык, кратко и по делу.';
const userPrompt = `История переписки:\n\n${historyText || '(история пуста)'}\n\nВопрос: ${question}`;

return [
  {
    json: {
      error: false,
      denied: false,
      systemPrompt,
      userPrompt,
      question,
      historyCount: history.length,
    },
  },
];
