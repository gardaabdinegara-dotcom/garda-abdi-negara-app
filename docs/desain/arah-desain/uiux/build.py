"""Merakit galeri pilihan tampilan menjadi satu file: ../uiux-modul.html

    python build.py              -> semua modul
    python build.py presensi     -> hanya modul tertentu (untuk uji per agen), keluaran tetap ../uiux-modul.html kecuali --out
    python build.py presensi --out X.html
"""
import io
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
out = HERE.parent / "uiux-modul.html"
if "--out" in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index("--out") + 1]).resolve()
    args = [a for a in args if a != sys.argv[sys.argv.index("--out") + 1]]

shell = io.open(HERE / "shell.html", encoding="utf-8").read()
order = ["presensi", "samapta", "keuangan"]
parts, css = [], []
for name in order:
    if args and name not in args:
        continue
    path = HERE / "parts" / f"{name}.html"
    if not path.exists():
        parts.append(f'<section class="modul" data-modul="{name}"><div class="card">Modul {name} sedang disiapkan.</div></section>')
        continue
    text = io.open(path, encoding="utf-8").read()
    # <style> milik bagian dipindah ke kepala dokumen
    for m in re.finditer(r"<style>(.*?)</style>", text, re.S):
        css.append(f"/* --- {name} --- */\n" + m.group(1))
    parts.append(re.sub(r"<style>.*?</style>", "", text, flags=re.S))

html = shell.replace("/*CSS-PARTS*/", "\n".join(css)).replace("<!--PARTS-->", "\n".join(parts))
out.write_text(html, encoding="utf-8", newline="\n")
print(f"OK {out} ({len(html) // 1024} KB)")
