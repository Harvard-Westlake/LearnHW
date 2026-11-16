/* ============================================================
 * File System Tree: the simulator behind the Navigator demo.
 *
 * Mirrors the five classes of the File System Tree assignment
 * (FileSystemNode, FolderNode, FileNode, FileSystemTree, Navigator).
 * Every command returns three things: the new state, the lines the
 * Navigator prints, and a list of animation frames saying which objects
 * and links to light up, one step at a time.
 *
 * Frames name the Java call behind each step and what it answers. They
 * never show a method body: students write those.
 *
 * Pure logic, no React. model.test.ts checks it against the same numbers
 * the assignment's FileSystemTester expects.
 * ============================================================ */

/** The picture has room for this many nodes, levels and letters. The assignment has no such limits. */
export const MAX_NODES = 24
export const MAX_DEPTH = 4
export const MAX_NAME = 12

/** What starts the program. Nothing exists until this runs. */
export const BOOT_COMMAND = 'java Navigator'

export type NodeKind = 'folder' | 'file'

export interface FsNode {
  id: number
  kind: NodeKind
  name: string               // FileSystemNode.name
  parent: number | null      // FileSystemNode.parent (null for the root)
  children: number[]         // FolderNode.children, in the order they were added
  size: number               // FileNode.size
}

export interface FsState {
  nodes: Record<number, FsNode>
  root: number               // FileSystemTree.root
  cwd: number                // Navigator.currentDirectory
  nextId: number
}

/** How much of a brand new node exists yet: nothing, the constructor call, the FileSystemNode core, the subclass ring, or all of it listed by its parent. */
export type BuildStage = 'hidden' | 'call' | 'core' | 'ring' | 'linked'

/** Which pointer a step follows: FileSystemNode.parent (up) or FolderNode.children (down). */
export type Via = 'parent' | 'children'

export type LineKind = 'out' | 'err' | 'note'
export interface OutputLine { text: string; kind: LineKind }

export interface Frame {
  caption: string                                   // what is happening, in plain words
  code: string                                      // the Java call behind this step
  cursor: number | null                             // where currentDirectory is drawn
  focus: number[]                                   // nodes being looked at
  matches: number[]                                 // nodes that find matched
  error: number | null                              // the node that stopped the command
  lit: number[]                                     // child ids whose link to their parent is lit
  via: Via | null
  badges: Record<number, string>                    // answers shown on nodes
  build: { id: number; stage: BuildStage } | null
  program: { tree: boolean; rootLinked: boolean; navigator: boolean }
  lines: number                                     // output lines printed so far
}

export interface RunResult {
  state: FsState | null                             // null once the program has quit
  output: OutputLine[]
  frames: Frame[]
}

export type CommandName =
  | 'mkdir' | 'touch' | 'cd' | 'ls' | 'tree' | 'find'
  | 'pwd' | 'depth' | 'height' | 'size' | 'count' | 'quit'

export interface CommandSpec {
  name: CommandName
  args: { label: string; width: number; max: number }[]
  help: string
  java: string
}

/** One entry per terminal button, in button order. */
export const COMMANDS: CommandSpec[] = [
  {
    name: 'mkdir', args: [{ label: 'name', width: 12, max: MAX_NAME }],
    help: 'Make a new, empty folder inside the current folder.',
    java: 'currentDirectory.addFolder(name)',
  },
  {
    name: 'touch', args: [{ label: 'name', width: 12, max: MAX_NAME }, { label: 'size', width: 6, max: 6 }],
    help: 'Make a new file inside the current folder, with a name and a size.',
    java: 'currentDirectory.addFile(name, size)',
  },
  {
    name: 'cd', args: [{ label: 'path', width: 20, max: 60 }],
    help: 'Walk to a different folder. A path with several steps is taken one step at a time, left to right.',
    java: 'getParent() and getChildByName(step)',
  },
  {
    name: 'ls', args: [],
    help: 'Print the name of each thing sitting directly inside the current folder.',
    java: 'currentDirectory.getChildren()',
  },
  {
    name: 'tree', args: [],
    help: 'Print everything under the current folder. Things inside a folder go underneath it, pushed to the right.',
    java: 'getChildren() on every folder, all the way down',
  },
  {
    name: 'find', args: [{ label: 'name', width: 12, max: MAX_NAME }],
    help: 'Stretch challenge. Hunt for a name everywhere under the current folder and print each full address.',
    java: 'currentDirectory.containsNameRecursive(name)',
  },
  {
    name: 'pwd', args: [],
    help: 'Print the full address of the folder you are standing in.',
    java: 'currentDirectory.toString()',
  },
  {
    name: 'depth', args: [],
    help: 'Print how many folders deep you are. The top folder is 0.',
    java: 'currentDirectory.getDepth()',
  },
  {
    name: 'height', args: [],
    help: 'Print how many levels of stuff are underneath the current folder. An empty folder is 0.',
    java: 'currentDirectory.getHeight()',
  },
  {
    name: 'size', args: [],
    help: 'Print the sizes of all the files from here down, added together.',
    java: 'currentDirectory.getSize()',
  },
  {
    name: 'count', args: [],
    help: 'Print how many files and folders there are from here down, counting the current folder itself.',
    java: 'currentDirectory.getTotalNodeCount()',
  },
  {
    name: 'quit', args: [],
    help: 'End the program. Run java Navigator again for a new, empty file system.',
    java: 'shouldExit = true',
  },
]

/** The tree that FileSystemTester builds, typed as Navigator commands. */
export const SAMPLE_SCRIPT = [
  'mkdir docs',
  'mkdir src',
  'touch main.java 120',
  'touch README.md 80',
  'cd docs',
  'mkdir reports',
  'touch notes.txt 30',
  'cd reports',
  'touch q1.txt 50',
  'cd /',
]

/* ---------- questions the classes answer ---------- */

export function childByName(state: FsState, folderId: number, name: string): FsNode | null {
  for (const id of state.nodes[folderId].children) {
    if (state.nodes[id].name === name) return state.nodes[id]
  }
  return null
}

/** FileSystemNode.toString(): "/" for the root, otherwise "/docs/reports". */
export function pathOf(state: FsState, id: number): string {
  const names: string[] = []
  let node = state.nodes[id]
  while (node.parent !== null) {
    names.unshift(node.name)
    node = state.nodes[node.parent]
  }
  return '/' + names.join('/')
}

export function depthOf(state: FsState, id: number): number {
  let climbs = 0
  let node = state.nodes[id]
  while (node.parent !== null) {
    climbs++
    node = state.nodes[node.parent]
  }
  return climbs
}

export function heightOf(state: FsState, id: number): number {
  const children = state.nodes[id].children
  if (!children.length) return 0
  return 1 + Math.max(...children.map(child => heightOf(state, child)))
}

export function sizeOf(state: FsState, id: number): number {
  const node = state.nodes[id]
  if (node.kind === 'file') return node.size
  return node.children.reduce((sum, child) => sum + sizeOf(state, child), 0)
}

export function countOf(state: FsState, id: number): number {
  return state.nodes[id].children.reduce((sum, child) => sum + countOf(state, child), 1)
}

/* ---------- where each node is drawn ---------- */

export interface TreeLayout {
  row: Record<number, number>      // vertical slot; a folder sits halfway between its first and last child
  depth: Record<number, number>    // column
  rows: number
  deepest: number
}

export function layoutTree(state: FsState): TreeLayout {
  const row: Record<number, number> = {}
  const depth: Record<number, number> = {}
  let nextRow = 0
  let deepest = 0
  const place = (id: number, level: number) => {
    depth[id] = level
    deepest = Math.max(deepest, level)
    const children = state.nodes[id].children
    if (!children.length) {
      row[id] = nextRow++
      return
    }
    children.forEach(child => place(child, level + 1))
    row[id] = (row[children[0]] + row[children[children.length - 1]]) / 2
  }
  place(state.root, 0)
  return { row, depth, rows: nextRow, deepest }
}

/* ---------- frame helpers ---------- */

const READY = { tree: true, rootLinked: true, navigator: true }

/** A frame with nothing lit: the tree as it stands, currentDirectory where it is. */
export function restFrame(state: FsState, patch: Partial<Frame> = {}): Frame {
  return {
    caption: '', code: '', cursor: state.cwd, focus: [], matches: [], error: null, lit: [], via: null,
    badges: {}, build: null, program: READY, lines: 0, ...patch,
  }
}

const quote = (text: string) => `"${text}"`
const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`
const label = (node: FsNode) => (node.parent === null ? 'the top folder' : node.name)
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The last frame always shows every printed line. */
function finish(state: FsState | null, output: OutputLine[], frames: Frame[]): RunResult {
  const last = frames.length - 1
  frames[last] = { ...frames[last], lines: output.length }
  return { state, output, frames }
}

/** A command that prints one message and changes nothing. */
function refuse(state: FsState, message: string, caption: string, code: string, kind: LineKind = 'err'): RunResult {
  return finish(state, [{ text: message, kind }], [restFrame(state, { caption, code })])
}

/* ---------- java Navigator ---------- */

export function boot(): RunResult {
  const root: FsNode = { id: 1, kind: 'folder', name: '/', parent: null, children: [], size: 0 }
  const state: FsState = { nodes: { 1: root }, root: 1, cwd: 1, nextId: 2 }
  const nothing = { tree: false, rootLinked: false, navigator: false }
  const treeOnly = { tree: true, rootLinked: false, navigator: false }
  const treeLinked = { tree: true, rootLinked: true, navigator: false }
  const before = (patch: Partial<Frame>) => restFrame(state, { cursor: null, ...patch })
  return finish(state, [{ text: 'Navigator is running on a new, empty file system.', kind: 'note' }], [
    before({
      program: nothing, build: { id: 1, stage: 'hidden' },
      caption: 'The program starts. It asks for a Navigator, and a Navigator needs a file system, so that is built first.',
      code: 'new Navigator(new FileSystemTree())',
    }),
    before({
      program: treeOnly, build: { id: 1, stage: 'hidden' },
      caption: 'A FileSystemTree object appears. Its one job is to hold the top folder, called the root.',
      code: 'new FileSystemTree()',
    }),
    before({
      program: treeOnly, build: { id: 1, stage: 'call' },
      caption: 'Its constructor asks for the root: a folder named "/" with no parent.',
      code: 'this.root = new FolderNode("/", null)',
    }),
    before({
      program: treeOnly, build: { id: 1, stage: 'core' },
      caption: 'Every node starts as a FileSystemNode, which stores a name and a parent. The root has no parent, so it stores null.',
      code: 'super("/", null)',
    }),
    before({
      program: treeOnly, build: { id: 1, stage: 'ring' },
      caption: 'Then the FolderNode layer wraps around it: an empty list of children.',
      code: 'this.children = new ArrayList<>()',
    }),
    before({
      program: treeLinked, build: { id: 1, stage: 'linked' },
      caption: 'The root is finished, and the FileSystemTree keeps a link to it.',
      code: 'root  →  the new FolderNode',
    }),
    before({
      caption: 'Now the Navigator is built. It remembers which file system it is exploring.',
      code: 'this.fileSystem = fst',
    }),
    restFrame(state, {
      caption: 'It starts in the root: currentDirectory points at "/". Ready for commands.',
      code: 'this.currentDirectory = fst.getRoot()',
    }),
  ])
}

/* ---------- mkdir and touch ---------- */

function add(state: FsState, kind: NodeKind, name: string, size: number): RunResult {
  const command = kind === 'folder' ? 'mkdir' : 'touch'
  const here = state.nodes[state.cwd]
  const herePath = pathOf(state, here.id)
  const call = kind === 'folder' ? `addFolder(${quote(name)})` : `addFile(${quote(name)}, ${size})`
  const lookInside = { focus: [here.id, ...here.children], lit: here.children, via: 'children' as const }

  const taken = childByName(state, here.id, name)
  if (taken) {
    return finish(state, [{ text: `${command}: ${quote(name)} is already taken in ${herePath}`, kind: 'err' }], [
      restFrame(state, {
        ...lookInside,
        caption: `${command} asks the current folder to add a ${kind}. First it checks what is already inside ${herePath}.`,
        code: `currentDirectory.${call}`,
      }),
      restFrame(state, {
        error: taken.id,
        caption: `${quote(name)} is already there${taken.kind === kind ? '' : `, and a ${taken.kind} counts too`}. The answer is false, so nothing is added.`,
        code: `${call}  →  false`,
      }),
    ])
  }

  const demoLimit = (text: string) => refuse(
    state, `(demo) ${text} Your Navigator has no such limit.`,
    'This picture ran out of room, so the demo stops here. Nothing was added.', '', 'note',
  )
  if (name.length > MAX_NAME) return demoLimit(`Names in this picture are at most ${MAX_NAME} letters.`)
  if (name.includes('/')) return demoLimit('Names in this picture cannot contain "/".')
  if (Object.keys(state.nodes).length >= MAX_NODES) return demoLimit(`This picture holds at most ${MAX_NODES} files and folders.`)
  if (depthOf(state, here.id) >= MAX_DEPTH) return demoLimit(`This picture draws ${MAX_DEPTH + 1} levels.`)

  const id = state.nextId
  const created: FsNode = { id, kind, name, parent: here.id, children: [], size: kind === 'file' ? size : 0 }
  const next: FsState = {
    ...state,
    nextId: id + 1,
    nodes: { ...state.nodes, [id]: created, [here.id]: { ...here, children: [...here.children, id] } },
  }
  const parentLink = { lit: [id], via: 'parent' as const }
  const className = kind === 'folder' ? 'FolderNode' : 'FileNode'
  return finish(next, [], [
    restFrame(next, {
      ...lookInside, build: { id, stage: 'hidden' },
      caption: `${command} asks the current folder to add a ${kind}. Is the name ${quote(name)} free in ${herePath}? Yes.`,
      code: `currentDirectory.${call}`,
    }),
    restFrame(next, {
      build: { id, stage: 'call' },
      caption: kind === 'folder'
        ? 'It makes a new FolderNode, handing it the name and itself as the parent.'
        : 'It makes a new FileNode. Careful: here the parent comes first.',
      code: kind === 'folder' ? `new FolderNode(${quote(name)}, this)` : `new FileNode(this, ${quote(name)}, ${size})`,
    }),
    restFrame(next, {
      ...parentLink, build: { id, stage: 'core' },
      caption: 'The FileSystemNode part is built first: it stores the name and the parent.',
      code: `super(${quote(name)}, parent)`,
    }),
    restFrame(next, {
      ...parentLink, build: { id, stage: 'ring' },
      caption: kind === 'folder'
        ? 'Then the FolderNode layer wraps around it: an empty list of children.'
        : `Then the FileNode layer wraps around it: the size, ${size}.`,
      code: kind === 'folder' ? 'this.children = new ArrayList<>()' : `this.size = ${size}`,
    }),
    restFrame(next, {
      focus: [id], lit: [id], via: 'children', build: { id, stage: 'linked' },
      caption: `${sentence(label(here))} adds the new ${className} to its children. The answer is true.`,
      code: `${call}  →  true`,
    }),
  ])
}

function mkdir(state: FsState, args: string[]): RunResult {
  if (!args.length) {
    return refuse(state, 'mkdir: missing folder name. Usage: mkdir <name>',
      'mkdir needs a name. The Navigator prints a message and changes nothing.', 'mkdir(args)')
  }
  return add(state, 'folder', args[0], 0)
}

function touch(state: FsState, args: string[]): RunResult {
  if (args.length < 2) {
    return refuse(state, 'touch: missing name or size. Usage: touch <name> <size>',
      'touch needs a name and a size. The Navigator prints a message and changes nothing.', 'touch(args)')
  }
  const [name, sizeText] = args
  const size = Number(sizeText)
  if (!/^[+-]?\d+$/.test(sizeText) || Math.abs(size) > 2147483647) {
    return refuse(state, `touch: size must be a whole number, got ${quote(sizeText)}`,
      `${quote(sizeText)} is not a whole number, so there is no size to store. Nothing is added.`, 'touch(args)')
  }
  return add(state, 'file', name, size)
}

/* ---------- cd ---------- */

function cd(state: FsState, args: string[]): RunResult {
  if (!args.length) {
    return refuse(state, 'cd: missing folder. Usage: cd <path>',
      'cd needs to know where to go. The Navigator prints a message and stays put.', 'cd(args)')
  }
  const path = args[0]
  const start = state.cwd
  const startPath = pathOf(state, start)
  const steps = path.split('/').filter(part => part !== '')
  const frames: Frame[] = []
  let at = start

  if (path.startsWith('/')) {
    at = state.root
    frames.push(restFrame(state, {
      cursor: at, focus: [at],
      caption: 'The path starts with "/", so start walking from the top folder.',
      code: 'fileSystem.getRoot()',
    }))
  } else if (steps.length > 1) {
    frames.push(restFrame(state, {
      focus: [at],
      caption: `${plural(steps.length, 'step')} to take. Start in ${startPath} and go left to right.`,
      code: `cd ${path}`,
    }))
  }

  const stayPut = (message: string, errorAt: number, caption: string, code: string): RunResult => {
    frames.push(restFrame(state, { cursor: at, error: errorAt, caption, code }))
    frames.push(restFrame(state, {
      caption: `One step failed, so none of the walk counts. Still in ${startPath}.`,
      code: `currentDirectory  →  ${startPath}`,
    }))
    return finish(state, [{ text: message, kind: 'err' }], frames)
  }

  for (const step of steps) {
    const here = state.nodes[at]
    if (step === '.') {
      frames.push(restFrame(state, { cursor: at, focus: [at], caption: '"." means this folder: stay where you are.' }))
      continue
    }
    if (step === '..') {
      if (here.parent === null) {
        frames.push(restFrame(state, {
          cursor: at, focus: [at],
          caption: '".." at the top folder: nothing is above it, so stay put.',
          code: 'getParent()  →  null',
        }))
        continue
      }
      const parent = state.nodes[here.parent]
      frames.push(restFrame(state, {
        cursor: parent.id, focus: [parent.id], lit: [at], via: 'parent',
        caption: `".." means go up one folder: follow the parent link to ${label(parent)}.`,
        code: 'getParent()',
      }))
      at = parent.id
      continue
    }
    const child = childByName(state, at, step)
    if (!child) {
      return stayPut(`cd: no folder named ${quote(step)} in ${pathOf(state, at)}`, at,
        `There is nothing named ${quote(step)} inside ${label(here)}.`, `getChildByName(${quote(step)})  →  null`)
    }
    if (child.kind === 'file') {
      return stayPut(`cd: ${quote(step)} is a file, not a folder`, child.id,
        `${quote(step)} is a file, and you can only walk into folders.`, `getChildByName(${quote(step)}).isFolder()  →  false`)
    }
    frames.push(restFrame(state, {
      cursor: child.id, focus: [child.id], lit: [child.id], via: 'children',
      caption: `Look inside ${label(here)} for ${quote(step)}: found, and it is a folder. Step in.`,
      code: `getChildByName(${quote(step)})`,
    }))
    at = child.id
  }

  const next: FsState = { ...state, cwd: at }
  const endPath = pathOf(next, at)
  frames.push(restFrame(next, {
    caption: at === start ? `currentDirectory still points at ${endPath}.` : `currentDirectory now points at ${endPath}.`,
    code: `currentDirectory  →  ${endPath}`,
  }))
  return finish(next, [], frames)
}

/* ---------- looking around ---------- */

function ls(state: FsState): RunResult {
  const here = state.nodes[state.cwd]
  const herePath = pathOf(state, here.id)
  const count = here.children.length
  return finish(state, here.children.map(id => ({ text: state.nodes[id].name, kind: 'out' as const })), [
    restFrame(state, {
      focus: [here.id],
      caption: 'ls asks the current folder for the things sitting directly inside it.',
      code: 'currentDirectory.getChildren()',
    }),
    restFrame(state, {
      focus: here.children, lit: here.children, via: 'children',
      caption: count
        ? `${plural(count, 'thing')} directly inside ${herePath}. Anything deeper is not listed.`
        : `${herePath} is empty, so ls prints nothing.`,
      code: `getChildren()  →  ${count ? `a list of ${count}` : 'an empty list'}`,
    }),
  ])
}

/** Everything under a folder, parents before children, with how many levels below the folder each one is. */
function descendants(state: FsState, folderId: number): { id: number; level: number }[] {
  const order: { id: number; level: number }[] = []
  const walk = (id: number, level: number) => {
    for (const child of state.nodes[id].children) {
      order.push({ id: child, level })
      walk(child, level + 1)
    }
  }
  walk(folderId, 0)
  return order
}

function tree(state: FsState): RunResult {
  const here = state.nodes[state.cwd]
  const herePath = pathOf(state, here.id)
  const order = descendants(state, here.id)
  const printed = order.map(({ id, level }) => '    '.repeat(level) + state.nodes[id].name)
  const frames: Frame[] = [restFrame(state, {
    focus: [here.id],
    caption: 'tree prints everything under the current folder. Things inside a folder go underneath it, pushed to the right.',
    code: 'tree(args)',
  })]
  order.forEach(({ id, level }, index) => {
    const node = state.nodes[id]
    const parent = state.nodes[node.parent as number]
    frames.push(restFrame(state, {
      focus: [id], lit: order.slice(0, index + 1).map(item => item.id), via: 'children', lines: index + 1,
      caption: level === 0
        ? `${node.name} is directly inside ${herePath}: no indent.`
        : `${node.name} is inside ${parent.name}: pushed ${plural(level, 'step')} to the right.`,
      code: `System.out.println(${quote(printed[index])})`,
    }))
  })
  frames.push(restFrame(state, {
    focus: [here.id], lit: order.map(item => item.id), via: 'children',
    caption: order.length
      ? 'Each folder is followed by everything inside it, before the next thing at its own level.'
      : `${herePath} is empty, so tree prints nothing.`,
  }))
  return finish(state, printed.map(text => ({ text, kind: 'out' as const })), frames)
}

function find(state: FsState, args: string[]): RunResult {
  if (!args.length) {
    return refuse(state, 'find: missing name. Usage: find <name>',
      'find needs a name to hunt for. The Navigator prints a message and changes nothing.', 'find(args)')
  }
  const target = args[0]
  const here = state.nodes[state.cwd]
  const herePath = pathOf(state, here.id)
  const order = descendants(state, here.id)
  const matches: number[] = []
  const frames: Frame[] = [restFrame(state, {
    focus: [here.id],
    caption: `find hunts for ${quote(target)} everywhere under ${herePath}: in this folder, in its sub-folders, all the way down.`,
    code: `currentDirectory.containsNameRecursive(${quote(target)})`,
  })]
  order.forEach(({ id }, index) => {
    const node = state.nodes[id]
    const isMatch = node.name === target
    if (isMatch) matches.push(id)
    frames.push(restFrame(state, {
      focus: [id], matches: [...matches], lit: order.slice(0, index + 1).map(item => item.id), via: 'children',
      lines: matches.length,
      caption: isMatch
        ? `${node.name} matches. Print its full address: ${pathOf(state, id)}`
        : `${node.name} is not it.${node.children.length ? ' Look inside.' : ''}`,
      code: isMatch ? 'System.out.println(thatNode)' : '',
    }))
  })
  const found = matches.length > 0
  frames.push(restFrame(state, {
    matches: [...matches], lit: order.map(item => item.id), via: 'children',
    caption: found
      ? `${plural(matches.length, 'match', 'matches')}. The answer is true.`
      : `Nothing named ${quote(target)} under ${herePath}. The answer is false, so find prints a message.`,
    code: `containsNameRecursive(${quote(target)})  →  ${found}`,
  }))
  const output: OutputLine[] = found
    ? matches.map(id => ({ text: pathOf(state, id), kind: 'out' }))
    : [{ text: `find: ${quote(target)} not found under ${herePath}`, kind: 'err' }]
  return finish(state, output, frames)
}

/* ---------- climbing with parent links ---------- */

/** The current folder, then its parent, then its parent's parent, up to the root. */
function ancestors(state: FsState): number[] {
  const chain = [state.cwd]
  let node = state.nodes[state.cwd]
  while (node.parent !== null) {
    chain.push(node.parent)
    node = state.nodes[node.parent]
  }
  return chain
}

function pwd(state: FsState): RunResult {
  const chain = ancestors(state)
  const path = pathOf(state, state.cwd)
  const frames: Frame[] = [restFrame(state, {
    focus: [state.cwd],
    caption: 'pwd prints the full address of the folder you are standing in. Start here and climb to the top.',
    code: 'System.out.println(currentDirectory)',
  })]
  for (let climb = 1; climb < chain.length; climb++) {
    frames.push(restFrame(state, {
      focus: chain.slice(0, climb + 1), lit: chain.slice(0, climb), via: 'parent',
      caption: `Climb to the parent: ${label(state.nodes[chain[climb]])}.`,
      code: 'getParent()',
    }))
  }
  frames.push(restFrame(state, {
    focus: chain, lit: chain.slice(0, -1), via: 'parent',
    caption: chain.length === 1
      ? 'The address of the top folder is just "/".'
      : `Read the names from the top down, with "/" between them: ${path}`,
    code: `toString()  →  ${quote(path)}`,
  }))
  return finish(state, [{ text: path, kind: 'out' }], frames)
}

function depth(state: FsState): RunResult {
  const chain = ancestors(state)
  const climbs = chain.length - 1
  const badges: Record<number, string> = {}
  const frames: Frame[] = [restFrame(state, {
    focus: [state.cwd],
    caption: 'depth counts how many times you can climb before you reach the top folder.',
    code: 'currentDirectory.getDepth()',
  })]
  for (let climb = 1; climb < chain.length; climb++) {
    badges[chain[climb]] = String(climb)
    frames.push(restFrame(state, {
      focus: chain.slice(0, climb + 1), lit: chain.slice(0, climb), via: 'parent', badges: { ...badges },
      caption: `Climb ${climb}: up to ${label(state.nodes[chain[climb]])}.`,
      code: 'getParent()',
    }))
  }
  frames.push(restFrame(state, {
    focus: chain, lit: chain.slice(0, -1), via: 'parent', badges: { ...badges },
    caption: climbs === 0
      ? 'The top folder has no parent, so there is nothing to climb. Depth 0.'
      : `The top folder has no parent, so stop. ${plural(climbs, 'climb')}: depth ${climbs}.`,
    code: `getDepth()  →  ${climbs}`,
  }))
  return finish(state, [{ text: String(climbs), kind: 'out' }], frames)
}

/* ---------- questions every child answers first ---------- */

type Measure = 'height' | 'size' | 'count'

const MEASURES: Record<Measure, { method: string; intro: string }> = {
  height: {
    method: 'getHeight',
    intro: 'height asks how many levels of stuff are underneath the current folder. Each thing inside answers first.',
  },
  size: {
    method: 'getSize',
    intro: 'size adds up every file from here down. Each thing inside answers first.',
  },
  count: {
    method: 'getTotalNodeCount',
    intro: 'count counts the current folder and everything inside it. Each thing inside answers first.',
  },
}

/** Up to six numbers joined by " + "; the rest become "...". */
function sum(values: number[]): string {
  const shown = values.slice(0, 6).map(String)
  if (values.length > 6) shown.push('...')
  return shown.join(' + ')
}

function measure(state: FsState, kind: Measure): RunResult {
  const { method, intro } = MEASURES[kind]
  const here = state.nodes[state.cwd]
  const herePath = pathOf(state, here.id)
  const badges: Record<number, string> = {}
  const frames: Frame[] = [restFrame(state, { focus: [here.id], caption: intro, code: `currentDirectory.${method}()` })]

  const visit = (id: number): number => {
    const node = state.nodes[id]
    const answers = node.children.map(visit)
    const name = sentence(label(node))
    let value: number
    let caption: string
    if (kind === 'height') {
      value = answers.length ? 1 + Math.max(...answers) : 0
      caption = node.kind === 'file' ? `${name} is a file with nothing underneath: height 0.`
        : !answers.length ? `${name} is an empty folder: height 0.`
        : `${name}: 1 + the biggest height inside (${Math.max(...answers)}) = ${value}.`
    } else if (kind === 'size') {
      value = node.kind === 'file' ? node.size : answers.reduce((total, answer) => total + answer, 0)
      caption = node.kind === 'file' ? `${name} is a file: its size is ${value}.`
        : !answers.length ? `${name} is an empty folder: 0.`
        : answers.length === 1 ? `${name} holds one thing, so its size is the same: ${value}.`
        : `${name}: add up what is inside. ${sum(answers)} = ${value}.`
    } else {
      value = answers.reduce((total, answer) => total + answer, 1)
      caption = node.kind === 'file' ? `${name} is one thing: 1.`
        : !answers.length ? `${name} is an empty folder: just itself, 1.`
        : `${name}: itself, plus what is inside. ${sum([1, ...answers])} = ${value}.`
    }
    badges[id] = String(value)
    frames.push(restFrame(state, {
      focus: [id], lit: node.children, via: node.children.length ? 'children' : null, badges: { ...badges },
      caption, code: `${method}()  →  ${value}`,
    }))
    return value
  }
  const answer = visit(here.id)

  frames.push(restFrame(state, {
    focus: [here.id], badges: { ...badges },
    caption: `${kind} prints ${answer}, the answer for ${herePath}.`,
    code: `currentDirectory.${method}()  →  ${answer}`,
  }))
  return finish(state, [{ text: String(answer), kind: 'out' }], frames)
}

/* ---------- the Navigator's switch ---------- */

/** One line typed at the Navigator. Empty lines do nothing. */
export function run(state: FsState, line: string): RunResult {
  const parts = line.trim().split(/\s+/).filter(part => part !== '')
  if (!parts.length) return finish(state, [], [restFrame(state)])
  const [command, ...args] = parts
  switch (command) {
    case 'cd': return cd(state, args)
    case 'ls': return ls(state)
    case 'mkdir': return mkdir(state, args)
    case 'touch': return touch(state, args)
    case 'find': return find(state, args)
    case 'pwd': return pwd(state)
    case 'tree': return tree(state)
    case 'count': return measure(state, 'count')
    case 'size': return measure(state, 'size')
    case 'depth': return depth(state)
    case 'height': return measure(state, 'height')
    case 'quit':
      return finish(null, [{ text: 'Navigator has exited.', kind: 'note' }], [restFrame(state, {
        caption: 'quit ends the loop, and the program is over. Every object it built is gone.',
        code: 'shouldExit = true',
      })])
    default:
      return refuse(state, `Unrecognized command: ${command}`,
        `The Navigator does not know ${quote(command)}. It prints a message and changes nothing.`,
        'processUserInputString(line)')
  }
}

/* ---------- things to try ---------- */

const FOLDER_IDEAS = ['docs', 'src', 'reports', 'images', 'tests', 'drafts', 'archive', 'lib']
const FILE_IDEAS: [string, string][] = [
  ['main.java', '120'], ['README.md', '80'], ['notes.txt', '30'], ['q1.txt', '50'],
  ['todo.txt', '15'], ['data.csv', '200'], ['index.html', '64'], ['a.txt', '100'],
]

/**
 * Argument lists worth trying for a command, given the tree as it stands.
 * The first one is what the prompt starts with. The later ones include an
 * input that should be refused, since the Navigator must never crash.
 */
export function suggestions(state: FsState, command: CommandName): string[][] {
  const here = state.nodes[state.cwd]
  const inside = here.children.map(id => state.nodes[id])
  const taken = new Set(inside.map(node => node.name))
  const everything = Object.values(state.nodes).filter(node => node.parent !== null)

  switch (command) {
    case 'mkdir': {
      const fresh = FOLDER_IDEAS.filter(name => !taken.has(name)).slice(0, 3).map(name => [name])
      if (!fresh.length) fresh.push([`dir${inside.length + 1}`])
      return inside.length ? [...fresh, [inside[0].name]] : fresh
    }
    case 'touch': {
      const fresh = FILE_IDEAS.filter(([name]) => !taken.has(name)).slice(0, 3).map(idea => [...idea])
      if (!fresh.length) fresh.push([`file${inside.length + 1}`, '10'])
      return [...fresh, ['b.txt', 'abc']]
    }
    case 'cd': {
      const options = inside.filter(node => node.kind === 'folder').slice(0, 3).map(node => [node.name])
      if (here.parent !== null) options.push(['..'])
      options.push(['/'])
      const deepest = everything
        .filter(node => node.kind === 'folder' && node.id !== here.id)
        .map(node => pathOf(state, node.id))
        .sort((a, b) => b.split('/').length - a.split('/').length)[0]
      if (deepest && deepest.split('/').length > 2) options.push([deepest])
      options.push(['nope'])
      return options
    }
    case 'find': {
      const names = [...new Set(everything.map(node => node.name))]
      const preferred = names.includes('notes.txt') ? ['notes.txt'] : []
      const others = names.filter(name => name !== 'notes.txt').slice(0, 3 - preferred.length)
      const options = [...preferred, ...others].map(name => [name])
      return [...(options.length ? options : [['notes.txt']]), ['missing.txt']]
    }
    default:
      return []
  }
}
