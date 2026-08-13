// ===================== সম্পূর্ণ app.js কোড =====================

import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db, YOUTUBE_API_KEY } from "./config.js";
import { Player } from "./player.js";

// ===== CATEGORY ORDER =====
const CATEGORY_ORDER = [
  'SPORTS',
  'AKASH GO',
  'INDIAN',
  'MUSIC',
  'KIDS CHANNEL',
  'OTHERS'
];

const CATEGORY_MAP = {};

function normalizeCategory(cat) {
  if (!cat) return 'OTHERS';
  const upper = cat.trim().toUpperCase();
  if (CATEGORY_MAP[upper]) return CATEGORY_MAP[upper];
  for (const orderCat of CATEGORY_ORDER) {
    if (orderCat.toUpperCase() === upper) {
      return orderCat;
    }
  }
  return 'OTHERS';
}

const UI = {
  appShell: document.getElementById('app-shell'),
  playerPageView: document.getElementById('player-page-view'),
  pages: document.querySelectorAll('.page-content'),
  bannerContainer: document.getElementById('banner-container'),
  gridPageView: document.getElementById('grid-page-view'),
  gridPageTitle: document.getElementById('grid-page-title'),
  gridPageContent: document.getElementById('grid-page-content'),
  searchOverlay: document.getElementById('search-overlay'),
  searchInput: document.getElementById('search-input'),
  searchResultsContainer: document.getElementById('search-results-container'),
  pageTitleHeader: document.getElementById('page-title-header'),
  pageTitleIcon: document.getElementById('page-title-icon'),
  adContainer: document.getElementById('ad-container'),
  bottomNav: document.querySelector('.bottom-nav'),
  searchBackBtn: document.getElementById('search-back-btn'),
  searchClearBtn: document.getElementById('search-clear-btn'),
  voiceSearchBtn: document.getElementById('voice-search-btn'),
  topSearchesContainer: document.getElementById('top-searches-container'),
  topSearchesPills: document.getElementById('top-searches-pills'),
  searchResultsList: document.getElementById('search-results-list'),
  searchNoResults: document.getElementById('search-no-results')
};

if (UI.adContainer && document.querySelector('#app-shell main')) {
  const mainContent = document.querySelector('#app-shell main');
  const adObserver = new MutationObserver(() => {
    const isAdVisible = UI.adContainer.style.display !== 'none' && UI.adContainer.offsetHeight > 0;
    const navHeight = 70;
    const adHeight = 50;
    mainContent.style.marginBottom = isAdVisible ? navHeight + adHeight + 'px' : navHeight + 'px';
  });
  adObserver.observe(UI.adContainer, { attributes: true, childList: true, subtree: true });
  setTimeout(() => {
    const isAdVisibleInitially = UI.adContainer.style.display !== 'none' && UI.adContainer.offsetHeight > 0;
    const navHeight = 70;
    const adHeight = 50;
    mainContent.style.marginBottom = isAdVisibleInitially ? navHeight + adHeight + 'px' : navHeight + 'px';
  }, 100);
}

function updateCountdowns() {
  const timers = document.querySelectorAll('.countdown-timer');
  const now = Date.now();
  timers.forEach(el => {
    const start = parseInt(el.dataset.start);
    const end = parseInt(el.dataset.end);
    if (!start || !end) return;
    if (now < start) {
      const diff = start - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      el.textContent = hours + 'h ' + mins + 'm ' + secs + 's';
      el.style.color = '#facc15';
    } else if (now >= start && now <= end) {
      el.textContent = '🔴 LIVE';
      el.style.color = '#ef4444';
      el.style.fontWeight = 'bold';
    } else {
      el.textContent = '✅ Finished';
      el.style.color = '#6b7280';
    }
  });
}

let countdownInterval = null;
function startCountdownUpdates() {
  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdowns();
  countdownInterval = setInterval(updateCountdowns, 1000);
}

const getMatchStatus = (startTime, endTime) => {
  if (!startTime || !endTime || typeof startTime.toDate !== 'function' || typeof endTime.toDate !== 'function') {
    return { status: 'unknown' };
  }
  const now = new Date();
  const start = startTime.toDate();
  const end = endTime.toDate();
  if (now < start) return { status: 'upcoming' };
  else if (now >= start && now <= end) return { status: 'live' };
  else return { status: 'finished' };
};

function parseISO8601Duration(duration) {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return "00:00";
  const hours = (parseInt(match[1]) || 0);
  const minutes = (parseInt(match[2]) || 0);
  const seconds = (parseInt(match[3]) || 0);
  return hours > 0 ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') : String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

const Render = {
  card: (item, cardType = 'poster', isGridItem = false) => {
    const aspectClass = cardType === 'thumbnail' ? 'aspect-video' : 'aspect-[2/3]';
    let badges = '';
    if (item.duration) {
      badges += '<span class="badge-duration">' + item.duration + '</span>';
    } else if (cardType === 'thumbnail') {
      const highlightKeywords = ['highlights', 'extended', 'full match', 'recap', 'replay', 'classic match'];
      const title = (item.title || '').toLowerCase();
      const statusInfo = getMatchStatus(item.startTime, item.endTime);
      if (statusInfo.status === 'live') {
        badges += '<span class="badge badge-live"><span class="live-dot"></span>Live</span>';
      } else if (statusInfo.status === 'upcoming') {
        badges += '<span class="badge badge-upcoming"><i class="far fa-clock"></i> Upcoming</span>';
      } else if (statusInfo.status === 'finished') {
        if (highlightKeywords.some(keyword => title.includes(keyword))) {
          badges += '<span class="badge badge-highlights"><i class="fas fa-history"></i> Highlights</span>';
        } else {
          badges += '<span class="badge badge-highlights" style="background-color: #6b7280; gap: 5px;"><i class="fas fa-check-circle"></i> Finished</span>';
        }
      }
    }
    if (cardType !== 'thumbnail' && item.createdAt && (Date.now() - item.createdAt.toDate().getTime()) < 24 * 60 * 60 * 1000) {
      badges += '<span class="badge badge-new">NEW</span>';
    }
    const sizeClass = isGridItem ? 'w-full' : (cardType === 'thumbnail' ? 'w-60 flex-shrink-0' : 'w-36 sm:w-40 flex-shrink-0');
    const fallbackImage = 'https://via.placeholder.com/300x450.png?text=Image+Not+Found';
    let countdownHTML = '';
    if (cardType === 'thumbnail' && item.startTime && item.endTime) {
      let startMs, endMs;
      try {
        startMs = item.startTime.toDate ? item.startTime.toDate().getTime() : new Date(item.startTime).getTime();
        endMs = item.endTime.toDate ? item.endTime.toDate().getTime() : new Date(item.endTime).getTime();
      } catch (e) {
        startMs = 0; endMs = 0;
      }
      if (startMs && endMs) {
        countdownHTML = '<div class="countdown-timer" data-start="' + startMs + '" data-end="' + endMs + '" style="margin-top: 6px; font-size: 13px; font-weight: 600; color: #facc15; text-align: center;"></div>';
      }
    }
    return '<div class="' + sizeClass + '"><a href="#" data-id="' + item.link + '" class="block group content-link"><div class="content-card"><div class="card-img-container relative ' + aspectClass + '">' + badges + '<img alt="' + (item.title || item.name) + '" class="w-full h-full object-cover" src="' + item.posterUrl + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + fallbackImage + '\';"/><div class="play-icon-overlay"><i class="fas fa-play main-play-icon"></i></div></div></div><p class="text-sm font-semibold mt-2 truncate group-hover:text-[var(--primary-color)] transition-colors">' + (item.title || item.name) + '</p>' + countdownHTML + '</a></div>';
  },

  liveTvChannelCard: (item, isGridItem = false) => {
    if (!isGridItem) {
      return '<div class="flex-shrink-0 w-24 text-center"><a href="#" data-id="liveTV/' + item.id + '" data-stream-url="' + (item.streamUrl || '') + '" class="live-tv-channel content-link"><img src="' + item.logoUrl + '" alt="' + item.name + '" onerror="this.onerror=null;this.src=\'https://via.placeholder.com/100x100.png?text=Logo\';" /></a><p class="text-xs mt-1 truncate font-medium text-gray-300">' + item.name + '</p></div>';
    }
    return '<div class="text-center"><a href="#" data-id="liveTV/' + item.id + '" data-stream-url="' + (item.streamUrl || '') + '" class="live-tv-channel content-link block"><img src="' + item.logoUrl + '" alt="' + item.name + '" onerror="this.onerror=null;this.src=\'https://via.placeholder.com/100x100.png?text=Logo\';" class="w-full max-w-[120px] mx-auto aspect-square object-contain" /></a><p class="text-xs mt-2 truncate font-medium text-gray-300">' + item.name + '</p></div>';
  },

  section: (s, i, t, d) => '<section class="space-y-4"><div class="section-title-wrapper"><div class="section-title"><span class="accent-bar"></span><h2>' + s.title + '</h2></div><button class="see-more-btn text-xs font-semibold text-gray-400 hover:text-[var(--primary-color)]" data-title="' + s.title + '" data-type="' + t + '" data-section-id="' + d + '">See All <i class="fas fa-angle-right ml-1"></i></button></div><div class="flex overflow-x-auto gap-4 pb-2 scrollbar-hide -mx-4 px-4">' + i + '</div></section>',

  youtubeSection: (title, itemsHTML) => '<section class="space-y-4"><div class="section-title-wrapper"><div class="section-title"><span class="accent-bar"></span><h2>' + title + '</h2></div></div><div class="flex overflow-x-auto gap-4 pb-2 scrollbar-hide -mx-4 px-4">' + itemsHTML + '</div></section>',

  searchResultItem: (i) => '<a href="#" data-id="' + i.link + '" ' + (i.link.startsWith('liveTV/') && i.streamUrl ? 'data-stream-url="' + i.streamUrl + '"' : '') + ' class="search-result-item content-link"><img src="' + i.posterUrl + '" alt="' + i.title + '" onerror="this.onerror=null;this.src=\'https://via.placeholder.com/50x75.png?text=N/A\';"/><p class="font-semibold">' + i.title + '</p></a>',

  skeletonSection: (isThumbnail = false) => {
    const cardType = isThumbnail ? 'thumbnail' : '';
    let cards = '';
    for (let i = 0; i < 6; i++) {
      cards += '<div class="w-36 sm:w-40 flex-shrink-0"><div class="skeleton-card shimmer"><div class="img ' + cardType + '"></div><div class="title"></div></div></div>';
    }
    return '<section class="space-y-4"><div class="section-title-wrapper"><div class="h-6 w-48 bg-[#2a2a2a] rounded shimmer"></div></div><div class="flex overflow-x-auto gap-4 pb-2 scrollbar-hide -mx-4 px-4">' + cards + '</div></section>';
  }
};

const Drawer = {
  drawer: null,
  overlay: null,
  openBtn: null,
  body: null,
  autoplayToggle: null,
  init() {
    this.drawer = document.getElementById('nav-drawer');
    this.overlay = document.getElementById('drawer-overlay');
    this.openBtn = document.getElementById('drawer-open-btn');
    this.autoplayToggle = document.getElementById('autoplay-toggle');
    this.body = document.body;
    if (!this.drawer || !this.overlay || !this.openBtn) return;
    this.openBtn.addEventListener('click', this.open.bind(this));
    this.overlay.addEventListener('click', this.close.bind(this));
    this.setupSwipeToClose();
    this.setupAutoplayToggle();
  },
  open() { this.body.classList.add('drawer-open'); },
  close() { this.body.classList.remove('drawer-open'); },
  setupAutoplayToggle() {
    const e = localStorage.getItem('autoplayNext') === 'true';
    this.autoplayToggle.checked = e;
    this.autoplayToggle.addEventListener('change', e => {
      localStorage.setItem('autoplayNext', e.target.checked);
    });
  },
  setupSwipeToClose() {
    let t = 0, c = 0;
    const o = this.drawer.offsetWidth;
    this.drawer.addEventListener('touchstart', e => { t = e.touches[0].clientX; c = t; }, { passive: true });
    this.drawer.addEventListener('touchmove', e => {
      c = e.touches[0].clientX;
      const n = c - t;
      if (n < 0) {
        this.drawer.style.transition = 'none';
        this.drawer.style.transform = 'translateX(' + n + 'px)';
      }
    }, { passive: true });
    this.drawer.addEventListener('touchend', () => {
      this.drawer.style.transition = 'transform 0.3s ease-in-out';
      const e = c - t;
      if (e < -(o * 0.25)) { this.close(); }
      this.drawer.style.transform = '';
    });
  }
};

const App = {
  contentCache: {},
  allContent: [],
  youtubeSectionState: {},
  topSearches: ["T SPORTS", "Taandob", "Borbaad", "Saiyaara", "Disney"],
  categoryChannels: {},
  currentCategory: 'ALL',
  isContentLoaded: false,

  async fetchYouTubeSection(sectionId, title, searchConfig, isLoadMore = false) {
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === "YOUR_YOUTUBE_API_KEY") { return isLoadMore ? { html: '', hasMore: false } : ''; }
    if (!this.youtubeSectionState[sectionId]) { this.youtubeSectionState[sectionId] = { nextPageToken: null, loadedVideoIds: new Set() }; }
    const state = this.youtubeSectionState[sectionId];
    let searchUrl = 'https://www.googleapis.com/youtube/v3/search?part=snippet&q=' + encodeURIComponent(searchConfig.query) + '&type=video&order=date&maxResults=' + (searchConfig.maxResults || 25) + '&key=' + YOUTUBE_API_KEY;
    if (state.nextPageToken && isLoadMore) searchUrl += '&pageToken=' + state.nextPageToken;
    if (searchConfig.onlyLatest) { const date = new Date(); date.setDate(date.getDate() - 60); searchUrl += '&publishedAfter=' + date.toISOString(); }
    if (searchConfig.duration) searchUrl += '&videoDuration=' + searchConfig.duration;
    try {
      const searchResponse = await fetch(searchUrl);
      if (searchResponse.status === 403) { console.error("YouTube API Quota Exceeded."); return isLoadMore ? { html: '', hasMore: false } : Render.youtubeSection(title, '<p class="p-4 text-center text-gray-500">Could not load videos.</p>'); }
      const searchData = await searchResponse.json();
      state.nextPageToken = searchData.nextPageToken;
      if (!searchData.items || searchData.items.length === 0) return isLoadMore ? { html: '', hasMore: false } : '';
      const newVideoIds = searchData.items.map(item => item.id.videoId).filter(id => !state.loadedVideoIds.has(id));
      if (newVideoIds.length === 0) return isLoadMore ? { html: '', hasMore: false } : '';
      const detailsResponse = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=' + newVideoIds.join(',') + '&key=' + YOUTUBE_API_KEY);
      const detailsData = await detailsResponse.json();
      if (!detailsData.items) return isLoadMore ? { html: '', hasMore: false } : '';
      const durationMap = {};
      detailsData.items.forEach(item => { durationMap[item.id] = parseISO8601Duration(item.contentDetails.duration); });
      const addedTitles = new Set();
      const itemsHTML = detailsData.items.map(item => {
        const simplifiedTitle = item.snippet.title.toLowerCase().replace(/(official trailer|trailer|teaser|hd|4k|\|)/g, '').trim();
        if (addedTitles.has(simplifiedTitle)) return '';
        state.loadedVideoIds.add(item.id);
        addedTitles.add(simplifiedTitle);
        const videoData = { title: item.snippet.title, posterUrl: item.snippet.thumbnails.high.url, link: 'youtube/' + item.id, duration: durationMap[item.id] || "00:00" };
        this.allContent.push(videoData);
        return Render.card(videoData, searchConfig.cardType);
      }).join('');
      if (isLoadMore) return { html: itemsHTML, hasMore: !!state.nextPageToken };
      const loadMoreBtn = state.nextPageToken ? '<div class="w-40 flex-shrink-0 flex items-center justify-center"><button class="load-more-yt-btn p-4 bg-gray-800 rounded-lg hover:bg-gray-700" data-section-id="' + sectionId + '"><i class="fas fa-plus mr-2"></i> More</button></div>' : '';
      return Render.youtubeSection(title, itemsHTML + loadMoreBtn);
    } catch (error) { console.error('Error fetching YouTube for "' + title + '":', error); return ''; }
  },

  setupEventListeners() {
    const header = document.getElementById('main-header');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        header.classList.add('scrolled');
        header.classList.remove('bg-gradient-to-b');
      } else {
        header.classList.remove('scrolled');
        header.classList.add('bg-gradient-to-b');
      }
    });
    document.querySelectorAll('.nav-button').forEach(b => b.addEventListener('click', () => App.switchPage(b.dataset.target)));
    document.getElementById('search-open-btn').addEventListener('click', App.openSearch);
    UI.searchBackBtn.addEventListener('click', App.closeSearch);
    UI.searchClearBtn.addEventListener('click', App.clearSearchInput);
    UI.voiceSearchBtn.addEventListener('click', App.startVoiceSearch);

    document.body.addEventListener('click', async (e) => {
      const contentLink = e.target.closest('.content-link');
      if (contentLink) {
        e.preventDefault();
        let clickedId = contentLink.dataset.id;
        if (clickedId) {
          if (!clickedId.includes('/')) {
            const foundContent = App.allContent.find(item => (item.title || item.name || '').toLowerCase() === clickedId.toLowerCase());
            if (foundContent) { clickedId = foundContent.link; } else { console.warn('Content with title "' + clickedId + '" not found in allContent list.'); clickedId = null; }
          }
          if (clickedId) { App.closeSearch(); App.showPlayerPage(clickedId); }
        }
        return;
      }

      const seeMoreBtn = e.target.closest('.see-more-btn');
      if (seeMoreBtn) {
        e.preventDefault();
        const type = seeMoreBtn.dataset.type;
        const title = seeMoreBtn.dataset.title;
        const sectionId = seeMoreBtn.dataset.sectionId;
        if (type === 'livetv-redirect') {
          App.showCategoryChannels(title);
        } else {
          App.showGridView(title, type, sectionId);
        }
        return;
      }

      const topSearchPill = e.target.closest('.top-search-pill');
      if (topSearchPill) {
        UI.searchInput.value = topSearchPill.dataset.query;
        UI.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const loadMoreBtn = e.target.closest('.load-more-yt-btn');
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        loadMoreBtn.disabled = true;
        const sectionId = loadMoreBtn.dataset.sectionId, section = App.youtubeSectionConfigs[sectionId];
        if (section) {
          const result = await App.fetchYouTubeSection(sectionId, section.title, section.config, true);
          const container = loadMoreBtn.parentElement.parentElement;
          loadMoreBtn.parentElement.remove();
          container.insertAdjacentHTML('beforeend', result.html);
          if (result.hasMore) { container.insertAdjacentHTML('beforeend', '<div class="w-40 flex-shrink-0 flex items-center justify-center"><button class="load-more-yt-btn p-4 bg-gray-800 rounded-lg" data-section-id="' + sectionId + '"><i class="fas fa-plus mr-2"></i> More</button></div>'); }
        }
      }
    });

    document.getElementById('grid-back-btn').addEventListener('click', () => { UI.gridPageView.style.display = 'none'; });
    document.getElementById('player-back-btn').addEventListener('click', App.hidePlayerPage);
    UI.searchInput.addEventListener('input', () => App.handleSearch());
  },

  showCategoryChannels(category) {
    const channels = this.categoryChannels[category] || [];
    if (channels.length === 0) {
      alert('No channels found in this category.');
      return;
    }
    UI.gridPageTitle.textContent = category + ' Channels';
    UI.gridPageContent.className = 'p-4 grid grid-cols-3 gap-4';
    UI.gridPageContent.innerHTML = channels.map(channel => {
      return Render.liveTvChannelCard(channel, true);
    }).join('');
    UI.gridPageView.style.display = 'block';
    window.scrollTo(0, 0);
  },

  openSearch() { document.body.classList.add('search-overlay-active'); UI.searchInput.focus(); App.handleSearch(); },
  closeSearch() { document.body.classList.remove('search-overlay-active'); App.clearSearchInput(); },
  clearSearchInput() { UI.searchInput.value = ''; UI.searchInput.dispatchEvent(new Event('input', { bubbles: true })); },
  handleSearch() {
    const q = UI.searchInput.value.toLowerCase().trim();
    const h = q.length > 0;
    UI.searchClearBtn.classList.toggle('hidden', !h);
    UI.topSearchesContainer.classList.toggle('hidden', h);
    UI.searchResultsList.classList.toggle('hidden', !h);
    UI.searchNoResults.classList.add('hidden');
    if (!h) { UI.searchResultsList.innerHTML = ''; return; }
    const r = App.allContent.filter(i => (i.title || i.name || '').toLowerCase().includes(q));
    if (r.length > 0) { UI.searchResultsList.innerHTML = r.map(Render.searchResultItem).join(''); } else { UI.searchResultsList.innerHTML = ''; UI.searchNoResults.classList.remove('hidden'); UI.searchNoResults.textContent = 'No results for "' + q + '"'; }
  },
  startVoiceSearch() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) { alert("Voice search not supported."); return; }
    const r = new R();
    r.lang = 'en-US';
    const m = UI.voiceSearchBtn;
    m.classList.add('recording');
    r.onresult = e => { UI.searchInput.value = e.results[0][0].transcript; UI.searchInput.dispatchEvent(new Event('input', { bubbles: true })); };
    r.onend = () => { m.classList.remove('recording'); };
    r.onerror = e => { console.error('Voice search error:', e.error); m.classList.remove('recording'); };
    r.start();
  },
  renderTopSearches() { UI.topSearchesPills.innerHTML = this.topSearches.map(t => '<button class="top-search-pill" data-query="' + t + '"><i class="fas fa-search text-xs opacity-70"></i><span>' + t + '</span></button>').join(''); },

  showPlayerPage(id) {
    UI.appShell.style.display = 'none';
    UI.gridPageView.style.display = 'none';
    UI.playerPageView.style.display = 'block';
    UI.adContainer.style.display = 'none';
    UI.bottomNav.style.display = 'none';
    window.scrollTo(0, 0);
    Player.init(id);
  },
  hidePlayerPage() {
    Player.destroyPlayer();
    UI.appShell.style.display = 'flex';
    UI.playerPageView.style.display = 'none';
    UI.adContainer.style.display = 'flex';
    UI.bottomNav.style.display = 'flex';
  },

  switchPage(id) {
    document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('active', b.dataset.target === id));
    UI.pages.forEach(p => p.classList.toggle('active', p.id === id));
    window.scrollTo(0, 0);
  },

  async showGridView(title, type, sectionId) {
    UI.gridPageTitle.textContent = title;
    const cardType = type === 'cricket' ? 'thumbnail' : 'poster';
    UI.gridPageContent.className = 'p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';
    UI.gridPageContent.innerHTML = Array(12).fill('<div class="w-full skeleton-card shimmer"><div class="img ' + (cardType === 'thumbnail' ? 'thumbnail' : '') + '"></div><div class="title"></div></div>').join('');
    UI.gridPageView.style.display = 'block';
    const q = query(collection(db, type + 'Sections/' + sectionId + '/items'), orderBy("order", "asc"));
    const snapshot = await getDocs(q);
    UI.gridPageContent.innerHTML = snapshot.docs.map(doc => Render.card({ ...doc.data(), link: type + 'Sections/' + sectionId + '/items/' + doc.id }, cardType, true)).join('');
  },

  renderSkeletons() {
    UI.bannerContainer.innerHTML = '<div class="shimmer w-full h-full"></div>';
    document.getElementById('home-sections-container').innerHTML = Render.skeletonSection();
  },

  async fetchAllContent() {
    try {
      this.renderSkeletons();

      this.youtubeSectionConfigs = {
        'yt-sports': {
          title: 'Latest Sports Updates',
          config: {
            query: '("হাইলাইটস" | "ম্যাচের সারসংক্ষেপ" | "গোল" | "উইকেট") ("ক্রিকেট" | "ফুটবল" | "বাংলাদেশ" | "বিপিএল") -live -streaming -full -reaction -review -news -vlog',
            cardType: 'thumbnail',
            duration: 'short',
            onlyLatest: true,
            maxResults: 25
          }
        },
        'yt-trailers': {
          title: 'Latest Movie Trailers',
          config: {
            query: '(("Bangla Movie" | "Bengali Movie" | "বাংলা সিনেমা") | ("Hindi Movie" | "Bollywood" | "হিন্দি মুভি") | ("Tamil Movie" | "Kollywood" | "তামিল সিনেমা")) ("Official Trailer" | "Teaser" | "New Release" | "নতুন রিলিজ") (2024 | 2025) -reaction -review -recap -explanation',
            cardType: 'thumbnail',
            duration: 'medium',
            onlyLatest: false,
            maxResults: 25
          }
        }
      };

      await this.fetchYouTubeSection('yt-sports', this.youtubeSectionConfigs['yt-sports'].title, this.youtubeSectionConfigs['yt-sports'].config);
      await this.fetchYouTubeSection('yt-trailers', this.youtubeSectionConfigs['yt-trailers'].title, this.youtubeSectionConfigs['yt-trailers'].config);

      const bannerSnapshot = await getDocs(query(collection(db, "banners"), orderBy("order")));
      if (!bannerSnapshot.empty) {
        UI.bannerContainer.innerHTML = '<div class="swiper h-full"><div id="banner-wrapper" class="swiper-wrapper"></div><div class="swiper-pagination"></div></div>';
        document.getElementById('banner-wrapper').innerHTML = bannerSnapshot.docs.map(doc => '<div class="swiper-slide"><a href="#" data-id="' + (doc.data().link || doc.data().title || '') + '" class="content-link"><img src="' + doc.data().posterUrl + '" alt="' + (doc.data().title || '') + '" loading="eager"/><div class="banner-play-icon"><i class="fas fa-play"></i></div></a></div>').join('');
        new Swiper('#banner-container .swiper', { loop: true, autoplay: { delay: 3500 }, pagination: { el: '.swiper-pagination', clickable: true } });
      } else { UI.bannerContainer.style.display = 'none'; }

      const tvSnapshot = await getDocs(query(collection(db, "liveTV"), orderBy("order")));
      const allTvChannels = tvSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('📺 Total Live TV Channels:', allTvChannels.length);

      const grouped = {};
      allTvChannels.forEach(channel => {
        const rawCat = channel.category || 'OTHERS';
        const normalized = normalizeCategory(rawCat);
        if (!grouped[normalized]) grouped[normalized] = [];
        grouped[normalized].push(channel);
        this.allContent.push({
          title: channel.name,
          name: channel.name,
          posterUrl: channel.logoUrl || 'https://i.postimg.cc/mD1VCt2C/RS-Live.png',
          link: 'liveTV/' + channel.id,
          streamUrl: channel.streamUrl
        });
      });

      this.categoryChannels = grouped;
      console.log('📂 Normalized Categories:', Object.keys(grouped));

      const sortedCategories = CATEGORY_ORDER.filter(cat => grouped[cat]);
      const remainingCategories = Object.keys(grouped).filter(cat => !CATEGORY_ORDER.includes(cat));
      const allSortedCategories = [...sortedCategories, ...remainingCategories];

      let channelSectionsHTML = '';
      allSortedCategories.forEach(cat => {
        const channels = grouped[cat];
        channels.sort((a, b) => (a.order || 0) - (b.order || 0));
        const itemsHTML = channels.map(ch => Render.liveTvChannelCard(ch, false)).join('');
        channelSectionsHTML += Render.section({ title: cat }, itemsHTML, 'livetv-redirect', '');
      });

      document.getElementById('home-sections-container').innerHTML = channelSectionsHTML;

      this.renderLiveTvPage(allTvChannels);

      let cricketHTML = '';
      const cricketSectionsSnapshot = await getDocs(query(collection(db, "cricketSections"), orderBy("order")));
      for (const sectionDoc of cricketSectionsSnapshot.docs) {
        const sectionData = sectionDoc.data();
        const itemsSnapshot = await getDocs(query(collection(db, 'cricketSections/' + sectionDoc.id + '/items'), orderBy("order", "asc"), limit(10)));
        if (itemsSnapshot.empty) continue;
        const itemsHTML = itemsSnapshot.docs.map(itemDoc => {
          const itemData = { ...itemDoc.data(), link: 'cricketSections/' + sectionDoc.id + '/items/' + itemDoc.id };
          this.allContent.push(itemData);
          return Render.card(itemData, 'thumbnail');
        }).join('');
        const sectionHTML = Render.section(sectionData, itemsHTML, 'cricket', sectionDoc.id);
        cricketHTML += sectionHTML;
      }
      document.getElementById('cricket-page').innerHTML = cricketHTML;

      let moviesHTML = '';
      const moviesSectionsSnapshot = await getDocs(query(collection(db, "moviesSections"), orderBy("order")));
      for (const sectionDoc of moviesSectionsSnapshot.docs) {
        const sectionData = sectionDoc.data();
        const itemsSnapshot = await getDocs(query(collection(db, 'moviesSections/' + sectionDoc.id + '/items'), orderBy("order", "asc"), limit(10)));
        if (itemsSnapshot.empty) continue;
        const itemsHTML = itemsSnapshot.docs.map(itemDoc => {
          const itemData = { ...itemDoc.data(), link: 'moviesSections/' + sectionDoc.id + '/items/' + itemDoc.id };
          this.allContent.push(itemData);
          return Render.card(itemData, 'poster');
        }).join('');
        const sectionHTML = Render.section(sectionData, itemsHTML, 'movies', sectionDoc.id);
        moviesHTML += sectionHTML;
      }
      document.getElementById('movies-page').innerHTML = moviesHTML;

      startCountdownUpdates();
      this.isContentLoaded = true;
      console.log('✅ All content loaded successfully!');
      this.hideSplashScreen();
      
    } catch (error) {
      console.error('Error loading content:', error);
      this.hideSplashScreen();
    }
  },

  hideSplashScreen() {
    if (typeof window.hideSplashScreen === 'function') {
      window.hideSplashScreen();
    }
    window.mainJsLoaded = true;
  },

  renderLiveTvPage(channels) {
    const categoryBar = document.getElementById('livetv-category-bar');
    const gridContainer = document.getElementById('livetv-grid-container');

    if (!categoryBar || !gridContainer) {
      console.error('❌ Live TV elements not found!');
      return;
    }

    if (channels.length === 0) {
      gridContainer.innerHTML = '<div class="col-span-full text-center text-gray-400 py-10">No channels available</div>';
      return;
    }

    const channelCategories = [...new Set(channels.map(ch => normalizeCategory(ch.category)).filter(Boolean))];
    const sortedCategories = CATEGORY_ORDER.filter(cat => channelCategories.includes(cat));
    const remainingCategories = channelCategories.filter(cat => !CATEGORY_ORDER.includes(cat));
    const categories = ['ALL', ...sortedCategories, ...remainingCategories];

    categoryBar.innerHTML = categories.map(cat => `
        <button class="category-btn whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-full transition-colors duration-200" data-category="${cat}">
            ${cat}
        </button>
    `).join('');

    const sortedChannels = [...channels].sort((a, b) => (a.order || 0) - (b.order || 0));

    gridContainer.className = 'grid grid-cols-4 gap-4 p-2';
    gridContainer.innerHTML = sortedChannels.map(channel => {
        return Render.liveTvChannelCard(channel, true);
    }).join('');

    const filterChannels = (category) => {
        const allButtons = categoryBar.querySelectorAll('.category-btn');
        const allCards = gridContainer.querySelectorAll('.text-center');

        allButtons.forEach(btn => {
            if (btn.dataset.category === category) {
                btn.style.backgroundColor = '#ef4444';
                btn.style.color = '#ffffff';
                btn.style.border = '2px solid #ef4444';
                btn.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.6)';
                btn.style.transform = 'scale(1.05)';
                btn.style.fontWeight = 'bold';
            } else {
                btn.style.backgroundColor = '#2a2a2a';
                btn.style.color = '#d1d5db';
                btn.style.border = '2px solid transparent';
                btn.style.boxShadow = 'none';
                btn.style.transform = 'scale(1)';
                btn.style.fontWeight = 'normal';
            }
        });

        allCards.forEach((card, index) => {
            const channel = sortedChannels[index];
            const channelCat = normalizeCategory(channel?.category);
            if (category === 'ALL' || (channel && channelCat === category)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    };

    categoryBar.addEventListener('click', (e) => {
        const button = e.target.closest('.category-btn');
        if (button) {
            const selectedCategory = button.dataset.category;
            filterChannels(selectedCategory);
        }
    });

    setTimeout(() => {
        filterChannels('ALL');
    }, 100);
  },

  checkUserProfile() {
    const user = JSON.parse(localStorage.getItem('novaUser'));
    const profileImg = document.getElementById('header-profile-img');
    if (user && user.image && profileImg) {
      profileImg.src = user.image;
    }
  },

  init() {
    Drawer.init();
    App.switchPage('home-page');
    this.setupEventListeners();
    this.fetchAllContent();
    this.renderTopSearches();
    this.checkUserProfile();
  }
};

App.init();

(function() {
  const ua = navigator.userAgent.toLowerCase();
  if (["smart-tv", "smarttv", "tizen", "webos", "hbbtv", "netcast", "viera", "appletv", "crkey", "bravia", "philips", "hisense", "roku", "aftt", "aftb", "aftm", "firetv", "android tv", "googletv", "lgtv", "samsungtv", "sonytv"].some(k => ua.includes(k)) ||
    (!/android|iphone|ipad|ipod|kindle|silk|opera mini|mobile/.test(ua) && (/(windows nt|macintosh|x11|linux x86_64|cros)/.test(ua) || (Math.max(screen.width, screen.height) >= 1024 && !('ontouchstart' in window))))) {
    window.location.href = "go:smarttv";
  }
})();

// ===================== কোড শেষ =====================
