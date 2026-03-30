

# نظام التوليد التلقائي للموجات + التحكم الذكي من الأدمن

## الفكرة الأساسية
بدلاً من بناء كل موجة يدوياً (مستحيل مع عدد لا نهائي)، النظام يعمل بطريقتين:
1. **إعدادات تصاعد تلقائي (Auto-Scaling)**: تضبط معلمات عامة والمحرك يولّد الموجات تلقائياً
2. **تخصيص يدوي (Override)**: إذا أردت تخصيص موجة معينة، تنشئها يدوياً وتأخذ الأولوية

## التغييرات

### 1. Migration — جدول `difficulty_profile` جديد
جدول واحد يحتوي إعدادات التصاعد التلقائي:

| العمود | النوع | الوصف |
|--------|-------|-------|
| `id` | uuid | المفتاح |
| `base_max_concurrent` | integer (3) | العدد الأقصى للتهديدات المتزامنة في الموجة 1 |
| `max_concurrent_cap` | integer (15) | السقف الأعلى |
| `concurrent_growth` | real (0.5) | زيادة لكل موجة |
| `base_spawn_interval` | real (2.5) | الفترة بين التهديدات في الموجة 1 |
| `min_spawn_interval` | real (0.5) | أسرع فترة ممكنة |
| `spawn_interval_decay` | real (0.1) | مقدار التسارع لكل موجة |
| `threats_unlock` | jsonb | `{"shrapnel":1, "missile":2, "cluster":4}` — رقم الموجة لفتح كل نوع |
| `drones_unlock` | jsonb | `{"scout":5, "tracker":7, "bomber":9, "chemical":10, "incendiary":11}` |
| `cluster_splits_base` | integer (2) | شظايا أولية |
| `cluster_splits_growth` | real (0.3) | زيادة لكل موجة بعد فتح الكلاستر |
| `cluster_splits_cap` | integer (8) | سقف الشظايا |
| `drone_interval_base` | real (25) | الفترة بين الطائرات عند أول ظهور |
| `drone_interval_min` | real (6) | أسرع فترة |
| `drone_interval_decay` | real (0.8) | معامل تقليل لكل موجة |
| `boss_every_n_waves` | integer (6) | بوس كل كم موجة |
| `boss_start_wave` | integer (12) | أول بوس |
| `bullet_level_waves` | jsonb | `{"2":3, "3":8}` — الموجة التي يترقى فيها السلاح |
| `wave_duration` | real (60) | مدة الموجة بالثواني |
| `phase_in_delay` | real (12) | تأخير التهديدات الجديدة |
| `scaling_formula` | text ('linear') | نوع التصاعد: linear أو exponential |

+ توسيع `wave_configs` بالأعمدة: `cluster_splits`, `bullet_level`, `phase_in_delay`, `drone_interval`, `has_boss`, `has_chemical`, `has_incendiary`

### 2. `src/game/config.ts` — واجهات + دوال جلب
- واجهة `DifficultyProfile` جديدة
- `fetchDifficultyProfile()` — جلب إعدادات التصاعد
- توسيع `RemoteWaveConfig` بالحقول الجديدة
- تحديث `fetchWaveConfigs()` و `upsertWaveConfig()`

### 3. `src/game/types.ts` — إضافة للـ GameData
- `difficultyProfile: DifficultyProfile | null`
- `remoteWaveOverrides: RemoteWaveConfig[]`

### 4. `src/game/engine.ts` — محرك التوليد التلقائي
تعديل `getWaveRecipe()`:
```text
1. إذا وُجدت وصفة يدوية (override) لرقم الموجة → استخدمها
2. إذا وُجد ملف تصاعد (difficultyProfile) → ولّد الوصفة رياضياً:
   - threats = كل الأنواع التي waveNum >= threats_unlock[type]
   - maxConcurrent = min(cap, base + growth × waveNum)
   - spawnInterval = max(min, base - decay × waveNum)
   - وهكذا لكل معلمة...
3. Fallback → الوصفات الحالية المبرمجة
```

### 5. `src/components/SkyfallGame.tsx`
- جلب `fetchDifficultyProfile()` + `fetchWaveConfigs()` عند التحميل
- تمريرهما للمحرك عبر `GameData`

### 6. `src/pages/Admin.tsx` — لوحة تحكم محسّنة

**تبويب الموجات يصبح قسمين:**

**أ) إعدادات التصاعد التلقائي** (الأساسي):
- sliders + inputs لكل معلمة تصاعد
- جدول مرئي يعرض **معاينة** لأول 20 موجة محسوبة تلقائياً (read-only) — يتحدث فوراً عند تغيير أي slider
- كل صف يوضح: رقم الموجة، التهديدات المتاحة، maxConcurrent، spawnInterval، الطائرات، البوس

**ب) تخصيص يدوي (Overrides)**:
- الموجات المخصصة يدوياً (من جدول wave_configs)
- محرر موسّع بالحقول الجديدة (cluster_splits, bullet_level, has_boss, etc.)
- علامة واضحة بجانب الموجات المخصصة في المعاينة
- زر "إنشاء من القالب الافتراضي" — يملأ 12 موجة دفعة واحدة

### النتيجة
```text
الأدمن يضبط 15 معلمة تصاعد → المحرك يولّد موجات لا نهائية تلقائياً
إذا أراد تخصيص موجة 7 بالذات → يضيفها يدوياً وتأخذ الأولوية
المعاينة الفورية تُظهر تأثير كل تغيير على أول 20 موجة
```

### الملفات
1. Migration: جدول `difficulty_profile` + أعمدة جديدة في `wave_configs`
2. `src/game/config.ts`: واجهات + دوال جلب
3. `src/game/types.ts`: حقول جديدة في GameData
4. `src/game/engine.ts`: محرك التوليد التلقائي
5. `src/components/SkyfallGame.tsx`: جلب وتمرير البيانات
6. `src/pages/Admin.tsx`: قسم التصاعد + محرر موسّع + معاينة فورية

