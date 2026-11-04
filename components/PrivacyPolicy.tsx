export function PrivacyPolicy({ onBack }: { onBack: () => void }) {
  return (
    <div className="menu-content privacy-policy">
      <button className="back-button" type="button" onClick={onBack}>← Ana sayfaya dön</button>
      <h2>Privacy Policy</h2>
      <p>Bu metin, Möbius Chess'in web sürümünün hangi verileri kullandığını açıklar.</p>

      <h3>Hesap ve Kişisel Veriler</h3>
      <p>Oyun hesap, e-posta, şifre veya takma ad istemez. Bota karşı ve aynı cihazda iki kişilik oyun için internet hesabı açılmaz.</p>

      <h3>Tarayıcıda Saklanan Veriler</h3>
      <p>Devam eden oyunun hamleleri ve ses ayarı tarayıcının <b>localStorage</b> alanında, cihazında saklanır. Online oynadığında anonim oturum bilgisi de burada tutulur. Tarayıcı verilerini temizlemek bunları siler.</p>

      <h3>Online Oyun</h3>
      <p>Online oynamayı seçersen <b>Supabase</b> üzerinde sana rastgele bir anonim kimlik açılır. Oyun için anonim kimlik, oda kodu, seçilen mod ve renk, hamleler ve oyun sonucu orada saklanır. Bu bilgileri yalnızca oyunun iki oyuncusu görebilir.</p>
      <p>Davet bağlantısı oda kodunu içerir; bağlantıya sahip olan kişi boş odaya katılabilir. Bir gündür başlamayan odalar ve 30 gündür güncellenmeyen oyunlar, biri yeni oda açtığında silinir. Anonim kimliğin kendisi otomatik silinmez.</p>

      <h3>Harici Hizmetler</h3>
      <p>Site <b>Vercel</b> üzerinde yayınlanır; bu hizmet güvenlik ve işletim için standart erişim kayıtları tutabilir. Yazı tipleri <b>Google Fonts</b> üzerinden yüklenir, bu sırada IP adresin Google'a ulaşır. Geliştirici bağlantısı seni yalnızca tıklarsan LinkedIn'e götürür.</p>

      <h3>Çerez, Analitik ve Reklam</h3>
      <p>Oyun çerez, reklam, Google Analytics veya benzeri bir takip aracı kullanmaz.</p>

      <h3>Değişiklikler</h3>
      <p>Yeni veri kullanan özellikler eklendiğinde bu metin güncellenir.</p>
      <p className="policy-date">Son güncelleme: 4 Kasım 2026</p>
    </div>
  );
}
