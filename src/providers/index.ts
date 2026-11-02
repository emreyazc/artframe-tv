/// <reference types="vite/client" />
import type { Artwork, Category, Source, SourceSelection } from '../types';

// Query mapping is deliberately explicit: not every collection supports every subject.
const terms: Record<Category,{met?:string;cleveland?:string;rijks?:string;openverse?:string;nasa?:string}> = {
 'Mimari':{met:'architecture',cleveland:'architecture',rijks:'architecture',openverse:'architecture buildings'},
 'Doğa ve manzara':{met:'landscape',cleveland:'landscape',rijks:'landscape',openverse:'nature landscape'},
 'Klasik resim':{met:'painting',cleveland:'painting',rijks:'painting',openverse:'classical painting'},
 'Empresyonizm':{met:'impressionism',cleveland:'impressionism',rijks:'impressionism',openverse:'impressionism painting'},
 'Uzay ve astronomi':{met:'astronomy',cleveland:'astronomy',openverse:'space astronomy',nasa:'nebula galaxy'},
 'Modern sanat':{met:'modern art',cleveland:'modern art',rijks:'modern',openverse:'modern art'},
 'Şehirler':{met:'city',cleveland:'cityscape',rijks:'city',openverse:'city architecture'},
 'Japon sanatı':{met:'Japanese art',cleveland:'Japanese prints',rijks:'Japanese',openverse:'japanese art'},
 'Hayvanlar':{met:'animals',cleveland:'animals',rijks:'animals',openverse:'wildlife photography'},
 'Fotoğrafçılık':{met:'photograph',cleveland:'photography',rijks:'photograph',openverse:'photography'},
 'Soyut sanat':{met:'abstract',cleveland:'abstract',rijks:'abstract',openverse:'abstract art'},
 'Tarih':{met:'historical',cleveland:'history',rijks:'history',openverse:'historical architecture'}
};
export const supported = (source:Source, category:Category) => Boolean(terms[category][source]);
const normalizeArtist=(value:string)=>value.toLocaleLowerCase('en').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const matchesArtist=(value:string|undefined,artist:string)=>{
 const actual=normalizeArtist(value||'');const target=normalizeArtist(artist);
 return actual.includes(target)||target.split(' ').every(part=>actual.split(' ').includes(part));
};
export const featuredArtists=['Claude Monet','Vincent van Gogh','Pierre-Auguste Renoir','Edgar Degas','Paul Cézanne','Rembrandt van Rijn','Johannes Vermeer','Camille Pissarro','Édouard Manet','Paul Gauguin'] as const;
export const loadArtistArtworks=async(artist:string,sources:Source[],signal?:AbortSignal):Promise<{artworks:Artwork[];failed:Source[]}>=>{
 const active=sources.filter((s):s is 'met'|'cleveland'=>s==='met'||s==='cleveland');
 const results=await Promise.allSettled(active.map(s=>s==='met'?met('Klasik resim',signal,artist):cleveland('Klasik resim',signal,artist)));
 const failed=active.filter((_,i)=>results[i].status==='rejected');
 if(results.length&&failed.length===results.length)throw new Error('Sanatçı koleksiyonlarına erişilemedi');
 const artworks=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
 return {artworks:[...new Map(artworks.map(a=>[a.id,a])).values()],failed};
};
// The Vite proxy is only available while running npm run dev.
// Production/Tizen keeps the original public endpoints until a TV-safe solution is validated.
const metBase=import.meta.env.DEV?'/api/met':'https://collectionapi.metmuseum.org';
const clevelandBase=import.meta.env.DEV?'/api/cleveland':'https://openaccess-api.clevelandart.org';
const rijksBase=import.meta.env.DEV?'/api/rijks':'https://data.rijksmuseum.nl';
// Openverse anonymous requests may be blocked when routed through a server/proxy IP.
const openverseBase=import.meta.env.DEV?'/api/openverse':'https://api.openverse.org';
const nasaBase=import.meta.env.DEV?'/api/nasa':'https://images-api.nasa.gov';
class ApiError extends Error {
  constructor(readonly status:number,readonly endpoint:string){
    super(`HTTP ${status} (${endpoint})`);
  }
}
const pause=(ms:number,signal?:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('İstek iptal edildi','AbortError'));return;}
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
  const cancel=()=>{clearTimeout(timer);reject(new DOMException('İstek iptal edildi','AbortError'));};
  signal?.addEventListener('abort',cancel,{once:true});
});
const fetchJson = async (url:string, signal?:AbortSignal) => {
  for(let attempt=0;;attempt++){
    const response=await fetch(url,{signal,headers:{Accept:'application/json'}});
    if(response.ok)return response.json();
    // Never automatically retry 403: a server is explicitly denying access.
    if(attempt>=1||![429,502,503,504].includes(response.status))
      throw new ApiError(response.status,new URL(url,window.location.href).pathname);
    const retryAfter=Number(response.headers.get('Retry-After'));
    await pause(Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,5000):1200,signal);
  }
};
const met = async (category:Category, signal?:AbortSignal, artist?:string):Promise<Artwork[]> => {
 const term=artist||terms[category].met;if(!term)return [];
 const params=new URLSearchParams({hasImages:'true',q:term,offset:'0',limit:artist?'320':'100'});
 if(artist)params.set('artistOrCulture','true');
 const search=await fetchJson(`${metBase}/public/collection/v1.1/search?${params}`,signal);
 const ids:number[]=(search.objectIDs||[]).slice(0,artist?48:16);
 const found:Artwork[]=[];
 // Artist searches can include unrelated objects. Scan several batches, with bounded concurrency.
 for(let offset=0;offset<ids.length;offset+=2){
  if(signal?.aborted)break;
  const batch=await Promise.allSettled(ids.slice(offset,offset+2).map(id=>fetchJson(`${metBase}/public/collection/v1/objects/${id}`,signal)));
  for(const result of batch){
   if(result.status!=='fulfilled')continue;
   const o=result.value;
   if(!o.isPublicDomain||!o.primaryImageSmall||!o.primaryImage||(artist&&!matchesArtist(o.artistDisplayName,artist)))continue;
   found.push({id:`met:${o.objectID}`,source:'met',title:o.title||'İsimsiz eser',artist:o.artistDisplayName||undefined,
    year:o.objectDate||undefined,category,imageUrl:o.primaryImage,thumbnailUrl:o.primaryImageSmall,
    license:'Public Domain',sourceUrl:o.objectURL||`https://www.metmuseum.org/art/collection/search/${o.objectID}`,
    width:Number(o.primaryImageWidth)||undefined,height:Number(o.primaryImageHeight)||undefined});
  }
  if(artist&&found.length>=32)break;
  if(offset+2<ids.length)await pause(350,signal);
 }
 return found;
};
const cleveland = async (category:Category, signal?:AbortSignal, artist?:string):Promise<Artwork[]> => {
 const term=artist||terms[category].cleveland;if(!term)return [];
 const found:Artwork[]=[];
 for(let skip=0;skip<(artist?400:100);skip+=100){
  if(signal?.aborted)break;
  const params=new URLSearchParams({q:term,has_image:'1',limit:'100',skip:String(skip)});
  const json=await fetchJson(`${clevelandBase}/api/artworks/?${params}`,signal);
  const rows:any[]=json.data||[];
  for(const o of rows){
   if(String(o.share_license_status).toUpperCase()!=='CC0'||!o.images?.web?.url||
    (artist&&!matchesArtist((o.creators||[]).map((c:any)=>c.description||c.name).join(' '),artist)))continue;
   const web=o.images.web;const print=o.images.print;
   found.push({id:`cleveland:${o.id}`,source:'cleveland',title:o.title||'İsimsiz eser',
    artist:o.creators?.map((c:any)=>c.description||c.name).filter(Boolean).join(', ')||undefined,
    year:o.creation_date||undefined,category,imageUrl:print?.url||web.url,thumbnailUrl:web.url,
    license:'CC0 / Public Domain',sourceUrl:o.url||`https://www.clevelandart.org/art/${o.accession_number||o.id}`,
    width:Number(web.width)||undefined,height:Number(web.height)||undefined});
  }
  if(rows.length<100||found.length>=90)break;
 }
 return found;
};
// Rijksmuseum's current search API returns Linked Art identifiers, not artwork records.
// Resolve a small batch and discover its IIIF images from the Linked Art graph.
const rijks = async (category:Category,signal?:AbortSignal):Promise<Artwork[]> => {
  const term=terms[category].rijks;if(!term)return [];
  const params=new URLSearchParams({imageAvailable:'true',description:term});
  const search=await fetchJson(`${rijksBase}/search/collection?${params}`,signal);
  const ids:string[]=(search.orderedItems||[]).map((o:any)=>String(o.id||'').match(/\/(\d+)$/)?.[1]).filter(Boolean).slice(0,16);
  const results:PromiseSettledResult<any>[]=[];
  for(let i=0;i<ids.length;i+=4){
    if(signal?.aborted)break;
    results.push(...await Promise.allSettled(ids.slice(i,i+4).map(id=>fetchJson(`${rijksBase}/${id}?_profile=la-framed`,signal))));
  }
  const textValue=(v:any):string=>{
    if(typeof v==='string')return v;
    if(Array.isArray(v))return v.map(textValue).filter(Boolean).join(', ');
    if(v&&typeof v==='object')return textValue(v.content||v.value||v._label||v.en||v.nl||'');
    return '';
  };
  const items:Artwork[]=[];
  for(let i=0;i<results.length;i++){
    const result=results[i];if(result.status!=='fulfilled')continue;
    const doc=result.value;
    const nodes:any[]=[];const visited=new WeakSet<object>();
    const walk=(v:any,depth:number)=>{
      if(!v||typeof v!=='object'||depth>13||visited.has(v)||nodes.length>1500)return;
      visited.add(v);nodes.push(v);
      if(Array.isArray(v)){for(const child of v)walk(child,depth+1);}
      else for(const child of Object.values(v))walk(child,depth+1);
    };
    walk(doc,0);
    const imageUrls=nodes.flatMap(n=>{
      if(typeof n!=='object'||Array.isArray(n))return [];
      return [n.id,n['@id'],n.service?.id,n.access_point?.id].filter((v):v is string=>typeof v==='string'&&/^https:\/\/iiif\.micr\.io\/[A-Za-z0-9_-]+(?:\/info\.json)?$/.test(v));
    });
    const iiif=imageUrls[0]?.replace(/\/info\.json$/,'');
    if(!iiif)continue;
    const root=doc?.['@graph']?.find?.((n:any)=>n.id===`https://id.rijksmuseum.nl/${ids[i]}`)||doc;
    const title=textValue(root?._label||root?.identified_by?.find?.((n:any)=>n.type==='Name')?.content)||'Rijksmuseum eseri';
    const artist=textValue(root?.produced_by?.carried_out_by?.[0]?._label)||undefined;
    items.push({id:`rijks:${ids[i]}`,source:'rijks',title,artist,category,
      imageUrl:`${iiif}/full/3840,/0/default.jpg`,
      thumbnailUrl:`${iiif}/full/480,/0/default.jpg`,
      license:'Rijksmuseum – kullanım koşullarını doğrulayın',
      sourceUrl:`https://id.rijksmuseum.nl/${ids[i]}`});
  }
  return items;
};

const openverse=async(category:Category,signal?:AbortSignal):Promise<Artwork[]>=>{
 const term=terms[category].openverse;if(!term)return [];
 const params=new URLSearchParams({q:term,page_size:'20',page:'1',license:'cc0,pdm',excluded_source:'wikimedia',mature:'false'});
 const json=await fetchJson(`${openverseBase}/v1/images/?${params}`,signal);
 return (json.results||[]).flatMap((o:any):Artwork[]=>{
  if(!['cc0','pdm'].includes(String(o.license||'').toLowerCase())||/wikimedia/i.test(String(o.source||'')+' '+String(o.provider||'')))return [];
  if(!/^https:\/\//.test(String(o.url||''))||!/^https:\/\//.test(String(o.thumbnail||o.url||'')))return [];
  return [{id:`openverse:${o.id}`,source:'openverse',title:o.title||'İsimsiz görsel',
   artist:o.creator||undefined,category,imageUrl:o.url,thumbnailUrl:o.thumbnail||o.url,
   license:String(o.license).toUpperCase(),attribution:o.attribution||undefined,
   sourceUrl:o.foreign_landing_url||o.detail_url||`https://openverse.org/image/${o.id}`,
   width:Number(o.width)||undefined,height:Number(o.height)||undefined}];
 });
};
const nasa=async(category:Category,signal?:AbortSignal):Promise<Artwork[]>=>{
 const term=terms[category].nasa;if(!term)return [];
 const params=new URLSearchParams({q:term,media_type:'image',page_size:'100',page:'1'});
 const json=await fetchJson(`${nasaBase}/search?${params}`,signal);
 return (json.collection?.items||[]).flatMap((o:any):Artwork[]=>{
  const info=o.data?.[0];const image=o.links?.find((l:any)=>l.rel==='preview'&&/^https:\/\//.test(String(l.href||'')))?.href;
  if(!info||!image||!info.nasa_id)return [];
  return [{id:`nasa:${info.nasa_id}`,source:'nasa',title:info.title||'NASA görseli',
   artist:info.photographer||info.secondary_creator||'NASA',year:info.date_created?.slice(0,4),
   category,imageUrl:image,thumbnailUrl:image,license:'NASA — kullanım kurallarını kontrol edin',
   sourceUrl:`https://images.nasa.gov/details/${encodeURIComponent(info.nasa_id)}`}];
 });
};

const nasaAssetsCache=new Map<string,string>();
/** Resolve NASA's original/large asset only when a slide is actually opened. */
export const resolveArtworkImage=async(art:Artwork,signal?:AbortSignal):Promise<string>=>{
 if(art.source!=='nasa')return art.imageUrl;
 const id=art.id.slice('nasa:'.length);
 const cached=nasaAssetsCache.get(id);if(cached)return cached;
 const json=await fetchJson(`${nasaBase}/asset/${encodeURIComponent(id)}`,signal);
 const urls:string[]=(json.collection?.items||[]).map((v:any)=>v.href).filter((v:any):v is string=>typeof v==='string'&&/^https:\/\//.test(v)&&/\.(?:jpe?g|png)(?:\?|$)/i.test(v));
 const rank=(url:string)=>{
  const file=decodeURIComponent(url.split('/').pop()||'').toLowerCase();
  if(/(?:~|_|-|\b)orig(?:inal)?(?:\.|_|-|\b)/.test(file))return 5;
  if(/(?:~|_|-|\b)large(?:\.|_|-|\b)/.test(file))return 4;
  if(/(?:~|_|-|\b)medium(?:\.|_|-|\b)/.test(file))return 3;
  if(/(?:~|_|-|\b)small(?:\.|_|-|\b)/.test(file))return 2;
  if(/(?:~|_|-|\b)thumb(?:\.|_|-|\b)/.test(file))return 0;
  return 1;
 };
 const best=[...urls].sort((a,b)=>rank(b)-rank(a))[0];
 if(!best)throw new Error('NASA yüksek çözünürlüklü görsel bulunamadı');
 nasaAssetsCache.set(id,best);
 return best;
};
export const loadArtworks = async (source:SourceSelection,category:Category,signal?:AbortSignal):Promise<Artwork[]> => {
  if(source==='all'){
    const active:Source[]=(['met','cleveland','rijks','openverse','nasa'] as Source[]).filter(s=>supported(s,category));
    const results=await Promise.allSettled(active.map(s=>loadArtworks(s,category,signal)));
    if(signal?.aborted) return [];
    const successful=results.filter((r):r is PromiseFulfilledResult<Artwork[]>=>r.status==='fulfilled');
    if(!successful.length){
      const first=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');
      throw first?.reason||new Error('Kaynaklardan eser alınamadı');
    }
    return successful.flatMap(r=>r.value);
  }
  if(!supported(source,category)) return [];
  if(source==='met') return met(category,signal);
  if(source==='cleveland')return cleveland(category,signal);
  if(source==='rijks')return rijks(category,signal);
  if(source==='openverse')return openverse(category,signal);
  return nasa(category,signal);
};
