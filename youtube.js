/* YouTube: official Data API search + one reused IFrame player. */
const YTAPI={
  key(){try{return localStorage.getItem('tikfix.ytkey')||''}catch(e){return ''}},
  setKey(k){try{localStorage.setItem('tikfix.ytkey',k)}catch(e){}},
  units(){
    try{const u=JSON.parse(localStorage.getItem('tikfix.units')||'{}');return u.day===YTAPI.today()?u.n:0}catch(e){return 0}
  },
  addUnits(n){try{localStorage.setItem('tikfix.units',JSON.stringify({day:YTAPI.today(),n:YTAPI.units()+n}))}catch(e){}},
  /* quota resets at midnight Pacific time, so the day is counted there */
  today(){return new Date().toLocaleDateString('en-US',{timeZone:'America/Los_Angeles'})},
  /* search.list costs 100 quota units per call, so callers cache results. */
  async search({q,pageToken,lang='zh',duration,region}){
    const p=new URLSearchParams({part:'snippet',type:'video',videoEmbeddable:'true',videoSyndicated:'true',safeSearch:NIGHT?'none':'moderate',maxResults:'50',q,key:YTAPI.key()});
    if(lang)p.set('relevanceLanguage',lang);
    if(region)p.set('regionCode',region);
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
    /* at night safe search is off, so age-restricted videos turn up; the embedded player cannot play them.
       One videos.list call (1 unit) finds them and they are dropped before anyone sees them. */
    const bad=NIGHT?await YTAPI.unplayable((d.items||[]).map(x=>x.id?.videoId).filter(Boolean)):new Set();
    return {next:d.nextPageToken||null,items:(d.items||[]).filter(x=>x.id?.videoId&&!bad.has(x.id.videoId)).map(x=>({
      id:x.id.videoId,title:decodeEntities(x.snippet.title),channel:decodeEntities(x.snippet.channelTitle),channelId:x.snippet.channelId,desc:decodeEntities(x.snippet.description||'')
    }))};
  },
  async unplayable(ids){
    if(!ids.length)return new Set();
    try{
      const r=await fetch('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({part:'contentDetails,status',id:ids.join(','),key:YTAPI.key()}));
      const d=await r.json().catch(()=>({}));if(!r.ok)return new Set();YTAPI.addUnits(1);
      return new Set((d.items||[]).filter(x=>typeof x.id==='string'&&(ageLimited(x)||x.status?.embeddable===false)).map(x=>x.id));
    }catch(e){return new Set()}
  },
  /* A channel's latest uploads: playlistItems (1 unit) + videos for length and embeddability (1 unit),
     against 100 units for one search. Keeps videos up to maxSec long that can play here. */
  /* channel by @handle: 1 unit; null when there is no such channel */
  async channel(handle){
    const r=await fetch('https://www.googleapis.com/youtube/v3/channels?'+new URLSearchParams({part:'snippet',forHandle:handle,key:YTAPI.key()}));
    const d=await r.json().catch(()=>({}));if(!r.ok)return null;YTAPI.addUnits(1);
    const c=d.items?.[0];return c?{id:c.id,title:decodeEntities(c.snippet?.title||'')}:null;
  },
  async uploads(channelId,pageToken,maxSec=240){
    const get=async(path,params)=>{
      const r=await fetch(`https://www.googleapis.com/youtube/v3/${path}?`+new URLSearchParams({...params,key:YTAPI.key()}));
      const d=await r.json().catch(()=>({}));
      if(!r.ok){const e=new Error(d.error?.message||('HTTP '+r.status));e.reason=d.error?.errors?.[0]?.reason||String(r.status);throw e}
      YTAPI.addUnits(1);return d;
    };
    const p={part:'snippet',maxResults:'50',playlistId:'UU'+channelId.slice(2)};if(pageToken)p.pageToken=pageToken;
    const d=await get('playlistItems',p),snip=(d.items||[]).map(x=>x.snippet).filter(s=>s?.resourceId?.videoId);
    if(!snip.length)return {next:null,items:[]};
    const v=await get('videos',{part:'contentDetails,status',id:snip.map(s=>s.resourceId.videoId).join(',')});
    const ok=new Set((v.items||[]).filter(x=>x.status?.embeddable!==false&&!ageLimited(x)&&secs(x.contentDetails?.duration)<=maxSec).map(x=>x.id));
    return {next:d.nextPageToken||null,items:snip.filter(s=>ok.has(s.resourceId.videoId)).map(s=>({
      id:s.resourceId.videoId,title:decodeEntities(s.title),channel:decodeEntities(s.channelTitle||''),channelId,desc:decodeEntities(s.description||'')
    }))};
  },
};
const ageLimited=v=>v.contentDetails?.contentRating?.ytRating==='ytAgeRestricted';
const secs=iso=>{const m=/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso||'');return m?(+m[1]||0)*3600+(+m[2]||0)*60+(+m[3]||0):Infinity};
function decodeEntities(t){const e=document.createElement('textarea');e.innerHTML=t;return e.value}

const YTP={
  player:null,ready:false,cc:(()=>{try{return localStorage.getItem('xiaoyu.cc')==='1'}catch(e){return false}})(),wantSound:false,handlers:{},pendingId:null,
  init(handlers){
    YTP.handlers=handlers;
    const create=()=>{
      YTP.player=new YT.Player('ytInner',{
        width:'100%',height:'100%',
        playerVars:{playsinline:1,rel:0,controls:0,disablekb:1,iv_load_policy:3,hl:'zh-CN',cc_lang_pref:'zh-Hans',cc_load_policy:0,origin:location.origin,fs:0,enablejsapi:1},
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
  mute(){YTP.wantSound=false;if(YTP.ready)YTP.player.mute()},
  sound(){YTP.wantSound=true;if(YTP.ready){YTP.player.unMute();YTP.player.playVideo()}},
  /* The caption calls (loadModule / getOption / setOption 'captions') are not in YouTube's documented API but work
     in the embed (checked 2026-11-09 in Chromium against real videos). YouTube's own auto-load is off (cc_load_policy 0),
     so its default English track never shows first; we pick the track ourselves:
     a Simplified Chinese track as is; otherwise YouTube translates into zh-Hans from, in order, a Traditional Chinese
     track, the spoken-language auto track, English, or whatever there is. The tracklist is sorted by display name,
     so its first entry is an arbitrary language (often Arabic or German) and must not be the default source. */
  setCC(on){YTP.cc=on;if(!YTP.ready)return;try{if(on){YTP.player.loadModule('captions');YTP.captions()}else YTP.player.unloadModule('captions')}catch(e){}},
  ccSource(list){
    const code=t=>t.languageCode||'';
    return list.find(t=>/^zh(-Hans|-CN|-SG)?$/i.test(code(t)))||list.find(t=>/^zh/i.test(code(t)))||list.find(t=>t.kind==='asr')||list.find(t=>/^en/i.test(code(t)))||list[0];
  },
  captions(){
    clearTimeout(YTP.ccT);let tries=0;
    const pick=again=>{
      if(!YTP.cc)return;
      let list=[];try{list=YTP.player.getOption('captions','tracklist')||[]}catch(e){}
      if(!list.length){if(++tries<8)YTP.ccT=setTimeout(()=>pick(again),600);else YTP.handlers.noCaptions?.();return}
      const src=YTP.ccSource(list),hans=/^zh(-Hans|-CN|-SG)?$/i.test(src.languageCode);
      try{YTP.player.setOption('captions','track',hans?{languageCode:src.languageCode}:{languageCode:src.languageCode,translationLanguage:{languageCode:'zh-Hans',languageName:'中文（简体）'}})}catch(e){}
      /* set it once more a little later: the module can still be settling when the first call lands */
      if(again)YTP.ccT=setTimeout(()=>pick(false),1500);
    };
    try{YTP.player.loadModule('captions')}catch(e){}
    YTP.ccT=setTimeout(()=>pick(true),400);
  },
  rate(r){if(!YTP.ready)return;try{YTP.player.setPlaybackRate(r)}catch(e){}},
  seek(d){if(!YTP.ready)return;try{const t=YTP.player.getCurrentTime(),n=YTP.player.getDuration();YTP.player.seekTo(Math.max(0,Math.min(n?n-1:1e9,t+d)),true)}catch(e){}},
  progress(){try{const d=YTP.player.getDuration(),t=YTP.player.getCurrentTime();return d>0?t/d:0}catch(e){return 0}},
};
