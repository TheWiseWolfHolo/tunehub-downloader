import { json, requireSession, verifyToken } from "../_lib/utils.js";

export async function onRequestGet({ request, env, params }) {
  const auth = await requireSession(request, env);
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await verifyToken(params.token, env.TUNEHUB_AUTH_SECRET, "download");
  if (!payload) {
    return json({ success: false, message: "下载链接不存在或已过期。" }, 404);
  }

  const upstream = await fetch(payload.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!upstream.ok) {
    return json({ success: false, message: `上游下载失败: ${upstream.status}` }, 502);
  }

  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "application/octet-stream");
  headers.set(
    "content-disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(payload.filename)}`,
  );
  const length = upstream.headers.get("content-length");
  if (length) {
    headers.set("content-length", length);
  }

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
