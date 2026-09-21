#!/usr/bin/env python3
# =========================================================
#  RASTERIZE: shot-*.json (примитивы из snapshot.js) -> PNG
#  Чистая Pillow, без внешних ресурсов.
#  Использование:  python3 tests/rasterize.py [mid|rich|all] [--out КАТАЛОГ]
# =========================================================
import json, math, os, random, sys
from PIL import Image, ImageDraw, ImageChops, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TAU = math.pi * 2

# ---------- цвета ----------
def parse_color(s):
    if s is None:
        return (255, 255, 255, 255)
    s = str(s).strip()
    if s.startswith('#'):
        h = s[1:]
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) if len(h) == 8 else 255
        return (r, g, b, a)
    if s.startswith('rgb'):
        p = [x.strip() for x in s[s.index('(') + 1:s.rindex(')')].split(',')]
        r, g, b = (int(float(x)) for x in p[:3])
        a = round(float(p[3]) * 255) if len(p) > 3 else 255
        return (r, g, b, a)
    return (255, 255, 255, 255)

def with_alpha(c, extra):
    return (c[0], c[1], c[2], max(0, min(255, round(c[3] * extra))))

# ---------- разбор путей в полилинии ----------
def flatten(path):
    subs, cur = [], []
    for cmd in path:
        t = cmd[0]
        if t == 'm':
            if cur:
                subs.append(cur)
            cur = [(cmd[1], cmd[2])]
        elif t == 'l':
            cur.append((cmd[1], cmd[2]))
        elif t == 'q':
            cx, cy, x2, y2 = cmd[1:5]
            x0, y0 = cur[-1] if cur else (cx, cy)
            for i in range(1, 15):
                u = i / 14.0
                cur.append(((1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x2,
                            (1 - u) ** 2 * y0 + 2 * (1 - u) * u * cy + u * u * y2))
        elif t == 'c':
            c1x, c1y, c2x, c2y, x2, y2 = cmd[1:7]
            x0, y0 = cur[-1] if cur else (c1x, c1y)
            for i in range(1, 19):
                u = i / 18.0
                cur.append(((1 - u) ** 3 * x0 + 3 * (1 - u) ** 2 * u * c1x + 3 * (1 - u) * u * u * c2x + u ** 3 * x2,
                            (1 - u) ** 3 * y0 + 3 * (1 - u) ** 2 * u * c1y + 3 * (1 - u) * u * u * c2y + u ** 3 * y2))
        elif t == 'a':
            cx, cy, r, a0, a1, ccw, full = cmd[1:8]
            if full:
                a0, a1 = 0.0, TAU
            elif ccw:
                while a1 >= a0:
                    a1 -= TAU
            else:
                while a1 <= a0:
                    a1 += TAU
            span = a1 - a0
            n = max(8, min(160, int(abs(span) * r / 2.5) + 8))
            for i in range(n + 1):
                a = a0 + span * i / n
                cur.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        elif t == 'e':
            cx, cy, rx, ry, rot, a0, a1 = cmd[1:8]
            span = a1 - a0
            if abs(span) >= TAU - 1e-6:
                a0, span = 0.0, TAU
            n = max(10, min(160, int(abs(span) * max(rx, ry) / 2.5) + 10))
            cr, sr = math.cos(rot), math.sin(rot)
            for i in range(n + 1):
                a = a0 + span * i / n
                ex, ey = math.cos(a) * rx, math.sin(a) * ry
                cur.append((cx + ex * cr - ey * sr, cy + ex * sr + ey * cr))
        elif t == 'z':
            if cur:
                cur.append(cur[0])
    if cur:
        subs.append(cur)
    return subs

# ---------- штрих с пунктиром ----------
def dash_segments(sub, dash):
    on = dash[0]
    off = dash[1] if len(dash) > 1 else dash[0]
    segs, seg = [], [sub[0]]
    drawing, acc, target = True, 0.0, on
    p0 = sub[0]
    i = 1
    while i < len(sub):
        p1 = sub[i]
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        if L < 1e-9:
            i += 1
            continue
        while True:
            remain = target - acc
            if L < remain - 1e-9:
                acc += L
                seg.append(p1)
                p0 = p1
                break
            f = remain / L if L > 0 else 0.0
            px = p0[0] + (p1[0] - p0[0]) * f
            py = p0[1] + (p1[1] - p0[1]) * f
            seg.append((px, py))
            if drawing and len(seg) >= 2:
                segs.append(seg)
            drawing = not drawing
            seg = [(px, py)]
            acc = 0.0
            target = on if drawing else off
            L -= remain
            p0 = (px, py)
        i += 1
    if drawing and len(seg) >= 2:
        segs.append(seg)
    return segs

# ---------- спрайт свечения (как glowSprite в render.js) ----------
_glow_cache = {}
def glow_sprite(color):
    key = color
    if key in _glow_cache:
        return _glow_cache[key]
    S = 64
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    px = im.load()
    r, g, b, a = color
    half = S / 2.0
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - half + 0.5, y - half + 0.5) / half
            if d >= 1:
                continue
            al = 1.0 + (0.45 - 1.0) * (d / 0.35) if d <= 0.35 else 0.45 * (1 - (d - 0.35) / 0.65)
            px[x, y] = (r, g, b, int(255 * al * a / 255))
    _glow_cache[key] = im
    return im

# ---------- звёздный фон (синтез, как starLayer в render.js) ----------
# Туманности добавляются аддитивно сплошными дисками (так их писал
# исходный растеризатор; позиции подобраны по эталонным shot-*.png).
NEBULAE = [
    (210, 470, 172, '#4a2a6a'),
    (1207, 600, 192, '#1e5a63'),
    (1010, 375, 160, '#4a2a6a'),
    (700, 400, 140, '#2a3f7a'),
    (760, 430, 120, '#6a2a3f'),
]
def star_layer(w, h, seed=7):
    im = Image.new('RGBA', (w, h), (5, 7, 14, 255))
    for (x, y, r, col) in NEBULAE:
        c = parse_color(col)
        disc = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(disc).ellipse([x - r, y - r, x + r, y + r], fill=(c[0], c[1], c[2], 255))
        im = ImageChops.add(im, disc)
    dr = ImageDraw.Draw(im)
    rnd = random.Random(seed)
    for _ in range(260):
        x, y = rnd.random() * w, rnd.random() * h
        r = rnd.random() * 1.3 + 0.25
        a = rnd.random() * 0.5 + 0.15
        dr.ellipse([x - r, y - r, x + r, y + r],
                   fill=(rnd.randint(180, 239), rnd.randint(200, 249), 255, int(a * 255)))
    return im

# ---------- шрифты ----------
_font_cache = {}
def get_font(size):
    size = max(6, int(round(size)))
    if size in _font_cache:
        return _font_cache[size]
    f = None
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
              '/usr/share/fonts/dejavu/DejaVuSans.ttf',
              'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(p):
            try:
                f = ImageFont.truetype(p, size)
                break
            except Exception:
                pass
    if f is None:
        try:
            f = ImageFont.load_default(size)
        except TypeError:
            f = ImageFont.load_default()
    _font_cache[size] = f
    return f

# ---------- отрисовка операций на слой ----------
def draw_op(dr, op):
    t = op['t']
    al = op.get('alpha', 1)
    if t == 'fill':
        col = with_alpha(parse_color(op['style']), al)
        if col[3] == 0:
            return
        for sub in flatten(op['path']):
            if len(sub) >= 3:
                dr.polygon(sub, fill=col)
    elif t == 'stroke':
        col = with_alpha(parse_color(op['style']), al)
        if col[3] == 0:
            return
        w = max(1, int(round(op.get('w', 1))))
        dash = op.get('dash')
        for sub in flatten(op['path']):
            if len(sub) < 2:
                continue
            if dash:
                for seg in dash_segments(sub, dash):
                    dr.line(seg, fill=col, width=w, joint='curve')
            else:
                dr.line(sub, fill=col, width=w, joint='curve')
    elif t in ('text', 'textstroke'):
        col = with_alpha(parse_color(op['style']), al)
        f = get_font(op.get('size', 12))
        anchor = {'center': 'm', 'left': 'l', 'right': 'r', 'start': 'l', 'end': 'r'}.get(op.get('align', 'left'), 'l') + 'm'
        if t == 'text':
            dr.text((op['x'], op['y']), op['txt'], font=f, fill=col, anchor=anchor)
        else:
            dr.text((op['x'], op['y']), op['txt'], font=f, fill=(0, 0, 0, 0),
                    stroke_width=max(1, int(round(op.get('w', 1)))), stroke_fill=col, anchor=anchor)

def paste_image(base, op):
    al = op.get('alpha', 1)
    x, y = op['x'], op['y']
    w = max(2, int(round(op['w'])))
    h = max(2, int(round(op['h'])))
    if op.get('bg'):
        layer = star_layer(w, h)
        if al < 1:
            layer.putalpha(layer.getchannel('A').point(lambda v: int(v * al)))
    else:
        spr = glow_sprite(parse_color(op.get('glow') or '#ffffff'))
        spr = spr.resize((w, h), Image.BILINEAR)
        if al < 1:
            spr.putalpha(spr.getchannel('A').point(lambda v: int(v * al)))
        layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
        layer.paste(spr, (int(round(x)), int(round(y))))
        return layer
    full = Image.new('RGBA', base.size, (0, 0, 0, 0))
    full.paste(layer, (int(round(x)), int(round(y))))
    return full

def op_opaque(op):
    """Источник непрозрачен и рисуется за один проход — можно бить прямо в базу."""
    if op['t'] not in ('fill', 'stroke', 'text', 'textstroke'):
        return False
    if op.get('alpha', 1) < 1:
        return False
    c = parse_color(op['style'])
    return c[3] >= 255

def render_shot(doc):
    w, h = doc['w'], doc['h']
    base = Image.new('RGBA', (w, h), (5, 7, 14, 255))
    ops = doc['ops']
    i, n = 0, len(ops)
    while i < n:
        op = ops[i]
        comp = op.get('comp', 'source-over')
        # серия непрозрачных source-over операций рисуется прямо на базу
        if comp == 'source-over' and op['t'] != 'image' and op_opaque(op):
            j = i
            while (j < n and ops[j].get('comp', 'source-over') == 'source-over'
                   and ops[j]['t'] != 'image' and op_opaque(ops[j])):
                j += 1
            dr = ImageDraw.Draw(base)
            for o in ops[i:j]:
                draw_op(dr, o)
            i = j
            continue
        # одиночная операция на собственном временном слое
        if op['t'] == 'image':
            layer = paste_image(base, op)
        else:
            layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            draw_op(ImageDraw.Draw(layer), op)
        base = merge(base, layer, comp)
        i += 1
    return base.convert('RGB')

def merge(base, layer, comp):
    if comp == 'lighter':
        # канвасный 'lighter' в исходном растеризаторе = аддитивное сложение
        # каналов цвета (см. эталонные shot-*.png): свечения выглядят
        # «плоскими» пятнами — так и задумано пайплайном скриншотов.
        return ImageChops.add(base, layer)
    return Image.alpha_composite(base, layer)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir = None
    for k, a in enumerate(sys.argv[1:]):
        if a == '--out' and k + 2 <= len(sys.argv[1:]):
            out_dir = sys.argv[1:][k + 1]
    which = args or ['mid', 'rich']
    if which == ['all']:
        which = ['mid', 'rich']
    for name in which:
        src = os.path.join(HERE, 'shot-%s.json' % name)
        if not os.path.exists(src):
            print('нет файла ' + src)
            continue
        doc = json.load(open(src, encoding='utf8'))
        img = render_shot(doc)
        dst_dir = out_dir or HERE
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, 'shot-%s.png' % name)
        img.save(dst)
        m = doc.get('meta', {})
        print('shot-%s.png: %d примитивов, волна %s, врагов %s, построек %s' %
              (name, len(doc['ops']), m.get('wave'), m.get('enemies'), m.get('structs')))

if __name__ == '__main__':
    main()
