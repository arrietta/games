# Игры для уроков

Самодельная замена Wordwall для учителя: статический сайт (HTML/CSS/JS, без сборки).
Игры встраиваются в Canva / сайты через ссылку или iframe. Интерфейс игр — на русском.

## Как устроено

- `play.html?g=<slug>` — движок, грузит `games/<slug>.json`. Код игр в `engine.js`, стили в `engine.css`.
- `index.html` — каталог, читает `games/index.json`.
- Локальный предпросмотр: сервер `games` из `.claude/launch.json` (python http.server :8765). Через `file://` не работает — нужен `fetch`.

## Как добавить игру по просьбе учителя

1. Создать `games/<slug>.json` (slug — латиница, цифры, `-`, напр. `5a-past-simple`).
2. Добавить строку в `games/index.json`: `{ "slug", "title", "type" }`.
3. Открыть `play.html?g=<slug>`, пройти игру, проверить что текст влезает.
4. Опубликовать (git push на хостинг) и дать ссылку `<сайт>/play.html?g=<slug>`.

## Форматы

Общие поля: `type`, `title`, необязательно `instructions` (текст на стартовом экране), `shuffle: false` (не перемешивать).
Оформление: `theme` — `space`, `forest`, `ocean`, `candy`, `school`, `winter` (без поля — светло-синяя по умолчанию); `stickers: ["🦊", "img:pics/x.png"]` — свои фоновые стикеры, `[]` — без стикеров. Новая тема: блок `[data-theme="..."]` в `engine.css` + список в `THEME_STICKERS` в `engine.js`.
Любой текст может быть картинкой: `"img:pics/cat.png"` (файл в репозитории) или прямая ссылка на .png/.jpg/.svg/.webp. Эмодзи — просто в тексте.

| type | данные |
|---|---|
| `quiz` | `items: [{ q, a, wrong: [..], img? }]` — `a` правильный, `wrong` 1–3 неправильных |
| `truefalse` | `items: [{ s, a: true/false }]` |
| `match` | `items: [{ a, b }]` — до ~8 пар, иначе не влезет на экран |
| `flashcards` | `items: [{ front, back }]` |
| `anagram` | `items: [{ word, hint?, img? }]` — пробелы в слове игнорируются |
| `groupsort` | `groups: [{ name, items: [..] }]` — 2–4 группы |
| `wheel` | `items: ["..", ".."]` — без счёта, просто колесо |
| `whack` | «Бей крота» на время (`time`, сек, по умолч. 45). `colors: [{ name, hex }]` — на табличке слово-цвет, крот покрашен, бить при несовпадении; или `items: [{ text, ok }]` — бить где `ok: false`. `hit: "right"` — бить правильные. `rule` — подсказка над полем |

Новый тип игры: функция `GAMES.<type> = (data, g) => {}` в `engine.js`, использует `g.stage`, `g.score()`, `g.progress()`, `g.finish(ok, total, note)`; добавить названия в `TYPE_NAMES`/`TYPE_HELP` и в `NAMES` в `index.html`.
