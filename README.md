# Möbius Chess

React, Three.js ve React Three Fiber ile hazırlanmış; hem klasik 8×8 satranç hem de 4×16 Möbius şeridi üzerinde oynanabilen 3B satranç denemesi.

## Çalıştırma

```bash
npm install
npm run dev
```

Üretim derlemesi:

```bash
npm run build
```

## Modlar

- **Klasik Satranç:** 8×8 standart tahta ve resmî kurallar.
- **Möbius Satranç:** 4×16 kare. Şeridin bir turunda 8 sütun vardır; 16 sütun iki turda kapanır, böylece taşlar şeridin iki yüzünde de durur. Satırlar sınırlıdır, sütunlar halka gibi döner.

### Möbius başlangıç dizilimi

Her iki ordu da piyonlarla çevrilidir. Beyaz 0-3, siyah ise aynası olarak 8-11. sütunlardadır; aralarında iki yanda da 4'er boş sütun kalır.

| Satır | 0 | 1 | 2 | 3 | 4-7 | 8 | 9 | 10 | 11 | 12-15 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | P | R | R | P | boş | P | R | R | P | boş |
| 1 | P | N | N | P | boş | P | N | N | P | boş |
| 2 | P | B | B | P | boş | P | B | B | P | boş |
| 3 | P | Q | K | P | boş | P | K | Q | P | boş |

Piyonlar dışa doğru ilerler ve klasik satrançtaki gibi 6 kare sonra terfi eder. Rok yoktur; geçerken alma vardır.

### Kurallar

İki modda da geçerken alma, terfide taş seçimi, pat, üç kez aynı konum, 50 hamle kuralı ve yetersiz taş beraberliği uygulanır. Klasik modun hamle üretimi, yayımlanmış perft sayımlarıyla test edilir.

### Oynanış

Bota karşı (kolay ya da zor) beyaz veya siyahla, aynı cihazda iki kişi ya da online oynanabilir. Süren oyun otomatik kaydedilir, sayfa yenilense de devam eder. Telefonda dik ve yatay tutuş desteklenir. Möbius modunda şeridin her zaman bir kısmı görünmez; bu yüzden altta tüm tahtayı gösteren, tıklanabilir bir düz harita vardır. Kamera görünmeyen hamleleri kendisi gösterir, panelden kapatılabilir.

## Online oyun

Online oyun Supabase kullanır: anonim giriş, 6 haneli oda kodu, davet bağlantısı ve hızlı eşleşme. Bağlantı ayarlanmamışsa oyunun geri kalanı yine çalışır.

1. Bir Supabase projesi aç ve **Authentication → Sign In / Providers** altında **Anonymous Sign-Ins** seçeneğini aç.
2. `supabase/migrations/20261104_001_online_chess.sql` dosyasının tamamını **SQL Editor**'da çalıştır.
3. **Project URL** ve **publishable/anon key** değerlerini `.env.example` dosyasındaki adlarla Vercel'in **Environment Variables** bölümüne ve yerelde `.env.local` dosyasına yaz. `service_role` anahtarını asla yazma.

Hamlelerin kurallara uygunluğunu iki oyuncunun uygulaması da denetler; sunucu sıra, oyuncu ve oyun durumunu denetler. Ücretsiz proje boşta kalınca duraklamasın diye `api/keepalive.js` günde bir kez çalışır.

## Testler

```bash
npm test
npm run test:full
```

`test:full`, 1000'er rastgele oyunluk uzun testi ve online veritabanı testlerini de çalıştırır.
