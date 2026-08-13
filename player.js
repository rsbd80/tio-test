// player.js
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

function formatViews(num) {
    if (!num || isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
}

function getUserName() {
    try {
        const user = JSON.parse(localStorage.getItem('novaUser'));
        return (user && user.name) ? user.name : 'Nova Stream User';
    } catch (e) {
        return 'Nova Stream User';
    }
}

export var Player = {
    UI: PlayerUI,
    state: { 
        movieRef: null, 
        unsubscribe: null, 
        currentVideoElement: null, 
        controlsTimeout: null, 
        hlsInstance: null, 
        isScrubbing: false, 
        playerType: 'movie', 
        isYouTube: false, 
        tapHandler: null, 
        lastTap: 0, 
        viewIncremented: false,
        isFullscreen: false,
        fullscreenChangeHandler: null,
        orientationHandler: null,
        originalStyles: {},
        isMobile: window.innerWidth < 768
    },

    // ✅ ফুলস্ক্রিন টগল - সব ডিভাইসের জন্য
    toggleFullscreen: function() {
        var playerWrapper = this.UI.playerWrapper;
        var isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        
        if (isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    },

    // ✅ ফুলস্ক্রিনে যান
    enterFullscreen: function() {
        var playerWrapper = this.UI.playerWrapper;
        
        // মোবাইলে রোটেটেড ভিউ চেক
        if (this.state.isMobile && this.UI.playerWrapper.classList.contains('rotated-view')) {
            this.UI.playerWrapper.classList.remove('rotated-view');
            document.body.style.overflow = '';
        }
        
        // নেটিভ ফুলস্ক্রিন API ব্যবহার
        var requestFullscreen = playerWrapper.requestFullscreen || 
                               playerWrapper.webkitRequestFullscreen || 
                               playerWrapper.mozRequestFullScreen || 
                               playerWrapper.msRequestFullscreen;
        
        if (requestFullscreen) {
            requestFullscreen.call(playerWrapper).catch(function(err) {
                console.warn('Fullscreen request failed:', err);
                // ফলব্যাক: CSS ফুলস্ক্রিন
                this.enterCSSFullscreen();
            }.bind(this));
        } else {
            // ফলব্যাক: CSS ফুলস্ক্রিন
            this.enterCSSFullscreen();
        }
        
        this.state.isFullscreen = true;
    },

    // ✅ ফুলস্ক্রিন থেকে বের হন
    exitFullscreen: function() {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
        
        // CSS ফুলস্ক্রিন ক্লিনআপ
        this.exitCSSFullscreen();
        
        this.state.isFullscreen = false;
        this.UI.playerWrapper.classList.remove('fullscreen-mode');
        document.body.style.overflow = '';
    },

    // ✅ CSS ফুলস্ক্রিন (ফলব্যাক)
    enterCSSFullscreen: function() {
        var wrapper = this.UI.playerWrapper;
        this.state.originalStyles = {
            position: wrapper.style.position,
            top: wrapper.style.top,
            left: wrapper.style.left,
            width: wrapper.style.width,
            height: wrapper.style.height,
            zIndex: wrapper.style.zIndex,
            backgroundColor: wrapper.style.backgroundColor,
            overflow: document.body.style.overflow
        };
        
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '100vw';
        wrapper.style.height = '100vh';
        wrapper.style.zIndex = '99999';
        wrapper.style.backgroundColor = '#000';
        document.body.style.overflow = 'hidden';
        wrapper.classList.add('fullscreen-mode');
    },

    exitCSSFullscreen: function() {
        var wrapper = this.UI.playerWrapper;
        var styles = this.state.originalStyles;
        
        wrapper.style.position = styles.position || '';
        wrapper.style.top = styles.top || '';
        wrapper.style.left = styles.left || '';
        wrapper.style.width = styles.width || '';
        wrapper.style.height = styles.height || '';
        wrapper.style.zIndex = styles.zIndex || '';
        wrapper.style.backgroundColor = styles.backgroundColor || '';
        document.body.style.overflow = styles.overflow || '';
        wrapper.classList.remove('fullscreen-mode');
    },

    // ✅ ফুলস্ক্রিন ইভেন্ট লিসেনার
    setupFullscreenListeners: function() {
        var fullscreenChange = function() {
            var isFullscreen = document.fullscreenElement || 
                             document.webkitFullscreenElement || 
                             document.mozFullScreenElement || 
                             document.msFullscreenElement;
            
            if (!isFullscreen && this.state.isFullscreen) {
                this.state.isFullscreen = false;
                this.UI.playerWrapper.classList.remove('fullscreen-mode');
                document.body.style.overflow = '';
                this.exitCSSFullscreen();
                this.updateFullscreenButton(false);
            } else if (isFullscreen) {
                this.state.isFullscreen = true;
                this.UI.playerWrapper.classList.add('fullscreen-mode');
                document.body.style.overflow = 'hidden';
                this.updateFullscreenButton(true);
            }
        }.bind(this);

        document.addEventListener('fullscreenchange', fullscreenChange);
        document.addEventListener('webkitfullscreenchange', fullscreenChange);
        document.addEventListener('mozfullscreenchange', fullscreenChange);
        document.addEventListener('MSFullscreenChange', fullscreenChange);
        
        this.state.fullscreenChangeHandler = fullscreenChange;
    },

    // ✅ ফুলস্ক্রিন বাটন আপডেট
    updateFullscreenButton: function(isFullscreen) {
        var buttons = this.UI.playerWrapper.querySelectorAll('.fullscreen-toggle-btn');
        buttons.forEach(function(btn) {
            if (isFullscreen) {
                btn.innerHTML = '<img src="' + PlayerIcons.exitFullscreen + '" alt="Exit Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">';
                btn.title = 'Exit Fullscreen';
            } else {
                btn.innerHTML = '<img src="' + PlayerIcons.fullscreen + '" alt="Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">';
                btn.title = 'Fullscreen';
            }
        });
    },

    // ✅ মোবাইল চেক আপডেট
    updateDeviceCheck: function() {
        this.state.isMobile = window.innerWidth < 768;
    },

    incrementViewCount: async function(docRef) {
        if (this.state.viewIncremented) return;
        try {
            await updateDoc(docRef, { views: increment(1) });
            this.state.viewIncremented = true;
            console.log('✅ View count incremented');
        } catch (error) {
            try {
                await updateDoc(docRef, { views: 1 });
                this.state.viewIncremented = true;
                console.log('✅ View count initialized to 1');
            } catch (err) {
                console.warn('⚠️ Could not update view count:', err);
            }
        }
    },

    init: function(id) {
        this.cleanupPlayer();
        this.updateDeviceCheck();
        this.state.viewIncremented = false;
        this.state.playerType = id.startsWith('moviesSections/') ? 'movie' : 'live';
        
        // ফুলস্ক্রিন লিসেনার সেটআপ
        this.setupFullscreenListeners();
        
        if (id.startsWith('youtube/')) {
            this.initYouTubeVideo(id.split('/')[1]);
            return;
        }
        
        if (this.state.unsubscribe) this.state.unsubscribe();

        var playerContent = document.createElement('div');
        playerContent.className = 'player-content';
        this.UI.playerWrapper.appendChild(playerContent);

        var loader = document.createElement('div');
        loader.className = 'player-loader';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.UI.playerWrapper.appendChild(loader);

        this.UI.playerWrapper.classList.add('loading');
        this.UI.movieInfo.innerHTML = '';
        this.UI.relatedContainer.innerHTML = '';
        this.state.movieRef = doc(db, id);
        var isFirstLoad = true;

        this.state.unsubscribe = onSnapshot(this.state.movieRef, async function(docSnap) {
            if (!docSnap.exists()) {
                this.UI.playerWrapper.classList.remove('loading');
                playerContent.innerHTML = '<p class="text-center p-4">Content not available.</p>';
                return;
            }
            
            var content = docSnap.data();
            
            if (isFirstLoad) {
                this.createPlayer(
                    content.videoUrl || content.streamUrl, 
                    content.posterUrl || content.logoUrl, 
                    this.state.playerType
                );
                
                this.UI.playerTitleHeader.textContent = content.title || content.name;

                var views = content.views || 0;
                var viewText = formatViews(views) + ' views';
                this.UI.movieInfo.innerHTML = 
                    '<h1 class="text-2xl md:text-3xl font-bold mb-2">' + (content.title || content.name) + '</h1>' +
                    '<p class="text-gray-300">' + (content.description || '') + '</p>' +
                    '<p class="text-sm text-gray-400 mt-2"><i class="fas fa-eye mr-1"></i> ' + viewText + '</p>';

                this.incrementViewCount(this.state.movieRef);
                this.loadRelatedContent(id);
                this.setupActionHandlers(id);
                this.setupCommentSection(id);
                
                isFirstLoad = false;
            }
            
            this.UI.likeCount.textContent = content.likes || 0;
            this.UI.dislikeCount.textContent = content.dislikes || 0;
            
            var currentViews = content.views || 0;
            var currentViewText = formatViews(currentViews) + ' views';
            var viewElement = this.UI.movieInfo.querySelector('.text-sm.text-gray-400');
            if (viewElement) {
                viewElement.innerHTML = '<i class="fas fa-eye mr-1"></i> ' + currentViewText;
            }
            
            this.updateActionButtonsUI(id);
        }.bind(this));
    },

    initYouTubeVideo: async function(videoId) {
        this.state.playerType = 'live';
        this.state.isYouTube = true;
        var playerContent = document.createElement('div');
        playerContent.className = 'player-content';
        this.UI.playerWrapper.appendChild(playerContent);
        this.UI.playerWrapper.classList.add('loading');

        try {
            var data = null;
            var attempts = 0;
            while (attempts < 3 && !data) {
                try {
                    var response = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' + videoId + '&key=' + YOUTUBE_API_KEY);
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    data = await response.json();
                    if (data.items && data.items.length > 0) break;
                } catch (err) {
                    attempts++;
                    console.warn('YouTube API attempt ' + attempts + ' failed:', err);
                    if (attempts < 3) await new Promise(function(r) { setTimeout(r, 1000 * attempts); });
                }
            }

            if (data && data.items && data.items.length > 0) {
                var videoInfo = data.items[0].snippet;
                var embedUrl = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&modestbranding=1&rel=0&playsinline=1';
                this.createPlayer(embedUrl, videoInfo.thumbnails.high.url, 'youtube');
                this.UI.playerTitleHeader.textContent = videoInfo.title;
                this.UI.movieInfo.innerHTML = '<h1 class="text-2xl md:text-3xl font-bold mb-2">' + videoInfo.title + '</h1><p class="text-gray-300">' + videoInfo.description.replace(/\n/g, '<br>') + '</p>';
                document.getElementById('action-bar').style.display = 'none';
                document.getElementById('related-content').style.display = 'none';
            } else {
                playerContent.innerHTML = '<p class="text-center p-4 text-red-400">YouTube video not found.</p>';
                this.UI.playerWrapper.classList.remove('loading');
            }
        } catch (error) {
            console.error("YouTube error:", error);
            playerContent.innerHTML = '<p class="text-center p-4 text-red-400">Could not load YouTube video.</p>';
            this.UI.playerWrapper.classList.remove('loading');
        }
    },

    createPlayer: function(videoUrl, posterUrl, playerType) {
        var playerContent = this.UI.playerWrapper.querySelector('.player-content');
        if (!playerContent) return;

        var lowerCaseUrl = videoUrl ? videoUrl.toLowerCase() : '';
        var isIframe = lowerCaseUrl.includes('bongobd.com') || lowerCaseUrl.includes('youtube.com/embed');
        var isDirectVideo = !isIframe && (lowerCaseUrl.includes('.m3u8') || ['.mp4', '.mkv', '.webm'].some(function(ext) { return lowerCaseUrl.includes(ext); }));

        if (isDirectVideo && videoUrl) {
            playerContent.innerHTML = '<video id="video-player" poster="' + posterUrl + '" playsinline class="bg-black"></video>';
            var video = document.getElementById('video-player');
            this.state.currentVideoElement = video;
            this.state.isYouTube = false;

            if (lowerCaseUrl.includes('.m3u8')) {
                if (Hls.isSupported()) {
                    this.state.hlsInstance = new Hls();
                    this.state.hlsInstance.loadSource(videoUrl);
                    this.state.hlsInstance.attachMedia(video);
                    this.state.hlsInstance.on(Hls.Events.ERROR, function(event, data) {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log('Network error, trying to recover...');
                                    this.state.hlsInstance.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log('Media error, trying to recover...');
                                    this.state.hlsInstance.recoverMediaError();
                                    break;
                                default:
                                    this.state.hlsInstance.destroy();
                                    break;
                            }
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = videoUrl;
                }
            } else {
                video.src = videoUrl;
            }

            if (playerType === 'movie') this.setupMovieControls(video);
            else this.setupLiveTvControls(video);

        } else if (videoUrl) {
            this.UI.playerWrapper.classList.remove('loading');
            var iframeId = this.state.isYouTube ? 'youtube-iframe' : 'external-iframe';
            playerContent.innerHTML = '<iframe id="' + iframeId + '" src="' + videoUrl + '" frameborder="0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>';

            if (this.state.isYouTube) {
                this.setupYouTubeFullscreenHandler();
            }

            this.addFullscreenButtons();
            this.state.currentVideoElement = null;
        } else {
            this.UI.playerWrapper.classList.remove('loading');
            playerContent.innerHTML = '<p class="text-center p-4">No video source found.</p>';
        }
    },

    setupYouTubeFullscreenHandler: function() {
        var iframe = document.getElementById('youtube-iframe');
        if (!iframe) return;

        var checkFullscreen = function() {
            var isFullscreen = document.fullscreenElement === iframe || document.webkitFullscreenElement === iframe;
            if (isFullscreen) {
                this.UI.playerWrapper.classList.remove('rotated-view');
                document.body.style.overflow = '';
            }
        }.bind(this);

        document.addEventListener('fullscreenchange', checkFullscreen);
        document.addEventListener('webkitfullscreenchange', checkFullscreen);
        window.addEventListener('resize', checkFullscreen);

        this.state.youtubeFullscreenCleanup = function() {
            document.removeEventListener('fullscreenchange', checkFullscreen);
            document.removeEventListener('webkitfullscreenchange', checkFullscreen);
            window.removeEventListener('resize', checkFullscreen);
        };
    },

    setupLiveTvControls: function(video) {
        // ফুলস্ক্রিন বাটন
        var fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'view-mode-btn fullscreen-toggle-btn';
        fullscreenBtn.innerHTML = '<img src="' + PlayerIcons.fullscreen + '" alt="Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">';
        fullscreenBtn.onclick = function(e) { 
            e.stopPropagation();
            this.toggleFullscreen(); 
        }.bind(this);

        var controlsHTML = 
            '<div id="custom-controls-overlay" class="visible"><button id="custom-play-pause-btn"><img src="' + PlayerIcons.play + '" alt="Play"></button></div>' +
            '<div id="settings-panel"><button class="resolution-option">1080p</button><button class="resolution-option">720p</button><button class="resolution-option">480p</button><button class="resolution-option">Auto</button></div>' +
            '<div id="player-controls-container-live"> <span class="live-indicator">LIVE</span>' +
            '<div class="live-controls-right">' +
            '<button id="fit-screen-btn" class="player-control-btn"><img src="' + PlayerIcons.fitScreen + '" alt="Fit Screen"></button>' +
            '<button id="settings-btn" class="player-control-btn"><img src="' + PlayerIcons.settings + '" alt="Settings"></button>' +
            '<button class="fullscreen-toggle-btn player-control-btn"><img src="' + PlayerIcons.fullscreen + '" alt="Fullscreen"></button>' +
            '</div></div>';
            
        this.UI.playerWrapper.appendChild(fullscreenBtn);
        this.UI.playerWrapper.insertAdjacentHTML('beforeend', controlsHTML);

        var centerPlayPauseBtn = document.getElementById('custom-play-pause-btn');
        var settingsBtn = document.getElementById('settings-btn');
        var settingsPanel = document.getElementById('settings-panel');
        var fitScreenBtn = document.getElementById('fit-screen-btn');

        // সব ফুলস্ক্রিন বাটন সেটআপ
        var allFullscreenBtns = this.UI.playerWrapper.querySelectorAll('.fullscreen-toggle-btn');
        allFullscreenBtns.forEach(function(btn) {
            btn.onclick = function(e) { 
                e.stopPropagation();
                this.toggleFullscreen(); 
            }.bind(this);
        }.bind(this));

        var togglePlay = function() { video.paused ? video.play() : video.pause(); };
        
        video.addEventListener('play', function() {
            centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.pause + '" alt="Pause">';
            document.getElementById('custom-controls-overlay').classList.remove('visible');
        });
        video.addEventListener('pause', function() {
            centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.play + '" alt="Play">';
            document.getElementById('custom-controls-overlay').classList.add('visible');
        });
        video.addEventListener('waiting', function() { this.UI.playerWrapper.classList.add('loading'); }.bind(this));
        video.addEventListener('playing', function() { this.UI.playerWrapper.classList.remove('loading'); }.bind(this));
        video.addEventListener('canplay', function() {
            this.UI.playerWrapper.classList.remove('loading');
            video.play().catch(function() { document.getElementById('custom-controls-overlay').classList.add('visible'); });
        }.bind(this));

        centerPlayPauseBtn.addEventListener('click', function(e) { e.stopPropagation();
            togglePlay(); });
        settingsBtn.addEventListener('click', function(e) { e.stopPropagation();
            settingsPanel.classList.toggle('visible'); });
        fitScreenBtn.onclick = function(e) { e.stopPropagation();
            video.classList.toggle('video-fit-cover'); };

        this.addSimpleTapGesture(video);
    },

    setupMovieControls: function(video) {
        // ফুলস্ক্রিন বাটন
        var fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'view-mode-btn fullscreen-toggle-btn';
        fullscreenBtn.innerHTML = '<img src="' + PlayerIcons.fullscreen + '" alt="Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">';
        fullscreenBtn.onclick = function(e) { 
            e.stopPropagation();
            this.toggleFullscreen(); 
        }.bind(this);

        var controlsHTML = 
            '<div id="double-tap-overlay"><div class="tap-zone" id="tap-rewind"></div><div class="tap-zone" id="tap-forward"></div></div>' +
            '<div id="custom-controls-overlay" class="visible"><button id="custom-play-pause-btn"><img src="' + PlayerIcons.play + '" alt="Play"></button></div>' +
            '<div id="player-controls-container">' +
            '<div id="progress-container"> <div id="progress-bar-wrapper"> <div id="progress-buffered"></div> <div id="progress-played"></div> <input type="range" id="progress-bar" value="0" min="0" step="1"> </div> </div>' +
            '<div class="controls-bottom-bar">' +
            '<div class="controls-left"> <button id="play-pause-btn" class="player-control-btn"><img src="' + PlayerIcons.play + '" alt="Play"></button> <span id="time-display">00:00 / 00:00</span> </div>' +
            '<div class="controls-right"> <button id="fit-screen-btn" class="player-control-btn"><img src="' + PlayerIcons.fitScreen + '" alt="Fit Screen"></button> <button class="fullscreen-toggle-btn player-control-btn"><img src="' + PlayerIcons.fullscreen + '" alt="Fullscreen"></button> </div>' +
            '</div></div>';
            
        this.UI.playerWrapper.appendChild(fullscreenBtn);
        this.UI.playerWrapper.insertAdjacentHTML('beforeend', controlsHTML);

        // সব ফুলস্ক্রিন বাটন সেটআপ
        var allFullscreenBtns = this.UI.playerWrapper.querySelectorAll('.fullscreen-toggle-btn');
        allFullscreenBtns.forEach(function(btn) {
            btn.onclick = function(e) { 
                e.stopPropagation();
                this.toggleFullscreen(); 
            }.bind(this);
        }.bind(this));

        var centerPlayPauseBtn = document.getElementById('custom-play-pause-btn');
        var playPauseBtn = document.getElementById('play-pause-btn');
        var progressBar = document.getElementById('progress-bar');
        var progressBuffered = document.getElementById('progress-buffered');
        var progressPlayed = document.getElementById('progress-played');
        var timeDisplay = document.getElementById('time-display');
        var fitScreenBtn = document.getElementById('fit-screen-btn');
        var tapRewind = document.getElementById('tap-rewind');
        var tapForward = document.getElementById('tap-forward');

        var formatTime = function(t) {
            if (isNaN(t)) return '00:00';
            var s = Math.floor(t % 60),
                m = Math.floor(t / 60) % 60,
                h = Math.floor(t / 3600);
            return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        };
        var togglePlay = function() { video.paused ? video.play() : video.pause(); };

        video.addEventListener('play', function() {
            playPauseBtn.innerHTML = '<img src="' + PlayerIcons.pause + '" alt="Pause">';
            centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.pause + '" alt="Pause">';
            document.getElementById('custom-controls-overlay').classList.remove('visible');
        });
        video.addEventListener('pause', function() {
            playPauseBtn.innerHTML = '<img src="' + PlayerIcons.play + '" alt="Play">';
            centerPlayPauseBtn.innerHTML = '<img src="' + PlayerIcons.play + '" alt="Play">';
            document.getElementById('custom-controls-overlay').classList.add('visible');
        });
        video.addEventListener('waiting', function() { this.UI.playerWrapper.classList.add('loading'); }.bind(this));
        video.addEventListener('playing', function() { this.UI.playerWrapper.classList.remove('loading'); }.bind(this));
        video.addEventListener('canplay', function() {
            this.UI.playerWrapper.classList.remove('loading');
            video.play().catch(function() { document.getElementById('custom-controls-overlay').classList.add('visible'); });
        }.bind(this));
        video.addEventListener('loadedmetadata', function() {
            progressBar.max = video.duration;
            timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
        });
        video.addEventListener('timeupdate', function() {
            if (!this.state.isScrubbing) {
                progressBar.value = video.currentTime;
                progressPlayed.style.width = ((video.currentTime / video.duration) * 100) + '%';
            }
            timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
        }.bind(this));
        video.addEventListener('progress', function() {
            if (video.buffered.length > 0) {
                progressBuffered.style.width = ((video.buffered.end(video.buffered.length - 1) / video.duration) * 100) + '%';
            }
        });

        playPauseBtn.onclick = centerPlayPauseBtn.onclick = function(e) {
            e.stopPropagation();
            togglePlay();
        };
        
        fitScreenBtn.onclick = function(e) { 
            e.stopPropagation();
            video.classList.toggle('video-fit-cover'); 
        };

        progressBar.addEventListener('mousedown', function() { this.state.isScrubbing = true; }.bind(this));
        progressBar.addEventListener('mouseup', function() { this.state.isScrubbing = false; }.bind(this));
        progressBar.addEventListener('input', function(e) {
            var newTime = e.target.value;
            progressPlayed.style.width = ((newTime / video.duration) * 100) + '%';
            timeDisplay.textContent = formatTime(newTime) + ' / ' + formatTime(video.duration);
        });
        progressBar.addEventListener('change', function() { video.currentTime = progressBar.value; });

        var handleDoubleTap = function(e) {
            if (Date.now() - (this.state.lastTap || 0) < 300) {
                video.currentTime = video.currentTime + (e.currentTarget.id === 'tap-forward' ? 10 : -10);
                this.state.lastTap = 0;
            } else {
                this.state.lastTap = Date.now();
            }
        }.bind(this);
        tapRewind.addEventListener('click', handleDoubleTap);
        tapForward.addEventListener('click', handleDoubleTap);

        video.addEventListener('ended', function() {
            if (localStorage.getItem('autoplayNext') === 'true') {
                var nextLink = Player.UI.relatedContainer.querySelector('.content-link');
                if (nextLink && nextLink.dataset.id) App.showPlayerPage(nextLink.dataset.id);
            }
        });

        this.addSimpleTapGesture(video);
    },

    addSimpleTapGesture: function(video) {
        var pWrap = this.UI.playerWrapper;
        if (this.state.tapHandler) return;

        var handleTap = function(e) {
            if (e.target.closest('button, input, a, .content-link, .player-control-btn, .view-mode-btn')) return;

            if (this.state.isYouTube) {
                var iframe = document.getElementById('youtube-iframe');
                if (iframe && (document.fullscreenElement === iframe || document.webkitFullscreenElement === iframe)) {
                    return;
                }
            }

            var vis = pWrap.classList.toggle('controls-visible');
            var overlay = document.getElementById('custom-controls-overlay');
            if (overlay) {
                if (video.paused && vis) overlay.classList.add('visible');
                else overlay.classList.remove('visible');
            }
            if (vis) {
                clearTimeout(this.state.controlsTimeout);
                if (!video.paused) {
                    this.state.controlsTimeout = setTimeout(function() {
                        pWrap.classList.remove('controls-visible');
                        if (overlay) overlay.classList.remove('visible');
                    }, 3000);
                }
            }
        }.bind(this);

        pWrap.addEventListener('click', handleTap);
        this.state.tapHandler = handleTap;
    },

    addFullscreenButtons: function() {
        // এন্টার ফুলস্ক্রিন বাটন
        var enterBtn = document.createElement('button');
        enterBtn.className = 'view-mode-btn fullscreen-toggle-btn';
        enterBtn.innerHTML = '<img src="' + PlayerIcons.fullscreen + '" alt="Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">';
        enterBtn.onclick = function(e) { 
            e.stopPropagation();
            this.toggleFullscreen(); 
        }.bind(this);

        this.UI.playerWrapper.appendChild(enterBtn);
    },

    toggleFullscreen: function() {
        var playerWrapper = this.UI.playerWrapper;
        var isFullscreen = document.fullscreenElement || 
                          document.webkitFullscreenElement || 
                          document.mozFullScreenElement || 
                          document.msFullscreenElement;
        
        if (isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    },

    enterFullscreen: function() {
        var playerWrapper = this.UI.playerWrapper;
        
        // মোবাইলে রোটেটেড ভিউ চেক
        if (this.state.isMobile && this.UI.playerWrapper.classList.contains('rotated-view')) {
            this.UI.playerWrapper.classList.remove('rotated-view');
            document.body.style.overflow = '';
        }
        
        // নেটিভ ফুলস্ক্রিন API ব্যবহার
        var requestFullscreen = playerWrapper.requestFullscreen || 
                               playerWrapper.webkitRequestFullscreen || 
                               playerWrapper.mozRequestFullScreen || 
                               playerWrapper.msRequestFullscreen;
        
        if (requestFullscreen) {
            requestFullscreen.call(playerWrapper).catch(function(err) {
                console.warn('Fullscreen request failed:', err);
                this.enterCSSFullscreen();
            }.bind(this));
        } else {
            this.enterCSSFullscreen();
        }
        
        this.state.isFullscreen = true;
        this.updateFullscreenButton(true);
    },

    exitFullscreen: function() {
        if (document.fullscreenElement || document.webkitFullscreenElement || 
            document.mozFullScreenElement || document.msFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
        
        this.exitCSSFullscreen();
        this.state.isFullscreen = false;
        this.UI.playerWrapper.classList.remove('fullscreen-mode');
        document.body.style.overflow = '';
        this.updateFullscreenButton(false);
    },

    enterCSSFullscreen: function() {
        var wrapper = this.UI.playerWrapper;
        this.state.originalStyles = {
            position: wrapper.style.position,
            top: wrapper.style.top,
            left: wrapper.style.left,
            width: wrapper.style.width,
            height: wrapper.style.height,
            zIndex: wrapper.style.zIndex,
            backgroundColor: wrapper.style.backgroundColor,
            overflow: document.body.style.overflow
        };
        
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '100vw';
        wrapper.style.height = '100vh';
        wrapper.style.zIndex = '99999';
        wrapper.style.backgroundColor = '#000';
        document.body.style.overflow = 'hidden';
        wrapper.classList.add('fullscreen-mode');
    },

    exitCSSFullscreen: function() {
        var wrapper = this.UI.playerWrapper;
        var styles = this.state.originalStyles;
        
        wrapper.style.position = styles.position || '';
        wrapper.style.top = styles.top || '';
        wrapper.style.left = styles.left || '';
        wrapper.style.width = styles.width || '';
        wrapper.style.height = styles.height || '';
        wrapper.style.zIndex = styles.zIndex || '';
        wrapper.style.backgroundColor = styles.backgroundColor || '';
        document.body.style.overflow = styles.overflow || '';
        wrapper.classList.remove('fullscreen-mode');
    },

    setupFullscreenListeners: function() {
        var fullscreenChange = function() {
            var isFullscreen = document.fullscreenElement || 
                             document.webkitFullscreenElement || 
                             document.mozFullScreenElement || 
                             document.msFullscreenElement;
            
            if (!isFullscreen && this.state.isFullscreen) {
                this.state.isFullscreen = false;
                this.UI.playerWrapper.classList.remove('fullscreen-mode');
                document.body.style.overflow = '';
                this.exitCSSFullscreen();
                this.updateFullscreenButton(false);
            } else if (isFullscreen) {
                this.state.isFullscreen = true;
                this.UI.playerWrapper.classList.add('fullscreen-mode');
                document.body.style.overflow = 'hidden';
                this.updateFullscreenButton(true);
            }
        }.bind(this);

        document.addEventListener('fullscreenchange', fullscreenChange);
        document.addEventListener('webkitfullscreenchange', fullscreenChange);
        document.addEventListener('mozfullscreenchange', fullscreenChange);
        document.addEventListener('MSFullscreenChange', fullscreenChange);
        
        this.state.fullscreenChangeHandler = fullscreenChange;
    },

    updateFullscreenButton: function(isFullscreen) {
        var buttons = this.UI.playerWrapper.querySelectorAll('.fullscreen-toggle-btn');
        buttons.forEach(function(btn) {
            if (isFullscreen) {
                btn.innerHTML = '<img src="' + PlayerIcons.exitFullscreen + '" alt="Exit Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">';
                btn.title = 'Exit Fullscreen';
            } else {
                btn.innerHTML = '<img src="' + PlayerIcons.fullscreen + '" alt="Fullscreen" style="width:20px;height:20px;filter:brightness(0) invert(1);">';
                btn.title = 'Fullscreen';
            }
        });
    },

    cleanupPlayer: function() {
        // ফুলস্ক্রিন লিসেনার ক্লিনআপ
        if (this.state.fullscreenChangeHandler) {
            document.removeEventListener('fullscreenchange', this.state.fullscreenChangeHandler);
            document.removeEventListener('webkitfullscreenchange', this.state.fullscreenChangeHandler);
            document.removeEventListener('mozfullscreenchange', this.state.fullscreenChangeHandler);
            document.removeEventListener('MSFullscreenChange', this.state.fullscreenChangeHandler);
            this.state.fullscreenChangeHandler = null;
        }
        
        // ফুলস্ক্রিন থেকে বের হন
        this.exitFullscreen();
        
        if (this.state.youtubeFullscreenCleanup) {
            this.state.youtubeFullscreenCleanup();
            this.state.youtubeFullscreenCleanup = null;
        }

        if (this.state.tapHandler) {
            this.UI.playerWrapper.removeEventListener('click', this.state.tapHandler);
            this.state.tapHandler = null;
        }

        if (this.state.hlsInstance) { 
            this.state.hlsInstance.destroy();
            this.state.hlsInstance = null; 
        }
        
        if (this.state.currentVideoElement) { 
            this.state.currentVideoElement.pause();
            this.state.currentVideoElement.src = '';
            this.state.currentVideoElement.load(); 
        }
        
        this.UI.playerWrapper.innerHTML = '';
        this.UI.playerWrapper.className = 'relative w-full bg-black';
        this.UI.playerWrapper.style.filter = '';
        this.UI.playerWrapper.style.transform = '';
        this.UI.playerWrapper.classList.remove('fullscreen-mode', 'rotated-view');
        clearTimeout(this.state.controlsTimeout);
        document.body.style.overflow = '';
        document.getElementById('action-bar').style.display = 'flex';
        document.getElementById('related-content').style.display = 'block';
        this.state.isYouTube = false;
        this.state.viewIncremented = false;
        this.state.isFullscreen = false;
        
        this.removeOrientationHandler();
    },

    destroyPlayer: function() {
        this.cleanupPlayer();
        if (this.state.unsubscribe) {
            this.state.unsubscribe();
            this.state.unsubscribe = null;
        }
    },

    loadRelatedContent: async function(path) {
        this.UI.relatedContainer.innerHTML = '';
        var cId = path.split('/').pop();
        var isLive = path.startsWith('liveTV');
        var colPath = isLive ? 'liveTV' : path.substring(0, path.lastIndexOf('/'));

        this.UI.relatedTitle.innerHTML = '<span class="text-gray-400 font-normal text-sm uppercase tracking-wider">Up Next</span>';
        this.UI.relatedTitle.className = 'mb-4 block border-b border-gray-800 pb-2';
        this.UI.relatedContainer.className = 'flex flex-col space-y-2 pb-20';

        var q = query(collection(db, colPath), where("__name__", "!=", cId), limit(15));
        var snap = await getDocs(q);

        snap.forEach(function(d) {
            var con = d.data();
            var card = document.createElement('div');
            card.className = 'w-full bg-[#1a1a1a] rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-800 hover:border-gray-600';

            var logoUrl = con.logoUrl || con.posterUrl || 'https://via.placeholder.com/48/333333/ffffff?text=?';

            var badgeHtml = '';
            if (isLive) {
                badgeHtml = '<span class="absolute -top-0.5 -right-0.5 text-[8px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold tracking-wider animate-pulse">LIVE</span>';
            } else if (con.duration) {
                badgeHtml = '<span class="absolute bottom-0 right-0 text-[9px] bg-black/80 text-white px-1.5 py-0.5 rounded-tr-lg font-medium">' + con.duration + '</span>';
            }
            if (con.isPremium) {
                badgeHtml = badgeHtml + '<span class="absolute -top-0.5 -left-0.5 text-[7px] bg-yellow-500 text-black font-bold px-1.5 py-0.5 rounded-full">PREMIUM</span>';
            }

            var viewText = (con.views && con.views > 0) ? formatViews(con.views) + ' views' : 'Recommended';
            var categoryName = con.category || 'Nova Stream';

            card.innerHTML = 
                '<a href="#" data-id="' + colPath + '/' + d.id + '" class="content-link flex items-center gap-3 p-2.5 group h-20 w-full">' +
                '<div class="relative flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-gray-800 border border-gray-700">' +
                '<img src="' + logoUrl + '" alt="' + (con.title || con.name) + '" loading="lazy" class="w-full h-full object-cover transition-opacity duration-500 opacity-0 group-hover:scale-105" onload="this.classList.remove(\'opacity-0\')" onerror="this.style.display=\'none\'" />' +
                badgeHtml +
                '</div>' +
                '<div class="flex-1 min-w-0 flex flex-col justify-center">' +
                '<h4 class="text-white text-sm font-medium leading-tight truncate group-hover:text-blue-400 transition-colors">' + (con.title || con.name) + '</h4>' +
                '<div class="flex items-center gap-1.5 mt-1">' +
                '<span class="text-[11px] text-gray-400 truncate">' + categoryName + '</span>' +
                '<span class="text-[10px] text-gray-600">•</span>' +
                '<span class="text-[10px] text-gray-500">' + viewText + '</span>' +
                '</div></div>' +
                '<div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">' +
                '<div class="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">' +
                '<i class="fas fa-play text-blue-400 text-xs"></i>' +
                '</div></div></a>';
            this.UI.relatedContainer.appendChild(card);
        }.bind(this));

        if (snap.empty) {
            this.UI.relatedContainer.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No related videos found.</p>';
        }
    },

    setupActionHandlers: function(p) {
        var k = 'action_' + p.replace(/\//g, '_');
        this.UI.likeBtn.onclick = function() { this.handleVote('likes', k); }.bind(this);
        this.UI.dislikeBtn.onclick = function() { this.handleVote('dislikes', k); }.bind(this);
    },

    handleVote: async function(t, k) {
        var c = localStorage.getItem(k);
        var o = t === 'likes' ? 'dislikes' : 'likes';
        var u = {};
        if (c === t) {
            u[t] = increment(-1);
            localStorage.removeItem(k);
        } else {
            u[t] = increment(1);
            if (c) u[o] = increment(-1);
            localStorage.setItem(k, t);
        }
        await updateDoc(this.state.movieRef, u);
    },

    updateActionButtonsUI: function(p) {
        var k = 'action_' + p.replace(/\//g, '_');
        var v = localStorage.getItem(k);
        this.UI.likeBtn.classList.toggle('active', v === 'likes');
        this.UI.dislikeBtn.classList.toggle('active', v === 'dislikes');
    },

    setupCommentSection: function(p) {
        var c = collection(db, p + '/comments');
        this.UI.commentBtn.onclick = function() { this.UI.commentSection.classList.add('open'); }.bind(this);
        this.UI.closeCommentsBtn.onclick = function() { this.UI.commentSection.classList.remove('open'); }.bind(this);
        this.UI.commentForm.onsubmit = async function(e) {
            e.preventDefault();
            var t = this.UI.commentInput.value.trim();
            if (t) {
                var authorName = getUserName();
                await addDoc(c, { text: t, author: authorName, createdAt: serverTimestamp() });
                this.UI.commentInput.value = '';
            }
        }.bind(this);
        this.listenForComments(c);
    },

    listenForComments: function(r) {
        onSnapshot(query(r, orderBy('createdAt', 'desc')), function(s) {
            this.UI.commentsList.innerHTML = '';
            s.forEach(function(d) {
                var c = d.data();
                var a = c.createdAt && c.createdAt.toDate ? c.createdAt.toDate().toLocaleString() : '';
                var e = document.createElement('div');
                e.className = 'border-b border-gray-700 py-3';
                e.innerHTML = '<div class="flex items-start space-x-3"><i class="fas fa-user-circle text-2xl text-gray-400"></i><div><p class="font-semibold text-white">' + c.author + ' <span class="text-xs text-gray-500 ml-2">' + a + '</span></p><p class="text-gray-300 break-words">' + c.text + '</p></div></div>';
                this.UI.commentsList.appendChild(e);
            }.bind(this));
        }.bind(this));
    }
};
