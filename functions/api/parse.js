import { json, readJson, requireSession } from "./_lib/utils.js";
import { parseTrack } from "./_lib/tunehub.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireSession(request, env);
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await readJson(request);
  const platform = String(payload.platform || "").trim().toLowerCase();
  const id = String(payload.id || "").trim();
  const quality = String(payload.quality || "320k").trim();

  if (!["kuwo", "netease", "qq"].includes(platform)) {
    return json({ success: false, message: "平台只支持 kuwo / netease / qq。" }, 400);
  }
  if (!id) {
    return json({ success: false, message: "歌曲 ID 不能为空。" }, 400);
  }

  try {
    const track = await parseTrack({ platform, id, quality, env });
    return json({ success: true, track });
  } catch (error) {
    return json({ success: false, message: String(error.message || error) }, 502);
  }
}
