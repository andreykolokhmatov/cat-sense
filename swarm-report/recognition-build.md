# Build: recognition

Ветка `feat/recognition`, стоит на `feat/loading-screen`.

## backend: complete

Файлы: `api/ask.js`, `api/_logo.js` (новый), `test/ask.test.js`.

**Схемы ответа** с `propertyOrdering`:
- object: `seen`, `sure`, `logo`, `text`, `mood`;
- torso: `logo`, `sure`, `text`, `mood`;
- person: `text`, `mood`.

**Эталон лого:** белая маска на чёрном, 320 px, q85, 9 804 символа base64. Уходит с каждым object- и torso-запросом.

**Hero-ответ:** при `logo && sure=high` текст всегда «Маска надета. Арена героев, я с вами!», `mood: happy`.

**Флаг `hero: true` в запросе** принимается только как literal `true`. Тогда в конец промпта добавляется инструкция «кот-супергерой».

**Env:** `GEMINI_THINKING` (`low`/`medium`/`high`, по умолчанию `low`).

**Живой smoke с Gemini НЕ сделан:** локально нет `.env` и ключа. Не подтверждено, что Gemini принимает `propertyOrdering` и BOOLEAN, задержка не измерена. Проверить на preview.

## frontend: complete

Файлы:
- `logic/pickTarget.js`: `torsoBox`;
- `logic/logoGate.js` (новый);
- `logic/heroMask.js` (новый): `HERO_TAPS = 3`, `HERO_MS = 30000`;
- `snapshot.js`: JPEG 0.9, `torsoSnapshot`;
- `logic/askCat.js`;
- `main.js`;
- `logic/devLog.js`, `devMode.js`;
- `index.html`;
- тесты: `pickTarget`, `logoGate` (новый), `heroMask` (новый), `askCat`, `devLog`;
- `.memory-bank/architecture.md`, `decisions.md`, `open-questions.md`.

**Гейт.** Работает на 32×32 до закраски лиц. Белый пиксель: luma ≥ 170 и chroma ≤ 60. Тёмный: luma ≤ 70. Проходит, если белого 3–45% и тёмного ≥ 30%. Не прошёл — ничего не уходит.

**Хук маски для коллеги:**
- при надевании: `body.is-hero` и `document` `cat:hero` с `{detail: {text}}`;
- при снятии: класс убирается, приходит `cat:hero-off`.

Маска снимается после 3 ответов или через 30 с, что раньше. Пока она надета, каждый запрос уходит с `hero: true`.

## Тесты

`npm test` (проверено оркестратором после обоих агентов):

```
ℹ tests 254
ℹ pass 253
ℹ fail 1
✖ climbing out of public is refused, plain or encoded
```

Это известное падение `test/devServer.test.js`, есть и на `main`. `node --check` проходит на всех изменённых JS. Dev-сервер отдаёт 200 на новые модули.

## Проверить руками на iPhone (`?debug`)

1. **Первым делом:** кот отвечает репликами Gemini, а не запасными фразами. Если всё время запасные, значит, Gemini отвечает 400 на схему.
2. **Гейт на настоящей футболке:**
   - однотонная чёрная и светлая дают «гейт не пропустил»;
   - маска на чёрном даёт «торс → Gemini».
3. **Приватность:**
   - тап по лицу уходит без картинки;
   - удержание по телу уходит без торса;
   - на превью торса лица закрашены.
4. **Лого:** ровное, складка, угол, половина, распечатка, экран. Негативы: кошка, летучая мышь, значок Бэтмена.
5. **Маска:** после hero следующие 3 ответа в геройском стиле, потом маска снимается. Без тапов снимается через 30 с.
6. **Авиарежим:** запасная фраза, маски нет.
7. **Задержка на тап по телу.**
