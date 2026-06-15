#!/usr/bin/env bash
# Поднимает Memory Bot на Docker Desktop одной командой:
#   Docker Desktop (если выключен) -> контейнер n8n -> cloudflared туннель ->
#   прописывает свежий адрес туннеля в WEBHOOK_URL и перезапускает n8n.
# Запуск:  bash ~/Desktop/n8n-memory-bot/start-bot.sh
set -e
export PATH="/opt/homebrew/bin:$PATH"

VOL=n8n_data
IMG=n8nio/n8n
TLOG=/tmp/cloudflared_n8n.log

run_n8n () {  # $1 = WEBHOOK_URL (с / на конце) или пусто
  local wh="$1"
  docker rm -f n8n >/dev/null 2>&1 || true
  docker run -d --name n8n --restart unless-stopped \
    -p 5678:5678 \
    -e N8N_SECURE_COOKIE=false \
    -e GENERIC_TIMEZONE=Europe/Moscow \
    -e N8N_EDITOR_BASE_URL=http://localhost:5678/ \
    ${wh:+-e WEBHOOK_URL=$wh} \
    -v "$VOL":/home/node/.n8n \
    "$IMG" >/dev/null
}

echo "1/5  Docker Desktop…"
if ! docker info >/dev/null 2>&1; then
  open -a Docker
  for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
fi
docker info >/dev/null 2>&1 || { echo "❌  Docker Desktop не запустился — открой приложение вручную"; exit 1; }

echo "2/5  Контейнер n8n…"
if docker ps -a --format '{{.Names}}' | grep -q '^n8n$'; then
  docker start n8n >/dev/null
else
  run_n8n ""
fi

echo "3/5  Туннель cloudflared…"
pkill -f "cloudflared tunnel --url http://localhost:5678" >/dev/null 2>&1 || true
nohup cloudflared tunnel --url http://localhost:5678 >"$TLOG" 2>&1 &
URL=""
for i in $(seq 1 40); do
  URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$TLOG" 2>/dev/null | head -1 || true)
  [ -n "$URL" ] && break
  sleep 2
done
[ -z "$URL" ] && { echo "❌  Туннель не поднялся. Лог: $TLOG"; exit 1; }
echo "$URL" > /tmp/n8n_tunnel_url.txt
echo "     туннель: $URL"

echo "4/5  Прописываю WEBHOOK_URL и перезапускаю n8n…"
CURRENT=$(docker exec n8n printenv WEBHOOK_URL 2>/dev/null || echo "")
[ "$CURRENT" != "$URL/" ] && run_n8n "$URL/"

echo "5/5  Жду готовности n8n…"
for i in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5678 2>/dev/null)" = "200" ] && break
  sleep 2
done

echo ""
echo "✅  Готово!"
echo "    Редактор:  http://localhost:5678"
echo "    Туннель:   $URL"
echo "    Webhook:   $URL/webhook/ask"
echo ""
echo "⚠️   Адрес туннеля НОВЫЙ. Если бот не отвечает — открой n8n → workflow →"
echo "     выключи и снова включи Active (toggle), чтобы Telegram перерегистрировал webhook."
