// Mock data for BBSNS application (pre-backend phase)

export interface User {
  id: string
  username: string
  nationalId: string
  walletAddress: string
  tokenBalance: number
}

export interface Document {
  id: string
  title: string
  status: "pending" | "verified" | "rejected"
  hash: string
  uploadDate: string
  tokenCost: number
  versions?: DocumentVersion[]
}

export interface DocumentVersion {
  id: string
  version: number
  hash: string
  uploadDate: string
  status: "pending" | "verified" | "rejected"
}

export interface NotaryApplication {
  name: string
  email: string
  phone: string
  license: string
  experience: string
}

// Mock user data
export const mockUser: User = {
  id: "1",
  username: "john_doe",
  nationalId: "123456789",
  walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
  tokenBalance: 100,
}

// Mock documents data
export const mockDocuments: Document[] = [
  {
    id: "1",
    title: "Contract Agreement.pdf",
    status: "verified",
    hash: "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd",
    uploadDate: "2024-01-15",
    tokenCost: 5,
    versions: [
      {
        id: "1-1",
        version: 1,
        hash: "0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd",
        uploadDate: "2024-01-15",
        status: "verified",
      },
    ],
  },
  {
    id: "2",
    title: "Property Deed.pdf",
    status: "pending",
    hash: "0xefgh5678901234efgh5678901234efgh5678901234efgh5678901234efgh5678",
    uploadDate: "2024-01-20",
    tokenCost: 10,
  },
  {
    id: "3",
    title: "Identity Document.jpg",
    status: "verified",
    hash: "0xijkl9012345678ijkl9012345678ijkl9012345678ijkl9012345678ijkl9012",
    uploadDate: "2024-01-18",
    tokenCost: 3,
  },
]

// Mock token options
export const tokenOptions = [
  { value: 3, label: "3 NTKR - Basic Document" },
  { value: 5, label: "5 NTKR - Standard Document" },
  { value: 10, label: "10 NTKR - Premium Document" },
  { value: 15, label: "15 NTKR - Legal Document" },
]
