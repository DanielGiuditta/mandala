import { notFound } from "next/navigation"

import { getViewerRequestContext } from "../../../lib/auth/session"
import { EntityReturnButton } from "../../components/entity-return-button"
import { PersonDetailView } from "../../components/people/person-detail-view"
import { getCachedPersonDetail } from "../data-cache"

interface PersonDetailPageProps {
  params: Promise<{
    personId: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const { personId } = await params
  const viewerContext = await getViewerRequestContext()
  const data = await getCachedPersonDetail(personId, viewerContext)

  if (data.configured && !data.person && !data.forbidden) {
    notFound()
  }

  return (
    <PersonDetailView
      data={data}
      returnControl={
        <EntityReturnButton
          className="secondary"
          fallbackHref="/people"
          label="Back to people"
          scope="people"
        />
      }
    />
  )
}
