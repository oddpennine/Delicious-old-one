'use strict';
const $=id=>document.getElementById(id);
const presets=[{id:'lute',name:'류트',en:'LUTE',icon:'♮',desc:'짧고 둥글게 울리는, 뜯는 현의 소리.'},{id:'harp',name:'하프',en:'HARP',icon:'♧',desc:'맑은 현의 울림이 천천히 흩어져.'},{id:'recorder',name:'리코더',en:'RECORDER',icon:'♩',desc:'부드러운 숨결을 닮은 목관 음색.'},{id:'vielle',name:'비엘',en:'VIELLE',icon:'𝄞',desc:'거친 현의 결을 더한 활 악기 음색.'},{id:'choir',name:'성가풍 보이스',en:'CHOIR',icon:'✧',desc:'말 없는 모음이 겹쳐지는 합성 보이스.'}];
let selected='lute',ctx,master,wet,convolver,custom=null,recording=false,cursor=0,playing=false,timer=null,nextTime=0,playIndex=0,highlightTimers=[],voices=new Set(),cache=new Map();
let pattern=Array(16).fill(null);const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
try{let s=JSON.parse(localStorage.getItem('ancient-grove-v1'));if(s){if(Array.isArray(s.pattern)&&s.pattern.length===16)pattern=s.pattern.map(n=>n&&presets.some(p=>p.id===n.instrument)&&Number.isInteger(n.midi)&&n.midi>=36&&n.midi<=96?n:null);if(Number(s.bpm)>=40&&Number(s.bpm)<=180)$('bpm').value=s.bpm;}}catch{}
function persist(){try{localStorage.setItem('ancient-grove-v1',JSON.stringify({pattern,bpm:tempo()}));}catch{}}
function tempo(){return Math.min(180,Math.max(40,Number($('bpm').value)||84));}
function noteName(midi){return names[midi%12]+(Math.floor(midi/12)-1);}
function status(s){$('status').textContent=s;}
function drawInstruments(){const list=$('instruments');list.replaceChildren();for(const p of presets.concat(custom?[{id:'custom',name:'내 샘플',en:'IMPORTED AUDIO',icon:'＋'}]:[])){const b=document.createElement('button');b.className='instrument'+(p.id===selected?' active':'');b.setAttribute('aria-pressed',p.id===selected);const icon=document.createElement('span');icon.className='icon';icon.textContent=p.icon;const label=document.createElement('span');label.textContent=p.name;const small=document.createElement('small');small.textContent=p.en;label.append(small);b.append(icon,label);b.onclick=()=>{selected=p.id;drawInstruments();};list.append(b);}const p=presets.find(p=>p.id===selected);$('instrumentTitle').textContent=p?p.name:'내 샘플';$('instrumentDesc').textContent=p?p.desc:custom.name;$('engine').textContent=p?'합성 샘플':'가져온 오디오';}
function drawKeys(){const keyboard=$('keyboard');keyboard.replaceChildren();const mapping=['A','W','S','E','D','F','T','G','Y','H','U','J','K'];const count=Number($('keyRange').value),whiteCount=count===25?15:8;keyboard.style.setProperty('--white-count',whiteCount);keyboard.classList.toggle('wide',count===25);let white=0;for(let i=0;i<count;i++){const black=[1,3,6,8,10].includes(i%12);const b=document.createElement('button');b.className='key'+(black?' black':'');b.dataset.semitone=i;b.setAttribute('aria-label',noteName((Number($('octave').value)+1)*12+i));if(black)b.style.left=(white/whiteCount*100)+'%';else white++;const note=document.createElement('span');note.textContent=noteName((Number($('octave').value)+1)*12+i);const shortcut=document.createElement('small');shortcut.textContent=mapping[i]||'·';b.append(note,shortcut);b.onpointerdown=async e=>{e.preventDefault();b.classList.add('pressed');b.setPointerCapture(e.pointerId);await playNote(i);};b.onclick=e=>{if(e.detail===0)playNote(i);};b.onpointerup=b.onpointercancel=()=>b.classList.remove('pressed');keyboard.append(b);}}
function drawSteps(){const steps=$('steps');steps.replaceChildren();pattern.forEach((n,i)=>{const b=document.createElement('button');b.className='step'+(n?' filled':'')+(recording&&i===cursor?' cursor':'');const small=document.createElement('small');small.textContent=String(i+1).padStart(2,'0');b.append(small,document.createTextNode(n?noteName(n.midi):'—'));b.title=n?(presets.find(p=>p.id===n.instrument)?.name||'내 샘플')+' · 누르면 비우기':'쉼표 · 누르면 입력 위치 선택';b.onclick=()=>{if(n){pattern[i]=null;persist();}cursor=i;drawSteps();};steps.append(b);});$('patternCount').textContent=pattern.filter(Boolean).length+' / 16 음';}
function impulse(c){const b=c.createBuffer(2,c.sampleRate*1.7,c.sampleRate);let seed=83;for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<d.length;i++){seed=(seed*16807)%2147483647;d[i]=(seed/1073741824-1)*Math.pow(1-i/d.length,3)*.35;}}return b;}
async function start(){if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=Number($('volume').value)/100;master.connect(ctx.destination);convolver=ctx.createConvolver();convolver.buffer=impulse(ctx);wet=ctx.createGain();wet.gain.value=Number($('room').value)/100;convolver.connect(wet).connect(master);}await ctx.resume();$('power').textContent='♫ 소리 준비됨';status('준비됐어. 건반으로 선율을 만들어 봐.');}
// Integrate vibrato in phase; multiplying time by vibrato makes pitch drift grow.
function makeSample(c,id,midi=60){
 const rate=c.sampleRate,pluck=id==='lute'||id==='harp';
 const duration=pluck?(id==='harp'?3.5:2.4):1.8;
 const b=c.createBuffer(1,Math.ceil(rate*duration),rate),d=b.getChannelData(0);
 const f=pluck?261.625565:440*Math.pow(2,(midi-69)/12);
 const amps=id==='lute'?[1,.5,.28,.16,.1,.05]:id==='harp'?[1,.28,.38,.1,.08]:id==='recorder'?[1,.035,.11,.012,.018]:id==='vielle'?[1,.34,.19,.11,.065,.04,.025,.014]:null;
 const voicesCount=id==='choir'?3:1;
 const phases=new Float64Array(voicesCount),detune=[0,-.002,.002];
 const harmonics=amps?amps.length:Math.min(28,Math.floor(rate*.42/f));
 const weights=Array.from({length:harmonics},(_,h)=>{
  if(amps)return amps[h];
  const hz=f*(h+1);
  // A gentle oo/ah-like spectral envelope, without recorded human voices.
  return (.18+.85*Math.exp(-.5*Math.pow((hz-650)/190,2))+.5*Math.exp(-.5*Math.pow((hz-1150)/240,2))+.15*Math.exp(-.5*Math.pow((hz-2500)/350,2)))/(h+1);
 });
 let peak=0;
 for(let i=0;i<d.length;i++){
  const t=i/rate,attack=pluck?.006:id==='recorder'?.045:id==='vielle'?.12:.2;
  const release=pluck?1:Math.min(1,(duration-t)/.32);
  const envelope=Math.min(1,t/attack)*(pluck?Math.exp(-t*(id==='lute'?3:1.8)):release*(.88+.12*Math.exp(-t*3)));
  let value=0;
  for(let voice=0;voice<voicesCount;voice++){
   const depth=pluck?0:id==='recorder'?.00065:.0015;
   const vibrato=depth*Math.min(1,t/.35)*Math.sin(2*Math.PI*(id==='recorder'?4.8:5.1)*t+voice*.7);
   phases[voice]=(phases[voice]+2*Math.PI*f*(1+detune[voice]+vibrato)/rate)%(2*Math.PI);
   for(let h=0;h<harmonics;h++){
    if(f*(h+1)>rate*.42)continue;
    value+=weights[h]*Math.sin(phases[voice]*(h+1))*(pluck?Math.exp(-t*h*1.2):1)/voicesCount;
   }
  }
  d[i]=value*envelope;peak=Math.max(peak,Math.abs(d[i]));
 }
 const level=pluck?.45:id==='recorder'?.36:.34;
 if(peak>0)for(let i=0;i<d.length;i++)d[i]=d[i]/peak*level;
 return b;
}
function buffer(c,id,midi=60){if(id==='custom')return custom?.buffer;const pitched=!['lute','harp'].includes(id),key=id+':'+c.sampleRate+':'+(pitched?midi:60);if(!cache.has(key))cache.set(key,makeSample(c,id,midi));return cache.get(key);}
function sound(c,dry,reverb,id,midi,when){const b=buffer(c,id,midi);if(!b)return;const source=c.createBufferSource(),gain=c.createGain();source.buffer=b;source.playbackRate.value=['custom','lute','harp'].includes(id)?Math.pow(2,(midi-60)/12):1;source.connect(gain);gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.65,when+.005);const duration=Math.min(b.duration/source.playbackRate.value,5);gain.gain.setValueAtTime(.65,when+Math.max(.01,duration-.04));gain.gain.linearRampToValueAtTime(0,when+duration);gain.connect(dry);if(reverb)gain.connect(reverb);source.start(when);source.stop(when+duration+.01);if(c===ctx){voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};}return source;}
async function playNote(semitone){try{await start();const midi=(Number($('octave').value)+1)*12+semitone;sound(ctx,master,convolver,selected,midi,ctx.currentTime);status((presets.find(p=>p.id===selected)?.name||'내 샘플')+' · '+noteName(midi));if(recording){pattern[cursor]={instrument:selected,midi};cursor=(cursor+1)%16;persist();drawSteps();}}catch(e){status('소리를 시작할 수 없어. 브라우저의 오디오 설정을 확인해 줘.');}}
function stop(){playing=false;clearInterval(timer);highlightTimers.forEach(clearTimeout);highlightTimers=[];voices.forEach(v=>{try{v.stop();}catch{}});$('play').textContent='▶ 재생';document.querySelectorAll('.step').forEach(s=>s.classList.remove('playing'));}
function tick(){while(nextTime<ctx.currentTime+.12){const i=playIndex,n=pattern[i],at=nextTime;if(n)sound(ctx,master,convolver,n.instrument,n.midi,at);highlightTimers=highlightTimers.filter(t=>t);const t=setTimeout(()=>{if(playing){document.querySelectorAll('.step').forEach((s,j)=>s.classList.toggle('playing',i===j));}},Math.max(0,(at-ctx.currentTime)*1000));highlightTimers.push(t);if(highlightTimers.length>40)highlightTimers.splice(0,20);nextTime+=60/tempo()/2;playIndex=(playIndex+1)%16;}}
$('power').onclick=()=>start().catch(()=>status('이 브라우저에서는 오디오를 시작할 수 없어.'));
$('octave').onchange=drawKeys;$('keyRange').onchange=drawKeys;$('volume').oninput=()=>{$('volVal').textContent=$('volume').value+'%';if(master)master.gain.setTargetAtTime(Number($('volume').value)/100,ctx.currentTime,.02);};$('room').oninput=()=>{$('roomVal').textContent=$('room').value+'%';if(wet)wet.gain.setTargetAtTime(Number($('room').value)/100,ctx.currentTime,.02);};
$('record').onclick=()=>{recording=!recording;$('record').classList.toggle('on',recording);$('record').setAttribute('aria-pressed',recording);$('record').textContent=recording?'● 입력 중':'● 입력';drawSteps();status(recording?'연주하는 음을 다음 칸에 하나씩 담을게.':'패턴 입력을 마쳤어.');};
$('play').onclick=async()=>{if(playing){stop();return;}if(!pattern.some(Boolean)){status('입력을 켜고 음을 먼저 담아 줘.');return;}try{await start();playing=true;playIndex=0;nextTime=ctx.currentTime+.05;$('play').textContent='■ 정지';tick();timer=setInterval(tick,25);}catch{status('재생을 시작할 수 없어.');}};
$('panic').onclick=()=>{stop();status('모든 연주를 멈췄어.');};$('clear').onclick=()=>{stop();pattern=Array(16).fill(null);cursor=0;persist();drawSteps();status('16칸을 비웠어.');};$('bpm').onchange=()=>{$('bpm').value=tempo();persist();};
$('upload').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>30*1024*1024){status('30MB 이하 오디오 파일을 골라 줘.');return;}try{await start();const decoded=await ctx.decodeAudioData(await file.arrayBuffer());if(decoded.duration>20){status('20초 이하의 짧은 샘플을 골라 줘.');return;}custom={name:file.name,buffer:decoded};selected='custom';drawInstruments();status('불러왔어. C4가 원래 높이야. 내 샘플은 이 탭에서만 유지돼.');}catch{status('오디오를 읽지 못했어. WAV 또는 MP3로 다시 시도해 줘.');}e.target.value='';};
const keyMap={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12};window.onkeydown=e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;const n=keyMap[e.key.toLowerCase()];if(n!==undefined){e.preventDefault();document.querySelector('[data-semitone="'+n+'"]').classList.add('pressed');playNote(n);}};window.onkeyup=e=>{const n=keyMap[e.key.toLowerCase()];if(n!==undefined)document.querySelector('[data-semitone="'+n+'"]')?.classList.remove('pressed');};window.onblur=()=>{stop();document.querySelectorAll('.pressed').forEach(x=>x.classList.remove('pressed'));};
$('export').onclick=async()=>{if(!pattern.some(Boolean)){status('WAV로 저장할 음을 먼저 담아 줘.');return;}const button=$('export');button.disabled=true;button.textContent='저장 중…';try{const rate=44100,step=60/tempo()/2,seconds=16*step+7,offline=new OfflineAudioContext(2,Math.ceil(seconds*rate),rate),m=offline.createGain(),cv=offline.createConvolver(),w=offline.createGain();m.gain.value=Number($('volume').value)/100;m.connect(offline.destination);cv.buffer=impulse(offline);w.gain.value=Number($('room').value)/100;cv.connect(w).connect(m);pattern.forEach((n,i)=>{if(n)sound(offline,m,cv,n.instrument,n.midi,i*step);});const rendered=await offline.startRendering();const bytes=new ArrayBuffer(44+rendered.length*4),v=new DataView(bytes);const text=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};text(0,'RIFF');v.setUint32(4,36+rendered.length*4,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,rendered.length*4,true);for(let i=0;i<rendered.length;i++)for(let c=0;c<2;c++){const x=Math.max(-1,Math.min(1,rendered.getChannelData(c)[i]));v.setInt16(44+(i*2+c)*2,x<0?x*32768:x*32767,true);}const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),a=document.createElement('a');a.href=url;a.download='ancient-grove-'+tempo()+'bpm.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status('한 바퀴의 패턴과 잔향을 WAV로 저장했어.');}catch{status('WAV 저장에 실패했어. 다른 브라우저에서 다시 시도해 줘.');}finally{button.disabled=false;button.textContent='↓ WAV';}};
drawInstruments();drawKeys();drawSteps();
