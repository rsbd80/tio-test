import { doc, onSnapshot, updateDoc, increment, collection, addDoc, serverTimestamp, orderBy, query, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { db, YOUTUBE_API_KEY } from "./config.js";

export var PlayerIcons = {
    play: "https://cdn-icons-png.flaticon.com/128/7238/7238961.png",
    pause: "https://cdn-icons-png.flaticon.com/128/6520/6520121.png",
    fullscreen: "https://cdn-icons-png.flaticon.com/128/7304/7304806.png",
    exitFullscreen: "https://cdn-icons-png.flaticon.com/128/8669/8669479.png",
    fitScreen: "https://cdn-icons-png.flaticon.com/128/80/80998.png",
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

// ===== NEW PREMIUM CSS - INDEX STYLE =====
(function(){
    if(document.getElementById('rs-final-player-css')) return;
    const css = `
    #player-page-view{ background:#0a0a0a; }
    #player-wrapper{ position:relative; width:100%; aspect-ratio:16/9; background:#000; overflow:hidden; border-radius:0; }
    #player-wrapper video{ width:100% !important; height:100% !important; object-fit:contain !important; background:#000; }
    #player-wrapper iframe{ width:100% !important; height:100% !important; border:none; background:#000; }

    /* Fullscreen - FIXED, no 90deg rotate */
    #player-wrapper.is-fullscreen{ position:fixed !important; inset:0 !important; width:100vw !important; height:100vh !important; z-index:999999 !important; border-radius:0 !important; margin:0 !important; background:#000 !important; aspect-ratio:auto !important; }

    /* Cards - YouTube Style - FIXED SPLIT BUG */
    #related-content-container{ display:flex; flex-direction:column; gap:10px; padding:12px 12px 100px 12px; }
    .rs-card{ width:100%; background:#161616; border:1px solid #232323; border-radius:12px; overflow:hidden; transition:0.2s; }
    .rs-card:hover{ background:#1e1e1e; border-color:#333; transform:translateY(-1px); }
    .rs-card a{ display:flex; width:100%; text-decoration:none; }
    .rs-thumb{ width:115px; min-width:115px; height:68px; background:#ffffff; display:flex; align-items:center; justify-content:center; position:relative; flex-shrink:0; }
    .rs-thumb img{ width:100%; height:100%; object-fit:contain; padding:6px; background:#fff; display:block; }
    .rs-live{ position:absolute; top:4px; left:4px; background:#e50914; color:#fff; font-size:8px; font-weight:800; padding:2px 5px; border-radius:3px; letter-spacing:0.5px; line-height:1; }
    .rs-info{ flex:1; padding:9px 10px; min-width:0; display:flex; flex-direction:column; justify-content:center; background:#1a1a1a; }
    .rs-title{ color:#fff; font-size:13px; font-weight:500; line-height:1.35; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .rs-meta{ color:#888; font-size:11px; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    /* Ads Center */
    #ad-container, #ad-container *{ display:flex !important; justify-content:center !important; align-items:center !important; margin-left:auto !important; margin-right:auto !important; text-align:center !important; }
    #ad-container img, #ad-container iframe{ margin:0 auto !important; display:block !important; max-width:100% !important; }

    /* Controls */
    .view-mode-btn{ position:absolute; top:10px; right:10px; z-index:40; width:38px; height:38px; border-radius:50%; background:rgba(0,0,0,0.6); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.15); display:flex; align-items:center; justify-content:center; }
    .close-rotated-view-btn{ display:none; }
    #player-wrapper.is-fullscreen .close-rotated-view-btn{ display:flex !important; }
    #player-wrapper.is-fullscreen .enter-rotated-view-btn{ display:none !important; }
    #custom-controls-overlay{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.15); transition:0.3s; }
    #custom-controls-overlay.hidden{ opacity:0; pointer-events:none; }
    #custom-play-pause-btn{ width:60px; height:60px; border-radius:50%; background:rgba(255,255,255,0.12); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; }
    #player-controls-container, #player-controls-container-live{ position:absolute; bottom:0; left:0; right:0; padding:12px; background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%); z-index:10; }

    /* Desktop Layout */
    @media (min-width:1024px){
        #player-page-view{ padding:0; }
        #player-page-view > main{ max-width:1440px; margin:0 auto; display:grid; grid-template-columns: 1fr 380px; gap:0; }
        .player-left-col{ padding:16px; min-width:0; }
        #player-wrapper{ border-radius:12px; overflow:hidden; max-height:72vh; }
        #player-wrapper.is-fullscreen{ border-radius:0; max-height:none; margin:0; }
        #related-content{ background:#0f0f0f; border-left:1px solid #1f1f1f; height:100vh; overflow-y:auto; position:sticky; top:0; padding:16px 12px !important; }
        .rs-thumb{ width:130px; min-width:130px; height:76px; }
    }
    `;
    const style=document.createElement('style'); style.id='rs-final-player-css'; style.textContent=css; document.head.appendChild(style);
})();

function formatViews(num){ if(!num) return '0'; if(num>=1e6) return (num/1e6).toFixed(1)+'M'; if(num>=1e3) return (num/1e3).toFixed(1)+'K'; return ''+num; }
function getUserName(){ try{ const u=JSON.parse(localStorage.getItem('novaUser')); return u&&u.name?u.name:'Rs Live User'; }catch{ return 'Rs Live User'; } }

export var Player = {
    UI: PlayerUI,
    state: { movieRef:null, unsubscribe:null, currentVideoElement:null, hlsInstance:null, isScrubbing:false, isYouTube:false, tapHandler:null, viewIncremented:false, lastTap:0, controlsTimeout:null },

    incrementViewCount: async function(ref){ if(this.state.viewIncremented) return; try{ await updateDoc(ref,{views:increment(1)}); this.state.viewIncremented=true; }catch{ try{ await updateDoc(ref,{views:1}); this.state.viewIncremented=true; }catch{} } },

    init: function(id){
        this.cleanupPlayer(); this.state.viewIncremented=false; this.state.playerType=id.startsWith('moviesSections/')?'movie':'live';
        if(id.startsWith('youtube/')){ this.initYouTubeVideo(id.split('/')[1]); return; }
        if(this.state.unsubscribe) this.state.unsubscribe();

        // Desktop structure
        this.buildDesktopStructure();

        var pc=document.createElement('div'); pc.className='player-content w-full h-full'; this.UI.playerWrapper.appendChild(pc);
        var loader=document.createElement('div'); loader.className='player-loader absolute inset-0 z-20 flex items-center justify-center bg-black/60'; loader.innerHTML='<i class="fas fa-spinner fa-spin text-white text-xl"></i>';
        this.UI.playerWrapper.appendChild(loader); this.UI.playerWrapper.classList.add('loading');
        this.UI.movieInfo.innerHTML=''; this.UI.relatedContainer.innerHTML='';
        this.state.movieRef=doc(db,id); var first=true;

        this.state.unsubscribe=onSnapshot(this.state.movieRef, (snap)=>{
            if(!snap.exists()){ this.UI.playerWrapper.classList.remove('loading'); pc.innerHTML='<p class="text-center p-4 text-white">Content not available.</p>'; return; }
            var c=snap.data();
            if(first){
                this.createPlayer(c.videoUrl||c.streamUrl, c.posterUrl||c.logoUrl, this.state.playerType);
                this.UI.playerTitleHeader.textContent=c.title||c.name;
                this.UI.movieInfo.innerHTML='<h1 class="text-[18px] md:text-[22px] font-bold text-white leading-tight">'+(c.title||c.name)+'</h1><div class="flex items-center gap-2 mt-2 text-[12px] text-gray-400"><span><i class="fas fa-eye mr-1"></i> '+formatViews(c.views||0)+' views</span><span>•</span><span>'+(c.category||'Rs Live Tv')+'</span></div><p class="text-[13px] text-gray-300 mt-3 leading-relaxed">'+(c.description||'')+'</p>';
                this.incrementViewCount(this.state.movieRef); this.loadRelatedContent(id); this.setupActionHandlers(id); this.setupCommentSection(id); first=false;
            }
            this.UI.likeCount.textContent=c.likes||0; this.UI.dislikeCount.textContent=c.dislikes||0;
            this.updateActionButtonsUI(id);
        });
    },

    buildDesktopStructure: function(){
        const main=document.querySelector('#player-page-view > main') || document.querySelector('#player-page-view main');
        if(!main || window.innerWidth < 1024) return;
        if(main.querySelector('.player-left-col')) return;
        const playerContainer=document.getElementById('player-container');
        const actionBar=document.getElementById('action-bar');
        const movieInfo=document.getElementById('movie-info');
        const related=document.getElementById('related-content');
        if(playerContainer && actionBar && movieInfo && related){
            const left=document.createElement('div'); left.className='player-left-col';
            main.prepend(left);
            left.appendChild(playerContainer);
            left.appendChild(actionBar);
            left.appendChild(movieInfo);
        }
    },

    initYouTubeVideo: async function(videoId){
        this.state.isYouTube=true; this.buildDesktopStructure();
        var pc=document.createElement('div'); pc.className='player-content w-full h-full'; this.UI.playerWrapper.appendChild(pc); this.UI.playerWrapper.classList.add('loading');
        try{
            var data=null, a=0; while(a<3 && !data){ try{ var r=await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet&id='+videoId+'&key='+YOUTUBE_API_KEY); if(!r.ok) throw new Error(); data=await r.json(); if(data.items?.length) break; }catch{ a++; await new Promise(x=>setTimeout(x,800*a)); } }
            if(data?.items?.length){ var info=data.items[0].snippet; var url='https://www.youtube.com/embed/'+videoId+'?autoplay=1&modestbranding=1&rel=0&playsinline=1'; this.createPlayer(url, info.thumbnails.high.url, 'youtube'); this.UI.playerTitleHeader.textContent=info.title; this.UI.movieInfo.innerHTML='<h1 class="text-xl font-bold text-white">'+info.title+'</h1>'; }
            else{ pc.innerHTML='<p class="text-center p-4 text-red-400">Video not found</p>'; this.UI.playerWrapper.classList.remove('loading'); }
        }catch{ pc.innerHTML='<p class="text-center p-4 text-red-400">Error loading</p>'; this.UI.playerWrapper.classList.remove('loading'); }
    },

    createPlayer: function(videoUrl, posterUrl, playerType){
        var pc=this.UI.playerWrapper.querySelector('.player-content'); if(!pc) return;
        var low=(videoUrl||'').toLowerCase(); var isIframe=low.includes('bongobd.com')||low.includes('youtube.com/embed');
        var isDirect=!isIframe && (low.includes('.m3u8')||['.mp4','.mkv','.webm'].some(e=>low.includes(e)));
        if(isDirect && videoUrl){
            pc.innerHTML='<video id="video-player" poster="'+posterUrl+'" playsinline preload="auto"></video>';
            var video=document.getElementById('video-player'); this.state.currentVideoElement=video; this.state.isYouTube=false;
            if(low.includes('.m3u8')){ if(Hls.isSupported()){ this.state.hlsInstance=new Hls({maxBufferLength:30}); this.state.hlsInstance.loadSource(videoUrl); this.state.hlsInstance.attachMedia(video); } else if(video.canPlayType('application/vnd.apple.mpegurl')) video.src=videoUrl; } else video.src=videoUrl;
            if(playerType==='movie') this.setupMovieControls(video); else this.setupLiveTvControls(video);
        } else if(videoUrl){
            this.UI.playerWrapper.classList.remove('loading'); var fid=this.state.isYouTube?'youtube-iframe':'external-iframe';
            pc.innerHTML='<iframe id="'+fid+'" src="'+videoUrl+'" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>';
            this.addRotatedViewButtons(); this.state.currentVideoElement=null;
        } else { this.UI.playerWrapper.classList.remove('loading'); pc.innerHTML='<p class="text-center p-4 text-white">No source</p>'; }
    },

    setupLiveTvControls: function(video){
        var closeBtn=document.createElement('button'); closeBtn.className='view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML='<i class="fas fa-compress text-white text-sm"></i>'; closeBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();};
        var html='<div id="custom-controls-overlay"><button id="custom-play-pause-btn"><img src="'+PlayerIcons.play+'" style="width:22px"></button></div><div id="player-controls-container-live"><div class="flex justify-between items-center"><span class="bg-red-600 text-white text-[10px] px-2 py-1 rounded font-bold tracking-wider">LIVE</span><div class="flex gap-2"><button id="fit-screen-btn" class="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center"><i class="fas fa-expand text-white text-xs"></i></button><button class="enter-rotated-view-btn w-8 h-8 bg-white/10 rounded-full flex items-center justify-center"><i class="fas fa-expand text-white text-xs"></i></button></div></div></div>';
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend',html);
        var centerBtn=document.getElementById('custom-play-pause-btn'); var rotateBtn=this.UI.playerWrapper.querySelector('.enter-rotated-view-btn'); var fitBtn=document.getElementById('fit-screen-btn');
        var toggle=()=> video.paused?video.play():video.pause();
        video.addEventListener('play',()=>{ centerBtn.innerHTML='<img src="'+PlayerIcons.pause+'" style="width:22px">'; document.getElementById('custom-controls-overlay').classList.add('hidden'); });
        video.addEventListener('pause',()=>{ centerBtn.innerHTML='<img src="'+PlayerIcons.play+'" style="width:22px">'; document.getElementById('custom-controls-overlay').classList.remove('hidden'); });
        video.addEventListener('canplay',()=>{ this.UI.playerWrapper.classList.remove('loading'); video.play().catch(()=>{}); });
        centerBtn.addEventListener('click',(e)=>{e.stopPropagation(); toggle();});
        rotateBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();}; fitBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();};
        this.addTap(video);
    },

    setupMovieControls: function(video){
        var closeBtn=document.createElement('button'); closeBtn.className='view-mode-btn close-rotated-view-btn'; closeBtn.innerHTML='<i class="fas fa-compress text-white text-sm"></i>'; closeBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();};
        var html='<div id="custom-controls-overlay"><button id="custom-play-pause-btn"><img src="'+PlayerIcons.play+'" style="width:22px"></button></div><div id="player-controls-container"><div class="h-1 bg-white/20 rounded-full mb-3 relative"><div id="progress-played" class="absolute h-full bg-[#e50914] rounded-full" style="width:0%"></div><input type="range" id="progress-bar" value="0" min="0" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"></div><div class="flex justify-between items-center"><div class="flex items-center gap-2"><button id="play-pause-btn" class="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center"><img src="'+PlayerIcons.play+'" style="width:10px;filter:invert(1)"></button><span id="time-display" class="text-[11px] text-white/70">00:00 / 00:00</span></div><button class="enter-rotated-view-btn w-7 h-7 bg-white/10 rounded-full flex items-center justify-center"><i class="fas fa-expand text-white text-[11px]"></i></button></div></div>';
        this.UI.playerWrapper.appendChild(closeBtn); this.UI.playerWrapper.insertAdjacentHTML('beforeend',html);
        var centerBtn=document.getElementById('custom-play-pause-btn'); var playBtn=document.getElementById('play-pause-btn'); var bar=document.getElementById('progress-bar'); var played=document.getElementById('progress-played'); var time=document.getElementById('time-display'); var rotateBtn=this.UI.playerWrapper.querySelector('.enter-rotated-view-btn');
        var fmt=(t)=>{ if(isNaN(t)) return '00:00'; var s=Math.floor(t%60), m=Math.floor(t/60)%60, h=Math.floor(t/3600); return h>0?h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'):String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); };
        var toggle=()=> video.paused?video.play():video.pause();
        video.addEventListener('play',()=>{ playBtn.innerHTML='<img src="'+PlayerIcons.pause+'" style="width:10px;filter:invert(1)">'; centerBtn.innerHTML='<img src="'+PlayerIcons.pause+'" style="width:22px">'; document.getElementById('custom-controls-overlay').classList.add('hidden'); });
        video.addEventListener('pause',()=>{ playBtn.innerHTML='<img src="'+PlayerIcons.play+'" style="width:10px;filter:invert(1)">'; centerBtn.innerHTML='<img src="'+PlayerIcons.play+'" style="width:22px">'; document.getElementById('custom-controls-overlay').classList.remove('hidden'); });
        video.addEventListener('loadedmetadata',()=>{ bar.max=video.duration; time.textContent=fmt(video.currentTime)+' / '+fmt(video.duration); });
        video.addEventListener('timeupdate',()=>{ bar.value=video.currentTime; played.style.width=((video.currentTime/video.duration)*100)+'%'; time.textContent=fmt(video.currentTime)+' / '+fmt(video.duration); });
        playBtn.onclick=centerBtn.onclick=(e)=>{e.stopPropagation(); toggle();}; rotateBtn.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();};
        bar.addEventListener('change',()=>{ video.currentTime=bar.value; });
        this.addTap(video);
    },

    addTap: function(video){ var w=this.UI.playerWrapper; if(this.state.tapHandler) return; var h=(e)=>{ if(e.target.closest('button,input,a')) return; w.classList.toggle('controls-visible'); }; w.addEventListener('click',h); this.state.tapHandler=h; },
    addRotatedViewButtons: function(){ var c=document.createElement('button'); c.className='view-mode-btn close-rotated-view-btn'; c.innerHTML='<i class="fas fa-compress text-white text-sm"></i>'; c.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();}; var en=document.createElement('button'); en.className='view-mode-btn enter-rotated-view-btn'; en.innerHTML='<i class="fas fa-expand text-white text-sm"></i>'; en.onclick=(e)=>{e.stopPropagation(); this.toggleRotateView();}; this.UI.playerWrapper.appendChild(c); this.UI.playerWrapper.appendChild(en); },

    toggleRotateView: function(){
        var w=this.UI.playerWrapper;
        if(w.classList.contains('is-fullscreen')){
            w.classList.remove('is-fullscreen'); document.body.style.overflow='';
            if(document.exitFullscreen) document.exitFullscreen().catch(()=>{}); 
        } else {
            w.classList.add('is-fullscreen'); document.body.style.overflow='hidden';
            if(w.requestFullscreen) w.requestFullscreen().catch(()=>{});
        }
    },

    cleanupPlayer: function(){
        if(this.state.tapHandler){ this.UI.playerWrapper.removeEventListener('click',this.state.tapHandler); this.state.tapHandler=null; }
        if(this.state.hlsInstance){ this.state.hlsInstance.destroy(); this.state.hlsInstance=null; }
        if(this.state.currentVideoElement){ try{ this.state.currentVideoElement.pause(); this.state.currentVideoElement.src=''; this.state.currentVideoElement.load(); }catch{} }
        this.UI.playerWrapper.innerHTML=''; this.UI.playerWrapper.className='relative w-full bg-black'; document.body.style.overflow='';
        if(document.fullscreenElement){ try{ document.exitFullscreen(); }catch{} }
        this.state.isYouTube=false; this.state.viewIncremented=false;
    },
    destroyPlayer: function(){ this.cleanupPlayer(); if(this.state.unsubscribe){ this.state.unsubscribe(); this.state.unsubscribe=null; } },

    loadRelatedContent: async function(path){
        this.UI.relatedContainer.innerHTML='';
        var cId=path.split('/').pop(); var isLive=path.startsWith('liveTV'); var colPath=isLive?'liveTV':path.substring(0,path.lastIndexOf('/'));
        this.UI.relatedTitle.innerHTML='<span class="text-gray-500 text-[11px] uppercase tracking-widest">Up Next • You may like</span>';
        var q=query(collection(db,colPath), where("__name__","!=",cId), limit(20));
        var snap=await getDocs(q);
        snap.forEach((d)=>{
            var con=d.data();
            var logoUrl=con.logoUrl||con.posterUrl||'https://via.placeholder.com/200x120/ffffff/000000?text=No+Logo';
            var el=document.createElement('div'); el.className='rs-card';
            el.innerHTML=`
                <a href="#" data-id="${colPath}/${d.id}" class="content-link">
                    <div class="rs-thumb">
                        <img src="${logoUrl}" alt="${con.title||con.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/200x120/ffffff/000000?text=No+Logo'" />
                        <span class="rs-live">LIVE</span>
                    </div>
                    <div class="rs-info">
                        <div class="rs-title">${con.title||con.name}</div>
                        <div class="rs-meta">${con.category||'Rs Live Tv'} • ${formatViews(con.views||0)} views</div>
                    </div>
                </a>`;
            this.UI.relatedContainer.appendChild(el);
        });
        if(snap.empty) this.UI.relatedContainer.innerHTML='<p class="text-gray-500 text-sm text-center py-6">No related found</p>';
    },

    setupActionHandlers: function(p){ var k='action_'+p.replace(/\//g,'_'); this.UI.likeBtn.onclick=()=>{ this.handleVote('likes',k); }; this.UI.dislikeBtn.onclick=()=>{ this.handleVote('dislikes',k); }; },
    handleVote: async function(t,k){ var c=localStorage.getItem(k); var o=t==='likes'?'dislikes':'likes'; var u={}; if(c===t){ u[t]=increment(-1); localStorage.removeItem(k); } else { u[t]=increment(1); if(c) u[o]=increment(-1); localStorage.setItem(k,t); } await updateDoc(this.state.movieRef,u); },
    updateActionButtonsUI: function(p){ var k='action_'+p.replace(/\//g,'_'); var v=localStorage.getItem(k); this.UI.likeBtn.classList.toggle('active',v==='likes'); this.UI.dislikeBtn.classList.toggle('active',v==='dislikes'); },
    setupCommentSection: function(p){ var c=collection(db,p+'/comments'); this.UI.commentBtn.onclick=()=>{ this.UI.commentSection.classList.add('open'); }; this.UI.closeCommentsBtn.onclick=()=>{ this.UI.commentSection.classList.remove('open'); }; this.UI.commentForm.onsubmit=async (e)=>{ e.preventDefault(); var t=this.UI.commentInput.value.trim(); if(t){ await addDoc(c,{text:t, author:getUserName(), createdAt:serverTimestamp()}); this.UI.commentInput.value=''; } }; this.listenForComments(c); },
    listenForComments: function(r){ onSnapshot(query(r, orderBy('createdAt','desc')), (s)=>{ this.UI.commentsList.innerHTML=''; s.forEach((d)=>{ var c=d.data(); var a=c.createdAt&&c.createdAt.toDate?c.createdAt.toDate().toLocaleString():''; var e=document.createElement('div'); e.className='border-b border-gray-800 py-3'; e.innerHTML='<div class="flex gap-3"><i class="fas fa-user-circle text-2xl text-gray-600"></i><div><p class="text-white text-sm font-semibold">'+c.author+' <span class="text-xs text-gray-500 ml-2">'+a+'</span></p><p class="text-gray-300 text-sm mt-1 break-words">'+c.text+'</p></div></div>'; this.UI.commentsList.appendChild(e); }); }); }
};
