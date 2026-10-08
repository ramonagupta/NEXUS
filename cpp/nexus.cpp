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
using namespace std;
class Emergency
{
private:
    int injuredPeople;
    string emergencyType;
    string location;

    int ambulancesNeeded;
    int policeNeeded;
    int fireTrucksNeeded;

    int priorityScore;

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
    }

    void calculateResources()
    {
        // 1 ambulance for every 3 injured people
        ambulancesNeeded = (injuredPeople + 2) / 3;

        if (emergencyType == "medical")
        {
            policeNeeded = 0;
            fireTrucksNeeded = 0;
        }
        else if (emergencyType == "police")
        {
            policeNeeded = 1;
            fireTrucksNeeded = 0;
        }
        else if (emergencyType == "fire")
        {
            policeNeeded = 0;
            fireTrucksNeeded = 1;
        }
    }

    void calculatePriorityScore()
    {
        priorityScore =
            injuredPeople * 5 +
            ambulancesNeeded * 3 +
            policeNeeded * 2 +
            fireTrucksNeeded * 2;
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
class Hospital
{
protected:
    string name;

    int totalAmbulances;
    int availableAmbulances;

    int totalBeds;
    int availableBeds;

public:

    Hospital(string n, int ambulances, int beds)
    {
        name = n;

        totalAmbulances = ambulances;
        availableAmbulances = ambulances;

        totalBeds = beds;
        availableBeds = beds;
    }

    string getName()
    {
        return name;
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

        cout << "\nHospital Assigned: "
             << name << endl;

        cout << "Ambulances Assigned: "
             << e.getAmbulancesNeeded() << endl;

        cout << "Beds Assigned: "
             << e.getInjuredPeople() << endl;
    }
};
class Hospital1 : public Hospital
{
public:
    Hospital1() : Hospital("H1", 8, 16) {}
};

class Hospital2 : public Hospital
{
public:
    Hospital2() : Hospital("H2", 8, 16) {}
};

class Hospital3 : public Hospital
{
public:
    Hospital3() : Hospital("H3", 3, 8) {}
};

class Hospital4 : public Hospital
{
public:
    Hospital4() : Hospital("H4", 3, 8) {}
};

class Hospital5 : public Hospital
{
public:
    Hospital5() : Hospital("H5", 5, 12) {}
};

class Hospital6 : public Hospital
{
public:
    Hospital6() : Hospital("H6", 5, 12) {}
};

class Hospital7 : public Hospital
{
public:
    Hospital7() : Hospital("H7", 5, 12) {}
};

class Hospital8 : public Hospital
{
public:
    Hospital8() : Hospital("H8", 5, 12) {}
};
class PoliceStation
{
protected:
    string name;

    int totalJeeps;
    int availableJeeps;

public:

    PoliceStation(string n, int jeeps)
    {
        name = n;

        totalJeeps = jeeps;
        availableJeeps = jeeps;
    }

    string getName()
    {
        return name;
    }

    bool canHandle(Emergency &e)
    {
        return e.getPoliceNeeded() <= availableJeeps;
    }

    void assignPolice(Emergency &e)
    {
        availableJeeps -= e.getPoliceNeeded();

        cout << "\nPolice Station Assigned: "
             << name << endl;

        cout << "Police Jeeps Assigned: "
             << e.getPoliceNeeded() << endl;
    }
};
class PoliceStation1 : public PoliceStation
{
public:
    PoliceStation1() : PoliceStation("P1", 2) {}
};

class PoliceStation2 : public PoliceStation
{
public:
    PoliceStation2() : PoliceStation("P2", 2) {}
};

class PoliceStation3 : public PoliceStation
{
public:
    PoliceStation3() : PoliceStation("P3", 2) {}
};

class PoliceStation4 : public PoliceStation
{
public:
    PoliceStation4() : PoliceStation("P4", 2) {}
};

class PoliceStation5 : public PoliceStation
{
public:
    PoliceStation5() : PoliceStation("P5", 2) {}
};
class FireStation
{
protected:
    string name;

    int totalFireTrucks;
    int availableFireTrucks;

public:

    FireStation(string n, int trucks)
    {
        name = n;

        totalFireTrucks = trucks;
        availableFireTrucks = trucks;
    }

    string getName()
    {
        return name;
    }

    bool canHandle(Emergency &e)
    {
        return e.getFireTrucksNeeded()
               <= availableFireTrucks;
    }

    void assignFireTruck(Emergency &e)
    {
        availableFireTrucks -= e.getFireTrucksNeeded();

        cout << "\nFire Station Assigned: "
             << name << endl;

        cout << "Fire Trucks Assigned: "
             << e.getFireTrucksNeeded() << endl;
    }
};
class FireStation1 : public FireStation
{
public:
    FireStation1() : FireStation("F1", 3) {}
};

class FireStation2 : public FireStation
{
public:
    FireStation2() : FireStation("F2", 3) {}
};

class FireStation3 : public FireStation
{
public:
    FireStation3() : FireStation("F3", 3) {}
};
struct Road
{
    double distance;
};

map<string, map<string, Road>> graph;
const int DEFAULT_TRAFFIC = 5;
const int NODE_CAPACITY = 20;
map<string, int> nodeTraffic;
void addNode(string name)
{
    nodeTraffic[name] = DEFAULT_TRAFFIC;
}
void addRoad(string a, string b, double distance)
{
    graph[a][b] = {distance};
    graph[b][a] = {distance};
}
void buildCity()
{
    double diagonal = sqrt(50.0);
    addNode("P1");
    addNode("H1");
    addNode("F1");
    addNode("P2");
    addNode("F2");
    addNode("P3");
    addNode("H2");
    addNode("H3");
    addNode("H4");
    addNode("P4");
    addNode("H5");
    addNode("H6");
    addNode("H7");
    addNode("P5");
    addNode("H8");
    addNode("F3");

    addRoad("P1", "H1", 5);
    addRoad("H1", "F1", 5);
    addRoad("F1", "P2", 5);
    addRoad("F2", "P3", 5);
    addRoad("P3", "H2", 5);
    addRoad("H2", "H3", 5);
    addRoad("H4", "P4", 5);
    addRoad("P4", "H5", 5);
    addRoad("H5", "H6", 5);
    addRoad("H7", "P5", 5);
    addRoad("P5", "H8", 5);
    addRoad("H8", "F3", 5);
    addRoad("P1", "F2", 5);
    addRoad("H1", "P3", 5);
    addRoad("F1", "H2", 5);
    addRoad("P2", "H3", 5);
    addRoad("F2", "H4", 5);
    addRoad("P3", "P4", 5);
    addRoad("H2", "H5", 5);
    addRoad("H3", "H6", 5);
    addRoad("H4", "H7", 5);
    addRoad("P4", "P5", 5);
    addRoad("H5", "H8", 5);
    addRoad("H6", "F3", 5);
    addRoad("H1", "H2", diagonal);
    addRoad("P3", "H5", diagonal);
    addRoad("P4", "H8", diagonal);
}
    string getAreaName(string node)
    {
        if (node == "P1") return "Rajpath Sector 1";
        if (node == "H1") return "Connaught Place";
        if (node == "F1") return "Karol Bagh Plaza";
        if (node == "P2") return "Lajpat Nagar";
        if (node == "F2") return "Chandni Station";
        if (node == "P3") return "Indiranagar Hub";
        if (node == "H2") return "Koramangala Station";
        if (node == "H3") return "Saket City Center";
        if (node == "H4") return "Salt Lake Sec 5";
        if (node == "P4") return "Hazratganj Station";
        if (node == "H5") return "Vasant Kunj Circle";
        if (node == "H6") return "Civil Lines";
        if (node == "H7") return "Malviya Nagar";
        if (node == "P5") return "Green Park";
        if (node == "H8") return "Model Town Square";
        if (node == "F3") return "Dwarka Sector";

        return "Unknown";
    }
    double getBaseSpeed(string vehicle)
    {
        if (vehicle == "ambulance")
            return 60;

        if (vehicle == "police")
            return 70;

        if (vehicle == "fire")
            return 50;

        return 50;
    }
    double getSpeed(string vehicle, double traffic)
    {
        double speed = getBaseSpeed(vehicle);

        double ratio =
            traffic / NODE_CAPACITY;
        if (ratio <= 0.30)
            return speed;
        else if (ratio <= 0.50)
            return speed * 0.80;
        else if (ratio <= 0.70)
            return speed * 0.60;
        else if (ratio <= 0.90)
            return speed * 0.45;
        else
            return speed * 0.30;
    }
    struct Route
    {
        bool found;
        double time;
        vector<string> path;
    };
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
        priority_queue<
            pair<double, string>,
            vector<pair<double, string>>,
            greater<pair<double, string>>
        > pq;
        pq.push({0, start});
        while (!pq.empty())
        {
            double currentTime =
                pq.top().first;

            string current =
                pq.top().second;

            pq.pop();
            if (currentTime > distance[current])
                continue;
            if (current == destination)
                break;
            for (auto &x : graph[current])
            {
                string next = x.first;
                double roadDistance =
                    x.second.distance;
                if (nodeTraffic[next] >= NODE_CAPACITY)
                    continue;
                double averageTraffic =
                    (nodeTraffic[current]
                    + nodeTraffic[next]) / 2.0;
                double speed =
                    getSpeed(
                        vehicle,
                        averageTraffic
                    );
                double time =
                    roadDistance / speed;
                double newTime =
                    currentTime + time;
                if (newTime < distance[next])
                {
                    distance[next] = newTime;
                    previous[next] = current;
                    pq.push({
                        newTime,
                        next
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
        return {
            true,
            distance[destination],
            path
        };
    }
    void showRoute(
        Route &route,
        string vehicle)
    {
        cout << "\nRoute for "<< vehicle<< ":\n";
        for (int i = 0;
             i < route.path.size();
             i++)
        {
            cout << route.path[i]<< " ("<< getAreaName(route.path[i])<< ")";
            if (i != route.path.size() - 1)
                cout << " -> ";
        }
        cout << endl;
        cout << fixed<< setprecision(2);
        cout << "Travel Time: "<< route.time * 60<< " minutes\n";
    }
    void addTraffic(
        vector<string> &path,
        int vehicles)
    {
        for (string node : path)
        {
            if (nodeTraffic[node] < NODE_CAPACITY)
            {
                nodeTraffic[node] += vehicles;
                if (nodeTraffic[node] > NODE_CAPACITY)
                {
                    nodeTraffic[node] =
                        NODE_CAPACITY;
                }
            }
        }
    }
    void showTraffic()
    {
        cout << "\n\nCurrent Traffic:\n";
        for (auto &x : nodeTraffic)
        {
            cout << x.first<< " ("<< getAreaName(x.first)<< ") : "<< x.second<< "/"<< NODE_CAPACITY<< " vehicles"<< endl;
        }
    }
    vector<Emergency> emergencies;
    priority_queue<pair<int, int>> pq;
    void addEmergency(
        string type,
        int injured,
        string location)
    {
        Emergency emergency(
            type,injured,location
        );
        emergency.calculateResources();
        emergency.calculatePriorityScore();
        emergencies.push_back(emergency);
        int index =
            emergencies.size() - 1;
        pq.push({
            emergency.getPriorityScore(),
            index
        });
    }
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
                    h->getName(),
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
                    p->getName(),
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
                    f->getName(),
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
    void processEmergency(
        Emergency &e,
        vector<Hospital*> &hospitals,
        vector<PoliceStation*> &policeStations,
        vector<FireStation*> &fireStations)
    {
        cout << "\n\n==============================";
        cout << "\nProcessing Emergency";
        cout << "\n==============================\n";
        cout << "Type: "
             << e.getEmergencyType()
             << endl;
        cout << "Location: "
             << e.getLocation()
             << " - "
             << getAreaName(e.getLocation())
             << endl;
        cout << "Injured People: "
             << e.getInjuredPeople()
             << endl;
        cout << "Priority Score: "
             << e.getPriorityScore()
             << endl;
        if (e.getAmbulancesNeeded() > 0)
        {
            Route route;
            Hospital* hospital =
                findHospital(
                    e,hospitals,route
                );
            if (hospital != nullptr)
            {
                showRoute(
                    route,
                    "ambulance"
                );
                hospital->assignHospital(e);
                addTraffic(
                    route.path,e.getAmbulancesNeeded()
                );
            }
            else
            {
                cout << "\nNo suitable hospital found.\n";
            }
        }
        if (e.getPoliceNeeded() > 0)
        {
            Route route;
            PoliceStation* station =
                findPolice(
                    e,policeStations,route
                );
            if (station != nullptr)
            {
                showRoute(
                    route,
                    "police jeep"
                );
                station->assignPolice(e);
                addTraffic(
                    route.path,
                    e.getPoliceNeeded()
                );
            }
            else
            {
                cout << "\nNo police station available.\n";
            }
        }
        if (e.getFireTrucksNeeded() > 0)
        {
            Route route;
            FireStation* station =
                findFire(
                    e,fireStations,route
                );
            if (station != nullptr)
            {
                showRoute(
                    route,
                    "fire truck"
                );
                station->assignFireTruck(e);
                addTraffic(
                    route.path,
                    e.getFireTrucksNeeded()
                );
            }
            else
            {
                cout << "\nNo fire station available.\n";
            }
        }
    }
    int main()
    {
        buildCity();
        Hospital1 h1;
        Hospital2 h2;
        Hospital3 h3;
        Hospital4 h4;
        Hospital5 h5;
        Hospital6 h6;
        Hospital7 h7;
        Hospital8 h8;
        vector<Hospital*> hospitals =
        {
            &h1, &h2, &h3, &h4,
            &h5, &h6, &h7, &h8
        };
        PoliceStation1 p1;
        PoliceStation2 p2;
        PoliceStation3 p3;
        PoliceStation4 p4;
        PoliceStation5 p5;
        vector<PoliceStation*> policeStations =
        {
            &p1, &p2, &p3, &p4, &p5
        };
        FireStation1 f1;
        FireStation2 f2;
        FireStation3 f3;
        vector<FireStation*> fireStations =
        {
            &f1, &f2, &f3
        };
        //TEST Cases
        addEmergency(
            "medical",7,"H3"
        );
        addEmergency(
            "fire",8,"P5"
        );
        addEmergency(
            "police",3,"H6"
        );
        showTraffic();
        while (!pq.empty())
        {
            int index =
                pq.top().second;
            pq.pop();
            Emergency &e =
                emergencies.at(index);
            processEmergency(
                e,
                hospitals,
                policeStations,
                fireStations
            );
            showTraffic();
        }
        return 0;
    }