# Load Testing Specification

**Author:** Murat (Test Architect)
**Created:** 2025-12-03
**Status:** Draft
**Issue:** #67

---

## Executive Summary

This specification defines the load testing strategy for Notez v1.0.0 stability validation. The goal is to verify the application handles real-world concurrent usage without degradation, validate rate limiting effectiveness, and establish performance baselines.

### Test Thresholds

| Tier | Concurrent Users | Purpose | Pass Criteria |
|------|------------------|---------|---------------|
| **Baseline** | 12 | Target homelab usage | p95 < 200ms |
| **Stress** | 50 | 4x safety margin | p95 < 500ms, no errors |
| **Breaking Point** | 100+ | Find ceiling | Document failure mode |

---

## Test Environment

### Local Test Setup

```
┌─────────────────────────────────────────────────────────────────┐
│                    Load Test Environment                         │
│                                                                 │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│   │     k6       │────▶│    Notez     │────▶│  PostgreSQL  │   │
│   │  (50 VUs)    │     │   Backend    │     │    Local     │   │
│   └──────────────┘     └──────────────┘     └──────────────┘   │
│                               │                                 │
│                               ▼                                 │
│                        ┌──────────────┐                         │
│                        │    MinIO     │                         │
│                        │   (Images)   │                         │
│                        └──────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

### Prerequisites

- Node.js 24
- PostgreSQL 16 running locally
- k6 installed (`brew install k6` or `choco install k6`)
- Notez backend running in production mode
- Seeded test data (see Data Setup)

### Data Setup

Before running tests, seed the database with realistic data:

```sql
-- Create test users (12 to match baseline tier)
-- Password: "<load-test-password>" for all
INSERT INTO "User" (id, username, email, "passwordHash", role)
SELECT
  gen_random_uuid(),
  'loadtest_' || generate_series,
  'loadtest_' || generate_series || '@test.local',
  '$2b$12$...', -- bcrypt hash of <load-test-password>
  'user'
FROM generate_series(1, 12);

-- Create 100 notes per user with varied content
-- Create 10 folders per user
-- Create 50 tags per user
-- Create 30 tasks per user
```

A seed script will be provided: `backend/scripts/seed-load-test.ts`

---

## Tooling Selection

### Recommended: k6

**Why k6:**
- JavaScript-based (familiar to the team)
- Excellent metrics and thresholds
- Can output to various formats (JSON, InfluxDB, etc.)
- Active community and documentation
- Lightweight and fast

**Installation:**
```bash
# macOS
brew install k6

# Windows
choco install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys ...
sudo apt-get update && sudo apt-get install k6
```

### Alternative: Artillery

If k6 doesn't fit, Artillery is a solid alternative:
```bash
npm install -g artillery
```

---

## Test Scenarios

### Scenario 1: Authentication Flow

**Purpose:** Validate login/logout under concurrent load, verify rate limiting

```javascript
// k6/scenarios/auth-flow.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    auth_baseline: {
      executor: 'constant-vus',
      vus: 12,
      duration: '2m',
    },
    auth_stress: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      startTime: '2m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const loginRes = http.post(`${__ENV.BASE_URL}/api/auth/login`, {
    username: `loadtest_${__VU % 12 + 1}`,
    password: '<load-test-password>',
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'has access token': (r) => r.json('accessToken') !== undefined,
  });

  if (loginRes.status === 200) {
    const token = loginRes.json('accessToken');

    // Simulate user session
    sleep(Math.random() * 3 + 1);

    // Logout
    http.post(`${__ENV.BASE_URL}/api/auth/logout`, null, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  sleep(1);
}
```

**Success Criteria:**
- Login p95 < 300ms
- No 500 errors
- Rate limiter triggers at 5 failed attempts per 15 minutes

---

### Scenario 2: Note CRUD Operations

**Purpose:** Validate core note operations under load

```javascript
// k6/scenarios/note-crud.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  scenarios: {
    crud_stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 12 },  // Ramp to baseline
        { duration: '3m', target: 12 },  // Hold baseline
        { duration: '1m', target: 50 },  // Ramp to stress
        { duration: '5m', target: 50 },  // Hold stress
        { duration: '1m', target: 0 },   // Ramp down
      ],
    },
  },
  thresholds: {
    'http_req_duration{operation:create}': ['p(95)<400'],
    'http_req_duration{operation:read}': ['p(95)<200'],
    'http_req_duration{operation:update}': ['p(95)<400'],
    'http_req_duration{operation:delete}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  // Login and return tokens for all VUs
  // ...
}

export default function (data) {
  const token = data.tokens[__VU % data.tokens.length];
  const headers = { Authorization: `Bearer ${token}` };

  group('Create Note', () => {
    const res = http.post(
      `${__ENV.BASE_URL}/api/notes`,
      JSON.stringify({
        title: `Load Test Note ${Date.now()}`,
        content: '<p>Test content for load testing...</p>',
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' }, tags: { operation: 'create' } }
    );
    check(res, { 'note created': (r) => r.status === 201 });
  });

  sleep(1);

  group('List Notes', () => {
    const res = http.get(`${__ENV.BASE_URL}/api/notes`, { headers, tags: { operation: 'read' } });
    check(res, { 'notes listed': (r) => r.status === 200 });
  });

  sleep(1);

  // Update and delete operations...
}
```

**Success Criteria:**
- Create p95 < 400ms
- Read p95 < 200ms
- Update p95 < 400ms
- Error rate < 1%

---

### Scenario 3: Search Performance

**Purpose:** Validate full-text search under concurrent queries

```javascript
// k6/scenarios/search.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const searchTerms = [
  'project', 'meeting', 'notes', 'todo', 'important',
  'deadline', 'review', 'update', 'task', 'complete'
];

export const options = {
  scenarios: {
    search_stress: {
      executor: 'constant-arrival-rate',
      rate: 100,           // 100 searches per second
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

  const res = http.get(`${__ENV.BASE_URL}/api/search?q=${term}`, {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });

  check(res, {
    'search successful': (r) => r.status === 200,
    'results returned': (r) => Array.isArray(r.json()),
  });
}
```

**Success Criteria:**
- Search p95 < 300ms
- Search p99 < 500ms
- No timeouts

---

### Scenario 4: Rate Limiter Validation

**Purpose:** Verify rate limiting works correctly under attack simulation

```javascript
// k6/scenarios/rate-limit.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    brute_force_simulation: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 20,  // Exceed the 5-attempt limit
    },
  },
};

export default function () {
  const res = http.post(`${__ENV.BASE_URL}/api/auth/login`, {
    username: 'admin',
    password: 'wrong_password_' + __ITER,
  });

  if (__ITER < 5) {
    check(res, { 'attempt allowed': (r) => r.status === 401 });
  } else {
    check(res, { 'rate limited': (r) => r.status === 429 });
  }
}
```

**Success Criteria:**
- First 5 attempts return 401
- 6th+ attempts return 429
- Rate limit resets after 15 minutes

---

### Scenario 5: Sustained Load (Soak Test)

**Purpose:** Detect memory leaks and degradation over time

```javascript
// k6/scenarios/soak.js
export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 25,           // 50% of stress threshold
      duration: '30m',   // Extended duration
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

// Mix of all operations: auth, CRUD, search
export default function () {
  // Randomly select operation type
  const ops = ['auth', 'crud', 'search'];
  const op = ops[Math.floor(Math.random() * ops.length)];

  switch (op) {
    case 'auth':
      // Login/logout cycle
      break;
    case 'crud':
      // Note operations
      break;
    case 'search':
      // Search queries
      break;
  }
}
```

**Success Criteria:**
- No performance degradation over 30 minutes
- Memory usage stable (no growth trend)
- No connection pool exhaustion

---

## Memory Leak Detection (#68)

### Methodology

1. **Baseline Measurement**
   ```bash
   # Start backend with memory profiling
   node --inspect backend/dist/index.js
   ```

2. **Heap Snapshots**
   - Take snapshot before test
   - Take snapshot after 10 minutes
   - Take snapshot after 30 minutes
   - Compare retained memory

3. **Process Monitoring**
   ```bash
   # Monitor during soak test
   watch -n 5 'ps aux | grep node | grep notez'
   ```

4. **Connection Pool Check**
   ```sql
   -- Check PostgreSQL connections during test
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'notez';
   ```

### Success Criteria

- Heap size stable (< 10% growth over 30 minutes)
- No unclosed database connections
- No event listener accumulation

---

## Execution Plan

### Phase 1: Setup (Day 1)

1. Install k6
2. Create test data seed script
3. Write baseline scenarios
4. Establish local test environment

### Phase 2: Baseline Tests (Day 1-2)

1. Run auth flow at 12 VUs
2. Run CRUD at 12 VUs
3. Run search at 12 VUs
4. Document baseline metrics

### Phase 3: Stress Tests (Day 2-3)

1. Run all scenarios at 50 VUs
2. Identify bottlenecks
3. Tune if needed (connection pools, etc.)
4. Re-run and verify

### Phase 4: Soak Test (Day 3)

1. Run 30-minute soak test
2. Monitor memory throughout
3. Capture heap snapshots
4. Analyze for leaks

### Phase 5: Documentation (Day 4)

1. Compile results
2. Document performance baselines
3. Create runbook for future tests
4. Close #67 and #68

---

## Test Execution Commands

```bash
# Setup
cd backend
npm run seed:load-test

# Run individual scenarios
k6 run --env BASE_URL=http://localhost:3000 k6/scenarios/auth-flow.js
k6 run --env BASE_URL=http://localhost:3000 k6/scenarios/note-crud.js
k6 run --env BASE_URL=http://localhost:3000 k6/scenarios/search.js
k6 run --env BASE_URL=http://localhost:3000 k6/scenarios/rate-limit.js

# Run soak test
k6 run --env BASE_URL=http://localhost:3000 k6/scenarios/soak.js

# Run all with HTML report
k6 run --out json=results.json k6/scenarios/note-crud.js
```

---

## Results Template

### Summary Report

| Scenario | VUs | Duration | p50 | p95 | p99 | Error % | Pass |
|----------|-----|----------|-----|-----|-----|---------|------|
| Auth Baseline | 12 | 2m | | | | | |
| Auth Stress | 50 | 5m | | | | | |
| CRUD Baseline | 12 | 3m | | | | | |
| CRUD Stress | 50 | 5m | | | | | |
| Search | 50 | 3m | | | | | |
| Rate Limit | 1 | - | | | | | |
| Soak | 25 | 30m | | | | | |

### Memory Profile

| Metric | Start | +10m | +30m | Delta | Status |
|--------|-------|------|------|-------|--------|
| Heap Used | | | | | |
| Heap Total | | | | | |
| External | | | | | |
| RSS | | | | | |

---

## Appendix: k6 Installation Script

```bash
#!/bin/bash
# install-k6.sh

if [[ "$OSTYPE" == "darwin"* ]]; then
  brew install k6
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update
  sudo apt-get install k6
else
  echo "Please install k6 manually: https://k6.io/docs/getting-started/installation/"
fi
```

---

*Specification authored by Murat (Test Architect), 2025-12-03*
