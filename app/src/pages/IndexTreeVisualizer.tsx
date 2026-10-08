import { useCallback, useEffect, useRef, useState } from 'react'
import { WidgetShell } from '../components/widget'

/* ============================================================
 * Index → Tree Visualizer
 * Turns a flat Git-style index (<SHA1> <path>) into simplified tree files,
 * bottom-up, one directory at a time. Each tree's hash is the SHA-1 of its
 * plain text (no Git headers), matching the Topics GitProject Part 3 spec.
 * Native port of /static/code/widgets/index-tree/index-tree.html.
 * ============================================================ */

type IndexEntry = { sha: string; path: string }

type BlobNode = { kind: 'blob'; name: string; path: string; sha: string }
type DirNode = {
  kind: 'dir'
  name: string
  path: string            // '' = root
  children: Map<string, TreeNode>
  built: boolean          // true once its tree file exists
  hash: string
  content: string         // the tree file's text
}
type TreeNode = BlobNode | DirNode

type WorkingLine = { line: string; label: string; kind: 'blob' | 'tree' }
type TreeFileView = { header: string; content: string }

const BUILD_DELAY_MS = 650
const ROOT_LABEL = '(root)'

const EXAMPLES: { title: string; text: string }[] = [
  {
    title: 'Simple: 3 files, one nested folder',
    text: `4a5d9f8b10c2de34567890abcdef1234567890ab src/docs/README.txt
abcdefabcdefabcdefabcdefabcdefabcdefabcd apples/info.ini
1111111111111111111111111111111111111111 drive.txt`,
  },
  {
    title: 'Medium: 6 files, two folders with subfolders',
    text: `7075f3893621d63647497ff769be0794cd7eda70 notes.txt
6a2b9771f2724ab95737e2b0177c2ddc1e88888c src/main.py
b67a5e9161d89e337c55981f609edfaff30e91db src/utils.py
b3f2b34a231c4b9c624bc62d58f4bbba5d891e44 src/lib/parser.py
d6bd364586d0af2aac0650aac02c4afed169f4f1 docs/guide.md
e472f272387d86612ce7adb5a57f6408a8ea7bd3 docs/img/logo.png`,
  },
  {
    title: 'Complex: 12 files, four levels deep',
    text: `bf813b050eae9d21e1440fab6972860616b7cb70 README.md
71f40b3fd0752f51bea42ff0f1638a404ccf7b85 src/app/main.py
83838c0c201ae4d04a0be53dad68751ced460b76 src/app/config.py
c2df870bb143c5a4eb4da6aec863edf7726a0c72 src/app/models/user.py
c06862201f47ce026f1d1fe9bae57503db74319a src/app/models/post.py
1444b0dd5e955e4afdef369402ee9819afe976cd src/app/views/home.py
316e24f322aa7c60df7fb289075ac1f42a34897a src/tests/test_user.py
3f61423d504e3358bd1eb22b8a1acbd9c1d562ca src/tests/fixtures/users.json
597dfb67f3db7d2dde4f93f9e4b28be82137a4be assets/css/style.css
eb2dfdb097a5aea6993b4eead0b7ae6bbc80327d assets/js/app.js
1a7445ada760f78014026b4fabe5333e0cfb5e78 docs/api/endpoints.md
d6bd364586d0af2aac0650aac02c4afed169f4f1 docs/guide.md`,
  },
]

/* ---------- SHA-1 of a plain string ---------- */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

// Synchronous fallback for insecure contexts (e.g. `vite --host` on a LAN IP),
// where crypto.subtle is unavailable.
function sha1Sync(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const byteLength = bytes.length
  const paddedLength = (((byteLength + 8) >> 6) + 1) << 6
  const words = new Uint32Array(paddedLength >> 2)
  for (let index = 0; index < byteLength; index++) words[index >> 2] |= bytes[index] << (24 - (index & 3) * 8)
  words[byteLength >> 2] |= 0x80 << (24 - (byteLength & 3) * 8)
  words[words.length - 2] = Math.floor((byteLength * 8) / 0x100000000) >>> 0
  words[words.length - 1] = (byteLength * 8) >>> 0

  const rotl = (value: number, bits: number) => ((value << bits) | (value >>> (32 - bits))) >>> 0
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const schedule = new Uint32Array(80)

  for (let block = 0; block < words.length; block += 16) {
    for (let round = 0; round < 16; round++) schedule[round] = words[block + round]
    for (let round = 16; round < 80; round++) {
      schedule[round] = rotl(schedule[round - 3] ^ schedule[round - 8] ^ schedule[round - 14] ^ schedule[round - 16], 1)
    }
    let [a, b, c, d, e] = state
    for (let round = 0; round < 80; round++) {
      let mix: number
      let constant: number
      if (round < 20) { mix = (b & c) | (~b & d); constant = 0x5a827999 }
      else if (round < 40) { mix = b ^ c ^ d; constant = 0x6ed9eba1 }
      else if (round < 60) { mix = (b & c) | (b & d) | (c & d); constant = 0x8f1bbcdc }
      else { mix = b ^ c ^ d; constant = 0xca62c1d6 }
      const next = (rotl(a, 5) + (mix >>> 0) + e + constant + schedule[round]) >>> 0
      e = d; d = c; c = rotl(b, 30); b = a; a = next
    }
    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
  }
  return state.map(word => word.toString(16).padStart(8, '0')).join('')
}

async function sha1Hex(text: string): Promise<string> {
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
      return toHex(new Uint8Array(digest))
    }
  } catch { /* fall through to the sync implementation */ }
  return sha1Sync(text)
}

/* ---------- Index parsing + directory model ---------- */

function normalizePath(path: string): string {
  return path.replace(/^\/*/, '').replace(/\/+/g, '/').replace(/\/$/, '')
}

function parseIndex(text: string): { entries: IndexEntry[]; errors: string[] } {
  const entries: IndexEntry[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((raw, lineIndex) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const match = line.match(/^(\S+)\s+(.+)$/)
    if (!match) { errors.push(`Line ${lineIndex + 1}: could not parse → ${raw}`); return }
    entries.push({ sha: match[1], path: normalizePath(match[2]) })
  })
  return { entries, errors }
}

function newDir(name: string, path: string): DirNode {
  return { kind: 'dir', name, path, children: new Map(), built: false, hash: '', content: '' }
}

function buildDirTree(entries: IndexEntry[]): DirNode {
  const root = newDir(ROOT_LABEL, '')
  const dirs = new Map<string, DirNode>([['', root]])
  for (const { sha, path } of entries) {
    const parts = path.split('/')
    const fileName = parts.pop()!
    let parent = root
    let dirPath = ''
    for (const part of parts) {
      dirPath = dirPath ? `${dirPath}/${part}` : part
      let dir = dirs.get(dirPath)
      if (!dir) {
        dir = newDir(part, dirPath)
        dirs.set(dirPath, dir)
        parent.children.set(part, dir)
      }
      parent = dir
    }
    parent.children.set(fileName, { kind: 'blob', name: fileName, path: dirPath ? `${dirPath}/${fileName}` : fileName, sha })
  }
  return root
}

const sortedChildren = (dir: DirNode): TreeNode[] =>
  [...dir.children.keys()].sort((left, right) => left.localeCompare(right)).map(name => dir.children.get(name)!)

const depthOf = (path: string) => (path ? path.split('/').length : 0)
const labelOf = (node: TreeNode) => node.path || ROOT_LABEL

/** The deepest unbuilt directory whose subdirectories are all built already. */
function pickNextDir(root: DirNode): DirNode | null {
  const ready: DirNode[] = []
  const visit = (dir: DirNode) => {
    for (const child of dir.children.values()) if (child.kind === 'dir') visit(child)
    const waiting = [...dir.children.values()].some(child => child.kind === 'dir' && !child.built)
    if (!dir.built && !waiting) ready.push(dir)
  }
  visit(root)
  if (!ready.length) return null
  ready.sort((left, right) => depthOf(right.path) - depthOf(left.path) || left.path.localeCompare(right.path))
  return ready[0]
}

/** Writes one directory's tree file: its direct children, sorted, final names only. */
async function buildTreeFile(dir: DirNode): Promise<void> {
  const lines = sortedChildren(dir).map(child => {
    if (child.kind === 'blob') return `blob ${child.sha} ${child.name}`
    if (!child.built) throw new Error(`Subdirectory ${child.path} is not built yet`)
    return `tree ${child.hash} ${child.name}`
  })
  dir.content = lines.join('\n')
  dir.hash = await sha1Hex(dir.content)
  dir.built = true
}

function workingList(node: TreeNode, out: WorkingLine[] = []): WorkingLine[] {
  if (node.kind === 'blob') out.push({ line: `blob ${node.sha} ${node.path}`, label: node.path, kind: 'blob' })
  else if (node.built) out.push({ line: `tree ${node.hash} ${labelOf(node)}`, label: labelOf(node), kind: 'tree' })
  else for (const child of sortedChildren(node)) workingList(child, out)
  return out
}

function treeFileOf(dir: DirNode): TreeFileView {
  return { header: `tree ${dir.hash} ${labelOf(dir)}`, content: dir.content || '[empty tree]' }
}

const shortHash = (hash: string) => (hash.length >= 8 ? `${hash.slice(0, 8)}…` : hash)

/** Scroll `target` into view inside its own scroll box, never scrolling the page. */
function revealWithin(container: HTMLElement | null, target: Element | null) {
  if (!container || !target) return
  const box = container.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  const pad = 8
  if (rect.top < box.top + pad) container.scrollTop -= box.top + pad - rect.top
  else if (rect.bottom > box.bottom - pad) container.scrollTop += rect.bottom - (box.bottom - pad)
}

/* ---------- Tree view ---------- */

type TreeItemProps = {
  node: TreeNode
  newPath: string | null
  inspectedPath: string | null
  onInspect: (node: TreeNode) => void
}

function TreeItem({ node, newPath, inspectedPath, onInspect }: TreeItemProps) {
  const label = labelOf(node)
  const classes = [
    'it-node',
    node.kind === 'blob' ? 'it-node--blob' : node.built ? 'it-node--tree' : 'it-node--pending',
    node.kind === 'dir' && label === newPath ? 'it-node--new' : '',
    label === inspectedPath ? 'it-node--inspected' : '',
  ].filter(Boolean).join(' ')
  const meta = node.kind === 'blob' ? `blob ${shortHash(node.sha)}` : node.built ? `tree ${shortHash(node.hash)}` : 'dir'

  return (
    <li>
      <button
        type="button"
        className={classes}
        onMouseEnter={() => onInspect(node)}
        onFocus={() => onInspect(node)}
        onClick={() => onInspect(node)}
        aria-pressed={label === inspectedPath}
      >
        <span className={node.kind === 'dir' ? 'it-node__name it-node__name--dir' : 'it-node__name'}>{node.name}</span>
        <span className="it-node__meta">{meta}</span>
      </button>
      {node.kind === 'dir' && node.children.size > 0 && (
        <ul className="it-tree">
          {sortedChildren(node).map(child => (
            <TreeItem key={child.name} node={child} newPath={newPath} inspectedPath={inspectedPath} onInspect={onInspect} />
          ))}
        </ul>
      )}
    </li>
  )
}

function NodeFile({ node }: { node: TreeNode | null }) {
  if (!node) return <p className="helper-text" style={{ margin: 0 }}>Hover, click, or Tab to a node to see its file.</p>
  if (node.kind === 'blob') {
    return (
      <>
        <div className="it-out-label">Details</div>
        <pre className="code-block it-code">{`blob ${node.sha} ${node.path}`}</pre>
        <p className="helper-text" style={{ margin: '.4rem 0 0' }}>A blob's contents are the original file; the index only carries its hash.</p>
      </>
    )
  }
  if (!node.built) {
    return (
      <p className="helper-text" style={{ margin: 0 }}>
        <code>{labelOf(node)}</code> is still pending. Build it to see its tree file.
      </p>
    )
  }
  const file = treeFileOf(node)
  return (
    <div className="it-out-grid">
      <div>
        <div className="it-out-label">Details</div>
        <pre className="code-block it-code">{file.header}</pre>
      </div>
      <div>
        <div className="it-out-label">Content</div>
        <pre className="code-block it-code">{file.content}</pre>
      </div>
    </div>
  )
}

function TreeFileOutput({ file, emptyHeader }: { file: TreeFileView | null; emptyHeader: string }) {
  return (
    <div className="it-out-grid">
      <div>
        <div className="it-out-label">Details</div>
        <pre className="code-block it-code">{file ? file.header : emptyHeader}</pre>
      </div>
      <div>
        <div className="it-out-label">Content</div>
        <pre className="code-block it-code">{file ? file.content : '(none)'}</pre>
      </div>
    </div>
  )
}

/* ---------- Page ---------- */

export default function IndexTreeVisualizer() {
  const [indexText, setIndexText] = useState('')
  const [activeExample, setActiveExample] = useState(-1)
  const [errors, setErrors] = useState<string[]>([])
  const [entries, setEntries] = useState<IndexEntry[]>([])
  const [root, setRoot] = useState<DirNode | null>(null)
  const [, setRevision] = useState(0)            // bumps after in-place tree mutations
  const [newPath, setNewPath] = useState<string | null>(null)
  const [inspected, setInspected] = useState<TreeNode | null>(null)
  const [sortedPreview, setSortedPreview] = useState<string | null>(null)
  const [recent, setRecent] = useState<TreeFileView | null>(null)
  const [flash, setFlash] = useState({ sorted: 0, recent: 0, root: 0 })
  const [autoRunning, setAutoRunning] = useState(false)
  const [status, setStatus] = useState('Load an index to begin.')
  const [showExplain, setShowExplain] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const rootRef = useRef<DirNode | null>(null)
  const autoRef = useRef(false)
  const treeViewRef = useRef<HTMLDivElement>(null)
  const workingRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const previous = document.title
    document.title = 'Index → Tree Visualizer · Class Resources'
    return () => { document.title = previous; autoRef.current = false }
  }, [])

  const loadIndex = useCallback((text: string) => {
    autoRef.current = false
    setAutoRunning(false)
    const parsed = parseIndex(text)
    if (parsed.errors.length) { setErrors(parsed.errors); setStatus(`${parsed.errors.length} line(s) could not be parsed.`); return }
    if (!parsed.entries.length) { setErrors(['No entries found.']); setStatus('No entries found.'); return }
    const tree = buildDirTree(parsed.entries)
    rootRef.current = tree
    setErrors([])
    setEntries(parsed.entries)
    setRoot(tree)
    setNewPath(null)
    setInspected(null)
    setRecent(null)
    setSortedPreview(sortByPath(parsed.entries))
    setStatus(`Loaded ${parsed.entries.length} index entr${parsed.entries.length === 1 ? 'y' : 'ies'}. Build the deepest directory first.`)
  }, [])

  const loadExample = useCallback((exampleIndex: number) => {
    const text = EXAMPLES[exampleIndex].text
    setIndexText(text)
    setActiveExample(exampleIndex)
    loadIndex(text)
  }, [loadIndex])

  useEffect(() => { loadExample(0) }, [loadExample])

  const reset = () => {
    autoRef.current = false
    rootRef.current = null
    setAutoRunning(false)
    setIndexText('')
    setActiveExample(-1)
    setErrors([])
    setEntries([])
    setRoot(null)
    setNewPath(null)
    setInspected(null)
    setRecent(null)
    setSortedPreview(null)
    setStatus('Load an index to begin.')
  }

  const buildNext = useCallback(async (): Promise<boolean> => {
    const tree = rootRef.current
    if (!tree) return false
    const dir = pickNextDir(tree)
    if (!dir) { setStatus('Nothing left to build — the root is already a tree.'); return false }
    await buildTreeFile(dir)
    if (rootRef.current !== tree) return false  // reset or reloaded mid-build
    const label = labelOf(dir)
    setNewPath(label)
    setInspected(dir)
    setRecent(treeFileOf(dir))
    setRevision(revision => revision + 1)
    setFlash(previous => ({ ...previous, recent: previous.recent + 1, root: tree.built ? previous.root + 1 : previous.root }))
    setStatus(tree.built
      ? `Built ${label}. Done — the root is a tree, and its hash is what a commit stores.`
      : `Built ${label} and collapsed its entries into one tree line.`)
    return !tree.built
  }, [])

  const autoBuild = async () => {
    if (!rootRef.current || autoRef.current) return
    autoRef.current = true
    setAutoRunning(true)
    try {
      while (autoRef.current && await buildNext()) {
        await new Promise(resolve => setTimeout(resolve, BUILD_DELAY_MS))
      }
    } catch (error) {
      setStatus('Error during auto-build.')
      console.error(error)
    }
    autoRef.current = false
    setAutoRunning(false)
  }

  const stopAuto = () => {
    if (!autoRef.current) return
    autoRef.current = false
    setAutoRunning(false)
    setStatus('Stopped.')
  }

  const sortPreview = () => {
    if (!entries.length) return
    setSortedPreview(sortByPath(entries))
    setFlash(previous => ({ ...previous, sorted: previous.sorted + 1 }))
  }

  const onDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    file.text().then(
      text => { setIndexText(text); setActiveExample(-1) },
      () => setErrors(['Failed to read the dropped file.']),
    )
  }

  // Keep the freshly built node and working-list line visible inside their own boxes.
  useEffect(() => {
    revealWithin(treeViewRef.current, treeViewRef.current?.querySelector('.it-node--new') ?? null)
    revealWithin(workingRef.current, workingRef.current?.querySelector('.it-mark') ?? null)
  })

  const loaded = !!root
  const done = !!root?.built
  const nextDir = root && !done ? pickNextDir(root) : null
  const lines = root ? workingList(root) : []
  const textRows = Math.max(3, Math.min(12, indexText.split('\n').length))

  const stepActive = {
    sort: loaded && !done && !newPath,
    next: loaded && !done && !!newPath && !autoRunning,
    auto: autoRunning,
  }

  return (
    <main className="page it-page">
      <div className="container container--wide">

        <section className="it-hero">
          <div className="eyebrow">Computer Science Explorer · Git Internals</div>
          <h1 className="h2 it-hero__title">Index → <code>tree</code> Files</h1>
          <p className="lead it-hero__lead">
            Paste an index, then build tree files bottom-up, one directory at a time. Each tree's hash is the
            SHA-1 of its plain text — no Git headers.
          </p>
        </section>

        <WidgetShell
          controls={
            <>
              <section className="panel">
                <div className="widget-panel__head"><div className="eyebrow">Load an example</div></div>
                <div className="segment-group it-examples" role="group" aria-label="Load example index">
                  {EXAMPLES.map((example, exampleIndex) => (
                    <button
                      key={example.title}
                      type="button"
                      className={`segment${activeExample === exampleIndex ? ' active' : ''}`}
                      title={example.title}
                      aria-pressed={activeExample === exampleIndex}
                      onClick={() => loadExample(exampleIndex)}
                    >
                      {['Simple', 'Medium', 'Complex'][exampleIndex]}
                    </button>
                  ))}
                </div>
                <p className="helper-text" style={{ margin: '.5rem 0 0' }}>
                  {activeExample >= 0 ? EXAMPLES[activeExample].title : 'Custom index.'}
                </p>
              </section>

              <section className="panel">
                <div className="widget-panel__head"><div className="eyebrow">The 3 conversion steps</div></div>
                <div className="it-steps">
                  <div className={`it-step${stepActive.sort ? ' it-step--active' : ''}`}>
                    <div className="it-step__title"><span className="it-step__num">1</span>Sort by path</div>
                    <p className="helper-text">Lexicographic path order groups each directory's entries.</p>
                    <button type="button" className="btn btn--outline btn--sm" onClick={sortPreview} disabled={!loaded}>
                      Sort &amp; preview
                    </button>
                  </div>
                  <div className={`it-step${stepActive.next ? ' it-step--active' : ''}`}>
                    <div className="it-step__title"><span className="it-step__num">2</span>Create the <em>next</em> leaf-most tree</div>
                    <p className="helper-text">
                      Next up: {!loaded ? 'load an index first.' : done ? 'nothing — the root is a tree.' : <code>{nextDir ? labelOf(nextDir) : '—'}</code>}
                    </p>
                    <button type="button" className="btn btn--sm" onClick={() => { void buildNext() }} disabled={!loaded || done || autoRunning}>
                      Create next tree
                    </button>
                  </div>
                  <div className={`it-step${stepActive.auto ? ' it-step--active' : ''}`}>
                    <div className="it-step__title"><span className="it-step__num">3</span>Run to completion</div>
                    <p className="helper-text">Repeats step 2 until the root is a tree.</p>
                    <div className="it-btn-row">
                      <button type="button" className="btn btn--outline btn--sm" onClick={() => { void autoBuild() }} disabled={!loaded || done || autoRunning}>
                        Auto-build all
                      </button>
                      <button type="button" className="btn btn--outline btn--sm" onClick={stopAuto} disabled={!autoRunning}>
                        Stop
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <button type="button" className="btn btn--outline btn--sm btn--block" onClick={() => setShowExplain(true)}>
                How the conversion works
              </button>
            </>
          }
        >
          <div className="it-main">
            <section className="panel">
              <div className="widget-panel__head it-panel-head">
                <label className="eyebrow" htmlFor="it-index-input" style={{ margin: 0 }}>
                  Index file · one entry per line: <code>&lt;SHA1&gt; &lt;path&gt;</code>
                </label>
                <div className="it-btn-row">
                  <button type="button" className="btn btn--sm" onClick={() => loadIndex(indexText)}>Show tree structure</button>
                  <button type="button" className="btn btn--outline btn--sm" onClick={reset}>Reset</button>
                </div>
              </div>
              <textarea
                id="it-index-input"
                className={`textarea it-textarea${dragOver ? ' it-textarea--drop' : ''}`}
                rows={textRows}
                wrap="off"
                spellCheck={false}
                placeholder={'e.g.\nf5c3b5f5e0d9b2c0f1a2345678901234567890ab src/docs/README.txt\n2222222222222222222222222222222222222222 drive.txt'}
                value={indexText}
                onChange={event => { setIndexText(event.target.value); setActiveExample(-1) }}
                onDragOver={event => { event.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              />
              <p className="helper-text" style={{ margin: '.4rem 0 0' }}>Tip: drop a text file onto the box instead of pasting.</p>
              {errors.length > 0 && (
                <div className="alert alert--warning it-errors" role="alert">
                  <div>{errors.map(error => <div key={error}>{error}</div>)}</div>
                </div>
              )}
            </section>

            <div className={`alert ${done ? 'alert--success' : 'alert--info'}`} aria-live="polite">{status}</div>

            <section className="panel">
              <div className="widget-panel__head it-panel-head">
                <div className="eyebrow">Working list</div>
                {loaded && (done
                  ? <span className="badge badge--accent">Root is a tree</span>
                  : <span className="badge badge--neutral">Root pending</span>)}
              </div>
              <pre ref={workingRef} className="code-block it-code it-code--tall">
                {lines.length ? lines.map((entry, lineIndex) => (
                  <span key={entry.label}>
                    {lineIndex > 0 && '\n'}
                    {entry.kind === 'tree' && entry.label === newPath ? <mark className="it-mark">{entry.line}</mark> : entry.line}
                  </span>
                )) : '(empty)'}
              </pre>
              <p className="helper-text" style={{ margin: '.4rem 0 0' }}>
                Starts as every blob path in the index. Each tree you create replaces its children with one{' '}
                <code>tree &lt;hash&gt; &lt;dirname&gt;</code> line. Done when only the root remains.
              </p>
            </section>

            <section className="panel">
              <div className="widget-panel__head it-panel-head">
                <div className="eyebrow">Tree visualization</div>
                <div className="legend-key" aria-label="Node key">
                  <span className="legend-key__item"><span className="legend-key__dot it-dot--blob" />Blob</span>
                  <span className="legend-key__item"><span className="legend-key__dot it-dot--tree" />Tree</span>
                  <span className="legend-key__item"><span className="legend-key__dot it-dot--pending" />Pending directory</span>
                </div>
              </div>
              <div className="it-tree-grid">
                <div ref={treeViewRef} className="it-treeview">
                  {root
                    ? <ul className="it-tree it-tree--root"><TreeItem node={root} newPath={newPath} inspectedPath={inspected ? labelOf(inspected) : null} onInspect={setInspected} /></ul>
                    : <p className="helper-text" style={{ margin: 0 }}>Load an index and choose <b>Show tree structure</b>.</p>}
                </div>
                <div className="it-inspector">
                  <div className="it-out-label">{inspected ? `Selected · ${labelOf(inspected)}` : 'Selected node'}</div>
                  <NodeFile node={inspected} />
                </div>
              </div>
            </section>

            <section key={`sorted-${flash.sorted}`} className={`panel${flash.sorted ? ' it-flash' : ''}`}>
              <div className="widget-panel__head"><div className="eyebrow">Step 1 · Sorted index</div></div>
              <pre className="code-block it-code">{sortedPreview ?? '(none)'}</pre>
            </section>

            <section key={`recent-${flash.recent}`} className={`panel${flash.recent ? ' it-flash' : ''}`}>
              <div className="widget-panel__head"><div className="eyebrow">Step 2 · Most recent tree</div></div>
              <TreeFileOutput file={recent} emptyHeader="(none yet)" />
            </section>

            <section key={`root-${flash.root}`} className={`panel${flash.root ? ' it-flash' : ''}`}>
              <div className="widget-panel__head"><div className="eyebrow">Step 3 · Final root tree</div></div>
              <TreeFileOutput file={done && root ? treeFileOf(root) : null} emptyHeader="(not yet built)" />
            </section>
          </div>
        </WidgetShell>
      </div>

      {showExplain && (
        <div className="popup-overlay" role="presentation" onClick={() => setShowExplain(false)}>
          <section
            className="panel popup popup--sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="it-modal-title"
            onClick={event => event.stopPropagation()}
            onKeyDown={event => { if (event.key === 'Escape') setShowExplain(false) }}
          >
            <div className="popup__header">
              <div className="eyebrow" id="it-modal-title">How the conversion works</div>
              <button type="button" className="btn btn--outline btn--sm popup__close" autoFocus onClick={() => setShowExplain(false)}>Close</button>
            </div>
            <div className="stack-xs" style={{ fontSize: '.9rem' }}>
              <div className="eyebrow">GOAL</div>
              <p className="muted">
                From a flat index of blobs (<code>&lt;SHA1&gt; &lt;path&gt;</code>), create one <em>tree file</em> per
                directory listing its immediate children in sorted order:
              </p>
              <pre className="code-block it-code">{'blob <SHA1> <filename>\ntree <SHA1> <dirname>'}</pre>
              <div className="eyebrow" style={{ marginTop: '.5rem' }}>HASHING</div>
              <p className="muted">
                Each tree file is hashed as the SHA-1 of its plain text, with no Git headers or modes. A tree's hash
                depends only on its exact lines and their order, so the same index always gives the same hashes.
              </p>
              <div className="eyebrow" style={{ marginTop: '.5rem' }}>BOTTOM-UP</div>
              <p className="muted">
                A parent's tree file contains each subdirectory's hash, which only exists once that subdirectory's
                tree file is written. So the deepest directory whose subdirectories are all built goes first.
              </p>
              <div className="eyebrow" style={{ marginTop: '.5rem' }}>COLLAPSE</div>
              <p className="muted">
                After a directory's tree file is written, all of its entries in the working list are replaced by one{' '}
                <code>tree &lt;SHA1&gt; &lt;dirpath&gt;</code> line. Repeat until only the root remains — the root
                tree's hash is what a commit stores.
              </p>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function sortByPath(entries: IndexEntry[]): string {
  return entries
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(entry => `${entry.sha} ${entry.path}`)
    .join('\n')
}
