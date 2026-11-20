"""Merakit galeri sebelum/sesudah menjadi satu file: ../sebelum-sesudah.html

    python build.py            -> semua bagian (a, b, c)
    python build.py a          -> hanya bagian a (uji per agen), keluaran tetap kecuali --out
    python build.py a --out X.html
Gambar di sebelum/*.jpg ditanam sebagai data URI agar file bisa dibuka di mana saja.
"""
import base64, io, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
out = HERE.parent / "sebelum-sesudah.html"
if "--out" in sys.argv:
    o = sys.argv[sys.argv.index("--out") + 1]
    out = pathlib.Path(o).resolve()
    args = [a for a in args if a != o]

shell = io.open(HERE / "shell.html", encoding="utf-8").read()
parts, css = [], []
for name in ["a", "b", "c"]:
    if args and name not in args:
        continue
    path = HERE / "parts" / f"{name}.html"
    if not path.exists():
        parts.append(f'<section class="modul" data-modul="{name}"><div class="card">Bagian {name.upper()} sedang disiapkan.</div></section>')
        continue
    text = io.open(path, encoding="utf-8").read()
    for m in re.finditer(r"<style>(.*?)</style>", text, re.S):
        css.append(f"/* --- {name} --- */\n" + m.group(1))
    parts.append(re.sub(r"<style>.*?</style>", "", text, flags=re.S))

html = shell.replace("/*CSS-PARTS*/", "\n".join(css)).replace("<!--PARTS-->", "\n".join(parts))

def embed(m):
    p = HERE / m.group(1)
    if not p.exists():
        print("GAMBAR TIDAK ADA:", m.group(1)); return m.group(0)
    return 'src="data:image/jpeg;base64,' + base64.b64encode(p.read_bytes()).decode() + '"'

html = re.sub(r'src="(sebelum/[^"]+\.jpg)"', embed, html)
out.write_text(html, encoding="utf-8", newline="\n")
print(f"OK {out} ({len(html) // 1024} KB)")
