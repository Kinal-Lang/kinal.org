import os, glob, re

base_dir = r'k:\Project\Kinal-Lang\kinal.org\src\web\managed\html'
files = glob.glob(os.path.join(base_dir, '**', '*.html'), recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # FAQ Page specific corrections
    if 'faq' in file.replace('\\', '/') and 'index.html' in file:
        if 'zh-CN' in file:
            # Self-hosted correction
            content = re.sub(
                r'<details[^>]*?>\s*<summary>\s*<h2>.*?自举.*?</h2>\s*</summary>.*?<p>.*?</p>\s*</details>',
                r'<details class="faq-item"><summary><h2>Kinal 编译器是自举的吗？</h2></summary><p><strong>目前并不是完全自举的。</strong>Kinal 语言的核心编译器使用 C 语言编写。但语言的标准库（IO.* 等）以及核心的 KinalVM 虚拟机是由 Kinal 自身编写的。</p></details>',
                content, flags=re.DOTALL
            )
            # Platform support correction
            content = re.sub(
                r'<details[^>]*?>\s*<summary>\s*<h2>.*?支持哪些平台.*?</h2>\s*</summary>.*?<p>.*?</p>\s*</details>',
                r'<details class="faq-item"><summary><h2>Kinal 支持哪些平台？</h2></summary><p>Kinal 目前完整支持 <strong>Windows</strong>、<strong>Linux</strong>、<strong>macOS</strong> 三大主流操作系统，并且它们<strong>全部同时支持 x64 和 ARM64 架构</strong>，一共 6 个原生目标编译平台。</p></details>',
                content, flags=re.DOTALL
            )
        else:
            # EN corrections
            content = re.sub(
                r'<details[^>]*?>\s*<summary>\s*<h2>.*?self-hosted.*?</h2>\s*</summary>.*?<p>.*?</p>\s*</details>',
                r'<details class="faq-item"><summary><h2>Is the Kinal compiler self-hosted?</h2></summary><p><strong>Not fully.</strong> The core Kinal compiler is written in C. However, the standard library (IO.*) and the KinalVM are written entirely in Kinal itself.</p></details>',
                content, flags=re.DOTALL
            )
            content = re.sub(
                r'<details[^>]*?>\s*<summary>\s*<h2>.*?platforms.*?support.*?</h2>\s*</summary>.*?<p>.*?</p>\s*</details>',
                r'<details class="faq-item"><summary><h2>What platforms does Kinal support?</h2></summary><p>Kinal currently supports <strong>Windows</strong>, <strong>Linux</strong>, and <strong>macOS</strong>. Each of these operating systems perfectly supports both <strong>x64</strong> and <strong>ARM64</strong> architectures, offering a total of 6 native compilation targets.</p></details>',
                content, flags=re.DOTALL
            )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("FAQ Factual errors corrected.")
