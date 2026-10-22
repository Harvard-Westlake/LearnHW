import { Link } from 'react-router-dom'

export default function Chem() {
  return (
    <main className="page">
      <div className="container widgets-page">
        <h1 className="h1">Chemistry</h1>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Interactive Tools</h2>
        <div className="widgets-grid">
          <Link className="widget-card" to="/chem/crystallization">
            <div className="title-row">
              <h3>Crystallization Explorer</h3>
            </div>
            <p>Watch crystals nucleate and grow over time and see how conditions change the pattern.</p>
            <span className="button">Open</span>
          </Link>

          <a className="widget-card" href="/static/chem/index.html">
            <div className="title-row">
              <h3>Legacy Chem Index</h3>
            </div>
            <p>Open the original static index page.</p>
            <span className="button">Open</span>
          </a>
        </div>
      </div>
    </main>
  )
}

