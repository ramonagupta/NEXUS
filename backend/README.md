# NEXUS Backend

Node.js + Express + MongoDB, with a **C++ engine** that does all the dispatching.

- **Express (Node)** handles HTTP, checks input and saves records.
- **The C++ engine** (`engine/nexus_engine.cpp`) holds the logic: the city graph, the traffic-aware
  Dijkstra, the priority queue, matching each emergency to the nearest suitable unit, the waiting
  queue and the three control units (medical, fire, police). Node starts it once and keeps it running.
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
tests/        flow.test.js (dispatch) and auth.test.js (sign in): in-memory database (npm test)
utils/        cppEngine.js: starts the C++ program and talks to it (no logic)
              emergencyService.js: saves what the engine decided, builds the JSON the frontend reads
              trafficService.js: saves traffic, re-routes units when it changes
              arrivalWatcher.js: marks a report ON SCENE when its unit arrives
              cityMap.js: the road curves for GET /api/city/map
              facilitySync.js: loads saved hospitals / resources / control units and sets up traffic at startup
              resourceSummary.js, events.js, validators.js
              phone.js, jwt.js, smsService.js, rateLimit.js, prankWarning.js: sign-in (see "Sign in")
middleware/   auth.js: requireAuth / optionalAuth (checks the JWT)
models/       Emergency, Hospital, Resource, ControlUnit, Traffic, User, OtpRequest
controllers/  emergency, traffic, resource, hospital, controlUnit, city, auth
routes/       one file per controller
config/       MongoDB connection
server.js     entry point
```

## How dispatch works

**What a report needs** (calculated in C++, same rules as the frontend):

| type | units sent | how many |
|---|---|---|
| `medical` | ambulances from the hospitals | 1 per 3 people (rounded up) |
| `police`, `other` | police unit | 1 |
| `fire` | fire engine | 1 |

**Priority score** = `people*5 + medical*3 + fire*2 + police*2`, where *medical* is 1 for medical,
*fire* is 1 for fire, *police* is 1 for police.
**Severity** (1 to 3): fire and medical start at 3, police at 2, other at 1; 10 or more
people is always 3.

**Registering a report dispatches it straight away if units are free.** The engine starts with the
station of the right type that has the fastest route under the current traffic, and takes what it can
from it. **If that station can't give everything the report needs, the rest comes from the second
nearest, then the third, and so on** (nearest = fastest route under the current traffic).

- **Ambulances:** a hospital sends ambulances for the people it has free beds for (1 bed per person, up to
  3 people per ambulance), so a hospital's ambulances and beds always go together. Example: 20 people need
  7 ambulances and 20 beds, and the biggest hospital has 16 beds: it sends what it has and the next nearest
  hospital takes the other 4 people. If beds are spread thinly, one ambulance more than the usual
  `ceil(people / 3)` can be needed (`unitsSent` says how many went).
- **Fire engines and police units:** a report needs 1 unit today, so one station is enough. The same
  splitting is built in and starts working as soon as a report needs more units than one station has.
- It is all or nothing: if the stations together can't cover the whole report right now, nothing is
  taken and it waits in the queue (nobody holds units they can't use).
- Every report returns one `units` row per station used, nearest first, each with its `unitsRequired`
  (vehicles it sends), `beds`, route and ETA. The single-unit fields (`routePath`, `totalSeconds` ...) follow
  the nearest one. A report is ON SCENE when the last of its units has arrived.

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

### The three control units

There is one control unit for each kind of emergency (`CentralControl` in C++). Each one controls **all**
the stations of its kind and sends **every dispatch** of its kind:

| unit | kind | controls | default place |
|---|---|---|---|
| Central Medical Control | `medical` | the ambulances and beds of all the hospitals | `clock` |
| Central Fire Control | `fire` | the fire engines of all the fire stations | `dalanwala` |
| Central Police Control | `police` | the police units of all the police stations | `karanpur` |

Switch one offline and none of **its** vehicles is sent: those reports wait in the queue while the other
two units carry on. Switch it online and the waiting ones go out, highest priority first. Every unit
sent carries `dispatchedBy` (the name of the control unit).

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
  "address": "Opposite Clock Tower", "peopleCount": 7, "confirmedReal": true,
  "additionalServices": [ { "type": "medical", "peopleCount": 4 }, { "type": "police" } ] }
```
**Additional help** (the form's second step): a `fire` report can also ask for `medical` and `police`, a
`medical` one for `fire` and `police`, a `police` one for `medical` and `fire`. `medical` carries the number
of people who need an ambulance (4 people = 2 ambulances and 4 beds, even if 7 are affected); `fire` and
`police` are one unit each. **Every kind of help is sent by its own control unit**: ambulances by Central
Medical Control, fire engines by Central Fire Control, police by Central Police Control. If one unit is
offline only its help waits (the report is `partial`) and the rest goes out. The priority score counts
every service needed. Help of the same kind as the report itself is ignored. Each row of `units` is one
station that sent vehicles (`unitsRequired` = how many it sends, `dispatchedBy` = the control unit), and
`controlUnits` lists the units involved.
`type`: `fire`, `police`, `medical`, `other` (the form offers the first three). `peopleCount`: a number from 1 to 100000
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
| `units` | one row per station that sent vehicles (several when the nearest ran short) or one per service that waits: `service`, `state` (`waiting` / `assigned` / `unavailable`), `unitsRequired`, `beds`, `provider`, `providerArea`, `dispatchedBy`, route, distance, times |

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
| GET | /api/control-unit/all | the three units: `{ medical, fire, police }` |
| GET | /api/control-unit/:kind | one unit (`medical`, `fire` or `police`): the fleet it controls, its dispatch numbers |
| PUT | /api/control-unit/:kind | change `name`, `location`, or `status` (`online` / `offline`) |
| GET | /api/control-unit/:kind/dispatches | its dispatch register (`?active=true` for open ones); `stations` lists every station that sent units |

`/api/control-unit` with no kind is still the medical unit (`GET`, `PUT`, `/dispatches`).

**Hospitals** (`/api/hospitals`) and **resources** (`/api/resources`, police and fire stations) have
create / read / update / delete, with the station's `name` as the id. Hospital body:
`{ "name": "City Care", "location": "clock", "totalBeds": 10, "totalAmbulances": 4 }`.
**Beds:** every hospital shows `totalBeds`, `availableBeds` and `occupiedBeds`, and
`GET /api/hospitals/beds` gives them for all hospitals with the totals. `GET /api/resources` also carries
`beds: { available, total }`. A bed is taken when a report is dispatched (1 per person, at the hospital that
sends the ambulances) and is free again when the report is resolved. Resource body:
`{ "name": "Metro Fire", "type": "fire", "location": "clock", "capacity": 2 }`. Capacity can't be reduced
below what is in use (409). A resource's `status` is `available`, `busy` (all units out) or
`unavailable` (switched off; you can set `available` or `unavailable`).
`GET /api/resources` returns the three totals plus `hospitals` and `stations` (`?type=fire&status=busy`).

Built in: 8 hospitals `h1`-`h8` (h1, h2: 8 ambulances / 16 beds; h3, h4: 3 / 8; h5-h8: 5 / 12), 5 police
stations `p1`-`p5` (2 units each) and 3 fire stations `f1`-`f3` (3 engines each), at the map nodes of the
same name: 42 ambulances, 10 police units, 9 fire engines.

## Sign in (phone number + OTP, JWT)

This is what the frontend's sign-up / log-in screen calls. Set `JWT_SECRET` (32+ characters) in `.env`; see
`.env.example` for the SMS provider (`console` prints the code in the server log, `twilio` sends a real SMS).
With `DEV_RETURN_OTP=true` the code is also returned, and the screen shows "Demo mode: your code is ...".

| Method | Endpoint | |
|---|---|---|
| POST | /api/auth/send-otp | `{ "phone": "+919876543210", "mode": "signup" or "login" }` sends a 6-digit code by SMS |
| POST | /api/auth/verify-otp | `{ phone, otp, mode, name }` (name for sign up) gives `{ token, tokenType, expiresInSeconds, user, warning }` |
| GET | /api/auth/me | the signed-in user itself: `{ id, name, phone, ... }` (header `Authorization: Bearer <token>`) |
| POST | /api/auth/logout | ends every sign-in of this user |
| GET | /api/auth/warning | the prank warning text |

- **Sign up** needs a name and a number with no account (`409 ALREADY_REGISTERED` otherwise). **Log in** needs a
  number that has one (`404 NOT_REGISTERED`). This is checked before the SMS is sent.
- **Every `/api` route except `/api/auth` needs the token** (`401` without it; the frontend then goes back to the
  login screen). `AUTH_REQUIRED=false` in `.env` switches that off for `curl` and `scripts/demo.mjs`.
- **The prank warning** is accepted on the screen (a tick-box when signing up, a notice after every log in). The
  server saves when (`warningAcceptedAt`), blocks numbers marked `blocked: true` on their `User` (no code, tokens
  stop working), asks for `confirmedReal: true` on every report made by a signed-in person, and stores the
  person's phone number and name with the report. Other people only ever see the number masked
  (`+91••••••3210`).
- **Protections:** the code is made with `crypto.randomInt` and only its HMAC is saved; it works for 5 minutes,
  once, and 5 tries; one new code per phone every 30 seconds and 5 an hour; a wrong or expired code gets the same
  answer; the sign-in routes also have a per-IP limit; the JWT (HS256, 7 days) holds only the user id and a
  version number that `logout` raises. Numbers are saved as `+919876543210`.
- **Not built:** the frontend's optional Firebase mode (`VITE_AUTH_PROVIDER=firebase`, `POST /api/auth/session`).
  The default mode (`backend`) is what is implemented.

## What is saved and what resets

Saved in MongoDB: reports, hospitals, resources, the three control units, the traffic, users and pending OTPs. At startup the engine
is loaded from them, so changes survive a restart. Live state lives in the C++ process: which units
are busy and the waiting queue. After a restart, reports that were still `pending` or `partial` go
back into the queue (oldest first) and are dispatched again; reports already `assigned` keep their
record but the engine no longer counts their units as busy. Records left by an older version of the
map (unknown node ids) are cleaned up at startup.

## Limits

- A report is `unassigned` straight away if all the hospitals together could never take it (more people
  than the 96 beds of the 8 built-in hospitals).
- A unit's route is worked out when it is dispatched and again whenever the traffic changes
  (same station, new fastest route); a waiting report gets its station and route when a unit is free.
- Traffic is last-write-wins: two screens editing it at once overwrite each other.

## Tests and demos

```
npm test                      # 19 tests: dispatch (sharing one report between hospitals, the three control units, additional help), traffic, re-routing, arrival, sign up / log in (no MongoDB needed)
node scripts/demo.mjs         # the same two situations against the running server, step by step
```
See [../DEMO.md](../DEMO.md).
