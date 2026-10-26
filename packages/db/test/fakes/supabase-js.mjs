// In-memory stand-in for @supabase/supabase-js, used by packages/db tests.
// A test installs table rows and RPC handlers, then inspects recorded calls.
const state = { calls: [], maxRows: Infinity, rpc: {}, tables: {} };

// `maxRows` mimics PostgREST's per-request row cap (1,000 on Supabase).
export function installFakeDatabase({ maxRows = Infinity, rpc = {}, tables = {} } = {}) {
  state.calls = [];
  state.maxRows = maxRows;
  state.rpc = rpc;
  state.tables = tables;
}

export function recordedRpcCalls(name) {
  return state.calls.filter((call) => call.rpc === name);
}

class FakeQuery {
  constructor(table) {
    this.filters = [];
    this.mode = "many";
    this.orderColumn = null;
    this.rangeFrom = 0;
    this.rangeTo = Infinity;
    this.table = table;
  }

  select() { return this; }
  limit() { return this; }

  order(column) {
    this.orderColumn = column;
    return this;
  }

  range(from, to) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  gte(column, value) {
    this.filters.push((row) => row[column] >= value);
    return this;
  }

  lte(column, value) {
    this.filters.push((row) => row[column] <= value);
    return this;
  }

  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  then(onFulfilled, onRejected) {
    let rows = (state.tables[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => filter(row)),
    );
    if (this.orderColumn) {
      const column = this.orderColumn;
      rows = [...rows].sort((left, right) => (left[column] < right[column] ? -1 : left[column] > right[column] ? 1 : 0));
    }
    rows = rows.slice(this.rangeFrom, this.rangeTo + 1).slice(0, state.maxRows);
    state.calls.push({ rows: rows.length, table: this.table });
    const data = this.mode === "maybeSingle" ? (rows[0] ?? null) : rows;
    return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
  }
}

export function createClient() {
  return {
    from: (table) => new FakeQuery(table),
    rpc: async (name, args) => {
      state.calls.push({ args, rpc: name });
      const handler = state.rpc[name];

      if (!handler) {
        return { data: null, error: { code: "TEST_UNEXPECTED_RPC", message: `Unexpected RPC ${name}` } };
      }

      return handler(args);
    },
  };
}
