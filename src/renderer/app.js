'use strict';
let cfg={ytdlpPath:'',history:[],playlist:[],theme:'dark',volume:80};
let playlist=[],curIdx=-1,hls=null;
const VID=document.getElementById('vid');
const STAGE=document.getElementById('stage');

document.addEventListener('DOMContentLoaded',async()=>{
  cfg=await window.api.getConfig();
  applyTheme(cfg.theme||'dark');
  VID.volume=(cfg.volume??80)/100;
  document.getElementById('vol').value=cfg.volume??80;
  const pl=await window.api.getPlaylist();
  if(pl?.length){playlist=pl;renderPl();}
  initWin();initNav();initVideo();initIbar();initKeys();initSettings();initHistory();initPlPanel();
  checkYtdlp();loadVer();
});

function initWin(){
  document.getElementById('bmin').onclick=()=>window.api.minimize();
  document.getElementById('bmax').onclick=()=>window.api.maximize();
  document.getElementById('bclose').onclick=()=>window.api.close();
}

function initNav(){
  document.querySelectorAll('.nb[data-p]').forEach(b=>b.addEventListener('click',()=>sw(b.dataset.p)));
  document.getElementById('theme-toggle').onclick=toggleTheme;
}
function sw(name){
  document.querySelectorAll('.nb[data-p]').forEach(b=>b.classList.toggle('active',b.dataset.p===name));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===`panel-${name}`));
}
function applyTheme(t){
  document.documentElement.dataset.theme=t;
  const i=document.getElementById('theme-icon');if(!i)return;
  i.innerHTML=t==='dark'?'<path d="M17 12.5A7 7 0 1 1 7.5 3a5.5 5.5 0 0 0 9.5 9.5z"/>':'<circle cx="10" cy="10" r="4"/><line x1="10" y1="2" x2="10" y2="0"/><line x1="10" y1="18" x2="10" y2="20"/><line x1="2" y1="10" x2="0" y2="10"/><line x1="18" y1="10" x2="20" y2="10"/>';
}
async function toggleTheme(){const n=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(n);cfg=await window.api.saveConfig({theme:n});}

function initVideo(){
  VID.addEventListener('playing',()=>{hideBuf();hideIdle();STAGE.classList.remove('paused');setPbtn(true);});
  VID.addEventListener('play',()=>{STAGE.classList.add('paused');setPbtn(true);});
  VID.addEventListener('pause',()=>{STAGE.classList.add('paused');setPbtn(false);});
  VID.addEventListener('waiting',showBuf);VID.addEventListener('canplay',hideBuf);
  VID.addEventListener('ended',onEnd);VID.addEventListener('timeupdate',updProg);
  VID.addEventListener('progress',updBuf);VID.addEventListener('error',onErr);
  VID.addEventListener('loadedmetadata',updProg);
  document.getElementById('c-play').onclick=togglePlay;
  document.getElementById('c-back').onclick=()=>seek(-10);
  document.getElementById('c-fwd').onclick=()=>seek(10);
  document.getElementById('c-mute').onclick=toggleMute;
  document.getElementById('vol').addEventListener('input',e=>{const v=e.target.value/100;VID.volume=v;VID.muted=v===0;updVolIco(v>0&&!VID.muted);cfg.volume=+e.target.value;window.api.saveConfig({volume:cfg.volume});});
  initProg();
  document.getElementById('spd').addEventListener('change',e=>{VID.playbackRate=parseFloat(e.target.value);});
  document.getElementById('c-pip').onclick=async()=>{if(document.pictureInPictureElement)await document.exitPictureInPicture();else if(VID.readyState>0)await VID.requestPictureInPicture().catch(()=>{});};
  document.getElementById('c-fs').onclick=toggleFs;
  document.addEventListener('fullscreenchange',()=>{const f=!!document.fullscreenElement;document.getElementById('ico-fs').style.display=f?'none':'';document.getElementById('ico-efs').style.display=f?'':'none';});
  document.getElementById('c-prev').onclick=prevItem;
  document.getElementById('c-next').onclick=nextItem;
  STAGE.addEventListener('dblclick',toggleFs);
  let hTimer;
  STAGE.addEventListener('mousemove',()=>{clearTimeout(hTimer);STAGE.classList.add('hovering');hTimer=setTimeout(()=>STAGE.classList.remove('hovering'),2500);});
  STAGE.addEventListener('mouseleave',()=>{clearTimeout(hTimer);STAGE.classList.remove('hovering');});
}
function initProg(){
  const bg=document.getElementById('prog-bg'),tip=document.getElementById('prog-tip'),knob=document.getElementById('prog-knob');
  bg.addEventListener('mousemove',e=>{const{left,width}=bg.getBoundingClientRect();const p=clamp((e.clientX-left)/width,0,1);tip.style.left=(p*100)+'%';tip.textContent=fmt(p*(VID.duration||0));knob.style.left=(p*100)+'%';});
  bg.addEventListener('click',e=>{if(!VID.duration)return;const{left,width}=bg.getBoundingClientRect();VID.currentTime=clamp((e.clientX-left)/width,0,1)*VID.duration;});
  bg.addEventListener('mousedown',e=>{const mv=ev=>{if(!VID.duration)return;const{left,width}=bg.getBoundingClientRect();VID.currentTime=clamp((ev.clientX-left)/width,0,1)*VID.duration;};const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);});
}
function updProg(){if(!VID.duration)return;const p=(VID.currentTime/VID.duration)*100;document.getElementById('prog-fill').style.width=p+'%';document.getElementById('prog-knob').style.left=p+'%';document.getElementById('tdisp').textContent=fmt(VID.currentTime)+' / '+fmt(VID.duration);}
function updBuf(){if(!VID.duration||!VID.buffered.length)return;document.getElementById('prog-buf').style.width=(VID.buffered.end(VID.buffered.length-1)/VID.duration*100)+'%';}
function setPbtn(p){document.getElementById('ico-play').style.display=p?'none':'';document.getElementById('ico-pause').style.display=p?'':'none';}
function updVolIco(v){document.getElementById('ico-vol').style.display=v?'':'none';document.getElementById('ico-mute').style.display=v?'none':'';}
function togglePlay(){VID.paused?VID.play():VID.pause();}
function toggleMute(){VID.muted=!VID.muted;updVolIco(!VID.muted);}
function seek(s){VID.currentTime=clamp(VID.currentTime+s,0,VID.duration||0);}
async function toggleFs(){if(!document.fullscreenElement)await STAGE.requestFullscreen().catch(()=>{});else document.exitFullscreen();}
function showBuf(){document.getElementById('buf-ov').style.display='flex';}
function hideBuf(){document.getElementById('buf-ov').style.display='none';}
function hideIdle(){document.getElementById('idle-ov').classList.add('gone');}
function showIdle(){document.getElementById('idle-ov').classList.remove('gone');}
function onEnd(){setPbtn(false);if(curIdx<playlist.length-1)nextItem();else showIdle();}
function onErr(){hideBuf();const c=VID.error?.code;const m={1:'Aborted',2:'Network error',3:'Decode error',4:'Source not supported'};setStatus('er','✕ '+(m[c]||'Playback error'));}

function initIbar(){
  document.getElementById('play-btn').onclick=playFromInput;
  document.getElementById('url-in').addEventListener('keydown',e=>{if(e.key==='Enter')playFromInput();});
  document.getElementById('paste-btn').onclick=async()=>{try{const t=await navigator.clipboard.readText();if(t?.startsWith('http'))document.getElementById('url-in').value=t.trim();}catch{}};
  document.getElementById('file-btn').onclick=async()=>{const files=await window.api.browseVideo();if(!files)return;const items=files.map(f=>({url:f,title:f.split(/[/\\]/).pop(),isLocal:true}));playlist.push(...items);await window.api.savePlaylist(playlist);renderPl();playItem(playlist.length-items.length);};
  document.getElementById('addq-btn').onclick=()=>{const u=document.getElementById('url-in').value.trim();if(!u)return;addToPl({url:u,title:exTitle(u)});setStatus('ok','✓ Added to queue');};
}
async function playFromInput(){const url=document.getElementById('url-in').value.trim();if(!url)return;await resolvePlay(url,document.getElementById('qsel').value);}

async function resolvePlay(url,quality='720'){
  if(!url)return;
  if(isDirect(url)){loadVid(url,url);return;}
  setStatus('ld','Resolving stream…');
  const r=await window.api.resolveUrl({url,quality});
  if(!r.success){
    if(r.fallback){setStatus('','yt-dlp unavailable — trying direct');loadVid(r.fallback,r.fallback);}
    else setStatus('er','✕ '+r.error);
    return;
  }
  loadVid(r.videoUrl,url,r.audioUrl);
  const h={url,title:exTitle(url),quality,timestamp:Date.now()};
  cfg.history=await window.api.addHistory(h);renderHist();
}

async function loadVid(src,origUrl,audioSrc=null){
  if(hls){hls.destroy();hls=null;}
  VID.pause();hideIdle();showBuf();setStatus('ld','Loading…');
  if(isHLS(src)){
    if(typeof Hls!=='undefined'&&Hls.isSupported()){
      hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:90});
      hls.loadSource(src);hls.attachMedia(VID);
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{VID.play().catch(()=>{});setStatus('ok','▶ Playing HLS stream');});
      hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal){setStatus('er','✕ HLS: '+d.details);hideBuf();}});
    }else{VID.src=src;VID.play().catch(()=>{});}
    return;
  }
  VID.src=src;VID.load();
  VID.addEventListener('canplay',()=>{VID.play().catch(()=>{});setStatus('ok','▶ Playing');},{once:true});
}

function isDirect(url){if(url.startsWith('file://')||/^[A-Za-z]:\\/.test(url))return true;const ext=url.split('?')[0].split('.').pop().toLowerCase();return['mp4','mkv','webm','mov','avi','m4v','ts','m2ts','ogg','ogv','flv','3gp','m3u8','m3u'].includes(ext);}
function isHLS(url){return url.includes('.m3u8');}

function addToPl(item){playlist.push(item);window.api.savePlaylist(playlist);renderPl();}
async function playItem(idx){if(idx<0||idx>=playlist.length)return;curIdx=idx;const it=playlist[idx];document.getElementById('url-in').value=it.url;await resolvePlay(it.url,it.quality||'720');renderPl();}
function nextItem(){playItem(curIdx+1);}function prevItem(){playItem(curIdx-1);}

function renderPl(){
  const l=document.getElementById('pl-list');l.querySelectorAll('.icard').forEach(e=>e.remove());
  document.getElementById('pl-empty').style.display=playlist.length?'none':'flex';
  const badge=document.getElementById('pl-badge');badge.textContent=playlist.length;badge.style.display=playlist.length?'flex':'none';
  playlist.forEach((it,i)=>{
    const c=document.createElement('div');c.className='icard'+(i===curIdx?' now':'');c.style.animationDelay=i*20+'ms';
    c.innerHTML=`<span class="inum">${i===curIdx?'▶':i+1}</span><div class="iinfo"><div class="itit">${esc(it.title||exTitle(it.url))}</div><div class="iurl">${esc(it.url)}</div></div><div class="ibtns"><button class="ib" title="Play" aria-label="Play">${pIco()}</button><button class="ib dl" title="Remove" aria-label="Remove">${tIco()}</button></div>`;
    c.querySelector('.ib:not(.dl)').onclick=()=>playItem(i);
    c.querySelector('.ib.dl').onclick=async()=>{playlist.splice(i,1);if(curIdx>=i)curIdx=Math.max(-1,curIdx-1);await window.api.savePlaylist(playlist);renderPl();};
    l.appendChild(c);
  });
}

function initHistory(){document.getElementById('hist-clear').onclick=async()=>{cfg.history=await window.api.clearHistory();renderHist();};}
function renderHist(){
  const l=document.getElementById('hist-list');l.querySelectorAll('.icard').forEach(e=>e.remove());
  const items=cfg.history||[];document.getElementById('hist-empty').style.display=items.length?'none':'flex';
  items.forEach((it,i)=>{
    const c=document.createElement('div');c.className='icard';c.style.animationDelay=i*18+'ms';
    c.innerHTML=`<div class="iinfo"><div class="itit">${esc(it.title||exTitle(it.url))}</div><div class="iurl">${esc(it.url)}</div><div class="imeta">${ago(it.timestamp)} · ${it.quality||'best'}</div></div><div class="ibtns"><button class="ib" title="Play again" aria-label="Play">${pIco()}</button><button class="ib" title="Add to queue" aria-label="Queue">+</button><button class="ib dl" title="Remove" aria-label="Remove">${tIco()}</button></div>`;
    c.querySelector('.ib:nth-child(1)').onclick=()=>{document.getElementById('url-in').value=it.url;sw('player');resolvePlay(it.url,it.quality||'720');};
    c.querySelector('.ib:nth-child(2)').onclick=()=>addToPl({url:it.url,title:it.title,quality:it.quality});
    c.querySelector('.ib.dl').onclick=async()=>{cfg.history=await window.api.removeHistory(it.url);renderHist();};
    l.appendChild(c);
  });
}

function initPlPanel(){
  document.getElementById('pl-files').onclick=async()=>{const f=await window.api.browseVideo();if(!f)return;f.forEach(fp=>addToPl({url:fp,title:fp.split(/[/\\]/).pop(),isLocal:true}));};
  document.getElementById('pl-clear').onclick=async()=>{playlist=[];curIdx=-1;await window.api.savePlaylist(playlist);renderPl();};
}

function initSettings(){
  if(cfg.ytdlpPath){document.getElementById('ytdlp-in').value=cfg.ytdlpPath;chkYtdlpPath(cfg.ytdlpPath);}
  document.getElementById('ytdlp-browse').onclick=async()=>{const p=await window.api.browseYtdlp();if(p){document.getElementById('ytdlp-in').value=p;cfg.ytdlpPath=p;chkYtdlpPath(p);loadVer();}};
  document.getElementById('ytdlp-in').addEventListener('change',async e=>{const p=e.target.value.trim();if(p){cfg=await window.api.saveConfig({ytdlpPath:p});chkYtdlpPath(p);loadVer();}});
  document.querySelectorAll('[data-ext]').forEach(b=>b.addEventListener('click',()=>window.api.openExternal(b.dataset.ext)));
}
async function checkYtdlp(){if(cfg.ytdlpPath)chkYtdlpPath(cfg.ytdlpPath);}
async function chkYtdlpPath(p){const el=document.getElementById('ytdlp-stat');if(!p){el.className='pstat';el.textContent='';return;}const ok=await window.api.checkPath(p);el.className=`pstat ${ok?'ok':'er'}`;el.innerHTML=ok?'✓ Found — yt-dlp active':'✕ File not found';}
async function loadVer(){const v=await window.api.ytdlpVersion();const el=document.getElementById('ytdlp-ver');if(el)el.textContent=v?`v${v}`:'Not configured';}

function initKeys(){
  document.addEventListener('keydown',e=>{
    const t=e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
    switch(e.key){
      case' ':e.preventDefault();togglePlay();break;
      case'ArrowLeft':e.preventDefault();seek(-10);break;
      case'ArrowRight':e.preventDefault();seek(10);break;
      case'ArrowUp':e.preventDefault();adjVol(10);break;
      case'ArrowDown':e.preventDefault();adjVol(-10);break;
      case'f':case'F':toggleFs();break;
      case'm':case'M':toggleMute();break;
      case'n':case'N':nextItem();break;
      case'p':case'P':prevItem();break;
    }
  });
}
function adjVol(d){const s=document.getElementById('vol');const v=clamp(+s.value+d,0,100);s.value=v;VID.volume=v/100;VID.muted=v===0;updVolIco(v>0);cfg.volume=v;window.api.saveConfig({volume:v});}

let stTimer;
function setStatus(type,msg){
  const el=document.getElementById('sbar');
  el.className=`sbar ${type}`;
  const sp=type==='ld'?`<svg class="ldspin spin" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2.5" stroke-dasharray="36" stroke-dashoffset="10"/></svg>`:'';
  el.innerHTML=`${sp}<span>${msg}</span>`;
  clearTimeout(stTimer);if(type!=='ld')stTimer=setTimeout(()=>{el.className='sbar';el.textContent='';},5000);
}

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function fmt(s){if(!s||isNaN(s))return'0:00';const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=Math.floor(s%60);return h?`${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`:`${m}:${String(sc).padStart(2,'0')}`;}
function exTitle(url){try{const u=new URL(url),h=u.hostname.replace('www.',''),p=u.pathname.split('/').filter(Boolean).pop()||'';return p?`${h} — ${decodeURIComponent(p).replace(/[-_]/g,' ').slice(0,45)}`:h;}catch{return url.slice(0,50);}}
function ago(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return'Just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const pIco=()=>'<svg viewBox="0 0 13 13" fill="currentColor"><polygon points="2,2 11,6.5 2,11"/></svg>';
const tIco=()=>'<svg viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,3 12,3"/><path d="M4,3V2h5v1"/><rect x="2" y="4" width="9" height="7" rx=".8"/></svg>';