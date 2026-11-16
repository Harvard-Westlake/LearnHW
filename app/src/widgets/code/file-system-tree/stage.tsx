import type { KeyboardEvent } from 'react'
import { MAX_DEPTH, layoutTree, pathOf, restFrame, type BuildStage, type Frame, type FsNode, type FsState } from './model'

/* ============================================================
 * The picture: one dark, self-backgrounded SVG in the style of the
 * Topics lesson diagrams (monospace, #0d1117 ground, colored outlines).
 *
 *   top left   The program: the FileSystemTree and Navigator objects.
 *   top right  One object, two layers: the node being built, selected,
 *              or stood in, drawn large so both class layers have room
 *              for their fields.
 *   below      The tree. Depth grows to the right, one column per level.
 *
 * Every node is two concentric outlines: a blue FileSystemNode core
 * (name, parent) inside an orange FolderNode ring (children) or a green
 * FileNode ring (size). Colors live in secondary.css under .fs-page.
 * ============================================================ */

const WIDTH = 940
const BAND_Y = 58
const BAND_H = 84
const TREE_X = 24
const TREE_Y = 158
const TREE_W = WIDTH - TREE_X * 2
const NODE_W = 148
const NODE_H = 30
const CORE_W = 98
const COL_X0 = 44
const COL_PITCH = 176
const ROW_PITCH = 42
const ROW_PAD = 32
const MIN_ROWS = 4
const AXIS_H = 24

const TREE_BOX = { x: 24, w: 150 }
const NAV_BOX = { x: 198, w: 196 }
const INSPECT = { x: 418, w: 498, core: 284 }
const ROOT_LINK_X = 150

const COLUMNS = Array.from({ length: MAX_DEPTH + 1 }, (_, level) => level)

/** Keeps the end of a long piece of text, which is the part that changes. */
function tail(text: string, max: number): string {
  return text.length <= max ? text : '…' + text.slice(text.length - max + 1)
}

function head(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

const built = (stage: BuildStage) => stage === 'ring' || stage === 'linked'

export interface StageProps {
  fs: FsState | null
  frame: Frame | null
  selected: number | null
  onSelect: (id: number | null) => void
}

export function Stage({ fs, frame, selected, onSelect }: StageProps) {
  const view = fs ? frame ?? restFrame(fs) : null
  const layout = fs ? layoutTree(fs) : null
  const rows = Math.max(layout?.rows ?? 0, MIN_ROWS)
  const rowShift = layout ? (rows - layout.rows) / 2 : 0
  const treeH = ROW_PAD * 2 + (rows - 1) * ROW_PITCH + AXIS_H
  const height = TREE_Y + treeH + 12

  const stageOf = (id: number): BuildStage => (view?.build?.id === id ? view.build.stage : 'linked')
  const place = (id: number) => {
    const x = COL_X0 + (layout?.depth[id] ?? 0) * COL_PITCH
    const cy = TREE_Y + ROW_PAD + ((layout?.row[id] ?? 0) + rowShift) * ROW_PITCH
    return { x, y: cy - NODE_H / 2, cy }
  }
  const listed = (node: FsNode) => node.children.filter(child => stageOf(child) === 'linked')

  const nodes = fs ? Object.values(fs.nodes) : []
  const program = view?.program ?? { tree: false, rootLinked: false, navigator: false }
  const cursor = fs && view && view.cursor !== null && fs.nodes[view.cursor] ? fs.nodes[view.cursor] : null
  const cursorDepth = cursor && layout ? layout.depth[cursor.id] : -1

  /* ----- the object shown large, top right: one being built, else one you clicked, else where you are ----- */
  const building = view?.build && view.build.stage !== 'linked' ? view.build.id : null
  const inspectId = building ?? selected ?? view?.build?.id ?? view?.cursor ?? null
  const inspected = fs && inspectId !== null ? fs.nodes[inspectId] ?? null : null
  const inspectStage: BuildStage = inspected ? stageOf(inspected.id) : 'hidden'
  const inspectWhy = !inspected ? 'no object yet'
    : building !== null ? 'being built right now'
    : selected !== null ? 'the object you clicked'
    : view?.build ? 'the object that was just built'
    : 'the folder you are standing in'
  const inspectedParent = inspected && fs && inspected.parent !== null ? fs.nodes[inspected.parent] : null

  const summary = fs && cursor
    ? `File system tree with ${nodes.length} ${nodes.length === 1 ? 'object' : 'objects'}. The current folder is ${pathOf(fs, cursor.id)}.`
    : 'No file system yet. Run java Navigator in the terminal to build one.'

  const onNodeKey = (event: KeyboardEvent<SVGGElement>, id: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    onSelect(selected === id ? null : id)
  }

  return (
    <svg
      className="fs-svg"
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="group"
      aria-label={summary}
      onClick={() => onSelect(null)}
    >
      <defs>
        <marker id="fs-arrow-base" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="fs-fill--base" />
        </marker>
        <marker id="fs-arrow-folder" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="fs-fill--folder" />
        </marker>
        <marker id="fs-arrow-object" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="fs-fill--object" />
        </marker>
      </defs>

      <rect className="fs-ground" width={WIDTH} height={height} rx="10" />

      {/* ---------- The program ---------- */}
      <text className="fs-title" x={TREE_BOX.x} y="28">The program</text>
      <text className="fs-sub" x={TREE_BOX.x} y="45">java Navigator builds these two objects first</text>

      <g className={program.tree ? 'fs-obj fs-appear' : 'fs-obj fs-obj--ghost'} key={`tree-${program.tree}`}>
        <rect className="fs-obj__box" x={TREE_BOX.x} y={BAND_Y} width={TREE_BOX.w} height={BAND_H} rx="8" />
        <text className="fs-obj__name" x={TREE_BOX.x + 12} y={BAND_Y + 22}>FileSystemTree</text>
        {program.tree && (
          <>
            <text className="fs-obj__note" x={TREE_BOX.x + 12} y={BAND_Y + 39}>holds the top folder</text>
            <text className="fs-obj__field" x={ROOT_LINK_X - 10} y={BAND_Y + BAND_H - 14} textAnchor="end">root</text>
            <circle
              className={program.rootLinked ? 'fs-obj__dot' : 'fs-obj__dot fs-obj__dot--empty'}
              cx={ROOT_LINK_X} cy={BAND_Y + BAND_H - 18} r="3.5"
            />
          </>
        )}
      </g>

      <g className={program.navigator ? 'fs-obj fs-appear' : 'fs-obj fs-obj--ghost'} key={`nav-${program.navigator}`}>
        <rect className="fs-obj__box" x={NAV_BOX.x} y={BAND_Y} width={NAV_BOX.w} height={BAND_H} rx="8" />
        <text className="fs-obj__name" x={NAV_BOX.x + 12} y={BAND_Y + 22}>Navigator</text>
        {program.navigator && (
          <>
            <path className="fs-link" d={`M${NAV_BOX.x + 14},${BAND_Y + 36} H${TREE_BOX.x + TREE_BOX.w + 3}`} markerEnd="url(#fs-arrow-object)" />
            <circle className="fs-obj__dot" cx={NAV_BOX.x + 14} cy={BAND_Y + 36} r="3.5" />
            <text className="fs-obj__field" x={NAV_BOX.x + 24} y={BAND_Y + 40}>fileSystem</text>
            <text className="fs-obj__field" x={NAV_BOX.x + 12} y={BAND_Y + 58}>currentDirectory</text>
            <text
              className={cursor ? 'fs-obj__here' : 'fs-obj__note'}
              x={NAV_BOX.x + 12} y={BAND_Y + 74}
              key={cursor?.id ?? 'unset'}
            >
              {cursor && fs ? tail(pathOf(fs, cursor.id), 24) : 'not set yet'}
            </text>
          </>
        )}
      </g>

      {/* ---------- One object, two layers ---------- */}
      <text className="fs-title" x={INSPECT.x} y="28">One object, two layers</text>
      <text className="fs-sub" x={INSPECT.x} y="45">{inspectWhy}</text>

      <g key={`inspect-${inspected?.id ?? 'none'}-${inspectStage}`}>
        <rect
          className={inspected && built(inspectStage) ? `fs-ring fs-ring--${inspected.kind} fs-appear` : 'fs-ghost'}
          x={INSPECT.x} y={BAND_Y} width={INSPECT.w} height={BAND_H} rx="10"
        />
        {inspectStage !== 'call' && (
          <rect
            className={inspected && inspectStage !== 'hidden' ? `fs-core${inspectStage === 'core' ? ' fs-appear' : ''}` : 'fs-ghost'}
            x={INSPECT.x + 8} y={BAND_Y + 8} width={INSPECT.core} height={BAND_H - 16} rx="7"
          />
        )}
        {!inspected || inspectStage === 'hidden' ? (
          <>
            <text className="fs-inspect__hint" x={INSPECT.x + 8 + INSPECT.core / 2} y={BAND_Y + BAND_H / 2 + 4} textAnchor="middle">
              FileSystemNode core
            </text>
            <text className="fs-inspect__hint" x={INSPECT.x + (INSPECT.core + 8 + INSPECT.w) / 2} y={BAND_Y + BAND_H / 2 + 4} textAnchor="middle">
              FolderNode or FileNode ring
            </text>
          </>
        ) : inspectStage === 'call' ? (
          <text className="fs-inspect__hint" x={INSPECT.x + INSPECT.w / 2} y={BAND_Y + BAND_H / 2 + 4} textAnchor="middle">
            {view?.code}
          </text>
        ) : (
          <>
            <text className="fs-inspect__class fs-text--base" x={INSPECT.x + 20} y={BAND_Y + 27}>FileSystemNode</text>
            <text className="fs-inspect__field" x={INSPECT.x + 20} y={BAND_Y + 46}>
              <tspan className="fs-inspect__key">name = </tspan>"{inspected.name}"
            </text>
            <text className="fs-inspect__field" x={INSPECT.x + 20} y={BAND_Y + 63}>
              <tspan className="fs-inspect__key">parent = </tspan>
              {inspectedParent && fs ? tail(pathOf(fs, inspectedParent.id), 26) : 'null'}
            </text>
            {built(inspectStage) && (
              <>
                <text className={`fs-inspect__class fs-text--${inspected.kind}`} x={INSPECT.x + INSPECT.core + 22} y={BAND_Y + 27}>
                  {inspected.kind === 'folder' ? 'FolderNode' : 'FileNode'}
                </text>
                {inspected.kind === 'file' ? (
                  <text className="fs-inspect__field" x={INSPECT.x + INSPECT.core + 22} y={BAND_Y + 46}>
                    <tspan className="fs-inspect__key">size = </tspan>{inspected.size}
                  </text>
                ) : (
                  <>
                    <text className="fs-inspect__field" x={INSPECT.x + INSPECT.core + 22} y={BAND_Y + 46}>
                      <tspan className="fs-inspect__key">children = </tspan>
                      {listed(inspected).length ? `a list of ${listed(inspected).length}` : 'an empty list'}
                    </text>
                    <text className="fs-inspect__field fs-inspect__field--small" x={INSPECT.x + INSPECT.core + 22} y={BAND_Y + 63}>
                      {fs ? head(listed(inspected).map(id => fs.nodes[id].name).join(', '), 27) : ''}
                    </text>
                  </>
                )}
              </>
            )}
          </>
        )}
      </g>

      {/* ---------- The tree ---------- */}
      <rect className="fs-panel" x={TREE_X} y={TREE_Y} width={TREE_W} height={treeH} rx="8" />
      {COLUMNS.map(level => (
        <text
          key={level}
          className={`fs-axis${level === cursorDepth ? ' fs-axis--here' : ''}`}
          x={COL_X0 + level * COL_PITCH + NODE_W / 2} y={TREE_Y + treeH - 10} textAnchor="middle"
        >
          depth {level}
        </text>
      ))}

      {!fs && (
        <>
          <text className="fs-empty" x={WIDTH / 2} y={TREE_Y + treeH / 2 - 14} textAnchor="middle">Nothing exists yet.</text>
          <text className="fs-sub" x={WIDTH / 2} y={TREE_Y + treeH / 2 + 8} textAnchor="middle">
            In the terminal, run java Navigator to build the file system.
          </text>
        </>
      )}

      {fs && view && program.rootLinked && (
        <path
          className="fs-link fs-appear"
          d={`M${ROOT_LINK_X},${BAND_Y + BAND_H - 18} V${place(fs.root).y - 4}`}
          markerEnd="url(#fs-arrow-object)"
        />
      )}

      {/* links between a folder and the things inside it */}
      {fs && view && nodes.map(node => {
        const stage = stageOf(node.id)
        if (node.parent === null || stage === 'hidden' || stage === 'call') return null
        const from = place(node.parent)
        const to = place(node.id)
        const startX = from.x + NODE_W
        const midX = startX + (to.x - startX) / 2
        const lit = view.lit.includes(node.id) ? view.via : null
        const className = ['fs-edge', lit ? `fs-edge--${lit}` : '', stage !== 'linked' ? 'fs-edge--pending' : ''].filter(Boolean).join(' ')
        return (
          <path
            key={`${node.id}-${lit ?? 'plain'}`}
            className={className}
            d={`M${startX + (lit === 'parent' ? 3 : 0)},${from.cy} H${midX} V${to.cy} H${to.x - (lit === 'children' ? 3 : 0)}`}
            markerStart={lit === 'parent' ? 'url(#fs-arrow-base)' : undefined}
            markerEnd={lit === 'children' ? 'url(#fs-arrow-folder)' : undefined}
          />
        )
      })}

      {/* where the Navigator is standing */}
      {cursor && (
        <g className="fs-cursor" style={{ transform: `translate(${place(cursor.id).x}px, ${place(cursor.id).y}px)` }}>
          <rect className="fs-cursor__ring" x="-4" y="-4" width={NODE_W + 8} height={NODE_H + 8} rx="11" />
          <rect className="fs-cursor__tab" x="-4" y="-13" width="74" height="11" rx="3" />
          <text className="fs-cursor__label" x="33" y="-5" textAnchor="middle">you are here</text>
        </g>
      )}

      {fs && view && nodes.map(node => {
        const stage = stageOf(node.id)
        if (stage === 'hidden') return null
        const { x, y } = place(node.id)
        const glow = view.error === node.id ? 'error'
          : view.matches.includes(node.id) ? 'match'
          : view.focus.includes(node.id) ? 'visit'
          : null
        const badge = view.badges[node.id]
        const badgeW = badge ? Math.max(24, badge.length * 6.6 + 12) : 0
        const extra = node.kind === 'folder' ? `[${listed(node).length}]` : String(node.size)
        const about = node.kind === 'folder'
          ? `Folder ${pathOf(fs, node.id)}, ${listed(node).length} inside`
          : `File ${pathOf(fs, node.id)}, size ${node.size}`
        return (
          <g
            key={node.id}
            className={`fs-node${selected === node.id ? ' fs-node--selected' : ''}`}
            transform={`translate(${x},${y})`}
            role="button"
            tabIndex={0}
            aria-label={`${about}. Show this object.`}
            aria-pressed={selected === node.id}
            onClick={event => { event.stopPropagation(); onSelect(selected === node.id ? null : node.id) }}
            onKeyDown={event => onNodeKey(event, node.id)}
          >
            {glow && <rect key={`glow-${glow}`} className={`fs-glow fs-glow--${glow}`} x="-3" y="-3" width={NODE_W + 6} height={NODE_H + 6} rx="10" />}
            {built(stage)
              ? <rect key="ring" className={`fs-ring fs-ring--${node.kind}${view.build?.id === node.id && stage === 'ring' ? ' fs-appear' : ''}`} width={NODE_W} height={NODE_H} rx="8" />
              : <rect key="ghost" className="fs-ghost" width={NODE_W} height={NODE_H} rx="8" />}
            {stage !== 'call' && (
              <>
                <rect className={`fs-core${stage === 'core' ? ' fs-appear' : ''}`} x="4" y="4" width={CORE_W} height={NODE_H - 8} rx="5" />
                <text className="fs-node__name" x={4 + CORE_W / 2} y={NODE_H / 2 + 4} textAnchor="middle">{node.name}</text>
              </>
            )}
            {built(stage) && (
              <text
                key={`extra-${extra}`}
                className={`fs-node__extra fs-text--${node.kind} fs-appear`}
                x={4 + CORE_W + (NODE_W - CORE_W - 4) / 2} y={NODE_H / 2 + 4} textAnchor="middle"
              >
                {extra}
              </text>
            )}
            {badge && (
              <g key={`badge-${badge}`} className="fs-badge fs-appear">
                <rect x={NODE_W + 6 - badgeW} y="-9" width={badgeW} height="16" rx="8" />
                <text x={NODE_W + 6 - badgeW / 2} y="3" textAnchor="middle">{badge}</text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
