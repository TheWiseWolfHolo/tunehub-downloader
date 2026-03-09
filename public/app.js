const STORAGE_KEYS = { theme: "tunehub:theme" };

const PLATFORM_LABELS = {
  all: "全部",
  kuwo: "酷我音乐",
  netease: "网易云音乐",
  qq: "QQ 音乐",
};

const QUALITY_META = {
  "128k": "标准 MP3，兼容性最好。",
  "320k": "高品质 MP3，默认推荐。",
  flac: "无损 FLAC。",
  flac24bit: "Hi-Res，若上游不支持会自动降级。",
};

const state = {
  theme: "dark",
  session: null,
  searchPlatform: "all",
  searchResults: [],
  searchStats: null,
  selectedTrack: null,
  quality: "320k",
  parseResult: null,
};

const elements = {
  body: document.body,
  themeToggle: document.getElementById("themeToggle"),
  sessionPill: document.getElementById("sessionPill"),
  sessionText: document.getElementById("sessionText"),
  authChip: document.getElementById("authChip"),
  authSummary: document.getElementById("authSummary"),
  authForm: document.getElementById("authForm"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginButton: document.getElementById("loginButton"),
  activeSession: document.getElementById("activeSession"),
  activeUser: document.getElementById("activeUser"),
  activeExpiry: document.getElementById("activeExpiry"),
  logoutButton: document.getElementById("logoutButton"),
  searchPlatformSwitch: document.getElementById("searchPlatformSwitch"),
  searchForm: document.getElementById("searchForm"),
  keywordInput: document.getElementById("keywordInput"),
  searchButton: document.getElementById("searchButton"),
  searchMeta: document.getElementById("searchMeta"),
  searchResults: document.getElementById("searchResults"),
  selectedTrack: document.getElementById("selectedTrack"),
  parseForm: document.getElementById("parseForm"),
  platformSelect: document.getElementById("platformSelect"),
  songIdInput: document.getElementById("songIdInput"),
  qualityGrid: document.getElementById("qualityGrid"),
  qualityHelper: document.getElementById("qualityHelper"),
  parseButton: document.getElementById("parseButton"),
  parseOutput: document.getElementById("parseOutput"),
  downloadPlatform: document.getElementById("downloadPlatform"),
  downloadCover: document.getElementById("downloadCover"),
  downloadTitle: document.getElementById("downloadTitle"),
  downloadMeta: document.getElementById("downloadMeta"),
  factRow: document.getElementById("factRow"),
  downloadButton: document.getElementById("downloadButton"),
  copyLyricsButton: document.getElementById("copyLyricsButton"),
  lyricsPreview: document.getElementById("lyricsPreview"),
  toastRegion: document.getElementById("toastRegion"),
};

function resolveInitialTheme() {
  const stored = localStorage.getItem(STORAGE_KEYS.theme);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  state.theme = theme;
  elements.body.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function toggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
}

function formatExpiry(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return `有效至 ${date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function showToast(title, description) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p>`;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response
    .json()
    .catch(() => ({ success: false, message: "服务返回了非 JSON 响应。" }));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "请求失败。");
  }
  return payload;
}

function setButtonBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

async function refreshSession() {
  const payload = await requestJson("/api/session", { method: "GET" });
  state.session = payload.authenticated ? payload : null;
  renderAuthUi();
}

function renderAuthUi() {
  const authed = Boolean(state.session?.authenticated || state.session?.username);
  elements.sessionPill.dataset.authState = authed ? "authed" : "guest";
  elements.sessionText.textContent = authed ? `${state.session.username} 已登录` : "未登录";
  elements.authChip.textContent = authed ? "UNLOCKED" : "LOCKED";
  elements.authChip.classList.toggle("is-authed", authed);
  elements.authForm.classList.toggle("hidden", authed);
  elements.activeSession.classList.toggle("hidden", !authed);
  elements.authSummary.textContent = authed ? "已解锁，可以直接搜索、解析和下载。" : "当前未登录，接口处于锁定状态。";

  if (authed) {
    elements.activeUser.textContent = state.session.username;
    elements.activeExpiry.textContent = formatExpiry(state.session.expiresAt);
  }

  renderSearchMeta();
}

async function handleLogin(event) {
  event.preventDefault();
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value.trim();
  if (!username || !password) {
    return showToast("登录失败", "账号和密码都不能为空。");
  }

  setButtonBusy(elements.loginButton, true, "登录中...");
  try {
    const payload = await requestJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    state.session = { authenticated: true, username: payload.username, expiresAt: payload.expiresAt };
    elements.passwordInput.value = "";
    renderAuthUi();
    showToast("已登录", "现在可以开始搜索。");
  } catch (error) {
    showToast("登录失败", error.message);
  } finally {
    setButtonBusy(elements.loginButton, false, "登录");
  }
}

async function handleLogout() {
  try {
    await requestJson("/api/logout", { method: "POST", body: "{}" });
    state.session = null;
    state.searchResults = [];
    state.searchStats = null;
    state.selectedTrack = null;
    state.parseResult = null;
    renderAuthUi();
    renderSearchResults();
    renderSelectedTrack();
    renderParseResult();
    showToast("已退出", "会话已清除。");
  } catch (error) {
    showToast("退出失败", error.message);
  }
}

function renderSearchPlatformSwitch() {
  elements.searchPlatformSwitch.querySelectorAll(".platform-chip").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.platform === state.searchPlatform);
  });
}

function renderSearchMeta() {
  if (!state.session) {
    elements.searchMeta.innerHTML = `<span class="search-meta-copy">登录后可搜索。</span>`;
    return;
  }

  const platformLabel = PLATFORM_LABELS[state.searchPlatform];
  if (!state.searchStats) {
    elements.searchMeta.innerHTML = `<span class="search-meta-copy">当前模式：${escapeHtml(platformLabel)}。</span>`;
    return;
  }

  const chips = [];
  if (state.searchPlatform === "all" && state.searchStats.groups) {
    ["kuwo", "netease", "qq"].forEach((platform) => {
      const count = Number(state.searchStats.groups?.[platform] || 0);
      chips.push(`<span class="tiny-pill">${escapeHtml(PLATFORM_LABELS[platform])} ${count}</span>`);
    });
  }

  elements.searchMeta.innerHTML = `
    <span class="search-meta-copy">${escapeHtml(platformLabel)} · ${escapeHtml(state.searchStats.keyword)} · ${state.searchResults.length} 条</span>
    ${chips.join("")}
  `;
}

function renderSearchResults() {
  elements.searchResults.innerHTML = "";

  if (!state.session) {
    elements.searchResults.innerHTML = `<div class="empty-state"><strong>请先登录</strong><p>登录后才能调用本地搜索与下载接口。</p></div>`;
    return;
  }

  if (!state.searchResults.length) {
    const emptyCopy = state.searchStats?.keyword
      ? `没有找到“${escapeHtml(state.searchStats.keyword)}”的可用结果。`
      : "输入关键词后，结果会显示在这里。";
    elements.searchResults.innerHTML = `<div class="empty-state"><strong>暂时没有结果</strong><p>${emptyCopy}</p></div>`;
    return;
  }

  state.searchResults.forEach((item) => {
    const selected = state.selectedTrack?.platform === item.platform && state.selectedTrack?.id === item.id;
    const article = document.createElement("article");
    article.className = `result-card${selected ? " is-selected" : ""}`;

    const hints = (item.quality_hint || []).map((entry) => `<span class="tiny-pill">${escapeHtml(entry)}</span>`);
    if (item.duration) {
      hints.unshift(`<span class="tiny-pill">${escapeHtml(item.duration)}</span>`);
    }

    article.innerHTML = `
      <div class="result-main">
        <div class="result-title-row">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="platform-badge">${escapeHtml(item.platformLabel || PLATFORM_LABELS[item.platform])}</span>
        </div>
        <div class="result-meta">${escapeHtml(item.artist)}${item.album ? ` · ${escapeHtml(item.album)}` : ""}</div>
        <div class="tiny-pill-row">${hints.join("")}</div>
      </div>
      <button class="button button-secondary select-track-button" type="button">回填</button>
    `;

    article.addEventListener("click", () => selectTrack(item));
    elements.searchResults.append(article);
  });
}

function selectTrack(item) {
  state.selectedTrack = item;
  state.parseResult = null;
  elements.platformSelect.value = item.platform;
  elements.songIdInput.value = item.id;
  renderSearchResults();
  renderSelectedTrack();
  renderParseResult();
  showToast("已回填", `${item.platformLabel} 的《${item.name}》已带到右侧。`);

  if (window.matchMedia("(max-width: 760px)").matches) {
    elements.selectedTrack.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderSelectedTrack() {
  if (!state.selectedTrack) {
    elements.selectedTrack.innerHTML = `<div class="empty-state"><strong>尚未选择歌曲</strong><p>从左侧结果里点选，平台和歌曲 ID 会自动带到右侧。</p></div>`;
    return;
  }

  const cover = state.selectedTrack.cover
    ? `<img class="selected-cover" src="${escapeAttribute(state.selectedTrack.cover)}" alt="${escapeAttribute(state.selectedTrack.name)} 封面" />`
    : `<div class="selected-cover" aria-hidden="true"></div>`;

  elements.selectedTrack.innerHTML = `
    <div class="selected-content">
      ${cover}
      <div class="selected-info">
        <strong>${escapeHtml(state.selectedTrack.name)}</strong>
        <p>${escapeHtml(state.selectedTrack.artist)}${state.selectedTrack.album ? ` · ${escapeHtml(state.selectedTrack.album)}` : ""}</p>
        <p>${escapeHtml(state.selectedTrack.platformLabel || PLATFORM_LABELS[state.selectedTrack.platform])} · ID: ${escapeHtml(state.selectedTrack.id)}</p>
      </div>
    </div>
  `;
}

function renderParseResult() {
  const track = state.parseResult;
  if (!track) {
    elements.parseOutput.classList.add("hidden");
    return;
  }

  elements.parseOutput.classList.remove("hidden");
  elements.downloadPlatform.textContent = track.platformLabel || PLATFORM_LABELS[track.platform] || "解析结果";
  elements.downloadCover.src = track.cover || "";
  elements.downloadCover.alt = track.name ? `${track.name} 封面` : "歌曲封面";
  elements.downloadTitle.textContent = track.name;
  elements.downloadMeta.textContent = `${track.artist}${track.album ? ` · ${track.album}` : ""}`;
  elements.downloadButton.href = track.downloadPath;
  elements.lyricsPreview.textContent = track.lyrics || "暂无歌词。";

  const facts = [
    `请求 ${track.requestedQuality}`,
    `实际 ${track.actualQuality}`,
    track.duration ? `时长 ${track.duration}` : "",
    track.fileSize ? `大小 ${track.fileSize}` : "",
    track.responseTime ? `耗时 ${track.responseTime}ms` : "",
    track.wasDowngraded ? "已降级" : "未降级",
  ].filter(Boolean);

  elements.factRow.innerHTML = "";
  facts.forEach((entry) => {
    const pill = document.createElement("span");
    pill.className = "fact-pill";
    if (entry === "已降级") {
      pill.classList.add("is-warn");
    }
    pill.textContent = entry;
    elements.factRow.append(pill);
  });
}

async function handleSearch(event) {
  event.preventDefault();
  await runSearch();
}

async function runSearch() {
  if (!state.session) {
    return showToast("请先登录", "登录后才能搜索。");
  }

  const keyword = elements.keywordInput.value.trim();
  if (!keyword) {
    return showToast("缺少关键词", "请输入歌名、歌手或关键词。");
  }

  setButtonBusy(elements.searchButton, true, "搜索中...");
  try {
    const payload = await requestJson(
      `/api/search?platform=${encodeURIComponent(state.searchPlatform)}&keyword=${encodeURIComponent(keyword)}&page=1&limit=12`,
      { method: "GET" },
    );
    state.searchResults = payload.items || [];
    state.searchStats = {
      keyword,
      total: payload.total || state.searchResults.length,
      groups: payload.groups || null,
    };
    renderSearchMeta();
    renderSearchResults();
  } catch (error) {
    state.searchResults = [];
    state.searchStats = {
      keyword,
      total: 0,
      groups: null,
    };
    renderSearchResults();
    renderSearchMeta();
    showToast("搜索失败", error.message);
  } finally {
    setButtonBusy(elements.searchButton, false, "搜索");
  }
}

function setQuality(quality) {
  state.quality = quality;
  elements.qualityHelper.textContent = QUALITY_META[quality];
  elements.qualityGrid.querySelectorAll(".quality-chip").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.quality === quality);
  });
}

async function handleParse(event) {
  event.preventDefault();
  if (!state.session) {
    return showToast("请先登录", "登录后才能解析。");
  }

  const platform = elements.platformSelect.value;
  const id = elements.songIdInput.value.trim();
  if (!id) {
    return showToast("缺少歌曲 ID", "请先选择结果，或手动输入平台对应的歌曲 ID。");
  }

  setButtonBusy(elements.parseButton, true, "解析中...");
  try {
    const payload = await requestJson("/api/parse", {
      method: "POST",
      body: JSON.stringify({ platform, id, quality: state.quality }),
    });
    state.parseResult = payload.track;
    renderParseResult();
    showToast("解析成功", `已生成《${payload.track.name}》的下载链接。`);
  } catch (error) {
    showToast("解析失败", error.message);
  } finally {
    setButtonBusy(elements.parseButton, false, "解析并生成下载链接");
  }
}

async function copyLyrics() {
  const lyrics = state.parseResult?.lyrics;
  if (!lyrics) {
    return showToast("没有歌词", "当前结果没有歌词可复制。");
  }

  try {
    await navigator.clipboard.writeText(lyrics);
    showToast("已复制", "歌词已复制到剪贴板。");
  } catch {
    showToast("复制失败", "当前浏览器不支持自动复制。");
  }
}

function bindPlatformSwitch() {
  elements.searchPlatformSwitch.querySelectorAll(".platform-chip").forEach((button) => {
    button.addEventListener("click", async () => {
      state.searchPlatform = button.dataset.platform;
      state.searchResults = [];
      state.searchStats = null;
      renderSearchPlatformSwitch();
      renderSearchMeta();
      renderSearchResults();

      if (state.session && elements.keywordInput.value.trim()) {
        await runSearch();
      }
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function initialize() {
  applyTheme(resolveInitialTheme());
  renderAuthUi();
  renderSearchPlatformSwitch();
  renderSearchResults();
  renderSelectedTrack();
  renderParseResult();
  setQuality(state.quality);

  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.authForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.searchForm.addEventListener("submit", handleSearch);
  elements.parseForm.addEventListener("submit", handleParse);
  elements.copyLyricsButton.addEventListener("click", copyLyrics);
  bindPlatformSwitch();
  elements.qualityGrid.querySelectorAll(".quality-chip").forEach((button) => {
    button.addEventListener("click", () => setQuality(button.dataset.quality));
  });
  refreshSession().catch(() => {
    renderAuthUi();
  });
}

initialize();
