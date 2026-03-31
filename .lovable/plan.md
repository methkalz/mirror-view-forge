

# إصلاح: جدول المعاينة لا يعكس قيم التخصيص اليدوي (Override)

## المشكلة
عند تعديل موجة (مثلاً تغيير المدة من 60 إلى 20)، القائمة المنبثقة (WaveEditor) تعرض القيمة الصحيحة، لكن جدول المعاينة الفورية يستمر بعرض القيم المولّدة تلقائياً من `generatePreviewWaves()` ويتجاهل البيانات الفعلية المحفوظة.

## الحل
**ملف واحد**: `src/pages/Admin.tsx`

بعد توليد `previews` من `generatePreviewWaves()`, نمر على النتائج ونستبدل قيم أي موجة لها override محفوظ في `waves` بالقيم الحقيقية من قاعدة البيانات.

```text
previews (auto) ──► لكل موجة: هل لها override؟ ──► نعم: استبدال القيم ──► عرض في الجدول
                                                  ──► لا: إبقاء القيم التلقائية
```

### التغيير (سطر ~509)
بعد السطر:
```js
const previews = diffProfile ? generatePreviewWaves(diffProfile, previewCount) : [];
```

إضافة دمج (merge) قيم الـ overrides الفعلية:
```js
// Merge actual override values into preview rows
const mergedPreviews = previews.map(p => {
  const override = waves.find(w => w.waveNumber === p.wave);
  if (!override) return p;
  return {
    ...p,
    duration: override.duration,
    threats: override.threats,
    maxConcurrent: override.maxConcurrent,
    spawnInterval: override.spawnRate,
    droneTiers: override.droneTypes,
    clusterSplits: override.clusterSplits,
    bulletLevel: override.bulletLevel,
    hasBoss: override.hasBoss,
    hasChemical: override.hasChemical,
    hasIncendiary: override.hasIncendiary,
    droneInterval: override.droneInterval,
  };
});
```

ثم استخدام `mergedPreviews` بدل `previews` في الـ `map` داخل الجدول (سطر ~654).

