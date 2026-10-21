// tests/helpers.js
// Lets the tests run WITHOUT MongoDB: the Emergency and Traffic models are replaced by
// a tiny in-memory copy. The C++ engine, the services and the controllers are the real ones.

const path = require("path");
let nextId = 1;

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, cond]) => {
    if (cond && typeof cond === "object") {
      if ("$ne" in cond) return doc[key] !== cond.$ne;
      if ("$in" in cond) return cond.$in.includes(doc[key]);
    }
    return doc[key] === cond;
  });
}

function makeModel(defaults = {}) {
  const rows = [];
  class Doc {
    constructor(data) {
      Object.assign(this, JSON.parse(JSON.stringify(defaults)), data);
      this._id = String(nextId++);
      this.createdAt = new Date();
      this.updatedAt = new Date();
    }
    async save() { this.updatedAt = new Date(); return this; }
    markModified() {}
    toObject() { return JSON.parse(JSON.stringify(this), (k, v) => (k === "dispatchedAt" || k === "createdAt" || k === "updatedAt" || k === "resolvedAt") && v ? new Date(v) : v); }
  }
  return {
    rows,
    async create(data) { const d = new Doc(data); rows.push(d); return d; },
    async find(filter) { return rows.filter((d) => matches(d, filter)); },
    async findOne(filter) { return rows.find((d) => matches(d, filter)) || null; },
    async findById(id) { return rows.find((d) => d._id === String(id)) || null; },
    async findByIdAndDelete(id) { const i = rows.findIndex((d) => d._id === String(id)); if (i >= 0) rows.splice(i, 1); },
  };
}

function installFakeModels() {
  for (const [file, defaults] of [["Emergency", { assignments: {}, status: "pending", dispatchedAt: null }], ["Traffic", {}]]) {
    const resolved = require.resolve(path.join("..", "models", file));
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: makeModel(defaults) };
  }
}

// a fake Express response
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

// call a controller function the way Express would
async function call(fn, { body = {}, params = {}, query = {} } = {}) {
  const res = fakeRes();
  await fn({ body, params, query }, res);
  return res;
}

module.exports = { installFakeModels, call };
