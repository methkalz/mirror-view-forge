

# تحسين إدارة الخلفيات في لوحة التحكم

## الميزات المطلوبة
1. **إضافة خلفية جديدة** — زر "+ Add Phase" يُنشئ سجلاً جديداً في `background_config`
2. **حذف خلفية** — زر حذف على كل كارت مع تأكيد
3. **تعديل اسم المرحلة** — حقل نصي قابل للتعديل بدل الاسم الثابت (day/sunset/night)
4. **حقل إدخال رقمي** بجانب كل slider لكتابة القيم يدوياً بدقة

## التغييرات

### 1. `src/game/backgroundConfig.ts` — إضافة دالتين
- `createBackgroundPhase(phase: string)` — INSERT سجل جديد مع قيم افتراضية
- `deleteBackgroundPhase(id: string)` — DELETE السجل + حذف الصورة من Storage إن وُجدت
- `updateBackgroundPhase` — إضافة دعم تحديث حقل `phase` (الاسم)

### 2. `src/pages/Admin.tsx` — تعديل `BackgroundsPanel`

**زر إضافة:**
- زر "+ Add Phase" أسفل كروت المراحل يفتح prompt لإدخال اسم المرحلة

**زر حذف:**
- زر 🗑 في header كل كارت مع `confirm()` قبل الحذف

**اسم المرحلة قابل للتعديل:**
- استبدال العنوان الثابت بـ input نصي صغير يحفظ عند blur/enter
- إزالة الاعتماد الحصري على `PHASE_META` — استخدام fallback ديناميكي للأسماء الجديدة

**حقل رقمي بجانب كل slider:**
- لكل slider (Start, End, Fade Duration, Opacity) إضافة `<input type="number">` صغير بجانب القيمة
- متزامن مع الـ slider — تغيير أي منهما يحدّث الآخر

### تفاصيل تقنية

```text
Slider + Number Input Layout:
┌─────────────────────────────┐
│ Label          [___42___] s │
│ ════════════●════════════   │
└─────────────────────────────┘
```

- `createBackgroundPhase` يحسب `sort_order` تلقائياً (max + 1)
- `deleteBackgroundPhase` يحذف الصورة من storage أولاً ثم السجل
- الألوان للمراحل الجديدة تأخذ لوناً عشوائياً من مجموعة محددة

