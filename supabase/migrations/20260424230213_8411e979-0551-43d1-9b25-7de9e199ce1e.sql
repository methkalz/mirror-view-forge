-- 1) تصفير soundKey داخل كل عنصر من warnings JSONB
UPDATE public.wave_configs
SET warnings = COALESCE(
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(elem) = 'object'
          THEN (elem - 'soundKey')
        ELSE elem
      END
    )
    FROM jsonb_array_elements(warnings) AS elem
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(warnings) = 'array' AND jsonb_array_length(warnings) > 0;

-- 2) تصفير العمود القديم warning_sound_key
UPDATE public.wave_configs
SET warning_sound_key = NULL
WHERE warning_sound_key IS NOT NULL;

-- 3) تصفير sound_key في dynamic_warnings
UPDATE public.dynamic_warnings
SET sound_key = NULL
WHERE sound_key IS NOT NULL;