import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,Heart,Image,Maximize,Pause,Play,RefreshCw,Settings,Shuffle} from 'lucide-react';
import {categories,defaults,sourceNames,type Artwork,type Category,type Preferences,type Source,type SourceSelection} from './types';
import {featuredArtists,loadArtworks,loadArtistArtworks,resolveArtworkImages} from './providers';
const read = <T,>(key:string,fallback:T):T=>{try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback;}catch{return fallback;}};
const allSources:Source[]=['met','cleveland','rijks','openverse','nasa'];
const shuffleArray=<T,>(items:T[]):T[]=>[...items].sort(()=>Math.random()-.5);
export default function App(){
 const [prefs,setPrefs]=useState<Preferences>(()=>{const saved=read('artframe:prefs',defaults);const stored=(saved.sources||defaults.sources).map(s=>String(s)==='chicago'?'cleveland':s);const migrated=localStorage.getItem('artframe:rijks-migrated')==='1'?stored:[...stored,'rijks'];localStorage.setItem('artframe:rijks-migrated','1');const expanded=localStorage.getItem('artframe:new-sources-20261102')==='1'?migrated:[...migrated,'openverse','nasa'];localStorage.setItem('artframe:new-sources-20261102','1');return {...defaults,...saved,sources:Array.from(new Set(expanded)).filter((s):s is Source=>allSources.includes(s as Source))};});
 const [favorites,setFavorites]=useState<string[]>(()=>read('artframe:favorites',[]));
 const [source,setSource]=useState<SourceSelection>('all');
 const [category,setCategory]=useState<Category>('Klasik resim');
 const [browseMode,setBrowseMode]=useState<'categories'|'artists'>('categories');
 const [artist,setArtist]=useState<string>(featuredArtists[0]);
 const [artworks,setArtworks]=useState<Artwork[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [warning,setWarning]=useState('');
 const [view,setView]=useState<'gallery'|'player'|'settings'>('gallery');
 const [index,setIndex]=useState(0);
 const [playing,setPlaying]=useState(true);
 const [showOverlay,setShowOverlay]=useState(true);
 const [slideUrl,setSlideUrl]=useState('');
 const [slideLoading,setSlideLoading]=useState(false);
 const [slideError,setSlideError]=useState('');

 const gridRef=useRef<HTMLDivElement>(null);
 const abort=useRef<AbortController|null>(null);
 const selected=artworks[index];
 useEffect(()=>{
  if(view!=='player'||!selected)return;
  const controller=new AbortController();let alive=true;
  setSlideUrl(selected.thumbnailUrl);setSlideLoading(true);setSlideError('');
  const load=(url:string)=>new Promise<{url:string;width:number;height:number}>((resolve,reject)=>{
   const img=new window.Image();
   img.onload=()=>resolve({url,width:img.naturalWidth,height:img.naturalHeight});
   img.onerror=()=>reject(new Error('Görsel dosyası açılamadı'));
   img.src=url;
  });
  (async()=>{
   try{
    const candidates=await resolveArtworkImages(selected,controller.signal);
    let best:{url:string;width:number;height:number}|null=null;
    for(const url of candidates){
     if(!alive||controller.signal.aborted)return;
     try{
      const result=await load(url);
      if(!best||result.width*result.height>best.width*best.height)best=result;
      // Prefer the first usable 4K-class asset; avoid downloading every variant.
      if(result.width>=2560||result.height>=2560)break;
     }catch{continue;}
    }
    if(!alive)return;
    if(!best)throw new Error('Yüksek çözünürlüklü dosya yüklenemedi');
    if(selected.source==='nasa'&&Math.max(best.width,best.height)<1600)
      setSlideError(`NASA yalnızca ${best.width} × ${best.height} px görsel sağladı`);
    setSlideUrl(best.url);
   }catch(e){
    if(alive)setSlideError(e instanceof Error?e.message:'Yüksek çözünürlüklü görsel alınamadı');
   }finally{if(alive)setSlideLoading(false);}
  })();
  return()=>{alive=false;controller.abort();};
 },[view,selected]);
 useEffect(()=>{localStorage.setItem('artframe:prefs',JSON.stringify(prefs));},[prefs]);
 useEffect(()=>{localStorage.setItem('artframe:favorites',JSON.stringify(favorites));},[favorites]);
 const availableCategories=useMemo(()=>prefs.categories,[prefs.categories]);
 useEffect(()=>{if(source!=='all'&&!prefs.sources.includes(source))setSource('all');},[prefs.sources,source]);
 useEffect(()=>{if(!availableCategories.includes(category)&&availableCategories.length)setCategory(availableCategories[0]);},[availableCategories,category]);
 const refresh=useCallback(async()=>{
  abort.current?.abort();const controller=new AbortController();abort.current=controller;
  setLoading(true);setError('');setWarning('');setArtworks([]);setIndex(0);
  try{
   let data:Artwork[];
   if(browseMode==='artists'){
     const result=await loadArtistArtworks(artist,prefs.sources,controller.signal);
     data=result.artworks;
     if(result.failed.length&&!controller.signal.aborted)setWarning(`Bazı sanatçı kaynaklarına erişilemedi: ${result.failed.map(s=>sourceNames[s]).join(', ')}`);
   }else if(source==='all'){
     const results=await Promise.allSettled(prefs.sources.map(s=>loadArtworks(s,category,controller.signal)));
     const failures=results.flatMap((result,i)=>result.status==='rejected'?[sourceNames[prefs.sources[i]]]:[]);
     data=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
     if(failures.length===results.length)throw new Error(`Tüm kaynaklara erişilemedi: ${failures.join(', ')}`);
     if(!controller.signal.aborted&&failures.length)setWarning(`Bazı kaynaklara erişilemedi: ${failures.join(', ')}. Diğer kaynakların eserleri gösteriliyor.`);
   }else{
     data=await loadArtworks(source,category,controller.signal);
   }
   if(!controller.signal.aborted)setArtworks(prefs.shuffle?shuffleArray(data):data);
  }
  catch(e){if(!controller.signal.aborted)setError(`Görseller alınamadı: ${e instanceof Error?e.message:String(e)}. TV ağ bağlantısını veya API erişimini kontrol edin.`);}
  finally{if(!controller.signal.aborted)setLoading(false);}
 },[source,category,artist,browseMode,prefs.sources,prefs.shuffle]);
 useEffect(()=>{void refresh();return()=>abort.current?.abort();},[refresh]);
 const next=useCallback((delta:number)=>setIndex(i=>artworks.length?(i+delta+artworks.length)%artworks.length:0),[artworks.length]);
 useEffect(()=>{if(view!=='player'||!showOverlay)return;const timer=window.setTimeout(()=>setShowOverlay(false),4000);return()=>window.clearTimeout(timer);},[view,showOverlay,index]);
 const toggleFavorite=useCallback((id:string)=>setFavorites(items=>items.includes(id)?items.filter(x=>x!==id):[...items,id]),[]);
 const back=useCallback(()=>{if(view!=='gallery'){setView('gallery');setPlaying(false);}else{gridRef.current?.focus();}},[view]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if(e.key==='Escape'||e.key==='Backspace'||e.key==='BrowserBack'){e.preventDefault();back();return;}
   if(view==='player'){
    if(e.key==='ArrowRight'){e.preventDefault();next(1);}
    if(e.key==='ArrowLeft'){e.preventDefault();next(-1);}
    if(e.key==='Enter'||e.key===' '||e.key==='MediaPlayPause'){e.preventDefault();setPlaying(p=>!p);}
    if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setShowOverlay(v=>!v);}
   }
  };
  window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
 },[view,back,next]);
 useEffect(()=>{if(view!=='player'||!playing||artworks.length<2)return;const t=window.setInterval(()=>next(1),prefs.interval*1000);return()=>clearInterval(t);},[view,playing,artworks.length,prefs.interval,next]);
 const start=(i:number)=>{setIndex(i);setPlaying(true);setShowOverlay(true);setView('player');};
 const changePrefs=(patch:Partial<Preferences>)=>setPrefs(p=>({...p,...patch}));
 const onGridKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{
  const cards=Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('.art-card')||[]);
  const at=cards.indexOf(document.activeElement as HTMLButtonElement);
  if(at<0)return;
  const cols=window.innerWidth>1100?5:window.innerWidth>700?3:2;
  const delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:e.key==='ArrowDown'?cols:e.key==='ArrowUp'?-cols:0;
  if(delta){e.preventDefault();cards[Math.min(cards.length-1,Math.max(0,at+delta))]?.focus();}
 };
 return <main className="app">
  {view==='gallery'&&<>
   <header className="topbar"><div className="brand"><span className="brand-icon"><Image size={22}/></span><div><strong>ArtFrame <span>TV</span></strong><small>Görsel dünyanı keşfet.</small></div></div><button className="icon-btn" onClick={()=>setView('settings')} aria-label="Ayarlar"><Settings/></button></header>
   <section className="intro"><div className="intro-copy"><p className="eyebrow"><span className="intro-dot"/> GÖRSEL KOLEKSİYONLAR</p><h1>Ekranını <span>keşfe aç.</span></h1><p>Sanattan doğaya, şehirlerden uzaya. Dünyanın görsel koleksiyonları tek ekranda.</p><div className="intro-tags" aria-label="Keşfedilecek kategoriler"><span>Sanat</span><span>Doğa</span><span>Uzay</span><span>Fotoğraf</span></div></div><div className="intro-visual" aria-hidden="true"><div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/><div className="visual-tile tile-one"><span>01</span><div className="tile-landscape"/></div><div className="visual-tile tile-two"><span>02</span><div className="tile-cosmos"/></div><div className="visual-tile tile-three"><span>03</span><div className="tile-architecture"/></div><div className="visual-caption">EXPLORE / DISPLAY / ENJOY</div></div></section>
   <nav className="browse-tabs" aria-label="Keşif yöntemi"><button className={browseMode==='categories'?'active':''} onClick={()=>setBrowseMode('categories')} aria-pressed={browseMode==='categories'}>Kategoriler</button><button className={browseMode==='artists'?'active':''} onClick={()=>setBrowseMode('artists')} aria-pressed={browseMode==='artists'}>Sanatçılar</button></nav><section className="filters">{browseMode==='categories'?<><div><label htmlFor="source">KAYNAK</label><select id="source" value={source} onChange={e=>setSource(e.target.value as SourceSelection)}><option value="all">Tüm kaynaklar</option>{allSources.filter(s=>prefs.sources.includes(s)).map(s=><option value={s} key={s}>{sourceNames[s]}</option>)}</select></div><div><label htmlFor="category">KATEGORİ</label><select id="category" value={category} onChange={e=>setCategory(e.target.value as Category)}>{availableCategories.map(c=><option key={c}>{c}</option>)}</select></div></>:<div><label htmlFor="artist">SANATÇI</label><select id="artist" value={artist} onChange={e=>setArtist(e.target.value)}>{featuredArtists.map(name=><option key={name} value={name}>{name}</option>)}</select></div>}<button className="refresh" onClick={()=>void refresh()}><RefreshCw size={17}/> Yenile</button></section>
   <div className="section-heading"><div><h2>{browseMode==='artists'?artist:category}</h2><p>{browseMode==='artists'?'The Met + Cleveland':sourceNames[source]} · {loading?'Yükleniyor...':`${artworks.length} eser`}</p></div>{artworks.length>0&&<button className="primary" onClick={()=>start(0)}><Play size={18} fill="currentColor"/> Sanat modunu başlat</button>}</div>
   {warning&&!error&&<div className="message" role="status">{warning}</div>}
   {error&&<div className="message error" role="alert">{error}<button onClick={()=>void refresh()}>Tekrar dene</button></div>}
   {!loading&&!error&&!artworks.length&&<div className="message">{browseMode==='artists'?'Bu sanatçı için açık erişimli eser bulunamadı. Başka bir sanatçı deneyin veya ayarlardan The Met ve Cleveland kaynaklarını etkinleştirin.':'Bu kaynak ve kategoride görüntülenebilir eser bulunamadı. Başka bir kategori veya kaynak deneyin.'}</div>}
   {loading&&<div className="message">Koleksiyon yükleniyor…</div>}
   <div className="art-grid" ref={gridRef} onKeyDown={onGridKey}>{artworks.map((a,i)=><button key={a.id} className="art-card" onClick={()=>start(i)}><div className="thumb"><img src={a.thumbnailUrl} alt={a.title} loading="lazy"/><span className="view-icon"><Maximize size={17}/></span></div><strong>{a.title}</strong><small>{a.artist||sourceNames[a.source]}</small></button>)}</div>
   <footer>ArtFrame TV v0.1 · Açık erişimli koleksiyonlar · Eserlerin lisans bilgileri kendi kaynaklarında doğrulanmalıdır.</footer>
  </>}
  {view==='player'&&selected&&<div className="player" onMouseMove={()=>{if(!showOverlay)setShowOverlay(true);}} onClick={e=>{if(e.target===e.currentTarget)setShowOverlay(true);}}>
   {<div className="art-backdrop" style={{backgroundImage:`url("${selected.thumbnailUrl.replace(/"/g,'%22')}")`}} aria-hidden="true"/>}
   <img key={selected.id} className="full-art frame" src={slideUrl||selected.thumbnailUrl} alt={selected.title}/>{(slideLoading||slideError)&&<div className="slide-loading" aria-live="polite">{slideLoading?'Yüksek çözünürlüklü görsel yükleniyor…':`Görsel kalitesi: ${slideError}`}</div>}
   {showOverlay&&<><div className="player-top"><button onClick={back} className="round" aria-label="Galeriye dön"><ArrowLeft/></button><span>{index+1} / {artworks.length}</span><button onClick={()=>toggleFavorite(selected.id)} className={`round ${favorites.includes(selected.id)?'fav':''}`} aria-label="Favori"><Heart fill={favorites.includes(selected.id)?'currentColor':'none'}/></button></div>
   <div className="player-bottom"><div className="art-description">{prefs.showInfo&&<div className="art-meta-line"><strong title={selected.title}>{selected.title}</strong><span className="meta-dot">·</span><span title={selected.artist||sourceNames[selected.source]}>{selected.artist||sourceNames[selected.source]}</span>{selected.year&&<><span className="meta-dot">·</span><span>{selected.year}</span></>}</div>}</div><div className="player-controls"><button className="round" onClick={()=>next(-1)} aria-label="Önceki"><ChevronLeft/></button><button className="round large" onClick={()=>setPlaying(v=>!v)} aria-label={playing?'Duraklat':'Oynat'}>{playing?<Pause/>:<Play/>}</button><button className="round" onClick={()=>next(1)} aria-label="Sonraki"><ChevronRight/></button></div></div></>}

  </div>}
  {view==='settings'&&<div className="settings-page"><header className="topbar"><button className="back-btn" onClick={back}><ArrowLeft size={19}/> Galeriye dön</button><h2>Ayarlar</h2></header><div className="settings-content"><h1>ArtFrame ayarları</h1><p className="muted">Tercihler bu cihazın yerel depolamasına kaydedilir.</p><h3>Görsel kaynakları</h3><div className="checks">{allSources.map(s=><label key={s}><input type="checkbox" checked={prefs.sources.includes(s)} disabled={prefs.sources.length===1&&prefs.sources.includes(s)} onChange={e=>changePrefs({sources:e.target.checked?[...prefs.sources,s]:prefs.sources.filter(v=>v!==s)})}/>{sourceNames[s]}</label>)}</div><h3>Kategoriler</h3><div className="checks two">{categories.map(c=><label key={c}><input type="checkbox" checked={prefs.categories.includes(c)} disabled={prefs.categories.length===1&&prefs.categories.includes(c)} onChange={e=>changePrefs({categories:e.target.checked?[...prefs.categories,c]:prefs.categories.filter(v=>v!==c)})}/>{c}</label>)}</div><h3>Sanat modu</h3><div className="setting-row"><label htmlFor="quality">Görüntü kalitesi tercihi</label><select id="quality" value={prefs.quality||'balanced'} onChange={e=>changePrefs({quality:e.target.value as Preferences['quality']})}><option value="balanced">Dengeli (önerilen)</option><option value="high">Yüksek kalite</option><option value="all">Tüm eserler</option></select></div><p className="muted">Galeride küçük önizlemeler kullanılır. Sanat modunda yüksek çözünürlüklü görsel ayrıca yüklenir.</p><div className="setting-row"><label htmlFor="interval">Görsel değiştirme süresi</label><select id="interval" value={prefs.interval} onChange={e=>changePrefs({interval:Number(e.target.value)})}>{[30,60,300,600,900,1800,3600].map(n=><option key={n} value={n}>{n<60?`${n} saniye`:`${n/60} dakika`}</option>)}</select></div><div className="checks"><label><input type="checkbox" checked={prefs.showInfo} onChange={e=>changePrefs({showInfo:e.target.checked})}/>Eser bilgilerini göster</label><label><input type="checkbox" checked={prefs.shuffle} onChange={e=>changePrefs({shuffle:e.target.checked})}/><Shuffle size={15}/> Karışık sıralama</label></div><p className="note">TV genelinde otomatik ekran koruyucu başlatma henüz uygulanmadı. Bu özellik için Tizen sistem yetkileri ayrıca araştırılacak.</p></div></div>}
 </main>;
}
