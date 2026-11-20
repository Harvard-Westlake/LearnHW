import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { balanceOf, bestHeight, layoutTree, plain, signed, treeHeight, type Frame, type Ghost, type Role, type Tree } from './model'

/* ============================================================
 * The picture for the Binary Search Tree demo.
 *
 * Every node gets its own column, in sorted order, and its row is its
 * depth. So reading left to right is always smallest to biggest, and a
 * rotation only ever moves nodes up and down.
 *
 * One Frame (see model.ts) says what to draw. When the next frame moves
 * nodes, they glide to their new places and the links follow.
 * ============================================================ */

const WIDTH = 940
const MID = WIDTH / 2
const R = 19                 // node radius
const COL = 56               // column pitch
const TOP = 98               // y of the root's row
const MIN_ROWS = 4           // the picture always leaves room for this many rows
const BOX = { x: 395, y: 10, w: 150, h: 32 }
const ROOT_X = 512           // where the root pointer leaves the tree object
const ROOT_RUN_Y = 56        // the height its sideways run travels at
const GLIDE_MS = 450

interface Point { x: number; y: number }
type Points = Record<number, Point>

/** Rows sit closer together as the tree gets deeper, so a stick of seven still fits the screen. */
const rowPitch = (rows: number) => (rows <= MIN_ROWS ? 62 : rows === 5 ? 52 : rows === 6 ? 46 : 40)

interface Plan { points: Points; order: number[]; pitch: number; floor: number }

function place(tree: Tree, ghost: Ghost | null): Plan {
  const { spots, order, rows } = layoutTree(tree)
  // An empty spot below the last row needs a row of its own.
  const needed = ghost && spots[ghost.parent] ? Math.max(rows, spots[ghost.parent].depth + 2) : rows
  const pitch = rowPitch(needed)
  const points: Points = {}
  for (const id of order) {
    points[id] = { x: MID + (spots[id].rank - (order.length - 1) / 2) * COL, y: TOP + spots[id].depth * pitch }
  }
  return { points, order, pitch, floor: TOP + (Math.max(needed, MIN_ROWS) - 1) * pitch }
}

const blend = (from: Points, to: Points, t: number): Points => {
  const points: Points = {}
  for (const key of Object.keys(to)) {
    const id = Number(key)
    const start = from[id] ?? to[id]
    points[id] = { x: start.x + (to[id].x - start.x) * t, y: start.y + (to[id].y - start.y) * t }
  }
  return points
}

/** Slides every node from where it is drawn now to its new place. A node that is new starts at its place. */
function useGlide(target: Points): Points {
  const [glide, setGlide] = useState({ from: target, to: target, t: 1 })
  const drawn = useRef(target)
  // On the render where the target changes, hold the last picture; the effect below then starts the slide.
  const points = glide.to === target ? blend(glide.from, target, glide.t) : blend(drawn.current, target, 0)

  useEffect(() => { drawn.current = points })

  useEffect(() => {
    const from = drawn.current
    const moves = Object.keys(target).some(key => {
      const id = Number(key)
      return from[id] !== undefined && (from[id].x !== target[id].x || from[id].y !== target[id].y)
    })
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (still || !moves) {
      setGlide({ from: target, to: target, t: 1 })
      return
    }
    const started = performance.now()
    let request = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / GLIDE_MS)
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      setGlide({ from, to: target, t: eased })
      if (t < 1) request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [target])

  return points
}

/** The box around a whole subtree, in drawn coordinates. */
function boundsOf(tree: Tree, top: number, at: Points) {
  let left = Infinity, right = -Infinity, bottom = -Infinity
  const stack = [top]
  while (stack.length) {
    const id = stack.pop() as number
    const node = tree.nodes[id]
    left = Math.min(left, at[id].x)
    right = Math.max(right, at[id].x)
    bottom = Math.max(bottom, at[id].y)
    if (node.left !== null) stack.push(node.left)
    if (node.right !== null) stack.push(node.right)
  }
  return { x: left - R - 9, y: at[top].y - R - 12, width: right - left + 2 * R + 18, height: bottom - at[top].y + 2 * R + 20 }
}

/** The stale link of a rotation: out sideways along the parent's row, then down the old child's column. */
const elbow = (from: Point, to: Point) => {
  const dir = to.x > from.x ? 1 : -1
  return `M ${from.x + dir * (R + 1)} ${from.y} H ${to.x - dir * 10} Q ${to.x} ${from.y} ${to.x} ${from.y + 10} V ${to.y - R - 3}`
}

/** Which node the read-out follows while a call is running. */
const READ_ROLES: Role[] = ['heavy', 'visit', 'new', 'found', 'target', 'fixed', 'next']

interface StageProps {
  frame: Frame
  balance: boolean
}

export function Stage({ frame, balance }: StageProps) {
  const { tree, ghost } = frame
  const plan = useMemo(() => place(tree, ghost), [tree, ghost])
  const at = useGlide(plan.points)
  const [picked, setPicked] = useState<number | null>(null)

  const count = plan.order.length
  const tall = treeHeight(tree)
  const best = bestHeight(count)
  const slotY = plan.floor + R + 28
  const height = slotY + 22 + 26
  const className = balance ? 'MyAVL' : 'MyBST'
  const valueOf = (id: number | null) => (id === null ? 'null' : `${tree.nodes[id].value}`)

  /* ----- read-out: the fields of one BinaryNode ----- */
  const midRotation = frame.rootAt !== null || frame.extra.length > 0
  const lit = READ_ROLES.map(role => plan.order.find(id => frame.roles[id] === role)).find(id => id !== undefined)
  const readId = midRotation ? null : lit ?? (picked !== null && tree.nodes[picked] ? picked : tree.root)
  const read = readId === null ? null : tree.nodes[readId]

  /* ----- the root pointer ----- */
  const pointId = frame.rootAt ?? tree.root
  const pointAt = pointId === null ? null : at[pointId]
  const rootPath = pointAt === null
    ? `M ${ROOT_X} ${BOX.y + BOX.h} V ${ROOT_RUN_Y}`
    : Math.abs(pointAt.x - ROOT_X) < 1
      ? `M ${ROOT_X} ${BOX.y + BOX.h} V ${pointAt.y - R - 4}`
      : `M ${ROOT_X} ${BOX.y + BOX.h} V ${ROOT_RUN_Y} H ${pointAt.x} V ${pointAt.y - R - 4}`
  const rootState = frame.rootAt !== null ? ' bst-rootlink--stale' : frame.rootLit ? ' bst-rootlink--lit' : ''

  /* ----- the two sides being compared ----- */
  const measured = frame.measure !== null ? tree.nodes[frame.measure] : undefined
  const measuredKids = measured ? [measured.left, measured.right] : []

  const pick = (id: number) => setPicked(current => (current === id ? null : id))
  const onNodeKey = (event: KeyboardEvent<SVGGElement>, id: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    pick(id)
  }

  const note = frame.note && tree.nodes[frame.note.node] ? frame.note : null
  const notePlace = (() => {
    if (!note) return null
    const spot = at[note.node]
    const parent = tree.nodes[note.node].parent
    // Sit on the side the link from above does not come in from.
    const incoming = parent === null ? ROOT_X : at[parent].x
    const width = note.text.length * 6.7 + 16
    return { x: spot.x >= incoming ? spot.x + 6 : spot.x - 6 - width, y: spot.y - R - 31, width }
  })()

  const ghostSpot = ghost && tree.nodes[ghost.parent]
    ? { x: at[ghost.parent].x + (ghost.side === 'left' ? -COL / 2 : COL / 2), y: at[ghost.parent].y + plan.pitch }
    : null

  const summary = count
    ? `${className} with ${count} ${count === 1 ? 'value' : 'values'}: ${plan.order.map(id => tree.nodes[id].value).join(', ')}. The root is ${valueOf(tree.root)} and the height is ${tall}.`
    : `An empty ${className}. The root is null.`

  return (
    <svg className="fs-svg bst-svg" viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={summary}>
      <rect className="fs-ground" width={WIDTH} height={height} />

      {/* ----- one node's fields ----- */}
      <text className="fs-title" x={24} y={24}>
        {midRotation ? 'Links are changing hands' : read ? `BinaryNode ${read.value}` : 'No nodes yet'}
      </text>
      <text className="fs-sub" x={24} y={41}>
        {midRotation
          ? 'a rotation is half done'
          : read
            ? `left ${valueOf(read.left)} · right ${valueOf(read.right)} · parent ${valueOf(read.parent)} · height ${read.height}`
            : 'root is null'}
      </text>

      {/* ----- the tree object and its one field ----- */}
      <rect className="fs-obj__box" x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} rx={7} />
      <text className="fs-obj__name" x={BOX.x + 12} y={BOX.y + 21}>{className}</text>
      <text className="fs-obj__field" x={ROOT_X - 8} y={BOX.y + 21} textAnchor="end">root</text>
      <circle className="fs-obj__dot" cx={ROOT_X} cy={BOX.y + BOX.h} r={3.5} />
      <path className={`bst-rootlink${rootState}`} d={rootPath} />
      {pointAt
        ? <path className={`bst-rootlink__tip${rootState}`} d={`M ${pointAt.x - 4.5} ${pointAt.y - R - 10} L ${pointAt.x} ${pointAt.y - R - 2} L ${pointAt.x + 4.5} ${pointAt.y - R - 10} Z`} />
        : <text className="bst-null" x={ROOT_X} y={ROOT_RUN_Y + 14} textAnchor="middle">null</text>}

      {/* ----- how tall it is ----- */}
      <text className="fs-title" x={WIDTH - 24} y={24} textAnchor="end">height {plain(tall)}</text>
      <text className="fs-sub" x={WIDTH - 24} y={38} textAnchor="end">
        {count ? `longest search: ${tall + 1} of ${count} ${count === 1 ? 'node' : 'nodes'}` : 'an empty tree'}
      </text>
      {tall > best && (
        <text className="fs-sub bst-could" x={WIDTH - 24} y={51} textAnchor="end">{count} values can fit in height {best}</text>
      )}

      {!count && (
        <>
          <text className="fs-empty" x={MID} y={TOP + 86} textAnchor="middle">The tree is empty: root is null.</text>
          <text className="fs-sub" x={MID} y={TOP + 108} textAnchor="middle">Add a value, or run one of the checks.</text>
        </>
      )}

      {/* ----- sorted order: every node hangs above its own slot ----- */}
      {plan.order.map((id, index) => {
        const spot = at[id]
        const readSoFar = frame.sorted !== null && index < frame.sorted
        return (
          <g key={`slot-${id}`}>
            <line className="bst-drop" x1={spot.x} y1={spot.y + R + 2} x2={spot.x} y2={slotY - 2} />
            <rect className={`bst-slot${readSoFar ? ' bst-slot--read' : ''}`} x={spot.x - 19} y={slotY} width={38} height={22} rx={4} />
            <text className={`bst-slot__value${readSoFar ? ' bst-slot__value--read' : ''}`} x={spot.x} y={slotY + 15.5} textAnchor="middle">{tree.nodes[id].value}</text>
          </g>
        )
      })}
      {count > 0 && (
        <>
          <text className="bst-bracket" x={at[plan.order[0]].x - 30} y={slotY + 17} textAnchor="middle">[</text>
          <text className="bst-bracket" x={at[plan.order[count - 1]].x + 30} y={slotY + 17} textAnchor="middle">]</text>
          <text className="fs-sub" x={MID} y={slotY + 38} textAnchor="middle">left to right is always smallest to biggest: this is what toString() reads</text>
        </>
      )}

      {/* ----- the two sides of the node being checked ----- */}
      {measured && (['left', 'right'] as const).map(side => {
        const child = measured[side]
        const spot = at[measured.id]
        if (child === null) {
          const x = spot.x + (side === 'left' ? -32 : 32)
          const y = spot.y + 42
          return (
            <g key={`side-${side}`} className="bst-none">
              <line x1={spot.x} y1={spot.y} x2={x} y2={y} />
              <circle cx={x} cy={y} r={11} />
              <text x={x} y={y + 3.5} textAnchor="middle">−1</text>
            </g>
          )
        }
        const box = boundsOf(tree, child, at)
        return (
          <g key={`side-${side}`} className="bst-side">
            <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={12} />
            <text x={box.x + box.width / 2} y={box.y + box.height + 12} textAnchor="middle">height {tree.nodes[child].height}</text>
          </g>
        )
      })}

      {/* ----- the subtree that changes parent in a rotation ----- */}
      {frame.carried !== null && tree.nodes[frame.carried] && (() => {
        const box = boundsOf(tree, frame.carried, at)
        return (
          <g className="bst-carried">
            <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={12} />
            <text x={box.x + box.width / 2} y={box.y + box.height + 12} textAnchor="middle">changes parent</text>
          </g>
        )
      })()}

      {/* ----- links ----- */}
      {plan.order.map(id => {
        const node = tree.nodes[id]
        if (node.parent === null || frame.hidden.includes(id)) return null
        const from = at[node.parent]
        const to = at[id]
        const kind = frame.cut.includes(id) ? 'cut' : frame.fresh.includes(id) ? 'fresh' : frame.up.includes(id) ? 'up' : frame.down.includes(id) ? 'down' : ''
        return <line key={`link-${id}`} className={`bst-link${kind ? ` bst-link--${kind}` : ''}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      })}
      {frame.extra.map(link => {
        if (!tree.nodes[link.from] || !tree.nodes[link.to]) return null
        const from = at[link.from]
        const to = at[link.to]
        return link.kind === 'stale'
          ? <path key={`extra-${link.from}-${link.to}`} className="bst-link bst-link--stale" d={elbow(from, to)} />
          : <line key={`extra-${link.from}-${link.to}`} className="bst-link bst-link--moved" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      })}

      {/* ----- an empty spot ----- */}
      {ghost && ghostSpot && (
        <g className={`bst-ghost bst-ghost--${ghost.tone}`}>
          <line x1={at[ghost.parent].x} y1={at[ghost.parent].y} x2={ghostSpot.x} y2={ghostSpot.y} />
          <circle cx={ghostSpot.x} cy={ghostSpot.y} r={R} />
          <text x={ghostSpot.x} y={ghostSpot.y + 5} textAnchor="middle">{ghost.text}</text>
        </g>
      )}

      {/* ----- nodes ----- */}
      {plan.order.map(id => {
        const node = tree.nodes[id]
        const spot = at[id]
        const role = frame.roles[id]
        const tag = frame.tags[id]
        const lean = balanceOf(tree, id)
        const heightLit = frame.bumped.includes(id) || measuredKids.includes(id)
        const isPicked = picked === id
        return (
          <g
            key={`node-${id}`}
            className={`bst-node${role ? ` bst-node--${role}` : ''}${isPicked ? ' bst-node--picked' : ''}`}
            transform={`translate(${spot.x} ${spot.y})`}
            role="button"
            tabIndex={0}
            aria-pressed={isPicked}
            aria-label={`Node ${node.value}: left ${valueOf(node.left)}, right ${valueOf(node.right)}, parent ${valueOf(node.parent)}, height ${node.height}`}
            onClick={() => pick(id)}
            onKeyDown={event => onNodeKey(event, id)}
          >
            {role && <circle className="bst-halo" r={R + 6} />}
            <circle className="bst-disc" r={R} />
            <text className="bst-value" y={5} textAnchor="middle">{node.value}</text>
            <g className={`bst-tab${heightLit ? ' bst-tab--lit' : ''}`}>
              <rect x={8} y={-29} width={25} height={14} rx={4} />
              <text x={20.5} y={-18.5} textAnchor="middle">h{node.height}</text>
            </g>
            {balance && (
              <g className={`bst-tab bst-tab--lean${Math.abs(lean) > 1 ? ' bst-tab--bad' : ''}`}>
                <rect x={-33} y={-29} width={25} height={14} rx={4} />
                <text x={-20.5} y={-18.5} textAnchor="middle">{signed(lean)}</text>
              </g>
            )}
            {tag && <text className="bst-tag" y={R + 19} textAnchor="middle">{tag}</text>}
          </g>
        )
      })}

      {/* ----- the sum above a node ----- */}
      {note && notePlace && (
        <g className={`bst-note bst-note--${note.tone}`}>
          <rect x={notePlace.x} y={notePlace.y} width={notePlace.width} height={18} rx={9} />
          <text x={notePlace.x + notePlace.width / 2} y={notePlace.y + 12.5} textAnchor="middle">{note.text}</text>
        </g>
      )}
    </svg>
  )
}
