import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Link, NavLink, Navigate, useLocation, useParams } from 'react-router-dom'
import Home from './pages/Home.tsx'
import Chem from './pages/Chem.tsx'
import Econ from './pages/Econ.tsx'
import Math from './pages/Math.tsx'
import Code from './pages/Code.tsx'
import Stats from './pages/Stats.tsx'
import InterdisciplinaryOutcomes from './pages/InterdisciplinaryOutcomes.tsx'
import Lessons from './pages/Lessons.tsx'
import TeachingResources from './pages/TeachingResources.tsx'
import StaticEmbed from './pages/StaticEmbed.tsx'
import WidgetRoute from './pages/WidgetRoute.tsx'
import { CODE_WIDGETS, HISTORY_WIDGETS, HTCS_LESSON_WIDGETS, MATH_WIDGETS, STATS_WIDGETS } from './pages/widgetMaps'
import HtcsLessons from './pages/HtcsLessons.tsx'
import History from './history/History.tsx'
import StyleGuide from './admin/StyleGuide.tsx'
import MobileFullscreen from './pages/MobileFullscreen.tsx'

// Lazy: keeps the wagmi/RainbowKit/viem bundle out of the main chunk. Only
// loads when a user opens /code/vyper-framework.
const VyperFramework = lazy(() => import('./pages/vyper-framework/VyperFramework'))

// Lazy: each HTCS deck pulls in a 1.6k–2.8k LOC slides module plus the deck
// runtime. Loading them on demand keeps them out of the main bundle.
const HtcsUnit6Day4React = lazy(() => import('./pages/HtcsUnit6Day4React.tsx'))
const HtcsUnit6Day5React = lazy(() => import('./pages/HtcsUnit6Day5React.tsx'))
const HtcsUnit6Day6React = lazy(() => import('./pages/HtcsUnit6Day6React.tsx'))

// Lazy: WorldGlobe and LectureViewer pull in globe.gl + three + three-globe
// (~1 MB minified). Keep them out of the main bundle.
const WorldGlobe = lazy(() => import('./history/WorldGlobe.tsx'))
const LectureViewer = lazy(() => import('./history/LectureViewer.tsx'))

// Lazy: each visualizer is a self-contained interactive page. Small chunks
// individually, but together they add a couple hundred KB to index.
const ArrayListVisualizer = lazy(() => import('./pages/ArrayListVisualizer.tsx'))
const BinaryExplorer = lazy(() => import('./pages/BinaryExplorer.tsx'))
const QuadraticExplorer = lazy(() => import('./pages/QuadraticExplorer.tsx'))
const Sha1FlowExplorer = lazy(() => import('./pages/Sha1FlowExplorer.tsx'))
const RsaCrackerExplorer = lazy(() => import('./pages/RsaCrackerExplorer.tsx'))
const Cryptography = lazy(() => import('./pages/overviews/Cryptography.tsx'))

function DeckLoading() {
  return (
    <main style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"Inter Tight", Helvetica, Arial, sans-serif', letterSpacing: '0.04em' }}>
      Loading slides…
    </main>
  )
}

function PageLoading() {
  return <main className="page"><div className="container">Loading…</div></main>
}

function lazyRoute(node: ReactNode, fallback: ReactNode = <PageLoading />) {
  return <Suspense fallback={fallback}>{node}</Suspense>
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 9.5L10 3L17 9.5V17H13V13H7V17H3V9.5Z" fill="currentColor" />
    </svg>
  )
}

const PAGE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/math': 'Math',
  '/code': 'Computer Science',
  '/stats': 'Statistics',
  '/chem': 'Chemistry',
  '/econ': 'Economics',
  '/history': 'History',
  '/teaching-resources': 'Teaching Resources',
  '/teaching-resources/lessons': 'Lessons',
  '/teaching-resources/lessons/computer-science': 'Computer Science Lessons',
  '/teaching-resources/lessons/interdisciplinary-outcomes': 'Interdisciplinary Outcomes',
}

function RedirectWithSearch({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function LegacyHtcsWidgetRedirect() {
  const { widget } = useParams()
  return <RedirectWithSearch to={`/teaching-resources/lessons/computer-science/${widget ?? ''}`} />
}

function TopNav() {
  const { pathname } = useLocation()
  const parentPath = pathname === '/' ? null : (pathname.slice(0, pathname.lastIndexOf('/')) || '/')
  const parentLabel = parentPath ? (PAGE_NAMES[parentPath] ?? 'Back') : null

  return (
    <header className="hw-topnav">
      <div className="container container--wide hw-topnav__inner" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NavLink to="/" end className={({ isActive }) => `hw-nav__link${isActive ? ' active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <HomeIcon />
          </NavLink>
          {parentLabel && (
            <Link to={parentPath!} className="hw-nav__link" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              ← {parentLabel}
            </Link>
          )}
        </div>
        <Link to="/" className="hw-brand" style={{ textAlign: 'center' }}>Harvard‑Westlake</Link>
        <nav className="hw-nav" style={{ justifyContent: 'flex-end' }}>
          <NavLink to="/teaching-resources" className={({ isActive }) => `hw-nav__link${isActive ? ' active' : ''}`}>Teaching Resources</NavLink>
          <NavLink to="/mobile" className={({ isActive }) => `hw-nav__link${isActive ? ' active' : ''}`}>Mobile Fullscreen</NavLink>
        </nav>
      </div>
    </header>
  )
}

export default function App() {
  const { pathname } = useLocation()
  const hideChrome = (
    (pathname.startsWith('/code/htcs-lessons/day') || pathname.startsWith('/teaching-resources/lessons/computer-science/day'))
    && pathname.endsWith('-react')
  )

  return (
    <>
      {!hideChrome ? <TopNav /> : null}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="math" element={<Math />} />
        <Route path="math/overview" element={<Navigate to="/#subject-math" replace />} />
        <Route path="math/quadratic-explorer" element={lazyRoute(<QuadraticExplorer />)} />
        <Route path="math/:widget" element={<WidgetRoute widgets={MATH_WIDGETS} backTo="/math" />} />
        <Route path="code" element={<Code />} />
        <Route path="code/overview" element={lazyRoute(<Cryptography />)} />
        <Route path="code/array-list" element={lazyRoute(<ArrayListVisualizer />)} />
        <Route path="code/binary-explorer" element={lazyRoute(<BinaryExplorer />)} />
        <Route path="code/sha1-flow-explorer" element={lazyRoute(<Sha1FlowExplorer />)} />
        <Route path="code/rsa-cracker" element={lazyRoute(<RsaCrackerExplorer />)} />
        <Route path="code/htcs-lessons" element={<RedirectWithSearch to="/teaching-resources/lessons/computer-science" />} />
        <Route path="code/htcs-lessons/day4-react" element={<RedirectWithSearch to="/teaching-resources/lessons/computer-science/day4-react" />} />
        <Route path="code/htcs-lessons/day5-react" element={<RedirectWithSearch to="/teaching-resources/lessons/computer-science/day5-react" />} />
        <Route path="code/htcs-lessons/day6-react" element={<RedirectWithSearch to="/teaching-resources/lessons/computer-science/day6-react" />} />
        <Route path="code/htcs-lessons/:widget" element={<LegacyHtcsWidgetRedirect />} />
        <Route
          path="code/vyper-framework"
          element={lazyRoute(
            <VyperFramework />,
            <main className="page"><div className="container">Loading Vyper Framework…</div></main>,
          )}
        />
        <Route path="code/:widget" element={<WidgetRoute widgets={CODE_WIDGETS} backTo="/code" />} />
        <Route path="stats" element={<Stats />} />
        <Route path="stats/overview" element={<Navigate to="/#subject-stats" replace />} />
        <Route path="stats/:widget" element={<WidgetRoute widgets={STATS_WIDGETS} backTo="/stats" />} />
        <Route path="chem" element={<Chem />} />
        <Route path="chem/overview" element={<Navigate to="/#subject-chem" replace />} />
        <Route path="chem/crystallization" element={<StaticEmbed title="Crystallization Explorer" src="/static/chem/crystallization/crystallization.html" />} />
        <Route path="econ" element={<Econ />} />
        <Route path="econ/overview" element={<Navigate to="/#subject-econ" replace />} />
        <Route path="econ/imperfect-competitor" element={<StaticEmbed title="Imperfect Competitor" src="/static/econ/widgets/imperfect-competitor/imperfect-competitor.html" />} />
        <Route path="econ/production-cost" element={<StaticEmbed title="Production Cost" src="/static/econ/widgets/production-cost/production-cost.html" />} />
        <Route path="admin" element={<StyleGuide />} />
        <Route path="mobile" element={<MobileFullscreen />} />
        <Route path="history" element={<History />} />
        <Route path="history/overview" element={<Navigate to="/#subject-history" replace />} />
        <Route path="history/world" element={lazyRoute(<WorldGlobe />, <main className="page"><div className="container">Loading globe…</div></main>)} />
        <Route path="history/lecture" element={lazyRoute(<LectureViewer />, <main className="page"><div className="container">Loading globe…</div></main>)} />
        <Route path="history/widgets/:widget" element={<WidgetRoute widgets={HISTORY_WIDGETS} backTo="/history" />} />
        <Route path="teaching-resources" element={<TeachingResources />} />
        <Route path="teaching-resources/lessons" element={<Lessons />} />
        <Route path="teaching-resources/lessons/interdisciplinary-outcomes" element={<InterdisciplinaryOutcomes />} />
        <Route path="teaching-resources/lessons/computer-science" element={<HtcsLessons />} />
        <Route path="teaching-resources/lessons/computer-science/day4-react" element={lazyRoute(<HtcsUnit6Day4React />, <DeckLoading />)} />
        <Route path="teaching-resources/lessons/computer-science/day5-react" element={lazyRoute(<HtcsUnit6Day5React />, <DeckLoading />)} />
        <Route path="teaching-resources/lessons/computer-science/day6-react" element={lazyRoute(<HtcsUnit6Day6React />, <DeckLoading />)} />
        <Route path="teaching-resources/lessons/computer-science/:widget" element={<WidgetRoute widgets={HTCS_LESSON_WIDGETS} backTo="/teaching-resources/lessons/computer-science" />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {!hideChrome ? (
        <footer className="hw-footer">
          <div className="container container--wide">
            <div className="muted">© Harvard‑Westlake · Demo UI</div>
          </div>
        </footer>
      ) : null}
    </>
  )
}
 
