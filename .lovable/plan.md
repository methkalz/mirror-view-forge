

# تحسينات بصرية وميكانيكية شاملة

## 1. تأثيرات بصرية عند إطلاق القذائف/القنابل

**`src/game/renderer.ts`**:
- **Bomber**: وميض برتقالي + جزيئات شرر عند إسقاط القنبلة (حلقة نارية تحت الطائرة)
- **Tracker**: خط ليزر أخضر مستمر (وليس فقط أثناء الغوص) يمتد من أنف الطائرة نحو اللاعب بشفافية خفيفة + نبضات، ووميض كهربائي عند إطلاق القذيفة
- **Scout**: وميض كاميرا أبيض دوري (فلاش)
- **Chemical**: سحابة خضراء صغيرة تنبعث من أسفل الطائرة
- **Incendiary**: قطرات نارية متساقطة باستمرار

## 2. منع تراكم طائرات التتبع (Tracker)

**`src/game/engine.ts`** (~سطر 2375-2395): إضافة قوة فصل (Separation Force) لطائرات الـ tracker مشابهة للموجودة حالياً عند scout/bomber (سطر 2419-2431). حالياً الـ tracker يستخدم مدار (orbit) بدون فصل، مما يسبب تجمعها.

## 3. ليزر تتبع مستمر للـ Tracker

**`src/game/renderer.ts`** (~سطر 2642): تحويل الليزر من "أثناء الغوص فقط" إلى ليزر دائم بشفافية خفيفة (0.1) يزداد كثافة عند الغوص (0.4). خط رفيع متقطع أخضر فوسفوري يمتد من كاميرا الأنف إلى اللاعب.

## 4. تحسين قنابل الكلاستر المتشظية

**`src/game/engine.ts`** (~سطر 1805-1808): زيادة حجم القنابل الفرعية وتنويعها:
```
sh.size = 5 + Math.random() * 4;  // بدل 4 + 1.5
sh.speed = 60 + Math.random() * 100; // بدل 80 + 80
```

**`src/game/renderer.ts`** (~سطر 976): تكبير الرسم البصري للقنابل الصغيرة بما يتناسب مع الحجم الجديد.

## 5. نظام شراء الكمامة (Gas Mask Purchase)

### قاعدة البيانات
لا حاجة لتغيير — النظام يعتمد على الكود فقط.

### `src/game/types.ts`
إضافة حقول جديدة لـ `GameData`:
```typescript
gasMaskOffer: { active: boolean; timer: number } | null;
gasMaskOwned: boolean;
```

### `src/game/engine.ts`
- عند اقتراب موجة كيميائية (recipe.hasChemical = true وبداية الموجة): عرض بطاقة شراء الكمامة
- السعر = `Math.ceil(g.score * 0.1)` (10% من النقاط)
- اللاعب يضغط على البطاقة → خصم النقاط + `g.gasMaskOwned = true` + تفعيل `gasMaskTimer = 15`
- إذا لم يشترِ خلال 5 ثوانٍ → إخفاء العرض
- عند دخول سحابة غاز + `gasMaskOwned`: حماية + استهلاك الكمامة

### `src/game/renderer.ts`
- رسم بطاقة عرض الكمامة (مستطيل شبه شفاف مع أيقونة كمامة + السعر)
- رسم أيقونة كمامة صغيرة في الزاوية اليسرى عندما `gasMaskOwned = true`

### `src/game/engine.ts` — معالجة الإدخال
- اكتشاف النقر على بطاقة الكمامة (مشابه لنظام بطاقات الترقية)

## 6. تشغيل عشوائي بدون تكرار (Shuffle)

### `src/game/config.ts`
إضافة `'shuffle'` إلى نوع `PlayMode`:
```typescript
export type PlayMode = 'single' | 'random' | 'sequential' | 'shuffle';
```

### `src/game/audio.ts`
- إضافة `shuffleQueue: Map<string, number[]>` لتتبع الترتيب العشوائي لكل مجموعة
- في `pickFile()` عند mode = `'shuffle'`:
  - إنشاء قائمة عشوائية (Fisher-Yates) عند أول تشغيل أو عند نفاد القائمة
  - سحب الملف التالي من القائمة
  - لا يُعاد ملف حتى تنتهي كل الملفات

### `src/pages/Admin.tsx`
إضافة خيار "Shuffle (بدون تكرار)" في قائمة Play Mode المنسدلة.

---

## الملفات المتأثرة
1. **`src/game/renderer.ts`** — تأثيرات بصرية + ليزر + بطاقة كمامة + أيقونة
2. **`src/game/engine.ts`** — فصل trackers + قنابل أكبر + نظام شراء الكمامة
3. **`src/game/types.ts`** — حقول gasMaskOffer و gasMaskOwned
4. **`src/game/audio.ts`** — وضع Shuffle
5. **`src/game/config.ts`** — إضافة نوع shuffle لـ PlayMode
6. **`src/pages/Admin.tsx`** — خيار Shuffle في لوحة التحكم

