/*
 * AI providers, called straight from the browser with the viewer's own key.
 *
 *   AI.ready()                    -> true when a provider and model are set
 *   AI.complete(prompt)           -> Promise<string>  (the model's text reply)
 *   AI.json(prompt)               -> Promise<object>  (first JSON object in the reply)
 *   AI.models()                   -> Promise<string[]> (model ids the key can use)
 *
 * Closed models have their own adapters (OpenAI, Anthropic, Google). Open and other models go through
 * the OpenAI-compatible adapter with a base URL (DeepSeek, Qwen, Kimi, GLM, OpenRouter, Groq, Ollama, ...).
 * Checked 2026-11-09: Kimi and GLM send no CORS headers, so a browser cannot call them without a relay.
 * Settings live in localStorage only; nothing is sent anywhere except the chosen provider.
 */
const AI_PRESETS=[
  {id:'deepseek',name:'DeepSeek',base:'https://api.deepseek.com'},
  {id:'qwen',name:'通义千问（阿里云百炼，国内）',base:'https://dashscope.aliyuncs.com/compatible-mode/v1'},
  {id:'qwen-intl',name:'Qwen（Alibaba Cloud，国际）',base:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'},
  {id:'kimi',name:'Kimi（Moonshot）· 网页暂不能直连',base:'https://api.moonshot.ai/v1'},
  {id:'glm',name:'智谱 GLM · 网页暂不能直连',base:'https://open.bigmodel.cn/api/paas/v4'},
  {id:'openrouter',name:'OpenRouter（Llama、Qwen、Mistral 等开源模型）',base:'https://openrouter.ai/api/v1'},
  {id:'groq',name:'Groq',base:'https://api.groq.com/openai/v1'},
  {id:'mistral',name:'Mistral',base:'https://api.mistral.ai/v1'},
  {id:'xai',name:'xAI Grok',base:'https://api.x.ai/v1'},
  {id:'ollama',name:'Ollama（本机开源模型，需设置 OLLAMA_ORIGINS=*）',base:'http://localhost:11434/v1'},
  {id:'lmstudio',name:'LM Studio（本机开源模型，需打开 CORS）',base:'http://localhost:1234/v1'},
  {id:'custom',name:'自定义地址',base:''},
];
const AI_PROVIDERS={
  none:{name:'不用 AI（只听固定说法）'},
  openai:{name:'OpenAI（GPT）',base:'https://api.openai.com/v1',needsKey:true},
  anthropic:{name:'Anthropic（Claude）',base:'https://api.anthropic.com/v1',needsKey:true,model:'claude-opus-5-5'},
  google:{name:'Google（Gemini）',base:'https://generativelanguage.googleapis.com/v1beta',needsKey:true},
  compat:{name:'开源与其他（OpenAI 兼容）',needsKey:false},
};
/* Claude models that take output_config.effort and the server-side refusal fallback. */
const CLAUDE_EFFORT=/^claude-(opus|sonnet|haiku|fable)-5/;
const CLAUDE_FALLBACK=/^claude-(opus-5-5|opus-5$|sonnet-5-5|fable-5-1)/;

const AI={
  load(){try{return Object.assign({provider:'none',key:'',model:'',preset:'deepseek',base:''},JSON.parse(localStorage.getItem('xiaoyu.ai')||'{}'))}catch(e){return {provider:'none',key:'',model:'',preset:'deepseek',base:''}}},
  save(s){try{localStorage.setItem('xiaoyu.ai',JSON.stringify(s))}catch(e){}},
  ready(){const s=AI.load(),p=AI_PROVIDERS[s.provider];return !!p&&s.provider!=='none'&&!!s.model&&(!p.needsKey||!!s.key)&&(s.provider!=='compat'||!!AI.base(s))},
  base(s){if(s.provider==='compat')return (s.base||(AI_PRESETS.find(x=>x.id===s.preset)||{}).base||'').replace(/\/+$/,'');return AI_PROVIDERS[s.provider].base},
  label(){const s=AI.load();if(!AI.ready())return '未连接';const p=s.provider==='compat'?(AI_PRESETS.find(x=>x.id===s.preset)||{}).name:AI_PROVIDERS[s.provider].name;return `${p} · ${s.model}`},

  async complete(prompt,s=AI.load()){
    const base=AI.base(s);
    if(s.provider==='anthropic'){
      const body={model:s.model,max_tokens:8000,messages:[{role:'user',content:prompt}]};
      const h=claudeHeaders(s.key);
      if(CLAUDE_EFFORT.test(s.model))body.output_config={effort:'low'};
      if(CLAUDE_FALLBACK.test(s.model)){body.fallbacks='default';h['anthropic-beta']='server-side-fallback-2026-07-01'}
      const d=await post(`${base}/messages`,h,body);
      if(d.stop_reason==='refusal')throw new Error('模型拒绝了这次请求');
      return (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    }
    if(s.provider==='google'){
      const d=await post(`${base}/models/${encodeURIComponent(s.model)}:generateContent`,{'x-goog-api-key':s.key},{contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}});
      return (d.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
    }
    const h=s.key?{Authorization:`Bearer ${s.key}`}:{};
    const d=await post(`${base}/chat/completions`,h,{model:s.model,messages:[{role:'user',content:prompt}]});
    return d.choices?.[0]?.message?.content||'';
  },
  async json(prompt,s){
    const t=await AI.complete(prompt,s),a=t.indexOf('{'),b=t.lastIndexOf('}');
    if(a<0||b<a)throw new Error('模型没有返回 JSON');
    return JSON.parse(t.slice(a,b+1));
  },
  async models(s=AI.load()){
    const base=AI.base(s);
    if(s.provider==='anthropic')return ((await get(`${base}/models?limit=100`,claudeHeaders(s.key))).data||[]).map(m=>m.id);
    if(s.provider==='google')return ((await get(`${base}/models?pageSize=200`,{'x-goog-api-key':s.key})).models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
    return ((await get(`${base}/models`,s.key?{Authorization:`Bearer ${s.key}`}:{})).data||[]).map(m=>m.id).sort();
  },
};
function claudeHeaders(key){return {'x-api-key':key,'anthropic-version':'2026-10-21','anthropic-dangerous-direct-browser-access':'true'}}
async function post(url,headers,body){return send(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)})}
async function get(url,headers){return send(url,{headers})}
async function send(url,init){
  let r;
  try{r=await fetch(url,init)}catch(e){throw new Error('连不上这个服务。可能是网络问题，或者它不允许网页直接访问（CORS）')}
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error?.message||d.message||`HTTP ${r.status}`);
  return d;
}
