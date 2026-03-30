

# إضافة Swipe أفقي + تحسين عناوين الشرائح

## التغييرات

### 1. `src/components/SkyfallGame.tsx` — نظام Swipe
- تتبع `touchStartX` و `touchStartY` عند `pointerdown` في حالة `start`
- عند `pointerup`: حساب `deltaX = endX - startX`
- إذا `|deltaX| > 50px` (حد أدنى للسحب):
  - سحب لليسار (`deltaX < 0`): الشريحة التالية (`tutorialPage++`)
  - سحب لليمين (`deltaX > 0`): الشريحة السابقة (`tutorialPage--`)
  - مع حدود `clamp(0, 3)`
  - ضبط `tutorialFade = 0` للانتقال
- إذا `|deltaX| < 15px`: معاملة كنقرة عادية (سلوك حالي)
- تخزين الإحداثيات في `_swipeStartX/Y` على `inputRef`

### 2. `src/game/renderer.ts` — عناوين احترافية
تحسين عناوين الشرائح الأربع:
- **حجم أكبر**: `26px → 30px` للعناوين الرئيسية
- **تأثير توهج مزدوج**: `shadowBlur` طبقتين (خارجي خفيف + داخلي قوي)
- **خط فاصل أعرض وأكثر لمعاناً**: زيادة عرض `drawGoldDivider` وإضافة نقطة ماسية في المنتصف
- **عنوان SKYFALL في الشريحة 4**: تكبير إضافي مع تأثير metallic أقوى
- إزالة التكرار في كود العناوين → دالة مشتركة `drawSlideTitle(ctx, w, h, text, yRatio)`

