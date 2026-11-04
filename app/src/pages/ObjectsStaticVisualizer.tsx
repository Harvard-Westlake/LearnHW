import { useEffect, useRef, useState } from 'react'
import { WidgetShell } from '../components/widget'

/* ============================================================
 * Java Objects & Static Methods: Visual Memory
 * Create Potato and Carrot objects on the Heap, add static methods to the
 * classes in the Method Area, then call both kinds of method and watch
 * VegetableTester.java and the console update.
 * Native port of /static/code/widgets/objects-static/objects-static.html.
 * ============================================================ */

type ClassName = 'Potato' | 'Carrot'
type FileName = 'VegetableTester' | ClassName
type ParamType = ClassName | 'int' | 'double'

type HeapObject = {
  id: number
  varName: string
  type: ClassName
  fields: string[]                                   // 'name = "Yukon"'
  values: Record<string, number | string | boolean>
  toString: string
}

type StaticMethod = {
  name: string
  type: string                                        // Java return type
  params: [ParamType, string][]
  body: string[]
  why: string
  run: (args: (HeapObject | number)[], count: number) => HeapObject | number | boolean
}

type ClassSpec = {
  prefix: string
  fields: string
  ctor: string
  methods: string
  source: (statics: StaticMethod[]) => string[]
  statics: StaticMethod[]
}

type ConsoleLine = { id: number; text: string }
type Flash = { file: FileName; text: string; key: number }
type Picker = { cls: ClassName; method: string; args: string[] }

const CLASS_NAMES: ClassName[] = ['Potato', 'Carrot']
const FILES: FileName[] = ['VegetableTester', 'Potato', 'Carrot']

const fmtDouble = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))
const javaString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
const asObject = (v: HeapObject | number) => v as HeapObject
const num = (v: HeapObject | number, key: string) => Number((v as HeapObject).values[key])
const isClass = (type: ParamType): type is ClassName => type === 'Potato' || type === 'Carrot'

const signature = (m: StaticMethod) =>
  `${m.type} ${m.name}(${m.params.map(([type, name]) => `${type} ${name}`).join(', ')})`

function staticBlock(cls: ClassName, statics: StaticMethod[]): string[] {
  if (!statics.length) return ['    // static methods you add in step 2 appear here']
  const out = [`    // static members belong to the class itself, not to any one ${cls}`]
  statics.forEach((m, index) => {
    if (index) out.push('')
    out.push(`    public static ${signature(m)} {`, ...m.body.map(line => '        ' + line), '    }')
  })
  return out
}

const CLASSES: Record<ClassName, ClassSpec> = {
  Potato: {
    prefix: 'p',
    fields: 'String name, double weightKg',
    ctor: 'Potato(String name, double weightKg)',
    methods: 'getName(), getWeightKg(), toString()',
    source: statics => [
      'public class Potato {',
      '    private String name;',
      '    private double weightKg;',
      '    private static int count = 0;   // one shared counter for the whole class',
      '',
      '    public Potato(String name, double weightKg) {',
      '        this.name = name;',
      '        this.weightKg = weightKg;',
      '        count++;',
      '    }',
      '',
      '    public String getName() { return name; }',
      '    public double getWeightKg() { return weightKg; }',
      '',
      '    public String toString() {',
      '        return "Potato{" + name + ", " + weightKg + "kg}";',
      '    }',
      '',
      ...staticBlock('Potato', statics),
      '}',
    ],
    statics: [
      {
        name: 'getCount', type: 'int', params: [], body: ['return count;'],
        why: 'Counts every Potato ever made. One number for the whole class, not one per potato.',
        run: (_args, count) => count,
      },
      {
        name: 'totalWeight', type: 'double', params: [['Potato', 'a'], ['Potato', 'b']],
        body: ['return a.weightKg + b.weightKg;'],
        why: 'Needs two potatoes at once, so it cannot belong to just one of them.',
        run: ([a, b]) => num(a, 'weightKg') + num(b, 'weightKg'),
      },
      {
        name: 'heavier', type: 'Potato', params: [['Potato', 'a'], ['Potato', 'b']],
        body: ['if (a.weightKg >= b.weightKg) return a;', 'return b;'],
        why: 'Compares two potatoes and returns one of them. No single potato owns that job.',
        run: ([a, b]) => (num(a, 'weightKg') >= num(b, 'weightKg') ? asObject(a) : asObject(b)),
      },
      {
        name: 'kgToLb', type: 'double', params: [['double', 'kg']], body: ['return kg * 2.205;'],
        why: 'Plain math on a number. No potato is needed, so it lives on the class.',
        run: ([kg]) => Number(kg) * 2.205,
      },
    ],
  },
  Carrot: {
    prefix: 'c',
    fields: 'int lengthCm, boolean peeled',
    ctor: 'Carrot(int lengthCm, boolean peeled)',
    methods: 'getLengthCm(), isPeeled(), toString()',
    source: statics => [
      'public class Carrot {',
      '    private int lengthCm;',
      '    private boolean peeled;',
      '    private static int count = 0;   // one shared counter for the whole class',
      '',
      '    public Carrot(int lengthCm, boolean peeled) {',
      '        this.lengthCm = lengthCm;',
      '        this.peeled = peeled;',
      '        count++;',
      '    }',
      '',
      '    public int getLengthCm() { return lengthCm; }',
      '    public boolean isPeeled() { return peeled; }',
      '',
      '    public String toString() {',
      '        return "Carrot{" + lengthCm + "cm, peeled=" + peeled + "}";',
      '    }',
      '',
      ...staticBlock('Carrot', statics),
      '}',
    ],
    statics: [
      {
        name: 'getCount', type: 'int', params: [], body: ['return count;'],
        why: 'Counts every Carrot ever made. One number for the whole class, not one per carrot.',
        run: (_args, count) => count,
      },
      {
        name: 'totalLength', type: 'int', params: [['Carrot', 'a'], ['Carrot', 'b']],
        body: ['return a.lengthCm + b.lengthCm;'],
        why: 'Needs two carrots at once, so it cannot belong to just one of them.',
        run: ([a, b]) => num(a, 'lengthCm') + num(b, 'lengthCm'),
      },
      {
        name: 'longer', type: 'Carrot', params: [['Carrot', 'a'], ['Carrot', 'b']],
        body: ['if (a.lengthCm >= b.lengthCm) return a;', 'return b;'],
        why: 'Compares two carrots and returns one of them. No single carrot owns that job.',
        run: ([a, b]) => (num(a, 'lengthCm') >= num(b, 'lengthCm') ? asObject(a) : asObject(b)),
      },
      {
        name: 'isJumbo', type: 'boolean', params: [['int', 'lengthCm']], body: ['return lengthCm > 20;'],
        why: 'Checks a number, not a carrot. No object is needed, so it lives on the class.',
        run: ([lengthCm]) => Number(lengthCm) > 20,
      },
    ],
  },
}

function findStatic(cls: ClassName, name: string): StaticMethod | undefined {
  return CLASSES[cls].statics.find(m => m.name === name)
}

function printable(type: string, value: HeapObject | number | boolean): string {
  if (type === 'double') return fmtDouble(value as number)
  if (type === 'Potato' || type === 'Carrot') return (value as HeapObject).toString
  return String(value)
}

/* ---------- Java syntax highlighting, VS Code style ---------- */

type Token = { cls: string; text: string }

const KEYWORDS = new Set((
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends final ' +
  'finally float for goto if implements import instanceof int interface long native new null package private protected ' +
  'public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false'
).split(' '))
const CONTROL = new Set('return if else for while do switch case break continue try catch finally throw'.split(' '))

function tokenize(line: string): Token[] {
  const out: Token[] = []
  const push = (cls: string, text: string) => {
    const last = out[out.length - 1]
    if (!cls && last && !last.cls) last.text += text
    else out.push({ cls, text })
  }
  const length = line.length
  let i = 0
  while (i < length) {
    const ch = line[i]
    if (ch === '/' && line[i + 1] === '/') { push('tok-comment', line.slice(i)); break }
    if (ch === '"') {
      let j = i + 1
      while (j < length && line[j] !== '"') { if (line[j] === '\\') j++; j++ }
      j = Math.min(j + 1, length)
      push('tok-str', line.slice(i, j)); i = j; continue
    }
    if (ch >= '0' && ch <= '9') {
      let j = i
      while (j < length && /[0-9.]/.test(line[j])) j++
      push('tok-num', line.slice(i, j)); i = j; continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i
      while (j < length && /[A-Za-z0-9_$]/.test(line[j])) j++
      const word = line.slice(i, j)
      let k = j
      while (k < length && line[k] === ' ') k++
      const cls = CONTROL.has(word) ? 'tok-ctrl'
        : KEYWORDS.has(word) ? 'tok-kw'
        : /^[A-Z]/.test(word) ? 'tok-type'
        : line[k] === '(' ? 'tok-func'
        : 'tok-var'
      push(cls, word); i = j; continue
    }
    push('', ch); i++
  }
  return out
}

function JavaLine({ line }: { line: string }) {
  if (!line) return <>{' '}</>
  return <>{tokenize(line).map((token, index) => token.cls
    ? <span key={index} className={token.cls}>{token.text}</span>
    : <span key={index}>{token.text}</span>)}</>
}

function fallbackCopy(text: string, done: () => void) {
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try { document.execCommand('copy'); done() } catch { /* ignore */ }
  document.body.removeChild(area)
}

/* ---------- the page ---------- */

export default function ObjectsStaticVisualizer() {
  const [objects, setObjects] = useState<HeapObject[]>([])
  const [counters, setCounters] = useState<Record<ClassName, number>>({ Potato: 0, Carrot: 0 })
  const [statics, setStatics] = useState<Record<ClassName, string[]>>({ Potato: [], Carrot: [] })
  const [mainLines, setMainLines] = useState<string[]>([])
  const [file, setFile] = useState<FileName>('VegetableTester')
  const [flash, setFlash] = useState<Flash | null>(null)
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
  const [picker, setPicker] = useState<Picker | null>(null)
  const [bump, setBump] = useState<Record<ClassName, number>>({ Potato: 0, Carrot: 0 })
  const [copied, setCopied] = useState(false)

  const [potatoName, setPotatoName] = useState('Yukon')
  const [potatoWeight, setPotatoWeight] = useState('1.0')
  const [carrotLength, setCarrotLength] = useState('12')
  const [carrotPeeled, setCarrotPeeled] = useState(false)
  const [staticClass, setStaticClass] = useState<ClassName>('Potato')
  const [staticMethod, setStaticMethod] = useState('getCount')

  const codeRef = useRef<HTMLPreElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    const previous = document.title
    document.title = 'Java Objects & Static Methods · Class Resources'
    return () => { document.title = previous }
  }, [])

  useEffect(() => {
    codeRef.current?.querySelector('.os-ln--new')?.scrollIntoView({ block: 'nearest' })
  }, [flash])

  useEffect(() => {
    const el = consoleRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [consoleLines])

  /* ----- constructor previews ----- */

  function readCtor(cls: ClassName): { args: string; fields: string[]; values: HeapObject['values']; toString: string } {
    if (cls === 'Potato') {
      const name = potatoName.trim() || 'Potato'
      const parsed = parseFloat(potatoWeight)
      const weightKg = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
      return {
        args: `${javaString(name)}, ${fmtDouble(weightKg)}`,
        fields: [`name = ${javaString(name)}`, `weightKg = ${fmtDouble(weightKg)}`],
        values: { name, weightKg },
        toString: `Potato{${name}, ${fmtDouble(weightKg)}kg}`,
      }
    }
    const parsed = parseInt(carrotLength, 10)
    const lengthCm = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    return {
      args: `${lengthCm}, ${carrotPeeled}`,
      fields: [`lengthCm = ${lengthCm}`, `peeled = ${carrotPeeled}`],
      values: { lengthCm, peeled: carrotPeeled },
      toString: `Carrot{${lengthCm}cm, peeled=${carrotPeeled}}`,
    }
  }

  /* ----- files ----- */

  function fileLines(name: FileName): string[] {
    if (name === 'VegetableTester') {
      const body = mainLines.length
        ? mainLines.map(line => '        ' + line)
        : ['        // nothing here yet: create an object or call a method']
      return ['public class VegetableTester {', '    public static void main(String[] args) {', ...body, '    }', '}']
    }
    const added = statics[name].map(methodName => findStatic(name, methodName)).filter((m): m is StaticMethod => !!m)
    return CLASSES[name].source(added)
  }

  function showFile(next: FileName, changedLine?: string) {
    setFile(next)
    setFlash(changedLine ? { file: next, text: changedLine, key: ++seqRef.current } : null)
  }

  function addMainLine(line: string) {
    setMainLines(previous => [...previous, line])
    showFile('VegetableTester', line)
  }

  function print(text: string) {
    setConsoleLines(previous => [...previous, { id: ++seqRef.current, text }])
  }

  /* ----- actions ----- */

  function createObject(cls: ClassName) {
    const read = readCtor(cls)
    const count = counters[cls] + 1
    const created: HeapObject = {
      id: objects.length + 1,
      varName: CLASSES[cls].prefix + count,
      type: cls,
      fields: read.fields,
      values: read.values,
      toString: read.toString,
    }
    setObjects(previous => [...previous, created])
    setCounters(previous => ({ ...previous, [cls]: count }))
    setBump(previous => ({ ...previous, [cls]: previous[cls] + 1 }))
    setPicker(null)
    addMainLine(`${cls} ${created.varName} = new ${cls}(${read.args});`)
  }

  function callStatic(cls: ClassName, m: StaticMethod, args: (HeapObject | number)[], argText: string[]) {
    addMainLine(`System.out.println(${cls}.${m.name}(${argText.join(', ')}));`)
    print(printable(m.type, m.run(args, counters[cls])))
  }

  function callInstance(target: HeapObject) {
    addMainLine(`System.out.println(${target.varName}.toString());`)
    print(target.toString)
  }

  function objectsOf(type: ClassName) {
    return objects.filter(candidate => candidate.type === type)
  }

  function openPicker(cls: ClassName, m: StaticMethod) {
    if (!m.params.length) { callStatic(cls, m, [], []); return }
    const args = m.params.map(([type], index) => {
      if (isClass(type)) {
        const candidates = objectsOf(type)
        return candidates.length ? candidates[Math.min(index, candidates.length - 1)].varName : ''
      }
      return type === 'int' ? '25' : '1.5'
    })
    setPicker({ cls, method: m.name, args })
  }

  function setPickerArg(index: number, value: string) {
    setPicker(previous => previous ? { ...previous, args: previous.args.map((arg, i) => (i === index ? value : arg)) } : previous)
  }

  function commitPicker() {
    if (!picker) return
    const m = findStatic(picker.cls, picker.method)
    if (!m) return
    const args: (HeapObject | number)[] = []
    const argText: string[] = []
    for (let index = 0; index < m.params.length; index++) {
      const [type] = m.params[index]
      const raw = picker.args[index]
      if (isClass(type)) {
        const target = objects.find(candidate => candidate.varName === raw)
        if (!target) return
        args.push(target); argText.push(target.varName)
      } else if (type === 'int') {
        const value = parseInt(raw, 10) || 0
        args.push(value); argText.push(String(value))
      } else {
        const value = parseFloat(raw) || 0
        args.push(value); argText.push(fmtDouble(value))
      }
    }
    setPicker(null)
    callStatic(picker.cls, m, args, argText)
  }

  function availableStatics(cls: ClassName) {
    return CLASSES[cls].statics.filter(m => !statics[cls].includes(m.name))
  }

  function chooseClass(cls: ClassName) {
    setStaticClass(cls)
    const remaining = availableStatics(cls)
    setStaticMethod(remaining.length ? remaining[0].name : CLASSES[cls].statics[0].name)
  }

  function addStatic() {
    const m = findStatic(staticClass, staticMethod)
    if (!m || statics[staticClass].includes(m.name)) return
    const nextList = [...statics[staticClass], m.name]
    setStatics(previous => ({ ...previous, [staticClass]: nextList }))
    showFile(staticClass, `public static ${signature(m)} {`)
    const remaining = CLASSES[staticClass].statics.filter(candidate => !nextList.includes(candidate.name))
    setStaticMethod(remaining.length ? remaining[0].name : m.name)
  }

  function copyActive() {
    const text = fileLines(file).join('\n')
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done))
    else fallbackCopy(text, done)
  }

  function reset() {
    setObjects([])
    setCounters({ Potato: 0, Carrot: 0 })
    setStatics({ Potato: [], Carrot: [] })
    setMainLines([])
    setConsoleLines([])
    setPicker(null)
    setFlash(null)
    setFile('VegetableTester')
    setStaticMethod(CLASSES[staticClass].statics[0].name)
  }

  /* ----- derived ----- */

  const lines = fileLines(file)
  let flashIndex = -1
  if (flash && flash.file === file) {
    for (let index = lines.length - 1; index >= 0; index--) {
      if (lines[index].trim() === flash.text.trim()) { flashIndex = index; break }
    }
  }
  const selectedStatic = findStatic(staticClass, staticMethod)
  const selectedAdded = !!selectedStatic && statics[staticClass].includes(selectedStatic.name)
  const previewLines = selectedStatic ? (() => {
    const sig = `public static ${signature(selectedStatic)} {`
    const head = sig.length > 40
      ? [`public static ${selectedStatic.type} ${selectedStatic.name}(`, `        ${selectedStatic.params.map(([type, name]) => `${type} ${name}`).join(', ')}) {`]
      : [sig]
    return [...head, ...selectedStatic.body.map(line => '    ' + line), '}']
  })() : []
  const pickerMethod = picker ? findStatic(picker.cls, picker.method) : undefined
  const pickerMissing = pickerMethod
    ? pickerMethod.params.map(([type]) => type).find((type): type is ClassName => isClass(type) && !objectsOf(type).length)
    : undefined

  const potatoRead = readCtor('Potato')
  const carrotRead = readCtor('Carrot')

  return (
    <main className="page os-page">
      <div className="container container--wide">

        <section className="os-hero">
          <div className="eyebrow">Computer Science Explorer · Java Memory</div>
          <h1 className="h2 os-hero__title">Java Objects &amp; Static Methods: Visual Memory</h1>
          <p className="lead os-hero__lead">
            Create objects with <code>new</code>, add static methods to a class, then call both kinds of method and
            watch the Method Area, the Heap, <code>main()</code> and the console update.
          </p>
        </section>

        <WidgetShell
          controls={
            <>
              <section className="panel">
                <h2 className="os-step__title"><span className="os-step__num">1</span>Create objects with <code>new</code></h2>
                <form className="os-ctor os-ctor--potato" onSubmit={event => { event.preventDefault(); createObject('Potato') }}>
                  <div className="os-ctor__head"><span className="os-sw os-sw--potato" />Potato</div>
                  <div className="os-fields">
                    <label htmlFor="os-potato-name">name</label>
                    <input id="os-potato-name" className="input" type="text" maxLength={24} spellCheck={false} value={potatoName} onChange={event => setPotatoName(event.target.value)} />
                    <label htmlFor="os-potato-weight">weightKg</label>
                    <input id="os-potato-weight" className="input" type="number" step="any" min={0} value={potatoWeight} onChange={event => setPotatoWeight(event.target.value)} />
                  </div>
                  <button type="submit" className="btn btn--sm os-run">new Potato({potatoRead.args})</button>
                </form>
                <form className="os-ctor os-ctor--carrot" onSubmit={event => { event.preventDefault(); createObject('Carrot') }}>
                  <div className="os-ctor__head"><span className="os-sw os-sw--carrot" />Carrot</div>
                  <div className="os-fields">
                    <label htmlFor="os-carrot-length">lengthCm</label>
                    <input id="os-carrot-length" className="input" type="number" step={1} min={0} value={carrotLength} onChange={event => setCarrotLength(event.target.value)} />
                    <label htmlFor="os-carrot-peeled">peeled</label>
                    <label className="os-check">
                      <input id="os-carrot-peeled" type="checkbox" checked={carrotPeeled} onChange={event => setCarrotPeeled(event.target.checked)} />
                      <span>{String(carrotPeeled)}</span>
                    </label>
                  </div>
                  <button type="submit" className="btn btn--sm os-run">new Carrot({carrotRead.args})</button>
                </form>
              </section>

              <section className="panel">
                <h2 className="os-step__title"><span className="os-step__num">2</span>Add a static method to a class</h2>
                <form onSubmit={event => { event.preventDefault(); addStatic() }}>
                  <div className="os-picker">
                    <label htmlFor="os-static-class">class</label>
                    <select id="os-static-class" className="select" value={staticClass} onChange={event => chooseClass(event.target.value as ClassName)}>
                      {CLASS_NAMES.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                    </select>
                    <label htmlFor="os-static-method">method</label>
                    <select id="os-static-method" className="select" value={staticMethod} onChange={event => setStaticMethod(event.target.value)}>
                      {CLASSES[staticClass].statics.map(m => {
                        const added = statics[staticClass].includes(m.name)
                        return (
                          <option key={m.name} value={m.name} disabled={added}>
                            {m.name}({m.params.map(([, name]) => name).join(', ')}){added ? '  (added)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <pre className="code-block os-preview os-dark">
                    {previewLines.map((line, index) => <span key={index} className="os-ln"><JavaLine line={line} /></span>)}
                  </pre>
                  <p className="os-why">
                    {selectedStatic ? (selectedAdded ? `${staticClass}.${selectedStatic.name}() is already in the class.` : selectedStatic.why) : ''}
                  </p>
                  <button type="submit" className="btn btn--sm btn--block" disabled={!selectedStatic || selectedAdded}>
                    Add to {staticClass} class
                  </button>
                </form>
              </section>

              <button type="button" className="btn btn--outline btn--sm btn--block" onClick={reset}>Reset</button>
            </>
          }
        >
          <div className="os-main">
            <section className="panel os-area os-area--class">
              <div className="widget-panel__head os-area__head">
                <div className="eyebrow">Method Area</div>
                <span className="os-area__sub">class-level code and class-level variables, one copy per class. Click a static method to call it.</span>
              </div>
              <p className="os-def">
                <b>static</b> means a member (variable, method, block, or nested class) belongs to the class itself,
                rather than to a specific instance (object) of that class.
              </p>
              <div className="os-classes">
                {CLASS_NAMES.map(cls => (
                  <article key={cls} className={`os-class os-class--${cls.toLowerCase()}`}>
                    <div className="os-class__head">
                      <div className="os-class__name"><span className={`os-sw os-sw--${cls.toLowerCase()}`} />{cls} <span className="os-class__kw">class</span></div>
                      <button type="button" className="btn btn--outline btn--sm os-ghost" onClick={() => showFile(cls)}>{'{ }'} {cls}.java</button>
                    </div>
                    <dl className="os-members os-light">
                      <dt>instance variables</dt><dd><JavaLine line={CLASSES[cls].fields} /></dd>
                      <dt>constructor</dt><dd><JavaLine line={CLASSES[cls].ctor} /></dd>
                      <dt>methods</dt><dd><JavaLine line={CLASSES[cls].methods} /></dd>
                      <dt>static variables</dt>
                      <dd key={`count-${bump[cls]}`} className={bump[cls] ? 'os-bump' : undefined}><JavaLine line={`count = ${counters[cls]}`} /></dd>
                      <dt>static methods</dt>
                      <dd>
                        <div className="os-statics">
                          {statics[cls].length
                            ? statics[cls].map(name => {
                              const m = findStatic(cls, name)
                              if (!m) return null
                              const open = picker?.cls === cls && picker.method === name
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  className={`os-pill os-pill--static${open ? ' os-pill--open' : ''}`}
                                  title={m.params.length ? `Choose the inputs, then call ${cls}.${m.name}()` : `Call ${cls}.${m.name}()`}
                                  onClick={() => openPicker(cls, m)}
                                >
                                  {cls}.{m.name}({m.params.map(([, paramName]) => paramName).join(', ')})
                                </button>
                              )
                            })
                            : <span className="os-empty">none yet. Add one in step 2.</span>}
                        </div>
                      </dd>
                    </dl>
                    {picker?.cls === cls && pickerMethod && (
                      <div className="os-args">
                        <span className="os-args__line">
                          {cls}.{pickerMethod.name}(
                          {pickerMethod.params.map(([type, paramName], index) => (
                            <span key={paramName} className="os-args__line">
                              {index > 0 ? ', ' : ''}
                              {isClass(type) ? (
                                <select
                                  className="select"
                                  aria-label={`${type} ${paramName}`}
                                  title={`${type} ${paramName}`}
                                  value={picker.args[index]}
                                  disabled={!objectsOf(type).length}
                                  onChange={event => setPickerArg(index, event.target.value)}
                                >
                                  {objectsOf(type).length
                                    ? objectsOf(type).map(candidate => <option key={candidate.varName} value={candidate.varName}>{candidate.varName}</option>)
                                    : <option value="">{paramName}</option>}
                                </select>
                              ) : (
                                <input
                                  className="input"
                                  type="number"
                                  step={type === 'int' ? 1 : 'any'}
                                  aria-label={`${type} ${paramName}`}
                                  title={`${type} ${paramName}`}
                                  value={picker.args[index]}
                                  onChange={event => setPickerArg(index, event.target.value)}
                                />
                              )}
                            </span>
                          ))}
                          )
                        </span>
                        <button type="button" className="btn btn--sm" disabled={!!pickerMissing} onClick={commitPicker}>Call</button>
                        <button type="button" className="btn btn--outline btn--sm" title="Cancel" onClick={() => setPicker(null)}>×</button>
                        {pickerMissing && <span className="os-empty">Create a {pickerMissing} in step 1 first.</span>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className="panel os-area os-area--heap">
              <div className="widget-panel__head os-area__head">
                <div className="eyebrow">Heap</div>
                <span className="os-area__sub">
                  one object per <code>new</code>, each with its own instance variables. Click <code>toString()</code> to call it on that object.
                </span>
              </div>
              <div className="os-heap">
                {objects.length ? objects.map(target => (
                  <article key={target.id} className={`os-obj os-obj--${target.type.toLowerCase()}`}>
                    <div className="os-obj__head">
                      <span className="os-obj__var">{target.varName}</span>
                      <span className="os-obj__arrow">→</span>
                      <span className="os-obj__type">{target.type} object #{target.id}</span>
                    </div>
                    <div className="os-obj__fields os-light">
                      {target.fields.map(field => <div key={field}><JavaLine line={field} /></div>)}
                    </div>
                    <button type="button" className="os-pill os-pill--instance" title="Call toString() on this object" onClick={() => callInstance(target)}>
                      {target.varName}.toString()
                    </button>
                  </article>
                )) : (
                  <div className="os-heap__empty"><span>No objects yet. Press one of the red <code>new</code> buttons in step 1.</span></div>
                )}
              </div>
            </section>

            <div className="os-bottom">
              <section className="os-editor">
                <div className="os-tabs" role="tablist">
                  {FILES.map(name => (
                    <button key={name} type="button" role="tab" className="os-tab" aria-selected={file === name} onClick={() => showFile(name)}>
                      {name}.java
                    </button>
                  ))}
                  <span className="os-tabs__spacer" />
                  <button type="button" className="btn btn--outline btn--sm" onClick={copyActive}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <pre ref={codeRef} key={flash?.key ?? 0} className="code-block os-code os-dark">
                  {lines.map((line, index) => (
                    <span key={index} className={`os-ln${index === flashIndex ? ' os-ln--new' : ''}`}><JavaLine line={line} /></span>
                  ))}
                </pre>
              </section>
              <section className="os-console">
                <div className="os-console__head">Console</div>
                <div ref={consoleRef} className="os-console__body">
                  {consoleLines.length
                    ? consoleLines.map(line => <div key={line.id} className="os-console__line">{line.text}</div>)
                    : <div className="os-console__empty">Nothing printed yet. Call a method to see its output.</div>}
                </div>
              </section>
            </div>

            <div className="panel os-keyidea">
              <span className="os-step__num">3</span>
              <span className="os-keyidea__item">
                <span className="os-pill os-pill--static os-pill--demo">Potato.totalWeight(p1, p2)</span>
                <span><b>static</b>: called on the class, objects are passed in</span>
              </span>
              <span className="os-keyidea__item">
                <span className="os-pill os-pill--instance os-pill--demo">p1.toString()</span>
                <span><b>instance</b>: called on one object</span>
              </span>
            </div>
          </div>
        </WidgetShell>
      </div>
    </main>
  )
}
