import { Link } from 'react-router-dom'

export default function Econ() {
  return (
    <main className="page">
      <div className="container widgets-page">
        <h1 className="h1">Economics</h1>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Interactive Tools</h2>
        <div className="widgets-grid">
          <Link className="widget-card" to="/econ/imperfect-competitor">
            <div className="title-row">
              <h3>Imperfect Competitor</h3>
            </div>
            <p>Set output for a firm with market power and see where marginal revenue meets marginal cost.</p>
            <span className="button">Open</span>
          </Link>

          <Link className="widget-card" to="/econ/production-cost">
            <div className="title-row">
              <h3>Production Cost</h3>
            </div>
            <p>Change a firm's inputs and watch its total, average, and marginal cost curves respond.</p>
            <span className="button">Open</span>
          </Link>

          <a className="widget-card" href="/static/econ/index.html">
            <div className="title-row">
              <h3>Legacy Econ Index</h3>
            </div>
            <p>Open the original static index page.</p>
            <span className="button">Open</span>
          </a>
        </div>
      </div>
    </main>
  )
}

