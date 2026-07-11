#!/usr/bin/env bash
# 本地开发栈：redis-durable(6401) + redis-cache(6402) + MySQL 8.4(3316)。
# 用法: tools/dev-stack.sh start|stop|status
# 实例形态对齐 06：durable = noeviction + AOF everysec；cache = allkeys-lru；物理分实例（09·R4）。
set -euo pipefail

DATA="${GAME_DEV_DATA:-$HOME/.game-dev}"
BREW_PREFIX="$(brew --prefix)"
MYSQL_BIN="$BREW_PREFIX/opt/mysql@8.4/bin"
REDIS_SERVER="$BREW_PREFIX/opt/redis/bin/redis-server"
REDIS_CLI="$BREW_PREFIX/opt/redis/bin/redis-cli"

DURABLE_PORT=6401
CACHE_PORT=6402
MYSQL_PORT=3316

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
  echo "redis-$1 启动于 :$2"
}

start_mysql() {
  local dir="$DATA/mysql"
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
