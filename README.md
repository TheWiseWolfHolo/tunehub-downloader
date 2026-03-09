# Holo Music

一个适合 Cloudflare Pages Functions 部署的 Holo Music 下载器。

## 能力

- 默认聚合 `酷我 / 网易云 / QQ 音乐` 搜索
- 保留按音源单独检索
- 点击左侧结果自动把平台和歌曲 ID 回填到右侧解析区
- 站内登录、上游 API Key、下载令牌都走服务端逻辑
- 解析成功后直接生成同源下载链接

## 本地开发

1. 复制环境变量模板：

```powershell
Copy-Item .dev.vars.example .dev.vars
```

2. 填写 `.dev.vars`：

```ini
TUNEHUB_SITE_USERNAME=你的站内账号
TUNEHUB_SITE_PASSWORD=你的站内密码
TUNEHUB_AUTH_SECRET=一串足够长的随机密钥
TUNEHUB_API_KEY=你的上游 API Key
```

3. 启动本地开发：

```powershell
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:8788
```

## Cloudflare Pages 部署

### 方案一：GitHub 连接 Cloudflare Pages

Cloudflare Pages 项目建议配置：

- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `public`
- Root directory: 仓库根目录

然后在 Pages 项目里配置以下环境变量或 Secrets：

- `TUNEHUB_SITE_USERNAME`
- `TUNEHUB_SITE_PASSWORD`
- `TUNEHUB_AUTH_SECRET`
- `TUNEHUB_API_KEY`

### 方案二：Wrangler 手动部署

```powershell
npx wrangler login
npx wrangler pages project create holo-music
npx wrangler pages deploy public --project-name holo-music
```

## 目录结构

```text
public/
  index.html
  app.js
  styles.css
functions/
  api/
    login.js
    logout.js
    session.js
    search.js
    parse.js
    download/[token].js
```
