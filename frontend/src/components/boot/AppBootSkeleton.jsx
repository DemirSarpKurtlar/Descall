/**
 * Visible shell while the authenticated app chunk hydrates / session resolves.
 * Replaces the empty black #root that made hard navigations look crashed.
 */
export default function AppBootSkeleton({ label = "Loading Descall" }) {
  return (
    <div className="app-boot-skeleton" role="status" aria-busy="true" aria-label={label}>
      <div className="app-boot-skeleton__rail" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className="app-boot-skeleton__rail-dot" />
        ))}
      </div>
      <div className="app-boot-skeleton__sidebar" aria-hidden="true">
        <div className="app-boot-skeleton__block app-boot-skeleton__block--title" />
        <div className="app-boot-skeleton__block app-boot-skeleton__block--search" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="app-boot-skeleton__row">
            <span className="app-boot-skeleton__avatar" />
            <span className="app-boot-skeleton__lines">
              <i style={{ width: `${46 + (i % 4) * 10}%` }} />
              <i style={{ width: `${58 + (i % 3) * 8}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="app-boot-skeleton__main" aria-hidden="true">
        <div className="app-boot-skeleton__block app-boot-skeleton__block--header" />
        <div className="app-boot-skeleton__main-body">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="app-boot-skeleton__row">
              <span className="app-boot-skeleton__avatar" />
              <span className="app-boot-skeleton__lines">
                <i style={{ width: `${36 + (i % 3) * 12}%` }} />
                <i style={{ width: `${62 + (i % 4) * 7}%` }} />
                {i % 2 === 0 && <i style={{ width: `${44 + (i % 3) * 9}%` }} />}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="app-boot-skeleton__label">{label}</p>
    </div>
  );
}
