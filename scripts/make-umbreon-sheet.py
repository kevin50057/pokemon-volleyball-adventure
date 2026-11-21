"""把月伊布的原圖（JPG，背景是烤進去的棋盤格）轉成遊戲用的 7x4、64px 精靈圖。
用法：python scripts/make-umbreon-sheet.py 原圖.jpg public/resources/assets/images/umbreon_sheet.png public/resources/assets/images/umbreon_sheet.json 預覽.png"""
import json, sys
import numpy as np
from PIL import Image

src, out_png, out_json, preview = sys.argv[1:5]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int32)
H, W, _ = im.shape
mx, mn = im.max(axis=2), im.min(axis=2)
chroma = mx - mn
R, G, B = im[..., 0], im[..., 1], im[..., 2]
# 只留月伊布本身的三種顏色：深色身體（含描邊）、黃色光環、紅色眼睛和嘴。
# 背景的白／淺灰棋盤格、烤進去的半透明光暈（灰褐色的中間調）都丟掉。
dark = mx < 118
yellow_strong = (R > 150) & (G > 105) & (B < 125) & (chroma > 85)
pale = (R > 115) & (G > 105) & (R - B > 24) & (G - B > 18) & (mn < 150)
dark0 = mx < 118
# 淡黃色只有在「四個方向裡至少三個方向 10px 內有深色身體」時才算光環；尾巴後面的光暈弧線不算
def near(mask, dy, dx, n=10):
    out = np.zeros_like(mask)
    for k in range(1, n + 1):
        out |= np.roll(mask, (dy * k, dx * k), axis=(0, 1))
    return out
sides = near(dark0, 1, 0).astype(int) + near(dark0, -1, 0) + near(dark0, 0, 1) + near(dark0, 0, -1)
yellow = yellow_strong | (pale & (sides >= 3))
red = (R > 140) & (G < 100) & (B < 110)
keep = dark | yellow | red
COLS, ROWS, CELL, GAP = 7, 4, 64, 2
cw, ch = W / COLS, H / ROWS
sheet = Image.new('RGBA', (COLS * (CELL + GAP), ROWS * (CELL + GAP)), (0, 0, 0, 0))
frames = {}
counts = [5, 5, 5, 2, 1, 5, 5]
names = [(s, f) for s, n in enumerate(counts) for f in range(n)]
for idx, (s, f) in enumerate(names):
    r, c = divmod(idx, COLS)
    x0, y0, x1, y1 = int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)
    rgb = im[y0:y1, x0:x1]; m = keep[y0:y1, x0:x1]
    my, mr = yellow[y0:y1, x0:x1], red[y0:y1, x0:x1]
    # 每個 64x64 輸出像素對應原圖的一塊：只用「保留」的像素取平均；覆蓋率過半才算不透明
    tile = np.zeros((CELL, CELL, 4), np.uint8)
    hh, ww = m.shape
    for ty in range(CELL):
        ya, yb = ty * hh // CELL, (ty + 1) * hh // CELL
        for tx in range(CELL):
            xa, xb = tx * ww // CELL, (tx + 1) * ww // CELL
            mm = m[ya:yb, xa:xb]
            if mm.size and mm.mean() > 0.5:
                blk = rgb[ya:yb, xa:xb]
                yy_, rr_ = my[ya:yb, xa:xb], mr[ya:yb, xa:xb]
                # 依「哪一種顏色」決定，不直接平均（小小的光環、眼睛平均後會被描邊吃掉）
                if rr_.sum() >= 0.2 * mm.sum():
                    col = blk[rr_].mean(axis=0)
                elif yy_.sum() >= 0.3 * mm.sum():
                    col = blk[yy_].mean(axis=0)
                else:                        # 身體：去掉光暈染上的黃褐色，統一成偏藍的深灰
                    L = blk[mm & ~yy_ & ~rr_].mean() if (mm & ~yy_ & ~rr_).any() else blk[mm].mean()
                    col = np.array([L * 0.92, L * 0.98, L * 1.12])
                tile[ty, tx, :3] = np.clip(col, 0, 255)
                tile[ty, tx, 3] = 255
    # 去掉零星的小點：只留跟最大那一塊連在一起、或至少 10 格大的區塊
    a = tile[..., 3] > 0
    lab = np.zeros(a.shape, np.int32); n = 0; sizes = {}
    for yy in range(CELL):
        for xx in range(CELL):
            if a[yy, xx] and not lab[yy, xx]:
                n += 1; st = [(yy, xx)]; lab[yy, xx] = n; cnt = 0
                while st:
                    py, px = st.pop(); cnt += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            qy, qx = py + dy, px + dx
                            if 0 <= qy < CELL and 0 <= qx < CELL and a[qy, qx] and not lab[qy, qx]:
                                lab[qy, qx] = n; st.append((qy, qx))
                sizes[n] = cnt
    for k, v in sizes.items():
        if v < 10: tile[lab == k] = 0
    X, Y = 1 + c * (CELL + GAP), 1 + r * (CELL + GAP)
    sheet.paste(Image.fromarray(tile, 'RGBA'), (X, Y))
    frames['umbreon/umbreon_%d_%d.png' % (s, f)] = {
        'frame': {'x': X, 'y': Y, 'w': CELL, 'h': CELL}, 'rotated': False, 'trimmed': False,
        'spriteSourceSize': {'x': 0, 'y': 0, 'w': CELL, 'h': CELL}, 'sourceSize': {'w': CELL, 'h': CELL}}
sheet.save(out_png)
json.dump({'frames': frames, 'meta': {'image': 'umbreon_sheet.png', 'format': 'RGBA8888', 'size': {'w': sheet.width, 'h': sheet.height}, 'scale': '1'}}, open(out_json, 'w'), indent=2)
bg = Image.new('RGBA', sheet.size, (120, 170, 220, 255)); bg.alpha_composite(sheet)
bg.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(preview)
print('ok', len(frames))
