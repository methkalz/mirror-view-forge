

# نظام عرض الخلفية المتقدم — 3 أوضاع مع معاينة حية

## الفكرة
إضافة إعداد `display_mode` لكل خلفية مع 3 خيارات: **Single** (صورة واحدة مركزية)، **Tiled** (تبليط مرآوي)، **Blur Edge** (صورة مركزية مع بلور على الأطراف). مع نقل إعدادات الهوامش إلى قسم الخلفيات ومعاينة حية لكل وضع.

## التغييرات

### 1. Migration — عمود جديد
```sql
ALTER TABLE public.background_config 
  ADD COLUMN display_mode text NOT NULL DEFAULT 'single',
  ADD COLUMN bg_margin double precision NOT NULL DEFAULT 400;
```
- `display_mode`: قيم `single` | `tiled` | `blur-edge`
- `bg_margin`: هامش خاص بكل خلفية (بدل القيمة العامة في game_config)

### 2. `src/game/backgroundConfig.ts`
- إضافة `displayMode` و `bgMargin` للـ interface وللـ fetch/update

### 3. `src/game/renderer.ts` — 3 دوال رسم

**`drawSingleImage`** (الحالي): صورة واحدة مركزية مع هامش

**`drawTiledImage`** (جديد — ثابت ومحكم):
- تقريب جميع الإحداثيات بـ `Math.round`
- تداخل 1px بين كل tile
- عكس مرآوي للتبليطات الفردية
- يعمل مع انتقال الخلفيات (cross-fade) بدون مشاكل

**`drawBlurEdgeImage`** (جديد):
- رسم الصورة مركزية بحجمها الطبيعي (cover height)
- رسم نسخة مُمددة (stretched) وعليها blur خلف الصورة الأصلية لتغطية الفراغات الجانبية
- يتم ذلك عبر `ctx.filter = 'blur(20px)'` للنسخة الخلفية

**دالة موحدة `drawBgImage`**: تختار الدالة المناسبة حسب `displayMode` من الـ phase الحالي

### 4. `src/pages/Admin.tsx` — BackgroundsPanel

**قسم جديد "Display Mode" في كل كارت خلفية:**
- 3 أزرار اختيار بصرية: `📐 Single` | `🔲 Tiled` | `🌫️ Blur Edge`
- Slider + Input لـ "Margin (px)" (0–1000، خطوة 10)
- حذف camera margin من Game Settings (نقلها هنا)

**معاينة مباشرة:**
- عند اختيار أي وضع، المعاينة في الكارت نفسه تعكس الشكل الفعلي:
  - Single: صورة مركزية
  - Tiled: صورتين متجاورتين مع انعكاس
  - Blur Edge: صورة مركزية مع أطراف ضبابية

```text
┌──────────────────────────────────┐
│ 📷 Image          [preview]      │
│ ─────────────────────────────── │
│ 🖥️ Display Mode                  │
│  [📐 Single] [🔲 Tiled] [🌫️ Blur]│
│  Margin (px):  [___400___]      │
│  ════════════●════════════       │
└──────────────────────────────────┘
```

### 5. `renderBackground` في renderer.ts
- قراءة `displayMode` من الـ phase الحالي (من `getPhaseBlend`)
- تمرير القيمة لـ `drawBgImage` بدل `drawSingleImage` الثابت
- أثناء cross-fade: الصورة A تستخدم mode المرحلة A، والصورة B تستخدم mode المرحلة B

### تفاصيل تقنية للتبليط المحكم
- كل tile يُرسم بعرض `Math.ceil(drawW) + 1` لضمان التداخل
- `Math.round` على كل `drawX` لمنع sub-pixel gaps
- التبليطات الفردية (index فردي) تُعكس بـ `ctx.scale(-1, 1)`
- هذا يضمن عدم ظهور أي خط أسود على أي جهاز

