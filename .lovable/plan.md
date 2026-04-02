

# إصلاح: إعدادات الموجات من لوحة التحكم لا تُطبَّق فعلياً

## المشاكل المكتشفة

بعد فحص دقيق لقاعدة البيانات والكود، وجدت **4 أخطاء جوهرية** تمنع تطبيق إعدادات الأدمن:

### 1. مؤقتات الطائرات مرتفعة جداً ولا تُعاد ضبطها
في `resetGame()`:
- `g.droneTimer = 90` — الطائرات العادية لن تظهر إلا بعد 90 ثانية
- `g.incendiaryTimer = 160` — الطائرات الحارقة بعد 160 ثانية  
- `g.chemicalTimer = 200` — الطائرات الكيميائية بعد 200 ثانية

**مثال**: الأدمن وضع `has_chemical: true` للموجة 1 (مدتها 40 ثانية)، لكن الطائرات الكيميائية لن تظهر أبداً لأن المؤقت يبدأ من 200!

### 2. `startNextWave()` لا تُعيد ضبط المؤقتات
عند الانتقال لموجة جديدة، لا يتم ضبط `droneTimer`/`incendiaryTimer`/`chemicalTimer` حسب وصفة الموجة الجديدة. فالطائرات تبقى معتمدة على المؤقتات القديمة.

### 3. `resetGame()` تكتب فوق إعدادات الـ Remote Config
في `SkyfallGame.tsx`:
```
g.spawnTimer = cfg.spawnInterval;  // يُضبط من DB
resetGame(g);  // يكتب فوقه g.spawnTimer = 3.5!
```
الترتيب خاطئ — `resetGame` تُعيد `spawnTimer` إلى 3.5 بعد ضبطه.

### 4. `warningSoundKey` لا يُستخدم
الأدمن يستطيع تعيين `warning_sound_key` لكل موجة، لكن الكود لا يستخدمه أبداً عند عرض التحذيرات.

## الحل — ملف واحد: `src/game/engine.ts`

### التغيير 1: `resetGame()` — ضبط المؤقتات من وصفة الموجة 1
```typescript
const wave1Recipe = getWaveRecipe(1, g);
g.waveTimer = wave1Recipe.duration || 60;
g.bulletLevel = wave1Recipe.bulletLevel;
// ضبط مؤقتات الطائرات حسب الوصفة بدل القيم الثابتة
g.droneTimer = wave1Recipe.droneInterval > 0 ? (wave1Recipe.droneInterval * 0.5) : 90;
g.incendiaryTimer = wave1Recipe.hasIncendiary ? (8 + Math.random() * 10) : 160;
g.chemicalTimer = wave1Recipe.hasChemical ? (10 + Math.random() * 10) : 200;
```

### التغيير 2: `startNextWave()` — إعادة ضبط المؤقتات لكل موجة
```typescript
// بعد g.bulletLevel:
if (recipe.droneInterval > 0) g.droneTimer = Math.min(g.droneTimer, recipe.droneInterval * 0.3);
if (recipe.hasIncendiary) g.incendiaryTimer = Math.min(g.incendiaryTimer, 8 + Math.random() * 8);
if (recipe.hasChemical) g.chemicalTimer = Math.min(g.chemicalTimer, 10 + Math.random() * 8);
```

### التغيير 3: `WaveRecipe` — إضافة `warningSoundKey`
إضافة الحقل للـ interface واستخدامه في `queueWaveEvent` لتشغيل الصوت المحدد من الأدمن.

## النتيجة
كل إعداد يضبطه الأدمن في لوحة التحكم (مدة الموجة، أنواع التهديدات، الطائرات، التحذيرات) سيُطبَّق فعلياً في اللعبة.

