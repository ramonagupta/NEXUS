// utils/events.js
// Server-Sent Events: lets the frontend get changes pushed to it instead of
// asking again and again. Clients connect to GET /api/events and receive:
//   event: emergency  -> one emergency that was created / changed
//   event: queue      -> [{ id, position }] for every emergency still waiting
//   event: resources  -> the resource summary (available / total)

const clients = new Set();

function stream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("retry: 3000\n\n");

  clients.add(res);
  req.on("close", () => clients.delete(res));
}

function publish(event, data) {
  const message = "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
  for (const client of clients) client.write(message);
}

function hasClients() {
  return clients.size > 0;
}

// a comment line now and then keeps the connection from timing out
setInterval(() => {
  for (const client of clients) client.write(": keep-alive\n\n");
}, 25000).unref();

module.exports = { stream, publish, hasClients };
