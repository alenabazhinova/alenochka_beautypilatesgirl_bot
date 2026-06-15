// ── Узел: «API error response» (Webhook /ask) ─────────────────────
// Формирует JSON-ответ, когда доступ запрещён или вопрос пустой.

const j = $input.first().json || {};
let message = 'Поле "question" пустое.';
if (j.denied) {
  message = 'Доступ запрещён: неверный или отсутствует ключ (x-api-key / body.key).';
} else if (j.noChat) {
  message = 'Укажите "chatId" беседы. Узнать его: напиши боту /start в нужном чате.';
}

return [{ json: { error: true, message } }];
