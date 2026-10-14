// Independent judging panel. Each judge is a different model with its own rubric,
// sees only the captured evidence, and never sees the other judges' scores.
// Usage: node --env-file=/vercel/share/.env.project scripts/judge.mjs <round-name>
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const round = process.argv[2] ?? 'round-1';
const DIR = path.resolve('design/judging', round);
const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const API_KEY = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;

const BRIEF = `You are judging "Sunny Circuit", a seated go-kart time-trial game built for WebXR with
the Immersive Web SDK (Three.js). In VR the player sits in the kart and grabs a physical steering
wheel (triggers = gas/brake). On desktop the same cockpit view is shown and the player drives with
WASD / arrow keys, R restarts, and C toggles a chase camera. A race is 3 laps; after the first lap a
translucent ghost replays the best lap. Traffic cones can be knocked over. The intended art direction
is a bright, sunny, stylized low-poly look (think toy-like, readable, cheerful).

Evidence: numbered screenshots captured from a headless desktop browser at 1280x720 using a software
renderer (SwiftShader: no anti-aliasing, no GPU). Do not penalize aliasing or renderer limitations;
judge the design. Screenshot names describe the camera and moment. Telemetry is from an automated
driver completing the race, so lap times reflect a competent but not optimal driver.`;

const SCALE = `Scoring is strict and calibrated, integers 1-10:
10 = exceptional, award-worthy polish for this genre and scope.
9 = polished and delightful; you would happily feature it as a showcase WebXR indie title; only nitpicks remain.
7-8 = solid and pleasant but with clearly noticeable flaws.
5-6 = functional but plain, rough, or with significant issues.
1-4 = broken or unpleasant.
Do not inflate. A 9 requires that no medium or high severity issues remain in your area.`;

const JUDGES = [
  {
    id: 'vehicle-art',
    model: 'anthropic/claude-opus-4.8',
    title: 'Vehicle Art Director',
    focus: `Judge ONLY the karts (player kart and ghost kart): silhouette and proportions, how much it reads as a
go-kart at a glance, detail level appropriate for stylized low-poly, color/material choices, wheels and
tires, driver seat/cockpit, steering wheel, bumpers/nose/sidepods, how attractive it looks in the orbit
and chase shots, and how the cockpit interior looks from the driver's seat. Ignore environment and HUD.`,
  },
  {
    id: 'environment-art',
    model: 'google/gemini-3.1-pro-preview',
    title: 'Environment & Visual Cohesion Artist',
    focus: `Judge ONLY the world: track surface readability, curbs and barriers, scenery (trees, props, landmarks),
composition, horizon and sky, color palette cohesion with the sunny low-poly direction, lighting and
shadows, sense of place, and sense of speed. Ignore the kart model and the HUD text content.`,
  },
  {
    id: 'ux-hud',
    model: 'openai/gpt-5.5',
    title: 'UX & HUD Usability Lead',
    focus: `Judge ONLY usability: dashboard/HUD legibility, layout, clipping, contrast, information hierarchy,
the instructions panel, discoverability of controls, how clearly the start flow (idle -> countdown ->
racing) and finish state are communicated, whether UI obstructs the view of the road, and whether the
layout would be comfortable for seated VR. Ignore art style beyond its effect on readability.`,
  },
  {
    id: 'gameplay',
    model: 'anthropic/claude-sonnet-4.6',
    title: 'Gameplay & Game Feel Designer',
    focus: `Judge ONLY gameplay and game feel, inferred from the sequential screenshots and the telemetry: sense
of speed, track layout variety (straights, corners, flow), challenge and readability of the racing line,
race loop completeness (start, laps, finish, restart), ghost/time-trial motivation, camera options,
feedback for impacts and off-track, and replay appeal. Ignore static art quality unless it affects play.`,
  },
];

async function loadEvidence() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.png')).sort();
  const images = await Promise.all(
    files.map(async (f) => ({ name: f, data: (await readFile(path.join(DIR, f))).toString('base64') })),
  );
  const summary = {};
  try {
    summary.browserRun = JSON.parse(await readFile(path.join(DIR, 'telemetry.json'), 'utf8')).summary;
  } catch {}
  try {
    const sim = JSON.parse(await readFile(path.join(DIR, 'sim.json'), 'utf8'));
    summary.headlessSimSuite = sim.rows.map(({ scenario, result: { trace, ...r }, failures }) => ({ scenario, ...r, failures }));
  } catch {}
  return { images, summary };
}

function buildMessages(judge, evidence) {
  const content = [
    {
      type: 'text',
      text: `${BRIEF}\n\nYour role: ${judge.title}.\n${judge.focus}\n\n${SCALE}\n\nTelemetry summary:\n${JSON.stringify(evidence.summary, null, 2)}\n\nScreenshots follow, each preceded by its file name.`,
    },
  ];
  for (const img of evidence.images) {
    content.push({ type: 'text', text: img.name });
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img.data}` } });
  }
  content.push({
    type: 'text',
    text: `Respond with ONLY a JSON object, no markdown fences:
{"score": <integer 1-10>, "verdict": "<one sentence>", "strengths": ["..."],
 "issues": [{"severity": "high|medium|low", "problem": "<specific, cite screenshot>", "fix": "<concrete, implementable change>"}]}
List the issues that must be fixed to reach 9, most important first.`,
  });
  return [{ role: 'user', content }];
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return JSON.parse(text.slice(start, end + 1));
}

async function runJudge(judge, evidence) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: judge.model, messages: buildMessages(judge, evidence), max_tokens: 4000 }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
      const body = await res.json();
      const text = body.choices?.[0]?.message?.content ?? '';
      return { ...judge, focus: undefined, ...parseJson(text) };
    } catch (err) {
      if (attempt === 3) return { ...judge, focus: undefined, score: null, error: String(err.message ?? err) };
    }
  }
}

if (!API_KEY) throw new Error('AI Gateway credentials missing; run with --env-file=/vercel/share/.env.project');
const evidence = await loadEvidence();
const results = await Promise.all(JUDGES.map((j) => runJudge(j, evidence)));
await writeFile(path.join(DIR, 'judgments.json'), JSON.stringify(results, null, 2));

const lines = [`# Judging ${round}`, ''];
for (const r of results) {
  lines.push(`## ${r.title} (${r.model}): ${r.score ?? 'ERROR'}/10`, '', r.verdict ?? r.error ?? '', '');
  for (const i of r.issues ?? []) lines.push(`- [${i.severity}] ${i.problem}\n  - Fix: ${i.fix}`);
  lines.push('');
}
await writeFile(path.join(DIR, 'judgments.md'), lines.join('\n'));
for (const r of results) console.log(`${r.id.padEnd(16)} ${r.model.padEnd(32)} ${r.score ?? 'ERR'}  ${r.verdict ?? r.error}`);
