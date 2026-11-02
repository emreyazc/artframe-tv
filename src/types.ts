export type Source = 'met' | 'chicago' | 'commons';
export type SourceSelection = Source | 'all';
export type Category = 'Mimari' | 'Doğa ve manzara' | 'Klasik resim' | 'Empresyonizm' | 'Uzay ve astronomi' | 'Modern sanat' | 'Şehirler' | 'Japon sanatı' | 'Hayvanlar' | 'Fotoğrafçılık' | 'Soyut sanat' | 'Tarih';
export type Artwork = { id:string; source:Source; title:string; artist?:string; year?:string; category:Category; imageUrl:string; thumbnailUrl:string; license:string; attribution?:string; sourceUrl:string; width?:number; height?:number };
export type Preferences = { sources:Source[]; categories:Category[]; interval:number; fit:'contain'|'cover'|'frame'; preferWide:boolean; showInfo:boolean; shuffle:boolean };
export const categories:Category[] = ['Mimari','Doğa ve manzara','Klasik resim','Empresyonizm','Uzay ve astronomi','Modern sanat','Şehirler','Japon sanatı','Hayvanlar','Fotoğrafçılık','Soyut sanat','Tarih'];
export const sourceNames:Record<SourceSelection,string> = {all:'Tüm kaynaklar',met:'The Met',chicago:'Art Institute of Chicago',commons:'Wikimedia Commons'};
export const defaults:Preferences = {sources:['met','chicago','commons'],categories:[...categories],interval:30,fit:'frame',preferWide:true,showInfo:true,shuffle:false};
