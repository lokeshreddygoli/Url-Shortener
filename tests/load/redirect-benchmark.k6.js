import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    redirects: {
      executor: "constant-vus",
      vus: 20,
      duration: "15s",
      exec: "redirectFlow",
    },
    creates: {
      executor: "constant-vus",
      vus: 5,
      duration: "15s",
      exec: "createFlow",
    },
  },
  thresholds: {
    "http_req_duration{scenario:redirects}": ["p(95)<150"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3100";
const TEST_CODE = __ENV.TEST_CODE || "launch-26";

export function redirectFlow() {
  const res = http.get(`${BASE_URL}/${TEST_CODE}`, { redirects: 0 });
  check(res, {
    "status is 302": (r) => r.status === 302,
    "has Location header": (r) => Boolean(r.headers.Location),
  });
}

export function createFlow() {
  const payload = JSON.stringify({
    originalUrl: `https://example.com/k6/${Date.now()}-${__VU}-${__ITER}`,
  });
  const res = http.post(`${BASE_URL}/api/urls`, payload, {
    headers: { "Content-Type": "application/json" },
  });
  check(res, {
    "status is 201 or 429": (r) => r.status === 201 || r.status === 429,
  });
  sleep(0.1);
}
