const SESSION_COOKIE = "tunehub_session";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const PLATFORM_LABELS = {
  all: "全部",
  kuwo: "酷我音乐",
  netease: "网易云音乐",
  qq: "QQ 音乐",
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const idx = item.indexOf("=");
        if (idx === -1) {
          return [item, ""];
        }
        return [item.slice(0, idx), decodeURIComponent(item.slice(idx + 1))];
      }),
  );
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret, scope) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`${scope}:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(payload, secret, scope) {
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret, scope);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyToken(token, secret, scope) {
  if (!token || !token.includes(".")) {
    return null;
  }
  const [body, signature] = token.split(".");
  const key = await hmacKey(secret, scope);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signature),
    encoder.encode(body),
  );
  if (!ok) {
    return null;
  }

  try {
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(body)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(request, env) {
  const secret = env.TUNEHUB_AUTH_SECRET;
  if (!secret) {
    throw new Error("缺少 TUNEHUB_AUTH_SECRET 环境变量。");
  }
  const cookies = parseCookies(request);
  return verifyToken(cookies[SESSION_COOKIE], secret, "session");
}

export async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return {
      ok: false,
      response: json({ success: false, message: "请先登录后再继续。" }, 401),
    };
  }
  return { ok: true, session };
}

export async function createSessionCookie(username, request, env) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const token = await signToken({ username, exp }, env.TUNEHUB_AUTH_SECRET, "session");
  return sessionCookieString(token, exp, request);
}

export function clearSessionCookie(request) {
  return sessionCookieString("", 0, request);
}

function sessionCookieString(value, exp, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const maxAge = exp > 0 ? `; Max-Age=${Math.max(exp - Math.floor(Date.now() / 1000), 0)}` : "; Max-Age=0";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}${maxAge}`;
}

export function interleaveGroups(groups, limit) {
  const copies = groups.map((list) => [...list]);
  const merged = [];
  while (merged.length < limit && copies.some((list) => list.length > 0)) {
    for (const list of copies) {
      if (list.length > 0 && merged.length < limit) {
        merged.push(list.shift());
      }
    }
  }
  return merged;
}

export function trackFilename(track) {
  const raw = `${track.info.name} - ${track.info.artist} - ${track.actualQuality}`;
  const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "tunehub-track";
  const extension = new URL(track.url).pathname.split(".").pop() || "mp3";
  return `${safe}.${extension.toLowerCase()}`;
}

export function durationLabel(seconds) {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export function fileSizeLabel(size) {
  const value = Number(size || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return index === 0 ? `${Math.round(current)} ${units[index]}` : `${current.toFixed(1)} ${units[index]}`;
}
