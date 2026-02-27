import type { CategoryKey, TemplateBank } from './types.js';

function combine(first: readonly string[], second: readonly string[]): string[] {
  const out: string[] = [];
  for (const a of first) {
    for (const b of second) {
      out.push(`${a} ${b}`.replace(/\s+/g, ' ').trim());
    }
  }
  return out;
}

const trAdviceSummaries: Record<CategoryKey, string[]> = {
  spending: combine(
    [
      '{monthName} görünümünde harcama dinamiği özellikle {topCategory} tarafında belirginleşti.',
      'Bu ay gider akışın, {topCategory} kalemindeki hareketle ritim kazandı.',
      'Aylık tabloda harcama yönünü en çok {topCategory} kategorisi belirliyor.',
      '{monthName} döneminde işlem yoğunluğu {topCategory} etrafında toplandı.',
    ],
    [
      'Gider artışını {spendDeltaPct}% bandında yönetebilmek için haftalık limitleri erken devreye alman faydalı olur.',
      'Bu momentumu kontrollü tutarsan hem marjı korur hem de birikim tarafında alan açarsın.',
      'Küçük ama düzenli düzeltmeler, ay sonu sürprizlerini ciddi biçimde azaltır.',
    ],
  ),
  income: combine(
    [
      '{monthName} döneminde gelir çizgin, geçen döneme göre {incomeDeltaPct}% yönünde güncellendi.',
      'Aylık gelir akışında {incomeDeltaPct}% seviyesinde bir değişim dikkat çekiyor.',
      'Gelir tarafındaki tempo, bu ay finansal planın etkisini doğrudan artırdı.',
      '{monthName} tablosu, gelir hareketinin bütçe kararlarına daha fazla alan açtığını gösteriyor.',
    ],
    [
      'Bu farkı tüketim yerine hedefli birikime yönlendirmek, sürdürülebilirliği güçlendirir.',
      'Gelir oynaklığını hesaba katarak sabit bir transfer planı kurman riski azaltır.',
      'Gelir tarafındaki bu sinyali, borç azaltma ve tampon güçlendirme için kullanman daha verimli olur.',
    ],
  ),
  savings: combine(
    [
      'Mevcut birikim oranın {savingsRatePct}% seviyesinde ve aylık disiplinin görünür hale gelmiş durumda.',
      'Tasarruf performansın {savingsRatePct}% ile ölçülebilir bir çizgiye oturdu.',
      '{monthName} sonunda birikim davranışının net etkisi rakamlara yansıyor.',
      'Birikim tarafındaki mevcut tempo, kısa vadeli hedefleri taşıyabilecek bir temel oluşturuyor.',
    ],
    [
      'Oranı {targetSavingsRatePct}% hedefine kademeli yaklaştırmak için otomatik transfer en güvenli kaldıraçtır.',
      'Tetikleyici bir kural seti kurarsan birikim kararı iradeye değil sisteme bağlı kalır.',
      'Haftalık küçük transferler ile bu çizgiyi kırmadan ilerlemek daha gerçekçi olur.',
    ],
  ),
  risk: combine(
    [
      '{monthName} verilerinde risk sinyalleri daha çok nakit akışı ve kategori yoğunluğunda birikiyor.',
      'Portre genel olarak yönetilebilir olsa da operasyonel risk noktaları net şekilde görünüyor.',
      'Bu dönem finansal riskler, yüksek frekanslı harcama kalıpları etrafında toplanmış durumda.',
      'Aylık görünümde risk haritası; hız, tekrar ve limit aşımı ekseninde şekilleniyor.',
    ],
    [
      'Önleyici adımları erken uygularsan düzeltme maliyeti büyümeden tabloyu sakinleştirebilirsin.',
      'Özellikle alarm eşiklerini aşağı çekmek, risk gerçekleşmeden müdahale etmeni kolaylaştırır.',
      'Bu noktada amaç harcamayı durdurmak değil, kontrol sinyallerini gecikmeden yakalamaktır.',
    ],
  ),
  subscriptions: combine(
    [
      'Düzenli ödemelerin bu ay bütçe esnekliğini hissedilir şekilde daraltıyor.',
      'Abonelik ve tekrar eden ödemeler, aylık nakit manevra alanını sınırlayan ana katman olmuş.',
      '{monthName} içinde sabit giderlerin toplam baskısı günlük kararlarını etkiliyor.',
      'Tekrarlayan maliyetler, görünmeyen bir taban gider gibi çalışarak marjı aşağı çekiyor.',
    ],
    [
      'Kullanım değeri düşük kalemleri sadeleştirmen kısa sürede net rahatlama sağlar.',
      'Her sözleşme için “değer/fiyat” kontrolü yapıp düşük verimlileri düşürmek doğru adımdır.',
      'Sabit giderleri parçalayıp önceliklendirmek, esnek harcama alanını yeniden açar.',
    ],
  ),
  goals: combine(
    [
      '{monthName} döneminde hedef odağı güçlenmiş; artık planı yürütme kalitesi belirleyici olacak.',
      'Hedef tarafında çerçeve doğru, şimdi mesele bu çerçeveyi haftalık aksiyona çevirmek.',
      'Finansal hedeflerin ölçülebilir hale gelmiş durumda; uygulama ritmi sonuçları belirleyecek.',
      'Bu ayki veri seti, hedef planını daha gerçekçi bir takvime bağlamak için uygun.',
    ],
    [
      'Hedefleri mikro adımlara bölmek, motivasyonu değil sistemi çalıştırır.',
      'Takvimlenmiş kontrol noktaları ile ilerlersen sapmaları erken kapatabilirsin.',
      'Planı görünür bir akışa bağlamak, hedeflerin ertelenmesini belirgin biçimde azaltır.',
    ],
  ),
  cashflow: combine(
    [
      '{monthName} kapanışında net nakit sonucu {netAmount} seviyesinde gerçekleşti.',
      'Aylık nakit akışı resmi {netAmount} ile net bir denge sinyali veriyor.',
      'Nakit tarafındaki ana tablo, dönem sonunda {netAmount} olarak ölçüldü.',
      'Bu ayın operasyonel sonucu {netAmount}; bu değer plan kalitesini doğrudan yansıtıyor.',
    ],
    [
      'Önümüzdeki haftalarda gelir-gider senkronunu korumak, oynaklığı aşağı çeker.',
      'Nakit temposunu günlük değil haftalık ritimle yönetmen daha sürdürülebilir olur.',
      'Önce dengeyi sabitleyip sonra hızlanmak, finansal stresi en çok azaltan yaklaşımdır.',
    ],
  ),
  debt: combine(
    [
      'Borç baskısı olan kalemlerde bu ay geri ödeme temposu dikkatli yönetilmeli.',
      'Kredi ve gecikmeli ödeme riski taşıyan kalemler bütçe üzerinde ikinci bir yük oluşturuyor.',
      'Borç tarafındaki akış, nakit marjını daraltan temel unsurlardan biri haline gelmiş.',
      '{monthName} verileri borç planının daha disiplinli bir sırayla yürütülmesi gerektiğini söylüyor.',
    ],
    [
      'Önceliklendirilmiş ödeme sırası kurarsan faiz yükünü daha hızlı kırabilirsin.',
      'Ödeme günlerini gelir akışıyla hizalamak, temerrüt ve ceza riskini düşürür.',
      'Yüksek maliyetli kalemleri önce kapatmak toplam geri ödeme süresini kısaltır.',
    ],
  ),
  investing: combine(
    [
      'Yatırım tarafına geçiş için bu ay daha dengeli bir zemin oluşmuş görünüyor.',
      'Portföy yaklaşımını sade ama tutarlı bir plana bağlamak için uygun bir dönemdesin.',
      '{monthName} verileri, yatırım kararlarının acele değil kural bazlı ilerlemesi gerektiğini destekliyor.',
      'Yatırım odağında fırsat var; fakat risk/likidite dengesini korumak kritik olmaya devam ediyor.',
    ],
    [
      'Kademeli giriş ve çeşitlendirme, performans kadar psikolojik dayanıklılığı da artırır.',
      'Düşük maliyetli ve geniş dağılımlı araçlar bu aşamada daha dengeli sonuç verir.',
      'Acil durum tamponu korunarak ilerlemek, portföy dalgalanmasını daha yönetilebilir yapar.',
    ],
  ),
  budgeting: combine(
    [
      'Bütçe disiplininde bu ay sınır bölgesine yaklaşan kalemler daha görünür hale geldi.',
      'Kategori limitlerinin bir kısmı kritik eşiklere yaklaştığı için erken müdahale önemli.',
      'Bütçe performansında dağılım bozulmadan önce küçük ayarlar yapmak mümkün görünüyor.',
      '{monthName} için limit yönetimi, sonuç kalitesini doğrudan etkileyecek seviyede.',
    ],
    [
      '{overBudgetCount} aşım ve {nearBudgetCount} yakın-limit sinyali, eşiğe dayalı kontrolü zorunlu kılıyor.',
      'Aylık tavanları haftalık alt tavanlara bölmek, taşma riskini ciddi biçimde düşürür.',
      'Harcama hızına göre dinamik limit güncellemesi yapman, ay sonu baskısını azaltır.',
    ],
  ),
};

const trFindings: Record<CategoryKey, string[]> = {
  spending: combine(
    [
      '{topCategory} tarafında işlem frekansı ve tutar birlikte yükselme eğiliminde.',
      'Harcama dağılımında {topCategory} kategorisi oransal ağırlığı artırmış görünüyor.',
      'Bu ay {topCategory} kalemi, toplam giderde sürükleyici rol üstleniyor.',
      '{monthName} içinde harcama sıçramasının merkezi büyük ölçüde {topCategory}.',
    ],
    [
      'Mevcut değişim hızı {spendDeltaPct}% seviyesinde ve bu hız korunursa marjın daralması beklenir.',
      'Bu patern kısa vadede nakit esnekliğini zayıflatabilir; erken frene ihtiyaç var.',
      'Kategori bazlı mikro-limit uygulanırsa trend çok daha hızlı dengelenebilir.',
    ],
  ),
  income: combine(
    [
      'Gelir akışındaki yön değişimi bu dönemde planı yeniden kalibre etmeyi gerektiriyor.',
      'Aylık gelir verisi, nakit projeksiyonunun tek senaryoyla yönetilmemesi gerektiğini gösteriyor.',
      'Gelir tarafındaki {incomeDeltaPct}% fark, bütçe dayanıklılığını doğrudan etkiliyor.',
      'Bu ay gelir ritminde görülen değişim, harcama kararlarının zamanlamasını kritik hale getirdi.',
    ],
    [
      'Sabit gider kararları alınırken bu oynaklık mutlaka güvenlik payıyla ele alınmalı.',
      'Gelir kaynağı çeşitlendirmesi ve koruyucu tampon, dalga etkisini azaltır.',
      'Nakit planı haftalık güncellenirse sürpriz sapmalar daha erken yakalanır.',
    ],
  ),
  savings: combine(
    [
      'Tasarruf oranı {savingsRatePct}% seviyesinde ölçülüyor ve düzenli takip görünür.',
      'Birikim performansı mevcut akışta korunuyor; fakat ivme için ek disiplin gerekli.',
      'Aylık birikim davranışı rakamsal olarak net ve ölçülebilir bir çerçeveye oturmuş durumda.',
      'Mevcut birikim çizgisi, hedefe yaklaşım için doğru zemini oluşturuyor.',
    ],
    [
      '{targetSavingsRatePct}% hedefiyle aradaki farkı kapatmak için otomasyon etkisi belirleyici olur.',
      'Düzenli küçük transferler, tek seferlik büyük hamlelere göre daha yüksek gerçekleşme sağlar.',
      'Tasarruf kararının takvime bağlanması, oranı istikrarlı biçimde yukarı taşır.',
    ],
  ),
  risk: combine(
    [
      'Risk göstergeleri daha çok hızlanan kalemlerde ve tekrar eden işlemlerde toplanıyor.',
      'Bu dönem risk profili, reaktif değil proaktif kontrol gerektiren bir yapıya döndü.',
      'Operasyonel risk sinyalleri, limit aşımı ve ani sıçrama kombinasyonuyla görünür hale geldi.',
      '{monthName} verileri risklerin tek bir kalemden değil, dağıtık davranıştan geldiğini söylüyor.',
    ],
    [
      'Uyarı eşikleri erken çalıştırılırsa geri dönüş maliyeti belirgin biçimde düşer.',
      'Riskin büyümesini engellemenin en etkili yolu, alarm noktasını eyleme çevirmektir.',
      'Özellikle yüksek frekanslı işlemlerde “dur-kontrol et” kuralı kritik değer taşır.',
    ],
  ),
  subscriptions: combine(
    [
      'Sabit ödeme kalemleri esnek bütçe katmanını daraltan ana baskı unsuru olmuş.',
      'Abonelik yoğunluğu, küçük görünse de birleşik etkide marjı aşağı çekiyor.',
      'Tekrarlı ödemeler bu ay karar alanını sınırlayan görünmez bir yük üretiyor.',
      'Düzenli faturaların toplam etkisi, nakit akışının rahatlığını azaltmış durumda.',
    ],
    [
      'Düşük kullanım oranlı hizmetler sadeleştirildiğinde hızlı bir rahatlama beklenir.',
      'Sözleşme/plan revizyonu ile aynı hizmeti daha düşük maliyetle sürdürmek mümkün.',
      'Ödeme takvimi optimize edilirse sabit gider baskısı daha yönetilebilir hale gelir.',
    ],
  ),
  goals: combine(
    [
      'Hedef tasarımı netleşmiş; odak artık uygulama tutarlılığında.',
      'Plan kağıt üzerinde güçlü, ancak haftalık yürütme kalitesi sonucu belirleyecek.',
      'Hedefler ölçülebilir olduğu için ilerleme takibi daha objektif yapılabilir.',
      'Bu ayki çerçeve, hedefleri davranış rutinine dönüştürmek için uygun bir zemin sunuyor.',
    ],
    [
      'Ara kilometre taşları tanımlanırsa hedef sapması çok daha erken düzeltilir.',
      'Görsel takip mekanizması motivasyon kaybını azaltır ve istikrarı artırır.',
      'Hedeflerin öncelik sırası belirlenirse karar yorgunluğu belirgin biçimde düşer.',
    ],
  ),
  cashflow: combine(
    [
      'Net nakit sonucu {netAmount} ile dönem kapanışını belirliyor.',
      'Nakit akışındaki nihai denge {netAmount} seviyesinde ölçüldü.',
      '{monthName} için operasyonel bakiye {netAmount} olarak kapanmış görünüyor.',
      'Bu ayın ana finansal çıktısı {netAmount}; planlama kalitesi bu değerde okunuyor.',
    ],
    [
      'Gelir-gider zamanlaması iyileştirilirse aynı gelirde daha sakin bir akış elde edilir.',
      'Nakit çıkışlarını kümeler halinde yönetmek, dönem içi baskıyı azaltır.',
      'Haftalık akış takibi ile denge bozulmadan düzeltme yapmak mümkün olur.',
    ],
  ),
  debt: combine(
    [
      'Borç yükü taşıyan kalemler likidite üzerinde ikincil bir baskı katmanı oluşturuyor.',
      'Geri ödeme yoğunluğu, serbest nakit alanını beklenenden daha hızlı eritiyor.',
      'Borç servis ritmi bu ay bütçe esnekliğini sınırlandıran önemli bir faktör.',
      'Kredi/borç odaklı çıkışlar, diğer hedeflere ayrılacak payı daraltmış durumda.',
    ],
    [
      'Yüksek maliyetli kalemleri öne almak toplam finansman giderini düşürür.',
      'Ödeme planının gelir günleriyle eşleşmesi gecikme riskini belirgin azaltır.',
      'Planlı kapatma sırası uygulanırsa borç baskısında daha hızlı gevşeme görülür.',
    ],
  ),
  investing: combine(
    [
      'Yatırım tarafında kural bazlı ilerleme için veri kalitesi yeterli seviyeye gelmiş görünüyor.',
      'Portföy kararlarını daha sistematik almak için bu ay uygun bir zaman penceresi sunuyor.',
      'Yatırım perspektifinde fırsat mevcut; ancak risk tamponu korunmalı.',
      'Likidite ve getiri dengesi birlikte ele alındığında daha sürdürülebilir bir rota oluşuyor.',
    ],
    [
      'Tek seferde büyük pozisyon yerine kademeli yaklaşım dalgalanmayı yumuşatır.',
      'Çeşitlendirme ve maliyet disiplini, uzun vadeli performansın temelidir.',
      'Yatırım planı acil durum fonuyla birlikte yürütülürse stres seviyeleri düşer.',
    ],
  ),
  budgeting: combine(
    [
      'Limit kullanımında birden fazla kategori kritik eşiğe yaklaşmış durumda.',
      'Bütçe dağılımı halen yönetilebilir, fakat bazı kalemlerde erken sinyal var.',
      '{monthName} içinde limit davranışı, ay sonu sapma riskini artırabilecek bir profile döndü.',
      'Kategori bazında kullanım hızı, toplam bütçe kalitesini aşağı çekebilecek düzeye ulaştı.',
    ],
    [
      '{overBudgetCount} aşım ve {nearBudgetCount} yakın-limit kaydı, mikro-plan ihtiyacını doğruluyor.',
      'Tavanları haftalara bölmek kontrol kaybını engelleyen en pratik yöntem olur.',
      'Erken uyarı eşiğiyle hareket edilirse ay sonu düzeltme yükü belirgin azalır.',
    ],
  ),
};

const trActions: Record<CategoryKey, string[]> = {
  spending: combine(
    [
      '{topCategory} kategorisinde günlük harcama sınırı tanımla ve bu sınırı görünür bir yerde takip et.',
      'Bu hafta {topCategory} için “tek işlem üst limiti” kuralı uygula.',
      '{topCategory} kalemindeki işlemleri haftalık iki pencereye toplayarak dağınık harcamayı azalt.',
      '{monthName} boyunca {topCategory} işlemlerinde bildirim eşiklerini daha erken seviyeye çek.',
    ],
    [
      'Böylece {spendDeltaPct}% yönündeki ivmeyi kırıp marjı koruyabilirsin.',
      'Bu adım kısa sürede bütçe disiplinini tekrar görünür hale getirir.',
      'Erken kontrol sayesinde ay sonu düzeltme ihtiyacı ciddi ölçüde azalır.',
    ],
  ),
  income: combine(
    [
      'Gelir geldiği gün otomatik olarak iki parçalı dağıtım kuralı tanımla.',
      'Gelir artışı görülen dönemlerde ek tutarı doğrudan hedef hesabına yönlendir.',
      'Aylık gelir planını tek senaryo yerine temel ve temkinli olmak üzere iki senaryoya ayır.',
      'Gelir akışı değiştiğinde sabit gider kararlarını 72 saat gecikmeli vererek esneklik yarat.',
    ],
    [
      'Bu yöntem {incomeDeltaPct}% değişimlerde bile kontrolü kaybetmemen için güvenlik sağlar.',
      'Böylece harcama temposu gelirden bağımsız şekilde stabilize olur.',
      'Kararları veri geldikçe güncellemek, sürpriz açık riskini azaltır.',
    ],
  ),
  savings: combine(
    [
      'Her hafta aynı gün küçük ama sabit bir birikim transferi başlat.',
      'Tasarruf tutarını aylık hedef yerine haftalık mini hedeflere böl.',
      'Birikim transferini manuel karardan çıkarıp otomatik kural haline getir.',
      'İsteğe bağlı harcamadan önce minimum birikim adımı tamamlanmadan işlem yapma kuralı koy.',
    ],
    [
      'Bu yaklaşım {savingsRatePct}% oranını {targetSavingsRatePct}% hedefine yaklaştırır.',
      'Sistematik akış, dalgalı aylarda bile birikim davranışını korur.',
      'Küçük ama sürekli adımlar uzun vadede daha yüksek gerçekleşme üretir.',
    ],
  ),
  risk: combine(
    [
      'Uyarı eşiklerini kategori bazında bir kademe daha erken seviyeye çek.',
      'Yüksek frekanslı işlemler için “önce onay, sonra ödeme” ara adımı ekle.',
      'Aylık bütçede riskli kalemleri ayrı bir izleme panosunda topla.',
      'Bu hafta yalnızca üç ana kaleme odaklı bir kontrol sprinti uygula.',
    ],
    [
      'Bu sayede risk büyümeden müdahale etme şansın artar.',
      'Erken sinyal yaklaşımı, finansal stresi reaktif olmadan yönetmeni sağlar.',
      'Operasyonel disiplini artırdığında beklenmedik sapmalar hızla azalır.',
    ],
  ),
  subscriptions: combine(
    [
      'Abonelik listesini “kullanım”, “zorunluluk” ve “alternatif” başlıklarıyla yeniden sınıflandır.',
      'Bu hafta en az bir düşük kullanım aboneliğini askıya al.',
      'Tekrarlı ödemelerde yıllık/aylık plan karşılaştırması yapıp pahalı planı düşür.',
      'Aynı amaca hizmet eden iki servisi tek pakette birleştir.',
    ],
    [
      'Sabit gider tabanını küçültmek, esnek harcama alanını hızla geri açar.',
      'Bu adım birkaç hafta içinde nakit rahatlığını görünür biçimde artırır.',
      'Düzenli giderlerdeki küçük indirimler toplam sonuçta büyük fark yaratır.',
    ],
  ),
  goals: combine(
    [
      'Aylık hedefini haftalık yapılabilir adımlara böl ve her adımı takvime yaz.',
      'Hedef listesinde en yüksek etkili iki kalemi “önce tamamla” kuralıyla sırala.',
      'Her pazar 10 dakikalık hedef kontrol ritüeli planla.',
      'Hedef performansını ölçmek için basit bir gösterge tablosu oluştur.',
    ],
    [
      'Böylece hedefler niyet olmaktan çıkıp operasyonel plana dönüşür.',
      'Ritmik takip, erteleme davranışını belirgin biçimde azaltır.',
      'Düzenli görünürlük, karar kalitesini ve uygulama tutarlılığını artırır.',
    ],
  ),
  cashflow: combine(
    [
      'Gelir ve gider günlerini haftalık akış tablosunda karşılıklı hizala.',
      'Nakit çıkışlarını tek güne yığmak yerine kontrollü dağıt.',
      'Ay içi bakiye için alt-limit alarmı tanımla.',
      'Büyük tutarlı ödemeleri gelirden hemen sonra planlayarak tamponu koru.',
    ],
    [
      'Bu düzen {netAmount} sonucunu daha öngörülebilir hale getirir.',
      'Akış dengesi iyileştikçe kısa vadeli finansal stres azalır.',
      'Zamanlama optimizasyonu, aynı gelirde daha yüksek kontrol sağlar.',
    ],
  ),
  debt: combine(
    [
      'Borç kalemlerini faiz maliyetine göre yüksekten düşüğe sırala.',
      'Gelir gününe yakın otomatik minimum ödeme kuralı tanımla.',
      'Ek ödeme yapabildiğin haftalarda yalnızca en pahalı borca odaklan.',
      'Borç ödeme takvimini aylık değil haftalık kontrol et.',
    ],
    [
      'Bu strateji toplam geri ödeme süresini kısaltır.',
      'Faiz baskısını önce kırmak nakit alanını daha hızlı rahatlatır.',
      'Daha düzenli plan, gecikme cezası riskini aşağı çeker.',
    ],
  ),
  investing: combine(
    [
      'Yatırım kararlarını sabit aralıklı küçük alımlarla uygula.',
      'Portföyde tek varlık yoğunluğunu azaltıp dağılımı genişlet.',
      'Yeni pozisyon öncesi acil durum tamponu eşiğini kontrol et.',
      'Yatırım planı için çeyreklik gözden geçirme takvimi belirle.',
    ],
    [
      'Kademeli yaklaşım dalgalı dönemlerde karar kalitesini korur.',
      'Çeşitlendirme, getiriyi değil öncelikle dayanıklılığı güçlendirir.',
      'Likiditeyi koruyarak ilerlemek stratejinin sürdürülebilirliğini artırır.',
    ],
  ),
  budgeting: combine(
    [
      'Aşım riski yüksek kategoriler için haftalık mikro-limit belirle.',
      'Kategori uyarı eşiğini %80 seviyesine çek ve bildirimleri aktif tut.',
      'Limitleri son üç aylık ortalamaya göre yeniden kalibre et.',
      'Yakın-limit kalemlerde işlem başı üst sınır kuralı koy.',
    ],
    [
      '{overBudgetCount} aşım ve {nearBudgetCount} yakın-limit baskısını kısa sürede azaltabilirsin.',
      'Bu yöntem ay sonu toplu kesinti ihtiyacını önemli ölçüde düşürür.',
      'Erken ve küçük düzeltmeler bütçe disiplinini daha sürdürülebilir yapar.',
    ],
  ),
};

const trGenericAdviceSummaries = combine(
  [
    '{monthName} finansal resmi, karar kalitesinin sonucu nasıl etkilediğini net biçimde gösteriyor.',
    'Aylık tablo genel olarak yönetilebilir; şimdi odak uygulama tutarlılığında olmalı.',
    'Bu dönem verileri, küçük düzenlemelerin büyük sapmaları önleyebileceğini doğruluyor.',
    'Finansal disiplinin görünür; bu disiplini kural bazlı akışa çevirmek için doğru zamandasın.',
    'Rakamlar tek başına değil, ritim ve karar düzeniyle birlikte yorumlandığında daha anlamlı hale geliyor.',
    'Bu ayki sonuçlar, kısa vadeli plan ile orta vadeli hedeflerin birlikte taşınabileceğini gösteriyor.',
  ],
  [
    'Önceliği yüksek etkili iki aksiyona vermen, tüm tabloyu daha hızlı iyileştirir.',
    'Haftalık kısa kontrol döngüsü kurman, ay sonu stresi belirgin şekilde azaltır.',
    'Kararlarını otomasyona taşıdıkça sürdürülebilir performans elde etmen kolaylaşır.',
    'Disiplinli bir izleme yapısıyla aynı gelirde daha sağlıklı bir marj yaratabilirsin.',
  ],
);

const trGenericFindings = combine(
  [
    'Kategori davranışında hız, tekrar ve tutar üçlüsü birlikte sonucu belirliyor.',
    'Aylık veride en güçlü sinyal, küçük işlemlerin birikimli etkisinden geliyor.',
    'Nakit dengesini korumak için zamanlama ve limit yönetimi birlikte ele alınmalı.',
    'Risk göstergeleri çoğunlukla kontrol noktası geciktiğinde büyüyor.',
    'Birikim başarısı tek hamlede değil düzenli tekrar eden adımlarda oluşuyor.',
    'Bu dönem sonuçları, planın kaliteli olduğunu fakat uygulama ritminin kritik olduğunu gösteriyor.',
  ],
  [
    'Erken müdahale edildiğinde düzeltme maliyeti dramatik biçimde düşer.',
    'Haftalık takip davranışı, aylık sapmaları görünür hale getirir.',
    'Veri odaklı küçük ayarlar, sonuç kalitesini hızlıca yukarı taşır.',
    'Sistematik kontrol, belirsizliği yönetilebilir bir aralığa indirir.',
  ],
);

const trGenericActions = combine(
  [
    'Bu hafta yalnızca üç metrik seç: nakit denge, kategori limiti ve birikim transferi.',
    'Her akşam 2 dakikalık hızlı kontrol ile o günün sapmasını kaydet.',
    'Önce zorunlu ödemeler, sonra hedef transfer, en sonda isteğe bağlı harcama akışı kur.',
    'Aylık bütçeyi haftalık dilimlere bölerek kararlarını sadeleştir.',
    'Harcama kararlarında 24 saat bekleme kuralını yalnızca değişken kalemlerde uygula.',
    'Bir sonraki gelir gününe kadar “limit dışı harcama yok” prensibini devreye al.',
  ],
  [
    'Bu basit akış karar yorgunluğunu azaltır.',
    'Kısa sürede daha öngörülebilir bir finansal ritim yakalarsın.',
    'Aksiyonları ölçülebilir tuttuğunda uygulama oranı belirgin yükselir.',
    'Planın sürdürülebilirliğini artırırken stresi düşürür.',
  ],
);

export const templateBankTr: TemplateBank = {
  adviceSummaries: trAdviceSummaries,
  findings: trFindings,
  actions: trActions,
  generic: {
    adviceSummaries: trGenericAdviceSummaries,
    findings: trGenericFindings,
    actions: trGenericActions,
  },
};

