import { Link } from 'react-router-dom'
import { CODE_WIDGETS } from './widgetMaps'

export default function Code() {
  return (
    <main className="page">
      <div className="container widgets-page">
        <h1 className="h1">Computer Science</h1>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Memory &amp; Data Structures</h2>
        <div className="widgets-grid">
          <Link className="widget-card" to="/code/array-list">
            <div className="title-row">
              <h3>Java ArrayList — Memory Visualizer</h3>
            </div>
            <p>Native React component. See allocation, growth, and shifting as you add or remove elements from an ArrayList.</p>
            <span className="button">Open</span>
          </Link>

          <Link className="widget-card" to="/code/binary-explorer">
            <div className="title-row">
              <h3>Binary Interpretation Explorer</h3>
            </div>
            <p>Native React component. See how the exact same bits can represent integers, characters, hex values, and booleans.</p>
            <span className="button">Open</span>
          </Link>

          {['singly-linked-list', 'objects-static'].map(slug => {
            const w = CODE_WIDGETS[slug as keyof typeof CODE_WIDGETS]
            return (
              <Link key={slug} className="widget-card" to={`/code/${slug}`}>
                <div className="title-row">
                  <h3>{w.title}</h3>
                </div>
                <p>Memory visualization and data structure exploration.</p>
                <span className="button">Open</span>
              </Link>
            )
          })}
        </div>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Cryptography</h2>
        <div className="widgets-grid">
          <Link className="widget-card" to="/code/sha1-flow-explorer">
            <div className="title-row">
              <h3>SHA-1 Flow Explorer</h3>
            </div>
            <p>Native React component. Watch text turn into bits, then move through padding, chunks, 80 rounds, and the final fingerprint.</p>
            <span className="button">Open</span>
          </Link>

          <Link className="widget-card" to="/code/rsa-cracker">
            <div className="title-row">
              <h3>Cracking RSA — Period Finding &amp; Quantum Interference</h3>
            </div>
            <p>Native React component. Build a toy RSA lock, watch the powers of a random number loop back to 1, split the period to expose the primes, then see a quantum computer read the same period off an interference pattern.</p>
            <span className="button">Open</span>
          </Link>

          {['rsa-encryption', 'shamir'].map(slug => {
            const w = CODE_WIDGETS[slug as keyof typeof CODE_WIDGETS]
            return (
              <Link key={slug} className="widget-card" to={`/code/${slug}`}>
                <div className="title-row">
                  <h3>{w.title}</h3>
                </div>
                <p>Cryptography and secure computation concepts.</p>
                <span className="button">Open</span>
              </Link>
            )
          })}
        </div>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Git Internals</h2>
        <div className="widgets-grid">
          {['blob-creation', 'index-tree'].map(slug => {
            const w = CODE_WIDGETS[slug as keyof typeof CODE_WIDGETS]
            return (
              <Link key={slug} className="widget-card" to={`/code/${slug}`}>
                <div className="title-row">
                  <h3>{w.title}</h3>
                </div>
                <p>Git internals and content-addressable storage.</p>
                <span className="button">Open</span>
              </Link>
            )
          })}
        </div>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Blockchain &amp; Smart Contracts</h2>
        <div className="widgets-grid">
          <Link className="widget-card" to="/code/vyper-framework">
            <div className="title-row">
              <h3>Vyper Framework — On-chain NFTs &amp; ERC-20</h3>
            </div>
            <p>Native React dApp. Deploy Vyper contracts (NFT minter + ERC-20) and mint on-chain images from your wallet on Sepolia, Arbitrum Sepolia, mainnet, or Animechain.</p>
            <span className="button">Open</span>
          </Link>
        </div>

        <h2 className="h5 eyebrow" style={{ marginTop: '2rem' }}>Legacy Resources</h2>
        <div className="widgets-grid">
          <a className="widget-card" href="/static/code/index.html">
            <div className="title-row">
              <h3>Legacy CS Index</h3>
            </div>
            <p>Open the original static index page containing all legacy computer science widgets.</p>
            <span className="button">Open</span>
          </a>
        </div>
      </div>
    </main>
  )
}
