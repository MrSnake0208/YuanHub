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

## GitHub Actions deployment

`.github/workflows/promo-site-deploy.yml` builds and deploys this directory when `promo-site/**` changes on `main`. It also supports manual runs. It does not build or deploy the YuanHub main site.

Configure these repository Secrets before enabling the workflow. Do not put them only under an Environment unless the workflow job is also configured with that Environment:

- `YUANHUB_PROMO_VPS_HOST`
- `YUANHUB_PROMO_VPS_USER`
- `YUANHUB_PROMO_VPS_PORT`
- `YUANHUB_PROMO_VPS_SSH_KEY`
- `YUANHUB_PROMO_DEPLOY_DIR` (for example `/var/www/hub-promo`)

The SSH user must be able to run `sudo -n install`, `find`, `cp`, and `rm` for the deployment directory. Each run uploads to a temporary directory, replaces the target directory contents, and removes the temporary files.

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
