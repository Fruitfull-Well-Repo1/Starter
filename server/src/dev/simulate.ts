import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runPipeline } from "../pipeline/run.ts";
import type { InboundMessage } from "../types.ts";
import { audit } from "../audit/log.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(here, "../../test/fixtures/messages.json");

interface Fixture extends InboundMessage {
  _expected?: { category?: string; decision?: string };
}

function pad(s: string, n: number) {
  if (s.length > n) return s.slice(0, n - 1) + "…";
  return s + " ".repeat(n - s.length);
}

const COLOR = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function colorDecision(d: string) {
  if (d === "auto_send") return `${COLOR.green}${d}${COLOR.reset}`;
  if (d === "queue_review") return `${COLOR.yellow}${d}${COLOR.reset}`;
  if (d === "block") return `${COLOR.red}${d}${COLOR.reset}`;
  return d;
}

async function main() {
  const arg = process.argv[2];
  const path = arg ? resolve(process.cwd(), arg) : FIXTURE_PATH;
  const raw = await readFile(path, "utf8");
  const fixtures = JSON.parse(raw) as Fixture[];

  console.log(
    `\n${COLOR.cyan}Practice Better reply pipeline simulator${COLOR.reset}`,
  );
  console.log(`Fixtures: ${path}`);
  console.log(`Models: classify=${process.env.SIM_MODEL_CLASSIFY ?? "claude-haiku-4-5-20251001"}, draft=${process.env.SIM_MODEL_DRAFT ?? "claude-sonnet-4-6"}\n`);

  let categoryHits = 0;
  let decisionHits = 0;
  let categoryTotal = 0;
  let decisionTotal = 0;

  for (const fx of fixtures) {
    const result = await runPipeline(fx);
    const expCat = fx._expected?.category;
    const expDec = fx._expected?.decision;

    const catOk = expCat ? result.classification.category === expCat : null;
    const decOk = expDec ? result.policy.action === expDec : null;
    if (catOk !== null) {
      categoryTotal++;
      if (catOk) categoryHits++;
    }
    if (decOk !== null) {
      decisionTotal++;
      if (decOk) decisionHits++;
    }

    const expectedSuffix =
      expCat || expDec
        ? ` ${COLOR.dim}(expected ${expCat ?? "?"}/${expDec ?? "?"})${COLOR.reset}`
        : "";

    console.log(
      `─── ${fx.id}  ${pad(fx.clientName, 14)} ─── ${pad(result.classification.category, 18)} conf=${result.classification.confidence.toFixed(2)}  → ${colorDecision(result.policy.action)}${expectedSuffix}`,
    );
    console.log(`    inbound: ${fx.body}`);
    console.log(`    why:     ${result.policy.reason}`);
    if (result.guardrails.violations.length) {
      console.log(`    flags:   ${result.guardrails.violations.map((v) => v.rule).join(", ")}`);
    }
    console.log(`    draft:   ${result.draft.text.replace(/\n/g, "\n             ")}`);
    console.log("");

    await audit("pipeline.simulate", {
      fixture: fx.id,
      classification: result.classification,
      decision: result.policy,
      draft_preview: result.draft.text.slice(0, 200),
    });
  }

  if (categoryTotal || decisionTotal) {
    console.log(
      `${COLOR.cyan}Agreement vs fixture expectations${COLOR.reset}: category ${categoryHits}/${categoryTotal}, decision ${decisionHits}/${decisionTotal}\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
