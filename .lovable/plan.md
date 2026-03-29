# نظام موجات ذكي — وصفات تهديد + خاتمة الموجة + بطء سينمائي + نظام رحمة

## الملخص

استبدال نظام `waveEvents` المبني على الوقت المطلق بنظام **وصفات موجات** (`WaveRecipe`) يربط التهديدات برقم الموجة، مع إضافة "خاتمة الموجة" (Final Barrage) وبطء سينمائي عند نهاية كل موجة، ونظام رحمة ذكي.

---

## التغييرات

### 1. `src/game/types.ts` — إضافة حقول جديدة

```typescript
waveEndSlowMo: number;   // مؤقت البطء السينمائي
waveFinale: boolean;      // هل نحن في مرحلة الوابل الأخير
activeHazardCount: number; // عدّاد التهديدات النشطة (بدل .filter كل فريم)
```

### 2. `src/game/engine.ts` — نظام الوصفات (الجزء الأكبر)

**أ. دالة `getWaveRecipe(wave: number)**` — تُرجع وصفة كل موجة:

```text
Wave  | التهديدات                      | maxConcurrent | spawnInterval | phaseInDelay
------|--------------------------------|---------------|---------------|-------------
  1   | shrapnel                       | 3             | 2.5s          | 0s
  2   | shrapnel, missile              | 4             | 2.2s          | 12s
  3   | shrapnel, missile              | 5             | 2.0s          | 0s  ← Level 1 END
  4   | shrapnel, missile, cluster(2)  | 4 ← أسهل!    | 2.1s          | 15s ← "الموجة النفسية"
  5   | + scout drone                  | 6             | 1.8s          | 12s ← "الصدمة"
  6   | + cluster(3)                   | 6             | 1.7s          | 0s  ← Level 2 END
  7   | + tracker drone                | 7             | 1.6s          | 12s
  8   | + cluster(4), bullet_3         | 7             | 1.5s          | 15s
  9   | + bomber drone                 | 8             | 1.4s          | 12s ← Level 3 END
 10   | + gasmask → chemical           | 8             | 1.3s          | 15s
 11   | + extinguisher → incendiary    | 9             | 1.2s          | 15s
 12   | + cluster(5), boss_warn        | 10            | 1.0s          | 12s ← Level 4 END
 13+  | كل شيء، تزايد تدريجي          | 10            | 0.8s          | 0s
```

- **الموجة 4 (النفسية)**: `maxConcurrent = 4` (أقل من الموجة 3!) + `spawnInterval = 2.1s` → اللاعب يشعر بالتفوق
- **الموجة 5**: قفزة مفاجئة بالدرونات → "الصدمة"
- `phaseInDelay`: التهديد الجديد لا يظهر إلا بعد X ثانية من بدء الموجة

**ب. استبدال مصفوفة `waveEvents**` المبنية على `time` بمنطق يقرأ من الوصفة:

- عند بدء كل موجة: قراءة `getWaveRecipe(waveNumber)` → تفعيل التهديدات المتاحة تلقائياً
- التهديدات الجديدة (التي لم تكن في الموجة السابقة): إظهار تحذير سينمائي + تأخير `phaseInDelay`
- إزالة كل منطق `g.elapsed >= we.time` واستبداله بنظام الوصفات

**ج. عدّاد `activeHazardCount**` (بدل `.filter` كل فريم):

- يزداد عند `spawnHazard` (+1)
- ينقص عند إلغاء تفعيل hazard (-1)
- قبل spawn: `if (g.activeHazardCount >= recipe.maxConcurrent) skip`

**د. الـ `spawnRate**` من الوصفة مباشرة (لا حساب من `difficulty`):

- `difficulty` يبقى فقط لسرعة الشظايا/الصواريخ: `difficulty = 1 + g.elapsed / 120`
- حد أقصى لسرعة الصواريخ: `speed = Math.min(baseSpeed * difficulty, MAX_MISSILE_SPEED)` حيث `MAX_MISSILE_SPEED` يضمن أن الصاروخ لا يقطع الشاشة بأقل من 0.8 ثانية

**هـ. خاتمة الموجة (Wave Finale)** — آخر 5 ثوانٍ:

- `g.waveFinale = true`
- مضاعفة spawn للشظايا فقط (نوع واحد خفيف)
- **لا يتجاهل** `maxConcurrent` (بدلاً من تجاهله) → يرفعه بمقدار +3 للشظايا فقط
- عرض نص "⚠ FINAL BARRAGE" صغير

**و. البطء السينمائي (Cinematic Slow-Mo)** — عند نهاية الموجة:

- `g.waveEndSlowMo = 2.0` ثانية
- `g.slowMoFactor = 0.2` خلال هذه المدة
- نص "WAVE X COMPLETE" / "انتهت الموجة" ثم الانتقال لـ `clearing`

**ز. نظام الرحمة (Pity System)**:

- في دالة spawn: `if (g.player.health < 20) effectiveMax = recipe.maxConcurrent - 1`
- `if (g.player.health < 10) effectiveMax = recipe.maxConcurrent - 2`
- لا يقل عن 2

**ح. Chromatic Aberration أثناء Slow-Mo**: يُطبَّق في الـ renderer

### 3. `src/game/renderer.ts` — تأثيرات بصرية

- **Wave Finale**: وميض أحمر خفيف على حواف الشاشة (vignette أحمر)
- **Slow-Mo السينمائي**: 
  - vignette داكن + نص "WAVE COMPLETE" بخط Tajawal كبير
  - تأثير Chromatic Aberration بسيط (رسم المشهد 3 مرات بإزاحة R/G/B طفيفة 2px)
- **عرض رقم الموجة**: `LVL X — WAVE Y` في الـ HUD

---

## الملفات المتأثرة

1. `src/game/types.ts` — 3 حقول جديدة
2. `src/game/engine.ts` — إعادة بناء نظام الموجات بالكامل (وصفات + finale + slow-mo + pity + عدّاد)
3. `src/game/renderer.ts` — تأثيرات بصرية (finale + chromatic aberration + wave complete)

عند الانتقال إلى **Slow-Mo**، تأكد من أن الـ **Input Detection** (عصا التحكم) لا تتباطأ بنفس النسبة!

**القاعدة الذهبية:** "Player movement should feel snappy even when the world is slow."

إذا تباطأت حركة اللاعب مع الزمن، سيشعر أن اللعبة "ثقيلة" (Sluggish). اجعل الـ slowMoFactor يؤثر على الأعداء والمقذوفات بنسبة 0.2، ولكن اجعله يؤثر على اللاعب بنسبة 0.7 مثلاً، ليعطيه **"قوة خارقة"** في المناورة أثناء الـ Slow-Mo.