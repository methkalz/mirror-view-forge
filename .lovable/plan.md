

# تبسيط نظام مستوى الصوت: مجموعة أو ملفات فردية (وليس كلاهما)

## الفكرة
حالياً يوجد تحكم بمستوى صوت المجموعة (group volume) وأيضاً مستوى صوت كل ملف (file volume) مما يُسبب ارتباكاً. سنجعل المستخدم يختار: إما مستوى واحد للمجموعة كلها، أو مستوى مستقل لكل ملف.

## التفاصيل التقنية

### قاعدة البيانات
إضافة عمود `volume_mode` لجدول `audio_config`:
```sql
ALTER TABLE public.audio_config ADD COLUMN volume_mode text NOT NULL DEFAULT 'group';
```
- `'group'`: مستوى صوت واحد للمجموعة (الحقل `volume` الحالي) — يُتجاهل `audio_files.volume`
- `'individual'`: لكل ملف مستوى خاص — يُتجاهل `audio_config.volume`

### الملفات المتأثرة

**1. `src/game/config.ts`**
- إضافة `volumeMode: 'group' | 'individual'` لـ `AudioConfigEntry`
- قراءة الحقل الجديد في `fetchAudioConfig`

**2. `src/game/audio.ts`**
- تعديل `playCustomAudio`: 
  - إذا `volumeMode === 'group'` → `gain = s.volume` (تجاهل file.volume)
  - إذا `volumeMode === 'individual'` → `gain = file.volume` (تجاهل s.volume)

**3. `src/pages/Admin.tsx`**
- إضافة toggle في إعدادات كل صوت: "مستوى المجموعة" / "مستوى فردي لكل ملف"
- عند اختيار "مجموعة": إظهار slider واحد للمجموعة فقط، إخفاء sliders الملفات
- عند اختيار "فردي": إظهار slider لكل ملف، إخفاء slider المجموعة
- إزالة slider مستوى الصوت من الصف الرئيسي للصوت (خارج القائمة المنسدلة) لتجنب الازدواجية

