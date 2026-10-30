# Plan: основной экран с камерой, детекцией и тапом   (slug: camera-screen)

## TL;DR

Камера с кошачьим фильтром, COCO-SSD и Face Landmarker в браузере, рамки поверх видео. Тап: `pickTarget` или `tapBox`, маскировка лиц, кроп, `/api/ask` с таймаутом, при любой ошибке `pickPhrase`. Кот-заглушка с пузырём. Текущий `index.html` переезжает в `check.html`.

## Acceptance criteria

- iPhone Safari, деплой HTTPS: кнопка "Включить камеру", разрешение, видео на весь экран inline, виден кошачий фильтр.
- Рамки с подписями (label объекта, эмоция лица) совпадают с предметами в портрете и альбоме, при сворачивании тулбара Safari и после поворота.
- Тап по предмету: кот сразу "думает", затем реплика. Сейчас `/api/ask` = 404, реплика из `pickPhrase`, страница работает, необработанных ошибок в консоли нет.
- Тап по лицу или телу: тело запроса ровно `{ kind: 'person', emotion }`, поля `image` нет. Человек без лица уходит с `neutral`.
- Тап мимо всех рамок: уходит `{ kind: 'object', label: 'unknown', image }` с кропом `tapBox`.
- Кроп никогда не содержит найденных лиц: все лица в кадре залиты непрозрачным прямоугольником до JPEG. Проверка через `?debug`: миниатюра кропа показывает заливку.
- Face Landmarker не загружен, упал или вернул ошибку: `image` не создаётся, `fetch` не вызывается, кот говорит `pickPhrase`.
- Сеть выключена, таймаут, 404, 429, 500, не-JSON, ответ без `text`, неизвестный `mood`: кот говорит запасную фразу, сценарий не падает.
- CDN моделей недоступен: видео и фильтр работают, тап даёт запасную фразу.
- Повторный тап во время запроса игнорируется, параллельных запросов нет.
- Реплика выводится через `textContent`, HTML не исполняется.
- `npm test` зелёный, включая новые тесты. `pickTarget.js`, `cropRegion.js`, `pickPhrase.js`, `detectEmotion.js` и `api/` не менялись.
- `/check.html` работает как прежний `index.html` (ping, камера).

## Plan

### Файлы

| Файл | Изменение |
|---|---|
| `public/check.html` | `git mv public/index.html public/check.html`, содержимое не менять |
| `public/index.html` | новый основной экран: video (`playsinline muted autoplay`, CSS filter), `canvas#overlay`, кот + пузырь, кнопка старта, defer-скрипты tfjs и coco-ssd, module `main.js` |
| `public/js/main.js` | загрузка phrases, старт по кнопке, обработчик тапа, `?debug` |
| `public/js/camera.js` | `getUserMedia`, `video.play`, возобновление при `visibilitychange` |
| `public/js/detect.js` | загрузка моделей, цикл детекции, `getDetections()`, `detectFacesNow(canvas)` |
| `public/js/overlay.js` | рисование рамок на canvas через `videoToScreen` |
| `public/js/snapshot.js` | заморозка кадра, заливка лиц, `cropRegion`, JPEG base64 |
| `public/js/cat.js` | эмодзи по mood + "думает", пузырь, `unlockAudio` |
| `public/js/logic/coverMap.js` | чистый: `coverTransform(view, video)`, `screenToVideo(point, view, video)`, `videoToScreen(bbox, view, video)` |
| `public/js/logic/detections.js` | чистый: `objectDetections(cocoResults)`, `faceBox(landmarks, frame)`, `faceDetections(faceResult, frame)`, `privacyMasks(detections)` |
| `public/js/logic/askCat.js` | чистый, `fetch` инжектится: `askBody(target, image)`, `askCat({ target, image, phrases, lastText, fetchFn, timeoutMs, random })`, `ASK_TIMEOUT_MS` |
| `test/coverMap.test.js`, `test/detections.test.js`, `test/askCat.test.js` | новые |

### Шаги

1. `git mv public/index.html public/check.html`.
2. `logic/coverMap.js`: `scale = max(view.width / video.width, view.height / video.height)`, `offsetX = (view.width - video.width * scale) / 2`, `offsetY` аналогично. `screenToVideo = (p - offset) / scale` с clamp в кадр. `null` при нулевых размерах видео. `frame = { width: video.videoWidth, height: video.videoHeight }`, не `getSettings()`: на iPhone settings расходятся с ориентацией.
3. `logic/detections.js`: `objectDetections`: `{ bbox, class }` в `{ kind: 'object', label, bbox }`. `faceBox`: min/max по нормализованным landmarks, clamp 0..1, умножить на frame, вернуть `[x, y, w, h]`. `faceDetections`: `faceLandmarks[i]` + `detectEmotion(faceBlendshapes[i].categories)` в `{ kind: 'person', emotion, bbox }`. `privacyMasks`: каждое лицо расширить на 30% с каждой стороны; для каждого `{ kind: 'object', label: 'person' }`, в чьей рамке нет центра ни одного лица, добавить верхние 35% рамки как голову.
4. `logic/askCat.js`: `askBody`: person только `{ kind, emotion }`; object с image `{ kind, label, image }`; object без image `null`. `askCat`: body `null` даёт `pickPhrase` без fetch. Иначе POST `/api/ask`, JSON, `Promise.race` с таймером + `AbortController`, таймер покрывает и `res.json()`. Принять только `res.ok`, непустой строковый `text`, `mood` из `MOODS`. Всё остальное: `pickPhrase(phrases, target, lastText, random)`. Промис никогда не реджектится. `ASK_TIMEOUT_MS = 6000`.
5. Тесты логики, `npm test`.
6. `index.html`: `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js` и `https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js` через `script defer`. Видео и overlay: `position: fixed`, `inset: 0`, `100%` x `100%`, `object-fit: cover`, высота через `100dvh`. Фильтр: CSS filter на video, старт `saturate(.5) brightness(1.1) contrast(.95) blur(.6px)`. Кот и пузырь `pointer-events: none`, отступ `env(safe-area-inset-*)`. Overlay `touch-action: manipulation`.
7. `camera.js`: `getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })`. Не зеркалить. Нет `navigator.mediaDevices` или `isSecureContext` false: сообщение в пузыре. `NotAllowedError`: сообщение, кнопка остаётся. `visibilitychange`: `video.play()`.
8. `detect.js`, COCO: проверить `window.cocoSsd`, `tf.setBackend('webgl')`, `tf.ready()`, `cocoSsd.load()`. Ошибка не фатальна, модель остаётся `null`.
9. `detect.js`, Face: только динамический `await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs')` внутри try: статический import уронил бы `main.js` при сбое CDN. `FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')`. `FaceLandmarker.createFromOptions`: `modelAssetPath https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate `GPU` с откатом на `CPU`, `runningMode: 'VIDEO'`, `numFaces: 5`, `outputFaceBlendshapes: true`. По умолчанию `numFaces` = 1, второе лицо осталось бы без маски.
10. `detect.js`, цикл: один последовательный async-цикл без `setInterval`: coco, faces, обновить detections, overlay, пауза до `LOOP_MS = 250`. Результат каждой модели хранить отдельно. Пропускать при `document.hidden` и `readyState < 2`. Таймстемп `detectForVideo` строго растёт: `Math.max(last + 1, performance.now())`, счётчик общий с `detectFacesNow`.
11. `overlay.js`: canvas = размер rect * `min(devicePixelRatio, 2)`, перерисовка на тике и на `resize`/`orientationchange`. Боксы через `videoToScreen`, подписи label или эмоция.
12. `snapshot.js`, строго по порядку: `drawImage(video)` в переиспользуемый canvas размером `videoWidth` x `videoHeight`; `detectFacesNow(canvas)` на этом кадре, `null` даёт возврат `null`; `privacyMasks(свежие лица + detections последнего тика)`; `fillRect` непрозрачным цветом, `globalAlpha = 1`, без blur (блюр обратим); `cropRegion(target.bbox, frame)`, `null` даёт возврат `null`; `drawImage` в кроп-canvas `dw` x `dh`; `toDataURL('image/jpeg', 0.8)`, отрезать префикс `data:`. Всё в try/catch, ошибка даёт `null`.
13. `cat.js`: эмодзи-поза по mood, состояние "думает", `say(text, mood)` через `textContent`, `aria-live="polite"`. `unlockAudio()`: создать `AudioContext` и `resume()` синхронно в клике кнопки, до первого await. Файлов звука нет, `playMeow()` молчит без ошибки.
14. `main.js`, загрузка: `fetch('/phrases.json')` до старта; при ошибке встроенный минимум `{ objects: {}, emotions: {}, fallback: { mood: 'curious', lines: ['Мяу?'] } }`. Клик старта: `unlockAudio`, camera, скрыть кнопку, модели в фоне.
15. `main.js`, тап: `rect = video.getBoundingClientRect()` на каждый тап, `screenToVideo`, `pickTarget(tap, getDetections()) ?? { kind: 'object', label: 'unknown', bbox: tapBox(tap) }`, `cat.think()`; person: image `null`, object: image = snapshot; `await askCat`, `cat.say`, запомнить `lastText`. Флаг busy игнорирует тапы до ответа.
16. `?debug`: показать последний кроп миниатюрой в углу.

### Тесты

- coverMap: портрет 390x844 + видео 1920x1080: центр экрана даёт (960, 540), левый край x около 710; альбом с обрезкой сверху и снизу; совпадение пропорций (offset 0); round trip; clamp; нулевое видео даёт `null`.
- detections: `faceBox` из точек, в том числе за пределами 0..1; `faceDetections` связывает blendshapes и лицо по индексу; `privacyMasks`: расширение на 30%, голова для человека без лица, человек с лицом маски головы не получает, пустой вход.
- `askBody`: person без image, даже если image передан; ключи person ровно `kind` и `emotion`; object без image даёт `null`.
- `askCat` с фейковым fetch: 200 валидный; 404, 500, reject, битый JSON, пустой text, неизвестный mood дают фразу из phrases; зависший fetch и зависший `res.json()` дают фразу при `timeoutMs: 10`; object без image: fetch не вызван; `lastText` передаётся; abort срабатывает на таймауте.
- Интеграция `pickTarget` + `coverMap`: тап по экрану попадает в рамку в координатах видео.
- Камера, Canvas и стили тестами не закрыты: проверка руками на iPhone Safari по критериям приёмки.

## Blockers

HIGH нет. Нужно согласовать, сборку не останавливает:

- **MED, с коллегой:** тап мимо рамок шлёт `label: 'unknown'`. Валидатор `api/ask` не должен отвергать значения вне классов COCO, а промпт должен просить Gemini узнать предмет по картинке.
- **MED, с коллегой:** клиент ждёт `ASK_TIMEOUT_MS = 6000`. Таймаут сервера должен быть меньше, иначе вызов Gemini потратит лимит впустую.
- **MED, принять как риск:** лицо, которое не нашли ни Face Landmarker, ни COCO (профиль, дальний человек), может попасть в кроп. Маски снижают риск, но не убирают его. Выбранная при тапе рамка человека маскируется, а незнакомые лица в кадре возможны.
- **Неизвестно до проверки на устройстве:** две модели на iPhone могут не влезть в память Safari. Рычаги: delegate `CPU`, больше `LOOP_MS`, ниже разрешение.

## Out of scope

- `api/ask.js` и любые правки `api/`.
- Правки `pickTarget.js`, `cropRegion.js`, `pickPhrase.js`, `detectEmotion.js`, `phrases.json`.
- Запас вокруг рамки в `pickTarget`, подбор `THRESHOLDS`.
- Картинки кота, файлы звуков, мурлыканье.
- Самохостинг моделей и офлайн-кэш.
- Русские подписи классов COCO на рамках.
- Подсветка выбранной рамки, анимация кота, переключение камеры.

## Assumptions

- `@mediapipe/tasks-vision@0.10.35`, `tfjs@4.22.0`, `coco-ssd@2.2.3`: версии и URL проверены планировщиком.
- Текущий `index.html` это страница проверки деплоя, сохраняем её как `check.html`.
- Тесты логики пишет исполнитель `frontend`.
- Кот-заглушка это эмодзи, заменяется в `cat.js`.
- 30%, 35%, `LOOP_MS = 250`, JPEG 0.8 и параметры фильтра стартовые, не измерены.
