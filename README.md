# ArtFrame TV — v0.1

Samsung QN70F (Tizen 9.0) için ücretsiz sanat galerisi hobi projesi.

## Gereksinimler
- Node.js 20+ ve npm
- TV'ye yüklemek için Tizen Studio, Samsung TV Extension ve geliştirici sertifikası

## Bilgisayarda çalıştır
```bash
npm install
npm run dev
```
Tarayıcıdan terminalde görünen `http://localhost:5173` adresini aç.

## Üretim derlemesi
```bash
npm run build
```
`dist/` içinde Tizen `config.xml` dahil statik Web App dosyaları üretilir. Tizen Studio'da **TV Web Application** projesi oluşturup `dist/` içeriğini proje köküne taşıyarak sertifikanla `.wgt` paketle. Alternatif olarak Tizen CLI kurulumunda uygun TV profilini seçerek `tizen package -t wgt -s <certificate-profile> -- <build-directory>` komutunu kullan. Tizen Studio/CLI sürümüne göre paketleme adımları değişebilir.

## Tizen TV Emulator
Tizen Studio > Package Manager'dan Samsung TV Extension ve TV Emulator'ü yükle; Emulator Manager'dan bir TV imajı oluştur. Emülatör web uygulaması davranışını test eder; gerçek QN70F sistem ekran koruyucu ve performans davranışlarını birebir temsil etmez.

## Kumanda
- Galeri: yön tuşları ile kart seçimi, Enter ile açma.
- Sanat modu: sağ/sol eser değiştirir; Enter veya Space duraklatır; yukarı/aşağı bilgi katmanını değiştirir; Geri/Escape galeriye döner.
- Tarayıcıda fareyle de kullanılabilir.

## Veri kaynakları
- The Met Collection API (`collectionapi.metmuseum.org`): yalnızca `isPublicDomain` işaretli eserler.
- Art Institute of Chicago API: yalnızca `is_public_domain` eserler, IIIF görseller.
- Wikimedia Commons MediaWiki API: izin verilen lisans etiketleri, eser bazında kaynak ve atıf bilgisi.

**Önemli:** API ve CORS davranışları zamanla değişebilir. Özellikle Wikimedia dosyalarının lisans bilgilerini yeniden doğrulayın; CC BY görsellerde uygun atıf gerekir. Commons'ta yalnızca basit lisans etiketleri filtrelenir, hukuki doğrulama yapılmaz. The Met ve Chicago API'leri için gerçek TV'de erişim testleri gereklidir. Bazı koleksiyonlar az/boş sonuç verebilir. API erişimi başarısız olursa uygulama hata gösterir; sahte veri sunmaz.

## Mevcut sınırlar
- Sistem genelinde otomatik ekran koruyucu/TV arka planında başlatma **henüz yok**; Tizen Web App yetkileri nedeniyle ayrı araştırma gerektirir.
- Çevrimdışı görsel önbelleği, çoklu kaynakları tek listede karıştırma ve favorileri ayrı galeri olarak açma henüz yok. Favori kimlikleri yerel depolanır.
- `config.xml` içindeki uygulama kimliği geliştirme amaçlıdır; yayınlama ve sertifika işlemlerinde güncelleme gerekebilir.
- Web tarayıcıları bazı uzak görsel isteklerini CORS nedeniyle engelleyebilir.

## Lisans
Kod MIT lisanslıdır. Sanat eserleri kendi kaynak lisanslarına tabidir.
