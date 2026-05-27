const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ARTIFACT_PATH = 'C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\a194b7b8-87fb-4f7f-bff8-3ae86c21c686\\Final_Handover_Guide.md';
const OUTPUT_DIR = path.join(__dirname, 'REPORT', 'Final_Handover');
const PDF_OUTPUT = path.join(OUTPUT_DIR, 'BBSNS_Final_Handover_Guide.pdf');

async function main() {
    console.log("🚀 Starting Handover Export Process...");

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    if (!fs.existsSync(ARTIFACT_PATH)) {
        throw new Error(`Artifact not found at ${ARTIFACT_PATH}`);
    }

    let markdown = fs.readFileSync(ARTIFACT_PATH, 'utf-8');

    // 1. Extract Mermaid Diagrams
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    let match;
    let diagramIndex = 1;
    const diagramNames = ['System_Architecture', 'Auth_Flow', 'Notarization_Flow', 'Governance_Flow'];

    while ((match = mermaidRegex.exec(markdown)) !== null) {
        const mmdContent = match[1];
        const diagramName = diagramNames[diagramIndex - 1] || `Diagram_${diagramIndex}`;
        const mmdPath = path.join(OUTPUT_DIR, `${diagramName}.mmd`);
        const svgPath = path.join(OUTPUT_DIR, `${diagramName}.svg`);

        fs.writeFileSync(mmdPath, mmdContent);
        console.log(`- Created ${diagramName}.mmd`);

        try {
            console.log(`- Fetching ${diagramName}.svg from mermaid.ink...`);
            // Encode to base64
            const encoded = Buffer.from(mmdContent).toString('base64');
            const url = `https://mermaid.ink/svg/${encoded}`;
            execSync(`curl -s "${url}" -o "${svgPath}"`);
            console.log(`✅ Saved ${diagramName}.svg`);
        } catch (e) {
            console.warn(`⚠️ Failed to fetch ${diagramName}.svg from mermaid.ink.`);
        }
        diagramIndex++;
    }

    console.log("🎉 SVG Export Complete! Proceeding to PDF generation...");
}

main().catch(console.error);
