# RestClient Service

The RestClient service provides HTTP/REST client functionality with support for JSON APIs, cookie management, request tracing, timeouts, and an opt-in [retry policy](#retry) for transient failures.

## Access

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });

// On-demand service - must be instantiated
const restClient = fable.instantiateServiceProvider('RestClient');
console.log('restClient:', typeof restClient);

// Or create named instances for different purposes
const apiClient  = fable.instantiateServiceProvider('RestClient', {}, 'api');
const authClient = fable.instantiateServiceProvider('RestClient', { TraceLog: true }, 'auth');
console.log('Named instances ready:', typeof apiClient, typeof authClient);
```

## Configuration

### Options

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });

const restClient = fable.instantiateServiceProvider('RestClient', {
    TraceLog: true  // Enable request/response logging
});
console.log('TraceLog enabled:', restClient.options.TraceLog);
```

### URL Prefix

Set a global URL prefix in Fable settings. The prefix completes a *relative*
URL; a URL that already carries its own scheme is left alone, so a library
layer that builds fully-qualified URLs is not corrupted by a host
application's prefix.

```javascript
const libFable = require('fable');
const fable = new libFable({
    RestClientURLPrefix: 'https://api.example.com'
});
const restClient = fable.instantiateServiceProvider('RestClient');

// Relative URL - the prefix is applied.
console.log(restClient.preRequest({ url: '/users' }).url);

// Absolute URL - passed through untouched.
console.log(restClient.preRequest({ url: 'http://127.0.0.1:8086/users' }).url);
```

## JSON Requests

### GET JSON

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground (CORS).
console.info("In Node.js:");
console.info("    // Simple URL");
console.info("    restClient.getJSON('https://api.example.com/users', (error, response, data) => {");
console.info("        if (error) { console.error('Request failed:', error); return; }");
console.info("        console.log('Status:', response.statusCode);");
console.info("        console.log('Data:', data);  // Parsed JSON");
console.info("    });");
console.info("    // With options");
console.info("    restClient.getJSON({");
console.info("        url: 'https://api.example.com/users',");
console.info("        headers: { Authorization: 'Bearer token123' }");
console.info("    }, (error, response, data) => { console.log(data); });");
```

### POST JSON

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.postJSON({");
console.info("        url: 'https://api.example.com/users',");
console.info("        body: { name: 'John Doe', email: 'john@example.com' }");
console.info("    }, (error, response, data) => { console.log('Created user:', data); });");
```

### PUT JSON

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.putJSON({");
console.info("        url: 'https://api.example.com/users/123',");
console.info("        body: { name: 'John Smith' }");
console.info("    }, (error, response, data) => { console.log('Updated user:', data); });");
```

### PATCH JSON

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.patchJSON({");
console.info("        url: 'https://api.example.com/users/123',");
console.info("        body: { email: 'john.smith@example.com' }");
console.info("    }, (error, response, data) => { console.log('Patched user:', data); });");
```

### DELETE JSON

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.delJSON({");
console.info("        url: 'https://api.example.com/users/123'");
console.info("    }, (error, response, data) => { console.log('Deleted user'); });");
```

### HEAD JSON

A HEAD request carries no body, and none is required on the options. The
response has no body either, so `data` is `null`.

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.headJSON({");
console.info("        url: 'https://api.example.com/users/123'");
console.info("    }, (error, response, data) => { console.log('Headers:', response.headers); });");
```

## Raw Text Requests

### GET Raw Text

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.getRawText('https://example.com/page.html', (error, response, text) => {");
console.info("        console.log('HTML:', text);");
console.info("    });");
```

## Chunked Requests

For streaming or large responses:

### Text Chunks

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.executeChunkedRequest({");
console.info("        method: 'GET',");
console.info("        url: 'https://example.com/large-file.txt'");
console.info("    }, (error, response, data) => { console.log('Complete data:', data); });");
```

### Binary Chunks

```javascript
// Node.js reference - real HTTP + fs don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.executeChunkedRequestBinary({");
console.info("        method: 'GET',");
console.info("        url: 'https://example.com/image.png'");
console.info("    }, (error, response, buffer) => {");
console.info("        // buffer is a Node.js Buffer");
console.info("        require('fs').writeFileSync('image.png', buffer);");
console.info("    });");
```

## Cookie Management

### Set Cookies

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });
const restClient = fable.instantiateServiceProvider('RestClient');

restClient.cookie = {
    'session_id': 'abc123',
    'user_token': 'xyz789'
};
console.log('Cookies set:', restClient.cookie);
```

Every entry in the jar is serialized onto the request, not just the first.

### Automatic Cookie Handling

Cookies are automatically included in subsequent requests:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });
const restClient = fable.instantiateServiceProvider('RestClient');

restClient.cookie = { session: 'abc123', tenant: 'acme' };

// prepareCookies is what the request path calls; both pairs travel.
console.log(restClient.prepareCookies({ url: '/protected-resource' }).headers.cookie);
```

### Per-Request Cookie Override

A `cookie` header supplied on the request options is authoritative and is
**not** replaced by the service-level jar. This is what lets a forwarded
caller identity travel on a client that also carries its own bound session —
silently substituting the jar would run one caller's request under another's
identity.

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });
const restClient = fable.instantiateServiceProvider('RestClient');

restClient.cookie = { UserSession: 'BOUND-MACHINE-SESSION' };

const tmpPrepared = restClient.prepareCookies({
    url: '/protected-resource',
    headers: { cookie: 'UserSession=FORWARDED-CALLER' }
});
console.log('Cookie sent:', tmpPrepared.headers.cookie);
```

## Request Options

All request methods accept an options object:

```javascript
const requestOptionsShape = {
    url: 'https://api.example.com/endpoint',
    method: 'GET',  // Usually set by the convenience method
    headers: {
        'Authorization': 'Bearer token',
        'Content-Type':  'application/json',
        'Accept':        'application/json'
    },
    body: { /* request body for POST/PUT/PATCH */ },
    timeout: 30000  // Request timeout in milliseconds
};
console.log('requestOptionsShape:', requestOptionsShape);
```

## Timeouts

Every request carries a timeout. When the caller does not supply one, the
client applies its own default — 60 seconds unless configured otherwise.
Setting any numeric value (including `0`) also takes the Node 20+
`http.globalAgent` socket timeout out of play, which would otherwise abort
legitimately long-running requests at ~5 seconds.

Resolution order is: per-request `timeout` → the `RequestTimeout` constructor
option → the `RestClientRequestTimeout` fable setting → 60000.

```javascript
const libFable = require('fable');

const fableDefault = new libFable({ Product: 'RestClientDemo' });
console.log('Stock default (ms):',
    fableDefault.instantiateServiceProvider('RestClient').defaultRequestTimeout);

const fableConfigured = new libFable({ RestClientRequestTimeout: 5000 });
console.log('From fable settings (ms):',
    fableConfigured.instantiateServiceProvider('RestClient').defaultRequestTimeout);

console.log('From constructor options (ms):',
    fableConfigured.instantiateServiceProvider('RestClient',
        { RequestTimeout: 1500 }, 'short-timeout').defaultRequestTimeout);
```

A request that exceeds its timeout fails with an `Error` whose `code` is
`ETIMEDOUT`, so a timeout classifies like any other coded transport failure
(see [Retry](#retry)).

## Bodyless Responses

A response that is *defined* to carry no body — status 204, 205 or 304, or any
HEAD request — is delivered with a `null` body and no error. Every other empty
body is still reported as a parse failure, because an empty 200 means the
response was truncated or the server misbehaved.

## Retry

Retry is **off by default**. An un-configured client behaves exactly as it
always has: one attempt, no replay of any kind. Callers opt in per-service,
per-client, or per-request.

### Enabling It

Configuration layers, each overriding the last: the `RestClientRetry` fable
setting, then the `Retry` constructor option, then a `Retry` property on an
individual request's options.

Each layer accepts an overrides object, a number (shorthand for `MaxAttempts`),
`true` (enable with the recommended budget of 3), or `false` (disable).

```javascript
const libFable = require('fable');
const fable = new libFable({ RestClientRetry: { MaxAttempts: 4 } });

// From the fable setting.
const restClient = fable.instantiateServiceProvider('RestClient');
console.log('Service policy MaxAttempts:', restClient.retryPolicy.MaxAttempts);

// A constructor option overrides the setting.
const tuned = fable.instantiateServiceProvider('RestClient',
    { Retry: { MaxAttempts: 2, InitialDelayMS: 100 } }, 'tuned');
console.log('Tuned MaxAttempts:', tuned.retryPolicy.MaxAttempts,
    'InitialDelayMS:', tuned.retryPolicy.InitialDelayMS);

// A per-request override resolves on top of the service policy.
console.log('Request says true  ->', restClient.resolveRetryPolicy({ Retry: true }).MaxAttempts);
console.log('Request says 5     ->', restClient.resolveRetryPolicy({ Retry: 5 }).MaxAttempts);
console.log('Request says false ->', restClient.resolveRetryPolicy({ Retry: false }).MaxAttempts);
```

### Policy Fields

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo' });
const restClient = fable.instantiateServiceProvider('RestClient');

// A fresh copy of the stock policy, safe to inspect or clone.
console.log(restClient.constructor.DefaultRetryPolicy);
```

| Field | Default | Meaning |
|---|---|---|
| `MaxAttempts` | `1` | Total attempts including the first. `1` disables retry |
| `InitialDelayMS` | `250` | Delay before the first replay |
| `MaxDelayMS` | `5000` | Ceiling on any single backoff delay |
| `BackoffFactor` | `2` | Multiplier applied per attempt |
| `JitterRatio` | `0.25` | Fraction of the delay randomized; `0` disables jitter |
| `RetryMethods` | `GET, HEAD, OPTIONS` | Methods treated as idempotent |
| `RetryStatusCodes` | `408, 425, 429, 502, 503, 504` | Response codes treated as transient |
| `RetryErrorCodes` | see below | Transport error codes treated as transient |
| `RespectRetryAfter` | `true` | Honor a `Retry-After` response header |
| `MaxRetryAfterMS` | `30000` | Ceiling on a server-supplied `Retry-After` |

The delay for an attempt is `InitialDelayMS * BackoffFactor^(attempt - 1)`,
capped at `MaxDelayMS`, then spread symmetrically by `JitterRatio` so a burst
of requests failing together does not resynchronize on the replay. A parseable
`Retry-After` header wins over the computed backoff, capped at
`MaxRetryAfterMS`.

Note that **500 is deliberately not retried**. A 500 is usually a
deterministic server-side failure that replays identically; the gateway codes
(502/503/504) and 408/425/429 are the genuinely transient ones. An application
that knows better can widen `RetryStatusCodes`, or classify on the body.

### What Is Eligible

Classification only matters for a request that is safe to replay in the first
place. Idempotent methods always are; anything else requires the caller to
assert it with `RetrySafe: true` — meadow's `POST /:Entity/Query` is the
motivating case, a POST only because the filter travels in the body. A body
that cannot be re-sent (a stream, or a `Blob`/`File` the caller may already
have consumed) is never replayed regardless.

| Request | Replayable |
|---|---|
| `GET` / `HEAD` / `OPTIONS` | Yes — listed in `RetryMethods` |
| `POST` / `PUT` / `PATCH` / `DELETE` | No |
| Any method with `RetrySafe: true` | Yes |
| An otherwise-idempotent method with `RetrySafe: false` | No |
| Any request whose body is a stream, `Blob` or `File` | No, regardless of the above |

### Transport Failures

When a request never completes, classification matches the error's `code`
against `RetryErrorCodes`:

```
ECONNRESET, ECONNREFUSED, ECONNABORTED, EPIPE, ETIMEDOUT, ESOCKETTIMEDOUT,
EAI_AGAIN, ENETUNREACH, ENETRESET, EHOSTUNREACH,
ERR_STREAM_PREMATURE_CLOSE, UND_ERR_SOCKET, ERR_SOCKET_CONNECTION_TIMEOUT
```

`ENOTFOUND` is deliberately absent — a name that does not resolve will not
resolve on the replay either; `EAI_AGAIN` covers transient DNS.

A socket timeout is normalized to a coded `ETIMEDOUT` before classification,
so timeouts retry like any other transient transport failure and reach the
caller with a usable `error.code`.

### Classifying on the Body

The stock policy can only see the status code and the transport error code. An
API that reports failure some other way — a 200 carrying an error field, a
vendor-specific envelope — needs the body to make the call. A classifier
returns `'retry'`, `'settle'`, or `null`/`undefined` to defer to the policy.

Eligibility still gates everything: a classifier can reinterpret an outcome,
but it can never make a non-idempotent request replayable. A classifier that
throws is treated as having no opinion, so a bug in application code degrades
to the stock policy rather than breaking every request.

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo' });
const restClient = fable.instantiateServiceProvider('RestClient', { Retry: true });

// A legacy API that answers 200 with a top-level Error string.
restClient.retryClassifier = (pContext) => {
    if (pContext.Body && typeof pContext.Body.Error === 'string') {
        return (/timeout|deadlock|unavailable/i.test(pContext.Body.Error)) ? 'retry' : 'settle';
    }
    return null;
};

console.log('Deadlock envelope  ->', restClient.retryClassifier({ Body: { Error: 'deadlock detected' } }));
console.log('Rights refusal     ->', restClient.retryClassifier({ Body: { Error: 'no rights' } }));
console.log('Ordinary record    ->', restClient.retryClassifier({ Body: { IDWidget: 12 } }));
```

Set it per request with `RetryClassifier`, which wins over the service-level
one; `RetryClassifier: false` opts a single request out entirely.

### Lifecycle Hooks

Both hooks may be async and are awaited, so a hook can do real work before the
replay leaves — refresh a token, re-sign a URL, bump a metric. The context's
`Options` object **is** the one about to be replayed, so mutating it redirects
the retry.

| Hook | Fires | Notes |
|---|---|---|
| `onBeforeRetry` | Before each backoff | Resolving exactly `false` vetoes the retry and settles with the outcome in hand |
| `onRetryExhausted` | Transient failure with no budget left | Only when retry was enabled; a replay that finally succeeded is an ordinary completion |

The hook receives a context of `Options`, `Error`, `Response`, `Body`,
`Policy`, `AttemptsMade` and `DelayMS` (`null` when settling). Per-request
`OnBeforeRetry` / `OnRetryExhausted` win over the service-level hooks, and
either set to `false` opts that request out. A hook that throws or rejects is
logged and treated as a no-op, so buggy instrumentation can never strand a
request.

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.onBeforeRetry = async (pContext) => {");
console.info("        pContext.Options.headers.Authorization = 'Bearer ' + await refreshToken();");
console.info("    };");
console.info("    restClient.onRetryExhausted = (pContext) => {");
console.info("        metrics.increment('api.retry.exhausted', { attempts: pContext.AttemptsMade });");
console.info("    };");
```

### What Gets Logged

| Level | Action | When |
|---|---|---|
| `warn` | `RestClientRetry` | A replay is scheduled; carries attempt, budget, delay, status and error code |
| `debug` | `RestClientRetryDeclined` | Retry was enabled and the request eligible, but the failure classified as non-transient |

The `debug` line exists so that "retry was configured and declined to fire" is
distinguishable from "retry was never configured" — without it, a
misclassified failure is silent.

## Custom Request Preparation

Override the `prepareRequestOptions` function to modify all outgoing requests:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });
const restClient = fable.instantiateServiceProvider('RestClient');

function getAccessToken() { return 'demo-token-abc123'; }

restClient.prepareRequestOptions = (options) => {
    // Add authentication to all requests
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = 'Bearer ' + getAccessToken();
    return options;
};

const sample = restClient.prepareRequestOptions({ url: '/users' });
console.log('Prepared options:', sample);
```

## Trace Logging

Enable detailed request logging:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });

const restClient = fable.instantiateServiceProvider('RestClient', {
    TraceLog: true
});

// Or enable globally
fable.TraceLog = true;
console.log('Per-instance TraceLog:', restClient.options.TraceLog);
console.log('Global fable.TraceLog:', fable.TraceLog);

// Logs include:
// - Request start time
// - Connection time
// - Chunk reception times
// - Total transfer time and size
```

Example trace output:

```
Beginning GET request to https://api.example.com/users at 1704067200000
--> GET connected in 00:00:00.150ms code 200
--> GET data chunk size 1024b received in 00:00:00.200ms
==> GET completed data size 4096b received in 00:00:00.250ms
```

## Direct simpleGet Access

Access the underlying `simple-get` library directly. This bypasses the whole
request pipeline — cookies, the URL prefix, the default timeout, the
protocol-matched agents, redirect handling, timeout normalization and retry —
so prefer a request method unless you specifically need raw access.

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.simpleGet({");
console.info("        method: 'GET',");
console.info("        url: 'https://example.com',");
console.info("        // ... other simple-get options");
console.info("    }, callback);");
```

## Error Handling

The callback signature is `(error, response, body)`. A transport failure — the
request never completed — arrives as an `Error` with no response; check
`error.code` (`ECONNREFUSED`, `ETIMEDOUT`, …) to tell the failures apart. A
request that completed carries a `response`, and a non-2xx status is *not* an
error: inspect `response.statusCode` yourself.

```javascript
// Node.js reference - real HTTP requests don't run in the browser playground.
console.info("In Node.js:");
console.info("    restClient.getJSON('https://api.example.com/users', (error, response, data) => {");
console.info("        if (error) { console.error('Network error:', error.code, error.message); return; }");
console.info("        if (response.statusCode >= 400) {");
console.info("            console.error('HTTP error:', response.statusCode);");
console.info("            console.error('Error body:', data);");
console.info("            return;");
console.info("        }");
console.info("        console.log('Data:', data);");
console.info("    });");
```

## Multiple Instances

Create separate clients for different APIs:

```javascript
const libFable = require('fable');
const fable = new libFable({ Product: 'RestClientDemo', ProductVersion: '1.0.0' });

const mainApi = fable.instantiateServiceProvider('RestClient', {}, 'main-api');
const authApi = fable.instantiateServiceProvider('RestClient', {}, 'auth-api');

// Set different cookies for each
mainApi.cookie = { api_session:  '...' };
authApi.cookie = { auth_session: '...' };

// Set different request preparation
authApi.prepareRequestOptions = (options) => {
    options.headers = options.headers || {};
    options.headers['X-Auth-Service'] = 'true';
    return options;
};

console.log('mainApi cookie keys:', Object.keys(mainApi.cookie));
console.log('authApi cookie keys:', Object.keys(authApi.cookie));
console.log('authApi prepared headers:', authApi.prepareRequestOptions({}).headers);
```
