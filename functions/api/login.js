import { createSessionCookie, json, readJson } from "./_lib/utils.js";

export async function onRequestPost({ request, env }) {
  const username = env.TUNEHUB_SITE_USERNAME;
  const password = env.TUNEHUB_SITE_PASSWORD;
  if (!username || !password) {
    return json({ success: false, message: "缺少登录环境变量配置。" }, 500);
  }

  const payload = await readJson(request);
  if (String(payload.username || "").trim() !== username || String(payload.password || "").trim() !== password) {
    return json({ success: false, message: "账号或密码不正确。" }, 401);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  return json(
    {
      success: true,
      username,
      expiresAt,
    },
    200,
    {
      "set-cookie": await createSessionCookie(username, request, env),
    },
  );
}
