import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WidgetShell } from '../../../components/widget'
import { Stage } from './stage'
import {
  BOOT_COMMAND,
  COMMANDS,
  SAMPLE_SCRIPT,
  boot,
  pathOf,
  run,
  suggestions,
  type CommandName,
  type Frame,
  type FsState,
  type OutputLine,
} from './model'

/* ============================================================
 * File System Tree: Commands and Objects
 * A terminal on the right runs the Navigator's commands; the picture on
 * the left shows the FolderNode and FileNode objects they build and walk.
 * Pick a command button, fill in its arguments in the one prompt line,
 * then press the arrow or Enter. Each command plays as a few captioned
 * steps that can be replayed or stepped through by hand.
 *
 * model.ts is the simulator, stage.tsx is the SVG picture.
 * ============================================================ */

type Speed = 'slow' | 'normal' | 'fast'

const STEP_MS: Record<Speed, number> = { slow: 1700, normal: 1000, fast: 450 }
const SCRIPT_STEP_MS = 170
const SPEEDS: { id: Speed; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
]
const SCROLLBACK = 120

interface LogEntry { id: number; prompt: string; line: string; output: OutputLine[] }

interface Playback {
  frames: Frame[]
  index: number
  entry: number        // the log entry whose output this playback prints
  auto: boolean        // false once someone steps by hand
  scripted: boolean    // part of the sample script: play quickly
}

interface Session {
  fs: FsState | null   // null while no program is running
  log: LogEntry[]
  play: Playback | null
  queue: string[]      // commands still to run from the sample script
  seq: number
}

const INITIAL: Session = { fs: null, log: [], play: null, queue: [], seq: 0 }

const promptOf = (fs: FsState | null) => (fs ? `${pathOf(fs, fs.cwd)} >` : '$')

/** Runs one line and starts its playback. With no program running, the only thing to run is the program. */
function execute(session: Session, line: string, mode: 'play' | 'script' | 'instant'): Session {
  const result = session.fs ? run(session.fs, line) : boot()
  const id = session.seq + 1
  const last = result.frames.length - 1
  const entry: LogEntry = { id, prompt: promptOf(session.fs), line: session.fs ? line : BOOT_COMMAND, output: result.output }
  return {
    ...session,
    fs: result.state,
    seq: id,
    log: [...session.log, entry].slice(-SCROLLBACK),
    play: { frames: result.frames, index: mode === 'instant' ? last : 0, entry: id, auto: mode !== 'instant', scripted: mode === 'script' },
  }
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 9h12M9.5 4.5L14 9l-4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const LEGEND: { swatch: string; text: string }[] = [
  { swatch: 'base', text: 'FileSystemNode core: name, parent' },
  { swatch: 'folder', text: 'FolderNode ring: children' },
  { swatch: 'file', text: 'FileNode ring: size' },
  { swatch: 'here', text: 'currentDirectory' },
  { swatch: 'up', text: 'parent link' },
  { swatch: 'down', text: 'children link' },
]

export default function FileSystemTreeExplorer() {
  const [session, setSession] = useState<Session>(INITIAL)
  const [command, setCommand] = useState<CommandName>('mkdir')
  const [edits, setEdits] = useState<string[] | null>(null)   // null: show the suggested arguments
  const [speed, setSpeed] = useState<Speed>('normal')
  const [selected, setSelected] = useState<number | null>(null)
  const [focusTick, setFocusTick] = useState(0)

  const firstArgRef = useRef<HTMLInputElement>(null)
  const runRef = useRef<HTMLButtonElement>(null)
  const outRef = useRef<HTMLDivElement>(null)
  const submitRef = useRef<() => void>(() => {})

  const { fs, log, play, queue } = session
  const frame = play ? play.frames[play.index] : null
  const lastIndex = play ? play.frames.length - 1 : 0
  const playing = !!play && play.auto && (play.index < lastIndex || queue.length > 0)

  const spec = COMMANDS.find(candidate => candidate.name === command) ?? COMMANDS[0]
  const ideas = fs ? suggestions(fs, command) : []
  const values = spec.args.map((_, index) => (edits ?? ideas[0] ?? [])[index] ?? '')
  const line = fs ? [command, ...values.map(value => value.trim()).filter(value => value !== '')].join(' ') : BOOT_COMMAND
  const shownLines = frame ? frame.lines : 0

  useEffect(() => {
    const previous = document.title
    document.title = 'File System Tree · Class Resources'
    return () => { document.title = previous }
  }, [])

  /* ----- playback clock ----- */
  useEffect(() => {
    if (!play || !play.auto) return
    if (play.index < play.frames.length - 1) {
      const timer = window.setTimeout(() => {
        setSession(current => current.play
          ? { ...current, play: { ...current.play, index: Math.min(current.play.index + 1, current.play.frames.length - 1) } }
          : current)
      }, play.scripted ? SCRIPT_STEP_MS : STEP_MS[speed])
      return () => window.clearTimeout(timer)
    }
    if (queue.length) {
      const timer = window.setTimeout(() => {
        setSession(current => current.queue.length
          ? execute({ ...current, queue: current.queue.slice(1) }, current.queue[0], 'script')
          : current)
      }, SCRIPT_STEP_MS * 2)
      return () => window.clearTimeout(timer)
    }
  }, [play, queue, speed])

  useEffect(() => {
    const out = outRef.current
    if (out) out.scrollTop = out.scrollHeight
  }, [log.length, shownLines])

  useEffect(() => {
    if (!focusTick) return
    const input = firstArgRef.current
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
    setSession(current => execute({ ...current, queue: [] }, line, reducedMotion() ? 'instant' : 'play'))
    setEdits(null)
    setSelected(null)
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

  function choose(name: CommandName) {
    setCommand(name)
    setEdits(null)
    setFocusTick(tick => tick + 1)
  }

  function editArg(index: number, value: string) {
    const cleaned = value.replace(/\s+/g, '')
    setEdits(values.map((current, position) => (position === index ? cleaned : current)))
  }

  function applyIdea(idea: string[]) {
    setEdits(idea)
    setFocusTick(tick => tick + 1)
  }

  function playSample() {
    setSession(current => {
      let next: Session = { ...current, queue: [] }
      if (next.fs) next = execute(next, 'quit', 'instant')
      next = execute(next, BOOT_COMMAND, 'instant')
      if (reducedMotion()) return SAMPLE_SCRIPT.reduce((built, scripted) => execute(built, scripted, 'instant'), next)
      return execute({ ...next, queue: SAMPLE_SCRIPT.slice(1) }, SAMPLE_SCRIPT[0], 'script')
    })
    setEdits(null)
    setSelected(null)
  }

  function skip() {
    setSession(current => {
      if (!current.play) return current
      let next: Session = { ...current, queue: [], play: { ...current.play, index: current.play.frames.length - 1, auto: false } }
      for (const queued of current.queue) next = execute(next, queued, 'instant')
      return next
    })
  }

  // Stepping by hand stops the clock and any script still waiting.
  function stepTo(index: number) {
    setSession(current => current.play
      ? { ...current, queue: [], play: { ...current.play, auto: false, index: Math.max(0, Math.min(index, current.play.frames.length - 1)) } }
      : current)
  }

  function replay() {
    setSession(current => current.play
      ? { ...current, queue: [], play: { ...current.play, index: 0, auto: !reducedMotion(), scripted: false } }
      : current)
  }

  function startOver() {
    setSession(INITIAL)
    setEdits(null)
    setSelected(null)
    setCommand('mkdir')
  }

  return (
    <main className="page fs-page">
      <div className="container container--wide">

        <section className="fs-hero">
          <div className="eyebrow">Computer Science Explorer · Trees and Inheritance</div>
          <h1 className="h2 fs-hero__title">File System Tree: Commands and Objects</h1>
          <p className="lead fs-hero__lead">
            A file system is a tree of objects. Run the Navigator's commands in the terminal and watch each one build
            or walk that tree, one step at a time.
          </p>
        </section>

        <WidgetShell
          className="fs-shell"
          controls={
            <>
              <section className="fs-term" aria-label="Terminal">
                <div className="fs-term__bar">
                  <span className="fs-term__dots" aria-hidden="true"><i /><i /><i /></span>
                  <span className="fs-term__title">Terminal</span>
                  <span className={`fs-term__status${fs ? ' fs-term__status--on' : ''}`}>
                    {fs ? 'java Navigator is running' : 'no program running'}
                  </span>
                </div>

                <div className="fs-keys" role="group" aria-label="Navigator commands">
                  {COMMANDS.map(candidate => (
                    <button
                      key={candidate.name}
                      type="button"
                      className="fs-key"
                      aria-pressed={!!fs && command === candidate.name}
                      disabled={!fs}
                      title={candidate.help}
                      onClick={() => choose(candidate.name)}
                    >
                      {candidate.name}
                    </button>
                  ))}
                </div>

                <form className="fs-prompt" onSubmit={onSubmit}>
                  <span className="fs-prompt__path">{promptOf(fs)}</span>
                  <span className="fs-prompt__cmd">{fs ? command : BOOT_COMMAND}</span>
                  {fs && spec.args.map((arg, index) => (
                    <input
                      key={`${command}-${arg.label}`}
                      ref={index === 0 ? firstArgRef : undefined}
                      className="fs-prompt__arg"
                      type="text"
                      aria-label={`${command} ${arg.label}`}
                      placeholder={arg.label}
                      size={arg.width}
                      maxLength={arg.max}
                      spellCheck={false}
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      value={values[index]}
                      onChange={event => editArg(index, event.target.value)}
                    />
                  ))}
                  <button ref={runRef} type="submit" className="btn fs-prompt__run" title="Run this command (Enter)" aria-label={`Run ${line}`}>
                    <ArrowIcon />
                  </button>
                </form>

                <div className="fs-help">
                  {fs ? (
                    <>
                      <p className="fs-help__say">{spec.help}</p>
                      <p className="fs-help__java"><span className="fs-tag">Java</span>{spec.java}</p>
                      {ideas.length > 0 && (
                        <div className="fs-ideas">
                          <span className="fs-ideas__label">Try</span>
                          {ideas.map(idea => (
                            <button key={idea.join(' ')} type="button" className="fs-idea" onClick={() => applyIdea(idea)}>
                              {idea.join(' ')}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="fs-help__say">
                      Nothing exists yet. Press the arrow or Enter to run the program and build a new, empty file system.
                    </p>
                  )}
                </div>

                <div ref={outRef} className="fs-out" role="log" aria-label="Terminal output" tabIndex={0}>
                  {log.length ? log.map(entry => {
                    const visible = play && entry.id === play.entry ? shownLines : entry.output.length
                    return (
                      <div key={entry.id} className="fs-out__entry">
                        <div className="fs-out__cmd"><span className="fs-out__prompt">{entry.prompt}</span> {entry.line}</div>
                        {entry.output.slice(0, visible).map((printed, index) => (
                          <div key={index} className={`fs-out__line fs-out__line--${printed.kind}`}>{printed.text}</div>
                        ))}
                      </div>
                    )
                  }) : (
                    <div className="fs-out__empty">What the Navigator prints shows up here.</div>
                  )}
                </div>
              </section>

              <div className="panel fs-extras">
                <button type="button" className="btn btn--outline btn--sm" onClick={playSample} title="The tree FileSystemTester builds: docs, src, main.java and README.md, with reports and two more files inside docs">
                  Build the sample tree
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={startOver} disabled={!log.length}>
                  Start over
                </button>
              </div>
            </>
          }
        >
          <div className="fs-main">
            <figure className="fs-stage">
              <div className="fs-stage__scroll">
                <Stage fs={fs} frame={frame} selected={selected} onSelect={setSelected} />
              </div>
              <figcaption className="fs-caption" aria-live="polite">
                <p className="fs-caption__say">
                  {frame?.caption || 'Each command shows up here as a few steps, in plain words first.'}
                </p>
                <p className="fs-caption__java">
                  {frame?.code ? <><span className="fs-tag">Java</span>{frame.code}</> : ' '}
                </p>
              </figcaption>
              <ul className="fs-legend" aria-label="Color key">
                {LEGEND.map(item => (
                  <li key={item.swatch}><span className={`fs-swatch fs-swatch--${item.swatch}`} aria-hidden="true" />{item.text}</li>
                ))}
              </ul>
            </figure>

            <div className="panel fs-steps">
              <button type="button" className="btn btn--outline btn--sm" onClick={replay} disabled={!play || play.frames.length < 2}>Replay</button>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => stepTo((play?.index ?? 0) - 1)} disabled={!play || play.index === 0}>Back</button>
              <span className="fs-steps__count">{play ? `Step ${play.index + 1} of ${play.frames.length}` : 'No steps yet'}</span>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => stepTo((play?.index ?? 0) + 1)} disabled={!play || play.index === lastIndex}>Next</button>
              <button type="button" className="btn btn--outline btn--sm" onClick={skip} disabled={!playing}>Skip to the end</button>
              <span className="fs-steps__spacer" />
              <span className="fs-steps__label" id="fs-speed-label">Speed</span>
              <div className="segment-group" role="group" aria-labelledby="fs-speed-label">
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
