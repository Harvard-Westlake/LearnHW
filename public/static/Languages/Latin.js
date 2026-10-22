// Latin Translator Logic
(function() {
    const modeButtons = {
        poetry: document.getElementById('btn-poetry'),
        prose: document.getElementById('btn-prose')
    };
    const authorSection = document.getElementById('author-section');
    const authorInput = document.getElementById('author-input');
    const latinSection = document.getElementById('latin-section');
    const latinInput = document.getElementById('latin-input');
    const latinOverlay = document.getElementById('latin-overlay');
    const wordCount = document.getElementById('word-count');
    const inputWarning = document.getElementById('input-warning');
    const examineBtn = document.getElementById('examine-btn');
    const analysisOutput = document.getElementById('analysis-output');
    const groupLegend = document.getElementById('group-legend');
    const renderedText = document.getElementById('rendered-text');
    const grammarSection = document.getElementById('grammar-section');
    const grammarList = document.getElementById('grammar-list');
    const translationSection = document.getElementById('translation-section');
    const translationInput = document.getElementById('translation-input');
    const checkTranslationBtn = document.getElementById('check-translation-btn');
    const translationFeedback = document.getElementById('translation-feedback');

    const STATE = {
        mode: null,
        lastValidLatin: '',
        overlayActive: false,
        tokens: [],
        groups: [],
        grammar: [],
        baselineEnglish: []
    };

    const COLOR_PALETTE = [
        '#fde047', '#60a5fa', '#34d399', '#f472b6', '#fb923c', '#a78bfa', '#f87171', '#22d3ee'
    ];

    // Mode selection
    modeButtons.poetry.addEventListener('click', () => selectMode('poetry'));
    modeButtons.prose.addEventListener('click', () => selectMode('prose'));

    function selectMode(mode) {
        STATE.mode = mode;
        modeButtons.poetry.setAttribute('aria-pressed', String(mode === 'poetry'));
        modeButtons.prose.setAttribute('aria-pressed', String(mode === 'prose'));
        modeButtons.poetry.classList.toggle('active', mode === 'poetry');
        modeButtons.prose.classList.toggle('active', mode === 'prose');
        authorSection.hidden = false;
        latinSection.hidden = false;
        examineBtn.disabled = latinInput.value.trim().length === 0;
        resetAnalysisState();
    }

    // Input handling with 50-word cap
    function tokenizeForCount(text) {
        const matches = text.match(/\p{L}+[\p{L}\-]*|\d+/gu) || [];
        return matches;
    }

    function updateWordCount() {
        const tokens = tokenizeForCount(latinInput.value);
        wordCount.textContent = `${tokens.length}/50 words`;
        examineBtn.disabled = tokens.length === 0;
    }

    function enforceCap(e) {
        const tokens = tokenizeForCount(latinInput.value);
        if (tokens.length > 50) {
            inputWarning.textContent = 'Limit is 50 words. Extra input was not added.';
            latinInput.value = STATE.lastValidLatin;
            setTimeout(() => inputWarning.textContent = '', 2000);
    } else {
            STATE.lastValidLatin = latinInput.value;
        }
        updateWordCount();
        if (STATE.overlayActive) hideOverlayForEditing();
        // Reset button to Examine! on any edit
        examineBtn.textContent = 'Examine!';
        examineBtn.disabled = tokenizeForCount(latinInput.value).length === 0;
    }

    latinInput.addEventListener('input', enforceCap);
    latinInput.addEventListener('focus', hideOverlayForEditing);

    // Examine -> analyze -> Ready
    examineBtn.addEventListener('click', async () => {
        if (examineBtn.disabled) return;
        examineBtn.disabled = true;
        examineBtn.textContent = 'Analyzing…';
        const text = latinInput.value;
        await new Promise(r => setTimeout(r, 30));
        const analysis = analyze(text, {
            mode: STATE.mode,
            author: (authorInput.value || '').trim()
        });
        STATE.tokens = analysis.tokens;
        STATE.groups = analysis.groups;
        STATE.grammar = analysis.grammar;
        STATE.baselineEnglish = analysis.baselineEnglish;

        renderOverlay(text, STATE.tokens, STATE.groups);
        renderLegend(STATE.groups);
        renderGrammar(STATE.grammar);

        analysisOutput.hidden = false;
        grammarSection.hidden = false;
        translationSection.hidden = false;
        examineBtn.textContent = 'Ready!';
        STATE.overlayActive = true;
    });

    // Tooltips
    const tooltip = createTooltip();

    function createTooltip() {
        const el = document.createElement('div');
        el.className = 'tooltip';
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    }

    function showTooltip(html, x, y) {
        tooltip.innerHTML = html;
        tooltip.style.left = Math.max(12, x + 12) + 'px';
        tooltip.style.top = Math.max(12, y + 12) + 'px';
        tooltip.style.display = 'block';
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }

    // Overlay rendering
    function renderOverlay(rawText, tokens, groups) {
        // Build a map from token index to group/color and tooltip
        const tokenMeta = new Map();
        const palette = COLOR_PALETTE;
        groups.forEach((g, idx) => {
            g.tokens.forEach(ti => {
                tokenMeta.set(ti, {
                    color: palette[idx % palette.length],
                    name: g.name
                });
    });
});

        // Replace words with spans in order using regex
        let idx = 0;
        const parts = [];
        const regex = /\p{L}+[\p{L}\-]*/gu;
        let lastIndex = 0;
        let m;
        while ((m = regex.exec(rawText)) !== null) {
            const [word] = m;
            parts.push(escapeHtml(rawText.slice(lastIndex, m.index)));
            const t = tokens[idx] || null;
            const meta = tokenMeta.get(idx);
            const tooltipHtml = buildTooltipHtml(t);
            const style = meta ? `style=\"background:${meta.color}33\"` : '';
            const cls = meta ? 'token highlight' : 'token';
            parts.push(`<span class="${cls}" data-ti="${idx}" ${style}>${escapeHtml(word)}</span>`);
            attachTokenHover(idx, tooltipHtml);
            idx++;
            lastIndex = regex.lastIndex;
        }
        parts.push(escapeHtml(rawText.slice(lastIndex)));
        latinOverlay.innerHTML = parts.join('');
        latinOverlay.style.display = 'block';
        latinOverlay.style.pointerEvents = 'auto';
        latinOverlay.setAttribute('aria-hidden', 'false');
        STATE.overlayActive = true;

        // Also render a read-only copy below for accessibility
        renderedText.innerHTML = latinOverlay.innerHTML;
        bindRenderedTextTooltips();
    }

    function hideOverlayForEditing() {
        if (!STATE.overlayActive) return;
        latinOverlay.style.display = 'none';
        latinOverlay.style.pointerEvents = 'none';
        latinOverlay.setAttribute('aria-hidden', 'true');
        STATE.overlayActive = false;
        hideTooltip();
        examineBtn.textContent = 'Examine!';
        examineBtn.disabled = tokenizeForCount(latinInput.value).length === 0;
    }

    function bindRenderedTextTooltips() {
        renderedText.querySelectorAll('.token').forEach(el => {
            const ti = Number(el.getAttribute('data-ti'));
            const t = STATE.tokens[ti];
            const html = buildTooltipHtml(t);
            el.addEventListener('mouseenter', (e) => showTooltip(html, e.clientX, e.clientY));
            el.addEventListener('mousemove', (e) => showTooltip(html, e.clientX, e.clientY));
            el.addEventListener('mouseleave', hideTooltip);
            el.addEventListener('click', (e) => {
                if (tooltip.style.display === 'block') { hideTooltip(); }
                else { showTooltip(html, e.clientX, e.clientY); }
            });
            el.addEventListener('focus', (e) => showTooltip(html, e.clientX || 0, e.clientY || 0));
            el.addEventListener('blur', hideTooltip);
            el.setAttribute('tabindex', '0');
        });
    }

    function attachTokenHover(index, html) {
        // Defer until after insert by event delegation on overlay
        // We'll add one-time listener to overlay
        if (!latinOverlay._bound) {
            latinOverlay.addEventListener('mouseover', tokenHoverHandler);
            latinOverlay.addEventListener('mousemove', tokenHoverHandler);
            latinOverlay.addEventListener('mouseout', tokenHoverOut);
            latinOverlay.addEventListener('click', tokenHoverHandler);
            latinOverlay._bound = true;
        }
    }

    function tokenHoverHandler(e) {
        const target = e.target.closest('.token');
        if (!target) {
            hideTooltip();
            return;
        }
        const ti = Number(target.getAttribute('data-ti'));
        const t = STATE.tokens[ti];
        if (!t) return;
        const html = buildTooltipHtml(t);
        showTooltip(html, e.clientX, e.clientY);
    }

    function tokenHoverOut() {
        hideTooltip();
    }

    function buildTooltipHtml(t) {
        if (!t) return '';
        const def = t.definition || 'Unknown';
        const pos = t.pos || 'Unknown';
        let extra = '';
        if (pos === 'noun') {
            extra = t.features.case ? `, case: ${t.features.case}` : '';
        } else if (pos === 'verb') {
            extra = t.features.tense ? `, tense: ${t.features.tense}` : '';
        } else if (pos === 'adjective') {
            extra = '';
        } else if (pos === 'participle') {
            extra = t.features.tense ? `, tense: ${t.features.tense}` : '';
        }
        return `<strong>${escapeHtml(t.original)}</strong><br>${escapeHtml(def)}<br><span class="hint">${pos}${extra}</span>`;
    }

    function renderLegend(groups) {
        groupLegend.innerHTML = '';
        groups.forEach((g, idx) => {
            const item = document.createElement('span');
            item.className = 'swatch';
            const dot = document.createElement('span');
            dot.className = 'dot';
            dot.style.background = COLOR_PALETTE[idx % COLOR_PALETTE.length];
            const label = document.createElement('span');
            label.textContent = g.name;
            item.appendChild(dot);
            item.appendChild(label);
            groupLegend.appendChild(item);
        });
        groupLegend.setAttribute('aria-hidden', groups.length ? 'false' : 'true');
    }

    function renderGrammar(grammar) {
        grammarList.innerHTML = '';
        if (!grammar.length) {
            const none = document.createElement('div');
            none.className = 'grammar-item';
            none.innerHTML = `<span class="grammar-name">None detected</span><span class="grammar-text"></span>`;
            grammarList.appendChild(none);
            return;
        }
        grammar.forEach(g => {
            const div = document.createElement('div');
            div.className = 'grammar-item';
            const name = document.createElement('span');
            name.className = 'grammar-name';
            name.textContent = g.name + ':';
            const text = document.createElement('span');
            text.className = 'grammar-text';
            text.textContent = `"${g.text}"`;
            div.appendChild(name);
            div.appendChild(text);
            grammarList.appendChild(div);
        });
    }

    // Translation evaluation
    checkTranslationBtn.addEventListener('click', () => {
        const user = (translationInput.value || '').toLowerCase();
        const userTokens = (user.match(/[a-z]+/g) || []).filter(w => w.length > 1);
        const expected = STATE.baselineEnglish;
        if (!expected || expected.length === 0) {
            translationFeedback.textContent = 'Run Examine! first to generate a baseline.';
            return;
        }
        const score = similarityScore(new Set(expected), new Set(userTokens));
        const ok = score >= 0.45 || (containsVerb(userTokens) && overlapCount(expected, userTokens) >= Math.ceil(expected.length * 0.4));
        translationInput.classList.toggle('translation-correct', ok);
        translationInput.classList.toggle('translation-incorrect', !ok);
        translationFeedback.textContent = ok ? 'Correct (semantic match) ✔' : 'Not quite — try again ✘';
    });

    function containsVerb(tokens) {
        return tokens.some(t => /(be|is|are|was|were|am|have|has|do|did|go|went|see|saw|says|said|love|comes|came|carry|carries|send|sends)/.test(t));
    }

    function overlapCount(a, b) {
        const bset = new Set(b);
        return a.filter(x => bset.has(x)).length;
    }

    function similarityScore(aSet, bSet) {
        const a = Array.from(aSet);
        let inter = 0;
        a.forEach(x => { if (bSet.has(x)) inter++; });
        const unionSize = aSet.size + bSet.size - inter;
        return unionSize ? inter / unionSize : 0;
    }

    // Analysis pipeline
    function analyze(rawText, opts) {
        const tokens = tokenize(rawText);
        const authorBias = inferAuthorBias(opts.author, opts.mode);
        tokens.forEach(t => annotateToken(t, authorBias));
        const groups = buildGroups(tokens, authorBias);
        const grammar = detectComplexGrammar(tokens, authorBias);
        const baselineEnglish = buildBaselineEnglish(tokens);
        return { tokens, groups, grammar, baselineEnglish };
    }

    function tokenize(text) {
        const regex = /\p{L}+[\p{L}\-]*/gu;
        const tokens = [];
        let m;
        while ((m = regex.exec(text)) !== null) {
            const word = m[0];
            tokens.push({
                original: word,
                normalized: normalizeLatin(word),
                pos: 'unknown',
                features: {},
                definition: lookupDefinition(word)
            });
        }
        return tokens;
    }

    function normalizeLatin(w) {
        return w
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
            .replace(/j/g, 'i')
            .replace(/v/g, 'u');
    }

    function annotateToken(t, bias) {
        // Simple morphology heuristics
        const w = t.normalized;
        // Verb patterns
        if (/\b(sum|es|est|sumus|estis|sunt)\b/.test(w)) {
            t.pos = 'verb';
            t.features.tense = 'present';
            t.definition ||= 'be';
            return;
        }
        if (/nt$/.test(w) || /t$/.test(w) || /(o|m)$/.test(w)) {
            t.pos = 'verb';
            t.features.tense = /it$|erunt$/.test(w) ? 'perfect' : 'present';
            return;
        }
        if (/re$/.test(w)) {
            t.pos = 'verb';
            t.features.tense = 'infinitive';
            return;
        }
        // Participles
        if (/nt(\b|[aeiouy])/.test(w)) {
            t.pos = 'participle';
            t.features.tense = 'present';
            return;
        }
        if (/(tus|sus|xa|ctus|ptus|rsus)$/.test(w) || /(urus)$/.test(w)) {
            t.pos = /(urus)$/.test(w) ? 'participle' : 'participle';
            t.features.tense = /(urus)$/.test(w) ? 'future' : 'perfect';
            return;
        }
        // Noun/adjective endings (very simplified)
        if (/(ae|am|as|arum)$/.test(w) || /(a)$/.test(w)) {
            t.pos = guessAdjOrNoun(w);
            t.features.case = caseFromEnding1st(w);
            return;
        }
        if (/(us|i|o|um|os|orum)$/.test(w)) {
            t.pos = guessAdjOrNoun(w);
            t.features.case = caseFromEnding2nd(w);
            return;
        }
        if (/(em|es|is|e|ibus|um|ium)$/.test(w)) {
            t.pos = 'noun';
            t.features.case = caseFromEnding3rd(w);
            return;
        }
        if (/que$|ve$|ne$/.test(w)) {
            t.pos = 'particle';
            return;
        }
        // fallback
        t.pos = t.pos || 'unknown';
    }

    function guessAdjOrNoun(w) {
        return LEXICON[w]?.pos || (/(us|a|um|i|ae)$/.test(w) ? 'adjective' : 'noun');
    }

    function caseFromEnding1st(w) {
        if (/ae$/.test(w)) return 'gen/dat sg or nom pl';
        if (/am$/.test(w)) return 'acc sg';
        if (/arum$/.test(w)) return 'gen pl';
        if (/a$/.test(w)) return 'nom/abl sg';
        return undefined;
    }

    function caseFromEnding2nd(w) {
        if (/i$/.test(w)) return 'gen sg or nom pl';
        if (/o$/.test(w)) return 'dat/abl sg';
        if (/um$/.test(w)) return 'acc sg (or nom/acc sg neuter)';
        if (/os$/.test(w)) return 'acc pl';
        if (/orum$/.test(w)) return 'gen pl';
        if (/us$/.test(w)) return 'nom sg';
        return undefined;
    }

    function caseFromEnding3rd(w) {
        if (/em$/.test(w)) return 'acc sg';
        if (/es$/.test(w)) return 'nom/acc pl';
        if (/is$/.test(w)) return 'gen sg or dat sg';
        if (/e$/.test(w)) return 'abl sg';
        if (/ibus$/.test(w)) return 'dat/abl pl';
        if (/um$/.test(w)) return 'gen pl';
        if (/ium$/.test(w)) return 'gen pl (i-stem)';
        return undefined;
    }

    function buildGroups(tokens, bias) {
        const groups = [];
        // noun-adjective agreements (naive)
        const agreements = [];
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.pos === 'noun') {
                const windowSize = bias.poetry ? 6 : 3;
                for (let j = Math.max(0, i - windowSize); j <= Math.min(tokens.length - 1, i + windowSize); j++) {
                    if (i === j) continue;
                    const a = tokens[j];
                    if (a.pos === 'adjective' && t.features.case && a.features.case && sameCaseBucket(t.features.case, a.features.case)) {
                        agreements.push(new Set([i, j]));
                    }
                }
            }
        }
        if (agreements.length) {
            const uniq = mergeSets(agreements);
            uniq.forEach(set => groups.push({ name: 'Noun–Adjective', tokens: Array.from(set) }));
        }

        // participial phrases (participle + nearest noun)
        tokens.forEach((t, i) => {
            if (t.pos === 'participle') {
                let best = -1, bestDist = Infinity;
                const windowSize = bias.poetry ? 6 : 4;
                for (let j = Math.max(0, i - windowSize); j <= Math.min(tokens.length - 1, i + windowSize); j++) {
                    if (i === j) continue;
                    if (tokens[j].pos === 'noun') {
                        const d = Math.abs(j - i);
                        if (d < bestDist) { best = j; bestDist = d; }
                    }
                }
                if (best >= 0) groups.push({ name: 'Participial Phrase', tokens: [i, best] });
            }
        });

        // relative clause (from relative pronoun to next finite verb)
        const relSet = new Set(['qui','quae','quod','quem','quam','quos','quas','quo','qua','quibus','cui','cuius','quorum','quarum']);
        for (let i = 0; i < tokens.length; i++) {
            if (relSet.has(tokens[i].normalized)) {
                const span = [i];
                for (let j = i + 1; j < tokens.length; j++) {
                    span.push(j);
                    if (tokens[j].pos === 'verb') break;
                }
                groups.push({ name: 'Relative Clause', tokens: span });
            }
        }

        // subject–verb (very naive: noun near finite verb)
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.pos === 'verb' && t.features.tense !== 'infinitive') {
                let subj = -1; let best = Infinity;
                for (let j = Math.max(0, i - 4); j <= Math.min(tokens.length - 1, i + 2); j++) {
                    if (tokens[j].pos === 'noun') {
                        const d = Math.abs(j - i);
                        if (d < best) { subj = j; best = d; }
                    }
                }
                if (subj >= 0) groups.push({ name: 'Subject–Verb', tokens: [subj, i] });
            }
        }

        return groups;
    }

    function sameCaseBucket(a, b) {
        // quick bucket match
        const bucket = s => s ? s.split(' ')[0] : '';
        return bucket(a) === bucket(b);
    }

    function mergeSets(sets) {
        const result = [];
        sets.forEach(s => {
            let merged = false;
            for (const r of result) {
                if ([...s].some(x => r.has(x))) { [...s].forEach(x => r.add(x)); merged = true; break; }
            }
            if (!merged) result.push(new Set(s));
        });
        return result;
    }

    function detectComplexGrammar(tokens, bias) {
        const found = [];
        // Ablative absolute: ablative noun + participle nearby
        for (let i = 0; i < tokens.length - 1; i++) {
            const a = tokens[i];
            const b = tokens[i+1];
            if ((a.pos === 'noun' && /abl/.test((a.features.case||''))) && b.pos === 'participle') {
                found.push({ name: 'Ablative Absolute', text: `${a.original} ${b.original}` });
            }
        }
        // Supine (accusative -um after motion verb)
        const motion = new Set(['venit','veniunt','venimus','venio','eo','iit','iit','ierunt','ibat','ibant','iit','ivimus','adeo','redeo']);
        for (let i = 0; i < tokens.length - 1; i++) {
            if (motion.has(tokens[i].normalized) && /um$/.test(tokens[i+1].normalized)) {
                found.push({ name: 'Accusative Supine', text: tokens[i+1].original });
            }
        }
        // Indirect statement: head-verb + accusative + infinitive
        const heads = new Set(['dicit','dixit','putat','putavit','puto','dico','video','videt','viderunt','audio','audivit']);
        for (let i = 0; i < tokens.length - 2; i++) {
            if (heads.has(tokens[i].normalized)) {
                const hasAcc = /(am|um|em|as|os|es)$/.test(tokens[i+1].normalized) || /eum|eam|eos|eas|me|te|nos|vos/.test(tokens[i+1].normalized);
                const isInf = /re$|isse$/.test(tokens[i+2].normalized);
                if (hasAcc && isInf) {
                    const span = [tokens[i].original, tokens[i+1].original, tokens[i+2].original].join(' ');
                    found.push({ name: 'Indirect Statement', text: span });
                }
            }
        }
        // Relative Clause of Characteristic: relative + subjunctiveish verb form heuristic (very naive)
        const relSet = new Set(['qui','quae','quod','quem','quam','quos','quas','quo','qua','quibus','cui','cuius','quorum','quarum']);
        for (let i = 0; i < tokens.length - 1; i++) {
            if (relSet.has(tokens[i].normalized) && /(ret|rit|erint|erimus)$/.test(tokens[i+1].normalized)) {
                found.push({ name: 'Relative Clause of Characteristic', text: `${tokens[i].original} ${tokens[i+1].original}` });
            }
        }
        return found;
    }

    function buildBaselineEnglish(tokens) {
        const english = [];
        tokens.forEach(t => {
            const gloss = (t.definition || '').toLowerCase();
            if (!gloss) return;
            const keep = gloss.split(/[^a-z]+/).filter(x => x && x.length > 1);
            keep.forEach(k => english.push(k));
        });
        return Array.from(new Set(english));
    }

    function inferAuthorBias(author, mode) {
        const a = (author || '').toLowerCase();
        const poetryAuthors = ['vergil','virgil','ovid','horace','catullus','propertius','tibullus'];
        const proseAuthors = ['caesar','cicero','sallust','livy','pliny'];
        return {
            poetry: mode === 'poetry' || poetryAuthors.some(x => a.includes(x)),
            prose: mode === 'prose' || proseAuthors.some(x => a.includes(x))
        };
    }

    function renderSafe(text) {
        return text.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
    }

    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
    }

    // Minimal lexicon for demo
    const LEXICON = {
        'amo': { pos: 'verb', def: 'love' },
        'amas': { pos: 'verb', def: 'love' },
        'amat': { pos: 'verb', def: 'love' },
        'amamus': { pos: 'verb', def: 'love' },
        'amant': { pos: 'verb', def: 'love' },
        'video': { pos: 'verb', def: 'see' },
        'videt': { pos: 'verb', def: 'see' },
        'vident': { pos: 'verb', def: 'see' },
        'dico': { pos: 'verb', def: 'say' },
        'dicit': { pos: 'verb', def: 'say' },
        'credo': { pos: 'verb', def: 'believe' },
        'credere': { pos: 'verb', def: 'believe' },
        'venio': { pos: 'verb', def: 'come' },
        'venit': { pos: 'verb', def: 'come' },
        'porto': { pos: 'verb', def: 'carry' },
        'mitto': { pos: 'verb', def: 'send' },
        'puella': { pos: 'noun', def: 'girl' },
        'puer': { pos: 'noun', def: 'boy' },
        'vir': { pos: 'noun', def: 'man' },
        'amicus': { pos: 'noun', def: 'friend' },
        'dea': { pos: 'noun', def: 'goddess' },
        'deus': { pos: 'noun', def: 'god' },
        'bellum': { pos: 'noun', def: 'war' },
        'bonus': { pos: 'adjective', def: 'good' },
        'bona': { pos: 'adjective', def: 'good' },
        'bonum': { pos: 'adjective', def: 'good' },
        'magnus': { pos: 'adjective', def: 'great' },
        'magna': { pos: 'adjective', def: 'great' },
        'magnum': { pos: 'adjective', def: 'great' },
        'qui': { pos: 'pronoun', def: 'who' },
        'quae': { pos: 'pronoun', def: 'who' },
        'quod': { pos: 'pronoun', def: 'which' }
    };

    function lookupDefinition(word) {
        const n = normalizeLatin(word);
        return LEXICON[n]?.def;
    }

    // Initialize counts
    updateWordCount();
})();
