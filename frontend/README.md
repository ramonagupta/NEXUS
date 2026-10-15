## Summary: what the backend must provide

- [ ] `GET/POST/PATCH/DELETE /emergencies` working, and `POST` returns the saved record with an `id`
- [ ] Schema stores `lat`, `lng`, `dispatchedAt`, `title`, `type`, `address`, `peopleCount` (and ideally `locationNode`, `unitsNeeded`, `status`)
- [ ] `type` accepts `fire`, `police`, `medical`; `status` accepts `ON SCENE`
- [ ] `GET /traffic` (returns `{}` when empty) and `PUT /traffic` (replaces the object)
- [ ] Optional: `GET /resources`, adjusted on create and delete as in section 7
- [ ] CORS enabled, or `/api` proxied to the server

Two common pitfalls:
- `POST /emergencies` **must return the saved record with an `id`** (or `_id`). Without it the app treats the report as not saved.
- The server's `priorityScore` is **ignored** when the app reads records. The frontend recomputes the score itself.

If something is missing, the app doesn't crash. It just falls back to working locally in that browser.

---
/Users/RamonaGupta/Desktop/career skills
## 1. Setup

| Item | Value |
|---|---|
| Base URL | `/api` by default. Set `VITE_API_URL` (e.g. `http://localhost:5000/api`) to change it |
| Request timeout | 6 seconds, then the call counts as failed |
| Body format | JSON (`Content-Type: application/json`) |
| CORS | Needed if the server is on a different origin: allow `GET, POST, PUT, PATCH, DELETE` |
| Auth | None |
| Polling | Incidents and resources every **15 s**, traffic every **5 s** |

If an endpoint is missing or the server is down, the app keeps working locally. It just won't share or save anything.

---

## 2. Endpoints

| Call | When the app makes it | Body sent | What it expects back |
|---|---|---|---|
| `GET /emergencies` | On load, then every 15 s | none | An array, or `{ data: [...] }`, or `{ emergencies: [...] }` |
| `POST /emergencies` | A report is submitted | See section 3 | The saved record **with an `id` or `_id`** (may be wrapped in `data` or `emergency`) |
| `PATCH /emergencies/:id` | A unit arrives on scene | `{ "status": "ON SCENE" }` | Any 2xx |
| `DELETE /emergencies/:id` | "Mark resolved" is clicked | none | Any 2xx (a 404 is also treated as success) |
| `GET /resources` | On load, every 15 s, and after each POST and DELETE | none | See section 7 |
| `GET /traffic` | On load, then every 5 s | none | See section 8. Return `{}` when nothing is saved |
| `PUT /traffic` | Someone changes a road's traffic | The full traffic object | Any 2xx |

If `POST` returns no id, the report is treated as **not saved** (shown as local-only).

---

## 3. The incident (report)

### What the app sends on `POST /emergencies`
```json
{
  "title": "Shop fire",
  "type": "fire",
  "locationNode": "clock",
  "address": "Opposite Clock Tower, Rajpur Road",
  "peopleCount": 7,
  "severityLevel": 3,
  "priorityScore": 37,
  "unitsNeeded": 1,
  "dispatchedAt": "2026-10-12T10:30:00.000Z",
  "lat": 30.3165,
  "lng": 78.0322
}
```

### What the app reads from each record on `GET`
| Field | Needed? | Used for |
|---|---|---|
| `id` or `_id` | **Required** | Updating and deleting the record |
| `locationNode`, else `lat` + `lng`, else address text | **One required** | Placing the incident on the map (tried in that order) |
| `dispatchedAt`, else `createdAt` | Strongly recommended | Elapsed time. Without it, every refresh restarts the countdown |
| `title` (or `name` / `description`) | Recommended | Display |
| `type` (or `emergencyType` / `category`) | Recommended | Which station responds |
| `peopleCount` (or `people` / `peopleAffected`) | Recommended | Priority and units needed |
| `address` | Optional | Display |
| `severityLevel`, `unitName` | Optional | Generated if missing |
| `status` | Optional | Only `ON SCENE` and `resolved` / `closed` / `completed` / `cancelled` are used. A closed record is hidden |

Everything else (route, ETA, distance, responding station) is **computed by the frontend** and does not need to be stored.

### Schema warnings
- **Allow `type: "police"`** and `status: "ON SCENE"`. Valid types are `fire`, `police`, `medical` (old records may have `accident`, which still works and counts as medical).
- A strict schema (e.g. Mongoose) silently drops fields it doesn't define. Make sure `lat`, `lng` and `dispatchedAt` are in it.
- The server's `priorityScore` is **ignored on read**. The app always recomputes it (section 4).

### Valid `locationNode` ids (32 localities)
`mussoorie, maldevta, sahastradhara, rajpur, mohkam, vasant, bindal, ballupur, premnagar, karanpur, kaulagarh, dalanwala, clock, sahast, patel, majra, nathuawala, rail, isbt, nehru, rispana, subhash, ajabpur, arcadia, itpark, harrawala, raipurj, haridwar, jakhan, chandrabani, sherpur, mothrowala`

The report form only lets the user pick one of these. Stations are never an incident location.

### lat/lng conversion (stylised map)
Reference point: Clock Tower at **30.3165, 78.0322**. Moving 1 map pixel changes latitude by 0.0002 and longitude by 0.000231. The frontend converts both ways, so the backend only has to store the numbers.

---

## 4. Priority score

```
priority = people * 5 + (medical ? 3 : 0) + (fire ? 2 : 0) + (police ? 2 : 0)
```
- `medical` is true for `medical` and `accident`; `fire` for `fire`; `police` for `police` and `accident`.
- Example: a medical report with 4 people = 4*5 + 3 = **23**. A fire with 7 people = 7*5 + 2 = **37**.
- Computed in `graph.js` (`calculateBackendPriority`). The frontend recomputes it for every record, so storing it is optional.
- **Severity level** (1-3) is stored and sent but is not used for anything yet.

## 5. The priority queue

- The "Active Emergency Queue" is **sorted by priority score, highest first**.
- The highest-priority report is selected by default.
- **It does not gate dispatch.** Every report is dispatched immediately. If a type has no free units, the counter just stops at 0 and the dispatch still happens. There is no waiting list yet.

---

## 6. Dispatch and timing (all frontend)

**Which station responds:** the station of the right type with the fastest route, taking traffic into account.
- `fire` goes to a fire station.
- `police` goes to a police station.
- `medical` and `accident` go to a hospital.

**Units needed:** medical and accident send **1 ambulance per 3 people (rounded up)**. Fire and police send 1 unit.

**Travel time:** road length divided by speed, multiplied by a traffic slowdown.
- Free-road speed is `EMERGENCY_SPEED_KMH = 40`, and `SIM_SPEEDUP = 1` means real time (both in `data.js`). Raise `SIM_SPEEDUP` for a faster demo.
- Minimum trip is 1 minute. If the station is already at the scene, the time is 3 minutes.
- A typical trip is about 4 km, which takes about 5 minutes with no traffic and about 7 minutes with the random starting traffic.

**Status lifecycle** (worked out from `now - dispatchedAt` versus the total time):
`DISPATCH` then `ARRIVING` (after 40% of the trip) then `ON SCENE`. On arrival the app sends the `PATCH`. `DELETE` ends the incident.

---

## 7. Resource counts (ambulances, fire engines, police units)

Three groups: **medical** (medical and accident incidents), **fire** and **police**.

**If the backend provides `GET /resources`**, the app shows its numbers. Accepted shapes:
```json
{ "medical": { "available": 28, "total": 35 },
  "fire":    { "available": 18, "total": 22 },
  "police":  { "available": 42, "total": 50 } }
```
The names `ambulances`, `fireEngines` and `policeUnits` also work, and the whole thing may be wrapped in `data`. The app re-reads it every 15 s and right after each successful POST and DELETE. So the backend should do the following:
- **On create:** subtract `unitsNeeded` from `available` for the matching group.
- **On delete (resolve):** add it back.
- The simplest correct rule is `available = total - sum(unitsNeeded of active incidents in that group)`.

**If `/resources` is missing or fails**, the app computes it itself: fixed totals (35 ambulances, 22 fire engines, 50 police units) minus the units used by active incidents. This is consistent across refreshes. Reports that are local-only (not saved to the server) are subtracted on top of the server's numbers.

---

## 8. Traffic

### The model
- There are **84 roads**. Each has a stable id `<from>-<to>`, for example `clock-rail`, `rajpur-kaulagarh`.
- **Capacity** = vehicles per km for the road type (arterial 60, regular 32, shortcut lane 18) times the road's length in km, ±10%, minimum 20. The server doesn't need it.
- **Load** is the number of vehicles currently on the road, and is the only thing the server stores.
- **Level** = load divided by capacity:

| Fill | Level | Colour | Travel-time multiplier |
|---|---|---|---|
| under 90% | Free flow | normal | 1× |
| 90-100% | At capacity | grey | 1.8× |
| 100-115% | Light | light orange | 2× rising to 3× |
| 115-135% | Medium | orange | 3× rising to 5× |
| over 135% | Heavy | red | 5× rising to 8× (capped at 160% fill) |

The slider on the road pop-up goes from 0 to 160% of capacity.

### The shared object
```json
{ "clock-rail": 125, "rajpur-kaulagarh": 40, "karanpur-ballupur": 140 }
```
- `GET /traffic` returns it, or `{}` if nothing has been saved. It can also be wrapped as `{ "traffic": {...} }` or `{ "data": {...} }`.
- `PUT /traffic` receives the **whole object** and replaces what's stored.
- If `GET` returns `{}`, the first screen that loads uploads its randomly generated starting traffic, so it fills itself in.
- When traffic changes, the frontend reroutes every unit that is still travelling, and the camera zooms to the new route if the path changed.
- It is stored as one blob. No calculation is needed on the server.
- **Last write wins:** two screens editing within the same few seconds can overwrite each other.

---

---

## 9. Known limits (fine for a demo)
- The map and station positions are invented, and traffic is a simulation. A real system would use live traffic data.
- There are no individual vehicles or GPS. The unit's position on the map is calculated along its route.
- No login, roles or audit log.
- Updates come by polling, not push.
- Priority doesn't yet decide who gets a scarce unit (see section 5).
