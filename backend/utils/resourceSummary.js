// utils/resourceSummary.js
// Totals for the three resource cards (ambulances, fire engines, police units).
// Same shape the frontend uses: { medical, fire, police } -> { available, total }
// plus `beds` (the hospital beds, same shape), which the cards don't use.

const engine = require("./cppEngine");

async function buildSummary() {
  const result = await engine.getResources();

  const medical = { available: 0, total: 0 };
  const fire = { available: 0, total: 0 };
  const police = { available: 0, total: 0 };
  const beds = { available: 0, total: 0 };

  // ambulances and beds belong to hospitals
  for (const h of result.hospitals) {
    medical.available += h.availableAmbulances;
    medical.total += h.totalAmbulances;
    beds.available += h.availableBeds;
    beds.total += h.totalBeds;
  }

  // a switched-off station still counts in the total, but its units aren't available
  for (const s of result.stations) {
    const bucket = s.type === "fire" ? fire : police;
    bucket.total += s.capacity;
    if (s.status !== "unavailable") bucket.available += s.availableUnits;
  }

  return { medical, fire, police, beds };
}

module.exports = { buildSummary };
