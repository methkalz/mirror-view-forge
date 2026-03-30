

# نظام الخلفيات الديناميكية مع لوحة التحكم

## الفكرة
نظام تغيير تدريجي للخلفية (نهار → مغيب → ليل) يُدار بالكامل من لوحة الأدمن، مع إمكانية رفع/تغيير الصور وضبط توقيتات الانتقال.

## التنفيذ

### 1. جدول قاعدة بيانات جديد: `background_config`
```sql
CREATE TABLE background_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase TEXT NOT NULL UNIQUE,        -- 'day', 'sunset', 'night'
  image_url TEXT,                     -- رابط الصورة من Storage
  transition_start FLOAT NOT NULL,   -- بداية الانتقال (ثواني)
  transition_end FLOAT NOT NULL,     -- نهاية الانتقال (ثواني)
  overlay_top TEXT DEFAULT '12,20,69',
  overlay_mid TEXT DEFAULT '26,16,46',
  overlay_bottom TEXT DEFAULT '26,10,46',
  overlay_opacity FLOAT DEFAULT 0.4,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
يُملأ بثلاثة سجلات افتراضية:
- `day`: 0s–90s (الصورة الحالية)
- `sunset`: 90s–240s
- `night`: 240s–300s+

### 2. `src/game/config.ts` — إضافة واجهة ودوال جلب
- `BackgroundPhase` interface جديد
- `fetchBackgroundConfig()` يجلب الإعدادات والصور
- `updateBackgroundPhase()` لتحديث من الأدمن
- `uploadBackgroundImage()` لرفع الصور

### 3. `src/game/renderer.ts` — تحديث نظام الرسم
- بدل صورة واحدة، تحميل 3 صور من URLs قاعدة البيانات
- حساب أي صورتين يتم عرضهما بناءً على `g.elapsed` والتوقيتات من الـ config
- Cross-fade بين الصورتين باستخدام `globalAlpha`
- التبليط المرآوي يُطبّق على كلتا الصورتين
- Fallback للصورة المحلية إذا لم تتوفر صور من القاعدة
- تحديث `SKY_PHASES` ليقرأ ألوان الـ overlay من الإعدادات

```text
الجدول الزمني (افتراضي، قابل للتعديل):
0s─────90s: نهار 100%
90s───150s: نهار → مغيب (cross-fade)
150s──240s: مغيب 100%
240s──300s: مغيب → ليل (cross-fade)
300s+─────: ليل 100%
```

### 4. `src/pages/Admin.tsx` — تبويب جديد "Backgrounds" 🌅
- إضافة تبويب جديد في TABS
- واجهة تعرض 3 بطاقات (نهار، مغيب، ليل) لكل منها:
  - معاينة الصورة الحالية
  - زر رفع صورة جديدة
  - sliders لوقت بداية ونهاية الانتقال
  - ألوان الـ overlay (اختياري)
- معاينة الجدول الزمني بشكل شريط ملون

### 5. Storage bucket
- استخدام bucket `game-audio` الموجود (أو إنشاء `game-backgrounds` جديد)

## الملفات المتأثرة
- Migration SQL جديد (جدول + RLS)
- `src/game/config.ts` — واجهات ودوال جديدة
- `src/game/renderer.ts` — نظام رسم متعدد الصور
- `src/pages/Admin.tsx` — تبويب Backgrounds

## ملاحظة
بعد الموافقة، ارفع 3 صور (نهار، مغيب، ليل) وسأضيفها كصور افتراضية، أو يمكنك رفعها لاحقاً من لوحة التحكم مباشرة.

