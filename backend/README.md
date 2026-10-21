# NEXUS Backend

Node.js + Express + MongoDB, with a **C++ engine** that does all the dispatching.

- **Express (Node)** handles HTTP, checks input and saves records.
- **The C++ engine** (`engine/nexus_engine.cpp`) holds the logic: the city graph, the traffic-aware
  Dijkstra, the priority queue, matching each emergency to the nearest suitable unit, the waiting
  queue and the Central Medical Control unit. Node starts it once and keeps it running.
- **MongoDB** stores the records: emergencies, hospitals, resources, the control unit and the traffic.

The backend decides **everything**; the frontend only draws it. That includes the map, the traffic
(generated here at startup), every route and ETA, the queue, re-routing when traffic changes and
the moment a unit arrives (a server timer marks the report ON SCENE).

```
frontend --/api--> Express controller --> utils/cppEngine.js --> C++ engine
                          |                                         |
                       MongoDB                       the map, traffic, priority queue,
                                                     unit availability (in memory)
```

## Setup

You need Node.js, MongoDB and a C++ compiler (`g++`, C++17).

```
cd backend
npm install
cp .env.example .env        # set MONGO_URI (PORT defaults to 5000)
npm run dev                 # builds the C++ engine, then starts the server
```

`npm start` / `npm run dev` compile the engine first (`npm run build:engine`). On Windows use
MinGW-w64 `g++`. To use a binary from somewhere else set `ENGINE_PATH` in `.env`.

## The map

The map lives in the backend, in `data/cityMap.mjs`: 48 nodes (32 Dehradun localities and 16 stations),
84 roads with their lengths, capacities and the curve each one is drawn with, plus the rivers, area
names and station styles. Two things are made from it:

- `engine/city_data.h`, which the C++ engine routes on (generated, don't edit by hand);
- `GET /api/city/map`, which the frontend draws.

If you change the map:

```
npm run generate:city       # rewrites engine/city_data.h from data/cityMap.mjs
npm run build:engine
```

Travel time is 40 km/h on a free road with the traffic slowdown below; priority and severity are
described under "How dispatch works".

## Traffic (generated and decided by the backend)

Traffic is how many vehicles are on each road. A road's **ratio** is vehicles / capacity:

| level | ratio | slowdown |
|---|---|---|
| free | under 90% | x1 |
| full (at capacity) | 90 to 100% | x1.8 |
| light / medium / heavy (over capacity) | up to 115% / 135% / beyond | from x2 up to x8, growing with the margin |

- **Start-up:** the backend initialises the traffic (`TRAFFIC_ON_START` in `.env`): `saved` (default) reloads
  what is in MongoDB and generates random traffic the first time, `random` always generates new traffic,
  `none` starts empty. The C++ engine generates it: about 72% of the roads free, 10% at capacity, 18% over capacity.
- **Every change** (a road set, random, clear, `PUT`) is saved in MongoDB and every unit still on its way is
  **re-routed** with the new traffic. A unit keeps its progress (half way stays half way); one that has arrived is left alone.

| Method | Endpoint | |
|---|---|---|
| GET | /api/traffic | every road: `load`, `capacity`, `ratio`, `level`, `levelLabel`, `color`, `speedFactor`; plus `levels`, `maxRatio`, `overCapacity` |
| PATCH | /api/traffic/roads/:id | `{ "level": "heavy" }` (free, full, light, medium, heavy) or `{ "level": "custom", "ratio": 1.2 }` |
| POST | /api/traffic/randomize | new random traffic for the whole city (optional `{ "seed": 7 }` to repeat it) |
| POST | /api/traffic/clear | no traffic anywhere |
| PUT | /api/traffic | replace it all: `{ "<road id>": vehicles }` |

Each of these answers with the new traffic and `reroutedEmergencies` (how many reports got a new route).

## Folder structure

```
data/         cityMap.mjs: the map (source of truth)
engine/       nexus_engine.cpp: all the logic.  city_data.h: the map (generated)
scripts/      generate-city-data.mjs, demo.mjs (the two dispatch demos against a running server)
tests/        flow.test.js: runs the real engine and controllers with an in-memory database (npm test)
utils/        cppEngine.js: starts the C++ program and talks to it (no logic)
              emergencyService.js: saves what the engine decided, builds the JSON the frontend reads
              trafficService.js: saves traffic, re-routes units when it changes
              arrivalWatcher.js: marks a report ON SCENE when its unit arrives
              cityMap.js: the road curves for GET /api/city/map
              facilitySync.js: loads saved hospitals / resources / control unit and sets up traffic at startup
              resourceSummary.js, events.js, validators.js
models/       Emergency, Hospital, Resource, ControlUnit, Traffic
controllers/  emergency, traffic, resource, hospital, controlUnit, city
routes/       one file per controller
config/       MongoDB connection
server.js     entry point
```

## How dispatch works

**What a report needs** (calculated in C++, same rules as the frontend):

| type | units sent | how many |
|---|---|---|
| `medical`, `accident` | ambulances from a hospital | 1 per 3 people (rounded up) |
| `police`, `other` | police unit | 1 |
| `fire` | fire engine | 1 |

**Priority score** = `people*5 + medical*3 + fire*2 + police*2`, where *medical* is 1 for medical and
accident, *fire* is 1 for fire, *police* is 1 for police and accident.
**Severity** (1 to 3): fire and medical start at 3, accident and police at 2, other at 1; 10 or more
people is always 3.

**Registering a report dispatches it straight away if a unit is free.** The engine picks the
station of the right type with the fastest route under the current traffic. A hospital must have
enough free ambulances and beds (1 bed per person) for the whole report.

**If no unit is free the report waits in the priority queue.** Whenever something changes (a new
report, a resolved one, a hospital or resource added or edited, the control unit switched on) the
engine goes through the waiting reports from the highest score to the lowest and gives free units
out in that order.

- A waiting report blocks lower-priority reports that need the same kind of unit, so nobody jumps
  ahead of it. Other kinds of unit are not blocked.
- Equal scores: the older report goes first.
- Units already sent are never taken back.
- A report that could never be served (for example 25 people, when no hospital has that many beds)
  is `unassigned` straight away instead of waiting forever.

**Resolving a report** (`DELETE /api/emergencies/:id`) returns its units to their station and the
freed units go to the top of the waiting queue. Dispatching does not change the traffic: the traffic
is whatever the map sets.

### Central Medical Control unit

One control unit (`CentralMedicalControl` in C++) controls the ambulances and beds of **all** the
hospitals and sends **every ambulance dispatch** (medical and accident reports). It sits at a map
node (default: `clock`, Clock Tower). Switch it offline and no ambulance is sent: those reports
wait in the queue while police and fire carry on. Switch it online and the waiting ones go out,
highest priority first. Every ambulance carries `dispatchedBy`.

### Status

| `status` | meaning |
|---|---|
| `pending` | nothing sent yet, waiting for units |
| `partial` | some units sent, the rest still waiting or not possible |
| `assigned` | everything required has been sent |
| `unassigned` | nothing could be sent |
| `ON SCENE` | the unit has arrived (stored as `in-progress`; both names are accepted) |
| `resolved` | over |

## API

### What the frontend uses
| Method | Endpoint | |
|---|---|---|
| GET | /api/emergencies | open reports (everything not resolved) |
| POST | /api/emergencies | register a report and dispatch it |
| PATCH | /api/emergencies/:id | `{ "status": "ON SCENE" }` when the unit arrives |
| DELETE | /api/emergencies/:id | mark resolved |
| GET | /api/traffic | traffic of every road, with level and colour (see Traffic above) |
| GET | /api/city/map | everything to draw: nodes, roads with curves, rivers, areas, station styles |
| GET | /api/resources | `{ medical, fire, police }`, each `{ available, total }` (plus lists, below) |

| POST | /api/emergencies/reset | resolve every open report (all units come back, the queue empties); for starting a demo clean |

**POST /api/emergencies** body (what the frontend sends):
```json
{ "title": "Shop fire", "type": "fire", "locationNode": "clock",
  "address": "Opposite Clock Tower", "peopleCount": 7, "lat": 30.3165, "lng": 78.0322 }
```
`type`: `fire`, `police`, `medical`, `accident`, `other`. `peopleCount`: a number from 1 to 100000
(a fraction is rounded down). `lat` / `lng` are worked out from the node if left out.
`severityLevel`, `priorityScore`, `unitsNeeded` and `dispatchedAt` may be sent but are ignored:
the engine works them out, and the server records the real dispatch time. The older field names
`description`, `injuredPeople`, `location` and `reportedBy` also work.

Each report comes back with:

| field | meaning |
|---|---|
| `id`, `title`, `type`, `address`, `peopleCount`, `lat`, `lng` | as sent |
| `displayStatus` | what the tracker shows: `WAITING`, `DISPATCH`, `ARRIVING`, `ON SCENE`, `UNASSIGNED` |
| `locationNode`, `locationName` | node id and its name, e.g. `clock`, `Clock Tower` |
| `severityLevel`, `priorityScore`, `unitsNeeded` | calculated by the engine |
| `status`, `displayStatus`, `queuePosition` | `queuePosition` is null unless the report is waiting |
| `dispatchedAt` | when the first unit was sent (the countdown starts here, so a refresh doesn't restart it) |
| `unitName`, `dispatchNode`, `routePath`, `totalDistanceKm`, `baseTimeSeconds`, `trafficDelaySeconds`, `totalSeconds`, `jammedSegmentCount`, `isOnSite`, `elapsedSeconds` | the main unit for this type (what the tracker shows); null until one is sent |
| `units` | every unit: `service`, `state` (`waiting` / `assigned` / `unavailable`), `provider`, `dispatchedBy`, route, distance, times |

`DELETE` and `PATCH ... resolved` return `{ emergency, dispatchedFromQueue }`; `dispatchedFromQueue`
lists the waiting reports that got the freed units. `PATCH ... ON SCENE` only works once a unit
has been sent (409 otherwise). Resolving twice, or an unknown id, is harmless.

`GET /api/emergencies` also takes `?status=all|pending|partial|assigned|unassigned|ON SCENE|resolved`
and `?sort=priority` (default) `|status|newest`.

### Other endpoints
| Method | Endpoint | |
|---|---|---|
| GET | /api/emergencies/queue | reports still waiting, in priority order (position 1 gets the next free unit) |
| GET | /api/emergencies/:id | one report |
| POST | /api/emergencies/dispatch | run the waiting queue again (normally automatic) |
| GET | /api/events | live updates (Server-Sent Events): `emergency`, `queue`, `resources`, `control-unit` |
| GET | /api/city/map | nodes (`id`, `name`, `x`, `y`, `kind`, `stationType`) and roads with live traffic |
| GET | /api/city/traffic | traffic per road: load, capacity, ratio, level, speed factor |
| GET | /api/city/fastest-route?start=h4&end=clock | route with distance and times under the current traffic |

**Control unit**
| Method | Endpoint | |
|---|---|---|
| GET | /api/control-unit | the unit, the fleet it controls, its dispatch numbers |
| PUT | /api/control-unit | change `name`, `location`, or `status` (`online` / `offline`) |
| GET | /api/control-unit/dispatches | its dispatch register (`?active=true` for open ones) |

**Hospitals** (`/api/hospitals`) and **resources** (`/api/resources`, police and fire stations) have
create / read / update / delete, with the station's `name` as the id. Hospital body:
`{ "name": "City Care", "location": "clock", "totalBeds": 10, "totalAmbulances": 4 }`. Resource body:
`{ "name": "Metro Fire", "type": "fire", "location": "clock", "capacity": 2 }`. Capacity can't be reduced
below what is in use (409). A resource's `status` is `available`, `busy` (all units out) or
`unavailable` (switched off; you can set `available` or `unavailable`).
`GET /api/resources` returns the three totals plus `hospitals` and `stations` (`?type=fire&status=busy`).

Built in: 8 hospitals `h1`-`h8` (h1, h2: 8 ambulances / 16 beds; h3, h4: 3 / 8; h5-h8: 5 / 12), 5 police
stations `p1`-`p5` (2 units each) and 3 fire stations `f1`-`f3` (3 engines each), at the map nodes of the
same name: 42 ambulances, 10 police units, 9 fire engines.

## What is saved and what resets

Saved in MongoDB: reports, hospitals, resources, the control unit, the traffic. At startup the engine
is loaded from them, so changes survive a restart. Live state lives in the C++ process: which units
are busy and the waiting queue. After a restart, reports that were still `pending` or `partial` go
back into the queue (oldest first) and are dispatched again; reports already `assigned` keep their
record but the engine no longer counts their units as busy. Records left by an older version of the
map (unknown node ids) are cleaned up at startup.

## Limits

- A report must be served by **one hospital** (enough ambulances and beds for everyone). More than
  16 people (the biggest hospitals have 16 beds) is therefore `unassigned`.
- A unit's route is worked out when it is dispatched and again whenever the traffic changes
  (same station, new fastest route); a waiting report gets its station and route when a unit is free.
- Traffic is last-write-wins: two screens editing it at once overwrite each other.

## Tests and demos

```
npm test                      # 7 tests: both dispatch situations, traffic, re-routing, arrival (no MongoDB needed)
node scripts/demo.mjs         # the same two situations against the running server, step by step
```
See [../DEMO.md](../DEMO.md).
