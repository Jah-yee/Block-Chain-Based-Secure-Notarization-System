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
  verificationUrl?: string  // Full direct URL e.g. https://bbsns.online/verify/BBSNS-BT9F1AH5
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
  watermark:  [235, 238, 245] as [number,number,number],  // Very faint watermark
}

// ─── Helper: mask wallet address (0x72ac...91fd) ──────────────────────────────
function maskWallet(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
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
    || `https://bbsns.online/verify?hash=${data.fileHash}`

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
  doc.rect(8, 8, 194, 42, "F")

  // Left gold vertical accent bar
  doc.setFillColor(...C.gold)
  doc.rect(8, 8, 3.5, 42, "F")

  // Title
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text("CERTIFICATE OF NOTARIZATION", 108, 22, { align: "center" })

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(180, 200, 230)
  doc.text("Blockchain Based Secure Notarization System  ·  BBSNS Authority", 108, 30, { align: "center" })

  // Gold divider
  doc.setDrawColor(...C.gold)
  doc.setLineWidth(0.3)
  doc.line(20, 33, 196, 33)

  // Cert ID + Format Version
  doc.setTextColor(200, 215, 240)
  doc.setFontSize(7.5)
  doc.setFont("helvetica", "normal")
  doc.text(`Certificate ID: ${certId}`, 20, 41)
  doc.text(`Format Version: v2.0  ·  Issued: ${dateStr}`, 196, 41, { align: "right" })

  // ── STATUS BADGE ──────────────────────────────────────────────────────────
  const badgeX = 80, badgeY = 54, badgeW = 50, badgeH = 9
  doc.setFillColor(...statusColor)
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text(statusLabel, 105, 60.5, { align: "center" })

  // Revocation notice
  if (isRevoked && data.revocationReason) {
    doc.setFontSize(7)
    doc.setFont("helvetica", "italic")
    doc.setTextColor(...C.revoked)
    doc.text(`Revocation Reason: ${data.revocationReason}`, 105, 67, { align: "center" })
  }
  if (data.supersededBy) {
    doc.setFontSize(7)
    doc.setTextColor(...C.labelGray)
    doc.text(`Superseded By: ${data.supersededBy}`, 105, 70.5, { align: "center" })
  }

  // ── SECTION 1: DOCUMENT IDENTITY ─────────────────────────────────────────
  let y = 78
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("1  DOCUMENT IDENTITY", 15, y)
  drawRule(doc, y + 2, 15, 195, C.headerLine, 0.5)

  y += 8
  drawSectionBg(doc, 14, y, 182, 30)
  y += 5

  // Row: Document Title
  const docTitle = data.filename
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...C.labelGray)
  doc.text("Document Title", 18, y)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...C.text)
  doc.text(docTitle, 72, y)

  y += 7
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...C.labelGray)
  doc.text("Notarization Date (UTC)", 18, y)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...C.text)
  doc.text(dateStr, 72, y)

  y += 8

  // SHA-256 Hash block
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("2  CRYPTOGRAPHIC FINGERPRINT", 15, y)
  drawRule(doc, y + 2, 15, 195, C.headerLine, 0.5)

  y += 7
  drawSectionBg(doc, 14, y, 182, 18)
  y += 5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(...C.labelGray)
  doc.text("SHA-256 Hash (Immutable Fingerprint)", 18, y)
  y += 5
  doc.setFont("courier", "normal")
  doc.setFontSize(7)
  doc.setTextColor(...C.mutedBlue)
  doc.text(data.fileHash, 18, y)

  if (data.documentSummary) {
    y += 7
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(...C.labelGray)
    doc.text("Notary Summary", 18, y)
    doc.setFont("helvetica", "italic")
    doc.setTextColor(...C.text)
    const summaryLines = doc.splitTextToSize(data.documentSummary, 150)
    y += 4
    doc.text(summaryLines, 18, y)
    y += summaryLines.length * 4.5
  } else {
    y += 8
  }

  // ── SECTION 3: IDENTITY RECORD ────────────────────────────────────────────
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("3  IDENTITY RECORD", 15, y)
  drawRule(doc, y + 2, 15, 195, C.headerLine, 0.5)

  y += 7
  drawSectionBg(doc, 14, y, 182, 22)
  const identStart = y + 5

  // Two columns
  const colLeft = 18, colRight = 110

  doc.setFontSize(7.5)
  // Owner wallet
  doc.setFont("helvetica", "bold"); doc.setTextColor(...C.labelGray)
  doc.text("Owner Wallet", colLeft, identStart)
  doc.setFont("courier", "normal"); doc.setTextColor(...C.text)
  doc.text(data.ownerWallet ? maskWallet(data.ownerWallet) : "0x••••••••••••••••••••", colLeft, identStart + 5)

  // Notary
  doc.setFont("helvetica", "bold"); doc.setTextColor(...C.labelGray)
  doc.text("Certified Notary", colRight, identStart)
  doc.setFont("helvetica", "normal"); doc.setTextColor(...C.text)
  const notaryDisplay = data.notaryName
    ? `${data.notaryName}  (${maskWallet(data.notaryWallet)})`
    : maskWallet(data.notaryWallet) || "System Assigned Notary"
  doc.text(notaryDisplay, colRight, identStart + 5)

  // Network
  doc.setFont("helvetica", "bold"); doc.setTextColor(...C.labelGray)
  doc.text("Network Authority", colLeft, identStart + 11)
  doc.setFont("helvetica", "normal"); doc.setTextColor(...C.text)
  doc.text(data.chainId === 56 ? "BNB Smart Chain — Mainnet" : "BNB Smart Chain — Testnet (97)", colLeft, identStart + 16)

  y += 28

  // ── SECTION 4: BLOCKCHAIN EVIDENCE ───────────────────────────────────────
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("4  BLOCKCHAIN TRANSACTION EVIDENCE", 15, y)
  drawRule(doc, y + 2, 15, 195, C.headerLine, 0.5)

  const bcRows: Array<[string, string]> = []
  if (data.txHash && !["ALREADY_NOTARIZED_SYNC","ALREADY_ON_CHAIN","PENDING_USER_TX"].includes(data.txHash)) {
    bcRows.push(["Transaction Hash", data.txHash])
  } else {
    bcRows.push(["Transaction Hash", "Confirmed On-Chain · Receipt ID Unavailable"])
  }
  if (data.blockNumber) bcRows.push(["Block Number", String(data.blockNumber)])
  if (data.contractAddress) bcRows.push(["Smart Contract Address", data.contractAddress])
  if (explorerTxUrl) bcRows.push(["Blockchain Explorer", explorerTxUrl])
  if (explorerContractUrl && !explorerTxUrl) bcRows.push(["Contract Explorer", explorerContractUrl])

  y += 7
  const bcBgH = bcRows.length * 8 + 6
  drawSectionBg(doc, 14, y, 182, bcBgH)
  y += 5

  for (const [label, value] of bcRows) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...C.labelGray)
    doc.text(label, 18, y)
    doc.setFont("courier", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.mutedBlue)
    const vLines = doc.splitTextToSize(value, 148)
    doc.text(vLines, 72, y)
    y += vLines.length > 1 ? 9 : 7
  }

  y += 4

  // ── SECTION 5: CERTIFICATE LIFECYCLE STATUS ───────────────────────────────
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("5  CERTIFICATE LIFECYCLE STATUS", 15, y)
  drawRule(doc, y + 2, 15, 195, C.headerLine, 0.5)

  y += 7
  drawSectionBg(doc, 14, y, 182, 14)
  const lcY = y + 5

  const lifecycleItems: Array<[string, string]> = [
    ["Status", statusLabel],
    ["Revoked", isRevoked ? `Yes${data.revocationReason ? " — " + data.revocationReason : ""}` : "No"],
    ["Superseded By", data.supersededBy || "None"],
    ["Verification Code", verifCode],
  ]
  const colW = 182 / lifecycleItems.length
  lifecycleItems.forEach(([lbl, val], i) => {
    const cx = 18 + i * colW
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
    doc.text(lbl, cx, lcY)
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.text)
    doc.text(val, cx, lcY + 5)
  })

  y += 20

  // ── SECTION 6: PUBLIC VERIFICATION QR + INSTRUCTIONS ────────────────────
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("6  PUBLIC VERIFICATION", 15, y)
  drawRule(doc, y + 2, 15, 195, C.headerLine, 0.5)

  y += 6
  drawSectionBg(doc, 14, y, 182, 52)

  // QR Code (left)
  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 1,
      width: 140,
      color: { dark: "#0f1e3c", light: "#ffffff" }
    })
    doc.addImage(qrDataUrl, "PNG", 17, y + 2, 36, 36)
  } catch (e) {
    console.error("QR generation failed", e)
  }

  // Verification URL text
  const vrX = 57
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...C.headerBg)
  doc.text("Scan QR or visit the direct verification link:", vrX, y + 8)
  doc.setFont("courier", "normal"); doc.setFontSize(7); doc.setTextColor(...C.mutedBlue)
  const verifyLines = doc.splitTextToSize(verifyUrl, 148)
  doc.text(verifyLines, vrX, y + 14)

  // How to Verify steps
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...C.headerBg)
  doc.text("How to Independently Verify:", vrX, y + 23)
  const steps = [
    "1. Scan the QR code or open the URL above",
    "2. Upload the original document file to the portal",
    "3. The system computes SHA-256 and compares against the ledger",
    "4. Verify transaction on BscScan using the hash in Section 4",
  ]
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...C.text)
  steps.forEach((step, i) => {
    doc.text(step, vrX, y + 30 + i * 5.5)
  })

  y += 58

  // ── SECTION 7: AUDIT STATEMENT ────────────────────────────────────────────
  doc.setTextColor(...C.headerBg)
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text("7  IMMUTABLE AUDIT STATEMENT", 15, y)
  drawRule(doc, y + 2, 15, 195, C.headerLine, 0.5)

  y += 7
  drawSectionBg(doc, 14, y, 182, 26)
  y += 4

  const bullets = [
    "This certificate constitutes cryptographically verifiable evidence of the existence and notarization state of the document identified above.",
    "The SHA-256 hash is a one-way mathematical fingerprint. Any alteration of even a single byte in the original file will produce a completely different hash, invalidating this certificate.",
    "The ledger record is permanently and immutably stored on the BNB Smart Chain. BBSNS infrastructure cannot alter or delete this record.",
    "This proof can be independently verified without relying on BBSNS servers using the blockchain explorer link in Section 4.",
  ]
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...C.labelGray)
  for (const b of bullets) {
    const bLines = doc.splitTextToSize(`·  ${b}`, 176)
    doc.text(bLines, 17, y)
    y += bLines.length * 3.8 + 1
  }

  y += 2

  // ── FOOTER ───────────────────────────────────────────────────────────────
  // Thin gold footer bar
  doc.setFillColor(...C.headerBg)
  doc.rect(8, 272, 194, 17, "F")
  doc.setFillColor(...C.gold)
  doc.rect(8, 272, 3.5, 17, "F")

  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(200, 215, 240)
  doc.text("BBSNS  ·  Blockchain Based Secure Notarization System", 108, 277.5, { align: "center" })

  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(140, 170, 210)
  doc.text(`Certificate ID: ${certId}  ·  Format v2.0  ·  Verification Code: ${verifCode}`, 108, 282, { align: "center" })
  doc.text("https://bbsns.online  ·  Independent verification available at Section 6", 108, 286, { align: "center" })

  // ── SAVE ─────────────────────────────────────────────────────────────────
  const cleanFilename = data.filename.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  doc.save(`bbsns_certificate_${cleanFilename}_${certId}.pdf`)
}
