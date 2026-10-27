/**
 * Clean Player module
 * Firebase SDK: 9.22.0 (modular)
 * Requires ./config.js to export: db, YOUTUBE_API_KEY
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { db, YOUTUBE_API_KEY } from "./config.js";

export const PlayerIcons = Object.freeze({
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z" fill="currentColor"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4V1L8 5l4 4V6a6 6 0 1 1-5.65 8H4.2A8 8 0 1 0 12 4z" fill="currentColor"/></svg>',
  volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zm12.5 3a3.5 3.5 0 0 0-2-3.16v6.32a3.5 3.5 0 0 0 2-3.16zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" fill="currentColor"/></svg>'
});

const $ = (id, root = document) => root.getElementById(id);

const text = (node, value) => {
  if (node) node.textContent = value == null ? "" : String(value);
};

const safeString = value =>
  typeof value === "string" ? value.trim() : "";

const safeNumber = value =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function getYouTubeId(value = "") {
  try {
    const url = new URL(value);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (url.searchParams.get("v")) {
      return url.searchParams.get("v");
    }

    const match = url.pathname.match(
      /\/(?:embed|shorts|live)\/([^/?]+)/
    );

    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function isDirectMedia(url = "") {
  return /\.(m3u8|mpd|mp4|webm|ogg|mp3|aac)(?:$|[?#])/i.test(url);
}

export const Player = {
  state: {
    currentId: null,
    currentData: null,
    currentVideo: null,
    hlsInstance: null,
    commentUnsubscribe: null,
    playerListeners: [],
    viewIncrementedFor: null,
    busy: false,
    rotated: false,
    destroyed: false
  },

  async init(id, options = {}) {
    if (!id) {
      throw new Error("Player.init(id): একটি ভিডিও ID দিতে হবে।");
    }

    this.cleanupPlayer();
    this.state.destroyed = false;
    this.state.currentId = String(id);

    const collectionName = options.collectionName || "movies";

    const possiblePaths = options.documentPath
      ? [options.documentPath]
      : [
          `${collectionName}/${id}`,
          `moviesSections/${id}`,
          `liveTv/${id}`
        ];

    let snapshot = null;
    let usedPath = "";

    for (const path of possiblePaths) {
      try {
        const snap = await getDoc(doc(db, path));

        if (snap.exists()) {
          snapshot = snap;
          usedPath = path;
          break;
        }
      } catch (error) {
        console.warn("[Player] Could not read", path, error);
      }
    }

    if (!snapshot) {
      this.showError("ভিডিওটি খুঁজে পাওয়া যায়নি।");
      return;
    }

    const data = snapshot.data() || {};

    this.state.currentId = snapshot.id;
    this.state.currentData = {
      ...data,
      id: snapshot.id,
      _path: usedPath
    };

    this.state.viewIncrementedFor = null;

    this.renderInfo(this.state.currentData);

    await this.createPlayer(this.state.currentData);

    this.setupEngagement(this.state.currentData);

    this.loadRelatedContent(this.state.currentData)
      .catch(err => console.warn("[Player] Related content:", err));

    this.incrementViewCount(this.state.currentData)
      .catch(err => console.warn("[Player] View count:", err));

    return this.state.currentData;
  },

  async initYouTubeVideo(videoIdOrUrl, data = {}) {
    const videoId =
      getYouTubeId(videoIdOrUrl) || safeString(videoIdOrUrl);

    if (!videoId) {
      this.showError("YouTube ভিডিওর ID বা লিংক সঠিক নয়।");
      return;
    }

    this.cleanupPlayer();

    this.state.currentId = videoId;

    this.state.currentData = {
      ...data,
      id: videoId,
      title: data.title || "YouTube Video",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      type: "youtube"
    };

    this.renderInfo(this.state.currentData);

    const wrapper = $("player-wrapper");
    if (!wrapper) return;

    const frame = document.createElement("iframe");

    frame.src =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`;

    frame.title =
      safeString(this.state.currentData.title) || "YouTube video";

    frame.allow =
      "autoplay; encrypted-media; picture-in-picture; fullscreen";

    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.className = "player-media-frame";

    wrapper.replaceChildren(frame);

    this.state.currentVideo = frame;

    this.setupEngagement(this.state.currentData);
  },

  async createPlayer(data = {}) {
    const wrapper = $("player-wrapper");

    if (!wrapper) {
      console.error("[Player] #player-wrapper not found.");
      return;
    }

    const videoUrl = safeString(
      data.url || data.videoUrl || data.streamUrl || data.source
    );

    if (!videoUrl) {
      this.showError("এই ভিডিওর কোনো প্লে লিংক পাওয়া যায়নি।");
      return;
    }

    const youtubeId = getYouTubeId(videoUrl);

    if (youtubeId) {
      return this.initYouTubeVideo(youtubeId, data);
    }

    this.destroyMediaOnly();

    const urlLower = videoUrl.toLowerCase();

    const iframeHosts = [
      "bongobd.com",
      "youtube.com/embed",
      "youtube-nocookie.com/embed",
      "facebook.com",
      "dailymotion.com/embed"
    ];

    const useIframe =
      iframeHosts.some(host => urlLower.includes(host)) ||
      (
        !isDirectMedia(videoUrl) &&
        !urlLower.includes(".m3u8") &&
        !urlLower.includes(".mpd")
      );

    if (useIframe) {
      const frame = document.createElement("iframe");

      frame.src = videoUrl;
      frame.title = safeString(data.title) || "Video player";
      frame.allow =
        "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.className = "player-media-frame";

      wrapper.replaceChildren(frame);
      this.state.currentVideo = frame;

      return;
    }

    const video = document.createElement("video");

    video.className = "player-media-video";
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.controlsList = "nodownload";

    video.setAttribute(
      "aria-label",
      safeString(data.title) || "Video player"
    );

    wrapper.replaceChildren(video);
    this.state.currentVideo = video;

    const on = (target, event, handler, options) => {
      target.addEventListener(event, handler, options);

      this.state.playerListeners.push(() =>
        target.removeEventListener(event, handler, options)
      );
    };

    if (/\.m3u8(?:$|[?#])/i.test(videoUrl)) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoUrl;
      } else {
        try {
          const module = await import(
            "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/+esm"
          );

          const Hls = module.default;

          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              backBufferLength: 30
            });

            this.state.hlsInstance = hls;

            hls.loadSource(videoUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.ERROR, (_event, info) => {
              if (!info.fatal) return;

              if (info.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (
                info.type === Hls.ErrorTypes.MEDIA_ERROR
              ) {
                hls.recoverMediaError();
              } else {
                this.showError(
                  "স্ট্রিম চালানো যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।"
                );
              }
            });
          } else {
            this.showError(
              "এই ব্রাউজারে HLS স্ট্রিম চালানো যাচ্ছে না।"
            );
            return;
          }
        } catch (error) {
          console.error("[Player] HLS load failed:", error);

          this.showError(
            "প্লেয়ার লোড হয়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।"
          );

          return;
        }
      }
    } else {
      video.src = videoUrl;
    }

    on(video, "error", () => {
      if (!video.error) return;

      this.showError(
        "ভিডিও চালাতে সমস্যা হচ্ছে। লিংক বা নেটওয়ার্ক পরীক্ষা করুন।"
      );
    });

    on(video, "playing", () => {
      this.clearError();
    });

    on(video, "dblclick", event => {
      event.preventDefault();
      this.toggleRotate();
    });

    on(video, "loadedmetadata", () => {
      video.play().catch(() => {});
    });
  },
      renderInfo(data = {}) {
    const title = safeString(data.title || data.name || data.movieName) || "Untitled";
    text($("player-page-title-header"), title);

    const info = $("movie-info");
    if (info) {
      info.replaceChildren();

      const heading = document.createElement("h2");
      heading.textContent = title;
      info.appendChild(heading);

      const description = safeString(
        data.description || data.overview || data.details
      );

      if (description) {
        const paragraph = document.createElement("p");
        paragraph.textContent = description;
        info.appendChild(paragraph);
      }
    }

    const view = $("player-page-view");
    if (view) view.hidden = false;
  },

  setupLiveTvControls(video, data = {}) {
    video.dataset.playerType = "live";
    video.controls = true;
    video.setAttribute("playsinline", "");
  },

  setupMovieControls(video, data = {}) {
    if (
      (data.type || data.category || "")
        .toString()
        .toLowerCase()
        .includes("movie")
    ) {
      video.dataset.playerType = "movie";
    }
  },

  addSimpleTapGesture(video) {
    if (!video || video.dataset.tapGestureAttached === "1") return;

    video.dataset.tapGestureAttached = "1";
    let lastTap = 0;

    const handler = event => {
      if (event.target !== video) return;

      const now = Date.now();

      if (now - lastTap < 280) {
        if (video.paused) video.play().catch(() => {});
        else video.pause();

        lastTap = 0;
      } else {
        lastTap = now;
      }
    };

    video.addEventListener("touchend", handler, { passive: true });

    this.state.playerListeners.push(() => {
      video.removeEventListener("touchend", handler);
      delete video.dataset.tapGestureAttached;
    });
  },

  toggleRotateView(force) {
    const wrapper = $("player-wrapper");
    if (!wrapper) return false;

    this.state.rotated =
      typeof force === "boolean" ? force : !this.state.rotated;

    wrapper.classList.toggle("player-rotated", this.state.rotated);

    document.body.classList.toggle(
      "player-rotated-active",
      this.state.rotated
    );

    return this.state.rotated;
  },

  async incrementViewCount(data = {}) {
    const id = this.state.currentId;
    const path = data._path;

    if (!id || !path || this.state.viewIncrementedFor === id) return;

    this.state.viewIncrementedFor = id;

    try {
      await updateDoc(doc(db, path), { views: increment(1) });
    } catch (error) {
      console.warn("[Player] View count was not updated:", error);
    }
  },

  setupEngagement(data = {}) {
    this.bindButton("like-btn", () => this.vote("like"));
    this.bindButton("dislike-btn", () => this.vote("dislike"));
    this.bindButton("comment-btn", () => this.toggleComments(true));
    this.bindButton("close-comments-btn", () => this.toggleComments(false));

    const form = $("comment-form");

    if (form && !form.dataset.playerBound) {
      form.dataset.playerBound = "1";

      const handler = event => {
        event.preventDefault();

        this.submitComment().catch(error => {
          console.error("[Player] Comment failed:", error);
          this.showError("কমেন্ট পাঠানো যায়নি। আবার চেষ্টা করুন।");
        });
      };

      form.addEventListener("submit", handler);

      this.state.playerListeners.push(() => {
        form.removeEventListener("submit", handler);
        delete form.dataset.playerBound;
      });
    }

    this.refreshVoteCounts(data);
    this.listenForComments(data);
  },

  bindButton(id, callback) {
    const button = $(id);

    if (!button || button.dataset.playerBound) return;

    button.dataset.playerBound = "1";

    const handler = event => {
      event.preventDefault();
      callback();
    };

    button.addEventListener("click", handler);

    this.state.playerListeners.push(() => {
      button.removeEventListener("click", handler);
      delete button.dataset.playerBound;
    });
  },

  async refreshVoteCounts(data = {}) {
    const path = data._path;
    if (!path) return;

    try {
      const snap = await getDoc(doc(db, path));
      const current = snap.exists() ? snap.data() : {};

      text($("like-count"), safeNumber(current.likes));
      text($("dislike-count"), safeNumber(current.dislikes));
    } catch (error) {
      console.warn("[Player] Could not load vote counts:", error);
    }
  },

  async vote(type) {
    const data = this.state.currentData;
    if (!data?._path) return;

    const field = type === "like" ? "likes" : "dislikes";

    try {
      await updateDoc(doc(db, data._path), {
        [field]: increment(1)
      });

      await this.refreshVoteCounts(data);
    } catch (error) {
      console.error("[Player] Vote failed:", error);
      this.showError("আপনার রিঅ্যাকশন নেওয়া যায়নি।");
    }
  },

  toggleComments(show) {
    const section = $("comment-section");
    if (!section) return;

    section.hidden = !show;
    section.classList.toggle("is-open", show);

    if (show) $("comment-input")?.focus();
  },

  getCommentCollectionPath() {
    const data = this.state.currentData;
    return data?.id ? `comments_${data.id}` : "";
  },

  listenForComments(data = {}) {
    if (this.state.commentUnsubscribe) {
      this.state.commentUnsubscribe();
      this.state.commentUnsubscribe = null;
    }

    const list = $("comments-list");
    const path = this.getCommentCollectionPath();

    if (!list || !path) return;

    try {
      const q = query(
        collection(db, path),
        orderBy("createdAt", "desc"),
        limit(100)
      );

      this.state.commentUnsubscribe = onSnapshot(
        q,
        snapshot => {
          list.replaceChildren();

          if (snapshot.empty) {
            const empty = document.createElement("p");
            empty.className = "comments-empty";
            empty.textContent =
              "এখনো কোনো কমেন্ট নেই। প্রথম কমেন্টটি করুন।";

            list.appendChild(empty);
            return;
          }

          snapshot.forEach(item => {
            const comment = item.data() || {};

            const article = document.createElement("article");
            article.className = "player-comment";

            const author = document.createElement("strong");
            author.textContent =
              safeString(comment.author || comment.name) || "Guest";

            const body = document.createElement("p");
            body.textContent =
              safeString(comment.text || comment.comment);

            article.append(author, body);
            list.appendChild(article);
          });
        },
        error => {
          console.warn("[Player] Comment listener failed:", error);
          text(list, "কমেন্ট লোড করা যাচ্ছে না।");
        }
      );
    } catch (error) {
      console.warn("[Player] Could not subscribe to comments:", error);
    }
  },
      async submitComment() {
    const input = $("comment-input");
    const value = safeString(input?.value);
    const path = this.getCommentCollectionPath();

    if (!value || !path) return;

    if (value.length > 1500) {
      this.showError("কমেন্ট ১৫০০ অক্ষরের মধ্যে রাখুন।");
      return;
    }

    const submit = $("comment-form")?.querySelector('[type="submit"]');

    if (submit) submit.disabled = true;

    try {
      const commentId =
        `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      await setDoc(doc(db, path, commentId), {
        text: value,
        author: "Guest",
        createdAt: serverTimestamp(),
        videoId: this.state.currentId
      });

      if (input) input.value = "";
    } finally {
      if (submit) submit.disabled = false;
    }
  },

  async loadRelatedContent(data = {}) {
    const container =
      $("related-content-container") || $("related-content");

    if (!container) return;

    const currentId = data.id || this.state.currentId;
    const collectionName = data._path?.split("/")[0] || "movies";
    const title = $("related-title");

    if (title) title.textContent = "Related content";

    try {
      const snap = await getDocs(
        query(collection(db, collectionName), limit(24))
      );

      container.replaceChildren();

      const items = [];

      snap.forEach(item => {
        if (item.id !== currentId) {
          items.push({ id: item.id, ...item.data() });
        }
      });

      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "related-empty";
        empty.textContent = "এখন সম্পর্কিত কোনো কনটেন্ট নেই।";
        container.appendChild(empty);
        return;
      }

      items.slice(0, 12).forEach(item => {
        const card = document.createElement("button");

        card.type = "button";
        card.className = "related-content-card";

        const imageUrl = safeString(
          item.thumbnail || item.poster || item.image || item.logo
        );

        if (imageUrl) {
          const image = document.createElement("img");

          image.src = imageUrl;
          image.alt =
            safeString(item.title || item.name) || "Related content";
          image.loading = "lazy";
          image.referrerPolicy = "no-referrer";

          card.appendChild(image);
        }

        const label = document.createElement("span");
        label.textContent =
          safeString(item.title || item.name) || "Untitled";

        card.appendChild(label);

        card.addEventListener("click", () => {
          const event = new CustomEvent("player:related-select", {
            detail: item
          });

          document.dispatchEvent(event);
        });

        container.appendChild(card);
      });
    } catch (error) {
      console.warn("[Player] Could not load related content:", error);
    }
  },

  showError(message) {
    const wrapper = $("player-wrapper");
    if (!wrapper) return;

    let notice = $("player-error-notice");

    if (!notice) {
      notice = document.createElement("div");
      notice.id = "player-error-notice";
      notice.setAttribute("role", "status");
      notice.className = "player-error-notice";

      wrapper.appendChild(notice);
    }

    notice.textContent = message;
    notice.hidden = false;
  },

  clearError() {
    const notice = $("player-error-notice");
    if (notice) notice.hidden = true;
  },

  destroyMediaOnly() {
    if (this.state.hlsInstance) {
      try {
        this.state.hlsInstance.destroy();
      } catch (_) {}

      this.state.hlsInstance = null;
    }

    const media = this.state.currentVideo;

    if (media && media.tagName === "VIDEO") {
      try {
        media.pause();
      } catch (_) {}

      media.removeAttribute("src");

      try {
        media.load();
      } catch (_) {}
    }

    this.state.currentVideo = null;
  },

  cleanupPlayer() {
    if (this.state.commentUnsubscribe) {
      try {
        this.state.commentUnsubscribe();
      } catch (_) {}

      this.state.commentUnsubscribe = null;
    }

    this.state.playerListeners.splice(0).forEach(remove => {
      try {
        remove();
      } catch (_) {}
    });

    this.destroyMediaOnly();
    this.toggleRotateView(false);

    const wrapper = $("player-wrapper");

    if (wrapper) wrapper.replaceChildren();

    const notice = $("player-error-notice");
    if (notice) notice.remove();

    const section = $("comment-section");

    if (section) {
      section.hidden = true;
      section.classList.remove("is-open");
    }

    const comments = $("comments-list");
    if (comments) comments.replaceChildren();

    this.state.currentId = null;
    this.state.currentData = null;
    this.state.viewIncrementedFor = null;
  },

  destroyPlayer() {
    this.cleanupPlayer();

    const view = $("player-page-view");
    if (view) view.hidden = true;

    this.state.destroyed = true;
  }
};

export default Player;
