

# تعديلات المنطق + طائرة حاملة جديدة (Cargo Drone)

## التغييرات المطلوبة

### 1. أول صندوق = ذخيرة (الثانية 10-15)

**`src/game/engine.ts`**:
- إضافة حقل `firstAmmoDropped: boolean` إلى `GameData` في `types.ts`
- في `resetGame`: تعيينه `false`
- في حلقة `powerUpTimer`: عند `elapsed >= 10 && !g.firstAmmoDropped`، فرض إسقاط صندوق ذخيرة مباشرة بدلاً من عشوائي، ثم `firstAmmoDropped = true`
- تعيين `powerUpTimer` الأولي إلى `10 + Math.random() * 5` بدلاً من `8`

### 2. خفض الارتداد عند الإطلاق

**`src/game/engine.ts`** سطر 689:
- تغيير `p.velocity.x += p.facingRight ? -60 : 60` إلى `p.velocity.x += p.facingRight ? -18 : 18`
- الارتداد البصري (تحريك sprite فقط) يبقى كما هو في renderer عبر `shootTimer`

### 3. خفض Dash Cooldown

**`src/game/engine.ts`** سطر 10:
- تغيير `DASH_COOLDOWN = 1.2` إلى `DASH_COOLDOWN = 0.8`
- عند التقاط medkit أو ammo: إعادة شحن الـ dash فوراً (`p.dashCooldown = 0`)

### 4. منع تراكم Hit Stop

**`src/game/engine.ts`**:
- تغيير كل `g.hitStopTimer = X` إلى `g.hitStopTimer = Math.max(g.hitStopTimer, X)` — يأخذ الأطول فقط بدون تراكم

### 5. طائرة حاملة (Cargo Drone) — عنصر جديد

**`src/game/types.ts`**:
- إضافة `'cargo'` إلى `DroneTier`
- إضافة `cargoType?: PowerUpType` و `label?: string` إلى `Drone`

**`src/game/engine.ts`**:
- دالة `spawnCargoDrone(g)`: تنشئ طائرة بـ `tier: 'cargo'`
  - تطير عالياً جداً (y = 8-12% من الشاشة)
  - سرعة بطيئة ثابتة أفقياً (40-60 px/s)
  - `health = 3` (تحتاج 3 رصاصات)
  - `cargoType` عشوائي بين `'airstrike'` و `'medkit'`
  - `label = 'OTLOP'`
  - لون برتقالي (`colorHue` مخصص)
- عند تدمير cargo drone: إسقاط power-up من نوع `cargoType` في موقعها
- التوقيت: تظهر أول مرة عند ~120ث، ثم كل 60-90ث
- لا تهاجم اللاعب — مسالمة تماماً، تعبر الشاشة وتختفي

**`src/game/renderer.ts`**:
- في `renderDrones`: حالة خاصة لـ `tier === 'cargo'`:
  - جسم برتقالي أكبر (حجم ~35px)
  - نص "OTLOP" مكتوب على الجسم
  - صندوق ذهبي معلق أسفلها بحبل
  - محركات مزدوجة على الجانبين

### 6. ضمان استخدام dt في فيزياء الصاروخ المتشظي

**`src/game/engine.ts`**: مراجعة وتأكيد أن جميع معادلات cluster missile تستخدم `dt` (مؤكد حالياً — فقط تدقيق)

---

## الملفات المتأثرة
1. **`src/game/types.ts`** — `firstAmmoDropped`، `cargo` tier، حقول cargo
2. **`src/game/engine.ts`** — أول ذخيرة، ارتداد، cooldown، hit stop، cargo drone
3. **`src/game/renderer.ts`** — رسم cargo drone

