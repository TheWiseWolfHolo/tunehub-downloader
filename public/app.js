const STORAGE_KEYS = { theme: "tunehub:theme" };

const PLATFORM_LABELS = {
  all: "全部",
  kuwo: "酷我音乐",
  netease: "网易云音乐",
  qq: "QQ 音乐",
};

const QUALITY_LABELS = {
  "128k": "128k",
  "320k": "320k",
  flac: "FLAC",
  flac24bit: "Hi-Res",
};

const QUALITY_META = {
  "128k": "当前歌曲可用音质里最稳妥的一档。",
  "320k": "高品质 MP3，兼顾体积和听感。",
  flac: "无损 FLAC，适合作为默认高音质。",
  flac24bit: "Hi-Res，当前歌曲若支持会优先选择。",
};

const QUALITY_ORDER = ["128k", "320k", "flac", "flac24bit"];
const PLATFORM_MAX_QUALITY = {
  kuwo: "flac",
  netease: "flac24bit",
  qq: "flac24bit",
};

const state = {
  theme: "dark",
  session: null,
  searchPlatform: "all",
  searchResults: [],
  searchStats: null,
  selectedTrack: null,
  availableQualities: ["128k", "320k", "flac"],
  recommendedQuality: "flac",
  quality: "flac",
  parseResult: null,
};

const elements = {
  body: document.body,
  themeToggle: document.getElementById("themeToggle"),
  sessionPill: document.getElementById("sessionPill"),
  sessionText: document.getElementById("sessionText"),
  headerNote: document.getElementById("headerNote"),
  loginPanel: document.querySelector(".login-panel"),
  accessEyebrow: document.getElementById("accessEyebrow"),
  accessTitle: document.getElementById("accessTitle"),
  accessCopy: document.getElementById("accessCopy"),
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
  detailCopy: document.getElementById("detailCopy"),
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
  if (stored === "light" || stored === "dark") {
    return stored;
  }
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
  if (!timestamp) {
    return "";
  }
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

function qualityIndex(quality) {
  return Math.max(QUALITY_ORDER.indexOf(quality), 0);
}

function clampQualityForPlatform(quality, platform) {
  const platformMax = PLATFORM_MAX_QUALITY[platform] || "320k";
  return QUALITY_ORDER[Math.min(qualityIndex(quality), qualityIndex(platformMax))];
}

function inferTrackMaxQuality(track, platform) {
  if (track?.maxQuality) {
    return clampQualityForPlatform(track.maxQuality, platform);
  }

  const hints = new Set(track?.quality_hint || []);
  if (hints.has("Hi-Res")) {
    return clampQualityForPlatform("flac24bit", platform);
  }
  if (hints.has("FLAC")) {
    return clampQualityForPlatform("flac", platform);
  }
  if (hints.has("320k")) {
    return clampQualityForPlatform("320k", platform);
  }
  if (hints.has("128k")) {
    return "128k";
  }

  return PLATFORM_MAX_QUALITY[platform] || "320k";
}

function resolveAvailableQualities(track, platform) {
  const maxQuality = inferTrackMaxQuality(track, platform);
  const maxIndex = qualityIndex(maxQuality);
  return QUALITY_ORDER.filter((_, index) => index <= maxIndex);
}

function updateQualityHelper() {
  const recommended = QUALITY_LABELS[state.recommendedQuality];
  const selected = QUALITY_LABELS[state.quality];
  const selectedTrackName = state.selectedTrack?.name;

  if (selectedTrackName) {
    const autoCopy = `已按《${selectedTrackName}》自动建议最高可用音质：${recommended}。`;
    if (state.quality === state.recommendedQuality) {
      elements.qualityHelper.textContent = `${autoCopy} ${QUALITY_META[state.quality]}`;
      return;
    }
    elements.qualityHelper.textContent = `${autoCopy} 当前手动切到了 ${selected}。`;
    return;
  }

  elements.qualityHelper.textContent = `当前按平台默认最高档优先：${recommended}。${QUALITY_META[state.quality]}`;
}

function renderQualityState() {
  elements.qualityGrid.querySelectorAll(".quality-chip").forEach((button) => {
    const quality = button.dataset.quality;
    const available = state.availableQualities.includes(quality);
    button.disabled = !available;
    button.classList.toggle("is-active", quality === state.quality);
    button.classList.toggle("is-disabled", !available);
    button.classList.toggle("is-recommended", available && quality === state.recommendedQuality);
    button.setAttribute("aria-pressed", String(quality === state.quality));
    button.title = available
      ? quality === state.recommendedQuality
        ? `推荐：${QUALITY_LABELS[quality]}`
        : QUALITY_LABELS[quality]
      : "当前歌曲或平台不支持此音质";
  });
  updateQualityHelper();
}

function syncQualityState({ track = state.selectedTrack, platform = elements.platformSelect.value, autoSelect = false } = {}) {
  const availableQualities = resolveAvailableQualities(track, platform);
  const recommendedQuality = availableQualities[availableQualities.length - 1] || "128k";

  state.availableQualities = availableQualities;
  state.recommendedQuality = recommendedQuality;

  if (autoSelect || !availableQualities.includes(state.quality)) {
    state.quality = recommendedQuality;
  } else {
    state.quality = clampQualityForPlatform(state.quality, platform);
  }

  renderQualityState();
}

function setQuality(quality) {
  if (!state.availableQualities.includes(quality)) {
    return;
  }
  state.quality = quality;
  renderQualityState();
}

async function refreshSession() {
  const payload = await requestJson("/api/session", { method: "GET" });
  state.session = payload.authenticated ? payload : null;
  renderAuthUi();
}

function renderAuthUi() {
  const authed = Boolean(state.session?.authenticated || state.session?.username);
  elements.loginPanel.classList.toggle("is-authed", authed);
  elements.sessionPill.dataset.authState = authed ? "authed" : "guest";
  elements.sessionText.textContent = authed ? `${state.session.username} 已登录` : "未登录";
  elements.authChip.textContent = authed ? "UNLOCKED" : "LOCKED";
  elements.authChip.classList.toggle("is-authed", authed);
  elements.authForm.classList.toggle("hidden", authed);
  elements.activeSession.classList.toggle("hidden", !authed);

  if (authed) {
    elements.accessEyebrow.textContent = "Workspace";
    elements.accessTitle.textContent = "工作台已解锁";
    elements.accessCopy.textContent = "直接搜索，点左侧结果会自动填入平台、歌曲 ID 和当前最高建议音质。";
    elements.headerNote.textContent = "当前已登录，聚合搜索、解析和下载链路都已解锁。";
    elements.authSummary.textContent = "已解锁，可以直接搜索、解析和下载。";
    elements.activeUser.textContent = state.session.username;
    elements.activeExpiry.textContent = formatExpiry(state.session.expiresAt);
  } else {
    elements.accessEyebrow.textContent = "Access";
    elements.accessTitle.textContent = "登录后开始使用";
    elements.accessCopy.textContent = "输入站内账号密码后解锁聚合搜索、解析与下载。";
    elements.headerNote.textContent = "未登录时可浏览界面，登录后可直接搜歌与下载。";
    elements.authSummary.textContent = "当前未登录，接口处于锁定状态。";
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
    showToast("已登录", "工作台已解锁，直接输入关键词开始搜索。");
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
    elements.platformSelect.value = "kuwo";
    elements.songIdInput.value = "";
    syncQualityState({ track: null, platform: "kuwo", autoSelect: true });
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
    elements.searchMeta.innerHTML = `<span class="search-meta-copy">${escapeHtml(platformLabel)} 已就绪，输入关键词开始搜索。</span>`;
    return;
  }

  const chips = [];
  if (state.searchPlatform === "all" && state.searchStats.groups) {
    ["kuwo", "netease", "qq"].forEach((platform) => {
      const count = Number(state.searchStats.groups?.[platform] || 0);
      chips.push(`<span class="tiny-pill">${escapeHtml(PLATFORM_LABELS[platform])} ${count}</span>`);
    });
  }
  if (state.selectedTrack) {
    chips.push(`<span class="tiny-pill is-accent">已同步到右侧</span>`);
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
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `选择 ${item.platformLabel || PLATFORM_LABELS[item.platform]} 的 ${item.name}`);

    const hints = (item.quality_hint || []).map((entry) => `<span class="tiny-pill">${escapeHtml(entry)}</span>`);
    if (item.maxQuality) {
      hints.unshift(`<span class="tiny-pill is-accent">默认 ${escapeHtml(QUALITY_LABELS[item.maxQuality])}</span>`);
    }
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

    const choose = () => selectTrack(item);
    article.addEventListener("click", choose);
    article.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
    elements.searchResults.append(article);
  });
}

function selectTrack(item) {
  state.selectedTrack = item;
  state.parseResult = null;
  elements.platformSelect.value = item.platform;
  elements.songIdInput.value = item.id;
  syncQualityState({ track: item, platform: item.platform, autoSelect: true });
  renderSearchMeta();
  renderSearchResults();
  renderSelectedTrack();
  renderParseResult();

  const bestQuality = QUALITY_LABELS[state.recommendedQuality];
  showToast("已回填", `${item.platformLabel} 的《${item.name}》已带到右侧，默认音质已切到 ${bestQuality}。`);

  if (window.matchMedia("(max-width: 760px)").matches) {
    elements.selectedTrack.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderSelectedTrack() {
  if (!state.selectedTrack) {
    elements.detailCopy.textContent = "选择歌曲后会自动填入平台、ID 和建议音质。";
    elements.selectedTrack.innerHTML = `<div class="empty-state"><strong>尚未选择歌曲</strong><p>从左侧结果里点选，平台和歌曲 ID 会自动带到右侧。</p></div>`;
    return;
  }

  elements.detailCopy.textContent = `已同步歌曲信息，当前默认建议音质为 ${QUALITY_LABELS[state.recommendedQuality]}。`;

  const cover = state.selectedTrack.cover
    ? `<img class="selected-cover" src="${escapeAttribute(state.selectedTrack.cover)}" alt="${escapeAttribute(state.selectedTrack.name)} 封面" />`
    : `<div class="selected-cover" aria-hidden="true"></div>`;

  const pills = [
    `<span class="tiny-pill is-accent">默认 ${escapeHtml(QUALITY_LABELS[state.recommendedQuality])}</span>`,
    ...(state.selectedTrack.quality_hint || []).map((entry) => `<span class="tiny-pill">${escapeHtml(entry)}</span>`),
  ];

  elements.selectedTrack.innerHTML = `
    <div class="selected-content">
      ${cover}
      <div class="selected-info">
        <strong>${escapeHtml(state.selectedTrack.name)}</strong>
        <p>${escapeHtml(state.selectedTrack.artist)}${state.selectedTrack.album ? ` · ${escapeHtml(state.selectedTrack.album)}` : ""}</p>
        <p>${escapeHtml(state.selectedTrack.platformLabel || PLATFORM_LABELS[state.selectedTrack.platform])} · ID: ${escapeHtml(state.selectedTrack.id)}</p>
        <div class="tiny-pill-row selected-pill-row">${pills.join("")}</div>
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

function clearSelectedTrackIfNeeded() {
  const currentPlatform = elements.platformSelect.value;
  const currentSongId = elements.songIdInput.value.trim();
  const stillMatches = state.selectedTrack
    && state.selectedTrack.platform === currentPlatform
    && state.selectedTrack.id === currentSongId;

  if (stillMatches) {
    return;
  }

  state.selectedTrack = null;
  state.parseResult = null;
  renderSearchMeta();
  renderSearchResults();
  renderSelectedTrack();
  renderParseResult();
}

function handlePlatformChange() {
  clearSelectedTrackIfNeeded();
  syncQualityState({ track: state.selectedTrack, platform: elements.platformSelect.value, autoSelect: true });
}

function handleSongIdInput() {
  clearSelectedTrackIfNeeded();
  syncQualityState({
    track: state.selectedTrack,
    platform: elements.platformSelect.value,
    autoSelect: !state.selectedTrack,
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
  syncQualityState({ track: null, platform: elements.platformSelect.value, autoSelect: true });

  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.authForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.searchForm.addEventListener("submit", handleSearch);
  elements.parseForm.addEventListener("submit", handleParse);
  elements.copyLyricsButton.addEventListener("click", copyLyrics);
  elements.platformSelect.addEventListener("change", handlePlatformChange);
  elements.songIdInput.addEventListener("input", handleSongIdInput);
  bindPlatformSwitch();
  elements.qualityGrid.querySelectorAll(".quality-chip").forEach((button) => {
    button.addEventListener("click", () => setQuality(button.dataset.quality));
  });
  refreshSession().catch(() => {
    renderAuthUi();
  });
}

initialize();
