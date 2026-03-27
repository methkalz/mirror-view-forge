

# منع قائمة Copy/Select All نهائياً على جميع الأجهزة

## المشكلة
رغم وجود `user-select: none` على `canvas` و `button`، قائمة النظام (Copy/Paste/Select All) تظهر عند الضغط المطوّل أو اللمسات المتعددة لأن:
1. عنصر `body` و `html` و `#root` ليس عليهم حماية
2. لا يوجد مُستمع لمنع أحداث `selectstart` و `touchstart` الافتراضية
3. الـ CSS لا يغطي كل العناصر في شجرة DOM

## الحل — 3 تغييرات

### 1. `src/index.css` — تغطية شاملة
توسيع القواعد لتشمل `*` (كل العناصر) بدل `canvas, button` فقط:
```css
*, *::before, *::after {
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
```

### 2. `index.html` — منع على مستوى الـ body
إضافة `style` على `body` كخط دفاع أول قبل تحميل React:
```html
<body style="-webkit-user-select:none;-webkit-touch-callout:none;user-select:none;">
```

### 3. `src/components/SkyfallGame.tsx` — منع أحداث التحديد برمجياً
إضافة مُستمعات في `useEffect` الرئيسي:
- `document.addEventListener('selectstart', e => e.preventDefault())` — يمنع بدء أي تحديد نصي
- `document.addEventListener('contextmenu', e => e.preventDefault())` — يمنع القائمة السياقية على مستوى المستند
- على الـ canvas: `touchstart` مع `{ passive: false }` و `e.preventDefault()` لمنع سلوك اللمس الافتراضي الذي يُفعّل القائمة

هذا الحل يعمل على iOS Safari، Chrome Android، Samsung Internet، وجميع المتصفحات الأخرى.

