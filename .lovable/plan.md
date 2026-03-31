

# تعديلان سريعان

## 1. إطالة رسالة تفعيل الصوت بثانية واحدة
**الملف**: `src/components/NameEntry.tsx`
- تغيير `fadeTimer` من `2400ms` → `3400ms`
- تغيير `phaseTimer` من `3000ms` → `4000ms`

## 2. السماح بتحكم دقيق بمستوى الصوت (كل 1% بدل 5%)
**الملف**: `src/pages/Admin.tsx`
- تغيير `step={0.05}` إلى `step={0.01}` في ثلاثة أماكن:
  - **Master volume slider** (سطر ~1015)
  - **Category volume slider** (سطر ~1045)
  - **Individual sound slider** (سطر ~1091)
- هذا يتيح ضبط الصوت بدقة 1% (مثلاً 8%, 12%, 33%)

### الملفات المتأثرة
1. `src/components/NameEntry.tsx` — تعديل التوقيتات
2. `src/pages/Admin.tsx` — تغيير step في 3 sliders

