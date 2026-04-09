import os, glob, re

base_dir = r'k:\Project\Kinal-Lang\kinal.org\src\web\managed\html'
files = glob.glob(os.path.join(base_dir, '**', '*.html'), recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace favicon
    content = re.sub(
        r'<link\s+rel="icon"\s+href="[^"]+"(?:\s+type="image/[^"]+")?\s*>',
        r'<link rel="icon" href="/static/logo.png">',
        content
    )

    # Replace brand-mark span with img
    content = re.sub(
        r'<span class="brand-mark">K</span>',
        r'<img class="brand-mark" src="/static/logo.png" alt="Kinal Logo">',
        content
    )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print(f'Processed {len(files)} files.')
