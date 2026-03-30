

# إصلاح المعاينة المباشرة للخلفيات في لوحة التحكم

## المشكلة
مكون `BackgroundPreviewPlayer` يعاني من مشكلة أداء تمنعه من العمل بسلاسة:

- `drawFrame` يستدعي `setProgress(...)` كل frame (60 مرة/ثانية)
- هذا يسبب re-render لكامل المكون كل frame
- `drawFrame` يعتمد على `playing` في dependency array الخاص بـ `useCallback`
- كل re-render يُنشئ `drawFrame` جديد → `useEffect` يُلغي الـ RAF السابق ويبدأ واحد جديد
- النتيجة: حلقة بدء/إلغاء متكررة تمنع الرسم المتواصل

## الحل

### تعديل `src/pages/Admin.tsx` — مكون `BackgroundPreviewPlayer`

1. **استخدام `useRef` بدل `useState` لـ `playing`**:
   - `playingRef = useRef(false)` لتجنب إعادة إنشاء `drawFrame`
   - الاحتفاظ بـ `useState` فقط لتحديث الزر في الـ UI

2. **تقليل استدعاءات `setProgress`**:
   - تحديث progress كل ~100ms بدل كل frame باستخدام `lastProgressUpdate` ref

3. **إزالة `playing` من dependencies الـ `drawFrame`**:
   - استخدام `playingRef.current` داخل `drawFrame` بدل المتغير `playing`
   - هذا يمنع إعادة إنشاء الدالة عند كل تغيير

4. **تشغيل أول frame مباشرة في `handlePlay`**:
   - `startTimeRef.current = performance.now()` ثم `requestAnimationFrame(drawFrame)` مباشرة

### ملف واحد فقط
- `src/pages/Admin.tsx`

