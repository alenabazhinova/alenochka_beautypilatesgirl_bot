#!/usr/bin/env bash
# Выключает Memory Bot: туннель cloudflared -> контейнер n8n (Docker Desktop).
# Данные НЕ удаляются (том n8n_data сохраняется).
# Запуск:  bash ~/Desktop/n8n-memory-bot/stop-bot.sh
export PATH="/opt/homebrew/bin:$PATH"

echo "1/2  Останавливаю туннель cloudflared…"
pkill -f "cloudflared tunnel --url http://localhost:5678" >/dev/null 2>&1 \
  && echo "     туннель убран" || echo "     туннель не был запущен"

echo "2/2  Останавливаю контейнер n8n…"
docker stop n8n >/dev/null 2>&1 \
  && echo "     n8n остановлен" || echo "     n8n не был запущен"

echo ""
echo "✅  Бот выключен. Память сохранена (том n8n_data)."
echo "    Docker Desktop можно оставить (в простое почти не грузит) или выйти из меню Docker вручную."
echo "    Запустить снова:  bash ~/Desktop/n8n-memory-bot/start-bot.sh"
