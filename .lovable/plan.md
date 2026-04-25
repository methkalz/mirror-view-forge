# إصلاح السيميلاتور المعطّل — 3 إصلاحات متكاملة

## 1️⃣ إصلاح Race Condition في تحميل البيانات
**`src/components/SkyfallGame.tsx`**
- جعل `isLoading = true` افتراضياً حتى في وضع السيم (إزالة الاستثناء الحالي)
- ضمان `setIsLoading(false)` داخل `finally` بعد اكتمال `loadAll()` (تحميل remoteConfig + dynamicWarnings + waveOverrides + audio)
- بهذا يضمن `simAutoStartedRef` effect أن كل البيانات جاهزة قبل `resetGame(g)` ولن يبدأ المحرك بمصفوفات فارغة

## 2️⃣ دعم كامل لكل أحداث السيميلاتور
**`src/game/debugCommands.ts`**
- إضافة `startAirRaidFlyby` إلى نوع `helpers`
- توسيع `triggerEvent` ليعالج:
  - `'airstrike_flyby'` → `helpers.startAirRaidFlyby(g)`
  - `'surge'` → `helpers.startNextWave(g)` مع رفع `surge_multiplier`

**`src/components/SkyfallGame.tsx`**
- تمرير `startAirRaidFlyby` ضمن helpers في `attachDebugAPI(g, _debug)`

## 3️⃣ تحصين دفاعي ضد الانهيارات
**`src/pages/Admin.tsx`**
- لف `dbg.getState()` في polling بـ `try/catch` لتجنب توقف الـ stats
- إضافة فحص null على `dbg` قبل الاستخدام في كل أزرار السيميلاتور
- إضافة `displayName` لـ `SimulatorPanel` لإزالة تحذيرات `forwardRef`

## ✅ النتيجة المتوقعة
- iframe السيم يفتح، يعرض GameLoader لثوانٍ، ثم تبدأ اللعبة تلقائياً
- **كل** الأزرار تعمل: قفز موجات، تهديدات، Bosses، Drones، Air Raid (المُعطل سابقاً)، Surge، Swarm، Volley، Minefield
- إحصائيات HP/Ammo/Wave/Phase تتحدث كل 500ms بدون توقف
- صفر تحذيرات `forwardRef` في console