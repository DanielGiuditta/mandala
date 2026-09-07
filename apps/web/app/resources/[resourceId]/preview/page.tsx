import { notFound } from "next/navigation"
import { ResourcePreview } from "../../../components/resources/resource-preview"

export default async function ResourcePreviewPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(resourceId)) notFound()
  return (
    <section className="pd-card resource-preview-page">
      <h1 className="ui-section-title">Document preview</h1>
      <p className="pd-meta-text">This is an approved viewing copy. Use the original file for editing.</p>
      <ResourcePreview resourceId={resourceId} />
    </section>
  )
}
