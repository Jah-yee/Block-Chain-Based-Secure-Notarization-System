const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const marked = require('marked');

const ARTIFACT_PATH = 'C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\a194b7b8-87fb-4f7f-bff8-3ae86c21c686\\Final_Handover_Guide.md';
const OUTPUT_DIR = path.join(__dirname, 'REPORT', 'Final_Handover');
const HTML_OUTPUT = path.join(OUTPUT_DIR, 'handover.html');
const PDF_OUTPUT = path.join(OUTPUT_DIR, 'BBSNS_Final_Handover_Guide.pdf');

function main() {
    console.log("📄 Converting Markdown to HTML/PDF...");

    let markdown = fs.readFileSync(ARTIFACT_PATH, 'utf-8');

    // Replace Mermaid blocks with image links (which were already generated)
    const diagramNames = ['System_Architecture', 'Auth_Flow', 'Notarization_Flow', 'Governance_Flow'];
    let diagramIndex = 0;
    
    markdown = markdown.replace(/```mermaid\n([\s\S]*?)```/g, () => {
        const name = diagramNames[diagramIndex++] || `Diagram_${diagramIndex}`;
        return `![${name}](./${name}.svg)`;
    });

    // Replace github alerts
    markdown = markdown.replace(/> \[!IMPORTANT\]\n> (.*?)\n> (.*?)\n/g, '<div class="alert alert-important"><strong>IMPORTANT: $1</strong><br/>$2</div>');
    markdown = markdown.replace(/> \[!TIP\]\n> (.*?)\n> (.*?)\n/g, '<div class="alert alert-tip"><strong>TIP: $1</strong><br/>$2</div>');

    const htmlContent = marked.parse(markdown);

    const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 40px; }
            h1, h2, h3 { color: #111; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
            code { background-color: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; font-size: 85%; }
            pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }
            pre code { background-color: transparent; padding: 0; }
            img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; padding: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .alert { padding: 15px; margin-bottom: 20px; border: 1px solid transparent; border-radius: 4px; }
            .alert-important { color: #842029; background-color: #f8d7da; border-color: #f5c2c7; }
            .alert-tip { color: #0f5132; background-color: #d1e7dd; border-color: #badbcc; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; }
            th { background-color: #f2f2f2; }
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
    `;

    fs.writeFileSync(HTML_OUTPUT, fullHtml);
    console.log(`✅ Saved HTML to ${HTML_OUTPUT}`);

    // Try to convert to PDF using Edge Headless (built-in on Windows 10/11)
    try {
        console.log("🖨️  Printing PDF using MS Edge...");
        // Path to Edge
        const edgePaths = [
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
        ];
        
        let edgeExe = edgePaths.find(p => fs.existsSync(p));
        if (!edgeExe) throw new Error("MS Edge not found. Please open the HTML file and print it manually.");

        execSync(`"${edgeExe}" --headless --disable-gpu --print-to-pdf="${PDF_OUTPUT}" "file:///${HTML_OUTPUT.replace(/\\/g, '/')}"`);
        console.log(`✅ PDF successfully generated at: ${PDF_OUTPUT}`);
    } catch (e) {
        console.warn("⚠️ PDF auto-generation failed. You can open the HTML file and print it manually.", e.message);
    }
}

main();
