const fs = require('fs');
const path = require('path');
const marked = require('marked');

// File paths
const mdPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Production_Handoff_Manual.md';
const htmlPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Production_Handoff_Manual.html';
const docPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Production_Handoff_Manual.doc';

console.log("Reading production handoff manual markdown source...");
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
console.log("Compiling HTML handoff manual...");

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
        const isDiagram = code.includes('┌─') || code.includes('│') || code.includes('└─') || code.includes('──') || code.includes('DOCUMENT OWNER') || code.includes('USERS') || code.includes('CLIENT DOMAIN') || code.includes('+--');
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

// Add "Copy Section" buttons dynamically at the start of each H2 section
renderer.heading = function(headingBlock) {
    const text = headingBlock.text;
    const level = headingBlock.depth;
    const escapedText = text.toLowerCase().replace(/[^\w]+/g, '-');
    
    if (level === 2) {
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

// Build complete, beautifully styled A4 single-column Research Paper/Handoff webpage
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BBSNS Production Handoff Manual - Copy/Paste Enhanced</title>
    
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
            line-height: 1.35;
            font-size: 10.5pt;
        }

        /* Container centering styled as a standard print layout sheet */
        .document-container {
            max-width: 850px;
            margin: 0 auto;
            background: var(--container-bg);
            padding: 1.0in; /* Standard 1-inch margins */
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

        /* Title Layout */
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
            font-size: 10.5pt;
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
            background: #eaf4ff !important;
            border-color: var(--accent-blue) !important;
            color: var(--accent-blue) !important;
        }

        /* Toast notification */
        .toast-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #28a745;
            color: #ffffff;
            padding: 12px 24px;
            border-radius: 4px;
            font-family: Calibri, Arial, sans-serif;
            font-size: 10pt;
            box-shadow: 0 3px 10px rgba(0,0,0,0.15);
            z-index: 10000;
            opacity: 0;
            transition: all 0.3s ease;
            transform: translateY(10px);
            pointer-events: none;
        }
        .toast-notification.show {
            opacity: 1;
            transform: translateY(0);
        }

        /* Print formatting */
        @media print {
            body {
                background-color: #ffffff;
                padding: 0;
                font-size: 10pt;
            }
            .document-container {
                box-shadow: none;
                border: none;
                padding: 0;
                max-width: 100%;
            }
            .guide-ribbon, .copy-btn, .copy-section-btn, .mermaid-header {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="toast-notification" id="copyToast">✅ Content copied! Ready for MS Word.</div>

    <div class="document-container">
        
        <!-- Copy-Paste Helper Ribbon -->
        <div class="guide-ribbon">
            <h4>📋 Production Team Microsoft Word Copy-Paste Protocol</h4>
            <ul>
                <li><strong>Gantt Charts & Tables:</strong> Click the <strong>"📋 Copy Table"</strong> button on top of any table. In MS Word, press <strong>Ctrl+V</strong> to paste it as a native, styled, fully editable Word Table!</li>
                <li><strong>Section Text:</strong> Click the <strong>"📋 Copy Section"</strong> button in any section heading to copy the entire chapter text with proper indentations. Paste in Word.</li>
                <li><strong>Terminal Commands & Schematics:</strong> Click <strong>"📋 Copy Diagram"</strong> or <strong>"📋 Copy Code"</strong>. It copies inside a formatted border box with perfect Courier New alignment when pasted (Ctrl+V) in Word!</li>
            </ul>
        </div>

        ${mainHtmlContent}

    </div>

    <script>
        // Custom Copy-to-Clipboard logic
        document.addEventListener('DOMContentLoaded', () => {
            const toast = document.getElementById('copyToast');
            function showToast(message, isSuccess = true) {
                toast.innerHTML = message;
                toast.style.backgroundColor = isSuccess ? '#28a745' : '#dc3545';
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 2500);
            }

            // Copy whole H2 text sections
            window.copySection = function(sectionId) {
                const heading = document.getElementById(sectionId);
                let content = heading.outerHTML;
                let text = heading.innerText.replace('📋 Copy Section', '').trim() + '\\n\\n';
                
                let el = heading.nextElementSibling;
                while (el && el.tagName !== 'H2') {
                    content += el.outerHTML;
                    text += el.innerText || el.textContent + '\\n';
                    el = el.nextElementSibling;
                }
                
                const htmlBlob = new Blob([content], { type: 'text/html' });
                const textBlob = new Blob([text], { type: 'text/plain' });
                
                navigator.clipboard.write([
                    new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
                ]).then(() => {
                    showToast('✅ Entire section copied! Paste (Ctrl+V) directly in MS Word.');
                }).catch(() => {
                    showToast('❌ Copy failed. Select and copy manually.', false);
                });
            };

            // High-res SVG to PNG for Mermaid diagram copy
            function copySvgAsPng(svgElement) {
                return new Promise((resolve, reject) => {
                    try {
                        const bbox = svgElement.getBoundingClientRect();
                        let width = bbox.width || 800;
                        let height = bbox.height || 600;
                        
                        const padding = 15;
                        const finalWidth = width + padding * 2;
                        const finalHeight = height + padding * 2;
                        
                        const scale = 3;
                        const canvas = document.createElement('canvas');
                        canvas.width = finalWidth * scale;
                        canvas.height = finalHeight * scale;
                        const ctx = canvas.getContext('2d');
                        
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        ctx.scale(scale, scale);
                        ctx.translate(padding, padding);
                        
                        const serializer = new XMLSerializer();
                        let svgString = serializer.serializeToString(svgElement);
                        
                        if (!svgString.match(/^<svg[^>]+xmlns="http\\:\\/\\/www\\.w3\\.org\\/2000\\/svg"/)) {
                            svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
                        }
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
                                    reject(new Error('Canvas conversion failed'));
                                    return;
                                }
                                navigator.clipboard.write([
                                    new ClipboardItem({ 'image/png': pngBlob })
                                ]).then(resolve).catch(reject);
                            }, 'image/png');
                        };
                        img.src = blobURL;
                    } catch (err) {
                        reject(err);
                    }
                });
            }

            // Bind Table Copy Buttons
            document.querySelectorAll('table').forEach((table) => {
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
                btn.style.top = '-24px';
                btn.style.right = '0';
                
                btn.addEventListener('click', () => {
                    const html = table.outerHTML;
                    const text = table.innerText;
                    
                    const htmlBlob = new Blob([html], { type: 'text/html' });
                    const textBlob = new Blob([text], { type: 'text/plain' });
                    
                    navigator.clipboard.write([
                        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
                    ]).then(() => {
                        showToast('✅ Table copied! Paste in Word.');
                    });
                });
                container.appendChild(btn);
            });

            // Bind Code and Unicode Art Copy Buttons
            document.querySelectorAll('.copy-code-btn, .copy-diagram-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const codeBlock = btn.nextElementSibling.querySelector('code');
                    const text = codeBlock.innerText;
                    const isDiagram = btn.classList.contains('copy-diagram-btn');
                    
                    const styledHtml = \`<pre style="font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; line-height: 1.15; background-color: #f9f9f9; border: 1px solid #888888; padding: 10px; margin: 18pt 0; white-space: pre; color: #111111;">\${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>\`;
                    
                    const htmlBlob = new Blob([styledHtml], { type: 'text/html' });
                    const textBlob = new Blob([text], { type: 'text/plain' });
                    
                    navigator.clipboard.write([
                        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
                    ]).then(() => {
                        const wordText = isDiagram ? 'Diagram' : 'Code';
                        showToast(\`✅ \${wordText} copied! Pastes cleanly into MS Word.\`);
                    });
                });
            });
        });
    </script>
</body>
</html>
`;

fs.writeFileSync(htmlPath, fullHtml, 'utf8');
console.log(`Saved HTML handoff manual to: ${htmlPath}`);


// 2. Compile DOC Version (Word Compatible HTML format)
console.log("Compiling DOC handoff manual...");

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

docRenderer.heading = function(headingBlock) {
    const text = headingBlock.text;
    const level = headingBlock.depth;
    if (level === 2) {
        return `<h2 style="font-family: 'Times New Roman', serif; font-size: 12pt; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000000; padding-bottom: 2pt; margin-top: 20pt; margin-bottom: 8pt;">${text}</h2>`;
    }
    return `<h${level} style="font-family: 'Times New Roman', serif; font-size: ${level === 1 ? '14pt' : '10.5pt'}; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt;">${text}</h${level}>`;
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
    <title>BBSNS Production Handoff Manual</title>
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
        /* Exact single-column Word print layout */
        @page {
            size: 21cm 29.7cm; /* A4 size */
            margin: 2.54cm; /* standard 1-inch margins */
        }
        
        body {
            font-family: 'Times New Roman', Georgia, serif;
            font-size: 10.5pt;
            line-height: 1.3;
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
            font-size: 10.5pt;
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
    ${mainDocContent}
</body>
</html>`;

fs.writeFileSync(docPath, fullDoc, 'utf8');
console.log(`Saved DOC handoff manual to: ${docPath}`);
console.log("Successfully completed production handoff manual compilation!");
