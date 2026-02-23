import fs from 'fs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { marked } from 'marked';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
    console.error('Usage: node convert_md_to_docx.mjs <input.md> <output.docx>');
    process.exit(1);
}

const markdown = fs.readFileSync(inputPath, 'utf8');
const tokens = marked.lexer(markdown);

const sections = [];
tokens.forEach(token => {
    if (token.type === 'heading') {
        let level;
        switch (token.depth) {
            case 1: level = HeadingLevel.HEADING_1; break;
            case 2: level = HeadingLevel.HEADING_2; break;
            case 3: level = HeadingLevel.HEADING_3; break;
            default: level = HeadingLevel.HEADING_4;
        }
        sections.push(new Paragraph({
            text: token.text,
            heading: level,
        }));
    } else if (token.type === 'paragraph') {
        sections.push(new Paragraph({
            children: [new TextRun(token.text)],
        }));
    } else if (token.type === 'code') {
        sections.push(new Paragraph({
            children: [new TextRun({
                text: token.text,
                font: 'Courier New',
                size: 20
            })],
        }));
    } else if (token.type === 'list') {
        token.items.forEach(item => {
            sections.push(new Paragraph({
                text: item.text,
                bullet: { level: 0 }
            }));
        });
    } else if (token.type === 'blockquote') {
        sections.push(new Paragraph({
            children: [new TextRun({
                text: token.text,
                italics: true
            })],
        }));
    }
});

const doc = new Document({
    sections: [{
        properties: {},
        children: sections,
    }],
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync(outputPath, buffer);
    console.log(`Document created successfully at ${outputPath}`);
});
