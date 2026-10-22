import { Link } from 'react-router-dom'
import { MATH_WIDGETS } from './widgetMaps'

export default function Math() {
  return (
    <main className="page">
      <div className="container widgets-page">
        <h1 className="h1">Math</h1>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Classes</h2>
        <div className="widgets-grid">
          {['Algebra 2', 'Precalculus', 'Calculus'].map(name => (
            <div key={name} className="widget-card" style={{ opacity: 0.5, cursor: 'default', pointerEvents: 'none' }}>
              <div className="title-row">
                <h3>{name}</h3>
              </div>
              <p>Lesson materials and resources for the {name} course.</p>
              <span className="button" style={{ background: 'var(--hw-secondary-khaki)', color: 'var(--hw-brand-black)' }}>Coming Soon</span>
            </div>
          ))}
        </div>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Interactive Tools</h2>
        <div className="widgets-grid">
          {Object.entries(MATH_WIDGETS).map(([slug, w]) => (
            <Link key={slug} className="widget-card" to={`/math/${slug}`}>
              <div className="title-row">
                <h3>{w.title}</h3>
              </div>
              <p>{w.blurb}</p>
              <span className="button">Open</span>
            </Link>
          ))}

          <a className="widget-card" href="/static/math/index.html">
            <div className="title-row">
              <h3>Legacy Math Index</h3>
            </div>
            <p>Open the original static index page.</p>
            <span className="button">Open</span>
          </a>
        </div>
      </div>
    </main>
  )
}
