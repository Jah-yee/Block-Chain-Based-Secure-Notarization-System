const pptxgen = require("pptxgenjs");

let pres = new pptxgen();

// PRESET STYLES
const TITLE_COLOR = "002060";
const ACCENT_COLOR = "1976D2";
const TEXT_COLOR = "333333";
const BOX_BG = "F1F1F1";

// 1. TITLE SLIDE
let slide1 = pres.addSlide();
slide1.addText("Blockchain-Based Secure Notarization System (BBSNS)", {
    x: 1, y: 1.5, w: "80%", h: 2,
    fontSize: 40, color: TITLE_COLOR, bold: true, align: "center", fontFace: "Times New Roman"
});
slide1.addText("A Final Project Presentation", {
    x: 1, y: 3.2, w: "80%", h: 0.5,
    fontSize: 18, color: ACCENT_COLOR, italic: true, align: "center"
});
slide1.addText("By:\nAdhude Ganesh Sanjay | Mate Shubham Vilas\nShaikh Humera Ibrahim | Shivale Bhakti Bhagwan", {
    x: 1, y: 4.5, w: "80%", h: 1,
    fontSize: 14, color: TEXT_COLOR, align: "center"
});
slide1.addText("Under the guidance of Ms. Riya B. Shikare", {
    x: 1, y: 5.5, w: "80%", h: 0.5,
    fontSize: 14, bold: true, align: "center"
});
slide1.addText("Matoshri College of Engineering & Research Centre, Nashik\nSavitribai Phule Pune University (2025-26)", {
    x: 1, y: 6.2, w: "80%", h: 1,
    fontSize: 12, color: "666666", align: "center"
});

// 2. INTRODUCTION
let slide2 = pres.addSlide();
slide2.addText("1. INTRODUCTION", { x: 0.5, y: 0.3, fontSize: 24, color: TITLE_COLOR, bold: true });
slide2.addShape(pres.ShapeType.rect, { x: 0.5, y: 0.8, w: 9, h: 0.05, fill: { color: ACCENT_COLOR } });
slide2.addText([
    { text: "\u2022 Notarization ensures the authenticity and integrity of legal documents.", options: { bullet: true, margin: [10, 0, 0, 0] } },
    { text: "\u2022 Traditional methods are location-dependent, manual, and slow.", options: { bullet: true } },
    { text: "\u2022 BBSNS bridges the gap between legal necessity and technical security.", options: { bullet: true } },
    { text: "\u2022 Leverages Binance Smart Chain (BSC) for immutable verification.", options: { bullet: true } }
], { x: 0.5, y: 1.5, w: 8.5, fontSize: 18, color: TEXT_COLOR, lineSpacing: 28 });

// 3. PROBLEM STATEMENT
let slide3 = pres.addSlide();
slide3.addText("2. PROBLEM STATEMENT", { x: 0.5, y: 0.3, fontSize: 24, color: TITLE_COLOR, bold: true });
slide3.addText([
    { text: "\u2022 Centralized Vulnerability: Single points of failure in database-only tools.", options: { bullet: true } },
    { text: "\u2022 Forgery Risk: Easy modification of digital seals and signatures without on-chain proof.", options: { bullet: true } },
    { text: "\u2022 Identity Fraud: Lack of robust Multi-Factor Authentication in existing notarization portals.", options: { bullet: true } },
    { text: "\u2022 Transparency Gap: Users cannot independently verify their document status without the provider.", options: { bullet: true } }
], { x: 0.5, y: 1.5, w: 8.5, fontSize: 18, color: "990000", lineSpacing: 28 });

// 4. OBJECTIVES
let slide4 = pres.addSlide();
slide4.addText("3. OBJECTIVES", { x: 0.5, y: 0.3, fontSize: 24, color: TITLE_COLOR, bold: true });
slide4.addText([
    { text: "- Immutability: Store document hashes and metadata on the BNB Testnet.", options: { bullet: { type: "number" } } },
    { text: "- Gated Integrity: Enforce status changes based purely on verified blockchain receipts.", options: { bullet: { type: "number" } } },
    { text: "- Multi-Role Lifecycle: Separate interfaces for Document Owners, Notaries, and Admins.", options: { bullet: { type: "number" } } },
    { text: "- Tokenized Economy: Practical fee management using NTKR and NTK tokens.", options: { bullet: { type: "number" } } }
], { x: 0.5, y: 1.5, w: 8.5, fontSize: 18, color: TEXT_COLOR, lineSpacing: 28 });

// 5. SYSTEM ARCHITECTURE
let slide5 = pres.addSlide();
slide5.addText("4. SYSTEM ARCHITECTURE", { x: 0.5, y: 0.3, fontSize: 24, color: TITLE_COLOR, bold: true });
slide5.addText("Multi-Tier Hybrid Architecture", { x: 0.5, y: 0.8, fontSize: 14, color: ACCENT_COLOR });
slide5.addText("Presentation Layer: Next.js (Web) / Electron (Desktop)", { x: 0.5, y: 1.8, w: 4, h: 1, fontSize: 14, align: "center", fill: { color: BOX_BG }, border: { pt: 1, color: "CCCCCC" } });
slide5.addText("Logic Layer: Node.js Express Server", { x: 5, y: 1.8, w: 4, h: 1, fontSize: 14, align: "center", fill: { color: BOX_BG }, border: { pt: 1, color: "CCCCCC" } });
slide5.addText("Persistence Layer: PostgreSQL + Multer/SHA-256", { x: 0.5, y: 3.5, w: 4, h: 1, fontSize: 14, align: "center", fill: { color: BOX_BG }, border: { pt: 1, color: "CCCCCC" } });
slide5.addText("Blockchain Layer: BNB Smart Chain (Testnet)", { x: 5, y: 3.5, w: 4, h: 1, fontSize: 14, align: "center", fill: { color: "CCE5FF" }, border: { pt: 1, color: "1976D2" } });

// 6. TECHNICAL STACK
let slide6 = pres.addSlide();
slide6.addText("5. TECHNICAL STACK", { x: 0.5, y: 0.3, fontSize: 24, color: TITLE_COLOR, bold: true });
let rows = [
    ["Component", "Technology Used"],
    ["Frontend", "Next.js 14, TypeScript, TailwindCSS"],
    ["Desktop Core", "Electron.js (Native Integration)"],
    ["Backend", "Express.js, JWT, Multer"],
    ["Database", "PostgreSQL"],
    ["Blockchain Interface", "Ethers.js, Solidity v0.8.x"],
    ["UI Components", "Radix-UI, Lucide React Icons"]
];
slide6.addTable(rows, { x: 0.5, y: 1.2, w: 9, border: { pt: 1, color: "CCCCCC" }, fontSize: 14, fill: { color: "FFFFFF" }, rowH: 0.6 });

// 7. LIT SURVEY TABLE
let slide7 = pres.addSlide();
slide7.addText("6. LITERATURE SURVEY", { x: 0.5, y: 0.3, fontSize: 24, color: TITLE_COLOR, bold: true });
let litRows = [
    [{ text: "Author/Year", options: { bold: true, fill: "E0E0E0" } }, { text: "Focus", options: { bold: true, fill: "E0E0E0" } }, { text: "Gap / Limitations", options: { bold: true, fill: "E0E0E0" } }],
    ["Korukonda (2022)", "National eID + Blockchain", "Lack of economic incentives for participants."],
    ["Bhujbal (2021)", "Ethereum Smart Contracts", "High gas fees and dual-window sync issues."],
    ["BBSNS (Proposed)", "Hybrid BSC + Multi-Role UI", "Solves legacy sync issues and uses low-cost BNB Testnet."]
];
slide7.addTable(litRows, { x: 0.5, y: 1.2, w: 9, fontSize: 12, border: { pt: 1, color: "CCCCCC" } });

// 8. CRITICAL ENGINEERING RESOLUTIONS
let slide8 = pres.addSlide();
slide8.addText("7. ENGINEERING RISK AUDIT", { x: 0.5, y: 0.3, fontSize: 24, color: TITLE_COLOR, bold: true });
let riskRows = [
    [{ text: "Risk ID", options: { bold: true, fill: "FFEBEE" } }, { text: "Mitigation Strategy", options: { bold: true, fill: "FFEBEE" } }, { text: "Result", options: { bold: true, fill: "FFEBEE" } }],
    ["R-007: Hash Forgery", "Server-side SHA-256 computation via Multer.", "PROTECTED"],
    ["R-006: DB Tampering", "Purely on-chain derived status verification.", "ELIMINATED"],
    ["R-008: Admin Abuse", "RBAC + Governance Voting for high-privilege tasks.", "RESTRICTED"]
];
slide8.addTable(riskRows, { x: 0.5, y: 1.2, w: 9, fontSize: 13, border: { pt: 1, color: "CCCCCC" } });

// 9. CONCLUSION
let slide9 = pres.addSlide();
slide9.addText("CONCLUSION", { x: 1, y: 1.5, w: "80%", fontSize: 36, color: TITLE_COLOR, bold: true, align: "center" });
slide9.addText("BBSNS provides a robust, scalable, and tamper-proof solution to document notarization. By integrating modern Web3 practices with Native Desktop security, we achieve a high-integrity ecosystem for legal and organizational document management.", {
    x: 1, y: 2.5, w: 8, fontSize: 18, color: TEXT_COLOR, align: "center"
});

// 10. THANK YOU
let slide10 = pres.addSlide();
slide10.addText("THANK YOU!", {
    x: 1.5, y: 2.5, w: "70%", fontSize: 64, color: ACCENT_COLOR, bold: true, align: "center"
});
slide10.addText("Questions?", {
    x: 1.5, y: 4.5, w: "70%", fontSize: 24, color: "666666", align: "center"
});

pres.writeFile("BBSNS_Final_Presentation.pptx").then(fileName => {
    console.log(`Presentation generated successfully: ${fileName}`);
});
