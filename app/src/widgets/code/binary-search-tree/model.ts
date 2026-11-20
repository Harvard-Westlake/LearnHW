/* ============================================================
 * Binary Search Tree: the simulator behind the BST and AVL demo.
 *
 * Mirrors the BinaryNode and MyBST classes of the assignment, in its two
 * stages: a plain tree that never rearranges anything (rebalancing off,
 * MyBST) and the same tree with AVL balancing (rebalancing on, MyAVL).
 * Every call returns three things: the new tree, what the call answers,
 * and a list of animation frames. Each frame is a whole snapshot of the
 * tree plus what to light up, so the picture can be stepped both ways.
 *
 * Frames name the Java call behind each step and what it answers. The
 * links a rotation changes are told in plain words and shown in the
 * picture, never as code: students write those.
 *
 * rotationDemo() plays one row of the fix table on its own: a small tree
 * that already leans, and only the steps of its fix.
 *
 * Pure logic, no React. model.test.ts checks it against the "check
 * yourself" lists of the assignment.
 * ============================================================ */

/** The picture has room for this many values, in this range. The assignment has no such limits. */
export const MAX_NODES = 15
export const MIN_VALUE = 0
export const MAX_VALUE = 99

export type Side = 'left' | 'right'
export type Method = 'add' | 'remove' | 'contains' | 'min' | 'max' | 'toString'

/** One BinaryNode. Links are node ids. Between calls a node's id is its value. */
export interface BNode {
  id: number
  value: number
  left: number | null
  right: number | null
  parent: number | null      // null for the root
  height: number             // steps down to the deepest leaf: a leaf is 0
}

export interface Tree {
  nodes: Record<number, BNode>
  root: number | null        // MyBST.root
}

export const EMPTY_TREE: Tree = { nodes: {}, root: null }

/** Why a node is lit: being looked at, new or found, about to go, out of balance, moving in a rotation, the next bigger value, or fixed. */
export type Role = 'visit' | 'new' | 'found' | 'target' | 'heavy' | 'up' | 'down' | 'next' | 'fixed'

export interface Note { node: number; text: string; tone: 'plain' | 'good' | 'bad' }
export interface Ghost { parent: number; side: Side; text: string; tone: 'spot' | 'missing' }
/** A link drawn on top of the tree: one that just changed hands, or one that still points at the old place. */
export interface ExtraLink { from: number; to: number; kind: 'moved' | 'stale' }
/** The three links one rotation changes, in the order they change. */
export type Beat = 'carry' | 'swing' | 'attach'

export interface Frame {
  tree: Tree                        // what the picture draws
  caption: string                   // what is happening, in plain words
  code: string                      // the Java call behind this step
  lines: number                     // output lines printed so far
  key: boolean                      // a step worth slowing down for when a whole list is playing
  roles: Record<number, Role>
  tags: Record<number, string>      // a word under a node: "up", "down"
  note: Note | null                 // a sum above a node: "5 < 8", "0 − 2 = −2"
  ghost: Ghost | null               // an empty spot under a node
  down: number[]                    // child ids whose link was followed downward
  up: number[]                      // child ids whose parent link was followed upward
  fresh: number[]                   // child ids whose link was just made
  cut: number[]                     // child ids whose link is about to go
  hidden: number[]                  // child ids whose link is not drawn
  extra: ExtraLink[]
  rootAt: number | null             // where root still points when that is not the top node
  rootLit: boolean                  // root itself just changed
  measure: number | null            // the node whose two sides are being compared
  carried: number | null            // top of the subtree that changes parent in a rotation
  bumped: number[]                  // nodes whose height changed in this step
  fix: number | null                // the row of the fix table in use
  beat: Beat | null                 // which link of a rotation this step changes
  sorted: number | null             // toString: how many values are read so far
}

export type LineKind = 'out' | 'note'
export interface OutputLine { text: string; kind: LineKind }

/** A change worth replaying when rebalancing is switched on or off. */
export interface Change { method: 'add' | 'remove'; value: number }

export interface RunResult {
  tree: Tree
  output: OutputLine[]
  frames: Frame[]
  change: Change | null             // set when the call changed the tree
}

export interface Call { method: Method; arg: string }

export interface MethodSpec {
  name: Method
  takesValue: boolean
  help: string
}

export const METHODS: MethodSpec[] = [
  { name: 'add', takesValue: true, help: 'Walk down from the root: smaller goes left, bigger goes right. The first empty spot is where the new value goes, as a leaf.' },
  { name: 'remove', takesValue: true, help: 'Find the value, then take its node out. How depends on its children: none, one or two.' },
  { name: 'contains', takesValue: true, help: 'Walk down one path from the root. Every look throws away a whole side of the tree.' },
  { name: 'min', takesValue: false, help: 'The smallest value: keep going left until you can\'t.' },
  { name: 'max', takesValue: false, help: 'The biggest value: keep going right until you can\'t.' },
  { name: 'toString', takesValue: false, help: 'Read the tree from left to right. That is always smallest to biggest.' },
]

export interface FixRow {
  node: string
  child: string
  fix: string         // the assignment's wording
  name: string        // the same fix, short
  shape: string       // what the lean looks like
  say: string         // what the fix does, in one breath
}

/** The fix table of Stage 2, in the order the frames number its rows. */
export const FIX_ROWS: FixRow[] = [
  {
    node: '+2', child: 'left child is 0 or more', fix: 'rotate right',
    name: 'Rotate right', shape: 'a straight line leaning left',
    say: 'The left child moves up. The node drops down to the right.',
  },
  {
    node: '+2', child: 'left child is negative', fix: 'rotate left on the left child, then rotate right',
    name: 'Rotate left, then right', shape: 'a zig-zag, left then right',
    say: 'The first rotation straightens the zig-zag. The second levels it.',
  },
  {
    node: '−2', child: 'right child is 0 or less', fix: 'rotate left',
    name: 'Rotate left', shape: 'a straight line leaning right',
    say: 'The right child moves up. The node drops down to the left.',
  },
  {
    node: '−2', child: 'right child is positive', fix: 'rotate right on the right child, then rotate left',
    name: 'Rotate right, then left', shape: 'a zig-zag, right then left',
    say: 'The first rotation straightens the zig-zag. The second levels it.',
  },
]

/** What every rotation does, whichever way it turns. Each frame of a rotation names the one it is on. */
export const ROTATION_STEPS: { beat: Beat; text: string }[] = [
  { beat: 'carry', text: 'The middle value, if there is one, changes parent.' },
  { beat: 'swing', text: 'The child moves up and the old top goes under it.' },
  { beat: 'attach', text: 'The link from above moves to the new top.' },
]

export type ExampleId = 'small' | 'middle' | 'parent'

export interface RotationExample {
  id: ExampleId
  label: string
  watch: string           // the one thing this tree is here to show
  adds: number[][]        // per row of FIX_ROWS: values that, added with nothing rearranged, make the leaning tree
}

/** The trees of the rotations-only view. In each one exactly one node is out of balance. */
export const ROTATION_EXAMPLES: RotationExample[] = [
  {
    id: 'small', label: '3 values',
    watch: 'Just the move: one node goes up and one goes down. Watch root switch to the new top.',
    adds: [[3, 2, 1], [3, 1, 2], [1, 2, 3], [1, 3, 2]],
  },
  {
    id: 'middle', label: 'values in the middle',
    watch: 'Watch the yellow box: a value in the middle changes parent, and it still sits between the same two values.',
    adds: [[5, 3, 6, 2, 4, 1], [6, 2, 7, 1, 4, 3, 5], [2, 1, 4, 3, 5, 6], [2, 1, 6, 4, 7, 3, 5]],
  },
  {
    id: 'parent', label: 'below a parent',
    watch: 'Watch the red dashed link: the parent above keeps pointing at the old top until the new top is attached.',
    adds: [[4, 3, 5, 2, 6, 1], [4, 3, 5, 1, 6, 2], [3, 2, 4, 1, 5, 6], [3, 2, 4, 1, 6, 5]],
  },
]

export interface Check { id: string; label: string; list: string; calls: Call[]; expect: string }

const adds = (...values: number[]): Call[] => values.map(value => ({ method: 'add', arg: String(value) }))

/** The "check yourself" lists of the assignment, one set per stage. The last one of Stage 2 is extra. */
export const CHECKS: { off: Check[]; on: Check[] } = {
  off: [
    { id: 'stick', label: 'Add 1 to 7 in order', list: 'Add 1, 2, 3, 4, 5, 6, 7 in that order', calls: adds(1, 2, 3, 4, 5, 6, 7), expect: 'Height 6 and the root is 1: a stick.' },
    { id: 'bushy', label: 'Add 4, 2, 6, 1, 3, 5, 7', list: 'Add 4, 2, 6, 1, 3, 5, 7', calls: adds(4, 2, 6, 1, 3, 5, 7), expect: 'Height 2 and the root is 4.' },
    {
      id: 'remove-root', label: 'Same, then remove 4', list: 'Add 4, 2, 6, 1, 3, 5, 7, then remove 4',
      calls: [...adds(4, 2, 6, 1, 3, 5, 7), { method: 'remove', arg: '4' }],
      expect: 'The root becomes 5, its right child is 6, and 6 has only a right child, 7. toString() is [1, 2, 3, 5, 6, 7].',
    },
  ],
  on: [
    { id: 'in-order', label: 'Add 1 to 7 in order', list: 'Add 1, 2, 3, 4, 5, 6, 7 in that order', calls: adds(1, 2, 3, 4, 5, 6, 7), expect: 'Height 2, the root is 4, and its children are 2 and 6.' },
    { id: 'zig-zag', label: 'Add 3, 1, 2', list: 'Add 3, 1, 2', calls: adds(3, 1, 2), expect: 'The root is 2 with children 1 and 3: a double rotation.' },
    {
      id: 'tie', label: '2, 1, 4, 3, 5, remove 1', list: 'Add 2, 1, 4, 3, 5, then remove 1',
      calls: [...adds(2, 1, 4, 3, 5), { method: 'remove', arg: '1' }],
      expect: 'The root is 4, its left child is 2, its right child is 5, and 2 has a right child, 3.',
    },
    {
      id: 'two-fixes', label: 'Two fixes', list: 'Add 8, 5, 11, 3, 7, 10, 12, 2, 4, 6, 9, 1, then remove 12',
      calls: [...adds(8, 5, 11, 3, 7, 10, 12, 2, 4, 6, 9, 1), { method: 'remove', arg: '12' }],
      expect: 'Removing 12 tips 11 over, and fixing that tips the root over: two fixes, and 5 ends up as the root.',
    },
  ],
}

/* ---------- Questions about a tree ---------- */

export const sizeOf = (tree: Tree) => Object.keys(tree.nodes).length

/** MyBST.getHeight(): an empty tree is -1, a single node is 0. */
export const treeHeight = (tree: Tree) => (tree.root === null ? -1 : tree.nodes[tree.root].height)

const storedHeight = (tree: Tree, id: number | null) => (id === null ? -1 : tree.nodes[id].height)

/** Left child's height minus right child's height. A missing child counts as -1. */
export function balanceOf(tree: Tree, id: number): number {
  const node = tree.nodes[id]
  return storedHeight(tree, node.left) - storedHeight(tree, node.right)
}

/** Node ids from the smallest value to the biggest. */
export function inOrder(tree: Tree): number[] {
  const order: number[] = []
  const visit = (id: number | null) => {
    if (id === null) return
    visit(tree.nodes[id].left)
    order.push(id)
    visit(tree.nodes[id].right)
  }
  visit(tree.root)
  return order
}

export const valuesOf = (tree: Tree) => inOrder(tree).map(id => tree.nodes[id].value)

/** MyBST.toString(): [1, 2, 3] */
export const textOf = (tree: Tree) => `[${valuesOf(tree).join(', ')}]`

/** The smallest height a tree with this many values can have. */
export const bestHeight = (count: number) => (count < 1 ? -1 : Math.floor(Math.log2(count)))

export interface TreeLayout {
  spots: Record<number, { rank: number; depth: number }>   // rank: position from the left, counting from 0
  order: number[]
  rows: number
}

/** Every node gets its own column, in sorted order, so left to right always reads smallest to biggest. */
export function layoutTree(tree: Tree): TreeLayout {
  const spots: TreeLayout['spots'] = {}
  const order: number[] = []
  let rows = 0
  const visit = (id: number | null, depth: number) => {
    if (id === null) return
    visit(tree.nodes[id].left, depth + 1)
    spots[id] = { rank: order.length, depth }
    order.push(id)
    rows = Math.max(rows, depth + 1)
    visit(tree.nodes[id].right, depth + 1)
  }
  visit(tree.root, 0)
  return { spots, order, rows }
}

/** A frame with nothing lit: the tree as it is between calls. */
export function restFrame(tree: Tree, caption = '', code = ''): Frame {
  return {
    tree, caption, code, lines: 0, key: false,
    roles: {}, tags: {}, note: null, ghost: null,
    down: [], up: [], fresh: [], cut: [], hidden: [], extra: [],
    rootAt: null, rootLit: false, measure: null, carried: null, bumped: [], fix: null, beat: null, sorted: null,
  }
}

/* ---------- Words and numbers ---------- */

const other = (side: Side): Side => (side === 'left' ? 'right' : 'left')
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)
/** Heights and balances are written with a real minus sign, and a balance above 0 with a plus. */
export const plain = (n: number) => (n < 0 ? `−${-n}` : String(n))
export const signed = (n: number) => (n > 0 ? `+${n}` : plain(n))
const steps = (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`
const nodesWord = (n: number) => `${n} ${n === 1 ? 'node' : 'nodes'}`

const copyTree = (tree: Tree): Tree => ({
  root: tree.root,
  nodes: Object.fromEntries(Object.values(tree.nodes).map(node => [node.id, { ...node }])),
})

/** After a remove with two children, one node holds a value that is not its id. Rename it so id and value agree again. */
function tidy(tree: Tree): Tree {
  const rename = (id: number | null) => (id === null ? null : tree.nodes[id].value)
  const nodes: Record<number, BNode> = {}
  for (const node of Object.values(tree.nodes)) {
    nodes[node.value] = { id: node.value, value: node.value, left: rename(node.left), right: rename(node.right), parent: rename(node.parent), height: node.height }
  }
  return { nodes, root: rename(tree.root) }
}

/* ---------- Running one call ---------- */

type Patch = Partial<Omit<Frame, 'tree' | 'caption' | 'code' | 'lines' | 'bumped'>>

/** What one run does: a method call, or (for the rotations-only view) just the fix of the node whose value is the argument. */
type Job = Method | 'fix'

/**
 * Runs one method call on the tree. With `balance` on, add and remove also
 * rebalance every node on the way back up to the root (Stage 2).
 */
export function run(tree: Tree, balance: boolean, method: Method, arg = ''): RunResult {
  return perform(tree, balance, method, arg)
}

function perform(tree: Tree, balance: boolean, method: Job, arg: string): RunResult {
  let work = copyTree(tree)
  let shown = tree
  const frames: Frame[] = []
  const output: OutputLine[] = []

  const push = (caption: string, code: string, patch: Patch = {}) => {
    const snapshot = copyTree(work)
    const bumped = Object.values(snapshot.nodes)
      .filter(node => shown.nodes[node.id] && shown.nodes[node.id].height !== node.height)
      .map(node => node.id)
    frames.push({ ...restFrame(snapshot, caption, code), ...patch, bumped, lines: output.length })
    shown = snapshot
  }
  const print = (text: string, kind: LineKind = 'out') => { output.push({ text, kind }) }
  const done = (change: Change | null): RunResult => {
    frames[frames.length - 1].lines = output.length
    return { tree: copyTree(work), output, frames, change }
  }
  const refuse = (text: string): RunResult => {
    print(`(demo) ${text}`, 'note')
    push(text, '')
    return done(null)
  }

  /* The BinaryNode calls. link() is setLeft or setRight with its two extra lines done. */
  const node = (id: number) => work.nodes[id]
  const val = (id: number) => work.nodes[id].value
  const height = (id: number | null) => storedHeight(work, id)
  const bal = (id: number) => balanceOf(work, id)
  const fixHeight = (id: number) => { node(id).height = 1 + Math.max(height(node(id).left), height(node(id).right)) }
  const link = (parent: number, side: Side, child: number | null) => {
    node(parent)[side] = child
    if (child !== null) node(child).parent = parent
    fixHeight(parent)
  }
  const sideOf = (id: number): Side => (node(node(id).parent as number).left === id ? 'left' : 'right')
  const leaf = (value: number): BNode => ({ id: value, value, left: null, right: null, parent: null, height: 0 })
  /** "0 − (−1)": a node's two side heights, as the balance sum. */
  const sum = (id: number) => {
    const right = height(node(id).right)
    return `${plain(height(node(id).left))} − ${right < 0 ? `(${plain(right)})` : right}`
  }
  /** "Left side: nothing there (-1). Right side: height 0." */
  const sides = (id: number) => {
    const tell = (child: number | null) => (child === null ? 'nothing there (−1)' : `height ${height(child)}`)
    return `Left side: ${tell(node(id).left)}. Right side: ${tell(node(id).right)}.`
  }
  const sizeNow = () => Object.keys(work.nodes).length

  /* ----- walking down ----- */

  interface Walk { path: number[]; hit: number | null; end: number | null; side: Side | null }

  /** Follows value down from the root until it is found or the path runs out. The caller tells the last step. */
  const descend = (value: number, verb: string): Walk => {
    const path: number[] = []
    let at = work.root
    while (at !== null) {
      path.push(at)
      const here = val(at)
      if (value === here) return { path, hit: at, end: at, side: null }
      const side: Side = value < here ? 'left' : 'right'
      const next: number | null = node(at)[side]
      if (next === null) return { path, hit: null, end: at, side }
      push(
        `${path.length === 1 ? 'Start at the root. ' : ''}${value} is ${value < here ? 'smaller' : 'bigger'} than ${here}, so ${verb} ${side}.`,
        compareCode(value, here),
        { roles: { [at]: 'visit' }, note: compareNote(at, value), down: [...path.slice(1), next] },
      )
      at = next
    }
    return { path, hit: null, end: null, side: null }
  }
  const compareCode = (value: number, here: number) =>
    `${value}.compareTo(${here})  →  ${value < here ? 'negative: go left' : value > here ? 'positive: go right' : '0: the same value'}`
  const compareNote = (at: number, value: number): Note =>
    ({ node: at, text: `${value} ${value < val(at) ? '<' : value > val(at) ? '>' : '='} ${val(at)}`, tone: 'plain' })
  const lead = (walk: Walk) => (walk.path.length === 1 ? 'Start at the root. ' : '')

  /* ----- walking back up ----- */

  /** Fixes heights from `start` up to the root, lowest node first. With balancing on, each node is rebalanced too. */
  const climb = (start: number | null, below: number | null) => {
    let at = start
    let passed: number[] = below === null ? [] : [below]
    let opening = balance ? 'Now walk back up to the root, checking each node. ' : 'Now walk back up to the root and fix each height. '
    while (at !== null) {
      fixHeight(at)
      const tall = height(at)
      const lean = bal(at)
      if (!balance) {
        const words = tall === 0 ? `${val(at)} is a leaf, so its height is 0.` : `The longest way down from ${val(at)} is ${steps(tall)}, so its height is ${tall}.`
        push(`${opening}${words}`, `${val(at)}.updateHeight()  →  ${tall}`, { roles: { [at]: 'visit' }, up: passed })
      } else if (Math.abs(lean) < 2) {
        push(
          `${opening}${val(at)} has height ${tall}. ${sides(at)} Balance: ${signed(lean)}, which is fine.`,
          `${val(at)}.updateHeight()  →  ${tall}     rebalance(${val(at)}): balance ${lean}, no rotation`,
          { roles: { [at]: 'visit' }, up: passed, measure: at, note: { node: at, text: `${sum(at)} = ${signed(lean)}`, tone: 'good' } },
        )
      } else {
        at = rebalance(at, opening, passed)
        passed = []
      }
      opening = ''
      passed = [...passed, at]
      at = node(at).parent
    }
  }

  /** Picks the row of the fix table for a node whose balance is +2 or -2, runs it, and returns the node that ends up on top. */
  const rebalance = (at: number, opening: string, passed: number[]): number => {
    const lean = bal(at)
    const heavy: Side = lean > 0 ? 'left' : 'right'
    const child = node(at)[heavy] as number
    const childLean = bal(child)
    const zigzag = lean > 0 ? childLean < 0 : childLean > 0
    const row = lean > 0 ? (zigzag ? 1 : 0) : (zigzag ? 3 : 2)
    const name = val(at)
    const childName = val(child)
    const turn = other(heavy)

    push(
      `${opening}${name} has height ${height(at)}. ${sides(at)} Balance: ${signed(lean)}, so ${name} leans too far ${heavy}.`,
      `${name}.updateHeight()  →  ${height(at)}     rebalance(${name}): balance ${lean}`,
      { roles: { [at]: 'heavy' }, up: passed, measure: at, note: { node: at, text: `${sum(at)} = ${signed(lean)}`, tone: 'bad' }, key: true },
    )

    const range = lean > 0 ? (zigzag ? 'negative' : '0 or more') : (zigzag ? 'positive' : '0 or less')
    const verdict = zigzag
      ? `It leans the other way, a zig-zag. Two steps: rotate ${heavy} on ${childName} to straighten it, then rotate ${turn} on ${name}.`
      : childLean === 0
        ? `The table counts 0 as a straight line, so one rotation does it: rotate ${turn}.`
        : `It leans the same way, a straight line, so one rotation does it: rotate ${turn}.`
    push(
      `Which fix? Look at its ${heavy} child, ${childName}: balance ${signed(childLean)} (${range}). ${verdict}`,
      `rebalance(${name}): ${heavy} child's balance is ${childLean}`,
      { roles: { [at]: 'heavy', [child]: 'visit' }, measure: child, note: { node: child, text: `${sum(child)} = ${signed(childLean)}`, tone: 'plain' }, fix: row, key: true },
    )

    if (zigzag) rotate(child, heavy, 'Step 1 of 2. ', row)
    const top = rotate(at, turn, zigzag ? 'Step 2 of 2. ' : '', row)
    push(
      `Fixed. ${val(top)} is on top now and its balance is ${signed(bal(top))}, back within 1.`,
      `rebalance(${name})  →  done`,
      { roles: { [top]: 'fixed' }, measure: top, note: { node: top, text: `${sum(top)} = ${signed(bal(top))}`, tone: 'good' }, fix: row, key: true },
    )
    return top
  }

  /** One rotation. `dir` is the way the top node drops: rotate left sends it down to the left and lifts its right child. */
  const rotate = (top: number, dir: Side, label: string, row: number): number => {
    const from = other(dir)
    const riser = node(top)[from] as number
    const middle = node(riser)[dir]
    const holder = node(top).parent
    const holderSide = holder === null ? null : sideOf(top)
    const name = val(top)
    const riserName = val(riser)
    const method = dir === 'left' ? 'rotateLeft' : 'rotateRight'
    const roles: Record<number, Role> = { [top]: 'down', [riser]: 'up' }
    const tags = { [top]: 'down', [riser]: 'up' }

    push(
      `${label}Rotate ${dir} at ${name}: ${name} drops down to the ${dir}, and its ${from} child, ${riserName}, moves up into its place. Nobody changes their left-to-right spot.`,
      `${method}(${name})`,
      { roles, tags, carried: middle, fix: row, key: true },
    )

    if (middle !== null) {
      const group = node(middle).left === null && node(middle).right === null ? `${val(middle)}` : `${val(middle)} and everything under it`
      const [low, high] = dir === 'left' ? [name, riserName] : [riserName, name]
      push(
        `First ${group} changes parent. It sits between ${low} and ${high}, so it can be ${name}'s ${from} child instead of ${riserName}'s ${dir} child.`,
        `${method}(${name})`,
        { roles, tags, carried: middle, hidden: [middle], extra: [{ from: top, to: middle, kind: 'moved' }], fix: row, beat: 'carry', key: true },
      )
    }

    link(top, from, middle)
    link(riser, dir, top)
    // The picture needs the riser where the old top was. Until the next step, the link from above is drawn as still pointing at the old top.
    if (holder === null) {
      work.root = riser
      node(riser).parent = null
    } else {
      node(holder)[holderSide as Side] = riser
      node(riser).parent = holder
    }
    const holderName = holder === null ? 'root' : `${val(holder)}`
    push(
      `${riserName} moves up and ${name} becomes its ${dir} child. But ${holderName} still points to ${name}, so nothing points to ${riserName} yet.`,
      `${method}(${name})  →  returns the node holding ${riserName}`,
      {
        roles, tags, fresh: [top], fix: row, beat: 'swing', key: true,
        hidden: holder === null ? [] : [riser],
        extra: holder === null ? [] : [{ from: holder, to: top, kind: 'stale' }],
        rootAt: holder === null ? top : null,
      },
    )

    if (holder !== null) fixHeight(holder)
    push(
      holder === null
        ? `Attach ${riserName} where ${name} was. ${name} was the root, so root points to ${riserName} now and ${riserName}'s parent is null.`
        : `Attach ${riserName} where ${name} was: ${val(holder)}'s ${holderSide} link points to ${riserName} now.`,
      holder === null ? `root = that node;  ${riserName}.setParent(null)` : `${val(holder)}.set${capital(holderSide as Side)}(that node)`,
      { roles, fresh: holder === null ? [] : [riser], rootLit: holder === null, fix: row, beat: 'attach', key: true },
    )
    return riser
  }

  /* ----- the six methods ----- */

  const summary = () => {
    const tall = treeHeight(work)
    return tall < 0 ? 'The tree is empty.' : `The tree has height ${tall}, so a search never looks at more than ${nodesWord(tall + 1)}.`
  }

  const add = (value: number): RunResult => {
    const call = `add(${value})`
    if (work.root === null) {
      work.nodes[value] = leaf(value)
      work.root = value
      push(`The tree is empty, so ${value} becomes the root. A node with no children is a leaf, and a leaf has height 0.`, `root = new BinaryNode<>(${value})`, { roles: { [value]: 'new' }, rootLit: true })
      print('true')
      push(`${value} is in. ${summary()}`, `${call}  →  true`)
      return done({ method: 'add', value })
    }

    const walk = descend(value, 'it goes')
    if (walk.hit !== null) {
      print('false')
      push(
        `${lead(walk)}${value} is already here. A value is only stored once, so nothing changes.`,
        `${call}  →  false`,
        { roles: { [walk.hit]: 'found' }, note: compareNote(walk.hit, value), down: walk.path.slice(1) },
      )
      return done(null)
    }

    const end = walk.end as number
    const side = walk.side as Side
    push(
      `${lead(walk)}${value} is ${value < val(end) ? 'smaller' : 'bigger'} than ${val(end)}, and ${val(end)} has no ${side} child. That empty spot is where ${value} belongs.`,
      compareCode(value, val(end)),
      { roles: { [end]: 'visit' }, note: compareNote(end, value), ghost: { parent: end, side, text: `${value}`, tone: 'spot' }, down: walk.path.slice(1) },
    )

    work.nodes[value] = leaf(value)
    link(end, side, value)
    push(
      `A new leaf for ${value} becomes ${val(end)}'s ${side} child. The link goes both ways: ${val(end)} points down to ${value}, and ${value}'s parent points back up to ${val(end)}.`,
      `${val(end)}.set${capital(side)}(new BinaryNode<>(${value}))`,
      { roles: { [value]: 'new' }, fresh: [value] },
    )

    climb(end, value)
    print('true')
    push(`${value} is in. ${summary()}`, `${call}  →  true`)
    return done({ method: 'add', value })
  }

  /** Takes out a node that has no children or one child, and returns the node above the gap. */
  const detach = (gone: number, opening: string, call: string, down: number[]): number | null => {
    const child = node(gone).left ?? node(gone).right
    const holder = node(gone).parent
    const side = holder === null ? null : sideOf(gone)

    if (child === null) {
      push(
        `${opening}It has no children, so just detach it${holder === null ? '' : ` from its parent, ${val(holder)}`}.`,
        call,
        { roles: { [gone]: 'target' }, down, cut: holder === null ? [] : [gone] },
      )
      delete work.nodes[gone]
      if (holder === null) {
        work.root = null
        push('It was the only node, so root is null now and the tree is empty.', 'root = null', { rootLit: true })
      } else {
        link(holder, side as Side, null)
        push(`${val(holder)}'s ${side} link is null now.`, `${val(holder)}.set${capital(side as Side)}(null)`, { roles: { [holder]: 'visit' } })
      }
      return holder
    }

    const childName = val(child)
    push(
      `${opening}It has one child, ${childName}, so ${childName} moves up and takes its place.`,
      call,
      { roles: { [gone]: 'target', [child]: 'up' }, tags: { [child]: 'up' }, down },
    )
    delete work.nodes[gone]
    if (holder === null) {
      work.root = child
      node(child).parent = null
      push(`It was the root, so root points to ${childName} now and ${childName}'s parent is null.`, `root = that child;  ${childName}.setParent(null)`, { roles: { [child]: 'up' }, rootLit: true })
    } else {
      link(holder, side as Side, child)
      push(
        `${val(holder)}'s ${side} link points to ${childName} now, and ${childName}'s parent is ${val(holder)}.`,
        `${val(holder)}.set${capital(side as Side)}(that child)`,
        { roles: { [child]: 'up' }, fresh: [child] },
      )
    }
    return holder
  }

  const remove = (value: number): RunResult => {
    const call = `remove(${value})`
    if (work.root === null) {
      print('false')
      push('The tree is empty, so there is nothing to remove.', `${call}  →  false`)
      return done(null)
    }

    const walk = descend(value, 'look')
    if (walk.hit === null) {
      const end = walk.end as number
      const side = walk.side as Side
      print('false')
      push(
        `${lead(walk)}${value} is ${value < val(end) ? 'smaller' : 'bigger'} than ${val(end)}, but ${val(end)} has no ${side} child. ${value} is not in the tree, so nothing changes.`,
        `${call}  →  false`,
        { roles: { [end]: 'visit' }, note: compareNote(end, value), ghost: { parent: end, side, text: `${value}`, tone: 'missing' }, down: walk.path.slice(1) },
      )
      return done(null)
    }

    const target = walk.hit
    const down = walk.path.slice(1)
    let gap: number | null
    if (node(target).left !== null && node(target).right !== null) {
      push(
        `${lead(walk)}Found ${value}. It has two children, so this node stays where it is and gets a new value: the next bigger one.`,
        call,
        { roles: { [target]: 'target' }, down },
      )
      let next = node(target).right as number
      const trail = [next]
      while (node(next).left !== null) {
        next = node(next).left as number
        trail.push(next)
      }
      const nextName = val(next)
      push(
        `Go right once, then left as far as you can. That stops at ${nextName}, the smallest value on ${value}'s right side.`,
        call,
        { roles: { [target]: 'target', [next]: 'next' }, down: trail },
      )
      node(target).value = nextName
      push(
        `Copy ${nextName} into the node that held ${value}. For a moment ${nextName} is in the tree twice.`,
        `node.setValue(${nextName})`,
        { roles: { [target]: 'new', [next]: 'target' }, down: trail },
      )
      gap = detach(next, `Now remove the old ${nextName} node. `, call, [])
    } else {
      gap = detach(target, `${lead(walk)}Found ${value}. `, call, down)
    }

    climb(gap, null)
    work = tidy(work)
    print('true')
    push(`${value} is gone. ${summary()}`, `${call}  →  true`)
    return done({ method: 'remove', value })
  }

  const contains = (value: number): RunResult => {
    const call = `contains(${value})`
    if (work.root === null) {
      print('false')
      push(`The tree is empty, so ${value} is not here.`, `${call}  →  false`)
      return done(null)
    }
    const walk = descend(value, 'look')
    const looks = walk.path.length
    const count = `${looks === 1 ? '1 look' : `${looks} looks`} for ${nodesWord(sizeNow())}`
    if (walk.hit !== null) {
      print('true')
      push(
        `${lead(walk)}Found ${value}. That took ${count}: every look throws away a whole side of the tree.`,
        `${call}  →  true`,
        { roles: { [walk.hit]: 'found' }, note: compareNote(walk.hit, value), down: walk.path.slice(1) },
      )
      return done(null)
    }
    const end = walk.end as number
    const side = walk.side as Side
    print('false')
    push(
      `${lead(walk)}${value} is ${value < val(end) ? 'smaller' : 'bigger'} than ${val(end)}, but ${val(end)} has no ${side} child. ${value} is not in the tree. That took ${count}.`,
      `${call}  →  false`,
      { roles: { [end]: 'visit' }, note: compareNote(end, value), ghost: { parent: end, side, text: `${value}`, tone: 'missing' }, down: walk.path.slice(1) },
    )
    return done(null)
  }

  const extreme = (which: 'min' | 'max'): RunResult => {
    const side: Side = which === 'min' ? 'left' : 'right'
    const [size, most] = which === 'min' ? ['smaller', 'smallest'] : ['bigger', 'biggest']
    if (work.root === null) {
      print('null')
      push(`The tree is empty, so there is no ${most} value.`, `${which}()  →  null`)
      return done(null)
    }
    const path = [work.root]
    let at = work.root
    while (node(at)[side] !== null) {
      const next = node(at)[side] as number
      push(
        `${path.length === 1 ? 'Start at the root. ' : ''}${val(at)} has a ${side} child, and everything on that side is ${size}. Keep going ${side}.`,
        `${which}()`,
        { roles: { [at]: 'visit' }, down: [...path.slice(1), next] },
      )
      at = next
      path.push(at)
    }
    print(`${val(at)}`)
    push(
      `${path.length === 1 ? 'Start at the root. ' : ''}${val(at)} has no ${side} child, so nothing is ${size}. ${val(at)} is the ${most} value.`,
      `${which}()  →  ${val(at)}`,
      { roles: { [at]: 'found' }, down: path.slice(1) },
    )
    return done(null)
  }

  const list = (): RunResult => {
    const order = inOrder(work)
    const text = textOf(work)
    if (!order.length) {
      print(text)
      push('The tree is empty, so the list is empty too.', `toString()  →  ${text}`, { sorted: 0 })
      return done(null)
    }
    order.forEach((id, index) => {
      push(
        index === 0
          ? `Read the tree from left to right. For every node: its whole left side first, then the node, then its whole right side. First is ${val(id)}.`
          : `Next is ${val(id)}.`,
        'toString()',
        { roles: { [id]: 'visit' }, sorted: index + 1 },
      )
    })
    print(text)
    push('Left to right is smallest to biggest, because smaller values always go left.', `toString()  →  ${text}`, { sorted: order.length })
    return done(null)
  }

  /** The rotations-only view: fixes one node that is out of balance, and nothing else. */
  const fixOnly = (at: number): RunResult => {
    const before = treeHeight(work)
    const top = rebalance(at, '', [])
    for (let above = node(top).parent; above !== null; above = node(above).parent) fixHeight(above)
    const after = treeHeight(work)
    push(
      `Done. Read left to right, it is still ${valuesOf(work).join(', ')}: a rotation never changes the order. The tree went from height ${before} to height ${after}.`,
      '',
      { sorted: sizeNow() },
    )
    return done(null)
  }

  /* ----- which call ----- */

  if (method === 'fix') return fixOnly(Number(arg))
  if (method === 'min' || method === 'max') return extreme(method)
  if (method === 'toString') return list()

  const typed = arg.trim()
  if (!/^\d+$/.test(typed)) return refuse(`${method} needs a whole number from ${MIN_VALUE} to ${MAX_VALUE}.`)
  const value = Number(typed)
  if (value > MAX_VALUE) return refuse(`This demo only takes values from ${MIN_VALUE} to ${MAX_VALUE}.`)
  if (method === 'add' && sizeNow() >= MAX_NODES && !work.nodes[value]) {
    return refuse(`The picture has room for ${MAX_NODES} values. Remove one to make room.`)
  }
  if (method === 'add') return add(value)
  if (method === 'remove') return remove(value)
  return contains(value)
}

/** Builds a tree from scratch by running the same adds and removes again. */
export function replay(history: Change[], balance: boolean): Tree {
  return history.reduce((tree, change) => run(tree, balance, change.method, `${change.value}`).tree, EMPTY_TREE)
}

/* ---------- Rotations on their own ---------- */

/**
 * The steps of one row of the fix table and nothing else: a small tree that
 * already leans, the check that finds the lean, the rotation or two that fix
 * it, and the tree it leaves.
 */
export function rotationDemo(row: number, example: ExampleId): Frame[] {
  const spec = ROTATION_EXAMPLES.find(candidate => candidate.id === example) ?? ROTATION_EXAMPLES[0]
  const values = spec.adds[row] ?? spec.adds[0]
  // Added with nothing rearranged, so the tree leans and every height is right.
  const leaning = values.reduce((tree, value) => perform(tree, false, 'add', `${value}`).tree, EMPTY_TREE)
  const tipped = inOrder(leaning).find(id => Math.abs(balanceOf(leaning, id)) > 1)
  return tipped === undefined ? [restFrame(leaning)] : perform(leaning, true, 'fix', `${tipped}`).frames
}

/* ---------- Ideas for the prompt ---------- */

export interface Idea { arg: string; label: string }

/** Values worth trying for a method. The first one is what the prompt starts with. */
export function suggestions(tree: Tree, method: Method): Idea[] {
  const values = valuesOf(tree)
  const have = new Set(values)
  const missing = () => {
    for (let value = 1; value <= MAX_VALUE; value++) if (!have.has(value)) return value
    return MIN_VALUE
  }
  const idea = (value: number, note = ''): Idea => ({ arg: `${value}`, label: note ? `${value} (${note})` : `${value}` })
  const kids = (id: number) => (tree.nodes[id].left === null ? 0 : 1) + (tree.nodes[id].right === null ? 0 : 1)
  // Deepest nodes first, so the ideas reach down into the tree.
  const depths = layoutTree(tree).spots
  const deepFirst = [...inOrder(tree)].sort((a, b) => depths[b].depth - depths[a].depth)

  if (method === 'add') {
    const ideas: Idea[] = []
    const biggest = values.length ? values[values.length - 1] : 0
    ideas.push(idea(biggest < MAX_VALUE ? biggest + 1 : missing()))
    // A value that lands somewhere inside the tree, when there is a gap for one.
    const gap = values.find((value, index) => index > 0 && value - values[index - 1] > 1)
    if (gap !== undefined) ideas.push(idea(gap - 1))
    else if (values.length && values[0] > MIN_VALUE) ideas.push(idea(values[0] - 1))
    if (tree.root !== null) ideas.push(idea(tree.nodes[tree.root].value, 'already there'))
    return ideas
  }

  if (method === 'remove') {
    const ideas: Idea[] = []
    const none = deepFirst.find(id => kids(id) === 0)
    const one = deepFirst.find(id => kids(id) === 1)
    const two = [...deepFirst].reverse().find(id => kids(id) === 2)
    if (none !== undefined) ideas.push(idea(tree.nodes[none].value, 'no children'))
    if (one !== undefined) ideas.push(idea(tree.nodes[one].value, 'one child'))
    if (two !== undefined) ideas.push(idea(tree.nodes[two].value, 'two children'))
    ideas.push(idea(missing(), 'not there'))
    return ideas
  }

  if (method === 'contains') {
    const ideas: Idea[] = []
    if (deepFirst.length) ideas.push(idea(tree.nodes[deepFirst[0]].value))
    ideas.push(idea(missing(), 'not there'))
    return ideas
  }

  return []
}
