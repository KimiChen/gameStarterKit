#!/usr/bin/env bash
# 本地开发栈：redis-durable(默认 6401) + redis-cache(默认 6402) + MySQL 8.4(默认 3316)。
# 用法: tools/dev-stack.sh start|stop|status
# 实例形态对齐 06：durable = noeviction + AOF everysec；cache = allkeys-lru；物理分实例（09·R4）。
#
# 多项目并行默认**共用**这一套实例：隔离靠根 .env.development 的 projectId（Redis 键前缀 +
# MySQL 独立库名，见 infra/config.ts/keys.ts），无需给每个项目单起栈。
# 进阶（真要物理分栈）：端口仍从 .env.development 的三个连接 URL 派生（连接与栈不脱节），
# 数据目录随 MySQL 端口自动分家（非默认端口 → ~/.game-dev-<port>）。
# ⚠ .env.development 须保持 KEY=VALUE 简单格式（本脚本直接 source 它）。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/../.env.development"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

# 从 URL 尾部提取端口（redis://host:6401 / mysql://user@host:3316/db）；解析不出数字即回退默认
port_of() { # $1=url $2=default
  local p="${1##*:}"
  p="${p%%/*}"
  [[ "$p" =~ ^[0-9]+$ ]] && echo "$p" || echo "$2"
}
DURABLE_PORT="$(port_of "${REDIS_DURABLE_URL:-}" 6401)"
CACHE_PORT="$(port_of "${REDIS_CACHE_URL:-}" 6402)"
MYSQL_PORT="$(port_of "${MYSQL_URL:-}" 3316)"

# 数据目录：默认端口沿用 ~/.game-dev（存量兼容）；自定义端口自动分家防两套 mysqld/redis 抢同一 datadir
DATA_DEFAULT="$HOME/.game-dev"
[ "$MYSQL_PORT" != "3316" ] && DATA_DEFAULT="$HOME/.game-dev-$MYSQL_PORT"
DATA="${GAME_DEV_DATA:-$DATA_DEFAULT}"

BREW_PREFIX="$(brew --prefix)"
MYSQL_BIN="$BREW_PREFIX/opt/mysql@8.4/bin"
REDIS_SERVER="$BREW_PREFIX/opt/redis/bin/redis-server"
REDIS_CLI="$BREW_PREFIX/opt/redis/bin/redis-cli"

start_redis() { # $1=name $2=port $3=extra-config(多行)
  local dir="$DATA/redis-$1"
  mkdir -p "$dir"
  if "$REDIS_CLI" -p "$2" ping >/dev/null 2>&1; then echo "redis-$1($2) 已在跑"; return; fi
  {
    echo "port $2"
    echo "dir $dir"
    echo "daemonize yes"
    echo "pidfile $dir/redis.pid"
    echo "logfile $dir/redis.log"
    # activedefrag yes —— 生产必开（06）；macOS brew 版未编入定制 jemalloc，本地跳过
    echo "$3"
  } > "$dir/redis.conf"
  "$REDIS_SERVER" "$dir/redis.conf"
  # daemonize 下 bind 失败（端口被占等）父进程仍返回 0——必须 ping 复核再报成功
  local i
  for i in $(seq 1 50); do
    if "$REDIS_CLI" -p "$2" ping >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
  if ! "$REDIS_CLI" -p "$2" ping >/dev/null 2>&1; then
    echo "redis-$1 启动失败，日志：$dir/redis.log" >&2
    return 1
  fi
  echo "redis-$1 启动于 :$2"
}

start_mysql() {
  local dir="$DATA/mysql"
  # mysqld 的 unix socket 路径上限 103 字符，超长会以一条含糊的 daemon 启动失败告终——提前拦截
  if [ "${#dir}" -gt 90 ]; then
    echo "GAME_DEV_DATA 路径过长（mysql socket 会超 103 字符上限）：$dir——换个短路径（如 ~/.game-dev-xxx）" >&2
    return 1
  fi
  if "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port=$MYSQL_PORT -uroot ping >/dev/null 2>&1; then
    echo "mysql($MYSQL_PORT) 已在跑"; return
  fi
  if [ ! -d "$dir/data" ]; then
    mkdir -p "$dir"
    "$MYSQL_BIN/mysqld" --initialize-insecure --datadir="$dir/data" >/dev/null 2>&1
    echo "mysql datadir 初始化完成"
  fi
  # binlog_format=ROW 是 8.x 默认，显式声明以对齐 07 的服务器配置要求
  "$MYSQL_BIN/mysqld" \
    --datadir="$dir/data" \
    --port=$MYSQL_PORT \
    --socket="$dir/mysql.sock" \
    --pid-file="$dir/mysql.pid" \
    --log-error="$dir/mysql.err" \
    --binlog_format=ROW \
    --bind-address=127.0.0.1 \
    --mysqlx=OFF \
    --daemonize=ON
  echo "mysql 启动于 :$MYSQL_PORT"
}

case "${1:-}" in
  start)
    start_redis durable $DURABLE_PORT $'maxmemory-policy noeviction\nappendonly yes\nappendfsync everysec'
    start_redis cache   $CACHE_PORT   $'maxmemory-policy allkeys-lru\nmaxmemory 256mb\nsave ""'
    start_mysql
    ;;
  stop)
    "$REDIS_CLI" -p $DURABLE_PORT shutdown nosave 2>/dev/null || true
    "$REDIS_CLI" -p $CACHE_PORT   shutdown nosave 2>/dev/null || true
    if [ -f "$DATA/mysql/mysql.pid" ]; then
      "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port=$MYSQL_PORT -uroot shutdown 2>/dev/null || true
    fi
    echo "已停止"
    ;;
  status)
    "$REDIS_CLI" -p $DURABLE_PORT ping 2>/dev/null && echo "redis-durable: up" || echo "redis-durable: down"
    "$REDIS_CLI" -p $CACHE_PORT   ping 2>/dev/null && echo "redis-cache: up"   || echo "redis-cache: down"
    "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port=$MYSQL_PORT -uroot ping 2>/dev/null || echo "mysql: down"
    ;;
  *)
    echo "用法: $0 start|stop|status"; exit 1
    ;;
esac
