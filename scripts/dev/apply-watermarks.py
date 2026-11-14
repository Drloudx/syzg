"""
批量为角色立绘、皮肤立绘、Q 版模型图与皮肤模型图添加「深渊之歌」水印。

参数与测试工具/水印添加.py 算法完全一致：
  PROP_BOX = (0.33, 0.42, 0.68, 0.62)   # 比例框（大腿/裙摆区域）
  PADDING  = 2
  OPACITY  = 0.45
  ROTATE   = 20                          # 顺时针旋转

用法：
  python scripts/dev/apply-watermarks.py --all
  python scripts/dev/apply-watermarks.py --target chara-l
  python scripts/dev/apply-watermarks.py --target chara-q
  python scripts/dev/apply-watermarks.py --target skin-models
"""
import argparse
import os
import shutil
from pathlib import Path
from PIL import Image

PROP_BOX = (0.33, 0.42, 0.68, 0.62)
PADDING = 2
OPACITY = 0.45
ROTATE = 20

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_ROOT = Path(r"E:/Desktop/html/myrzg/游戏数据")
BACKUP_ROOT = Path(r"E:/Desktop/html/myrzg/vue-myrzg备份-资源/chara-before-watermark-20261114")
LOGO_PATH = PROJECT_ROOT / "public/images/test/logo.png"

RAW_CHARA_L_DIR = DATA_ROOT / "图片资源/单图/texture/chara/l"
DST_CHARA_L_DIR = PROJECT_ROOT / "public/images/chara/l"
DST_CHARA_Q_DIR = PROJECT_ROOT / "public/images/chara/Q"
DST_SKIN_MODELS_DIR = PROJECT_ROOT / "public/images/skin-models"


def apply_watermark(bg: Image.Image, logo_img: Image.Image, scale: float = 1.0) -> Image.Image:
    w, h = bg.size
    x1p, y1p, x2p, y2p = PROP_BOX
    if scale != 1.0:
        cx, cy = (x1p + x2p) / 2, (y1p + y2p) / 2
        x1p = cx + (x1p - cx) * scale
        x2p = cx + (x2p - cx) * scale
        y1p = cy + (y1p - cy) * scale
        y2p = cy + (y2p - cy) * scale

    x1 = int(w * x1p)
    y1 = int(h * y1p)
    x2 = int(w * x2p)
    y2 = int(h * y2p)
    avail_w = max(1, x2 - x1 - PADDING * 2)
    avail_h = max(1, y2 - y1 - PADDING * 2)

    logo = logo_img.copy()
    logo.thumbnail((avail_w, avail_h), Image.Resampling.LANCZOS)
    logo = logo.rotate(ROTATE, resample=Image.Resampling.BICUBIC, expand=True)

    r, g, b, a = logo.split()
    a = a.point(lambda v: int(v * OPACITY))
    logo.putalpha(a)

    paste_x = x1 + PADDING + (avail_w - logo.width) // 2
    paste_y = y1 + PADDING + (avail_h - logo.height) // 2

    bg.paste(logo, (paste_x, paste_y), mask=logo)
    return bg


def save_webp(img: Image.Image, path: Path) -> None:
    img.save(path, "WEBP", quality=95, method=4)


def process_chara_l(logo_img: Image.Image, dry_run: bool = False) -> None:
    print(f"\n=== 处理角色立绘与皮肤立绘 (chara/l) ===")
    print(f"  干净源目录: {RAW_CHARA_L_DIR}")
    print(f"  目标目录: {DST_CHARA_L_DIR}")

    if not RAW_CHARA_L_DIR.is_dir():
        raise RuntimeError(f"干净源目录不存在: {RAW_CHARA_L_DIR}")

    raw_files = sorted(RAW_CHARA_L_DIR.glob("*.png"))
    print(f"  待处理干净源图片: {len(raw_files)} 张")

    ok = 0
    for raw_p in raw_files:
        base = raw_p.stem
        dst_p = DST_CHARA_L_DIR / f"{base}.webp"
        if not dry_run:
            with Image.open(raw_p) as im:
                bg = im.convert("RGBA")
            apply_watermark(bg, logo_img)
            save_webp(bg, dst_p)
        ok += 1

    # 兼容历史无下划线别名
    if not dry_run:
        for alias, orig in [("chara005a.webp", "chara005_a.webp"), ("chara036a.webp", "chara036_a.webp")]:
            orig_p = DST_CHARA_L_DIR / orig
            alias_p = DST_CHARA_L_DIR / alias
            if orig_p.exists():
                shutil.copyfile(orig_p, alias_p)
                print(f"  同步别名: {alias} <- {orig}")

    print(f"  chara/l 完成: {ok} 张")


def process_chara_q(logo_img: Image.Image, dry_run: bool = False) -> None:
    print(f"\n=== 处理角色 Q 版模型图 (chara/Q) ===")
    print(f"  目标目录: {DST_CHARA_Q_DIR}")

    src_dir = BACKUP_ROOT / "chara-Q"
    if not src_dir.is_dir():
        src_dir = DST_CHARA_Q_DIR

    files = sorted(p for p in src_dir.glob("*.webp") if p.is_file())
    print(f"  待处理模型图: {len(files)} 张")

    ok = 0
    for p in files:
        dst_p = DST_CHARA_Q_DIR / p.name
        if not dry_run:
            with Image.open(p) as im:
                bg = im.convert("RGBA")
            apply_watermark(bg, logo_img)
            save_webp(bg, dst_p)
        ok += 1
    print(f"  chara/Q 完成: {ok} 张")


def process_skin_models(logo_img: Image.Image, dry_run: bool = False) -> None:
    print(f"\n=== 处理皮肤模型图 (skin-models) ===")
    print(f"  目标目录: {DST_SKIN_MODELS_DIR}")

    src_dir = BACKUP_ROOT / "skin-models"
    if not src_dir.is_dir():
        src_dir = DST_SKIN_MODELS_DIR

    files = sorted(p for p in src_dir.glob("*.webp") if p.is_file())
    print(f"  待处理模型图: {len(files)} 张")

    ok = 0
    for p in files:
        dst_p = DST_SKIN_MODELS_DIR / p.name
        if not dry_run:
            with Image.open(p) as im:
                bg = im.convert("RGBA")
            apply_watermark(bg, logo_img)
            save_webp(bg, dst_p)
        ok += 1
    print(f"  skin-models 完成: {ok} 张")


def main() -> None:
    parser = argparse.ArgumentParser(description="批量为角色立绘、皮肤与模型打水印")
    parser.add_argument("--all", action="store_true", help="处理所有（chara-l, chara-q, skin-models）")
    parser.add_argument("--target", choices=["chara-l", "chara-q", "skin-models"], help="指定处理目标")
    parser.add_argument("--dry-run", action="store_true", help="只预览不写盘")
    args = parser.parse_args()

    if not args.all and not args.target:
        parser.print_help()
        return

    if not LOGO_PATH.is_file():
        raise FileNotFoundError(f"Logo 不存在: {LOGO_PATH}")

    logo_img = Image.open(LOGO_PATH).convert("RGBA")
    print(f"使用水印 Logo: {LOGO_PATH} (尺寸 {logo_img.size})")

    if args.all or args.target == "chara-l":
        process_chara_l(logo_img, dry_run=args.dry_run)

    if args.all or args.target == "chara-q":
        process_chara_q(logo_img, dry_run=args.dry_run)

    if args.all or args.target == "skin-models":
        process_skin_models(logo_img, dry_run=args.dry_run)

    print("\n[SUCCESS] 全部水印处理完成！")


if __name__ == "__main__":
    main()
