import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { WidgetShell } from '../../../components/widget'
import { Stage } from './stage'
import {
  CHECKS,
  EMPTY_TREE,
  FIX_ROWS,
  MAX_VALUE,
  METHODS,
  ROTATION_EXAMPLES,
  ROTATION_STEPS,
  replay,
  restFrame,
  rotationDemo,
  run,
  sizeOf,
  suggestions,
  treeHeight,
  type Call,
  type Change,
  type Check,
  type ExampleId,
  type Frame,
  type Idea,
  type Method,
  type OutputLine,
  type Tree,
} from './model'

/* ============================================================
 * Binary Search Tree: Leaning and Rebalancing
 * The picture on the left is the tree. On the right, pick a method, give
 * it a value and press the arrow or Enter; each call plays as a few
 * captioned steps that can be replayed or stepped through by hand.
 *
 * The switch at the top chooses the stage of the assignment: rebalancing
 * on (MyAVL, the default) or off (MyBST). Flipping it rebuilds the tree
 * from the same adds and removes, so the two shapes can be compared.
 *
 * The fix table at the bottom of the controls is also a way in to a third
 * view, rotations only: click a row (or the button on the table) and the
 * picture plays just that fix on a small tree that already leans. The
 * tree being built is left alone and comes back with "Back to my tree".
 *
 * model.ts is the simulator, stage.tsx is the SVG picture. The page
 * chrome (hero, shell, terminal, caption, legend, step bar) is shared
 * with the File System Tree page: the .fs-* rules in secondary.css.
 * ============================================================ */

type Speed = 'slow' | 'normal' | 'fast'

const STEP_MS: Record<Speed, number> = { slow: 1900, normal: 1150, fast: 500 }
/** While a whole check is playing, ordinary steps fly by and the rotation steps get most of a normal beat. */
const SCRIPT_STEP_MS = 170
const SCRIPT_KEY_SHARE = 0.7
const SPEEDS: { id: Speed; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
]
/** Rotations on their own play more slowly: every step there is one to stop and look at. */
const ROTATION_PACE = 1.6
const SCROLLBACK = 80

interface LogEntry { id: number; line: string | null; output: OutputLine[] }

interface Playback {
  frames: Frame[]
  index: number
  entry: number        // the log entry whose answer this playback prints
  auto: boolean        // false once someone steps by hand
  scripted: boolean    // part of a check: play quickly
}

interface Session {
  balance: boolean     // rebalancing on (MyAVL) or off (MyBST)
  tree: Tree
  history: Change[]    // every add and remove that worked, for rebuilding in the other stage
  log: LogEntry[]
  play: Playback | null
  queue: Call[]        // calls still to run from a check
  seq: number
}

const INITIAL: Session = { balance: true, tree: EMPTY_TREE, history: [], log: [], play: null, queue: [], seq: 0 }

/** The rotations-only view: one row of the fix table, played on its own. */
interface Rotations {
  row: number
  frames: Frame[]
  index: number
  auto: boolean
}

const classOf = (balance: boolean) => (balance ? 'MyAVL' : 'MyBST')
const lineOf = (call: Call) => `tree.${call.method}(${call.arg})`
const note = (text: string): OutputLine[] => [{ text, kind: 'note' }]

/** Runs one call and starts its playback. */
function execute(session: Session, call: Call, mode: 'play' | 'script' | 'instant'): Session {
  const result = run(session.tree, session.balance, call.method, call.arg)
  const id = session.seq + 1
  return {
    ...session,
    tree: result.tree,
    history: result.change ? [...session.history, result.change] : session.history,
    seq: id,
    log: [...session.log, { id, line: lineOf(call), output: result.output }].slice(-SCROLLBACK),
    play: { frames: result.frames, index: mode === 'instant' ? result.frames.length - 1 : 0, entry: id, auto: mode !== 'instant', scripted: mode === 'script' },
  }
}

/** Finishes whatever is playing: the last step of the call on screen, and every call still waiting. */
function settle(session: Session): Session {
  if (!session.play) return session
  let next: Session = { ...session, queue: [], play: { ...session.play, index: session.play.frames.length - 1, auto: false } }
  for (const queued of session.queue) next = execute(next, queued, 'instant')
  return next
}

function PlayIcon() {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden="true">
      <path d="M0 0l8 5-8 5z" fill="currentColor" />
    </svg>
  )
}

/** Three dots in the shape a fix is for: a straight line or a zig-zag, leaning left or right. Columns are sorted order, like the picture. */
function LeanIcon({ row }: { row: number }) {
  const leansLeft = row < 2
  const columns = row % 2 === 1 ? [36, 12, 24] : [36, 24, 12]
  const dots = columns.map((x, level) => ({ x: leansLeft ? x : 48 - x, y: 10 + level * 14 }))
  return (
    <svg className="bst-lean" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      <polyline points={dots.map(dot => `${dot.x},${dot.y}`).join(' ')} />
      {dots.map((dot, level) => (
        <circle key={level} className={level === 0 ? 'bst-lean__top' : undefined} cx={dot.x} cy={dot.y} r={5.5} />
      ))}
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 9h12M9.5 4.5L14 9l-4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The color key. Balance numbers and leaning only exist with rebalancing on. */
const legendFor = (balance: boolean): { swatch: string; text: string }[] => [
  { swatch: 'visit', text: 'looking here' },
  { swatch: 'good', text: balance ? 'new, found, fixed' : 'new, found' },
  { swatch: 'bad', text: balance ? 'leaning or leaving' : 'leaving' },
  { swatch: 'move', text: 'moving' },
  { swatch: 'down', text: 'going down' },
  { swatch: 'up', text: 'back up (parent)' },
  { swatch: 'h', text: 'height' },
  ...(balance ? [{ swatch: 'lean', text: 'balance' }] : []),
]

export default function BinarySearchTreeExplorer() {
  const [session, setSession] = useState<Session>(INITIAL)
  const [method, setMethod] = useState<Method>('add')
  const [edit, setEdit] = useState<string | null>(null)   // null: show the suggested value
  const [speed, setSpeed] = useState<Speed>('normal')
  const [checkId, setCheckId] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const [rot, setRot] = useState<Rotations | null>(null)   // null: the tree view
  const [example, setExample] = useState<ExampleId>('small')

  const argRef = useRef<HTMLInputElement>(null)
  const runRef = useRef<HTMLButtonElement>(null)
  const outRef = useRef<HTMLDivElement>(null)
  const submitRef = useRef<() => void>(() => {})

  const { balance, tree, log, play, queue } = session
  const idle = useMemo(() => restFrame(tree), [tree])
  const show = rot ?? play                                  // whichever the picture and the step bar follow
  const frame = show ? show.frames[show.index] : idle
  const lastIndex = show ? show.frames.length - 1 : 0
  const playing = rot
    ? rot.auto && rot.index < lastIndex
    : !!play && play.auto && (play.index < lastIndex || queue.length > 0)

  const spec = METHODS.find(candidate => candidate.name === method) ?? METHODS[0]
  const ideas: Idea[] = suggestions(tree, method)
  const value = spec.takesValue ? (edit ?? ideas[0]?.arg ?? '') : ''
  const call: Call = { method, arg: value.trim() }
  const shownLines = play ? play.frames[play.index].lines : 0
  const rotRow = rot?.row ?? 0
  const fixRow = FIX_ROWS[rotRow]
  const checks = balance ? CHECKS.on : CHECKS.off
  const activeCheck = checks.find(check => check.id === checkId) ?? null

  useEffect(() => {
    const previous = document.title
    document.title = 'Binary Search Tree · Class Resources'
    return () => { document.title = previous }
  }, [])

  /* ----- playback clock ----- */
  useEffect(() => {
    if (!play || !play.auto) return
    if (play.index < play.frames.length - 1) {
      const beat = play.scripted
        ? (play.frames[play.index].key ? Math.round(STEP_MS[speed] * SCRIPT_KEY_SHARE) : SCRIPT_STEP_MS)
        : STEP_MS[speed]
      const timer = window.setTimeout(() => {
        setSession(current => current.play
          ? { ...current, play: { ...current.play, index: Math.min(current.play.index + 1, current.play.frames.length - 1) } }
          : current)
      }, beat)
      return () => window.clearTimeout(timer)
    }
    if (queue.length) {
      // A remove at the end of a check is the call to watch, so it plays at full length.
      const timer = window.setTimeout(() => {
        setSession(current => current.queue.length
          ? execute({ ...current, queue: current.queue.slice(1) }, current.queue[0], current.queue.length === 1 && current.queue[0].method === 'remove' ? 'play' : 'script')
          : current)
      }, SCRIPT_STEP_MS * 2)
      return () => window.clearTimeout(timer)
    }
  }, [play, queue, speed])

  useEffect(() => {
    if (!rot || !rot.auto || rot.index >= rot.frames.length - 1) return
    const timer = window.setTimeout(() => {
      setRot(current => current && { ...current, index: Math.min(current.index + 1, current.frames.length - 1) })
    }, Math.round(STEP_MS[speed] * ROTATION_PACE))
    return () => window.clearTimeout(timer)
  }, [rot, speed])

  useEffect(() => {
    const out = outRef.current
    if (out) out.scrollTop = out.scrollHeight
  }, [log.length, shownLines])

  useEffect(() => {
    if (!focusTick) return
    const input = argRef.current
    if (input) {
      input.focus()
      input.select()
    } else {
      runRef.current?.focus()
    }
  }, [focusTick])

  /* ----- actions ----- */

  const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function submit() {
    if (rot) return
    setSession(current => execute({ ...current, queue: [] }, call, reducedMotion() ? 'instant' : 'play'))
    setEdit(null)
    setCheckId(null)
    setFocusTick(tick => tick + 1)
  }

  useEffect(() => { submitRef.current = submit })

  // Enter runs the prompt even before anything on the page has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.repeat) return
      const active = document.activeElement
      if (active && active !== document.body) return
      event.preventDefault()
      submitRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit()
  }

  function choose(name: Method) {
    setMethod(name)
    setEdit(null)
    setFocusTick(tick => tick + 1)
  }

  function applyIdea(idea: Idea) {
    setEdit(idea.arg)
    setFocusTick(tick => tick + 1)
  }

  /** Flips the stage and rebuilds the tree from the same adds and removes. */
  function switchBalance(on: boolean) {
    setRot(null)
    setSession(current => {
      if (current.balance === on) return current
      const rebuilt = replay(current.history, on)
      const id = current.seq + 1
      const changes = current.history.length
      const tall = treeHeight(rebuilt)
      const said = !changes
        ? `Rebalancing is ${on ? 'on' : 'off'}. ${on ? 'After every add and remove, the tree checks each node on the way back up and fixes any lean.' : 'Nothing is ever rearranged: a new value always becomes a leaf.'}`
        : on
          ? `Rebalancing on. The same adds and removes, played again with a fix after every change: the height is ${tall}.`
          : `Rebalancing off. The same adds and removes, played again with nothing rearranged: the height is ${tall}.`
      return {
        ...current,
        balance: on,
        tree: rebuilt,
        queue: [],
        seq: id,
        log: [...current.log, { id, line: null, output: note(`${classOf(on)}: rebalancing ${on ? 'on' : 'off'}${changes ? `, same ${changes} ${changes === 1 ? 'change' : 'changes'} played again` : ''}`) }].slice(-SCROLLBACK),
        play: { frames: [restFrame(rebuilt, said, `new ${classOf(on)}<>()`)], index: 0, entry: id, auto: false, scripted: false },
      }
    })
    setEdit(null)
    setCheckId(null)
  }

  /** Starts a fresh tree and plays one of the assignment's check lists into it. */
  function runCheck(check: Check) {
    setSession(current => {
      const id = current.seq + 1
      const fresh: Session = {
        ...current,
        tree: EMPTY_TREE,
        history: [],
        queue: [],
        seq: id,
        log: [...current.log, { id, line: `tree = new ${classOf(current.balance)}<>()`, output: [] }].slice(-SCROLLBACK),
        play: null,
      }
      if (reducedMotion()) return check.calls.reduce((built, next) => execute(built, next, 'instant'), fresh)
      const [first, ...rest] = check.calls
      return execute({ ...fresh, queue: rest }, first, rest.length ? 'script' : 'play')
    })
    setEdit(null)
    setCheckId(check.id)
  }

  /** Swaps the picture to one row of the fix table, played on its own. The tree being built waits, finished, behind it. */
  function showRotation(row: number, which: ExampleId = example) {
    setSession(settle)
    setExample(which)
    setRot({ row, frames: rotationDemo(row, which), index: 0, auto: !reducedMotion() })
  }

  function skip() {
    if (rot) {
      setRot(current => current && { ...current, index: current.frames.length - 1, auto: false })
      return
    }
    setSession(settle)
  }

  // Stepping by hand stops the clock and any check still waiting.
  function stepTo(index: number) {
    if (rot) {
      setRot(current => current && { ...current, auto: false, index: Math.max(0, Math.min(index, current.frames.length - 1)) })
      return
    }
    setSession(current => current.play
      ? { ...current, queue: [], play: { ...current.play, auto: false, index: Math.max(0, Math.min(index, current.play.frames.length - 1)) } }
      : current)
  }

  function replayCall() {
    if (rot) {
      setRot(current => current && { ...current, index: 0, auto: !reducedMotion() })
      return
    }
    setSession(current => current.play
      ? { ...current, queue: [], play: { ...current.play, index: 0, auto: !reducedMotion(), scripted: false } }
      : current)
  }

  function startOver() {
    setSession(current => ({ ...INITIAL, balance: current.balance }))
    setEdit(null)
    setCheckId(null)
    setMethod('add')
  }

  const count = sizeOf(tree)
  const defaultSay = balance
    ? 'Rebalancing is on: after every add and remove, the tree checks each node on the way back up and rotates to fix any lean.'
    : 'Rebalancing is off: a new value always becomes a leaf and nothing is ever rearranged.'

  return (
    <main className="page fs-page bst-page">
      <div className="container container--wide">

        <section className="fs-hero">
          <div className="eyebrow">Computer Science Explorer · Trees and Balance</div>
          <h1 className="h2 fs-hero__title">Binary Search Tree: Leaning and Rebalancing</h1>
          <p className="lead fs-hero__lead">
            Smaller values go left, bigger values go right. Add and remove values and watch the tree grow, lean and,
            with rebalancing on, rotate itself level again.
          </p>
        </section>

        <WidgetShell
          className="fs-shell"
          controls={
            <>
              <section className="fs-term" aria-label="Tree controls">
                <div className="fs-term__bar">
                  <span className="fs-term__dots" aria-hidden="true"><i /><i /><i /></span>
                  <span className="fs-term__title">Tester</span>
                  <span className={`fs-term__status${balance || rot ? ' fs-term__status--on' : ''}`}>
                    {rot ? 'rotations only' : `${classOf(balance)} tree, ${count} ${count === 1 ? 'value' : 'values'}`}
                  </span>
                </div>

                <div className="bst-mode" role="group" aria-label="Rebalancing">
                  <button type="button" className="bst-mode__btn" aria-pressed={!rot && balance} onClick={() => switchBalance(true)}>
                    <span className="bst-mode__name">Rebalancing on</span>
                    <span className="bst-mode__note">Stage 2: MyAVL fixes its lean</span>
                  </button>
                  <button type="button" className="bst-mode__btn" aria-pressed={!rot && !balance} onClick={() => switchBalance(false)}>
                    <span className="bst-mode__name">Rebalancing off</span>
                    <span className="bst-mode__note">Stage 1: MyBST never rearranges</span>
                  </button>
                </div>

                {/* The rotation notes lie over the tester, which keeps its room. So the fix table below never moves. */}
                <div className="bst-deck">
                  <div className={`bst-deck__tester${rot ? ' bst-deck__tester--off' : ''}`}>
                    <div className="fs-keys" role="group" aria-label="Tree methods">
                      {METHODS.map(candidate => (
                        <button
                          key={candidate.name}
                          type="button"
                          className="fs-key"
                          aria-pressed={method === candidate.name}
                          title={candidate.help}
                          onClick={() => choose(candidate.name)}
                        >
                          {candidate.name}
                        </button>
                      ))}
                    </div>

                    <form className="fs-prompt" onSubmit={onSubmit}>
                      <span className="fs-prompt__path">tree.</span>
                      <span className="fs-prompt__cmd bst-prompt__call">{method}(</span>
                      {spec.takesValue && (
                        <input
                          ref={argRef}
                          className="fs-prompt__arg"
                          type="text"
                          inputMode="numeric"
                          aria-label={`${method} value`}
                          placeholder="value"
                          size={3}
                          maxLength={`${MAX_VALUE}`.length}
                          spellCheck={false}
                          autoComplete="off"
                          value={value}
                          onChange={event => setEdit(event.target.value.replace(/\s+/g, ''))}
                        />
                      )}
                      <span className="fs-prompt__cmd bst-prompt__call">)</span>
                      <button ref={runRef} type="submit" className="btn fs-prompt__run" title="Run this call (Enter)" aria-label={`Run ${lineOf(call)}`}>
                        <ArrowIcon />
                      </button>
                    </form>

                    <div className="fs-help bst-help">
                      <p className="fs-help__say">{spec.help}</p>
                      {ideas.length > 0 && (
                        <div className="fs-ideas">
                          <span className="fs-ideas__label">Try</span>
                          {ideas.map(idea => (
                            <button key={idea.label} type="button" className="fs-idea" onClick={() => applyIdea(idea)}>
                              {idea.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bst-checks">
                      <div className="fs-ideas">
                        <span className="fs-ideas__label">Check yourself</span>
                        {checks.map(check => (
                          <button
                            key={check.id}
                            type="button"
                            className="fs-idea bst-check"
                            aria-pressed={checkId === check.id}
                            title={check.list}
                            onClick={() => runCheck(check)}
                          >
                            {check.label}
                          </button>
                        ))}
                        <button type="button" className="fs-idea bst-check bst-check--reset" onClick={startOver} disabled={!log.length}>
                          Start over
                        </button>
                      </div>
                      <p className="bst-checks__say" aria-live="polite">
                        {activeCheck
                          ? <><strong>{activeCheck.list}.</strong> Expect: {activeCheck.expect}</>
                          : 'Each one starts a fresh tree and plays a list from the assignment.'}
                      </p>
                    </div>
                  </div>

                  {rot && (
                    <div className="bst-rot">
                      <div className="bst-rot__bar">
                        <span className="bst-rot__eyebrow">Rotations only</span>
                        <button type="button" className="fs-idea bst-rot__back" onClick={() => setRot(null)}>Back to my tree</button>
                      </div>
                      <div className="bst-rot__head">
                        <LeanIcon row={rotRow} />
                        <div>
                          <p className="bst-rot__title">{fixRow.name}</p>
                          <p className="bst-rot__when">For {fixRow.shape}.</p>
                        </div>
                      </div>
                      <p className="bst-rot__say">{fixRow.say}</p>
                      <div className="bst-recipe">
                        <span className="fs-ideas__label">One rotation changes three links, in this order</span>
                        <ol>
                          {ROTATION_STEPS.map(step => (
                            <li key={step.beat} className={frame.beat === step.beat ? 'bst-recipe__on' : undefined} aria-current={frame.beat === step.beat ? 'step' : undefined}>
                              {step.text}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="fs-ideas">
                        <span className="fs-ideas__label">Example</span>
                        {ROTATION_EXAMPLES.map(option => (
                          <button
                            key={option.id}
                            type="button"
                            className="fs-idea bst-check"
                            aria-pressed={example === option.id}
                            title={option.watch}
                            onClick={() => showRotation(rotRow, option.id)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bst-rules">
                  {balance ? (
                    <>
                      <p className="bst-rules__say">
                        <strong>Balance</strong> = left height − right height. Nothing there counts as −1. A node is fine at −1, 0 or 1.
                      </p>
                      <table className="bst-fix">
                        <thead>
                          <tr>
                            <th scope="col">Node</th>
                            <th scope="col">Child</th>
                            <th scope="col" colSpan={2}>
                              Fix
                              <button
                                type="button"
                                className="bst-only"
                                aria-pressed={!!rot}
                                title={rot ? 'Back to the tree you were building' : 'Swap the picture to the four fixes, one at a time'}
                                onClick={() => (rot ? setRot(null) : showRotation(0))}
                              >
                                Rotations only
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {FIX_ROWS.map((row, index) => {
                            const picked = rot?.row === index
                            return (
                              <tr
                                key={row.fix}
                                className={`${frame.fix === index ? 'bst-fix__row--on' : ''}${picked ? ' bst-fix__row--picked' : ''}`.trim() || undefined}
                                title="Watch only this fix"
                                onClick={() => showRotation(index)}
                              >
                                <td>{row.node}</td>
                                <td>{row.child}</td>
                                <td>{row.fix}</td>
                                <td className="bst-fix__go">
                                  {/* The click is handled by the row; the button is here so the keyboard can reach it. */}
                                  <button type="button" className="bst-fix__play" aria-pressed={picked} aria-label={`Watch only this fix: ${row.fix}`}>
                                    <PlayIcon />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <p className="bst-rules__say">
                      <strong>No rearranging.</strong> A new value always becomes a leaf, so the shape of the tree depends only on the
                      order the values were added.
                    </p>
                  )}
                </div>

                <div ref={outRef} className="fs-out bst-out" role="log" aria-label="Calls and their answers" tabIndex={0}>
                  {log.length ? log.map(entry => {
                    // A call's answer appears when its last step does. Notes show at once.
                    const visible = entry.line !== null && play && entry.id === play.entry ? shownLines : entry.output.length
                    return (
                      <div key={entry.id} className="fs-out__entry">
                        {entry.line !== null && <div className="fs-out__cmd"><span className="fs-out__prompt">&gt;</span> {entry.line}</div>}
                        {entry.output.slice(0, visible).map((printed, index) => (
                          <div key={index} className={`fs-out__line fs-out__line--${printed.kind}`}>{printed.text}</div>
                        ))}
                      </div>
                    )
                  }) : (
                    <div className="fs-out__empty">Each call and what it returns shows up here.</div>
                  )}
                </div>
              </section>
            </>
          }
        >
          <div className="fs-main">
            <figure className="fs-stage">
              <div className="fs-stage__scroll">
                {/* A new key starts the picture afresh, so one tree never slides into another. */}
                <Stage key={rot ? `rotation-${rot.row}-${example}` : 'tree'} frame={frame} balance={balance || !!rot} />
              </div>
              <figcaption className="fs-caption" aria-live="polite">
                <p className="fs-caption__say">{frame.caption || defaultSay}</p>
                <p className="fs-caption__java">
                  {frame.code ? <><span className="fs-tag" title="A number in front of a dot means the node holding that value">Java</span>{frame.code}</> : ' '}
                </p>
              </figcaption>
              <ul className="fs-legend" aria-label="Color key">
                {legendFor(balance || !!rot).map(item => (
                  <li key={item.swatch}><span className={`bst-swatch bst-swatch--${item.swatch}`} aria-hidden="true" />{item.text}</li>
                ))}
              </ul>
            </figure>

            <div className="panel fs-steps">
              <button type="button" className="btn btn--outline btn--sm" onClick={replayCall} disabled={!show || show.frames.length < 2}>Replay</button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => stepTo((show?.index ?? 0) - 1)} disabled={!show || show.index === 0}>Back</button>
              <span className="fs-steps__count">{show ? `Step ${show.index + 1} of ${show.frames.length}` : 'No steps yet'}</span>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => stepTo((show?.index ?? 0) + 1)} disabled={!show || show.index === lastIndex}>Next</button>
              <button type="button" className="btn btn--outline btn--sm" onClick={skip} disabled={!playing}>Skip to the end</button>
              <span className="fs-steps__spacer" />
              <span className="fs-steps__label" id="bst-speed-label">Speed</span>
              <div className="segment-group" role="group" aria-labelledby="bst-speed-label">
                {SPEEDS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={`segment${speed === option.id ? ' active' : ''}`}
                    aria-pressed={speed === option.id}
                    onClick={() => setSpeed(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </WidgetShell>
      </div>
    </main>
  )
}
