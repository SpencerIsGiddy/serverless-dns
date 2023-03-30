/**
 * Generic utility functions, shared between all runtime.
 * Functions dependent on runtime apis of deno / node.js may not be put here,
 * but should be node.js or deno specific util files.
 *
 * @license
 * Copyright (c) 2021 RethinkDNS and its authors.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
// musn't import any non-std modules

export const fromBrowser = (ua) => ua && ua.startsWith("Mozilla/5.0");

export const jsonHeaders = () => ({ "Content-Type": "application/json" });

export const dnsHeaders = () => ({
  "Accept": "application/dns-message",
  "Content-Type": "application/dns-message",
});

export const corsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});

export const corsHeadersIfNeeded = (ua) => fromBrowser(ua) ? corsHeaders() : {};

export const browserHeaders = () => ({ ...jsonHeaders(), ...corsHeaders() });

export const dohHeaders = (ua = "Mozilla/5.0") => ({ ...dnsHeaders(), ...corsHeadersIfNeeded(ua) });

export const contentLengthHeader = (b) => ({
  "Content-Length": b && b.byteLength ? b.byteLength.toString() : "0",
});

export const concatHeaders = (...args) => Object.assign({}, ...args);

export const rxidHeader = (id) => ({ "x-rethinkdns-rxid": id });

export const rxidFromHeader = (h) => h && h.get ? h.get("x-rethinkdns-rxid") : null;

export const regionFromCf = (req) => req && req.cf ? req.cf.colo || "" : "";

export const copyHeaders = (request) => {
  if (!(request instanceof Request)) return new Map();

  const headers = new Map();
  request.headers.forEach((val, name) => headers.set(name, val));
  return headers;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const objOf = (map) => map.entries ? Object.fromEntries(map) : {};

export const timedOp = (op, ms, cleanup = () => {}) =>
  new Promise((resolve, reject) => {
    let timedout = false;
    const tid = setTimeout(() => {
      timedout = true;
      reject(new Error("timeout"));
    }, ms);

    try {
      op((out, ex) => {
        if (timedout) {
          cleanup(out);
          return;
        }

        clearTimeout(tid);

        if (ex) {
          cleanup(out);
          reject(ex);
        } else {
          resolve(out);
        }
      });
    } catch (e) {
      if (!timedout) reject(e);
    }
  });

// TODO: Use AbortSignal.timeout (supported on Node and Deno, too)?
// developers.cloudflare.com/workers/platform/changelog#2021-12-10
export function timedSafeAsyncOp(promisedOp, ms, defaultOp) {
  const timeoutPromise = new Promise((resolve, reject) => {
    const tid = setTimeout(() => {
      defaultOp()
        .then(resolve)
        .catch(reject);
    }, ms);
  });

  return Promise.race([promisedOp(), timeoutPromise]);
}

export function rand(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

export function rolldice(sides = 6) {
  return rand(1, sides + 1);
}

export function uid(prefix = "") {
  return prefix + (Math.random() + 1).toString(36).slice(1);
}

export function xid() {
  const hi = vmid();
  const lo = uid();
  return hi + lo;
}

export function uidFromXidOrRxid(id) {
  if (emptyString(id)) return "";

  const uidStartChar = id.lastIndexOf(".");
  const rxidEndChar = id.lastIndexOf("]");
  const p = uidStartChar;
  const q = rxidEndChar < 0 ? id.length : rxidEndChar;

  if (p < 0 || p >= id.length - 1 || q <= p) return "";

  return id.slice(p + 1, q);
}

let _vmid = "0";
export function vmid() {
  if (_vmid === "0") _vmid = uid().slice(1);
  return _vmid;
}

export function taskBox(fn) {
  setTimeout(() => safeBox(fn), 0);
}

const taskboxPromise = { p: Promise.resolve() };
export function microtaskBox(fns, arg) {
  let enqueue = null;
  if (typeof queueMicrotask === "function") {
    enqueue = queueMicrotask;
  } else {
    enqueue = taskboxPromise.p.then.bind(taskboxPromise.p);
  }

  enqueue(() => safeBox(fns, arg));
}

export function safeBox(fns, arg) {
  if (typeof fns === "function") {
    fns = [fns];
  }

  const r = [];
  if (!isIterable(fns)) {
    return r;
  }

  for (const f of fns) {
    if (typeof f !== "function") {
      r.push(null);
      continue;
    }
    try {
      r.push(f(arg));
    } catch (ignore) {
      r.push(null);
    }
  }

  return r;
}

export function isDohGetRequest(queryString) {
  return queryString && queryString.has("dns");
}
/**
 * @param {Request} req - Request
 * @return {Boolean}
 */
export function isDnsMsg(req) {
  return (
    req.headers.get("Accept") === "application/dns-message" ||
    req.headers.get("Content-Type") === "application/dns-message"
  );
}

export function mapOf(obj) {
  return new Map(Object.entries(obj));
}

export function isAlphaNumeric(str) {
  const regex = /^[a-zA-Z0-9]+$/;
  return regex.test(str);
}

export function isDNSName(str) {
  const regex = /^[a-zA-Z0-9.-]+$/;
  return regex.test(str);
}

export function strstr(str, start = 0, end = str.length) {
  if (emptyString(str)) return str;
  if (start >= str.length) return "";
  if (end <= start) return "";

  start = start < 0 ? 0 : start;
  end = end > str.length ? str.length : end;

  return str.slice(start, end);
}

export function emptySet(s) {
  if (!s) return true;
  if (s instanceof Set) return s.size <= 0;
  return true;
}

export function emptyString(str) {
  // treat false-y values as empty
  if (!str) return true;
  // check if str is indeed a str
  if (typeof str !== "string") return false;
  // if len(str) is 0, str is empty
  return str.trim().length === 0;
}

export function emptyArray(a) {
  // treat false-y values as empty
  if (!a) return true;
  // obj v arr: stackoverflow.com/a/2462810
  if (typeof a !== "object") return false;
  if (!a.hasOwnProperty("length")) return false;
  // len(a) === 0 is empty
  return a.length <= 0;
}

export function concatObj(...args) {
  return Object.assign(...args);
}

// stackoverflow.com/a/32108184
export function emptyObj(x) {
  // note: Object.keys type-errors when x is null / undefined
  if (!x) return true;
  return (
    Object.keys(x).length === 0 && Object.getPrototypeOf(x) === Object.prototype
  );
}

export function emptyMap(m) {
  if (!m) return true;
  // does not hold good on Deno
  // if (!m.__proto__.hasOwnProperty("size")) return true;
  return m.size === 0;
}

// stackoverflow.com/a/32538867
function isIterable(obj) {
  if (obj == null) return false;

  return typeof obj[Symbol.iterator] === "function";
}

export function respond204() {
  return new Response(null, {
    status: 204, // no content
    headers: corsHeaders(),
  });
}

export function respond400() {
  return new Response(null, {
    status: 400,
    statusText: "Bad Request",
    headers: dohHeaders(),
  });
}

export function respond401() {
  return new Response(null, {
    status: 401,
    statusText: "Authorization Required",
    headers: dohHeaders(),
  });
}

export function respond405() {
  return new Response(null, {
    status: 405,
    statusText: "Method Not Allowed",
    headers: dohHeaders(),
  });
}

export function respond408() {
  return new Response(null, {
    status: 408, // timeout
    headers: dohHeaders(),
  });
}

export function respond503() {
  return new Response(null, {
    status: 503, // unavailable
    headers: dohHeaders(),
  });
}

export function tkt48() {
  const t = new Uint8Array(48);
  crypto.getRandomValues(t);
  return t;
}

export function logger(...tags) {
  if (!log) return null;

  return log.withTags(...tags);
}

export function isPostRequest(req) {
  return req && !emptyString(req.method) && req.method.toUpperCase() === "POST";
}

export function isGetRequest(req) {
  return req && !emptyString(req.method) && req.method.toUpperCase() === "GET";
}

export function fromPath(strurl, re) {
  const empty = "";
  if (emptyString(strurl)) return empty;
  if (!(re instanceof RegExp)) {
    throw new Error(`invalid arg: ${re} must be RegExp`);
  }

function functionName(strurl, re) {
  const u = new URL(strurl);
  // ex: x.tld/1:a/b/l:c/ => ["", "1:a", "b", "l:c", ""]
  const p = u.pathname.split("/");
  for (const x of p) {
    // returns ["1:"] if the x matches the regex
    const m = x.match(re);
    if (m != null && m.length > 0) {
      // return the string after the prefix
      return x.slice(m[0].length);
    }
  }
  return empty;
}

export function isGatewayRequest(req) {
  if (!req || emptyString(req.url)) return false;

  const u = new URL(req.url);
  const paths = u.pathname.split("/");
  for (const p of paths) {
    if (isGatewayQuery(p)) return true;
  }
  return false;
}

export function isDnsQuery(p) {
  return p === "dns-query";
}

export function isGatewayQuery(p) {
  return p === "gateway";
}

function isNumeric4(str) {
  return /^\d+(\.\d+)*$/.test(str);
}

function isHex6(str) {
  return /^[a-f\d:.]+$/i.test(str);
}

function maybeIP6(str) {
  return str && str.split(":").length > 3 && isHex6(str);
}

function maybeIP4(str) {
  return str && str.split(".").length === 4 && isNumeric4(str);
}

// poorman's ip validation, don't rely for serious stuff
export function maybeIP(str) {
  return maybeIP4(str) || maybeIP6(str);
}

export function* domains(urlOrHost) {
  if (emptyString(urlOrHost)) return "";

  let hostname = urlOrHost;
  if (urlOrHost.indexOf(":") > -1 || urlOrHost.indexOf("/") > -1) {
    const u = new URL(urlOrHost);
    hostname = u.hostname;
  }

  const d = hostname.split(".");
  for (let i = 0; i < d.length; i++) {
    yield d.slice(i).join(".");
  }
}

export function tld(urlstr, upto = 2, d = ".") {
  if (emptyString(urlstr)) return "";
  // convert a domain-name of form x.y.tld to url http://x.y.tld
  if (!urlstr.includes("://")) urlstr = "http://" + urlstr;

  const u = new URL(urlstr);
  // todo: fails for domains like "gov.uk", "co.in" etc
  // see: publicsuffix.org/list/public_suffix_list.dat
  return u.hostname.split(".").slice(-upto).join(d);
}

export function bounds(n, min, max) {
  if (min > max) {
    const t = max;
    max = min;
    min = t;
  }
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function mkFetchEvent(r, ...fns) {
  if (emptyObj(r)) throw new Error("missing request");
  for (const f of fns) {
    if (f != null && typeof f !== "function") throw new Error("args mismatch");
  }
  // developer.mozilla.org/en-US/docs/Web/API/FetchEvent
  // developers.cloudflare.com/workers/runtime-apis/fetch-event
  // deno.land/manual/runtime/http_server_apis#http-requests-and-responses
  // a service-worker event, with properties: type and request; and methods:
  // respondWith(Response), waitUntil(Promise), passThroughOnException(void)
  return {
    type: "fetch",
    request: r,
    respondWith: fns[0] || stub("event.respondWith"),
    waitUntil: fns[1] || stub("event.waitUntil"),
    passThroughOnException: fns[2] || stub("event.passThroughOnException"),
  };
}

export function stub(...args) {
  return (...args) => {
    /* no-op */
  };
}

export function stubAsync(...args) {
  return async (...args) => {
    /* no-op */
  };
}
