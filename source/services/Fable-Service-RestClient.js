const libFableServiceBase = require('fable-serviceproviderbase');

const libSimpleGet = require('simple-get');
const libCookie = require('cookie');
const libHttp = require('http');
const libHttps = require('https');

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
			if (tmpCookieKeys.length > 0)
			{
				// Only grab the first for now.
				pRequestOptions.headers.cookie = libCookie.serialize(tmpCookieKeys[0], tmpCookieObject[tmpCookieKeys[0]]);
			}
		}
		return pRequestOptions;
	}

	preRequest(pOptions)
	{
		// Validate the options object
		let tmpOptions = this.prepareCookies(pOptions);

		// Prepend a string to the URL if it exists in the Fable Config
		if ('RestClientURLPrefix' in this.fable.settings)
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
			return libSimpleGet(pOptions, fCallback);
		}

		// Disable simple-get's own redirect loop — we own it from here.
		pOptions.followRedirects = false;
		const tmpOriginalURL = pOptions.url;
		const tmpOriginalHost = this._parseHostname(tmpOriginalURL);

		return libSimpleGet(pOptions, (pError, pResponse) =>
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
					return fCallback(pError, pResponse);
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
					return fCallback(pError, pResponse);
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
						return fReplay();
					}
					return fCallback(pError, pResponse, pBody);
				},
				() =>
				{
					// A throwing/rejecting recovery is treated as "not recovered":
					// hand the original 401 back untouched.
					return fCallback(pError, pResponse, pBody);
				});
			return;
		}
		return fCallback(pError, pResponse, pBody);
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
					return fCallback(pError, pResponse);
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
						try
						{
							tmpParsedJSON = JSON.parse(tmpJSONData);
						}
						catch (pParseError)
						{
							let tmpStatusCode = pResponse ? pResponse.statusCode : 'unknown';
							return fCallback(new Error(`JSON parse failed (HTTP ${tmpStatusCode}): ${tmpJSONData.substring(0, 200)}`), pResponse, null);
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
		if (typeof(pOptions.body) != 'object')
		{
			return fCallback(new Error(`HEAD JSON Error Invalid options object`));
		}

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
					return fCallback(pError, pResponse);
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
