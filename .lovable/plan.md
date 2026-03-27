

# إصلاح الصوت على iPhone في وضع الصامت (Silent Mode)

## المشكلة
iOS يمنع Web Audio API من إصدار صوت عندما يكون مفتاح الصامت مُفعّلاً. لكنه يسمح لعنصر `<audio>` HTML بالعمل حتى في وضع الصامت. الحل المؤكد: تشغيل ملف صوتي صامت عبر `<audio>` tag بالتزامن مع Web Audio API — هذا "يفتح" قناة الصوت.

## الحل — مكتبة `unmute-ios-audio` أو تطبيق يدوي

### الخيار المُختار: تطبيق يدوي (بدون مكتبة خارجية)

### التغييرات في `src/game/audio.ts`:

1. **إنشاء عنصر `<audio>` صامت** عند أول تفاعل مستخدم:
   - إنشاء ملف صوتي صامت كـ base64 Data URI (MP3 صامت أقل من 1KB)
   - تشغيله بـ `loop: true` و `volume` قريب من الصفر
   - هذا يُخبر iOS أن الصفحة تحتاج صوت فيفتح القناة حتى في وضع الصامت

2. **تعديل `resumeAudio()`**:
   - إضافة استدعاء دالة `unmuteIOS()` التي تنشئ وتشغّل عنصر `<audio>` الصامت
   - هذه الدالة تُستدعى مرة واحدة فقط عند أول تفاعل

3. **إضافة مُستمعات `touchstart` و `click`** على مستوى document لضمان أن أول لمسة تُفعّل الصوت

### الكود المُضاف (أعلى audio.ts):
```typescript
let iosUnmuted = false;
const SILENT_MP3 = 'data:audio/mp3;base64,...'; // ~150 bytes silent MP3

function unmuteIOS() {
  if (iosUnmuted) return;
  iosUnmuted = true;
  const audio = document.createElement('audio');
  audio.setAttribute('x-webkit-airplay', 'deny');
  audio.preload = 'auto';
  audio.loop = true;
  audio.src = SILENT_MP3;
  audio.play().catch(() => {});
}
```

وإضافة استدعاء `unmuteIOS()` داخل `resumeAudio()`.

### ملف واحد يتغير: `src/game/audio.ts`

