// ── Узел: «Format reply» (Telegram) ───────────────────────────────
// Достаёт текст из ответа Anthropic (собирает ВСЕ text-блоки — при веб-поиске
// ответ приходит несколькими блоками) и тащит chatId/intent из Store & Route.
// Для /chat дополнительно сохраняет ОТВЕТ бота в память чата.

const resp = $input.first().json;

// Собираем итоговый текст из всех блоков типа "text" (поддержка веб-поиска)
let text = '';
try {
  const c = resp.content;
  if (Array.isArray(c)) {
    text = c
      .filter((b) => b && b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('')
      .trim();
  }
  if (!text) text = resp.completion || 'Не удалось получить ответ модели.';
} catch (e) {
  text = 'Ошибка разбора ответа модели.';
}

const sr = $('Store & Route').first().json;
const chatId = sr.chatId;

// Только для /chat: кладём ответ бота в память ЭТОГО чата
if (sr.intent === 'chat' && chatId != null && text) {
  const data = $getWorkflowStaticData('global');
  if (!data.chats) data.chats = {};
  const key = String(chatId);
  if (!data.chats[key]) data.chats[key] = [];
  data.chats[key].push({ user: 'Бот', text, date: new Date().toISOString() });
  if (data.chats[key].length > 500) {
    data.chats[key] = data.chats[key].slice(-500);
  }
}

return [{ json: { reply: text, chatId } }];
