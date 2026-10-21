// engine/nexus_engine.cpp
//
// The NEXUS engine. ALL the DSA + OOP logic lives here, moved over from
// nexus.cpp (Emergency / Hospital / PoliceStation / FireStation classes,
// the city graph, traffic-aware Dijkstra, the priority queue, the matching of
// emergencies to the nearest suitable unit) and extended with the waiting
// queue (runQueue) and the Central Medical Control unit.
//
// What changed compared to nexus.cpp:
//   * No console printing inside the logic. Anything that used to be
//     printed (assigned hospital, route, travel time, traffic) is now
//     returned as data and sent back to the backend as one line of JSON.
//   * main() is no longer a hard-coded test run. It is a loop that reads
//     one command per line from stdin and writes one JSON line to stdout.
//   * Small getters were added to the Hospital / PoliceStation /
//     FireStation classes so the backend can read their availability.
//
// The Node backend starts this program once and keeps it running, so the
// queue, traffic and station availability all live here between requests.
//
// The city, the roads, the traffic slowdown, the 40 km/h travel speed, the
// priority score and the severity level all follow the frontend, so the engine
// and the map the user sees give the same answers.
//
// How dispatch works:
//   Registering an emergency (ADD) runs the queue straight away. Every service an
//   emergency needs (ambulance / police / fire) is assigned as soon as a suitable
//   unit is free. If none is free the service WAITS in the priority queue and is
//   given the next free unit, highest priority first. Units come back with RELEASE.
//   Every AMBULANCE dispatch (hospital resources) is sent by the Central Medical
//   Control unit; police and fire stations are dispatched directly.
//
// Commands (one per line on stdin):
//   ADD <type> <people> <locationNode>          register an emergency + run the queue
//                                               (type: medical | accident | fire | police | other)
//   QUEUE                                       emergencies still waiting, best first
//   DISPATCH                                    run the queue again
//   RELEASE <engineId>                          emergency finished: free its units, run the queue
//   CONTROL                                     the Central Medical Control unit + the ambulance fleet it controls
//   CONTROL_SET <name> <node> <online 0|1>      rename / move / switch the control unit on or off
//   ROUTE <startNode> <endNode> <vehicle>       fastest route (vehicle: ambulance|police|fire)
//   CITY                                        nodes, roads (with their traffic) and the map's geo settings
//   TRAFFIC                                     the traffic: { "<roadId>": vehicles on the road }
//   TRAFFIC_SET <roadId>=<vehicles> ...         replace the whole traffic (no ids = no traffic at all)
//   TRAFFIC_RANDOM [seed]                       generate random traffic for every road (the city's starting traffic)
//   TRAFFIC_ROAD <roadId> <level> [ratio]       set ONE road: level = free|full|light|medium|heavy|custom
//                                               (custom needs a ratio: 1.2 = 120% of the road's capacity)
//   REROUTE                                     recompute the route of every unit still on its way (after traffic changed)
//   RESOURCES                                   hospitals + stations with live availability
//   HOSPITAL_ADD <name> <node> <beds> <ambulances>
//   HOSPITAL_UPDATE <name> <node> <beds> <ambulances>
//   HOSPITAL_DELETE <name>
//   STATION_ADD <police|fire> <name> <node> <units> <outOfService 0|1>
//   STATION_UPDATE <name> <node> <units> <outOfService 0|1>
//   STATION_DELETE <name>
//   FACILITIES_CLEAR                            remove every hospital and station
//   QUIT
//
// Names are percent-encoded by the backend so they can contain spaces.

#include <iostream>
#include <string>
#include <vector>
#include <queue>
#include <map>
#include <limits>
#include <cmath>
#include <algorithm>
#include <functional>
#include <iomanip>
#include <sstream>
#include <cctype>
#include <cstdio>
#include <random>
#include "city_data.h"   // the map: generated from data/cityMap.mjs (see scripts/generate-city-data.mjs)
using namespace std;

// ============================================================
//  OOP: Emergency
// ============================================================
class Emergency
{
private:
    int injuredPeople;          // people affected
    string emergencyType;       // medical | accident | fire | police | other
    string location;            // map node where it happens

    int ambulancesNeeded;
    int policeNeeded;
    int fireTrucksNeeded;

    int priorityScore;
    int severityLevel;

public:

    Emergency(string type, int injured, string loc)
    {
        emergencyType = type;
        injuredPeople = injured;
        location = loc;

        ambulancesNeeded = 0;
        policeNeeded = 0;
        fireTrucksNeeded = 0;
        priorityScore = 0;
        severityLevel = 1;
    }

    // medical and accident: 1 ambulance for every 3 people
    // police and other:     1 police unit
    // fire:                 1 fire truck
    void calculateResources()
    {
        ambulancesNeeded = 0;
        policeNeeded = 0;
        fireTrucksNeeded = 0;

        if (emergencyType == "medical" || emergencyType == "accident")
            ambulancesNeeded = (injuredPeople + 2) / 3;
        if (emergencyType == "police" || emergencyType == "other")
            policeNeeded = 1;
        if (emergencyType == "fire")
            fireTrucksNeeded = 1;
    }

    // priority = injured*5 + medical*3 + fire*2 + police*2
    // medical is 1 for medical / accident, fire is 1 for fire,
    // police is 1 for police / accident (same rule as the frontend)
    void calculatePriorityScore()
    {
        int medical = (emergencyType == "medical" || emergencyType == "accident") ? 1 : 0;
        int fire = (emergencyType == "fire") ? 1 : 0;
        int police = (emergencyType == "police" || emergencyType == "accident") ? 1 : 0;

        priorityScore =
            injuredPeople * 5 +
            medical * 3 +
            fire * 2 +
            police * 2;
    }

    // severity 1-3: fire and medical start at 3, accident and police at 2,
    // other at 1, and 10 or more people is always 3 (same rule as the frontend)
    void calculateSeverityLevel()
    {
        if (emergencyType == "fire" || emergencyType == "medical")
            severityLevel = 3;
        else if (emergencyType == "accident" || emergencyType == "police")
            severityLevel = 2;
        else
            severityLevel = 1;

        if (injuredPeople >= 10)
            severityLevel = 3;
    }

    int getSeverityLevel()
    {
        return severityLevel;
    }

    int getPriorityScore()
    {
        return priorityScore;
    }

    int getInjuredPeople()
    {
        return injuredPeople;
    }

    int getAmbulancesNeeded()
    {
        return ambulancesNeeded;
    }

    int getPoliceNeeded()
    {
        return policeNeeded;
    }

    int getFireTrucksNeeded()
    {
        return fireTrucksNeeded;
    }

    string getEmergencyType()
    {
        return emergencyType;
    }

    string getLocation()
    {
        return location;
    }
};

// ============================================================
//  OOP: Hospital (+ 8 derived hospitals)
// ============================================================
class Hospital
{
protected:
    string name;
    string location;   // city node the hospital sits at (routes start here)

    int totalAmbulances;
    int availableAmbulances;

    int totalBeds;
    int availableBeds;

public:

    Hospital(string n, int ambulances, int beds, string loc = "")
    {
        name = n;
        // the built-in hospitals sit at the node that has the same name
        location = loc.empty() ? n : loc;

        totalAmbulances = ambulances;
        availableAmbulances = ambulances;

        totalBeds = beds;
        availableBeds = beds;
    }

    virtual ~Hospital() {}

    string getName()
    {
        return name;
    }

    string getLocation() { return location; }
    void setLocation(string loc) { location = loc; }

    // getters added so the backend can show availability
    int getTotalAmbulances() { return totalAmbulances; }
    int getAvailableAmbulances() { return availableAmbulances; }
    int getTotalBeds() { return totalBeds; }
    int getAvailableBeds() { return availableBeds; }

    // Change the capacity. Beds / ambulances already in use stay in use,
    // so the new totals can't be lower than what is currently assigned.
    bool resize(int ambulances, int beds)
    {
        int ambulancesInUse = totalAmbulances - availableAmbulances;
        int bedsInUse = totalBeds - availableBeds;

        if (ambulances < ambulancesInUse || beds < bedsInUse)
            return false;

        totalAmbulances = ambulances;
        availableAmbulances = ambulances - ambulancesInUse;
        totalBeds = beds;
        availableBeds = beds - bedsInUse;
        return true;
    }

    bool canHandle(Emergency &e)
    {
        return
            e.getAmbulancesNeeded() <= availableAmbulances &&
            e.getInjuredPeople() <= availableBeds;
    }

    void assignHospital(Emergency &e)
    {
        availableAmbulances -= e.getAmbulancesNeeded();
        availableBeds -= e.getInjuredPeople();
    }

    // the emergency is over: ambulances and beds are free again
    void releaseHospital(Emergency &e)
    {
        availableAmbulances = min(totalAmbulances, availableAmbulances + e.getAmbulancesNeeded());
        availableBeds = min(totalBeds, availableBeds + e.getInjuredPeople());
    }
};
class Hospital1 : public Hospital
{
public:
    Hospital1() : Hospital("h1", 8, 16) {}
};

class Hospital2 : public Hospital
{
public:
    Hospital2() : Hospital("h2", 8, 16) {}
};

class Hospital3 : public Hospital
{
public:
    Hospital3() : Hospital("h3", 3, 8) {}
};

class Hospital4 : public Hospital
{
public:
    Hospital4() : Hospital("h4", 3, 8) {}
};

class Hospital5 : public Hospital
{
public:
    Hospital5() : Hospital("h5", 5, 12) {}
};

class Hospital6 : public Hospital
{
public:
    Hospital6() : Hospital("h6", 5, 12) {}
};

class Hospital7 : public Hospital
{
public:
    Hospital7() : Hospital("h7", 5, 12) {}
};

class Hospital8 : public Hospital
{
public:
    Hospital8() : Hospital("h8", 5, 12) {}
};

// ============================================================
//  OOP: PoliceStation (+ 5 derived stations)
// ============================================================
class PoliceStation
{
protected:
    string name;
    string location;   // city node the station sits at (routes start here)

    int totalJeeps;
    int availableJeeps;

    bool outOfService; // switched off by the admin, never dispatched

public:

    PoliceStation(string n, int jeeps, string loc = "")
    {
        name = n;
        location = loc.empty() ? n : loc;

        totalJeeps = jeeps;
        availableJeeps = jeeps;

        outOfService = false;
    }

    virtual ~PoliceStation() {}

    string getName()
    {
        return name;
    }

    string getLocation() { return location; }
    void setLocation(string loc) { location = loc; }

    int getTotalJeeps() { return totalJeeps; }
    int getAvailableJeeps() { return availableJeeps; }

    bool isOutOfService() { return outOfService; }
    void setOutOfService(bool value) { outOfService = value; }

    // jeeps already out on a job stay out, so the new total can't be lower
    bool resize(int jeeps)
    {
        int inUse = totalJeeps - availableJeeps;
        if (jeeps < inUse)
            return false;

        totalJeeps = jeeps;
        availableJeeps = jeeps - inUse;
        return true;
    }

    bool canHandle(Emergency &e)
    {
        if (outOfService)
            return false;

        return e.getPoliceNeeded() <= availableJeeps;
    }

    void assignPolice(Emergency &e)
    {
        availableJeeps -= e.getPoliceNeeded();
    }

    void releasePolice(Emergency &e)
    {
        availableJeeps = min(totalJeeps, availableJeeps + e.getPoliceNeeded());
    }
};
class PoliceStation1 : public PoliceStation
{
public:
    PoliceStation1() : PoliceStation("p1", 2) {}
};

class PoliceStation2 : public PoliceStation
{
public:
    PoliceStation2() : PoliceStation("p2", 2) {}
};

class PoliceStation3 : public PoliceStation
{
public:
    PoliceStation3() : PoliceStation("p3", 2) {}
};

class PoliceStation4 : public PoliceStation
{
public:
    PoliceStation4() : PoliceStation("p4", 2) {}
};

class PoliceStation5 : public PoliceStation
{
public:
    PoliceStation5() : PoliceStation("p5", 2) {}
};

// ============================================================
//  OOP: FireStation (+ 3 derived stations)
// ============================================================
class FireStation
{
protected:
    string name;
    string location;   // city node the station sits at (routes start here)

    int totalFireTrucks;
    int availableFireTrucks;

    bool outOfService; // switched off by the admin, never dispatched

public:

    FireStation(string n, int trucks, string loc = "")
    {
        name = n;
        location = loc.empty() ? n : loc;

        totalFireTrucks = trucks;
        availableFireTrucks = trucks;

        outOfService = false;
    }

    virtual ~FireStation() {}

    string getName()
    {
        return name;
    }

    string getLocation() { return location; }
    void setLocation(string loc) { location = loc; }

    int getTotalFireTrucks() { return totalFireTrucks; }
    int getAvailableFireTrucks() { return availableFireTrucks; }

    bool isOutOfService() { return outOfService; }
    void setOutOfService(bool value) { outOfService = value; }

    // trucks already out on a job stay out, so the new total can't be lower
    bool resize(int trucks)
    {
        int inUse = totalFireTrucks - availableFireTrucks;
        if (trucks < inUse)
            return false;

        totalFireTrucks = trucks;
        availableFireTrucks = trucks - inUse;
        return true;
    }

    bool canHandle(Emergency &e)
    {
        if (outOfService)
            return false;

        return e.getFireTrucksNeeded()
               <= availableFireTrucks;
    }

    void assignFireTruck(Emergency &e)
    {
        availableFireTrucks -= e.getFireTrucksNeeded();
    }

    void releaseFireTruck(Emergency &e)
    {
        availableFireTrucks = min(totalFireTrucks, availableFireTrucks + e.getFireTrucksNeeded());
    }
};
class FireStation1 : public FireStation
{
public:
    FireStation1() : FireStation("f1", 3) {}
};

class FireStation2 : public FireStation
{
public:
    FireStation2() : FireStation("f2", 3) {}
};

class FireStation3 : public FireStation
{
public:
    FireStation3() : FireStation("f3", 3) {}
};

// ============================================================
//  DSA: city graph + traffic
//  The map is data/cityMap.mjs (city_data.h): 48 nodes, 84 roads.
//  Traffic = how many vehicles are on each road. A road slows down as its
//  load grows compared to its capacity. Everything about traffic is decided
//  here: the level, the colour, the slowdown, the random starting traffic.
// ============================================================
struct Road
{
    string id;       // "<from>-<to>"
    string to;       // the node this road leads to
    int weight;      // length in map units (1 unit = 0.045 km)
    int capacity;    // vehicles the road holds before it is over capacity
};

map<string, vector<Road>> graph;   // node -> the roads leaving it
map<string, int> nodeIndex;        // node id -> position in CITY_NODES
map<string, int> roadLoad;         // road id -> vehicles on it (the traffic, set from the map)
map<string, int> roadCapacity;     // road id -> capacity

const double KM_PER_WEIGHT_UNIT = 0.045;
const double EMERGENCY_SPEED_KMH = 40;   // every emergency vehicle, on a free road
const int ON_SITE_SECONDS = 180;         // the station is already at the scene: 3 minutes
const int MIN_TRAVEL_SECONDS = 60;       // shortest ETA shown for any trip: 1 minute

void buildCity()
{
    for (int i = 0; i < CITY_NODE_COUNT; i++)
    {
        nodeIndex[CITY_NODES[i].id] = i;
        graph[CITY_NODES[i].id];   // make sure every node exists
    }

    for (int i = 0; i < CITY_ROAD_COUNT; i++)
    {
        const CityRoad &r = CITY_ROADS[i];
        graph[r.from].push_back({r.id, r.to, r.weight, r.capacity});
        graph[r.to].push_back({r.id, r.from, r.weight, r.capacity});
        roadCapacity[r.id] = r.capacity;
    }
}

// the node's display name, e.g. "clock" -> "Clock Tower"
string getAreaName(string node)
{
    auto it = nodeIndex.find(node);
    if (it == nodeIndex.end())
        return "Unknown";
    return CITY_NODES[it->second].name;
}

// every emergency vehicle drives at the same speed (as in the frontend)
double getBaseSpeed(string vehicle)
{
    return EMERGENCY_SPEED_KMH;
}

// vehicles on the road / the road's capacity
double roadRatio(const string &roadId, int capacity)
{
    auto it = roadLoad.find(roadId);
    int load = (it == roadLoad.end()) ? 0 : it->second;
    return (double)load / (capacity > 0 ? capacity : 1);
}

// free (under 90%), full (90-100%), light (to 115%), medium (to 135%), heavy
string trafficLevel(double ratio)
{
    if (ratio > 1.35) return "heavy";
    if (ratio > 1.15) return "medium";
    if (ratio > 1) return "light";
    if (ratio >= 0.9) return "full";
    return "free";
}

// how many times slower than a free road: 1 when free, 1.8 at capacity, and once
// over capacity it grows with the margin: x2 (just over), x3 (+15%), x5 (+35%), x8 (+60%)
double speedFactorForRatio(double ratio)
{
    string level = trafficLevel(ratio);
    if (level == "free") return 1;
    if (level == "full") return 1.8;

    const double stops[4][2] = {{0, 2}, {0.15, 3}, {0.35, 5}, {0.6, 8}};
    double margin = min(ratio - 1, 0.6);

    for (int i = 1; i < 4; i++)
    {
        if (margin <= stops[i][0])
        {
            return stops[i - 1][1] +
                   ((margin - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])) *
                   (stops[i][1] - stops[i - 1][1]);
        }
    }
    return stops[3][1];
}

// ---- how traffic is described to the frontend (it only draws what it is told) ----
struct TrafficLevelInfo
{
    const char* key;
    const char* label;
    double presetRatio;   // load / capacity used when a road is set to this level
};

static const TrafficLevelInfo TRAFFIC_LEVEL_INFO[] = {
    {"free",   "Free flow",   0.15},
    {"full",   "At capacity", 1.0},
    {"light",  "Light",       1.1},
    {"medium", "Medium",      1.25},
    {"heavy",  "Heavy",       1.5},
};
const int TRAFFIC_LEVEL_COUNT = sizeof(TRAFFIC_LEVEL_INFO) / sizeof(TRAFFIC_LEVEL_INFO[0]);
const double MAX_TRAFFIC_RATIO = 1.6;   // the most a road can be loaded to (160% of capacity)

const TrafficLevelInfo* findTrafficLevel(const string &key)
{
    for (int i = 0; i < TRAFFIC_LEVEL_COUNT; i++)
        if (key == TRAFFIC_LEVEL_INFO[i].key)
            return &TRAFFIC_LEVEL_INFO[i];
    return nullptr;
}

// colour of a road on the map: none when free, grey at capacity, and once it is
// over capacity light orange -> orange -> red -> dark red as the margin grows
string trafficColor(double ratio)
{
    string level = trafficLevel(ratio);
    if (level == "free") return "";
    if (level == "full") return "#9AA3B2";

    const double stops[4][4] = {
        {0.0,  246, 194, 122},
        {0.2,  238, 138, 42},
        {0.45, 224, 54,  60},
        {0.7,  168, 18,  42},
    };
    double margin = ratio - 1;
    double rgb[3] = {0, 0, 0};

    if (margin <= stops[0][0])
    {
        for (int k = 0; k < 3; k++) rgb[k] = stops[0][k + 1];
    }
    else if (margin >= stops[3][0])
    {
        for (int k = 0; k < 3; k++) rgb[k] = stops[3][k + 1];
    }
    else
    {
        for (int i = 1; i < 4; i++)
        {
            if (margin <= stops[i][0])
            {
                double t = (margin - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
                for (int k = 0; k < 3; k++)
                    rgb[k] = stops[i - 1][k + 1] + (stops[i][k + 1] - stops[i - 1][k + 1]) * t;
                break;
            }
        }
    }

    char buf[32];
    snprintf(buf, sizeof(buf), "rgb(%ld,%ld,%ld)", lround(rgb[0]), lround(rgb[1]), lround(rgb[2]));
    return buf;
}

double trafficSpeedFactor(const Road &road)
{
    return speedFactorForRatio(roadRatio(road.id, road.capacity));
}

struct Route
{
    bool found;
    double time;                 // seconds, with the current traffic
    vector<string> path;         // node ids, from the start to the destination
    double distanceKm = 0;
    double baseTime = 0;         // seconds the same route takes with no traffic
    int jammedSegments = 0;      // roads on the route that are slowed down
    bool isOnSite = false;       // the station is at the scene already
};

// ============================================================
//  DSA: Dijkstra (priority_queue based, traffic-aware)
//  Cost of a road = (its length / the vehicle's speed) x its traffic slowdown.
// ============================================================
Route dijkstra(
    string start,
    string destination,
    string vehicle)
{
    map<string, double> distance;
    map<string, string> previous;

    double INF =
        numeric_limits<double>::infinity();
    for (auto &x : graph)
    {
        distance[x.first] = INF;
    }

    distance[start] = 0;

    // map units driven per second on a free road (same arithmetic as the frontend,
    // so the times match to the second)
    double unitSpeed =
        getBaseSpeed(vehicle) / 3600 / KM_PER_WEIGHT_UNIT;

    // The queue is ordered by (time, position of the node on the map). When two
    // nodes are reached at exactly the same time, the one that comes first on the
    // map is taken first, which is how the frontend breaks ties too, so equally
    // fast routes are chosen the same way.
    priority_queue<
        pair<double, int>,
        vector<pair<double, int>>,
        greater<pair<double, int>>
    > pq;
    pq.push({0, nodeIndex[start]});
    while (!pq.empty())
    {
        double currentTime =
            pq.top().first;

        string current =
            CITY_NODES[pq.top().second].id;

        pq.pop();
        if (currentTime > distance[current])
            continue;
        if (current == destination)
            break;
        for (Road &road : graph[current])
        {
            string next = road.to;
            double time =
                (road.weight / unitSpeed) * trafficSpeedFactor(road);
            double newTime =
                currentTime + time;
            if (newTime < distance[next])
            {
                distance[next] = newTime;
                previous[next] = current;
                pq.push({
                    newTime,
                    nodeIndex[next]
                });
            }
        }
    }
    if (distance[destination] == INF)
    {
        return {false, 0, {}};
    }
    vector<string> path;
    string current = destination;
    while (current != start)
    {
        path.push_back(current);

        current = previous[current];
    }
    path.push_back(start);
    reverse(
        path.begin(),
        path.end()
    );

    // length of the route, how long it takes with no traffic, how many roads are jammed
    double totalUnits = 0;
    double baseSeconds = 0;
    int jammed = 0;
    for (size_t i = 0; i + 1 < path.size(); i++)
    {
        for (Road &road : graph[path[i]])
        {
            if (road.to != path[i + 1])
                continue;

            totalUnits += road.weight;
            baseSeconds += road.weight / unitSpeed;
            if (trafficSpeedFactor(road) > 1)
                jammed++;
            break;
        }
    }

    return {
        true,
        distance[destination],
        path,
        totalUnits * KM_PER_WEIGHT_UNIT,
        baseSeconds,
        jammed,
        start == destination
    };
}

// ============================================================
//  DSA: emergency storage + priority queue
// ============================================================
// What has been assigned to an emergency, one record per service.
struct ServiceAssignment
{
    int unitsRequired;
    string state;      // "not_required" | "waiting" | "assigned" | "unavailable"
    string provider;   // hospital / station name, empty until assigned
    string dispatchedBy;   // the control unit that sent it (ambulances), else empty
    Route route;
};

enum ServiceKind { AMBULANCE = 0, POLICE = 1, FIRE = 2 };

struct EmergencyState
{
    ServiceAssignment service[3];
    bool closed;       // finished (released), never dispatched again
};

ServiceAssignment makeService(int unitsRequired)
{
    ServiceAssignment a;
    a.unitsRequired = unitsRequired;
    a.state = unitsRequired > 0 ? "waiting" : "not_required";
    a.provider = "";
    a.dispatchedBy = "";
    a.route = {false, 0, {}};
    return a;
}

vector<Emergency> emergencies;
vector<EmergencyState> states;   // same index as emergencies

// The priority queue. Key = (priority score, -index): the highest score comes
// out first, and between equal scores the OLDER emergency does.
priority_queue<pair<int, int>> pq;

int addEmergency(
    string type,
    int injured,
    string location)
{
    Emergency emergency(
        type,injured,location
    );
    emergency.calculateResources();
    emergency.calculatePriorityScore();
    emergency.calculateSeverityLevel();
    emergencies.push_back(emergency);
    int index =
        emergencies.size() - 1;

    EmergencyState st;
    st.service[AMBULANCE] = makeService(emergency.getAmbulancesNeeded());
    st.service[POLICE] = makeService(emergency.getPoliceNeeded());
    st.service[FIRE] = makeService(emergency.getFireTrucksNeeded());
    st.closed = false;
    states.push_back(st);

    pq.push({
        emergency.getPriorityScore(),
        -index
    });
    return index;
}

// ============================================================
//  Matching: nearest suitable hospital / police / fire station
// ============================================================
Hospital* findHospital(
    Emergency &e,
    vector<Hospital*> &hospitals,
    Route &bestRoute)
{
    Hospital* best = nullptr;

    double bestTime =
        numeric_limits<double>::infinity();
    for (Hospital* h : hospitals)
    {
        if (!h->canHandle(e))
            continue;
        Route route =
            dijkstra(
                h->getLocation(),
                e.getLocation(),
                "ambulance"
            );
        if (route.found &&
            route.time < bestTime)
        {
            bestTime = route.time;
            best = h;
            bestRoute = route;
        }
    }
    return best;
}

PoliceStation* findPolice(
    Emergency &e,
    vector<PoliceStation*> &stations,
    Route &bestRoute)
{
    PoliceStation* best = nullptr;
    double bestTime =
        numeric_limits<double>::infinity();
    for (PoliceStation* p : stations)
    {
        if (!p->canHandle(e))
            continue;
        Route route =
            dijkstra(
                p->getLocation(),
                e.getLocation(),
                "police"
            );
        if (route.found &&
            route.time < bestTime)
        {
            bestTime = route.time;
            best = p;
            bestRoute = route;
        }
    }
    return best;
}

FireStation* findFire(
    Emergency &e,
    vector<FireStation*> &stations,
    Route &bestRoute)
{
    FireStation* best = nullptr;
    double bestTime =numeric_limits<double>::infinity();
    for (FireStation* f : stations)
    {
        if (!f->canHandle(e))
            continue;
        Route route =
            dijkstra(
                f->getLocation(),
                e.getLocation(),
                "fire"
            );
        if (route.found &&
            route.time < bestTime)
        {
            bestTime = route.time;
            best = f;
            bestRoute = route;
        }
    }
    return best;
}

// ============================================================
//  OOP: Central Medical Control
//  ONE control unit controls the resources of ALL the hospitals (their
//  ambulances and beds) and sends every ambulance dispatch. Hospitals never
//  dispatch on their own. If the unit is switched off, no ambulance is sent:
//  those requests wait in the priority queue until it is back online.
// ============================================================
class CentralMedicalControl
{
private:
    string name;
    string location;            // city node where the control room sits
    bool online;
    int ambulanceDispatches;    // dispatches sent since the engine started

public:

    CentralMedicalControl(string n, string loc)
    {
        name = n;
        location = loc;
        online = true;
        ambulanceDispatches = 0;
    }

    string getName() { return name; }
    string getLocation() { return location; }
    bool isOnline() { return online; }
    int getAmbulanceDispatches() { return ambulanceDispatches; }

    void setName(string n) { name = n; }
    void setLocation(string loc) { location = loc; }
    void setOnline(bool value) { online = value; }

    // The only place hospital ambulances are dispatched from.
    // Picks the hospital that can reach the emergency fastest (the matching from
    // nexus.cpp) and sends its ambulances. Returns nullptr if the unit is offline
    // or no hospital can take the emergency right now.
    Hospital* dispatchAmbulances(
        Emergency &e,
        vector<Hospital*> &hospitals,
        Route &route)
    {
        if (!online)
            return nullptr;

        Hospital* hospital = findHospital(e, hospitals, route);
        if (hospital == nullptr)
            return nullptr;

        hospital->assignHospital(e);
        ambulanceDispatches++;
        return hospital;
    }

    // the emergency is over: the ambulances and beds go back to their hospital
    void recallAmbulances(Hospital* hospital, Emergency &e)
    {
        if (hospital != nullptr)
            hospital->releaseHospital(e);
    }
};

CentralMedicalControl centralControl("Central Medical Control", "clock");

// ============================================================
//  Dispatch: give free units to the waiting emergencies, best first
// ============================================================
Hospital* lookupHospital(vector<Hospital*> &hospitals, const string &name);
PoliceStation* lookupPolice(vector<PoliceStation*> &stations, const string &name);
FireStation* lookupFire(vector<FireStation*> &stations, const string &name);

// Could this service NEVER be served, even if every unit were free?
// (e.g. more beds needed than any hospital has). Those are not kept waiting.
bool serviceImpossible(
    int kind,
    Emergency &e,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    if (kind == AMBULANCE)
    {
        for (Hospital* h : hospitals)
            if (h->getTotalAmbulances() >= e.getAmbulancesNeeded() &&
                h->getTotalBeds() >= e.getInjuredPeople())
                return false;
        return true;
    }
    if (kind == POLICE)
    {
        for (PoliceStation* p : policeStations)
            if (p->getTotalJeeps() >= e.getPoliceNeeded())
                return false;
        return true;
    }
    for (FireStation* f : fireStations)
        if (f->getTotalFireTrucks() >= e.getFireTrucksNeeded())
            return false;
    return true;
}

// Try to assign ONE service of an emergency right now (same matching as
// nexus.cpp: nearest suitable hospital / station by Dijkstra).
// Returns true if the service is settled ("assigned", or "unavailable" when it
// can never be served), false if it has to keep waiting.
bool tryAssignService(
    int kind,
    int index,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    Emergency &e = emergencies[index];
    ServiceAssignment &s = states[index].service[kind];
    Route route;

    if (kind == AMBULANCE)
    {
        // every ambulance is sent by the central control unit
        Hospital* hospital = centralControl.dispatchAmbulances(e, hospitals, route);
        if (hospital != nullptr)
        {
            s.state = "assigned";
            s.provider = hospital->getName();
            s.dispatchedBy = centralControl.getName();
            s.route = route;
            return true;
        }

        // offline: the request waits until the control unit is back online
        if (!centralControl.isOnline())
            return false;
    }
    else if (kind == POLICE)
    {
        PoliceStation* station = findPolice(e, policeStations, route);
        if (station != nullptr)
        {
            station->assignPolice(e);
            s.state = "assigned";
            s.provider = station->getName();
            s.route = route;
            return true;
        }
    }
    else
    {
        FireStation* station = findFire(e, fireStations, route);
        if (station != nullptr)
        {
            station->assignFireTruck(e);
            s.state = "assigned";
            s.provider = station->getName();
            s.route = route;
            return true;
        }
    }

    if (serviceImpossible(kind, e, hospitals, policeStations, fireStations))
    {
        s.state = "unavailable";
        return true;
    }
    return false;
}

// Goes through the waiting emergencies from highest priority to lowest.
//  - Each service is assigned as soon as a unit is free.
//  - A service that has to keep waiting BLOCKS that service for every lower
//    priority emergency, so nobody jumps ahead of a higher priority emergency
//    that is waiting for the same kind of unit. Other kinds of units are not blocked.
// Emergencies that still wait go back into the priority queue.
// Returns the emergencies that changed during this pass.
vector<int> runQueue(
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    vector<int> order;
    while (!pq.empty())
    {
        order.push_back(-pq.top().second);
        pq.pop();
    }

    bool blocked[3] = {false, false, false};
    vector<int> changed;

    for (int index : order)
    {
        EmergencyState &st = states[index];
        if (st.closed)
            continue;

        bool changedHere = false;
        bool stillWaiting = false;

        for (int kind = 0; kind < 3; kind++)
        {
            if (st.service[kind].state != "waiting")
                continue;

            if (!blocked[kind] &&
                tryAssignService(kind, index, hospitals, policeStations, fireStations))
            {
                changedHere = true;
                continue;
            }

            blocked[kind] = true;
            stillWaiting = true;
        }

        if (changedHere)
            changed.push_back(index);

        if (stillWaiting)
            pq.push({emergencies[index].getPriorityScore(), -index});
    }
    return changed;
}

// The emergency is over: every unit it was using goes back.
void releaseEmergency(
    int index,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    EmergencyState &st = states[index];
    Emergency &e = emergencies[index];

    for (int kind = 0; kind < 3; kind++)
    {
        ServiceAssignment &s = st.service[kind];
        if (s.state != "assigned")
            continue;

        if (kind == AMBULANCE)
        {
            Hospital* h = lookupHospital(hospitals, s.provider);
            centralControl.recallAmbulances(h, e);
        }
        else if (kind == POLICE)
        {
            PoliceStation* p = lookupPolice(policeStations, s.provider);
            if (p != nullptr) p->releasePolice(e);
        }
        else
        {
            FireStation* f = lookupFire(fireStations, s.provider);
            if (f != nullptr) f->releaseFireTruck(e);
        }
    }

    st.closed = true;
}

// ============================================================
//  JSON helpers (hand written, no external library needed)
// ============================================================
string jsonEscape(const string &s)
{
    string out;
    for (char c : s)
    {
        switch (c)
        {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;
        }
    }
    return out;
}

string jsonStr(const string &s)
{
    return "\"" + jsonEscape(s) + "\"";
}

string fixed2(double value)
{
    ostringstream out;
    out << fixed << setprecision(2) << value;
    return out.str();
}

// code: INVALID (bad input), NOT_FOUND, CONFLICT (e.g. duplicate name, still in use)
string errorJson(const string &message, const string &code = "INVALID")
{
    return "{\"ok\":false,\"code\":" + jsonStr(code) +
           ",\"error\":" + jsonStr(message) + "}";
}

string emergencyToJson(Emergency &e)
{
    ostringstream out;
    out << "{"
        << "\"type\":" << jsonStr(e.getEmergencyType()) << ","
        << "\"location\":" << jsonStr(e.getLocation()) << ","
        << "\"areaName\":" << jsonStr(getAreaName(e.getLocation())) << ","
        << "\"injuredPeople\":" << e.getInjuredPeople() << ","
        << "\"ambulancesNeeded\":" << e.getAmbulancesNeeded() << ","
        << "\"policeNeeded\":" << e.getPoliceNeeded() << ","
        << "\"fireTrucksNeeded\":" << e.getFireTrucksNeeded() << ","
        << "\"priorityScore\":" << e.getPriorityScore() << ","
        << "\"severityLevel\":" << e.getSeverityLevel()
        << "}";
    return out.str();
}

// one decimal, rounded the way JavaScript's toFixed(1) does it (a tie goes up),
// so the distance reads the same here and in the frontend
string fixed1(double value)
{
    char buf[80];
    snprintf(buf, sizeof(buf), "%.25f", value);
    string t = buf;
    size_t dot = t.find('.');
    long tenths = stol(t.substr(0, dot)) * 10 + (t[dot + 1] - '0');
    if (t[dot + 2] >= '5')
        tenths++;
    return to_string(tenths / 10) + "." + to_string(tenths % 10);
}

// "route":[...],"routeAreas":[...],"distanceKm":x,"totalSeconds":n, ...
// Same numbers the frontend shows: distance to 1 decimal, times in whole seconds,
// at least 1 minute for a trip and 3 minutes when the station is at the scene.
string routeFieldsToJson(const Route &route)
{
    string nodes = "[";
    string areas = "[";
    for (size_t i = 0; i < route.path.size(); i++)
    {
        if (i > 0)
        {
            nodes += ",";
            areas += ",";
        }
        nodes += jsonStr(route.path[i]);
        areas += jsonStr(getAreaName(route.path[i]));
    }
    nodes += "]";
    areas += "]";

    long baseSeconds = 0, delaySeconds = 0, totalSeconds = 0;
    if (route.found)
    {
        baseSeconds = lround(route.baseTime);
        delaySeconds = lround(max(0.0, route.time - route.baseTime));
        totalSeconds = route.isOnSite
            ? ON_SITE_SECONDS
            : max((long)MIN_TRAVEL_SECONDS, lround(route.time));
    }

    return "\"route\":" + nodes +
           ",\"routeAreas\":" + areas +
           ",\"distanceKm\":" + fixed1(route.distanceKm) +
           ",\"baseTimeSeconds\":" + to_string(baseSeconds) +
           ",\"trafficDelaySeconds\":" + to_string(delaySeconds) +
           ",\"totalSeconds\":" + to_string(totalSeconds) +
           ",\"jammedSegmentCount\":" + to_string(route.jammedSegments) +
           ",\"isOnSite\":" + (route.isOnSite ? "true" : "false");
}

string assignmentToJson(const ServiceAssignment &a)
{
    ostringstream out;
    out << "{"
        << "\"unitsRequired\":" << a.unitsRequired << ","
        << "\"state\":" << jsonStr(a.state) << ","
        << "\"provider\":" << (a.provider.empty() ? "null" : jsonStr(a.provider)) << ","
        << "\"dispatchedBy\":" << (a.dispatchedBy.empty() ? "null" : jsonStr(a.dispatchedBy)) << ","
        << routeFieldsToJson(a.route)
        << "}";
    return out.str();
}

// one emergency with the current state of each of its services
string stateToJson(int index)
{
    EmergencyState &st = states.at(index);
    return "{\"engineId\":" + to_string(index) +
           ",\"emergency\":" + emergencyToJson(emergencies.at(index)) +
           ",\"services\":{\"ambulance\":" + assignmentToJson(st.service[AMBULANCE]) +
           ",\"police\":" + assignmentToJson(st.service[POLICE]) +
           ",\"fire\":" + assignmentToJson(st.service[FIRE]) + "}}";
}

// the emergencies a command changed (skip = the one the command is about)
string updatesToJson(const vector<int> &changed, int skip = -1)
{
    string out = "[";
    bool first = true;
    for (int index : changed)
    {
        if (index == skip) continue;
        if (!first) out += ",";
        first = false;
        out += stateToJson(index);
    }
    return out + "]";
}

// ============================================================
//  Command handlers
// ============================================================
const int MAX_PEOPLE = 100000;   // keep in sync with utils/cppEngine.js

bool isKnownNode(const string &name)
{
    return nodeIndex.find(name) != nodeIndex.end();
}

string handleAdd(
    istringstream &in,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string type, location;
    int injured;

    if (!(in >> type >> injured >> location))
        return errorJson("Usage: ADD <type> <people> <locationNode>");

    if (type != "medical" && type != "accident" && type != "fire" &&
        type != "police" && type != "other")
        return errorJson("Invalid emergency type: " + type);

    if (injured < 1 || injured > MAX_PEOPLE)
        return errorJson("people must be between 1 and " + to_string(MAX_PEOPLE));

    if (!isKnownNode(location))
        return errorJson("Unknown location node: " + location);

    int index = addEmergency(type, injured, location);

    // dispatch straight away if units are free, otherwise it waits in the queue
    vector<int> changed = runQueue(hospitals, policeStations, fireStations);

    // "state" = the new emergency, "updates" = any OTHER emergency that changed
    return "{\"ok\":true,\"engineId\":" + to_string(index) +
           ",\"state\":" + stateToJson(index) +
           ",\"updates\":" + updatesToJson(changed, index) + "}";
}

string handleQueue()
{
    // copy the queue so we can read it in order without removing anything
    priority_queue<pair<int, int>> copy = pq;

    string items = "[";
    bool first = true;
    int position = 0;
    while (!copy.empty())
    {
        int index = -copy.top().second;
        copy.pop();

        if (states.at(index).closed)
            continue;

        position++;
        if (!first) items += ",";
        first = false;

        // stateToJson(...) starts with "{", so the position is added in front
        items += "{\"position\":" + to_string(position) + "," + stateToJson(index).substr(1);
    }
    items += "]";

    return "{\"ok\":true,\"queue\":" + items + "}";
}

// run the queue again (normally this already happens on every change)
string handleDispatch(
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    vector<int> changed = runQueue(hospitals, policeStations, fireStations);
    return "{\"ok\":true,\"updates\":" + updatesToJson(changed) + "}";
}

string handleRelease(
    istringstream &in,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    int index;
    if (!(in >> index))
        return errorJson("Usage: RELEASE <engineId>");

    if (index < 0 || index >= (int)states.size())
        return errorJson("Unknown emergency: " + to_string(index), "NOT_FOUND");

    if (!states[index].closed)
        releaseEmergency(index, hospitals, policeStations, fireStations);

    // the freed units go to whoever is waiting, highest priority first
    vector<int> changed = runQueue(hospitals, policeStations, fireStations);
    return "{\"ok\":true,\"updates\":" + updatesToJson(changed) + "}";
}

string urlDecode(const string &s);   // defined with the hospital / station commands below

// the control unit + the whole ambulance fleet it controls
string controlUnitToJson(vector<Hospital*> &hospitals)
{
    int totalAmbulances = 0, availableAmbulances = 0, totalBeds = 0, availableBeds = 0;
    for (Hospital* h : hospitals)
    {
        totalAmbulances += h->getTotalAmbulances();
        availableAmbulances += h->getAvailableAmbulances();
        totalBeds += h->getTotalBeds();
        availableBeds += h->getAvailableBeds();
    }

    string loc = centralControl.getLocation();

    return "{\"name\":" + jsonStr(centralControl.getName()) +
           ",\"location\":" + jsonStr(loc) +
           ",\"area\":" + jsonStr(getAreaName(loc)) +
           ",\"online\":" + (centralControl.isOnline() ? "true" : "false") +
           ",\"ambulanceDispatches\":" + to_string(centralControl.getAmbulanceDispatches()) +
           ",\"fleet\":{\"hospitals\":" + to_string(hospitals.size()) +
           ",\"totalAmbulances\":" + to_string(totalAmbulances) +
           ",\"availableAmbulances\":" + to_string(availableAmbulances) +
           ",\"busyAmbulances\":" + to_string(totalAmbulances - availableAmbulances) +
           ",\"totalBeds\":" + to_string(totalBeds) +
           ",\"availableBeds\":" + to_string(availableBeds) + "}}";
}

string handleControl(vector<Hospital*> &hospitals)
{
    return "{\"ok\":true,\"controlUnit\":" + controlUnitToJson(hospitals) + "}";
}

// switching the unit back on (or moving it) runs the queue, so the ambulance
// requests that were waiting go out straight away
string handleControlSet(
    istringstream &in,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string name, location;
    int online;

    if (!(in >> name >> location >> online))
        return errorJson("Usage: CONTROL_SET <name> <node> <online 0|1>");

    name = urlDecode(name);

    if (name.empty())
        return errorJson("The control unit needs a name");
    if (!isKnownNode(location))
        return errorJson("Unknown location node: " + location);
    if (online != 0 && online != 1)
        return errorJson("online must be 0 or 1");

    centralControl.setName(name);
    centralControl.setLocation(location);
    centralControl.setOnline(online == 1);

    vector<int> changed = runQueue(hospitals, policeStations, fireStations);
    return "{\"ok\":true,\"controlUnit\":" + controlUnitToJson(hospitals) +
           ",\"updates\":" + updatesToJson(changed) + "}";
}

string handleRoute(istringstream &in)
{
    string start, end, vehicle;
    if (!(in >> start >> end >> vehicle))
        return errorJson("Usage: ROUTE <startNode> <endNode> <vehicle>");

    if (!isKnownNode(start))
        return errorJson("Unknown node: " + start);
    if (!isKnownNode(end))
        return errorJson("Unknown node: " + end);
    if (vehicle != "ambulance" && vehicle != "police" && vehicle != "fire")
        return errorJson("Invalid vehicle: " + vehicle);

    Route route = dijkstra(start, end, vehicle);

    if (!route.found)
        return "{\"ok\":true,\"found\":false}";

    return "{\"ok\":true,\"found\":true,\"vehicle\":" + jsonStr(vehicle) +
           "," + routeFieldsToJson(route) + "}";
}

// the traffic the way the frontend stores it: { "<road id>": vehicles on the road }
string trafficObjectToJson()
{
    string out = "{";
    bool first = true;
    for (auto &x : roadLoad)
    {
        if (!first) out += ",";
        first = false;
        out += jsonStr(x.first) + ":" + to_string(x.second);
    }
    return out + "}";
}

string handleTraffic()
{
    return "{\"ok\":true,\"traffic\":" + trafficObjectToJson() + "}";
}

// TRAFFIC_SET <roadId>=<vehicles> ...   replaces the whole traffic.
// Ids that are not roads of this map are ignored.
string handleTrafficSet(istringstream &in)
{
    map<string, int> next;
    string token;

    while (in >> token)
    {
        size_t eq = token.find('=');
        if (eq == string::npos)
            return errorJson("Usage: TRAFFIC_SET <roadId>=<vehicles> ...");

        string id = token.substr(0, eq);
        string value = token.substr(eq + 1);

        if (roadCapacity.find(id) == roadCapacity.end())
            continue;

        if (value.empty() || value.size() > 9 ||
            value.find_first_not_of("0123456789") != string::npos)
            return errorJson("Invalid vehicle count for road " + id);

        next[id] = stoi(value);
    }

    roadLoad = next;
    return "{\"ok\":true,\"roads\":" + to_string(next.size()) + "}";
}

string roadToJson(const CityRoad &r);   // defined just below

// TRAFFIC_RANDOM [seed]   the city's starting traffic: every road gets a random load.
// About 72% of the roads are free, 10% at capacity, 8% lightly, 6% medium and 4%
// heavily over capacity; major roads are a little busier. A seed makes it repeatable.
string handleTrafficRandom(istringstream &in)
{
    long seed;
    mt19937 rng;
    if (in >> seed)
        rng.seed((unsigned)seed);
    else
        rng.seed(random_device{}());

    uniform_real_distribution<double> unit(0.0, 1.0);
    map<string, int> next;

    for (int i = 0; i < CITY_ROAD_COUNT; i++)
    {
        const CityRoad &r = CITY_ROADS[i];
        double roll = unit(rng);
        double ratio;

        if (roll < 0.72)      ratio = 0.1 + unit(rng) * 0.75;    // free
        else if (roll < 0.82) ratio = 0.9 + unit(rng) * 0.1;     // at capacity
        else if (roll < 0.9)  ratio = 1.02 + unit(rng) * 0.13;   // light
        else if (roll < 0.96) ratio = 1.16 + unit(rng) * 0.18;   // medium
        else                  ratio = 1.36 + unit(rng) * 0.24;   // heavy

        if (r.major && ratio < 1)
            ratio += unit(rng) * 0.15;

        next[r.id] = (int)floor(ratio * r.capacity + 0.5);
    }

    roadLoad = next;
    return "{\"ok\":true,\"roads\":" + to_string(next.size()) +
           ",\"traffic\":" + trafficObjectToJson() + "}";
}

// TRAFFIC_ROAD <roadId> <level> [ratio]   set the traffic of ONE road.
// A level uses its preset load (free 15%, at capacity 100%, light 110%, medium
// 125%, heavy 150% of the road's capacity); "custom" takes the ratio itself.
string handleTrafficRoad(istringstream &in)
{
    string id, level;
    if (!(in >> id >> level))
        return errorJson("Usage: TRAFFIC_ROAD <roadId> <level> [ratio]");

    auto cap = roadCapacity.find(id);
    if (cap == roadCapacity.end())
        return errorJson("Unknown road: " + id, "NOT_FOUND");

    double ratio;
    if (level == "custom")
    {
        if (!(in >> ratio) || !isfinite(ratio))
            return errorJson("custom needs a ratio, e.g. 1.2 for 120% of the road's capacity");
        ratio = max(0.0, min(ratio, MAX_TRAFFIC_RATIO));
    }
    else
    {
        const TrafficLevelInfo* info = findTrafficLevel(level);
        if (info == nullptr)
            return errorJson("level must be one of: free, full, light, medium, heavy, custom");
        ratio = info->presetRatio;
    }

    roadLoad[id] = max(0, (int)floor(ratio * cap->second + 0.5));

    for (int i = 0; i < CITY_ROAD_COUNT; i++)
        if (id == CITY_ROADS[i].id)
            return "{\"ok\":true,\"road\":" + roadToJson(CITY_ROADS[i]) + "}";

    return errorJson("Unknown road: " + id, "NOT_FOUND");
}

// REROUTE   The traffic changed: every unit that was sent keeps its station but
// takes the fastest route under the NEW traffic. Returns the emergencies whose
// route or ETA changed. (The backend keeps each unit's progress, so a unit that is
// half way is still half way on the new route.)
string handleReroute()
{
    vector<int> changed;
    const char* vehicles[3] = {"ambulance", "police", "fire"};

    for (int index = 0; index < (int)states.size(); index++)
    {
        EmergencyState &st = states[index];
        if (st.closed)
            continue;

        bool changedHere = false;
        for (int kind = 0; kind < 3; kind++)
        {
            ServiceAssignment &s = st.service[kind];
            if (s.state != "assigned" || !s.route.found || s.route.path.empty())
                continue;

            Route fresh = dijkstra(s.route.path.front(), emergencies[index].getLocation(), vehicles[kind]);
            if (!fresh.found)
                continue;

            if (fresh.path != s.route.path || lround(fresh.time) != lround(s.route.time))
            {
                s.route = fresh;
                changedHere = true;
            }
        }
        if (changedHere)
            changed.push_back(index);
    }

    return "{\"ok\":true,\"updates\":" + updatesToJson(changed) + "}";
}

// one road with its live traffic: load, ratio, level, label, colour, slowdown
string roadToJson(const CityRoad &r)
{
    double ratio = roadRatio(r.id, r.capacity);
    auto load = roadLoad.find(r.id);
    string level = trafficLevel(ratio);
    const TrafficLevelInfo* info = findTrafficLevel(level);

    return "{\"id\":" + jsonStr(r.id) +
           ",\"from\":" + jsonStr(r.from) +
           ",\"to\":" + jsonStr(r.to) +
           ",\"weight\":" + to_string(r.weight) +
           ",\"distanceKm\":" + fixed2(r.weight * KM_PER_WEIGHT_UNIT) +
           ",\"capacity\":" + to_string(r.capacity) +
           ",\"load\":" + to_string(load == roadLoad.end() ? 0 : load->second) +
           ",\"ratio\":" + fixed2(ratio) +
           ",\"level\":" + jsonStr(level) +
           ",\"levelLabel\":" + jsonStr(info ? info->label : level) +
           ",\"color\":" + (trafficColor(ratio).empty() ? string("null") : jsonStr(trafficColor(ratio))) +
           ",\"speedFactor\":" + fixed2(speedFactorForRatio(ratio)) +
           ",\"major\":" + (r.major ? "true" : "false") +
           ",\"shortcut\":" + (r.shortcut ? "true" : "false") + "}";
}

// the traffic levels the frontend offers on a road, and the slider's limit
string trafficLevelsToJson()
{
    string out = "[";
    for (int i = 0; i < TRAFFIC_LEVEL_COUNT; i++)
    {
        const TrafficLevelInfo &l = TRAFFIC_LEVEL_INFO[i];
        if (i > 0) out += ",";
        string color = trafficColor(l.presetRatio);
        out += "{\"key\":" + jsonStr(l.key) +
               ",\"label\":" + jsonStr(l.label) +
               ",\"ratio\":" + fixed2(l.presetRatio) +
               ",\"color\":" + (color.empty() ? string("null") : jsonStr(color)) + "}";
    }
    return out + "]";
}

// the whole map: nodes, roads with their live traffic, and the geo settings
string handleCity()
{
    string nodes = "[";
    for (int i = 0; i < CITY_NODE_COUNT; i++)
    {
        const CityNode &n = CITY_NODES[i];
        if (i > 0) nodes += ",";
        nodes += "{\"id\":" + jsonStr(n.id) +
                 ",\"name\":" + jsonStr(n.name) +
                 ",\"x\":" + to_string(n.x) +
                 ",\"y\":" + to_string(n.y) +
                 ",\"kind\":" + jsonStr(n.kind) +
                 ",\"stationType\":" + jsonStr(n.stationType) + "}";
    }
    nodes += "]";

    string roads = "[";
    for (int i = 0; i < CITY_ROAD_COUNT; i++)
    {
        if (i > 0) roads += ",";
        roads += roadToJson(CITY_ROADS[i]);
    }
    roads += "]";

    return "{\"ok\":true" +
           string(",\"geo\":{\"refX\":") + to_string(MAP_REF_X) +
           ",\"refY\":" + to_string(MAP_REF_Y) +
           ",\"refLat\":" + to_string(MAP_REF_LAT) +
           ",\"refLng\":" + to_string(MAP_REF_LNG) +
           ",\"latPerPx\":" + to_string(MAP_LAT_PER_PX) +
           ",\"lngPerPx\":" + to_string(MAP_LNG_PER_PX) + "}" +
           ",\"nodes\":" + nodes +
           ",\"roads\":" + roads +
           ",\"trafficLevels\":" + trafficLevelsToJson() +
           ",\"maxTrafficRatio\":" + fixed2(MAX_TRAFFIC_RATIO) + "}";
}

// ============================================================
//  Hospitals + stations: read / create / update / delete
//  (a station is a "resource": police jeeps or fire trucks)
// ============================================================
const int MAX_FACILITY_COUNT = 1000;   // beds, ambulances, units; keep in sync with utils/cppEngine.js

// names arrive percent-encoded ("City%20Care") so they can contain spaces
string urlDecode(const string &s)
{
    string out;
    for (size_t i = 0; i < s.size(); i++)
    {
        if (s[i] == '%' && i + 2 < s.size() &&
            isxdigit((unsigned char)s[i + 1]) &&
            isxdigit((unsigned char)s[i + 2]))
        {
            out += (char)stoi(s.substr(i + 1, 2), nullptr, 16);
            i += 2;
        }
        else
        {
            out += s[i];
        }
    }
    return out;
}

Hospital* lookupHospital(vector<Hospital*> &hospitals, const string &name)
{
    for (Hospital* h : hospitals)
        if (h->getName() == name) return h;
    return nullptr;
}

PoliceStation* lookupPolice(vector<PoliceStation*> &stations, const string &name)
{
    for (PoliceStation* p : stations)
        if (p->getName() == name) return p;
    return nullptr;
}

FireStation* lookupFire(vector<FireStation*> &stations, const string &name)
{
    for (FireStation* f : stations)
        if (f->getName() == name) return f;
    return nullptr;
}

bool validCount(int value)
{
    return value >= 0 && value <= MAX_FACILITY_COUNT;
}

// available / busy (every unit is out on a job) / unavailable (switched off)
string stationStatus(bool outOfService, int availableUnits)
{
    if (outOfService) return "unavailable";
    if (availableUnits == 0) return "busy";
    return "available";
}

string hospitalToJson(Hospital *h)
{
    return "{\"name\":" + jsonStr(h->getName()) +
           ",\"location\":" + jsonStr(h->getLocation()) +
           ",\"area\":" + jsonStr(getAreaName(h->getLocation())) +
           ",\"totalAmbulances\":" + to_string(h->getTotalAmbulances()) +
           ",\"availableAmbulances\":" + to_string(h->getAvailableAmbulances()) +
           ",\"totalBeds\":" + to_string(h->getTotalBeds()) +
           ",\"availableBeds\":" + to_string(h->getAvailableBeds()) + "}";
}

string stationToJson(
    const string &type,
    const string &name,
    const string &location,
    int capacity,
    int availableUnits,
    bool outOfService)
{
    return "{\"name\":" + jsonStr(name) +
           ",\"type\":" + jsonStr(type) +
           ",\"location\":" + jsonStr(location) +
           ",\"area\":" + jsonStr(getAreaName(location)) +
           ",\"capacity\":" + to_string(capacity) +
           ",\"availableUnits\":" + to_string(availableUnits) +
           ",\"status\":" + jsonStr(stationStatus(outOfService, availableUnits)) + "}";
}

string policeToJson(PoliceStation *p)
{
    return stationToJson("police", p->getName(), p->getLocation(),
                         p->getTotalJeeps(), p->getAvailableJeeps(),
                         p->isOutOfService());
}

string fireToJson(FireStation *f)
{
    return stationToJson("fire", f->getName(), f->getLocation(),
                         f->getTotalFireTrucks(), f->getAvailableFireTrucks(),
                         f->isOutOfService());
}

string handleResources(
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string h = "[";
    for (size_t i = 0; i < hospitals.size(); i++)
    {
        if (i > 0) h += ",";
        h += hospitalToJson(hospitals[i]);
    }
    h += "]";

    string s = "[";
    bool first = true;
    for (PoliceStation* p : policeStations)
    {
        if (!first) s += ",";
        first = false;
        s += policeToJson(p);
    }
    for (FireStation* f : fireStations)
    {
        if (!first) s += ",";
        first = false;
        s += fireToJson(f);
    }
    s += "]";

    return "{\"ok\":true,\"hospitals\":" + h + ",\"stations\":" + s + "}";
}

// ---------- hospitals ----------

string handleHospitalAdd(
    istringstream &in,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string name, location;
    int beds, ambulances;

    if (!(in >> name >> location >> beds >> ambulances))
        return errorJson("Usage: HOSPITAL_ADD <name> <node> <beds> <ambulances>");

    name = urlDecode(name);

    if (!isKnownNode(location))
        return errorJson("Unknown location node: " + location);
    if (!validCount(beds) || !validCount(ambulances))
        return errorJson("beds and ambulances must be between 0 and " + to_string(MAX_FACILITY_COUNT));
    if (lookupHospital(hospitals, name) != nullptr)
        return errorJson("A hospital named '" + name + "' already exists", "CONFLICT");

    Hospital* h = new Hospital(name, ambulances, beds, location);
    hospitals.push_back(h);

    // new / bigger capacity may let waiting emergencies go
    vector<int> changed = runQueue(hospitals, policeStations, fireStations);
    return "{\"ok\":true,\"hospital\":" + hospitalToJson(h) +
           ",\"updates\":" + updatesToJson(changed) + "}";
}

string handleHospitalUpdate(
    istringstream &in,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string name, location;
    int beds, ambulances;

    if (!(in >> name >> location >> beds >> ambulances))
        return errorJson("Usage: HOSPITAL_UPDATE <name> <node> <beds> <ambulances>");

    name = urlDecode(name);

    Hospital* h = lookupHospital(hospitals, name);
    if (h == nullptr)
        return errorJson("Hospital not found: " + name, "NOT_FOUND");
    if (!isKnownNode(location))
        return errorJson("Unknown location node: " + location);
    if (!validCount(beds) || !validCount(ambulances))
        return errorJson("beds and ambulances must be between 0 and " + to_string(MAX_FACILITY_COUNT));

    if (!h->resize(ambulances, beds))
        return errorJson("Cannot reduce below the beds / ambulances currently in use", "CONFLICT");

    h->setLocation(location);

    // new / bigger capacity may let waiting emergencies go
    vector<int> changed = runQueue(hospitals, policeStations, fireStations);
    return "{\"ok\":true,\"hospital\":" + hospitalToJson(h) +
           ",\"updates\":" + updatesToJson(changed) + "}";
}

string handleHospitalDelete(istringstream &in, vector<Hospital*> &hospitals)
{
    string name;
    if (!(in >> name))
        return errorJson("Usage: HOSPITAL_DELETE <name>");

    name = urlDecode(name);

    for (size_t i = 0; i < hospitals.size(); i++)
    {
        if (hospitals[i]->getName() == name)
        {
            delete hospitals[i];
            hospitals.erase(hospitals.begin() + i);
            return "{\"ok\":true}";
        }
    }
    return errorJson("Hospital not found: " + name, "NOT_FOUND");
}

// ---------- stations (resources) ----------

string handleStationAdd(
    istringstream &in,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string type, name, location;
    int capacity, outOfService;

    if (!(in >> type >> name >> location >> capacity >> outOfService))
        return errorJson("Usage: STATION_ADD <police|fire> <name> <node> <units> <outOfService>");

    name = urlDecode(name);

    if (type != "police" && type != "fire")
        return errorJson("Invalid station type: " + type);
    if (!isKnownNode(location))
        return errorJson("Unknown location node: " + location);
    if (!validCount(capacity))
        return errorJson("units must be between 0 and " + to_string(MAX_FACILITY_COUNT));
    if (lookupPolice(policeStations, name) != nullptr ||
        lookupFire(fireStations, name) != nullptr)
        return errorJson("A resource named '" + name + "' already exists", "CONFLICT");

    if (type == "police")
    {
        PoliceStation* p = new PoliceStation(name, capacity, location);
        p->setOutOfService(outOfService != 0);
        policeStations.push_back(p);
        vector<int> changed = runQueue(hospitals, policeStations, fireStations);
        return "{\"ok\":true,\"resource\":" + policeToJson(p) +
               ",\"updates\":" + updatesToJson(changed) + "}";
    }

    FireStation* f = new FireStation(name, capacity, location);
    f->setOutOfService(outOfService != 0);
    fireStations.push_back(f);
    vector<int> changed = runQueue(hospitals, policeStations, fireStations);
    return "{\"ok\":true,\"resource\":" + fireToJson(f) +
           ",\"updates\":" + updatesToJson(changed) + "}";
}

string handleStationUpdate(
    istringstream &in,
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string name, location;
    int capacity, outOfService;

    if (!(in >> name >> location >> capacity >> outOfService))
        return errorJson("Usage: STATION_UPDATE <name> <node> <units> <outOfService>");

    name = urlDecode(name);

    PoliceStation* p = lookupPolice(policeStations, name);
    FireStation* f = (p == nullptr) ? lookupFire(fireStations, name) : nullptr;

    if (p == nullptr && f == nullptr)
        return errorJson("Resource not found: " + name, "NOT_FOUND");
    if (!isKnownNode(location))
        return errorJson("Unknown location node: " + location);
    if (!validCount(capacity))
        return errorJson("units must be between 0 and " + to_string(MAX_FACILITY_COUNT));

    if (p != nullptr)
    {
        if (!p->resize(capacity))
            return errorJson("Cannot reduce below the units currently in use", "CONFLICT");
        p->setLocation(location);
        p->setOutOfService(outOfService != 0);
        vector<int> changed = runQueue(hospitals, policeStations, fireStations);
        return "{\"ok\":true,\"resource\":" + policeToJson(p) +
               ",\"updates\":" + updatesToJson(changed) + "}";
    }

    if (!f->resize(capacity))
        return errorJson("Cannot reduce below the units currently in use", "CONFLICT");
    f->setLocation(location);
    f->setOutOfService(outOfService != 0);
    vector<int> changed = runQueue(hospitals, policeStations, fireStations);
    return "{\"ok\":true,\"resource\":" + fireToJson(f) +
           ",\"updates\":" + updatesToJson(changed) + "}";
}

string handleStationDelete(
    istringstream &in,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    string name;
    if (!(in >> name))
        return errorJson("Usage: STATION_DELETE <name>");

    name = urlDecode(name);

    for (size_t i = 0; i < policeStations.size(); i++)
    {
        if (policeStations[i]->getName() == name)
        {
            delete policeStations[i];
            policeStations.erase(policeStations.begin() + i);
            return "{\"ok\":true}";
        }
    }
    for (size_t i = 0; i < fireStations.size(); i++)
    {
        if (fireStations[i]->getName() == name)
        {
            delete fireStations[i];
            fireStations.erase(fireStations.begin() + i);
            return "{\"ok\":true}";
        }
    }
    return errorJson("Resource not found: " + name, "NOT_FOUND");
}

// removes every hospital and station (the backend then reloads them from MongoDB)
string handleFacilitiesClear(
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    for (Hospital* h : hospitals) delete h;
    for (PoliceStation* p : policeStations) delete p;
    for (FireStation* f : fireStations) delete f;
    hospitals.clear();
    policeStations.clear();
    fireStations.clear();
    return "{\"ok\":true}";
}

// ============================================================
//  main: build the city + built-in stations once, then serve commands
// ============================================================

// the built-in hospitals and stations from nexus.cpp
void loadDefaultFacilities(
    vector<Hospital*> &hospitals,
    vector<PoliceStation*> &policeStations,
    vector<FireStation*> &fireStations)
{
    hospitals =
    {
        new Hospital1(), new Hospital2(), new Hospital3(), new Hospital4(),
        new Hospital5(), new Hospital6(), new Hospital7(), new Hospital8()
    };
    policeStations =
    {
        new PoliceStation1(), new PoliceStation2(), new PoliceStation3(),
        new PoliceStation4(), new PoliceStation5()
    };
    fireStations =
    {
        new FireStation1(), new FireStation2(), new FireStation3()
    };
}

int main()
{
    buildCity();

    vector<Hospital*> hospitals;
    vector<PoliceStation*> policeStations;
    vector<FireStation*> fireStations;
    loadDefaultFacilities(hospitals, policeStations, fireStations);

    // tell the backend we are ready to receive commands
    cout << "{\"ready\":true}" << endl;

    string line;
    while (getline(cin, line))
    {
        if (!line.empty() && line.back() == '\r')
            line.pop_back();

        istringstream in(line);
        string command;
        in >> command;

        string response;

        if (command == "ADD")
            response = handleAdd(in, hospitals, policeStations, fireStations);
        else if (command == "QUEUE")
            response = handleQueue();
        else if (command == "DISPATCH")
            response = handleDispatch(hospitals, policeStations, fireStations);
        else if (command == "ROUTE")
            response = handleRoute(in);
        else if (command == "CITY")
            response = handleCity();
        else if (command == "CONTROL")
            response = handleControl(hospitals);
        else if (command == "CONTROL_SET")
            response = handleControlSet(in, hospitals, policeStations, fireStations);
        else if (command == "RELEASE")
            response = handleRelease(in, hospitals, policeStations, fireStations);
        else if (command == "TRAFFIC")
            response = handleTraffic();
        else if (command == "TRAFFIC_SET")
            response = handleTrafficSet(in);
        else if (command == "TRAFFIC_RANDOM")
            response = handleTrafficRandom(in);
        else if (command == "TRAFFIC_ROAD")
            response = handleTrafficRoad(in);
        else if (command == "REROUTE")
            response = handleReroute();
        else if (command == "RESOURCES")
            response = handleResources(hospitals, policeStations, fireStations);
        else if (command == "HOSPITAL_ADD")
            response = handleHospitalAdd(in, hospitals, policeStations, fireStations);
        else if (command == "HOSPITAL_UPDATE")
            response = handleHospitalUpdate(in, hospitals, policeStations, fireStations);
        else if (command == "HOSPITAL_DELETE")
            response = handleHospitalDelete(in, hospitals);
        else if (command == "STATION_ADD")
            response = handleStationAdd(in, hospitals, policeStations, fireStations);
        else if (command == "STATION_UPDATE")
            response = handleStationUpdate(in, hospitals, policeStations, fireStations);
        else if (command == "STATION_DELETE")
            response = handleStationDelete(in, policeStations, fireStations);
        else if (command == "FACILITIES_CLEAR")
            response = handleFacilitiesClear(hospitals, policeStations, fireStations);
        else if (command == "QUIT")
            break;
        else if (command.empty())
            continue;
        else
            response = errorJson("Unknown command: " + command);

        // endl flushes, so the backend gets the reply immediately
        cout << response << endl;
    }

    return 0;
}
