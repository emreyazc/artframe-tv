import type { Artwork, Category, Source, SourceSelection } from '../types';

// Query mapping is deliberately explicit: not every collection supports every subject.
const terms: Record<Category,{met?:string;chicago?:string;commons?:string}> = {
  'Mimari':{commons:'architecture buildings'},
  'Doğa ve manzara':{met:'landscape painting',chicago:'landscape',commons:'landscape nature'},
  'Klasik resim':{met:'oil painting',chicago:'painting'},
  'Empresyonizm':{met:'impressionism',chicago:'impressionism'},
  'Uzay ve astronomi':{commons:'astronomy nebula'},
  'Modern sanat':{met:'modern art',chicago:'modern art'},
  'Şehirler':{commons:'city skyline'},
  'Japon sanatı':{met:'Japanese art',chicago:'Japanese prints'},
  'Hayvanlar':{met:'animals painting',commons:'wildlife animals'},
  'Fotoğrafçılık':{chicago:'photography',commons:'photography'},
  'Soyut sanat':{met:'abstract art',chicago:'abstract'},
  'Tarih':{met:'historical artifacts',commons:'historic monuments'}
};
export const supported = (source:Source, category:Category) => Boolean(terms[category][source]);
const fetchJson = async (url:string, signal?:AbortSignal) => {
  const response = await fetch(url,{signal,headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};
const met = async (category:Category, signal?:AbortSignal):Promise<Artwork[]> => {
  const term=terms[category].met; if(!term) return [];
  // The Met's public Collection API; keep the adapter isolated for future API changes.
  const search=await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=${encodeURIComponent(term)}&offset=0&limit=100`,signal);
  const ids:number[]=(search.objectIDs||[]).slice(0,28);
  const objects=await Promise.allSettled(ids.map(id=>fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`,signal)));
  return objects.flatMap((result):Artwork[]=>{
    if(result.status!=='fulfilled') return [];
    const o=result.value;
    if(!o.isPublicDomain||!o.primaryImageSmall||!o.primaryImage) return [];
    return [{id:`met:${o.objectID}`,source:'met',title:o.title||'İsimsiz eser',artist:o.artistDisplayName||undefined,year:o.objectDate||undefined,category,imageUrl:o.primaryImage,thumbnailUrl:o.primaryImageSmall,license:'Public Domain',sourceUrl:o.objectURL||`https://www.metmuseum.org/art/collection/search/${o.objectID}`,width:Number(o.primaryImageWidth)||undefined,height:Number(o.primaryImageHeight)||undefined}];
  });
};
const chicago = async (category:Category, signal?:AbortSignal):Promise<Artwork[]> => {
  const term=terms[category].chicago; if(!term) return [];
  const params=new URLSearchParams({q:term,limit:'40',fields:'id,title,artist_display,date_display,image_id,is_public_domain,api_link,dimensions','query[term][is_public_domain]':'true'});
  // Public-domain filtering is also enforced locally.
  const json=await fetchJson(`https://api.artic.edu/api/v1/artworks/search?${params.toString()}`,signal);
  const base=(json.config?.iiif_url as string)||'https://www.artic.edu/iiif/2';
  return (json.data||[]).filter((o:any)=>o.is_public_domain&&o.image_id).map((o:any):Artwork=>({id:`chicago:${o.id}`,source:'chicago',title:o.title||'İsimsiz eser',artist:o.artist_display||undefined,year:o.date_display||undefined,category,imageUrl:`${base}/${o.image_id}/full/1680,/0/default.jpg`,thumbnailUrl:`${base}/${o.image_id}/full/480,/0/default.jpg`,license:'CC0 / Public Domain',sourceUrl:`https://www.artic.edu/artworks/${o.id}`}));
};
const commons = async (category:Category, signal?:AbortSignal):Promise<Artwork[]> => {
  const term=terms[category].commons; if(!term) return [];
  const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:`filetype:bitmap ${term}`,gsrnamespace:'6',gsrlimit:'32',prop:'imageinfo',iiprop:'url|size|extmetadata',iiurlwidth:'480',format:'json',origin:'*'});
  const json=await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`,signal);
  const pages:any[]=Object.values(json.query?.pages||{});
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
    const active:Source[]=(['met','chicago','commons'] as Source[]).filter(s=>supported(s,category));
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
  if(source==='chicago') return chicago(category,signal);
  return commons(category,signal);
};
