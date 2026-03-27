

# منع التظليل على جميع الأجهزة (Android + iOS + أخرى)

## المشكلة
الحماية الحالية من التظليل ناقصة — الحاوي الرئيسي (`div` في سطر 186) لا يحتوي على خصائص منع التحديد، والـ CSS لا يغطي كل المتصفحات.

## التغييرات

### 1. `src/index.css` — قواعد شاملة لكل المتصفحات
إضافة في نهاية الملف:
```css
canvas, button {
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
```

### 2. `src/components/SkyfallGame.tsx` — الحاوي الرئيسي (سطر 186)
إضافة خصائص منع التحديد على `div` الحاوي + `onContextMenu`:
```tsx
<div 
  onContextMenu={(e) => e.preventDefault()}
  style={{ 
    position: 'relative', width: '100vw', height: '100vh', 
    overflow: 'hidden', background: '#000',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    touchAction: 'manipulation',
  }}
>
```

### 3. أزرار التحكم — إضافة `e.preventDefault()` في `onPointerDown`
لكل الأزرار (FIRE, Left, Right, ROLL) إضافة `e.preventDefault()` لمنع السلوك الافتراضي للمتصفح الذي يسبب التظليل.

هذا يغطي: Chrome/Samsung Internet (Android)، Safari (iOS)، Firefox، Edge، وجميع المتصفحات الأخرى.

