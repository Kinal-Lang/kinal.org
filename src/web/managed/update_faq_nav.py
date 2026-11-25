import os, glob, re

base_dir = r'k:\Project\Kinal-Lang\kinal.org\src\web\managed\html'
files = glob.glob(os.path.join(base_dir, '**', '*.html'), recursive=True)

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Unified Navigation Update logic
    # Find the topnav block
    nav_match = re.search(r'(<nav class="topnav">)(.*?)(</nav>)', content, re.DOTALL)
    if nav_match:
        nav_prefix = nav_match.group(1)
        nav_inner = nav_match.group(2)
        nav_suffix = nav_match.group(3)
        
        # Check if ZH or EN
        if '/zh-CN' in file.replace('\\', '/'):
            # ZH-CN subpages/home
            if 'faq' not in nav_inner.lower():
                # Add FAQ
                nav_inner += '\n                <a href="/zh-CN/faq">FAQ</a>'
            if 'github' not in nav_inner.lower():
                # Add GitHub
                nav_inner += '\n                <a href="https://github.com/Kinal-Lang/Kinal" target="_blank" rel="noopener noreferrer">GitHub</a>'
        else:
            # EN subpages/home
            if 'faq' not in nav_inner.lower():
                # Add FAQ
                nav_inner += '\n                <a href="/faq">FAQ</a>'
            if 'github' not in nav_inner.lower():
                # Add GitHub
                nav_inner += '\n                <a href="https://github.com/Kinal-Lang/Kinal" target="_blank" rel="noopener noreferrer">GitHub</a>'
        
        # Replace the whole block back
        new_nav_block = nav_prefix + nav_inner + nav_suffix
        content = content.replace(nav_match.group(0), new_nav_block)

    # 2. Correct FAQ content (Directly target the questions provided by user)
    if 'faq' in file.replace('\\', '/') and 'index.html' in file:
        if 'zh-CN' in file:
            # Correction: Platform support
            content = re.sub(
                r'<(details|div)[^>]*?faq-item[^>]*?>.*?<summary><h2>.*?支持哪些平台.*?</h2></summary>.*?<p>.*?</p>.*?</\1>',
                r'<details class="faq-item"><summary><h2>Kinal 支持哪些平台？</h2></summary><p>Kinal 目前完整支持 <strong>Windows</strong>、<strong>Linux</strong>、<strong>macOS</strong> 三大主流操作系统，并且它们<strong>全部同时支持 x64 和 ARM64 架构</strong>，一共 6 个原生目标编译平台。</p></details>',
                content, flags=re.DOTALL
            )
        else:
            # EN Correction: Platform support
            content = re.sub(
                r'<(details|div)[^>]*?faq-item[^>]*?>.*?<summary><h2>.*?platforms.*?support.*?</h2></summary>.*?<p>.*?</p>.*?</\1>',
                r'<details class="faq-item"><summary><h2>What platforms does Kinal support?</h2></summary><p>Kinal currently supports <strong>Windows</strong>, <strong>Linux</strong>, and <strong>macOS</strong>. Each of these operating systems perfectly supports both <strong>x64</strong> and <strong>ARM64</strong> architectures, offering a total of 6 native compilation targets.</p></details>',
                content, flags=re.DOTALL
            )

    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print(f'Sync completed for {len(files)} files.')
