

# تحويل Skyfall Survival إلى منصة LiveOps — Lovable Cloud

## ملخص المشروع

بناء نظام backend كامل مع لوحة تحكم أدمن + لوحة متصدرين + نظام إعدادات ديناميكي، باستخدام Lovable Cloud (Supabase مدمج).

---

## المرحلة 1: قاعدة البيانات (3 جداول)

### جدول `leaderboard`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | auto |
| player_name | text NOT NULL | max 20 chars |
| score | integer | |
| waves_reached | integer | |
| level_reached | integer | |
| created_at | timestamptz | default now() |

### جدول `game_config`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | single row |
| gravity | float | default 1.0 |
| base_speed | float | default 260 |
| spawn_interval | float | default 3.5 |
| difficulty_multiplier | float | default 1.0 |
| dda_enabled | boolean | default true |
| global_pause | boolean | default false |
| updated_at | timestamptz | |

### جدول `wave_configs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| wave_number | integer UNIQUE | |
| duration | float | seconds |
| threats | jsonb | `["shrapnel","missile"]` |
| max_concurrent | integer | |
| spawn_rate | float | |
| surge_multiplier | float | |
| drone_types | jsonb | `["scout","bomber"]` |

### RLS
- `leaderboard`: SELECT للجميع (anon)، INSERT للجميع (anon)، DELETE/UPDATE للأدمن فقط
- `game_config`: SELECT للجميع، UPDATE للأدمن فقط
- `wave_configs`: SELECT للجميع، INSERT/UPDATE/DELETE للأدمن فقط

### جدول `user_roles`
- للتحكم بصلاحيات الأدمن عبر `has_role()` function

---

## المرحلة 2: تدفق اللاعب (Player Flow)

### شاشة إدخال الاسم (Start Screen)
- حقل إدخال أنيق بتصميم Glassmorphism فوق شاشة البداية الحالية
- الحد الأقصى 20 حرف، التحقق من عدم الفراغ
- يُحفظ الاسم في `localStorage` + يُستخدم عند إرسال النتيجة
- زر "ابدأ" لا يعمل بدون اسم

### لوحة المتصدرين (Leaderboard)
- تُعرض في شاشة البداية وشاشة Game Over
- تصميم Glassmorphism شفاف فوق الخلفية
- Top 10 مع الترتيب، الاسم، النقاط، الموجات
- تمييز ترتيب اللاعب الحالي إن كان ضمن الـ 10

### شاشة Game Over المحسّنة
- عرض نتيجة اللاعب + ترتيبه في القائمة العالمية
- إرسال النتيجة تلقائياً للـ leaderboard
- Toast احتفالي إذا دخل Top 10

---

## المرحلة 3: محرك اللعبة الديناميكي

### `src/game/config.ts` (ملف جديد)
```typescript
// يجلب الإعدادات من Supabase عند بدء اللعبة
export async function fetchGameConfig(): Promise<GameConfig>
export async function fetchWaveConfigs(): Promise<WaveConfig[]>
export async function submitScore(name, score, waves, level): Promise<void>
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]>
```

### تعديل `engine.ts`
- `resetGame()` يستقبل `GameConfig` اختياري من الـ fetch
- نظام الموجات يقرأ من `wave_configs` المجلوبة — إذا لم يوجد config لموجة معينة، يولّد نسخة أصعب من آخر موجة موجودة (procedural)
- **DDA**: إذا صحة اللاعب 100% لأكثر من 15 ثانية، يُضرب `difficulty` × 1.2

### الأداء
- جميع الـ DB calls تتم **قبل** بدء حلقة اللعبة (في `resetGame` أو شاشة البداية)
- لا يوجد أي DB call داخل الـ game loop — صفر تأثير على الـ 60 FPS
- إرسال النتيجة يتم بعد Game Over (خارج الحلقة)

---

## المرحلة 4: لوحة تحكم الأدمن (`/admin`)

### تسجيل دخول الأدمن
- صفحة `/admin` محمية بتسجيل دخول (email/password)
- التحقق من الدور عبر `user_roles` table

### واجهة لوحة التحكم (متجاوبة — تعمل على الموبايل)
1. **Game Config Panel**: Sliders لتعديل السرعة، الجاذبية، فاصل الإسقاط، مضاعف الصعوبة + مفتاح الإيقاف المؤقت (Kill Switch)
2. **Wave Editor**: جدول قابل للتعديل — لكل موجة: التهديدات (checkboxes)، الحد الأقصى المتزامن، معدل الإسقاط، مضاعف الهجوم الأخير
3. **Leaderboard Management**: عرض + حذف إدخالات + زر تصفير كامل

### التحديث الفوري
- التعديلات تُحفظ مباشرة في Supabase
- اللاعب التالي الذي يبدأ لعبة جديدة يحصل على الإعدادات المحدّثة

---

## المرحلة 5: الصفحات والتوجيه

```text
/           → شاشة اللعبة (إدخال اسم + لوحة متصدرين + اللعبة)
/admin      → تسجيل دخول الأدمن + لوحة التحكم
```

---

## الملفات المتأثرة / الجديدة

| ملف | تغيير |
|-----|--------|
| `src/game/config.ts` | **جديد** — دوال الاتصال بـ Supabase |
| `src/game/engine.ts` | تعديل — استقبال config ديناميكي + DDA |
| `src/game/types.ts` | تعديل — إضافة أنواع GameConfig, WaveConfig |
| `src/components/SkyfallGame.tsx` | تعديل — إضافة شاشة إدخال الاسم + لوحة متصدرين |
| `src/components/NameEntry.tsx` | **جديد** — حقل إدخال الاسم |
| `src/components/Leaderboard.tsx` | **جديد** — عرض Top 10 |
| `src/pages/Admin.tsx` | **جديد** — لوحة التحكم الكاملة |
| `src/pages/AdminLogin.tsx` | **جديد** — تسجيل دخول الأدمن |
| `src/App.tsx` | تعديل — إضافة route `/admin` |
| Lovable Cloud | إنشاء الجداول + RLS + user_roles |

---

## ترتيب التنفيذ

1. إنشاء جداول قاعدة البيانات + RLS + دور الأدمن
2. `config.ts` — دوال الاتصال
3. شاشة إدخال الاسم + ربطها باللعبة
4. لوحة المتصدرين + إرسال النتائج
5. تعديل المحرك للقراءة الديناميكية + DDA
6. لوحة تحكم الأدمن + Wave Editor
7. اختبار شامل

