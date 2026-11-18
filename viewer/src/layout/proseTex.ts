// The mathematics inside a sentence ("A₁ enters …", "Û_B⁽¹⁾ copies …", "|α|² = 0.5",
// "Ŝ_M†", "2^n − 1"), cut out of the prose so that KaTeX typesets it and the words stay in
// the UI font. Pure string work; no physics.

export type ProsePart = { t: "text"; v: string } | { t: "tex"; v: string; src: string };

const SUP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁺": "+", "⁻": "−", "⁼": "=", "⁽": "(", "⁾": ")",
  "ᵃ": "a", "ᵇ": "b", "ᶜ": "c", "ᵈ": "d", "ᵉ": "e", "ᶠ": "f", "ᵍ": "g", "ʰ": "h", "ⁱ": "i", "ʲ": "j",
  "ᵏ": "k", "ˡ": "l", "ᵐ": "m", "ⁿ": "n", "ᵒ": "o", "ᵖ": "p", "ʳ": "r", "ˢ": "s", "ᵗ": "t", "ᵘ": "u",
  "ᵛ": "v", "ʷ": "w", "ˣ": "x", "ʸ": "y", "ᶻ": "z",
};
const SUB: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "−", "₌": "=", "₍": "(", "₎": ")",
  "ₐ": "a", "ₑ": "e", "ₒ": "o", "ₓ": "x", "ₕ": "h", "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₚ": "p",
  "ₛ": "s", "ₜ": "t", "ᵢ": "i", "ⱼ": "j", "ᵣ": "r", "ᵤ": "u", "ᵥ": "v",
};
const GREEK: Record<string, string> = {
  α: "\\alpha", β: "\\beta", γ: "\\gamma", δ: "\\delta", ε: "\\varepsilon", η: "\\eta", θ: "\\theta",
  κ: "\\kappa", λ: "\\lambda", μ: "\\mu", ν: "\\nu", ξ: "\\xi", π: "\\pi", ρ: "\\rho", σ: "\\sigma",
  τ: "\\tau", φ: "\\varphi", χ: "\\chi", ψ: "\\psi", ω: "\\omega", Γ: "\\Gamma", Δ: "\\Delta",
  Θ: "\\Theta", Λ: "\\Lambda", Π: "\\Pi", Σ: "\\Sigma", Φ: "\\Phi", Ψ: "\\Psi", Ω: "\\Omega",
};
const SYMBOL: Record<string, string> = {
  "−": "-", "↑": "\\uparrow ", "↓": "\\downarrow ", "○": "\\circ ", "●": "\\bullet ", "†": "\\dagger ",
  "′": "'", "∅": "\\varnothing ", "°": "{\\degree}", "·": "\\cdot ", "⊕": "\\oplus ", "⊗": "\\otimes ",
  "∞": "\\infty ", "≤": "\\le ", "≥": "\\ge ", "≈": "\\approx ", "×": "\\times ", "→": "\\to ",
  "%": "\\%", "&": "\\&", "#": "\\#", "$": "\\$", "~": "\\sim ",
};
const ACCENT: Record<string, string> = { "̂": "\\hat", "̃": "\\tilde", "̄": "\\bar", "̇": "\\dot" };

const isLetter = (c: string | undefined) => c !== undefined && /[A-Za-zͰ-Ͽ]/.test(c);
const isWordChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9Ͱ-Ͽ̀-ͯ]/.test(c);
const isMark = (c: string | undefined) => c !== undefined && /[̀-ͯ]/.test(c);

/** TeX of the content of a sub- or superscript: words become \text, symbols commands. */
function scriptTex(content: string): string {
  let out = "";
  let i = 0;
  while (i < content.length) {
    const word = /^[A-Za-z]{2,}/.exec(content.slice(i));
    if (word) {
      out += `\\text{${word[0]}}`;
      i += word[0].length;
      continue;
    }
    const c = content[i]!;
    if (isMark(c)) {
      i += 1;
      continue;
    }
    if (ACCENT[content[i + 1] ?? ""] && /[A-Za-z]/.test(c)) out += `${ACCENT[content[i + 1]!]}{${c}}`;
    else out += GREEK[c] ?? SYMBOL[c] ?? (c === "\\" ? "" : c);
    i += 1;
  }
  return out;
}

/** Braced group starting at s[i] === "{", or null. */
function braced(s: string, i: number): { v: string; end: number } | null {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return { v: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

/** Scripts after a base at s[i…]: _x, _{…}, ^x, ^{…}, ₁₂, ⁽¹⁾, ᶜ, †, and a rail arrow ↑/↓
 *  right after a subscript (D̃₁↓). */
function scripts(s: string, i: number): { sub: string; sup: string; end: number } {
  let sub = "";
  let sup = "";
  for (;;) {
    const c = s[i];
    if ((c === "_" || c === "^") && i + 1 < s.length) {
      let v: string | null = null;
      if (s[i + 1] === "{") {
        const b = braced(s, i + 1);
        if (b) {
          v = b.v;
          i = b.end;
        }
      } else {
        const m = /^(?:[A-Za-z0-9′']+|[○●]|\([^()\s]{1,8}\))/.exec(s.slice(i + 1));
        if (m) {
          v = m[0];
          i += 1 + m[0].length;
        }
      }
      if (v === null) break;
      if (c === "_") sub += scriptTex(v);
      else sup += scriptTex(v);
      continue;
    }
    if (c !== undefined && SUB[c] !== undefined) {
      let v = "";
      while (s[i] !== undefined && SUB[s[i]!] !== undefined) v += SUB[s[i++]!];
      sub += scriptTex(v);
      continue;
    }
    if (c === "⁽") {
      const close = s.indexOf("⁾", i);
      const inner = close > 0 ? s.slice(i + 1, close) : "";
      if (close < 0 || /\s/.test(inner)) break;
      sup += `(${scriptTex([...inner].map((x) => SUP[x] ?? x).join(""))})`;
      i = close + 1;
      continue;
    }
    if (c !== undefined && SUP[c] !== undefined) {
      let v = "";
      while (s[i] !== undefined && SUP[s[i]!] !== undefined && s[i] !== "⁽") v += SUP[s[i++]!];
      sup += scriptTex(v);
      continue;
    }
    if (c === "†") {
      sup += "\\dagger ";
      i += 1;
      continue;
    }
    if ((c === "↑" || c === "↓") && sub && !isWordChar(s[i + 1])) {
      sup += SYMBOL[c];
      i += 1;
      continue;
    }
    break;
  }
  return { sub, sup, end: i };
}

function withScripts(base: string, sub: string, sup: string): string {
  return `${base}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""}`;
}

/** TeX of what sits inside a ket or a bracket: walker states R, B upright, every other
 *  symbol as in a formula (|a⟩, |b^(a)⟩, ⟨ψ_ideal|ψ_out⟩). */
function innerTex(inner: string): string | null {
  if (/[\s{}\\]/.test(inner)) return null;
  return formulaBodyTex(inner, "RB");
}

/** A ket |…⟩, a bracket ⟨…|…⟩ or ⟨N⟩, or a modulus |⟨…|…⟩| at s[i], with its scripts. */
function bracketAt(s: string, i: number): { tex: string; end: number } | null {
  const rest = s.slice(i);
  let m: RegExpExecArray | null;
  let tex: string | null = null;
  let end = i;
  if ((m = /^\|⟨([^\s|⟨⟩]{1,16})\|([^\s|⟨⟩]{1,16})⟩\|/.exec(rest))) {
    const a = innerTex(m[1]!);
    const b = innerTex(m[2]!);
    if (a !== null && b !== null) tex = `\\lvert\\langle ${a}\\vert ${b}\\rangle\\rvert`;
  } else if ((m = /^⟨([^\s|⟨⟩]{1,16})(?:\|([^\s|⟨⟩]{1,16}))?⟩/.exec(rest))) {
    const a = innerTex(m[1]!);
    const b = m[2] === undefined ? "" : innerTex(m[2]);
    if (a !== null && b !== null) tex = m[2] === undefined ? `\\langle ${a}\\rangle` : `\\langle ${a}\\vert ${b}\\rangle`;
  } else if ((m = /^\|([^\s|⟩]{1,16})⟩/.exec(rest))) {
    const a = innerTex(m[1]!);
    if (a !== null) tex = `\\lvert ${a}\\rangle`;
  }
  if (tex === null || !m) return null;
  end = i + m[0].length;
  const sc = scripts(s, end);
  return { tex: withScripts(tex, sc.sub, sc.sup), end: sc.end };
}

/** Split a sentence into words and mathematics: a symbol (a letter with scripts, a hat or a
 *  tilde, or a Greek letter), a ket, |α|², or 2^n. Identifiers like scatter_flip stay text. */
export function proseParts(text: string): ProsePart[] {
  const s = text.normalize("NFD");
  const parts: ProsePart[] = [];
  let buf = "";
  const flush = () => {
    if (buf) parts.push({ t: "text", v: buf.normalize("NFC") });
    buf = "";
  };
  const emit = (tex: string, from: number, to: number) => {
    flush();
    parts.push({ t: "tex", v: tex, src: s.slice(from, to).normalize("NFC") });
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    const prev = s[i - 1];
    const free = !isWordChar(prev);
    if ((c === "|" || c === "⟨") && free) {
      const k = bracketAt(s, i);
      if (k) {
        emit(k.tex, i, k.end);
        i = k.end;
        continue;
      }
      const abs = /^\|([Ͱ-Ͽ])\|/.exec(s.slice(i));
      if (abs && GREEK[abs[1]!]) {
        const sc = scripts(s, i + 3);
        emit(withScripts(`\\lvert ${GREEK[abs[1]!]}\\rvert`, sc.sub, sc.sup), i, sc.end);
        i = sc.end;
        continue;
      }
    }
    if (isLetter(c) && free) {
      let j = i + 1;
      let base = GREEK[c] ?? c;
      const greek = GREEK[c] !== undefined;
      let accented = false;
      while (isMark(s[j])) {
        const acc = ACCENT[s[j]!];
        if (acc) {
          base = `${acc}{${base}}`;
          accented = true;
        }
        j++;
      }
      const sc = scripts(s, j);
      const scripted = sc.sub !== "" || sc.sup !== "";
      if ((scripted || accented || greek) && !isWordChar(s[sc.end]) && (scripted || !isLetter(s[j]))) {
        emit(withScripts(base, sc.sub, sc.sup), i, sc.end);
        i = sc.end;
        continue;
      }
    }
    if (/[0-9]/.test(c) && free) {
      const num = /^[0-9]+(?=\^)/.exec(s.slice(i));
      if (num) {
        const sc = scripts(s, i + num[0].length);
        if (sc.sup && !isWordChar(s[sc.end])) {
          emit(withScripts(num[0], sc.sub, sc.sup), i, sc.end);
          i = sc.end;
          continue;
        }
      }
    }
    buf += c;
    i += 1;
  }
  flush();
  return parts;
}

/** TeX of a closed formula written in plain Unicode ("T_parallel = 5n + 2m", "Σ_d (n + m − d)",
 *  "2(2^n − 1)", "n(n + m) − n(n + 1)/2"): every character is mathematics; the letters in
 *  `upright` (walker states R, B inside kets) are set upright. */
export function formulaBodyTex(body: string, upright = ""): string {
  const s = body.normalize("NFD");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    let atom: string;
    let j = i + 1;
    if (c === "Σ") atom = "\\sum";
    else if (upright.includes(c) && !/[A-Za-z]/.test(s[j] ?? "")) atom = `\\mathrm{${c}}`;
    else if (/[A-Za-z]/.test(c) && ACCENT[s[j] ?? ""]) {
      atom = `${ACCENT[s[j]!]}{${c}}`;
      j += 1;
    } else if (c === " ") atom = " ";
    else atom = GREEK[c] ?? SYMBOL[c] ?? (c === "\\" || c === "{" || c === "}" ? "" : c);
    const sc = c === " " ? { sub: "", sup: "", end: j } : scripts(s, j);
    out += withScripts(atom, sc.sub, sc.sup);
    i = sc.end;
  }
  return out.replace(/ +/g, " ").trim();
}

/** A formula of the Resources panel cut into mathematics and words: the trailing remark in
 *  parentheses ("(per tree)", "(no D̃_m, arXiv count)"), a "label:" before a formula and the
 *  parts after "; " stay prose. */
export function resourceFormulaParts(text: string): ProsePart[] {
  const out: ProsePart[] = [];
  text.split("; ").forEach((seg, k) => {
    if (k > 0) out.push({ t: "text", v: "; " });
    let body = seg.trim();
    const label = /^([A-Za-z][A-Za-z ]*):\s+/.exec(body);
    if (label) {
      out.push({ t: "text", v: `${label[1]}: ` });
      body = body.slice(label[0].length);
    }
    let remark = "";
    const m = /\s*(\([^()]*[A-Za-z]{3,}[^()]*\))$/.exec(body);
    if (m && m.index > 0) {
      remark = m[1]!;
      body = body.slice(0, m.index);
    }
    if (body) out.push({ t: "tex", v: formulaBodyTex(body), src: body });
    if (remark) out.push({ t: "text", v: " " }, ...proseParts(remark));
  });
  return out;
}
