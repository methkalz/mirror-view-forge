

# إصلاح شاشة نهاية اللعبة — 3 مشاكل

## المشاكل
1. **النقر على الجدول يعيد اللعبة**: أي نقرة أثناء `gameover` تعيد البدء فوراً — لا يوجد تحقق من موقع زر "عيدها يا كبير"
2. **العنوان غير واضح**: خط 42px مع توهج قوي على خلفية مظلمة — يحتاج تباين أعلى وظل نصي
3. **التصميم يحتاج رفع مستوى**: المسافات ضيقة، البطاقات صغيرة، الجدول بحاجة لتنظيم أفضل

## الحل

### ملفان: `src/components/SkyfallGame.tsx` + `src/game/renderer.ts`

### 1. تقييد إعادة اللعبة بالنقر على الزر فقط (`SkyfallGame.tsx` سطر 294)

بدل إعادة اللعبة عند أي نقرة، نتحقق أن النقرة داخل حدود زر "عيدها يا كبير":

```typescript
} else if (g.state === 'gameover') {
  // فقط الزر يعيد اللعبة
  const canvas = canvasRef.current;
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    const clickX = (inputRef.current as any)._lastClickX;
    const clickY = (inputRef.current as any)._lastClickY;
    if (clickX !== undefined && clickY !== undefined) {
      const canvasW = canvas.width / (window.devicePixelRatio || 1);
      const canvasH = canvas.height / (window.devicePixelRatio || 1);
      const btnW = 200, btnH = 44;
      const btnX = canvasW / 2 - btnW / 2;
      const btnY = canvasH * 0.92 - btnH / 2;
      if (clickX < btnX || clickX > btnX + btnW || clickY < btnY || clickY > btnY + btnH) {
        // نقرة خارج الزر — تجاهلها
        delete (inputRef.current as any)._lastClickX;
        delete (inputRef.current as any)._lastClickY;
        return;
      }
    }
  }
  // ... باقي كود إعادة البدء
}
```

أيضاً: منع إعادة البدء قبل ظهور الزر (elapsed < 2.5s) بتخزين `gameOverStartTime` في ref.

### 2. تحسين وضوح العنوان (`renderer.ts`)

- إضافة شريط خلفية شبه شفاف خلف العنوان (banner)
- إضافة `strokeText` أسود خلف النص الأحمر لتباين أعلى
- تقليل `shadowBlur` من 35 إلى 20 ليكون التوهج أنظف وأوضح
- زيادة حجم الخط إلى 46px

### 3. رفع احترافية التصميم العام (`renderer.ts`)

**العنوان:**
- شريط أفقي شفاف خلف العنوان مع حدود جانبية ذهبية
- خط خارجي (stroke) أسود 3px للوضوح

**النقاط والمركز:**
- تكبير خط النقاط من 40px إلى 48px
- إضافة خلفية مستديرة خلف رقم المركز

**بطاقات الإحصائيات:**
- تكبير الخطوط (13→15px للتسميات، 14→16px للقيم)
- زيادة ارتفاع البطاقة من 32 إلى 36px
- خلفية أغمق قليلاً (0.05→0.08)

**جدول الترتيب:**
- تكبير الخطوط (13→15px للأسماء)
- زيادة ارتفاع الصفوف من 28→32px
- خلفية أعمق للجدول (0.3→0.45)

**الزر:**
- تكبير من 200×44 إلى 220×50
- خلفية أكثف (0.15→0.25)
- حد أسمك (1.5→2px)

