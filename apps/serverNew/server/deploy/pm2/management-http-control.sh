#! /bin/sh

APP=nodeframe
PLATFORM=$2
PLATFORM_VERSION=$3
EXEC_COMMOND=$4

#启动http server
HTTP_SERVER_NAME=$APP-http-$PLATFORM-$PLATFORM_VERSION

if test -z $(pm2 pid $HTTP_SERVER_NAME);
then
  process_commond='start'
else
  process_commond='reload'
fi
pm2 $process_commond http/index.js --name $HTTP_SERVER_NAME  -- -p $PLATFORM -v $PLATFORM_VERSION

# 启动错误日志扫描进程推送到微信群
ErrorMonitor_SERVER_NAME=$APP-ErrorLogMonitor-$PLATFORM-$PLATFORM_VERSION

if test -z $(pm2 pid $ErrorMonitor_SERVER_NAME);
then
  process_commond='start'
else
  process_commond='reload'
fi
pm2 $process_commond tool/index.js --name $ErrorMonitor_SERVER_NAME  -- -p $PLATFORM -v $PLATFORM_VERSION -c errorLogPush