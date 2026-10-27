import { doc, onSnapshot, updateDoc, increment, collection, addDoc, serverTimestamp, orderBy, query, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db, YOUTUBE_API_KEY } from "./config.js";

export var PlayerIcons = {
    play: "https://cdn-icons-png.flaticon.com/128/7238/7238961.png",
    pause: "https://cdn-icons-png.flaticon.com/128/6520/6520121.png",
    fullscreen: "https://cdn-icons-png.flaticon.com/128/7304/7304806.png",
    exitFullscreen: "https://cdn-icons-png.flaticon.com/128/8669/8669479.png",
    fitScreen: "https://cdn-icons-png.flaticon.com/128/80/80998.png",
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

// ===== FIX CSS =====
(function injectCSS(){
    if(document.getElementById('player-fix-css')) return;
    const css = `
    #player-wrapper { position:relative; width:100%; aspect-ratio:16/9; background:#000; overflow:hidden; max-height:75vh; }
    #player-wrapper video { width:100%; height:100%; object-fit:contain !important; object-position:center; background:#000; }
    #player-wrapper iframe { width:100%; height:100%; border:none; }
    #player-wrapper.video-zoom-fill video { object-fit:contain !important; } /* কাটা পরবে না */
    #player-wrapper.video-zoom-crop video { object-fit:cover !important; } /* যদি ক্রপ করতে চাও */

    /* Related - YouTube style rectangular */
    #related-content-container { display:flex; flex-direction:column; gap:12px; padding-bottom:80px; }
    .yt-card { display:flex; gap:10px; background:#151515; border-radius:12px; overflow:hidden; border:1px solid #222; transition:0.2s; }
    .yt-card:hover { background:#1e1e1e; border-color:#333; }
    .yt-thumb { width:168px; height:94px; min-width:168px; background:#ffffff; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; }
    .yt-thumb img { width:100%; height:100%; object-fit:contain; padding:8px; background:#fff; } /* সব লোগো সেম সাইজ, সাদা BG */
    .yt-info { flex:1; padding:8px 8px 8px 0; min-width:0; display:flex; flex-direction:column; justify-content:center; }
    .yt-title { color:#fff; font-size:13px; font-weight:500; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .yt-meta { color:#aaa; font-size:11px; margin-top:4px; display:flex; gap:6px; align-items:center; }
    .yt-live-badge { background:#ff0000; color:#fff; font-size:9px; padding:2px 5px; border-radius:4px; font-weight:700; }

    @media (min-width:1024px){
        .player-desktop-layout { display:grid; grid-template-columns: 1fr 400px; gap:0; max-width:1600px; margin:0 auto; }
        #player-wrapper { border-radius:12px; margin:16px; width:calc(100% - 32px); max-height:70vh; }
        #player-wrapper.rotated-view { margin:0; width:100vw !important; height:100vh !important; border-radius:0; max-height:none; position:fixed !important; inset:0 !important; z-index:9999; }
        #related-content { border-left:1px solid #1f1f1f; background:#0e0e0e; height:100vh; overflow-y:auto; position:sticky; top:0; padding:16px; }
        .yt-thumb { width:168px; height:94px; min-width:168px; }
    }
    @media (max-width:767px){
        .yt-thumb { width:150px; height:84px; min-width:150px; }
        #player-wrapper { max-height:56vw; }
    }
    .view-mode-btn{position:absolute;top:12px;z-index:20;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.1)}
    .close-rotated-view-btn{right:12px;display:none}.enter-rotated-view-btn{right:12px}
    #player-wrapper.rotated-view .close-rotated-view-btn{display:flex !important}
    #player-wrapper.rotated-view .enter-rotated-view-btn{display:none !important}
    `;
    const s=document.createElement('style'); s.id='player-fix-css'; s.textContent=css; document.head.appendChild(s);
})();

function formatViews(n){ if(!n) return '0'; if(n>=1000000) return (n/1000000).toFixed(1)+'M'; if(n>=1000) return (n/1000).toFixed(1)+'K'; return String(n); }
function getUserName(){ try{ const u=JSON.parse(localStorage.getItem('novaUser')); return u&&u.name?u.name:'Rs Live User'; }catch(e){ return 'Rs Live User'; } }

export var Player = {
    UI: PlayerUI,
    state: { movieRef:null, unsubscribe:null, currentVideoElement:null, controlsTimeout:null, hlsInstance:null, isScrubbing:false, playerType:'movie', isYouTube:false, tapHandler:null, lastTap:0, viewIncremented:false },

    incrementViewCount: async function(docRef){ if(this.state.viewIncremented) return; try{ await updateDoc(docRef,{views:increment(1)}); this.state.viewIncremented=true; }catch{ try{ await updateDoc(docRef,{views:1}); this.state.viewIncremented=true; }catch{} } },

    init: function(id){
        this.cleanupPlayer(); this.state.viewIncremented=false; this.state.playerType=id.startsWith('moviesSections/')?'movie':'live';
        if(id.startsWith('youtube/')){ this.initYouTubeVideo(id.split('/')[1]); return; }
        if(this.state.unsubscribe) this.state.unsubscribe();
        this.setupDesktopLayout();
        var playerContent=document.createElement('div'); playerContent.className='player-content w-full h-full';
        this.UI.playerWrapper.appendChild(playerContent);
        var loader=document.createElement('div'); loader.className='player-loader absolute inset-0 flex items-center justify-center bg-black/50 z-10'; loader.innerHTML='<i class="fas fa-spinner fa-spin text-white text-2xl"></i>';
        this.UI.playerWrapper.appendChild(loader); this.UI.playerWrapper.classList.add('loading','video-zoom-fill');
        this.UI.movieInfo.innerHTML=''; this.UI.relatedContainer.innerHTML='';
        this.state.movieRef=doc(db,id); var first=true;
        this.state.unsubscribe=onSnapshot(this.state.movieRef, async function(snap){
            if(!snap.exists()){ this.UI.playerWrapper.classList.remove('loading'); playerContent.innerHTML='<p class="text-center p-4">Content not available.</p>'; return; }
            var c=snap.data();
            if(first){
                this.createPlayer(c.videoUrl||c.streamUrl, c.posterUrl||c.logoUrl, this.state.playerType);
                this.UI.playerTitleHeader.textContent=c.title||c.name;
                this.UI.movieInfo.innerHTML='<h1 class="text-[18px] md:text-2xl font-bold leading-tight">'+(c.title||c.name)+'</h1><p class="text-gray-300 text-[13px] mt-2 leading-relaxed">'+(c.description||'')+'</p><p class="text-xs text-gray-400 mt-2"><i class="fas fa-eye mr-1"></i> '+formatViews(c.views||0)+' views</p>';
                this.incrementViewCount(this.state.movieRef); this.loadRelatedContent(id); this.setupActionHandlers(id); this.setupCommentSection(id); first=false;
            }
            this.UI.likeCount.textContent=c.likes||0; this.UI.dislikeCount.textContent=c.dislikes||0;
            this.updateActionButtonsUI(id);
        }.bind(this));
    },

    setupDesktopLayout: function(){
        const main=document.querySelector('#player-page-view main');
        if(!main || window.innerWidth<1024 || main.classList.contains('player-desktop-layout')) return;
        const actionBar=document.getElementById('action-bar'); const movieInfo=document.getElementById('movie-info'); const related=document.getElementById('related-content');
        if(actionBar && movieInfo && related){ main.classList.add('player-desktop-layout'); let left=main.querySelector('.player-left'); if(!left){ left=document.createElement('div'); left.className='player-left'; main.prepend(left); left.appendChild(document.getElementById('player-container')); left.appendChild(actionBar); left.appendChild(movieInfo); } }
    },

    initYouTubeVideo: async function(videoId){
        this.state.playerType='live'; this.state.isYouTube=true; this.setupDesktopLayout();
        var pc=document.createElement('div'); pc.className='player-content w-full h-full'; this.UI.playerWrapper.appendChild(pc); this.UI.playerWrapper.classList.add('loading');
        try{
            var data=null, att=0; while(att<3 && !data){ try{ var r=await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet&id='+videoId+'&key='+YOUTUBE_API_KEY); if(!r.ok) throw new Error(r.status); data=await r.json(); if(data.items && data.items.length>0) break; }catch{ att++; await new Promise(res=>setTimeout(res,1000*att)); } }
            if(data && data.items && data.items.length>0){ var info=data.items[0].snippet; var url='https://www.youtube.com/embed/'+videoId+'?autoplay=1&modestbranding=1&rel=0&playsinline=1'; this.createPlayer(url, info.thumbnails.high.url, 'youtube'); this.UI.playerTitleHeader.textContent=info.title; this.UI.movieInfo.innerHTML='<h1 class="text-xl font-bold">'+info.title+'</h1><p class="text-sm text-gray-300 mt-2">'+info.description.substring(0,250)+'</p>'; document.getElementById('action-bar').style.display='none'; } else { pc.innerHTML='<p class="text-center p-4 text-red-400">YouTube video not found.</p>'; this.UI.playerWrapper.classList.remove('loading'); }
        }catch{ pc.innerHTML='<p class="text-center p-4 text-red-400">Could not load.</p>'; this.UI.playerWrapper.classList.remove('loading'); }
    },

    createPlayer: function(videoUrl, posterUrl, playerType){
        var pc=this.UI.playerWrapper.querySelector('.player-content'); if(!pc) return;
        var low=(videoUrl||'').toLowerCase(); var isIframe=low.includes('bongobd.com')||low.includes('youtube.com/embed');
        var isDirect=!isIframe && (low.includes('.m3u8')||['.mp4','.mkv','.webm'].some(e=>low.includes(e)));
        if(isDirect && videoUrl){
            pc.innerHTML='<video id="video-player" poster="'+posterUrl+'" playsinline preload="auto" class="w-full h-full bg-black"></video>';
            var video=document.getElementById('video-player'); this.state.currentVideoElement=video; this.state.isYouTube=false;
            if(low.includes('.m3u8')){ if(Hls.isSupported()){ this.state.hlsInstance=new Hls({maxBufferLength:30}); this.state.hlsInstance.loadSource(videoUrl); this.state.hlsInstance.attachMedia(video); } else if(video.canPlayType('application/vnd.apple.mpegurl')){ video.src=videoUrl; } } else { video.src=videoUrl; }
            if(playerType==='movie') this.setupMovieControls(video); else this.setupLiveTvControls(video);
        } else if(videoUrl){
            this.UI.playerWrapper.classList.remove('loading'); var fid=this.state.isYouTube?'youtube-iframe':'external-iframe';
            pc.innerHTML='<iframe id="'+fid+'" src="'+videoUrl+'" frameborder="0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen class="w-full h-full"></iframe>';
            if(this.state.isYouTube) this.setupYouTubeFullscreenHandler(); this.addRotatedViewButtons(); this.state.currentVideoElement=null;
        } else { this.UI.playerWrapper.classList.remove('loading'); pc.innerHTML='<p class="text-center p-4">No video source.</p>'; }
    },

    setupYouTubeFullscreenHandler: function(){ var iframe=document.getElementById('youtube-iframe'); if(!iframe) return; var check=function(){ if(document.fullscreenElement===iframe||document.webkitFullscreenElement===iframe){ this.UI.playerWrapper.classList.remove('rotated-view'); document.body.style.overflow=''; } }.bind(this); document.addEventListener('fullscreenchange',check); document.addEventListener('webkitfullscreenchange',check); window.addEventListener('resize',check); this.state.youtubeFullscreenCleanup=function(){ document.removeEventListener('fullscreenchange',check); document.removeEventListener('webkitfullscreenchange',check); window.removeEventListener('resize',check); }; },

    setupLiveTvControls: function(video){
        var closeBtn=document.createElement('button'); closeBtn.className='view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML='<img src="'+PlayerIcons.exitFullscreen+'" style="width:20px;height:20px;filter:invert(1)">'; closeBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();};
        var html='<div id="custom-controls-overlay" class="visible absolute inset-0 flex items-center justify-center bg-black/20"><button id="custom-play-pause-btn" class="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20"><img src="'+PlayerIcons.play+'" style="width:26px"></button></div><div id="player-controls-container-live" class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent flex justify-between items-center"><span class="live-indicator bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">LIVE</span><div class="flex gap-2"><button id="fit-screen-btn" class="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center" title="Zoom Mode"><img src="'+PlayerIcons.fitScreen+'" style="width:16px;filter:invert(1)"></button><button class="enter-rotated-view-btn w-9 h-9 bg-white/10 rounded-full flex items-center justify-center"><img src="'+PlayerIcons.fullscreen+'" style="width:16px;filter:invert(1)"></button></div></div>';
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend',html);
        var centerBtn=document.getElementById('custom-play-pause-btn'); var rotateBtn=this.UI.playerWrapper.querySelector('.enter-rotated-view-btn'); var fitBtn=document.getElementById('fit-screen-btn');
        var toggle=()=>{ video.paused?video.play():video.pause(); };
        video.addEventListener('play',()=>{ centerBtn.innerHTML='<img src="'+PlayerIcons.pause+'" style="width:26px">'; document.getElementById('custom-controls-overlay').classList.add('hidden'); });
        video.addEventListener('pause',()=>{ centerBtn.innerHTML='<img src="'+PlayerIcons.play+'" style="width:26px">'; document.getElementById('custom-controls-overlay').classList.remove('hidden'); });
        video.addEventListener('canplay',()=>{ this.UI.playerWrapper.classList.remove('loading'); video.play().catch(()=>{}); });
        centerBtn.addEventListener('click',(e)=>{e.stopPropagation(); toggle();});
        rotateBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();};
        fitBtn.onclick=(e)=>{ e.stopPropagation(); 
            // Toggle contain vs fill, but never crop
            if(this.UI.playerWrapper.classList.contains('video-zoom-fill')){ this.UI.playerWrapper.classList.remove('video-zoom-fill'); this.UI.playerWrapper.classList.add('video-zoom-crop'); fitBtn.title='Crop Mode'; } 
            else { this.UI.playerWrapper.classList.add('video-zoom-fill'); this.UI.playerWrapper.classList.remove('video-zoom-crop'); fitBtn.title='Fit Mode - No Cut'; }
        };
        this.addSimpleTapGesture(video);
    },

    setupMovieControls: function(video){
        var closeBtn=document.createElement('button'); closeBtn.className='view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML='<img src="'+PlayerIcons.exitFullscreen+'" style="width:20px;height:20px;filter:invert(1)">'; closeBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();};
        var html='<div id="custom-controls-overlay" class="visible absolute inset-0 flex items-center justify-center bg-black/20"><button id="custom-play-pause-btn" class="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20"><img src="'+PlayerIcons.play+'" style="width:26px"></button></div><div id="player-controls-container" class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent"><div id="progress-container" class="mb-2"><div id="progress-bar-wrapper" class="relative h-1.5 bg-white/20 rounded-full"><div id="progress-buffered" class="absolute h-full bg-white/30 rounded-full" style="width:0%"></div><div id="progress-played" class="absolute h-full bg-red-600 rounded-full" style="width:0%"></div><input type="range" id="progress-bar" value="0" min="0" step="1" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"></div></div><div class="flex justify-between items-center"><div class="flex items-center gap-3"><button id="play-pause-btn" class="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center"><img src="'+PlayerIcons.play+'" style="width:14px;filter:invert(1)"></button><span id="time-display" class="text-xs text-white/80">00:00 / 00:00</span></div><div class="flex gap-2"><button id="fit-screen-btn" class="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center"><img src="'+PlayerIcons.fitScreen+'" style="width:14px;filter:invert(1)"></button><button class="enter-rotated-view-btn w-8 h-8 bg-white/10 rounded-full flex items-center justify-center"><img src="'+PlayerIcons.fullscreen+'" style="width:14px;filter:invert(1)"></button></div></div></div>';
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend',html);
        var centerBtn=document.getElementById('custom-play-pause-btn'); var playBtn=document.getElementById('play-pause-btn'); var bar=document.getElementById('progress-bar'); var played=document.getElementById('progress-played'); var buffered=document.getElementById('progress-buffered'); var time=document.getElementById('time-display'); var rotateBtn=this.UI.playerWrapper.querySelector('.enter-rotated-view-btn'); var fitBtn=document.getElementById('fit-screen-btn');
        var fmt=(t)=>{ if(isNaN(t)) return '00:00'; var s=Math.floor(t%60), m=Math.floor(t/60)%60, h=Math.floor(t/3600); return h>0?h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); };
        var toggle=()=>{ video.paused?video.play():video.pause(); };
        video.addEventListener('play',()=>{ playBtn.innerHTML='<img src="'+PlayerIcons.pause+'" style="width:12px;filter:invert(1)">'; centerBtn.innerHTML='<img src="'+PlayerIcons.pause+'" style="width:26px">'; document.getElementById('custom-controls-overlay').classList.add('hidden'); });
        video.addEventListener('pause',()=>{ playBtn.innerHTML='<img src="'+PlayerIcons.play+'" style="width:12px;filter:invert(1)">'; centerBtn.innerHTML='<img src="'+PlayerIcons.play+'" style="width:26px">'; document.getElementById('custom-controls-overlay').classList.remove('hidden'); });
        video.addEventListener('loadedmetadata',()=>{ bar.max=video.duration; time.textContent=fmt(video.currentTime)+' / '+fmt(video.duration); });
        video.addEventListener('timeupdate',()=>{ if(!this.state.isScrubbing){ bar.value=video.currentTime; played.style.width=((video.currentTime/video.duration)*100)+'%'; } time.textContent=fmt(video.currentTime)+' / '+fmt(video.duration); });
        video.addEventListener('progress',()=>{ if(video.buffered.length>0){ buffered.style.width=((video.buffered.end(video.buffered.length-1)/video.duration)*100)+'%'; } });
        playBtn.onclick=centerBtn.onclick=(e)=>{ e.stopPropagation(); toggle(); }; rotateBtn.onclick=(e)=>{ e.stopPropagation(); this.toggleRotateView(); };
        fitBtn.onclick=(e)=>{ e.stopPropagation(); this.UI.playerWrapper.classList.toggle('video-zoom-fill'); this.UI.playerWrapper.classList.toggle('video-zoom-crop'); };
        bar.addEventListener('input',(e)=>{ played.style.width=((e.target.value/video.duration)*100)+'%'; time.textContent=fmt(e.target.value)+' / '+fmt(video.duration); });
        bar.addEventListener('change',()=>{ video.currentTime=bar.value; });
        this.addSimpleTapGesture(video);
    },

    addSimpleTapGesture: function(video){ var wrap=this.UI.playerWrapper; if(this.state.tapHandler) return; var handler=(e)=>{ if(e.target.closest('button,input,a')) return; wrap.classList.toggle('controls-visible'); }; wrap.addEventListener('click',handler); this.state.tapHandler=handler; },
    addRotatedViewButtons: function(){ var c=document.createElement('button'); c.className='view-mode-btn close-rotated-view-btn'; c.innerHTML='<img src="'+PlayerIcons.exitFullscreen+'" style="width:20px;height:20px;filter:invert(1)">'; c.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();}; var en=document.createElement('button'); en.className='view-mode-btn enter-rotated-view-btn'; en.innerHTML='<img src="'+PlayerIcons.fullscreen+'" style="width:20px;height:20px;filter:invert(1)">'; en.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();}; this.UI.playerWrapper.appendChild(c); this.UI.playerWrapper.appendChild(en); },
    toggleRotateView: function(){ var r=this.UI.playerWrapper.classList.toggle('rotated-view'); document.body.style.overflow=r?'hidden':''; },

    cleanupPlayer: function(){ if(this.state.youtubeFullscreenCleanup){ this.state.youtubeFullscreenCleanup(); this.state.youtubeFullscreenCleanup=null; } if(this.state.tapHandler){ this.UI.playerWrapper.removeEventListener('click',this.state.tapHandler); this.state.tapHandler=null; } if(this.state.hlsInstance){ this.state.hlsInstance.destroy(); this.state.hlsInstance=null; } if(this.state.currentVideoElement){ this.state.currentVideoElement.pause(); this.state.currentVideoElement.src=''; this.state.currentVideoElement.load(); } this.UI.playerWrapper.innerHTML=''; this.UI.playerWrapper.className='relative w-full bg-black'; document.body.style.overflow=''; this.state.isYouTube=false; this.state.viewIncremented=false; },
    destroyPlayer: function(){ this.cleanupPlayer(); if(this.state.unsubscribe){ this.state.unsubscribe(); this.state.unsubscribe=null; } },

    loadRelatedContent: async function(path){
        this.UI.relatedContainer.innerHTML='';
        var cId=path.split('/').pop(); var isLive=path.startsWith('liveTV'); var colPath=isLive?'liveTV':path.substring(0,path.lastIndexOf('/'));
        this.UI.relatedTitle.innerHTML='<span class="text-gray-400 text-[11px] uppercase tracking-widest">Up Next • You may like</span>';
        this.UI.relatedContainer.className='';
        var q=query(collection(db,colPath), where("__name__","!=",cId), limit(20));
        var snap=await getDocs(q);
        snap.forEach((d)=>{
            var con=d.data();
            var logoUrl=con.logoUrl||con.posterUrl||'https://via.placeholder.com/200x112/ffffff/000000?text=No+Logo';
            var card=document.createElement('div'); card.className='yt-card';
            card.innerHTML=`
                <a href="#" data-id="${colPath}/${d.id}" class="content-link flex gap-0 w-full">
                    <div class="yt-thumb">
                        <img src="${logoUrl}" alt="${con.title||con.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/200x112/ffffff/000000?text=No+Logo'" />
                        ${isLive?'<span class="yt-live-badge absolute top-1 left-1">LIVE</span>':''}
                        ${con.duration?'<span class="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1 py-0.5 rounded">'+con.duration+'</span>':''}
                    </div>
                    <div class="yt-info">
                        <div class="yt-title">${con.title||con.name}</div>
                        <div class="yt-meta"><span>${con.category||'Rs Live Tv'}</span><span>•</span><span>${formatViews(con.views||0)} views</span></div>
                    </div>
                </a>`;
            this.UI.relatedContainer.appendChild(card);
        });
        if(snap.empty){ this.UI.relatedContainer.innerHTML='<p class="text-gray-500 text-sm text-center py-4">No related channels found.</p>'; }
    },

    setupActionHandlers: function(p){ var k='action_'+p.replace(/\//g,'_'); this.UI.likeBtn.onclick=()=>{ this.handleVote('likes',k); }; this.UI.dislikeBtn.onclick=()=>{ this.handleVote('dislikes',k); }; },
    handleVote: async function(t,k){ var c=localStorage.getItem(k); var o=t==='likes'?'dislikes':'likes'; var u={}; if(c===t){ u[t]=increment(-1); localStorage.removeItem(k); } else { u[t]=increment(1); if(c) u[o]=increment(-1); localStorage.setItem(k,t); } await updateDoc(this.state.movieRef,u); },
    updateActionButtonsUI: function(p){ var k='action_'+p.replace(/\//g,'_'); var v=localStorage.getItem(k); this.UI.likeBtn.classList.toggle('active',v==='likes'); this.UI.dislikeBtn.classList.toggle('active',v==='dislikes'); },
    setupCommentSection: function(p){ var c=collection(db,p+'/comments'); this.UI.commentBtn.onclick=()=>{ this.UI.commentSection.classList.add('open'); }; this.UI.closeCommentsBtn.onclick=()=>{ this.UI.commentSection.classList.remove('open'); }; this.UI.commentForm.onsubmit=async (e)=>{ e.preventDefault(); var t=this.UI.commentInput.value.trim(); if(t){ await addDoc(c,{text:t, author:getUserName(), createdAt:serverTimestamp()}); this.UI.commentInput.value=''; } }; this.listenForComments(c); },
    listenForComments: function(r){ onSnapshot(query(r, orderBy('createdAt','desc')), (s)=>{ this.UI.commentsList.innerHTML=''; s.forEach((d)=>{ var c=d.data(); var a=c.createdAt&&c.createdAt.toDate?c.createdAt.toDate().toLocaleString():''; var e=document.createElement('div'); e.className='border-b border-gray-800 py-3'; e.innerHTML='<div class="flex gap-3"><i class="fas fa-user-circle text-2xl text-gray-500"></i><div><p class="font-semibold text-white text-sm">'+c.author+' <span class="text-xs text-gray-500 ml-2">'+a+'</span></p><p class="text-gray-300 text-sm mt-1 break-words">'+c.text+'</p></div></div>'; this.UI.commentsList.appendChild(e); }); }); }
};
