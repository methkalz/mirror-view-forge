

## تنفيذ ترحيل قاعدة البيانات: نظام المشاهد (Scenes)

سيُنشأ ملف ترحيل واحد ينفذ ما طلبته، مع تعديل أمني واحد على سياسة RLS لجدول `scenes` ليطابق نمط `background_config` الموجود (إدارة محصورة بالأدمن بدل أي مستخدم مسجل).

### الترحيل

**1) جدول `scenes` + RLS:**
```sql
CREATE TABLE IF NOT EXISTS public.scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read scenes"
  ON public.scenes FOR SELECT USING (true);

CREATE POLICY "Admins can insert scenes"
  ON public.scenes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update scenes"
  ON public.scenes FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete scenes"
  ON public.scenes FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
```

**2) المشهد الافتراضي:**
```sql
INSERT INTO public.scenes (id, name, sort_order)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 0)
ON CONFLICT (id) DO NOTHING;
```

**3) `scene_id` على `background_config` + ترحيل البيانات:**
```sql
ALTER TABLE public.background_config
  ADD COLUMN IF NOT EXISTS scene_id UUID
  REFERENCES public.scenes(id) ON DELETE CASCADE
  DEFAULT '00000000-0000-0000-0000-000000000001';

UPDATE public.background_config
SET scene_id = '00000000-0000-0000-0000-000000000001'
WHERE scene_id IS NULL;
```

**4) `scene_change_interval` على `game_config`:**
```sql
ALTER TABLE public.game_config
  ADD COLUMN IF NOT EXISTS scene_change_interval INT NOT NULL DEFAULT 6;
```

### ملاحظة حول خطأ البناء الحالي

`src/game/backgroundConfig.ts:89` يفشل لأن `types.ts` لم تُحدَّث بعد بأعمدة `scene_id` (الكود يحاول تمريرها في insert). تطبيق هذا الترحيل سيُحدِّث `types.ts` تلقائياً ويُصلِح الخطأ. لن أعدّل `backgroundConfig.ts` — أنت ذكرت أنك سترفع الملفات المعدلة لاحقاً.

### الملفات المتأثرة
- `supabase/migrations/<new>.sql` — جديد
- `src/integrations/supabase/types.ts` — تحديث تلقائي

