const fs = require('fs');
const path = require('path');
const marked = require('marked');

// File paths
const mdPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Research_Paper.md';
const htmlPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Research_Paper.html';
const docPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Research_Paper.doc';

console.log("Reading research paper markdown source...");
const markdownContent = fs.readFileSync(mdPath, 'utf8');

// Custom escape function for HTML inside code blocks
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 1. Compile HTML Version
console.log("Compiling HTML research paper...");

// Configure marked with custom code renderer
const renderer = new marked.Renderer();
renderer.code = function(codeBlock) {
    const code = codeBlock.text;
    const infostring = codeBlock.lang || '';
    const lang = infostring.match(/\S*/)[0];

    if (lang === 'mermaid') {
        const encodedCode = encodeURIComponent(code);
        return `
    <div class="mermaid-block-wrapper" style="margin: 24pt 0; border: 1px solid #bbbbbb; border-radius: 4px; padding: 18px; background: #ffffff; page-break-inside: avoid;">
        <div class="mermaid-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #dddddd; padding-bottom: 8px;">
            <span style="font-weight: bold; font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; color: #2b5797;">ACADEMIC VISUALIZATION</span>
            <div>
                <button class="copy-btn copy-mermaid-code-btn" data-code="${encodedCode}" style="padding: 4px 10px; font-size: 9pt; margin-right: 6px;">📋 Copy Mermaid Code</button>
                <button class="copy-btn copy-mermaid-png-btn" style="padding: 4px 10px; font-size: 9pt;">📷 Copy Diagram as Image</button>
            </div>
        </div>
        <div class="mermaid" style="text-align: center; background: #ffffff; padding: 10px;">${escapeHtml(code)}</div>
    </div>`;
    } else {
        const isDiagram = code.includes('┌─') || code.includes('│') || code.includes('└─') || code.includes('──') || code.includes('DOCUMENT OWNER') || code.includes('USERS');
        const btnClass = isDiagram ? 'copy-diagram-btn' : 'copy-code-btn';
        const btnText = isDiagram ? '📋 Copy Diagram' : '📋 Copy Code';
        return `
    <div class="code-block-wrapper" style="position: relative; margin: 18pt 0; page-break-inside: avoid;">
        <button class="copy-btn ${btnClass}" style="position: absolute; top: 8px; right: 8px; z-index: 10;">${btnText}</button>
        <pre><code class="language-${lang || 'none'}">${escapeHtml(code)}</code></pre>
    </div>`;
    }
};

renderer.image = function(imageBlock) {
    const href = imageBlock.href;
    const title = imageBlock.title || '';
    const text = imageBlock.text || '';
    return `
    <div class="figure-container" style="text-align: center; margin: 24pt 0; page-break-inside: avoid;">
        <img src="${href}" alt="${text}" style="max-width: 100%; height: auto; border: 1px solid #bbbbbb; border-radius: 4px; padding: 6px; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <div class="figure-caption" style="font-family: 'Times New Roman', serif; font-size: 10pt; font-style: italic; color: #444444; margin-top: 8px; text-align: center;">
            ${text}
        </div>
    </div>`;
};


// We want to add "Copy Section" buttons dynamically at the start of each H2 section
renderer.heading = function(headingBlock) {
    const text = headingBlock.text;
    const level = headingBlock.depth;
    const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
    
    if (level === 2) {
        // This is a main section (e.g., "1. INTRODUCTION")
        return `
        <h2 id="${escapedText}" class="section-heading" style="position: relative; padding-right: 120px;">
            ${text}
            <button class="copy-section-btn" onclick="copySection('${escapedText}')" style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-family: Calibri, sans-serif; font-size: 8.5pt; padding: 3px 8px; background: #ffffff; border: 1px solid #777777; border-radius: 3px; cursor: pointer; color: #111111;">📋 Copy Section</button>
        </h2>`;
    }
    
    return `<h${level} id="${escapedText}">${text}</h${level}>`;
};

marked.use({ renderer });
const mainHtmlContent = marked.parse(markdownContent);

// Build complete, beautifully styled A4 single-column Research Paper webpage
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BBSNS Research Paper - Copy/Paste Enhanced</title>
    
    <!-- Load Mermaid.js CDN for visual rendering in browser -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({
            startOnLoad: true,
            theme: 'default',
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
        });
    </script>
    
    <!-- Load KaTeX for high-res math mathematical equations -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});"></script>
    
    <style>
        /* Exact Times New Roman Academic Web Stylesheet */
        :root {
            --bg-color: #f7f9fa;
            --container-bg: #ffffff;
            --text-primary: #000000;
            --accent-blue: #2b5797;
            --border-color: #bbbbbb;
            --code-bg: #f9f9f9;
        }

        body {
            font-family: 'Times New Roman', Georgia, serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            margin: 0;
            padding: 40px 20px;
            line-height: 1.25;
            font-size: 10pt;
        }

        /* Container centering styled as a standard print layout sheet */
        .document-container {
            max-width: 800px;
            margin: 0 auto;
            background: var(--container-bg);
            padding: 1.0in 1.0in 1.0in 1.0in; /* Standard 1-inch margins */
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
            border: 1px solid var(--border-color);
        }

        /* Copy-Paste Help Ribbon */
        .guide-ribbon {
            background-color: #e8f4fd;
            border-left: 5px solid var(--accent-blue);
            color: #1a4f80;
            padding: 15px 20px;
            margin-bottom: 25px;
            border-radius: 4px;
            font-family: Calibri, Arial, sans-serif;
            font-size: 9.5pt;
        }

        .guide-ribbon h4 {
            margin: 0 0 6px 0;
            font-size: 11pt;
            color: #004085;
            font-weight: bold;
        }

        .guide-ribbon ul {
            margin: 0;
            padding-left: 18px;
        }

        .guide-ribbon li {
            margin-bottom: 4px;
            line-height: 1.35;
        }

        /* Paper Title layout matching Word paper-format */
        h1 {
            font-family: 'Times New Roman', serif;
            font-size: 14pt;
            font-weight: bold;
            text-align: center;
            text-transform: uppercase;
            margin-top: 0;
            margin-bottom: 12pt;
            line-height: 1.3;
        }

        h2.section-heading {
            font-family: 'Times New Roman', serif;
            font-size: 12pt;
            font-weight: bold;
            text-transform: uppercase;
            text-align: left;
            border-bottom: 1px solid #111111;
            padding-bottom: 4px;
            margin-top: 24pt;
            margin-bottom: 8pt;
        }

        h3 {
            font-family: 'Times New Roman', serif;
            font-size: 10pt;
            font-weight: bold;
            text-align: left;
            margin-top: 14pt;
            margin-bottom: 6pt;
        }

        p {
            margin-top: 0;
            margin-bottom: 8pt;
            text-align: justify;
            text-indent: 0.5in; /* 0.5-inch indent */
        }

        /* Abstract Box layout */
        p.abstract-text {
            text-indent: 0 !important;
            font-size: 10pt;
            text-align: justify;
            line-height: 1.3;
        }

        ul p, ol p, li p, blockquote p, pre p, table p, h1 p, h2 p, h3 p {
            text-indent: 0 !important;
            margin-bottom: 4pt;
        }

        li {
            text-align: justify;
            margin-bottom: 4pt;
        }

        ul, ol {
            margin-top: 0;
            margin-bottom: 8pt;
            padding-left: 0.5in;
        }

        /* Strict Dense Table Styling */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 14pt 0;
            font-size: 9.5pt;
            font-family: 'Times New Roman', serif;
            border: 1px solid #000000;
            table-layout: auto;
            word-wrap: break-word;
            word-break: break-word;
        }

        th, td {
            border: 1px solid #000000;
            padding: 6px 10px;
            text-align: left;
            vertical-align: top;
        }

        th {
            background-color: #f2f2f2;
            font-weight: bold;
            color: #000000;
        }

        /* Compact Preformatted blocks for Diagrams and Code */
        pre {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5pt;
            background-color: var(--code-bg);
            border: 1px solid #888888;
            padding: 10px;
            margin: 0;
            overflow-x: auto;
            white-space: pre;
            line-height: 1.15;
            color: #111111;
        }

        code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5pt;
        }

        p code, li code {
            background-color: #eaeaea;
            padding: 1px 3px;
            border-radius: 2px;
        }

        blockquote {
            border-left: 3px solid #000000;
            margin: 10pt 0 10pt 0.5in;
            padding-left: 12px;
            font-style: italic;
            color: #444444;
        }

        hr {
            border: 0;
            border-top: 1px solid var(--border-color);
            margin: 20px 0;
        }

        /* Copy Buttons general styling */
        .copy-btn {
            font-family: Calibri, sans-serif;
            font-size: 8pt;
            cursor: pointer;
            background: #ffffff;
            border: 1px solid #777777;
            border-radius: 3px;
            padding: 3px 8px;
            transition: all 0.2s;
            color: #111111;
        }
        .copy-btn:hover {
            background: #f0f4f9 !important;
            border-color: var(--accent-blue) !important;
            color: var(--accent-blue) !important;
        }

        .toast-notification {
            position: fixed;
            bottom: 25px;
            right: 25px;
            background-color: #28a745;
            color: #ffffff;
            padding: 12px 24px;
            border-radius: 4px;
            font-family: Calibri, Arial, sans-serif;
            font-size: 10.5pt;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            transform: translateY(10px);
            pointer-events: none;
        }

        .toast-notification.show {
            opacity: 1;
            transform: translateY(0);
        }

        /* Print Settings */
        @media print {
            body {
                background-color: #ffffff;
                padding: 0;
            }
            .document-container {
                box-shadow: none;
                border: none;
                padding: 0;
                max-width: 100%;
            }
            .guide-ribbon, .copy-btn, .copy-section-btn, .mermaid-header, .code-block-wrapper button {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="toast-notification" id="copyToast">✅ Content copied to clipboard successfully!</div>

    <div class="document-container">
        
        <!-- IJPREMS Journal Header Page 1 -->
        <div class="ijprems-header" style="margin-bottom: 24pt; font-family: 'Times New Roman', Times, serif; page-break-after: avoid; user-select: none;">
            <table style="width: 100%; border-collapse: collapse; border: none; margin: 0 0 10pt 0;">
                <tr style="border: none;">
                    <td style="width: 25%; text-align: left; vertical-align: middle; border: none; padding: 0;">
                        <div style="font-weight: bold; font-size: 20pt; color: #1a4d80; line-height: 1.0; font-family: 'Times New Roman', serif;">IJPREMS</div>
                        <div style="font-size: 8.5pt; font-family: 'Times New Roman', serif; margin-top: 4px;">
                            <a href="http://www.ijprems.com" target="_blank" style="color: #000000; text-decoration: none;">www.ijprems.com</a><br>
                            <a href="mailto:editor@ijprems.com" style="color: #000000; text-decoration: none;">editor@ijprems.com</a>
                        </div>
                    </td>
                    <td style="width: 50%; text-align: center; vertical-align: middle; border: none; padding: 0 10px;">
                        <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase; line-height: 1.2;">INTERNATIONAL JOURNAL OF PROGRESSIVE</div>
                        <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase; line-height: 1.2;">RESEARCH IN ENGINEERING MANAGEMENT</div>
                        <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase; line-height: 1.2; color: #1a4d80;">AND SCIENCE (IJPREMS)</div>
                        <div style="font-size: 9.5pt; font-style: italic; line-height: 1.2; margin-top: 2px;">(Int Peer Reviewed Journal)</div>
                        <div style="font-size: 9.5pt; line-height: 1.2; margin-top: 2px;">Vol. 06, Issue 04, April 2026, pp : xx-xx</div>
                    </td>
                    <td style="width: 25%; text-align: right; vertical-align: middle; border: none; padding: 0;">
                        <div style="font-size: 9pt; font-weight: bold; line-height: 1.2;">e-ISSN :<br>2583-1062</div>
                        <div style="font-size: 9pt; font-weight: bold; line-height: 1.2; margin-top: 6px;">Impact<br>Factor :<br><span style="color: #1a4d80;">7.001</span></div>
                    </td>
                </tr>
            </table>
            <div style="border-bottom: 2px solid #000000; margin-top: 6px; margin-bottom: 24pt;"></div>
        </div>

        <!-- Copy-Paste Optimization Guide -->
        <div class="guide-ribbon">
            <h4>📋 Academic Document Copy-Paste Ribbon</h4>
            <ul>
                <li><strong>Copy Entire Formatted Sections:</strong> Click the <strong>"📋 Copy Section"</strong> button next to any major heading. It will copy the section's styled HTML (Fonts, justified text, proper alignment) directly to your clipboard, allowing you to paste it into Word (Ctrl+V) flawlessly!</li>
                <li><strong>Copy Tables:</strong> Click <strong>"📋 Copy Table"</strong> above any table. Paste it into Word — it inserts as a native, fully editable Word table.</li>
                <li><strong>Copy Visual Flowcharts:</strong> Click <strong>"📷 Copy Diagram as Image"</strong> to export high-definition white-background diagrams and copy them straight to the clipboard for clean inserts.</li>
                <li><strong>Copy Formula Text / Diagrams:</strong> Use the individual <strong>📋 Copy Diagram</strong> or <strong>📋 Copy Code</strong> buttons for precise pre-formatted clipboard actions.</li>
            </ul>
        </div>

        <div id="paper-main-body">
            ${mainHtmlContent}
        </div>

    </div>

    <script>
        // Custom Clipboard Controller
        const toast = document.getElementById('copyToast');
        function showToast(message, isSuccess = true) {
            toast.innerHTML = message;
            toast.style.backgroundColor = isSuccess ? '#28a745' : '#dc3545';
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        // Section Copy-Paste handler
        function copySection(sectionId) {
            const heading = document.getElementById(sectionId);
            if (!heading) return;

            let sectionHtml = heading.outerHTML;
            let currentEl = heading.nextElementSibling;
            
            // Loop until we hit another H2 heading or end of document
            while (currentEl && !currentEl.classList.contains('section-heading') && currentEl.tagName !== 'HR') {
                sectionHtml += currentEl.outerHTML;
                currentEl = currentEl.nextElementSibling;
            }

            // Wrap in styled wrapper for Word's clipboard parser
            const docStyleWrapper = \`
            <div style="font-family: 'Times New Roman', serif; font-size: 10pt; line-height: 1.25; color: #000000; text-align: justify;">
                \${sectionHtml}
            </div>
            \`;

            // Strip out buttons
            const cleanHtml = docStyleWrapper.replace(/<button[^>]*>.*?<\\/button>/g, '');

            const htmlBlob = new Blob([cleanHtml], { type: 'text/html' });
            const textBlob = new Blob([heading.innerText], { type: 'text/plain' });

            navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': htmlBlob,
                    'text/plain': textBlob
                })
            ]).then(() => {
                showToast('✅ Section copied with perfect Times New Roman formatting! Paste in Word.');
            }).catch((err) => {
                console.error('Section copy failed', err);
                showToast('❌ Copy failed. Select and copy manually.', false);
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            // High-resolution SVG rendering to PNG Blob
            function copySvgAsPng(svgElement) {
                return new Promise((resolve, reject) => {
                    try {
                        const bbox = svgElement.getBoundingClientRect();
                        let width = bbox.width;
                        let height = bbox.height;
                        
                        // Dimensions fallbacks
                        if (!width || !height) {
                            const viewBox = svgElement.getAttribute('viewBox');
                            if (viewBox) {
                                const parts = viewBox.split(/\\s+/).map(Number);
                                if (parts.length === 4) {
                                    width = parts[2];
                                    height = parts[3];
                                }
                            }
                        }
                        if (!width) width = svgElement.viewBox.baseVal.width || svgElement.width.baseVal.value || 800;
                        if (!height) height = svgElement.viewBox.baseVal.height || svgElement.height.baseVal.value || 600;
                        
                        // Padding to avoid clipping
                        const padding = 15;
                        const finalWidth = width + padding * 2;
                        const finalHeight = height + padding * 2;
                        
                        const scale = 3; // 3x High Definition for printing / Word imports
                        const canvas = document.createElement('canvas');
                        canvas.width = finalWidth * scale;
                        canvas.height = finalHeight * scale;
                        const ctx = canvas.getContext('2d');
                        
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        
                        // Solid white background (Crucial for Word pasting)
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        ctx.scale(scale, scale);
                        ctx.translate(padding, padding);
                        
                        // Serialize SVG to XML string
                        const serializer = new XMLSerializer();
                        let svgString = serializer.serializeToString(svgElement);
                        
                        // Namespace injection
                        if (!svgString.match(/^<svg[^>]+xmlns="http\\:\\/\\/www\\.w3\\.org\\/2000\\/svg"/)) {
                            svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
                        }
                        if (!svgString.match(/xmlns\\:xhtml/)) {
                            svgString = svgString.replace(/^<svg/, '<svg xmlns:xhtml="http://www.w3.org/1999/xhtml"');
                        }
                        
                        // Explicit dimensions
                        svgString = svgString.replace(/^<svg/, \`<svg width="\${width}" height="\${height}"\`);
                        
                        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                        const URL = window.URL || window.webkitURL || window;
                        const blobURL = URL.createObjectURL(svgBlob);
                        
                        const img = new Image();
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0, width, height);
                            canvas.toBlob((pngBlob) => {
                                URL.revokeObjectURL(blobURL);
                                if (!pngBlob) {
                                    reject(new Error('Canvas to blob conversion failed'));
                                    return;
                                }
                                // Write directly to clipboard as PNG
                                navigator.clipboard.write([
                                    new ClipboardItem({ 'image/png': pngBlob })
                                ]).then(resolve).catch(reject);
                            }, 'image/png');
                        };
                        img.onerror = (err) => {
                            URL.revokeObjectURL(blobURL);
                            reject(err);
                        };
                        img.src = blobURL;
                    } catch (err) {
                        reject(err);
                    }
                });
            }

            // 1. Setup Table Copy Buttons
            const tables = document.querySelectorAll('table');
            tables.forEach((table) => {
                const container = document.createElement('div');
                container.style.position = 'relative';
                container.style.margin = '24pt 0 14pt 0';
                
                table.parentNode.insertBefore(container, table);
                container.appendChild(table);
                table.style.margin = '0';
                
                const btn = document.createElement('button');
                btn.className = 'copy-btn';
                btn.innerHTML = '📋 Copy Table';
                btn.style.position = 'absolute';
                btn.style.top = '-26px';
                btn.style.right = '0';
                btn.style.padding = '4px 10px';
                
                btn.addEventListener('click', () => {
                    const html = table.outerHTML;
                    const text = table.innerText;
                    
                    const htmlBlob = new Blob([html], { type: 'text/html' });
                    const textBlob = new Blob([text], { type: 'text/plain' });
                    
                    navigator.clipboard.write([
                        new ClipboardItem({
                            'text/html': htmlBlob,
                            'text/plain': textBlob
                        })
                    ]).then(() => {
                        showToast('✅ Table copied to clipboard! Paste (Ctrl+V) in Word.');
                        btn.innerHTML = '✅ Table Copied!';
                        btn.style.background = '#d4edda';
                        btn.style.color = '#155724';
                        btn.style.borderColor = '#c3e6cb';
                        setTimeout(() => {
                            btn.innerHTML = '📋 Copy Table';
                            btn.style.background = '#ffffff';
                            btn.style.color = '#000000';
                            btn.style.borderColor = '#777777';
                        }, 2000);
                    }).catch((err) => {
                        console.error('Failed to copy table', err);
                        const range = document.createRange();
                        range.selectNode(table);
                        window.getSelection().removeAllRanges();
                        window.getSelection().addRange(range);
                        try {
                            document.execCommand('copy');
                            showToast('✅ Table copied (fallback mode)! Paste in Word.');
                        } catch (fallbackErr) {
                            showToast('❌ Copy failed. Select and copy manually.', false);
                        }
                        window.getSelection().removeAllRanges();
                    });
                });
                
                container.appendChild(btn);
            });

            // 2. Setup Monospace Diagrams / Code Copy Buttons
            document.querySelectorAll('.copy-code-btn, .copy-diagram-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const pre = btn.nextElementSibling.querySelector('code');
                    const text = pre.innerText || pre.textContent;
                    const isDiagram = btn.classList.contains('copy-diagram-btn');
                    
                    // Styled HTML wrapper designed specifically for Microsoft Word's clipboard parser
                    const styledHtml = \`<pre style="font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; line-height: 1.15; background-color: #f9f9f9; border: 1px solid #888888; padding: 12px; margin: 18pt 0; white-space: pre; border-radius: 4px; color: #111111;">\${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>\`;
                    
                    const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
                    const textBlob = new Blob([text], { type: 'text/plain' });
                    
                    navigator.clipboard.write([
                        new ClipboardItem({
                            'text/html': htmlBlob,
                            'text/plain': textBlob
                        })
                    ]).then(() => {
                        const typeText = isDiagram ? 'Diagram' : 'Code';
                        showToast(\`✅ \${typeText} copied! Pastes in Word with perfect formatting.\`);
                        btn.innerHTML = '✅ Copied!';
                        btn.style.background = '#d4edda';
                        btn.style.color = '#155724';
                        btn.style.borderColor = '#c3e6cb';
                        setTimeout(() => {
                            btn.innerHTML = isDiagram ? '📋 Copy Diagram' : '📋 Copy Code';
                            btn.style.background = '#ffffff';
                            btn.style.color = '#000000';
                            btn.style.borderColor = '#777777';
                        }, 2000);
                    }).catch((err) => {
                        console.error('Failed to copy', err);
                        navigator.clipboard.writeText(text).then(() => {
                            showToast('✅ Text copied! Select and change font to Courier New in Word.');
                        });
                    });
                });
            });

            // 3. Setup Copy Mermaid Code buttons
            document.querySelectorAll('.copy-mermaid-code-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const code = decodeURIComponent(btn.getAttribute('data-code'));
                    navigator.clipboard.writeText(code).then(() => {
                        showToast('✅ Mermaid syntax copied to clipboard!');
                        btn.innerHTML = '✅ Syntax Copied!';
                        btn.style.background = '#d4edda';
                        btn.style.color = '#155724';
                        btn.style.borderColor = '#c3e6cb';
                        setTimeout(() => {
                            btn.innerHTML = '📋 Copy Mermaid Code';
                            btn.style.background = '#ffffff';
                            btn.style.color = '#000000';
                            btn.style.borderColor = '#777777';
                        }, 2000);
                    });
                });
            });

            // 4. Setup Copy Mermaid Diagram as Image buttons
            document.querySelectorAll('.copy-mermaid-png-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const wrapper = btn.closest('.mermaid-block-wrapper');
                    const mermaidDiv = wrapper.querySelector('.mermaid');
                    const svgElement = mermaidDiv.querySelector('svg');
                    
                    if (!svgElement) {
                        showToast('❌ Diagram not rendered yet. Wait a second.', false);
                        return;
                    }
                    
                    btn.innerHTML = '⏳ Rendering...';
                    btn.style.background = '#fff3cd';
                    btn.style.color = '#856404';
                    btn.style.borderColor = '#ffeeba';
                    
                    copySvgAsPng(svgElement).then(() => {
                        showToast('✅ Diagram copied as high-resolution PNG image! Paste in Word.');
                        btn.innerHTML = '✅ Image Copied!';
                        btn.style.background = '#d4edda';
                        btn.style.color = '#155724';
                        btn.style.borderColor = '#c3e6cb';
                        setTimeout(() => {
                            btn.innerHTML = '📷 Copy Diagram as Image';
                            btn.style.background = '#ffffff';
                            btn.style.color = '#000000';
                            btn.style.borderColor = '#777777';
                        }, 2000);
                    }).catch((err) => {
                        console.error('Failed to export mermaid to PNG', err);
                        showToast('❌ Failed to copy as image. Copying code instead.', false);
                        const code = decodeURIComponent(wrapper.querySelector('.copy-mermaid-code-btn').getAttribute('data-code'));
                        navigator.clipboard.writeText(code);
                        btn.innerHTML = '📋 Code Copied!';
                        btn.style.background = '#f8d7da';
                        btn.style.color = '#721c24';
                        btn.style.borderColor = '#f5c6cb';
                        setTimeout(() => {
                            btn.innerHTML = '📷 Copy Diagram as Image';
                            btn.style.background = '#ffffff';
                            btn.style.color = '#000000';
                            btn.style.borderColor = '#777777';
                        }, 2000);
                    });
                });
            });

            // Inject abstract custom layout styles
            const abstractEl = document.querySelector('h3 + p');
            if (abstractEl && abstractEl.innerText.startsWith('The authenticity and integrity')) {
                // Ensure Abstract has correct formatting
                abstractEl.classList.add('abstract-text');
                abstractEl.style.textIndent = '0';
                abstractEl.style.lineHeight = '1.35';
                abstractEl.style.margin = '12pt 0 12pt 0';
            }
        });
    </script>
</body>
</html>
`;

fs.writeFileSync(htmlPath, fullHtml, 'utf8');
console.log(`Saved HTML research paper to: ${htmlPath}`);


// 2. Compile DOC Version (Word Compatible HTML format)
console.log("Compiling DOC research paper...");

// Custom marked renderer for DOC
const docRenderer = new marked.Renderer();
docRenderer.code = function(codeBlock) {
    const code = codeBlock.text;
    const infostring = codeBlock.lang || '';
    const lang = infostring.match(/\S*/)[0];

    if (lang === 'mermaid') {
        return `
    <pre style="font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; background-color: #F4F4F4; border: 1px solid #000000; padding: 8pt; margin-top: 12pt; margin-bottom: 12pt; white-space: pre;"><code>[MERMAID DIAGRAM SYNTAX]
${escapeHtml(code)}</code></pre>`;
    } else {
        return `
    <pre style="font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; background-color: #F4F4F4; border: 1px solid #000000; padding: 8pt; margin-top: 12pt; margin-bottom: 12pt; white-space: pre;"><code>${escapeHtml(code)}</code></pre>`;
    }
};

// Simple header output for DOC
docRenderer.heading = function(headingBlock) {
    const text = headingBlock.text;
    const level = headingBlock.depth;
    if (level === 2) {
        return `<h2 style="font-family: 'Times New Roman', serif; font-size: 12pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000000; padding-bottom: 2pt; margin-top: 20pt; margin-bottom: 8pt;">${text}</h2>`;
    }
    return `<h${level} style="font-family: 'Times New Roman', serif; font-size: ${level === 1 ? '14pt' : '10pt'}; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;">${text}</h${level}>`;
};

docRenderer.image = function(imageBlock) {
    const href = imageBlock.href;
    const title = imageBlock.title || '';
    const text = imageBlock.text || '';
    return `
    <div style="text-align: center; margin-top: 12pt; margin-bottom: 12pt;">
        <img src="${href}" alt="${text}" style="max-width: 100%; border: 1px solid #000000;">
        <p style="font-family: 'Times New Roman', serif; font-size: 10pt; font-style: italic; text-align: center; text-indent: 0in !important; margin-top: 6pt;">
            ${text}
        </p>
    </div>`;
};

marked.use({ renderer: docRenderer });
let mainDocContent = marked.parse(markdownContent);

const fullDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <title>BBSNS Academic Research Paper</title>
    <!--[if gte mso 9]>
    <xml>
     <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
     </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        /* Exact single-column Word print layout for IEEE research papers */
        @page {
            size: 21cm 29.7cm; /* A4 size */
            margin: 2.54cm 2.54cm 2.54cm 2.54cm; /* standard 1-inch margins */
        }
        
        body {
            font-family: 'Times New Roman', Georgia, serif;
            font-size: 10pt;
            line-height: 1.25;
            color: #000000;
        }

        h1 {
            font-family: 'Times New Roman', Georgia, serif;
            font-size: 14pt;
            font-weight: bold;
            text-align: center;
            text-transform: uppercase;
            margin-top: 18pt;
            margin-bottom: 12pt;
        }

        h2 {
            font-family: 'Times New Roman', Georgia, serif;
            font-size: 12pt;
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 2pt;
            margin-top: 20pt;
            margin-bottom: 8pt;
        }

        h3 {
            font-family: 'Times New Roman', Georgia, serif;
            font-size: 10pt;
            font-weight: bold;
            margin-top: 12pt;
            margin-bottom: 6pt;
        }

        p {
            margin-top: 0pt;
            margin-bottom: 8pt;
            text-align: justify;
            text-indent: 0.5in; /* 0.5-inch indent */
        }

        /* Abstract, lists, tables, preformatted items should not have indent */
        p.abstract-text {
            text-indent: 0in !important;
            font-size: 10pt;
            line-height: 1.3;
            text-align: justify;
        }

        ul p, ol p, li p, blockquote p, pre p, table p {
            text-indent: 0in !important;
            margin-bottom: 4pt;
        }

        li {
            text-align: justify;
            margin-bottom: 4pt;
        }

        ul, ol {
            margin-top: 0pt;
            margin-bottom: 8pt;
            padding-left: 0.5in;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12pt;
            margin-bottom: 12pt;
            font-size: 9.5pt;
        }

        th, td {
            border: 1px solid #000000;
            padding: 6pt;
            text-align: left;
            vertical-align: top;
        }

        th {
            background-color: #E6E6E6;
            font-weight: bold;
        }

        pre {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5pt;
            background-color: #F4F4F4;
            border: 1px solid #000000;
            padding: 8pt;
            margin-top: 12pt;
            margin-bottom: 12pt;
            white-space: pre;
        }

        code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5pt;
        }

        p code, li code {
            background-color: #E6E6E6;
            padding: 1px 3px;
        }

        blockquote {
            border-left: 3pt solid #000000;
            margin-left: 0.5in;
            padding-left: 12pt;
            font-style: italic;
            margin-top: 6pt;
            margin-bottom: 6pt;
        }
    </style>
</head>
<body>
    <!-- IJPREMS Journal Header Page 1 -->
    <div style="margin-bottom: 24pt; font-family: 'Times New Roman', Times, serif;">
        <table style="width: 100%; border-collapse: collapse; border: none; margin-bottom: 10pt;">
            <tr style="border: none;">
                <td style="width: 25%; text-align: left; vertical-align: middle; border: none; padding: 0;">
                    <div style="font-weight: bold; font-size: 20pt; color: #1a4d80; line-height: 1.0; font-family: 'Times New Roman', serif;">IJPREMS</div>
                    <div style="font-size: 8.5pt; font-family: 'Times New Roman', serif; margin-top: 4px; color: #000000;">
                        www.ijprems.com<br>
                        editor@ijprems.com
                    </div>
                </td>
                <td style="width: 50%; text-align: center; vertical-align: middle; border: none; padding: 0 10px;">
                    <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase; line-height: 1.2; font-family: 'Times New Roman', serif;">INTERNATIONAL JOURNAL OF PROGRESSIVE</div>
                    <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase; line-height: 1.2; font-family: 'Times New Roman', serif;">RESEARCH IN ENGINEERING MANAGEMENT</div>
                    <div style="font-size: 11pt; font-weight: bold; text-transform: uppercase; line-height: 1.2; color: #1a4d80; font-family: 'Times New Roman', serif;">AND SCIENCE (IJPREMS)</div>
                    <div style="font-size: 9.5pt; font-style: italic; line-height: 1.2; margin-top: 2px; font-family: 'Times New Roman', serif;">(Int Peer Reviewed Journal)</div>
                    <div style="font-size: 9.5pt; line-height: 1.2; margin-top: 2px; font-family: 'Times New Roman', serif;">Vol. 06, Issue 04, April 2026, pp : xx-xx</div>
                </td>
                <td style="width: 25%; text-align: right; vertical-align: middle; border: none; padding: 0;">
                    <div style="font-size: 9pt; font-weight: bold; line-height: 1.2; font-family: 'Times New Roman', serif;">e-ISSN :<br>2583-1062</div>
                    <div style="font-size: 9pt; font-weight: bold; line-height: 1.2; margin-top: 6px; font-family: 'Times New Roman', serif;">Impact<br>Factor :<br><span style="color: #1a4d80;">7.001</span></div>
                </td>
            </tr>
        </table>
        <div style="border-bottom: 2px solid #000000; margin-top: 6px; margin-bottom: 24pt; height: 2px;"></div>
    </div>

    ${mainDocContent}
</body>
</html>`;

try {
    fs.writeFileSync(docPath, fullDoc, 'utf8');
    console.log(`Saved DOC research paper to: ${docPath}`);
} catch (err) {
    if (err.code === 'EBUSY') {
        const fallbackPath = docPath.replace('.doc', '_new.doc');
        console.warn(`WARNING: ${docPath} is busy/locked (probably open in Word). Trying fallback to: ${fallbackPath}`);
        try {
            fs.writeFileSync(fallbackPath, fullDoc, 'utf8');
            console.log(`Saved fallback DOC research paper to: ${fallbackPath}`);
        } catch (fallbackErr) {
            if (fallbackErr.code === 'EBUSY') {
                const finalFallback = docPath.replace('.doc', '_copy_final.doc');
                console.warn(`WARNING: Fallback is also locked. Saving as: ${finalFallback}`);
                fs.writeFileSync(finalFallback, fullDoc, 'utf8');
                console.log(`Saved backup DOC research paper to: ${finalFallback}`);
            } else {
                throw fallbackErr;
            }
        }
    } else {
        throw err;
    }
}
console.log("Successfully completed research paper compilation!");
