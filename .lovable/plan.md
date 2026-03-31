

# إضافة مستوى صوت فردي لكل ملف + تحكم بالتشغيل المتزامن

## ما سيتغير

### 1. مستوى صوت فردي لكل ملف صوتي
حالياً كل ملفات الصوت داخل مجموعة واحدة تشترك بنفس مستوى الصوت. سنضيف عمود `volume` لجدول `audio_files` بحيث يكون لكل ملف مستوى صوت مستقل.

### 2. تشغيل متزامن أو حصري
إضافة عمود `allow_overlap` (boolean) لجدول `audio_config` يحدد: هل يُسمح بتشغيل أكثر من ملف من نفس المجموعة في الوقت ذاته، أم ملف واحد فقط (يتوقف السابق عند بدء الجديد).

---

## التفاصيل التقنية

### قاعدة البيانات (Migration)
```sql
ALTER TABLE public.audio_files ADD COLUMN volume real NOT NULL DEFAULT 1.0;
ALTER TABLE public.audio_config ADD COLUMN allow_overlap boolean NOT NULL DEFAULT false;
```

### الملفات المتأثرة

**1. `src/game/config.ts`**
- إضافة `volume` لـ `AudioFileEntry`
- إضافة `allowOverlap` لـ `AudioConfigEntry`
- تحديث `fetchAudioConfig` لقراءة الحقول الجديدة

**2. `src/game/audio.ts`**
- تحديث `SoundSetting` بإضافة `allowOverlap`
- تعديل `playCustomAudio`: استخدام `file.volume` كمُعامل إضافي عند حساب gain
- إضافة منطق التشغيل الحصري: عند `allowOverlap = false`، إيقاف أي صوت قيد التشغيل من نفس المجموعة قبل بدء الجديد (تتبع الـ sources النشطة بـ Map)

**3. `src/pages/Admin.tsx`**
- إضافة slider + حقل رقمي لمستوى الصوت بجانب كل ملف في قائمة Audio Files
- إضافة toggle "تشغيل متزامن" / "ملف واحد فقط" في إعدادات كل صوت
- حفظ التغييرات مباشرة إلى قاعدة البيانات

