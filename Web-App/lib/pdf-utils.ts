import { jsPDF } from "jspdf"
import QRCode from "qrcode"

// ─── Certificate Data Interface ────────────────────────────────────────────────
export interface CertificateData {
  filename: string
  fileHash: string
  status: string
  txHash?: string
  blockNumber?: string | number
  notaryWallet: string
  notaryName?: string
  ownerWallet?: string
  timestamp?: string
  documentSummary?: string
  contractAddress?: string
  chainId?: number
  certId?: string           // Pre-generated cert ID (e.g. BBSNS-BT9F1AH5)
  verificationUrl?: string  // Full direct URL e.g. https://app.bbsns.online/verify?hash=BBSNS-BT9F1AH5
  revoked?: boolean
  revocationReason?: string
  supersededBy?: string
}

// ─── Color Palette (Institutional — DocuSign / Banking Grade) ─────────────────
const C = {
  headerBg:   [15, 30, 60]    as [number,number,number],  // Deep navy
  headerLine: [30, 80, 160]   as [number,number,number],  // Royal blue accent
  gold:       [180, 145, 60]  as [number,number,number],  // Muted institutional gold
  text:       [30, 35, 45]    as [number,number,number],  // Near-black body text
  labelGray:  [100, 110, 125] as [number,number,number],  // Label gray
  mutedBlue:  [70, 110, 175]  as [number,number,number],  // Link / accent blue
  borderGray: [200, 205, 215] as [number,number,number],  // Divider lines
  bgLight:    [248, 249, 251] as [number,number,number],  // Section background
  white:      [255, 255, 255] as [number,number,number],
  verified:   [22, 115, 60]   as [number,number,number],  // Dark institutional green
  revoked:    [160, 30, 30]   as [number,number,number],  // Deep red
  watermark:  [242, 245, 250] as [number,number,number],  // Very faint watermark
}

// ─── Helper: mask wallet address (0x72ac...91fd) ──────────────────────────────
function maskWallet(addr?: string): string {
  if (!addr) return "0x••••••••••••••••••••"
  const clean = addr.trim()
  if (clean.includes("Redacted") || clean.toLowerCase() === "redacted" || clean === "") {
    return "0x••••••••••••••••••••"
  }
  if (clean.startsWith("0x") && clean.length >= 10) {
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`
  }
  if (clean.length > 20) {
    return `${clean.slice(0, 8)}...${clean.slice(-6)}`
  }
  return clean
}

// ─── Helper: generate short cert ID ───────────────────────────────────────────
function generateCertId(): string {
  return "BBSNS-" + Math.random().toString(36).substring(2, 10).toUpperCase()
}

// ─── Helper: draw a horizontal rule ───────────────────────────────────────────
function drawRule(doc: jsPDF, y: number, leftX = 15, rightX = 195, color = C.borderGray, width = 0.3) {
  doc.setDrawColor(...color)
  doc.setLineWidth(width)
  doc.line(leftX, y, rightX, y)
}

// ─── Helper: draw a filled section block ──────────────────────────────────────
function drawSectionBg(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...C.bgLight)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "F")
  doc.setDrawColor(...C.borderGray)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "S")
}

// ─── Main: Generate Institutional Certificate PDF ─────────────────────────────
export async function generateCertificatePDF(data: CertificateData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  // ── Derived values ────────────────────────────────────────────────────────────
  const certId = data.certId || generateCertId()
  const explorerBase = data.chainId === 56 ? "https://bscscan.com" : "https://testnet.bscscan.com"
  const explorerTxUrl = data.txHash && !["ALREADY_NOTARIZED_SYNC","ALREADY_ON_CHAIN","PENDING_USER_TX"].includes(data.txHash)
    ? `${explorerBase}/tx/${data.txHash}` : null
  const explorerContractUrl = data.contractAddress ? `${explorerBase}/address/${data.contractAddress}` : null

  // Verification URL: always point to the direct verify route
  const verifyUrl = data.verificationUrl
    || `https://app.bbsns.online/verify?hash=${data.fileHash}`

  const dateStr = data.timestamp
    ? new Date(data.timestamp).toUTCString()
    : new Date().toUTCString()

  const isRevoked = !!data.revoked
  const statusLabel = isRevoked ? "REVOKED" : "VERIFIED"
  const statusColor: [number,number,number] = isRevoked ? C.revoked : C.verified

  // Short verification code (last 9 chars of hash, grouped)
  const shortHash = data.fileHash ? data.fileHash.slice(-9).toUpperCase() : "N/A"
  const verifCode = `${shortHash.slice(0,4)}-${shortHash.slice(4,8)}`

  // ── PAGE BACKGROUND ──────────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, 210, 297, "F")

  // ── WATERMARK (logo text, large, rotated, very faint) ─────────────────────
  doc.setTextColor(...C.watermark)
  doc.setFontSize(52)
  doc.setFont("helvetica", "bold")
  doc.text("BBSNS", 105, 155, { align: "center", angle: 45 } as any)

  // ── OUTER SECURITY BORDER ─────────────────────────────────────────────────
  doc.setDrawColor(...C.headerBg)
  doc.setLineWidth(1.2)
  doc.rect(8, 8, 194, 281)
  // Inner thin line
  doc.setDrawColor(...C.headerLine)
  doc.setLineWidth(0.3)
  doc.rect(10, 10, 190, 277)
  // Thin gold inner border
  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.15)
  doc.rect(11.5, 11.5, 187, 274)

  // ── HEADER BLOCK ─────────────────────────────────────────────────────────
  doc.setFillColor(...C.headerBg)
  doc.rect(8, 8, 194, 38, "F")

  // Left gold vertical accent bar
  doc.setFillColor(...C.gold)
  doc.rect(8, 8, 3.5, 38, "F")

  // Title (Left-aligned)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  doc.text("CERTIFICATE OF NOTARIZATION", 16, 20)

  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(170, 190, 220)
  doc.text("Blockchain Based Secure Notarization System  ·  BBSNS Authority", 16, 26)

  // Status Badge on the Right inside the header block
  doc.setFillColor(...statusColor)
  doc.roundedRect(156, 12, 38, 8, 1.5, 1.5, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "bold")
  doc.text(statusLabel, 175, 17.5, { align: "center" })

  // Gold divider
  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.25)
  doc.line(16, 29, 194, 29)

  // Cert ID + Format Version
  doc.setTextColor(190, 205, 230)
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text(`Certificate ID: ${certId}`, 16, 34)
  doc.text(`Format: v2.0  ·  Issued: ${dateStr}`, 194, 34, { align: "right" })

  // ── ROW 1: DOCUMENT IDENTITY (Left) & CRYPTOGRAPHIC FINGERPRINT (Right) ──
  let y = 50
  
  // Section 1: DOCUMENT IDENTITY (Left)
  drawSectionBg(doc, 14, y, 87, 24)
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.text("1  DOCUMENT IDENTITY", 17, y + 4.5)
  drawRule(doc, y + 6.5, 17, 98, C.borderGray, 0.2)

  // Document Title
  const docTitle = data.filename
  const truncTitle = docTitle.length > 30 ? docTitle.slice(0, 27) + "..." : docTitle
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(...C.labelGray)
  doc.text("Document Title", 17, y + 11.5)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.8)
  doc.setTextColor(...C.text)
  doc.text(truncTitle, 45, y + 11.5)

  // Notarization Date
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(...C.labelGray)
  doc.text("Notarization Date", 17, y + 18.5)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.2)
  doc.setTextColor(...C.text)
  doc.text(dateStr, 45, y + 18.5)

  // Section 2: CRYPTOGRAPHIC FINGERPRINT (Right)
  drawSectionBg(doc, 109, y, 87, 24)
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.text("2  CRYPTOGRAPHIC FINGERPRINT", 112, y + 4.5)
  drawRule(doc, y + 6.5, 112, 193, C.borderGray, 0.2)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(...C.labelGray)
  doc.text("SHA-256 Hash (Immutable Fingerprint)", 112, y + 11.5)
  
  doc.setFont("courier", "normal")
  doc.setFontSize(5.8)
  doc.setTextColor(...C.mutedBlue)
  doc.text(data.fileHash, 112, y + 18.5)

  // ── ROW 2: IDENTITY RECORD (Left) & BLOCKCHAIN EVIDENCE (Right) ──────────
  y = 78

  // Section 3: IDENTITY RECORD (Left)
  drawSectionBg(doc, 14, y, 87, 40)
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.text("3  IDENTITY RECORD", 17, y + 4.5)
  drawRule(doc, y + 6.5, 17, 98, C.borderGray, 0.2)

  // Owner Wallet
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Owner Wallet", 17, y + 11.5)
  doc.setFont("courier", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.text)
  doc.text(maskWallet(data.ownerWallet), 17, y + 15.5)

  // Certified Notary
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Certified Notary", 17, y + 21)
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.text)
  const notaryDisplay = data.notaryName
    ? `${data.notaryName} (${maskWallet(data.notaryWallet)})`
    : maskWallet(data.notaryWallet) || "System Assigned Notary"
  const notaryTrunc = notaryDisplay.length > 34 ? notaryDisplay.slice(0, 31) + "..." : notaryDisplay
  doc.text(notaryTrunc, 17, y + 25)

  // Network Authority
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Network Authority", 17, y + 30.5)
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.text)
  doc.text(data.chainId === 56 ? "BNB Smart Chain — Mainnet" : "BNB Smart Chain — Testnet (97)", 17, y + 34.5)

  // Section 4: BLOCKCHAIN EVIDENCE (Right)
  drawSectionBg(doc, 109, y, 87, 40)
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.text("4  BLOCKCHAIN EVIDENCE", 112, y + 4.5)
  drawRule(doc, y + 6.5, 112, 193, C.borderGray, 0.2)

  // Transaction Hash
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Transaction Hash", 112, y + 11.5)
  if (data.txHash && !["ALREADY_NOTARIZED_SYNC","ALREADY_ON_CHAIN","PENDING_USER_TX"].includes(data.txHash)) {
    doc.setFont("courier", "normal"); doc.setFontSize(5.2); doc.setTextColor(...C.mutedBlue)
    doc.text(data.txHash, 112, y + 15.5)
  } else {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.text)
    doc.text("Confirmed On-Chain (ID Unavailable)", 112, y + 15.5)
  }

  // Smart Contract Address
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Smart Contract Address", 112, y + 21)
  doc.setFont("courier", "normal"); doc.setFontSize(5.8); doc.setTextColor(...C.text)
  const activeContract = data.contractAddress || "0xD56E620AD70Bd0A4000F032383f10368418F0622"
  doc.text(activeContract, 112, y + 25)

  // Contract Explorer Link
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Blockchain Explorer", 112, y + 30.5)
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.2); doc.setTextColor(...C.mutedBlue)
  const linkText = explorerTxUrl ? "View Transaction on BscScan" : "View Contract on BscScan"
  doc.text(linkText, 112, y + 34.5)
  // Draw subtle underline for link
  doc.setDrawColor(...C.mutedBlue)
  doc.setLineWidth(0.15)
  const textWidth = doc.getTextWidth(linkText)
  doc.line(112, y + 35, 112 + textWidth, y + 35)

  // 🛡️ [Link Annotation] Make explorer link fully clickable in PDF
  const linkUrl = explorerTxUrl || (data.contractAddress ? `${explorerBase}/address/${data.contractAddress}` : `${explorerBase}/address/${activeContract}`)
  if (linkUrl) {
    doc.link(112, y + 31.5, textWidth, 4, { url: linkUrl })
  }

  // ── ROW 3: PUBLIC VERIFICATION (Left) & LIFECYCLE STATUS (Right) ──────────
  y = 122

  // Section 6: PUBLIC VERIFICATION (Left, Wider)
  drawSectionBg(doc, 14, y, 112, 48)
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.text("6  PUBLIC VERIFICATION", 17, y + 4.5)
  drawRule(doc, y + 6.5, 17, 123, C.borderGray, 0.2)

  // QR Code (Left in box)
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 1,
      width: 140,
      color: { dark: "#0f1e3c", light: "#ffffff" }
    })
    doc.addImage(qrDataUrl, "PNG", 17, y + 9, 34, 34)
    // 🛡️ Make QR Code clickable
    doc.link(17, y + 9, 34, 34, { url: verifyUrl })
  } catch (e) {
    console.error("QR generation failed", e)
  }

  // Right column inside verification box (x = 54)
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.2); doc.setTextColor(...C.headerBg)
  doc.text("Scan QR or visit direct verification URL:", 54, y + 11.5)
  
  doc.setFont("courier", "normal"); doc.setFontSize(5.2); doc.setTextColor(...C.mutedBlue)
  const urlLines = doc.splitTextToSize(verifyUrl, 68)
  doc.text(urlLines, 54, y + 15)
  // 🛡️ Make URL text block clickable
  doc.link(54, y + 12.5, 68, 7.5, { url: verifyUrl })

  doc.setFont("helvetica", "bold"); doc.setFontSize(6.2); doc.setTextColor(...C.headerBg)
  doc.text("How to Independently Verify:", 54, y + 24)
  
  const steps = [
    "1. Scan the QR code or open the link above",
    "2. Upload the original document to the portal",
    "3. The system computes SHA-256 & compares ledger",
    "4. Verify BNB Smart Chain transaction evidence",
  ]
  doc.setFont("helvetica", "normal"); doc.setFontSize(5.6); doc.setTextColor(...C.text)
  steps.forEach((step, i) => {
    doc.text(step, 54, y + 28 + i * 3.5)
  })

  // Section 5: LIFECYCLE STATUS (Right, Narrower)
  drawSectionBg(doc, 134, y, 62, 48)
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.text("5  LIFECYCLE STATUS", 137, y + 4.5)
  drawRule(doc, y + 6.5, 137, 193, C.borderGray, 0.2)

  // Status
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Status", 137, y + 11.5)
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...statusColor)
  doc.text(statusLabel, 137, y + 15.5)

  // Revoked
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Revoked", 137, y + 21)
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.text)
  doc.text(isRevoked ? "Yes" : "No", 137, y + 25)

  // Superseded By
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Superseded By", 137, y + 30.5)
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.text)
  doc.text(data.supersededBy || "None", 137, y + 34.5)

  // Verification Code
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  doc.text("Verification Code", 137, y + 40)
  doc.setFont("courier", "normal"); doc.setFontSize(7); doc.setTextColor(...C.text)
  doc.text(verifCode, 137, y + 44)

  // ── ROW 4: IMMUTABLE AUDIT STATEMENT (Full Width) ──────────────────────────
  y = 174
  drawSectionBg(doc, 14, y, 182, 34)
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "bold")
  doc.text("7  IMMUTABLE AUDIT STATEMENT", 17, y + 4.5)
  drawRule(doc, y + 6.5, 17, 193, C.borderGray, 0.2)

  const bullets = [
    "·  This certificate constitutes cryptographically verifiable evidence of the existence and notarization state of the document identified above.",
    "·  The SHA-256 hash is a one-way mathematical fingerprint. Any alteration of the original file will produce a completely different hash, invalidating this proof.",
    "·  The ledger record is permanently and immutably stored on the BNB Smart Chain. BBSNS infrastructure cannot alter or delete this record.",
    "·  This proof can be independently verified without relying on BBSNS servers using the blockchain explorer link in Section 4.",
    "·  BBSNS operates under strict cryptographic and zero-trust verification rules to ensure maximum data integrity and sovereignty."
  ]
  doc.setFont("helvetica", "normal"); doc.setFontSize(5.8); doc.setTextColor(...C.labelGray)
  bullets.forEach((bullet, i) => {
    doc.text(bullet, 17, y + 10.5 + i * 4.5)
  })

  // ── FOOTER ───────────────────────────────────────────────────────────────
  // Thin gold footer bar
  doc.setFillColor(...C.headerBg)
  doc.rect(8, 272, 194, 17, "F")
  doc.setFillColor(...C.gold)
  doc.rect(8, 272, 3.5, 17, "F")

  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(200, 215, 240)
  doc.text("BBSNS  ·  Blockchain Based Secure Notarization System", 108, 277, { align: "center" })

  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(140, 170, 210)
  doc.text(`Certificate ID: ${certId}  ·  Format v2.0  ·  Verification Code: ${verifCode}`, 108, 281.5, { align: "center" })
  doc.text("https://app.bbsns.online  ·  Independent verification available at Section 6", 108, 286, { align: "center" })

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const cleanFilename = data.filename.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  doc.save(`bbsns_certificate_${cleanFilename}_${certId}.pdf`)
}
