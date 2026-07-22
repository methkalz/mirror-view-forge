<div dir="rtl">

# دليل نشر تحصين الخلفية (Backend Hardening) — SKYFALL

> **الغرض:** إغلاق ثغرتَي نزاهة المتصدّرين (§4.1 و§4.2 من الدراسة) دون كسر تسجيل النتائج للّاعبين الأحياء.
> **مبدأ:** الخطوات الآمنة أولاً، والخطوة التي قد تكسر التسجيل **أخيراً** وبترتيب صارم.

هذا الدليل يرافق ملفَّين جاهزَين في المستودع (خاملَين حتى تنشرهما بنفسك):
- `supabase/functions/submit-score/index.ts` — دالة Edge للتقديم الخادمي.
- `supabase/migrations/20260722000000_drop_permissive_scenes_policy.sql` — تشديد RLS آمن للمشاهد.

---

## ما تم إنجازه بالفعل على جانب العميل (منشور بأمان)

- **حجب god mode** عن نسخة الإنتاج (`__SKYFALL_DEBUG__` يُرفَق فقط في DEV أو المحاكي `?sim`)، وتخطّي التقديم إن فُعّل أي غش. هذا يغلق §4.2 على جانب العميل بالفعل، دون أي تغيير خادمي.

---

## الترتيب الصارم للنشر (لا تُقدّم خطوة على أخرى)

### الخطوة 1 — تشديد المشاهد (آمن، مستقلّ)
ترحيل `20260722000000_drop_permissive_scenes_policy.sql` **آمن تماماً** ولا يعتمد على أي كود عميل:
- الإدمن يحتفظ بإدارة المشاهد (سياسات admin-scoped موجودة مسبقاً).
- اللعبة تحتفظ بقراءة المشاهد (سياسة "Anyone can read scenes").
- يُغلق فقط ثغرة الكتابة لغير الإدمن.

يُطبَّق تلقائياً عند أول نشر يتضمّن الترحيل، أو يدوياً:
```sql
DROP POLICY IF EXISTS "Authenticated users manage scenes" ON public.scenes;
```

### الخطوة 2 — نشر دالة Edge (لا تكسر شيئاً بعد)
```bash
supabase functions deploy submit-score --no-verify-jwt
```
- `--no-verify-jwt` لأنّ اللاعبين مجهولون بلا JWT.
- الدالة تقرأ `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` من أسرار المشروع (متوفّرة افتراضياً في Edge Functions — تأكّد فقط أنّ service role غير مكشوف في حزمة العميل).
- بعد النشر، جرّبها بـ `curl` بنتيجة معقولة وتحقّق من ظهور صفّ في `leaderboard`. في هذه المرحلة **مسار الإدراج المباشر القديم لا يزال يعمل**، فلا شيء انكسر.

### الخطوة 3 — تحويل العميل لاستدعاء الدالة
عدّل `src/game/config.ts` — استبدل الإدراج المباشر في `submitScore` باستدعاء الدالة:

```ts
export async function submitScore(
  playerName: string,
  score: number,
  wavesReached: number,
  levelReached: number,
  stats?: { timeSurvived?: number; dronesDestroyed?: number; powerUpsCollected?: number; closeCalls?: number; bossesDefeated?: number }
): Promise<{ rank: number | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('submit-score', {
      body: {
        playerName: playerName.slice(0, 20),
        score,
        wavesReached,
        levelReached,
        stats,
      },
    });
    if (error) return { rank: null };
    return { rank: (data as { rank: number | null })?.rank ?? null };
  } catch {
    return { rank: null };
  }
}
```

- انشر هذا التغيير وتأكّد أنّ التقديم يعمل عبر الدالة (لاعب حقيقي يظهر في المتصدّرين، والرتبة تعود صحيحة).
- **حتى هذه اللحظة، الإدراج المباشر لا يزال مسموحاً في RLS** — أي أنّ العميل الآن يستخدم الدالة، لكن الطريق القديم ما زال مفتوحاً كشبكة أمان. لا شيء انكسر.

### الخطوة 4 (الأخيرة والحسّاسة) — إلغاء الإدراج المباشر
**لا تُنفّذها إلا بعد التأكّد أنّ الخطوة 3 تعمل في الإنتاج.** بمجرّد تنفيذها يصبح الطريق الوحيد للكتابة هو الدالة:

```sql
-- Leaderboard: only the edge function (service role) may insert now.
DROP POLICY IF EXISTS "Anyone can submit scores" ON public.leaderboard;

-- Game sessions: same — remove any anon/authenticated INSERT policy.
DROP POLICY IF EXISTS "Anyone can insert game_sessions" ON public.game_sessions;
-- (استخدم اسم السياسة الفعلي لديك؛ راجع: select policyname from pg_policies where tablename='game_sessions';)

-- Prize entries: route through the edge function too (Phase 5) — حتى ذلك الحين
-- أبقِ سياستها كما هي أو أضِف تحقّق رتبة خادمي لاحقاً.
```

> **تحقّق بعد الخطوة 4:** جرّب `curl` مباشراً على `/rest/v1/leaderboard` بمفتاح anon — يجب أن يُرفض الآن (RLS)، بينما تقديم اللاعب عبر الدالة يعمل.

---

## التراجع (Rollback) إن حدث خطأ

- **إن انكسر التقديم بعد الخطوة 4:** أعِد إنشاء سياسة الإدراج مؤقّتاً لاستعادة الخدمة فوراً:
  ```sql
  CREATE POLICY "Anyone can submit scores" ON public.leaderboard
    FOR INSERT TO anon, authenticated
    WITH CHECK (score >= 0 AND score <= 999999
      AND length(player_name) >= 1 AND length(player_name) <= 20);
  ```
  ثم شخّص مشكلة الدالة/العميل قبل إعادة المحاولة.
- **الخطوتان 1 و2 لا تحتاجان تراجعاً** (آمنتان).

---

## Phase 5 (لاحقاً) — التحصين الكامل

يُبنى فوق هذه القاعدة:
1. **رمز جولة موقّع** عند البدء (id + بذرة + إصدار إعداد + طابع خادم).
2. **تحقّق replay بإعادة محاكاة حتمية** للفائزين — يتطلّب `fixed-timestep` + `PRNG` مبذور (Phase 1).
3. **rate limiting** لكل IP/جهاز + **كشف شذوذ إحصائي** ليلي (pg_cron) يُغذّي جدول مراجعة في لوحة الإدارة.
4. توجيه `prize_entries` عبر نفس الدالة مع اشتقاق الرتبة خادمياً.

</div>
