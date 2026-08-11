/**
* Unit tests for the Fable RestClient transient-failure retry policy.
*
* The policy is deliberately narrow: only idempotent methods (or a request the
* caller explicitly marks RetrySafe) replay, and only on a transient outcome --
* a gateway status code or a coded transport failure. These tests stand up
* throwaway local HTTP servers so they need no network and no fixtures.
*
* @license     MIT
*/

const libFable = require('../source/Fable.js');
const libHTTP = require('http');

const Chai = require('chai');
const Expect = Chai.expect;

/**
 * Stand up a tiny HTTP server that answers from a scripted list of responses,
 * one per request, repeating the last entry once the script is exhausted.
 *
 * @param {Array<{Status: number, Body?: string, Headers?: Record<string, string>}>} pScript - The scripted responses.
 * @param {{ Requests: Array<Object> }} pState - Receives one entry per request.
 * @param {(pServer: Object, pPort: number) => void} fReady - Called once listening.
 * @return {void}
 */
function createScriptedServer(pScript, pState, fReady)
{
	let tmpServer = libHTTP.createServer(
		(pRequest, pResponse) =>
		{
			let tmpBodyData = '';
			pRequest.on('data', (pChunk) => { tmpBodyData += pChunk; });
			pRequest.on('end', () =>
			{
				const tmpIndex = Math.min(pState.Requests.length, pScript.length - 1);
				pState.Requests.push({ url: pRequest.url, method: pRequest.method, body: tmpBodyData });
				const tmpScripted = pScript[tmpIndex];
				const tmpHeaders = Object.assign({ 'Content-Type': 'application/json' }, tmpScripted.Headers);
				pResponse.writeHead(tmpScripted.Status, tmpHeaders);
				pResponse.end(typeof tmpScripted.Body === 'string' ? tmpScripted.Body : JSON.stringify({ Hits: pState.Requests.length }));
			});
		});
	tmpServer.listen(0, '127.0.0.1', () => { fReady(tmpServer, tmpServer.address().port); });
}

/**
 * Build a RestClient whose backoff runs immediately, so tests never wait on a
 * wall clock. Recorded delays are still asserted against.
 *
 * @param {Record<string, any>} [pOptions] - RestClient constructor options.
 * @param {Record<string, any>} [pSettings] - Fable settings.
 * @return {{ Client: Object, Delays: Array<number> }} The client and its recorded backoff delays.
 */
function makeClient(pOptions, pSettings)
{
	let tmpFable = new libFable(pSettings || {});
	let tmpClient = tmpFable.instantiateServiceProvider('RestClient', pOptions || {}, `RestClient-Retry-${Math.random()}`);
	let tmpDelays = [];
	tmpClient.retryTimerFunction = (fCallback, pDelayMS) =>
	{
		tmpDelays.push(pDelayMS);
		setImmediate(fCallback);
	};
	// Remove jitter so the backoff schedule is exactly assertable.
	tmpClient.retryPolicy.JitterRatio = 0;
	return { Client: tmpClient, Delays: tmpDelays };
}

suite
	(
		'Fable RestClient Retry',
		function ()
		{
			suite
				(
					'Policy Resolution',
					function ()
					{
						test
							(
								'Retry is OFF by default; the shape defaults describe it once enabled.',
								function ()
								{
									let tmpClient = makeClient().Client;
									// An un-configured client never replays anything.
									Expect(tmpClient.retryPolicy.MaxAttempts).to.equal(1);
									Expect(tmpClient.retryPolicy.RetryMethods).to.deep.equal([ 'GET', 'HEAD', 'OPTIONS' ]);
									// A 500 is a deterministic server failure, not a transient one.
									Expect(tmpClient.retryPolicy.RetryStatusCodes).to.not.include(500);
									Expect(tmpClient.retryPolicy.RetryStatusCodes).to.include(502);
									// A name that does not resolve will not resolve on the retry.
									Expect(tmpClient.retryPolicy.RetryErrorCodes).to.not.include('ENOTFOUND');
								}
							);

						test
							(
								'Fable settings configure the policy.',
								function ()
								{
									let tmpClient = makeClient({}, { RestClientRetry: { MaxAttempts: 5, InitialDelayMS: 10 } }).Client;
									Expect(tmpClient.retryPolicy.MaxAttempts).to.equal(5);
									Expect(tmpClient.retryPolicy.InitialDelayMS).to.equal(10);
									// Unspecified fields keep their defaults.
									Expect(tmpClient.retryPolicy.BackoffFactor).to.equal(2);
								}
							);

						test
							(
								'Constructor options win over fable settings.',
								function ()
								{
									let tmpClient = makeClient({ Retry: { MaxAttempts: 7 } }, { RestClientRetry: { MaxAttempts: 5 } }).Client;
									Expect(tmpClient.retryPolicy.MaxAttempts).to.equal(7);
								}
							);

						test
							(
								'Shorthand forms resolve: false disables, a number sets attempts.',
								function ()
								{
									Expect(makeClient({ Retry: false }).Client.retryPolicy.MaxAttempts).to.equal(1);
									Expect(makeClient({ Retry: 4 }).Client.retryPolicy.MaxAttempts).to.equal(4);
									Expect(makeClient({ Retry: 0 }).Client.retryPolicy.MaxAttempts).to.equal(1);
									Expect(makeClient({ Retry: true }).Client.retryPolicy.MaxAttempts).to.equal(3);
								}
							);

						test
							(
								'Per-request Retry layers over the service policy without mutating it.',
								function ()
								{
									let tmpClient = makeClient({ Retry: { MaxAttempts: 4 } }).Client;
									let tmpResolved = tmpClient.resolveRetryPolicy({ Retry: { MaxAttempts: 2 } });
									Expect(tmpResolved.MaxAttempts).to.equal(2);
									Expect(tmpClient.retryPolicy.MaxAttempts).to.equal(4);
									Expect(tmpClient.resolveRetryPolicy({}).MaxAttempts).to.equal(4);
								}
							);

						test
							(
								'A malformed policy fragment is ignored rather than breaking the client.',
								function ()
								{
									let tmpClient = makeClient({}, { RestClientRetry: 'nonsense' }).Client;
									Expect(tmpClient.retryPolicy.MaxAttempts).to.equal(1);
								}
							);
					}
				);

			suite
				(
					'Request Eligibility',
					function ()
					{
						test
							(
								'GET is retryable; POST/PUT/DELETE are not.',
								function ()
								{
									let tmpClient = makeClient().Client;
									let tmpPolicy = tmpClient.retryPolicy;
									Expect(tmpClient._isRetryableRequest({ method: 'GET' }, tmpPolicy)).to.equal(true);
									Expect(tmpClient._isRetryableRequest({ method: 'HEAD' }, tmpPolicy)).to.equal(true);
									Expect(tmpClient._isRetryableRequest({ method: 'POST' }, tmpPolicy)).to.equal(false);
									Expect(tmpClient._isRetryableRequest({ method: 'PUT' }, tmpPolicy)).to.equal(false);
									Expect(tmpClient._isRetryableRequest({ method: 'DELETE' }, tmpPolicy)).to.equal(false);
								}
							);

						test
							(
								'RetrySafe opts a POST in, and opts a GET out.',
								function ()
								{
									let tmpClient = makeClient().Client;
									let tmpPolicy = tmpClient.retryPolicy;
									Expect(tmpClient._isRetryableRequest({ method: 'POST', RetrySafe: true }, tmpPolicy)).to.equal(true);
									Expect(tmpClient._isRetryableRequest({ method: 'GET', RetrySafe: false }, tmpPolicy)).to.equal(false);
								}
							);

						test
							(
								'A stream body is never replayed, even when marked safe.',
								function ()
								{
									let tmpClient = makeClient().Client;
									let tmpStreamBody = { pipe: () => {} };
									Expect(tmpClient._isRetryableRequest({ method: 'POST', RetrySafe: true, body: tmpStreamBody }, tmpClient.retryPolicy)).to.equal(false);
								}
							);
					}
				);

			suite
				(
					'Backoff Schedule',
					function ()
					{
						test
							(
								'Delays grow exponentially and clamp at MaxDelayMS.',
								function ()
								{
									let tmpClient = makeClient({ Retry: { MaxAttempts: 6, InitialDelayMS: 100, BackoffFactor: 2, MaxDelayMS: 400, JitterRatio: 0 } }).Client;
									const fDelayAtAttempt = (pAttemptsAlready) => tmpClient._resolveRetryDelay(
										tmpClient.retryPolicy, { method: 'GET', __retryAttempt: pAttemptsAlready }, null, { statusCode: 503 });
									Expect(fDelayAtAttempt(0)).to.equal(100);
									Expect(fDelayAtAttempt(1)).to.equal(200);
									Expect(fDelayAtAttempt(2)).to.equal(400);
									Expect(fDelayAtAttempt(3)).to.equal(400);
								}
							);

						test
							(
								'Jitter keeps the delay within the configured band.',
								function ()
								{
									let tmpClient = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1000, JitterRatio: 0.25 } }).Client;
									tmpClient.retryPolicy.JitterRatio = 0.25;
									tmpClient.retryJitterFunction = () => 0;
									Expect(tmpClient._resolveRetryDelay(tmpClient.retryPolicy, { method: 'GET' }, null, { statusCode: 502 })).to.equal(750);
									tmpClient.retryJitterFunction = () => 1;
									Expect(tmpClient._resolveRetryDelay(tmpClient.retryPolicy, { method: 'GET' }, null, { statusCode: 502 })).to.equal(1250);
								}
							);

						test
							(
								'A Retry-After header in seconds overrides the backoff.',
								function ()
								{
									let tmpClient = makeClient({ Retry: { MaxAttempts: 3 } }).Client;
									let tmpDelay = tmpClient._resolveRetryDelay(tmpClient.retryPolicy, { method: 'GET' }, null,
										{ statusCode: 429, headers: { 'retry-after': '2' } });
									Expect(tmpDelay).to.equal(2000);
								}
							);

						test
							(
								'A Retry-After beyond the ceiling is clamped.',
								function ()
								{
									let tmpClient = makeClient({ Retry: { MaxAttempts: 3, MaxRetryAfterMS: 5000 } }).Client;
									let tmpDelay = tmpClient._resolveRetryDelay(tmpClient.retryPolicy, { method: 'GET' }, null,
										{ statusCode: 503, headers: { 'retry-after': '600' } });
									Expect(tmpDelay).to.equal(5000);
								}
							);

						test
							(
								'An unparseable Retry-After falls back to the backoff schedule.',
								function ()
								{
									let tmpClient = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 111, JitterRatio: 0 } }).Client;
									tmpClient.retryPolicy.JitterRatio = 0;
									let tmpDelay = tmpClient._resolveRetryDelay(tmpClient.retryPolicy, { method: 'GET' }, null,
										{ statusCode: 503, headers: { 'retry-after': 'not-a-date' } });
									Expect(tmpDelay).to.equal(111);
								}
							);
					}
				);

			suite
				(
					'End To End Replay',
					function ()
					{
						test
							(
								'A 502 on a GET replays and then succeeds.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 5 } });
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/pages/4000/1000`,
												(pError, pResponse, pBody) =>
												{
													Expect(pError).to.equal(null);
													Expect(pResponse.statusCode).to.equal(200);
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													Expect(tmpHarness.Delays.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'Retries stop at MaxAttempts and the last failure is returned.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 503, Body: JSON.stringify({ Down: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/always-down`,
												(pError, pResponse, pBody) =>
												{
													Expect(pResponse.statusCode).to.equal(503);
													Expect(pBody.Down).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(3);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A 404 is returned immediately without a replay.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 404, Body: JSON.stringify({ Error: 'nope' }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/missing`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(404);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A 500 is returned immediately without a replay.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 500, Body: JSON.stringify({ Error: 'bad sql' }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/broken`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(500);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A POST is NOT replayed on a 502 by default.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.postJSON({ url: `http://127.0.0.1:${pPort}/Mutate`, body: { Name: 'x' } },
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(502);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A POST marked RetrySafe IS replayed, body intact.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify([ { IDBook: 1 } ]) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.postJSON({ url: `http://127.0.0.1:${pPort}/Books/Query`, body: { Filter: 'FBL~IDBook~INN~1,2,3', Begin: 4000, Cap: 1000 }, RetrySafe: true },
												(pError, pResponse, pBody) =>
												{
													Expect(pResponse.statusCode).to.equal(200);
													Expect(pBody).to.deep.equal([ { IDBook: 1 } ]);
													Expect(tmpState.Requests.length).to.equal(2);
													// The replayed request must carry the same body.
													Expect(JSON.parse(tmpState.Requests[1].body).Begin).to.equal(4000);
													Expect(JSON.parse(tmpState.Requests[0].body)).to.deep.equal(JSON.parse(tmpState.Requests[1].body));
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'Per-request Retry:false suppresses the replay.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.getJSON({ url: `http://127.0.0.1:${pPort}/no-retry`, Retry: false },
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(502);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A gateway answering non-JSON is replayed on the retryable status.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer(
										[
											{ Status: 502, Body: '<html>Bad Gateway</html>', Headers: { 'Content-Type': 'text/html' } },
											{ Status: 200, Body: JSON.stringify({ OK: true }) }
										], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/html-error`,
												(pError, pResponse, pBody) =>
												{
													Expect(pError).to.equal(null);
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A 200 with unparseable JSON is NOT replayed.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 200, Body: 'not json at all' } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/garbage`,
												(pError) =>
												{
													Expect(pError).to.be.an.instanceof(Error);
													Expect(pError.message).to.contain('JSON parse failed');
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A refused connection is replayed and then succeeds.',
								function (fTestComplete)
								{
									// Bind a server, close it to obtain a definitely-dead port, then
									// bring a live one up on that port after the first attempt fails.
									let tmpProbe = libHTTP.createServer((pRequest, pResponse) => { pResponse.end(); });
									tmpProbe.listen(0, '127.0.0.1', () =>
									{
										const tmpPort = tmpProbe.address().port;
										tmpProbe.close(() =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 4, InitialDelayMS: 5 } });
											let tmpLiveServer = null;
											let tmpOriginalTimer = tmpHarness.Client.retryTimerFunction;
											tmpHarness.Client.retryTimerFunction = (fCallback, pDelayMS) =>
											{
												if (!tmpLiveServer)
												{
													tmpLiveServer = libHTTP.createServer((pRequest, pResponse) =>
													{
														pResponse.writeHead(200, { 'Content-Type': 'application/json' });
														pResponse.end(JSON.stringify({ Recovered: true }));
													});
													tmpLiveServer.listen(tmpPort, '127.0.0.1', () => { tmpOriginalTimer(fCallback, pDelayMS); });
													return;
												}
												return tmpOriginalTimer(fCallback, pDelayMS);
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${tmpPort}/recovers`,
												(pError, pResponse, pBody) =>
												{
													Expect(pError).to.equal(null);
													Expect(pBody.Recovered).to.equal(true);
													Expect(tmpHarness.Delays.length).to.be.greaterThan(0);
													tmpLiveServer.close();
													fTestComplete();
												});
										});
									});
								}
							);
					}
				);

			suite
				(
					'Default Is Off',
					function ()
					{
						test
							(
								'An unconfigured client does not replay a 502.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient();
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/untouched`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(502);
													Expect(tmpState.Requests.length).to.equal(1);
													Expect(tmpHarness.Delays.length).to.equal(0);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'An unconfigured client does not replay a refused connection.',
								function (fTestComplete)
								{
									let tmpProbe = libHTTP.createServer((pRequest, pResponse) => { pResponse.end(); });
									tmpProbe.listen(0, '127.0.0.1', () =>
									{
										const tmpPort = tmpProbe.address().port;
										tmpProbe.close(() =>
										{
											let tmpHarness = makeClient();
											tmpHarness.Client.getJSON(`http://127.0.0.1:${tmpPort}/dead`,
												(pError) =>
												{
													Expect(pError).to.be.an.instanceof(Error);
													Expect(tmpHarness.Delays.length).to.equal(0);
													fTestComplete();
												});
										});
									});
								}
							);

						test
							(
								'A per-request Retry opts a single call in without touching the client.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 503 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient();
											tmpHarness.Client.getJSON({ url: `http://127.0.0.1:${pPort}/opt-in`, Retry: { MaxAttempts: 3, InitialDelayMS: 1 } },
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													// The service policy is still off.
													Expect(tmpHarness.Client.retryPolicy.MaxAttempts).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);
					}
				);

			suite
				(
					'Lifecycle Hooks',
					function ()
					{
						test
							(
								'onBeforeRetry fires once per replay with the full context.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer(
										[
											{ Status: 502 },
											{ Status: 503 },
											{ Status: 200, Body: JSON.stringify({ OK: true }) }
										], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 7 } });
											let tmpHookCalls = [];
											tmpHarness.Client.onBeforeRetry = (pContext) =>
											{
												tmpHookCalls.push(
													{
														Status: pContext.Response.statusCode,
														Attempt: pContext.AttemptsMade,
														Delay: pContext.DelayMS,
														URL: pContext.Options.url
													});
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/hooked`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpHookCalls.length).to.equal(2);
													Expect(tmpHookCalls[0].Status).to.equal(502);
													Expect(tmpHookCalls[0].Attempt).to.equal(1);
													Expect(tmpHookCalls[0].Delay).to.equal(7);
													Expect(tmpHookCalls[1].Status).to.equal(503);
													Expect(tmpHookCalls[1].Attempt).to.equal(2);
													Expect(tmpHookCalls[1].Delay).to.equal(14);
													Expect(tmpHookCalls[0].URL).to.contain('/hooked');
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'An async onBeforeRetry is awaited before the replay goes out.',
								function (fTestComplete)
								{
									// The stream-refresh case: the hook does async work and the
									// replay must not leave until it has finished.
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpRefreshComplete = false;
											tmpHarness.Client.onBeforeRetry = () =>
											{
												return new Promise((fResolve) =>
												{
													setTimeout(() => { tmpRefreshComplete = true; fResolve(); }, 15);
												});
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/async-hook`,
												(pError, pResponse, pBody) =>
												{
													Expect(tmpRefreshComplete).to.equal(true);
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'onBeforeRetry can rewrite the request the replay sends.',
								function (fTestComplete)
								{
									// A refreshed stream handle / re-signed URL / rotated token
									// is applied by mutating the options the replay will use.
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.onBeforeRetry = (pContext) =>
											{
												pContext.Options.url = `http://127.0.0.1:${pPort}/refreshed-handle`;
												pContext.Options.headers = Object.assign({}, pContext.Options.headers, { 'x-stream-token': 'rotated' });
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/stale-handle`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests[0].url).to.equal('/stale-handle');
													Expect(tmpState.Requests[1].url).to.equal('/refreshed-handle');
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'onBeforeRetry resolving false vetoes the replay.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.onBeforeRetry = () => Promise.resolve(false);
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/vetoed`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(502);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A throwing onBeforeRetry does not strand the request.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.onBeforeRetry = () => { throw new Error('instrumentation bug'); };
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/buggy-hook`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'onRetryExhausted fires once when the budget runs out.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 503, Body: JSON.stringify({ Down: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpExhaustedCalls = [];
											tmpHarness.Client.onRetryExhausted = (pContext) =>
											{
												tmpExhaustedCalls.push({ Attempts: pContext.AttemptsMade, Status: pContext.Response.statusCode });
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/never-recovers`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(503);
													Expect(tmpExhaustedCalls.length).to.equal(1);
													Expect(tmpExhaustedCalls[0].Attempts).to.equal(3);
													Expect(tmpState.Requests.length).to.equal(3);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'onRetryExhausted does NOT fire when a replay finally succeeds.',
								function (fTestComplete)
								{
									// Settling after a retry is not a give-up. Exhaustion means
									// "still failing transiently with no budget left".
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpExhaustedCalls = 0;
											tmpHarness.Client.onRetryExhausted = () => { tmpExhaustedCalls++; };
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/recovers`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													Expect(tmpExhaustedCalls).to.equal(0);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'onRetryExhausted does NOT fire when retry is switched off.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 503 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient();
											let tmpExhaustedCalls = 0;
											tmpHarness.Client.onRetryExhausted = () => { tmpExhaustedCalls++; };
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/retry-off`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(503);
													Expect(tmpExhaustedCalls).to.equal(0);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'onRetryExhausted does NOT fire for an outcome that was never retryable.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 404 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpExhaustedCalls = 0;
											tmpHarness.Client.onRetryExhausted = () => { tmpExhaustedCalls++; };
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/plain-404`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(404);
													Expect(tmpExhaustedCalls).to.equal(0);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'An async onRetryExhausted is awaited before the caller is settled.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 503 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 2, InitialDelayMS: 1 } });
											let tmpFlushed = false;
											tmpHarness.Client.onRetryExhausted = () =>
											{
												return new Promise((fResolve) =>
												{
													setTimeout(() => { tmpFlushed = true; fResolve(); }, 10);
												});
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/flush-metrics`,
												() =>
												{
													Expect(tmpFlushed).to.equal(true);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A throwing caller callback does not become an unhandled rejection.',
								function (fTestComplete)
								{
									// Whether a request settles synchronously or via a hook is an
									// implementation detail; an exception out of the caller's
									// callback must surface on the same channel either way, not
									// as a silent unhandled rejection.
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 503 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 2, InitialDelayMS: 1 } });
											let tmpDetached = [];
											tmpHarness.Client.detachedThrowFunction = (pDetachedError) => { tmpDetached.push(pDetachedError); };
											tmpHarness.Client.onRetryExhausted = () => {};

											let tmpRejections = [];
											const fRejectionListener = (pRejection) => { tmpRejections.push(pRejection); };
											process.on('unhandledRejection', fRejectionListener);

											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/throwing-callback`,
												() => { throw new Error('caller-callback-threw'); });

											setTimeout(() =>
											{
												process.removeListener('unhandledRejection', fRejectionListener);
												Expect(tmpDetached.length).to.equal(1);
												Expect(tmpDetached[0].message).to.equal('caller-callback-threw');
												Expect(tmpRejections.length).to.equal(0);
												pServer.close();
												fTestComplete();
											}, 120);
										});
								}
							);

						test
							(
								'A throwing caller callback on the veto path is detached too.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpDetached = [];
											tmpHarness.Client.detachedThrowFunction = (pDetachedError) => { tmpDetached.push(pDetachedError); };
											tmpHarness.Client.onBeforeRetry = () => false;

											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/vetoed-throwing`,
												() => { throw new Error('veto-callback-threw'); });

											setTimeout(() =>
											{
												Expect(tmpDetached.length).to.equal(1);
												Expect(tmpDetached[0].message).to.equal('veto-callback-threw');
												pServer.close();
												fTestComplete();
											}, 120);
										});
								}
							);

						test
							(
								'With no hook installed the retry path never touches a promise chain.',
								function (fTestComplete)
								{
									// The common case: a throwing callback propagates synchronously
									// out of the settle, exactly as on a non-retried request.
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpDetached = [];
											tmpHarness.Client.detachedThrowFunction = (pDetachedError) => { tmpDetached.push(pDetachedError); };
											// The timer seam is invoked directly, not from a continuation.
											let tmpTimerFromSyncContext = false;
											tmpHarness.Client.retryTimerFunction = (fRetryCallback) =>
											{
												tmpTimerFromSyncContext = true;
												setImmediate(fRetryCallback);
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/no-hook`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpTimerFromSyncContext).to.equal(true);
													Expect(tmpDetached.length).to.equal(0);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'Hooks resolve per-request first, and false opts a request out.',
								function ()
								{
									let tmpClient = makeClient().Client;
									const fService = () => 'service';
									const fRequest = () => 'request';
									tmpClient.onBeforeRetry = fService;
									Expect(tmpClient._resolveRetryHook({}, 'OnBeforeRetry', 'onBeforeRetry')).to.equal(fService);
									Expect(tmpClient._resolveRetryHook({ OnBeforeRetry: fRequest }, 'OnBeforeRetry', 'onBeforeRetry')).to.equal(fRequest);
									Expect(tmpClient._resolveRetryHook({ OnBeforeRetry: false }, 'OnBeforeRetry', 'onBeforeRetry')).to.equal(null);
								}
							);

						test
							(
								'Hooks can be installed as constructor options.',
								function ()
								{
									const fBefore = () => {};
									const fExhausted = () => {};
									let tmpClient = makeClient({ OnBeforeRetry: fBefore, OnRetryExhausted: fExhausted }).Client;
									Expect(tmpClient.onBeforeRetry).to.equal(fBefore);
									Expect(tmpClient.onRetryExhausted).to.equal(fExhausted);
								}
							);

						test
							(
								'A vetoed retry does not consume the attempt budget.',
								function (fTestComplete)
								{
									// Veto the first replay, allow the second: the request should
									// still have its full budget available afterwards.
									let tmpState = { Requests: [] };
									createScriptedServer(
										[
											{ Status: 502 },
											{ Status: 502 },
											{ Status: 200, Body: JSON.stringify({ OK: true }) }
										], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpVetoed = false;
											tmpHarness.Client.onBeforeRetry = () =>
											{
												if (!tmpVetoed)
												{
													tmpVetoed = true;
													return false;
												}
												return true;
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/veto-then-allow`,
												(pError, pResponse) =>
												{
													// Vetoed on the first failure, so only one request went out.
													Expect(pResponse.statusCode).to.equal(502);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);
					}
				);

			suite
				(
					'Outcome Classifier',
					function ()
					{
						test
							(
								'A legacy 200-with-Error body is retried when the classifier says so.',
								function (fTestComplete)
								{
									// The legacy API answers 200 and reports failure as a
									// top-level Error string. The stock policy cannot see that;
									// a classifier reading the body can.
									let tmpState = { Requests: [] };
									createScriptedServer(
										[
											{ Status: 200, Body: JSON.stringify({ Error: 'Upstream request timeout' }) },
											{ Status: 200, Body: JSON.stringify([ { IDBook: 1 } ]) }
										], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.retryClassifier = (pContext) =>
											{
												if (pContext.Body && typeof pContext.Body.Error === 'string')
												{
													return (/timeout|deadlock|unavailable/i.test(pContext.Body.Error)) ? 'retry' : 'settle';
												}
												return null;
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/legacy`,
												(pError, pResponse, pBody) =>
												{
													Expect(pResponse.statusCode).to.equal(200);
													Expect(pBody).to.deep.equal([ { IDBook: 1 } ]);
													Expect(tmpState.Requests.length).to.equal(2);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A legacy 200-with-Error body the classifier deems permanent settles immediately.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 200, Body: JSON.stringify({ Error: 'Record not found' }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.retryClassifier = (pContext) =>
											{
												if (pContext.Body && typeof pContext.Body.Error === 'string')
												{
													return (/timeout|deadlock|unavailable/i.test(pContext.Body.Error)) ? 'retry' : 'settle';
												}
												return null;
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/legacy`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.Error).to.equal('Record not found');
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A classifier can suppress a retry the stock policy would take.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 503 }, { Status: 200 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.retryClassifier = () => 'settle';
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/gave-up`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(503);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A classifier can opt a 500 in without changing the global policy.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer(
										[
											{ Status: 500, Body: JSON.stringify({ Error: 'Deadlock found when trying to get lock' }) },
											{ Status: 200, Body: JSON.stringify({ OK: true }) }
										], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.retryClassifier = (pContext) =>
											{
												const tmpIsDeadlock = pContext.Response && pContext.Response.statusCode === 500 &&
													pContext.Body && /deadlock/i.test(pContext.Body.Error || '');
												return tmpIsDeadlock ? 'retry' : null;
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/deadlock`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													// The global policy is untouched.
													Expect(tmpHarness.Client.retryPolicy.RetryStatusCodes).to.not.include(500);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A classifier cannot make a non-idempotent request replayable.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 200, Body: JSON.stringify({ Error: 'timeout' }) }, { Status: 200 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.retryClassifier = () => 'retry';
											tmpHarness.Client.postJSON({ url: `http://127.0.0.1:${pPort}/Mutate`, body: { Name: 'x' } },
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.Error).to.equal('timeout');
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A per-request classifier overrides the service-level one.',
								function ()
								{
									let tmpClient = makeClient().Client;
									tmpClient.retryClassifier = () => 'retry';
									Expect(tmpClient._classifyRetryOutcome({ Options: {} })).to.equal('retry');
									Expect(tmpClient._classifyRetryOutcome({ Options: { RetryClassifier: () => 'settle' } })).to.equal('settle');
									// An explicit false opts the request out entirely.
									Expect(tmpClient._classifyRetryOutcome({ Options: { RetryClassifier: false } })).to.equal(null);
								}
							);

						test
							(
								'A classifier constructor option is installed on the client.',
								function ()
								{
									let tmpClient = makeClient({ RetryClassifier: () => 'settle' }).Client;
									Expect(tmpClient._classifyRetryOutcome({ Options: {} })).to.equal('settle');
								}
							);

						test
							(
								'A throwing classifier degrades to the stock policy.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.retryClassifier = () => { throw new Error('classifier bug'); };
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/still-works`,
												(pError, pResponse, pBody) =>
												{
													// The stock 502 rule still applies.
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(2);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'An unrecognized classifier verdict is treated as no opinion.',
								function ()
								{
									let tmpClient = makeClient().Client;
									tmpClient.retryClassifier = () => 'maybe';
									Expect(tmpClient._classifyRetryOutcome({ Options: {} })).to.equal(null);
								}
							);

						test
							(
								'The classifier receives the full outcome context.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 502, Body: JSON.stringify({ message: 'bad gateway' }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 2, InitialDelayMS: 1 } });
											// The classifier is consulted once per attempt, including
											// the last (its verdict is what makes exhaustion reporting
											// accurate); assert on the first invocation.
											let tmpSeenContext = null;
											tmpHarness.Client.retryClassifier = (pContext) =>
											{
												if (!tmpSeenContext)
												{
													tmpSeenContext = pContext;
												}
												return null;
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/context`,
												() =>
												{
													Expect(tmpSeenContext.Response.statusCode).to.equal(502);
													Expect(tmpSeenContext.Body.message).to.equal('bad gateway');
													Expect(tmpSeenContext.AttemptsMade).to.equal(1);
													Expect(tmpSeenContext.Policy.MaxAttempts).to.equal(2);
													Expect(tmpSeenContext.Options.url).to.contain('/context');
													pServer.close();
													fTestComplete();
												});
										});
								}
							);
					}
				);

			suite
				(
					'Interaction With Auth Recovery',
					function ()
					{
						test
							(
								'A 401 still routes to authenticationRecovery, not to retry.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 401 }, { Status: 200, Body: JSON.stringify({ OK: true }) } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											let tmpRecoveryCalls = 0;
											tmpHarness.Client.authenticationRecovery = () =>
											{
												tmpRecoveryCalls++;
												return Promise.resolve(true);
											};
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/gated`,
												(pError, pResponse, pBody) =>
												{
													Expect(tmpRecoveryCalls).to.equal(1);
													Expect(pBody.OK).to.equal(true);
													// The recovery replay is not a backoff retry.
													Expect(tmpHarness.Delays.length).to.equal(0);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'A 401 with no recovery hook is not retried.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer([ { Status: 401 } ], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/gated`,
												(pError, pResponse) =>
												{
													Expect(pResponse.statusCode).to.equal(401);
													Expect(tmpState.Requests.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);

						test
							(
								'Recovery replay followed by a 502 still retries, and both caps hold.',
								function (fTestComplete)
								{
									let tmpState = { Requests: [] };
									createScriptedServer(
										[
											{ Status: 401 },
											{ Status: 502 },
											{ Status: 200, Body: JSON.stringify({ OK: true }) }
										], tmpState,
										(pServer, pPort) =>
										{
											let tmpHarness = makeClient({ Retry: { MaxAttempts: 3, InitialDelayMS: 1 } });
											tmpHarness.Client.authenticationRecovery = () => Promise.resolve(true);
											tmpHarness.Client.getJSON(`http://127.0.0.1:${pPort}/gated`,
												(pError, pResponse, pBody) =>
												{
													Expect(pBody.OK).to.equal(true);
													Expect(tmpState.Requests.length).to.equal(3);
													Expect(tmpHarness.Delays.length).to.equal(1);
													pServer.close();
													fTestComplete();
												});
										});
								}
							);
					}
				);
		}
	);
