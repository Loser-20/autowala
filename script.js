/* ============================================================
   Autowala Radio — player logic
   ------------------------------------------------------------
   Songs are NEVER hard-coded here. The list is pulled live from
   the repo's "Songs" folder via the GitHub API every time the
   page loads (with a short local cache to stay fast + avoid
   rate limits). Add or delete an .mp3 in that folder on GitHub
   and the site picks it up automatically — no code edits, ever.
   ============================================================ */

(() => {
  "use strict";

  // ---- Configure this to match your repo -------------------
  const GITHUB_USER = "Loser-20";
  const GITHUB_REPO = "autowala";
  const GITHUB_BRANCH = "main";
  const SONGS_FOLDER = "Songs";
  // ------------------------------------------------------------

  const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${SONGS_FOLDER}?ref=${GITHUB_BRANCH}`;
  const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg"];
  const CACHE_KEY = "autowala_radio_songs_v1";
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  // ---- DOM refs ----------------------------------------------
  const $ = (id) => document.getElementById(id);

  const audio          = $("audio");
  const cover          = $("cover");
  const songTitleEl    = $("songTitle");
  const songArtistEl   = $("songArtist");
  const seek           = $("seek");
  const progressFill   = $("progressFill");
  const timeCurrent    = $("timeCurrent");
  const timeTotal      = $("timeTotal");
  const playBtn        = $("playBtn");
  const playIcon       = $("playIcon");
  const prevBtn        = $("prevBtn");
  const nextBtn        = $("nextBtn");
  const shuffleBtn     = $("shuffleBtn");
  const repeatBtn      = $("repeatBtn");
  const playlistBtn    = $("playlistBtn");
  const playlistPanel  = $("playlistPanel");
  const playlistList   = $("playlistList");
  const songCountEl    = $("songCount");
  const statusLine     = $("statusLine");
  const statusLabel    = $("statusLabel");
  const clockValue     = $("clockValue");
  const listenerCount  = $("listenerCount");

  const ICON_PLAY  = '<path d="M8 5v14l11-7z"/>';
  const ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';

  // ---- State ---------------------------------------------------
  let songs = [];          // [{ name, title, url }]
  let playOrder = [];      // indices, reshuffled when shuffle toggles
  let orderPos = 0;        // position within playOrder
  let isShuffle = false;
  let isRepeat = true;
  let hasStarted = false;

  // ==============================================================
  // 1. Discover songs live from the GitHub folder
  // ==============================================================

  function titleFromFilename(filename) {
    const noExt = filename.replace(/\.[^/.]+$/, "");
    return decodeURIComponent(noExt).replace(/[_-]+/g, " ").trim();
  }

  function isAudioFile(name) {
    const lower = name.toLowerCase();
    return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCache(list) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), list }));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }

  async function fetchSongsFromGitHub() {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      throw new Error(`GitHub API responded ${res.status}`);
    }
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error("Unexpected API response");

    return items
      .filter((item) => item.type === "file" && isAudioFile(item.name))
      .map((item) => ({
        name: item.name,
        title: titleFromFilename(item.name),
        // Relative path works when hosted alongside the Songs folder
        // (e.g. GitHub Pages from this same repo).
        url: `${SONGS_FOLDER}/${encodeURIComponent(item.name)}`,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
  }

  async function loadSongs() {
    const cached = readCache();
    const cacheIsFresh = cached && Date.now() - cached.ts < CACHE_TTL_MS;

    if (cacheIsFresh) {
      songs = cached.list;
      finishLoading();
      // still refresh quietly in the background so long sessions stay current
      refreshInBackground();
      return;
    }

    try {
      songs = await fetchSongsFromGitHub();
      writeCache(songs);
      finishLoading();
    } catch (err) {
      if (cached && cached.list && cached.list.length) {
        songs = cached.list;
        setStatus("लाइव्ह यादी मिळाली नाही, जुनी यादी दाखवत आहे.", true);
        finishLoading(true);
      } else {
        setStatus("गाणी लोड होऊ शकली नाहीत. GitHub शी कनेक्शन तपासा.", true);
        songTitleEl.textContent = "गाणी सापडली नाहीत";
        songArtistEl.textContent = "Songs फोल्डर तपासा";
      }
    }
  }

  async function refreshInBackground() {
    try {
      const fresh = await fetchSongsFromGitHub();
      const changed = JSON.stringify(fresh) !== JSON.stringify(songs);
      writeCache(fresh);
      if (changed) {
        songs = fresh;
        renderPlaylist();
        songCountEl.textContent = `${songs.length} गाणी`;
      }
    } catch {
      /* silent — we already have a usable list */
    }
  }

  function finishLoading(isStale) {
    if (!songs.length) {
      setStatus("Songs फोल्डरमध्ये अजून गाणी नाहीत.", true);
      songTitleEl.textContent = "गाणी उपलब्ध नाहीत";
      songArtistEl.textContent = "Songs/ मध्ये mp3 टाका";
      return;
    }
    buildPlayOrder();
    renderPlaylist();
    songCountEl.textContent = `${songs.length} गाणी`;
    if (!isStale) setStatus("");
    loadTrack(playOrder[0], { autoplay: false });
  }

  function setStatus(msg, isError) {
    statusLine.textContent = msg || "";
    statusLine.classList.toggle("is-error", !!isError);
  }

  // ==============================================================
  // 2. Playback engine
  // ==============================================================

  function buildPlayOrder() {
    const indices = songs.map((_, i) => i);
    playOrder = isShuffle ? shuffleArray(indices) : indices;
    orderPos = 0;
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function loadTrack(songIndex, { autoplay } = { autoplay: true }) {
    const song = songs[songIndex];
    if (!song) return;

    orderPos = playOrder.indexOf(songIndex);
    audio.src = song.url;
    songTitleEl.textContent = song.title;
    songArtistEl.textContent = "ऑटोवाला रेडिओ";
    seek.value = 0;
    progressFill.style.width = "0%";
    timeCurrent.textContent = "0:00";
    timeTotal.textContent = "0:00";
    highlightActiveTrack(songIndex);

    if (autoplay) {
      audio.play().catch(() => setStatus("Play दाबा गाणं सुरू करण्यासाठी.", false));
    }
  }

  function currentSongIndex() {
    return playOrder[orderPos];
  }

  function togglePlay() {
    if (!songs.length) return;
    if (!hasStarted) {
      hasStarted = true;
      loadTrack(playOrder[0]);
      return;
    }
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function playNext() {
    if (!songs.length) return;
    orderPos = (orderPos + 1) % playOrder.length;
    loadTrack(currentSongIndex());
  }

  function playPrev() {
    if (!songs.length) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    orderPos = (orderPos - 1 + playOrder.length) % playOrder.length;
    loadTrack(currentSongIndex());
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // ---- Audio element events ------------------------------------
  audio.addEventListener("play", () => {
    playIcon.innerHTML = ICON_PAUSE;
    playBtn.setAttribute("aria-label", "Pause");
    cover.classList.add("is-playing");
    statusLabel.textContent = "आत्ता वाजतंय · NOW PLAYING";
  });

  audio.addEventListener("pause", () => {
    playIcon.innerHTML = ICON_PLAY;
    playBtn.setAttribute("aria-label", "Play");
    cover.classList.remove("is-playing");
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    seek.value = pct;
    progressFill.style.width = pct + "%";
    timeCurrent.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener("loadedmetadata", () => {
    timeTotal.textContent = formatTime(audio.duration);
  });

  audio.addEventListener("ended", () => {
    if (isRepeat || orderPos < playOrder.length - 1) {
      playNext();
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("error", () => {
    if (songs.length) setStatus("हे गाणं चालू शकलं नाही, पुढचं वाजवत आहे…", true);
    setTimeout(playNext, 800);
  });

  // ---- Controls ---------------------------------------------------
  playBtn.addEventListener("click", togglePlay);
  nextBtn.addEventListener("click", playNext);
  prevBtn.addEventListener("click", playPrev);

  seek.addEventListener("input", () => {
    if (!audio.duration) return;
    audio.currentTime = (seek.value / 100) * audio.duration;
  });

  shuffleBtn.addEventListener("click", () => {
    isShuffle = !isShuffle;
    shuffleBtn.setAttribute("aria-pressed", String(isShuffle));
    const current = currentSongIndex();
    buildPlayOrder();
    if (isShuffle) {
      // keep the currently playing song at the front of the new order
      playOrder = [current, ...playOrder.filter((i) => i !== current)];
    }
    orderPos = playOrder.indexOf(current);
  });

  repeatBtn.addEventListener("click", () => {
    isRepeat = !isRepeat;
    repeatBtn.setAttribute("aria-pressed", String(isRepeat));
  });

  playlistBtn.addEventListener("click", () => {
    const isOpen = !playlistPanel.hidden;
    playlistPanel.hidden = isOpen;
    playlistBtn.setAttribute("aria-pressed", String(!isOpen));
  });

  // ---- Keyboard shortcuts ------------------------------------------
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.code === "ArrowRight") playNext();
    if (e.code === "ArrowLeft") playPrev();
  });

  // ==============================================================
  // 3. Playlist panel
  // ==============================================================

  function renderPlaylist() {
    playlistList.innerHTML = "";
    songs.forEach((song, i) => {
      const li = document.createElement("li");
      li.className = "track";
      li.dataset.index = String(i);
      li.innerHTML = `
        <span class="track__num mono">${String(i + 1).padStart(2, "0")}</span>
        <span class="track__name">${escapeHtml(song.title)}</span>
        <span class="track__eq"><span></span><span></span><span></span></span>
      `;
      li.addEventListener("click", () => {
        hasStarted = true;
        loadTrack(i);
      });
      playlistList.appendChild(li);
    });
  }

  function highlightActiveTrack(index) {
    playlistList.querySelectorAll(".track").forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.index) === index);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ==============================================================
  // 4. Clock + ambient "listeners" counter
  // ==============================================================

  function updateClock() {
    const now = new Date();
    clockValue.textContent = now.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour12: false,
    });
  }
  updateClock();
  setInterval(updateClock, 1000);

  let listeners = 40 + Math.floor(Math.random() * 30);
  function updateListeners() {
    listenerCount.textContent = listeners;
    const drift = Math.floor(Math.random() * 5) - 2;
    listeners = Math.min(140, Math.max(14, listeners + drift));
  }
  updateListeners();
  setInterval(updateListeners, 4000 + Math.random() * 3000);

  // ==============================================================
  // Boot
  // ==============================================================
  loadSongs();
})();
