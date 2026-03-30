

# نظام الخلفيات الديناميكية مع لوحة التحكم

## الفكرة
نظام تغيير تدريجي للخلفية (نهار → مغيب → ليل) يُدار بالكامل من لوحة الأدمن، مع إمكانية رفع/تغيير الصور وضبط توقيتات الانتقال.

## التنفيذ

### 1. جدول قاعدة بيانات جديد: `background_config`
```sql
CREATE TABLE background_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase TEXT NOT NULL UNIQUE,        -- 'day', 'sunset', 'night'
  image_url TEXT,                     -- رابط الصورة من Storage
  transition_start FLOAT NOT NULL,   -- بداية الانتقال (ثواني)
  transition_end FLOAT NOT NULL,     -- نهاية الانتقال (ثواني)
  overlay_top TEXT DEFAULT