#! /bin/sh

APP=nodeframe
PLATFORM=$2
PLATFORM_VERSION=$3
EXEC_COMMAND=$4

if [ -z "$PLATFORM_VERSION" ]; then
  PLATFORM_VERSION=release
fi

SERVER_NAME=$APP-game-$PLATFORM-$PLATFORM_VERSION

start_server() {
  PM2_KILL_SIGNAL=SIGTERM pm2 start app/index.js --source-map-support --kill-timeout 10000 --name "$SERVER_NAME" -- -p "$PLATFORM" -v "$PLATFORM_VERSION" --sid 1
}

case "$EXEC_COMMAND" in
start)
  if [ -n "$(pm2 pid "$SERVER_NAME")" ]; then
    echo "$SERVER_NAME is running"
    exit 1
  fi
  start_server
  ;;
stop)
  if [ -z "$(pm2 pid "$SERVER_NAME")" ]; then
    echo "$SERVER_NAME is not running"
    exit 1
  fi
  PM2_KILL_SIGNAL=SIGTERM pm2 delete "$SERVER_NAME"
  ;;
restart)
  if [ -n "$(pm2 pid "$SERVER_NAME")" ]; then
    PM2_KILL_SIGNAL=SIGTERM pm2 delete "$SERVER_NAME"
  fi
  start_server
  ;;
*)
  echo "Usage: sh $0 _ <platform> <version> {start|stop|restart}"
  exit 1
  ;;
esac
