interface EntityDetailLoadingProps {
  railRows?: number;
}

export function EntityDetailLoading({ railRows = 7 }: EntityDetailLoadingProps) {
  return (
    <main aria-busy="true" aria-label="Loading detail" className="pd-page">
      <div className="pd-layout entity-detail-loading">
        <aside className="pd-rail">
          <div className="pd-rail-header">
            <div className="entity-detail-loading-line entity-detail-loading-line-title" />
          </div>
          <div className="entity-detail-loading-rail-list">
            {Array.from({ length: railRows }).map((_, index) => (
              <div className="entity-detail-loading-rail-row" key={index}>
                <div className="entity-detail-loading-avatar" />
                <div className="entity-detail-loading-line" />
              </div>
            ))}
          </div>
        </aside>
        <section className="pd-entity">
          <div className="pd-entity-header entity-detail-loading-header">
            <div className="entity-detail-loading-photo" />
            <div className="entity-detail-loading-heading">
              <div className="entity-detail-loading-line entity-detail-loading-line-kicker" />
              <div className="entity-detail-loading-line entity-detail-loading-line-heading" />
              <div className="entity-detail-loading-line entity-detail-loading-line-subtitle" />
            </div>
          </div>
          <div className="pd-entity-content">
            <div className="entity-detail-loading-glance">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="entity-detail-loading-pill" key={index}>
                  <div className="entity-detail-loading-line entity-detail-loading-line-short" />
                  <div className="entity-detail-loading-line" />
                </div>
              ))}
            </div>
            <div className="pd-columns">
              <div className="pd-col-main">
                <div className="pd-card entity-detail-loading-card" />
                <div className="pd-card entity-detail-loading-card entity-detail-loading-card-tall" />
              </div>
              <div className="pd-col-side">
                <div className="pd-card entity-detail-loading-card" />
                <div className="pd-card entity-detail-loading-card" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
