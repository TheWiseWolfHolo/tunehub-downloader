const STORAGE_KEYS = { theme: "holo-music:theme" };

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
  searchPage: 1,
  searchLimit: resolveSearchLimit(),
  searchTotal: 0,
  selectedTrack: null,
  availableQualities: ["128k", "320k", "flac"],
  recommendedQuality: "flac",
  quality: "flac",
  parseResult: null,
};

const elements = {
  body: document.body,
  authView: document.getElementById("authView"),
  workspaceView: document.getElementById("workspaceView"),
  themeToggle: document.getElementById("themeToggle"),
  sessionPill: document.getElementById("sessionPill"),
  sessionText: document.getElementById("sessionText"),
  headerNote: document.getElementById("headerNote"),
  accessTitle: document.getElementById("accessTitle"),
  accessCopy: document.getElementById("accessCopy"),
  authChip: document.getElementById("authChip"),
  authSummary: document.getElementById("authSummary"),
  authForm: document.getElementById("authForm"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  searchPlatformSwitch: document.getElementById("searchPlatformSwitch"),
  searchForm: document.getElementById("searchForm"),
  keywordInput: document.getElementById("keywordInput"),
  searchButton: document.getElementById("searchButton"),
  searchMeta: document.getElementById("searchMeta"),
  searchResults: document.getElementById("searchResults"),
  searchPagination: document.getElementById("searchPagination"),
  prevPageButton: document.getElementById("prevPageButton"),
  nextPageButton: document.getElementById("nextPageButton"),
  paginationStatus: document.getElementById("paginationStatus"),
  paginationSummary: document.getElementById("paginationSummary"),
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

let searchViewportTimer = 0;

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

function resolveSearchLimit() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (width <= 640) {
    return height >= 900 ? 5 : 4;
  }
  if (width <= 1080) {
    return height >= 960 ? 6 : 5;
  }
  if (height >= 1120) {
    return 8;
  }
  if (height >= 920) {
    return 7;
  }
  return 6;
}

function getSearchTotalPages() {
  return Math.max(1, Math.ceil(Math.max(state.searchTotal, 0) / state.searchLimit));
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
  if (hints.has("Hi-Res")) return clampQualityForPlatform("flac24bit", platform);
  if (hints.has("FLAC")) return clampQualityForPlatform("flac", platform);
  if (hints.has("320k")) return clampQualityForPlatform("320k", platform);
  return "128k";
}

function resolveAvailableQualities(track, platform) {
  const maxQuality = inferTrackMaxQuality(track, platform);
  const maxIndex = qualityIndex(maxQuality);
  return QUALITY_ORDER.filter((_, index) => index <= maxIndex);
}

function updateQualityHelper() {
  const recommended = QUALITY_LABELS[state.recommendedQuality];
  const selected = QUALITY_LABELS[state.quality];

  if (state.selectedTrack) {
    const intro = `已按《${state.selectedTrack.name}》自动建议最高可用音质：${recommended}。`;
    elements.qualityHelper.textContent =
      state.quality === state.recommendedQuality
        ? `${intro} ${QUALITY_META[state.quality]}`
        : `${intro} 当前手动切到了 ${selected}。`;
    return;
  }

  elements.qualityHelper.textContent = `当前会优先按平台支持上限推荐：${recommended}。${QUALITY_META[state.quality]}`;
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
  renderWorkspaceHeader();
}

function renderWorkspaceHeader() {
  if (!state.session) {
    return;
  }
  if (state.parseResult) {
    elements.headerNote.textContent = `《${state.parseResult.name}》已解析完成，可直接下载，也可以展开查看歌词。`;
    return;
  }
  if (state.selectedTrack) {
    elements.headerNote.textContent = `《${state.selectedTrack.name}》已同步到右侧，当前默认建议音质为 ${QUALITY_LABELS[state.recommendedQuality]}。`;
    return;
  }
  if (state.searchStats?.keyword) {
    elements.headerNote.textContent = `当前为 ${PLATFORM_LABELS[state.searchPlatform]} 模式，继续输入关键词即可刷新结果。`;
    return;
  }
  elements.headerNote.textContent = "默认聚合搜索，点选结果后会自动同步平台、ID 与建议音质。";
}

async function refreshSession() {
  const payload = await requestJson("/api/session", { method: "GET" });
  state.session = payload.authenticated ? payload : null;
  renderAuthUi();
}

function renderAuthUi() {
  const authed = Boolean(state.session?.authenticated || state.session?.username);

  elements.authView.classList.toggle("hidden", authed);
  elements.workspaceView.classList.toggle("hidden", !authed);
  elements.sessionPill.dataset.authState = authed ? "authed" : "guest";
  elements.sessionText.textContent = authed ? `${state.session.username} · 已登录` : "未登录";
  elements.authChip.textContent = authed ? "UNLOCKED" : "LOCKED";
  elements.authChip.classList.toggle("is-authed", authed);

  if (authed) {
    renderWorkspaceHeader();
  } else {
    elements.accessTitle.textContent = "欢迎回来";
    elements.accessCopy.textContent = "登录后继续使用。";
    elements.authSummary.textContent = "输入账号和密码后登录。";
  }
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
    renderSearchResults();
    renderSearchMeta();
    renderSelectedTrack();
    renderParseResult();
    renderSearchPagination();
    showToast("已登录", "现在可以直接搜索并下载歌曲。");
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
    state.searchPage = 1;
    state.searchTotal = 0;
    state.selectedTrack = null;
    state.parseResult = null;
    elements.platformSelect.value = "kuwo";
    elements.songIdInput.value = "";
    syncQualityState({ track: null, platform: "kuwo", autoSelect: true });
    renderAuthUi();
    renderSearchMeta();
    renderSearchResults();
    renderSearchPagination();
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
    elements.searchMeta.innerHTML = `<span class="search-meta-copy">登录后可开始搜索。</span>`;
    return;
  }

  const platformLabel = PLATFORM_LABELS[state.searchPlatform];
  if (!state.searchStats) {
    elements.searchMeta.innerHTML = `<span class="search-meta-copy">${escapeHtml(platformLabel)} 已就绪，输入关键词开始搜索。</span>`;
    return;
  }

  const chips = [];
  chips.push(`<span class="tiny-pill">第 ${state.searchPage} / ${getSearchTotalPages()} 页</span>`);
  chips.push(`<span class="tiny-pill">每页 ${state.searchLimit} 条</span>`);
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
    <span class="search-meta-copy">${escapeHtml(platformLabel)} · ${escapeHtml(state.searchStats.keyword)} · 共 ${state.searchTotal} 条</span>
    ${chips.join("")}
  `;
}

function renderSearchPagination() {
  const hasSearchContext = Boolean(state.session && state.searchStats?.keyword);
  elements.searchPagination.classList.toggle("hidden", !hasSearchContext);

  if (!hasSearchContext) {
    return;
  }

  const totalPages = getSearchTotalPages();
  const currentPage = Math.min(Math.max(state.searchPage, 1), totalPages);
  const hasResults = state.searchTotal > 0;
  const start = hasResults ? (currentPage - 1) * state.searchLimit + 1 : 0;
  const end = hasResults ? Math.min(currentPage * state.searchLimit, state.searchTotal) : 0;

  elements.prevPageButton.disabled = currentPage <= 1;
  elements.nextPageButton.disabled = currentPage >= totalPages || !hasResults;
  elements.paginationStatus.textContent = `第 ${currentPage} / ${totalPages} 页`;
  elements.paginationSummary.textContent = hasResults
    ? `显示 ${start}-${end} 条，共 ${state.searchTotal} 条`
    : `共 0 条结果`;
}

function renderSearchResults() {
  elements.searchResults.innerHTML = "";

  if (!state.session) {
    elements.searchResults.innerHTML = `<div class="empty-state"><strong>等待登录</strong><p>登录后即可进入聚合搜索工作台。</p></div>`;
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
      <button class="button button-secondary select-track-button" type="button">选用</button>
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
  renderWorkspaceHeader();
  renderSearchMeta();
  renderSearchResults();
  renderSelectedTrack();
  renderParseResult();
  showToast("已同步", `${item.platformLabel} 的《${item.name}》已同步到右侧，默认音质已切到 ${QUALITY_LABELS[state.recommendedQuality]}。`);
}

function renderSelectedTrack() {
  if (!state.selectedTrack) {
    elements.detailCopy.textContent = "选择歌曲后会自动同步平台、ID 和建议音质。";
    elements.selectedTrack.innerHTML = `<div class="empty-state"><strong>尚未选择歌曲</strong><p>从左侧结果里点选后，平台、歌曲 ID 和建议音质会自动同步到右侧。</p></div>`;
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
    renderWorkspaceHeader();
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
  renderWorkspaceHeader();
}

async function handleSearch(event) {
  event.preventDefault();
  state.searchPage = 1;
  await runSearch({ page: 1 });
}

async function runSearch({ page = state.searchPage, busy = true, silentError = false } = {}) {
  if (!state.session) {
    return showToast("请先登录", "登录后才能搜索。");
  }

  const keyword = elements.keywordInput.value.trim();
  if (!keyword) {
    return showToast("缺少关键词", "请输入歌名、歌手或关键词。");
  }

  const targetPage = Math.max(Number(page) || 1, 1);

  if (busy) {
    setButtonBusy(elements.searchButton, true, "搜索中...");
  }
  try {
    const payload = await requestJson(
      `/api/search?platform=${encodeURIComponent(state.searchPlatform)}&keyword=${encodeURIComponent(keyword)}&page=${targetPage}&limit=${state.searchLimit}`,
      { method: "GET" },
    );
    state.searchResults = payload.items || [];
    state.searchPage = Number(payload.page || targetPage);
    state.searchTotal = Number(payload.total || state.searchResults.length);
    state.searchStats = {
      keyword,
      total: state.searchTotal,
      groups: payload.groups || null,
    };
    renderWorkspaceHeader();
    renderSearchMeta();
    renderSearchResults();
    renderSearchPagination();
  } catch (error) {
    state.searchResults = [];
    state.searchPage = targetPage;
    state.searchTotal = 0;
    state.searchStats = { keyword, total: 0, groups: null };
    renderSearchMeta();
    renderSearchResults();
    renderSearchPagination();
    if (!silentError) {
      showToast("搜索失败", error.message);
    }
  } finally {
    if (busy) {
      setButtonBusy(elements.searchButton, false, "搜索");
    }
  }
}

async function goToSearchPage(nextPage) {
  if (!state.searchStats?.keyword) {
    return;
  }

  const targetPage = Math.min(Math.max(nextPage, 1), getSearchTotalPages());
  if (targetPage === state.searchPage) {
    return;
  }

  await runSearch({ page: targetPage });
}

async function refreshSearchLimitForViewport() {
  const nextLimit = resolveSearchLimit();
  if (nextLimit === state.searchLimit) {
    return;
  }

  state.searchLimit = nextLimit;

  if (!state.session || !state.searchStats?.keyword) {
    renderSearchMeta();
    renderSearchPagination();
    return;
  }

  const nextPage = Math.min(state.searchPage, Math.max(1, Math.ceil(state.searchTotal / nextLimit)));
  await runSearch({ page: nextPage, busy: false, silentError: true });
}

function handleViewportChange() {
  window.clearTimeout(searchViewportTimer);
  searchViewportTimer = window.setTimeout(() => {
    refreshSearchLimitForViewport().catch(() => {
      renderSearchMeta();
      renderSearchPagination();
    });
  }, 180);
}

function clearSelectedTrackIfNeeded() {
  const currentPlatform = elements.platformSelect.value;
  const currentSongId = elements.songIdInput.value.trim();
  const stillMatches = state.selectedTrack
    && state.selectedTrack.platform === currentPlatform
    && state.selectedTrack.id === currentSongId;

  if (stillMatches) return;

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
  renderWorkspaceHeader();
}

function handleSongIdInput() {
  clearSelectedTrackIfNeeded();
  syncQualityState({
    track: state.selectedTrack,
    platform: elements.platformSelect.value,
    autoSelect: !state.selectedTrack,
  });
  renderWorkspaceHeader();
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
      state.searchPage = 1;
      state.searchTotal = 0;
      renderSearchPlatformSwitch();
      renderWorkspaceHeader();
      renderSearchMeta();
      renderSearchResults();
      renderSearchPagination();

      if (state.session && elements.keywordInput.value.trim()) {
        await runSearch({ page: 1 });
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
  renderSearchMeta();
  renderSearchResults();
  renderSearchPagination();
  renderSelectedTrack();
  renderParseResult();
  syncQualityState({ track: null, platform: elements.platformSelect.value, autoSelect: true });

  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.authForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.searchForm.addEventListener("submit", handleSearch);
  elements.prevPageButton.addEventListener("click", () => {
    goToSearchPage(state.searchPage - 1);
  });
  elements.nextPageButton.addEventListener("click", () => {
    goToSearchPage(state.searchPage + 1);
  });
  elements.parseForm.addEventListener("submit", handleParse);
  elements.copyLyricsButton.addEventListener("click", copyLyrics);
  elements.platformSelect.addEventListener("change", handlePlatformChange);
  elements.songIdInput.addEventListener("input", handleSongIdInput);
  window.addEventListener("resize", handleViewportChange);
  bindPlatformSwitch();
  elements.qualityGrid.querySelectorAll(".quality-chip").forEach((button) => {
    button.addEventListener("click", () => setQuality(button.dataset.quality));
  });
  refreshSession().catch(() => {
    renderAuthUi();
  });
}

initialize();
