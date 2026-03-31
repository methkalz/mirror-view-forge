

# إصلاح نهائي: موسيقى القائمة تستمر أثناء اللعب

## التحليل

بعد مراجعة الكود بالتفصيل، وجدت عدة نقاط ضعف في آلية الإيقاف الحالية:

1. **`stopMenuMusic` يستخدم fade-out مع `setTimeout(200ms)`** — أثناء هذه الـ 200ms، إذا حصل أي خطأ في `node.stop()` داخل `try/catch` الصامت، لن يتم استدعاء `disconnect()` وسيبقى الصوت يعمل
2. **لا يوجد حماية `killed` flag** — إذا كان `startMenuMusic` لا يزال في مرحلة `await ctx.resume()` عند استدعاء `stopMenuMusic`، ثم أكمل بعدها، سينشئ عقدة صوتية جديدة بعد الإيقاف
3. **`cancelMenuMusicStart` لا يكفي وحده** — يحمي فقط أثناء الـ await، لكن بعد اجتياز الفحص على السطر 1028، لا يوجد فحص آخر قبل `.start()` في مسار الـ cached buffer

## الحل — ملف واحد: `src/game/audio.ts`

### التغيير 1: إضافة `menuMusicKilled` flag
```typescript
let menuMusicKilled = false;
```

### التغيير 2: تحديث `cancelMenuMusicStart`
```typescript
export function cancelMenuMusicStart() {
  menuMusicAttemptId++;
  menuMusicStarting = false;
  menuMusicKilled = true;  // منع أي تشغيل مستقبلي
}
```

### التغيير 3: فحص `menuMusicKilled` في `startMenuMusic` قبل كل `.start()`
```typescript
export async function startMenuMusic(): Promise<boolean> {
  if (menuMusicKilled) return false;     // ← جديد
  if (menuMusicNode) return true;
  if (menuMusicStarting) return false;
  ...
  menuMusicKilled = false;               // ← إعادة تعيين عند بدء محاولة شرعية
  const myAttempt = ++menuMusicAttemptId;
  ...
  // قبل .start() في مسار الـ cached buffer:
  if (menuMusicKilled || myAttempt !== menuMusicAttemptId) return false;
  menuMusicNode.start();
  
  // وقبل .start() في مسار الـ synth:
  if (menuMusicKilled || myAttempt !== menuMusicAttemptId) return false;
  menuMusicNode.start();
}
```

### التغيير 4: تحسين `stopMenuMusic` — إيقاف فوري بدون delay
```typescript
export function stopMenuMusic() {
  cancelMenuMusicStart();  // يضبط menuMusicKilled = true

  const node = menuMusicNode;
  const gain = menuMusicGain;
  menuMusicNode = null;
  menuMusicGain = null;
  if (node) {
    try { node.stop(); } catch {}
    try { node.disconnect(); } catch {}  // disconnect منفصل عن stop
  }
  if (gain) {
    try { gain.disconnect(); } catch {};
  }

  // تنظيف أي مصادر menuMusic من activeSources
  const extra = activeSources.get('menuMusic');
  if (extra) {
    for (const e of extra) {
      try { e.source.stop(); } catch {}
      try { e.source.disconnect(); } catch {}
    }
    activeSources.delete('menuMusic');
  }
}
```

**الفرق الجوهري**: إزالة الـ fade-out (`linearRampToValueAtTime` + `setTimeout`) واستبداله بإيقاف فوري. هذا يضمن عدم وجود أي نافذة زمنية يمكن فيها للصوت الاستمرار.

