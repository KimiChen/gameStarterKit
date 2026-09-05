#!/usr/bin/env bash
# 本地开发栈：redis-durable(默认 6401) + redis-cache(默认 6402) + MySQL 8.4(默认 3316)。
# 用法: tools/dev-stack.sh start|stop|status
# 实例形态对齐 06：durable = noeviction + AOF everysec；cache = allkeys-lru；物理分实例（09·R4）。
#
# 多项目并行默认**共用**这一套实例：隔离靠根 .env.development 的 PROJECT_ID（Redis 键前缀 +
# MySQL 独立库名，见 infra/config.ts/keys.ts），无需给每个项目单起栈。
# 进阶（真要物理分栈）：端口仍从根 .env.development 的三个连接 URL 派生（连接与栈不脱节），
# 数据目录随 MySQL 端口自动分家（非默认端口 → ~/.game-dev-<port>）。
# ⚠ 根 .env.development 须保持 KEY=VALUE 简单格式（本脚本直接 source 它）。
#
# 停止是一个有破坏性的动作：端口可能被别的项目或开发者占用，不能只凭
# `redis-cli -p ... shutdown` / `mysqladmin ... shutdown` 判断实例归属。每个
# 本脚本启动的实例都会写 owner 元数据，并在停止前同时核对 PID、进程启动时间、
# 二进制、端口和实际数据目录；缺任一项就拒绝停止（宁可留下实例，也不误杀）。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$HERE/../../../.env.development"
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

# 统一成绝对路径。Redis/MySQL 会规范化 symlink 路径，后面的运行时比对也以
# realpath 结果为准；不要在 status/stop 时为了规范化而创建数据目录。
canonical_path() {
  local p="$1"
  if [ -d "$p" ]; then
    (cd "$p" && pwd -P)
  else
    local parent base
    parent="$(dirname "$p")"
    base="$(basename "$p")"
    [ -d "$parent" ] || mkdir -p "$parent"
    printf '%s/%s\n' "$(cd "$parent" && pwd -P)" "$base"
  fi
}
DATA="$(canonical_path "$DATA")"

STACK_ID_FILE="$DATA/.game-dev-stack-id"
STACK_ID=""

read_stack_id() {
  STACK_ID=""
  if [ -f "$STACK_ID_FILE" ]; then
    IFS= read -r STACK_ID < "$STACK_ID_FILE" || true
  fi
  [[ "$STACK_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$ ]]
}

new_stack_id() {
  local id
  if command -v uuidgen >/dev/null 2>&1; then
    id="$(uuidgen | tr -d '\r\n-')"
  else
    id="$(date +%s)-$$-${RANDOM:-0}-$(date +%N 2>/dev/null || true)"
    id="$(printf '%s' "$id" | tr -cd 'A-Za-z0-9._-')"
  fi
  printf '%s\n' "$id"
}

ensure_stack_id() {
  if [ -e "$STACK_ID_FILE" ]; then
    if read_stack_id; then return; fi
    echo "本栈 instance 标识损坏或格式非法（${STACK_ID_FILE}）；拒绝覆盖并继续操作" >&2
    return 1
  fi
  mkdir -p "$DATA"
  STACK_ID="$(new_stack_id)"
  local tmp="$STACK_ID_FILE.$$"
  umask 077
  printf '%s\n' "$STACK_ID" > "$tmp"
  mv -f "$tmp" "$STACK_ID_FILE"
  chmod 600 "$STACK_ID_FILE"
}

owner_file() { printf '%s/.owner\n' "$1"; }

# owner 文件是 key=value 数据，不 source，避免把数据目录里的内容当 shell 代码执行。
owner_value() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  awk -F= -v wanted="$key" '$1 == wanted { print substr($0, index($0, "=") + 1); exit }' "$file"
}

write_owner() {
  local file="$1" service="$2" pid="$3" port="$4" data_dir="$5" pid_file="$6" started="$7" binary="$8" server_id="${9:-}"
  local tmp="$file.$$"
  {
    printf 'format=1\n'
    printf 'service=%s\n' "$service"
    printf 'instance_id=%s\n' "$STACK_ID"
    printf 'pid=%s\n' "$pid"
    printf 'port=%s\n' "$port"
    printf 'data_dir=%s\n' "$data_dir"
    printf 'pid_file=%s\n' "$pid_file"
    printf 'started_at=%s\n' "$started"
    printf 'started_epoch=%s\n' "$(started_epoch_of "$started")"
    printf 'binary=%s\n' "$binary"
    [ -n "$server_id" ] && printf 'server_id=%s\n' "$server_id"
  } > "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$file"
}

pid_valid() { [[ "$1" =~ ^[1-9][0-9]*$ ]]; }

pid_alive() {
  pid_valid "$1" && kill -0 "$1" 2>/dev/null
}

# ⚠ `ps -o lstart=` 的日期格式**随 locale 变化**（C 下是 `Sat Sep  5 00:11:27 2026`，
# zh_CN.UTF-8 下是 `六  9月/ 5 00:11:27 2026`）。归属校验把这个字符串逐字写进 .owner 再逐字
# 比对，所以**必须钉死 C locale**：否则「英文 shell 启动、中文 shell 检查」会互相判成
# 「不是本栈实例」——start 拒绝覆盖、stop 拒绝停止，双向死锁只能手工 kill。
# ⛔ 不要删掉这里的 LC_ALL=C；process_command 同理（两处保持一致，便于整体推理）。
process_started_at() {
  local pid="$1"
  LC_ALL=C ps -ww -p "$pid" -o lstart= 2>/dev/null | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | head -n 1
}

process_command() {
  local pid="$1"
  LC_ALL=C ps -ww -p "$pid" -o command= 2>/dev/null | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | head -n 1
}

# 把 C locale 的 lstart 字符串（`Sat Sep  5 00:11:27 2026`）解析成 epoch 秒：跨 locale、跨版本都稳定的
# 归属比对口径。macOS 用 `date -j -f`，GNU date 用 `-d`；解析不出返回空（调用方按不匹配处理）。
started_epoch_of() {
  local started="$1" epoch
  [ -n "$started" ] || return 0
  epoch="$(LC_ALL=C date -j -f '%a %b %d %H:%M:%S %Y' "$started" '+%s' 2>/dev/null || true)"
  [ -n "$epoch" ] || epoch="$(LC_ALL=C date -d "$started" '+%s' 2>/dev/null || true)"
  printf '%s\n' "$epoch"
}

# 进程启动时间是否与 .owner 记录一致。三级判定：
#  1. C locale 字符串逐字相等（01fda6b 起写入的都是 C 格式）；
#  2. `started_epoch` 相等（本次新增字段，⛔ 与 locale 无关，是今后的主判据）；
#  3. 旧格式 .owner（01fda6b 之前按当时 locale 写入，如 `三  9月/ 2 17:56:33 2026`，且没有 started_epoch）：
#     字符串本就不可比——此时**其余身份项已全部通过**（instance_id / pid=pidfile / 运行时自证：redis 配置内
#     的实例标记、mysql 的 datadir+socket+server_id / 二进制与命令行），据此采纳并把 .owner 升级为新格式。
#     ⚠ 只对「没有 started_epoch」的旧文件放行；带 started_epoch 却对不上的，一律视为 pid 复用/外部实例。
# 修复的现场（2026-09-05）：栈是 9 月 2 日中文 shell 起的，01fda6b 后 start/stop 双向拒绝，`npm run dev` 必败于
# stack 步，而实例明明是本栈的。
owner_started_matches() {
  local file="$1" pid="$2" recorded actual recorded_epoch actual_epoch
  recorded="$(owner_value "$file" started_at 2>/dev/null || true)"
  actual="$(process_started_at "$pid")"
  [ -n "$actual" ] || return 1
  [ "$actual" = "$recorded" ] && return 0
  recorded_epoch="$(owner_value "$file" started_epoch 2>/dev/null || true)"
  actual_epoch="$(started_epoch_of "$actual")"
  if [ -n "$recorded_epoch" ]; then
    [ -n "$actual_epoch" ] && [ "$recorded_epoch" = "$actual_epoch" ]
    return $?
  fi
  # 旧格式：无 started_epoch。调用方已核过其余身份项，这里只做「旧字符串形态确实不是 C locale」的最低门槛，
  # 然后自愈重写。
  case "$recorded" in
    "") return 1 ;;
    [A-Z][a-z][a-z]" "*) return 1 ;;  # 已是 C 格式却不相等 → 真的不是同一个进程
  esac
  heal_owner_started "$file" "$pid" "$actual"
}

# 把旧格式 .owner 的 started_at 升级为 C locale + started_epoch（其余字段原样保留）。
heal_owner_started() {
  local file="$1" pid="$2" actual="$3" tmp="$1.$$"
  awk -F= -v started="$actual" -v epoch="$(started_epoch_of "$actual")" '
    $1 == "started_at" { print "started_at=" started; printed_at = 1; next }
    $1 == "started_epoch" { next }
    $1 == "binary" && !printed_epoch { print "started_epoch=" epoch; printed_epoch = 1 }
    { print }
    END { if (!printed_epoch) print "started_epoch=" epoch }
  ' "$file" > "$tmp" && chmod 600 "$tmp" && mv -f "$tmp" "$file"
  echo "$(owner_value "$file" service) 的 .owner 是旧 locale 格式（pid=$pid 身份其余项全部匹配），已升级为 C locale + started_epoch" >&2
}

redis_runtime_value() {
  local port="$1" setting="$2"
  "$REDIS_CLI" -p "$port" --raw CONFIG GET "$setting" 2>/dev/null | sed -n '2p'
}

redis_info_value() {
  local port="$1" setting="$2"
  "$REDIS_CLI" -p "$port" INFO server 2>/dev/null | awk -F: -v wanted="$setting" '$1 == wanted { sub(/\r$/, "", $2); print $2; exit }'
}

redis_runtime_matches() {
  local name="$1" port="$2" dir="$3" config="$4" pidfile="$5" pid="$6"
  local command info_pid config_dir config_pidfile config_port expected_dir expected_pidfile
  pid_alive "$pid" || return 1
  command="$(process_command "$pid")"
  case "$command" in
    "$REDIS_SERVER"|"$REDIS_SERVER "*|*/redis-server|*/redis-server\ *) : ;;
    *) return 1 ;;
  esac
  info_pid="$(redis_info_value "$port" process_id)"
  [ "$info_pid" = "$pid" ] || return 1
  config_dir="$(redis_runtime_value "$port" dir)"
  config_pidfile="$(redis_runtime_value "$port" pidfile)"
  config_port="$(redis_runtime_value "$port" port)"
  expected_dir="$(cd "$dir" && pwd -P)"
  expected_pidfile="$(cd "$(dirname "$pidfile")" && pwd -P)/$(basename "$pidfile")"
  [ "$config_dir" = "$expected_dir" ] || return 1
  [ "$config_pidfile" = "$expected_pidfile" ] || return 1
  [ "$config_port" = "$port" ] || return 1
  # The config path is not retained in Redis' process title, so also require the
  # instance marker in the exact config file that supplied dir/pidfile/port.
  grep -Fqx "# game-dev-stack-instance=$STACK_ID service=$name" "$config" || return 1
}

redis_owned() {
  local name="$1" port="$2" dir="$3" config="$4" pidfile="$5" file pid started command
  file="$(owner_file "$dir")"
  [ "$(owner_value "$file" format 2>/dev/null || true)" = "1" ] || return 1
  [ "$(owner_value "$file" service 2>/dev/null || true)" = "redis-$name" ] || return 1
  [ "$(owner_value "$file" instance_id 2>/dev/null || true)" = "$STACK_ID" ] || return 1
  pid="$(owner_value "$file" pid 2>/dev/null || true)"
  [ "$(cat "$pidfile" 2>/dev/null || true)" = "$pid" ] || return 1
  redis_runtime_matches "$name" "$port" "$dir" "$config" "$pidfile" "$pid" || return 1
  command="$(process_command "$pid")"
  [ "$(owner_value "$file" binary 2>/dev/null || true)" = "$REDIS_SERVER" ] || return 1
  case "$command" in "$REDIS_SERVER"|"$REDIS_SERVER "*|*/redis-server|*/redis-server\ *) : ;; *) return 1 ;; esac
  # 启动时间放最后：其余身份项全过后，旧格式 .owner 才允许自愈（见 owner_started_matches）。
  owner_started_matches "$file" "$pid" || return 1
}

mysql_query_row() {
  local port="$1" sql="$2"
  "$MYSQL_BIN/mysql" --protocol=tcp --host=127.0.0.1 --port="$port" -uroot --batch --skip-column-names -e "$sql" 2>/dev/null
}

mysql_server_id() {
  # Keep the marker stable for a data directory while staying in a conservative
  # range accepted by all MySQL 8.x builds.
  local n
  n="$(printf '%s' "$STACK_ID" | cksum | awk '{print $1}')"
  printf '%s\n' "$((n % 2147483646 + 1))"
}

mysql_runtime_matches() {
  local port="$1" dir="$2" pidfile="$3" pid="$4" expected_dir expected_pidfile expected_socket row got_dir got_port got_pidfile got_socket got_server_id command
  pid_alive "$pid" || return 1
  command="$(process_command "$pid")"
  case "$command" in
    "$MYSQL_BIN/mysqld"|"$MYSQL_BIN/mysqld "*|*/mysqld|*/mysqld\ *) : ;;
    *) return 1 ;;
  esac
  expected_dir="$(cd "$dir/data" && pwd -P)/"
  expected_pidfile="$(cd "$(dirname "$pidfile")" && pwd -P)/$(basename "$pidfile")"
  expected_socket="$(cd "$dir" && pwd -P)/mysql.sock"
  row="$(mysql_query_row "$port" 'SELECT @@datadir, @@port, @@pid_file, @@socket, @@server_id')" || return 1
  IFS=$'\t' read -r got_dir got_port got_pidfile got_socket got_server_id <<< "$row"
  [ "$got_dir" = "$expected_dir" ] || return 1
  [ "$got_port" = "$port" ] || return 1
  [ "$got_pidfile" = "$expected_pidfile" ] || return 1
  [ "$got_socket" = "$expected_socket" ] || return 1
  [ "$got_server_id" = "$(mysql_server_id)" ] || return 1
}

mysql_owned() {
  local port="$1" dir="$2" pidfile="$3" file pid started
  file="$(owner_file "$dir")"
  [ "$(owner_value "$file" format 2>/dev/null || true)" = "1" ] || return 1
  [ "$(owner_value "$file" service 2>/dev/null || true)" = "mysql" ] || return 1
  [ "$(owner_value "$file" instance_id 2>/dev/null || true)" = "$STACK_ID" ] || return 1
  pid="$(owner_value "$file" pid 2>/dev/null || true)"
  [ "$(cat "$pidfile" 2>/dev/null || true)" = "$pid" ] || return 1
  mysql_runtime_matches "$port" "$dir" "$pidfile" "$pid" || return 1
  [ "$(owner_value "$file" binary 2>/dev/null || true)" = "$MYSQL_BIN/mysqld" ] || return 1
  owner_started_matches "$file" "$pid" || return 1
}

BREW_PREFIX="$(brew --prefix)"
MYSQL_BIN="$BREW_PREFIX/opt/mysql@8.4/bin"
REDIS_SERVER="$BREW_PREFIX/opt/redis/bin/redis-server"
REDIS_CLI="$BREW_PREFIX/opt/redis/bin/redis-cli"

start_redis() { # $1=name $2=port $3=extra-config(多行)
  local name="$1" port="$2" extra="$3" dir="$DATA/redis-$1" config pidfile
  mkdir -p "$dir"
  dir="$(cd "$dir" && pwd -P)"
  config="$dir/redis.conf"
  pidfile="$dir/redis.pid"
  if "$REDIS_CLI" -p "$port" ping >/dev/null 2>&1; then
    if redis_owned "$name" "$port" "$dir" "$config" "$pidfile"; then
      echo "redis-${name}(${port}) 已在跑（本栈 instance=${STACK_ID}）"
      return
    fi
    echo "redis-${name}(${port}) 已被占用，但不是本栈实例；拒绝覆盖或停止" >&2
    return 1
  fi
  # 端口暂时不可达，但 pid 仍存活时也不能另起一份；这通常是旧实例启动中
  # 或故障中的进程，交给开发者确认后处理。
  if [ -f "$pidfile" ] && pid_alive "$(cat "$pidfile" 2>/dev/null || true)"; then
    echo "redis-${name} 的 pidfile 指向仍存活进程，但端口不可达；拒绝另起实例：${pidfile}" >&2
    return 1
  fi
  {
    echo "# game-dev-stack-instance=$STACK_ID service=$name"
    echo "port $port"
    echo "dir $dir"
    echo "daemonize yes"
    echo "pidfile $pidfile"
    echo "logfile $dir/redis.log"
    # activedefrag yes —— 生产必开（06）；macOS brew 版未编入定制 jemalloc，本地跳过
    echo "$extra"
  } > "$config"
  "$REDIS_SERVER" "$config"
  # daemonize 下 bind 失败（端口被占等）父进程仍返回 0——必须 ping 复核再报成功
  local i
  for i in $(seq 1 50); do
    if "$REDIS_CLI" -p "$port" ping >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
  if ! "$REDIS_CLI" -p "$port" ping >/dev/null 2>&1; then
    echo "redis-${name} 启动失败，日志：${dir}/redis.log" >&2
    return 1
  fi
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if ! redis_runtime_matches "$name" "$port" "$dir" "$config" "$pidfile" "$pid"; then
    echo "redis-${name} 启动后身份校验失败；拒绝登记/停止未知实例" >&2
    return 1
  fi
  write_owner "$(owner_file "$dir")" "redis-$name" "$pid" "$port" "$dir" "$pidfile" "$(process_started_at "$pid")" "$REDIS_SERVER"
  echo "redis-${name} 启动于 :${port}（instance=${STACK_ID} pid=${pid}）"
}

start_mysql() {
  local dir="$DATA/mysql" pidfile pid server_id
  mkdir -p "$dir"
  dir="$(cd "$dir" && pwd -P)"
  pidfile="$dir/mysql.pid"
  # mysqld 的 unix socket 路径上限 103 字符，超长会以一条含糊的 daemon 启动失败告终——提前拦截
  if [ "${#dir}" -gt 90 ]; then
    echo "GAME_DEV_DATA 路径过长（mysql socket 会超 103 字符上限）：${dir}——换个短路径（如 ~/.game-dev-xxx）" >&2
    return 1
  fi
  if "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port="$MYSQL_PORT" -uroot ping >/dev/null 2>&1; then
    if mysql_owned "$MYSQL_PORT" "$dir" "$pidfile"; then
      echo "mysql(${MYSQL_PORT}) 已在跑（本栈 instance=${STACK_ID}）"
      return
    fi
    echo "mysql(${MYSQL_PORT}) 已被占用，但不是本栈实例；拒绝覆盖或停止" >&2
    return 1
  fi
  if [ -f "$pidfile" ] && pid_alive "$(cat "$pidfile" 2>/dev/null || true)"; then
    echo "mysql 的 pidfile 指向仍存活进程，但端口不可达；拒绝另起实例：${pidfile}" >&2
    return 1
  fi
  if [ ! -d "$dir/data" ]; then
    mkdir -p "$dir"
    "$MYSQL_BIN/mysqld" --initialize-insecure --datadir="$dir/data" >/dev/null 2>&1
    echo "mysql datadir 初始化完成"
  fi
  server_id="$(mysql_server_id)"
  # binlog_format=ROW 是 8.x 默认，显式声明以对齐 07 的服务器配置要求
  "$MYSQL_BIN/mysqld" \
    --datadir="$dir/data" \
    --port="$MYSQL_PORT" \
    --socket="$dir/mysql.sock" \
    --pid-file="$pidfile" \
    --log-error="$dir/mysql.err" \
    --server-id="$server_id" \
    --binlog_format=ROW \
    --bind-address=127.0.0.1 \
    --mysqlx=OFF \
    --daemonize=ON
  local i
  for i in $(seq 1 50); do
    if "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port="$MYSQL_PORT" -uroot ping >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
  if ! "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port="$MYSQL_PORT" -uroot ping >/dev/null 2>&1; then
    echo "mysql 启动失败，日志：${dir}/mysql.err" >&2
    return 1
  fi
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if ! mysql_runtime_matches "$MYSQL_PORT" "$dir" "$pidfile" "$pid"; then
    echo "mysql 启动后身份校验失败；拒绝登记/停止未知实例" >&2
    return 1
  fi
  write_owner "$(owner_file "$dir")" "mysql" "$pid" "$MYSQL_PORT" "$dir" "$pidfile" "$(process_started_at "$pid")" "$MYSQL_BIN/mysqld" "$server_id"
  echo "mysql 启动于 :${MYSQL_PORT}（instance=${STACK_ID} pid=${pid}）"
}

case "${1:-}" in
  start)
    ensure_stack_id
    start_redis durable $DURABLE_PORT $'maxmemory-policy noeviction\nappendonly yes\nappendfsync everysec'
    start_redis cache   $CACHE_PORT   $'maxmemory-policy allkeys-lru\nmaxmemory 256mb\nsave ""'
    start_mysql
    ;;
  stop)
    if ! read_stack_id; then
      echo "未找到本栈 instance 标识（${STACK_ID_FILE}）；拒绝对配置端口执行停止" >&2
      exit 1
    fi
    stop_failed=0
    stop_redis() {
      local name="$1" port="$2" dir="$DATA/redis-$1" config pidfile
      dir="$(canonical_path "$dir")"
      config="$dir/redis.conf"
      pidfile="$dir/redis.pid"
      if ! "$REDIS_CLI" -p "$port" ping >/dev/null 2>&1; then
        echo "redis-${name}(${port}): down"
        return 0
      fi
      if ! redis_owned "$name" "$port" "$dir" "$config" "$pidfile"; then
        echo "redis-${name}(${port}): 端口实例身份不匹配，跳过停止（可能是外部实例）" >&2
        return 1
      fi
      "$REDIS_CLI" -p "$port" shutdown nosave
      echo "redis-${name}(${port}): stopped"
    }
    stop_mysql() {
      local dir="$DATA/mysql" pidfile
      dir="$(canonical_path "$dir")"
      pidfile="$dir/mysql.pid"
      if ! "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port="$MYSQL_PORT" -uroot ping >/dev/null 2>&1; then
        echo "mysql(${MYSQL_PORT}): down"
        return 0
      fi
      if ! mysql_owned "$MYSQL_PORT" "$dir" "$pidfile"; then
        echo "mysql(${MYSQL_PORT}): 端口实例身份不匹配，跳过停止（可能是外部实例）" >&2
        return 1
      fi
      "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port="$MYSQL_PORT" -uroot shutdown
      echo "mysql(${MYSQL_PORT}): stopped"
    }
    stop_redis durable "$DURABLE_PORT" || stop_failed=1
    stop_redis cache "$CACHE_PORT" || stop_failed=1
    stop_mysql || stop_failed=1
    if [ "$stop_failed" -ne 0 ]; then
      echo "部分实例未停止：身份校验失败的端口保持运行" >&2
      exit 1
    fi
    echo "已停止（instance=${STACK_ID}）"
    ;;
  status)
    read_stack_id && echo "stack instance=$STACK_ID" || echo "stack instance=unknown"
    status_redis() { # $1=name $2=port —— up 时顺带说明是否本栈（归属判定与 start/stop 同一函数）
      local name="$1" port="$2" dir="$DATA/redis-$1"
      dir="$(canonical_path "$dir")"
      if ! "$REDIS_CLI" -p "$port" ping >/dev/null 2>&1; then echo "redis-${name}(${port}): down"; return; fi
      if redis_owned "$name" "$port" "$dir" "$dir/redis.conf" "$dir/redis.pid" 2>/dev/null; then
        echo "redis-${name}(${port}): up（本栈）"
      else
        echo "redis-${name}(${port}): up（⚠ 非本栈实例或身份不匹配：start/stop 都会拒绝）"
      fi
    }
    status_mysql() {
      local dir="$DATA/mysql"
      dir="$(canonical_path "$dir")"
      if ! "$MYSQL_BIN/mysqladmin" --host=127.0.0.1 --port="$MYSQL_PORT" -uroot ping >/dev/null 2>&1; then echo "mysql(${MYSQL_PORT}): down"; return; fi
      if mysql_owned "$MYSQL_PORT" "$dir" "$dir/mysql.pid" 2>/dev/null; then
        echo "mysql(${MYSQL_PORT}): up（本栈）"
      else
        echo "mysql(${MYSQL_PORT}): up（⚠ 非本栈实例或身份不匹配：start/stop 都会拒绝）"
      fi
    }
    status_redis durable "$DURABLE_PORT"
    status_redis cache "$CACHE_PORT"
    status_mysql
    ;;
  *)
    echo "用法: $0 start|stop|status"; exit 1
    ;;
esac
