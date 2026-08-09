# Möbius Chess

React, Three.js ve React Three Fiber ile hazırlanmış, klasik satrancı ve 4 × 16 Möbius şeridi üzerindeki topolojik varyantını içeren web oyunu.

## Çalıştırma

```bash
npm install
npm run dev
```

Üretim derlemesi için:

```bash
npm run build
```

## Oyun modları

- **Klasik:** 8 × 8 tahta, geçerli hamle denetimi, şah/mat/pat, otomatik vezir terfisi ve rok.
- **Möbius:** 4 × 16 kare; uzunluk ekseninden taşan koordinat karşı uçta görünür ve satır indeksi tersine çevrilir. Her tarafın 16 taşı şeridin zıt uçlarında 4 × 4 alana yerleşir.

## Kontroller

- Taşa tıkla, ardından vurgulanan hedef karelerden birini seç.
- Yeşil kareler boş hedefleri, kırmızı kareler taş alma hamlelerini gösterir.
- Fare ile döndür; tekerlek ile yakınlaş/uzaklaş.

## Bot

Bot, özel topolojiye uygun geçerli hamle üretimini kullanan, Alpha-Beta budamalı derinlik-2 Minimax araması yapar. Standart Stockfish/bitboard yapısına bağlı değildir.

## Kural kapsamı

Temel taş hareketleri, şah güvenliği, mat/pat, rok ve otomatik vezir terfisi uygulanır. En passant bu sürümde bulunmaz; Möbius varyantı için terfi, rakibin arka iki sütununa ulaşınca gerçekleşir.
