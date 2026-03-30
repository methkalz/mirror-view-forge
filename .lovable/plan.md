

# إضافة التحكم بهامش الكاميرا من لوحة التحكم

## الفكرة
القيمة `cameraMargin = 400` مثبتة حالياً في الكود. نجعلها قابلة للتعديل من لوحة التحكم عبر `game_config`.

## التغييرات

### 1. Migration — إضافة عمود `camera_margin` لجدول `game_config`
```sql
ALTER TABLE public.game_config ADD COLUMN camera_margin double precision NOT NULL DEFAULT 400;
```

### 2. `src/game/config.ts`
- إضافة `cameraMargin: number` للـ `RemoteGameConfig` interface
- قراءته من البيانات في `fetchGameConfig` مع default = 400
- دعم تحديثه في `updateGameConfig`

### 3. `src/game/renderer.ts`
- تمرير `cameraMargin` من الـ config بدلاً من القيمة الثابتة 400 في `drawSingleImage`

### 4. `src/pages/Admin.tsx`
- إضافة slider + input رقمي لـ "Camera Margin" في قسم إعدادات اللعبة (مدى: 0–1000px، خطوة: 50)

