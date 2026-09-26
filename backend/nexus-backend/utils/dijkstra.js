function buildGraph(nodes, roads) {
  const graph = {};


  nodes.forEach((node) => {

    graph[node._id.toString()] = []

  });


  roads.forEach((road) => {

    const from = road.fromNode.toString()

    const to = road.toNode.toString()


    graph[from].push({ to: to, distance: road.distance })


    if (road.twoWay) {

      graph[to].push({ to: from, distance: road.distance })

    }

  });

  return graph;
}

function findShortestPath(graph, startId, endId) {


  const distances = {};

  const previous = {};
  const visited = {};

  const unvisited = new Set(Object.keys(graph));



  unvisited.forEach((id) => {

    distances[id] = Infinity;

  });

  distances[startId] = 0;


  while (unvisited.size > 0) {


    let currentId = null;

    let smallestDistance = Infinity;


    unvisited.forEach((id) => {
    
      if (distances[id] < smallestDistance) {
    
        smallestDistance = distances[id];
    
        currentId = id;
      }
    });


    if (currentId === null) break;


   

    if (currentId === endId) break;


    
    unvisited.delete(currentId);
    
    visited[currentId] = true;

    
    const neighbours = graph[currentId] || [];
    
    neighbours.forEach((neighbour) => {
    
      if (visited[neighbour.to]) return;

    
      const newDistance = distances[currentId] + neighbour.distance;
    
      if (newDistance < distances[neighbour.to]) {
    
        distances[neighbour.to] = newDistance;
    
        previous[neighbour.to] = currentId;
    
      }
    
    });
  }


 
  
  const path = [];
  
  let step = endId;


  if (distances[endId] === Infinity) {
  
    return { path: [], totalDistance: null }; 
  
  }


  
  while (step) {
  
    path.unshift(step);
  
    step = previous[step];
  
  }


  
  return { path: path, totalDistance: distances[endId] };
}


module.exports = { buildGraph, findShortestPath };
