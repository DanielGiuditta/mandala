export interface Office {
  id: string
  name: string
  location?: string | null
  partnerPersonId?: string | null
  active: boolean
}
