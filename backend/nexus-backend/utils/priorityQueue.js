function createPriorityQueue() {
  let items = [];

  function push(item) {
    items.push(item);

    items.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  function pop() {

    return items.shift();
  }

  function peek() {
    return items[0];
  }

  function isEmpty() {
    return items.length === 0;
  }

  function size() {
    return items.length;
  }

  function getAll() {
    return items;
  }

  return { push, pop, peek, isEmpty, size, getAll };
}

function calculatePriorityScore(severity, waitTimeMinutes) {

  const severityWeight = 20;

  const waitWeight = 1;

  return severity * severityWeight + waitTimeMinutes * waitWeight;
  
}

module.exports = { createPriorityQueue, calculatePriorityScore };
