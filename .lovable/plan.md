

# إصلاح Display Mode — تطبيق فعلي مضمون

## المشاكل المكتشفة

1. **Blur Edge مطابق تماماً لـ Single** — دالة `drawBlurEdgeImage` (سطر 212-221) هي نسخة حرفية من `drawSingleImage`. لا يوجد أي فرق بصري بينهما.

2. **اللعبة لا تُحدّث الإعدادات تلقائياً** — الـ config يُحمّل مرة واحدة فقط عند بدء اللعبة. تغييرات الأدمن تحتاج إعادة تحميل الصفحة.

3. **Tiled لا يستخدم الـ margin** — التبليط لا يأخذ قيمة `bgMargin` بعين الاعتبار.

## الحل

### 1. `src/game/renderer.ts` — 3 أوضاع مختلفة فعلياً

**Single (الحالي — صحيح):** صورة واحدة ممتدة تغطي viewport + margin. لا تغيير.

**Blur Edge (إصلاح حقيقي):** 
- رسم الصورة بحجمها الطبيعي (cover height فقط) في المركز
- رسم نسخة ممدودة منها خلفها مع `ctx.filter = 'blur(30px)'` لتغطية الفراغات الجانبية
- هذا يعطي تأثير سينمائي واضح ومختلف عن Single

```text
Single:    [=======صورة ممدودة بالكامل=======]
Blur Edge: [ضباب|===صورة بحجمها الطبيعي===|ضباب]
Tiled:     [صورة|عكس|صورة|عكس|صورة|عكس]
```

**Tiled (تحسين):** تمرير `margin` للدالة لضمان تغطية كافية.

### 2. `src/components/SkyfallGame.tsx` — تحديث تلقائي

إضافة Supabase Realtime subscription على جدول `background_config`:
- عند أي `UPDATE/INSERT/DELETE` → إعادة تحميل `fetchBackgroundConfig()` → `setBackgroundConfig()`
- التغييرات تنعكس فوراً في اللعبة بدون إعادة تحميل

### 3. `src/pages/Admin.tsx` — معاينة دقيقة

تحديث `PhoneMockupPreview` ليعكس الفرق الحقيقي:
- Single: صورة ممدودة كاملة
- Blur Edge: صورة مركزية مع أطراف ضبابية (باستخدام CSS filter على Canvas)
- Tiled: تبليط مرآوي

### التفاصيل التقنية

**`drawBlurEdgeImage` الجديدة:**
```
1. حساب drawW الطبيعي = drawH * imgAspect
2. رسم نسخة ممدودة (cover كامل) مع ctx.filter = 'blur(30px)'
3. إزالة الفلتر
4. رسم الصورة بحجمها الطبيعي في المركز
→ النتيجة: صورة واضحة في الوسط + أطراف ضبابية جمالية
```

**Realtime في SkyfallGame:**
```
supabase.channel('bg-config-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'background_config' }, () => {
    fetchBackgroundConfig().then(phases => {
      if (phases.length > 0) setBackgroundConfig(phases);
    });
  })
  .subscribe()
```

