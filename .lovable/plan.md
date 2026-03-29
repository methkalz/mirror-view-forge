

# عكس ترتيب البطاقات والدراجة + إضافة مفهوم Level vs Wave

## التدفق الجديد

```text
Wave ends → Clearing → Cards (7s timeout) → Bike enters/stops 4s/leaves → Next Wave

Level = كل 3 موجات (Level 1 = Waves 1-3, Level 2 = Waves 4-6...)
Wave = موجة فردية داخل المستوى
```

## التغييرات

### 1. `src/game/types.ts`
- إضافة `levelNumber: number` إلى `GameData`
- تعديل `WavePhase` لإضافة `'bike'` كمرحلة منفصلة: `'active' | 'clearing' | 'cards' | 'bike'`
- إزالة `restTimer` (لم يعد هناك مرحلة rest مستقلة)

### 2. `src/game/engine.ts` — إعادة هيكلة تدفق الموجات

**المرحلة `clearing`**: عند انتهاء التهديدات → الانتقال مباشرة لـ `cards` (بدلاً من `rest`)

**المرحلة `cards`** (الآن أولاً):
- تظهر 3 بطاقات فوراً
- مهلة **7 ثوانٍ** للاختيار (بدلاً من 8)
- عند الاختيار أو انتهاء الوقت → الانتقال لـ `bike`

**المرحلة `bike`** (جديدة):
- تدخل الدراجة فوراً
- تتوقف **4 ثوانٍ** (بدلاً من 2.5)
- عند مغادرة الدراجة → بدء الموجة التالية

**`applyUpgrade`**: لا تبدأ الموجة مباشرة — تنتقل لـ `bike` فقط

**Level System**:
- `levelNumber` يزداد كل 3 موجات
- يؤثر على الصعوبة (كثافة أعلى، أنواع جديدة)
- يظهر في HUD

### 3. `src/game/renderer.ts`
- تعديل `renderUpgradeCards`: مهلة 7ث بدلاً من 8ث
- تعديل `renderRestOverlay`: يعمل في مرحلة `bike` أيضاً
- تعديل `renderWaveIndicator`: عرض Level + Wave (مثل `LVL 2 — WAVE 5`)
- إظهار "LEVEL UP!" عند الانتقال لمستوى جديد

### 4. `src/game/engine.ts` — تعديل `idleTimer` الدراجة لـ 4 ثوانٍ

## الملفات المتأثرة
1. **`src/game/types.ts`** — `levelNumber`, `WavePhase` += `'bike'`
2. **`src/game/engine.ts`** — إعادة ترتيب التدفق + level system
3. **`src/game/renderer.ts`** — HUD + توقيتات

