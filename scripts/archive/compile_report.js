const fs = require('fs');
const path = require('path');
const marked = require('marked');

// File paths
const mdPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Final_Report_v2.md';
const htmlPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Final_Report_v2.html';
const docPath = 'C:\\Users\\Lenovo\\OneDrive\\Desktop\\Final_pro\\Project Doc\\BBSNS\\21-04-2026\\BBSNS_Final_Report_v2.doc';

console.log("Reading markdown source...");
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
console.log("Compiling HTML report...");

// Configure marked with custom code renderer
const renderer = new marked.Renderer();
renderer.code = function(codeBlock) {
    const code = codeBlock.text;
    const infostring = codeBlock.lang || '';
    const lang = infostring.match(/\S*/)[0];

    if (lang === 'mermaid') {
        const encodedCode = encodeURIComponent(code);
        return `
    <div class="mermaid-block-wrapper" style="margin: 28pt 0; border: 1px solid var(--border-color); border-radius: 4px; padding: 18px; background: #ffffff; page-break-inside: avoid;">
        <div class="mermaid-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
            <span style="font-weight: bold; font-family: Calibri, sans-serif; font-size: 11pt; color: var(--accent-color);">SYSTEM VISUALIZATION</span>
            <div>
                <button class="copy-btn copy-mermaid-code-btn" data-code="${encodedCode}" style="padding: 4px 10px; font-size: 9pt; margin-right: 6px;">📋 Copy Mermaid Code</button>
                <button class="copy-btn copy-mermaid-png-btn" style="padding: 4px 10px; font-size: 9pt;">📷 Copy Diagram as Image</button>
            </div>
        </div>
        <div class="mermaid" style="text-align: center; background: #ffffff; padding: 10px;">${escapeHtml(code)}</div>
    </div>`;
    } else {
        const isDiagram = code.includes('┌─') || code.includes('│') || code.includes('└─') || code.includes('──') || code.includes('DOCUMENT OWNER');
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

marked.use({ renderer });
const mainHtmlContent = marked.parse(markdownContent);

// Build complete high-fidelity HTML report
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BBSNS Final Engineering Report (v2) - Copy/Paste Enhanced</title>
    <title>BBSNS Final Engineering Report (v2) - Copy/Paste Enhanced</title>
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
        /* Modern Premium Academic Web Layout */
        :root {
            --bg-color: #f4f6f8;
            --container-bg: #ffffff;
            --text-primary: #111111;
            --text-secondary: #444444;
            --accent-color: #2b5797; /* Microsoft Word / SPPU Royal Blue */
            --border-color: #cccccc;
            --code-bg: #f9f9f9;
        }

        body {
            font-family: 'Times New Roman', Georgia, serif;
            background-color: var(--bg-color);
            color: var(--text-primary);
            margin: 0;
            padding: 40px 20px;
            line-height: 1.6;
            font-size: 12pt;
        }

        /* Container centering standard A4 width equivalent on screen */
        .document-container {
            max-width: 850px;
            margin: 0 auto;
            background: var(--container-bg);
            padding: 50px 70px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            border: 1px solid var(--border-color);
            border-radius: 4px;
        }

        /* Copy-Paste Helper Banner Styling */
        .guide-banner {
            background-color: #e7f3fe;
            border-left: 6px solid #2196F3;
            color: #0c5460;
            padding: 18px 22px;
            margin-bottom: 30px;
            border-radius: 4px;
            font-family: Calibri, Arial, sans-serif;
            font-size: 11pt;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }

        .guide-banner h4 {
            margin-top: 0;
            margin-bottom: 8px;
            color: #004085;
            font-size: 13pt;
            font-weight: bold;
        }

        .guide-banner ul {
            margin: 0;
            padding-left: 20px;
        }

        .guide-banner li {
            margin-bottom: 6px;
            line-height: 1.4;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: Calibri, Arial, sans-serif;
            color: #000000;
            font-weight: bold;
            line-height: 1.3;
            margin-top: 24pt;
            margin-bottom: 8pt;
        }

        h1 {
            font-size: 20pt;
            text-transform: uppercase;
            border-bottom: 2px solid var(--accent-color);
            padding-bottom: 6pt;
            margin-top: 30pt;
        }

        /* Top H1 margin correction */
        h1:first-of-type {
            margin-top: 0;
        }

        h2 {
            font-size: 15pt;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 4pt;
            color: var(--accent-color);
        }

        h3 {
            font-size: 13pt;
        }

        p {
            margin-top: 0;
            margin-bottom: 12pt;
            text-align: justify;
            text-indent: 0.5in; /* Standard paragraph indent */
        }

        /* Lists, blockquotes, tables, pre elements shouldn't have indents */
        ul p, ol p, li p, blockquote p, pre p, table p {
            text-indent: 0 !important;
            margin-bottom: 6pt;
        }

        li {
            text-align: justify;
            margin-bottom: 6pt;
        }

        ul, ol {
            margin-top: 0;
            margin-bottom: 12pt;
            padding-left: 0.5in;
        }

        /* Table formatting matching standard A4 dimensions */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 18pt 0;
            font-size: 10pt;
            font-family: Calibri, Arial, sans-serif;
            border: 1px solid #111111;
            table-layout: auto;
            word-wrap: break-word;
            word-break: break-word;
        }

        th, td {
            border: 1px solid #111111;
            padding: 8px 12px;
            text-align: left;
            vertical-align: top;
        }

        th {
            background-color: #f2f2f2;
            font-weight: bold;
            color: #000000;
        }

        /* Monaco/Consolas Code Blocks and ASCII Diagrams */
        pre {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5pt;
            background-color: var(--code-bg);
            border: 1px solid #888888;
            padding: 12px;
            margin: 0;
            overflow-x: auto;
            white-space: pre;
            border-radius: 4px;
            line-height: 1.15;
            color: #111111;
        }

        code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 9.5pt;
        }

        p code, li code {
            background-color: #eaeaea;
            padding: 2px 4px;
            border-radius: 3px;
        }

        blockquote {
            border-left: 4px solid var(--accent-color);
            margin: 12pt 0 12pt 0.5in;
            padding-left: 15px;
            font-style: italic;
            color: #555555;
        }

        /* Horizontal dividers styling */
        hr {
            border: 0;
            border-top: 1px solid var(--border-color);
            margin: 30px 0;
        }

        .page-break {
            page-break-after: always;
            border-bottom: 2px dashed #cccccc;
            margin: 40px 0;
            text-align: center;
            font-size: 9pt;
            color: #999999;
            font-family: Calibri, sans-serif;
            user-select: none;
        }

        /* Clipboard Copy Buttons */
        .copy-btn {
            font-family: Calibri, sans-serif;
            font-size: 8.5pt;
            cursor: pointer;
            background: #ffffff;
            border: 1px solid #777777;
            border-radius: 3px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            transition: all 0.2s;
            color: #111111;
            padding: 4px 10px;
        }
        .copy-btn:hover {
            background: #f0f4f9 !important;
            border-color: #2b5797 !important;
            color: #2b5797 !important;
        }

        /* Floating action notifications */
        .toast-notification {
            position: fixed;
            bottom: 25px;
            right: 25px;
            background-color: #28a745;
            color: #ffffff;
            padding: 14px 28px;
            border-radius: 4px;
            font-family: Calibri, Arial, sans-serif;
            font-size: 11pt;
            box-shadow: 0 4px 12px rgba(0,0,0,0.18);
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

        /* Print Optimization */
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
            .page-break {
                page-break-after: always;
                border: none;
                margin: 0;
                height: 0;
                content: "";
            }
            .guide-banner, .copy-btn, .mermaid-diagram-header, .code-block-wrapper button {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="toast-notification" id="copyToast">✅ Content copied to clipboard successfully!</div>

    <div class="document-container">
        
        <!-- Copy-Paste Optimization Guide -->
        <div class="guide-banner">
            <h4>📋 Microsoft Word Copy-Paste Optimization Guide</h4>
            <ul>
                <li><strong>For Tables:</strong> Click the <strong>"📋 Copy Table"</strong> button directly above the table. Go to MS Word, press <strong>Ctrl+V</strong>, and it will paste as a native, fully editable, styled Word Table.</li>
                <li><strong>For Visual Diagrams (Mermaid):</strong> Click the <strong>"📷 Copy Diagram as Image"</strong> button on the top-right of any diagram. Paste it into Word (Ctrl+V) and it inserts as a flawless high-resolution image! (Or use <strong>📋 Copy Mermaid Code</strong> if you need the raw text syntax).</li>
                <li><strong>For Monospace Box Diagrams:</strong> Click the <strong>"📋 Copy Diagram"</strong> button. Paste into Word (Ctrl+V) — it will paste pre-formatted inside a neat bordered box with Courier New (9.5pt) font automatically applied!</li>
                <li><strong>For Text:</strong> Simply select the text on this page, copy it, and paste it into Word. Choose the <strong>"Keep Source Formatting"</strong> option to retain the Times New Roman serif styling.</li>
            </ul>
        </div>

        ${mainHtmlContent}

    </div>

    <script>
        // Custom Browser Side Copy Controller
        document.addEventListener('DOMContentLoaded', () => {
            const toast = document.getElementById('copyToast');
            function showToast(message, isSuccess = true) {
                toast.innerHTML = message;
                toast.style.backgroundColor = isSuccess ? '#28a745' : '#dc3545';
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 3000);
            }

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
                container.style.margin = '28pt 0 18pt 0';
                
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
                        console.error('Failed to copy table via modern API', err);
                        // Fallback
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
        });
    </script>
</body>
</html>
`;

fs.writeFileSync(htmlPath, fullHtml, 'utf8');
console.log(`Saved HTML report to: ${htmlPath}`);


// 2. Compile DOC Version (Word Compatible HTML format)
console.log("Compiling DOC report...");

// For the DOC version, we want to strip the interactive buttons and Toast UI elements
// We also want to replace the page-break elements with standard docx style page breaks
// We configure a different marked renderer for doc blocks to remove "Copy" headers and wrappers
const docRenderer = new marked.Renderer();
docRenderer.code = function(codeBlock) {
    const code = codeBlock.text;
    const infostring = codeBlock.lang || '';
    const lang = infostring.match(/\S*/)[0];

    if (lang === 'mermaid') {
        // Word offline has no JS, so we output the raw Mermaid diagram syntax inside a pre block as a backup
        return `
    <pre style="font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; background-color: #F4F4F4; border: 1px solid #000000; padding: 8pt; margin-top: 12pt; margin-bottom: 12pt; white-space: pre;"><code>[MERMAID FLOWCHART SYNTAX]
${escapeHtml(code)}</code></pre>`;
    } else {
        return `
    <pre style="font-family: 'Courier New', Courier, monospace; font-size: 9.5pt; background-color: #F4F4F4; border: 1px solid #000000; padding: 8pt; margin-top: 12pt; margin-bottom: 12pt; white-space: pre;"><code>${escapeHtml(code)}</code></pre>`;
    }
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

// In the DOC content, we convert the page break divs to standard MS Word page-break logic
mainDocContent = mainDocContent.replace(/<div class="page-break">\[ Page Break for Binding \]<\/div>/g, '<div style="page-break-after: always;"></div>');

const fullDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <title>SAVITRIBAI PHULE PUNE UNIVERSITY - BBSNS Final Report</title>
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
        /* Classic Word DOCX Thesis Layout Styling */
        @page {
            size: 21cm 29.7cm; /* A4 size */
            margin: 2.54cm 2cm 2.0cm 2.54cm; /* standard binding margins */
        }
        
        body {
            font-family: 'Times New Roman', Georgia, serif;
            font-size: 12pt;
            line-height: 1.5;
            color: #000000;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: Calibri, Arial, sans-serif;
            color: #000000;
            font-weight: bold;
            line-height: 1.2;
            margin-top: 18pt;
            margin-bottom: 6pt;
        }

        h1 {
            font-size: 18pt;
            text-transform: uppercase;
            border-bottom: 1px solid #000000;
            padding-bottom: 4pt;
            page-break-before: always;
        }

        h1.first-h1 {
            page-break-before: avoid;
        }

        h2 {
            font-size: 14pt;
            border-bottom: 0.5px solid #555555;
            padding-bottom: 2pt;
        }

        h3 {
            font-size: 12pt;
        }

        p {
            margin-top: 0pt;
            margin-bottom: 8pt;
            text-align: justify;
            text-indent: 0.5in; /* 0.5 inch paragraph indentation */
        }

        /* List elements and preformatted items should not have indent */
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

        /* Bulletproof Dense Tables in Word */
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

        /* Monaco/Consolas Code Blocks and ASCII Diagrams */
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
console.log(`Saved DOC report to: ${docPath}`);
console.log("Successfully completed report recompilation!");