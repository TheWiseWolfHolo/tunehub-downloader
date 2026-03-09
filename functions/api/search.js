import { json, requireSession } from "./_lib/utils.js";
import { searchAll, searchPlatform } from "./_lib/search.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireSession(request, env);
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const platform = (url.searchParams.get("platform") || "all").trim().toLowerCase();
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "12"), 1), 20);

  if (!keyword) {
    return json({ success: false, message: "请输入搜索关键词。" }, 400);
  }

  try {
    const payload =
      platform === "all"
        ? await searchAll(keyword, page, limit)
        : {
            platform,
            keyword,
            page,
            limit,
            ...(await searchPlatform(platform, keyword, page, limit)),
          };

    return json({
      success: true,
      ...payload,
    });
  } catch (error) {
    return json({ success: false, message: String(error.message || error) }, 502);
  }
}
