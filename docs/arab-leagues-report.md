# هل تُغطّي TheSportsDB الدوريات العربية بنقاط «لكل دوري»؟

فُحصت يوم 2026-08-24 بالمفتاح المجاني `123`.

الفحص السابق جرّب نقطة «مباريات اليوم» فأعطت ثلاث مباريات هامشية.
هذا الفحص يسأل عن كل دوري عربي على حدة — وهو سؤال مختلف.

## الدوريات المتاحة

| البلد | الدوري | المعرّف |
|---|---|---|
| Saudi Arabia | Saudi First Division League | `5627` |
| Saudi Arabia | Saudi King Cup | `5649` |
| Saudi Arabia | Saudi Super Cup | `5650` |
| Saudi Arabia | Saudi-Arabian Pro League | `4668` |
| Egypt | Egypt League Cup | `5185` |
| Egypt | Egyptian Premier League | `4829` |
| Qatar | Emir of Qatar Cup | `4971` |
| Qatar | Qatar QSL Cup | `5192` |
| Qatar | Qatar Stars League | `4663` |
| United Arab Emirates | UAE League Cup | `5198` |
| United Arab Emirates | UAE Pro League | `4678` |
| Kuwait | Kuwait Crown Prince Cup | `5189` |
| Kuwait | Kuwait Division 1 | `5213` |
| Kuwait | Kuwait Emir Cup | `5190` |
| Kuwait | Kuwait Premier League | `4823` |
| Jordan | Jordanian Pro League | `5055` |
| Morocco | Moroccan Botola 2 | `4657` |
| Morocco | Moroccan Championship | `4520` |
| Tunisia | Tunisian Ligue 1 | `4828` |
| Algeria | Algerian Ligue 1 | `4753` |
| Iraq | Iraqi Premier League | `5056` |
| Bahrain | Bahrain Premier League | `4826` |
| Oman | Oman Professional League | `5250` |
| ضبط | English Premier League | `4328` |

## هل تُرجع مباريات؟

| الدوري | القادمة | السابقة | الموسم | مثال |
|---|---|---|---|---|
| Saudi First Division League | 1 | 1 | 15 (2026-2027) | Al-Adalah × Al-Tai — 2026-08-26 |
| Saudi King Cup | 0 | 1 | 15 (2025-2026) | Al-Arabi Al-Saudi × Al-Ahli — 2025-08-31 |
| Saudi Super Cup | 0 | 1 | 0 | Al-Nassr × Al-Ahli — 2025-08-23 |
| Saudi-Arabian Pro League | 1 | 1 | 15 (2026-2027) | Neom × Al-Qadsiah — 2026-08-24 |
| Egypt League Cup | 0 | 1 | 0 | ENPPI × Al Masry — 2026-06-08 |
| Egyptian Premier League | 0 | 0 | 0 | — |
| Emir of Qatar Cup | 0 | 0 | 0 | — |
| Qatar QSL Cup | 0 | 0 | 0 | — |
| Qatar Stars League | 0 | 0 | 0 | — |
| UAE League Cup | 0 | 0 | 0 | — |
| UAE Pro League | 0 | 0 | 0 | — |
| Kuwait Crown Prince Cup | 0 | 0 | 0 | — |
| Kuwait Division 1 | 0 | 0 | 0 | — |
| Kuwait Emir Cup | 0 | 0 | 0 | — |
| Kuwait Premier League | 0 | 0 | 0 | — |
| Jordanian Pro League | 0 | 0 | 0 | — |
| Moroccan Botola 2 | 0 | 0 | 0 | — |
| Moroccan Championship | 0 | 0 | 0 | — |
| Tunisian Ligue 1 | 0 | 0 | 0 | — |
| Algerian Ligue 1 | 0 | 0 | 0 | — |
| Iraqi Premier League | 0 | 0 | 0 | — |
| Bahrain Premier League | 0 | 0 | 0 | — |
| Oman Professional League | 0 | 0 | 0 | — |
| English Premier League | 0 | 0 | 0 | — |

## الخلاصة

**2** من **23** دوري عربي ردّ بمباريات قادمة.

وصفّ الضبط ردّ بصفر أيضاً — أي أن نقاط «لكل دوري» محجوبة عن المفتاح المجاني أصلاً، لا أن التغطية العربية ناقصة.

عمود «القادمة» هو الحاسم: إن كان أكبر من صفر لعدّة دوريات فالمصدر
يصلح لبناء جدول عربي **بلا مفتاح من المستخدم**، ويكفي أن نسأل عن كل
دوري مختار بدل نقطة «مباريات اليوم» العامّة. وإن كان صفراً في كلّها
فالنقطة محجوزة للمشتركين، ويبقى API-Football عبر الوسيط هو الطريق.
