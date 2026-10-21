// scripts/demo.mjs
// Demonstrates the two dispatch situations against a RUNNING server (npm run dev).
//
//   node scripts/demo.mjs no-queue     enough resources: dispatched at once, queue not used
//   node scripts/demo.mjs queue        not enough resources: the priority queue decides
//   node scripts/demo.mjs              both, one after the other
//
// Each run starts by resolving every open report (POST /api/emergencies/reset), so you can
// run it as often as you like. Keep the frontend open in the browser to watch it happen:
//   node scripts/demo.mjs queue --pause     waits for ENTER between steps
//
// Another address:  API=http://localhost:5000/api node scripts/demo.mjs

import readline from "readline";

const API = process.env.API || "http://localhost:5000/api";
const pause = process.argv.includes("--pause");
const which = process.argv.slice(2).find((a) => !a.startsWith("--")) || "all";

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(method + " " + path + " -> " + res.status + " " + (data && data.message));
  return data;
}

const report = (title, type, locationNode, peopleCount) =>
  api("POST", "/emergencies", { title, type, locationNode, address: title, peopleCount });

const resources = () => api("GET", "/resources");
const queue = () => api("GET", "/emergencies/queue");

let failed = 0;
function check(ok, text) {
  console.log("   " + (ok ? "PASS" : "FAIL") + "  " + text);
  if (!ok) failed++;
}

function show(e) {
  const where = e.status === "pending" ? "WAITING, queue position " + e.queuePosition : e.status + (e.unitName ? " -> " + e.unitName : "");
  console.log("   #" + e.id.slice(-4) + "  " + e.title.padEnd(22) + " score " + String(e.priorityScore).padStart(3) + "   " + where);
}

async function step(text) {
  console.log("\n>> " + text);
  if (!pause) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((r) => rl.question("   (press ENTER to do it) ", () => { rl.close(); r(); }));
}

const line = (r) =>
  "ambulances " + r.medical.available + "/" + r.medical.total +
  "   fire engines " + r.fire.available + "/" + r.fire.total +
  "   police " + r.police.available + "/" + r.police.total;

// ---------------------------------------------------------------------------
async function noQueue() {
  console.log("\n=== DEMO 1: enough resources, the priority queue is NOT in effect ===");
  await api("POST", "/emergencies/reset");
  const before = await resources();
  console.log("Free resources:  " + line(before));

  await step("Report a shop fire (3 people) at Clock Tower");
  const fire = await report("Shop fire", "fire", "clock", 3);
  show(fire);

  await step("Report a road accident (7 people) at Railway Station: needs 3 ambulances");
  const crash = await report("Road accident", "medical", "rail", 7);
  show(crash);

  await step("Report a robbery at Rajpur");
  const robbery = await report("Robbery", "police", "rajpur", 1);
  show(robbery);

  const after = await resources();
  console.log("\nFree resources:  " + line(after));
  const q = await queue();

  check([fire, crash, robbery].every((e) => e.status === "assigned"), "all three reports were dispatched immediately (status 'assigned')");
  check([fire, crash, robbery].every((e) => e.queuePosition === null), "none of them has a queue position");
  check(q.length === 0, "GET /api/emergencies/queue is empty: the priority queue was not used");
  check(crash.unitsNeeded === 3 && after.medical.available === before.medical.available - 3, "3 ambulances were taken for 7 people");
  check(fire.dispatchedAt !== null && fire.routePath.length > 0, "each report has its route, ETA and dispatch time from the backend");
}

// ---------------------------------------------------------------------------
async function priorityQueue() {
  console.log("\n=== DEMO 2: not enough resources, the priority queue IS in effect ===");
  await api("POST", "/emergencies/reset");
  const start = await resources();
  console.log("Free resources:  " + line(start));
  console.log("There are only " + start.fire.total + " fire engines. We use them all up first.");

  await step("File " + start.fire.total + " small fires, one after another (they take every engine)");
  const fillers = [];
  for (let i = 1; i <= start.fire.total; i++) fillers.push(await report("Filler fire " + i, "fire", "clock", 1));
  console.log("   " + fillers.length + " reports dispatched.   Free resources:  " + line(await resources()));

  await step("Report a LOW priority fire (1 person, score 7). No engine is free.");
  const low = await report("LOW: small fire", "fire", "rajpur", 1);
  show(low);

  await step("Report a HIGH priority fire (10 people, score 52) AFTER it. Still no engine.");
  const high = await report("HIGH: big fire", "fire", "dalanwala", 10);
  show(high);

  const q1 = await queue();
  console.log("\nThe priority queue now (position 1 gets the next free engine):");
  q1.forEach(show);
  check(low.status === "pending" && high.status === "pending", "both new reports are WAITING (no engine free)");
  check(q1[0].title === "HIGH: big fire" && q1[1].title === "LOW: small fire", "HIGH is ahead of LOW even though LOW was reported first");

  await step("Resolve one of the first fires: one engine comes back");
  const freed1 = await api("DELETE", "/emergencies/" + fillers[0].id);
  console.log("   engine given to: " + freed1.dispatchedFromQueue.map((e) => e.title).join(", "));
  check(freed1.dispatchedFromQueue.length === 1 && freed1.dispatchedFromQueue[0].title === "HIGH: big fire", "the freed engine went to the HIGH priority report");
  const lowNow = await api("GET", "/emergencies/" + low.id);
  check(lowNow.status === "pending" && lowNow.queuePosition === 1, "LOW is still waiting, now at queue position 1");

  await step("Resolve another fire: now LOW gets an engine");
  const freed2 = await api("DELETE", "/emergencies/" + fillers[1].id);
  console.log("   engine given to: " + freed2.dispatchedFromQueue.map((e) => e.title).join(", "));
  check(freed2.dispatchedFromQueue.length === 1 && freed2.dispatchedFromQueue[0].title === "LOW: small fire", "the next freed engine went to LOW");
  check((await queue()).length === 0, "the queue is empty again");
}

try {
  if (which === "no-queue" || which === "all") await noQueue();
  if (which === "queue" || which === "all") await priorityQueue();
  if (!["no-queue", "queue", "all"].includes(which)) throw new Error("Use: no-queue | queue | all");
  console.log("\n" + (failed ? failed + " check(s) FAILED" : "All checks passed") + "\n");
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error("\nCould not run the demo: " + error.message);
  console.error("Is the backend running (npm run dev in backend/) and is MongoDB up?");
  process.exit(1);
}
