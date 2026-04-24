
# 🎯 الخطة: نقل كل رسائل اللعبة للوحة التحكم

## 📊 الوضع الحالي (تم تأكيده)

**الرسائل المدمجة في `WAVE_WARNINGS` (engine.ts:855-893)** — 25 رسالة لـ 16 موجة:
- موجات بـرسالة واحدة: 1, 3, 6, 9, 10, 13, 14, 15, 16
- موجات بـرسالتين: 2, 4, 8, 11, 12
- موجات بـ3 رسائل: 5, 7

**الرسائل الديناميكية (cinematicWarning في engine.ts)**:
| السطر | الحدث | النص الحالي |
|---|---|---|
| 1722 | swarm | ⚠ سرب طائرات! |
| 1755 | minefield | ⚠ عسكري يزرع ألغام! |
| 1838 | volley | ⚠ وابل صواريخ! |
| 1855 | airstrike_flyby | ⚠ قصف جوي! |

**رسائل البوس (تحتاج بحث إضافي أثناء التنفيذ)**: دخول البوس، المرحلة 2، المرحلة 3.

---

## ✅ المرحلة 1: تحديثات بيانات فورية (DB UPDATE)

```sql
-- W5: تغيير لإمدادات (أخضر)
UPDATE wave_configs SET warning_type='upgrade', warning_color='#22c55e' WHERE wave_number=5;
-- W1: ربط صوت "خبر عاجل"
UPDATE wave_configs SET warning_sound_key='breakingNews' WHERE wave_number=1;
```

---

## ✅ المرحلة 2: ترقية المخطط (Migration)

```sql
ALTER TABLE wave_configs 
  ADD COLUMN warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE dynamic_warnings (
  event_key TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#ef4444',
  sound_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  duration REAL NOT NULL DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE dynamic_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read" ON dynamic_warnings FOR SELECT USING (true);
CREATE POLICY "Admins manage" ON dynamic_warnings FOR ALL TO authenticated 
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
```

**بنية كل عنصر في `warnings[]`**:
```json
{ "id": "w5_extinguisher", "text": "...", "sub": "", "color": "#f97316", "type": "upgrade", "soundKey": "upgradeAlert" }
```

---

## ✅ المرحلة 3: زرع البيانات (Data INSERT)

- نقل جميع رسائل `WAVE_WARNINGS` (16 موجة) إلى `wave_configs.warnings` لكل موجة موجودة بالجدول، مع ربط أصوات افتراضية مناسبة.
- زرع 4 صفوف على الأقل في `dynamic_warnings`: `swarm`, `minefield`, `volley`, `airstrike_flyby` بالنصوص والألوان الحالية + الأصوات المناسبة من `audio_config`.

---

## ✅ المرحلة 4: تعديلات الكود

### `src/game/config.ts`
- إضافة حقل `warnings: WarningEntry[]` إلى `RemoteWaveConfig`.
- في `mapToRecipe()`: تمرير `warnings` كما هي.

### `src/game/engine.ts`
- **منطق الموجات (سطر ~1963-1980)**: استبدال قراءة `recipe.warningText` المفرد بحلقة `for` على `recipe.warnings[]` تستدعي `queueWaveEvent` لكل عنصر. إذا كانت `warnings` فارغة → fallback إلى `WAVE_WARNINGS` المدمج (للسلامة).
- **الرسائل الديناميكية** (الأسطر 1722, 1755, 1838, 1855): جلب النصوص من `g.dynamicWarnings` (Map محملة عند بدء اللعبة) بدلاً من النصوص الثابتة. مع fallback نهائي إلى النص الحالي.
- إضافة دالة `loadDynamicWarnings()` تُستدعى عند `gameStart`.

### `src/components/SkyfallGame.tsx`
- جلب `dynamic_warnings` و `wave_configs` (يتم بالفعل) وتمريرها للمحرك.

---

## ✅ المرحلة 5: محرر الرسائل المتعددة في `Admin.tsx`

**استبدال البلوك "📢 رسالة الموجة" (Admin.tsx:2915-2954)** بمكوّن `WarningsListEditor`:
- زر **➕ إضافة رسالة** أعلى البطاقة.
- لكل رسالة: بطاقة مدمجة فيها:
  - `<Input>` للنص
  - زرّان (⚠️ تحذير / ⬆️ ترقية) لتحديد النوع
  - `<input type=color>` للون
  - `<Select>` للصوت يقرأ من `audio_config WHERE category='warnings'` + خيار "بدون صوت"
  - زر `<X>` حذف
- حفظ كامل المصفوفة في `wave_configs.warnings` عند الضغط على "حفظ".
- إزالة بطاقة "📋 رسائل مدمجة (ثابتة)" — لم تعد ذات صلة.

---

## ✅ المرحلة 6: قسم "الرسائل الديناميكية"

**تبويب جديد `<TabsTrigger value="dynamic">` في `/admin`**:
- جدول بسيط لكل صف من `dynamic_warnings`:
  - النص (Input)
  - اللون (color picker)
  - الصوت (Select من warnings)
  - مفتاح Enabled (Switch)
- زر "حفظ التغييرات" في الأسفل.

---

## ✅ المرحلة 7: التحقق

- ✅ تعديل رسالة من اللوحة → تظهر بالنص الجديد في اللعبة.
- ✅ إضافة رسالة ثانية للموجة 1 → تظهر الاثنتان بالتسلسل.
- ✅ حذف كل رسائل موجة → لا يظهر شيء (يعمل fallback آمن إن كان مطلوباً).
- ✅ تعديل نص "سرب طائرات" → يظهر النص الجديد عند بدء سرب.
- ✅ صوت `breakingNews` يشتغل مع رسالة الموجة 1.

---

## 🛡️ ضمانات السلامة

1. **التوافق العكسي**: الحقول القديمة (`warning_text`, `warning_type`, `warning_color`, `warning_sound_key`) تبقى. إن وُجد `warning_text` ولم يوجد `warnings[]` → يُحوَّل تلقائياً لعنصر واحد.
2. **Fallback مزدوج**: DB → `WAVE_WARNINGS` المدمج → لا شيء.
3. **بدون breaking changes** في `engine.ts` لمنطق اللعب الأساسي — فقط مصدر النصوص يتغير.

---

## 📦 الملفات المتأثرة

| الملف | التغيير |
|---|---|
| Migration جديدة | `+warnings` column + `dynamic_warnings` table |
| Data inserts | زرع 25+ رسالة موجة + 4 رسائل ديناميكية |
| `src/game/config.ts` | إضافة `warnings` لـ `RemoteWaveConfig` |
| `src/game/engine.ts` | قراءة من `recipe.warnings[]` + `g.dynamicWarnings` |
| `src/components/SkyfallGame.tsx` | تمرير `dynamicWarnings` للمحرك |
| `src/pages/Admin.tsx` | محرر مصفوفة + تبويب الرسائل الديناميكية |

---

**عند الموافقة → أنفذ بالترتيب 1→7 وأرسل تحديثاً بعد كل مرحلة رئيسية.**
