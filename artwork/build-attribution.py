#!/usr/bin/env python3
"""Render the AdsGalaxy ad → site → CRM hero. The two compositions have independent geometry.

Run with Python 3, FontTools (WOFF2), Pillow, NumPy and Inkscape.
Example: python3 build-attribution.py --assets ../dist/assets --out ./render
The master SVGs and WebP surfaces include only the stationary copy, with outlined letters.
The companion SVGs use live text in the page's Manrope variable font.
"""
import argparse
import html
import math
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


def n(value):
    return f'{value:.2f}'.rstrip('0').rstrip('.') or '0'


def rect(x, y, w, h, radius, fill, extra=''):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" {extra}/>'


def line(x1, y1, x2, y2, paint, width=1, extra=''):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{paint}" stroke-width="{width}" {extra}/>'


def dot(x, y, r, fill, extra=''):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" {extra}/>'


def group(parts, transform='', label=''):
    label = f'aria-label="{html.escape(label)}"' if label else ''
    return f'<g transform="{transform}" {label}>\n' + '\n'.join(parts) + '\n</g>'


def gradient(name, stops, x1='0%', y1='0%', x2='100%', y2='100%', units='objectBoundingBox'):
    chunks = [f'<linearGradient id="{name}" gradientUnits="{units}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">']
    for p, col in stops:
        chunks.append(f'<stop offset="{p}" stop-color="{col}"/>')
    return ''.join(chunks) + '</linearGradient>'


class Type:
    """Use the project's existing Manrope Cyrillic and Latin outlines."""
    def __init__(self, assets):
        self.assets = assets
        self.defs = {}

    @lru_cache(None)
    def face(self, family, weight):
        path = self.assets / f'manrope-{family}.woff2'
        font = TTFont(path)
        return instantiateVariableFont(font, {'wght': weight}, inplace=True)

    def text(self, value, x, baseline, size, ink, weight=600, tracking=0, right=False):
        runs = []
        advance = 0
        for ch in value:
            family = 'cyrillic' if '\u0400' <= ch <= '\u052f' else 'latin'
            font = self.face(family, weight)
            glyphs = font.getGlyphSet()
            name = font.getBestCmap().get(ord(ch))
            if name is None:
                raise ValueError(f'Missing character {ch!r}')
            em = font['head'].unitsPerEm
            identifier = f'g{weight}{family[0]}{ord(ch):x}'
            if identifier not in self.defs:
                pen = SVGPathPen(glyphs)
                glyphs[name].draw(pen)
                self.defs[identifier] = f'<path id="{identifier}" d="{pen.getCommands()}"/>'
            scale = size / em
            if ch != ' ':
                runs.append(f'<use xlink:href="#{identifier}" transform="translate({n(advance)}) scale({scale:.7f},-{scale:.7f})"/>')
            advance += glyphs[name].width * scale + tracking
        if right:
            x -= advance
        safe = html.escape(value, quote=True)
        return f'<g aria-label="{safe}" fill="{ink}" transform="translate({n(x)} {n(baseline)})"><title>{safe}</title>' + ''.join(runs) + '</g>'


def registered(c):
    return [
        gradient('search-chrome', [(0,'#555c50'),(.05,'#3b4338'),(.42,'#252c24'),(1,'#1a201a')]),
        gradient('edge', [(0,'#faf9e4'),(.12,'#7e8674'),(.46,'#45513d'),(.72,'#2e362a'),(.96,'#8a957b'),(1,'#515b47')]),
        gradient('paper', [(0,'#faf8ed'),(.45,'#eae9de'),(.87,'#d7d9c9'),(1,'#dce0cb')]),
        gradient('ad-wall', [(0,'#acb2a0'),(.26,'#515a49'),(.46,'#272f26'),(.79,'#22291e'),(1,'#a8b299')]),
        gradient('lead', [(0,'#ebff9a'),(.23,'#dcf879'),(.61,'#cfed64'),(1,'#b6ce54')]),
        gradient('lead-wall', [(0,'#d2e681'),(.2,'#718640'),(.55,'#384422'),(.92,'#566531'),(1,'#b4cc6a')]),
        gradient('glass', [(0,'#50594c'),(.05,'#30382e'),(.53,'#1d251f'),(1,'#111913')]),
        gradient('metal', [(0,'#fffef1'),(.19,'#f2f7d3'),(.45,'#c6d597'),(.58,'#a9b488'),(.85,'#748462'),(1,'#dfe8bd')]),
        gradient('metal-side', [(0,'#e0e9ac'),(.26,'#9ba87c'),(.49,'#6a795a'),(.69,'#384831'),(1,'#1d291c')]),
        gradient('bend', [(0,'#51664b'),(.14,'#859d6f'),(.36,'#c3d985'),(.50,'#849d63'),(.72,'#d5eaa0'),(1,'#535c38')],x1='0%',y1='90%',x2='100%',y2='10%'),
        gradient('hot',[(0,'#9bb159'),(.4,'#e3ff9b'),(.57,'#607240'),(1,'#e6f7a4')],x1='0%',y1='100%',x2='100%',y2='0%'),
        '<radialGradient id="atmos"><stop stop-color="#313a28" stop-opacity=".68"/><stop offset=".46" stop-color="#252e20" stop-opacity=".55"/><stop offset="1" stop-color="#0a0d0a" stop-opacity="0"/></radialGradient>',
        '<radialGradient id="minorlight"><stop stop-color="#a5c257" stop-opacity=".20"/><stop offset="1" stop-color="#66742c" stop-opacity="0"/></radialGradient>',
        '<radialGradient id="falloff"><stop stop-color="white"/><stop offset=".56" stop-color="#747474"/><stop offset="1" stop-color="black"/></radialGradient>',
        '<filter id="blur-xl" x="-55%" y="-70%" width="210%" height="260%"><feGaussianBlur stdDeviation="25"/></filter>',
        '<filter id="blur-m" x="-45%" y="-85%" width="200%" height="290%"><feGaussianBlur stdDeviation="9"/></filter>',
        '<filter id="blur-s" x="-25%" y="-50%" width="150%" height="210%"><feGaussianBlur stdDeviation="3"/></filter>',
        '<pattern id="dots" width="19" height="19" patternUnits="userSpaceOnUse" patternTransform="matrix(1 -.087 .17 .81 40 30)"><circle cx="3" cy="3" r="1.15" fill="#a9b49a"/></pattern>',
    ]


def search_icon(x,y,r,stroke):
    return dot(x,y,r,'none',f'stroke="{stroke}" stroke-width="2.4"') + line(x+r*.69,y+r*.69,x+r*1.63,y+r*1.63,stroke,2.6,'stroke-linecap="round"')


def link_icon(x,y,color,scale=1):
    return f'<g transform="translate({x} {y}) scale({scale})" fill="none" stroke="{color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 13 13 1M3 1h10v10"/></g>'


def search_window(t,mobile=False):
    width, height = (478,153) if mobile else (644,248)
    top = 54 if mobile else 75
    # The soft machine edge and two separate surfaces make this a software advertising placement.
    outer = [
        rect(0,23,width,height,18,'#000','opacity=".63" filter="url(#blur-xl)"'),
        rect(0,8,width,height,18,'#050805','opacity=".92" filter="url(#blur-m)"'),
        rect(0,6,width,height,18,'url(#ad-wall)'),
        rect(0,3,width,height,18,'url(#edge)'),
        rect(0,0,width,height,18,'url(#edge)'),
        rect(1.6,1.8,width-3.2,height-4,16,'url(#search-chrome)'),
        f'<path d="M3 {top-3}H{width-3}V{height-17}Q{width-3} {height-3} {width-17} {height-3}H17Q3 {height-3} 3 {height-17}Z" fill="url(#paper)"/>',
        line(6,top-3,width-7,top-3,'#ffffed',1,'opacity=".75"'),
    ]
    if mobile:
        outer += [
            search_icon(35,28,8,'#ebefdf'),
            rect(22,68,95,27,6,'#d0d2c4','stroke="#a3aa96" stroke-width="1"'),
            t.text('adsgalaxy.ru',127,88,20,'#56604f',560),
            link_icon(437,105,'#536249',1.1),
        ]
    else:
        outer += [
            rect(18,14,width-38,43,10,'#1b211a','stroke="#67725d" stroke-width="1.15"'),
            search_icon(43,33,7,'#dce2cf'),
            rect(27,96,92,27,7,'#d1d6c5','stroke="#a2ab93" stroke-width="1"'),
            t.text('adsgalaxy.ru',135,118,22,'#58634d',620),
            link_icon(579,150,'#536249',1.36),
        ]
    return ''.join(outer)


def lead(t,mobile=False):
    width, height = (354,143) if mobile else (503,201)
    # A distinct paper-white ad and an acid CRM event end the route on different surfaces.
    out=[
        rect(6,29,width,height,17,'#000','opacity=".65" filter="url(#blur-xl)"'),
        rect(2,13,width,height,17,'#070b05','opacity=".84" filter="url(#blur-m)"'),
        rect(1,6,width,height,16,'url(#lead-wall)'),
        rect(1,3,width,height,16,'url(#lead-wall)'),
        rect(0,0,width,height,16,'url(#lead)','stroke="#d8e9a2" stroke-width="1.7"'),
        rect(3,3,width-6,height-6,13,'none','stroke="#f6ffd7" stroke-opacity=".35" stroke-width=".9"'),
    ]
    if mobile:
        out += [
            rect(19,12,77,31,6,'#25341b'),
            t.text('CRM',28,36,24,'#e6fbac',720),
            t.text('Входящие',width-19,36,20,'#354324',610,-.1,True),
            t.text('Новая заявка',18,87,43,'#1a2811',730,-1.9),
            line(19,101,width-19,101,'#91a94c',1),
        ]
    else:
        out += [
            rect(23,17,85,33,7,'#26331d'),
            t.text('CRM',37,42,24,'#e4f8a7',720),
            t.text('Входящие',width-24,42,22,'#3c4c2a',630,-.15,True),
            t.text('Новая заявка',21,123,64,'#1b2813',720,-2.6),
            line(23,145,width-24,145,'#8fa44c',1.2),
        ]
    return ''.join(out)


def cursor(x,y,s=1):
    # A bevelled closed pointer with a physically separate underside. Its tip touches the ad.
    outline='M0 0 13 76 32 58 51 87 65 77 46 49 73 44Z'
    return group([
        f'<path d="{outline}" fill="#111710" opacity=".54" transform="translate(5 11)" filter="url(#blur-m)"/>',
        f'<path d="{outline}" fill="url(#metal-side)" stroke="#242d1d" stroke-width="5" stroke-linejoin="round" transform="translate(5 6)"/>',
        f'<path d="{outline}" fill="url(#metal)" stroke="#f5fae0" stroke-width="2.4" stroke-linejoin="round"/>',
        '<path d="M1 1 32 46 13 74Z" fill="#edf4d6" opacity=".92"/>',
        '<path d="M1 1 70 44 32 46Z" fill="#d3dbb0" opacity=".83"/>',
        '<path d="M32 46 45 50 63 76 53 83Z" fill="#b2bf95"/>',
        '<path d="M1 1 32 46 53 83" fill="none" stroke="#f3fbcd" stroke-width="1.2"/>',
    ],f'translate({x} {y}) scale({s}) rotate(-9)','Клик по объявлению')


def tagged_visit(mobile=False):
    width,height=(282,61) if mobile else (365,66)
    if mobile:
        iconpath='M22 23 15 30 22 37M36 23l7 7-7 7M31 20l-5 21'
    else:
        iconpath='M31 27 22 34l9 7M49 27l9 7-9 7M44 21l-8 26'
    return ''.join([
        rect(0,7,width,height,12,'#000','opacity=".74" filter="url(#blur-m)"'),
        rect(0,2,width,height,12,'#0e1711'),
        rect(0,0,width,height,12,'url(#glass)','stroke="#65775e" stroke-width="1.35"'),
        f'<path d="{iconpath}" fill="none" stroke="#d6f998" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    ])


DESKTOP_SPANS = [
    [(773,298),(810,302),(904,251),(964,283)],
    [(964,283),(1033,320),(1010,398),(917,425)],
    [(917,425),(779,464),(588,423),(474,474)],
    [(474,474),(345,532),(419,629),(543,599)],
    [(543,599),(587,589),(607,551),(661,550)],
]
MOBILE_SPANS = [
    [(397,138),(424,144),(498,75),(565,87)],
    [(565,87),(662,103),(661,173),(587,193)],
    [(587,193),(493,218),(323,160),(240,203)],
    [(240,203),(142,253),(179,303),(270,298)],
    [(270,298),(333,292),(352,275),(406,271)],
]


def samples(spans):
    pts, params=[],[]
    for i, span in enumerate(spans):
        a,b,c,d = map(np.asarray,span)
        for j in range(45 if i<len(spans)-1 else 46):
            t=j/45
            pts.append((1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d)
            params.append((i+t)/len(spans))
    return np.asarray(pts),np.asarray(params)


def path_through(points):
    return 'M'+' L'.join(' '.join(n(q) for q in p) for p in points)


def strands(mobile):
    pts,p=samples(MOBILE_SPANS if mobile else DESKTOP_SPANS)
    tangent=np.gradient(pts,axis=0)
    tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    normal=np.column_stack((-tangent[:,1],tangent[:,0]))
    spread=(np.sin(np.pi*p)**.65)*(8 if mobile else 12)*(1+.3*np.cos(7*p))
    # One tapered optical ribbon, with different views of a single bundle at its bends.
    spread+= (np.exp(-((p-.29)/.125)**2)*(7 if mobile else 13)
              + np.exp(-((p-.75)/.13)**2)*(5 if mobile else 12))
    twist=np.cos(2*np.pi*(p-.2))
    base=path_through(pts)
    def trace(d,color,width,extra=''):
        return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{n(width)}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'
    pieces=[
        trace(base,'#030503',26 if mobile else 40,'transform="translate(4 16)" filter="url(#blur-m)" opacity=".86"'),
        trace(base,'#b3d164',16 if mobile else 23,'opacity=".14" filter="url(#blur-m)"'),
    ]
    rr=9 if mobile else 13
    for i,a in enumerate(np.linspace(-1,1,rr)):
        wave=normal*((a*spread*twist)[:,None])
        # Front/back variation across the bundle makes the signal turn in space.
        q=pts+wave
        ink=('url(#hot)' if i in (rr//2,rr-3) else 'url(#bend)')
        intensity=.40+.51*(.5+.5*math.sin(i*1.83))**1.2
        pieces.append(trace(path_through(q),ink,1.15 if mobile else 1.45,f'opacity="{intensity:.3f}"'))
    for start,end,a in [(.19,.245,.45),(.67,.725,-.50),(.87,.92,.75)]:
        q=(pts+normal*((spread*a*twist)[:,None]))[(p>=start)&(p<=end)]
        pieces.append(trace(path_through(q),'#e3fec0',1.8 if mobile else 2.1,'opacity=".79"'))
    return ''.join(pieces)


def scene(t,mobile=False):
    W,H=(800,400) if mobile else (1200,800)
    center=(475,227) if mobile else (735,405)
    radius=(453,237) if mobile else (580,385)
    gx,gy=center; rx,ry=radius
    bg=[rect(0,0,W,H,0,'#0a0d0a'),
        f'<ellipse cx="{gx}" cy="{gy}" rx="{rx}" ry="{ry}" fill="url(#atmos)"/>',
        f'<ellipse cx="{gx}" cy="{gy}" rx="{rx}" ry="{ry}" fill="url(#dots)" opacity=".36" mask="url(#dotfade)"/>',
    ]
    if mobile:
        meta='<mask id="dotfade"><ellipse cx="464" cy="208" rx="384" ry="166" fill="url(#falloff)"/></mask>'
        adtm='matrix(.997 -.065 .065 .997 30 47)'
        crmtm='matrix(.999 .045 -.045 .999 397 218)'
        tagtm='matrix(.999 -.04 .04 .999 48 218)'
        loc=(475,135,.59); port=(395,270)
        bg += ['<ellipse cx="530" cy="344" rx="196" ry="39" fill="url(#minorlight)" opacity=".50"/>']
    else:
        meta='<mask id="dotfade"><ellipse cx="730" cy="417" rx="530" ry="294" fill="url(#falloff)"/></mask>'
        adtm='matrix(.991 -.075 .062 .99 221 143)'
        crmtm='matrix(.996 .067 -.054 .995 636 479)'
        tagtm='matrix(.997 -.077 .07 .997 249 445)'
        loc=(813,264,.94); port=(632,550)
        bg += ['<ellipse cx="810" cy="669" rx="280" ry="97" fill="url(#minorlight)" opacity=".58"/>']
    transform = {"search": adtm, "visit": tagtm, "crm": crmtm}
    body=[
        *bg,
        group([strands(mobile)],label='Маршрут перехода'),
        group([search_window(t,mobile)],adtm,'Поисковая реклама'),
        cursor(*loc),
        group([tagged_visit(mobile)],tagtm,'UTM-метка перехода'),
        group([lead(t,mobile)],crmtm,'Карточка входящей заявки'),
    ]
    px,py=port
    body += [
        dot(px,py,7 if mobile else 10,'#adcd72','stroke="#171e15" stroke-width="2.7"'),
        dot(px,py,3.4 if mobile else 4.7,'#e9ffba'),
    ]
    return W,H,meta,'\n'.join(body),transform


# Coordinates are local to each plate, before its original affine transform.
# Each tuple is (name, x, baseline, font-size, fill, weight, tracking, available-width).
DESKTOP_FIELDS = {
    "search": [
        ("query",       68,  42, 24, "#edeedc", 550, -.2,  535),
        ("badge",       37, 116, 18, "#364031", 700, -.32,   75),
        ("title",       25, 179, 52, "#1f261d", 710, -1.9, 540),
        ("detail",      28, 218, 22, "#4d594a", 570, -.2,  534),
    ],
    "visit": [
        ("step",        78,  26, 16, "#b6c8a4", 600,   .1, 270),
        ("signal",      77,  52, 26, "#ecf3e1", 650,  -.1, 273),
    ],
    "crm": [
        ("sourceLabel", 24, 178, 20, "#42552b", 600,    0, 158),
        ("source",     478, 179, 24, "#27391c", 665,  -.4, 279),
    ],
}
MOBILE_FIELDS = {
    "search": [
        ("query",        57,  35, 24, "#efefe3", 550,  -.2, 392),
        ("badge",        32,  88, 19, "#313b2d", 700, -.50,  78),
        ("title",        22, 132, 38, "#20271f", 710,-1.25, 403),
    ],
    "visit": [
        ("step",         55,  23, 18, "#bfcea9", 600, -.15, 213),
        ("signal",       54,  48, 21, "#ecf3e1", 650,  -.2, 216),
    ],
    "crm": [
        ("sourceLabel",  18, 128, 17, "#43572c", 600,    0, 104),
        ("source",      336, 128, 20, "#26391e", 680,  -.4, 203),
    ],
}
DEFAULT_COPY = {
    "query": "реклама для бизнеса",
    "badge": "Реклама",
    "title": "Контекстная реклама",
    "detail": "Яндекс Директ   ·   Сквозная аналитика",
    "step": "Переход на сайт",
    "signal": "utm_source=yandex",
    "sourceLabel": "Источник",
    "source": "Яндекс Директ",
}


def live_copy(mobile, width, height, transforms):
    size = "mobile" if mobile else "desktop"
    groups = MOBILE_FIELDS if mobile else DESKTOP_FIELDS
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" class="attribution-copy attribution-copy--{size}" '
        f'viewBox="0 0 {width} {height}" preserveAspectRatio="none" aria-hidden="true" '
        'focusable="false" font-family="Manrope, sans-serif" '
        'style="font-kerning:none;font-variant-ligatures:none;font-synthesis:none">',
    ]
    for plate, fields in groups.items():
        lines.append(f'  <g transform="{transforms[plate]}">')
        for name, x, y, font_size, ink, weight, tracking, max_width in fields:
            anchor = 'end' if name == "source" else 'start'
            lines.append(
                f'    <text data-service-field="{name}" data-max-width="{max_width}" '
                f'x="{x}" y="{y}" text-anchor="{anchor}" font-size="{font_size}" '
                f'font-weight="{weight}" letter-spacing="{n(tracking)}" fill="{ink}" '
                f'xml:space="preserve" style="white-space:pre">{html.escape(DEFAULT_COPY[name])}</text>'
            )
        lines.append('  </g>')
    lines.append('</svg>')
    return '\n'.join(lines) + '\n'


def export(assets,out):
    out.mkdir(parents=True,exist_ok=True)
    for mobile in (False,True):
        t=Type(assets)
        w,h,extra,body,transforms=scene(t,mobile)
        label='mobile' if mobile else 'desktop'
        svg=out/f'attribution-{label}.svg'
        (out/f'attribution-copy-{label}.svg').write_text(live_copy(mobile,w,h,transforms), encoding='utf8')
        defs='\n'.join(registered(mobile)+[extra]+list(t.defs.values()))
        svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><title>Поисковая реклама, переход на сайт и новая заявка в CRM</title><defs>{defs}</defs>\n{body}</svg>', encoding='utf8')
        with tempfile.TemporaryDirectory() as td:
            png=Path(td)/'master.png'
            subprocess.run(['inkscape',str(svg),'--export-width='+str(w*2),'--export-filename='+str(png)],check=True)
            with Image.open(png) as im:
                # sRGB grain is local to lit material; untouched dark edges tile seamlessly into the site.
                a=np.asarray(im.convert('RGB'),dtype=np.float32)
                light=np.clip((np.max(a,axis=2)-18)/140,0,1)
                rng=np.random.default_rng(42)
                grain=rng.normal(0,.96,size=light.shape)*light
                master=Image.fromarray(np.clip(a+grain[:,:,None],0,255).astype(np.uint8))
                sizes=(480,800,1200) if mobile else (640,1024,1536)
                for size in sizes:
                    pic=master.resize((size,round(size*h/w)), Image.Resampling.LANCZOS)
                    filename=f'attribution-base-{"mobile-" if mobile else ""}{size}.webp'
                    pic.save(out/filename, quality=91, method=6)
                master.thumbnail((850,475))
                master.save(out/f'preview-{label}.png')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--assets',required=True,type=Path,help='Directory containing the bundled Manrope WOFF2 subsets')
    p.add_argument('--out',type=Path,default=Path('render'))
    args=p.parse_args()
    export(args.assets,args.out)
