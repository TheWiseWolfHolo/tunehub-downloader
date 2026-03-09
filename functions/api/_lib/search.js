import { PLATFORM_LABELS, durationLabel, interleaveGroups } from "./utils.js";

function platformMeta(platform) {
  return {
    platform,
    platformLabel: PLATFORM_LABELS[platform],
  };
}

function qualityMeta({ hires = false, flac = false, q320 = false, q128 = false }) {
  const hints = [];
  let maxQuality = "128k";

  if (hires) {
    hints.push("Hi-Res");
    maxQuality = "flac24bit";
  }
  if (flac) {
    hints.push("FLAC");
    if (maxQuality !== "flac24bit") {
      maxQuality = "flac";
    }
  }
  if (q320) {
    hints.push("320k");
    if (maxQuality === "128k") {
      maxQuality = "320k";
    }
  }
  if (q128 || hints.length === 0) {
    hints.push("128k");
  }

  return {
    quality_hint: hints,
    maxQuality,
  };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`上游搜索失败: ${response.status}`);
  }
  return response.json();
}

function normalizeNeteaseSong(item) {
  const privilegeMaxBr = Number(item.privilege?.maxbr || 0);
  return {
    ...platformMeta("netease"),
    id: String(item.id || ""),
    name: item.name || "未知歌曲",
    artist: (item.artists || item.ar || []).map((artist) => artist.name).filter(Boolean).join(", "),
    album: item.album?.name || item.al?.name || item.originSongSimpleData?.albumMeta?.name || "",
    duration: durationLabel(Math.floor((item.duration || item.dt || 0) / 1000)),
    subtitle: "",
    cover: String(item.album?.picUrl || item.al?.picUrl || "").replace(/^http:\/\//i, "https://"),
    ...qualityMeta({
      hires: Boolean(item.hr),
      flac: Boolean(item.hr || item.sq || privilegeMaxBr >= 999000),
      q320: Boolean(item.h || privilegeMaxBr >= 320000),
      q128: Boolean(item.m || item.l || privilegeMaxBr >= 128000),
    }),
  };
}

export async function searchPlatform(platform, keyword, page = 1, limit = 10) {
  if (platform === "kuwo") {
    return searchKuwo(keyword, page, limit);
  }
  if (platform === "netease") {
    return searchNetease(keyword, page, limit);
  }
  if (platform === "qq") {
    return searchQQ(keyword, page, limit);
  }
  throw new Error(`不支持的平台: ${platform}`);
}

export async function searchAll(keyword, page = 1, limit = 12) {
  const selected = ["kuwo", "netease", "qq"];
  const perPlatformLimit = Math.max(4, Math.ceil(limit / selected.length));
  const results = await Promise.all(
    selected.map(async (platform) => {
      try {
        return await searchPlatform(platform, keyword, page, perPlatformLimit);
      } catch {
        return { items: [], total: 0, platform };
      }
    }),
  );

  const groups = Object.fromEntries(results.map((entry) => [entry.platform, entry.items.length]));
  const items = interleaveGroups(results.map((entry) => entry.items), limit);
  const total = results.reduce((sum, entry) => sum + entry.total, 0);

  return { platform: "all", keyword, page, limit, total, groups, items };
}

async function searchKuwo(keyword, page, limit) {
  const url = new URL("http://search.kuwo.cn/r.s");
  const params = {
    client: "kt",
    all: keyword,
    pn: String(Math.max(page - 1, 0)),
    rn: String(limit),
    uid: "794762570",
    ver: "kwplayer_ar_9.2.2.1",
    vipver: "1",
    show_copyright_off: "1",
    newver: "1",
    ft: "music",
    cluster: "0",
    strategy: "2012",
    encoding: "utf8",
    rformat: "json",
    vermerge: "1",
    mobi: "1",
    issubtitle: "1",
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const payload = await fetchJson(url.toString(), {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  const items = (payload.abslist || []).map((item) => ({
    ...platformMeta("kuwo"),
    id: String(item.MUSICRID || "").replace("MUSIC_", ""),
    name: item.SONGNAME || item.NAME || "未知歌曲",
    artist: String(item.ARTIST || "").replace(/&/g, ", "),
    album: item.ALBUM || "",
    duration: durationLabel(item.DURATION),
    subtitle: item.SUBTITLE || "",
    cover: item.web_albumpic_short
      ? `https://img4.kuwo.cn/star/albumcover/${item.web_albumpic_short}`
      : "",
    ...qualityMeta({
      flac: /format:mflac|format:flac/i.test(item.N_MINFO || item.MINFO || ""),
      q320: /bitrate:320/i.test(item.N_MINFO || item.MINFO || ""),
      q128: /bitrate:128/i.test(item.N_MINFO || item.MINFO || ""),
    }),
  }));

  return {
    platform: "kuwo",
    total: Number(payload.TOTAL || items.length),
    items,
  };
}

async function searchNetease(keyword, page, limit) {
  const baseHeaders = {
    referer: "https://music.163.com/",
    origin: "https://music.163.com",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    accept: "application/json,text/plain,*/*",
  };
  const offset = String((page - 1) * limit);
  const limitText = String(limit);

  const attempts = [
    async () => {
      const payload = await fetchJson("https://music.163.com/api/cloudsearch/pc", {
        method: "POST",
        headers: {
          ...baseHeaders,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          s: keyword,
          type: "1",
          offset,
          limit: limitText,
        }),
      });

      return {
        total: Number(payload.result?.songCount || 0),
        songs: payload.result?.songs || [],
      };
    },
    async () => {
      const url = new URL("https://music.163.com/api/search/get/web");
      url.searchParams.set("s", keyword);
      url.searchParams.set("type", "1");
      url.searchParams.set("offset", offset);
      url.searchParams.set("limit", limitText);
      url.searchParams.set("csrf_token", "");

      const payload = await fetchJson(url.toString(), {
        headers: baseHeaders,
      });

      return {
        total: Number(payload.result?.songCount || 0),
        songs: payload.result?.songs || [],
      };
    },
    async () => {
      const url = new URL("http://music.163.com/api/search/get/web");
      url.searchParams.set("s", keyword);
      url.searchParams.set("type", "1");
      url.searchParams.set("offset", offset);
      url.searchParams.set("limit", limitText);
      url.searchParams.set("csrf_token", "");

      const payload = await fetchJson(url.toString(), {
        headers: baseHeaders,
      });

      return {
        total: Number(payload.result?.songCount || 0),
        songs: payload.result?.songs || [],
      };
    },
  ];

  for (const attempt of attempts) {
    try {
      const payload = await attempt();
      if ((payload.songs || []).length > 0) {
        return {
          platform: "netease",
          total: payload.total,
          items: payload.songs.map(normalizeNeteaseSong),
        };
      }
    } catch {
      // Keep falling back until one endpoint returns usable data.
    }
  }

  return {
    platform: "netease",
    total: 0,
    items: [],
  };
}

async function searchQQ(keyword, page, limit) {
  const url = new URL("https://c.y.qq.com/soso/fcgi-bin/client_search_cp");
  url.searchParams.set("p", String(page));
  url.searchParams.set("n", String(limit));
  url.searchParams.set("w", keyword);
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString(), {
    headers: {
      referer: "https://y.qq.com/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`QQ 搜索失败: ${response.status}`);
  }
  const payload = await response.json();
  const songs = payload.data?.song?.list || [];

  const items = songs.map((item) => ({
    ...platformMeta("qq"),
    id: item.songmid || "",
    name: item.songname || "未知歌曲",
    artist: (item.singer || []).map((artist) => artist.name).join(", "),
    album: item.albumname || "",
    duration: durationLabel(item.interval),
    subtitle: "",
    cover: item.albummid
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${item.albummid}.jpg`
      : "",
    ...qualityMeta({
      hires: Number(item.sizehires || item.sizeHiRes || 0) > 0,
      flac: Number(item.sizeflac || 0) > 0,
      q320: Number(item.size320 || 0) > 0,
      q128: Number(item.size128 || 0) > 0,
    }),
  }));

  return {
    platform: "qq",
    total: Number(payload.data?.song?.totalnum || items.length),
    items,
  };
}
