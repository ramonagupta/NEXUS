export const MAP_SIZE = { width: 900, height: 560 };

export const MAP_GEO = { refX: 450, refY: 285, refLat: 30.3165, refLng: 78.0322, latPerPx: 0.0002, lngPerPx: 0.000231 };


export const STATIONS = {
  police: { label: 'Police Station', hex: '#46637F', glyph: 'P' },
  fire: { label: 'Fire Station', hex: '#A83232', glyph: 'F' },
  hospital: { label: 'Medical Hub', hex: '#237A74', glyph: '+' },
};

const J = (id, name, x, y) => ({ id, name, x, y, kind: 'junction' });
const S = (id, stationType, name, x, y) => ({ id, name, x, y, stationType, kind: 'station' });

export const NODES = [
  J('mussoorie', 'Mussoorie Diversion', 730, 50),
  J('maldevta', 'Maldevta', 815, 150),
  J('sahastradhara', 'Sahastradhara', 815, 250),
  J('rajpur', 'Rajpur', 640, 105),
  J('mohkam', 'Mohkampur', 520, 95),
  J('vasant', 'Vasant Vihar', 330, 150),
  J('bindal', 'Bindal Pul', 185, 175),
  J('ballupur', 'Ballupur Chowk', 255, 235),
  J('premnagar', 'Prem Nagar', 130, 270),
  J('karanpur', 'Karanpur', 395, 230),
  J('kaulagarh', 'Kaulagarh', 555, 175),
  J('dalanwala', 'Dalanwala', 480, 220),
  J('clock', 'Clock Tower', 450, 285),
  J('sahast', 'Sahastradhara Xing', 640, 285),
  J('patel', 'Patel Nagar', 340, 295),
  J('majra', 'Majra', 295, 345),
  J('nathuawala', 'Nathuawala', 195, 345),
  J('rail', 'Railway Station', 400, 335),
  J('isbt', 'ISBT', 355, 375),
  J('nehru', 'Nehru Colony', 440, 360),
  J('rispana', 'Rispana Pul', 410, 410),
  J('subhash', 'Subhash Nagar', 300, 440),
  J('ajabpur', 'Ajabpur Khurd', 470, 450),
  J('arcadia', 'Arcadia Grant', 570, 395),
  J('itpark', 'IT Park', 620, 350),
  J('harrawala', 'Harrawala', 590, 490),
  J('raipurj', 'Raipur Chowk', 720, 430),
  J('haridwar', 'Haridwar Road', 215, 470),
  J('jakhan', 'Jakhan', 725, 185),
  J('chandrabani', 'Chandrabani', 150, 410),
  J('sherpur', 'Sherpur', 385, 105),
  J('mothrowala', 'Mothrowala', 650, 455),

  S('h1', 'hospital', 'Sherpur Hospital', 450, 130),
  S('h2', 'hospital', 'Maldevta Hospital', 790, 105),
  S('h3', 'hospital', 'Prem Nagar Hospital', 110, 215),
  S('h4', 'hospital', 'Sahastradhara Xing Hospital', 560, 260),
  S('h5', 'hospital', 'Majra Hospital', 300, 390),
  S('h6', 'hospital', 'IT Park Hospital', 690, 350),
  S('h7', 'hospital', 'Haridwar Road Hospital', 190, 520),
  S('h8', 'hospital', 'Harrawala Hospital', 520, 505),
  S('p1', 'police', 'Bindal Pul Thana', 200, 110),
  S('p2', 'police', 'Rajpur Thana', 600, 140),
  S('p3', 'police', 'Chandrabani Thana', 120, 380),
  S('p4', 'police', 'Arcadia Grant Thana', 510, 370),
  S('p5', 'police', 'Raipur Chowk Thana', 760, 500),
  S('f1', 'fire', 'Patel Nagar Fire Station', 330, 235),
  S('f2', 'fire', 'Jakhan Fire Station', 730, 240),
  S('f3', 'fire', 'Subhash Nagar Fire Station', 350, 500),
];

export const NODE_MAP = Object.fromEntries(NODES.map((n) => [n.id, n]));




const EDGE_DEFS = [

  ['mussoorie', 'rajpur', 0.08, 'M'],
  ['rajpur', 'kaulagarh', 0.06, 'M'],
  ['kaulagarh', 'dalanwala', 0.08, 'M'],
  ['dalanwala', 'clock', 0.05, 'M'],
  ['rajpur', 'mohkam', -0.1],
  ['mohkam', 'kaulagarh', 0.1, 's'],
  ['mohkam', 'vasant', 0.12],
  ['maldevta', 'mussoorie', 0.12],


  ['clock', 'rail', 0.08, 'M'],
  ['clock', 'nehru', -0.1],
  ['clock', 'karanpur', 0.07],
  ['karanpur', 'dalanwala', 0.1],


  ['karanpur', 'ballupur', 0.1, 'M'],
  ['karanpur', 'patel', 0.12],
  ['ballupur', 'premnagar', 0.12, 'M'],
  ['ballupur', 'bindal', 0.1],
  ['vasant', 'bindal', -0.1],
  ['premnagar', 'nathuawala', 0.12],
  ['nathuawala', 'majra', 0.1],
  ['nathuawala', 'subhash', 0.1],
  ['nathuawala', 'haridwar', 0.12, 'M'],


  ['patel', 'majra', 0.1, 's'],
  ['majra', 'isbt', 0.1],
  ['rail', 'isbt', 0.1, 'M'],
  ['rail', 'nehru', 0.12],


  ['isbt', 'rispana', 0.15],
  ['nehru', 'rispana', 0.1],
  ['isbt', 'subhash', 0.1],
  ['subhash', 'rispana', 0.1, 's'],
  ['rispana', 'ajabpur', 0.1],
  ['ajabpur', 'harrawala', 0.1],


  ['harrawala', 'arcadia', 0.1, 's'],
  ['arcadia', 'itpark', 0.1],
  ['itpark', 'sahast', 0.1],
  ['sahastradhara', 'maldevta', 0.1],
  ['raipurj', 'harrawala', 0.1],
  ['raipurj', 'sahastradhara', 0.1],


  ['jakhan', 'maldevta', 0.1],
  ['jakhan', 'sahast', 0.08],
  ['sherpur', 'vasant', 0.08],
  ['sherpur', 'mohkam', 0.08],
  ['sherpur', 'karanpur', 0.08],
  ['chandrabani', 'nathuawala', 0.08],
  ['chandrabani', 'haridwar', 0.08],
  ['chandrabani', 'subhash', 0.08],
  ['mothrowala', 'harrawala', 0.08],
  ['mothrowala', 'raipurj', 0.08],
  ['mothrowala', 'arcadia', 0.08, 's'],
  ['isbt', 'patel', 0.08, 's'],
  ['nehru', 'ajabpur', 0.08],
  ['arcadia', 'nehru', 0.08, 's'],
  ['premnagar', 'bindal', 0.08],


  ['h1', 'sherpur', 0.08],
  ['h1', 'mohkam', 0.08],
  ['h2', 'maldevta', 0.08],
  ['h2', 'mussoorie', 0.08],
  ['h3', 'premnagar', 0.08],
  ['h3', 'bindal', 0.08],
  ['h4', 'sahast', 0.08],
  ['h4', 'kaulagarh', 0.08],
  ['h5', 'majra', 0.08],
  ['h5', 'subhash', 0.08],
  ['h6', 'itpark', 0.08],
  ['h6', 'sahast', 0.08],
  ['h7', 'haridwar', 0.08],
  ['h7', 'chandrabani', 0.08],
  ['h8', 'harrawala', 0.08],
  ['h8', 'ajabpur', 0.08],
  ['p1', 'bindal', 0.08],
  ['p1', 'vasant', 0.08],
  ['p2', 'rajpur', 0.08],
  ['p2', 'kaulagarh', 0.08],
  ['p3', 'chandrabani', 0.08],
  ['p3', 'nathuawala', 0.08],
  ['p4', 'arcadia', 0.08],
  ['p4', 'nehru', 0.08],
  ['p5', 'raipurj', 0.08],
  ['p5', 'mothrowala', 0.08],
  ['f1', 'patel', 0.08],
  ['f1', 'karanpur', 0.08],
  ['f2', 'jakhan', 0.08],
  ['f2', 'sahastradhara', 0.08],
  ['f3', 'subhash', 0.08],
  ['f3', 'rispana', 0.08],
];

const SAMPLES = 16;


const CAPACITY_PER_KM = { M: 60, '': 32, s: 18 };
const MIN_CAPACITY = 20;
const KM_PER_PX = 0.0225;

function roadCapacity(kind, id, lengthPx) {
  const perKm = CAPACITY_PER_KM[kind] ?? CAPACITY_PER_KM[''];
  let h = 2166136261;
  for (let c = 0; c < id.length; c++) h = Math.imul(h ^ id.charCodeAt(c), 16777619) >>> 0;
  const variation = 0.9 + ((h % 1000) / 1000) * 0.2;
  return Math.max(MIN_CAPACITY, Math.round(perKm * lengthPx * KM_PER_PX * variation));
}

export const GRAPH_EDGES = EDGE_DEFS.map(([u, v, bend = 0.08, kind = ''], i) => {
  const a = NODE_MAP[u];
  const b = NODE_MAP[v];
  if (!a || !b) throw new Error(`Unknown node in road ${u} - ${v}`);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const curved = kind === 'M' || (kind === '' && i % 3 === 0);
  const k = curved ? bend * 0.85 : 0;
  const cx = (a.x + b.x) / 2 - dy * k;
  const cy = (a.y + b.y) / 2 + dx * k;

  const pts = [];
  for (let s = 0; s <= SAMPLES; s++) {
    const t = s / SAMPLES;
    const m = 1 - t;
    pts.push({
      x: m * m * a.x + 2 * m * t * cx + t * t * b.x,
      y: m * m * a.y + 2 * m * t * cy + t * t * b.y,
    });
  }
  let length = 0;
  for (let k = 1; k < pts.length; k++) {
    length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  }

  return {
    id: `${u}-${v}`,
    u,
    v,
    weight: Math.max(4, Math.round(length * 0.5)),
    isShortcut: kind === 's',
    isMajor: kind === 'M',
    capacity: roadCapacity(kind, `${u}-${v}`, length),
    d: `M ${a.x} ${a.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`,
    pts, 
  };
});


export const RIVERS = [
  'M 770 -10 C 690 90 600 150 545 225 C 505 275 480 335 435 385 C 395 430 330 470 290 580',
];


export const AREAS = [
  { name: 'RAJPUR ROAD', x: 600, y: 60 },
  { name: 'DALANWALA', x: 505, y: 195 },
  { name: 'CANTT', x: 420, y: 195 },
  { name: 'BALLUPUR', x: 235, y: 205 },
  { name: 'PREM NAGAR', x: 100, y: 235 },
  { name: 'PATEL NAGAR', x: 335, y: 335 },
  { name: 'NEHRU COLONY', x: 485, y: 385 },
  { name: 'CLEMENT TOWN', x: 340, y: 535 },
  { name: 'IT PARK', x: 610, y: 325 },
  { name: 'SAHASTRADHARA RD', x: 725, y: 270 },
  { name: 'RAIPUR', x: 740, y: 460 },
  { name: 'HARRAWALA', x: 600, y: 530 },
  { name: 'VASANT VIHAR', x: 320, y: 120 },
  { name: 'HARIDWAR ROAD', x: 185, y: 435 },
];