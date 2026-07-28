# gameStarterKit 官网部署说明

本压缩包是已经构建完成的纯静态站点，不需要在服务器安装 Node.js。

## 部署

1. 将 ZIP 解压到网站根目录，例如 `/var/www/game-starter-kit/`。
2. 确认 `index.html` 与 `assets/`、`og.png` 位于同一级目录。
3. 将域名或服务器站点根目录指向该目录。

站点资源使用根路径 `/assets/`，因此请部署到域名根目录，不要放在
`https://example.com/some-subdirectory/` 这类子路径下。

## Nginx 示例

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/game-starter-kit;
    index index.html;

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

配置完成后执行 `nginx -t`，确认无误再重载 Nginx。

## Apache / 宝塔 / 1Panel

将运行目录或网站根目录设置为 ZIP 解压后的目录，默认首页设置为
`index.html` 即可。本站只有一个页面，不需要 PHP、数据库或反向代理。

## 更新

更新时覆盖 `index.html`、`assets/` 与 `og.png`。`assets/` 中的文件名带内容
哈希，可设置长期缓存；`index.html` 不建议设置长期缓存。
