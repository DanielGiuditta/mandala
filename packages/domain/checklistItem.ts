export interface ChecklistItem {
  id: string
  projectId: string
  title: string
  assignedPersonId?: string | null
  completed: boolean
  createdAt: string
  completedAt?: string | null
}

export function isChecklistItemOpen(item: ChecklistItem): boolean {
  return !item.completed
}
