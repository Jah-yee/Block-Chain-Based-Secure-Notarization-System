export interface Document {
    id: string
    title: string
    status: "verified" | "pending" | "rejected"
    date: string
    category: string
    hash: string
    versions?: {
        id: string
        version: number
        uploadDate: string
        status: "verified" | "pending" | "rejected"
        hash: string
    }[]
}

export const mockDocuments: Document[] = [
    {
        id: "1",
        title: "Property Deed - 123 Main St",
        status: "verified",
        date: "2024-03-15",
        category: "Real Estate",
        hash: "0x7f8...3a1",
        versions: [
            {
                id: "v1",
                version: 1,
                uploadDate: "2024-03-15",
                status: "verified",
                hash: "0x7f8...3a1"
            }
        ]
    },
    {
        id: "2",
        title: "Power of Attorney",
        status: "pending",
        date: "2024-03-14",
        category: "Legal",
        hash: "0x89a...4b2",
    },
    {
        id: "3",
        title: "Vehicle Registration",
        status: "verified",
        date: "2024-03-10",
        category: "Vehicle",
        hash: "0x12c...5d3",
    },
    {
        id: "4",
        title: "Loan Agreement",
        status: "rejected",
        date: "2024-03-09",
        category: "Finance",
        hash: "0x45e...6f4",
    },
    {
        id: "5",
        title: "Birth Certificate Translation",
        status: "verified",
        date: "2024-03-01",
        category: "Personal",
        hash: "0x98f...7a5",
    },
]
