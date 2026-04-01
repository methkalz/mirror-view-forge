# إعادة تصميم شاشة نهاية اللعبة بالكامل — عربية + جدول ترتيب مدمج

## المشكلة

1. شاشة Game Over بالإنجليزية (GAME OVER, Time, Close Calls, etc.)
2. جدول الترتيب يظهر كـ HTML overlay منفصل ويستمر بالظهور عند إعادة البدء
3. التصميم غير متناسق مع الهوية العربية للعبة

## الحل: دمج كل شيء في Canvas بالعربية

### 1. `src/game/renderer.ts` — إعادة كتابة `renderGameOver` بالكامل

**الشاشة ستعرض بالترتيب الزمني:**


| التوقيت | العنصر                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------- |
| 0.2s    | عنوان "انتهت اللعبة" بخط Tajawal أحمر متوهج (بدل GAME OVER)                                     |
| 0.5s    | النتيجة مع عداد تصاعدي + "أعلى علامة" بدل Best                                                  |
| 1.0s    | رقم الموجة: "الموجة X"                                                                          |
| 1.2s    | بطاقات الإحصائيات بالعربية (RTL): ⏱ الوقت، 💀 طائرات، 📦 تعزيزات، ✕ نجاة بأعجوبة، ⚔ زعماء       |
| 2.0s    | جدول الترتيب مدمج في Canvas — عنوان "أقوى ناس 🏆" مع 5 إدخالات + ميداليات + تمييز اللاعب الحالي |
| 2.5s    | زر "اضغط للإعادة" بدل TAP TO RESTART                                                            |


مع الأخذ بعين الاعتبار الا تكون الترجمة حرفية للكلمات والتهديدات.. ابداعية رسمية

&nbsp;

**تفاصيل جدول الترتيب في Canvas:**

- يُرسم بدلاً من HTML overlay
- يأخذ البيانات عبر parameters جديدة: `leaderboard`, `playerName`, `playerRank`
- يعرض أعلى 5 إدخالات مع ميداليات 🥇🥈🥉
- إذا اللاعب ليس ضمن الـ5: صف إضافي منفصل "#ترتيبه"
- تمييز صف اللاعب الحالي بخلفية ذهبية

### 2. `src/components/SkyfallGame.tsx`

- **حذف** HTML overlay لجدول الترتيب في حالة gameOver (سطور 486-510)
- تمرير `leaderboard`, `playerName`, `gameOverData` إلى `renderGameOver`
- تحديث استدعاء `renderGameOver`:

```typescript
renderGameOver(ctx, w, h, g.score, g.highScore, g.stats, 
  leaderboard, playerName, gameOverData?.rank ?? null, g.waveNumber);
```

- التأكد أن `setGameOverData(null)` يُنفذ فوراً عند إعادة البدء (موجود بالفعل في سطور 278, 296)

### 3. `src/game/renderer.ts` — تحديث توقيع الدالة

```typescript
export function renderGameOver(
  ctx, w, h, score, highScore, stats,
  leaderboard?: LeaderboardEntry[],
  playerName?: string,
  playerRank?: number | null,
  waveNumber?: number
)
```

## الملفات المتأثرة

1. `**src/game/renderer.ts**` — إعادة كتابة renderGameOver بالعربية + رسم جدول ترتيب Canvas
2. `**src/components/SkyfallGame.tsx**` — حذف HTML overlay + تمرير بيانات الترتيب لـ renderer