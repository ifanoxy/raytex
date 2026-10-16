import assert from "node:assert/strict";
import { test } from "node:test";
import { derivative, evaluate, ExprError, parseExpr, simplify, toLatex, toPgf, tryParse } from "./mathexpr.ts";

const at = (text: string, x: number) => evaluate(parseExpr(text), x);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("functions are read as they are written on paper", () => {
  assert.equal(at("x^2 - 2x + 1", 3), 4);
  assert.equal(at("2x", 5), 10);
  assert.equal(at("x(x+1)", 2), 6);
  assert.equal(at("(x-1)(x+1)", 3), 8);
  assert.equal(at("-x^2", 3), -9);
  assert.equal(at("2^-1", 0), 0.5);
  assert.equal(at("2^3^2", 0), 512);
  assert.equal(at("1,5x", 2), 3);
  assert.equal(at("3x² − 1", 2), 11);
  assert.equal(at("|x - 1|", -2), 3);
  assert.equal(at("2|x|+1", -3), 7);
  assert.ok(close(at("√x", 9), 3));
  assert.ok(close(at("e^x", 1), Math.E));
  assert.ok(close(at("xe^x", 1), Math.E));
  assert.ok(close(at("2sin(x)", Math.PI / 2), 2));
  assert.ok(close(at("sin x cos x", 1), Math.sin(1) * Math.cos(1)));
  assert.ok(close(at("ln 2x", 1), Math.log(2)));
  assert.ok(close(at("sin(x)^2", 1), Math.sin(1) ** 2));
  assert.ok(close(at("sin^2(x)", 1), Math.sin(1) ** 2));
  assert.ok(close(at("π/2", 0), Math.PI / 2));
  assert.ok(close(at("x^(1/3)", -8), -2));
  assert.ok(Number.isNaN(at("ln(x)", -1)));
  assert.ok(Number.isNaN(at("sqrt(x)", -1)));
  assert.equal(at("1/x", 0), Number.POSITIVE_INFINITY);
});

test("what cannot be read says where", () => {
  for (const [text, why] of [
    ["", "empty"],
    ["x +", "missing"],
    ["(x + 1", "unclosed"],
    ["y + 1", "unknown"],
    ["x ? 2", "unexpected"],
  ] as const) {
    assert.throws(() => parseExpr(text), (e: unknown) => e instanceof ExprError && e.message === why, text);
  }
  assert.equal(tryParse("x +"), null);
});

test("derivatives are those of the textbook", () => {
  const slope = (text: string, x: number) => evaluate(derivative(parseExpr(text)), x);
  assert.equal(slope("x^2 - 2x + 1", 3), 4);
  assert.equal(slope("x^3", 2), 12);
  assert.ok(close(slope("sin(x)", 0), 1));
  assert.ok(close(slope("e^(2x)", 0), 2));
  assert.ok(close(slope("ln(x)", 2), 0.5));
  assert.ok(close(slope("1/x", 2), -0.25));
  assert.ok(close(slope("sqrt(x)", 4), 0.25));
  assert.ok(close(slope("x e^x", 0), 1));
  assert.ok(close(slope("2^x", 0), Math.log(2)));
  assert.ok(close(slope("x/(x+1)", 1), 0.25));
  assert.equal(toLatex(derivative(parseExpr("x^2 - 2x + 1"))), "2x - 2");
  assert.equal(toLatex(derivative(parseExpr("3x^3"))), "9x^{2}");
});

test("written for pgfplots and in LaTeX", () => {
  assert.equal(toPgf(parseExpr("x^2 - 2x + 1")), "x^2 - 2*x + 1");
  assert.equal(toPgf(parseExpr("-x^2")), "-(x^2)");
  assert.equal(toPgf(parseExpr("e^(-x)")), "exp(-x)");
  assert.equal(toPgf(parseExpr("log(x)")), "log10(x)");
  assert.equal(toPgf(parseExpr("(x-1)^2")), "(x - 1)^2");
  assert.equal(toPgf(parseExpr("x - (x + 1)")), "x - (x + 1)");
  assert.equal(toLatex(parseExpr("x^2 - 2x + 1")), "x^{2} - 2x + 1");
  assert.equal(toLatex(parseExpr("1/x")), "\\frac{1}{x}");
  assert.equal(toLatex(parseExpr("e^x")), "\\mathrm{e}^{x}");
  assert.equal(toLatex(parseExpr("2sin(x)")), "2\\sin x");
  assert.equal(toLatex(parseExpr("ln(x+1)")), "\\ln\\left(x + 1\\right)");
  assert.equal(toLatex(parseExpr("1,5x"), true), "1{,}5x");
  assert.equal(toLatex(simplify(parseExpr("0x + 1x + 0"))), "x");
});
