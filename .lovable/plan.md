

# تعديل توقيت الصواريخ + منع تداخل التحذيرات السينمائية

## التغييرات

### 1. `src/game/engine.ts` — تقليل وقت ظهور الصواريخ
- سطر 81: `15 + Math.random() * 10` → `5 + Math.random() * 5` (5-10 ثوانٍ)
- سطر 143: نفس التغيير في `resetGame`

### 2. `src/game/engine.ts` — فصل الأحداث المتزامنة (الدرونز والكلاسترز)
حالياً `clusters` و `drones_scout` كلاهما عند 85 ثانية، و`drones_tracker` و`cluster_3` عند 145، و`drones_bomber` و`cluster_4` عند 205. يجب فصلهم:

| الحدث | قبل | بعد |
|-------|------|------|
| clusters | 85 | 80 |
| drones_scout | 85 | 90 |
| drones_tracker | 145 | 155 |
| drones_bomber | 205 | 215 |

هذا يضمن فارق ~10 ثوانٍ بين أي تحذيرين سينمائيين (مدة التحذير 1.5 ثانية فقط).

### 3. `src/game/engine.ts` — منع تداخل التحذيرات (حماية إضافية)
إضافة شرط في حلقة الأحداث: لا يُفعّل تحذير سينمائي جديد إذا كان هناك تحذير نشط حالياً:
```
if (we.cinematic && g.cinematicWarning) continue; // skip, will trigger next frame
```
مع عدم إضافة الـ id للـ `waveTriggered` في هذه الحالة حتى يُعاد المحاولة.

