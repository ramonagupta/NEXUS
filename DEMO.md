# Demonstrating the dispatch

Start MongoDB, the backend (`cd backend && npm run dev`) and the frontend (`cd frontend && npm run dev`),
then open http://localhost:5173 (see [README.md](README.md)).

**The built-in resources** (a report takes units until you resolve it):

| | how many |
|---|---|
| ambulances | 42 (8 hospitals) |
| fire engines | 9 (3 stations x 3) |
| police units | 10 (5 stations x 2) |

A medical or accident report needs **1 ambulance per 3 people** (7 people = 3 ambulances) and 1 bed per
person. A fire or police report needs 1 unit.
**Priority score** = `people x 5` + 3 (medical) + 2 (fire) + 2 (police). Two fires: 1 person = **7**, 10 people = **52**.

Before each demo, start clean: click **Mark resolved** on every report, or run
`curl -X POST http://localhost:5000/api/emergencies/reset`.

---

## Demo 1: enough resources. The priority queue is NOT in effect

Every report finds a free unit, is dispatched **at once**, and nothing waits.

**In the browser**
1. Click **Report Emergency**. Fill in: *Shop fire*, type **fire**, location *Clock Tower*, any address, **3** people. **Dispatch Unit**.
2. Report again: *Road accident*, type **medical**, location *Railway Station*, **7** people.
3. Report again: *Robbery*, type **police**, location *Rajpur*, **1** person.

**What you should see**
- A green toast "Emergency dispatched!" for each, with the route and ETA.
- Each report in the list has a status of **DISPATCH** (then ARRIVING, then ON SCENE) and **no `QUEUE #` badge**.
- The accident says *3 ambulances* and the **Ambulances** card drops from 42/42 to **39/42**; Fire Engines 8/9; Police 9/10.
- The bottom-right card still says "Request instant emergency dispatch" (no report is waiting).
- `GET http://localhost:5000/api/emergencies/queue` returns `[]`.

**Or run it as a script** (prints each step and checks the result):
```
cd backend
node scripts/demo.mjs no-queue
```

---

## Demo 2: not enough resources. The priority queue IS in effect

When every unit of a kind is busy, new reports **wait**. The report with the **highest priority score** gets the
next unit that is freed, even if a lower-priority report has been waiting longer.

**Quick setup for the browser: shrink the fire fleet to 3 engines** (otherwise you need 9 reports to use them all):
```
curl -X PUT http://localhost:5000/api/resources/f1 -H "Content-Type: application/json" -d "{\"capacity\":1}"
curl -X PUT http://localhost:5000/api/resources/f2 -H "Content-Type: application/json" -d "{\"capacity\":1}"
curl -X PUT http://localhost:5000/api/resources/f3 -H "Content-Type: application/json" -d "{\"capacity\":1}"
```
The Fire Engines card now shows **3 / 3**. (This is saved; put it back at the end with `"capacity":3` for f1, f2, f3.)
Make sure no reports are open.

**In the browser**
1. File **three fires** (type **fire**, **1** person, any location), titles *Fire A*, *Fire B*, *Fire C*.
   All three are dispatched. Fire Engines: **0 / 3**.
2. File *LOW fire*: type **fire**, **1** person, *Rajpur*. Toast: "No unit is free... WAITING in the priority queue at position 1".
3. File *HIGH fire*: type **fire**, **10** people, *Dalanwala*, after it.
4. Look at the list: *HIGH fire* (score **52**) shows **QUEUE #1**, *LOW fire* (score **7**) shows **QUEUE #2**,
   although LOW was reported first. Click one to see "WAITING" and its queue position in the tracker.
   The bottom-right card says "2 reports waiting in the priority queue".
5. Select *Fire A* and click **Mark resolved**. Toast: the freed engine went to *HIGH fire*.
   *HIGH fire* is now dispatched (with a route and ETA); *LOW fire* is still waiting, now **QUEUE #1**.
6. Resolve *Fire B*. Now *LOW fire* gets the engine and the queue is empty.

Other things to try: switch the control unit offline (`PUT /api/control-unit {"status":"offline"}`) and
medical reports wait while police and fire carry on; switch it back online and they go out, highest score first.

**Or run it as a script** (uses all 9 real fire engines, nothing to set up):
```
cd backend
node scripts/demo.mjs queue            # add --pause to press ENTER between steps while you watch the browser
```
Expected ending:
```
PASS  HIGH is ahead of LOW even though LOW was reported first
PASS  the freed engine went to the HIGH priority report
PASS  the next freed engine went to LOW
All checks passed
```

**With curl only**
```
# (after using up the fire engines)
curl -X POST http://localhost:5000/api/emergencies -H "Content-Type: application/json" \
  -d "{\"title\":\"LOW fire\",\"type\":\"fire\",\"locationNode\":\"rajpur\",\"address\":\"test\",\"peopleCount\":1}"
curl -X POST http://localhost:5000/api/emergencies -H "Content-Type: application/json" \
  -d "{\"title\":\"HIGH fire\",\"type\":\"fire\",\"locationNode\":\"dalanwala\",\"address\":\"test\",\"peopleCount\":10}"
curl http://localhost:5000/api/emergencies/queue            # HIGH is position 1, LOW is position 2
curl -X DELETE http://localhost:5000/api/emergencies/<id of a dispatched fire>   # freed engine -> HIGH
```

---

## Demo 3 (traffic is decided by the backend)

- Reload the page: the traffic is the same (it is stored by the backend), and it was generated by the backend
  at startup (`TRAFFIC_ON_START` in `backend/.env`).
- Click **Random Traffic** on the map: the backend generates new traffic for all 84 roads.
- Hover or click a road, then **Heavy**: the backend sets its load, recalculates the slowdown and re-routes any unit
  already on its way (its ETA and "Traffic delay" change; a unit that was half way is still half way).
- `GET http://localhost:5000/api/traffic` shows each road's load, level, colour and slowdown.
