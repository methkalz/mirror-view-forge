## 🎯 السبب الجذري الموثق (ليست المشكلة من الدراجة!)

في `src/pages/Admin.tsx` السطر **3234**:
```tsx
<iframe ref={iframeRef} src={`/?sim=${Date.now()}`} ... />
```

`Date.now()` يُعاد حسابه **في كل render** لـ `SimulatorPanel`. ولأن هناك `setInterval` يستدعي `setStats(...)` كل **500ms** (سطر 3062-3072) لتحديث HP/Ammo/Wave، فإن:

1. كل تحديث للإحصائيات → re-render
2. re-render → `Date.now()` جديد → خاصية `src` تتغيّر
3. React يكتشف تغيّر `src` → يُعيد تحميل iframe من الصفر
4. النتيجة الظاهرة: تظهر المقدمة (الدراجة) → reload قبل اكتمالها → تظهر مرة أخرى → **حلقة لانهائية**

**المحرك سليم، الدراجة سليمة، intro flow سليم.** المشكلة بحتة في خاصية `src` غير المستقرة في `SimulatorPanel`.

---

## 🔧 خطة الإصلاح

### الملف الوحيد المعدَّل: `src/pages/Admin.tsx` — مكون `SimulatorPanel`

**1. تثبيت `src` بـ `useRef` (يُحسب مرة عند mount فقط):**
```tsx
const iframeSrcRef = useRef(`/?sim=${Date.now()}`);
const [reloadKey, setReloadKey] = useState(0);
```

**2. استخدام القيمة الثابتة في iframe + `key` للتحكم بإعادة التحميل اليدوي:**
```tsx
<iframe
  key={reloadKey}
  ref={iframeRef}
  src={iframeSrcRef.current}
  ...
/>
```

**3. إضافة زر "إعادة تحميل السيم" يدوي بجانب زر "إعادة" الموجود (سطر 3164):**
```tsx
<button onClick={() => {
  iframeSrcRef.current = `/?sim=${Date.now()}`;
  setReloadKey(k => k + 1);
}} style={simBtnStyle}>♻ إعادة تحميل السيم</button>
```
هذا يحافظ على القدرة على force-reload عند الحاجة دون الاعتماد على side-effect غير مقصود.

### تنظيف إضافي (إزالة تحذيرات console المرفقة)

تحذيرات `forwardRef` لـ `SimulatorPanel`، `AnalyticsPanel`، و `Admin` ناتجة عن `React.lazy(...)` في `App.tsx` الذي قد يُمرّر `ref` ضمنياً. الحل البسيط: لف المكونات الثلاثة بـ `React.forwardRef`:
```tsx
const SimulatorPanel = React.forwardRef<HTMLDivElement, { isDesktop: boolean }>((props, ref) => { ... });
SimulatorPanel.displayName = 'SimulatorPanel';
```
(تطبيق نفس الشيء على `AnalyticsPanel` و `MessagesPanel` إن لزم.)

---

## ✅ النتيجة المتوقعة

- iframe السيم يبقى **ثابتاً** بعد mount واحد — لا حلقة reload
- المقدمة تكتمل بشكل طبيعي: الدراجة تدخل → اللاعب ينزل → الدراجة تغادر → اللعبة تبدأ
- الإحصائيات (HP/Ammo/Wave/Phase) تتحدث كل 500ms **بدون أن تُعيد تحميل اللعبة**
- زر "♻ إعادة تحميل السيم" يعمل عند الحاجة لاختبار سيناريو من البداية
- اختفاء تحذيرات `forwardRef` من console