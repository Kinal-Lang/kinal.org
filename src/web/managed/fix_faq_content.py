import os, glob, re

base_dir = r'k:\Project\Kinal-Lang\kinal.org\src\web\managed\html'
files = glob.glob(os.path.join(base_dir, '**', '*.html'), recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # FAQ Page specific corrections
    if 'faq' in file.replace('\\', '/') and 'index.html' in file:
        if 'zh-CN' in file:
            # Platform support correction
            content = re.sub(
                r'<details[^>]*?>\s*<summary>\s*<h2>.*?支持哪些平台.*?</h2>\s*</summary>.*?<p>.*?</p>\s*</details>',
                r'<details class="faq-item"><summary><h2>Kinal 支持哪些平台？</h2></summary><p>Kinal 目前完整支持 <strong>Windows</strong>、<strong>Linux</strong>、<strong>macOS</strong> 三大主流操作系统，并且它们<strong>全部同时支持 x64 和 ARM64 架构</strong>，一共 6 个原生目标编译平台。</p></details>',
                content, flags=re.DOTALL
            )
        else:
            content = re.sub(
                r'<details[^>]*?>\s*<summary>\s*<h2>.*?platforms.*?support.*?</h2>\s*</summary>.*?<p>.*?</p>\s*</details>',
                r'<details class="faq-item"><summary><h2>What platforms does Kinal support?</h2></summary><p>Kinal currently supports <strong>Windows</strong>, <strong>Linux</strong>, and <strong>macOS</strong>. Each of these operating systems perfectly supports both <strong>x64</strong> and <strong>ARM64</strong> architectures, offering a total of 6 native compilation targets.</p></details>',
                content, flags=re.DOTALL
            )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("FAQ Factual errors corrected.")
