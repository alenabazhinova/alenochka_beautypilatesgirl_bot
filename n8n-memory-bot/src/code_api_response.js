// ── Узел: «API response» (Webhook /ask) ───────────────────────────
// Формирует JSON-ответ для внешнего клиента (сайт, другое приложение).

const resp = $input.first().json;

// Собираем текст из всех блоков "text" (поддержка веб-поиска)
let text = '';
const c = resp.content;
if (Array.isArray(c)) {
  text = c
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('')
    .trim();
}
if (!text) text = 'Нет ответа';

const meta = $('API build prompt').first().json;

return [
  {
    json: {
      answer: text,
      question: meta.question,
      historyCount: meta.historyCount,
    },
  },
];
