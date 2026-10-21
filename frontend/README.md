# NEXUS frontend

React + Vite. It **only draws and asks**: it shows what the backend sends and sends what the person
does. It has no map data, no traffic generation, no routing, no priority or status calculations and no
local fallback. If the backend is down it says "Can't reach the backend" and offers "Try again".

```
npm install
npm run dev        # http://localhost:5173, /api is proxied to the backend on port 5000
```
The backend must be running (see the main [README](../README.md)). To reach a backend somewhere else, put
`VITE_API_URL=http://host:port/api` in `frontend/.env`.

## What it reads (every 2 seconds, plus once at start)

| Call | Used for |
|---|---|
| `GET /api/city/map` (once) | the nodes, roads and their curves, rivers, area names, station styles |
| `GET /api/traffic` | each road's load, level, colour, slowdown |
| `GET /api/emergencies` | the reports in priority order, each with `displayStatus`, `queuePosition`, route, ETA, units |
| `GET /api/resources` | the Ambulance / Fire / Police cards |

## What it sends

| Action | Call |
|---|---|
| Submit the report form | `POST /api/emergencies` with `title, type, locationNode, address, peopleCount` only |
| Mark resolved / cancel report | `DELETE /api/emergencies/:id` |
| Set a road's traffic (hover card) | `PATCH /api/traffic/roads/:id` |
| Random Traffic / Clear Traffic buttons | `POST /api/traffic/randomize` / `POST /api/traffic/clear` |

## Files

| File | |
|---|---|
| `api.js` | the only place that talks to the backend; no fallbacks |
| `Nexus.jsx` | loads data, polls, shows toasts for what changed (unit arrived, a waiting report was dispatched) |
| `MapPanel.jsx` | draws the map, roads coloured with the backend's colours, the route and the moving unit |
| `TrackerPanel.jsx`, `ReportsList.jsx`, `ResourceRow.jsx`, `ReportModal.jsx` | panels |
| `geometry.js` | follows the backend's road curves to place the moving unit |
| `format.js` | text formatting and keeping the countdown ticking between two updates |

The only thing computed on the screen is cosmetic: placing the unit marker along the route from the
backend's elapsed time, and the label layout on the map.
