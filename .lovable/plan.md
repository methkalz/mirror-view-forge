

# إصلاح تعطل اللعبة عند دخول الصاروخ المتشظي

## السبب

في التعديل الأخير، تم زيادة مؤقت مرحلة `opening` من `0.5` إلى `1.0` ثانية في `engine.ts`، لكن الـ renderer في `renderer.ts` (سطر 552) لا يزال يقسم على `0.5`:

```
const openT = 1 - Math.max(0, (hz.clusterTimer || 0) / 0.5);
```

عندما `clusterTimer = 1.0` (بداية المرحلة):
- `openT = 1 - (1.0 / 0.5) = -1`
- نصف قطر الـ ellipse يصبح **سالباً**: `bodyH * (1 + (-1) * 1.5) = bodyH * (-0.5)`
- `ctx.ellipse()` مع نصف قطر سالب يرمي خطأ `RangeError` كل إطار
- اللعبة "تتجمد" بصرياً لأن كل محاولة رسم تفشل

## الإصلاح — `src/game/renderer.ts`

**سطر 552**: تغيير القاسم من `0.5` إلى `1.0` ليتطابق مع المؤقت الجديد:

```typescript
const openT = 1 - Math.max(0, (hz.clusterTimer || 0) / 1.0);
```

وإضافة حماية للنصف قطر ليكون دائماً موجباً:

```typescript
ctx.ellipse(0, 0, bodyLen * 0.3, Math.max(0.1, bodyH * (1 + openT * 1.5)), 0, 0, Math.PI * 2);
```

### ملف واحد متأثر
- **`src/game/renderer.ts`** — سطران فقط

