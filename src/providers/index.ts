/// <reference types="vite/client" />
import type { Artwork, Category, Source, SourceSelection } from '../types';

// Query mapping is deliberately explicit: not every collection supports every subject.
const terms: Record<Category,{met?:string;cleveland?:string;commons?:string}> = {
 'Mimari':{met:'architecture',cleveland:'architecture',commons:'architecture buildings'},
 'Doğa ve manzara':{met:'landscape',cleveland:'landscape',commons:'landscape nature'},
 'Klasik resim':{met:'painting',cleveland:'painting',commons:'classical painting'},
 'Empresyonizm':{met:'impressionism',cleveland:'impressionism',commons:'impressionist painting'},
 'Uzay ve astronomi':{met:'astronomy',cleveland:'astronomy',commons:'astronomy nebula'},
 'Modern sanat':{met:'modern art',cleveland:'modern art',commons:'modern art'},
 'Şehirler':{met:'city',cleveland:'cityscape',commons:'city skyline'},
 'Japon sanatı':{met:'Japanese art',cleveland:'Japanese prints',commons:'Japanese art'},
 'Hayvanlar':{met:'animals',cleveland:'animals',commons:'wildlife animals'},
 'Fotoğrafçılık':{met:'photograph',cleveland:'photography',commons:'photography'},
 'Soyut sanat':{met:'abstract',cleveland:'abstract',commons:'abstract art'},
 'Tarih':{met:'historical',cleveland:'history',commons:'historic monuments'}
};
export const supported = (source:Source, category:Category) => Boolean(terms[category][source]);
// The Vite proxy is only available while running npm run dev.
// Production/Tizen keeps the original public endpoints until a TV-safe solution is validated.
const metBase=import.meta.env.DEV?'/api/met':'https://collectionapi.metmuseum.org';
const clevelandBase=import.meta.env.DEV?'/api/cleveland':'https://openaccess-api.clevelandart.org';
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
const met = async (category:Category, signal?:AbortSignal):Promise<Artwork[]> => {
  const term=terms[category].met; if(!term) return [];
  // The Met's public Collection API; keep the adapter isolated for future API changes.
  const search=await fetchJson(`${metBase}/public/collection/v1.1/search?hasImages=true&q=${encodeURIComponent(term)}&offset=0&limit=100`,signal);
  const ids:number[]=(search.objectIDs||[]).slice(0,100);
  const objects:PromiseSettledResult<any>[]=[];
  // Avoid flooding the museum endpoint with 100 concurrent requests.
  for(let offset=0;offset<ids.length;offset+=8){
    if(signal?.aborted)break;
    const batch=await Promise.allSettled(ids.slice(offset,offset+8).map(id=>fetchJson(`${metBase}/public/collection/v1/objects/${id}`,signal)));
    objects.push(...batch);
  }
  return objects.flatMap((result):Artwork[]=>{
    if(result.status!=='fulfilled') return [];
    const o=result.value;
    if(!o.isPublicDomain||!o.primaryImageSmall||!o.primaryImage) return [];
    return [{id:`met:${o.objectID}`,source:'met',title:o.title||'İsimsiz eser',artist:o.artistDisplayName||undefined,year:o.objectDate||undefined,category,imageUrl:o.primaryImage,thumbnailUrl:o.primaryImageSmall,license:'Public Domain',sourceUrl:o.objectURL||`https://www.metmuseum.org/art/collection/search/${o.objectID}`,width:Number(o.primaryImageWidth)||undefined,height:Number(o.primaryImageHeight)||undefined}];
  });
};
const cleveland = async (category:Category, signal?:AbortSignal):Promise<Artwork[]> => {
  const term=terms[category].cleveland;if(!term)return [];
  const params=new URLSearchParams({q:term,has_image:'1',limit:'100',skip:'0'});
  // Cleveland's CC0 status is checked per artwork; copyrighted images are excluded.
  const json=await fetchJson(`${clevelandBase}/api/artworks/?${params}`,signal);
  return (json.data||[]).flatMap((o:any):Artwork[]=>{
    if(String(o.share_license_status).toUpperCase()!=='CC0'||!o.images?.web?.url)return [];
    const web=o.images.web;
    const print=o.images.print;
    return [{id:`cleveland:${o.id}`,source:'cleveland',title:o.title||'İsimsiz eser',
      artist:o.creators?.map((c:any)=>c.description||c.name).filter(Boolean).join(', ')||undefined,
      year:o.creation_date||undefined,category,
      imageUrl:print?.url||web.url,thumbnailUrl:web.url,license:'CC0 / Public Domain',
      sourceUrl:o.url||`https://www.clevelandart.org/art/${o.accession_number||o.id}`,
      width:Number(web.width)||undefined,height:Number(web.height)||undefined}];
  });
};
const commons = async (category:Category, signal?:AbortSignal):Promise<Artwork[]> => {
  const term=terms[category].commons; if(!term) return [];
  const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:`filetype:bitmap ${term}`,gsrnamespace:'6',gsrlimit:'50',prop:'imageinfo',iiprop:'url|size|extmetadata',iiurlwidth:'480',format:'json',origin:'*'});
  const pages:any[]=[];
  for(let page=0;page<4;page++){
    const json=await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`,signal);
    pages.push(...Object.values(json.query?.pages||{}));
    const next=json.continue?.gsroffset;
    if(next===undefined||signal?.aborted)break;
    params.set('gsroffset',String(next));
  }
  const allowed=/public domain|cc0|cc by|cc-by|creative commons attribution/i;
  const clean=(html:string)=>html.replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').trim();
  return pages.flatMap((p):Artwork[]=>{
    const i=p.imageinfo?.[0]; if(!i?.url||!i?.thumburl) return [];
    const meta=i.extmetadata||{};
    const license=clean(meta.LicenseShortName?.value||meta.UsageTerms?.value||'');
    if(!allowed.test(license)) return [];
    const mime=String(i.mime||''); if(mime&&!mime.startsWith('image/')) return [];
    const title=String(p.title||'').replace(/^File:/,'').replace(/\.[^.]+$/,'').replace(/_/g,' ');
    return [{id:`commons:${p.pageid}`,source:'commons',title,artist:clean(meta.Artist?.value||'')||undefined,category,imageUrl:i.url,thumbnailUrl:i.thumburl,license,attribution:clean(meta.Attribution?.value||'')||undefined,sourceUrl:i.descriptionurl||`https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,width:Number(i.width)||undefined,height:Number(i.height)||undefined}];
  });
};
export const loadArtworks = async (source:SourceSelection,category:Category,signal?:AbortSignal):Promise<Artwork[]> => {
  if(source==='all'){
    const active:Source[]=(['met','cleveland','commons'] as Source[]).filter(s=>supported(s,category));
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
  if(source==='cleveland') return cleveland(category,signal);
  return commons(category,signal);
};
