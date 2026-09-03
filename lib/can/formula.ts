import type { GaugeReading } from "./types";

type Token = { type: "number" | "reference" | "operator" | "function" | "left" | "right" | "comma"; value: string };
const OPERATORS: Record<string, { precedence: number; right: boolean; arity: number }> = {
  "+": { precedence: 1, right: false, arity: 2 }, "-": { precedence: 1, right: false, arity: 2 },
  "*": { precedence: 2, right: false, arity: 2 }, "/": { precedence: 2, right: false, arity: 2 }, "%": { precedence: 2, right: false, arity: 2 },
  "^": { precedence: 3, right: true, arity: 2 }, "neg": { precedence: 4, right: true, arity: 1 },
};
const FUNCTIONS: Record<string, { arity: number; run: (...args: number[]) => number }> = {
  abs: { arity: 1, run: Math.abs }, sqrt: { arity: 1, run: Math.sqrt }, round: { arity: 1, run: Math.round },
  floor: { arity: 1, run: Math.floor }, ceil: { arity: 1, run: Math.ceil }, min: { arity: 2, run: Math.min },
  max: { arity: 2, run: Math.max }, pow: { arity: 2, run: Math.pow },
  clamp: { arity: 3, run: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)) },
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const whitespace = rest.match(/^\s+/); if (whitespace) { index += whitespace[0].length; continue; }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { tokens.push({ type: "number", value: number[0] }); index += number[0].length; continue; }
    const reference = rest.match(/^\{([^{}]+)\}/);
    if (reference) { tokens.push({ type: "reference", value: reference[1].trim() }); index += reference[0].length; continue; }
    const name = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (name && FUNCTIONS[name[0]]) { tokens.push({ type: "function", value: name[0] }); index += name[0].length; continue; }
    const char = rest[0];
    if ("+-*/%^".includes(char)) tokens.push({ type: "operator", value: char });
    else if (char === "(") tokens.push({ type: "left", value: char });
    else if (char === ")") tokens.push({ type: "right", value: char });
    else if (char === ",") tokens.push({ type: "comma", value: char });
    else throw new Error(`Unexpected formula token at position ${index + 1}`);
    index += 1;
  }
  return tokens;
}

function toPostfix(tokens: Token[]): Token[] {
  const output: Token[] = [], stack: Token[] = [];
  let previous: Token | undefined;
  for (const original of tokens) {
    const token = original.type === "operator" && original.value === "-" && (!previous || ["operator", "left", "comma"].includes(previous.type))
      ? { ...original, value: "neg" } : original;
    if (token.type === "number" || token.type === "reference") output.push(token);
    else if (token.type === "function" || token.type === "left") stack.push(token);
    else if (token.type === "comma") {
      while (stack.length && stack.at(-1)?.type !== "left") output.push(stack.pop()!);
      if (!stack.length) throw new Error("Misplaced comma");
    } else if (token.type === "operator") {
      const current = OPERATORS[token.value];
      while (stack.at(-1)?.type === "operator") {
        const top = OPERATORS[stack.at(-1)!.value];
        if (top.precedence > current.precedence || top.precedence === current.precedence && !current.right) output.push(stack.pop()!); else break;
      }
      stack.push(token);
    } else if (token.type === "right") {
      while (stack.length && stack.at(-1)?.type !== "left") output.push(stack.pop()!);
      if (stack.pop()?.type !== "left") throw new Error("Unmatched parenthesis");
      if (stack.at(-1)?.type === "function") output.push(stack.pop()!);
    }
    previous = token;
  }
  while (stack.length) {
    const token = stack.pop()!;
    if (token.type === "left") throw new Error("Unmatched parenthesis");
    output.push(token);
  }
  return output;
}

export function formulaReferences(expression: string) {
  return [...new Set([...expression.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1].trim()).filter(Boolean))];
}

export function formulaRatioReferences(expression: string): [string, string] | null {
  const match = expression.match(/^\s*\{([^{}]+)\}\s*\/\s*\{([^{}]+)\}\s*$/);
  return match ? [match[1].trim(), match[2].trim()] : null;
}

export function formulaIsValid(expression: string) {
  try {
    let depth = 0;
    for (const token of toPostfix(tokenize(expression))) {
      if (token.type === "number" || token.type === "reference") depth += 1;
      else if (token.type === "operator") { const arity = OPERATORS[token.value].arity; if (depth < arity) return false; depth = depth - arity + 1; }
      else if (token.type === "function") { const arity = FUNCTIONS[token.value].arity; if (depth < arity) return false; depth = depth - arity + 1; }
    }
    return depth === 1;
  } catch { return false; }
}

export function evaluateFormula(expression: string, readings: Record<string, GaugeReading>): number | null {
  try {
    const stack: number[] = [];
    for (const token of toPostfix(tokenize(expression))) {
      if (token.type === "number") stack.push(Number(token.value));
      else if (token.type === "reference") {
        const value = readings[token.value]?.value; if (!Number.isFinite(value)) return null; stack.push(value);
      } else if (token.type === "operator") {
        const operator = OPERATORS[token.value]; if (stack.length < operator.arity) return null;
        const args = stack.splice(-operator.arity);
        const value = token.value === "+" ? args[0] + args[1] : token.value === "-" ? args[0] - args[1]
          : token.value === "*" ? args[0] * args[1] : token.value === "/" ? args[0] / args[1]
          : token.value === "%" ? args[0] % args[1] : token.value === "^" ? args[0] ** args[1] : -args[0];
        stack.push(value);
      } else if (token.type === "function") {
        const fn = FUNCTIONS[token.value]; if (stack.length < fn.arity) return null;
        stack.push(fn.run(...stack.splice(-fn.arity)));
      }
    }
    return stack.length === 1 && Number.isFinite(stack[0]) ? stack[0] : null;
  } catch { return null; }
}
