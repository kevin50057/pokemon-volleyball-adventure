"""把維護者提供的御三家進化型原圖（JPG，背景是烤進去的灰白棋盤格）轉成遊戲用的 7x4、64px 精靈圖。
格子排法跟小火龍、妙蛙種子、傑尼龜的圖一樣（由左到右、由上到下：一般 5、跳 5、殺球 5、撲救 2、倒地 1、贏 5、輸 5）。

去背：先從每一格的角落找出這張圖棋盤格的灰（每張圖不一樣），再從每一格的邊框 flood fill，只吃這些灰，
碰到角色的描邊就停，所以角色身上的白色、灰色（爪子、牙齒、水箭龜的砲管）不會被吃掉。
被角色包住的背景洞（例如噴火龍翅膀和身體之間）也去掉；隔壁格伸進來的小碎片、灰色的雜點丟掉。
切格：每一排在原本格線附近找角色之間的空隙來切（角色沒有對齊格線時不會被切成兩半），切好後角色左右置中。

用法：python scripts/make-evo-sheets.py <原圖資料夾> <輸出資料夾> [預覽.png]
  原圖檔名：charmeleon.jpg charizard.jpg ivysaur.jpg venusaur.jpg wartortle.jpg blastoise.jpg
"""
import json, os, sys
import numpy as np
from PIL import Image

FORMS = ['charmeleon', 'charizard', 'ivysaur', 'venusaur', 'wartortle', 'blastoise']
COLS, ROWS, CELL, GAP = 7, 4, 64, 2
COUNTS = [5, 5, 5, 2, 1, 5, 5]
NAMES = [(s, f) for s, n in enumerate(COUNTS) for f in range(n)]


def bg_bins(im, cw, ch):
    """背景棋盤格的灰階：取每一格四個角落 18x18 的灰色像素，亮度分布裡佔比夠大的幾個區間就是背景色。
    （每張圖的格子灰不一樣：妙蛙草很深、噴火龍接近白色。）"""
    mx, mn = im.max(axis=2), im.min(axis=2)
    L = im.mean(axis=2)
    vals = []
    for r in range(ROWS):
        for c in range(COLS):
            x0, y0, x1, y1 = int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)
            for ys in (slice(y0 + 1, y0 + 19), slice(y1 - 19, y1 - 1)):
                for xs in (slice(x0 + 1, x0 + 19), slice(x1 - 19, x1 - 1)):
                    g = (mx[ys, xs] - mn[ys, xs]) < 28
                    vals.append(L[ys, xs][g])
    v = np.concatenate(vals)
    hist = np.histogram(v, bins=64, range=(0, 256))[0]
    keep = hist >= 0.04 * len(v)
    return [(i * 4 - 6, i * 4 + 10) for i in range(64) if keep[i]]


def span(bins):
    """兩種格子色之間整段的灰（JPG 會在格子交界糊出介於兩者之間的灰）。"""
    return [(min(lo for lo, _ in bins), max(hi for _, hi in bins))]


def is_bg_color(rgb, bins):
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    L = rgb.mean(axis=2)
    ok = np.zeros(L.shape, bool)
    for lo, hi in bins:
        ok |= (L >= lo) & (L < hi)
    return ((mx - mn) < 28) & ok


def label(mask):
    """8 連通的區塊編號（不用 scipy）。回傳編號陣列和每塊的像素清單。"""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    comps = [None]
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]: continue
        n = len(comps); lab[y0, x0] = n; st = [(y0, x0)]; px = []
        while st:
            y, x = st.pop(); px.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n; st.append((ny, nx))
        comps.append(px)
    return lab, comps


def cell_mask(rgb, bins):
    """一格的角色遮罩。"""
    h, w, _ = rgb.shape
    L = rgb.mean(axis=2)
    bgc = is_bg_color(rgb, span(bins))
    lab, comps = label(bgc)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    # 被角色包住的背景洞：兩種以上的格子色都有，或夠大而且顏色很平（角色身上的白、灰有明暗）
    for k in range(1, len(comps)):
        if k in edge or len(comps[k]) < 12: continue
        yy, xx = zip(*comps[k]); v = L[yy, xx]
        hit = [((v >= lo) & (v < hi)).mean() for lo, hi in bins]
        if sum(1 for x in hit if x > 0.15) >= 2 or (len(v) >= 20 and v.std() < 5):
            bg[yy, xx] = True
    fg = ~bg
    # 隔壁格伸進來的碎片：碰到格子邊、而且比這格最大的那塊小很多，就丟掉
    lab, comps = label(fg)
    if len(comps) > 1:
        big = max(len(c) for c in comps[1:])
        for k in range(1, len(comps)):
            px = comps[k]
            touches = any(y in (0, h - 1) or x in (0, w - 1) for y, x in px)
            if len(px) < 8 or (touches and len(px) < 0.2 * big):
                yy, xx = zip(*px); fg[yy, xx] = False
    return fg


def row_cuts(im, bins, cw, ch):
    """每一排的切點：在原本格線左右 30px 內，找角色像素最少的那一欄（角色沒有對齊格線時不會被切成兩半）。"""
    H, W, _ = im.shape
    cuts = []
    for r in range(ROWS):
        band = im[int(r * ch):int((r + 1) * ch)]
        count = (~is_bg_color(band, bins)).sum(axis=0)
        row = [0]
        for c in range(1, COLS):
            x = int(c * cw)
            lo, hi = max(row[-1] + 20, x - 30), min(W - 1, x + 30)
            row.append(lo + int(np.argmin(count[lo:hi])))
        row.append(W)
        cuts.append(row)
    return cuts


def tile_of(rgb, keep, bins=None):
    """縮成 64x64：每個輸出像素看對應的原圖區塊，角色像素過半才算不透明，顏色取角色像素的平均。"""
    hh, ww = keep.shape
    out = np.zeros((CELL, CELL, 4), np.uint8)
    for ty in range(CELL):
        ya, yb = ty * hh // CELL, (ty + 1) * hh // CELL
        for tx in range(CELL):
            xa, xb = tx * ww // CELL, (tx + 1) * ww // CELL
            m = keep[ya:yb, xa:xb]
            if m.size and m.mean() > 0.5:
                blk = rgb[ya:yb, xa:xb][m]
                # 描邊：區塊裡有夠深的像素就用最深的那些，不然平均會把細描邊糊掉
                lum = blk.sum(axis=1)
                dark = blk[lum < 200]
                col = dark.mean(axis=0) if len(dark) >= max(1, len(blk) // 4) else blk.mean(axis=0)
                out[ty, tx, :3] = np.clip(col, 0, 255)
                out[ty, tx, 3] = 255
    # 去掉零星的小點（JPG 雜訊）：小於 6 格、而且不連到最大那一塊的區塊丟掉
    a = out[..., 3] > 0
    lab = np.zeros(a.shape, np.int32); n = 0; sizes = {}
    for y in range(CELL):
        for x in range(CELL):
            if a[y, x] and not lab[y, x]:
                n += 1; st = [(y, x)]; lab[y, x] = n; cnt = 0
                while st:
                    py, px = st.pop(); cnt += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            qy, qx = py + dy, px + dx
                            if 0 <= qy < CELL and 0 <= qx < CELL and a[qy, qx] and not lab[qy, qx]:
                                lab[qy, qx] = n; st.append((qy, qx))
                sizes[n] = cnt
    big = max(sizes.values()) if sizes else 0
    if bins is not None:
        for _ in range(4):
            a = out[..., 3] > 0
            rgbt = out[..., :3].astype(int)
            Lt = rgbt.mean(axis=2); grayt = (rgbt.max(axis=2) - rgbt.min(axis=2)) < 22
            inbin = np.zeros(Lt.shape, bool)
            for lo, hi in bins: inbin |= (Lt >= lo) & (Lt < hi)
            edge = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1))
            out[edge & grayt & inbin] = 0
        # 細細一條的灰線（棋盤格邊緣的雜訊）：灰色、背景色、周圍 8 格裡不到 3 格有東西
        for _ in range(3):
            a = (out[..., 3] > 0).astype(int)
            nb = sum(np.roll(np.roll(a, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) - a
            rgbt = out[..., :3].astype(int)
            Lt = rgbt.mean(axis=2); grayt = (rgbt.max(axis=2) - rgbt.min(axis=2)) < 30
            inbin = np.zeros(Lt.shape, bool)
            for lo, hi in bins: inbin |= (Lt >= lo - 8) & (Lt < hi + 8)
            out[(a > 0) & (nb < 3) & grayt & inbin] = 0
    for k, v in sizes.items():
        part = out[lab == k][:, :3].astype(int)
        chroma = (part.max(axis=1) - part.min(axis=1)).mean() if len(part) else 0
        # 太小、或是灰色而且比主體小很多（棋盤格邊緣的 JPG 雜訊）：丟掉
        if v < 4 or (chroma < 30 and v < 0.25 * big):
            out[lab == k] = 0
    return out


def make(src, form, out_dir):
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
    H, W, _ = im.shape
    cw, ch = W / COLS, H / ROWS
    sheet = Image.new('RGBA', (COLS * (CELL + GAP), ROWS * (CELL + GAP)), (0, 0, 0, 0))
    frames = {}
    bins = bg_bins(im, cw, ch)
    cuts = row_cuts(im, bins, cw, ch)
    tiles, bad = {}, {}
    for idx, (s, f) in enumerate(NAMES):
        r, c = divmod(idx, COLS)
        y0, y1 = int(r * ch), int((r + 1) * ch)
        xa, xb = cuts[r][c], cuts[r][c + 1]
        rgb = im[y0:y1, xa:xb]
        keep = cell_mask(rgb, bins)
        # 放進一個原本格子寬的窗，角色的左右中心對齊窗的中心（高度不動，腳的位置跟原圖一樣）
        wid = int(cw)
        win_rgb = np.zeros((y1 - y0, wid, 3), np.int32); win_keep = np.zeros((y1 - y0, wid), bool)
        cols = np.nonzero(keep.any(axis=0))[0]
        mid = (cols[0] + cols[-1]) / 2 if len(cols) else (xb - xa) / 2
        off = int(round(wid / 2 - mid))
        for sx in range(xb - xa):
            dx = sx + off
            if 0 <= dx < wid:
                win_rgb[:, dx] = rgb[:, sx]; win_keep[:, dx] = keep[:, sx]
        tiles[idx] = tile_of(win_rgb, win_keep, span(bins))
        # 角色貼到左右兩邊的切線：跟隔壁的角色重疊、切不開
        # 切線正好切過一大段身體（最邊上那一欄有很長一段角色），或兩邊都貼著角色；尾巴、手剛好碰到邊不算
        el, er = int(keep[:, 0].sum()), int(keep[:, -1].sum())
        bad[idx] = max(el, er) > 40 or (el > 14 and er > 14)
    for idx, (s, f) in enumerate(NAMES):
        if bad[idx]:
            same = [j for j, (s2, _) in enumerate(NAMES) if s2 == s and not bad[j]]
            if same:
                j = min(same, key=lambda j: abs(j - idx))
                print('  %s %d_%d：跟隔壁的角色重疊，改用 %d_%d' % (form, s, f, NAMES[j][0], NAMES[j][1]))
                tiles[idx] = tiles[j]
        r, c = divmod(idx, COLS)
        X, Y = 1 + c * (CELL + GAP), 1 + r * (CELL + GAP)
        sheet.paste(Image.fromarray(tiles[idx], 'RGBA'), (X, Y))
        frames['%s/%s_%d_%d.png' % (form, form, s, f)] = {
            'frame': {'x': X, 'y': Y, 'w': CELL, 'h': CELL}, 'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': CELL, 'h': CELL}, 'sourceSize': {'w': CELL, 'h': CELL},
        }
    png = os.path.join(out_dir, form + '_sheet.png')
    sheet.save(png)
    meta = {'app': 'custom', 'version': '1.0', 'image': form + '_sheet.png', 'format': 'RGBA8888',
            'size': {'w': sheet.width, 'h': sheet.height}, 'scale': '1'}
    with open(os.path.join(out_dir, form + '_sheet.json'), 'w', encoding='utf-8') as fp:
        json.dump({'frames': frames, 'meta': meta}, fp, ensure_ascii=False, indent=2)
    return sheet


if __name__ == '__main__':
    src_dir, out_dir = sys.argv[1:3]
    sheets = [make(os.path.join(src_dir, f + '.jpg'), f, out_dir) for f in FORMS]
    if len(sys.argv) > 3:
        # 預覽：六張疊在一起，背景用深淺兩色，方便看去背乾不乾淨
        w, h = sheets[0].size
        pv = Image.new('RGBA', (w * 2, h * 3), (40, 44, 80, 255))
        for i, sh in enumerate(sheets):
            bgc = (40, 44, 80, 255) if i % 2 == 0 else (235, 235, 235, 255)
            cell = Image.new('RGBA', sh.size, bgc); cell.alpha_composite(sh)
            pv.paste(cell, ((i % 2) * w, (i // 2) * h))
        pv.resize((pv.width * 2, pv.height * 2), Image.NEAREST).save(sys.argv[3])
