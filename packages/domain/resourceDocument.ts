export interface ResourceDocument {
  id: string
  name: string
  fileUrl: string
  fileType?: string | null
  projectId?: string | null
  category?: string | null
  description?: string | null
  uploadedByPersonId?: string | null
  createdAt: string
}
