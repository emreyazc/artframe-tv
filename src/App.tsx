import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,Heart,Image,Maximize,Pause,Play,RefreshCw,Settings,Shuffle} from 'lucide-react';
import {categories,defaults,sourceNames,type Artwork,type Category,type Preferences,type Source,type SourceSelection} from './types';
import {loadArtworks} from './providers';
const read = <T,>(key:string,fallback:T):T=>{try {const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback;}catch{return fallback;}};
const allSources:Source[]=['met','cleveland','commons'];
const shuffleArray=<T,>(items:T[]):T[]=>[...items].sort(()=>Math.random()-.5);
// Accept only images close to the TV's 16:9 aspect ratio (roughly 1.6–2.0).
const isWide=(width:number,height:number)=>width>0&&height>0&&width/height>=1.6&&width/height<=2;
const measureImage=(url:string,signal:AbortSignal):Promise<{width:number;height:number}|null>=>new Promise(resolve=>{
 if(signal.aborted){resolve(null);return;}
 const img=new window.Image();let done=false;
 const finish=(size:{width:number;height:number}|null)=>{if(done)return;done=true;clearTimeout(timeout);signal.removeEventListener('abort',cancel);img.onload=null;img.onerror=null;img.src='';resolve(size);};
 const cancel=()=>finish(null);
 const timeout=window.setTimeout(()=>finish(null),8000);
 signal.addEventListener('abort',cancel,{once:true});
 img.onload=()=>finish({width:img.naturalWidth,height:img.naturalHeight});
 img.onerror=()=>finish(null);
 img.src=url;
});
const filterWide=async(items:Artwork[],signal:AbortSignal):Promise<Artwork[]>=>{
 const result:(Artwork|null)[]=new Array(items.length).fill(null);
 let cursor=0;
 const worker=async()=>{while(cursor<items.length&&!signal.aborted){
  const at=cursor++;const art=items[at];
  const dimensions=art.width&&art.height?{width:art.width,height:art.height}:await measureImage(art.thumbnailUrl,signal);
  if(dimensions&&isWide(dimensions.width,dimensions.height))result[at]=art;
 }};
 await Promise.all(Array.from({length:Math.min(6,items.length)},()=>worker()));
 return result.filter((a):a is Artwork=>a!==null);
};
export default function App(){
 const [prefs,setPrefs]=useState<Preferences>(()=>{const saved=read('artframe:prefs',defaults);return {...defaults,...saved,sources:Array.from(new Set((saved.sources||defaults.sources).map(s=>String(s)==='chicago'?'cleveland':s))).filter((s):s is Source=>allSources.includes(s as Source))};});
 const [favorites,setFavorites]=useState<string[]>(()=>read('artframe:favorites',[]));
 const [source,setSource]=useState<SourceSelection>('all');
 const [category,setCategory]=useState<Category>('Klasik resim');
 const [artworks,setArtworks]=useState<Artwork[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [warning,setWarning]=useState('');
 const [view,setView]=useState<'gallery'|'player'|'settings'>('gallery');
 const [index,setIndex]=useState(0);
 const [playing,setPlaying]=useState(true);
 const [showOverlay,setShowOverlay]=useState(true);
 const gridRef=useRef<HTMLDivElement>(null);
 const abort=useRef<AbortController|null>(null);
 const selected=artworks[index];
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
   if(source==='all'){
     const results=await Promise.allSettled(prefs.sources.map(s=>loadArtworks(s,category,controller.signal)));
     const failures=results.flatMap((result,i)=>result.status==='rejected'?[sourceNames[prefs.sources[i]]]:[]);
     data=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
     if(failures.length===results.length)throw new Error(`Tüm kaynaklara erişilemedi: ${failures.join(', ')}`);
     if(!controller.signal.aborted&&failures.length)setWarning(`Bazı kaynaklara erişilemedi: ${failures.join(', ')}. Diğer kaynakların eserleri gösteriliyor.`);
   }else{
     data=await loadArtworks(source,category,controller.signal);
   }
   const filtered=(prefs.preferWide??true)?await filterWide(data,controller.signal):data;
   if(!controller.signal.aborted)setArtworks(prefs.shuffle?shuffleArray(filtered):filtered);
  }
  catch(e){if(!controller.signal.aborted)setError(`Görseller alınamadı: ${e instanceof Error?e.message:String(e)}. TV ağ bağlantısını veya API erişimini kontrol edin.`);}
  finally{if(!controller.signal.aborted)setLoading(false);}
 },[source,category,prefs.sources,prefs.shuffle,prefs.preferWide]);
 useEffect(()=>{void refresh();return()=>abort.current?.abort();},[refresh]);
 const next=useCallback((delta:number)=>setIndex(i=>artworks.length?(i+delta+artworks.length)%artworks.length:0),[artworks.length]);
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
   <header className="topbar"><div className="brand"><span className="brand-icon"><Image size={22}/></span><div><strong>ArtFrame <span>TV</span></strong><small>Sanatın ekranında hayat bulsun.</small></div></div><button className="icon-btn" onClick={()=>setView('settings')} aria-label="Ayarlar"><Settings/></button></header>
   <section className="intro"><div><p className="eyebrow">ÜCRETSİZ SANAT KOLEKSİYONLARI</p><h1>Bir ekran.<br/><em>Binlerce hikâye.</em></h1><p>Kaynağını ve koleksiyonunu seç, sanat eserlerini televizyonunda keşfet.</p></div><div className="intro-art" aria-hidden="true"><span>ART<br/>FRAME</span></div></section>
   <section className="filters"><div><label htmlFor="source">KAYNAK</label><select id="source" value={source} onChange={e=>setSource(e.target.value as SourceSelection)}><option value="all">Tüm kaynaklar</option>{allSources.filter(s=>prefs.sources.includes(s)).map(s=><option value={s} key={s}>{sourceNames[s]}</option>)}</select></div><div><label htmlFor="category">KATEGORİ</label><select id="category" value={category} onChange={e=>setCategory(e.target.value as Category)}>{availableCategories.map(c=><option key={c}>{c}</option>)}</select></div><button className="refresh" onClick={()=>void refresh()}><RefreshCw size={17}/> Yenile</button></section>
   <div className="section-heading"><div><h2>{category}</h2><p>{sourceNames[source]} · {loading?'Yükleniyor...':`${artworks.length} eser`}</p></div>{artworks.length>0&&<button className="primary" onClick={()=>start(0)}><Play size={18} fill="currentColor"/> Sanat modunu başlat</button>}</div>
   {warning&&!error&&<div className="message" role="status">{warning}</div>}
   {error&&<div className="message error" role="alert">{error}<button onClick={()=>void refresh()}>Tekrar dene</button></div>}
   {!loading&&!error&&!artworks.length&&<div className="message">Bu aramada 16:9'a yakın uygun eser bulunamadı. Başka bir kategori deneyin veya 16:9 filtresini kapatın.</div>}
   {loading&&<div className="message">Koleksiyon yükleniyor ve görsellerin ekran oranları kontrol ediliyor…</div>}
   <div className="art-grid" ref={gridRef} onKeyDown={onGridKey}>{artworks.map((a,i)=><button key={a.id} className="art-card" onClick={()=>start(i)}><div className="thumb"><img src={a.thumbnailUrl} alt={a.title} loading="lazy"/><span className="view-icon"><Maximize size={17}/></span></div><strong>{a.title}</strong><small>{a.artist||sourceNames[a.source]}</small></button>)}</div>
   <footer>ArtFrame TV v0.1 · Açık erişimli koleksiyonlar · Eserlerin lisans bilgileri kendi kaynaklarında doğrulanmalıdır.</footer>
  </>}
  {view==='player'&&selected&&<div className="player" onMouseMove={()=>setShowOverlay(true)}>
   {prefs.fit==='frame'&&!(prefs.preferWide??true)&&<div className="art-backdrop" style={{backgroundImage:`url("${selected.thumbnailUrl.replace(/"/g,'%22')}")`}} aria-hidden="true"/>}
   <img className={`full-art ${(prefs.preferWide??true)?'cover':prefs.fit}`} src={selected.imageUrl} alt={selected.title} onError={e=>{if(e.currentTarget.src!==selected.thumbnailUrl)e.currentTarget.src=selected.thumbnailUrl;}}/>
   {showOverlay&&<><div className="player-top"><button onClick={back} className="round" aria-label="Galeriye dön"><ArrowLeft/></button><span>{index+1} / {artworks.length}</span><button onClick={()=>toggleFavorite(selected.id)} className={`round ${favorites.includes(selected.id)?'fav':''}`} aria-label="Favori"><Heart fill={favorites.includes(selected.id)?'currentColor':'none'}/></button></div>
   <div className="player-bottom"><div className="art-description">{prefs.showInfo&&<><h2>{selected.title}</h2><p>{selected.artist||sourceNames[selected.source]} {selected.year?`· ${selected.year}`:''}</p><small>{selected.license} · <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Kaynak sayfası</a></small></>}</div><div className="player-controls"><button className="round" onClick={()=>next(-1)} aria-label="Önceki"><ChevronLeft/></button><button className="round large" onClick={()=>setPlaying(v=>!v)} aria-label={playing?'Duraklat':'Oynat'}>{playing?<Pause/>:<Play/>}</button><button className="round" onClick={()=>next(1)} aria-label="Sonraki"><ChevronRight/></button></div></div></>}
   <button className="overlay-toggle" onClick={()=>setShowOverlay(v=>!v)} aria-label="Bilgileri gizle/göster"/>
  </div>}
  {view==='settings'&&<div className="settings-page"><header className="topbar"><button className="back-btn" onClick={back}><ArrowLeft size={19}/> Galeriye dön</button><h2>Ayarlar</h2></header><div className="settings-content"><h1>ArtFrame ayarları</h1><p className="muted">Tercihler bu cihazın yerel depolamasına kaydedilir.</p><h3>Görsel kaynakları</h3><div className="checks">{allSources.map(s=><label key={s}><input type="checkbox" checked={prefs.sources.includes(s)} disabled={prefs.sources.length===1&&prefs.sources.includes(s)} onChange={e=>changePrefs({sources:e.target.checked?[...prefs.sources,s]:prefs.sources.filter(v=>v!==s)})}/>{sourceNames[s]}</label>)}</div><h3>Kategoriler</h3><div className="checks two">{categories.map(c=><label key={c}><input type="checkbox" checked={prefs.categories.includes(c)} disabled={prefs.categories.length===1&&prefs.categories.includes(c)} onChange={e=>changePrefs({categories:e.target.checked?[...prefs.categories,c]:prefs.categories.filter(v=>v!==c)})}/>{c}</label>)}</div><h3>Sanat modu</h3><div className="setting-row"><label htmlFor="interval">Görsel değiştirme süresi</label><select id="interval" value={prefs.interval} onChange={e=>changePrefs({interval:Number(e.target.value)})}>{[30,60,300,600,900,1800,3600].map(n=><option key={n} value={n}>{n<60?`${n} saniye`:`${n/60} dakika`}</option>)}</select></div><div className="setting-row"><label htmlFor="fit">Görüntü yerleşimi</label><select id="fit" value={prefs.fit} onChange={e=>changePrefs({fit:e.target.value as Preferences['fit']})}><option value="contain">Tamamını göster</option><option value="cover">Ekranı doldur (kırpabilir)</option><option value="frame">Sanat çerçevesi (bulanık arka plan)</option></select></div><div className="checks"><label><input type="checkbox" checked={prefs.preferWide??true} onChange={e=>changePrefs({preferWide:e.target.checked})}/>Yalnızca 16:9'a yakın yatay görselleri göster</label><label><input type="checkbox" checked={prefs.showInfo} onChange={e=>changePrefs({showInfo:e.target.checked})}/>Eser bilgilerini göster</label><label><input type="checkbox" checked={prefs.shuffle} onChange={e=>changePrefs({shuffle:e.target.checked})}/><Shuffle size={15}/> Karışık sıralama</label></div><p className="note">TV genelinde otomatik ekran koruyucu başlatma henüz uygulanmadı. Bu özellik için Tizen sistem yetkileri ayrıca araştırılacak.</p></div></div>}
 </main>;
}
