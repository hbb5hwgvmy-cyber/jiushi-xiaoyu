/* YouTube: official Data API search + one reused IFrame player. */
const YTAPI={
  key(){try{return localStorage.getItem('tikfix.ytkey')||''}catch(e){return ''}},
  setKey(k){try{localStorage.setItem('tikfix.ytkey',k)}catch(e){}},
  units(){
    try{const u=JSON.parse(localStorage.getItem('tikfix.units')||'{}');return u.day===YTAPI.today()?u.n:0}catch(e){return 0}
  },
  addUnits(n){try{localStorage.setItem('tikfix.units',JSON.stringify({day:YTAPI.today(),n:YTAPI.units()+n}))}catch(e){}},
  today(){return new Date().toDateString()},
  /* search.list costs 100 quota units per call, so callers cache results. */
  async search({q,pageToken,lang='zh',duration}){
    const p=new URLSearchParams({part:'snippet',type:'video',videoEmbeddable:'true',videoSyndicated:'true',safeSearch:'moderate',maxResults:'50',q,key:YTAPI.key()});
    if(lang)p.set('relevanceLanguage',lang);
    if(duration)p.set('videoDuration',duration);
    if(pageToken)p.set('pageToken',pageToken);
    const r=await fetch('https://www.googleapis.com/youtube/v3/search?'+p);
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      const e=new Error(d.error?.message||('HTTP '+r.status));
      e.reason=d.error?.errors?.[0]?.reason||String(r.status);
      throw e;
    }
    YTAPI.addUnits(100);
    return {next:d.nextPageToken||null,items:(d.items||[]).filter(x=>x.id?.videoId).map(x=>({
      id:x.id.videoId,title:decodeEntities(x.snippet.title),channel:decodeEntities(x.snippet.channelTitle),desc:decodeEntities(x.snippet.description||'')
    }))};
  },
};
function decodeEntities(t){const e=document.createElement('textarea');e.innerHTML=t;return e.value}

const YTP={
  player:null,ready:false,wantSound:false,handlers:{},pendingId:null,
  init(handlers){
    YTP.handlers=handlers;
    const create=()=>{
      YTP.player=new YT.Player('ytInner',{
        width:'100%',height:'100%',
        playerVars:{playsinline:1,rel:0,controls:1,origin:location.origin,fs:0,enablejsapi:1},
        events:{
          onReady(){YTP.ready=true;handlers.ready?.();if(YTP.pendingId){const i=YTP.pendingId;YTP.pendingId=null;YTP.load(i)}},
          onStateChange(e){
            if(e.data===YT.PlayerState.PLAYING)handlers.playing?.();
            if(e.data===YT.PlayerState.ENDED)handlers.ended?.();
          },
          onError(e){handlers.error?.(e.data)},
        },
      });
    };
    if(window.YT&&YT.Player)return create();
    window.onYouTubeIframeAPIReady=create;
    const tag=document.createElement('script');
    tag.src='https://www.youtube.com/iframe_api';
    tag.onerror=()=>handlers.loadFailed?.();
    document.head.appendChild(tag);
  },
  load(id){
    if(!YTP.ready){YTP.pendingId=id;return}
    if(YTP.wantSound)YTP.player.unMute();else YTP.player.mute();
    YTP.player.loadVideoById(id);
    /* A browser may refuse sound without a recent tap: fall back to muted play. */
    clearTimeout(YTP.guard);
    YTP.guard=setTimeout(()=>{
      if(YTP.ready&&YTP.wantSound&&YTP.player.getPlayerState&&YTP.player.getPlayerState()!==YT.PlayerState.PLAYING&&YTP.player.getPlayerState()!==YT.PlayerState.BUFFERING&&!YTP.held){
        YTP.wantSound=false;YTP.player.mute();YTP.player.playVideo();YTP.handlers.muted?.();
      }
    },1800);
  },
  held:false,
  pause(){YTP.held=true;if(YTP.ready)YTP.player.pauseVideo?.()},
  play(){YTP.held=false;if(YTP.ready)YTP.player.playVideo?.()},
  toggle(){if(!YTP.ready)return;if(YTP.player.getPlayerState?.()===YT.PlayerState.PLAYING)YTP.pause();else YTP.play()},
  sound(){YTP.wantSound=true;if(YTP.ready){YTP.player.unMute();YTP.player.playVideo()}},
  progress(){try{const d=YTP.player.getDuration(),t=YTP.player.getCurrentTime();return d>0?t/d:0}catch(e){return 0}},
};
