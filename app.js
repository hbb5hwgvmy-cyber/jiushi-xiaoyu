/* 就是小屿 app: daily sailing between islands, moment sessions, and the rules around them. */
/* Internal names (LINES, stations, edges) come from the first metro-style prototype and are kept so saved logic stays intact.
   In the UI a "line" is a sea (海域), a "station" is an island (岛) and an "edge" is a sailing route (航线). */
const LINES=[
  {id:'home',name:'在家海',color:'#f2a65a',stops:['film','living','pet'],type:'相近',lx:200,ly:-14},
  {id:'out',name:'出门海',color:'#4da3ff',stops:['travel','sport'],type:'切换',lx:205,ly:318},
];
const WHY={变深:'再深入一点',相近:'去邻近的岛',切换:'换个节奏',试运营:'试一条新航线',你加的:'这是你加的航线',换线:'这片海走到头了，换一片'};
const WHENS=['随时','仅早上','仅晚上','仅周末晚上'];
const CAPS=[null,{k:'day',n:5},{k:'week',n:2},{k:'month',n:1}];
const capText=c=>!c?'不限量':`每${{day:'天',week:'周',month:'月'}[c.k]}最多 ${c.n} 条`;
const FALLBACK_ICON='app-lighthouse.svg';
const s=(id,name,x,y,lab,when,cap,extra)=>({id,name,x,y,lab,when:when||'随时',cap:cap||null,paused:false,icon:`theme-${id}.svg`,...extra});
let stations=[
  s('film','电影',60,70,'a',0,0,{en:'Cinema',icon:'theme-film.svg'}),
  s('living','居家',200,40,'a',0,0,{en:'Home & Living',icon:'theme-rent.svg'}),
  s('pet','宠物',340,80,'a',0,{k:'day',n:5},{en:'Pets',icon:'theme-cat.svg'}),
  s('travel','旅行',310,235,'b',0,0,{en:'Travel',icon:'theme-travel.svg'}),
  s('sport','运动',100,240,'b','仅早上',0,{en:'Sports',icon:'theme-fit.svg'}),
];
let edges=[];
LINES.forEach(l=>l.stops.slice(0,-1).forEach((a,i)=>edges.push({from:a,to:l.stops[i+1],line:l.id,type:l.type,w:1,cut:false})));
edges.push({from:'pet',to:'travel',line:null,type:'相近',w:.8,cut:false});
edges.push({from:'sport',to:'film',line:null,type:'切换',w:.8,cut:false});
let tastes=[{tag:'有质感',like:true},{tag:'讲得清楚',like:true},{tag:'生活化',like:true},{tag:'标题党',like:false},{tag:'带货',like:false}];
let logs=[{text:'这是示例群岛',from:'原型预置，不是你的真实偏好'}];


/* Search words per island when no AI is connected: Chinese, English and Japanese, so the feed is not limited to one language. */
const QUERY={
  film:[['电影 推荐 解读','zh'],['film essay','en'],['映画 解説','ja']],
  living:[['居家 生活 vlog','zh'],['slow living home vlog','en'],['丁寧な暮らし','ja']],
  pet:[['猫 狗 日常','zh'],['cute pets daily life','en'],['猫のいる暮らし','ja']],
  travel:[['旅行 vlog 城市漫步','zh'],['city walk travel','en'],['旅 vlog 散歩','ja']],
  sport:[['跑步 健身 日常','zh'],['running training vlog','en'],['ランニング 習慣','ja']],
};
const POOL_TTL=24*3600*1000;
/* Content region: whole world, or one country. A country narrows YouTube search (regionCode + its language) and,
   with AI on, the search words are written in that country's language about things made there.
   YouTube has no region code for mainland China. */
const REGIONS=[
  {id:'',name:'全世界'},
  {id:'TW',name:'台湾',en:'Taiwan',lang:'zh-Hant'},{id:'HK',name:'香港',en:'Hong Kong',lang:'zh-Hant'},
  {id:'JP',name:'日本',en:'Japan',lang:'ja'},{id:'KR',name:'韩国',en:'Korea',lang:'ko'},
  {id:'TH',name:'泰国',en:'Thailand',lang:'th'},{id:'VN',name:'越南',en:'Vietnam',lang:'vi'},{id:'IN',name:'印度',en:'India',lang:'hi'},
  {id:'US',name:'美国',en:'USA',lang:'en'},{id:'CA',name:'加拿大',en:'Canada',lang:'en'},{id:'MX',name:'墨西哥',en:'Mexico',lang:'es'},{id:'BR',name:'巴西',en:'Brazil',lang:'pt'},
  {id:'GB',name:'英国',en:'UK',lang:'en'},{id:'FR',name:'法国',en:'France',lang:'fr'},{id:'DE',name:'德国',en:'Germany',lang:'de'},
  {id:'IT',name:'意大利',en:'Italy',lang:'it'},{id:'ES',name:'西班牙',en:'Spain',lang:'es'},{id:'AU',name:'澳大利亚',en:'Australia',lang:'en'},
];
const region=()=>{try{return REGIONS.find(r=>r.id===localStorage.getItem('xiaoyu.region'))||REGIONS[0]}catch(e){return REGIONS[0]}};

const $=id=>document.getElementById(id);
const st=id=>stations.find(x=>x.id===id);
const ln=id=>LINES.find(l=>l.id===id);
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hhmm=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const MOMENT_COLOR='#ffd166';

let setPage=null,clips=[],idx=-1,enter=0,moment=null,tab='moment',sel={type:'st',id:'film'},mapMode='near',seenLine={},liked={},undoStack=[],cardTimer=null,cardState='off',busy=false,overOpen=false,vb=null,vbRaf=0,started=false,moving=false;
let plays=[],seen={},pools={},emptyStations=new Set();

/* persistence */
function save(){try{localStorage.setItem('xiaoyu.v3.state',JSON.stringify({stations,edges,tastes,logs,plays:plays.slice(-500),seen,liked}))}catch(e){}}
function savePools(){try{localStorage.setItem('xiaoyu.v3.pools',JSON.stringify(pools))}catch(e){}}
function load(){
  try{
    const d=JSON.parse(localStorage.getItem('xiaoyu.v3.state')||'null');
    if(d){
      /* islands from the sample keep their latest positions; rules the user changed are kept */
      const home=Object.fromEntries(stations.map(n=>[n.id,n]));
      stations=d.stations.map(n=>home[n.id]?{...n,x:home[n.id].x,y:home[n.id].y}:n);
      edges=d.edges;tastes=d.tastes;logs=d.logs;plays=d.plays||[];seen=d.seen||{};liked=d.liked||{};
    }
    pools=JSON.parse(localStorage.getItem('xiaoyu.v3.pools')||'{}');
  }catch(e){}
}

function nowOk(when){
  const d=new Date(),h=d.getHours(),wk=d.getDay()===0||d.getDay()===6;
  const eve=h>=18||h<2;
  return when==='随时'||(when==='仅早上'&&h>=5&&h<11)||(when==='仅晚上'&&eve)||(when==='仅周末晚上'&&eve&&wk);
}
const PERIOD={day:864e5,week:7*864e5,month:30*864e5};
const played=n=>{const since=n.cap?Date.now()-PERIOD[n.cap.k]:0;return plays.filter(p=>p.st===n.id&&p.t>=since).length};
const eligible=n=>!n.paused&&!emptyStations.has(n.id)&&nowOk(n.when)&&(!n.cap||played(n)<n.cap.n);
const linesAt=id=>LINES.filter(l=>l.stops.includes(id));

/* videos */
const avoidWords=()=>tastes.filter(t=>!t.like).map(t=>t.tag).concat(moment?moment.avoids:[]);
const likeWords=()=>moment?moment.tastes:tastes.filter(t=>t.like).map(t=>t.tag);
const textOf=v=>(v.title+' '+v.channel+' '+v.desc).toLowerCase();
function ranked(items){
  const bad=avoidWords().map(w=>w.toLowerCase()),good=likeWords().map(w=>w.toLowerCase());
  return items.filter(v=>!seen[v.id]&&!bad.some(b=>b&&textOf(v).includes(b)))
    .map((v,i)=>({v,score:good.filter(g=>g&&textOf(v).includes(g)).length*10-i*.1}))
    .sort((a,b)=>b.score-a.score).map(x=>x.v);
}
function apiFail(e){
  const r=e.reason||'';
  if(r==='quotaExceeded'||r==='dailyLimitExceeded')toast('今天的 YouTube 配额用完了，明天恢复');
  else if(/keyInvalid|badRequest|ipRefererBlocked|forbidden|API_KEY|accessNotConfigured/i.test(r)||/API key/i.test(e.message))askKey(`YouTube 拒绝了这个 Key：${e.message}`);
  else toast('连不上 YouTube，稍后再试');
}
function setLoading(on,text){$('load').hidden=!on;if(text)$('load').textContent=text}
/* AI finds the videos: it writes the search words for an island (zh/en/ja), then screens what YouTube returns.
   Without AI the fixed words in QUERY are used and nothing is screened. */
async function aiQueries(n){
  const R=region(),likes=tastes.filter(t=>t.like).map(t=>t.tag),avoids=tastes.filter(t=>!t.like).map(t=>t.tag);
  const d=await AI.json(`你为短视频应用“就是小屿”找 YouTube 视频。主题岛：${n.name}（${n.en||n.name}）。用户喜欢：${likes.join('、')||'无'}；避开：${avoids.join('、')||'无'}。
${R.id?`只要${R.name}本地人拍的、关于${R.name}的内容。写 3 个 YouTube 搜索词，都用当地语言（${R.lang}），角度各不相同。`:'写 3 个 YouTube 搜索词：中文、英文、日文各一个。'}要生活化又有质感，像一个有品味的人会搜的词，不要标题党。
只回复 JSON：{"queries":[{"q":"搜索词","lang":"语言代码"},…]}`);
  const qs=(d.queries||[]).filter(x=>x&&x.q).map(x=>[String(x.q).slice(0,60),R.id?R.lang:['zh','en','ja'].includes(x.lang)?x.lang:'']);
  if(!qs.length)throw new Error('没有搜索词');
  return qs;
}
async function aiScreen(items,n){
  const likes=tastes.filter(t=>t.like).map(t=>t.tag),avoids=tastes.filter(t=>!t.like).map(t=>t.tag);
  const list=items.map(v=>`${v.id} | ${v.title} | ${v.channel} | ${v.desc.slice(0,100).replace(/\s+/g,' ')}`).join('\n');
  const d=await AI.json(`你替用户筛短视频，主题岛：${n.name}（${n.en||n.name}）。用户喜欢：${likes.join('、')||'无'}；避开：${avoids.join('、')||'无'}。
${region().id?`用户只想看${region().name}本地的内容，明显不是${region().name}的去掉。`:''}下面每行是一条 YouTube 视频：id | 标题 | 频道 | 简介。挑出最多 15 条真正值得看的，去掉标题党、带货、搬运、和主题无关或用户避开的内容，按值得看的程度排序。
只回复 JSON：{"keep":[{"id":"视频 id","zh":"中文标题（原标题是中文就照抄）","why":"不超过 16 个字的推荐理由"}]}

${list}`);
  const by=Object.fromEntries(items.map(v=>[v.id,v]));
  return (d.keep||[]).filter(k=>k&&by[k.id]).map(k=>({...by[k.id],zh:String(k.zh||'').slice(0,60),why:String(k.why||'').slice(0,30)}));
}
async function nextFromStation(id){
  const n=st(id);
  let pool=pools[id];
  if(!pool||Date.now()-pool.at>POOL_TTL)pool=pools[id]={items:[],tokens:{},qi:0,at:0,queries:null,done:{}};
  const useAI=AI.ready();
  if(!pool.queries){
    const R=region(),base=QUERY[id]||[[n.name,'zh'],[n.en||n.name,'en']];
    pool.queries=!R.id?base:R.lang==='ja'?base.filter(q=>q[1]==='ja'):R.lang.startsWith('zh')?base.filter(q=>q[1]==='zh'):[[`${(base.find(q=>q[1]==='en')||base[0])[0]} ${R.en}`,R.lang]];
    if(useAI){setLoading(true,'AI 正在想搜索词…');try{pool.queries=await aiQueries(n);pool.byAI=true}catch(e){toast('AI 没有回应，先用默认搜索词')}finally{setLoading(false)}}
  }
  for(let round=0;round<=pool.queries.length;round++){
    const list=ranked(pool.items);
    if(list.length){
      const v=list[0];pool.items=pool.items.filter(x=>x.id!==v.id);savePools();return v;
    }
    const open=pool.queries.map((q,i)=>i).filter(i=>!pool.done[i]);
    if(round===pool.queries.length||!open.length)break;
    const qi=open[pool.qi%open.length];pool.qi++;
    const [q,lang]=pool.queries[qi];
    setLoading(true,'正在找片…');
    let found;
    try{
      const r=await YTAPI.search({q,lang,region:region().id,pageToken:pool.tokens[qi]||undefined,duration:'short'});
      pool.tokens[qi]=r.next;if(!r.next)pool.done[qi]=true;found=r.items;
    }catch(e){setLoading(false);apiFail(e);throw e}
    if(useAI&&found.length){
      setLoading(true,'AI 正在替你筛…');
      try{found=await aiScreen(found,n)}catch(e){toast('AI 没有回应，这一批没有筛')}
    }
    setLoading(false);
    pool.items=pool.items.concat(found);pool.at=Date.now();savePools();
  }
  return null;
}
function makeClip(stId,lineId,hop,v){
  return {st:stId,line:lineId,video:v,title:v.title,by:v.channel,hop,color:ln(lineId)?.color||'#59b7a8',seed:clips.length};
}
function planDaily(){
  let cur=null;
  for(let i=Math.min(idx,clips.length-1);i>=0;i--)if(!clips[i].moment){cur=clips[i];break}
  if(!cur){const first=stations.find(eligible);if(!first)return null;const l=linesAt(first.id)[0]?.id||'home';return {st:first.id,line:l,hop:{start:true,transfer:true,why:'今天从这里出发',toLine:l}}}
  const afterMoment=clips[idx]&&clips[idx].moment;
  let run=0;for(let i=clips.length-1;i>=0&&clips[i].st===cur.st&&!clips[i].moment;i--)run++;
  if(!afterMoment&&run<2&&eligible(st(cur.st)))return {st:cur.st,line:cur.line,hop:null};
  const out=edges.filter(e=>e.from===cur.st&&!e.cut&&eligible(st(e.to)));
  if(out.length){
    const weight=e=>e.w*(e.line===cur.line?1.6:1);
    let r=Math.random()*out.reduce((a,e)=>a+weight(e),0),pick=out[0];
    for(const e of out){r-=weight(e);if(r<=0){pick=e;break}}
    const line=pick.line||linesAt(pick.to)[0]?.id||cur.line;
    return {st:pick.to,line,hop:{from:cur.st,to:pick.to,type:pick.type,why:afterMoment?'专场结束，回到日常':WHY[pick.type],transfer:line!==cur.line||afterMoment,toLine:line,edge:pick.from+'>'+pick.to}};
  }
  const i=LINES.findIndex(l=>l.id===cur.line);
  for(let t=1;t<=LINES.length;t++){
    const l=LINES[(i+t)%LINES.length],to=l.stops.find(x=>eligible(st(x)));
    if(to)return {st:to,line:l.id,hop:{from:cur.st,to,type:'换线',why:afterMoment?'专场结束，回到日常':WHY.换线,transfer:true,toLine:l.id}};
  }
  const any=stations.find(eligible);
  return any?{st:any.id,line:linesAt(any.id)[0]?.id||cur.line,hop:{from:cur.st,to:any.id,type:'换线',why:WHY.换线,transfer:true,toLine:linesAt(any.id)[0]?.id||cur.line}}:null;
}
async function nextDaily(){
  for(let tries=0;tries<stations.length;tries++){
    const plan=planDaily();if(!plan)return null;
    const v=await nextFromStation(plan.st);
    if(v)return makeClip(plan.st,plan.line,plan.hop,v);
    emptyStations.add(plan.st);
  }
  return null;
}
async function nextMoment(){
  const m=moment;
  for(let round=0;round<3;round++){
    const list=ranked(m.items);
    if(list.length){
      const v=list[0];m.items=m.items.filter(x=>x.id!==v.id);
      return {moment:true,st:m.station,line:null,video:v,title:v.title,by:v.channel,tag:v.channel,color:m.color,seed:clips.length,scene:m.topic};
    }
    if(m.exhausted)return null;
    setLoading(true);
    try{
      const r=await YTAPI.search({q:m.query,region:region().id,lang:region().lang,pageToken:m.next||undefined});
      m.items=m.items.concat(r.items);m.next=r.next;if(!r.next)m.exhausted=true;
    }catch(e){apiFail(e);throw e}finally{setLoading(false)}
  }
  return null;
}

/* screen */
function coverEl(c){
  const el=document.createElement('div');
  el.className='clip';
  el.style.cssText=`--c:${c.color};background:color-mix(in srgb,${c.color} 14%,#0a0b11);`;
  el.innerHTML=`<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="scene"></div>`;
  el.querySelector('.scene').textContent=c.scene||st(c.st).name;
  return el;
}
function dropCover(){const el=$('feed').lastElementChild;if(el&&!el.classList.contains('gone')){el.classList.add('gone');setTimeout(()=>el.remove(),380)}}
/* Top strip: where you are, in the middle and fully visible; the islands before and after it along the routes
   sit to either side, fainter the further away, so you can see the neighbourhood at a glance. */
const NEAR_OPACITY=.45,FAR_OPACITY=.2;
function routeAround(c){
  if(c.moment)return {before:[],after:[]};
  const live=edges.filter(e=>!e.cut&&!st(e.from)?.paused&&!st(e.to)?.paused),seen=new Set([c.st]);
  const walk=(id,dir)=>{const out=[];for(let i=0;i<2;i++){const e=live.find(e=>(dir>0?e.from:e.to)===id&&!seen.has(dir>0?e.to:e.from));if(!e)break;id=dir>0?e.to:e.from;seen.add(id);out.push(id)}return out};
  let before=c.hop?.from&&st(c.hop.from)?[c.hop.from]:[];before.forEach(id=>seen.add(id));
  const after=walk(c.st,1);
  if(!before.length)before=walk(c.st,-1);else before=before.concat(walk(before[0],-1)).slice(0,2);
  return {before:before.reverse(),after};
}
const PEN=`<svg class="nl" viewBox="0 0 18 8" aria-hidden="true"><path d="M1 5C5 2.500 9 6.500 17 3.500"/></svg>`;
function drawNode(c){
  const n=st(c.st)||{},name=c.moment?(c.scene||n.name||''):n.name||'',r=routeAround(c);
  const isle=(id,o)=>`<button class="nb" data-act="hop" data-id="${esc(id)}" style="opacity:${o}" aria-label="去${esc(st(id).name)}岛"><img src="icons/${esc(st(id).icon||FALLBACK_ICON)}" alt=""></button>`;
  const side=(ids,toward)=>ids.map((id,i)=>{const o=(toward?ids.length-1-i:i)===0?NEAR_OPACITY:FAR_OPACITY;return toward?isle(id,o)+`<span style="opacity:${o}">${PEN}</span>`:`<span style="opacity:${o}">${PEN}</span>`+isle(id,o)}).join('');
  $('nodeBefore').innerHTML=side(r.before,true);$('nodeAfter').innerHTML=side(r.after,false);
  $('nodeIcon').innerHTML=`<img src="icons/${esc(n.icon||FALLBACK_ICON)}" alt="">`;
  $('nodeName').textContent=name;$('node').querySelector('.ncur').setAttribute('aria-label',`当前小岛：${name}。点按打开群岛图`);
  $('node').hidden=false;$('node').classList.add('named');clearTimeout(drawNode.t);drawNode.t=setTimeout(()=>$('node').classList.remove('named'),2200);
}
function showClip(){
  const c=clips[idx],feed=$('feed');
  feed.innerHTML='';feed.appendChild(coverEl(c));
  clearTimeout(showClip.t);showClip.t=setTimeout(dropCover,4000);
  document.documentElement.style.setProperty('--ch',c.color);
  drawNode(c);
  $('metaBy').textContent=c.by;$('metaTitle').textContent=c.video.zh||c.title;
  $('metaWhy').textContent=c.video.why?`AI：${c.video.why}`:'';$('metaWhy').hidden=!c.video.why;
  $('metaLink').href='https://www.youtube.com/watch?v='+encodeURIComponent(c.video.id);
  $('like').classList.toggle('on',!!liked[c.video.id]);
  $('sound').hidden=YTP.wantSound;
  wake();
  seen[c.video.id]=Date.now();
  if(!c.moment&&!c.counted){plays.push({st:c.st,t:Date.now()});c.counted=true}
  save();
  enter=Date.now();
  YTP.load(c.video.id);
}
function feedback(){
  const c=clips[idx];if(!c)return;
  const dwell=Date.now()-enter;
  if(c.moment){if(moment)moment.dwell[c.tag]=(moment.dwell[c.tag]||0)+dwell;return}
  const e=c.hop&&c.hop.edge&&edges.find(x=>x.from+'>'+x.to===c.hop.edge);
  if(e){if(dwell>=6000)e.w=Math.min(2,+(e.w+.1).toFixed(2));else if(dwell<2000)e.w=Math.max(.2,+(e.w-.1).toFixed(2));save()}
}
async function go(dir){
  if(overOpen||moving)return;
  if($('phone').classList.contains('open')){closeSheet();return}
  moving=true;
  try{
    feedback();
    if(dir>0){
      if(idx===clips.length-1){
        const n=moment?await nextMoment():await nextDaily();
        if(!n){if(moment)momentOut();else toast('今天符合规则的视频看完了');return}
        clips.push(n);
      }
      idx++;
    }else{if(idx<=0)return;idx--}
    showClip();
    const c=clips[idx];
    if(c.moment){if(cardState!=='off')hideCard();return}
    sel={type:'st',id:c.st};
    if(dir>0&&c.hop&&c.hop.transfer)transferCard(c);else if(cardState!=='off')hideCard();
  }catch(e){/* apiFail already told the viewer */}
  finally{moving=false}
}

/* signage */
function ruleHTML(n,live){
  if(n.paused)return `<p class="rule"><b>${esc(n.name)}</b> 已停航。规则还留着，随时能恢复。</p>`;
  const t=n.cap&&n.cap.k!=='day'?'喜欢，但只偶尔看':n.cap?'适量看':'常看';
  const w=live?`<span class="tok" role="button" tabindex="0" data-act="cyc-when">${esc(n.when)}</span>`:esc(n.when);
  const c=live?`<span class="tok" role="button" tabindex="0" data-act="cyc-cap">${esc(capText(n.cap))}</span>`:esc(capText(n.cap));
  return `<p class="rule">${t}。${w}出现，${c}。</p>`;
}
function strip(lineId,cur){
  const l=ln(lineId);if(!l)return '';
  let i=l.stops.indexOf(cur),a=Math.max(0,i-1),list=l.stops.slice(a,a+4);
  if(list.length<4&&l.stops.length>=4)list=l.stops.slice(-4);
  return `<div class="strip" style="--ch:${l.color}">`+list.map(x=>`<div class="${x===cur?'now':''} ${linesAt(x).length>1?'x':''}"><img class="ic" src="icons/${esc(st(x).icon||FALLBACK_ICON)}" alt="">${esc(st(x).name)}</div>`).join('')+`</div>`;
}
function openCard(html,dur,color){
  clearTimeout(cardTimer);
  cardState='on';
  if(color)document.documentElement.style.setProperty('--ch',color);
  $('cbody').innerHTML=html;
  $('card').classList.add('show');$('phone').classList.add('covered');
  const cd=$('cd');cd.classList.remove('run');void cd.offsetWidth;
  cd.style.setProperty('--dur',dur+'ms');cd.classList.add('run');
  cardTimer=setTimeout(hideCard,dur);
}
function hideCard(){
  clearTimeout(cardTimer);cardState='off';
  $('card').classList.remove('show');$('phone').classList.remove('covered');$('cd').classList.remove('run');
}
function transferCard(c){
  const n=st(c.st),l=ln(c.line),repeat=seenLine[c.line];seenLine[c.line]=true;
  const hop=c.hop.from?`从「${esc(st(c.hop.from).name)}」岛过来：${esc(c.hop.why)}`:esc(c.hop.why);
  const head=`<div class="eyebrow">${c.hop.from?'驶向 · ':''}${esc(l.name)}</div><h2 class="sign">${esc(n.name)}</h2><p class="hop">${hop}</p>`;
  if(repeat)return openCard(head,3000,l.color);
  openCard(head+strip(c.line,c.st)+ruleHTML(n)+`<span class="hint">轻点打开群岛图</span>`,5500,l.color);
}
function momentCard(){
  const m=moment;
  const tagList=(k,arr,no)=>arr.length?`<div class="tags"><span class="k">${k}</span>${arr.map(x=>`<span class="tag ${no?'no':''}">${esc(x)}</span>`).join('')}</div>`:'';
  openCard(`<div class="eyebrow">此刻专场</div><h2 class="sign">${esc(m.topic)}</h2><p class="hop">${m.until?`只放这一类，到 ${hhmm(m.until)} 结束`:'只放这一类，直到你退出'}${m.known?'':'。这类你看得少，先按整体口味试几条'}</p>`+tagList('按你的口味',m.tastes)+tagList('避开',m.avoids,true)+`<span class="hint">轻点修改</span>`,6000,MOMENT_COLOR);
}


/* moment lifecycle */
async function startMoment(a){
  feedback();
  const topic=a.topic;
  const near=stations.find(x=>topic.includes(x.name)||x.name.includes(topic));
  const likes=tastes.filter(t=>t.like).map(t=>t.tag),avoids=tastes.filter(t=>!t.like).map(t=>t.tag);
  const prev=moment;
  moment={topic,query:topic,until:a.until,tastes:(a.tastes&&a.tastes.length?a.tastes:likes).slice(0,4),avoids:[...new Set([...(a.avoids||[]),...avoids])].slice(0,6),items:[],next:null,exhausted:false,station:near?near.id:clips[idx]?.st||'film',known:!!near,color:near?(ln(linesAt(near.id)[0]?.id)?.color||MOMENT_COLOR):MOMENT_COLOR,dwell:{},startIdx:idx+1};
  closeSheet();
  let n=null;
  try{n=await nextMoment()}catch(e){moment=prev;updatePill();return}
  if(!n){moment=prev;updatePill();toast(`没有找到符合规则的“${topic}”视频`);return}
  clips=clips.slice(0,idx+1);clips.push(n);idx++;showClip();momentCard();updatePill();
}
function updatePill(){
  $('pill').hidden=!moment;
  if(!moment)return;
  $('pillName').textContent=moment.topic;
  if(!moment.until){$('pillTime').textContent='';return}
  const left=Math.max(0,Math.ceil((moment.until-Date.now())/60000));
  $('pillTime').textContent=left>=60?hhmm(moment.until):`还剩 ${left} 分`;
  if(!overOpen&&moment.until<=Date.now())timeUp();
}
const momentCount=()=>clips.slice(moment.startIdx,idx+1).filter(c=>c.moment).length;
function over(html){
  overOpen=true;closeSheet();hideCard();
  YTP.pause();
  $('over').innerHTML=html;$('over').hidden=false;
}
function closeOver(resume=true){overOpen=false;$('over').hidden=true;if(resume&&started)YTP.play()}
function timeUp(){
  over(`<div class="big">${hhmm(moment.until)}</div><h2>到点了</h2><p>“${esc(moment.topic)}”专场看了 ${momentCount()} 条，视频已停止。</p><div class="btns"><button class="btn" data-act="more15">再看 15 分钟</button><button class="btn prime" data-act="finish">结束专场</button></div>`);
}
function momentOut(){
  over(`<h2>这类暂时没有了</h2><p>符合“${esc(moment.topic)}”和你口味的视频放完了。我不会悄悄混入别的内容。</p><div class="btns"><button class="btn prime" data-act="widen">放宽搜索范围</button><button class="btn" data-act="finish">结束专场</button></div>`);
}
function finishMoment(){
  feedback();enter=Date.now();
  const top=Object.entries(moment.dwell).sort((a,b)=>b[1]-a[1])[0];
  const fresh=top&&top[1]>=30000&&!tastes.some(t=>t.tag===top[0])?top[0]:null;
  if(fresh){
    moment.candidate=fresh;
    over(`<h2>要记下这个吗？</h2><p>这场你看得最久的频道是“${esc(fresh)}”。记下后，它会进入长期口味。</p><p class="dim">不记的话，你的口味和日常航线都和开场前一样。</p><div class="btns"><button class="btn prime" data-act="keep">记下</button><button class="btn" data-act="skip">不用</button></div>`);
  }else leaveMoment('专场结束。口味和日常航线都没有变化。');
}
async function leaveMoment(msg){
  moment=null;updatePill();closeOver(false);
  clips=clips.slice(0,idx+1);
  toast(msg);
  try{
    const n=await nextDaily();
    if(n){clips.push(n);idx++;showClip();sel={type:'st',id:n.st};if(n.hop&&n.hop.transfer)transferCard(n)}
  }catch(e){}
}

/* map */
const WHOLE=[-60,-70,480,400];
const edgeKey=e=>e.from+'>'+e.to;
/* Routes look hand-drawn: a gentle bow plus a slight wobble, seeded by the route so they hold still between renders. */
function seeded(key){let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h=Math.imul(h^h>>>15,2246822507);h=Math.imul(h^h>>>13,3266489909);return((h^=h>>>16)>>>0)/4294967296}}
function pathOf(e,pass=''){
  const a=st(e.from),b=st(e.to),r=seeded(edgeKey(e)+pass),corners=[[a.x,a.y],...(e.via||[]),[b.x,b.y]],P=[corners[0]];
  const bowSign=seeded(edgeKey(e))()<.5?-1:1;
  for(let j=0;j<corners.length-1;j++){
    const[x0,y0]=corners[j],[x1,y1]=corners[j+1],dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    const bow=e.via?.length?0:bowSign*len*.12,N=Math.max(3,Math.round(len/38));
    for(let i=1;i<=N;i++){const t=i/N,k=4*t*(1-t)*bow+(i<N?(r()-.5)*5.5:0);P.push([x0+dx*t+nx*k,y0+dy*t+ny*k])}
  }
  const f=v=>v.toFixed(1);let d=`M${f(P[0][0])} ${f(P[0][1])}`;
  for(let i=0;i<P.length-1;i++){
    const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||p2;
    d+=` C${f(p1[0]+(p2[0]-p0[0])/6)} ${f(p1[1]+(p2[1]-p0[1])/6)} ${f(p2[0]-(p3[0]-p1[0])/6)} ${f(p2[1]-(p3[1]-p1[1])/6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
/* rough text width for the label pills: CJK about one em, Latin about half */
const textW=(t,size)=>[...t].reduce((w,c)=>w+(/[\u0000-\u00ff]/.test(c)?.56:1)*size,0);
const R=23;
function mapSVG(){
  const curId=clips[idx]?.st;
  const edgesSvg=edges.map(e=>{
    const off=st(e.to).paused||st(e.from).paused,l=ln(e.line),color=e.cut||off?'rgba(243,244,248,.28)':(l?l.color:'#e8e8ee');
    const dash=e.cut?'2 9':(e.type==='试运营'||off)?'9 8':'none';
    const on=sel.type==='edge'&&sel.id===edgeKey(e);
    const width=(l&&!e.cut?2+e.w*.9:2)+(on?2.5:0);
    /* a second, fainter pass of the pen makes the line read as drawn by hand */
    return `<path d="${pathOf(e)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash}"/>`+(e.cut?'':`<path d="${pathOf(e,'pen')}" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="${Math.max(1,width*.45)}" stroke-linecap="round" stroke-dasharray="${dash}"/>`);
  }).join('');
  const hits=edges.map(e=>`<path d="${pathOf(e)}" fill="none" stroke="transparent" stroke-width="22" data-act="edge" data-id="${esc(edgeKey(e))}" style="cursor:pointer"/>`).join('');
  const nodes=stations.map(n=>{
    const multi=linesAt(n.id).length>1,on=sel.type==='st'&&sel.id===n.id,cur=n.id===curId;
    const off=n.paused||!nowOk(n.when),sub=n.paused?'已停航':!nowOk(n.when)?n.when:n.cap?capText(n.cap).replace('最多 ','').replace(' 条','条'):'';
    /* label: one solid pill under the island, name then its limit; no outlines, so the text stays crisp */
    const nameW=textW(n.name,13),subW=sub?textW(sub,10.5)+8:0,pw=nameW+subW+18,py=n.y+R+7;
    const label=`<rect class="st-pill" x="${n.x-pw/2}" y="${py}" width="${pw}" height="21" rx="10.5"/><text class="st-name" x="${n.x-pw/2+9}" y="${py+15}">${esc(n.name)}</text>${sub?`<text class="st-sub" x="${n.x-pw/2+9+nameW+8}" y="${py+14.5}">${esc(sub)}</text>`:''}`;
    const ring=on?'#ffd166':multi?'rgba(255,255,255,.85)':'rgba(255,255,255,.25)';
    return `<g class="${off?'st-off':''}" data-act="st" data-id="${n.id}" style="cursor:pointer">${cur?`<circle class="here" cx="${n.x}" cy="${n.y}" r="${R+5}" fill="none" stroke="#fff" stroke-width="2"/>`:''}<circle cx="${n.x}" cy="${n.y}" r="${R+8}" fill="transparent"/><image href="icons/${esc(n.icon||FALLBACK_ICON)}" x="${n.x-R}" y="${n.y-R}" width="${R*2}" height="${R*2}" clip-path="url(#isleClip)" preserveAspectRatio="xMidYMid slice"/><circle cx="${n.x}" cy="${n.y}" r="${R}" fill="none" stroke="${ring}" stroke-width="${on?3.5:multi?2.5:1.5}"/>${label}</g>`;
  }).join('');
  const names=LINES.map(l=>`<text class="ln-name" x="${l.lx}" y="${l.ly}" text-anchor="middle" fill="${l.color}">${l.name}</text>`).join('');
  return `<svg id="mapSvg" viewBox="${mapMode==='all'?WHOLE.join(' '):viewFor().join(' ')}" role="img" aria-label="群岛图"><defs><clipPath id="isleClip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>${edgesSvg}${hits}${names}${nodes}</svg>`;
}
function viewFor(){
  let x,y;
  if(sel.type==='edge'){const[a,b]=sel.id.split('>');x=(st(a).x+st(b).x)/2;y=(st(a).y+st(b).y)/2}
  else{const n=st(sel.id)||st(clips[idx]?.st||'film');x=n.x;y=n.y}
  return [x-180,y-125,360,250];
}
function animateView(){
  if(mapMode==='all')return;
  const svg=$('mapSvg');if(!svg)return;
  const to=viewFor(),from=(vb||to).slice(),t0=performance.now();
  cancelAnimationFrame(vbRaf);
  const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const step=t=>{
    const k=reduce?1:Math.min(1,(t-t0)/320),e=1-Math.pow(1-k,3);
    const v=from.map((f,i)=>f+(to[i]-f)*e);
    svg.setAttribute('viewBox',v.join(' '));
    if(k<1)vbRaf=requestAnimationFrame(step);else vb=to;
  };
  vbRaf=requestAnimationFrame(step);
}
function detailHTML(){
  if(sel.type==='edge'){
    const e=edges.find(x=>edgeKey(x)===sel.id);if(!e)return '';
    const a=st(e.from).name,b=st(e.to).name;
    const state=e.cut?'这条航线已剪掉。两座岛都还在。':e.type==='试运营'?'AI 在试这条航线。不喜欢就剪掉，喜欢就转正。':`${e.type}关系。权重 ${e.w.toFixed(1)}，看完会增加，马上划走会减少。`;
    return `<div class="detail"><div class="edge">${esc(a)} → ${esc(b)}</div><p class="dim">${esc(state)}</p><div class="btns">${e.cut?`<button class="btn prime" data-act="edge-res">恢复这条航线</button>`:`<button class="btn warn" data-act="edge-cut">剪掉这条航线</button>`}${e.type==='试运营'&&!e.cut?`<button class="btn" data-act="edge-keep">转正</button>`:''}</div></div>`;
  }
  const n=st(sel.id);if(!n)return '';
  const rel=edges.filter(e=>e.from===n.id&&!e.cut).map(e=>st(e.to).name);
  const lines=linesAt(n.id).map(l=>l.name).join('、')||'你加的岛';
  const here=clips[idx]?.st===n.id;
  return `<div class="detail"><div class="edge">${esc(n.name)}</div>${ruleHTML(n,true)}<p class="dim">${esc(lines)}${rel.length?` · 接下来可去：${esc(rel.join('、'))}`:''}</p><div class="btns">${n.paused?`<button class="btn prime" data-act="resume">恢复这座岛</button>`:`<button class="btn" data-act="pause">暂停这座岛</button>`}${!here&&!n.paused&&!moment?`<button class="btn" data-act="jump">去这座岛看</button>`:''}</div></div>`;
}

/* sheet */
function renderSheet(){
  document.querySelectorAll('.tabs .t').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
  const b=$('pbody');
  if(tab==='moment')b.innerHTML=momentHTML();
  if(tab==='map'){
    const wasScroll=b.querySelector('.mapbox')?.scrollLeft;
    b.innerHTML=`<div class="mapbar"><p class="dim">点小岛改规则，点航线改这一条</p><div class="seg"><button data-act="mode" data-m="near" aria-pressed="${mapMode==='near'}">附近</button><button data-act="mode" data-m="all" aria-pressed="${mapMode==='all'}">全图</button></div></div><div class="mapbox ${mapMode==='all'?'all':''}" id="mapbox">${mapSVG()}</div>${detailHTML()}`;
    if(mapMode==='all'&&wasScroll!=null&&$('mapbox'))$('mapbox').scrollLeft=wasScroll;
  }
  if(tab==='set'&&setPage==='taste'){
    const g=(arr,no)=>arr.length?arr.map(t=>`<span class="tag ${no?'no':''}">${esc(t.tag)}<button data-act="untaste" data-tag="${esc(t.tag)}" aria-label="删除 ${esc(t.tag)}">×</button></span>`).join(''):'<span class="dim">还没有</span>';
    b.innerHTML=backBar('口味')+`<p class="dim">开专场和日常选片都按这里排序。专场里的观看不会写到这里，除非你在结束时同意。</p><div><p class="dim" style="margin-bottom:6px">喜欢</p><div class="tags">${g(tastes.filter(t=>t.like))}</div></div><div><p class="dim" style="margin-bottom:6px">避开（专场也不例外）</p><div class="tags">${g(tastes.filter(t=>!t.like),true)}</div></div>`;
  }
  if(tab==='set'&&setPage==='log')b.innerHTML=backBar('改动记录')+`<ul class="log">${logs.slice().reverse().map(l=>`<li>${esc(l.text)}<small>${esc(l.from)}</small></li>`).join('')}</ul>`;
  if(tab==='set'&&!['taste','log'].includes(setPage))b.innerHTML=settingsHTML();
  /* the "say a sentence" bar belongs to moment, map and taste; plain settings don't need it */
  $('sheet').querySelector('.ai').hidden=tab==='set'&&setPage!=='taste';
  renderSugs();
}
function momentHTML(){
  if(!moment)return `<h2>现在想看什么？看到几点？</h2><p class="dim">说一句就开专场。它只放这一类，并按你的长期口味挑；到点结束，也不会影响之后的日常推荐。</p>`;
  const m=moment,chips=(a,k,no)=>a.map(x=>`<span class="tag ${no?'no':''}">${esc(x)}<button data-act="m-drop" data-k="${k}" data-v="${esc(x)}" aria-label="去掉 ${esc(x)}">×</button></span>`).join('')||'<span class="dim">无</span>';
  return `<h2>${esc(m.topic)}专场</h2><p class="dim">${m.until?`到 ${hhmm(m.until)} 结束`:'直到你退出'} · 已看 ${momentCount()} 条 · 待播 ${m.items.length} 条</p><div><p class="dim" style="margin-bottom:6px">按这些口味挑</p><div class="tags">${chips(m.tastes,'tastes')}</div></div><div><p class="dim" style="margin-bottom:6px">避开</p><div class="tags">${chips(m.avoids,'avoids',true)}</div></div><div class="btns"><button class="btn" data-act="m-end">提前结束</button><button class="btn" data-act="m-ff">快进到点（原型测试）</button></div>`;
}
function renderSugs(){
  const cur=st(clips[idx]?.st)||st('film'),prev=clips[idx]?.hop?.from?st(clips[idx].hop.from):null;
  let list;
  if(tab==='set'&&setPage!=='taste')list=[];
  else if(tab==='moment')list=moment?['再看半小时','再看 15 分钟']:['今晚只看老电影，刷到 11 点半','想看京都散步，看 20 分钟','现在只想看猫'];
  else if(tab==='set')list=['我不喜欢标题党','我喜欢安静的','别再推带货'];
  else list=[prev?`别从${prev.name}直接跳到${cur.name}`:'别从宠物直接跳到旅行','运动后接电影',`${cur.name}只在周末晚上看`,`暂停${cur.name}`];
  $('sugs').hidden=!list.length;$('sugs').innerHTML=list.map(x=>`<button type="button" data-act="say">${esc(x)}</button>`).join('');
}
function openSheet(t){
  clearTimeout(cardTimer);hideCard();
  tab=t;setPage=null;
  if(clips[idx]&&!clips[idx].moment&&sel.type==='st'&&t==='map')sel={type:'st',id:clips[idx].st};
  vb=viewFor();
  $('phone').classList.add('open');YTP.pause();
  renderSheet();
}
function closeSheet(){const was=$('phone').classList.contains('open');$('phone').classList.remove('open');if(was&&!overOpen&&started){YTP.play();wake()}$('reply').hidden=true;document.activeElement?.blur?.()}
function refresh(){if($('phone').classList.contains('open')){renderSheet();animateView()}}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2600)}


/* Settings: a short list; each row opens its own page so only one thing is on screen at a time. */
const backBar=t=>`<div class="back"><button data-act="set-page" data-p="" aria-label="返回设置">‹ 设置</button><h2>${esc(t)}</h2></div>`;
function settingsHTML(){
  const k=YTAPI.key(),s=AI.load(),p=AI_PROVIDERS[s.provider]||AI_PROVIDERS.none,opt=(v,t,on)=>`<option value="${esc(v)}" ${on?'selected':''}>${esc(t)}</option>`;
  if(setPage==='yt')return backBar('YouTube')+`<p class="dim">用你自己的 YouTube Data API Key 搜视频。只保存在这台手机上。</p>
<div class="setting"><input id="ytKey" autocomplete="off" placeholder="${k?'已设置，粘贴新的可替换':'粘贴 YouTube Data API Key'}" aria-label="YouTube API Key"><div class="btns"><button class="btn prime" data-act="save-yt">保存</button></div></div>
<p class="dim">今天估算已用配额 ${YTAPI.units()} / 10000 单位，每次搜索 100 单位。</p>`;
  if(setPage==='region')return backBar('内容地区')+`<p class="dim">选一个国家，就只找那里的本地内容；选全世界则不限。开了 AI 时，搜索词会用当地语言写，标题会翻译成中文。</p><div class="group">${REGIONS.map(r=>`<button class="row" data-act="region" data-r="${r.id}"><span class="rt">${r.name}</span><span class="rv">${r.en||''}</span><span class="rc">${r.id===region().id?'✓':''}</span></button>`).join('')}</div>`;
  if(setPage==='ai'){
    const compat=s.provider==='compat',preset=AI_PRESETS.find(x=>x.id===s.preset)||AI_PRESETS[0];
    return backBar('AI')+`<p class="dim">AI 替你写搜索词、筛视频、听懂你说的话。Key 只发给你选的这一家。</p>
<div class="setting"><select id="aiProv" aria-label="AI 服务">${Object.entries(AI_PROVIDERS).map(([v,x])=>opt(v,x.name,v===s.provider)).join('')}</select>
${compat?`<select id="aiPreset" aria-label="服务">${AI_PRESETS.map(x=>opt(x.id,x.name,x.id===preset.id)).join('')}</select><input id="aiBase" autocomplete="off" placeholder="接口地址，例如 https://api.deepseek.com" value="${esc(s.base||preset.base)}" aria-label="接口地址">`:''}
${s.provider!=='none'?`<input id="aiKey" type="password" autocomplete="off" placeholder="${s.key?'已设置，粘贴新的可替换':compat?'API Key（本机模型可不填）':'API Key'}" aria-label="AI API Key"><input id="aiModel" list="aiModels" autocomplete="off" placeholder="模型名，可点“获取模型列表”" value="${esc(s.model||p.model||'')}" aria-label="模型"><datalist id="aiModels"></datalist>
<div class="btns"><button class="btn" data-act="ai-models">获取模型列表</button><button class="btn prime" data-act="ai-save">保存并测试</button></div>`:''}</div>
<p class="dim" id="aiStatus">现在：${esc(AI.label())}</p>`;
  }
  const likes=tastes.filter(t=>t.like).length,avoids=tastes.length-likes;
  const row=(pg,icon,title,val)=>`<button class="row" data-act="set-page" data-p="${pg}"><span class="ri">${icon}</span><span class="rt">${title}</span><span class="rv">${esc(val)}</span><span class="rc">›</span></button>`;
  const rates=SPEEDS.map(r=>`<button data-act="speed" data-r="${r}" aria-pressed="${r===speed}">${r}×</button>`).join('');
  return `<div class="group"><p class="gl">播放</p><div class="row static"><span class="ri">${ICON.speed}</span><span class="rt">速度</span></div><div class="seg wide">${rates}</div></div>
<div class="group"><p class="gl">推荐</p>${row('region',ICON.globe,'内容地区',region().name)}${row('taste',ICON.taste,'口味',`喜欢 ${likes} · 避开 ${avoids}`)}${row('log',ICON.log,'改动记录',`${logs.length} 条`)}</div>
<div class="group"><p class="gl">连接</p>${row('ai',ICON.ai,'AI',AI.ready()?AI.label():'未连接')}${row('yt',ICON.yt,'YouTube',k?`已设置 · 今日 ${YTAPI.units()} 单位`:'未设置')}</div>
<div class="group"><button class="row danger" data-act="reset"><span class="rt">恢复示例群岛</span></button></div>`;
}
const ICON={
  speed:'<svg viewBox="0 0 24 24"><path d="M4.500 16a7.500 7.500 0 1 1 15 0"/><path d="M12 16l4-5"/></svg>',
  taste:'<svg viewBox="0 0 24 24"><path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.600C19.500 15.400 12 20 12 20z"/></svg>',
  globe:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c2.500 2.600 2.500 14.400 0 17M12 3.500c-2.500 2.600-2.500 14.400 0 17"/></svg>',
  log:'<svg viewBox="0 0 24 24"><path d="M6 5h12M6 10h12M6 15h8M6 20h5"/></svg>',
  ai:'<svg viewBox="0 0 24 24"><path d="M12 3l1.800 4.700L18.500 9.500l-4.700 1.800L12 16l-1.800-4.700L5.500 9.500l4.700-1.800z"/><path d="M18 15l.8 2.200L21 18l-2.200.8L18 21l-.8-2.200L15 18l2.200-.8z"/></svg>',
  yt:'<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="3.500"/><path d="M10.500 9.500l4 2.500-4 2.500z"/></svg>',
};
function aiForm(){
  const s=AI.load(),v=id=>$(id)?.value.trim();
  if(v('aiKey'))s.key=v('aiKey');
  if($('aiModel'))s.model=v('aiModel');
  if($('aiBase'))s.base=v('aiBase');
  return s;
}

/* changing things: everything goes through here so it can be undone and is logged */
function snapshot(){return JSON.stringify({stations,edges,tastes,logs})}
function restore(raw){const d=JSON.parse(raw);stations=d.stations;edges=d.edges;tastes=d.tastes;logs=d.logs;save()}
function mutate(fn,text,from){undoStack.push(snapshot());fn();logs.push({text,from});emptyStations.clear();save()}
function showReply(text,withUndo,btns){
  $('replyText').textContent=text;$('reply').hidden=false;$('undoBtn').hidden=!withUndo||!undoStack.length;$('replyBtns').innerHTML=btns||'';$('replyBtns').hidden=!btns;
}
function addStation(name,after,from){
  const base=st(after)||stations[0],cnt=stations.filter(x=>x.custom).length,id='n'+Date.now().toString(36);
  const n=s(id,name,base.x+40+cnt*34,base.y+70+cnt*46,'b',0,0,{custom:true,icon:FALLBACK_ICON});
  mutate(()=>{stations.push(n);edges.push({from:base.id,to:id,line:null,type:'你加的',w:1.2,cut:false})},`新增小岛 ${name}`,from);
  return n;
}
function applyAction(a,from){
  const sid=x=>st(x)?x:(stations.find(n=>n.name===x)||{}).id;
  if(a.type==='set_station'){
    const id=sid(a.station);if(!id)return null;
    const n=st(id),parts=[];
    const when=WHENS.includes(a.when)?a.when:null;
    const hasCap=a.cap===null||(a.cap&&['day','week','month'].includes(a.cap.k)&&Number.isFinite(+a.cap.n)&&+a.cap.n>0);
    mutate(()=>{
      if(when){n.when=when;parts.push(when)}
      if(hasCap&&a.cap!==undefined){n.cap=a.cap?{k:a.cap.k,n:Math.round(+a.cap.n)}:null;parts.push(capText(n.cap))}
      if(typeof a.paused==='boolean'){n.paused=a.paused;parts.push(a.paused?'暂停':'恢复')}
    },`${n.name}：已修改`,from);
    if(!parts.length){undoStack.pop();logs.pop();return null}
    logs[logs.length-1].text=`${n.name}：${parts.join('，')}`;
    sel={type:'st',id};tab='map';
    return logs[logs.length-1].text;
  }
  if(a.type==='cut_edge'||a.type==='add_edge'){
    const f=sid(a.from),t=sid(a.to);if(!f||!t||f===t)return null;
    const fn=st(f).name,tn=st(t).name;let e=edges.find(x=>x.from===f&&x.to===t);
    if(a.type==='cut_edge'){
      if(!e){mutate(()=>edges.push({from:f,to:t,line:null,type:'你加的',w:0,cut:true}),`已剪掉 ${fn} → ${tn}`,from);e=edges.at(-1)}
      else mutate(()=>{e.cut=true},`已剪掉 ${fn} → ${tn}`,from);
      sel={type:'edge',id:edgeKey(e)};tab='map';
      return `${fn} → ${tn} 这条航线剪掉了，两座岛都还在`;
    }
    if(e)mutate(()=>{e.cut=false;e.w=Math.max(e.w,1)},`已恢复 ${fn} → ${tn}`,from);
    else{mutate(()=>edges.push({from:f,to:t,line:null,type:'你加的',w:1.2,cut:false}),`新增 ${fn} → ${tn}`,from);e=edges.at(-1)}
    sel={type:'edge',id:edgeKey(e)};tab='map';
    return `以后 ${fn} 之后可以接 ${tn}`;
  }
  if(a.type==='add_taste'&&a.tag){
    const tag=String(a.tag).slice(0,20),like=a.like!==false;
    mutate(()=>{tastes=tastes.filter(t=>t.tag!==tag);tastes.push({tag,like})},`口味：${like?'喜欢':'避开'} ${tag}`,from);
    tab='set';setPage='taste';return `已记下：${like?'喜欢':'避开'}“${tag}”，所有主题都生效`;
  }
  if(a.type==='add_station'&&a.name){
    const n=addStation(String(a.name).slice(0,12),st(a.after)?a.after:clips[idx]?.st||'film',from);
    sel={type:'st',id:n.id};tab='map';
    return `已新增小岛「${n.name}」`;
  }
  if(a.type==='remove_taste'&&a.tag){
    const tag=String(a.tag);if(!tastes.some(t=>t.tag===tag))return null;
    mutate(()=>{tastes=tastes.filter(t=>t.tag!==tag)},`口味：删除 ${tag}`,from);
    tab='set';setPage='taste';return `已删除“${tag}”`;
  }
  return null;
}
function normUntil(a){
  if(!a)return null;
  const m=String(a).match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;
  return futureAt(+m[1],+m[2]);
}
function futureAt(h,min){
  const now=new Date();
  const at=(hh,day)=>{const d=new Date(now);d.setDate(d.getDate()+day);d.setHours(hh,min,0,0);return d};
  if(h<24&&at(h,0)>now&&(h>=12||at(h+12,0)<=now||h>=now.getHours()&&now.getHours()<12))return at(h,0);
  if(h<12&&at(h+12,0)>now)return at(h+12,0);
  return at(h%24,1);
}
function parseUntilText(text){
  const cn={一:1,两:2,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12};
  let m;
  if((m=text.match(/(\d+)\s*分钟/)))return new Date(Date.now()+m[1]*60000);
  if(/半小时|半个小时/.test(text))return new Date(Date.now()+30*60000);
  if((m=text.match(/([一两二三四五\d])个?小时/)))return new Date(Date.now()+(cn[m[1]]||+m[1])*3600000);
  if((m=text.match(/(十[一二]?|[一两二三四五六七八九]|\d{1,2})\s*点\s*(半|\d{1,2}分?)?/))){
    const h=cn[m[1]]??+m[1],min=m[2]==='半'?30:m[2]?parseInt(m[2]):0;
    return futureAt(h,min);
  }
  return null;
}

function aiContext(){
  const now=new Date();
  return {now:`${hhmm(now)} 星期${'日一二三四五六'[now.getDay()]}`,current_station:clips[idx]?.st,in_moment:moment?{topic:moment.topic,until:moment.until&&hhmm(moment.until)}:null,
    stations:stations.map(n=>({id:n.id,name:n.name,when:n.when,cap:n.cap,paused:n.paused})),
    edges:edges.map(e=>({from:e.from,to:e.to,type:e.type,cut:e.cut})),tastes};
}
async function runActions(out,text){
  const from=`你说“${text}”`;
  const actions=Array.isArray(out&&out.actions)?out.actions:[];
  const done=[];
  for(const a of actions){
    if(!a||typeof a!=='object')continue;
    if(a.type==='start_moment'&&a.topic){
      const until=a.until instanceof Date?a.until:normUntil(a.until);
      await startMoment({topic:String(a.topic).slice(0,16),until,tastes:(a.tastes||[]).map(String),avoids:(a.avoids||[]).map(String)});
      return;
    }
    if(a.type==='adjust_moment'&&moment){
      const u=a.until instanceof Date?a.until:normUntil(a.until);if(u)moment.until=u;
      if(Array.isArray(a.avoids))moment.avoids=a.avoids.map(String);
      tab='moment';updatePill();done.push(u?`专场延长到 ${hhmm(u)}`:'专场已调整');continue;
    }
    const r=applyAction(a,from);if(r)done.push(r);
  }
  if($('phone').classList.contains('open')){renderSheet();animateView()}
  showReply(done.join('；')||(out&&out.reply?String(out.reply):'我还没听懂这句。'),done.length>0);
}
async function say(text){
  text=text.trim();if(!text||busy)return;
  $('askInput').value='';busy=true;$('askBtn').disabled=true;
  showReply('正在处理…',false);
  try{await runActions(await interpret(text,aiContext()),text)}
  catch(e){showReply('这句没有处理成功，再说一次试试。',false)}
  finally{busy=false;$('askBtn').disabled=false}
}
function cyc(kind){
  const n=st(sel.id);
  mutate(()=>{
    if(kind==='when')n.when=WHENS[(WHENS.indexOf(n.when)+1)%WHENS.length];
    else{const i=CAPS.findIndex(c=>JSON.stringify(c)===JSON.stringify(n.cap));n.cap=CAPS[(i+1)%CAPS.length]}
  },`${n.name}：${kind==='when'?'时段':'数量'}已改`,'你手动修改');
  logs[logs.length-1].text=`${n.name}：${n.when}，${capText(n.cap)}`;save();
  renderSheet();showReply(logs[logs.length-1].text,true);
}

/* first run */
function askKey(problem){
  over(`<h2>连接 YouTube</h2>${problem?`<p>${esc(problem)}</p>`:'<p>就是小屿用你自己的 YouTube Data API Key 搜视频。Key 只保存在这台手机上。</p>'}<ol><li>打开 <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">Google Cloud 控制台</a>，启用 YouTube Data API v3。</li><li>在“凭据”里创建 API 密钥。</li><li>粘贴到下面。</li></ol><input id="keyInput" autocomplete="off" placeholder="粘贴 API Key" aria-label="YouTube API Key"><div class="btns"><button class="btn prime" data-act="save-key">保存并开始</button></div>`);
}
async function prepareFirst(){
  try{
    const c=await nextDaily();
    if(!c){toast('现在没有符合规则的小岛');return}
    clips.push(c);idx=0;sel={type:'st',id:c.st};
    over(`<h2>${esc(st(c.st).name)}</h2><p>第一条准备好了。视频可能带有 YouTube 自己的片头广告。</p><div class="btns"><button class="btn prime" data-act="begin">开始</button></div>`);
  }catch(e){}
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');
  if(!b){
    if(e.target.closest('#card')){
      if(clips[idx]?.moment)openSheet('moment');else openSheet('map');
    }
    return;
  }
  const a=b.dataset.act;
  if(a==='close')closeSheet();
  else if(a==='turn')turn();
  else if(a==='unmute'){YTP.sound();$('sound').hidden=true}
  else if(a==='begin'){
    closeOver(false);started=true;YTP.wantSound=true;YTP.held=false;
    showClip();const c=clips[idx];if(c.hop&&c.hop.transfer)transferCard(c);
    try{if(!localStorage.getItem('xiaoyu.hint')){localStorage.setItem('xiaoyu.hint','1');setTimeout(()=>toast('双击左右跳 10 秒 · 长按左侧快退、右侧 2 倍速 · 长按中间打开群岛图'),6000)}}catch(err){}
  }
  else if(a==='save-key'){
    const k=$('keyInput').value.trim();if(!k)return;
    YTAPI.setKey(k);closeOver(false);
    if(!clips.length)prepareFirst();else if(started)YTP.play();
  }
  else if(a==='change-key')askKey();
  else if(a==='save-yt'){const k=$('ytKey').value.trim();if(!k)return;YTAPI.setKey(k);pools={};savePools();renderSheet();toast('YouTube Key 已保存')}
  else if(a==='set-page'){setPage=b.dataset.p||null;$('reply').hidden=true;renderSheet();$('pbody').scrollTop=0}
  else if(a==='speed'){setSpeed(+b.dataset.r,true);if($('phone').classList.contains('open'))renderSheet();closePop()}
  else if(a==='speed-pop')openPop();
  else if(a==='ai-models'){
    const s=aiForm();$('aiStatus').textContent='正在获取模型列表…';
    AI.models(s).then(ms=>{$('aiModels').innerHTML=ms.map(m=>`<option value="${esc(m)}">`).join('');$('aiStatus').textContent=`找到 ${ms.length} 个模型，点模型框选择`}).catch(err=>{$('aiStatus').textContent=`获取失败：${err.message}`});
  }
  else if(a==='ai-save'){
    const s=aiForm();AI.save(s);$('aiStatus').textContent='正在测试…';
    AI.json('只回复这个 JSON，不要别的：{"ok":true}',s).then(d=>{$('aiStatus').textContent=d.ok?`连接成功：${AI.label()}`:'连上了，但回复格式不对，换一个模型试试';pools={};savePools()}).catch(err=>{$('aiStatus').textContent=`连接失败：${err.message}`});
  }
  else if(a==='reset'){
    try{localStorage.removeItem('xiaoyu.v3.state');localStorage.removeItem('xiaoyu.v3.pools')}catch(err){}
    location.reload();
  }
  else if(a==='tab'){
    if($('phone').classList.contains('open')){tab=b.dataset.tab;setPage=null;$('reply').hidden=true;renderSheet()}
    else openSheet(b.dataset.tab);
  }
  else if(a==='like'){
    const c=clips[idx];if(!c)return;
    if(liked[c.video.id])delete liked[c.video.id];else{liked[c.video.id]=Date.now();toast('已收藏。不会因此多推')}
    $('like').classList.toggle('on',!!liked[c.video.id]);save();
  }
  else if(a==='st'){sel={type:'st',id:b.dataset.id};renderSheet();animateView()}
  else if(a==='edge'){sel={type:'edge',id:b.dataset.id};renderSheet();animateView()}
  else if(a==='mode'){mapMode=b.dataset.m;vb=viewFor();renderSheet();if(mapMode==='all'&&$('mapbox')){const n=st(clips[idx]?.st)||st('film'),box=$('mapbox');box.scrollLeft=n.x-WHOLE[0]-box.clientWidth/2;box.scrollTop=n.y-WHOLE[1]-box.clientHeight/2}}
  else if(a==='cyc-when')cyc('when');
  else if(a==='cyc-cap')cyc('cap');
  else if(a==='pause'||a==='resume'){const r=applyAction({type:'set_station',station:sel.id,paused:a==='pause'},'你手动修改');renderSheet();showReply(r,true)}
  else if(a==='jump')jumpTo(sel.id);
  else if(a==='hop'){jumpTo(b.dataset.id)}
  else if(a==='cc')setCC(!YTP.cc);
  else if(a==='region'){try{localStorage.setItem('xiaoyu.region',b.dataset.r)}catch(err){}pools={};savePools();renderSheet();toast(`内容地区：${region().name}。下一条起生效`)}
});
function jumpTo(id){
    const from=clips[idx]?.st,l=linesAt(id)[0]?.id||clips[idx]?.line||'home';
    if(!st(id)||id===from||moment)return;
    closeSheet();
    (async()=>{
      try{
        const v=await nextFromStation(id);
        if(!v){toast('这座岛暂时没有合适的视频');return}
        feedback();clips=clips.slice(0,idx+1);
        clips.push(makeClip(id,l,{from,to:id,type:'手动',why:'你选的',transfer:true,toLine:l},v));
        idx++;showClip();transferCard(clips[idx]);
      }catch(err){}
    })();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const a=b.dataset.act;
  if(a==='edge-cut'||a==='edge-res'||a==='edge-keep'){
    const ed=edges.find(x=>edgeKey(x)===sel.id),t=`${st(ed.from).name} → ${st(ed.to).name}`;
    mutate(()=>{if(a==='edge-cut')ed.cut=true;if(a==='edge-res')ed.cut=false;if(a==='edge-keep'){ed.type='相近';ed.w=1}},`${a==='edge-cut'?'已剪掉':a==='edge-res'?'已恢复':'已转正'} ${t}`,'你手动修改');
    renderSheet();showReply(logs[logs.length-1].text,true);
  }
  else if(a==='untaste'){applyAction({type:'remove_taste',tag:b.dataset.tag},'你手动修改');renderSheet();showReply('已删除',true)}
  else if(a==='m-drop'){const k=b.dataset.k;moment[k]=moment[k].filter(x=>x!==b.dataset.v);renderSheet()}
  else if(a==='m-end'){closeSheet();finishMoment()}
  else if(a==='m-ff'){moment.until=new Date(Date.now()-1000);closeSheet();updatePill()}
  else if(a==='more15'){moment.until=new Date(Date.now()+15*60000);closeOver();updatePill();toast(`再看 15 分钟，到 ${hhmm(moment.until)}`)}
  else if(a==='finish')finishMoment();
  else if(a==='widen'){
    moment.query=moment.topic+' 推荐';moment.next=null;moment.exhausted=false;
    closeOver();go(1);
  }
  else if(a==='keep'){
    const t=moment.candidate;
    mutate(()=>tastes.push({tag:t,like:true}),`口味：喜欢 ${t}`,'专场结束时你确认记下');
    leaveMoment(`已记下“${t}”。日常航线没有变化。`);
  }
  else if(a==='skip')leaveMoment('没有记录。口味和日常航线都没有变化。');
  else if(a==='undo'){const r=undoStack.pop();if(r){restore(r);emptyStations.clear();if($('phone').classList.contains('open')){renderSheet();animateView()}showReply('已撤销。',undoStack.length>0)}}
  else if(a==='say')say(b.textContent);
});
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.key==='ArrowDown'){e.preventDefault();go(1)}
  if(e.key==='ArrowUp'){e.preventDefault();go(-1)}
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seekBy(e.key==='ArrowLeft'?-1:1)}
  if(e.key==='Escape')closeSheet();
  if((e.key==='Enter'||e.key===' ')&&e.target.classList?.contains('tok')){e.preventDefault();e.target.click()}
});
$('ask').addEventListener('submit',e=>{e.preventDefault();say($('askInput').value)});
$('scrim').addEventListener('click',closeSheet);
document.addEventListener('change',e=>{
  if(e.target.id==='aiProv'){const s=aiForm();s.provider=e.target.value;s.model=(AI_PROVIDERS[s.provider]||{}).model||'';s.key='';AI.save(s);renderSheet()}
  if(e.target.id==='aiPreset'){const s=aiForm();s.preset=e.target.value;s.base='';s.model='';AI.save(s);renderSheet()}
});

/* Picture first: buttons and captions show for 5 s with each video, then leave; a tap brings them back.
   Gestures replace buttons: swipe up/down changes video, double-tap left/right seeks 10 s,
   long-press left keeps rewinding until release; long-press right plays at 2x until release, and sliding down while
   holding keeps 2x after release; long-press in the middle opens the island map. */
const CALM_MS=5000,SEEK_S=10,HOLD_STEP_S=2.5,HOLD_EVERY_MS=250,FAST=2,LOCK_DY=50;
/* speed: the chosen speed stays for every following video until changed (rail button, settings, or the lock gesture) */
const SPEEDS=[0.5,0.75,1,1.25,1.5,2];
let speed=(()=>{try{const v=+localStorage.getItem('xiaoyu.speed');return SPEEDS.includes(v)?v:1}catch(e){return 1}})();
function setSpeed(r,keep){
  if(keep){speed=r;try{localStorage.setItem('xiaoyu.speed',String(r))}catch(e){}}
  YTP.rate(r);$('speedLabel').textContent=`${speed}×`;$('speedBtn').classList.toggle('on',speed!==1);
}
/* captions: Simplified Chinese, from a Chinese track or YouTube's own translation of another one */
function setCC(on){
  YTP.setCC(on);$('ccBtn').classList.toggle('on',on);
  try{localStorage.setItem('xiaoyu.cc',on?'1':'')}catch(e){}
  toast(on?'字幕：简体中文':'字幕已关');
}
function openPop(){
  $('pop').innerHTML=`<p class="dim">播放速度</p>`+SPEEDS.map(r=>`<button data-act="speed" data-r="${r}" aria-pressed="${r===speed}">${r===1?'正常':r+'×'}</button>`).join('');
  $('pop').hidden=false;$('popScrim').hidden=false;clearTimeout(wake.t);
}
function closePop(){if($('pop').hidden)return;$('pop').hidden=true;$('popScrim').hidden=true;wake()}
function wake(){
  const ph=$('phone');ph.classList.remove('calm');clearTimeout(wake.t);
  wake.t=setTimeout(function rest(){if(YTP.held&&started&&!overOpen){wake.t=setTimeout(rest,CALM_MS);return}ph.classList.add('calm')},CALM_MS);
}
function seekBy(side){
  YTP.seek(side*SEEK_S);
  const el=$('seek');el.textContent=side<0?`« ${SEEK_S} 秒`:`${SEEK_S} 秒 »`;el.className='seek show '+(side<0?'l':'r');
  clearTimeout(seekBy.t);seekBy.t=setTimeout(()=>el.className='seek',600);
}
/* Landscape: real fullscreen + orientation lock where the browser allows it (Android, desktop);
   otherwise (iPhone Safari has no element fullscreen) rotate the frame with CSS. */
async function turn(){
  const ph=$('phone');
  if(ph.classList.contains('rot')){ph.classList.remove('rot');return}
  if(document.fullscreenElement){try{screen.orientation?.unlock?.()}catch(e){}document.exitFullscreen?.();return}
  if(innerWidth>innerHeight&&!ph.requestFullscreen){toast('已经是横屏');return}
  if(ph.requestFullscreen){
    try{
      await ph.requestFullscreen({navigationUI:'hide'});
      try{await screen.orientation.lock('landscape')}catch(e){}
      if(innerWidth>=innerHeight||screen.orientation?.type?.startsWith('landscape'))return;
      await document.exitFullscreen();
    }catch(e){}
  }
  ph.classList.add('rot');
}
/* pointer position in the frame's own coordinates, so gestures still read right while it is rotated */
function local(e){
  const r=$('phone').getBoundingClientRect();
  return $('phone').classList.contains('rot')?{x:e.clientY-r.top,y:r.right-e.clientX,w:r.height}:{x:e.clientX-r.left,y:e.clientY-r.top,w:r.width};
}
/* YouTube can't play backwards, so holding the left side seeks back 2.5 s every 250 ms instead */
let hold=null;
function startHold(side,y){
  const el=$('seek');
  hold={side,y,locked:false,t:0};
  if(side<0){el.textContent='« 快退';YTP.seek(-HOLD_STEP_S);hold.t=setInterval(()=>YTP.seek(-HOLD_STEP_S),HOLD_EVERY_MS)}
  else{el.textContent=`${FAST}× 快进 · 下滑锁定`;YTP.rate(FAST)}
  el.className='seek show '+(side<0?'l':'r');
}
function endHold(){
  if(!hold)return false;
  clearInterval(hold.t);
  if(hold.side>0){if(hold.locked){setSpeed(FAST,true);toast(`已锁定 ${FAST}×，点右侧速度按钮可改回`)}else YTP.rate(speed)}
  hold=null;$('seek').className='seek';return true;
}
const touch=$('touch');let t0=null,press=0,tapT=0,lastTap=null,seekUntil=0;
touch.addEventListener('contextmenu',e=>e.preventDefault());
touch.addEventListener('pointerdown',e=>{
  t0=local(e);clearTimeout(press);
  press=setTimeout(()=>{
    const side=t0.x<t0.w/3?-1:t0.x>t0.w*2/3?1:0,y=t0.y;t0=null;clearTimeout(tapT);lastTap=null;
    if(!started||overOpen)return;
    if(side)startHold(side,y);else openSheet('map');
  },450);
});
touch.addEventListener('pointermove',e=>{
  if(hold&&hold.side>0&&!hold.locked&&local(e).y-hold.y>LOCK_DY){hold.locked=true;$('seek').textContent=`已锁定 ${FAST}×`;navigator.vibrate?.(15)}
  if(!t0)return;const p=local(e);if(Math.abs(p.x-t0.x)>10||Math.abs(p.y-t0.y)>10)clearTimeout(press)});
touch.addEventListener('pointercancel',()=>{t0=null;clearTimeout(press);endHold()});
touch.addEventListener('pointerup',e=>{
  clearTimeout(press);
  if(endHold()){wake();return}
  if(!t0)return;
  const p=local(e),dy=p.y-t0.y,dx=p.x-t0.x;t0=null;
  if(Math.abs(dy)>48&&Math.abs(dy)>Math.abs(dx)){go(dy<0?1:-1);return}
  if(Math.abs(dy)>=10||Math.abs(dx)>=10||!started)return;
  const side=p.x<p.w/3?-1:p.x>p.w*2/3?1:0,now=Date.now();
  /* after a double-tap seek, each further tap on that side seeks again, like the phone players */
  if(side&&now<seekUntil&&lastTap?.side===side){seekBy(side);seekUntil=now+700;lastTap={side,at:now};return}
  if(lastTap&&now-lastTap.at<300&&lastTap.side===side){
    clearTimeout(tapT);lastTap=null;
    if(side){seekBy(side);seekUntil=now+700;lastTap={side,at:now}}
    return;
  }
  lastTap={side,at:now};clearTimeout(tapT);
  tapT=setTimeout(()=>{
    lastTap=null;
    const ph=$('phone');
    if(!YTP.wantSound){YTP.sound();$('sound').hidden=true}
    else if(!ph.classList.contains('calm'))YTP.toggle();
    wake();
  },280);
});
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)try{screen.orientation?.unlock?.()}catch(e){}});
setInterval(()=>{if(!$('phone').classList.contains('calm'))$('prog').firstElementChild.style.transform=`scaleX(${YTP.progress()})`},400);
let wheelAt=0;
$('phone').addEventListener('wheel',e=>{
  if(e.target.closest('.sheet,.over'))return;
  e.preventDefault();
  const t=Date.now();if(t-wheelAt<500||Math.abs(e.deltaY)<14)return;
  wheelAt=t;go(e.deltaY>0?1:-1);
},{passive:false});

setInterval(updatePill,1000);
load();
YTP.init({
  playing(){dropCover();if(!hold)YTP.rate(speed);if(YTP.cc)YTP.captions()},
  noCaptions(){toast('这条视频没有字幕')},
  ended(){if(!overOpen&&!$('phone').classList.contains('open'))go(1)},
  error(){if(started&&!overOpen)go(1)},
  muted(){$('sound').hidden=false;wake()},
  loadFailed(){toast('YouTube 播放器加载失败，请检查网络')},
});
renderSheet();setSpeed(speed);$('ccBtn').classList.toggle('on',YTP.cc);
$('popScrim').addEventListener('click',closePop);
if(YTAPI.key())prepareFirst();else askKey();
