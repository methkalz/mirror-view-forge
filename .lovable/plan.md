## مهمتان

### 1. تصحيح نص "المرحلة الأخيرة" للزعيم

**المشكلة**: في `src/game/engine.ts` (سطر 3385) عند انتقال الزعيم لطوره الثالث تظهر:

```
⚡ المرحلة الأخيرة!
```

هذا يوحي للاعب أن اللعبة على وشك الانتهاء، بينما اللعبة لا نهائية.

**التغيير**: استبدال النص بـ:

```typescript
const phaseText = newPhase === 2 ? '⚡ انتبه' : '🔥 ولّعت عنجد';
```

(لن نلمس نص آخر 5 ثوانٍ من الموجة `FINAL BARRAGE` لأنك أوضحت أنه ليس المقصود.)

---

### 2. عرض دعوة جوائز عند دخول قائمة العشرة الأوائل

**السيناريو**: عند انتهاء اللعبة، إذا كانت نتيجة اللاعب ضمن أول 10 (rank ≤ 10)، تظهر له بطاقة فوق شاشة Game Over تحتوي:

- النص: «أنت من أول 10 أبطال 🏆 — اترك رقمك وادخل السحب على جوائز مش قيّمة بس مليحة»
- اسمه (للقراءة فقط — كما أدخله)
- خانة إدخال رقم الهاتف
- زر «ابعث الرقم» (أساسي)
- زر «بدّيش جوائز» (ثانوي — يغلق البطاقة فقط)
- بعد أيٍّ منهما يستطيع المتابعة كباقي اللاعبين (إعادة لعب، إلخ)

**شروط الإظهار**:

- البطاقة تظهر مرة واحدة فقط لكل جلسة Game Over
- لا تظهر إذا rank > 10 أو rank = null
- لا تظهر إذا اللاعب أرسل/رفض من قبل (بنفس الجولة) — يُتتبع بـ `useRef`

---

### الجانب التقني

**أ. قاعدة البيانات — جدول جديد `prize_entries**`

```sql
CREATE TABLE public.prize_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  phone text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  rank integer,
  waves_reached integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prize_entries ENABLE ROW LEVEL SECURITY;

-- أي زائر يدخل رقمه (مع تحقق صارم على الطول والمحتوى)
CREATE POLICY "Anyone can submit phone"
ON public.prize_entries FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(player_name) BETWEEN 1 AND 20
  AND length(phone) BETWEEN 6 AND 20
  AND phone ~ '^[+0-9 \-]+$'
  AND score >= 0 AND score <= 999999
);

-- الأدمن فقط يرى/يحذف
CREATE POLICY "Admins can read prize_entries"
ON public.prize_entries FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete prize_entries"
ON public.prize_entries FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

**ب. لوحة التحكم — تبويب جديد في `src/pages/Admin.tsx**`

تبويب «الأبطال الأوائل» يعرض جدولاً (الاسم، الرقم، النقاط، الترتيب، الموجة، التاريخ) مع زر تصدير CSV ومسح الإدخالات.

**ج. كود إرسال الإدخال — في `src/game/config.ts**`

```typescript
export async function submitPrizeEntry(playerName: string, phone: string, score: number, rank: number, waves: number): Promise<boolean>
```

مع تحقق Zod على العميل: `phone` يطابق `^[+0-9\s\-]{6,20}$` بعد `trim`.

**د. واجهة البطاقة — مكون جديد `src/components/PrizeEntryCard.tsx**`

- يطابق اللغة البصرية لـ `NameEntry.tsx`: glass card، ألوان أحمر/ذهبي، خط Tajawal، RTL، HUD corner brackets.
- ظهور بـ fade-in فوق Canvas Game Over (zIndex عالٍ، خلفية شبه شفافة).
- يستقبل `playerName, score, rank, waves, onSubmitted, onDismiss`.
- زرّان أسفل الإدخال: «ابعث الرقم» (أساسي أحمر) + «بدّيش جوائز» (شفاف).
- بعد الإرسال الناجح: toast «تم — حظًا موفقًا!» ثم إغلاق فوري.

**هـ. ربط البطاقة في `SkyfallGame.tsx**`

- state جديد: `showPrizeCard: boolean`، ref: `prizeShownRef`
- في كتلة `g.state === 'gameover'` بعد استلام `rank` من `submitScore`:
  ```typescript
  if (rank && rank <= 10 && !prizeShownRef.current) {
    prizeShownRef.current = true;
    setShowPrizeCard(true);
  }
  ```
- إعادة `prizeShownRef = false` و `setShowPrizeCard(false)` عند العودة لـ `start`.
- البطاقة تُرسم كعنصر React فوق الـ canvas (مثل `NameEntry`).

### الملفات المتأثرة

- `src/game/engine.ts` (تعديل سطر واحد)
- `supabase/migrations/` (جدول جديد + RLS)
- `src/integrations/supabase/types.ts` (تلقائي)
- `src/game/config.ts` (دالة `submitPrizeEntry` + استعلام أدمن)
- `src/components/PrizeEntryCard.tsx` (جديد)
- `src/components/SkyfallGame.tsx` (state + render conditional)
- `src/pages/Admin.tsx` (تبويب جديد)