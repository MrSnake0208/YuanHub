# YuanHub Promo Site

This directory is a standalone Vite + Vue build of the YuanHub promotional page. It has one Vue entry point, static demo content, and no router, store, API, backend, or business-page dependency.

## Local development

```bash
npm install
npm run dev
npm run build
npm run preview
```

The build output is `dist/`. Upload the contents of that directory to the web root on the server, for example `/var/www/hub-promo`. Node.js is only needed to build or preview locally; the deployed site is static.

## Nginx

The site is intended to serve `hub.maayuan.com/`. Keep the root page and its three static directories on an explicit allowlist. Do not use a global SPA fallback, so `/login`, `/admin`, `/operator`, and unknown paths return `404`.

```nginx
server {
    listen 443 ssl;
    server_name hub.maayuan.com;
    root /var/www/hub-promo;

    location = / {
        try_files /index.html =404;
    }

    location /assets/ {
        try_files $uri =404;
    }

    location /icons/ {
        try_files $uri =404;
    }

    location /maayuan/ {
        try_files $uri =404;
    }

    location / {
        return 404;
    }
}
```
