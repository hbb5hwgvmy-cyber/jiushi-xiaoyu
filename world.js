/* Two worlds in one app. Day is the calm island sea; night (18+) is a neon harbour with its own islands,
   tastes, history, video pools and channel learning, kept under separate storage keys so neither world
   leaks into the other. Keys, speed, captions and the quota counter are shared. Switching reloads the app.
   Loaded in <head> so the night look is on before anything paints. */
const NIGHT=(()=>{try{return localStorage.getItem('xiaoyu.world')==='night'}catch(e){return false}})();
/* storage key for the current world: 'xiaoyu.v3.state' -> 'xiaoyu.night.v3.state' at night */
const SK=k=>NIGHT?k.replace(/^xiaoyu\./,'xiaoyu.night.'):k;
document.documentElement.dataset.world=NIGHT?'night':'day';
function nightFonts(){
  if(document.getElementById('nightFonts'))return;
  const l=document.createElement('link');l.id='nightFonts';l.rel='stylesheet';
  l.href='https://fonts.googleapis.com/css2?family=Bebas+Neue&family=ZCOOL+QingKe+HuangYou&display=swap';
  document.head.appendChild(l);
}
if(NIGHT){
  nightFonts();
  document.title='就是小屿 · 夜港';
  addEventListener('DOMContentLoaded',()=>document.querySelector('meta[name=theme-color]')?.setAttribute('content','#07030c'));
}

/* Night seed: same shape as the day sample in app.js (s(id,name,x,y,lab,when,cap,extra)), same map slots. */
const NIGHT_SEED={
  lines:[
    {id:'club',name:'舞厅区',color:'#ff2bd6',stops:['fancam','dance','sexy'],type:'相近',lx:200,ly:-14},
    {id:'shore',name:'夜游区',color:'#22f0ff',stops:['beach','fit'],type:'切换',lx:205,ly:318},
  ],
  stations:[
    ['fancam','直拍',60,70,'a',0,0,{en:'Fancam',icon:'theme-idol.svg'}],
    ['dance','跳舞',200,40,'a',0,0,{en:'Dance',icon:'theme-music.svg'}],
    ['sexy','性感',340,80,'a','仅晚上',0,{en:'Sexy dance',icon:'theme-bloom.svg'}],
    ['beach','海边',310,235,'b',0,0,{en:'Beach & Swimwear',icon:'theme-bay.svg'}],
    ['fit','健身',100,240,'b',0,{k:'day',n:10},{en:'Fitness',icon:'theme-fit.svg'}],
  ],
  extraEdges:[
    {from:'sexy',to:'beach',line:null,type:'相近',w:.8,cut:false},
    {from:'fit',to:'fancam',line:null,type:'切换',w:.8,cut:false},
  ],
  about:{fancam:'舞台和饭拍直拍，盯着一个人看',dance:'舞蹈翻跳、舞室和街头 freestyle',sexy:'性感风格的舞蹈和写真花絮',beach:'海边、泳装和度假 vlog',fit:'健身房和身材训练日常'},
  query:{
    fancam:[['直拍 饭拍 4K','zh'],['kpop fancam 4k','en'],['直撮り ステージ','ja']],
    dance:[['舞蹈 翻跳','zh'],['dance cover choreography','en'],['踊ってみた','ja']],
    sexy:[['性感 舞蹈','zh'],['sexy dance','en'],['セクシー ダンス','ja']],
    beach:[['海边 比基尼 vlog','zh'],['bikini beach vlog','en'],['水着 ビーチ vlog','ja']],
    fit:[['健身 女生 训练','zh'],['gym girl workout','en'],['筋トレ 女子','ja']],
  },
  tastes:[{tag:'舞台感',like:true},{tag:'高清',like:true},{tag:'一镜到底',like:true},{tag:'标题党',like:false},{tag:'带货',like:false}],
  sugs:{moment:['今晚只看韩团直拍，刷到 12 点','想看街舞 freestyle，看 20 分钟','现在只想看海边'],from:'别从性感直接跳到海边',after:'健身后接直拍'},
  logs:[{text:'这是夜港示例',from:'预置，不是你的真实偏好'}],
  /* what AI is told the night world is for */
  style:'这是成年用户的夜间模式：要性感、有身材感或舞台感的舞蹈、直拍、泳装和健身类内容，可以擦边，但必须是 YouTube 允许公开播放的，不要露骨色情。',
};

/* The gate: a full-screen moment between the worlds. Entering night asks for 18+; leaving is one tap. */
function worldGate(to){
  if(to==='night')nightFonts();
  const g=document.createElement('div');g.className='gate '+to;g.setAttribute('role','dialog');
  g.innerHTML=to==='night'
    ?`<div class="gneon"><div class="gen">AFTER<br>DARK</div><div class="gzh">夜港 已开灯</div></div>
<div class="gage"><p>这里的内容只给成年人看。<br>白天的岛、口味和记录不会带过来。</p>
<button class="gbtn" data-gate="go">我已满 18 岁，进入</button><button class="gbtn ghost" data-gate="no">回到白天</button></div>`
    :`<div class="gday"><div class="gsun"></div><h2>天亮了</h2><p>回到小屿。夜港的岛和记录会留在夜里。</p>
<button class="gbtn" data-gate="go">回到白天</button><button class="gbtn ghost" data-gate="no">再待一会儿</button></div>`;
  (document.getElementById('phone')||document.body).appendChild(g);
  requestAnimationFrame(()=>g.classList.add('on'));
  g.addEventListener('click',e=>{
    const b=e.target.closest('[data-gate]');if(!b)return;
    if(b.dataset.gate==='go'){
      try{localStorage.setItem('xiaoyu.world',to)}catch(err){}
      g.classList.add('leave');setTimeout(()=>location.reload(),to==='night'?700:400);
    }else{g.classList.remove('on');setTimeout(()=>g.remove(),300)}
  });
}
