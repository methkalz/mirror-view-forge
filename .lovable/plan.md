

# إصلاح: تغييرات مستوى الصوت لا تنعكس فوراً على اللعبة

## المشكلة الفعلية
`loadAudioSettings()` تُستدعى **مرة واحدة فقط** عند تحميل اللعبة. بعدها تُخزَّن الإعدادات في `Map` محلي ولا تُحدَّث أبداً. عندما تغيّر مستوى صوت من لوحة التحكم، اللعبة تستمر بالقيم القديمة حتى يُعاد تحميل الصفحة — لذلك "أحياناً يعمل" (بعد إعادة تحميل) و"أحياناً لا" (بدون إعادة تحميل).

## الحل
إضافة **Realtime subscription** لجدول `audio_config` — نفس الآلية المستخدمة حالياً لمزامنة الخلفيات.

### التغييرات

**1. `src/game/audio.ts`**
- إضافة دالة `reloadAudioSettings()` تعيد جلب الإعدادات من قاعدة البيانات وتحدّث الـ `Map` المحلي
- تصديرها للاستخدام في المكون

**2. `src/components/SkyfallGame.tsx`**
- إضافة Supabase Realtime channel يستمع لتغييرات جدول `audio_config`
- عند أي تغيير (UPDATE/INSERT/DELETE) → استدعاء `reloadAudioSettings()`
- تنظيف الاشتراك عند unmount

### الملفات
1. `src/game/audio.ts` — دالة `reloadAudioSettings`
2. `src/components/SkyfallGame.tsx` — Realtime subscription لـ `audio_config`

