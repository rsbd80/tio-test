import { doc, onSnapshot, updateDoc, increment, collection, addDoc, serverTimestamp, orderBy, query, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db, YOUTUBE_API_KEY } from "./config.js";

export var PlayerIcons = {
    play: "https://cdn-icons-png.flaticon.com/128/7238/7238961.png",
    pause: "https://cdn-icons-png.flaticon.com/128/6520/6520121.png",
    fullscreen: "https://cdn-icons-png.flaticon.com/128/7304/7304806.png",
    exitFullscreen: "https://cdn-icons-png.flaticon.com/128/8669/8669479.png",
    fitScreen: "https://cdn-icons-png.flaticon.com/128/80/80998.png",
    subtitle: "https://cdn-icons-png.flaticon.com/512/5009/5009382.png",
    settings: "https://cdn-icons-png.freepik.com/256/8999/8999687.png?semt=ais_white_label",
};

var PlayerUI = {
    playerPageView: document.getElementById('player-page-view'),
    playerWrapper: document.getElementById('player-wrapper'),
    movieInfo: document.getElementById('movie-info'),
    relatedContainer: document.getElementById('related-content-container'),
    relatedTitle: document.getElementById('related-title'),
    likeBtn: document.getElementById('like-btn'),
    dislikeBtn: document.getElementById('dislike-btn'),
    likeCount: document.getElementById('like-count'),
    dislikeCount: document.getElementById('dislike-count'),
    commentBtn: document.getElementById('comment-btn'),
    commentSection: document.getElementById('comment-section'),
    closeCommentsBtn: document.getElementById('close-comments-btn'),
    commentForm: document.getElementById('comment-form'),
    commentInput: document.getElementById('comment-input'),
    commentsList: document.getElementById('comments-list'),
    playerTitleHeader: document.getElementById('player-page-title-header')
};

// ===== Responsive CSS Inject =====
(function injectResponsiveCSS(){
    const css = `
    #player-page-view { background:#0a0a0a; }
    #player-container { width:100%; background:#000; }
    #player-wrapper { position:relative; width:100%; aspect-ratio:16/9; background:#000; overflow:hidden; max-height: calc(100vh - 56px); }
    #player-wrapper video, #player-wrapper iframe { width:100%; height:100%; object-fit:contain; }
    #player-wrapper .video-fit-cover { object-fit:cover !important; }

    /* Desktop Layout */
    @media (min-width: 1024px) {
        #player-page-view main { max-width:100% !important; padding:0 !important; }
        .player-desktop-layout { display:grid; grid-template-columns: 1fr 380px; gap:0; max-width:1600px; margin:0 auto; }
        .player-left { min-width:0; }
        #player-wrapper { aspect-ratio:16/9; max-height:75vh; border-radius:12px; margin:16px; width:calc(100% - 32px); }
        #player-wrapper.rotated-view { margin:0; width:100%; max-height:100vh; border-radius:0; }
        #movie-info, #action-bar { padding-left:16px; padding-right:16px; }
        #related-content { border-left:1px solid #1f1f1f; background:#0e0e0e; height:100vh; overflow-y:auto; position:sticky; top:0; padding:16px; }
        #related-content-container { flex-direction:column !important; }
        #related-content-container .content-link { height:auto !important; padding:10px !important; border-radius:12px; }
        #player-controls-container, #player-controls-container-live { padding:12px 16px !important; }
    }
    @media (min-width: 768px) and (max-width: 1023px) {
        #player-wrapper { max-height:60vh; }
        #related-content-container { display:grid !important; grid-template-columns:1fr 1fr; gap:12px; }
    }
    @media (max-width: 767px) {
        #player-wrapper { aspect-ratio:16/9; max-height:56vw; }
        #movie-info h1 { font-size:18px !important; line-height:1.3; }
    }
    #custom-controls-overlay, #player-controls-container, #player-controls-container-live, #progress-container { transition: all 0.3s ease; }
    .view-mode-btn { position:absolute; top:12px; z-index:20; background:rgba(0,0,0,0.6); backdrop-filter:blur(10px); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.1); }
    .close-rotated-view-btn { right:12px; display:none; }
    .enter-rotated-view-btn { right:12px; }
    #player-wrapper.rotated-view .close-rotated-view-btn { display:flex !important; }
    #player-wrapper.rotated-view .enter-rotated-view-btn { display:none !important; }
    #player-wrapper.rotated-view { position:fixed !important; inset:0 !important; width:100vw !important; height:100vh !important; z-index:9999 !important; aspect-ratio:auto !important; max-height:none !important; }
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
})();

function formatViews(num) { if (!num || isNaN(num)) return '0'; if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'; if (num >= 1000) return (num / 1000).toFixed(1) + 'K'; return String(num); }
function getUserName() { try { const user = JSON.parse(localStorage.getItem('novaUser')); return (user && user.name) ? user.name : 'Rs Live User'; } catch (e) { return 'Rs Live User'; } }

export var Player = {
    UI: PlayerUI,
    state: { movieRef: null, unsubscribe: null, currentVideoElement: null, controlsTimeout: null, hlsInstance: null, isScrubbing: false, playerType: 'movie', isYouTube: false, tapHandler: null, lastTap: 0, viewIncremented: false },

    incrementViewCount: async function(docRef) {
        if (this.state.viewIncremented) return;
        try { await updateDoc(docRef, { views: increment(1) }); this.state.viewIncremented = true; } catch (error) { try { await updateDoc(docRef, { views: 1 }); this.state.viewIncremented = true; } catch (err) { console.warn('view count fail', err); } }
    },

    init: function(id) {
        this.cleanupPlayer();
        this.state.viewIncremented = false;
        this.state.playerType = id.startsWith('moviesSections/') ? 'movie' : 'live';
        if (id.startsWith('youtube/')) { this.initYouTubeVideo(id.split('/')[1]); return; }
        if (this.state.unsubscribe) this.state.unsubscribe();

        // Desktop layout wrapper
        this.setupDesktopLayout();

        var playerContent = document.createElement('div'); playerContent.className = 'player-content';
        this.UI.playerWrapper.appendChild(playerContent);
        var loader = document.createElement('div'); loader.className = 'player-loader'; loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.UI.playerWrapper.appendChild(loader);
        this.UI.playerWrapper.classList.add('loading');
        this.UI.movieInfo.innerHTML = ''; this.UI.relatedContainer.innerHTML = '';
        this.state.movieRef = doc(db, id);
        var isFirstLoad = true;

        this.state.unsubscribe = onSnapshot(this.state.movieRef, async function(docSnap) {
            if (!docSnap.exists()) { this.UI.playerWrapper.classList.remove('loading'); playerContent.innerHTML = '<p class="text-center p-4">Content not available.</p>'; return; }
            var content = docSnap.data();
            if (isFirstLoad) {
                this.createPlayer(content.videoUrl || content.streamUrl, content.posterUrl || content.logoUrl, this.state.playerType);
                this.UI.playerTitleHeader.textContent = content.title || content.name;
                var views = content.views || 0;
                this.UI.movieInfo.innerHTML = '<h1 class="text-2xl md:text-3xl font-bold mb-2 leading-tight">' + (content.title || content.name) + '</h1><p class="text-gray-300 text-[14px] md:text-[15px] leading-relaxed">' + (content.description || '') + '</p><p class="text-sm text-gray-400 mt-3 flex items-center gap-2"><i class="fas fa-eye"></i> ' + formatViews(views) + ' views • ' + (content.category || 'Rs Live Tv') + '</p>';
                this.incrementViewCount(this.state.movieRef);
                this.loadRelatedContent(id);
                this.setupActionHandlers(id);
                this.setupCommentSection(id);
                isFirstLoad = false;
            }
            this.UI.likeCount.textContent = content.likes || 0;
            this.UI.dislikeCount.textContent = content.dislikes || 0;
            var viewElement = this.UI.movieInfo.querySelector('.text-sm.text-gray-400');
            if (viewElement) viewElement.innerHTML = '<i class="fas fa-eye"></i> ' + formatViews(content.views || 0) + ' views • ' + (content.category || 'Rs Live Tv');
            this.updateActionButtonsUI(id);
        }.bind(this));
    },

    setupDesktopLayout: function(){
        const main = document.querySelector('#player-page-view main');
        if(!main || main.classList.contains('player-desktop-layout')) return;
        if(window.innerWidth >= 1024){
            const actionBar = document.getElementById('action-bar');
            const movieInfo = document.getElementById('movie-info');
            const related = document.getElementById('related-content');
            if(actionBar && movieInfo && related){
                main.classList.add('player-desktop-layout');
                let left = main.querySelector('.player-left');
                if(!left){
                    left = document.createElement('div'); left.className='player-left';
                    main.prepend(left);
                    left.appendChild(document.getElementById('player-container'));
                    left.appendChild(actionBar);
                    left.appendChild(movieInfo);
                }
            }
        }
    },

    initYouTubeVideo: async function(videoId) {
        this.state.playerType = 'live'; this.state.isYouTube = true;
        this.setupDesktopLayout();
        var playerContent = document.createElement('div'); playerContent.className = 'player-content';
        this.UI.playerWrapper.appendChild(playerContent); this.UI.playerWrapper.classList.add('loading');
        try {
            var data = null; var attempts = 0;
            while (attempts < 3 && !data) {
                try { var response = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' + videoId + '&key=' + YOUTUBE_API_KEY); if (!response.ok) throw new Error('HTTP ' + response.status); data = await response.json(); if (data.items && data.items.length > 0) break; } catch (err) { attempts++; if (attempts < 3) await new Promise(function(r) { setTimeout(r, 1000 * attempts); }); }
            }
            if (data && data.items && data.items.length > 0) {
                var videoInfo = data.items[0].snippet;
                var embedUrl = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&modestbranding=1&rel=0&playsinline=1';
                this.createPlayer(embedUrl, videoInfo.thumbnails.high.url, 'youtube');
                this.UI.playerTitleHeader.textContent = videoInfo.title;
                this.UI.movieInfo.innerHTML = '<h1 class="text-2xl font-bold mb-2">' + videoInfo.title + '</h1><p class="text-gray-300 text-sm">' + videoInfo.description.replace(/\\n/g, '<br>').substring(0,300) + '</p>';
                document.getElementById('action-bar').style.display = 'none';
            } else { playerContent.innerHTML = '<p class="text-center p-4 text-red-400">YouTube video not found.</p>'; this.UI.playerWrapper.classList.remove('loading'); }
        } catch (error) { playerContent.innerHTML = '<p class="text-center p-4 text-red-400">Could not load YouTube video.</p>'; this.UI.playerWrapper.classList.remove('loading'); }
    },

    createPlayer: function(videoUrl, posterUrl, playerType) {
        var playerContent = this.UI.playerWrapper.querySelector('.player-content'); if (!playerContent) return;
        var lowerCaseUrl = videoUrl ? videoUrl.toLowerCase() : '';
        var isIframe = lowerCaseUrl.includes('bongobd.com') || lowerCaseUrl.includes('youtube.com/embed');
        var isDirectVideo = !isIframe && (lowerCaseUrl.includes('.m3u8') || ['.mp4', '.mkv', '.webm'].some(function(ext) { return lowerCaseUrl.includes(ext); }));

        if (isDirectVideo && videoUrl) {
            playerContent.innerHTML = '<video id="video-player" poster="' + posterUrl + '" playsinline class="bg-black w-full h-full"></video>';
            var video = document.getElementById('video-player'); this.state.currentVideoElement = video; this.state.isYouTube = false;
            if (lowerCaseUrl.includes('.m3u8')) {
                if (Hls.isSupported()) {
                    this.state.hlsInstance = new Hls({ maxBufferLength:30 });
                    this.state.hlsInstance.loadSource(videoUrl); this.state.hlsInstance.attachMedia(video);
                    this.state.hlsInstance.on(Hls.Events.ERROR, function(event, data) { if (data.fatal) { if (data.type === Hls.ErrorTypes.NETWORK_ERROR) this.state.hlsInstance.startLoad(); else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) this.state.hlsInstance.recoverMediaError(); else this.state.hlsInstance.destroy(); } }.bind(this));
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = videoUrl; }
            } else { video.src = videoUrl; }
            if (playerType === 'movie') this.setupMovieControls(video); else this.setupLiveTvControls(video);
        } else if (videoUrl) {
            this.UI.playerWrapper.classList.remove('loading');
            var iframeId = this.state.isYouTube ? 'youtube-iframe' : 'external-iframe';
            playerContent.innerHTML = '<iframe id="' + iframeId + '" src="' + videoUrl + '" frameborder="0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen class="w-full h-full"></iframe>';
            if (this.state.isYouTube) this.setupYouTubeFullscreenHandler();
            this.addRotatedViewButtons();
            this.state.currentVideoElement = null;
        } else { this.UI.playerWrapper.classList.remove('loading'); playerContent.innerHTML = '<p class="text-center p-4">No video source found.</p>'; }
    },

    setupYouTubeFullscreenHandler: function() {
        var iframe = document.getElementById('youtube-iframe'); if (!iframe) return;
        var checkFullscreen = function() { var isFullscreen = document.fullscreenElement === iframe || document.webkitFullscreenElement === iframe; if (isFullscreen) { this.UI.playerWrapper.classList.remove('rotated-view'); document.body.style.overflow = ''; } }.bind(this);
        document.addEventListener('fullscreenchange', checkFullscreen); document.addEventListener('webkitfullscreenchange', checkFullscreen); window.addEventListener('resize', checkFullscreen);
        this.state.youtubeFullscreenCleanup = function() { document.removeEventListener('fullscreenchange', checkFullscreen); document.removeEventListener('webkitfullscreenchange', checkFullscreen); window.removeEventListener('resize', checkFullscreen); };
    },

    setupLiveTvControls: function(video) {
        var closeBtn = document.createElement('button'); closeBtn.className = 'view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML = '<img src="' + PlayerIcons.exitFullscreen + '" alt="Exit" style="width:20px;height:20px;filter:brightness(0) invert(1);">'; closeBtn.onclick = function(e){e.stopPropagation(); this.toggleRotateView();}.bind(this);
        var controlsHTML = '<div id="custom-controls-overlay" class="visible absolute inset-0 flex items-center justify-center bg-black/20"><button id="custom-play-pause-btn" class="w-16 h-16 md:w-20 md:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20"><img src="' + PlayerIcons.play + '" alt="Play" style="width:28px"></button></div><div id="settings-panel" class="absolute bottom-16 right-4 bg-black/80 backdrop-blur-md rounded-xl p-2 hidden flex-col gap-1"><button class="resolution-option px-4 py-2 text-sm hover:bg-white/10 rounded-lg">1080p</button><button class="resolution-option px-4 py-2 text-sm hover:bg-white/10 rounded-lg">720p</button><button class="resolution-option px-4 py-2 text-sm hover:bg-white/10 rounded-lg">Auto</button></div><div id="player-controls-container-live" class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent flex justify-between items-center"><span class="live-indicator bg-red-600 text-white text-[11px] px-2.5 py-1 rounded-full font-bold tracking-wider animate-pulse">LIVE</span><div class="live-controls-right flex gap-2"><button id="fit-screen-btn" class="player-control-btn w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"><img src="' + PlayerIcons.fitScreen + '" alt="Fit" style="width:18px;filter:invert(1)"></button><button id="settings-btn" class="player-control-btn w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"><img src="' + PlayerIcons.settings + '" alt="Settings" style="width:18px"></button><button class="enter-rotated-view-btn player-control-btn w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"><img src="' + PlayerIcons.fullscreen + '" alt="Full" style="width:18px;filter:invert(1)"></button></div></div>';
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend', controlsHTML);
        var centerPlayPauseBtn = document.getElementById('custom-play-pause-btn'); var rotateBtn = this.UI.playerWrapper.querySelector('.enter-rotated-view-btn'); var settingsBtn = document.getElementById('settings-btn'); var settingsPanel = document.getElementById('settings-panel'); var fitScreenBtn = document.getElementById('fit-screen-btn');
        var togglePlay = function(){ video.paused ? video.play() : video.pause(); };
        video.addEventListener('play', function(){ centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.pause + '" alt="Pause" style="width:28px">'; document.getElementById('custom-controls-overlay').classList.remove('visible'); document.getElementById('custom-controls-overlay').classList.add('hidden'); });
        video.addEventListener('pause', function(){ centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.play + '" alt="Play" style="width:28px">'; document.getElementById('custom-controls-overlay').classList.remove('hidden'); document.getElementById('custom-controls-overlay').classList.add('visible'); });
        video.addEventListener('waiting', function(){ this.UI.playerWrapper.classList.add('loading'); }.bind(this)); video.addEventListener('playing', function(){ this.UI.playerWrapper.classList.remove('loading'); }.bind(this));
        video.addEventListener('canplay', function(){ this.UI.playerWrapper.classList.remove('loading'); video.play().catch(function(){ document.getElementById('custom-controls-overlay').classList.remove('hidden'); }); }.bind(this));
        centerPlayPauseBtn.addEventListener('click', function(e){ e.stopPropagation(); togglePlay(); });
        rotateBtn.onclick = function(e){ e.stopPropagation(); this.toggleRotateView(); }.bind(this);
        settingsBtn.addEventListener('click', function(e){ e.stopPropagation(); settingsPanel.classList.toggle('hidden'); settingsPanel.classList.toggle('flex'); });
        fitScreenBtn.onclick = function(e){ e.stopPropagation(); video.classList.toggle('video-fit-cover'); };
        this.addSimpleTapGesture(video);
        // Keyboard shortcut for desktop
        document.addEventListener('keydown', function(e){ if(e.code==='Space'){ e.preventDefault(); togglePlay(); } if(e.code==='KeyF'){ this.toggleRotateView(); } }.bind(this));
    },

    setupMovieControls: function(video) {
        var closeBtn = document.createElement('button'); closeBtn.className = 'view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML = '<img src="' + PlayerIcons.exitFullscreen + '" alt="Exit" style="width:20px;height:20px;filter:brightness(0) invert(1);">'; closeBtn.onclick = function(e){ e.stopPropagation(); this.toggleRotateView(); }.bind(this);
        var controlsHTML = '<div id="double-tap-overlay" class="absolute inset-0 flex pointer-events-none"><div class="tap-zone flex-1" id="tap-rewind"></div><div class="tap-zone flex-1" id="tap-forward"></div></div><div id="custom-controls-overlay" class="visible absolute inset-0 flex items-center justify-center bg-black/20"><button id="custom-play-pause-btn" class="w-16 h-16 md:w-20 md:h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20"><img src="' + PlayerIcons.play + '" alt="Play" style="width:28px"></button></div><div id="player-controls-container" class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent"><div id="progress-container" class="mb-3"><div id="progress-bar-wrapper" class="relative h-1.5 bg-white/20 rounded-full group hover:h-2 transition-all"><div id="progress-buffered" class="absolute h-full bg-white/30 rounded-full" style="width:0%"></div><div id="progress-played" class="absolute h-full bg-red-600 rounded-full" style="width:0%"></div><input type="range" id="progress-bar" value="0" min="0" step="1" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"></div></div><div class="controls-bottom-bar flex justify-between items-center"><div class="controls-left flex items-center gap-3"><button id="play-pause-btn" class="player-control-btn w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"><img src="' + PlayerIcons.play + '" alt="Play" style="width:16px;filter:invert(1)"></button><span id="time-display" class="text-[12px] md:text-[13px] text-white/90 font-medium">00:00 / 00:00</span></div><div class="controls-right flex items-center gap-2"><button id="fit-screen-btn" class="player-control-btn w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"><img src="' + PlayerIcons.fitScreen + '" alt="Fit" style="width:18px;filter:invert(1)"></button><button class="enter-rotated-view-btn player-control-btn w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"><img src="' + PlayerIcons.fullscreen + '" alt="Full" style="width:18px;filter:invert(1)"></button></div></div></div>';
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend', controlsHTML);
        var centerPlayPauseBtn = document.getElementById('custom-play-pause-btn'); var playPauseBtn = document.getElementById('play-pause-btn'); var progressBar = document.getElementById('progress-bar'); var progressBuffered = document.getElementById('progress-buffered'); var progressPlayed = document.getElementById('progress-played'); var timeDisplay = document.getElementById('time-display'); var rotateBtn = this.UI.playerWrapper.querySelector('.enter-rotated-view-btn'); var fitScreenBtn = document.getElementById('fit-screen-btn'); var tapRewind = document.getElementById('tap-rewind'); var tapForward = document.getElementById('tap-forward');
        var formatTime = function(t){ if(isNaN(t)) return '00:00'; var s=Math.floor(t%60), m=Math.floor(t/60)%60, h=Math.floor(t/3600); return h>0 ? h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0') : String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); };
        var togglePlay = function(){ video.paused ? video.play() : video.pause(); };
        video.addEventListener('play', function(){ playPauseBtn.innerHTML = '<img src="' + PlayerIcons.pause + '" alt="Pause" style="width:14px;filter:invert(1)">'; centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.pause + '" alt="Pause" style="width:28px">'; document.getElementById('custom-controls-overlay').classList.add('hidden'); });
        video.addEventListener('pause', function(){ playPauseBtn.innerHTML = '<img src="' + PlayerIcons.play + '" alt="Play" style="width:14px;filter:invert(1)">'; centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.play + '" alt="Play" style="width:28px">'; document.getElementById('custom-controls-overlay').classList.remove('hidden'); });
        video.addEventListener('canplay', function(){ this.UI.playerWrapper.classList.remove('loading'); }.bind(this));
        video.addEventListener('loadedmetadata', function(){ progressBar.max = video.duration; timeDisplay.textContent = formatTime(video.currentTime)+' / '+formatTime(video.duration); });
        video.addEventListener('timeupdate', function(){ if(!this.state.isScrubbing){ progressBar.value = video.currentTime; progressPlayed.style.width = ((video.currentTime / video.duration)*100)+'%'; } timeDisplay.textContent = formatTime(video.currentTime)+' / '+formatTime(video.duration); }.bind(this));
        video.addEventListener('progress', function(){ if(video.buffered.length>0){ progressBuffered.style.width = ((video.buffered.end(video.buffered.length-1)/video.duration)*100)+'%'; } });
        playPauseBtn.onclick = centerPlayPauseBtn.onclick = function(e){ e.stopPropagation(); togglePlay(); };
        rotateBtn.onclick = function(e){ e.stopPropagation(); this.toggleRotateView(); }.bind(this);
        fitScreenBtn.onclick = function(e){ e.stopPropagation(); video.classList.toggle('video-fit-cover'); };
        progressBar.addEventListener('mousedown', function(){ this.state.isScrubbing=true; }.bind(this)); progressBar.addEventListener('mouseup', function(){ this.state.isScrubbing=false; }.bind(this));
        progressBar.addEventListener('input', function(e){ var newTime=e.target.value; progressPlayed.style.width=((newTime/video.duration)*100)+'%'; timeDisplay.textContent=formatTime(newTime)+' / '+formatTime(video.duration); });
        progressBar.addEventListener('change', function(){ video.currentTime = progressBar.value; });
        var handleDoubleTap = function(e){ if(Date.now()-(this.state.lastTap||0)<300){ video.currentTime = video.currentTime + (e.currentTarget.id==='tap-forward'?10:-10); this.state.lastTap=0; } else { this.state.lastTap=Date.now(); } }.bind(this);
        tapRewind.addEventListener('click', handleDoubleTap); tapForward.addEventListener('click', handleDoubleTap);
        video.addEventListener('ended', function(){ if(localStorage.getItem('autoplayNext')==='true'){ var nextLink=Player.UI.relatedContainer.querySelector('.content-link'); if(nextLink && nextLink.dataset.id) App.showPlayerPage(nextLink.dataset.id); } });
        this.addSimpleTapGesture(video);
    },

    addSimpleTapGesture: function(video) {
        var pWrap = this.UI.playerWrapper; if(this.state.tapHandler) return;
        var handleTap = function(e){ if(e.target.closest('button, input, a, .content-link, .player-control-btn, .view-mode-btn')) return; if(this.state.isYouTube){ var iframe=document.getElementById('youtube-iframe'); if(iframe && (document.fullscreenElement===iframe || document.webkitFullscreenElement===iframe)) return; } var vis=pWrap.classList.toggle('controls-visible'); var overlay=document.getElementById('custom-controls-overlay'); if(overlay){ if(video.paused && vis) overlay.classList.remove('hidden'); else if(!video.paused && !vis) overlay.classList.add('hidden'); } if(vis){ clearTimeout(this.state.controlsTimeout); if(!video.paused){ this.state.controlsTimeout=setTimeout(function(){ pWrap.classList.remove('controls-visible'); if(overlay) overlay.classList.add('hidden'); },3000); } } }.bind(this);
        pWrap.addEventListener('click', handleTap); this.state.tapHandler=handleTap;
    },

    addRotatedViewButtons: function() {
        var closeBtn=document.createElement('button'); closeBtn.className='view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML='<img src="' + PlayerIcons.exitFullscreen + '" alt="Exit" style="width:20px;height:20px;filter:brightness(0) invert(1);">'; closeBtn.onclick=function(e){e.stopPropagation(); this.toggleRotateView();}.bind(this);
        var enterBtn=document.createElement('button'); enterBtn.className='view-mode-btn enter-rotated-view-btn'; enterBtn.innerHTML='<img src="' + PlayerIcons.fullscreen + '" alt="Full" style="width:20px;height:20px;filter:brightness(0) invert(1);">'; enterBtn.onclick=function(e){e.stopPropagation(); this.toggleRotateView();}.bind(this);
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.appendChild(enterBtn);
    },

    toggleRotateView: function() {
        if(this.state.isYouTube){ var iframe=document.getElementById('youtube-iframe'); if(iframe && (document.fullscreenElement===iframe || document.webkitFullscreenElement===iframe)) return; }
        var isRotated=this.UI.playerWrapper.classList.toggle('rotated-view');
        document.body.style.overflow=isRotated?'hidden':'';
        if(isRotated && this.UI.playerWrapper.requestFullscreen){ /* optional fullscreen API */ }
    },

    cleanupPlayer: function() {
        if(this.state.youtubeFullscreenCleanup){ this.state.youtubeFullscreenCleanup(); this.state.youtubeFullscreenCleanup=null; }
        if(this.state.tapHandler){ this.UI.playerWrapper.removeEventListener('click', this.state.tapHandler); this.state.tapHandler=null; }
        if(this.state.hlsInstance){ this.state.hlsInstance.destroy(); this.state.hlsInstance=null; }
        if(this.state.currentVideoElement){ this.state.currentVideoElement.pause(); this.state.currentVideoElement.src=''; this.state.currentVideoElement.load(); }
        this.UI.playerWrapper.innerHTML=''; this.UI.playerWrapper.className='relative w-full bg-black'; this.UI.playerWrapper.style.filter=''; clearTimeout(this.state.controlsTimeout); document.body.style.overflow='';
        var actionBar=document.getElementById('action-bar'); if(actionBar) actionBar.style.display='flex';
        var related=document.getElementById('related-content'); if(related) related.style.display='block';
        this.state.isYouTube=false; this.state.viewIncremented=false;
        // restore desktop layout
        const main=document.querySelector('#player-page-view main'); if(main && main.classList.contains('player-desktop-layout')){ /* keep layout for next */ }
    },

    destroyPlayer: function(){ this.cleanupPlayer(); if(this.state.unsubscribe){ this.state.unsubscribe(); this.state.unsubscribe=null; } },

    loadRelatedContent: async function(path) {
        this.UI.relatedContainer.innerHTML='';
        var cId=path.split('/').pop(); var isLive=path.startsWith('liveTV'); var colPath=isLive?'liveTV':path.substring(0, path.lastIndexOf('/'));
        this.UI.relatedTitle.innerHTML='<span class="text-gray-400 font-normal text-[11px] uppercase tracking-widest">Up Next • Rs Live Tv</span>';
        this.UI.relatedTitle.className='mb-3 block pb-2';
        this.UI.relatedContainer.className='flex flex-col gap-2 pb-20';

        var q=query(collection(db, colPath), where("__name__", "!=", cId), limit(20));
        var snap=await getDocs(q);
        snap.forEach(function(d){
            var con=d.data(); var card=document.createElement('div'); card.className='w-full bg-[#151515] hover:bg-[#1e1e1e] rounded-xl transition-all duration-200 overflow-hidden border border-[#222] hover:border-[#333]';
            var logoUrl=con.logoUrl || con.posterUrl || 'https://via.placeholder.com/48/333333/ffffff?text=?';
            var badgeHtml=isLive?'<span class="absolute -top-0.5 -right-0.5 text-[8px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">LIVE</span>': (con.duration?'<span class="absolute bottom-0 right-0 text-[9px] bg-black/80 text-white px-1.5 py-0.5 rounded-tr-lg">'+con.duration+'</span>':'');
            var viewText=(con.views && con.views>0)?formatViews(con.views)+' views':'Recommended';
            var categoryName=con.category || 'Rs Live Tv';
            card.innerHTML='<a href="#" data-id="' + colPath + '/' + d.id + '" class="content-link flex items-center gap-3 p-2.5 group w-full"><div class="relative flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden bg-[#222] border border-[#333]"><img src="' + logoUrl + '" alt="' + (con.title||con.name) + '" loading="lazy" class="w-full h-full object-cover transition-opacity duration-300 opacity-0 group-hover:scale-105" onload="this.classList.remove(\'opacity-0\')" onerror="this.style.display=\'none\'" />' + badgeHtml + '</div><div class="flex-1 min-w-0"><h4 class="text-white text-[13px] md:text-[14px] font-medium leading-tight truncate group-hover:text-red-400 transition-colors">' + (con.title||con.name) + '</h4><div class="flex items-center gap-1.5 mt-1"><span class="text-[11px] text-gray-400 truncate">' + categoryName + '</span><span class="text-[10px] text-gray-600">•</span><span class="text-[10px] text-gray-500">' + viewText + '</span></div></div><div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><div class="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center"><i class="fas fa-play text-red-400 text-[10px]"></i></div></div></a>';
            this.UI.relatedContainer.appendChild(card);
        }.bind(this));
        if(snap.empty){ this.UI.relatedContainer.innerHTML='<p class="text-gray-500 text-sm text-center py-4">No related videos found.</p>'; }
    },

    setupActionHandlers: function(p){ var k='action_' + p.replace(/\\//g, '_'); this.UI.likeBtn.onclick=function(){ this.handleVote('likes', k); }.bind(this); this.UI.dislikeBtn.onclick=function(){ this.handleVote('dislikes', k); }.bind(this); },
    handleVote: async function(t, k){ var c=localStorage.getItem(k); var o=t==='likes'?'dislikes':'likes'; var u={}; if(c===t){ u[t]=increment(-1); localStorage.removeItem(k); } else { u[t]=increment(1); if(c) u[o]=increment(-1); localStorage.setItem(k, t); } await updateDoc(this.state.movieRef, u); },
    updateActionButtonsUI: function(p){ var k='action_' + p.replace(/\\//g, '_'); var v=localStorage.getItem(k); this.UI.likeBtn.classList.toggle('active', v==='likes'); this.UI.dislikeBtn.classList.toggle('active', v==='dislikes'); },
    setupCommentSection: function(p){ var c=collection(db, p + '/comments'); this.UI.commentBtn.onclick=function(){ this.UI.commentSection.classList.add('open'); }.bind(this); this.UI.closeCommentsBtn.onclick=function(){ this.UI.commentSection.classList.remove('open'); }.bind(this); this.UI.commentForm.onsubmit=async function(e){ e.preventDefault(); var t=this.UI.commentInput.value.trim(); if(t){ var authorName=getUserName(); await addDoc(c, { text: t, author: authorName, createdAt: serverTimestamp() }); this.UI.commentInput.value=''; } }.bind(this); this.listenForComments(c); },
    listenForComments: function(r){ onSnapshot(query(r, orderBy('createdAt', 'desc')), function(s){ this.UI.commentsList.innerHTML=''; s.forEach(function(d){ var c=d.data(); var a=c.createdAt && c.createdAt.toDate ? c.createdAt.toDate().toLocaleString() : ''; var e=document.createElement('div'); e.className='border-b border-gray-800 py-3'; e.innerHTML='<div class="flex items-start space-x-3"><i class="fas fa-user-circle text-2xl text-gray-500"></i><div><p class="font-semibold text-white text-sm">' + c.author + ' <span class="text-xs text-gray-500 ml-2">' + a + '</span></p><p class="text-gray-300 text-sm break-words mt-1">' + c.text + '</p></div></div>'; this.UI.commentsList.appendChild(e); }.bind(this)); }.bind(this)); }
};
