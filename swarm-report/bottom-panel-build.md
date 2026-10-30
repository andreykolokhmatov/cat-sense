# Build: bottom-panel

## frontend: complete

Изменено: `public/index.html`, `public/js/{main,cat}.js`, `public/js/logic/coverMap.js` (только `visibleSource`), `test/coverMap.test.js`.
Новое: `public/js/saveFrame.js`, `public/js/logic/{catVision,wrapText}.js`, `public/manifest.webmanifest`, `public/assets/icons/{apple-touch-icon,icon-192,icon-512,icon-512-maskable}.png`, `test/{catVision,wrapText}.test.js`.

Тесты: `npm test`, 112 из 112 (оркестратор перезапустил, тот же результат).

Headless Chrome с фейковой камерой, 390x844 и 375x667: панель скрыта на интро; video и overlay 0..591, панель 591..844; фильтр `url("#cat-vision") blur(1px)`, переключатель снимает его; тап у нижнего края камеры шлёт `/api/ask`, на статике 501 и запасная фраза; тап по панели реплику не меняет; сохранение без share API скачивает JPEG 1080x1836 без сетевых запросов, на фото фильтр, пузырь, кот, полоса "Кошачье чутьё"; во время точек `currentLine().text === ''`; `<dialog>` закрывается по фону; манифест отдаётся с 200.

## Отклонения от плана

- Смена камеры вырезана (решение в Blockers): `camera.js`, `detect.js`, `mirrorPoint` не трогались.
- Кнопок три: "Как это" и "Кошка/Человек" сверху, "Сохранить" на всю ширину снизу.
- Запасной CSS-фильтр включается параметром `?catcss`, чтобы сравнить на iPhone без деплоя.
- Debug-кроп оставлен с рамкой `#f5a623`, остальной брендовый цвет `#FA9A3C`.

## Не проверено (нужен iPhone 17)

1. SVG-фильтр на `<video>`: не чёрный, FPS не просел с двумя моделями. Иначе `?catcss` и сделать его дефолтом в `setUpPanel`.
2. Safe-area: панель над home indicator, позиции кота и пузыря.
3. `?debug`: кроп по центру тапа у нижнего края камеры и после смены высоты тулбара Safari.
4. Share sheet → "Сохранить изображение" → Фото; отмена без ошибки; фриз при сборке 1080 px (если заметен, 900).
5. Кириллица шрифтом system-ui в сохранённом JPEG.
6. Прокрутка окна "Как это" на маленьком экране.
7. "На экран Домой": иконка, standalone, статус-бар, камера, тап, ответ, share в standalone.
8. Кошачье зрение на реальных красных и зелёных предметах.
