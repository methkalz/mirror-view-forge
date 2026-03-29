

# زووم إن/آوت عند دخول الدراجة النارية

## الفكرة
عند دخول الدراجة تبدأ الكاميرا بالتقريب (zoom in) تدريجياً نحو الدراجة لمدة ثانيتين لإبرازها بوضوح، ثم تعود للعرض الطبيعي (zoom out) بسلاسة.

## التغييرات

### 1. `src/game/types.ts`
- إضافة حقول zoom للكاميرا في `GameData`:
  - `cameraZoom: number` (القيمة الحالية، تبدأ 1.0)
  - `cameraZoomTarget: number` (القيمة المستهدفة)
  - `cameraFocusX: number` و `cameraFocusY: number` (نقطة التركيز)

### 2. `src/game/engine.ts`
- عند دخول الدراجة (مرحلة `bike` تبدأ): ضبط `cameraZoomTarget = 1.6` ونقطة التركيز على الدراجة
- بعد **2 ثانية**: إعادة `cameraZoomTarget = 1.0`
- تحديث `cameraZoom` كل فريم بـ lerp سلس نحو `cameraZoomTarget`
- إضافة `bikeZoomTimer: number` لتتبع الوقت

### 3. `src/game/renderer.ts`
- في `render()`: تطبيق zoom حول نقطة التركيز قبل رسم المشهد:
  ```
  ctx.translate(focusX, focusY);
  ctx.scale(zoom, zoom);
  ctx.translate(-focusX, -focusY);
  ```
- HUD يبقى بدون zoom (يُرسم بعد `ctx.restore`)

## الملفات المتأثرة
1. **`src/game/types.ts`** — حقول zoom
2. **`src/game/engine.ts`** — منطق الزووم + مؤقت
3. **`src/game/renderer.ts`** — تطبيق الزووم على المشهد

