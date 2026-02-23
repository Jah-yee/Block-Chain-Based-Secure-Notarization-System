const fs = require('fs');
const docx = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = docx;

const mdPath = process.argv[2];
const outputPath = process.argv[3];

if (!mdPath || !outputPath) {
    console.error("Usage: node convert_to_docx.js <mdPath> <outputPath>");
    process.exit(1);
}

const content = fs.readFileSync(mdPath, 'utf8');
const lines = content.split('\n');

const children = [];
let inTable = false;
let tableRows = [];

lines.forEach(line => {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('|') && (trimmedLine.includes('|'))) {
        if (trimmedLine.includes(':---')) return;
        inTable = true;
        const cells = trimmedLine.split('|').map(c => c.trim()).filter((c, i, arr) => i > 0 && i < arr.length - 1);
        if (cells.length > 0) {
            tableRows.push(new TableRow({
                children: cells.map(cellText => new TableCell({
                    children: [new Paragraph({ text: cellText })]
                }))
            }));
        }
        return;
    } else if (inTable) {
        children.push(new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE }
        }));
        children.push(new Paragraph({ text: "" }));
        inTable = false;
        tableRows = [];
    }

    if (trimmedLine.startsWith('# ')) {
        children.push(new Paragraph({
            text: trimmedLine.replace('# ', ''),
            heading: HeadingLevel.HEADING_1
        }));
    } else if (trimmedLine.startsWith('### ')) {
        children.push(new Paragraph({
            text: trimmedLine.replace('### ', ''),
            heading: HeadingLevel.HEADING_3
        }));
    } else if (trimmedLine === '---') {
        children.push(new Paragraph({ text: "________________________________________________________________________________" }));
    } else if (trimmedLine !== '') {
        const parts = trimmedLine.split('**');
        const textRuns = parts.map((part, index) => {
            return new TextRun({
                text: part,
                bold: index % 2 !== 0
            });
        });
        children.push(new Paragraph({
            children: textRuns
        }));
    } else {
        children.push(new Paragraph({ text: "" }));
    }
});

const doc = new Document({
    sections: [{
        children: children
    }]
});

Packer.toBuffer(doc).then(buffer => {
    fs.writeFileSync(outputPath, buffer);
    console.log(`Document created successfully at ${outputPath}`);
});
