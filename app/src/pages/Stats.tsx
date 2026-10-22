import { Link } from 'react-router-dom'
import { STATS_WIDGETS } from './widgetMaps'

export default function Stats() {
  return (
    <main className="page">
      <div className="container widgets-page">
        <h1 className="h1">Statistics</h1>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Interactive Tools</h2>
        <div className="widgets-grid">
          {Object.entries(STATS_WIDGETS).map(([slug, w]) => (
            <Link key={slug} className="widget-card" to={`/stats/${slug}`}>
              <div className="title-row">
                <h3>{w.title}</h3>
              </div>
              <p>{w.blurb}</p>
              <span className="button">Open</span>
            </Link>
          ))}

          <a className="widget-card" href="/static/stats/index.html">
            <div className="title-row">
              <h3>Legacy Stats Index</h3>
            </div>
            <p>Open the original static index page.</p>
            <span className="button">Open</span>
          </a>
        </div>
      </div>
    </main>
  )
}

