import { describe, expect, it } from 'vitest'
import {
  CHECKS,
  EMPTY_TREE,
  FIX_ROWS,
  MAX_NODES,
  METHODS,
  ROTATION_EXAMPLES,
  ROTATION_STEPS,
  balanceOf,
  bestHeight,
  inOrder,
  layoutTree,
  replay,
  rotationDemo,
  run,
  sizeOf,
  suggestions,
  textOf,
  treeHeight,
  valuesOf,
  type Call,
  type Change,
  type ExampleId,
  type Frame,
  type Tree,
} from './model'

/* The numbers here are the "check yourself" lists of the assignment, Stage 1
   (rebalancing off) and Stage 2 (rebalancing on). */

const build = (values: number[], balance: boolean, from: Tree = EMPTY_TREE) =>
  values.reduce((tree, value) => run(tree, balance, 'add', `${value}`).tree, from)

const play = (calls: Call[], balance: boolean) =>
  calls.reduce((tree, call) => run(tree, balance, call.method, call.arg).tree, EMPTY_TREE)

const rootOf = (tree: Tree) => (tree.root === null ? null : tree.nodes[tree.root])
const kid = (tree: Tree, value: number, side: 'left' | 'right') => tree.nodes[value][side]

/** Everything the assignment says must stay true: order, parents, heights, and one id per value. */
function expectHonest(tree: Tree, balanced: boolean) {
  const seen: number[] = []
  const check = (id: number | null, parent: number | null, low: number, high: number): number => {
    if (id === null) return -1
    const node = tree.nodes[id]
    expect(node.id).toBe(node.value)
    expect(node.parent).toBe(parent)
    expect(node.value).toBeGreaterThan(low)
    expect(node.value).toBeLessThan(high)
    seen.push(id)
    const left = check(node.left, id, low, node.value)
    const right = check(node.right, id, node.value, high)
    expect(node.height).toBe(1 + Math.max(left, right))
    if (balanced) expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
    return node.height
  }
  check(tree.root, null, -Infinity, Infinity)
  expect(seen.length).toBe(sizeOf(tree))
}

describe('Stage 1: no rebalancing', () => {
  it('adding 1 to 7 in order makes a stick', () => {
    const tree = build([1, 2, 3, 4, 5, 6, 7], false)
    expect(treeHeight(tree)).toBe(6)
    expect(rootOf(tree)?.value).toBe(1)
    expectHonest(tree, false)
  })

  it('adding 4, 2, 6, 1, 3, 5, 7 makes a level tree', () => {
    const tree = build([4, 2, 6, 1, 3, 5, 7], false)
    expect(treeHeight(tree)).toBe(2)
    expect(rootOf(tree)?.value).toBe(4)
  })

  it('remove(4) puts the next bigger value in the root', () => {
    const before = build([4, 2, 6, 1, 3, 5, 7], false)
    const result = run(before, false, 'remove', '4')
    const tree = result.tree
    expect(result.output.map(line => line.text)).toEqual(['true'])
    expect(rootOf(tree)?.value).toBe(5)
    expect(kid(tree, 5, 'right')).toBe(6)
    expect(kid(tree, 6, 'left')).toBeNull()
    expect(kid(tree, 6, 'right')).toBe(7)
    expect(textOf(tree)).toBe('[1, 2, 3, 5, 6, 7]')
    expectHonest(tree, false)
  })

  it('a new value always becomes a leaf and nothing else moves', () => {
    const before = build([4, 2, 6], false)
    const after = run(before, false, 'add', '5').tree
    expect(after.nodes[5]).toMatchObject({ left: null, right: null, parent: 6, height: 0 })
    expect(after.nodes[4]).toMatchObject({ left: 2, right: 6, parent: null })
    expect(after.nodes[2]).toEqual(before.nodes[2])
  })
})

describe('Stage 2: AVL rebalancing', () => {
  it('adding 1 to 7 in order stays level', () => {
    const tree = build([1, 2, 3, 4, 5, 6, 7], true)
    expect(treeHeight(tree)).toBe(2)
    expect(rootOf(tree)?.value).toBe(4)
    expect(kid(tree, 4, 'left')).toBe(2)
    expect(kid(tree, 4, 'right')).toBe(6)
    expectHonest(tree, true)
  })

  it('adding 3, 1, 2 takes a double rotation', () => {
    const last = run(build([3, 1], true), true, 'add', '2')
    expect(rootOf(last.tree)?.value).toBe(2)
    expect(kid(last.tree, 2, 'left')).toBe(1)
    expect(kid(last.tree, 2, 'right')).toBe(3)
    expect(last.frames.some(frame => frame.fix === 1)).toBe(true)
    expect(last.frames.filter(frame => frame.caption.startsWith('Step ')).map(frame => frame.caption.slice(0, 12))).toEqual(['Step 1 of 2.', 'Step 2 of 2.'])
  })

  it('remove(1) from 2, 1, 4, 3, 5 uses the tie rule', () => {
    const result = run(build([2, 1, 4, 3, 5], true), true, 'remove', '1')
    const tree = result.tree
    expect(rootOf(tree)?.value).toBe(4)
    expect(kid(tree, 4, 'left')).toBe(2)
    expect(kid(tree, 4, 'right')).toBe(5)
    expect(kid(tree, 2, 'right')).toBe(3)
    expect(kid(tree, 2, 'left')).toBeNull()
    // A child balance of 0 counts as "0 or less": one rotation, row 3 of the table.
    expect(result.frames.some(frame => frame.fix === 2)).toBe(true)
    expect(result.frames.some(frame => frame.fix === 3)).toBe(false)
    expectHonest(tree, true)
  })

  it('picks each row of the fix table', () => {
    const rowsUsed = (values: number[]) => {
      const last = run(build(values.slice(0, -1), true), true, 'add', `${values[values.length - 1]}`)
      return [...new Set(last.frames.map(frame => frame.fix).filter(row => row !== null))]
    }
    expect(rowsUsed([3, 2, 1])).toEqual([0])   // +2, left child leans left: rotate right
    expect(rowsUsed([3, 1, 2])).toEqual([1])   // +2, left child leans right: left then right
    expect(rowsUsed([1, 2, 3])).toEqual([2])   // -2, right child leans right: rotate left
    expect(rowsUsed([1, 3, 2])).toEqual([3])   // -2, right child leans left: right then left
    for (const values of [[3, 2, 1], [3, 1, 2], [1, 2, 3], [1, 3, 2]]) {
      const tree = build(values, true)
      expect(rootOf(tree)?.value).toBe(2)
      expect(valuesOf(tree)).toEqual([1, 2, 3])
    }
  })

  it('the mirror tie: a left child with balance 0 gets one right rotation', () => {
    const result = run(build([4, 2, 5, 1, 3], true), true, 'remove', '5')
    expect(rootOf(result.tree)?.value).toBe(2)
    expect(kid(result.tree, 2, 'right')).toBe(4)
    expect(kid(result.tree, 4, 'left')).toBe(3)
    expect(result.frames.some(frame => frame.fix === 0)).toBe(true)
    expect(result.frames.some(frame => frame.fix === 1)).toBe(false)
  })

  it('a remove can need more than one fix', () => {
    const check = CHECKS.on.find(candidate => candidate.id === 'two-fixes')
    expect(check).toBeDefined()
    const calls = check?.calls ?? []
    const before = play(calls.slice(0, -1), true)
    // The adds alone never rotate: the list is the tree written level by level.
    expect(calls.slice(0, -1).every((_, index) => {
      const partial = play(calls.slice(0, index), true)
      return run(partial, true, 'add', calls[index].arg).frames.every(frame => frame.fix === null)
    })).toBe(true)
    const result = run(before, true, 'remove', '12')
    const leaning = result.frames.filter(frame => frame.caption.includes('leans too far'))
    expect(leaning.map(frame => frame.note?.node)).toEqual([11, 8])
    expect(rootOf(result.tree)?.value).toBe(5)
    expectHonest(result.tree, true)
  })

  it('a rotation never changes the left-to-right order', () => {
    const result = run(build([1, 2, 3, 4, 5, 6], true), true, 'add', '7')
    for (const frame of result.frames) {
      const values = valuesOf(frame.tree)
      expect(values).toEqual([...values].sort((a, b) => a - b))
    }
  })

  it('during a rotation the link from above is drawn stale, then attached', () => {
    const result = run(build([1, 2], true), true, 'add', '3')
    const stale = result.frames.find(frame => frame.rootAt !== null)
    expect(stale?.rootAt).toBe(1)
    expect(stale?.tree.root).toBe(2)
    const attached = result.frames[result.frames.indexOf(stale as Frame) + 1]
    expect(attached.rootLit).toBe(true)
    expect(attached.rootAt).toBeNull()

    // Not at the root: the parent's link is the stale one.
    const deeper = run(build([2, 1, 3, 4], true), true, 'add', '5')
    const swing = deeper.frames.find(frame => frame.extra.some(link => link.kind === 'stale'))
    expect(swing?.extra).toEqual([{ from: 2, to: 3, kind: 'stale' }])
    expect(swing?.hidden).toEqual([4])
    expect(deeper.tree.nodes[2].right).toBe(4)
  })

  it('the middle subtree changes parent', () => {
    // 2 over (1, 4 over (3, 5)), then 6: rotate left at 2 and 3 moves from 4 to 2.
    const result = run(build([2, 1, 4, 3, 5], true), true, 'add', '6')
    const carry = result.frames.find(frame => frame.extra.some(link => link.kind === 'moved'))
    expect(carry?.carried).toBe(3)
    expect(carry?.extra).toEqual([{ from: 2, to: 3, kind: 'moved' }])
    expect(carry?.hidden).toEqual([3])
    expect(result.tree.nodes[3].parent).toBe(2)
    expect(result.tree.nodes[2].right).toBe(3)
    expect(rootOf(result.tree)?.value).toBe(4)
  })
})

describe('the checks on the page', () => {
  it('every check ends the way its text says', () => {
    const final = (stage: 'on' | 'off', id: string) => {
      const check = CHECKS[stage].find(candidate => candidate.id === id)
      expect(check).toBeDefined()
      return play(check?.calls ?? [], stage === 'on')
    }
    expect(treeHeight(final('off', 'stick'))).toBe(6)
    expect(treeHeight(final('off', 'bushy'))).toBe(2)
    expect(textOf(final('off', 'remove-root'))).toBe('[1, 2, 3, 5, 6, 7]')
    expect(rootOf(final('on', 'in-order'))?.value).toBe(4)
    expect(rootOf(final('on', 'zig-zag'))?.value).toBe(2)
    expect(rootOf(final('on', 'tie'))?.value).toBe(4)
    expect(rootOf(final('on', 'two-fixes'))?.value).toBe(5)
  })

  it('fits the picture', () => {
    for (const check of [...CHECKS.on, ...CHECKS.off]) {
      expect(check.calls.filter(call => call.method === 'add').length).toBeLessThanOrEqual(MAX_NODES)
    }
  })
})

describe('contains, min, max and toString', () => {
  const tree = build([4, 2, 6, 1, 3, 5, 7], false)
  const answer = (method: Parameters<typeof run>[2], arg = '', from = tree) => run(from, false, method, arg).output.map(line => line.text)

  it('contains walks one path', () => {
    const found = run(tree, false, 'contains', '3')
    expect(found.output[0].text).toBe('true')
    expect(found.frames.length).toBe(3)
    expect(found.frames[2].roles[3]).toBe('found')
    expect(answer('contains', '9')).toEqual(['false'])
    expect(run(tree, false, 'contains', '9').frames.at(-1)?.ghost).toMatchObject({ parent: 7, side: 'right', tone: 'missing' })
    expect(answer('contains', '4', EMPTY_TREE)).toEqual(['false'])
  })

  it('min and max follow one edge of the tree', () => {
    expect(answer('min')).toEqual(['1'])
    expect(answer('max')).toEqual(['7'])
    expect(answer('min', '', EMPTY_TREE)).toEqual(['null'])
    expect(answer('max', '', EMPTY_TREE)).toEqual(['null'])
    expect(run(tree, false, 'min').frames.at(-1)?.roles[1]).toBe('found')
  })

  it('toString lists the values in order, in the TreeSet format', () => {
    expect(answer('toString')).toEqual(['[1, 2, 3, 4, 5, 6, 7]'])
    expect(answer('toString', '', build([5], false))).toEqual(['[5]'])
    expect(answer('toString', '', EMPTY_TREE)).toEqual(['[]'])
    const frames = run(tree, false, 'toString').frames
    expect(frames.map(frame => frame.sorted)).toEqual([1, 2, 3, 4, 5, 6, 7, 7])
  })

  it('none of them change the tree', () => {
    for (const [method, arg] of [['contains', '3'], ['contains', '9'], ['min', ''], ['max', ''], ['toString', '']] as const) {
      const result = run(tree, false, method, arg)
      expect(result.tree).toEqual(tree)
      expect(result.change).toBeNull()
    }
  })
})

describe('add and remove', () => {
  it('a value is only stored once', () => {
    const tree = build([4, 2, 6], false)
    const again = run(tree, false, 'add', '6')
    expect(again.output[0].text).toBe('false')
    expect(again.tree).toEqual(tree)
    expect(again.change).toBeNull()
  })

  it('removing a value that is not there changes nothing', () => {
    const tree = build([4, 2, 6], true)
    const result = run(tree, true, 'remove', '5')
    expect(result.output[0].text).toBe('false')
    expect(result.tree).toEqual(tree)
    expect(result.change).toBeNull()
    expect(run(EMPTY_TREE, true, 'remove', '5').output[0].text).toBe('false')
  })

  it('handles the three situations', () => {
    const tree = build([4, 2, 6, 1, 7], false)
    const none = run(tree, false, 'remove', '1').tree
    expect(none.nodes[2]).toMatchObject({ left: null, height: 0 })
    const one = run(tree, false, 'remove', '6').tree
    expect(one.nodes[4].right).toBe(7)
    expect(one.nodes[7].parent).toBe(4)
    const two = run(tree, false, 'remove', '4').tree
    expect(two.root).toBe(6)
    expect(two.nodes[6]).toMatchObject({ left: 2, right: 7, parent: null })
    for (const result of [none, one, two]) expectHonest(result, false)
  })

  it('removing the root in each situation moves root', () => {
    expect(run(build([5], false), false, 'remove', '5').tree).toEqual(EMPTY_TREE)
    const oneChild = run(build([5, 8, 9], false), false, 'remove', '5').tree
    expect(oneChild.root).toBe(8)
    expect(oneChild.nodes[8].parent).toBeNull()
    const twoChildren = run(build([5, 3, 8], false), false, 'remove', '5').tree
    expect(twoChildren.root).toBe(8)
    expect(twoChildren.nodes[8]).toMatchObject({ left: 3, right: null, parent: null, height: 1 })
  })

  it('the next bigger value can sit deeper and have a right child', () => {
    // 5 over (2, 9 over (7 over (-, 8), -)): the next value after 5 is 7, and 8 moves up.
    const tree = build([5, 2, 9, 7, 8], false)
    const result = run(tree, false, 'remove', '5')
    expect(result.tree.root).toBe(7)
    expect(result.tree.nodes[9].left).toBe(8)
    expect(result.tree.nodes[8].parent).toBe(9)
    // While it runs, the old node keeps its id and the value shows twice for a moment.
    const copy = result.frames.find(frame => frame.code.startsWith('node.setValue'))
    expect(copy?.tree.nodes[5].value).toBe(7)
    expect(copy?.tree.nodes[7].value).toBe(7)
    expectHonest(result.tree, false)
  })

  it('stays honest through a long mixed run, in both stages', () => {
    for (const balance of [false, true]) {
      let seed = 20261117
      const next = () => { seed = (seed * 48271) % 2147483647; return seed }
      let tree = EMPTY_TREE
      const mirror = new Set<number>()
      for (let step = 0; step < 400; step++) {
        const value = next() % 30
        const removing = next() % 3 === 0 || sizeOf(tree) >= MAX_NODES
        const result = run(tree, balance, removing ? 'remove' : 'add', `${value}`)
        const expected = removing ? mirror.delete(value) : !mirror.has(value) && !!mirror.add(value)
        expect(result.output[0].text).toBe(`${expected}`)
        expect(result.change === null).toBe(!expected)
        tree = result.tree
        expectHonest(tree, balance)
        expect(valuesOf(tree)).toEqual([...mirror].sort((a, b) => a - b))
      }
    }
  })
})

describe('frames', () => {
  const samples: { tree: Tree; balance: boolean; call: Call }[] = [
    { tree: EMPTY_TREE, balance: true, call: { method: 'add', arg: '5' } },
    { tree: build([1, 2], true), balance: true, call: { method: 'add', arg: '3' } },
    { tree: build([3, 1], true), balance: true, call: { method: 'add', arg: '2' } },
    { tree: build([1, 2, 3, 4, 5, 6], false), balance: false, call: { method: 'add', arg: '7' } },
    { tree: build([4, 2, 6, 1, 3, 5, 7], false), balance: false, call: { method: 'remove', arg: '4' } },
    { tree: build([2, 1, 4, 3, 5], true), balance: true, call: { method: 'remove', arg: '1' } },
    { tree: build([4, 2, 6], true), balance: true, call: { method: 'contains', arg: '9' } },
    { tree: build([4, 2, 6], true), balance: true, call: { method: 'toString', arg: '' } },
    { tree: build([4, 2, 6], true), balance: true, call: { method: 'max', arg: '' } },
  ]

  it('every call has frames and ends on the tree it returns', () => {
    for (const sample of samples) {
      const result = run(sample.tree, sample.balance, sample.call.method, sample.call.arg)
      expect(result.frames.length).toBeGreaterThan(0)
      const last = result.frames[result.frames.length - 1]
      expect(last.tree).toEqual(result.tree)
      expect(last.lines).toBe(result.output.length)
      expect(last.code).toContain('→')
    }
  })

  it('the answer is printed with the last step, not before', () => {
    for (const sample of samples) {
      const result = run(sample.tree, sample.balance, sample.call.method, sample.call.arg)
      expect(result.output.length).toBe(1)
      expect(result.frames.slice(0, -1).every(frame => frame.lines === 0)).toBe(true)
    }
  })

  it('every frame is a whole tree the picture can draw', () => {
    for (const sample of samples) {
      for (const frame of run(sample.tree, sample.balance, sample.call.method, sample.call.arg).frames) {
        const { spots, order } = layoutTree(frame.tree)
        expect(order.length).toBe(sizeOf(frame.tree))
        const ids = new Set(order)
        for (const id of order) {
          const node = frame.tree.nodes[id]
          if (node.parent !== null) expect(spots[id].depth).toBe(spots[node.parent].depth + 1)
        }
        for (const id of [...Object.keys(frame.roles).map(Number), ...frame.down, ...frame.up, ...frame.fresh, ...frame.cut, ...frame.hidden]) expect(ids.has(id)).toBe(true)
        for (const link of frame.extra) expect(ids.has(link.from) && ids.has(link.to)).toBe(true)
        for (const id of [frame.measure, frame.carried, frame.rootAt, frame.note?.node, frame.ghost?.parent]) if (id != null) expect(ids.has(id)).toBe(true)
      }
    }
  })

  it('captions are plain sentences with no long dashes', () => {
    for (const sample of samples) {
      for (const frame of run(sample.tree, sample.balance, sample.call.method, sample.call.arg).frames) {
        expect(frame.caption.length).toBeGreaterThan(0)
        expect(frame.caption).not.toMatch(/[—–]/)
        expect(frame.caption).toMatch(/[.:]$/)
        expect(frame.caption).not.toMatch(/undefined|NaN|null null/)
      }
    }
  })

  it('heights that change are flagged', () => {
    const result = run(build([4, 2], false), false, 'add', '1')
    const attach = result.frames.find(frame => frame.fresh.includes(1))
    expect(attach?.bumped).toEqual([2])
    const climbToRoot = result.frames.find(frame => frame.roles[4] === 'visit' && frame.up.length > 0)
    expect(climbToRoot?.bumped).toEqual([4])
  })

  it('with rebalancing off nothing is ever measured or rotated', () => {
    const tree = build([1, 2, 3, 4, 5, 6, 7], false)
    const frames = run(tree, false, 'add', '8').frames
    expect(frames.every(frame => frame.measure === null && frame.fix === null && frame.extra.length === 0)).toBe(true)
    expect(Math.min(...inOrder(tree).map(id => balanceOf(tree, id)))).toBe(-6)
  })
})

describe('rotations on their own', () => {
  const demos = ROTATION_EXAMPLES.flatMap(example =>
    FIX_ROWS.map((_, row) => ({ kind: example.id, row, frames: rotationDemo(row, example.id) })))
  const ofKind = (kind: ExampleId) => demos.filter(demo => demo.kind === kind)
  const zigzag = (row: number) => row % 2 === 1
  /** The step where the two nodes have swapped and the link from above still points at the old top. */
  const swings = (frames: Frame[]) => frames.filter(frame => frame.rootAt !== null || frame.extra.some(link => link.kind === 'stale'))
  const carries = (frames: Frame[]) => frames.filter(frame => frame.extra.some(link => link.kind === 'moved'))

  it('has one example of each kind for every row of the fix table', () => {
    expect(demos.length).toBe(FIX_ROWS.length * ROTATION_EXAMPLES.length)
    for (const example of ROTATION_EXAMPLES) expect(example.adds.length).toBe(FIX_ROWS.length)
  })

  it('starts on an honest tree with exactly one node out of balance, and opens on that node', () => {
    for (const { frames } of demos) {
      const start = frames[0].tree
      expectHonest(start, false)
      const tipped = inOrder(start).filter(id => Math.abs(balanceOf(start, id)) > 1)
      expect(tipped.length).toBe(1)
      expect(Math.abs(balanceOf(start, tipped[0]))).toBe(2)
      expect(frames[0].roles).toEqual({ [tipped[0]]: 'heavy' })
      expect(frames[0].measure).toBe(tipped[0])
    }
  })

  it('uses the row it was asked for and no other', () => {
    for (const { row, frames } of demos) {
      const rows = new Set(frames.map(frame => frame.fix).filter(fix => fix !== null))
      expect([...rows]).toEqual([row])
      const lean = balanceOf(frames[0].tree, Number(Object.keys(frames[0].roles)[0]))
      expect(lean).toBe(row < 2 ? 2 : -2)
    }
  })

  it('takes one rotation for a straight line and two for a zig-zag', () => {
    for (const { row, frames } of demos) {
      expect(swings(frames).length).toBe(zigzag(row) ? 2 : 1)
      expect(frames.some(frame => frame.caption.startsWith('Step 2 of 2.'))).toBe(zigzag(row))
    }
  })

  it('every rotation changes its links in the same order: middle, swap, attach', () => {
    for (const { kind, row, frames } of demos) {
      const beats = frames.map(frame => frame.beat).filter(beat => beat !== null)
      const one = kind === 'middle' ? ['carry', 'swing', 'attach'] : ['swing', 'attach']
      expect(beats).toEqual(zigzag(row) ? [...one, ...one] : one)
      expect(frames.filter(frame => frame.beat === 'swing')).toEqual(swings(frames))
      expect(frames.filter(frame => frame.beat === 'carry')).toEqual(carries(frames))
    }
    expect(ROTATION_STEPS.map(step => step.beat)).toEqual(['carry', 'swing', 'attach'])
  })

  it('ends level, in the same order and one level shorter, and says so', () => {
    for (const { frames } of demos) {
      const first = frames[0].tree
      const closing = frames[frames.length - 1]
      expectHonest(closing.tree, true)
      expect(valuesOf(closing.tree)).toEqual(valuesOf(first))
      expect(treeHeight(closing.tree)).toBe(treeHeight(first) - 1)
      expect(closing.caption).toContain(`still ${valuesOf(first).join(', ')}:`)
      expect(closing.caption).toContain(`from height ${treeHeight(first)} to height ${treeHeight(closing.tree)}.`)
      expect(closing.sorted).toBe(sizeOf(first))
      expect(Object.values(frames[frames.length - 2].roles)).toEqual(['fixed'])
    }
  })

  it('the three values show root moving to the new top', () => {
    for (const { frames } of ofKind('small')) {
      expect(sizeOf(frames[0].tree)).toBe(3)
      expect(carries(frames).length).toBe(0)
      const last = swings(frames).at(-1) as Frame
      expect(last.rootAt).toBe(frames[0].tree.root)
      expect(frames[frames.indexOf(last) + 1].rootLit).toBe(true)
      expect(valuesOf(frames[frames.length - 1].tree)).toEqual([1, 2, 3])
      expect(frames[frames.length - 1].tree.root).toBe(2)
    }
  })

  it('the middle values change parent: once per rotation', () => {
    for (const { row, frames } of ofKind('middle')) {
      const moved = carries(frames)
      expect(moved.length).toBe(zigzag(row) ? 2 : 1)
      for (const frame of moved) {
        const [link] = frame.extra
        expect(frame.carried).toBe(link.to)
        expect(frame.hidden).toEqual([link.to])
        // The new parent is on the other side of it from the old one, so it stays between the same two values.
        const oldParent = frame.tree.nodes[link.to].parent as number
        expect(Math.sign(link.to - oldParent)).toBe(-Math.sign(link.to - link.from))
      }
    }
  })

  it('below a parent, the link from above is the one that has to be fixed', () => {
    for (const { frames } of ofKind('parent')) {
      const root = frames[0].tree.root as number
      expect(frames.every(frame => frame.rootAt === null && !frame.rootLit && frame.tree.root === root)).toBe(true)
      const last = swings(frames).at(-1) as Frame
      const stale = last.extra.find(link => link.kind === 'stale')
      expect(stale?.from).toBe(root)
      const attach = frames[frames.indexOf(last) + 1]
      expect(attach.fresh.length).toBe(1)
      expect(attach.tree.nodes[attach.fresh[0]].parent).toBe(root)
      expect(attach.bumped).toContain(root)
    }
  })

  it('every step is a whole tree with a plain caption, and nothing is printed', () => {
    for (const { frames } of demos) {
      expect(frames.length).toBeGreaterThanOrEqual(7)
      for (const frame of frames) {
        const { order } = layoutTree(frame.tree)
        expect(order.length).toBe(sizeOf(frame.tree))
        const ids = new Set(order)
        for (const id of [...Object.keys(frame.roles).map(Number), ...frame.fresh, ...frame.hidden]) expect(ids.has(id)).toBe(true)
        for (const link of frame.extra) expect(ids.has(link.from) && ids.has(link.to)).toBe(true)
        expect(order.map(id => frame.tree.nodes[id].value)).toEqual(valuesOf(frames[0].tree))
        expect(frame.caption.length).toBeGreaterThan(0)
        expect(frame.caption).not.toMatch(/[—–]/)
        expect(frame.caption).toMatch(/[.:]$/)
        expect(frame.caption).not.toMatch(/undefined|NaN|null null|walk back up/)
        expect(frame.lines).toBe(0)
        expect(frame.up).toEqual([])
      }
    }
  })

  it('is the same every time, and does not mind a row that does not exist', () => {
    expect(rotationDemo(1, 'middle')).toEqual(rotationDemo(1, 'middle'))
    expect(rotationDemo(9, 'small')).toEqual(rotationDemo(0, 'small'))
  })
})

describe('layout', () => {
  it('gives every node its own column, in sorted order', () => {
    const tree = build([4, 2, 6, 1, 3, 5, 7], false)
    const { spots, order, rows } = layoutTree(tree)
    expect(order.map(id => tree.nodes[id].value)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(order.map(id => spots[id].rank)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(spots[4].depth).toBe(0)
    expect(rows).toBe(3)
    expect(layoutTree(EMPTY_TREE)).toEqual({ spots: {}, order: [], rows: 0 })
  })

  it('knows the best height a tree could have', () => {
    expect([0, 1, 2, 3, 4, 7, 8, 15].map(bestHeight)).toEqual([-1, 0, 1, 1, 2, 2, 3, 3])
  })
})

describe('switching rebalancing', () => {
  it('replays the same adds and removes in the other stage', () => {
    const history: Change[] = [1, 2, 3, 4, 5, 6, 7].map(value => ({ method: 'add', value }))
    expect(treeHeight(replay(history, false))).toBe(6)
    expect(treeHeight(replay(history, true))).toBe(2)
    expect(replay(history, true)).toEqual(build([1, 2, 3, 4, 5, 6, 7], true))
    const withRemove: Change[] = [...history, { method: 'remove', value: 4 }]
    expect(valuesOf(replay(withRemove, false))).toEqual(valuesOf(replay(withRemove, true)))
    expect(replay([], true)).toEqual(EMPTY_TREE)
  })
})

describe('demo limits and ideas', () => {
  it('holds a limited number of values', () => {
    const full = build(Array.from({ length: MAX_NODES }, (_, index) => index + 1), true)
    expect(sizeOf(full)).toBe(MAX_NODES)
    expect(treeHeight(full)).toBe(3)
    const refused = run(full, true, 'add', '50')
    expect(refused.tree).toEqual(full)
    expect(refused.output).toEqual([{ text: expect.stringContaining('(demo)'), kind: 'note' }])
    // A value that is already there still answers false.
    expect(run(full, true, 'add', '5').output[0]).toEqual({ text: 'false', kind: 'out' })
  })

  it('only takes whole numbers in range', () => {
    for (const arg of ['', 'abc', '-3', '1.5', '100']) {
      const result = run(EMPTY_TREE, true, 'add', arg)
      expect(result.tree).toEqual(EMPTY_TREE)
      expect(result.output[0].kind).toBe('note')
      expect(result.frames.length).toBe(1)
    }
    expect(run(EMPTY_TREE, true, 'add', ' 7 ').tree.root).toBe(7)
  })

  it('suggests something to try for every method that takes a value', () => {
    const tree = build([4, 2, 6, 1, 7], false)
    expect(suggestions(EMPTY_TREE, 'add')[0].arg).toBe('1')
    expect(suggestions(tree, 'add').map(idea => idea.arg)).toEqual(['8', '3', '4'])
    expect(suggestions(tree, 'remove').map(idea => idea.label)).toEqual(['1 (no children)', '2 (one child)', '4 (two children)', '3 (not there)'])
    expect(suggestions(tree, 'contains').map(idea => idea.arg)).toEqual(['1', '3'])
    expect(suggestions(EMPTY_TREE, 'remove').map(idea => idea.label)).toEqual(['1 (not there)'])
    for (const spec of METHODS) {
      const ideas = suggestions(tree, spec.name)
      expect(ideas.length > 0).toBe(spec.takesValue)
      // Following the first idea over and over never gets stuck.
      if (spec.takesValue) expect(run(tree, true, spec.name, ideas[0].arg).frames.length).toBeGreaterThan(0)
    }
  })
})
