#!/usr/bin/env python3
"""Generate embeddable share pages for every game in games/index.json.

For each game writes:
  g/<slug>/index.html   — the game itself + player meta tags (Twitter card, og:video,
                          Iframely link, oEmbed discovery) so Canva/Iframely embed it as a live player
  g/<slug>/oembed.json  — oEmbed "rich" response with the iframe
  g/<slug>/cover.png    — preview picture (rendered from SVG with macOS qlmanage)
  canva/<slug>.html     — one self-contained file (CSS, JS, data inline) to upload into Canva
  codepen/<slug>.html   — button that opens the game prefilled in CodePen (Canva plays CodePen links live)

Run before every push:  python3 build.py
"""
import html
import json
import os
import shutil
import subprocess
import tempfile

SITE = 'https://arrietta.github.io/games/'
W, H = 800, 600
ROOT = os.path.dirname(os.path.abspath(__file__))

TYPE_NAMES = {
    'quiz': 'Викторина', 'truefalse': 'Правда или ложь', 'match': 'Найди пару',
    'flashcards': 'Карточки', 'anagram': 'Анаграмма', 'groupsort': 'Сортировка по группам',
    'wheel': 'Колесо фортуны', 'whack': 'Бей крота',
}
TYPE_EMOJI = {
    'quiz': '❓', 'truefalse': '✅', 'match': '🧩', 'flashcards': '🃏', 'anagram': '🔤',
    'groupsort': '🗂️', 'wheel': '🎡', 'whack': '🔨',
}
THEME_BG = {
    'space': ('#2a1f6b', '#0f1033', '#ffffff'), 'forest': ('#c8e8b6', '#e9f6e3', '#1f3a24'),
    'ocean': ('#a9dcf0', '#e2f4fb', '#12324a'), 'candy': ('#ffd3e8', '#fff0f7', '#4a1d3a'),
    'school': ('#f6e9c4', '#fdf8ec', '#2d2a24'), 'winter': ('#cfe4ff', '#eef6ff', '#15294a'),
}

PAGE = '''<!doctype html>
<html lang="ru" data-game="{slug}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="../../">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <meta property="og:site_name" content="Игры для уроков">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{desc}">
  <meta property="og:type" content="video.other">
  <meta property="og:url" content="{share}">
  <meta property="og:image" content="{cover}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="1200">
  <meta property="og:video" content="{player}">
  <meta property="og:video:url" content="{player}">
  <meta property="og:video:secure_url" content="{player}">
  <meta property="og:video:type" content="text/html">
  <meta property="og:video:width" content="{w}">
  <meta property="og:video:height" content="{h}">
  <meta name="twitter:card" content="player">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{desc}">
  <meta name="twitter:image" content="{cover}">
  <meta name="twitter:player" content="{player}">
  <meta name="twitter:player:width" content="{w}">
  <meta name="twitter:player:height" content="{h}">
  <link rel="iframely player" href="{player}" media="(aspect-ratio: {w}/{h})">
  <link rel="alternate" type="application/json+oembed" href="{oembed}" title="{title}">
  <link rel="canonical" href="{share}">
  <link rel="stylesheet" href="engine.css">
</head>
<body>
  <div id="app">
    <header class="bar">
      <h1 id="title">Загрузка…</h1>
      <div class="stats">
        <span class="pill" id="score"></span>
        <span class="pill" id="timer"></span>
        <button class="icon-btn" id="mute" title="Звук">🔊</button>
        <button class="icon-btn" id="fs" title="Во весь экран">⛶</button>
      </div>
      <div class="progress" id="progress" style="width:0"></div>
    </header>
    <main id="stage"></main>
  </div>
  <script src="engine.js"></script>
</body>
</html>
'''

COVER = '''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs><radialGradient id="g" cx="20%" cy="0%" r="110%"><stop offset="0" stop-color="{bg1}"/><stop offset=".7" stop-color="{bg2}"/></radialGradient></defs>
  <rect width="1200" height="1200" fill="url(#g)"/>
  <text x="600" y="500" font-size="260" text-anchor="middle">{emoji}</text>
  <text x="600" y="660" font-family="Helvetica Neue, Arial" font-weight="bold" font-size="40" fill="{ink}" opacity=".6" text-anchor="middle">{type}</text>
  <text x="600" y="770" font-family="Helvetica Neue, Arial" font-weight="bold" font-size="{fs}" fill="{ink}" text-anchor="middle">{title}</text>
  <rect x="470" y="860" width="260" height="84" rx="20" fill="#5b5bf0"/>
  <text x="600" y="916" font-family="Helvetica Neue, Arial" font-weight="bold" font-size="38" fill="#fff" text-anchor="middle">▶ Играть</text>
</svg>'''


def cover_png(game, out):
    bg1, bg2, ink = THEME_BG.get(game.get('theme'), ('#dfe8ff', '#eef3ff', '#1d2340'))
    title = game['title']
    svg = COVER.format(bg1=bg1, bg2=bg2, ink=ink, emoji=TYPE_EMOJI.get(game['type'], '🎲'),
                       type=html.escape(TYPE_NAMES.get(game['type'], '')), title=html.escape(title),
                       fs=72 if len(title) < 26 else max(40, int(1800 / len(title))))
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'cover.svg')
        with open(src, 'w') as f:
            f.write(svg)
        subprocess.run(['qlmanage', '-t', '-s', '1200', '-o', tmp, src],
                       check=True, capture_output=True)
        shutil.move(os.path.join(tmp, 'cover.svg.png'), out)


def standalone(game, out):
    with open(os.path.join(ROOT, 'engine.css')) as f:
        css = f.read()
    with open(os.path.join(ROOT, 'engine.js')) as f:
        js = f.read()
    with open(os.path.join(ROOT, 'play.html')) as f:
        page = f.read()
    data = json.dumps(game, ensure_ascii=False).replace('</', '<\\/')
    page = page.replace('<link rel="stylesheet" href="engine.css">', f'<style>\n{css}\n</style>')
    page = page.replace('<title>Игра для урока</title>', f'<title>{html.escape(game["title"])}</title>')
    page = page.replace('<script src="engine.js"></script>',
                        f'<script type="application/json" id="game-data">{data}</script>\n<script>\n{js}\n</script>')
    with open(out, 'w') as f:
        f.write(page)


CODEPEN = '''<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — в CodePen</title>
  <link rel="stylesheet" href="../engine.css">
</head>
<body>
  <div id="app"><main id="stage">
    <div class="card intro">
      <div class="type">Перенос в CodePen</div>
      <h2>{title}</h2>
      <p class="muted">1. Войди в CodePen в этом браузере. 2. Нажми кнопку. 3. В CodePen нажми <b>Save</b> и скопируй ссылку из адресной строки — её и вставляй в Canva.</p>
      <form action="https://codepen.io/pen/define" method="POST">
        <input type="hidden" name="data" value="{data}">
        <button class="btn" type="submit">Открыть в CodePen</button>
      </form>
    </div>
  </main></div>
</body>
</html>
'''


def codepen(game, out):
    with open(os.path.join(ROOT, 'engine.css')) as f:
        css = f.read()
    with open(os.path.join(ROOT, 'engine.js')) as f:
        js = f.read()
    with open(os.path.join(ROOT, 'play.html')) as f:
        page = f.read()
    body = page[page.index('<div id="app">'):page.index('<script src="engine.js">')].strip()
    data = json.dumps(game, ensure_ascii=False).replace('</', '<\\/')
    pen = {
        'title': game['title'], 'description': 'Игра для урока', 'editors': '001', 'layout': 'left',
        'html': body + f'\n<script type="application/json" id="game-data">{data}</script>',
        'css': css, 'js': js,
    }
    with open(out, 'w') as f:
        f.write(CODEPEN.format(title=html.escape(game['title']),
                               data=html.escape(json.dumps(pen, ensure_ascii=False), quote=True)))


def main():
    with open(os.path.join(ROOT, 'games', 'index.json')) as f:
        catalog = json.load(f)
    for entry in catalog:
        slug = entry['slug']
        with open(os.path.join(ROOT, 'games', slug + '.json')) as f:
            game = json.load(f)
        d = os.path.join(ROOT, 'g', slug)
        os.makedirs(d, exist_ok=True)
        share = f'{SITE}g/{slug}/'
        player = f'{SITE}play.html?g={slug}'
        cover = share + 'cover.png'
        oembed = share + 'oembed.json'
        title = game['title']
        desc = game.get('instructions') or f'{TYPE_NAMES.get(game["type"], "Игра")} — интерактивная игра для урока'
        esc = lambda s: html.escape(s, quote=True)
        with open(os.path.join(d, 'index.html'), 'w') as f:
            f.write(PAGE.format(slug=slug, title=esc(title), desc=esc(desc), share=share, player=esc(player),
                                cover=cover, oembed=oembed, w=W, h=H))
        with open(os.path.join(d, 'oembed.json'), 'w') as f:
            json.dump({
                'version': '1.0', 'type': 'rich', 'provider_name': 'Игры для уроков', 'provider_url': SITE,
                'title': title, 'width': W, 'height': H,
                'thumbnail_url': cover, 'thumbnail_width': 1200, 'thumbnail_height': 1200,
                'html': f'<iframe src="{esc(player)}" width="{W}" height="{H}" frameborder="0" '
                        f'allow="fullscreen; autoplay" allowfullscreen style="border:0;max-width:100%"></iframe>',
            }, f, ensure_ascii=False, indent=2)
        cover_png(game, os.path.join(d, 'cover.png'))
        os.makedirs(os.path.join(ROOT, 'canva'), exist_ok=True)
        standalone(game, os.path.join(ROOT, 'canva', slug + '.html'))
        os.makedirs(os.path.join(ROOT, 'codepen'), exist_ok=True)
        codepen(game, os.path.join(ROOT, 'codepen', slug + '.html'))
        print('ok', share)


if __name__ == '__main__':
    main()
