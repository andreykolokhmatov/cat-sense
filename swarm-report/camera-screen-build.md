# Build: camera-screen

## frontend: complete

Изменено: `public/index.html`, `public/check.html` (перенос из `index.html`), `public/js/{main,camera,detect,overlay,snapshot,cat}.js`, `public/js/logic/{coverMap,detections,askCat}.js`, `test/{coverMap,detections,askCat}.test.js`.

Тесты: `npm test`, 72 из 72. `node --check` на 9 новых модулях без ошибок. Прогон `main.js` со всеми модулями в Node на заглушках DOM и моделей: порядок кадра, заливка лиц, тела запросов, запасная фраза при 404, игнор повторного тапа.

## Отклонения от плана

- В `index.html` `main.js` стоит перед скриптами CDN, `detect.js` ждёт событие `load`: зависший CDN не должен оставлять кнопку мёртвой.
- Добавлен `videoFrame(video)` в `coverMap.js`.
- `getDetections()` возвращает пусто, пока тик не совпал с текущим размером видео: после поворота старые рамки в другой системе координат. Рамки на миг пропадают.
- `coverTransform` возвращает `null` и на нулевом view.
- При ошибке модели на кадре её результат очищается.

## Не проверено

Настоящая камера, телефон, Safari, Canvas, CSS, совпадение рамок, реальные tfjs и MediaPipe, память iPhone, миниатюра `?debug`, `/check.html`. Нужен ручной прогон по критериям приёмки.

## Открыто

- `think()` идёт перед синхронным snapshot, "думает" может отрисоваться с задержкой.
- С коллегой: `api/ask` принимает `label: 'unknown'`, таймаут сервера меньше 6000 мс.
