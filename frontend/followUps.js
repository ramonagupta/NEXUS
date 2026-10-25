// followUps.js
// The extra questions each report type asks. Nothing is calculated here: the backend decides the units.

export const FOLLOW_UPS = {
  fire: ['medical', 'police'],
  medical: ['fire', 'police'],
  police: ['medical', 'fire'],
};

export const SERVICE_TITLE = {
  medical: 'Medical attention needed',
  fire: 'Fire engine required on scene',
  police: 'Police required on scene',
};

export const EMPTY_ANSWERS = {
  medical: { needed: false, peopleCount: 1 },
  fire: { needed: false },
  police: { needed: false },
};

export function toAdditionalServices(type, answers) {
  return (FOLLOW_UPS[type] || [])
    .filter((svc) => answers[svc]?.needed)
    .map((svc) => (svc === 'medical' ? { type: svc, peopleCount: Number(answers.medical.peopleCount) } : { type: svc }));
}
