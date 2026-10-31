# Build: loading-screen

Ветка `feat/loading-screen`, ничего не закоммичено.

## frontend: complete

Изменённые файлы:
- `public/js/logic/loading.js` (новый): прогресс, дедлайн, кнопка пропуска, строки МБ и DEV;
- `test/loading.test.js` (новый, 12 тестов);
- `public/js/preload.js` (новый): скачивание COCO, `.task` и wasm на интро, сюда переехали URL моделей;
- `public/js/loadingScreen.js` (новый): UI загрузки внутри `#intro`;
- `public/js/detect.js`: модели из предзагрузки, иначе по URL; `startDetection` возвращает промисы `{coco, faces}` по первому настоящему тику;
- `public/js/main.js`: `startPreload` на старте; `handleStart` ждёт экран загрузки; catView не рисует, пока идёт загрузка;
- `public/js/devMode.js`: `logLoad(text)`;
- `public/index.html`: разметка и стили `#loading`, preconnect.

`cat.js` и `catView.js` не тронуты.

## Тесты

`npm test`: 195 тестов, прошло 194, упал 1:

```
✖ climbing out of public is refused, plain or encoded
  actual: '/site/public/..\\.env', expected: null
ℹ tests 195
ℹ pass 194
ℹ fail 1
```

Падение существовало до сборки: на чистом `main` во временном worktree `node --test test/devServer.test.js` даёт `pass 5, fail 1`, тот же тест. Это `scripts/dev-server.mjs` из PR #3: на Linux `\` не разделитель пути. Не в зоне этого плана, владелец `scripts/` в AGENTS.md не указан.

Новые тесты `test/loading.test.js`: 12/12. `node --check` на всех 7 изменённых JS проходит.

## Проверено вне юнит-тестов (агентом)

- dev-сервер отдаёт 200 на все новые и изменённые модули, регистр импортов совпадает;
- в Node с tfjs 4.22.0 и coco-ssd 2.2.3 из CDN: цепочка `tf.io.http → artifacts → cocoSsd.load({modelUrl: tf.io.fromMemory(...)})` работает, детекция идёт; счётчик байт COCO 18 561 843 B, буфер лиц 3 758 596 B;
- API MediaPipe 0.10.35 сверено по исходнику: `modelAssetBuffer` не отсоединяется, так что повтор GPU→CPU работает с тем же буфером.

## Проверить руками на iPhone

- Сценарии шага 6 плана: холодный кэш, 15 с на интро, тёплый кэш, без сети, запрет камеры, пропуск, уход в фон, режим «Человек».
- Работают ли `fromMemory` и `modelAssetBuffer` на WebKit.
- Нет ли второго запроса wasm во вкладке Network.
- Двигается ли блик при занятом главном потоке.
- Обновляется ли видео в приложении с экрана Домой после скрытия интро.
- Пик памяти на старом телефоне.
- Подстройка `LOADER_MAX_MS`, `SKIP_AFTER_MS`, долей и `expectedMs` по DEV-строке.

## Cross-layer и Memory Bank

Не правились, владелец не назначен.

**`architecture.md`:**
- новые модули `preload.js`, `loadingScreen.js`, `logic/loading.js`;
- `startDetection(video, preloaded)` возвращает `{coco, faces}`;
- загрузка — состояние `#intro`.

**`decisions.md`:**
- модели качаются на интро, около 25 МБ трафика посетителя;
- дедлайн и кнопка пропуска;
- при сбое предзагрузки — загрузка по URL;
- камера открывается после первого тика моделей.

**Приватность, как и до этой сборки.** После пропуска или дедлайна, пока COCO не загружен, тап по телу без лица считается предметом, и вырезка уходит в Gemini с закрашенными лицами. Жёсткий запрет требует отдельного плана.
