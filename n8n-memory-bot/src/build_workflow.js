// Собирает workflow.json для n8n из исходных файлов кода нод.
// Запуск:  node src/build_workflow.js
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const storeRoute = read('code_store_route.js');
const formatReply = read('code_format_reply.js');
const apiBuild = read('code_api_build.js');
const apiResponse = read('code_api_response.js');
const apiError = read('code_api_error.js');

// Тело запроса к Anthropic Messages API (одинаковое для обеих веток)
// Тело запроса к Anthropic. tools = веб-поиск (Claude сам решает, когда искать).
const anthropicBody =
  "={{ JSON.stringify({ model: $vars && $vars.CLAUDE_MODEL ? $vars.CLAUDE_MODEL : 'claude-sonnet-4-6', max_tokens: 1500, system: $json.systemPrompt, messages: [ { role: 'user', content: $json.userPrompt } ], tools: [ { type: 'web_search_20250305', name: 'web_search', max_uses: 3 } ] }) }}";

const httpHeaders = {
  parameters: [
    { name: 'x-api-key', value: 'YOUR_ANTHROPIC_API_KEY' },
    { name: 'anthropic-version', value: '2023-06-01' },
    { name: 'content-type', value: 'application/json' },
  ],
};

function codeNode(name, code, pos) {
  return {
    parameters: { jsCode: code },
    id: name.replace(/\s+/g, '-').toLowerCase(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: pos,
  };
}

function ifBool(name, expr, pos) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          {
            id: name + '-c1',
            leftValue: expr,
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id: name.replace(/\s+/g, '-').toLowerCase(),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position: pos,
  };
}

function httpAnthropic(name, pos) {
  return {
    parameters: {
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      sendHeaders: true,
      headerParameters: httpHeaders,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: anthropicBody,
      options: {},
    },
    id: name.replace(/[\s()]+/g, '-').toLowerCase(),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: pos,
  };
}

const nodes = [
  // ── Ветка Telegram ──
  {
    parameters: { updates: ['message'], additionalFields: {} },
    id: 'telegram-trigger',
    name: 'Telegram Trigger',
    type: 'n8n-nodes-base.telegramTrigger',
    typeVersion: 1.2,
    position: [-880, -40],
    credentials: { telegramApi: { id: 'REPLACE_ME', name: 'Telegram account' } },
  },
  codeNode('Store & Route', storeRoute, [-660, -40]),
  ifBool('Нужен AI?', '={{ $json.needsLLM }}', [-420, -40]),
  httpAnthropic('Claude (Telegram)', [-180, -140]),
  codeNode('Format reply', formatReply, [60, -140]),
  ifBool('Есть ответ?', '={{ $json.hasReply }}', [-180, 80]),
  {
    parameters: {
      chatId: '={{ $json.chatId }}',
      text: '={{ $json.reply }}',
      additionalFields: {},
    },
    id: 'send-telegram',
    name: 'Send Telegram',
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: [320, -40],
    credentials: { telegramApi: { id: 'REPLACE_ME', name: 'Telegram account' } },
  },

  // ── Ветка API (Webhook) ──
  {
    parameters: {
      httpMethod: 'POST',
      path: 'ask',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' },
    },
    id: 'webhook-ask',
    name: 'Webhook /ask',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [-880, 360],
    webhookId: 'memory-bot-ask',
  },
  codeNode('API build prompt', apiBuild, [-640, 360]),
  ifBool('API: доступ?', '={{ $json.error }}', [-440, 360]),
  codeNode('API error response', apiError, [-220, 520]),
  httpAnthropic('Claude (API)', [-220, 280]),
  codeNode('API response', apiResponse, [20, 280]),
  {
    parameters: {
      respondWith: 'json',
      responseBody: '={{ JSON.stringify($json) }}',
      options: {},
    },
    id: 'respond',
    name: 'Respond',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [260, 360],
  },
];

const connections = {
  'Telegram Trigger': { main: [[{ node: 'Store & Route', type: 'main', index: 0 }]] },
  'Store & Route': { main: [[{ node: 'Нужен AI?', type: 'main', index: 0 }]] },
  'Нужен AI?': {
    main: [
      [{ node: 'Claude (Telegram)', type: 'main', index: 0 }],
      [{ node: 'Есть ответ?', type: 'main', index: 0 }],
    ],
  },
  'Claude (Telegram)': { main: [[{ node: 'Format reply', type: 'main', index: 0 }]] },
  'Format reply': { main: [[{ node: 'Send Telegram', type: 'main', index: 0 }]] },
  'Есть ответ?': {
    main: [[{ node: 'Send Telegram', type: 'main', index: 0 }], []],
  },
  'Webhook /ask': { main: [[{ node: 'API build prompt', type: 'main', index: 0 }]] },
  'API build prompt': { main: [[{ node: 'API: доступ?', type: 'main', index: 0 }]] },
  'API: доступ?': {
    main: [
      [{ node: 'API error response', type: 'main', index: 0 }],
      [{ node: 'Claude (API)', type: 'main', index: 0 }],
    ],
  },
  'API error response': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
  'Claude (API)': { main: [[{ node: 'API response', type: 'main', index: 0 }]] },
  'API response': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] },
};

const workflow = {
  name: 'Memory Bot — выжимка + вопросы к беседе + API',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1' },
  pinData: {},
};

const out = path.join(__dirname, '..', 'workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2), 'utf8');
console.log('OK ->', out, '(' + nodes.length + ' nodes)');
