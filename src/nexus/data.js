
export const STATIONS = {
  police: { label: 'Police Station', hex: '#46637F' },
  fire: { label: 'Fire Station', hex: '#A83232' },
  hospital: { label: 'Medical Hub', hex: '#237A74' },
};

export const SAFETY_ADVISORIES = {
  fire: 'Stay low to avoid smoke inhalation, do not use elevators, and evacuate the building if safe to do so.',
  accident: 'Remain clear of active vehicle lanes, turn on hazard lights, and avoid moving injured persons unless immediate threat exists.',
  medical: 'Keep the patient calm and comfortable, keep airways clear, and clear a physical path for responding paramedics.',
  other: 'Move to a secure nearby area, remain visible to incoming responders, and keep phone lines open for dispatch contact.',
};


export const TYPE_BASE_SEVERITY = { fire: 3, medical: 3, accident: 2, other: 1 };

export const TYPE_PRIORITY_WEIGHT = { fire: 5, accident: 4, medical: 4, other: 2 };

export const NODES = [
  { id: 'n1', x: 70, y: 60, name: 'Rajpath Sector 1', stationType: 'police' },
  { id: 'n2', x: 210, y: 60, name: 'Connaught Place', stationType: 'fire' },
  { id: 'n3', x: 360, y: 60, name: 'Karol Bagh Plaza', stationType: 'hospital' },
  { id: 'n4', x: 500, y: 60, name: 'Lajpat Nagar', stationType: 'police' },
  { id: 'n5', x: 70, y: 175, name: 'Chandni Station', stationType: 'hospital' },
  { id: 'n6', x: 210, y: 175, name: 'Indiranagar Hub', stationType: 'fire' },
  { id: 'n7', x: 360, y: 175, name: 'Koramangala Station', stationType: 'fire' },
  { id: 'n8', x: 500, y: 175, name: 'Saket City Center', stationType: 'hospital' },
  { id: 'n9', x: 70, y: 290, name: 'Salt Lake Sec 5', stationType: 'police' },
  { id: 'n10', x: 210, y: 290, name: 'Hazratganj Station', stationType: 'police' },
  { id: 'n11', x: 360, y: 290, name: 'Vasant Kunj Circle', stationType: 'hospital' },
  { id: 'n12', x: 500, y: 290, name: 'Civil Lines Road', stationType: 'fire' },
  { id: 'n13', x: 70, y: 390, name: 'Malviya Nagar', stationType: 'hospital' },
  { id: 'n14', x: 210, y: 390, name: 'Green Park Ext', stationType: 'police' },
  { id: 'n15', x: 360, y: 390, name: 'Model Town Square', stationType: 'fire' },
  { id: 'n16', x: 500, y: 390, name: 'Dwarka Sec-21', stationType: 'police' },
];

export const NODE_MAP = Object.fromEntries(NODES.map((n) => [n.id, n]));


export const RAW_EDGES = [
  { id: 'e1', u: 'n1', v: 'n2', capacity: 100 }, { id: 'e2', u: 'n2', v: 'n3', capacity: 120 }, { id: 'e3', u: 'n3', v: 'n4', capacity: 90 },
  { id: 'e4', u: 'n5', v: 'n6', capacity: 80 }, { id: 'e5', u: 'n6', v: 'n7', capacity: 60 }, { id: 'e6', u: 'n7', v: 'n8', capacity: 110 },
  { id: 'e7', u: 'n9', v: 'n10', capacity: 100 }, { id: 'e8', u: 'n10', v: 'n11', capacity: 85 }, { id: 'e9', u: 'n11', v: 'n12', capacity: 95 },
  { id: 'e10', u: 'n13', v: 'n14', capacity: 70 }, { id: 'e11', u: 'n14', v: 'n15', capacity: 110 }, { id: 'e12', u: 'n15', v: 'n16', capacity: 100 },
  { id: 'e13', u: 'n1', v: 'n5', capacity: 90 }, { id: 'e14', u: 'n5', v: 'n9', capacity: 80 }, { id: 'e15', u: 'n9', v: 'n13', capacity: 75 },
  { id: 'e16', u: 'n2', v: 'n6', capacity: 100 }, { id: 'e17', u: 'n6', v: 'n10', capacity: 60 }, { id: 'e18', u: 'n10', v: 'n14', capacity: 90 },
  { id: 'e19', u: 'n3', v: 'n7', capacity: 110 }, { id: 'e20', u: 'n7', v: 'n11', capacity: 100 }, { id: 'e21', u: 'n11', v: 'n15', capacity: 80 },
  { id: 'e22', u: 'n4', v: 'n8', capacity: 95 }, { id: 'e23', u: 'n8', v: 'n12', capacity: 85 }, { id: 'e24', u: 'n12', v: 'n16', capacity: 105 },
  { id: 'e25', u: 'n2', v: 'n7', isShortcut: true, capacity: 50 },
  { id: 'e26', u: 'n6', v: 'n11', isShortcut: true, capacity: 50 },
  { id: 'e27', u: 'n10', v: 'n15', isShortcut: true, capacity: 50 },
];


export const GRAPH_EDGES = RAW_EDGES.map((e) => {
  const p1 = NODE_MAP[e.u];
  const p2 = NODE_MAP[e.v];
  const weight = Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y));
  return { ...e, weight };
});

export const CITY_BLOCKS = [
  { x: 85, y: 15, w: 110, h: 35 }, { x: 225, y: 15, w: 120, h: 35 }, { x: 375, y: 15, w: 110, h: 35 },
  { x: 85, y: 75, w: 110, h: 85 }, { x: 225, y: 75, w: 120, h: 85 }, { x: 375, y: 75, w: 110, h: 85 },
  { x: 85, y: 190, w: 110, h: 85 }, { x: 225, y: 190, w: 120, h: 85 }, { x: 375, y: 190, w: 110, h: 85 },
  { x: 85, y: 305, w: 110, h: 70 }, { x: 225, y: 305, w: 120, h: 70 }, { x: 375, y: 305, w: 110, h: 70 },
];

/**

 * - BASE_UNIT_SPEED: 0.18 units/sec 
 * - TRAFFIC_JAM_FACTOR: 3.5x slower on a jammed road segment
 */
export const BASE_UNIT_SPEED = 0.18;
export const TRAFFIC_JAM_FACTOR = 3.5;


export const INITIAL_RESOURCES = {
  medical: { available: 28, total: 35 },
  fire: { available: 18, total: 22 },
  police: { available: 42, total: 50 },
};

export const INITIAL_JAMMED_EDGES = ['e16', 'e25'];
