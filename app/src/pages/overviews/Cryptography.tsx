import {
  OverviewPage,
  OverviewGroup,
  OverviewSection,
  OverviewConnector,
} from '../../components/overview';

/* ============================================================
 * Section graphics — each hero and watermark is a plain SVG
 * component so you can replace one by editing a single function.
 * Kept in-file so the page reads top-to-bottom as the narrative
 * does; extract into their own files when the library grows.
 * ============================================================ */

/* ----- 01 · Number representation ----- */
function NumberHero() {
  const bits = ['0', '1', '0', '0', '0', '0', '0', '1']; // 0x41 = 'A'
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="byte interpreted as A">
      <g fontFamily="var(--hw-mono, monospace)">
        {bits.map((b, i) => (
          <g key={i} transform={`translate(${20 + i * 34}, 40)`}>
            <rect width="28" height="36" rx="4"
                  fill={b === '1' ? 'var(--hw-red)' : 'var(--hw-secondary-khaki-20)'}
                  stroke={b === '1' ? 'var(--hw-red)' : 'var(--hw-secondary-khaki-50)'} />
            <text x="14" y="24" textAnchor="middle" fontSize="18" fontWeight="700"
                  fill={b === '1' ? 'white' : 'var(--hw-secondary-black)'}>{b}</text>
          </g>
        ))}
        <text x="160" y="100" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--hw-secondary-black)">
          the same 8 bits mean
        </text>
        <g transform="translate(40, 120)">
          <rect width="80" height="40" rx="6" fill="white" stroke="var(--hw-border)" />
          <text x="40" y="26" textAnchor="middle" fontSize="18" fontWeight="800">65</text>
        </g>
        <g transform="translate(130, 120)">
          <rect width="60" height="40" rx="6" fill="white" stroke="var(--hw-border)" />
          <text x="30" y="26" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="var(--hw-mono, monospace)">A</text>
        </g>
        <g transform="translate(200, 120)">
          <rect width="80" height="40" rx="6" fill="white" stroke="var(--hw-border)" />
          <text x="40" y="26" textAnchor="middle" fontSize="16" fontWeight="800" fontFamily="var(--hw-mono, monospace)">0x41</text>
        </g>
      </g>
    </svg>
  );
}
function NumberWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" role="img">
      <g fontFamily="monospace" fontSize="34" fontWeight="700" fill="currentColor">
        <text x="10" y="50">01101001</text>
        <text x="80" y="110">10110010</text>
        <text x="30" y="170">11001010</text>
        <text x="110" y="230">01000001</text>
        <text x="40" y="290">10100111</text>
        <text x="130" y="350">00111100</text>
      </g>
    </svg>
  );
}

/* ----- 02 · Hashing ----- */
function HashingHero() {
  return (
    <svg viewBox="0 0 320 180" role="img">
      <g>
        <rect x="10" y="58" width="90" height="64" rx="6" fill="white" stroke="var(--hw-border)" />
        <text x="55" y="82" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--hw-secondary-black)">message</text>
        <text x="55" y="104" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="var(--hw-secondary-black)">"hello"</text>

        <path d="M 105 90 L 135 90" stroke="var(--hw-secondary-black)" strokeWidth="2" />
        <polygon points="135,86 143,90 135,94" fill="var(--hw-secondary-black)" />

        <rect x="148" y="58" width="80" height="64" rx="6" fill="var(--hw-brand-black)" />
        <text x="188" y="94" textAnchor="middle" fontSize="14" fontWeight="800" fill="white">SHA</text>

        <path d="M 232 90 L 262 90" stroke="var(--hw-secondary-black)" strokeWidth="2" />
        <polygon points="262,86 270,90 262,94" fill="var(--hw-secondary-black)" />

        <rect x="270" y="58" width="42" height="64" rx="6" fill="var(--hw-gold)" />
        <text x="291" y="82" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--hw-brand-black)" fontFamily="monospace">2cf2…</text>
        <text x="291" y="96" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--hw-brand-black)" fontFamily="monospace">b824</text>
        <text x="291" y="110" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--hw-brand-black)" fontFamily="monospace">fixed</text>

        <text x="160" y="160" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--hw-secondary-black)">
          any input size · fixed output size · one-way
        </text>
      </g>
    </svg>
  );
}
function HashingWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g fill="currentColor" fontFamily="monospace" fontWeight="900">
        <text x="30" y="100" fontSize="90">#</text>
        <text x="160" y="170" fontSize="70">#</text>
        <text x="260" y="120" fontSize="110">#</text>
        <text x="50" y="290" fontSize="80">#</text>
        <text x="200" y="330" fontSize="100">#</text>
        <text x="320" y="320" fontSize="60">#</text>
      </g>
    </svg>
  );
}

/* ----- 03 · Symmetric keys ----- */
function SymmetricHero() {
  return (
    <svg viewBox="0 0 320 180" role="img">
      <KeyIcon x={140} y={70} color="var(--hw-red)" />
      <text x="160" y="44" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--hw-red)">one shared key</text>

      <g>
        <circle cx="40" cy="100" r="22" fill="white" stroke="var(--hw-border)" />
        <text x="40" y="104" textAnchor="middle" fontSize="12" fontWeight="700">Alice</text>
        <path d="M 62 95 Q 100 70 138 95" stroke="var(--hw-secondary-black)" strokeWidth="2" fill="none" />
        <polygon points="138,91 146,95 138,99" fill="var(--hw-secondary-black)" />
        <text x="100" y="68" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--hw-secondary-black)">encrypts</text>
      </g>
      <g>
        <circle cx="280" cy="100" r="22" fill="white" stroke="var(--hw-border)" />
        <text x="280" y="104" textAnchor="middle" fontSize="12" fontWeight="700">Bob</text>
        <path d="M 182 95 Q 220 70 258 95" stroke="var(--hw-secondary-black)" strokeWidth="2" fill="none" />
        <polygon points="258,91 266,95 258,99" fill="var(--hw-secondary-black)" />
        <text x="220" y="68" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--hw-secondary-black)">decrypts</text>
      </g>

      <text x="160" y="160" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--hw-secondary-black)">
        fast · but the key must reach Bob safely first
      </text>
    </svg>
  );
}
function SymmetricWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g fill="currentColor">
        <KeyShape x={40} y={60} scale={1.2} />
        <KeyShape x={220} y={120} scale={1.0} />
        <KeyShape x={100} y={240} scale={1.4} />
        <KeyShape x={260} y={300} scale={1.0} />
      </g>
    </svg>
  );
}

/* ----- 04 · Other symmetric ciphers (AES, ChaCha20) ----- */
function OtherCiphersHero() {
  return (
    <svg viewBox="0 0 320 180" role="img">
      {/* AES: block cipher */}
      <text x="70" y="32" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--hw-secondary-black)">AES · block</text>
      <g transform="translate(20, 44)">
        {[0, 1, 2, 3].map(r =>
          [0, 1, 2, 3].map(c => (
            <rect key={`${r}-${c}`} x={c * 24} y={r * 24} width="22" height="22" rx="3"
                  fill="var(--hw-red)" opacity={0.3 + 0.15 * ((r + c) % 4)} />
          ))
        )}
      </g>
      <text x="70" y="160" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--hw-secondary-black)">
        128-bit blocks
      </text>

      {/* Divider */}
      <line x1="160" y1="40" x2="160" y2="150" stroke="var(--hw-border)" strokeWidth="1" />

      {/* ChaCha20: stream cipher */}
      <text x="240" y="32" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--hw-secondary-black)">ChaCha20 · stream</text>
      <g transform="translate(180, 56)">
        <path d="M 0 36 Q 15 6 30 36 T 60 36 T 90 36 T 120 36"
              stroke="var(--hw-gold)" strokeWidth="3" fill="none" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <circle key={i} cx={i * 17} cy={36} r="3" fill="var(--hw-gold)" />
        ))}
      </g>
      <text x="240" y="160" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--hw-secondary-black)">
        continuous keystream
      </text>
    </svg>
  );
}
function OtherCiphersWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g fill="currentColor">
        {Array.from({ length: 7 }).map((_, r) =>
          Array.from({ length: 7 }).map((_, c) => (
            <rect key={`${r}-${c}`} x={30 + c * 52} y={30 + r * 52} width="42" height="42" rx="4" />
          ))
        )}
      </g>
    </svg>
  );
}

/* ----- 05 · Asymmetric keys ----- */
function AsymmetricHero() {
  return (
    <svg viewBox="0 0 320 180" role="img">
      {/* Public key */}
      <g transform="translate(30, 40)">
        <KeyIcon x={20} y={20} color="var(--hw-gold)" scale={1.2} />
        <text x="50" y="100" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--hw-secondary-black)">public</text>
        <text x="50" y="115" textAnchor="middle" fontSize="10" fill="var(--hw-secondary-black)">anyone can see</text>
      </g>
      {/* Private key */}
      <g transform="translate(200, 40)">
        <KeyIcon x={20} y={20} color="var(--hw-red)" scale={1.2} />
        <text x="50" y="100" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--hw-secondary-black)">private</text>
        <text x="50" y="115" textAnchor="middle" fontSize="10" fill="var(--hw-secondary-black)">only you</text>
      </g>
      <text x="160" y="160" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--hw-secondary-black)">
        mathematically linked · one locks, only the other unlocks
      </text>
    </svg>
  );
}
function AsymmetricWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g fill="currentColor">
        <LockShape x={60} y={40} scale={1.3} />
        <KeyShape x={220} y={120} scale={1.2} />
        <LockShape x={80} y={240} scale={1.0} />
        <KeyShape x={240} y={300} scale={1.4} />
      </g>
    </svg>
  );
}

/* ----- 06 · RSA ----- */
function RsaHero() {
  return (
    <svg viewBox="0 0 320 180" role="img">
      {/* p × q = n */}
      <g transform="translate(30, 34)">
        {/* 3 x 5 rectangle */}
        {[0, 1, 2].map(r =>
          [0, 1, 2, 3, 4].map(c => (
            <rect key={`${r}-${c}`} x={c * 22} y={r * 22} width="20" height="20" rx="3"
                  fill="var(--hw-brand-red-20)" stroke="var(--hw-red)" strokeWidth="1" />
          ))
        )}
        <text x="-6" y="36" textAnchor="end" fontSize="12" fontWeight="800">p</text>
        <text x="55" y="-6" textAnchor="middle" fontSize="12" fontWeight="800">q</text>
      </g>
      <text x="175" y="70" fontSize="16" fontWeight="900" fill="var(--hw-red)" fontFamily="monospace">n = p · q</text>
      <text x="175" y="94" fontSize="11" fontWeight="600" fill="var(--hw-secondary-black)">easy →</text>
      <text x="175" y="112" fontSize="11" fontWeight="600" fill="var(--hw-secondary-black)">← hard to reverse</text>

      {/* Trapdoor label */}
      <text x="160" y="160" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--hw-secondary-black)">
        a one-way gap only the key-holder can cross
      </text>
    </svg>
  );
}
function RsaWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g fill="currentColor" fontFamily="monospace" fontWeight="900">
        <text x="30" y="80" fontSize="60">2</text>
        <text x="130" y="60" fontSize="80">3</text>
        <text x="240" y="100" fontSize="70">5</text>
        <text x="320" y="80" fontSize="50">7</text>
        <text x="60" y="220" fontSize="65">11</text>
        <text x="170" y="200" fontSize="75">13</text>
        <text x="290" y="240" fontSize="60">17</text>
        <text x="40" y="340" fontSize="70">19</text>
        <text x="180" y="360" fontSize="85">23</text>
        <text x="310" y="340" fontSize="60">29</text>
      </g>
    </svg>
  );
}

/* ----- 07 · ECC ----- */
function EccHero() {
  // y² = x³ - x + 1 (standard shape), plot a few sample points
  return (
    <svg viewBox="0 0 320 180" role="img">
      {/* axes */}
      <line x1="30" y1="100" x2="290" y2="100" stroke="var(--hw-secondary-khaki)" strokeWidth="1" />
      <line x1="160" y1="20" x2="160" y2="170" stroke="var(--hw-secondary-khaki)" strokeWidth="1" />

      {/* curve — hand-drawn approximation of y²=x³-x+1 */}
      <path
        d="M 62 42 C 90 28 130 34 158 70 C 180 98 200 112 240 116
           M 240 84 C 200 88 180 102 158 130 C 130 166 90 172 62 158"
        stroke="var(--hw-red)" strokeWidth="2.4" fill="none"
      />

      {/* sample points */}
      <circle cx="158" cy="70" r="4.5" fill="var(--hw-red)" />
      <text x="158" y="62" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--hw-red)">P</text>
      <circle cx="200" cy="112" r="4.5" fill="var(--hw-gold)" />
      <text x="210" y="108" fontSize="10" fontWeight="700" fill="var(--hw-warning)">Q</text>
      <circle cx="120" cy="148" r="4.5" fill="var(--hw-secondary-black)" />
      <text x="110" y="162" fontSize="10" fontWeight="700" fill="var(--hw-secondary-black)">P+Q</text>

      <text x="160" y="14" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--hw-secondary-black)" fontFamily="monospace">
        y² = x³ − x + 1
      </text>
    </svg>
  );
}
function EccWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g stroke="currentColor" strokeWidth="3" fill="none">
        <path d="M 30 200 C 90 120 180 140 230 240 C 270 320 350 300 380 220
                 M 380 180 C 350 100 270 80 230 160 C 180 260 90 280 30 200" />
        <path d="M 60 60 C 130 40 200 50 280 100 M 60 340 C 130 360 200 350 280 300" opacity="0.3" />
      </g>
    </svg>
  );
}

/* ----- 08 · Shamir ----- */
function ShamirHero() {
  // A parabola (t=3) with 4 sample share points; f(0) highlighted
  return (
    <svg viewBox="0 0 320 180" role="img">
      {/* axes */}
      <line x1="30" y1="140" x2="290" y2="140" stroke="var(--hw-secondary-khaki)" strokeWidth="1" />
      <line x1="60" y1="20" x2="60" y2="160" stroke="var(--hw-secondary-khaki)" strokeWidth="1" />

      {/* y-axis highlight band for f(0) */}
      <rect x="52" y="20" width="16" height="140" fill="var(--hw-gold)" opacity=".25" />

      {/* parabola */}
      <path d="M 40 40 Q 160 200 280 40" stroke="var(--hw-red)" strokeWidth="2.5" fill="none" />

      {/* share points at x=1..4 (after the y-axis) */}
      {[{ x: 90, y: 70 }, { x: 130, y: 115 }, { x: 180, y: 125 }, { x: 235, y: 90 }].map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill="white" stroke="var(--hw-red)" strokeWidth="2" />
          <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--hw-secondary-black)">
            #{i + 1}
          </text>
        </g>
      ))}

      {/* f(0) marker */}
      <circle cx="60" cy="62" r="6" fill="var(--hw-gold)" stroke="var(--hw-warning)" strokeWidth="1.5" />
      <text x="66" y="50" fontSize="11" fontWeight="800" fill="var(--hw-warning)">f(0) = secret</text>

      <text x="160" y="170" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--hw-secondary-black)">
        t points pin down the curve · fewer leaves f(0) free
      </text>
    </svg>
  );
}
function ShamirWatermark() {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
      <g>
        <path d="M 20 120 Q 200 400 380 120" stroke="currentColor" strokeWidth="8" fill="none" opacity="0.8" />
        {[{ x: 80, y: 175 }, { x: 160, y: 255 }, { x: 240, y: 265 }, { x: 320, y: 185 }].map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="16" fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}

/* ============================================================
 * Primitive shape helpers used by several hero/watermark graphics
 * ============================================================ */
function KeyIcon({ x, y, color, scale = 1 }: { x: number; y: number; color: string; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <circle cx="12" cy="12" r="10" fill={color} stroke="white" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" fill="white" />
      <rect x="22" y="10" width="40" height="6" rx="1" fill={color} />
      <rect x="54" y="16" width="6" height="8" fill={color} />
      <rect x="44" y="16" width="4" height="6" fill={color} />
    </g>
  );
}
function KeyShape({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <circle cx="20" cy="20" r="18" />
      <rect x="36" y="14" width="56" height="12" />
      <rect x="82" y="26" width="10" height="12" />
      <rect x="68" y="26" width="6" height="9" />
      <circle cx="20" cy="20" r="8" fill="white" />
    </g>
  );
}
function LockShape({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <rect x="6" y="26" width="52" height="44" rx="4" />
      <path d="M 16 26 V 14 A 16 16 0 0 1 48 14 V 26" stroke="currentColor" strokeWidth="6" fill="none" />
    </g>
  );
}

/* ============================================================
 * Page
 * ============================================================ */
export default function Cryptography() {
  return (
    <OverviewPage
      eyebrow="Computer Science"
      title="Cryptography"
      blurb="A tour of the ideas that keep digital secrets safe — from the bits underneath everything, to the hashes, shared keys, and public-key systems that actually get used in the wild."
    >
      {/* ========== Foundations ========== */}
      <OverviewGroup label="Foundations" accent="gray">
        <OverviewSection
          eyebrow="01"
          title="Number representation"
          blurb="Everything in cryptography starts as bits. Integers, characters, hashes, keys — all fixed-width binary. Before you can encrypt anything, you have to agree on how to count."
          takeaways={[
            <>Bytes are 8 bits; words are typically 32 or 64.</>,
            <>The same bits can be read as a number, a character, or an address.</>,
            <>Crypto addresses are huge — Ethereum uses 160 bits.</>,
          ]}
          links={[{ to: '/code/binary-explorer', label: 'Binary Interpretation Explorer' }]}
          hero={<NumberHero />}
          watermark={<NumberWatermark />}
          accent="gray"
        />
        <OverviewConnector />
        <OverviewSection
          eyebrow="02"
          title="Hashing"
          blurb="A one-way function that turns any message into a fixed-size fingerprint. Same input → same output. Tiny change → wildly different output. Effectively impossible to reverse."
          takeaways={[
            <>Used for integrity checks, password storage, and as the engine inside signatures.</>,
            <>SHA-256 and Keccak-256 are the two you'll meet in practice.</>,
            <>A hash is <em>not</em> encryption — there's no key and no way back.</>,
          ]}
          links={[{ to: '/code/sha1-flow-explorer', label: 'SHA-1 Flow Explorer' }]}
          hero={<HashingHero />}
          watermark={<HashingWatermark />}
          accent="gray"
        />
      </OverviewGroup>

      {/* ========== Encryption I — Shared keys ========== */}
      <OverviewGroup label="Encryption I · shared keys" accent="gold">
        <OverviewSection
          eyebrow="03"
          title="Symmetric keys"
          blurb="Both parties share a single secret. Whoever knows the key can encrypt and decrypt. Fast and simple — but how do you agree on that key without someone listening?"
          takeaways={[
            <>One key does both jobs.</>,
            <>Great for data you've already got on your own disk.</>,
            <>The distribution problem is why asymmetric cryptography exists.</>,
          ]}
          hero={<SymmetricHero />}
          watermark={<SymmetricWatermark />}
          accent="gold"
        />
        <OverviewConnector accent="gold" />
        <OverviewSection
          eyebrow="04"
          title="Other symmetric ciphers — AES, ChaCha20"
          blurb="Modern shared-key workhorses. AES encrypts 128-bit blocks at a time; ChaCha20 builds a continuous keystream from a small key. Different engines, same idea: one secret, both directions."
          takeaways={[
            <>AES · block cipher · the TLS, disk-encryption, and file-format default.</>,
            <>ChaCha20 · stream cipher · fast in software, often paired with Poly1305 for authentication.</>,
            <>Whatever the engine, the key-distribution problem still bites.</>,
          ]}
          hero={<OtherCiphersHero />}
          watermark={<OtherCiphersWatermark />}
          accent="gold"
        />
      </OverviewGroup>

      {/* ========== Encryption II — Public-key ========== */}
      <OverviewGroup label="Encryption II · public-key" accent="red">
        <OverviewSection
          eyebrow="05"
          title="Asymmetric keys"
          blurb="Two keys per person. A public key anyone can see, and a private key only you have. Lock with the public; only the private can unlock. Now you can send secrets without ever meeting."
          takeaways={[
            <>Solves the key-distribution problem symmetric crypto can't.</>,
            <>Same keys power <em>digital signatures</em> — signed with the private, verified with the public.</>,
            <>Slower than symmetric, so in practice you use asymmetric to agree on a symmetric session key.</>,
          ]}
          hero={<AsymmetricHero />}
          watermark={<AsymmetricWatermark />}
          accent="red"
        />
        <OverviewConnector accent="red" />
        <OverviewSection
          eyebrow="06"
          title="RSA"
          blurb="The first and most famous public-key system. Its secret hides in a one-way gap: easy to multiply two primes, nearly impossible to factor the result. The whole scheme is built on that asymmetry."
          takeaways={[
            <>Public key: the product <code>n = p · q</code> plus a small exponent <code>e</code>.</>,
            <>Private key: an exponent <code>d</code> only computable if you know <em>p</em> and <em>q</em>.</>,
            <>Real RSA uses ~1200-digit n — factoring would take longer than the universe has existed.</>,
          ]}
          links={[
            { to: '/code/rsa-encryption', label: 'RSA Encryption Demo' },
            { to: '/code/rsa-cracker', label: 'Cracking RSA: Period Finding' },
          ]}
          hero={<RsaHero />}
          watermark={<RsaWatermark />}
          accent="red"
        />
        <OverviewConnector accent="red" />
        <OverviewSection
          eyebrow="07"
          title="Elliptic-curve cryptography (ECC)"
          blurb="Public-key cryptography built on a different hard problem — point arithmetic on an elliptic curve. Equivalent strength with much smaller keys: 256-bit ECC ≈ 3072-bit RSA."
          takeaways={[
            <>Smaller keys mean faster handshakes and less bandwidth.</>,
            <>Powers TLS 1.3, SSH, and every major blockchain's signatures (Bitcoin, Ethereum).</>,
            <>The hard problem: given points <em>P</em> and <em>kP</em>, find <em>k</em>.</>,
          ]}
          hero={<EccHero />}
          watermark={<EccWatermark />}
          accent="red"
        />
      </OverviewGroup>

      {/* ========== Working together ========== */}
      <OverviewGroup label="Working together" accent="black">
        <OverviewSection
          eyebrow="08"
          title="Sharing a secret across people"
          blurb="Sometimes no one person should hold the whole key. Shamir's Secret Sharing splits a secret into n pieces so any t together can reconstruct it — and any t − 1 learn nothing at all."
          takeaways={[
            <>3-of-5 board approvals, crypto cold wallets, password recovery.</>,
            <>Geometric idea: <em>t</em> points uniquely define a degree-(t − 1) polynomial.</>,
            <>Underlies modern <em>threshold signatures</em> and multi-sig wallets.</>,
          ]}
          links={[{ to: '/code/shamir', label: "Shamir's Secret Sharing" }]}
          hero={<ShamirHero />}
          watermark={<ShamirWatermark />}
          accent="black"
        />
      </OverviewGroup>
    </OverviewPage>
  );
}
