# NEXUS: Emergency Management and Resource Optimisation System

A map of Dehradun where emergency reports are dispatched to the nearest suitable hospital, police
station or fire station, with live traffic slowing the routes down. When there are not enough
units, reports wait in a **priority queue** and the highest priority gets the next free unit.

```
nexus/
├── frontend/   React + Vite. Only DRAWS what the backend sends and sends what the person types.
├── backend/    Express + MongoDB + the C++ engine. Decides everything.
│   ├── data/cityMap.mjs   the map (nodes, roads, curves): the single source of truth
│   └── engine/            the C++ engine: routes, traffic, priority queue, dispatch
└── cpp/        the original nexus.cpp (reference only)
```

## Who does what

| | Backend | Frontend |
|---|---|---|
| The map (nodes, roads, curves, rivers, names) | owns it, sends it (`GET /api/city/map`) | draws it |
| Traffic: the starting traffic, a road's level, colour, slowdown | generates and decides it, saves it | draws it, sends clicks |
| Priority score, severity, units needed | calculates | shows |
| Which station answers, the route, distance, ETA | calculates (Dijkstra with traffic) | draws the route |
| Priority queue, queue position | owns it | shows it |
| Re-routing when traffic changes | does it, keeps each unit's progress | nothing |
| "Unit has arrived" (ON SCENE) | decides it (a timer on the server) | shows it |
| Resource counts (ambulances, engines, police) | counts | shows |

The frontend has **no fallbacks**: no local map, no random traffic, no local routing, no local-only
reports. If the backend is down, the screen says "Can't reach the backend".

---

## How to run it

### 1. Install the tools (once)

| Tool | Why | Get it |
|---|---|---|
| **Node.js 18 or newer** | backend and frontend | https://nodejs.org (check: `node -v`) |
| **MongoDB** | the database | see step 2 |
| **g++** (C++17) | compiles the engine | Windows: MinGW-w64 (e.g. via MSYS2) · macOS: `xcode-select --install` · Ubuntu/Debian: `sudo apt install build-essential` (check: `g++ --version`) |

### 2. Start MongoDB and connect

The backend connects with one setting, `MONGO_URI`, in `backend/.env`. The database (`nexus_db`) and
its collections are created automatically the first time the backend runs; you don't create anything by hand.

**Option A: MongoDB on your computer (simplest)**
1. Install *MongoDB Community Server*: https://www.mongodb.com/try/download/community
   (macOS: `brew tap mongodb/brew && brew install mongodb-community`)
2. Make sure it is running:
   - Windows: the installer sets it up as a service that is already running (Services → *MongoDB*).
   - macOS: `brew services start mongodb-community`
   - Linux: `sudo systemctl start mongod`
3. Check (optional): `mongosh` should open a shell on `mongodb://127.0.0.1:27017`.
4. Nothing else to do: the default `MONGO_URI=mongodb://127.0.0.1:27017/nexus_db` already points there.

**Option B: MongoDB Atlas (free cloud database, nothing to install)**
1. Create a free cluster at https://www.mongodb.com/atlas, add a database user, and under *Network Access*
   allow your IP address.
2. *Connect → Drivers* gives a connection string. Put it in `backend/.env` with the database name:
   `MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/nexus_db`

### 3. Start the backend  (http://localhost:5000)

```
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env   (edit MONGO_URI if you use Atlas)
npm run dev                   # compiles the C++ engine, then starts the server
```

You should see something like:
```
MongoDB connected successfully
C++ engine started
Saved built-in facilities: 8 hospitals, 8 resources     (first run only)
Traffic: generated random traffic for 84 roads
Server running on port 5000
```
`http://localhost:5000/` should answer `{"message":"NEXUS backend is running"}`.

### 4. Start the frontend  (http://localhost:5173), in a second terminal

```
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. Vite forwards `/api/...` to the backend on port 5000, so there is nothing to
configure. (If the backend runs elsewhere, put `VITE_API_URL=http://host:port/api` in `frontend/.env`.)

From the project root you can also run `npm run install:all`, then `npm run dev:backend` and
`npm run dev:frontend` in two terminals.

### Troubleshooting

| Message | Fix |
|---|---|
| `MongoDB connection failed` | MongoDB isn't running, or `MONGO_URI` is wrong (Atlas: check the password and the IP allow-list) |
| `C++ engine not found ... Run: npm run build:engine` | `g++` is missing or the build failed: run `npm run build:engine` in `backend/` and read the error |
| Frontend shows "Can't reach the backend" | the backend isn't running on port 5000 |
| Port 5000 already in use | change `PORT` in `backend/.env` and the proxy target in `frontend/vite.config.js` |

---

## Test and demonstrate it

See **[DEMO.md](DEMO.md)**: step by step, how to show dispatch with enough resources (the priority
queue is not used) and with not enough resources (the priority queue decides), from the browser,
from a script (`npm run demo`) and with `curl`.

Automatic tests (no MongoDB needed, they use the real C++ engine): `npm test`.

More detail: [backend/README.md](backend/README.md) (endpoints and rules) and
[frontend/README.md](frontend/README.md).
