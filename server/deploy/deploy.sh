#!/usr/bin/env bash
# ============================================================
#  BLINDGAP 账号系统后端 一键部署脚本
#  用途：在 Lighthouse 服务器（/opt/blindbox）上部署 Node 后端
#        并配置 nginx /api 反代 + systemd 常驻。
#  用法：把本文件内容粘进服务器终端（OrcaTerm）回车执行，或
#        scp 上去后 `sudo bash deploy.sh`。
#  前置：/opt/blindgap 已经是 git 仓库（前端 redeploy 同目录）。
# ============================================================
set -euo pipefail

APP_DIR=/opt/blindbox
DATA_DIR="$APP_DIR/data"
DB_PATH="$DATA_DIR/api.db"
SERVICE_NAME=blindgap-api
PORT=8787
NGINX_CONF=/etc/nginx/conf.d/blindgap.conf

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "!! 错误：找不到 node，请先安装 Node >= 22.5" >&2
  exit 1
fi

echo "==> [1/7] 检测 Node 版本（需要 >= 22.5 以使用 node:sqlite）"
NODE_VER="$("$NODE_BIN" --version | sed 's/^v//')"
REQ_VER=22.5.0
if ! printf '%s\n%s\n' "$REQ_VER" "$NODE_VER" | sort -V -C; then
  echo "!! 错误：Node 版本 $NODE_VER 过低，需要 >= 22.5。后端 node:sqlite 不可用。" >&2
  exit 1
fi
MAJOR="$(echo "$NODE_VER" | cut -d. -f1)"
EXTRA_FLAGS=""
if [ "$MAJOR" = "22" ]; then
  EXTRA_FLAGS="--experimental-sqlite"
  echo "    Node $NODE_VER（22.x 需 --experimental-sqlite）"
else
  echo "    Node $NODE_VER（无需 flag）"
fi

echo "==> [2/7] 备份数据库（部署前）"
mkdir -p "$DATA_DIR"
if [ -f "$DB_PATH" ]; then
  cp -p "$DB_PATH" "$DB_PATH.bak.$(date +%Y%m%d%H%M%S)"
  echo "    已备份 -> $DB_PATH.bak.*"
fi

echo "==> [3/7] 拉取最新代码"
cd "$APP_DIR"
git pull --ff-only

echo "==> [4/7] 安装依赖并构建（前端 + 服务端）"
npm install
npm run build
npx vite build --config vite.config.server.ts

echo "==> [5/7] 生成 systemd 单元"
cat > "/etc/systemd/system/$SERVICE_NAME.service" <<UNIT
[Unit]
Description=BLINDGAP API (Node, node:sqlite)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $EXTRA_FLAGS $APP_DIR/dist-server/index.js
Environment=BLINDGAP_DB=$DB_PATH
Environment=BLINDGAP_API_PORT=$PORT
Environment=BLINDGAP_API_HOST=127.0.0.1
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT

echo "==> [6/7] 配置 Nginx /api 反代（nginx -t 校验兜底）"
if [ ! -f "$NGINX_CONF" ]; then
  echo "!! 警告：未找到 $NGINX_CONF，请手动加入 server 块内的 /api/ 反代（见 blindgap-api.nginx.conf）"
else
  if grep -q "location /api/" "$NGINX_CONF"; then
    echo "    /api/ 反代已存在，跳过"
  else
    cp -p "$NGINX_CONF" "$NGINX_CONF.bak.$(date +%Y%m%d%H%M%S)"
    python3 - "$NGINX_CONF" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
block = (
    '\n'
    '    # BLINDGAP API 反代（账号系统后端）\n'
    '    location /api/ {\n'
    '        proxy_pass http://127.0.0.1:8787;\n'
    '        proxy_http_version 1.1;\n'
    '        proxy_set_header Host $host;\n'
    '        proxy_set_header X-Real-IP $remote_addr;\n'
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
    '        proxy_set_header X-Forwarded-Proto $scheme;\n'
    '    }\n'
)
idx = s.rfind('}')
if idx == -1:
    sys.exit('cannot find closing brace in nginx conf')
s = s[:idx] + block + s[idx:]
open(p, 'w', encoding='utf-8').write(s)
print('inserted /api/ block')
PY
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      echo "    nginx 校验通过并已 reload"
    else
      echo "!! nginx -t 失败，已回滚并保留备份；请手动检查 $NGINX_CONF"
      cp -p "$NGINX_CONF.bak."* "$NGINX_CONF" 2>/dev/null || true
      nginx -t
    fi
  fi
fi

echo "==> [7/7] 启动服务"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 2
systemctl is-active "$SERVICE_NAME" || { echo "!! 服务未起来，查看：journalctl -u $SERVICE_NAME -n 50"; exit 1; }

echo "--- 自检 /api/me（未登录应返回 401）---"
curl -s "http://127.0.0.1:$PORT/api/me" -w "\n[HTTP %{http_code}]\n"
echo ""
echo "==> 部署完成 ✅  前端走 8080，/api 已反代到 8787 后端"
