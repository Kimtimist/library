// ================================
// My Vinyl Library - app.js (Full Rewrite)
// - Modal back gesture closes modal (history pushState + popstate)
// - Pagination shows Prev + 5 pages + Next (Artist + Search)
// - After search submit: blur input + scrollTo top (iOS zoom-out UX)
// ================================

// ===== 1) Load rows from data.js =====
const rows = Array.isArray(window.VINYL_ROWS) ? window.VINYL_ROWS : [];

// rows → { artists, albums, tracks }
function buildDataFromRows(rows) {
  const artistSet = new Set();
  const albumsMap = new Map();
  const tracks = [];

  rows.forEach((r) => {
    const artist = (r.Artist || "").trim();
    const album = (r.Album || "").trim();
    const year = r.Year || null;
    const country = (r.Country || "").trim();
    const genre = (r.Genre || "").trim();
    const location = (r.Location || "").trim();
    const trackNo = (r.Track_no || "").toString().trim();
    const title = (r.Track_title || "").trim();
    const albumNo = r.Album_No || null;

    const tags = (r.Mood_tags || "")
      .split(/\s+/)
      .map((t) => t.replace(/^#/, "").trim())
      .filter(Boolean);

    if (artist) artistSet.add(artist);

    if (artist && album) {
      const key = `${artist}__${album}`;
      if (!albumsMap.has(key)) {
        albumsMap.set(key, {
          artist,
          title: album,
          year,
          country,
          genre,
          tags,
          location,
          albumNo,
        });
      }
    }

    if (artist && album && title) {
      tracks.push({
        artist,
        album,
        title,
        genre,
        tags,
        trackNo,
        note: "",
        location, // track row location (if any)
      });
    }
  });

  return {
    artists: Array.from(artistSet).map((name) => ({ name })),
    albums: Array.from(albumsMap.values()),
    tracks,
  };
}

const data = buildDataFromRows(rows);

// ===== 2) Initial (A-Z / 가-하) =====
const hangulBuckets = ["가","나","다","라","마","바","사","아","자","차","카","타","파","하"];
const latinLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function getHangulBucket(ch) {
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "#";
  const base = code - 0xac00;
  const initialIndex = Math.floor(base / (21 * 28)); // 0~18

  if (initialIndex === 0 || initialIndex === 1) return "가";
  if (initialIndex === 2) return "나";
  if (initialIndex === 3 || initialIndex === 4) return "다";
  if (initialIndex === 5) return "라";
  if (initialIndex === 6) return "마";
  if (initialIndex === 7 || initialIndex === 8) return "바";
  if (initialIndex === 9 || initialIndex === 10) return "사";
  if (initialIndex === 11) return "아";
  if (initialIndex === 12 || initialIndex === 13) return "자";
  if (initialIndex === 14) return "차";
  if (initialIndex === 15) return "카";
  if (initialIndex === 16) return "타";
  if (initialIndex === 17) return "파";
  if (initialIndex === 18) return "하";
  return "#";
}

function getArtistInitial(name) {
  const first = (name || "").trim()[0];
  if (!first) return "#";

  if ((first >= "A" && first <= "Z") || (first >= "a" && first <= "z")) {
    return first.toUpperCase();
  }

  const code = first.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return getHangulBucket(first);

  return "#";
}

function isLatinName(name) {
  const first = (name || "").trim()[0] || "";
  return /[A-Za-z]/.test(first);
}

const artistsWithInitial = data.artists.map((a) => ({
  ...a,
  initial: getArtistInitial(a.name),
}));

// ===== 3) DOM refs =====
const explorerCard = document.getElementById("explorerCard");
const artistView = document.getElementById("artistView");
const albumView = document.getElementById("albumView");
const trackView = document.getElementById("trackView");

const latinRow = document.getElementById("latinRow");
const hangulRow = document.getElementById("hangulRow");

const artistListEl = document.getElementById("artistList");
const artistPrevBtn = document.getElementById("artistPrev");
const artistNextBtn = document.getElementById("artistNext");
const artistPagesEl = document.getElementById("artistPages");

const albumArtistTitle = document.getElementById("albumArtistTitle");
const albumListPageEl = document.getElementById("albumListPage");

const trackAlbumTitle = document.getElementById("trackAlbumTitle");
const trackListPageEl = document.getElementById("trackListPage");

const backToArtistsBtn = document.getElementById("backToArtists");
const backToAlbumsBtn = document.getElementById("backToAlbums");

const searchCard = document.getElementById("searchCard");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const resultsEl = document.getElementById("results");
const searchInfoEl = document.getElementById("searchInfo");
const searchPaginationEl = document.getElementById("searchPagination");

const homeButton = document.getElementById("homeButton");

// modal refs
const modalEl = document.getElementById("trackModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const mArtist = document.getElementById("mArtist");
const mAlbum = document.getElementById("mAlbum");
const mGenre = document.getElementById("mGenre");
const mLocation = document.getElementById("mLocation");
const mTrackNo = document.getElementById("mTrackNo");
const mTitle = document.getElementById("mTitle");
const mNote = document.getElementById("mNote");
const mTags = document.getElementById("mTags");

// ===== 4) State =====
let activeInitial = "";
let currentArtistPage = 1;
const ARTIST_PAGE_SIZE = 15;

let selectedArtistName = null;
let selectedAlbumKey = null; // `${artist}__${album}`
let currentView = "artists"; // 'artists' | 'albums' | 'tracks' | 'search'

// search state
let currentSearchResults = [];
let currentSearchPage = 1;
const SEARCH_PAGE_SIZE = 30;

// modal history state
let modalHistoryPushed = false;

// ===== 5) View control =====
function setView(view) {
  currentView = view;

  if (view === "search") {
    explorerCard.style.display = "none";
    searchCard.style.display = "block";
  } else {
    explorerCard.style.display = "block";
    searchCard.style.display = "none";
  }

  artistView.style.display = view === "artists" ? "block" : "none";
  albumView.style.display = view === "albums" ? "block" : "none";
  trackView.style.display = view === "tracks" ? "block" : "none";
}

// ===== 6) Router (hash) helpers =====
function navigateToArtists() {
  location.hash = "#artists";
}

function navigateToAlbums(artist) {
  const encodedArtist = encodeURIComponent(artist);
  location.hash = `#albums/${encodedArtist}`;
}

function navigateToTracks(artist, album) {
  const encodedArtist = encodeURIComponent(artist);
  const encodedAlbum = encodeURIComponent(album);
  location.hash = `#tracks/${encodedArtist}/${encodedAlbum}`;
}

function navigateToSearch(query) {
  const q = (query || "").trim();
  if (!q) {
    navigateToArtists();
    return;
  }
  location.hash = `#search/${encodeURIComponent(q)}`;
}

// ===== 7) Modal control (Requirement #1) =====
function openTrackModal(info) {
  mArtist.textContent = info.artist || "";
  mAlbum.textContent = info.album || "";
  mGenre.textContent = info.genre || "";
  mLocation.textContent = info.location || "";
  mTrackNo.textContent = info.trackNo || "";
  mTitle.textContent = info.title || "";
  mNote.textContent = info.note || "";

  mTags.innerHTML = "";
  (info.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = "#" + tag;
    mTags.appendChild(span);
  });

  modalEl.classList.add("show");

  // ✅ push history state so "back" closes modal
  // (do not change hash)
  if (!modalHistoryPushed) {
    history.pushState({ modal: "track" }, "");
    modalHistoryPushed = true;
  }
}

function closeTrackModal({ fromPopstate = false, skipHistoryBack = false } = {}) {
  if (!modalEl.classList.contains("show")) {
    modalHistoryPushed = false;
    return;
  }

  modalEl.classList.remove("show");

  // 모달을 수동으로 닫는 경우에만(= X 버튼/배경 클릭)
  // 그리고 라우트 변경/렌더링 중이면 skipHistoryBack=true로 막는다.
  if (!fromPopstate && !skipHistoryBack) {
    if (modalHistoryPushed && history.state && history.state.modal === "track") {
      history.back();
    }
  }

  modalHistoryPushed = false;
}

// popstate: if modal is open, close it and stop there
window.addEventListener("popstate", () => {
  if (modalEl.classList.contains("show")) {
    closeTrackModal({ fromPopstate: true });
    // modalHistoryPushed reset happens inside close
  } else {
    modalHistoryPushed = false;
  }
});

modalCloseBtn.addEventListener("click", () => closeTrackModal({ fromPopstate: false }));
modalEl.addEventListener("click", (e) => {
  if (e.target === modalEl) closeTrackModal({ fromPopstate: false });
});

// ===== 8) Initial buttons =====
function renderInitialButtons() {
  latinRow.innerHTML = "";
  latinLetters.forEach((ch) => {
    const btn = document.createElement("button");
    btn.textContent = ch;
    btn.className = "az-button" + (activeInitial === ch ? " active" : "");
    btn.addEventListener("click", () => {
      activeInitial = activeInitial === ch ? "" : ch;
      currentArtistPage = 1;
      renderInitialButtons();
      renderArtistList();
    });
    latinRow.appendChild(btn);
  });

  hangulRow.innerHTML = "";
  hangulBuckets.forEach((ch) => {
    const btn = document.createElement("button");
    btn.textContent = ch;
    btn.className = "az-button" + (activeInitial === ch ? " active" : "");
    btn.addEventListener("click", () => {
      activeInitial = activeInitial === ch ? "" : ch;
      currentArtistPage = 1;
      renderInitialButtons();
      renderArtistList();
    });
    hangulRow.appendChild(btn);
  });
}

// ===== 9) Pagination window helper (Requirement #2) =====
function calcPageWindow(current, total, maxVisible = 5) {
  const half = Math.floor(maxVisible / 2);

  let start = Math.max(1, current - half);
  let end = Math.min(total, start + maxVisible - 1);

  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1);
  }

  return { start, end };
}

// ===== 10) Artists list + pagination =====
function getFilteredSortedArtists() {
  return artistsWithInitial
    .filter((a) => (activeInitial ? a.initial === activeInitial : true))
    .sort((a, b) => {
      const aLatin = isLatinName(a.name);
      const bLatin = isLatinName(b.name);
      if (aLatin && !bLatin) return -1;
      if (!aLatin && bLatin) return 1;
      return a.name.localeCompare(b.name, "ko");
    });
}

function renderArtistList() {
  artistListEl.innerHTML = "";

  const listAll = getFilteredSortedArtists();
  const total = listAll.length;
  const totalPages = Math.max(1, Math.ceil(total / ARTIST_PAGE_SIZE));
  if (currentArtistPage > totalPages) currentArtistPage = totalPages;

  const startIdx = (currentArtistPage - 1) * ARTIST_PAGE_SIZE;
  const pageList = listAll.slice(startIdx, startIdx + ARTIST_PAGE_SIZE);

  if (pageList.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "해당 이니셜의 아티스트가 없습니다.";
    empty.style.fontSize = "12px";
    empty.style.color = "#9ca3af";
    artistListEl.appendChild(empty);
  } else {
    const albumCountByArtist = {};
    data.albums.forEach((al) => {
      albumCountByArtist[al.artist] = (albumCountByArtist[al.artist] || 0) + 1;
    });

    pageList.forEach((a) => {
      const row = document.createElement("div");
      row.className = "artist-item" + (selectedArtistName === a.name ? " selected" : "");

      const left = document.createElement("div");
      left.className = "artist-name";
      left.textContent = a.name;

      const right = document.createElement("div");
      right.className = "artist-meta";
      right.textContent = (albumCountByArtist[a.name] || 0) + " albums";

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener("click", () => navigateToAlbums(a.name));

      artistListEl.appendChild(row);
    });
  }

  // ✅ Pagination: Prev + 5 pages + Next
  artistPagesEl.innerHTML = "";

  if (totalPages <= 1) {
    artistPrevBtn.disabled = true;
    artistNextBtn.disabled = true;
    return;
  }

  const { start, end } = calcPageWindow(currentArtistPage, totalPages, 5);

  for (let p = start; p <= end; p++) {
    const btn = document.createElement("button");
    btn.textContent = p;
    btn.className = "page-num" + (p === currentArtistPage ? " active" : "");
    btn.addEventListener("click", () => {
      currentArtistPage = p;
      renderArtistList();
      window.scrollTo(0, 0);
    });
    artistPagesEl.appendChild(btn);
  }

  artistPrevBtn.disabled = currentArtistPage <= 1;
  artistNextBtn.disabled = currentArtistPage >= totalPages;
}

artistPrevBtn.addEventListener("click", () => {
  if (currentArtistPage > 1) {
    currentArtistPage--;
    renderArtistList();
    window.scrollTo(0, 0);
  }
});

artistNextBtn.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(getFilteredSortedArtists().length / ARTIST_PAGE_SIZE));
  if (currentArtistPage < totalPages) {
    currentArtistPage++;
    renderArtistList();
    window.scrollTo(0, 0);
  }
});

// ===== 11) Album page =====
function renderAlbumPage() {
  albumListPageEl.innerHTML = "";

  if (!selectedArtistName) {
    albumArtistTitle.textContent = "Artist";
    albumListPageEl.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">아티스트를 먼저 선택하세요.</div>';
    return;
  }

  albumArtistTitle.textContent = selectedArtistName;

  const albums = data.albums.filter((al) => al.artist === selectedArtistName);
  if (albums.length === 0) {
    albumListPageEl.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">등록된 앨범이 없습니다.</div>';
    return;
  }

  albums.forEach((al) => {
    const key = `${al.artist}__${al.title}`;

    const item = document.createElement("div");
    item.className = "album-item" + (selectedAlbumKey === key ? " selected" : "");

    const main = document.createElement("div");
    main.className = "album-main";
    main.textContent = al.title;

    const sub = document.createElement("div");
    sub.className = "album-sub";
    sub.textContent = `${al.artist} · ${al.year || ""} · ${al.genre || ""}`;

    item.appendChild(main);
    item.appendChild(sub);

    item.addEventListener("click", () => navigateToTracks(al.artist, al.title));

    albumListPageEl.appendChild(item);
  });
}

// ===== 12) Track page =====
function renderTrackPage() {
  trackListPageEl.innerHTML = "";

  if (!selectedAlbumKey) {
    trackAlbumTitle.textContent = "Album";
    trackListPageEl.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">앨범을 먼저 선택하세요.</div>';
    return;
  }

  const [artistName, albumTitle] = selectedAlbumKey.split("__");

  const albumInfo = data.albums.find((al) => al.artist === artistName && al.title === albumTitle);
  trackAlbumTitle.textContent = `${artistName} – ${albumTitle}`;

  const tracks = data.tracks.filter((t) => t.artist === artistName && t.album === albumTitle);

  if (tracks.length === 0) {
    trackListPageEl.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">등록된 트랙이 없습니다.</div>';
    return;
  }

  tracks.forEach((t) => {
    const item = document.createElement("div");
    item.className = "track-item";

    const main = document.createElement("div");
    main.className = "track-main";
    main.textContent = t.title;

    const sub = document.createElement("div");
    sub.className = "track-sub";
    sub.textContent = `${t.artist} – ${t.album} · ${t.genre || ""}`;

    item.appendChild(main);
    item.appendChild(sub);

    const info = {
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      tags: t.tags,
      location: albumInfo ? albumInfo.location : (t.location || ""),
      trackNo: t.trackNo,
      title: t.title,
      note: t.note || "",
    };

    item.addEventListener("click", () => openTrackModal(info));

    trackListPageEl.appendChild(item);
  });
}

// Back buttons
backToArtistsBtn.addEventListener("click", () => navigateToArtists());
backToAlbumsBtn.addEventListener("click", () => {
  if (selectedArtistName) navigateToAlbums(selectedArtistName);
  else navigateToArtists();
});

// ===== 13) Search =====
function getActiveFilters() {
  const filters = { artist: false, album: false, genre: false, tag: false, song: false };

  document.querySelectorAll("[data-filter]").forEach((input) => {
    const key = input.getAttribute("data-filter");
    filters[key] = input.checked;

    const label = input.closest(".filter-chip");
    if (label) {
      if (input.checked) label.classList.add("filter-chip-active");
      else label.classList.remove("filter-chip-active");
    }
  });

  // if all off -> turn all on
  if (!filters.artist && !filters.album && !filters.genre && !filters.tag && !filters.song) {
    Object.keys(filters).forEach((k) => (filters[k] = true));
    document.querySelectorAll("[data-filter]").forEach((input) => {
      input.checked = true;
      const label = input.closest(".filter-chip");
      if (label) label.classList.add("filter-chip-active");
    });
  }

  return filters;
}

function runSearch(rawQuery) {
  const qStr = typeof rawQuery === "string" ? rawQuery : searchInput.value;
  const displayQ = qStr.trim();
  const q = displayQ.toLowerCase();
  const filters = getActiveFilters();

  currentSearchResults = [];
  currentSearchPage = 1;
  resultsEl.innerHTML = "";
  if (searchPaginationEl) searchPaginationEl.innerHTML = "";

  if (!q) {
    searchInfoEl.textContent = "검색어를 입력하거나 필터를 조정해보세요.";
    return;
  }

  const results = [];

  // Artist
  if (filters.artist) {
    artistsWithInitial.forEach((a) => {
      if (a.name.toLowerCase().includes(q)) {
        results.push({
          type: "Artist",
          main: a.name,
          sub: "이 아티스트의 앨범과 곡을 탐색하세요.",
          tags: [],
        });
      }
    });
  }

  // Album / Genre / Tag / Artist hit on album
  if (filters.album || filters.genre || filters.tag || filters.artist) {
    data.albums.forEach((al) => {
      const hayAlbum = al.title.toLowerCase();
      const hayArtist = al.artist.toLowerCase();
      const hayGenre = (al.genre || "").toLowerCase();
      const hayTags = (al.tags || []).map((t) => t.toLowerCase());

      let hit = false;
      if (filters.album && hayAlbum.includes(q)) hit = true;
      if (filters.artist && hayArtist.includes(q)) hit = true;
      if (filters.genre && hayGenre.includes(q)) hit = true;
      if (filters.tag && hayTags.some((t) => t.includes(q.replace(/^#/, "")))) hit = true;

      if (hit) {
        results.push({
          type: "Album",
          main: `${al.artist} – ${al.title}`,
          sub: `${al.year || ""} · ${al.genre || ""} · ${al.country || ""}`,
          tags: al.tags || [],
          artist: al.artist,
          album: al.title,
        });
      }
    });
  }

  // Song
  if (filters.song || filters.artist || filters.album || filters.genre || filters.tag) {
    data.tracks.forEach((t) => {
      const haySong = t.title.toLowerCase();
      const hayArtist = t.artist.toLowerCase();
      const hayAlbum = t.album.toLowerCase();
      const hayGenre = (t.genre || "").toLowerCase();
      const hayTags = (t.tags || []).map((x) => x.toLowerCase());

      let hit = false;
      if (filters.song && haySong.includes(q)) hit = true;
      if (filters.artist && hayArtist.includes(q)) hit = true;
      if (filters.album && hayAlbum.includes(q)) hit = true;
      if (filters.genre && hayGenre.includes(q)) hit = true;
      if (filters.tag && hayTags.some((tag) => tag.includes(q.replace(/^#/, "")))) hit = true;

      if (hit) {
        results.push({
          type: "Song",
          main: t.title,
          sub: `${t.artist} – ${t.album} · ${t.genre || ""}`,
          tags: t.tags || [],
          artist: t.artist,
          album: t.album,
        });
      }
    });
  }

  if (results.length === 0) {
    searchInfoEl.textContent = `"${displayQ}"에 해당하는 결과가 없습니다.`;
    currentSearchResults = [];
    if (searchPaginationEl) searchPaginationEl.innerHTML = "";
    return;
  }

  currentSearchResults = results;
  searchInfoEl.textContent = `"${displayQ}" 검색 결과: ${results.length}개`;
  renderSearchResultsPage();
}

function renderSearchResultsPage() {
  resultsEl.innerHTML = "";

  const total = currentSearchResults.length;
  if (total === 0) {
    if (searchInput.value.trim()) {
      searchInfoEl.textContent = `"${searchInput.value.trim()}"에 해당하는 결과가 없습니다.`;
    } else {
      searchInfoEl.textContent = "검색어를 입력하거나 필터를 조정해보세요.";
    }
    if (searchPaginationEl) searchPaginationEl.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  if (currentSearchPage > totalPages) currentSearchPage = totalPages;

  const startIdx = (currentSearchPage - 1) * SEARCH_PAGE_SIZE;
  const pageList = currentSearchResults.slice(startIdx, startIdx + SEARCH_PAGE_SIZE);

  pageList.forEach((r) => {
    const item = document.createElement("div");
    item.className = "result-item";

    const typeEl = document.createElement("div");
    typeEl.className = "result-type";
    typeEl.textContent = r.type;

    if (r.type === "Artist") typeEl.classList.add("result-type-artist");
    if (r.type === "Album") typeEl.classList.add("result-type-album");
    if (r.type === "Song") typeEl.classList.add("result-type-song");

    const mainEl = document.createElement("div");
    mainEl.className = "result-main";
    mainEl.textContent = r.main;

    const subEl = document.createElement("div");
    subEl.className = "result-sub";
    subEl.textContent = r.sub;

    item.appendChild(typeEl);
    item.appendChild(mainEl);
    item.appendChild(subEl);

    if (r.tags && r.tags.length) {
      const tagWrap = document.createElement("div");
      r.tags.forEach((tag) => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = "#" + tag;
        tagWrap.appendChild(span);
      });
      item.appendChild(tagWrap);
    }

    item.addEventListener("click", () => {
      if (r.type === "Artist") {
        navigateToAlbums(r.main);
      } else if (r.type === "Album") {
        navigateToTracks(r.artist, r.album);
      } else if (r.type === "Song") {
        const albumInfo = data.albums.find((al) => al.artist === r.artist && al.title === r.album);
        const track = data.tracks.find((t) => t.artist === r.artist && t.album === r.album && t.title === r.main);
        if (track) {
          openTrackModal({
            artist: track.artist,
            album: track.album,
            genre: track.genre,
            tags: track.tags,
            location: albumInfo ? albumInfo.location : (track.location || ""),
            trackNo: track.trackNo,
            title: track.title,
            note: track.note || "",
          });
        }
      }
    });

    resultsEl.appendChild(item);
  });

  // ✅ Search Pagination: Prev + 5 pages + Next (same UX as Artist)
  if (!searchPaginationEl) return;
  searchPaginationEl.innerHTML = "";

  if (totalPages <= 1) return;

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Prev";
  prevBtn.className = "search-page-btn";
  prevBtn.disabled = currentSearchPage <= 1;
  prevBtn.addEventListener("click", () => {
    if (currentSearchPage > 1) {
      currentSearchPage--;
      renderSearchResultsPage();
      window.scrollTo(0, 0);
    }
  });
  searchPaginationEl.appendChild(prevBtn);

  const { start, end } = calcPageWindow(currentSearchPage, totalPages, 5);
  for (let p = start; p <= end; p++) {
    const btn = document.createElement("button");
    btn.textContent = p;
    btn.className = "search-page-num" + (p === currentSearchPage ? " active" : "");
    btn.addEventListener("click", () => {
      currentSearchPage = p;
      renderSearchResultsPage();
      window.scrollTo(0, 0);
    });
    searchPaginationEl.appendChild(btn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.className = "search-page-btn";
  nextBtn.disabled = currentSearchPage >= totalPages;
  nextBtn.addEventListener("click", () => {
    if (currentSearchPage < totalPages) {
      currentSearchPage++;
      renderSearchResultsPage();
      window.scrollTo(0, 0);
    }
  });
  searchPaginationEl.appendChild(nextBtn);
}

// ===== 14) Search submit handlers (Requirement #3) =====
function afterSearchSubmitUX() {
  // iOS zoom-in after focus: blur forces "zoom-out" to normal view
  searchInput.blur();
  // bring top (prevents weird partial zoomed viewport state)
  window.scrollTo(0, 0);
}

// Search button click
searchButton.addEventListener("click", () => {
  const q = searchInput.value.trim();
  navigateToSearch(q);
  afterSearchSubmitUX();
});

// Enter key
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = searchInput.value.trim();
    navigateToSearch(q);
    afterSearchSubmitUX();
  }
});

// If input cleared while in search view, go back to artists
searchInput.addEventListener("input", () => {
  if (!searchInput.value.trim() && currentView === "search") {
    navigateToArtists();
  }
});

// Filter change: rerun if in search
document.querySelectorAll("[data-filter]").forEach((input) => {
  input.addEventListener("change", () => {
    getActiveFilters();
    if (currentView === "search" && searchInput.value.trim()) {
      runSearch(searchInput.value);
      window.scrollTo(0, 0);
    }
  });
});

// ===== 15) Home button (full reset) =====
homeButton.addEventListener("click", () => {
  // close modal if open
  if (modalEl.classList.contains("show")) closeTrackModal({ fromPopstate: false });

  // reset search
  searchInput.value = "";
  currentSearchResults = [];
  currentSearchPage = 1;
  resultsEl.innerHTML = "";
  searchInfoEl.textContent = "검색어를 입력하거나 필터를 조정해보세요.";
  if (searchPaginationEl) searchPaginationEl.innerHTML = "";

  // set all filters ON
  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.checked = true;
    const label = input.closest(".filter-chip");
    if (label) label.classList.add("filter-chip-active");
  });

  // reset selection + initial + paging
  activeInitial = "";
  currentArtistPage = 1;
  selectedArtistName = null;
  selectedAlbumKey = null;

  renderInitialButtons();
  renderArtistList();

  location.hash = "#artists";
  window.scrollTo(0, 0);
});

// ===== 16) Mobile right-swipe (your custom gesture) =====
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

function handleTouchStart(e) {
  if (!e.touches || e.touches.length === 0) return;
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
  touchEndX = t.clientX;
  touchEndY = t.clientY;
}

function handleTouchMove(e) {
  if (!e.touches || e.touches.length === 0) return;
  const t = e.touches[0];
  touchEndX = t.clientX;
  touchEndY = t.clientY;
}

function handleTouchEnd() {
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // right swipe only (avoid vertical scroll)
  if (absDx > 50 && absDx > absDy && dx > 0) {
    handleSwipeRight();
  }
}

function handleSwipeRight() {
  // if modal open: close first (no navigation)
  if (modalEl.classList.contains("show")) {
    closeTrackModal({ fromPopstate: false });
    return;
  }

  // if not at root: back
  if (location.hash && location.hash !== "#artists") {
    history.back();
  }
}

const pageEl = document.querySelector(".page") || document.body;
pageEl.addEventListener("touchstart", handleTouchStart, { passive: true });
pageEl.addEventListener("touchmove", handleTouchMove, { passive: true });
pageEl.addEventListener("touchend", handleTouchEnd);

// ===== 17) Hash router =====
function applyRouteFromHash() {
  let hash = location.hash || "";

  if (!hash || hash === "#") {
    setView("artists");
    selectedArtistName = null;
    selectedAlbumKey = null;
    return;
  }

  hash = hash.replace(/^#/, "");
  const parts = hash.split("/");
  const route = parts[0];

  // 라우트 전환 중에는 history.back()이 실행되면 안 됨
  if (modalEl.classList.contains("show")) closeTrackModal({ skipHistoryBack: true });

  if (route === "artists") {
    setView("artists");
    selectedArtistName = null;
    selectedAlbumKey = null;

    // reset search UI only
    searchInput.value = "";
    resultsEl.innerHTML = "";
    searchInfoEl.textContent = "검색어를 입력하거나 필터를 조정해보세요.";
    if (searchPaginationEl) searchPaginationEl.innerHTML = "";
  } else if (route === "albums") {
    const artist = decodeURIComponent(parts[1] || "");
    selectedArtistName = artist || null;
    selectedAlbumKey = null;
    setView("albums");
    renderAlbumPage();
    window.scrollTo(0, 0);
  } else if (route === "tracks") {
    const artist = decodeURIComponent(parts[1] || "");
    const album = decodeURIComponent(parts[2] || "");
    selectedArtistName = artist || null;
    selectedAlbumKey = artist && album ? `${artist}__${album}` : null;
    setView("tracks");
    renderTrackPage();
    window.scrollTo(0, 0);
  } else if (route === "search") {
    const qEncoded = parts.slice(1).join("/");
    const q = decodeURIComponent(qEncoded || "");
    searchInput.value = q;
    setView("search");
    runSearch(q);
    // keep UX stable on iOS
    afterSearchSubmitUX();
  } else {
    navigateToArtists();
  }
}

window.addEventListener("hashchange", applyRouteFromHash);

// ===== 18) Initial render =====
renderInitialButtons();
renderArtistList();

if (!location.hash) {
  location.hash = "#artists";
} else {
  applyRouteFromHash();
}
