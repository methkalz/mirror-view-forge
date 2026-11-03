/**
 * ═══════════════════════════════════════════════════════════════
 * Editable in-game texts
 * ═══════════════════════════════════════════════════════════════
 *
 * Every player-facing gameplay message has a stable key and a default
 * value here. A row in the game_texts table overrides the default; the
 * admin "Texts" tab edits those rows and the game picks them up live.
 *
 *   t('event.swarm')               → current text for the swarm banner
 *   t('wave.start', { n: 5 })      → "بداية الموجة 5"
 *
 * Pure module (no DB access) so the engine and tests can use it freely.
 */
import { WAVE_WARNINGS } from './waveDefinitions';

export interface TextDef {
  group: string;
  label: string;
  value: string;
}

const STATIC_TEXTS: Record<string, TextDef> = {
  // ── Mid-wave events ──
  'event.swarm':      { group: 'أحداث منتصف الموجة', label: 'سرب طائرات', value: '⚠ سرب طائرات!' },
  'event.volley':     { group: 'أحداث منتصف الموجة', label: 'وابل صواريخ', value: '⚠ وابل صواريخ!' },
  'event.airstrike':  { group: 'أحداث منتصف الموجة', label: 'قصف جوي', value: '⚠ قصف جوي!' },
  'event.minePlanter':{ group: 'أحداث منتصف الموجة', label: 'عسكري الألغام (معطّل حالياً)', value: '⚠ عسكري يزرع ألغام!' },

  // ── Boss ──
  'boss.main':        { group: 'البوس', label: 'ظهور البوس', value: '⚠ تحذير: طائرة حربية!' },
  'boss.mini':        { group: 'البوس', label: 'ظهور القائد المصغّر', value: '⚠ قائد معركة!' },
  'boss.miniLabel':   { group: 'البوس', label: 'الاسم فوق القائد المصغّر', value: '⚠ قائد معركة' },
  'boss.phase2':      { group: 'البوس', label: 'المرحلة الثانية', value: '⚡ انتبه' },
  'boss.phase3':      { group: 'البوس', label: 'المرحلة الثالثة', value: '🔥 ولّعت عنجد' },

  // ── Purchase cards ──
  'offer.gas.title':  { group: 'بطاقات الشراء', label: 'عنوان بطاقة الكمامة', value: 'كمامة غاز' },
  'offer.gas.desc':   { group: 'بطاقات الشراء', label: 'وصف بطاقة الكمامة', value: 'احمِ نفسك من الغاز!' },
  'offer.fire.title': { group: 'بطاقات الشراء', label: 'عنوان بطاقة بدلة النار', value: 'بدلة نار' },
  'offer.fire.desc':  { group: 'بطاقات الشراء', label: 'وصف بطاقة بدلة النار', value: 'احمِ نفسك من النيران!' },
  'offer.mine.title': { group: 'بطاقات الشراء', label: 'عنوان بطاقة الكاشف', value: 'كاشف ألغام' },
  'offer.mine.desc':  { group: 'بطاقات الشراء', label: 'وصف بطاقة الكاشف', value: 'اقترب من اللغم لتفكيكه!' },
  'offer.buyHint':    { group: 'بطاقات الشراء', label: 'تلميح الشراء', value: 'اضغط البطاقة للشراء' },
  'offer.refuse':     { group: 'بطاقات الشراء', label: 'زر الرفض', value: 'بدّيش أشتري' },
  'offer.free':       { group: 'بطاقات الشراء', label: 'سعر مجاني', value: '🎁 مجاناً' },
  'offer.freeSub':    { group: 'بطاقات الشراء', label: 'تحت السعر المجاني', value: 'أول مرة علينا' },

  // ── Purchase confirmations ──
  'buy.gas':          { group: 'رسائل الشراء', label: 'شراء الكمامة', value: 'كمامة! 🛡️' },
  'buy.gasFree':      { group: 'رسائل الشراء', label: 'كمامة مجانية', value: 'كمامة مجانية! 🎁' },
  'buy.fire':         { group: 'رسائل الشراء', label: 'شراء بدلة النار', value: 'بدلة نار! 🔥' },
  'buy.fireFree':     { group: 'رسائل الشراء', label: 'بدلة مجانية', value: 'بدلة مجانية! 🎁' },
  'buy.mine':         { group: 'رسائل الشراء', label: 'شراء الكاشف', value: 'كاشف ألغام! 🔍' },
  'buy.mineFree':     { group: 'رسائل الشراء', label: 'كاشف مجاني', value: 'كاشف مجاني! 🎁' },
  'buy.notEnough':    { group: 'رسائل الشراء', label: 'نقاط غير كافية', value: 'نقاط غير كافية!' },

  // ── Wave flow ──
  'news.title':       { group: 'بين الموجات', label: 'الخبر العاجل: العنوان', value: 'خبر عاجل:' },
  'news.body':        { group: 'بين الموجات', label: 'الخبر العاجل: النص', value: 'المعاصر تدعو مواطنيها الى مغادرة كفرمندا فوراً' },
  'wave.start':       { group: 'بين الموجات', label: 'إعلان بداية الموجة ({n} = رقم الموجة)', value: 'بداية الموجة {n}' },
  'cards.title':      { group: 'بين الموجات', label: 'عنوان بطاقات الترقية', value: 'اختر ترقية' },

  // ── Upgrade card names ──
  'upgrade.ammo_cap':     { group: 'أسماء الترقيات', label: 'سعة الذخيرة', value: 'سعة ذخيرة+' },
  'upgrade.max_health':   { group: 'أسماء الترقيات', label: 'الصحة', value: 'صحة محسّنة' },
  'upgrade.speed_up':     { group: 'أسماء الترقيات', label: 'السرعة', value: 'سرعة حركة+' },
  'upgrade.slowmo_ext':   { group: 'أسماء الترقيات', label: 'التباطؤ', value: 'تباطؤ مطوّل' },
  'upgrade.dash_fast':    { group: 'أسماء الترقيات', label: 'الدحرجة', value: 'دحرجة سريعة' },
  'upgrade.shield_ext':   { group: 'أسماء الترقيات', label: 'الدرع', value: 'درع ممتد' },
  'upgrade.pickup_range': { group: 'أسماء الترقيات', label: 'الجذب', value: 'جذب مغناطيسي' },
  'upgrade.bullet_dmg':   { group: 'أسماء الترقيات', label: 'قوة الضربة', value: 'ضربة قوية' },

  // ── Game over ──
  'gameover.title':     { group: 'نهاية اللعبة', label: 'العنوان', value: 'العالم منتهاش' },
  'gameover.newRecord': { group: 'نهاية اللعبة', label: 'رقم قياسي جديد', value: '★ رقم قياسي جديد ★' },
};

/** Wave-start warnings become `warn.<id>` keys, grouped by wave. */
function buildWarningTexts(): Record<string, TextDef> {
  const out: Record<string, TextDef> = {};
  for (const [wave, list] of Object.entries(WAVE_WARNINGS)) {
    for (const def of list) {
      out[`warn.${def.id}`] = { group: 'تحذيرات بداية الموجات', label: `الموجة ${wave}`, value: def.text };
    }
  }
  return out;
}

export const TEXT_DEFAULTS: Record<string, TextDef> = { ...buildWarningTexts(), ...STATIC_TEXTS };

let overrides: Record<string, string> = {};

/** Replaces the active overrides (called after loading game_texts). */
export function setTextOverrides(map: Record<string, string>) {
  overrides = { ...map };
}

/**
 * Returns the live text for a key. `vars` fill `{name}` placeholders.
 * Unknown keys fall back to `fallback`, then to the key itself.
 */
export function t(key: string, vars?: Record<string, string | number>, fallback?: string): string {
  const raw = overrides[key] ?? TEXT_DEFAULTS[key]?.value ?? fallback ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
