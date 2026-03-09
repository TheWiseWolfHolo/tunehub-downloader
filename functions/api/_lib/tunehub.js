import { PLATFORM_LABELS, durationLabel, fileSizeLabel, signToken, trackFilename } from "./utils.js";

const TUNEHUB_API_BASE = "https://tunehub.sayqz.com/api";

async function readUpstreamError(response) {
  const raw = await response.text();
  const type = response.headers.get("content-type") || "";

  if (raw.includes("请求携带恶意参数") || raw.includes("请求拦截")) {
    return "上游解析服务当前拦截了这个运行环境的请求，请优先在 Cloudflare Pages 线上环境中测试解析链路。";
  }

  if (type.includes("application/json")) {
    try {
      const payload = JSON.parse(raw);
      return payload?.message || payload?.error || `上游解析失败: ${response.status}`;
    } catch {
      return `上游解析失败: ${response.status}`;
    }
  }

  return `上游解析失败: ${response.status}`;
}

export async function parseTrack({ platform, id, quality, env }) {
  const apiKey = env.TUNEHUB_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 TUNEHUB_API_KEY 环境变量。");
  }

  const response = await fetch(`${TUNEHUB_API_BASE}/v1/parse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      platform,
      ids: id,
      quality,
    }),
  });

  if (!response.ok) {
    throw new Error(await readUpstreamError(response));
  }

  const payload = await response.json();
  const first = payload?.data?.data?.[0];
  if (!first?.success) {
    throw new Error(first?.error || "解析失败，请检查歌曲 ID 或音质。");
  }

  const expiresIn = Number(first.expire || 1800);
  const filename = trackFilename(first);
  const downloadToken = await signToken(
    {
      url: first.url,
      filename,
      exp: Math.floor(Date.now() / 1000) + expiresIn,
    },
    env.TUNEHUB_AUTH_SECRET,
    "download",
  );

  return {
    id: first.id || id,
    platform,
    platformLabel: PLATFORM_LABELS[platform] || platform,
    name: first.info?.name || "",
    artist: first.info?.artist || "",
    album: first.info?.album || "",
    durationSeconds: first.info?.duration || 0,
    duration: durationLabel(first.info?.duration || 0),
    cover: String(first.cover || "").replace(/^http:\/\//i, "https://"),
    lyrics: first.lyrics || "",
    requestedQuality: first.requestedQuality || quality,
    actualQuality: first.actualQuality || quality,
    qualityMatch: Boolean(first.qualityMatch),
    wasDowngraded: Boolean(first.wasDowngraded),
    fileSize: fileSizeLabel(first.fileSize || 0),
    responseTime: first.responseTime || 0,
    downloadPath: `/api/download/${downloadToken}`,
    expiresIn,
  };
}
