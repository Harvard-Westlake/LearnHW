import { describe, expect, it } from 'vitest'
import {
  BOOT_COMMAND,
  COMMANDS,
  MAX_DEPTH,
  MAX_NODES,
  SAMPLE_SCRIPT,
  boot,
  childByName,
  countOf,
  depthOf,
  heightOf,
  layoutTree,
  pathOf,
  run,
  sizeOf,
  suggestions,
  type FsState,
  type RunResult,
} from './model'

/** A running Navigator on a new, empty file system. */
function fresh(): FsState {
  return boot().state as FsState
}

/** Runs commands in order and returns the final state. */
function after(state: FsState, ...lines: string[]): FsState {
  return lines.reduce((current, line) => run(current, line).state as FsState, state)
}

const printed = (result: RunResult) => result.output.map(line => line.text).join('\n')
const says = (state: FsState, line: string) => printed(run(state, line))

/** The tree FileSystemTester builds, with currentDirectory back at the root. */
function sample(): FsState {
  return after(fresh(), ...SAMPLE_SCRIPT)
}

function idOf(state: FsState, path: string): number {
  const found = Object.values(state.nodes).find(node => pathOf(state, node.id) === path)
  if (!found) throw new Error(`no node at ${path}`)
  return found.id
}

describe('java Navigator', () => {
  it('builds a root folder named "/" with no parent and starts there', () => {
    const state = fresh()
    const root = state.nodes[state.root]
    expect(root).toMatchObject({ name: '/', kind: 'folder', parent: null, children: [] })
    expect(state.cwd).toBe(state.root)
    expect(pathOf(state, state.root)).toBe('/')
  })

  it('shows the objects appearing in constructor order', () => {
    const { frames } = boot()
    expect(frames[0].program).toEqual({ tree: false, rootLinked: false, navigator: false })
    expect(frames.map(frame => frame.build?.stage ?? 'done')).toEqual(
      ['hidden', 'hidden', 'call', 'core', 'ring', 'linked', 'done', 'done'])
    expect(frames.slice(0, -1).every(frame => frame.cursor === null)).toBe(true)
    expect(frames[frames.length - 1].cursor).toBe(1)
    expect(frames[frames.length - 1].program).toEqual({ tree: true, rootLinked: true, navigator: true })
  })
})

describe('building, as FileSystemTester checks it', () => {
  it('adds folders and files and rejects a name that is already taken', () => {
    const state = after(fresh(), 'mkdir docs', 'mkdir src', 'touch main.java 120', 'touch README.md 80')
    expect(countOf(state, state.root)).toBe(5)

    for (const line of ['mkdir docs', 'touch main.java 5', 'touch docs 5', 'mkdir README.md']) {
      const result = run(state, line)
      expect(result.state).toBe(state)
      expect(result.output[0].kind).toBe('err')
      expect(result.frames[result.frames.length - 1].error).not.toBeNull()
    }
    expect(countOf(state, state.root)).toBe(5)
    expect(sizeOf(state, state.root)).toBe(200)
  })

  it('builds a new node in layers: FileSystemNode core, then the subclass ring, then listed by its parent', () => {
    const result = run(fresh(), 'mkdir docs')
    const created = childByName(result.state as FsState, 1, 'docs')
    expect(created).toMatchObject({ kind: 'folder', parent: 1, children: [] })
    expect(result.frames.map(frame => frame.build?.stage)).toEqual(['hidden', 'call', 'core', 'ring', 'linked'])
    expect(result.frames.every(frame => frame.build?.id === created?.id)).toBe(true)
    expect(result.frames.map(frame => frame.code)).toEqual([
      'currentDirectory.addFolder("docs")',
      'new FolderNode("docs", this)',
      'super("docs", parent)',
      'this.children = new ArrayList<>()',
      'addFolder("docs")  →  true',
    ])
  })

  it('passes the parent first when it makes a FileNode', () => {
    const result = run(fresh(), 'touch notes.txt 100')
    expect(childByName(result.state as FsState, 1, 'notes.txt')).toMatchObject({ kind: 'file', size: 100, children: [] })
    expect(result.frames[1].code).toBe('new FileNode(this, "notes.txt", 100)')
    expect(result.frames[3].code).toBe('this.size = 100')
  })
})

describe('depth, height, size and node count on the sample tree', () => {
  const state = sample()
  const root = state.root
  const docs = idOf(state, '/docs')
  const reports = idOf(state, '/docs/reports')
  const q1 = idOf(state, '/docs/reports/q1.txt')
  const src = idOf(state, '/src')

  it('matches the flat tree before nesting', () => {
    const flat = after(fresh(), 'mkdir docs', 'mkdir src', 'touch main.java 120', 'touch README.md 80')
    expect(depthOf(flat, flat.root)).toBe(0)
    expect(heightOf(flat, flat.root)).toBe(1)
    expect(sizeOf(flat, flat.root)).toBe(200)
    expect(countOf(flat, flat.root)).toBe(5)
  })

  it('matches the root', () => {
    expect(heightOf(state, root)).toBe(3)
    expect(sizeOf(state, root)).toBe(280)
    expect(countOf(state, root)).toBe(8)
  })

  it('matches docs and reports', () => {
    expect([depthOf(state, docs), heightOf(state, docs), sizeOf(state, docs), countOf(state, docs)]).toEqual([1, 2, 80, 4])
    expect([depthOf(state, reports), heightOf(state, reports)]).toEqual([2, 1])
  })

  it('matches a file and an empty folder', () => {
    expect([depthOf(state, q1), heightOf(state, q1), sizeOf(state, q1), countOf(state, q1)]).toEqual([3, 0, 50, 1])
    expect([heightOf(state, src), sizeOf(state, src), countOf(state, src)]).toEqual([0, 0, 1])
  })

  it('builds full paths without a double slash', () => {
    expect(pathOf(state, root)).toBe('/')
    expect(pathOf(state, docs)).toBe('/docs')
    expect(pathOf(state, reports)).toBe('/docs/reports')
    expect(pathOf(state, idOf(state, '/main.java'))).toBe('/main.java')
    expect(pathOf(state, q1)).toBe('/docs/reports/q1.txt')
  })

  it('only looks at direct children by name', () => {
    expect(state.nodes[root].children).toHaveLength(4)
    expect(childByName(state, root, 'docs')?.kind).toBe('folder')
    expect(childByName(state, root, 'main.java')?.kind).toBe('file')
    expect(childByName(state, root, 'missing')).toBeNull()
    expect(childByName(state, root, 'q1.txt')).toBeNull()
    expect(state.nodes[docs].parent).toBe(root)
  })
})

describe('Navigator commands', () => {
  it('prints what the tester looks for', () => {
    let state = fresh()
    expect(says(state, 'pwd')).toBe('/')
    state = after(state, 'mkdir docs', 'touch a.txt 100')
    expect(says(state, 'ls')).toBe('docs\na.txt')
    expect(says(state, 'count')).toBe('3')
    expect(says(state, 'size')).toBe('100')
    expect(says(state, 'height')).toBe('1')
    expect(says(state, 'depth')).toBe('0')

    state = after(state, 'cd docs')
    expect(says(state, 'pwd')).toBe('/docs')
    expect(says(state, 'depth')).toBe('1')

    state = after(state, 'mkdir reports', 'cd reports')
    expect(says(state, 'pwd')).toBe('/docs/reports')
  })

  it('walks every kind of cd path', () => {
    const start = after(fresh(), 'mkdir docs', 'cd docs', 'mkdir reports', 'cd reports')
    const where = (state: FsState, path: string) => {
      const next = after(state, `cd ${path}`)
      return pathOf(next, next.cwd)
    }
    expect(where(start, '..')).toBe('/docs')
    expect(where(start, '.')).toBe('/docs/reports')
    expect(where(start, '/')).toBe('/')
    expect(where(after(start, 'cd /'), '..')).toBe('/')
    expect(where(after(start, 'cd /'), '/docs/reports')).toBe('/docs/reports')
    expect(where(start, '../..')).toBe('/')
    expect(where(after(start, 'cd /'), 'docs/reports')).toBe('/docs/reports')
    expect(where(after(after(start, 'cd /'), 'mkdir src'), 'docs/../src')).toBe('/src')
  })

  it('moves the cursor one step at a time and lands on the new folder', () => {
    const state = sample()
    const result = run(state, 'cd docs/reports')
    const walked = result.frames.map(frame => pathOf(state, frame.cursor as number))
    expect(walked).toEqual(['/', '/docs', '/docs/reports', '/docs/reports'])
    expect(result.frames[1]).toMatchObject({ via: 'children', lit: [idOf(state, '/docs')] })

    const up = run(result.state as FsState, 'cd ..')
    expect(up.frames[0]).toMatchObject({ via: 'parent', lit: [idOf(state, '/docs/reports')] })
  })

  it('prints tree with four spaces for each level', () => {
    expect(says(sample(), 'tree')).toBe([
      'docs',
      '    reports',
      '        q1.txt',
      '    notes.txt',
      'src',
      'main.java',
      'README.md',
    ].join('\n'))
    expect(says(fresh(), 'tree')).toBe('')
  })

  it('reports unknown commands and ignores an empty line', () => {
    const state = fresh()
    expect(says(state, 'dance')).toBe('Unrecognized command: dance')
    expect(run(state, '   ')).toMatchObject({ state, output: [] })
  })

  it('ends the program on quit', () => {
    expect(run(sample(), 'quit').state).toBeNull()
  })
})

describe('bad input prints a message and changes nothing', () => {
  const state = after(fresh(), 'mkdir docs', 'touch a.txt 100')
  const badLines = [
    'cd nope', 'cd a.txt', 'cd docs/nope', 'cd', 'mkdir', 'touch', 'touch b.txt',
    'touch b.txt abc', 'touch b.txt 1.5', 'touch b.txt 99999999999', 'mkdir docs', 'touch a.txt 5', 'find',
  ]

  it.each(badLines)('%s', line => {
    const result = run(state, line)
    expect(result.state).toBe(state)
    expect(result.output).toHaveLength(1)
    expect(result.output[0].kind).toBe('err')
  })

  it('leaves the cursor where it started after a walk that fails part-way', () => {
    const result = run(state, 'cd docs/nope')
    const last = result.frames[result.frames.length - 1]
    expect(last.cursor).toBe(state.root)
    expect(result.frames.some(frame => frame.error === idOf(state, '/docs'))).toBe(true)
  })

  it('points at the file when cd is given a file', () => {
    const result = run(state, 'cd a.txt')
    expect(result.frames.some(frame => frame.error === idOf(state, '/a.txt'))).toBe(true)
  })
})

describe('find, the stretch challenge', () => {
  const state = after(sample(), 'cd src', 'touch notes.txt 10', 'cd /')

  it('prints every match under the current folder', () => {
    expect(says(state, 'find notes.txt')).toBe('/docs/notes.txt\n/src/notes.txt')
    expect(says(state, 'find q1.txt')).toBe('/docs/reports/q1.txt')
    expect(says(state, 'find reports')).toBe('/docs/reports')
  })

  it('only searches from the current folder down', () => {
    expect(says(after(state, 'cd docs'), 'find notes.txt')).toBe('/docs/notes.txt')
  })

  it('never matches the current folder itself', () => {
    const inDocs = after(state, 'cd docs')
    expect(run(inDocs, 'find docs').output[0].kind).toBe('err')
  })

  it('says so when nothing matches', () => {
    const result = run(state, 'find missing.txt')
    expect(result.output).toEqual([{ text: 'find: "missing.txt" not found under /', kind: 'err' }])
    expect(result.frames[result.frames.length - 1].matches).toEqual([])
  })

  it('lights the matches and prints each one as it is found', () => {
    const result = run(state, 'find notes.txt')
    const last = result.frames[result.frames.length - 1]
    expect(last.matches.map(id => pathOf(state, id))).toEqual(['/docs/notes.txt', '/src/notes.txt'])
    expect(result.frames.map(frame => frame.lines)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 2, 2])
  })
})

describe('animation frames', () => {
  const state = after(sample(), 'cd docs')
  const lines = [
    'mkdir images', 'touch plan.txt 7', 'cd reports', 'cd ..', 'cd /src', 'ls', 'pwd', 'tree',
    'count', 'size', 'depth', 'height', 'find q1.txt', 'find nope', 'cd nope', 'mkdir reports', 'dance', 'quit',
  ]

  it.each(lines)('%s ends on a frame that shows all output and the real current folder', line => {
    const result = run(state, line)
    expect(result.frames.length).toBeGreaterThan(0)
    const last = result.frames[result.frames.length - 1]
    expect(last.lines).toBe(result.output.length)
    if (result.state) expect(last.cursor).toBe(result.state.cwd)
    for (const frame of result.frames) {
      expect(frame.caption).not.toMatch(/—/)
      expect(frame.lines).toBeLessThanOrEqual(result.output.length)
      const known = result.state ?? state
      for (const id of [...frame.focus, ...frame.matches, ...frame.lit]) expect(known.nodes[id]).toBeDefined()
    }
  })

  it('gives every node its answer, children before parents', () => {
    const result = run(sample(), 'size')
    const full = sample()
    const last = result.frames[result.frames.length - 1]
    expect(Object.keys(last.badges)).toHaveLength(8)
    expect(last.badges[idOf(full, '/docs')]).toBe('80')
    expect(last.badges[full.root]).toBe('280')
    const order = result.frames.slice(1, -1).map(frame => pathOf(full, frame.focus[0]))
    expect(order).toEqual(['/docs/reports/q1.txt', '/docs/reports', '/docs/notes.txt', '/docs', '/src', '/main.java', '/README.md', '/'])
  })

  it('climbs parent links for pwd and depth', () => {
    const deep = after(sample(), 'cd docs/reports')
    for (const line of ['pwd', 'depth']) {
      const result = run(deep, line)
      expect(result.frames).toHaveLength(4)
      expect(result.frames[2]).toMatchObject({ via: 'parent' })
      expect(result.frames[3].focus.map(id => pathOf(deep, id))).toEqual(['/docs/reports', '/docs', '/'])
    }
    expect(run(deep, 'depth').frames[3].badges).toEqual({ [idOf(deep, '/docs')]: '1', [deep.root]: '2' })
  })
})

describe('layout', () => {
  it('gives every leaf its own row and centers each folder on its children', () => {
    const state = sample()
    const layout = layoutTree(state)
    expect(layout.rows).toBe(5)
    expect(layout.deepest).toBe(3)
    expect(layout.depth[idOf(state, '/docs/reports/q1.txt')]).toBe(3)
    expect(layout.row[idOf(state, '/docs/reports')]).toBe(0)
    expect(layout.row[idOf(state, '/docs')]).toBe(0.5)
    expect(layout.row[state.root]).toBe(2.25)
    expect(layoutTree(fresh())).toMatchObject({ rows: 1, deepest: 0 })
  })
})

describe('demo limits', () => {
  it('stops adding when the picture is full, with a note instead of an error', () => {
    let state = fresh()
    for (let index = 0; index < MAX_NODES + 3; index++) state = after(state, `touch f${index} 1`)
    expect(Object.keys(state.nodes)).toHaveLength(MAX_NODES)
    const result = run(state, 'touch another 1')
    expect(result.state).toBe(state)
    expect(result.output[0].kind).toBe('note')
  })

  it('stops nesting past the last column', () => {
    let state = fresh()
    for (let level = 0; level < MAX_DEPTH + 2; level++) state = after(state, `mkdir d${level}`, `cd d${level}`)
    expect(layoutTree(state).deepest).toBe(MAX_DEPTH)
    expect(run(state, 'touch deep.txt 1').output[0].kind).toBe('note')
  })
})

describe('terminal helpers', () => {
  it('has one button per Navigator command', () => {
    expect(COMMANDS.map(spec => spec.name).sort()).toEqual(
      ['cd', 'count', 'depth', 'find', 'height', 'ls', 'mkdir', 'pwd', 'quit', 'size', 'touch', 'tree'])
    expect(BOOT_COMMAND).toBe('java Navigator')
    for (const spec of COMMANDS) expect(spec.help).not.toMatch(/—/)
  })

  it('starts each prompt with arguments that work', () => {
    const state = sample()
    for (const spec of COMMANDS) {
      if (!spec.args.length) {
        expect(suggestions(state, spec.name)).toEqual([])
        continue
      }
      const [first] = suggestions(state, spec.name)
      expect(first).toHaveLength(spec.args.length)
      const result = run(state, [spec.name, ...first].join(' '))
      expect(result.output.every(line => line.kind === 'out')).toBe(true)
    }
  })

  it('suggests names that are still free, then one that should be refused', () => {
    const state = sample()
    expect(suggestions(state, 'mkdir')).toEqual([['reports'], ['images'], ['tests'], ['docs']])
    expect(suggestions(state, 'touch')[0]).toEqual(['notes.txt', '30'])
    expect(suggestions(state, 'cd')).toEqual([['docs'], ['src'], ['/'], ['/docs/reports'], ['nope']])
    expect(suggestions(state, 'find')[0]).toEqual(['notes.txt'])
    expect(suggestions(fresh(), 'cd')).toEqual([['/'], ['nope']])
  })
})
