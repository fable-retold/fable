const libFableServiceBase = require('fable-serviceproviderbase');

const libSimpleGet = require('simple-get');
const libCookie = require('cookie');
const libHttp = require('http');
const libHttps = require('https');

/**
 * @typedef {Object} RestClientRetryPolicy
 * @property {number} MaxAttempts - Total attempts including the first (1 disables retry).
 * @property {number} InitialDelayMS - Delay before the first retry.
 * @property {number} MaxDelayMS - Ceiling for any single backoff delay.
 * @property {number} BackoffFactor - Multiplier applied to the delay per attempt.
 * @property {number} JitterRatio - Fraction of the delay randomized (0 disables jitter).
 * @property {Array<string>} RetryMethods - HTTP methods considered idempotent, and thus retryable.
 * @property {Array<number>} RetryStatusCodes - Response status codes treated as transient.
 * @property {Array<string>} RetryErrorCodes - Transport error codes treated as transient.
 * @property {boolean} RespectRetryAfter - Honor a Retry-After response header when present.
 * @property {number} MaxRetryAfterMS - Ceiling on a server-supplied Retry-After delay.
 */

/**
 * @typedef {Object} RestClientRetryContext
 * @property {Record<string, any>} Options - The replay options for this request.
 * @property {Error|null} Error - The transport error, when the request never completed.
 * @property {Object} [Response] - The response, when one was received.
 * @property {*} [Body] - The processed body (parsed JSON / string / Buffer), when one was received.
 * @property {RestClientRetryPolicy} Policy - The resolved policy for this request.
 * @property {number} AttemptsMade - Attempts made so far, including this one.
 * @property {number|null} [DelayMS] - Backoff before the pending replay; null when settling.
 */

/**
 * Attempt count used when retry is switched on without an explicit budget
 * (`Retry: true`). One original attempt plus two replays.
 *
 * @type {number}
 */
const ENABLED_RETRY_ATTEMPTS = 3;

/**
 * Statuses defined to carry no message body (RFC 7231 §6.3.5, §6.3.6; RFC 7232
 * §4.1). An empty body on one of these is the contract, not a parse failure.
 *
 * @type {Array<number>}
 */
const NO_CONTENT_STATUS_CODES = [ 204, 205, 304 ];

/**
 * The stock retry policy. `MaxAttempts: 1` means retry is OFF by default -- an
 * un-configured client behaves exactly as it always has, with no replay of any
 * kind. Callers opt in per-service, per-client, or per-request.
 *
 * The remaining fields describe what retry looks like ONCE enabled, and stay
 * conservative:
 *   - Only idempotent methods retry; a POST/PUT/PATCH/DELETE retries only when
 *     the caller explicitly marks that request `RetrySafe: true`.
 *   - 500 is NOT retried. A 500 out of meadow is a deterministic server-side
 *     failure (bad SQL, bad filter) that replays identically; the gateway codes
 *     (502/503/504) and 408/425/429 are the genuinely transient ones. An
 *     application that knows better can widen this, or classify on the body.
 *
 * @type {RestClientRetryPolicy}
 */
const DEFAULT_RETRY_POLICY =
{
	MaxAttempts: 1,
	InitialDelayMS: 250,
	MaxDelayMS: 5000,
	BackoffFactor: 2,
	JitterRatio: 0.25,
	RetryMethods: [ 'GET', 'HEAD', 'OPTIONS' ],
	RetryStatusCodes: [ 408, 425, 429, 502, 503, 504 ],
	RetryErrorCodes:
		[
			// ENOTFOUND is deliberately absent -- a name that does not resolve will
			// not resolve on the retry either; EAI_AGAIN covers transient DNS.
			'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT', 'ESOCKETTIMEDOUT',
			'EAI_AGAIN', 'ENETUNREACH', 'ENETRESET', 'EHOSTUNREACH',
			'ERR_STREAM_PREMATURE_CLOSE', 'UND_ERR_SOCKET', 'ERR_SOCKET_CONNECTION_TIMEOUT'
		],
	RespectRetryAfter: true,
	MaxRetryAfterMS: 30000
};

class FableServiceRestClient extends libFableServiceBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.TraceLog = false;
		if (this.options.TraceLog || this.fable.TraceLog)
		{
			this.TraceLog = true;
		}

		this.dataFormat = this.fable.services.DataFormat;

		this.serviceType = 'RestClient';

		this.cookie = false;

		// This is a function that can be overridden, to allow the management
		// of the request options before they are passed to the request library.
		this.prepareRequestOptions = (pOptions) => { return pOptions; };

		// Optional, UI-agnostic authentication-recovery hook. Default null, so
		// existing server-to-server callers are completely unaffected. When set
		// to an (async) function and a completed response has statusCode 401 on a
		// request that is not itself a replay, the client awaits this hook; a
		// truthy resolution replays the original request exactly once, anything
		// else returns the original 401 to the caller unchanged. The hook never
		// imports app UI -- the app assigns it (e.g. a re-auth modal controller),
		// which is what makes recovery reusable across every Fable consumer.
		this.authenticationRecovery = null;

		// Single-flight state for the recovery hook: a burst of concurrent 401s
		// collapses to exactly one authenticationRecovery() call. Cleared on
		// settle so a later, unrelated expiry re-arms recovery.
		this._authenticationRecoveryPromise = null;

		// Default per-request timeout (ms). Applied in preRequest when a caller
		// does not supply their own. Node 20+ installs a ~5s socket timeout on
		// http.globalAgent that aborts legitimately long-running requests; any
		// explicit `timeout` on the request options takes that default out of
		// play. See the "Request Timeout" test suite for the behaviors covered.
		if (typeof this.options.RequestTimeout === 'number')
		{
			this.defaultRequestTimeout = this.options.RequestTimeout;
		}
		else if (typeof this.fable.settings.RestClientRequestTimeout === 'number')
		{
			this.defaultRequestTimeout = this.fable.settings.RestClientRequestTimeout;
		}
		else
		{
			this.defaultRequestTimeout = 60000;
		}

		// Always install our own http/https agents so every request bypasses
		// http.globalAgent (and its Node 20+ mystery socket timeout). The
		// KeepAlive flag only controls whether keepAlive is enabled on our own
		// agents, not whether we have agents at all. Additional tuning
		// (maxSockets, agent timeout, etc.) flows through KeepAliveAgentOptions.
		let tmpKeepAlive = Boolean(this.options.KeepAlive || this.fable.settings.RestClientKeepAlive);
		let tmpAgentOptions = Object.assign({}, this.options.KeepAliveAgentOptions);
		if (tmpKeepAlive)
		{
			tmpAgentOptions.keepAlive = true;
		}
		this._installHttpAgents(tmpAgentOptions);

		// Service-level retry policy, layered defaults <- fable settings <-
		// constructor options. Any individual request can further override (or
		// disable) this via a `Retry` property on its options object.
		this.retryPolicy = this._buildRetryPolicy(this.fable.settings.RestClientRetry, this.options.Retry);

		// Timer seam so tests (and non-DOM hosts) can drive backoff without
		// wall-clock waits. Signature matches setTimeout(callback, delay).
		this.retryTimerFunction = (fCallback, pDelayMS) => setTimeout(fCallback, pDelayMS);

		// Random source for backoff jitter; overridable for deterministic tests.
		this.retryJitterFunction = () => Math.random();

		// Re-raise seam for exceptions escaping a promise continuation. See
		// _invokeDetached; overridable for tests.
		this.detachedThrowFunction = (pDetachedError) => { setTimeout(() => { throw pDetachedError; }, 0); };

		// Optional, application-supplied outcome classifier. The stock policy can
		// only see the status code and the transport error code; an API that
		// reports failure some other way (a 200 carrying an error field, a
		// vendor-specific envelope) needs the body to make the call. Return
		// 'retry' to treat the outcome as transient, 'settle' to suppress a retry
		// the policy would otherwise take, or null/undefined to defer to the
		// policy. Eligibility still gates everything -- a classifier cannot make a
		// non-idempotent request replayable.
		//
		// Example, for a legacy API that answers 200 with a top-level Error string:
		//   tmpRestClient.retryClassifier = (pContext) =>
		//   {
		//       if (pContext.Body && typeof pContext.Body.Error === 'string')
		//       {
		//           return (/timeout|deadlock|unavailable/i.test(pContext.Body.Error)) ? 'retry' : 'settle';
		//       }
		//       return null;
		//   };
		/** @type {((pContext: RestClientRetryContext) => ('retry'|'settle'|null|undefined))|null} */
		this.retryClassifier = (typeof this.options.RetryClassifier === 'function') ? this.options.RetryClassifier : null;

		// Lifecycle hooks. Both may be async and are awaited, so a hook can do
		// real work before the replay goes out -- refresh a stream handle or a
		// token, re-sign a URL, bump a metric. The context's `Options` object IS
		// the one about to be replayed, so mutating it (headers, url, body)
		// redirects the retry.
		//
		// onBeforeRetry additionally acts as a veto: resolving exactly false
		// abandons the retry and settles with the outcome in hand.
		/** @type {((pContext: RestClientRetryContext) => any)|null} */
		this.onBeforeRetry = (typeof this.options.OnBeforeRetry === 'function') ? this.options.OnBeforeRetry : null;
		/** @type {((pContext: RestClientRetryContext) => any)|null} */
		this.onRetryExhausted = (typeof this.options.OnRetryExhausted === 'function') ? this.options.OnRetryExhausted : null;
	}

	/**
	 * Invoke a function from inside a promise continuation without letting its
	 * exceptions change shape.
	 *
	 * Delivering a caller's callback from inside a `.then()` turns any exception
	 * it throws into an *unhandled rejection* rather than the ordinary uncaught
	 * exception the synchronous settle path produces. Those are different
	 * channels: services wire them separately, browsers treat them differently,
	 * and the request stalls silently either way. Since whether a request settles
	 * synchronously or through a hook is an implementation detail the caller
	 * cannot see, the failure mode must not depend on it.
	 *
	 * @param {Function} fFunction - The function to invoke.
	 * @return {*} Whatever the function returned, or undefined when it threw.
	 * @private
	 */
	_invokeDetached(fFunction)
	{
		try
		{
			return fFunction();
		}
		catch (pDetachedError)
		{
			this.detachedThrowFunction(pDetachedError);
			return undefined;
		}
	}

	/**
	 * Resolve a lifecycle hook for a single request: a per-request hook wins over
	 * the service-level one, and an explicit `false` opts the request out.
	 *
	 * @param {Record<string, any>} pRequestOptions - The request options.
	 * @param {string} pRequestKey - The per-request option name (e.g. 'OnBeforeRetry').
	 * @param {string} pServiceKey - The service-level property name (e.g. 'onBeforeRetry').
	 * @return {Function|null} The hook to run, or null.
	 */
	_resolveRetryHook(pRequestOptions, pRequestKey, pServiceKey)
	{
		if (pRequestOptions && typeof pRequestOptions[pRequestKey] === 'function')
		{
			return pRequestOptions[pRequestKey];
		}
		if (pRequestOptions && pRequestOptions[pRequestKey] === false)
		{
			return null;
		}
		return (typeof this[pServiceKey] === 'function') ? this[pServiceKey] : null;
	}

	/**
	 * Await a lifecycle hook, isolating the request from anything it does wrong.
	 * A hook that throws or rejects is logged and treated as a no-op, so buggy
	 * instrumentation can never strand a request.
	 *
	 * @param {Function|null} fHook - The resolved hook, or null.
	 * @param {RestClientRetryContext} pContext - The context handed to the hook.
	 * @param {string} pHookName - Name used in the failure log.
	 * @return {Promise<*>} The hook's resolution, or undefined when it failed or was absent.
	 */
	_runRetryHook(fHook, pContext, pHookName)
	{
		if (!fHook)
		{
			return Promise.resolve(undefined);
		}
		let tmpInvocation;
		try
		{
			tmpInvocation = Promise.resolve(fHook(pContext));
		}
		catch (pHookError)
		{
			tmpInvocation = Promise.reject(pHookError);
		}
		return tmpInvocation.then(
			(pResult) => { return pResult; },
			(pHookError) =>
			{
				this.fable.log.warn(`RestClient ${pHookName} hook failed; continuing: ${pHookError.message}`,
					{ Action: 'RestClientRetryHookError', Hook: pHookName });
				return undefined;
			});
	}

	/**
	 * Resolve the classifier for a single request: a per-request RetryClassifier
	 * wins over the service-level one. An explicit `false` opts a request out of
	 * a service-level classifier entirely.
	 *
	 * @param {Record<string, any>} pRequestOptions - The request options.
	 * @return {Function|null} The classifier to run, or null.
	 */
	_resolveRetryClassifier(pRequestOptions)
	{
		if (pRequestOptions && typeof pRequestOptions.RetryClassifier === 'function')
		{
			return pRequestOptions.RetryClassifier;
		}
		if (pRequestOptions && pRequestOptions.RetryClassifier === false)
		{
			return null;
		}
		return (typeof this.retryClassifier === 'function') ? this.retryClassifier : null;
	}

	/**
	 * Run the resolved classifier, if any. A classifier that throws is treated as
	 * having no opinion, so a bug in application code degrades to the stock
	 * policy rather than breaking every request through the client.
	 *
	 * Called once per attempt, including the final one -- its verdict on the last
	 * attempt is what distinguishes a genuinely exhausted retry from an ordinary
	 * completion. Keep classifiers cheap and side-effect free.
	 *
	 * @param {RestClientRetryContext} pContext - The outcome context.
	 * @return {string|null} 'retry', 'settle', or null for no opinion.
	 */
	_classifyRetryOutcome(pContext)
	{
		const fClassifier = this._resolveRetryClassifier(pContext.Options);
		if (!fClassifier)
		{
			return null;
		}
		let tmpVerdict;
		try
		{
			tmpVerdict = fClassifier(pContext);
		}
		catch (pClassifierError)
		{
			this.fable.log.warn(`RestClient retry classifier threw; deferring to the stock policy: ${pClassifierError.message}`,
				{ Action: 'RestClientRetryClassifierError' });
			return null;
		}
		if (tmpVerdict === 'retry' || tmpVerdict === 'settle')
		{
			return tmpVerdict;
		}
		return null;
	}

	/**
	 * Layer retry configuration fragments onto the stock policy. Each fragment
	 * may be an object of overrides, a number (shorthand for MaxAttempts), or
	 * `false`/`0` (shorthand for "no retries"). Unrecognized fragments are
	 * ignored, so an older config file can never break the client.
	 *
	 * @param {...(Partial<RestClientRetryPolicy>|number|boolean|null|undefined)} pFragments - Overrides applied in order, later winning.
	 * @return {RestClientRetryPolicy} The resolved policy.
	 */
	_buildRetryPolicy(...pFragments)
	{
		let tmpPolicy = Object.assign({}, DEFAULT_RETRY_POLICY);
		for (let i = 0; i < pFragments.length; i++)
		{
			const tmpFragment = pFragments[i];
			if ((tmpFragment === null) || (typeof tmpFragment === 'undefined'))
			{
				continue;
			}
			if (tmpFragment === false)
			{
				tmpPolicy.MaxAttempts = 1;
				continue;
			}
			if (tmpFragment === true)
			{
				tmpPolicy.MaxAttempts = ENABLED_RETRY_ATTEMPTS;
				continue;
			}
			if (typeof tmpFragment === 'number')
			{
				tmpPolicy.MaxAttempts = Math.max(1, tmpFragment);
				continue;
			}
			if (typeof tmpFragment === 'object')
			{
				tmpPolicy = Object.assign(tmpPolicy, tmpFragment);
			}
		}
		if (typeof tmpPolicy.MaxAttempts !== 'number' || tmpPolicy.MaxAttempts < 1)
		{
			tmpPolicy.MaxAttempts = 1;
		}
		return tmpPolicy;
	}

	/**
	 * Resolve the effective policy for a single request: the service policy with
	 * any per-request `Retry` override layered on top.
	 *
	 * @param {Record<string, any>} pRequestOptions - The request options (pre- or post-preRequest).
	 * @return {RestClientRetryPolicy} The resolved policy for this request.
	 */
	resolveRetryPolicy(pRequestOptions)
	{
		if (!pRequestOptions || !('Retry' in pRequestOptions))
		{
			return this.retryPolicy;
		}
		return this._buildRetryPolicy(this.retryPolicy, pRequestOptions.Retry);
	}

	/**
	 * Whether a request may be replayed at all. Idempotent methods always may;
	 * anything else requires the caller to assert safety with `RetrySafe: true`
	 * (meadow's POST /:Entity/Query is the motivating case -- a POST purely
	 * because the filter travels in the body). A body we cannot re-send (a
	 * stream, or a Blob/File the caller may already have consumed) is never
	 * replayed regardless.
	 *
	 * @param {Record<string, any>} pRequestOptions - The request options.
	 * @param {RestClientRetryPolicy} pPolicy - The resolved policy.
	 * @return {boolean} True when this request is safe to replay.
	 */
	_isRetryableRequest(pRequestOptions, pPolicy)
	{
		if (!pRequestOptions)
		{
			return false;
		}
		const tmpBody = pRequestOptions.body;
		if (tmpBody && (typeof tmpBody.pipe === 'function' || (typeof Blob !== 'undefined' && tmpBody instanceof Blob)))
		{
			return false;
		}
		if (pRequestOptions.RetrySafe === true)
		{
			return true;
		}
		if (pRequestOptions.RetrySafe === false)
		{
			return false;
		}
		const tmpMethod = (pRequestOptions.method || 'GET').toUpperCase();
		return Array.isArray(pPolicy.RetryMethods) && pPolicy.RetryMethods.indexOf(tmpMethod) > -1;
	}

	/**
	 * Parse a Retry-After header into milliseconds. Handles both the delta-seconds
	 * and the HTTP-date forms defined by RFC 7231 §7.1.3.
	 *
	 * @param {string} pHeaderValue - The raw header value.
	 * @return {number} Milliseconds to wait, or -1 when unparseable.
	 */
	_parseRetryAfter(pHeaderValue)
	{
		if (typeof pHeaderValue !== 'string' || pHeaderValue.length < 1)
		{
			return -1;
		}
		const tmpSeconds = Number(pHeaderValue);
		if (!isNaN(tmpSeconds))
		{
			return Math.max(0, tmpSeconds * 1000);
		}
		const tmpDate = Date.parse(pHeaderValue);
		if (isNaN(tmpDate))
		{
			return -1;
		}
		return Math.max(0, tmpDate - Date.now());
	}

	/**
	 * Decide whether a settled request should be replayed, and how long to wait.
	 *
	 * @param {RestClientRetryPolicy} pPolicy - The resolved policy.
	 * @param {Record<string, any>} pRequestOptions - The replay options (carry the attempt marker).
	 * @param {Error|null} pError - The transport error, if any.
	 * @param {Object} [pResponse] - The response, when one was received.
	 * @param {*} [pBody] - The processed body, when one was received.
	 * @return {number} The delay in milliseconds, or -1 to settle without retrying.
	 */
	_resolveRetryDelay(pPolicy, pRequestOptions, pError, pResponse, pBody)
	{
		return this._evaluateRetryOutcome(pPolicy, pRequestOptions, pError, pResponse, pBody).DelayMS;
	}

	/**
	 * Classify a settled request and decide what happens next. Separating
	 * "was this a transient failure" from "do we have budget left" is what lets
	 * the caller tell a successful replay apart from a genuinely exhausted one --
	 * both reach the settle path, but only the second is a give-up.
	 *
	 * @param {RestClientRetryPolicy} pPolicy - The resolved policy.
	 * @param {Record<string, any>} pRequestOptions - The replay options (carry the attempt marker).
	 * @param {Error|null} pError - The transport error, if any.
	 * @param {Object} [pResponse] - The response, when one was received.
	 * @param {*} [pBody] - The processed body, when one was received.
	 * @return {{ Transient: boolean, DelayMS: number, Exhausted: boolean }} The evaluation.
	 */
	_evaluateRetryOutcome(pPolicy, pRequestOptions, pError, pResponse, pBody)
	{
		const tmpAttemptsMade = (pRequestOptions.__retryAttempt || 0) + 1;
		const tmpSettled = { Transient: false, DelayMS: -1, Exhausted: false };

		// Eligibility is a hard gate that sits above classification: an
		// application classifier can reinterpret an outcome, but it can never make
		// a non-idempotent request safe to replay.
		if (!this._isRetryableRequest(pRequestOptions, pPolicy))
		{
			return tmpSettled;
		}

		let tmpTransient = false;
		const tmpVerdict = this._classifyRetryOutcome(
			{
				Options: pRequestOptions,
				Error: pError,
				Response: pResponse,
				Body: pBody,
				Policy: pPolicy,
				AttemptsMade: tmpAttemptsMade
			});

		if (tmpVerdict === 'settle')
		{
			return tmpSettled;
		}
		else if (tmpVerdict === 'retry')
		{
			tmpTransient = true;
		}
		else if (pResponse && typeof pResponse.statusCode === 'number')
		{
			tmpTransient = Array.isArray(pPolicy.RetryStatusCodes) && pPolicy.RetryStatusCodes.indexOf(pResponse.statusCode) > -1;
		}
		else if (pError)
		{
			// A transport failure with no response at all. Match on the error code
			// where Node gives us one; a bare timeout from simple-get surfaces as a
			// coded ETIMEDOUT so this stays precise rather than retrying everything.
			const tmpCode = pError.code || (pError.cause && pError.cause.code);
			tmpTransient = Array.isArray(pPolicy.RetryErrorCodes) && pPolicy.RetryErrorCodes.indexOf(tmpCode) > -1;
		}

		if (!tmpTransient)
		{
			return tmpSettled;
		}

		if (tmpAttemptsMade >= pPolicy.MaxAttempts)
		{
			// Transient, but out of budget. Only a give-up when replays were
			// enabled at all -- with retry off this is an ordinary completion.
			return { Transient: true, DelayMS: -1, Exhausted: (pPolicy.MaxAttempts > 1) };
		}

		if (pPolicy.RespectRetryAfter && pResponse && pResponse.headers && pResponse.headers['retry-after'])
		{
			const tmpRetryAfterMS = this._parseRetryAfter(pResponse.headers['retry-after']);
			if (tmpRetryAfterMS > -1)
			{
				// A server that tells us when to come back wins over our backoff,
				// but never past the configured ceiling.
				return { Transient: true, DelayMS: Math.min(tmpRetryAfterMS, pPolicy.MaxRetryAfterMS), Exhausted: false };
			}
		}

		const tmpBackoff = pPolicy.InitialDelayMS * Math.pow(pPolicy.BackoffFactor, tmpAttemptsMade - 1);
		const tmpCappedDelay = Math.min(tmpBackoff, pPolicy.MaxDelayMS);
		if (!pPolicy.JitterRatio)
		{
			return { Transient: true, DelayMS: tmpCappedDelay, Exhausted: false };
		}
		// Symmetric jitter around the backoff so a burst of concurrent page reads
		// failing together does not resynchronize on the retry.
		const tmpJitterSpan = tmpCappedDelay * pPolicy.JitterRatio;
		const tmpJittered = tmpCappedDelay - tmpJitterSpan + (this.retryJitterFunction() * tmpJitterSpan * 2);
		return { Transient: true, DelayMS: Math.max(0, Math.round(tmpJittered)), Exhausted: false };
	}

	/**
	 * Initialize HTTP keep-alive agents and wire them into prepareRequestOptions.
	 * Back-compat entry point: always forces keepAlive on. Prefer configuring
	 * the RestClient via the KeepAlive / KeepAliveAgentOptions constructor
	 * options instead of calling this method directly.
	 *
	 * @param {Object} [pAgentOptions] - Additional options passed to the Http/Https Agent constructors (e.g. timeout).
	 */
	initializeKeepAliveAgent(pAgentOptions)
	{
		let tmpAgentOptions = Object.assign({ keepAlive: true }, pAgentOptions);
		this._installHttpAgents(tmpAgentOptions);
	}

	/**
	 * Construct http/https Agents from the given options and wire them into
	 * prepareRequestOptions so every request carries an explicit agent.
	 *
	 * @param {Object} pAgentOptions - Options passed directly to the Http/Https Agent constructors.
	 * @private
	 */
	_installHttpAgents(pAgentOptions)
	{
		this.httpAgent = new libHttp.Agent(pAgentOptions);
		this.httpsAgent = new libHttps.Agent(pAgentOptions);

		// Capture any previously set prepareRequestOptions so we can chain
		let tmpPreviousPrepareRequestOptions = this.prepareRequestOptions;

		this.prepareRequestOptions = (pOptions) =>
		{
			// Mirror simple-get's protocol decision exactly: it routes through
			// the https module if and only if the parsed URL protocol is
			// exactly 'https:'. Everything else — http: URLs, relative URLs
			// (which simple-get treats as no-host http requests), and option
			// objects with no .url at all — goes through the http module.
			// Stamping an httpsAgent on an http request makes Node throw
			// ERR_INVALID_PROTOCOL when http.request validates agent.protocol.
			if (typeof pOptions.url === 'string' && pOptions.url.startsWith('https:'))
			{
				pOptions.agent = this.httpsAgent;
			}
			else
			{
				pOptions.agent = this.httpAgent;
			}
			return tmpPreviousPrepareRequestOptions(pOptions);
		};
	}

	get simpleGet()
	{
		return libSimpleGet;
	}

	/**
	 * Serialize the service-level cookie jar onto the request.
	 *
	 * A cookie header the caller supplied is authoritative and is left alone: a
	 * forwarded caller identity has to be able to travel on a client that also
	 * carries its own bound session, and silently replacing it would run one
	 * caller's request under another's identity. This matches how the rest of
	 * the ecosystem composes cookies (see pict-sessionmanager's
	 * onPrepareCookies, which merges rather than replaces).
	 *
	 * @param {Record<string, any>} pRequestOptions - The request options.
	 * @return {Record<string, any>} The same object, decorated.
	 */
	prepareCookies(pRequestOptions)
	{
		if (this.cookie)
		{
			let tmpCookieObject = this.cookie;
			if (!('headers' in pRequestOptions))
			{
				pRequestOptions.headers = {};
			}
			let tmpCookieKeys = Object.keys(tmpCookieObject);
			if (tmpCookieKeys.length > 0 && !pRequestOptions.headers.cookie)
			{
				let tmpCookiePairs = [];
				for (let i = 0; i < tmpCookieKeys.length; i++)
				{
					tmpCookiePairs.push(libCookie.serialize(tmpCookieKeys[i], tmpCookieObject[tmpCookieKeys[i]]));
				}
				pRequestOptions.headers.cookie = tmpCookiePairs.join('; ');
			}
		}
		return pRequestOptions;
	}

	preRequest(pOptions)
	{
		// Validate the options object
		let tmpOptions = this.prepareCookies(pOptions);

		// Prepend a string to the URL if it exists in the Fable Config. An
		// already-absolute URL is left alone: the prefix exists to complete a
		// relative path, and a library layer that builds its own fully-qualified
		// URLs would otherwise be corrupted by a host application's setting.
		if (('RestClientURLPrefix' in this.fable.settings) && !this._isAbsoluteURL(tmpOptions.url))
		{
			tmpOptions.url = this.fable.settings.RestClientURLPrefix + tmpOptions.url;
		}

		// Apply the default request timeout when the caller hasn't supplied
		// one. Setting any numeric value (including 0) suppresses the Node 20+
		// http.globalAgent ~5s socket timeout.
		if (typeof tmpOptions.timeout !== 'number')
		{
			tmpOptions.timeout = this.defaultRequestTimeout;
		}

		return this.prepareRequestOptions(tmpOptions);
	}

	/**
	 * Whether a URL already carries its own scheme, and so needs no prefixing.
	 *
	 * @private
	 * @param {string} pUrl
	 * @return {boolean}
	 */
	_isAbsoluteURL(pUrl)
	{
		return (typeof pUrl === 'string') && /^[a-z][a-z0-9+.-]*:\/\//i.test(pUrl);
	}

	/**
	 * Extract the hostname from a URL string. Returns null for relative URLs
	 * or anything else that doesn't parse cleanly.
	 *
	 * @private
	 * @param {string} pUrl
	 * @return {string|null}
	 */
	_parseHostname(pUrl)
	{
		if (typeof pUrl !== 'string')
		{
			return null;
		}
		try
		{
			return new URL(pUrl).hostname || null;
		}
		catch (e)
		{
			return null;
		}
	}

	/**
	 * Resolve a Location header against the URL of the request that produced
	 * it. Handles absolute Locations (returned as-is) and RFC 7231-compliant
	 * relative Locations (resolved against the current URL).
	 *
	 * @private
	 * @param {string} pCurrentURL - The URL of the request that produced the redirect.
	 * @param {string} pLocation - The Location header value.
	 * @return {string}
	 */
	_resolveRedirectURL(pCurrentURL, pLocation)
	{
		if (typeof pLocation !== 'string' || pLocation.length === 0)
		{
			return pLocation;
		}
		try
		{
			return new URL(pLocation, pCurrentURL).toString();
		}
		catch (e)
		{
			// Either pCurrentURL is itself relative or pLocation is malformed.
			// Fall back to passing it through verbatim — simple-get's parser
			// will give the next hop a final say.
			return pLocation;
		}
	}

	/**
	 * Build the options object for the next hop of a redirect chain. Applies
	 * the same hop-rewrite rules simple-get does, plus an RFC-correct relative
	 * Location resolution that simple-get itself doesn't do:
	 *   - Resolve the Location against the current URL (absolute or relative).
	 *   - Strip simple-get's URL-derived state (protocol/hostname/port/path/auth)
	 *     so the next hop re-parses the URL cleanly.
	 *   - Drop the host header (re-derived from the new URL by simple-get).
	 *   - Cross-origin: drop cookie + authorization to prevent leak.
	 *   - 301/302 + POST: switch to GET, drop body and content headers.
	 *
	 * @private
	 * @param {Object} pOptions - The options used for the previous hop (post-simple-get mutation).
	 * @param {import('http').IncomingMessage} pResponse - The 3xx response.
	 * @param {string|undefined} pOriginalURL - The URL of the previous hop, captured before simple-get deleted it.
	 * @param {string|null} pOriginalHost - The hostname of the previous hop, for cross-origin detection.
	 * @return {Object}
	 */
	_buildRedirectedOptions(pOptions, pResponse, pOriginalURL, pOriginalHost)
	{
		const tmpNew = Object.assign({}, pOptions);
		tmpNew.url = this._resolveRedirectURL(pOriginalURL, pResponse.headers.location);

		// Strip simple-get's own URL-derived fields so the next call re-parses cleanly.
		delete tmpNew.protocol;
		delete tmpNew.hostname;
		delete tmpNew.port;
		delete tmpNew.path;
		delete tmpNew.auth;

		// We set followRedirects=false on the previous hop to disable
		// simple-get's auto-follow; that's our own internal flag, not caller
		// intent. Drop it so the recursive _executeWithRedirects entry treats
		// the next hop as another redirect-following call.
		delete tmpNew.followRedirects;

		// Headers — clone (don't mutate the caller's) and prune.
		if (tmpNew.headers)
		{
			tmpNew.headers = Object.assign({}, tmpNew.headers);
			delete tmpNew.headers.host;
		}

		// Cross-origin redirect: drop cookie and authorization to prevent leak (matches simple-get #73).
		const tmpRedirectHost = this._parseHostname(tmpNew.url);
		if (tmpRedirectHost !== null && tmpRedirectHost !== pOriginalHost && tmpNew.headers)
		{
			delete tmpNew.headers.cookie;
			delete tmpNew.headers.authorization;
		}

		// 301/302 + POST → GET (matches simple-get #35 and RFC 7231 §6.4.2/6.4.3).
		// Body and content headers come off; 307/308 preserve method/body so we leave them alone.
		if (tmpNew.method === 'POST' && (pResponse.statusCode === 301 || pResponse.statusCode === 302))
		{
			tmpNew.method = 'GET';
			if (tmpNew.headers)
			{
				delete tmpNew.headers['content-length'];
				delete tmpNew.headers['content-type'];
			}
			delete tmpNew.body;
			delete tmpNew.form;
		}

		return tmpNew;
	}

	/**
	 * Dispatch one hop through simple-get, normalizing a timeout into a coded
	 * error before anything downstream classifies it.
	 *
	 * simple-get reports a socket timeout as a bare Error carrying no `code` and
	 * no `cause` (index.js: `cb(new Error('Request timed out'))`), so the
	 * code-based transport matching in _evaluateRetryOutcome can never fire on
	 * it. The underlying request's own `timeout` event is the precise signal, so
	 * classification stays code-based rather than depending on simple-get's
	 * message text; the message is a fallback for transports that never emit the
	 * event (the browser http shim).
	 *
	 * @private
	 * @param {Object} pOptions - The prepared request options.
	 * @param {(err?: Error, res?: import('http').IncomingMessage) => void} fCallback
	 * @return {Object} The underlying request object.
	 */
	_dispatchRequest(pOptions, fCallback)
	{
		let tmpTimedOut = false;
		const tmpRequest = libSimpleGet(pOptions,
			(pError, pResponse) =>
			{
				if (pError && !pError.code && !(pError.cause && pError.cause.code)
					&& (tmpTimedOut || /timed out/i.test(pError.message || '')))
				{
					pError.code = 'ETIMEDOUT';
				}
				return fCallback(pError, pResponse);
			});
		// Prepended because simple-get's own timeout handler settles the
		// (once-wrapped) callback synchronously, so a plain listener would run
		// after the outcome had already been decided.
		if (tmpRequest && typeof tmpRequest.prependListener === 'function')
		{
			tmpRequest.prependListener('timeout', () => { tmpTimedOut = true; });
		}
		return tmpRequest;
	}

	/**
	 * Dispatch a request via simple-get, transparently following 3xx redirects
	 * until a non-redirect response or hard error.
	 *
	 * Why we drive the loop ourselves: simple-get's own redirect path
	 * (index.js lines 50-69) recurses with the original opts.agent intact, so
	 * an http→https redirect ends up calling https.request with an httpAgent
	 * (or vice versa) and Node throws ERR_INVALID_PROTOCOL synchronously.
	 * By disabling simple-get's auto-follow and running prepareRequestOptions
	 * on each hop, the agent gets re-picked to match the new URL's protocol.
	 *
	 * Caller can opt out by setting `followRedirects: false` on options
	 * (matches simple-get's contract) — in that case we hand the 3xx straight
	 * back without following.
	 *
	 * @private
	 * @param {Object} pOptions - Already passed through preRequest on the first call; on recursion, already passed through prepareRequestOptions.
	 * @param {(err?: Error, res?: import('http').IncomingMessage) => void} fCallback
	 */
	_executeWithRedirects(pOptions, fCallback)
	{
		if (pOptions.followRedirects === false)
		{
			return this._dispatchRequest(pOptions, fCallback);
		}

		// Disable simple-get's own redirect loop — we own it from here.
		pOptions.followRedirects = false;
		const tmpOriginalURL = pOptions.url;
		const tmpOriginalHost = this._parseHostname(tmpOriginalURL);

		return this._dispatchRequest(pOptions, (pError, pResponse) =>
		{
			if (pError)
			{
				return fCallback(pError, pResponse);
			}

			if (pResponse.statusCode < 300 || pResponse.statusCode >= 400 || !pResponse.headers.location)
			{
				return fCallback(null, pResponse);
			}

			// 3xx with Location — drain and follow.
			pResponse.resume();

			let tmpRedirectsRemaining = (typeof pOptions.maxRedirects === 'number') ? pOptions.maxRedirects : 10;
			if (tmpRedirectsRemaining <= 0)
			{
				return fCallback(new Error('too many redirects'));
			}

			const tmpNextOptions = this._buildRedirectedOptions(pOptions, pResponse, tmpOriginalURL, tmpOriginalHost);
			tmpNextOptions.maxRedirects = tmpRedirectsRemaining - 1;

			// Re-run the agent picker so the next hop's agent matches the
			// (possibly different) protocol of the redirect target. We do
			// NOT re-run preRequest in full — RestClientURLPrefix and
			// prepareCookies are first-call-only.
			const tmpPreparedNext = this.prepareRequestOptions(tmpNextOptions);

			if (this.TraceLog)
			{
				this.fable.log.debug(`--> redirect ${pResponse.statusCode} to ${tmpPreparedNext.url}`);
			}
			return this._executeWithRedirects(tmpPreparedNext, fCallback);
		});
	}

	executeChunkedRequest(pOptions, fCallback)
	{
		let tmpReplayOptions = this._captureReplayOptions(pOptions);

		let tmpOptions = this.preRequest(pOptions);

		tmpOptions.RequestStartTime = this.fable.log.getTimeStamp();

		if (this.TraceLog)
		{
			this.fable.log.debug(`Beginning ${tmpOptions.method} request to ${tmpOptions.url} at ${tmpOptions.RequestStartTime}`);
		}

		return this._executeWithRedirects(tmpOptions,
			(pError, pResponse)=>
			{
				if (pError)
				{
					return this._completeWithRetry(tmpReplayOptions, pError, pResponse, undefined,
						() => this.executeChunkedRequest(tmpReplayOptions, fCallback), fCallback);
				}

				if (this.TraceLog)
				{
					let tmpConnectTime = this.fable.log.getTimeStamp();
					this.fable.log.debug(`--> ${tmpOptions.method} connected in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpConnectTime)}ms code ${pResponse.statusCode}`);
				}

				let tmpData = '';

				pResponse.on('data', (pChunk) =>
					{
						// For JSON, the chunk is the serialized object.
						if (this.TraceLog)
						{
							let tmpChunkTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`--> ${tmpOptions.method} data chunk size ${pChunk.length}b received in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpChunkTime)}ms`);
						}
						tmpData += pChunk;
					});

				pResponse.on('end', ()=>
					{
						if (this.TraceLog)
						{
							let tmpCompletionTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`==> ${tmpOptions.method} completed data size ${tmpData.length}b received in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpCompletionTime)}ms`);
						}
						return this._completeWithRecovery(tmpReplayOptions, pError, pResponse, tmpData,
							() => this.executeChunkedRequest(tmpReplayOptions, fCallback), fCallback);
					});
			});
	}

	executeChunkedRequestBinary(pOptions, fCallback)
	{
		let tmpReplayOptions = this._captureReplayOptions(pOptions);

		let tmpOptions = this.preRequest(pOptions);

		tmpOptions.RequestStartTime = this.fable.log.getTimeStamp();

		if (this.TraceLog)
		{
			this.fable.log.debug(`Beginning ${tmpOptions.method} request to ${tmpOptions.url} at ${tmpOptions.RequestStartTime}`);
		}

		tmpOptions.json = false;
		tmpOptions.encoding = null;

		return this._executeWithRedirects(tmpOptions,
			(pError, pResponse)=>
			{
				if (pError)
				{
					return this._completeWithRetry(tmpReplayOptions, pError, pResponse, undefined,
						() => this.executeChunkedRequestBinary(tmpReplayOptions, fCallback), fCallback);
				}

				if (this.TraceLog)
				{
					let tmpConnectTime = this.fable.log.getTimeStamp();
					this.fable.log.debug(`--> ${tmpOptions.method} connected in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpConnectTime)}ms code ${pResponse.statusCode}`);
				}

				let tmpDataBuffer = false;

				pResponse.on('data', (pChunk) =>
					{
						// For JSON, the chunk is the serialized object.
						if (this.TraceLog)
						{
							let tmpChunkTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`--> ${tmpOptions.method} data chunk size ${pChunk.length}b received in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpChunkTime)}ms`);
						}
						// TODO: Potentially create a third option that streams this to a file?  So it doesn't have to hold it all in memory.
						if (!tmpDataBuffer)
						{
							tmpDataBuffer = Buffer.from(pChunk);
						}
						else
						{
							tmpDataBuffer = Buffer.concat([tmpDataBuffer, pChunk]);
						}
					});

				pResponse.on('end', ()=>
					{
						if (this.TraceLog)
						{
							let tmpCompletionTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`==> ${tmpOptions.method} completed data size ${tmpDataBuffer.length}b received in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpCompletionTime)}ms`);
						}
						return this._completeWithRecovery(tmpReplayOptions, pError, pResponse, tmpDataBuffer,
							() => this.executeChunkedRequestBinary(tmpReplayOptions, fCallback), fCallback);
					});
			});
	}

	/**
	 * Shallow-snapshot the caller's options BEFORE preRequest mutates them, so a
	 * recovery replay can re-run the same request cleanly. preRequest prepends
	 * RestClientURLPrefix to `url` in place; replaying the already-mutated object
	 * would double-prefix. Replaying from this snapshot re-runs preRequest once.
	 *
	 * @param {Object} pOptions - The caller's request options.
	 * @return {Object} A shallow copy safe to re-issue.
	 * @private
	 */
	_captureReplayOptions(pOptions)
	{
		return Object.assign({}, pOptions);
	}

	/**
	 * Invoke the authenticationRecovery hook under a single-flight guard. A burst
	 * of concurrent 401s shares one hook invocation; all await the same promise,
	 * then each replays independently. The shared promise is cleared on settle so
	 * a later, unrelated expiry re-arms recovery. Resolves to a strict boolean
	 * (true only when the hook resolved exactly true); rejects if the hook throws.
	 *
	 * @param {Object} pRequestContext - Context passed to the hook ({ options, response }).
	 * @return {Promise<boolean>}
	 * @private
	 */
	_runAuthenticationRecovery(pRequestContext)
	{
		if (this._authenticationRecoveryPromise)
		{
			return this._authenticationRecoveryPromise;
		}
		let tmpInvocation;
		try
		{
			tmpInvocation = Promise.resolve(this.authenticationRecovery(pRequestContext));
		}
		catch (pError)
		{
			tmpInvocation = Promise.reject(pError);
		}
		this._authenticationRecoveryPromise = tmpInvocation.then(
			(pResult) =>
			{
				this._authenticationRecoveryPromise = null;
				return (pResult === true);
			},
			(pError) =>
			{
				this._authenticationRecoveryPromise = null;
				throw pError;
			});
		return this._authenticationRecoveryPromise;
	}

	/**
	 * Shared completion seam for every request path. On a completed 401, with a
	 * recovery hook installed, on a request that is not itself already a replay,
	 * it awaits recovery: on success it replays the request exactly once (via
	 * fReplay, whose pReplayOptions carry the __authRetry marker so the replay can
	 * never re-enter recovery -- a hard one-retry cap); otherwise it delivers the
	 * original response to fCallback unchanged. Every other outcome (2xx, 5xx,
	 * timeout, no hook) passes straight through, so opt-out callers are untouched.
	 *
	 * @param {Object} pReplayOptions - The replay snapshot (also carries the retry marker).
	 * @param {Error|null} pError - The error from the request, if any.
	 * @param {Object} pResponse - The response object (statusCode read here).
	 * @param {*} pBody - The processed body for this path (parsed JSON / string / Buffer).
	 * @param {Function} fReplay - Re-issues the request from pReplayOptions.
	 * @param {Function} fCallback - The caller's callback (pError, pResponse, pBody).
	 * @private
	 */
	_completeWithRecovery(pReplayOptions, pError, pResponse, pBody, fReplay, fCallback)
	{
		if (pResponse && pResponse.statusCode === 401 && typeof this.authenticationRecovery === 'function' && !pReplayOptions.__authRetry)
		{
			// Stamp the one-retry marker before recovery so the replay can never
			// itself trigger another recovery pass.
			pReplayOptions.__authRetry = true;
			this._runAuthenticationRecovery({ options: pReplayOptions, response: pResponse }).then(
				(pRecovered) =>
				{
					if (pRecovered === true)
					{
						return this._invokeDetached(() => fReplay());
					}
					return this._invokeDetached(() => fCallback(pError, pResponse, pBody));
				},
				() =>
				{
					// A throwing/rejecting recovery is treated as "not recovered":
					// hand the original 401 back untouched.
					return this._invokeDetached(() => fCallback(pError, pResponse, pBody));
				});
			return;
		}
		return this._completeWithRetry(pReplayOptions, pError, pResponse, pBody, fReplay, fCallback);
	}

	/**
	 * Transient-failure seam. Every request path -- transport error, completed
	 * response, and parse failure -- funnels through here. When the resolved
	 * policy says the failure is transient AND the request is safe to replay,
	 * the request is re-issued after a backoff delay; otherwise the outcome is
	 * handed to the caller exactly as it arrived.
	 *
	 * @param {Object} pReplayOptions - The replay snapshot (also carries the attempt marker).
	 * @param {Error|null} pError - The error from the request, if any.
	 * @param {Object} [pResponse] - The response object, when one was received.
	 * @param {*} [pBody] - The processed body for this path.
	 * @param {Function} fReplay - Re-issues the request from pReplayOptions.
	 * @param {Function} fCallback - The caller's callback (pError, pResponse, pBody).
	 * @private
	 */
	_completeWithRetry(pReplayOptions, pError, pResponse, pBody, fReplay, fCallback)
	{
		const tmpPolicy = this.resolveRetryPolicy(pReplayOptions);
		const tmpAttemptsMade = (pReplayOptions.__retryAttempt || 0) + 1;
		const tmpEvaluation = this._evaluateRetryOutcome(tmpPolicy, pReplayOptions, pError, pResponse, pBody);
		const tmpDelayMS = tmpEvaluation.DelayMS;

		/** @type {RestClientRetryContext} */
		const tmpContext =
		{
			Options: pReplayOptions,
			Error: pError,
			Response: pResponse,
			Body: pBody,
			Policy: tmpPolicy,
			AttemptsMade: tmpAttemptsMade,
			DelayMS: (tmpDelayMS < 0) ? null : tmpDelayMS
		};

		if (tmpDelayMS < 0)
		{
			// Exhaustion is specifically "still failing transiently, no budget
			// left" -- not merely "settled after having retried". A replay that
			// finally succeeded, and any outcome the policy never wanted to retry
			// (a 404, a plain POST), is an ordinary completion.
			if (tmpEvaluation.Exhausted)
			{
				const fExhaustedHook = this._resolveRetryHook(pReplayOptions, 'OnRetryExhausted', 'onRetryExhausted');
				if (fExhaustedHook)
				{
					this._runRetryHook(fExhaustedHook, tmpContext, 'onRetryExhausted').then(
						() => { return this._invokeDetached(() => fCallback(pError, pResponse, pBody)); });
					return;
				}
			}
			else if (tmpPolicy.MaxAttempts > 1 && (pError || (pResponse && pResponse.statusCode >= 400))
				&& this._isRetryableRequest(pReplayOptions, tmpPolicy))
			{
				// Retry was enabled and this request was eligible, yet the failure
				// classified as non-transient. Without this line that decision is
				// indistinguishable from retry never having been configured, which
				// is exactly how a misclassified failure hides.
				this.fable.log.debug(`RestClient not retrying ${pReplayOptions.method || 'GET'} ${pReplayOptions.url}: failure classified as non-transient.`,
					{
						Action: 'RestClientRetryDeclined',
						StatusCode: (pResponse && pResponse.statusCode) || null,
						ErrorCode: (pError && pError.code) || null,
						ErrorMessage: (pError && pError.message) || null
					});
			}
			return fCallback(pError, pResponse, pBody);
		}

		pReplayOptions.__retryAttempt = tmpAttemptsMade;

		const tmpReason = (pResponse && typeof pResponse.statusCode === 'number')
			? `HTTP ${pResponse.statusCode}`
			: `transport error ${(pError && (pError.code || pError.message)) || 'unknown'}`;
		this.fable.log.warn(`RestClient retrying ${pReplayOptions.method || 'GET'} ${pReplayOptions.url} after ${tmpReason} (attempt ${tmpAttemptsMade + 1} of ${tmpPolicy.MaxAttempts}, waiting ${tmpDelayMS}ms).`,
			{
				Action: 'RestClientRetry',
				Attempt: tmpAttemptsMade + 1,
				MaxAttempts: tmpPolicy.MaxAttempts,
				DelayMS: tmpDelayMS,
				StatusCode: (pResponse && pResponse.statusCode) || null,
				ErrorCode: (pError && pError.code) || null
			});

		// The hook runs before the backoff so any refresh work it does is
		// complete by the time the replay leaves. Resolving exactly false vetoes
		// the retry; the outcome in hand is delivered unchanged.
		const fBeforeHook = this._resolveRetryHook(pReplayOptions, 'OnBeforeRetry', 'onBeforeRetry');
		if (!fBeforeHook)
		{
			// No hook: stay off the promise chain entirely. This is the common
			// path, and keeping it synchronous keeps its failure modes identical
			// to a non-retried request's.
			this.retryTimerFunction(() => { fReplay(); }, tmpDelayMS);
			return;
		}
		this._runRetryHook(fBeforeHook, tmpContext, 'onBeforeRetry').then(
			(pHookResult) =>
			{
				if (pHookResult === false)
				{
					// Roll the marker back so the veto does not consume an attempt.
					pReplayOptions.__retryAttempt = tmpAttemptsMade - 1;
					return this._invokeDetached(() => fCallback(pError, pResponse, pBody));
				}
				this.retryTimerFunction(() => { fReplay(); }, tmpDelayMS);
			});
		return;
	}

	executeJSONRequest(pOptions, fCallback)
	{
		pOptions.json = true;

		let tmpReplayOptions = this._captureReplayOptions(pOptions);

		let tmpOptions = this.preRequest(pOptions);

		if (!('headers' in tmpOptions))
		{
			tmpOptions.headers = {};
		}
		/* Automated headers break some APIs
		if (!('Content-Type' in tmpOptions.headers))
		{
			tmpOptions.headers['Content-Type'] = 'application/json';
		}
		*/

		tmpOptions.RequestStartTime = this.fable.log.getTimeStamp();

		if (this.TraceLog)
		{
			this.fable.log.debug(`Beginning ${tmpOptions.method} JSON request to ${tmpOptions.url} at ${tmpOptions.RequestStartTime}`);
		}

		return this._executeWithRedirects(tmpOptions,
			(pError, pResponse)=>
			{
				if (pError)
				{
					return this._completeWithRetry(tmpReplayOptions, pError, pResponse, undefined,
						() => this.executeJSONRequest(tmpReplayOptions, fCallback), fCallback);
				}

				if (this.TraceLog)
				{
					let tmpConnectTime = this.fable.log.getTimeStamp();
					this.fable.log.debug(`--> JSON ${tmpOptions.method} connected in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpConnectTime)}ms code ${pResponse.statusCode}`);
				}

				let tmpJSONData = '';

				pResponse.on('data', (pChunk) =>
					{
						if (this.TraceLog)
						{
							let tmpChunkTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`--> JSON ${tmpOptions.method} data chunk size ${pChunk.length}b received in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpChunkTime)}ms`);
						}
						tmpJSONData += pChunk;
					});

				pResponse.on('end', ()=>
					{
						if (this.TraceLog)
						{
							let tmpCompletionTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`==> JSON ${tmpOptions.method} completed - received in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpCompletionTime)}ms`);
						}
						let tmpParsedJSON;
						if (tmpJSONData.length < 1
							&& ((NO_CONTENT_STATUS_CODES.indexOf(pResponse.statusCode) > -1) || (tmpOptions.method === 'HEAD')))
						{
							// A response DEFINED to carry no body -- those statuses,
							// or any HEAD -- is not a parse failure. Narrowed on
							// purpose: an empty body on a 200 GET still means the
							// response was truncated or the server misbehaved.
							return this._completeWithRecovery(tmpReplayOptions, pError, pResponse, null,
								() => this.executeJSONRequest(tmpReplayOptions, fCallback), fCallback);
						}
						try
						{
							tmpParsedJSON = JSON.parse(tmpJSONData);
						}
						catch (pParseError)
						{
							// A gateway that fails mid-flight often answers with a
							// non-JSON error page, so this path is retry-eligible on
							// the response status (a 200 with garbage is not).
							let tmpStatusCode = pResponse ? pResponse.statusCode : 'unknown';
							let tmpUnparseableError = new Error(`JSON parse failed (HTTP ${tmpStatusCode}): ${tmpJSONData.substring(0, 200)}`);
							return this._completeWithRetry(tmpReplayOptions, tmpUnparseableError, pResponse, null,
								() => this.executeJSONRequest(tmpReplayOptions, fCallback), fCallback);
						}
						return this._completeWithRecovery(tmpReplayOptions, pError, pResponse, tmpParsedJSON,
							() => this.executeJSONRequest(tmpReplayOptions, fCallback), fCallback);
					});
			});
	}

	getJSON(pOptionsOrURL, fCallback)
	{
		let tmpRequestOptions = (typeof(pOptionsOrURL) == 'object') ? pOptionsOrURL : {};
		if (typeof(pOptionsOrURL) == 'string')
		{
			tmpRequestOptions.url = pOptionsOrURL;
		}

		tmpRequestOptions.method = 'GET';

		return this.executeJSONRequest(tmpRequestOptions, fCallback);
	}

	putJSON(pOptions, fCallback)
	{
		if (typeof(pOptions.body) != 'object')
		{
			return fCallback(new Error(`PUT JSON Error Invalid options object`));
		}

		pOptions.method = 'PUT';

		return this.executeJSONRequest(pOptions, fCallback);
	}

	postJSON(pOptions, fCallback)
	{
		if (typeof(pOptions.body) != 'object')
		{
			return fCallback(new Error(`POST JSON Error Invalid options object`));
		}

		pOptions.method = 'POST';

		return this.executeJSONRequest(pOptions, fCallback);
	}

	patchJSON(pOptions, fCallback)
	{
		if (typeof(pOptions.body) != 'object')
		{
			return fCallback(new Error(`PATCH JSON Error Invalid options object`));
		}

		pOptions.method = 'PATCH';

		return this.executeJSONRequest(pOptions, fCallback);
	}

	headJSON(pOptions, fCallback)
	{
		pOptions.method = 'HEAD';

		return this.executeJSONRequest(pOptions, fCallback);
	}

	delJSON(pOptions, fCallback)
	{
		pOptions.method = 'DELETE';

		return this.executeJSONRequest(pOptions, fCallback);
	}

	/**
	 * Upload binary data via POST.
	 *
	 * Accepts Buffer, Blob, or File as the body. In the browser, Blob/File
	 * bodies are converted to Buffer (via ArrayBuffer) before being passed
	 * to simple-get so the stream-http shim can send them correctly.
	 *
	 * The response body is read as a string (servers typically return JSON
	 * status for upload endpoints).
	 *
	 * @param {Record<string, any>} pOptions - Request options (url, body, headers, method)
	 * @param {(pError?: Error, pResponse: any, pBody?: any) => void} fCallback - Callback (pError, pResponse, pBody)
	 * @param {(pProgress: number) => void} [fOnProgress] - Optional progress callback (0.0 to 1.0); called with 1.0 on completion
	 */
	executeBinaryUpload(pOptions, fCallback, fOnProgress)
	{
		// Blob/File → Buffer conversion for simple-get compatibility
		let tmpBody = pOptions.body;

		if (typeof Blob !== 'undefined' && tmpBody instanceof Blob)
		{
			let tmpSelf = this;
			tmpBody.arrayBuffer()
				.then(
					(pArrayBuffer) =>
					{
						pOptions.body = Buffer.from(pArrayBuffer);
						tmpSelf._executeBinaryUploadInternal(pOptions, fCallback, fOnProgress);
					})
				.catch(
					(pError) =>
					{
						return fCallback(pError);
					});
			return;
		}

		// Already a Buffer, string, or stream — proceed directly
		return this._executeBinaryUploadInternal(pOptions, fCallback, fOnProgress);
	}

	/**
	 * Internal binary upload implementation using simple-get.
	 *
	 * @param {Record<string, any>} pOptions - Request options with body already as Buffer
	 * @param {(pError?: Error, pResponse: any, pBody?: any) => void} fCallback - Callback (pError, pResponse, pBody)
	 * @param {(pProgress: number) => void} [fOnProgress] - Optional progress callback (0.0 to 1.0); called with 1.0 on completion
	 * @private
	 */
	_executeBinaryUploadInternal(pOptions, fCallback, fOnProgress)
	{
		let tmpReplayOptions = this._captureReplayOptions(pOptions);

		let tmpOptions = this.preRequest(pOptions);

		tmpOptions.RequestStartTime = this.fable.log.getTimeStamp();

		if (this.TraceLog)
		{
			this.fable.log.debug(`Beginning ${tmpOptions.method} binary upload to ${tmpOptions.url} at ${tmpOptions.RequestStartTime}`);
		}

		tmpOptions.json = false;

		return this._executeWithRedirects(tmpOptions,
			(pError, pResponse) =>
			{
				if (pError)
				{
					return this._completeWithRetry(tmpReplayOptions, pError, pResponse, undefined,
						() => this._executeBinaryUploadInternal(tmpReplayOptions, fCallback, fOnProgress), fCallback);
				}

				if (this.TraceLog)
				{
					let tmpConnectTime = this.fable.log.getTimeStamp();
					this.fable.log.debug(`--> Binary upload ${tmpOptions.method} connected in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpConnectTime)}ms code ${pResponse.statusCode}`);
				}

				let tmpData = '';

				pResponse.on('data', (pChunk) =>
					{
						if (this.TraceLog)
						{
							let tmpChunkTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`--> Binary upload ${tmpOptions.method} response chunk size ${pChunk.length}b received in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpChunkTime)}ms`);
						}
						tmpData += pChunk;
					});

				pResponse.on('end', () =>
					{
						if (this.TraceLog)
						{
							let tmpCompletionTime = this.fable.log.getTimeStamp();
							this.fable.log.debug(`==> Binary upload ${tmpOptions.method} completed in ${this.dataFormat.formatTimeDelta(tmpOptions.RequestStartTime, tmpCompletionTime)}ms`);
						}
						// Deliver terminally: fire the completion progress only when
						// we actually hand the response back (not when we are about to
						// replay after recovery -- the replay signals its own progress).
						let fDeliver = (pDeliverError, pDeliverResponse, pDeliverBody) =>
						{
							if (typeof fOnProgress === 'function')
							{
								fOnProgress(1.0);
							}
							return fCallback(pDeliverError, pDeliverResponse, pDeliverBody);
						};
						return this._completeWithRecovery(tmpReplayOptions, pError, pResponse, tmpData,
							() => this._executeBinaryUploadInternal(tmpReplayOptions, fCallback, fOnProgress), fDeliver);
					});
			});
	}

	/**
	 * The stock retry policy, as a fresh copy callers can inspect or clone.
	 *
	 * @return {RestClientRetryPolicy} A copy of the default policy.
	 */
	static get DefaultRetryPolicy()
	{
		return Object.assign({}, DEFAULT_RETRY_POLICY);
	}

	getRawText(pOptionsOrURL, fCallback)
	{
		let tmpRequestOptions = (typeof(pOptionsOrURL) == 'object') ? pOptionsOrURL : {};
		if (typeof(pOptionsOrURL) == 'string')
		{
			tmpRequestOptions.url = pOptionsOrURL;
		}

		tmpRequestOptions.method = 'GET';

		return this.executeChunkedRequest(tmpRequestOptions, fCallback);
	}
}

module.exports = FableServiceRestClient;
